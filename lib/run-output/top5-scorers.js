"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06), item 1 : TOP_5_SCORERS_OF_DAY.
// Consomme des candidats PLAYER deja scores par le champion Player
// VALIDATED de leur ligue (P(score>=1), formule fermee
// lib/player-lab/scoring-formula.js - jamais recalculee ici). Ce module
// ne fait que filtrer par eligibilite registry, classer et formater.

const { isLeaguePlayerEligible } = require("./eligibility.js");

function round2(x) { return Math.round(x * 10000) / 10000; }
function pct2(x) { return Math.round(x * 10000) / 100; }

// candidates : [{ source:"PLAYER", market:"ANYTIME_GOALSCORER", league_key,
//   player_id, player_name, team, opponent, fixture_id, kickoff,
//   player_model_version, model_probability, lineup_status }]
function computeTop5ScorersOfDay({ candidates, registry, snapshotTime }) {
  if (!snapshotTime) throw new Error("computeTop5ScorersOfDay: snapshotTime requis (determinisme)");
  const eligible = (candidates || []).filter(
    (c) => c.source === "PLAYER" && c.market === "ANYTIME_GOALSCORER" && isLeaguePlayerEligible(registry.leagues[c.league_key])
  );

  // Tri decroissant par probabilite ; egalite departagee par fixture_id
  // puis player_id (deterministe, jamais l'ordre d'insertion du tableau
  // d'entree, qui peut varier d'un appel a l'autre).
  const sorted = [...eligible].sort((a, b) => {
    if (b.model_probability !== a.model_probability) return b.model_probability - a.model_probability;
    if (a.fixture_id !== b.fixture_id) return a.fixture_id - b.fixture_id;
    return String(a.player_id).localeCompare(String(b.player_id));
  });

  const top = sorted.slice(0, 5).map((c, idx) => ({
    rank: idx + 1,
    player_id: c.player_id,
    player_name: c.player_name,
    team: c.team,
    opponent: c.opponent,
    fixture_id: c.fixture_id,
    kickoff: c.kickoff,
    league: c.league_key,
    player_model_version: c.player_model_version,
    scorer_probability: round2(c.model_probability),
    scorer_probability_pct: pct2(c.model_probability),
    lineup_status: c.lineup_status,
    snapshot_time: snapshotTime,
  }));

  return { generated_at: snapshotTime, eligible_player_count: eligible.length, count_returned: top.length, players: top };
}

module.exports = { computeTop5ScorersOfDay };
