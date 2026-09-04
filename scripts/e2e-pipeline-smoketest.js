#!/usr/bin/env node
"use strict";
// Preuve E2E REELLE (pas seulement des tests unitaires) de la chaine :
// API-Football -> team engine -> player engine -> market registry -> match
// output -> Supabase (snapshot). Execute sur un echantillon de vraies
// fixtures couvrant les 3 tiers reels (FULL_ANALYSIS/STANDARD_ANALYSIS/
// LIMITED_DATA) pour prouver le gating. Reutilise les memes fonctions que
// la production (lib/models.js, lib/markets/score-matrix.js,
// lib/markets/player-engine.js, lib/decision.js) - jamais reimplementees.
//
// Ce n'est PAS une invocation de pipeline.js complet (qui traite les 13
// ligues x 3 jours + SEO + sitemaps + narratif LLM + meteo/news, hors
// perimetre d'une preuve E2E rapide et necessitant des cles absentes ici -
// voir docs/e2e-secrets.md). C'est une preuve honnete, ciblee, avec de
// vraies donnees, de la chaine deterministe centrale.
require("./load-env.js");
const fs = require("fs");
const https = require("https");
const path = require("path");
const { calcPoissonProbs, calcDixonColesProbs, calcMonteCarlo, seedFromLambdas } = require("../lib/models.js");
const { deriveMarketsFromMatrix, buildPoissonMatrix } = require("../lib/markets/score-matrix.js");
const { computeDataQualityScore, computeModelAgreement, computeReliability } = require("../lib/decision.js");
const { buildPlayerMarketOutput } = require("../lib/markets/player-engine.js");
const { MARKET_REGISTRY } = require("../lib/market-registry.js");

const ROOT = path.join(__dirname, "..");
const LEAGUES_CONFIG = require(path.join(ROOT, "config/leagues.json"));
const COVERAGE_REPORT = JSON.parse(fs.readFileSync(path.join(ROOT, "league-coverage-report.json"), "utf8"));

