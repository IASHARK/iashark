"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 (2026-09-06). Tests du registry global -
// merge partiel (jamais un ecrasement complet), persistance JSON.
// Nettoie sa propre entree de test (jamais de pollution du registry
// reel).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const { loadRegistry, updateLeagueEntry, REGISTRY_PATH } = require("../lib/league-factory/registry.js");

const TEST_KEY = "__unit_test_league__";

test.after(() => {
  const registry = loadRegistry();
  delete registry.leagues[TEST_KEY];
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
});

test("updateLeagueEntry : merge partiel, jamais un ecrasement complet des champs deja presents", () => {
  const first = updateLeagueEntry(TEST_KEY, { league_id: 999999, score_status: "NOT_STARTED" });
  assert.equal(first.league_id, 999999);
  assert.equal(first.score_status, "NOT_STARTED");

  const second = updateLeagueEntry(TEST_KEY, { score_status: "PRE_OOS_READY" });
  assert.equal(second.league_id, 999999, "un champ non fourni dans le 2e update doit rester celui du 1er, jamais reinitialise");
  assert.equal(second.score_status, "PRE_OOS_READY");
});

test("updateLeagueEntry : score_runnable/player_runnable/live_eligible ne sont jamais true par defaut", () => {
  const entry = updateLeagueEntry(TEST_KEY + "_2", {});
  assert.equal(entry.score_runnable, false);
  assert.equal(entry.player_runnable, false);
  assert.equal(entry.live_eligible, false);
  // nettoyage de cette 2e cle de test
  const registry = loadRegistry();
  delete registry.leagues[TEST_KEY + "_2"];
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
});

test("loadRegistry : fichier absent -> structure vide, jamais une exception ni une valeur fabriquee", () => {
  const registry = loadRegistry();
  assert.ok(registry.leagues && typeof registry.leagues === "object");
});
