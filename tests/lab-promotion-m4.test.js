"use strict";
// EXP-004 - regle de promotion dediee M4. Chaque cas isole une seule condition.

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePromotionM4, REASON, STATUS } = require("../lib/lab/promotion-m4.js");

function excellentInput(overrides = {}) {
  return {
    globalRelativeGain: 0.01, // 1%, au-dessus du seuil 0.5%
    globalCiLower: -0.02, globalCiUpper: -0.005, // entierement negatif
    convergenceRate: 1,
    kappaP95P05Ratio: 3,
    kappaPoissonLimitMajority: false,
    ou25Degraded: false,
    ou35Improved: true,
    fivePlusDegraded: false,
    lowScoreSetRelativeDegradation: 0.0,
    season2023RelativeGain: 0.01,
    season2024RelativeGain: 0.005,
    temporalLeakageDetected: false,
    mechanismDeterministic: true,
    commonSupportComplete: true,
    ...overrides,
  };
}

test("1. tous les criteres au vert -> PROMOTE", () => {
  const res = evaluatePromotionM4(excellentInput());
  assert.equal(res.status, STATUS.PROMOTE);
  assert.deepEqual(res.reason_codes, []);
});

test("2. gain global de 0.10% (sous le seuil 0.50%) -> REJECT (GAIN_BELOW_PROMOTION_THRESHOLD)", () => {
  const res = evaluatePromotionM4(excellentInput({ globalRelativeGain: 0.001 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.GAIN_BELOW_PROMOTION_THRESHOLD));
});

test("3. gain suffisant mais CI traverse zero -> SHADOW_MORE_DATA (GAIN_PROMISING_BUT_UNDERPOWERED)", () => {
  const res = evaluatePromotionM4(excellentInput({ globalCiLower: -0.01, globalCiUpper: 0.003 }));
  assert.equal(res.status, STATUS.SHADOW_MORE_DATA);
  assert.ok(res.reason_codes.includes(REASON.GAIN_PROMISING_BUT_UNDERPOWERED));
});

test("4. convergence <100% -> REJECT (CONVERGENCE_INCOMPLETE), meme si le gain est excellent", () => {
  const res = evaluatePromotionM4(excellentInput({ convergenceRate: 0.98 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.CONVERGENCE_INCOMPLETE));
});

test("5. kappa instable (p95/p05>10) -> REJECT (KAPPA_UNSTABLE)", () => {
  const res = evaluatePromotionM4(excellentInput({ kappaP95P05Ratio: 15 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.KAPPA_UNSTABLE));
});

test("6. majorite des fits a la limite Poisson -> REJECT (KAPPA_POISSON_LIMIT), pas un succes NB", () => {
  const res = evaluatePromotionM4(excellentInput({ kappaPoissonLimitMajority: true }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.KAPPA_POISSON_LIMIT));
});

test("7. O/U2.5 degrade -> REJECT (TAIL_OBJECTIVE_NOT_CONFIRMED)", () => {
  const res = evaluatePromotionM4(excellentInput({ ou25Degraded: true }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.TAIL_OBJECTIVE_NOT_CONFIRMED));
});

test("8. O/U3.5 non ameliore -> REJECT (TAIL_OBJECTIVE_NOT_CONFIRMED) - M4 existe specifiquement pour ca", () => {
  const res = evaluatePromotionM4(excellentInput({ ou35Improved: false }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.TAIL_OBJECTIVE_NOT_CONFIRMED));
});

test("9. 5+ buts degrade -> REJECT (TAIL_OBJECTIVE_NOT_CONFIRMED)", () => {
  const res = evaluatePromotionM4(excellentInput({ fivePlusDegraded: true }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.TAIL_OBJECTIVE_NOT_CONFIRMED));
});

test("10. LOW_SCORE_SET degrade de 0.20% (au-dessus de 0.10%) -> REJECT (LOW_SCORE_DAMAGE)", () => {
  const res = evaluatePromotionM4(excellentInput({ lowScoreSetRelativeDegradation: 0.002 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.LOW_SCORE_DAMAGE));
});

test("11. une seule saison negative -> REJECT (PERIOD_HETEROGENEITY_FAIL)", () => {
  const res = evaluatePromotionM4(excellentInput({ season2024RelativeGain: -0.001 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.PERIOD_HETEROGENEITY_FAIL));
});

test("12. fuite temporelle detectee -> REJECT (TEMPORAL_LEAKAGE_DETECTED)", () => {
  const res = evaluatePromotionM4(excellentInput({ temporalLeakageDetected: true }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.TEMPORAL_LEAKAGE_DETECTED));
});

test("13. mecanisme non deterministe -> REJECT (MECHANISM_NON_DETERMINISTIC)", () => {
  const res = evaluatePromotionM4(excellentInput({ mechanismDeterministic: false }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.MECHANISM_NON_DETERMINISTIC));
});

test("14. COMMON_SUPPORT incomplet non explique -> REJECT (COMMON_SUPPORT_INCOMPLETE)", () => {
  const res = evaluatePromotionM4(excellentInput({ commonSupportComplete: false }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.COMMON_SUPPORT_INCOMPLETE));
});

test("gain global negatif (M4 pire) -> REJECT direct, jamais SHADOW", () => {
  const res = evaluatePromotionM4(excellentInput({ globalRelativeGain: -0.02, globalCiLower: 0.01, globalCiUpper: 0.03 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.GAIN_BELOW_PROMOTION_THRESHOLD));
});

test("plusieurs raisons structurelles simultanees -> toutes rapportees", () => {
  const res = evaluatePromotionM4(excellentInput({ temporalLeakageDetected: true, mechanismDeterministic: false, kappaPoissonLimitMajority: true }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.TEMPORAL_LEAKAGE_DETECTED));
  assert.ok(res.reason_codes.includes(REASON.MECHANISM_NON_DETERMINISTIC));
  assert.ok(res.reason_codes.includes(REASON.KAPPA_POISSON_LIMIT));
});

test("CORRECTIF AUDIT EXP-004 : un candidat qui rate le seuil de gain, a une CI traversant zero, ET echoue l'heterogeneite retourne LES TROIS reason_codes ensemble, pas seulement le premier trouve", () => {
  // Reproduit exactement la configuration reelle EXP-004 (avant correctif, seul PERIOD_HETEROGENEITY_FAIL etait rapporte).
  const res = evaluatePromotionM4(excellentInput({
    globalRelativeGain: 0.00162, // 0.162% < seuil 0.50%
    globalCiLower: -0.0152, globalCiUpper: 0.0043, // traverse zero (upper>0)
    season2023RelativeGain: -0.000053, // negatif
    season2024RelativeGain: 0.00334, // positif - une seule saison negative suffit
  }));
  assert.equal(res.status, STATUS.REJECT);
  assert.equal(res.reason_codes.length, 3, `attendu exactement 3 raisons, obtenu ${JSON.stringify(res.reason_codes)}`);
  assert.ok(res.reason_codes.includes(REASON.GAIN_BELOW_PROMOTION_THRESHOLD));
  assert.ok(res.reason_codes.includes(REASON.BOOTSTRAP_CI_CROSSES_ZERO));
  assert.ok(res.reason_codes.includes(REASON.PERIOD_HETEROGENEITY_FAIL));
});

test("determinisme : memes entrees -> meme decision", () => {
  const input = excellentInput();
  assert.deepEqual(evaluatePromotionM4(input), evaluatePromotionM4(input));
});
