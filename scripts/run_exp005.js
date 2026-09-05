#!/usr/bin/env node
"use strict";
// EXP-005 - lancement reel. Manifest DEJA cree
// (scripts/experiments/exp005_manifest.json, status=RUNNING, jamais
// modifie apres ce point). Champion=M2 (ferme, INCHANGE), candidat=
// M5_SHARED_GAMMA_DC_MEAN_PRESERVING (facteur latent gamma partage,
// meme correction DC fixe que M2, thetaH/thetaA resolus pour preserver
// EXACTEMENT les moyennes M2 - voir scripts/experiments/exp005_mean_preservation_addendum.json).
//
// nll_m2 utilise lib/lab/dc-log-probability.js (DC, rho=-0.0845 fixe) -
// LEGITIME ICI : calcul de reference du CHAMPION, pas le code du
// candidat M5 (qui n'importe jamais M4 - voir tests/lab-m5-no-m4.test.js).
// nll_m5 reutilise thetaHome/thetaAway DEJA resolus par le runner
// (walkforward-m5-runner.js) - jamais un second solve redondant.

const fs = require("fs");
const path = require("path");
const { runWalkForwardM5 } = require("../lib/lab/walkforward-m5-runner.js");
const { SharedGammaKappaWorker } = require("../lib/lab/shared-gamma-python-worker.js");
const { logProbability: logProbabilityDC } = require("../lib/lab/dc-log-probability.js");
const { logProbabilityM5, CHAMPION_RHO } = require("../lib/lab/shared-gamma-dc.js");
const { finalDependenceDiagnostics } = require("../lib/lab/shared-gamma-theta-solver.js");
const { poissonProb } = require("../lib/models.js");
const { lossDelta } = require("../lib/lab/loss-delta.js");
const { pairedBlockBootstrap, pairedBlockBootstrapRelativeGain, pairedBlockBootstrapGroupDifference } = require("../lib/lab/bootstrap.js");
const { getIsoYearWeek } = require("../lib/lab/iso-week.js");
const { evaluatePromotionM5 } = require("../lib/lab/promotion-m5.js");
const { binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier } = require("../lib/lab/metrics.js");

const LEAGUE_ID = 39;
const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
const REPORT_PATH = path.join(__dirname, "experiments", "exp005_report.json");
const MANIFEST_PATH = path.join(__dirname, "experiments", "exp005_manifest.json");

function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }
const f2021 = loadSeason(2021), f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);

// Worker Python PERSISTANT (correctif hang subprocess deja valide) - UN
// SEUL process pour TOUT le script (les deux runs de determinisme le
// PARTAGENT).
const kappaWorker = new SharedGammaKappaWorker({ timeoutMs: 30000 });

const runOptions = {
  allFixtures: [...f2021, ...f2022, ...f2023, ...f2024],
  oosSeasons: [2023, 2024],
  trainOnlySeasons: [2022],
  leagueId: LEAGUE_ID, leagueAvgH: 1.35, leagueAvgA: 1.10,
  previousSeasonFixturesBySeasons: new Map([[2022, f2021], [2023, f2022], [2024, f2023]]),
  candidateKappaFitter: kappaWorker.asFitter(),
};

