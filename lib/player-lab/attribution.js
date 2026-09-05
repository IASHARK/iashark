"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 11. Attribution d'un but
// de l'equipe entre les joueurs + own_goal_share. INVARIANT ABSOLU :
// sum(player_goal_shares) + own_goal_share = 1 EXACTEMENT, a chaque
// scenario - teste explicitement (tests/player-lab-scorer-engine.test.js).

// rawScores = [{player_id, score}] (score >= 0, deja combine
// core-rate x shots-adjustment x presence-au-but, voir simulation.js).
// ownGoalMass = masse deja estimee par own-goal-component.js - jamais
// 0 par defaut, jamais attribuee a un joueur.
function normalizeAttributionShares(rawScores, ownGoalMass) {
  const playerMassTotal = 1 - ownGoalMass;
  const totalRaw = rawScores.reduce((s, r) => s + r.score, 0);

  let shares;
  if (totalRaw <= 0) {
    // Aucun signal offensif (cas degenere, p.ex. equipe sans joueur
    // avec historique) : masse joueur repartie uniformement plutot que
    // perdue - jamais une masse qui disparait silencieusement.
    const equalShare = rawScores.length ? playerMassTotal / rawScores.length : 0;
    shares = rawScores.map((r) => ({ player_id: r.player_id, share: equalShare }));
  } else {
    shares = rawScores.map((r) => ({ player_id: r.player_id, share: (r.score / totalRaw) * playerMassTotal }));
  }

  const total = shares.reduce((s, r) => s + r.share, 0) + ownGoalMass;
  return { shares, own_goal_share: ownGoalMass, total };
}

module.exports = { normalizeAttributionShares };
