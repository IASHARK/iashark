#!/usr/bin/env node
"use strict";
// SCORE_LAB_FACTORY_V2 - Phase 5 (2026-09-06). Test de fidelite
// offline/live, GENERIQUE. Ne s'applique qu'a une ligue deja
// VALIDATED (holdout deja consomme, aucun nouveau fetch ici).
//
// Verifie que lib/score-lab-factory-v2/canonical-champion-loader.js
// (l'interface que la production utilisera pour charger le champion)
// reproduit EXACTEMENT le NLL holdout deja gele dans
// holdout-validation-report.json, quand ses parametres sont rejoues
// dans les memes runners (lib/lab/walkforward-*). Aucun nouveau calcul
// scientifique : une verification d'integrite d'interface.
//
// Usage : node scripts/score-lab-v2-fidelity-test.js --league=<key>

const fs = require("fs");
const path = require("path");
const { runWalkForward } = require("../lib/lab/walkforward-runner.js");
const { runWalkForwardM2R } = require("../lib/lab/walkforward-m2r-runner.js");
const { exactScoreNLL } = require("../lib/lab/metrics.js");
const { loadCanonicalScoreChampion } = require("../lib/score-lab-factory-v2/canonical-champion-loader.js");

function parseArgs() { const args = {}; for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; } return args; }
function loadLeagueConfig(leagueKey) { const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8")); return config.leagues.find((l) => l.key === leagueKey); }
function loadFixtures(leagueKey, season) { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8")).map((f) => ({ ...f, season })); }

function recomputeViaLoadedChampion(leagueKey, league, champion) {
  const sp = league.seasonSplit;
  const holdoutSeason = sp.sealed_unread;
  const championIsM2 = champion.model_id === "M2";
  const championIsB0 = champion.model_id === "B0";

  const warmup = loadFixtures(leagueKey, sp.warmup);
  const train = loadFixtures(leagueKey, sp.train);
  const oosDev = loadFixtures(leagueKey, sp.oos_dev);
  const oosFinal = loadFixtures(leagueKey, sp.oos_final);
  const holdout = loadFixtures(leagueKey, holdoutSeason);
  const allFixtures = [...warmup, ...train, ...oosDev, ...oosFinal, ...holdout];
  const trainSeasons = [sp.warmup, sp.train, sp.oos_dev, sp.oos_final];

  let predictions;
  if (championIsM2) {
    const previousSeasonFixturesBySeasons = new Map([[holdoutSeason, oosFinal]]);
    const wf = runWalkForwardM2R({ allFixtures, trainSeasons, oosSeasons: [holdoutSeason], leagueId: league.apiFootballId, leagueAvgH: champion.league_avg_h, leagueAvgA: champion.league_avg_a, previousSeasonFixturesBySeasons, championRho: champion.rho });
    predictions = wf.predictions.filter((p) => p.m0_valid).map((p) => ({ fixture_id: p.fixture_id, cutoff: p.cutoff, lambdaH: p.lambdaH_m2, lambdaA: p.lambdaA_m2, h: p.goals_home_90, a: p.goals_away_90, rho: champion.rho }));
  } else {
    const rhoUsed = championIsB0 ? 0 : champion.rho;
    const constantRhoFitter = () => ({ rho_hat: rhoUsed, convergence: true, on_boundary: false });
    const wf = runWalkForward({ allFixtures, trainSeasons, oosSeasons: [holdoutSeason], championRho: rhoUsed, candidateRhoFitter: constantRhoFitter, leagueAvgH: champion.league_avg_h, leagueAvgA: champion.league_avg_a, leagueId: league.apiFootballId });
    predictions = wf.predictions.map((p) => ({ fixture_id: p.fixture_id, cutoff: p.cutoff, lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rho: rhoUsed }));
  }

  const nll = exactScoreNLL(predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho })));
  return { n_predictions: predictions.length, nll_via_loader: nll };
}

function main() {
  const args = parseArgs();
  const leagueKey = args.league;
  if (!leagueKey) { console.error("Usage: node scripts/score-lab-v2-fidelity-test.js --league=<key>"); process.exit(1); }

  const loaded = loadCanonicalScoreChampion(leagueKey);
  if (!loaded.available) {
    console.error(`FIDELITY_STATUS=SKIPPED_NOT_VALIDATED (${loaded.reason})`);
    process.exit(1);
  }

  const league = loadLeagueConfig(leagueKey);
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey, "score-lab-factory-v2");
  const frozenReport = JSON.parse(fs.readFileSync(path.join(factoryDir, "holdout-validation-report.json"), "utf8"));

  const { n_predictions, nll_via_loader } = recomputeViaLoadedChampion(leagueKey, league, loaded.champion);
  const nllFrozen = frozenReport.gates.EXACT_SCORE_NLL.nll_holdout;
  const delta = Math.abs(nll_via_loader - nllFrozen);
  const fidelityPass = delta < 1e-9;

  const report = {
    protocol: "SCORE_LAB_FACTORY_V2",
    phase: "5_OFFLINE_LIVE_FIDELITY",
    league_key: leagueKey,
    generated_at: new Date().toISOString(),
    champion_via_loader: loaded.champion,
    n_predictions_via_loader: n_predictions,
    nll_via_loader,
    nll_frozen_holdout_report: nllFrozen,
    delta,
    fidelity_status: fidelityPass ? "PASS" : "FAIL",
  };
  const outPath = path.join(factoryDir, "fidelity-check.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("\nEcrit: " + outPath);
  if (!fidelityPass) process.exit(1);
}

if (require.main === module) main();

module.exports = { recomputeViaLoadedChampion };
