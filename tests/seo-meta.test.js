"use strict";
// Titles et descriptions (audit SEO du 15/09/2026 : 328 titles > 60 caracteres,
// 121 descriptions > 160, doublons exacts, descriptions match en liste de
// mots-cles). Regles : title <= 60, description <= 155, phrases naturelles,
// sans doublon exact dans une version, vocabulaire de promesse interdit.
// Verifie sur le site construit ET sur les sources (i18n/seo, gabarits de
// scripts/seo-pages.js avec des noms longs, config/club-hubs.json, manifestes).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { ROOT, buildSite } = require("./helpers/built-site.js");
const AUDIT = require("../scripts/seo-site-audit.js");
const C = require("../scripts/seo-common.js");
const SEO = require("../scripts/seo-pages.js");
const ARTICLES = require("../scripts/build-local-articles.js");

// Vocabulaire interdit (titles et descriptions).
const BANNED = /\b(sûr(e|s|es)?|gagnant(e|s|es)?|garanti(e|s|es)?|bonus|safe bets?|sure wins?|fijos?|seguros?)\b/i;
const len = AUDIT.charLength;

let site, report;
before(() => { site = buildSite(); report = AUDIT.audit(site.dir); });
after(() => { if (site) site.cleanup(); });

test("site construit : title <= 60 et description <= 155 sur toute page indexable", () => {
  assert.ok(report.indexable > 100);
  assert.deepEqual(report.missingMeta.map((p) => p.url), [], "pages indexables sans title ou sans description");
  assert.deepEqual(report.longTitles.map((p) => p.url + " (" + len(p.title) + ") " + p.title), []);
  assert.deepEqual(report.longDescriptions.map((p) => p.url + " (" + len(p.description) + ") " + p.description), []);
});

test("site construit : aucun title ni description en double dans une meme version", () => {
  assert.deepEqual(report.duplicateTitlesByVersion, []);
  assert.deepEqual(report.duplicateDescriptionsByVersion, []);
});

test("site construit : aucun vocabulaire interdit dans les titles et descriptions", () => {
  const bad = Object.values(report.pages).filter((p) => p.indexable && BANNED.test((p.title || "") + " " + (p.description || "")))
    .map((p) => p.url + " : " + ((p.title || "") + " " + (p.description || "")).match(BANNED)[0]);
  assert.deepEqual(bad, []);
});

test("i18n/seo : gabarits hub ligue et match dans les limites avec les noms les plus longs, specifiques au marche", () => {
  const leagues = C.LEAGUES.map((l) => l.key);
  const long = { id: 1, league_key: "argentina_liga_profesional", league: "Liga Profesional Argentina", date: "2026-09-30 21:00",
    home: { n: "Deportivo La Coruna", id: 1 }, away: { n: "Universidad de Chile", id: 2 } };
  for (const dir of C.DIR_CODES) {
    const s = C.seoConf(dir);
    for (const k of Object.keys(s.meta)) {
      assert.ok(len(s.meta[k].title.replace("{pro_price}", "MX$1,990")) <= 60, dir + " meta." + k + ".title");
      assert.ok(len(s.meta[k].description.replace("{pro_price}", "MX$1,990")) <= 155, dir + " meta." + k + ".description");
      assert.doesNotMatch(s.meta[k].title + " " + s.meta[k].description, BANNED, dir + " meta." + k);
    }
    const titles = new Set(), descs = new Set();
    for (const key of leagues) {
      const hub = SEO.renderLeagueHub(key, dir, [], { data: { upcoming: [], results: [], standings: null, clubs: [] } });
      const t = C.escHtml ? hub.html.match(/<title>([^<]*)<\/title>/)[1] : "";
      const title = AUDIT.unesc(t), desc = AUDIT.unesc(hub.html.match(/<meta name="description" content="([^"]*)"/)[1]);
      assert.ok(len(title) <= 60, dir + "/" + key + " hub title " + len(title) + " : " + title);
      assert.ok(len(desc) <= 155, dir + "/" + key + " hub description " + len(desc) + " : " + desc);
      assert.doesNotMatch(title + " " + desc, BANNED, dir + "/" + key);
      assert.ok(!titles.has(title) && !descs.has(desc), dir + "/" + key + " : title ou description de hub en double");
      titles.add(title); descs.add(desc);
    }
    for (const m of [long, Object.assign({}, long, { home: { n: "Arsenal", id: 42 }, away: { n: "Chelsea", id: 49 }, league_key: "premier", league: "Premier League" })]) {
      const t = SEO.matchTitle(m, dir), d = SEO.matchDescription(m, dir);
      assert.ok(len(t) <= 60, dir + " match title " + len(t) + " : " + t);
      assert.ok(len(d) <= 155, dir + " match description " + len(d) + " : " + d);
      assert.doesNotMatch(t + " " + d, BANNED, dir + " match");
      assert.match(t, new RegExp(m.home.n.split(" ")[0]), dir + " : title sans l'equipe a domicile");
    }
  }
  // Marche : heure UK / Premier League (gb), SAST / PSL (za), Liga MX / centro (mx).
  const hubTxt = (key, dir) => SEO.renderLeagueHub(key, dir, [], { data: { upcoming: [], results: [], standings: null, clubs: [] } }).html;
  assert.match(hubTxt("premier", "gb"), /UK time/);
  assert.match(hubTxt("south_africa_premiership", "za"), /SAST/);
  assert.match(hubTxt("south_africa_premiership", "za"), /PSL/);
  assert.match(hubTxt("liga_mx", "mx"), /centro de México/);
  const premierLong = { id: 2, league_key: "premier", league: "Premier League", date: "2026-09-30 21:00", home: { n: "Arsenal", id: 42 }, away: { n: "Chelsea", id: 49 } };
  assert.match(SEO.matchDescription(premierLong, "gb"), /UK time/);
  assert.match(SEO.matchDescription(premierLong, "za"), /SAST/);
  assert.match(SEO.matchDescription(Object.assign({}, premierLong, { league_key: "liga_mx", league: "Liga MX" }), "mx"), /centro de México/);
  // en, gb et za ne partagent pas le meme gabarit de title.
  assert.equal(new Set(["en", "gb", "za"].map((d) => SEO.matchTitle(premierLong, d))).size, 3);
});

