"use strict";
// PLAYER SCORER V2 - COMPETING RISKS (2026-09-05), item 22. Les 14
// validations synthetiques obligatoires, AVANT tout OOS. V1
// (tests/player-lab-scorer-engine.test.js) reste INTACT et INCHANGE.

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFieldTimeline, playersOnFieldAt, buildRiskSetForGoal, computeReconciliationRate } = require("../lib/player-lab/v2/risk-set.js");
const { designVector, fitRelativeRiskModel, multiStartStability, deterministicMultiStartThetas, codingInvarianceTest, N_PARAMS, POSITION_ORDER } = require("../lib/player-lab/v2/relative-risk-model.js");
const { fitPlayerEffects, playerEffect } = require("../lib/player-lab/v2/player-effects.js");
const { fitGoalRatePriors, posteriorGoalRate, fitShotRatePriors, posteriorShotRate, fitSotConversionPriors, posteriorSotConversion } = require("../lib/player-lab/v2/rate-priors.js");
const { fitGoalClock, N_BINS } = require("../lib/player-lab/v2/goal-clock.js");
const { fitSubstitutionModel } = require("../lib/player-lab/v2/substitution-model.js");
const { fitPenaltyTakerCounts, penaltyTakerDistribution } = require("../lib/player-lab/v2/penalty-model.js");
const { fitOwnGoalRate } = require("../lib/player-lab/v2/own-goal-model.js");
const { softmax, attributeOpenPlayGoal, attributePenaltyGoal, attributeOwnGoal, verifyMassConservation } = require("../lib/player-lab/v2/attribution-v2.js");
const { scoreProbabilityForScenario } = require("../lib/player-lab/v2/anytime-probability.js");
const { sampleGoalsFromMatrix, drawSubstitutionTimeline, playersOnFieldAt: playersOnFieldAtSim, simulateMatchV2 } = require("../lib/player-lab/v2/simulation-v2.js");
const { scoreProbabilityGivenShare } = require("../lib/player-lab/scoring-formula.js");
const { resolvePositionGroup } = require("../lib/player-lab/position-policy.js");
const { PRE_OOS_TECHNICAL_DEMO_ONLY, isDemoFixture } = require("../lib/player-lab/v2/demo-guard.js");
const { EXPERIMENT_MANIFEST_V2, manifestHashV2 } = require("../lib/player-lab/v2/experiment-manifest-v2.js");

const EPS = 1e-9;

// --- 1. joueur absent du risk set => pi=0 ---
test("1) joueur absent du risk set : pi=0 (jamais credite d'un but auquel il n'a pas assiste)", () => {
  const onField = ["A", "B"]; // "C" absent
  const shares = attributeOpenPlayGoal(onField, [1.0, 0.5]);
  assert.equal(shares.has("C"), false, "un joueur absent de R n'a meme pas d'entree - jamais un 0 implicite confondu avec present-mais-nul");
});

// --- 2. softmax sums to 1 ---
test("2) softmax sums to 1", () => {
  const probs = softmax([2.1, -0.4, 0.3, 1.7]);
  assert.ok(Math.abs(probs.reduce((a, b) => a + b, 0) - 1) < EPS);
});

// --- 3. latent ability plus forte => part plus grande ---
test("3) stronger latent ability => larger share", () => {
  const shares = attributeOpenPlayGoal(["strong", "weak"], [3.0, 0.1]);
  assert.ok(shares.get("strong") > shares.get("weak"));
});

