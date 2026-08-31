"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pickMarketDeterministic, computeRiskLabel, computeModelAgreement, computeDataQualityScore, computeReliability } = require("../lib/decision.js");

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

test("pickMarketDeterministic: ignore le marche de plus haute probabilite brute s'il n'a aucun edge reel (le marche est deja plus confiant que nous dessus), lui prefere un marche a edge positif", () => {
  const markets = [
    // Probabilite modele la plus haute du lot, mais le marche est ENCORE plus
    // confiant dessus (marketProb 80 > prob 72) - aucune valeur reelle, ne
    // doit jamais etre choisi juste parce qu'il est "le plus probable" dans
    // l'absolu.
    { market: "Victoire Domicile", prob: 72, marketProb: 80, cote: 1.4 },
    // Edge reel positif (modele plus confiant que le marche) meme si la
    // probabilite brute est plus basse - c'est ce marche qui doit etre
    // recommande.
    { market: "BTTS Oui", prob: 58, marketProb: 47, cote: 1.9 },
  ];
  assert.equal(pickMarketDeterministic(markets).market, "BTTS Oui");
});

test("pickMarketDeterministic: entre deux marches a edge positif, retient celui de plus haute probabilite modele (pas le plus gros edge)", () => {
  const markets = [
    { market: "Faible proba, gros edge", prob: 30, marketProb: 12, cote: 3.2 },
    { market: "Forte proba, petit edge", prob: 65, marketProb: 60, cote: 1.6 },
  ];
  assert.equal(pickMarketDeterministic(markets).market, "Forte proba, petit edge");
});

test("pickMarketDeterministic: aucun marche a edge positif -> repli sur la plus haute probabilite brute (couverture preservee, jamais aucune recommandation)", () => {
  const markets = [
    { market: "A", prob: 55, marketProb: 60, cote: 1.7 },
    { market: "B", prob: 70, marketProb: 75, cote: 1.3 },
  ];
  assert.equal(pickMarketDeterministic(markets).market, "B");
});

test("pickMarketDeterministic: marketProb absent (pas de cote fiable pour ce marche precis) -> traite comme sans edge connu, jamais exclu ni fabrique", () => {
  const markets = [
    { market: "Sans marketProb", prob: 50, cote: 2.0 },
    { market: "Avec edge negatif", prob: 55, marketProb: 65, cote: 1.6 },
  ];
  // Aucun des deux n'a d'edge positif verifiable -> repli plus haute proba brute.
  assert.equal(pickMarketDeterministic(markets).market, "Avec edge negatif");
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
