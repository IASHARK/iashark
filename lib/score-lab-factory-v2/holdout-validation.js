"use strict";
// SCORE_LAB_FACTORY_V2 (2026-09-06). Application GENERIQUE, PURE (aucun
// I/O) du contrat gele a des predictions holdout deja calculees.
// Generalise scripts/run-score-production-validation-holdout.js (ecrit
// ad-hoc pour Serie A) - meme logique de gates, meme regle de decision,
// coverage corrigee (voir coverage-gate.js). AUCUN seuil n'est jamais
// recalcule ou modifie ici : tout vient du contrat deja gele.
//
// IMPORTANT : ce module ne lit AUCUN fichier et n'ouvre AUCUN holdout -
// il ne fait qu'evaluer des predictions qui lui sont passees. C'est le
// script appelant (scripts/score-lab-v2-holdout-validation.js) qui
// doit d'abord verifier lib/score-lab-factory-v2/holdout-seal.js avant
// de calculer ces predictions - jamais ce module.

const { evaluateCoverageGate } = require("./coverage-gate.js");
const { calibrationInterceptSlope, reliabilityBins, expectedCalibrationError } = require("../player-lab/oos-eval-metrics.js");
const { secondaryMetricsFromPredictions } = require("./candidates.js");

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }

function calibrationRowsFromPredictions(predictions) {
  const rows = [];
  for (const p of predictions) {
    const isHome = p.h > p.a, isDraw = p.h === p.a, isAway = p.h < p.a;
    rows.push({ p: p.markets.p1, y: isHome ? 1 : 0 });
    rows.push({ p: p.markets.pN, y: isDraw ? 1 : 0 });
    rows.push({ p: p.markets.p2, y: isAway ? 1 : 0 });
  }
  return rows;
}

