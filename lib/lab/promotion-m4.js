"use strict";
// EXP-004 (SPEC LAB PRO v1.0, M4 NB2) - regle de promotion DEDIEE. Seuils
// enregistres dans scripts/experiments/exp004_manifest.json AVANT tout
// calcul de performance, jamais modifies apres avoir vu un resultat.
//
// PROMOTE exige les 13 criteres de l'item 22 SIMULTANEMENT :
//   1. gain relatif NLL exact-score GLOBAL >= 0.50%
//   2. CI95_delta_NLL.upper < 0
//   3. convergence = 100% (tous les cutoffs)
//   4. kappa stable/identifiable (p95/p05<=10)
//   5. pas de KAPPA_POISSON_LIMIT (majorite des fits pousses vers la limite)
//   6. O/U2.5 log-loss non degrade
//   7. O/U3.5 log-loss ameliore
//   8. 5+ buts log-loss non degrade
//   9. LOW_SCORE_SET degradation <=0.10%
//   10. gain positif sur 2023-24 ET 2024-25 (pas une seule periode)
//   11. aucune fuite temporelle
//   12. mecanisme deterministe
//   13. COMMON_SUPPORT complet (760/760) ou exclusions expliquees/non biaisees
// Si gain interessant (>=seuil) mais CI non concluant, ET aucun autre
// critere structurel/seuil viole -> SHADOW_MORE_DATA. Sinon -> REJECT.
//
// CORRECTIF AUDIT (2026-09-05, EXP-004 premiere execution reelle) : la
// version precedente retournait au PREMIER critere structurel trouve
// (ex: PERIOD_HETEROGENEITY_FAIL) sans jamais verifier/combiner le gain
// et le CI, meme quand ces deux regles echouaient AUSSI independamment -
// un candidat pouvait donc echouer 3 regles pre-enregistrees distinctes
// et n'en voir persister qu'une seule. Desormais TOUTES les regles sont
// evaluees et TOUS les reason_codes applicables sont retournes ensemble
// (voir tests/lab-promotion-m4.test.js#"trois raisons simultanees").

const MIN_GLOBAL_RELATIVE_GAIN = 0.005; // 0.50%
const MAX_LOW_SCORE_SET_DEGRADATION = 0.001; // 0.10%
const MAX_KAPPA_P95_P05_RATIO = 10;

const REASON = {
  GAIN_BELOW_PROMOTION_THRESHOLD: "GAIN_BELOW_PROMOTION_THRESHOLD",
  BOOTSTRAP_CI_CROSSES_ZERO: "BOOTSTRAP_CI_CROSSES_ZERO",
  CONVERGENCE_INCOMPLETE: "CONVERGENCE_INCOMPLETE",
  KAPPA_UNSTABLE: "KAPPA_UNSTABLE",
  KAPPA_POISSON_LIMIT: "KAPPA_POISSON_LIMIT",
  TAIL_OBJECTIVE_NOT_CONFIRMED: "TAIL_OBJECTIVE_NOT_CONFIRMED",
  LOW_SCORE_DAMAGE: "LOW_SCORE_DAMAGE",
  PERIOD_HETEROGENEITY_FAIL: "PERIOD_HETEROGENEITY_FAIL",
  TEMPORAL_LEAKAGE_DETECTED: "TEMPORAL_LEAKAGE_DETECTED",
  MECHANISM_NON_DETERMINISTIC: "MECHANISM_NON_DETERMINISTIC",
  COMMON_SUPPORT_INCOMPLETE: "COMMON_SUPPORT_INCOMPLETE",
  GAIN_PROMISING_BUT_UNDERPOWERED: "GAIN_PROMISING_BUT_UNDERPOWERED",
};

const STATUS = { PROMOTE: "PROMOTE", SHADOW_MORE_DATA: "SHADOW_MORE_DATA", REJECT: "REJECT" };

