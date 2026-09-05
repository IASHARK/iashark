"use strict";
// EXP-005 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - facteur latent commun
// de rythme/ouverture affectant simultanement les buts des deux equipes,
// AU-DESSUS de la meme correction Dixon-Coles que M2 (rho=-0.0845 FIXE,
// jamais reestime - reutilise litteralement lib/lab/dc-log-probability.js#tau,
// jamais reimplemente, pour eviter tout confound entre "ajout d'une
// dependance" et "suppression de Dixon-Coles").
//
// Construction (item 3-5 du protocole) :
//   Z ~ Gamma(shape=kappa, rate=kappa)  =>  E[Z]=1, Var(Z)=1/kappa
//   H|Z ~ Poisson(muH*Z), A|Z ~ Poisson(muA*Z), independants sachant Z
//   => Var(H)=muH+muH^2/kappa, Var(A)=muA+muA^2/kappa, Cov(H,A)=muH*muA/kappa
//
// PMF jointe AVANT correction DC (integrale fermee sur Z, negative
// binomiale bivariee partageant kappa) :
//   q(h,a) = Gamma(h+a+kappa)/(Gamma(kappa)*h!*a!) * kappa^kappa * muH^h * muA^a / (kappa+muH+muA)^(h+a+kappa)
//
// log[Gamma(h+a+kappa)/Gamma(kappa)] calcule via le produit croissant
// (h+a ENTIER >=0) - IDENTIQUE en esprit a lib/lab/nb2.js#logRisingFactorialRatio,
// numeriquement stable a TOUTE magnitude de kappa (jamais de lgamma(x)-lgamma(y)
// avec x,y grands et proches).
//
// Correction DC : tau=1 partout sauf les 4 cellules basses (memes valeurs
// que M2). Zdc = somme totale de q*tau = 1 + somme_basses q*(tau-1)
// (puisque somme totale de q seule vaut exactement 1). P_M5 = q*tau/Zdc.
//
// AUCUN import de lib/lab/nb2*.js, lib/lab/promotion-m4.js ni
// lib/lab/walkforward-m4-runner.js - M4 est CLOSED_REJECT, sa formule
// (marges NB2 INDEPENDANTES) n'est PAS la baseline de M5 (verifie par
// tests/lab-m5-no-m4.test.js).

const { logFactorial } = require("../models.js");
const { tau } = require("./dc-log-probability.js");

const CHAMPION_RHO = -0.0845;

function logRisingFactorialRatio(n, kappa) {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.log(kappa + i);
  return sum;
}

function assertDomain(h, a, muH, muA, kappa) {
  if (!Number.isInteger(h) || h < 0) throw new RangeError(`shared-gamma-dc: h doit etre un entier >=0 (recu ${h})`);
  if (!Number.isInteger(a) || a < 0) throw new RangeError(`shared-gamma-dc: a doit etre un entier >=0 (recu ${a})`);
  if (!(muH > 0)) throw new RangeError(`shared-gamma-dc: muH doit etre >0 (recu ${muH})`);
  if (!(muA > 0)) throw new RangeError(`shared-gamma-dc: muA doit etre >0 (recu ${muA})`);
  if (!(kappa > 0)) throw new RangeError(`shared-gamma-dc: kappa doit etre >0 (recu ${kappa})`);
}

// log q(h,a) - PMF jointe shared-gamma AVANT correction DC.
function logJointQ(h, a, muH, muA, kappa) {
  assertDomain(h, a, muH, muA, kappa);
  const n = h + a;
  const denom = kappa + muH + muA;
  return logRisingFactorialRatio(n, kappa)
    - logFactorial(h) - logFactorial(a)
    + kappa * Math.log(kappa)
    + h * Math.log(muH) + a * Math.log(muA)
    - (n + kappa) * Math.log(denom);
}

function jointQ(h, a, muH, muA, kappa) {
  return Math.exp(logJointQ(h, a, muH, muA, kappa));
}

// Zdc = 1 + somme sur les 4 cellules basses de q(h,a)*(tau(h,a,muH,muA,rho)-1).
// Leve M5_INVALID_NORMALIZATION si un tau<=0 ou si Zdc n'est pas fini/>0.
function computeZdc(muH, muA, kappa, rho) {
  const lowCells = [[0, 0], [1, 0], [0, 1], [1, 1]];
  let sumLow = 0;
  for (const [h, a] of lowCells) {
    const t = tau(h, a, muH, muA, rho);
    if (t <= 0) {
      const err = new Error(`M5_INVALID_NORMALIZATION: tau(${h},${a})=${t}<=0 pour muH=${muH} muA=${muA} rho=${rho}`);
      err.code = "M5_INVALID_NORMALIZATION";
      throw err;
    }
    sumLow += jointQ(h, a, muH, muA, kappa) * (t - 1);
  }
  const zdc = 1 + sumLow;
  if (!Number.isFinite(zdc) || zdc <= 0) {
    const err = new Error(`M5_INVALID_NORMALIZATION: Zdc=${zdc} invalide (muH=${muH}, muA=${muA}, kappa=${kappa}, rho=${rho})`);
    err.code = "M5_INVALID_NORMALIZATION";
    throw err;
  }
  return zdc;
}

// log P_M5(h,a) = log q(h,a) + log tau(h,a) - log Zdc. rho FIXE (jamais
// reestime) - toujours CHAMPION_RHO sauf injection explicite pour tests.
function logProbabilityM5(muH, muA, h, a, kappa, rho) {
  const effectiveRho = rho === undefined ? CHAMPION_RHO : rho;
  const t = tau(h, a, muH, muA, effectiveRho);
  if (t <= 0) {
    const err = new Error(`M5_INVALID_NORMALIZATION: tau(${h},${a})=${t}<=0`);
    err.code = "M5_INVALID_NORMALIZATION";
    throw err;
  }
  const zdc = computeZdc(muH, muA, kappa, effectiveRho);
  return logJointQ(h, a, muH, muA, kappa) + Math.log(t) - Math.log(zdc);
}

function probabilityM5(muH, muA, h, a, kappa, rho) {
  return Math.exp(logProbabilityM5(muH, muA, h, a, kappa, rho));
}

// NLL exact-score moyenne - fonction objectif directe (JAMAIS via une
// matrice tronquee) pour le fitting de kappa.
function negLogLikelihood(matches, kappa, rho) {
  let sum = 0;
  for (const m of matches) sum += -logProbabilityM5(m.muHome, m.muAway, m.h, m.a, kappa, rho);
  return sum / matches.length;
}

// Var(H)=muH+muH^2/kappa, Var(A)=muA+muA^2/kappa, Cov(H,A)=muH*muA/kappa -
// diagnostics de dependance (item 19), jamais utilises dans la vraisemblance.
function impliedCovariance(muH, muA, kappa) {
  return (muH * muA) / kappa;
}
function impliedCorrelation(muH, muA, kappa) {
  const varH = muH + (muH * muH) / kappa;
  const varA = muA + (muA * muA) / kappa;
  return impliedCovariance(muH, muA, kappa) / Math.sqrt(varH * varA);
}

module.exports = {
  CHAMPION_RHO,
  logJointQ, jointQ, computeZdc, logProbabilityM5, probabilityM5, negLogLikelihood,
  impliedCovariance, impliedCorrelation,
};
