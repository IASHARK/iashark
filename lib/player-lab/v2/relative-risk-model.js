"use strict";
// PLAYER SCORER V2 (2026-09-05, passe CODING_INVARIANCE). Modele de
// risque relatif eta_i(c) = alpha_position + beta1*X_goal + beta2*X_shot
// + beta3*X_sot, ajuste par NEWTON-RAPHSON EXACT sur la partial
// likelihood conditionnelle (structure identique a Cox PH / conditional
// logit multinomial) :
//   logL = Sum_e [ eta_{y(e)} - logsumexp_{j in R_e}(eta_j) ]
// Gradient et Hessian ANALYTIQUES (pas d'approximation numerique) - la
// log-vraisemblance est concave en theta. Aucun coefficient choisi a la
// main.
//
// == IDENTIFICATION_CONSTRAINT (contrainte somme-a-zero, PAS reference-cell) ==
// Le softmax est invariant a l'ajout d'une constante a tous les eta
// d'un risk-set : la direction (1,1,1,1,1,0,0,0) sur 5 dummies de
// position saturants n'est pas identifiee par la vraisemblance seule.
// Une PREMIERE version de cette passe fixait UNKNOWN comme categorie de
// REFERENCE (alpha_UNKNOWN=0, jamais penalise) et appliquait un ridge
// L2 uniquement aux 4 alpha restants. Sous logL SEULE (non penalisee),
// ceci est une reparametrisation valide (memes probabilites quel que
// soit le theta atteint). MAIS avec un ridge applique tel quel aux
// coefficients LIBRES, le point PENALISE depend de la categorie choisie
// comme reference : ridge*Sum_{p!=ref}(alpha_p)^2 n'est PAS la meme
// quantite pour deux ref differentes, alors que le VRAI signal
// identifiable (les differences alpha_p - alpha_q) ne devrait pas en
// dependre. C'etait un bug de penalisation, confirme empiriquement
// (voir tests/player-lab-scorer-v2.test.js, "coding invariance").
//
// Fix : les 5 effets de position alpha_F,alpha_M,alpha_D,alpha_G,
// alpha_UNKNOWN sont contraints par Sum_p alpha_p = 0 (contrainte
// somme-a-zero / "sum-to-zero contrasts"), et le ridge penalise le
// vecteur CANONIQUE complet (les 5 alpha, sous la contrainte) plutot
// que les seuls coefficients libres d'un codage arbitraire :
//   penalty = (ridge/2) * Sum_{p in {F,M,D,G,UNKNOWN}} alpha_p^2
// Parametrisation : on choisit un theta a 4 degres de liberte (autant
// que necessaire, quel que soit le choix de la categorie "eliminee")
// via buildContrastMatrix(referenceCategory) - alpha_p = theta[j] pour
// les 4 categories "gardees", et alpha_ref = -Sum(theta) pour la
// categorie eliminee. Le vecteur alpha (5-dim, sous contrainte
// Sum=0) ainsi obtenu est un point UNIQUE de l'hyperplan {Sum=0},
// independant du choix de la categorie eliminee - donc
// Sum_p alpha_p^2 aussi, et le Hessien de penalite associe
// (A^T A ou A est la matrice de contraste) est ALGEBRIQUEMENT
// IDENTIQUE (= I_4 + J_4, la matrice tout-uns) quelle que soit la
// categorie eliminee (verifie dans les tests). Le fit final (et ses
// probabilites predites) est donc invariant au codage - PROUVE, pas
// suppose, par le test "coding invariance" qui refit reellement avec
// UNKNOWN/F/M/D chacun comme reference sur les memes evenements TRAIN.
// La production utilise DEFAULT_REFERENCE_CATEGORY="UNKNOWN" (choix
// arbitraire desormais SANS CONSEQUENCE par construction).
//
// == PENALIZED OBJECTIVE ==
// objectif optimise = penalized_logL(theta) = logL(theta) - (ridge/2)*theta^T @ M @ theta
// ou M (bloc position 4x4 = I+J, bloc features 3x3 = I) est la matrice
// de penalite CANONIQUE decrite ci-dessus (constante, ne depend pas de
// theta). grad_penalized = grad_logL - ridge*M@theta,
// hess_penalized = hess_logL - ridge*M. M est symetrique definie
// positive (valeurs propres du bloc position : {5,1,1,1} ; bloc
// features : {1,1,1}) donc hess_penalized est definie negative partout
// (hess_logL semi-definie negative par concavite, -ridge*M la rend
// strictement definie negative) : maximum global unique et FINI pour
// tout theta, y compris pour les gardiens en quasi-separation.
// Ridge=1e-1 reste un prior faiblement informatif, choisi sur
// TRAIN/stabilite numerique uniquement, jamais sur OOS.
//
// == CRITERE DE CONVERGENCE == (inchange depuis FIT_NUMERICAL_CLOSURE)
// converged=true ssi, APRES un pas Newton+line-search :
//   relative_objective_change < objTol (1e-9) ET max_abs_gradient < gradTol (1e-6)
// Newton amorti (line-search backtracking, objectif garanti croissant a
// chaque pas accepte).

