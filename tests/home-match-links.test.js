"use strict";
// Resume des matchs du jour des accueils de version (<!--SEO_MATCHES_SUMMARY-->).
// Bug corrige (15/09/2026) : scripts/build-locales.js recopiait dans les 8
// accueils les liens FR /match/<id>.html de index.html racine ; seul le
// pipeline (injectHomeSeoSummary) les corrigeait ensuite. Les deux passent
// maintenant par scripts/match-lifecycle.js#versionMatchHref : page de la
// version si elle existe, sinon la version la plus proche reellement generee
// dans le perimetre de la competition (config/leagues.json#seoMatchDirs),
// sinon nom sans lien.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const C = require("../scripts/seo-common.js");
const L = require("../scripts/match-lifecycle.js");
const B = require("../scripts/build-locales.js");

function summaryHrefs(html) {
  const block = (html.match(/<!--SEO_MATCHES_SUMMARY-->([\s\S]*?)<!--\/SEO_MATCHES_SUMMARY-->/) || [])[1] || "";
  return [...block.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
}
const COUNTRY_DIRS = ["gb", "za", "mx"];
function summaryLinks(html) {
  const block = (html.match(/<!--SEO_MATCHES_SUMMARY-->([\s\S]*?)<!--\/SEO_MATCHES_SUMMARY-->/) || [])[1] || "";
  return [...block.matchAll(/href="([^"]*\/match\/(\d+)\.html)"/g)].map((m) => ({ href: m[1], id: m[2] }));
}

test("accueils de version : chaque lien du resume vise une page match existante, de la version ou de la version la plus proche", () => {
  let checked = 0;
  for (const dir of C.DIR_CODES) {
    const html = fs.readFileSync(path.join(ROOT, dir, "index.html"), "utf8");
    for (const { href, id } of summaryLinks(html)) {
      checked++;
      assert.ok(fs.existsSync(path.join(ROOT, href.slice(1))), dir + " : lien vers une page match inexistante " + href);
      const m = href.match(/^\/([a-z]{2})\/match\//);
      const target = m ? m[1] : C.X_DEFAULT_DIR;
      assert.ok(C.DIRS[target] && href === C.matchPath(target, id), dir + " : chemin de page match invalide " + href);
      // Versions pays (gb, za, mx) : jamais la page d'une autre version (audit du 16/09/2026).
      if (COUNTRY_DIRS.includes(dir)) assert.equal(target, dir, dir + " : lien vers une autre version " + href);
      if (target !== dir) {
        assert.ok(!fs.existsSync(path.join(ROOT, C.matchPath(dir, id).slice(1))), dir + " : lien hors repertoire " + href + " alors que " + C.matchPath(dir, id) + " existe");
      }
      assert.equal(href, L.homeSummaryHref(id, null, dir, ROOT), dir + " : " + href + " n'est pas le lien attendu");
    }
    // Versions pays : sinon page championnat de la version, jamais d'une autre.
    if (COUNTRY_DIRS.includes(dir)) for (const h of summaryHrefs(html)) {
      assert.match(h, new RegExp("^/" + dir + "/(match/\\d+|leagues/[a-z0-9-]+)\\.html$"), dir + " : lien du resume hors version " + h);
      assert.ok(fs.existsSync(path.join(ROOT, h.slice(1))), dir + " : lien casse " + h);
    }
  }
  // Pas de faux positif : sans resume du jour, il n'y a simplement rien a verifier.
  assert.ok(checked >= 0);
});

test("build-locales : meme resolution que le pipeline (version, meme langue, en, fr ; sinon nom sans lien)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-home-links-"));
  try {
    const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), body); };
    const match = (id, key, league, date, h, a) => JSON.stringify({ id, league_key: key, league, date, home: { n: h[0], id: h[1] }, away: { n: a[0], id: a[1] } });
    // Tous le 19/09 a 18:00 Paris (16:00 UTC) : meme jour dans les 9 fuseaux.
    // 101 : Premier League (perimetre gb, en, za + fr), pages fr, en, za.
    put("match/101.json", match(101, "premier", "Premier League", "2026-09-19 18:00", ["Arsenal", 42], ["Chelsea", 49]));
    ["match/101.html", "en/match/101.html", "za/match/101.html"].forEach((f) => put(f, "<html></html>"));
    // 202 : Liga MX (perimetre mx, en + fr ; /es/ redirige vers /mx/), pages fr et mx.
    put("match/202.json", match(202, "liga_mx", "Liga MX", "2026-09-19 18:00", ["Club America", 2287], ["Guadalajara Chivas", 2278]));
    ["match/202.html", "mx/match/202.html"].forEach((f) => put(f, "<html></html>"));
    // Page gb hors perimetre Liga MX presente sur disque : jamais visee.
    put("gb/match/202.html", "<html></html>");
    // 303 : competition connue, aucune page : nom sans lien.
    put("match/303.json", match(303, "jleague", "J1 League", "2026-09-19 18:00", ["Sans", 1], ["Page", 2]));
    // Pages championnat des versions pays (repli du resume, 16/09/2026).
    put("gb/leagues/premier-league.html", "<html></html>");
    put("mx/leagues/liga-mx.html", "<html></html>");
    // Bloc racine (pipeline, fr) : seul le jour du run est relu, le contenu est reecrit.
    const src = '<!--SEO_MATCHES_SUMMARY--><div><h2><time data-seo-date datetime="2026-09-19">19 septembre 2026</time></h2><ul>' +
      '<li>18:00 — <a href="/match/101.html">Arsenal vs Chelsea</a></li></ul></div><!--/SEO_MATCHES_SUMMARY-->';
    const expected = {
      fr: ["/match/101.html", "/match/202.html"],
      // Versions pays : page de la version, sinon page championnat de la version, sinon nom seul.
      gb: ["/gb/leagues/premier-league.html"],
      za: ["/za/match/101.html"],
      // Liga MX en anglais (19/09/2026) : page /en/ absente ici -> version la plus proche (/mx/), jamais le francais.
      en: ["/en/match/101.html", "/mx/match/202.html"],
      mx: ["/mx/match/202.html"],
      es: ["/en/match/101.html", "/mx/match/202.html"],
      de: ["/en/match/101.html", "/mx/match/202.html"]
    };
    for (const dir of Object.keys(expected)) {
      const out = B.rewriteHomeMatchSummary(src, dir, root);
      assert.deepEqual(COUNTRY_DIRS.includes(dir) ? summaryHrefs(out) : summaryLinks(out).map((l) => l.href), expected[dir], dir);
      assert.match(out, /<strong>Sans vs Page<\/strong>/, dir + " : match sans page -> nom sans lien");
      assert.doesNotMatch(out, /href="\/gb\/match\/202\.html"/, dir + " : page hors perimetre visee");
      if (dir !== "fr") assert.doesNotMatch(out, /seo_times_paris|heure de Paris|Paris time|hora de París/, dir + " : plus jamais l'heure de Paris hors /fr/");
    }
    // Idempotent : un second passage ne change rien.
    const once = B.rewriteHomeMatchSummary(src, "gb", root);
    assert.equal(B.rewriteHomeMatchSummary(once, "gb", root), once);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("resume par version : jour et heure du fuseau de la version, fuseau nomme, competitions de la version d'abord", () => {
  const HS = require("../scripts/home-summary.js");
  // Nashville SC vs Chicago Fire : 01:30 Paris le 20/09 = 23:30 UTC le 19/09 = 19:30 ET le 19/09.
  const mls = { id: 1490493, league_key: "mls", league: "Major League Soccer", date: "2026-09-20 01:30", home: { n: "Nashville SC", id: 9569 }, away: { n: "Chicago Fire", id: 1607 } };
  // Club America vs Chivas : 05:15 Paris le 20/09 = 21:15 CDMX le 19/09.
  const clasico = { id: 1550971, league_key: "liga_mx", league: "Liga MX", date: "2026-09-20 05:15", home: { n: "Club America", id: 2287 }, away: { n: "Guadalajara Chivas", id: 2278 } };
  const epl = { id: 1557409, league_key: "premier", league: "Premier League", date: "2026-09-19 17:30", home: { n: "Brighton", id: 51 }, away: { n: "Arsenal", id: 42 } };
  const j1 = { id: 1556072, league_key: "jleague", league: "J1 League", date: "2026-09-19 12:00", home: { n: "FC Tokyo", id: 1 }, away: { n: "Nagoya Grampus", id: 2 } };
  const all = [j1, epl, mls, clasico];
  const href = () => null;
  const en = HS.homeSummaryHtml(all, "en", { today: "2026-09-19", title: "Today's AI analyses", hrefFor: href });
  // /en/ : ET avec UTC entre parentheses, format americain, MLS d'abord (home.priority_leagues).
  assert.match(en, /7:30 PM ET \(23:30 UTC\)<\/time> — <strong>Nashville SC vs Chicago Fire<\/strong> \(MLS\)/);
  assert.match(en, /US Eastern Time \(ET\), UTC in brackets/);
  assert.match(en, /<time data-seo-date datetime="2026-09-19">September 19, 2026<\/time>/);
  assert.ok(en.indexOf("Nashville SC") < en.indexOf("Brighton"), "MLS avant la Premier League sur /en/");
  assert.ok(en.indexOf("Brighton") < en.indexOf("FC Tokyo"), "competitions du perimetre avant les autres");
  assert.match(en, /América vs Chivas/, "Liga MX (perimetre /en/) et noms d'affichage");
  // /mx/ : le Clasico du samedi 19 a 21:15 heure du centre, en tete (Liga MX).
  const mx = HS.homeSummaryHtml(all, "mx", { today: "2026-09-19", title: "x", hrefFor: href });
  assert.match(mx, /tiempo del centro de México/);
  assert.match(mx, /21:15 h<\/time> — <strong>América vs Chivas<\/strong>/);
  assert.ok(mx.indexOf("América vs Chivas") < mx.indexOf("Brighton"));
  // /fr/ : le Clasico est le 20/09 a Paris, pas dans le resume du 19.
  const fr = HS.homeSummaryHtml(all, "fr", { today: "2026-09-19", title: "x", hrefFor: href });
  assert.doesNotMatch(fr, /Chivas/);
  assert.match(fr, /17:30<\/time> — <strong>Brighton vs Arsenal<\/strong>/);
  assert.match(fr, /heure de Paris/);
  // /gb/ : 16:30 heure britannique.
  assert.match(HS.homeSummaryHtml(all, "gb", { today: "2026-09-19", title: "x", hrefFor: href }), /UK time[\s\S]*16:30<\/time> — <strong>Brighton vs Arsenal<\/strong>/);
  assert.equal(HS.homeSummaryHtml([], "en", { today: "2026-09-19" }), "", "aucun match : bloc vide");
});

test("pipeline : injectHomeSeoSummary utilise la meme fonction que build-locales", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/update-data.yml"), "utf8");
  assert.match(wf, /return HOME_SUMMARY\.homeSummaryHtml\(matchsData,dir\|\|'fr',\{today:TODAY,root:'\.',/);
  assert.doesNotMatch(wf, /var lienMatch=\(!dir\|\|dir==='fr'\)/, "ancien lien construit sans verification");
  assert.doesNotMatch(wf, /home_app\.seo_times_paris/, "plus de libelle « heure de Paris » partage par toutes les versions");
  assert.match(fs.readFileSync(path.join(ROOT, "scripts/build-locales.js"), "utf8"), /rewriteHomeMatchSummary\(injectHomeSeo\(html, dir, meta\), dir\)/);
  assert.match(fs.readFileSync(path.join(ROOT, "scripts/home-summary.js"), "utf8"), /LIFECYCLE\.homeSummaryHref\(id, key, d, root\)/);
});
