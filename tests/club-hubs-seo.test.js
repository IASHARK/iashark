"use strict";
// Pages club / derby, volet SEO local (scripts/build-club-hubs.js) :
// - garde-fou premium aligne sur la liste unique lib/premium-fields.js ;
// - titles / descriptions uniques dans toute la configuration ;
// - clubs d'Amerique du Sud (/es/) : fuseau propre, competition presente ;
// - derby a classements separes (zones argentines) ;
// - canonical .html, hreflang seulement entre vrais equivalents ;
// - noindex + sortie du sitemap quand aucune donnee vivante.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BUILD = require(path.join(ROOT, "scripts/build-club-hubs.js"));
const DATA = require(path.join(ROOT, "lib/club-hub-data.js"));
const RENDER = require(path.join(ROOT, "lib/club-hub-render.js"));
const PREMIUM = require(path.join(ROOT, "lib/premium-fields.js"));
const LEAGUES = JSON.parse(fs.readFileSync(path.join(ROOT, "config/leagues.json"), "utf8")).leagues;
const CFG = BUILD.loadConfig(ROOT);

function activePages() {
  var out = [];
  CFG.clubs.concat(CFG.derbies).forEach(function (e) {
    if (e.active !== true) return;
    Object.keys(e.pages || {}).forEach(function (dir) { out.push({ key: e.key, dir: dir, entry: e, page: e.pages[dir] }); });
  });
  return out;
}

// ---------------------------------------------------------------------------
test("premium : chaque champ de lib/premium-fields.js est detecte comme cle JSON et attribut, sans faux positif", () => {
  PREMIUM.PREMIUM_FIELDS.concat(PREMIUM.DEEP_PREMIUM_KEYS).forEach(function (f) {
    assert.ok(RENDER.findPremiumLeak('{"' + f + '": 1}'), "cle JSON " + f);
    assert.ok(RENDER.findPremiumLeak('<div data-' + f + '="1">'), "attribut " + f);
  });
  var prose = "<p>Un club cutting-edge, la mise en place, un scénario, les scores récents, Lloyd Kelly, marche à suivre, val, hot, risque, contexte.</p>";
  assert.equal(RENDER.findPremiumLeak(prose), null);
});

test("config : titles, descriptions et slugs uniques, hubs compris", () => {
  var titles = {}, descs = {};
  activePages().forEach(function (p) {
    var id = p.key + "/" + p.dir;
    assert.ok(!titles[p.page.title], "title en double : " + p.page.title + " (" + id + ", " + titles[p.page.title] + ")");
    assert.ok(!descs[p.page.description], "description en double : " + id);
    titles[p.page.title] = id;
    descs[p.page.description] = id;
    assert.ok(p.page.description.length <= 170, id + " : description trop longue (" + p.page.description.length + ")");
  });
  Object.keys(CFG.versions).forEach(function (dir) {
    var h = CFG.versions[dir].hub;
    assert.ok(!titles[h.title], "title de hub en double : " + h.title);
    titles[h.title] = "hub/" + dir;
  });
});

test("config : clubs d'Amerique du Sud actifs dans /es/ avec fuseau local et competition reelle", () => {
  var keys = LEAGUES.map(function (l) { return l.key; });
  var expected = {
    "boca-juniors": "America/Argentina/Buenos_Aires", "river-plate": "America/Argentina/Buenos_Aires",
    "racing-club": "America/Argentina/Buenos_Aires", independiente: "America/Argentina/Buenos_Aires",
    "atletico-nacional": "America/Bogota", millonarios: "America/Bogota", "america-de-cali": "America/Bogota",
    "alianza-lima": "America/Lima", universitario: "America/Lima", "sporting-cristal": "America/Lima",
    "colo-colo": "America/Santiago", "universidad-de-chile": "America/Santiago"
  };
  Object.keys(expected).forEach(function (k) {
    var c = CFG.clubs.filter(function (x) { return x.key === k; })[0];
    assert.ok(c, k);
    assert.equal(c.active, true, k + " actif");
    assert.ok(keys.indexOf(c.leagueKey) !== -1, k + " : competition absente de config/leagues.json");
    assert.equal(c.pages.es.tz, expected[k], k + " : fuseau");
    assert.ok(c.pages.es.tz_label, k + " : libelle de fuseau");
    assert.deepEqual(Object.keys(c.pages), ["es"], k + " : page uniquement dans /es/");
  });
  // Afrique francophone : aucune page sur une competition absente.
  activePages().forEach(function (p) { assert.ok(keys.indexOf(p.entry.leagueKey) !== -1, p.key + " : " + p.entry.leagueKey); });
  var bad = JSON.parse(JSON.stringify(CFG));
  bad.clubs.filter(function (c) { return c.key === "boca-juniors"; })[0].pages.es.tz = "Mars/Olympus";
  assert.ok(BUILD.validateConfig(bad).some(function (e) { return /fuseau invalide/.test(e); }));
});

