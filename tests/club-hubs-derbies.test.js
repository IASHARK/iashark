"use strict";
// Affiches derby (scripts/build-club-hubs.js) :
// - Le Classique PSG-OM en fr ET en, ids api-football verifies (85, 81) ;
// - JSON-LD SportsEvent uniquement pour une prochaine confrontation reelle
//   (au plus un par affiche), message neutre sinon ;
// - title / meta sans formulation interdite ;
// - aucun champ premium (lib/premium-fields.js), meme si les donnees d'entree
//   d'un match non offert en contiennent ;
// - index data/derby-index.json (paire d'ids -> affiche par version).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BUILD = require(path.join(ROOT, "scripts/build-club-hubs.js"));
const RENDER = require(path.join(ROOT, "lib/club-hub-render.js"));
const PREMIUM = require(path.join(ROOT, "lib/premium-fields.js"));
const CFG = BUILD.loadConfig(ROOT);
const SITE = "https://iashark.com";

const FORBIDDEN_META = /prono\s*s[uû]rs?|\bgagnant(?:e|s|es)?\b|\bbonus\b|\bgaranti|\bsure\b|\bwinners?\b|\bganador(?:a|es|as)?\b|\bsegur[oa]s?\b/i;
const PREMIUM_KEYS = PREMIUM.PREMIUM_FIELDS.concat(PREMIUM.DEEP_PREMIUM_KEYS);

function decode(s) { return String(s).replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); }
function metaTexts(html) {
  var head = html.split("</head>")[0], out = [], re = /<title>([^<]*)<\/title>|<meta (?:name|property)="(?:description|og:title|og:description|twitter:title|twitter:description)" content="([^"]*)"/g, m;
  while ((m = re.exec(head))) out.push(decode(m[1] != null ? m[1] : m[2]));
  return out;
}
function ldBlocks(html) {
  var out = [], re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, m;
  while ((m = re.exec(html))) out.push(JSON.parse(m[1]));
  return out;
}
function events(html) { return ldBlocks(html).filter(function (o) { return o["@type"] === "SportsEvent"; }); }
function fixturesSection(html) {
  var i = html.indexOf('id="fixtures"'), j = html.indexOf('id="h2h"');
  return i === -1 || j === -1 ? "" : html.slice(i, j);
}
function premiumKeysIn(value, p, out) {
  out = out || [];
  if (Array.isArray(value)) value.forEach(function (x, i) { premiumKeysIn(x, p + "[" + i + "]", out); });
  else if (value && typeof value === "object") Object.keys(value).forEach(function (k) {
    if (PREMIUM_KEYS.indexOf(k) !== -1) out.push(p + "." + k);
    premiumKeysIn(value[k], p + "." + k, out);
  });
  return out;
}
function alternatesOf(html) {
  var out = {}, re = /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g, m;
  while ((m = re.exec(html))) out[m[1]] = m[2];
  return out;
}
function derbyPagesOnDisk() {
  var out = [];
  CFG.derbies.forEach(function (d) {
    if (d.active !== true) return;
    Object.keys(d.pages).forEach(function (dir) {
      var rel = RENDER.pagePath(dir, CFG.versions[dir], d.pages[dir].slug);
      var file = path.join(ROOT, rel.slice(1));
      if (fs.existsSync(file)) out.push({ key: d.key, dir: dir, rel: rel, html: fs.readFileSync(file, "utf8") });
    });
  });
  return out;
}
function assertCleanMeta(html, label) {
  var texts = metaTexts(html);
  assert.ok(texts.length >= 3, label + " : title et meta presents");
  texts.forEach(function (t) { assert.doesNotMatch(t, FORBIDDEN_META, label + " : formulation interdite dans « " + t + " »"); });
}
function assertNoPremium(html, label) {
  assert.equal(RENDER.findPremiumLeak(html), null, label + " : champ premium");
  var lds = ldBlocks(html);
  assert.deepEqual(premiumKeysIn(lds, "ld"), [], label + " : cle premium dans le JSON-LD");
  assert.deepEqual(PREMIUM.deepPremiumLeaks(lds), [], label + " : deepPremiumLeaks");
}

