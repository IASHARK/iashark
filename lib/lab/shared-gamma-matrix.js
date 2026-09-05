"use strict";
// EXP-005 item 15 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - matrice de
// score ADAPTATIVE pour la distribution jointe dependante shared-gamma+DC.
// La distribution N'ETANT PAS independante, CDF_H*CDF_A n'est PAS une
// borne valide sur la masse hors du carre 0..M. Utilise a la place le
// borne d'UNION (valide pour TOUTE distribution jointe, sans hypothese
// d'independance) :
//   P(H>M ou A>M) <= P(H>M) + P(A>M)
// ou P(H>M), P(A>M) sont les CDF des marges (H et A marginalement, en
// integrant Z, suivent EXACTEMENT NB2(muH,kappa) et NB2(muA,kappa) -
// propriete mathematique du melange Poisson-Gamma partage, PAS une
// reutilisation de l'hypothese statistique M4 : ces fonctions sont
// derivees et implementees ICI independamment, aucun import de
// lib/lab/nb2.js - voir tests/lab-m5-no-m4.test.js).
//
// Puisque tau(h,a)=1 partout SAUF les 4 cellules basses (toujours a
// l'INTERIEUR du carre des que M>=2), la masse P_M5 hors du carre vaut
// EXACTEMENT [masse q hors du carre]/Zdc (tau=1 la-bas) - donc le meme
// borne d'union applique a la marge q (NON corrigee DC), divise par
// Zdc, est un majorant EXACT (pas approximatif) de la masse P_M5 hors
// du carre.

const { logFactorial } = require("../models.js");
const { computeZdc, probabilityM5 } = require("./shared-gamma-dc.js");

const TAIL_THRESHOLD = 1e-10;
const HARD_SAFETY_CAP = 100;

function logRisingFactorialRatio(n, kappa) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.log(kappa + i);
  return sum;
}

// Marge NB2(mu,kappa) de la construction shared-gamma - derivee et
// implementee INDEPENDAMMENT ici (pas un import de lib/lab/nb2.js).
function marginalLogPmf(y, mu, kappa) {
  const logRising = logRisingFactorialRatio(y, kappa);
  return logRising - logFactorial(y) + kappa * (Math.log(kappa) - Math.log(kappa + mu)) + y * (Math.log(mu) - Math.log(kappa + mu));
}
function marginalCdf(M, mu, kappa) {
  let sum = 0;
  for (let y = 0; y <= M; y++) sum += Math.exp(marginalLogPmf(y, mu, kappa));
  return sum;
}

// Retourne { maxGoal, guaranteedTailUpperBound, zdc } ou leve
// M5_TAIL_TRUNCATION_FAILURE si le seuil n'est jamais atteint avant le
// safety cap.
function findAdaptiveMaxGoal(muHome, muAway, kappa, rho) {
  const zdc = computeZdc(muHome, muAway, kappa, rho);
  for (let M = 2; M <= HARD_SAFETY_CAP; M++) {
    const tailUnion = (1 - marginalCdf(M, muHome, kappa)) + (1 - marginalCdf(M, muAway, kappa));
    const guaranteedTailUpperBound = tailUnion / zdc;
    if (guaranteedTailUpperBound < TAIL_THRESHOLD) return { maxGoal: M, guaranteedTailUpperBound, zdc };
  }
  const err = new Error(`M5_TAIL_TRUNCATION_FAILURE: la borne d'union garantie n'a pas atteint <${TAIL_THRESHOLD} avant le safety cap M<=${HARD_SAFETY_CAP} (muHome=${muHome}, muAway=${muAway}, kappa=${kappa})`);
  err.code = "M5_TAIL_TRUNCATION_FAILURE";
  throw err;
}

// Construit la matrice M5 exacte 0..M x 0..M (valeurs EXACTES de
// probabilityM5, pas la borne), normalise sur la grille finie.
function buildSharedGammaMatrix(muHome, muAway, kappa, rho) {
  const { maxGoal, guaranteedTailUpperBound, zdc } = findAdaptiveMaxGoal(muHome, muAway, kappa, rho);

  const rawMatrix = [];
  let actualMatrixMassBeforeFinalNormalization = 0;
  for (let h = 0; h <= maxGoal; h++) {
    const row = new Array(maxGoal + 1);
    for (let a = 0; a <= maxGoal; a++) {
      const p = probabilityM5(muHome, muAway, h, a, kappa, rho);
      row[a] = p;
      actualMatrixMassBeforeFinalNormalization += p;
    }
    rawMatrix.push(row);
  }

  if (!(actualMatrixMassBeforeFinalNormalization > 0) || !Number.isFinite(actualMatrixMassBeforeFinalNormalization)) {
    throw new Error(`buildSharedGammaMatrix: somme brute invalide (${actualMatrixMassBeforeFinalNormalization})`);
  }

  const matrix = rawMatrix.map((row) => row.map((p) => p / actualMatrixMassBeforeFinalNormalization));

  let normalizedSum = 0;
  for (const row of matrix) {
    for (const p of row) {
      if (!Number.isFinite(p)) throw new Error("buildSharedGammaMatrix: valeur non-finie apres normalisation");
      if (p < 0) throw new Error(`buildSharedGammaMatrix: valeur negative apres normalisation (${p})`);
      normalizedSum += p;
    }
  }
  if (Math.abs(normalizedSum - 1) > 1e-9) {
    throw new Error(`buildSharedGammaMatrix: somme apres normalisation=${normalizedSum}, attendu ~1`);
  }

  return { matrix, maxGoal, actualMatrixMassBeforeFinalNormalization, guaranteedTailUpperBound, zdc, normalizedSum };
}

module.exports = { findAdaptiveMaxGoal, buildSharedGammaMatrix, marginalLogPmf, marginalCdf, TAIL_THRESHOLD, HARD_SAFETY_CAP };
