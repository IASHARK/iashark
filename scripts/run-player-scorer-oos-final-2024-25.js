#!/usr/bin/env node
"use strict";
// PLAYER SCORER OOS_FINAL 2024-25 (2026-09-05). UNIQUE run de promotion
// finale du candidat V1 (PLAYER_SCORER_V1_AGGREGATED_SHARE), scelle
// apres OOS_DEV 2023-24 = V2_REJECT_DEV (commit dc39690e). Apres ce
// run, AUCUN tuning retrospectif.
//
// V1 est FIGE exactement dans son etat OOS_DEV : aucune formule, prior,
// shrinkage, parametre, cutoff, regle d'exposition, traitement
// penalty/own-goal ou selection joueur modifie. V2 n'est PAS calcule
// dans ce run (non-promotable, rejete - item 3 : "peut etre calcule
// uniquement si deja facile" - omis ici pour rester strictement dans le
// perimetre demande : C vs A vs B).
//
// 2025-26 : AUCUNE ligne, AUCUN evenement, AUCUN score de cette saison
// n'est charge (SEASONS_FOR_HISTORY s'arrete a 2024). SEALED_UNREAD.
//
// Le script s'execute deux fois de suite (item 15, reproductibilite)
// et compare les resultats hors champs explicitement volatils
// (generated_at, elapsed_ms).

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
const { EXPERIMENT_MANIFEST_V1, manifestHash } = require("../lib/player-lab/experiment-manifest.js");
const { loadRealDataset } = require("../lib/lab/load-real-dataset.js");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");
const { predictWithRho } = require("../lib/lab/dc-matrix-with-rho.js");

const { isoWeekKey, mean, pairedBlockBootstrapDelta, calibrationInterceptSlope, reliabilityBins, expectedCalibrationError, sha256Hex } = require("../lib/player-lab/oos-eval-metrics.js");

const CHAMPION_RHO = -0.0845;
const SEASONS_FOR_HISTORY = [2021, 2022, 2023, 2024]; // JAMAIS 2025
const OOS_FINAL_SEASON = 2024;
const EXPECTED_DATASET_VERSION = "c47b5a72ae0daf64a19f6f27abbc4810086c6632a4d6b1d2ab4fe5f0fdeed02b";
const N_DRAWS_V1 = 3000;
const N_BOOTSTRAP_REPS = 10000;

function loadFixturesMeta(season) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `premier-league-${season}.json`), "utf8"));
}

function loadSharedHistory() {
  const rowsByPlayer = new Map();
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
      for (const row of rows) {
        allRowsFlat.push(row);
        if (!rowsByPlayer.has(row.player_id)) rowsByPlayer.set(row.player_id, []);
        rowsByPlayer.get(row.player_id).push(row);
      }
    }
  }
  for (const rows of rowsByPlayer.values()) rows.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  return { rowsByPlayer, fixtureRawByFixtureId, allRowsFlat, allGoalEventsFlat };
}

function buildFinalCandidateManifest(v1Priors, datasetVersion) {
  const manifest = Object.freeze({
    candidate_id: "PLAYER_SCORER_V1_AGGREGATED_SHARE",
    frozen_from_commit: "dc39690ed720ea48ec7adc1895979cc158fb3c8e",
    oos_dev_status: "V2_REJECT_DEV",
    v2_status: "NON_PROMOTABLE_REJECTED_CHALLENGER",
    dataset_version: datasetVersion,
    experiment_manifest_v1_hash: manifestHash(EXPERIMENT_MANIFEST_V1),
    train_season: v1Priors.train_season,
    n_train_rows: v1Priors.n_train_rows,
    n_train_goal_events: v1Priors.n_train_goal_events,
    core_rate_priors: [...v1Priors.core_rate_priors.entries()],
    conversion_priors: [...v1Priors.conversion_priors.entries()],
    exposure_priors: [...v1Priors.exposure_priors.entries()],
    goal_timing_distribution: v1Priors.goal_timing_distribution,
    own_goal_rate: v1Priors.own_goal_rate,
    penalty_rate: v1Priors.penalty_rate,
    n_draws_v1: N_DRAWS_V1,
    mode: "POST_LINEUP_CONDITIONAL",
    input_contract: "SEASONS_FOR_HISTORY=[2021,2022,2023,2024], OOS_FINAL_SEASON=2024, 2025-26 SEALED_UNREAD",
  });
  return { manifest, hash: sha256Hex(JSON.stringify(manifest)) };
}

