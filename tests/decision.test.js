"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pickMarketDeterministic, computeRiskLabel, computeModelAgreement, computeDataQualityScore, computeReliability, scoreMatchesMarket, scoresConsistentWithMarket } = require("../lib/decision.js");

test("pickMarketDeterministic: choisit le marche de plus haute probabilite modele", () => {
  const markets = [
    { market: "Over 2.5", prob: 55, cote: 1.9 },
    { market: "BTTS Oui", prob: 68, cote: 1.7 },
    { market: "DC 1X", prob: 60, cote: 1.3 },
  ];
  const picked = pickMarketDeterministic(markets);
  assert.equal(picked.market, "BTTS Oui");
});

test("pickMarketDeterministic: liste vide -> null, jamais un marche invente", () => {
  assert.equal(pickMarketDeterministic([]), null);
  assert.equal(pickMarketDeterministic(null), null);
});

test("pickMarketDeterministic: un seul marche -> le retourne", () => {
  const markets = [{ market: "Over 2.5", prob: 55, cote: 1.9 }];
  assert.equal(pickMarketDeterministic(markets).market, "Over 2.5");
});

test("pickMarketDeterministic: egalite de probabilite -> deterministe (premier rencontre dans l'ordre du tableau)", () => {
  const markets = [
    { market: "A", prob: 60, cote: 1.9 },
    { market: "B", prob: 60, cote: 1.8 },
  ];
  assert.equal(pickMarketDeterministic(markets).market, "A");
});

test("pickMarketDeterministic: ignore une meilleure probabilite si sa cote reelle est sous 1,50", () => {
  const markets = [
    { id: "dc-1x", market: "Double chance 1X", prob: 82, cote: 1.31 },
    { id: "under-35", market: "Moins de 3,5 buts", prob: 74, cote: 1.52 },
  ];
  assert.equal(pickMarketDeterministic(markets, { minOdds: 1.5 }).id, "under-35");
});

test("pickMarketDeterministic: le resultat ne depend pas de l'ordre ni de la famille", () => {
  const a = { id: "btts-no", market: "BTTS Non", prob: 63, cote: 1.72, reliability: 80 };
  const b = { id: "home-win", market: "Victoire domicile", prob: 63, cote: 1.85, reliability: 70 };
  assert.equal(pickMarketDeterministic([a, b], { minOdds: 1.5 }).id, "btts-no");
  assert.equal(pickMarketDeterministic([b, a], { minOdds: 1.5 }).id, "btts-no");
});

test("pickMarketDeterministic: aucune cote reelle eligible -> abstention", () => {
  assert.equal(pickMarketDeterministic([
    { id: "home", prob: 75, cote: null },
    { id: "over", prob: 70, cote: 1.49 },
  ], { minOdds: 1.5 }), null);
});

test("computeRiskLabel: cote basse -> FAIBLE, moyenne -> MODERE, haute -> ELEVE", () => {
  assert.equal(computeRiskLabel(1.5), "FAIBLE");
  assert.equal(computeRiskLabel(1.9), "MODERE");
  assert.equal(computeRiskLabel(3.5), "ELEVE");
});

test("computeRiskLabel: bornes exactes", () => {
  assert.equal(computeRiskLabel(1.75), "MODERE"); // pas strictement < 1.75
  assert.equal(computeRiskLabel(2.2), "MODERE"); // <= 2.2
  assert.equal(computeRiskLabel(2.21), "ELEVE");
});

test("computeRiskLabel: cote invalide -> repli MODERE, pas de crash", () => {
  assert.equal(computeRiskLabel(null), "MODERE");
  assert.equal(computeRiskLabel("abc"), "MODERE");
  assert.equal(computeRiskLabel(0), "MODERE");
});

test("computeModelAgreement: modeles identiques -> Fort, stdDev=0", () => {
  const r = computeModelAgreement([55, 55, 55]);
  assert.equal(r.label, "Fort");
  assert.equal(r.stdDev, 0);
});

test("computeModelAgreement: modeles tres divergents -> Faible", () => {
  const r = computeModelAgreement([20, 50, 80]);
  assert.equal(r.label, "Faible");
});

test("computeModelAgreement: divergence moderee -> Moyen", () => {
  const r = computeModelAgreement([45, 55, 65]);
  assert.equal(r.label, "Moyen", "stdDev=" + r.stdDev);
});

test("computeModelAgreement: moins de 2 valeurs valides -> Faible par defaut, pas de crash", () => {
  const r = computeModelAgreement([55]);
  assert.equal(r.label, "Faible");
  assert.equal(r.stdDev, null);
});

test("computeDataQualityScore: toutes les sources presentes -> 100", () => {
  const r = computeDataQualityScore({
    hasTeamStatsHome: true, hasTeamStatsAway: true, hasOdds: true,
    hasInjuries: true, hasH2H: true, hasElo: true, hasLineups: true,
  });
  assert.equal(r.score, 100);
  assert.equal(r.label, "Élevée");
});

test("computeDataQualityScore: aucune source -> 0", () => {
  const r = computeDataQualityScore({});
  assert.equal(r.score, 0);
  assert.equal(r.label, "Faible");
});

