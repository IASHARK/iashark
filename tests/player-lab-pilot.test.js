"use strict";
// PLAYER LAB - PILOT (2026-09-05). Tests unitaires sur un fixture
// SYNTHETIQUE (mais realiste : 2 buts domicile dont un penalty apres
// entree en jeu, 1 but exterieur, 1 remplacement) - rapide et
// deterministe, independant de la collecte reelle en cours.

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPlayerMatchRowsForFixture } = require("../lib/player-lab/build-player-match-table.js");
const { extractGoalEvents, reconcileRegulatoryGoals } = require("../lib/player-lab/goal-events.js");
const { checkRowConsistency, REASON: MINUTES_REASON } = require("../lib/player-lab/minutes-consistency.js");
const { auditPositions } = require("../lib/player-lab/position-taxonomy.js");
const { reconstructFeaturesBeforeCutoff } = require("../lib/player-lab/anti-leakage.js");
const { evaluatePilotGate, PILOT_GATE_THRESHOLDS } = require("../lib/player-lab/pilot-gate.js");
const { MODE, LINEUP_TIMING_EVIDENCE, INJURY_FEATURES } = require("../lib/player-lab/modes.js");
const { recordLineupObservation, reduceToFirstSeen } = require("../lib/player-lab/forward-lineup-timing.js");

const FIXTURE_META = {
  fixture_id: 9001, kickoff_timestamp: "2024-08-17T14:00:00Z", season: 2024,
  home_team_id: 100, away_team_id: 200, goals_home_90: 2, goals_away_90: 1,
};

function statRow(id, name, minutes, position, substitute, shots, on, goals, assists, penScored, redCard) {
  return { player: { id, name }, statistics: [{ games: { minutes, position, substitute, captain: false }, shots: { total: shots, on }, goals: { total: goals, assists, conceded: null, saves: null }, penalty: { scored: penScored, missed: 0 }, cards: { yellow: 0, red: redCard ? 1 : 0 } }] };
}

const LINEUPS_RAW = {
  response: [
    { team: { id: 100, name: "Home FC" }, formation: "4-4-2",
      startXI: [{ player: { id: 1, name: "H GK", pos: "G", grid: "1:1" } }, { player: { id: 2, name: "H Starter", pos: "D", grid: "2:1" } }],
      substitutes: [{ player: { id: 12, name: "H Sub1", pos: "M" } }, { player: { id: 13, name: "H Sub2", pos: "F" } }] },
    { team: { id: 200, name: "Away FC" }, formation: "4-3-3",
      startXI: [{ player: { id: 20, name: "A Starter", pos: "F", grid: "1:1" } }],
      substitutes: [{ player: { id: 21, name: "A Sub1", pos: "D" } }] },
  ],
};

const PLAYERS_RAW = {
  response: [
    { team: { id: 100, name: "Home FC" }, players: [
      statRow(1, "H GK", 90, "G", false, 0, 0, 0, null, 0, false),
      statRow(2, "H Starter", 65, "D", false, 1, 1, 1, 0, 0, false),
      statRow(12, "H Sub1", 25, "M", true, 2, 1, 1, null, 1, false),
      statRow(13, "H Sub2", 0, "F", true, null, null, 0, null, 0, false),
    ] },
    { team: { id: 200, name: "Away FC" }, players: [
      statRow(20, "A Starter", 90, "F", false, 3, 2, 1, null, 0, false),
      statRow(21, "A Sub1", 0, "D", true, null, null, 0, null, 0, false),
    ] },
  ],
};

