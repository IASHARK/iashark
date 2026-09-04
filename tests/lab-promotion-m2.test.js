"use strict";
// EXP-002 - regle de promotion dediee M2. Chaque cas isole une seule condition.

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePromotionM2, REASON, STATUS } = require("../lib/lab/promotion-m2.js");

function excellentInput(overrides = {}) {
  return {
    earlyRelativeGain: 0.01, // 1%, au-dessus du seuil 0.5%
    earlyCiLower: -0.02, earlyCiUpper: -0.005, // entierement negatif
    globalRelativeDegradation: 0.0, // aucune degradation
    lateInvariantViolated: false,
    temporalLeakageDetected: false,
    mechanismDeterministic: true,
    ...overrides,
  };
}

test("1. tous les criteres au vert -> PROMOTE", () => {
  const res = evaluatePromotionM2(excellentInput());
  assert.equal(res.status, STATUS.PROMOTE);
  assert.deepEqual(res.reason_codes, []);
});

test("2. gain EARLY de 0.10% (sous le seuil 0.50%) -> REJECT (EARLY_GAIN_BELOW_THRESHOLD)", () => {
  const res = evaluatePromotionM2(excellentInput({ earlyRelativeGain: 0.001 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.EARLY_GAIN_BELOW_THRESHOLD));
});

test("3. gain EARLY suffisant mais CI traverse zero -> SHADOW_MORE_DATA (EARLY_GAIN_PROMISING_BUT_UNDERPOWERED)", () => {
  const res = evaluatePromotionM2(excellentInput({ earlyCiLower: -0.01, earlyCiUpper: 0.003 }));
  assert.equal(res.status, STATUS.SHADOW_MORE_DATA);
  assert.ok(res.reason_codes.includes(REASON.EARLY_GAIN_PROMISING_BUT_UNDERPOWERED));
});

test("4. degradation globale de 0.20% (au-dessus de la limite 0.10%) -> REJECT (GLOBAL_DEGRADATION_EXCEEDS_LIMIT), meme si EARLY est excellent", () => {
  const res = evaluatePromotionM2(excellentInput({ globalRelativeDegradation: 0.002 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.GLOBAL_DEGRADATION_EXCEEDS_LIMIT));
});

test("5. invariant LATE viole -> REJECT (LATE_INVARIANT_VIOLATED), bloque tout independamment du reste", () => {
  const res = evaluatePromotionM2(excellentInput({ lateInvariantViolated: true }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.LATE_INVARIANT_VIOLATED));
});

test("6. fuite temporelle detectee -> REJECT (TEMPORAL_LEAKAGE_DETECTED)", () => {
  const res = evaluatePromotionM2(excellentInput({ temporalLeakageDetected: true }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.TEMPORAL_LEAKAGE_DETECTED));
});

test("7. mecanisme non deterministe -> REJECT (MECHANISM_NON_DETERMINISTIC)", () => {
  const res = evaluatePromotionM2(excellentInput({ mechanismDeterministic: false }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.MECHANISM_NON_DETERMINISTIC));
});

test("gain EARLY negatif (M2 pire) -> REJECT direct, jamais SHADOW", () => {
  const res = evaluatePromotionM2(excellentInput({ earlyRelativeGain: -0.02, earlyCiLower: 0.01, earlyCiUpper: 0.03 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.EARLY_GAIN_BELOW_THRESHOLD));
});

test("plusieurs raisons structurelles simultanees -> toutes rapportees", () => {
  const res = evaluatePromotionM2(excellentInput({ lateInvariantViolated: true, mechanismDeterministic: false }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.LATE_INVARIANT_VIOLATED));
  assert.ok(res.reason_codes.includes(REASON.MECHANISM_NON_DETERMINISTIC));
});

test("determinisme : memes entrees -> meme decision", () => {
  const input = excellentInput();
  assert.deepEqual(evaluatePromotionM2(input), evaluatePromotionM2(input));
});
