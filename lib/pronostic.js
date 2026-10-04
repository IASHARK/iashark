"use strict";
// UN PRONOSTIC SUR CHAQUE MATCH (plan de Clement, 03/10/2026).
//
//   « On affiche un PRONOSTIC sur chaque match ; la selection Pro (programme Telegram,
//     combine, tickets) en est un sous-ensemble. »
//
// Ce module pose, une fois par le pipeline (.github/workflows/update-data.yml, juste apres
// lib/chance-iashark.js#poserChance), le champ PREMIUM `pronostic` de chaque match analyse
// et l'amorce PUBLIQUE `pronostic_dispo` (vrai / absent : « un pronostic existe », sans le
// donner). Rien n'est modifie d'autre : ni pari_rec, ni market_id, ni les probabilites du
// moteur, ni la regle de la selection.
//
// LE PRONOSTIC d'un match =
//   1. si le match a une SELECTION IASHARK (pari retenu : pari_rec non vide et no_signal
//      different de true ; regle inchangee, plus les selections nationales verifiees de
//      poserSelectionsNationales ci-dessous) : c'est elle, avec SA chance_iashark et SA cote
//      (selection : true). La selection est donc toujours un pronostic (sous-ensemble) ;
//   2. sinon, voie « moteur v3 » (ses championnats) : l'issue la plus probable parmi les
//      marches 1N2 et double chance du v3 « vérifié sur le passé » (match « couverture
//      vérifiée », competition validee) ; chance = celle du Canal Pro pour ce marche
//      (lib/moteur-v3.js#chancesPourCanal : le plus bas entre le v3 et la cote sans marge,
//      lib/chance-iashark.js) -> fiabilite « vérifiée » ;
//   3. sinon, voie « cotes du marche » (competitions de
//      config/leagues.json#fiabilite.ligues_validees_cotes_marche, et pour les selections
//      nationales seulement celles de selections_cotes_marche) : l'issue la plus probable
//      parmi les SEULS marches autorises de la competition (1N2, DC, OU2.5), chance = la cote
//      moyenne des bookmakers, marge retiree par la methode puissance (la meme que le Canal
//      Pro, canal-pro-menu.mjs#sansMargePuissance), arrondie par lib/chance-iashark.js
//      -> fiabilite « vérifiée » ;
//   4. sinon : le 1N2 le plus probable du modele (p1 / pn / p2), arrondi par
//      lib/chance-iashark.js -> fiabilite « en test ».
// Classement : la chance affichee (entier), puis la probabilite brute, puis l'ordre fixe
// des marches (jamais au hasard), parmi les issues dont la cote est >= 1,20 (COTE_MIN). Aucun
// chiffre : pas de pronostic.
// FOURCHETTE (04/10/2026) : ce pronostic n'est qu'une etape. Le pari PUBLIE (et le pronostic qui
// le decrit) est ensuite decide par publierPronostics ci-dessous : pari simple sur CHAQUE match, cote
// affichee (agreee d'abord, sinon cote du marche d'API-Football) dans config/leagues.json#
// fiabilite.fourchette_pari (1,40-1,70), sinon le pari simple le plus proche de la fourchette (04/10, 4 h).
//
// Regles (Clement) : aucune mise, aucune esperance, jamais « conseil » ; le mot est
// « Sélection » pour les retenus. Contenu Pro : `pronostic` est dans
// lib/premium-fields.js (retire des fichiers publics hors match offert).

const CHANCE = require("./chance-iashark.js");
const SELECTIONS = require("./selections-nationales.js");
const COTE_ANJ = require("./cote-anj.js");
const { computeRiskLabel } = require("./decision.js");

const VERIFIE = "vérifié sur le passé";
const FIABILITE = Object.freeze({ VERIFIEE: "vérifiée", EN_TEST: "en test" });
// D'ou vient la chance affichee d'un pari (corrections de config/leagues.json#fiabilite.corrections_chance).
const SOURCE_CHANCE = Object.freeze({ MODELE: "modele", MARCHE: "marche" });
const VOIE = Object.freeze({ SELECTION: "selection", V3: "v3", COTES_MARCHE: "cotes_marche", MODELE: "modele" });

// Marches du pronostic (ids du site) : 1N2, double chance, plus/moins de 2,5 buts ; depuis le 04/10/2026
// (un pari sur chaque match) aussi plus/moins de 1,5 et 3,5 buts et « les deux equipes marquent », seulement
// dans les competitions ou le mathematicien les a verifies (config/marches-valides.json, voir famillesFlux).
const MARCHE = {
  "home-win": { famille: "1N2", marche: "Victoire Domicile", cote: ["c1"], cle_v3: "1N2:1" },
  "draw": { famille: "1N2", marche: "Match nul", cote: ["cn"], cle_v3: "1N2:N" },
  "away-win": { famille: "1N2", marche: "Victoire Exterieur", cote: ["c2"], cle_v3: "1N2:2" },
  "dc-1x": { famille: "DC", marche: "DC 1X", cote: ["cdc1x", "dc1x"], cle_v3: "DC:1N" },
  "dc-x2": { famille: "DC", marche: "DC X2", cote: ["cdc2x", "dc2x"], cle_v3: "DC:N2" },
  "dc-12": { famille: "DC", marche: "DC 12", cote: ["cdc12", "dc12"], cle_v3: "DC:12" },
  "over-25": { famille: "OU2.5", marche: "Over 2.5", cote: ["co25"], cle_v3: "TOTAL:plus2.5" },
  "under-25": { famille: "OU2.5", marche: "Under 2.5", cote: ["cu25"], cle_v3: "TOTAL:moins2.5" },
  "over-15": { famille: "OU1.5", marche: "Over 1.5", cote: ["co15"] },
  "under-15": { famille: "OU1.5", marche: "Under 1.5", cote: ["cu15"] },
  "over-35": { famille: "OU3.5", marche: "Over 3.5", cote: ["co35"] },
  "under-35": { famille: "OU3.5", marche: "Under 3.5", cote: ["cu35"] },
  "btts-yes": { famille: "BTTS", marche: "BTTS Oui", cote: ["btts_oui", "cbtts"] },
  "btts-no": { famille: "BTTS", marche: "BTTS Non", cote: ["btts_non", "cbtts_non"] },
};
// Categorie du marche (champ « marche » lu par la page du 29/09 et le pipeline).
function categorie(id) {
  const f = MARCHE[id] ? MARCHE[id].famille : "";
  return f === "DC" ? "DOUBLE_CHANCE" : (/^OU/.test(f) ? "TOTAL_BUTS" : (f === "BTTS" ? "BTTS" : "RESULTAT"));
}
const ORDRE = Object.keys(MARCHE);

function nombre(v) {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : null;
}
function estObjet(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
function cote(v) { const x = nombre(v); return x !== null && x > 1 ? Math.round(x * 100) / 100 : null; }
// Noms affiches en francais (selections nationales, grands clubs) : meme table que les pages fr.
const NOMS_FR = require("./noms-equipes-fr.js");
function nom(t) { const n = (t && typeof t.n === "string" && t.n.trim()) || ""; return n ? NOMS_FR.nom(n) : ""; }

// Libelle francais (le site traduit a partir de market_id / marche dans les autres langues).
function libelleFr(id, m) {
  const d = nom(m && m.home) || "Domicile", e = nom(m && m.away) || "Extérieur";
  switch (id) {
    case "home-win": return "Victoire " + d;
    case "draw": return "Match nul";
    case "away-win": return "Victoire " + e;
    case "dc-1x": return d + " ou match nul";
    case "dc-x2": return "Match nul ou " + e;
    case "dc-12": return d + " ou " + e + " (pas de match nul)";
    case "over-25": return "Plus de 2,5 buts";
    case "under-25": return "Moins de 2,5 buts";
    case "over-15": return "Plus de 1,5 but";
    case "under-15": return "Moins de 1,5 but";
    case "over-35": return "Plus de 3,5 buts";
    case "under-35": return "Moins de 3,5 buts";
    case "btts-yes": return "Les deux équipes marquent";
    case "btts-no": return "Au moins une équipe ne marque pas";
    default: return null;
  }
}

function coteDuMarche(m, id) {
  const def = MARCHE[id];
  if (!def || !m) return null;
  for (const k of def.cote) { const c = cote(m[k]); if (c !== null) return c; }
  return null;
}

// Methode puissance : copie de supabase/functions/_shared/canal-pro-menu.mjs#sansMargePuissance
// (tests/pronostic.test.mjs verifie que les deux donnent le meme resultat).
function sansMargePuissance(cotes) {
  if (!Array.isArray(cotes) || !cotes.every(function (o) { return typeof o === "number" && isFinite(o) && o > 1; })) return null;
  const inv = cotes.map(function (o) { return 1 / o; });
  const f = function (k) { return inv.reduce(function (s, x) { return s + Math.pow(x, k); }, 0) - 1; };
  let lo = 0.2, hi = 5;
  if (f(lo) < 0 || f(hi) > 0) return null;
  for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (f(mid) > 0) lo = mid; else hi = mid; }
  const k = (lo + hi) / 2;
  return inv.map(function (x) { return Math.pow(x, k); });
}

