"use strict";
// MARKET LAB - PHASE 2.5/3A (2026-09-05). Infrastructure PREPAREE pour
// la future Phase 3 (calibration + information incrementale
// model-vs-market) - AUCUN seuil decisionnel, AUCUN fit, AUCUNE
// conclusion scientifique ici. Ce module ne fait que DECRIRE/REGROUPER
// des lignes deja construites - jamais evaluer si le modele "bat" le
// marche, jamais choisir une formulation apres avoir regarde un ROI.
//
// Statut explicite tant que le dataset forward reste trop jeune (item
// 13 Phase 3A) :
const PHASE3_STATUS = "SHADOW_COLLECTING";
// Alias historique (Phase 2.5) - meme valeur, jamais une deuxieme
// source de verite.
const MODEL_VS_MARKET_VALIDATION = PHASE3_STATUS;

// item 12 Phase 3A : seuils minimums PRE-ENREGISTRES avant toute
// conclusion principale - des minimums de lancement analytique, PAS une
// garantie de puissance statistique. Les observations d'un meme fixture
// sont correlees : tout futur bootstrap/test doit clusteriser au
// minimum par fixture (ou par bloc temporel), jamais traiter chaque
// ligne comme independante.
const READINESS_GATE = {
  MIN_SETTLED_FIXTURES: 300,
  MIN_COMPLETE_MARKET_OBSERVATIONS: 500,
  MIN_CALENDAR_PERIODS: 2,
  CLUSTERING_UNIT: "fixture_id",
};

// input = { nSettledFixtures, nCompleteMarketObservations, nCalendarPeriods }
// - une famille de marche a la fois (1X2, BTTS, FT_TOTAL_2.5, ...).
function checkReadinessGate(input) {
  const reasons = [];
  if (input.nSettledFixtures < READINESS_GATE.MIN_SETTLED_FIXTURES) reasons.push("INSUFFICIENT_SETTLED_FIXTURES");
  if (input.nCompleteMarketObservations < READINESS_GATE.MIN_COMPLETE_MARKET_OBSERVATIONS) reasons.push("INSUFFICIENT_MARKET_OBSERVATIONS");
  if (input.nCalendarPeriods < READINESS_GATE.MIN_CALENDAR_PERIODS) reasons.push("INSUFFICIENT_CALENDAR_COVERAGE");
  return { ready: reasons.length === 0, reasons, thresholds: READINESS_GATE };
}

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

// item 11 Phase 3A : logit(p) = ln(p/(1-p)) - forme mathematiquement
// standard pour "outcome ~ logit(market_probability) + model_signal".
function logit(p) {
  const clamped = Math.min(Math.max(p, 1e-12), 1 - 1e-12);
  return Math.log(clamped / (1 - clamped));
}

// Prepare (met en forme, ne calibre RIEN) le futur dataset
// model-vs-market : conserve DEUX formulations pre-enregistrees du
// signal modele (jamais choisies apres avoir regarde un ROI) -
// x_probability_gap (linéaire, deja utilise par buildModelMarketGap) et
// x_logit_model_signal = logit(model)-logit(market) (l'echelle
// naturelle d'une regression logistique outcome~logit(market)+signal,
// item 11). y=outcome binaire (1=WIN, 0=LOSE, PUSH exclu). AUCUN fit
// ici - seulement le format attendu par un futur estimateur.
function buildLogisticModelVsMarketRow({ fixtureId, marketId, modelProbability, consensusMarketProbability, outcome }) {
  if (outcome === "PUSH") return null;
  if (outcome !== "WIN" && outcome !== "LOSE") return null;
  return {
    fixture_id: fixtureId,
    market_id: marketId,
    x_model_probability: modelProbability,
    x_consensus_market_probability: consensusMarketProbability,
    x_probability_gap: modelProbability - consensusMarketProbability,
    x_logit_market_probability: logit(consensusMarketProbability),
    x_logit_model_signal: logit(modelProbability) - logit(consensusMarketProbability),
    y_outcome: outcome === "WIN" ? 1 : 0,
  };
}

// Seuil minimal d'observations par case avant de considerer un chiffre
// interpretable (item 10 : petit N -> INSUFFICIENT_SAMPLE, jamais
// d'interpretation marketing dessus).
const MIN_BUCKET_N = 30;

// Regroupement descriptif en buckets de probabilite (0-10%, 10-20%,
// ..., 90-100%) - PAS une table de calibration ajustee, juste le
// comptage brut necessaire pour en construire une plus tard. `field`
// selectionne quelle probabilite bucketer : "x_model_probability" (modele)
// ou "x_consensus_market_probability" (marche) - item 10 : les deux
// doivent etre rapportes separement.
function buildCalibrationBuckets(logisticRows, field, nBuckets) {
  field = field || "x_model_probability";
  nBuckets = nBuckets || 10;
  const buckets = Array.from({ length: nBuckets }, () => ({ n: 0, sumProbability: 0, sumOutcome: 0 }));
  for (const row of logisticRows) {
    const p = row[field];
    const idx = Math.min(nBuckets - 1, Math.max(0, Math.floor(p * nBuckets)));
    buckets[idx].n++;
    buckets[idx].sumProbability += p;
    buckets[idx].sumOutcome += row.y_outcome;
  }
  return buckets.map((b, i) => ({
    bucket_index: i,
    bucket_range: [i / nBuckets, (i + 1) / nBuckets],
    n: b.n,
    mean_predicted_probability: b.n > 0 ? b.sumProbability / b.n : null,
    observed_frequency: b.n > 0 ? b.sumOutcome / b.n : null,
    sample_status: b.n < MIN_BUCKET_N ? "INSUFFICIENT_SAMPLE" : "OK",
  }));
}

module.exports = {
  PHASE3_STATUS,
  MODEL_VS_MARKET_VALIDATION,
  READINESS_GATE,
  checkReadinessGate,
  MIN_BUCKET_N,
  logit,
  canonicalMarketFamily,
  groupByMarketFamily,
  buildLogisticModelVsMarketRow,
  buildCalibrationBuckets,
};
