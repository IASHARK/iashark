#!/usr/bin/env node
"use strict";
// Audit REEL des marches/cotes API-Football sur la liste de lancement
// (config/leagues.json). N'affirme jamais qu'un marche est disponible sans
// l'avoir vu au moins une fois dans une reponse /odds reelle. Ecrit
// odds-market-audit-report.json, consomme ensuite pour comparer au Market
// Registry (lib/market-registry.js) et produire la classification demandee
// (MODEL_SUPPORTED / ODDS_AVAILABLE_ONLY / MODEL_AND_ODDS / INSUFFICIENT_DATA
// / NOT_AVAILABLE), documentee dans IASHARK_V2_RECETTE_VISUELLE.md.
//
// Usage : APISPORTS_KEY=xxx node scripts/audit-odds-markets.js [--fixtures-per-league=3]
require("./load-env.js");
const fs = require("fs");
const https = require("https");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LEAGUES_CONFIG = require(path.join(ROOT, "config/leagues.json"));
let COVERAGE_REPORT = null;
try { COVERAGE_REPORT = JSON.parse(fs.readFileSync(path.join(ROOT, "league-coverage-report.json"), "utf8")); } catch (e) { /* pas bloquant : repli sur SEASON_FALLBACK */ }
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

async function main() {
  var apsKey = process.env.APISPORTS_KEY;
  if (!apsKey) {
    console.error("APISPORTS_KEY absent : aucun audit ne sera fabrique.");
    process.exitCode = 1;
    return;
  }
  var headers = { "x-apisports-key": apsKey };
  var fixturesPerLeague = 3;
  process.argv.forEach(function (a) {
    var m = /^--fixtures-per-league=(\d+)$/.exec(a);
    if (m) fixturesPerLeague = parseInt(m[1], 10);
  });

  console.log("=== 1. /odds/bets (catalogue complet des types de marche) ===");
  var betsResp = await get("https://v3.football.api-sports.io/odds/bets", headers);
  var betsCatalog = betsResp.response || [];
  console.log(betsCatalog.length + " types de marche dans le catalogue API-Football.");
  await sleep(300);

  console.log("=== 2. /odds/bookmakers (liste reelle des bookmakers) ===");
  var bkResp = await get("https://v3.football.api-sports.io/odds/bookmakers", headers);
  var bookmakersCatalog = bkResp.response || [];
  console.log(bookmakersCatalog.length + " bookmakers dans le catalogue API-Football.");
  await sleep(300);

  console.log("=== 3. Fixtures reelles par ligue (" + fixturesPerLeague + "/ligue) puis /odds par fixture ===");
  // market audit accumulator, cle = bet_id
  var marketAudit = {}; // bet_id -> { bet_id, name, bookmakers:Set, fixtureCount, leagues:Set }
  var fixturesChecked = [];
  var fixturesWithNoOdds = [];

  for (var li = 0; li < LEAGUES_CONFIG.leagues.length; li++) {
    var league = LEAGUES_CONFIG.leagues[li];
    var season = seasonFor(league.apiFootballId);
    console.log("-- " + league.displayName + " (id=" + league.apiFootballId + ", saison=" + season + ") --");
    var fxResp = await get("https://v3.football.api-sports.io/fixtures?league=" + league.apiFootballId + "&season=" + season + "&next=" + fixturesPerLeague, headers);
    await sleep(300);
    var fixtures = (fxResp.response || []).slice(0, fixturesPerLeague);
    if (!fixtures.length) {
      console.log("   aucune fixture a venir trouvee pour cette ligue/saison.");
      continue;
    }
    for (var fi = 0; fi < fixtures.length; fi++) {
      var fx = fixtures[fi];
      var fixtureId = fx.fixture.id;
      var oddsResp = await get("https://v3.football.api-sports.io/odds?fixture=" + fixtureId, headers);
      await sleep(300);
      var oddsRows = oddsResp.response || [];
      fixturesChecked.push({ league: league.key, apiFootballId: league.apiFootballId, fixtureId: fixtureId, home: fx.teams.home.name, away: fx.teams.away.name, date: fx.fixture.date, oddsBookmakerCount: oddsRows.length ? (oddsRows[0].bookmakers || []).length : 0 });
      if (!oddsRows.length) {
        fixturesWithNoOdds.push({ league: league.key, fixtureId: fixtureId, home: fx.teams.home.name, away: fx.teams.away.name, date: fx.fixture.date });
        console.log("   " + fx.teams.home.name + " vs " + fx.teams.away.name + " : AUCUNE cote (pas encore publiee ou fixture trop lointaine)");
        continue;
      }
      var betsSeenThisFixture = {};
      (oddsRows[0].bookmakers || []).forEach(function (bk) {
        (bk.bets || []).forEach(function (bet) {
          var key = String(bet.id);
          if (!marketAudit[key]) {
            marketAudit[key] = { bet_id: bet.id, name: bet.name, bookmakers: {}, leagues: {}, fixtureIds: {} };
          }
          marketAudit[key].bookmakers[bk.name] = true;
          marketAudit[key].leagues[league.key] = true;
          marketAudit[key].fixtureIds[fixtureId] = true;
          betsSeenThisFixture[key] = true;
        });
      });
      console.log("   " + fx.teams.home.name + " vs " + fx.teams.away.name + " : " + (oddsRows[0].bookmakers || []).length + " bookmaker(s), " + Object.keys(betsSeenThisFixture).length + " marche(s) distincts");
    }
  }

  console.log("=== 4. Verification de l'endpoint odds live (in-play) ===");
  var liveInfo = { endpointTested: true, liveFixturesFoundInLaunchLeagues: 0, sample: null };
  try {
    var liveResp = await get("https://v3.football.api-sports.io/odds/live", headers);
    await sleep(300);
    var liveRows = liveResp.response || [];
    var launchIds = LEAGUES_CONFIG.leagues.map(function (l) { return l.apiFootballId; });
    var liveInLaunch = liveRows.filter(function (r) { return r.league && launchIds.indexOf(r.league.id) !== -1; });
    liveInfo.totalLiveFixturesAllLeagues = liveRows.length;
    liveInfo.liveFixturesFoundInLaunchLeagues = liveInLaunch.length;
    if (liveInLaunch.length) liveInfo.sample = liveInLaunch[0];
    console.log(liveRows.length + " fixture(s) avec cote live tous sports/ligues confondus, dont " + liveInLaunch.length + " dans nos 13 ligues de lancement (a l'instant de ce run).");
  } catch (e) {
    liveInfo.error = e.message;
    console.log("Erreur odds/live : " + e.message);
  }

  // Construit le rapport final : un enregistrement par marche reellement vu
  var totalFixturesWithOdds = fixturesChecked.length - fixturesWithNoOdds.length;
  var marketReport = Object.keys(marketAudit).map(function (key) {
    var m = marketAudit[key];
    var fixtureCount = Object.keys(m.fixtureIds).length;
    return {
      bet_id: m.bet_id,
      market_name_api: m.name,
      bookmakers: Object.keys(m.bookmakers).sort(),
      bookmaker_count: Object.keys(m.bookmakers).length,
      leagues: Object.keys(m.leagues).sort(),
      league_count: Object.keys(m.leagues).length,
      fixture_count: fixtureCount,
      fixtures_checked_with_odds: totalFixturesWithOdds,
      real_frequency: totalFixturesWithOdds ? +(fixtureCount / totalFixturesWithOdds).toFixed(3) : 0,
      pre_match_or_live: "pre_match", // cet audit interroge /odds (pre-match) ; voir odds_live_check pour le in-play
    };
  }).sort(function (a, b) { return b.fixture_count - a.fixture_count; });

  var report = {
    generatedAt: new Date().toISOString(),
    source: "scripts/audit-odds-markets.js (appels reels API-Football /odds/bets, /odds/bookmakers, /odds, /odds/live)",
    bets_catalog_total: betsCatalog.length,
    bookmakers_catalog_total: bookmakersCatalog.length,
    bookmakers_catalog: bookmakersCatalog.map(function (b) { return { id: b.id, name: b.name }; }),
    fixtures_checked_total: fixturesChecked.length,
    fixtures_checked_with_odds: totalFixturesWithOdds,
    fixtures_checked_without_odds: fixturesWithNoOdds.length,
    fixtures_checked: fixturesChecked,
    fixtures_without_odds_detail: fixturesWithNoOdds,
    odds_live_check: liveInfo,
    markets_observed: marketReport,
  };
  fs.writeFileSync(path.join(ROOT, "odds-market-audit-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("\nRapport ecrit : odds-market-audit-report.json");
  console.log(marketReport.length + " marche(s) reellement observe(s) sur " + totalFixturesWithOdds + "/" + fixturesChecked.length + " fixtures avec cotes.");
}

if (require.main === module) {
  main().catch(function (e) { console.error("FATAL:", e.message); process.exitCode = 1; });
}

module.exports = { seasonFor: seasonFor };
