"use strict";
// MARCHES DU PARI ET COHERENCE ENTRE LES SELECTIONS (demande de Clement du 06/10/2026, soir :
// « Je veux plein de marches, il choisit le meilleur, c'est tout. »)
//
// 1. CATALOGUE : chaque marche que le site sait CHIFFRER (moteur v3 ou cote sans marge du flux
//    API-Football), AFFICHER (lib/market-labels.js, 7 langues) et REGLER (lib/resolvers.js, avec le
//    score final, le score a la pause et les statistiques du match d'API-Football). Un marche absent
//    d'ici n'est jamais un pari publie (regle : « un marche qu'on ne sait pas regler n'est jamais publie »).
//    Pour chaque marche :
//      - id (market_id du site), famille (calibration, categories NO-GO du mathematicien), categorie
//        (champ « marche » du match) ;
//      - marche : le libelle MOTEUR ecrit dans pari_rec et dans l'historique (« prediction ») : c'est
//        lui que lib/resolvers.js#resolveMarketWin lit pour regler le pari ;
//      - v3 : la cle du moteur v3 du meme pari (« MT_TOTAL:plus0.5 »), ou null ;
//      - flux : { bet_id, value } du meme pari dans le flux de cotes API-Football
//        (supabase/functions/_shared/marches-flux.mjs#CATALOGUE), ou null ;
//      - dim (« buts », « tirs_cadres », « tirs ») et ft (vrai si seul le score FINAL compte) ;
//      - test(o) : le pari gagne-t-il pour l'issue o ? o = { h1, a1, h2, a2 } (buts par equipe et par
//        mi-temps) pour les buts, { n } pour les tirs. Sert a la coherence (point 2), jamais au reglement.
//    Exclus (et pourquoi) : rembourse si nul et handicaps (remboursement, ligne entiere ou quart), score
//    exact, mi-temps/fin, premier but, corners et cartons (marches restes faux apres recalibration dans
//    plusieurs championnats, statistiques de reglement non branchees), « meme match », buteurs (bloc a
//    part), « le plus de tirs » (reglement par equipe non branche).
//
// 2. COHERENCE (exigence de Clement : « une jambe de combine ou une Selection en or ne contredit jamais
//    le pari affiche sur la page du match ni une autre selection du jour ») :
//      - meme marche : coherent ;
//      - IMPLICATION exacte (table explicite, calculee sur toutes les issues) : si A gagne, B gagne
//        (« plus de 2,5 » -> « plus de 1,5 » ; « Lens gagne » -> « Lens marque ») ;
//      - GRILLE DES SCORES du moteur v3 (marches SCORE:x-y du match) quand les deux paris ne dependent
//        que du score final : P(B | A) ;
//      - niveau « jambe » (combines) : P(B | A) >= seuil (config/tickets.json#coherence.seuil_jambe) ;
//        niveau « or » (Selection en or) : aucune dependance negative, P(B | A) >= P(B) ;
//      - rien de tout cela (tirs contre buts, mi-temps sans implication, pas de grille) : INCOHERENT par
//        prudence (jamais deux selections dont on ne sait pas dire qu'elles vont dans le meme sens).

const VERIFIE = "vérifié sur le passé";

function fr(x) { return String(Number(x)).replace(".", ","); }
function suffixeButs(l) { return String(l).replace(".", ""); } // 2.5 -> "25", 0.5 -> "05"
function suffixeTirs(l) { return String(l).replace(".", "_"); } // 8.5 -> "8_5"
function mot(l, un, plusieurs) { return Number(l) < 2 ? un : plusieurs; }
function H(o) { return o.h1 + o.h2; }
function A(o) { return o.a1 + o.a2; }

const CATALOGUE = {};
function ajouter(def) { CATALOGUE[def.id] = Object.freeze(def); }