const EVENTS_RAW = {
  response: [
    { time: { elapsed: 30, extra: null }, team: { id: 100, name: "Home FC" }, player: { id: 2, name: "H Starter" }, assist: { id: null, name: null }, type: "Goal", detail: "Normal Goal" },
    { time: { elapsed: 65, extra: null }, team: { id: 100, name: "Home FC" }, player: { id: 2, name: "H Starter" }, assist: { id: 12, name: "H Sub1" }, type: "subst", detail: "Substitution 1" },
    { time: { elapsed: 70, extra: null }, team: { id: 200, name: "Away FC" }, player: { id: 20, name: "A Starter" }, assist: { id: null, name: null }, type: "Goal", detail: "Normal Goal" },
    { time: { elapsed: 80, extra: 2 }, team: { id: 100, name: "Home FC" }, player: { id: 12, name: "H Sub1" }, assist: { id: null, name: null }, type: "Goal", detail: "Penalty" },
  ],
};

test("PLAYER_MATCH table : une ligne par (fixture,team,player), TOUS les joueurs de la feuille (starters + bench utilise + bench 0 minute)", () => {
  const { rows, complete } = buildPlayerMatchRowsForFixture({ fixtureMeta: FIXTURE_META, lineupsRaw: LINEUPS_RAW, playersRaw: PLAYERS_RAW, sourceHashes: { lineups: "h1", players: "h2", events: "h3" } });
  assert.equal(complete, true);
  assert.equal(rows.length, 6); // 2+2 home, 1+1 away
  const benchZero = rows.find((r) => r.player_id === 13);
  assert.equal(benchZero.lineup_role, "BENCH");
  assert.equal(benchZero.played, false);
  assert.equal(benchZero.minutes, 0, "un remplacant non utilise doit exister comme observation 0 minute, jamais exclu");
  const starter = rows.find((r) => r.player_id === 2);
  assert.equal(starter.home_away, "HOME");
  assert.equal(starter.opponent_id, 200);
  assert.deepEqual(starter.source_hashes, { lineups: "h1", players: "h2", events: "h3" });
});

test("goal attribution + conservation de masse : la somme des buts attribues egale le score reglementaire (90 min)", () => {
  const { goalEvents } = extractGoalEvents(FIXTURE_META, EVENTS_RAW);
  assert.equal(goalEvents.length, 3);
  const penaltyGoal = goalEvents.find((g) => g.penalty_flag);
  assert.ok(penaltyGoal, "le but de H Sub1 doit etre detecte comme penalty");
  assert.equal(penaltyGoal.player_id, 12);
  assert.equal(penaltyGoal.extra_minute, 2);

  const reconciliation = reconcileRegulatoryGoals(FIXTURE_META, goalEvents);
  assert.equal(reconciliation.home_attributed, 2);
  assert.equal(reconciliation.away_attributed, 1);
  assert.equal(reconciliation.match, true);
});

test("own goal : e.team represente DEJA l'equipe creditee (beneficiaire), jamais l'equipe du buteur malheureux - verifie contre une fixture reelle du pilot (1208028, Brentford-Crystal Palace : E. Pinnock, defenseur Brentford, CSC porte team=Crystal Palace)", () => {
  const ownGoalEvents = { response: [
    { time: { elapsed: 10, extra: null }, team: { id: 200, name: "Away FC" }, player: { id: 2, name: "H Starter" }, assist: { id: null, name: null }, type: "Goal", detail: "Own Goal" },
  ] };
  const fixtureWithOwnGoal = { ...FIXTURE_META, goals_home_90: 0, goals_away_90: 1 };
  const { goalEvents } = extractGoalEvents(fixtureWithOwnGoal, ownGoalEvents);
  assert.equal(goalEvents[0].own_goal_flag, true);
  assert.equal(goalEvents[0].team_id, 200, "team_id reste l'equipe CREDITEE telle que fournie par l'API, jamais reinversee");
  assert.equal(goalEvents[0].player_id, 2, "player_id reste le buteur malheureux (cote oppose a l'equipe creditee) - attribution CSC distincte du credit d'equipe");
  const reconciliation = reconcileRegulatoryGoals(fixtureWithOwnGoal, goalEvents);
  assert.equal(reconciliation.away_attributed, 1);
  assert.equal(reconciliation.home_attributed, 0);
  assert.equal(reconciliation.match, true);
});

