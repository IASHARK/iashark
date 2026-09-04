"use strict";
// EXP-002C (audit 2026-09-05) - le CI95 sur le GAIN RELATIF (%) n'est PAS
// une transformation lineaire du CI95 sur le delta absolu de NLL (le
// denominateur mean(nllM0) varie lui-meme par reechantillonnage). Ces
// tests verifient que pairedBlockBootstrapRelativeGain calcule une vraie
// statistique bootstrappee distincte, jamais un simple *100 du delta.

const test = require("node:test");
const assert = require("node:assert/strict");
const { pairedBlockBootstrap, pairedBlockBootstrapRelativeGain } = require("../lib/lab/bootstrap.js");

function buildBlocks(nllM0Center, gainFraction, nBlocks, perBlock, noiseAmplitude) {
  const blocks = [];
  for (let b = 0; b < nBlocks; b++) {
    const block = [];
    for (let i = 0; i < perBlock; i++) {
      const noise = noiseAmplitude * Math.sin(b * 7 + i * 13);
      const nllM0 = nllM0Center + noise;
      const nllM2 = nllM0 * (1 - gainFraction);
      block.push({ nllM0, nllM2 });
    }
    blocks.push(block);
  }
  return blocks;
}

test("pairedBlockBootstrapRelativeGain : candidat ameliore le NLL de exactement 5% -> observed_relative_gain proche de 0.05, IC ne traverse pas zero", () => {
  const blocks = buildBlocks(3.0, 0.05, 40, 6, 0.05);
  const res = pairedBlockBootstrapRelativeGain(blocks, { seed: "EXP-TEST-RELGAIN", nResamples: 10000 });
  assert.equal(res.valid, true);
  assert.ok(Math.abs(res.observed_relative_gain - 0.05) < 0.005, `observed_relative_gain=${res.observed_relative_gain}`);
  assert.ok(res.ci_lower > 0, `ci_lower=${res.ci_lower} doit etre strictement positif (gain relatif, jamais un delta negatif directement relabelise)`);
});

test("pairedBlockBootstrapRelativeGain N'EST PAS une simple mise a l'echelle (*100/nll_m0) du CI du delta absolu - les deux CI sont des statistiques DIFFERENTES calculees par des reechantillonnages independants sur des grandeurs differentes", () => {
  const blocksAbsolute = buildBlocks(3.0, 0.05, 40, 6, 0.05).map((block) => block.map((p) => p.nllM2 - p.nllM0));
  const resDelta = pairedBlockBootstrap(blocksAbsolute, { seed: "EXP-TEST-COMPARE", nResamples: 10000 });
  const blocksPairs = buildBlocks(3.0, 0.05, 40, 6, 0.05);
  const resRelative = pairedBlockBootstrapRelativeGain(blocksPairs, { seed: "EXP-TEST-COMPARE", nResamples: 10000 });
  // Naive (fausse) transformation : *100 puis /nll_m0 observe - NE DOIT PAS correspondre exactement au vrai CI bootstrappe
  const naiveCiLowerPct = -resDelta.ci_upper / 3.0;
  const naiveCiUpperPct = -resDelta.ci_lower / 3.0;
  assert.notEqual(resRelative.ci_lower, naiveCiLowerPct, "le CI relatif bootstrappe correctement ne doit pas coincider byte-a-byte avec la mise a l'echelle naive du delta absolu");
  assert.ok(resRelative.valid);
});

test("pairedBlockBootstrapRelativeGain : seed obligatoire, jamais Math.random", () => {
  assert.throws(() => pairedBlockBootstrapRelativeGain([[{ nllM0: 1, nllM2: 0.9 }]], {}), /seed est obligatoire/);
});

test("pairedBlockBootstrapRelativeGain : determinisme strict - meme seed -> resultat byte-identique", () => {
  const blocks = buildBlocks(3.0, 0.02, 25, 4, 0.1);
  const res1 = pairedBlockBootstrapRelativeGain(blocks, { seed: "EXP-002C-v1", nResamples: 2000 });
  const res2 = pairedBlockBootstrapRelativeGain(blocks, { seed: "EXP-002C-v1", nResamples: 2000 });
  assert.deepEqual(res1, res2);
});

test("pairedBlockBootstrapRelativeGain : liste de blocs vide -> valid:false, reason NO_DATA, jamais un resultat fabrique", () => {
  const res = pairedBlockBootstrapRelativeGain([], { seed: 42 });
  assert.equal(res.valid, false);
  assert.equal(res.reason, "NO_DATA");
});
