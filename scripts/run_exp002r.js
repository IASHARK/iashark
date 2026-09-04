#!/usr/bin/env node
"use strict";
// EXP-002R - lancement reel corrige. Manifest DEJA cree
// (scripts/experiments/exp002r_manifest.json, status=RUNNING, jamais
// modifie apres ce point). COMMON_SUPPORT (M0 gate calcCriteres reussi,
// identique a EXP-001) est le support PRINCIPAL pour toute metrique
// M2-vs-M0 ; les fixtures ou seul M2 predit forment M2_COVERAGE_GAIN,
// rapporte separement, jamais mele au delta.

const fs = require("fs");
const path = require("path");
const { runWalkForwardM2R } = require("../lib/lab/walkforward-m2r-runner.js");
const { logProbability } = require("../lib/lab/dc-log-probability.js");
const { lossDelta } = require("../lib/lab/loss-delta.js");
const { pairedBlockBootstrap } = require("../lib/lab/bootstrap.js");
const { getIsoYearWeek } = require("../lib/lab/iso-week.js");
const { evaluatePromotionM2 } = require("../lib/lab/promotion-m2.js");
const { binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier } = require("../lib/lab/metrics.js");

const LEAGUE_ID = 39;
const CHAMPION_RHO = -0.0845;
const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
const REPORT_PATH = path.join(__dirname, "experiments", "exp002r_report.json");

function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }
const f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);

const runOptions = {
  allFixtures: [...f2022, ...f2023, ...f2024],
  trainSeasons: [2022], oosSeasons: [2023, 2024],
  leagueId: LEAGUE_ID, leagueAvgH: 1.35, leagueAvgA: 1.10,
  previousSeasonFixturesBySeasons: new Map([[2023, f2022], [2024, f2023]]),
};

// --- Determinisme : deux runs independants doivent etre BYTE-IDENTIQUES ---
const result1 = runWalkForwardM2R(runOptions); // leve une exception si LATE_IDENTITY_VIOLATED
const result2 = runWalkForwardM2R(runOptions);
const mechanismDeterministic = JSON.stringify(result1.predictions) === JSON.stringify(result2.predictions);
const predictions = result1.predictions;

console.log(`Predictions: ${predictions.length} (mechanism deterministic: ${mechanismDeterministic})`);
console.log(`AUCUNE exception LATE_IDENTITY_VIOLATED levee - invariant confirme sur toutes les donnees reelles.`);

// --- NLL par prediction ---
for (const p of predictions) {
  p.nll_m0 = -logProbability(p.lambdaH_m0, p.lambdaA_m0, p.goals_home_90, p.goals_away_90, CHAMPION_RHO);
  p.nll_m2 = -logProbability(p.lambdaH_m2, p.lambdaA_m2, p.goals_home_90, p.goals_away_90, CHAMPION_RHO);
  p.delta = lossDelta(p.nll_m2, p.nll_m0);
}

const commonSupport = predictions.filter((p) => p.m0_valid);
const coverageGain = predictions.filter((p) => !p.m0_valid);
console.log(`COMMON_SUPPORT N=${commonSupport.length} (attendu 748) | M2_COVERAGE_GAIN N=${coverageGain.length} (attendu 12)`);

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function median(arr) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function percentile(arr, p) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; }

