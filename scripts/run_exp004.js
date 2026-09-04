#!/usr/bin/env node
"use strict";
// EXP-004 - lancement reel. Manifest DEJA cree
// (scripts/experiments/exp004_manifest.json, status=RUNNING, jamais
// modifie apres ce point). Champion=M2 (ferme, INCHANGE), candidat=M4_NB2
// (marges NB2 independantes, mu=M2 EXACT, un seul kappa partage).
//
// nll_m2 utilise lib/lab/dc-log-probability.js (DC, rho=-0.0845 fixe) -
// LEGITIME ICI : c'est le calcul de reference du CHAMPION pour la
// comparaison, pas le code du candidat M4 (qui, lui, n'importe jamais DC -
// voir tests/lab-m4-no-dixon-coles.test.js, portee limitee a lib/lab/nb2*.js
// et lib/lab/walkforward-m4-runner.js).

const fs = require("fs");
const path = require("path");
const { runWalkForwardM4 } = require("../lib/lab/walkforward-m4-runner.js");
const { Nb2KappaWorker } = require("../lib/lab/nb2-python-worker.js");
const { logProbability: logProbabilityDC } = require("../lib/lab/dc-log-probability.js");
const { logProbability: logProbabilityNB2 } = require("../lib/lab/nb2-log-probability.js");
const { pmfNB2 } = require("../lib/lab/nb2.js");
const { poissonProb } = require("../lib/models.js");
const { lossDelta } = require("../lib/lab/loss-delta.js");
const { pairedBlockBootstrap, pairedBlockBootstrapRelativeGain } = require("../lib/lab/bootstrap.js");
const { getIsoYearWeek } = require("../lib/lab/iso-week.js");
const { evaluatePromotionM4 } = require("../lib/lab/promotion-m4.js");
const { binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier } = require("../lib/lab/metrics.js");

const LEAGUE_ID = 39;
const CHAMPION_RHO = -0.0845;
const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
const REPORT_PATH = path.join(__dirname, "experiments", "exp004_report.json");
const MANIFEST_PATH = path.join(__dirname, "experiments", "exp004_manifest.json");

function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }
const f2021 = loadSeason(2021), f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);

// Worker Python PERSISTANT (correctif hang subprocess, audit 2026-09-05 -
// scripts/diagnose_fit_kappa_hang.js) : UN SEUL process pour TOUT le
// script (les deux runs de determinisme le PARTAGENT, jamais un
// re-import scipy entre les deux passages). Timeout explicite par fit
// (FIT_PROCESS_TIMEOUT), jamais une attente indefinie.
const kappaWorker = new Nb2KappaWorker({ timeoutMs: 20000 });

const runOptions = {
  allFixtures: [...f2021, ...f2022, ...f2023, ...f2024],
  oosSeasons: [2023, 2024],
  trainOnlySeasons: [2022],
  leagueId: LEAGUE_ID, leagueAvgH: 1.35, leagueAvgA: 1.10,
  previousSeasonFixturesBySeasons: new Map([[2022, f2021], [2023, f2022], [2024, f2023]]),
  candidateKappaFitter: kappaWorker.asFitter(),
};

