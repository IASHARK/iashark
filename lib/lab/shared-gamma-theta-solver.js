"use strict";
// EXP-005 (audit 2026-09-05, correctif mean-preservation) - M5_SHARED_GAMMA_DC_MEAN_PRESERVING.
//
// CONSTAT (diagnostic pre-resultat, jamais de vraie NLL M5 observee) :
// appliquer tau Dixon-Coles a la PMF jointe shared-gamma q(h,a|thetaH,thetaA,kappa)
// puis renormaliser par Zdc NE preserve PAS E[H]=thetaH, E[A]=thetaA en
// general (jusqu'a ~9% d'ecart absolu / ~3% relatif observe sur la
// grille muH,muA in [0.5,3], kappa in [2,100]). Utiliser thetaH=lambdaH_M2
// directement produirait donc des moyennes FINALES differentes de M2 -
// contraire au contrat scientifique "M5 preserve les moyennes M2".
//
// CORRECTIF : thetaH/thetaA deviennent des intensites INTERNES resolues
// deterministement (PAS des parametres statistiques appris - le seul
// parametre global appris reste kappa) telles que la distribution finale
// (shared-gamma + tau DC + normalisation Zdc) ait EXACTEMENT
// E_M5[H]=lambdaH, E_M5[A]=lambdaA. Le tau utilise CES memes thetaH/thetaA
// (jamais lambdaH/lambdaA directement dans tau - item 2 du protocole).
//
// Tous les moments (E[H],E[A],E[H^2],E[A^2],E[HA]) sont calcules en
// FORME FERMEE en O(1) (4 evaluations de q aux cellules basses, jamais
// une somme sur toute la matrice) - tau=1 partout sauf (0,0)(1,0)(0,1)(1,1),
// et q seule (avant DC) a une marge NB2(theta,kappa) exacte, donc
// E_q[H]=thetaH, E_q[H^2]=thetaH+thetaH^2*(kappa+1)/kappa (moments du
// melange Poisson-Gamma), E_q[HA]=thetaH*thetaA*(1+1/kappa) (Cov_q=thetaH*thetaA/kappa).
// Verifie <1e-7 contre sommation brute-force sur la matrice complete
// (tests/lab-shared-gamma-theta-solver.test.js).

const { jointQ } = require("./shared-gamma-dc.js");
const { tau } = require("./dc-log-probability.js");

const DEFAULT_MAX_ITER = 30;
const DEFAULT_TOL = 1e-10;
const DEFAULT_MAX_BACKTRACK = 20;

// Moments FERMES de la distribution FINALE (apres tau DC + Zdc), etant
// donnes thetaH,thetaA,kappa,rho - AUCUNE somme sur une matrice.
function closedFormMoments(thetaH, thetaA, kappa, rho) {
  const q00 = jointQ(0, 0, thetaH, thetaA, kappa);
  const q10 = jointQ(1, 0, thetaH, thetaA, kappa);
  const q01 = jointQ(0, 1, thetaH, thetaA, kappa);
  const q11 = jointQ(1, 1, thetaH, thetaA, kappa);
  const tau00 = tau(0, 0, thetaH, thetaA, rho);
  const tau10 = tau(1, 0, thetaH, thetaA, rho);
  const tau01 = tau(0, 1, thetaH, thetaA, rho);
  const tau11 = tau(1, 1, thetaH, thetaA, rho);

  const zdc = 1 + q00 * (tau00 - 1) + q10 * (tau10 - 1) + q01 * (tau01 - 1) + q11 * (tau11 - 1);
  // h correction : h=1 pour (1,0) et (1,1) uniquement (h=0 ailleurs) - h^2=h identiquement sur {0,1}, donc IDENTIQUE pour E[H] et E[H^2].
  const correctionH = q10 * (tau10 - 1) + q11 * (tau11 - 1);
  // a correction : a=1 pour (0,1) et (1,1) uniquement - meme argument, IDENTIQUE pour E[A] et E[A^2].
  const correctionA = q01 * (tau01 - 1) + q11 * (tau11 - 1);
  // h*a correction : non nul UNIQUEMENT en (1,1).
  const correctionHA = q11 * (tau11 - 1);

  const eqH2 = thetaH + (thetaH * thetaH * (kappa + 1)) / kappa;
  const eqA2 = thetaA + (thetaA * thetaA * (kappa + 1)) / kappa;
  const eqHA = thetaH * thetaA * (1 + 1 / kappa);

  return {
    eH: (thetaH + correctionH) / zdc,
    eA: (thetaA + correctionA) / zdc,
    eH2: (eqH2 + correctionH) / zdc,
    eA2: (eqA2 + correctionA) / zdc,
    eHA: (eqHA + correctionHA) / zdc,
    zdc, q00, q10, q01, q11, tau00, tau10, tau01, tau11,
  };
}

