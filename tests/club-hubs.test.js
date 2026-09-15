"use strict";
// Pages club / derby (scripts/build-club-hubs.js) :
// - configuration valide (intros 120-220 mots, slugs, references de derby) ;
// - aucune fuite de champ premium, meme quand les donnees d'entree en contiennent ;
// - pages generees reelles : HTML equilibre, un seul h1, JSON-LD valide,
//   canonical, liens internes resolus, 18+ et ressource d'aide, titres uniques,
//   poids limite, sitemap coherent ;
// - client api-football : cache, pas de mise en cache d'une erreur, repli stale.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BUILD = require(path.join(ROOT, "scripts/build-club-hubs.js"));
const DATA = require(path.join(ROOT, "lib/club-hub-data.js"));
const RENDER = require(path.join(ROOT, "lib/club-hub-render.js"));
const API = require(path.join(ROOT, "lib/club-hub-api.js"));
const SPLIT = require(path.join(ROOT, "lib/public-data-split.js"));
const LEAGUES = JSON.parse(fs.readFileSync(path.join(ROOT, "config/leagues.json"), "utf8")).leagues;

const CFG = BUILD.loadConfig(ROOT);
const MAX_PAGE_BYTES = 40 * 1024;

// ---------------------------------------------------------------------------
test("config : valide, intros 120-220 mots, LATAM inactif tant que sa competition est absente", () => {
  assert.deepEqual(BUILD.validateConfig(CFG), []);
  var leagueKeys = LEAGUES.map(function (l) { return l.key; });
  CFG.clubs.forEach(function (c) {
    if (c.active === true) {
      assert.ok(leagueKeys.indexOf(c.leagueKey) !== -1, c.key + " actif sur une competition absente");
      assert.ok(Array.isArray(c.sources) && c.sources.length, c.key + " sans source");
    }
    if (!c.leagueKey) assert.equal(c.active, false, c.key + " sans competition doit rester inactif");
  });
  var ids = CFG.clubs.map(function (c) { return c.teamId; });
  assert.equal(new Set(ids).size, ids.length, "teamId en double");
  ["mx", "za", "gb", "fr", "en", "es"].forEach(function (d) { assert.ok(CFG.versions[d], "version " + d); });
});

test("config : validateConfig refuse une intro trop courte et un slug en double", () => {
  var bad = JSON.parse(JSON.stringify(CFG));
  bad.clubs[0].pages.mx.intro = "Trop court.";
  bad.clubs[1].pages.mx.slug = bad.clubs[0].pages.mx.slug;
  var errs = BUILD.validateConfig(bad);
  assert.ok(errs.some(function (e) { return /intro de 2 mots/.test(e); }), errs.join("\n"));
  assert.ok(errs.some(function (e) { return /slug en double/.test(e); }), errs.join("\n"));
});

test("applyFacts : surcharge verifiee, null masque, capacite seulement si renseignee", () => {
  var info = { id: 1, name: "X", founded: 1919, venue: { name: "Old", city: "D.F.", capacity: 106187 } };
  var out = BUILD.applyFacts(info, { founded: null, stadium: "New", capacity: 50000 });
  assert.equal(out.founded, null);
  assert.equal(out.venue.name, "New");
  assert.equal(out.venue.city, "D.F.");
  assert.equal(out.venue.capacity, 50000);
  assert.equal(BUILD.applyFacts(info, null).venue.capacity, null);
  assert.equal(info.venue.capacity, 106187, "l'objet source n'est pas modifie");
});

