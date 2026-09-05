"use strict";
// PLAYER SCORER V2 (2026-09-05), item 9. u_i : effet joueur shrinke,
// calcule APRES le fit des effets fixes (relative-risk-model.js) via
// empirical Bayes/MAP (explicitement autorise par la spec plutot qu'un
// plein MCMC hierarchique, hors scope raisonnable ici). Un joueur avec
// peu d'exposition reste pres de 0 (aucun effet extreme sur petit
// echantillon) ; un joueur inconnu recoit u_i=0 (= le prior de
// position seul, via alpha_position + betas).

const U_PRIOR_STRENGTH_EXPOSURE_MATCHES90 = 15;

// residualsByPlayer : Map player_id -> { observedGoals, expectedGoals,
// exposureMinutes90 }. observedGoals = nombre de buts open-play
// REELLEMENT marques (TRAIN). expectedGoals = somme des probabilites
// softmax (sous le modele a EFFETS FIXES SEULEMENT, u_i=0) que ce
// joueur aurait marque, sur tous les buts ou il etait dans R_e - la
// difference observe/attendu est le signal residuel que u_i capture.
function fitPlayerEffects(residualsByPlayer) {
  const effects = new Map();
  for (const [playerId, r] of residualsByPlayer) {
    const k = U_PRIOR_STRENGTH_EXPOSURE_MATCHES90;
    const shrinkage = r.exposureMinutes90 / (r.exposureMinutes90 + k);
    const rawLogRatio = Math.log((r.observedGoals + 0.5) / (r.expectedGoals + 0.5));
    effects.set(playerId, { u_i: rawLogRatio * shrinkage, exposure_minutes90: r.exposureMinutes90, shrinkage });
  }
  return effects;
}

// Joueur absent de effects (jamais vu en TRAIN) -> u_i=0 explicitement,
// jamais une erreur ni une valeur fabriquee.
function playerEffect(effects, playerId) {
  return effects.has(playerId) ? effects.get(playerId).u_i : 0;
}

module.exports = { fitPlayerEffects, playerEffect, U_PRIOR_STRENGTH_EXPOSURE_MATCHES90 };
