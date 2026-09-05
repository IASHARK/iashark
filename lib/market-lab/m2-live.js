"use strict";
// MARKET LAB - PHASE 3A (2026-09-05), item 3. Extrait la logique DE
// CALCUL M2 (blend Bayes early-season + calcLambdas) de
// lib/lab/walkforward-m2c-runner.js pour la rendre appelable HORS
// walk-forward, par un futur collecteur live/forward - jamais
// reimplementee, seulement isolee de son contexte de backtest.
//
// GAP HONNETE (2026-09-05) : M2 n'est PAS aujourd'hui deploye en
// production (lib/engine.js#calcLambdas ne connait pas le blend Bayes
// early-season - seul lib/lab/walkforward-m2c-runner.js l'exerce, en
// mode backtest, avec un etat d'equipe et des priors saison precedente
// reconstruits depuis l'historique). Pour que ce module produise un
// VRAI snapshot M2 sur une fixture forward, l'appelant doit fournir
// homeState/awayState (comme buildProductionStateAtCutoff en backtest)
// et homePrior/awayPrior (comme previousSeasonState/leagueRates en
// backtest) - reconstruire ces deux entrees depuis l'etat LIVE de la
// production (pas un replay historique) n'est pas encore cable ici :
// ce module prepare l'appel, il ne cree pas de nouvelle source de
// donnees live.

const { calcLambdas } = require("../engine.js");
const { predictWithRho } = require("../lab/dc-matrix-with-rho.js");
const { priorWeight, blendWithDecayingPrior } = require("../lab/bayes-early-season.js");
const { buildMarketCatalogue } = require("./market-catalogue.js");

const CHAMPION_RHO = -0.0845;
const MODEL_VERSION = "M2";

// homeState/awayState : memes champs que produits par
// buildProductionStateAtCutoff (goalsForHome/goalsAgainstHome/
// playedHome/playedTotal, etc.). homePrior/awayPrior : { forRate,
// againstRate } - deja resolus par l'appelant (saison precedente reelle
// ou moyenne de ligue), jamais fabriques ici.
function computeM2Lambdas({ homeState, awayState, homePrior, awayPrior, leagueAvgH, leagueAvgA, leagueId }) {
  const nHome = homeState.playedTotal, nAway = awayState.playedTotal;
  const blendHFor = blendWithDecayingPrior({ events: homeState.goalsForHome, matches: homeState.playedHome }, homePrior.forRate, nHome);
  const blendHAgainst = blendWithDecayingPrior({ events: homeState.goalsAgainstHome, matches: homeState.playedHome }, homePrior.againstRate, nHome);
  const blendAFor = blendWithDecayingPrior({ events: awayState.goalsForAway, matches: awayState.playedAway }, awayPrior.forRate, nAway);
  const blendAAgainst = blendWithDecayingPrior({ events: awayState.goalsAgainstAway, matches: awayState.playedAway }, awayPrior.againstRate, nAway);

  const lambdas = calcLambdas(
    blendHFor.blended_events, blendHAgainst.blended_events, blendHFor.blended_matches,
    blendAFor.blended_events, blendAAgainst.blended_events, blendAFor.blended_matches,
    leagueAvgH, leagueAvgA, leagueId
  );
  return { lambdaH: lambdas.lambdaH, lambdaA: lambdas.lambdaA, prior_weight_home: priorWeight(nHome), prior_weight_away: priorWeight(nAway) };
}

// Construit le catalogue de marches M2 (Phase 1) a partir des lambdas
// M2 - reutilise predictWithRho (rho=-0.0845 fixe) et
// buildMarketCatalogue tels quels, jamais reimplementes.
function computeM2MarketCatalogue({ lambdaH, lambdaA, fixtureId }) {
  const { matrix } = predictWithRho(lambdaH, lambdaA, CHAMPION_RHO);
  return buildMarketCatalogue({ matrix, fixtureId, modelVersion: MODEL_VERSION });
}

module.exports = { computeM2Lambdas, computeM2MarketCatalogue, CHAMPION_RHO, MODEL_VERSION };
