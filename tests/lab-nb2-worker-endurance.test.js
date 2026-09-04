"use strict";
// EXP-004 (audit 2026-09-05, correctif hang subprocess) - item 8 :
// endurance du worker PERSISTANT sur >=300 fits consecutifs (couvre
// largement les ~229 cutoffs attendus au run reel). Contrairement au
// fitter one-shot (qui re-importe scipy/numpy a CHAQUE appel et degrade
// progressivement jusqu'au blocage complet, voir
// scripts/diagnose_fit_kappa_hang.js), le worker ne paie ce cout qu'UNE
// fois - ce test verifie que ca tient reellement sur la duree.

const test = require("node:test");
const assert = require("node:assert/strict");
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

test("endurance worker persistant : 300 fits consecutifs, 0 timeout, 0 crash, determinisme strict, temps total raisonnable", { timeout: 300000 }, async (t) => {
  const rng = mulberry32(777);
  const rows = [];
  for (let i = 0; i < 400; i++) rows.push({ muHome: 0.5 + rng() * 3, muAway: 0.5 + rng() * 3, h: Math.floor(rng() * 6), a: Math.floor(rng() * 6) });

  const worker = new Nb2KappaWorker({ timeoutMs: 20000 });
  t.after(async () => { await worker.shutdown(); });

  const results = [];
  const t0 = Date.now();
  for (let i = 0; i < 300; i++) {
    const r = await worker.fit(rows);
    results.push(r);
    if (r.reason === "FIT_PROCESS_TIMEOUT" || r.reason === "WORKER_CRASHED") {
      assert.fail(`echec a l'iteration ${i}: ${JSON.stringify(r)}`);
    }
  }
  const totalMs = Date.now() - t0;

  const nSuccess = results.filter((r) => r.convergence).length;
  const nTimeout = results.filter((r) => r.reason === "FIT_PROCESS_TIMEOUT").length;
  const nCrash = results.filter((r) => r.reason === "WORKER_CRASHED").length;
  const kappaValues = results.map((r) => r.kappa_hat);
  const allSame = kappaValues.every((k) => k === kappaValues[0]);

  console.log(`[endurance 300 fits] total_ms=${totalMs} success=${nSuccess}/300 timeouts=${nTimeout} crashes=${nCrash} determinisme(meme payload->meme kappa_hat)=${allSame} kappa_hat=${kappaValues[0]}`);

  assert.equal(nSuccess, 300, "300/300 fits doivent converger");
  assert.equal(nTimeout, 0, "0 timeout attendu sur le worker persistant");
  assert.equal(nCrash, 0, "0 crash attendu");
  assert.ok(allSame, "meme payload -> meme kappa_hat sur les 300 iterations (determinisme strict)");
});
