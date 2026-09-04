#!/usr/bin/env node
"use strict";
// EXP-002 (SPEC LAB PRO v1.0, M2) - lancement reel. Manifest DEJA cree
// (scripts/experiments/exp002_manifest.json, jamais modifie apres ce
// point). Reutilise le dataset reel deja collecte pour EXP-001 (GATE B1) -
// AUCUNE nouvelle collecte, AUCUN chargement de 2025-2026.

const fs = require("fs");
const path = require("path");
const { runWalkForwardM2 } = require("../lib/lab/walkforward-m2-runner.js");
const { logProbability } = require("../lib/lab/dc-log-probability.js");
const { lossDelta } = require("../lib/lab/loss-delta.js");
const { pairedBlockBootstrap } = require("../lib/lab/bootstrap.js");
const { getIsoYearWeek } = require("../lib/lab/iso-week.js");
const { evaluatePromotionM2 } = require("../lib/lab/promotion-m2.js");
const { binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier } = require("../lib/lab/metrics.js");

const LEAGUE_ID = 39;
const CHAMPION_RHO = -0.0845;
const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
const MANIFEST_PATH = path.join(__dirname, "experiments", "exp002_manifest.json");
const REPORT_PATH = path.join(__dirname, "experiments", "exp002_report.json");

function loadSeason(season) {
  return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${season}.json`), "utf8"));
}

// --- 1. Chargement du dataset reel (JAMAIS 2025) ---
const f2022 = loadSeason(2022);
const f2023 = loadSeason(2023);
const f2024 = loadSeason(2024);

const currentSeasonFixturesBySeasons = new Map([[2023, f2023], [2024, f2024]]);
const previousSeasonFixturesBySeasons = new Map([[2023, f2022], [2024, f2023]]);

// --- 2. Walk-forward M0 vs M2 (deterministe, aucun appel Python) ---
const runOptions = { currentSeasonFixturesBySeasons, previousSeasonFixturesBySeasons, oosSeasons: [2023, 2024], leagueId: LEAGUE_ID };
const result1 = runWalkForwardM2(runOptions);
// Verification empirique de determinisme (criterion #6) - un deuxieme
// run independant doit produire un resultat BYTE-IDENTIQUE.
const result2 = runWalkForwardM2(runOptions);
const mechanismDeterministic = JSON.stringify(result1.predictions) === JSON.stringify(result2.predictions);
const predictions = result1.predictions;

console.log(`Predictions: ${predictions.length} (mechanism deterministic: ${mechanismDeterministic})`);

// --- 3. NLL par prediction + delta (convention officielle) ---
for (const p of predictions) {
  p.nll_m0 = -logProbability(p.lambdaH_m0, p.lambdaA_m0, p.goals_home_90, p.goals_away_90, CHAMPION_RHO);
  p.nll_m2 = -logProbability(p.lambdaH_m2, p.lambdaA_m2, p.goals_home_90, p.goals_away_90, CHAMPION_RHO);
  p.delta = lossDelta(p.nll_m2, p.nll_m0); // negatif = M2 meilleur
}

// --- 4. Invariant LATE verifie sur les donnees REELLES (pas seulement le test synthetique) ---
const lateInvariantCases = predictions.filter((p) => p.prior_weight_home === 0 && p.prior_weight_away === 0);
const lateInvariantViolations = lateInvariantCases.filter((p) => Math.abs(p.lambdaH_m2 - p.lambdaH_m0) > 1e-12 || Math.abs(p.lambdaA_m2 - p.lambdaA_m0) > 1e-12 || Math.abs(p.markets_m2.p1 - p.markets_m0.p1) > 1e-12);
const lateInvariantViolated = lateInvariantViolations.length > 0;
console.log(`Invariant LATE : ${lateInvariantCases.length} matchs concernes (poids nul des 2 cotes), ${lateInvariantViolations.length} violation(s)`);

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function median(arr) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
function percentile(arr, p) {
  if (!arr.length) return null;
  const s = arr.slice().sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))));
  return s[idx];
}
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((v) => (v - m) ** 2)));
}

// --- 5. Bootstrap (bloc = semaine x league-season) sur un sous-ensemble donne de predictions ---
function bootstrapOn(preds, seed) {
  const byBlock = new Map();
  for (const p of preds) {
    const { isoYear, isoWeek } = getIsoYearWeek(p.cutoff);
    const key = `${LEAGUE_ID}-${p.season}-${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push(p.delta);
  }
  const blocks = Array.from(byBlock.values());
  if (!blocks.length) return { valid: false, reason: "NO_DATA" };
  return pairedBlockBootstrap(blocks, { seed, nResamples: 10000 });
}

