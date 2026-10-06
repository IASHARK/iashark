"use strict";
// TOUS LES MARCHES DES BOOKMAKERS, CHOIX NEUTRE DU PARI (decision de Clement du 06/10/2026, soir) :
//   « le moteur v3 doit etre neutre et choisir le meilleur marche de tous, sauf les cartons et corners, tout
//     simplement cote a 1,40 minimum, le meilleur sur 187 marches, sur tous les matchs, sans en favoriser un »
//   (fourchette du pari corrigee ensuite : 1,40-2,20, config/leagues.json#fiabilite.fourchette_pari).
//
// Ce module est PUR (aucun appel reseau). Il lit le releve de cotes API-Football d'un match (odds_snapshots,
// raw_odds.bookmakers[].bets[].values[]) et rend, pour chaque issue de chaque marche PUBLIABLE, sa cote et sa
// chance sans marge, calculees PAR LA MEME METHODE pour tous les marches :
//
//  1. BOOKMAKER DE REFERENCE : bet365 ; s'il ne propose pas le marche, le premier qui le propose dans un ordre
//     FIXE (ORDRE_REPLI), jamais Pinnacle (Pinnacle sert de controle : ecart de chance > 8 points = issue ecartee).
//  2. MARGE RETIREE SUR LE MARCHE COMPLET, methode puissance (somme des (1/cote)^k = 1) :
//       - lignes plus/moins (buts, tirs, fautes...) : chaque paire plus/moins de la meme ligne ;
//       - handicaps : chaque ligne (2 issues en asiatique, 3 en europeen) ;
//       - marches a plusieurs issues (resultat, score exact, mi-temps/fin, nombre de buts, combinaisons...) :
//         toutes les issues ensemble ; double chance = somme de deux issues du resultat sans marge ;
//       - marches SANS ISSUE CONTRAIRE (buteurs, joueurs « N ou plus », paires « Home / Away » qui peuvent perdre
//         toutes les deux) ou liste incomplete (somme des 1/cote < 1) : JAMAIS candidats (verdict du mathematicien du
//         06/10 : marge impossible a retirer ; joueurs 70 % annonces, 29 % reels).
//  2 bis. CORRECTION « PETITS SCORES » (verdict du 06/10, point 2) : -3 points sur la chance affichee des issues de
//     petit score (petitScore ci-dessous), appliquee AVANT le choix (config/leagues.json#fiabilite.corrections_chance).
//  3. Un marche n'est publiable que s'il se REGLE avec les donnees d'API-Football (regler ci-dessous) : score
//     final et mi-temps, evenements (buts avec minute, buteur, passeur, penalty, contre son camp), statistiques du
//     match (tirs, tirs cadres, fautes, hors-jeu), statistiques des joueurs (/fixtures/players), prolongation et
//     tirs au but. Sinon il est EXCLU (EXCLUS, avec la raison). Corners et cartons : toujours exclus (decision).
//
// Aucune preference de famille, aucun bonus : le choix (lib/pronostic.js) prend l'issue la plus probable dont la
// cote affichee est dans la fourchette, quelle que soit sa famille.

const ORDRE_REPLI = ["bet365", "betano", "williamhill", "marathonbet", "1xbet", "betfair", "betvictor", "sbo", "unibet", "bwin", "10bet"];
const CONTROLE = "pinnacle";
const ECART_MAX_CONTROLE = 0.08;
// Controle Pinnacle (verdict du mathematicien du 06/10, point 4) : seulement sur les marches ou il est mesure.
const CONTROLE_BETS = [1, 4, 5, 6, 13, 16, 17, 19];
// Issue cachee d'un marche publiable (verdict du 06/10) : « les deux marquent : non » au niveau du match.
const VALEURS_EXCLUES = { 8: ["no"] };
const COTE_MIN_LUE = 1.01;
const CORNERS_CARTONS = /corner|card|yellow|red ?card|rcard|booking/i;

const ok = (x) => typeof x === "number" && isFinite(x);
const cle = (nom) => String(nom == null ? "" : nom).toLowerCase().replace(/[^a-z0-9]/g, "");
function coteLue(x) { const v = Number(String(x == null ? "" : x).replace(",", ".")); return v > 1 && v < 1000 ? v : NaN; }
function fr(x) { return String(Number(x)).replace(".", ","); }

// --------------------------------------------------------------------------- marge
function puissance(cotes) {
  if (!Array.isArray(cotes) || cotes.length < 2 || !cotes.every((o) => ok(o) && o > 1)) return null;
  const inv = cotes.map((o) => 1 / o);
  if (inv.reduce((s, x) => s + x, 0) < 1 - 1e-9) return null; // somme < 1 : marche incomplet (une issue manque)
  const f = (k) => inv.reduce((s, x) => s + Math.pow(x, k), 0) - 1;
  let lo = 0.2, hi = 5;
  if (f(lo) < 0 || f(hi) > 0) return null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  const k = (lo + hi) / 2;
  return { k: k, p: inv.map((x) => Math.pow(x, k)) };
}

// --------------------------------------------------------------------------- lecture
// raw -> { cleBookmaker: { betId: { nom, values: [{ value, odd }] } } }
function lireFlux(raw) {
  const out = {};
  const bks = Array.isArray(raw && raw.bookmakers) ? raw.bookmakers : [];
  bks.forEach(function (b) {
    const k = cle(b && b.name);
    if (!k) return;
    const rec = out[k] || (out[k] = {});
    (b.bets || []).forEach(function (bet) {
      const id = Number(bet && bet.id);
      if (!Number.isInteger(id)) return;
      const values = (bet.values || []).map((v) => ({ value: String(v && v.value != null ? v.value : "").trim(), odd: coteLue(v && v.odd) })).filter((v) => v.value && ok(v.odd));
      rec[id] = { nom: String(bet.name || ""), values: values };
    });
  });
  return out;
}

// --------------------------------------------------------------------------- outils de reglement
function sc(F, per) {
  if (!F) return null;
  if (per === "ft") return F.ft || null;
  if (per === "ht") return F.ht || null;
  if (per === "2h") return F.ft && F.ht ? [F.ft[0] - F.ht[0], F.ft[1] - F.ht[1]] : null;
  return null;
}
function issue1n2(s) { return s[0] > s[1] ? "home" : s[0] === s[1] ? "draw" : "away"; }
const DC = { "home/draw": ["home", "draw"], "draw/away": ["draw", "away"], "home/away": ["home", "away"] };
function ligneDe(v) { const r = /^(over|under)\s+(\d+(?:\.\d+)?)$/i.exec(String(v).trim()); return r ? { sens: r[1].toLowerCase(), l: Number(r[2]) } : null; }
function demi(l) { return ok(l) && Math.abs(l * 2 - Math.round(l * 2)) < 1e-9 && Math.abs(Math.round(l * 2)) % 2 === 1; }
function ouRegle(n, v) { const r = ligneDe(v); if (!r || n == null) return null; return r.sens === "over" ? n > r.l : n < r.l; }
// « Home -1.5 » : ligne exprimee pour le DOMICILE (« Away -1.5 » = l'exterieur avec +1,5 ; verifie sur les releves).
function hcp(v) { const r = /^(home|away|draw)\s*([+-]?\d+(?:\.\d+)?)$/i.exec(String(v).trim()); return r ? { cote: r[1].toLowerCase(), l: Number(r[2]) } : null; }
// Buts reglementaires (90 min + arrets), ordonnes : [{ min, cote: "home"|"away", joueur, passeur, type }].
function butsAvant(F, minMax) { return F && Array.isArray(F.buts) ? F.buts.filter((b) => b.ordre <= minMax) : null; }
function scoreA(F, minute) { const b = butsAvant(F, minute); if (!b) return null; return [b.filter((x) => x.cote === "home").length, b.filter((x) => x.cote === "away").length]; }
function stat(F, nom) { return F && F.stats && Array.isArray(F.stats[nom]) ? F.stats[nom] : null; }
function oui(v) { return /^yes$/i.test(v) ? true : /^no$/i.test(v) ? false : null; }