test("donnees : groupFor retient la phase la plus recente a egalite (Apertura puis Clausura)", () => {
  var row = function (id, rank) { return { rank: rank, teamId: id, name: "T" + id, played: 1, win: 1, draw: 0, lose: 0, gd: 1, points: 3 }; };
  var table = { league: "L", season: 2026, partial: false, groups: [
    { name: "Apertura - Group A", rows: [row(451, 2), row(1, 1)] },
    { name: "Apertura - Group B", rows: [row(435, 2), row(2, 1)] },
    { name: "Clausura - Group A", rows: [row(451, 5), row(1, 1)] },
    { name: "Clausura - Group B", rows: [row(435, 7), row(2, 1)] }
  ] };
  assert.equal(DATA.groupFor(table, [451]).name, "Clausura - Group A");
  assert.equal(DATA.groupFor(table, [435]).name, "Clausura - Group B");
  var both = DATA.groupFor(table, [451, 435]);
  assert.equal(both.containsAll, false);
});

// ---------------------------------------------------------------------------
// Client api-football factice : zones argentines et Liga.
function fakeClient(opts) {
  opts = opts || {};
  var names = { 451: "Boca Juniors", 435: "River Plate", 541: "Real Madrid", 529: "Barcelona" };
  var fx = function (id, date, st, h, a, gh, ga, league) {
    return { fixture: { id: id, date: date, status: { short: st }, venue: { name: "Estadio" } }, league: { name: league || "Liga Profesional Argentina", round: "Clausura - 10" }, teams: { home: { id: h, name: names[h] }, away: { id: a, name: names[a] } }, goals: { home: gh, away: ga }, score: {} };
  };
  var st = function (name, ids) { return ids.map(function (id, i) { return { rank: i + 1, team: { id: id, name: names[id] || "T" + id }, points: 20 - i, goalsDiff: 5 - i, group: name, all: { played: 9, win: 6, draw: 2, lose: 1, goals: { for: 12, against: 7 } } }; }); };
  var stats = { network: 0 };
  return {
    stats: stats,
    get: async function (endpoint, params) {
      stats.network++;
      if (opts.empty) return { response: [], status: "MISSING" };
      var r = [];
      if (endpoint === "/leagues") r = [{ seasons: [{ year: 2098, current: true }] }];
      else if (endpoint === "/standings" && params.league === 128) r = [{ league: { name: "Liga Profesional Argentina", season: 2098, standings: [st("Apertura - Group A", [9, 451]), st("Apertura - Group B", [8, 435]), st("Clausura - Group A", [7, 451]), st("Clausura - Group B", [6, 435])] } }];
      else if (endpoint === "/standings") r = [{ league: { name: "La Liga", season: 2098, standings: [st("La Liga", [541, 529])] } }];
      else if (endpoint === "/teams") r = [{ team: { id: params.id, name: names[params.id], founded: 1905 }, venue: { name: "Estadio", city: "Ciudad" } }];
      else if (endpoint === "/fixtures" && params.next) r = params.team === 541 || params.team === 529 ? [fx(999101, "2099-01-01T23:00:00+00:00", "NS", 541, 529, null, null, "La Liga")] : [fx(999001, "2099-01-01T23:00:00+00:00", "NS", 451, 435, null, null)];
      else if (endpoint === "/fixtures" && params.last) r = [fx(999000, "2098-11-01T20:00:00+00:00", "FT", 435, 451, 1, 2)];
      else if (endpoint === "/fixtures/headtohead" && params.last) r = [fx(999000, "2098-11-01T20:00:00+00:00", "FT", 435, 451, 1, 2)];
      return { response: r, status: "OK" };
    }
  };
}

function subsetConfig(clubKeys, derbyKeys) {
  var cfg = JSON.parse(JSON.stringify(CFG));
  cfg.clubs = cfg.clubs.filter(function (c) { return clubKeys.indexOf(c.key) !== -1; });
  cfg.derbies = cfg.derbies.filter(function (d) { return derbyKeys.indexOf(d.key) !== -1; });
  return cfg;
}

function tmpRoot() {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "club-hubs-seo-"));
  fs.writeFileSync(path.join(dir, "data-home.json"), JSON.stringify({ generated_at: "2098-12-01T06:00:00Z", matchs: [] }));
  return dir;
}

