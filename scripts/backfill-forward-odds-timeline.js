#!/usr/bin/env node
"use strict";
// Backfill IDEMPOTENT de forward_odds_timeline depuis odds_snapshots
// deja stockes - AUCUN nouvel appel API-Football, rejoue uniquement des
// payloads raw_odds deja persistes (Market Lab Phase 3A, items 2 et 12 :
// ne jamais gaspiller l'API pour reconstruire un etat deja disponible).
// Meme pattern https brut que scripts/save-odds-snapshot.js - 0
// dependance npm tierce.
//
// Usage : SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
//         node scripts/backfill-forward-odds-timeline.js
//
// Idempotence : chaque ligne est inseree avec
// Prefer: resolution=ignore-duplicates + on_conflict sur la contrainte
// unique (fixture_id, snapshot_phase, bookmaker_id, canonical_market_id,
// selection) - rejouer ce script plusieurs fois ne duplique jamais une
// ligne deja ecrite (verifie par tests/market-lab-backfill.test.js sur
// la logique de transformation, et par un test manuel deux-executions
// lors de la mise en service).
require("./load-env.js");
const https = require("https");
const { buildBookmakerOffers } = require("../lib/market-lab/odds-ingest.js");
const { buildForwardOddsRow, hashRawPayload } = require("../lib/market-lab/forward-odds-dataset.js");

function get(hostname, urlPath, headers) {
  return new Promise((resolve, reject) => {
    https.get({ hostname, path: urlPath, headers }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error(`Reponse non-JSON (HTTP ${res.statusCode}): ${body.slice(0, 200)}`)); }
      });
    }).on("error", reject);
  });
}

function postJSON(hostname, urlPath, body, headers) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname, path: urlPath, method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }, headers || {}),
    }, (res) => {
      let d = "";
      res.on("data", (c) => { d += c; });
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: d }));
    });
    req.on("error", (e) => resolve({ ok: false, status: 0, error: e.message }));
    req.write(data); req.end();
  });
}

// Transforme UNE ligne odds_snapshots (raw_odds complet, deja stocke)
// en lignes forward_odds_timeline canoniques - reutilise
// buildBookmakerOffers tel quel, jamais une deuxieme extraction.
function transformSnapshotRow(row) {
  const rawPayloadHash = hashRawPayload(row.raw_odds);
  const kickoff = row.raw_odds && row.raw_odds.fixture ? row.raw_odds.fixture.date : null;
  const { valid } = buildBookmakerOffers(row.raw_odds, { fixtureId: row.fixture_id, retrievedAt: row.captured_at, kickoff });
  return valid.map((offer) => buildForwardOddsRow({
    fixtureId: row.fixture_id,
    leagueId: row.league_id,
    kickoff,
    snapshotPhase: row.snapshot_phase,
    collectedAt: row.captured_at,
    bookmakerId: offer.bookmaker_id,
    bookmakerName: offer.bookmaker_name,
    canonicalMarketId: offer.canonical_market_id,
    selection: offer.selection,
    decimalOdds: offer.decimal_odds,
    rawPayloadHash,
  }));
}

async function main() {
  const supaUrl = process.env.SUPABASE_URL, supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supaUrl || !supaKey) {
    console.error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY requis (lecture ET ecriture reelles necessaires) - rien fait.");
    process.exitCode = 1;
    return;
  }
  const u = new URL(supaUrl);
  const headers = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  let offset = 0;
  const pageSize = 20;
  // item 5 : rapport explicite inserted/skipped/errors - jamais un
  // simple "termine" opaque. return=representation (pas minimal) pour
  // pouvoir compter reellement les lignes inserees vs ignorees par
  // ON CONFLICT DO NOTHING (skipped = envoyees - effectivement inserees).
  let totalSnapshots = 0, totalAttempted = 0, totalInserted = 0, totalSkipped = 0, totalErrors = 0;
  for (;;) {
    const page = await get(u.hostname, `/rest/v1/odds_snapshots?select=fixture_id,league_id,snapshot_phase,captured_at,raw_odds&order=id.asc&limit=${pageSize}&offset=${offset}`, headers);
    if (!Array.isArray(page) || !page.length) break;
    let batch = [];
    for (const row of page) {
      totalSnapshots++;
      batch = batch.concat(transformSnapshotRow(row));
    }
    if (batch.length) {
      totalAttempted += batch.length;
      const r = await postJSON(u.hostname, "/rest/v1/forward_odds_timeline?on_conflict=fixture_id,snapshot_phase,bookmaker_id,canonical_market_id,selection", batch, Object.assign({ Prefer: "resolution=ignore-duplicates,return=representation" }, headers));
      if (!r.ok) {
        totalErrors += batch.length;
        console.error(`  echec insert offset=${offset}: status=${r.status} ${(r.error || r.body || "").toString().slice(0, 300)}`);
      } else {
        let inserted = 0;
        try { inserted = JSON.parse(r.body).length; } catch (e) { inserted = 0; }
        totalInserted += inserted;
        totalSkipped += batch.length - inserted;
      }
    }
    console.log(`page offset=${offset}: ${page.length} snapshot(s), ${batch.length} offre(s) canoniques transformees`);
    offset += pageSize;
  }
  console.log(`Backfill termine : ${totalSnapshots} snapshot(s) source, ${totalAttempted} offre(s) tentees.`);
  console.log(`  inserted=${totalInserted} skipped(doublons deja presents)=${totalSkipped} errors=${totalErrors}`);
}

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", e.message); process.exitCode = 1; });
}

module.exports = { transformSnapshotRow };
