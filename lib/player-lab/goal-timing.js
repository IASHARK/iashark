"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 8. Distribution empirique
// (shrinkee) du timing des buts - 18 bins x 5 minutes (0-5,...,85-90+,
// tout evenement en temps additionnel replie dans le dernier bin). Un
// joueur ne peut recevoir une part de but que lorsqu'il est
// PLAUSIBLEMENT sur le terrain (weightTimingByPresence, combine avec
// l'exposure model).
//
// La presence-par-bin ci-dessous est une simplification V1 EXPLICITE :
// escalier (pleine presence avant la minute de sortie/apres la minute
// d'entree ATTENDUE, nulle apres/avant), pas une propagation complete
// de l'incertitude sur l'instant exact - celle-ci reste capturee au
// niveau global par P_score_i via le Monte Carlo (simulation.js). A
// affiner si la calibration OOS le justifie.

const N_BINS = 18;
const BIN_WIDTH = 5;
const UNIFORM_SHRINKAGE_PSEUDO_COUNT = 2; // pseudo-buts uniformes par bin

function binIndexForMinute(elapsed, extra) {
  const effectiveMinute = elapsed + (extra || 0);
  const idx = Math.floor(effectiveMinute / BIN_WIDTH);
  return Math.min(N_BINS - 1, Math.max(0, idx));
}

// goalEvents : TRAIN uniquement.
function fitGoalTimingDistribution(goalEvents) {
  const counts = new Array(N_BINS).fill(0);
  for (const g of goalEvents) counts[binIndexForMinute(g.minute, g.extra_minute)]++;
  const total = counts.reduce((a, b) => a + b, 0) + N_BINS * UNIFORM_SHRINKAGE_PSEUDO_COUNT;
  return counts.map((c) => (c + UNIFORM_SHRINKAGE_PSEUDO_COUNT) / total);
}

function presenceByBinForStarter(expectedExitMinute) {
  const bins = new Array(N_BINS).fill(0);
  for (let i = 0; i < N_BINS; i++) {
    const binStart = i * BIN_WIDTH, binEnd = binStart + BIN_WIDTH;
    if (expectedExitMinute >= binEnd) bins[i] = 1;
    else if (expectedExitMinute <= binStart) bins[i] = 0;
    else bins[i] = (expectedExitMinute - binStart) / BIN_WIDTH;
  }
  return bins;
}

function presenceByBinForSub(expectedEntryMinute, pEnterIfBench) {
  const bins = new Array(N_BINS).fill(0);
  for (let i = 0; i < N_BINS; i++) {
    const binStart = i * BIN_WIDTH, binEnd = binStart + BIN_WIDTH;
    let coverage;
    if (expectedEntryMinute <= binStart) coverage = 1;
    else if (expectedEntryMinute >= binEnd) coverage = 0;
    else coverage = (binEnd - expectedEntryMinute) / BIN_WIDTH;
    bins[i] = coverage * pEnterIfBench;
  }
  return bins;
}

// weighted : distribution de timing (fitGoalTimingDistribution)
// ponderee par la presence du joueur, renormalisee sur les bins ou la
// presence est non-nulle (jamais un but attribue a un instant ou le
// joueur est certainement absent). Retourne la MASSE TOTALE restante
// (avant renormalisation) - c'est le facteur multiplicatif de
// "probabilite d'etre present pour un but donne", utilise par
// attribution.js.
function presenceMassForGoal(timingDist, presenceByBin) {
  let mass = 0;
  for (let i = 0; i < timingDist.length; i++) mass += timingDist[i] * (presenceByBin[i] || 0);
  return mass;
}

module.exports = { N_BINS, BIN_WIDTH, binIndexForMinute, fitGoalTimingDistribution, presenceByBinForStarter, presenceByBinForSub, presenceMassForGoal };
