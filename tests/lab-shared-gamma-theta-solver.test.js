"use strict";
// EXP-005 (audit 2026-09-05, correctif mean-preservation) - contrats du
// solveur theta production : moments fermes valides contre brute-force,
// MEAN-PRESERVATION CONTRACT (item 13), positivite (item 9), NESTED
// LIMIT (item 4), domaine kappa (item 8), determinisme, unicite.

const test = require("node:test");
const assert = require("node:assert/strict");
const { closedFormMoments, checkPositivity, solveThetaForTargetMeans, finalDependenceDiagnostics } = require("../lib/lab/shared-gamma-theta-solver.js");
const { buildSharedGammaMatrixFromTheta } = require("../lib/lab/shared-gamma-matrix.js");

const RHO = -0.0845;
const KAPPA_MIN_ROBUST = 1.0; // pre-enregistre suite au stress test (item 8)

function bruteForceMoments(thetaH, thetaA, kappa, rho) {
  const { matrix, maxGoal } = buildSharedGammaMatrixFromTheta(thetaH, thetaA, kappa, rho);
  let eH = 0, eA = 0, eH2 = 0, eA2 = 0, eHA = 0;
  for (let h = 0; h <= maxGoal; h++) {
    for (let a = 0; a <= maxGoal; a++) {
      const p = matrix[h][a];
      eH += h * p; eA += a * p; eH2 += h * h * p; eA2 += a * a * p; eHA += h * a * p;
    }
  }
  return { eH, eA, eH2, eA2, eHA };
}

test("closedFormMoments (E[H],E[A],E[H^2],E[A^2],E[HA]) valides contre sommation brute-force sur la matrice complete", () => {
  const cases = [[1.5, 1.2, 5], [3, 3, 2], [0.5, 0.5, 2], [2, 2, 10], [1.5, 1.2, 100]];
  for (const [thH, thA, kappa] of cases) {
    const cf = closedFormMoments(thH, thA, kappa, RHO);
    const bf = bruteForceMoments(thH, thA, kappa, RHO);
    assert.ok(Math.abs(cf.eH - bf.eH) < 1e-6, `eH theta=(${thH},${thA}) kappa=${kappa}`);
    assert.ok(Math.abs(cf.eA - bf.eA) < 1e-6, `eA theta=(${thH},${thA}) kappa=${kappa}`);
    assert.ok(Math.abs(cf.eH2 - bf.eH2) < 1e-6, `eH2 theta=(${thH},${thA}) kappa=${kappa}`);
    assert.ok(Math.abs(cf.eA2 - bf.eA2) < 1e-6, `eA2 theta=(${thH},${thA}) kappa=${kappa}`);
    assert.ok(Math.abs(cf.eHA - bf.eHA) < 1e-6, `eHA theta=(${thH},${thA}) kappa=${kappa}`);
  }
});

test("MEAN-PRESERVATION CONTRACT (item 13) : sur la grille pre-enregistree (lambdaH,lambdaA in [0.5,3], kappa in [2,5,10,20,100]), abs(E_M5[H]-lambdaH)<=1e-10 et abs(E_M5[A]-lambdaA)<=1e-10", () => {
  const lambdas = [0.5, 1.0, 1.5, 2.0, 3.0];
  const kappas = [2, 5, 10, 20, 100];
  let maxResidualH = 0, maxResidualA = 0, nChecked = 0;
  for (const lambdaH of lambdas) {
    for (const lambdaA of lambdas) {
      for (const kappa of kappas) {
        const r = solveThetaForTargetMeans(lambdaH, lambdaA, kappa, RHO);
        assert.ok(r.converged, `non convergent pour lambdaH=${lambdaH} lambdaA=${lambdaA} kappa=${kappa}: ${JSON.stringify(r)}`);
        assert.ok(Math.abs(r.residualH) <= 1e-10, `residualH=${r.residualH} depasse 1e-10 (lambdaH=${lambdaH} lambdaA=${lambdaA} kappa=${kappa})`);
        assert.ok(Math.abs(r.residualA) <= 1e-10, `residualA=${r.residualA} depasse 1e-10 (lambdaH=${lambdaH} lambdaA=${lambdaA} kappa=${kappa})`);
        maxResidualH = Math.max(maxResidualH, Math.abs(r.residualH));
        maxResidualA = Math.max(maxResidualA, Math.abs(r.residualA));
        nChecked++;
      }
    }
  }
  console.log(`[mean-preservation] ${nChecked} points verifies, max residualH=${maxResidualH.toExponential(2)}, max residualA=${maxResidualA.toExponential(2)}`);
  assert.equal(nChecked, 125);
});