function canonicalOf(html) { return (html.match(/<link rel="canonical" href="([^"]+)">/) || [])[1]; }
function alternatesOf(html) {
  var out = {}, re = /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g, m;
  while ((m = re.exec(html))) out[m[1]] = m[2];
  return out;
}

test("build : Superclasico a zones separees, fuseau argentin, canonical .html, sans hreflang", async () => {
  var tmp = tmpRoot();
  try {
    var rep = await BUILD.buildClubHubs({ root: ROOT, dataRoot: tmp, outRoot: tmp, config: subsetConfig(["boca-juniors", "river-plate"], ["superclasico-argentino"]), dirs: ["es"], client: fakeClient(), now: new Date("2098-12-01T00:00:00Z"), today: "2098-12-01", write: true });
    var derby = rep.outputs["/es/equipos/superclasico-boca-river.html"];
    assert.ok(derby, "derby construit malgre les zones distinctes : " + JSON.stringify(rep.skipped));
    assert.equal((derby.match(/<table>/g) || []).length, 2, "une table par zone");
    assert.match(derby, /Clausura - Group A/);
    assert.match(derby, /Clausura - Group B/);
    assert.doesNotMatch(derby, /Apertura - Group/, "phase terminee non affichee");
    assert.match(derby, /Horarios en hora de Argentina/);
    assert.match(derby, /20:00/, "coup d'envoi 23:00 UTC affiche a 20:00 heure de Buenos Aires");
    assert.equal(canonicalOf(derby), "https://iashark.com/es/equipos/superclasico-boca-river.html");
    assert.deepEqual(alternatesOf(derby), {}, "page presente dans une seule version : pas de hreflang");
    var boca = rep.outputs["/es/equipos/boca-juniors.html"];
    assert.equal(canonicalOf(boca), "https://iashark.com/es/equipos/boca-juniors.html");
    assert.match(boca, /"@type":"SportsTeam"/);
    assert.match(boca, /"@type":"BreadcrumbList"/);
    assert.match(boca, /href="\/es\/equipos\/superclasico-boca-river\.html"/, "lien interne vers le derby");
    assert.match(boca, /href="\/es\/leagues\/liga-profesional-argentina\.html"/, "lien interne vers la ligue");
    assert.match(rep.outputs["/es/equipos/index.html"], /\(hora de Argentina\)/, "hub : fuseau precise par carte");
    Object.keys(rep.outputs).forEach(function (p) {
      assert.equal(RENDER.findPremiumLeak(rep.outputs[p]), null, p);
      assert.match(rep.outputs[p], /class="age"/, p + " : mention 18+");
    });
    var titles = rep.pages.map(function (p) { return p.title; });
    assert.equal(new Set(titles).size, titles.length, "titles uniques");
    assert.match(fs.readFileSync(path.join(tmp, "sitemap.xml"), "utf8"), /sitemap-clubs\.xml/, "index sitemap reference sitemap-clubs.xml");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("build : hreflang reciproques entre /en/ et /es/ pour un meme club, rien vers une version absente", async () => {
  var tmp = tmpRoot();
  try {
    var rep = await BUILD.buildClubHubs({ root: ROOT, dataRoot: tmp, outRoot: tmp, config: subsetConfig(["real-madrid", "barcelona"], []), dirs: ["en", "es"], client: fakeClient(), now: new Date("2098-12-01T00:00:00Z"), today: "2098-12-01", write: false });
    var en = rep.outputs["/en/clubs/real-madrid.html"], es = rep.outputs["/es/equipos/real-madrid.html"];
    assert.deepEqual(alternatesOf(en), { en: "https://iashark.com/en/clubs/real-madrid.html", es: "https://iashark.com/es/equipos/real-madrid.html" });
    assert.deepEqual(alternatesOf(es), alternatesOf(en));
    assert.deepEqual(alternatesOf(rep.outputs["/es/equipos/index.html"]), {}, "hubs de contenu different : pas de hreflang");
    assert.equal(canonicalOf(rep.outputs["/es/equipos/index.html"]), "https://iashark.com/es/equipos/");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("build : sans aucune donnee vivante, page noindex et absente du sitemap", async () => {
  var tmp = tmpRoot();
  try {
    var rep = await BUILD.buildClubHubs({ root: ROOT, dataRoot: tmp, outRoot: tmp, config: subsetConfig(["colo-colo"], []), dirs: ["es"], client: fakeClient({ empty: true }), now: new Date("2098-12-01T00:00:00Z"), today: "2098-12-01", write: true });
    var page = rep.outputs["/es/equipos/colo-colo.html"];
    assert.ok(RENDER.isNoindex(page), "noindex");
    assert.ok(RENDER.isNoindex(rep.outputs["/es/equipos/index.html"]), "hub noindex si toutes ses pages le sont");
    var sm = fs.readFileSync(path.join(tmp, "sitemap-clubs.xml"), "utf8");
    assert.equal((sm.match(/<url>/g) || []).length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
