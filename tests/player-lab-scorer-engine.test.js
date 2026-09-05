"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05). Tests des composants
// mathematiques purs (formule officielle, conservation de masse,
// echantillonneur Gamma, shrinkage bayesien, exposition, timing,
// penalty/own-goal, simulation deterministe, selection) - SYNTHETIQUE,
// independant de la collecte 4-saisons en cours.

const test = require("node:test");
const assert = require("node:assert/strict");
const { teamGoalDistribution } = require("../lib/player-lab/team-goal-distribution.js");
const { resolvePositionGroup, POSITION_GROUPS, UNKNOWN_GROUP } = require("../lib/player-lab/position-policy.js");
const { fitPositionRatePriors, posteriorCoreRate, PRIOR_STRENGTH_MATCHES90 } = require("../lib/player-lab/core-rate-model.js");
const { fitConversionPriors, posteriorConversion, applyShotsAdjustment } = require("../lib/player-lab/shots-layer.js");
const { fitExposurePriors, posteriorExposure, expectedMinutesPreLineup, expectedMinutesPostLineup } = require("../lib/player-lab/exposure-model.js");
const { fitGoalTimingDistribution, presenceByBinForStarter, presenceByBinForSub, presenceMassForGoal, N_BINS } = require("../lib/player-lab/goal-timing.js");
const { fitOwnGoalRate } = require("../lib/player-lab/own-goal-component.js");
const { fitPenaltyRate, buildPenaltyTakerHierarchy } = require("../lib/player-lab/penalty-component.js");
const { normalizeAttributionShares } = require("../lib/player-lab/attribution.js");
const { scoreProbabilityGivenShare } = require("../lib/player-lab/scoring-formula.js");
const { sampleGamma } = require("../lib/player-lab/gamma-sampler.js");
const { drawScenario, buildCandidateGammaParams, simulateAnytimeScorer } = require("../lib/player-lab/simulation.js");
const { selectMostProbableScorer } = require("../lib/player-lab/most-probable-scorer.js");
const { mulberry32 } = require("../lib/models.js");
const { splitFor, SEASON_SPLIT } = require("../lib/player-lab/season-split.js");
const { baselineA_simpleShrunkRate, baselineB_teamGoalShare, baselineC_legacyPlayerEngine, LEGACY_PLAYER_MODEL } = require("../lib/player-lab/baselines.js");
const { anytimeScorerLogloss, computeSecondaryMetrics, splitMetricsByMode, topOneHitRate, scorerAttributionNLL, clusterBootstrapMean } = require("../lib/player-lab/metrics.js");
const { EXPERIMENT_MANIFEST_V1, manifestHash } = require("../lib/player-lab/experiment-manifest.js");
const { buildPlayerMarketOutput } = require("../lib/markets/player-engine.js");
const { fitAllPriorsFromTrain } = require("../lib/player-lab/fit-all-priors.js");

const EPS = 1e-9;

test("season split : fige, jamais modifiable, 2025 SEALED_UNREAD pour le Player Lab aussi", () => {
  assert.equal(splitFor(2021), "WARMUP");
  assert.equal(splitFor(2022), "TRAIN");
  assert.equal(splitFor(2023), "OOS_DEV");
  assert.equal(splitFor(2024), "OOS_FINAL");
  assert.equal(splitFor(2025), "SEALED_UNREAD");
  assert.ok(Object.isFrozen(SEASON_SPLIT));
});

test("item 4 : p_T(n) derive directement de la matrice M2 (marginale ligne=domicile, colonne=exterieur), aucun nouveau Poisson", () => {
  const matrix = [
    [0.10, 0.15, 0.05],
    [0.20, 0.10, 0.05],
    [0.15, 0.10, 0.10],
  ];
  const home = teamGoalDistribution(matrix, "HOME");
  const away = teamGoalDistribution(matrix, "AWAY");
  assert.ok(Math.abs(home.reduce((a, b) => a + b, 0) - 1) < EPS);
  assert.ok(Math.abs(away.reduce((a, b) => a + b, 0) - 1) < EPS);
  assert.ok(Math.abs(home[0] - 0.30) < EPS); // ligne 0 : 0.10+0.15+0.05
  assert.ok(Math.abs(away[1] - 0.35) < EPS); // colonne 1 : 0.15+0.10+0.10
});

