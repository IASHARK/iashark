"use strict";
// EXP-004 item 5 (SPEC LAB PRO v1.0, M4 NB2) - matrice de score ADAPTATIVE
// pour NB2, jamais le tail Poisson reutilise. Choisit le plus petit
// entier M tel que tail_mass = 1 - CDF_NB(M;muH,kappa)*CDF_NB(M;muA,kappa)
// < 1e-10, construit la matrice carree 0..M x 0..M, normalise, verifie
// l'absence de NaN/Inf/valeur negative. AUCUN tau Dixon-Coles n'est
// applique ici - M4 remplace la famille de distribution, ne la corrige
// pas (voir header lib/lab/walkforward-m4-runner.js).

const crypto = require("crypto");
const { pmfNB2, cdfNB2 } = require("./nb2.js");

const TAIL_THRESHOLD = 1e-10;
const HARD_SAFETY_CAP = 100;

// Retourne { maxGoal, tailMass } ou leve NB_TAIL_TRUNCATION_FAILURE si le
// seuil n'est jamais atteint avant le safety cap.
function findAdaptiveMaxGoal(muHome, muAway, kappa) {
  for (let M = 0; M <= HARD_SAFETY_CAP; M++) {
    const cdfH = cdfNB2(M, muHome, kappa);
    const cdfA = cdfNB2(M, muAway, kappa);
    const tailMass = 1 - cdfH * cdfA; // AVANT normalisation, calcule directement sur les CDF exactes
    if (tailMass < TAIL_THRESHOLD) return { maxGoal: M, tailMass };
  }
  const err = new Error(`NB_TAIL_TRUNCATION_FAILURE: tail_mass n'a pas atteint <${TAIL_THRESHOLD} avant le safety cap M<=${HARD_SAFETY_CAP} (muHome=${muHome}, muAway=${muAway}, kappa=${kappa})`);
  err.code = "NB_TAIL_TRUNCATION_FAILURE";
  throw err;
}

// Construit la matrice NB2 adaptative complete. Retourne
// { matrix, maxGoal, tailMass, matrixHash } - matrix[h][a] normalisee
// (somme==1 a la tolerance pres), AUCUNE valeur negative/NaN/Inf.
function buildNb2Matrix(muHome, muAway, kappa) {
  const { maxGoal, tailMass } = findAdaptiveMaxGoal(muHome, muAway, kappa);

  const rawMatrix = [];
  let rawSum = 0;
  for (let h = 0; h <= maxGoal; h++) {
    const row = new Array(maxGoal + 1);
    const pH = pmfNB2(h, muHome, kappa);
    for (let a = 0; a <= maxGoal; a++) {
      const pA = pmfNB2(a, muAway, kappa);
      const p = pH * pA;
      row[a] = p;
      rawSum += p;
    }
    rawMatrix.push(row);
  }

  if (!(rawSum > 0) || !Number.isFinite(rawSum)) {
    throw new Error(`buildNb2Matrix: somme brute invalide (${rawSum}) avant normalisation - muHome=${muHome}, muAway=${muAway}, kappa=${kappa}`);
  }

  const matrix = rawMatrix.map((row) => row.map((p) => p / rawSum));

  let normalizedSum = 0;
  for (const row of matrix) {
    for (const p of row) {
      if (!Number.isFinite(p)) throw new Error(`buildNb2Matrix: valeur non-finie apres normalisation (muHome=${muHome}, muAway=${muAway}, kappa=${kappa})`);
      if (p < 0) throw new Error(`buildNb2Matrix: valeur negative apres normalisation (${p})`);
      normalizedSum += p;
    }
  }
  if (Math.abs(normalizedSum - 1) > 1e-9) {
    throw new Error(`buildNb2Matrix: somme apres normalisation=${normalizedSum}, attendu ~1 (tolerance 1e-9)`);
  }

  const matrixHash = crypto.createHash("sha256").update(JSON.stringify(matrix)).digest("hex");

  return { matrix, maxGoal, tailMass, normalizedSum, matrixHash };
}

module.exports = { findAdaptiveMaxGoal, buildNb2Matrix, TAIL_THRESHOLD, HARD_SAFETY_CAP };