// Competitions de la voie « cotes du marche » : { cle: [familles autorisees] }.
// Une selection nationale n'y entre que si sa cle est dans selections_cotes_marche
// (meme regle que canal-pro-menu.mjs#liguesCotesMarche).
function liguesCotesMarche(configLigues) {
  const fia = (configLigues && configLigues.fiabilite) || {};
  const liste = estObjet(fia.ligues_validees_cotes_marche) ? fia.ligues_validees_cotes_marche : {};
  const selOk = new Set((fia.selections_cotes_marche || []).map(String));
  const out = {};
  ((configLigues && configLigues.leagues) || []).forEach(function (l) {
    const familles = Array.isArray(liste[l.key]) ? liste[l.key] : null;
    if (!familles) return;
    const selection = l.national === true || l.selections === true || l.kind === "nations" || l.kind === "wcq";
    if (selection && !selOk.has(String(l.key))) return;
    out[l.key] = familles.slice();
  });
  return out;
}

// Chances de la voie « cotes du marche » a partir des cotes moyennes publiees sur le match.
// -> { id du site: probabilite sans marge en % } (marches dont les cotes existent).
function sansMargeDesCotes(m) {
  const out = {};
  const a = ["c1", "cn", "c2"].map(function (k) { return cote(m[k]); });
  const qa = a.every(function (x) { return x !== null; }) ? sansMargePuissance(a) : null;
  if (qa) {
    out["home-win"] = qa[0] * 100; out["draw"] = qa[1] * 100; out["away-win"] = qa[2] * 100;
    out["dc-1x"] = (qa[0] + qa[1]) * 100; out["dc-x2"] = (qa[1] + qa[2]) * 100; out["dc-12"] = (qa[0] + qa[2]) * 100;
  }
  // Marches a deux issues : plus/moins (1,5 ; 2,5 ; 3,5) et les deux marquent, meme methode.
  [["over-15", "under-15"], ["over-25", "under-25"], ["over-35", "under-35"], ["btts-yes", "btts-no"]].forEach(function (p) {
    const o = [coteDuMarche(m, p[0]), coteDuMarche(m, p[1])];
    const qo = o[0] !== null && o[1] !== null ? sansMargePuissance(o) : null;
    if (qo) { out[p[0]] = qo[0] * 100; out[p[1]] = qo[1] * 100; }
  });
  return out;
}

function classer(cands) {
  return cands.filter(function (c) { return c && c.chance !== null; }).sort(function (a, b) {
    return (b.chance - a.chance) || ((b.brute || 0) - (a.brute || 0)) || (ORDRE.indexOf(a.market_id) - ORDRE.indexOf(b.market_id));
  });
}
// COTE MINIMALE (decision de Clement, 03/10/2026 : « rien sous 1,20 ») : l'issue la plus
// probable DONT la cote connue est >= 1,20 ; sinon la suivante ; si aucune, le 1N2 le plus
// probable de la meme voie (sinon, faute de 1N2 autorise, la plus probable).
// Garde-fou : une issue sous 50 % n'est pas « la plus probable » (ex. Pays-Bas - Serbie, ou la
// premiere issue a 1,20 ou plus etait « nul ou Serbie », 16 %) : on prend alors le 1N2 le plus
// probable, comme quand aucune issue n'atteint 1,20.
const COTE_MIN = 1.20;
const CHANCE_MIN = 50;
function meilleur(cands, m) {
  const tries = classer(cands);
  const avecCote = tries.filter(function (c) { const k = coteDuMarche(m, c.market_id); return k !== null && k >= COTE_MIN; });
  if (avecCote.length && avecCote[0].chance >= CHANCE_MIN) return avecCote[0];
  const n1n2 = tries.filter(function (c) { return MARCHE[c.market_id] && MARCHE[c.market_id].famille === "1N2"; });
  return n1n2[0] || tries[0] || null;
}

// SELECTIONS NATIONALES SUR LE SITE (decision de Clement, 03/10/2026, apres la verification
// VERIF-SELECTIONS.md du 02/10 : 1 684 matchs BetExplorer 2018-2026, cotes de cloture, 1N2 et
// double chance PASSENT ; le robot Pro les utilise deja). Seules les competitions de
// config/leagues.json#fiabilite.selections_cotes_marche (Ligue des nations, eliminatoires du
// Mondial zone Europe) ; amicaux et autres zones : jamais. Remplace, pour ces competitions
// seulement, la decision du 30/09 (« aucun pari publie sur les selections »).
// REGLE (la meme que les selections simples du robot, canal-pro-menu.mjs#choisirSimples et
// MENU.simple) : marches 1N2 et double chance seulement ; chance = cotes moyennes du marche,
// marge retiree par la methode puissance ; parmi les marches dont la cote est dans la
// fourchette 1,40-2,00, le plus probable ; un seul par match. Aucun dans la fourchette : pas
// de selection (le match garde son pronostic).
// PLAFOND PAR JOUR (03/10/2026 : « la Sélection IASHARK est le petit groupe le plus fiable ») :
// le robot garde au plus MENU.simple.max = 3 simples par jour, les plus probables (aucun seuil de
// chance ni d'ecart de marge en plus de la fourchette). Meme plafond ici, par jour de Paris, pour
// ces competitions : les 3 plus hautes chances (a egalite le plus tot, puis le plus petit numero).
// Les selections deja posees ce jour (gel d'un run precedent) comptent dans les 3.
// FOURCHETTE (exigence de Clement du 04/10/2026, 2 h : « des cotes entre 1,40 et 1,70 en sec ») :
// la fourchette des selections nationales est celle de TOUT pari publie, lue dans
// config/leagues.json#fiabilite.fourchette_pari (fourchettePari ci-dessous), et non plus 1,40-2,00.
// Le plafond de 3 par jour ne change pas.

// Bornes de la cote du pari publie : config/leagues.json#fiabilite.fourchette_pari, SEUL endroit
// ou elles sont ecrites (la config passee par le pipeline, sinon celle du depot). Absente ou
// illisible : erreur (jamais une fourchette inventee).
// marge_sans_agree (04/10/2026, trader) : marge de securite sur la borne basse quand la cote verifiee
// n'est PAS celle d'un bookmaker agree (cote du marche d'API-Football) : 1,40 + 0,02 = 1,42, pour que la
// cote reste dans la fourchette chez un agree. Absente : 0.
function lireFourchette(cfg) {
  const f = cfg && cfg.fiabilite && cfg.fiabilite.fourchette_pari;
  const a = f ? nombre(f.cote_min) : null, b = f ? nombre(f.cote_max) : null;
  const marge = f ? nombre(f.marge_sans_agree) : null;
  return a !== null && b !== null && a > 1 && b >= a ? Object.freeze({ cote_min: a, cote_max: b, marge_sans_agree: marge !== null && marge >= 0 && marge < b - a ? marge : 0 }) : null;
}
function fourchettePari(configLigues) {
  const f = lireFourchette(configLigues) || lireFourchette(require("../config/leagues.json"));
  if (!f) throw new Error("config/leagues.json#fiabilite.fourchette_pari absente ou illisible");
  return f;
}
// Cote (nombre ou texte « 1,55 ») dans la fourchette, bornes comprises, au centime pres.
function dansFourchette(k, f) {
  const c = cote(k);
  if (c === null || !f) return false;
  const x = Math.round(c * 100);
  return x >= Math.round(f.cote_min * 100) && x <= Math.round(f.cote_max * 100);
}
// Fourchette d'une cote candidate : bornes exactes pour une cote agreee ANJ, borne basse relevee de
// marge_sans_agree pour la cote du marche d'API-Football.
function fourchetteDe(k, f) {
  if (!f) return null;
  return k && k.anj ? f : { cote_min: f.cote_min + (f.marge_sans_agree || 0), cote_max: f.cote_max };
}
function dansFourchetteCandidat(k, f) {
  return !!k && dansFourchette(k.cote, fourchetteDe(k, f));
}

// =====================================================================================
// COTE D'UN MARCHE CANDIDAT (regle de Clement du 04/10/2026, 4 h 15 : « quand on choisit un marche,
// si la cote n'est pas chez un bookmaker agree, on met le bookmaker d'API-Sports et c'est tout ») :
//   1. la MEILLEURE cote chez les agrees ANJ suivis (Betclic, NetBet, PMU, Unibet, Winamax), relevee
//      dans le meme appel The Odds API que la cote de reference (livres du match,
//      lib/cote-anj.js#releverLivresAnj), ou deja posee sur le pari present (lib/cote-anj.js#poserCotesAnj) ;
//   2. sinon la cote du marche des bookmakers d'API-Football (mediane de lib/odds.js), affichee comme
//      « cote du marche », sans nom de bookmaker (jamais bet365 ni Pinnacle).
// Aucune cote reelle : le marche n'est PAS candidat (jamais une cote inventee, jamais « 1 / chance »).
// -> { cote, anj, bookmaker (nom de l'agree ou null), sans_marge (% des agrees ou null) } ou null.
function coteCandidat(m, id, livres) {
  if (livres) {
    const a = COTE_ANJ.coteDuPari(livres, id);
    const k = a ? cote(a.cote) : null;
    if (k !== null) return { cote: k, anj: true, bookmaker: a.bookmaker_nom || null, sans_marge: a.sans_marge != null ? a.sans_marge : null };
  }
  if (m.cote_source === "anj" && String(m.market_id || "") === id && typeof m.cote_bookmaker === "string" && m.cote_bookmaker) {
    const k = cote(m.cote_rec);
    if (k !== null) {
      const sm = estObjet(m.sans_marge_anj) ? nombre(m.sans_marge_anj[id]) : null;
      return { cote: k, anj: true, bookmaker: m.cote_bookmaker, sans_marge: sm !== null && sm > 0 && sm < 100 ? sm : null };
    }
  }
  const k = coteDuMarche(m, id);
  return k === null ? null : { cote: k, anj: false, bookmaker: null, sans_marge: null };
}

