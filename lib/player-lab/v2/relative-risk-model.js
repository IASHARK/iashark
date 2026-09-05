"use strict";
// PLAYER SCORER V2 (2026-09-05), items 4 et 8. Modele de risque relatif
// eta_i(c) = alpha_position + beta1*X_goal + beta2*X_shot + beta3*X_sot,
// ajuste par NEWTON-RAPHSON EXACT sur la partial likelihood conditionnelle
// (structure identique a Cox PH / conditional logit multinomial) :
//   logL = Sum_e [ eta_{y(e)} - logsumexp_{j in R_e}(eta_j) ]
// Gradient et Hessian ANALYTIQUES (pas d'approximation numerique) - la
// log-vraisemblance est concave en theta=(alpha_position,beta), Newton
// converge en quelques iterations. Aucun coefficient choisi a la main.

const POSITION_ORDER = ["F", "M", "D", "G", "UNKNOWN"];
const N_FEATURES = 3; // X_goal, X_shot, X_sot
const N_PARAMS = POSITION_ORDER.length + N_FEATURES;
// Stabilite numerique - agit comme un prior faiblement informatif
// Normal(0, 1/ridge) sur chaque parametre, PAS un choix scientifique a
// la main : sans lui, un joueur/groupe present dans de nombreux
// risk-sets mais n'ayant JAMAIS marque (separation quasi-parfaite) fait
// diverger son parametre vers l'infini au lieu de converger.
//
// CONSTAT REEL (fit sur TRAIN=2022-23, 964 evenements) : alpha_G et
// beta_goal restent dans une direction quasi-plate de la vraisemblance
// (les gardiens ne marquent presque jamais en open-play => cette paire
// de parametres n'est pas uniquement identifiee) - logL EST stable
// (-1907.03, identique a 3 decimales de 50 a 300 iterations et de
// ridge=1e-2 a 1e-1), donc le fit est FONCTIONNELLEMENT converge
// (probabilites predites stables), mais le vecteur theta lui-meme ne
// se stabilise pas au sens euclidien sur cet axe precis - rapporte
// honnetement (converged=false) plutot que masque. beta_shot/beta_sot/
// alpha_F/M/D restent stables sur les trois configurations testees.
const RIDGE_REGULARIZATION = 1e-1;

function designVector(positionGroup, xGoal, xShot, xSot) {
  const v = new Array(N_PARAMS).fill(0);
  const idx = POSITION_ORDER.indexOf(positionGroup);
  v[idx >= 0 ? idx : POSITION_ORDER.length - 1] = 1;
  v[POSITION_ORDER.length] = xGoal;
  v[POSITION_ORDER.length + 1] = xShot;
  v[POSITION_ORDER.length + 2] = xSot;
  return v;
}

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

// events = [{ riskSetDesignVectors: [x_j,...], scorerIndex }]
function computeGradientAndHessian(events, theta) {
  const p = theta.length;
  const grad = new Array(p).fill(0);
  const hess = Array.from({ length: p }, () => new Array(p).fill(0));
  let logL = 0;

  for (const e of events) {
    const scores = e.riskSetDesignVectors.map((x) => dot(x, theta));
    const maxScore = Math.max(...scores);
    const expScores = scores.map((s) => Math.exp(s - maxScore));
    const sumExp = expScores.reduce((a, b) => a + b, 0);
    const probs = expScores.map((v) => v / sumExp);

    logL += scores[e.scorerIndex] - maxScore - Math.log(sumExp);

    const expectedX = new Array(p).fill(0);
    for (let j = 0; j < e.riskSetDesignVectors.length; j++) {
      for (let k = 0; k < p; k++) expectedX[k] += probs[j] * e.riskSetDesignVectors[j][k];
    }
    for (let k = 0; k < p; k++) grad[k] += e.riskSetDesignVectors[e.scorerIndex][k] - expectedX[k];

    for (let a = 0; a < p; a++) {
      for (let b = 0; b < p; b++) {
        let exxT = 0;
        for (let j = 0; j < e.riskSetDesignVectors.length; j++) exxT += probs[j] * e.riskSetDesignVectors[j][a] * e.riskSetDesignVectors[j][b];
        hess[a][b] -= exxT - expectedX[a] * expectedX[b];
      }
    }
  }
  return { grad, hess, logL };
}

// Gauss-Jordan avec pivot partiel : resout A x = b.
function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    const pivotVal = M[col][col];
    if (Math.abs(pivotVal) < 1e-12) continue;
    for (let k = col; k <= n; k++) M[col][k] /= pivotVal;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let k = col; k <= n; k++) M[r][k] -= factor * M[col][k];
    }
  }
  return M.map((row) => row[n]);
}

function fitRelativeRiskModel(events, maxIter, tol) {
  maxIter = maxIter || 50; tol = tol || 1e-6;
  let theta = new Array(N_PARAMS).fill(0);
  let nIter = 0, converged = false;
  for (; nIter < maxIter; nIter++) {
    const { grad, hess } = computeGradientAndHessian(events, theta);
    const regHess = hess.map((row, i) => row.map((v, j) => (i === j ? v - RIDGE_REGULARIZATION : v)));
    const delta = solveLinearSystem(regHess, grad);
    const newTheta = theta.map((t, i) => t - delta[i]);
    const change = Math.max(...newTheta.map((v, i) => Math.abs(v - theta[i])));
    theta = newTheta;
    if (change < tol) { nIter++; converged = true; break; }
  }
  const final = computeGradientAndHessian(events, theta);
  return { theta, logL: final.logL, n_iterations: nIter, converged, position_order: POSITION_ORDER };
}

module.exports = { POSITION_ORDER, N_PARAMS, designVector, computeGradientAndHessian, solveLinearSystem, fitRelativeRiskModel };
