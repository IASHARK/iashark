#!/usr/bin/env node
"use strict";
// PLAYER SCORER V2 - COMPETING RISKS (2026-09-05), item 24. Orchestre,
// depuis le cache immuable DEJA collecte (aucun appel API ici) :
//   1. reconstruction des risk-sets R_e pour CHAQUE but open-play reel
//      de TRAIN (2022-23) + taux de reconciliation (target >=99.5%) ;
//   2. calcul des features POINT-IN-TIME (X_goal/X_shot/X_sot) par
//      but, strictement anterieures a chaque fixture ;
//   3. fit Newton-Raphson du modele de risque relatif sur TRAIN
//      uniquement ;
//   4. effets joueurs (empirical Bayes) ;
//   5. goal-clock, substitution, penalty, own-goal (TRAIN uniquement) ;
//   6. manifest experimental (hash) ;
//   7. UNE demonstration bout-en-bout POST_LINEUP_CONDITIONAL sur une
//      fixture REELLE OOS_DEV (differente de la demo V1, 1035076,
//      taguee PRE_OOS_TECHNICAL_DEMO_ONLY - voir demo-guard.js).
// AUCUNE metrique de performance OOS calculee ici (item 17/24 : STOP
// avant tout resultat OOS).

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { readCached, isCached } = require("../lib/player-lab/raw-cache.js");
const { buildPlayerMatchRowsForFixture } = require("../lib/player-lab/build-player-match-table.js");
const { extractGoalEvents } = require("../lib/player-lab/goal-events.js");
const { resolvePositionGroup } = require("../lib/player-lab/position-policy.js");
const { buildRiskSetForGoal, computeReconciliationRate } = require("../lib/player-lab/v2/risk-set.js");
const { fitGoalRatePriors, posteriorGoalRate, fitShotRatePriors, posteriorShotRate, fitSotConversionPriors, posteriorSotConversion, logit, EPS } = require("../lib/player-lab/v2/rate-priors.js");
const { designVector, fitRelativeRiskModel, multiStartStability, codingInvarianceTest, recoverCanonicalAlpha, DEFAULT_REFERENCE_CATEGORY, POSITION_ORDER } = require("../lib/player-lab/v2/relative-risk-model.js");
const { fitPlayerEffects, playerEffect } = require("../lib/player-lab/v2/player-effects.js");
const { fitGoalClock } = require("../lib/player-lab/v2/goal-clock.js");
const { fitSubstitutionModel } = require("../lib/player-lab/v2/substitution-model.js");
const { fitPenaltyTakerCounts } = require("../lib/player-lab/v2/penalty-model.js");
const { fitOwnGoalRate } = require("../lib/player-lab/v2/own-goal-model.js");
const { simulateMatchV2 } = require("../lib/player-lab/v2/simulation-v2.js");
const { EXPERIMENT_MANIFEST_V2, manifestHashV2 } = require("../lib/player-lab/v2/experiment-manifest-v2.js");
const { selectMostProbableScorer } = require("../lib/player-lab/most-probable-scorer.js");
const { isDemoFixture } = require("../lib/player-lab/v2/demo-guard.js");
const { loadRealDataset } = require("../lib/lab/load-real-dataset.js");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");
const { predictWithRho } = require("../lib/lab/dc-matrix-with-rho.js");

const CHAMPION_RHO = -0.0845;
const HISTORY_SEASONS = [2021, 2022]; // WARMUP + TRAIN uniquement pour les features point-in-time de fitting

function loadFixturesMeta(season) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `premier-league-${season}.json`), "utf8"));
}