// FAMILLES DONT LA CHANCE EST CALIBREE (seules candidates) :
//   - celles de la competition dans fiabilite.ligues_validees_cotes_marche (verification du 02/10/2026 :
//     1N2, double chance, plus/moins de 2,5 buts), sinon dans fiabilite.paris_cotes_marche (decision de
//     Clement du 03/10, « en test ») ;
//   - plus, dans les competitions MESUREES de config/marches-valides.json (liste du mathematicien : chance
//     sans marge contre resultats reels, 372 matchs de clubs, Ligue des nations sur 54), « Goals Over/Under »
//     (plus/moins de 1,5 ; 2,5 ; 3,5 buts) et « Both Teams Score », SEULEMENT dans la tranche de chance
//     validee (ex. 50-70 % pour les buts, 50-60 % pour les deux marquent).
// Jamais : « rembourse si nul » (Home/Away) ni les marches « meme match » (non verifies) ; buts d'une equipe,
// corners et double chance 1re mi-temps (verifies) ne sont pas candidats faute de cote gardee sur le match.
const FAMILLES_FLUX = Object.freeze({ 5: ["OU1.5", "OU2.5", "OU3.5"], 8: ["BTTS"] });
// config/marches-valides.json -> { ligue: { famille: [chance min %, chance max %] } }.
function famillesFlux(cfgMarches) {
  const out = {};
  ((cfgMarches && cfgMarches.marches) || []).forEach(function (mk) {
    const fams = mk ? FAMILLES_FLUX[Number(mk.bet_id)] : null;
    if (!fams || !Array.isArray(mk.ligues)) return;
    const tr = Array.isArray(mk.chance) && mk.chance.length === 2 && nombre(mk.chance[0]) !== null && nombre(mk.chance[1]) !== null
      ? [nombre(mk.chance[0]) * 100, nombre(mk.chance[1]) * 100] : [0, 100];
    const lignes = Array.isArray(mk.lignes) ? mk.lignes.map(Number) : null;
    mk.ligues.forEach(function (lg) {
      fams.forEach(function (f) {
        if (lignes && /^OU/.test(f) && lignes.indexOf(Number(f.slice(2))) === -1) return;
        (out[lg] = out[lg] || {})[f] = tr;
      });
    });
  });
  return out;
}
// Familles candidates d'un match : { famille: { fiabilite, tranche ([min, max] % ou null), selection } }.
// selection : la famille peut porter une « Sélection IASHARK » (liste verifiee de la competition seulement).
function famillesDuMatch(m, ctx) {
  const key = String((m && m.league_key) || "");
  const verifiees = ctx.ligues && Array.isArray(ctx.ligues[key]) ? ctx.ligues[key] : null;
  const paris = ctx.paris && Array.isArray(ctx.paris[key]) ? ctx.paris[key] : null;
  const out = {};
  (verifiees || paris || []).forEach(function (f) { out[f] = { fiabilite: verifiees ? FIABILITE.VERIFIEE : FIABILITE.EN_TEST, tranche: null, selection: !!verifiees }; });
  const flux = (ctx.flux && ctx.flux[key]) || {};
  if (verifiees || paris) Object.keys(flux).forEach(function (f) { if (!out[f]) out[f] = { fiabilite: FIABILITE.VERIFIEE, tranche: flux[f], selection: false }; });
  return out;
}
// Voie « cotes du marche » : chaque marche des familles candidates qui a une cote reelle ET une chance.
// Chance = cote sans marge : celle des agrees quand la cote affichee est agreee (meme source), sinon celle
// du marche d'API-Football (methode puissance), sinon celle des agrees (jamais Pinnacle, jamais le modele).
function candidatsMarche(m, ctx, livres) {
  const fams = famillesDuMatch(m, ctx);
  const qMarche = sansMargeDesCotes(m);
  const qAnj = livres ? COTE_ANJ.sansMargeAnj(livres) : {};
  const out = [];
  ORDRE.forEach(function (id) {
    const info = fams[MARCHE[id].famille];
    if (!info) return;
    const k = coteCandidat(m, id, livres);
    if (!k) return;
    let q = null;
    if (k.anj && k.sans_marge != null) q = k.sans_marge;
    else if (qMarche[id] != null) q = qMarche[id];
    else if (qAnj[id] != null) q = qAnj[id];
    if (q === null || !(q > 0 && q < 100)) return;
    if (info.tranche && !(q >= info.tranche[0] && q <= info.tranche[1])) return;
    const c = CHANCE.chanceIashark(q, null);
    if (!c) return;
    out.push({ market_id: id, chance: c.chance, brute: q, voie: VOIE.COTES_MARCHE, fiabilite: info.fiabilite, selection_possible: info.selection, source: SOURCE_COTES_MARCHE, source_chance: SOURCE_CHANCE.MARCHE, k: k });
  });
  return out;
}

const FOURCHETTE_SELECTION = Object.freeze(Object.assign({}, fourchettePari(null), { max_par_jour: 3 }));
const SOURCE_COTES_MARCHE = "cotes du marché, marge retirée";
function clesSelectionsCotes(configLigues) {
  const fia = (configLigues && configLigues.fiabilite) || {};
  const liste = estObjet(fia.ligues_validees_cotes_marche) ? fia.ligues_validees_cotes_marche : {};
  return (fia.selections_cotes_marche || []).map(String).filter(function (k) { return Array.isArray(liste[k]); });
}
function selectionCotesMarche(m, cles) {
  return !!m && Array.isArray(cles) && cles.indexOf(String(m.league_key || "")) !== -1 && SELECTIONS.estSelectionNationale(m);
}
// Meme regle que le pari publie (04/10/2026) : 1N2 et double chance seulement, cote agreee d'abord,
// sinon cote du marche d'API-Football (borne basse relevee de la marge), la plus probable dans la fourchette.
// -> { market_id, marche, chance, probabilite, cote, k } ou null.
function choixSelectionNationale(m, familles, fourchette, livres) {
  const F = fourchette || FOURCHETTE_SELECTION;
  const ligues = {}; ligues[String(m.league_key || "")] = (familles || []).filter(function (f) { return f === "1N2" || f === "DC"; });
  const cands = candidatsMarche(m, { ligues: ligues, paris: {}, flux: {} }, livres || null).filter(function (c) { return dansFourchetteCandidat(c.k, F); });
  cands.sort(function (a, b) { return (b.chance - a.chance) || ((b.k.anj ? 1 : 0) - (a.k.anj ? 1 : 0)) || ((b.brute || 0) - (a.brute || 0)) || (ORDRE.indexOf(a.market_id) - ORDRE.indexOf(b.market_id)); });
  const b = cands[0];
  return b ? { market_id: b.market_id, marche: MARCHE[b.market_id].marche, chance: b.chance, probabilite: Math.round(b.brute * 10) / 10, cote: b.k.cote, k: b.k } : null;
}
// Pipeline : pose la selection (pari_rec, market_id, cote_rec, model_probability, chance) des
// matchs de selections verifiees qui n'en ont pas encore, sur le match ET sa ligne premium
// (colonnes lues par la fonction match-data). Un match ferme ou deja pourvu (gel) : intouche.
// opts.cotesAnjPar : livres des agrees par match (lib/cote-anj.js#releverLivresAnj), en memoire.
// -> nombre de selections posees.
function poserSelectionsNationales(matchs, premiumRows, opts) {
  opts = opts || {};
  const cles = clesSelectionsCotes(opts.configLigues);
  const ligues = opts.ligues || liguesCotesMarche(opts.configLigues);
  const F = opts.fourchette || fourchettePari(opts.configLigues);
  const livresPar = estObjet(opts.cotesAnjPar) ? opts.cotesAnjPar : {};
  const jourDe = function (m) { return String((m && m.date) || "").slice(0, 10); };
  const pris = {};
  (matchs || []).forEach(function (m) {
    if (m && typeof m === "object" && aUneSelection(m) && selectionCotesMarche(m, cles)) pris[jourDe(m)] = (pris[jourDe(m)] || 0) + 1;
  });
  const cands = [];
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object" || estFerme(m) || aUneSelection(m) || !selectionCotesMarche(m, cles)) return;
    const familles = Array.isArray(ligues[String(m.league_key)]) ? ligues[String(m.league_key)] : [];
    const c = choixSelectionNationale(m, familles, F, livresPar[String(m.id)] || null);
    if (c) cands.push({ m: m, c: c });
  });
  cands.sort(function (a, b) {
    return (b.c.chance - a.c.chance) || (b.c.probabilite - a.c.probabilite) || String(a.m.date || "").localeCompare(String(b.m.date || "")) || (Number(a.m.id) - Number(b.m.id));
  });
  let n = 0;
  cands.forEach(function (x) {
    const m = x.m, c = x.c, j = jourDe(m);
    if ((pris[j] || 0) >= FOURCHETTE_SELECTION.max_par_jour) return;
    pris[j] = (pris[j] || 0) + 1;
    m.pari_rec = c.marche;
    m.market_id = c.market_id;
    m.marche = c.marche;
    m.cote_rec = c.cote.toFixed(2);
    if (c.k && c.k.anj) { m.cote_source = "anj"; m.cote_bookmaker = c.k.bookmaker; }
    else { m.cote_source = "indicative"; m.cote_bookmaker = null; }
    m.model_probability = c.probabilite;
    m.conf = Math.round(c.probabilite) / 10;
    m.chance_iashark = c.chance;
    m.chance_iashark_source = SOURCE_COTES_MARCHE;
    m.model_output_available = true;
    m.no_signal = false;
    m.no_signal_label = "";
    delete m.no_signal_reason;
    m.selection_voie = "cotes_marche";
    const row = (premiumRows || []).find(function (r) { return r && String(r.fixture_id) === String(m.id); });
    if (row) { row.pari_rec = m.pari_rec; row.market_id = m.market_id; row.marche = m.marche; row.cote_rec = m.cote_rec; row.model_probability = m.model_probability; }
    n++;
  });
  return n;
}

