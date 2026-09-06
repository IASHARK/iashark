"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 - OOS_DEV (2026-09-06). Manifests Score et
// Player PRE-ENREGISTRES pour une ligue, ECRITS ET HASHES AVANT toute
// lecture de metrique OOS_DEV/OOS_FINAL - meme discipline exacte que
// lib/player-lab/v2/experiment-manifest-v2.js (deja utilisee pour PL).
// Reutilise LITTERALEMENT la politique de decision Score Lab PL
// (lib/promotion.js#evaluatePromotion, seuils inchanges) et le meme
// gabarit de decision Player Lab que scripts/run-player-scorer-oos-dev-2023-24.js -
// aucun nouveau seuil cree apres avoir vu une ligue non-PL.

const crypto = require("crypto");

function sha256(obj) {
  return crypto.createHash("sha256").update(JSON.stringify(obj)).digest("hex");
}

// params = { leagueKey, leagueId, calendarType, seasonSplit, datasetHash,
//   leagueAvgH, leagueAvgA, rhoFinal, rhoMethod, rhoBounds, rhoConvergence,
//   rhoTrainFixtureCount }
function buildScoreOosManifest(params) {
  const manifest = Object.freeze({
    manifest_id: `SCORE_${params.leagueKey.toUpperCase()}_OOS_MANIFEST`,
    league_key: params.leagueKey, league_id: params.leagueId, calendar_type: params.calendarType,
    created_at: params.createdAt,
    dataset_hash: params.datasetHash,
    season_split: params.seasonSplit,
    league_averages: { leagueAvgH: params.leagueAvgH, leagueAvgA: params.leagueAvgA, source: "TRAIN reel de cette ligue, jamais 1.35/1.10 par defaut ni une valeur PL" },
    rho: {
      final_value: params.rhoFinal,
      method: "Bounded scalar MLE (scipy.optimize.minimize_scalar, method=bounded) sur la log-vraisemblance Dixon-Coles exacte, via scripts/fit_rho.py (le VRAI fitter, jamais reimplemente) - identique a la methode PL, appliquee aux donnees de cette ligue uniquement.",
      fitted_on: "WARMUP+TRAIN de cette ligue (walk-forward jour-par-jour a travers TRAIN, TRAIN n'etant pas une donnee secrete) - valeur retenue = fit du DERNIER cutoff TRAIN (le plus de donnees disponibles avant OOS_DEV).",
      bounds: params.rhoBounds, convergence: params.rhoConvergence, n_train_fixtures_at_final_fit: params.rhoTrainFixtureCount,
      frozen_after_manifest: "rho ne change plus une fois ce manifest hashe - aucun refit sur OOS_DEV/OOS_FINAL, jamais.",
    },
    model_m0: {
      id: `SCORE_M0_${params.leagueKey.toUpperCase()}`,
      definition: "Dixon-Coles point-in-time, etat SAISON COURANTE UNIQUEMENT (lib/data/team-state.js#buildTeamState + lib/engine.js#calcLambdas, gate calcCriteres>=3 matchs joues), leagueAvgH/leagueAvgA de CETTE ligue, rho = rho final ci-dessus (jamais rho_PL=-0.0845).",
      no_pl_values: true,
    },
    model_m2: {
      id: `SCORE_M2_${params.leagueKey.toUpperCase()}`,
      definition: "IDENTIQUE a M0 (memes lambdas de base, meme rho final) PLUS la couche structurelle EARLY_SEASON_BAYES : ajustement additif du taux courant vers un prior de saison precedente (equipe deja presente : taux reel meme cote ; equipe promue : moyenne de ligue reelle de la saison precedente), pondere par prior_weight(n)=max(0, 8 - 0.5*n) ou n = matchs de la SEULE saison courante deja joues (lib/lab/bayes-early-season.js, lib/lab/walkforward-m2r-runner.js - code partage, non modifie).",
      structural_formula: "prior_equivalents(n) = max(0, 8 - 0.5*n)",
      structural_formula_status: `TRANSFERRED_STRUCTURE_UNVALIDATED_FOR_${params.leagueKey.toUpperCase()}`,
      structural_formula_note: "Formule gagnante en PL, reutilisee ICI comme CANDIDAT STRUCTUREL uniquement - les constantes 8 et 0.5 ne sont PAS retunees sur les donnees de cette ligue, precisement pour tester si la structure elle-meme se transfere.",
      promoted_team_fallback: "moyenne de ligue REELLE de la saison precedente (lib/lab/walkforward-m2r-runner.js#computeRealLeagueAverageRates), jamais une constante devinee ni une valeur PL.",
    },
    primary_metric: "EXACT_SCORE_NLL (lib/lab/metrics.js#exactScoreNLL, delta = NLL_M2 - NLL_M0 via lib/lab/loss-delta.js#lossDelta - candidat meilleur => delta<0)",
    secondary_metrics: ["home_goals_marginal_nll", "away_goals_marginal_nll", "1x2_logloss", "1x2_brier", "over_under_2.5_logloss", "over_under_2.5_brier", "btts_logloss", "btts_brier", "calibration", "low_score_diagnostics"],
    bootstrap_policy: { method: "paired block bootstrap (lib/lab/bootstrap.js#pairedBlockBootstrap, code partage inchange)", n_resamples: 10000, block_unit: "cutoff (jour de coup d'envoi)", seed: `SCORE-OOS-DEV-${params.leagueKey.toUpperCase()}-2026-09-06` },
    promotion_policy: {
      source: "lib/promotion.js#evaluatePromotion - REUTILISE TEL QUEL, aucun seuil modifie",
      thresholds: { MIN_N_OOS: 500, MIN_CONVERGENCE_RATE: 0.95, MAX_BOUNDARY_HIT_RATE: 0.10, MIN_RELATIVE_GAIN: 0.0025, MAX_SECONDARY_DEGRADATION: 0.03, MAX_RHO_STD: 0.05 },
      decision_labels: { PROMOTE: "M2_BEATS_M0", SHADOW_MORE_DATA: "INCONCLUSIVE", REJECT: "M2_REJECT_DEV" },
    },
    pre_registration_rule: "Aucun seuil, aucune formule, aucun parametre modifie apres avoir vu un resultat OOS_DEV. 2024-25 (OOS_FINAL) reste SEALED_UNREAD dans cette passe.",
  });
  return { manifest, hash: sha256(manifest) };
}

