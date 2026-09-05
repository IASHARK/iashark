"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 12. Formule OFFICIELLE
// Anytime Scorer - CLOSED FORM, jamais approximee autrement :
//   P_score_i_s = 1 - Sum_n p_T(n) * (1 - pi_i,s)^n
// p_T(n) est FIXE (marginale de la matrice M2, team-goal-distribution.js,
// deterministe). pi_i,s varie par tirage de simulation (incertitude
// posterieure du modele bayesien joueur, simulation.js).

function scoreProbabilityGivenShare(teamGoalDist, piShare) {
  let sum = 0;
  for (let n = 0; n < teamGoalDist.length; n++) {
    sum += teamGoalDist[n] * Math.pow(1 - piShare, n);
  }
  return 1 - sum;
}

module.exports = { scoreProbabilityGivenShare };
