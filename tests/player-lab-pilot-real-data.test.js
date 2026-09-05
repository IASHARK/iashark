"use strict";
// PLAYER LAB - PILOT (2026-09-05). Tests sur les VRAIES donnees
// collectees (data/player-lab/raw/, Premier League 2024-25, 1140
// appels API reels deja effectues - aucun nouvel appel ici, lecture de
// cache uniquement) : anti-leakage sur un vrai joueur et test de
// mapping transfert (item 11).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { readCached, isCached } = require("../lib/player-lab/raw-cache.js");
const { buildPlayerMatchRowsForFixture } = require("../lib/player-lab/build-player-match-table.js");
const { reconstructFeaturesBeforeCutoff } = require("../lib/player-lab/anti-leakage.js");

const FIXTURES_PATH = path.join(__dirname, "..", "data", "gate-b1", "premier-league-2024.json");
const fixtures = JSON.parse(fs.readFileSync(FIXTURES_PATH, "utf8"));

function buildAllRows() {
  let allRows = [];
  for (const fx of fixtures) {
    if (!isCached("lineups", fx.fixture_id) || !isCached("players", fx.fixture_id)) continue;
    const lineupsRaw = readCached("lineups", fx.fixture_id).raw_payload;
    const playersRaw = readCached("players", fx.fixture_id).raw_payload;
    const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: fx, lineupsRaw, playersRaw, sourceHashes: {} });
    allRows = allRows.concat(rows);
  }
  return allRows;
}

test("PRE_LINEUP anti-leakage sur donnees REELLES : muter un match reel futur ne change jamais les features reconstruites a un cutoff anterieur", () => {
  const allRows = buildAllRows();
  assert.ok(allRows.length > 10000, "le pilot doit etre collecte pour ce test (data/player-lab/raw/)");

  // Choisit un joueur reel avec au moins 10 apparitions dans la saison.
  const countsByPlayer = new Map();
  for (const r of allRows) countsByPlayer.set(r.player_id, (countsByPlayer.get(r.player_id) || 0) + 1);
  const [samplePlayerId] = [...countsByPlayer.entries()].find(([, n]) => n >= 10);
  const rowsForPlayer = allRows.filter((r) => r.player_id === samplePlayerId).sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));

  const cutoffMatch = rowsForPlayer[7]; // le 8e match reel de sa saison
  const before = reconstructFeaturesBeforeCutoff(rowsForPlayer, cutoffMatch.kickoff);
  assert.ok(before.n_prior_matches >= 7);

  // Mute TOUTES les lignes du joueur a partir du match cutoff inclus
  // (simule un "futur" different) - les features avant cutoff ne
  // doivent pas bouger d'un iota.
  const mutated = rowsForPlayer.map((r) => (new Date(r.kickoff).getTime() >= new Date(cutoffMatch.kickoff).getTime() ? { ...r, minutes: 0, shots: 999, goals: 999, lineup_role: "BENCH" } : r));
  const after = reconstructFeaturesBeforeCutoff(mutated, cutoffMatch.kickoff);
  assert.deepEqual(before, after, "muter le match cible (et tout ce qui suit) ne doit JAMAIS changer les features PRE_LINEUP calculees a son cutoff");
});

test("transfer/team mapping (item 11) : au moins un joueur reel a change de team_id pendant la saison, son historique reste attache a son player_id", () => {
  const allRows = buildAllRows();
  const teamsByPlayer = new Map();
  for (const r of allRows) {
    if (!teamsByPlayer.has(r.player_id)) teamsByPlayer.set(r.player_id, new Map());
    const m = teamsByPlayer.get(r.player_id);
    if (!m.has(r.team_id)) m.set(r.team_id, []);
    m.get(r.team_id).push(r.fixture_id);
  }
  const transferred = [...teamsByPlayer.entries()].filter(([, teams]) => teams.size > 1);
  assert.ok(transferred.length > 0, "au moins un transfert reel doit exister dans une saison complete de Premier League");

  const [playerId, teamsMap] = transferred[0];
  const rowsForThatPlayer = allRows.filter((r) => r.player_id === playerId);
  const distinctTeams = new Set(rowsForThatPlayer.map((r) => r.team_id));
  assert.equal(distinctTeams.size, teamsMap.size);
  // chaque ligne individuelle reste correcte pour SA fixture (team_id
  // n'est jamais retroactivement corrige a la valeur la plus recente).
  for (const [teamId, fixtureIds] of teamsMap) {
    for (const fid of fixtureIds) {
      const row = rowsForThatPlayer.find((r) => r.fixture_id === fid);
      assert.equal(row.team_id, teamId);
    }
  }
});
