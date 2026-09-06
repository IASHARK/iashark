#!/usr/bin/env node
"use strict";
// SCORE_LAB_FACTORY_V2 - Phase A (2026-09-06). CHAMPION_SELECTION
// GENERIQUE : accepte --league=<key>, applique EXACTEMENT le meme
// protocole quelle que soit la ligue (lib/score-lab-factory-v2/*).
// N'accede jamais a oos_final ni sealed_unread - uniquement
// warmup+train/oos_dev (deja ouverts par la Factory V1).
//
// Usage : node scripts/score-lab-v2-champion-selection.js --league=ligue1

const fs = require("fs");
const path = require("path");
const { computeB0AndM0, computeM2 } = require("../lib/score-lab-factory-v2/candidates.js");
const { selectChampion } = require("../lib/score-lab-factory-v2/champion-selection.js");
const { MIN_CONVERGENCE_RATE, MAX_BOUNDARY_HIT_RATE, MAX_RHO_STD, MAX_SECONDARY_DEGRADATION } = require("../lib/promotion.js");

function parseArgs() { const args = {}; for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; } return args; }
function loadLeagueConfig(leagueKey) { const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8")); return config.leagues.find((l) => l.key === leagueKey); }
function loadFixtures(leagueKey, season) { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8")).map((f) => ({ ...f, season })); }

function main() {
  const args = parseArgs();
  const leagueKey = args.league || args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/score-lab-v2-champion-selection.js --league=<key>"); process.exit(1); }

  const league = loadLeagueConfig(leagueKey);
  if (!league) { console.error(`Ligue inconnue dans config/league-expansion.json: ${leagueKey}`); process.exit(1); }
  const sp = league.seasonSplit;
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);

  // rho gele : reutilise EXACTEMENT le rho deja fitte sur WARMUP+TRAIN par
  // la Factory V1 (scripts/fit-score-lab-preoss.js, jamais refitte ici).
  const { manifest: oosManifest } = JSON.parse(fs.readFileSync(path.join(factoryDir, "score-oos-manifest.json"), "utf8"));
  const preossManifest = JSON.parse(fs.readFileSync(path.join(factoryDir, "score-lab-preoss.json"), "utf8"));
  const rhoFrozen = oosManifest.rho.final_value;
  const leagueAvgH = oosManifest.league_averages.leagueAvgH;
  const leagueAvgA = oosManifest.league_averages.leagueAvgA;

  const warmup = loadFixtures(leagueKey, sp.warmup);
  const train = loadFixtures(leagueKey, sp.train);
  const oosDev = loadFixtures(leagueKey, sp.oos_dev);
  const allFixtures = [...warmup, ...train, ...oosDev];

  const b0m0 = computeB0AndM0({ allFixtures, trainSeasons: [sp.warmup, sp.train], oosSeasons: [sp.oos_dev], leagueId: league.apiFootballId, leagueAvgH, leagueAvgA, rhoFrozen });
  const previousSeasonFixturesBySeasons = new Map([[sp.oos_dev, train]]);
  const m2 = computeM2({ allFixtures, trainSeasons: [sp.warmup, sp.train], oosSeasons: [sp.oos_dev], leagueId: league.apiFootballId, leagueAvgH, leagueAvgA, rhoFrozen, previousSeasonFixturesBySeasons });

  const structuralHealth = { convergence_rate: preossManifest.convergence_rate, boundary_hit_rate: preossManifest.boundary_hit_rate, rho_std: preossManifest.rho_across_train_cutoffs.std };
  const candidates = {
    B0: { nll: b0m0.B0.nll, secondary: b0m0.B0.secondary, n_oos: b0m0.B0.n_oos, structural: { convergence_rate: 1, boundary_hit_rate: 0, rho_std: 0 } },
    M0: { nll: b0m0.M0.nll, secondary: b0m0.M0.secondary, n_oos: b0m0.M0.n_oos, structural: structuralHealth },
    M2: { nll: m2.nll, secondary: m2.secondary, n_oos: m2.n_oos, structural: structuralHealth },
  };

  const thresholds = { MIN_CONVERGENCE_RATE, MAX_BOUNDARY_HIT_RATE, MAX_RHO_STD, MAX_SECONDARY_DEGRADATION };
  const selection = selectChampion(candidates, thresholds);

  const result = {
    protocol: "SCORE_LAB_FACTORY_V2",
    phase: "A_CHAMPION_SELECTION",
    league_key: leagueKey,
    generated_at: new Date().toISOString(),
    train_seasons: [sp.warmup, sp.train],
    oos_dev_season: sp.oos_dev,
    rho_frozen: rhoFrozen,
    league_avg_h: leagueAvgH,
    league_avg_a: leagueAvgA,
    candidates: {
      B0: { nll: candidates.B0.nll, secondary: candidates.B0.secondary, n_oos: candidates.B0.n_oos, structural: candidates.B0.structural },
      M0: { nll: candidates.M0.nll, secondary: candidates.M0.secondary, n_oos: candidates.M0.n_oos, structural: candidates.M0.structural },
      M2: { nll: candidates.M2.nll, secondary: candidates.M2.secondary, n_oos: candidates.M2.n_oos, structural: candidates.M2.structural },
    },
    ...selection,
  };

  const outDir = path.join(factoryDir, "score-lab-factory-v2");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "champion-selection.json");
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  // Predictions completes (avec cutoff/fixture_id) conservees a part pour
  // la Phase B (freeze du contrat), jamais recalculees deux fois.
  const predictionsPath = path.join(outDir, "champion-oos-dev-predictions.json");
  const championKey = selection.champion_selected;
  const championPredictions = championKey === "B0" ? b0m0.B0.predictions : championKey === "M0" ? b0m0.M0.predictions : championKey === "M2" ? m2.predictions : null;
  if (championPredictions) fs.writeFileSync(predictionsPath, JSON.stringify(championPredictions));

  console.log(JSON.stringify(result, null, 2));
  console.log("\nEcrit: " + outPath);
  if (championPredictions) console.log("Ecrit: " + predictionsPath);
}

main();
