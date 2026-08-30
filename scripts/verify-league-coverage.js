#!/usr/bin/env node
"use strict";
// Verifie REELLEMENT (aucune valeur devinee/fabriquee) la couverture
// API-Football de la liste de lancement (config/leagues.json) et ecrit
// league-coverage-report.json a la racine, consomme ensuite par le pipeline
// (.github/workflows/update-data.yml) pour choisir la saison active de
// chaque competition et taguer son analysis_tier (FULL_ANALYSIS /
// STANDARD_ANALYSIS / LIMITED_DATA), sans jamais coder ces valeurs en dur.
//
// Necessite APISPORTS_KEY (le meme secret que le pipeline principal). Si la
// cle est absente ou qu'un appel echoue pour une competition donnee, ce
// script ne fabrique RIEN : il log une erreur claire et laisse cette
// competition en statut VERIFICATION_FAILED / VERIFICATION_SKIPPED plutot
// que d'inventer une saison ou un niveau de couverture.
//
// Usage : APISPORTS_KEY=xxx node scripts/verify-league-coverage.js
const fs = require("fs");
const https = require("https");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const LEAGUES_CONFIG_PATH = path.join(ROOT, "config/leagues.json");
const REPORT_PATH = path.join(ROOT, "league-coverage-report.json");

function get(url, headers) {
  return new Promise(function (resolve, reject) {
    https
      .get(url, { headers: headers || {} }, function (res) {
        var body = "";
        res.on("data", function (c) { body += c; });
        res.on("end", function () {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body) });
          } catch (e) {
            reject(new Error("Reponse non-JSON (HTTP " + res.statusCode + "): " + body.slice(0, 200)));
          }
        });
      })
      .on("error", reject);
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// Choisit la saison a utiliser : celle marquee current:true par l'API,
// sinon la plus recente disponible. Ne devine jamais une annee calendaire
// a partir du nom de la competition (MLS/J1/Allsvenskan suivent un
// calendrier civil, les ligues europeennes un calendrier aout-mai : c'est
// exactement pour eviter d'avoir a coder cette regle a la main que cette
// fonction lit season.current directement dans la reponse API).
function resolveSeason(seasons) {
  if (!Array.isArray(seasons) || !seasons.length) return null;
  var current = seasons.find(function (s) { return s.current === true; });
  if (current) return current;
  return seasons.reduce(function (best, s) {
    return !best || (s.year || 0) > (best.year || 0) ? s : best;
  }, null);
}

// Regles de tiering : dependent uniquement des flags coverage reellement
// retournes par l'API pour la saison resolue. Les odds ne conditionnent
// jamais le tier (le moteur doit pouvoir analyser un match sans cote).
function computeTier(coverage) {
  if (!coverage) return { tier: "LIMITED_DATA", reason: "Aucun objet coverage retourne par l'API pour cette saison." };
  var fx = coverage.fixtures || {};
  var core = !!(fx.events && coverage.standings && fx.statistics_fixtures);
  if (!core) {
    return {
      tier: "LIMITED_DATA",
      reason: "Couverture core insuffisante (fixtures.events=" + !!fx.events +
        ", standings=" + !!coverage.standings + ", fixtures.statistics_fixtures=" + !!fx.statistics_fixtures + ").",
    };
  }
  var full = !!(fx.lineups && fx.statistics_players && coverage.players && coverage.injuries);
  if (full) {
    return { tier: "FULL_ANALYSIS", reason: "Toutes les couvertures requises (fixtures, standings, stats equipe/joueur, lineups, injuries) sont actives." };
  }
  var missing = [];
  if (!fx.lineups) missing.push("lineups");
  if (!fx.statistics_players) missing.push("statistics_players (stats joueur)");
  if (!coverage.players) missing.push("players");
  if (!coverage.injuries) missing.push("injuries");
  return {
    tier: "STANDARD_ANALYSIS",
    reason: "Core couvert (fixtures/standings/stats equipe) mais modules manquants : " + missing.join(", ") + ". Ces modules ne seront pas fabriques pour cette competition.",
  };
}

