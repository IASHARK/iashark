"use strict";
// EXP-004 (SPEC LAB PRO v1.0, M4 NB2) - contrats sur la parametrisation
// NB2 officielle : Var(Y)=mu+mu^2/kappa, PMF exacte, limite Poisson
// quand kappa->infini, normalisation, lgamma haute precision.

const test = require("node:test");
const assert = require("node:assert/strict");
const { lgamma, logPmfNB2, pmfNB2, cdfNB2, varianceNB2 } = require("../lib/lab/nb2.js");
const { poissonProb } = require("../lib/models.js");

test("lgamma: valeurs connues exactes (lgamma(1)=lgamma(2)=0, lgamma(6)=ln(120), lgamma(0.5)=0.5ln(pi))", () => {
  assert.equal(lgamma(1), 0);
  assert.equal(lgamma(2), 0);
  assert.ok(Math.abs(lgamma(6) - Math.log(120)) < 1e-12);
  assert.ok(Math.abs(lgamma(0.5) - 0.5 * Math.log(Math.PI)) < 1e-12);
});

test("lgamma: rejette un argument <=0 explicitement (jamais un NaN silencieux)", () => {
  assert.throws(() => lgamma(0), /argument doit etre > 0/);
  assert.throws(() => lgamma(-3), /argument doit etre > 0/);
});

test("Var(Y) = mu + mu^2/kappa, exactement la formule officielle", () => {
  assert.equal(varianceNB2(2, 4), 2 + 4 / 4);
  assert.equal(varianceNB2(1.5, 10), 1.5 + (1.5 * 1.5) / 10);
});

test("PMF NB2 se normalise a 1 (somme sur y=0..199) pour plusieurs (mu,kappa) realistes", () => {
  for (const [mu, kappa] of [[0.8, 3], [1.5, 5], [2.6, 0.5], [3.2, 50]]) {
    let sum = 0;
    for (let y = 0; y < 200; y++) sum += pmfNB2(y, mu, kappa);
    assert.ok(Math.abs(sum - 1) < 1e-9, `mu=${mu} kappa=${kappa} sum=${sum}`);
  }
});

test("limite Poisson : NB2(mu,kappa) -> Poisson(mu) quand kappa->infini (kappa=1e7, ecart <1e-6 par point)", () => {
  const mu = 1.5;
  for (const y of [0, 1, 2, 3, 5, 8]) {
    const nb = pmfNB2(y, mu, 1e7);
    const pois = poissonProb(mu, y);
    assert.ok(Math.abs(nb - pois) < 1e-6, `y=${y} nb=${nb} pois=${pois}`);
  }
});

test("petit kappa = forte surdispersion : Var(Y) croit strictement quand kappa diminue, a mu fixe", () => {
  const mu = 2.0;
  const varSmallKappa = varianceNB2(mu, 0.5);
  const varLargeKappa = varianceNB2(mu, 50);
  assert.ok(varSmallKappa > varLargeKappa);
  assert.ok(varSmallKappa > mu, "petit kappa doit surdisperser strictement au-dela de la variance Poisson (=mu)");
  assert.ok(Math.abs(varLargeKappa - mu) < 0.1, "grand kappa doit approcher la variance Poisson (=mu)");
});

test("cdfNB2 est croissante et tend vers 1 (bornes de queue negligeables a M=200)", () => {
  const mu = 3, kappa = 2;
  let prev = 0;
  for (const M of [0, 1, 5, 20, 50, 200]) {
    const c = cdfNB2(M, mu, kappa);
    assert.ok(c >= prev - 1e-15, `CDF doit etre croissante, M=${M}`);
    prev = c;
  }
  assert.ok(Math.abs(prev - 1) < 1e-9, `CDF(200) doit etre ~1, obtenu ${prev}`);
});

test("domaine invalide -> exception explicite, jamais un NaN silencieux", () => {
  assert.throws(() => logPmfNB2(-1, 1.5, 5), /y doit etre un entier/);
  assert.throws(() => logPmfNB2(1.5, 1.5, 5), /y doit etre un entier/);
  assert.throws(() => logPmfNB2(0, 0, 5), /mu doit etre >0/);
  assert.throws(() => logPmfNB2(0, 1.5, 0), /kappa doit etre >0/);
  assert.throws(() => logPmfNB2(0, 1.5, -2), /kappa doit etre >0/);
});
