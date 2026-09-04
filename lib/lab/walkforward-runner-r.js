"use strict";
// EXP-001R (correction CHAMPION_REPLAY_MISMATCH, audit 2026-09-05) -
// walk-forward M0 vs M1 REJOUE avec le champion CORRECT. MEME structure
// que lib/lab/walkforward-runner.js (reutilise buildCutoffs telle
// quelle), MAIS chaque lambda (que ce soit pour une paire
// d'entrainement de rho ou pour une prediction OOS) est calcule via
// lib/data/production-replay.js#buildProductionStateAtCutoff -
// STRICTEMENT season-scope, jamais un pool multi-saisons.
//
// trainSeasons ne sert plus qu'a fournir des EXEMPLES D'ENTRAINEMENT
// supplementaires pour le fit de rho (chaque exemple garde son propre
// lambda calcule dans SA PROPRE saison, jamais melange avec une autre) -
// il n'influence JAMAIS le lambda d'un match d'une AUTRE saison.
//
// M0 indisponible (calcCriteres<3 matchs saison courante) -> AUCUNE
// prediction n'est fabriquee pour ce match, ni pour l'entrainement ni
// pour l'OOS - jamais un repli silencieux.

const { buildProductionStateAtCutoff, isM0Available } = require("../data/production-replay.js");
const { toCalcLambdasArgs } = require("../data/team-state.js");
const { calcLambdas } = require("../engine.js");
const { predictWithRho } = require("./dc-matrix-with-rho.js");
const { buildCutoffs } = require("./walkforward-runner.js");

function runWalkForwardR(options) {
  const { allFixtures, championRho, candidateRhoFitter, leagueAvgH, leagueAvgA, leagueId } = options;
  const trainSeasons = options.trainSeasons || [];
  const oosSeasons = options.oosSeasons || [];

  // Optimisation de performance PURE (memes resultats, verifie par
  // tests/lab-production-replay.test.js#"optimisation performance") :
  // pre-filtre chaque saison UNE SEULE FOIS plutot que de laisser
  // buildProductionStateAtCutoff refiltrer allFixtures (1520 lignes) a
  // chaque appel - des dizaines de milliers d'appels sur ce walk-forward.
  const seasonFixturesCache = new Map();
  function seasonFixturesFor(season) {
    if (!seasonFixturesCache.has(season)) seasonFixturesCache.set(season, allFixtures.filter((f) => f.season === season));
    return seasonFixturesCache.get(season);
  }

  // Pool des fixtures POTENTIELLEMENT utiles comme EXEMPLES d'entrainement
  // pour rho (chaque exemple garde son propre lambda season-scope) -
  // distinct du pool bugue d'origine qui melangeait les etats eux-memes.
  const candidateTrainFixtures = allFixtures.filter((f) => trainSeasons.includes(f.season) || oosSeasons.includes(f.season));
  const oosFixtures = allFixtures.filter((f) => oosSeasons.includes(f.season));

  const cutoffs = buildCutoffs(oosFixtures);
  const predictions = [];
  const fitLog = [];
  let nExcludedM0Unavailable = 0;

  for (const { cutoff, batch } of cutoffs) {
    const cutoffMs = new Date(cutoff).getTime();

    const trainLambdaScorePairs = [];
    for (const f of candidateTrainFixtures) {
      if (new Date(f.kickoff_timestamp).getTime() >= cutoffMs) continue;
      if (f.goals_home_90 == null || f.goals_away_90 == null) continue;
      const seasonFixtures = seasonFixturesFor(f.season);
      const homeState = buildProductionStateAtCutoff({ allFixtures, season: f.season, teamId: f.home_team_id, cutoff: f.kickoff_timestamp, seasonFixtures });
      const awayState = buildProductionStateAtCutoff({ allFixtures, season: f.season, teamId: f.away_team_id, cutoff: f.kickoff_timestamp, seasonFixtures });
      if (!isM0Available(homeState) || !isM0Available(awayState)) continue;
      const lambdas = calcLambdas(...toCalcLambdasArgs(homeState, awayState, leagueAvgH, leagueAvgA, leagueId));
      trainLambdaScorePairs.push({ lambdaH: lambdas.lambdaH, lambdaA: lambdas.lambdaA, h: f.goals_home_90, a: f.goals_away_90 });
    }

    const fitResult = candidateRhoFitter ? candidateRhoFitter(trainLambdaScorePairs) : { rho_hat: championRho, convergence: true };
    fitLog.push({ cutoff, n_train: trainLambdaScorePairs.length, ...fitResult });

    for (const f of batch) {
      if (f.goals_home_90 == null || f.goals_away_90 == null) continue;
      const seasonFixturesBatch = seasonFixturesFor(f.season);
      const homeState = buildProductionStateAtCutoff({ allFixtures, season: f.season, teamId: f.home_team_id, cutoff, seasonFixtures: seasonFixturesBatch });
      const awayState = buildProductionStateAtCutoff({ allFixtures, season: f.season, teamId: f.away_team_id, cutoff, seasonFixtures: seasonFixturesBatch });
      if (!isM0Available(homeState) || !isM0Available(awayState)) { nExcludedM0Unavailable++; continue; }
      const lambdas = calcLambdas(...toCalcLambdasArgs(homeState, awayState, leagueAvgH, leagueAvgA, leagueId));

      const m0 = predictWithRho(lambdas.lambdaH, lambdas.lambdaA, championRho);
      const m1 = predictWithRho(lambdas.lambdaH, lambdas.lambdaA, fitResult.rho_hat);

      predictions.push({
        fixture_id: f.fixture_id,
        season: f.season,
        cutoff,
        lambdaH: lambdas.lambdaH,
        lambdaA: lambdas.lambdaA,
        goals_home_90: f.goals_home_90,
        goals_away_90: f.goals_away_90,
        rho_m0: championRho,
        rho_m1: fitResult.rho_hat,
        markets_m0: m0.markets,
        markets_m1: m1.markets,
      });
    }
  }

  return { predictions, fitLog, cutoffs: cutoffs.map((c) => c.cutoff), n_excluded_m0_unavailable: nExcludedM0Unavailable };
}

module.exports = { runWalkForwardR };