// --- 6. Metriques secondaires (1X2/O-U2.5/BTTS) sur un sous-ensemble ---
function secondaryMetricsOn(preds) {
  const ou25 = { m0: [], m2: [] }, btts = { m0: [], m2: [] }, x12 = { m0: [], m2: [] };
  for (const p of preds) {
    const total = p.goals_home_90 + p.goals_away_90;
    const over25 = total > 2.5 ? 1 : 0;
    const bttsY = p.goals_home_90 > 0 && p.goals_away_90 > 0 ? 1 : 0;
    const outcome = p.goals_home_90 > p.goals_away_90 ? "p1" : (p.goals_home_90 === p.goals_away_90 ? "pN" : "p2");
    ou25.m0.push({ prob: p.markets_m0.overUnder["2.5"].over, outcome: over25 });
    ou25.m2.push({ prob: p.markets_m2.overUnder["2.5"].over, outcome: over25 });
    btts.m0.push({ prob: p.markets_m0.btts.yes, outcome: bttsY });
    btts.m2.push({ prob: p.markets_m2.btts.yes, outcome: bttsY });
    x12.m0.push({ probs: { p1: p.markets_m0.p1, pN: p.markets_m0.pN, p2: p.markets_m0.p2 }, outcome });
    x12.m2.push({ probs: { p1: p.markets_m2.p1, pN: p.markets_m2.pN, p2: p.markets_m2.p2 }, outcome });
  }
  return {
    ou25: { logloss_m0: binaryLogLoss(ou25.m0), logloss_m2: binaryLogLoss(ou25.m2), brier_m0: binaryBrier(ou25.m0), brier_m2: binaryBrier(ou25.m2) },
    btts: { logloss_m0: binaryLogLoss(btts.m0), logloss_m2: binaryLogLoss(btts.m2), brier_m0: binaryBrier(btts.m0), brier_m2: binaryBrier(btts.m2) },
    x12: { logloss_m0: multiclassLogLoss(x12.m0), logloss_m2: multiclassLogLoss(x12.m2), brier_m0: multiclassBrier(x12.m0), brier_m2: multiclassBrier(x12.m2) },
  };
}

// --- 7. Diagnostics bas-score - mean probability sur L'ENSEMBLE du bucket considere ---
function lowScoreDiagnosticsOn(preds) {
  const targets = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const out = {};
  const nTotal = preds.length;
  for (const [h, a] of targets) {
    const key = `${h}-${a}`;
    const matching = preds.filter((p) => p.goals_home_90 === h && p.goals_away_90 === a);
    let sumM0 = 0, sumM2 = 0;
    for (const p of preds) {
      sumM0 += Math.exp(logProbability(p.lambdaH_m0, p.lambdaA_m0, h, a, CHAMPION_RHO));
      sumM2 += Math.exp(logProbability(p.lambdaH_m2, p.lambdaA_m2, h, a, CHAMPION_RHO));
    }
    let nllM0 = 0, nllM2 = 0;
    for (const p of matching) {
      nllM0 += -logProbability(p.lambdaH_m0, p.lambdaA_m0, h, a, CHAMPION_RHO);
      nllM2 += -logProbability(p.lambdaH_m2, p.lambdaA_m2, h, a, CHAMPION_RHO);
    }
    out[key] = {
      count_observed: matching.length,
      observed_frequency: nTotal ? matching.length / nTotal : null,
      mean_prob_m0: nTotal ? sumM0 / nTotal : null,
      mean_prob_m2: nTotal ? sumM2 / nTotal : null,
      nll_contribution_m0: matching.length ? nllM0 / matching.length : null,
      nll_contribution_m2: matching.length ? nllM2 / matching.length : null,
    };
  }
  return out;
}

// --- 8. Bloc de resultats pour un sous-ensemble donne (bucket, saison, global, returning/promoted) ---
function summarize(preds, seed) {
  if (!preds.length) return { n: 0 };
  const nllM0 = mean(preds.map((p) => p.nll_m0));
  const nllM2 = mean(preds.map((p) => p.nll_m2));
  const boot = bootstrapOn(preds, seed);
  return {
    n: preds.length,
    nll_m0: nllM0,
    nll_m2: nllM2,
    delta_mean: nllM2 - nllM0,
    relative_gain: (nllM0 - nllM2) / nllM0, // positif = M2 meilleur
    bootstrap: boot,
    secondary_metrics: secondaryMetricsOn(preds),
  };
}

