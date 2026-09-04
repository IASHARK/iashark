"use strict";
// GATE A1+A3 (SPEC LAB PRO v1.0 §19) - regression permanente, PORTEE
// EXPLICITE : verifie que la construction de matrice a maxGoals=10 FIXE
// (extraction A1 + remplacement du blend par DC pur A3) reste identique
// aux sorties capturees depuis l'ancien moteur inline avant toute
// modification (SHA 04825140, voir tests/fixtures/engine-golden-master.json,
// 133 entrees).
//
// Ce test appelle DELIBEREMENT buildDixonColesMatrix a maxGoals=10 en
// dur (pas calcFinalProbs, qui depuis GATE A4 utilise une troncature
// adaptative >=10 et produit donc legitimement des sorties legerement
// differentes - voir tests/adaptive-tail-mass.test.js pour le garde-fou
// d'A4, et scripts/experiments/exp005_truncation_delta_report.json pour
// la mesure exacte de l'ecart cause par A4, attendu et documente, pas un
// echec). Isoler ainsi la portee du test : il continue de prouver que
// l'extraction (A1) et l'equivalence algebrique du blend (A3) n'ont
// introduit AUCUN changement de comportement a troncature egale, sans
// jamais se confondre avec l'amelioration numerique volontaire d'A4.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { buildDixonColesMatrix, blendMatrices, deriveMarketsFromMatrix } = require("../lib/markets/score-matrix.js");

const FIXTURE_PATH = path.join(__dirname, "fixtures", "engine-golden-master.json");
const TOLERANCE = 1e-12;

function calcFinalProbsFixedTruncation(lambdaH, lambdaA) {
  const dixonMatrix = buildDixonColesMatrix(lambdaH, lambdaA, 10);
  const matrix = blendMatrices([{ matrix: dixonMatrix, weight: 1 }]);
  const markets = deriveMarketsFromMatrix(matrix);
  const pct = (v) => v * 100;
  return {
    p1: pct(markets.p1), pN: pct(markets.pN), p2: pct(markets.p2),
    over15: pct(markets.overUnder["1.5"].over), over25: pct(markets.overUnder["2.5"].over),
    under25: pct(markets.overUnder["2.5"].under), over35: pct(markets.overUnder["3.5"].over),
    under35: pct(markets.overUnder["3.5"].under), bttsY: pct(markets.btts.yes), bttsN: pct(markets.btts.no),
  };
}

test("engine golden master (portee A1+A3, maxGoals=10 fixe): reproduit exactement les sorties capturees avant extraction (133 paires lambda, tolerance 1e-12)", () => {
  const goldenMaster = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  assert.ok(goldenMaster.length >= 100, "le fixture doit contenir un echantillon representatif (>=100 paires)");

  const fields = ["p1", "pN", "p2", "over15", "over25", "under25", "over35", "under35", "bttsY", "bttsN"];
  let maxDelta = 0;
  let maxDeltaDetail = null;

  for (const entry of goldenMaster) {
    const actual = calcFinalProbsFixedTruncation(entry.lambdaH, entry.lambdaA);
    for (const f of fields) {
      const delta = Math.abs(actual[f] - entry.output[f]);
      if (delta > maxDelta) {
        maxDelta = delta;
        maxDeltaDetail = { lambdaH: entry.lambdaH, lambdaA: entry.lambdaA, field: f, expected: entry.output[f], actual: actual[f] };
      }
    }
  }

  assert.ok(
    maxDelta <= TOLERANCE,
    `delta max ${maxDelta} depasse la tolerance ${TOLERANCE} (a troncature egale - un echec ici signale une vraie regression, pas un effet d'A4) : ${JSON.stringify(maxDeltaDetail)}`
  );
});