// --- 4. small sample shrinks toward prior ---
test("4) small sample shrinks (core rate et player effect)", () => {
  const trainRows = [{ position: "F", minutes: 900, open_play_goals: 9 }, { position: "F", minutes: 900, open_play_goals: 1 }];
  const priors = fitGoalRatePriors(trainRows, resolvePositionGroup);
  const fPrior = priors.get("F");
  const smallSample = posteriorGoalRate(0, 1, fPrior); // 1 match, 0 but
  assert.ok(Math.abs(smallSample.mean - fPrior.mean_rate_per_90) < 0.15, "petit echantillon doit rester proche du prior");

  const effects = fitPlayerEffects(new Map([["p1", { observedGoals: 0, expectedGoals: 0.1, exposureMinutes90: 1 }]]));
  assert.ok(Math.abs(playerEffect(effects, "p1")) < 0.3, "1 match90 d'exposition => u_i shrinke pres de 0");
  assert.equal(playerEffect(effects, "unknown_player"), 0, "joueur jamais vu => u_i=0 explicite");
});

// --- 5. missing shots != zero shots ---
test("5) missing shots != zero shots", () => {
  const trainRows = [{ position: "F", minutes: 900, shots: 40 }, { position: "F", minutes: 900, shots: null }];
  const priors = fitShotRatePriors(trainRows, resolvePositionGroup); // la ligne shots=null est EXCLUE du fit
  const fPrior = priors.get("F");
  assert.ok(Math.abs(fPrior.mean_rate_per_90 - 4) < EPS, "seule la ligne shots=40 (900min=10 matchs90) doit compter : 40/10=4, jamais moyenne avec un 0 fabrique");
});

// --- 6. missing SOT != zero SOT ---
test("6) missing SOT != zero SOT", () => {
  const trainRows = [{ position: "F", shots: 10, shots_on_target: 5 }, { position: "F", shots: 10, shots_on_target: null }];
  const priors = fitSotConversionPriors(trainRows, resolvePositionGroup); // la 2e ligne (sot=null) exclue
  const fPrior = priors.get("F");
  assert.ok(Math.abs(fPrior.mean_conversion - 0.5) < EPS);
  const posterior = posteriorSotConversion(null, null, fPrior);
  assert.equal(posterior, null, "aucune observation -> null explicite, jamais un 0 fabrique");
});

// --- 7. bench avant entree => pi=0 ---
test("7) bench avant son entree : absent du terrain, jamais dans un risk-set avant sa minute d'entree", () => {
  const changes = [{ minute: 60, playerOut: "starter1", playerIn: "sub1" }];
  const onFieldAt30 = playersOnFieldAt(["starter1", "starter2"], changes, 30);
  assert.equal(onFieldAt30.has("sub1"), false);
  const onFieldAt70 = playersOnFieldAt(["starter1", "starter2"], changes, 70);
  assert.equal(onFieldAt70.has("sub1"), true);
});

// --- 8. joueur apres sa sortie => pi=0 ---
test("8) joueur remplace : absent du terrain APRES sa minute de sortie", () => {
  const changes = [{ minute: 60, playerOut: "starter1", playerIn: "sub1" }];
  const onFieldAt70 = playersOnFieldAt(["starter1", "starter2"], changes, 70);
  assert.equal(onFieldAt70.has("starter1"), false);
});

// --- 9. substitution preserve le nombre de joueurs sur le terrain ---
test("9) substitution keeps physical player count (1 OUT -> 1 IN strict)", () => {
  const changes = [{ minute: 60, playerOut: "s1", playerIn: "b1" }, { minute: 75, playerOut: "s2", playerIn: "b2" }];
  const before = playersOnFieldAt(["s1", "s2", "s3"], [], 10);
  const after = playersOnFieldAt(["s1", "s2", "s3"], changes, 80);
  assert.equal(before.size, after.size, "le nombre de joueurs sur le terrain doit rester identique apres chaque substitution");
});

