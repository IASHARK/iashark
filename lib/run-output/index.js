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
const { loadCanonicalEligibilityRegistry } = require("./canonical-registry.js");
const { leagueKeyForApiFootballId, buildScoreCandidatesFromLegacyMatch, buildPlayerCandidatesFromLegacyMatch } = require("./build-legacy-score-candidates.js");
const eligibility = require("./eligibility.js");

// runOutputForSnapshot est LE point d'entree production : il ne doit
// jamais ne voir QUE le registry LEAGUE_EXPANSION_FACTORY_V1 (data/
// league-validation-registry.json), qui ne couvre pas Premier League
// (validee avant l'existence de la factory - voir canonical-registry.js).
// `registry` peut donc etre passe brut (registry factory tel que lu par
// lib/league-factory/registry.js#loadRegistry) : il est toujours fusionne
// ici avec le statut canonique PL avant tout filtrage d'eligibilite. Un
// appelant qui a deja pre-fusionne son propre registry (merged.leagues
// contient deja "premier_league") n'est pas affecte : loadCanonicalEligibilityRegistry
// n'ecrase jamais une entree deja presente.
function runOutputForSnapshot({ candidates, registry, snapshotTime, snapshotLabel, runId }) {
  if (!snapshotTime) throw new Error("runOutputForSnapshot: snapshotTime requis");
  if (snapshotLabel && !SNAPSHOT_LABELS.includes(snapshotLabel)) throw new Error(`runOutputForSnapshot: snapshotLabel invalide (${snapshotLabel}), attendu l'un de ${SNAPSHOT_LABELS.join(",")}`);

  const canonicalRegistry = loadCanonicalEligibilityRegistry(registry);
  const top5 = computeTop5ScorersOfDay({ candidates, registry: canonicalRegistry, snapshotTime });
  const combosResult = generateDailyCombos({ candidates, registry: canonicalRegistry, snapshotTime });
  const safePick = computeSafePickOfDay({ candidates, registry: canonicalRegistry, snapshotTime });

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
  loadCanonicalEligibilityRegistry,
  leagueKeyForApiFootballId,
  buildScoreCandidatesFromLegacyMatch,
  buildPlayerCandidatesFromLegacyMatch,
  eligibility,
};
