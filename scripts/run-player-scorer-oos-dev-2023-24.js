#!/usr/bin/env node
"use strict";
// PLAYER SCORER OOS_DEV 2023-24 (2026-09-05). PREMIERE mesure de
// performance hors-echantillon pour la comparaison A/B/C/D. AUCUN refit,
// AUCUNE modification de formule, AUCUN tuning apres resultat.
//
// Inputs geles utilises tels quels :
//   HEAD pre-OOS       = 4c8c6d55d4ded19815436b5bfdf5a67077eec52b
//   Manifest V2        = 30d008bffc947797854e4fca82f3ec0c61d87b1013e9bf334c47ebd0ee9b3c2d
//   Dataset (4 saisons)= c47b5a72ae0daf64a19f6f27abbc4810086c6632a4d6b1d2ab4fe5f0fdeed02b
//   Ridge V2           = 0.1
//
// A. SHRUNK_GOALS90_BASELINE   (lib/player-lab/baselines.js#baselineA_simpleShrunkRate)
// B. LEGACY_PLAYER_ENGINE      (lib/markets/player-engine.js#buildPlayerMarketOutput)
// C. PLAYER_SCORER_V1_AGGREGATED_SHARE (lib/player-lab/simulation.js)
// D. PLAYER_SCORER_V2_COMPETING_RISKS  (lib/player-lab/v2/simulation-v2.js)
// Support commun : POST_LINEUP uniquement (PRE_LINEUP jamais compare ici).
//
// 2024-25 : AUCUNE ligne, AUCUN evenement, AUCUN score de cette saison
// n'est charge dans ce script (SEASONS_FOR_HISTORY s'arrete a 2023).
//
// Les priors/fits TRAIN (V1 fitAllPriorsFromTrain, V2 Newton theta +
// player-effects + goal-clock + substitution + penalty + own-goal) sont
// RECALCULES ici depuis le meme cache immuable TRAIN=2022 (deterministe,
// donc identiques aux valeurs deja rapportees au commit 4c8c6d55) -
// ceci n'est PAS un refit : aucune donnee 2023-24 n'entre dans ce
// calcul, c'est l'application mecanique du modele deja fige. Seules les
// features POINT-IN-TIME (historique cumule par joueur, walk-forward
// STRICTEMENT anterieur a chaque fixture) varient d'une fixture 2023-24
// a l'autre - c'est la definition meme d'une evaluation walk-forward,
// pas un ajustement de parametre.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { readCached, isCached } = require("../lib/player-lab/raw-cache.js");
const { buildPlayerMatchRowsForFixture } = require("../lib/player-lab/build-player-match-table.js");
const { extractGoalEvents } = require("../lib/player-lab/goal-events.js");
const { resolvePositionGroup } = require("../lib/player-lab/position-policy.js");
const { reconstructCumulativeHistoryBeforeCutoff } = require("../lib/player-lab/anti-leakage.js");
const { fitAllPriorsFromTrain } = require("../lib/player-lab/fit-all-priors.js");
const { posteriorCoreRate } = require("../lib/player-lab/core-rate-model.js");
const { applyShotsAdjustment } = require("../lib/player-lab/shots-layer.js");
const { posteriorExposure, expectedMinutesPostLineup } = require("../lib/player-lab/exposure-model.js");
const { presenceByBinForStarter, presenceByBinForSub, presenceMassForGoal } = require("../lib/player-lab/goal-timing.js");
const { buildCandidateGammaParams, simulateAnytimeScorer } = require("../lib/player-lab/simulation.js");
const { teamGoalDistribution } = require("../lib/player-lab/team-goal-distribution.js");
const { baselineA_simpleShrunkRate } = require("../lib/player-lab/baselines.js");
const { buildPlayerMarketOutput } = require("../lib/markets/player-engine.js");
const { buildDatasetManifest } = require("../lib/player-lab/dataset-version.js");
const { loadRealDataset } = require("../lib/lab/load-real-dataset.js");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");
const { predictWithRho } = require("../lib/lab/dc-matrix-with-rho.js");

const { fitGoalRatePriors, posteriorGoalRate, fitShotRatePriors, posteriorShotRate, fitSotConversionPriors, posteriorSotConversion, logit, EPS } = require("../lib/player-lab/v2/rate-priors.js");
const { buildRiskSetForGoal } = require("../lib/player-lab/v2/risk-set.js");
const { designVector, fitRelativeRiskModel, recoverCanonicalAlpha, DEFAULT_REFERENCE_CATEGORY, POSITION_ORDER: V2_POSITION_ORDER } = require("../lib/player-lab/v2/relative-risk-model.js");
const { fitPlayerEffects, playerEffect } = require("../lib/player-lab/v2/player-effects.js");
const { fitGoalClock } = require("../lib/player-lab/v2/goal-clock.js");
const { fitSubstitutionModel } = require("../lib/player-lab/v2/substitution-model.js");
const { fitPenaltyTakerCounts } = require("../lib/player-lab/v2/penalty-model.js");
const { fitOwnGoalRate: fitOwnGoalRateV2 } = require("../lib/player-lab/v2/own-goal-model.js");
const { simulateMatchV2 } = require("../lib/player-lab/v2/simulation-v2.js");
const { EXPERIMENT_MANIFEST_V2, manifestHashV2 } = require("../lib/player-lab/v2/experiment-manifest-v2.js");

const { isoWeekKey, mean, pairedBlockBootstrapDelta, calibrationInterceptSlope, reliabilityBins, expectedCalibrationError, sha256Hex } = require("../lib/player-lab/oos-eval-metrics.js");

const CHAMPION_RHO = -0.0845;
const HISTORY_SEASONS_FOR_V2_FIT = [2021, 2022];
const SEASONS_FOR_HISTORY = [2021, 2022, 2023]; // JAMAIS 2024/2025
const OOS_DEV_SEASON = 2023;
const EXPECTED_HEAD_SHA = "4c8c6d55d4ded19815436b5bfdf5a67077eec52b";
const EXPECTED_MANIFEST_HASH_V2 = "30d008bffc947797854e4fca82f3ec0c61d87b1013e9bf334c47ebd0ee9b3c2d";
const EXPECTED_DATASET_VERSION = "c47b5a72ae0daf64a19f6f27abbc4810086c6632a4d6b1d2ab4fe5f0fdeed02b";
const RIDGE_EXPECTED = 0.1;
const N_DRAWS_V2 = 10000;
const N_DRAWS_V1 = 3000;
const N_BOOTSTRAP_REPS = 10000;

function loadFixturesMeta(season) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `premier-league-${season}.json`), "utf8"));
}

// ============================================================
// 0. INPUTS GELES - verification de coherence (aucune tolerance de derive)
// ============================================================
function verifyFrozenInputs() {
  console.log("=== 0. Verification des inputs geles ===");
  const manifestHash = manifestHashV2(EXPERIMENT_MANIFEST_V2);
  console.log(`manifest_hash_v2 recalcule=${manifestHash} attendu=${EXPECTED_MANIFEST_HASH_V2} match=${manifestHash === EXPECTED_MANIFEST_HASH_V2}`);
  const datasetManifest = buildDatasetManifest([2021, 2022, 2023, 2024]);
  console.log(`dataset_version recalcule=${datasetManifest.dataset_version} attendu=${EXPECTED_DATASET_VERSION} match=${datasetManifest.dataset_version === EXPECTED_DATASET_VERSION}`);
  console.log(`ridge attendu=${RIDGE_EXPECTED}`);
  return { manifestHash, datasetManifest };
}