function aUneSelection(m) {
  return !!(m && String(m.pari_rec || "").trim() && m.no_signal !== true);
}
// Match ferme (coup d'envoi passe, reporte, plus a venir) : aucun pronostic.
function estFerme(m) {
  return /^(KICKOFF_|FIXTURE_NOT_UPCOMING)/.test(String((m && m.no_signal_reason) || ""));
}

// m : match COMPLET (avant retrait des champs premium), apres poserChance.
// ctx : { chancesV3: { "<cle v3>": chance % } du match (lib/moteur-v3.js#chancesPourCanal) ou null,
//         ligues: liguesCotesMarche(config) }.
// -> le pronostic, ou null.
function choisirPronostic(m, ctx) {
  ctx = ctx || {};
  if (!m || typeof m !== "object" || estFerme(m)) return null;
  const leagueKey = String(m.league_key || "");
  const ligueVerifiee = m.league_reliability !== "en_test";

  // 1. La selection (regle inchangee). Cote hors de la fourchette du pari publie (04/10/2026 :
  // 1,40-1,70, config/leagues.json#fiabilite.fourchette_pari), ou inconnue : le pari reste
  // affiche comme pronostic (cas d'un pari fige), mais ce n'est JAMAIS une « Sélection IASHARK »
  // (ni pastille, ni match offert).
  if (aUneSelection(m)) {
    const chance = CHANCE.chanceDuPari(m);
    if (chance === null) return null;
    const coteSel = cote(m.cote_rec);
    const selectionnable = dansFourchette(coteSel, ctx.fourchette || FOURCHETTE_SELECTION);
    const v3 = !!(m.v3_pari && m.moteur_v3 && m.moteur_v3.source === "v3");
    const id = m.market_id != null && m.market_id !== "" ? String(m.market_id) : null;
    return {
      market_id: id, marche: String(m.pari_rec), libelle_fr: (id && libelleFr(id, m)) || String(m.pari_rec),
      chance: chance, cote: cote(m.cote_rec), voie: VOIE.SELECTION, moteur: v3 ? "v3" : (selectionCotesMarche(m, ctx.selectionsCotes) ? "cotes_marche" : "ancien"),
      fiabilite: ligueVerifiee || selectionCotesMarche(m, ctx.selectionsCotes) ? FIABILITE.VERIFIEE : FIABILITE.EN_TEST, selection: selectionnable && (ligueVerifiee || selectionCotesMarche(m, ctx.selectionsCotes)),
      source: m.chance_iashark_source || null,
    };
  }

  // 2. Voie moteur v3 : 1N2 / double chance verifies.
  const f3 = estObjet(m.v3_fiabilite) ? m.v3_fiabilite : null;
  if (ctx.chancesV3 && f3 && f3.couverture === "vérifiée" && ligueVerifiee && Array.isArray(m.v3_marches) && !SELECTIONS.estSelectionNationale(m)) {
    const verifies = {};
    m.v3_marches.forEach(function (mk) { if (mk && mk.fiabilite_marche === VERIFIE && mk.etiquette === VERIFIE && mk.market_id) verifies[mk.market_id] = nombre(mk.probabilite); });
    const cands = ORDRE.filter(function (id) { return (MARCHE[id].famille === "1N2" || MARCHE[id].famille === "DC") && verifies[id] != null; }).map(function (id) {
      const ch = nombre(ctx.chancesV3[MARCHE[id].cle_v3]);
      return { market_id: id, chance: ch !== null && ch > 0 && ch < 100 ? Math.round(ch) : null, brute: verifies[id] };
    });
    const b = meilleur(cands, m);
    if (b) return sortie(m, b, VOIE.V3, FIABILITE.VERIFIEE, CHANCE.SOURCE_AVEC_COTE);
  }

  // 3. Voie cotes du marche : competitions verifiees, marches autorises seulement.
  const familles = ctx.ligues && Array.isArray(ctx.ligues[leagueKey]) ? ctx.ligues[leagueKey] : null;
  if (familles) {
    const q = sansMargeDesCotes(m);
    const cands = ORDRE.filter(function (id) { return familles.indexOf(MARCHE[id].famille) !== -1 && q[id] != null; }).map(function (id) {
      const c = CHANCE.chanceIashark(q[id], null);
      return { market_id: id, chance: c ? c.chance : null, brute: q[id] };
    });
    const b = meilleur(cands, m);
    if (b) return sortie(m, b, VOIE.COTES_MARCHE, FIABILITE.VERIFIEE, "cotes du marché, marge retirée");
  }

  // 3 bis. Voie cotes du marche pour les competitions a paris publies SANS verification
  // (config/leagues.json#fiabilite.paris_cotes_marche, decision de Clement du 03/10/2026, 23 h) :
  // meme calcul, fiabilite « en test » (ce n'est pas une validation).
  const famillesParis = ctx.liguesParis && Array.isArray(ctx.liguesParis[leagueKey]) ? ctx.liguesParis[leagueKey] : null;
  if (famillesParis && !familles) {
    const q = sansMargeDesCotes(m);
    const cands = ORDRE.filter(function (id) { return famillesParis.indexOf(MARCHE[id].famille) !== -1 && q[id] != null; }).map(function (id) {
      const c = CHANCE.chanceIashark(q[id], null);
      return { market_id: id, chance: c ? c.chance : null, brute: q[id] };
    });
    const b = meilleur(cands, m);
    if (b) return sortie(m, b, VOIE.COTES_MARCHE, FIABILITE.EN_TEST, "cotes du marché, marge retirée");
  }

  // 4. Le 1N2 le plus probable du modele : « en test ».
  const p = { "home-win": nombre(m.p1), "draw": nombre(m.pn), "away-win": nombre(m.p2) };
  const cands = Object.keys(p).filter(function (id) { return p[id] !== null; }).map(function (id) {
    const c = CHANCE.chanceIashark(p[id], null);
    return { market_id: id, chance: c ? c.chance : null, brute: p[id] };
  });
  const b = meilleur(cands, m);
  return b ? sortie(m, b, VOIE.MODELE, FIABILITE.EN_TEST, CHANCE.SOURCE_MODELE) : null;
}

function sortie(m, b, voie, fiabilite, source) {
  return {
    market_id: b.market_id, marche: MARCHE[b.market_id].marche, libelle_fr: libelleFr(b.market_id, m),
    chance: b.chance, cote: coteDuMarche(m, b.market_id), voie: voie,
    fiabilite: fiabilite, selection: false, source: source,
  };
}

// Amorce PUBLIQUE fiabilite_cotes_marche (aucun chiffre) : competition verifiee par la route des
// cotes du marche et pari (ou pronostic) venu de cette route. p : le pronostic du match ou null.
function poserFiabiliteCotes(m, p, ligues, cles) {
  delete m.fiabilite_cotes_marche;
  if (Array.isArray(ligues[String(m.league_key || "")]) && (!aUneSelection(m) || m.selection_voie === "cotes_marche" || selectionCotesMarche(m, cles)) && (!p || p.voie === VOIE.COTES_MARCHE || p.moteur === "cotes_marche")) m.fiabilite_cotes_marche = true;
}

// Pipeline : pose `pronostic` (premium) et `pronostic_dispo` (public) sur chaque match.
// chancesV3Par : sortie de lib/moteur-v3.js#chancesPourCanal ({ "<fixture>": { marches } }) ou null.
// figes : { "<fixture>": true } des matchs figes par le gel (GEL_FIGES) : leur pronostic publie
// est garde tel quel.
// -> { avec, sans, selections, voies: { v3, cotes_marche, modele, selection } } (compteurs, jamais un pari).
function poserPronostics(matchs, opts) {
  opts = opts || {};
  const ligues = opts.ligues || liguesCotesMarche(opts.configLigues);
  const cles = opts.selectionsCotes || clesSelectionsCotes(opts.configLigues);
  const paris = opts.liguesParis || liguesParis(opts.configLigues);
  const F = opts.fourchette || fourchettePari(opts.configLigues);
  const parFixture = opts.chancesV3Par || {};
  const rapport = { avec: 0, sans: 0, selections: 0, voies: { selection: 0, v3: 0, cotes_marche: 0, modele: 0 } };
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object") return;
    // PARI FIGE DEJA PUBLIE (controle du trader de cotes, 04/10/2026) : le gel a rendu le
    // pronostic tel qu'il a ete publie (publie: true, meme marche, meme fiabilite) ; il ne se
    // reecrit pas. Sans cela, un pari publie la veille pour le jour J perdait « publie » et
    // n'entrait jamais dans les tickets ni la Selection en or (lib/run-output/jambes-du-jour.js).
    if (estFige(opts, m) && aUneSelection(m) && estObjet(m.pronostic) && m.pronostic.publie === true && String(m.pronostic.market_id || "") === String(m.market_id || "")) {
      const pf = m.pronostic;
      delete m.selection_iashark;
      poserFiabiliteCotes(m, pf, ligues, cles);
      m.pronostic_dispo = true;
      if (pf.selection === true) m.selection_iashark = true;
      rapport.avec++;
      rapport.figes = (rapport.figes || 0) + 1;
      if (pf.selection) rapport.selections++;
      return;
    }
    const c3 = parFixture[String(m.id)];
    const p = choisirPronostic(m, { ligues: ligues, liguesParis: paris, selectionsCotes: cles, fourchette: F, chancesV3: c3 && estObjet(c3.marches) ? c3.marches : null });
    // Amorces PUBLIQUES (aucun chiffre, aucun marche) : selection_iashark (pastille
    // « ✓ Sélection IASHARK ») et fiabilite_cotes_marche (competition verifiee par la route des
    // cotes du marche, sans pari d'un autre calcul : la page ne dit plus « Fiabilité : en test »).
    delete m.selection_iashark;
    poserFiabiliteCotes(m, p, ligues, cles);
    if (!p) { delete m.pronostic; delete m.pronostic_dispo; rapport.sans++; return; }
    m.pronostic = p;
    m.pronostic_dispo = true;
    if (p.selection === true) m.selection_iashark = true;
    rapport.avec++;
    rapport.voies[p.voie]++;
    if (p.selection) rapport.selections++;
  });
  return rapport;
}

