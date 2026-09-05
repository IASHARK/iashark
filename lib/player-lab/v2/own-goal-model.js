"use strict";
// PLAYER SCORER V2 (2026-09-05), item 14. omega_own : cause DISTINCTE
// de but, jamais attribuee a un joueur offensif. Taux ligue (TRAIN) -
// meme discipline que V1 (lib/player-lab/own-goal-component.js, non
// modifie), reimplemente ici car V2 separe explicitement le CSC des
// autres causes DES LE TIRAGE de simulation (item 11 etape 5), pas
// seulement au moment de l'attribution finale.
function fitOwnGoalRate(allGoalEventsTrain) {
  const total = allGoalEventsTrain.length;
  const own = allGoalEventsTrain.filter((g) => g.own_goal_flag).length;
  return { omega_own: total > 0 ? own / total : 0, n_total: total, n_own: own };
}

module.exports = { fitOwnGoalRate };
