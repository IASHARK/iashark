"use strict";
// GATE C7 (SPEC LAB PRO v1.0 SS14) - regle de promotion pour le passage
// M0 -> M1 (et modeles suivants). Entierement deterministe : mêmes
// entrees -> meme decision, toujours. Ne fait AUCUN calcul statistique
// lui-meme (pas de refit, pas de bootstrap) - consomme uniquement les
// sorties deja produites par lib/lab/metrics.js et lib/lab/bootstrap.js.
//
// Seuils (constantes documentees ci-dessous) : choix PRO par defaut,
// destines a etre challenges/ajustes par experience reelle, jamais
// arbitraires sans justification.
//   - MIN_N_OOS=500 : en dessous, la variance d'echantillonnage sur un
//     championnat de foot (~380 matchs/saison) est jugee trop grande pour
//     trancher - on redemande des donnees plutot que rejeter definitivement.
//   - MIN_CONVERGENCE_RATE=0.95 : un fitter qui ne converge pas sur >5% des
//     cutoffs indique un probleme structurel (bornes trop serrees, donnees
//     degenerees) - REJECT, pas SHADOW, car plus de donnees ne resoudra pas
//     un bug d'optimisation.
//   - MAX_BOUNDARY_HIT_RATE=0.10 : rho_hat colle a sa borne sur >10% des
//     cutoffs = les bornes derivees (lib/lab/rho-bounds.js) sont
//     probablement trop contraignantes ou le modele cherche a sortir de
//     l'espace Dixon-Coles valide - REJECT.
//   - MIN_RELATIVE_GAIN=0.005 (0.5%) : plancher de significativite
//     ECONOMIQUE (pas seulement statistique) - un gain de NLL inferieur
//     n'a pas d'impact pratique detectable sur les mises/edges.
//   - MAX_SECONDARY_DEGRADATION=0.03 (3%) : une amelioration du score exact
//     qui degraderait fortement un marche secondaire (O/U2.5, BTTS, 1X2)
//     n'est pas un progres net pour le produit.
//   - MAX_RHO_STD=0.05 : rho appris qui varie trop d'un cutoff a l'autre
//     indique une instabilite du fit, pas un signal stable exploitable.

const MIN_N_OOS = 500;
const MIN_CONVERGENCE_RATE = 0.95;
const MAX_BOUNDARY_HIT_RATE = 0.10;
const MIN_RELATIVE_GAIN = 0.005;
const MAX_SECONDARY_DEGRADATION = 0.03;
const MAX_RHO_STD = 0.05;
const MIN_LOW_SCORE_COUNT_FOR_CHECK = 5;
const MAX_LOW_SCORE_RELATIVE_DEGRADATION = 0.10;

const REASON = {
  FITTER_NON_CONVERGENT: "FITTER_NON_CONVERGENT",
  RHO_ON_BOUNDARY: "RHO_ON_BOUNDARY",
  RHO_UNSTABLE: "RHO_UNSTABLE",
  GAIN_BELOW_ECONOMIC_FLOOR: "GAIN_BELOW_ECONOMIC_FLOOR",
  SECONDARY_MARKET_DEGRADED: "SECONDARY_MARKET_DEGRADED",
  LOW_SCORE_DEGRADED: "LOW_SCORE_DEGRADED",
  N_OOS_TOO_LOW: "N_OOS_TOO_LOW",
  CI_CROSSES_ZERO: "CI_CROSSES_ZERO",
  CI_CONFIRMS_CANDIDATE_WORSE: "CI_CONFIRMS_CANDIDATE_WORSE",
};

const STATUS = { PROMOTE: "PROMOTE", SHADOW_MORE_DATA: "SHADOW_MORE_DATA", REJECT: "REJECT" };

function relativeDegradation(lossM0, lossM1) {
  // positif = M1 pire que M0 (loss plus haute)
  if (lossM0 === 0) return lossM1 === 0 ? 0 : Infinity;
  return (lossM1 - lossM0) / lossM0;
}

