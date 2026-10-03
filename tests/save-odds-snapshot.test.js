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

test("selections nationales : cotes archivees avant match (plafond de config/quotas.json, mode economie), budget du run tenu ; aucun pari", () => {
  const S = require("../scripts/save-odds-snapshot.js");
  const cfg = require("../config/leagues.json");
  const sel = cfg.leagues.filter(S.estCompetitionSelections).map((l) => l.key).sort();
  assert.deepEqual(sel, ["nations_league", "wcq_europe"]);
  const plafondSel = require("../config/quotas.json").api_football.releve_large.matchs_par_competition_selections;
  assert.equal(S.fixturesPour(cfg.leagues.find((l) => l.key === "nations_league"), 3), plafondSel);
  assert.ok(plafondSel <= 20, "archivage des selections plafonne");
  assert.equal(S.fixturesPour(cfg.leagues.find((l) => l.key === "premier"), 3), 3);
  // Pire cas : chaque competition consomme 1 appel /fixtures + 1 appel /odds par match.
  const pire = cfg.leagues.reduce((a, l) => a + 1 + S.fixturesPour(l, 3), 0);
  assert.ok(pire <= S.MAX_API_CALLS_PER_RUN, "budget : " + pire);
  // Jamais dans les ligues validees (moteur). Voie « cotes du marche » (03/10/2026, VERIF-SELECTIONS.md du 02/10) :
  // seulement les selections de fiabilite.selections_cotes_marche, 1N2 et double chance seulement.
  for (const k of sel) {
    assert.ok(!cfg.fiabilite.ligues_validees.includes(k), k);
    if (k in cfg.fiabilite.ligues_validees_cotes_marche) {
      assert.ok(cfg.fiabilite.selections_cotes_marche.includes(k), k);
      assert.deepEqual(cfg.fiabilite.ligues_validees_cotes_marche[k], ["1N2", "DC"], k);
    }
  }
});
