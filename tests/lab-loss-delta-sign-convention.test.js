"use strict";
// Test de CONTRAT pour la convention officielle de signe (SPEC LAB PRO
// v1.0) du delta candidat/champion : negative delta = candidate better.
//
//   delta_i = loss_candidate_i - loss_champion_i   (lib/lab/loss-delta.js)
//     candidat MEILLEUR -> delta_i < 0
//     candidat IDENTIQUE -> delta_i ~= 0
//     candidat PIRE      -> delta_i > 0
//   PROMOTE exige notamment CI95_upper < 0.
//
// Contexte (2026-09-04) : un audit a revele que lib/lab/run-experiment.js
// calculait `delta = NLL_M0 - NLL_M1` (champion - candidat), l'INVERSE de
// la convention officielle - une inversion reelle du code (pas seulement
// une erreur de formulation dans un rapport), corrigee dans le meme
// commit que ce test. Ce fichier verifie desormais, de bout en bout
// (lib/lab/loss-delta.js -> lib/lab/bootstrap.js -> lib/promotion.js),
// que la convention est respectee et le reste - si quelqu'un reinverse le
// signe par erreur, ce test casse immediatement.

const test = require("node:test");
const assert = require("node:assert/strict");
const { lossDelta } = require("../lib/lab/loss-delta.js");
const { pairedBlockBootstrap } = require("../lib/lab/bootstrap.js");
const { evaluatePromotion, REASON, STATUS } = require("../lib/promotion.js");

const N_OOS = 600; // > MIN_N_OOS (500) pour que seule la convention de signe soit testee, pas le garde-fou N_OOS_TOO_LOW
const N_BLOCKS = 60;
const PER_BLOCK = N_OOS / N_BLOCKS;

// Construit N_OOS pertes "loss_champion_i" avec un peu de variation
// (deterministe, pas Math.random) et un ecart CONSTANT et STRICT par
// rapport au candidat - jamais une egalite accidentelle sur un match.
function buildStrictLossPairs(gapCandidateMinusChampion) {
  const lossChampion = [];
  const lossCandidate = [];
  for (let i = 0; i < N_OOS; i++) {
    const base = 1.0 + 0.2 * Math.sin(i * 0.37); // variation realiste, jamais negative (base>0.8)
    lossChampion.push(base);
    lossCandidate.push(base + gapCandidateMinusChampion); // ecart CONSTANT -> strictement meilleur/pire sur CHAQUE match
  }
  return { lossChampion, lossCandidate };
}

