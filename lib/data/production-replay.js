"use strict";
// buildProductionStateAtCutoff - DEFINITION CANONIQUE UNIQUE du state M0
// production. Corrige le CHAMPION_REPLAY_MISMATCH confirme le 2026-09-05 :
// lib/lab/walkforward-runner.js (EXP-001) et lib/lab/walkforward-m2r-runner.js
// (EXP-002R) construisaient le state M0 depuis un pool multi-saisons
// (trainSeasons UNION oosSeasons, filtre uniquement kickoff<cutoff -
// JAMAIS par saison), permettant a une equipe REVENANTE de "debloquer"
// M0 des le premier match de la nouvelle saison grace aux 38 matchs de
// la saison precedente encore dans le pool. Confirme empiriquement :
// Arsenal 1er match 2023-24, playedTotal POOLE=38 (au lieu de 0
// attendu). Production reelle (via /teams/statistics?season=X, verifie
// par GATE B6) est STRICTEMENT saison-scopee - aucune fixture d'une
// autre saison ne doit jamais entrer dans played/goals_for/goals_against/
// home_split/away_split/form/calcCriteres/calcLambdas de M0.
//
// Ce module est LA SEULE fonction que production/backtest/tests doivent
// utiliser pour reconstruire un state M0 point-in-time - jamais une
// reimplementation parallele.

const { buildTeamState, toCalcCriteresStats, toCalcLambdasArgs } = require("./team-state.js");
const { calcCriteres, calcLambdas } = require("../engine.js");

// allFixtures : fixtures de PLUSIEURS saisons potentiellement (dataset
// complet) - ce module filtre lui-meme a season===season AVANT tout
// filtrage temporel, contrairement au bug corrige.
//
// options.seasonFixtures (optionnel) : permet a un appelant qui a DEJA
// pre-filtre les fixtures d'une saison (ex: un walk-forward qui appelle
// cette fonction des milliers de fois pour la MEME saison) de sauter le
// refiltrage O(n) repete sur le dataset complet a chaque appel - PURE
// optimisation de performance, le CONTRAT reste identique (le resultat
// est le meme que si on refiltrait a chaque fois) : si fourni, DOIT deja
// ne contenir que season===season, jamais verifie a nouveau ici.
function buildProductionStateAtCutoff({ allFixtures, season, teamId, cutoff, seasonFixtures }) {
  const seasonScoped = seasonFixtures || allFixtures.filter((f) => f.season === season);
  const cutoffMs = new Date(cutoff).getTime();
  const trainFixtures = seasonScoped.filter((f) => new Date(f.kickoff_timestamp).getTime() < cutoffMs);
  return buildTeamState(trainFixtures, teamId, cutoff);
}

// calcCriteres exige stats.fixtures.played.total>=3 - le meme total,
// que isDom soit true ou false (le seuil ne differe pas selon le cote),
// donc un seul appel suffit pour determiner la disponibilite M0.
function isM0Available(state) {
  return !!calcCriteres(toCalcCriteresStats(state), true, null);
}

// Calcule les lambdas M0 (et leur disponibilite) pour UN match, en
// reconstruisant les DEUX etats via buildProductionStateAtCutoff -
// jamais une autre source.
function computeM0Lambdas({ allFixtures, season, homeTeamId, awayTeamId, cutoff, leagueAvgH, leagueAvgA, leagueId }) {
  const homeState = buildProductionStateAtCutoff({ allFixtures, season, teamId: homeTeamId, cutoff });
  const awayState = buildProductionStateAtCutoff({ allFixtures, season, teamId: awayTeamId, cutoff });
  const homeValid = isM0Available(homeState);
  const awayValid = isM0Available(awayState);
  const lambdas = calcLambdas(...toCalcLambdasArgs(homeState, awayState, leagueAvgH, leagueAvgA, leagueId));
  return { homeState, awayState, valid: homeValid && awayValid, lambdas };
}

module.exports = { buildProductionStateAtCutoff, isM0Available, computeM0Lambdas };