// params = { leagueKey, leagueId, calendarType, seasonSplit, datasetHash, priorsCandidate }
function buildPlayerOosManifest(params) {
  const manifest = Object.freeze({
    manifest_id: `PLAYER_${params.leagueKey.toUpperCase()}_OOS_MANIFEST`,
    league_key: params.leagueKey, league_id: params.leagueId, calendar_type: params.calendarType,
    created_at: params.createdAt,
    dataset_hash: params.datasetHash,
    season_split: params.seasonSplit,
    candidate_c: {
      id: `PLAYER_SCORER_V1_AGGREGATED_SHARE_${params.leagueKey.toUpperCase()}`,
      definition: "lib/player-lab/simulation.js#simulateAnytimeScorer (code partage, non modifie) alimente par des priors ENTIEREMENT REAPPRIS sur TRAIN de cette ligue via lib/player-lab/fit-all-priors.js (core-rate, exposure, conversion, goal-timing, own-goal, penalty) - AUCUN parametre copie de PL.",
      fitted_priors_hash: params.priorsHash,
    },
    baselines: {
      a: { id: "SHRUNK_GOALS90_BASELINE", definition: "lib/player-lab/baselines.js#baselineA_simpleShrunkRate, meme formule que PL, shrunk vers la moyenne de ligue REELLE de cette ligue (TRAIN)." },
      b: { id: "LEGACY_PLAYER_ENGINE", definition: "lib/markets/player-engine.js#buildPlayerMarketOutput, meme moteur que PL, alimente par l'historique reel de cette ligue.", compatibility_note: "Inclus si les memes champs d'entree (historicalMinutes, ratePer90, teamAttackMultiplier derive de M2 de cette ligue) sont disponibles - sinon exclu explicitement, jamais fabrique." },
    },
    v2_status: "NON CONSTRUIT - rejete proprement en PL (OOS_DEV commit dc39690e), n'est PAS un challenger automatique de la factory.",
    primary_metric: "ANYTIME_SCORER_LOGLOSS (meme definition que PL : y=1 si le joueur marque >=1 fois en temps reglementaire, sinon 0)",
    secondary_metrics: ["brier", "calibration_intercept_slope_ece", "top1_hit_rate", "outfield_only_sensitivity", "played_minutes_gt_0_sensitivity", "position_diagnostics", "first_second_half_season"],
    bootstrap_policy: { method: "paired block bootstrap par ISO_WEEK (lib/player-lab/oos-eval-metrics.js#pairedBlockBootstrapDelta, code partage inchange)", n_resamples: 10000, seed: `PLAYER-OOS-DEV-${params.leagueKey.toUpperCase()}-2026-09-06` },
    decision_rule: {
      source: "meme structure que scripts/run-player-scorer-oos-dev-2023-24.js (PL) - reutilisee sans modification de seuil",
      rule: "relative_gain(C vs baseline) > 0 ET CI95(delta).upper < 0 => candidat bat la baseline ; sinon INCONCLUSIVE ou REJECT selon le signe.",
    },
    pre_registration_rule: "Aucun seuil, aucune formule, aucun parametre modifie apres avoir vu un resultat OOS_DEV. 2024-25 (OOS_FINAL) reste SEALED_UNREAD dans cette passe.",
  });
  return { manifest, hash: sha256(manifest) };
}

