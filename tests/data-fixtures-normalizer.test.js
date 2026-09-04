"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeFixture, normalizeFixturesBatch, classifyStatus } = require("../lib/data/fixtures-normalizer.js");

test("normalizeFixture: match FT normal - goals_90 == goals_final (pas de prolongation)", () => {
  const raw = {
    fixture: { id: 100, date: "2026-08-15T15:00:00+00:00", status: { short: "FT" } },
    league: { id: 39, season: 2025 },
    teams: { home: { id: 1, name: "Team A" }, away: { id: 2, name: "Team B" } },
    goals: { home: 2, away: 1 },
    score: { fulltime: { home: 2, away: 1 } },
  };
  const n = normalizeFixture(raw);
  assert.equal(n.goals_home_90, 2);
  assert.equal(n.goals_away_90, 1);
  assert.equal(n.goals_home_final, 2);
  assert.equal(n.goals_away_final, 1);
  assert.equal(n.status, "FINISHED");
});

test("normalizeFixture: match AET - goals_90 (reglementaire) DIFFERE de goals_final (avec prolongation) - le BLOCKER CRITIQUE corrige", () => {
  const raw = {
    fixture: { id: 101, date: "2026-05-10T19:00:00+00:00", status: { short: "AET" } },
    league: { id: 2, season: 2025 },
    teams: { home: { id: 1, name: "Team A" }, away: { id: 2, name: "Team B" } },
    goals: { home: 2, away: 1 }, // score final incluant prolongation
    score: { fulltime: { home: 1, away: 1 } }, // score reglementaire 90 min
  };
  const n = normalizeFixture(raw);
  assert.equal(n.goals_home_90, 1, "goals_home_90 doit venir de score.fulltime, PAS de goals.home");
  assert.equal(n.goals_away_90, 1);
  assert.equal(n.goals_home_final, 2, "goals_home_final doit rester le score reel incluant la prolongation");
  assert.equal(n.goals_away_final, 1);
  assert.notEqual(n.goals_home_90, n.goals_home_final, "un match AET doit produire des valeurs 90/final DIFFERENTES - c'est exactement ce que ce module doit garantir");
});

test("normalizeFixture: match PEN (tirs au but) - meme logique que AET pour le score reglementaire", () => {
  const raw = {
    fixture: { id: 102, date: "2026-05-10T19:00:00+00:00", status: { short: "PEN" } },
    league: { id: 2, season: 2025 },
    teams: { home: { id: 1, name: "Team A" }, away: { id: 2, name: "Team B" } },
    goals: { home: 1, away: 1 }, // score.home/away chez API-Football n'inclut pas les tirs au but eux-memes
    score: { fulltime: { home: 1, away: 1 } },
  };
  const n = normalizeFixture(raw);
  assert.equal(n.goals_home_90, 1);
  assert.equal(n.goals_away_90, 1);
});

test("normalizeFixture: statuts VOID (PST/CANC/ABD) classes correctement", () => {
  for (const s of ["PST", "CANC", "ABD"]) {
    assert.equal(classifyStatus(s), "VOID", `statut ${s} doit etre VOID`);
  }
});

test("normalizeFixture: fixture incomplete (pas d'ID, pas d'equipe) renvoie null - jamais une ligne fabriquee", () => {
  assert.equal(normalizeFixture(null), null);
  assert.equal(normalizeFixture({}), null);
  assert.equal(normalizeFixture({ fixture: { id: 1 } }), null); // pas de teams/goals
});

test("normalizeFixturesBatch: compte les elements ignores separement, jamais silencieusement", () => {
  const rawList = [
    { fixture: { id: 1, date: "2026-01-01T00:00:00Z", status: { short: "FT" } }, league: {}, teams: { home: { id: 1 }, away: { id: 2 } }, goals: { home: 1, away: 0 } },
    { fixture: { id: 2 } }, // incomplet -> doit etre ignore
    null,
  ];
  const { fixtures, skipped } = normalizeFixturesBatch(rawList);
  assert.equal(fixtures.length, 1);
  assert.equal(skipped, 2);
});