function computeAll() {
  const datasetManifest = buildDatasetManifest([2021, 2022, 2023, 2024]);
  const { rowsByPlayer: sharedRowsByPlayer, fixtureRawByFixtureId, allRowsFlat, allGoalEventsFlat } = loadSharedHistory();
  const v1Priors = fitAllPriorsFromTrain(allRowsFlat, allGoalEventsFlat);
  const { manifest: finalCandidateManifest, hash: finalCandidateManifestHash } = buildFinalCandidateManifest(v1Priors, datasetManifest.dataset_version);

  const trainRowsForLeagueMean = allRowsFlat.filter((r) => r.season === 2022);
  const leagueMeanRatePer90 = (() => {
    const goals = trainRowsForLeagueMean.reduce((s, r) => s + (r.goals || 0), 0);
    const minutes90 = trainRowsForLeagueMean.reduce((s, r) => s + (r.minutes || 0), 0) / 90;
    return minutes90 > 0 ? goals / minutes90 : 0.05;
  })();
  const trainFixtures2022Meta = loadFixturesMeta(2022);
  const leagueMeanGoalsPerTeamPerMatch = (() => {
    let sum = 0, n = 0;
    for (const fx of trainFixtures2022Meta) {
      if (fx.goals_home_90 == null || fx.goals_away_90 == null) continue;
      sum += fx.goals_home_90 + fx.goals_away_90; n += 2;
    }
    return n > 0 ? sum / n : 1.4;
  })();

  const dataset = loadRealDataset();
  const previousSeasonFixturesBySeasons = new Map();
  for (const season of dataset.oosSeasons) previousSeasonFixturesBySeasons.set(season, dataset.allFixtures.filter((f) => f.season === season - 1));
  const { predictions } = runWalkForwardM2C({ ...dataset, previousSeasonFixturesBySeasons });
  const totalFixturesSeason = predictions.filter((p) => p.season === OOS_FINAL_SEASON).length;
  const targets = predictions.filter((p) => p.season === OOS_FINAL_SEASON && p.m0_valid && isCached("lineups", p.fixture_id) && isCached("players", p.fixture_id) && isCached("events", p.fixture_id));

  const perRowRecords = [];
  const scorerSelectionRowsByModel = { A: [], B: [], C: [] };
  let numericalNaN = 0, numericalInf = 0, determinismFailures = 0;
  let coverageA = 0, coverageB = 0, coverageC = 0, totalPlayerRows = 0;
  let fixturesCovered = 0;
  const exclusionReasons = { B_below_min_appearances: 0 };

  for (const target of targets) {
    const fixtureMeta = dataset.allFixtures.find((f) => f.fixture_id === target.fixture_id);
    if (!fixtureMeta) continue;
    const cached = fixtureRawByFixtureId.get(target.fixture_id);
    if (!cached) continue;
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
    const seedV1 = crypto.createHash("sha256").update(`${target.fixture_id}|PLAYER_SCORER_V1_AGGREGATED_SHARE|OOS_FINAL`).digest().readUInt32BE(0);
    const v1HomeCandidates = buildV1CandidatesForTeam(homeRows);
    const v1AwayCandidates = buildV1CandidatesForTeam(awayRows);
    const v1HomeSim = simulateAnytimeScorer(v1HomeCandidates, v1Priors.own_goal_rate.own_goal_mass, homeGoalDist, N_DRAWS_V1, seedV1);
    const v1AwaySim = simulateAnytimeScorer(v1AwayCandidates, v1Priors.own_goal_rate.own_goal_mass, awayGoalDist, N_DRAWS_V1, seedV1 + 1);
    const v1ByPlayer = new Map([...v1HomeSim, ...v1AwaySim].map((r) => [r.player_id, r.posterior_mean]));
    if (target.fixture_id % 10 === 0) {
      const v1HomeSim2 = simulateAnytimeScorer(v1HomeCandidates, v1Priors.own_goal_rate.own_goal_mass, homeGoalDist, N_DRAWS_V1, seedV1);
      if (JSON.stringify(v1HomeSim) !== JSON.stringify(v1HomeSim2)) determinismFailures++;
    }

    const modelAByPlayer = new Map();
    const modelBByPlayer = new Map();
    for (const row of targetRows) {
      const history = reconstructCumulativeHistoryBeforeCutoff(sharedRowsByPlayer.get(row.player_id) || [], fixtureMeta.kickoff_timestamp);
      const shrunkRate = baselineA_simpleShrunkRate(history, leagueMeanRatePer90);
      const expMinutesA = row.lineup_role === "STARTER" ? 90 : 0;
      const lambdaA = shrunkRate * (expMinutesA / 90);
      modelAByPlayer.set(row.player_id, 1 - Math.exp(-lambdaA));

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
      if (appearences < 3) exclusionReasons.B_below_min_appearances++;
      modelBByPlayer.set(row.player_id, legacyOutput && legacyOutput.output ? legacyOutput.output.probability : null);
    }

    let bestA = null, bestB = null, bestC = null;
    for (const row of targetRows) {
      totalPlayerRows++;
      const pA = modelAByPlayer.get(row.player_id);
      const pB = modelBByPlayer.get(row.player_id);
      const pC = v1ByPlayer.get(row.player_id);
      const y = nonOwnScorers.has(row.player_id) ? 1 : 0;

      [pA, pB, pC].forEach((p) => { if (p != null) { if (Number.isNaN(p)) numericalNaN++; else if (!Number.isFinite(p)) numericalInf++; } });

      if (pA != null && Number.isFinite(pA)) coverageA++;
      if (pB != null && Number.isFinite(pB)) coverageB++;
      if (pC != null && Number.isFinite(pC)) coverageC++;

      perRowRecords.push({
        fixture_id: target.fixture_id, iso_week: isoWeek, player_id: row.player_id, position_group: resolvePositionGroup(row.position),
        home_away: row.home_away, lineup_role: row.lineup_role, minutes: row.minutes, y,
        pA: pA != null && Number.isFinite(pA) ? pA : null,
        pB: pB != null && Number.isFinite(pB) ? pB : null,
        pC: pC != null && Number.isFinite(pC) ? pC : null,
      });

      if (pA != null && (bestA == null || pA > bestA.p)) bestA = { player_id: row.player_id, p: pA };
      if (pB != null && (bestB == null || pB > bestB.p)) bestB = { player_id: row.player_id, p: pB };
      if (pC != null && (bestC == null || pC > bestC.p)) bestC = { player_id: row.player_id, p: pC };
    }
    const actualScorerIds = [...nonOwnScorers];
    if (bestA) scorerSelectionRowsByModel.A.push({ fixture_id: target.fixture_id, selected_player_id: bestA.player_id, actual_scorer_ids: actualScorerIds, selected_player_probability: bestA.p });
    if (bestB) scorerSelectionRowsByModel.B.push({ fixture_id: target.fixture_id, selected_player_id: bestB.player_id, actual_scorer_ids: actualScorerIds, selected_player_probability: bestB.p });
    if (bestC) scorerSelectionRowsByModel.C.push({ fixture_id: target.fixture_id, selected_player_id: bestC.player_id, actual_scorer_ids: actualScorerIds, selected_player_probability: bestC.p });
  }

  function logloss(p, y) { const c = Math.min(Math.max(p, 1e-12), 1 - 1e-12); return y === 1 ? -Math.log(c) : -Math.log(1 - c); }
  function brier(p, y) { return (p - y) * (p - y); }
  function loglossStats(rows, field) {
    const usable = rows.filter((r) => r[field] != null);
    if (!usable.length) return null;
    const losses = usable.map((r) => logloss(r[field], r.y));
    return { n: usable.length, mean_logloss: mean(losses), total_logloss: losses.reduce((a, b) => a + b, 0) };
  }
  function brierStats(rows, field) {
    const usable = rows.filter((r) => r[field] != null);
    if (!usable.length) return null;
    return { n: usable.length, mean_brier: mean(usable.map((r) => brier(r[field], r.y))) };
  }
  function pairedComparison(rows, fieldCandidate, fieldBaseline, seed) {
    const usableRows = rows.map((r) => ({ block: r.iso_week, valueA: logloss(r[fieldCandidate], r.y), valueB: logloss(r[fieldBaseline], r.y) }));
    return pairedBlockBootstrapDelta(usableRows, N_BOOTSTRAP_REPS, seed);
  }
  function brierComparison(rows, fieldCandidate, fieldBaseline, seed) {
    const usableRows = rows.map((r) => ({ block: r.iso_week, valueA: brier(r[fieldCandidate], r.y), valueB: brier(r[fieldBaseline], r.y) }));
    return pairedBlockBootstrapDelta(usableRows, N_BOOTSTRAP_REPS, seed);
  }
  function calibrationReport(rows, field) {
    const usable = rows.filter((r) => r[field] != null).map((r) => ({ p: r[field], y: r.y }));
    const fit = calibrationInterceptSlope(usable);
    const bins = reliabilityBins(usable, 10);
    const ece = expectedCalibrationError(bins, usable.length);
    return { n: usable.length, intercept: fit.intercept, slope: fit.slope, converged: fit.converged, ece, bins };
  }
  function topOneHitRate(rows) {
    if (!rows.length) return null;
    const hits = rows.filter((r) => r.actual_scorer_ids.includes(r.selected_player_id)).length;
    return { n: rows.length, hits, hit_rate: hits / rows.length, mean_selected_probability: mean(rows.map((r) => r.selected_player_probability)) };
  }
  function positionDiagnostics(rows, field, label) {
    const out = {};
    for (const group of ["F", "M", "D", "G", "UNKNOWN"]) {
      const groupRows = rows.filter((r) => r.position_group === group && r[field] != null);
      out[group] = groupRows.length ? {
        n: groupRows.length, observed_scorer_rate: mean(groupRows.map((r) => r.y)),
        predicted_mean: mean(groupRows.map((r) => r[field])), logloss: mean(groupRows.map((r) => logloss(r[field], r.y))), brier: mean(groupRows.map((r) => brier(r[field], r.y))),
      } : null;
    }
    return out;
  }

  // --- Support commun MAXIMAL, SEPARE, pour C-vs-A et C-vs-B (item 4) ---
  const supportCA = perRowRecords.filter((r) => r.pA != null && r.pC != null);
  const supportCB = perRowRecords.filter((r) => r.pB != null && r.pC != null);

  const loglossA_onCA = loglossStats(supportCA, "pA");
  const loglossC_onCA = loglossStats(supportCA, "pC");
  const loglossB_onCB = loglossStats(supportCB, "pB");
  const loglossC_onCB = loglossStats(supportCB, "pC");
  const deltaCA = pairedComparison(supportCA, "pC", "pA", 20240101);
  const deltaCB = pairedComparison(supportCB, "pC", "pB", 20240102);

  const brierA_onCA = brierStats(supportCA, "pA"), brierC_onCA = brierStats(supportCA, "pC");
  const brierB_onCB = brierStats(supportCB, "pB"), brierC_onCB = brierStats(supportCB, "pC");
  const brierDeltaCA = brierComparison(supportCA, "pC", "pA", 20240103);
  const brierDeltaCB = brierComparison(supportCB, "pC", "pB", 20240104);

  const calA = calibrationReport(supportCA, "pA"), calC_onCA = calibrationReport(supportCA, "pC");
  const calB = calibrationReport(supportCB, "pB"), calC_onCB = calibrationReport(supportCB, "pC");

  const topA = topOneHitRate(scorerSelectionRowsByModel.A), topB = topOneHitRate(scorerSelectionRowsByModel.B), topC = topOneHitRate(scorerSelectionRowsByModel.C);

  const posOnCA = { A: positionDiagnostics(supportCA, "pA", "A"), C: positionDiagnostics(supportCA, "pC", "C") };
  const posOnCB = { B: positionDiagnostics(supportCB, "pB", "B"), C: positionDiagnostics(supportCB, "pC", "C") };

  // --- Temporal (support CA, plus large) ---
  const fixtureIdsSorted = [...new Set(supportCA.map((r) => r.fixture_id))].sort((a, b) => {
    const fa = dataset.allFixtures.find((f) => f.fixture_id === a), fb = dataset.allFixtures.find((f) => f.fixture_id === b);
    return new Date(fa.kickoff_timestamp) - new Date(fb.kickoff_timestamp);
  });
  const half = Math.ceil(fixtureIdsSorted.length / 2);
  const firstHalfIds = new Set(fixtureIdsSorted.slice(0, half));
  function periodStats(rows) { return { n: rows.length, logloss_C: mean(rows.map((r) => logloss(r.pC, r.y))), logloss_A: mean(rows.map((r) => logloss(r.pA, r.y))) }; }
  const firstHalfStats = periodStats(supportCA.filter((r) => firstHalfIds.has(r.fixture_id)));
  const secondHalfStats = periodStats(supportCA.filter((r) => !firstHalfIds.has(r.fixture_id)));
  const byMonth = new Map();
  for (const r of supportCA) {
    const fx = dataset.allFixtures.find((f) => f.fixture_id === r.fixture_id);
    const month = fx ? fx.kickoff_timestamp.slice(0, 7) : "unknown";
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month).push(r);
  }
  const monthlyDiagnostics = [...byMonth.entries()].sort().map(([month, rows]) => ({ month, n: rows.length, logloss_C: mean(rows.map((r) => logloss(r.pC, r.y))), logloss_A: mean(rows.map((r) => logloss(r.pA, r.y))) }));

  // --- item 8 : OUTFIELD_ONLY (F/M/D uniquement) ---
  const outfieldCA = supportCA.filter((r) => ["F", "M", "D"].includes(r.position_group));
  const outfieldCB = supportCB.filter((r) => ["F", "M", "D"].includes(r.position_group));
  const outfield = {
    vs_A: { n: outfieldCA.length, logloss_C: loglossStats(outfieldCA, "pC"), logloss_A: loglossStats(outfieldCA, "pA"), delta: pairedComparison(outfieldCA, "pC", "pA", 20240201) },
    vs_B: { n: outfieldCB.length, logloss_C: loglossStats(outfieldCB, "pC"), logloss_B: loglossStats(outfieldCB, "pB"), delta: pairedComparison(outfieldCB, "pC", "pB", 20240202) },
  };

  // --- item 9 : PLAYED_MINUTES>0 (descriptif) ---
  const playedCA = supportCA.filter((r) => r.minutes > 0);
  const playedCB = supportCB.filter((r) => r.minutes > 0);
  const playedMinutes = {
    vs_A: { n: playedCA.length, logloss_C: loglossStats(playedCA, "pC"), logloss_A: loglossStats(playedCA, "pA"), delta: pairedComparison(playedCA, "pC", "pA", 20240301) },
    vs_B: { n: playedCB.length, logloss_C: loglossStats(playedCB, "pC"), logloss_B: loglossStats(playedCB, "pB"), delta: pairedComparison(playedCB, "pC", "pB", 20240302) },
  };

  // --- item 7 : regle de decision PRE-ENREGISTREE ---
  function conditionPass(deltaResult) { return deltaResult.observed_delta < 0 && deltaResult.ci_upper < 0; }
  const vsA_pass = conditionPass(deltaCA);
  const vsB_pass = conditionPass(deltaCB);
  const brierNoDegradationVsA = !(brierDeltaCA.ci_lower > 0);
  const calibrationFinite = Number.isFinite(calC_onCA.intercept) && Number.isFinite(calC_onCA.slope) && Number.isFinite(calC_onCB.intercept) && Number.isFinite(calC_onCB.slope);
  const numericalClean = numericalNaN === 0 && numericalInf === 0;
  const determinismClean = determinismFailures === 0;
  const guardrailsPass = brierNoDegradationVsA && calibrationFinite && numericalClean && determinismClean;

  let PLAYER_SCORER_PL, reasonCode;
  if (vsA_pass && vsB_pass && guardrailsPass) {
    PLAYER_SCORER_PL = "VALIDATED"; reasonCode = "VALIDATED_PL";
  } else if (vsA_pass && guardrailsPass && deltaCB.observed_delta < 0 && !vsB_pass) {
    PLAYER_SCORER_PL = "VALIDATED_VS_PRIMARY_BASELINE / LEGACY_INCONCLUSIVE"; reasonCode = "B_CI_CROSSES_ZERO_REDUCED_SUPPORT";
  } else if (vsA_pass && guardrailsPass) {
    PLAYER_SCORER_PL = "INCONCLUSIVE"; reasonCode = "B_COMPARISON_NOT_FAVORABLE";
  } else if (!guardrailsPass) {
    PLAYER_SCORER_PL = "INCONCLUSIVE"; reasonCode = "GUARDRAIL_FAILURE";
  } else {
    PLAYER_SCORER_PL = "REJECTED"; reasonCode = "DOES_NOT_BEAT_PRIMARY_BASELINE";
  }

  return {
    final_candidate_manifest: finalCandidateManifest, final_candidate_manifest_hash: finalCandidateManifestHash,
    dataset_version: datasetManifest.dataset_version,
    coverage: {
      total_fixtures_2024_25: totalFixturesSeason, fixtures_m0_valid_cached: targets.length, fixtures_evaluated: fixturesCovered, total_player_rows: totalPlayerRows,
      coverage_A: coverageA, coverage_B: coverageB, coverage_C: coverageC,
      exclusions: { B_below_min_appearances_3: exclusionReasons.B_below_min_appearances },
      support_C_vs_A: supportCA.length, support_C_vs_B: supportCB.length,
    },
    logloss: { A_on_CvA: loglossA_onCA, C_on_CvA: loglossC_onCA, B_on_CvB: loglossB_onCB, C_on_CvB: loglossC_onCB },
    delta: { CA: deltaCA, CB: deltaCB },
    brier: { A_on_CvA: brierA_onCA, C_on_CvA: brierC_onCA, B_on_CvB: brierB_onCB, C_on_CvB: brierC_onCB, delta_CA: brierDeltaCA, delta_CB: brierDeltaCB },
    calibration: { A: calA, C_on_CvA: calC_onCA, B: calB, C_on_CvB: calC_onCB },
    top1_hit_rate: { A: topA, B: topB, C: topC },
    position_diagnostics: { vs_A: posOnCA, vs_B: posOnCB },
    temporal_diagnostics: { first_half_season: firstHalfStats, second_half_season: secondHalfStats, monthly: monthlyDiagnostics },
    outfield_only_sensitivity: outfield,
    played_minutes_sensitivity: playedMinutes,
    numerical_sanity: { n_nan: numericalNaN, n_inf: numericalInf, determinism_failures: determinismFailures },
    decision: {
      vsA_pass, vsB_pass, brier_no_degradation_vs_A: brierNoDegradationVsA, calibration_finite: calibrationFinite, numerical_clean: numericalClean, determinism_clean: determinismClean, guardrails_pass: guardrailsPass,
      PLAYER_SCORER_PL, reason_code: reasonCode,
      current_player_champion_pl: PLAYER_SCORER_PL === "VALIDATED" ? "PLAYER_SCORER_V1_AGGREGATED_SHARE" : null,
    },
  };
}

