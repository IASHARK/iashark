"use strict";
// GATE C5 (SPEC LAB PRO v1.0 SS13) - metriques deterministes pour
// comparer M0/M1 (et au-dela). Primaire : NLL exact-score. Secondaires :
// log-loss/Brier 1X2, O/U2.5, BTTS. Diagnostics faibles scores.

const { logProbability } = require("./dc-log-probability.js");

// NLL exact-score moyenne sur un ensemble de predictions {lambdaH,lambdaA,rho,h,a}
function exactScoreNLL(predictions) {
  if (!predictions.length) return null;
  let sum = 0;
  for (const p of predictions) sum += -logProbability(p.lambdaH, p.lambdaA, p.h, p.a, p.rho);
  return sum / predictions.length;
}

// log-loss binaire standard : -mean(y*log(p) + (1-y)*log(1-p)), p clampe
// dans [eps, 1-eps] pour eviter -Infinity sur une prediction extreme et fausse.
function binaryLogLoss(items) {
  if (!items.length) return null;
  const eps = 1e-9;
  let sum = 0;
  for (const it of items) {
    const p = Math.min(1 - eps, Math.max(eps, it.prob));
    sum += it.outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
  }
  return sum / items.length;
}

function binaryBrier(items) {
  if (!items.length) return null;
  let sum = 0;
  for (const it of items) sum += Math.pow(it.prob - it.outcome, 2);
  return sum / items.length;
}

// 1X2 multiclasse : items = [{probs:{p1,pN,p2}, outcome:'p1'|'pN'|'p2'}, ...]
function multiclassLogLoss(items) {
  if (!items.length) return null;
  const eps = 1e-9;
  let sum = 0;
  for (const it of items) {
    const p = Math.min(1 - eps, Math.max(eps, it.probs[it.outcome]));
    sum += -Math.log(p);
  }
  return sum / items.length;
}

function multiclassBrier(items) {
  if (!items.length) return null;
  const classes = ["p1", "pN", "p2"];
  let sum = 0;
  for (const it of items) {
    for (const c of classes) {
      const y = it.outcome === c ? 1 : 0;
      sum += Math.pow(it.probs[c] - y, 2);
    }
  }
  return sum / items.length;
}

// Diagnostic faibles scores 0-0/1-0/0-1/1-1 : pour chaque, compte observe,
// probabilite moyenne M0/M1, contribution NLL de CE score precis.
function lowScoreDiagnostics(predictions) {
  const targets = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const out = {};
  for (const [h, a] of targets) {
    const key = `${h}-${a}`;
    const matching = predictions.filter((p) => p.h === h && p.a === a);
    if (!matching.length) { out[key] = { count_observed: 0, mean_prob_m0: null, mean_prob_m1: null, nll_contribution_m0: null, nll_contribution_m1: null }; continue; }
    let sumProbM0 = 0, sumProbM1 = 0, nllM0 = 0, nllM1 = 0;
    for (const p of matching) {
      const probM0 = Math.exp(logProbability(p.lambdaH, p.lambdaA, h, a, p.rhoM0));
      const probM1 = Math.exp(logProbability(p.lambdaH, p.lambdaA, h, a, p.rhoM1));
      sumProbM0 += probM0; sumProbM1 += probM1;
      nllM0 += -logProbability(p.lambdaH, p.lambdaA, h, a, p.rhoM0);
      nllM1 += -logProbability(p.lambdaH, p.lambdaA, h, a, p.rhoM1);
    }
    out[key] = {
      count_observed: matching.length,
      mean_prob_m0: sumProbM0 / matching.length,
      mean_prob_m1: sumProbM1 / matching.length,
      nll_contribution_m0: nllM0 / matching.length,
      nll_contribution_m1: nllM1 / matching.length,
    };
  }
  return out;
}

module.exports = { exactScoreNLL, binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier, lowScoreDiagnostics };
