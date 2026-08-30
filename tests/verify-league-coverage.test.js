"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { resolveSeason, computeTier } = require("../scripts/verify-league-coverage.js");

const ROOT = path.join(__dirname, "..");

test("config/leagues.json : contient exactement les 13 competitions de lancement, cles/ids uniques", () => {
  var config = JSON.parse(fs.readFileSync(path.join(ROOT, "config/leagues.json"), "utf8"));
  assert.equal(config.leagues.length, 13);
  var keys = config.leagues.map(function (l) { return l.key; });
  var ids = config.leagues.map(function (l) { return l.apiFootballId; });
  assert.equal(new Set(keys).size, 13, "cles internes dupliquees");
  assert.equal(new Set(ids).size, 13, "apiFootballId dupliques");
  config.leagues.forEach(function (l) {
    assert.ok(l.key && l.displayName && l.country && typeof l.apiFootballId === "number", JSON.stringify(l) + " incomplet");
    assert.equal(typeof l.europeanQualification, "boolean");
  });
});

test("resolveSeason : privilegie la saison marquee current:true", () => {
  var seasons = [{ year: 2024, current: false }, { year: 2025, current: true }, { year: 2026, current: false }];
  assert.equal(resolveSeason(seasons).year, 2025);
});

test("resolveSeason : sans saison current, retombe sur l'annee la plus recente (jamais devinee autrement)", () => {
  var seasons = [{ year: 2023, current: false }, { year: 2025, current: false }, { year: 2024, current: false }];
  assert.equal(resolveSeason(seasons).year, 2025);
});

test("resolveSeason : liste vide/absente -> null (pas de fabrication)", () => {
  assert.equal(resolveSeason([]), null);
  assert.equal(resolveSeason(null), null);
});

test("computeTier : toutes les couvertures actives -> FULL_ANALYSIS", () => {
  var coverage = {
    fixtures: { events: true, lineups: true, statistics_fixtures: true, statistics_players: true },
    standings: true, players: true, injuries: true, odds: true,
  };
  assert.equal(computeTier(coverage).tier, "FULL_ANALYSIS");
});

test("computeTier : core couvert mais lineups/injuries absents -> STANDARD_ANALYSIS (jamais fabrique)", () => {
  var coverage = {
    fixtures: { events: true, lineups: false, statistics_fixtures: true, statistics_players: false },
    standings: true, players: false, injuries: false, odds: false,
  };
  var r = computeTier(coverage);
  assert.equal(r.tier, "STANDARD_ANALYSIS");
  assert.match(r.reason, /lineups/);
});

test("computeTier : pas de standings -> LIMITED_DATA (core insuffisant)", () => {
  var coverage = {
    fixtures: { events: true, lineups: true, statistics_fixtures: true, statistics_players: true },
    standings: false, players: true, injuries: true, odds: true,
  };
  assert.equal(computeTier(coverage).tier, "LIMITED_DATA");
});

test("computeTier : coverage absente -> LIMITED_DATA, jamais une exception ni une valeur inventee", () => {
  assert.equal(computeTier(null).tier, "LIMITED_DATA");
  assert.equal(computeTier(undefined).tier, "LIMITED_DATA");
});

test("computeTier : les odds ne conditionnent jamais le tier (odds absentes mais reste couvert -> FULL_ANALYSIS quand meme)", () => {
  var coverage = {
    fixtures: { events: true, lineups: true, statistics_fixtures: true, statistics_players: true },
    standings: true, players: true, injuries: true, odds: false,
  };
  assert.equal(computeTier(coverage).tier, "FULL_ANALYSIS");
});
