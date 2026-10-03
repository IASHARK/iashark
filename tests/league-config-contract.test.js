"use strict";
// CONTRAT D'UNE COMPETITION (30/09/2026) : ajouter une competition = ajouter
// UNE ligne dans config/leagues.json, puis les textes que ce test reclame
// (pays et adjectif des pages championnat, pays de la liste de l'accueil).
// Ce test dit exactement ce qui manque, ligue par ligue, avant tout run.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const CFG = read("config/leagues.json");
const LEAGUES = CFG.leagues;
const SEO_DIRS = ["fr", "en", "gb", "za", "es", "mx", "de", "it", "pt"];
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const KINDS = ["national", "national2", "national3", "national4", "cup", "nations", "wcq", "ucl", "uel", "uecl", "mls"];
// Nature par defaut (scripts/seo-common.js#leagueKind) quand le champ kind manque.
const KIND_DEFAUT = { ldc: "ucl", el: "uel", ecl: "uecl", mls: "mls" };
const kindOf = (l) => l.kind || KIND_DEFAUT[l.key] || "national";
const MARKET_DIRS = Object.keys(read("config/markets.json")._dirs);

test("chaque competition : identite complete et unique", () => {
  const keys = new Set(), ids = new Set(), names = new Set();
  LEAGUES.forEach((l) => {
    assert.ok(/^[a-z0-9_]+$/.test(l.key), "cle : " + l.key);
    assert.ok(Number.isInteger(l.apiFootballId) && l.apiFootballId > 0, l.key + " apiFootballId");
    assert.ok(l.displayName && l.country, l.key + " displayName/country");
    assert.equal(typeof l.europeanQualification, "boolean", l.key);
    assert.ok(!keys.has(l.key), "cle en double " + l.key); keys.add(l.key);
    assert.ok(!ids.has(l.apiFootballId), "id en double " + l.apiFootballId); ids.add(l.apiFootballId);
    const slug = l.displayName.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
    assert.ok(!names.has(slug), "page championnat en collision : " + slug); names.add(slug);
    assert.ok(KINDS.includes(kindOf(l)), l.key + " kind inconnu " + l.kind);
    (l.seoMatchDirs || []).forEach((d) => assert.ok(MARKET_DIRS.includes(d), l.key + " version inconnue " + d));
    if (l.excludeRounds) assert.doesNotThrow(() => new RegExp(l.excludeRounds), l.key);
  });
});

test("chaque competition de l'extension : nom dans les 7 langues", () => {
  LEAGUES.filter((l) => l.groupe !== "socle" || l.names).forEach((l) => {
    assert.ok(l.names && typeof l.names === "object", l.key + " : names manquant");
    LOCALES.forEach((loc) => assert.ok(typeof l.names[loc] === "string" && l.names[loc].trim(), l.key + " : nom " + loc + " manquant"));
  });
});

test("pages championnat : pays, adjectif et texte de presentation dans les 9 versions", () => {
  SEO_DIRS.forEach((dir) => {
    const L = read("i18n/seo/" + dir + ".json").league;
    assert.ok(L.in_test && !/\d/.test(L.in_test), dir + " : phrase « en test » sans chiffre");
    LEAGUES.forEach((l) => {
      const k = kindOf(l);
      assert.ok(L.countries[l.key], dir + " : pays manquant pour " + l.key);
      assert.ok(L.about[k], dir + " : texte de presentation manquant pour la nature " + k);
      if (/\{adjective\}/.test(L.about[k])) assert.ok(L.adjectives[l.key], dir + " : adjectif manquant pour " + l.key);
    });
  });
});

test("liste de l'accueil : pays de chaque competition dans les 7 langues", () => {
  LOCALES.forEach((loc) => {
    const c = read("i18n/parts/homelist." + loc + ".json").home_list.country;
    LEAGUES.forEach((l) => assert.ok(c[l.key], loc + " : pays manquant pour " + l.key));
  });
});

test("fiabilite et budget : liste validee connue, budget borne", () => {
  const keys = LEAGUES.map((l) => l.key);
  assert.ok(Array.isArray(CFG.fiabilite.ligues_validees));
  CFG.fiabilite.ligues_validees.forEach((k) => assert.ok(keys.includes(k), k));
  // Aucune des 29 competitions ouvertes le 30/09/2026 n'est validee.
  LEAGUES.filter((l) => l.groupe === "extension" || l.key === "nations_league").forEach((l) => assert.ok(!CFG.fiabilite.ligues_validees.includes(l.key), l.key));
  const b = CFG.budgetExtension;
  assert.ok(Number.isInteger(b.maxMatchsParRun) && b.maxMatchsParRun >= 0 && b.maxMatchsParRun <= 150, "plafond borne (quota et duree du job)");
  assert.ok(b.minutesMaxDepuisDebut > 0 && b.minutesMaxDepuisDebut <= 240, "limite de temps sous les 6 h d'un job GitHub");
});

test("lib/league-names.js recopie config/leagues.json (noms et noms traduits)", () => {
  const LN = require("../lib/league-names.js");
  LEAGUES.forEach((l) => {
    assert.equal(LN.LEAGUES[l.key].id, l.apiFootballId, l.key);
    assert.equal(LN.displayName(l.key), l.displayName, l.key);
    if (l.names) LOCALES.forEach((loc) => assert.equal(LN.displayName(l.key, null, loc), l.names[loc], l.key + " " + loc));
  });
});