// =====================================================================================
// PARIS PUBLIES SUR CHAQUE MATCH (decision de Clement du 03/10/2026, 23 h : « les 30 avec des
// paris », coupes et selections comprises, sans periode de preuve), DANS LA FOURCHETTE DE COTE
// (exigence de Clement du 04/10/2026, 2 h : « des cotes entre 1,40 et 1,70 en sec ; toutes les
// cases remplies et justes ; c'est tout »).
//
// Le site du 29/09 affiche le pari d'un match a partir de pari_rec / market_id / cote_rec /
// model_probability (lib/match-view-model.js). publierPronostics() decide ce pari, UNE fois,
// pour CHAQUE match ouvert dont le pari n'est pas fige (pari du moteur v3, selection nationale,
// SAFE_PICK ou aucun pari jusque-la) :
//   - un PARI SIMPLE (jamais un combine) sur CHAQUE match ouvert non fige (exigence de Clement du
//     04/10/2026, 4 h : « il faut qu'il y ait un pari selectionne a TOUS les matchs, c'est simple ») ;
//   - CANDIDATS : tous les marches simples que le calcul sait chiffrer et verifier pour ce match :
//       a. voie « moteur v3 » : les marches 1N2 / double chance « vérifié sur le passé » du v3 (match
//          « couverture vérifiée », competition validee, jamais une selection nationale), chance = celle
//          du Canal Pro (le plus bas entre le v3 et la cote sans marge) ;
//       b. voie « cotes du marche » : les familles calibrees de la competition (famillesDuMatch :
//          ligues_validees_cotes_marche, sinon paris_cotes_marche ; plus les buts 1,5 / 2,5 / 3,5 et
//          « les deux marquent » des competitions mesurees de config/marches-valides.json, dans leur
//          tranche de chance), chance = cote sans marge (candidatsMarche) ;
//     jamais la voie « modele seul » (sa chance n'est pas mesuree) ; un meme marche n'est candidat
//     qu'une fois (celui du moteur v3 d'abord) ;
//   - COTE de chaque candidat (regle de Clement du 04/10/2026, 4 h 15, coteCandidat) : la meilleure cote
//     chez un agree ANJ quand elle est relevee, sinon la cote du marche des bookmakers d'API-Football
//     (« cote du marche », sans nom de bookmaker ; jamais bet365 ni Pinnacle). Sans cote reelle : pas
//     candidat (jamais de « cote minimum IASHARK ») ;
//   - CHOIX : parmi les candidats dont la cote est dans la fourchette (config/leagues.json#
//     fiabilite.fourchette_pari, 1,40-1,70 ; borne basse + marge_sans_agree pour une cote qui n'est pas
//     agreee), la plus grande chance CORRIGEE (corrections_chance, selon la source de la chance : modele
//     ou cotes du marche, SOURCE_CHANCE), puis la cote agreee, puis le moteur
//     v3, puis la chance calculee, la probabilite brute et l'ordre fixe des marches (jamais au hasard) ;
//   - REPLI (aucun candidat dans la fourchette ; avocat du diable, 04/10/2026) : parmi les paris simples
//     avec une cote reelle >= 1,20 (COTE_MIN) et une chance AFFICHEE (corrigee) >= 50 %, jamais le match
//     nul, la cote la plus proche de la fourchette ; aucun : le pari simple (jamais le nul) a la plus
//     grande chance affichee. Champ interne pronostic.hors_fourchette, AUCUNE etiquette visible (decision
//     de Clement) ; jamais un ticket, la Selection en or, une « Sélection IASHARK » ni le match offert ;
//   - PAS DE PARI seulement si le match n'a aucune cote reelle sur un marche candidat (raison
//     AUCUN_MARCHE_AVEC_COTE_REELLE) ; l'analyse et les donnees du match restent publiees.
// Le GEL reste prioritaire : un pari deja publie (figes) ne change pas jusqu'au coup d'envoi.
// TEXTES : un texte d'analyse ecrit pour un autre marche (ou pour « aucun pari ») ne reste
// jamais a cote du pari publie : les textes qui justifient un marche sont vides et les phrases
// « aucun pari » retirees (retirerTextesDuPari) ; la page retombe sur le contexte du match.
// alignerChancesAffichees() fait ensuite de model_probability la chance AFFICHEE (la meme que
// chance_iashark), corrigee quand une mesure dit qu'une categorie est trop optimiste : c'est la
// MEME correction que celle du classement ci-dessus (memes regles, meme cote).
// Garde-fous : aucune mise, aucune esperance, aucune promesse ; une correction ne monte jamais
// une chance.
// =====================================================================================

// Competitions a paris publies : { cle: [familles] } (seulement les cles de "leagues").
function liguesParis(configLigues) {
  const fia = (configLigues && configLigues.fiabilite) || {};
  const liste = estObjet(fia.paris_cotes_marche) ? fia.paris_cotes_marche : {};
  const out = {};
  ((configLigues && configLigues.leagues) || []).forEach(function (l) {
    if (l && Array.isArray(liste[l.key])) out[l.key] = liste[l.key].slice();
  });
  return out;
}

function familleDe(marketId) {
  const d = MARCHE[String(marketId || "")];
  return d ? d.famille : null;
}

// Correction (en points, <= 0) de la chance affichee : la plus forte baisse parmi les regles
// qui correspondent. ctx : { ligue, famille, option ("principale" | "cote"), chance (%), cote,
// source_chance ("modele" | "marche") }.
// source_chance (controle du mathematicien du 04/10/2026) : une regle « source_chance: modele » ne vaut
// QUE pour une chance tiree du modele (moteur v3 plus bas que la cote sans marge), jamais pour une chance
// tiree des cotes du marche (la correction « Argentine, double chance, -13 » venait du v3 seul, H-017 ;
// appliquee a la cote sans marge elle affichait 49,5 % pour 64,8 % reels). Source inconnue : « marche ».
// -> { points, source } (points = 0 : aucune regle).
function correctionChance(regles, ctx) {
  ctx = ctx || {};
  let best = { points: 0, source: null };
  (Array.isArray(regles) ? regles : []).forEach(function (r) {
    if (!r || typeof r !== "object") return;
    const pts = nombre(r.points);
    if (pts === null || pts >= 0) return;
    if (r.ligue && r.ligue !== "*" && String(r.ligue) !== String(ctx.ligue || "")) return;
    if (r.famille && r.famille !== "*" && String(r.famille) !== String(ctx.famille || "")) return;
    if (r.option && r.option !== "*" && String(r.option) !== String(ctx.option || "principale")) return;
    if (r.source_chance && r.source_chance !== "*" && String(r.source_chance) !== String(ctx.source_chance || SOURCE_CHANCE.MARCHE)) return;
    const ch = nombre(ctx.chance), co = nombre(ctx.cote);
    if (r.chance_min != null && !(ch !== null && ch >= Number(r.chance_min))) return;
    if (r.chance_max != null && !(ch !== null && ch <= Number(r.chance_max))) return;
    if (r.cote_min != null && !(co !== null && co >= Number(r.cote_min))) return;
    if (r.cote_max != null && !(co !== null && co <= Number(r.cote_max))) return;
    if (pts < best.points) best = { points: pts, source: r.source || null };
  });
  return best;
}
function reglesCorrection(configLigues) {
  const fia = (configLigues && configLigues.fiabilite) || {};
  return Array.isArray(fia.corrections_chance) ? fia.corrections_chance : [];
}
// Chance corrigee (entier, 1-99) ; jamais plus haute que la chance calculee.
function chanceCorrigee(chance, regles, ctx) {
  const c = nombre(chance);
  if (c === null || !(c > 0) || !(c < 100)) return null;
  const corr = correctionChance(regles, Object.assign({}, ctx, { chance: c }));
  const v = Math.max(1, Math.min(99, Math.round(c + corr.points)));
  return { chance: Math.min(v, Math.round(c)), calculee: Math.round(c), points: corr.points, source: corr.source };
}

function ligneDe(premiumRows, m) {
  return (premiumRows || []).find(function (r) { return r && String(r.fixture_id) === String(m.id); }) || null;
}
function estFige(opts, m) {
  return !!(opts && opts.figes && m && opts.figes[String(m.id)]);
}

