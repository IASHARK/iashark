#!/usr/bin/env node
"use strict";
// EXP-002 - audit de provenance du prior (items 4 et 5, audit 2026-09-05).
// Recalcule (deterministe, aucune optimisation, aucun refit au sens du
// protocole) la decomposition EXACTE du prior utilise au premier match de
// 4 equipes promues + Arsenal (returning), pour prouver qu'aucune
// information posterieure au cutoff n'entre dans le prior.

const fs = require("fs");
const path = require("path");
const { buildTeamState } = require("../lib/data/team-state.js");
const { calcLambdas } = require("../lib/engine.js");
const { blendWithDecayingPrior } = require("../lib/lab/bayes-early-season.js");
const { isReturningTeam, LEAGUE_AVG_H, LEAGUE_AVG_A } = require("../lib/lab/walkforward-m2-runner.js");

const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }
const f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);

function teamMaxTimestamp(fixtures, teamId) {
  const relevant = fixtures.filter((f) => f.home_team_id === teamId || f.away_team_id === teamId);
  if (!relevant.length) return null;
  return relevant.map((f) => f.kickoff_timestamp).sort().slice(-1)[0];
}

function auditPromotedTeam(label, teamId, season, prevFixtures, currentFixtures) {
  const firstMatch = currentFixtures.filter((f) => f.home_team_id === teamId || f.away_team_id === teamId).sort((a, b) => a.kickoff_timestamp.localeCompare(b.kickoff_timestamp))[0];
  const isHome = firstMatch.home_team_id === teamId;
  const cutoff = firstMatch.kickoff_timestamp.slice(0, 10) + "T00:00:00.000Z";

  const returning = isReturningTeam(prevFixtures, teamId);
  const maxSourceTs = teamMaxTimestamp(prevFixtures, teamId); // null pour une equipe promue (aucune fixture dans prevFixtures)

  console.log(`\n--- ${label} (team_id=${teamId}, ${isHome ? "domicile" : "exterieur"}, fixture ${firstMatch.fixture_id}, cutoff=${cutoff}) ---`);
  console.log(`  returning=${returning} (doit etre false pour une equipe promue)`);
  console.log(`  prior source: ${returning ? "saison precedente reelle" : "CONSTANTE moyenne de ligue (aucune donnee, aucun timestamp)"}`);
  console.log(`  league_avg_h=${LEAGUE_AVG_H} league_avg_a=${LEAGUE_AVG_A} (constantes codees en dur, lib/lab/walkforward-m2-runner.js)`);
  console.log(`  max_source_timestamp (fixtures saison precedente pour cette equipe): ${maxSourceTs || "N/A - aucune fixture, prior=constante pure"}`);
  console.log(`  cutoff: ${cutoff}`);
  console.log(`  max_source_timestamp < cutoff : ${maxSourceTs ? (maxSourceTs < cutoff ? "OUI" : "NON - VIOLATION") : "N/A (prior constant, aucune comparaison necessaire - structurellement impossible de fuiter)"}`);

  const trainCurrentSeason = currentFixtures.filter((f) => new Date(f.kickoff_timestamp).getTime() < new Date(cutoff).getTime());
  const state = buildTeamState(trainCurrentSeason, teamId, cutoff);
  console.log(`  n (matchs saison courante avant cutoff): ${state.playedTotal}`);
  console.log(`  prior_weight attendu = max(0,8-0.5*${state.playedTotal}) = ${Math.max(0, 8 - 0.5 * state.playedTotal)}`);
}