// --- Resultat et double chance (match) ---
ajouter({ id: "home-win", famille: "1N2", categorie: "RESULTAT", marche: "Victoire Domicile", v3: "1N2:1", flux: { bet_id: 1, value: "Home" }, dim: "buts", ft: true, test: (o) => H(o) > A(o), libelle: (d) => "Victoire " + d });
ajouter({ id: "draw", famille: "1N2", categorie: "RESULTAT", marche: "Match nul", v3: "1N2:N", flux: { bet_id: 1, value: "Draw" }, dim: "buts", ft: true, test: (o) => H(o) === A(o), libelle: () => "Match nul" });
ajouter({ id: "away-win", famille: "1N2", categorie: "RESULTAT", marche: "Victoire Exterieur", v3: "1N2:2", flux: { bet_id: 1, value: "Away" }, dim: "buts", ft: true, test: (o) => A(o) > H(o), libelle: (d, e) => "Victoire " + e });
ajouter({ id: "dc-1x", famille: "DC", categorie: "DOUBLE_CHANCE", marche: "DC 1X", v3: "DC:1N", flux: { bet_id: 12, value: "Home/Draw" }, dim: "buts", ft: true, test: (o) => H(o) >= A(o), libelle: (d) => d + " ou match nul" });
ajouter({ id: "dc-x2", famille: "DC", categorie: "DOUBLE_CHANCE", marche: "DC X2", v3: "DC:N2", flux: { bet_id: 12, value: "Draw/Away" }, dim: "buts", ft: true, test: (o) => A(o) >= H(o), libelle: (d, e) => "Match nul ou " + e });
ajouter({ id: "dc-12", famille: "DC", categorie: "DOUBLE_CHANCE", marche: "DC 12", v3: "DC:12", flux: { bet_id: 12, value: "Home/Away" }, dim: "buts", ft: true, test: (o) => H(o) !== A(o), libelle: (d, e) => d + " ou " + e + " (pas de match nul)" });

// --- Nombre de buts du match (0,5 a 4,5) ---
[0.5, 1.5, 2.5, 3.5, 4.5].forEach(function (l) {
  ajouter({ id: "over-" + suffixeButs(l), famille: "OU" + l, categorie: "TOTAL_BUTS", marche: "Over " + l, v3: "TOTAL:plus" + l, flux: { bet_id: 5, value: "Over " + l }, dim: "buts", ft: true,
    test: (o) => H(o) + A(o) > l, libelle: () => "Plus de " + fr(l) + " " + mot(l, "but", "buts") });
  ajouter({ id: "under-" + suffixeButs(l), famille: "OU" + l, categorie: "TOTAL_BUTS", marche: "Under " + l, v3: "TOTAL:moins" + l, flux: { bet_id: 5, value: "Under " + l }, dim: "buts", ft: true,
    test: (o) => H(o) + A(o) < l, libelle: () => "Moins de " + fr(l) + " " + mot(l, "but", "buts") });
});

// --- Les deux equipes marquent ---
ajouter({ id: "btts-yes", famille: "BTTS", categorie: "BTTS", marche: "BTTS Oui", v3: "BTTS:oui", flux: { bet_id: 8, value: "Yes" }, dim: "buts", ft: true, test: (o) => H(o) > 0 && A(o) > 0, libelle: () => "Les deux équipes marquent" });
ajouter({ id: "btts-no", famille: "BTTS", categorie: "BTTS", marche: "BTTS Non", v3: "BTTS:non", flux: { bet_id: 8, value: "No" }, dim: "buts", ft: true, test: (o) => H(o) === 0 || A(o) === 0, libelle: () => "Au moins une équipe ne marque pas" });

// --- Buts d'une equipe (« telle equipe marque » = plus de 0,5 but) ---
[["home", "DOM", "Domicile", 16, H], ["away", "EXT", "Exterieur", 17, A]].forEach(function (t) {
  [0.5, 1.5, 2.5].forEach(function (l) {
    const qui = t[0] === "home" ? function (d) { return d; } : function (d, e) { return e; };
    ajouter({ id: t[0] + "-team-over-" + suffixeButs(l), famille: "BUTS_" + t[1], categorie: "BUTS_EQUIPE", marche: t[2] + " plus de " + l + " " + mot(l, "but", "buts"),
      v3: "EQUIPE_" + t[1] + ":plus" + l, flux: { bet_id: t[3], value: "Over " + l }, dim: "buts", ft: true, test: (o) => t[4](o) > l,
      libelle: (d, e) => (l === 0.5 ? qui(d, e) + " marque au moins un but" : qui(d, e) + " : plus de " + fr(l) + " " + mot(l, "but", "buts")) });
    ajouter({ id: t[0] + "-team-under-" + suffixeButs(l), famille: "BUTS_" + t[1], categorie: "BUTS_EQUIPE", marche: t[2] + " moins de " + l + " " + mot(l, "but", "buts"),
      v3: "EQUIPE_" + t[1] + ":moins" + l, flux: { bet_id: t[3], value: "Under " + l }, dim: "buts", ft: true, test: (o) => t[4](o) < l,
      libelle: (d, e) => (l === 0.5 ? qui(d, e) + " ne marque pas" : qui(d, e) + " : moins de " + fr(l) + " " + mot(l, "but", "buts")) });
  });
});

