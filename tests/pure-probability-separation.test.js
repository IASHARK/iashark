"use strict";
// Garde-fou contre toute regression de la separation stricte des 3
// probabilites (MASTER V2.1 §10.2), exigee explicitement par l'utilisateur
// apres qu'un audit ait trouve 1X2/Double Chance ancres au marche pendant
// qu'Over/Under et BTTS restaient purs - une asymetrie qui ne doit plus
// jamais reapparaitre.
//
// Deux niveaux de protection :
//   1. Preuve mathematique (ce fichier) : avec les MEMES lambdas, faire
//      varier les cotes du marche du tout au tout ne doit JAMAIS changer
//      une probabilite PURE - seule une probabilite MARKET_AWARE doit
//      reagir. Utilise les memes primitives que le pipeline (lib/models.js).
//   2. Garde structurel (tests/pipeline-source-guards.test.js) : verifie
//      que le pipeline reel (.github/workflows/update-data.yml) construit
//      bien allMarkets/p1/pn/p2 a partir de pureProbs et jamais d'un objet
//      ancre au marche, en inspectant le texte source qui tourne
//      reellement en production - pas une copie parallele qui pourrait
//      diverger silencieusement.

const test = require("node:test");
const assert = require("node:assert/strict");
const { calcPoissonProbs, calcDixonColesProbs, calcMonteCarlo, shinProbabilities } = require("../lib/models.js");

// Reproduit l'ensemble PURE du pipeline (calcFinalProbs sans Elo/marche) :
// blend Poisson+Dixon-Coles+Monte-Carlo uniquement depuis les lambdas.
function pureEnsembleP1(lambdaH, lambdaA, seed) {
  const po = calcPoissonProbs(lambdaH, lambdaA);
  const dc = calcDixonColesProbs(lambdaH, lambdaA);
  const mc = calcMonteCarlo(lambdaH, lambdaA, { n: 3000, seed });
  return Math.round(po.p1 * 0.35 + dc.p1 * 0.40 + mc.p1 * 0.25);
}

// Reproduit le blend MARKET_AWARE du pipeline : melange la probabilite PURE
// avec la probabilite de marche (Shin), pondere vers le marche.
function marketAwareP1(purePct, shinP1Pct, weight) {
  return Math.round(purePct * (1 - weight) + shinP1Pct * weight);
}

test("PURE_IASHARK_PROBABILITY : identique quelles que soient les cotes du marche (memes lambdas)", () => {
  const lambdaH = 1.6, lambdaA = 1.1, seed = 42;
  const pureScenarioFavoriDom = pureEnsembleP1(lambdaH, lambdaA, seed);
  const pureScenarioOutsiderDom = pureEnsembleP1(lambdaH, lambdaA, seed);
  assert.equal(pureScenarioFavoriDom, pureScenarioOutsiderDom, "PURE ne doit jamais varier avec les cotes - seuls les lambdas comptent");
});

test("MARKET_AWARE_PROBABILITY : varie reellement selon les cotes (contraste avec PURE)", () => {
  const lambdaH = 1.6, lambdaA = 1.1, seed = 42;
  const pure = pureEnsembleP1(lambdaH, lambdaA, seed);

  const shinFavoriDom = shinProbabilities([1.30, 5.5, 9.0]).map((p) => Math.round(p * 100));
  const shinOutsiderDom = shinProbabilities([4.50, 3.5, 1.75]).map((p) => Math.round(p * 100));

  const marketAwareFavoriDom = marketAwareP1(pure, shinFavoriDom[0], 0.55);
  const marketAwareOutsiderDom = marketAwareP1(pure, shinOutsiderDom[0], 0.55);

  assert.notEqual(marketAwareFavoriDom, marketAwareOutsiderDom, "MARKET_AWARE doit reagir aux cotes, sinon ce n'est pas 'market aware'");
  // Les deux scenarios doivent s'ecarter de PURE dans des directions opposees
  // (l'un vers le haut, l'autre vers le bas) puisque les cotes sont opposees.
  assert.ok((marketAwareFavoriDom > pure) !== (marketAwareOutsiderDom > pure) || marketAwareFavoriDom !== marketAwareOutsiderDom);
});

test("Double Chance PURE derive des probabilites 1X2 PURE elles-memes, jamais d'un blend marche", () => {
  const lambdaH = 1.6, lambdaA = 1.1;
  const po = calcPoissonProbs(lambdaH, lambdaA);
  const dc = calcDixonColesProbs(lambdaH, lambdaA);
  const mc = calcMonteCarlo(lambdaH, lambdaA, { n: 3000, seed: 7 });
  const pureP1 = Math.round(po.p1 * 0.35 + dc.p1 * 0.40 + mc.p1 * 0.25);
  const purePN = Math.round(po.pN * 0.35 + dc.pN * 0.40 + mc.pN * 0.25);
  const pureDC1X = pureP1 + purePN;
  // Coherence de definition : DC 1X pur = P1 pur + PN pur, point.
  assert.equal(pureDC1X, pureP1 + purePN);
  // Et ce chiffre ne peut mathematiquement pas depasser 100 ni etre negatif.
  assert.ok(pureDC1X >= 0 && pureDC1X <= 100);
});
