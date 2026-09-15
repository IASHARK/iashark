"use strict";
// Cycle de vie des pages match statiques (scripts/match-lifecycle.js,
// scripts/seo-pages.js) : conservation apres la sortie du run, hors sitemap a
// J+2, noindex a J+7, 301 a J+30, perimetre des versions par competition,
// hreflang limites aux versions generees, seuil de contenu, aucune fuite
// premium ni conf sur une page conservee.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const SEO = require("../scripts/seo-pages.js");
const L = require("../scripts/match-lifecycle.js");
const C = require("../scripts/seo-common.js");
const PREMIUM = require("../lib/premium-fields.js");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const TPL = read("match.html");
const HOUR = 3600 * 1000, DAY = 24 * HOUR;

function head(html) { return html.split(/<\/head>/i)[0]; }
function alternates(html) {
  return [...head(html).matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => ({ hl: m[1], href: m[2] }));
}
function ld(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}
function visibleText(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ");
}
function form(opps, home) {
  return opps.map((o, i) => ({ d: "2026-09-0" + (i + 1), opponent: o, score: (i % 3) + "-1", result: ["L", "D", "W"][i % 3], home: home, lieu: home ? "DOM" : "EXT" }));
}
function xi(prefix) { return Array.from({ length: 11 }, (_, i) => ({ id: i + 1, name: prefix + " Player" + (i + 1), pos: "M" })); }

// 21:00 heure de Paris (UTC+2) = 19:00 UTC.
const KICKOFF = Date.parse("2026-09-19T19:00:00Z");
const RICH = {
  id: 777001, league_key: "liga_mx", league: "Liga MX", date: "2026-09-19 21:00",
  home: { n: "Club America", id: 2287 }, away: { n: "Guadalajara Chivas", id: 2278 },
  stade: { nom: "Estadio Azteca" }, model_output_available: true, data_quality_score: 80, conf: 8.37, has_signal: true, is_free: false,
  form_home: form(["Toluca", "Pumas UNAM", "Monterrey", "Tigres UANL", "Leon"], true),
  form_away: form(["Atlas", "Santos Laguna", "Pachuca", "Necaxa", "Puebla"], false),
  h2h: [
    { d: "2026-03-15", home: "Guadalajara Chivas", away: "Club America", s: "0-2", w: "2" },
    { d: "2025-10-04", home: "Club America", away: "Guadalajara Chivas", s: "1-1", w: "N" },
    { d: "2025-03-16", home: "Guadalajara Chivas", away: "Club America", s: "1-0", w: "1" }
  ],
  classement: { league_name: "Liga MX", standings: [
    { rank: 1, name: "Club America", team_id: 2287, played: 9, won: 7, drawn: 1, lost: 1, gd: 12, pts: 22, form: "WWWDW" },
    { rank: 2, name: "Toluca", team_id: 2281, played: 9, won: 6, drawn: 2, lost: 1, gd: 9, pts: 20 },
    { rank: 6, name: "Guadalajara Chivas", team_id: 2278, played: 9, won: 4, drawn: 2, lost: 3, gd: 2, pts: 14 }
  ] },
  lineups: { home: { formation: "4-3-3", coach: "A. Coach", startXI: xi("Ame") }, away: { formation: "4-4-2", startXI: xi("Chi") } }
};
// Meme match tel que le moteur le produit, champs premium compris.
const WITH_PREMIUM = Object.assign({}, RICH, {
  pari_rec: "Over 2.5", cote_rec: 1.91, model_probability: 61.3, market_id: "over25", marche: "Plus de 2,5 buts",
  p1: 48, pn: 27, p2: 25, po25: 61, btts: 55, kelly: 0.031, edge: 4.2, verdict_shark: "VERDICT_SECRET",
  analyse_card: "ANALYSE_SECRETE", scenario: "SCENARIO_SECRET", top_scorers: [{ name: "Ame Player9", goal_threat_score: 0.91 }],
  markets_compared: [{ market: "over25", model: 61, implied: 52 }], paris_safe: [{ pari: "Over 1.5" }]
});
const THIN = { id: 777002, league_key: "liga_mx", league: "Liga MX", date: "2026-09-19 23:00", home: { n: "Leon", id: 2289 }, away: { n: "Atlas", id: 2283 }, is_free: false };

