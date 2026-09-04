"use strict";
// Convention OFFICIELLE et UNIQUE (SPEC LAB PRO v1.0) du signe du delta
// de perte candidat/champion. Tout le laboratoire (bootstrap, promotion,
// rapports) DOIT passer par cette fonction plutot que soustraire deux NLL
// a la main, pour qu'il soit structurellement impossible d'avoir deux
// conventions de signe qui divergent silencieusement entre modules.
//
// CONTRAT (ne jamais inverser) :
//   delta = loss_candidate - loss_champion
//     candidat MEILLEUR (loss plus basse que le champion) -> delta < 0
//     candidat IDENTIQUE                                   -> delta ~= 0
//     candidat PIRE (loss plus haute que le champion)       -> delta > 0
//
// Consequence directe pour la promotion (lib/promotion.js) : un candidat
// confirme statistiquement meilleur a un intervalle de confiance bootstrap
// entierement negatif (ci_upper < 0) ; un candidat confirme pire a un
// intervalle entierement positif (ci_lower > 0) ; un intervalle qui
// chevauche zero est inconclusif (SHADOW_MORE_DATA).
function lossDelta(lossCandidate, lossChampion) {
  return lossCandidate - lossChampion;
}

module.exports = { lossDelta };