(async () => {

console.log("Lancement EXP-005 (walk-forward M5 shared-gamma+DC mean-preserving + worker Python persistant, run 1/2)...");
const t0 = Date.now();
const result1 = await runWalkForwardM5(runOptions);
console.log(`run 1/2 termine en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log("Lancement run 2/2 (determinisme)...");
const t1 = Date.now();
const result2 = await runWalkForwardM5(runOptions);
console.log(`run 2/2 termine en ${((Date.now() - t1) / 1000).toFixed(1)}s`);
await kappaWorker.shutdown();

// BUG CORRIGE (2026-09-05, decouvert sur le premier run reel) : fitLog
// contient elapsed_ms (duree d'execution reelle, JAMAIS identique entre
// deux runs meme si le mecanisme est parfaitement deterministe) - il
// doit etre exclu de la comparaison, sinon mechanismDeterministic est
// TOUJOURS false par construction, independamment du comportement reel
// du modele. Meme correctif deja applique dans tests/lab-m5-runner.test.js
// (strip elapsed_ms avant deepEqual) - oublie ici par erreur au premier run.
function stripVolatileFitLogFields(fitLog) {
  return fitLog.map(({ elapsed_ms, ...rest }) => rest);
}
const predictionsIdentical = JSON.stringify(result1.predictions) === JSON.stringify(result2.predictions);
const fitLogIdentical = JSON.stringify(stripVolatileFitLogFields(result1.fitLog)) === JSON.stringify(stripVolatileFitLogFields(result2.fitLog));
const mechanismDeterministic = predictionsIdentical && fitLogIdentical;
console.log(`determinisme detail : predictions identiques=${predictionsIdentical}, fitLog (hors elapsed_ms) identique=${fitLogIdentical}`);
const predictions = result1.predictions;
const fitLog = result1.fitLog;

console.log(`Predictions: ${predictions.length} (mechanism deterministic: ${mechanismDeterministic})`);
console.log(`matrixFailures: ${result1.matrixFailures.length}`);

// --- NLL par prediction (M2=DC reference, M5=shared-gamma+DC mean-preserving candidat) ---
// nll_m5 reutilise theta_home/theta_away DEJA resolus par le runner - jamais un second solve.
for (const p of predictions) {
  p.nll_m2 = -logProbabilityDC(p.muHome, p.muAway, p.goals_home_90, p.goals_away_90, CHAMPION_RHO);
  p.nll_m5 = (p.theta_home != null && typeof p.kappa_hat === "number")
    ? -logProbabilityM5(p.theta_home, p.theta_away, p.goals_home_90, p.goals_away_90, p.kappa_hat, CHAMPION_RHO)
    : null;
  p.delta = p.nll_m5 != null ? lossDelta(p.nll_m5, p.nll_m2) : null;
}

const commonSupport = predictions.filter((p) => p.nll_m5 != null);
const excluded = predictions.filter((p) => p.nll_m5 == null);
console.log(`COMMON_SUPPORT N=${commonSupport.length} (cible 760) | exclusions=${excluded.length}`);

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function median(arr) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function std(arr) { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map((v) => (v - m) ** 2))); }
function percentile(arr, p) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; }

function blockKey(r) {
  const { isoYear, isoWeek } = getIsoYearWeek(r.cutoff);
  return `${LEAGUE_ID}-${r.season}-${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

function bootstrapDeltaNllOn(rows, seed) {
  const byBlock = new Map();
  for (const r of rows) { const key = blockKey(r); if (!byBlock.has(key)) byBlock.set(key, []); byBlock.get(key).push(r.delta); }
  const blocks = Array.from(byBlock.values());
  if (!blocks.length) return { valid: false, reason: "NO_DATA" };
  return pairedBlockBootstrap(blocks, { seed, nResamples: 10000 });
}
function bootstrapRelativeGainOn(rows, seed) {
  const byBlock = new Map();
  for (const r of rows) { const key = blockKey(r); if (!byBlock.has(key)) byBlock.set(key, []); byBlock.get(key).push({ nllM0: r.nll_m2, nllM2: r.nll_m5 }); }
  const blocks = Array.from(byBlock.values());
  if (!blocks.length) return { valid: false, reason: "NO_DATA" };
  return pairedBlockBootstrapRelativeGain(blocks, { seed, nResamples: 10000 });
}
function deltaBlocksFor(rows) {
  const byBlock = new Map();
  for (const r of rows) { const key = blockKey(r); if (!byBlock.has(key)) byBlock.set(key, []); byBlock.get(key).push(r.delta); }
  return Array.from(byBlock.values());
}

function secondaryOn(rows) {
  const ou25 = { m2: [], m5: [] }, ou35 = { m2: [], m5: [] }, btts = { m2: [], m5: [] }, x12 = { m2: [], m5: [] };
  for (const r of rows) {
    const total = r.goals_home_90 + r.goals_away_90;
    const over25 = total > 2.5 ? 1 : 0, over35 = total > 3.5 ? 1 : 0;
    const bttsY = r.goals_home_90 > 0 && r.goals_away_90 > 0 ? 1 : 0;
    const outcome = r.goals_home_90 > r.goals_away_90 ? "p1" : (r.goals_home_90 === r.goals_away_90 ? "pN" : "p2");
    ou25.m2.push({ prob: r.markets_m2.overUnder["2.5"].over, outcome: over25 });
    ou25.m5.push({ prob: r.markets_m5.overUnder["2.5"].over, outcome: over25 });
    ou35.m2.push({ prob: r.markets_m2.overUnder["3.5"].over, outcome: over35 });
    ou35.m5.push({ prob: r.markets_m5.overUnder["3.5"].over, outcome: over35 });
    btts.m2.push({ prob: r.markets_m2.btts.yes, outcome: bttsY });
    btts.m5.push({ prob: r.markets_m5.btts.yes, outcome: bttsY });
    x12.m2.push({ probs: { p1: r.markets_m2.p1, pN: r.markets_m2.pN, p2: r.markets_m2.p2 }, outcome });
    x12.m5.push({ probs: { p1: r.markets_m5.p1, pN: r.markets_m5.pN, p2: r.markets_m5.p2 }, outcome });
  }
  return {
    x12: { logloss_m2: multiclassLogLoss(x12.m2), logloss_m5: multiclassLogLoss(x12.m5), brier_m2: multiclassBrier(x12.m2), brier_m5: multiclassBrier(x12.m5) },
    ou25: { logloss_m2: binaryLogLoss(ou25.m2), logloss_m5: binaryLogLoss(ou25.m5), brier_m2: binaryBrier(ou25.m2), brier_m5: binaryBrier(ou25.m5) },
    btts: { logloss_m2: binaryLogLoss(btts.m2), logloss_m5: binaryLogLoss(btts.m5), brier_m2: binaryBrier(btts.m2), brier_m5: binaryBrier(btts.m5) },
    ou35_diagnostic_only: { logloss_m2: binaryLogLoss(ou35.m2), logloss_m5: binaryLogLoss(ou35.m5), brier_m2: binaryBrier(ou35.m2), brier_m5: binaryBrier(ou35.m5) },
  };
}

function lowScoreOn(rows) {
  const targets = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const out = {};
  const nTotal = rows.length;
  for (const [h, a] of targets) {
    const key = `${h}-${a}`;
    const matching = rows.filter((r) => r.goals_home_90 === h && r.goals_away_90 === a);
    let sumM2 = 0, sumM5 = 0;
    for (const r of rows) {
      sumM2 += Math.exp(logProbabilityDC(r.muHome, r.muAway, h, a, CHAMPION_RHO));
      sumM5 += Math.exp(logProbabilityM5(r.theta_home, r.theta_away, h, a, r.kappa_hat, CHAMPION_RHO));
    }
    let nllM2 = 0, nllM5 = 0;
    for (const r of matching) { nllM2 += -logProbabilityDC(r.muHome, r.muAway, h, a, CHAMPION_RHO); nllM5 += -logProbabilityM5(r.theta_home, r.theta_away, h, a, r.kappa_hat, CHAMPION_RHO); }
    out[key] = {
      count_observed: matching.length,
      observed_frequency: nTotal ? matching.length / nTotal : null,
      mean_prob_m2: nTotal ? sumM2 / nTotal : null,
      mean_prob_m5: nTotal ? sumM5 / nTotal : null,
      nll_contribution_m2: matching.length ? nllM2 / matching.length : null,
      nll_contribution_m5: matching.length ? nllM5 / matching.length : null,
    };
  }
  const unionMatching = rows.filter((r) => targets.some(([h, a]) => r.goals_home_90 === h && r.goals_away_90 === a));
  let nllM2Union = 0, nllM5Union = 0;
  for (const r of unionMatching) { nllM2Union += -logProbabilityDC(r.muHome, r.muAway, r.goals_home_90, r.goals_away_90, CHAMPION_RHO); nllM5Union += -logProbabilityM5(r.theta_home, r.theta_away, r.goals_home_90, r.goals_away_90, r.kappa_hat, CHAMPION_RHO); }
  out.LOW_SCORE_SET = {
    n: unionMatching.length,
    nll_m2: unionMatching.length ? nllM2Union / unionMatching.length : null,
    nll_m5: unionMatching.length ? nllM5Union / unionMatching.length : null,
    relative_degradation: unionMatching.length && nllM2Union > 0 ? (nllM5Union - nllM2Union) / nllM2Union : null,
  };
  return out;
}

// Diagnostics FINAUX (item 8/19 spec initiale + item 5-6 correctif) -
// JAMAIS la formule brute thetaH*thetaA/kappa.
function dependenceDiagnosticsOn(rows) {
  const corrs = [], covs = [], varHs = [], varAs = [];
  let sumObsDraw = 0, sumPredDraw = 0, sumObsBtts = 0, sumPredBtts = 0, sumObs00 = 0, sumPred00 = 0, sumObs11 = 0, sumPred11 = 0;
  for (const r of rows) {
    const d = finalDependenceDiagnostics(r.muHome, r.muAway, r.theta_home, r.theta_away, r.kappa_hat, CHAMPION_RHO);
    if (d.correlation != null && Number.isFinite(d.correlation)) corrs.push(d.correlation);
    covs.push(d.cov); varHs.push(d.varH); varAs.push(d.varA);
    sumObsDraw += r.goals_home_90 === r.goals_away_90 ? 1 : 0;
    sumPredDraw += r.markets_m5.pN;
    sumObsBtts += (r.goals_home_90 > 0 && r.goals_away_90 > 0) ? 1 : 0;
    sumPredBtts += r.markets_m5.btts.yes;
    sumObs00 += (r.goals_home_90 === 0 && r.goals_away_90 === 0) ? 1 : 0;
    sumObs11 += (r.goals_home_90 === 1 && r.goals_away_90 === 1) ? 1 : 0;
  }
  const n = rows.length;
  return {
    correlation: { mean: mean(corrs), median: median(corrs), p05: percentile(corrs, 0.05), p95: percentile(corrs, 0.95) },
    covariance: { mean: mean(covs), median: median(covs) },
    variance_home: { mean: mean(varHs) }, variance_away: { mean: mean(varAs) },
    draw: { observed_frequency: n ? sumObsDraw / n : null, mean_predicted_m5: n ? sumPredDraw / n : null },
    btts_yes: { observed_frequency: n ? sumObsBtts / n : null, mean_predicted_m5: n ? sumPredBtts / n : null },
    score_0_0_observed_frequency: n ? sumObs00 / n : null,
    score_1_1_observed_frequency: n ? sumObs11 / n : null,
  };
}

function meanPreservationOn(rows) {
  const residualsH = rows.map((r) => Math.abs(r.theta_residual_h != null ? r.theta_residual_h : 0));
  const residualsA = rows.map((r) => Math.abs(r.theta_residual_a != null ? r.theta_residual_a : 0));
  return {
    max_abs_residual_home: residualsH.length ? Math.max(...residualsH) : null,
    max_abs_residual_away: residualsA.length ? Math.max(...residualsA) : null,
    mean_abs_residual_home: mean(residualsH), mean_abs_residual_away: mean(residualsA),
    tolerance_target: 1e-10,
  };
}

function marginalDiagnosticsOn(rows) {
  let sumPredHome = 0, sumObsHome = 0, sumPredAway = 0, sumObsAway = 0;
  for (const r of rows) { sumPredHome += r.muHome; sumObsHome += r.goals_home_90; sumPredAway += r.muAway; sumObsAway += r.goals_away_90; }
  const n = rows.length;
  const residualsHome = rows.map((r) => r.goals_home_90 - r.muHome);
  const residualsAway = rows.map((r) => r.goals_away_90 - r.muAway);
  return {
    mean_predicted_home_goals: n ? sumPredHome / n : null, mean_observed_home_goals: n ? sumObsHome / n : null,
    mean_predicted_away_goals: n ? sumPredAway / n : null, mean_observed_away_goals: n ? sumObsAway / n : null,
    residual_dispersion_home: std(residualsHome), residual_dispersion_away: std(residualsAway),
  };
}

function tailDiagnosticsOn(rows) {
  const maxGoals = rows.map((r) => r.matrix_max_goal).filter((v) => v != null);
  const tailMasses = rows.map((r) => r.matrix_guaranteed_tail_upper_bound).filter((v) => v != null);
  return {
    matrix_max_goal_max: maxGoals.length ? Math.max(...maxGoals) : null,
    matrix_max_goal_p95: percentile(maxGoals, 0.95),
    guaranteed_tail_upper_bound_max: tailMasses.length ? Math.max(...tailMasses) : null,
    tail_threshold: 1e-10,
    all_below_threshold: tailMasses.every((t) => t < 1e-10),
    matrix_failures_count: result1.matrixFailures.length,
  };
}

function summarize(rows, seed) {
  if (!rows.length) return { n: 0 };
  const nllM2 = mean(rows.map((r) => r.nll_m2));
  const nllM5 = mean(rows.map((r) => r.nll_m5));
  const bootstrapDeltaNll = bootstrapDeltaNllOn(rows, seed);
  const bootstrapRelativeGain = bootstrapRelativeGainOn(rows, seed + "-relgain");
  return {
    n: rows.length, nll_m2: nllM2, nll_m5: nllM5,
    delta_nll_mean: nllM5 - nllM2,
    relative_gain_pct: (nllM2 - nllM5) / nllM2,
    ci95_delta_nll: bootstrapDeltaNll.valid ? { lower: bootstrapDeltaNll.ci_lower, upper: bootstrapDeltaNll.ci_upper, unit: "NLL_absolute_difference" } : { valid: false },
    ci95_relative_gain_pct: bootstrapRelativeGain.valid ? { lower_pct: bootstrapRelativeGain.ci_lower, upper_pct: bootstrapRelativeGain.ci_upper, unit: "fraction_multiply_by_100_for_percent" } : { valid: false },
    probability_candidate_better: bootstrapDeltaNll.valid ? bootstrapDeltaNll.probability_candidate_better : null,
    secondary_metrics: secondaryOn(rows),
  };
}

const SEED = "EXP-005-v1";
const GLOBAL = summarize(commonSupport, SEED);
const bySeason = {};
for (const s of [2023, 2024]) bySeason[s] = summarize(commonSupport.filter((p) => p.season === s), SEED + "-S" + s);

// --- signal d'heterogeneite entre saisons (item 5 amendement) ---
const blocks2023 = deltaBlocksFor(commonSupport.filter((p) => p.season === 2023));
const blocks2024 = deltaBlocksFor(commonSupport.filter((p) => p.season === 2024));
const seasonDifference = pairedBlockBootstrapGroupDifference(blocks2023, blocks2024, { seed: SEED + "-seasondiff", nResamples: 10000 });

const lowScoreGlobal = lowScoreOn(commonSupport);
const marginalGlobal = marginalDiagnosticsOn(commonSupport);
const dependenceGlobal = dependenceDiagnosticsOn(commonSupport);
const meanPreservationGlobal = meanPreservationOn(commonSupport);
const tailGlobal = tailDiagnosticsOn(commonSupport);

// --- kappa stats ---
const convergedFits = fitLog.filter((f) => f.convergence);
const convergenceRate = fitLog.length ? convergedFits.length / fitLog.length : 0;
const kappaValues = fitLog.map((f) => f.kappa_hat).filter((v) => typeof v === "number" && Number.isFinite(v));
const kappaP05 = percentile(kappaValues, 0.05), kappaP95 = percentile(kappaValues, 0.95);
const kappaStats = {
  mean: mean(kappaValues), median: median(kappaValues), sd: std(kappaValues),
  min: kappaValues.length ? Math.min(...kappaValues) : null, max: kappaValues.length ? Math.max(...kappaValues) : null,
  p05: kappaP05, p95: kappaP95,
  p95_p05_ratio: kappaP05 && kappaP05 !== 0 ? kappaP95 / kappaP05 : null,
};
const kappaM2LimitCount = fitLog.filter((f) => f.numerical_boundary_status === "KAPPA_M2_LIMIT").length;
const kappaLowerBoundHitCount = fitLog.filter((f) => f.numerical_boundary_status === "KAPPA_LOWER_BOUND_HIT").length;
const kappaM2LimitMajority = fitLog.length ? kappaM2LimitCount / fitLog.length > 0.5 : false;
const timeoutCount = fitLog.filter((f) => f.reason === "FIT_PROCESS_TIMEOUT" || f.error === "FIT_PROCESS_TIMEOUT").length;

// --- diagnostics tails/marches secondaires -> flags de promotion ---
const ou25Degraded = GLOBAL.secondary_metrics.ou25.logloss_m5 > GLOBAL.secondary_metrics.ou25.logloss_m2;
const bttsDegraded = GLOBAL.secondary_metrics.btts.logloss_m5 > GLOBAL.secondary_metrics.btts.logloss_m2;
const x12Degraded = GLOBAL.secondary_metrics.x12.logloss_m5 > GLOBAL.secondary_metrics.x12.logloss_m2;
const MAX_SECONDARY_DEGRADATION = 0.001;
function relDegradation(m2, m5) { return m2 > 0 ? (m5 - m2) / m2 : 0; }
const secondaryMarketDamage = (
  (ou25Degraded && relDegradation(GLOBAL.secondary_metrics.ou25.logloss_m2, GLOBAL.secondary_metrics.ou25.logloss_m5) > MAX_SECONDARY_DEGRADATION) ||
  (bttsDegraded && relDegradation(GLOBAL.secondary_metrics.btts.logloss_m2, GLOBAL.secondary_metrics.btts.logloss_m5) > MAX_SECONDARY_DEGRADATION) ||
  (x12Degraded && relDegradation(GLOBAL.secondary_metrics.x12.logloss_m2, GLOBAL.secondary_metrics.x12.logloss_m5) > MAX_SECONDARY_DEGRADATION)
);

const tailConstructionPass = result1.matrixFailures.length === 0 && tailGlobal.all_below_threshold;

const promotion = evaluatePromotionM5({
  globalRelativeGain: GLOBAL.relative_gain_pct,
  globalCiLower: GLOBAL.ci95_delta_nll.valid !== false ? GLOBAL.ci95_delta_nll.lower : -Infinity,
  globalCiUpper: GLOBAL.ci95_delta_nll.valid !== false ? GLOBAL.ci95_delta_nll.upper : Infinity,
  convergenceRate,
  kappaP95P05Ratio: kappaStats.p95_p05_ratio != null ? kappaStats.p95_p05_ratio : Infinity,
  kappaM2LimitMajority,
  secondaryMarketDamage,
  lowScoreSetRelativeDegradation: lowScoreGlobal.LOW_SCORE_SET.relative_degradation != null ? lowScoreGlobal.LOW_SCORE_SET.relative_degradation : Infinity,
  tailConstructionPass,
  seasons: {
    "2023": { relativeGain: bySeason[2023].relative_gain_pct, ciLower: bySeason[2023].ci95_delta_nll.valid !== false ? bySeason[2023].ci95_delta_nll.lower : -Infinity, ciUpper: bySeason[2023].ci95_delta_nll.valid !== false ? bySeason[2023].ci95_delta_nll.upper : Infinity },
    "2024": { relativeGain: bySeason[2024].relative_gain_pct, ciLower: bySeason[2024].ci95_delta_nll.valid !== false ? bySeason[2024].ci95_delta_nll.lower : -Infinity, ciUpper: bySeason[2024].ci95_delta_nll.valid !== false ? bySeason[2024].ci95_delta_nll.upper : Infinity },
  },
  seasonDifferenceCiExcludesZero: seasonDifference.valid ? seasonDifference.excludes_zero : false,
  temporalLeakageDetected: false, // verifie par tests/lab-m5-runner.test.js AVANT ce run
  mechanismDeterministic,
  commonSupportComplete: commonSupport.length === 760,
});

console.log("\n=== DECISION EXP-005 ===");
console.log(JSON.stringify(promotion, null, 2));
console.log("\nkappaStats:", JSON.stringify(kappaStats, null, 2));
console.log("\nmeanPreservation:", JSON.stringify(meanPreservationGlobal, null, 2));

const manifestSha256 = require("crypto").createHash("sha256").update(fs.readFileSync(MANIFEST_PATH)).digest("hex");

const report = {
  experiment_id: "EXP-005",
  manifest_sha256: manifestSha256,
  code_sha: null,
  dataset_version: "341f69f3aac81f7c772198e001e6885192d051d3577e5ceac7132120cb5d9116",
  lockbox_hash_2025_2026: "f611ad31213505fd69edfc8941e79ec7d182dc83b426df3a8fb04d67ec4fa01a",
  common_support_n: commonSupport.length,
  common_support_target: 760,
  excluded_n: excluded.length,
  excluded_detail: excluded.map((p) => ({ fixture_id: p.fixture_id, matrix_error: p.matrix_error, kappa_hat: p.kappa_hat })),
  mechanism_deterministic: mechanismDeterministic,
  convergence_rate: convergenceRate,
  n_cutoffs: fitLog.length,
  n_converged: convergedFits.length,
  timeout_count: timeoutCount,
  kappa_stats: kappaStats,
  kappa_m2_limit_count: kappaM2LimitCount,
  kappa_m2_limit_majority: kappaM2LimitMajority,
  kappa_lower_bound_hit_count: kappaLowerBoundHitCount,
  matrix_failures: result1.matrixFailures,
  mean_preservation: meanPreservationGlobal,
  global: GLOBAL,
  by_season: bySeason,
  season_difference_heterogeneity_signal: seasonDifference,
  dependence_diagnostics: dependenceGlobal,
  low_score_diagnostics: lowScoreGlobal,
  marginal_diagnostics: marginalGlobal,
  tail_diagnostics: tailGlobal,
  secondary_market_damage_flag: secondaryMarketDamage,
  promotion,
  fit_log: fitLog,
  predictions,
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nRapport ecrit: ${REPORT_PATH}`);

})().catch(async (e) => {
  console.error("ECHEC EXP-005:", e.message, e.stack);
  try { await kappaWorker.shutdown(); } catch (e2) { /* deja ferme/crashe */ }
  process.exit(1);
});
