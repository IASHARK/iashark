"use strict";
// EXP-005 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - regle de promotion
// DEDIEE, sous le protocole amende (scripts/experiments/exp005_protocol_amendment.json,
// hash=c5c1e45bc3d1fd63547512433227f640419a64b309d0cfc48e38c1acf2fe43b9,
// committe AVANT tout resultat) :
//   - seuil primaire de gain global : 0.25% (abaisse depuis 0.50% pour
//     M4, justifie par la faible complexite ajoutee - un seul parametre
//     kappa, architecture qui NESTE M2)
//   - heterogeneite saisonniere NON BINAIRE : hard fail (PERIOD_MATERIAL_DEGRADATION)
//     uniquement si une saison montre relative_gain<=-0.50% OU CI95.lower>0
//     (preuve bootstrap reelle de degradation) - une saison simplement
//     negative sans preuve materielle est un diagnostic
//     (PERIOD_HETEROGENEITY_WARN), jamais un veto automatique
//
// TOUS les reason_codes applicables sont CUMULES et retournes ensemble,
// JAMAIS un court-circuit sur le premier trouve (correctif applique a
// promotion-m4.js le 2026-09-05 apres audit du premier resultat EXP-004
// reel, reconduit et teste explicitement ici DES LE DEPART - voir
// tests/lab-promotion-m5.test.js#"reasons cumulatifs").

const MIN_GLOBAL_RELATIVE_GAIN = 0.0025; // 0.25%
const MAX_LOW_SCORE_SET_DEGRADATION = 0.001; // 0.10%
const MAX_SECONDARY_MARKET_DEGRADATION = 0.001; // 0.10%
const MAX_KAPPA_P95_P05_RATIO = 10;
const PERIOD_MATERIAL_DEGRADATION_GAIN_THRESHOLD = -0.005; // -0.50%

const REASON = {
  GAIN_BELOW_PROMOTION_THRESHOLD: "GAIN_BELOW_PROMOTION_THRESHOLD",
  BOOTSTRAP_CI_CROSSES_ZERO: "BOOTSTRAP_CI_CROSSES_ZERO",
  PERIOD_MATERIAL_DEGRADATION: "PERIOD_MATERIAL_DEGRADATION",
  CONVERGENCE_INCOMPLETE: "CONVERGENCE_INCOMPLETE",
  KAPPA_UNSTABLE: "KAPPA_UNSTABLE",
  KAPPA_M2_LIMIT: "KAPPA_M2_LIMIT",
  SECONDARY_MARKET_DAMAGE: "SECONDARY_MARKET_DAMAGE",
  LOW_SCORE_DAMAGE: "LOW_SCORE_DAMAGE",
  TAIL_CONSTRUCTION_FAILED: "TAIL_CONSTRUCTION_FAILED",
  TEMPORAL_LEAKAGE_DETECTED: "TEMPORAL_LEAKAGE_DETECTED",
  MECHANISM_NON_DETERMINISTIC: "MECHANISM_NON_DETERMINISTIC",
  COMMON_SUPPORT_INCOMPLETE: "COMMON_SUPPORT_INCOMPLETE",
};

const DIAGNOSTIC = {
  PERIOD_HETEROGENEITY_WARN: "PERIOD_HETEROGENEITY_WARN",
  PERIOD_HETEROGENEITY_SIGNAL: "PERIOD_HETEROGENEITY_SIGNAL",
};

const STATUS = { PROMOTE: "PROMOTE", SHADOW_MORE_DATA: "SHADOW_MORE_DATA", REJECT: "REJECT" };

