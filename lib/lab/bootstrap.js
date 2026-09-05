"use strict";
// GATE C6 (SPEC LAB PRO v1.0) - bootstrap par blocs apparies (paired block
// bootstrap) sur des deltas de perte DEJA CALCULES via
// lib/lab/loss-delta.js#lossDelta (CONVENTION OFFICIELLE UNIQUE, ne pas
// deriver un delta autrement dans ce module ou ailleurs) :
//   delta = loss_candidate - loss_champion
//     candidat MEILLEUR -> delta < 0   candidat PIRE -> delta > 0
// Corrige le 2026-09-04 : ce module (et lib/lab/run-experiment.js qui
// l'alimentait) utilisaient auparavant la convention INVERSE
// (loss_champion - loss_candidate), en contradiction avec la SPEC LAB
// PRO v1.0 officielle - voir tests/lab-loss-delta-sign-convention.test.js
// pour le test de contrat qui garantit que ca ne regresse plus jamais.
//
// Ce module ne refit JAMAIS rho et ne rappelle jamais fit_rho.py : il
// rechantillonne uniquement les deltas fournis, par bloc (journee/cutoff),
// pour preserver la dependance temporelle intra-bloc tout en cassant la
// dependance inter-blocs - conforme SS12 du protocole. Le seed vient
// TOUJOURS du manifest d'experience (jamais Math.random, pour rester
// reproductible et auditable).

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
// tableau de deltas (loss_candidate - loss_champion, cf lib/lab/loss-delta.js)
// appartenant a la meme unite temporelle (journee/cutoff). options.seed:
// number|string, requis pour la reproductibilite (vient du manifest).
// options.nResamples: defaut 10000.
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

  // Proportion des reechantillonnages ou la moyenne du delta est < 0, donc
  // ou le candidat serait meilleur (convention officielle lossDelta) -
  // estimation bootstrap de P(candidat meilleur), independante de la
  // normalite asymptotique contrairement a un simple test de significativite.
  let nBetter = 0;
  for (const m of resampleMeans) if (m < 0) nBetter++;
  const probabilityCandidateBetter = nBetter / resampleMeans.length;

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
    probability_candidate_better: probabilityCandidateBetter,
  };
}

// EXP-002C (audit 2026-09-05) - CI95 sur le GAIN RELATIF (%), PAS sur le
// delta absolu de NLL. Necessaire car relative_gain = (mean(nllM0) -
// mean(nllM2)) / mean(nllM0) n'est PAS une fonction lineaire des deltas
// individuels (le denominateur mean(nllM0) varie lui-meme d'un
// reechantillonnage a l'autre) - on ne peut donc JAMAIS deriver son IC en
// multipliant l'IC du delta absolu par 100/nll_m0_observe. Reutilise
// EXACTEMENT le meme mecanisme de reechantillonnage par blocs (meme PRNG
// mulberry32, meme seedFromString) que pairedBlockBootstrap - seule la
// statistique calculee par reechantillonnage differe (paire (nllM0,nllM2)
// au lieu d'un delta deja reduit).
//
// La decision de promotion N'UTILISE PAS ce CI - elle reste sur
// CI95_delta_NLL (pairedBlockBootstrap ci-dessus), convention
// pre-enregistree delta=NLL_candidat-NLL_champion, upper<0. Ce CI relatif
// est un diagnostic COMPLEMENTAIRE de lisibilite uniquement.
//
// blocksOfPairs: Array<Array<{nllM0:number, nllM2:number}>>
function pairedBlockBootstrapRelativeGain(blocksOfPairs, options = {}) {
  const nResamples = options.nResamples || 10000;
  if (options.seed === undefined || options.seed === null) {
    throw new Error("pairedBlockBootstrapRelativeGain: options.seed est obligatoire (doit venir du manifest d'experience, jamais aleatoire)");
  }
  const seed = typeof options.seed === "string" ? seedFromString(options.seed) : options.seed;
  const rng = mulberry32(seed);

  const nonEmptyBlocks = blocksOfPairs.filter((b) => b.length > 0);
  if (!nonEmptyBlocks.length) {
    return { valid: false, reason: "NO_DATA", n_blocks: 0 };
  }

  const allPairs = nonEmptyBlocks.flat();
  const observedNllM0 = mean(allPairs.map((p) => p.nllM0));
  const observedNllM2 = mean(allPairs.map((p) => p.nllM2));
  const observedRelativeGain = (observedNllM0 - observedNllM2) / observedNllM0;

  const resampleGains = new Array(nResamples);
  for (let r = 0; r < nResamples; r++) {
    const sampled = [];
    for (let i = 0; i < nonEmptyBlocks.length; i++) {
      const idx = Math.floor(rng() * nonEmptyBlocks.length);
      for (const p of nonEmptyBlocks[idx]) sampled.push(p);
    }
    const m0 = mean(sampled.map((p) => p.nllM0));
    const m2 = mean(sampled.map((p) => p.nllM2));
    resampleGains[r] = (m0 - m2) / m0;
  }
  resampleGains.sort((a, b) => a - b);

  const ciLower = quantileSorted(resampleGains, 0.025);
  const ciUpper = quantileSorted(resampleGains, 0.975);

  return {
    valid: true,
    n_blocks: nonEmptyBlocks.length,
    n_total_pairs: allPairs.length,
    n_resamples: nResamples,
    seed,
    observed_relative_gain: observedRelativeGain,
    ci_lower: ciLower,
    ci_upper: ciUpper,
  };
}