test("POSITIVITY GATE (item 9) : theta>0 et les 4 tau>0 et Zdc>0 sur toute solution convergee de la grille pre-enregistree", () => {
  const lambdas = [0.5, 1.0, 1.5, 2.0, 3.0];
  const kappas = [2, 5, 10, 20, 100];
  for (const lambdaH of lambdas) {
    for (const lambdaA of lambdas) {
      for (const kappa of kappas) {
        const r = solveThetaForTargetMeans(lambdaH, lambdaA, kappa, RHO);
        assert.ok(r.thetaH > 0 && r.thetaA > 0, `theta non positif pour lambdaH=${lambdaH} lambdaA=${lambdaA} kappa=${kappa}`);
        const m = closedFormMoments(r.thetaH, r.thetaA, kappa, RHO);
        const positivity = checkPositivity(r.thetaH, r.thetaA, m);
        assert.ok(positivity.valid, `positivite violee: ${JSON.stringify(positivity.failedChecks)}`);
      }
    }
  }
});

test("M5_INVALID_PARAMETER_REGION : parametres hors domaine (lambdaH<=0) rejetes explicitement, jamais un clipping silencieux", () => {
  const r = solveThetaForTargetMeans(-1, 1.2, 5, RHO);
  assert.equal(r.converged, false);
  assert.equal(r.errorCode, "M5_INVALID_PARAMETER_REGION");
});

test("NESTED LIMIT (item 4) : quand kappa->infini, thetaH->lambdaH, thetaA->lambdaA, et le residu tend vers zero", () => {
  const lambdaH = 1.5, lambdaA = 1.2;
  const kappas = [1000, 10000, 100000, 1000000];
  const thetaShifts = [];
  for (const kappa of kappas) {
    const r = solveThetaForTargetMeans(lambdaH, lambdaA, kappa, RHO);
    assert.ok(r.converged);
    thetaShifts.push(Math.abs(r.thetaH - lambdaH) + Math.abs(r.thetaA - lambdaA));
  }
  for (let i = 1; i < thetaShifts.length; i++) {
    assert.ok(thetaShifts[i] < thetaShifts[i - 1], `theta doit se rapprocher de lambda quand kappa croit: ${thetaShifts}`);
  }
  assert.ok(thetaShifts[thetaShifts.length - 1] < 1e-6, `a kappa=1e6, theta doit etre tres proche de lambda: shift=${thetaShifts[thetaShifts.length - 1]}`);
});

test("DOMAINE KAPPA (item 8) : kappa>=1 est 100% robuste sur la grille football large (lambdaH/lambdaA=0.1 a 6.0, cas asymetriques), kappa<1 montre des echecs reels", () => {
  const lambdaValues = [0.1, 0.3, 0.6, 1.0, 1.5, 2.0, 3.0, 4.5, 6.0];
  let failuresAtMin = 0, failuresBelowMin = 0;
  for (const lambdaH of lambdaValues) {
    for (const lambdaA of lambdaValues) {
      const rAtMin = solveThetaForTargetMeans(lambdaH, lambdaA, KAPPA_MIN_ROBUST, RHO);
      if (!rAtMin.converged) failuresAtMin++;
      const rBelow = solveThetaForTargetMeans(lambdaH, lambdaA, 0.5, RHO);
      if (!rBelow.converged) failuresBelowMin++;
    }
  }
  console.log(`[domaine kappa] a kappa=${KAPPA_MIN_ROBUST}: ${failuresAtMin}/${lambdaValues.length ** 2} echecs | a kappa=0.5: ${failuresBelowMin}/${lambdaValues.length ** 2} echecs`);
  assert.equal(failuresAtMin, 0, `kappa=${KAPPA_MIN_ROBUST} devrait etre 100% robuste (pre-enregistre comme borne)`);
  assert.ok(failuresBelowMin > 0, "kappa=0.5 (sous la borne) devrait montrer des echecs reels - confirme que la borne n'est pas arbitraire");
});

