"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { combineCountMatchup } = require("../lib/markets/count-matchup.js");

test("count matchup: combine production offensive et volume concede adverse", () => {
  const out = combineCountMatchup({
    homeFor:{mean:14,variance:20,n:8}, awayAgainst:{mean:12,variance:16,n:8},
    awayFor:{mean:10,variance:12,n:8}, homeAgainst:{mean:11,variance:14,n:8},
  });
  assert.equal(out.mean, 23.5);
  assert.equal(out.variance, 15.5);
});

test("count matchup: refuse un seul sous-echantillon insuffisant", () => {
  assert.equal(combineCountMatchup({
    homeFor:{mean:14,variance:20,n:8}, awayAgainst:{mean:12,variance:16,n:4},
    awayFor:{mean:10,variance:12,n:8}, homeAgainst:{mean:11,variance:14,n:8},
  }), null);
});
