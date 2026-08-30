"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { brierScore, logLoss, calibrationTable, expectedCalibrationError } = require("../lib/calibration.js");

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