function buildDeltaBlocks(lossCandidate, lossChampion) {
  const blocks = [];
  for (let b = 0; b < N_BLOCKS; b++) {
    const block = [];
    for (let i = 0; i < PER_BLOCK; i++) {
      const idx = b * PER_BLOCK + i;
      block.push(lossDelta(lossCandidate[idx], lossChampion[idx]));
    }
    blocks.push(block);
  }
  return blocks;
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

test("lossDelta: contrat de base - candidat meilleur (loss plus basse) -> delta<0, candidat pire -> delta>0, egal -> 0", () => {
  assert.ok(lossDelta(0.8, 1.0) < 0, "candidat avec loss=0.8 < champion loss=1.0 doit donner delta<0");
  assert.ok(lossDelta(1.2, 1.0) > 0, "candidat avec loss=1.2 > champion loss=1.0 doit donner delta>0");
  assert.equal(lossDelta(1.0, 1.0), 0);
});

test("AUDIT 1/5 - candidat STRICTEMENT meilleur sur CHAQUE match -> mean_delta < 0", () => {
  const { lossChampion, lossCandidate } = buildStrictLossPairs(-0.20);
  // verifie explicitement le "chaque match" demande par l'audit, pas seulement la moyenne
  for (let i = 0; i < N_OOS; i++) assert.ok(lossCandidate[i] < lossChampion[i], `match ${i}: candidat pas strictement meilleur`);
  const deltas = lossCandidate.map((lc, i) => lossDelta(lc, lossChampion[i]));
  const meanDelta = mean(deltas);
  assert.ok(meanDelta < 0, `mean_delta=${meanDelta} devrait etre < 0`);
});

test("AUDIT 2/5+3/5 - candidat strictement meilleur -> CI95_upper < 0 (bootstrap par blocs apparies)", () => {
  const { lossChampion, lossCandidate } = buildStrictLossPairs(-0.20);
  const blocks = buildDeltaBlocks(lossCandidate, lossChampion);
  const boot = pairedBlockBootstrap(blocks, { seed: "SIGN-CONVENTION-AUDIT-BETTER", nResamples: 10000 });
  assert.equal(boot.valid, true);
  assert.ok(boot.observed_mean_delta < 0, `observed_mean_delta=${boot.observed_mean_delta}`);
  assert.ok(boot.ci_upper < 0, `CI95_upper=${boot.ci_upper} doit etre < 0 pour un candidat strictement meilleur`);
  assert.equal(boot.ci_crosses_zero, false);
});

test("AUDIT 4/5 - candidat strictement meilleur -> probability_candidate_better > 0.95", () => {
  const { lossChampion, lossCandidate } = buildStrictLossPairs(-0.20);
  const blocks = buildDeltaBlocks(lossCandidate, lossChampion);
  const boot = pairedBlockBootstrap(blocks, { seed: "SIGN-CONVENTION-AUDIT-BETTER", nResamples: 10000 });
  assert.ok(boot.probability_candidate_better > 0.95, `probability_candidate_better=${boot.probability_candidate_better} devrait etre > 0.95`);
});

test("AUDIT 5/5 - candidat strictement meilleur -> promotion.js peut PROMOTE", () => {
  const { lossChampion, lossCandidate } = buildStrictLossPairs(-0.20);
  const blocks = buildDeltaBlocks(lossCandidate, lossChampion);
  const boot = pairedBlockBootstrap(blocks, { seed: "SIGN-CONVENTION-AUDIT-BETTER", nResamples: 10000 });
  const decision = evaluatePromotion({
    n_oos: N_OOS,
    nll_m0: mean(lossChampion),
    nll_m1: mean(lossCandidate),
    ci_lower: boot.ci_lower,
    ci_upper: boot.ci_upper,
    convergence_rate: 1.0,
    boundary_hit_rate: 0.0,
    rho_stability: { std: 0.01 },
  });
  assert.equal(decision.status, STATUS.PROMOTE, `attendu PROMOTE, obtenu ${decision.status} (${decision.reason_codes.join(",")})`);
  assert.deepEqual(decision.reason_codes, []);
});

test("CAS INVERSE - candidat STRICTEMENT pire sur CHAQUE match -> mean_delta>0, CI95_lower>0, REJECT", () => {
  const { lossChampion, lossCandidate } = buildStrictLossPairs(+0.20);
  for (let i = 0; i < N_OOS; i++) assert.ok(lossCandidate[i] > lossChampion[i], `match ${i}: candidat pas strictement pire`);
  const blocks = buildDeltaBlocks(lossCandidate, lossChampion);
  const boot = pairedBlockBootstrap(blocks, { seed: "SIGN-CONVENTION-AUDIT-WORSE", nResamples: 10000 });
  assert.equal(boot.valid, true);
  assert.ok(boot.observed_mean_delta > 0, `observed_mean_delta=${boot.observed_mean_delta}`);
  assert.ok(boot.ci_lower > 0, `CI95_lower=${boot.ci_lower} doit etre > 0 pour un candidat strictement pire`);
  assert.ok(boot.probability_candidate_better < 0.05, `probability_candidate_better=${boot.probability_candidate_better} devrait etre < 0.05`);

  const decision = evaluatePromotion({
    n_oos: N_OOS,
    nll_m0: mean(lossChampion),
    nll_m1: mean(lossCandidate),
    ci_lower: boot.ci_lower,
    ci_upper: boot.ci_upper,
    convergence_rate: 1.0,
    boundary_hit_rate: 0.0,
    rho_stability: { std: 0.01 },
  });
  assert.equal(decision.status, STATUS.REJECT, `attendu REJECT, obtenu ${decision.status}`);
  assert.ok(decision.reason_codes.includes(REASON.CI_CONFIRMS_CANDIDATE_WORSE) || decision.reason_codes.includes(REASON.GAIN_BELOW_ECONOMIC_FLOOR));
});

test("run-experiment.js#buildNllDeltaBlocks utilise bien la convention officielle (M1=candidat, M0=champion)", () => {
  const { buildNllDeltaBlocks } = require("../lib/lab/run-experiment.js");
  const { logProbability } = require("../lib/lab/dc-log-probability.js");
  // Un match ou rho_m1 (candidat) colle bien mieux au score observe que
  // rho_m0 (champion, delibrement mauvais ici) - le delta doit etre NEGATIF.
  const predictions = [
    { cutoff: "2026-01-01", lambdaH: 1.5, lambdaA: 1.2, goals_home_90: 1, goals_away_90: 1, rho_m0: 0.9, rho_m1: -0.0845 },
  ];
  const blocks = buildNllDeltaBlocks(predictions);
  const delta = blocks[0][0];
  const nllChampion = -logProbability(1.5, 1.2, 1, 1, 0.9);
  const nllCandidate = -logProbability(1.5, 1.2, 1, 1, -0.0845);
  assert.ok(nllCandidate < nllChampion, "pre-condition du test : le candidat doit reellement mieux predire ce match");
  assert.ok(delta < 0, `delta=${delta} devrait etre negatif (candidat meilleur) - si positif, la convention est de nouveau inversee dans buildNllDeltaBlocks`);
  assert.ok(Math.abs(delta - (nllCandidate - nllChampion)) < 1e-12, "delta doit etre exactement NLL_candidat - NLL_champion");
});
