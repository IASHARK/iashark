"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06), item 5. Le Market Lab est actuellement
// MARKET_VALIDATION_PENDING / SHADOW_COLLECTING (Phase 2.5, voir
// data/market-lab/**). Tant que les gates edge/value ne sont pas fermes,
// tout combo genere par ce moteur DOIT porter
// BETTING_VALIDATION_STATUS=UNVALIDATED_SHADOW - jamais declare valide/
// profitable. Point de bascule UNIQUE : quand le Market Lab cloture
// (registry Market Lab, hors perimetre de ce fichier), cette fonction
// changera de valeur SANS toucher au Score Engine ni au Player Engine.

const CURRENT_MARKET_LAB_PHASE = "MARKET_VALIDATION_PENDING"; // SHADOW_COLLECTING

function getBettingValidationStatus() {
  return CURRENT_MARKET_LAB_PHASE === "VALIDATED" ? "VALIDATED_LIVE" : "UNVALIDATED_SHADOW";
}

module.exports = { getBettingValidationStatus, CURRENT_MARKET_LAB_PHASE };
