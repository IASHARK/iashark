"use strict";
// EXP-005 - regle de promotion dediee M5 (protocole amende : seuil 0.25%,
// heterogeneite non-binaire). Chaque cas isole une seule condition, plus
// un test dedie de cumul (item 24).

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePromotionM5, REASON, DIAGNOSTIC, STATUS } = require("../lib/lab/promotion-m5.js");

function excellentInput(overrides = {}) {
  return {
    globalRelativeGain: 0.005, // 0.5%, au-dessus du seuil 0.25%
    globalCiLower: -0.02, globalCiUpper: -0.005,
    convergenceRate: 1,
    kappaP95P05Ratio: 3,
    kappaM2LimitMajority: false,
    secondaryMarketDamage: false,
    lowScoreSetRelativeDegradation: 0.0,
    tailConstructionPass: true,
    seasons: {
      "2023": { relativeGain: 0.003, ciLower: -0.01, ciUpper: -0.001 },
      "2024": { relativeGain: 0.007, ciLower: -0.02, ciUpper: -0.002 },
    },
    seasonDifferenceCiExcludesZero: false,
    temporalLeakageDetected: false,
    mechanismDeterministic: true,
    commonSupportComplete: true,
    ...overrides,
  };
}

test("1. tous les criteres au vert -> PROMOTE", () => {
  const res = evaluatePromotionM5(excellentInput());
  assert.equal(res.status, STATUS.PROMOTE);
  assert.deepEqual(res.reason_codes, []);
});

test("2. gain 0.10% (sous le seuil 0.25%) mais CI favorable -> SHADOW_MORE_DATA (pas REJECT, pas PROMOTE)", () => {
  const res = evaluatePromotionM5(excellentInput({ globalRelativeGain: 0.001 }));
  assert.equal(res.status, STATUS.SHADOW_MORE_DATA);
  assert.ok(res.reason_codes.includes(REASON.GAIN_BELOW_PROMOTION_THRESHOLD));
});

