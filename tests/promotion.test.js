"use strict";
// GATE C7 - les 7 cas explicitement requis, un par un, chacun isolant une
// SEULE condition de rejet/shadow pour verifier que la regle qui doit
// declencher declenche bien, et qu'aucune autre ne declenche par accident.
//
// Convention de signe (corrigee le 2026-09-04, voir
// tests/lab-loss-delta-sign-convention.test.js) : ci_lower/ci_upper sont
// les bornes du delta = loss_candidate - loss_champion (lib/lab/loss-delta.js).
// candidat MEILLEUR -> ci_upper<0 ; candidat PIRE -> ci_lower>0.

const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluatePromotion, REASON, STATUS } = require("../lib/promotion.js");

// Base "candidat excellent" - sert de point de depart pour chaque cas, en
// ne degradant qu'UN SEUL champ a la fois. ci_lower/ci_upper negatifs :
// le candidat est confidemment meilleur (convention lossDelta ci-dessus).
function excellentInput(overrides = {}) {
  return {
    n_oos: 2000,
    nll_m0: 1.20,
    nll_m1: 1.15, // gain relatif = 0.05/1.20 = 4.17%
    ci_lower: -0.08,
    ci_upper: -0.02,
    convergence_rate: 1.0,
    boundary_hit_rate: 0.0,
    rho_stability: { std: 0.01 },
    secondary: {
      ou25: { logloss_m0: 0.60, logloss_m1: 0.595 },
      btts: { logloss_m0: 0.62, logloss_m1: 0.618 },
      x12: { logloss_m0: 0.90, logloss_m1: 0.895 },
    },
    ...overrides,
  };
}

test("1. candidat excellent (tout au vert) -> PROMOTE", () => {
  const res = evaluatePromotion(excellentInput());
  assert.equal(res.status, STATUS.PROMOTE);
  assert.deepEqual(res.reason_codes, []);
});

test("2. N OOS trop faible -> SHADOW_MORE_DATA (N_OOS_TOO_LOW)", () => {
  const res = evaluatePromotion(excellentInput({ n_oos: 50 }));
  assert.equal(res.status, STATUS.SHADOW_MORE_DATA);
  assert.ok(res.reason_codes.includes(REASON.N_OOS_TOO_LOW));
});

test("3. gain de 0.10% (sous le plancher economique) -> REJECT (GAIN_BELOW_ECONOMIC_FLOOR)", () => {
  // nll_m0=1.20, gain souhaite = 0.10% -> nll_m1 = 1.20 * (1 - 0.001) = 1.1988
  const res = evaluatePromotion(excellentInput({ nll_m0: 1.20, nll_m1: 1.1988, ci_lower: -0.0025, ci_upper: -0.0005 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.GAIN_BELOW_ECONOMIC_FLOOR));
});

test("4. IC du delta traverse zero (gain non significatif statistiquement) -> SHADOW_MORE_DATA (CI_CROSSES_ZERO)", () => {
  // gain ponctuel correct (1%, au-dessus du plancher de 0.5%) mais IC large qui traverse zero
  const res = evaluatePromotion(excellentInput({ nll_m0: 1.20, nll_m1: 1.188, ci_lower: -0.05, ci_upper: 0.01 }));
  assert.equal(res.status, STATUS.SHADOW_MORE_DATA);
  assert.ok(res.reason_codes.includes(REASON.CI_CROSSES_ZERO));
});

test("4bis. IC du delta ENTIEREMENT positif (candidat confidemment PIRE) -> REJECT (CI_CONFIRMS_CANDIDATE_WORSE)", () => {
  const res = evaluatePromotion(excellentInput({ ci_lower: 0.01, ci_upper: 0.06 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.CI_CONFIRMS_CANDIDATE_WORSE));
});

test("5. non-convergence du fitter -> REJECT (FITTER_NON_CONVERGENT)", () => {
  const res = evaluatePromotion(excellentInput({ convergence_rate: 0.80 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.FITTER_NON_CONVERGENT));
});

test("6. rho colle a sa borne trop souvent -> REJECT (RHO_ON_BOUNDARY)", () => {
  const res = evaluatePromotion(excellentInput({ boundary_hit_rate: 0.25 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.RHO_ON_BOUNDARY));
});

test("7. bon NLL exact-score mais O/U2.5 fortement degrade -> REJECT (SECONDARY_MARKET_DEGRADED)", () => {
  const res = evaluatePromotion(excellentInput({
    secondary: {
      ou25: { logloss_m0: 0.60, logloss_m1: 0.66 }, // +10% degradation, tres au-dessus du seuil 3%
      btts: { logloss_m0: 0.62, logloss_m1: 0.618 },
      x12: { logloss_m0: 0.90, logloss_m1: 0.895 },
    },
  }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.SECONDARY_MARKET_DEGRADED));
});

test("rho instable (std au-dessus du seuil) -> REJECT (RHO_UNSTABLE)", () => {
  const res = evaluatePromotion(excellentInput({ rho_stability: { std: 0.15 } }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.RHO_UNSTABLE));
});

test("diagnostic bas scores fortement degrade sur un score frequemment observe -> REJECT (LOW_SCORE_DEGRADED)", () => {
  const res = evaluatePromotion(excellentInput({
    low_score_diagnostics: {
      "0-0": { count_observed: 40, nll_contribution_m0: 2.0, nll_contribution_m1: 2.5 }, // +25%, tres au-dessus du seuil 10%
      "1-0": { count_observed: 30, nll_contribution_m0: 2.1, nll_contribution_m1: 2.1 },
      "0-1": { count_observed: 0, nll_contribution_m0: null, nll_contribution_m1: null },
      "1-1": { count_observed: 20, nll_contribution_m0: 2.2, nll_contribution_m1: 2.2 },
    },
  }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.LOW_SCORE_DEGRADED));
});

test("un score rare (< seuil de comptage) fortement degrade ne declenche PAS LOW_SCORE_DEGRADED (evite le sur-ajustement au bruit)", () => {
  const res = evaluatePromotion(excellentInput({
    low_score_diagnostics: {
      "0-0": { count_observed: 2, nll_contribution_m0: 2.0, nll_contribution_m1: 5.0 }, // tres degrade mais count_observed=2 < MIN_LOW_SCORE_COUNT_FOR_CHECK
      "1-0": { count_observed: 30, nll_contribution_m0: 2.1, nll_contribution_m1: 2.1 },
      "0-1": { count_observed: 0, nll_contribution_m0: null, nll_contribution_m1: null },
      "1-1": { count_observed: 20, nll_contribution_m0: 2.2, nll_contribution_m1: 2.2 },
    },
  }));
  assert.equal(res.status, STATUS.PROMOTE);
});

test("plusieurs raisons REJECT simultanees -> toutes rapportees (audit complet, pas juste la premiere trouvee)", () => {
  const res = evaluatePromotion(excellentInput({ convergence_rate: 0.5, boundary_hit_rate: 0.5 }));
  assert.equal(res.status, STATUS.REJECT);
  assert.ok(res.reason_codes.includes(REASON.FITTER_NON_CONVERGENT));
  assert.ok(res.reason_codes.includes(REASON.RHO_ON_BOUNDARY));
});

test("determinisme : memes entrees -> meme decision (deepEqual strict)", () => {
  const input = excellentInput();
  assert.deepEqual(evaluatePromotion(input), evaluatePromotion(input));
});
