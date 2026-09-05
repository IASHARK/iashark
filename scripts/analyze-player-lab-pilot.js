#!/usr/bin/env node
"use strict";
// PLAYER LAB - PILOT (2026-09-05), item 16-17. Orchestre l'analyse
// complete du pilot Premier League 2024-25 depuis le cache immuable
// deja collecte (aucun appel API ici) : construit la table canonique
// PLAYER_MATCH, reconcilie les buts, vérifie la coherence des minutes,
// audite les positions, detecte penalties/own-goals, teste le mapping
// joueur-equipe (transferts), et evalue le pilot gate contre les
// seuils pre-enregistres (item 17).

const fs = require("fs");
const path = require("path");
const { readCached, isCached } = require("../lib/player-lab/raw-cache.js");
const { buildPlayerMatchRowsForFixture } = require("../lib/player-lab/build-player-match-table.js");
const { extractGoalEvents, reconcileRegulatoryGoals } = require("../lib/player-lab/goal-events.js");
const { checkRowConsistency } = require("../lib/player-lab/minutes-consistency.js");
const { auditPositions } = require("../lib/player-lab/position-taxonomy.js");
const { evaluatePilotGate } = require("../lib/player-lab/pilot-gate.js");

const ENDPOINTS = ["lineups", "players", "events"];

function pct(n, d) { return d ? Number(((n / d) * 100).toFixed(2)) : null; }