// ---------------------------------------------------------------------------
test("donnees : upcomingFor fusionne api-football et IASHARK, h2h exclut les amicaux", () => {
  var now = new Date("2026-09-14T00:00:00Z");
  var api = [
    DATA.normalizeFixture({ fixture: { id: 10, date: "2026-09-20T03:00:00+00:00", status: { short: "NS" }, venue: { name: "Estadio Banorte" } }, league: { id: 262, name: "Liga MX", round: "Apertura - 9" }, teams: { home: { id: 2287, name: "Club America" }, away: { id: 2278, name: "Guadalajara Chivas" } }, goals: { home: null, away: null } }),
    DATA.normalizeFixture({ fixture: { id: 11, date: "2026-09-01T03:00:00+00:00", status: { short: "FT" } }, league: { name: "Liga MX" }, teams: { home: { id: 2287 }, away: { id: 2278 } }, goals: { home: 2, away: 1 } }),
    DATA.normalizeFixture({ fixture: { id: 12, date: "2026-08-01T03:00:00+00:00", status: { short: "FT" } }, league: { name: "Friendlies Clubs" }, teams: { home: { id: 2278 }, away: { id: 2287 } }, goals: { home: 0, away: 0 } })
  ];
  var pub = [DATA.publicMatch({ id: 10, date: "2026-09-20 05:00", league: "Liga MX", home: { n: "Club America", id: 2287 }, away: { n: "Guadalajara Chivas", id: 2278 }, conf: 6.4, is_free: true })];
  assert.equal(DATA.publicMatch({ id: 11, date: "2026-09-20 05:00", home: { n: "A", id: 1 }, away: { n: "B", id: 2 }, conf: 6.4, is_free: false }).conf, null, "conf jamais lu pour un match non offert");
  assert.equal(DATA.publicMatch({ id: 12, date: "2026-09-20 05:00", home: { n: "A", id: 1 }, away: { n: "B", id: 2 }, conf: 6.4 }).conf, null, "is_free absent = non offert");
  var up = DATA.upcomingFor([2287, 2278], api, pub, now, { both: true });
  assert.equal(up.length, 1);
  assert.equal(up[0].analysis.conf, 6.4);
  assert.equal(up[0].venue, "Estadio Banorte");
  var h = DATA.h2hResults(api, 2287, 2278, 6);
  assert.equal(h.items.length, 1);
  assert.deepEqual(h.summary, { n: 1, winsA: 1, winsB: 0, draws: 0 });
  assert.equal(DATA.recentResults(api, 2278, 5)[0].result, "L");
});

test("donnees : publicMatch ne recopie que la liste blanche (aucun champ premium)", () => {
  var m = { id: 5, date: "2026-09-14 21:00", league: "Premier League", league_key: "premier", home: { n: "A", id: 1 }, away: { n: "B", id: 2 }, conf: 7, is_free: true };
  SPLIT.PREMIUM_FIELDS.forEach(function (f) { m[f] = "SENTINEL_" + f; });
  var out = JSON.stringify(DATA.publicMatch(m));
  SPLIT.PREMIUM_FIELDS.forEach(function (f) { assert.ok(out.indexOf("SENTINEL_" + f) === -1, f); });
});

test("rendu : findPremiumLeak detecte les champs premium sans faux positif sur des mots courants", () => {
  assert.equal(RENDER.findPremiumLeak('{"pari_rec":"x"}'), "pari_rec");
  assert.ok(RENDER.findPremiumLeak('{"edge": 0.1}'));
  assert.equal(RENDER.findPremiumLeak("<p>A cutting-edge club, knowledge, marche a suivre, Lloyd Kelly</p>"), null);
});

// ---------------------------------------------------------------------------
// Construction complete sur des donnees factices contenant des champs premium.
function fakeClient() {
  var fx = function (id, date, st, h, a, gh, ga, league) {
    return { fixture: { id: id, date: date, status: { short: st }, venue: { name: "Emirates Stadium", city: "London" } }, league: { id: 39, name: league || "Premier League", round: "Regular Season - 5" }, teams: { home: { id: h, name: h === 42 ? "Arsenal" : "Tottenham" }, away: { id: a, name: a === 42 ? "Arsenal" : "Tottenham" } }, goals: { home: gh, away: ga }, score: {} };
  };
  var table = [{ league: { name: "Premier League", season: 2098, standings: [[42, 47, 49].map(function (id, i) { return { rank: i + 1, team: { id: id, name: "T" + id }, points: 10 - i, goalsDiff: 3 - i, group: "Premier League", all: { played: 4, win: 3, draw: 1, lose: 0, goals: { for: 8, against: 2 } } }; })] } }];
  var stats = { network: 0 };
  return {
    stats: stats,
    get: async function (endpoint, params) {
      stats.network++;
      var r = [];
      if (endpoint === "/leagues") r = [{ seasons: [{ year: 2098, current: true }] }];
      else if (endpoint === "/standings") r = table;
      else if (endpoint === "/teams") r = [{ team: { id: params.id, name: "Team " + params.id, logo: "https://media.api-sports.io/football/teams/" + params.id + ".png", founded: 1886 }, venue: { name: "Stadium", city: "London", capacity: 60000 } }];
      else if (endpoint === "/fixtures" && params.next) r = [fx(999001, "2099-01-01T20:00:00+00:00", "NS", 42, 47)];
      else if (endpoint === "/fixtures" && params.last) r = [fx(999000, "2098-11-01T20:00:00+00:00", "FT", 47, 42, 1, 2)];
      else if (endpoint === "/fixtures/headtohead" && params.last) r = [fx(999000, "2098-11-01T20:00:00+00:00", "FT", 47, 42, 1, 2), fx(998999, "2098-07-01T20:00:00+00:00", "FT", 42, 47, 0, 0, "Friendlies Clubs")];
      return { response: r, status: "OK", fetched_at: "2098-12-01T00:00:00Z" };
    }
  };
}