// predictions : [{h, a, lambdaH, lambdaA, rho, markets, cutoff, fixture_id}]
// deja calculees par l'appelant (via lib/lab/walkforward-*), point-in-time
// deja garanti par ces runners.
function evaluateHoldout({ contract, predictions, totalFixturesInHoldoutSeason, holdoutFixtureIds, exactScoreNLL }) {
  const allPredictionsAreHoldout = holdoutFixtureIds ? predictions.every((p) => holdoutFixtureIds.has(p.fixture_id)) : true;
  const expectedRho = contract.champion.rho;
  const rhoNeverRefit = predictions.every((p) => p.rho === expectedRho);
  const pointInTimeIntegrityPass = allPredictionsAreHoldout && rhoNeverRefit;

  const coverage = evaluateCoverageGate({ nValidPredictions: predictions.length, totalFixturesInSeason: totalFixturesInHoldoutSeason });

  const nllHoldout = exactScoreNLL(predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho })));
  const exactScoreNllPass = nllHoldout <= contract.gates.EXACT_SCORE_NLL.threshold;

  const calRows = calibrationRowsFromPredictions(predictions);
  const cal = calibrationInterceptSlope(calRows);
  const bins = reliabilityBins(calRows, 10);
  const ece = expectedCalibrationError(bins, calRows.length);
  const calibrationPass = cal.converged === true && ece <= contract.gates.CALIBRATION.threshold_ece;

  const secondary = secondaryMetricsFromPredictions(predictions);
  const maxDeg = contract.gates.MARKET_MARGINALS.max_relative_degradation;
  const oosDevLogloss = contract.gates.MARKET_MARGINALS.oos_dev_logloss;
  function degOk(oosDevVal, holdoutVal) { return holdoutVal <= oosDevVal * (1 + maxDeg); }
  const marketMarginals = {
    ou25: { oos_dev: oosDevLogloss.ou25_logloss, holdout: secondary.ou25_logloss, pass: degOk(oosDevLogloss.ou25_logloss, secondary.ou25_logloss) },
    btts: { oos_dev: oosDevLogloss.btts_logloss, holdout: secondary.btts_logloss, pass: degOk(oosDevLogloss.btts_logloss, secondary.btts_logloss) },
    x12: { oos_dev: oosDevLogloss.x12_logloss, holdout: secondary.x12_logloss, pass: degOk(oosDevLogloss.x12_logloss, secondary.x12_logloss) },
  };
  const marketMarginalsPass = marketMarginals.ou25.pass && marketMarginals.btts.pass && marketMarginals.x12.pass;

  const sortedByCutoff = [...predictions].sort((a, b) => (a.cutoff || "").localeCompare(b.cutoff || ""));
  const mid = Math.floor(sortedByCutoff.length / 2);
  const half1 = sortedByCutoff.slice(0, mid), half2 = sortedByCutoff.slice(mid);
  const nllHalf1 = half1.length ? exactScoreNLL(half1.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }))) : null;
  const nllHalf2 = half2.length ? exactScoreNLL(half2.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }))) : null;
  const temporalStabilityPass = nllHalf1 !== null && nllHalf2 !== null && nllHalf1 <= contract.gates.EXACT_SCORE_NLL.threshold && nllHalf2 <= contract.gates.EXACT_SCORE_NLL.threshold;

  const lowScoreKeys = ["0-0", "1-0", "0-1", "1-1"];
  const lowScoreHoldout = {};
  const lowScoreDegraded = [];
  for (const key of lowScoreKeys) {
    const [hh, aa] = key.split("-").map(Number);
    const rows = predictions.filter((p) => p.h === hh && p.a === aa);
    if (!rows.length) continue;
    const nllContribution = mean(rows.map((p) => exactScoreNLL([{ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }])));
    lowScoreHoldout[key] = { count_observed: rows.length, nll_contribution: nllContribution };
    const oosDevCell = contract.gates.NO_CATASTROPHIC_SECONDARY_DEGRADATION.oos_dev_low_score[key];
    if (oosDevCell && rows.length >= 5) {
      const deg = (nllContribution - oosDevCell.nll_contribution) / oosDevCell.nll_contribution;
      if (deg > contract.gates.NO_CATASTROPHIC_SECONDARY_DEGRADATION.max_relative_degradation) lowScoreDegraded.push({ cell: key, relative_degradation: deg });
    }
  }
  const noCatastrophicSecondaryDegradationPass = lowScoreDegraded.length === 0;

  const rejectTriggers = [];
  if (!pointInTimeIntegrityPass) rejectTriggers.push("POINT_IN_TIME_INTEGRITY");
  if (!exactScoreNllPass) rejectTriggers.push("EXACT_SCORE_NLL");
  const inconclusiveTriggers = [];
  if (!coverage.pass) inconclusiveTriggers.push("DATA_COVERAGE");
  if (!calibrationPass) inconclusiveTriggers.push("CALIBRATION");
  if (!marketMarginalsPass) inconclusiveTriggers.push("MARKET_MARGINALS");
  if (!temporalStabilityPass) inconclusiveTriggers.push("TEMPORAL_STABILITY");
  if (!noCatastrophicSecondaryDegradationPass) inconclusiveTriggers.push("NO_CATASTROPHIC_SECONDARY_DEGRADATION");

  let verdict;
  if (rejectTriggers.length) verdict = "REJECTED";
  else if (inconclusiveTriggers.length) verdict = "INCONCLUSIVE";
  else verdict = "VALIDATED";

  return {
    gates: {
      POINT_IN_TIME_INTEGRITY: { pass: pointInTimeIntegrityPass, all_predictions_are_holdout: allPredictionsAreHoldout, rho_never_refit: rhoNeverRefit },
      DATA_COVERAGE: coverage,
      EXACT_SCORE_NLL: { pass: exactScoreNllPass, nll_holdout: nllHoldout, threshold: contract.gates.EXACT_SCORE_NLL.threshold },
      CALIBRATION: { pass: calibrationPass, slope: cal.slope, intercept: cal.intercept, converged: cal.converged, ece, threshold_ece: contract.gates.CALIBRATION.threshold_ece },
      MARKET_MARGINALS: { pass: marketMarginalsPass, detail: marketMarginals },
      TEMPORAL_STABILITY: { pass: temporalStabilityPass, nll_half1: nllHalf1, nll_half2: nllHalf2, threshold: contract.gates.EXACT_SCORE_NLL.threshold },
      NO_CATASTROPHIC_SECONDARY_DEGRADATION: { pass: noCatastrophicSecondaryDegradationPass, holdout_low_score: lowScoreHoldout, degraded: lowScoreDegraded },
    },
    reject_triggers: rejectTriggers,
    inconclusive_triggers: inconclusiveTriggers,
    verdict,
    score_runnable: verdict === "VALIDATED",
  };
}

module.exports = { evaluateHoldout };
