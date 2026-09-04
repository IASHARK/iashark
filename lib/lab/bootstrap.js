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

module.exports = { pairedBlockBootstrap, mulberry32, seedFromString };
