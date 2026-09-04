"use strict";
// GATE B4 (SPEC LAB PRO v1.0) - rapport de qualite obligatoire par
// league-season avant toute entree dans EXP-001. Aucune saison n'est
// utilisee sans etre expliquee/comptabilisee ici.

function buildQualityReport(fixtures, leagueId, season) {
  const relevant = fixtures.filter((f) => f.league_id === leagueId && f.season === season);
  const seen = new Map(); // fixture_id -> premiere occurrence
  const duplicates = [];
  const missingTeams = [];
  const missingKickoff = [];
  const missingScore = [];
  const inconsistentStatus = [];
  const homeEqualsAway = [];
  const negativeScores = [];
  let finished = 0;
  let excluded = 0;

  for (const f of relevant) {
    if (seen.has(f.fixture_id)) {
      duplicates.push(f.fixture_id);
      continue;
    }
    seen.set(f.fixture_id, f);

    let ok = true;
    if (f.home_team_id == null || f.away_team_id == null) { missingTeams.push(f.fixture_id); ok = false; }
    if (!f.kickoff_timestamp) { missingKickoff.push(f.fixture_id); ok = false; }
    if (f.home_team_id != null && f.away_team_id != null && f.home_team_id === f.away_team_id) { homeEqualsAway.push(f.fixture_id); ok = false; }

    if (f.status === "FINISHED") {
      finished++;
      if (f.goals_home_90 == null || f.goals_away_90 == null) { missingScore.push(f.fixture_id); ok = false; }
      else if (f.goals_home_90 < 0 || f.goals_away_90 < 0) { negativeScores.push(f.fixture_id); ok = false; }
    } else if (f.status === "PENDING" && (f.goals_home_90 != null || f.goals_away_90 != null)) {
      // un match "en attente" ne devrait jamais deja avoir un score reglementaire
      inconsistentStatus.push(f.fixture_id);
      ok = false;
    }

    if (!ok) excluded++;
  }

  return {
    league_id: leagueId,
    season,
    fixtures_total: relevant.length,
    finished,
    excluded,
    duplicates: duplicates.length,
    duplicate_fixture_ids: duplicates,
    missing_score: missingScore.length,
    missing_score_fixture_ids: missingScore,
    missing_teams_fixture_ids: missingTeams,
    missing_kickoff_fixture_ids: missingKickoff,
    inconsistent_status_fixture_ids: inconsistentStatus,
    home_equals_away_fixture_ids: homeEqualsAway,
    negative_score_fixture_ids: negativeScores,
    usable_for_walkforward: finished - excluded >= 0 ? finished - excluded : 0,
  };
}

// Compare deux versions d'un meme fixture (re-fetch a des dates
// differentes) et signale un changement reel (score/statut/kickoff) -
// jamais silencieux, exige par SPEC LAB PRO v1.0 SS55.
function diffFixtureVersions(oldFixture, newFixture) {
  if (!oldFixture || !newFixture || oldFixture.fixture_id !== newFixture.fixture_id) return null;
  const fieldsToCompare = ["status", "goals_home_90", "goals_away_90", "goals_home_final", "goals_away_final", "kickoff_timestamp"];
  const changes = [];
  for (const f of fieldsToCompare) {
    if (oldFixture[f] !== newFixture[f]) {
      changes.push({ field: f, old_value: oldFixture[f], new_value: newFixture[f] });
    }
  }
  return { fixture_id: oldFixture.fixture_id, changed: changes.length > 0, changes };
}

module.exports = { buildQualityReport, diffFixtureVersions };
