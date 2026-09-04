"use strict";
// EXP-004 item 5 (SPEC LAB PRO v1.0, M4 NB2) - contrats sur la matrice
// NB2 adaptative : plus petit M avec tail_mass<1e-10, matrice sans
// NaN/Inf/negatif, somme normalisee ~1, determinisme, safety cap.

const test = require("node:test");
const assert = require("node:assert/strict");
const { findAdaptiveMaxGoal, buildNb2Matrix, TAIL_THRESHOLD, HARD_SAFETY_CAP } = require("../lib/lab/nb2-matrix.js");
const { cdfNB2 } = require("../lib/lab/nb2.js");

test("findAdaptiveMaxGoal : tail_mass au maxGoal retourne est <1e-10, et au maxGoal-1 (s'il existe) est >=1e-10 - le plus petit M qualifiant, jamais un M arbitrairement plus grand", () => {
  const muH = 1.5, muA = 1.2, kappa = 5;
  const { maxGoal, tailMass } = findAdaptiveMaxGoal(muH, muA, kappa);
  assert.ok(tailMass < TAIL_THRESHOLD);
  if (maxGoal > 0) {
    const prevTailMass = 1 - cdfNB2(maxGoal - 1, muH, kappa) * cdfNB2(maxGoal - 1, muA, kappa);
    assert.ok(prevTailMass >= TAIL_THRESHOLD, `M-1=${maxGoal - 1} devrait encore avoir tail_mass>=${TAIL_THRESHOLD}, obtenu ${prevTailMass}`);
  }
});

test("buildNb2Matrix : matrice normalisee, aucune valeur negative/NaN/Inf, somme==1 a tolerance pres, deterministe (meme hash sur deux appels)", () => {
  const r1 = buildNb2Matrix(1.5, 1.2, 5);
  const r2 = buildNb2Matrix(1.5, 1.2, 5);
  assert.equal(r1.matrixHash, r2.matrixHash, "determinisme strict : memes entrees -> meme hash");
  assert.deepEqual(r1.matrix, r2.matrix);
  assert.ok(Math.abs(r1.normalizedSum - 1) < 1e-9);
  assert.ok(r1.tailMass < TAIL_THRESHOLD);
  for (const row of r1.matrix) {
    for (const p of row) {
      assert.ok(Number.isFinite(p), "aucune valeur NaN/Inf");
      assert.ok(p >= 0, "aucune valeur negative");
    }
  }
});

test("buildNb2Matrix : plusieurs (muHome,muAway,kappa) realistes produisent tous une matrice valide", () => {
  const cases = [[0.8, 0.9, 3], [1.5, 1.2, 0.5], [2.6, 2.7, 50], [3.4, 3.0, 1000], [0.5, 0.5, 0.2]];
  for (const [muH, muA, kappa] of cases) {
    const r = buildNb2Matrix(muH, muA, kappa);
    assert.ok(Math.abs(r.normalizedSum - 1) < 1e-9, `muH=${muH} muA=${muA} kappa=${kappa}`);
    assert.ok(r.maxGoal <= HARD_SAFETY_CAP);
    assert.ok(r.matrix.length === r.maxGoal + 1);
    assert.ok(r.matrix[0].length === r.maxGoal + 1);
  }
});

test("buildNb2Matrix : petit kappa (forte surdispersion, queue lourde) exige un maxGoal plus grand qu'un grand kappa a memes mu", () => {
  const rSmallKappa = buildNb2Matrix(2.0, 2.0, 1);
  const rLargeKappa = buildNb2Matrix(2.0, 2.0, 100);
  assert.ok(rSmallKappa.maxGoal >= rLargeKappa.maxGoal, `petit kappa (${rSmallKappa.maxGoal}) doit avoir une queue au moins aussi lourde que grand kappa (${rLargeKappa.maxGoal})`);
});

test("NB_TAIL_TRUNCATION_FAILURE : kappa extremement petit (queue trop lourde pour converger avant le safety cap M<=100) leve une erreur explicite avec le bon code, jamais un resultat tronque silencieusement", () => {
  assert.throws(
    () => buildNb2Matrix(2.0, 2.0, 0.3),
    (err) => err.code === "NB_TAIL_TRUNCATION_FAILURE" && /safety cap/.test(err.message)
  );
});

test("persistance des champs requis : matrix_max_goal, matrix_tail_mass, matrix_hash", () => {
  const r = buildNb2Matrix(1.5, 1.2, 5);
  assert.ok(typeof r.maxGoal === "number");
  assert.ok(typeof r.tailMass === "number");
  assert.ok(typeof r.matrixHash === "string" && r.matrixHash.length === 64);
});

test("hash differe pour des entrees differentes (le hash refletebien le contenu, pas une constante)", () => {
  const r1 = buildNb2Matrix(1.5, 1.2, 5);
  const r2 = buildNb2Matrix(1.6, 1.2, 5);
  assert.notEqual(r1.matrixHash, r2.matrixHash);
});