function auditReturningTeam(label, teamId, season, prevFixtures, currentFixtures) {
  const firstMatch = currentFixtures.filter((f) => f.home_team_id === teamId || f.away_team_id === teamId).sort((a, b) => a.kickoff_timestamp.localeCompare(b.kickoff_timestamp))[0];
  const isHome = firstMatch.home_team_id === teamId;
  const cutoff = firstMatch.kickoff_timestamp.slice(0, 10) + "T00:00:00.000Z";

  console.log(`\n--- ${label} (team_id=${teamId}, ${isHome ? "domicile" : "exterieur"}, fixture ${firstMatch.fixture_id}, cutoff=${cutoff}) ---`);
  const returning = isReturningTeam(prevFixtures, teamId);
  console.log(`  returning=${returning}`);
  const maxSourceTs = teamMaxTimestamp(prevFixtures, teamId);
  console.log(`  saison source: 2022-2023 (COMPLETE, terminee 2023-05-28, bien avant tout cutoff 2023-24)`);
  console.log(`  max_source_timestamp: ${maxSourceTs}`);
  console.log(`  cutoff: ${cutoff}`);
  console.log(`  max_source_timestamp < cutoff : ${maxSourceTs < cutoff ? "OUI" : "NON - VIOLATION"}`);

  const prevState = buildTeamState(prevFixtures, teamId, "9999-01-01T00:00:00.000Z");
  const trainCurrentSeason = currentFixtures.filter((f) => new Date(f.kickoff_timestamp).getTime() < new Date(cutoff).getTime());
  const currentState = buildTeamState(trainCurrentSeason, teamId, cutoff);
  const n = currentState.playedTotal;

  if (isHome) {
    console.log(`  stats saison precedente (domicile) : goalsForHome=${prevState.goalsForHome} goalsAgainstHome=${prevState.goalsAgainstHome} playedHome=${prevState.playedHome}`);
    const priorFor = prevState.goalsForHome / prevState.playedHome;
    const priorAgainst = prevState.goalsAgainstHome / prevState.playedHome;
    console.log(`  prior rate for=${priorFor.toFixed(4)} against=${priorAgainst.toFixed(4)}`);
    console.log(`  current n=${n}, prior_weight=${Math.max(0, 8 - 0.5 * n)}`);
    const blendFor = blendWithDecayingPrior({ events: currentState.goalsForHome, matches: currentState.playedHome }, priorFor, n);
    const blendAgainst = blendWithDecayingPrior({ events: currentState.goalsAgainstHome, matches: currentState.playedHome }, priorAgainst, n);
    console.log(`  blend for: blended_events=${blendFor.blended_events} blended_matches=${blendFor.blended_matches} rate=${blendFor.rate.toFixed(4)}`);
    console.log(`  blend against: blended_events=${blendAgainst.blended_events} blended_matches=${blendAgainst.blended_matches} rate=${blendAgainst.rate.toFixed(4)}`);
  }
}

console.log("=== ITEM 4 : anti-leakage du prior PROMU (au premier match) ===");
auditPromotedTeam("Luton 2023-24", 1359, 2023, f2022, f2023);
auditPromotedTeam("Sheffield United 2023-24", 62, 2023, f2022, f2023);
auditPromotedTeam("Burnley 2023-24", 44, 2023, f2022, f2023);
// Ipswich team_id : a retrouver depuis les fixtures 2024
const ipswichFixture = f2024.find((f) => f.home_team_name === "Ipswich" || f.away_team_name === "Ipswich");
const ipswichId = ipswichFixture.home_team_name === "Ipswich" ? ipswichFixture.home_team_id : ipswichFixture.away_team_id;
auditPromotedTeam("Ipswich 2024-25", ipswichId, 2024, f2023, f2024);

console.log("\n\n=== ITEM 5 : prior RETURNING (Arsenal, premier match 2023-24) ===");
auditReturningTeam("Arsenal 2023-24", 42, 2023, f2022, f2023);

// --- Lambdas M0 (vrai, EXP-001) vs M2 pour Arsenal 1er match, a des fins de comparaison directe ---
const exp001 = JSON.parse(fs.readFileSync(path.join(__dirname, "experiments", "exp001_report.json"), "utf8"));
const exp002 = JSON.parse(fs.readFileSync(path.join(__dirname, "experiments", "exp002_report.json"), "utf8"));
const arsenalFirstFid = f2023.filter((f) => f.home_team_id === 42 || f.away_team_id === 42).sort((a, b) => a.kickoff_timestamp.localeCompare(b.kickoff_timestamp))[0].fixture_id;
const m0Real = exp001.predictions.find((p) => p.fixture_id === arsenalFirstFid);
const m2Real = exp002.predictions.find((p) => p.fixture_id === arsenalFirstFid);
console.log(`\nfixture_id=${arsenalFirstFid}`);
console.log(`  M0 (vrai champion, EXP-001) lambdaH=${m0Real ? m0Real.lambdaH : "N/A"} lambdaA=${m0Real ? m0Real.lambdaA : "N/A"}`);
console.log(`  M2 (EXP-002) lambdaH=${m2Real.lambdaH_m2} lambdaA=${m2Real.lambdaA_m2}`);
console.log(`  M0-style-EXP002 (current-season-only, PAS le vrai champion) lambdaH=${m2Real.lambdaH_m0} lambdaA=${m2Real.lambdaA_m0}`);