test("3. gain negatif -> REJECT direct, jamais SHADOW", () => {
  const res = evaluatePromotionM5(excellentInput({ globalRelativeGain: -0.001, globalCiLower: 0.001, globalCiUpper: 0.02 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.GAIN_BELOW_PROMOTION_THRESHOLD));
  assert.ok(res.reason_codes.includes(REASON.BOOTSTRAP_CI_CROSSES_ZERO));
});

test("4. CI traverse zero (gain positif >=0.25% mais CI non concluant) -> REJECT (BOOTSTRAP_CI_CROSSES_ZERO)", () => {
  const res = evaluatePromotionM5(excellentInput({ globalCiLower: -0.01, globalCiUpper: 0.003 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.BOOTSTRAP_CI_CROSSES_ZERO));
});

test("5. une saison a -0.01% (negatif mais SANS preuve materielle) -> PROMOTE quand meme, diagnostic PERIOD_HETEROGENEITY_WARN seulement (regle amendee, PAS un rejet automatique comme sous l'ancienne regle M4)", () => {
  const res = evaluatePromotionM5(excellentInput({ seasons: { "2023": { relativeGain: -0.0001, ciLower: -0.01, ciUpper: 0.005 }, "2024": { relativeGain: 0.007, ciLower: -0.02, ciUpper: -0.002 } } }));
  assert.equal(res.status, STATUS.PROMOTE);
  assert.deepEqual(res.reason_codes, []);
  assert.ok(res.diagnostics.includes(`${DIAGNOSTIC.PERIOD_HETEROGENEITY_WARN}:2023`));
});

test("6. une saison a relative_gain<=-0.50% -> REJECT (PERIOD_MATERIAL_DEGRADATION), preuve materielle (regle A)", () => {
  const res = evaluatePromotionM5(excellentInput({ seasons: { "2023": { relativeGain: -0.006, ciLower: -0.02, ciUpper: 0.001 }, "2024": { relativeGain: 0.007, ciLower: -0.02, ciUpper: -0.002 } } }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.PERIOD_MATERIAL_DEGRADATION));
});

test("7. une saison a CI95.lower>0 -> REJECT (PERIOD_MATERIAL_DEGRADATION), preuve materielle (regle B)", () => {
  const res = evaluatePromotionM5(excellentInput({ seasons: { "2023": { relativeGain: -0.001, ciLower: 0.0005, ciUpper: 0.01 }, "2024": { relativeGain: 0.007, ciLower: -0.02, ciUpper: -0.002 } } }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.PERIOD_MATERIAL_DEGRADATION));
});

test("8. convergence <100% -> REJECT (CONVERGENCE_INCOMPLETE)", () => {
  const res = evaluatePromotionM5(excellentInput({ convergenceRate: 0.99 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.CONVERGENCE_INCOMPLETE));
});

test("9. kappa instable (p95/p05>10) -> REJECT (KAPPA_UNSTABLE)", () => {
  const res = evaluatePromotionM5(excellentInput({ kappaP95P05Ratio: 15 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.KAPPA_UNSTABLE));
});

test("10. majorite des fits a la limite M2 -> REJECT (KAPPA_M2_LIMIT), M5 ne merite pas sa complexite", () => {
  const res = evaluatePromotionM5(excellentInput({ kappaM2LimitMajority: true }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.KAPPA_M2_LIMIT));
});

test("11. degradation marche secondaire -> REJECT (SECONDARY_MARKET_DAMAGE)", () => {
  const res = evaluatePromotionM5(excellentInput({ secondaryMarketDamage: true }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.SECONDARY_MARKET_DAMAGE));
});

test("12. LOW_SCORE_SET degrade >0.10% -> REJECT (LOW_SCORE_DAMAGE)", () => {
  const res = evaluatePromotionM5(excellentInput({ lowScoreSetRelativeDegradation: 0.002 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.LOW_SCORE_DAMAGE));
});

test("13. construction de la queue echouee -> REJECT (TAIL_CONSTRUCTION_FAILED)", () => {
  const res = evaluatePromotionM5(excellentInput({ tailConstructionPass: false }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.TAIL_CONSTRUCTION_FAILED));
});

test("14. fuite temporelle -> REJECT (TEMPORAL_LEAKAGE_DETECTED)", () => {
  const res = evaluatePromotionM5(excellentInput({ temporalLeakageDetected: true }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.TEMPORAL_LEAKAGE_DETECTED));
});

test("15. non deterministe -> REJECT (MECHANISM_NON_DETERMINISTIC)", () => {
  const res = evaluatePromotionM5(excellentInput({ mechanismDeterministic: false }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.MECHANISM_NON_DETERMINISTIC));
});

test("16. COMMON_SUPPORT incomplet -> REJECT (COMMON_SUPPORT_INCOMPLETE)", () => {
  const res = evaluatePromotionM5(excellentInput({ commonSupportComplete: false }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.COMMON_SUPPORT_INCOMPLETE));
});

test("REASONS CUMULATIFS (item 24, obligatoire) : plusieurs criteres echouent SIMULTANEMENT -> TOUS les reason_codes apparaissent ensemble, jamais un seul (correctif applique des le depart pour M5, contrairement au bug initial de promotion-m4.js)", () => {
  const res = evaluatePromotionM5(excellentInput({
    globalRelativeGain: 0.001, // sous le seuil
    globalCiUpper: 0.002, // traverse zero
    kappaM2LimitMajority: true,
    seasons: { "2023": { relativeGain: -0.006, ciLower: -0.02, ciUpper: 0.001 }, "2024": { relativeGain: 0.007, ciLower: -0.02, ciUpper: -0.002 } },
  }));
  assert.equal(res.status, STATUS.REJECT);
  assert.equal(res.reason_codes.length, 4, `attendu 4 raisons, obtenu ${JSON.stringify(res.reason_codes)}`);
  assert.ok(res.reason_codes.includes(REASON.GAIN_BELOW_PROMOTION_THRESHOLD));
  assert.ok(res.reason_codes.includes(REASON.BOOTSTRAP_CI_CROSSES_ZERO));
  assert.ok(res.reason_codes.includes(REASON.KAPPA_M2_LIMIT));
  assert.ok(res.reason_codes.includes(REASON.PERIOD_MATERIAL_DEGRADATION));
});

test("diagnostic PERIOD_HETEROGENEITY_SIGNAL : bootstrap(diff saisons) exclut zero -> rapporte en diagnostic, jamais un veto (candidat toujours PROMOTE si tout le reste est vert)", () => {
  const res = evaluatePromotionM5(excellentInput({ seasonDifferenceCiExcludesZero: true }));
  assert.equal(res.status, STATUS.PROMOTE);
  assert.ok(res.diagnostics.includes(DIAGNOSTIC.PERIOD_HETEROGENEITY_SIGNAL));
});

test("determinisme : memes entrees -> meme decision", () => {
  const input = excellentInput();
  assert.deepEqual(evaluatePromotionM5(input), evaluatePromotionM5(input));
});
