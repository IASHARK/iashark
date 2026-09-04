#!/usr/bin/env node
"use strict";
// EXP-001R - lancement reel corrige (CHAMPION_REPLAY_MISMATCH). Manifest
// DEJA cree (scripts/experiments/exp001r_manifest.json, status=RUNNING,
// jamais modifie apres ce point). Reutilise le dataset reel GATE B1
// (INCHANGE) et reutilise au maximum la logique de rapport deja testee
// de lib/lab/run-experiment.js (computeSecondaryMetrics, buildNllDeltaBlocks,
// pythonRhoFitter) - seul le walk-forward change (lib/lab/walkforward-runner-r.js,
// champion season-scope).

const fs = require("fs");
const path = require("path");
const { runWalkForwardR } = require("../lib/lab/walkforward-runner-r.js");
const { pythonRhoFitter, computeSecondaryMetrics } = require("../lib/lab/run-experiment.js");
const { logProbability } = require("../lib/lab/dc-log-probability.js");
const { lossDelta } = require("../lib/lab/loss-delta.js");
const { pairedBlockBootstrap } = require("../lib/lab/bootstrap.js");
const { getIsoYearWeek } = require("../lib/lab/iso-week.js");
const { evaluatePromotion } = require("../lib/promotion.js");
const { exactScoreNLL, lowScoreDiagnostics } = require("../lib/lab/metrics.js");

const LEAGUE_ID = 39;
const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
const REPORT_PATH = path.join(__dirname, "experiments", "exp001r_report.json");

function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }
const f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);

const runOptions = {
  allFixtures: [...f2022, ...f2023, ...f2024],
  trainSeasons: [2022], oosSeasons: [2023, 2024],
  championRho: -0.0845,
  candidateRhoFitter: pythonRhoFitter(),
  leagueAvgH: 1.35, leagueAvgA: 1.10, leagueId: LEAGUE_ID,
};

console.log("Lancement EXP-001R (walk-forward season-scope + fit_rho.py reel)...");
const wf = runWalkForwardR(runOptions);
console.log(`n_predictions=${wf.predictions.length}, n_excluded_m0_unavailable=${wf.n_excluded_m0_unavailable}, n_cutoffs=${wf.cutoffs.length}`);

const nllM0 = exactScoreNLL(wf.predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, rho: p.rho_m0, h: p.goals_home_90, a: p.goals_away_90 })));
const nllM1 = exactScoreNLL(wf.predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, rho: p.rho_m1, h: p.goals_home_90, a: p.goals_away_90 })));

const lowScore = lowScoreDiagnostics(wf.predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rhoM0: p.rho_m0, rhoM1: p.rho_m1 })));
const secondary = computeSecondaryMetrics(wf.predictions);

const convergedCount = wf.fitLog.filter((f) => f.convergence).length;
const convergenceRate = wf.fitLog.length ? convergedCount / wf.fitLog.length : 0;
const boundaryCount = wf.fitLog.filter((f) => f.on_boundary).length;
const boundaryHitRate = wf.fitLog.length ? boundaryCount / wf.fitLog.length : 0;
const rhoValues = wf.fitLog.map((f) => f.rho_hat).filter((v) => typeof v === "number");

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function median(arr) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function percentile(arr, p) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; }
function std(arr) { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map((v) => (v - m) ** 2))); }
const rhoStd = std(rhoValues);

// --- Bootstrap : bloc semaine x league-season (SPEC, applique directement, jamais journalier) ---
function buildWeeklyBlocks(predictions) {
  const byBlock = new Map();
  for (const p of predictions) {
    const nllChampion = -logProbability(p.lambdaH, p.lambdaA, p.goals_home_90, p.goals_away_90, p.rho_m0);
    const nllCandidate = -logProbability(p.lambdaH, p.lambdaA, p.goals_home_90, p.goals_away_90, p.rho_m1);
    const delta = lossDelta(nllCandidate, nllChampion);
    const { isoYear, isoWeek } = getIsoYearWeek(p.cutoff);
    const key = `${LEAGUE_ID}-${p.season}-${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push(delta);
  }
  return Array.from(byBlock.values());
}
const blocks = buildWeeklyBlocks(wf.predictions);
const bootstrap = pairedBlockBootstrap(blocks, { seed: "EXP-001R-v1", nResamples: 10000 });

const promotion = evaluatePromotion({
  n_oos: wf.predictions.length,
  nll_m0: nllM0, nll_m1: nllM1,
  ci_lower: bootstrap.valid ? bootstrap.ci_lower : -Infinity,
  ci_upper: bootstrap.valid ? bootstrap.ci_upper : Infinity,
  convergence_rate: convergenceRate,
  boundary_hit_rate: boundaryHitRate,
  rho_stability: { std: rhoStd },
  secondary: {
    ou25: { logloss_m0: secondary.ou25.logloss_m0, logloss_m1: secondary.ou25.logloss_m1 },
    btts: { logloss_m0: secondary.btts.logloss_m0, logloss_m1: secondary.btts.logloss_m1 },
    x12: { logloss_m0: secondary.x12.logloss_m0, logloss_m1: secondary.x12.logloss_m1 },
  },
  low_score_diagnostics: lowScore,
});

console.log("\n=== DECISION EXP-001R ===");
console.log(JSON.stringify(promotion, null, 2));

// per-season breakdown
const seasonsPresent = Array.from(new Set(wf.predictions.map((p) => p.season))).sort();
const bySeason = {};
for (const season of seasonsPresent) {
  const preds = wf.predictions.filter((p) => p.season === season);
  bySeason[season] = {
    n_predictions: preds.length,
    nll_m0: exactScoreNLL(preds.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, rho: p.rho_m0, h: p.goals_home_90, a: p.goals_away_90 }))),
    nll_m1: exactScoreNLL(preds.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, rho: p.rho_m1, h: p.goals_home_90, a: p.goals_away_90 }))),
    secondary_metrics: computeSecondaryMetrics(preds),
  };
}

const report = {
  experiment_id: "EXP-001R",
  code_sha: null,
  manifest_sha256: null,
  dataset_version: "403e31d057ba094993f29e3c8c88dec21119f8438acc2c7b10a21200dd6a2942",
  n_predictions: wf.predictions.length,
  n_excluded_m0_unavailable: wf.n_excluded_m0_unavailable,
  n_cutoffs: wf.cutoffs.length,
  seasons_used: seasonsPresent,
  nll_m0: nllM0, nll_m1: nllM1,
  convergence_rate: convergenceRate,
  boundary_hit_rate: boundaryHitRate,
  rho_mean: mean(rhoValues), rho_median: median(rhoValues), rho_std: rhoStd,
  rho_min: rhoValues.length ? Math.min(...rhoValues) : null, rho_max: rhoValues.length ? Math.max(...rhoValues) : null,
  rho_p05: percentile(rhoValues, 0.05), rho_p95: percentile(rhoValues, 0.95),
  n_boundary_hits: boundaryCount,
  secondary_metrics: secondary,
  secondary_metrics_by_season: bySeason,
  low_score_diagnostics: lowScore,
  bootstrap: { ...bootstrap, block_definition: "league_id+season+ISO_YEAR_WEEK(kickoff_timestamp_utc)" },
  promotion,
  fit_log: wf.fitLog,
  predictions: wf.predictions,
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nRapport ecrit: ${REPORT_PATH}`);