// ============================================================
// 1. Chargement historique partage (2021-2023 UNIQUEMENT, jamais 2024/2025)
// ============================================================
function loadSharedHistory() {
  const rowsByPlayer = new Map(); // player_id -> [{kickoff, season, position, minutes, lineup_role, goals, open_play_goals, shots, shots_on_target}]
  const fixtureRawByFixtureId = new Map();
  const allRowsFlat = [];
  const allGoalEventsFlat = [];

  for (const season of SEASONS_FOR_HISTORY) {
    const fixtures = loadFixturesMeta(season).map((f) => ({ ...f, season }));
    for (const fx of fixtures) {
      if (!isCached("lineups", fx.fixture_id) || !isCached("players", fx.fixture_id) || !isCached("events", fx.fixture_id)) continue;
      const lineupsRaw = readCached("lineups", fx.fixture_id).raw_payload;
      const playersRaw = readCached("players", fx.fixture_id).raw_payload;
      const eventsRaw = readCached("events", fx.fixture_id).raw_payload;
      fixtureRawByFixtureId.set(fx.fixture_id, { fixtureMeta: fx, lineupsRaw, playersRaw, eventsRaw });

      const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: fx, lineupsRaw, playersRaw, sourceHashes: {} });
      const { goalEvents } = extractGoalEvents(fx, eventsRaw);
      allGoalEventsFlat.push(...goalEvents.map((g) => ({ ...g, season })));
      const openPlayGoalsByPlayer = new Map();
      for (const g of goalEvents) {
        if (g.own_goal_flag || g.penalty_flag || g.player_id == null) continue;
        openPlayGoalsByPlayer.set(g.player_id, (openPlayGoalsByPlayer.get(g.player_id) || 0) + 1);
      }
      for (const row of rows) {
        allRowsFlat.push(row);
        if (!rowsByPlayer.has(row.player_id)) rowsByPlayer.set(row.player_id, []);
        rowsByPlayer.get(row.player_id).push({
          ...row,
          open_play_goals: openPlayGoalsByPlayer.get(row.player_id) || 0,
        });
      }
    }
  }
  for (const rows of rowsByPlayer.values()) rows.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  return { rowsByPlayer, fixtureRawByFixtureId, allRowsFlat, allGoalEventsFlat };
}

// ============================================================
// 2a. Fit V1 (fitAllPriorsFromTrain, TRAIN=2022 uniquement, deterministe)
// ============================================================
function fitV1(allRowsFlat, allGoalEventsFlat) {
  return fitAllPriorsFromTrain(allRowsFlat, allGoalEventsFlat);
}

