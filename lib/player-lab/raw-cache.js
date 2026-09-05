"use strict";
// PLAYER LAB - PILOT (2026-09-05), item 4. Cache IMMUABLE des reponses
// API-Football brutes - jamais d'ecrasement silencieux. Une fixture
// deja correctement collectee pour un endpoint donne n'est JAMAIS
// rappelee (isCached doit etre verifie par l'appelant avant tout appel
// API - ce module ne fait aucun appel reseau lui-meme).

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const RAW_CACHE_ROOT = path.join(__dirname, "..", "..", "data", "player-lab", "raw");

function cachePath(endpoint, fixtureId) {
  return path.join(RAW_CACHE_ROOT, endpoint, `${fixtureId}.json`);
}

function hashPayload(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function isCached(endpoint, fixtureId) {
  return fs.existsSync(cachePath(endpoint, fixtureId));
}

function readCached(endpoint, fixtureId) {
  const p = cachePath(endpoint, fixtureId);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

// Enveloppe obligatoire (item 4) : fixture_id, endpoint, retrieved_at,
// api_season, response_hash, raw_payload. Refuse d'ecraser une entree
// deja presente - un fait historique deja capture ne doit jamais etre
// remplace silencieusement.
function writeCached({ endpoint, fixtureId, apiSeason, rawPayload }) {
  const p = cachePath(endpoint, fixtureId);
  if (fs.existsSync(p)) {
    throw new Error(`writeCached: ${endpoint}/${fixtureId} deja present - refus d'ecraser (cache immuable). Verifier isCached() avant d'appeler l'API.`);
  }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const envelope = {
    fixture_id: fixtureId,
    endpoint,
    retrieved_at: new Date().toISOString(),
    api_season: apiSeason,
    response_hash: hashPayload(rawPayload),
    raw_payload: rawPayload,
  };
  fs.writeFileSync(p, JSON.stringify(envelope, null, 2));
  return envelope;
}

module.exports = { RAW_CACHE_ROOT, cachePath, hashPayload, isCached, readCached, writeCached };
