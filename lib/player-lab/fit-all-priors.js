"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 2/17. Point d'integration
// UNIQUE : fitte TOUS les priors EXCLUSIVEMENT sur la saison TRAIN
// (season-split.js, 2022-23) - jamais une autre saison, verifie
// explicitement ici plutot que laisse a la discretion de chaque
// appelant. goalEvents doit porter un champ `season` (attache par
// l'appelant lors de la construction, voir scripts/build-player-scorer-priors.js).

const { splitFor } = require("./season-split.js");
const { resolvePositionGroup } = require("./position-policy.js");
const { fitPositionRatePriors } = require("./core-rate-model.js");
const { fitConversionPriors } = require("./shots-layer.js");
const { fitExposurePriors } = require("./exposure-model.js");
const { fitGoalTimingDistribution } = require("./goal-timing.js");
const { fitOwnGoalRate } = require("./own-goal-component.js");
const { fitPenaltyRate } = require("./penalty-component.js");

function fitAllPriorsFromTrain(allPlayerMatchRows, allGoalEvents) {
  const trainRows = allPlayerMatchRows.filter((r) => splitFor(r.season) === "TRAIN");
  const trainGoalEvents = allGoalEvents.filter((g) => splitFor(g.season) === "TRAIN");
  if (!trainRows.length) throw new Error("fitAllPriorsFromTrain: aucune ligne TRAIN disponible - la saison 2022 est-elle collectee ?");

  return {
    train_season: 2022,
    n_train_rows: trainRows.length,
    n_train_goal_events: trainGoalEvents.length,
    core_rate_priors: fitPositionRatePriors(trainRows, resolvePositionGroup),
    conversion_priors: fitConversionPriors(trainRows, resolvePositionGroup),
    exposure_priors: fitExposurePriors(trainRows, resolvePositionGroup),
    goal_timing_distribution: fitGoalTimingDistribution(trainGoalEvents),
    own_goal_rate: fitOwnGoalRate(trainGoalEvents),
    penalty_rate: fitPenaltyRate(trainGoalEvents),
  };
}

module.exports = { fitAllPriorsFromTrain };