// Meme enchainement que le pipeline (generateMatchPages + generateSitemaps) et
// que node scripts/seo-pages.js, dans un repertoire temporaire.
function cycle(root, matchs, now, extra) {
  const reg = L.loadRegistry(root);
  const summary = L.updateRegistry(reg, matchs, now, extra || {});
  const keep = {}, runIds = {};
  fs.mkdirSync(path.join(root, "match"), { recursive: true });
  matchs.forEach((m) => {
    const pub = PREMIUM.stripPremium(m);
    fs.writeFileSync(path.join(root, "match", m.id + ".html"), SEO.renderMatchPage(TPL, pub, "fr", { now, entry: reg.matches[String(m.id)] }));
    keep[m.id + ".html"] = true;
    runIds[String(m.id)] = true;
  });
  SEO.writeArchivedMatchPages(reg, { root, tpl: TPL, now, dirs: ["fr"], skipIds: runIds }).forEach((rel) => { keep[rel.split("/").pop()] = true; });
  fs.readdirSync(path.join(root, "match")).filter((f) => /\.html$/.test(f) && !keep[f]).forEach((f) => fs.unlinkSync(path.join(root, "match", f)));
  const today = new Date(now).toISOString().slice(0, 10);
  // Hubs limites aux versions du perimetre Liga MX (cibles des 301) : test rapide.
  const rep = SEO.writeSeoPages(matchs.map(PREMIUM.stripPremium), { root, today, tpl: TPL, registry: reg, now, hubDirs: ["fr", "mx", "es"] });
  SEO.writeFrMatchSitemap(root, today, now);
  L.saveRegistry(root, reg);
  L.writeRedirects(root, reg);
  return { reg, summary, rep };
}
function tmpRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-lifecycle-"));
  fs.copyFileSync(path.join(ROOT, "_redirects"), path.join(root, "_redirects"));
  return root;
}
const exists = (root, rel) => fs.existsSync(path.join(root, rel));
const readT = (root, rel) => fs.readFileSync(path.join(root, rel), "utf8");
const at = (ms) => new Date(KICKOFF + ms);

test("perimetre des versions : table explicite dans config/leagues.json, fr toujours genere", () => {
  const leagues = JSON.parse(read("config/leagues.json")).leagues;
  for (const l of leagues) {
    assert.ok(Array.isArray(l.seoMatchDirs), l.key + " : seoMatchDirs manquant");
    for (const d of l.seoMatchDirs) {
      assert.ok(C.DIRS[d], l.key + " : repertoire inconnu " + d);
      assert.notEqual(d, "fr", l.key + " : fr est implicite");
    }
  }
  const byKey = Object.fromEntries(leagues.map((l) => [l.key, l]));
  // Ids reels (API-Football) des competitions du perimetre.
  assert.equal(byKey.liga_mx.apiFootballId, 262);
  assert.equal(byKey.south_africa_premiership.apiFootballId, 288);
  assert.equal(byKey.mls.apiFootballId, 253);
  assert.equal(byKey.premier.apiFootballId, 39);
  const sorted = (a) => a.slice().sort();
  assert.deepEqual(sorted(L.matchDirsFor("liga_mx")), sorted(["fr", "mx", "es"]));
  assert.deepEqual(sorted(L.matchDirsFor("south_africa_premiership")), sorted(["fr", "za", "en"]));
  assert.deepEqual(sorted(L.matchDirsFor("mls")), sorted(["fr", "en", "gb"]));
  assert.deepEqual(sorted(L.matchDirsFor("premier")), sorted(["fr", "gb", "en", "za"]));
  assert.deepEqual(sorted(L.matchDirsFor("ligue1")), sorted(["fr", "en"]));
  assert.deepEqual(sorted(L.matchDirsFor("laliga")), sorted(["fr", "es", "mx", "en"]));
  assert.deepEqual(sorted(L.matchDirsFor("seriea")), sorted(["fr", "it", "en"]));
  assert.deepEqual(sorted(L.matchDirsFor("bundesliga")), sorted(["fr", "de", "en"]));
  assert.deepEqual(sorted(L.matchDirsFor("primeira")), sorted(["fr", "pt", "en"]));
  for (const k of ["argentina_liga_profesional", "colombia_primera_a", "peru_primera", "chile_primera"]) assert.deepEqual(sorted(L.matchDirsFor(k)), sorted(["fr", "es", "en"]), k);
  for (const k of ["ldc", "el", "ecl"]) assert.deepEqual(sorted(L.matchDirsFor(k)), sorted(C.DIR_CODES), k);
  assert.deepEqual(L.matchDirsFor("competition_inconnue"), ["fr"]);
});