// Raison publique (code, aucun chiffre) d'un match sans pari faute de marche dans la fourchette.
// Libelle : celui que les pages d'accueil traduisent deja dans les 9 langues
// (home_app.no_signal_label) ; la raison precise est dans no_signal_reason.
const RAISON_HORS_FOURCHETTE = "AUCUN_PARI_SIMPLE_DANS_LA_FOURCHETTE";
// Aucun marche candidat avec une cote reelle (ni agreee ni d'API-Football) : aucun pari possible.
const RAISON_SANS_COTE = "AUCUN_MARCHE_AVEC_COTE_REELLE";
const LIBELLE_SANS_PARI = "Aucun signal clair sur ce match";
// Textes qui JUSTIFIENT un marche (prompt de genAnalyse : « le marche deja retenu ») : vides des que
// le pari publie n'est plus celui pour lequel ils ont ete ecrits.
const TEXTES_DU_PARI = ["verdict_shark", "analyse_card", "conseil_public", "facteur_x"];
// Phrase d'un texte ecrit pour un match SANS pari (« aucun pari n'est retenu... ») : retiree des
// textes qui decrivent le match (contexte, lecture, scenario) quand un pari est finalement publie.
const PHRASE_SANS_PARI = /aucun pari|pas de pari|aucun march[ée]|n['’]est (?:retenu|publi)|ne remplit pas les conditions|conditions de publication/i;

function sansPhraseSansPari(t) {
  if (typeof t !== "string" || !PHRASE_SANS_PARI.test(t)) return t;
  return t.split(/(?<=[.!?…])\s+/).filter(function (p) { return !PHRASE_SANS_PARI.test(p); }).join(" ").trim();
}

// Vide les textes qui justifient un autre marche (match ET ligne premium, traductions comprises) ;
// retire les phrases « aucun pari » des textes du match. -> vrai si un texte a change.
function retirerTextesDuPari(m, row) {
  let change = false;
  TEXTES_DU_PARI.forEach(function (k) {
    if (typeof m[k] === "string" && m[k].trim()) change = true;
    if (k in m) m[k] = "";
    delete m[k + "_i18n"];
  });
  ["contexte", "lecture_match"].forEach(function (k) {
    const t = sansPhraseSansPari(m[k]);
    if (t !== m[k]) { m[k] = t; delete m[k + "_i18n"]; change = true; }
  });
  if (estObjet(m.scenario)) {
    const s = Object.assign({}, m.scenario);
    let ch = false;
    ["phase1", "phase2", "phase3"].forEach(function (p) { const t = sansPhraseSansPari(s[p]); if (t !== s[p]) { s[p] = t; ch = true; } });
    if (ch) { m.scenario = s; delete m.scenario_i18n; change = true; }
  }
  // Raisons du pari (raisons du moteur v3 ou « why » du marche du texte) : seulement les absences
  // cles du match, des faits vrais quel que soit le marche (comme un match sans pari au depart).
  m.decision_factors = (Array.isArray(m.key_absences) ? m.key_absences : []).filter(function (x) { return typeof x === "string" && x.trim(); }).slice(0, 3);
  if (row) {
    if (typeof row.verdict_shark === "string" && row.verdict_shark.trim()) change = true;
    if (typeof row.facteur_x === "string" && row.facteur_x.trim()) change = true;
    row.verdict_shark = ""; row.facteur_x = "";
    if (estObjet(row.raw_response)) {
      const raw = Object.assign({}, row.raw_response);
      ["verdict_shark", "analyse_card", "conseil", "facteur_x"].forEach(function (k) { if (k in raw) raw[k] = ""; });
      if (estObjet(raw.narrative_i18n)) { const ni = Object.assign({}, raw.narrative_i18n); delete ni.verdict_shark_i18n; delete ni.facteur_x_i18n; raw.narrative_i18n = ni; }
      row.raw_response = raw;
    }
  }
  return change;
}

// Voyant de composition seul (comme lib/moteur-v3.js#apresGel) : jamais une alerte de cote du
// moteur v3 qui parlerait d'un autre marche que le pari publie.
function suiviSansAutreMarche(m, cle) {
  if (m.v3_suivi && m.v3_suivi.cle && m.v3_suivi.cle !== cle) {
    m.v3_suivi = { cle: null, voyant: m.v3_suivi.voyant, compo_mise_a_jour_le: m.v3_suivi.compo_mise_a_jour_le, absents: m.v3_suivi.absents, probabilite_information: null, cote_observee: null, alerte_cote: null, heure: null };
  }
}

// Voie « moteur v3 » : marches 1N2 / DC verifies, chance du Canal Pro (memes conditions que
// choisirPronostic, etape 2), cote du marche candidat (coteCandidat).
function candidatsV3(m, ctx, livres) {
  const f3 = estObjet(m.v3_fiabilite) ? m.v3_fiabilite : null;
  if (!ctx.chancesV3 || !f3 || f3.couverture !== "vérifiée" || m.league_reliability === "en_test" || !Array.isArray(m.v3_marches) || SELECTIONS.estSelectionNationale(m)) return [];
  const verifies = {};
  m.v3_marches.forEach(function (mk) { if (mk && mk.fiabilite_marche === VERIFIE && mk.etiquette === VERIFIE && mk.market_id) verifies[mk.market_id] = nombre(mk.probabilite); });
  const actuel = aUneSelection(m) ? String(m.market_id || "") : "";
  const qMarche = sansMargeDesCotes(m);
  const qAnj = livres ? COTE_ANJ.sansMargeAnj(livres) : {};
  const out = [];
  ORDRE.forEach(function (id) {
    if (!((MARCHE[id].famille === "1N2" || MARCHE[id].famille === "DC") && verifies[id] != null)) return;
    const ch = nombre(ctx.chancesV3[MARCHE[id].cle_v3]);
    const k = coteCandidat(m, id, livres);
    if (!k || ch === null || !(ch > 0 && ch < 100)) return;
    // Chance du Canal Pro = le plus bas entre le v3 et la cote sans marge : elle vient du MODELE seulement
    // quand la cote sans marge est plus haute (ou absente) ; sinon c'est la cote du marche (source_chance).
    const q = k.anj && k.sans_marge != null ? k.sans_marge : (qMarche[id] != null ? qMarche[id] : (qAnj[id] != null ? qAnj[id] : null));
    const sourceChance = q !== null && q > 0 && q < 100 && Math.round(q) <= Math.round(ch) ? SOURCE_CHANCE.MARCHE : SOURCE_CHANCE.MODELE;
    out.push({ market_id: id, chance: Math.round(ch), brute: verifies[id], voie: VOIE.V3, fiabilite: FIABILITE.VERIFIEE, selection_possible: true,
      source: id === actuel && m.chance_iashark_source ? m.chance_iashark_source : CHANCE.SOURCE_AVEC_COTE, source_chance: sourceChance, k: k });
  });
  return out;
}
// Le pari du match (voir l'en-tete) : { ...candidat, cote, cote_anj, bookmaker, sans_marge, chance_affichee,
// hors_fourchette } ou null. info (facultatif) recoit { candidats } (nombre de marches avec une cote reelle).
function choisirPariFourchette(m, ctx, info) {
  const livres = ctx.livres || null;
  const v3 = candidatsV3(m, ctx, livres);
  const vus = {};
  v3.forEach(function (c) { vus[c.market_id] = true; });
  const tous = v3.concat(candidatsMarche(m, ctx, livres).filter(function (c) { return !vus[c.market_id]; }));
  const evalues = [];
  tous.forEach(function (c) {
    if (!c || c.chance === null || !c.k) return;
    const corr = chanceCorrigee(c.chance, ctx.regles, { ligue: m.league_key, famille: MARCHE[c.market_id].famille, option: "principale", cote: c.k.cote, source_chance: c.source_chance || SOURCE_CHANCE.MARCHE });
    if (!corr) return;
    const fo = fourchetteDe(c.k, ctx.fourchette);
    const ecart = c.k.cote < fo.cote_min ? fo.cote_min - c.k.cote : (c.k.cote > fo.cote_max ? c.k.cote - fo.cote_max : 0);
    evalues.push(Object.assign({}, c, { cote: c.k.cote, cote_anj: c.k.anj, bookmaker: c.k.bookmaker, sans_marge: c.k.sans_marge,
      chance_affichee: corr.chance, dedans: dansFourchetteCandidat(c.k, ctx.fourchette), ecart: Math.round(ecart * 100) / 100 }));
  });
  if (info) info.candidats = evalues.length;
  const ordre = function (a, b) {
    return (b.chance_affichee - a.chance_affichee) || ((b.cote_anj ? 1 : 0) - (a.cote_anj ? 1 : 0)) || ((a.voie === VOIE.V3 ? 0 : 1) - (b.voie === VOIE.V3 ? 0 : 1))
      || (b.chance - a.chance) || ((b.brute || 0) - (a.brute || 0)) || (ORDRE.indexOf(a.market_id) - ORDRE.indexOf(b.market_id));
  };
  const dedans = evalues.filter(function (c) { return c.dedans; }).sort(ordre);
  if (dedans.length) return Object.assign(dedans[0], { hors_fourchette: false });
  // REPLI (aucune cote dans la fourchette ; controle de l'avocat du diable du 04/10/2026) :
  //   1. parmi les paris simples avec une cote reelle >= 1,20 (COTE_MIN) ET une chance AFFICHEE (corrigee)
  //      >= 50 % (CHANCE_MIN), jamais le match nul : la cote la plus proche de la fourchette ;
  //   2. aucun : le pari simple (jamais le match nul) a la plus grande chance AFFICHEE.
  // Jamais un « coup » a 32-49 % parce qu'il est plus pres de la fourchette. Aucune etiquette visible
  // (decision de Clement : « tu mets un pari peu importe et aucune etiquette ») ; le champ interne
  // pronostic.hors_fourchette l'ecarte des tickets, de la Selection en or, de la « Sélection IASHARK » et
  // du match offert.
  const sansNul = evalues.filter(function (c) { return c.market_id !== "draw"; });
  const repli = sansNul.filter(function (c) { return Math.round(c.cote * 100) >= Math.round(COTE_MIN * 100) && c.chance_affichee >= CHANCE_MIN; })
    .sort(function (a, b) { return (a.ecart - b.ecart) || ordre(a, b); });
  if (repli.length) return Object.assign(repli[0], { hors_fourchette: true });
  const plusProbable = sansNul.slice().sort(ordre);
  return plusProbable.length ? Object.assign(plusProbable[0], { hors_fourchette: true }) : null;
}

// Aucun pari possible : le match garde son analyse (probabilites, forme, compositions, arbitre...), seul
// le pari est retire (match ET ligne premium).
function retirerPari(m, row, raison) {
  m.pari_rec = "";
  m.market_id = null;
  m.marche = "RESULTAT";
  m.cote_rec = "";
  m.odds_available = false;
  m.pick_downgrade = "";
  m.risque = computeRiskLabel(null);
  m.paris_safe = { bet: "", cote: null, proba: "" };
  m.no_signal = true;
  m.no_signal_reason = raison || RAISON_HORS_FOURCHETTE;
  m.no_signal_label = LIBELLE_SANS_PARI;
  ["model_probability", "conf", "chance_iashark", "chance_iashark_source", "cote_bookmaker", "cote_source", "cote_releve_a", "sans_marge_anj",
    "is_canonical_pick", "v3_pari", "pronostic", "pronostic_dispo", "selection_iashark", "selection_voie", "option_cote", "chance_correction",
    "pick_frozen_at", "has_signal"].forEach(function (k) { delete m[k]; });
  suiviSansAutreMarche(m, null);
  if (row) {
    row.pari_rec = ""; row.cote_rec = null; row.market_id = null; row.marche = null; row.model_probability = null;
    row.kelly = "0"; row.edge = "";
    if (estObjet(row.raw_response) && "pick_freeze" in row.raw_response) { const raw = Object.assign({}, row.raw_response); delete raw.pick_freeze; row.raw_response = raw; }
  }
}

// Contexte commun (publierPronostics, poserOptionCote) : bornes, familles, corrections.
function contexteParis(opts) {
  const cfg = opts.configLigues;
  return {
    fourchette: opts.fourchette || fourchettePari(cfg),
    ligues: opts.ligues || liguesCotesMarche(cfg),
    paris: opts.liguesParis || liguesParis(cfg),
    cles: opts.selectionsCotes || clesSelectionsCotes(cfg),
    regles: opts.regles || reglesCorrection(cfg),
    flux: opts.famillesFlux || famillesFlux(opts.marchesValides || require("../config/marches-valides.json")),
  };
}

// Decide et pose le pari publie de chaque match ouvert non fige (voir l'en-tete).
// opts : { configLigues, figes, chancesV3Par (lib/moteur-v3.js#chancesPourCanal), texteMarche
// ({ "<fixture>": market_id pour lequel les textes ont ete ecrits, "" = aucun pari }), cotesAnjPar
// ({ "<fixture>": livres des agrees, lib/cote-anj.js#releverLivresAnj, en memoire seulement }),
// relevesAnj ({ "<fixture>": heure ISO de l'appel de la competition qui a rendu ses livres }),
// relevesAnjEvenement ({ "<fixture>": heure ISO de l'appel par match : double chance, les deux marquent }),
// releveAnjA (repli), nowIso, marchesValides }.
// -> { publies, gardes, changes, nouveaux, dans_fourchette, hors_fourchette, sans_pari, sans_cote, retires,
//      figes, textes_retires, cote_agreee, cote_marche } (compteurs).
function publierPronostics(matchs, premiumRows, opts) {
  opts = opts || {};
  const ctx = contexteParis(opts);
  const parFixture = opts.chancesV3Par || {};
  const livresPar = estObjet(opts.cotesAnjPar) ? opts.cotesAnjPar : {};
  const texteMarche = estObjet(opts.texteMarche) ? opts.texteMarche : null;
  const nowIso = opts.nowIso || new Date().toISOString();
  const rapport = { publies: 0, gardes: 0, changes: 0, nouveaux: 0, dans_fourchette: 0, hors_fourchette: 0, sans_pari: 0, sans_cote: 0, retires: 0, figes: 0,
    textes_retires: 0, cote_agreee: 0, cote_marche: 0 };
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object" || m.id == null || estFerme(m)) return;
    if (estFige(opts, m)) { rapport.figes++; return; }
    const cle = String(m.id);
    const c3 = parFixture[cle];
    const livres = livresPar[cle] || null;
    const avant = aUneSelection(m) ? String(m.market_id || "") : "";
    // Marche pour lequel les textes d'analyse ont ete ecrits (inconnu : le pari present).
    const texte = texteMarche && Object.prototype.hasOwnProperty.call(texteMarche, cle) ? String(texteMarche[cle] || "") : avant;
    // Selection IASHARK avant la fourchette (meme condition que choisirPronostic, etape 1, sans la cote).
    const etaitSelection = aUneSelection(m) && (m.league_reliability !== "en_test" || selectionCotesMarche(m, ctx.cles));
    const etaitV3 = aUneSelection(m) && !!(estObjet(m.v3_pari) && m.moteur_v3 && m.moteur_v3.source === "v3" && String(m.v3_pari.market_id) === avant);
    const row = ligneDe(premiumRows, m);
    const info = {};
    const b = choisirPariFourchette(m, Object.assign({}, ctx, { livres: livres, chancesV3: c3 && estObjet(c3.marches) ? c3.marches : null }), info);
    if (!b) {
      if (avant) rapport.retires++;
      retirerPari(m, row, info.candidats ? RAISON_HORS_FOURCHETTE : RAISON_SANS_COTE);
      if (texte && retirerTextesDuPari(m, row)) rapport.textes_retires++;
      poserFiabiliteCotes(m, null, ctx.ligues, ctx.cles);
      rapport.sans_pari++;
      if (!info.candidats) rapport.sans_cote++;
      return;
    }
    const garde = avant !== "" && avant === b.market_id;
    const def = MARCHE[b.market_id];
    if (!garde) m.pari_rec = def.marche;
    m.market_id = b.market_id;
    m.marche = categorie(b.market_id);
    m.cote_rec = b.cote.toFixed(2);
    // Cote affichee : agreee (avec le nom de l'agree) ou cote du marche d'API-Football (aucun nom).
    if (b.cote_anj) {
      m.cote_bookmaker = b.bookmaker; m.cote_source = "anj";
      // Heure REELLE des cotes (ingenieur donnees, 04/10/2026) : celle de l'appel The Odds API qui a rendu
      // les livres de CE match (lib/odds-api-econome.js#cotesCompetition), jamais l'heure de la relecture.
      if (livres) {
        const heureComp = estObjet(opts.relevesAnj) ? opts.relevesAnj[cle] : null;
        const heureEv = estObjet(opts.relevesAnjEvenement) ? opts.relevesAnjEvenement[cle] : null;
        m.cote_releve_a = COTE_ANJ.heureDuMarche(b.market_id, heureComp, heureEv) || opts.releveAnjA || nowIso;
        m.sans_marge_anj = COTE_ANJ.sansMargeAnj(livres);
      }
      rapport.cote_agreee++;
    } else { m.cote_bookmaker = null; m.cote_source = "indicative"; delete m.cote_releve_a; delete m.sans_marge_anj; rapport.cote_marche++; }
    m.odds_available = true;
    m.pick_downgrade = "";
    m.risque = computeRiskLabel(b.cote);
    m.model_probability = b.chance;
    m.conf = Math.round(b.chance) / 10;
    m.chance_iashark = b.chance;
    m.chance_iashark_source = b.source || null;
    m.model_output_available = true;
    m.no_signal = false;
    m.no_signal_label = "";
    delete m.no_signal_reason;
    delete m.has_signal;
    delete m.chance_correction;
    if (!garde) delete m.is_canonical_pick;
    // Champ v3_pari (historique « moteur v3 », match offert) : seulement le pari du moteur v3 lui-meme.
    if (!(garde && etaitV3)) { delete m.v3_pari; suiviSansAutreMarche(m, null); }
    if (b.voie === VOIE.COTES_MARCHE) m.selection_voie = "cotes_marche";
    else if (garde && etaitV3) delete m.selection_voie;
    else m.selection_voie = "v3_pronostic";
    m.paris_safe = { bet: m.pari_rec, cote: b.cote, proba: Math.round(b.chance) + "%" };
    if (texte !== b.market_id && retirerTextesDuPari(m, row)) rapport.textes_retires++;
    // « Sélection IASHARK » : jamais un pari hors fourchette ; famille verifiee de la competition (ou moteur v3).
    const selection = !b.hors_fourchette && etaitSelection && b.selection_possible === true && (b.voie === VOIE.V3 || selectionCotesMarche(m, ctx.cles));
    m.pronostic = {
      market_id: b.market_id, marche: def.marche, libelle_fr: libelleFr(b.market_id, m),
      chance: b.chance, cote: b.cote, voie: selection ? VOIE.SELECTION : b.voie, moteur: b.voie === VOIE.V3 ? "v3" : "cotes_marche",
      fiabilite: b.fiabilite, selection: selection, source: b.source || null, publie: true,
      cote_source: b.cote_anj ? "anj" : "marche", bookmaker: b.cote_anj ? b.bookmaker : null, hors_fourchette: b.hors_fourchette === true,
      source_chance: b.source_chance || SOURCE_CHANCE.MARCHE,
    };
    m.pronostic_dispo = true;
    if (selection) m.selection_iashark = true; else delete m.selection_iashark;
    poserFiabiliteCotes(m, m.pronostic, ctx.ligues, ctx.cles);
    if (!m.pick_frozen_at) m.pick_frozen_at = nowIso;
    if (row) {
      row.pari_rec = m.pari_rec; row.market_id = m.market_id; row.marche = m.marche; row.cote_rec = b.cote; row.model_probability = b.chance;
      if (!garde) { row.kelly = "0"; row.edge = ""; }
      const raw = estObjet(row.raw_response) ? row.raw_response : {};
      if (!estObjet(raw.pick_freeze)) {
        row.raw_response = Object.assign({}, raw, { pick_freeze: { frozen_at: m.pick_frozen_at, kickoff: m.date || null,
          public: { model_output_available: true, data_quality_score: m.data_quality_score, data_quality_label: m.data_quality_label, market_source: m.market_source } } });
      }
    }
    rapport.publies++;
    if (b.hors_fourchette) rapport.hors_fourchette++; else rapport.dans_fourchette++;
    if (garde) rapport.gardes++; else if (avant) rapport.changes++; else rapport.nouveaux++;
  });
  return rapport;
}

