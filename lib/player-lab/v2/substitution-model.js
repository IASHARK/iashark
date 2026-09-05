"use strict";
// PLAYER SCORER V2 (2026-09-05), item 12. Processus de substitution
// appris sur TRAIN : nombre de substitutions par (fixture,equipe),
// distribution des minutes (Dirichlet shrinkage, meme discipline que
// goal-clock.js), probabilite de sortie/entree PAR POSITION. Les 3621
// observations bench-0-minute du pilot (2024-25, OOS_FINAL - jamais
// utilisees ici pour AJUSTER, uniquement pour validation ulterieure)
// participent conceptuellement via posteriorExposure (V1,
// lib/player-lab/exposure-model.js, reutilise tel quel pour
// P(bench entre)) - aucune regle "star=90 minutes".

const N_BINS = 18;
const BIN_WIDTH = 5;
const DIRICHLET_PSEUDO_COUNT = 1;

function binIndexForMinute(elapsed) {
  return Math.min(N_BINS - 1, Math.max(0, Math.floor(elapsed / BIN_WIDTH)));
}

// entries = [{ n_substitutions, minutes: [...], outPositions: [...], inPositions: [...] }] - UNE entree par (fixture,team), TRAIN uniquement.
function fitSubstitutionModel(entries) {
  const countCounts = new Map();
  const minuteBinCounts = new Array(N_BINS).fill(0);
  const outPositionCounts = new Map();
  const inPositionCounts = new Map();
  let totalSubs = 0;

  for (const entry of entries) {
    countCounts.set(entry.n_substitutions, (countCounts.get(entry.n_substitutions) || 0) + 1);
    for (const minute of entry.minutes) minuteBinCounts[binIndexForMinute(minute)]++;
    for (const pos of entry.outPositions) outPositionCounts.set(pos, (outPositionCounts.get(pos) || 0) + 1);
    for (const pos of entry.inPositions) inPositionCounts.set(pos, (inPositionCounts.get(pos) || 0) + 1);
    totalSubs += entry.n_substitutions;
  }

  const nTeamMatches = entries.length;
  const maxCount = Math.max(0, ...countCounts.keys());
  const countDistribution = [];
  for (let n = 0; n <= maxCount; n++) countDistribution.push({ n_substitutions: n, probability: (countCounts.get(n) || 0) / nTeamMatches });
  const minuteDistribution = minuteBinCounts.map((c) => (c + DIRICHLET_PSEUDO_COUNT) / (totalSubs + N_BINS * DIRICHLET_PSEUDO_COUNT));

  const outTotal = [...outPositionCounts.values()].reduce((a, b) => a + b, 0) || 1;
  const inTotal = [...inPositionCounts.values()].reduce((a, b) => a + b, 0) || 1;

  return {
    n_team_matches: nTeamMatches,
    count_distribution: countDistribution,
    minute_distribution: minuteDistribution,
    out_position_distribution: new Map([...outPositionCounts].map(([p, c]) => [p, c / outTotal])),
    in_position_distribution: new Map([...inPositionCounts].map(([p, c]) => [p, c / inTotal])),
    mean_substitutions_per_match: totalSubs / nTeamMatches,
  };
}

module.exports = { N_BINS, BIN_WIDTH, binIndexForMinute, fitSubstitutionModel, DIRICHLET_PSEUDO_COUNT };
