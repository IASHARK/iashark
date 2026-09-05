"use strict";
// PLAYER SCORER V2 (2026-09-05), item 10. Distribution temporelle des
// buts, 18 bins x 5 minutes, HOME et AWAY SEPARES (au minimum requis -
// conditionner en plus par le total de buts est explicitement DIFFERE,
// pas assez de donnees pour le justifier maintenant, "ne pas fragmenter
// inutilement"). Dirichlet shrinkage : aucun bin a probabilite
// EXACTEMENT nulle (pseudo-compte uniforme).

const N_BINS = 18;
const BIN_WIDTH = 5;
const DIRICHLET_PSEUDO_COUNT = 1; // par bin, evite tout bin a 0 exactement

function binIndexForMinute(elapsed, extra) {
  const m = elapsed + (extra || 0);
  return Math.min(N_BINS - 1, Math.max(0, Math.floor(m / BIN_WIDTH)));
}

// goalsForSide : buts (open-play + penalty, own-goal exclu - un CSC
// n'est pas un evenement offensif de CETTE equipe au sens du clock)
// d'UN cote (HOME ou AWAY), TRAIN uniquement.
function fitGoalClock(goalsForSide) {
  const counts = new Array(N_BINS).fill(0);
  for (const g of goalsForSide) counts[binIndexForMinute(g.minute, g.extra_minute)]++;
  const total = counts.reduce((a, b) => a + b, 0) + N_BINS * DIRICHLET_PSEUDO_COUNT;
  return counts.map((c) => (c + DIRICHLET_PSEUDO_COUNT) / total);
}

module.exports = { N_BINS, BIN_WIDTH, binIndexForMinute, fitGoalClock, DIRICHLET_PSEUDO_COUNT };