function stripVolatile(obj) {
  const clone = JSON.parse(JSON.stringify(obj));
  return clone;
}

function main() {
  const startedAt = Date.now();
  console.log("=== Run 1/2 (reproductibilite, item 15) ===");
  const result1 = computeAll();
  console.log("=== Run 2/2 (reproductibilite, item 15) ===");
  const result2 = computeAll();
  const hash1 = sha256Hex(JSON.stringify(stripVolatile(result1)));
  const hash2 = sha256Hex(JSON.stringify(stripVolatile(result2)));
  const reproducible = hash1 === hash2;
  console.log(`reproductibilite : hash_run1=${hash1} hash_run2=${hash2} REPRODUCIBLE=${reproducible}`);

  const result = result1;
  console.log("\n=== FINAL_CANDIDATE_MANIFEST ===");
  console.log(`hash=${result.final_candidate_manifest_hash}`);
  console.log(`dataset_version=${result.dataset_version}`);

  console.log("\n=== Coverage ===");
  console.log(JSON.stringify(result.coverage));

  console.log("\n=== Logloss ===");
  console.log(`C vs A support (n=${result.logloss.C_on_CvA.n}) : A=${result.logloss.A_on_CvA.mean_logloss.toFixed(6)} C=${result.logloss.C_on_CvA.mean_logloss.toFixed(6)}`);
  console.log(`C vs B support (n=${result.logloss.C_on_CvB.n}) : B=${result.logloss.B_on_CvB.mean_logloss.toFixed(6)} C=${result.logloss.C_on_CvB.mean_logloss.toFixed(6)}`);
  console.log(`delta_CA=${result.delta.CA.observed_delta.toFixed(6)} relative_gain=${result.delta.CA.relative_gain_pct.toFixed(3)}% CI95=[${result.delta.CA.ci_lower.toFixed(6)},${result.delta.CA.ci_upper.toFixed(6)}] P(C_better)=${result.delta.CA.probability_a_better.toFixed(4)}`);
  console.log(`delta_CB=${result.delta.CB.observed_delta.toFixed(6)} relative_gain=${result.delta.CB.relative_gain_pct.toFixed(3)}% CI95=[${result.delta.CB.ci_lower.toFixed(6)},${result.delta.CB.ci_upper.toFixed(6)}] P(C_better)=${result.delta.CB.probability_a_better.toFixed(4)}`);

  console.log("\n=== Brier ===");
  console.log(`A=${result.brier.A_on_CvA.mean_brier.toFixed(6)} C(vs A support)=${result.brier.C_on_CvA.mean_brier.toFixed(6)} delta_CA=${result.brier.delta_CA.observed_delta.toFixed(6)} CI95=[${result.brier.delta_CA.ci_lower.toFixed(6)},${result.brier.delta_CA.ci_upper.toFixed(6)}]`);
  console.log(`B=${result.brier.B_on_CvB.mean_brier.toFixed(6)} C(vs B support)=${result.brier.C_on_CvB.mean_brier.toFixed(6)} delta_CB=${result.brier.delta_CB.observed_delta.toFixed(6)} CI95=[${result.brier.delta_CB.ci_lower.toFixed(6)},${result.brier.delta_CB.ci_upper.toFixed(6)}]`);

  console.log("\n=== Calibration ===");
  console.log(`A: intercept=${result.calibration.A.intercept.toFixed(4)} slope=${result.calibration.A.slope.toFixed(4)} ECE=${result.calibration.A.ece.toFixed(4)}`);
  console.log(`C(vs A support): intercept=${result.calibration.C_on_CvA.intercept.toFixed(4)} slope=${result.calibration.C_on_CvA.slope.toFixed(4)} ECE=${result.calibration.C_on_CvA.ece.toFixed(4)}`);
  console.log(`B: intercept=${result.calibration.B.intercept.toFixed(4)} slope=${result.calibration.B.slope.toFixed(4)} ECE=${result.calibration.B.ece.toFixed(4)}`);
  console.log(`C(vs B support): intercept=${result.calibration.C_on_CvB.intercept.toFixed(4)} slope=${result.calibration.C_on_CvB.slope.toFixed(4)} ECE=${result.calibration.C_on_CvB.ece.toFixed(4)}`);

  console.log("\n=== Top-1 hit rate ===");
  console.log(`A=${result.top1_hit_rate.A ? (result.top1_hit_rate.A.hit_rate * 100).toFixed(2) : "n/a"}% B=${result.top1_hit_rate.B ? (result.top1_hit_rate.B.hit_rate * 100).toFixed(2) : "n/a"}% C=${result.top1_hit_rate.C ? (result.top1_hit_rate.C.hit_rate * 100).toFixed(2) : "n/a"}%`);

  console.log("\n=== Position diagnostics (vs A support) ===");
  for (const g of ["F", "M", "D", "G", "UNKNOWN"]) if (result.position_diagnostics.vs_A.C[g]) console.log(`${g}: n=${result.position_diagnostics.vs_A.C[g].n} observed=${result.position_diagnostics.vs_A.C[g].observed_scorer_rate.toFixed(4)} logloss_C=${result.position_diagnostics.vs_A.C[g].logloss.toFixed(4)} logloss_A=${result.position_diagnostics.vs_A.A[g].logloss.toFixed(4)}`);

  console.log("\n=== Temporal diagnostics ===");
  console.log(`first_half n=${result.temporal_diagnostics.first_half_season.n} logloss_C=${result.temporal_diagnostics.first_half_season.logloss_C.toFixed(4)} logloss_A=${result.temporal_diagnostics.first_half_season.logloss_A.toFixed(4)}`);
  console.log(`second_half n=${result.temporal_diagnostics.second_half_season.n} logloss_C=${result.temporal_diagnostics.second_half_season.logloss_C.toFixed(4)} logloss_A=${result.temporal_diagnostics.second_half_season.logloss_A.toFixed(4)}`);

  console.log("\n=== OUTFIELD_ONLY sensitivity (item 8, secondaire) ===");
  console.log(`vs A: n=${result.outfield_only_sensitivity.vs_A.n} logloss_C=${result.outfield_only_sensitivity.vs_A.logloss_C.mean_logloss.toFixed(4)} logloss_A=${result.outfield_only_sensitivity.vs_A.logloss_A.mean_logloss.toFixed(4)} delta=${result.outfield_only_sensitivity.vs_A.delta.observed_delta.toFixed(4)} CI95=[${result.outfield_only_sensitivity.vs_A.delta.ci_lower.toFixed(4)},${result.outfield_only_sensitivity.vs_A.delta.ci_upper.toFixed(4)}]`);
  console.log(`vs B: n=${result.outfield_only_sensitivity.vs_B.n} logloss_C=${result.outfield_only_sensitivity.vs_B.logloss_C.mean_logloss.toFixed(4)} logloss_B=${result.outfield_only_sensitivity.vs_B.logloss_B.mean_logloss.toFixed(4)} delta=${result.outfield_only_sensitivity.vs_B.delta.observed_delta.toFixed(4)} CI95=[${result.outfield_only_sensitivity.vs_B.delta.ci_lower.toFixed(4)},${result.outfield_only_sensitivity.vs_B.delta.ci_upper.toFixed(4)}]`);

  console.log("\n=== PLAYED_MINUTES>0 sensitivity (item 9, descriptif) ===");
  console.log(`vs A: n=${result.played_minutes_sensitivity.vs_A.n} logloss_C=${result.played_minutes_sensitivity.vs_A.logloss_C.mean_logloss.toFixed(4)} logloss_A=${result.played_minutes_sensitivity.vs_A.logloss_A.mean_logloss.toFixed(4)}`);
  console.log(`vs B: n=${result.played_minutes_sensitivity.vs_B.n} logloss_C=${result.played_minutes_sensitivity.vs_B.logloss_C.mean_logloss.toFixed(4)} logloss_B=${result.played_minutes_sensitivity.vs_B.logloss_B.mean_logloss.toFixed(4)}`);

  console.log("\n=== Numerical sanity ===");
  console.log(JSON.stringify(result.numerical_sanity));

  console.log("\n=== DECISION (item 7/16) ===");
  console.log(JSON.stringify(result.decision, null, 2));

  const report = { generated_at: new Date().toISOString(), reproducible, hash_run1: hash1, hash_run2: hash2, ...result };
  const reportPath = path.join(__dirname, "..", "data", "player-lab", "oos-final-2024-25-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const reportHash = sha256Hex(JSON.stringify(report));
  console.log(`\nreport_path=${reportPath}`);
  console.log(`report_hash=${reportHash}`);
  console.log(`elapsed_ms=${Date.now() - startedAt}`);
  console.log("\nSTOP - aucune donnee/metrique 2025-26 consultee dans ce script.");
}

main();
