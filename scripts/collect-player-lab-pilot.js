#!/usr/bin/env node
"use strict";
// PLAYER LAB - PILOT (2026-09-05), items 3-4. Collecte les 3 sources
// CRITIQUES (lineups, fixture-players, events) pour les 380 fixtures
// de Premier League 2024-25 (season=2024) - AUCUN appel /players ni
// /injuries en masse a ce stade (items 3 et 15 : leur cout et leur
// couverture ne sont pas encore justifies). Fixtures deja connues
// depuis data/gate-b1/premier-league-2024.json - 0 appel /fixtures
// necessaire pour la decouverte. Idempotent et resumable : une fixture
// deja cachee pour un endpoint donne n'est jamais rappelee (isCached).
// Meme discipline budget/rate-limit/pas-de-retry-infini que
// scripts/save-odds-snapshot.js.

require("./load-env.js");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { isCached, writeCached } = require("../lib/player-lab/raw-cache.js");

const SEASON = 2024;
const LEAGUE_ID = 39;
const ENDPOINTS = ["lineups", "players", "events"];
const MAX_API_CALLS_PER_RUN = 1200; // budget dur (pilot attendu ~1140)

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
  const apsKey = process.env.APISPORTS_KEY;
  if (!apsKey) { console.error("APISPORTS_KEY absent."); process.exitCode = 1; return; }
  const headers = { "x-apisports-key": apsKey };

  const fixturesPath = path.join(__dirname, "..", "data", "gate-b1", "premier-league-2024.json");
  const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
  console.log(`Pilot Premier League 2024-25 : ${fixtures.length} fixtures connues (0 appel /fixtures necessaire).`);

  let apiCallCount = 0, cacheHits = 0, newFetches = 0, stopped = false;

  for (const fx of fixtures) {
    if (stopped) break;
    for (const endpoint of ENDPOINTS) {
      if (isCached(endpoint, fx.fixture_id)) { cacheHits++; continue; }
      if (apiCallCount >= MAX_API_CALLS_PER_RUN) { console.log(`Budget d'appels atteint (${MAX_API_CALLS_PER_RUN}) - arret propre, pas de retry.`); stopped = true; break; }
      const resp = await get(ENDPOINT_PATH[endpoint](fx.fixture_id), headers);
      apiCallCount++;
      if (isRateLimitOrQuotaError(resp)) { console.log(`Rate-limit/quota signale (${endpoint}, fixture ${fx.fixture_id}) : ${JSON.stringify(resp.errors)} - arret immediat, pas de retry.`); stopped = true; break; }
      writeCached({ endpoint, fixtureId: fx.fixture_id, apiSeason: SEASON, rawPayload: resp });
      newFetches++;
      if (newFetches % 50 === 0) console.log(`  progres: ${newFetches} nouvelles reponses, ${apiCallCount} appels utilises...`);
      await sleep(250);
    }
  }

  console.log(`Termine${stopped ? " (arret anticipe)" : ""} : ${newFetches} nouvelles reponses collectees, ${cacheHits} deja en cache (evitees), ${apiCallCount} appels API reellement utilises ce run.`);
}

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", e.message); process.exitCode = 1; });
}

module.exports = { ENDPOINTS, SEASON, LEAGUE_ID, isRateLimitOrQuotaError };
