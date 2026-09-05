"use strict";
// EXP-005 item 15 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC_MEAN_PRESERVING) -
// contrats sur la matrice adaptative shared-gamma+DC : borne d'union
// valide (pas CDF_H*CDF_A, la distribution est dependante), matrice sans
// NaN/Inf/negatif, somme normalisee ~1, safety cap, determinisme.
//
// CORRECTIF MEAN-PRESERVATION : buildSharedGammaMatrix(lambdaH,lambdaA,...)
// resout maintenant thetaH/thetaA en interne (lib/lab/shared-gamma-theta-solver.js)
// avant de construire la matrice - les tests "directs" (bornes/tail) sur
// des intensites CONNUES utilisent buildSharedGammaMatrixFromTheta (API
// bas niveau, theta explicite, pas de solveur).

const test = require("node:test");
const assert = require("node:assert/strict");
const { findAdaptiveMaxGoalFromTheta, buildSharedGammaMatrixFromTheta, buildSharedGammaMatrix, marginalCdf, TAIL_THRESHOLD, HARD_SAFETY_CAP } = require("../lib/lab/shared-gamma-matrix.js");
const { probabilityM5 } = require("../lib/lab/shared-gamma-dc.js");

const RHO = -0.0845;
const KAPPA_MIN_ROBUST = 1.0; // domaine pre-enregistre (item 8)

test("findAdaptiveMaxGoalFromTheta : la borne d'union garantie au maxGoal retourne est <1e-10 (theta explicite)", () => {
  const { maxGoal, guaranteedTailUpperBound } = findAdaptiveMaxGoalFromTheta(1.5, 1.2, 5, RHO);
  assert.ok(guaranteedTailUpperBound < TAIL_THRESHOLD);
  assert.ok(maxGoal >= 2);
});

test("la borne d'union garantie est bien un MAJORANT reel de la masse hors-carre exacte (verifiee par sommation directe de probabilityM5, theta explicite)", () => {
  const thetaH = 1.5, thetaA = 1.2, kappa = 5;
  const { maxGoal, guaranteedTailUpperBound } = findAdaptiveMaxGoalFromTheta(thetaH, thetaA, kappa, RHO);
  const bigM = maxGoal + 50;
  let insideSquare = 0, totalGrid = 0;
  for (let h = 0; h <= bigM; h++) {
    for (let a = 0; a <= bigM; a++) {
      const p = probabilityM5(thetaH, thetaA, h, a, kappa, RHO);
      totalGrid += p;
      if (h <= maxGoal && a <= maxGoal) insideSquare += p;
    }
  }
  const actualOutsideMass = totalGrid - insideSquare;
  assert.ok(actualOutsideMass <= guaranteedTailUpperBound + 1e-9, `masse reelle hors-carre (${actualOutsideMass}) ne doit jamais depasser la borne garantie (${guaranteedTailUpperBound})`);
});

test("buildSharedGammaMatrix (API lambda, resout theta en interne) : matrice normalisee, aucune valeur negative/NaN/Inf, somme==1 a tolerance pres, deterministe, mean-preservation exposee", () => {
  const r1 = buildSharedGammaMatrix(1.5, 1.2, 5, RHO);
  const r2 = buildSharedGammaMatrix(1.5, 1.2, 5, RHO);
  assert.deepEqual(r1.matrix, r2.matrix, "determinisme strict : memes entrees -> meme matrice");
  assert.ok(Math.abs(r1.normalizedSum - 1) < 1e-9);
  assert.ok(r1.guaranteedTailUpperBound < TAIL_THRESHOLD);
  assert.ok(Math.abs(r1.thetaResidualH) <= 1e-9, "theta doit atteindre la moyenne cible lambdaH a tolerance pres");
  assert.ok(Math.abs(r1.thetaResidualA) <= 1e-9);
  for (const row of r1.matrix) {
    for (const p of row) {
      assert.ok(Number.isFinite(p), "aucune valeur NaN/Inf");
      assert.ok(p >= 0, "aucune valeur negative");
    }
  }
});

test("buildSharedGammaMatrix : plusieurs (lambdaHome,lambdaAway,kappa) realistes dans le domaine kappa>=1 pre-enregistre produisent tous une matrice valide", () => {
  const cases = [[0.8, 0.9, 3], [1.5, 1.2, 1], [2.6, 2.7, 50], [3.4, 3.0, 1000], [0.5, 0.5, 2]];
  for (const [lambdaH, lambdaA, kappa] of cases) {
    const r = buildSharedGammaMatrix(lambdaH, lambdaA, kappa, RHO);
    assert.ok(Math.abs(r.normalizedSum - 1) < 1e-9, `lambdaH=${lambdaH} lambdaA=${lambdaA} kappa=${kappa}`);
    assert.ok(r.maxGoal <= HARD_SAFETY_CAP);
  }
});

test("kappa sous le domaine pre-enregistre (kappa=0.05, tres inferieur a KAPPA_MIN_ROBUST=1) : le SOLVEUR theta echoue explicitement avant meme la construction de la matrice - jamais une matrice fabriquee sur une base invalide", () => {
  assert.throws(
    () => buildSharedGammaMatrix(2.0, 2.0, 0.05, RHO),
    (err) => ["MAX_ITERATIONS_EXCEEDED", "M5_INVALID_PARAMETER_REGION", "BACKTRACKING_EXHAUSTED", "JACOBIAN_SINGULAR"].includes(err.code)
  );
});

test("M5_TAIL_TRUNCATION_FAILURE : sur l'API theta explicite (bas niveau), un theta extreme dont la queue reste trop lourde leve une erreur explicite avec le bon code", () => {
  assert.throws(
    () => buildSharedGammaMatrixFromTheta(2.0, 2.0, 0.05, RHO),
    (err) => err.code === "M5_TAIL_TRUNCATION_FAILURE"
  );
});

test("marginalCdf est croissante et tend vers 1", () => {
  let prev = 0;
  for (const M of [0, 5, 20, 100, 300]) {
    const c = marginalCdf(M, 3, 2);
    assert.ok(c >= prev - 1e-15);
    prev = c;
  }
  assert.ok(Math.abs(prev - 1) < 1e-6);
});
