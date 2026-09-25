"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { generateLocalizedSitemaps, sitemapDirs, pageSeo, urlToFile, LEGAL_FILE_LIST } = require("../scripts/i18n-sitemaps.js");

const ROOT = path.join(__dirname, "..");
const LOCALES = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/locales.json"), "utf8"));
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
const PAGES = require(path.join(ROOT, "scripts/i18n-manifest.js"));
// 25/09/2026 : versions retirees (config/markets.json#_retiredDirs, de/it/pt) :
// ni sitemap, ni hreflang ; leurs dictionnaires restent dans locales.json.
const { PUBLIC_DIRS: DIRS, RETIRED_DIRS } = require("./helpers/public-dirs.js");
// Une page noSitemap:true (page noindex : compte, connexion, match...) est
// generee normalement mais ne doit jamais apparaitre dans un sitemap.
const SITEMAP_PAGES = PAGES.filter(function (p) { return !p.noSitemap; });
const GUIDES = fs.readdirSync(path.join(ROOT, "blog/guides")).filter(function (f) { return /\.html$/.test(f) && f !== "index.html"; });

function generate() {
  var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-sitemap-"));
  var files = generateLocalizedSitemaps(LOCALES, PAGES, "2026-01-01", tmpDir);
  var out = {};
  files.forEach(function (f) { out[f] = fs.readFileSync(path.join(tmpDir, f), "utf8"); });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return { files: files, xml: out };
}
function urls(xml) {
  var list = [], re = /<url><loc>([^<]+)<\/loc>[\s\S]*?<\/url>/g, m;
  while ((m = re.exec(xml))) {
    var alts = [], a, reA = /hreflang="([^"]+)" href="([^"]+)"/g;
    while ((a = reA.exec(m[0]))) alts.push(a[1] + " " + a[2]);
    list.push({ loc: m[1], alternates: alts.sort() });
  }
  return list;
}
function legalExists(dir, file) { return fs.existsSync(path.join(ROOT, "legal", dir, file)); }
// Blog porte par le sitemap d'un repertoire : fr = blog racine, en/es/de/it/pt/mx
// = leur propre blog, gb/za = aucun (ils renvoient vers /en/blog/).
function blogPrefix(dir) {
  var b = MARKETS._dirs[dir].blogDir;
  if (!b) return dir === "fr" ? "" : null;
  return b === dir ? "/" + dir : null;
}

test("i18n sitemaps: un sitemap par repertoire public (langues, puis marches pays gb/za/mx)", () => {
  var dirs = sitemapDirs(LOCALES);
  var langs = LOCALES.supported.filter(function (l) { return DIRS.indexOf(l) !== -1; });
  assert.deepEqual(dirs.slice(0, langs.length), langs);
  assert.deepEqual(dirs.slice().sort(), DIRS.slice().sort());
  Object.keys(RETIRED_DIRS).forEach(function (d) {
    assert.ok(dirs.indexOf(d) === -1, d + " : version retiree dans les sitemaps");
    assert.ok(!fs.existsSync(path.join(ROOT, "sitemap-" + d + "-i18n.xml")), "sitemap-" + d + "-i18n.xml encore present");
  });
  ["gb", "za", "mx"].forEach(function (d) { assert.ok(dirs.indexOf(d) !== -1, d + " absent des sitemaps"); });
  assert.ok(!PAGES.some(function (p) { return p.file === "historique.html"; }), "historique.html ne doit plus etre une page publique");
});

