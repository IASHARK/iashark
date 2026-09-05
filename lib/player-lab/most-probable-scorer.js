"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 13. Selection UNIQUE, sur
// les DEUX equipes - argmax de la moyenne posterieure. Pas de
// bookmaker, pas de LLM, pas de reputation.
function selectMostProbableScorer(simulationResultsBothTeams) {
  if (!simulationResultsBothTeams.length) return null;
  return simulationResultsBothTeams.reduce((best, r) => (r.posterior_mean > best.posterior_mean ? r : best));
}

module.exports = { selectMostProbableScorer };