// ============================================================
// 2b. Fit V2 (replique EXACTE de scripts/build-player-scorer-v2.js
// sections 1-10, HISTORY_SEASONS=[2021,2022] uniquement - AUCUNE donnee
// 2023-24 dans ce fit).
// ============================================================
function fitV2() {
  const historyFixtures = HISTORY_SEASONS_FOR_V2_FIT.flatMap((s) => loadFixturesMeta(s).map((f) => ({ ...f, season: s })));
  const rowsByPlayer = new Map();
  const fixtureRawByFixtureId = new Map();

  for (const fx of historyFixtures) {
    if (!isCached("lineups", fx.fixture_id) || !isCached("players", fx.fixture_id) || !isCached("events", fx.fixture_id)) continue;
    const lineupsRaw = readCached("lineups", fx.fixture_id).raw_payload;
    const playersRaw = readCached("players", fx.fixture_id).raw_payload;
    const eventsRaw = readCached("events", fx.fixture_id).raw_payload;
    fixtureRawByFixtureId.set(fx.fixture_id, { fixtureMeta: fx, lineupsRaw, playersRaw, eventsRaw });
    const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: fx, lineupsRaw, playersRaw, sourceHashes: {} });
    const { goalEvents } = extractGoalEvents(fx, eventsRaw);
    const openPlayGoalsByPlayer = new Map();
    for (const g of goalEvents) {
      if (g.own_goal_flag || g.penalty_flag || g.player_id == null) continue;
      openPlayGoalsByPlayer.set(g.player_id, (openPlayGoalsByPlayer.get(g.player_id) || 0) + 1);
    }
    for (const row of rows) {
      if (!rowsByPlayer.has(row.player_id)) rowsByPlayer.set(row.player_id, []);
      rowsByPlayer.get(row.player_id).push({
        kickoff: fx.kickoff_timestamp, season: fx.season, position: row.position, minutes: row.minutes,
        open_play_goals: openPlayGoalsByPlayer.get(row.player_id) || 0,
        shots: row.shots, shots_on_target: row.shots_on_target,
      });
    }
  }
  for (const rows of rowsByPlayer.values()) rows.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  const trainOnlyRows = [];
  for (const [, rows] of rowsByPlayer) for (const r of rows) if (r.season === 2022) trainOnlyRows.push(r);
  const goalRatePriors = fitGoalRatePriors(trainOnlyRows, resolvePositionGroup);
  const shotRatePriors = fitShotRatePriors(trainOnlyRows, resolvePositionGroup);
  const sotPriors = fitSotConversionPriors(trainOnlyRows, resolvePositionGroup);

  function pointInTimeFeatures(playerId, cutoffIso) {
    const history = (rowsByPlayer.get(playerId) || []).filter((r) => new Date(r.kickoff).getTime() < new Date(cutoffIso).getTime());
    const position = history.length ? history[history.length - 1].position : "UNKNOWN";
    const group = resolvePositionGroup(position);
    const openPlayGoals = history.reduce((s, r) => s + r.open_play_goals, 0);
    const minutes90 = history.reduce((s, r) => s + r.minutes, 0) / 90;
    const gPrior = goalRatePriors.get(group) || { alpha: 0.1, beta: 10, mean_rate_per_90: 0.01 };
    const goalPosterior = posteriorGoalRate(openPlayGoals, minutes90, gPrior);
    const xGoal = Math.log(goalPosterior.mean + EPS);
    const shotsHistory = history.filter((r) => r.shots != null);
    const shotsObserved = shotsHistory.reduce((s, r) => s + r.shots, 0);
    const minutes90Shots = shotsHistory.reduce((s, r) => s + r.minutes, 0) / 90;
    const sPrior = shotRatePriors.get(group) || { alpha: 0.1, beta: 10, mean_rate_per_90: 0.5 };
    const shotPosterior = posteriorShotRate(shotsObserved, minutes90Shots, sPrior);
    const xShot = Math.log(shotPosterior.mean + EPS);
    const bothHistory = history.filter((r) => r.shots != null && r.shots_on_target != null);
    const sotObserved = bothHistory.length ? bothHistory.reduce((s, r) => s + r.shots_on_target, 0) : null;
    const shotsForSot = bothHistory.length ? bothHistory.reduce((s, r) => s + r.shots, 0) : null;
    const sotPrior = sotPriors.get(group) || { a: 1, b: 1, mean_conversion: 0.35 };
    const sotPosterior = posteriorSotConversion(sotObserved, shotsForSot, sotPrior);
    const xSot = logit(sotPosterior ? sotPosterior.mean : sotPrior.mean_conversion);
    return { group, xGoal, xShot, xSot };
  }

  const trainFixtures2022 = loadFixturesMeta(2022);
  const nrEvents = [];
  const substitutionEntries = [];
  const penaltyAttempts = [];
  const ownGoalEventsTrain = [];
  const goalClockHomeEvents = [], goalClockAwayEvents = [];
  const residualsByPlayer = new Map();

  for (const fx of trainFixtures2022) {
    if (!fixtureRawByFixtureId.has(fx.fixture_id)) continue;
    const { lineupsRaw, eventsRaw } = fixtureRawByFixtureId.get(fx.fixture_id);
    const lineupTeams = (lineupsRaw && lineupsRaw.response) || [];
    if (lineupTeams.length !== 2) continue;
    const events = (eventsRaw && eventsRaw.response) || [];
    const { goalEvents, missedPenalties } = extractGoalEvents(fx, eventsRaw);
    ownGoalEventsTrain.push(...goalEvents);

    for (const lineupTeam of lineupTeams) {
      const teamId = lineupTeam.team.id;
      const startingXI = (lineupTeam.startXI || []).map((p) => p.player.id);
      const teamEvents = events.filter((e) => e.team && e.team.id === teamId);
      const substOut = teamEvents.filter((e) => e.type === "subst");
      substitutionEntries.push({
        n_substitutions: substOut.length,
        minutes: substOut.map((e) => e.time.elapsed + (e.time.extra || 0)),
        outPositions: substOut.map((e) => resolvePositionGroup((lineupTeam.startXI || []).concat(lineupTeam.substitutes || []).find((p) => p.player.id === (e.player && e.player.id))?.player?.pos)),
        inPositions: substOut.map((e) => resolvePositionGroup((lineupTeam.substitutes || []).find((p) => p.player.id === (e.assist && e.assist.id))?.player?.pos)),
      });
      const teamGoals = goalEvents.filter((g) => g.team_id === teamId);
      for (const g of teamGoals) {
        if (g.own_goal_flag) continue;
        const riskSet = buildRiskSetForGoal(startingXI, teamEvents, g.minute);
        if (g.penalty_flag) { if (g.player_id != null) penaltyAttempts.push({ team_id: teamId, player_id: g.player_id }); continue; }
        if (g.player_id == null || !riskSet.has(g.player_id)) continue;
        const riskSetIds = [...riskSet];
        const riskSetRawFeatures = riskSetIds.map((pid) => pointInTimeFeatures(pid, fx.kickoff_timestamp));
        const designVectors = riskSetRawFeatures.map((feat) => designVector(feat.group, feat.xGoal, feat.xShot, feat.xSot));
        nrEvents.push({ riskSetDesignVectors: designVectors, scorerIndex: riskSetIds.indexOf(g.player_id), riskSetIds });
        if (teamId === fx.home_team_id) goalClockHomeEvents.push(g); else goalClockAwayEvents.push(g);
      }
    }
    for (const m of missedPenalties) if (m.player_id != null) penaltyAttempts.push({ team_id: m.team_id, player_id: m.player_id });
  }

  const fit = fitRelativeRiskModel(nrEvents, 100);

  const minutes90ByPlayerTrain = new Map();
  for (const [playerId, rows] of rowsByPlayer) {
    const trainMinutes = rows.filter((r) => r.season === 2022).reduce((s, r) => s + r.minutes, 0);
    if (trainMinutes > 0) minutes90ByPlayerTrain.set(playerId, trainMinutes / 90);
  }
  for (const e of nrEvents) {
    const scores = e.riskSetDesignVectors.map((x) => x.reduce((s, v, i) => s + v * fit.theta[i], 0));
    const max = Math.max(...scores);
    const exps = scores.map((s) => Math.exp(s - max));
    const sum = exps.reduce((a, b) => a + b, 0);
    const probs = exps.map((v) => v / sum);
    e.riskSetIds.forEach((pid, i) => {
      if (!residualsByPlayer.has(pid)) residualsByPlayer.set(pid, { observedGoals: 0, expectedGoals: 0, exposureMinutes90: minutes90ByPlayerTrain.get(pid) || 0 });
      const r = residualsByPlayer.get(pid);
      r.expectedGoals += probs[i];
      if (i === e.scorerIndex) r.observedGoals += 1;
    });
  }
  const playerEffects = fitPlayerEffects(residualsByPlayer);
  const goalClockHome = fitGoalClock(goalClockHomeEvents);
  const goalClockAway = fitGoalClock(goalClockAwayEvents);
  const substitutionModel = fitSubstitutionModel(substitutionEntries);
  const penaltyTakerCounts = fitPenaltyTakerCounts(penaltyAttempts);
  const ownGoalRate = fitOwnGoalRateV2(ownGoalEventsTrain);
  const totalGoalsTrain = ownGoalEventsTrain.length;
  const penaltyGoalsTrain = ownGoalEventsTrain.filter((g) => g.penalty_flag).length;
  const omegaPen = totalGoalsTrain > 0 ? penaltyGoalsTrain / totalGoalsTrain : 0;
  const canonicalAlpha = recoverCanonicalAlpha(fit.theta, V2_POSITION_ORDER, DEFAULT_REFERENCE_CATEGORY);

  return { fit, canonicalAlpha, playerEffects, goalClockHome, goalClockAway, substitutionModel, penaltyTakerCounts, ownGoalRate, omegaPen, pointInTimeFeatures };
}

