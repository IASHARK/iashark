#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 - Player OOS_FINAL (2026-09-06). UNIQUE
// run de confirmation, sur 2024-25 SEULEMENT. Priors et rho GELES
// (recalcules deterministiquement depuis les MEMES donnees TRAIN,
// jamais retunes). Execute DEUX FOIS (reproductibilite). Support
// commun MAXIMAL SEPARE pour C-vs-A et C-vs-B.
//
// Usage : node scripts/run-player-oos-final.js --league-key=laliga

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
const { runWalkForward } = require("../lib/lab/walkforward-runner.js");
const { predictWithRho } = require("../lib/lab/dc-matrix-with-rho.js");
const { isoWeekKey, mean, pairedBlockBootstrapDelta, calibrationInterceptSlope, reliabilityBins, expectedCalibrationError, sha256Hex } = require("../lib/player-lab/oos-eval-metrics.js");

const N_DRAWS_V1 = 3000;
const N_BOOTSTRAP_REPS = 10000;

function parseArgs() { const args = {}; for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; } return args; }
function loadLeagueConfig(leagueKey) { const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8")); return config.leagues.find((l) => l.key === leagueKey); }
function loadFixtures(leagueKey, season) { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8")).map((f) => ({ ...f, season })); }

function computeAll(leagueKey) {
  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  const { manifest: playerManifest, hash: playerManifestHash } = JSON.parse(fs.readFileSync(path.join(factoryDir, "player-oos-final-manifest.json"), "utf8"));
  const { manifest: scoreManifest } = JSON.parse(fs.readFileSync(path.join(factoryDir, "score-oos-final-manifest.json"), "utf8"));
  const rhoFinal = scoreManifest.rho.final_value;
  const leagueAvgH = scoreManifest.league_averages.leagueAvgH;
  const leagueAvgA = scoreManifest.league_averages.leagueAvgA;

  const seasonsForHistory = [sp.warmup, sp.train, sp.oos_dev, sp.oos_final];
  const rowsByPlayer = new Map();
  const fixtureRawByFixtureId = new Map();
  const allRowsFlat = [];
  const allGoalEventsFlat = [];
  for (const season of seasonsForHistory) {
    const fixtures = loadFixtures(leagueKey, season);
    for (const fx of fixtures) {
      if (!isCached("lineups", fx.fixture_id) || !isCached("players", fx.fixture_id) || !isCached("events", fx.fixture_id)) continue;
      const lineupsRaw = readCached("lineups", fx.fixture_id).raw_payload;
      const playersRaw = readCached("players", fx.fixture_id).raw_payload;
      const eventsRaw = readCached("events", fx.fixture_id).raw_payload;
      fixtureRawByFixtureId.set(fx.fixture_id, { fixtureMeta: fx, lineupsRaw, playersRaw, eventsRaw });
      const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: fx, lineupsRaw, playersRaw, sourceHashes: {} });
      const { goalEvents } = extractGoalEvents(fx, eventsRaw);
      allGoalEventsFlat.push(...goalEvents.map((g) => ({ ...g, season })));
      for (const row of rows) { allRowsFlat.push(row); if (!rowsByPlayer.has(row.player_id)) rowsByPlayer.set(row.player_id, []); rowsByPlayer.get(row.player_id).push(row); }
    }
  }
  for (const rows of rowsByPlayer.values()) rows.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  const v1Priors = fitAllPriorsFromTrain(allRowsFlat, allGoalEventsFlat); // deterministe, TRAIN unique et identique au DEV - jamais retune

  const trainRowsForLeagueMean = allRowsFlat.filter((r) => r.season === sp.train);
  const leagueMeanRatePer90 = (() => { const goals = trainRowsForLeagueMean.reduce((s, r) => s + (r.goals || 0), 0); const minutes90 = trainRowsForLeagueMean.reduce((s, r) => s + (r.minutes || 0), 0) / 90; return minutes90 > 0 ? goals / minutes90 : 0.05; })();
  const trainFixturesMeta = loadFixtures(leagueKey, sp.train);
  const leagueMeanGoalsPerTeamPerMatch = (() => { let sum = 0, n = 0; for (const fx of trainFixturesMeta) { if (fx.goals_home_90 == null || fx.goals_away_90 == null) continue; sum += fx.goals_home_90 + fx.goals_away_90; n += 2; } return n > 0 ? sum / n : 1.4; })();

  // M0 lambdas pour 2024 (champion Score courant, INCONCLUSIVE mais pas rejete - reste le candidat utilise)
  const warmup = loadFixtures(leagueKey, sp.warmup), train = loadFixtures(leagueKey, sp.train), oosDev = loadFixtures(leagueKey, sp.oos_dev), oosFinal = loadFixtures(leagueKey, sp.oos_final);
  const constantRhoFitter = () => ({ rho_hat: rhoFinal, convergence: true, on_boundary: false });
  const wf = runWalkForward({ allFixtures: [...warmup, ...train, ...oosDev, ...oosFinal], trainSeasons: [sp.warmup, sp.train, sp.oos_dev], oosSeasons: [sp.oos_final], championRho: 0, candidateRhoFitter: constantRhoFitter, leagueAvgH, leagueAvgA, leagueId: league.apiFootballId });
  const m0LambdasByFixture = new Map(wf.predictions.map((p) => [p.fixture_id, { lambdaH: p.lambdaH, lambdaA: p.lambdaA }])); // p.rho_m1 = rhoFinal (candidat M0 dans ce runner)

  const perRowRecords = [];
  const scorerSelectionRowsByModel = { A: [], B: [], C: [] };
  let numericalNaN = 0, numericalInf = 0, determinismFailures = 0;
  let coverageA = 0, coverageB = 0, coverageC = 0, totalPlayerRows = 0, fixturesCovered = 0;
  const antiLeakageChecks = [];

  for (const fx of oosFinal) {
    const cached = fixtureRawByFixtureId.get(fx.fixture_id);
    const lambdas = m0LambdasByFixture.get(fx.fixture_id);
    if (!cached || !lambdas) continue;
    const { lineupsRaw, playersRaw, eventsRaw } = cached;
    const lineupTeams = (lineupsRaw && lineupsRaw.response) || [];
    if (lineupTeams.length !== 2) continue;
    const { rows: targetRows } = buildPlayerMatchRowsForFixture({ fixtureMeta: fx, lineupsRaw, playersRaw, sourceHashes: {} });
    if (!targetRows.length) continue;
    const { goalEvents } = extractGoalEvents(fx, eventsRaw);
    const nonOwnScorers = new Set(goalEvents.filter((g) => !g.own_goal_flag && g.player_id != null).map((g) => g.player_id));
    fixturesCovered++;

    const { matrix } = predictWithRho(lambdas.lambdaH, lambdas.lambdaA, rhoFinal);
    const homeGoalDist = teamGoalDistribution(matrix, "HOME");
    const awayGoalDist = teamGoalDistribution(matrix, "AWAY");
    const isoWeek = isoWeekKey(fx.kickoff_timestamp);

    function buildV1CandidatesForTeam(teamRows) {
      return teamRows.map((row) => {
        const history = reconstructCumulativeHistoryBeforeCutoff(rowsByPlayer.get(row.player_id) || [], fx.kickoff_timestamp);
        if (antiLeakageChecks.length < 300) antiLeakageChecks.push(!history.some((h) => h.fixture_id === row.fixture_id));
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
        if (row.lineup_role === "STARTER") presenceMass = presenceMassForGoal(v1Priors.goal_timing_distribution, presenceByBinForStarter(expectedMinutesPostLineup(exposurePosterior, "STARTER")));
        else { const entryMinute = 90 - exposurePosterior.mean_minutes_if_sub_used; presenceMass = presenceMassForGoal(v1Priors.goal_timing_distribution, presenceByBinForSub(entryMinute, exposurePosterior.p_enter_if_bench)); }
        return { player_id: row.player_id, gamma_alpha: gammaParams.alpha, gamma_beta: gammaParams.beta, presence_mass: presenceMass };
      });
    }
    const homeRows = targetRows.filter((r) => r.home_away === "HOME"), awayRows = targetRows.filter((r) => r.home_away === "AWAY");
    const seedV1 = crypto.createHash("sha256").update(`${fx.fixture_id}|PLAYER_SCORER_V1_AGGREGATED_SHARE_${leagueKey.toUpperCase()}|OOS_FINAL`).digest().readUInt32BE(0);
    const v1HomeCandidates = buildV1CandidatesForTeam(homeRows), v1AwayCandidates = buildV1CandidatesForTeam(awayRows);
    const v1HomeSim = simulateAnytimeScorer(v1HomeCandidates, v1Priors.own_goal_rate.own_goal_mass, homeGoalDist, N_DRAWS_V1, seedV1);
    const v1AwaySim = simulateAnytimeScorer(v1AwayCandidates, v1Priors.own_goal_rate.own_goal_mass, awayGoalDist, N_DRAWS_V1, seedV1 + 1);
    const v1ByPlayer = new Map([...v1HomeSim, ...v1AwaySim].map((r) => [r.player_id, r.posterior_mean]));
    if (fx.fixture_id % 10 === 0) { const v1HomeSim2 = simulateAnytimeScorer(v1HomeCandidates, v1Priors.own_goal_rate.own_goal_mass, homeGoalDist, N_DRAWS_V1, seedV1); if (JSON.stringify(v1HomeSim) !== JSON.stringify(v1HomeSim2)) determinismFailures++; }

    const modelAByPlayer = new Map(), modelBByPlayer = new Map();
    for (const row of targetRows) {
      const history = reconstructCumulativeHistoryBeforeCutoff(rowsByPlayer.get(row.player_id) || [], fx.kickoff_timestamp);
      const shrunkRate = baselineA_simpleShrunkRate(history, leagueMeanRatePer90);
      const expMinutesA = row.lineup_role === "STARTER" ? 90 : 0;
      modelAByPlayer.set(row.player_id, 1 - Math.exp(-shrunkRate * (expMinutesA / 90)));
      const appearences = history.filter((r) => r.minutes > 0).length;
      const lineupsCount = history.filter((r) => r.lineup_role === "STARTER").length;
      const totalMinutes = history.reduce((s, r) => s + (r.minutes || 0), 0);
      const totalGoalsAll = history.reduce((s, r) => s + (r.goals || 0), 0);
      const totalPenaltyGoals = history.reduce((s, r) => s + (r.penalty_scored || 0), 0);
      const minutes90All = totalMinutes / 90;
      const ratePer90 = minutes90All > 0 ? totalGoalsAll / minutes90All : null;
      const penaltyGoalsPer90 = minutes90All > 0 ? totalPenaltyGoals / minutes90All : 0;
      const historicalCounts = history.filter((r) => r.minutes > 0).map((r) => r.goals || 0);
      const teamAttackMultiplier = (row.home_away === "HOME" ? lambdas.lambdaH : lambdas.lambdaA) / leagueMeanGoalsPerTeamPerMatch;
      const legacyOutput = buildPlayerMarketOutput({ fixtureId: fx.fixture_id, playerId: row.player_id, market: "ANYTIME_GOALSCORER", lineupStatus: row.lineup_role === "STARTER" ? "confirmed_starter" : "confirmed_bench", historicalMinutes: { appearences, lineups: lineupsCount, minutes: totalMinutes }, ratePer90, teamAttackMultiplier, opponentDefenseMultiplier: 1, penaltyGoalsPer90, historicalCounts });
      modelBByPlayer.set(row.player_id, legacyOutput && legacyOutput.output ? legacyOutput.output.probability : null);
    }

    let bestA = null, bestB = null, bestC = null;
    for (const row of targetRows) {
      totalPlayerRows++;
      const pA = modelAByPlayer.get(row.player_id), pB = modelBByPlayer.get(row.player_id), pC = v1ByPlayer.get(row.player_id);
      const y = nonOwnScorers.has(row.player_id) ? 1 : 0;
      [pA, pB, pC].forEach((p) => { if (p != null) { if (Number.isNaN(p)) numericalNaN++; else if (!Number.isFinite(p)) numericalInf++; } });
      if (pA != null && Number.isFinite(pA)) coverageA++;
      if (pB != null && Number.isFinite(pB)) coverageB++;
      if (pC != null && Number.isFinite(pC)) coverageC++;
      perRowRecords.push({ fixture_id: fx.fixture_id, iso_week: isoWeek, player_id: row.player_id, position_group: resolvePositionGroup(row.position), home_away: row.home_away, lineup_role: row.lineup_role, minutes: row.minutes, y, pA: pA != null && Number.isFinite(pA) ? pA : null, pB: pB != null && Number.isFinite(pB) ? pB : null, pC: pC != null && Number.isFinite(pC) ? pC : null });
      if (pA != null && (bestA == null || pA > bestA.p)) bestA = { player_id: row.player_id, p: pA };
      if (pB != null && (bestB == null || pB > bestB.p)) bestB = { player_id: row.player_id, p: pB };
      if (pC != null && (bestC == null || pC > bestC.p)) bestC = { player_id: row.player_id, p: pC };
    }
    const actualScorerIds = [...nonOwnScorers];
    if (bestA) scorerSelectionRowsByModel.A.push({ fixture_id: fx.fixture_id, selected_player_id: bestA.player_id, actual_scorer_ids: actualScorerIds, selected_player_probability: bestA.p });
    if (bestB) scorerSelectionRowsByModel.B.push({ fixture_id: fx.fixture_id, selected_player_id: bestB.player_id, actual_scorer_ids: actualScorerIds, selected_player_probability: bestB.p });
    if (bestC) scorerSelectionRowsByModel.C.push({ fixture_id: fx.fixture_id, selected_player_id: bestC.player_id, actual_scorer_ids: actualScorerIds, selected_player_probability: bestC.p });
  }

  function logloss(p, y) { const c = Math.min(Math.max(p, 1e-12), 1 - 1e-12); return y === 1 ? -Math.log(c) : -Math.log(1 - c); }
  function brier(p, y) { return (p - y) * (p - y); }
  function loglossStats(rows, field) { const usable = rows.filter((r) => r[field] != null); if (!usable.length) return null; const losses = usable.map((r) => logloss(r[field], r.y)); return { n: usable.length, mean_logloss: mean(losses), total_logloss: losses.reduce((a, b) => a + b, 0) }; }
  function brierStats(rows, field) { const usable = rows.filter((r) => r[field] != null); if (!usable.length) return null; return { n: usable.length, mean_brier: mean(usable.map((r) => brier(r[field], r.y))) }; }
  function pairedComparison(rows, fieldC, fieldBase, seed) { const usableRows = rows.map((r) => ({ block: r.iso_week, valueA: logloss(r[fieldC], r.y), valueB: logloss(r[fieldBase], r.y) })); return pairedBlockBootstrapDelta(usableRows, N_BOOTSTRAP_REPS, seed); }
  function brierComparison(rows, fieldC, fieldBase, seed) { const usableRows = rows.map((r) => ({ block: r.iso_week, valueA: brier(r[fieldC], r.y), valueB: brier(r[fieldBase], r.y) })); return pairedBlockBootstrapDelta(usableRows, N_BOOTSTRAP_REPS, seed); }
  function calibrationReport(rows, field) { const usable = rows.filter((r) => r[field] != null).map((r) => ({ p: r[field], y: r.y })); const fit = calibrationInterceptSlope(usable); const bins = reliabilityBins(usable, 10); const ece = expectedCalibrationError(bins, usable.length); return { n: usable.length, intercept: fit.intercept, slope: fit.slope, converged: fit.converged, ece }; }
  function topOneHitRate(rows) { if (!rows.length) return null; const hits = rows.filter((r) => r.actual_scorer_ids.includes(r.selected_player_id)).length; return { n: rows.length, hits, hit_rate: hits / rows.length, mean_selected_probability: mean(rows.map((r) => r.selected_player_probability)) }; }

  const supportCA = perRowRecords.filter((r) => r.pA != null && r.pC != null);
  const supportCB = perRowRecords.filter((r) => r.pB != null && r.pC != null);
  const loglossA = loglossStats(supportCA, "pA"), loglossC_onCA = loglossStats(supportCA, "pC");
  const loglossB = loglossStats(supportCB, "pB"), loglossC_onCB = loglossStats(supportCB, "pC");
  const deltaCA = pairedComparison(supportCA, "pC", "pA", 40240101);
  const deltaCB = supportCB.length ? pairedComparison(supportCB, "pC", "pB", 40240102) : null;
  const brierA = brierStats(supportCA, "pA"), brierC_onCA = brierStats(supportCA, "pC");
  const brierB = brierStats(supportCB, "pB"), brierC_onCB = brierStats(supportCB, "pC");
  const brierDeltaCA = brierComparison(supportCA, "pC", "pA", 40240103);
  const brierDeltaCB = supportCB.length ? brierComparison(supportCB, "pC", "pB", 40240104) : null;
  const calA = calibrationReport(supportCA, "pA"), calC_onCA = calibrationReport(supportCA, "pC");
  const calB = calibrationReport(supportCB, "pB"), calC_onCB = calibrationReport(supportCB, "pC");
  const topA = topOneHitRate(scorerSelectionRowsByModel.A), topB = topOneHitRate(scorerSelectionRowsByModel.B), topC = topOneHitRate(scorerSelectionRowsByModel.C);

  const outfieldCA = supportCA.filter((r) => ["F", "M", "D"].includes(r.position_group));
  const outfieldCB = supportCB.filter((r) => ["F", "M", "D"].includes(r.position_group));
  const outfield = { vs_A: { n: outfieldCA.length, delta: pairedComparison(outfieldCA, "pC", "pA", 40240201) }, vs_B: { n: outfieldCB.length, delta: outfieldCB.length ? pairedComparison(outfieldCB, "pC", "pB", 40240202) : null } };
  const playedCA = supportCA.filter((r) => r.minutes > 0), playedCB = supportCB.filter((r) => r.minutes > 0);
  const playedMinutes = { vs_A: { n: playedCA.length, logloss_C: loglossStats(playedCA, "pC"), logloss_A: loglossStats(playedCA, "pA") }, vs_B: { n: playedCB.length, logloss_C: loglossStats(playedCB, "pC"), logloss_B: loglossStats(playedCB, "pB") } };

  function conditionPass(d) { return !!d && d.observed_delta < 0 && d.ci_upper < 0; }
  const vsA_pass = conditionPass(deltaCA);
  const vsB_pass = supportCB.length ? conditionPass(deltaCB) : null;
  const brierNoDegradationVsA = !(brierDeltaCA.ci_lower > 0);
  const brierNoDegradationVsB = brierDeltaCB ? !(brierDeltaCB.ci_lower > 0) : true;
  const calibrationFinite = Number.isFinite(calC_onCA.intercept) && Number.isFinite(calC_onCA.slope) && (!supportCB.length || (Number.isFinite(calC_onCB.intercept) && Number.isFinite(calC_onCB.slope)));
  const numericalClean = numericalNaN === 0 && numericalInf === 0;
  const determinismClean = determinismFailures === 0;
  const antiLeakageClean = antiLeakageChecks.every((v) => v === true);
  const guardrailsPass = brierNoDegradationVsA && brierNoDegradationVsB && calibrationFinite && numericalClean && determinismClean && antiLeakageClean;

  let PLAYER_SCORER_LALIGA, reasonCode;
  if (vsA_pass && (vsB_pass === true || vsB_pass === null) && guardrailsPass) { PLAYER_SCORER_LALIGA = "VALIDATED"; reasonCode = "VALIDATED_LEAGUE_PLAYER_FINAL"; }
  else if (vsA_pass && guardrailsPass) { PLAYER_SCORER_LALIGA = "INCONCLUSIVE"; reasonCode = "B_COMPARISON_NOT_FAVORABLE"; }
  else if (!guardrailsPass) { PLAYER_SCORER_LALIGA = "INCONCLUSIVE"; reasonCode = "GUARDRAIL_FAILURE"; }
  else { PLAYER_SCORER_LALIGA = "REJECTED"; reasonCode = "DOES_NOT_BEAT_PRIMARY_BASELINE"; }

  return {
    league_key: leagueKey, oos_final_season: sp.oos_final, manifest_hash: playerManifestHash,
    coverage: { fixtures_evaluated: fixturesCovered, total_player_rows: totalPlayerRows, coverage_A: coverageA, coverage_B: coverageB, coverage_C: coverageC, support_C_vs_A: supportCA.length, support_C_vs_B: supportCB.length },
    logloss: { A: loglossA, C_on_CvA: loglossC_onCA, B: loglossB, C_on_CvB: loglossC_onCB },
    delta: { CA: deltaCA, CB: deltaCB },
    brier: { A: brierA, C_on_CvA: brierC_onCA, B: brierB, C_on_CvB: brierC_onCB, delta_CA: brierDeltaCA, delta_CB: brierDeltaCB },
    calibration: { A: calA, C_on_CvA: calC_onCA, B: calB, C_on_CvB: calC_onCB },
    top1_hit_rate: { A: topA, B: topB, C: topC },
    outfield_only_sensitivity: outfield, played_minutes_sensitivity: playedMinutes,
    numerical_sanity: { n_nan: numericalNaN, n_inf: numericalInf, determinism_failures: determinismFailures, anti_leakage_checked: antiLeakageChecks.length, anti_leakage_clean: antiLeakageClean },
    decision: { vsA_pass, vsB_pass, brier_no_degradation_vs_A: brierNoDegradationVsA, brier_no_degradation_vs_B: brierNoDegradationVsB, calibration_finite: calibrationFinite, numerical_clean: numericalClean, determinism_clean: determinismClean, anti_leakage_clean: antiLeakageClean, guardrails_pass: guardrailsPass, PLAYER_SCORER_LALIGA, reason_code: reasonCode },
  };
}

function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/run-player-oos-final.js --league-key=<key>"); process.exit(1); }

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
  const outPath = path.join(factoryDir, "player-oos-final-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nEcrit: ${outPath}`);
}

main();
