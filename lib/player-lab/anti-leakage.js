"use strict";
// PLAYER LAB - PILOT (2026-09-05), items 6 et 13. Reconstruit, pour un
// joueur donne, les features "avant cutoff" UNIQUEMENT a partir des
// player-match rows dont kickoff < cutoff - jamais un acces a la ligne
// du match cible lui-meme. C'est la fonction que le futur test de
// mutation (changer un match futur, verifier qu'aucune feature passee
// ne bouge) doit appeler.

function reconstructFeaturesBeforeCutoff(rowsForPlayer, cutoffKickoffIso, lastN) {
  lastN = lastN || 5;
  const cutoff = new Date(cutoffKickoffIso).getTime();
  const priorRows = rowsForPlayer
    .filter((r) => new Date(r.kickoff).getTime() < cutoff)
    .sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  const tail = (arr) => arr.slice(-lastN);
  return {
    n_prior_matches: priorRows.length,
    last_starts: tail(priorRows.map((r) => (r.lineup_role === "STARTER" ? 1 : 0))),
    last_minutes: tail(priorRows.map((r) => r.minutes)),
    last_shots: tail(priorRows.map((r) => r.shots)),
    last_shots_on_target: tail(priorRows.map((r) => r.shots_on_target)),
    last_goals: tail(priorRows.map((r) => r.goals)),
  };
}

// Historique CUMULE (pas seulement les derniers N) STRICTEMENT
// anterieur au cutoff - utilise par les posteriors bayesiens
// (core-rate-model.js, exposure-model.js) qui integrent TOUTE la
// preuve disponible via alpha_post=alpha_prior+total_observe, jamais
// une fenetre glissante.
function reconstructCumulativeHistoryBeforeCutoff(rowsForPlayer, cutoffKickoffIso) {
  const cutoff = new Date(cutoffKickoffIso).getTime();
  const priorRows = rowsForPlayer.filter((r) => new Date(r.kickoff).getTime() < cutoff);
  return priorRows; // l'appelant agrege (goals/minutes/role/shots) selon le modele concerne
}

module.exports = { reconstructFeaturesBeforeCutoff, reconstructCumulativeHistoryBeforeCutoff };