function bootstrapOn(rows, seed) {
  const byBlock = new Map();
  for (const r of rows) {
    const { isoYear, isoWeek } = getIsoYearWeek(r.cutoff);
    const key = `${LEAGUE_ID}-${r.season}-${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push(r.delta);
  }
  const blocks = Array.from(byBlock.values());
  if (!blocks.length) return { valid: false, reason: "NO_DATA" };
  return pairedBlockBootstrap(blocks, { seed, nResamples: 10000 });
}

function secondaryOn(rows) {
  const ou25 = { m0: [], m2: [] }, btts = { m0: [], m2: [] }, x12 = { m0: [], m2: [] };
  for (const r of rows) {
    const total = r.goals_home_90 + r.goals_away_90;
    const over25 = total > 2.5 ? 1 : 0;
    const bttsY = r.goals_home_90 > 0 && r.goals_away_90 > 0 ? 1 : 0;
    const outcome = r.goals_home_90 > r.goals_away_90 ? "p1" : (r.goals_home_90 === r.goals_away_90 ? "pN" : "p2");
    ou25.m0.push({ prob: r.markets_m0.overUnder["2.5"].over, outcome: over25 });
    ou25.m2.push({ prob: r.markets_m2.overUnder["2.5"].over, outcome: over25 });
    btts.m0.push({ prob: r.markets_m0.btts.yes, outcome: bttsY });
    btts.m2.push({ prob: r.markets_m2.btts.yes, outcome: bttsY });
    x12.m0.push({ probs: { p1: r.markets_m0.p1, pN: r.markets_m0.pN, p2: r.markets_m0.p2 }, outcome });
    x12.m2.push({ probs: { p1: r.markets_m2.p1, pN: r.markets_m2.pN, p2: r.markets_m2.p2 }, outcome });
  }
  return {
    ou25: { logloss_m0: binaryLogLoss(ou25.m0), logloss_m2: binaryLogLoss(ou25.m2), brier_m0: binaryBrier(ou25.m0), brier_m2: binaryBrier(ou25.m2) },
    btts: { logloss_m0: binaryLogLoss(btts.m0), logloss_m2: binaryLogLoss(btts.m2), brier_m0: binaryBrier(btts.m0), brier_m2: binaryBrier(btts.m2) },
    x12: { logloss_m0: multiclassLogLoss(x12.m0), logloss_m2: multiclassLogLoss(x12.m2), brier_m0: multiclassBrier(x12.m0), brier_m2: multiclassBrier(x12.m2) },
  };
}

function lowScoreOn(rows) {
  const targets = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const out = {};
  const nTotal = rows.length;
  for (const [h, a] of targets) {
    const key = `${h}-${a}`;
    const matching = rows.filter((r) => r.goals_home_90 === h && r.goals_away_90 === a);
    let sumM0 = 0, sumM2 = 0;
    for (const r of rows) {
      sumM0 += Math.exp(logProbability(r.lambdaH_m0, r.lambdaA_m0, h, a, CHAMPION_RHO));
      sumM2 += Math.exp(logProbability(r.lambdaH_m2, r.lambdaA_m2, h, a, CHAMPION_RHO));
    }
    let nllM0 = 0, nllM2 = 0;
    for (const r of matching) { nllM0 += -logProbability(r.lambdaH_m0, r.lambdaA_m0, h, a, CHAMPION_RHO); nllM2 += -logProbability(r.lambdaH_m2, r.lambdaA_m2, h, a, CHAMPION_RHO); }
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

function summarize(rows, seed) {
  if (!rows.length) return { n: 0 };
  const nllM0 = mean(rows.map((r) => r.nll_m0));
  const nllM2 = mean(rows.map((r) => r.nll_m2));
  return {
    n: rows.length, nll_m0: nllM0, nll_m2: nllM2,
    delta_mean: nllM2 - nllM0,
    relative_gain: (nllM0 - nllM2) / nllM0,
    bootstrap: bootstrapOn(rows, seed),
    secondary_metrics: secondaryOn(rows),
  };
}

const SEED = "EXP-002R-v1";
const GLOBAL = summarize(commonSupport, SEED);
const byBucket = {};
for (const b of ["EARLY", "TRANSITION", "LATE"]) byBucket[b] = summarize(commonSupport.filter((p) => p.bucket === b), SEED + "-" + b);
const bySeason = {};
for (const s of [2023, 2024]) bySeason[s] = summarize(commonSupport.filter((p) => p.season === s), SEED + "-S" + s);
const byBucketSeason = {};
for (const s of [2023, 2024]) { byBucketSeason[s] = {}; for (const b of ["EARLY", "TRANSITION", "LATE"]) byBucketSeason[s][b] = summarize(commonSupport.filter((p) => p.season === s && p.bucket === b), SEED + "-S" + s + "-" + b); }

const returningVsPromoted = {
  home_returning: summarize(commonSupport.filter((p) => p.home_returning), SEED + "-HR"),
  home_promoted: summarize(commonSupport.filter((p) => !p.home_returning), SEED + "-HP"),
  away_returning: summarize(commonSupport.filter((p) => p.away_returning), SEED + "-AR"),
  away_promoted: summarize(commonSupport.filter((p) => !p.away_returning), SEED + "-AP"),
};

const allWeights = commonSupport.flatMap((p) => [p.prior_weight_home, p.prior_weight_away]);
const bayesWeightDistribution = { mean: mean(allWeights), median: median(allWeights), p05: percentile(allWeights, 0.05), p95: percentile(allWeights, 0.95), min: Math.min(...allWeights), max: Math.max(...allWeights) };

const lowScoreGlobal = lowScoreOn(commonSupport);
const lowScoreByBucket = {};
for (const b of ["EARLY", "TRANSITION", "LATE"]) lowScoreByBucket[b] = lowScoreOn(commonSupport.filter((p) => p.bucket === b));

// --- Invariant LATE re-verifie EXPLICITEMENT sur le support final (le runner l'a deja garanti, ceci est une preuve redondante dans le rapport) ---
const zeroWeightBoth = commonSupport.filter((p) => p.prior_weight_home === 0 && p.prior_weight_away === 0);
const lateInvariantViolations = zeroWeightBoth.filter((p) => Math.abs(p.lambdaH_m2 - p.lambdaH_m0) > 1e-12 || Math.abs(p.lambdaA_m2 - p.lambdaA_m0) > 1e-12);
const lateInvariantViolated = lateInvariantViolations.length > 0;
if (lateInvariantViolated) throw new Error(`LATE_INVARIANT_VIOLATED apres coup - ne devrait jamais arriver (le runner aurait deja leve une exception)`);

// --- M2_COVERAGE_GAIN detail ---
const coverageGainDetail = coverageGain.map((p) => ({
  fixture_id: p.fixture_id, season: p.season,
  n_home: p.n_home, n_away: p.n_away,
  home_returning: p.home_returning, away_returning: p.away_returning,
  prior_weight_home: p.prior_weight_home, prior_weight_away: p.prior_weight_away,
  prior_source_home: p.prior_source_home, prior_source_away: p.prior_source_away,
  lambdaH_m2: p.lambdaH_m2, lambdaA_m2: p.lambdaA_m2,
  goals_home_90: p.goals_home_90, goals_away_90: p.goals_away_90,
  nll_m2: p.nll_m2,
  predicted_p1: p.markets_m2.p1, predicted_pN: p.markets_m2.pN, predicted_p2: p.markets_m2.p2,
}));

// --- Decision ---
const promotion = evaluatePromotionM2({
  earlyRelativeGain: byBucket.EARLY.relative_gain,
  earlyCiLower: byBucket.EARLY.bootstrap.valid ? byBucket.EARLY.bootstrap.ci_lower : -Infinity,
  earlyCiUpper: byBucket.EARLY.bootstrap.valid ? byBucket.EARLY.bootstrap.ci_upper : Infinity,
  globalRelativeDegradation: -GLOBAL.relative_gain,
  lateInvariantViolated,
  temporalLeakageDetected: false, // verifie par tests/lab-m2r-runner.test.js + tests/lab-m2-prior-anti-leakage.test.js AVANT ce run
  mechanismDeterministic,
});

console.log("\n=== DECISION EXP-002R (common support) ===");
console.log(JSON.stringify(promotion, null, 2));

const report = {
  experiment_id: "EXP-002R",
  code_sha: null,
  manifest_sha256: null,
  dataset_version: "403e31d057ba094993f29e3c8c88dec21119f8438acc2c7b10a21200dd6a2942",
  lockbox_hash_2025_2026: "f611ad31213505fd69edfc8941e79ec7d182dc83b426df3a8fb04d67ec4fa01a",
  common_support_n: commonSupport.length,
  m2_coverage_gain_n: coverageGain.length,
  seasons_used: [2023, 2024],
  mechanism_deterministic: mechanismDeterministic,
  late_invariant: { n_cases_zero_weight_both_sides: zeroWeightBoth.length, n_violations: lateInvariantViolations.length, violated: lateInvariantViolated },
  bayes_weight_distribution: bayesWeightDistribution,
  global: GLOBAL,
  by_bucket: byBucket,
  by_season: bySeason,
  by_bucket_and_season: byBucketSeason,
  returning_vs_promoted: returningVsPromoted,
  low_score_diagnostics_global: lowScoreGlobal,
  low_score_diagnostics_by_bucket: lowScoreByBucket,
  m2_coverage_gain: coverageGainDetail,
  promotion,
  predictions,
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nRapport ecrit: ${REPORT_PATH}`);