// --- 10. penalty scorer only from available takers ---
test("10) penalty : le tireur ne peut venir que des joueurs presents, jamais hors R", () => {
  const counts = fitPenaltyTakerCounts([{ team_id: 1, player_id: "taker1" }, { team_id: 1, player_id: "taker1" }, { team_id: 1, player_id: "bench_taker" }]);
  const dist = penaltyTakerDistribution(counts.get(1), ["taker1", "onfield2"]); // "bench_taker" n'est PAS dans R
  assert.equal(dist.has("bench_taker"), false);
  assert.ok(Math.abs([...dist.values()].reduce((a, b) => a + b, 0) - 1) < EPS);
  assert.ok(dist.get("taker1") > dist.get("onfield2"), "le tireur designe avec le plus d'attempts historiques doit avoir la plus forte probabilite");
});

// --- 11. own goal : aucun joueur offensif credite ---
test("11) own goal credited to no offensive player", () => {
  const shares = attributeOwnGoal(["p1", "p2", "p3"]);
  for (const v of shares.values()) assert.equal(v, 0);
});

// --- 12. conservation totale de la masse d'un but ---
test("12) all scorer mass conserved : sum(player shares) + P_own = 1 pour open-play, penalty, ET own-goal", () => {
  const openPlay = attributeOpenPlayGoal(["a", "b"], [1, 2]);
  assert.ok(Math.abs(verifyMassConservation(openPlay, 0).total - 1) < EPS);

  const penalty = attributePenaltyGoal(new Map([["a", 0.9], ["b", 0.1]]));
  assert.ok(Math.abs(verifyMassConservation(penalty, 0).total - 1) < EPS);

  const ownGoal = attributeOwnGoal(["a", "b"]);
  assert.ok(Math.abs(verifyMassConservation(ownGoal, 1).total - 1) < EPS, "own-goal : toute la masse va a P_own, aucun joueur credite");
});

// --- 13. V2 se reduit exactement a V1 quand pi est constant ---
test("13) V2 formula reduces to V1 special case quand pi_i,e,s est constant pour tous les buts d'un scenario", () => {
  const pi = 0.15;
  for (const n of [0, 1, 2, 3, 5]) {
    const v2Scenario = scoreProbabilityForScenario(new Array(n).fill(pi));
    const expectedV1Style = 1 - Math.pow(1 - pi, n);
    assert.ok(Math.abs(v2Scenario - expectedV1Style) < EPS, `n=${n}`);
  }
  // Et l'esperance sur p_T(n) redonne EXACTEMENT la formule V1 fermee.
  const teamGoalDist = [0.25, 0.35, 0.25, 0.10, 0.05];
  let expectedOverScenarios = 0;
  for (let n = 0; n < teamGoalDist.length; n++) expectedOverScenarios += teamGoalDist[n] * scoreProbabilityForScenario(new Array(n).fill(pi));
  const v1Formula = scoreProbabilityGivenShare(teamGoalDist, pi);
  assert.ok(Math.abs(expectedOverScenarios - v1Formula) < EPS, "E_s[Pscore_i,s] avec pi constant doit etre EXACTEMENT la formule V1");
});