// --------------------------------------------------------------------------- libelles
function equipe(c, dom, ext) { return c === "home" ? dom : c === "away" ? ext : null; }
const NOM_STAT = { tirs: ["tir", "tirs"], tirs_cadres: ["tir cadré", "tirs cadrés"], fautes: ["faute", "fautes"], hors_jeu: ["hors-jeu", "hors-jeu"], buts: ["but", "buts"] };
function motStat(s, l) { const m = NOM_STAT[s] || ["", ""]; return Number(l) < 2 ? m[0] : m[1]; }
function libLigne(v, quoi, suf, qui) {
  const r = ligneDe(v);
  if (!r) return v;
  const t = (r.sens === "over" ? "plus de " : "moins de ") + fr(r.l) + " " + motStat(quoi, r.l);
  return (qui ? qui + " : " + t : t.charAt(0).toUpperCase() + t.slice(1)) + (suf || "");
}
function lib1n2(v, dom, ext, suf) { const x = String(v).toLowerCase(); return (x === "draw" ? "Match nul" : x === "home" ? dom + " gagne" : x === "away" ? ext + " gagne" : v) + (suf || ""); }
function libDc(v, dom, ext, suf) { return ({ "home/draw": dom + " ou match nul", "draw/away": "Match nul ou " + ext, "home/away": dom + " ou " + ext })[String(v).toLowerCase()] + (suf || ""); }
function libHcp(v, dom, ext, suf) {
  const h = hcp(v);
  if (!h) return v;
  const s = (x) => (x > 0 ? "+" : x < 0 ? "−" : "") + fr(Math.abs(x));
  if (h.cote === "home") return dom + " (" + s(h.l) + ")" + (suf || "");
  if (h.cote === "away") return ext + " (" + s(-h.l) + ")" + (suf || "");
  return "Égalité avec handicap " + dom + " " + s(h.l) + (suf || "");
}

// --------------------------------------------------------------------------- marches
// g : regroupement (« issues », « dc », « ligne », « ah », « eu », « par_ligne » (resultat/total...), « incomplet »,
//     « joueur », « joueur_ligne ») ; fam : famille ; besoin : faits necessaires (score, evenements, stats, joueurs,
//     statut) ; couverture : couverture API-Football exigee pour la competition ; regle(value, F, sel) ; lib(...).
const S = {};
function spec(ids, d) { [].concat(ids).forEach((id) => { S[id] = Object.assign({ besoin: "score", couverture: null }, d); }); }
const MT = { ft: "", ht: " (1re mi-temps)", "2h": " (2e mi-temps)" };

spec(1, { g: "issues", fam: "Résultat", regle: (v, F) => { const s = sc(F, "ft"); return s ? issue1n2(s) === v.toLowerCase() : null; }, lib: (v, d, e) => lib1n2(v, d, e) });
spec(13, { g: "issues", fam: "Mi-temps", regle: (v, F) => { const s = sc(F, "ht"); return s ? issue1n2(s) === v.toLowerCase() : null; }, lib: (v, d, e) => lib1n2(v, d, e, MT.ht) });
spec(3, { g: "issues", fam: "Mi-temps", regle: (v, F) => { const s = sc(F, "2h"); return s ? issue1n2(s) === v.toLowerCase() : null; }, lib: (v, d, e) => lib1n2(v, d, e, MT["2h"]) });
[[12, 1, "ft", "Double chance"], [20, 13, "ht", "Mi-temps"], [33, 3, "2h", "Mi-temps"]].forEach(([id, base, per, fam]) =>
  spec(id, { g: "dc", base: base, fam: fam, regle: (v, F) => { const s = sc(F, per); const ij = DC[v.toLowerCase()]; return s && ij ? ij.indexOf(issue1n2(s)) !== -1 : null; }, lib: (v, d, e) => libDc(v, d, e, MT[per]) }));
// Lignes plus / moins sur le score (demi-lignes seulement : jamais de remboursement).
[[5, "ft", null, "Buts"], [6, "ht", null, "Mi-temps"], [26, "2h", null, "Mi-temps"], [50, "ft", null, "Buts"], [72, "ht", null, "Mi-temps"],
  [16, "ft", 0, "Buts d'une équipe"], [17, "ft", 1, "Buts d'une équipe"], [105, "ht", 0, "Buts d'une équipe"], [106, "ht", 1, "Buts d'une équipe"],
  [107, "2h", 0, "Buts d'une équipe"], [108, "2h", 1, "Buts d'une équipe"]].forEach(([id, per, i, fam]) =>
  spec(id, { g: "ligne", fam: fam, regle: (v, F) => { const s = sc(F, per); return s ? ouRegle(i == null ? s[0] + s[1] : s[i], v) : null; },
    lib: (v, d, e) => libLigne(v, "buts", MT[per], i == null ? null : i === 0 ? d : e) }));
// Handicaps asiatiques (demi-lignes seulement) et europeens (3 issues).
[[4, "ft"], [19, "ht"], [104, "2h"]].forEach(([id, per]) => spec(id, { g: "ah", fam: "Handicap asiatique",
  regle: (v, F) => { const s = sc(F, per), h = hcp(v); if (!s || !h) return null; const x = s[0] + h.l - s[1]; return h.cote === "home" ? x > 0 : x < 0; }, lib: (v, d, e) => libHcp(v, d, e, MT[per]) }));
[[9, "ft"], [18, "ht"], [181, "2h"]].forEach(([id, per]) => spec(id, { g: "eu", fam: "Handicap européen",
  regle: (v, F) => { const s = sc(F, per), h = hcp(v); if (!s || !h) return null; const x = s[0] + h.l - s[1]; return h.cote === "home" ? x > 0 : h.cote === "away" ? x < 0 : x === 0; }, lib: (v, d, e) => libHcp(v, d, e, " (handicap à 3 issues)" + MT[per]) }));
// Mi-temps / fin, mi-temps la plus prolifique.
spec(7, { g: "issues", fam: "Mi-temps/fin", regle: (v, F) => { const a = sc(F, "ht"), b = sc(F, "ft"); const r = /^(home|draw|away)\/(home|draw|away)$/i.exec(v); return a && b && r ? issue1n2(a) === r[1].toLowerCase() && issue1n2(b) === r[2].toLowerCase() : null; },
  lib: (v, d, e) => { const r = /^(home|draw|away)\/(home|draw|away)$/i.exec(v); const n = (x) => ({ home: d, draw: "égalité", away: e })[x.toLowerCase()]; return r ? "Mi-temps : " + n(r[1]) + " / fin : " + n(r[2]) : v; } });
function prolifique(F, i) { const a = sc(F, "ht"), b = sc(F, "2h"); if (!a || !b) return null; const x = i == null ? a[0] + a[1] : a[i], y = i == null ? b[0] + b[1] : b[i]; return x > y ? "1st half" : x < y ? "2nd half" : "draw"; }
[[11, null], [192, 0], [193, 1]].forEach(([id, i]) => spec(id, { g: "issues", fam: "Mi-temps", regle: (v, F) => { const p = prolifique(F, i); return p ? p === v.toLowerCase() : null; },
  lib: (v, d, e) => (i == null ? "" : (i === 0 ? d : e) + " : ") + ({ "1st half": "plus de buts en 1re mi-temps", "2nd half": "plus de buts en 2e mi-temps", draw: "autant de buts dans chaque mi-temps" })[v.toLowerCase()] }));
