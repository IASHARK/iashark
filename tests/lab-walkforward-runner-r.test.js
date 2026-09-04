"use strict";
// EXP-001R - tests du runner corrige AVANT tout lancement reel.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { runWalkForwardR } = require("../lib/lab/walkforward-runner-r.js");

const LEAGUE_ID = 39, HOME_ID = 10, AWAY_POOL_START = 100;

function buildSyntheticSeason(nTeams, matchesPerTeam, startDate, season) {
  const fixtures = [];
  let fid = season * 100000 + 1;
  const start = new Date(startDate).getTime();
  const dayMs = 86400000;
  for (let t = 0; t < nTeams; t++) {
    const teamId = HOME_ID + t;
    for (let m = 0; m < matchesPerTeam; m++) {
      const oppId = AWAY_POOL_START + ((t + m + 1) % nTeams);
      const kickoff = new Date(start + (t * matchesPerTeam + m) * dayMs).toISOString();
      fixtures.push({
        fixture_id: fid++, league_id: LEAGUE_ID, season, kickoff_timestamp: kickoff,
        home_team_id: teamId, away_team_id: oppId, status: "FINISHED",
        goals_home_90: (m + t) % 3, goals_away_90: (m + t + 1) % 3,
      });
    }
  }
  return fixtures.sort((a, b) => new Date(a.kickoff_timestamp) - new Date(b.kickoff_timestamp));
}

function fixedRhoFitter() { return { rho_hat: -0.10, convergence: true, iterations: 1 }; }

test("anti-leakage : un match futur aberrant ne change aucune prediction anterieure", () => {
  const warmup = buildSyntheticSeason(8, 10, "2026-01-01T12:00:00Z", 2022);
  const oos = buildSyntheticSeason(8, 20, "2026-08-01T12:00:00Z", 2023);
  const base = { allFixtures: [...warmup, ...oos], trainSeasons: [2022], oosSeasons: [2023], championRho: -0.0845, candidateRhoFitter: fixedRhoFitter, leagueAvgH: 1.35, leagueAvgA: 1.10, leagueId: LEAGUE_ID };

  const before = runWalkForwardR(base);
  assert.ok(before.predictions.length > 0);

  const lastDate = new Date(Math.max(...oos.map((f) => new Date(f.kickoff_timestamp).getTime())));
  const futureMatch = { fixture_id: 9999999, league_id: LEAGUE_ID, season: 2023, kickoff_timestamp: new Date(lastDate.getTime() + 30 * 86400000).toISOString(), home_team_id: HOME_ID, away_team_id: AWAY_POOL_START, status: "FINISHED", goals_home_90: 20, goals_away_90: 0 };
  const after = runWalkForwardR({ ...base, allFixtures: [...warmup, ...oos, futureMatch] });

  for (const b of before.predictions) {
    const a = after.predictions.find((p) => p.fixture_id === b.fixture_id && p.cutoff === b.cutoff);
    assert.ok(a, `prediction ${b.fixture_id} introuvable apres`);
    assert.deepEqual(a, b, `prediction ${b.fixture_id} a change - FUITE`);
  }
});

test("aucune fixture de la saison precedente ne peut debloquer M0 pour une equipe sans historique saison courante (equipe promue synthetique)", () => {
  const warmup = buildSyntheticSeason(6, 10, "2026-01-01T12:00:00Z", 2022); // equipes HOME_ID..HOME_ID+5
  const oos = buildSyntheticSeason(6, 10, "2026-08-01T12:00:00Z", 2023);
  const PROMOTED_ID = 8888;
  oos.push({ fixture_id: 700001, league_id: LEAGUE_ID, season: 2023, kickoff_timestamp: "2026-08-02T12:00:00.000Z", home_team_id: PROMOTED_ID, away_team_id: HOME_ID, status: "FINISHED", goals_home_90: 1, goals_away_90: 1 });
  oos.sort((a, b) => new Date(a.kickoff_timestamp) - new Date(b.kickoff_timestamp));

  const result = runWalkForwardR({ allFixtures: [...warmup, ...oos], trainSeasons: [2022], oosSeasons: [2023], championRho: -0.0845, candidateRhoFitter: fixedRhoFitter, leagueAvgH: 1.35, leagueAvgA: 1.10, leagueId: LEAGUE_ID });
  const promotedPrediction = result.predictions.find((p) => p.fixture_id === 700001);
  assert.equal(promotedPrediction, undefined, "l'equipe sans historique saison courante ne doit produire AUCUNE prediction M0 (calcCriteres<3), meme si des equipes homonymes ont un historique 2022");
});

test("preuve reelle : sur les vraies donnees Premier League, ~61 exclusions M0 attendues sur les 2 saisons OOS (contre 12 avec le bug pool multi-saisons)", () => {
  const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
  function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }
  const f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);
  const result = runWalkForwardR({
    allFixtures: [...f2022, ...f2023, ...f2024], trainSeasons: [2022], oosSeasons: [2023, 2024],
    championRho: -0.0845, candidateRhoFitter: fixedRhoFitter, leagueAvgH: 1.35, leagueAvgA: 1.10, leagueId: LEAGUE_ID,
  });
  console.log(`  n_predictions=${result.predictions.length}, n_excluded=${result.n_excluded_m0_unavailable}`);
  assert.ok(result.n_excluded_m0_unavailable >= 55 && result.n_excluded_m0_unavailable <= 65, `exclusions=${result.n_excluded_m0_unavailable}, attendu ~61`);
  assert.equal(result.predictions.length + result.n_excluded_m0_unavailable, 760);
});
