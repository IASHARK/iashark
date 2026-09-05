"use strict";
// EXP-005 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - contrats sur la
// distribution jointe shared-gamma + correction DC fixe : normalisation,
// M5_INVALID_NORMALIZATION explicite, et surtout le NESTED LIMIT CONTRACT
// (item 6) : quand kappa->infini, M5 doit revenir vers M2 Dixon-Coles
// rho=-0.0845 - propriete FONDAMENTALE du candidat.

const test = require("node:test");
const assert = require("node:assert/strict");
const { jointQ, computeZdc, logProbabilityM5, probabilityM5, impliedCovariance, impliedCorrelation } = require("../lib/lab/shared-gamma-dc.js");
const { buildAdaptiveMatrix } = require("../lib/lab/dc-matrix-with-rho.js");

const RHO = -0.0845;

test("q(h,a) (avant correction DC) se normalise a 1 pour plusieurs (muH,muA,kappa) realistes", () => {
  for (const [muH, muA, kappa] of [[1.5, 1.2, 5], [0.8, 0.9, 2], [2.6, 2.7, 50], [3.4, 3.0, 0.5]]) {
    let sum = 0;
    for (let h = 0; h < 250; h++) for (let a = 0; a < 250; a++) sum += jointQ(h, a, muH, muA, kappa);
    assert.ok(Math.abs(sum - 1) < 1e-8, `muH=${muH} muA=${muA} kappa=${kappa} sum=${sum}`);
  }
});

test("P_M5 (apres correction DC, normalisee par Zdc) se normalise a 1", () => {
  for (const [muH, muA, kappa] of [[1.5, 1.2, 5], [0.8, 0.9, 2], [2.6, 2.7, 50]]) {
    let sum = 0;
    for (let h = 0; h < 250; h++) for (let a = 0; a < 250; a++) sum += probabilityM5(muH, muA, h, a, kappa, RHO);
    assert.ok(Math.abs(sum - 1) < 1e-7, `muH=${muH} muA=${muA} kappa=${kappa} sum=${sum}`);
  }
});

test("Zdc fini et proche de 1 (la correction DC est une petite perturbation), jamais exactement 1 en general", () => {
  const zdc = computeZdc(1.5, 1.2, 5, RHO);
  assert.ok(Number.isFinite(zdc) && zdc > 0);
  assert.ok(Math.abs(zdc - 1) < 0.05, `Zdc=${zdc} devrait rester une petite perturbation autour de 1`);
});

test("NESTED LIMIT CONTRACT (item 6) : quand kappa augmente, M5 converge de facon MONOTONE vers la matrice DC normalisee (lib/lab/dc-matrix-with-rho.js), proportionnellement a 1/kappa - propriete theorique attendue du melange shared-gamma", () => {
  const muH = 1.5, muA = 1.2;
  const adaptive = buildAdaptiveMatrix(muH, muA, RHO);
  const kappas = [10, 50, 100, 500, 1000, 5000, 10000, 50000, 100000, 1000000];
  const maxDiffs = kappas.map((kappa) => {
    let maxDiff = 0;
    for (let h = 0; h <= 8; h++) {
      for (let a = 0; a <= 8; a++) {
        const diff = Math.abs(probabilityM5(muH, muA, h, a, kappa, RHO) - adaptive.matrix[h][a]);
        if (diff > maxDiff) maxDiff = diff;
      }
    }
    return maxDiff;
  });

  console.log(`[nested limit] maxDiff par kappa: ${kappas.map((k, i) => `${k}:${maxDiffs[i].toExponential(2)}`).join(", ")}`);

  // convergence STRICTEMENT monotone (chaque kappa plus grand doit reduire l'ecart)
  for (let i = 1; i < maxDiffs.length; i++) {
    assert.ok(maxDiffs[i] < maxDiffs[i - 1], `convergence non-monotone entre kappa=${kappas[i - 1]} (${maxDiffs[i - 1]}) et kappa=${kappas[i]} (${maxDiffs[i]})`);
  }
  // a kappa=1e6 (borne haute du fitter reel, item 9), l'ecart doit etre tres petit sans exiger artificiellement 1e-12
  assert.ok(maxDiffs[maxDiffs.length - 1] < 1e-6, `a kappa=1e6, maxDiff=${maxDiffs[maxDiffs.length - 1]} devrait etre <1e-6`);
  // verifie empiriquement le taux de convergence attendu O(1/kappa) : le produit maxDiff*kappa doit rester quasi-constant
  const products = maxDiffs.map((d, i) => d * kappas[i]);
  const meanProduct = products.reduce((a, b) => a + b, 0) / products.length;
  for (const p of products) assert.ok(Math.abs(p - meanProduct) / meanProduct < 0.05, `taux de convergence non conforme a O(1/kappa) : produits=${products}`);
});

test("M5_INVALID_NORMALIZATION : tau<=0 (hors domaine rho pour ce couple lambda/score) leve une erreur explicite, jamais une probabilite fabriquee", () => {
  assert.throws(
    () => logProbabilityM5(3.0, 3.0, 0, 0, 5, 0.5), // 1 - 9*0.5 = -3.5 < 0
    (err) => err.code === "M5_INVALID_NORMALIZATION"
  );
});

test("domaine invalide (h/a non entier, mu<=0, kappa<=0) -> exception explicite, jamais un NaN silencieux", () => {
  assert.throws(() => logProbabilityM5(1.5, 1.2, -1, 0, 5, RHO));
  assert.throws(() => logProbabilityM5(0, 1.2, 0, 0, 5, RHO));
  assert.throws(() => logProbabilityM5(1.5, 1.2, 0, 0, 0, RHO));
});

test("diagnostics de dependance : Cov(H,A)=muH*muA/kappa decroit quand kappa croit, correlation implicite positive pour rho petit negatif", () => {
  const muH = 1.5, muA = 1.2;
  const covSmallKappa = impliedCovariance(muH, muA, 2);
  const covLargeKappa = impliedCovariance(muH, muA, 50);
  assert.ok(covSmallKappa > covLargeKappa);
  assert.ok(impliedCorrelation(muH, muA, 5) > 0, "un facteur latent commun positif implique une correlation positive entre buts domicile/exterieur");
});
