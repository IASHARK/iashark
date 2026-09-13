#!/usr/bin/env node
"use strict";
// Sitemaps internationaux (MASTER SS19 - "sitemap international"). Ne liste
// QUE les pages reellement generees par scripts/build-locales.js (I18N_PAGES,
// meme source que le build lui-meme, via i18n-manifest.js - jamais de page
// vide/non traduite indexee), et seulement celles qui ne sont pas noindex
// (noSitemap:true). Un fichier par repertoire public : langues (fr en es de it
// pt) + marches pays (gb za mx, config/markets.json#_dirs). hreflang complet via
// xhtml:link sur chaque <url> (fr, en, es, de, it, pt, en-GB, en-ZA, es-MX),
// y compris x-default vers la version FR par defaut.
//
// Module partage entre le pipeline (.github/workflows/update-data.yml, qui
// l'appelle apres chaque run reel avec I18N_LOCALES = i18n/locales.json) et
// cette CLI. La signature est inchangee : les repertoires pays sont ajoutes a
// partir de config/markets.json, le pipeline les recoit donc automatiquement
// dans la liste de fichiers retournee (et dans son index sitemap.xml).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_URL = "https://iashark.com";
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
const DIRS = MARKETS._dirs;

// Repertoires couverts : langues de locales.json d'abord, puis les marches pays.
function sitemapDirs(locales) {
  var dirs = ((locales && locales.supported) || []).filter(function (d) { return DIRS.hasOwnProperty(d); });
  Object.keys(DIRS).forEach(function (d) { if (dirs.indexOf(d) === -1) dirs.push(d); });
  return dirs;
}

function pageDirs(page, dirs) {
  return dirs.filter(function (d) { return !(page.file === "landing.html" && DIRS[d].customLanding); });
}

function generateLocalizedSitemaps(locales, pages, today, outDir) {
  outDir = outDir || ROOT;
  var dirs = sitemapDirs(locales);
  var xDefault = (locales && locales.default) || MARKETS._xDefaultDir || "fr";
  var sitemapPages = pages.filter(function (p) { return !p.noSitemap; });
  var files = [];
  dirs.forEach(function (dir) {
    var urls = [];
    sitemapPages.forEach(function (page) {
      var alt = pageDirs(page, dirs);
      if (alt.indexOf(dir) === -1) return;
      var slug = page.file === "index.html" ? "" : page.file;
      var links = alt.map(function (d) {
        return '<xhtml:link rel="alternate" hreflang="' + DIRS[d].hreflang + '" href="' + SITE_URL + "/" + d + "/" + slug + '"/>';
      }).join("");
      if (alt.indexOf(xDefault) !== -1) {
        links += '<xhtml:link rel="alternate" hreflang="x-default" href="' + SITE_URL + "/" + xDefault + "/" + slug + '"/>';
      }
      urls.push("<url><loc>" + SITE_URL + "/" + dir + "/" + slug + "</loc><lastmod>" + today +
        "</lastmod><changefreq>weekly</changefreq><priority>" + (slug === "" ? "0.8" : "0.5") + "</priority>" + links + "</url>");
    });
    var fname = "sitemap-" + dir + "-i18n.xml";
    fs.writeFileSync(
      path.join(outDir, fname),
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urls.join("\n") + "\n</urlset>"
    );
    files.push(fname);
  });
  return files;
}

module.exports = { generateLocalizedSitemaps: generateLocalizedSitemaps, sitemapDirs: sitemapDirs };

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