test("item 6 : position policy - UNKNOWN jamais bucket silencieusement dans F/M/D/G", () => {
  assert.equal(resolvePositionGroup("F"), "F");
  assert.equal(resolvePositionGroup("G"), "G");
  assert.equal(resolvePositionGroup(null), UNKNOWN_GROUP);
  assert.equal(resolvePositionGroup("XYZ"), UNKNOWN_GROUP);
  assert.deepEqual(POSITION_GROUPS, ["F", "M", "D", "G"]);
});

test("item 5 : core rate model - shrinkage vers le prior, petit echantillon reste proche du prior, gros echantillon s'en eloigne", () => {
  const trainRows = [
    { position: "F", minutes: 900, goals: 9 }, // 10 matchs, 0.9 but/90 - attaquant prolifique
    { position: "F", minutes: 900, goals: 1 },
    { position: "D", minutes: 900, goals: 1 },
  ];
  const priors = fitPositionRatePriors(trainRows, resolvePositionGroup);
  const forwardPrior = priors.get("F");
  assert.ok(Math.abs(forwardPrior.mean_rate_per_90 - (10 / 20)) < EPS); // (9+1) buts / (900+900)/90 minutes90 = 10/20

  // petit echantillon (1 match, 0 but) - reste proche du prior
  const smallSample = posteriorCoreRate(0, 1, forwardPrior);
  assert.ok(Math.abs(smallSample.mean_rate_per_90 - forwardPrior.mean_rate_per_90) < 0.1, "un seul match sans but ne doit presque pas bouger le taux");

  // gros echantillon (50 matchs, tres prolifique) - s'eloigne nettement du prior
  const bigSample = posteriorCoreRate(60, 50, forwardPrior);
  assert.ok(bigSample.mean_rate_per_90 > forwardPrior.mean_rate_per_90 + 0.3, "un tres gros echantillon prolifique doit s'eloigner nettement du prior");
  assert.equal(PRIOR_STRENGTH_MATCHES90, 10);
});

test("item 5 : shots/SOT auxiliaire - absent (null) laisse le core rate INCHANGE, jamais une baisse artificielle", () => {
  const trainRows = [
    { position: "F", minutes: 900, goals: 10, shots_on_target: 30 },
    { position: "F", minutes: 900, goals: 2, shots_on_target: 10 },
  ];
  const priors = fitConversionPriors(trainRows, resolvePositionGroup);
  const forwardPrior = priors.get("F");

  const withoutData = applyShotsAdjustment(0.5, 3, null, forwardPrior);
  assert.equal(withoutData, 0.5, "shots/SOT absent (null) -> core rate inchange, jamais impute a 0");

  const withGoodConversion = applyShotsAdjustment(0.5, 5, 10, forwardPrior); // conversion tres superieure au groupe
  assert.ok(withGoodConversion > 0.5, "une bonne conversion observee doit AUGMENTER le taux");
});

test("item 7 : exposure model - P(start)/P(entre) appris strictement avant cutoff, bench jamais suppose entrer a coup sur", () => {
  const trainRows = [
    { position: "M", lineup_role: "STARTER", minutes: 90 },
    { position: "M", lineup_role: "BENCH", minutes: 0 },
    { position: "M", lineup_role: "BENCH", minutes: 20 },
  ];
  const priors = fitExposurePriors(trainRows, resolvePositionGroup);
  const midPrior = priors.get("M");
  assert.ok(midPrior.bench_enter_rate > 0 && midPrior.bench_enter_rate < 1, "P(entre|banc) doit etre une vraie probabilite, jamais 0 ni 1 par defaut");

  const playerHistory = [{ lineup_role: "BENCH", minutes: 0 }, { lineup_role: "BENCH", minutes: 0 }, { lineup_role: "BENCH", minutes: 0 }];
  const posterior = posteriorExposure(playerHistory, midPrior);
  assert.ok(posterior.p_enter_if_bench < midPrior.bench_enter_rate, "un joueur jamais entre en 3 convocations doit avoir un P(entre) revu a la baisse vs le prior");

  const preMinutes = expectedMinutesPreLineup(posterior);
  const postMinutesStarter = expectedMinutesPostLineup(posterior, "STARTER");
  const postMinutesBench = expectedMinutesPostLineup(posterior, "BENCH");
  assert.ok(postMinutesStarter > preMinutes, "role CONNU=STARTER doit donner des minutes attendues plus elevees que l'incertitude PRE_LINEUP");
  assert.ok(postMinutesBench < postMinutesStarter);
});