// LEAGUE_EXPANSION_FACTORY_V1 - OOS_FINAL (2026-09-06). Manifests figes
// AVANT toute lecture 2024-25 - reutilisent LITTERALEMENT rho/league
// averages/priors deja geles au DEV (params.frozenFrom* provient
// directement des manifests DEV deja hashes, jamais re-derive).

// params = { leagueKey, leagueId, calendarType, seasonSplit, datasetHashFinal,
//   frozenFromDevManifestHash, leagueAvgH, leagueAvgA, rhoFinal }
function buildScoreFinalManifest(params) {
  const manifest = Object.freeze({
    manifest_id: `SCORE_${params.leagueKey.toUpperCase()}_OOS_FINAL_MANIFEST`,
    league_key: params.leagueKey, league_id: params.leagueId, calendar_type: params.calendarType,
    created_at: params.createdAt,
    dataset_hash_final: params.datasetHashFinal,
    frozen_from_dev_manifest_hash: params.frozenFromDevManifestHash,
    season_split: params.seasonSplit,
    freeze_statement: "rho, league averages, Bayes, priors Player, shrinkage, exposure, penalties, own-goals, eligibility et cutoff rules sont REUTILISES EXACTEMENT tels que geles au DEV - aucune valeur re-derivee, aucun retuning. 2023-24 ne sert plus a aucune decision dans cette passe.",
    league_averages: { leagueAvgH: params.leagueAvgH, leagueAvgA: params.leagueAvgA, source: "IDENTIQUE au manifest DEV, jamais recalcule" },
    rho: { final_value: params.rhoFinal, source: "IDENTIQUE au manifest DEV (rho gele), jamais refit" },
    model_b0: {
      id: `SCORE_B0_${params.leagueKey.toUpperCase()}_INDEPENDENT_POISSON`,
      definition: "MEMES inputs point-in-time et MEMES lambdas que SCORE_M0 (lib/data/team-state.js#buildTeamState + lib/engine.js#calcLambdas, saison courante uniquement) mais rho=0 (aucune correction Dixon-Coles, Poisson home/away independants).",
      purpose: "Verifie sur OOS_FINAL uniquement que le Score Engine La Liga (rho appris) apporte reellement quelque chose par rapport a une version independante plus simple - PAS un candidat a tuner, jamais promu.",
      not_a_tunable_candidate: true,
    },
    model_m0: { id: `SCORE_M0_${params.leagueKey.toUpperCase()}`, definition: "IDENTIQUE au manifest DEV (rho gele ci-dessus)." },
    model_m2_status: "ARCHIVE (M2_REJECT_DEV) - aucune possibilite de promotion dans cette passe, non recalcule.",
    primary_metric: "EXACT_SCORE_NLL - delta = NLL_M0 - NLL_B0 via lib/lab/loss-delta.js#lossDelta (candidat M0 meilleur => delta<0)",
    secondary_metrics: ["home_goals_marginal_nll", "away_goals_marginal_nll", "1x2_logloss", "1x2_brier", "over_under_2.5_logloss", "over_under_2.5_brier", "btts_logloss", "btts_brier", "calibration", "low_score_diagnostics", "first_half_season", "second_half_season"],
    bootstrap_policy: { method: "paired block bootstrap (lib/lab/bootstrap.js#pairedBlockBootstrap, code partage inchange)", n_resamples: 10000, block_unit: "cutoff (jour de coup d'envoi)", seed: `SCORE-OOS-FINAL-${params.leagueKey.toUpperCase()}-2026-09-06` },
    decision_rule: {
      VALIDATED: "metriques propres/finies ET calibration acceptable ET 0 fuite/determinism failure ET M0 n'est PAS statistiquement clairement pire que B0 (ci_lower du delta <= 0, i.e. pas de CI_CONFIRMS_CANDIDATE_WORSE) ET idealement M0 ameliore le primary avec CI favorable (ci_upper<0).",
      INCONCLUSIVE: "M0~=B0 sans degradation claire (CI traverse zero).",
      REJECTED: "M0 est statistiquement clairement pire que B0 (ci_lower>0).",
    },
    pre_registration_rule: "Aucun critere modifie apres resultat. 2025-26 reste SEALED_UNREAD, jamais consulte.",
  });
  return { manifest, hash: sha256(manifest) };
}

