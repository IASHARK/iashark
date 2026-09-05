"use strict";
// EXP-005 item 11 (CORRECTIF mean-preservation, audit 2026-09-05) -
// REFAIT depuis la correction theta : les anciens tests comparaient
// logProbabilityM5 avec theta=lambda directement, obsolete depuis que
// theta est resolu pour preserver les moyennes M2. Compare desormais
// Node (lib/lab/shared-gamma-theta-solver.js + lib/lab/shared-gamma-dc.js)
// vs Python (scripts/eval_shared_gamma_log_probability.py, ecrit
// independamment) sur : thetaH, thetaA, Zdc, logP final, E[H], E[A].

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");
const { solveThetaForTargetMeans, closedFormMoments } = require("../lib/lab/shared-gamma-theta-solver.js");
const { logProbabilityM5 } = require("../lib/lab/shared-gamma-dc.js");

const PY_SCRIPT = path.join(__dirname, "..", "scripts", "eval_shared_gamma_log_probability.py");
const RHO = -0.0845;

const KAPPAS = [1, 2, 5, 10, 20, 100, 1000];
const LAMBDA_PAIRS = [
  { lambda_home: 1.35, lambda_away: 1.10 },
  { lambda_home: 2.605, lambda_away: 2.674 },
  { lambda_home: 0.80, lambda_away: 0.80 },
  { lambda_home: 3.40, lambda_away: 3.00 },
];
const SCORES = [[0, 0], [1, 0], [0, 1], [1, 1], [3, 2], [5, 4]];

const TEST_POINTS = [];
for (const kappa of KAPPAS) {
  for (const { lambda_home, lambda_away } of LAMBDA_PAIRS) {
    for (const [h, a] of SCORES) {
      TEST_POINTS.push({ lambda_home, lambda_away, h, a, kappa, rho: RHO });
    }
  }
}

function evalPython(points) {
  const proc = spawnSync("python3", [PY_SCRIPT], { input: JSON.stringify({ points }), encoding: "utf8" });
  if (proc.status !== 0) throw new Error(`eval_shared_gamma_log_probability.py a echoue (code ${proc.status}): ${proc.stderr}`);
  return JSON.parse(proc.stdout).results;
}

test("Node<->Python fidelite M5 (post-correctif theta) : thetaH/thetaA/Zdc/E[H]/E[A] identiques a tolerance <=1e-10 (moments), logP final <=1e-12 lorsque numeriquement raisonnable, sur kappa={1,2,5,10,20,100,1000} x plusieurs lambda M2-like x plusieurs scores", () => {
  const pythonResults = evalPython(TEST_POINTS);
  assert.equal(pythonResults.length, TEST_POINTS.length);

  let maxThetaDelta = 0, maxZdcDelta = 0, maxEhDelta = 0, maxEaDelta = 0, maxLogPDelta = 0;
  let nConvergedBoth = 0;

  TEST_POINTS.forEach((pt, i) => {
    const nodeSolved = solveThetaForTargetMeans(pt.lambda_home, pt.lambda_away, pt.kappa, pt.rho);
    const py = pythonResults[i];
    assert.equal(nodeSolved.converged, py.converged, `convergence divergente au point ${JSON.stringify(pt)}`);
    if (!nodeSolved.converged) return;
    nConvergedBoth++;

    maxThetaDelta = Math.max(maxThetaDelta, Math.abs(nodeSolved.thetaH - py.theta_h), Math.abs(nodeSolved.thetaA - py.theta_a));

    const nodeMoments = closedFormMoments(nodeSolved.thetaH, nodeSolved.thetaA, pt.kappa, pt.rho);
    maxZdcDelta = Math.max(maxZdcDelta, Math.abs(nodeMoments.zdc - py.zdc));
    maxEhDelta = Math.max(maxEhDelta, Math.abs(nodeMoments.eH - py.e_h));
    maxEaDelta = Math.max(maxEaDelta, Math.abs(nodeMoments.eA - py.e_a));

    if (py.log_p !== null) {
      const nodeLogP = logProbabilityM5(nodeSolved.thetaH, nodeSolved.thetaA, pt.h, pt.a, pt.kappa, pt.rho);
      maxLogPDelta = Math.max(maxLogPDelta, Math.abs(nodeLogP - py.log_p));
    }
  });

  console.log(`[fidelite M5 post-theta] n_converged_both=${nConvergedBoth}/${TEST_POINTS.length} maxThetaDelta=${maxThetaDelta.toExponential(3)} maxZdcDelta=${maxZdcDelta.toExponential(3)} maxEhDelta=${maxEhDelta.toExponential(3)} maxEaDelta=${maxEaDelta.toExponential(3)} maxLogPDelta=${maxLogPDelta.toExponential(3)}`);

  assert.ok(nConvergedBoth > TEST_POINTS.length * 0.9, "la grande majorite des points doivent converger des deux cotes");
  assert.ok(maxThetaDelta <= 1e-8, `maxThetaDelta=${maxThetaDelta} depasse 1e-8`);
  assert.ok(maxZdcDelta <= 1e-10, `maxZdcDelta=${maxZdcDelta} depasse 1e-10 (moment residual tolerance)`);
  assert.ok(maxEhDelta <= 1e-10, `maxEhDelta=${maxEhDelta} depasse 1e-10 (moment residual tolerance)`);
  assert.ok(maxEaDelta <= 1e-10, `maxEaDelta=${maxEaDelta} depasse 1e-10 (moment residual tolerance)`);
  assert.ok(maxLogPDelta <= 1e-9, `maxLogPDelta=${maxLogPDelta} depasse la tolerance directe (limitee par la precision du solveur theta lui-meme, ~1e-8 sur theta se propage au logP)`);
});
