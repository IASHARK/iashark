"use strict";
// EXP-002C (SPEC LAB PRO v1.0, M2 CORRIGE - audit 2026-09-05) - M2 =
// M0_PRODUCTION_REPLAY + mecanisme Bayes early-season UNIQUEMENT.
// Reutilise EXCLUSIVEMENT des composants DEJA AUDITES, aucune formule
// reinventee :
//   - lib/data/production-replay.js#buildProductionStateAtCutoff : LE
//     vrai champion M0 (season-scope, corrige le 2026-09-05, teste
//     contre l'API reelle a des cutoffs precoces).
//   - lib/lab/bayes-early-season.js#blendWithDecayingPrior : la formule
//     Bayes deja auditee (prior_weight(n)=max(0,8-0.5n), identique au
//     mecanisme deja en production lib/markets/early-season.js) -
//     JAMAIS reimplementee ici.
//   - lib/lab/walkforward-m2r-runner.js#isReturningTeam/computeRealLeagueAverageRates/
//     previousSeasonState : logique de provenance du prior deja construite
//     et testee pour EXP-002R, reutilisee telle quelle.
//
// Difference structurelle avec EXP-002R : baseState est DESORMAIS
// season-scope (buildProductionStateAtCutoff, pas l'ancien buildTeamState
// sur pool multi-saisons) - donc n (poids Bayes) = baseState.playedTotal
// DIRECTEMENT, aucune reconstruction "saison courante" separee n'est
// necessaire (elle EST deja le baseState).

const { buildProductionStateAtCutoff, isM0Available } = require("../data/production-replay.js");
const { toCalcLambdasArgs } = require("../data/team-state.js");
const { calcLambdas } = require("../engine.js");
const { predictWithRho } = require("./dc-matrix-with-rho.js");
const { priorWeight, blendWithDecayingPrior } = require("./bayes-early-season.js");
const { buildCutoffs } = require("./walkforward-runner.js");
const { isReturningTeam, computeRealLeagueAverageRates, previousSeasonState } = require("./walkforward-m2r-runner.js");

const CHAMPION_RHO = -0.0845;

function classifyBucket(nMin) {
  if (nMin <= 8) return "EARLY";
  if (nMin <= 16) return "TRANSITION";
  return "LATE";
}

function priorForTeam(previousSeasonFixtures, teamId, isHome, leagueRates, season) {
  const returning = isReturningTeam(previousSeasonFixtures, teamId);
  if (returning) {
    const prevState = previousSeasonState(previousSeasonFixtures, teamId);
    const played = isHome ? prevState.playedHome : prevState.playedAway;
    const usable = played > 0;
    const forRate = isHome ? prevState.goalsForHome / (played || 1) : prevState.goalsForAway / (played || 1);
    const againstRate = isHome ? prevState.goalsAgainstHome / (played || 1) : prevState.goalsAgainstAway / (played || 1);
    const fallbackFor = isHome ? leagueRates.avgHomeFor : leagueRates.avgAwayFor;
    const fallbackAgainst = isHome ? leagueRates.avgHomeAgainst : leagueRates.avgAwayAgainst;
    const maxTs = previousSeasonFixtures.filter((x) => (isHome ? x.home_team_id : x.away_team_id) === teamId).map((x) => x.kickoff_timestamp).sort().slice(-1)[0];
    return {
      returning: true,
      forRate: usable ? forRate : fallbackFor,
      againstRate: usable ? againstRate : fallbackAgainst,
      source: {
        prior_type: usable ? "PREVIOUS_SEASON_TEAM_SPECIFIC" : "REAL_LEAGUE_AVERAGE_PREVIOUS_SEASON",
        source_season: season - 1,
        source_fixture_count: usable ? played : leagueRates.n_fixtures,
        source_max_timestamp: usable ? maxTs : leagueRates.max_source_timestamp,
      },
    };
  }
  return {
    returning: false,
    forRate: isHome ? leagueRates.avgHomeFor : leagueRates.avgAwayFor,
    againstRate: isHome ? leagueRates.avgHomeAgainst : leagueRates.avgAwayAgainst,
    source: {
      prior_type: "REAL_LEAGUE_AVERAGE_PREVIOUS_SEASON",
      source_season: season - 1,
      source_fixture_count: leagueRates.n_fixtures,
      source_max_timestamp: leagueRates.max_source_timestamp,
    },
  };
}

