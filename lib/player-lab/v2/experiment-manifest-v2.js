"use strict";
// PLAYER SCORER V2 (2026-09-05), item 24. Manifest experimental
// PRE-ENREGISTRE AVANT toute metrique 2023-24/2024-25 - meme discipline
// que V1 (lib/player-lab/experiment-manifest.js) et que le Score Engine
// lab (EXP-002C/004/005).
//
// Revision FIT_NUMERICAL_CLOSURE (meme date) : le fit initial rapportait
// converged=false (le pas de Newton utilisait le Hessien regularise
// mais le GRADIENT BRUT non penalise - le point fixe visait donc le MLE
// NON penalise, infini pour les gardiens en quasi-separation). Corrige
// en optimisant explicitement l'objectif PENALISE (grad ET hess tous
// deux regularises par le meme ridge) + line-search backtracking + une
// contrainte d'identification explicite (UNKNOWN = reference, alpha=0).
// Aucune formule de vraisemblance, aucun risk-set, aucun signal (buts/
// tirs/SOT/goal-clock/substitutions/penalty/own-goal) modifie - voir
// lib/player-lab/v2/relative-risk-model.js pour le detail complet.

const crypto = require("node:crypto");

const EXPERIMENT_MANIFEST_V2 = Object.freeze({
  experiment_id: "PLAYER-SCORER-V2-COMPETING-RISKS",
  created_at: "2026-09-05",
  baseline_reference: "PLAYER_SCORER_V1_AGGREGATED_SHARE",
  score_engine_champion: "M2",
  season_split: { warmup_history: 2021, train: 2022, oos_dev: 2023, oos_final: 2024, sealed_unread: 2025 },
  primary_mode_this_gate: "POST_LINEUP_CONDITIONAL",
  pre_lineup_status: "EXPERIMENTAL_PROVISIONAL_UNCHANGED_FROM_V1",
  relative_risk_formula: "eta_i(c) = alpha_position + u_i + beta1*X_goal + beta2*X_shot + beta3*X_sot",
  identification_constraint: "UNKNOWN est le niveau de reference (alpha_UNKNOWN=0, jamais estime) - POSITION_ORDER=[F,M,D,G] uniquement estimes ; leve la direction de translation non identifiee du softmax (ajouter une constante a tous les eta d'un risk-set ne change aucune probabilite)",
  fit_method: "Newton-Raphson amorti (backtracking line-search) sur l'OBJECTIF PENALISE = logL - (ridge/2)*||theta||^2 (grad et hess tous deux regularises de facon coherente) sur la partial likelihood conditionnelle (conditional logit / Cox-like)",
  ridge_regularization: 1e-1,
  convergence_criterion: "converged=true ssi relative_objective_change < 1e-9 ET max_abs_gradient(objectif penalise) < 1e-6, apres line-search garantissant un objectif croissant a chaque pas accepte",
  convergence_tolerances: { gradient_tolerance: 1e-6, objective_relative_tolerance: 1e-9, max_iterations: 100, max_line_search_backtracks: 40 },
  multi_start_protocol: "5 initialisations deterministes distinctes (zeros, +0.5 uniforme, -0.5 uniforme, prior de position F>M>D>G, initialisation adversariale a contre-sens) - exige meme objectif penalise et memes probabilites de risk-set a tolerance stricte (<1e-6), determine sur TRAIN uniquement",
  unreconciled_event_policy: "1/1039 but non-own-goal exclu du fit (item 3/22) - reason_code=STOPPAGE_TIME_MINUTE_UNIT_MISMATCH_ELAPSED_ONLY_VS_ELAPSED_PLUS_EXTRA (fixture 868322, but en temps additionnel dont la minute stockee omet le temps additionnel alors que la reconstruction du risk-set des substitutions le combine) - documente et exclu explicitement, jamais une exclusion silencieuse, ne fait pas obstacle au gate >=99.5% (99.90% obtenu)",
  player_effect_method: "Empirical Bayes / MAP post-fit, shrinkage vers 0 par exposition (u_i ~ N(0, sigma_position^2) implicite : shrinkage=exposure/(exposure+15), u_i->0 quand exposure->0)",
  core_signals: {
    goals: "r_i ~ Gamma(a_p,b_p), Poisson(r_i*exposure), open-play uniquement",
    shots: "lambda_shot_i ~ Gamma(aShot_p,bShot_p), Poisson, observations shots!=null uniquement",
    sot: "q_i ~ Beta(aSOT_p,bSOT_p), Binomial(Shots,q), observations shots ET sot connus uniquement",
  },
  goal_clock_bins: 18,
  goal_clock_bin_width_minutes: 5,
  goal_clock_split: "HOME/AWAY separes uniquement (conditionner par total buts differe - pas assez de donnees pour le justifier maintenant)",
  attribution_types: ["OPEN_PLAY_SOFTMAX", "PENALTY_CONDITIONAL", "OWN_GOAL_ZERO_OFFENSIVE_CREDIT"],
  mass_conservation_invariant: "sum_i(pi_i,e) + P_own(e) = 1 pour chaque but",
  anytime_formula: "Pscore_i,s = 1 - Prod_e(1-pi_i,e,s) ; Pscore_i = E_s[Pscore_i,s]",
  v1_reduction_identity: "pi_i,e,s constant pour tous les buts d'un scenario => reduit exactement a la formule V1 (1 - Sum_n p_T(n)(1-pi_i)^n)",
  monte_carlo_min_draws: 10000,
  seed_formula: "int32(SHA256(fixture_id + model_version + input_hash))",
  substitution_pairing: "1 OUT -> 1 IN strict, cardinal du terrain toujours preserve",
  injury_features: "DISABLED",
  demo_fixture_policy: "PRE_OOS_TECHNICAL_DEMO_ONLY - jamais utilisee pour ajuster un parametre",
  comparison_candidates: ["A_SHRUNK_GOALS90_BASELINE", "B_LEGACY_PLAYER_ENGINE", "C_PLAYER_SCORER_V1_AGGREGATED_SHARE", "D_PLAYER_SCORER_V2_COMPETING_RISKS"],
  primary_metric: "ANYTIME_SCORER_LOGLOSS",
  secondary_metrics: ["BRIER", "CALIBRATION", "GOAL_ATTRIBUTION_NLL", "MOST_PROBABLE_SCORER_HIT_RATE"],
  pre_registration_rule: "Aucun seuil, formulation, ou parametre modifie apres avoir vu un resultat OOS 2023-24/2024-25.",
});

function manifestHashV2(manifest) {
  return crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
}

module.exports = { EXPERIMENT_MANIFEST_V2, manifestHashV2 };