// input = {
//   globalRelativeGain, globalCiLower, globalCiUpper,   // CI95 du delta NLL, delta=NLL_M5-NLL_M2
//   convergenceRate, kappaP95P05Ratio, kappaM2LimitMajority,
//   secondaryMarketDamage,                               // bool precalcule (1X2/O-U2.5/BTTS, item 20)
//   lowScoreSetRelativeDegradation,
//   tailConstructionPass,                                // bool - false si M5_TAIL_TRUNCATION_FAILURE/M5_INVALID_NORMALIZATION observe sur au moins une prediction
//   seasons: { "2023": {relativeGain, ciLower, ciUpper}, "2024": {relativeGain, ciLower, ciUpper} },
//   seasonDifferenceCiExcludesZero,                      // bool - bootstrap(mean_delta_2024-mean_delta_2023) exclut zero (item 18)
//   temporalLeakageDetected, mechanismDeterministic, commonSupportComplete,
// }
function evaluatePromotionM5(input) {
  const details = {
    global_relative_gain: input.globalRelativeGain,
    global_ci_lower: input.globalCiLower,
    global_ci_upper: input.globalCiUpper,
    convergence_rate: input.convergenceRate,
    kappa_p95_p05_ratio: input.kappaP95P05Ratio,
    kappa_m2_limit_majority: input.kappaM2LimitMajority,
    secondary_market_damage: input.secondaryMarketDamage,
    low_score_set_relative_degradation: input.lowScoreSetRelativeDegradation,
    tail_construction_pass: input.tailConstructionPass,
    seasons: input.seasons,
    season_difference_ci_excludes_zero: input.seasonDifferenceCiExcludesZero,
    common_support_complete: input.commonSupportComplete,
    min_global_relative_gain: MIN_GLOBAL_RELATIVE_GAIN,
    max_low_score_set_degradation: MAX_LOW_SCORE_SET_DEGRADATION,
    max_secondary_market_degradation: MAX_SECONDARY_MARKET_DEGRADATION,
    max_kappa_p95_p05_ratio: MAX_KAPPA_P95_P05_RATIO,
  };

  const gainOk = input.globalRelativeGain >= MIN_GLOBAL_RELATIVE_GAIN;
  const ciOk = input.globalCiUpper < 0;

  const reasons = [];
  if (!gainOk) reasons.push(REASON.GAIN_BELOW_PROMOTION_THRESHOLD);
  if (!ciOk) reasons.push(REASON.BOOTSTRAP_CI_CROSSES_ZERO);
  if (input.temporalLeakageDetected) reasons.push(REASON.TEMPORAL_LEAKAGE_DETECTED);
  if (!input.mechanismDeterministic) reasons.push(REASON.MECHANISM_NON_DETERMINISTIC);
  if (input.convergenceRate < 1) reasons.push(REASON.CONVERGENCE_INCOMPLETE);
  if (input.kappaP95P05Ratio > MAX_KAPPA_P95_P05_RATIO) reasons.push(REASON.KAPPA_UNSTABLE);
  if (input.kappaM2LimitMajority) reasons.push(REASON.KAPPA_M2_LIMIT);
  if (input.secondaryMarketDamage) reasons.push(REASON.SECONDARY_MARKET_DAMAGE);
  if (input.lowScoreSetRelativeDegradation > MAX_LOW_SCORE_SET_DEGRADATION) reasons.push(REASON.LOW_SCORE_DAMAGE);
  if (!input.tailConstructionPass) reasons.push(REASON.TAIL_CONSTRUCTION_FAILED);
  if (!input.commonSupportComplete) reasons.push(REASON.COMMON_SUPPORT_INCOMPLETE);

  const diagnostics = [];
  const seasonMaterialDegradations = [];
  for (const [label, season] of Object.entries(input.seasons || {})) {
    const material = season.relativeGain <= PERIOD_MATERIAL_DEGRADATION_GAIN_THRESHOLD || season.ciLower > 0;
    if (material) seasonMaterialDegradations.push(label);
    else if (season.relativeGain < 0) diagnostics.push(`${DIAGNOSTIC.PERIOD_HETEROGENEITY_WARN}:${label}`);
  }
  if (seasonMaterialDegradations.length) reasons.push(REASON.PERIOD_MATERIAL_DEGRADATION);
  if (input.seasonDifferenceCiExcludesZero) diagnostics.push(DIAGNOSTIC.PERIOD_HETEROGENEITY_SIGNAL);

  details.season_material_degradations = seasonMaterialDegradations;

  if (reasons.length === 0) {
    return { status: STATUS.PROMOTE, reason_codes: [], diagnostics, details };
  }

  // SHADOW_MORE_DATA (item 25) : UNIQUEMENT quand la SEULE raison de
  // rejet est le gain sous le seuil, alors que le CI est deja favorable
  // et le gain global reste positif (ou une heterogeneite non
  // materielle coexiste, deja capturee en diagnostic, pas en reason) -
  // jamais une promotion sous 0.25% quel que soit le cas.
  const onlyGainBelowThreshold = reasons.length === 1 && reasons[0] === REASON.GAIN_BELOW_PROMOTION_THRESHOLD;
  if (onlyGainBelowThreshold && ciOk && input.globalRelativeGain > 0) {
    return { status: STATUS.SHADOW_MORE_DATA, reason_codes: reasons, diagnostics, details };
  }

  return { status: STATUS.REJECT, reason_codes: reasons, diagnostics, details };
}

module.exports = {
  evaluatePromotionM5, REASON, DIAGNOSTIC, STATUS,
  MIN_GLOBAL_RELATIVE_GAIN, MAX_LOW_SCORE_SET_DEGRADATION, MAX_SECONDARY_MARKET_DEGRADATION,
  MAX_KAPPA_P95_P05_RATIO, PERIOD_MATERIAL_DEGRADATION_GAIN_THRESHOLD,
};