// Contrat de positivite (item 9) : thetaH>0, thetaA>0, les 4 tau>0, Zdc>0.
// Retourne {valid, failedChecks:[...]} - JAMAIS un clipping silencieux.
function checkPositivity(thetaH, thetaA, moments) {
  const failedChecks = [];
  if (!(thetaH > 0)) failedChecks.push("thetaH<=0");
  if (!(thetaA > 0)) failedChecks.push("thetaA<=0");
  if (!(moments.tau00 > 0)) failedChecks.push("tau00<=0");
  if (!(moments.tau01 > 0)) failedChecks.push("tau01<=0");
  if (!(moments.tau10 > 0)) failedChecks.push("tau10<=0");
  if (!(moments.tau11 > 0)) failedChecks.push("tau11<=0");
  if (!(moments.zdc > 0) || !Number.isFinite(moments.zdc)) failedChecks.push("zdc<=0_or_non_finite");
  return { valid: failedChecks.length === 0, failedChecks };
}

// Resout thetaH,thetaA tels que E_M5[H]=lambdaH, E_M5[A]=lambdaA (a
// tolerance pres), pour un kappa et un rho donnes. Newton 2D (jacobien
// numerique, cout O(1)/iteration), avec repli "backtracking" borne
// (reduit le pas si le residu grossit) UNIQUEMENT pour stabiliser Newton
// - ne force JAMAIS une solution dans une region reellement sans
// solution (positivite verifiee a chaque etape, jamais de clipping
// silencieux qui masquerait une region invalide).
function solveThetaForTargetMeans(lambdaH, lambdaA, kappa, rho, options = {}) {
  const maxIter = options.maxIter || DEFAULT_MAX_ITER;
  const tol = options.tol || DEFAULT_TOL;
  const maxBacktrack = options.maxBacktrack || DEFAULT_MAX_BACKTRACK;
  const eps = 1e-6;

  if (!(lambdaH > 0) || !(lambdaA > 0) || !(kappa > 0)) {
    return { thetaH: null, thetaA: null, converged: false, iterations: 0, method: "none", errorCode: "M5_INVALID_PARAMETER_REGION", failedChecks: ["lambdaH_lambdaA_kappa_domain"] };
  }

  let thetaH = lambdaH, thetaA = lambdaA; // point de depart : identite (exact a kappa infini, item 4)
  let residualNorm = Infinity;

  for (let iterations = 0; iterations < maxIter; iterations++) {
    const m = closedFormMoments(thetaH, thetaA, kappa, rho);
    const positivity = checkPositivity(thetaH, thetaA, m);
    if (!positivity.valid) {
      return { thetaH, thetaA, converged: false, iterations, method: "newton", errorCode: "M5_INVALID_PARAMETER_REGION", failedChecks: positivity.failedChecks, residualH: m.eH - lambdaH, residualA: m.eA - lambdaA };
    }

    const rH = m.eH - lambdaH, rA = m.eA - lambdaA;
    const newResidualNorm = Math.sqrt(rH * rH + rA * rA);
    if (Math.abs(rH) < tol && Math.abs(rA) < tol) {
      return { thetaH, thetaA, converged: true, iterations, method: "newton", errorCode: null, residualH: rH, residualA: rA };
    }

    const mH1 = closedFormMoments(thetaH + eps, thetaA, kappa, rho);
    const mA1 = closedFormMoments(thetaH, thetaA + eps, kappa, rho);
    const dHdTh = (mH1.eH - m.eH) / eps, dHdTa = (mA1.eH - m.eH) / eps;
    const dAdTh = (mH1.eA - m.eA) / eps, dAdTa = (mA1.eA - m.eA) / eps;
    const det = dHdTh * dAdTa - dHdTa * dAdTh;
    if (Math.abs(det) < 1e-14) {
      return { thetaH, thetaA, converged: false, iterations, method: "newton", errorCode: "JACOBIAN_SINGULAR", residualH: rH, residualA: rA };
    }

    let stepH = (rH * dAdTa - rA * dHdTa) / det;
    let stepA = (rA * dHdTh - rH * dAdTh) / det;

    // Backtracking borne : si le pas complet degrade le residu ou sort
    // du domaine positif, on le raccourcit progressivement - stabilise
    // Newton, ne "cache" jamais une region sans solution (le nombre
    // d'essais est borne, un echec reste un echec explicite).
    let accepted = false;
    let scale = 1;
    for (let bt = 0; bt < maxBacktrack; bt++) {
      const candidateH = thetaH - scale * stepH;
      const candidateA = thetaA - scale * stepA;
      if (candidateH > 0 && candidateA > 0) {
        const candidateMoments = closedFormMoments(candidateH, candidateA, kappa, rho);
        const candidatePositivity = checkPositivity(candidateH, candidateA, candidateMoments);
        if (candidatePositivity.valid) {
          const candResidualNorm = Math.sqrt((candidateMoments.eH - lambdaH) ** 2 + (candidateMoments.eA - lambdaA) ** 2);
          if (candResidualNorm < residualNorm || bt === maxBacktrack - 1) {
            thetaH = candidateH; thetaA = candidateA; residualNorm = candResidualNorm;
            accepted = true;
            break;
          }
        }
      }
      scale /= 2;
    }
    if (!accepted) {
      return { thetaH, thetaA, converged: false, iterations, method: "newton_with_backtracking", errorCode: "BACKTRACKING_EXHAUSTED", residualH: rH, residualA: rA };
    }
  }

  const finalMoments = closedFormMoments(thetaH, thetaA, kappa, rho);
  return {
    thetaH, thetaA, converged: false, iterations: maxIter, method: "newton_with_backtracking",
    errorCode: "MAX_ITERATIONS_EXCEEDED",
    residualH: finalMoments.eH - lambdaH, residualA: finalMoments.eA - lambdaA,
  };
}

