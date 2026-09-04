"use strict";
// GATE C1 (SPEC LAB PRO v1.0 SS9) - runner walk-forward reutilise par
// EXP-001 et les experiences suivantes. Anti-leakage strict garanti
// structurellement : a chaque cutoff, seules les fixtures dont
// kickoff_timestamp < cutoff (strict) entrent dans la reconstruction
// point-in-time (lib/data/team-state.js#buildTeamState, deja garante) et
// dans le fitter rho. Aucune fixture du batch courant ou future ne peut
// atteindre le fitter - verifie explicitement par
// tests/lab-walkforward-anti-leakage.test.js (ajout d'un match futur
// aberrant, predictions anterieures inchangees).

const { buildTeamState, toCalcCriteresStats, toCalcLambdasArgs } = require("../data/team-state.js");
const { calcCriteres, calcLambdas } = require("../engine.js");
const { predictWithRho } = require("./dc-matrix-with-rho.js");

// Construit la liste chronologique des cutoffs a partir des fixtures OOS
// (une "journee/batch" = un ensemble de fixtures partageant la meme date
// calendaire de coup d'envoi - §9 du protocole : refit par journee/cutoff
// logique, jamais entre deux matchs d'un meme batch).
function buildCutoffs(fixtures) {
  const byDate = new Map();
  for (const f of fixtures) {
    const day = f.kickoff_timestamp.slice(0, 10); // date calendaire (YYYY-MM-DD)
    if (!byDate.has(day)) byDate.set(day, []);
    byDate.get(day).push(f);
  }
  const days = Array.from(byDate.keys()).sort();
  return days.map((day) => ({
    cutoff: day + "T00:00:00.000Z", // cutoff = debut de la journee : tout match de CE jour a kickoff >= cutoff, jamais < cutoff, donc jamais lui-meme dans son propre train
    batch: byDate.get(day),
  }));
}

// rhoFitter(trainMatches) -> { rho_hat, ... } - injectable pour permettre
// aux tests de ce runner de ne pas dependre de scripts/fit_rho.py
// (Python) a chaque assertion ; l'integration reelle EXP-001 branchera le
// vrai fitter Python via child_process.
function runWalkForward(options) {
  const { allFixtures, championRho, candidateRhoFitter, leagueAvgH, leagueAvgA, leagueId } = options;
  const trainSeasons = options.trainSeasons || [];
  const oosSeasons = options.oosSeasons || [];

  const trainPoolFixtures = allFixtures.filter((f) => trainSeasons.includes(f.season) || oosSeasons.includes(f.season));
  const oosFixtures = allFixtures.filter((f) => oosSeasons.includes(f.season));

  const cutoffs = buildCutoffs(oosFixtures);
  const predictions = [];
  const fitLog = [];

  for (const { cutoff, batch } of cutoffs) {
    // TRAIN strictement < cutoff, parmi TOUTES les fixtures disponibles
    // (warm-up + OOS anterieures), jamais le batch courant ni rien d'ulterieur.
    const trainFixtures = trainPoolFixtures.filter((f) => new Date(f.kickoff_timestamp).getTime() < new Date(cutoff).getTime());

    // Construit les lambdas TRAIN pour fitter rho (un couple par match TRAIN resolu)
    const trainLambdaScorePairs = [];
    for (const f of trainFixtures) {
      if (f.goals_home_90 == null || f.goals_away_90 == null) continue;
      const homeState = buildTeamState(trainFixtures, f.home_team_id, f.kickoff_timestamp);
      const awayState = buildTeamState(trainFixtures, f.away_team_id, f.kickoff_timestamp);
      const homeStats = toCalcCriteresStats(homeState);
      const awayStats = toCalcCriteresStats(awayState);
      if (!calcCriteres(homeStats, true, null) || !calcCriteres(awayStats, false, null)) continue; // <3 matchs -> pas assez pour fitter dessus
      const lambdas = calcLambdas(...toCalcLambdasArgs(homeState, awayState, leagueAvgH, leagueAvgA, leagueId));
      trainLambdaScorePairs.push({ lambdaH: lambdas.lambdaH, lambdaA: lambdas.lambdaA, h: f.goals_home_90, a: f.goals_away_90 });
    }

    const fitResult = candidateRhoFitter ? candidateRhoFitter(trainLambdaScorePairs) : { rho_hat: championRho, convergence: true };
    fitLog.push({ cutoff, n_train: trainLambdaScorePairs.length, ...fitResult });

    // Predit le batch (matchs de CE cutoff exactement) avec M0 (rho fixe)
    // et M1 (rho appris SUR LE TRAIN, jamais recalcule avec le batch).
    for (const f of batch) {
      if (f.goals_home_90 == null || f.goals_away_90 == null) continue; // pas encore joue/annule -> pas de prediction resoluble
      const homeState = buildTeamState(trainFixtures, f.home_team_id, cutoff);
      const awayState = buildTeamState(trainFixtures, f.away_team_id, cutoff);
      const homeStats = toCalcCriteresStats(homeState);
      const awayStats = toCalcCriteresStats(awayState);
      if (!calcCriteres(homeStats, true, null) || !calcCriteres(awayStats, false, null)) continue;
      const lambdas = calcLambdas(...toCalcLambdasArgs(homeState, awayState, leagueAvgH, leagueAvgA, leagueId));

      const m0 = predictWithRho(lambdas.lambdaH, lambdas.lambdaA, championRho);
      const m1 = predictWithRho(lambdas.lambdaH, lambdas.lambdaA, fitResult.rho_hat);

      predictions.push({
        fixture_id: f.fixture_id,
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

  return { predictions, fitLog, cutoffs: cutoffs.map((c) => c.cutoff) };
}

module.exports = { buildCutoffs, runWalkForward };
