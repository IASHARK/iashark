#!/usr/bin/env node
"use strict";
// LEAGUE_SCORE_PRODUCTION_VALIDATION_V1 - Phase 3 (2026-09-06).
// OUVERTURE UNIQUE DU HOLDOUT (saison sealed_unread). Replay STRICT
// point-in-time du champion GELE en Phase 1 (rho/leagueAvg/structure
// jamais refittes) et application du contrat GELE en Phase 1B (aucun
// seuil modifie ici). Produit PASS/INCONCLUSIVE/REJECT selon la regle
// de decision pre-enregistree - jamais une deuxieme tentative avec
// d'autres parametres.
//
// Usage : node scripts/run-score-production-validation-holdout.js --league-key=seriea

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { runWalkForwardM2R } = require("../lib/lab/walkforward-m2r-runner.js");
const { runWalkForward } = require("../lib/lab/walkforward-runner.js");
const { exactScoreNLL } = require("../lib/lab/metrics.js");
const { calibrationInterceptSlope, reliabilityBins, expectedCalibrationError } = require("../lib/player-lab/oos-eval-metrics.js");

function parseArgs() { const args = {}; for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; } return args; }
function loadLeagueConfig(leagueKey) { const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8")); return config.leagues.find((l) => l.key === leagueKey); }
function loadFixtures(leagueKey, season) { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8")).map((f) => ({ ...f, season })); }
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function logloss(p, y) { const c = Math.min(Math.max(p, 1e-12), 1 - 1e-12); return y === 1 ? -Math.log(c) : -Math.log(1 - c); }

function computeAll(leagueKey) {
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  const pvDir = path.join(factoryDir, "score-production-validation-v1");
  const { contract } = JSON.parse(fs.readFileSync(path.join(pvDir, "production-validation-contract.json"), "utf8"));
  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const holdoutSeason = sp.sealed_unread;

  const rhoFrozen = contract.champion.rho;
  const leagueAvgH = contract.champion.league_avg_h;
  const leagueAvgA = contract.champion.league_avg_a;
  const championIsM2 = contract.champion.model_id === "M2";
  const championIsB0 = contract.champion.model_id === "B0";

  const warmup = loadFixtures(leagueKey, sp.warmup);
  const train = loadFixtures(leagueKey, sp.train);
  const oosDev = loadFixtures(leagueKey, sp.oos_dev);
  const oosFinal = loadFixtures(leagueKey, sp.oos_final);
  const holdout = loadFixtures(leagueKey, holdoutSeason);
  const allFixtures = [...warmup, ...train, ...oosDev, ...oosFinal, ...holdout];

  let predictions;
  if (championIsM2) {
    const previousSeasonFixturesBySeasons = new Map([[holdoutSeason, oosFinal]]);
    const wf = runWalkForwardM2R({ allFixtures, trainSeasons: [sp.warmup, sp.train, sp.oos_dev, sp.oos_final], oosSeasons: [holdoutSeason], leagueId: league.apiFootballId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons, championRho: rhoFrozen });
    predictions = wf.predictions.filter((p) => p.m0_valid).map((p) => ({ fixture_id: p.fixture_id, cutoff: p.cutoff, lambdaH: p.lambdaH_m2, lambdaA: p.lambdaA_m2, h: p.goals_home_90, a: p.goals_away_90, rho: rhoFrozen, markets: p.markets_m2 }));
  } else {
    const rhoUsed = championIsB0 ? 0 : rhoFrozen;
    const constantRhoFitter = () => ({ rho_hat: rhoUsed, convergence: true, on_boundary: false });
    const wf = runWalkForward({ allFixtures, trainSeasons: [sp.warmup, sp.train, sp.oos_dev, sp.oos_final], oosSeasons: [holdoutSeason], championRho: rhoUsed, candidateRhoFitter: constantRhoFitter, leagueAvgH, leagueAvgA, leagueId: league.apiFootballId });
    predictions = wf.predictions.map((p) => ({ fixture_id: p.fixture_id, cutoff: p.cutoff, lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rho: rhoUsed, markets: championIsB0 ? p.markets_m0 : p.markets_m1 }));
  }

  // --- POINT_IN_TIME_INTEGRITY ---
  // (a) chaque prediction vient d'un cutoff strictement dans la saison
  // holdout (jamais une fixture d'une saison anterieure prise pour une
  // prediction "holdout") ; (b) rho/leagueAvg utilises sont EXACTEMENT
  // ceux geles en Phase 1B, jamais refittes ici (verifie par egalite
  // stricte avec les valeurs lues depuis le contrat, jamais recalculees).
  const holdoutFixtureIds = new Set(holdout.map((f) => f.fixture_id));
  const allPredictionsAreHoldout = predictions.every((p) => holdoutFixtureIds.has(p.fixture_id));
  const rhoNeverRefit = predictions.every((p) => p.rho === rhoFrozen || (championIsB0 && p.rho === 0));
  const pointInTimeIntegrityPass = allPredictionsAreHoldout && rhoNeverRefit;

  // --- DATA_COVERAGE ---
  const nOosHoldout = predictions.length;
  const dataCoveragePass = nOosHoldout >= contract.gates.DATA_COVERAGE.threshold;

  // --- EXACT_SCORE_NLL ---
  const nllHoldout = exactScoreNLL(predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho })));
  const exactScoreNllPass = nllHoldout <= contract.gates.EXACT_SCORE_NLL.threshold;

  // --- CALIBRATION (meme construction exacte que Phase 1B) ---
  function outcomeRows(preds) {
    const rows = [];
    for (const p of preds) {
      const probs = p.markets;
      const isHome = p.h > p.a, isDraw = p.h === p.a, isAway = p.h < p.a;
      rows.push({ p: probs.p1, y: isHome ? 1 : 0 });
      rows.push({ p: probs.pN, y: isDraw ? 1 : 0 });
      rows.push({ p: probs.p2, y: isAway ? 1 : 0 });
    }
    return rows;
  }
  const x12Rows = outcomeRows(predictions);
  const cal = calibrationInterceptSlope(x12Rows);
  const bins = reliabilityBins(x12Rows, 10);
  const ece = expectedCalibrationError(bins, x12Rows.length);
  const calibrationPass = cal.converged === true && ece <= contract.gates.CALIBRATION.threshold_ece;

  // --- MARKET_MARGINALS ---
  const ou25Logloss = mean(predictions.map((p) => logloss(p.markets.overUnder["2.5"].over, (p.h + p.a) > 2.5 ? 1 : 0)));
  const bttsLogloss = mean(predictions.map((p) => logloss(p.markets.btts.yes, (p.h > 0 && p.a > 0) ? 1 : 0)));
  const x12Logloss = mean(x12Rows.map((r) => logloss(r.p, r.y)));
  const maxDeg = contract.gates.MARKET_MARGINALS.max_relative_degradation;
  const oosDevLogloss = contract.gates.MARKET_MARGINALS.oos_dev_logloss;
  function degOk(oosDevVal, holdoutVal) { return holdoutVal <= oosDevVal * (1 + maxDeg); }
  const marketMarginals = {
    ou25: { oos_dev: oosDevLogloss.ou25, holdout: ou25Logloss, pass: degOk(oosDevLogloss.ou25, ou25Logloss) },
    btts: { oos_dev: oosDevLogloss.btts, holdout: bttsLogloss, pass: degOk(oosDevLogloss.btts, bttsLogloss) },
    x12: { oos_dev: oosDevLogloss.x12, holdout: x12Logloss, pass: degOk(oosDevLogloss.x12, x12Logloss) },
  };
  const marketMarginalsPass = marketMarginals.ou25.pass && marketMarginals.btts.pass && marketMarginals.x12.pass;

  // --- TEMPORAL_STABILITY (2 moities par date de coup d'envoi) ---
  const sortedByCutoff = [...predictions].sort((a, b) => (a.cutoff || "").localeCompare(b.cutoff || ""));
  const mid = Math.floor(sortedByCutoff.length / 2);
  const half1 = sortedByCutoff.slice(0, mid), half2 = sortedByCutoff.slice(mid);
  const nllHalf1 = exactScoreNLL(half1.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho })));
  const nllHalf2 = exactScoreNLL(half2.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho })));
  const temporalStabilityPass = nllHalf1 <= contract.gates.EXACT_SCORE_NLL.threshold && nllHalf2 <= contract.gates.EXACT_SCORE_NLL.threshold;

  // --- NO_CATASTROPHIC_SECONDARY_DEGRADATION (scores bas) ---
  const lowScoreKeys = ["0-0", "1-0", "0-1", "1-1"];
  const lowScoreHoldout = {};
  let lowScoreDegraded = [];
  for (const key of lowScoreKeys) {
    const [hh, aa] = key.split("-").map(Number);
    const rows = predictions.filter((p) => p.h === hh && p.a === aa);
    if (!rows.length) continue;
    const nllContribution = mean(rows.map((p) => exactScoreNLL([{ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }])));
    lowScoreHoldout[key] = { count_observed: rows.length, nll_contribution: nllContribution };
    const oosDevCell = contract.gates.NO_CATASTROPHIC_SECONDARY_DEGRADATION.oos_dev_low_score[key];
    if (oosDevCell && rows.length >= 5) {
      const deg = (nllContribution - oosDevCell.nll_contribution) / oosDevCell.nll_contribution;
      if (deg > contract.gates.NO_CATASTROPHIC_SECONDARY_DEGRADATION.max_relative_degradation) lowScoreDegraded.push({ cell: key, relative_degradation: deg });
    }
  }
  const noCatastrophicSecondaryDegradationPass = lowScoreDegraded.length === 0;

  // --- DECISION RULE (exactement celle gelee en Phase 1B, jamais modifiee) ---
  const rejectTriggers = [];
  if (!pointInTimeIntegrityPass) rejectTriggers.push("POINT_IN_TIME_INTEGRITY");
  if (!exactScoreNllPass) rejectTriggers.push("EXACT_SCORE_NLL");
  const inconclusiveTriggers = [];
  if (!dataCoveragePass) inconclusiveTriggers.push("DATA_COVERAGE");
  if (!calibrationPass) inconclusiveTriggers.push("CALIBRATION");
  if (!marketMarginalsPass) inconclusiveTriggers.push("MARKET_MARGINALS");
  if (!temporalStabilityPass) inconclusiveTriggers.push("TEMPORAL_STABILITY");
  if (!noCatastrophicSecondaryDegradationPass) inconclusiveTriggers.push("NO_CATASTROPHIC_SECONDARY_DEGRADATION");

  let verdict;
  if (rejectTriggers.length) verdict = "REJECTED";
  else if (inconclusiveTriggers.length) verdict = "INCONCLUSIVE";
  else verdict = "VALIDATED";

  return {
    protocol: "LEAGUE_SCORE_PRODUCTION_VALIDATION_V1",
    phase: "3_HOLDOUT_EVALUATION",
    league_key: leagueKey,
    holdout_season: holdoutSeason,
    champion: contract.champion.model_id,
    generated_at: new Date().toISOString(),
    gates: {
      POINT_IN_TIME_INTEGRITY: { pass: pointInTimeIntegrityPass, all_predictions_are_holdout: allPredictionsAreHoldout, rho_never_refit: rhoNeverRefit },
      DATA_COVERAGE: { pass: dataCoveragePass, n_oos_holdout: nOosHoldout, threshold: contract.gates.DATA_COVERAGE.threshold },
      EXACT_SCORE_NLL: { pass: exactScoreNllPass, nll_holdout: nllHoldout, threshold: contract.gates.EXACT_SCORE_NLL.threshold, oos_dev_observed: contract.gates.EXACT_SCORE_NLL.oos_dev_observed_mean_nll },
      CALIBRATION: { pass: calibrationPass, slope: cal.slope, intercept: cal.intercept, converged: cal.converged, ece: ece, threshold_ece: contract.gates.CALIBRATION.threshold_ece },
      MARKET_MARGINALS: { pass: marketMarginalsPass, detail: marketMarginals },
      TEMPORAL_STABILITY: { pass: temporalStabilityPass, nll_half1: nllHalf1, nll_half2: nllHalf2, threshold: contract.gates.EXACT_SCORE_NLL.threshold, n_half1: half1.length, n_half2: half2.length },
      NO_CATASTROPHIC_SECONDARY_DEGRADATION: { pass: noCatastrophicSecondaryDegradationPass, holdout_low_score: lowScoreHoldout, degraded: lowScoreDegraded },
    },
    reject_triggers: rejectTriggers,
    inconclusive_triggers: inconclusiveTriggers,
    verdict,
    score_runnable: verdict === "VALIDATED",
  };
}

