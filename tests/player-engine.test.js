"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveExpectedMinutes,
  computeGoalscorerProbability,
  computeCountDistribution,
  chooseDistributionModel,
  assessDataQuality,
  buildPlayerMarketOutput,
} = require("../lib/markets/player-engine.js");

test("resolveExpectedMinutes: titulaire confirme avec historique -> minutes moyennes de titularisation reelles, pas une valeur fixe arbitraire", () => {
  var r = resolveExpectedMinutes("confirmed_starter", { appearences: 10, lineups: 8, minutes: 680 });
  assert.equal(r.source, "historical_start_average");
  assert.ok(r.expectedMinutes > 70 && r.expectedMinutes <= 90);
});

test("resolveExpectedMinutes: remplacant confirme -> minutes nettement inferieures a un titulaire", () => {
  var starter = resolveExpectedMinutes("confirmed_starter", { appearences: 10, lineups: 8, minutes: 680 });
  var sub = resolveExpectedMinutes("confirmed_bench", { appearences: 10, lineups: 8, minutes: 680 });
  assert.ok(sub.expectedMinutes < starter.expectedMinutes);
});

test("resolveExpectedMinutes: statut 'expected' sans probabilite de titularisation -> insuffisant, pas de fabrication", () => {
  var r = resolveExpectedMinutes("expected_starter", { appearences: 10, lineups: 8, minutes: 680 }, undefined);
  assert.equal(r.expectedMinutes, null);
  assert.equal(r.source, "insufficient_data_no_starter_probability");
});

test("resolveExpectedMinutes: statut inconnu -> jamais de minutes inventees", () => {
  var r = resolveExpectedMinutes("unknown", {});
  assert.equal(r.expectedMinutes, null);
});

test("computeGoalscorerProbability: 30 min attendues donne une probabilite strictement inferieure a 90 min (meme taux/contexte) - variable centrale", () => {
  var p30 = computeGoalscorerProbability({ expectedMinutes: 30, goalsPer90: 0.5, teamAttackMultiplier: 1, opponentDefenseMultiplier: 1 });
  var p90 = computeGoalscorerProbability({ expectedMinutes: 90, goalsPer90: 0.5, teamAttackMultiplier: 1, opponentDefenseMultiplier: 1 });
  assert.ok(p30.probability < p90.probability);
});

test("computeGoalscorerProbability: n'est JAMAIS une transformation directe de goals_per_90 en probabilite", () => {
  var goalsPer90 = 0.7;
  var r = computeGoalscorerProbability({ expectedMinutes: 90, goalsPer90: goalsPer90, teamAttackMultiplier: 1, opponentDefenseMultiplier: 1 });
  // Passthrough direct interdit : goals_per_90 == probability serait un signe de fabrication.
  assert.notEqual(r.probability, goalsPer90);
  // Doit correspondre a la vraie formule Poisson P(>=1) = 1 - exp(-lambda), lambda = goalsPer90 ici (expectedMinutes=90, multiplicateurs=1).
  var expected = 1 - Math.exp(-goalsPer90);
  assert.ok(Math.abs(r.probability - expected) < 0.001);
});

test("computeGoalscorerProbability: forces d'equipe/adversaire affectent reellement la probabilite", () => {
  var neutral = computeGoalscorerProbability({ expectedMinutes: 90, goalsPer90: 0.5, teamAttackMultiplier: 1, opponentDefenseMultiplier: 1 });
  var strongAttack = computeGoalscorerProbability({ expectedMinutes: 90, goalsPer90: 0.5, teamAttackMultiplier: 1.3, opponentDefenseMultiplier: 1 });
  var weakOpponentDefense = computeGoalscorerProbability({ expectedMinutes: 90, goalsPer90: 0.5, teamAttackMultiplier: 1, opponentDefenseMultiplier: 1.2 });
  assert.ok(strongAttack.probability > neutral.probability);
  assert.ok(weakOpponentDefense.probability > neutral.probability);
});

test("computeGoalscorerProbability: donnees manquantes -> null, pas de fabrication", () => {
  assert.equal(computeGoalscorerProbability({ expectedMinutes: null, goalsPer90: 0.5 }), null);
  assert.equal(computeGoalscorerProbability({ expectedMinutes: 90, goalsPer90: null }), null);
});

test("computeCountDistribution: modele distinct du modele buteur (marche different, meme mise a l'echelle par les minutes)", () => {
  var shots30 = computeCountDistribution("PLAYER_SHOTS", { expectedMinutes: 30, ratePer90: 2.5 });
  var shots90 = computeCountDistribution("PLAYER_SHOTS", { expectedMinutes: 90, ratePer90: 2.5 });
  assert.ok(shots30.lambda < shots90.lambda);
  assert.equal(shots30.market, "PLAYER_SHOTS");
});

