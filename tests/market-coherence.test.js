"use strict";
// GATE A7 item 5 (SPEC LAB PRO v1.0) - coherence interne des marches
// derives de calcFinalProbs : issues mutuellement exclusives et
// exhaustives d'un meme evenement doivent sommer a ~100 (pourcentage).
// Ne verifie pas la qualite statistique (calibration) - seulement que la
// matrice unique alimente des marches internement coherents entre eux,
// propriete structurelle exigee par SPEC LAB PRO v1.0 §2.

const test = require("node:test");
const assert = require("node:assert/strict");
const { calcFinalProbs } = require("../lib/engine.js");

const SUM_TOLERANCE = 1e-6; // pourcentage (0-100), pas probabilite brute - tolerance adaptee aux arrondis pct()

const TEST_LAMBDAS = [
  [1.35, 1.10], [0.80, 0.80], [3.40, 3.00], [2.605, 2.674], [1.0, 2.5], [2.5, 1.0],
];

for (const [lh, la] of TEST_LAMBDAS) {
  test(`market-coherence [lambdaH=${lh}, lambdaA=${la}]: 1X2 somme a 100%`, () => {
    const r = calcFinalProbs(lh, la, null);
    const sum = r.p1 + r.pN + r.p2;
    assert.ok(Math.abs(sum - 100) < SUM_TOLERANCE, `p1+pN+p2=${sum}, attendu ~100`);
  });

  test(`market-coherence [lambdaH=${lh}, lambdaA=${la}]: Over 2.5 + Under 2.5 = 100%`, () => {
    const r = calcFinalProbs(lh, la, null);
    const sum = r.over25 + r.under25;
    assert.ok(Math.abs(sum - 100) < SUM_TOLERANCE, `over25+under25=${sum}, attendu ~100`);
  });

  test(`market-coherence [lambdaH=${lh}, lambdaA=${la}]: Over 3.5 + Under 3.5 = 100%`, () => {
    const r = calcFinalProbs(lh, la, null);
    const sum = r.over35 + r.under35;
    assert.ok(Math.abs(sum - 100) < SUM_TOLERANCE, `over35+under35=${sum}, attendu ~100`);
  });

  test(`market-coherence [lambdaH=${lh}, lambdaA=${la}]: BTTS oui + non = 100%`, () => {
    const r = calcFinalProbs(lh, la, null);
    const sum = r.bttsY + r.bttsN;
    assert.ok(Math.abs(sum - 100) < SUM_TOLERANCE, `bttsY+bttsN=${sum}, attendu ~100`);
  });

  test(`market-coherence [lambdaH=${lh}, lambdaA=${la}]: monotonie Over1.5 >= Over2.5 >= Over3.5 (lignes emboitees)`, () => {
    const r = calcFinalProbs(lh, la, null);
    assert.ok(r.over15 >= r.over25 - 1e-9, `Over1.5 (${r.over15}) doit etre >= Over2.5 (${r.over25})`);
    assert.ok(r.over25 >= r.over35 - 1e-9, `Over2.5 (${r.over25}) doit etre >= Over3.5 (${r.over35})`);
  });
}