// ---------------------------------------------------------------------------
test("config : Le Classique en fr et en, ids api-football PSG 85 / OM 81", () => {
  var d = CFG.derbies.filter(function (x) { return x.key === "le-classique"; })[0];
  assert.ok(d, "derby le-classique");
  assert.equal(d.active, true);
  assert.equal(d.leagueKey, "ligue1");
  assert.equal(d.pages.fr.slug, "classique-psg-om");
  assert.equal(d.pages.en.slug, "le-classique");
  var club = function (k) { return CFG.clubs.filter(function (c) { return c.key === k; })[0]; };
  assert.deepEqual(d.teams.map(function (t) { return club(t.club).teamId; }), [85, 81]);
  assert.equal(club("psg").apiName, "Paris Saint Germain");
  assert.equal(club("marseille").apiName, "Marseille");
  assert.equal(d.teams[0].names.en, "Paris Saint-Germain");
  assert.equal(d.teams[1].names.en, "Marseille");
  assert.deepEqual(BUILD.validateConfig(CFG), []);
  [d.pages.fr, d.pages.en].forEach(function (p) {
    [p.title, p.description, p.h1].forEach(function (t) { assert.doesNotMatch(t, FORBIDDEN_META, t); });
    assert.doesNotMatch(p.intro, /\d+\s+(?:titres?|titles?|trophées|trophies|championnats|championships)/i, "aucun chiffre de palmares");
  });
});

test("ids verifies dans les donnees du depot (cache api-football)", { skip: !fs.existsSync(path.join(ROOT, "data/club-hubs/cache")) && "cache absent" }, () => {
  var dir = path.join(ROOT, "data/club-hubs/cache"), seen = {};
  fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f); }).forEach(function (f) {
    var e;
    try { e = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (err) { return; }
    if (e.endpoint === "/teams" && e.response && e.response[0] && e.response[0].team) seen[e.response[0].team.id] = e.response[0].team.name;
  });
  if (!seen[85] && !seen[81]) return; // cache sans ces equipes : rien a comparer
  assert.equal(seen[85], "Paris Saint Germain");
  assert.equal(seen[81], "Marseille");
});

test("toutes les affiches derby actives d'une version construite existent sur disque", { skip: derbyPagesOnDisk().length === 0 && "pages non generees" }, () => {
  var disk = {};
  derbyPagesOnDisk().forEach(function (p) { disk[p.rel] = true; });
  ["/fr/clubs/classique-psg-om.html", "/en/clubs/le-classique.html", "/fr/clubs/derby-du-nord-lens-lille.html", "/za/clubs/soweto-derby.html",
    "/gb/clubs/north-london-derby.html", "/gb/clubs/manchester-derby.html", "/gb/clubs/merseyside-derby.html", "/en/clubs/el-clasico.html",
    "/es/equipos/el-clasico-real-madrid-barcelona.html", "/es/equipos/superclasico-boca-river.html", "/mx/equipos/clasico-nacional-america-chivas.html"
  ].forEach(function (rel) { assert.ok(disk[rel], rel); });
  var fr = fs.readFileSync(path.join(ROOT, "fr/clubs/classique-psg-om.html"), "utf8");
  var en = fs.readFileSync(path.join(ROOT, "en/clubs/le-classique.html"), "utf8");
  // Groupe fr + en : x-default vers /en/ (config/markets.json#_hreflangXDefault).
  var both = { fr: SITE + "/fr/clubs/classique-psg-om.html", en: SITE + "/en/clubs/le-classique.html", "x-default": SITE + "/en/clubs/le-classique.html" };
  assert.deepEqual(alternatesOf(fr), both, "hreflang fr");
  assert.deepEqual(alternatesOf(en), both, "hreflang en");
  assert.match(en, /<html lang="en">/);
  assert.match(fs.readFileSync(path.join(ROOT, "en/clubs/index.html"), "utf8"), /href="\/en\/clubs\/le-classique\.html"/, "hub en : lien vers l'affiche");
});

