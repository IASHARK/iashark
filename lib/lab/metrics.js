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
// frequence observee, probabilite moyenne PREDITE M0/M1, contribution NLL
// de CE score precis.
//
// BUG CORRIGE le 2026-09-05 (audit utilisateur EXP-001) : mean_prob_m0/m1
// etait calcule uniquement sur les matchs ou ce score s'est REELLEMENT
// produit (`matching`), pas sur l'ensemble des predictions - ce n'est PAS
// une metrique de calibration valide (elle melange selection sur le
// resultat et probabilite predite). Un diagnostic de calibration correct
// compare la probabilite MOYENNE PREDITE sur TOUS les matchs a la
// frequence OBSERVEE de ce score sur TOUS les matchs. nll_contribution_*
// reste, lui, intrinsequement calcule uniquement sur les matchs ou le
// score EST arrive (la NLL d'un evenement n'existe que pour un evenement
// observe) - ce champ n'avait pas ce bug.
function lowScoreDiagnostics(predictions) {
  const targets = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const out = {};
  const nTotal = predictions.length;
  for (const [h, a] of targets) {
    const key = `${h}-${a}`;
    const matching = predictions.filter((p) => p.h === h && p.a === a);

    let sumProbM0 = 0, sumProbM1 = 0;
    for (const p of predictions) {
      sumProbM0 += Math.exp(logProbability(p.lambdaH, p.lambdaA, h, a, p.rhoM0));
      sumProbM1 += Math.exp(logProbability(p.lambdaH, p.lambdaA, h, a, p.rhoM1));
    }

    let nllM0 = 0, nllM1 = 0;
    for (const p of matching) {
      nllM0 += -logProbability(p.lambdaH, p.lambdaA, h, a, p.rhoM0);
      nllM1 += -logProbability(p.lambdaH, p.lambdaA, h, a, p.rhoM1);
    }

    out[key] = {
      count_observed: matching.length,
      observed_frequency: nTotal ? matching.length / nTotal : null,
      mean_prob_m0: nTotal ? sumProbM0 / nTotal : null,
      mean_prob_m1: nTotal ? sumProbM1 / nTotal : null,
      nll_contribution_m0: matching.length ? nllM0 / matching.length : null,
      nll_contribution_m1: matching.length ? nllM1 / matching.length : null,
    };
  }
  return out;
}

module.exports = { exactScoreNLL, binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier, lowScoreDiagnostics };