// --- 1re mi-temps : buts, resultat, double chance ---
[0.5, 1.5, 2.5].forEach(function (l) {
  ajouter({ id: "fh-over-" + suffixeButs(l), famille: "MT1_BUTS", categorie: "MI_TEMPS", marche: "Premiere mi-temps plus de " + l + " " + mot(l, "but", "buts"), v3: "MT_TOTAL:plus" + l,
    flux: { bet_id: 6, value: "Over " + l }, dim: "buts", ft: false, test: (o) => o.h1 + o.a1 > l, libelle: () => "1re mi-temps : plus de " + fr(l) + " " + mot(l, "but", "buts") });
  ajouter({ id: "fh-under-" + suffixeButs(l), famille: "MT1_BUTS", categorie: "MI_TEMPS", marche: "Premiere mi-temps moins de " + l + " " + mot(l, "but", "buts"), v3: "MT_TOTAL:moins" + l,
    flux: { bet_id: 6, value: "Under " + l }, dim: "buts", ft: false, test: (o) => o.h1 + o.a1 < l, libelle: () => "1re mi-temps : moins de " + fr(l) + " " + mot(l, "but", "buts") });
});
ajouter({ id: "fh-home-win", famille: "MT1_1N2", categorie: "MI_TEMPS", marche: "Premiere mi-temps victoire domicile", v3: "MT:1", flux: { bet_id: 13, value: "Home" }, dim: "buts", ft: false, test: (o) => o.h1 > o.a1, libelle: (d) => "1re mi-temps : " + d + " mène" });
ajouter({ id: "fh-draw", famille: "MT1_1N2", categorie: "MI_TEMPS", marche: "Premiere mi-temps match nul", v3: "MT:N", flux: { bet_id: 13, value: "Draw" }, dim: "buts", ft: false, test: (o) => o.h1 === o.a1, libelle: () => "1re mi-temps : égalité" });
ajouter({ id: "fh-away-win", famille: "MT1_1N2", categorie: "MI_TEMPS", marche: "Premiere mi-temps victoire exterieur", v3: "MT:2", flux: { bet_id: 13, value: "Away" }, dim: "buts", ft: false, test: (o) => o.a1 > o.h1, libelle: (d, e) => "1re mi-temps : " + e + " mène" });
ajouter({ id: "fh-dc-1x", famille: "MT1_DC", categorie: "MI_TEMPS", marche: "Premiere mi-temps DC 1X", v3: null, flux: { bet_id: 20, value: "Home/Draw" }, dim: "buts", ft: false, test: (o) => o.h1 >= o.a1, libelle: (d) => "1re mi-temps : " + d + " ou égalité" });
ajouter({ id: "fh-dc-x2", famille: "MT1_DC", categorie: "MI_TEMPS", marche: "Premiere mi-temps DC X2", v3: null, flux: { bet_id: 20, value: "Draw/Away" }, dim: "buts", ft: false, test: (o) => o.a1 >= o.h1, libelle: (d, e) => "1re mi-temps : égalité ou " + e });
ajouter({ id: "fh-dc-12", famille: "MT1_DC", categorie: "MI_TEMPS", marche: "Premiere mi-temps DC 12", v3: null, flux: { bet_id: 20, value: "Home/Away" }, dim: "buts", ft: false, test: (o) => o.h1 !== o.a1, libelle: (d, e) => "1re mi-temps : " + d + " ou " + e + " mène" });

// --- 2e mi-temps : buts ---
[0.5, 1.5].forEach(function (l) {
  ajouter({ id: "sh-over-" + suffixeButs(l), famille: "MT2_BUTS", categorie: "MI_TEMPS", marche: "Deuxieme mi-temps plus de " + l + " " + mot(l, "but", "buts"), v3: "2MT_TOTAL:plus" + l,
    flux: { bet_id: 26, value: "Over " + l }, dim: "buts", ft: false, test: (o) => o.h2 + o.a2 > l, libelle: () => "2e mi-temps : plus de " + fr(l) + " " + mot(l, "but", "buts") });
  ajouter({ id: "sh-under-" + suffixeButs(l), famille: "MT2_BUTS", categorie: "MI_TEMPS", marche: "Deuxieme mi-temps moins de " + l + " " + mot(l, "but", "buts"), v3: "2MT_TOTAL:moins" + l,
    flux: { bet_id: 26, value: "Under " + l }, dim: "buts", ft: false, test: (o) => o.h2 + o.a2 < l, libelle: () => "2e mi-temps : moins de " + fr(l) + " " + mot(l, "but", "buts") });
});

