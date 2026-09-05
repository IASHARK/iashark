"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 17 (etape 6). Manifest
// experimental PRE-ENREGISTRE AVANT tout resultat OOS - meme
// discipline que le Score Engine lab (EXP-002C/004/005 : seuils et
// formulation enregistres avant calcul, jamais modifies apres avoir vu
// un resultat).

const crypto = require("node:crypto");

const EXPERIMENT_MANIFEST_V1 = Object.freeze({
  experiment_id: "PLAYER-SCORER-ENGINE-V1",
  created_at: "2026-09-05",
  score_engine_champion: "M2",
  season_split: { warmup: 2021, train: 2022, oos_dev: 2023, oos_final: 2024, sealed_unread: 2025 },
  modes: ["PRE_LINEUP", "POST_LINEUP_CONDITIONAL"],
  formula: "P_score_i_s = 1 - Sum_n p_T(n) * (1 - pi_i,s)^n ; P_score_i = E_s[P_score_i_s]",
  mass_conservation_invariant: "sum(player_goal_shares) + own_goal_share = 1 per scenario",
  core_rate_prior_strength_matches90: 10,
  shots_layer_prior_strength_sot: 20,
  exposure_prior_strength_matches: 10,
  goal_timing_bins: 18,
  goal_timing_bin_width_minutes: 5,
  injury_features: "DISABLED",
  position_groups: ["F", "M", "D", "G"],
  unknown_position_policy: "FALLBACK_TO_GLOBAL_PRIOR",
  baselines: ["A_SIMPLE_SHRUNK_RATE", "B_TEAM_GOAL_SHARE", "C_LEGACY_PLAYER_ENGINE_V1"],
  primary_metric: "ANYTIME_SCORER_LOGLOSS",
  secondary_metrics: ["BRIER", "CALIBRATION", "SCORER_ATTRIBUTION_NLL", "TOP_1_HIT_RATE", "MEAN_SELECTED_PROBABILITY"],
  bootstrap_cluster_unit: "fixture_id_or_iso_week",
  pre_registration_rule: "Aucun seuil ni formulation modifie apres avoir vu un resultat OOS.",
});

function manifestHash(manifest) {
  return crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

module.exports = { EXPERIMENT_MANIFEST_V1, manifestHash };
