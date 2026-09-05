"use strict";
// MARKET LAB - PHASE 2.5 (2026-09-05), item 13. Infrastructure PREPAREE
// pour la future Phase 3 (calibration + information incrementale
// model-vs-market) - AUCUN seuil decisionnel, AUCUN fit, AUCUNE
// conclusion scientifique ici. Sur les 34 fixtures forward actuelles,
// ce module ne fait que DECRIRE/REGROUPER des lignes deja construites -
// jamais evaluer si le modele "bat" le marche.
//
// Statut explicite tant que le dataset forward reste trop jeune :
const MODEL_VS_MARKET_VALIDATION = "COLLECTING_FORWARD_DATA";

// Regroupe un canonical_market_id par FAMILLE (1X2, DC, DNB, BTTS,
// TOTAL_<line>, TEAM_TOTAL_<side>_<line>, EXACT_SCORE) - pure fonction
// de nommage, aucune donnee necessaire.
function canonicalMarketFamily(marketId) {
  if (marketId.startsWith("FT_1X2_")) return "FT_1X2";
  if (marketId.startsWith("FT_DC_")) return "FT_DC";
  if (marketId.startsWith("FT_DNB_")) return "FT_DNB";
  if (marketId.startsWith("FT_BTTS_")) return "FT_BTTS";
  if (marketId.startsWith("FT_EXACT_SCORE_")) return "FT_EXACT_SCORE";
  const totalMatch = /^(FT_TOTAL_\d+(?:\.\d+)?)_(OVER|UNDER)$/.exec(marketId);
  if (totalMatch) return totalMatch[1];
  const teamTotalMatch = /^(FT_TEAM_TOTAL_(?:HOME|AWAY)_\d+(?:\.\d+)?)_(OVER|UNDER)$/.exec(marketId);
  if (teamTotalMatch) return teamTotalMatch[1];
  return marketId;
}

// Regroupe des lignes { canonical_market_id, ... } par famille - simple
// agregation descriptive, jamais un calcul de performance.
function groupByMarketFamily(rows) {
  const groups = new Map();
  for (const row of rows) {
    const family = canonicalMarketFamily(row.canonical_market_id);
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push(row);
  }
  return groups;
}

// Prepare (met en forme, ne calibre RIEN) le futur dataset logistique
// model-vs-market : x=[model_probability, consensus_market_probability],
// y=outcome binaire (1=WIN, 0=LOSE, PUSH exclu). AUCUN fit ici -
// seulement le format attendu par un futur estimateur de calibration.
function buildLogisticModelVsMarketRow({ fixtureId, marketId, modelProbability, consensusMarketProbability, outcome }) {
  if (outcome === "PUSH") return null;
  if (outcome !== "WIN" && outcome !== "LOSE") return null;
  return {
    fixture_id: fixtureId,
    market_id: marketId,
    x_model_probability: modelProbability,
    x_consensus_market_probability: consensusMarketProbability,
    x_probability_gap: modelProbability - consensusMarketProbability,
    y_outcome: outcome === "WIN" ? 1 : 0,
  };
}

// Regroupement descriptif en buckets de probabilite modele (deciles par
// defaut) - PAS une table de calibration ajustee, juste le comptage brut
// necessaire pour en construire une plus tard, une fois assez de
// fixtures forward terminees.
function buildCalibrationBuckets(logisticRows, nBuckets) {
  nBuckets = nBuckets || 10;
  const buckets = Array.from({ length: nBuckets }, () => ({ n: 0, sum_model_probability: 0, sum_outcome: 0 }));
  for (const row of logisticRows) {
    const idx = Math.min(nBuckets - 1, Math.max(0, Math.floor(row.x_model_probability * nBuckets)));
    buckets[idx].n++;
    buckets[idx].sum_model_probability += row.x_model_probability;
    buckets[idx].sum_outcome += row.y_outcome;
  }
  return buckets.map((b, i) => ({
    bucket_index: i,
    bucket_range: [i / nBuckets, (i + 1) / nBuckets],
    n: b.n,
    mean_model_probability: b.n > 0 ? b.sum_model_probability / b.n : null,
    empirical_win_rate: b.n > 0 ? b.sum_outcome / b.n : null,
  }));
}

module.exports = {
  MODEL_VS_MARKET_VALIDATION,
  canonicalMarketFamily,
  groupByMarketFamily,
  buildLogisticModelVsMarketRow,
  buildCalibrationBuckets,
};