// Les deux marquent (match, mi-temps), scores exacts, nombre de buts.
[[8, "ft"], [34, "ht"], [35, "2h"]].forEach(([id, per]) => spec(id, { g: "issues", fam: "Les deux marquent", regle: (v, F) => { const s = sc(F, per), o = oui(v); return s && o !== null ? (s[0] > 0 && s[1] > 0) === o : null; },
  lib: (v) => (oui(v) ? "Les deux équipes marquent" : "Au moins une équipe ne marque pas") + MT[per] }));
[[10, "ft"], [31, "ht"], [62, "2h"]].forEach(([id, per]) => spec(id, { g: "issues", fam: "Score exact", regle: (v, F) => { const s = sc(F, per), r = /^(\d+):(\d+)$/.exec(v); return s && r ? s[0] === Number(r[1]) && s[1] === Number(r[2]) : null; },
  lib: (v) => "Score exact " + String(v).replace(":", "-") + MT[per] }));
function nombreRegle(n, v) { const r = /^(more\s+)?(\d+)$/i.exec(String(v).trim()); return r && n != null ? (r[1] ? n >= Number(r[2]) : n === Number(r[2])) : null; }
function nombreLib(v, quoi) { const r = /^(more\s+)?(\d+)$/i.exec(String(v).trim()); return r ? (r[1] ? r[2] + " buts ou plus" : r[2] + (Number(r[2]) < 2 ? " but" : " buts")) + quoi : v; }
[[38, "ft", null], [46, "ht", null], [42, "2h", null], [40, "ft", 0], [41, "ft", 1]].forEach(([id, per, i]) => spec(id, { g: "issues", fam: "Nombre de buts",
  regle: (v, F) => { const s = sc(F, per); return s ? nombreRegle(i == null ? s[0] + s[1] : s[i], v) : null; },
  lib: (v, d, e) => (i == null ? "Exactement " : (i === 0 ? d : e) + " : exactement ") + nombreLib(v, MT[per]) }));
spec(349, { g: "issues", fam: "Nombre de buts", regle: (v, F) => { const s = sc(F, "ft"); if (!s) return null; const n = s[0] + s[1]; const x = v.toLowerCase(); return x === "under 2 goals" ? n < 2 : x === "2 or 3 goals" ? n === 2 || n === 3 : x === "over 3 goals" ? n > 3 : null; },
  lib: (v) => ({ "under 2 goals": "Moins de 2 buts", "2 or 3 goals": "2 ou 3 buts", "over 3 goals": "Plus de 3 buts" })[v.toLowerCase()] || v });
// Pair / impair.
[[21, "ft", null], [22, "ht", null], [63, "2h", null], [23, "ft", 0], [60, "ft", 1]].forEach(([id, per, i]) => spec(id, { g: "issues", fam: "Pair/impair",
  regle: (v, F) => { const s = sc(F, per); if (!s) return null; const n = i == null ? s[0] + s[1] : s[i]; return /^odd$/i.test(v) ? n % 2 === 1 : /^even$/i.test(v) ? n % 2 === 0 : null; },
  lib: (v, d, e) => (i == null ? "" : (i === 0 ? d : e) + " : ") + (/^odd$/i.test(v) ? "nombre de buts impair" : "nombre de buts pair") + MT[per] }));
// Combinaisons du meme match (cote du bookmaker pour la combinaison, jamais un produit de chances).
spec(24, { g: "issues", fam: "Résultat et buts", regle: (v, F) => { const s = sc(F, "ft"), r = /^(home|draw|away)\/(yes|no)$/i.exec(v); return s && r ? issue1n2(s) === r[1].toLowerCase() && (s[0] > 0 && s[1] > 0) === (r[2].toLowerCase() === "yes") : null; },
  lib: (v, d, e) => { const r = /^(home|draw|away)\/(yes|no)$/i.exec(v); return r ? lib1n2(r[1], d, e) + " et " + (r[2].toLowerCase() === "yes" ? "les deux équipes marquent" : "au moins une équipe ne marque pas") : v; } });
[[25, "ft"], [78, "ht"]].forEach(([id, per]) => spec(id, { g: "par_ligne", motif: /^(home|draw|away)\/(over|under)\s+(\d+(?:\.\d+)?)$/i, fam: "Résultat et buts",
  regle: (v, F) => { const s = sc(F, per), r = /^(home|draw|away)\/(over|under)\s+(\d+(?:\.\d+)?)$/i.exec(v); if (!s || !r) return null; const n = s[0] + s[1], l = Number(r[3]); return issue1n2(s) === r[1].toLowerCase() && (r[2].toLowerCase() === "over" ? n > l : n < l); },
  lib: (v, d, e) => { const r = /^(home|draw|away)\/(over|under)\s+(\d+(?:\.\d+)?)$/i.exec(v); return r ? lib1n2(r[1], d, e) + " et " + (r[2].toLowerCase() === "over" ? "plus" : "moins") + " de " + fr(r[3]) + " buts" + MT[per] : v; } }));
spec(49, { g: "par_ligne", motif: /^([ou])\/(yes|no)\s+(\d+(?:\.\d+)?)$/i, fam: "Résultat et buts",
  regle: (v, F) => { const s = sc(F, "ft"), r = /^([ou])\/(yes|no)\s+(\d+(?:\.\d+)?)$/i.exec(v); if (!s || !r) return null; const n = s[0] + s[1], l = Number(r[3]); return (r[1].toLowerCase() === "o" ? n > l : n < l) && (s[0] > 0 && s[1] > 0) === (r[2].toLowerCase() === "yes"); },
  lib: (v) => { const r = /^([ou])\/(yes|no)\s+(\d+(?:\.\d+)?)$/i.exec(v); return r ? (r[1].toLowerCase() === "o" ? "Plus" : "Moins") + " de " + fr(r[3]) + " buts et " + (r[2].toLowerCase() === "yes" ? "les deux équipes marquent" : "au moins une équipe ne marque pas") : v; } });
// Oui / non sur le score.
const OUI_NON_SCORE = {
  27: ["Buts d'une équipe", (F) => sc(F, "ft") && sc(F, "ft")[1] === 0, (d) => d + " n'encaisse aucun but"],
  28: ["Buts d'une équipe", (F) => sc(F, "ft") && sc(F, "ft")[0] === 0, (d, e) => e + " n'encaisse aucun but"],
  29: ["Résultat et buts", (F) => { const s = sc(F, "ft"); return s && s[0] > s[1] && s[1] === 0; }, (d) => d + " gagne sans encaisser"],
  30: ["Résultat et buts", (F) => { const s = sc(F, "ft"); return s && s[1] > s[0] && s[0] === 0; }, (d, e) => e + " gagne sans encaisser"],
  37: ["Mi-temps", (F) => { const a = sc(F, "ht"), b = sc(F, "2h"); return a && b && a[0] > a[1] && b[0] > b[1]; }, (d) => d + " gagne les deux mi-temps"],
  53: ["Mi-temps", (F) => { const a = sc(F, "ht"), b = sc(F, "2h"); return a && b && a[1] > a[0] && b[1] > b[0]; }, (d, e) => e + " gagne les deux mi-temps"],
  43: ["Buts d'une équipe", (F) => sc(F, "ft") && sc(F, "ft")[0] > 0, (d) => d + " marque"],
  44: ["Buts d'une équipe", (F) => sc(F, "ft") && sc(F, "ft")[1] > 0, (d, e) => e + " marque"],
  114: ["Buts d'une équipe", (F) => sc(F, "ht") && sc(F, "ht")[0] > 0, (d) => d + " marque en 1re mi-temps"],
  115: ["Buts d'une équipe", (F) => sc(F, "2h") && sc(F, "2h")[0] > 0, (d) => d + " marque en 2e mi-temps"],
  116: ["Buts d'une équipe", (F) => sc(F, "ht") && sc(F, "ht")[1] > 0, (d, e) => e + " marque en 1re mi-temps"],
  117: ["Buts d'une équipe", (F) => sc(F, "2h") && sc(F, "2h")[1] > 0, (d, e) => e + " marque en 2e mi-temps"],
  110: ["Résultat et buts", (F) => { const s = sc(F, "ft"); return s && s[0] === s[1] && s[0] > 0; }, () => "Match nul avec buts"],
  111: ["Buts d'une équipe", (F) => { const a = sc(F, "ht"), b = sc(F, "2h"); return a && b && a[0] > 0 && b[0] > 0; }, (d) => d + " marque dans les deux mi-temps"],
  112: ["Buts d'une équipe", (F) => { const a = sc(F, "ht"), b = sc(F, "2h"); return a && b && a[1] > 0 && b[1] > 0; }, (d, e) => e + " marque dans les deux mi-temps"],
  113: ["Les deux marquent", (F) => { const a = sc(F, "ht"), b = sc(F, "2h"); return a && b && a[0] > 0 && a[1] > 0 && b[0] > 0 && b[1] > 0; }, () => "Les deux équipes marquent dans chaque mi-temps"],
  184: ["Mi-temps", (F) => { const a = sc(F, "ht"), b = sc(F, "2h"); return a && b && a[0] + a[1] > 0 && b[0] + b[1] > 0; }, () => "Au moins un but dans chaque mi-temps"],
};
Object.keys(OUI_NON_SCORE).forEach((id) => { const [fam, f, l] = OUI_NON_SCORE[id];
  spec(Number(id), { g: "issues", fam: fam, regle: (v, F) => { const o = oui(v), r = f(F); return o === null || r === null || r === undefined ? null : !!r === o; }, lib: (v, d, e) => (oui(v) ? "" : "Non : ") + l(d, e) }); });
