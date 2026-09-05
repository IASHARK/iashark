#!/usr/bin/env node
"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 17. Orchestre, depuis le
// cache immuable DEJA collecte (aucun appel API ici) :
//   1. PLAYER_DATASET_VERSION (manifest + hash, 4 saisons)
//   2. priors bayesiens fittes EXCLUSIVEMENT sur TRAIN (2022-23)
//   3. UNE demonstration bout-en-bout sur une fixture REELLE OOS_DEV
//      (2023-24) : M2 (matrice reelle EXP-002C) -> exposition -> core
//      rate -> timing -> penalty/own-goal -> attribution -> simulation
//      -> most-probable-scorer, avec conservation de masse et
//      determinisme verifies.
// AUCUN calcul de performance OOS ici (logloss/hit-rate/calibration) -
// c'est volontairement le point d'arret (item 17 : STOP juste avant le
// premier resultat OOS). Cette demonstration ne consulte JAMAIS le
// score reel de la fixture choisie.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { readCached, isCached } = require("../lib/player-lab/raw-cache.js");
const { buildPlayerMatchRowsForFixture } = require("../lib/player-lab/build-player-match-table.js");
const { extractGoalEvents } = require("../lib/player-lab/goal-events.js");
const { buildDatasetManifest } = require("../lib/player-lab/dataset-version.js");
const { fitAllPriorsFromTrain } = require("../lib/player-lab/fit-all-priors.js");
const { splitFor } = require("../lib/player-lab/season-split.js");
const { resolvePositionGroup } = require("../lib/player-lab/position-policy.js");
const { posteriorCoreRate } = require("../lib/player-lab/core-rate-model.js");
const { applyShotsAdjustment } = require("../lib/player-lab/shots-layer.js");
const { posteriorExposure, expectedMinutesPreLineup, expectedMinutesPostLineup } = require("../lib/player-lab/exposure-model.js");
const { presenceByBinForStarter, presenceByBinForSub, presenceMassForGoal } = require("../lib/player-lab/goal-timing.js");
const { reconstructCumulativeHistoryBeforeCutoff } = require("../lib/player-lab/anti-leakage.js");
const { buildCandidateGammaParams, simulateAnytimeScorer } = require("../lib/player-lab/simulation.js");
const { teamGoalDistribution } = require("../lib/player-lab/team-goal-distribution.js");
const { selectMostProbableScorer } = require("../lib/player-lab/most-probable-scorer.js");
const { EXPERIMENT_MANIFEST_V1, manifestHash } = require("../lib/player-lab/experiment-manifest.js");
const { loadRealDataset } = require("../lib/lab/load-real-dataset.js");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");
const { predictWithRho } = require("../lib/lab/dc-matrix-with-rho.js");

const CHAMPION_RHO = -0.0845;
const SEASONS = [2021, 2022, 2023, 2024]; // JAMAIS 2025 (SEALED_UNREAD)

function loadAllRows() {
  let allRows = [], allGoalEvents = [];
  const missedPenaltiesAll = [];
  for (const season of SEASONS) {
    const fixturesPath = path.join(__dirname, "..", "data", "gate-b1", `premier-league-${season}.json`);
    const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
    for (const fx of fixtures) {
      if (!isCached("lineups", fx.fixture_id) || !isCached("players", fx.fixture_id) || !isCached("events", fx.fixture_id)) continue;
      const lineupsRaw = readCached("lineups", fx.fixture_id).raw_payload;
      const playersRaw = readCached("players", fx.fixture_id).raw_payload;
      const eventsRaw = readCached("events", fx.fixture_id).raw_payload;
      const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: fx, lineupsRaw, playersRaw, sourceHashes: {} });
      allRows = allRows.concat(rows);
      const { goalEvents, missedPenalties } = extractGoalEvents(fx, eventsRaw);
      allGoalEvents = allGoalEvents.concat(goalEvents.map((g) => ({ ...g, season })));
      missedPenaltiesAll.push(...missedPenalties.map((m) => ({ ...m, season })));
    }
  }
  return { allRows, allGoalEvents, missedPenaltiesAll };
}

