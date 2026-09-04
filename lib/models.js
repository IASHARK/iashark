"use strict";
// Modeles statistiques purs, extraits de .github/workflows/update-data.yml
// pour etre reellement testables (voir tests/models.test.js). Le pipeline
// importe ce fichier au lieu de redefinir ces fonctions inline - une seule
// version, testee, executee en production.

function poissonProb(lambda, k) {
  if (lambda <= 0) return k === 0 ? 1 : 0;
  const logP = -lambda + k * Math.log(lambda) - logFactorial(k);
  return Math.exp(logP);
}

function logFactorial(n) {
  if (n <= 1) return 0;
  let r = 0;
  for (let i = 2; i <= n; i++) r += Math.log(i);
  return r;
}

function calcPoissonProbs(lambdaH, lambdaA) {
  const mat = [];
  for (let h = 0; h <= 8; h++) {
    mat[h] = [];
    for (let a = 0; a <= 8; a++) mat[h][a] = poissonProb(lambdaH, h) * poissonProb(lambdaA, a);
  }
  let p1 = 0, pN = 0, p2 = 0, over25 = 0, under25 = 0, bttsY = 0, bttsN = 0, over15 = 0, over35 = 0;
  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p = mat[h][a];
      if (h > a) p1 += p; else if (h === a) pN += p; else p2 += p;
      if (h + a > 2.5) over25 += p; else under25 += p;
      if (h + a > 1.5) over15 += p;
      if (h + a > 3.5) over35 += p;
      if (h > 0 && a > 0) bttsY += p; else bttsN += p;
    }
  }
  return {
    p1: Math.round(p1 * 100), pN: Math.round(pN * 100), p2: Math.round(p2 * 100),
    over15: Math.round(over15 * 100), over25: Math.round(over25 * 100),
    under25: Math.round(under25 * 100), over35: Math.round(over35 * 100),
    bttsY: Math.round(bttsY * 100), bttsN: Math.round(bttsN * 100),
  };
}