// Diagnostics de dependance FINAUX (item 5-6, audit 2026-09-05) : la
// formule brute Cov_q(H,A)=thetaH*thetaA/kappa (shared-gamma AVANT DC)
// N'EST PLUS la covariance de la distribution FINALE apres tau+Zdc -
// verifie numeriquement a differer de 5-30% dans des cas realistes.
// Calcule Var_M5(H), Var_M5(A), Cov_M5(H,A), correlation FINALES en O(1)
// via closedFormMoments (E[H^2],E[A^2],E[HA] deja corriges DC), en
// utilisant lambdaH,lambdaA (les moyennes CIBLES, EXACTEMENT E_M5[H]/E_M5[A]
// par construction du solveur) plutot que theta pour Var(X)=E[X^2]-E[X]^2.
function finalDependenceDiagnostics(lambdaH, lambdaA, thetaH, thetaA, kappa, rho) {
  const m = closedFormMoments(thetaH, thetaA, kappa, rho);
  const varH = m.eH2 - lambdaH * lambdaH;
  const varA = m.eA2 - lambdaA * lambdaA;
  const cov = m.eHA - lambdaH * lambdaA;
  const correlation = varH > 0 && varA > 0 ? cov / Math.sqrt(varH * varA) : null;
  return { varH, varA, cov, correlation };
}

module.exports = { closedFormMoments, checkPositivity, solveThetaForTargetMeans, finalDependenceDiagnostics, DEFAULT_MAX_ITER, DEFAULT_TOL };
