#!/usr/bin/env node
"use strict";
// Near-kickoff collector (Market Lab Phase 3A, item 6) - cadence
// horaire. Cible UNIQUEMENT les fixtures DEJA suivies (deja presentes
// dans forward_odds_timeline via le collecteur broad) dont le coup
// d'envoi tombe dans les 6 prochaines heures - AUCUN nouvel appel
// /fixtures de decouverte, reutilise la liste deja construite. Meme
// discipline budget/rate-limit/pas-de-retry-infini que
// scripts/save-odds-snapshot.js.
require("./load-env.js");
const https = require("https");
const { buildBookmakerOffers } = require("../lib/market-lab/odds-ingest.js");
const { buildForwardOddsRow, hashRawPayload } = require("../lib/market-lab/forward-odds-dataset.js");
const { computeSnapshotPhase, isRateLimitOrQuotaError } = require("./save-odds-snapshot.js");

const MAX_API_CALLS_PER_RUN = 50;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function get(hostname, urlPath, headers) {
  return new Promise((resolve) => {
    https.get({ hostname, path: urlPath, headers: headers || {} }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (e) { resolve({}); } });
    }).on("error", () => resolve({}));
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

async function main() {
  const apsKey = process.env.APISPORTS_KEY;
  const supaUrl = process.env.SUPABASE_URL, supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!apsKey || !supaUrl || !supaKey) {
    console.error("APISPORTS_KEY/SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY requis - rien fait.");
    process.exitCode = 1;
    return;
  }
  const u = new URL(supaUrl);
  const headers = { apikey: supaKey, Authorization: `Bearer ${supaKey}` };

  const nowIso = new Date().toISOString();
  const sixHoursLaterIso = new Date(Date.now() + 6 * 3600000).toISOString();
  const rows = await get(u.hostname, `/rest/v1/forward_odds_timeline?select=fixture_id,league_id,kickoff&kickoff=gte.${nowIso}&kickoff=lte.${sixHoursLaterIso}&order=fixture_id.asc`, headers);
  const distinctFixtures = [...new Map((Array.isArray(rows) ? rows : []).map((r) => [r.fixture_id, r])).values()];
  console.log(`fixtures deja suivies avec coup d'envoi dans les 6h : ${distinctFixtures.length}`);
  if (!distinctFixtures.length) { console.log("rien a rafraichir sur ce run."); return; }

  let apiCallCount = 0;
  const forwardRows = [];
  for (const fx of distinctFixtures) {
    if (apiCallCount >= MAX_API_CALLS_PER_RUN) { console.log(`Budget d'appels API atteint (${MAX_API_CALLS_PER_RUN}) - arret propre, pas de retry.`); break; }
    const oddsResp = await get("v3.football.api-sports.io", `/odds?fixture=${fx.fixture_id}`, { "x-apisports-key": apsKey });
    apiCallCount++;
    if (isRateLimitOrQuotaError(oddsResp)) { console.log(`Rate-limit/quota signale (fixture ${fx.fixture_id}) : ${JSON.stringify(oddsResp.errors)} - arret immediat, pas de retry.`); break; }
    const raw = oddsResp && oddsResp.response && oddsResp.response[0];
    await sleep(300);
    if (!raw) { console.log(`  fixture ${fx.fixture_id} : pas de cote publiee.`); continue; }

    const phase = computeSnapshotPhase(fx.kickoff);
    const collectedAt = new Date().toISOString();
    const rawPayloadHash = hashRawPayload(raw);
    const { valid } = buildBookmakerOffers(raw, { fixtureId: fx.fixture_id, retrievedAt: collectedAt, kickoff: fx.kickoff });
    for (const offer of valid) {
      forwardRows.push(buildForwardOddsRow({
        fixtureId: fx.fixture_id, leagueId: fx.league_id, kickoff: fx.kickoff, snapshotPhase: phase,
        collectedAt, bookmakerId: offer.bookmaker_id, bookmakerName: offer.bookmaker_name,
        canonicalMarketId: offer.canonical_market_id, selection: offer.selection, decimalOdds: offer.decimal_odds,
        rawPayloadHash,
      }));
    }
    console.log(`  fixture ${fx.fixture_id} : phase ${phase}, ${valid.length} offre(s) canonique(s).`);
  }

  console.log(`Appels API-Football utilises ce run : ${apiCallCount}/${MAX_API_CALLS_PER_RUN}`);
  if (!forwardRows.length) { console.log("Aucune offre a inserer sur ce run."); return; }

  const r = await postJSON(u.hostname, "/rest/v1/forward_odds_timeline?on_conflict=fixture_id,snapshot_phase,bookmaker_id,canonical_market_id,selection", forwardRows, Object.assign({ Prefer: "resolution=ignore-duplicates,return=minimal" }, headers));
  if (!r.ok) console.log(`Echec insert : status=${r.status} ${(r.error || r.body || "").toString().slice(0, 300)}`);
  else console.log(`${forwardRows.length} offre(s) envoyee(s) (idempotent - doublons ignores par la base).`);
}

if (require.main === module) {
  main().catch((e) => { console.error("FATAL:", e.message); process.exitCode = 1; });
}

module.exports = { MAX_API_CALLS_PER_RUN };
