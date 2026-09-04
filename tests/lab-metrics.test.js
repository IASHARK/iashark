"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { exactScoreNLL, binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier, lowScoreDiagnostics } = require("../lib/lab/metrics.js");

test("exactScoreNLL: cas calculable a la main - lambdaH=lambdaA=1, rho=0 (Poisson pur), score observe 0-0", () => {
  // P(0,0) = Poisson(0;1) * Poisson(0;1) * tau(0,0,1,1,0) = e^-1 * e^-1 * 1 = e^-2
  // NLL = -ln(e^-2) = 2
  const nll = exactScoreNLL([{ lambdaH: 1, lambdaA: 1, rho: 0, h: 0, a: 0 }]);
  assert.ok(Math.abs(nll - 2) < 1e-9, `NLL=${nll}, attendu exactement 2 (calcul a la main : -ln(e^-2))`);
});

test("exactScoreNLL: moyenne correcte sur plusieurs predictions", () => {
  const preds = [
    { lambdaH: 1, lambdaA: 1, rho: 0, h: 0, a: 0 }, // NLL=2
    { lambdaH: 1, lambdaA: 1, rho: 0, h: 1, a: 1 }, // P(1,1)=e^-1*1*e^-1*1*tau(1,1,rho=0)=e^-2*1=e^-2, meme NLL=2 (tau(1,1,rho=0)=1-0=1)
  ];
  const nll = exactScoreNLL(preds);
  assert.ok(Math.abs(nll - 2) < 1e-9, `moyenne de deux NLL identiques (2,2) doit valoir 2, obtenu ${nll}`);
});

test("binaryLogLoss: cas calculable a la main - une prediction parfaite, une completement fausse", () => {
  // item1: prob=0.9, outcome=1 -> -ln(0.9) ~= 0.10536
  // item2: prob=0.9, outcome=0 -> -ln(0.1) ~= 2.30259
  // moyenne = (0.10536+2.30259)/2 ~= 1.20397
  const ll = binaryLogLoss([{ prob: 0.9, outcome: 1 }, { prob: 0.9, outcome: 0 }]);
  const expected = (-Math.log(0.9) + -Math.log(0.1)) / 2;
  assert.ok(Math.abs(ll - expected) < 1e-9, `ll=${ll}, attendu ${expected}`);
});

test("binaryBrier: cas calculable a la main", () => {
  // item1: (0.7-1)^2 = 0.09 ; item2: (0.7-0)^2 = 0.49 ; moyenne = 0.29
  const b = binaryBrier([{ prob: 0.7, outcome: 1 }, { prob: 0.7, outcome: 0 }]);
  assert.ok(Math.abs(b - 0.29) < 1e-9, `brier=${b}, attendu 0.29`);
});

test("multiclassLogLoss: cas calculable a la main", () => {
  // item1: probs={p1:0.5,pN:0.3,p2:0.2}, outcome='p1' -> -ln(0.5)
  const ll = multiclassLogLoss([{ probs: { p1: 0.5, pN: 0.3, p2: 0.2 }, outcome: "p1" }]);
  assert.ok(Math.abs(ll - (-Math.log(0.5))) < 1e-9);
});

test("multiclassBrier: cas calculable a la main", () => {
  // outcome='p1' -> y=[1,0,0]. probs=[0.5,0.3,0.2].
  // (0.5-1)^2+(0.3-0)^2+(0.2-0)^2 = 0.25+0.09+0.04 = 0.38
  const b = multiclassBrier([{ probs: { p1: 0.5, pN: 0.3, p2: 0.2 }, outcome: "p1" }]);
  assert.ok(Math.abs(b - 0.38) < 1e-9, `brier=${b}, attendu 0.38`);
});

test("lowScoreDiagnostics: compte et moyennes correctes sur un jeu synthetique controle", () => {
  const preds = [
    { lambdaH: 1, lambdaA: 1, h: 0, a: 0, rhoM0: 0, rhoM1: 0 },
    { lambdaH: 1, lambdaA: 1, h: 0, a: 0, rhoM0: 0, rhoM1: 0 },
    { lambdaH: 1, lambdaA: 1, h: 1, a: 0, rhoM0: 0, rhoM1: 0 },
  ];
  const diag = lowScoreDiagnostics(preds);
  assert.equal(diag["0-0"].count_observed, 2);
  assert.equal(diag["1-0"].count_observed, 1);
  assert.equal(diag["0-1"].count_observed, 0);
  assert.equal(diag["1-1"].count_observed, 0);
  // P(0,0) avec lambdaH=lambdaA=1, rho=0 : e^-1*e^-1*1 = e^-2
  const expectedP00 = Math.exp(-1) * Math.exp(-1) * 1;
  assert.ok(Math.abs(diag["0-0"].mean_prob_m0 - expectedP00) < 1e-9);
});

test("exactScoreNLL: liste vide -> null, jamais une valeur fabriquee", () => {
  assert.equal(exactScoreNLL([]), null);
});