function main() {
  console.log("=== 1. PLAYER_DATASET_VERSION ===");
  const manifest = buildDatasetManifest(SEASONS);
  console.log(`n_fixtures=${manifest.n_fixtures} exclusions=${manifest.exclusions.length} dataset_version=${manifest.dataset_version}`);
  fs.writeFileSync(path.join(__dirname, "..", "data", "player-lab", "dataset-manifest.json"), JSON.stringify(manifest, null, 2));

  const { allRows, allGoalEvents, missedPenaltiesAll } = loadAllRows();
  console.log(`player_match_rows=${allRows.length} goal_events=${allGoalEvents.length}`);
  const bySeasonSplit = {};
  for (const r of allRows) {
    const split = splitFor(r.season);
    bySeasonSplit[split] = (bySeasonSplit[split] || 0) + 1;
  }
  console.log("rows_by_split=" + JSON.stringify(bySeasonSplit));

  console.log("\n=== 2. Priors (TRAIN=2022-23 uniquement) ===");
  const priors = fitAllPriorsFromTrain(allRows, allGoalEvents);
  console.log(`n_train_rows=${priors.n_train_rows} n_train_goal_events=${priors.n_train_goal_events}`);
  console.log("core_rate_priors=" + JSON.stringify([...priors.core_rate_priors.entries()]));
  console.log("own_goal_rate=" + JSON.stringify(priors.own_goal_rate));
  console.log("penalty_rate=" + JSON.stringify(priors.penalty_rate));

  console.log("\n=== 3. Manifest experimental (pre-enregistre AVANT tout resultat OOS) ===");
  console.log("manifest_hash=" + manifestHash(EXPERIMENT_MANIFEST_V1));

  console.log("\n=== 4. Demonstration bout-en-bout (1 fixture reelle OOS_DEV=2023-24) ===");
  const dataset = loadRealDataset();
  const previousSeasonFixturesBySeasons = new Map();
  for (const season of dataset.oosSeasons) previousSeasonFixturesBySeasons.set(season, dataset.allFixtures.filter((f) => f.season === season - 1));
  const { predictions } = runWalkForwardM2C({ ...dataset, previousSeasonFixturesBySeasons });
  const target = predictions.find((p) => p.season === 2023 && p.m0_valid && isCached("lineups", p.fixture_id));
  if (!target) { console.log("Aucune fixture OOS_DEV eligible trouvee (cache incomplet ?) - demonstration ignoree."); return; }

  console.log(`fixture_id=${target.fixture_id} season=${target.season} split=${splitFor(target.season)}`);
  const { matrix } = predictWithRho(target.lambdaH_m2, target.lambdaA_m2, CHAMPION_RHO);
  const homeGoalDist = teamGoalDistribution(matrix, "HOME");
  const awayGoalDist = teamGoalDistribution(matrix, "AWAY");

  const fixtureMeta = dataset.allFixtures.find((f) => f.fixture_id === target.fixture_id);
  const lineupsRaw = readCached("lineups", target.fixture_id).raw_payload;
  const playersRaw = readCached("players", target.fixture_id).raw_payload;
  const { rows: targetRows } = buildPlayerMatchRowsForFixture({ fixtureMeta, lineupsRaw, playersRaw, sourceHashes: {} });

  function buildCandidatesForTeam(teamRows, teamGoalDist, mode) {
    return teamRows.map((row) => {
      const history = reconstructCumulativeHistoryBeforeCutoff(allRows.filter((r) => r.player_id === row.player_id), fixtureMeta.kickoff_timestamp);
      const goals = history.reduce((s, r) => s + (r.goals || 0), 0);
      const minutes90 = history.reduce((s, r) => s + (r.minutes || 0), 0) / 90;
      const sotHistory = history.filter((r) => r.shots_on_target != null);
      const sotTotal = sotHistory.length ? sotHistory.reduce((s, r) => s + r.shots_on_target, 0) : null;

      const group = resolvePositionGroup(row.position);
      const corePrior = priors.core_rate_priors.get(group) || priors.core_rate_priors.get("UNKNOWN") || { alpha: 1, beta: 90 };
      const core = posteriorCoreRate(goals, minutes90, corePrior);
      const convPrior = priors.conversion_priors.get(group);
      const adjustedMean = convPrior ? applyShotsAdjustment(core.mean_rate_per_90, goals, sotTotal, convPrior) : core.mean_rate_per_90;
      const gammaParams = buildCandidateGammaParams(core, adjustedMean);

      const expPrior = priors.exposure_priors.get(group) || { start_rate: 0.3, bench_enter_rate: 0.5, mean_minutes_if_starter: 80, mean_minutes_if_sub_used: 25 };
      const exposurePosterior = posteriorExposure(history, expPrior);

      let presenceMass;
      if (mode === "PRE_LINEUP") {
        const expMinutes = expectedMinutesPreLineup(exposurePosterior);
        presenceMass = presenceMassForGoal(priors.goal_timing_distribution, presenceByBinForStarter(expMinutes));
      } else {
        const knownRole = row.lineup_role;
        if (knownRole === "STARTER") {
          const expMinutes = expectedMinutesPostLineup(exposurePosterior, "STARTER");
          presenceMass = presenceMassForGoal(priors.goal_timing_distribution, presenceByBinForStarter(expMinutes));
        } else {
          const entryMinute = 90 - exposurePosterior.mean_minutes_if_sub_used;
          presenceMass = presenceMassForGoal(priors.goal_timing_distribution, presenceByBinForSub(entryMinute, exposurePosterior.p_enter_if_bench));
        }
      }

      return { player_id: row.player_id, player_name: row.player_name, gamma_alpha: gammaParams.alpha, gamma_beta: gammaParams.beta, presence_mass: presenceMass };
    });
  }

  const homeRows = targetRows.filter((r) => r.home_away === "HOME");
  const awayRows = targetRows.filter((r) => r.home_away === "AWAY");
  const seedBase = crypto.createHash("sha256").update(`${target.fixture_id}|player-scorer-v1`).digest();
  const seed = seedBase.readUInt32BE(0);

  for (const mode of ["PRE_LINEUP", "POST_LINEUP_CONDITIONAL"]) {
    const homeCandidates = buildCandidatesForTeam(homeRows, homeGoalDist, mode);
    const awayCandidates = buildCandidatesForTeam(awayRows, awayGoalDist, mode);
    const homeSim = simulateAnytimeScorer(homeCandidates, priors.own_goal_rate.own_goal_mass, homeGoalDist, 3000, seed);
    const awaySim = simulateAnytimeScorer(awayCandidates, priors.own_goal_rate.own_goal_mass, awayGoalDist, 3000, seed + 1);
    const selected = selectMostProbableScorer([...homeSim, ...awaySim]);
    const selectedRow = targetRows.find((r) => r.player_id === selected.player_id);
    console.log(`[${mode}] MOST_PROBABLE_SCORER = ${selectedRow ? selectedRow.player_name : selected.player_id} (posterior_mean=${selected.posterior_mean.toFixed(4)}, P10=${selected.p10.toFixed(4)}, P50=${selected.p50.toFixed(4)}, P90=${selected.p90.toFixed(4)})`);

    // Determinisme : rejoue et compare.
    const homeSim2 = simulateAnytimeScorer(homeCandidates, priors.own_goal_rate.own_goal_mass, homeGoalDist, 3000, seed);
    console.log(`[${mode}] determinisme (meme seed) : ${JSON.stringify(homeSim) === JSON.stringify(homeSim2) ? "PASS" : "FAIL"}`);
  }

  console.log("\nSTOP - aucun resultat OOS (logloss/hit-rate/calibration) calcule dans ce script.");
}

main();
