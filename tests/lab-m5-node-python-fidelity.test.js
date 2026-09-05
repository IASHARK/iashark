"use strict";
// EXP-005 item 11 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - preuve
// croisee que lib/lab/shared-gamma-dc.js (Node, reference) et
// scripts/eval_shared_gamma_log_probability.py (Python, ecrit
// independamment) calculent EXACTEMENT la meme chose, sur
// kappa={1,2,5,10,20,100,1000} x plusieurs mu M2-like x plusieurs scores.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");
const { logProbabilityM5 } = require("../lib/lab/shared-gamma-dc.js");

const PY_SCRIPT = path.join(__dirname, "..", "scripts", "eval_shared_gamma_log_probability.py");
const RHO = -0.0845;

const KAPPAS = [1, 2, 5, 10, 20, 100, 1000];
const MU_PAIRS = [
  { mu_home: 1.35, mu_away: 1.10 },
  { mu_home: 2.605, mu_away: 2.674 },
  { mu_home: 0.80, mu_away: 0.80 },
  { mu_home: 3.40, mu_away: 3.00 },
];
const SCORES = [[0, 0], [1, 0], [0, 1], [1, 1], [3, 2], [5, 4]];

const TEST_POINTS = [];
for (const kappa of KAPPAS) {
  for (const { mu_home, mu_away } of MU_PAIRS) {
    for (const [h, a] of SCORES) {
      TEST_POINTS.push({ mu_home, mu_away, h, a, kappa, rho: RHO });
    }
  }
}

function evalPython(points) {
  const proc = spawnSync("python3", [PY_SCRIPT], { input: JSON.stringify({ points }), encoding: "utf8" });
  if (proc.status !== 0) throw new Error(`eval_shared_gamma_log_probability.py a echoue (code ${proc.status}): ${proc.stderr}`);
  return JSON.parse(proc.stdout).log_probabilities;
}

test("Node<->Python fidelite M5: logProbabilityM5 identique a tolerance <=1e-12 sur kappa={1,2,5,10,20,100,1000} x plusieurs mu M2-like x plusieurs scores", () => {
  const pythonResults = evalPython(TEST_POINTS);
  assert.equal(pythonResults.length, TEST_POINTS.length);

  let maxDelta = 0, maxDeltaDetail = null;
  const perKappaMax = {};
  TEST_POINTS.forEach((pt, i) => {
    const nodeVal = logProbabilityM5(pt.mu_home, pt.mu_away, pt.h, pt.a, pt.kappa, pt.rho);
    const pyVal = pythonResults[i];
    const delta = Math.abs(nodeVal - pyVal);
    if (delta > maxDelta) { maxDelta = delta; maxDeltaDetail = { point: pt, nodeVal, pyVal }; }
    perKappaMax[pt.kappa] = Math.max(perKappaMax[pt.kappa] || 0, delta);
  });

  console.log(`[fidelite M5 Node<->Python] max delta observe: ${maxDelta.toExponential(3)}`);
  console.log(`[fidelite M5 Node<->Python] max delta par kappa: ${JSON.stringify(perKappaMax)}`);
  assert.ok(maxDelta <= 1e-12, `delta max ${maxDelta} depasse 1e-12 : ${JSON.stringify(maxDeltaDetail)}`);
});
