"use strict";
// PLAYER SCORER V2 (2026-09-05), item 15. Attribution finale d'UN
// evenement de but e :
//   OPEN PLAY : pi_i,e = softmax_R(eta_i)
//   PENALTY   : pi_i,e = P_pen(i|R)
//   OWN GOAL  : pi_i,e = 0 pour tous les joueurs offensifs
// INVARIANT : Sum_i pi_i,e + P_own(e) = 1 pour CHAQUE but.

function softmax(etaValues) {
  const max = Math.max(...etaValues);
  const exps = etaValues.map((e) => Math.exp(e - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

// riskSetPlayerIds + etaValues (meme ordre) -> Map player_id -> pi_i,e.
function attributeOpenPlayGoal(riskSetPlayerIds, etaValues) {
  const probs = softmax(etaValues);
  return new Map(riskSetPlayerIds.map((id, i) => [id, probs[i]]));
}

function attributePenaltyGoal(penaltyDistribution) {
  return penaltyDistribution;
}

function attributeOwnGoal(riskSetPlayerIds) {
  return new Map(riskSetPlayerIds.map((id) => [id, 0]));
}

// Vérification explicite de l'invariant - retourne la masse totale
// (doit etre 1 : soit repartie sur les joueurs [open-play/penalty],
// soit entierement dans P_own [own-goal]).
function verifyMassConservation(playerShareMap, ownGoalProbability) {
  const playerSum = [...playerShareMap.values()].reduce((a, b) => a + b, 0);
  return { total: playerSum + ownGoalProbability, player_sum: playerSum, own_goal_probability: ownGoalProbability };
}

module.exports = { softmax, attributeOpenPlayGoal, attributePenaltyGoal, attributeOwnGoal, verifyMassConservation };