test("but manque (missed penalty) : jamais compte comme but marque, exclu de la reconciliation", () => {
  const missedPenEvents = { response: [
    { time: { elapsed: 40, extra: null }, team: { id: 100, name: "Home FC" }, player: { id: 2, name: "H Starter" }, type: "Goal", detail: "Missed Penalty" },
  ] };
  const { goalEvents, missedPenalties } = extractGoalEvents(FIXTURE_META, missedPenEvents);
  assert.equal(goalEvents.length, 0);
  assert.equal(missedPenalties.length, 1);
});

test("reconciliation : mismatch detecte explicitement (jamais silencieux) quand un but attribue manque", () => {
  const incompleteEvents = { response: [EVENTS_RAW.response[0]] }; // seulement 1 des 3 buts reels
  const { goalEvents } = extractGoalEvents(FIXTURE_META, incompleteEvents);
  const reconciliation = reconcileRegulatoryGoals(FIXTURE_META, goalEvents);
  assert.equal(reconciliation.match, false);
  assert.equal(reconciliation.discrepancy_reason, "GOAL_COUNT_MISMATCH");
});

test("minutes consistency : starter sorti au bon moment (delta faible), remplacant entre au bon moment", () => {
  const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: FIXTURE_META, lineupsRaw: LINEUPS_RAW, playersRaw: PLAYERS_RAW, sourceHashes: {} });
  const starterOff = rows.find((r) => r.player_id === 2);
  const subOn = rows.find((r) => r.player_id === 12);
  const benchUnused = rows.find((r) => r.player_id === 13);

  const checkOff = checkRowConsistency(starterOff, EVENTS_RAW.response);
  assert.deepEqual(checkOff.reasons, [], `starter sorti a 65, minutes=65 - aucune incoherence attendue, obtenu ${JSON.stringify(checkOff)}`);

  const checkOn = checkRowConsistency(subOn, EVENTS_RAW.response);
  assert.deepEqual(checkOn.reasons, []);

  const checkUnused = checkRowConsistency(benchUnused, EVENTS_RAW.response);
  assert.deepEqual(checkUnused.reasons, [], "banc non utilise, 0 minute - coherent");
});

test("minutes consistency : detecte un remplacant credite de minutes sans evenement d'entree (incoherence reelle)", () => {
  const phantomRow = { fixture_id: 9001, team_id: 100, player_id: 999, lineup_role: "BENCH", minutes: 15 };
  const check = checkRowConsistency(phantomRow, EVENTS_RAW.response);
  assert.ok(check.reasons.includes(MINUTES_REASON.BENCH_UNUSED_NONZERO_MINUTES));
});

test("position taxonomy : rapporte les valeurs reelles distinctes, aucun regroupement arbitraire", () => {
  const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: FIXTURE_META, lineupsRaw: LINEUPS_RAW, playersRaw: PLAYERS_RAW, sourceHashes: {} });
  const audit = auditPositions(rows);
  const positions = audit.map((a) => a.position).sort();
  assert.deepEqual(positions, ["D", "F", "G", "M"].sort());
});

test("anti-leakage (PRE_LINEUP) : les features d'un match muter le futur ne changent jamais le passe", () => {
  const rowsForPlayer = [
    { kickoff: "2024-08-17T14:00:00Z", lineup_role: "STARTER", minutes: 90, shots: 2, shots_on_target: 1, goals: 0 },
    { kickoff: "2024-08-24T14:00:00Z", lineup_role: "BENCH", minutes: 10, shots: 0, shots_on_target: 0, goals: 0 },
    { kickoff: "2024-08-31T14:00:00Z", lineup_role: "STARTER", minutes: 90, shots: 3, shots_on_target: 2, goals: 1 }, // match cible D
  ];
  const cutoffD = "2024-08-31T14:00:00Z";
  const featuresBefore = reconstructFeaturesBeforeCutoff(rowsForPlayer, cutoffD);
  assert.equal(featuresBefore.n_prior_matches, 2);
  assert.deepEqual(featuresBefore.last_goals, [0, 0]);

  // Mutation du match cible D (le "futur" relatif au cutoff) : les
  // features reconstruites AVANT D ne doivent PAS changer.
  const mutatedRows = rowsForPlayer.map((r, i) => (i === 2 ? { ...r, lineup_role: "BENCH", minutes: 0, shots: 0, shots_on_target: 0, goals: 0 } : r));
  const featuresAfterMutation = reconstructFeaturesBeforeCutoff(mutatedRows, cutoffD);
  assert.deepEqual(featuresBefore, featuresAfterMutation, "muter le match cible D ne doit JAMAIS changer les features PRE_LINEUP calculees a son cutoff");
});