// params = { leagueKey, leagueId, calendarType, seasonSplit, datasetHashFinal, frozenFromDevManifestHash, priorsHash }
function buildPlayerFinalManifest(params) {
  const manifest = Object.freeze({
    manifest_id: `PLAYER_${params.leagueKey.toUpperCase()}_OOS_FINAL_MANIFEST`,
    league_key: params.leagueKey, league_id: params.leagueId, calendar_type: params.calendarType,
    created_at: params.createdAt,
    dataset_hash_final: params.datasetHashFinal,
    frozen_from_dev_manifest_hash: params.frozenFromDevManifestHash,
    season_split: params.seasonSplit,
    freeze_statement: "priors positions/exposure/penalty/own-goal/shrinkage REUTILISES EXACTEMENT tels que geles au DEV - aucun retuning, aucune nouvelle formule.",
    candidate_c: { id: `PLAYER_SCORER_V1_AGGREGATED_SHARE_${params.leagueKey.toUpperCase()}`, fitted_priors_hash: params.priorsHash, source: "IDENTIQUE au manifest DEV" },
    baselines: {
      a: { id: "SHRUNK_GOALS90_BASELINE" },
      b: { id: "LEGACY_PLAYER_ENGINE" },
    },
    v2_status: "NON CONSTRUIT - toujours hors perimetre.",
    primary_metric: "ANYTIME_SCORER_LOGLOSS",
    supports: "C-vs-A et C-vs-B evalues sur leur SUPPORT COMMUN MAXIMAL RESPECTIF, jamais reduit inutilement au plus faible des deux.",
    secondary_metrics: ["brier", "calibration_intercept_slope_ece", "top1_hit_rate", "outfield_only_sensitivity", "played_minutes_gt_0_sensitivity"],
    bootstrap_policy: { method: "paired block bootstrap par ISO_WEEK (lib/player-lab/oos-eval-metrics.js#pairedBlockBootstrapDelta, code partage inchange)", n_resamples: 10000, seed: `PLAYER-OOS-FINAL-${params.leagueKey.toUpperCase()}-2026-09-06` },
    decision_rule: {
      VALIDATED: "C bat A ET B en mean logloss avec CI95(delta).upper<0 pour chacun, ET guardrails (Brier sans degradation claire, calibration finie, 0 NaN/Inf, determinism PASS, anti-leakage PASS).",
      INCONCLUSIVE: "signal positif mais preuve statistique insuffisante (CI traverse zero) ou guardrail non-bloquant en zone grise.",
      REJECTED: "C ne bat pas les baselines selon la regle ci-dessus.",
    },
    pre_registration_rule: "Aucun critere modifie apres resultat. 2025-26 reste SEALED_UNREAD, jamais consulte.",
  });
  return { manifest, hash: sha256(manifest) };
}

module.exports = { buildScoreOosManifest, buildPlayerOosManifest, buildScoreFinalManifest, buildPlayerFinalManifest, sha256 };
