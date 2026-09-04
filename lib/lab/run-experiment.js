"use strict";
// GATE C10 (SPEC LAB PRO v1.0) - orchestration complete d'EXP-001 :
// gating -> integrite lockbox (lecture seule) -> walk-forward -> fit rho
// (scripts/fit_rho.py) -> metriques -> bootstrap -> promotion -> rapport.
// AUCUNE etape n'ouvre le lockbox en ecriture ; verifyLockboxIntegrity
// est un controle en lecture seule. Le fitter par defaut appelle le VRAI
// scripts/fit_rho.py (jamais une reimplementation) ; un candidateRhoFitter
// injectable permet uniquement aux TESTS de plomberie (donnees
// synthetiques) de ne pas dependre du sous-processus Python a chaque
// assertion - le lancement reel (scripts/run_exp001.js) n'injecte jamais
// ce parametre.

const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { evaluateGate } = require("./experiment-manifest.js");
const { verifyLockboxIntegrity } = require("../data/dataset-version.js");
const { runWalkForward } = require("./walkforward-runner.js");
const { deriveRhoBounds } = require("./rho-bounds.js");
const { logProbability } = require("./dc-log-probability.js");
const { exactScoreNLL, binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier, lowScoreDiagnostics } = require("./metrics.js");
const { pairedBlockBootstrap } = require("./bootstrap.js");
const { evaluatePromotion } = require("../promotion.js");

const DEFAULT_FIT_SCRIPT = path.join(__dirname, "..", "..", "scripts", "fit_rho.py");

// Adapte scripts/fit_rho.py (le VRAI fitter, jamais reimplemente) a la
// forme candidateRhoFitter(trainPairs) attendue par runWalkForward.
function pythonRhoFitter(fitScript) {
  return function (trainPairs) {
    if (!trainPairs || !trainPairs.length) return { rho_hat: null, convergence: false, reason: "NO_TRAIN_DATA" };
    const bounds = deriveRhoBounds(trainPairs);
    if (!bounds.valid) return { rho_hat: null, convergence: false, reason: bounds.reason };
    const input = JSON.stringify({
      matches: trainPairs.map((p) => ({ lambda_home: p.lambdaH, lambda_away: p.lambdaA, goals_home_90: p.h, goals_away_90: p.a })),
      lower_bound: bounds.lower,
      upper_bound: bounds.upper,
      initial_guess: (bounds.lower + bounds.upper) / 2,
    });
    const result = spawnSync("python3", [fitScript || DEFAULT_FIT_SCRIPT], { input, encoding: "utf8" });
    if (result.status !== 0) return { rho_hat: null, convergence: false, reason: "FIT_SCRIPT_ERROR", stderr: result.stderr };
    const parsed = JSON.parse(result.stdout);
    if (parsed.error) return { rho_hat: null, convergence: false, reason: parsed.error };
    return { rho_hat: parsed.rho_hat, convergence: !!parsed.convergence, on_boundary: !!parsed.on_boundary, iterations: parsed.iterations };
  };
}