// --- Tirs cadres et tirs du match (statistiques d'API-Football, « Shots on Goal » et « Total Shots ») ---
for (let l = 1.5; l <= 19.5; l += 1) {
  ajouter({ id: "total-shots-on-target-over-" + suffixeTirs(l), famille: "TIRS_CADRES", categorie: "TIRS", marche: "Tirs cadres du match over " + l, v3: null,
    flux: { bet_id: 87, value: "Over " + l }, dim: "tirs_cadres", ft: false, test: (o) => o.n > l, libelle: () => "Plus de " + fr(l) + " tirs cadrés dans le match" });
  ajouter({ id: "total-shots-on-target-under-" + suffixeTirs(l), famille: "TIRS_CADRES", categorie: "TIRS", marche: "Tirs cadres du match under " + l, v3: null,
    flux: { bet_id: 87, value: "Under " + l }, dim: "tirs_cadres", ft: false, test: (o) => o.n < l, libelle: () => "Moins de " + fr(l) + " tirs cadrés dans le match" });
}
for (let l = 5.5; l <= 39.5; l += 1) {
  ajouter({ id: "total-shots-over-" + suffixeTirs(l), famille: "TIRS", categorie: "TIRS", marche: "Tirs du match over " + l, v3: null,
    flux: { bet_id: 211, value: "Over " + l }, dim: "tirs", ft: false, test: (o) => o.n > l, libelle: () => "Plus de " + fr(l) + " tirs dans le match" });
  ajouter({ id: "total-shots-under-" + suffixeTirs(l), famille: "TIRS", categorie: "TIRS", marche: "Tirs du match under " + l, v3: null,
    flux: { bet_id: 211, value: "Under " + l }, dim: "tirs", ft: false, test: (o) => o.n < l, libelle: () => "Moins de " + fr(l) + " tirs dans le match" });
}
Object.freeze(CATALOGUE);

// Index : selection du flux (bet_id + valeur) -> id du site ; cle v3 -> id du site.
const PAR_FLUX = {};
const PAR_V3 = {};
Object.keys(CATALOGUE).forEach(function (id) {
  const d = CATALOGUE[id];
  if (d.flux) PAR_FLUX[d.flux.bet_id + ":" + d.flux.value.toLowerCase()] = id;
  if (d.v3) PAR_V3[d.v3] = id;
});
function idDuFlux(betId, value) { return PAR_FLUX[Number(betId) + ":" + String(value || "").trim().toLowerCase()] || null; }
function idDuCodeFlux(code) {
  const r = /^F(\d+):(.+)$/.exec(String(code || ""));
  return r ? idDuFlux(r[1], r[2]) : null;
}
function idDuV3(cle) { return PAR_V3[String(cle || "")] || null; }
function definition(id) { return CATALOGUE[String(id || "")] || null; }

// Libelle francais clair (page, tickets, Selection en or) avec les noms des equipes : le MEME que la
// page match (lib/market-labels.js, forme des bookmakers), sinon celui du catalogue.
const ML = require("./market-labels.js");
function libelle(id, dom, ext) {
  const d = definition(id);
  if (!d) return null;
  const l = ML.marketIdLabelFr(d.id, { home: dom || null, away: ext || null });
  return l && l !== d.id ? l : d.libelle(dom || "Domicile", ext || "Extérieur");
}

// ---------------------------------------------------------------------------------------------
// COHERENCE

// Issues enumerees : buts de 0 a MAX_BUTS par equipe et par mi-temps (au-dela, aucun marche du
// catalogue ne change de reponse : lignes jusqu'a 4,5 buts) ; tirs de 0 a 60.
const MAX_BUTS = 5;
const ISSUES_BUTS = [];
for (let h1 = 0; h1 <= MAX_BUTS; h1++) for (let a1 = 0; a1 <= MAX_BUTS; a1++) for (let h2 = 0; h2 <= MAX_BUTS; h2++) for (let a2 = 0; a2 <= MAX_BUTS; a2++) ISSUES_BUTS.push({ h1: h1, a1: a1, h2: h2, a2: a2 });
const ISSUES_TIRS = [];
for (let n = 0; n <= 60; n++) ISSUES_TIRS.push({ n: n });

