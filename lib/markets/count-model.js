"use strict";

function countLineProbability(input) {
  input = input || {};
  const mean = Number(input.mean);
  const variance = Number(input.variance);
  const line = Number(input.line);
  if (!Number.isFinite(mean) || mean <= 0 || !Number.isFinite(line) || line < 0) return null;
  // Integer lines require push-aware settlement, deliberately not represented
  // by this binary probability contract.
  if (Math.abs(line - Math.round(line)) < 1e-9) return null;

  const maxUnder = Math.floor(line);
  const useNegativeBinomial = Number.isFinite(variance) && variance > mean * 1.05;
  let probability = 0;
  let pmf;
  if (useNegativeBinomial) {
    const r = (mean * mean) / (variance - mean);
    const p = r / (r + mean);
    pmf = Math.pow(p, r);
    for (let k = 0; k <= maxUnder; k++) {
      if (k > 0) pmf *= ((k - 1 + r) / k) * (1 - p);
      probability += pmf;
    }
  } else {
    pmf = Math.exp(-mean);
    for (let k = 0; k <= maxUnder; k++) {
      if (k > 0) pmf *= mean / k;
      probability += pmf;
    }
  }
  const under = Math.max(0, Math.min(1, probability));
  return { over: 1 - under, under, model: useNegativeBinomial ? "NEGATIVE_BINOMIAL" : "POISSON" };
}

module.exports = { countLineProbability };
