"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { resolveSeason, computeTier } = require("../scripts/verify-league-coverage.js");

const ROOT = path.join(__dirname, "..");

test("config/leagues.json : contient exactement les 19 competitions de lancement, cles/ids uniques", () => {
  // 13 -> 14 le 2026-09-13 : ajout de liga_mx (decision produit explicite
  // lancement Mexique, voir config/leagues.json#_readme et
  // data/league-validation-registry.json#leagues.liga_mx).
  // 14 -> 15 le 2026-09-13 : ajout de south_africa_premiership (meme decision
  // produit pour l'Afrique du Sud, SANS AUCUN test Score Lab Factory V2 cette
  // fois - prerequis bloque par l'API elle-meme, voir config/leagues.json#_readme
  // et config/league-expansion.json#leagues[key=south_africa_premiership].status_note).
  // 15 -> 19 le 2026-09-14 : ouverture LATAM hispanophone (Argentine 128,
  // Colombie 239, Perou 281, Chili 265), decision du proprietaire SANS
  // validation Score Lab - ids/saisons/coverage verifies en direct, voir
  // config/leagues.json#_readme, data/league-validation-registry.json et
  // LATAM_OPENING_STATUS.md.
  var config = JSON.parse(fs.readFileSync(path.join(ROOT, "config/leagues.json"), "utf8"));
  assert.equal(config.leagues.length, 19);
  var keys = config.leagues.map(function (l) { return l.key; });
  var ids = config.leagues.map(function (l) { return l.apiFootballId; });
  assert.equal(new Set(keys).size, 19, "cles internes dupliquees");
  assert.equal(new Set(ids).size, 19, "apiFootballId dupliques");
  config.leagues.forEach(function (l) {
    assert.ok(l.key && l.displayName && l.country && typeof l.apiFootballId === "number", JSON.stringify(l) + " incomplet");
    assert.equal(typeof l.europeanQualification, "boolean");
  });
});

test("config/leagues.json : ligues LATAM - ids verifies, aucune qualification europeenne, aucune cle odds inventee", () => {
  var config = JSON.parse(fs.readFileSync(path.join(ROOT, "config/leagues.json"), "utf8"));
  var byKey = {};
  config.leagues.forEach(function (l) { byKey[l.key] = l; });
  var expected = { argentina_liga_profesional: 128, colombia_primera_a: 239, peru_primera: 281, chile_primera: 265 };
  Object.keys(expected).forEach(function (k) {
    assert.ok(byKey[k], k + " absent");
    assert.equal(byKey[k].apiFootballId, expected[k], k);
    assert.equal(byKey[k].europeanQualification, false, k);
    assert.equal(byKey[k].apiFootballPinnacleFallback, true, k);
  });
  // Catalogue public The Odds API lu le 2026-09-14 : cles Argentine et Chili
  // uniquement ; Colombie et Perou n'en ont aucune (jamais inventee).
  assert.equal(byKey.argentina_liga_profesional.oddsSportKey, "soccer_argentina_primera_division");
  assert.equal(byKey.chile_primera.oddsSportKey, "soccer_chile_campeonato");
  assert.equal(byKey.colombia_primera_a.oddsSportKey, undefined);
  assert.equal(byKey.peru_primera.oddsSportKey, undefined);
  // Les slugs SEO derivent du displayName : deux "Primera Division" seraient en collision.
  var names = config.leagues.map(function (l) { return l.displayName.toLowerCase(); });
  assert.equal(new Set(names).size, names.length, "displayName dupliques (collision de slug SEO)");
});

test("registry : ligues LATAM presentes, jamais presentees comme validees", () => {
  var reg = JSON.parse(fs.readFileSync(path.join(ROOT, "data/league-validation-registry.json"), "utf8"));
  ["argentina_liga_profesional", "colombia_primera_a", "peru_primera", "chile_primera"].forEach(function (k) {
    var e = reg.leagues[k];
    assert.ok(e, k + " absent du registry");
    assert.equal(e.catalogue_status, "OPENED_WITHOUT_SCORE_LAB_VALIDATION", k);
    assert.equal(e.catalogue_decision.validation_claimed, false, k);
    assert.notEqual(e.score_status, "VALIDATED", k);
    assert.notEqual(e.player_status, "VALIDATED", k);
    assert.equal(e.score_runnable, false, k);
    assert.equal(e.player_runnable, false, k);
    assert.equal(e.live_eligible, false, k);
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