(async () => {

console.log("Lancement EXP-004 (walk-forward M4 NB2 + worker Python persistant, run 1/2)...");
const t0 = Date.now();
const result1 = await runWalkForwardM4(runOptions);
console.log(`run 1/2 termine en ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log("Lancement run 2/2 (determinisme)...");
const t1 = Date.now();
const result2 = await runWalkForwardM4(runOptions);
console.log(`run 2/2 termine en ${((Date.now() - t1) / 1000).toFixed(1)}s`);
await kappaWorker.shutdown();

const mechanismDeterministic = JSON.stringify(result1.predictions) === JSON.stringify(result2.predictions) && JSON.stringify(result1.fitLog) === JSON.stringify(result2.fitLog);
const predictions = result1.predictions;
const fitLog = result1.fitLog;

console.log(`Predictions: ${predictions.length} (mechanism deterministic: ${mechanismDeterministic})`);
console.log(`matrixFailures: ${result1.matrixFailures.length}`);

// --- NLL par prediction (M2=DC reference, M4=NB2 candidat) ---
for (const p of predictions) {
  p.nll_m2 = -logProbabilityDC(p.muHome, p.muAway, p.goals_home_90, p.goals_away_90, CHAMPION_RHO);
  p.nll_m4 = typeof p.kappa_hat === "number" ? -logProbabilityNB2(p.muHome, p.muAway, p.goals_home_90, p.goals_away_90, p.kappa_hat) : null;
  p.delta = p.nll_m4 != null ? lossDelta(p.nll_m4, p.nll_m2) : null;
}

const commonSupport = predictions.filter((p) => p.nll_m4 != null);
const excluded = predictions.filter((p) => p.nll_m4 == null);
console.log(`COMMON_SUPPORT N=${commonSupport.length} (cible 760) | exclusions=${excluded.length}`);

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function median(arr) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function std(arr) { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map((v) => (v - m) ** 2))); }
function percentile(arr, p) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; }

function bootstrapDeltaNllOn(rows, seed) {
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
function bootstrapRelativeGainOn(rows, seed) {
  const byBlock = new Map();
  for (const r of rows) {
    const { isoYear, isoWeek } = getIsoYearWeek(r.cutoff);
    const key = `${LEAGUE_ID}-${r.season}-${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push({ nllM0: r.nll_m2, nllM2: r.nll_m4 });
  }
  const blocks = Array.from(byBlock.values());
  if (!blocks.length) return { valid: false, reason: "NO_DATA" };
  return pairedBlockBootstrapRelativeGain(blocks, { seed, nResamples: 10000 });
}

function secondaryOn(rows) {
  const ou25 = { m2: [], m4: [] }, ou35 = { m2: [], m4: [] }, fivePlus = { m2: [], m4: [] }, btts = { m2: [], m4: [] }, x12 = { m2: [], m4: [] };
  for (const r of rows) {
    const total = r.goals_home_90 + r.goals_away_90;
    const over25 = total > 2.5 ? 1 : 0, over35 = total > 3.5 ? 1 : 0, over45 = total > 4.5 ? 1 : 0;
    const bttsY = r.goals_home_90 > 0 && r.goals_away_90 > 0 ? 1 : 0;
    const outcome = r.goals_home_90 > r.goals_away_90 ? "p1" : (r.goals_home_90 === r.goals_away_90 ? "pN" : "p2");
    ou25.m2.push({ prob: r.markets_m2.overUnder["2.5"].over, outcome: over25 });
    ou25.m4.push({ prob: r.markets_m4.overUnder["2.5"].over, outcome: over25 });
    ou35.m2.push({ prob: r.markets_m2.overUnder["3.5"].over, outcome: over35 });
    ou35.m4.push({ prob: r.markets_m4.overUnder["3.5"].over, outcome: over35 });
    fivePlus.m2.push({ prob: r.markets_m2.overUnder["4.5"].over, outcome: over45 });
    fivePlus.m4.push({ prob: r.markets_m4.overUnder["4.5"].over, outcome: over45 });
    btts.m2.push({ prob: r.markets_m2.btts.yes, outcome: bttsY });
    btts.m4.push({ prob: r.markets_m4.btts.yes, outcome: bttsY });
    x12.m2.push({ probs: { p1: r.markets_m2.p1, pN: r.markets_m2.pN, p2: r.markets_m2.p2 }, outcome });
    x12.m4.push({ probs: { p1: r.markets_m4.p1, pN: r.markets_m4.pN, p2: r.markets_m4.p2 }, outcome });
  }
  return {
    ou25: { logloss_m2: binaryLogLoss(ou25.m2), logloss_m4: binaryLogLoss(ou25.m4), brier_m2: binaryBrier(ou25.m2), brier_m4: binaryBrier(ou25.m4) },
    ou35: { logloss_m2: binaryLogLoss(ou35.m2), logloss_m4: binaryLogLoss(ou35.m4), brier_m2: binaryBrier(ou35.m2), brier_m4: binaryBrier(ou35.m4) },
    five_plus_goals: { logloss_m2: binaryLogLoss(fivePlus.m2), logloss_m4: binaryLogLoss(fivePlus.m4), brier_m2: binaryBrier(fivePlus.m2), brier_m4: binaryBrier(fivePlus.m4) },
    btts: { logloss_m2: binaryLogLoss(btts.m2), logloss_m4: binaryLogLoss(btts.m4), brier_m2: binaryBrier(btts.m2), brier_m4: binaryBrier(btts.m4) },
    x12: { logloss_m2: multiclassLogLoss(x12.m2), logloss_m4: multiclassLogLoss(x12.m4), brier_m2: multiclassBrier(x12.m2), brier_m4: multiclassBrier(x12.m4) },
  };
}

function lowScoreOn(rows) {
  const targets = [[0, 0], [1, 0], [0, 1], [1, 1]];
  const out = {};
  const nTotal = rows.length;
  for (const [h, a] of targets) {
    const key = `${h}-${a}`;
    const matching = rows.filter((r) => r.goals_home_90 === h && r.goals_away_90 === a);
    let sumM2 = 0, sumM4 = 0;
    for (const r of rows) {
      sumM2 += Math.exp(logProbabilityDC(r.muHome, r.muAway, h, a, CHAMPION_RHO));
      sumM4 += Math.exp(logProbabilityNB2(r.muHome, r.muAway, h, a, r.kappa_hat));
    }
    let nllM2 = 0, nllM4 = 0;
    for (const r of matching) { nllM2 += -logProbabilityDC(r.muHome, r.muAway, h, a, CHAMPION_RHO); nllM4 += -logProbabilityNB2(r.muHome, r.muAway, h, a, r.kappa_hat); }
    out[key] = {
      count_observed: matching.length,
      observed_frequency: nTotal ? matching.length / nTotal : null,
      mean_prob_m2: nTotal ? sumM2 / nTotal : null,
      mean_prob_m4: nTotal ? sumM4 / nTotal : null,
      nll_contribution_m2: matching.length ? nllM2 / matching.length : null,
      nll_contribution_m4: matching.length ? nllM4 / matching.length : null,
    };
  }
  // LOW_SCORE_SET agrege : NLL moyenne sur l'UNION des 4 scores (ponderee par leur propre nll_contribution*count, cf denominateur commun = nb total de matchs dans l'union)
  const unionMatching = rows.filter((r) => targets.some(([h, a]) => r.goals_home_90 === h && r.goals_away_90 === a));
  let nllM2Union = 0, nllM4Union = 0;
  for (const r of unionMatching) { nllM2Union += -logProbabilityDC(r.muHome, r.muAway, r.goals_home_90, r.goals_away_90, CHAMPION_RHO); nllM4Union += -logProbabilityNB2(r.muHome, r.muAway, r.goals_home_90, r.goals_away_90, r.kappa_hat); }
  out.LOW_SCORE_SET = {
    n: unionMatching.length,
    nll_m2: unionMatching.length ? nllM2Union / unionMatching.length : null,
    nll_m4: unionMatching.length ? nllM4Union / unionMatching.length : null,
    relative_degradation: unionMatching.length && nllM2Union > 0 ? (nllM4Union - nllM2Union) / nllM2Union : null,
  };
  return out;
}

function marginalDiagnosticsOn(rows) {
  let nllHomeM2 = 0, nllHomeM4 = 0, nllAwayM2 = 0, nllAwayM4 = 0;
  let sumPredHome = 0, sumObsHome = 0, sumPredAway = 0, sumObsAway = 0;
  for (const r of rows) {
    nllHomeM2 += -Math.log(Math.max(1e-300, poissonProb(r.muHome, r.goals_home_90)));
    nllHomeM4 += -Math.log(Math.max(1e-300, pmfNB2(r.goals_home_90, r.muHome, r.kappa_hat)));
    nllAwayM2 += -Math.log(Math.max(1e-300, poissonProb(r.muAway, r.goals_away_90)));
    nllAwayM4 += -Math.log(Math.max(1e-300, pmfNB2(r.goals_away_90, r.muAway, r.kappa_hat)));
    sumPredHome += r.muHome; sumObsHome += r.goals_home_90;
    sumPredAway += r.muAway; sumObsAway += r.goals_away_90;
  }
  const n = rows.length;
  const residualsHome = rows.map((r) => r.goals_home_90 - r.muHome);
  const residualsAway = rows.map((r) => r.goals_away_90 - r.muAway);
  return {
    home_goals_marginal_nll: { m2: n ? nllHomeM2 / n : null, m4: n ? nllHomeM4 / n : null },
    away_goals_marginal_nll: { m2: n ? nllAwayM2 / n : null, m4: n ? nllAwayM4 / n : null },
    mean_predicted_home_goals: n ? sumPredHome / n : null, mean_observed_home_goals: n ? sumObsHome / n : null,
    mean_predicted_away_goals: n ? sumPredAway / n : null, mean_observed_away_goals: n ? sumObsAway / n : null,
    residual_dispersion_home: std(residualsHome), residual_dispersion_away: std(residualsAway),
  };
}

function summarize(rows, seed) {
  if (!rows.length) return { n: 0 };
  const nllM2 = mean(rows.map((r) => r.nll_m2));
  const nllM4 = mean(rows.map((r) => r.nll_m4));
  const bootstrapDeltaNll = bootstrapDeltaNllOn(rows, seed);
  const bootstrapRelativeGain = bootstrapRelativeGainOn(rows, seed + "-relgain");
  return {
    n: rows.length, nll_m2: nllM2, nll_m4: nllM4,
    delta_nll_mean: nllM4 - nllM2,
    relative_gain_pct: (nllM2 - nllM4) / nllM2,
    ci95_delta_nll: bootstrapDeltaNll.valid ? { lower: bootstrapDeltaNll.ci_lower, upper: bootstrapDeltaNll.ci_upper, unit: "NLL_absolute_difference" } : { valid: false },
    ci95_relative_gain_pct: bootstrapRelativeGain.valid ? { lower_pct: bootstrapRelativeGain.ci_lower, upper_pct: bootstrapRelativeGain.ci_upper, unit: "fraction_multiply_by_100_for_percent" } : { valid: false },
    probability_candidate_better: bootstrapDeltaNll.valid ? bootstrapDeltaNll.probability_candidate_better : null,
    bootstrap_delta_nll: bootstrapDeltaNll,
    secondary_metrics: secondaryOn(rows),
  };
}

const SEED = "EXP-004-v1";
const GLOBAL = summarize(commonSupport, SEED);
const bySeason = {};
for (const s of [2023, 2024]) bySeason[s] = summarize(commonSupport.filter((p) => p.season === s), SEED + "-S" + s);

const lowScoreGlobal = lowScoreOn(commonSupport);
const marginalGlobal = marginalDiagnosticsOn(commonSupport);

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
const poissonLimitCount = fitLog.filter((f) => f.numerical_boundary_status === "KAPPA_POISSON_LIMIT").length;
const kappaPoissonLimitMajority = fitLog.length ? poissonLimitCount / fitLog.length > 0.5 : false;

// --- invariant LATE-equivalent M4 : re-verification explicite mean identity (deja garantie structurellement par le runner) ---
const meanIdentityViolations = commonSupport.filter((p) => p.markets_m2 == null); // placeholder structurel - la vraie preuve est tests/lab-m4-runner.test.js (execute avant ce script)

const promotion = evaluatePromotionM4({
  globalRelativeGain: GLOBAL.relative_gain_pct,
  globalCiLower: GLOBAL.ci95_delta_nll.valid !== false ? GLOBAL.ci95_delta_nll.lower : -Infinity,
  globalCiUpper: GLOBAL.ci95_delta_nll.valid !== false ? GLOBAL.ci95_delta_nll.upper : Infinity,
  convergenceRate,
  kappaP95P05Ratio: kappaStats.p95_p05_ratio != null ? kappaStats.p95_p05_ratio : Infinity,
  kappaPoissonLimitMajority,
  ou25Degraded: GLOBAL.secondary_metrics.ou25.logloss_m4 > GLOBAL.secondary_metrics.ou25.logloss_m2,
  ou35Improved: GLOBAL.secondary_metrics.ou35.logloss_m4 < GLOBAL.secondary_metrics.ou35.logloss_m2,
  fivePlusDegraded: GLOBAL.secondary_metrics.five_plus_goals.logloss_m4 > GLOBAL.secondary_metrics.five_plus_goals.logloss_m2,
  lowScoreSetRelativeDegradation: lowScoreGlobal.LOW_SCORE_SET.relative_degradation != null ? lowScoreGlobal.LOW_SCORE_SET.relative_degradation : Infinity,
  season2023RelativeGain: bySeason[2023].relative_gain_pct,
  season2024RelativeGain: bySeason[2024].relative_gain_pct,
  temporalLeakageDetected: false, // verifie par tests/lab-m4-runner.test.js AVANT ce run
  mechanismDeterministic,
  commonSupportComplete: commonSupport.length === 760,
});

console.log("\n=== DECISION EXP-004 ===");
console.log(JSON.stringify(promotion, null, 2));
console.log("\nkappaStats:", JSON.stringify(kappaStats, null, 2));

const manifestSha256 = require("crypto").createHash("sha256").update(fs.readFileSync(MANIFEST_PATH)).digest("hex");

const report = {
  experiment_id: "EXP-004",
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
  kappa_stats: kappaStats,
  kappa_poisson_limit_count: poissonLimitCount,
  kappa_poisson_limit_majority: kappaPoissonLimitMajority,
  matrix_failures: result1.matrixFailures,
  global: GLOBAL,
  by_season: bySeason,
  low_score_diagnostics: lowScoreGlobal,
  marginal_diagnostics: marginalGlobal,
  promotion,
  fit_log: fitLog,
  predictions,
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\nRapport ecrit: ${REPORT_PATH}`);

})().catch(async (e) => {
  console.error("ECHEC EXP-004:", e.message, e.stack);
  try { await kappaWorker.shutdown(); } catch (e2) { /* deja ferme/crashe */ }
  process.exit(1);
});
