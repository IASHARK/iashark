"use strict";
// PLAYER LAB - PILOT (2026-09-05), item 5. Construit la table
// canonique PLAYER_MATCH : une ligne par (fixture_id, team_id,
// player_id), TOUS les joueurs de la feuille de match (starters, bench
// ayant joue, bench n'ayant PAS joue - une observation 0 minute reste
// une observation, jamais exclue silencieusement).
//
// Verite terrain du role (STARTER/BENCH) : la reponse /fixtures/lineups
// (startXI vs substitutes), JAMAIS deduite des statistiques de match
// (qui peuvent manquer un joueur non utilise selon les sources) -
// c'est explicitement l'exigence de l'item 6.

const REASON_CODE = {
  MISSING_PLAYER_STATS: "MISSING_PLAYER_STATS", // present en lineup, absent de /fixtures/players
};

function extractPlayerStats(playersTeamEntry, playerId) {
  if (!playersTeamEntry) return null;
  const entry = (playersTeamEntry.players || []).find((p) => p.player && p.player.id === playerId);
  if (!entry) return null;
  return (entry.statistics && entry.statistics[0]) || null;
}

function rowFromLineupEntry({ fixtureMeta, teamId, opponentId, homeAway, lineupPlayer, lineupRole, playersTeamEntry, sourceHashes }) {
  const playerId = lineupPlayer.player.id;
  const stats = extractPlayerStats(playersTeamEntry, playerId);
  const minutes = stats && stats.games && stats.games.minutes != null ? stats.games.minutes : 0;
  const reasonCodes = [];
  if (!stats) reasonCodes.push(REASON_CODE.MISSING_PLAYER_STATS);

  return {
    fixture_id: fixtureMeta.fixture_id,
    kickoff: fixtureMeta.kickoff_timestamp,
    season: fixtureMeta.season,
    team_id: teamId,
    opponent_id: opponentId,
    home_away: homeAway,
    player_id: playerId,
    player_name: lineupPlayer.player.name,
    position: lineupPlayer.player.pos || (stats && stats.games && stats.games.position) || null,
    lineup_role: lineupRole,
    played: minutes > 0,
    minutes,
    substitute_flag: !!(stats && stats.games && stats.games.substitute),
    shots: stats && stats.shots ? stats.shots.total : null,
    shots_on_target: stats && stats.shots ? stats.shots.on : null,
    goals: stats && stats.goals && stats.goals.total != null ? stats.goals.total : 0,
    assists: stats && stats.goals && stats.goals.assists != null ? stats.goals.assists : null,
    penalty_scored: stats && stats.penalty && stats.penalty.scored != null ? stats.penalty.scored : 0,
    penalty_missed: stats && stats.penalty && stats.penalty.missed != null ? stats.penalty.missed : 0,
    red_card: !!(stats && stats.cards && stats.cards.red > 0),
    reason_codes: reasonCodes,
    source_hashes: sourceHashes,
  };
}

// fixtureMeta = ligne data/gate-b1 (fixture_id, kickoff_timestamp, season,
// home_team_id, away_team_id). lineupsRaw/playersRaw = raw_payload des
// enveloppes cache (lib/player-lab/raw-cache.js).
function buildPlayerMatchRowsForFixture({ fixtureMeta, lineupsRaw, playersRaw, sourceHashes }) {
  const lineupTeams = (lineupsRaw && lineupsRaw.response) || [];
  const playerTeams = (playersRaw && playersRaw.response) || [];
  if (lineupTeams.length < 2) return { rows: [], complete: false };

  const rows = [];
  for (const lineupTeam of lineupTeams) {
    const teamId = lineupTeam.team.id;
    const isHome = teamId === fixtureMeta.home_team_id;
    const opponentId = isHome ? fixtureMeta.away_team_id : fixtureMeta.home_team_id;
    const homeAway = isHome ? "HOME" : "AWAY";
    const playersTeamEntry = playerTeams.find((t) => t.team && t.team.id === teamId);

    for (const p of lineupTeam.startXI || []) {
      rows.push(rowFromLineupEntry({ fixtureMeta, teamId, opponentId, homeAway, lineupPlayer: p, lineupRole: "STARTER", playersTeamEntry, sourceHashes }));
    }
    for (const p of lineupTeam.substitutes || []) {
      rows.push(rowFromLineupEntry({ fixtureMeta, teamId, opponentId, homeAway, lineupPlayer: p, lineupRole: "BENCH", playersTeamEntry, sourceHashes }));
    }
  }
  return { rows, complete: lineupTeams.length === 2 && playerTeams.length === 2 };
}

module.exports = { buildPlayerMatchRowsForFixture, REASON_CODE };
