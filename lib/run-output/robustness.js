"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06). Scores de robustesse - PUREMENT
// consommateurs des champs deja fournis par la jambe candidate
// (data_quality_status, snapshot_stability, lineup_status, accord avec
// le consensus marche si disponible). AUCUNE de ces fonctions ne
// touche/derive model_probability : elle reste intacte, jamais fusionnee.
// robustness_status et SAFE_ROBUSTNESS_SCORE sont des HEURISTIQUES de
// selection produit, jamais des probabilites.

const DATA_QUALITY_RANK = { PASS: 2, PARTIAL: 1, FAIL: 0 };
const SNAPSHOT_STABILITY_RANK = { STABLE: 2, MODERATE: 1, VOLATILE: 0 };

function clamp01(x) { return Math.max(0, Math.min(1, x)); }

// Ecart absolu entre la probabilite modele et le consensus marche
// devigue, quand ce dernier est disponible (jamais invente sinon).
function consensusAgreement(candidate) {
  if (candidate.market_consensus_probability == null) return null;
  return 1 - Math.abs(candidate.model_probability - candidate.market_consensus_probability);
}

// robustness_status : categorique (HIGH/MEDIUM/LOW), pour affichage
// rapide jambe-par-jambe. Deterministe, seuils explicites.
function computeLegRobustnessStatus(candidate) {
  const dq = DATA_QUALITY_RANK[candidate.data_quality_status] ?? 0;
  const stab = SNAPSHOT_STABILITY_RANK[candidate.snapshot_stability] ?? 0;
  const lineupOk = candidate.lineup_status === "CONFIRMED_POST_LINEUP" ? 2 : candidate.lineup_status === "PROVISIONAL_PRE_LINEUP" ? 1 : 0;
  const agreement = consensusAgreement(candidate);
  const agreementOk = agreement == null ? 1 : agreement >= 0.85 ? 2 : agreement >= 0.6 ? 1 : 0;
  const score = dq + stab + lineupOk + agreementOk; // max 8
  if (dq === 0) return "LOW"; // donnee incomplete = jamais HIGH/MEDIUM
  if (score >= 6) return "HIGH";
  if (score >= 3) return "MEDIUM";
  return "LOW";
}

// SAFE_ROBUSTNESS_SCORE (0-100) : composite explicite pour la SAFE PICK
// uniquement, seuils plus stricts que la robustesse de jambe generique.
// Composantes : probabilite modele, incertitude (ecart-type posterieur
// si fourni), stabilite temporelle, ecart avec le 2e meilleur choix du
// meme match, qualite de donnee, accord consensus marche.
function computeSafeRobustnessScore({ candidate, gapVsSecondBest }) {
  const pComponent = clamp01(candidate.model_probability) * 30; // 0-30
  const uncertainty = candidate.model_probability_uncertainty;
  const uncertaintyComponent = uncertainty == null ? 0 : clamp01(1 - uncertainty * 4) * 20; // 0-20, forte penalite si incertitude fournie et elevee
  const stabilityComponent = (SNAPSHOT_STABILITY_RANK[candidate.snapshot_stability] ?? 0) / 2 * 20; // 0-20
  const gapComponent = gapVsSecondBest == null ? 0 : clamp01(gapVsSecondBest * 4) * 15; // 0-15
  const dqComponent = (DATA_QUALITY_RANK[candidate.data_quality_status] ?? 0) / 2 * 10; // 0-10
  const agreement = consensusAgreement(candidate);
  const agreementComponent = agreement == null ? 2.5 : clamp01(agreement) * 5; // 0-5, neutre (moitie) si consensus indisponible
  const total = pComponent + uncertaintyComponent + stabilityComponent + gapComponent + dqComponent + agreementComponent;
  return Math.round(total * 100) / 100;
}

module.exports = { computeLegRobustnessStatus, computeSafeRobustnessScore, consensusAgreement, DATA_QUALITY_RANK, SNAPSHOT_STABILITY_RANK };
