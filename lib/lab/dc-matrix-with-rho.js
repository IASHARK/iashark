"use strict";
// GATE C1 (SPEC LAB PRO v1.0) - construit la matrice/marches Dixon-Coles
// pour un rho ARBITRAIRE (celui appris par M1 a un cutoff donne), avec la
// MEME troncature adaptative que la production (lib/markets/score-matrix.js
// #buildAdaptiveDixonColesMatrix reutilise, pas reimplemente). lib/engine.js
// reste fige sur le rho de production (lib/models.js, constante M0) - ce
// module est le seul point ou un rho variable rencontre la troncature
// adaptative et la derivation de marches, exclusivement pour le
// laboratoire d'experimentation, jamais pour la production.

const { poissonProb } = require("../models.js");
const { deriveMarketsFromMatrix } = require("../markets/score-matrix.js");

const ADAPTIVE_MIN_GOALS = 10;
const ADAPTIVE_STEP = 5;
const ADAPTIVE_SAFETY_CAP = 60;
const ADAPTIVE_TAIL_MASS_THRESHOLD = 1e-10;

function tauParam(h, a, lambdaH, lambdaA, rho) {
  if (h === 0 && a === 0) return 1 - lambdaH * lambdaA * rho;
  if (h === 1 && a === 0) return 1 + lambdaA * rho;
  if (h === 0 && a === 1) return 1 + lambdaH * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

function buildMatrix(lambdaH, lambdaA, rho, maxGoals) {
  const mat = [];
  for (let h = 0; h <= maxGoals; h++) {
    mat[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      mat[h][a] = Math.max(0, poissonProb(lambdaH, h) * poissonProb(lambdaA, a) * tauParam(h, a, lambdaH, lambdaA, rho));
    }
  }
  return mat;
}

function tailMassAt(lambdaH, lambdaA, rho, maxGoals) {
  let sum = 0;
  for (let h = 0; h <= maxGoals; h++) for (let a = 0; a <= maxGoals; a++) sum += poissonProb(lambdaH, h) * poissonProb(lambdaA, a) * tauParam(h, a, lambdaH, lambdaA, rho);
  return 1 - sum;
}

function buildAdaptiveMatrix(lambdaH, lambdaA, rho) {
  let maxGoals = ADAPTIVE_MIN_GOALS;
  let mass = tailMassAt(lambdaH, lambdaA, rho, maxGoals);
  while (mass >= ADAPTIVE_TAIL_MASS_THRESHOLD) {
    maxGoals += ADAPTIVE_STEP;
    if (maxGoals > ADAPTIVE_SAFETY_CAP) {
      throw new Error(`buildAdaptiveMatrix: safety cap atteint pour lambdaH=${lambdaH} lambdaA=${lambdaA} rho=${rho}`);
    }
    mass = tailMassAt(lambdaH, lambdaA, rho, maxGoals);
  }
  return { matrix: buildMatrix(lambdaH, lambdaA, rho, maxGoals), maxGoal: maxGoals, tailMass: mass };
}

function renormalize(matrix) {
  let total = 0;
  for (const row of matrix) for (const v of row) total += v;
  if (total > 0) return matrix.map((row) => row.map((v) => v / total));
  return matrix;
}

// API principale : construit matrice normalisee + marches derives pour
// (lambdaH, lambdaA, rho) - meme forme de sortie (deriveMarketsFromMatrix)
// que la production, pour rester directement comparable a calcFinalProbs.
function predictWithRho(lambdaH, lambdaA, rho) {
  const adaptive = buildAdaptiveMatrix(lambdaH, lambdaA, rho);
  const normalized = renormalize(adaptive.matrix);
  const markets = deriveMarketsFromMatrix(normalized);
  return { matrix: normalized, markets, maxGoal: adaptive.maxGoal, tailMass: adaptive.tailMass };
}

module.exports = { predictWithRho, buildAdaptiveMatrix, tauParam };