test("modes PRE_LINEUP / POST_LINEUP_CONDITIONAL : constantes distinctes, tag ORACLE_HISTORICAL jamais confondu avec un vrai forward", () => {
  assert.equal(MODE.PRE_LINEUP, "PRE_LINEUP");
  assert.equal(MODE.POST_LINEUP_CONDITIONAL, "POST_LINEUP_CONDITIONAL");
  assert.notEqual(LINEUP_TIMING_EVIDENCE.ORACLE_HISTORICAL, LINEUP_TIMING_EVIDENCE.FORWARD_CAPTURED);
});

test("item 15 : INJURY_FEATURES=DISABLED explicite pour le modele PRE_LINEUP V1", () => {
  assert.equal(INJURY_FEATURES, "DISABLED");
});

test("forward lineup timing : reduit une serie d'observations au premier instant vu et au premier instant non-vide, jamais recalcule apres coup", () => {
  const observations = [
    recordLineupObservation({ fixtureId: 1, kickoff: "2026-09-10T18:00:00Z", observedAt: "2026-09-10T15:00:00Z", lineupResponse: [] }),
    recordLineupObservation({ fixtureId: 1, kickoff: "2026-09-10T18:00:00Z", observedAt: "2026-09-10T17:00:00Z", lineupResponse: [{}, {}] }),
    recordLineupObservation({ fixtureId: 1, kickoff: "2026-09-10T18:00:00Z", observedAt: "2026-09-10T17:30:00Z", lineupResponse: [{}, {}] }),
  ];
  const reduced = reduceToFirstSeen(observations);
  assert.equal(reduced.first_seen_response_at, "2026-09-10T15:00:00Z");
  assert.equal(reduced.first_non_empty_lineup_at, "2026-09-10T17:00:00Z");
  assert.equal(reduced.minutes_before_kickoff_at_first_non_empty, 60);
});

test("pilot gate : PASS uniquement si TOUS les seuils pre-enregistres sont atteints, PARTIAL/BLOCKED sinon avec raisons explicites", () => {
  const perfectReport = {
    both_teams_lineup_pct: 99.5, fixture_player_available_pct: 99.7, events_available_pct: 100,
    player_id_mapping_pct: 99.8, regulatory_goal_reconciliation_pct: 99.6,
  };
  const passResult = evaluatePilotGate(perfectReport, false);
  assert.equal(passResult.status, "PASS");
  assert.deepEqual(passResult.reasons, []);

  const badReport = { ...perfectReport, both_teams_lineup_pct: 90 };
  const blockedResult = evaluatePilotGate(badReport, false);
  assert.notEqual(blockedResult.status, "PASS");
  assert.ok(blockedResult.reasons[0].includes("LINEUP_COVERAGE_BELOW_THRESHOLD"));

  const leakageResult = evaluatePilotGate(perfectReport, true);
  assert.equal(leakageResult.status, "BLOCKED");
  assert.ok(leakageResult.reasons.includes("TEMPORAL_LEAKAGE_DETECTED"));

  assert.equal(PILOT_GATE_THRESHOLDS.MIN_LINEUP_PCT, 99);
});
