"use strict";
// MARKET LAB - PHASE 3A (2026-09-05), item 9. Metriques DESCRIPTIVES
// uniquement (logloss, Brier, delta apparie) - aucune conclusion
// statistique, aucun seuil, aucun test d'hypothese. PUSH exclu par
// l'appelant avant d'arriver ici (jamais un resultat binaire fabrique
// pour un marche rembourse).

function logloss(probability, outcomeWin) {
  const p = Math.min(Math.max(probability, 1e-12), 1 - 1e-12);
  return outcomeWin ? -Math.log(p) : -Math.log(1 - p);
}

function brier(probability, outcomeWin) {
  const y = outcomeWin ? 1 : 0;
  return (probability - y) * (probability - y);
}

// rows = [{ model_probability, market_probability_shin, outcome }],
// outcome in {"WIN","LOSE"} (PUSH deja exclu par l'appelant).
function computeDescriptiveMetrics(rows) {
  const usable = rows.filter((r) => r.outcome === "WIN" || r.outcome === "LOSE");
  if (!usable.length) return null;
  let modelLogloss = 0, modelBrier = 0, marketLogloss = 0, marketBrier = 0, pairedDeltaLogloss = 0, pairedDeltaBrier = 0;
  for (const r of usable) {
    const win = r.outcome === "WIN";
    const ml = logloss(r.model_probability, win), mb = brier(r.model_probability, win);
    const kl = logloss(r.market_probability_shin, win), kb = brier(r.market_probability_shin, win);
    modelLogloss += ml; modelBrier += mb; marketLogloss += kl; marketBrier += kb;
    pairedDeltaLogloss += ml - kl; pairedDeltaBrier += mb - kb;
  }
  const n = usable.length;
  return {
    n,
    model_logloss: modelLogloss / n,
    model_brier: modelBrier / n,
    market_logloss: marketLogloss / n,
    market_brier: marketBrier / n,
    paired_delta_logloss_mean: pairedDeltaLogloss / n,
    paired_delta_brier_mean: pairedDeltaBrier / n,
  };
}

module.exports = { logloss, brier, computeDescriptiveMetrics };
