"use strict";
// PLAYER SCORER OOS_DEV 2023-24 (2026-09-05). Fonctions PURES d'analyse
// pour la comparaison A/B/C/D - n'affecte AUCUN modele existant (V1,
// V2, baselines). Reutilise mulberry32 (lib/models.js) pour tout tirage
// pseudo-aleatoire, jamais reimplemente.

const { mulberry32 } = require("../models.js");

// Semaine ISO-8601 (lundi-dimanche, semaine 1 = celle contenant le
// premier jeudi de l'annee) - unite de blocage temporel pour le
// bootstrap par bloc (jamais un resample ligne-a-ligne independant :
// les player-rows d'un meme match, et les matchs d'une meme semaine,
// sont correles).
function isoWeekKey(dateIso) {
  const d = new Date(dateIso);
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // lundi=0..dimanche=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // jeudi de cette semaine
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const weekNum = 1 + Math.round((date - firstThursday) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }

// rows = [{ block, valueA, valueB }] (valueA/valueB = logloss du modele
// A/B pour cette observation). Resample les BLOCS (pas les lignes) avec
// remise - toutes les player-rows d'un bloc resample sont conservees
// ENSEMBLE. delta = mean(A) - mean(B) sur l'echantillon resample ; PAS
// une moyenne de deltas par ligne (le delta se calcule sur les moyennes
// agregees, pas ligne-a-ligne).
function pairedBlockBootstrapDelta(rows, nResamples, seed) {
  const blocks = new Map();
  for (const r of rows) {
    if (!blocks.has(r.block)) blocks.set(r.block, []);
    blocks.get(r.block).push(r);
  }
  const blockArrays = [...blocks.values()];
  if (!blockArrays.length) return null;

  const observedDelta = mean(rows.map((r) => r.valueA)) - mean(rows.map((r) => r.valueB));

  const rng = mulberry32(seed);
  const deltas = new Array(nResamples);
  for (let b = 0; b < nResamples; b++) {
    let sumA = 0, sumB = 0, n = 0;
    for (let i = 0; i < blockArrays.length; i++) {
      const picked = blockArrays[Math.floor(rng() * blockArrays.length)];
      for (const r of picked) { sumA += r.valueA; sumB += r.valueB; n++; }
    }
    deltas[b] = n > 0 ? (sumA / n - sumB / n) : 0;
  }
  deltas.sort((x, y) => x - y);
  const ciLower = deltas[Math.floor(0.025 * deltas.length)];
  const ciUpper = deltas[Math.floor(0.975 * deltas.length)];
  const probabilityABetter = deltas.filter((d) => d < 0).length / deltas.length; // A meilleur (logloss plus bas) si delta<0

  return {
    n_blocks: blockArrays.length,
    n_reps: nResamples,
    observed_delta: observedDelta,
    relative_gain_pct: observedDelta !== 0 ? (-observedDelta / mean(rows.map((r) => r.valueB))) * 100 : 0,
    ci_lower: ciLower,
    ci_upper: ciUpper,
    probability_a_better: probabilityABetter,
  };
}

// Regression logistique a 2 parametres (Platt-style) : y ~
// Bernoulli(sigmoid(a + b*logit(p))). Bien calibre => a~=0, b~=1.
// Newton-Raphson sur l'OBJECTIF PENALISE = logL - (ridge/2)*(a^2+b^2)
// (meme discipline que lib/player-lab/v2/relative-risk-model.js : grad
// ET hess tous deux regularises par la MEME M=ridge*I, jamais un ridge
// applique seulement au Hessien - c'est exactement le bug corrige dans
// FIT_NUMERICAL_CLOSURE, reproduit ici a l'identique s'il n'etait pas
// traite). SANS ce ridge, la baseline A (probabilite EXACTEMENT 0 pour
// tout joueur remplacant, cf. convention documentee dans le script OOS)
// cree une quasi-separation dans CETTE regression de calibration a 2
// parametres - constate empiriquement (intercept/slope divergeant vers
// des valeurs de l'ordre de 1e10 avec l'ancien ridge=1e-6 applique
// seulement au Hessien). ridge=1e-2 rend l'objectif strictement concave
// partout (memes garanties que relative-risk-model.js), donc un
// intercept/slope FINI et reproductible, y compris pour une baseline
// degenerescente. AUCUN tuning de calibration sur OOS_DEV - ce ridge
// stabilise la MESURE elle-meme, jamais le modele evalue.
function safeLogit(p) { const c = Math.min(Math.max(p, 1e-9), 1 - 1e-9); return Math.log(c / (1 - c)); }
function sigmoid(z) { return 1 / (1 + Math.exp(-z)); }

// penalized_objective(a,b) = sum(y*log(pi)+(1-y)*log(1-pi)) - (ridge/2)*(a^2+b^2)
function penalizedCalibrationObjective(xs, ys, a, b, ridge) {
  let obj = 0, g0 = 0, g1 = 0, h00 = 0, h01 = 0, h11 = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], y = ys[i];
    const z = a + b * x;
    const pi = sigmoid(z);
    const piClamped = Math.min(Math.max(pi, 1e-12), 1 - 1e-12);
    obj += y * Math.log(piClamped) + (1 - y) * Math.log(1 - piClamped);
    const w = pi * (1 - pi);
    g0 += (y - pi); g1 += (y - pi) * x;
    h00 -= w; h01 -= w * x; h11 -= w * x * x;
  }
  obj -= (ridge / 2) * (a * a + b * b);
  g0 -= ridge * a; g1 -= ridge * b;
  h00 -= ridge; h11 -= ridge;
  return { obj, g0, g1, h00, h01, h11 };
}

