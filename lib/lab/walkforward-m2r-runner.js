"use strict";
// EXP-002R (correction du 2026-09-05 - EXP-002 marque INVALID_IMPLEMENTATION,
// voir scripts/experiments/exp002_protocol_addendum.json). Root cause de
// l'echec d'EXP-002 : lib/lab/walkforward-m2-runner.js recalculait un M0
// "agregats saison courante uniquement, aucun gate calcCriteres" -
// STRUCTURELLEMENT DIFFERENT du vrai champion M0 (lib/lab/walkforward-runner.js,
// agregats MULTI-SAISONS POOLES via lib/data/team-state.js). Ce fichier
// corrige la cause, pas le symptome :
//
//   baseState = EXACTEMENT le meme etat que M0 (buildTeamState sur le
//     MEME pool multi-saisons que lib/lab/walkforward-runner.js#runWalkForward,
//     memes cutoffs, meme buildCutoffs reutilise tel quel).
//   lambdasM0 = calcLambdas(baseState) - IDENTIQUE par construction a ce
//     que le vrai champion produit (verifie par
//     tests/lab-m2r-runner.test.js#TEST_B contre les predictions REELLEMENT
//     persistees dans scripts/experiments/exp001_report.json).
//   candidateState = baseState + AJUSTEMENT ADDITIF Bayes (UNIQUEMENT
//     quand prior_weight(n)>0, n = matchs de la SEULE saison courante) :
//       blended_events = baseState.events + priorRate*weight
//       blended_matches = baseState.matches + weight
//     A poids nul (n>=16 des deux cotes), blended_events===baseState.events
//     et blended_matches===baseState.matches EXACTEMENT -> lambdasM2 ===
//     lambdasM0 PAR CONSTRUCTION (memes arguments a calcLambdas), pas
//     seulement empiriquement.
//   lambdasM2 = calcLambdas(candidateState) - MEME fonction, MEMES autres
//     arguments (leagueAvgH/A, leagueId) que M0.
//
// Sanity check OBLIGATOIRE : si un cas a poids nul des deux cotes produit
// malgre tout lambdasM2 != lambdasM0 (>1e-12), la fonction LEVE UNE
// EXCEPTION IMMEDIATEMENT - aucun rapport ne doit jamais pouvoir sortir
// avec une violation de l'identite LATE non detectee.
//
// M0 reste GATE par calcCriteres (comme le vrai champion - m0_valid=false
// si <3 matchs). M2 n'est JAMAIS gate (c'est precisement son interet
// operationnel, M2_COVERAGE_GAIN) - son prior comble le vide la ou M0
// refuse de predire.

const { buildTeamState, toCalcCriteresStats, toCalcLambdasArgs } = require("../data/team-state.js");
const { calcCriteres, calcLambdas } = require("../engine.js");
const { predictWithRho } = require("./dc-matrix-with-rho.js");
const { priorWeight } = require("./bayes-early-season.js");
const { buildCutoffs } = require("./walkforward-runner.js");

const CHAMPION_RHO = -0.0845;

function classifyBucket(nMin) {
  if (nMin <= 8) return "EARLY";
  if (nMin <= 16) return "TRANSITION";
  return "LATE";
}

function isReturningTeam(previousSeasonFixtures, teamId) {
  return previousSeasonFixtures.some((f) => f.home_team_id === teamId || f.away_team_id === teamId);
}

// Prior "equipe promue" (item 6, audit 2026-09-05) : moyenne REELLE de
// TOUTE la ligue sur la saison precedente COMPLETE - jamais une constante
// devinee. avgAwayFor==avgHomeAgainst et avgAwayAgainst==avgHomeFor par
// construction mathematique (chaque match contribue exactement un but
// "domicile marque"=away-encaisse et un but "exterieur marque"=domicile-encaisse,
// donc la moyenne sur tous les matchs coincide des deux cotes).
function computeRealLeagueAverageRates(previousSeasonFixtures) {
  let sumHomeFor = 0, sumHomeAgainst = 0, n = 0;
  for (const f of previousSeasonFixtures) {
    if (f.goals_home_90 == null || f.goals_away_90 == null) continue;
    sumHomeFor += f.goals_home_90;
    sumHomeAgainst += f.goals_away_90;
    n++;
  }
  const maxTs = previousSeasonFixtures.length ? previousSeasonFixtures.map((f) => f.kickoff_timestamp).sort().slice(-1)[0] : null;
  return {
    avgHomeFor: n ? sumHomeFor / n : null,
    avgHomeAgainst: n ? sumHomeAgainst / n : null,
    avgAwayFor: n ? sumHomeAgainst / n : null,
    avgAwayAgainst: n ? sumHomeFor / n : null,
    n_fixtures: n,
    max_source_timestamp: maxTs,
  };
}

function previousSeasonState(previousSeasonFixtures, teamId) {
  return buildTeamState(previousSeasonFixtures, teamId, "9999-01-01T00:00:00.000Z");
}

