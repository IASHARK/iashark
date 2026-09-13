#!/usr/bin/env node
"use strict";
// Sitemaps internationaux (MASTER SS19 - "sitemap international"). Un fichier
// par repertoire public : langues (fr en es de it pt) + marches pays (gb za mx,
// config/markets.json#_dirs). hreflang complet via xhtml:link sur chaque <url>.
//
// Contenu de chaque sitemap-<dir>-i18n.xml :
// 1. Les pages generees par scripts/build-locales.js (I18N_PAGES, meme source
//    que le build, via i18n-manifest.js), sauf celles marquees noSitemap:true
//    (pages noindex). hreflang : fr, en, es, de, it, pt, en-GB, en-ZA, es-MX +
//    x-default vers /fr/.
// 2. Les pages legales (config/markets.json#_legalFiles) presentes dans
//    legal/<dir>/ - exactement la regle du build, qui les recopie en
//    /<dir>/<fichier>.html. hreflang : les repertoires qui ont la page.
// 3. Les blogs : le blog FR racine (/blog.html, /blog/, /blog/guides/*.html)
//    dans le sitemap fr, /<langue>/blog/ dans le sitemap du repertoire qui le
//    possede (blogDir === repertoire : en, es, de, it, pt, mx). gb et za
//    renvoient vers /en/blog/ : aucune URL blog en double dans leurs sitemaps.
//    Une page blog n'y entre QUE si elle n'est pas noindex et si son canonical
//    est sa propre URL (/blog/guides/ et /<langue>/blog/guides/ ont pour
//    canonical l'accueil du blog : exclus). hreflang = ceux declares dans le
//    <head> de la page, limites aux cibles qui existent dans le depot.
//
// Module partage entre le pipeline (.github/workflows/update-data.yml, qui
// l'appelle apres chaque run reel avec I18N_LOCALES = i18n/locales.json) et
// cette CLI. La signature de generateLocalizedSitemaps est inchangee.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_URL = "https://iashark.com";
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
const DIRS = MARKETS._dirs;
const LEGAL_FILES = MARKETS._legalFiles || {};
const LEGAL_FILE_LIST = Object.keys(LEGAL_FILES).map(function (k) { return LEGAL_FILES[k]; });

// Repertoires couverts : langues de locales.json d'abord, puis les marches pays.
function sitemapDirs(locales) {
  var dirs = ((locales && locales.supported) || []).filter(function (d) { return DIRS.hasOwnProperty(d); });
  Object.keys(DIRS).forEach(function (d) { if (dirs.indexOf(d) === -1) dirs.push(d); });
  return dirs;
}

function pageDirs(page, dirs) {
  return dirs.filter(function (d) { return !(page.file === "landing.html" && DIRS[d].customLanding); });
}

function readFile(rel) {
  try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch (e) { return null; }
}
function isFile(rel) {
  try { return fs.statSync(path.join(ROOT, rel)).isFile(); } catch (e) { return false; }
}
function legalExists(dir, file) { return isFile(path.join("legal", dir, file)); }

// Balises <link>/<meta> du <head>, attributs dans n'importe quel ordre.
function headTags(html, tagName) {
  var head = html.split(/<\/head>/i)[0] || "";
  var out = [];
  var re = new RegExp("<" + tagName + "\\b[^>]*>", "gi"), m;
  while ((m = re.exec(head))) {
    var attrs = {}, a, attrRe = /([a-zA-Z:-]+)\s*=\s*"([^"]*)"/g;
    while ((a = attrRe.exec(m[0]))) attrs[a[1].toLowerCase()] = a[2];
    out.push(attrs);
  }
  return out;
}

// canonical, hreflang declares et noindex d'une page HTML.
function pageSeo(html) {
  var canonical = null, alternates = [];
  headTags(html, "link").forEach(function (l) {
    var rel = (l.rel || "").toLowerCase();
    if (rel === "canonical" && canonical == null) canonical = l.href || null;
    if (rel === "alternate" && l.hreflang && l.href) alternates.push({ hreflang: l.hreflang, href: l.href });
  });
  var noindex = headTags(html, "meta").some(function (mt) {
    return (mt.name || "").toLowerCase() === "robots" && /noindex/i.test(mt.content || "");
  });
  return { canonical: canonical, alternates: alternates, noindex: noindex };
}

