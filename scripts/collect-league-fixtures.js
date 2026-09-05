#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 (2026-09-06). Version GENERALISEE de
// scripts/collect_gate_b1_premier_league.js - identique bit pour bit
// dans sa logique (pagination reelle jamais supposee, cache immuable
// via lib/data/cache.js#writeSnapshot, normalisation via
// lib/data/fixtures-normalizer.js#normalizeFixturesBatch - AUCUNE des
// deux n'est modifiee, deja generiques) - la SEULE difference est que
// league_id/seasons/chemin de sortie viennent de
// config/league-expansion.json au lieu d'etre des constantes en dur.
//
// Usage : node scripts/collect-league-fixtures.js --league-key=laliga [--seasons=2021,2022,2023,2024]

require("./load-env.js");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { writeSnapshot } = require("../lib/data/cache.js");
const { normalizeFixturesBatch } = require("../lib/data/fixtures-normalizer.js");
const { buildQualityReport } = require("../lib/data/quality-checks.js");

const API_BASE = "https://v3.football.api-sports.io";
const KEY = process.env.APISPORTS_KEY;

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  }
  return args;
}

function loadLeagueConfig(leagueKey) {
  const configPath = path.join(__dirname, "..", "config", "league-expansion.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const entry = config.leagues.find((l) => l.key === leagueKey);
  if (!entry) throw new Error(`Ligue "${leagueKey}" absente de config/league-expansion.json - ne jamais deviner un league_id, l'ajouter explicitement d'abord.`);
  return entry;
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "x-apisports-key": KEY } }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try { resolve({ httpStatus: res.statusCode, body: JSON.parse(data) }); }
        catch (e) { reject(new Error("reponse non-JSON (status " + res.statusCode + "): " + data.slice(0, 300))); }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
  });
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function collectSeason(leagueId, season) {
  let page = 1, pagingTotal = 1, apiCalls = 0;
  const allRaw = [];
  const seenIds = new Set();
  const duplicateIds = [];
  const firstPageInfo = {};

  do {
    const url = page === 1
      ? `${API_BASE}/fixtures?league=${leagueId}&season=${season}`
      : `${API_BASE}/fixtures?league=${leagueId}&season=${season}&page=${page}`;
    const { body } = await get(url);
    apiCalls++;
    if (body.errors && Object.keys(body.errors).length) throw new Error(`API errors pour league=${leagueId} saison ${season} page ${page}: ${JSON.stringify(body.errors)}`);
    const retrievedAt = new Date().toISOString();
    const snap = writeSnapshot("api-football", "fixtures", { league: leagueId, season, page }, {
      body, httpStatus: 200, pagingCurrent: body.paging && body.paging.current, pagingTotal: body.paging && body.paging.total, retrievedAt,
    });
    if (page === 1) { firstPageInfo.n_fixtures_first_page = (body.response || []).length; firstPageInfo.paging_total = body.paging && body.paging.total; }
    for (const raw of body.response || []) {
      const fid = raw.fixture && raw.fixture.id;
      if (fid != null) { if (seenIds.has(fid)) duplicateIds.push(fid); seenIds.add(fid); }
      allRaw.push(raw);
    }
    pagingTotal = (body.paging && body.paging.total) || 1;
    console.log(`  saison ${season} page ${page}/${pagingTotal} : ${(body.response || []).length} fixtures (cache: ${snap.created ? "nouveau" : "deja present, " + snap.reason})`);
    page++;
    if (page <= pagingTotal) await sleep(150);
  } while (page <= pagingTotal);

  return { season, apiCalls, pages: pagingTotal, allRaw, duplicateIds, firstPageInfo, fixturesReturned: allRaw.length };
}

async function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/collect-league-fixtures.js --league-key=<key> [--seasons=2021,2022,2023,2024]"); process.exit(1); }
  if (!KEY) { console.error("APISPORTS_KEY absente."); process.exit(1); }

  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const seasons = args.seasons ? args.seasons.split(",").map(Number) : [sp.warmup, sp.train, sp.oos_dev, sp.oos_final];
  console.log(`=== Collecte fixtures ${league.displayName} (league_id=${league.apiFootballId}, calendarType=${league.calendarType}) seasons=${JSON.stringify(seasons)} ===`);

  const outDir = path.join(__dirname, "..", "data", "gate-b1");
  fs.mkdirSync(outDir, { recursive: true });

  const seasonReports = [];
  for (const season of seasons) {
    console.log(`\n--- Saison ${season} ---`);
    seasonReports.push(await collectSeason(league.apiFootballId, season));
    await sleep(200);
  }

  const allNormalized = [];
  const normalizationReports = [];
  for (const r of seasonReports) {
    const { fixtures, skipped } = normalizeFixturesBatch(r.allRaw, { leagueId: league.apiFootballId, season: r.season, retrievedAt: new Date().toISOString() });
    allNormalized.push(...fixtures);
    const quality = buildQualityReport(fixtures, league.apiFootballId, r.season);
    normalizationReports.push({ season: r.season, raw_fixtures_from_api: r.allRaw.length, normalized_fixtures: fixtures.length, skipped_by_normalizer: skipped, quality });
    fs.writeFileSync(path.join(outDir, `${leagueKey}-${r.season}.json`), JSON.stringify(fixtures, null, 1));
  }
  fs.writeFileSync(path.join(outDir, `${leagueKey}-all-seasons.json`), JSON.stringify(allNormalized, null, 1));

  const fullReport = {
    league_key: leagueKey, league_id: league.apiFootballId, seasons, collected_at: new Date().toISOString(),
    per_season: seasonReports.map((r) => ({ season: r.season, pages: r.pages, api_calls: r.apiCalls, fixtures_returned: r.fixturesReturned, duplicate_ids_across_pages: r.duplicateIds, first_page_fixtures: r.firstPageInfo.n_fixtures_first_page, paging_total: r.firstPageInfo.paging_total })),
    normalization: normalizationReports,
    total_api_calls: seasonReports.reduce((s, r) => s + r.apiCalls, 0),
    total_fixtures_raw: seasonReports.reduce((s, r) => s + r.fixturesReturned, 0),
    total_fixtures_normalized: allNormalized.length,
  };
  fs.writeFileSync(path.join(outDir, `${leagueKey}_collection_report.json`), JSON.stringify(fullReport, null, 2));
  console.log("\n=== RAPPORT ===");
  console.log(JSON.stringify(fullReport, null, 2));
}

main().catch((e) => { console.error("ECHEC COLLECTE:", e.message); process.exit(1); });
