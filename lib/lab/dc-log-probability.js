"use strict";
// GATE C2 (SPEC LAB PRO v1.0) - fonction objectif Dixon-Coles EXACTE,
// exposee independamment de lib/models.js#dixonColesCorr (qui fige rho a
// une constante de production) pour permettre a scripts/fit_rho.py de
// fitter un rho variable, tout en restant STRICTEMENT la meme formule
// mathematique que celle qui tourne en production (reutilise poissonProb,
// n'en reimplemente pas une copie).
//
// C'est la reference Node contre laquelle scripts/fit_rho.py (Python/
// SciPy) est verifie - tests/lab-node-python-fidelity.test.js compare
// les deux implementations independamment ecrites, pour garantir qu'on
// ne fitte jamais une fonction legerement differente de celle qui
// tourne reellement en production (exigence explicite du protocole).

const { poissonProb, logFactorial } = require("../models.js");

// tau(h,a,lambdaH,lambdaA,rho) - meme formule que lib/models.js#dixonColesCorr,
// rho en parametre au lieu d'une constante figee.
function tau(h, a, lambdaH, lambdaA, rho) {
  if (h === 0 && a === 0) return 1 - lambdaH * lambdaA * rho;
  if (h === 1 && a === 0) return 1 + lambdaA * rho;
  if (h === 0 && a === 1) return 1 + lambdaH * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

// P(H=h, A=a) = Poisson(h;lambdaH) * Poisson(a;lambdaA) * tau(h,a,lambdaH,lambdaA,rho)
function probability(lambdaH, lambdaA, h, a, rho) {
  const p = poissonProb(lambdaH, h) * poissonProb(lambdaA, a) * tau(h, a, lambdaH, lambdaA, rho);
  return Math.max(0, p);
}

// log P(H=h, A=a) - calcule en espace log pour la partie Poisson (evite
// une perte de precision inutile), puis ajoute log(tau) separement.
// Retourne -Infinity si tau<=0 (hors du domaine valide de rho pour ce
// couple lambda/score - le fitter doit contraindre rho pour ne jamais
// atteindre ce cas, voir lib/lab/rho-bounds.js).
function logProbability(lambdaH, lambdaA, h, a, rho) {
  const logPoissonH = -lambdaH + h * Math.log(lambdaH) - logFactorial(h);
  const logPoissonA = -lambdaA + a * Math.log(lambdaA) - logFactorial(a);
  const t = tau(h, a, lambdaH, lambdaA, rho);
  if (t <= 0) return -Infinity;
  return logPoissonH + logPoissonA + Math.log(t);
}

// NLL exact-score pour un ensemble de matchs {lambdaH, lambdaA, h, a} et
// un rho donne - c'est la fonction objectif que scripts/fit_rho.py
// minimise en rho (le lien avec la couche walk-forward, GATE C1).
function negLogLikelihood(matches, rho) {
  let sum = 0;
  for (const m of matches) sum += -logProbability(m.lambdaH, m.lambdaA, m.h, m.a, rho);
  return sum / matches.length;
}

module.exports = { tau, probability, logProbability, negLogLikelihood };