test("hreflang uniquement entre versions generees, pages ecrites seulement dans le perimetre", () => {
  const root = tmpRoot();
  try {
    cycle(root, [WITH_PREMIUM], at(-DAY));
    for (const d of C.DIR_CODES) {
      const rel = C.matchPath(d, RICH.id).slice(1);
      assert.equal(exists(root, rel), ["fr", "mx", "es"].includes(d), d + " : " + rel);
    }
    const html = readT(root, "mx/match/777001.html");
    assert.deepEqual(alternates(html).map((a) => a.hl).sort(), ["es", "es-MX", "fr", "x-default"]);
    // Aucun hreflang, dans aucune page ecrite, vers une version non generee.
    for (const rel of ["match/777001.html", "mx/match/777001.html", "es/match/777001.html"]) {
      for (const a of alternates(readT(root, rel))) {
        assert.ok(exists(root, a.href.replace("https://iashark.com/", "")), rel + " -> " + a.href + " : version non generee");
      }
    }
    const xml = readT(root, "sitemap-matches-i18n.xml");
    assert.match(xml, /\/mx\/match\/777001\.html/);
    assert.doesNotMatch(xml, /\/(gb|za|en|de|it|pt)\/match\/777001\.html/);
    // Hub hors perimetre : noindex, sans hreflang, liens vers une version existante.
    const deHub = SEO.renderLeagueHub("liga_mx", "de", [RICH, Object.assign({}, RICH, { id: 777003 })]);
    assert.equal(deHub.indexable, false);
    assert.match(head(deHub.html), /<meta name="robots" content="noindex,follow">/);
    assert.equal(alternates(deHub.html).length, 0);
    assert.match(deHub.html, /href="\/match\/777001\.html"/);
    assert.doesNotMatch(deHub.html, /href="\/de\/match\//);
    const mxHub = SEO.renderLeagueHub("liga_mx", "mx", [RICH, Object.assign({}, RICH, { id: 777003 })]);
    assert.equal(mxHub.indexable, true);
    assert.deepEqual(alternates(mxHub.html).map((a) => a.hl).sort(), ["es", "es-MX", "fr", "x-default"]);
    const gbHub = SEO.renderLeagueHub("laliga", "gb", [Object.assign({}, RICH, { league_key: "laliga" })]);
    assert.match(gbHub.html, /href="\/en\/match\/777001\.html"/, "gb hors perimetre LaLiga -> version en");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("conservation : le match sorti du run garde ses pages, score final, eventStatus, lien vers le hub", () => {
  const root = tmpRoot();
  try {
    cycle(root, [WITH_PREMIUM], at(-DAY));
    // Le run suivant contient le match joue dans les confrontations d'un autre match.
    const other = { id: 777010, league_key: "liga_mx", league: "Liga MX", date: "2026-09-23 03:00", home: { n: "Toluca", id: 2281 }, away: { n: "Club America", id: 2287 },
      form_away: [{ d: "2026-09-19", opponent: "Guadalajara Chivas", score: "3-1", result: "W", home: true, date_full: "2026-09-19T19:00:00+00:00" }] };
    const { reg } = cycle(root, [other], at(3 * HOUR));
    const e = reg.matches["777001"];
    assert.equal(e.status, "archived");
    assert.equal(e.in_run, false);
    assert.deepEqual([e.final_score.home, e.final_score.away], [3, 1]);
    for (const [dir, rel, hub] of [["fr", "match/777001.html", "/fr/leagues/liga-mx.html"], ["mx", "mx/match/777001.html", "/mx/leagues/liga-mx.html"], ["es", "es/match/777001.html", "/es/leagues/liga-mx.html"]]) {
      assert.ok(exists(root, rel), dir + " : page conservee absente");
      const html = readT(root, rel);
      assert.match(html, /class="match-archived"/, dir);
      assert.match(visibleText(html), /Club America 3–1 Guadalajara Chivas/, dir + " : score final");
      assert.match(html, new RegExp('href="' + hub.replace(/\//g, "\\/") + '"'), dir + " : lien hub");
      assert.doesNotMatch(html, /FIXED_MATCH_ID|PRELOADED_MATCH|\/match-page\.js/, dir + " : scripts d'analyse sur une page conservee");
      assert.doesNotMatch(head(html), /noindex/, dir + " : conservee et indexable avant J+7");
      const ev = ld(html).find((b) => b["@type"] === "SportsEvent");
      assert.equal(ev.eventStatus, "https://schema.org/EventScheduled");
      assert.equal(ev.startDate, "2026-09-19T19:00:00Z");
      assert.equal((html.match(/<h1[\s>]/g) || []).length, 1, dir + " : un seul h1");
    }
    assert.match(readT(root, "match/777001.html"), /Score final/);
    // Sans score public : "Match termine".
    const root2 = tmpRoot();
    try {
      cycle(root2, [RICH], at(-DAY));
      cycle(root2, [], at(3 * HOUR));
      assert.match(visibleText(readT(root2, "match/777001.html")), /Match terminé/);
      assert.match(visibleText(readT(root2, "es/match/777001.html")), /Partido finalizado/);
    } finally { fs.rmSync(root2, { recursive: true, force: true }); }
    // Coup d'envoi deplace entre deux runs : EventRescheduled.
    const root3 = tmpRoot();
    try {
      cycle(root3, [RICH], at(-2 * DAY));
      cycle(root3, [Object.assign({}, RICH, { date: "2026-09-20 21:00" })], at(-DAY));
      const ev = ld(readT(root3, "mx/match/777001.html")).find((b) => b["@type"] === "SportsEvent");
      assert.equal(ev.eventStatus, "https://schema.org/EventRescheduled");
      assert.equal(ev.previousStartDate, "2026-09-19T19:00:00Z");
    } finally { fs.rmSync(root3, { recursive: true, force: true }); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("score final : historique regle, confrontations directes, forme vue depuis l'equipe", () => {
  const entry = { id: "777001", kickoff: "2026-09-19T19:00:00Z", snapshot: L.publicSnapshot(RICH) };
  assert.equal(L.findFinalScore(entry, {}), null);
  assert.deepEqual(L.findFinalScore(entry, { historique: { predictions: [{ fixture_id: 777001, home: "Club America", away: "Guadalajara Chivas", result: "win", score: "2-0" }] } }), { home: 2, away: 0, source: "historique" });
  assert.equal(L.findFinalScore(entry, { historique: { predictions: [{ fixture_id: 777001, result: "scheduled", score: "2-0" }] } }), null);
  assert.deepEqual(L.findFinalScore(entry, { matchs: [{ home: { n: "X" }, away: { n: "Y" }, h2h: [{ d: "2026-09-19", home: "Club America", away: "Guadalajara Chivas", s: "1-2" }] }] }), { home: 1, away: 2, source: "h2h" });
  // Forme de l'equipe a l'exterieur : "2-1" = buts de Chivas - buts d'America.
  assert.deepEqual(L.findFinalScore(entry, { matchs: [{ home: { n: "Atlas", id: 1 }, away: { n: "Guadalajara Chivas", id: 2278 }, form_away: [{ d: "2026-09-19", opponent: "Club America", score: "2-1", home: false }] }] }), { home: 1, away: 2, source: "form" });
  // Une autre rencontre entre les memes equipes (autre date) n'est jamais prise.
  assert.equal(L.findFinalScore(entry, { matchs: [{ home: { n: "X" }, away: { n: "Y" }, h2h: [{ d: "2026-03-15", home: "Club America", away: "Guadalajara Chivas", s: "4-0" }] }] }), null);
});

test("hors sitemap 48 h apres le coup d'envoi (FR et versions localisees)", () => {
  const root = tmpRoot();
  try {
    cycle(root, [RICH], at(-DAY));
    cycle(root, [], at(47 * HOUR));
    assert.match(readT(root, "sitemap-fr.xml"), /<loc>https:\/\/iashark\.com\/match\/777001\.html<\/loc>/);
    assert.match(readT(root, "sitemap-matches-i18n.xml"), /\/mx\/match\/777001\.html/);
    cycle(root, [], at(49 * HOUR));
    assert.ok(exists(root, "match/777001.html"), "page toujours servie");
    assert.doesNotMatch(readT(root, "sitemap-fr.xml"), /777001/);
    assert.doesNotMatch(readT(root, "sitemap-matches-i18n.xml"), /777001/);
    assert.equal(L.stageFor("2026-09-19T19:00:00Z", KICKOFF + 47 * HOUR, false).inSitemap, true);
    assert.equal(L.stageFor("2026-09-19T19:00:00Z", KICKOFF + 48 * HOUR, false).inSitemap, false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("lastmod des matchs FR : conserve tant que la page ne change pas (plus de date du jour)", () => {
  const root = tmpRoot();
  try {
    cycle(root, [RICH], at(-2 * DAY));
    const d1 = readT(root, "sitemap-fr.xml").match(/<lastmod>([^<]+)<\/lastmod>/)[1];
    assert.equal(d1, "2026-09-17");
    cycle(root, [RICH], at(-DAY));
    assert.equal(readT(root, "sitemap-fr.xml").match(/<lastmod>([^<]+)<\/lastmod>/)[1], "2026-09-17");
    const wf = read(".github/workflows/update-data.yml");
    assert.doesNotMatch(wf, /match\/'\+m\.id\+'\.html<\/loc><lastmod>'\+TODAY/, "lastmod=TODAY systematique pour les matchs FR");
    assert.match(wf, /SEO_PAGES\.writeFrMatchSitemap\('\.',TODAY,new Date\(\)\)/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("noindex,follow a partir de J+7", () => {
  const root = tmpRoot();
  try {
    cycle(root, [RICH], at(-DAY));
    let r = cycle(root, [], at(7 * DAY - HOUR));
    assert.equal(r.reg.matches["777001"].status, "archived");
    assert.doesNotMatch(head(readT(root, "mx/match/777001.html")), /noindex/);
    r = cycle(root, [], at(7 * DAY));
    assert.equal(r.reg.matches["777001"].status, "archived_noindex");
    for (const rel of ["match/777001.html", "mx/match/777001.html", "es/match/777001.html"]) {
      assert.match(head(readT(root, rel)), /<meta name="robots" content="noindex,follow">/, rel);
    }
    assert.equal(L.stageFor("2026-09-19T19:00:00Z", KICKOFF + 7 * DAY, false).noindex, true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("J+30 : pages supprimees, 301 vers le hub ligue de la version, qui survit au build", () => {
  const root = tmpRoot();
  try {
    cycle(root, [RICH], at(-DAY));
    cycle(root, [], at(29 * DAY));
    assert.ok(exists(root, "es/match/777001.html"));
    const { reg } = cycle(root, [], at(30 * DAY));
    const e = reg.matches["777001"];
    assert.equal(e.status, "redirected");
    assert.equal(e.snapshot, undefined, "plus d'instantane apres suppression");
    for (const rel of ["match/777001.html", "mx/match/777001.html", "es/match/777001.html"]) assert.ok(!exists(root, rel), rel + " doit etre supprimee");
    const rules = readT(root, "_redirects").split("\n").filter((l) => l.trim() && l[0] !== "#").map((l) => l.trim().split(/\s+/));
    const has = (from, to) => rules.findIndex((r) => r[0] === from && r[1] === to && r[2] === "301");
    const first404 = rules.findIndex((r) => r[2] === "404");
    for (const [from, to] of [["/match/777001.html", "/fr/leagues/liga-mx.html"], ["/mx/match/777001.html", "/mx/leagues/liga-mx.html"], ["/es/match/777001.html", "/es/leagues/liga-mx.html"]]) {
      const i = has(from, to);
      assert.ok(i !== -1 && i < first404, from + " -> " + to);
      assert.ok(exists(root, to.slice(1)), "cible " + to + " existante");
    }
    assert.equal(rules.filter((r) => /777001/.test(r[0])).length, 3, "aucune redirection pour une version jamais generee");
    // Idempotent, 404 toujours en dernier, meme bloc que scripts/build-locales.js.
    const text = readT(root, "_redirects");
    assert.equal(L.applyRedirectsBlock(text, reg), text);
    assert.equal(rules.slice(-C.DIR_CODES.length).every((r) => r[2] === "404"), true);
    assert.match(read("scripts/build-locales.js"), /MATCH_LIFECYCLE\.redirectsBlockLines\(MATCH_LIFECYCLE\.loadRegistry\(ROOT\)\)/);
    const rebuilt = L.applyRedirectsBlock(L.applyRedirectsBlock(text, L.emptyRegistry()), reg);
    assert.equal(rebuilt, text, "bloc retire puis remis a l'identique");
    // Retention : regle et entree retirees 90 jours apres la suppression.
    cycle(root, [], at((30 + L.REDIRECT_RETENTION_DAYS + 1) * DAY));
    assert.equal(L.loadRegistry(root).matches["777001"], undefined);
    assert.doesNotMatch(readT(root, "_redirects"), /777001/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("versions sorties du perimetre : 301 vers le hub de la version ou la version FR, survit au build, expire a 90 jours", () => {
  const root = tmpRoot();
  try {
    // Registre d'avant la reduction du perimetre : Liga MX generee aussi en gb et de.
    const old = L.emptyRegistry();
    old.matches["777001"] = { id: "777001", first_seen: "2026-09-17", kickoff: "2026-09-19T19:00:00Z", league_key: "liga_mx", dirs: ["fr", "gb", "mx", "es", "de"], in_run: true };
    L.saveRegistry(root, old);
    const day = new Date(at(-DAY)).toISOString().slice(0, 10);
    let { reg } = cycle(root, [RICH], at(-DAY));
    const e = reg.matches["777001"];
    assert.deepEqual(e.dirs, ["fr", "mx", "es"]);
    assert.deepEqual(e.retired_dirs, { gb: day, de: day }, "versions retirees datees, ordre stable");
    const rulesOf = (text) => text.split("\n").filter((l) => l.trim() && l[0] !== "#").map((l) => l.trim().split(/\s+/));
    let rules = rulesOf(readT(root, "_redirects"));
    const first404 = rules.findIndex((r) => r[2] === "404");
    for (const from of ["/gb/match/777001.html", "/de/match/777001.html"]) {
      const i = rules.findIndex((r) => r[0] === from && r[1] === "/match/777001.html" && r[2] === "301");
      assert.ok(i !== -1 && i < first404, from + " -> version FR (hub de la version hors perimetre)");
    }
    assert.ok(exists(root, "match/777001.html"), "cible FR existante");
    assert.equal(rules.filter((r) => /777001/.test(r[0])).length, 2, "aucune regle pour une version du perimetre");
    // Un nouveau run ne repousse pas la date et ne duplique rien ; bloc identique a build-locales.
    ({ reg } = cycle(root, [RICH], at(2 * DAY)));
    assert.deepEqual(reg.matches["777001"].retired_dirs, { gb: day, de: day });
    const text = readT(root, "_redirects");
    assert.equal(L.applyRedirectsBlock(L.applyRedirectsBlock(text, L.emptyRegistry()), reg), text);

    // Hub de la version dans le perimetre -> hub ; page FR retiree -> hub FR (pas de chaine).
    const probe = { id: "777001", league_key: "liga_mx", dirs: ["fr"], status: "archived", retired_dirs: { mx: day, de: day } };
    assert.equal(L.retiredDirTarget(probe, "mx", "777001"), "/mx/leagues/liga-mx.html");
    assert.equal(L.retiredDirTarget(probe, "de", "777001"), "/match/777001.html");
    assert.equal(L.retiredDirTarget(Object.assign({}, probe, { status: "redirected" }), "de", "777001"), "/fr/leagues/liga-mx.html");
    // Version revenue dans le perimetre : plus retiree.
    assert.deepEqual(L.retireDirs({ dirs: ["fr", "de"], retired_dirs: { gb: day, de: day } }, [], day).retired_dirs, { gb: day });
    assert.equal(L.retireDirs({ dirs: ["fr", "gb"], retired_dirs: { gb: day } }, [], day).retired_dirs, undefined);

    // J+30 : page FR retiree, les versions retirees visent directement le hub FR.
    cycle(root, [], at(29 * DAY));
    ({ reg } = cycle(root, [], at(30 * DAY)));
    rules = rulesOf(readT(root, "_redirects"));
    for (const from of ["/gb/match/777001.html", "/de/match/777001.html"]) {
      assert.ok(rules.some((r) => r[0] === from && r[1] === "/fr/leagues/liga-mx.html" && r[2] === "301"), from + " -> hub FR");
    }
    assert.equal(rules.filter((r) => /777001/.test(r[0])).length, 5);
    // 90 jours apres le retrait : regles des versions retirees supprimees, celles de J+30 conservees.
    ({ reg } = cycle(root, [], at((L.REDIRECT_RETENTION_DAYS + 1) * DAY)));
    assert.equal(reg.matches["777001"].retired_dirs, undefined);
    rules = rulesOf(readT(root, "_redirects"));
    assert.deepEqual(rules.filter((r) => /777001/.test(r[0])).map((r) => r[0]).sort(), ["/es/match/777001.html", "/match/777001.html", "/mx/match/777001.html"]);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("registre commite : chaque version retiree a sa 301 dans _redirects (meme bloc que le pipeline)", () => {
  const reg = L.loadRegistry(ROOT);
  const text = read("_redirects");
  assert.equal(L.applyRedirectsBlock(text, reg), text, "_redirects desynchronise de data/match-pages-registry.json");
  for (const id of Object.keys(reg.matches)) {
    const e = reg.matches[id];
    for (const dir of Object.keys(e.retired_dirs || {})) {
      assert.ok(C.DIRS[dir] && dir !== C.X_DEFAULT_DIR, id + " : version retiree invalide " + dir);
      assert.ok(!(e.dirs || []).includes(dir), id + " : " + dir + " a la fois generee et retiree");
      assert.ok(text.includes(C.matchPath(dir, id)), id + " : aucune 301 pour " + C.matchPath(dir, id));
    }
  }
});

test("aucune fuite premium ni conf sur une page conservee (meme depuis un match complet)", () => {
  const snap = L.publicSnapshot(WITH_PREMIUM);
  const keys = JSON.stringify(snap);
  for (const k of PREMIUM.PREMIUM_FIELDS.concat(["conf", "has_signal", "c1", "cn", "c2", "co25", "elo_home"])) {
    assert.ok(!new RegExp('"' + k + '":').test(keys), "instantane : champ " + k);
  }
  assert.deepEqual(PREMIUM.deepPremiumLeaks(snap), []);
  // Match offert : l'instantane reste en liste blanche.
  assert.deepEqual(PREMIUM.deepPremiumLeaks(Object.assign(L.publicSnapshot(Object.assign({}, WITH_PREMIUM, { is_free: true })), { is_free: false })), []);
  const root = tmpRoot();
  try {
    cycle(root, [WITH_PREMIUM], at(-DAY));
    const { reg } = cycle(root, [], at(3 * HOUR));
    assert.doesNotMatch(fs.readFileSync(path.join(root, L.REGISTRY_FILE), "utf8"), /SECRET|Over 2\.5|8\.37|"conf"|goal_threat_score|pari_rec/);
    for (const rel of ["match/777001.html", "mx/match/777001.html", "es/match/777001.html"]) {
      const html = readT(root, rel);
      assert.doesNotMatch(html, /SECRET|Over 2\.5|Plus de 2,5 buts|8[.,]37|1[.,]91|61[.,]3|data-market-label=|\/10\)/, rel + " : donnee reservee");
      assert.doesNotMatch(html, /PRELOADED_MATCH/, rel);
    }
    assert.equal(reg.matches["777001"].snapshot.conf, undefined);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  // Page active d'un match non offert : aucun pari ni conf dans le texte visible.
  const active = SEO.renderMatchPage(TPL, PREMIUM.stripPremium(WITH_PREMIUM), "mx");
  assert.doesNotMatch(visibleText(active), /Over 2\.5|8[.,]37|SECRET/);
  assert.deepEqual(PREMIUM.deepPremiumLeaks(JSON.parse(active.match(/<script>var PRELOADED_MATCH=([\s\S]*?);<\/script>/)[1])), []);
});

test("seuil de contenu : faits publics au rendu, page trop mince noindex et hors sitemap", () => {
  assert.ok(SEO.matchContentWords(RICH, "fr") >= SEO.MIN_INDEXABLE_WORDS);
  assert.ok(SEO.matchContentWords(THIN, "fr") < SEO.MIN_INDEXABLE_WORDS);
  const html = SEO.renderMatchPage(TPL, RICH, "es");
  for (const re of [/Racha reciente/, /Clasificación/, /Enfrentamientos directos/, /Alineaciones iniciales/, /Estadio Azteca/, /hora peninsular/, /Ame Player11/, /1\.º Club America: 22 pts/]) assert.match(visibleText(html), re);
  const fr = SEO.renderMatchPage(TPL, RICH, "fr");
  assert.match(visibleText(fr), /Forme récente/);
  assert.match(visibleText(fr), /Confrontations directes/);
  assert.doesNotMatch(head(fr), /noindex/);
  const root = tmpRoot();
  try {
    cycle(root, [RICH, THIN], at(-DAY));
    assert.match(head(readT(root, "match/777002.html")), /<meta name="robots" content="noindex,follow">/);
    assert.match(head(readT(root, "mx/match/777002.html")), /noindex,follow/);
    assert.doesNotMatch(readT(root, "sitemap-fr.xml"), /777002/);
    assert.doesNotMatch(readT(root, "sitemap-matches-i18n.xml"), /777002/);
    assert.match(readT(root, "sitemap-fr.xml"), /777001/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("pipeline et publication : registre commite avec son chemin, jamais publie, lien d'accueil seulement vers une version generee", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /var MATCH_LIFECYCLE=require\('\.\/scripts\/match-lifecycle\.js'\);/);
  assert.match(wf, /MATCH_LIFECYCLE\.updateRegistry\(registreLc,matchsData,maintenantLc,\{historique:histLc\}\)/);
  assert.match(wf, /SEO_PAGES\.writeArchivedMatchPages\(registreLc,/);
  assert.match(wf, /registry:registreLc/);
  assert.match(wf, /MATCH_LIFECYCLE\.saveRegistry\('\.',registreLc\)/);
  assert.match(wf, /MATCH_LIFECYCLE\.writeRedirects\('\.',registreLc\)/);
  assert.match(wf, /SEO_PAGES\.matchRobotsMeta\(m,'fr',\{now:maintenantLc\}\)/);
  // Lien d'accueil : page de la version, sinon version la plus proche generee (meme fonction que build-locales).
  assert.match(wf, /MATCH_LIFECYCLE\.versionMatchHref\(m\.id,m\.league_key,dir\|\|'fr','\.'\)/);
  // _redirects commite (301 des pages retirees) mais jamais restaure a plat
  // apres un reset : le bloc est reapplique depuis le registre restaure.
  const outputs = wf.match(/OUTPUTS="([^"]*)"/)[1].split(/\s+/);
  assert.ok(!outputs.includes("_redirects"), "_redirects ne doit pas etre restaure a plat");
  assert.match(wf, /LIFECYCLE_DERIVED="_redirects"/);
  assert.match(wf, /LIFECYCLE_FILES="data\/match-pages-registry\.json data\/league-hubs-registry\.json"/);
  assert.equal((wf.match(/git add \$OUTPUTS \$DIR_INDEXES \$SEO_DIRS sitemap-\*\.xml \$LIFECYCLE_FILES \$LIFECYCLE_DERIVED/g) || []).length, 2);
  assert.match(wf, /if \[ -e "\$p" \]; then cp --parents "\$p" "\$SAVE\/"; fi/);
  assert.match(wf, /cp "\$SAVE\/\$p" "\$p"/);
  assert.match(wf, /L\.writeRedirects\('\.', L\.loadRegistry\('\.'\)\)/);
  // data/ n'est jamais copie dans dist/.
  assert.match(read("scripts/build-public.js"), /\^\(supabase\|scripts\|tests\|docs\|raw_api\|config\|data\|/);
});
