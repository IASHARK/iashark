"use strict";
// EXP-002 (SPEC LAB PRO v1.0, M2) - walk-forward M0 vs M2. MEME politique
// de cutoff/batch que le laboratoire (lib/lab/walkforward-runner.js
// #buildCutoffs, reutilisee telle quelle, jamais reimplementee) : un
// cutoff = un jour calendaire, train strictement < cutoff, un batch
// jamais dans son propre train.
//
// Difference structurelle avec EXP-001 (rho appris) : ici rho reste
// FIXE a -0.0845 pour M0 ET M2 - "la SEULE difference doit etre le
// shrinkage early-season" (SPEC EXP-002). Les agregats sont "saison
// courante uniquement avant cutoff" (jamais pooles avec le warm-up
// comme le faisait EXP-001) - la saison N-1 sert UNIQUEMENT de source
// pour le prior Bayes de la saison N, jamais de pool de matchs
// supplementaires pour M0.
//
// M0 : calcLambdas nourri des comptes bruts (bm/md) de la saison
// courante SEULE - AUCUN gate calcCriteres (contrairement a EXP-001) :
// le but explicite de M2 est de mesurer l'effet du shrinkage justement
// dans le regime n=0,1,2... ou M0 est le plus fragile (calcLambdas
// retombe sur son propre repli attH=1/defA=1 a mdHdom=0/meAext=0, deja
// integre a l'engine, jamais reimplemente ici).
// M2 : MEME calcLambdas, MEMES arguments positionnels, mais bm/md sont
// remplaces par les valeurs MELANGEES (lib/lab/bayes-early-season.js) -
// jamais une nouvelle feature, jamais un nouveau moteur.

const { buildTeamState } = require("../data/team-state.js");
const { calcLambdas } = require("../engine.js");
const { predictWithRho } = require("./dc-matrix-with-rho.js");
const { blendWithDecayingPrior } = require("./bayes-early-season.js");
const { buildCutoffs } = require("./walkforward-runner.js");

const CHAMPION_RHO = -0.0845;
const LEAGUE_AVG_H = 1.35;
const LEAGUE_AVG_A = 1.10;
const FAR_FUTURE_CUTOFF = "9999-01-01T00:00:00.000Z";

// Buckets pre-enregistres (SPEC EXP-002 §4), sur n_min = min(n_home, n_away).
function classifyBucket(nMin) {
  if (nMin <= 8) return "EARLY";
  if (nMin <= 16) return "TRANSITION";
  return "LATE";
}

// Etat "saison precedente" COMPLET pour une equipe - jamais tronque par
// un cutoff, la saison precedente est entierement terminee avant que la
// saison courante ne commence (aucune fuite possible par construction).
function previousSeasonState(previousSeasonFixtures, teamId) {
  return buildTeamState(previousSeasonFixtures, teamId, FAR_FUTURE_CUTOFF);
}

function isReturningTeam(previousSeasonFixtures, teamId) {
  return previousSeasonFixtures.some((f) => f.home_team_id === teamId || f.away_team_id === teamId);
}

