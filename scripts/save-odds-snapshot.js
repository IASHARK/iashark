#!/usr/bin/env node
"use strict";
// Sauvegarde nos PROPRES snapshots de cotes reelles (table Supabase
// odds_snapshots, migration create_odds_snapshots_table du 2026-08-30) car
// l'historique natif d'API-Football est limite dans le temps - demarre sur
// instruction explicite de l'utilisateur. Append-only : chaque run ajoute de
// nouvelles lignes (jamais d'update en place) pour pouvoir reconstituer le
// mouvement de cote (closing line) plus tard, ce que l'API elle-meme ne
// permet pas de retrouver a posteriori.
//
// Usage : APISPORTS_KEY=xxx SUPABASE_URL=xxx SUPABASE_SERVICE_ROLE_KEY=xxx \
//         node scripts/save-odds-snapshot.js [--fixtures-per-league=3]
//
// Sans SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY, le script recupere quand meme
// les cotes reelles mais les ecrit dans un fichier JSON local plutot que de
// pretendre les avoir persistees en base (jamais de "success" fabrique).
const fs = require("fs");
const https = require("https");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LEAGUES_CONFIG = require(path.join(ROOT, "config/leagues.json"));
let COVERAGE_REPORT = null;
try { COVERAGE_REPORT = JSON.parse(fs.readFileSync(path.join(ROOT, "league-coverage-report.json"), "utf8")); } catch (e) { /* repli sur SEASON_FALLBACK */ }
const SEASON_FALLBACK = 2026;

function seasonFor(apiFootballId) {
  var entry = COVERAGE_REPORT && COVERAGE_REPORT.leagues && COVERAGE_REPORT.leagues.find(function (l) { return l.apiFootballId === apiFootballId; });
  return (entry && entry.status === "VERIFIED" && entry.resolvedSeason) || SEASON_FALLBACK;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function get(url, headers) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: headers || {} }, function (res) {
      var body = "";
      res.on("data", function (c) { body += c; });
      res.on("end", function () {
        try { resolve(JSON.parse(body)); } catch (e) { reject(new Error("Reponse non-JSON (HTTP " + res.statusCode + ")")); }
      });
    }).on("error", reject);
  });
}

// Cadence de collecte demandee explicitement : FIRST_SEEN / T72 / T24 / T6 /
// T90MIN / LINEUP / CLOSE. Deduit du temps reel jusqu'au coup d'envoi
// (jamais une phase fixee arbitrairement). LINEUP n'est jamais retournee ici
// (elle depend de la confirmation de composition, pas du seul horaire) - a
// declencher separement, au meme moment que computePlayerMarketsForFixture
// dans le pipeline (meme fixture, meme evenement declencheur : composition
// confirmee). CLOSE couvre a la fois juste avant le coup d'envoi et apres
// (cote de cloture toujours utile a capturer si le run arrive un peu tard).
function computeSnapshotPhase(kickoffISO, now) {
  now = now || new Date();
  var kickoff = new Date(kickoffISO);
  var hoursToKickoff = (kickoff.getTime() - now.getTime()) / 3600000;
  if (hoursToKickoff <= 1.5) return "CLOSE";
  if (hoursToKickoff <= 6) return "T6";
  if (hoursToKickoff <= 24) return "T24";
  if (hoursToKickoff <= 72) return "T72";
  return "FIRST_SEEN";
}

// Verifie les phases deja capturees pour une fixture (dedup reel, pas de
// nouvel appel/insert si la phase courante a deja ete sauvegardee pour cette
// fixture - "ne refais pas un appel... s'il peut etre partage", applique ici
// a l'ecriture elle-meme plutot qu'a la lecture API, qui elle doit de toute
// facon s'executer pour connaitre le fixture.date a jour).
function getExistingPhases(supaUrl, supaKey, fixtureId) {
  return new Promise(function (resolve) {
    var u = new URL(supaUrl);
    https.get({
      hostname: u.hostname,
      path: "/rest/v1/odds_snapshots?fixture_id=eq." + fixtureId + "&select=snapshot_phase",
      headers: { apikey: supaKey, Authorization: "Bearer " + supaKey },
    }, function (res) {
      var body = "";
      res.on("data", function (c) { body += c; });
      res.on("end", function () {
        try {
          var rows = JSON.parse(body);
          resolve(Array.isArray(rows) ? rows.map(function (r) { return r.snapshot_phase; }) : []);
        } catch (e) { resolve([]); } // repli silencieux : au pire une phase est recapturee, jamais un crash
      });
    }).on("error", function () { resolve([]); });
  });
}
// Meme pattern que upsertJSON dans .github/workflows/update-data.yml
// (writeSnapshots/writePremiumData) - https brut, 0 dependance npm tierce.
function postJSON(host, urlPath, body, headers) {
  return new Promise(function (resolve) {
    var data = JSON.stringify(body);
    var timer = setTimeout(function () { resolve({ ok: false, status: 0, error: "timeout" }); }, 15000);
    var req = https.request({
      hostname: host, path: urlPath, method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }, headers || {}),
    }, function (res) {
      var d = "";
      res.on("data", function (c) { d += c; });
      res.on("end", function () { clearTimeout(timer); resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body: d }); });
    });
    req.on("error", function (e) { clearTimeout(timer); resolve({ ok: false, status: 0, error: e.message }); });
    req.write(data); req.end();
  });
}

