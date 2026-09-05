"use strict";
// EXP-005 (protocol amendment, item 5) - CI95 sur la difference entre
// deux moyennes bloc-reechantillonnees INDEPENDAMMENT (ex: heterogeneite
// entre saisons). Diagnostic uniquement, jamais un veto automatique.

const test = require("node:test");
const assert = require("node:assert/strict");
const { pairedBlockBootstrapGroupDifference } = require("../lib/lab/bootstrap.js");

function buildBlocks(center, nBlocks, perBlock, noiseAmplitude) {
  const blocks = [];
  for (let b = 0; b < nBlocks; b++) {
    const block = [];
    for (let i = 0; i < perBlock; i++) block.push(center + noiseAmplitude * Math.sin(b * 7 + i * 13));
    blocks.push(block);
  }
  return blocks;
}

test("difference clairement non-nulle -> CI exclut zero, observed_difference proche de la vraie difference", () => {
  const blocksA = buildBlocks(0.1, 30, 5, 0.02);
  const blocksB = buildBlocks(0.4, 30, 5, 0.02);
  const res = pairedBlockBootstrapGroupDifference(blocksA, blocksB, { seed: "TEST-DIFF-CLEAR", nResamples: 5000 });
  assert.equal(res.valid, true);
  assert.ok(Math.abs(res.observed_difference - 0.3) < 0.05);
  assert.equal(res.excludes_zero, true);
});

test("difference nulle (memes groupes) -> CI inclut zero", () => {
  const blocksA = buildBlocks(0.2, 30, 5, 0.05);
  const blocksB = buildBlocks(0.2, 30, 5, 0.05);
  const res = pairedBlockBootstrapGroupDifference(blocksA, blocksB, { seed: "TEST-DIFF-NULL", nResamples: 5000 });
  assert.equal(res.excludes_zero, false);
});

test("jamais Math.random - seed obligatoire", () => {
  assert.throws(() => pairedBlockBootstrapGroupDifference([[1]], [[2]], {}), /seed est obligatoire/);
});

test("determinisme : meme seed -> meme resultat", () => {
  const blocksA = buildBlocks(0.1, 20, 4, 0.03);
  const blocksB = buildBlocks(0.3, 20, 4, 0.03);
  const r1 = pairedBlockBootstrapGroupDifference(blocksA, blocksB, { seed: "TEST-DETERMINISM", nResamples: 2000 });
  const r2 = pairedBlockBootstrapGroupDifference(blocksA, blocksB, { seed: "TEST-DETERMINISM", nResamples: 2000 });
  assert.deepEqual(r1, r2);
});

test("groupe vide -> valid:false, NO_DATA", () => {
  const res = pairedBlockBootstrapGroupDifference([], [[1, 2]], { seed: 1 });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "NO_DATA");
});
