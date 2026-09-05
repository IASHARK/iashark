"use strict";
// EXP-005 item 12 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - le VRAI
// fitter (scripts/fit_m5_kappa_worker.py) doit recuperer un kappa
// coherent sur des donnees generees par son propre modele (shared-gamma+DC),
// pour kappa_true=2,5,20 et un scenario quasi-M2. UN SEUL worker
// partage entre tous les tests (lecon du diagnostic hang 2026-09-05 -
// jamais respawner un process par test/payload).

const test = require("node:test");
const assert = require("node:assert/strict");
const { runIdentifiabilityCheckM5 } = require("../lib/lab/shared-gamma-synthetic-identifiability.js");
const { SharedGammaKappaWorker } = require("../lib/lab/shared-gamma-python-worker.js");

const NUMERICAL_TOLERANCE = 1e-6;

function checkMleProperty(r) {
  assert.ok(
    r.nll_at_kappa_hat <= r.nll_at_kappa_true + NUMERICAL_TOLERANCE,
    `NLL(kappa_hat=${r.kappa_hat})=${r.nll_at_kappa_hat} doit etre <= NLL(kappa_true=${r.kappa_true})=${r.nll_at_kappa_true} + tolerance`
  );
}

let sharedWorker;
test.before(() => { sharedWorker = new SharedGammaKappaWorker({ timeoutMs: 20000 }); });
test.after(async () => { await sharedWorker.shutdown(); });

test("identifiabilite M5 : kappa_true=2 (forte dependance) - le fitter recupere une valeur coherente, NLL(kappa_hat)<=NLL(kappa_true)", async () => {
  const r = await runIdentifiabilityCheckM5({ kappaTrue: 2, nTeams: 20, nSeasons: 3, seed: 111, worker: sharedWorker });
  console.log(`[identifiabilite M5 kappa_true=2] kappa_hat=${r.kappa_hat.toFixed(3)} abs_error=${r.abs_error.toFixed(3)} log_error=${r.log_error.toFixed(3)} N=${r.n_matches}`);
  checkMleProperty(r);
  assert.ok(r.log_error < 0.5, `log_error=${r.log_error} trop eleve pour kappa_true=2`);
  assert.ok(r.nll_at_kappa_hat < r.nll_at_m2_limit, "a kappa_true=2, la vraie dependance doit battre nettement la limite M2 (independance)");
});

test("identifiabilite M5 : kappa_true=5 - le fitter recupere une valeur coherente, NLL(kappa_hat)<=NLL(kappa_true)", async () => {
  const r = await runIdentifiabilityCheckM5({ kappaTrue: 5, nTeams: 20, nSeasons: 3, seed: 222, worker: sharedWorker });
  console.log(`[identifiabilite M5 kappa_true=5] kappa_hat=${r.kappa_hat.toFixed(3)} abs_error=${r.abs_error.toFixed(3)} log_error=${r.log_error.toFixed(3)} N=${r.n_matches}`);
  checkMleProperty(r);
  assert.ok(r.log_error < 0.6, `log_error=${r.log_error} trop eleve pour kappa_true=5`);
});

test("identifiabilite M5 : kappa_true=20 (dependance moderee) - le fitter recupere une valeur coherente, NLL(kappa_hat)<=NLL(kappa_true)", async () => {
  const r = await runIdentifiabilityCheckM5({ kappaTrue: 20, nTeams: 20, nSeasons: 3, seed: 333, worker: sharedWorker });
  console.log(`[identifiabilite M5 kappa_true=20] kappa_hat=${r.kappa_hat.toFixed(3)} abs_error=${r.abs_error.toFixed(3)} log_error=${r.log_error.toFixed(3)} N=${r.n_matches}`);
  checkMleProperty(r);
  // La borne est plus large qu'a kappa_true=2/5 : le signal de dependance
  // decroit en O(1/kappa) (voir tests/lab-shared-gamma-dc.test.js#"NESTED
  // LIMIT CONTRACT") - a kappa=20 le signal est deja faible, donc plus
  // sensible au bruit d'echantillonnage sur N=1140 matchs. Verifie sur
  // plusieurs seeds (333/555/777/999) : log_error observe entre 0.03 et
  // 1.22 - la propriete MLE ci-dessus (garantie mathematiquement par un
  // minimiseur correct, pas un artefact de seed) reste le VRAI critere de
  // reussite ; cette borne n'est qu'un garde-fou contre une divergence
  // totale du fitter (ex: kappa_hat pousse a la borne ou reste bloque a 10).
  assert.ok(r.log_error < 2.0, `log_error=${r.log_error} trop eleve pour kappa_true=20 (divergence suspecte du fitter, pas juste du bruit d'echantillonnage)`);
});

test("identifiabilite M5 : scenario quasi-M2 (kappa_true=50000, dependance negligeable) - reconnu comme limite/parcimonie, PAS un faux signal de dependance", async () => {
  const r = await runIdentifiabilityCheckM5({ kappaTrue: 50000, nTeams: 20, nSeasons: 3, seed: 444, worker: sharedWorker });
  console.log(`[identifiabilite M5 quasi-M2 kappa_true=50000] kappa_hat=${r.kappa_hat.toFixed(1)} numerical_boundary_status=${r.fit.numerical_boundary_status} NLL(hat)=${r.nll_at_kappa_hat.toFixed(6)} NLL(M2-limit)=${r.nll_at_m2_limit.toFixed(6)}`);
  checkMleProperty(r);
  assert.ok(
    Math.abs(r.nll_at_kappa_hat - r.nll_at_m2_limit) < 0.01,
    `scenario quasi-M2 : NLL(kappa_hat)=${r.nll_at_kappa_hat} et NLL(limite M2)=${r.nll_at_m2_limit} devraient etre quasi-identiques, pas un faux signal de dependance`
  );
});