// Mutation ADDITIVE unique - seule operation qui differencie M2 de M0.
// weight<=0 -> AUCUNE mutation, retourne exactement (events,matches)
// inchanges (identite garantie par construction, pas par coincidence).
function additiveBayesAdjustment(events, matches, priorRate, weight) {
  if (weight <= 0) return { events, matches, weight: 0, mutated: false };
  return { events: events + priorRate * weight, matches: matches + weight, weight, mutated: true };
}

// options = {
//   allFixtures, trainSeasons, oosSeasons, leagueId, leagueAvgH, leagueAvgA,
//   previousSeasonFixturesBySeasons: Map<season, fixtures[]> (saison N-1 COMPLETE pour chaque N de oosSeasons)
// }
function runWalkForwardM2R(options) {
  const { allFixtures, leagueId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons } = options;
  const trainSeasons = options.trainSeasons || [];
  const oosSeasons = options.oosSeasons || [];

  const trainPoolFixtures = allFixtures.filter((f) => trainSeasons.includes(f.season) || oosSeasons.includes(f.season));
  const oosFixtures = allFixtures.filter((f) => oosSeasons.includes(f.season));
  const cutoffs = buildCutoffs(oosFixtures);

  const predictions = [];
  const lateIdentityViolations = [];

  for (const { cutoff, batch } of cutoffs) {
    const cutoffMs = new Date(cutoff).getTime();
    const trainFixtures = trainPoolFixtures.filter((f) => new Date(f.kickoff_timestamp).getTime() < cutoffMs);

    for (const f of batch) {
      if (f.goals_home_90 == null || f.goals_away_90 == null) continue;

      // --- baseState : EXACTEMENT M0 (meme fonction, meme pool multi-saisons, meme cutoff que lib/lab/walkforward-runner.js) ---
      const homeBaseState = buildTeamState(trainFixtures, f.home_team_id, cutoff);
      const awayBaseState = buildTeamState(trainFixtures, f.away_team_id, cutoff);
      const homeStats = toCalcCriteresStats(homeBaseState);
      const awayStats = toCalcCriteresStats(awayBaseState);
      const m0Valid = !!calcCriteres(homeStats, true, null) && !!calcCriteres(awayStats, false, null);
      const lambdasM0 = calcLambdas(...toCalcLambdasArgs(homeBaseState, awayBaseState, leagueAvgH, leagueAvgA, leagueId));

      // --- n pour le poids Bayes : matchs de la SEULE saison courante (item 1, formule auditee) ---
      const currentSeasonTrain = trainFixtures.filter((x) => x.season === f.season);
      const nHomeState = buildTeamState(currentSeasonTrain, f.home_team_id, cutoff);
      const nAwayState = buildTeamState(currentSeasonTrain, f.away_team_id, cutoff);
      const nHome = nHomeState.playedTotal, nAway = nAwayState.playedTotal;
      const nMin = Math.min(nHome, nAway);
      const weightHome = priorWeight(nHome), weightAway = priorWeight(nAway);

      // --- prior (item 6 : moyenne de ligue REELLE, jamais une constante devinee) ---
      const previousSeasonFixtures = (previousSeasonFixturesBySeasons.get(f.season)) || [];
      const homeReturning = isReturningTeam(previousSeasonFixtures, f.home_team_id);
      const awayReturning = isReturningTeam(previousSeasonFixtures, f.away_team_id);
      const leagueRates = computeRealLeagueAverageRates(previousSeasonFixtures);

      let priorHFor, priorHAgainst, priorSourceHome;
      if (homeReturning) {
        const prevState = previousSeasonState(previousSeasonFixtures, f.home_team_id);
        const usable = prevState.playedHome > 0;
        priorHFor = usable ? prevState.goalsForHome / prevState.playedHome : leagueRates.avgHomeFor;
        priorHAgainst = usable ? prevState.goalsAgainstHome / prevState.playedHome : leagueRates.avgHomeAgainst;
        priorSourceHome = { type: usable ? "PREVIOUS_SEASON_TEAM_SPECIFIC" : "REAL_LEAGUE_AVERAGE_PREVIOUS_SEASON", source_season: f.season - 1, source_fixture_count: usable ? prevState.playedHome : leagueRates.n_fixtures, source_max_timestamp: usable ? previousSeasonFixtures.filter((x) => x.home_team_id === f.home_team_id).map((x) => x.kickoff_timestamp).sort().slice(-1)[0] : leagueRates.max_source_timestamp, value_for: priorHFor, value_against: priorHAgainst };
      } else {
        priorHFor = leagueRates.avgHomeFor;
        priorHAgainst = leagueRates.avgHomeAgainst;
        priorSourceHome = { type: "REAL_LEAGUE_AVERAGE_PREVIOUS_SEASON", source_season: f.season - 1, source_fixture_count: leagueRates.n_fixtures, source_max_timestamp: leagueRates.max_source_timestamp, value_for: priorHFor, value_against: priorHAgainst };
      }

      let priorAFor, priorAAgainst, priorSourceAway;
      if (awayReturning) {
        const prevState = previousSeasonState(previousSeasonFixtures, f.away_team_id);
        const usable = prevState.playedAway > 0;
        priorAFor = usable ? prevState.goalsForAway / prevState.playedAway : leagueRates.avgAwayFor;
        priorAAgainst = usable ? prevState.goalsAgainstAway / prevState.playedAway : leagueRates.avgAwayAgainst;
        priorSourceAway = { type: usable ? "PREVIOUS_SEASON_TEAM_SPECIFIC" : "REAL_LEAGUE_AVERAGE_PREVIOUS_SEASON", source_season: f.season - 1, source_fixture_count: usable ? prevState.playedAway : leagueRates.n_fixtures, source_max_timestamp: usable ? previousSeasonFixtures.filter((x) => x.away_team_id === f.away_team_id).map((x) => x.kickoff_timestamp).sort().slice(-1)[0] : leagueRates.max_source_timestamp, value_for: priorAFor, value_against: priorAAgainst };
      } else {
        priorAFor = leagueRates.avgAwayFor;
        priorAAgainst = leagueRates.avgAwayAgainst;
        priorSourceAway = { type: "REAL_LEAGUE_AVERAGE_PREVIOUS_SEASON", source_season: f.season - 1, source_fixture_count: leagueRates.n_fixtures, source_max_timestamp: leagueRates.max_source_timestamp, value_for: priorAFor, value_against: priorAAgainst };
      }

      // --- candidateState = baseState + ajustement additif (SEULE mutation) ---
      const blendHFor = additiveBayesAdjustment(homeBaseState.goalsForHome, homeBaseState.playedHome, priorHFor, weightHome);
      const blendHAgainst = additiveBayesAdjustment(homeBaseState.goalsAgainstHome, homeBaseState.playedHome, priorHAgainst, weightHome);
      const blendAFor = additiveBayesAdjustment(awayBaseState.goalsForAway, awayBaseState.playedAway, priorAFor, weightAway);
      const blendAAgainst = additiveBayesAdjustment(awayBaseState.goalsAgainstAway, awayBaseState.playedAway, priorAAgainst, weightAway);

      const lambdasM2 = calcLambdas(
        blendHFor.events, blendHAgainst.events, blendHFor.matches,
        blendAFor.events, blendAAgainst.events, blendAFor.matches,
        leagueAvgH, leagueAvgA, leagueId
      );

      // --- SANITY CHECK OBLIGATOIRE (item 10) : arret immediat si violation LATE ---
      if (weightHome === 0 && weightAway === 0) {
        const dH = Math.abs(lambdasM2.lambdaH - lambdasM0.lambdaH);
        const dA = Math.abs(lambdasM2.lambdaA - lambdasM0.lambdaA);
        if (dH > 1e-12 || dA > 1e-12) {
          lateIdentityViolations.push({ fixture_id: f.fixture_id, lambdasM0, lambdasM2, dH, dA });
        }
      }

      const m0 = predictWithRho(lambdasM0.lambdaH, lambdasM0.lambdaA, CHAMPION_RHO);
      const m2 = predictWithRho(lambdasM2.lambdaH, lambdasM2.lambdaA, CHAMPION_RHO);

      predictions.push({
        fixture_id: f.fixture_id,
        season: f.season,
        cutoff,
        home_team_id: f.home_team_id,
        away_team_id: f.away_team_id,
        n_home: nHome, n_away: nAway, n_min: nMin, bucket: classifyBucket(nMin),
        home_returning: homeReturning, away_returning: awayReturning,
        prior_weight_home: weightHome, prior_weight_away: weightAway,
        prior_source_home: priorSourceHome, prior_source_away: priorSourceAway,
        m0_valid: m0Valid,
        lambdaH_m0: lambdasM0.lambdaH, lambdaA_m0: lambdasM0.lambdaA,
        lambdaH_m2: lambdasM2.lambdaH, lambdaA_m2: lambdasM2.lambdaA,
        goals_home_90: f.goals_home_90, goals_away_90: f.goals_away_90,
        markets_m0: m0.markets, markets_m2: m2.markets,
      });
    }
  }

  if (lateIdentityViolations.length > 0) {
    const err = new Error(`LATE_IDENTITY_VIOLATIONS=${lateIdentityViolations.length} - arret obligatoire, aucun rapport genere. Premiere violation: ${JSON.stringify(lateIdentityViolations[0])}`);
    err.code = "LATE_IDENTITY_VIOLATED";
    err.violations = lateIdentityViolations;
    throw err;
  }

  return { predictions };
}

module.exports = { runWalkForwardM2R, classifyBucket, isReturningTeam, computeRealLeagueAverageRates, previousSeasonState, additiveBayesAdjustment, CHAMPION_RHO };
