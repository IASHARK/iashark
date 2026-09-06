"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06). Portes d'eligibilite ligue, lues
// UNIQUEMENT depuis le registry League Expansion Factory
// (data/league-validation-registry.json via lib/league-factory/registry.js).
// Ce module ne calcule aucune probabilite : il decide seulement QUELLES
// ligues/candidats ont le droit d'entrer dans les sorties produit
// (TOP_5_SCORERS_OF_DAY, DAILY_COMBOS, SAFE_PICK_OF_THE_DAY). Zero
// formule Score/Player ici.

function isLeaguePlayerEligible(registryEntry) {
  return !!registryEntry && registryEntry.player_status === "VALIDATED" && registryEntry.player_runnable === true;
}

function isLeagueScoreEligible(registryEntry) {
  return !!registryEntry && registryEntry.score_status === "VALIDATED" && registryEntry.score_runnable === true;
}

// candidate.source : "PLAYER" (marche anytime scorer, champion Player
// de la ligue) ou "SCORE" (marche derive de la matrice Dixon-Coles du
// champion Score de la ligue - lib/market-lab/market-catalogue.js).
function isCandidateEligible(candidate, registry) {
  const entry = registry && registry.leagues ? registry.leagues[candidate.league_key] : null;
  if (candidate.source === "PLAYER") return isLeaguePlayerEligible(entry);
  if (candidate.source === "SCORE") return isLeagueScoreEligible(entry);
  return false;
}

function filterEligibleCandidates(candidates, registry) {
  return (candidates || []).filter((c) => isCandidateEligible(c, registry));
}

module.exports = { isLeaguePlayerEligible, isLeagueScoreEligible, isCandidateEligible, filterEligibleCandidates };
