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
  // H-022 du moteur : le verdict par marche (panneau) ; « faux » ici pour le handicap -1,5, comme si le moteur
  // l'avait trouve faux dans ce championnat meme apres correction.
  const faux = (extra && extra.__faux) || ["HANDICAP_DOM:-1.5:gagne"];
  return Object.keys(p).filter((cle) => cle !== "__faux").map((cle) => ({ cle: cle, market_id: null, probabilite: Math.round(p[cle] * 10) / 10, fiabilite_marche: "x", etiquette: "x", panneau: faux.indexOf(cle) === -1 }));
}
function match(o) {
  return Object.assign({
    // Ligue 1 (un des 12 championnats mesures du v3), couverture « vérifiée » ; chance de l'Avis
    // a moins de 2 points du v3 (46,3 %) : perimetre du mathematicien (04/10/2026).
    id: 1, home: { n: "Lens" }, away: { n: "Lille" }, date: "2026-10-04 18:00", league_key: "ligue1",
    moteur_v3: { source: "v3", origine_probabilite: "modèle + cotes" }, v3_fiabilite: { couverture: "vérifiée" },
    pari_rec: "Victoire Domicile", market_id: "home-win", no_signal: false, chance_iashark: 45, cote_rec: "1.62",
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
  // 04/10/2026 (nuit), decision de Clement : tous les marches ouverts (109 cles), le moteur dit marche par marche ce qui
  // est juste dans chaque championnat (H-022) ; avant : 71 cles du verdict du mathematicien.
  assert.equal(VERDICTS.marches_panneau.cles_affichees.length, 109, "109 marches ouverts");
});

test("tous les marches ouverts, sauf ceux que le moteur dit faux dans ce championnat, les doublons et le premier but par equipe", () => {
  const p = P.construirePanneau(match(), { verdicts: GO });
  const ids = p.familles.flatMap((f) => f.marches).filter((x) => x.source === "modele").map((x) => x.id);
  for (const k of ["HANDICAP_DOM:-1.5:gagne", "PREMIER_BUT:dom", "PREMIER_BUT:ext", "PREMIER_BUT:aucun", "PREMIER_BUT:avant45", "TOTAL:moins0.5"]) {
    assert.ok(!ids.includes(k), k + " cache");
  }
  for (const k of ["DC:1N", "RB:1", "MT:N", "MT_FIN:N/1", "PREMIER_BUT:avant15", "TOTAL:plus1.5", "EQUIPE_DOM:plus0.5", "MT_PROLIFIQUE:2e",
    "CORNERS:plus9.5", "CARTONS:plus4.5", "MT_FIN:1/1", "EQUIPE_DOM:plus2.5", "EQUIPE_EXT:plus0.5"]) assert.ok(ids.includes(k) || ids.includes({ "DC:1N": "dc-1x" }[k]), k + " affiche");
  assert.equal(ligne(p, "CORNERS:plus9.5").libelle, "Plus de 9,5 corners dans le match");
  assert.equal(ligne(p, "CARTONS:plus4.5").libelle, "Plus de 4,5 cartons dans le match");
  assert.equal(famille(p, "btts").marches.find((x) => x.source === "modele").chance + famille(p, "btts").marches.filter((x) => x.source === "modele")[1].chance, 100);
  // Le meme handicap juge juste par le moteur : affiche, avec un libelle clair.
  const h = P.construirePanneau(match({ v3_marches: v3marches({ __faux: [] }) }), { verdicts: GO });
  assert.equal(ligne(h, "HANDICAP_DOM:-1.5:gagne").libelle, "Lens gagne par 2 buts d'écart ou plus");
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
  assert.equal(v1.chance, 45); assert.equal(v1.pari_avis, true);
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

test("plus/moins 1,5 : le verdict du moteur dans ce championnat decide (H-022), plus la seule origine des chances", () => {
  const seul = P.construirePanneau(match({ moteur_v3: { source: "v3", origine_probabilite: "modèle seul" } }), { verdicts: GO });
  assert.ok(ligne(seul, "TOTAL:plus1.5") && ligne(seul, "TOTAL:moins1.5"), "juste dans ce championnat : affiche");
  const faux = P.construirePanneau(match({ moteur_v3: { source: "v3", origine_probabilite: "modèle seul" }, v3_marches: v3marches({ __faux: ["TOTAL:plus1.5", "TOTAL:moins1.5"] }) }), { verdicts: GO });
  assert.equal(ligne(faux, "TOTAL:plus1.5"), undefined);
  assert.equal(ligne(faux, "TOTAL:moins1.5"), undefined);
  assert.ok(ligne(faux, "TOTAL:plus2.5") || ligne(faux, "over-25"));
  // Moteur plus ancien (pas de champ panneau) : la liste des cles affichables seule.
  const ancien = match({ v3_marches: v3marches().map((x) => { const y = Object.assign({}, x); delete y.panneau; return y; }) });
  assert.ok(ligne(P.construirePanneau(ancien, { verdicts: GO }), "HANDICAP_DOM:-1.5:gagne"));
});

test("flux de cotes : seulement ce que le v3 ne montre pas (les deux marquent, corners des cotes), jamais le buteur", () => {
  // Les deux marquent du v3 jugees fausses dans ce championnat : la cote du marche prend le relais.
  const p = P.construirePanneau(match({ v3_marches: v3marches({ __faux: ["BTTS:oui", "BTTS:non", "HANDICAP_DOM:-1.5:gagne"] }) }), { verdicts: GO });
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
  // 04/10/2026 (controle de l'avocat du diable, point 2) : nb_marches = les lignes AFFICHEES par le
  // panneau (une ligne par paire de contraires), meme regle que la page.
  const lignes = ouvert.marches_panneau.familles.reduce((s, f) => s + f.marches.length, 0);
  // H-022 (04/10/2026, nuit) : + les deux marquent, corners, cartons, mi-temps/fin 1/1 et buts par equipe du v3 ; les
  // deux marquent du flux n'est plus repete (le v3 la montre).
  assert.equal(lignes, 47, "46 lignes du v3 (dont 9 de scores) + 1 du flux sur ce match d essai");
  assert.equal(ouvert.nb_marches, 43, "47 lignes, dont 4 paires de contraires reunies a l'affichage");
  assert.equal(ouvert.nb_marches, require("../lib/match-sections.js").nbLignesAffichees(ouvert.marches_panneau.familles));
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

// CONTROLE DU MATHEMATICIEN DU 04/10/2026 (points 1 et 2) : perimetre du moteur v3.
test("perimetre : aucune ligne du v3 hors des 12 championnats mesures (selection, coupe) ni hors couverture verifiee", () => {
  for (const o of [{ league_key: "nations_league" }, { league_key: "wcq_europe" }, { league_key: "ldc" }, { league_key: "coupe_de_france" }, { league_key: "libertadores" },
    { v3_fiabilite: { couverture: "données limitées" } }, { moteur_v3: { source: "ancien moteur (repli)" } }, { league_key: undefined }]) {
    const m = match(o);
    assert.equal(P.chancesEntieres(m, { verdicts: GO }), null, JSON.stringify(o));
    const p = P.construirePanneau(m, { verdicts: GO });
    const lignes = p ? p.familles.flatMap((f) => f.marches) : [];
    assert.deepEqual(lignes.filter((x) => x.source === "modele"), [], "aucune ligne du v3 : " + JSON.stringify(o));
  }
  assert.equal(VERDICTS.perimetre_v3.ligues.length, 30, "les 30 championnats du site (H-022 du moteur)");
  for (const k of ["premier", "jleague", "turkey_superlig", "chile_primera", "k_league1", "saudi_proleague"]) assert.ok(VERDICTS.perimetre_v3.ligues.includes(k), k);
  for (const k of ["ldc", "nations_league", "coupe_de_france", "libertadores"]) assert.ok(!VERDICTS.perimetre_v3.ligues.includes(k), k);
});

test("coherence avec l'Avis : au-dela de 2 points d'ecart avec le v3 sur le meme marche, aucune ligne du v3 (l'Avis reste seul)", () => {
  assert.equal(VERDICTS.perimetre_v3.ecart_max_avis_points, 2);
  // 46,3 % au v3 : 44 (2,3 points) -> rien ; 48 (1,7) -> le panneau.
  assert.equal(P.ecartAvisV3(match({ chance_iashark: 44 })), 2.3);
  assert.equal(P.avisCoherent(match({ chance_iashark: 44 })), false);
  assert.equal(P.chancesEntieres(match({ chance_iashark: 44 }), { verdicts: GO }), null);
  assert.ok(P.chancesEntieres(match({ chance_iashark: 48 }), { verdicts: GO }));
  // Double chance : comparee au DC du v3 (73,4 %).
  assert.equal(P.avisCoherent(match({ market_id: "dc-1x", chance_iashark: 76 })), false);
  assert.equal(P.avisCoherent(match({ market_id: "dc-1x", chance_iashark: 72 })), true);
  // Sans pari ou pari absent du v3 : rien a comparer.
  assert.equal(P.ecartAvisV3(match({ pari_rec: null })), null);
  // Flux de cotes garde (ce que le v3 ne montre pas).
  const p = P.construirePanneau(match({ chance_iashark: 58 }), { verdicts: GO });
  assert.ok(p && p.familles.flatMap((f) => f.marches).every((x) => x.source === "marche"));
});