const { softmax } = require("./attribution-v2.js");

const ALL_POSITION_GROUPS = ["F", "M", "D", "G", "UNKNOWN"]; // univers complet des categories, ordre de reference pour l'iteration
const DEFAULT_REFERENCE_CATEGORY = "UNKNOWN"; // choix arbitraire - SANS CONSEQUENCE sur le fit final (coding invariance, voir ci-dessus)
const N_FEATURES = 3; // X_goal, X_shot, X_sot

const RIDGE_REGULARIZATION = 1e-1; // prior sur les effets IDENTIFIABLES (alpha canonique, betas) - choisi sur TRAIN/stabilite numerique uniquement
const GRADIENT_TOLERANCE = 1e-6;
const OBJECTIVE_RELATIVE_TOLERANCE = 1e-9;
const DEFAULT_MAX_ITER = 100;
const MAX_LINE_SEARCH_BACKTRACKS = 40;
const SINGULAR_PIVOT_THRESHOLD = 1e-12;

// Contrainte somme-a-zero : "referenceCategory" est exprimee comme
// -(somme des 4 autres). kept = les 4 categories "libres" (dans l'ordre
// de ALL_POSITION_GROUPS, categorie de reference exclue). Retourne
// aussi, pour CHAQUE des 5 categories (kept + reference), le vecteur de
// contraste (longueur kept.length) tel que alpha_p = dot(contrast_p, theta_position).
function buildContrastMatrix(referenceCategory) {
  const kept = ALL_POSITION_GROUPS.filter((c) => c !== referenceCategory);
  const contrastByCategory = new Map();
  kept.forEach((c, j) => {
    const v = new Array(kept.length).fill(0);
    v[j] = 1;
    contrastByCategory.set(c, v);
  });
  contrastByCategory.set(referenceCategory, new Array(kept.length).fill(-1));
  return { kept, referenceCategory, contrastByCategory };
}

// A^T @ A ou A a une ligne par categorie (5 lignes, kept.length colonnes)
// - c'est la matrice de penalite du bloc position. ALGEBRIQUEMENT
// IDENTIQUE (= I + J) quelle que soit la categorie eliminee, verifie
// dans les tests plutot que suppose.
function computePositionPenaltyMatrix(kept, contrastByCategory) {
  const k = kept.length;
  const M = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const [, vec] of contrastByCategory) {
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) M[a][b] += vec[a] * vec[b];
  }
  return M;
}

function blockDiagWithIdentity(M, extraDim) {
  const k = M.length;
  const n = k + extraDim;
  const out = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) out[a][b] = M[a][b];
  for (let i = k; i < n; i++) out[i][i] = 1;
  return out;
}

const DEFAULT_CONTRAST = buildContrastMatrix(DEFAULT_REFERENCE_CATEGORY);
const POSITION_ORDER = DEFAULT_CONTRAST.kept; // ["F","M","D","G"] avec DEFAULT_REFERENCE_CATEGORY="UNKNOWN" - API externe inchangee
const N_PARAMS = POSITION_ORDER.length + N_FEATURES;
const DEFAULT_POSITION_PENALTY = computePositionPenaltyMatrix(DEFAULT_CONTRAST.kept, DEFAULT_CONTRAST.contrastByCategory);
const DEFAULT_PENALTY_MATRIX = blockDiagWithIdentity(DEFAULT_POSITION_PENALTY, N_FEATURES);

// API generique : design vector pour n'importe quelle categorie de
// reference (utilise par le test de coding invariance).
function designVectorForReference(positionGroup, xGoal, xShot, xSot, referenceCategory) {
  const { kept, contrastByCategory } = buildContrastMatrix(referenceCategory);
  const posVec = contrastByCategory.get(positionGroup) || contrastByCategory.get(referenceCategory);
  return [...posVec, xGoal, xShot, xSot];
}

