"use strict";
// GATE A7 item 8 (SPEC LAB PRO v1.0 §38: "probabilite negative : interdite")
// - au niveau moteur complet (calcFinalProbs), pas seulement la matrice
// brute deja couverte par tests/adaptive-tail-mass.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const { calcFinalProbs } = require("../lib/engine.js");

const PCT_FIELDS = ["p1", "pN", "p2", "over15", "over25", "under25", "over35", "under35", "bttsY", "bttsN"];

const CASES = [
  [1.35, 1.10], [0.80, 0.80], [3.40, 3.00], [2.605, 2.674], [0.80, 3.00], [3.40, 0.80],
];

for (const [lh, la] of CASES) {
  test(`calcFinalProbs [lambdaH=${lh}, lambdaA=${la}]: aucun champ pourcentage negatif`, () => {
    const r = calcFinalProbs(lh, la, null);
    for (const f of PCT_FIELDS) {
      assert.ok(r[f] >= 0, `${f}=${r[f]} est negatif`);
      assert.ok(r[f] <= 100, `${f}=${r[f]} depasse 100%`);
    }
  });

  test(`calcFinalProbs [lambdaH=${lh}, lambdaA=${la}]: aucune cellule de la matrice derivee negative`, () => {
    const r = calcFinalProbs(lh, la, null);
    for (const key of ["p1", "pN", "p2"]) {
      assert.ok(r.derived[key] >= 0, `derived.${key}=${r.derived[key]} est negatif`);
    }
    for (const line of Object.keys(r.derived.overUnder)) {
      assert.ok(r.derived.overUnder[line].over >= 0 && r.derived.overUnder[line].under >= 0, `overUnder[${line}] contient une valeur negative`);
    }
  });
}