test("affiches derby sur disque : SportsEvent seulement pour la prochaine confrontation affichee, meta conformes, aucun champ premium", { skip: derbyPagesOnDisk().length === 0 && "pages non generees" }, () => {
  derbyPagesOnDisk().forEach(function (p) {
    var ev = events(p.html), section = fixturesSection(p.html);
    assert.ok(section, p.rel + " : bloc prochaine confrontation");
    var times = [], re = /<time datetime="([^"]+)">/g, m;
    while ((m = re.exec(section))) times.push(m[1]);
    assert.equal(ev.length, times.length ? 1 : 0, p.rel + " : un SportsEvent si et seulement si un match est programme");
    if (ev.length) {
      var e = ev[0];
      assert.equal(e["@context"], "https://schema.org");
      assert.match(e.startDate, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, p.rel + " : startDate");
      assert.ok(!isNaN(Date.parse(e.startDate)), p.rel + " : startDate valide");
      assert.equal(e.startDate, times[0], p.rel + " : SportsEvent = premier match affiche");
      assert.ok(e.homeTeam && e.homeTeam["@type"] === "SportsTeam" && e.homeTeam.name, p.rel + " : homeTeam");
      assert.ok(e.awayTeam && e.awayTeam["@type"] === "SportsTeam" && e.awayTeam.name, p.rel + " : awayTeam");
      var txt = decode(section);
      assert.ok(txt.indexOf(e.homeTeam.name) !== -1 && txt.indexOf(e.awayTeam.name) !== -1, p.rel + " : equipes du SportsEvent affichees");
      if (e.location) assert.ok(e.location.name && txt.indexOf(e.location.name) !== -1, p.rel + " : lieu affiche");
    }
    assertCleanMeta(p.html, p.rel);
    assertNoPremium(p.html, p.rel);
  });
});

test("pages club/derby sur disque : title et meta sans formulation interdite", () => {
  Object.keys(CFG.versions).forEach(function (dir) {
    var folder = path.join(ROOT, dir, CFG.versions[dir].hubSlug);
    if (!fs.existsSync(folder)) return;
    fs.readdirSync(folder).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
      var html = fs.readFileSync(path.join(folder, f), "utf8");
      assertCleanMeta(html, dir + "/" + f);
      assertNoPremium(html, dir + "/" + f);
    });
  });
});

test("pages club/derby sur disque : probabilite estimee (conf) seulement pour le match offert de data-home.json", () => {
  var free = {};
  try { (JSON.parse(fs.readFileSync(path.join(ROOT, "data-home.json"), "utf8")).matchs || []).forEach(function (m) { if (m && m.is_free === true) free[String(m.id)] = true; }); } catch (e) { /* pas de donnees : aucun match offert */ }
  Object.keys(CFG.versions).forEach(function (dir) {
    var folder = path.join(ROOT, dir, CFG.versions[dir].hubSlug);
    if (!fs.existsSync(folder)) return;
    fs.readdirSync(folder).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
      var html = fs.readFileSync(path.join(folder, f), "utf8"), re = /<li>((?:(?!<\/li>)[\s\S])*?class="conf"(?:(?!<\/li>)[\s\S])*?)<\/li>/g, m;
      while ((m = re.exec(html))) {
        var id = (m[1].match(/match(?:\.html\?id=|\/)(\d+)/) || [])[1];
        assert.ok(id && free[id], dir + "/" + f + " : probabilite estimee affichee pour un match non offert (" + id + ")");
      }
    });
  });
});

test("data/derby-index.json : paire d'ids -> affiche existante par version", { skip: !fs.existsSync(path.join(ROOT, "data/derby-index.json")) && "index non genere" }, () => {
  var idx = JSON.parse(fs.readFileSync(path.join(ROOT, "data/derby-index.json"), "utf8"));
  var c = idx.pairs["81-85"];
  assert.ok(c, "Classique indexe sous 81-85");
  assert.equal(c.key, "le-classique");
  assert.equal(c.pages.fr.path, "/fr/clubs/classique-psg-om.html");
  assert.equal(c.pages.en.path, "/en/clubs/le-classique.html");
  Object.keys(idx.pairs).forEach(function (pair) {
    var ids = pair.split("-").map(Number);
    assert.ok(ids[0] < ids[1], pair + " : ids tries");
    Object.keys(idx.pairs[pair].pages).forEach(function (d) {
      assert.ok(fs.existsSync(path.join(ROOT, idx.pairs[pair].pages[d].path.slice(1))), pair + "/" + d + " : page absente");
    });
  });
});