// EXP-005 (SPEC LAB PRO v1.0, protocol amendment) - CI95 sur la
// DIFFERENCE entre deux moyennes bloc-reechantillonnees INDEPENDAMMENT
// (ex: mean_delta_saison_2024_25 - mean_delta_saison_2023_24, item 5 de
// l'amendement de protocole EXP-005) - diagnostic d'heterogeneite entre
// periodes, PAS un veto automatique. Reutilise le MEME PRNG deterministe
// (mulberry32/seedFromString) que pairedBlockBootstrap.
//
// blocksA, blocksB : Array<Array<number>> - blocs de la GROUPE A et
// GROUPE B respectivement (ex: blocs ISO-semaine x saison), chaque
// groupe reechantillonne INDEPENDAMMENT (ce ne sont pas des paires
// couplees comme pairedBlockBootstrap - deux periodes distinctes).
function pairedBlockBootstrapGroupDifference(blocksA, blocksB, options = {}) {
  const nResamples = options.nResamples || 10000;
  if (options.seed === undefined || options.seed === null) {
    throw new Error("pairedBlockBootstrapGroupDifference: options.seed est obligatoire (doit venir du manifest d'experience, jamais aleatoire)");
  }
  const seed = typeof options.seed === "string" ? seedFromString(options.seed) : options.seed;
  const rng = mulberry32(seed);

  const nonEmptyA = blocksA.filter((b) => b.length > 0);
  const nonEmptyB = blocksB.filter((b) => b.length > 0);
  if (!nonEmptyA.length || !nonEmptyB.length) {
    return { valid: false, reason: "NO_DATA" };
  }

  const observedMeanA = mean(nonEmptyA.flat());
  const observedMeanB = mean(nonEmptyB.flat());
  const observedDifference = observedMeanB - observedMeanA;

  const diffs = new Array(nResamples);
  for (let r = 0; r < nResamples; r++) {
    const sampledA = [];
    for (let i = 0; i < nonEmptyA.length; i++) {
      const idx = Math.floor(rng() * nonEmptyA.length);
      for (const v of nonEmptyA[idx]) sampledA.push(v);
    }
    const sampledB = [];
    for (let i = 0; i < nonEmptyB.length; i++) {
      const idx = Math.floor(rng() * nonEmptyB.length);
      for (const v of nonEmptyB[idx]) sampledB.push(v);
    }
    diffs[r] = mean(sampledB) - mean(sampledA);
  }
  diffs.sort((a, b) => a - b);

  const ciLower = quantileSorted(diffs, 0.025);
  const ciUpper = quantileSorted(diffs, 0.975);

  return {
    valid: true,
    n_blocks_a: nonEmptyA.length, n_blocks_b: nonEmptyB.length,
    n_resamples: nResamples, seed,
    observed_mean_a: observedMeanA, observed_mean_b: observedMeanB,
    observed_difference: observedDifference,
    ci_lower: ciLower, ci_upper: ciUpper,
    excludes_zero: ciLower > 0 || ciUpper < 0,
  };
}

module.exports = { pairedBlockBootstrap, pairedBlockBootstrapRelativeGain, pairedBlockBootstrapGroupDifference, mulberry32, seedFromString };
