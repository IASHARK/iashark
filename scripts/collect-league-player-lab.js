#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 (2026-09-06). Version GENERALISEE de
// scripts/collect-player-lab-pilot.js - IDENTIQUE dans sa logique
// (idempotent via isCached, jamais de retry sur rate-limit/quota,
// budget dur par run, meme cache lib/player-lab/raw-cache.js - deja
// generique : cle uniquement (endpoint, fixture_id), fixture_id etant
// un identifiant API-Football GLOBALEMENT unique, aucun risque de
// collision entre ligues). Seule difference : league-key + chemin des
// fixtures connues viennent de --league-key au lieu d'etre en dur.
//
// Usage : node scripts/collect-league-player-lab.js --league-key=laliga --seasons=2021,2022,2023,2024

require("./load-env.js");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { isCached, writeCached } = require("../lib/player-lab/raw-cache.js");

const ENDPOINTS = ["lineups", "players", "events"];
const MAX_API_CALLS_PER_RUN = 6000;

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function get(urlPath, headers) {
  return new Promise((resolve) => {
    https.get({ hostname: "v3.football.api-sports.io", path: urlPath, headers }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({ parseError: e.message }); } });
    }).on("error", (e) => resolve({ error: e.message }));
  });
}

function isRateLimitOrQuotaError(resp) {
  if (!resp || !resp.errors) return false;
  const keys = Object.keys(resp.errors);
  if (!keys.length) return false;
  return keys.some((k) => /rate|limit|quota|subscription|plan/i.test(k) || /rate|limit|quota|subscription|plan/i.test(String(resp.errors[k])));
}

const ENDPOINT_PATH = {
  lineups: (fx) => `/fixtures/lineups?fixture=${fx}`,
  players: (fx) => `/fixtures/players?fixture=${fx}`,
  events: (fx) => `/fixtures/events?fixture=${fx}`,
};

async function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/collect-league-player-lab.js --league-key=<key> --seasons=2021,2022,2023,2024"); process.exitCode = 1; return; }
  const apsKey = process.env.APISPORTS_KEY;
  if (!apsKey) { console.error("APISPORTS_KEY absent."); process.exitCode = 1; return; }
  const headers = { "x-apisports-key": apsKey };
  const seasons = (args.seasons || "").split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
  if (!seasons.length) { console.error("--seasons=... requis (ex: 2021,2022,2023,2024)."); process.exitCode = 1; return; }

  let apiCallCount = 0, cacheHits = 0, newFetches = 0, stopped = false;

  for (const season of seasons) {
    if (stopped) break;
    const fixturesPath = path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`);
    const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
    console.log(`Saison ${season} (${leagueKey}) : ${fixtures.length} fixtures connues (0 appel /fixtures necessaire).`);

    for (const fx of fixtures) {
      if (stopped) break;
      for (const endpoint of ENDPOINTS) {
        if (isCached(endpoint, fx.fixture_id)) { cacheHits++; continue; }
        if (apiCallCount >= MAX_API_CALLS_PER_RUN) { console.log(`Budget d'appels atteint (${MAX_API_CALLS_PER_RUN}) - arret propre, pas de retry.`); stopped = true; break; }
        const resp = await get(ENDPOINT_PATH[endpoint](fx.fixture_id), headers);
        apiCallCount++;
        if (isRateLimitOrQuotaError(resp)) { console.log(`Rate-limit/quota signale (${endpoint}, fixture ${fx.fixture_id}) : ${JSON.stringify(resp.errors)} - arret immediat, pas de retry.`); stopped = true; break; }
        writeCached({ endpoint, fixtureId: fx.fixture_id, apiSeason: season, rawPayload: resp });
        newFetches++;
        if (newFetches % 100 === 0) console.log(`  progres: ${newFetches} nouvelles reponses, ${apiCallCount} appels utilises...`);
        await sleep(250);
      }
    }
  }

  console.log(`Termine${stopped ? " (arret anticipe)" : ""} : ${newFetches} nouvelles reponses collectees, ${cacheHits} deja en cache (evitees), ${apiCallCount} appels API reellement utilises ce run.`);
}

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", e.message); process.exitCode = 1; });
}

module.exports = { ENDPOINTS, isRateLimitOrQuotaError };