function main() {
  const startedAt = Date.now();
  verifyFrozenInputs();

  console.log("\n=== 1. Historique partage (2021-2023 uniquement) ===");
  const { rowsByPlayer: sharedRowsByPlayer, fixtureRawByFixtureId, allRowsFlat, allGoalEventsFlat } = loadSharedHistory();
  console.log(`joueurs indexes=${sharedRowsByPlayer.size} rows=${allRowsFlat.length} goal_events=${allGoalEventsFlat.length}`);

  console.log("\n=== 2. Fits geles (V1 + V2, TRAIN=2022 uniquement) ===");
  const v1Priors = fitV1(allRowsFlat, allGoalEventsFlat);
  console.log(`V1 n_train_rows=${v1Priors.n_train_rows} n_train_goal_events=${v1Priors.n_train_goal_events} own_goal_mass=${v1Priors.own_goal_rate.own_goal_mass.toFixed(4)} penalty_mass=${v1Priors.penalty_rate.penalty_mass_share != null ? v1Priors.penalty_rate.penalty_mass_share.toFixed(4) : JSON.stringify(v1Priors.penalty_rate)}`);
  const v2 = fitV2();
  console.log(`V2 theta=${JSON.stringify(v2.fit.theta.map((t) => Number(t.toFixed(4))))} converged=${v2.fit.converged}`);

  // Prior global (toutes positions) pour baseline A - derive de TRAIN, jamais invente.
  const trainRowsForLeagueMean = allRowsFlat.filter((r) => r.season === 2022);
  const leagueMeanRatePer90 = (() => {
    const goals = trainRowsForLeagueMean.reduce((s, r) => s + (r.goals || 0), 0);
    const minutes90 = trainRowsForLeagueMean.reduce((s, r) => s + (r.minutes || 0), 0) / 90;
    return minutes90 > 0 ? goals / minutes90 : 0.05;
  })();
  console.log(`league_mean_rate_per_90 (TRAIN)=${leagueMeanRatePer90.toFixed(4)}`);

  // Moyenne ligue de buts par equipe et par match (TRAIN) - pour le
  // teamAttackMultiplier de la baseline B (legacy engine). Choix
  // documente : opponentDefenseMultiplier=1 (neutre) car le lambda M2
  // du match integre DEJA la force defensive de l'adversaire specifique
  // - l'appliquer une seconde fois via un multiplicateur separe
  // compterait deux fois le meme effet.
  const trainFixtures2022Meta = loadFixturesMeta(2022);
  const leagueMeanGoalsPerTeamPerMatch = (() => {
    let sum = 0, n = 0;
    for (const fx of trainFixtures2022Meta) {
      if (fx.goals_home_90 == null || fx.goals_away_90 == null) continue;
      sum += fx.goals_home_90 + fx.goals_away_90; n += 2;
    }
    return n > 0 ? sum / n : 1.4;
  })();
  console.log(`league_mean_goals_per_team_per_match (TRAIN)=${leagueMeanGoalsPerTeamPerMatch.toFixed(4)}`);

  console.log("\n=== 3. Walk-forward M2 (Score Engine champion, deja fige) ===");
  const dataset = loadRealDataset();
  const previousSeasonFixturesBySeasons = new Map();
  for (const season of dataset.oosSeasons) previousSeasonFixturesBySeasons.set(season, dataset.allFixtures.filter((f) => f.season === season - 1));
  const { predictions } = runWalkForwardM2C({ ...dataset, previousSeasonFixturesBySeasons });
  const targets = predictions.filter((p) => p.season === OOS_DEV_SEASON && p.m0_valid && isCached("lineups", p.fixture_id) && isCached("players", p.fixture_id) && isCached("events", p.fixture_id));
  console.log(`fixtures OOS_DEV 2023-24 total=${predictions.filter((p) => p.season === OOS_DEV_SEASON).length} m0_valid+cached=${targets.length}`);

  // ============================================================
  // 4. Boucle principale : pour chaque fixture, chaque joueur, chaque modele
  // ============================================================
  console.log("\n=== 4. Evaluation A/B/C/D sur chaque fixture OOS_DEV (POST_LINEUP) ===");
  const perRowRecords = []; // { fixture_id, iso_week, team_id, player_id, player_name, position_group, home_away, lineup_role, y, pA, pB, pC, pD }
  const scorerSelectionRowsByModel = { A: [], B: [], C: [], D: [] };
  const attributionRowsV2 = []; // { true_scorer_probability } pour goal attribution NLL (V2, buts non-penalty/non-own reconcilies)
  const attributionRowsV1 = [];
  let numericalNaN = 0, numericalInf = 0, massConservationFailures = 0, determinismFailures = 0;
  let coverageA = 0, coverageB = 0, coverageC = 0, coverageD = 0, totalPlayerRows = 0;
  let fixturesCovered = 0;

  for (const target of targets) {
    const fixtureMeta = dataset.allFixtures.find((f) => f.fixture_id === target.fixture_id);
    if (!fixtureMeta) continue;
    const cached = fixtureRawByFixtureId.get(target.fixture_id);
    if (!cached) continue; // devrait toujours etre present (deja verifie isCached ci-dessus) - garde defensive
    const { lineupsRaw, playersRaw, eventsRaw } = cached;
    const lineupTeams = (lineupsRaw && lineupsRaw.response) || [];
    if (lineupTeams.length !== 2) continue;
    const { rows: targetRows } = buildPlayerMatchRowsForFixture({ fixtureMeta, lineupsRaw, playersRaw, sourceHashes: {} });
    if (!targetRows.length) continue;
    const { goalEvents } = extractGoalEvents(fixtureMeta, eventsRaw);
    const nonOwnScorers = new Set(goalEvents.filter((g) => !g.own_goal_flag && g.player_id != null).map((g) => g.player_id));
    fixturesCovered++;

    const { matrix } = predictWithRho(target.lambdaH_m2, target.lambdaA_m2, CHAMPION_RHO);
    const homeGoalDist = teamGoalDistribution(matrix, "HOME");
    const awayGoalDist = teamGoalDistribution(matrix, "AWAY");
    const isoWeek = isoWeekKey(fixtureMeta.kickoff_timestamp);

    // ---- Model C (V1 AGGREGATED_SHARE) ----
    function buildV1CandidatesForTeam(teamRows) {
      return teamRows.map((row) => {
        const history = reconstructCumulativeHistoryBeforeCutoff(sharedRowsByPlayer.get(row.player_id) || [], fixtureMeta.kickoff_timestamp);
        const goals = history.reduce((s, r) => s + (r.goals || 0), 0);
        const minutes90 = history.reduce((s, r) => s + (r.minutes || 0), 0) / 90;
        const sotHistory = history.filter((r) => r.shots_on_target != null);
        const sotTotal = sotHistory.length ? sotHistory.reduce((s, r) => s + r.shots_on_target, 0) : null;
        const group = resolvePositionGroup(row.position);
        const corePrior = v1Priors.core_rate_priors.get(group) || v1Priors.core_rate_priors.get("UNKNOWN") || { alpha: 1, beta: 90 };
        const core = posteriorCoreRate(goals, minutes90, corePrior);
        const convPrior = v1Priors.conversion_priors.get(group);
        const adjustedMean = convPrior ? applyShotsAdjustment(core.mean_rate_per_90, goals, sotTotal, convPrior) : core.mean_rate_per_90;
        const gammaParams = buildCandidateGammaParams(core, adjustedMean);
        const expPrior = v1Priors.exposure_priors.get(group) || { start_rate: 0.3, bench_enter_rate: 0.5, mean_minutes_if_starter: 80, mean_minutes_if_sub_used: 25 };
        const exposurePosterior = posteriorExposure(history, expPrior);
        let presenceMass;
        if (row.lineup_role === "STARTER") {
          const expMinutes = expectedMinutesPostLineup(exposurePosterior, "STARTER");
          presenceMass = presenceMassForGoal(v1Priors.goal_timing_distribution, presenceByBinForStarter(expMinutes));
        } else {
          const entryMinute = 90 - exposurePosterior.mean_minutes_if_sub_used;
          presenceMass = presenceMassForGoal(v1Priors.goal_timing_distribution, presenceByBinForSub(entryMinute, exposurePosterior.p_enter_if_bench));
        }
        return { player_id: row.player_id, gamma_alpha: gammaParams.alpha, gamma_beta: gammaParams.beta, presence_mass: presenceMass };
      });
    }
    const homeRows = targetRows.filter((r) => r.home_away === "HOME");
    const awayRows = targetRows.filter((r) => r.home_away === "AWAY");
    const seedV1 = crypto.createHash("sha256").update(`${target.fixture_id}|PLAYER_SCORER_V1_AGGREGATED_SHARE`).digest().readUInt32BE(0);
    const v1HomeCandidates = buildV1CandidatesForTeam(homeRows);
    const v1AwayCandidates = buildV1CandidatesForTeam(awayRows);
    const v1HomeSim = simulateAnytimeScorer(v1HomeCandidates, v1Priors.own_goal_rate.own_goal_mass, homeGoalDist, N_DRAWS_V1, seedV1);
    const v1AwaySim = simulateAnytimeScorer(v1AwayCandidates, v1Priors.own_goal_rate.own_goal_mass, awayGoalDist, N_DRAWS_V1, seedV1 + 1);
    const v1ByPlayer = new Map([...v1HomeSim, ...v1AwaySim].map((r) => [r.player_id, r.posterior_mean]));
    // determinisme (echantillon : 1 fixture sur 10 pour controler le cout)
    if (target.fixture_id % 10 === 0) {
      const v1HomeSim2 = simulateAnytimeScorer(v1HomeCandidates, v1Priors.own_goal_rate.own_goal_mass, homeGoalDist, N_DRAWS_V1, seedV1);
      if (JSON.stringify(v1HomeSim) !== JSON.stringify(v1HomeSim2)) determinismFailures++;
    }

    // ---- Model D (V2 COMPETING_RISKS) ----
    function buildV2TeamConfig(lineupTeam, goalClock) {
      const startingXI = (lineupTeam.startXI || []).map((p) => p.player.id);
      const bench = (lineupTeam.substitutes || []).map((p) => p.player.id);
      const positionByPlayer = new Map();
      for (const p of [...(lineupTeam.startXI || []), ...(lineupTeam.substitutes || [])]) positionByPlayer.set(p.player.id, resolvePositionGroup(p.player.pos));
      const etaByPlayer = new Map();
      for (const pid of [...startingXI, ...bench]) {
        const feat = v2.pointInTimeFeatures(pid, fixtureMeta.kickoff_timestamp);
        const alpha = v2.canonicalAlpha.get(feat.group) ?? v2.canonicalAlpha.get(DEFAULT_REFERENCE_CATEGORY);
        const eta = alpha + v2.fit.theta[V2_POSITION_ORDER.length] * feat.xGoal + v2.fit.theta[V2_POSITION_ORDER.length + 1] * feat.xShot + v2.fit.theta[V2_POSITION_ORDER.length + 2] * feat.xSot + playerEffect(v2.playerEffects, pid);
        etaByPlayer.set(pid, eta);
      }
      return { startingXI, bench, positionByPlayer, etaByPlayer, substitutionModel: v2.substitutionModel, goalClock, penaltyTakerCounts: v2.penaltyTakerCounts.get(lineupTeam.team.id) || null };
    }
    const homeTeamLineup = lineupTeams.find((t) => t.team.id === fixtureMeta.home_team_id);
    const awayTeamLineup = lineupTeams.find((t) => t.team.id === fixtureMeta.away_team_id);
    let v2ByPlayer = new Map();
    if (homeTeamLineup && awayTeamLineup) {
      const homeConfig = buildV2TeamConfig(homeTeamLineup, v2.goalClockHome);
      const awayConfig = buildV2TeamConfig(awayTeamLineup, v2.goalClockAway);
      const seedV2Buf = crypto.createHash("sha256").update(`${target.fixture_id}|PLAYER_SCORER_V2_COMPETING_RISKS|${JSON.stringify(matrix).length}`).digest();
      const seedV2 = seedV2Buf.readUInt32BE(0);
      const v2Results = simulateMatchV2(matrix, homeConfig, awayConfig, v2.ownGoalRate.omega_own, v2.omegaPen, N_DRAWS_V2, seedV2);
      v2ByPlayer = new Map(v2Results.map((r) => [r.player_id, r.posterior_mean]));
      if (target.fixture_id % 10 === 0) {
        const v2Results2 = simulateMatchV2(matrix, homeConfig, awayConfig, v2.ownGoalRate.omega_own, v2.omegaPen, N_DRAWS_V2, seedV2);
        if (JSON.stringify(v2Results) !== JSON.stringify(v2Results2)) determinismFailures++;
      }
      const massSum = [...v2ByPlayer.values()].reduce((a, b) => a + b, 0);
      if (!Number.isFinite(massSum)) massConservationFailures++; // garde grossiere ; conservation fine deja testee unitairement
    }

    // ---- Model B (LEGACY_PLAYER_ENGINE) & Model A (SHRUNK_GOALS90) ----
    const rowByPlayerId = new Map(targetRows.map((r) => [r.player_id, r]));
    const modelAByPlayer = new Map();
    const modelBByPlayer = new Map();
    for (const row of targetRows) {
      const history = reconstructCumulativeHistoryBeforeCutoff(sharedRowsByPlayer.get(row.player_id) || [], fixtureMeta.kickoff_timestamp);

      // A. SHRUNK_GOALS90_BASELINE : starter=90min naif (pas de modele de
      // substitution), bench=0min (jamais invente autrement) -> P=1-exp(-lambda).
      const shrunkRate = baselineA_simpleShrunkRate(history, leagueMeanRatePer90);
      const expMinutesA = row.lineup_role === "STARTER" ? 90 : 0;
      const lambdaA = shrunkRate * (expMinutesA / 90);
      modelAByPlayer.set(row.player_id, 1 - Math.exp(-lambdaA));

      // B. LEGACY_PLAYER_ENGINE (lib/markets/player-engine.js, wrapper baselineC_legacyPlayerEngine)
      const appearences = history.filter((r) => r.minutes > 0).length;
      const lineupsCount = history.filter((r) => r.lineup_role === "STARTER").length;
      const totalMinutes = history.reduce((s, r) => s + (r.minutes || 0), 0);
      const totalGoalsAll = history.reduce((s, r) => s + (r.goals || 0), 0);
      const totalPenaltyGoals = history.reduce((s, r) => s + (r.penalty_scored || 0), 0);
      const minutes90All = totalMinutes / 90;
      const ratePer90 = minutes90All > 0 ? totalGoalsAll / minutes90All : null;
      const penaltyGoalsPer90 = minutes90All > 0 ? totalPenaltyGoals / minutes90All : 0;
      const historicalCounts = history.filter((r) => r.minutes > 0).map((r) => r.goals || 0);
      const teamAttackMultiplier = (row.home_away === "HOME" ? target.lambdaH_m2 : target.lambdaA_m2) / leagueMeanGoalsPerTeamPerMatch;
      const legacyOutput = buildPlayerMarketOutput({
        fixtureId: target.fixture_id, playerId: row.player_id, market: "ANYTIME_GOALSCORER",
        lineupStatus: row.lineup_role === "STARTER" ? "confirmed_starter" : "confirmed_bench",
        historicalMinutes: { appearences, lineups: lineupsCount, minutes: totalMinutes },
        ratePer90, teamAttackMultiplier, opponentDefenseMultiplier: 1, penaltyGoalsPer90, historicalCounts,
      });
      modelBByPlayer.set(row.player_id, legacyOutput && legacyOutput.output ? legacyOutput.output.probability : null);
    }

    // ---- Assemble per-row records ----
    let bestA = null, bestB = null, bestC = null, bestD = null;
    for (const row of targetRows) {
      totalPlayerRows++;
      const pA = modelAByPlayer.get(row.player_id);
      const pB = modelBByPlayer.get(row.player_id);
      const pC = v1ByPlayer.get(row.player_id);
      const pD = v2ByPlayer.get(row.player_id);
      const y = nonOwnScorers.has(row.player_id) ? 1 : 0;

      [pA, pB, pC, pD].forEach((p) => { if (p != null) { if (Number.isNaN(p)) numericalNaN++; else if (!Number.isFinite(p)) numericalInf++; } });

      if (pA != null && Number.isFinite(pA)) coverageA++;
      if (pB != null && Number.isFinite(pB)) coverageB++;
      if (pC != null && Number.isFinite(pC)) coverageC++;
      if (pD != null && Number.isFinite(pD)) coverageD++;

      perRowRecords.push({
        fixture_id: target.fixture_id, iso_week: isoWeek, player_id: row.player_id, position_group: resolvePositionGroup(row.position),
        home_away: row.home_away, lineup_role: row.lineup_role, y,
        pA: pA != null && Number.isFinite(pA) ? pA : null,
        pB: pB != null && Number.isFinite(pB) ? pB : null,
        pC: pC != null && Number.isFinite(pC) ? pC : null,
        pD: pD != null && Number.isFinite(pD) ? pD : null,
      });

      if (pA != null && (bestA == null || pA > bestA.p)) bestA = { player_id: row.player_id, p: pA };
      if (pB != null && (bestB == null || pB > bestB.p)) bestB = { player_id: row.player_id, p: pB };
      if (pC != null && (bestC == null || pC > bestC.p)) bestC = { player_id: row.player_id, p: pC };
      if (pD != null && (bestD == null || pD > bestD.p)) bestD = { player_id: row.player_id, p: pD };

      // Goal attribution NLL (item 8) : uniquement pour les vrais buteurs
      // non-penalty/non-own-goal, en utilisant le P_score du modele comme
      // proxy d'attribution (V1/V2 ne rapportent pas une part par-but
      // separee ici - le proxy anytime est le signal disponible a ce
      // niveau d'evaluation match-level, documente comme tel).
      if (y === 1 && goalEvents.some((g) => g.player_id === row.player_id && !g.own_goal_flag && !g.penalty_flag)) {
        if (pD != null) attributionRowsV2.push({ true_scorer_probability: pD });
        if (pC != null) attributionRowsV1.push({ true_scorer_probability: pC });
      }
    }
    const actualScorerIds = [...nonOwnScorers];
    if (bestA) scorerSelectionRowsByModel.A.push({ fixture_id: target.fixture_id, selected_player_id: bestA.player_id, actual_scorer_ids: actualScorerIds, selected_player_probability: bestA.p });
    if (bestB) scorerSelectionRowsByModel.B.push({ fixture_id: target.fixture_id, selected_player_id: bestB.player_id, actual_scorer_ids: actualScorerIds, selected_player_probability: bestB.p });
    if (bestC) scorerSelectionRowsByModel.C.push({ fixture_id: target.fixture_id, selected_player_id: bestC.player_id, actual_scorer_ids: actualScorerIds, selected_player_probability: bestC.p });
    if (bestD) scorerSelectionRowsByModel.D.push({ fixture_id: target.fixture_id, selected_player_id: bestD.player_id, actual_scorer_ids: actualScorerIds, selected_player_probability: bestD.p });
  }

  console.log(`fixtures_evaluated=${fixturesCovered} total_player_rows=${totalPlayerRows}`);
  console.log(`coverage_A=${coverageA} coverage_B=${coverageB} coverage_C=${coverageC} coverage_D=${coverageD}`);

  // ============================================================
  // 5. Common support + logloss primaire
  // ============================================================
  console.log("\n=== 5. Common support + ANYTIME_SCORER_LOGLOSS ===");
  const commonSupportRows = perRowRecords.filter((r) => r.pA != null && r.pB != null && r.pC != null && r.pD != null);
  console.log(`common_support_player_rows=${commonSupportRows.length} / total_player_rows=${totalPlayerRows}`);

  function logloss(p, y) { const c = Math.min(Math.max(p, 1e-12), 1 - 1e-12); return y === 1 ? -Math.log(c) : -Math.log(1 - c); }
  function loglossStats(rows, field) {
    const usable = rows.filter((r) => r[field] != null);
    if (!usable.length) return null;
    const losses = usable.map((r) => logloss(r[field], r.y));
    return { n: usable.length, mean_logloss: mean(losses), total_logloss: losses.reduce((a, b) => a + b, 0) };
  }
  const loglossA = loglossStats(commonSupportRows, "pA");
  const loglossB = loglossStats(commonSupportRows, "pB");
  const loglossC = loglossStats(commonSupportRows, "pC");
  const loglossD = loglossStats(commonSupportRows, "pD");
  console.log(`A(SHRUNK_GOALS90)  n=${loglossA.n} mean_logloss=${loglossA.mean_logloss.toFixed(6)} total=${loglossA.total_logloss.toFixed(2)}`);
  console.log(`B(LEGACY)          n=${loglossB.n} mean_logloss=${loglossB.mean_logloss.toFixed(6)} total=${loglossB.total_logloss.toFixed(2)}`);
  console.log(`C(V1_AGGREGATED)   n=${loglossC.n} mean_logloss=${loglossC.mean_logloss.toFixed(6)} total=${loglossC.total_logloss.toFixed(2)}`);
  console.log(`D(V2_COMPETING)    n=${loglossD.n} mean_logloss=${loglossD.mean_logloss.toFixed(6)} total=${loglossD.total_logloss.toFixed(2)}`);

  // ============================================================
  // 6. Comparaisons paires (bootstrap bloc par ISO_WEEK)
  // ============================================================
  console.log("\n=== 6-7. Comparaisons paires (bootstrap bloc ISO_WEEK, 10000 reps) ===");
  function pairedComparison(label, fieldA, fieldB, seed) {
    const rows = commonSupportRows.map((r) => ({ block: r.iso_week, valueA: logloss(r[fieldA], r.y), valueB: logloss(r[fieldB], r.y) }));
    const result = pairedBlockBootstrapDelta(rows, N_BOOTSTRAP_REPS, seed);
    console.log(`${label}: observed_delta=${result.observed_delta.toFixed(6)} relative_gain=${result.relative_gain_pct.toFixed(3)}% CI95=[${result.ci_lower.toFixed(6)}, ${result.ci_upper.toFixed(6)}] P(first_better)=${result.probability_a_better.toFixed(4)} n_blocks=${result.n_blocks}`);
    return result;
  }
  const v2VsV1 = pairedComparison("V2 vs V1", "pD", "pC", 20240001);
  const v2VsA = pairedComparison("V2 vs SHRUNK_GOALS90", "pD", "pA", 20240002);
  const v2VsB = pairedComparison("V2 vs LEGACY", "pD", "pB", 20240003);
  const v1VsA = pairedComparison("V1 vs SHRUNK_GOALS90", "pC", "pA", 20240004);
  const v1VsB = pairedComparison("V1 vs LEGACY", "pC", "pB", 20240005);

  // ============================================================
  // 8. Secondary metrics : Brier, calibration, attribution NLL, Top-1
  // ============================================================
  console.log("\n=== 8. Secondary metrics ===");
  function brier(p, y) { return (p - y) * (p - y); }
  function brierStats(rows, field) {
    const usable = rows.filter((r) => r[field] != null);
    return { n: usable.length, mean_brier: mean(usable.map((r) => brier(r[field], r.y))) };
  }
  const brierA = brierStats(commonSupportRows, "pA"), brierB = brierStats(commonSupportRows, "pB"), brierC = brierStats(commonSupportRows, "pC"), brierD = brierStats(commonSupportRows, "pD");
  console.log(`Brier A=${brierA.mean_brier.toFixed(6)} B=${brierB.mean_brier.toFixed(6)} C=${brierC.mean_brier.toFixed(6)} D=${brierD.mean_brier.toFixed(6)}`);

  const brierV2VsV1Rows = commonSupportRows.map((r) => ({ block: r.iso_week, valueA: brier(r.pD, r.y), valueB: brier(r.pC, r.y) }));
  const brierV2VsV1 = pairedBlockBootstrapDelta(brierV2VsV1Rows, N_BOOTSTRAP_REPS, 20240006);
  console.log(`Brier V2-V1 delta=${brierV2VsV1.observed_delta.toFixed(6)} CI95=[${brierV2VsV1.ci_lower.toFixed(6)}, ${brierV2VsV1.ci_upper.toFixed(6)}]`);

  function calibrationReport(rows, field) {
    const usable = rows.filter((r) => r[field] != null).map((r) => ({ p: r[field], y: r.y }));
    const fit = calibrationInterceptSlope(usable);
    const bins = reliabilityBins(usable, 10);
    const ece = expectedCalibrationError(bins, usable.length);
    return { n: usable.length, intercept: fit.intercept, slope: fit.slope, ece, bins };
  }
  const calA = calibrationReport(commonSupportRows, "pA"), calB = calibrationReport(commonSupportRows, "pB"), calC = calibrationReport(commonSupportRows, "pC"), calD = calibrationReport(commonSupportRows, "pD");
  console.log(`Calibration A: intercept=${calA.intercept.toFixed(4)} slope=${calA.slope.toFixed(4)} ECE=${calA.ece.toFixed(4)}`);
  console.log(`Calibration B: intercept=${calB.intercept.toFixed(4)} slope=${calB.slope.toFixed(4)} ECE=${calB.ece.toFixed(4)}`);
  console.log(`Calibration C: intercept=${calC.intercept.toFixed(4)} slope=${calC.slope.toFixed(4)} ECE=${calC.ece.toFixed(4)}`);
  console.log(`Calibration D: intercept=${calD.intercept.toFixed(4)} slope=${calD.slope.toFixed(4)} ECE=${calD.ece.toFixed(4)}`);

  function attributionNLL(rows) {
    const valid = rows.filter((r) => r.true_scorer_probability > 0);
    if (!valid.length) return null;
    return { n: valid.length, nll: valid.reduce((s, r) => s - Math.log(Math.max(r.true_scorer_probability, 1e-12)), 0) / valid.length };
  }
  const attrV2 = attributionNLL(attributionRowsV2), attrV1 = attributionNLL(attributionRowsV1);
  console.log(`Goal attribution NLL (proxy anytime P_score) : V2 n=${attrV2 ? attrV2.n : 0} nll=${attrV2 ? attrV2.nll.toFixed(4) : "n/a"} | V1 n=${attrV1 ? attrV1.n : 0} nll=${attrV1 ? attrV1.nll.toFixed(4) : "n/a"}`);

  function topOneHitRate(rows) {
    if (!rows.length) return null;
    const hits = rows.filter((r) => r.actual_scorer_ids.includes(r.selected_player_id)).length;
    return { n: rows.length, hits, hit_rate: hits / rows.length, mean_selected_probability: mean(rows.map((r) => r.selected_player_probability)) };
  }
  const topA = topOneHitRate(scorerSelectionRowsByModel.A), topB = topOneHitRate(scorerSelectionRowsByModel.B), topC = topOneHitRate(scorerSelectionRowsByModel.C), topD = topOneHitRate(scorerSelectionRowsByModel.D);
  console.log(`Top-1 hit rate A=${topA ? (topA.hit_rate * 100).toFixed(2) : "n/a"}% B=${topB ? (topB.hit_rate * 100).toFixed(2) : "n/a"}% C=${topC ? (topC.hit_rate * 100).toFixed(2) : "n/a"}% D=${topD ? (topD.hit_rate * 100).toFixed(2) : "n/a"}%`);

  // ============================================================
  // 9. Numerical sanity (V2 focus)
  // ============================================================
  console.log("\n=== 9. Numerical sanity (V2) ===");
  const pDValues = commonSupportRows.map((r) => r.pD).filter((v) => v != null);
  const pDAll = perRowRecords.map((r) => r.pD).filter((v) => v != null);
  const sortedPD = pDAll.slice().sort((a, b) => a - b);
  const quantile = (arr, q) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(q * arr.length))] : null;
  console.log(`P_score(V2) : n=${pDAll.length} mean=${mean(pDAll).toFixed(4)} median=${quantile(sortedPD, 0.5).toFixed(4)} p90=${quantile(sortedPD, 0.9).toFixed(4)} max=${Math.max(...pDAll).toFixed(4)}`);
  console.log(`mean_selected_probability(D)=${topD ? topD.mean_selected_probability.toFixed(4) : "n/a"}`);
  console.log(`n_players_P>0.50 (D)=${pDAll.filter((v) => v > 0.5).length}`);
  console.log(`NaN=${numericalNaN} Inf=${numericalInf} mass_conservation_failures=${massConservationFailures} determinism_failures=${determinismFailures}`);

  // ============================================================
  // 10. Position diagnostics (descriptif uniquement)
  // ============================================================
  console.log("\n=== 10. Position diagnostics (descriptif) ===");
  const positionDiagnostics = {};
  for (const group of ["F", "M", "D", "G", "UNKNOWN"]) {
    const rows = commonSupportRows.filter((r) => r.position_group === group);
    if (!rows.length) { positionDiagnostics[group] = null; continue; }
    positionDiagnostics[group] = {
      n: rows.length,
      observed_scorer_rate: mean(rows.map((r) => r.y)),
      predicted_mean_A: mean(rows.map((r) => r.pA)), predicted_mean_B: mean(rows.map((r) => r.pB)), predicted_mean_C: mean(rows.map((r) => r.pC)), predicted_mean_D: mean(rows.map((r) => r.pD)),
      logloss_A: mean(rows.map((r) => logloss(r.pA, r.y))), logloss_B: mean(rows.map((r) => logloss(r.pB, r.y))), logloss_C: mean(rows.map((r) => logloss(r.pC, r.y))), logloss_D: mean(rows.map((r) => logloss(r.pD, r.y))),
      brier_D: mean(rows.map((r) => brier(r.pD, r.y))),
    };
    console.log(`${group}: n=${rows.length} observed_rate=${positionDiagnostics[group].observed_scorer_rate.toFixed(4)} logloss_C=${positionDiagnostics[group].logloss_C.toFixed(4)} logloss_D=${positionDiagnostics[group].logloss_D.toFixed(4)}`);
  }

  // ============================================================
  // 11. Temporal diagnostics (descriptif uniquement)
  // ============================================================
  console.log("\n=== 11. Temporal diagnostics (descriptif) ===");
  const fixtureIdsSorted = [...new Set(commonSupportRows.map((r) => r.fixture_id))].sort((a, b) => {
    const fa = dataset.allFixtures.find((f) => f.fixture_id === a), fb = dataset.allFixtures.find((f) => f.fixture_id === b);
    return new Date(fa.kickoff_timestamp) - new Date(fb.kickoff_timestamp);
  });
  const half = Math.ceil(fixtureIdsSorted.length / 2);
  const firstHalfIds = new Set(fixtureIdsSorted.slice(0, half));
  function periodStats(rows) {
    return { n: rows.length, logloss_C: mean(rows.map((r) => logloss(r.pC, r.y))), logloss_D: mean(rows.map((r) => logloss(r.pD, r.y))) };
  }
  const firstHalfStats = periodStats(commonSupportRows.filter((r) => firstHalfIds.has(r.fixture_id)));
  const secondHalfStats = periodStats(commonSupportRows.filter((r) => !firstHalfIds.has(r.fixture_id)));
  console.log(`first_half_season : n=${firstHalfStats.n} logloss_C=${firstHalfStats.logloss_C.toFixed(4)} logloss_D=${firstHalfStats.logloss_D.toFixed(4)}`);
  console.log(`second_half_season: n=${secondHalfStats.n} logloss_C=${secondHalfStats.logloss_C.toFixed(4)} logloss_D=${secondHalfStats.logloss_D.toFixed(4)}`);

  const byMonth = new Map();
  for (const r of commonSupportRows) {
    const fx = dataset.allFixtures.find((f) => f.fixture_id === r.fixture_id);
    const month = fx ? fx.kickoff_timestamp.slice(0, 7) : "unknown";
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(r);
  }
  const monthlyDiagnostics = [...byMonth.entries()].sort().map(([month, rows]) => ({ month, n: rows.length, logloss_C: mean(rows.map((r) => logloss(r.pC, r.y))), logloss_D: mean(rows.map((r) => logloss(r.pD, r.y))) }));
  console.log("monthly=" + JSON.stringify(monthlyDiagnostics));

  // ============================================================
  // 12. Regle de decision PRE-ENREGISTREE (ecrite avant tout resultat)
  // ============================================================
  console.log("\n=== 12. Decision rule ===");
  const relativeGain = v2VsV1.relative_gain_pct;
  const ciUpperBelowZero = v2VsV1.ci_upper < 0;
  const brierClearDegradation = brierV2VsV1.ci_lower > 0;
  let decision, reasonCode;
  if (relativeGain > 0 && ciUpperBelowZero && !brierClearDegradation) {
    decision = "V2_BEATS_V1_ON_OOS_DEV"; reasonCode = "GAIN_POSITIVE_CI_EXCLUDES_ZERO_NO_BRIER_DEGRADATION";
  } else if (relativeGain <= 0) {
    decision = "V2_REJECT_DEV"; reasonCode = "NON_POSITIVE_GAIN";
  } else if (!ciUpperBelowZero) {
    decision = "INCONCLUSIVE"; reasonCode = "GAIN_POSITIVE_BUT_CI_CROSSES_ZERO";
  } else {
    decision = "INCONCLUSIVE"; reasonCode = "GAIN_POSITIVE_CI_EXCLUDES_ZERO_BUT_BRIER_DEGRADES";
  }
  console.log(`relative_gain_anytime_logloss=${relativeGain.toFixed(3)}% ci_upper_below_zero=${ciUpperBelowZero} brier_clear_degradation=${brierClearDegradation}`);
  console.log(`OOS_DEV_STATUS=${decision} reason_code=${reasonCode}`);
  const championProvisional = decision === "V2_BEATS_V1_ON_OOS_DEV" ? "PLAYER_SCORER_V2_COMPETING_RISKS" : "PLAYER_SCORER_V1_AGGREGATED_SHARE";
  console.log(`champion_provisoire=${championProvisional}`);

  // ============================================================
  // 15. Artifact + report hash
  // ============================================================
  const report = {
    generated_at: new Date().toISOString(),
    head_sha_pre_oos: EXPECTED_HEAD_SHA,
    manifest_hash_v2: EXPECTED_MANIFEST_HASH_V2,
    dataset_version: EXPECTED_DATASET_VERSION,
    ridge: RIDGE_EXPECTED,
    oos_dev_season: OOS_DEV_SEASON,
    coverage: { total_fixtures_2023_24: predictions.filter((p) => p.season === OOS_DEV_SEASON).length, fixtures_evaluated: fixturesCovered, total_player_rows: totalPlayerRows, coverage_A: coverageA, coverage_B: coverageB, coverage_C: coverageC, coverage_D: coverageD, common_support_player_rows: commonSupportRows.length, common_support_fixtures: fixtureIdsSorted.length },
    logloss: { A: loglossA, B: loglossB, C: loglossC, D: loglossD },
    pairwise: { v2_vs_v1: v2VsV1, v2_vs_A: v2VsA, v2_vs_B: v2VsB, v1_vs_A: v1VsA, v1_vs_B: v1VsB },
    brier: { A: brierA, B: brierB, C: brierC, D: brierD, v2_vs_v1_delta: brierV2VsV1 },
    calibration: { A: { intercept: calA.intercept, slope: calA.slope, ece: calA.ece, bins: calA.bins }, B: { intercept: calB.intercept, slope: calB.slope, ece: calB.ece, bins: calB.bins }, C: { intercept: calC.intercept, slope: calC.slope, ece: calC.ece, bins: calC.bins }, D: { intercept: calD.intercept, slope: calD.slope, ece: calD.ece, bins: calD.bins } },
    attribution_nll: { v2: attrV2, v1: attrV1 },
    top1_hit_rate: { A: topA, B: topB, C: topC, D: topD },
    numerical_sanity: { n_nan: numericalNaN, n_inf: numericalInf, mass_conservation_failures: massConservationFailures, determinism_failures: determinismFailures, p_score_v2: { n: pDAll.length, mean: mean(pDAll), median: quantile(sortedPD, 0.5), p90: quantile(sortedPD, 0.9), max: Math.max(...pDAll), n_above_0_50: pDAll.filter((v) => v > 0.5).length } },
    position_diagnostics: positionDiagnostics,
    temporal_diagnostics: { first_half_season: firstHalfStats, second_half_season: secondHalfStats, monthly: monthlyDiagnostics },
    decision: { relative_gain_anytime_logloss_pct: relativeGain, ci_upper_below_zero: ciUpperBelowZero, brier_clear_degradation: brierClearDegradation, OOS_DEV_STATUS: decision, reason_code: reasonCode, champion_provisoire: championProvisional },
  };
  const reportPath = path.join(__dirname, "..", "data", "player-lab", "oos-dev-2023-24-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const reportHash = sha256Hex(JSON.stringify(report));
  console.log(`\nreport_path=${reportPath}`);
  console.log(`report_hash=${reportHash}`);
  console.log(`elapsed_ms=${Date.now() - startedAt}`);
  console.log("\nSTOP - aucune donnee/metrique 2024-25 consultee dans ce script.");
}

main();