function main() {
  const fixturesPath = path.join(__dirname, "..", "data", "gate-b1", "premier-league-2024.json");
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));

  let lineupAvailable = 0, bothTeamsLineup = 0, playersAvailable = 0, eventsAvailable = 0;
  let allRows = [], reconciliations = [], minutesIssues = [], allGoalEvents = [], allMissedPenalties = [];
  const skippedFixtures = [];

  for (const fx of fixtures) {
    const missingEndpoints = ENDPOINTS.filter((e) => !isCached(e, fx.fixture_id));
    if (missingEndpoints.length) { skippedFixtures.push({ fixture_id: fx.fixture_id, missing: missingEndpoints }); continue; }

    const lineupsEnv = readCached("lineups", fx.fixture_id);
    const playersEnv = readCached("players", fx.fixture_id);
    const eventsEnv = readCached("events", fx.fixture_id);
    const lineupsRaw = lineupsEnv.raw_payload, playersRaw = playersEnv.raw_payload, eventsRaw = eventsEnv.raw_payload;

    const lineupTeams = (lineupsRaw && lineupsRaw.response) || [];
    const playerTeams = (playersRaw && playersRaw.response) || [];
    const events = (eventsRaw && eventsRaw.response) || [];

    if (lineupTeams.length >= 1) lineupAvailable++;
    if (lineupTeams.length === 2) bothTeamsLineup++;
    if (playerTeams.length === 2) playersAvailable++;
    if (eventsRaw && Array.isArray(eventsRaw.response)) eventsAvailable++;

    const sourceHashes = { lineups: lineupsEnv.response_hash, players: playersEnv.response_hash, events: eventsEnv.response_hash };
    const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: fx, lineupsRaw, playersRaw, sourceHashes });
    allRows = allRows.concat(rows);

    for (const row of rows) {
      const check = checkRowConsistency(row, events);
      if (check.reasons.length) minutesIssues.push(check);
    }

    const { goalEvents, missedPenalties } = extractGoalEvents(fx, eventsRaw);
    allGoalEvents = allGoalEvents.concat(goalEvents.map((g) => ({ ...g, fixture_id: fx.fixture_id })));
    allMissedPenalties = allMissedPenalties.concat(missedPenalties);
    reconciliations.push(reconcileRegulatoryGoals(fx, goalEvents));
  }

  const starters = allRows.filter((r) => r.lineup_role === "STARTER");
  const bench = allRows.filter((r) => r.lineup_role === "BENCH");
  const benchZero = bench.filter((r) => r.minutes === 0);
  const benchUsed = bench.filter((r) => r.minutes > 0);

  const minutesNonNull = allRows.filter((r) => r.minutes != null).length;
  const shotsNonNull = allRows.filter((r) => r.shots != null).length;
  const sotNonNull = allRows.filter((r) => r.shots_on_target != null).length;
  const goalsNonNull = allRows.filter((r) => r.goals != null).length;
  const missingStats = allRows.filter((r) => r.reason_codes.includes("MISSING_PLAYER_STATS"));
  const playerIdMappingPct = pct(allRows.length - missingStats.length, allRows.length);

  const goalEventsWithPlayer = allGoalEvents.filter((g) => g.player_id != null).length;
  const eventScorerMappingPct = pct(goalEventsWithPlayer, allGoalEvents.length);

  const reconcileMatches = reconciliations.filter((r) => r.match).length;
  const regulatoryGoalReconciliationPct = pct(reconcileMatches, reconciliations.length);

  const positionAudit = auditPositions(allRows);
  const penaltyGoals = allGoalEvents.filter((g) => g.penalty_flag);
  const ownGoals = allGoalEvents.filter((g) => g.own_goal_flag);
  const ownGoalDetails = [...new Set(ownGoals.map((g) => g.detail))];

  // item 11 : transfert/mapping joueur-equipe - un joueur avec >1
  // team_id distinct dans le pilot a change de club (ou pret) pendant
  // la saison ; son historique reste attache a player_id, jamais
  // fusionne ni perdu.
  const teamsByPlayer = new Map();
  for (const r of allRows) {
    if (!teamsByPlayer.has(r.player_id)) teamsByPlayer.set(r.player_id, new Set());
    teamsByPlayer.get(r.player_id).add(r.team_id);
  }
  const transferredPlayers = [...teamsByPlayer.entries()].filter(([, teams]) => teams.size > 1).map(([playerId, teams]) => ({ player_id: playerId, teams: [...teams] }));

  const report = {
    fixtures_total: fixtures.length,
    fixtures_fully_cached: fixtures.length - skippedFixtures.length,
    fixtures_skipped: skippedFixtures,
    lineup_available_pct: pct(lineupAvailable, fixtures.length),
    both_teams_lineup_pct: pct(bothTeamsLineup, fixtures.length),
    fixture_player_available_pct: pct(playersAvailable, fixtures.length),
    events_available_pct: pct(eventsAvailable, fixtures.length),
    player_match_rows: allRows.length,
    starters_rows: starters.length,
    bench_rows: bench.length,
    bench_used_rows: benchUsed.length,
    bench_zero_minute_rows: benchZero.length,
    minutes_non_null_pct: pct(minutesNonNull, allRows.length),
    shots_non_null_pct: pct(shotsNonNull, allRows.length),
    shots_on_target_non_null_pct: pct(sotNonNull, allRows.length),
    goals_non_null_pct: pct(goalsNonNull, allRows.length),
    player_id_mapping_pct: playerIdMappingPct,
    missing_player_stats_count: missingStats.length,
    event_scorer_mapping_pct: eventScorerMappingPct,
    substitutions_mapping_note: "verifie via minutes-consistency (voir minutes_consistency_issues_count) - meme mecanisme d'appariement que le scorer mapping",
    minutes_consistency_issues_count: minutesIssues.length,
    minutes_consistency_issue_breakdown: minutesIssues.reduce((acc, m) => { for (const r of m.reasons) acc[r] = (acc[r] || 0) + 1; return acc; }, {}),
    position_distribution: positionAudit,
    total_goal_events: allGoalEvents.length,
    penalty_goals_scored: penaltyGoals.length,
    missed_penalties_detected: allMissedPenalties.length,
    own_goals_detected: ownGoals.length,
    own_goal_detail_strings: ownGoalDetails,
    regulatory_goal_reconciliation_pct: regulatoryGoalReconciliationPct,
    regulatory_goal_mismatches: reconciliations.filter((r) => !r.match),
    transferred_players: transferredPlayers,
  };

  const gate = evaluatePilotGate(report, false);
  report.pilot_gate = gate;

  const outPath = path.join(__dirname, "..", "data", "player-lab", "pilot-report-2024.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("\nRapport ecrit dans", outPath);
}

main();
