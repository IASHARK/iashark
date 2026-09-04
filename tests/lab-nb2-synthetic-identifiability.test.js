"use strict";
// EXP-004 item 10 (SPEC LAB PRO v1.0, M4 NB2) - le VRAI scripts/fit_kappa.py
// doit recuperer un kappa coherent sur des donnees generees par son
// propre modele (NB2), pour kappa_true=2,5,20 et un scenario
// quasi-Poisson. Regle du protocole : si cette identifiabilite echoue,
// EXP-004 reel (donnees M2 reelles) est interdit.

const test = require("node:test");
const assert = require("node:assert/strict");
const { runIdentifiabilityCheckNB2 } = require("../lib/lab/nb2-synthetic-identifiability.js");

const NUMERICAL_TOLERANCE = 1e-6; // tolerance sur la propriete NLL(kappa_hat) <= NLL(kappa_true) + tolerance

function checkMleProperty(r) {
  assert.ok(
    r.nll_at_kappa_hat <= r.nll_at_kappa_true + NUMERICAL_TOLERANCE,
    `NLL(kappa_hat=${r.kappa_hat})=${r.nll_at_kappa_hat} doit etre <= NLL(kappa_true=${r.kappa_true})=${r.nll_at_kappa_true} + tolerance (le fitter DOIT ameliorer ou egaler la vraisemblance au vrai parametre, sinon bug reel)`
  );
}

test("identifiabilite NB2 : kappa_true=2 (forte surdispersion) - fit_kappa.py recupere une valeur coherente, NLL(kappa_hat)<=NLL(kappa_true)", () => {
  const r = runIdentifiabilityCheckNB2({ kappaTrue: 2, nTeams: 20, nSeasons: 3, seed: 101 });
  console.log(`[identifiabilite NB2 kappa_true=2] kappa_hat=${r.kappa_hat.toFixed(3)} abs_error=${r.abs_error.toFixed(3)} log_error=${r.log_error.toFixed(3)} N=${r.n_matches}`);
  checkMleProperty(r);
  assert.ok(r.log_error < 0.5, `log_error=${r.log_error} trop eleve pour kappa_true=2`);
  assert.ok(r.nll_at_kappa_hat < r.nll_at_poisson_limit, "a kappa_true=2, la vraie surdispersion doit battre nettement la limite Poisson");
});

test("identifiabilite NB2 : kappa_true=5 - fit_kappa.py recupere une valeur coherente, NLL(kappa_hat)<=NLL(kappa_true)", () => {
  const r = runIdentifiabilityCheckNB2({ kappaTrue: 5, nTeams: 20, nSeasons: 3, seed: 202 });
  console.log(`[identifiabilite NB2 kappa_true=5] kappa_hat=${r.kappa_hat.toFixed(3)} abs_error=${r.abs_error.toFixed(3)} log_error=${r.log_error.toFixed(3)} N=${r.n_matches}`);
  checkMleProperty(r);
  assert.ok(r.log_error < 0.5, `log_error=${r.log_error} trop eleve pour kappa_true=5`);
});

test("identifiabilite NB2 : kappa_true=20 (surdispersion moderee) - fit_kappa.py recupere une valeur coherente, NLL(kappa_hat)<=NLL(kappa_true)", () => {
  const r = runIdentifiabilityCheckNB2({ kappaTrue: 20, nTeams: 20, nSeasons: 3, seed: 303 });
  console.log(`[identifiabilite NB2 kappa_true=20] kappa_hat=${r.kappa_hat.toFixed(3)} abs_error=${r.abs_error.toFixed(3)} log_error=${r.log_error.toFixed(3)} N=${r.n_matches}`);
  checkMleProperty(r);
  assert.ok(r.log_error < 0.7, `log_error=${r.log_error} trop eleve pour kappa_true=20`);
});

test("identifiabilite NB2 : scenario quasi-Poisson (kappa_true=2000, surdispersion negligeable) - reconnu comme limite/parcimonie, PAS un faux signal NB", () => {
  const r = runIdentifiabilityCheckNB2({ kappaTrue: 2000, nTeams: 20, nSeasons: 3, seed: 404 });
  console.log(`[identifiabilite NB2 quasi-Poisson kappa_true=2000] kappa_hat=${r.kappa_hat.toFixed(1)} numerical_boundary_status=${r.fit.numerical_boundary_status} NLL(hat)=${r.nll_at_kappa_hat.toFixed(6)} NLL(Poisson)=${r.nll_at_poisson_limit.toFixed(6)}`);
  checkMleProperty(r);
  // A kappa_true=2000, la surdispersion est quasi-nulle : NLL(kappa_hat) et NLL(limite Poisson) doivent etre quasi-identiques (le modele ne doit pas fabriquer un faux signal de surdispersion).
  assert.ok(
    Math.abs(r.nll_at_kappa_hat - r.nll_at_poisson_limit) < 0.01,
    `scenario quasi-Poisson : NLL(kappa_hat)=${r.nll_at_kappa_hat} et NLL(Poisson)=${r.nll_at_poisson_limit} devraient etre quasi-identiques, pas un faux signal NB`
  );
});