const CACHE_IMPL = new Map();
// Si A gagne, B gagne-t-il TOUJOURS ? (meme dimension seulement ; A jamais gagnant : faux.)
function implique(idA, idB) {
  const a = definition(idA), b = definition(idB);
  if (!a || !b || a.dim !== b.dim) return false;
  if (a.id === b.id) return true;
  const k = a.id + ">" + b.id;
  if (CACHE_IMPL.has(k)) return CACHE_IMPL.get(k);
  const issues = a.dim === "buts" ? ISSUES_BUTS : ISSUES_TIRS;
  let auMoinsUne = false, ok = true;
  for (let i = 0; i < issues.length && ok; i++) {
    if (!a.test(issues[i])) continue;
    auMoinsUne = true;
    if (!b.test(issues[i])) ok = false;
  }
  const r = ok && auMoinsUne;
  CACHE_IMPL.set(k, r);
  return r;
}

// Grille des scores FINAUX du moteur v3 (marches « SCORE:x-y », probabilites en %), ou null.
// « SCORE:autre » est ignore (issues inconnues) ; il faut au moins 80 % de la masse en scores lisibles.
function grilleV3(m) {
  const l = Array.isArray(m && m.v3_marches) ? m.v3_marches : [];
  const out = [];
  let somme = 0;
  l.forEach(function (mk) {
    const r = mk && typeof mk.cle === "string" ? /^SCORE:(\d+)-(\d+)$/.exec(mk.cle) : null;
    const p = r ? Number(mk.probabilite) : NaN;
    if (!r || !Number.isFinite(p) || p < 0) return;
    out.push({ h: Number(r[1]), a: Number(r[2]), p: p });
    somme += p;
  });
  return out.length >= 6 && somme >= 80 ? out : null;
}
// P(B | A) et P(B) sur la grille (deux paris du score final seulement). -> { pBA, pB } ou null.
function probasGrille(grille, idA, idB) {
  const a = definition(idA), b = definition(idB);
  if (!grille || !a || !b || !a.ft || !b.ft || a.dim !== "buts" || b.dim !== "buts") return null;
  let pA = 0, pAB = 0, pB = 0, tot = 0;
  grille.forEach(function (s) {
    const o = { h1: s.h, a1: s.a, h2: 0, a2: 0 };
    const ga = a.test(o), gb = b.test(o);
    tot += s.p;
    if (ga) pA += s.p;
    if (gb) pB += s.p;
    if (ga && gb) pAB += s.p;
  });
  if (!(pA > 0) || !(tot > 0)) return null;
  return { pBA: pAB / pA, pB: pB / tot };
}

const NIVEAU = Object.freeze({ JAMBE: "jambe", OR: "or" });
// Le pari B (nouveau) va-t-il dans le meme sens que le pari A (deja affiche ou deja engage) sur le
// MEME match ? niveau : « jambe » (P(B | A) >= seuil) ou « or » (P(B | A) >= P(B)).
// -> { ok, methode: « meme » | « implication » | « grille » | « inconnu », p (P(B | A) ou null) }.
function coherent(m, idA, idB, niveau, seuil) {
  const a = definition(idA), b = definition(idB);
  if (!a || !b) return { ok: false, methode: "inconnu", p: null };
  if (a.id === b.id) return { ok: true, methode: "meme", p: 1 };
  if (implique(a.id, b.id)) return { ok: true, methode: "implication", p: 1 };
  // Niveau « or » : B plus etroit que A (si B gagne, A gagne) = dependance positive.
  if (niveau === NIVEAU.OR && implique(b.id, a.id)) return { ok: true, methode: "implication", p: null };
  const g = probasGrille(grilleV3(m), a.id, b.id);
  if (g) {
    const s = Number.isFinite(Number(seuil)) ? Number(seuil) : 0.8;
    const ok = niveau === NIVEAU.OR ? g.pBA > 0 && g.pBA >= g.pB - 1e-9 : g.pBA >= s - 1e-9;
    return { ok: ok, methode: "grille", p: Math.round(g.pBA * 10000) / 10000 };
  }
  return { ok: false, methode: "inconnu", p: null };
}

module.exports = { CATALOGUE, VERIFIE, NIVEAU, definition, libelle, idDuFlux, idDuCodeFlux, idDuV3, implique, grilleV3, probasGrille, coherent };