// URL du site -> fichier du depot qui la sert (null si hors site).
function urlToFile(url) {
  if (url.indexOf(SITE_URL + "/") !== 0) return null;
  var p = url.slice(SITE_URL.length + 1).split(/[?#]/)[0];
  if (p === "" || /\/$/.test(p)) p += "index.html";
  return p;
}

// Base du blog porte par le sitemap d'un repertoire : "" pour le blog FR racine
// (repertoire x-default sans blogDir), le code du repertoire s'il possede son
// propre blog (blogDir === dir), sinon null (gb, za -> /en/blog/).
function blogBaseFor(dir) {
  var b = DIRS[dir] && DIRS[dir].blogDir;
  if (!b) return dir === (MARKETS._xDefaultDir || "fr") ? "" : null;
  return b === dir ? b : null;
}

function blogFiles(base) {
  var prefix = base ? base + "/" : "";
  var files = base ? [] : ["blog.html"];
  files.push(prefix + "blog/index.html");
  var guidesDir = path.join(ROOT, prefix + "blog/guides");
  if (fs.existsSync(guidesDir)) {
    fs.readdirSync(guidesDir).filter(function (f) { return /\.html$/.test(f); }).sort().forEach(function (f) {
      files.push(prefix + "blog/guides/" + f);
    });
  }
  return files.filter(isFile);
}

// Entrees blog indexables d'un repertoire.
function blogEntries(dir) {
  var base = blogBaseFor(dir);
  if (base == null) return [];
  var entries = [];
  blogFiles(base).forEach(function (rel) {
    var seo = pageSeo(readFile(rel) || "");
    var loc = SITE_URL + "/" + rel.replace(/(^|\/)index\.html$/, "$1");
    if (seo.noindex || seo.canonical !== loc) return;
    var alternates = seo.alternates.filter(function (a) {
      var f = urlToFile(a.href);
      return !!f && isFile(f);
    });
    var hub = rel.indexOf("/guides/") === -1 && rel.indexOf("guides/") !== 0;
    entries.push({ loc: loc, alternates: alternates, priority: hub ? "0.7" : "0.6", changefreq: "weekly" });
  });
  return entries;
}

// Entrees legales d'un repertoire (legal/<dir>/<fichier> present, non noindex).
function legalEntries(dir, dirs, xDefault) {
  var entries = [];
  LEGAL_FILE_LIST.forEach(function (file) {
    if (!legalExists(dir, file)) return;
    if (pageSeo(readFile(path.join("legal", dir, file)) || "").noindex) return;
    var alt = dirs.filter(function (d) { return legalExists(d, file); });
    var alternates = alt.map(function (d) { return { hreflang: DIRS[d].hreflang, href: SITE_URL + "/" + d + "/" + file }; });
    if (alt.indexOf(xDefault) !== -1) alternates.push({ hreflang: "x-default", href: SITE_URL + "/" + xDefault + "/" + file });
    entries.push({ loc: SITE_URL + "/" + dir + "/" + file, alternates: alternates, priority: "0.3", changefreq: "monthly" });
  });
  return entries;
}

function urlXml(entry, today) {
  var links = entry.alternates.map(function (a) {
    return '<xhtml:link rel="alternate" hreflang="' + a.hreflang + '" href="' + a.href + '"/>';
  }).join("");
  return "<url><loc>" + entry.loc + "</loc><lastmod>" + today + "</lastmod><changefreq>" + entry.changefreq +
    "</changefreq><priority>" + entry.priority + "</priority>" + links + "</url>";
}

function generateLocalizedSitemaps(locales, pages, today, outDir) {
  outDir = outDir || ROOT;
  var dirs = sitemapDirs(locales);
  var xDefault = (locales && locales.default) || MARKETS._xDefaultDir || "fr";
  var sitemapPages = pages.filter(function (p) { return !p.noSitemap; });
  var files = [];
  dirs.forEach(function (dir) {
    var entries = [];
    sitemapPages.forEach(function (page) {
      var alt = pageDirs(page, dirs);
      if (alt.indexOf(dir) === -1) return;
      var slug = page.file === "index.html" ? "" : page.file;
      var alternates = alt.map(function (d) { return { hreflang: DIRS[d].hreflang, href: SITE_URL + "/" + d + "/" + slug }; });
      if (alt.indexOf(xDefault) !== -1) alternates.push({ hreflang: "x-default", href: SITE_URL + "/" + xDefault + "/" + slug });
      entries.push({ loc: SITE_URL + "/" + dir + "/" + slug, alternates: alternates, priority: slug === "" ? "0.8" : "0.5", changefreq: "weekly" });
    });
    entries = entries.concat(legalEntries(dir, dirs, xDefault), blogEntries(dir));
    var fname = "sitemap-" + dir + "-i18n.xml";
    fs.writeFileSync(
      path.join(outDir, fname),
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
        entries.map(function (e) { return urlXml(e, today); }).join("\n") + "\n</urlset>"
    );
    files.push(fname);
  });
  return files;
}

module.exports = {
  generateLocalizedSitemaps: generateLocalizedSitemaps,
  sitemapDirs: sitemapDirs,
  blogEntries: blogEntries,
  legalEntries: legalEntries,
  pageSeo: pageSeo,
  urlToFile: urlToFile,
  LEGAL_FILE_LIST: LEGAL_FILE_LIST
};

if (require.main === module) {
  var I18N_LOCALES = require(path.join(ROOT, "i18n/locales.json"));
  var I18N_PAGES = require(path.join(ROOT, "scripts/i18n-manifest.js"));
  var TODAY = new Date().toISOString().split("T")[0];
  var files = generateLocalizedSitemaps(I18N_LOCALES, I18N_PAGES, TODAY, ROOT);

  // Regenere l'index sitemap.xml : garde l'entree sitemap-fr.xml (produite par
  // le pipeline reel avec les vraies donnees de match, non ecrite ici) et y
  // ajoute/rafraichit les entrees par repertoire.
  var indexPath = path.join(ROOT, "sitemap.xml");
  var frEntry = '<sitemap><loc>' + SITE_URL + '/sitemap-fr.xml</loc><lastmod>' + TODAY + '</lastmod></sitemap>';
  var entries = [frEntry].concat(files.map(function (f) {
    return '<sitemap><loc>' + SITE_URL + '/' + f + '</loc><lastmod>' + TODAY + '</lastmod></sitemap>';
  }));
  fs.writeFileSync(
    indexPath,
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + entries.join("\n") + "\n</sitemapindex>"
  );
  console.log("Sitemaps generes : " + files.join(", ") + " ; sitemap.xml (index) mis a jour avec " + entries.length + " entree(s).");
}
