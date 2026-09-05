"use strict";
// MARKET LAB - PHASE 3A (2026-09-05), item 16. Closing Line Value,
// SEPARE du ROI. Ne peut jamais etre calcule au moment d'une decision
// T24/T6/T1 (CLOSE n'existe pas encore a cet instant - voir
// lib/market-lab/forward-odds-dataset.js#visibleOffersAt, deja teste
// anti-lookahead) : ce module s'applique UNIQUEMENT apres coup, une
// fois CLOSE reellement observe.
function computeClv({ executionOdds, closingFairProbability }) {
  const closingFairOdds = 1 / closingFairProbability;
  return {
    execution_odds: executionOdds,
    closing_fair_odds: closingFairOdds,
    clv_pct: (executionOdds / closingFairOdds - 1) * 100,
  };
}

module.exports = { computeClv };
