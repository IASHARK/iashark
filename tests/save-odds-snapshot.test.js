"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { computeSnapshotPhase } = require("../scripts/save-odds-snapshot.js");

function isoIn(hours, from) {
  return new Date((from || new Date()).getTime() + hours * 3600000).toISOString();
}

test("computeSnapshotPhase: coup d'envoi lointain (>72h) -> FIRST_SEEN", () => {
  var now = new Date("2026-08-30T09:00:00Z");
  assert.equal(computeSnapshotPhase(isoIn(100, now), now), "FIRST_SEEN");
});

test("computeSnapshotPhase: ~72h avant -> T72", () => {
  var now = new Date("2026-08-30T09:00:00Z");
  assert.equal(computeSnapshotPhase(isoIn(70, now), now), "T72");
});

test("computeSnapshotPhase: ~24h avant -> T24", () => {
  var now = new Date("2026-08-30T09:00:00Z");
  assert.equal(computeSnapshotPhase(isoIn(20, now), now), "T24");
});

test("computeSnapshotPhase: ~6h avant -> T6", () => {
  var now = new Date("2026-08-30T09:00:00Z");
  assert.equal(computeSnapshotPhase(isoIn(5, now), now), "T6");
});

test("computeSnapshotPhase: proche du coup d'envoi (<=1.5h, y compris juste apres) -> CLOSE", () => {
  var now = new Date("2026-08-30T09:00:00Z");
  assert.equal(computeSnapshotPhase(isoIn(1, now), now), "CLOSE");
  assert.equal(computeSnapshotPhase(isoIn(-0.5, now), now), "CLOSE");
});

test("computeSnapshotPhase: les bornes ne se chevauchent jamais (une seule phase possible par instant)", () => {
  var now = new Date("2026-08-30T09:00:00Z");
  var hours = [200, 72, 71, 24.1, 24, 6.1, 6, 1.6, 1.5, 0, -1];
  var phases = hours.map(function (h) { return computeSnapshotPhase(isoIn(h, now), now); });
  phases.forEach(function (p) { assert.ok(["FIRST_SEEN", "T72", "T24", "T6", "CLOSE"].indexOf(p) !== -1); });
});
