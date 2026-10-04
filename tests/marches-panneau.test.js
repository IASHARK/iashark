"use strict";
// PANNEAU « MARCHES » DE LA PAGE MATCH (demande de Clement du 04/10/2026, plan UX §3 ;
// verdict du mathematicien verdicts-maths-tickets.md §2 : 71 marches, arrondi par groupe,
// une seule source pour le pari, Pro seulement).
const test = require("node:test");
const assert = require("node:assert/strict");

const P = require("../lib/marches-panneau.js");
const PREMIUM = require("../lib/premium-fields.js");
const VERDICTS = require("../config/verdicts-maths.json");

const GO = { marches_panneau: VERDICTS.marches_panneau };
function grille() {
  // Grille de scores 0-4 x 0-4 + autre, normalisee (probabilites en %).
  const lh = 1.5, la = 1.1, f = (k, l) => Math.exp(-l) * Math.pow(l, k) / [1, 1, 2, 6, 24][k];
  const out = {}; let s = 0;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) { out["SCORE:" + i + "-" + j] = f(i, lh) * f(j, la) * 100; s += out["SCORE:" + i + "-" + j]; }
  out["SCORE:autre"] = 100 - s;
  return out;
}
function v3marches(extra) {
  const p = Object.assign({
    "1N2:1": 46.3, "1N2:N": 27.1, "1N2:2": 26.7, "DC:1N": 73.4, "DC:N2": 53.8, "DC:12": 73.0, "RB:1": 63.4,
    "TOTAL:plus0.5": 92.3, "TOTAL:moins0.5": 7.7, "TOTAL:plus1.5": 72.4, "TOTAL:moins1.5": 27.6, "TOTAL:plus2.5": 48.6, "TOTAL:moins2.5": 51.4,
    "TOTAL:plus3.5": 26.5, "TOTAL:moins3.5": 73.5, "EQUIPE_DOM:plus0.5": 77.7, "EQUIPE_DOM:plus2.5": 19.1, "EQUIPE_EXT:plus0.5": 66.7,
    "MT:1": 33.3, "MT:N": 43.4, "MT:2": 23.4, "MT_FIN:1/1": 25.0, "MT_FIN:1/N": 5.1, "MT_FIN:1/2": 2.2, "MT_FIN:N/1": 15.3, "MT_FIN:N/N": 17.2, "MT_FIN:N/2": 10.9,
    "MT_FIN:2/1": 2.0, "MT_FIN:2/N": 4.8, "MT_FIN:2/2": 14.5, "MT_PROLIFIQUE:1re": 29.0, "MT_PROLIFIQUE:egal": 26.5, "MT_PROLIFIQUE:2e": 44.5,
    "PREMIER_BUT:avant15": 30.1, "PREMIER_BUT:avant45": 69.9, "PREMIER_BUT:dom": 52.0, "PREMIER_BUT:ext": 40.3, "PREMIER_BUT:aucun": 7.7,
    "BTTS:oui": 51.0, "BTTS:non": 49.0, "CORNERS:plus9.5": 51.0, "HANDICAP_DOM:-1.5:gagne": 21.0, "CARTONS:plus4.5": 40.0,
  }, grille(), extra || {});
  return Object.keys(p).map((cle) => ({ cle: cle, market_id: null, probabilite: Math.round(p[cle] * 10) / 10, fiabilite_marche: "x", etiquette: "x" }));
}
function match(o) {
  return Object.assign({
    id: 1, home: { n: "Lens" }, away: { n: "Lille" }, date: "2026-10-04 18:00",
    moteur_v3: { source: "v3", origine_probabilite: "modèle + cotes" },
    pari_rec: "Victoire Domicile", market_id: "home-win", no_signal: false, chance_iashark: 44, cote_rec: "1.62",
    v3_marches: v3marches(),
    marches_flux: { source: "cote de reference du marche, marge retiree", releve_at: "2026-10-04T07:12:00.000Z", liste: [
      { marche: "Les deux équipes marquent", selection: "les deux équipes marquent", chance: 52, cote_minimum: 1.92, code: "F8:Yes" },
      { marche: "Nombre de corners", selection: "plus de 8,5 corners dans le match", chance: 61, cote_minimum: 1.64, code: "F45:Over 8.5" },
      { marche: "Nombre de buts", selection: "plus de 2,5 buts dans le match", chance: 47, cote_minimum: 2.13, code: "F5:Over 2.5" },
      { marche: "Buteur (à n'importe quel moment)", selection: "X marque", chance: 30, cote_minimum: 3.33, code: "F92:X" },
    ] },
  }, o || {});
}
const ligne = (p, id) => p.familles.flatMap((f) => f.marches).find((x) => x.id === id);
const famille = (p, cle) => p.familles.find((f) => f.cle === cle);