// input = {
//   n_oos, nll_m0, nll_m1,
//   ci_lower, ci_upper : bornes bootstrap du delta = loss_candidate -
//     loss_champion (CONVENTION OFFICIELLE UNIQUE, lib/lab/loss-delta.js -
//     ne jamais inverser). candidat confidemment MEILLEUR -> ci_upper<0 ;
//     candidat confidemment PIRE -> ci_lower>0 ; IC qui chevauche zero ->
//     inconclusif (SHADOW_MORE_DATA). PROMOTE exige donc implicitement
//     ci_upper<0 (seul cas ou ni CI_CONFIRMS_CANDIDATE_WORSE ni
//     CI_CROSSES_ZERO ne se declenchent, les trois cas etant exhaustifs et
//     mutuellement exclusifs pour un intervalle ci_lower<=ci_upper).
//   convergence_rate, boundary_hit_rate,
//   rho_stability: {std} (optionnel),
//   secondary: { ou25: {logloss_m0,logloss_m1}, btts: {...}, x12: {...} } (optionnel, cles libres),
//   low_score_diagnostics: sortie de lib/lab/metrics.js#lowScoreDiagnostics (optionnel),
// }
function evaluatePromotion(input) {
  const rejectReasons = [];
  const shadowReasons = [];
  const details = {};

  // --- REJECT-level : problemes structurels, plus de donnees ne les resoudra pas ---
  if (input.convergence_rate < MIN_CONVERGENCE_RATE) {
    rejectReasons.push(REASON.FITTER_NON_CONVERGENT);
    details.convergence_rate = input.convergence_rate;
  }
  if (input.boundary_hit_rate > MAX_BOUNDARY_HIT_RATE) {
    rejectReasons.push(REASON.RHO_ON_BOUNDARY);
    details.boundary_hit_rate = input.boundary_hit_rate;
  }
  if (input.rho_stability && typeof input.rho_stability.std === "number" && input.rho_stability.std > MAX_RHO_STD) {
    rejectReasons.push(REASON.RHO_UNSTABLE);
    details.rho_std = input.rho_stability.std;
  }
  // IC bootstrap entierement positif (ci_lower>0) = statistiquement
  // confiant que le candidat est PIRE (convention lossDelta) - REJECT,
  // pas SHADOW : plus de donnees ne renversera pas un signal deja net.
  if (input.ci_lower > 0) {
    rejectReasons.push(REASON.CI_CONFIRMS_CANDIDATE_WORSE);
    details.ci_lower = input.ci_lower;
    details.ci_upper = input.ci_upper;
  }

  const relativeGain = relativeDegradation(input.nll_m0, input.nll_m1) * -1; // gain = -(degradation)
  details.relative_gain = relativeGain;
  if (relativeGain < MIN_RELATIVE_GAIN) {
    rejectReasons.push(REASON.GAIN_BELOW_ECONOMIC_FLOOR);
  }

  if (input.secondary) {
    const degraded = [];
    for (const [market, { logloss_m0, logloss_m1 }] of Object.entries(input.secondary)) {
      const deg = relativeDegradation(logloss_m0, logloss_m1);
      if (deg > MAX_SECONDARY_DEGRADATION) degraded.push({ market, relative_degradation: deg });
    }
    if (degraded.length) {
      rejectReasons.push(REASON.SECONDARY_MARKET_DEGRADED);
      details.secondary_degraded = degraded;
    }
  }

  if (input.low_score_diagnostics) {
    const degraded = [];
    for (const [key, diag] of Object.entries(input.low_score_diagnostics)) {
      if (!diag || diag.count_observed < MIN_LOW_SCORE_COUNT_FOR_CHECK) continue;
      const deg = relativeDegradation(diag.nll_contribution_m0, diag.nll_contribution_m1);
      if (deg > MAX_LOW_SCORE_RELATIVE_DEGRADATION) degraded.push({ score: key, relative_degradation: deg });
    }
    if (degraded.length) {
      rejectReasons.push(REASON.LOW_SCORE_DEGRADED);
      details.low_score_degraded = degraded;
    }
  }

  // --- SHADOW-level : le signal n'est pas encore assez de donnees pour trancher ---
  if (input.n_oos < MIN_N_OOS) {
    shadowReasons.push(REASON.N_OOS_TOO_LOW);
    details.n_oos = input.n_oos;
  }
  if (input.ci_lower <= 0 && input.ci_upper >= 0) {
    shadowReasons.push(REASON.CI_CROSSES_ZERO);
    details.ci_lower = input.ci_lower;
    details.ci_upper = input.ci_upper;
  }

  if (rejectReasons.length) {
    return { status: STATUS.REJECT, reason_codes: rejectReasons, details };
  }
  if (shadowReasons.length) {
    return { status: STATUS.SHADOW_MORE_DATA, reason_codes: shadowReasons, details };
  }
  return { status: STATUS.PROMOTE, reason_codes: [], details };
}

module.exports = { evaluatePromotion, REASON, STATUS, MIN_N_OOS, MIN_CONVERGENCE_RATE, MAX_BOUNDARY_HIT_RATE, MIN_RELATIVE_GAIN, MAX_SECONDARY_DEGRADATION, MAX_RHO_STD };