function main() {
  console.log("=== 1-2. Chargement historique (WARMUP+TRAIN=2021+2022) pour features point-in-time ===");
  const historyFixtures = HISTORY_SEASONS.flatMap((s) => loadFixturesMeta(s).map((f) => ({ ...f, season: s })));
  const rowsByPlayer = new Map(); // player_id -> [{kickoff, position, minutes, open_play_goals, shots, shots_on_target}]
  const fixtureRawByFixtureId = new Map(); // fixture_id -> {fixtureMeta, lineupsRaw, playersRaw, eventsRaw}

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
      if (g.own_goal_flag || g.penalty_flag || g.player_id == null) continue; // open-play uniquement pour ce signal
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

  console.log(`joueurs indexes=${rowsByPlayer.size}`);

  console.log("\n=== 3. Priors de groupe (TRAIN=2022 uniquement) ===");
  // trainOnlyRows reutilise les rows DEJA construites (avec
  // open_play_goals correctement compte par fixture) dans rowsByPlayer -
  // jamais reconstruit avec un champ goal fabrique.
  const trainOnlyRows = [];
  for (const [, rows] of rowsByPlayer) for (const r of rows) if (r.season === 2022) trainOnlyRows.push(r);
  const goalRatePriors = fitGoalRatePriors(trainOnlyRows, resolvePositionGroup);
  const shotRatePriors = fitShotRatePriors(trainOnlyRows, resolvePositionGroup);
  const sotPriors = fitSotConversionPriors(trainOnlyRows, resolvePositionGroup);
  console.log("shot_rate_priors=" + JSON.stringify([...shotRatePriors.entries()]));
  console.log("sot_conversion_priors=" + JSON.stringify([...sotPriors.entries()]));

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

    return { group, xGoal, xShot, xSot, n_prior_matches: history.length };
  }

  console.log("\n=== 4. Reconstruction des risk-sets + reconciliation (TRAIN, buts open-play reels) ===");
  const trainFixtures2022 = loadFixturesMeta(2022);
  const goalsWithRiskSets = [];
  const nrEvents = []; // pour fitRelativeRiskModel
  const substitutionEntries = [];
  const penaltyAttempts = [];
  const ownGoalEventsTrain = [];
  const unreconciledEvents = []; // item 1 : aucune exclusion silencieuse - reason_code explicite par evenement
  const goalClockHomeEvents = [], goalClockAwayEvents = [];
  const residualsByPlayer = new Map(); // pour player-effects (rempli apres 1er fit fixed-effects)

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
        goalsWithRiskSets.push({ scorerId: g.player_id, riskSet, penaltyFlag: g.penalty_flag });
        if (!(g.player_id != null && riskSet.has(g.player_id))) {
          // Diagnostic READ-ONLY (item 1) : ne modifie ni riskSet ni nrEvents,
          // classe uniquement la raison de l'exclusion deja actee par la
          // reconciliation ci-dessus. g.minute vient de goal-events.js
          // (e.time.elapsed SEUL) alors que buildFieldTimeline (risk-set.js)
          // combine elapsed+extra pour les substitutions/cartons - un but en
          // temps additionnel peut donc etre compare a un minute-repere plus
          // petit que la vraie minute d'horloge d'une substitution qui l'a
          // pourtant precede en realite.
          const trueMinute = g.minute + (g.extra_minute || 0);
          const riskSetAtTrueMinute = buildRiskSetForGoal(startingXI, teamEvents, trueMinute);
          const reasonCode = (g.extra_minute && g.player_id != null && riskSetAtTrueMinute.has(g.player_id))
            ? "STOPPAGE_TIME_MINUTE_UNIT_MISMATCH_ELAPSED_ONLY_VS_ELAPSED_PLUS_EXTRA"
            : "SCORER_NOT_ON_FIELD_AT_RECORDED_MINUTE_UNEXPLAINED";
          unreconciledEvents.push({ fixture_id: fx.fixture_id, team_id: teamId, scorer_id: g.player_id, minute: g.minute, extra_minute: g.extra_minute, penalty_flag: g.penalty_flag, reason_code: reasonCode });
        }
        if (g.penalty_flag) { if (g.player_id != null) penaltyAttempts.push({ team_id: teamId, player_id: g.player_id }); continue; }
        if (g.player_id == null || !riskSet.has(g.player_id)) continue; // reconciliation echouee - exclu du fit, compte deja dans le taux ci-dessus
        const riskSetIds = [...riskSet];
        const riskSetRawFeatures = riskSetIds.map((pid) => pointInTimeFeatures(pid, fx.kickoff_timestamp));
        const designVectors = riskSetRawFeatures.map((feat) => designVector(feat.group, feat.xGoal, feat.xShot, feat.xSot));
        // riskSetRawFeatures (traits BRUTS, pre-encodage) conserves pour le
        // test de coding invariance (item 1) - permet de reconstruire un
        // design vector sous n'importe quelle categorie de reference SANS
        // toucher au risk-set ni aux features point-in-time eux-memes.
        nrEvents.push({ riskSetDesignVectors: designVectors, scorerIndex: riskSetIds.indexOf(g.player_id), riskSetIds, riskSetRawFeatures });
        if (teamId === fx.home_team_id) goalClockHomeEvents.push(g); else goalClockAwayEvents.push(g);
      }
    }
    for (const m of missedPenalties) if (m.player_id != null) penaltyAttempts.push({ team_id: m.team_id, player_id: m.player_id });
  }

  const reconciliation = computeReconciliationRate(goalsWithRiskSets);
  console.log(`reconciliation: n_total=${reconciliation.n_total} n_matched=${reconciliation.n_matched} rate=${reconciliation.rate_pct.toFixed(2)}%`);
  console.log(`nr_training_events (open-play, reconcilies)=${nrEvents.length}`);

  console.log("\n=== 4b. Event accounting (item 1 - contrat explicite, aucune exclusion silencieuse) ===");
  const TOTAL_GOALS = ownGoalEventsTrain.length;
  const OWN_GOALS = ownGoalEventsTrain.filter((g) => g.own_goal_flag).length;
  const NON_OWN_GOALS = goalsWithRiskSets.length;
  const PENALTY_GOALS = goalsWithRiskSets.filter((g) => g.penaltyFlag).length;
  const UNRECONCILED = unreconciledEvents.length;
  const OPEN_PLAY_FIT_EVENTS = nrEvents.length;
  console.log(`TOTAL_GOALS=${TOTAL_GOALS} OWN_GOALS=${OWN_GOALS} NON_OWN_GOALS=${NON_OWN_GOALS} PENALTY_GOALS=${PENALTY_GOALS} UNRECONCILED=${UNRECONCILED} OPEN_PLAY_FIT_EVENTS=${OPEN_PLAY_FIT_EVENTS}`);
  console.log(`identity 1 : TOTAL_GOALS(${TOTAL_GOALS}) - OWN_GOALS(${OWN_GOALS}) = ${TOTAL_GOALS - OWN_GOALS} == NON_OWN_GOALS(${NON_OWN_GOALS}) ? ${TOTAL_GOALS - OWN_GOALS === NON_OWN_GOALS}`);
  console.log(`identity 2 : NON_OWN_GOALS(${NON_OWN_GOALS}) - PENALTY_GOALS(${PENALTY_GOALS}) - UNRECONCILED(${UNRECONCILED}) = ${NON_OWN_GOALS - PENALTY_GOALS - UNRECONCILED} == OPEN_PLAY_FIT_EVENTS(${OPEN_PLAY_FIT_EVENTS}) ? ${NON_OWN_GOALS - PENALTY_GOALS - UNRECONCILED === OPEN_PLAY_FIT_EVENTS}`);
  console.log("unreconciled_events=" + JSON.stringify(unreconciledEvents));

  console.log("\n=== 5. Fit Newton-Raphson penalise (relative risk model) - FIT_NUMERICAL_CLOSURE ===");
  const fit = fitRelativeRiskModel(nrEvents, 100);
  console.log(`theta=${JSON.stringify(fit.theta.map((t) => Number(t.toFixed(4))))}`);
  console.log(`converged=${fit.converged} convergence_reason=${fit.convergence_reason} n_iterations=${fit.n_iterations} solve_status=${fit.solve_status} ridge=${fit.ridge}`);
  console.log(`logL=${fit.logL.toFixed(4)} penalized_objective_initial=${fit.objective_initial.toFixed(4)} penalized_objective_final=${fit.objective_final.toFixed(4)}`);
  console.log(`relative_objective_change=${fit.relative_objective_change.toExponential(3)} max_abs_gradient=${fit.max_abs_gradient.toExponential(3)}`);
  console.log(`position_order=${JSON.stringify(fit.position_order)}`);

  console.log("\n=== 5b. Multi-start stability (TRAIN uniquement, item 6, 5 initialisations deterministes) ===");
  const stability = multiStartStability(nrEvents, 100);
  console.log(`n_starts=${stability.n_starts} all_converged=${stability.all_converged} any_non_finite=${stability.any_non_finite}`);
  console.log(`max_objective_spread=${stability.max_objective_spread.toExponential(3)} beta_max_spread=${stability.beta_max_spread.toExponential(3)} max_risk_set_probability_spread=${stability.max_risk_set_probability_spread.toExponential(3)}`);
  console.log("per_start_theta=" + JSON.stringify(stability.fits.map((f) => f.theta.map((t) => Number(t.toFixed(4))))));

  const FIT_CONVERGENCE = fit.converged && stability.all_converged && !stability.any_non_finite && stability.max_objective_spread < 1e-6 && stability.max_risk_set_probability_spread < 1e-6 ? "PASS" : "FAIL";
  console.log(`\nFIT_CONVERGENCE=${FIT_CONVERGENCE}`);

  console.log("\n=== 5c. Coding invariance (memes 964 evenements TRAIN, 4 categories de reference : UNKNOWN/F/M/D) ===");
  const invariance = codingInvarianceTest(nrEvents, ["UNKNOWN", "F", "M", "D"], 100);
  console.log(`references_tested=${JSON.stringify(invariance.references_tested)} all_converged=${invariance.all_converged}`);
  console.log(`max_penalty_matrix_diff=${invariance.max_penalty_matrix_diff.toExponential(3)} (doit etre ~0 : la matrice de penalite canonique I+J ne depend pas de la reference)`);
  console.log(`max_canonical_alpha_diff=${invariance.max_canonical_alpha_diff.toExponential(3)}`);
  console.log(`max_abs_probability_difference=${invariance.max_abs_probability_difference.toExponential(3)}`);
  for (const r of invariance.results) console.log(`  ref=${r.referenceCategory} converged=${r.converged} penalized_objective=${r.penalized_objective.toFixed(4)} canonicalAlpha=${JSON.stringify(r.canonicalAlpha.map(([k, v]) => [k, Number(v.toFixed(4))]))}`);

  const CODING_INVARIANCE = invariance.all_converged && invariance.max_abs_probability_difference <= 1e-8 ? "PASS" : "FAIL";
  console.log(`CODING_INVARIANCE=${CODING_INVARIANCE}`);

  const PLAYER_V2_PRE_OOS_GATE = FIT_CONVERGENCE === "PASS" && CODING_INVARIANCE === "PASS" ? "PASS_FINAL" : "FAIL";
  console.log(`\nPLAYER_V2_PRE_OOS_GATE=${PLAYER_V2_PRE_OOS_GATE}`);

  const canonicalAlphaProd = recoverCanonicalAlpha(fit.theta, POSITION_ORDER, DEFAULT_REFERENCE_CATEGORY);

  console.log("\n=== 6. Effets joueurs (empirical Bayes sur residus, APRES le fit a effets fixes) ===");
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
  console.log(`n_players_with_effects=${playerEffects.size}`);
  const sortedEffects = [...playerEffects.entries()].sort((a, b) => b[1].u_i - a[1].u_i).slice(0, 3);
  console.log("top3_u_i=" + JSON.stringify(sortedEffects));

  console.log("\n=== 7. Goal clock (HOME/AWAY, TRAIN) ===");
  const goalClockHome = fitGoalClock(goalClockHomeEvents);
  const goalClockAway = fitGoalClock(goalClockAwayEvents);
  console.log(`n_home_goals=${goalClockHomeEvents.length} n_away_goals=${goalClockAwayEvents.length}`);

  console.log("\n=== 8. Substitution model (TRAIN) ===");
  const substitutionModel = fitSubstitutionModel(substitutionEntries);
  console.log(`n_team_matches=${substitutionModel.n_team_matches} mean_subs=${substitutionModel.mean_substitutions_per_match.toFixed(2)}`);

  console.log("\n=== 9. Penalty + own-goal (TRAIN) ===");
  const penaltyTakerCounts = fitPenaltyTakerCounts(penaltyAttempts);
  const ownGoalRate = fitOwnGoalRate(ownGoalEventsTrain);
  console.log(`n_penalty_attempts=${penaltyAttempts.length} omega_own=${ownGoalRate.omega_own.toFixed(4)}`);
  const totalGoalsTrain = ownGoalEventsTrain.length;
  const penaltyGoalsTrain = ownGoalEventsTrain.filter((g) => g.penalty_flag).length;
  const omegaPen = totalGoalsTrain > 0 ? penaltyGoalsTrain / totalGoalsTrain : 0;
  console.log(`omega_pen=${omegaPen.toFixed(4)}`);

  console.log("\n=== 10. Manifest experimental V2 ===");
  console.log("manifest_hash_v2=" + manifestHashV2(EXPERIMENT_MANIFEST_V2));

  console.log("\n=== 11. Demonstration bout-en-bout POST_LINEUP_CONDITIONAL (fixture reelle OOS_DEV, differente de 1035076) ===");
  const dataset = loadRealDataset();
  const previousSeasonFixturesBySeasons = new Map();
  for (const season of dataset.oosSeasons) previousSeasonFixturesBySeasons.set(season, dataset.allFixtures.filter((f) => f.season === season - 1));
  const { predictions } = runWalkForwardM2C({ ...dataset, previousSeasonFixturesBySeasons });
  const target = predictions.find((p) => p.season === 2023 && p.m0_valid && isCached("lineups", p.fixture_id) && !isDemoFixture(p.fixture_id) && p.fixture_id !== 1035076);
  if (!target) { console.log("Aucune fixture eligible trouvee."); return; }
  console.log(`fixture_id=${target.fixture_id} (differente de la demo V1 1035076)`);

  const { matrix } = predictWithRho(target.lambdaH_m2, target.lambdaA_m2, CHAMPION_RHO);
  const fixtureMeta = dataset.allFixtures.find((f) => f.fixture_id === target.fixture_id);
  const lineupsRaw = readCached("lineups", target.fixture_id).raw_payload;
  const playersRaw = readCached("players", target.fixture_id).raw_payload;
  const lineupTeams = lineupsRaw.response;

  function buildTeamConfig(lineupTeam, goalClock) {
    const startingXI = (lineupTeam.startXI || []).map((p) => p.player.id);
    const bench = (lineupTeam.substitutes || []).map((p) => p.player.id);
    const positionByPlayer = new Map();
    for (const p of [...(lineupTeam.startXI || []), ...(lineupTeam.substitutes || [])]) positionByPlayer.set(p.player.id, resolvePositionGroup(p.player.pos));
    const etaByPlayer = new Map();
    for (const pid of [...startingXI, ...bench]) {
      const feat = pointInTimeFeatures(pid, fixtureMeta.kickoff_timestamp);
      const alpha = canonicalAlphaProd.get(feat.group) ?? canonicalAlphaProd.get(DEFAULT_REFERENCE_CATEGORY); // alpha CANONIQUE (contrainte Sum=0), pas 0 arbitraire - voir CODING_INVARIANCE
      const eta = alpha + fit.theta[POSITION_ORDER.length] * feat.xGoal + fit.theta[POSITION_ORDER.length + 1] * feat.xShot + fit.theta[POSITION_ORDER.length + 2] * feat.xSot + playerEffect(playerEffects, pid);
      etaByPlayer.set(pid, eta);
    }
    return { startingXI, bench, positionByPlayer, etaByPlayer, substitutionModel, goalClock, penaltyTakerCounts: penaltyTakerCounts.get(lineupTeam.team.id) || null };
  }

  const homeTeam = lineupTeams.find((t) => t.team.id === fixtureMeta.home_team_id);
  const awayTeam = lineupTeams.find((t) => t.team.id === fixtureMeta.away_team_id);
  const homeConfig = buildTeamConfig(homeTeam, goalClockHome);
  const awayConfig = buildTeamConfig(awayTeam, goalClockAway);

  const seedBuf = crypto.createHash("sha256").update(`${target.fixture_id}|PLAYER_SCORER_V2_COMPETING_RISKS|${JSON.stringify(matrix).length}`).digest();
  const seed = seedBuf.readUInt32BE(0);
  const results = simulateMatchV2(matrix, homeConfig, awayConfig, ownGoalRate.omega_own, omegaPen, 10000, seed);
  const results2 = simulateMatchV2(matrix, homeConfig, awayConfig, ownGoalRate.omega_own, omegaPen, 10000, seed);
  console.log("determinisme (10000 tirages, meme seed) : " + (JSON.stringify(results) === JSON.stringify(results2) ? "PASS" : "FAIL"));

  const selected = selectMostProbableScorer(results);
  const allNamesTeams = [...(homeTeam.startXI || []), ...(homeTeam.substitutes || []), ...(awayTeam.startXI || []), ...(awayTeam.substitutes || [])];
  const selectedName = (allNamesTeams.find((p) => p.player.id === selected.player_id) || {}).player;
  console.log(`MOST_PROBABLE_SCORER = ${selectedName ? selectedName.name : selected.player_id} (posterior_mean=${selected.posterior_mean.toFixed(4)}, sd=${selected.sd.toFixed(4)}, P10=${selected.p10.toFixed(4)}, P50=${selected.p50.toFixed(4)}, P90=${selected.p90.toFixed(4)})`);

  console.log("\nSTOP - aucun resultat OOS (logloss/hit-rate/calibration) calcule dans ce script.");
}

main();