test("rien sans le feu vert du mathematicien (en_attente, NO-GO)", () => {
  assert.equal(P.construirePanneau(match(), { verdicts: { marches_panneau: { statut: "en_attente", cles_affichees: ["1N2:1"] } } }), null);
  assert.equal(P.construirePanneau(match(), { verdicts: { marches_panneau: { statut: "NO-GO", cles_affichees: ["1N2:1"] } } }), null);
  assert.equal(VERDICTS.marches_panneau.statut, "GO");
  assert.equal(VERDICTS.marches_panneau.cles_affichees.length, 71, "71 marches juges justes");
});

test("seulement les 71 marches justes : ni handicap, ni corners/cartons du v3, ni BTTS du v3, ni premier but par equipe, ni doublon", () => {
  const p = P.construirePanneau(match(), { verdicts: GO });
  const ids = p.familles.flatMap((f) => f.marches).filter((x) => x.source === "modele").map((x) => x.id);
  for (const k of ["HANDICAP_DOM:-1.5:gagne", "CORNERS:plus9.5", "CARTONS:plus4.5", "BTTS:oui", "PREMIER_BUT:dom", "PREMIER_BUT:ext", "PREMIER_BUT:aucun", "PREMIER_BUT:avant45", "TOTAL:moins0.5", "MT_FIN:1/1", "EQUIPE_DOM:plus2.5", "EQUIPE_EXT:plus0.5"]) {
    assert.ok(!ids.includes(k), k + " cache");
  }
  for (const k of ["DC:1N", "RB:1", "MT:N", "MT_FIN:N/1", "PREMIER_BUT:avant15", "TOTAL:plus1.5", "EQUIPE_DOM:plus0.5", "MT_PROLIFIQUE:2e"]) assert.ok(ids.includes(k) || ids.includes({ "DC:1N": "dc-1x" }[k]), k + " affiche");
  // Libelles du mathematicien.
  assert.equal(ligne(p, "RB:1").libelle, "Victoire Lens, si le match n'est pas nul");
  assert.equal(ligne(p, "MT_FIN:N/1").libelle, "Nul à la mi-temps / Lens à la fin");
  assert.equal(ligne(p, "PREMIER_BUT:avant15").libelle, "Premier but avant la 15e minute");
  assert.equal(ligne(p, "dc-1x").libelle, "Lens ou match nul");
  const json = JSON.stringify(p);
  assert.doesNotMatch(json, /cote|bet365|Pinnacle|Winamax|valeur|vérifi|marque \(/i, "pas de cote, pas de valeur, pas d'etiquette, pas de buteur");
});

test("une seule source : le pari de l'avis porte la chance affichee, son groupe fait 100, double chance = somme", () => {
  const p = P.construirePanneau(match(), { verdicts: GO });
  const v1 = ligne(p, "home-win"), vn = ligne(p, "draw"), v2 = ligne(p, "away-win");
  assert.equal(v1.chance, 44); assert.equal(v1.pari_avis, true);
  assert.equal(v1.chance + vn.chance + v2.chance, 100);
  assert.equal(ligne(p, "dc-1x").chance, v1.chance + vn.chance);
  assert.equal(ligne(p, "dc-x2").chance, vn.chance + v2.chance);
  assert.equal(ligne(p, "dc-12").chance, v1.chance + v2.chance);
  // Pari en double chance : ses deux issues font exactement la chance affichee.
  const q = P.construirePanneau(match({ market_id: "dc-1x", chance_iashark: 72 }), { verdicts: GO });
  assert.equal(ligne(q, "dc-1x").chance, 72); assert.equal(ligne(q, "dc-1x").pari_avis, true);
  assert.equal(ligne(q, "away-win").chance, 28);
  assert.equal(ligne(q, "home-win").chance + ligne(q, "draw").chance, 72);
  // Pari plus de 2,5 buts : la ligne jumelle fait le reste.
  const r = P.construirePanneau(match({ market_id: "over-25", chance_iashark: 47 }), { verdicts: GO });
  assert.equal(ligne(r, "over-25").chance, 47); assert.equal(ligne(r, "under-25").chance, 53);
});

test("arrondi par groupe (plus grand reste) : mi-temps, mi-temps/fin (calcule sur 9), plus/moins, scores + autres = 100", () => {
  const p = P.construirePanneau(match(), { verdicts: GO });
  assert.equal(["MT:1", "MT:N", "MT:2"].reduce((s, k) => s + ligne(p, k).chance, 0), 100);
  assert.equal(["MT_PROLIFIQUE:1re", "MT_PROLIFIQUE:egal", "MT_PROLIFIQUE:2e"].reduce((s, k) => s + ligne(p, k).chance, 0), 100);
  assert.equal(ligne(p, "TOTAL:plus3.5").chance + ligne(p, "TOTAL:moins3.5").chance, 100);
  const sc = famille(p, "score_exact").marches;
  assert.equal(sc.length, P.NB_SCORES + 1);
  assert.equal(sc[sc.length - 1].id, "SCORE:autres");
  assert.equal(sc.reduce((s, x) => s + x.chance, 0), 100);
  assert.deepEqual(P.plusGrandReste([33.3, 33.3, 33.4], 100), [33, 33, 34]);
  assert.deepEqual(P.plusGrandReste([46.3, 27.1, 26.7], 100), [46, 27, 27]);
});

test("plus/moins 1,5 seulement quand le v3 combine modele et cotes (faux hors Europe, « modèle seul »)", () => {
  const seul = P.construirePanneau(match({ moteur_v3: { source: "v3", origine_probabilite: "modèle seul" } }), { verdicts: GO });
  assert.equal(ligne(seul, "TOTAL:plus1.5"), undefined);
  assert.equal(ligne(seul, "TOTAL:moins1.5"), undefined);
  assert.ok(ligne(seul, "TOTAL:plus2.5") || ligne(seul, "over-25"));
});

test("flux de cotes : seulement ce que le v3 ne montre pas (les deux marquent, corners des cotes), jamais le buteur", () => {
  const p = P.construirePanneau(match(), { verdicts: GO });
  assert.equal(famille(p, "btts").marches[0].chance, 52);
  assert.equal(famille(p, "btts").marches[0].source, "marche");
  assert.equal(famille(p, "corners").marches[0].libelle, "Plus de 8,5 corners dans le match");
  assert.equal(p.familles.flatMap((f) => f.marches).filter((x) => x.id === "over-25").length, 1, "plus de 2,5 : une seule ligne (celle du v3)");
  assert.equal(ligne(p, "over-25").source, "modele");
  // Selection nationale (pas de v3) : le flux seul, relie au pari de l'avis par sa cle.
  const sel = P.construirePanneau(match({ v3_marches: undefined, market_id: "over-25", chance_iashark: 46 }), { verdicts: GO });
  assert.equal(ligne(sel, "over-25").chance, 46); assert.equal(ligne(sel, "over-25").pari_avis, true);
  assert.equal(P.cleV3DuCode("F12:Home/Draw"), "DC:1N");
  assert.equal(P.cleV3DuCode("F45:Over 8.5"), "CORNERS:plus8.5");
  assert.equal(P.cleV3DuCode("F25:Home/Over 2.5"), null);
});

test("pipeline : panneau sur les matchs ouverts, nb_marches public ; match ferme garde son panneau", () => {
  const ouvert = match({ id: 1 });
  const ferme = match({ id: 2, no_signal_reason: "KICKOFF_PASSED", marches_panneau: { v: "panneau-2", nb: 7, familles: [] } });
  const vide = match({ id: 3, v3_marches: [], marches_flux: null, nb_marches: 4, marches_panneau: { nb: 4 } });
  const n = P.poserPanneaux([ouvert, ferme, vide], { verdicts: GO });
  assert.equal(n, 1);
  assert.equal(ouvert.nb_marches, ouvert.marches_panneau.nb);
  assert.equal(ouvert.nb_marches, 41, "39 lignes du v3 (dont 9 de scores) + 2 du flux sur ce match d essai");
  assert.equal(ferme.nb_marches, 7);
  assert.equal(vide.marches_panneau, undefined); assert.equal(vide.nb_marches, undefined);
});

test("acces : marches_panneau premium et Pro seulement (meme match offert) ; nb_marches public", () => {
  assert.ok(PREMIUM.PREMIUM_FIELDS.includes("marches_panneau"));
  assert.ok(PREMIUM.PRO_ONLY_FIELDS.includes("marches_panneau"));
  assert.ok(!PREMIUM.PREMIUM_FIELDS.includes("nb_marches"));
  const m = match({ is_free: true });
  P.poserPanneaux([m], { verdicts: GO });
  const pub = PREMIUM.stripPremium(m);
  assert.equal(pub.marches_panneau, undefined, "match offert : panneau retire");
  assert.equal(pub.v3_marches, undefined); assert.equal(pub.marches_flux, undefined);
  assert.equal(pub.nb_marches, m.marches_panneau.nb);
  assert.deepEqual(PREMIUM.deepPremiumLeaks({ matchs: [pub] }), []);
  const payant = PREMIUM.stripPremium(Object.assign({}, m, { is_free: false }));
  assert.equal(payant.marches_panneau, undefined);
  assert.equal(PREMIUM.premiumPayload(m).marches_panneau.nb, m.marches_panneau.nb, "persiste dans premium_fields pour match-data");
});