// ---------------------------------------------------------------------------
// Construction sur donnees factices (aucun reseau, aucune cle).
function fakeClient(opts) {
  opts = opts || {};
  var names = { 85: "Paris Saint Germain", 81: "Marseille", 79: "Lille" };
  var fx = function (id, date, st, h, a, gh, ga, venue) {
    return { fixture: { id: id, date: date, status: { short: st }, venue: { name: venue || null } }, league: { id: 61, name: "Ligue 1", round: "Regular Season - 5" }, teams: { home: { id: h, name: names[h] }, away: { id: a, name: names[a] } }, goals: { home: gh, away: ga }, score: {} };
  };
  var next = opts.noNext ? [] : [fx(999201, "2099-01-01T20:00:00+00:00", "NS", 81, 85, null, null, "Stade Vélodrome"), fx(999202, "2099-03-01T20:00:00+00:00", "NS", 85, 81, null, null, "Parc des Princes")];
  var last = [fx(999200, "2098-11-01T20:00:00+00:00", "FT", 85, 81, 2, 1, "Parc des Princes")];
  var stats = { network: 0 };
  return {
    stats: stats,
    get: async function (endpoint, params) {
      stats.network++;
      var r = [];
      if (endpoint === "/leagues") r = [{ seasons: [{ year: 2098, current: true }] }];
      else if (endpoint === "/standings") r = [{ league: { name: "Ligue 1", season: 2098, standings: [[85, 81, 79].map(function (id, i) { return { rank: i + 1, team: { id: id, name: names[id] }, points: 12 - i, goalsDiff: 4 - i, group: "Ligue 1", all: { played: 5, win: 3, draw: 1, lose: 1, goals: { for: 9, against: 5 } } }; })] } }];
      else if (endpoint === "/teams") r = [{ team: { id: params.id, name: names[params.id], founded: 1970 }, venue: { name: "Stade", city: "Ville" } }];
      else if (endpoint === "/fixtures" && params.next) r = next;
      else if (endpoint === "/fixtures" && params.last) r = last;
      else if (endpoint === "/fixtures/headtohead" && params.last) r = last;
      else if (endpoint === "/fixtures/headtohead" && params.next) r = next;
      return { response: r, status: "OK", fetched_at: "2098-12-01T00:00:00Z" };
    }
  };
}

function tmpRoot(withPremiumMatch) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "club-hubs-derbies-"));
  var matchs = [];
  if (withPremiumMatch) {
    var m = { id: 999201, date: "2099-01-01 21:00", league: "Ligue 1", league_key: "ligue1", home: { n: "Marseille", id: 81 }, away: { n: "Paris Saint Germain", id: 85 }, conf: 6.2, is_free: false, model_output_available: true };
    PREMIUM.PREMIUM_FIELDS.forEach(function (f) { m[f] = "SENTINEL_" + f; });
    m.edge = 0.314159; m.kelly = 0.0271828; m.model_probability = 0.5772156;
    matchs.push(m);
  }
  fs.writeFileSync(path.join(dir, "data-home.json"), JSON.stringify({ generated_at: "2098-12-01T06:00:00Z", matchs: matchs }));
  return dir;
}

function classiqueConfig() {
  var cfg = JSON.parse(JSON.stringify(CFG));
  cfg.clubs = cfg.clubs.filter(function (c) { return c.key === "psg" || c.key === "marseille"; });
  cfg.derbies = cfg.derbies.filter(function (d) { return d.key === "le-classique"; });
  return cfg;
}

