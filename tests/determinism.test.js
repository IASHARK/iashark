"use strict";
// GATE A7 item 6 (SPEC LAB PRO v1.0 §38, §39) - calcFinalProbs doit etre
// deterministe sur TOUS les champs utilises par la couche decision
// (pickedMarket/edge/Kelly) : deux appels identiques -> resultats
// identiques, exigence necessaire pour qu'un replay backtest ait un sens
// (§21 du protocole).
//
// Exception documentee, pas cachee : le sous-objet `montecarlo` (champ
// informationnel, jamais consomme par pickMarketDeterministic - verifie
// par tests/pipeline-source-guards.test.js) reste NON deterministe,
// parce que calcMonteCarlo() est appele sans seed dans calcFinalProbs
// (lib/engine.js ligne ~61). C'est un ecart reel a SPEC LAB PRO v1.0 §39
// ("toute stochasticite... jamais Math.random() sans seed"), a corriger
// dans une prochaine passe (hors perimetre GATE A) - ce test le rend
// visible plutot que de l'ignorer silencieusement.

const test = require("node:test");
const assert = require("node:assert/strict");
const { calcFinalProbs, calcLambdas, calcCriteres, calcFatigue } = require("../lib/engine.js");

const DECISION_RELEVANT_FIELDS = [
  "p1", "pN", "p2", "over15", "over25", "under25", "over35", "under35", "bttsY", "bttsN",
  "matrix_max_goal", "matrix_tail_mass",
];

test("calcFinalProbs: deterministe sur tous les champs decision-relevants (deux appels identiques)", () => {
  const cases = [[1.35, 1.10], [0.80, 0.80], [3.40, 3.00], [2.605, 2.674]];
  for (const [lh, la] of cases) {
    const r1 = calcFinalProbs(lh, la, null);
    const r2 = calcFinalProbs(lh, la, null);
    for (const f of DECISION_RELEVANT_FIELDS) {
      assert.equal(r1[f], r2[f], `champ ${f} non deterministe pour lambdaH=${lh} lambdaA=${la}`);
    }
    assert.deepEqual(r1.derived.p1, r2.derived.p1);
  }
});

test("calcFinalProbs: le sous-objet montecarlo (informationnel, hors decision) N'est PAS garanti deterministe - ecart connu, documente, pas un bug de ce GATE", () => {
  // Ce test ne verifie pas l'egalite - il documente executablement le
  // comportement actuel pour qu'un futur correctif (seed systematique)
  // se remarque comme un CHANGEMENT de ce test, pas une surprise.
  const r1 = calcFinalProbs(1.5, 1.2, null);
  const r2 = calcFinalProbs(1.5, 1.2, null);
  assert.ok(r1.montecarlo && r2.montecarlo, "le champ montecarlo doit exister");
  // Pas d'assertion d'egalite/inegalite forcee : le but est la visibilite, pas un verdict.
});

test("calcLambdas: deterministe (memes stats -> memes lambdas)", () => {
  const args = [40, 25, 15, 35, 20, 15, 1.35, 1.10, 39];
  const r1 = calcLambdas(...args);
  const r2 = calcLambdas(...args);
  assert.deepEqual(r1, r2);
});

test("calcCriteres: deterministe (memes stats -> meme resultat)", () => {
  const stats = { fixtures: { played: { total: 20, home: 10, away: 10 }, wins: { home: 7, away: 4 } }, goals: { for: { total: { total: 32 } }, against: { total: { total: 18 } } }, form: "WWDLW" };
  const r1 = calcCriteres(stats, true, 5);
  const r2 = calcCriteres(stats, true, 5);
  assert.deepEqual(r1, r2);
});

test("calcFatigue: deterministe pour une meme reference temporelle (Date.now non utilise directement dans le resultat au-dela de daysSince arrondi)", () => {
  const last10 = [{ date_full: "2026-08-30" }, { date_full: "2026-08-23" }];
  const r1 = calcFatigue(last10);
  const r2 = calcFatigue(last10);
  assert.deepEqual(r1, r2);
});
