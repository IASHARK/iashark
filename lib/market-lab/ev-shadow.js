"use strict";
// MARKET LAB - PHASE 3A (2026-09-05), item 14. EV mathematique
// SIMPLE, marque UNVALIDATED_SHADOW - enregistre ce que le moteur
// AURAIT vu en temps reel, jamais utilise pour optimiser quoi que ce
// soit (aucun minEV/minGap/minOdds/tri par famille ou bookmaker ici,
// aucun seuil, aucune selection).
const EV_STATUS = "UNVALIDATED_SHADOW";

function computeShadowEv({ modelProbability, decimalOdds }) {
  return {
    ev: modelProbability * decimalOdds - 1,
    ev_status: EV_STATUS,
  };
}

module.exports = { computeShadowEv, EV_STATUS };