// --- 14. determinisme : meme seed => sortie byte-identique ---
test("14) same seed => identical output (simulation V2 complete)", () => {
  const matrix = [[0.10, 0.15, 0.05], [0.20, 0.10, 0.05], [0.15, 0.10, 0.10]];
  const positionByPlayer = new Map([["h1", "G"], ["h2", "D"], ["h3", "F"], ["hb1", "M"], ["a1", "G"], ["a2", "F"], ["ab1", "D"]]);
  const substitutionModel = { count_distribution: [{ n_substitutions: 0, probability: 0.3 }, { n_substitutions: 1, probability: 0.7 }], minute_distribution: new Array(N_BINS).fill(1 / N_BINS), out_position_distribution: new Map([["D", 0.5], ["F", 0.5]]), in_position_distribution: new Map([["M", 1.0]]) };
  const goalClockHome = new Array(N_BINS).fill(1 / N_BINS);
  const homeConfig = { startingXI: ["h1", "h2", "h3"], bench: ["hb1"], positionByPlayer, etaByPlayer: new Map([["h1", -3], ["h2", 0.2], ["h3", 1.5], ["hb1", 0.3]]), substitutionModel, goalClock: goalClockHome, penaltyTakerCounts: null };
  const awayConfig = { startingXI: ["a1", "a2"], bench: ["ab1"], positionByPlayer, etaByPlayer: new Map([["a1", -3], ["a2", 1.2], ["ab1", 0.1]]), substitutionModel, goalClock: goalClockHome, penaltyTakerCounts: null };

  const result1 = simulateMatchV2(matrix, homeConfig, awayConfig, 0.04, 0.07, 3000, 777);
  const result2 = simulateMatchV2(matrix, homeConfig, awayConfig, 0.04, 0.07, 3000, 777);
  assert.equal(JSON.stringify(result1), JSON.stringify(result2));

  const resultDifferentSeed = simulateMatchV2(matrix, homeConfig, awayConfig, 0.04, 0.07, 3000, 888);
  assert.notEqual(JSON.stringify(result1), JSON.stringify(resultDifferentSeed));

  for (const r of result1) {
    assert.ok(r.posterior_mean >= 0 && r.posterior_mean <= 1);
    assert.ok(r.p10 <= r.p50 && r.p50 <= r.p90);
  }
});

// --- items additionnels : risk-set reconciliation, relative-risk fit, guards ---
test("risk-set : le VRAI buteur doit appartenir a R_e sur un cas synthetique construit a la main", () => {
  const startingXI = ["s1", "s2"];
  const events = [{ time: { elapsed: 60, extra: null }, type: "subst", player: { id: "s1" }, assist: { id: "b1" } }];
  const riskSetAt40 = buildRiskSetForGoal(startingXI, events, 40);
  assert.ok(riskSetAt40.has("s1"));
  const riskSetAt80 = buildRiskSetForGoal(startingXI, events, 80);
  assert.ok(!riskSetAt80.has("s1") && riskSetAt80.has("b1"));

  const reconciliation = computeReconciliationRate([{ scorerId: "s1", riskSet: riskSetAt40 }, { scorerId: "b1", riskSet: riskSetAt80 }, { scorerId: "s1", riskSet: riskSetAt80 }]);
  assert.equal(reconciliation.n_matched, 2);
  assert.ok(Math.abs(reconciliation.rate_pct - (200 / 3)) < 0.01);
});

test("relative risk model : Newton-Raphson converge et attribue un beta_goal positif quand le signal est informatif", () => {
  const strong = designVector("F", 2.0, 1.0, 0.5);
  const weak = designVector("M", 0.1, 0.1, 0.1);
  const events = Array.from({ length: 60 }, (_, i) => ({ riskSetDesignVectors: [strong, weak], scorerIndex: i % 4 === 0 ? 1 : 0 }));
  const result = fitRelativeRiskModel(events);
  const betaGoalIdx = POSITION_ORDER.length;
  assert.ok(result.theta[betaGoalIdx] > 0, "beta_goal doit etre positif : X_goal plus eleve explique le buteur le plus probable");
});

test("identification constraint : contrainte somme-a-zero (UNKNOWN eliminee), N_PARAMS reduit de 1 (item 3)", () => {
  assert.equal(POSITION_ORDER.length, 4, "F/M/D/G sont les 4 categories libres, UNKNOWN est eliminee par la contrainte Sum=0");
  assert.equal(N_PARAMS, 7);
  const vUnknown = designVector("UNKNOWN", 1, 1, 1);
  assert.ok(vUnknown.slice(0, POSITION_ORDER.length).every((v) => v === -1), "sum-to-zero : UNKNOWN = -(somme des 4 autres), jamais un bloc nul arbitraire (voir coding invariance)");
  const vForward = designVector("F", 1, 1, 1);
  assert.equal(vForward.filter((v) => v === 1 && vForward.indexOf(v) < POSITION_ORDER.length).length >= 1, true);
});