const SEED = "EXP-002-v1";
const GLOBAL = summarize(predictions, SEED);
const byBucket = {};
for (const bucket of ["EARLY", "TRANSITION", "LATE"]) byBucket[bucket] = summarize(predictions.filter((p) => p.bucket === bucket), SEED + "-" + bucket);
const bySeason = {};
for (const season of [2023, 2024]) bySeason[season] = summarize(predictions.filter((p) => p.season === season), SEED + "-S" + season);
const byBucketSeason = {};
for (const season of [2023, 2024]) {
  byBucketSeason[season] = {};
  for (const bucket of ["EARLY", "TRANSITION", "LATE"]) byBucketSeason[season][bucket] = summarize(predictions.filter((p) => p.season === season && p.bucket === bucket), SEED + "-S" + season + "-" + bucket);
}

// --- 9. Returning vs promoted (les DEUX equipes returning/promoted separement, par cote) ---
const returningHome = predictions.filter((p) => p.home_returning);
const promotedHome = predictions.filter((p) => !p.home_returning);
const returningAway = predictions.filter((p) => p.away_returning);
const promotedAway = predictions.filter((p) => !p.away_returning);
const returningVsPromoted = {
  home_returning: summarize(returningHome, SEED + "-HR"),
  home_promoted: summarize(promotedHome, SEED + "-HP"),
  away_returning: summarize(returningAway, SEED + "-AR"),
  away_promoted: summarize(promotedAway, SEED + "-AP"),
};

// --- 10. Distribution des poids Bayes reellement utilises ---
const allWeights = predictions.flatMap((p) => [p.prior_weight_home, p.prior_weight_away]);
const bayesWeightDistribution = {
  mean: mean(allWeights), median: median(allWeights), p05: percentile(allWeights, 0.05), p95: percentile(allWeights, 0.95),
  min: Math.min(...allWeights), max: Math.max(...allWeights),
};

// --- 11. Low-score diagnostics (global + par bucket) ---
const lowScoreGlobal = lowScoreDiagnosticsOn(predictions);
const lowScoreByBucket = {};
for (const bucket of ["EARLY", "TRANSITION", "LATE"]) lowScoreByBucket[bucket] = lowScoreDiagnosticsOn(predictions.filter((p) => p.bucket === bucket));

// --- 12. Decision de promotion (criteres EARLY + degradation globale) ---
const promotion = evaluatePromotionM2({
  earlyRelativeGain: byBucket.EARLY.relative_gain,
  earlyCiLower: byBucket.EARLY.bootstrap.valid ? byBucket.EARLY.bootstrap.ci_lower : -Infinity,
  earlyCiUpper: byBucket.EARLY.bootstrap.valid ? byBucket.EARLY.bootstrap.ci_upper : Infinity,
  globalRelativeDegradation: -GLOBAL.relative_gain, // relative_gain positif=M2 meilleur -> degradation = -gain
  lateInvariantViolated,
  temporalLeakageDetected: false, // verifie par tests/lab-walkforward-m2-runner.test.js AVANT ce run
  mechanismDeterministic,
});

console.log("\n=== DECISION M2 ===");
console.log(JSON.stringify(promotion, null, 2));

// --- 13. Ecrit le rapport ---
const report = {
  experiment_id: "EXP-002",
  code_sha: null, // rempli par le script d'orchestration apres commit
  dataset_version: "403e31d057ba094993f29e3c8c88dec21119f8438acc2c7b10a21200dd6a2942",
  lockbox_hash_2025_2026: "f611ad31213505fd69edfc8941e79ec7d182dc83b426df3a8fb04d67ec4fa01a",
  n_predictions_total: predictions.length,
  seasons_used: [2023, 2024],
  mechanism_deterministic: mechanismDeterministic,
  late_invariant: { n_cases: lateInvariantCases.length, n_violations: lateInvariantViolations.length, violated: lateInvariantViolated },
  bayes_weight_distribution: bayesWeightDistribution,
  global: GLOBAL,
  by_bucket: byBucket,
  by_season: bySeason,
  by_bucket_and_season: byBucketSeason,
  returning_vs_promoted: returningVsPromoted,
  low_score_diagnostics_global: lowScoreGlobal,
  low_score_diagnostics_by_bucket: lowScoreByBucket,
  promotion,
  predictions,
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nRapport ecrit: ${REPORT_PATH}`);
