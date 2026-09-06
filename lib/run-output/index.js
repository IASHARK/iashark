"use strict";
// RUN OUTPUT / PRODUCT SELECTION ENGINE (2026-09-06). Nouvelle couche
// au-dessus des modeles Score/Player DEJA valides et du registry League
// Expansion Factory - un CONSOMMATEUR, jamais un nouveau modele. Zero
// formule Score/Player modifiee ici ; zero V3 ; zero reouverture d'OOS.
//
// Entree attendue par RUN : liste de "candidats" DEJA scores en amont
// par les pipelines Score/Player existants (memes fonctions que
// scripts/run-player-oos-final.js / scripts/run-score-oos-final.js,
// non touchees) - ce module ne fait que filtrer par eligibilite
// registry, classer, construire les combos et calculer les scores de
// robustesse produit. Voir README ci-dessous pour la forme exacte d'un
// candidat.
//
// candidate PLAYER (source="PLAYER") :
//   { source, league_key, fixture_id, kickoff, home_team, away_team,
//     player_id, player_name, team, opponent, market:"ANYTIME_GOALSCORER",
//     selection:"YES", player_model_version, model_probability,
//     model_probability_uncertainty?, decimal_odds?,
//     market_consensus_probability?, snapshot_stability, data_quality_status,
//     lineup_status: "PROVISIONAL_PRE_LINEUP"|"CONFIRMED_POST_LINEUP" }
//
// candidate SCORE (source="SCORE") :
//   { source, league_key, fixture_id, kickoff, home_team, away_team,
//     market (ex:"FT_1X2_HOME"), selection, score_model_version,
//     model_probability, model_probability_uncertainty?, decimal_odds?,
//     market_consensus_probability?, snapshot_stability, data_quality_status }

const { computeTop5ScorersOfDay } = require("./top5-scorers.js");
const { generateDailyCombos } = require("./combos.js");
const { computeSafePickOfDay } = require("./safe-pick.js");
const { diffSnapshots, selectionKeyOf, SNAPSHOT_LABELS, CHANGE_REASONS } = require("./snapshot-diff.js");
const { getBettingValidationStatus } = require("./market-lab-status.js");
const eligibility = require("./eligibility.js");

function runOutputForSnapshot({ candidates, registry, snapshotTime, snapshotLabel, runId }) {
  if (!snapshotTime) throw new Error("runOutputForSnapshot: snapshotTime requis");
  if (snapshotLabel && !SNAPSHOT_LABELS.includes(snapshotLabel)) throw new Error(`runOutputForSnapshot: snapshotLabel invalide (${snapshotLabel}), attendu l'un de ${SNAPSHOT_LABELS.join(",")}`);

  const top5 = computeTop5ScorersOfDay({ candidates, registry, snapshotTime });
  const combosResult = generateDailyCombos({ candidates, registry, snapshotTime });
  const safePick = computeSafePickOfDay({ candidates, registry, snapshotTime });

  return {
    run_id: runId ?? null,
    snapshot_time: snapshotTime,
    snapshot_label: snapshotLabel ?? null,
    betting_validation_status: getBettingValidationStatus(),
    TOP_5_SCORERS_OF_DAY: top5,
    DAILY_COMBOS: combosResult,
    SAFE_PICK_OF_THE_DAY: safePick,
  };
}

// Extrait les "slots" comparables d'un RUN OUTPUT pour l'utiliser avec
// diffSnapshots (item 6) : rang 1-5 du Top5, COMBO_1/2/3, et l'unique
// slot SAFE_PICK.
function extractSlots(runOutput) {
  const slots = new Map();
  for (const p of runOutput.TOP_5_SCORERS_OF_DAY.players) slots.set(`TOP5_RANK_${p.rank}`, p);
  for (const c of runOutput.DAILY_COMBOS.combos) slots.set(c.combo_id, c.status === "GENERATED" ? c : null);
  slots.set("SAFE_PICK", runOutput.SAFE_PICK_OF_THE_DAY.status === "SELECTED" ? runOutput.SAFE_PICK_OF_THE_DAY : null);
  return slots;
}

function diffRunOutputs(previousRunOutput, currentRunOutput, explicitReasons) {
  return diffSnapshots(extractSlots(previousRunOutput), extractSlots(currentRunOutput), explicitReasons);
}

module.exports = {
  runOutputForSnapshot,
  diffRunOutputs,
  extractSlots,
  computeTop5ScorersOfDay,
  generateDailyCombos,
  computeSafePickOfDay,
  diffSnapshots,
  selectionKeyOf,
  SNAPSHOT_LABELS,
  CHANGE_REASONS,
  getBettingValidationStatus,
  eligibility,
};
