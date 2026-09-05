"use strict";
// PLAYER SCORER V2 (2026-09-05), item 20. Contrat de split EXPLICITE,
// sans ambiguite. Reutilise lib/player-lab/season-split.js (V1,
// inchange) comme seule source de verite sur QUELLE saison va dans
// QUEL panier - ce module documente uniquement CE QUE CHAQUE PANIER A
// LE DROIT DE FAIRE.
//
//   2021-22 WARMUP_HISTORY : alimente l'historique point-in-time
//     disponible aux joueurs AU DEBUT de TRAIN (un joueur actif depuis
//     2021 n'a pas une carriere qui commence par magie en aout 2022).
//     JAMAIS utilise pour choisir un hyperparametre final.
//   2022-23 TRAIN : seule saison qui alimente hyperpriors de position,
//     beta (relative-risk-model.js), sigma (player-effects.js),
//     goal-clock, parametres penalty/own-goal, parametres de
//     substitution.
//   2023-24 OOS_DEV : reserve, aucune metrique de performance calculee
//     dans cette livraison.
//   2024-25 OOS_FINAL : reserve, idem.
//   2025-26 SEALED_UNREAD : jamais collectee, jamais dans aucun
//     manifest ni aucun calcul.

const { SEASON_SPLIT, splitFor } = require("../season-split.js");

const SPLIT_CONTRACT = Object.freeze({
  WARMUP: "Alimente l'historique point-in-time des joueurs au debut de TRAIN - jamais utilise pour choisir un hyperparametre.",
  TRAIN: "Seule saison utilisee pour fitter hyperpriors de position, beta, sigma, goal-clock, penalty/own-goal, substitution.",
  OOS_DEV: "Reservee - aucune metrique de performance calculee ici.",
  OOS_FINAL: "Reservee - aucune metrique de performance calculee ici.",
  SEALED_UNREAD: "Jamais collectee, jamais dans un manifest, jamais dans un calcul.",
});

function contractFor(season) {
  const split = splitFor(season);
  return split ? { split, contract: SPLIT_CONTRACT[split] } : null;
}

module.exports = { SEASON_SPLIT, splitFor, SPLIT_CONTRACT, contractFor };
