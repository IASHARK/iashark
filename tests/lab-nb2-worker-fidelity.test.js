"use strict";
// EXP-004 (audit 2026-09-05, correctif hang subprocess) - item 7 : le
// worker Python PERSISTANT (lib/lab/nb2-python-worker.js ->
// scripts/fit_kappa_worker.py) doit produire des resultats EXACTEMENT
// identiques au fitter one-shot (lib/lab/nb2-python-fitter.js ->
// scripts/fit_kappa.py) sur les MEMES payloads - kappa_hat,
// objective_nll, convergence. Les deux scripts partagent la MEME
// fonction objectif (identite numeriquement stable, log_nb2_pmf), donc
// un optimiseur deterministe (scipy bounded) doit converger vers
// EXACTEMENT la meme solution.

const test = require("node:test");
const assert = require("node:assert/strict");
const { pythonKappaFitter } = require("../lib/lab/nb2-python-fitter.js");
const { Nb2KappaWorker } = require("../lib/lab/nb2-python-worker.js");

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildPayload(n, seed, muScale) {
  const rng = mulberry32(seed);
  const rows = [];
  for (let i = 0; i < n; i++) {
    rows.push({ muHome: 0.5 + rng() * muScale, muAway: 0.5 + rng() * muScale, h: Math.floor(rng() * 6), a: Math.floor(rng() * 6) });
  }
  return rows;
}

test("worker persistant == fitter one-shot : kappa_hat/objective_nll/convergence identiques sur >=20 payloads varies", async (t) => {
  const oneShot = pythonKappaFitter();
  const worker = new Nb2KappaWorker({ timeoutMs: 20000 });
  t.after(async () => { await worker.shutdown(); });

  const payloads = [];
  for (let i = 0; i < 20; i++) payloads.push(buildPayload(50 + i * 30, 1000 + i, 1 + (i % 4)));

  let maxKappaDelta = 0, maxNllDelta = 0;
  for (const payload of payloads) {
    const r1 = oneShot(payload);
    const r2 = await worker.fit(payload);
    assert.equal(r1.convergence, r2.convergence, "convergence doit correspondre");
    maxKappaDelta = Math.max(maxKappaDelta, Math.abs(r1.kappa_hat - r2.kappa_hat));
    maxNllDelta = Math.max(maxNllDelta, Math.abs(r1.objective_nll - r2.objective_nll));
  }
  console.log(`[fidelite worker/one-shot] max kappa_hat delta=${maxKappaDelta.toExponential(3)} max objective_nll delta=${maxNllDelta.toExponential(3)}`);
  assert.ok(maxKappaDelta <= 1e-9, `max kappa_hat delta ${maxKappaDelta} depasse 1e-9`);
  assert.ok(maxNllDelta <= 1e-9, `max objective_nll delta ${maxNllDelta} depasse 1e-9`);
});
