#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 - Score OOS_DEV (2026-09-06). Premiere
// lecture de metrique OOS_DEV pour une ligue - EXECUTE UNIQUEMENT APRES
// que scripts/write-oos-manifests.js a ecrit et hashe le manifest.
// rho est GELE (lu depuis le manifest deja hashe, jamais refitte ici).
// M0 vs M2 via lib/lab/walkforward-m2r-runner.js#runWalkForwardM2R
// (code partage, deja teste sur PL, seul rho est desormais parametre -
// voir le commit qui l'a promu). AUCUNE donnee OOS_FINAL/SEALED chargee.
//
// Usage : node scripts/run-score-oos-dev.js --league-key=laliga

const fs = require("fs");
const path = require("path");
const { runWalkForwardM2R } = require("../lib/lab/walkforward-m2r-runner.js");
const { exactScoreNLL, binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier } = require("../lib/lab/metrics.js");
const { lossDelta } = require("../lib/lab/loss-delta.js");
const { pairedBlockBootstrap } = require("../lib/lab/bootstrap.js");
const { evaluatePromotion } = require("../lib/promotion.js");
const { poissonProb } = require("../lib/models.js");

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

function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/run-score-oos-dev.js --league-key=<key>"); process.exit(1); }
  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);

  const manifestFile = path.join(factoryDir, "score-oos-manifest.json");
  if (!fs.existsSync(manifestFile)) { console.error("Manifest absent - lancer scripts/write-oos-manifests.js AVANT ce script."); process.exit(1); }
  const { manifest, hash } = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  console.log(`=== Score OOS_DEV : ${league.displayName} - manifest deja hashe (${hash}) ===`);

  const rhoFinal = manifest.rho.final_value;
  const leagueAvgH = manifest.league_averages.leagueAvgH;
  const leagueAvgA = manifest.league_averages.leagueAvgA;

  const warmupFixtures = loadFixtures(leagueKey, sp.warmup);
  const trainFixtures = loadFixtures(leagueKey, sp.train);
  const oosDevFixtures = loadFixtures(leagueKey, sp.oos_dev);
  const allFixtures = [...warmupFixtures, ...trainFixtures, ...oosDevFixtures];
  const previousSeasonFixturesBySeasons = new Map([[sp.oos_dev, trainFixtures]]);

  console.log(`OOS_DEV=${sp.oos_dev} : previous season (${sp.train}) fixtures=${trainFixtures.length}`);
  console.log(`rho_final(gele)=${rhoFinal}`);

  const wf = runWalkForwardM2R({
    allFixtures, trainSeasons: [sp.warmup, sp.train], oosSeasons: [sp.oos_dev],
    leagueId: league.apiFootballId, leagueAvgH, leagueAvgA,
    previousSeasonFixturesBySeasons, championRho: rhoFinal,
  });

  const predictions = wf.predictions.filter((p) => p.m0_valid); // M0 doit etre valide pour la comparaison primaire M0 vs M2 (M2_COVERAGE_GAIN reste un diagnostic separe, item hors perimetre primaire)
  console.log(`n_predictions_total=${wf.predictions.length} n_m0_valid=${predictions.length}`);

  const nllItemsM0 = predictions.map((p) => ({ lambdaH: p.lambdaH_m0, lambdaA: p.lambdaA_m0, h: p.goals_home_90, a: p.goals_away_90, rho: rhoFinal }));
  const nllItemsM2 = predictions.map((p) => ({ lambdaH: p.lambdaH_m2, lambdaA: p.lambdaA_m2, h: p.goals_home_90, a: p.goals_away_90, rho: rhoFinal }));
  const nllM0 = exactScoreNLL(nllItemsM0);
  const nllM2 = exactScoreNLL(nllItemsM2);

  // Marginales home/away (Poisson, independant de rho)
  const marginalHomeNllM0 = -mean(predictions.map((p) => Math.log(Math.max(poissonProb(p.lambdaH_m0, p.goals_home_90), 1e-12))));
  const marginalHomeNllM2 = -mean(predictions.map((p) => Math.log(Math.max(poissonProb(p.lambdaH_m2, p.goals_home_90), 1e-12))));
  const marginalAwayNllM0 = -mean(predictions.map((p) => Math.log(Math.max(poissonProb(p.lambdaA_m0, p.goals_away_90), 1e-12))));
  const marginalAwayNllM2 = -mean(predictions.map((p) => Math.log(Math.max(poissonProb(p.lambdaA_m2, p.goals_away_90), 1e-12))));

  // Secondaires 1X2/OU2.5/BTTS
  const ou25 = { m0: [], m2: [] }, btts = { m0: [], m2: [] }, x12 = { m0: [], m2: [] };
  for (const p of predictions) {
    const total = p.goals_home_90 + p.goals_away_90;
    const over25 = total > 2.5 ? 1 : 0;
    const bttsOutcome = p.goals_home_90 > 0 && p.goals_away_90 > 0 ? 1 : 0;
    const x12Outcome = p.goals_home_90 > p.goals_away_90 ? "p1" : (p.goals_home_90 === p.goals_away_90 ? "pN" : "p2");
    ou25.m0.push({ prob: p.markets_m0.overUnder["2.5"].over, outcome: over25 });
    ou25.m2.push({ prob: p.markets_m2.overUnder["2.5"].over, outcome: over25 });
    btts.m0.push({ prob: p.markets_m0.btts.yes, outcome: bttsOutcome });
    btts.m2.push({ prob: p.markets_m2.btts.yes, outcome: bttsOutcome });
    x12.m0.push({ probs: p.markets_m0, outcome: x12Outcome });
    x12.m2.push({ probs: p.markets_m2, outcome: x12Outcome });
  }
  const secondary = {
    ou25: { logloss_m0: binaryLogLoss(ou25.m0), logloss_m2: binaryLogLoss(ou25.m2), brier_m0: binaryBrier(ou25.m0), brier_m2: binaryBrier(ou25.m2) },
    btts: { logloss_m0: binaryLogLoss(btts.m0), logloss_m2: binaryLogLoss(btts.m2), brier_m0: binaryBrier(btts.m0), brier_m2: binaryBrier(btts.m2) },
    x12: { logloss_m0: multiclassLogLoss(x12.m0), logloss_m2: multiclassLogLoss(x12.m2), brier_m0: multiclassBrier(x12.m0), brier_m2: multiclassBrier(x12.m2) },
  };

  // lib/lab/metrics.js#lowScoreDiagnostics attend une paire M0/M1 a
  // LAMBDAS PARTAGES (concu pour un rho variable, pas des lambdas
  // distincts) - inadapte ici (M0 et M2 different par leurs lambdas,
  // pas leur rho). Diagnostic low-score PAR MODELE recalcule directement.
  const lowScoreM0M2 = (() => {
    const targets = [[0, 0], [1, 0], [0, 1], [1, 1]];
    const out = {};
    for (const [h, a] of targets) {
      const key = `${h}-${a}`;
      const matching = predictions.filter((p) => p.goals_home_90 === h && p.goals_away_90 === a);
      let nllM0Sum = 0, nllM2Sum = 0;
      for (const p of matching) {
        nllM0Sum += -Math.log(Math.max(poissonProb(p.lambdaH_m0, h) * poissonProb(p.lambdaA_m0, a), 1e-12));
        nllM2Sum += -Math.log(Math.max(poissonProb(p.lambdaH_m2, h) * poissonProb(p.lambdaA_m2, a), 1e-12));
      }
      out[key] = { count_observed: matching.length, nll_contribution_m0: matching.length ? nllM0Sum / matching.length : null, nll_contribution_m2: matching.length ? nllM2Sum / matching.length : null };
    }
    return out;
  })();

  // Bootstrap bloc = cutoff (jour) - delta reel par match : NLL_M2(match) - NLL_M0(match), groupe par cutoff
  const blocksMap = new Map();
  for (let i = 0; i < predictions.length; i++) {
    const p = predictions[i];
    const nllM0Match = -Math.log(Math.max(poissonProb(p.lambdaH_m0, p.goals_home_90) * poissonProb(p.lambdaA_m0, p.goals_away_90) * dcTau(p.goals_home_90, p.goals_away_90, p.lambdaH_m0, p.lambdaA_m0, rhoFinal), 1e-12));
    const nllM2Match = -Math.log(Math.max(poissonProb(p.lambdaH_m2, p.goals_home_90) * poissonProb(p.lambdaA_m2, p.goals_away_90) * dcTau(p.goals_home_90, p.goals_away_90, p.lambdaH_m2, p.lambdaA_m2, rhoFinal), 1e-12));
    const delta = lossDelta(nllM2Match, nllM0Match);
    if (!blocksMap.has(p.cutoff)) blocksMap.set(p.cutoff, []);
    blocksMap.get(p.cutoff).push(delta);
  }
  const blocks = Array.from(blocksMap.values());
  const bootstrap = pairedBlockBootstrap(blocks, { seed: manifest.bootstrap_policy.seed, nResamples: manifest.bootstrap_policy.n_resamples });

  const relativeGain = (nllM0 - nllM2) / nllM0;
  const promotion = evaluatePromotion({
    n_oos: predictions.length, nll_m0: nllM0, nll_m1: nllM2,
    ci_lower: bootstrap.valid ? bootstrap.ci_lower : -Infinity, ci_upper: bootstrap.valid ? bootstrap.ci_upper : Infinity,
    convergence_rate: manifest.rho.convergence ? 1 : 0, boundary_hit_rate: 0,
    rho_stability: { std: 0 }, // rho GELE pour cette passe OOS_DEV - aucune instabilite possible par construction (une seule valeur utilisee partout)
    secondary: { ou25: { logloss_m0: secondary.ou25.logloss_m0, logloss_m1: secondary.ou25.logloss_m2 }, btts: { logloss_m0: secondary.btts.logloss_m0, logloss_m1: secondary.btts.logloss_m2 }, x12: { logloss_m0: secondary.x12.logloss_m0, logloss_m1: secondary.x12.logloss_m2 } },
    low_score_diagnostics: Object.fromEntries(Object.entries(lowScoreM0M2).map(([k, v]) => [k, { count_observed: v.count_observed, nll_contribution_m0: v.nll_contribution_m0, nll_contribution_m1: v.nll_contribution_m2 }])),
  });
  const decisionLabel = { PROMOTE: "M2_BEATS_M0", SHADOW_MORE_DATA: "INCONCLUSIVE", REJECT: "M2_REJECT_DEV" }[promotion.status];

  function dcTau(h, a, lambdaH, lambdaA, rho) {
    if (h === 0 && a === 0) return 1 - lambdaH * lambdaA * rho;
    if (h === 1 && a === 0) return 1 + lambdaA * rho;
    if (h === 0 && a === 1) return 1 + lambdaH * rho;
    if (h === 1 && a === 1) return 1 - rho;
    return 1;
  }

  const result = {
    league_key: leagueKey, generated_at: new Date().toISOString(), oos_dev_season: sp.oos_dev,
    manifest_hash: hash,
    coverage: { total_predictions: wf.predictions.length, m0_valid_predictions: predictions.length },
    primary: { nll_m0: nllM0, nll_m2: nllM2, delta: nllM2 - nllM0, relative_gain: relativeGain },
    marginals: { home_nll_m0: marginalHomeNllM0, home_nll_m2: marginalHomeNllM2, away_nll_m0: marginalAwayNllM0, away_nll_m2: marginalAwayNllM2 },
    secondary,
    low_score_diagnostics: lowScoreM0M2,
    bootstrap,
    promotion: { ...promotion, decision_label: decisionLabel },
  };

  const outPath = path.join(factoryDir, "score-oos-dev-report.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nEcrit: ${outPath}`);
}

main();
