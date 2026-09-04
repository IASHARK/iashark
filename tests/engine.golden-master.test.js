"use strict";
// GATE A1 (SPEC LAB PRO v1.0 §19) - regression permanente : lib/engine.js
// doit produire des sorties identiques (tolerance 1e-12) a l'ancien moteur
// inline qui tournait dans .github/workflows/update-data.yml avant
// l'extraction (SHA 04825140). Le fixture a ete capture depuis le code
// inline original AVANT sa suppression - voir tests/fixtures/engine-golden-master.json
// (133 entrees : 46 lambdas reels de production du 2026-09-04, une grille
// synthetique deterministe sur tout le domaine autorise par calcLambdas,
// et des cas limites explicites aux bornes 0.80/3.40/3.00).
//
// Si ce test echoue apres une modification volontaire du moteur (EXP-000
// et suivants), c'est attendu : regenerer le fixture consciemment plutot
// que d'assouplir la tolerance.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { calcFinalProbs } = require("../lib/engine.js");

const FIXTURE_PATH = path.join(__dirname, "fixtures", "engine-golden-master.json");
const TOLERANCE = 1e-12;

test("engine golden master: calcFinalProbs reproduit exactement les sorties capturees avant extraction (133 paires lambda, tolerance 1e-12)", () => {
  const goldenMaster = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8"));
  assert.ok(goldenMaster.length >= 100, "le fixture doit contenir un echantillon representatif (>=100 paires)");

  const fields = ["p1", "pN", "p2", "over15", "over25", "under25", "over35", "under35", "bttsY", "bttsN"];
  let maxDelta = 0;
  let maxDeltaDetail = null;

  for (const entry of goldenMaster) {
    const actual = calcFinalProbs(entry.lambdaH, entry.lambdaA, null);
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
    `delta max ${maxDelta} depasse la tolerance ${TOLERANCE} : ${JSON.stringify(maxDeltaDetail)}`
  );
});