// Source de la chance du pari publie : celle que publierPronostics a notee dans le pronostic du meme
// marche ; sinon « modele » seulement quand aucune cote sans marge n'a servi (lib/chance-iashark.js).
function sourceChanceDuPari(m) {
  if (estObjet(m.pronostic) && String(m.pronostic.market_id || "") === String(m.market_id || "") && m.pronostic.source_chance) return m.pronostic.source_chance;
  return m.chance_iashark_source === CHANCE.SOURCE_MODELE ? SOURCE_CHANCE.MODELE : SOURCE_CHANCE.MARCHE;
}

// model_probability = chance affichee (chance_iashark), corrigee si besoin, sur chaque pari non
// fige ; meme chiffre sur la ligne premium, dans conf et dans le pronostic du meme marche.
// -> { alignes, corriges }.
function alignerChancesAffichees(matchs, premiumRows, opts) {
  opts = opts || {};
  const regles = opts.regles || reglesCorrection(opts.configLigues);
  const rapport = { alignes: 0, corriges: 0 };
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object" || m.id == null || !aUneSelection(m) || estFige(opts, m)) return;
    if (estObjet(m.chance_correction)) return; // deja fait ce run
    const base = nombre(m.chance_iashark) !== null ? nombre(m.chance_iashark) : nombre(m.model_probability);
    const c = chanceCorrigee(base, regles, { ligue: m.league_key, famille: familleDe(m.market_id), option: "principale", cote: nombre(m.cote_rec), source_chance: sourceChanceDuPari(m) });
    if (!c) return;
    m.model_probability = c.chance;
    m.chance_iashark = c.chance;
    m.conf = Math.round(c.chance) / 10;
    if (c.points < 0) { m.chance_correction = { calculee: c.calculee, points: c.points, source: c.source }; rapport.corriges++; }
    else m.chance_correction = { calculee: c.calculee, points: 0, source: null };
    if (estObjet(m.pronostic) && m.pronostic.market_id === m.market_id) m.pronostic.chance = c.chance;
    // paris_safe (envoye aux abonnes par match-data) : la meme chance que la page (point du trader, 04/10/2026).
    if (estObjet(m.paris_safe) && String(m.paris_safe.bet || "").trim()) m.paris_safe = Object.assign({}, m.paris_safe, { proba: c.chance + "%" });
    const row = ligneDe(premiumRows, m);
    if (row) row.model_probability = c.chance;
    rapport.alignes++;
  });
  return rapport;
}

