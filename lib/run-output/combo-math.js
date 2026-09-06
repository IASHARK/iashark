"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06), item 4 : probabilite d'un ticket
// combine. "max 1 selection par fixture" (impose en amont dans
// combos.js) supprime deja toute correlation intra-match. Ce module
// applique un controle de dependance RESIDUELLE, conservateur et
// explicite, jamais un simple produit aveugle quand une dependance
// plausible est detectee entre jambes de matchs DIFFERENTS.
//
// Heuristique volontairement simple et documentee (pas un modele
// statistique) : deux jambes de matchs differents mais de MEME ligue ET
// MEME coup d'envoi (meme journee/heure) partagent un environnement
// commun (arbitrage, meteo, contexte de journee) - on applique un leger
// facteur d'amortissement par paire detectee, jamais une pretention de
// precision. Sans paire detectee : produit simple (independance
// approximative standard inter-matchs, hypothese documentee).

const DEPENDENCY_DAMPENING_PER_PAIR = 0.985; // conservateur, jamais >1

function detectResidualDependencyPairs(legs) {
  const pairs = [];
  for (let i = 0; i < legs.length; i++) {
    for (let j = i + 1; j < legs.length; j++) {
      const a = legs[i], b = legs[j];
      if (a.fixture_id === b.fixture_id) continue; // deja impossible (max 1/fixture) mais garde-fou
      if (a.league_key === b.league_key && a.kickoff === b.kickoff) pairs.push([a.fixture_id, b.fixture_id]);
    }
  }
  return pairs;
}

function computeComboProbability(legs) {
  const naiveProduct = legs.reduce((p, l) => p * l.model_probability, 1);
  const dependencyPairs = detectResidualDependencyPairs(legs);
  const dependencyAdjustmentApplied = dependencyPairs.length > 0;
  const estimatedComboProbability = dependencyAdjustmentApplied
    ? naiveProduct * Math.pow(DEPENDENCY_DAMPENING_PER_PAIR, dependencyPairs.length)
    : naiveProduct;
  const comboTotalOdds = legs.reduce((p, l) => p * l.decimal_odds, 1);
  return {
    combo_total_odds: Math.round(comboTotalOdds * 100) / 100,
    implied_probability: Math.round((1 / comboTotalOdds) * 10000) / 10000,
    estimated_combo_probability: Math.round(estimatedComboProbability * 10000) / 10000,
    naive_independent_product: Math.round(naiveProduct * 10000) / 10000,
    dependency_adjustment_applied: dependencyAdjustmentApplied,
    dependency_pairs_detected: dependencyPairs.length,
  };
}

module.exports = { computeComboProbability, detectResidualDependencyPairs, DEPENDENCY_DAMPENING_PER_PAIR };