function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/run-score-production-validation-holdout.js --league-key=<key>"); process.exit(1); }

  console.log("=== Run 1/2 (reproductibilite) ===");
  const result1 = computeAll(leagueKey);
  console.log("=== Run 2/2 (reproductibilite) ===");
  const result2 = computeAll(leagueKey);
  // generated_at (horodatage d'execution) exclu du hash de reproductibilite -
  // il varie forcement d'un run a l'autre par construction (Date.now()),
  // ce n'est jamais un signe de non-determinisme du calcul lui-meme.
  const strip = (r) => { const { generated_at, ...rest } = r; return rest; };
  const hash1 = crypto.createHash("sha256").update(JSON.stringify(strip(result1))).digest("hex");
  const hash2 = crypto.createHash("sha256").update(JSON.stringify(strip(result2))).digest("hex");
  const reproducible = hash1 === hash2;
  console.log("reproductibilite: hash_run1=" + hash1 + " hash_run2=" + hash2 + " REPRODUCIBLE=" + reproducible);

  const REPRODUCIBILITY = { pass: reproducible };
  let finalVerdict = result1.verdict;
  const rejectTriggers = [...result1.reject_triggers];
  if (!reproducible) { rejectTriggers.push("REPRODUCIBILITY"); finalVerdict = "REJECTED"; }

  const report = { ...result1, gates: { ...result1.gates, REPRODUCIBILITY }, reject_triggers: rejectTriggers, verdict: finalVerdict, score_runnable: finalVerdict === "VALIDATED", hash_run1: hash1, hash_run2: hash2, reproducible };

  const outDir = path.join(__dirname, "..", "data", "league-factory", leagueKey, "score-production-validation-v1");
  const outPath = path.join(outDir, "holdout-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("\nEcrit: " + outPath);
}

main();
