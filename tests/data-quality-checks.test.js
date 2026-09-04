"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildQualityReport, diffFixtureVersions } = require("../lib/data/quality-checks.js");

function fx(overrides) {
  return Object.assign({
    fixture_id: 1, league_id: 39, season: 2025, kickoff_timestamp: "2026-01-01T00:00:00Z",
    home_team_id: 1, away_team_id: 2, status: "FINISHED", goals_home_90: 1, goals_away_90: 0,
  }, overrides);
}

test("buildQualityReport: compte correctement fixtures_total/finished sur un jeu propre", () => {
  const fixtures = [fx({ fixture_id: 1 }), fx({ fixture_id: 2 }), fx({ fixture_id: 3 })];
  const r = buildQualityReport(fixtures, 39, 2025);
  assert.equal(r.fixtures_total, 3);
  assert.equal(r.finished, 3);
  assert.equal(r.excluded, 0);
  assert.equal(r.duplicates, 0);
});

test("buildQualityReport: detecte les doublons de fixture_id", () => {
  const fixtures = [fx({ fixture_id: 1 }), fx({ fixture_id: 1 }), fx({ fixture_id: 2 })];
  const r = buildQualityReport(fixtures, 39, 2025);
  assert.equal(r.duplicates, 1);
  assert.deepEqual(r.duplicate_fixture_ids, [1]);
});

test("buildQualityReport: detecte un score manquant sur un match FINISHED", () => {
  const fixtures = [fx({ fixture_id: 1, goals_home_90: null })];
  const r = buildQualityReport(fixtures, 39, 2025);
  assert.equal(r.missing_score, 1);
  assert.equal(r.excluded, 1);
});

test("buildQualityReport: detecte home_team_id === away_team_id (impossible)", () => {
  const fixtures = [fx({ fixture_id: 1, home_team_id: 5, away_team_id: 5 })];
  const r = buildQualityReport(fixtures, 39, 2025);
  assert.deepEqual(r.home_equals_away_fixture_ids, [1]);
  assert.equal(r.excluded, 1);
});

test("buildQualityReport: detecte un score negatif", () => {
  const fixtures = [fx({ fixture_id: 1, goals_home_90: -1 })];
  const r = buildQualityReport(fixtures, 39, 2025);
  assert.deepEqual(r.negative_score_fixture_ids, [1]);
});

test("buildQualityReport: detecte un statut incoherent (PENDING avec un score deja renseigne)", () => {
  const fixtures = [fx({ fixture_id: 1, status: "PENDING", goals_home_90: 1, goals_away_90: 0 })];
  const r = buildQualityReport(fixtures, 39, 2025);
  assert.deepEqual(r.inconsistent_status_fixture_ids, [1]);
});

test("buildQualityReport: filtre par league_id/season - n'inclut pas les fixtures d'une autre ligue/saison", () => {
  const fixtures = [fx({ fixture_id: 1, league_id: 39, season: 2025 }), fx({ fixture_id: 2, league_id: 140, season: 2025 })];
  const r = buildQualityReport(fixtures, 39, 2025);
  assert.equal(r.fixtures_total, 1);
});

test("diffFixtureVersions: detecte un changement de score entre deux re-fetch (correction API ulterieure)", () => {
  const v1 = fx({ fixture_id: 1, goals_home_90: 1 });
  const v2 = fx({ fixture_id: 1, goals_home_90: 2 });
  const diff = diffFixtureVersions(v1, v2);
  assert.equal(diff.changed, true);
  assert.equal(diff.changes.length, 1);
  assert.equal(diff.changes[0].field, "goals_home_90");
});

test("diffFixtureVersions: aucun changement si les deux versions sont identiques", () => {
  const v1 = fx({ fixture_id: 1 });
  const v2 = fx({ fixture_id: 1 });
  const diff = diffFixtureVersions(v1, v2);
  assert.equal(diff.changed, false);
});
