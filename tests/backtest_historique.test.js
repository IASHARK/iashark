"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { analyze, probabilityBand } = require("../scripts/backtest_historique.js");

test("probabilityBand: regroupe par tranche de 10 points", () => {
  assert.equal(probabilityBand(0.63), "60-70%");
  assert.equal(probabilityBand(0.7), "70-80%");
  assert.equal(probabilityBand(0.05), "0-10%");
});

test("analyze: calcule brier/logloss/ece et regroupe par bucket/bande/marche", () => {
  const items = [
    { prob: 0.7, outcome: 1, bucket: "b1", market: "over25" },
    { prob: 0.7, outcome: 0, bucket: "b1", market: "over25" },
    { prob: 0.6, outcome: 1, bucket: "b2", market: "btts" },
  ];
  const r = analyze(items, "TEST");
  assert.equal(r.label, "TEST");
  assert.equal(r.n, 3);
  assert.ok(r.metrics.brier_score != null);
  assert.ok(r.calibration_table.length === 2);
  assert.ok(r.by_probability_band.length >= 1);
});

test("analyze: by_market exclut les groupes trop petits (n<10)", () => {
  const items = [];
  for (let i = 0; i < 15; i++) items.push({ prob: 0.6, outcome: i % 2, bucket: "b", market: "over25" });
  items.push({ prob: 0.5, outcome: 1, bucket: "b", market: "rare_market" }); // n=1, doit etre exclu
  const r = analyze(items, "TEST");
  const markets = r.by_market.map((m) => m.market);
  assert.ok(markets.includes("over25"));
  assert.ok(!markets.includes("rare_market"));
});
