"use strict";
// PLAYER SCORER V2 (2026-09-05, passe FIT_NUMERICAL_CLOSURE). Modele de
// risque relatif eta_i(c) = alpha_position + beta1*X_goal + beta2*X_shot
// + beta3*X_sot, ajuste par NEWTON-RAPHSON EXACT sur la partial
// likelihood conditionnelle (structure identique a Cox PH / conditional
// logit multinomial) :
//   logL = Sum_e [ eta_{y(e)} - logsumexp_{j in R_e}(eta_j) ]
// Gradient et Hessian ANALYTIQUES (pas d'approximation numerique) - la
// log-vraisemblance est concave en theta=(alpha_position,beta). Aucun
// coefficient choisi a la main.
//
// == IDENTIFICATION_CONSTRAINT ==
// Le softmax est invariant a l'ajout d'une constante a tous les eta
// d'un risk-set. L'encodage initial (5 dummies de position, saturant
// F/M/D/G/UNKNOWN sans reference) portait donc une direction NON
// IDENTIFIEE : theta' = theta + c*(1,1,1,1,1,0,0,0) laisse logL
// inchange pour TOUT c. On leve ce degre de liberte de translation en
// fixant UNKNOWN comme niveau de REFERENCE (alpha_UNKNOWN=0, implicite,
// jamais estime) : POSITION_ORDER=["F","M","D","G"], et un joueur de
// groupe UNKNOWN (ou non reconnu) a un design vector dont le bloc
// position est entierement nul. C'est une reparametrisation strictement
// EQUIVALENTE du meme modele (memes probabilites, meme logL pour tout
// theta atteignable) - PAS un changement de la vraisemblance.
//
// == PENALIZED OBJECTIVE (correction du vrai blocker FIT_NUMERICAL) ==
// objectif optimise = penalized_logL(theta) = logL(theta) - (ridge/2)*||theta||^2
// grad_penalized = grad_logL(theta) - ridge*theta
// hess_penalized  = hess_logL(theta) - ridge*I
// CONSTAT (version precedente) : le point fixe de Newton utilisait le
// HESSIEN regularise mais le GRADIENT BRUT (non penalise) - le point
// fixe (delta=0) exigeait donc grad_logL=0, soit le MLE NON PENALISE,
// dont le ridge dans le Hessien ne faisait qu'AMORTIR le pas sans
// jamais deplacer la cible. Pour les gardiens (quasi-separation :
// n'ouvrent presque jamais le score en open-play), ce MLE non penalise
// est a l'infini => non-convergence reelle et non un artefact de tol.
// Ridge=1e-1 sur un objectif PENALISE (grad et hess tous deux
// regularises, comme ci-dessus) a un maximum GLOBAL UNIQUE et FINI
// (hess_penalized est definie negative partout : hess_logL est semi-
// definie negative par concavite, -ridge*I la rend strictement
// definie negative), donc alpha_G/beta_goal convergent desormais eux
// aussi a un point stationnaire fini et reproductible (voir multi-start
// ci-dessous). Le ridge reste un prior faiblement informatif
// Normal(0,1/ridge) sur chaque parametre - un dispositif de stabilite
// numerique documente, pas un choix scientifique sur le signal.
//
// == CRITERE DE CONVERGENCE ==
// converged=true ssi, APRES un pas Newton+line-search :
//   relative_objective_change = |obj_new - obj_old| / max(1,|obj_old|) < objTol (1e-9)
// ET
//   max_abs_gradient (du gradient PENALISE, au nouveau theta) < gradTol (1e-6)
// Un simple pas de parametres petit ne suffit plus (l'ancien critere
// euclidien pouvait etre trompeur sur une direction quasi-plate).
// Line-search (backtracking, objectif garanti croissant a chaque pas
// accepte) ajoutee car un pas Newton plein peut depasser l'optimum tres
// loin de la region quadratique, notamment tot dans le fit.

const { softmax } = require("./attribution-v2.js");

const POSITION_ORDER = ["F", "M", "D", "G"]; // "UNKNOWN" = reference (alpha fixe a 0, jamais estime) - voir IDENTIFICATION_CONSTRAINT
const N_FEATURES = 3; // X_goal, X_shot, X_sot
const N_PARAMS = POSITION_ORDER.length + N_FEATURES;

const RIDGE_REGULARIZATION = 1e-1; // prior Normal(0, 1/ridge) par parametre - choisi sur TRAIN/stabilite numerique uniquement, jamais sur OOS
const GRADIENT_TOLERANCE = 1e-6;
const OBJECTIVE_RELATIVE_TOLERANCE = 1e-9;
const DEFAULT_MAX_ITER = 100;
const MAX_LINE_SEARCH_BACKTRACKS = 40;
const SINGULAR_PIVOT_THRESHOLD = 1e-12;