test("computeCountDistribution: retourne une distribution complete (plusieurs lignes over), pas une seule probabilite", () => {
  var r = computeCountDistribution("PLAYER_SHOTS_ON_TARGET", { expectedMinutes: 90, ratePer90: 1.2 });
  assert.ok(r.over_lines["over_0.5"] != null);
  assert.ok(r.over_lines["over_1.5"] != null);
  // over_0.5 doit toujours etre >= over_1.5 (probabilite decroissante avec la ligne).
  assert.ok(r.over_lines["over_0.5"] >= r.over_lines["over_1.5"]);
});

test("chooseDistributionModel: echantillon < seuil -> toujours FORWARD_VALIDATION_ONLY, jamais VALIDATED", () => {
  var r = chooseDistributionModel([1, 0, 2, 1, 0]);
  assert.equal(r.validation_status, "FORWARD_VALIDATION_ONLY");
});

test("chooseDistributionModel: meme avec un grand echantillon synthetique, jamais VALIDATED automatiquement (pas de vrai backtest hors echantillon execute ici)", () => {
  var bigSample = [];
  for (var i = 0; i < 50; i++) bigSample.push(i % 4);
  var r = chooseDistributionModel(bigSample);
  assert.equal(r.validation_status, "FORWARD_VALIDATION_ONLY");
});

test("chooseDistributionModel: aucun historique -> repli Poisson explicite, jamais une exception", () => {
  var r = chooseDistributionModel(null);
  assert.equal(r.chosenModel, "poisson");
  assert.equal(r.validation_status, "FORWARD_VALIDATION_ONLY");
});

test("assessDataQuality: sous le seuil minimal d'apparitions -> suppress=true", () => {
  var q = assessDataQuality({ expectedMinutes: 80, historicalMinutes: { appearences: 1 } });
  assert.equal(q.suppress, true);
});

test("assessDataQuality: donnees suffisantes -> suppress=false, qualite graduee selon le contexte disponible", () => {
  var low = assessDataQuality({ expectedMinutes: 80, historicalMinutes: { appearences: 5 } });
  var medium = assessDataQuality({ expectedMinutes: 80, historicalMinutes: { appearences: 12 }, opponentDefenseMultiplier: 1.1 });
  assert.equal(low.suppress, false);
  assert.equal(low.quality, "low");
  assert.equal(medium.quality, "medium");
});

test("buildPlayerMarketOutput: donnees insuffisantes -> null (aucun resultat fabrique)", () => {
  var r = buildPlayerMarketOutput({
    fixtureId: 123, playerId: 456, market: "ANYTIME_GOALSCORER",
    lineupStatus: "confirmed_starter", historicalMinutes: { appearences: 1, lineups: 1, minutes: 90 },
    ratePer90: 0.5,
  });
  assert.equal(r, null);
});

test("buildPlayerMarketOutput: sortie complete avec tous les champs requis quand les donnees sont suffisantes", () => {
  var r = buildPlayerMarketOutput({
    fixtureId: 1557379, playerId: 283058, market: "ANYTIME_GOALSCORER",
    lineupStatus: "confirmed_starter",
    historicalMinutes: { appearences: 15, lineups: 12, minutes: 1080 },
    ratePer90: 0.55, teamAttackMultiplier: 1.1, opponentDefenseMultiplier: 0.95, penaltyGoalsPer90: 0.1,
  });
  assert.ok(r);
  ["fixture_id", "player_id", "model_version", "generated_at", "expected_minutes", "lineup_status", "market", "output", "data_quality", "sample_size", "validation_status", "inputs_snapshot"].forEach(function (field) {
    assert.ok(Object.prototype.hasOwnProperty.call(r, field), "champ manquant : " + field);
  });
  assert.equal(r.validation_status, "FORWARD_VALIDATION_ONLY");
  assert.equal(r.market, "ANYTIME_GOALSCORER");
  assert.ok(r.output.probability > 0 && r.output.probability < 1);
});

test("buildPlayerMarketOutput: marche non supporte par ce moteur -> null", () => {
  var r = buildPlayerMarketOutput({
    fixtureId: 1, playerId: 1, market: "PLAYER_CARDS",
    lineupStatus: "confirmed_starter", historicalMinutes: { appearences: 15, lineups: 12, minutes: 1080 },
    ratePer90: 0.2,
  });
  assert.equal(r, null);
});

test("buildPlayerMarketOutput: parametres identifiants manquants -> null immediatement", () => {
  assert.equal(buildPlayerMarketOutput({ playerId: 1, market: "ANYTIME_GOALSCORER" }), null);
  assert.equal(buildPlayerMarketOutput({ fixtureId: 1, market: "ANYTIME_GOALSCORER" }), null);
});
