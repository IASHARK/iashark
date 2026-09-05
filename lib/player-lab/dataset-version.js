"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item PLAYER_DATASET_VERSION.
// Manifest canonique + SHA256 : ensemble de fixtures, hashes de TOUTES
// les sources brutes, version du collecteur, exclusions, version de
// schema. 2025-26 (SEALED_UNREAD) n'entre JAMAIS dans ce manifest.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readCached, isCached } = require("./raw-cache.js");

const COLLECTOR_VERSION = "player-lab-pilot-collector-v1"; // scripts/collect-player-lab-pilot.js, inchange depuis le pilot valide
const SCHEMA_VERSION = "player-match-v1";
const ENDPOINTS = ["lineups", "players", "events"];

function buildDatasetManifest(seasons) {
  const fixtureEntries = [];
  const exclusions = [];
  for (const season of seasons) {
    const fixturesPath = path.join(__dirname, "..", "..", "data", "gate-b1", `premier-league-${season}.json`);
    const fixtures = JSON.parse(fs.readFileSync(fixturesPath, "utf8"));
    for (const fx of fixtures) {
      const hashes = {};
      let complete = true;
      for (const e of ENDPOINTS) {
        if (!isCached(e, fx.fixture_id)) { complete = false; continue; }
        hashes[e] = readCached(e, fx.fixture_id).response_hash;
      }
      if (!complete) { exclusions.push({ fixture_id: fx.fixture_id, season, reason: "INCOMPLETE_CACHE" }); continue; }
      fixtureEntries.push({ fixture_id: fx.fixture_id, season, hashes });
    }
  }
  const manifest = {
    collector_version: COLLECTOR_VERSION,
    schema_version: SCHEMA_VERSION,
    seasons,
    n_fixtures: fixtureEntries.length,
    fixtures: fixtureEntries,
    exclusions,
  };
  const dataset_version = crypto.createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  return { ...manifest, dataset_version };
}

module.exports = { buildDatasetManifest, COLLECTOR_VERSION, SCHEMA_VERSION };