async function main() {
  var apsKey = process.env.APISPORTS_KEY;
  if (!apsKey) { console.error("APISPORTS_KEY absent : aucun snapshot ne sera collecte."); process.exitCode = 1; return; }
  var headers = { "x-apisports-key": apsKey };
  var fixturesPerLeague = 3;
  process.argv.forEach(function (a) {
    var m = /^--fixtures-per-league=(\d+)$/.exec(a);
    if (m) fixturesPerLeague = parseInt(m[1], 10);
  });

  var supaUrl = process.env.SUPABASE_URL;
  var supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  var canWriteSupabase = !!(supaUrl && supaKey);
  if (!canWriteSupabase) {
    console.log("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY absent(s) : les cotes seront quand meme recuperees reellement, mais ecrites dans un fichier local plutot qu'en base (voir odds-snapshots-local.json).");
  }

  var rows = [];
  var pipelineSha = process.env.GITHUB_SHA || null;

  for (var li = 0; li < LEAGUES_CONFIG.leagues.length; li++) {
    var league = LEAGUES_CONFIG.leagues[li];
    var season = seasonFor(league.apiFootballId);
    var fxResp = await get("https://v3.football.api-sports.io/fixtures?league=" + league.apiFootballId + "&season=" + season + "&next=" + fixturesPerLeague, headers);
    await sleep(300);
    var fixtures = (fxResp.response || []).slice(0, fixturesPerLeague);
    for (var fi = 0; fi < fixtures.length; fi++) {
      var fx = fixtures[fi];
      var phase = computeSnapshotPhase(fx.fixture.date);
      if (canWriteSupabase) {
        var already = await getExistingPhases(supaUrl, supaKey, fx.fixture.id);
        if (already.indexOf(phase) !== -1) {
          console.log(league.key + " " + fx.teams.home.name + " vs " + fx.teams.away.name + " : phase " + phase + " deja capturee pour cette fixture, appel odds/insert evite (cache reel).");
          continue;
        }
      }
      var oddsResp = await get("https://v3.football.api-sports.io/odds?fixture=" + fx.fixture.id, headers);
      await sleep(300);
      var oddsRows = oddsResp.response || [];
      if (!oddsRows.length) {
        console.log(league.key + " " + fx.teams.home.name + " vs " + fx.teams.away.name + " : pas de cote publiee, snapshot ignore (rien a capturer).");
        continue;
      }
      var bookmakerCount = (oddsRows[0].bookmakers || []).length;
      var marketIds = {};
      (oddsRows[0].bookmakers || []).forEach(function (bk) { (bk.bets || []).forEach(function (bet) { marketIds[bet.id] = true; }); });
      rows.push({
        fixture_id: fx.fixture.id,
        league_id: league.apiFootballId,
        league_key: league.key,
        snapshot_phase: phase,
        bookmaker_count: bookmakerCount,
        market_count: Object.keys(marketIds).length,
        raw_odds: oddsRows[0],
        source: canWriteSupabase ? "pipeline" : "manual_audit",
        pipeline_sha: pipelineSha,
      });
      console.log(league.key + " " + fx.teams.home.name + " vs " + fx.teams.away.name + " : snapshot capture, phase " + phase + " (" + bookmakerCount + " bookmakers, " + Object.keys(marketIds).length + " marches).");
    }
  }

  if (!rows.length) {
    console.log("Aucune fixture avec cote reelle trouvee sur cette passe - rien a sauvegarder.");
    return;
  }

  if (canWriteSupabase) {
    var u = new URL(supaUrl);
    var batchSize = 50;
    var written = 0;
    for (var i = 0; i < rows.length; i += batchSize) {
      var batch = rows.slice(i, i + batchSize);
      var r = await postJSON(u.hostname, "/rest/v1/odds_snapshots", batch, {
        apikey: supaKey,
        Authorization: "Bearer " + supaKey,
        Prefer: "return=minimal",
      });
      if (!r.ok) console.log("  echec insert batch " + i + " : status=" + r.status + " " + (r.error || r.body || "").toString().slice(0, 200));
      else written += batch.length;
      await sleep(100);
    }
    console.log(written + "/" + rows.length + " snapshot(s) ecrit(s) reellement dans Supabase (odds_snapshots).");
  } else {
    var outPath = path.join(ROOT, "odds-snapshots-local.json");
    var existing = [];
    try { existing = JSON.parse(fs.readFileSync(outPath, "utf8")); } catch (e) { /* premier run */ }
    var combined = existing.concat(rows.map(function (r) { return Object.assign({ captured_at: new Date().toISOString() }, r); }));
    fs.writeFileSync(outPath, JSON.stringify(combined, null, 2) + "\n");
    console.log(rows.length + " snapshot(s) ajoute(s) a " + outPath + " (" + combined.length + " au total) - PAS persiste en base (cle Supabase absente ici).");
  }
}

if (require.main === module) {
  main().catch(function (e) { console.error("FATAL:", e.message); process.exitCode = 1; });
}

module.exports = { computeSnapshotPhase: computeSnapshotPhase };