// Marches incomplets (« Home » / « Away » : les deux peuvent perdre) : marge par l'exposant du 1N2.
[[32, "Mi-temps", (F, i) => { const a = sc(F, "ht"), b = sc(F, "2h"); return a && b ? (i === 0 ? a[0] > a[1] && b[0] > b[1] : a[1] > a[0] && b[1] > b[0]) : null; }, " gagne les deux mi-temps"],
  [36, "Résultat et buts", (F, i) => { const s = sc(F, "ft"); return s ? (i === 0 ? s[0] > s[1] && s[1] === 0 : s[1] > s[0] && s[0] === 0) : null; }, " gagne sans encaisser"],
  [39, "Mi-temps", (F, i) => { const a = sc(F, "ht"), b = sc(F, "2h"); return a && b ? (i === 0 ? a[0] > a[1] || b[0] > b[1] : a[1] > a[0] || b[1] > b[0]) : null; }, " gagne au moins une mi-temps"],
  [48, "Buts d'une équipe", (F, i) => { const a = sc(F, "ht"), b = sc(F, "2h"); return a && b ? a[i] > 0 && b[i] > 0 : null; }, " marque dans les deux mi-temps"]].forEach(([id, fam, f, l]) =>
  spec(id, { g: "incomplet", fam: fam, regle: (v, F) => { const i = /^home$/i.test(v) ? 0 : /^away$/i.test(v) ? 1 : -1; return i < 0 ? null : f(F, i); }, lib: (v, d, e) => (/^home$/i.test(v) ? d : e) + l }));

// --- Ordre des buts et minutes (evenements d'API-Football) ---
function premier(F, minMax) { const b = butsAvant(F, minMax); return b ? (b.length ? b[0].cote : "no goal") : null; }
function dernier(F) { const b = butsAvant(F, 90.99); return b ? (b.length ? b[b.length - 1].cote : "no goal") : null; }
spec(14, { g: "issues", fam: "Ordre des buts", besoin: "evenements", couverture: "events", regle: (v, F) => { const p = premier(F, 90.99); return p ? p === v.toLowerCase() : null; },
  lib: (v, d, e) => (/^no goal$/i.test(v) ? "Aucun but" : (/^home$/i.test(v) ? d : e) + " marque le premier but") });
spec(15, { g: "issues", fam: "Ordre des buts", besoin: "evenements", couverture: "events", regle: (v, F) => { const p = dernier(F); return p ? p === v.toLowerCase() : null; },
  lib: (v, d, e) => (/^no goal$/i.test(v) ? "Aucun but" : (/^home$/i.test(v) ? d : e) + " marque le dernier but") });
spec(185, { g: "issues", fam: "Ordre des buts", besoin: "evenements", couverture: "events", regle: (v, F) => { const p = premier(F, 45.99); return p ? p === v.toLowerCase() : null; },
  lib: (v, d, e) => (/^no goal$/i.test(v) ? "Aucun but en 1re mi-temps" : (/^home$/i.test(v) ? d : e) + " marque le premier but de la 1re mi-temps") });
[[54, 10], [136, 15], [139, 30], [137, 60], [138, 75]].forEach(([id, n]) => spec(id, { g: "issues", fam: "Minutes", besoin: "evenements", couverture: "events",
  regle: (v, F) => { const s = scoreA(F, n + 0.001); return s ? issue1n2(s) === v.toLowerCase() : null; }, lib: (v, d, e) => lib1n2(v, d, e, " après " + n + " minutes") }));
[[144, 1, 15], [145, 16, 30], [146, 31, 45.99], [147, 46, 60], [148, 61, 75], [149, 76, 90.99]].forEach(([id, a, b]) => spec(id, { g: "issues", fam: "Minutes", besoin: "evenements", couverture: "events",
  regle: (v, F) => { const x = butsAvant(F, 90.99), o = oui(v); return x && o !== null ? x.some((g) => g.ordre >= a && g.ordre <= b) === o : null; },
  lib: (v) => (oui(v) ? "But" : "Aucun but") + " entre la " + a + "e et la " + Math.floor(b) + "e minute" }));
[[197, 16, 30], [198, 31, 45.99]].forEach(([id, a, b]) => spec(id, { g: "ligne", fam: "Minutes", besoin: "evenements", couverture: "events",
  regle: (v, F) => { const x = butsAvant(F, 90.99); return x ? ouRegle(x.filter((g) => g.ordre >= a && g.ordre <= b).length, v) : null; },
  lib: (v) => libLigne(v, "buts", " entre la " + a + "e et la " + Math.floor(b) + "e minute") }));
spec(59, { g: "issues", fam: "Ordre des buts", besoin: "evenements", couverture: "events", regle: (v, F) => { const x = butsAvant(F, 90.99), o = oui(v); return x && o !== null ? x.some((g) => g.type === "csc") === o : null; },
  lib: (v) => (oui(v) ? "But contre son camp dans le match" : "Aucun but contre son camp") });
function revient(F, i) { const x = butsAvant(F, 90.99), s = sc(F, "ft"); if (!x || !s) return null; let h = 0, a = 0, mene = false; x.forEach((g) => { if (g.cote === "home") h++; else a++; if (i === 0 ? a > h : h > a) mene = true; }); return mene && (i === 0 ? s[0] > s[1] : s[1] > s[0]); }
[[124, 0], [129, 1]].forEach(([id, i]) => spec(id, { g: "issues", fam: "Ordre des buts", besoin: "evenements", couverture: "events", regle: (v, F) => { const r = revient(F, i), o = oui(v); return r === null || o === null ? null : r === o; },
  lib: (v, d, e) => (oui(v) ? "" : "Non : ") + (i === 0 ? d : e) + " gagne après avoir été mené" }));
spec(222, { g: "incomplet", fam: "Ordre des buts", besoin: "evenements", couverture: "events", regle: (v, F) => { const i = /^home$/i.test(v) ? 0 : /^away$/i.test(v) ? 1 : -1; return i < 0 ? null : revient(F, i); },
  lib: (v, d, e) => (/^home$/i.test(v) ? d : e) + " gagne après avoir été mené" });