// options = {
//   currentSeasonFixturesBySeasons: Map<season, fixtures[]> (fixtures de
//     CETTE saison uniquement, normalisees, TOUTES - le filtrage <cutoff
//     est fait en interne a chaque cutoff),
//   previousSeasonFixturesBySeasons: Map<season, fixtures[]> (fixtures
//     COMPLETES de la saison N-1, pour chaque saison N presente dans oosSeasons),
//   oosSeasons: [2023, 2024],
//   leagueId,
// }
function runWalkForwardM2(options) {
  const predictions = [];

  for (const season of options.oosSeasons) {
    const currentSeasonFixtures = options.currentSeasonFixturesBySeasons.get(season);
    const previousSeasonFixtures = options.previousSeasonFixturesBySeasons.get(season) || [];
    if (!currentSeasonFixtures || !currentSeasonFixtures.length) continue;

    const cutoffs = buildCutoffs(currentSeasonFixtures);
    for (const { cutoff, batch } of cutoffs) {
      const cutoffMs = new Date(cutoff).getTime();
      // "agregats saison courante uniquement avant cutoff" - jamais le
      // warm-up melange ici (different d'EXP-001).
      const trainCurrentSeason = currentSeasonFixtures.filter((f) => new Date(f.kickoff_timestamp).getTime() < cutoffMs);

      for (const f of batch) {
        if (f.goals_home_90 == null || f.goals_away_90 == null) continue;

        const homeCurrentState = buildTeamState(trainCurrentSeason, f.home_team_id, cutoff);
        const awayCurrentState = buildTeamState(trainCurrentSeason, f.away_team_id, cutoff);
        const nHome = homeCurrentState.playedTotal;
        const nAway = awayCurrentState.playedTotal;
        const nMin = Math.min(nHome, nAway);

        // --- M0 : agregats saison courante SEULS, jamais de prior ---
        const lambdasM0 = calcLambdas(
          homeCurrentState.goalsForHome, homeCurrentState.goalsAgainstHome, homeCurrentState.playedHome,
          awayCurrentState.goalsForAway, awayCurrentState.goalsAgainstAway, awayCurrentState.playedAway,
          LEAGUE_AVG_H, LEAGUE_AVG_A, options.leagueId
        );

        // --- M2 : MEME calcLambdas, bm/md remplaces par les valeurs melangees ---
        const homeReturning = isReturningTeam(previousSeasonFixtures, f.home_team_id);
        const awayReturning = isReturningTeam(previousSeasonFixtures, f.away_team_id);
        const homePrevState = homeReturning ? previousSeasonState(previousSeasonFixtures, f.home_team_id) : null;
        const awayPrevState = awayReturning ? previousSeasonState(previousSeasonFixtures, f.away_team_id) : null;

        // Source du prior (SPEC EXP-002 §2) : saison precedente reelle si
        // l'equipe y a joue (meme cote venue-specifique) ; sinon moyenne
        // de ligue - jamais de donnees Championship, jamais de fuzzy-match.
        const priorHFor = homeReturning && homePrevState.playedHome > 0 ? homePrevState.goalsForHome / homePrevState.playedHome : LEAGUE_AVG_H;
        const priorHAgainst = homeReturning && homePrevState.playedHome > 0 ? homePrevState.goalsAgainstHome / homePrevState.playedHome : LEAGUE_AVG_A;
        const priorAFor = awayReturning && awayPrevState.playedAway > 0 ? awayPrevState.goalsForAway / awayPrevState.playedAway : LEAGUE_AVG_A;
        const priorAAgainst = awayReturning && awayPrevState.playedAway > 0 ? awayPrevState.goalsAgainstAway / awayPrevState.playedAway : LEAGUE_AVG_H;

        const blendHFor = blendWithDecayingPrior({ events: homeCurrentState.goalsForHome, matches: homeCurrentState.playedHome }, priorHFor, nHome);
        const blendHAgainst = blendWithDecayingPrior({ events: homeCurrentState.goalsAgainstHome, matches: homeCurrentState.playedHome }, priorHAgainst, nHome);
        const blendAFor = blendWithDecayingPrior({ events: awayCurrentState.goalsForAway, matches: awayCurrentState.playedAway }, priorAFor, nAway);
        const blendAAgainst = blendWithDecayingPrior({ events: awayCurrentState.goalsAgainstAway, matches: awayCurrentState.playedAway }, priorAAgainst, nAway);

        const lambdasM2 = calcLambdas(
          blendHFor.blended_events, blendHAgainst.blended_events, blendHFor.blended_matches,
          blendAFor.blended_events, blendAAgainst.blended_events, blendAFor.blended_matches,
          LEAGUE_AVG_H, LEAGUE_AVG_A, options.leagueId
        );

        const m0 = predictWithRho(lambdasM0.lambdaH, lambdasM0.lambdaA, CHAMPION_RHO);
        const m2 = predictWithRho(lambdasM2.lambdaH, lambdasM2.lambdaA, CHAMPION_RHO);

        predictions.push({
          fixture_id: f.fixture_id,
          season: f.season,
          cutoff,
          home_team_id: f.home_team_id,
          away_team_id: f.away_team_id,
          n_home: nHome,
          n_away: nAway,
          n_min: nMin,
          bucket: classifyBucket(nMin),
          home_returning: homeReturning,
          away_returning: awayReturning,
          prior_weight_home: blendHFor.prior_weight,
          prior_weight_away: blendAFor.prior_weight,
          lambdaH_m0: lambdasM0.lambdaH, lambdaA_m0: lambdasM0.lambdaA,
          lambdaH_m2: lambdasM2.lambdaH, lambdaA_m2: lambdasM2.lambdaA,
          goals_home_90: f.goals_home_90,
          goals_away_90: f.goals_away_90,
          markets_m0: m0.markets,
          markets_m2: m2.markets,
        });
      }
    }
  }

  return { predictions };
}

module.exports = { runWalkForwardM2, classifyBucket, isReturningTeam, previousSeasonState, CHAMPION_RHO, LEAGUE_AVG_H, LEAGUE_AVG_A };
