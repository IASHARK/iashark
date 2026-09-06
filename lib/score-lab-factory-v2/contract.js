"use strict";
// SCORE_LAB_FACTORY_V2 (2026-09-06). Construction GENERIQUE du contrat
// de validation production - generalise scripts/freeze-score-
// production-validation-contract.js (ecrit ad-hoc pour Serie A lors du
// protocole V1), avec la correction du gate de couverture (voir
// lib/score-lab-factory-v2/coverage-gate.js - VALID_FIXTURE_COVERAGE_RATE
// + floor absolu, plus jamais MIN_N_OOS=500 universel).
//
// Chaque seuil reste soit deja pre-enregistre dans lib/promotion.js
// (MAX_SECONDARY_DEGRADATION, MAX_LOW_SCORE_RELATIVE_DEGRADATION), soit
// derive de la variabilite DEJA OBSERVEE du champion sur OOS_DEV
// (bootstrap par blocs, ECE x2) - jamais un nombre invente pour une
// ligue en particulier.

const { pairedBlockBootstrap } = require("../lab/bootstrap.js");
const { calibrationInterceptSlope, reliabilityBins, expectedCalibrationError } = require("../player-lab/oos-eval-metrics.js");
const { MAX_SECONDARY_DEGRADATION, MAX_LOW_SCORE_RELATIVE_DEGRADATION } = require("../promotion.js");
const { MIN_VALID_FIXTURE_COVERAGE_RATE, MIN_ABSOLUTE_FLOOR } = require("./coverage-gate.js");

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

function lowScoreDiagnostics(predictions, exactScoreNLL) {
  const keys = ["0-0", "1-0", "0-1", "1-1"];
  const out = {};
  for (const key of keys) {
    const [hh, aa] = key.split("-").map(Number);
    const rows = predictions.filter((p) => p.h === hh && p.a === aa);
    if (rows.length) out[key] = { count_observed: rows.length, nll_contribution: mean(rows.map((p) => exactScoreNLL([{ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }]))) };
  }
  return out;
}