// Newton amorti (backtracking line-search, meme discipline que
// lib/player-lab/v2/relative-risk-model.js) sur l'objectif PENALISE. Un
// pas Newton plein diverge sur une baseline degenerescente (ex :
// baseline A, probabilite EXACTEMENT 0 pour tout remplacant -> x=logit(p)
// sature a l'extreme -20.7 pour des milliers de lignes identiques,
// levier enorme sur un pas Newton non amorti) - constate empiriquement
// (intercept/slope divergeant vers 1e6-1e10 sans line-search, y compris
// avec un ridge=1e-2 correctement applique au gradient ET au Hessien).
// AUCUN tuning de calibration sur OOS_DEV - ce mecanisme stabilise la
// MESURE elle-meme, jamais le modele evalue.
function calibrationInterceptSlope(rows, maxIter) {
  maxIter = maxIter || 100;
  const ridge = 1e-2;
  const xs = rows.map((r) => safeLogit(r.p));
  const ys = rows.map((r) => r.y);
  let a = 0, b = 1;
  let current = penalizedCalibrationObjective(xs, ys, a, b, ridge);
  let converged = false, iterationsUsed = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    iterationsUsed = iter + 1;
    const det = current.h00 * current.h11 - current.h01 * current.h01;
    if (Math.abs(det) < 1e-12) break;
    const da = (current.g0 * current.h11 - current.g1 * current.h01) / det;
    const db = (current.h00 * current.g1 - current.h01 * current.g0) / det;

    let step = 1;
    let candA = a - step * da, candB = b - step * db;
    let candidate = penalizedCalibrationObjective(xs, ys, candA, candB, ridge);
    let backtracks = 0;
    while (candidate.obj < current.obj && backtracks < 40) {
      step *= 0.5;
      candA = a - step * da; candB = b - step * db;
      candidate = penalizedCalibrationObjective(xs, ys, candA, candB, ridge);
      backtracks++;
    }

    const changed = Math.abs(candA - a) < 1e-9 && Math.abs(candB - b) < 1e-9;
    a = candA; b = candB; current = candidate;
    if (changed) { converged = true; break; }
  }
  return { intercept: a, slope: b, converged, n_iterations: iterationsUsed, ridge };
}

// nBins bins de largeur egale sur la probabilite PREDITE (pas le rang).
function reliabilityBins(rows, nBins) {
  nBins = nBins || 10;
  const bins = Array.from({ length: nBins }, (_, i) => ({ bin_lo: i / nBins, bin_hi: (i + 1) / nBins, n: 0, sumP: 0, sumY: 0 }));
  for (const { p, y } of rows) {
    const pClamped = Math.min(1, Math.max(0, p)); // derive a floating-point drift (e.g. -1e-16 from a closed-form sum) into the boundary bin, never an out-of-range index
    const idx = Math.min(nBins - 1, Math.max(0, Math.floor(pClamped * nBins)));
    bins[idx].n++; bins[idx].sumP += p; bins[idx].sumY += y;
  }
  return bins.map((bin) => ({
    bin_lo: bin.bin_lo, bin_hi: bin.bin_hi, n: bin.n,
    mean_predicted: bin.n > 0 ? bin.sumP / bin.n : null,
    observed_rate: bin.n > 0 ? bin.sumY / bin.n : null,
  }));
}

// ECE descriptif = moyenne ponderee (par n) de |observed-predicted| sur les bins non-vides.
function expectedCalibrationError(bins, nTotal) {
  return bins.reduce((s, bin) => s + (bin.n > 0 ? (bin.n / nTotal) * Math.abs(bin.observed_rate - bin.mean_predicted) : 0), 0);
}

function sha256Hex(str) {
  return require("crypto").createHash("sha256").update(str).digest("hex");
}

module.exports = { isoWeekKey, mean, pairedBlockBootstrapDelta, calibrationInterceptSlope, reliabilityBins, expectedCalibrationError, sha256Hex };
