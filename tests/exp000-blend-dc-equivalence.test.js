"use strict";
// GATE A7 item 2 (SPEC LAB PRO v1.0) - version test permanente de EXP-000
// (scripts/experiments/exp000_blend_equivalence.js, execute une fois pour
// PASS/FAIL et rapport). Verifie que 0.35*Poisson+0.65*DC(rho=-0.13) reste
// algebriquement equivalent a DC(rho=-0.0845) - si ce test casse un jour,
// c'est que quelqu'un a touche a poissonProb/dixonColesCorr/blendMatrices
// d'une facon qui romprait la justification mathematique de M0 (SPEC LAB
// PRO v1.0 §3).

const test = require("node:test");
const assert = require("node:assert/strict");
const { poissonProb } = require("../lib/models.js");
const { buildPoissonMatrix, blendMatrices, deriveMarketsFromMatrix } = require("../lib/markets/score-matrix.js");

const MAX_GOALS = 10;
const TOLERANCE = 1e-12;

function dixonColesCorrParam(h, a, lambdaH, lambdaA, rho) {
  if (h === 0 && a === 0) return 1 - lambdaH * lambdaA * rho;
  if (h === 1 && a === 0) return 1 + lambdaA * rho;
  if (h === 0 && a === 1) return 1 + lambdaH * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}
function buildDixonColesMatrixParam(lambdaH, lambdaA, maxGoals, rho) {
  const mat = [];
  for (let h = 0; h <= maxGoals; h++) {
    mat[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      mat[h][a] = Math.max(0, poissonProb(lambdaH, h) * poissonProb(lambdaA, a) * dixonColesCorrParam(h, a, lambdaH, lambdaA, rho));
    }
  }
  return mat;
}

const TEST_PAIRS = [
  [1.0, 1.0], [1.35, 1.10], [0.80, 0.80], [3.40, 3.00], [0.80, 3.00], [3.40, 0.80],
  [2.0, 2.0], [2.605, 2.674], // lambdas reels max production
];

test("EXP-000: blend 0.35*Poisson+0.65*DC(-0.13) == DC(-0.0845) pur, cellule par cellule (tolerance 1e-12)", () => {
  for (const [lh, la] of TEST_PAIRS) {
    const poissonMatrix = buildPoissonMatrix(lh, la, MAX_GOALS);
    // Note : depuis GATE A3, lib/models.js#dixonColesCorr utilise deja
    // rho=-0.0845 en production (buildDixonColesMatrix importe n'est donc
    // plus le champion historique -0.13). On reconstruit ce champion -0.13
    // localement (dixonColesCorrParam) pour que ce test reste une preuve
    // independante de l'etat courant de dixonColesCorr, pas une tautologie.
    const dixonMatrixHistorical013 = buildDixonColesMatrixParam(lh, la, MAX_GOALS, -0.13);
    const championOld = blendMatrices([{ matrix: poissonMatrix, weight: 0.35 }, { matrix: dixonMatrixHistorical013, weight: 0.65 }]);
    const candidateNew = blendMatrices([{ matrix: buildDixonColesMatrixParam(lh, la, MAX_GOALS, -0.0845), weight: 1 }]);

    let maxDelta = 0;
    for (let h = 0; h <= MAX_GOALS; h++) {
      for (let a = 0; a <= MAX_GOALS; a++) {
        maxDelta = Math.max(maxDelta, Math.abs(championOld[h][a] - candidateNew[h][a]));
      }
    }
    assert.ok(maxDelta <= TOLERANCE, `lambdaH=${lh} lambdaA=${la}: delta max ${maxDelta} > ${TOLERANCE}`);

    const marketsOld = deriveMarketsFromMatrix(championOld);
    const marketsNew = deriveMarketsFromMatrix(candidateNew);
    for (const f of ["p1", "pN", "p2"]) {
      assert.ok(Math.abs(marketsOld[f] - marketsNew[f]) <= TOLERANCE, `${f} diverge pour lambdaH=${lh} lambdaA=${la}`);
    }
    for (const line of [1.5, 2.5, 3.5]) {
      assert.ok(
        Math.abs(marketsOld.overUnder[line].over - marketsNew.overUnder[line].over) <= TOLERANCE,
        `OU${line} diverge pour lambdaH=${lh} lambdaA=${la}`
      );
    }
  }
});
