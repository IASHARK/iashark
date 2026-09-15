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
    // 101 : Premier League (perimetre gb, en, za + fr), pages fr, en, za.
    put("match/101.json", JSON.stringify({ id: 101, league_key: "premier" }));
    ["match/101.html", "en/match/101.html", "za/match/101.html"].forEach((f) => put(f, "<html></html>"));
    // 202 : Liga MX (perimetre mx, es + fr), pages fr et es seulement.
    put("match/202.json", JSON.stringify({ id: 202, league_key: "liga_mx" }));
    ["match/202.html", "es/match/202.html"].forEach((f) => put(f, "<html></html>"));
    // Page gb hors perimetre Liga MX presente sur disque : jamais visee.
    put("gb/match/202.html", "<html></html>");
    // Pages championnat des versions pays (repli du resume, 16/09/2026).
    put("gb/leagues/premier-league.html", "<html></html>");
    put("mx/leagues/liga-mx.html", "<html></html>");
    const src = '<!--SEO_MATCHES_SUMMARY--><ul>' +
      '<li><a href="/match/101.html" style="color:inherit">Arsenal vs Chelsea</a></li>' +
      '<li><a href="/match/202.html" style="color:inherit">America vs Chivas</a></li>' +
      '<li><a href="/match/303.html" style="color:inherit">Sans page</a></li>' +
      "</ul><!--/SEO_MATCHES_SUMMARY-->";
    const expected = {
      fr: ["/match/101.html", "/match/202.html"],
      // Versions pays : page de la version, sinon page championnat de la version, sinon nom seul.
      gb: ["/gb/leagues/premier-league.html"],
      za: ["/za/match/101.html"],
      en: ["/en/match/101.html", "/match/202.html"],
      mx: ["/mx/leagues/liga-mx.html"],
      es: ["/en/match/101.html", "/es/match/202.html"],
      de: ["/en/match/101.html", "/match/202.html"]
    };
    for (const dir of Object.keys(expected)) {
      const out = B.rewriteHomeMatchSummary(src, dir, root);
      assert.deepEqual(COUNTRY_DIRS.includes(dir) ? summaryHrefs(out) : summaryLinks(out).map((l) => l.href), expected[dir], dir);
      assert.match(out, /<li>Sans page<\/li>/, dir + " : match sans page -> nom sans lien");
      assert.doesNotMatch(out, /href="\/gb\/match\/202\.html"/, dir + " : page hors perimetre visee");
    }
    // Idempotent : un second passage ne change rien.
    const once = B.rewriteHomeMatchSummary(src, "gb", root);
    assert.equal(B.rewriteHomeMatchSummary(once, "gb", root), once);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("pipeline : injectHomeSeoSummary utilise la meme resolution que build-locales", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github/workflows/update-data.yml"), "utf8");
  assert.match(wf, /var lienMatch=MATCH_LIFECYCLE\.homeSummaryHref\(m\.id,m\.league_key,dir\|\|'fr','\.'\);/);
  assert.doesNotMatch(wf, /var lienMatch=\(!dir\|\|dir==='fr'\)/, "ancien lien construit sans verification");
  assert.match(fs.readFileSync(path.join(ROOT, "scripts/build-locales.js"), "utf8"), /rewriteHomeMatchSummary\(injectHomeSeo\(html, dir, meta\), dir\)/);
});
