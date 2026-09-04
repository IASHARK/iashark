"use strict";
// GATE A4 (SPEC LAB PRO v1.0 §22, §38) - troncature adaptative de la
// matrice de score. Tests requis par le protocole : aucune probabilite
// negative, aucun NaN/Infinity, somme matrice finale a tolerance, masse
// residuelle < 1e-10, convergence, comportement deterministe - testes
// specifiquement sur les lambdas reels max observes en production ET les
// bornes theoriques du moteur (lib/engine.js#calcLambdas : 0.80-3.40 dom,
// 0.80-3.00 ext).

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildAdaptiveDixonColesMatrix, tailMass } = require("../lib/markets/score-matrix.js");

function sumMatrix(mat) {
  let s = 0;
  for (const row of mat) for (const v of row) s += v;
  return s;
}

// Lambdas reels max observes en production le 2026-09-04 (data.json, 46 matchs)
const REAL_MAX_LAMBDAS = { lambdaH: 2.605, lambdaA: 2.674 };
// Bornes theoriques dures du moteur (calcLambdas: maxLH=3.4, maxLA=3.0)
const THEORETICAL_BOUNDS = { lambdaH: 3.4, lambdaA: 3.0 };
// Bornes minimales dures du moteur (minLH isTop=1.05, minLA isTop=0.90 - cas le plus bas courant)
const THEORETICAL_MIN = { lambdaH: 0.80, lambdaA: 0.80 };

const CASES = [
  { name: "lambdas reels max production (2.605/2.674)", ...REAL_MAX_LAMBDAS },
  { name: "bornes theoriques max (3.40/3.00)", ...THEORETICAL_BOUNDS },
  { name: "bornes theoriques min (0.80/0.80)", ...THEORETICAL_MIN },
  { name: "asymetrie extreme (3.40/0.80)", lambdaH: 3.40, lambdaA: 0.80 },
  { name: "asymetrie extreme inverse (0.80/3.00)", lambdaH: 0.80, lambdaA: 3.00 },
  { name: "cas moyen typique (1.35/1.10)", lambdaH: 1.35, lambdaA: 1.10 },
];

for (const c of CASES) {
  test(`buildAdaptiveDixonColesMatrix [${c.name}]: masse residuelle < 1e-10`, () => {
    const result = buildAdaptiveDixonColesMatrix(c.lambdaH, c.lambdaA);
    assert.ok(result.tailMass < 1e-10, `tailMass=${result.tailMass} pour lambdaH=${c.lambdaH} lambdaA=${c.lambdaA}`);
    assert.ok(result.maxGoal >= 10, "maxGoal ne doit jamais descendre sous l'ancien minimum fixe (10)");
  });

  test(`buildAdaptiveDixonColesMatrix [${c.name}]: aucune probabilite negative`, () => {
    const result = buildAdaptiveDixonColesMatrix(c.lambdaH, c.lambdaA);
    for (const row of result.matrix) for (const v of row) assert.ok(v >= 0, `probabilite negative trouvee: ${v}`);
  });

  test(`buildAdaptiveDixonColesMatrix [${c.name}]: aucun NaN/Infinity`, () => {
    const result = buildAdaptiveDixonColesMatrix(c.lambdaH, c.lambdaA);
    for (const row of result.matrix) for (const v of row) {
      assert.ok(Number.isFinite(v), `valeur non finie trouvee: ${v}`);
    }
    assert.ok(Number.isFinite(result.tailMass));
    assert.ok(Number.isFinite(result.maxGoal));
  });

  test(`buildAdaptiveDixonColesMatrix [${c.name}]: somme matrice = 1 a tolerance apres renormalisation (blendMatrices)`, () => {
    const { blendMatrices } = require("../lib/markets/score-matrix.js");
    const result = buildAdaptiveDixonColesMatrix(c.lambdaH, c.lambdaA);
    const renormalized = blendMatrices([{ matrix: result.matrix, weight: 1 }]);
    const sum = sumMatrix(renormalized);
    assert.ok(Math.abs(sum - 1) <= 1e-9, `somme=${sum}, tolerance requise 1e-9 (SPEC LAB PRO §38)`);
  });

  test(`buildAdaptiveDixonColesMatrix [${c.name}]: deterministe (deux appels identiques -> meme resultat)`, () => {
    const r1 = buildAdaptiveDixonColesMatrix(c.lambdaH, c.lambdaA);
    const r2 = buildAdaptiveDixonColesMatrix(c.lambdaH, c.lambdaA);
    assert.equal(r1.maxGoal, r2.maxGoal);
    assert.equal(r1.tailMass, r2.tailMass);
    for (let h = 0; h < r1.matrix.length; h++) {
      for (let a = 0; a < r1.matrix[h].length; a++) {
        assert.equal(r1.matrix[h][a], r2.matrix[h][a]);
      }
    }
  });
}

test("buildAdaptiveDixonColesMatrix: garde-fou de securite - leve une erreur explicite plutot que de boucler indefiniment sur un lambda aberrant", () => {
  // lambda absurdement eleve, hors de tout domaine reel du moteur (bornes
  // dures 0.80-3.40) - doit echouer explicitement, jamais silencieusement.
  assert.throws(
    () => buildAdaptiveDixonColesMatrix(500, 500),
    /safety cap/,
    "un lambda aberrant doit lever une erreur explicite mentionnant le safety cap, pas boucler indefiniment"
  );
});

test("buildAdaptiveDixonColesMatrix: croissance strictement deterministe (pas de dependance a Math.random ou a l'ordre d'appel)", () => {
  // Appelle dans un ordre different, verifie que chaque paire retombe sur
  // le meme maxGoal peu importe ce qui a ete calcule juste avant.
  const order1 = CASES.map((c) => buildAdaptiveDixonColesMatrix(c.lambdaH, c.lambdaA).maxGoal);
  const order2 = CASES.slice().reverse().map((c) => buildAdaptiveDixonColesMatrix(c.lambdaH, c.lambdaA).maxGoal).reverse();
  assert.deepEqual(order1, order2, "l'ordre d'appel ne doit jamais influencer le maxGoal retenu pour une paire lambda donnee");
});

test("tailMass: coherente avec une somme manuelle de la matrice complete (verification independante de la formule)", () => {
  const lh = 1.5, la = 1.2, maxGoals = 10;
  const { buildDixonColesMatrix } = require("../lib/markets/score-matrix.js");
  const mat = buildDixonColesMatrix(lh, la, maxGoals);
  const manualSum = sumMatrix(mat);
  const t = tailMass(lh, la, maxGoals);
  assert.ok(Math.abs((1 - manualSum) - t) < 1e-9, `tailMass()=${t} incoherent avec 1-sum(matrice)=${1 - manualSum}`);
});
