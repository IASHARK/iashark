"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 9. Composante penalty
// SEPAREE - pas de bonus arbitraire. Apprend : frequence penalty
// ligue (part des buts issus d'un penalty), hierarchie des tireurs par
// equipe (classement par tentatives historiques, marquees OU
// manquees - un tireur designe reste designe meme apres un echec). La
// presence du tireur sur le terrain au moment ou son equipe obtient un
// penalty est geree par l'exposure model, pas ici. La masse penalty
// reste INCLUSE dans la masse totale M2 (jamais ajoutee en plus).

function fitPenaltyRate(goalEvents) {
  const totalGoals = goalEvents.length;
  const penaltyGoals = goalEvents.filter((g) => g.penalty_flag).length;
  return { penalty_mass_share: totalGoals > 0 ? penaltyGoals / totalGoals : 0, n_total_goals: totalGoals, n_penalty_goals: penaltyGoals };
}

// TRAIN uniquement. Un "tireur designe" = joueur ayant deja tente un
// penalty (marque ou manque) pour cette equipe - classe par tentatives
// decroissantes.
function buildPenaltyTakerHierarchy(goalEvents, missedPenalties, teamId) {
  const attempts = new Map();
  for (const g of goalEvents) {
    if (g.penalty_flag && g.team_id === teamId && g.player_id != null) attempts.set(g.player_id, (attempts.get(g.player_id) || 0) + 1);
  }
  for (const m of missedPenalties) {
    if (m.team_id === teamId && m.player_id != null) attempts.set(m.player_id, (attempts.get(m.player_id) || 0) + 1);
  }
  return [...attempts.entries()].map(([player_id, n_attempts]) => ({ player_id, n_attempts })).sort((a, b) => b.n_attempts - a.n_attempts);
}

module.exports = { fitPenaltyRate, buildPenaltyTakerHierarchy };
