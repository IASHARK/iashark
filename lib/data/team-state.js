"use strict";
// GATE B5 (SPEC LAB PRO v1.0) - reconstruction point-in-time des
// statistiques equipe depuis les fixtures locales seules (audit prealable :
// tous les champs consommes par calcCriteres/calcLambdas sont
// reconstructibles depuis les fixtures brutes, voir SPEC LAB PRO v1.0
// SS10). Anti-leakage strict : kickoff_timestamp < cutoffTimestamp,
// JAMAIS <= (deux matchs au meme cutoff/batch ne doivent jamais
// s'informer l'un l'autre - meme regle que lib/team-strength.js#computeDynamicTeamStrength).
//
// Utilise UNIQUEMENT goals_*_90 (score reglementaire), jamais
// goals_*_final (qui inclurait une prolongation eventuelle) - coherent
// avec le correctif AET/PEN de lib/data/fixtures-normalizer.js.

function isFinishedWithScore(f) {
  return f.status === "FINISHED" && f.goals_home_90 != null && f.goals_away_90 != null;
}

// Construit l'etat complet d'une equipe a un instant donne, a partir de
// la seule liste de fixtures locales (deja normalisees, B3). Ne fabrique
// jamais une valeur : un total de 0 matchs produit un etat avec
// playedTotal=0 explicite, jamais une estimation de repli ici (le repli
// vers une moyenne de ligue reste la responsabilite de l'appelant, comme
// dans calcLambdas aujourd'hui).
function buildTeamState(fixtures, teamId, cutoffTimestamp) {
  const cutoffMs = new Date(cutoffTimestamp).getTime();
  const relevant = (fixtures || [])
    .filter((f) => (f.home_team_id === teamId || f.away_team_id === teamId) && isFinishedWithScore(f))
    .filter((f) => new Date(f.kickoff_timestamp).getTime() < cutoffMs) // strict < , jamais <=
    .sort((a, b) => new Date(a.kickoff_timestamp).getTime() - new Date(b.kickoff_timestamp).getTime()); // chronologique croissant

  let playedTotal = 0, playedHome = 0, playedAway = 0;
  let winsHome = 0, winsAway = 0;
  let goalsForTotal = 0, goalsAgainstTotal = 0;
  let goalsForHome = 0, goalsAgainstHome = 0, goalsForAway = 0, goalsAgainstAway = 0;
  const resultsChronological = []; // 'W' | 'D' | 'L', ordre chronologique croissant (plus ancien en premier)

  for (const f of relevant) {
    const isHome = f.home_team_id === teamId;
    const gf = isHome ? f.goals_home_90 : f.goals_away_90;
    const ga = isHome ? f.goals_away_90 : f.goals_home_90;

    playedTotal++;
    goalsForTotal += gf;
    goalsAgainstTotal += ga;

    if (isHome) {
      playedHome++;
      goalsForHome += gf;
      goalsAgainstHome += ga;
      if (gf > ga) winsHome++;
    } else {
      playedAway++;
      goalsForAway += gf;
      goalsAgainstAway += ga;
      if (gf > ga) winsAway++;
    }

    resultsChronological.push(gf > ga ? "W" : gf === ga ? "D" : "L");
  }

  // Convention API-Football : stats.form a le match le PLUS RECENT en
  // DERNIER caractere (calcCriteres fait form.slice(-5).split('').reverse(),
  // donc le reverse()[0] doit etre le plus recent). resultsChronological
  // est deja croissant (plus ancien -> plus recent), donc sa forme brute
  // EST deja dans la bonne convention sans transformation supplementaire.
  const form = resultsChronological.slice(-5).join("");

  return {
    teamId,
    cutoffTimestamp,
    playedTotal, playedHome, playedAway,
    winsHome, winsAway,
    goalsForTotal, goalsAgainstTotal,
    goalsForHome, goalsAgainstHome, goalsForAway, goalsAgainstAway,
    form,
    nFixturesUsed: relevant.length,
  };
}

// Adapte buildTeamState() vers exactement la forme `stats` consommee par
// lib/engine.js#calcCriteres (source-of-verite : la fonction elle-meme,
// voir lib/engine.js).
function toCalcCriteresStats(state) {
  return {
    fixtures: {
      played: { total: state.playedTotal, home: state.playedHome, away: state.playedAway },
      wins: { home: state.winsHome, away: state.winsAway },
    },
    goals: {
      for: { total: { total: state.goalsForTotal } },
      against: { total: { total: state.goalsAgainstTotal } },
    },
    form: state.form,
  };
}

// Adapte buildTeamState() (equipe domicile + equipe exterieur) vers
// exactement les arguments positionnels consommes par
// lib/engine.js#calcLambdas (bmHdom, beHdom, mdHdom, bmAext, beAext, meAext).
function toCalcLambdasArgs(homeState, awayState, leagueAvgH, leagueAvgA, leagueId) {
  return [
    homeState.goalsForHome, homeState.goalsAgainstHome, homeState.playedHome,
    awayState.goalsForAway, awayState.goalsAgainstAway, awayState.playedAway,
    leagueAvgH, leagueAvgA, leagueId,
  ];
}

module.exports = { buildTeamState, toCalcCriteresStats, toCalcLambdasArgs, isFinishedWithScore };
