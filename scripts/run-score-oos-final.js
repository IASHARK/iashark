#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 - Score OOS_FINAL (2026-09-06). B0
// (independant, rho=0) vs M0 (rho gele) sur 2024-25 UNIQUEMENT. M2
// reste ARCHIVE (M2_REJECT_DEV), aucune possibilite de promotion.
// Reutilise lib/lab/walkforward-runner.js#runWalkForward TEL QUEL : B0
// et M0 partagent EXACTEMENT les memes lambdas (construction M0-style,
// saison courante uniquement) - seul rho differe (0 vs gele), ce qui
// correspond exactement au contrat championRho/candidateRhoFitter de
// ce runner (candidateRhoFitter ici est une fonction CONSTANTE qui
// renvoie toujours rho_final, jamais un refit).
// Execute DEUX FOIS (item 7, reproductibilite) - meme process.
//
// Usage : node scripts/run-score-oos-final.js --league-key=laliga

const fs = require("fs");
const path = require("path");
const { runWalkForward } = require("../lib/lab/walkforward-runner.js");
const { exactScoreNLL, binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier } = require("../lib/lab/metrics.js");
const { lossDelta } = require("../lib/lab/loss-delta.js");
const { pairedBlockBootstrap } = require("../lib/lab/bootstrap.js");
const { poissonProb } = require("../lib/models.js");
const { sha256Hex } = require("../lib/player-lab/oos-eval-metrics.js");

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; }
  return args;
}
function loadLeagueConfig(leagueKey) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8"));
  return config.leagues.find((l) => l.key === leagueKey);
}
function loadFixtures(leagueKey, season) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8")).map((f) => ({ ...f, season }));
}
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function dcTau(h, a, lambdaH, lambdaA, rho) {
  if (h === 0 && a === 0) return 1 - lambdaH * lambdaA * rho;
  if (h === 1 && a === 0) return 1 + lambdaA * rho;
  if (h === 0 && a === 1) return 1 + lambdaH * rho;
  if (h === 1 && a === 1) return 1 - rho;
  return 1;
}