test("FIT_NUMERICAL_CLOSURE : converged=true avec diagnostics complets sur un cas synthetique bien identifie (item 5)", () => {
  const strong = designVector("F", 2.0, 1.0, 0.5);
  const weak = designVector("M", 0.1, 0.1, 0.1);
  const events = Array.from({ length: 80 }, (_, i) => ({ riskSetDesignVectors: [strong, weak], scorerIndex: i % 4 === 0 ? 1 : 0 }));
  const result = fitRelativeRiskModel(events);
  assert.equal(result.converged, true, "le fit doit converger au sens objectif+gradient, pas seulement logL stable");
  assert.equal(result.convergence_reason, "OBJECTIVE_AND_GRADIENT_TOLERANCE_MET");
  assert.ok(result.max_abs_gradient < 1e-6);
  assert.ok(result.relative_objective_change < 1e-9);
  assert.ok(Number.isFinite(result.penalized_objective) && Number.isFinite(result.logL));
  assert.equal(result.solve_status, "OK", "hess_penalized est definie negative partout -> jamais de pivot quasi-singulier");
});

test("FIT_NUMERICAL_CLOSURE : quasi-separation (position qui ne marque jamais) reste finie et convergee (item 4)", () => {
  const scorerVec = designVector("F", 1.0, 0.5, 0.3);
  const neverScoresVec = designVector("G", -0.2, -0.2, -0.2); // gardien : jamais scorerIndex
  const events = Array.from({ length: 200 }, () => ({ riskSetDesignVectors: [scorerVec, neverScoresVec], scorerIndex: 0 }));
  const result = fitRelativeRiskModel(events);
  assert.equal(result.converged, true, "le ridge sur l'objectif PENALISE doit rendre l'optimum fini meme en quasi-separation totale");
  assert.ok(result.theta.every((v) => Number.isFinite(v)), "aucun parametre ne diverge vers l'infini");
  const alphaG = result.theta[POSITION_ORDER.indexOf("G")];
  assert.ok(Number.isFinite(alphaG) && alphaG < 0, "alpha_G doit rester negatif (jamais buteur) mais fini");
});

test("multi-start stability (item 6) : 5 initialisations deterministes convergent vers le meme optimum penalise et les memes probabilites", () => {
  const strong = designVector("F", 2.0, 1.0, 0.5);
  const weak = designVector("M", 0.1, 0.1, 0.1);
  const gk = designVector("G", -0.5, -0.5, -0.5);
  const events = Array.from({ length: 150 }, (_, i) => ({ riskSetDesignVectors: [strong, weak, gk], scorerIndex: i % 5 === 0 ? 1 : 0 }));
  const starts = deterministicMultiStartThetas();
  assert.ok(starts.length >= 5, "au moins 5 initialisations deterministes raisonnables");
  const stability = multiStartStability(events, 100, undefined, undefined, starts);
  assert.equal(stability.any_non_finite, false);
  assert.equal(stability.all_converged, true);
  assert.ok(stability.max_objective_spread < 1e-6, "meme optimum penalise a tolerance numerique pres");
  assert.ok(stability.max_risk_set_probability_spread < 1e-6, "memes probabilites de risk-set a tolerance stricte");
});

