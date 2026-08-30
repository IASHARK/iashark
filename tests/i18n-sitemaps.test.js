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

test("i18n sitemaps: genere un fichier valide par locale, avec hreflang complet + x-default", () => {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-sitemap-"));
  var files = generateLocalizedSitemaps(LOCALES, PAGES, "2026-01-01", tmpDir);
  assert.equal(files.length, LOCALES.supported.length);

  files.forEach(function (fname, i) {
    var locale = LOCALES.supported[i];
    assert.equal(fname, "sitemap-" + locale + "-i18n.xml");
    var xml = fs.readFileSync(path.join(tmpDir, fname), "utf8");

    // Une <url> par page localisable, et pas une de plus/moins.
    var urlCount = (xml.match(/<url>/g) || []).length;
    assert.equal(urlCount, PAGES.length, fname + " : nombre d'URLs incorrect");

    // Chaque <url> pointe vers cette locale et porte hreflang pour les 6
    // langues + x-default.
    PAGES.forEach(function (page) {
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
