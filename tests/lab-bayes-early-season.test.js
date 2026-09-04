"use strict";
// EXP-002 - lib/lab/bayes-early-season.js#blendWithDecayingPrior. Le test
// le plus important de ce module (invariant LATE-bucket) : quand
// prior_weight(n)=0 (n>=16), le taux melange doit etre EXACTEMENT le
// taux courant seul, sans AUCUNE trace du prior - condition necessaire
// pour que M2 devienne numeriquement identique a M0 dans ce regime
// (tests/lab-run-m2-runner.test.js verifie l'invariant complet au niveau
// des probabilites de match, pas seulement du taux).

const test = require("node:test");
const assert = require("node:assert/strict");
const { priorWeight, blendWithDecayingPrior } = require("../lib/lab/bayes-early-season.js");

test("priorWeight: memes 5 valeurs de contrat que le mecanisme production (n=0->8...n=16->0)", () => {
  assert.equal(priorWeight(0), 8);
  assert.equal(priorWeight(4), 6);
  assert.equal(priorWeight(8), 4);
  assert.equal(priorWeight(12), 2);
  assert.equal(priorWeight(16), 0);
  assert.equal(priorWeight(20), 0, "jamais negatif au-dela de 16");
});

test("INVARIANT CRITIQUE - n>=16 : le taux melange est EXACTEMENT le taux courant seul, aucune trace du prior (meme un prior tres different)", () => {
  const current = { events: 25, matches: 20 }; // taux courant = 1.25
  const priorRateVeryDifferent = 3.5; // prior deliberement tres eloigne, pour detecter la moindre fuite
  const result = blendWithDecayingPrior(current, priorRateVeryDifferent, 16);
  assert.equal(result.prior_weight, 0);
  assert.equal(result.rate, current.events / current.matches, "aucune contamination du prior a n=16");

  const resultBeyond = blendWithDecayingPrior(current, priorRateVeryDifferent, 25);
  assert.equal(resultBeyond.rate, current.events / current.matches, "idem au-dela de 16");
});

test("a n=0 avec current.matches=0 (tout premier match de la saison) : le taux melange est EXACTEMENT le prior", () => {
  const result = blendWithDecayingPrior({ events: 0, matches: 0 }, 1.42, 0);
  assert.equal(result.prior_weight, 8);
  assert.equal(result.rate, 1.42);
});

test("regime intermediaire (n=8) : melange ponderee verifiable a la main", () => {
  // current: 10 buts en 4 matchs (rate=2.5), prior=1.2, poids prior=4 (n=8)
  // blended = (10 + 1.2*4) / (4+4) = (10+4.8)/8 = 14.8/8 = 1.85
  const result = blendWithDecayingPrior({ events: 10, matches: 4 }, 1.2, 8);
  assert.equal(result.prior_weight, 4);
  assert.ok(Math.abs(result.rate - 1.85) < 1e-9, `rate=${result.rate}, attendu 1.85`);
  assert.equal(result.blended_events, 14.8);
  assert.equal(result.blended_matches, 8);
  assert.ok(Math.abs(result.blended_events / result.blended_matches - result.rate) < 1e-12, "blended_events/blended_matches doit egaler rate exactement (memes semantique que bm/md de calcLambdas)");
});

test("le taux melange est toujours un barycentre entre current-rate et priorRate (jamais hors de cette plage)", () => {
  const currentRate = 10 / 4; // 2.5
  const priorRate = 1.0;
  for (const n of [0, 2, 5, 8, 11, 15, 16, 30]) {
    const result = blendWithDecayingPrior({ events: 10, matches: 4 }, priorRate, n);
    assert.ok(result.rate >= Math.min(currentRate, priorRate) - 1e-9 && result.rate <= Math.max(currentRate, priorRate) + 1e-9, `n=${n} rate=${result.rate} hors barycentre`);
  }
});
