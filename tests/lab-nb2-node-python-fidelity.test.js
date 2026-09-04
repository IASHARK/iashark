"use strict";
// EXP-004 item 9 (SPEC LAB PRO v1.0, M4 NB2) - preuve croisee que
// lib/lab/nb2-log-probability.js (Node, formule de reference) et
// scripts/eval_nb2_log_probability.py (Python, ecrit independamment)
// calculent EXACTEMENT la meme chose, sur kappa=1,2,5,20,1000 et
// plusieurs mu (moyennes M2-like) realistes. Garantit que
// scripts/fit_kappa.py fitte bien la MEME parametrisation NB2 que celle
// utilisee au run-time par le walk-forward M4.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");
const { logProbability } = require("../lib/lab/nb2-log-probability.js");

const PY_SCRIPT = path.join(__dirname, "..", "scripts", "eval_nb2_log_probability.py");

const KAPPAS = [1, 2, 5, 20, 1000];
const MU_PAIRS = [
  { mu_home: 1.35, mu_away: 1.10 },
  { mu_home: 2.605, mu_away: 2.674 },
  { mu_home: 0.80, mu_away: 0.80 },
  { mu_home: 3.40, mu_away: 3.00 },
  { mu_home: 1.0, mu_away: 1.0 },
];
const SCORES = [[0, 0], [1, 0], [0, 1], [1, 1], [3, 2], [5, 4], [2, 3]];

const TEST_POINTS = [];
for (const kappa of KAPPAS) {
  for (const { mu_home, mu_away } of MU_PAIRS) {
    for (const [h, a] of SCORES) {
      TEST_POINTS.push({ mu_home, mu_away, h, a, kappa });
    }
  }
}

function evalPython(points) {
  const proc = spawnSync("python3", [PY_SCRIPT], { input: JSON.stringify({ points }), encoding: "utf8" });
  if (proc.status !== 0) throw new Error(`eval_nb2_log_probability.py a echoue (code ${proc.status}): ${proc.stderr}`);
  return JSON.parse(proc.stdout).log_probabilities;
}

test("Node<->Python fidelite NB2: log_probability identique a tolerance <=1e-12 sur kappa={1,2,5,20,1000} x plusieurs mu M2-like x plusieurs scores", () => {
  const pythonResults = evalPython(TEST_POINTS);
  assert.equal(pythonResults.length, TEST_POINTS.length);
  assert.equal(TEST_POINTS.length, KAPPAS.length * MU_PAIRS.length * SCORES.length);

  let maxDelta = 0;
  let maxDeltaDetail = null;
  const perKappaMax = {};

  TEST_POINTS.forEach((pt, i) => {
    const nodeVal = logProbability(pt.mu_home, pt.mu_away, pt.h, pt.a, pt.kappa);
    const pyVal = pythonResults[i];
    const delta = Math.abs(nodeVal - pyVal);
    if (delta > maxDelta) { maxDelta = delta; maxDeltaDetail = { point: pt, nodeVal, pyVal }; }
    perKappaMax[pt.kappa] = Math.max(perKappaMax[pt.kappa] || 0, delta);
  });

  console.log(`[fidelite NB2 Node<->Python] max delta observe: ${maxDelta.toExponential(3)}`);
  console.log(`[fidelite NB2 Node<->Python] max delta par kappa: ${JSON.stringify(perKappaMax)}`);
  assert.ok(maxDelta <= 1e-12, `delta max ${maxDelta} depasse 1e-12 : ${JSON.stringify(maxDeltaDetail)}`);
});

test("Node<->Python fidelite NB2: kappa->Poisson (kappa=1e7) reste <=1e-12 (limite numerique correctement geree des deux cotes)", () => {
  const points = MU_PAIRS.flatMap(({ mu_home, mu_away }) => SCORES.map(([h, a]) => ({ mu_home, mu_away, h, a, kappa: 1e7 })));
  const pythonResults = evalPython(points);
  let maxDelta = 0;
  points.forEach((pt, i) => {
    const nodeVal = logProbability(pt.mu_home, pt.mu_away, pt.h, pt.a, pt.kappa);
    maxDelta = Math.max(maxDelta, Math.abs(nodeVal - pythonResults[i]));
  });
  assert.ok(maxDelta <= 1e-12, `delta max ${maxDelta} depasse 1e-12 a kappa=1e7`);
});
