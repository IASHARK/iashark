"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildSegmentMarkets, estimateFirstHalfShare } = require("../lib/markets/segment-model.js");

test("first-half share: exige un historique temporel réel suffisant", () => {
  assert.equal(estimateFirstHalfShare({ forSlots: [], opponentAgainstSlots: [], sampleMatches: 10 }), null);
  const share = estimateFirstHalfShare({
    forSlots: [{n:2},{n:2},{n:1},{n:2},{n:2},{n:1}],
    opponentAgainstSlots: [{n:1},{n:1},{n:1},{n:1},{n:1},{n:1}],
    sampleMatches: 10,
  });
  assert.ok(share > 0.35 && share < 0.52);
});

test("segment model: derive les totaux premiere mi-temps et les victoires des deux mi-temps", () => {
  const m = buildSegmentMarkets({ lambdaHome: 1.8, lambdaAway: 0.9, homeFirstHalfShare: 0.44, awayFirstHalfShare: 0.42 });
  assert.ok(m.firstHalf.over05 > m.firstHalf.over15);
  assert.ok(Math.abs(m.firstHalf.over05 + m.firstHalf.under05 - 1) < 1e-9);
  assert.ok(Math.abs(m.firstHalf.over15 + m.firstHalf.under15 - 1) < 1e-9);
  assert.ok(m.winBothHalves.home > 0 && m.winBothHalves.home < 1);
  assert.ok(m.winBothHalves.away > 0 && m.winBothHalves.away < 1);
  assert.ok(m.winBothHalves.home <= m.firstHalf.homeWin);
  assert.ok(m.winBothHalves.away <= m.firstHalf.awayWin);
});

test("segment model: refuse des lambdas invalides", () => {
  assert.equal(buildSegmentMarkets({ lambdaHome: null, lambdaAway: 1 }), null);
  assert.equal(buildSegmentMarkets({ lambdaHome: -1, lambdaAway: 1 }), null);
});
