"use strict";
// Mesure de calibration/backtest — Brier score, log loss, table de fiabilite
// (calibration curve) et erreur de calibration attendue (ECE). Generique :
// prend n'importe quelle liste de {prob, outcome} (outcome 0/1), pas
// specifique a IASHARK. Voir scripts/backtest_historique.js pour l'usage
// reel contre historique.json, et tests/calibration.test.js.

// Brier score : moyenne de (prob - outcome)^2. 0 = parfait, 0.25 = pas mieux
// qu'un pile ou face constant a 50%, plus haut = pire qu'un pile ou face.
function brierScore(items) {
  if (!items || !items.length) return null;
  let sum = 0;
  for (const it of items) sum += Math.pow(it.prob - it.outcome, 2);
  return sum / items.length;
}

// Log loss (entropie croisee binaire). Clampe prob dans [eps, 1-eps] pour
// eviter -Infinity sur une prediction absolument certaine et fausse.
function logLoss(items) {
  if (!items || !items.length) return null;
  const eps = 1e-9;
  let sum = 0;
  for (const it of items) {
    const p = Math.min(1 - eps, Math.max(eps, it.prob));
    sum += it.outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
  }
  return sum / items.length;
}

// Table de fiabilite : regroupe les items par bucketFn(item) et calcule, par
// groupe, la probabilite moyenne predite vs le taux de reussite reel. Une
// calibration parfaite a avgPredictedProb ~= actualRate pour chaque bucket.
// Un bucket ou actualRate < avgPredictedProb est SURCONFIANT (le modele
// annonce plus de certitude qu'il n'en a reellement).
function calibrationTable(items, bucketFn) {
  const groups = {};
  for (const it of items) {
    const key = bucketFn(it);
    if (!groups[key]) groups[key] = { key, count: 0, probSum: 0, wins: 0 };
    groups[key].count++;
    groups[key].probSum += it.prob;
    if (it.outcome === 1) groups[key].wins++;
  }
  return Object.values(groups)
    .map((g) => ({
      key: g.key,
      count: g.count,
      avgPredictedProb: g.probSum / g.count,
      actualRate: g.wins / g.count,
      gap: g.wins / g.count - g.probSum / g.count,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// Expected Calibration Error : moyenne (ponderee par la taille des buckets)
// de l'ecart absolu entre probabilite predite et taux reel. 0 = calibration
// parfaite.
function expectedCalibrationError(table) {
  const total = table.reduce((s, g) => s + g.count, 0);
  if (!total) return null;
  return table.reduce((s, g) => s + g.count * Math.abs(g.gap), 0) / total;
}

module.exports = { brierScore, logLoss, calibrationTable, expectedCalibrationError };