function designVector(positionGroup, xGoal, xShot, xSot) {
  const v = new Array(N_PARAMS).fill(0);
  const idx = POSITION_ORDER.indexOf(positionGroup); // -1 pour UNKNOWN/groupe non reconnu -> bloc position tout a zero (reference)
  if (idx >= 0) v[idx] = 1;
  v[POSITION_ORDER.length] = xGoal;
  v[POSITION_ORDER.length + 1] = xShot;
  v[POSITION_ORDER.length + 2] = xSot;
  return v;
}

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

// events = [{ riskSetDesignVectors: [x_j,...], scorerIndex }]. Gradient
// et Hessian de la log-vraisemblance BRUTE (non penalisee) - inchange
// depuis la version precedente, c'est un calcul exact, pas la source du
// probleme.
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

// Objectif PENALISE et ses derivees - c'est CECI que Newton optimise
// desormais (grad ET hess penalises, coherents entre eux).
function computePenalizedObjective(events, theta, ridge) {
  const { grad, hess, logL } = computeGradientAndHessian(events, theta);
  const p = theta.length;
  const objective = logL - (ridge / 2) * theta.reduce((s, t) => s + t * t, 0);
  const gradPenalized = grad.map((g, i) => g - ridge * theta[i]);
  const hessPenalized = hess.map((row, i) => row.map((v, j) => (i === j ? v - ridge : v)));
  return { objective, gradPenalized, hessPenalized, rawLogL: logL };
}

// Gauss-Jordan avec pivot partiel : resout A x = b. Rapporte si un
// pivot a du etre saute (quasi-singulier) - avec l'objectif penalise,
// A=hess_penalized est definie negative partout (valeurs propres <=
// -ridge < 0), donc ce cas ne devrait plus survenir en pratique ; on le
// rapporte explicitement plutot que de le masquer.
function solveLinearSystem(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  let singular = false;
  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivotRow][col])) pivotRow = r;
    [M[col], M[pivotRow]] = [M[pivotRow], M[col]];
    const pivotVal = M[col][col];
    if (Math.abs(pivotVal) < SINGULAR_PIVOT_THRESHOLD) { singular = true; continue; }
    for (let k = col; k <= n; k++) M[col][k] /= pivotVal;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = M[r][col];
      for (let k = col; k <= n; k++) M[r][k] -= factor * M[col][k];
    }
  }
  return { solution: M.map((row) => row[n]), singular };
}

function maxAbs(arr) { return arr.reduce((m, v) => Math.max(m, Math.abs(v)), 0); }

// Newton amorti (line-search backtracking) sur l'objectif PENALISE,
// depuis un theta0 explicite - permet le multi-start (item 6). Rapporte
// tous les diagnostics demandes (item 5) : iterations, objectif
// initial/final, gradient max, variation relative, statut du solve,
// raison de convergence.
function fitRelativeRiskModelFrom(events, theta0, maxIter, gradTol, objTol) {
  maxIter = maxIter || DEFAULT_MAX_ITER;
  gradTol = gradTol || GRADIENT_TOLERANCE;
  objTol = objTol || OBJECTIVE_RELATIVE_TOLERANCE;

  let theta = theta0.slice();
  let current = computePenalizedObjective(events, theta, RIDGE_REGULARIZATION);
  const objectiveInitial = current.objective;

  let nIter = 0;
  let converged = false;
  let convergenceReason = "MAX_ITERATIONS_REACHED";
  let solveStatus = "OK";
  let relObjectiveChange = Infinity;
  let maxAbsGradient = maxAbs(current.gradPenalized);

  for (; nIter < maxIter; nIter++) {
    if (maxAbsGradient < gradTol && relObjectiveChange < objTol) {
      converged = true; convergenceReason = "OBJECTIVE_AND_GRADIENT_TOLERANCE_MET"; break;
    }

    const solved = solveLinearSystem(current.hessPenalized, current.gradPenalized);
    if (solved.singular) solveStatus = "NEAR_SINGULAR_HESSIAN_PIVOT_FLOORED";

    let step = 1;
    let candidateTheta = theta.map((t, i) => t - step * solved.solution[i]);
    let candidate = computePenalizedObjective(events, candidateTheta, RIDGE_REGULARIZATION);
    let backtracks = 0;
    while (candidate.objective < current.objective && backtracks < MAX_LINE_SEARCH_BACKTRACKS) {
      step *= 0.5;
      candidateTheta = theta.map((t, i) => t - step * solved.solution[i]);
      candidate = computePenalizedObjective(events, candidateTheta, RIDGE_REGULARIZATION);
      backtracks++;
    }
    if (backtracks >= MAX_LINE_SEARCH_BACKTRACKS && candidate.objective < current.objective) {
      convergenceReason = "LINE_SEARCH_STALLED"; theta = candidateTheta; current = candidate; nIter++; break;
    }

    relObjectiveChange = Math.abs(candidate.objective - current.objective) / Math.max(1, Math.abs(current.objective));
    theta = candidateTheta;
    current = candidate;
    maxAbsGradient = maxAbs(current.gradPenalized);
  }

  if (!converged && maxAbsGradient < gradTol && relObjectiveChange < objTol) {
    converged = true; convergenceReason = "OBJECTIVE_AND_GRADIENT_TOLERANCE_MET";
  }

  return {
    theta,
    logL: current.rawLogL,
    penalized_objective: current.objective,
    objective_initial: objectiveInitial,
    objective_final: current.objective,
    relative_objective_change: relObjectiveChange,
    max_abs_gradient: maxAbsGradient,
    n_iterations: nIter,
    converged,
    convergence_reason: convergenceReason,
    solve_status: solveStatus,
    ridge: RIDGE_REGULARIZATION,
    position_order: POSITION_ORDER,
  };
}

