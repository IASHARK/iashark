"use strict";
// MARKET LAB - PHASE 3A close-out (2026-09-05), items 2-3. Consumer
// READ-ONLY du champion FERME M2 (SCORE-LAB-EXP-002C) pour UNE fixture
// a venir. Reutilise EXACTEMENT les memes briques que
// lib/lab/walkforward-m2c-runner.js#runWalkForwardM2C, jamais
// reimplementees : buildProductionStateAtCutoff, priorForTeam,
// blendWithDecayingPrior, calcLambdas, predictWithRho (rho=-0.0845
// fixe), buildMarketCatalogue. La seule difference avec le lab est
// l'orchestration : UNE fixture a la fois, hors boucle walk-forward,
// pour un usage live/forward plutot qu'un backtest sur historique deja
// connu.
//
// Invariant LATE reproduit A L'IDENTIQUE (meme garde que le lab, meme
// seuil 1e-12) : un bug de ce type (LATE_IDENTITY_VIOLATED) a deja ete
// une classe de bug reelle pendant ce lab - ne JAMAIS relacher cette
// garde en mode live. Si elle est violee ici, c'est un signal que la
// reconstruction d'etat live diverge du contrat M2 ferme -> on refuse
// de produire un snapshot plutot que d'en publier un faux.

const { buildProductionStateAtCutoff } = require("../data/production-replay.js");
const { toCalcLambdasArgs } = require("../data/team-state.js");
const { calcLambdas } = require("../engine.js");
const { predictWithRho } = require("../lab/dc-matrix-with-rho.js");
const { priorWeight, blendWithDecayingPrior } = require("../lab/bayes-early-season.js");
const { priorForTeam } = require("../lab/walkforward-m2c-runner.js");
const { computeRealLeagueAverageRates } = require("../lab/walkforward-m2r-runner.js");
const { buildMarketCatalogue } = require("./market-catalogue.js");
const { deepFreeze } = require("./model-snapshot.js");

const CHAMPION_RHO = -0.0845;
const MODEL_VERSION = "M2";

class M2LiveReplayMismatchError extends Error {
  constructor(message, details) {
    super(message);
    this.name = "M2LiveReplayMismatchError";
    this.details = details;
  }
}

// options = { fixtureId, homeTeamId, awayTeamId, season, leagueId,
// allFixtures, previousSeasonFixtures, leagueAvgH, leagueAvgA, cutoff,
// generatedAt }.
//
// allFixtures : TOUTES les fixtures de la saison courante deja jouees
// jusqu'a `cutoff` (jamais une fixture future dans les features -
// exactement comme le walk-forward du lab, le filtrage temporel reste
// a la charge de l'appelant qui construit ce tableau).
// previousSeasonFixtures : fixtures de la saison precedente (source du
// prior Bayes early-season).
//
// Retour : snapshot IMMUABLE avec fixture_id, generated_at,
// input_cutoff, model_version, lambda_h, lambda_a, matrix, matrix_hash,
// v1_probabilities (les 36 IDs canoniques a cardinalite fixe, exact
// score exclu - diagnostic uniquement, cardinalite variable).
function buildM2LiveSnapshot(options) {
  const { fixtureId, homeTeamId, awayTeamId, season, leagueId, allFixtures, previousSeasonFixtures, leagueAvgH, leagueAvgA, cutoff, generatedAt } = options;

  const seasonFixtures = allFixtures.filter((f) => f.season === season);
  const homeState = buildProductionStateAtCutoff({ allFixtures, season, teamId: homeTeamId, cutoff, seasonFixtures });
  const awayState = buildProductionStateAtCutoff({ allFixtures, season, teamId: awayTeamId, cutoff, seasonFixtures });

  const nHome = homeState.playedTotal, nAway = awayState.playedTotal;
  const leagueRates = computeRealLeagueAverageRates(previousSeasonFixtures);
  const homePrior = priorForTeam(previousSeasonFixtures, homeTeamId, true, leagueRates, season);
  const awayPrior = priorForTeam(previousSeasonFixtures, awayTeamId, false, leagueRates, season);

  const blendHFor = blendWithDecayingPrior({ events: homeState.goalsForHome, matches: homeState.playedHome }, homePrior.forRate, nHome);
  const blendHAgainst = blendWithDecayingPrior({ events: homeState.goalsAgainstHome, matches: homeState.playedHome }, homePrior.againstRate, nHome);
  const blendAFor = blendWithDecayingPrior({ events: awayState.goalsForAway, matches: awayState.playedAway }, awayPrior.forRate, nAway);
  const blendAAgainst = blendWithDecayingPrior({ events: awayState.goalsAgainstAway, matches: awayState.playedAway }, awayPrior.againstRate, nAway);

  const lambdasM2 = calcLambdas(
    blendHFor.blended_events, blendHAgainst.blended_events, blendHFor.blended_matches,
    blendAFor.blended_events, blendAAgainst.blended_events, blendAFor.blended_matches,
    leagueAvgH, leagueAvgA, leagueId
  );

  const weightHome = priorWeight(nHome), weightAway = priorWeight(nAway);
  if (weightHome === 0 && weightAway === 0) {
    const lambdasM0 = calcLambdas(...toCalcLambdasArgs(homeState, awayState, leagueAvgH, leagueAvgA, leagueId));
    const dH = Math.abs(lambdasM2.lambdaH - lambdasM0.lambdaH);
    const dA = Math.abs(lambdasM2.lambdaA - lambdasM0.lambdaA);
    if (dH > 1e-12 || dA > 1e-12) {
      throw new M2LiveReplayMismatchError(`M2_LIVE_REPLAY_MISMATCH: invariant LATE viole pour fixture_id=${fixtureId}`, { fixtureId, dH, dA });
    }
  }

  const { matrix } = predictWithRho(lambdasM2.lambdaH, lambdasM2.lambdaA, CHAMPION_RHO);
  const catalogue = buildMarketCatalogue({ matrix, fixtureId, modelVersion: MODEL_VERSION });
  const v1Probabilities = catalogue.markets.filter((m) => !m.diagnostic_only);

  return deepFreeze({
    fixture_id: fixtureId,
    generated_at: generatedAt,
    input_cutoff: cutoff,
    model_version: MODEL_VERSION,
    lambda_h: lambdasM2.lambdaH,
    lambda_a: lambdasM2.lambdaA,
    matrix,
    matrix_hash: catalogue.source_matrix_hash,
    v1_probabilities: v1Probabilities,
  });
}

module.exports = { buildM2LiveSnapshot, M2LiveReplayMismatchError, CHAMPION_RHO, MODEL_VERSION };