// options = { allFixtures, oosSeasons, leagueId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons }
function runWalkForwardM2C(options) {
  const { allFixtures, leagueId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons } = options;
  const oosSeasons = options.oosSeasons || [];

  const oosFixtures = allFixtures.filter((f) => oosSeasons.includes(f.season));
  const cutoffs = buildCutoffs(oosFixtures);

  const seasonFixturesCache = new Map();
  function seasonFixturesFor(season) {
    if (!seasonFixturesCache.has(season)) seasonFixturesCache.set(season, allFixtures.filter((f) => f.season === season));
    return seasonFixturesCache.get(season);
  }

  const predictions = [];
  const lateIdentityViolations = [];

  for (const { cutoff, batch } of cutoffs) {
    for (const f of batch) {
      if (f.goals_home_90 == null || f.goals_away_90 == null) continue;

      const seasonFixtures = seasonFixturesFor(f.season);
      const homeState = buildProductionStateAtCutoff({ allFixtures, season: f.season, teamId: f.home_team_id, cutoff, seasonFixtures });
      const awayState = buildProductionStateAtCutoff({ allFixtures, season: f.season, teamId: f.away_team_id, cutoff, seasonFixtures });
      const m0Valid = isM0Available(homeState) && isM0Available(awayState);
      const lambdasM0 = calcLambdas(...toCalcLambdasArgs(homeState, awayState, leagueAvgH, leagueAvgA, leagueId));

      // n = baseState.playedTotal DIRECTEMENT (baseState est deja season-scope)
      const nHome = homeState.playedTotal, nAway = awayState.playedTotal;
      const nMin = Math.min(nHome, nAway);
      const weightHome = priorWeight(nHome), weightAway = priorWeight(nAway);

      const previousSeasonFixtures = previousSeasonFixturesBySeasons.get(f.season) || [];
      const leagueRates = computeRealLeagueAverageRates(previousSeasonFixtures);
      const homePrior = priorForTeam(previousSeasonFixtures, f.home_team_id, true, leagueRates, f.season);
      const awayPrior = priorForTeam(previousSeasonFixtures, f.away_team_id, false, leagueRates, f.season);

      // Blend Bayes - REUTILISE lib/lab/bayes-early-season.js#blendWithDecayingPrior telle quelle
      const blendHFor = blendWithDecayingPrior({ events: homeState.goalsForHome, matches: homeState.playedHome }, homePrior.forRate, nHome);
      const blendHAgainst = blendWithDecayingPrior({ events: homeState.goalsAgainstHome, matches: homeState.playedHome }, homePrior.againstRate, nHome);
      const blendAFor = blendWithDecayingPrior({ events: awayState.goalsForAway, matches: awayState.playedAway }, awayPrior.forRate, nAway);
      const blendAAgainst = blendWithDecayingPrior({ events: awayState.goalsAgainstAway, matches: awayState.playedAway }, awayPrior.againstRate, nAway);

      const lambdasM2 = calcLambdas(
        blendHFor.blended_events, blendHAgainst.blended_events, blendHFor.blended_matches,
        blendAFor.blended_events, blendAAgainst.blended_events, blendAFor.blended_matches,
        leagueAvgH, leagueAvgA, leagueId
      );

      // SANITY CHECK OBLIGATOIRE : crash immediat si violation de l'invariant LATE
      if (weightHome === 0 && weightAway === 0) {
        const dH = Math.abs(lambdasM2.lambdaH - lambdasM0.lambdaH);
        const dA = Math.abs(lambdasM2.lambdaA - lambdasM0.lambdaA);
        if (dH > 1e-12 || dA > 1e-12) lateIdentityViolations.push({ fixture_id: f.fixture_id, lambdasM0, lambdasM2, dH, dA });
      }

      const m0 = predictWithRho(lambdasM0.lambdaH, lambdasM0.lambdaA, CHAMPION_RHO);
      const m2 = predictWithRho(lambdasM2.lambdaH, lambdasM2.lambdaA, CHAMPION_RHO);

      predictions.push({
        fixture_id: f.fixture_id, season: f.season, cutoff,
        home_team_id: f.home_team_id, away_team_id: f.away_team_id,
        n_home: nHome, n_away: nAway, n_min: nMin, bucket: classifyBucket(nMin),
        home_returning: homePrior.returning, away_returning: awayPrior.returning,
        prior_weight_home: weightHome, prior_weight_away: weightAway,
        prior_source_home: homePrior.source, prior_source_away: awayPrior.source,
        m0_valid: m0Valid,
        lambdaH_m0: lambdasM0.lambdaH, lambdaA_m0: lambdasM0.lambdaA,
        lambdaH_m2: lambdasM2.lambdaH, lambdaA_m2: lambdasM2.lambdaA,
        goals_home_90: f.goals_home_90, goals_away_90: f.goals_away_90,
        markets_m0: m0.markets, markets_m2: m2.markets,
      });
    }
  }

  if (lateIdentityViolations.length > 0) {
    const err = new Error(`LATE_IDENTITY_VIOLATIONS=${lateIdentityViolations.length} - arret obligatoire, aucun rapport genere. Premiere: ${JSON.stringify(lateIdentityViolations[0])}`);
    err.code = "LATE_IDENTITY_VIOLATED";
    err.violations = lateIdentityViolations;
    throw err;
  }

  return { predictions };
}

module.exports = { runWalkForwardM2C, classifyBucket, priorForTeam };