function fitRelativeRiskModel(events, maxIter, gradTol, objTol) {
  return fitRelativeRiskModelFrom(events, new Array(N_PARAMS).fill(0), maxIter, gradTol, objTol);
}

// item 6 : au moins 5 initialisations DETERMINISTES raisonnables (pas
// de tirage aleatoire) couvrant des regions distinctes de l'espace des
// parametres, y compris une initialisation deliberement "mal orientee"
// (start 5) pour stresser la robustesse du line-search.
function deterministicMultiStartThetas() {
  const zeros = new Array(N_PARAMS).fill(0);
  const smallPositive = new Array(N_PARAMS).fill(0.5);
  const smallNegative = new Array(N_PARAMS).fill(-0.5);
  const positionInformed = [1, 0, -1, -3, 0.3, 0.3, 0.3]; // F>M>D>G a priori, betas modestes positifs
  const adversarial = [-1, 0.5, 0.2, 2, -0.2, 0.5, 0.8]; // deliberement a contre-sens du prior de position
  return [zeros, smallPositive, smallNegative, positionInformed, adversarial];
}

function maxRiskSetProbDiff(events, thetaA, thetaB, sampleSize) {
  let maxDiff = 0;
  const n = sampleSize ? Math.min(sampleSize, events.length) : events.length;
  for (let idx = 0; idx < n; idx++) {
    const e = events[idx];
    const scoresA = e.riskSetDesignVectors.map((x) => dot(x, thetaA));
    const scoresB = e.riskSetDesignVectors.map((x) => dot(x, thetaB));
    const probsA = softmax(scoresA);
    const probsB = softmax(scoresB);
    for (let i = 0; i < probsA.length; i++) maxDiff = Math.max(maxDiff, Math.abs(probsA[i] - probsB[i]));
  }
  return maxDiff;
}

// Lance le fit depuis N initialisations deterministes distinctes et
// rapporte la stabilite (item 6). "same_optimum" : l'objectif penalise
// converge au meme point a tolerance numerique pres. "same_risk_set_probabilities" :
// les probabilites predites par risk-set concordent a tolerance stricte
// - c'est le critere qui compte scientifiquement (deux thetas peuvent
// legerement differer sur un axe faiblement identifie tout en donnant
// des probabilites identiques ; on le rapporte explicitement si c'est
// le cas plutot que de le masquer).
function multiStartStability(events, maxIter, gradTol, objTol, starts) {
  starts = starts || deterministicMultiStartThetas();
  const fits = starts.map((t0) => fitRelativeRiskModelFrom(events, t0, maxIter, gradTol, objTol));

  const objectives = fits.map((f) => f.penalized_objective);
  const maxObjectiveSpread = Math.max(...objectives) - Math.min(...objectives);

  const betaStartIdx = POSITION_ORDER.length;
  const betaMaxSpread = [0, 1, 2].reduce((m, k) => {
    const vals = fits.map((f) => f.theta[betaStartIdx + k]);
    return Math.max(m, Math.max(...vals) - Math.min(...vals));
  }, 0);

  const anyNonFinite = fits.some((f) => !Number.isFinite(f.penalized_objective) || f.theta.some((v) => !Number.isFinite(v)));

  let maxProbSpreadAcrossStarts = 0;
  const reference = fits[0].theta;
  for (let i = 1; i < fits.length; i++) {
    maxProbSpreadAcrossStarts = Math.max(maxProbSpreadAcrossStarts, maxRiskSetProbDiff(events, reference, fits[i].theta, 500));
  }

  return {
    n_starts: fits.length,
    fits,
    max_objective_spread: maxObjectiveSpread,
    beta_max_spread: betaMaxSpread,
    max_risk_set_probability_spread: maxProbSpreadAcrossStarts,
    any_non_finite: anyNonFinite,
    all_converged: fits.every((f) => f.converged),
  };
}

module.exports = {
  POSITION_ORDER, N_PARAMS, designVector, computeGradientAndHessian, computePenalizedObjective,
  solveLinearSystem, fitRelativeRiskModel, fitRelativeRiskModelFrom, deterministicMultiStartThetas,
  multiStartStability, maxRiskSetProbDiff,
  RIDGE_REGULARIZATION, GRADIENT_TOLERANCE, OBJECTIVE_RELATIVE_TOLERANCE,
};