[[99, "penalty", " marque un penalty"], [100, "penalty_manque", " manque un penalty"]].forEach(([id, t, l]) => spec(id, { g: "incomplet", fam: "Ordre des buts", besoin: "evenements", couverture: "events",
  regle: (v, F) => { const c = /^home$/i.test(v) ? "home" : /^away$/i.test(v) ? "away" : null; if (!c || !F || !Array.isArray(F.penaltys)) return null; return F.penaltys.some((p) => p.cote === c && p.type === t); },
  lib: (v, d, e) => (/^home$/i.test(v) ? d : e) + l }));

// --- Statistiques du match ---
[[87, "tirs_cadres", null, "Tirs"], [211, "tirs", null, "Tirs"], [173, "fautes", null, "Fautes"], [171, "fautes", 0, "Fautes"], [170, "fautes", 1, "Fautes"],
  [164, "hors_jeu", null, "Hors-jeu"], [167, "hors_jeu", 0, "Hors-jeu"], [168, "hors_jeu", 1, "Hors-jeu"]].forEach(([id, s, i, fam]) => spec(id, { g: "ligne", fam: fam, besoin: "stats", couverture: "statistics_fixtures",
  regle: (v, F) => { const x = stat(F, s); return x ? ouRegle(i == null ? x[0] + x[1] : x[i], v) : null; }, lib: (v, d, e) => libLigne(v, s, "", i == null ? null : i === 0 ? d : e) + (i == null ? " dans le match" : "") }));
[[176, "tirs_cadres", "Tirs"], [340, "tirs", "Tirs"], [175, "fautes", "Fautes"], [165, "hors_jeu", "Hors-jeu"]].forEach(([id, s, fam]) => spec(id, { g: "issues", fam: fam, besoin: "stats", couverture: "statistics_fixtures",
  regle: (v, F) => { const x = stat(F, s); return x ? issue1n2(x) === v.toLowerCase() : null; },
  lib: (v, d, e) => ({ home: "Plus de " + motStat(s, 2) + " pour " + d, draw: "Autant de " + motStat(s, 2) + " pour les deux équipes", away: "Plus de " + motStat(s, 2) + " pour " + e })[v.toLowerCase()] || v }));
[[172, "fautes", "Fautes"], [169, "hors_jeu", "Hors-jeu"]].forEach(([id, s, fam]) => spec(id, { g: "dc", base: id === 172 ? 175 : 165, fam: fam, besoin: "stats", couverture: "statistics_fixtures",
  regle: (v, F) => { const x = stat(F, s), ij = DC[v.toLowerCase()]; return x && ij ? ij.indexOf(issue1n2(x)) !== -1 : null; },
  lib: (v, d, e) => ({ "home/draw": d + " ou égalité", "draw/away": "Égalité ou " + e, "home/away": d + " ou " + e })[v.toLowerCase()] + " (" + motStat(s, 2) + ")" }));
[[177, "tirs_cadres"], [174, "fautes"], [166, "hors_jeu"]].forEach(([id, s]) => spec(id, { g: "ah", fam: s === "tirs_cadres" ? "Tirs" : s === "fautes" ? "Fautes" : "Hors-jeu", besoin: "stats", couverture: "statistics_fixtures",
  regle: (v, F) => { const x = stat(F, s), h = hcp(v); if (!x || !h) return null; const y = x[0] + h.l - x[1]; return h.cote === "home" ? y > 0 : y < 0; }, lib: (v, d, e) => libHcp(v, d, e, " (" + motStat(s, 2) + ")") }));
spec(343, { g: "issues", fam: "Fautes", besoin: "stats", couverture: "statistics_fixtures", regle: (v, F) => { const x = stat(F, "fautes"); if (!x) return null; const n = x[0] + x[1]; return /^odd$/i.test(v) ? n % 2 === 1 : /^even$/i.test(v) ? n % 2 === 0 : null; },
  lib: (v) => (/^odd$/i.test(v) ? "Nombre de fautes impair" : "Nombre de fautes pair") });

// --- Prolongation et tirs au but ---
spec(225, { g: "issues", fam: "Prolongation", besoin: "statut", regle: (v, F) => { const o = oui(v); return o === null || !F || !F.statut ? null : (F.statut === "AET" || F.statut === "PEN") === o; }, lib: (v) => (oui(v) ? "Le match va en prolongation" : "Pas de prolongation") });
spec(224, { g: "issues", fam: "Prolongation", besoin: "statut", regle: (v, F) => { const o = oui(v); return o === null || !F || !F.statut ? null : (F.statut === "PEN") === o; }, lib: (v) => (oui(v) ? "Le match se décide aux tirs au but" : "Pas de tirs au but") });
spec(298, { g: "issues", fam: "Prolongation", besoin: "statut", regle: (v, F) => {
  const r = /^([12])\/(90 mins|extra time|penalties)$/i.exec(v); if (!r || !F || !F.statut || !F.vainqueur) return null;
  const quand = F.statut === "PEN" ? "penalties" : F.statut === "AET" ? "extra time" : "90 mins";
  return F.vainqueur === (r[1] === "1" ? "home" : "away") && quand === r[2].toLowerCase(); },
  lib: (v, d, e) => { const r = /^([12])\/(90 mins|extra time|penalties)$/i.exec(v); return r ? (r[1] === "1" ? d : e) + " gagne " + ({ "90 mins": "dans le temps réglementaire", "extra time": "en prolongation", penalties: "aux tirs au but" })[r[2].toLowerCase()] : v; } });

// --- Joueurs (identite : le nom du bookmaker doit designer UN SEUL joueur de l'effectif du match) ---
// cote : « home », « away » ou null (les deux effectifs). stat : donnee de /fixtures/players, ou « but » / « but_passe ».
[[92, null, "but"], [231, "home", "but"], [218, "away", "but"], [257, null, "but_passe"]].forEach(([id, c, t]) => spec(id, { g: "joueur", cote: c, fam: "Buteurs", besoin: "joueurs", couverture: "events",
  regle: (v, F, sel) => reglerJoueur(F, sel, t, 1), lib: (v) => v + (t === "but" ? " marque (à n'importe quel moment)" : " marque ou fait une passe décisive") }));
[[240, "home", "tirs"], [241, "away", "tirs"], [269, "home", "tirs_cadres"], [266, null, "fautes"], [267, null, "arrets"]].forEach(([id, c, t]) => spec(id, { g: "joueur_ligne", cote: c, fam: "Joueurs", besoin: "joueurs", couverture: "statistics_players",
  regle: (v, F, sel) => reglerJoueur(F, sel, t, sel && sel.seuil), lib: (v, d, e, sel) => (sel && sel.nom ? sel.nom : v) + " : " + (sel && sel.seuil) + " " + ({ tirs: "tir(s)", tirs_cadres: "tir(s) cadré(s)", fautes: "faute(s) commise(s)", arrets: "arrêt(s)" })[t] + " ou plus" }));
function reglerJoueur(F, sel, t, seuil) {
  if (!F || !sel || sel.joueur_id == null || !F.joueurs) return null;
  const j = F.joueurs[String(sel.joueur_id)];
  if (!j || !(j.minutes > 0)) return "rembourse"; // n'a pas joue : rembourse (regle des bookmakers)
  if (t === "but" || t === "but_passe") {
    if (!Array.isArray(F.buts)) return null;
    const marque = F.buts.some((g) => g.type !== "csc" && String(g.joueur) === String(sel.joueur_id));
    const passe = t === "but_passe" && F.buts.some((g) => g.type !== "csc" && String(g.passeur) === String(sel.joueur_id));
    return marque || passe;
  }
  const n = j[t];
  return ok(n) && ok(Number(seuil)) ? n >= Number(seuil) : null;
}

