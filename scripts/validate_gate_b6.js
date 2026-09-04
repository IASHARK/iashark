#!/usr/bin/env node
"use strict";
// GATE B6 (SPEC LAB PRO v1.0) - compare, sur des donnees REELLES, la
// reconstruction point-in-time locale (lib/data/team-state.js) contre la
// verite terrain de l'API (/teams/statistics?date=X, qui calcule
// nativement les stats cumulees STRICTEMENT AVANT cette date pour la
// meme league+season). EXP-001 reste interdit tant que ce script ne
// rapporte pas 100% PASS sur les champs reellement consommes par
// calcCriteres/calcLambdas.

require("./load-env.js");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { buildTeamState, toCalcCriteresStats } = require("../lib/data/team-state.js");

const KEY = process.env.APISPORTS_KEY;
const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE_ID = 39;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "x-apisports-key": KEY } }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Cas de test : plusieurs equipes, plusieurs saisons, plusieurs moments
// de saison - cutoffs choisis a des dates SANS match ce jour-la (verifie
// au prealable) pour ne jamais ambiguer la convention de frontiere.
const CASES = [
  { season: 2022, team: 42, teamName: "Arsenal", cutoff: "2022-11-01" },
  { season: 2022, team: 50, teamName: "Manchester City", cutoff: "2022-11-01" },
  { season: 2022, team: 40, teamName: "Liverpool", cutoff: "2023-02-15" },
  { season: 2023, team: 49, teamName: "Chelsea", cutoff: "2023-12-01" },
  { season: 2023, team: 34, teamName: "Newcastle", cutoff: "2024-03-01" },
  { season: 2024, team: 42, teamName: "Arsenal", cutoff: "2024-12-01" },
  { season: 2024, team: 50, teamName: "Manchester City", cutoff: "2025-02-01" },
  { season: 2024, team: 40, teamName: "Liverpool", cutoff: "2025-04-01" },
];

async function main() {
  const rows = [];
  let allPass = true;
  let apiCalls = 0;

  for (const c of CASES) {
    const seasonFixturesPath = path.join(__dirname, "..", "data", "gate-b1", `premier-league-${c.season}.json`);
    const seasonFixtures = JSON.parse(fs.readFileSync(seasonFixturesPath, "utf8"));

    const url = `${API_BASE}/teams/statistics?league=${LEAGUE_ID}&season=${c.season}&team=${c.team}&date=${c.cutoff}`;
    const apiResp = await get(url);
    apiCalls++;
    if (apiResp.errors && Object.keys(apiResp.errors).length) {
      console.error(`API error pour ${c.teamName} ${c.season} ${c.cutoff}:`, apiResp.errors);
      continue;
    }
    const api = apiResp.response;

    const cutoffTimestamp = c.cutoff + "T00:00:00.000Z";
    const state = buildTeamState(seasonFixtures, c.team, cutoffTimestamp);
    const recon = toCalcCriteresStats(state);

    const apiFormConsumed = (api.form || "").slice(-5);
    const reconFormConsumed = (recon.form || "").slice(-5);

    const fields = [
      ["played.total", api.fixtures.played.total, recon.fixtures.played.total],
      ["played.home", api.fixtures.played.home, recon.fixtures.played.home],
      ["played.away", api.fixtures.played.away, recon.fixtures.played.away],
      ["wins.home", api.fixtures.wins.home, recon.fixtures.wins.home],
      ["wins.away", api.fixtures.wins.away, recon.fixtures.wins.away],
      ["goals.for.total (overall)", api.goals.for.total.total, recon.goals.for.total.total],
      ["goals.against.total (overall)", api.goals.against.total.total, recon.goals.against.total.total],
      ["goals.for.total.home", api.goals.for.total.home, state.goalsForHome],
      ["goals.against.total.home", api.goals.against.total.home, state.goalsAgainstHome],
      ["goals.for.total.away", api.goals.for.total.away, state.goalsForAway],
      ["goals.against.total.away", api.goals.against.total.away, state.goalsAgainstAway],
      ["form (5 derniers, consomme par calcCriteres)", apiFormConsumed, reconFormConsumed],
    ];

    for (const [field, apiVal, reconVal] of fields) {
      const isNumeric = typeof apiVal === "number";
      const delta = isNumeric ? (reconVal - apiVal) : (apiVal === reconVal ? 0 : "MISMATCH");
      const pass = isNumeric ? apiVal === reconVal : apiVal === reconVal;
      if (!pass) allPass = false;
      rows.push({
        team: c.teamName, season: c.season, cutoff: c.cutoff,
        field, api_value: apiVal, reconstructed_value: reconVal, delta, status: pass ? "PASS" : "FAIL",
      });
    }
    console.log(`  ${c.teamName} (${c.season}, cutoff=${c.cutoff}) : ${fields.filter(([,a,b])=>a===b).length}/${fields.length} champs identiques`);
    await sleep(200);
  }

  console.log("\n=== TABLEAU B6 (field | API | reconstruit | delta | statut) ===");
  for (const r of rows) {
    console.log(`${r.team} S${r.season} @${r.cutoff} | ${r.field} | API=${r.api_value} | recon=${r.reconstructed_value} | delta=${r.delta} | ${r.status}`);
  }

  const nFail = rows.filter((r) => r.status === "FAIL").length;
  console.log(`\nTotal lignes: ${rows.length}, PASS: ${rows.length - nFail}, FAIL: ${nFail}`);
  console.log(`API calls consommes pour B6: ${apiCalls}`);
  console.log(`B6_FIDELITY_PASSED = ${nFail === 0 ? "TRUE" : "FALSE"}`);

  fs.writeFileSync(path.join(__dirname, "..", "data", "gate-b1", "gate_b6_validation_report.json"), JSON.stringify({ rows, n_fail: nFail, n_total: rows.length, api_calls: apiCalls, b6_fidelity_passed: nFail === 0 }, null, 2));

  if (nFail > 0) process.exit(1);
}

main().catch((e) => { console.error("ECHEC B6:", e.message); process.exit(1); });
