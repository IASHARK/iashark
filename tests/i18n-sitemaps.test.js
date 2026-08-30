"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { generateLocalizedSitemaps } = require("../scripts/i18n-sitemaps.js");

const ROOT = path.join(__dirname, "..");
const LOCALES = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/locales.json"), "utf8"));
const PAGES = require(path.join(ROOT, "scripts/i18n-manifest.js"));
// Une page noSitemap:true est traduite/generee normalement mais ne doit
// jamais apparaitre dans un sitemap (ex. historique.html, retiree du
// produit public - voir IASHARK_V2_RECETTE_VISUELLE.md).
const SITEMAP_PAGES = PAGES.filter(function (p) { return !p.noSitemap; });

test("i18n sitemaps: genere un fichier valide par locale, avec hreflang complet + x-default", () => {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-sitemap-"));
  var files = generateLocalizedSitemaps(LOCALES, PAGES, "2026-01-01", tmpDir);
  assert.equal(files.length, LOCALES.supported.length);

  files.forEach(function (fname, i) {
    var locale = LOCALES.supported[i];
    assert.equal(fname, "sitemap-" + locale + "-i18n.xml");
    var xml = fs.readFileSync(path.join(tmpDir, fname), "utf8");

    // Une <url> par page localisable ET promue dans le sitemap (pas les
    // pages noSitemap:true), et pas une de plus/moins.
    var urlCount = (xml.match(/<url>/g) || []).length;
    assert.equal(urlCount, SITEMAP_PAGES.length, fname + " : nombre d'URLs incorrect");

    // Une page noSitemap:true ne doit jamais apparaitre dans le sitemap.
    PAGES.filter(function (p) { return p.noSitemap; }).forEach(function (page) {
      var slug = page.file === "index.html" ? "" : page.file;
      var loc = "https://iashark.com/" + locale + "/" + slug;
      assert.ok(!xml.includes("<loc>" + loc + "</loc>"), fname + " : " + page.file + " ne devrait pas etre dans le sitemap (noSitemap:true)");
    });

    // Chaque <url> pointe vers cette locale et porte hreflang pour les 6
    // langues + x-default.
    SITEMAP_PAGES.forEach(function (page) {
      var slug = page.file === "index.html" ? "" : page.file;
      var loc = "https://iashark.com/" + locale + "/" + slug;
      assert.ok(xml.includes("<loc>" + loc + "</loc>"), fname + " : URL manquante pour " + page.file);
    });
    LOCALES.supported.forEach(function (l2) {
      assert.match(xml, new RegExp('hreflang="' + l2 + '"'), fname + " : hreflang " + l2 + " manquant");
    });
    assert.match(xml, /hreflang="x-default"/, fname + " : hreflang x-default manquant");

    // XML bien forme au sens strict minimal : autant d'ouvrantes que de
    // fermantes pour les balises structurantes.
    ["url", "urlset"].forEach(function (tag) {
      var opens = (xml.match(new RegExp("<" + tag + "(?:\\s|>)", "g")) || []).length;
      var closes = (xml.match(new RegExp("</" + tag + ">", "g")) || []).length;
      assert.equal(opens, closes, fname + " : balises <" + tag + "> desequilibrees");
    });
  });

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