// Marches EXCLUS (jamais publies), hors corners et cartons. Raison en clair.
// VERDICT DU MATHEMATICIEN (06/10/2026, ORANGE sur 399 matchs jamais vus, 02/09-05/10) : marches a cacher.
const VERDICT_JOUEURS = "marché joueur : pas d'issue contraire, marge impossible à retirer (mesure : 70 % annoncés, 29 % réels) — verdict du mathématicien du 06/10";
const VERDICT_PAIRES = "deux issues non contraires (les deux peuvent perdre) : marge impossible à retirer — verdict du mathématicien du 06/10";
const VERDICT_STATS = "statistique du match : chance trop haute sur « moins de » (−8,4 points ; tirs cadrés 56 % annoncés, 25 % réels) et règlement API-Football différent de celui du bookmaker — verdict du mathématicien du 06/10";
const VERDICT_STATS_EXT = "statistique du match (fautes, hors-jeu) : même règlement API-Football que les tirs, jamais mesuré — exclu par prudence avec les tirs (06/10)";
const VERDICT_NON_MESURE = "non réglable proprement ou non mesuré — verdict du mathématicien du 06/10";
const VERDICT_EXACT = "nombre exact de buts ou score : mesuré sur moins de 50 paris — verdict du mathématicien du 06/10";
const EXCLUS = {
  2: "remboursé si nul (chance affichée ambiguë, remboursement)", 109: "remboursé si nul", 182: "remboursé si nul",
  92: VERDICT_JOUEURS, 218: VERDICT_JOUEURS, 231: VERDICT_JOUEURS, 240: VERDICT_JOUEURS, 241: VERDICT_JOUEURS, 257: VERDICT_JOUEURS, 266: VERDICT_JOUEURS, 267: VERDICT_JOUEURS, 269: VERDICT_JOUEURS,
  32: VERDICT_PAIRES, 36: VERDICT_PAIRES, 39: VERDICT_PAIRES, 48: VERDICT_PAIRES, 99: VERDICT_PAIRES, 100: VERDICT_PAIRES, 222: VERDICT_PAIRES,
  87: VERDICT_STATS, 211: VERDICT_STATS, 176: VERDICT_STATS, 340: VERDICT_STATS, 164: VERDICT_STATS, 167: VERDICT_STATS, 168: VERDICT_STATS,
  165: VERDICT_STATS_EXT, 166: VERDICT_STATS_EXT, 169: VERDICT_STATS_EXT, 170: VERDICT_STATS_EXT, 171: VERDICT_STATS_EXT, 172: VERDICT_STATS_EXT, 173: VERDICT_STATS_EXT, 174: VERDICT_STATS_EXT, 175: VERDICT_STATS_EXT, 177: VERDICT_STATS_EXT, 343: VERDICT_STATS_EXT,
  59: VERDICT_NON_MESURE, 224: VERDICT_NON_MESURE, 225: VERDICT_NON_MESURE, 298: VERDICT_NON_MESURE, 10: VERDICT_NON_MESURE, 31: VERDICT_NON_MESURE,
  38: VERDICT_EXACT, 42: VERDICT_EXACT, 46: VERDICT_EXACT, 62: VERDICT_EXACT,
  47: "écart de victoire : libellés ambigus (« Draw » et « Score Draw »)",
  61: "qualification : dépend du match aller (score cumulé non fourni)",
  93: "premier buteur : règle des buts contre son camp différente selon les bookmakers", 94: "dernier buteur : idem",
  219: "premier buteur : idem", 226: "dernier buteur : idem", 232: "premier buteur : idem", 233: "dernier buteur : idem",
  97: "façon de marquer le premier but (tête, coup franc, tir) : absente des événements", 228: "but de la tête : absent des événements",
  245: "but de la tête : absent des événements", 229: "but hors de la surface : absent des événements",
  212: "passes décisives d'un joueur : marché sans nom de joueur", 213: "« Player Triples » : marché non documenté", 215: "« Player Singles » : marché non documenté (doublon des tirs ?)",
  275: "libellé incohérent avec les cotes relevées", 276: "libellé incohérent avec les cotes relevées",
  281: "tacles : non fournis dans les statistiques d'équipe",
};
function raisonExclusion(betId, nom) {
  if (CORNERS_CARTONS.test(String(nom || ""))) return "corners et cartons (décision de Clément)";
  if (EXCLUS[betId]) return EXCLUS[betId];
  if (!S[betId]) return "marché inconnu ou sans règlement automatique";
  return null;
}

// --------------------------------------------------------------------------- identite des joueurs
function norm(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim(); }
// « Diego Sanchez » contre « D. Sanchez » / « Diego Sanchez » / « Paulinho » : meme nom de famille ET (meme
// initiale ou prenom absent) ; ou nom complet identique.
function memeJoueur(bookmaker, effectif) {
  const a = norm(bookmaker), b = norm(effectif);
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = a.split(" "), tb = b.split(" ");
  const ini = /^([A-Za-zÀ-ÿ])\.\s*(.+)$/.exec(String(effectif || "").trim());
  if (ini) { const nom = norm(ini[2]); return ta.length > 1 && a.endsWith(" " + nom) && ta[0].charAt(0) === norm(ini[1]); }
  if (tb.length === 1) return ta[ta.length - 1] === tb[0];
  return ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1];
}
function effectifs(m) {
  const out = { home: [], away: [] };
  const add = (c, id, nom) => { if (id != null && nom && !out[c].some((x) => String(x.id) === String(id))) out[c].push({ id: Number(id), nom: String(nom) }); };
  const sq = m && m.current_squads;
  ["home", "away"].forEach((c) => {
    (sq && Array.isArray(sq[c]) ? sq[c] : []).forEach((p) => add(c, p.player_id != null ? p.player_id : p.id, p.name));
    const l = m && m.lineups && m.lineups[c];
    (l ? [].concat(l.startXI || [], l.substitutes || []) : []).forEach((p) => add(c, p.id != null ? p.id : p.player_id, p.name));
  });
  return out;
}
function trouverJoueur(nom, eff, cote) {
  const cotes = cote ? [cote] : ["home", "away"];
  const t = [];
  cotes.forEach((c) => (eff[c] || []).forEach((p) => { if (memeJoueur(nom, p.nom)) t.push({ id: p.id, cote: c }); }));
  const ids = new Set(t.map((x) => x.id));
  return ids.size === 1 ? t[0] : null;
}