test("config/club-hubs.json et manifestes d'articles : longueurs, unicite, vocabulaire", () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "config/club-hubs.json"), "utf8"));
  const seen = new Set();
  cfg.clubs.concat(cfg.derbies).filter((e) => e.active === true).forEach((e) => {
    Object.keys(e.pages || {}).forEach((d) => {
      const p = e.pages[d];
      assert.ok(len(p.title) <= 60, e.key + "/" + d + " title " + len(p.title) + " : " + p.title);
      assert.ok(len(p.description) <= 155, e.key + "/" + d + " description " + len(p.description));
      assert.doesNotMatch(p.title + " " + p.description, BANNED, e.key + "/" + d);
      assert.ok(!seen.has(d + "|" + p.title), "title en double " + p.title);
      seen.add(d + "|" + p.title);
    });
  });
  Object.keys(cfg.versions).forEach((d) => {
    const h = cfg.versions[d].hub;
    assert.ok(len(h.title) <= 60 && len(h.description) <= 155, "hub " + d);
    assert.doesNotMatch(h.title + " " + h.description, BANNED, "hub " + d);
  });
  for (const m of ARTICLES.loadManifests()) {
    const items = m.articles.map((a) => ({ id: a.slug, title: ARTICLES.pageTitle(a.title), description: a.description }))
      .concat([{ id: "hub", title: ARTICLES.pageTitle(m.labels.hubTitle), description: m.labels.hubDescription }]);
    items.forEach((x) => {
      assert.ok(len(x.title) <= 60, m.dir + "/" + x.id + " title " + len(x.title) + " : " + x.title);
      assert.ok(len(x.description) <= 155, m.dir + "/" + x.id + " description " + len(x.description));
      assert.doesNotMatch(x.title + " " + x.description, BANNED, m.dir + "/" + x.id);
    });
  }
});

// 15/09/2026 : /es/ et /mx/ publiaient 158 caracteres pour Instituto Cordoba vs
// Estudiantes de Rio Cuarto (Liga Profesional Argentina) : gabarit court sans competition.
test("description match <= 155 avec des noms d'equipes et une competition a rallonge, dans toutes les versions", () => {
  const m = { id: 1493132, league_key: "argentina_liga_profesional", league: "Liga Profesional Argentina", date: "2026-09-15 23:30",
    home: { n: "Instituto Cordoba", id: 1 }, away: { n: "Estudiantes de Rio Cuarto", id: 2 } };
  for (const dir of C.DIR_CODES) {
    const d = SEO.matchDescription(m, dir);
    assert.ok(len(d) <= 155, dir + " (" + len(d) + ") " + d);
    assert.match(d, /Instituto Cordoba/);
    assert.doesNotMatch(d, /\(\s*\)|,\s*,/, dir + " : ponctuation orpheline");
  }
});
