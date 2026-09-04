"use strict";
// Test de CONTRAT pour lib/data/production-replay.js#buildProductionStateAtCutoff
// (correction CHAMPION_REPLAY_MISMATCH, audit 2026-09-05). Utilise les
// VRAIES donnees Premier League deja collectees (data/gate-b1/).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { buildProductionStateAtCutoff, isM0Available, computeM0Lambdas } = require("../lib/data/production-replay.js");

const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }
const f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);
const ALL_FIXTURES = [...f2022, ...f2023, ...f2024];

function firstNMatches(seasonFixtures, teamId, n) {
  return seasonFixtures.filter((f) => f.home_team_id === teamId || f.away_team_id === teamId)
    .sort((a, b) => a.kickoff_timestamp.localeCompare(b.kickoff_timestamp)).slice(0, n);
}

test("PREUVE DECISIVE - Arsenal premier match PL 2023-24 : playedTotal=0, calcCriteres indisponible (JAMAIS debloque par les 38 matchs 2022-23)", () => {
  const [f] = firstNMatches(f2023, 42, 1);
  const state = buildProductionStateAtCutoff({ allFixtures: ALL_FIXTURES, season: 2023, teamId: 42, cutoff: f.kickoff_timestamp });
  assert.equal(state.playedTotal, 0, "aucune fixture de 2022-23 ne doit contribuer au state 2023-24");
  assert.equal(isM0Available(state), false, "calcCriteres doit refuser (<3 matchs), meme si Arsenal a 38 matchs 2022-23 dans le dataset");
});

test("Manchester City premier match 2023-24 : meme preuve", () => {
  const [f] = firstNMatches(f2023, 50, 1);
  const state = buildProductionStateAtCutoff({ allFixtures: ALL_FIXTURES, season: 2023, teamId: 50, cutoff: f.kickoff_timestamp });
  assert.equal(state.playedTotal, 0);
  assert.equal(isM0Available(state), false);
});

test("Liverpool premier match 2023-24 : meme preuve", () => {
  const [f] = firstNMatches(f2023, 40, 1);
  const state = buildProductionStateAtCutoff({ allFixtures: ALL_FIXTURES, season: 2023, teamId: 40, cutoff: f.kickoff_timestamp });
  assert.equal(state.playedTotal, 0);
  assert.equal(isM0Available(state), false);
});

test("Arsenal deuxieme et troisieme match 2023-24 : playedTotal=1 puis 2, calcCriteres reste indisponible jusqu'au 4e match", () => {
  const matches = firstNMatches(f2023, 42, 4);
  const expectedPlayed = [0, 1, 2, 3];
  const expectedValid = [false, false, false, true];
  matches.forEach((f, i) => {
    const state = buildProductionStateAtCutoff({ allFixtures: ALL_FIXTURES, season: 2023, teamId: 42, cutoff: f.kickoff_timestamp });
    assert.equal(state.playedTotal, expectedPlayed[i], `match #${i + 1}`);
    assert.equal(isM0Available(state), expectedValid[i], `match #${i + 1} disponibilite`);
  });
});

test("CONTRAT - aucune modification d'une fixture de la saison precedente ne peut changer le state M0 d'une fixture de la saison suivante", () => {
  const [f] = firstNMatches(f2023, 42, 1);
  const baseline = buildProductionStateAtCutoff({ allFixtures: ALL_FIXTURES, season: 2023, teamId: 42, cutoff: f.kickoff_timestamp });

  const alteredF2022 = f2022.map((x) => ({ ...x, goals_home_90: 99, goals_away_90: 99 }));
  const altered = buildProductionStateAtCutoff({ allFixtures: [...alteredF2022, ...f2023, ...f2024], season: 2023, teamId: 42, cutoff: f.kickoff_timestamp });

  assert.deepEqual(altered, baseline, "alterer 2022-23 ne doit STRICTEMENT RIEN changer au state M0 d'un match 2023-24");
});

test("CONTRAT - supprimer completement la saison precedente du dataset ne change RIEN non plus (preuve redondante de l'isolation)", () => {
  const f = firstNMatches(f2023, 42, 10)[9]; // 10eme match, playedTotal devrait etre 9
  const baseline = buildProductionStateAtCutoff({ allFixtures: ALL_FIXTURES, season: 2023, teamId: 42, cutoff: f.kickoff_timestamp });
  const withoutPrevSeason = buildProductionStateAtCutoff({ allFixtures: [...f2023, ...f2024], season: 2023, teamId: 42, cutoff: f.kickoff_timestamp });
  assert.deepEqual(withoutPrevSeason, baseline);
  assert.equal(baseline.playedTotal, 9);
});

test("computeM0Lambdas : indisponible (valid=false) tant qu'une des deux equipes a <3 matchs saison courante, meme avec un historique multi-saisons riche", () => {
  const [f] = firstNMatches(f2023, 42, 1);
  const result = computeM0Lambdas({ allFixtures: ALL_FIXTURES, season: 2023, homeTeamId: f.home_team_id, awayTeamId: f.away_team_id, cutoff: f.kickoff_timestamp, leagueAvgH: 1.35, leagueAvgA: 1.10, leagueId: 39 });
  assert.equal(result.valid, false);
});

test("optimisation performance - passer seasonFixtures deja pre-filtre donne EXACTEMENT le meme resultat que le filtrage interne", () => {
  const seasonFixtures = ALL_FIXTURES.filter((f) => f.season === 2023);
  for (const teamId of [42, 50, 40]) {
    const matches = firstNMatches(f2023, teamId, 5);
    for (const f of matches) {
      const withInternalFilter = buildProductionStateAtCutoff({ allFixtures: ALL_FIXTURES, season: 2023, teamId, cutoff: f.kickoff_timestamp });
      const withPrefiltered = buildProductionStateAtCutoff({ allFixtures: ALL_FIXTURES, season: 2023, teamId, cutoff: f.kickoff_timestamp, seasonFixtures });
      assert.deepEqual(withPrefiltered, withInternalFilter, `team ${teamId} fixture ${f.fixture_id}`);
    }
  }
});

test("computeM0Lambdas : disponible (valid=true) une fois les deux equipes a >=3 matchs saison courante", () => {
  // Cherche un match ou les deux equipes ont deja >=3 matchs cette saison (typiquement matchday 5+)
  const laterMatches = f2023.filter((f) => f.kickoff_timestamp.slice(0, 10) >= "2023-09-15").sort((a, b) => a.kickoff_timestamp.localeCompare(b.kickoff_timestamp));
  const f = laterMatches[0];
  const result = computeM0Lambdas({ allFixtures: ALL_FIXTURES, season: 2023, homeTeamId: f.home_team_id, awayTeamId: f.away_team_id, cutoff: f.kickoff_timestamp, leagueAvgH: 1.35, leagueAvgA: 1.10, leagueId: 39 });
  assert.equal(result.valid, true, `fixture ${f.fixture_id} du ${f.kickoff_timestamp} devrait etre disponible mi-septembre`);
});