async function verifyLeague(league, apsKey) {
  var url = "https://v3.football.api-sports.io/leagues?id=" + league.apiFootballId;
  try {
    var r = await get(url, { "x-apisports-key": apsKey });
    var entry = r.json && r.json.response && r.json.response[0];
    if (!entry) {
      return {
        key: league.key,
        apiFootballId: league.apiFootballId,
        status: "VERIFICATION_FAILED",
        error: "Aucune reponse API pour id=" + league.apiFootballId + " (HTTP " + r.status + ", errors=" + JSON.stringify(r.json && r.json.errors) + ").",
        verifiedAt: null,
      };
    }
    var apiName = entry.league && entry.league.name;
    // Compare au nom d'API attendu explicite (apiNameHint) quand le displayName
    // interne est une abreviation (ex. MLS / Major League Soccer) qui ne
    // matche jamais un nom complet par simple inclusion de sous-chaine.
    var expectedName = league.apiNameHint || league.displayName;
    var nameMismatch = apiName && expectedName && !apiName.toLowerCase().includes(expectedName.toLowerCase().split(" ")[0]);
    var season = resolveSeason(entry.seasons);
    if (!season) {
      return {
        key: league.key,
        apiFootballId: league.apiFootballId,
        apiName: apiName || null,
        status: "VERIFICATION_FAILED",
        error: "Aucune saison retournee par l'API pour cette competition.",
        verifiedAt: new Date().toISOString(),
      };
    }
    var tierInfo = computeTier(season.coverage);
    return {
      key: league.key,
      apiFootballId: league.apiFootballId,
      apiName: apiName || null,
      nameMismatchWarning: nameMismatch ? ("Nom API '" + apiName + "' ne correspond pas visiblement a '" + league.displayName + "' - a verifier manuellement.") : null,
      status: "VERIFIED",
      resolvedSeason: season.year,
      seasonStart: season.start || null,
      seasonEnd: season.end || null,
      coverage: season.coverage || null,
      oddsAvailable: !!(season.coverage && season.coverage.odds),
      analysisTier: tierInfo.tier,
      tierReason: tierInfo.reason,
      verifiedAt: new Date().toISOString(),
    };
  } catch (e) {
    return {
      key: league.key,
      apiFootballId: league.apiFootballId,
      status: "VERIFICATION_FAILED",
      error: e.message,
      verifiedAt: null,
    };
  }
}

async function main() {
  var apsKey = process.env.APISPORTS_KEY;
  var config = JSON.parse(fs.readFileSync(LEAGUES_CONFIG_PATH, "utf8"));
  var leagues = config.leagues;

  if (!apsKey) {
    console.error("APISPORTS_KEY absent : impossible de verifier la couverture reelle des competitions.");
    console.error("Aucun league-coverage-report.json ne sera fabrique. Le pipeline utilisera le dernier rapport verifie present sur le repo (le cas echeant) et loguera un avertissement sinon.");
    process.exitCode = 1;
    return;
  }

  var results = [];
  for (var i = 0; i < leagues.length; i++) {
    console.log("Verification " + leagues[i].displayName + " (id=" + leagues[i].apiFootballId + ")...");
    var res = await verifyLeague(leagues[i], apsKey);
    results.push(res);
    if (res.status === "VERIFIED") {
      console.log("  -> " + res.analysisTier + " (saison " + res.resolvedSeason + ") : " + res.tierReason);
      if (res.nameMismatchWarning) console.warn("  !! " + res.nameMismatchWarning);
    } else {
      console.error("  -> ECHEC : " + res.error);
    }
    await sleep(300);
  }

  var report = {
    generatedAt: new Date().toISOString(),
    source: "scripts/verify-league-coverage.js (appels reels API-Football /leagues)",
    leagues: results,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + "\n");
  console.log("Rapport ecrit : " + REPORT_PATH);

  var failed = results.filter(function (r) { return r.status !== "VERIFIED"; });
  if (failed.length) {
    console.error(failed.length + " competition(s) non verifiee(s) : " + failed.map(function (r) { return r.key; }).join(", "));
    process.exitCode = 1;
  }
}

module.exports = { resolveSeason: resolveSeason, computeTier: computeTier, verifyLeague: verifyLeague };

if (require.main === module) {
  main();
}
