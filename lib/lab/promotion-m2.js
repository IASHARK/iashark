"use strict";
// EXP-002 (SPEC LAB PRO v1.0, M2) - regle de promotion DEDIEE, distincte
// de lib/promotion.js (specifique a M0-vs-M1). Seuils enregistres dans
// scripts/experiments/exp002_manifest.json AVANT tout calcul de
// performance (methodology.promotion_thresholds), jamais modifies apres
// avoir vu un resultat.
//
// PROMOTE exige les 6 criteres SIMULTANEMENT :
//   1. gain NLL EARLY >= 0.50% (relatif, bucket EARLY uniquement)
//   2. bootstrap CI95 EARLY upper < 0 (delta=NLL_M2-NLL_M0, negatif=M2 meilleur)
//   3. degradation NLL GLOBAL <= 0.10%
//   4. aucune violation de l'invariant LATE
//   5. aucune fuite temporelle detectee
//   6. mecanisme deterministe
// Si gain EARLY interessant (>=seuil) mais CI non concluant -> SHADOW_MORE_DATA.
// Si gain EARLY insuffisant (ou degradation) -> REJECT.

const MIN_EARLY_RELATIVE_GAIN = 0.005; // 0.50%
const MAX_GLOBAL_RELATIVE_DEGRADATION = 0.001; // 0.10%

const REASON = {
  EARLY_GAIN_BELOW_THRESHOLD: "EARLY_GAIN_BELOW_THRESHOLD",
  EARLY_CI_CROSSES_ZERO_OR_POSITIVE: "EARLY_CI_CROSSES_ZERO_OR_POSITIVE",
  GLOBAL_DEGRADATION_EXCEEDS_LIMIT: "GLOBAL_DEGRADATION_EXCEEDS_LIMIT",
  LATE_INVARIANT_VIOLATED: "LATE_INVARIANT_VIOLATED",
  TEMPORAL_LEAKAGE_DETECTED: "TEMPORAL_LEAKAGE_DETECTED",
  MECHANISM_NON_DETERMINISTIC: "MECHANISM_NON_DETERMINISTIC",
  EARLY_GAIN_PROMISING_BUT_UNDERPOWERED: "EARLY_GAIN_PROMISING_BUT_UNDERPOWERED",
};

const STATUS = { PROMOTE: "PROMOTE", SHADOW_MORE_DATA: "SHADOW_MORE_DATA", REJECT: "REJECT" };

// input = {
//   earlyRelativeGain,          // (nll_m0_early - nll_m2_early) / nll_m0_early - positif = M2 meilleur
//   earlyCiLower, earlyCiUpper, // bootstrap (bloc semaine x league-season) du delta=NLL_M2-NLL_M0 sur EARLY
//   globalRelativeDegradation,  // (nll_m2_global - nll_m0_global) / nll_m0_global - positif = M2 pire
//   lateInvariantViolated,      // bool - au moins un match n_home>=16&&n_away>=16 avec abs(P_M2-P_M0)>1e-12
//   temporalLeakageDetected,    // bool
//   mechanismDeterministic,     // bool - memes entrees -> memes sorties, verifie
// }
function evaluatePromotionM2(input) {
  const details = {
    early_relative_gain: input.earlyRelativeGain,
    early_ci_lower: input.earlyCiLower,
    early_ci_upper: input.earlyCiUpper,
    global_relative_degradation: input.globalRelativeDegradation,
    min_early_relative_gain: MIN_EARLY_RELATIVE_GAIN,
    max_global_relative_degradation: MAX_GLOBAL_RELATIVE_DEGRADATION,
  };

  // --- REJECT-level structurel : ces problemes ne se resolvent jamais avec plus de donnees ---
  const structuralReasons = [];
  if (input.lateInvariantViolated) structuralReasons.push(REASON.LATE_INVARIANT_VIOLATED);
  if (input.temporalLeakageDetected) structuralReasons.push(REASON.TEMPORAL_LEAKAGE_DETECTED);
  if (!input.mechanismDeterministic) structuralReasons.push(REASON.MECHANISM_NON_DETERMINISTIC);
  if (input.globalRelativeDegradation > MAX_GLOBAL_RELATIVE_DEGRADATION) structuralReasons.push(REASON.GLOBAL_DEGRADATION_EXCEEDS_LIMIT);
  if (structuralReasons.length) {
    return { status: STATUS.REJECT, reason_codes: structuralReasons, details };
  }

  const gainOk = input.earlyRelativeGain >= MIN_EARLY_RELATIVE_GAIN;
  const ciOk = input.earlyCiUpper < 0;

  if (gainOk && ciOk) {
    return { status: STATUS.PROMOTE, reason_codes: [], details };
  }
  if (!gainOk) {
    return { status: STATUS.REJECT, reason_codes: [REASON.EARLY_GAIN_BELOW_THRESHOLD], details };
  }
  // gainOk mais CI non concluant (traverse zero ou entierement positif)
  return { status: STATUS.SHADOW_MORE_DATA, reason_codes: [REASON.EARLY_GAIN_PROMISING_BUT_UNDERPOWERED], details };
}

module.exports = { evaluatePromotionM2, REASON, STATUS, MIN_EARLY_RELATIVE_GAIN, MAX_GLOBAL_RELATIVE_DEGRADATION };
