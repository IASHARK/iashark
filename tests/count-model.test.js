"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { countLineProbability } = require("../lib/markets/count-model.js");

test("countLineProbability: retourne des probabilites complementaires pour une demi-ligne", () => {
  const result = countLineProbability({ mean: 24, variance: 34, line: 23.5 });
  assert.ok(result.over > 0 && result.over < 1);
  assert.ok(Math.abs(result.over + result.under - 1) < 1e-10);
  assert.equal(result.model, "NEGATIVE_BINOMIAL");
});

test("countLineProbability: utilise Poisson sans surdispersion mesurable", () => {
  const result = countLineProbability({ mean: 8, variance: 7, line: 7.5 });
  assert.equal(result.model, "POISSON");
});

test("countLineProbability: refuse une ligne entiere qui peut produire un push", () => {
  assert.equal(countLineProbability({ mean: 8, variance: 10, line: 8 }), null);
});

test("countLineProbability: refuse les donnees insuffisantes", () => {
  assert.equal(countLineProbability({ mean: null, variance: null, line: 7.5 }), null);
});
