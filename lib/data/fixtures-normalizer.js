"use strict";
// GATE B3 (SPEC LAB PRO v1.0 SS23, SS31) - normalise une reponse brute
// /fixtures d'API-Football vers le schema fixtures local. Corrige au
// passage le BLOCKER_IMPLEMENTATION identifie precedemment (audit du
// pipeline reel) : goals.home/away chez API-Football represente le score
// FINAL (incluant prolongation eventuelle), jamais utilise jusqu'ici pour
// distinguer le score reglementaire du score apres prolongation. Ce
// module conserve les DEUX, comme exige :
//   goals_home_90/goals_away_90    <- score.fulltime.{home,away} (90 min reglementaires)
//   goals_home_final/goals_away_final <- goals.{home,away} (score final reel, ET inclus)
// Le laboratoire (walk-forward M0-M5) doit utiliser goals_*_90 pour
// resoudre les marches reglementaires (1X2/O-U/BTTS) - jamais goals_*_final
// pour ces marches-la (voir SPEC LAB PRO v1.0 SS23).

const VOID_STATUSES = new Set(["PST", "CANC", "ABD"]);
const FINISHED_STATUSES = new Set(["FT", "AET", "PEN"]);

function classifyStatus(shortStatus) {
  if (VOID_STATUSES.has(shortStatus)) return "VOID";
  if (FINISHED_STATUSES.has(shortStatus)) return "FINISHED";
  return "PENDING";
}

// Normalise UN element de reponse brute /fixtures en une ligne fixtures.
// Retourne null (jamais une ligne partielle/fabriquee) si des champs
// indispensables sont absents.
function normalizeFixture(raw, opts) {
  opts = opts || {};
  if (!raw || !raw.fixture || !raw.teams || !raw.goals) return null;
  const fixtureId = raw.fixture.id;
  const kickoff = raw.fixture.date;
  const homeId = raw.teams.home && raw.teams.home.id;
  const awayId = raw.teams.away && raw.teams.away.id;
  if (fixtureId == null || !kickoff || homeId == null || awayId == null) return null;

  const shortStatus = (raw.fixture.status && raw.fixture.status.short) || "";
  const status = classifyStatus(shortStatus);

  const goalsFinalHome = raw.goals.home != null ? raw.goals.home : null;
  const goalsFinalAway = raw.goals.away != null ? raw.goals.away : null;
  // score.fulltime = score reglementaire 90 min chez API-Football, distinct
  // de goals.* qui inclut la prolongation pour un match AET/PEN. Repli
  // explicite sur goals.* UNIQUEMENT si le match n'est pas alle en
  // prolongation (FT normal) - fulltime et goals coincident alors par
  // definition, donc aucune perte d'information, jamais une fabrication.
  const ft = raw.score && raw.score.fulltime;
  let goals90Home = ft && ft.home != null ? ft.home : null;
  let goals90Away = ft && ft.away != null ? ft.away : null;
  if ((goals90Home == null || goals90Away == null) && shortStatus === "FT") {
    goals90Home = goalsFinalHome;
    goals90Away = goalsFinalAway;
  }

  return {
    fixture_id: fixtureId,
    league_id: raw.league && raw.league.id != null ? raw.league.id : (opts.leagueId != null ? opts.leagueId : null),
    season: raw.league && raw.league.season != null ? raw.league.season : (opts.season != null ? opts.season : null),
    kickoff_timestamp: kickoff,
    home_team_id: homeId,
    away_team_id: awayId,
    home_team_name: (raw.teams.home && raw.teams.home.name) || null,
    away_team_name: (raw.teams.away && raw.teams.away.name) || null,
    status,
    status_short: shortStatus,
    goals_home_final: goalsFinalHome,
    goals_away_final: goalsFinalAway,
    goals_home_90: goals90Home,
    goals_away_90: goals90Away,
    source_retrieved_at: opts.retrievedAt || null,
    source_response_hash: opts.responseHash || null,
    dataset_version: opts.datasetVersion || null,
  };
}

// Normalise un tableau complet de reponses brutes (response[] d'un ou
// plusieurs appels pagines) en lignes fixtures, en filtrant les elements
// non normalisables (compte remonte dans le rapport B4, jamais silencieux).
function normalizeFixturesBatch(rawList, opts) {
  const out = [];
  let skipped = 0;
  for (const raw of rawList || []) {
    const n = normalizeFixture(raw, opts);
    if (n) out.push(n);
    else skipped++;
  }
  return { fixtures: out, skipped };
}

module.exports = { normalizeFixture, normalizeFixturesBatch, classifyStatus, VOID_STATUSES, FINISHED_STATUSES };