test("build : Classique fr+en, un seul SportsEvent pour la prochaine confrontation reelle, heure locale, aucun champ premium d'un match payant", async () => {
  var tmp = tmpRoot(true);
  try {
    var rep = await BUILD.buildClubHubs({ root: ROOT, dataRoot: tmp, outRoot: tmp, config: classiqueConfig(), dirs: ["fr", "en"], client: fakeClient(), now: new Date("2098-12-01T00:00:00Z"), today: "2098-12-01", write: true });
    var fr = rep.outputs["/fr/clubs/classique-psg-om.html"], en = rep.outputs["/en/clubs/le-classique.html"];
    assert.ok(fr, "affiche fr");
    assert.ok(en, "affiche en");
    [["fr", fr, "Olympique de Marseille", "21:00"], ["en", en, "Marseille", "20:00"]].forEach(function (c) {
      var ev = events(c[1]);
      assert.equal(ev.length, 1, c[0] + " : un seul SportsEvent malgre deux confrontations programmees");
      assert.equal(ev[0].startDate, "2099-01-01T20:00:00Z");
      assert.equal(ev[0].homeTeam.name, c[2]);
      assert.equal(ev[0].location.name, "Stade Vélodrome");
      assert.match(fixturesSection(c[1]), new RegExp(c[3]), c[0] + " : heure locale de la version");
      assert.match(fixturesSection(c[1]), /href="\/(fr|en)\/match\.html\?id=999201"/, c[0] + " : lien vers la page match");
      assertCleanMeta(c[1], c[0]);
      assertNoPremium(c[1], c[0]);
      PREMIUM.PREMIUM_FIELDS.forEach(function (f) { assert.ok(c[1].indexOf("SENTINEL_" + f) === -1, c[0] + " contient la valeur de " + f); });
      ["0.314159", "0.0271828", "0.5772156", "31.4", "57.7"].forEach(function (v) { assert.ok(c[1].indexOf(v) === -1, c[0] + " contient " + v); });
    });
    [fr, en].forEach(function (html) {
      assert.doesNotMatch(html, /class="conf"/, "match non offert : aucune probabilite estimee rendue");
      assert.ok(html.indexOf("6.2") === -1 && html.indexOf("6,2") === -1, "match non offert : valeur conf absente");
    });
    assert.match(en, /Paris Saint-Germain won 1, Marseille won 0, 0 drawn/, "noms de la version en (et non le nom api-football)");
    assert.deepEqual(alternatesOf(en), { fr: SITE + "/fr/clubs/classique-psg-om.html", en: SITE + "/en/clubs/le-classique.html", "x-default": SITE + "/en/clubs/le-classique.html" });
    assert.deepEqual(alternatesOf(fr), alternatesOf(en));
    Object.keys(rep.outputs).forEach(function (p) { assertNoPremium(rep.outputs[p], p); });
    var idx = JSON.parse(fs.readFileSync(path.join(tmp, "data/derby-index.json"), "utf8"));
    assert.deepEqual(idx.pairs["81-85"].pages, {
      en: { path: "/en/clubs/le-classique.html", name: "Le Classique", noindex: false },
      fr: { path: "/fr/clubs/classique-psg-om.html", name: "Le Classique", noindex: false }
    });
    // Reconstruction partielle (--dirs fr) : l'entree en est conservee.
    await BUILD.buildClubHubs({ root: ROOT, dataRoot: tmp, outRoot: tmp, config: classiqueConfig(), dirs: ["fr"], client: fakeClient(), now: new Date("2098-12-01T00:00:00Z"), today: "2098-12-01", write: true });
    var idx2 = JSON.parse(fs.readFileSync(path.join(tmp, "data/derby-index.json"), "utf8"));
    assert.deepEqual(Object.keys(idx2.pairs["81-85"].pages), ["en", "fr"]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("build : sans prochaine confrontation dans les donnees, message neutre et aucun SportsEvent invente", async () => {
  var tmp = tmpRoot(false);
  try {
    var rep = await BUILD.buildClubHubs({ root: ROOT, dataRoot: tmp, outRoot: tmp, config: classiqueConfig(), dirs: ["fr", "en"], client: fakeClient({ noNext: true }), now: new Date("2098-12-01T00:00:00Z"), today: "2098-12-01", write: false });
    [["fr", "/fr/clubs/classique-psg-om.html"], ["en", "/en/clubs/le-classique.html"]].forEach(function (c) {
      var html = rep.outputs[c[1]];
      var none = BUILD.loadLabels(ROOT, CFG.versions[c[0]]).next_meeting_none;
      assert.ok(decode(fixturesSection(html)).indexOf(none) !== -1, c[0] + " : message neutre");
      assert.equal(events(html).length, 0, c[0] + " : aucun SportsEvent");
      assert.doesNotMatch(fixturesSection(html), /<time /, c[0] + " : aucune date affichee");
      assert.match(html, /id="h2h"[\s\S]*2–1/, c[0] + " : historique des confrontations conserve");
      assertCleanMeta(html, c[0]);
      assertNoPremium(html, c[0]);
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