function mean(arr) {
  if (!arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(mean(arr.map((v) => (v - m) ** 2)));
}

function computeSecondaryMetrics(predictions) {
  const ou25Items = { m0: [], m1: [] };
  const bttsItems = { m0: [], m1: [] };
  const x12Items = { m0: [], m1: [] };
  for (const p of predictions) {
    const total = p.goals_home_90 + p.goals_away_90;
    const over25Outcome = total > 2.5 ? 1 : 0;
    const bttsOutcome = p.goals_home_90 > 0 && p.goals_away_90 > 0 ? 1 : 0;
    const x12Outcome = p.goals_home_90 > p.goals_away_90 ? "p1" : (p.goals_home_90 === p.goals_away_90 ? "pN" : "p2");
    ou25Items.m0.push({ prob: p.markets_m0.overUnder["2.5"].over, outcome: over25Outcome });
    ou25Items.m1.push({ prob: p.markets_m1.overUnder["2.5"].over, outcome: over25Outcome });
    bttsItems.m0.push({ prob: p.markets_m0.btts.yes, outcome: bttsOutcome });
    bttsItems.m1.push({ prob: p.markets_m1.btts.yes, outcome: bttsOutcome });
    x12Items.m0.push({ probs: { p1: p.markets_m0.p1, pN: p.markets_m0.pN, p2: p.markets_m0.p2 }, outcome: x12Outcome });
    x12Items.m1.push({ probs: { p1: p.markets_m1.p1, pN: p.markets_m1.pN, p2: p.markets_m1.p2 }, outcome: x12Outcome });
  }
  return {
    ou25: { logloss_m0: binaryLogLoss(ou25Items.m0), logloss_m1: binaryLogLoss(ou25Items.m1), brier_m0: binaryBrier(ou25Items.m0), brier_m1: binaryBrier(ou25Items.m1) },
    btts: { logloss_m0: binaryLogLoss(bttsItems.m0), logloss_m1: binaryLogLoss(bttsItems.m1), brier_m0: binaryBrier(bttsItems.m0), brier_m1: binaryBrier(bttsItems.m1) },
    x12: { logloss_m0: multiclassLogLoss(x12Items.m0), logloss_m1: multiclassLogLoss(x12Items.m1), brier_m0: multiclassBrier(x12Items.m0), brier_m1: multiclassBrier(x12Items.m1) },
  };
}

// Deltas de NLL exact-score PAR MATCH, groupes par cutoff (bloc) - entree
// du bootstrap par blocs apparies (lib/lab/bootstrap.js). delta>0 = M1
// meilleur que M0 sur ce match.
function buildNllDeltaBlocks(predictions) {
  const byCutoff = new Map();
  for (const p of predictions) {
    const nll0 = -logProbability(p.lambdaH, p.lambdaA, p.goals_home_90, p.goals_away_90, p.rho_m0);
    const nll1 = -logProbability(p.lambdaH, p.lambdaA, p.goals_home_90, p.goals_away_90, p.rho_m1);
    const delta = nll0 - nll1;
    if (!byCutoff.has(p.cutoff)) byCutoff.set(p.cutoff, []);
    byCutoff.get(p.cutoff).push(delta);
  }
  return Array.from(byCutoff.values());
}

// options = { manifest, allFixtures, trainSeasons, oosSeasons, leagueAvgH,
//   leagueAvgA, leagueId, championRho, lockboxPath, fitScript,
//   candidateRhoFitter (TESTS UNIQUEMENT - jamais en lancement reel) }
function runExperiment(options) {
  const gate = evaluateGate(options.manifest);
  if (!gate.can_run) {
    return { launched: false, reason: "GATING_BLOCKED", blocking_ids: gate.blocking_ids, blocking_descriptions: gate.blocking_descriptions };
  }

  if (options.sealedLockbox) {
    const currentFixtureIds = (options.allFixtures || []).map((f) => f.fixture_id);
    const integrity = verifyLockboxIntegrity(options.sealedLockbox, currentFixtureIds);
    if (!integrity.intact) {
      return { launched: false, reason: "LOCKBOX_INTEGRITY_FAILED", detail: integrity };
    }
  }

  const championRho = options.championRho !== undefined ? options.championRho : -0.0845;
  const rhoFitter = options.candidateRhoFitter || pythonRhoFitter(options.fitScript);

  const wf = runWalkForward({
    allFixtures: options.allFixtures,
    trainSeasons: options.trainSeasons,
    oosSeasons: options.oosSeasons,
    championRho,
    candidateRhoFitter: rhoFitter,
    leagueAvgH: options.leagueAvgH,
    leagueAvgA: options.leagueAvgA,
    leagueId: options.leagueId,
  });

  if (!wf.predictions.length) {
    return { launched: false, reason: "NO_PREDICTIONS_PRODUCED" };
  }

  const nllM0 = exactScoreNLL(wf.predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, rho: p.rho_m0, h: p.goals_home_90, a: p.goals_away_90 })));
  const nllM1 = exactScoreNLL(wf.predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, rho: p.rho_m1, h: p.goals_home_90, a: p.goals_away_90 })));

  const lowScore = lowScoreDiagnostics(wf.predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rhoM0: p.rho_m0, rhoM1: p.rho_m1 })));
  const secondary = computeSecondaryMetrics(wf.predictions);

  const convergedCount = wf.fitLog.filter((f) => f.convergence).length;
  const convergenceRate = wf.fitLog.length ? convergedCount / wf.fitLog.length : 0;
  const boundaryCount = wf.fitLog.filter((f) => f.on_boundary).length;
  const boundaryHitRate = wf.fitLog.length ? boundaryCount / wf.fitLog.length : 0;
  const rhoValues = wf.fitLog.map((f) => f.rho_hat).filter((v) => typeof v === "number");
  const rhoStd = std(rhoValues);

  const bootstrapCfg = (options.manifest.methodology && options.manifest.methodology.bootstrap) || {};
  const blocks = buildNllDeltaBlocks(wf.predictions);
  const bootstrap = pairedBlockBootstrap(blocks, { seed: bootstrapCfg.seed || "EXP-001-default", nResamples: bootstrapCfg.n_resamples || 10000 });

  const promotion = evaluatePromotion({
    n_oos: wf.predictions.length,
    nll_m0: nllM0,
    nll_m1: nllM1,
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

  return {
    launched: true,
    experiment_id: options.manifest.experiment_id,
    n_predictions: wf.predictions.length,
    n_cutoffs: wf.cutoffs.length,
    nll_m0: nllM0,
    nll_m1: nllM1,
    convergence_rate: convergenceRate,
    boundary_hit_rate: boundaryHitRate,
    rho_mean: mean(rhoValues),
    rho_std: rhoStd,
    secondary_metrics: secondary,
    low_score_diagnostics: lowScore,
    bootstrap,
    promotion,
  };
}

module.exports = { runExperiment, pythonRhoFitter, computeSecondaryMetrics, buildNllDeltaBlocks };
