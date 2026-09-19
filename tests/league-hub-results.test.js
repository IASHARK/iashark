"use strict";
// Hub ligue, bloc « Derniers resultats » (scripts/league-hub-data.js#collect).
// 19/09/2026 : une journee d'Europa League compte 18 matchs sur deux soirs ;
// avec un plafond fixe de 10 resultats, les pages des 8 matchs du premier soir
// n'avaient plus aucun lien entrant alors qu'elles restent indexables jusqu'a
// J+7 (tests/internal-links.test.js : pages inaccessibles depuis /fr/).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const HUBDATA = require("../scripts/league-hub-data.js");
const LIFECYCLE = require("../scripts/match-lifecycle.js");

const DAY = 24 * 3600 * 1000;
const NOW = new Date("2026-09-19T12:00:00Z");

// Racine temporaire : une page match/<id>.html par entree du registre.
function fixture(kickoffs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hub-results-"));
  fs.mkdirSync(path.join(root, "match"));
  const reg = { matches: {} };
  kickoffs.forEach(function (k, i) {
    const id = String(900000 + i);
    fs.writeFileSync(path.join(root, "match", id + ".html"), "<!doctype html>");
    reg.matches[id] = { id: id, league_key: "el", kickoff: new Date(k).toISOString(), status: "archived", snapshot: { home: { id: i + 1, n: "Home " + i }, away: { id: i + 101, n: "Away " + i } } };
  });
  return { root: root, reg: reg };
}

function collect(kickoffs) {
  const f = fixture(kickoffs);
  try {
    return HUBDATA.collect("el", "fr", { root: f.root, now: NOW, registry: f.reg, store: { leagues: {} } }).results;
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
}

test("journee europeenne de 18 matchs : chaque page encore indexable garde un lien depuis le hub", () => {
  const kickoffs = [];
  for (let i = 0; i < 18; i++) kickoffs.push(NOW.getTime() - (i < 9 ? 3 : 2) * DAY + i * 60000);
  const results = collect(kickoffs);
  assert.equal(results.length, 18);
  assert.ok(results.every(function (e) { return e.href; }));
});

test("au-dela du plafond, les pages deja en noindex ne sont plus listees", () => {
  const kickoffs = [];
  for (let i = 0; i < 10; i++) kickoffs.push(NOW.getTime() - 1 * DAY + i * 60000);
  for (let i = 0; i < 5; i++) kickoffs.push(NOW.getTime() - (LIFECYCLE.NOINDEX_AFTER_DAYS + 2) * DAY + i * 60000);
  const results = collect(kickoffs);
  assert.equal(results.length, 10);
  assert.ok(results.every(function (e) { return e.t >= NOW.getTime() - 2 * DAY; }));
});
