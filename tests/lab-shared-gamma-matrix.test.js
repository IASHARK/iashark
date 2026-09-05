"use strict";
// EXP-005 item 15 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - contrats sur
// la matrice adaptative shared-gamma+DC : borne d'union valide (pas
// CDF_H*CDF_A, la distribution est dependante), matrice sans NaN/Inf/
// negatif, somme normalisee ~1, safety cap, determinisme.

const test = require("node:test");
const assert = require("node:assert/strict");
const { findAdaptiveMaxGoal, buildSharedGammaMatrix, marginalCdf, TAIL_THRESHOLD, HARD_SAFETY_CAP } = require("../lib/lab/shared-gamma-matrix.js");
const { probabilityM5 } = require("../lib/lab/shared-gamma-dc.js");

const RHO = -0.0845;

test("findAdaptiveMaxGoal : la borne d'union garantie au maxGoal retourne est <1e-10", () => {
  const { maxGoal, guaranteedTailUpperBound } = findAdaptiveMaxGoal(1.5, 1.2, 5, RHO);
  assert.ok(guaranteedTailUpperBound < TAIL_THRESHOLD);
  assert.ok(maxGoal >= 2);
});

test("la borne d'union garantie est bien un MAJORANT reel de la masse hors-carre exacte (verifiee par sommation directe de probabilityM5)", () => {
  const muH = 1.5, muA = 1.2, kappa = 5;
  const { maxGoal, guaranteedTailUpperBound } = findAdaptiveMaxGoal(muH, muA, kappa, RHO);
  // masse EXACTE hors du carre 0..maxGoal, calculee sur une grille bien plus large (0..maxGoal+50) pour approximer l'infini
  const bigM = maxGoal + 50;
  let insideSquare = 0, totalGrid = 0;
  for (let h = 0; h <= bigM; h++) {
    for (let a = 0; a <= bigM; a++) {
      const p = probabilityM5(muH, muA, h, a, kappa, RHO);
      totalGrid += p;
      if (h <= maxGoal && a <= maxGoal) insideSquare += p;
    }
  }
  const actualOutsideMass = totalGrid - insideSquare; // sous-estime legerement (grille finie), mais suffisant pour verifier le sens de l'inegalite
  assert.ok(actualOutsideMass <= guaranteedTailUpperBound + 1e-9, `masse reelle hors-carre (${actualOutsideMass}) ne doit jamais depasser la borne garantie (${guaranteedTailUpperBound})`);
});

test("buildSharedGammaMatrix : matrice normalisee, aucune valeur negative/NaN/Inf, somme==1 a tolerance pres, deterministe", () => {
  const r1 = buildSharedGammaMatrix(1.5, 1.2, 5, RHO);
  const r2 = buildSharedGammaMatrix(1.5, 1.2, 5, RHO);
  assert.deepEqual(r1.matrix, r2.matrix, "determinisme strict : memes entrees -> meme matrice");
  assert.ok(Math.abs(r1.normalizedSum - 1) < 1e-9);
  assert.ok(r1.guaranteedTailUpperBound < TAIL_THRESHOLD);
  for (const row of r1.matrix) {
    for (const p of row) {
      assert.ok(Number.isFinite(p), "aucune valeur NaN/Inf");
      assert.ok(p >= 0, "aucune valeur negative");
    }
  }
});

test("buildSharedGammaMatrix : plusieurs (muHome,muAway,kappa) realistes produisent tous une matrice valide", () => {
  const cases = [[0.8, 0.9, 3], [1.5, 1.2, 0.5], [2.6, 2.7, 50], [3.4, 3.0, 1000], [0.5, 0.5, 2]];
  for (const [muH, muA, kappa] of cases) {
    const r = buildSharedGammaMatrix(muH, muA, kappa, RHO);
    assert.ok(Math.abs(r.normalizedSum - 1) < 1e-9, `muH=${muH} muA=${muA} kappa=${kappa}`);
    assert.ok(r.maxGoal <= HARD_SAFETY_CAP);
  }
});

test("M5_TAIL_TRUNCATION_FAILURE : kappa extremement petit (queue trop lourde) leve une erreur explicite avec le bon code", () => {
  assert.throws(
    () => buildSharedGammaMatrix(2.0, 2.0, 0.05, RHO),
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
