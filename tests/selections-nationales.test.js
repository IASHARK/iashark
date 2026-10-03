"use strict";
// Matchs de selections nationales (decision de Clement du 30/09/2026, apres l'avis
// ORANGE du mathematicien sur le modele des selections) : Ligue des nations, amicaux,
// qualifications. Sur le site V3 : jamais eligibles au VIP ni au Canal Pro (aucun pari
// publie), « Fiabilité : en test », seulement le 1N2 et la double chance, jamais
// « vérifié sur le passé », jamais le match offert. Les probabilites ne bougent pas.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const V3 = require("../lib/moteur-v3.js");
const SEL = require("../lib/selections-nationales.js");
const root = path.join(__dirname, "..");
const EXEMPLE = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "moteur-v3", "exemple_sortie.json"), "utf8"));
const CONFIG = JSON.parse(fs.readFileSync(path.join(root, "config", "moteur-v3.json"), "utf8"));

test("reconnait les selections, jamais les coupes de clubs ni les championnats", () => {
  for (const m of [{ league_id: 5 }, { league_id: 10 }, { league_id: 32 }, { league: "UEFA Nations League" }, { league: "Friendlies" }, { league: "World Cup - Qualification Europe" }]) assert.equal(SEL.estSelectionNationale(m), true, JSON.stringify(m));
  for (const m of [{ league_id: 61, league: "Ligue 1" }, { league_id: 2, league: "UEFA Champions League" }, { league_id: 262, league: "Liga MX" }, null]) assert.equal(SEL.estSelectionNationale(m), false, JSON.stringify(m));
  assert.deepEqual(["home-win", "draw", "away-win", "dc-1x", "dc-x2", "dc-12", "over-25", "btts-yes"].map(SEL.marcheAutorise), [true, true, true, true, true, true, false, false]);
});

// Autriche - Kosovo (Ligue des nations, id 5) : la sortie d'exemple du moteur publie un pari.
function passage(opts) {
  const b = V3.creerBranchement(Object.assign({ env: { MOTEUR_V3: "1", MOTEUR_V3_SORTIE: "sortie/2026-09-27.json" }, config: CONFIG, nowMs: Date.parse("2026-09-27T08:00:00Z"), lireFichier: () => JSON.stringify(EXEMPLE) }, opts || {}));
  const cands = [
    { id: "home-win", market: "Victoire Domicile", cote: "1.57", prob: 61.2, marketProb: 62 }, { id: "draw", market: "Match nul", cote: "4.00", prob: 22.1, marketProb: 23 },
    { id: "away-win", market: "Victoire Exterieur", cote: "6.20", prob: 16.7, marketProb: 15 }, { id: "over-25", market: "Over 2.5", cote: "1.95", prob: 51.4, marketProb: 50.2 },
    { id: "over-15", market: "Over 1.5", cote: "1.30", prob: 74.4, marketProb: 75.1 }, { id: "btts-yes", market: "BTTS Oui", cote: "2.05", prob: 44.2, marketProb: 46 },
  ];
  const choix = b.choisirPourFixture({ fixtureId: 1528898, leagueId: 5, kickoff: "2026-09-27T16:00:00+00:00", home: "Austria", away: "Kosovo", homeId: 775, awayId: 1111, candidats: cands, ancien: cands[4] });
  const m = { id: 1528898, league_id: 5, reliability: { label: "Élevée" }, markets_compared: cands.map((c) => ({ id: c.id, market: c.market, probability: c.prob, consensus: c.marketProb, edge: 1 })) };
  const ligne = { fixture_id: 1528898, markets_compared: m.markets_compared.slice() };
  b.completerMatch(m, ligne, 1528898);
  return { choix, m, ligne };
}

test("Ligue des nations : aucun pari (ni v3 ni ancien), « en test », 1N2 et double chance seulement", () => {
  const r = passage();
  assert.equal(r.choix.remplace, true, "l'ancien moteur ne reprend pas la main");
  assert.equal(r.choix.pickedMarket, null);
  assert.equal(r.choix.raison, "MOTEUR_V3_SELECTION_NATIONALE");
  assert.equal(r.m.v3_pari, undefined);
  assert.equal(r.m.league_reliability, "en_test");
  assert.equal(r.m.reliability.label, "En test");
  assert.equal(r.m.v3_marches, undefined, "aucun « vérifié sur le passé »");
  assert.equal(r.m.moteur_v3.fiabilite_niveau, null);
  assert.doesNotMatch(JSON.stringify(r.m), /vérifié sur le passé/);
  for (const liste of [r.m.markets_compared, r.ligne.markets_compared]) assert.ok(liste.length && liste.every((c) => SEL.marcheAutorise(c.id)), JSON.stringify(liste.map((c) => c.id)));
  // Les probabilites du moteur sont les memes qu'avant la regle.
  const avant = passage({ selectionsNationalesEligibles: true });
  for (const k of ["p1", "pn", "p2", "po25", "btts"]) assert.equal(r.m[k], avant.m[k], k);
  assert.ok(avant.m.v3_pari, "sans la regle, le moteur publiait bien un pari sur ce match");
});

// 03/10/2026, decision de Clement (« il faut un match offert ») : la regle du 30/09 est levee. Une selection
// nationale peut etre offerte SEULEMENT si elle est dans la liste verifiee (Ligue des nations, eliminatoires
// Europe) ET une Selection IASHARK ; amicaux et autres zones : jamais (competitionOffrable).
test("pipeline : match offert = Selection IASHARK ; selections nationales hors liste verifiee jamais, le branchement ne passe jamais l'option des tests", () => {
  const wf = fs.readFileSync(path.join(root, ".github", "workflows", "update-data.yml"), "utf8");
  assert.match(wf, /var SELECTIONS=require\('\.\/lib\/selections-nationales\.js'\);/);
  assert.match(wf, /if\(SELECTIONS\.estSelectionNationale\(m\)\) return SEL_OFFRABLES\.indexOf\(String\(m\.league_key\|\|''\)\)!==-1;/);
  assert.match(wf, /var analysable=function\(m\)\{ return m && m\.pari_rec && !m\.no_signal && estSelectionDuJour\(m\) && competitionOffrable\(m\) &&/);
  assert.doesNotMatch(wf, /selectionsNationalesEligibles/);
  assert.match(wf, /creerBranchement\(\{env:process\.env\}\)/);
});
