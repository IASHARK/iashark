"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 2. Split scientifique
// FIGE AVANT toute collecte des 3 saisons restantes - jamais modifie
// apres avoir vu un resultat (meme discipline que le Score Engine lab :
// EXP-002C/EXP-004/EXP-005 ont tous pre-enregistre leurs seuils avant
// calcul).
const SEASON_SPLIT = Object.freeze({
  2021: "WARMUP",
  2022: "TRAIN",
  2023: "OOS_DEV",
  2024: "OOS_FINAL",
  2025: "SEALED_UNREAD",
});

function splitFor(season) {
  return SEASON_SPLIT[season] || null;
}

module.exports = { SEASON_SPLIT, splitFor };