test("item 8 : goal timing - 18 bins, distribution valide, presence-ponderee jamais negative", () => {
  const goalEvents = [
    { minute: 3, extra_minute: null }, { minute: 44, extra_minute: 2 }, { minute: 89, extra_minute: 5 },
  ];
  const dist = fitGoalTimingDistribution(goalEvents);
  assert.equal(dist.length, N_BINS);
  assert.ok(Math.abs(dist.reduce((a, b) => a + b, 0) - 1) < EPS);
  assert.ok(dist.every((p) => p >= 0));

  const starterPresence = presenceByBinForStarter(65); // sorti a la 65e minute
  assert.equal(starterPresence[0], 1); // present bin 0
  assert.equal(starterPresence[17], 0); // absent dernier bin
  const mass = presenceMassForGoal(dist, starterPresence);
  assert.ok(mass >= 0 && mass <= 1);

  const subPresence = presenceByBinForSub(70, 0.6); // entre vers la 70e minute, 60% de chances d'entrer
  assert.equal(subPresence[0], 0);
  assert.ok(subPresence[17] <= 0.6 + EPS);
});

test("item 9 : penalty component - masse et hierarchie des tireurs, jamais un bonus arbitraire", () => {
  const goalEvents = [
    { team_id: 1, player_id: 10, penalty_flag: true, own_goal_flag: false },
    { team_id: 1, player_id: 11, penalty_flag: false, own_goal_flag: false },
  ];
  const missedPenalties = [{ team_id: 1, player_id: 10 }];
  const rate = fitPenaltyRate(goalEvents);
  assert.ok(Math.abs(rate.penalty_mass_share - 0.5) < EPS);
  const hierarchy = buildPenaltyTakerHierarchy(goalEvents, missedPenalties, 1);
  assert.equal(hierarchy[0].player_id, 10);
  assert.equal(hierarchy[0].n_attempts, 2, "un penalty marque + un manque = 2 tentatives, le tireur reste designe apres un echec");
});

test("item 10 : own goal component - masse mesuree depuis TRAIN, jamais 0 par defaut si des CSC existent reellement", () => {
  const goalEvents = Array.from({ length: 100 }, (_, i) => ({ own_goal_flag: i < 3 }));
  const rate = fitOwnGoalRate(goalEvents);
  assert.ok(Math.abs(rate.own_goal_mass - 0.03) < EPS);
});

test("item 11 : attribution - INVARIANT sum(player_shares)+own_goal_share=1 exactement, y compris cas degenere (aucun signal)", () => {
  const rawScores = [{ player_id: 1, score: 3 }, { player_id: 2, score: 1 }, { player_id: 3, score: 0 }];
  const result = normalizeAttributionShares(rawScores, 0.05);
  assert.ok(Math.abs(result.total - 1) < EPS);
  assert.ok(Math.abs(result.shares[0].share - 0.95 * 0.75) < EPS);

  const degenerate = normalizeAttributionShares([{ player_id: 1, score: 0 }, { player_id: 2, score: 0 }], 0.03);
  assert.ok(Math.abs(degenerate.total - 1) < EPS, "cas degenere (aucun signal offensif) : la masse joueur ne doit jamais disparaitre");
  assert.ok(Math.abs(degenerate.shares[0].share - 0.485) < EPS);
});