test("computeDataQualityScore: partiel -> label Moyenne dans la plage attendue", () => {
  const r = computeDataQualityScore({ hasTeamStatsHome: true, hasTeamStatsAway: true, hasOdds: true });
  assert.ok(r.score >= 40 && r.score < 70, "score=" + r.score);
  assert.equal(r.label, "Moyenne");
});

test("computeDataQualityScore: flags null -> 0, pas de crash", () => {
  const r = computeDataQualityScore(null);
  assert.equal(r.score, 0);
});

test("computeReliability: n'est jamais une copie de la probabilite - jamais de champ 'prob'/'probability'", () => {
  const r = computeReliability({ label: "Fort" }, { score: 80, label: "Élevée" }, 20);
  assert.equal(r.prob, undefined);
  assert.equal(r.probability, undefined);
});

test("computeReliability: tous les signaux forts -> Élevée", () => {
  const r = computeReliability({ label: "Fort" }, { label: "Élevée" }, 20);
  assert.equal(r.label, "Élevée");
});

test("computeReliability: tous les signaux faibles -> Faible", () => {
  const r = computeReliability({ label: "Faible" }, { label: "Faible" }, 2);
  assert.equal(r.label, "Faible");
});

test("computeReliability: sample_size null -> label 'Inconnue', jamais une valeur inventee", () => {
  const r = computeReliability({ label: "Moyen" }, { label: "Moyenne" }, null);
  assert.equal(r.sample_size, null);
  assert.equal(r.sample_size_label, "Inconnue");
});

test("computeReliability: historical_calibration toujours NOT_AVAILABLE_YET (aucune prediction post-fix resolue)", () => {
  const r = computeReliability({ label: "Fort" }, { label: "Élevée" }, 30);
  assert.equal(r.historical_calibration, "NOT_AVAILABLE_YET");
});

test("computeReliability: expose les composants individuels, pas juste un label composite", () => {
  const r = computeReliability({ label: "Moyen" }, { label: "Moyenne" }, 10);
  assert.equal(r.model_agreement, "Moyen");
  assert.equal(r.data_quality, "Moyenne");
  assert.equal(r.sample_size, 10);
});

test("scoreMatchesMarket: over/under total de buts", () => {
  assert.equal(scoreMatchesMarket(2, 1, "over-25"), true);
  assert.equal(scoreMatchesMarket(1, 0, "over-25"), false);
  assert.equal(scoreMatchesMarket(1, 0, "under-25"), true);
});
test("scoreMatchesMarket: resultat et double chance", () => {
  assert.equal(scoreMatchesMarket(2, 0, "home-win"), true);
  assert.equal(scoreMatchesMarket(1, 1, "draw"), true);
  assert.equal(scoreMatchesMarket(1, 1, "dc-1x"), true);
  assert.equal(scoreMatchesMarket(0, 1, "dc-1x"), false);
});
test("scoreMatchesMarket: BTTS et clean sheet", () => {
  assert.equal(scoreMatchesMarket(1, 1, "btts-yes"), true);
  assert.equal(scoreMatchesMarket(1, 0, "btts-yes"), false);
  assert.equal(scoreMatchesMarket(2, 0, "home-clean-sheet"), true);  // away n'a pas marque
  assert.equal(scoreMatchesMarket(2, 0, "away-clean-sheet"), false); // home a marque 2, away a encaisse
  assert.equal(scoreMatchesMarket(0, 2, "away-clean-sheet"), true);  // home n'a pas marque
});
test("scoreMatchesMarket: marche non evaluable depuis le score seul (1re mi-temps, tirs) -> null, jamais un filtrage errone", () => {
  assert.equal(scoreMatchesMarket(2, 1, "fh-over-05"), null);
  assert.equal(scoreMatchesMarket(2, 1, "total-shots-over-9_5"), null);
});

test("scoresConsistentWithMarket: reordonne pour ne garder que les scores compatibles avec le marche recommande", () => {
  const raw = [
    { score: "1-0", n: 800, pct: 16 },
    { score: "1-1", n: 550, pct: 11 },
    { score: "2-1", n: 400, pct: 8 },
    { score: "2-0", n: 350, pct: 7 },
    { score: "3-1", n: 200, pct: 4 },
  ];
  const result = scoresConsistentWithMarket(raw, "over-25", 3);
  assert.deepEqual(result.map((s) => s.score), ["2-1", "3-1"]);
});
test("scoresConsistentWithMarket: sans marche recommande (NO_PICK) -> classement brut inchange", () => {
  const raw = [{ score: "1-0", n: 800, pct: 16 }, { score: "0-0", n: 500, pct: 10 }];
  assert.deepEqual(scoresConsistentWithMarket(raw, null, 3), raw);
});
test("scoresConsistentWithMarket: marche non evaluable ou aucun score compatible simule -> repli honnete sur le brut, jamais une liste vide ni un score invente", () => {
  const raw = [{ score: "0-0", n: 900, pct: 90 }, { score: "1-0", n: 100, pct: 10 }];
  assert.deepEqual(scoresConsistentWithMarket(raw, "fh-over-05", 3), raw.slice(0, 3));
  assert.deepEqual(scoresConsistentWithMarket(raw, "over-35", 3), raw.slice(0, 3));
});