// API de production (contrainte par defaut, UNKNOWN eliminee).
function designVector(positionGroup, xGoal, xShot, xSot) {
  const posVec = DEFAULT_CONTRAST.contrastByCategory.get(positionGroup) || DEFAULT_CONTRAST.contrastByCategory.get(DEFAULT_REFERENCE_CATEGORY);
  return [...posVec, xGoal, xShot, xSot];
}

// Reconstruit le vecteur alpha CANONIQUE complet (5 categories, sous
// contrainte Sum=0) a partir d'un theta ajuste et de sa categorie de
// reference - c'est CE vecteur (pas le theta brut) qui doit etre
// identique entre deux codages differents.
function recoverCanonicalAlpha(theta, kept, referenceCategory) {
  const alpha = new Map();
  let sumKept = 0;
  kept.forEach((c, j) => { alpha.set(c, theta[j]); sumKept += theta[j]; });
  alpha.set(referenceCategory, -sumKept);
  return alpha;
}

function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

// events = [{ riskSetDesignVectors: [x_j,...], scorerIndex }]. Gradient
// et Hessian de la log-vraisemblance BRUTE (non penalisee) - inchange,
// c'est un calcul exact, jamais la source du probleme d'identification.
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

// Objectif PENALISE et ses derivees, sous la matrice de penalite
// CANONIQUE M (par defaut DEFAULT_PENALTY_MATRIX ; le test de coding
// invariance passe une M differente, algebriquement identique, issue
// d'une autre categorie de reference).
function computePenalizedObjective(events, theta, ridge, penaltyMatrix) {
  penaltyMatrix = penaltyMatrix || DEFAULT_PENALTY_MATRIX;
  const { grad, hess, logL } = computeGradientAndHessian(events, theta);
  const Mtheta = penaltyMatrix.map((row) => dot(row, theta));
  const quad = dot(theta, Mtheta);
  const objective = logL - (ridge / 2) * quad;
  const gradPenalized = grad.map((g, i) => g - ridge * Mtheta[i]);
  const hessPenalized = hess.map((row, i) => row.map((v, j) => v - ridge * penaltyMatrix[i][j]));
  return { objective, gradPenalized, hessPenalized, rawLogL: logL };
}

