"use strict";
// GATE C2 (SPEC LAB PRO v1.0) - preuve croisee que lib/lab/dc-log-probability.js
// (Node, formule de reference) et scripts/eval_log_probability.py (Python,
// ecrit independamment - meme structure mathematique, pas une traduction
// ligne a ligne) calculent EXACTEMENT la meme chose. C'est ce qui garantit
// que scripts/fit_rho.py (qui reutilise la meme fonction Python) fitte
// bien la fonction Dixon-Coles qui tourne reellement en production, pas
// une variante legerement differente.

const test = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("child_process");
const path = require("path");
const { logProbability } = require("../lib/lab/dc-log-probability.js");

const PY_SCRIPT = path.join(__dirname, "..", "scripts", "eval_log_probability.py");

const TEST_POINTS = [
  { lambda_home: 1.35, lambda_away: 1.10, h: 1, a: 0, rho: -0.0845 },
  { lambda_home: 1.35, lambda_away: 1.10, h: 0, a: 0, rho: -0.0845 },
  { lambda_home: 1.35, lambda_away: 1.10, h: 0, a: 1, rho: -0.0845 },
  { lambda_home: 1.35, lambda_away: 1.10, h: 1, a: 1, rho: -0.0845 },
  { lambda_home: 1.35, lambda_away: 1.10, h: 3, a: 2, rho: -0.0845 }, // hors des 4 cas speciaux (tau=1)
  { lambda_home: 2.605, lambda_away: 2.674, h: 2, a: 3, rho: -0.20 },
  { lambda_home: 0.80, lambda_away: 0.80, h: 0, a: 0, rho: -0.35 }, // rho fortement negatif, lambdas bas
  { lambda_home: 3.40, lambda_away: 3.00, h: 5, a: 4, rho: 0.10 }, // rho positif, lambdas eleves
  { lambda_home: 1.0, lambda_away: 1.0, h: 0, a: 0, rho: 0.0 }, // rho=0 -> equivalent Poisson pur
];

function evalPython(points) {
  const proc = spawnSync("python3", [PY_SCRIPT], {
    input: JSON.stringify({ points }),
    encoding: "utf8",
  });
  if (proc.status !== 0) {
    throw new Error(`eval_log_probability.py a echoue (code ${proc.status}): ${proc.stderr}`);
  }
  return JSON.parse(proc.stdout).log_probabilities;
}

test("Node<->Python fidelite: log_probability identique a tolerance <=1e-12 sur des points varies (lambdas bas/hauts, rho negatif/positif/nul, cas speciaux et generiques Dixon-Coles)", () => {
  const pythonResults = evalPython(TEST_POINTS);
  assert.equal(pythonResults.length, TEST_POINTS.length);

  let maxDelta = 0;
  let maxDeltaDetail = null;

  TEST_POINTS.forEach((pt, i) => {
    const nodeVal = logProbability(pt.lambda_home, pt.lambda_away, pt.h, pt.a, pt.rho);
    const pyVal = pythonResults[i];
    const delta = Math.abs(nodeVal - pyVal);
    if (delta > maxDelta) { maxDelta = delta; maxDeltaDetail = { point: pt, nodeVal, pyVal }; }
  });

  console.log(`[fidelite Node<->Python] max delta observe: ${maxDelta.toExponential(3)}`);
  assert.ok(
    maxDelta <= 1e-12,
    `delta max ${maxDelta} depasse 1e-12 : ${JSON.stringify(maxDeltaDetail)}`
  );
});

test("Node<->Python fidelite: cas tau<=0 (hors domaine rho) renvoie -Infinity des deux cotes", () => {
  // rho tres negatif avec lambdas eleves peut rendre tau(0,0) negatif :
  // 1 - lambdaH*lambdaA*rho > 0 exige rho < 1/(lambdaH*lambdaA) - testons
  // au-dela de cette borne intentionnellement (rho positif fort).
  const pt = { lambda_home: 3.0, lambda_away: 3.0, h: 0, a: 0, rho: 0.5 }; // 1 - 9*0.5 = -3.5 < 0
  const nodeVal = logProbability(pt.lambda_home, pt.lambda_away, pt.h, pt.a, pt.rho);
  const pyVal = evalPython([pt])[0];
  assert.equal(nodeVal, -Infinity);
  assert.equal(pyVal, null, "JSON ne represente pas -Infinity nativement, Python le serialise en null via json.dumps - normal, pas une divergence");
});
