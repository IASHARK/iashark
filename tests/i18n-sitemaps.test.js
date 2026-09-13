"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { generateLocalizedSitemaps, sitemapDirs } = require("../scripts/i18n-sitemaps.js");

const ROOT = path.join(__dirname, "..");
const LOCALES = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/locales.json"), "utf8"));
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
const PAGES = require(path.join(ROOT, "scripts/i18n-manifest.js"));
const DIRS = Object.keys(MARKETS._dirs);
// Une page noSitemap:true (page noindex : compte, connexion, match...) est
// generee normalement mais ne doit jamais apparaitre dans un sitemap.
const SITEMAP_PAGES = PAGES.filter(function (p) { return !p.noSitemap; });

test("i18n sitemaps: un sitemap par repertoire public (langues, puis marches pays gb/za/mx)", () => {
  var dirs = sitemapDirs(LOCALES);
  assert.deepEqual(dirs.slice(0, LOCALES.supported.length), LOCALES.supported);
  assert.deepEqual(dirs.slice().sort(), DIRS.slice().sort());
  ["gb", "za", "mx"].forEach(function (d) { assert.ok(dirs.indexOf(d) !== -1, d + " absent des sitemaps"); });
  assert.ok(!PAGES.some(function (p) { return p.file === "historique.html"; }), "historique.html ne doit plus etre une page publique");
});

test("i18n sitemaps: fichiers valides, hreflang complet (dont en-GB/en-ZA/es-MX) + x-default vers /fr/", () => {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-sitemap-"));
  var files = generateLocalizedSitemaps(LOCALES, PAGES, "2026-01-01", tmpDir);
  var dirs = sitemapDirs(LOCALES);
  assert.equal(files.length, dirs.length);

  files.forEach(function (fname, i) {
    var dir = dirs[i];
    assert.equal(fname, "sitemap-" + dir + "-i18n.xml");
    var xml = fs.readFileSync(path.join(tmpDir, fname), "utf8");
    var expected = SITEMAP_PAGES.filter(function (p) {
      return !(p.file === "landing.html" && MARKETS._dirs[dir].customLanding);
    });

    // Une <url> par page promue dans le sitemap, pas une de plus/moins.
    var urlCount = (xml.match(/<url>/g) || []).length;
    assert.equal(urlCount, expected.length, fname + " : nombre d'URLs incorrect");

    PAGES.filter(function (p) { return p.noSitemap; }).forEach(function (page) {
      var slug = page.file === "index.html" ? "" : page.file;
      assert.ok(!xml.includes("<loc>https://iashark.com/" + dir + "/" + slug + "</loc>"),
        fname + " : " + page.file + " ne devrait pas etre dans le sitemap (noSitemap:true)");
    });
    expected.forEach(function (page) {
      var slug = page.file === "index.html" ? "" : page.file;
      assert.ok(xml.includes("<loc>https://iashark.com/" + dir + "/" + slug + "</loc>"), fname + " : URL manquante pour " + page.file);
    });

    DIRS.forEach(function (d2) {
      var hl = MARKETS._dirs[d2].hreflang;
      assert.match(xml, new RegExp('hreflang="' + hl + '" href="https://iashark\\.com/' + d2 + '/'), fname + " : hreflang " + hl + " manquant");
    });
    assert.match(xml, /hreflang="x-default" href="https:\/\/iashark\.com\/fr\//, fname + " : hreflang x-default manquant");

    ["url", "urlset"].forEach(function (tag) {
      var opens = (xml.match(new RegExp("<" + tag + "(?:\\s|>)", "g")) || []).length;
      var closes = (xml.match(new RegExp("</" + tag + ">", "g")) || []).length;
      assert.equal(opens, closes, fname + " : balises <" + tag + "> desequilibrees");
    });
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