// input = {
//   globalRelativeGain, globalCiLower, globalCiUpper,     // CI95 du delta NLL (unite=NLL), convention delta=NLL_M4-NLL_M2
//   convergenceRate,                                       // fraction de cutoffs avec fit convergence=true
//   kappaP95P05Ratio, kappaPoissonLimitMajority,            // stabilite/identifiabilite kappa
//   ou25Degraded, ou35Improved, fivePlusDegraded,           // diagnostics tails (item 16)
//   lowScoreSetRelativeDegradation,                         // item 17
//   season2023RelativeGain, season2024RelativeGain,         // item 19
//   temporalLeakageDetected, mechanismDeterministic,        // item 21
//   commonSupportComplete,                                  // item 20 (760/760) - false seulement si non explique/biaise
// }
function evaluatePromotionM4(input) {
  const details = {
    global_relative_gain: input.globalRelativeGain,
    global_ci_lower: input.globalCiLower,
    global_ci_upper: input.globalCiUpper,
    convergence_rate: input.convergenceRate,
    kappa_p95_p05_ratio: input.kappaP95P05Ratio,
    kappa_poisson_limit_majority: input.kappaPoissonLimitMajority,
    ou25_degraded: input.ou25Degraded,
    ou35_improved: input.ou35Improved,
    five_plus_degraded: input.fivePlusDegraded,
    low_score_set_relative_degradation: input.lowScoreSetRelativeDegradation,
    season_2023_relative_gain: input.season2023RelativeGain,
    season_2024_relative_gain: input.season2024RelativeGain,
    common_support_complete: input.commonSupportComplete,
    min_global_relative_gain: MIN_GLOBAL_RELATIVE_GAIN,
    max_low_score_set_degradation: MAX_LOW_SCORE_SET_DEGRADATION,
    max_kappa_p95_p05_ratio: MAX_KAPPA_P95_P05_RATIO,
  };

  // TOUTES les regles sont evaluees independamment - aucun court-circuit
  // qui masquerait une regle echouee derriere une autre deja trouvee.
  const reasons = [];
  const gainOk = input.globalRelativeGain >= MIN_GLOBAL_RELATIVE_GAIN;
  const ciOk = input.globalCiUpper < 0;

  if (!gainOk) reasons.push(REASON.GAIN_BELOW_PROMOTION_THRESHOLD);
  if (!ciOk) reasons.push(REASON.BOOTSTRAP_CI_CROSSES_ZERO);
  if (input.temporalLeakageDetected) reasons.push(REASON.TEMPORAL_LEAKAGE_DETECTED);
  if (!input.mechanismDeterministic) reasons.push(REASON.MECHANISM_NON_DETERMINISTIC);
  if (input.convergenceRate < 1) reasons.push(REASON.CONVERGENCE_INCOMPLETE);
  if (input.kappaP95P05Ratio > MAX_KAPPA_P95_P05_RATIO) reasons.push(REASON.KAPPA_UNSTABLE);
  if (input.kappaPoissonLimitMajority) reasons.push(REASON.KAPPA_POISSON_LIMIT);
  if (input.ou25Degraded || !input.ou35Improved || input.fivePlusDegraded) reasons.push(REASON.TAIL_OBJECTIVE_NOT_CONFIRMED);
  if (input.lowScoreSetRelativeDegradation > MAX_LOW_SCORE_SET_DEGRADATION) reasons.push(REASON.LOW_SCORE_DAMAGE);
  if (!(input.season2023RelativeGain > 0) || !(input.season2024RelativeGain > 0)) reasons.push(REASON.PERIOD_HETEROGENEITY_FAIL);
  if (!input.commonSupportComplete) reasons.push(REASON.COMMON_SUPPORT_INCOMPLETE);

  if (reasons.length === 0) {
    return { status: STATUS.PROMOTE, reason_codes: [], details };
  }

  // SHADOW_MORE_DATA UNIQUEMENT quand la SEULE regle en echec est le CI
  // non concluant alors que le gain est deja au-dessus du seuil et
  // qu'aucune autre regle structurelle/seuil n'echoue - sinon REJECT
  // avec la liste complete des raisons.
  if (reasons.length === 1 && reasons[0] === REASON.BOOTSTRAP_CI_CROSSES_ZERO && gainOk) {
    return { status: STATUS.SHADOW_MORE_DATA, reason_codes: [REASON.GAIN_PROMISING_BUT_UNDERPOWERED], details };
  }

  return { status: STATUS.REJECT, reason_codes: reasons, details };
}

module.exports = { evaluatePromotionM4, REASON, STATUS, MIN_GLOBAL_RELATIVE_GAIN, MAX_LOW_SCORE_SET_DEGRADATION, MAX_KAPPA_P95_P05_RATIO };
