#!/usr/bin/env node
"use strict";
// IASHARK — generateur i18n (MASTER V2.1 SS19). Site statique sans bundler
// ni dependance npm tierce (voir MODEL_ARCHITECTURE.md, "0 dependance npm
// verifiee") : ce script fait de la substitution de chaines pure, sans
// parseur HTML externe, sur les fichiers sources FR pour produire une
// version reellement traduite par langue sous /fr/, /en/, /es/, /de/,
// /it/, /pt/. Chaque regle de remplacement verifie le nombre d'occurrences
// attendu dans la source pour eviter toute substitution silencieusement
// incorrecte (fail fast plutot que generer une page a moitie traduite).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_URL = "https://iashark.com";
const LOCALES = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/locales.json"), "utf8"));
const DICTS = {};
LOCALES.supported.forEach(function (l) {
  DICTS[l] = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/dict/" + l + ".json"), "utf8"));
});

// Pages qui existent en version localisee (prefixees /xx/ par le build).
// Tout le reste (assets, /data.json, /i18n/*, scripts partages, mailto:,
// liens externes, ancres) reste intact - c'est une ressource globale
// partagee entre toutes les langues, pas du contenu editorial.
const LOCALIZABLE_PAGES = new Set([
  "/", "/index.html", "/match.html", "/pro.html", "/historique.html",
  "/compte.html", "/marches.html", "/landing.html", "/a-propos.html",
  "/confidentialite.html", "/cgv.html", "/mentions-legales.html"
]);

function get(obj, keyPath) {
  return keyPath.split(".").reduce(function (o, k) { return o != null ? o[k] : null; }, obj);
}

// Echappe une valeur pour l'injecter en toute securite dans un litteral JS
// entre guillemets simples ('...'). Necessaire car les dictionnaires
// contiennent du texte naturel (apostrophes reelles : "AUJOURD'HUI",
// "Calci d'angolo") qui casserait sinon la chaine JS generee. A utiliser
// pour TOUT texte traduit injecte dans du JS - jamais pour du texte HTML
// brut (qui n'a pas besoin de cet echappement et l'afficherait a tort).
var jsStr = require("./js-escape.js").jsStr;

function rewriteInternalLinks(html, locale) {
  return html.replace(/(href|src)="(\/[a-zA-Z0-9_\-./]*)"/g, function (m, attr, p) {
    var pathOnly = p.split("?")[0].split("#")[0];
    var rest = p.slice(pathOnly.length);
    if (!LOCALIZABLE_PAGES.has(pathOnly)) return m;
    var newPath = pathOnly === "/" ? "/" + locale + "/" : "/" + locale + pathOnly;
    return attr + '="' + newPath + rest + '"';
  });
}

function buildHead(html, locale, file, metas) {
  var m = metas[locale];
  if (!m) throw new Error("No metas for locale " + locale + " on " + file);
  html = html.replace(/<title>[^<]*<\/title>/, "<title>" + m.title + "</title>");
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, "$1" + m.description + "$2");
  if (html.match(/<meta property="og:description"/)) {
    html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, "$1" + m.description + "$2");
  }
  if (html.match(/<meta property="og:title"/)) {
    html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, "$1" + m.title + "$2");
  }
  var slug = file === "index.html" ? "" : file;
  var canonicalUrl = SITE_URL + "/" + locale + "/" + slug;
  var hreflangLinks = LOCALES.supported.map(function (l) {
    var url = SITE_URL + "/" + l + "/" + slug;
    return '<link rel="alternate" hreflang="' + l + '" href="' + url + '">';
  }).join("\n");
  hreflangLinks += '\n<link rel="alternate" hreflang="x-default" href="' + SITE_URL + "/" + LOCALES.default + "/" + slug + '">';
  if (html.match(/<link rel="canonical"/)) {
    html = html.replace(/<link rel="canonical" href="[^"]*">/, '<link rel="canonical" href="' + canonicalUrl + '">\n' + hreflangLinks);
  } else {
    html = html.replace(/<\/title>/, "</title>\n" + '<link rel="canonical" href="' + canonicalUrl + '">\n' + hreflangLinks);
  }
  if (html.match(/<meta property="og:url"/)) {
    html = html.replace(/(<meta property="og:url" content=")[^"]*(")/, "$1" + canonicalUrl + "$2");
  }
  html = html.replace(/<html lang="[a-zA-Z-]*">/, '<html lang="' + locale + '">');
  return html;
}

function applyReplacements(html, locale, replacements) {
  (replacements || []).forEach(function (r) {
    var value = typeof r.build === "function" ? r.build(DICTS[locale], locale, jsStr) : get(DICTS[locale], r.key);
    if (value == null) throw new Error("Missing dict value for rule [" + (r.key || r.find.slice(0, 40)) + "] locale " + locale);
    var count = html.split(r.find).length - 1;
    var expected = r.count || 1;
    if (count !== expected) {
      throw new Error(
        "Replacement mismatch (" + locale + "): expected " + expected + " occurrence(s) of\n  " +
        JSON.stringify(r.find.slice(0, 200)) + "\n  found " + count
      );
    }
    html = html.split(r.find).join(value);
  });
  return html;
}

function buildPage(pageConfig) {
  var srcPath = path.join(ROOT, pageConfig.file);
  var srcHtml = fs.readFileSync(srcPath, "utf8");
  LOCALES.supported.forEach(function (locale) {
    var html = srcHtml;
    html = applyReplacements(html, locale, pageConfig.replacements);
    html = buildHead(html, locale, pageConfig.file, pageConfig.metas);
    html = rewriteInternalLinks(html, locale);
    var outDir = path.join(ROOT, locale);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, pageConfig.file), html);
  });
  console.log("Built " + pageConfig.file + " for " + LOCALES.supported.length + " locales.");
}

var PAGES = require("./i18n-manifest.js");
PAGES.forEach(buildPage);
console.log("i18n build complete: " + PAGES.length + " page(s) x " + LOCALES.supported.length + " locale(s).");
