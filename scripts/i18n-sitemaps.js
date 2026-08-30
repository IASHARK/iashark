#!/usr/bin/env node
"use strict";
// Sitemaps internationaux (MASTER SS19 - "sitemap international"). Ne liste
// QUE les pages reellement generees par scripts/build-locales.js (I18N_PAGES,
// meme source que le build lui-meme, via i18n-manifest.js - jamais de page
// vide/non traduite indexee). hreflang complet via xhtml:link sur chaque
// <url>, y compris x-default vers la version FR par defaut.
//
// Module partage entre le pipeline (.github/workflows/update-data.yml, qui
// l'appelle apres chaque run reel avec des donnees a jour) et cette CLI
// (pour pouvoir regenerer les sitemaps i18n sans dependre d'un run pipeline
// complet, puisque cette fonction ne depend d'aucune donnee de match live -
// seulement de la config de langues/pages, deja stable).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_URL = "https://iashark.com";

function generateLocalizedSitemaps(locales, pages, today, outDir) {
  outDir = outDir || ROOT;
  // Une page avec noSitemap:true reste generee/traduite normalement (le
  // fichier existe et fonctionne) mais n'est jamais promue dans les
  // sitemaps - cas d'usage : une page gardee en ligne pour un usage
  // interne/admin, jamais pour la decouverte publique/SEO (ex.
  // historique.html, retiree du produit public le 2026-08-30 - voir
  // IASHARK_V2_RECETTE_VISUELLE.md).
  var sitemapPages = pages.filter(function (p) { return !p.noSitemap; });
  var files = [];
  locales.supported.forEach(function (locale) {
    var urls = sitemapPages.map(function (page) {
      var slug = page.file === "index.html" ? "" : page.file;
      var loc = SITE_URL + "/" + locale + "/" + slug;
      var alternates = locales.supported.map(function (l2) {
        var altSlug = page.file === "index.html" ? "" : page.file;
        return '<xhtml:link rel="alternate" hreflang="' + l2 + '" href="' + SITE_URL + "/" + l2 + "/" + altSlug + '"/>';
      }).join("");
      alternates += '<xhtml:link rel="alternate" hreflang="x-default" href="' + SITE_URL + "/" + locales.default + "/" + slug + '"/>';
      return "<url><loc>" + loc + "</loc><lastmod>" + today + "</lastmod><changefreq>weekly</changefreq><priority>0.5</priority>" + alternates + "</url>";
    });
    var fname = "sitemap-" + locale + "-i18n.xml";
    fs.writeFileSync(
      path.join(outDir, fname),
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + urls.join("\n") + "\n</urlset>"
    );
    files.push(fname);
  });
  return files;
}

module.exports = { generateLocalizedSitemaps: generateLocalizedSitemaps };

if (require.main === module) {
  var I18N_LOCALES = require(path.join(ROOT, "i18n/locales.json"));
  var I18N_PAGES = require(path.join(ROOT, "scripts/i18n-manifest.js"));
  var TODAY = new Date().toISOString().split("T")[0];
  var files = generateLocalizedSitemaps(I18N_LOCALES, I18N_PAGES, TODAY, ROOT);

  // Regenere l'index sitemap.xml : garde l'entree sitemap-fr.xml existante
  // (produite par le pipeline reel avec les vraies donnees de match, non
  // touchee ici) et y ajoute/rafraichit les entrees i18n. N'ecrit PAS
  // sitemap-fr.xml lui-meme (necessite matchsData, hors scope de ce script).
  var indexPath = path.join(ROOT, "sitemap.xml");
  var frEntry = '<sitemap><loc>' + SITE_URL + '/sitemap-fr.xml</loc><lastmod>' + TODAY + '</lastmod></sitemap>';
  var entries = [frEntry].concat(files.map(function (f) {
    return '<sitemap><loc>' + SITE_URL + '/' + f + '</loc><lastmod>' + TODAY + '</lastmod></sitemap>';
  }));
  fs.writeFileSync(
    indexPath,
    '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + entries.join("\n") + "\n</sitemapindex>"
  );
  console.log("Sitemaps i18n generes : " + files.join(", ") + " ; sitemap.xml (index) mis a jour avec " + entries.length + " entree(s).");
}
