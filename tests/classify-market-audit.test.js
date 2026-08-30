"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classifyMappedRegistryEntry } = require("../scripts/classify-market-audit.js");

function fakeEntry(id, status) {
  return { id: id, availability_status: status };
}

test("classifyMappedRegistryEntry: modele + cote reelle observee -> MODEL_AND_ODDS", () => {
  var entry = fakeEntry("MATCH_WINNER", "MODELLED_AND_VALIDATED");
  var mapping = { betIds: [1], note: "test" };
  var observed = { 1: { market_name_api: "Match Winner", real_frequency: 1, bookmaker_count: 12 } };
  var r = classifyMappedRegistryEntry(entry, mapping, observed);
  assert.equal(r.classification, "MODEL_AND_ODDS");
});

test("classifyMappedRegistryEntry: modele mais aucune cote observee -> MODEL_SUPPORTED (jamais NOT_AVAILABLE si on a un modele)", () => {
  var entry = fakeEntry("GOAL_BANDS", "MODELLED_EXPERIMENTAL");
  var mapping = { betIds: [], note: "aucun bet type equivalent" };
  var observed = {};
  var r = classifyMappedRegistryEntry(entry, mapping, observed);
  assert.equal(r.classification, "MODEL_SUPPORTED");
});

test("classifyMappedRegistryEntry: pas de modele mais cote reellement observee -> ODDS_AVAILABLE_ONLY (jamais de proba IASHARK)", () => {
  var entry = fakeEntry("CORNERS", "NOT_SUPPORTED");
  var mapping = { betIds: [45], note: "test" };
  var observed = { 45: { market_name_api: "Corners Over Under", real_frequency: 1, bookmaker_count: 9 } };
  var r = classifyMappedRegistryEntry(entry, mapping, observed);
  assert.equal(r.classification, "ODDS_AVAILABLE_ONLY");
});

test("classifyMappedRegistryEntry: ni modele ni cote -> NOT_AVAILABLE", () => {
  var entry = fakeEntry("SOME_UNMAPPED_MARKET", "NOT_SUPPORTED");
  var mapping = { betIds: [], note: "aucune correspondance" };
  var observed = {};
  var r = classifyMappedRegistryEntry(entry, mapping, observed);
  assert.equal(r.classification, "NOT_AVAILABLE");
});

test("classifyMappedRegistryEntry: plusieurs bet_id mappes -> prend la frequence/bookmaker max observes, pas la moyenne", () => {
  var entry = fakeEntry("WIN_TO_NIL", "MODELLED_EXPERIMENTAL");
  var mapping = { betIds: [36, 29, 30], note: "test" };
  var observed = {
    36: { market_name_api: "Win To Nil", real_frequency: 1, bookmaker_count: 3 },
    29: { market_name_api: "Win to Nil - Home", real_frequency: 0.5, bookmaker_count: 2 },
  };
  var r = classifyMappedRegistryEntry(entry, mapping, observed);
  assert.equal(r.classification, "MODEL_AND_ODDS");
  assert.equal(r.real_frequency_max, 1);
  assert.equal(r.bookmaker_count_max, 3);
});

test("classifyMappedRegistryEntry: jamais MODEL_AND_ODDS sans modele reel, meme avec une cote tres frequente (regle §8 explicite)", () => {
  var entry = fakeEntry("HALF_TIME_MARKETS", "NOT_SUPPORTED");
  var mapping = { betIds: [13], note: "test" };
  var observed = { 13: { market_name_api: "First Half Winner", real_frequency: 1, bookmaker_count: 13 } };
  var r = classifyMappedRegistryEntry(entry, mapping, observed);
  assert.notEqual(r.classification, "MODEL_AND_ODDS");
  assert.equal(r.classification, "ODDS_AVAILABLE_ONLY");
});
