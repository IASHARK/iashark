"use strict";
// Client api-football pour les pages club / derby (scripts/build-club-hubs.js).
//
// - Cle APISPORTS_KEY lue dans l'environnement (scripts/load-env.js en local,
//   secret GitHub en CI). Jamais affichee, jamais ecrite dans le cache.
// - Cache disque par URL (sha1) dans data/club-hubs/cache/ : data/ est un
//   repertoire interne que scripts/build-public.js refuse de publier.
//   Chaque entree garde fetched_at ; la duree de validite depend du type
//   d'appel (TTL ci-dessous) pour respecter le quota.
// - Une reponse en erreur (quota, parametre invalide, reseau) n'est JAMAIS
//   mise en cache ni traitee comme "pas de donnee" (lib/api-fetch-policy.js).
//   En cas d'erreur, la derniere reponse valide en cache est reutilisee
//   (marquee stale) plutot que de vider une page.
// - Hors ligne (pas de cle, ou CLUB_HUBS_OFFLINE=1) : cache seul.
const fs = require("fs");
const path = require("path");
const https = require("https");
const crypto = require("crypto");
const POLICY = require("./api-fetch-policy.js");

const HOST = "v3.football.api-sports.io";
const DEFAULT_CACHE_DIR = path.join(__dirname, "..", "data", "club-hubs", "cache");

const HOUR = 3600 * 1000;
// Durees de validite par endpoint (le pipeline tourne une fois par jour).
const TTL = {
  "/teams": 30 * 24 * HOUR,          // identite, stade, annee de fondation
  "/leagues": 24 * HOUR,             // saison courante
  "/standings": 6 * HOUR,
  "/fixtures": 6 * HOUR,             // prochains / derniers matchs
  "/fixtures/headtohead": 24 * HOUR
};

function ttlFor(endpoint) { return TTL[endpoint] != null ? TTL[endpoint] : 12 * HOUR; }

function buildQuery(params) {
  return Object.keys(params || {}).sort().map(function (k) {
    return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
  }).join("&");
}

function cacheKey(endpoint, params) {
  return crypto.createHash("sha1").update(endpoint + "?" + buildQuery(params)).digest("hex");
}

function httpGet(pathWithQuery, key, timeoutMs) {
  return new Promise(function (resolve) {
    var req = https.get({ host: HOST, path: pathWithQuery, headers: { "x-apisports-key": key } }, function (res) {
      var body = "";
      res.setEncoding("utf8");
      res.on("data", function (c) { body += c; });
      res.on("end", function () {
        if (res.statusCode === 429) return resolve({ errors: { requests: "Too many requests (429)" }, response: [] });
        try { resolve(JSON.parse(body)); } catch (e) { resolve({ __ia_network_error: "invalid JSON (HTTP " + res.statusCode + ")" }); }
      });
    });
    req.setTimeout(timeoutMs || 20000, function () { req.destroy(new Error("timeout")); });
    req.on("error", function (e) { resolve({ __ia_network_error: e.message }); });
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

// createClient({ cacheDir, key, offline, now, fetchImpl, log })
// get(endpoint, params) -> { response: [...], status: 'OK'|'CACHE'|'STALE'|'MISSING', fetched_at }
function createClient(opts) {
  opts = opts || {};
  var cacheDir = opts.cacheDir || DEFAULT_CACHE_DIR;
  var key = opts.key !== undefined ? opts.key : process.env.APISPORTS_KEY;
  var offline = !!opts.offline || !key;
  var now = opts.now || function () { return Date.now(); };
  var fetchImpl = opts.fetchImpl || httpGet;
  var log = opts.log || function () {};
  var stats = { network: 0, cache: 0, stale: 0, missing: 0, errors: 0 };
  var memo = {};

  function readCache(file) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return null; }
  }

  async function get(endpoint, params) {
    var k = cacheKey(endpoint, params);
    if (memo[k]) return memo[k];
    var file = path.join(cacheDir, k + ".json");
    var cached = readCache(file);
    var fresh = cached && (now() - Date.parse(cached.fetched_at)) < ttlFor(endpoint);
    if (cached && (fresh || offline)) {
      stats.cache++;
      return (memo[k] = { response: cached.response, status: fresh ? "CACHE" : "STALE", fetched_at: cached.fetched_at });
    }
    if (offline) {
      stats.missing++;
      return (memo[k] = { response: [], status: "MISSING", fetched_at: null });
    }
    var q = buildQuery(params);
    var parsed = null, status = null;
    for (var attempt = 1; attempt <= 3; attempt++) {
      stats.network++;
      parsed = await fetchImpl(endpoint + (q ? "?" + q : ""), key);
      status = POLICY.classifyApiResponse(parsed);
      if (!POLICY.shouldRetryRateLimit(status, attempt, 3)) break;
      await sleep(POLICY.backoffDelayMs(attempt, 1200));
    }
    if (status === "OK") {
      var entry = { endpoint: endpoint, params: params, fetched_at: new Date(now()).toISOString(), response: parsed.response || [] };
      fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(entry));
      return (memo[k] = { response: entry.response, status: "OK", fetched_at: entry.fetched_at });
    }
    stats.errors++;
    log("api-football " + endpoint + " " + status);
    if (cached) {
      stats.stale++;
      return (memo[k] = { response: cached.response, status: "STALE", fetched_at: cached.fetched_at });
    }
    stats.missing++;
    return (memo[k] = { response: [], status: "MISSING", fetched_at: null });
  }

  return { get: get, stats: stats, offline: offline };
}

module.exports = { createClient: createClient, cacheKey: cacheKey, ttlFor: ttlFor, TTL: TTL, DEFAULT_CACHE_DIR: DEFAULT_CACHE_DIR };