// OPTION « COTE PLUS HAUTE » (regle A du mathematicien, choisie par Clement le 03/10/2026) :
// parmi les issues dont la chance calculee est >= 70 %, celle qui a la plus grosse cote ;
// jamais le marche du pari principal. Sources : marches verifies du moteur v3 (v3_marches,
// etiquette « vérifié sur le passé ») pour ses matchs, sinon cotes du marche sans marge
// (familles de paris_cotes_marche). La chance AFFICHEE est corrigee (regle A trop optimiste :
// Premier League 71,0 % annonces, 64,6 % reels), cote minimum = 1 / chance affichee.
// Fourchette (04/10/2026) : la cote de l'option est, elle aussi, dans config/leagues.json#fiabilite.fourchette_pari
// (« des cotes entre 1,40 et 1,70 en sec ») ; aucune issue dans la fourchette : pas d'option.
// Champ PREMIUM option_cote (jamais public hors match offert). -> nombre d'options posees.
const OPTION_COTE = Object.freeze({ chance_min: 70 });
// Meme regle que le pari publie (04/10/2026) : cote agreee d'abord, sinon cote du marche d'API-Football
// (borne basse relevee de la marge) ; memes familles calibrees (famillesDuMatch) hors moteur v3.
function candidatsOptionCote(m, ctx, livres) {
  const out = [];
  const v3 = Array.isArray(m.v3_marches) ? m.v3_marches : null;
  if (v3 && v3.length) {
    const q = sansMargeDesCotes(m);
    v3.forEach(function (mk) {
      if (!mk || !MARCHE[mk.market_id] || mk.fiabilite_marche !== VERIFIE || mk.etiquette !== VERIFIE) return;
      const p = nombre(mk.probabilite);
      const k = coteCandidat(m, mk.market_id, livres);
      if (p === null || !k) return;
      const qq = q[mk.market_id] != null ? q[mk.market_id] : null;
      const c = CHANCE.chanceIashark(p, qq);
      const sourceChance = qq !== null && Math.round(qq) <= Math.round(p) ? SOURCE_CHANCE.MARCHE : SOURCE_CHANCE.MODELE;
      if (c) out.push({ market_id: mk.market_id, chance: c.chance, source: c.source, source_chance: sourceChance, voie: VOIE.V3, k: k });
    });
    return out;
  }
  return candidatsMarche(m, ctx, livres);
}
function poserOptionCote(matchs, opts) {
  opts = opts || {};
  const ctx = contexteParis(opts);
  const livresPar = estObjet(opts.cotesAnjPar) ? opts.cotesAnjPar : {};
  let n = 0;
  (matchs || []).forEach(function (m) {
    if (!m || typeof m !== "object") return;
    delete m.option_cote;
    if (estFerme(m) || !aUneSelection(m)) return;
    const cands = candidatsOptionCote(m, ctx, livresPar[String(m.id)] || null).filter(function (c) {
      return c.market_id !== m.market_id && c.chance >= OPTION_COTE.chance_min && dansFourchetteCandidat(c.k, ctx.fourchette);
    });
    if (!cands.length) return;
    cands.sort(function (a, b) {
      return (b.k.cote - a.k.cote) || (a.chance - b.chance) || ((b.k.anj ? 1 : 0) - (a.k.anj ? 1 : 0)) || (ORDRE.indexOf(a.market_id) - ORDRE.indexOf(b.market_id));
    });
    const b = cands[0];
    const k = b.k.cote;
    const c = chanceCorrigee(b.chance, ctx.regles, { ligue: m.league_key, famille: familleDe(b.market_id), option: "cote", cote: k, source_chance: b.source_chance || SOURCE_CHANCE.MARCHE });
    if (!c) return;
    m.option_cote = {
      market_id: b.market_id, marche: MARCHE[b.market_id].marche, libelle_fr: libelleFr(b.market_id, m),
      chance: c.chance, chance_calculee: c.calculee, correction: c.points < 0 ? { points: c.points, source: c.source } : null,
      cote: k, cote_source: b.k.anj ? "anj" : "marche", bookmaker: b.k.anj ? b.k.bookmaker : null,
      cote_minimum: Math.round((100 / c.chance) * 100) / 100, voie: b.voie, source: b.source,
    };
    n++;
  });
  return n;
}

module.exports = {
  FIABILITE: FIABILITE,
  VOIE: VOIE,
  SOURCE_CHANCE: SOURCE_CHANCE,
  MARCHE: MARCHE,
  libelleFr: libelleFr,
  sansMargePuissance: sansMargePuissance,
  sansMargeDesCotes: sansMargeDesCotes,
  liguesCotesMarche: liguesCotesMarche,
  choisirPronostic: choisirPronostic,
  poserPronostics: poserPronostics,
  aUneSelection: aUneSelection,
  COTE_MIN: COTE_MIN,
  FOURCHETTE_SELECTION: FOURCHETTE_SELECTION,
  fourchettePari: fourchettePari,
  dansFourchette: dansFourchette,
  RAISON_HORS_FOURCHETTE: RAISON_HORS_FOURCHETTE,
  RAISON_SANS_COTE: RAISON_SANS_COTE,
  choisirPariFourchette: choisirPariFourchette,
  coteCandidat: coteCandidat,
  famillesFlux: famillesFlux,
  famillesDuMatch: famillesDuMatch,
  retirerTextesDuPari: retirerTextesDuPari,
  clesSelectionsCotes: clesSelectionsCotes,
  selectionCotesMarche: selectionCotesMarche,
  poserSelectionsNationales: poserSelectionsNationales,
  liguesParis: liguesParis,
  correctionChance: correctionChance,
  chanceCorrigee: chanceCorrigee,
  publierPronostics: publierPronostics,
  alignerChancesAffichees: alignerChancesAffichees,
  OPTION_COTE: OPTION_COTE,
  poserOptionCote: poserOptionCote,
};