// M0 (SPEC LAB PRO v1.0 champion initial) : Dixon-Coles pur, rho=-0.0845.
// Remplace le blend 0.35*Poisson+0.65*DC(-0.13) precedent, demontre
// algebriquement (et verifie empiriquement, EXP-000, erreur max 1.2e-15
// sur 135 cas, cf. scripts/experiments/exp000_report.json) equivalent a
// rho_effectif = 0.65 * -0.13 = -0.0845 quand les deux matrices partagent
// les memes lambdas - ce qui est le cas ici (GATE A3). Ce -0.0845 est LA
// valeur a remplacer par M1 (rho appris par backtest walk-forward) une
// fois EXP-001 promu - ne pas le retoucher a la main entre-temps.
function dixonColesCorr(h, a, lambdaH, lambdaA) {
  const rho = -0.0845;
  if (h === 0 && a === 0) return 1 - lambdaH * lambdaA * rho;
  if (h === 1 && a === 0) return 1 + lambdaA * rho;
  if (h === 0 && a === 1) return 1 + lambdaH * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

function calcDixonColesProbs(lambdaH, lambdaA) {
  const mat = [];
  for (let h = 0; h <= 8; h++) {
    mat[h] = [];
    for (let a = 0; a <= 8; a++) {
      const p = poissonProb(lambdaH, h) * poissonProb(lambdaA, a) * dixonColesCorr(h, a, lambdaH, lambdaA);
      mat[h][a] = Math.max(0, p);
    }
  }
  let p1 = 0, pN = 0, p2 = 0, over25 = 0, under25 = 0, bttsY = 0, bttsN = 0, over15 = 0, over35 = 0;
  for (let h = 0; h <= 8; h++) {
    for (let a = 0; a <= 8; a++) {
      const p = mat[h][a];
      if (h > a) p1 += p; else if (h === a) pN += p; else p2 += p;
      if (h + a > 2.5) over25 += p; else under25 += p;
      if (h + a > 1.5) over15 += p;
      if (h + a > 3.5) over35 += p;
      if (h > 0 && a > 0) bttsY += p; else bttsN += p;
    }
  }
  return {
    p1: Math.round(p1 * 100), pN: Math.round(pN * 100), p2: Math.round(p2 * 100),
    over15: Math.round(over15 * 100), over25: Math.round(over25 * 100),
    under25: Math.round(under25 * 100), over35: Math.round(over35 * 100),
    bttsY: Math.round(bttsY * 100), bttsN: Math.round(bttsN * 100),
  };
}

// PRNG seedable (mulberry32) - remplace Math.random() pour que
// calcMonteCarlo() soit reproductible avec une seed donnee (exige par
// IASHARK_MASTER_V2_1... §10.AH "Monte-Carlo : PRNG seedable obligatoire").
// Sans seed explicite, se comporte comme avant (aleatoire reel a chaque appel).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// GATE C9 (SPEC LAB PRO v1.0) - derive un seed entier deterministe a
// partir des lambdas d'un match (FNV-1a sur leur representation textuelle
// stable). Permet a calcFinalProbs() de seeder calcMonteCarlo() sans
// dependre d'un contexte externe (fixture_id/model_version/cutoff) non
// disponible a ce niveau de l'API - mêmes lambdas -> meme seed -> meme
// sous-objet montecarlo, tout en restant purement fonction des memes
// entrees que le reste de calcFinalProbs (pas d'etat cache).
function seedFromLambdas(lambdaH, lambdaA) {
  const str = `${lambdaH}|${lambdaA}`;
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function poissonKnuth(lambda, rng) {
  rng = rng || Math.random;
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L);
  return k - 1;
}

function calcMonteCarlo(lambdaH, lambdaA, opts) {
  opts = opts || {};
  const n = opts.n || 5000;
  const rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;
  let p1 = 0, pN = 0, p2 = 0, over25 = 0, over15 = 0, over35 = 0, bttsY = 0;
  const scoreMap = {};
  for (let i = 0; i < n; i++) {
    const h = poissonKnuth(lambdaH, rng);
    const a = poissonKnuth(lambdaA, rng);
    if (h > a) p1++; else if (h === a) pN++; else p2++;
    if (h + a > 2.5) over25++;
    if (h + a > 1.5) over15++;
    if (h + a > 3.5) over35++;
    if (h > 0 && a > 0) bttsY++;
    const key = h + "-" + a;
    scoreMap[key] = (scoreMap[key] || 0) + 1;
  }
  const allScores = Object.keys(scoreMap)
    .map((k) => ({ score: k, n: scoreMap[k], pct: Math.round((scoreMap[k] / n) * 100) }))
    .sort((a, b) => b.n - a.n);
  const topScores = allScores.slice(0, 5);
  return {
    simulations: n,
    p1: Math.round((p1 / n) * 100), pN: Math.round((pN / n) * 100), p2: Math.round((p2 / n) * 100),
    top_scores: topScores,
    // top_scores_full : la totalite des scores simules (pas seulement le
    // top 5) - necessaire pour pouvoir filtrer les scores compatibles avec
    // le marche recommande (ex: ne montrer que des scores >2.5 buts si le
    // pick est "Over 2.5") sans relancer une simulation.
    top_scores_full: allScores,
    over15: Math.round((over15 / n) * 100), over25: Math.round((over25 / n) * 100),
    under25: Math.round(((n - over25) / n) * 100), over35: Math.round((over35 / n) * 100),
    bttsY: Math.round((bttsY / n) * 100), bttsN: Math.round(((n - bttsY) / n) * 100),
  };
}

// Methode de Shin : retire la marge bookmaker (overround) d'un jeu de cotes
// mutuellement exclusives et exhaustives (ex: 1X2, ou une paire Over/Under).
// Plus rigoureux qu'une simple normalisation proportionnelle (1/cote / somme).
function shinProbabilities(odds) {
  const prices = odds.filter((o) => o && o > 1);
  if (!prices.length) return null;
  const rawProbs = prices.map((o) => 1 / o);
  const sumRaw = rawProbs.reduce((a, b) => a + b, 0);
  if (sumRaw <= 1) return rawProbs;
  let z = 0.02;
  for (let iter = 0; iter < 50; iter++) {
    let f = 0, df = 0;
    for (let i = 0; i < rawProbs.length; i++) {
      const qi = rawProbs[i];
      const denom = Math.sqrt(z * z + (4 * (1 - z) * qi * qi) / sumRaw);
      f += (z + denom) / (2 * (1 - z));
      df += (1 + ((2 * z) / sumRaw - (2 * qi * qi * (1 - 2 * z)) / (sumRaw * sumRaw)) / denom) / (2 * (1 - z)) + (z + denom) / (2 * (1 - z) * (1 - z));
    }
    f -= 1;
    const zNew = z - f / df;
    if (Math.abs(zNew - z) < 1e-8) break;
    z = Math.max(0, Math.min(0.15, zNew));
  }
  const trueProbs = rawProbs.map((qi) => (z + Math.sqrt(z * z + (4 * (1 - z) * qi * qi) / sumRaw)) / (2 * (1 - z)));
  const sumTrue = trueProbs.reduce((a, b) => a + b, 0);
  return trueProbs.map((p) => p / sumTrue);
}

// Probabilite implicite brute (marge bookmaker incluse) - repli quand une
// paire complementaire n'est pas disponible pour retirer la marge via Shin.
function impliedProbability(cote) {
  const c = parseFloat(cote);
  return c > 1 ? 100 / c : null;
}

// Elo -> probabilite de victoire (formule logistique standard, base 10/400).
function eloWinProb(eloH, eloA, homeAdvantage) {
  homeAdvantage = homeAdvantage || 0;
  const diff = eloH + homeAdvantage - eloA;
  return 1 / (1 + Math.pow(10, -diff / 400));
}

module.exports = {
  poissonProb, logFactorial, calcPoissonProbs,
  dixonColesCorr, calcDixonColesProbs,
  mulberry32, poissonKnuth, calcMonteCarlo, seedFromLambdas,
  shinProbabilities, impliedProbability, eloWinProb,
};
