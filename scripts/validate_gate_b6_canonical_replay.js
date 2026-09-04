#!/usr/bin/env node
"use strict";
// GATE B6 REDUX (audit 2026-09-05, item 8) - re-valide lib/data/production-replay.js
// #buildProductionStateAtCutoff contre l'API reelle, avec un accent
// specifique sur des cutoffs TRES PRECOCES (2e/3e match de la saison,
// la ou le CHAMPION_REPLAY_MISMATCH avait un effet), pas seulement les
// cutoffs mi-saison deja testes par le premier B6.

require("./load-env.js");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { buildProductionStateAtCutoff } = require("../lib/data/production-replay.js");

const KEY = process.env.APISPORTS_KEY;
const API_BASE = "https://v3.football.api-sports.io";
const LEAGUE_ID = 39;

function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "x-apisports-key": KEY } }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `premier-league-${s}.json`), "utf8")); }
const f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);
const ALL_FIXTURES = [...f2022, ...f2023, ...f2024];

// Cas volontairement CENTRES sur les cutoffs TRES precoces (2e/3e match)
// - le regime ou le bug affectait le plus, jamais teste par le premier B6.
// Arsenal 2023-24 : matchs le 08-12/08-21/08-26/09-03 - cutoffs choisis
// STRICTEMENT entre deux matchs (jamais un jour de match, pour eviter
// toute ambiguite de frontiere - meme precaution que le premier B6).
const CASES = [
  { season: 2023, team: 42, teamName: "Arsenal", cutoffDate: "2023-08-16" }, // entre match #1 (08-12) et #2 (08-21) -> played attendu 1
  { season: 2023, team: 42, teamName: "Arsenal", cutoffDate: "2023-08-24" }, // entre match #2 (08-21) et #3 (08-26) -> played attendu 2
  { season: 2023, team: 50, teamName: "Manchester City", cutoffDate: "2023-08-15" }, // entre #1 (08-11) et #2 (08-19) -> played attendu 1
  { season: 2023, team: 40, teamName: "Liverpool", cutoffDate: "2023-08-20" },
  { season: 2024, team: 42, teamName: "Arsenal", cutoffDate: "2024-08-20" }, // entre #1 (08-17) et #2 (08-24) -> played attendu 1
  { season: 2024, team: 50, teamName: "Manchester City", cutoffDate: "2024-08-27" }, // entre #2 (08-24) et #3 (08-31) -> played attendu 2
];

async function main() {
  const rows = [];
  let allPass = true;
  let apiCalls = 0;

  for (const c of CASES) {
    const cutoff = c.cutoffDate + "T00:00:00.000Z";
    const url = `${API_BASE}/teams/statistics?league=${LEAGUE_ID}&season=${c.season}&team=${c.team}&date=${c.cutoffDate}`;
    const apiResp = await get(url);
    apiCalls++;
    if (apiResp.errors && Object.keys(apiResp.errors).length) { console.error(`API error ${c.teamName}:`, apiResp.errors); continue; }
    const api = apiResp.response;

    const state = buildProductionStateAtCutoff({ allFixtures: ALL_FIXTURES, season: c.season, teamId: c.team, cutoff });

    const fields = [
      ["played.total", api.fixtures.played.total, state.playedTotal],
      ["played.home", api.fixtures.played.home, state.playedHome],
      ["played.away", api.fixtures.played.away, state.playedAway],
      ["goals.for.total (overall)", api.goals.for.total.total, state.goalsForTotal],
      ["goals.against.total (overall)", api.goals.against.total.total, state.goalsAgainstTotal],
    ];
    for (const [field, apiVal, replayVal] of fields) {
      const pass = apiVal === replayVal;
      if (!pass) allPass = false;
      rows.push({ team: c.teamName, season: c.season, cutoff: c.cutoffDate, field, api_value: apiVal, replay_value: replayVal, status: pass ? "PASS" : "FAIL" });
    }
    console.log(`  ${c.teamName} (${c.season}, cutoff=${c.cutoffDate}) : replay played.total=${state.playedTotal} vs API=${api.fixtures.played.total} -> ${state.playedTotal === api.fixtures.played.total ? "PASS" : "FAIL"}`);
    await sleep(200);
  }

  const nFail = rows.filter((r) => r.status === "FAIL").length;
  console.log(`\nTotal lignes: ${rows.length}, PASS: ${rows.length - nFail}, FAIL: ${nFail}`);
  console.log(`API calls consommes: ${apiCalls}`);
  console.log(`B6_CANONICAL_REPLAY_PASSED = ${nFail === 0 ? "TRUE" : "FALSE"}`);

  fs.writeFileSync(path.join(__dirname, "..", "data", "gate-b1", "gate_b6_canonical_replay_report.json"), JSON.stringify({ rows, n_fail: nFail, n_total: rows.length, api_calls: apiCalls, b6_canonical_replay_passed: nFail === 0 }, null, 2));
  if (nFail > 0) process.exit(1);
}
main().catch((e) => { console.error("ECHEC:", e.message); process.exit(1); });