test("i18n sitemaps: fichiers valides, hreflang complet (dont en-GB/en-ZA/es-MX) + x-default vers /en/", () => {
  var g = generate();
  var dirs = sitemapDirs(LOCALES);
  assert.equal(g.files.length, dirs.length);

  g.files.forEach(function (fname, i) {
    var dir = dirs[i];
    assert.equal(fname, "sitemap-" + dir + "-i18n.xml");
    var xml = g.xml[fname];
    var expected = SITEMAP_PAGES.filter(function (p) {
      return !(p.file === "landing.html" && MARKETS._dirs[dir].customLanding);
    });
    var legal = LEGAL_FILE_LIST.filter(function (f) { return legalExists(dir, f); });
    var prefix = blogPrefix(dir);
    // Blog : accueil (/blog.html pour le FR racine) et chaque guide ;
    // /blog/guides/ (canonical = accueil du blog) jamais ; /blog/ jamais
    // (Netlify le redirige vers /blog ; blog/index.html est noindex).
    // Articles d'actualite a la racine du blog (19/09/2026).
    var rootArticles = prefix == null ? [] : fs.readdirSync(path.join(ROOT, prefix.slice(1), "blog"))
      .filter(function (f) { return /\.html$/.test(f) && f !== "index.html"; })
      .map(function (f) { return prefix + "/blog/" + f; });
    var blog = (prefix == null ? [] : (prefix === "" ? ["/blog.html"] : [prefix + "/blog/"])
      .concat(GUIDES.map(function (f) { return prefix + "/blog/guides/" + f; }))).concat(rootArticles);

    // Une <url> par page promue dans le sitemap, pas une de plus/moins.
    var urlCount = (xml.match(/<url>/g) || []).length;
    assert.equal(urlCount, expected.length + legal.length + blog.length, fname + " : nombre d'URLs incorrect");

    PAGES.filter(function (p) { return p.noSitemap; }).forEach(function (page) {
      var slug = page.file === "index.html" ? "" : page.file;
      assert.ok(!xml.includes("<loc>https://iashark.com/" + dir + "/" + slug + "</loc>"),
        fname + " : " + page.file + " ne devrait pas etre dans le sitemap (noSitemap:true)");
    });
    expected.forEach(function (page) {
      var slug = page.file === "index.html" ? "" : page.file;
      assert.ok(xml.includes("<loc>https://iashark.com/" + dir + "/" + slug + "</loc>"), fname + " : URL manquante pour " + page.file);
    });
    legal.forEach(function (f) {
      assert.ok(xml.includes("<loc>https://iashark.com/" + dir + "/" + f + "</loc>"), fname + " : page legale manquante " + f);
    });
    blog.forEach(function (p) {
      assert.ok(xml.includes("<loc>https://iashark.com" + p + "</loc>"), fname + " : URL blog manquante " + p);
    });
    assert.ok(!/<loc>[^<]*\/blog\/guides\/<\/loc>/.test(xml), fname + " : /blog/guides/ (canonical = accueil du blog) ne doit pas etre liste");
    if (prefix == null) assert.ok(!/<loc>[^<]*\/blog[./]/.test(xml), fname + " : aucun blog propre, aucune URL blog attendue");

    DIRS.forEach(function (d2) {
      var hl = MARKETS._dirs[d2].hreflang;
      assert.match(xml, new RegExp('hreflang="' + hl + '" href="https://iashark\\.com/' + d2 + '/'), fname + " : hreflang " + hl + " manquant");
    });
    assert.match(xml, /hreflang="x-default" href="https:\/\/iashark\.com\/en\//, fname + " : hreflang x-default manquant");
    Object.keys(RETIRED_DIRS).forEach(function (r) {
      assert.doesNotMatch(xml, new RegExp('hreflang="' + MARKETS._dirs[r].hreflang + '"|iashark\\.com/' + r + '/'), fname + " : version retiree " + r);
    });

    ["url", "urlset"].forEach(function (tag) {
      var opens = (xml.match(new RegExp("<" + tag + "(?:\\s|>)", "g")) || []).length;
      var closes = (xml.match(new RegExp("</" + tag + ">", "g")) || []).length;
      assert.equal(opens, closes, fname + " : balises <" + tag + "> desequilibrees");
    });
  });
});

test("i18n sitemaps: blog et pages legales = URLs finales (fichier servi, non noindex, canonical = loc, hreflang = <head>)", () => {
  var g = generate();
  var seen = {};
  Object.keys(g.xml).forEach(function (fname) {
    urls(g.xml[fname]).forEach(function (u) {
      assert.ok(!seen[u.loc], u.loc + " liste deux fois (" + seen[u.loc] + ", " + fname + ")");
      seen[u.loc] = fname;
      var rel = urlToFile(u.loc);
      var legalMatch = rel.match(/^([a-z]{2})\/([a-z-]+\.html)$/);
      var isLegal = legalMatch && LEGAL_FILE_LIST.indexOf(legalMatch[2]) !== -1;
      var isBlog = /(^|\/)blog(\.html|\/)/.test(rel);
      if (!isLegal && !isBlog) return;
      // Les pages legales sont servies depuis legal/<dir>/ recopie par le build.
      var src = isLegal ? path.join("legal", legalMatch[1], legalMatch[2]) : rel;
      assert.ok(fs.existsSync(path.join(ROOT, src)), u.loc + " : aucun fichier " + src);
      var seo = pageSeo(fs.readFileSync(path.join(ROOT, src), "utf8"));
      assert.equal(seo.noindex, false, u.loc + " : page noindex dans un sitemap");
      assert.equal(seo.canonical, u.loc, u.loc + " : canonical different de l'URL listee");
      if (isBlog) {
        var declared = seo.alternates.map(function (a) { return a.hreflang + " " + a.href; }).sort();
        assert.deepEqual(u.alternates, declared, u.loc + " : hreflang du sitemap != hreflang du <head>");
      } else {
        var dirs = DIRS.filter(function (d) { return legalExists(d, legalMatch[2]); });
        assert.equal(u.alternates.length, dirs.length + 1, u.loc + " : hreflang legaux incomplets");
        var xd = dirs.indexOf("en") !== -1 ? "en" : "fr";
        assert.ok(u.alternates.indexOf("x-default https://iashark.com/" + xd + "/" + legalMatch[2]) !== -1, u.loc + " : x-default manquant");
      }
      u.alternates.forEach(function (a) {
        var href = a.split(" ")[1];
        var f = urlToFile(href);
        var lm = f.match(/^([a-z]{2})\/([a-z-]+\.html)$/);
        var exists = fs.existsSync(path.join(ROOT, f)) || (lm && legalExists(lm[1], lm[2]));
        assert.ok(exists, u.loc + " : hreflang vers une URL sans fichier " + href);
      });
    });
  });
  // Les guides traduits de mx sont dans le sitemap mx, jamais dans es.
  assert.equal(seen["https://iashark.com/mx/blog/"], "sitemap-mx-i18n.xml");
  assert.equal(seen["https://iashark.com/blog.html"], "sitemap-fr-i18n.xml");
});
