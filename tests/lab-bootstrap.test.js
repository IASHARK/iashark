"use strict";
// GATE C6 - 3 cas obligatoires (candidat clairement meilleur / identique /
// clairement pire) + determinisme du seed. Les deltas sont construits a la
// main (jamais des vraies donnees EXP-001, purement pour tester le code du
// bootstrap lui-meme).

const test = require("node:test");
const assert = require("node:assert/strict");
const { pairedBlockBootstrap, seedFromString } = require("../lib/lab/bootstrap.js");

// 40 blocs (~"journees"), chaque bloc contient plusieurs deltas avec un
// leger bruit symetrique autour d'une moyenne connue - suffisant pour que
// l'intervalle de confiance a 95% se comporte comme attendu.
function buildBlocks(centerDelta, nBlocks, perBlock, noiseAmplitude) {
  const blocks = [];
  for (let b = 0; b < nBlocks; b++) {
    const block = [];
    for (let i = 0; i < perBlock; i++) {
      // bruit deterministe base sur b,i (pas de Math.random ici non plus)
      const noise = noiseAmplitude * Math.sin(b * 7 + i * 13);
      block.push(centerDelta + noise);
    }
    blocks.push(block);
  }
  return blocks;
}

test("pairedBlockBootstrap: candidat CLAIREMENT MEILLEUR (deltas positifs) -> IC ne traverse pas zero, borne basse > 0", () => {
  const blocks = buildBlocks(0.5, 40, 6, 0.1);
  const res = pairedBlockBootstrap(blocks, { seed: "EXP-TEST-BETTER", nResamples: 10000 });
  assert.equal(res.valid, true);
  assert.ok(res.observed_mean_delta > 0.3, `moyenne observee=${res.observed_mean_delta}`);
  assert.equal(res.ci_crosses_zero, false, "IC ne doit pas traverser zero pour un candidat clairement meilleur");
  assert.ok(res.ci_lower > 0, `ci_lower=${res.ci_lower} doit etre strictement positif`);
});

test("pairedBlockBootstrap: candidat IDENTIQUE (deltas bruit symetrique autour de 0) -> IC traverse zero", () => {
  const blocks = buildBlocks(0, 40, 6, 0.3);
  const res = pairedBlockBootstrap(blocks, { seed: "EXP-TEST-IDENTICAL", nResamples: 10000 });
  assert.equal(res.valid, true);
  assert.ok(Math.abs(res.observed_mean_delta) < 0.1, `moyenne observee=${res.observed_mean_delta} devrait etre proche de 0`);
  assert.equal(res.ci_crosses_zero, true, "IC doit traverser zero pour deux modeles equivalents");
});

test("pairedBlockBootstrap: candidat CLAIREMENT PIRE (deltas negatifs) -> IC ne traverse pas zero, borne haute < 0", () => {
  const blocks = buildBlocks(-0.5, 40, 6, 0.1);
  const res = pairedBlockBootstrap(blocks, { seed: "EXP-TEST-WORSE", nResamples: 10000 });
  assert.equal(res.valid, true);
  assert.ok(res.observed_mean_delta < -0.3, `moyenne observee=${res.observed_mean_delta}`);
  assert.equal(res.ci_crosses_zero, false);
  assert.ok(res.ci_upper < 0, `ci_upper=${res.ci_upper} doit etre strictement negatif`);
});

test("pairedBlockBootstrap: determinisme strict - meme seed (venant du manifest) -> resultat byte-identique", () => {
  const blocks = buildBlocks(0.2, 25, 4, 0.15);
  const res1 = pairedBlockBootstrap(blocks, { seed: "EXP-001-v1", nResamples: 2000 });
  const res2 = pairedBlockBootstrap(blocks, { seed: "EXP-001-v1", nResamples: 2000 });
  assert.deepEqual(res1, res2, "deux executions avec le meme seed doivent produire un resultat identique (reproductibilite obligatoire)");
});

test("pairedBlockBootstrap: seeds differents -> resultats differents (le seed est bien utilise, pas ignore)", () => {
  const blocks = buildBlocks(0.2, 25, 4, 0.15);
  const res1 = pairedBlockBootstrap(blocks, { seed: "seed-A", nResamples: 2000 });
  const res2 = pairedBlockBootstrap(blocks, { seed: "seed-B", nResamples: 2000 });
  assert.notEqual(res1.ci_lower, res2.ci_lower);
});

test("pairedBlockBootstrap: jamais Math.random - seed obligatoire, sinon exception explicite", () => {
  assert.throws(() => pairedBlockBootstrap([[1, 2]], {}), /seed est obligatoire/);
});

test("pairedBlockBootstrap: liste de blocs vide -> valid:false, reason NO_DATA, jamais un resultat fabrique", () => {
  const res = pairedBlockBootstrap([], { seed: 42 });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "NO_DATA");
});

test("seedFromString: deterministe et stable (meme string -> meme entier a chaque appel)", () => {
  assert.equal(seedFromString("EXP-001-v1"), seedFromString("EXP-001-v1"));
  assert.notEqual(seedFromString("EXP-001-v1"), seedFromString("EXP-001-v2"));
});