function computeAll(leagueKey) {
  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  const { manifest, hash } = JSON.parse(fs.readFileSync(path.join(factoryDir, "score-oos-final-manifest.json"), "utf8"));

  const rhoFinal = manifest.rho.final_value;
  const leagueAvgH = manifest.league_averages.leagueAvgH;
  const leagueAvgA = manifest.league_averages.leagueAvgA;

  const warmup = loadFixtures(leagueKey, sp.warmup);
  const train = loadFixtures(leagueKey, sp.train);
  const oosDev = loadFixtures(leagueKey, sp.oos_dev);
  const oosFinal = loadFixtures(leagueKey, sp.oos_final);
  const allFixtures = [...warmup, ...train, ...oosDev, ...oosFinal];

  const constantRhoFitter = () => ({ rho_hat: rhoFinal, convergence: true, on_boundary: false });

  const wf = runWalkForward({
    allFixtures, trainSeasons: [sp.warmup, sp.train, sp.oos_dev], oosSeasons: [sp.oos_final],
    championRho: 0, candidateRhoFitter: constantRhoFitter,
    leagueAvgH, leagueAvgA, leagueId: league.apiFootballId,
  });

  const predictions = wf.predictions; // runWalkForward gate deja via calcCriteres (m0-equivalent gate) avant de pousser une prediction
  const nllItemsB0 = predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rho: 0 }));
  const nllItemsM0 = predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rho: rhoFinal }));
  const nllB0 = exactScoreNLL(nllItemsB0);
  const nllM0 = exactScoreNLL(nllItemsM0);

  const marginalHomeNll = -mean(predictions.map((p) => Math.log(Math.max(poissonProb(p.lambdaH, p.goals_home_90), 1e-12)))); // identique B0/M0 (memes lambdas, marginales independantes de rho)
  const marginalAwayNll = -mean(predictions.map((p) => Math.log(Math.max(poissonProb(p.lambdaA, p.goals_away_90), 1e-12))));

  const ou25 = { b0: [], m0: [] }, btts = { b0: [], m0: [] }, x12 = { b0: [], m0: [] };
  for (const p of predictions) {
    const total = p.goals_home_90 + p.goals_away_90;
    const over25 = total > 2.5 ? 1 : 0;
    const bttsOutcome = p.goals_home_90 > 0 && p.goals_away_90 > 0 ? 1 : 0;
    const x12Outcome = p.goals_home_90 > p.goals_away_90 ? "p1" : (p.goals_home_90 === p.goals_away_90 ? "pN" : "p2");
    ou25.b0.push({ prob: p.markets_m0.overUnder["2.5"].over, outcome: over25 });
    ou25.m0.push({ prob: p.markets_m1.overUnder["2.5"].over, outcome: over25 });
    btts.b0.push({ prob: p.markets_m0.btts.yes, outcome: bttsOutcome });
    btts.m0.push({ prob: p.markets_m1.btts.yes, outcome: bttsOutcome });
    x12.b0.push({ probs: p.markets_m0, outcome: x12Outcome });
    x12.m0.push({ probs: p.markets_m1, outcome: x12Outcome });
  }
  const secondary = {
    ou25: { logloss_b0: binaryLogLoss(ou25.b0), logloss_m0: binaryLogLoss(ou25.m0), brier_b0: binaryBrier(ou25.b0), brier_m0: binaryBrier(ou25.m0) },
    btts: { logloss_b0: binaryLogLoss(btts.b0), logloss_m0: binaryLogLoss(btts.m0), brier_b0: binaryBrier(btts.b0), brier_m0: binaryBrier(btts.m0) },
    x12: { logloss_b0: multiclassLogLoss(x12.b0), logloss_m0: multiclassLogLoss(x12.m0), brier_b0: multiclassBrier(x12.b0), brier_m0: multiclassBrier(x12.m0) },
  };

  const lowScore = (() => {
    const targets = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const out = {};
    for (const [h, a] of targets) {
      const key = `${h}-${a}`;
      const matching = predictions.filter((p) => p.goals_home_90 === h && p.goals_away_90 === a);
      let nllB0Sum = 0, nllM0Sum = 0;
      for (const p of matching) {
        nllB0Sum += -Math.log(Math.max(poissonProb(p.lambdaH, h) * poissonProb(p.lambdaA, a) * dcTau(h, a, p.lambdaH, p.lambdaA, 0), 1e-12));
        nllM0Sum += -Math.log(Math.max(poissonProb(p.lambdaH, h) * poissonProb(p.lambdaA, a) * dcTau(h, a, p.lambdaH, p.lambdaA, rhoFinal), 1e-12));
      }
      out[key] = { count_observed: matching.length, nll_contribution_b0: matching.length ? nllB0Sum / matching.length : null, nll_contribution_m0: matching.length ? nllM0Sum / matching.length : null };
    }
    return out;
  })();

  const blocksMap = new Map();
  for (const p of predictions) {
    const nllB0Match = -Math.log(Math.max(poissonProb(p.lambdaH, p.goals_home_90) * poissonProb(p.lambdaA, p.goals_away_90) * dcTau(p.goals_home_90, p.goals_away_90, p.lambdaH, p.lambdaA, 0), 1e-12));
    const nllM0Match = -Math.log(Math.max(poissonProb(p.lambdaH, p.goals_home_90) * poissonProb(p.lambdaA, p.goals_away_90) * dcTau(p.goals_home_90, p.goals_away_90, p.lambdaH, p.lambdaA, rhoFinal), 1e-12));
    const delta = lossDelta(nllM0Match, nllB0Match); // delta = candidat(M0) - champion(B0)
    if (!blocksMap.has(p.cutoff)) blocksMap.set(p.cutoff, []);
    blocksMap.get(p.cutoff).push(delta);
  }
  const blocks = Array.from(blocksMap.values());
  const bootstrap = pairedBlockBootstrap(blocks, { seed: manifest.bootstrap_policy.seed, nResamples: manifest.bootstrap_policy.n_resamples });

  const relativeGain = (nllB0 - nllM0) / nllB0;

  // Stabilite temporelle (premiere/deuxieme moitie de saison, item 3)
  const fixtureIdsSorted = [...new Set(predictions.map((p) => p.fixture_id))].sort((a, b) => {
    const fa = oosFinal.find((f) => f.fixture_id === a), fb = oosFinal.find((f) => f.fixture_id === b);
    return new Date(fa.kickoff_timestamp) - new Date(fb.kickoff_timestamp);
  });
  const half = Math.ceil(fixtureIdsSorted.length / 2);
  const firstHalfIds = new Set(fixtureIdsSorted.slice(0, half));
  function periodStats(preds) {
    return { n: preds.length, nll_b0: exactScoreNLL(preds.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rho: 0 }))), nll_m0: exactScoreNLL(preds.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rho: rhoFinal }))) };
  }
  const firstHalf = periodStats(predictions.filter((p) => firstHalfIds.has(p.fixture_id)));
  const secondHalf = periodStats(predictions.filter((p) => !firstHalfIds.has(p.fixture_id)));

  // Decision (item 3, criteres pre-enregistres dans le manifest)
  const ciConfirmsWorse = bootstrap.valid && bootstrap.ci_lower > 0;
  const ciFavorable = bootstrap.valid && bootstrap.ci_upper < 0;
  const numericalClean = Number.isFinite(nllB0) && Number.isFinite(nllM0);
  let status, reasonCode;
  if (!numericalClean) { status = "REJECTED"; reasonCode = "NON_FINITE_METRICS"; }
  else if (ciConfirmsWorse) { status = "REJECTED"; reasonCode = "CI_CONFIRMS_M0_WORSE_THAN_B0"; }
  else if (ciFavorable && relativeGain > 0) { status = "VALIDATED"; reasonCode = "M0_IMPROVES_ON_B0_CI_FAVORABLE"; }
  else { status = "INCONCLUSIVE"; reasonCode = "M0_APPROX_B0_CI_CROSSES_ZERO"; }

  return {
    league_key: leagueKey, oos_final_season: sp.oos_final, manifest_hash: hash,
    coverage: { n: predictions.length },
    primary: { nll_b0: nllB0, nll_m0: nllM0, delta: nllM0 - nllB0, relative_gain: relativeGain },
    marginals: { home_nll: marginalHomeNll, away_nll: marginalAwayNll },
    secondary, low_score_diagnostics: lowScore, bootstrap,
    temporal_stability: { first_half_season: firstHalf, second_half_season: secondHalf },
    decision: { ci_confirms_worse: ciConfirmsWorse, ci_favorable: ciFavorable, numerical_clean: numericalClean, status, reason_code: reasonCode },
  };
}

function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/run-score-oos-final.js --league-key=<key>"); process.exit(1); }

  console.log("=== Run 1/2 (reproductibilite) ===");
  const result1 = computeAll(leagueKey);
  console.log("=== Run 2/2 (reproductibilite) ===");
  const result2 = computeAll(leagueKey);
  const hash1 = sha256Hex(JSON.stringify(result1));
  const hash2 = sha256Hex(JSON.stringify(result2));
  const reproducible = hash1 === hash2;
  console.log(`reproductibilite : hash_run1=${hash1} hash_run2=${hash2} REPRODUCIBLE=${reproducible}`);

  const report = { generated_at: new Date().toISOString(), reproducible, hash_run1: hash1, hash_run2: hash2, ...result1 };
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  const outPath = path.join(factoryDir, "score-oos-final-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nEcrit: ${outPath}`);
}

main();