test("CORRECTIF item 5-6 : la covariance/variance FINALE (apres DC+theta) differe reellement de la formule brute shared-gamma (thetaH*thetaA/kappa), verifiee contre sommation brute-force sur la matrice complete", () => {
  const { buildSharedGammaMatrixFromTheta } = require("../lib/lab/shared-gamma-matrix.js");
  function bruteForceDependence(lambdaH, lambdaA, thetaH, thetaA, kappa, rho) {
    const { matrix, maxGoal } = buildSharedGammaMatrixFromTheta(thetaH, thetaA, kappa, rho);
    let eH2 = 0, eA2 = 0, eHA = 0;
    for (let h = 0; h <= maxGoal; h++) for (let a = 0; a <= maxGoal; a++) { const p = matrix[h][a]; eH2 += h * h * p; eA2 += a * a * p; eHA += h * a * p; }
    return { varH: eH2 - lambdaH * lambdaH, varA: eA2 - lambdaA * lambdaA, cov: eHA - lambdaH * lambdaA };
  }
  for (const [lambdaH, lambdaA, kappa] of [[1.5, 1.2, 5], [3, 3, 2], [0.8, 0.8, 20]]) {
    const solved = solveThetaForTargetMeans(lambdaH, lambdaA, kappa, RHO);
    const diag = finalDependenceDiagnostics(lambdaH, lambdaA, solved.thetaH, solved.thetaA, kappa, RHO);
    const bf = bruteForceDependence(lambdaH, lambdaA, solved.thetaH, solved.thetaA, kappa, RHO);
    assert.ok(Math.abs(diag.varH - bf.varH) < 1e-6, `varH lambda=(${lambdaH},${lambdaA}) kappa=${kappa}`);
    assert.ok(Math.abs(diag.varA - bf.varA) < 1e-6, `varA lambda=(${lambdaH},${lambdaA}) kappa=${kappa}`);
    assert.ok(Math.abs(diag.cov - bf.cov) < 1e-6, `cov lambda=(${lambdaH},${lambdaA}) kappa=${kappa}`);
    const naiveRawCov = lambdaH * lambdaA / kappa;
    assert.notEqual(diag.cov, naiveRawCov, "la covariance FINALE ne doit jamais coincider avec la formule brute shared-gamma (pre-DC), sauf coincidence numerique improbable");
  }
});

test("determinisme : memes entrees -> meme solution exacte", () => {
  const r1 = solveThetaForTargetMeans(1.5, 1.2, 5, RHO);
  const r2 = solveThetaForTargetMeans(1.5, 1.2, 5, RHO);
  assert.deepEqual(r1, r2);
});

test("unicite : plusieurs points de depart internes convergent vers la MEME solution (verifie indirectement : solveThetaForTargetMeans part toujours de theta=lambda, donc on verifie la coherence Newton via une resolution manuelle depuis d'autres departs)", () => {
  // Reproduit une resolution Newton manuelle depuis des departs varies pour verifier l'absence de racines multiples.
  const { closedFormMoments: cfm } = require("../lib/lab/shared-gamma-theta-solver.js");
  function solveFromStart(lambdaH, lambdaA, kappa, rho, startH, startA) {
    let thetaH = startH, thetaA = startA;
    for (let it = 0; it < 50; it++) {
      const m = cfm(thetaH, thetaA, kappa, rho);
      const rH = m.eH - lambdaH, rA = m.eA - lambdaA;
      if (Math.abs(rH) < 1e-10 && Math.abs(rA) < 1e-10) return { thetaH, thetaA };
      const eps = 1e-6;
      const mH1 = cfm(thetaH + eps, thetaA, kappa, rho);
      const mA1 = cfm(thetaH, thetaA + eps, kappa, rho);
      const dHdTh = (mH1.eH - m.eH) / eps, dHdTa = (mA1.eH - m.eH) / eps;
      const dAdTh = (mH1.eA - m.eA) / eps, dAdTa = (mA1.eA - m.eA) / eps;
      const det = dHdTh * dAdTa - dHdTa * dAdTh;
      if (Math.abs(det) < 1e-14) return { thetaH, thetaA, failed: true };
      thetaH -= (rH * dAdTa - rA * dHdTa) / det;
      thetaA -= (rA * dHdTh - rH * dAdTh) / det;
      if (thetaH <= 0) thetaH = lambdaH * 0.01;
      if (thetaA <= 0) thetaA = lambdaA * 0.01;
    }
    return { thetaH, thetaA, failed: true };
  }
  const starts = [[1.5, 1.2], [0.5, 0.5], [3, 3], [0.1, 5]];
  const solutions = starts.map(([sH, sA]) => solveFromStart(1.5, 1.2, 5, RHO, sH, sA));
  for (const s of solutions) assert.ok(!s.failed);
  for (let i = 1; i < solutions.length; i++) {
    assert.ok(Math.abs(solutions[i].thetaH - solutions[0].thetaH) < 1e-6, "solution non-unique detectee");
    assert.ok(Math.abs(solutions[i].thetaA - solutions[0].thetaA) < 1e-6, "solution non-unique detectee");
  }
});