function tmpRootWithPremiumData(isFree) {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "club-hubs-"));
  var m = { id: 999001, date: "2099-01-01 21:00", league: "Premier League", league_key: "premier", home: { n: "Arsenal", id: 42 }, away: { n: "Tottenham", id: 47 }, conf: 7.4, is_free: isFree, model_output_available: true };
  SPLIT.PREMIUM_FIELDS.forEach(function (f) { m[f] = "SENTINEL_" + f; });
  // conf est premium (15/09/2026) : valeur reelle, lisible seulement sur le match offert.
  m.conf = 7.4;
  m.edge = 0.123456; m.kelly = 0.0789123; m.model_probability = 0.6180339;
  fs.writeFileSync(path.join(dir, "data-home.json"), JSON.stringify({ generated_at: "2098-12-01T06:00:00Z", matchs: [m] }));
  return dir;
}

function gbOnlyConfig() {
  var cfg = JSON.parse(JSON.stringify(CFG));
  cfg.clubs = cfg.clubs.filter(function (c) { return c.key === "arsenal" || c.key === "tottenham"; });
  cfg.derbies = cfg.derbies.filter(function (d) { return d.key === "north-london-derby"; });
  return cfg;
}

[false, true].forEach(function (isFree) {
  test("build : aucune fuite premium dans les pages (match " + (isFree ? "offert" : "payant") + "), aucune note ni probabilite", async () => {
    var tmp = tmpRootWithPremiumData(isFree);
    try {
      var rep = await BUILD.buildClubHubs({ root: ROOT, dataRoot: tmp, outRoot: tmp, config: gbOnlyConfig(), dirs: ["gb"], client: fakeClient(), now: new Date("2098-12-01T00:00:00Z"), today: "2098-12-01", write: true });
      var paths = Object.keys(rep.outputs).sort();
      assert.deepEqual(paths, ["/gb/clubs/arsenal.html", "/gb/clubs/index.html", "/gb/clubs/north-london-derby.html", "/gb/clubs/tottenham-hotspur.html"]);
      paths.forEach(function (p) {
        var html = rep.outputs[p];
        SPLIT.PREMIUM_FIELDS.forEach(function (f) { assert.ok(html.indexOf("SENTINEL_" + f) === -1, p + " contient la valeur de " + f); });
        ["0.123456", "0.0789123", "0.6180339", "12.3", "61.8"].forEach(function (v) { assert.ok(html.indexOf(v) === -1, p + " contient " + v); });
        assert.equal(RENDER.findPremiumLeak(html), null, p);
      });
      var arsenal = rep.outputs["/gb/clubs/arsenal.html"];
      // Decision du 16/09/2026 : aucune note sur 10 ni probabilite sur ces pages, meme
      // pour le match offert. Un match analyse porte seulement « Analysis available » + lien.
      assert.doesNotMatch(arsenal, /class="conf"|\/10\b/, "aucun chiffre du modele (match " + (isFree ? "offert" : "payant") + ")");
      assert.ok(arsenal.indexOf("7.4") === -1 && arsenal.indexOf("7,4") === -1, "valeur conf absente (match " + (isFree ? "offert" : "payant") + ")");
      assert.match(arsenal, /<a class="fxc" href="\/gb\/match\.html\?id=999001">[\s\S]*?<span class="pill-ok">Analysis available<\/span>/, "match analyse : pastille « Analysis available » dans la carte liee");
      assert.match(arsenal, /href="\/gb\/match\.html\?id=999001"/);
      assert.match(arsenal, /"@type":"SportsEvent"/);
      var derby = rep.outputs["/gb/clubs/north-london-derby.html"];
      assert.match(derby, /Last 1 competitive meetings: Arsenal won 1, Tottenham Hotspur won 0, 0 drawn\./);
      // Ecriture reelle dans le dossier temporaire : sitemap + idempotence.
      var sm = fs.readFileSync(path.join(tmp, "sitemap-clubs.xml"), "utf8");
      assert.equal((sm.match(/<url>/g) || []).length, 4);
      assert.match(sm, /<loc>https:\/\/iashark\.com\/gb\/clubs\/<\/loc><lastmod>2098-12-01<\/lastmod>/);
      var again = await BUILD.buildClubHubs({ root: ROOT, dataRoot: tmp, outRoot: tmp, config: gbOnlyConfig(), dirs: ["gb"], client: fakeClient(), now: new Date("2098-12-01T00:00:00Z"), today: "2098-12-02", write: true });
      assert.equal(again.written, 0, "deuxieme passage identique : aucune ecriture");
      assert.match(fs.readFileSync(path.join(tmp, "sitemap-clubs.xml"), "utf8"), /<lastmod>2098-12-01<\/lastmod>/, "lastmod conserve quand le contenu ne change pas");
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

test("build : un derby dont un club n'est pas dans le classement est ignore", async () => {
  var tmp = tmpRootWithPremiumData(false);
  try {
    var cfg = gbOnlyConfig();
    cfg.derbies[0].teams[1] = { teamId: 12345, names: { gb: "Other" } };
    var rep = await BUILD.buildClubHubs({ root: ROOT, dataRoot: tmp, outRoot: tmp, config: cfg, dirs: ["gb"], client: fakeClient(), now: new Date("2098-12-01T00:00:00Z"), write: false });
    assert.ok(!rep.outputs["/gb/clubs/north-london-derby.html"]);
    assert.ok(rep.skipped.some(function (s) { return s.key === "north-london-derby" && /meme classement/.test(s.reason); }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Pages reelles generees dans le depot.
var VOID = { area: 1, base: 1, br: 1, col: 1, embed: 1, hr: 1, img: 1, input: 1, link: 1, meta: 1, source: 1, track: 1, wbr: 1 };
function htmlBalanceErrors(html) {
  var src = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "<script></script>").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "<style></style>").replace(/<!--[\s\S]*?-->/g, "").replace(/<!DOCTYPE[^>]*>/i, "");
  var stack = [], errors = [], re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g, m;
  while ((m = re.exec(src))) {
    var tag = m[2].toLowerCase();
    if (VOID[tag]) continue;
    if (!m[1]) { stack.push(tag); continue; }
    var top = stack.pop();
    if (top !== tag) { errors.push("</" + tag + "> ferme <" + top + ">"); break; }
  }
  if (stack.length && !errors.length) errors.push("non fermes : " + stack.join(","));
  return errors;
}

function generatedPages() {
  var out = [];
  Object.keys(CFG.versions).forEach(function (dir) {
    var rel = dir + "/" + CFG.versions[dir].hubSlug;
    var abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) return;
    fs.readdirSync(abs).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
      out.push({ rel: rel + "/" + f, url: "https://iashark.com/" + rel + "/" + (f === "index.html" ? "" : f), html: fs.readFileSync(path.join(abs, f), "utf8") });
    });
  });
  return out;
}

function resolves(href) {
  var p = href.split("#")[0].split("?")[0];
  if (!p) return true;
  if (p.endsWith("/")) p += "index.html";
  return fs.existsSync(path.join(ROOT, p.slice(1)));
}

test("pages generees : HTML, h1, JSON-LD, canonical, liens, conformite, poids, titres uniques", { skip: generatedPages().length === 0 && "pages non generees" }, () => {
  var pages = generatedPages();
  var titles = {};
  pages.forEach(function (pg) {
    var html = pg.html;
    assert.deepEqual(htmlBalanceErrors(html), [], pg.rel);
    assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, pg.rel + " : un seul h1");
    assert.ok(html.indexOf('<link rel="canonical" href="' + pg.url + '">') !== -1, pg.rel + " : canonical");
    var lds = [], re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g, m;
    while ((m = re.exec(html))) lds.push(JSON.parse(m[1]));
    assert.ok(lds.some(function (o) { return o["@type"] === "BreadcrumbList"; }), pg.rel + " : BreadcrumbList");
    if (!/\/index\.html$/.test(pg.rel)) {
      var types = JSON.stringify(lds);
      assert.ok(/"@type":"SportsTeam"/.test(types), pg.rel + " : SportsTeam");
    }
    var hrefs = [], hre = /(?:href|src)="([^"]+)"/g;
    while ((m = hre.exec(html))) hrefs.push(m[1]);
    hrefs.filter(function (h) { return h[0] === "/" && h[1] !== "/"; }).forEach(function (h) { assert.ok(resolves(h), pg.rel + " : lien casse " + h); });
    hrefs.filter(function (h) { return /^https:\/\/iashark\.com\//.test(h); }).forEach(function (h) { assert.ok(resolves(h.slice("https://iashark.com".length)), pg.rel + " : URL absolue sans fichier " + h); });
    assert.equal(RENDER.findPremiumLeak(html), null, pg.rel + " : champ premium");
    assert.match(html, /18/, pg.rel + " : mention 18+");
    assert.match(html, /class="age"/, pg.rel + " : bandeau 18+");
    assert.match(html, /data-market-helpline/, pg.rel + " : ressource d'aide");
    assert.match(html, /bottom-navigation\.js/, pg.rel + " : navigation basse");
    assert.ok(Buffer.byteLength(html) < MAX_PAGE_BYTES, pg.rel + " : " + Buffer.byteLength(html) + " octets");
    var t = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
    assert.ok(t, pg.rel + " : title");
    assert.ok(!titles[t], "titre en double : " + t + " (" + pg.rel + ", " + titles[t] + ")");
    titles[t] = pg.rel;
  });
});

test("pages generees : hreflang reciproques uniquement entre vrais equivalents", { skip: generatedPages().length === 0 && "pages non generees" }, () => {
  var byUrl = {};
  generatedPages().forEach(function (pg) { byUrl[pg.url] = pg.html; });
  Object.keys(byUrl).forEach(function (url) {
    var alts = [], re = /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g, m;
    while ((m = re.exec(byUrl[url]))) alts.push(m[2]);
    if (!alts.length) return;
    assert.ok(alts.indexOf(url) !== -1, url + " : hreflang sans auto-reference");
    alts.forEach(function (a) {
      assert.ok(byUrl[a], url + " : hreflang vers une page absente " + a);
      assert.ok(byUrl[a].indexOf('href="' + url + '"') !== -1, a + " ne renvoie pas vers " + url);
    });
  });
});

test("sitemap-clubs.xml : URLs existantes, indexables, lastmod au format date", { skip: !fs.existsSync(path.join(ROOT, "sitemap-clubs.xml")) && "sitemap non genere" }, () => {
  var xml = fs.readFileSync(path.join(ROOT, "sitemap-clubs.xml"), "utf8");
  var urls = [], re = /<url><loc>([^<]+)<\/loc><lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod><\/url>/g, m;
  while ((m = re.exec(xml))) urls.push(m[1]);
  assert.equal(urls.length, (xml.match(/<url>/g) || []).length, "chaque URL a un lastmod valide");
  assert.ok(urls.length > 0);
  urls.forEach(function (u) {
    var rel = u.slice("https://iashark.com/".length);
    var file = path.join(ROOT, rel.endsWith("/") ? rel + "index.html" : rel);
    assert.ok(fs.existsSync(file), u);
    assert.ok(!RENDER.isNoindex(fs.readFileSync(file, "utf8")), u + " est noindex");
  });
});

// ---------------------------------------------------------------------------
test("client api-football : cache, erreur jamais mise en cache, repli sur la derniere reponse valide", async () => {
  var dir = fs.mkdtempSync(path.join(os.tmpdir(), "club-hubs-cache-"));
  try {
    var calls = 0, mode = "ok", clock = Date.parse("2026-09-14T00:00:00Z");
    var fetchImpl = async function () {
      calls++;
      return mode === "ok" ? { errors: [], response: [{ n: calls }] } : { errors: { requests: "You have reached the request limit for the day" }, response: [] };
    };
    var mk = function () { return API.createClient({ cacheDir: dir, key: "test-key", now: function () { return clock; }, fetchImpl: fetchImpl }); };
    var r1 = await mk().get("/standings", { league: 39, season: 2026 });
    assert.equal(r1.status, "OK");
    var r2 = await mk().get("/standings", { league: 39, season: 2026 });
    assert.equal(r2.status, "CACHE");
    assert.equal(calls, 1);
    clock += API.ttlFor("/standings") + 1;
    mode = "quota";
    var r3 = await mk().get("/standings", { league: 39, season: 2026 });
    assert.equal(r3.status, "STALE");
    assert.deepEqual(r3.response, [{ n: 1 }]);
    var cached = JSON.parse(fs.readFileSync(path.join(dir, API.cacheKey("/standings", { league: 39, season: 2026 }) + ".json"), "utf8"));
    assert.deepEqual(cached.response, [{ n: 1 }], "la reponse en erreur n'ecrase pas le cache");
    assert.ok(JSON.stringify(cached).indexOf("test-key") === -1, "la cle n'est jamais ecrite");
    var r4 = await mk().get("/teams", { id: 1 });
    assert.equal(r4.status, "MISSING");
    var off = await API.createClient({ cacheDir: dir, key: "", fetchImpl: fetchImpl }).get("/teams", { id: 2 });
    assert.equal(off.status, "MISSING");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