test("item 12 : formule officielle P_score_i_s = 1 - Sum p_T(n)*(1-pi)^n, cas limites verifies a la main", () => {
  const teamGoalDist = [0.3, 0.4, 0.2, 0.1]; // P(0),P(1),P(2),P(3)
  // pi=0 -> le joueur ne peut jamais marquer, P_score=0
  assert.ok(Math.abs(scoreProbabilityGivenShare(teamGoalDist, 0) - 0) < EPS);
  // pi=1 -> le joueur marque des que l'equipe marque au moins 1 but
  const pAtLeastOneGoal = 1 - teamGoalDist[0];
  assert.ok(Math.abs(scoreProbabilityGivenShare(teamGoalDist, 1) - pAtLeastOneGoal) < EPS);
  // calcul a la main pour pi=0.5 : 1 - (0.3*1 + 0.4*0.5 + 0.2*0.25 + 0.1*0.125)
  const expected = 1 - (0.3 * 1 + 0.4 * 0.5 + 0.2 * 0.25 + 0.1 * 0.125);
  assert.ok(Math.abs(scoreProbabilityGivenShare(teamGoalDist, 0.5) - expected) < EPS);
});

test("gamma sampler : moyenne/variance empiriques convergent vers alpha/beta et alpha/beta^2 (Marsaglia-Tsang valide)", () => {
  const rng = mulberry32(42);
  const alpha = 5, beta = 2;
  const n = 20000;
  let sum = 0, sumSq = 0;
  for (let i = 0; i < n; i++) {
    const x = sampleGamma(alpha, beta, rng);
    sum += x; sumSq += x * x;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  assert.ok(Math.abs(mean - alpha / beta) < 0.05, `moyenne empirique ${mean} doit approcher alpha/beta=${alpha / beta}`);
  assert.ok(Math.abs(variance - alpha / (beta * beta)) < 0.15, `variance empirique ${variance} doit approcher alpha/beta^2=${alpha / (beta * beta)}`);
});

test("simulation : deterministe (meme seed => memes resultats), conservation de masse a CHAQUE tirage, jamais seulement en moyenne", () => {
  const candidates = [
    { player_id: 1, gamma_alpha: 5, gamma_beta: 10, presence_mass: 0.9 },
    { player_id: 2, gamma_alpha: 3, gamma_beta: 10, presence_mass: 0.7 },
    { player_id: 3, gamma_alpha: 2, gamma_beta: 10, presence_mass: 0.5 },
  ];
  const teamGoalDist = [0.25, 0.35, 0.25, 0.10, 0.05];
  const ownGoalMass = 0.03;

  const result1 = simulateAnytimeScorer(candidates, ownGoalMass, teamGoalDist, 2000, 1234);
  const result2 = simulateAnytimeScorer(candidates, ownGoalMass, teamGoalDist, 2000, 1234);
  assert.equal(JSON.stringify(result1), JSON.stringify(result2), "meme seed => resultats byte-identiques");

  const resultDifferentSeed = simulateAnytimeScorer(candidates, ownGoalMass, teamGoalDist, 2000, 999);
  assert.notEqual(JSON.stringify(result1), JSON.stringify(resultDifferentSeed));

  // conservation de masse a chaque tirage individuel (pas juste en moyenne)
  const rng = mulberry32(1234);
  for (let i = 0; i < 500; i++) {
    const scenario = drawScenario(candidates, ownGoalMass, rng);
    assert.ok(Math.abs(scenario.total - 1) < 1e-8, `tirage ${i} : masse totale doit etre 1, obtenu ${scenario.total}`);
  }

  for (const r of result1) {
    assert.ok(r.posterior_mean >= 0 && r.posterior_mean <= 1);
    assert.ok(r.p10 <= r.p50 && r.p50 <= r.p90, "quantiles doivent etre ordonnes P10<=P50<=P90");
  }
});

test("buildCandidateGammaParams : preserve alpha (la forme), ajuste seulement beta pour atteindre la moyenne cible", () => {
  const core = { alpha: 6, beta: 12 }; // mean = 0.5
  const adjusted = buildCandidateGammaParams(core, 0.8);
  assert.equal(adjusted.alpha, 6);
  assert.ok(Math.abs(adjusted.alpha / adjusted.beta - 0.8) < EPS);
});

test("item 13 : most probable scorer - selection UNIQUE (argmax), sur les deux equipes, jamais un Top 3", () => {
  const bothTeams = [
    { player_id: 1, posterior_mean: 0.12 },
    { player_id: 2, posterior_mean: 0.31 },
    { player_id: 3, posterior_mean: 0.28 },
  ];
  const selected = selectMostProbableScorer(bothTeams);
  assert.equal(selected.player_id, 2);
  assert.equal(typeof selected, "object");
  assert.ok(!Array.isArray(selected), "la selection doit etre UN SEUL objet, jamais une liste/Top N");
});

test("item 14 : baseline A (shrinkage simple, deliberement plus naif que le modele) et baseline B (part des buts d'equipe)", () => {
  const rows = [{ goals: 3, minutes: 900 }, { goals: 1, minutes: 450 }];
  const rateA = baselineA_simpleShrunkRate(rows, 0.4);
  // (3+1 buts + 0.4*3) / (10+5 minutes90 + 3) = 5.2/18
  assert.ok(Math.abs(rateA - 5.2 / 18) < 1e-9);

  const shareB = baselineB_teamGoalShare(5, 20);
  assert.ok(Math.abs(shareB - 0.25) < 1e-9);
  assert.equal(baselineB_teamGoalShare(0, 0), 0, "pas de division par zero si l'equipe n'a pas encore marque");
});

test("item 14 : baseline C - wrapper de l'ancien moteur, tag LEGACY_PLAYER_MODEL, ne modifie jamais sa sortie", () => {
  const fakeOutput = { probability: 0.42 };
  const wrapped = baselineC_legacyPlayerEngine(() => fakeOutput, {});
  assert.equal(wrapped.source, LEGACY_PLAYER_MODEL);
  assert.deepEqual(wrapped.output, fakeOutput);
  assert.equal(typeof buildPlayerMarketOutput, "function", "lib/markets/player-engine.js#buildPlayerMarketOutput doit rester importable et inchange");
});

test("item 15 : metriques - logloss primaire, secondaires, PRE/POST separes, top-1 hit rate, scorer-attribution NLL, cluster bootstrap par fixture", () => {
  const rows = [
    { model_probability: 0.7, outcome: "WIN", mode: "PRE_LINEUP" },
    { model_probability: 0.3, outcome: "LOSE", mode: "PRE_LINEUP" },
    { model_probability: 0.6, outcome: "WIN", mode: "POST_LINEUP_CONDITIONAL" },
  ];
  const primary = anytimeScorerLogloss(rows);
  assert.ok(primary > 0);
  const secondary = computeSecondaryMetrics(rows);
  assert.equal(secondary.n, 3);

  const byMode = splitMetricsByMode(rows);
  assert.equal(byMode.PRE_LINEUP.n, 2);
  assert.equal(byMode.POST_LINEUP_CONDITIONAL.n, 1);

  const hitRate = topOneHitRate([
    { fixture_id: 1, selected_player_id: 10, actual_scorer_ids: [10, 11], selected_player_probability: 0.4 },
    { fixture_id: 2, selected_player_id: 20, actual_scorer_ids: [21], selected_player_probability: 0.3 },
  ]);
  assert.ok(Math.abs(hitRate.hit_rate - 0.5) < 1e-9);

  const nll = scorerAttributionNLL([{ true_scorer_probability: 0.5 }, { true_scorer_probability: 0.25 }]);
  assert.ok(Math.abs(nll - (-Math.log(0.5) - Math.log(0.25)) / 2) < 1e-9);

  const clusterRows = [
    { fixture_id: 1, v: 1 }, { fixture_id: 1, v: 0 }, { fixture_id: 2, v: 1 }, { fixture_id: 3, v: 0 },
  ];
  const boot1 = clusterBootstrapMean(clusterRows, (r) => r.fixture_id, (r) => r.v, 500, 7);
  const boot2 = clusterBootstrapMean(clusterRows, (r) => r.fixture_id, (r) => r.v, 500, 7);
  assert.equal(JSON.stringify(boot1), JSON.stringify(boot2), "meme seed => bootstrap deterministe");
  assert.equal(boot1.n_clusters, 3, "cluster PAR FIXTURE, pas par ligne (4 lignes, 3 fixtures)");
});

test("PLAYER_DATASET_VERSION / experiment manifest : pre-enregistre, hash deterministe, jamais modifie apres coup", () => {
  const h1 = manifestHash(EXPERIMENT_MANIFEST_V1);
  const h2 = manifestHash(EXPERIMENT_MANIFEST_V1);
  assert.equal(h1, h2);
  assert.equal(EXPERIMENT_MANIFEST_V1.score_engine_champion, "M2");
  assert.equal(EXPERIMENT_MANIFEST_V1.injury_features, "DISABLED");
  assert.ok(Object.isFrozen(EXPERIMENT_MANIFEST_V1));
  assert.throws(() => { EXPERIMENT_MANIFEST_V1.primary_metric = "SOMETHING_ELSE"; }, TypeError);
});

test("item 2/17 : fitAllPriorsFromTrain n'utilise QUE la saison TRAIN (2022) - muter WARMUP/OOS_DEV/OOS_FINAL ne change jamais les priors", () => {
  const rows = [
    { season: 2021, position: "F", minutes: 900, goals: 50, lineup_role: "STARTER" }, // WARMUP - ne doit JAMAIS entrer
    { season: 2022, position: "F", minutes: 900, goals: 9, lineup_role: "STARTER" }, // TRAIN
    { season: 2022, position: "F", minutes: 450, goals: 1, lineup_role: "BENCH" }, // TRAIN
    { season: 2023, position: "F", minutes: 900, goals: 99, lineup_role: "STARTER" }, // OOS_DEV - ne doit JAMAIS entrer
    { season: 2024, position: "F", minutes: 900, goals: 99, lineup_role: "STARTER" }, // OOS_FINAL - ne doit JAMAIS entrer
  ];
  const goalEvents = [
    { season: 2021, own_goal_flag: false, penalty_flag: false, minute: 10, extra_minute: null },
    { season: 2022, own_goal_flag: false, penalty_flag: true, minute: 20, extra_minute: null },
    { season: 2023, own_goal_flag: true, penalty_flag: false, minute: 30, extra_minute: null },
  ];
  const priors = fitAllPriorsFromTrain(rows, goalEvents);
  assert.equal(priors.n_train_rows, 2, "seules les 2 lignes 2022 (TRAIN) doivent etre comptees");
  assert.equal(priors.n_train_goal_events, 1);
  assert.ok(Math.abs(priors.core_rate_priors.get("F").mean_rate_per_90 - (10 / 15)) < 1e-9, "(9+1) buts / (900+450)/90 minutes90, jamais influence par 2021/2023/2024");

  // Mutation des saisons hors-TRAIN : le resultat ne doit PAS changer.
  const mutatedRows = rows.map((r) => (r.season !== 2022 ? { ...r, goals: 999999 } : r));
  const mutatedGoalEvents = goalEvents.map((g) => (g.season !== 2022 ? { ...g, own_goal_flag: true, penalty_flag: true } : g));
  const priorsAfterMutation = fitAllPriorsFromTrain(mutatedRows, mutatedGoalEvents);
  assert.deepEqual(
    [...priorsAfterMutation.core_rate_priors.entries()],
    [...priors.core_rate_priors.entries()],
    "muter WARMUP/OOS_DEV/OOS_FINAL ne doit JAMAIS changer un prior fitte sur TRAIN"
  );
  assert.equal(priorsAfterMutation.n_train_goal_events, priors.n_train_goal_events);
});
