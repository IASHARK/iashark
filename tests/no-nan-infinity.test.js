"use strict";
// GATE A7 item 9 (SPEC LAB PRO v1.0 §38: "NaN/Infinity : interdits") -
// au niveau moteur complet, y compris sur des entrees limites qui
// pourraient faire diverger poissonProb/dixonColesCorr/la boucle
// d'adaptation de troncature (lib/markets/score-matrix.js#buildAdaptiveDixonColesMatrix).

const test = require("node:test");
const assert = require("node:assert/strict");
const { calcFinalProbs, calcLambdas } = require("../lib/engine.js");

const PCT_FIELDS = ["p1", "pN", "p2", "over15", "over25", "under25", "over35", "under35", "bttsY", "bttsN"];

const CASES = [
  [1.35, 1.10], [0.80, 0.80], [3.40, 3.00], [2.605, 2.674],
  [0.8001, 0.8001], // juste au-dessus de la borne min, cas potentiellement fragile pour poissonProb(petit lambda)
];

for (const [lh, la] of CASES) {
  test(`calcFinalProbs [lambdaH=${lh}, lambdaA=${la}]: aucun NaN/Infinity sur les champs pourcentage`, () => {
    const r = calcFinalProbs(lh, la, null);
    for (const f of PCT_FIELDS) {
      assert.ok(Number.isFinite(r[f]), `${f}=${r[f]} n'est pas fini`);
    }
    assert.ok(Number.isFinite(r.matrix_max_goal), `matrix_max_goal=${r.matrix_max_goal} n'est pas fini`);
    assert.ok(Number.isFinite(r.matrix_tail_mass), `matrix_tail_mass=${r.matrix_tail_mass} n'est pas fini`);
  });
}

test("calcLambdas: aucun NaN/Infinity meme avec des denominateurs a zero (matchs joues = 0)", () => {
  const r = calcLambdas(10, 5, 0, 10, 5, 0, 1.35, 1.10, 39);
  assert.ok(Number.isFinite(r.lambdaH), `lambdaH=${r.lambdaH} n'est pas fini malgre matchs joues=0`);
  assert.ok(Number.isFinite(r.lambdaA), `lambdaA=${r.lambdaA} n'est pas fini malgre matchs joues=0`);
});

test("calcLambdas: aucun NaN/Infinity avec leagueAvgH/leagueAvgA a zero (repli sur les valeurs par defaut internes)", () => {
  const r = calcLambdas(10, 5, 10, 10, 5, 10, 0, 0, 39);
  assert.ok(Number.isFinite(r.lambdaH));
  assert.ok(Number.isFinite(r.lambdaA));
});
