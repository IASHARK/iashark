"use strict";
// GATE C6 (SPEC LAB PRO v1.0) - bootstrap par blocs apparies (paired block
// bootstrap) sur des deltas de NLL DEJA CALCULES (delta = NLL_M0 - NLL_M1
// par match, positif = M1 meilleur que M0 sur ce match). Ce module ne
// refit JAMAIS rho et ne rappelle jamais fit_rho.py : il rechantillonne
// uniquement les deltas fournis, par bloc (journee/cutoff), pour preserver
// la dependance temporelle intra-bloc tout en cassant la dependance
// inter-blocs - conforme SS12 du protocole. Le seed vient TOUJOURS du
// manifest d'experience (jamais Math.random, pour rester reproductible et
// auditable).

// PRNG deterministe (mulberry32) - Math.random() n'est pas seedable et
// rendrait le bootstrap non reproductible d'une execution a l'autre.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Permet de passer un seed string lisible (ex: manifest.seed = "EXP-001-v1")
// tout en alimentant un PRNG entier.
function seedFromString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mean(arr) {
  if (!arr.length) return null;
  let sum = 0;
  for (const v of arr) sum += v;
  return sum / arr.length;
}

function quantileSorted(sortedArr, q) {
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.round(q * (sortedArr.length - 1))));
  return sortedArr[idx];
}

// blocks: Array<Array<number>> - un tableau de blocs, chaque bloc est un
// tableau de deltas (NLL_M0 - NLL_M1) appartenant a la meme unite
// temporelle (journee/cutoff). options.seed: number|string, requis pour la
// reproductibilite (vient du manifest). options.nResamples: defaut 10000.
function pairedBlockBootstrap(blocks, options = {}) {
  const nResamples = options.nResamples || 10000;
  if (options.seed === undefined || options.seed === null) {
    throw new Error("pairedBlockBootstrap: options.seed est obligatoire (doit venir du manifest d'experience, jamais aleatoire)");
  }
  const seed = typeof options.seed === "string" ? seedFromString(options.seed) : options.seed;
  const rng = mulberry32(seed);

  const nonEmptyBlocks = blocks.filter((b) => b.length > 0);
  if (!nonEmptyBlocks.length) {
    return { valid: false, reason: "NO_DATA", n_blocks: 0 };
  }

  const allDeltas = nonEmptyBlocks.flat();
  const observedMeanDelta = mean(allDeltas);

  const resampleMeans = new Array(nResamples);
  for (let r = 0; r < nResamples; r++) {
    const sampled = [];
    for (let i = 0; i < nonEmptyBlocks.length; i++) {
      const idx = Math.floor(rng() * nonEmptyBlocks.length);
      for (const d of nonEmptyBlocks[idx]) sampled.push(d);
    }
    resampleMeans[r] = mean(sampled);
  }
  resampleMeans.sort((a, b) => a - b);

  const ciLower = quantileSorted(resampleMeans, 0.025);
  const ciUpper = quantileSorted(resampleMeans, 0.975);

  return {
    valid: true,
    n_blocks: nonEmptyBlocks.length,
    n_total_deltas: allDeltas.length,
    n_resamples: nResamples,
    seed,
    observed_mean_delta: observedMeanDelta,
    ci_lower: ciLower,
    ci_upper: ciUpper,
    ci_crosses_zero: ciLower <= 0 && ciUpper >= 0,
  };
}

module.exports = { pairedBlockBootstrap, mulberry32, seedFromString };