// championPredictions : sortie de lib/score-lab-factory-v2/candidates.js
// pour LE candidat gele (champion.predictions), sur OOS_DEV.
// nTotalFixturesOosDevSeason : nombre TOTAL de fixtures de la saison
// OOS_DEV (pour documenter le taux de couverture obtenu a ce stade -
// diagnostic, le vrai gate de couverture s'applique au HOLDOUT, pas ici).
function buildProductionValidationContract({ leagueKey, championModelId, championPredictions, championParams, codeSha, datasetHashes, seedPrefix, exactScoreNLL }) {
  const perMatchNll = championPredictions.map((p) => exactScoreNLL([{ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }]));
  const blocksByDay = new Map();
  championPredictions.forEach((p, i) => {
    const key = p.cutoff || `row${i}`;
    if (!blocksByDay.has(key)) blocksByDay.set(key, []);
    blocksByDay.get(key).push(perMatchNll[i]);
  });
  const nllBootstrap = pairedBlockBootstrap([...blocksByDay.values()], { seed: `${seedPrefix}-NLL`, nResamples: 10000 });

  const calRows = calibrationRowsFromPredictions(championPredictions);
  const cal = calibrationInterceptSlope(calRows);
  const bins = reliabilityBins(calRows, 10);
  const ece = expectedCalibrationError(bins, calRows.length);

  const secondary = require("./candidates.js").secondaryMetricsFromPredictions(championPredictions);
  const lowScore = lowScoreDiagnostics(championPredictions, exactScoreNLL);

  const contract = {
    protocol: "SCORE_LAB_FACTORY_V2",
    phase: "CONTRACT_FREEZE",
    league_key: leagueKey,
    frozen_at: new Date().toISOString(),
    frozen_before_holdout_access: true,
    champion: {
      model_id: championModelId,
      ...championParams,
      code_sha_at_freeze: codeSha,
      dataset_hashes_train_oos_dev: datasetHashes,
      n_oos_dev_used_for_thresholds: championPredictions.length,
    },
    champion_frozen: true,
    gates: {
      POINT_IN_TIME_INTEGRITY: {
        description: "Chaque prediction du holdout doit venir d'un cutoff dans la saison holdout elle-meme ; rho/leagueAvg/structure restent EXACTEMENT ceux geles ici, jamais refittes.",
        pass_condition: "0 violation (assertion programmatique dans le runner de holdout)",
      },
      DATA_COVERAGE: {
        description: "VALID_FIXTURE_COVERAGE_RATE (proportion des fixtures de la saison holdout ayant produit une prediction valide) - remplace MIN_N_OOS=500 (inatteignable pour une seule saison, erreur decouverte lors du protocole V1 Serie A).",
        rate_threshold: MIN_VALID_FIXTURE_COVERAGE_RATE,
        absolute_floor: MIN_ABSOLUTE_FLOOR,
        source: "lib/score-lab-factory-v2/coverage-gate.js - convention documentee (90% = seuil standard de donnees manquantes acceptable ; 200 = plancher de blocs bootstrap credible), pas un seuil copie d'un contexte inapplicable.",
        pass_condition: `coverage_rate >= ${MIN_VALID_FIXTURE_COVERAGE_RATE} ET n_valid >= ${MIN_ABSOLUTE_FLOOR}`,
      },
      REPRODUCIBILITY: {
        description: "Le runner de holdout execute deux fois (meme process) - hash SHA-256 du rapport (hors horodatage) doit etre identique.",
        pass_condition: "hash_run1 === hash_run2",
      },
      EXACT_SCORE_NLL: {
        description: "NLL du champion gele sur le holdout, comparee a l'enveloppe de variabilite DEJA OBSERVEE sur OOS_DEV (bootstrap par blocs, seed pre-enregistre).",
        oos_dev_observed_mean_nll: nllBootstrap.observed_mean_delta,
        oos_dev_bootstrap_ci: [nllBootstrap.ci_lower, nllBootstrap.ci_upper],
        threshold: nllBootstrap.ci_upper,
        source: "lib/lab/bootstrap.js#pairedBlockBootstrap reutilise tel quel sur OOS_DEV, jamais un nombre invente ni copie d'une autre ligue.",
        pass_condition: `nll_holdout <= ${nllBootstrap.ci_upper}`,
      },
      CALIBRATION: {
        description: "Calibration 1X2 (intercept/slope + ECE, lib/player-lab/oos-eval-metrics.js, reutilise tel quel).",
        oos_dev_slope: cal.slope, oos_dev_intercept: cal.intercept, oos_dev_converged: cal.converged, oos_dev_ece: ece,
        threshold_ece: ece * 2,
        source: "Tolerance = 2x l'ECE deja mesure du champion sur OOS_DEV (aucune convention absolue pre-existante ailleurs dans ce codebase).",
        pass_condition: `calibration_converged_holdout === true ET ece_holdout <= ${(ece * 2).toFixed(6)}`,
      },
      MARKET_MARGINALS: {
        description: "Logloss O/U2.5, BTTS, 1X2 sur le holdout vs OOS_DEV.",
        oos_dev_logloss: secondary,
        max_relative_degradation: MAX_SECONDARY_DEGRADATION,
        source: "lib/promotion.js#MAX_SECONDARY_DEGRADATION (deja pre-enregistre, reutilise tel quel)",
        pass_condition: `pour chaque marche, logloss_holdout <= logloss_oos_dev * (1+${MAX_SECONDARY_DEGRADATION})`,
      },
      TEMPORAL_STABILITY: {
        description: "Le holdout est coupe en 2 moities par date de coup d'envoi ; chaque moitie doit independamment satisfaire le seuil EXACT_SCORE_NLL ci-dessus.",
        source: "Reutilise le seuil EXACT_SCORE_NLL deja derive - jamais un nouveau nombre.",
        pass_condition: `nll_half1 <= ${nllBootstrap.ci_upper} ET nll_half2 <= ${nllBootstrap.ci_upper}`,
      },
      NO_CATASTROPHIC_SECONDARY_DEGRADATION: {
        description: "Scores bas frequents (0-0,1-0,0-1,1-1) : contribution NLL par cellule, holdout vs OOS_DEV.",
        oos_dev_low_score: lowScore,
        max_relative_degradation: MAX_LOW_SCORE_RELATIVE_DEGRADATION,
        source: "lib/promotion.js#MAX_LOW_SCORE_RELATIVE_DEGRADATION (deja pre-enregistre, reutilise tel quel)",
        pass_condition: `pour chaque cellule avec >=5 observations, degradation relative <= ${MAX_LOW_SCORE_RELATIVE_DEGRADATION}`,
      },
    },
    decision_rule: {
      REJECT_if: "POINT_IN_TIME_INTEGRITY echoue OU REPRODUCIBILITY echoue OU EXACT_SCORE_NLL echoue",
      INCONCLUSIVE_if: "DATA_COVERAGE echoue OU au moins un des gates {CALIBRATION, MARKET_MARGINALS, TEMPORAL_STABILITY, NO_CATASTROPHIC_SECONDARY_DEGRADATION} echoue sans REJECT deja declenche",
      VALIDATED_if: "TOUS les gates PASS",
      never: "Aucun seuil ci-dessus ne sera modifie apres lecture du holdout. Aucun retuning. Aucune deuxieme tentative.",
    },
    pre_registration_rule: `Contrat ecrit et hashe AVANT le premier fetch de ${leagueKey} saison sealed_unread.`,
  };
  return contract;
}

module.exports = { buildProductionValidationContract };