// --------------------------------------------------------------------------- groupes et chances
function groupesDe(sp, values) {
  if (sp.g === "issues") return values.length >= 2 ? [{ ligne: null, issues: values }] : [];
  if (sp.g === "ligne") {
    const par = new Map();
    values.forEach((v) => { const r = ligneDe(v.value); if (!r || !demi(r.l)) return; if (!par.has(r.l)) par.set(r.l, {}); par.get(r.l)[r.sens] = v; });
    return [...par.entries()].filter(([, x]) => x.over && x.under).map(([l, x]) => ({ ligne: l, issues: [x.over, x.under] }));
  }
  if (sp.g === "ah" || sp.g === "eu") {
    const par = new Map();
    values.forEach((v) => { const h = hcp(v.value); if (!h) return; if (sp.g === "ah" && (!demi(h.l) || h.cote === "draw")) return; if (!par.has(h.l)) par.set(h.l, {}); par.get(h.l)[h.cote] = v; });
    const noms = sp.g === "ah" ? ["home", "away"] : ["home", "draw", "away"];
    return [...par.entries()].filter(([, x]) => noms.every((n) => x[n])).map(([l, x]) => ({ ligne: l, issues: noms.map((n) => x[n]) }));
  }
  if (sp.g === "par_ligne") {
    const par = new Map();
    values.forEach((v) => { const r = sp.motif.exec(v.value); if (!r) return; const l = Number(r[3]); if (!demi(l)) return; if (!par.has(l)) par.set(l, []); par.get(l).push(v); });
    const n = sp.motif.source.indexOf("home|draw|away") !== -1 ? 6 : 4;
    return [...par.entries()].filter(([, x]) => x.length === n).map(([l, x]) => ({ ligne: l, issues: x }));
  }
  return [];
}
function referenceDe(flux, betId) {
  const ordre = ORDRE_REPLI.concat(Object.keys(flux).filter((k) => ORDRE_REPLI.indexOf(k) === -1 && k !== CONTROLE).sort());
  for (const bk of ordre) if (flux[bk] && flux[bk][betId] && flux[bk][betId].values.length) return bk;
  return null;
}
function exposant1n2(flux, bk) {
  const b = flux[bk] && flux[bk][1];
  const v = b ? ["Home", "Draw", "Away"].map((n) => b.values.find((x) => x.value === n)) : null;
  const r = v && v.every(Boolean) ? puissance(v.map((x) => x.odd)) : null;
  return r ? r.k : null;
}
// Chances sans marge d'un marche chez un bookmaker -> [{ value, ligne, odd, chance }].
function chancesDe(flux, bk, betId, sp) {
  const b = flux[bk] && flux[bk][betId];
  if (!b) return [];
  if (sp.g === "dc") {
    const base = flux[bk][sp.base];
    const v = base ? ["Home", "Draw", "Away"].map((n) => base.values.find((x) => x.value === n)) : null;
    const r = v && v.every(Boolean) ? puissance(v.map((x) => x.odd)) : null;
    if (!r) return [];
    const ij = { "home/draw": [0, 1], "draw/away": [1, 2], "home/away": [0, 2] };
    return b.values.map((x) => { const i = ij[x.value.toLowerCase()]; return i ? { value: x.value, ligne: null, odd: x.odd, chance: r.p[i[0]] + r.p[i[1]] } : null; }).filter(Boolean);
  }
  // Verdict du mathematicien du 06/10 (point 3) : JAMAIS la methode puissance sur un marche sans issue contraire
  // (joueurs, paires « Home / Away » non contraires, liste incomplete) : jamais candidat.
  if (sp.g === "incomplet" || sp.g === "joueur" || sp.g === "joueur_ligne") return [];
  const out = [];
  groupesDe(sp, b.values).forEach((g) => {
    const r = puissance(g.issues.map((x) => x.odd)); // null si la somme des 1/cote < 1 (une issue manque)
    if (r) g.issues.forEach((x, i) => out.push({ value: x.value, ligne: g.ligne, odd: x.odd, chance: r.p[i] }));
  });
  return out;
}

// SELECTIONS DU MATCH POUR LE CHOIX DU PARI. opts : { match (noms, effectifs, ligue), couverture (Set des
// couvertures API-Football de la competition : « events », « statistics_fixtures », « statistics_players »), ou null =
// tout couvert }. -> { selections: [{ code, bet_id, value, ligne, cote, chance (0-1), bookmaker_ref, famille,
// libelle, joueur_id }], exclus: { raison: nombre de marches } }.
function selectionsDuMatch(raw, opts) {
  opts = opts || {};
  const m = opts.match || {};
  const dom = (m.home && (m.home.n || m.home.name)) || "Domicile", ext = (m.away && (m.away.n || m.away.name)) || "Extérieur";
  const flux = lireFlux(raw);
  const eff = effectifs(m);
  const selections = [], exclus = {};
  const vus = new Set();
  Object.keys(flux).forEach((bk) => Object.keys(flux[bk]).forEach((id) => vus.add(Number(id))));
  [...vus].sort((a, b) => a - b).forEach(function (betId) {
    const bk = referenceDe(flux, betId);
    if (!bk) return;
    const nom = flux[bk][betId].nom;
    const r = raisonExclusion(betId, nom);
    if (r) { exclus[r] = (exclus[r] || 0) + 1; return; }
    const sp = S[betId];
    if (sp.couverture && opts.couverture && !opts.couverture.has(sp.couverture)) { exclus["statistiques non fournies pour la competition"] = (exclus["statistiques non fournies pour la competition"] || 0) + 1; return; }
    const pin = chancesDe(flux, CONTROLE, betId, sp);
    chancesDe(flux, bk, betId, sp).forEach(function (s) {
      if (!(s.odd >= COTE_MIN_LUE)) return;
      const p = pin.find((x) => x.value === s.value && (x.ligne == null ? null : x.ligne) === (s.ligne == null ? null : s.ligne));
      if (p && CONTROLE_BETS.indexOf(betId) !== -1 && Math.abs(p.chance - s.chance) > ECART_MAX_CONTROLE + 1e-12) return;
      if (VALEURS_EXCLUES[betId] && VALEURS_EXCLUES[betId].indexOf(String(s.value).toLowerCase()) !== -1) return;
      const sel = { code: "F" + betId + ":" + s.value, bet_id: betId, value: s.value, ligne: s.ligne, cote: s.odd, chance: s.chance, bookmaker_ref: bk, famille: sp.fam, joueur_id: null };
      if (sp.g === "joueur" || sp.g === "joueur_ligne") {
        const rj = sp.g === "joueur_ligne" ? /^(.+?)\s*-\s*(\d+)\s*$/.exec(s.value) : [s.value, s.value, null];
        if (!rj) return;
        const j = trouverJoueur(rj[1], eff, sp.cote);
        if (!j) return; // nom introuvable ou ambigu : jamais un pari qu'on ne saurait regler
        sel.joueur_id = j.id; sel.nom = rj[1].trim(); sel.seuil = rj[2] != null ? Number(rj[2]) : null;
        sel.code = "F" + betId + ":" + s.value + "#" + j.id;
      }
      sel.libelle = sp.lib(s.value, dom, ext, sel);
      selections.push(sel);
    });
  });
  return { selections: selections, exclus: exclus };
}

