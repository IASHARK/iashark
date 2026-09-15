"use strict";
// Pages SEO statiques (scripts/seo-pages.js), textes par repertoire
// (i18n/seo/<dir>.json), lastmod exact (scripts/seo-lastmod.js) et leur
// branchement dans le pipeline quotidien.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const SEO = require("../scripts/seo-pages.js");
const C = require("../scripts/seo-common.js");
const LASTMOD = require("../scripts/seo-lastmod.js");
const SPLIT = require("../lib/public-data-split.js");
const { writeSitemapIndex } = require("../scripts/i18n-sitemaps.js");
const DIRS = C.DIR_CODES;
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TPL = read("match.html");

function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
function head(html) { return html.split(/<\/head>/i)[0]; }
function alternates(html) {
  return [...head(html).matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => ({ hl: m[1], href: m[2] }));
}

const MATCH = {
  id: 424242, league_key: "premier", league: "Premier League", date: "2026-09-19 21:00",
  home: { n: "Arsenal", id: 42 }, away: { n: "Chelsea", id: 49 },
  stade: { nom: "Emirates Stadium" }, model_output_available: true, data_quality_score: 80, conf: 7,
  p1: 51, pn: 25, p2: 24, is_free: false,
  // Faits publics (forme, confrontations) : contenu propre au-dessus de
  // SEO.MIN_INDEXABLE_WORDS, page indexable.
  form_home: [1, 2, 3, 4, 5].map((i) => ({ d: "2026-09-0" + i, opponent: "Opponent " + i, score: "2-1", result: "W", home: true })),
  form_away: [1, 2, 3, 4, 5].map((i) => ({ d: "2026-09-0" + i, opponent: "Rival " + i, score: "0-1", result: "L", home: false })),
  h2h: ["2026-03-01", "2025-10-04", "2025-03-15", "2024-09-21", "2024-04-06"].map((d, i) => ({ d, home: i % 2 ? "Arsenal" : "Chelsea", away: i % 2 ? "Chelsea" : "Arsenal", s: "1-" + i }))
};

test("i18n/seo : un fichier par repertoire public, memes cles, meta des pages du sitemap", () => {
  const pages = require("../scripts/i18n-manifest.js").filter((p) => !p.noSitemap).map((p) => p.file.replace(/\.html$/, ""));
  const shape = (o, prefix) => Object.keys(o).filter((k) => k !== "overrides" && k !== "_readme").sort().flatMap((k) =>
    o[k] && typeof o[k] === "object" && !Array.isArray(o[k]) ? shape(o[k], prefix + k + ".") : [prefix + k]);
  let ref = null;
  for (const d of DIRS) {
    const s = C.seoConf(d);
    for (const p of pages) assert.ok(s.meta[p] && s.meta[p].title && s.meta[p].description, d + " : meta." + p + " manquant");
    const keys = shape(s, "");
    if (!ref) ref = keys; else assert.deepEqual(keys, ref, d + " : cles differentes de fr");
    assert.ok(new Intl.DateTimeFormat("en", { timeZone: s.tz }), d + " : fuseau invalide");
  }
});

test("i18n/seo : aucune promesse de gain ni incitation a parier", () => {
  const banned = /guarantee[ds]? (win|profit)|sure bets?|bet now|garanti[es]* (de )?gain|gains? assur|apuesta segura|apuesta ya|pronóstico seguro|sichere tipps|jetzt wetten|vincita garantita|scommetti ora|aposta segura|aposte já/i;
  for (const d of DIRS) assert.doesNotMatch(read("i18n/seo/" + d + ".json"), banned, d);
});

