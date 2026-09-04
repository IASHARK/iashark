#!/usr/bin/env node
"use strict";
// Audit 2026-09-05 (CHAMPION_REPLAY_MISMATCH) - calcule le nombre REEL
// d'exclusions M0 attendu avec la regle production correcte : agregats
// STRICTEMENT saison courante (fixtures.season===S && kickoff<cutoff),
// jamais poolees avec une saison anterieure. Ne modifie AUCUNE regle
// pour recuperer plus de matchs - rapporte le chiffre reel, quel qu'il soit.

const fs = require("fs");
const { buildTeamState, toCalcCriteresStats } = require("../lib/data/team-state.js");
const { calcCriteres } = require("../lib/engine.js");

function loadSeason(s) { return JSON.parse(fs.readFileSync(`data/gate-b1/premier-league-${s}.json`, "utf8")); }
const f2023 = loadSeason(2023), f2024 = loadSeason(2024);

function countExclusions(seasonFixtures, label) {
  let excluded = 0, total = 0;
  const excludedList = [];
  for (const f of seasonFixtures) {
    if (f.goals_home_90 == null || f.goals_away_90 == null) continue;
    total++;
    const cutoff = f.kickoff_timestamp;
    const trainFixtures = seasonFixtures.filter((x) => new Date(x.kickoff_timestamp).getTime() < new Date(cutoff).getTime());
    const homeState = buildTeamState(trainFixtures, f.home_team_id, cutoff);
    const awayState = buildTeamState(trainFixtures, f.away_team_id, cutoff);
    const homeOk = !!calcCriteres(toCalcCriteresStats(homeState), true, null);
    const awayOk = !!calcCriteres(toCalcCriteresStats(awayState), false, null);
    if (!homeOk || !awayOk) {
      excluded++;
      excludedList.push({ fixture_id: f.fixture_id, date: cutoff.slice(0, 10), home: f.home_team_name, away: f.away_team_name, home_played: homeState.playedTotal, away_played: awayState.playedTotal });
    }
  }
  console.log(`${label}: total=${total}, excluded (SEASON-SCOPED, regle production correcte)=${excluded}, usable=${total - excluded}`);
  return { total, excluded, excludedList };
}

const r2023 = countExclusions(f2023, "2023-24");
const r2024 = countExclusions(f2024, "2024-25");
console.log(`\nTOTAL sur les 2 saisons : ${r2023.total + r2024.total} fixtures, ${r2023.excluded + r2024.excluded} exclusions attendues (vs 12 rapportees a tort par EXP-001 pooled)`);

fs.writeFileSync("scripts/experiments/true_m0_exclusion_audit.json", JSON.stringify({
  season_2023: r2023, season_2024: r2024,
  total_fixtures: r2023.total + r2024.total,
  total_true_exclusions: r2023.excluded + r2024.excluded,
  total_exclusions_previously_reported_pooled: 12,
}, null, 2));
