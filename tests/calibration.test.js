"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  brierScore, logLoss, calibrationTable, expectedCalibrationError,
  poolAdjacentViolators, fitIsotonicCurve, applyIsotonicCurve, applyCalibration, renormalizeToSumOne,
} = require("../lib/calibration.js");

test("brierScore: predictions parfaites -> 0", () => {
  const items = [{ prob: 1, outcome: 1 }, { prob: 0, outcome: 0 }, { prob: 1, outcome: 1 }];
  assert.equal(brierScore(items), 0);
});

test("brierScore: toujours 50% -> 0.25 (repere pile ou face)", () => {
  const items = [{ prob: 0.5, outcome: 1 }, { prob: 0.5, outcome: 0 }];
  assert.equal(brierScore(items), 0.25);
});

test("brierScore: predictions parfaitement fausses -> 1 (pire cas possible)", () => {
  const items = [{ prob: 1, outcome: 0 }, { prob: 0, outcome: 1 }];
  assert.equal(brierScore(items), 1);
});

test("brierScore: tableau vide -> null, pas de division par zero", () => {
  assert.equal(brierScore([]), null);
});

test("logLoss: predictions parfaites -> ~0", () => {
  const items = [{ prob: 0.9999999, outcome: 1 }, { prob: 0.0000001, outcome: 0 }];
  assert.ok(logLoss(items) < 0.001);
});

test("logLoss: toujours 50% -> ln(2) (~0.693)", () => {
  const items = [{ prob: 0.5, outcome: 1 }, { prob: 0.5, outcome: 0 }];
  assert.ok(Math.abs(logLoss(items) - Math.log(2)) < 1e-9);
});

test("logLoss: prob=1 exactement mais outcome=0 -> fini, jamais Infinity (clamp epsilon)", () => {
  const items = [{ prob: 1, outcome: 0 }];
  const ll = logLoss(items);
  assert.ok(isFinite(ll));
  assert.ok(ll > 15, "doit etre tres penalise (log loss eleve) sans etre Infinity");
});

test("calibrationTable: bucket parfaitement calibre -> gap ~0", () => {
  // 10 items a prob=0.7, 7 gagnent -> actualRate=0.7 = avgPredictedProb.
  const items = [];
  for (let i = 0; i < 10; i++) items.push({ prob: 0.7, outcome: i < 7 ? 1 : 0 });
  const table = calibrationTable(items, () => "bucket_70");
  assert.equal(table.length, 1);
  assert.ok(Math.abs(table[0].gap) < 1e-9);
  assert.equal(table[0].count, 10);
});

test("calibrationTable: surconfiance detectee (bucket haute confiance mais faible taux reel)", () => {
  // Reproduit le cas reel IASHARK : bucket '8+' annonce ~85% mais ne gagne que 36%.
  const items = [];
  for (let i = 0; i < 11; i++) items.push({ prob: 0.85, outcome: i < 4 ? 1 : 0 });
  const table = calibrationTable(items, () => "8+");
  assert.ok(table[0].gap < -0.4, "gap tres negatif = surconfiance forte, gap=" + table[0].gap);
});

test("calibrationTable: plusieurs buckets tries par cle", () => {
  const items = [
    { prob: 0.6, outcome: 1, b: "6-7" },
    { prob: 0.8, outcome: 0, b: "8+" },
    { prob: 0.7, outcome: 1, b: "7-8" },
  ];
  const table = calibrationTable(items, (it) => it.b);
  assert.deepEqual(table.map((t) => t.key), ["6-7", "7-8", "8+"]);
});

test("expectedCalibrationError: 0 si tous les buckets sont parfaitement calibres", () => {
  const items = [];
  for (let i = 0; i < 10; i++) items.push({ prob: 0.5, outcome: i < 5 ? 1 : 0 });
  const table = calibrationTable(items, () => "x");
  assert.equal(expectedCalibrationError(table), 0);
});

test("expectedCalibrationError: tableau vide -> null", () => {
  assert.equal(expectedCalibrationError([]), null);
});

// --- Recalibration post-hoc (isotonic regression / PAVA) ---
// Ajoute pour la tache de recalibration du moteur (2026-09-13, voir
// ENGINE_RECALIBRATION_REPORT.md) - GATE A7 style (item "tester le code
// nouveau, pas seulement l'existant").

test("poolAdjacentViolators: sequence deja non-decroissante -> inchangee (un bloc par point)", () => {
  const rows = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.3 }, { x: 0.3, y: 0.5 }];
  const blocks = poolAdjacentViolators(rows);
  assert.equal(blocks.length, 3);
  assert.deepEqual(blocks.map((b) => b.y), [0.1, 0.3, 0.5]);
});

test("poolAdjacentViolators: violation (y decroit) -> fusionne en un bloc a la moyenne", () => {
  // x croissant mais y decroissant entre les deux premiers points : violation.
  const rows = [{ x: 0.1, y: 0.8 }, { x: 0.2, y: 0.2 }, { x: 0.3, y: 0.9 }];
  const blocks = poolAdjacentViolators(rows);
  // Les deux premiers doivent fusionner (moyenne 0.5), le troisieme (0.9) reste separe car 0.9>=0.5.
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].y, 0.5);
  assert.equal(blocks[0].n, 2);
  assert.equal(blocks[1].y, 0.9);
});