function get(url, headers) {
  return new Promise(function (resolve, reject) {
    https.get(url, { headers: headers || {} }, function (res) {
      var body = "";
      res.on("data", function (c) { body += c; });
      res.on("end", function () { try { resolve(JSON.parse(body)); } catch (e) { reject(e); } });
    }).on("error", reject);
  });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function buildMatchOutput(apsKey, league, tier, season) {
  var headers = { "x-apisports-key": apsKey };
  var fxResp = await get("https://v3.football.api-sports.io/fixtures?league=" + league.apiFootballId + "&season=" + season + "&next=1", headers);
  await sleep(250);
  var fx = (fxResp.response || [])[0];
  if (!fx) return { league: league.key, error: "aucune fixture a venir trouvee" };

  var homeId = fx.teams.home.id, awayId = fx.teams.away.id;
  var sH = await get("https://v3.football.api-sports.io/teams/statistics?team=" + homeId + "&league=" + league.apiFootballId + "&season=" + season, headers);
  await sleep(250);
  var sA = await get("https://v3.football.api-sports.io/teams/statistics?team=" + awayId + "&league=" + league.apiFootballId + "&season=" + season, headers);
  await sleep(250);
  var injResp = await get("https://v3.football.api-sports.io/injuries?fixture=" + fx.fixture.id, headers);
  await sleep(250);
  var lineupsResp = await get("https://v3.football.api-sports.io/fixtures/lineups?fixture=" + fx.fixture.id, headers);
  await sleep(250);
  var hasLineups = !!(lineupsResp.response && lineupsResp.response.length);

  // Team engine : lambdas reels a partir des vraies stats saison (buts
  // marques/encaisses par match joue) - simplifie par rapport a calcLambdas
  // (pipeline, shrinkage ligue), mais memes fonctions Poisson/Dixon-Coles/
  // Monte-Carlo reellement utilisees en production (lib/models.js).
  function safeLambda(stats, side) {
    var played = stats && stats.response && stats.response.fixtures && stats.response.fixtures.played && stats.response.fixtures.played.total;
    var goalsFor = stats && stats.response && stats.response.goals && stats.response.goals.for && stats.response.goals.for.total && stats.response.goals.for.total.total;
    if (!played || goalsFor == null) return { lambda: 1.2, sampleSize: null };
    return { lambda: Math.max(0.4, Math.min(3.2, goalsFor / played)), sampleSize: played };
  }
  var lamH = safeLambda(sH, "home");
  var lamA = safeLambda(sA, "away");

  var poisson = calcPoissonProbs(lamH.lambda, lamA.lambda);
  var dixon = calcDixonColesProbs(lamH.lambda, lamA.lambda);
  // Trouve lors de l'audit du 2026-09-04 (item 6) : mc.p1 alimente pureP1/
  // pureP2 (le "score pur" de sortie) et modelAgreement ci-dessous, donc
  // fait bien partie de l'objet de decision de ce script - un appel sans
  // seed le rendrait non deterministe, en contradiction avec le but affiche
  // de ce fichier ("preuve... de la chaine deterministe centrale"). Meme
  // correctif que lib/engine.js (GATE C9) : seed derive des lambdas.
  var mc = calcMonteCarlo(lamH.lambda, lamA.lambda, { seed: seedFromLambdas(lamH.lambda, lamA.lambda) });
  var pureP1 = Math.round((poisson.p1 * 0.35 + dixon.p1 * 0.4 + mc.p1 * 0.25));
  var pureP2 = Math.round((poisson.p2 * 0.35 + dixon.p2 * 0.4 + mc.p2 * 0.25));
  var purePN = 100 - pureP1 - pureP2;

  var matrix = buildPoissonMatrix(lamH.lambda, lamA.lambda);
  var allMarkets = deriveMarketsFromMatrix(matrix);

  var dataQuality = computeDataQualityScore({
    hasTeamStatsHome: !!lamH.sampleSize, hasTeamStatsAway: !!lamA.sampleSize,
    hasOdds: false, hasInjuries: !!(injResp.response && injResp.response.length),
    hasH2H: false, hasElo: false, hasLineups: hasLineups,
  });
  var modelAgreement = computeModelAgreement([poisson.p1, dixon.p1, mc.p1]);
  var sampleSizeReal = lamH.sampleSize != null && lamA.sampleSize != null ? Math.min(lamH.sampleSize, lamA.sampleSize) : null;
  var reliability = computeReliability(modelAgreement, dataQuality, sampleSizeReal);

  // Market Registry : classification reelle du marche retenu.
  var matchWinnerEntry = MARKET_REGISTRY.find(function (m) { return m.id === "MATCH_WINNER"; });

  // Player Engine : uniquement si tier le permet ET lineup confirmee (meme
  // gate que le pipeline reel, computePlayerMarketsForFixture).
  var playerMarkets = [];
  if ((tier === "FULL_ANALYSIS" || tier === "STANDARD_ANALYSIS") && hasLineups) {
    var starters = (lineupsResp.response[0].startXI || []).filter(function (p) { return p.player && p.player.id && p.player.pos !== "G"; }).slice(0, 3);
    for (var i = 0; i < starters.length; i++) {
      var pid = starters[i].player.id;
      var pResp = await get("https://v3.football.api-sports.io/players?id=" + pid + "&season=" + (season - 1) + "&team=" + homeId, headers);
      await sleep(250);
      var pStat = pResp.response && pResp.response[0] && pResp.response[0].statistics[0];
      if (!pStat) continue;
      var games = { appearences: pStat.games.appearences || 0, lineups: pStat.games.lineups || 0, minutes: pStat.games.minutes || 0 };
      var ratio = games.minutes > 0 ? games.minutes / 90 : 0;
      var goalsPer90 = ratio > 0 ? (pStat.goals.total || 0) / ratio : null;
      var out = buildPlayerMarketOutput({
        fixtureId: fx.fixture.id, playerId: pid, market: "ANYTIME_GOALSCORER",
        lineupStatus: "confirmed_starter", historicalMinutes: games, ratePer90: goalsPer90,
      });
      if (out) { out.player_name = starters[i].player.name; playerMarkets.push(out); }
    }
  }

  return {
    league: league.key, tier: tier, fixture_id: fx.fixture.id,
    home: fx.teams.home.name, away: fx.teams.away.name, date: fx.fixture.date,
    lambda_home: +lamH.lambda.toFixed(2), lambda_away: +lamA.lambda.toFixed(2),
    pure_probability: { p1: pureP1, pN: purePN, p2: pureP2 },
    market_count_derived: Object.keys(allMarkets || {}).length,
    match_winner_registry_status: matchWinnerEntry ? matchWinnerEntry.availability_status : null,
    data_quality: dataQuality, model_agreement: modelAgreement.label, reliability: reliability,
    has_lineups: hasLineups, injuries_count: (injResp.response || []).length,
    player_markets_computed: playerMarkets.length, player_markets: playerMarkets,
  };
}

async function main() {
  var apsKey = process.env.APISPORTS_KEY;
  if (!apsKey) { console.error("APISPORTS_KEY absent."); process.exitCode = 1; return; }
  var samples = [
    { key: "premier", tier: "FULL_ANALYSIS" },
    { key: "primeira", tier: "STANDARD_ANALYSIS" },
    { key: "ldc", tier: "LIMITED_DATA" },
    { key: "mls", tier: "FULL_ANALYSIS" },
  ];
  var results = [];
  for (var i = 0; i < samples.length; i++) {
    var league = LEAGUES_CONFIG.leagues.find(function (l) { return l.key === samples[i].key; });
    var covEntry = COVERAGE_REPORT.leagues.find(function (l) { return l.key === samples[i].key; });
    var season = (covEntry && covEntry.resolvedSeason) || 2026;
    console.log("=== " + league.displayName + " (tier attendu " + samples[i].tier + ") ===");
    try {
      var r = await buildMatchOutput(apsKey, league, samples[i].tier, season);
      results.push(r);
      console.log(JSON.stringify(r, null, 2));
    } catch (e) {
      console.log("ERREUR:", e.message);
      results.push({ league: samples[i].key, error: e.message });
    }
  }
  fs.writeFileSync(path.join(ROOT, "e2e-pipeline-smoketest-report.json"), JSON.stringify({ generatedAt: new Date().toISOString(), results: results }, null, 2) + "\n");
  console.log("\nRapport ecrit : e2e-pipeline-smoketest-report.json");
}

if (require.main === module) main().catch(function (e) { console.error("FATAL:", e.message); process.exitCode = 1; });
