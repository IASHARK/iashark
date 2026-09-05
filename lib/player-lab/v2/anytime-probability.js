"use strict";
// PLAYER SCORER V2 (2026-09-05), item 16. Probabilite Anytime EXACTE :
//   P0_i,s = Prod_e (1 - pi_i,e,s)   [e parcourt les buts SIMULES de
//            l'equipe dans le scenario s ou le joueur pouvait recevoir
//            une part - un own-goal credite a son equipe ne participe
//            jamais a ce produit, factor implicite = 1]
//   Pscore_i,s = 1 - P0_i,s
//   Pscore_i = E_s[Pscore_i,s]
//
// IDENTITE DE REDUCTION V1 (verifiee par test) : si pi_i,e,s = pi_i
// CONSTANT pour tous les buts e d'un scenario a n buts, alors
// Prod_e(1-pi_i) = (1-pi_i)^n, et E_s[...] sur p_T(n) redonne
// EXACTEMENT la formule V1 : 1 - Sum_n p_T(n)*(1-pi_i)^n.

function scoreProbabilityForScenario(perGoalShares) {
  let p0 = 1;
  for (const pi of perGoalShares) p0 *= (1 - pi);
  return 1 - p0;
}

module.exports = { scoreProbabilityForScenario };
