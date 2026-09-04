#!/usr/bin/env node
"use strict";
// GATE B1 (SPEC LAB PRO v1.0) - collecte REELLE des fixtures Premier
// League (league_id=39) pour les 4 saisons cibles d'EXP-001. Aucune
// pagination supposee - pagine reellement selon paging.total renvoye par
// l'API a chaque appel. Cache immuable (lib/data/cache.js), jamais
// d'overwrite. N'appelle AUCUNE cote historique (hors perimetre B1).

require("./load-env.js");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { writeSnapshot, RAW_API_ROOT } = require("../lib/data/cache.js");
const { normalizeFixturesBatch } = require("../lib/data/fixtures-normalizer.js");
const { buildQualityReport } = require("../lib/data/quality-checks.js");

const LEAGUE_ID = 39;
const SEASONS = [2022, 2023, 2024, 2025]; // 2022-23, 2023-24, 2024-25, 2025-26 (identifiants API-Football confirmes via /leagues?id=39)
const API_BASE = "https://v3.football.api-sports.io";
const KEY = process.env.APISPORTS_KEY;

if (!KEY) {
  console.error("APISPORTS_KEY absente de l'environnement/.env - impossible de collecter.");
  process.exit(1);
}

function get(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "x-apisports-key": KEY } }, (res) => {
      let data = "";
      res.on("data", (c) => { data += c; });
      res.on("end", () => {
        try {
          resolve({ httpStatus: res.statusCode, headers: res.headers, body: JSON.parse(data) });
        } catch (e) {
          reject(new Error("reponse non-JSON (status " + res.statusCode + "): " + data.slice(0, 300)));
        }
      });
    });
    req.on("error", reject);
    req.setTimeout(20000, () => req.destroy(new Error("timeout")));
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function collectSeason(season) {
  let page = 1;
  let pagingTotal = 1;
  let apiCalls = 0;
  const allRaw = [];
  const seenIds = new Set();
  const duplicateIds = [];
  const firstPageInfo = {};

  do {
    // L'API rejette explicitement &page=1 ("The Page field do not exist")
    // sur cet endpoint - le parametre page n'est accepte que lorsqu'il y a
    // reellement plus d'une page (paging.total>1, confirme par la
    // premiere reponse). Jamais suppose a l'avance.
    const url = page === 1
      ? `${API_BASE}/fixtures?league=${LEAGUE_ID}&season=${season}`
      : `${API_BASE}/fixtures?league=${LEAGUE_ID}&season=${season}&page=${page}`;
    const { httpStatus, body } = await get(url);
    apiCalls++;
    if (body.errors && Object.keys(body.errors).length) {
      throw new Error(`API errors pour saison ${season} page ${page}: ${JSON.stringify(body.errors)}`);
    }
    const retrievedAt = new Date().toISOString();
    const snap = writeSnapshot("api-football", "fixtures", { league: LEAGUE_ID, season, page }, {
      body, httpStatus, pagingCurrent: body.paging && body.paging.current, pagingTotal: body.paging && body.paging.total, retrievedAt,
    });

    if (page === 1) {
      firstPageInfo.n_fixtures_first_page = (body.response || []).length;
      firstPageInfo.paging_total = body.paging && body.paging.total;
    }

    for (const raw of body.response || []) {
      const fid = raw.fixture && raw.fixture.id;
      if (fid != null) {
        if (seenIds.has(fid)) duplicateIds.push(fid);
        seenIds.add(fid);
      }
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
  const seasonReports = [];
  const outDir = path.join(__dirname, "..", "data", "gate-b1");
  fs.mkdirSync(outDir, { recursive: true });

  for (const season of SEASONS) {
    console.log(`\n=== Collecte saison ${season} (Premier League) ===`);
    const result = await collectSeason(season);
    seasonReports.push(result);
    await sleep(200);
  }

  // Normalisation + qualite, saison par saison, puis fichier combine.
  const allNormalized = [];
  const normalizationReports = [];
  for (const r of seasonReports) {
    const { fixtures, skipped } = normalizeFixturesBatch(r.allRaw, { leagueId: LEAGUE_ID, season: r.season, retrievedAt: new Date().toISOString() });
    allNormalized.push(...fixtures);

    const quality = buildQualityReport(fixtures, LEAGUE_ID, r.season);
    const statusBreakdown = { FT: 0, AET: 0, PEN: 0, PST: 0, CANC: 0, ABD: 0, OTHER_PENDING: 0 };
    for (const f of fixtures) {
      if (statusBreakdown[f.status_short] !== undefined) statusBreakdown[f.status_short]++;
      else if (f.status === "PENDING") statusBreakdown.OTHER_PENDING++;
    }
    normalizationReports.push({
      season: r.season,
      raw_fixtures_from_api: r.allRaw.length,
      normalized_fixtures: fixtures.length,
      skipped_by_normalizer: skipped,
      quality,
      status_breakdown: statusBreakdown,
    });

    fs.writeFileSync(path.join(outDir, `premier-league-${r.season}.json`), JSON.stringify(fixtures, null, 1));
  }

  fs.writeFileSync(path.join(outDir, "premier-league-all-seasons.json"), JSON.stringify(allNormalized, null, 1));

  const fullReport = {
    league_id: LEAGUE_ID,
    seasons: SEASONS,
    collected_at: new Date().toISOString(),
    per_season: seasonReports.map((r) => ({
      season: r.season,
      pages: r.pages,
      api_calls: r.apiCalls,
      fixtures_returned: r.fixturesReturned,
      duplicate_ids_across_pages: r.duplicateIds,
      first_page_fixtures: r.firstPageInfo.n_fixtures_first_page,
      paging_total: r.firstPageInfo.paging_total,
    })),
    normalization: normalizationReports,
    total_api_calls: seasonReports.reduce((s, r) => s + r.apiCalls, 0),
    total_fixtures_raw: seasonReports.reduce((s, r) => s + r.fixturesReturned, 0),
    total_fixtures_normalized: allNormalized.length,
  };
  fs.writeFileSync(path.join(outDir, "gate_b1_collection_report.json"), JSON.stringify(fullReport, null, 2));
  console.log("\n=== RAPPORT ===");
  console.log(JSON.stringify(fullReport, null, 2));
}

main().catch((e) => { console.error("ECHEC COLLECTE:", e.message); process.exit(1); });