// Gauss-Jordan avec pivot partiel : resout A x = b. Rapporte si un
// pivot a du etre saute (quasi-singulier) - avec l'objectif penalise,
// A=hess_penalized est definie negative partout, donc ce cas ne
// devrait plus survenir en pratique ; on le rapporte explicitement
// plutot que de le masquer.
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
// depuis un theta0 et une matrice de penalite explicites - permet le
// multi-start (item 6) ET le test de coding invariance (penaltyMatrix
// differente selon la categorie de reference choisie).
function fitRelativeRiskModelFrom(events, theta0, maxIter, gradTol, objTol, penaltyMatrix) {
  maxIter = maxIter || DEFAULT_MAX_ITER;
  gradTol = gradTol || GRADIENT_TOLERANCE;
  objTol = objTol || OBJECTIVE_RELATIVE_TOLERANCE;
  penaltyMatrix = penaltyMatrix || DEFAULT_PENALTY_MATRIX;

  let theta = theta0.slice();
  let current = computePenalizedObjective(events, theta, RIDGE_REGULARIZATION, penaltyMatrix);
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
    let candidate = computePenalizedObjective(events, candidateTheta, RIDGE_REGULARIZATION, penaltyMatrix);
    let backtracks = 0;
    while (candidate.objective < current.objective && backtracks < MAX_LINE_SEARCH_BACKTRACKS) {
      step *= 0.5;
      candidateTheta = theta.map((t, i) => t - step * solved.solution[i]);
      candidate = computePenalizedObjective(events, candidateTheta, RIDGE_REGULARIZATION, penaltyMatrix);
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
  return fitRelativeRiskModelFrom(events, new Array(N_PARAMS).fill(0), maxIter, gradTol, objTol, DEFAULT_PENALTY_MATRIX);
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
  const fits = starts.map((t0) => fitRelativeRiskModelFrom(events, t0, maxIter, gradTol, objTol, DEFAULT_PENALTY_MATRIX));

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

// == CODING INVARIANCE (item 1 de la demande) ==
// events doit porter riskSetRawFeatures (parallele a riskSetIds) =
// [{ group, xGoal, xShot, xSot }, ...] - les traits BRUTS avant
// encodage, pour pouvoir reconstruire un design vector sous N'IMPORTE
// QUELLE categorie de reference sans toucher aux features/risk-sets
// eux-memes. Fitte independamment sous CHAQUE referenceCategory listee,
// recupere le alpha CANONIQUE (5 categories) de chacun, et compare :
// (a) les alpha canoniques entre codages, (b) les probabilites de
// risk-set predites sur les MEMES evenements.
function codingInvarianceTest(eventsWithRawFeatures, referenceCategories, maxIter, gradTol, objTol) {
  const results = referenceCategories.map((referenceCategory) => {
    const { kept, contrastByCategory } = buildContrastMatrix(referenceCategory);
    const positionPenalty = computePositionPenaltyMatrix(kept, contrastByCategory);
    const penaltyMatrix = blockDiagWithIdentity(positionPenalty, N_FEATURES);
    const rebuiltEvents = eventsWithRawFeatures.map((e) => ({
      riskSetDesignVectors: e.riskSetRawFeatures.map((f) => {
        const posVec = contrastByCategory.get(f.group) || contrastByCategory.get(referenceCategory);
        return [...posVec, f.xGoal, f.xShot, f.xSot];
      }),
      scorerIndex: e.scorerIndex,
    }));
    const theta0 = new Array(kept.length + N_FEATURES).fill(0);
    const fit = fitRelativeRiskModelFrom(rebuiltEvents, theta0, maxIter, gradTol, objTol, penaltyMatrix);
    const canonicalAlpha = recoverCanonicalAlpha(fit.theta, kept, referenceCategory);
    return { referenceCategory, kept, fit, canonicalAlpha, rebuiltEvents, positionPenalty };
  });

  // (a) ecart max entre alpha canoniques (meme categorie, deux codages)
  let maxCanonicalAlphaDiff = 0;
  for (const category of ALL_POSITION_GROUPS) {
    const values = results.map((r) => r.canonicalAlpha.get(category));
    maxCanonicalAlphaDiff = Math.max(maxCanonicalAlphaDiff, Math.max(...values) - Math.min(...values));
  }

  // (b) ecart max entre probabilites de risk-set predites (meme evenement, meme joueur, deux codages)
  let maxProbabilityDiff = 0;
  const reference = results[0];
  for (let r = 1; r < results.length; r++) {
    const other = results[r];
    for (let idx = 0; idx < reference.rebuiltEvents.length; idx++) {
      const scoresRef = reference.rebuiltEvents[idx].riskSetDesignVectors.map((x) => dot(x, reference.fit.theta));
      const scoresOther = other.rebuiltEvents[idx].riskSetDesignVectors.map((x) => dot(x, other.fit.theta));
      const probsRef = softmax(scoresRef);
      const probsOther = softmax(scoresOther);
      for (let i = 0; i < probsRef.length; i++) maxProbabilityDiff = Math.max(maxProbabilityDiff, Math.abs(probsRef[i] - probsOther[i]));
    }
  }

  // (c) verification algebrique : la matrice de penalite du bloc position est identique quelle que soit la reference
  let maxPenaltyMatrixDiff = 0;
  for (let r = 1; r < results.length; r++) {
    const A = results[0].positionPenalty, B = results[r].positionPenalty;
    for (let a = 0; a < A.length; a++) for (let b = 0; b < A.length; b++) maxPenaltyMatrixDiff = Math.max(maxPenaltyMatrixDiff, Math.abs(A[a][b] - B[a][b]));
  }

  return {
    references_tested: referenceCategories,
    results: results.map((r) => ({ referenceCategory: r.referenceCategory, kept: r.kept, converged: r.fit.converged, penalized_objective: r.fit.penalized_objective, canonicalAlpha: [...r.canonicalAlpha.entries()] })),
    max_canonical_alpha_diff: maxCanonicalAlphaDiff,
    max_abs_probability_difference: maxProbabilityDiff,
    max_penalty_matrix_diff: maxPenaltyMatrixDiff,
    all_converged: results.every((r) => r.fit.converged),
  };
}

module.exports = {
  ALL_POSITION_GROUPS, DEFAULT_REFERENCE_CATEGORY, POSITION_ORDER, N_PARAMS,
  buildContrastMatrix, computePositionPenaltyMatrix, blockDiagWithIdentity,
  designVector, designVectorForReference, recoverCanonicalAlpha,
  computeGradientAndHessian, computePenalizedObjective, solveLinearSystem,
  fitRelativeRiskModel, fitRelativeRiskModelFrom, deterministicMultiStartThetas,
  multiStartStability, maxRiskSetProbDiff, codingInvarianceTest,
  RIDGE_REGULARIZATION, GRADIENT_TOLERANCE, OBJECTIVE_RELATIVE_TOLERANCE, DEFAULT_PENALTY_MATRIX,
};