test("poolAdjacentViolators: x EXACTEMENT identiques regroupes en un seul point AVANT le pooling (regression - bug reel trouve sur les donnees IASHARK)", () => {
  // Reproduit le cas reel : plusieurs matchs differents produisent la MEME
  // probabilite brute exacte (lambdas clampes aux memes bornes par
  // lib/engine.js#calcLambdas). Sans regroupement prealable, ces points
  // pourraient finir dans des blocs SEPARES si leur y est deja croissant
  // entre eux (aucune violation detectee), et un dernier point isole a
  // faible n (ex: n=1, y=1) dicterait alors toute la queue de la courbe -
  // exactement l'inverse de l'objectif d'une calibration honnete.
  const rows = [
    { x: 0.5, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 0 }, { x: 0.5, y: 1 }, // 3 echecs, 1 succes au meme x
  ];
  const blocks = poolAdjacentViolators(rows);
  assert.equal(blocks.length, 1, "tous les points au meme x doivent finir dans UN SEUL bloc");
  assert.equal(blocks[0].y, 0.25, "moyenne ponderee honnete (1/4), jamais dictee par le dernier point arrive");
  assert.equal(blocks[0].n, 4);
});

test("fitIsotonicCurve: moins de 2 lignes -> null (jamais une courbe fabriquee sur rien)", () => {
  assert.equal(fitIsotonicCurve([]), null);
  assert.equal(fitIsotonicCurve([{ prob: 0.5, outcome: 1 }]), null);
});

test("fitIsotonicCurve + applyIsotonicCurve: corrige une surconfiance connue (proba compressee vers 0.5) sur des donnees synthetiques", () => {
  // true_rate = 0.5 + (p-0.5)*0.5 : le modele est 2x trop extreme par
  // rapport a la realite - exactement le pattern SURCONFIANT diagnostique
  // par CURRENT_ENGINE_CALIBRATION_REPORT.md (haute confiance predite,
  // taux reel plus proche de 50%).
  const rows = [];
  let seed = 42;
  function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
  for (let i = 0; i < 4000; i++) {
    const p = rand();
    const trueRate = 0.5 + (p - 0.5) * 0.5;
    rows.push({ prob: p, outcome: rand() < trueRate ? 1 : 0 });
  }
  const curve = fitIsotonicCurve(rows);
  assert.ok(curve && curve.points.length > 1);
  // Monotonie stricte non-decroissante garantie par construction.
  for (let i = 1; i < curve.points.length; i++) {
    assert.ok(curve.points[i].y >= curve.points[i - 1].y - 1e-9, "la courbe doit rester non-decroissante");
  }
  // A p=0.9 (haute confiance brute), la valeur calibree doit se rapprocher
  // de 0.7 (0.5+0.4*0.5) et rester nettement en dessous de 0.9 brut.
  const calibrated = applyIsotonicCurve(0.9, curve);
  assert.ok(calibrated < 0.85, `calibrated=${calibrated} devrait corriger la surconfiance (compresser vers ~0.7)`);
  assert.ok(calibrated > 0.55, `calibrated=${calibrated} ne devrait pas sur-corriger sous la ligne de base`);
});

test("applyIsotonicCurve: clampe strictement au domaine d'entrainement (jamais d'extrapolation)", () => {
  const curve = { points: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.6 }] };
  assert.equal(applyIsotonicCurve(0.0, curve), 0.3, "en dessous du min observe -> valeur du min");
  assert.equal(applyIsotonicCurve(1.0, curve), 0.6, "au dessus du max observe -> valeur du max");
  assert.ok(Math.abs(applyIsotonicCurve(0.5, curve) - 0.45) < 1e-9, "interpolation lineaire exacte au milieu");
});

test("applyIsotonicCurve: courbe null/vide -> repli identite (jamais un crash)", () => {
  assert.equal(applyIsotonicCurve(0.42, null), 0.42);
  assert.equal(applyIsotonicCurve(0.42, { points: [] }), 0.42);
});

test("applyCalibration: delegue a applyIsotonicCurve pour method='isotonic_pava' (ou methode absente)", () => {
  const curve = { method: "isotonic_pava", points: [{ x: 0.2, y: 0.3 }, { x: 0.8, y: 0.6 }] };
  assert.equal(applyCalibration(0.5, curve), applyIsotonicCurve(0.5, curve));
  assert.equal(applyCalibration(0.5, null), 0.5, "pas de courbe -> probabilite inchangee");
});

test("renormalizeToSumOne: renormalise proportionnellement pour sommer exactement a 1", () => {
  const out = renormalizeToSumOne([0.5, 0.3, 0.3]);
  const sum = out.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12, `somme=${sum}, attendu 1`);
  // Ordre relatif preserve (renormalisation proportionnelle, jamais une redistribution arbitraire).
  assert.ok(out[0] > out[1] && out[1] === out[2]);
});

test("renormalizeToSumOne: somme brute <=0 -> repli uniforme, jamais de division par zero/NaN", () => {
  const out = renormalizeToSumOne([0, 0, 0]);
  assert.deepEqual(out, [1 / 3, 1 / 3, 1 / 3]);
  for (const v of out) assert.ok(Number.isFinite(v));
});