test("coding invariance : le fit penalise est independant de la categorie de position choisie comme reference", () => {
  // Evenements synthetiques avec riskSetRawFeatures (traits BRUTS, PAS
  // encore encodes) - le meme dataset physique est refitte sous 4
  // codages differents (UNKNOWN/F/M/D comme reference).
  const rawByGroup = { F: { group: "F", xGoal: 1.5, xShot: 1.0, xSot: 0.5 }, M: { group: "M", xGoal: 0.3, xShot: 0.4, xSot: 0.1 }, D: { group: "D", xGoal: -0.5, xShot: -0.2, xSot: -0.3 }, G: { group: "G", xGoal: -2.0, xShot: -1.5, xSot: -1.0 }, UNKNOWN: { group: "UNKNOWN", xGoal: 0, xShot: 0, xSot: 0 } };
  const events = Array.from({ length: 120 }, (_, i) => ({
    riskSetRawFeatures: [rawByGroup.F, rawByGroup.M, rawByGroup.D, rawByGroup.G, rawByGroup.UNKNOWN],
    scorerIndex: i % 6 === 0 ? 1 : (i % 6 === 1 ? 4 : 0), // le "F" marque le plus souvent, jamais le "G" (quasi-separation)
  }));
  const result = codingInvarianceTest(events, ["UNKNOWN", "F", "M", "D"]);
  assert.equal(result.all_converged, true);
  assert.ok(result.max_penalty_matrix_diff < 1e-12, "la matrice de penalite canonique (I+J) doit etre algebriquement identique quelle que soit la reference");
  assert.ok(result.max_canonical_alpha_diff <= 1e-8, `alpha canoniques doivent concorder entre codages (obtenu ${result.max_canonical_alpha_diff})`);
  assert.ok(result.max_abs_probability_difference <= 1e-8, `probabilites de risk-set doivent concorder entre codages (obtenu ${result.max_abs_probability_difference})`);
});

test("goal clock : Dirichlet shrinkage - aucun bin exactement nul meme sans observation dans ce bin", () => {
  const dist = fitGoalClock([{ minute: 10, extra_minute: null }]);
  assert.equal(dist.length, N_BINS);
  assert.ok(dist.every((p) => p > 0), "aucun bin ne doit avoir une probabilite exactement 0");
  assert.ok(Math.abs(dist.reduce((a, b) => a + b, 0) - 1) < EPS);
});

test("substitution model : distribution de comptage et positions valides", () => {
  const model = fitSubstitutionModel([
    { n_substitutions: 1, minutes: [65], outPositions: ["D"], inPositions: ["M"] },
    { n_substitutions: 2, minutes: [55, 75], outPositions: ["F", "M"], inPositions: ["F", "D"] },
  ]);
  assert.ok(Math.abs(model.count_distribution.reduce((s, c) => s + c.probability, 0) - 1) < EPS);
  assert.ok(Math.abs([...model.out_position_distribution.values()].reduce((a, b) => a + b, 0) - 1) < EPS);
});

test("own goal rate V2 : mesure reelle, jamais 0 par defaut si des CSC existent", () => {
  const events = Array.from({ length: 50 }, (_, i) => ({ own_goal_flag: i < 2 }));
  const rate = fitOwnGoalRate(events);
  assert.ok(Math.abs(rate.omega_own - 0.04) < EPS);
});

test("demo guard (item 21) : la fixture de demonstration V1 est taguee PRE_OOS_TECHNICAL_DEMO_ONLY, jamais silencieusement reutilisee sans le tag", () => {
  assert.ok(isDemoFixture(1035076));
  assert.equal(isDemoFixture(999999), false);
  assert.equal(PRE_OOS_TECHNICAL_DEMO_ONLY, "PRE_OOS_TECHNICAL_DEMO_ONLY");
});

test("manifest V2 : pre-enregistre AVANT tout OOS, hash deterministe, jamais modifiable", () => {
  assert.equal(manifestHashV2(EXPERIMENT_MANIFEST_V2), manifestHashV2(EXPERIMENT_MANIFEST_V2));
  assert.equal(EXPERIMENT_MANIFEST_V2.primary_mode_this_gate, "POST_LINEUP_CONDITIONAL");
  assert.equal(EXPERIMENT_MANIFEST_V2.pre_lineup_status, "EXPERIMENTAL_PROVISIONAL_UNCHANGED_FROM_V1");
  assert.ok(Object.isFrozen(EXPERIMENT_MANIFEST_V2));
  assert.throws(() => { EXPERIMENT_MANIFEST_V2.primary_metric = "X"; }, TypeError);
});