test("page match localisee : langue, canonical, hreflang des versions generees, JSON-LD valide", () => {
  const html = SEO.renderMatchPage(TPL, MATCH, "gb");
  assert.match(html, /<html[^>]*\slang="en-GB"/);
  assert.match(head(html), /<link rel="canonical" href="https:\/\/iashark\.com\/gb\/match\/424242\.html">/);
  assert.doesNotMatch(head(html), /name="robots" content="noindex/);
  const alts = alternates(html);
  // Premier League : fr, gb, za, en (config/leagues.json#seoMatchDirs) + x-default.
  const gen = SEO.matchDirs(MATCH);
  assert.deepEqual(gen.slice().sort(), ["en", "fr", "gb", "za"]);
  assert.equal(alts.length, gen.length + 1);
  for (const d of gen) assert.ok(alts.some((a) => a.hl === C.DIRS[d].hreflang && a.href === "https://iashark.com" + C.matchPath(d, 424242)), d);
  for (const d of DIRS.filter((x) => !gen.includes(x))) assert.ok(!alts.some((a) => a.hl === C.DIRS[d].hreflang), d + " : hreflang vers une version non generee");
  // x-default : config/markets.json#_hreflangXDefault (en, puis fr).
  assert.ok(alts.some((a) => a.hl === "x-default" && a.href === "https://iashark.com/en/match/424242.html"));
  const ld = ldBlocks(html);
  const ev = ld.find((b) => b["@type"] === "SportsEvent");
  // 21:00 heure de Paris (heure d'ete, UTC+2) = 19:00 UTC.
  assert.equal(ev.startDate, "2026-09-19T19:00:00Z");
  assert.equal(ev.location.name, "Emirates Stadium");
  assert.equal(ev.homeTeam.name, "Arsenal");
  assert.equal(ev.superEvent.name, "Premier League");
  const bc = ld.find((b) => b["@type"] === "BreadcrumbList");
  assert.deepEqual(bc.itemListElement.map((i) => i.item), ["https://iashark.com/gb/", "https://iashark.com/gb/leagues/premier-league.html", "https://iashark.com/gb/match/424242.html"]);
  assert.match(html, /UK time/);
  assert.match(html, /18\+/);
});

test("page match : aucun champ premium ni pari nomme hors match offert", () => {
  const leaky = Object.assign({}, MATCH, { pari_rec: "Over 2.5", kelly: 0.02 });
  for (const d of ["fr", "gb", "mx"]) {
    const html = SEO.renderMatchPage(TPL, leaky, d);
    assert.doesNotMatch(html.replace(/<script>var PRELOADED_MATCH=[\s\S]*?<\/script>/, ""), /Over 2\.5|data-market-label="/, d + " : pari nomme dans le HTML");
  }
  // Page match V8 (16/09/2026) : meme le match offert n'est plus nomme dans le
  // HTML statique (un visiteur sans compte y voit l'avis ferme).
  const offert = Object.assign({}, MATCH, { is_free: true, pari_rec: "Over 2.5", conf: 7 });
  assert.doesNotMatch(SEO.renderMatchPage(TPL, offert, "fr").replace(/<script>var PRELOADED_MATCH=[\s\S]*?<\/script>/, ""), /Over 2\.5|Plus de 2,5 buts|data-market-label="|seo_recommended_market/, "match offert : pari nomme dans le HTML statique");
  // PRELOADED_MATCH = version legere de la copie assainie, jamais plus.
  const html = SEO.renderMatchPage(TPL, MATCH, "za");
  const pre = JSON.parse(html.match(/<script>var PRELOADED_MATCH=([\s\S]*?);<\/script>/)[1]);
  assert.deepEqual(SPLIT.premiumLeaks(pre), []);
  assert.equal(pre.detail_omitted, true);
});

test("pages match localisees reelles : PRELOADED_MATCH sans fuite, hreflang reciproques", () => {
  for (const d of DIRS.filter((x) => x !== "fr")) {
    const dir = path.join(ROOT, d, "match");
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const html = read(d + "/match/" + f);
      const mm = html.match(/<script>var PRELOADED_MATCH=([\s\S]*?);<\/script>/);
      // Page conservee (match sorti du run, scripts/match-lifecycle.js) : rendue
      // depuis l'instantane public, volontairement sans PRELOADED_MATCH ni FIXED_MATCH_ID.
      const archivee = /class="match-archived"/.test(html);
      assert.ok(mm || archivee, d + "/match/" + f);
      if (archivee) assert.ok(!mm && !/FIXED_MATCH_ID/.test(html), "page conservee avec donnees de match " + d + "/match/" + f);
      if (mm) assert.deepEqual(SPLIT.premiumLeaks(JSON.parse(mm[1])), [], "fuite premium " + d + "/match/" + f);
      ldBlocks(html);
      for (const a of alternates(html)) {
        const rel = a.href.replace("https://iashark.com/", "");
        if (!fs.existsSync(path.join(ROOT, rel))) continue; // page FR du pipeline pas encore regeneree en local
        const self = "https://iashark.com/" + d + "/match/" + f;
        assert.ok(alternates(read(rel)).some((b) => b.href === self) || rel.indexOf("match/") === 0, "hreflang non reciproque " + rel + " -> " + self);
      }
    }
  }
});

const EMPTY_HUB = { upcoming: [], results: [], standings: null, clubs: [] };
test("page championnat : sans contenu stable noindex, liens vers les pages match, JSON-LD valide, aucune probabilite", () => {
  const thin = SEO.renderLeagueHub("eredivisie", "en", [Object.assign({}, MATCH, { league_key: "eredivisie" })], { data: { results: [], standings: null, clubs: [] } });
  assert.equal(thin.indexable, false, "un seul match, ni classement ni club : contenu trop mince");
  assert.match(thin.html, /<meta name="robots" content="noindex,follow">/);
  const many = SEO.renderLeagueHub("premier", "gb", [MATCH, Object.assign({}, MATCH, { id: 424243 })]);
  assert.equal(many.indexable, true);
  assert.doesNotMatch(many.html, /noindex/);
  assert.match(many.html, /<h1>Premier League predictions: fixtures, results and table<\/h1>/);
  assert.match(many.html, /href="\/gb\/match\/424242\.html"/);
  assert.doesNotMatch(many.html, /51 ?%|\bp1\b|pari_rec|"conf"|kelly/);
  const ld = ldBlocks(many.html);
  assert.ok(ld.some((b) => b["@type"] === "BreadcrumbList"));
  assert.ok(ld.find((b) => b["@type"] === "CollectionPage").mainEntity.itemListElement.some((i) => i.url === "https://iashark.com/gb/match/424242.html"));
  assert.equal((many.html.match(/<h1[\s>]/g) || []).length, 1);
});

test("page championnat : indexable sur contenu stable (classement, clubs, 14 jours), sans aucun match du jour", () => {
  const rows = Array.from({ length: 18 }, (_, i) => ({ rank: i + 1, team_id: 9000 + i, name: "Club " + (i + 1), played: 8, won: 4, drawn: 2, lost: 2, gd: 18 - 2 * i, pts: 30 - i }));
  const standings = { as_of: "2026-09-14", source: "api-football", season: 2026, groups: [{ name: "Liga MX: Apertura", rows: rows }] };
  // Liga MX /mx/ un jour sans match : classement seul -> indexable.
  const mx = SEO.renderLeagueHub("liga_mx", "mx", [], { data: Object.assign({}, EMPTY_HUB, { standings: standings }) });
  assert.equal(mx.indexable, true);
  assert.doesNotMatch(head(mx.html), /noindex/);
  assert.match(mx.html, /<table>/);
  assert.match(mx.html, /Tabla de Liga MX/);
  assert.match(mx.html, /Liga MX: la primera división del futbol mexicano|La Liga MX es la primera división/);
  // PSL /za/ : pages club seules -> indexable, liens vers les clubs.
  const za = SEO.renderLeagueHub("south_africa_premiership", "za", [], { data: Object.assign({}, EMPTY_HUB, { clubs: [{ kind: "club", name: "Kaizer Chiefs", path: "/za/clubs/kaizer-chiefs.html" }] }) });
  assert.equal(za.indexable, true);
  assert.match(za.html, /href="\/za\/clubs\/kaizer-chiefs\.html"/);
  // Rencontres des 14 jours et resultats (registre, cache) : 3 suffisent.
  const fx = (id, t, score) => ({ id: String(id), t: Date.parse(t), home: { n: "Ajax" }, away: { n: "PSV" }, venue: null, score: score || null, href: null });
  const ere = SEO.renderLeagueHub("eredivisie", "en", [], { data: Object.assign({}, EMPTY_HUB, { upcoming: [fx(1, "2099-01-02T18:00:00Z"), fx(2, "2099-01-05T18:00:00Z")], results: [fx(3, "2098-12-20T18:00:00Z", { home: 2, away: 1 })] }) });
  assert.equal(ere.indexable, true);
  assert.match(ere.html, /Ajax 2–1 PSV/);
  // Hors perimetre : jamais indexable, meme avec du contenu stable.
  const de = SEO.renderLeagueHub("liga_mx", "de", [], { data: Object.assign({}, EMPTY_HUB, { standings: standings }) });
  assert.equal(de.indexable, false);
  // Sans rien : noindex, message explicite.
  const none = SEO.renderLeagueHub("jleague", "en", [], { data: EMPTY_HUB });
  assert.equal(none.indexable, false);
  assert.match(none.html, /No J1 League fixture is scheduled in the next 14 days/);
});

test("sitemaps SEO : uniquement des fichiers existants et indexables", () => {
  for (const f of ["sitemap-leagues.xml", "sitemap-matches-i18n.xml"]) {
    if (!fs.existsSync(path.join(ROOT, f))) continue;
    for (const [, loc] of read(f).matchAll(/<loc>([^<]+)<\/loc>/g)) {
      const rel = loc.replace("https://iashark.com/", "");
      assert.ok(fs.existsSync(path.join(ROOT, rel)), f + " : " + loc + " sans fichier");
      assert.doesNotMatch(head(read(rel)), /noindex/, f + " : " + loc + " noindex");
    }
  }
  const idx = read("sitemap.xml");
  assert.match(idx, /sitemap-fr\.xml/);
  assert.match(read("robots.txt"), /^Sitemap: https:\/\/iashark\.com\/sitemap\.xml$/m);
});

test("seo-lastmod : date conservee si le contenu ne change pas, date du jour sinon", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-lastmod-"));
  let t = LASTMOD.tracker(tmp, "g", "2026-01-01");
  assert.equal(t.lastmod("u", "<p>a</p>", "2025-12-01"), "2025-12-01");
  t.save();
  t = LASTMOD.tracker(tmp, "g", "2026-02-01");
  assert.equal(t.lastmod("u", '<p>a</p>"pipeline_sha":"x"'), "2025-12-01", "champ technique ignore");
  t.save();
  t = LASTMOD.tracker(tmp, "g", "2026-03-01");
  assert.equal(t.lastmod("u", "<p>b</p>"), "2026-03-01");
  t.save();
  fs.writeFileSync(path.join(tmp, "sitemap-x.xml"), "<urlset><url><loc>a</loc><lastmod>2026-03-01</lastmod></url></urlset>");
  fs.writeFileSync(path.join(tmp, "sitemap-empty.xml"), "<urlset></urlset>");
  assert.deepEqual(writeSitemapIndex(tmp, "2026-03-02"), ["sitemap-x.xml"]);
  assert.match(fs.readFileSync(path.join(tmp, "sitemap.xml"), "utf8"), /<lastmod>2026-03-01<\/lastmod>/);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("accueils generes : titres distincts en/gb/za, JSON-LD Organization+WebSite localise, bloc SEO visible", () => {
  const titles = ["en", "gb", "za"].map((d) => head(read(d + "/index.html")).match(/<title>([^<]*)<\/title>/)[1]);
  assert.equal(new Set(titles).size, 3);
  for (const d of DIRS) {
    const html = read(d + "/index.html");
    const graph = ldBlocks(html).find((b) => b["@graph"]);
    assert.ok(graph, d + " : @graph absent");
    const types = graph["@graph"].map((n) => n["@type"]);
    assert.deepEqual(types, ["Organization", "WebSite", "WebPage"]);
    assert.equal(graph["@graph"][2].inLanguage, C.DIRS[d].htmlLang);
    assert.equal(ldBlocks(html).filter((b) => b["@type"] === "Organization").length, 0, d + " : ancien bloc Organization FR");
    assert.match(html, new RegExp('<!--SEO_INTRO--><section[\\s\\S]*href="/' + d + '/leagues/'), d + " : liens championnats");
    assert.doesNotMatch(head(html), /<title data-i18n/, d + " : titre retraduit au runtime");
  }
});

test("pages legales : fil d'Ariane JSON-LD", () => {
  const html = read("gb/cgv.html");
  const bc = ldBlocks(html).find((b) => b["@type"] === "BreadcrumbList");
  assert.ok(bc);
  assert.equal(bc.itemListElement[1].item, "https://iashark.com/gb/cgv.html");
});

test("pipeline : pages SEO depuis la copie assainie, publiees avec leur chemin", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /var SEO_PAGES=require\('\.\/scripts\/seo-pages\.js'\);/);
  assert.match(wf, /SEO_PAGES\.writeSeoPages\(matchsData,/);
  assert.match(wf, /generateMatchPages\(matchsPublics\)/);
  assert.match(wf, /\+SEO_PAGES\.matchHeadExtras\(m,'fr'\)/);
  // Page match V8 (16/09/2026) : resume statique sans pari, meme pour le match offert.
  const resume = wf.slice(wf.indexOf("function seoSummaryHtmlFor(m){"), wf.indexOf("function liensVersionFr(html){"));
  assert.ok(resume.length > 100, "seoSummaryHtmlFor introuvable");
  assert.doesNotMatch(resume, /pari_rec|m\.conf|seo_recommended_market/);
  assert.match(wf, /writeSitemapIndex\('\.', TODAY\)/);
  assert.match(wf, /OUTPUTS="[^"]*seo-lastmod\.json/);
  assert.match(wf, /cp -R --parents "\$p" "\$SAVE\/"/);
  assert.match(wf, /git add \$OUTPUTS \$DIR_INDEXES \$SEO_DIRS sitemap-\*\.xml/);
  assert.ok(fs.existsSync(path.join(ROOT, "seo-lastmod.json")), "le registre doit exister (git add du pipeline)");
});
