"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06). Statut "marche supporte / non HOLD"
// pour les jambes de combo. Reutilise le statut Asian HOLD DEJA declare
// dans lib/market-lab/market-catalogue.js (MARKET_ASIAN_STATUS) - jamais
// reimplemente ici. Le catalogue exact des marches AUTORISES en jambe de
// combo est volontairement restreint (V1 du RUN OUTPUT ENGINE) : marches
// deja MODELLED (score) ou deja valides (player anytime-scorer), jamais
// un marche diagnostic-only (Exact Score) ni Asian (HOLD).

const { MARKET_ASIAN_STATUS } = require("../market-lab/market-catalogue.js");

const PLAYER_MARKETS_ALLOWED_IN_COMBO = new Set(["ANYTIME_GOALSCORER"]);

const SCORE_MARKET_PREFIXES_ALLOWED_IN_COMBO = [
  "FT_1X2_", "FT_DC_", "FT_DNB_", "FT_BTTS_", "FT_TOTAL_", "FT_TEAM_TOTAL_",
];

function isAsianMarket(marketId) {
  return typeof marketId === "string" && marketId.startsWith("ASIAN_");
}

function isDiagnosticOnlyMarket(marketId) {
  return typeof marketId === "string" && marketId.startsWith("FT_EXACT_SCORE_");
}

// candidate : { source: "PLAYER"|"SCORE", market: <id> }
function isMarketSupportedForCombo(candidate) {
  if (!candidate || !candidate.market) return false;
  if (isAsianMarket(candidate.market)) return false; // HOLD - jamais utilisable tant que non valide
  if (isDiagnosticOnlyMarket(candidate.market)) return false;
  if (candidate.source === "PLAYER") return PLAYER_MARKETS_ALLOWED_IN_COMBO.has(candidate.market);
  if (candidate.source === "SCORE") return SCORE_MARKET_PREFIXES_ALLOWED_IN_COMBO.some((p) => candidate.market.startsWith(p));
  return false;
}

module.exports = { isMarketSupportedForCombo, isAsianMarket, isDiagnosticOnlyMarket, MARKET_ASIAN_STATUS, PLAYER_MARKETS_ALLOWED_IN_COMBO, SCORE_MARKET_PREFIXES_ALLOWED_IN_COMBO };