// --------------------------------------------------------------------------- codes et reglement
function lireCode(code) {
  const r = /^F(\d+):(.+?)(?:#(\d+))?$/.exec(String(code || ""));
  if (!r || !S[Number(r[1])] || raisonExclusion(Number(r[1]), "")) return null;
  if (VALEURS_EXCLUES[Number(r[1])] && VALEURS_EXCLUES[Number(r[1])].indexOf(String(r[2]).trim().toLowerCase()) !== -1) return null;
  const sel = { bet_id: Number(r[1]), value: r[2], joueur_id: r[3] != null ? Number(r[3]) : null };
  const sp = S[sel.bet_id];
  if (sp.g === "joueur_ligne") { const x = /^(.+?)\s*-\s*(\d+)\s*$/.exec(sel.value); if (!x) return null; sel.nom = x[1].trim(); sel.seuil = Number(x[2]); }
  if ((sp.g === "joueur" || sp.g === "joueur_ligne") && sel.joueur_id == null) return null;
  return sel;
}
function estCode(code) { return !!lireCode(code); }
// ISSUE DE « PETIT SCORE » (verdict du mathematicien du 06/10, point 2 : chance trop haute, -3 points) : « moins de »
// des buts (5, 6, 26, 16, 17 et demi-lignes du 50 et du 72), « non » des deux marquent par mi-temps (34, 35),
// « n'encaisse aucun but : oui » (27, 28), « moins de buts et pas les deux » (49 u/no), « moins de 2 buts » (349).
// Marche du site (lib/marches-paris.js) ou code « F<bet>:<valeur> ». -> vrai / faux.
const PETITS_SCORES_ID = /^(under-\d+|fh-under-\d+|sh-under-\d+|home-team-under-\d+|away-team-under-\d+)$/;
function petitScore(marketId) {
  const id = String(marketId || "");
  if (PETITS_SCORES_ID.test(id)) return true;
  const r = /^F(\d+):(.+?)(?:#\d+)?$/.exec(id);
  if (!r) return false;
  const b = Number(r[1]), v = r[2].trim().toLowerCase();
  if ([5, 6, 26, 16, 17, 50, 72].indexOf(b) !== -1) return /^under\s/.test(v);
  if (b === 34 || b === 35) return v === "no";
  if (b === 27 || b === 28) return v === "yes";
  if (b === 49) return /^u\/no\s/.test(v);
  if (b === 349) return v === "under 2 goals";
  return false;
}
function definitionCode(code) { const s = lireCode(code); return s ? { famille: S[s.bet_id].fam, besoin: S[s.bet_id].besoin, couverture: S[s.bet_id].couverture } : null; }
function libelleCode(code, dom, ext) { const s = lireCode(code); return s ? S[s.bet_id].lib(s.value, dom || "Domicile", ext || "Extérieur", s) : null; }
// Faits du match -> true (gagne), false (perdu), « rembourse » (joueur absent) ou null (donnee manquante : en attente).
function regler(code, F) {
  const s = lireCode(code);
  if (!s || !F) return null;
  const r = S[s.bet_id].regle(s.value, F, s);
  return r === true || r === false || r === "rembourse" ? r : null;
}
// Ce qu'il faut aller chercher chez API-Football pour regler ce pari.
function besoins(code) {
  const s = lireCode(code);
  const b = s ? S[s.bet_id].besoin : null;
  return { evenements: b === "evenements" || b === "joueurs", stats: b === "stats", joueurs: b === "joueurs" };
}

// FAITS D'UN MATCH a partir des reponses d'API-Football : fixture (/fixtures), events (/fixtures/events),
// statistics (/fixtures/statistics), players (/fixtures/players). Un fait manquant reste null (jamais 0 invente),
// sauf une statistique nulle d'une equipe dont le bloc existe (API-Football ecrit null pour 0).
function faitsDuMatch(src) {
  src = src || {};
  const fx = src.fixture || {};
  const t = fx.teams || {}, idH = t.home && t.home.id, idA = t.away && t.away.id;
  const paire = (o) => (o && Number.isInteger(o.home) && Number.isInteger(o.away) ? [o.home, o.away] : null);
  const s = fx.score || {};
  const F = { ft: paire(s.fulltime), ht: paire(s.halftime), statut: fx.fixture && fx.fixture.status ? fx.fixture.status.short || null : null, buts: null, penaltys: null, stats: null, joueurs: null, vainqueur: null };
  if (!F.ft && F.statut === "FT") F.ft = paire(fx.goals);
  if (t.home && t.home.winner === true) F.vainqueur = "home"; else if (t.away && t.away.winner === true) F.vainqueur = "away";
  if (Array.isArray(src.events) && F.ft) {
    const ev = src.events.filter((e) => e && e.type === "Goal" && !/shootout/i.test(String(e.comments || "")) && e.time && Number(e.time.elapsed) <= 90);
    const pen = src.events.filter((e) => e && e.type === "Goal" && /penalty/i.test(String(e.detail || "")) && !/shootout/i.test(String(e.comments || "")) && e.time && Number(e.time.elapsed) <= 90);
    const essai = function (cscPourAutre) {
      const l = ev.filter((e) => e.detail !== "Missed Penalty").map((e) => {
        const csc = /own goal/i.test(String(e.detail || ""));
        const pour = e.team && e.team.id === idH ? "home" : e.team && e.team.id === idA ? "away" : null;
        const cote = csc && cscPourAutre ? (pour === "home" ? "away" : pour === "away" ? "home" : null) : pour;
        return { ordre: Number(e.time.elapsed) + (Number(e.time.extra) > 0 ? Number(e.time.extra) / 100 : 0), cote: cote, joueur: e.player && e.player.id, passeur: e.assist && e.assist.id, type: csc ? "csc" : /penalty/i.test(String(e.detail || "")) ? "penalty" : "normal" };
      }).sort((a, b) => a.ordre - b.ordre);
      const h = l.filter((x) => x.cote === "home").length, a = l.filter((x) => x.cote === "away").length;
      return l.every((x) => x.cote) && h === F.ft[0] && a === F.ft[1] ? l : null;
    };
    const A = essai(false), B = essai(true);
    const aCsc = ev.some((e) => /own goal/i.test(String(e.detail || "")));
    // Sans contre son camp : une seule lecture. Avec : la lecture qui retrouve le score final, si elle est unique.
    F.buts = !aCsc ? A : (A && B && JSON.stringify(A) !== JSON.stringify(B) ? null : (A || B));
    if (F.buts && F.ht) { const h1 = F.buts.filter((x) => x.ordre < 46); if (h1.filter((x) => x.cote === "home").length !== F.ht[0] || h1.filter((x) => x.cote === "away").length !== F.ht[1]) F.buts = null; }
    F.penaltys = pen.concat(src.events.filter((e) => e && e.detail === "Missed Penalty" && !/shootout/i.test(String(e.comments || "")) && e.time && Number(e.time.elapsed) <= 90))
      .map((e) => ({ cote: e.team && e.team.id === idH ? "home" : e.team && e.team.id === idA ? "away" : null, type: e.detail === "Missed Penalty" ? "penalty_manque" : "penalty" }));
  }
  if (Array.isArray(src.statistics) && src.statistics.length === 2) {
    const lire = (type) => {
      const v = [idH, idA].map((id) => { const b = src.statistics.find((x) => x && x.team && x.team.id === id); if (!b || !Array.isArray(b.statistics)) return undefined; const r = b.statistics.find((y) => y && y.type === type); if (!r) return undefined; const n = r.value == null ? 0 : parseFloat(r.value); return Number.isFinite(n) ? n : undefined; });
      return v.every((x) => x !== undefined) ? v : null;
    };
    F.stats = { tirs: lire("Total Shots"), tirs_cadres: lire("Shots on Goal"), fautes: lire("Fouls"), hors_jeu: lire("Offsides") };
  }
  if (Array.isArray(src.players) && src.players.length) {
    F.joueurs = {};
    src.players.forEach((eq) => (eq && Array.isArray(eq.players) ? eq.players : []).forEach((p) => {
      const st = p && Array.isArray(p.statistics) && p.statistics[0] ? p.statistics[0] : null;
      if (!p || !p.player || p.player.id == null || !st) return;
      const n = (x) => (x == null ? 0 : Number(x));
      const minutes = st.games && st.games.minutes != null ? Number(st.games.minutes) : 0;
      F.joueurs[String(p.player.id)] = { minutes: minutes, tirs: n(st.shots && st.shots.total), tirs_cadres: n(st.shots && st.shots.on), fautes: n(st.fouls && st.fouls.committed), arrets: n(st.goals && st.goals.saves) };
    }));
  }
  return F;
}

// Liste lisible des marches (publiables et exclus), pour le rapport et le mathematicien.
function catalogue() {
  const pub = Object.keys(S).map(Number).filter((id) => !EXCLUS[id]).sort((a, b) => a - b).map((id) => ({ bet_id: id, famille: S[id].fam, regroupement: S[id].g, besoin: S[id].besoin }));
  const exc = Object.keys(EXCLUS).map(Number).sort((a, b) => a - b).map((id) => ({ bet_id: id, raison: EXCLUS[id] }));
  return { publiables: pub, exclus: exc };
}

module.exports = { ORDRE_REPLI, CONTROLE, CONTROLE_BETS, VALEURS_EXCLUES, petitScore, CORNERS_CARTONS, puissance, lireFlux, selectionsDuMatch, raisonExclusion, lireCode, estCode, definitionCode, libelleCode, regler, besoins, faitsDuMatch, memeJoueur, trouverJoueur, effectifs, catalogue, SPECS: S, EXCLUS };
