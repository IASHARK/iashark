"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 15. Metriques PRIMAIRE et
// SECONDAIRES - fonctions PURES, PRETES, mais PAS ENCORE executees
// contre un vrai jeu OOS (item 17 : STOP juste avant le premier
// resultat OOS). Cluster bootstrap PAR FIXTURE (ou semaine ISO) -
// jamais un resample ligne-a-ligne independant, les observations d'un
// meme match/d'une meme semaine sont correlees.

const { mulberry32 } = require("../models.js");

function logloss(probability, outcomeWin) {
  const p = Math.min(Math.max(probability, 1e-12), 1 - 1e-12);
  return outcomeWin ? -Math.log(p) : -Math.log(1 - p);
}
function brier(probability, outcomeWin) {
  const y = outcomeWin ? 1 : 0;
  return (probability - y) * (probability - y);
}

// rows = [{ model_probability, outcome: "WIN"|"LOSE" }] - PRIMARY metric.
function anytimeScorerLogloss(rows) {
  const usable = rows.filter((r) => r.outcome === "WIN" || r.outcome === "LOSE");
  if (!usable.length) return null;
  const sum = usable.reduce((s, r) => s + logloss(r.model_probability, r.outcome === "WIN"), 0);
  return sum / usable.length;
}

function computeSecondaryMetrics(rows) {
  const usable = rows.filter((r) => r.outcome === "WIN" || r.outcome === "LOSE");
  if (!usable.length) return null;
  const meanBrier = usable.reduce((s, r) => s + brier(r.model_probability, r.outcome === "WIN"), 0) / usable.length;
  return { n: usable.length, mean_brier: meanBrier, mean_logloss: anytimeScorerLogloss(usable) };
}

// Separe STRICTEMENT PRE_LINEUP et POST_LINEUP_CONDITIONAL - jamais
// une metrique fusionnee entre les deux modes.
function splitMetricsByMode(rows) {
  return {
    PRE_LINEUP: computeSecondaryMetrics(rows.filter((r) => r.mode === "PRE_LINEUP")),
    POST_LINEUP_CONDITIONAL: computeSecondaryMetrics(rows.filter((r) => r.mode === "POST_LINEUP_CONDITIONAL")),
  };
}

// scorerSelectionRows = [{ fixture_id, selected_player_id, actual_scorer_ids, selected_player_probability }]
function topOneHitRate(scorerSelectionRows) {
  if (!scorerSelectionRows.length) return null;
  const hits = scorerSelectionRows.filter((r) => r.actual_scorer_ids.includes(r.selected_player_id)).length;
  return {
    n: scorerSelectionRows.length,
    hit_rate: hits / scorerSelectionRows.length,
    mean_selected_probability: scorerSelectionRows.reduce((s, r) => s + r.selected_player_probability, 0) / scorerSelectionRows.length,
  };
}

// attributionRows = [{ true_scorer_probability }] - probabilite que le
// modele attribuait au VRAI buteur, evaluee sur les buts REELS
// uniquement (jamais sur un match sans but).
function scorerAttributionNLL(attributionRows) {
  const valid = attributionRows.filter((r) => r.true_scorer_probability > 0);
  if (!valid.length) return null;
  const sum = valid.reduce((s, r) => s - Math.log(Math.max(r.true_scorer_probability, 1e-12)), 0);
  return sum / valid.length;
}

// Cluster bootstrap PAR CLUSTER (fixture_id ou semaine ISO selon
// clusterKeyFn) - jamais un resample ligne-a-ligne independant.
function clusterBootstrapMean(rows, clusterKeyFn, valueFn, nResamples, seed) {
  const rng = mulberry32(seed);
  const clusters = new Map();
  for (const r of rows) {
    const key = clusterKeyFn(r);
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(valueFn(r));
  }
  const clusterArrays = [...clusters.values()];
  if (!clusterArrays.length) return null;
  const means = [];
  for (let b = 0; b < nResamples; b++) {
    let sum = 0, n = 0;
    for (let i = 0; i < clusterArrays.length; i++) {
      const picked = clusterArrays[Math.floor(rng() * clusterArrays.length)];
      for (const v of picked) { sum += v; n++; }
    }
    means.push(n > 0 ? sum / n : 0);
  }
  means.sort((a, b) => a - b);
  return {
    n_clusters: clusterArrays.length,
    ci_lower: means[Math.floor(0.025 * means.length)],
    ci_upper: means[Math.floor(0.975 * means.length)],
    mean_of_resamples: means.reduce((a, b) => a + b, 0) / means.length,
  };
}

module.exports = { logloss, brier, anytimeScorerLogloss, computeSecondaryMetrics, splitMetricsByMode, topOneHitRate, scorerAttributionNLL, clusterBootstrapMean };
