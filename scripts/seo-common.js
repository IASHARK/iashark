"use strict";
// Aides SEO partagees par scripts/build-locales.js et scripts/seo-pages.js
// (sans dependance circulaire : ce module ne requiert aucun des deux).
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_URL = "https://iashark.com";
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
const DIRS = MARKETS._dirs;
const DIR_CODES = Object.keys(DIRS);
const X_DEFAULT_DIR = MARKETS._xDefaultDir || "fr";
const LEAGUES = JSON.parse(fs.readFileSync(path.join(ROOT, "config/leagues.json"), "utf8")).leagues;

// Textes SEO par repertoire public : i18n/seo/<dir>.json.
var seoCache = {};
function seoConf(dir) {
  if (!seoCache[dir]) seoCache[dir] = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/seo", dir + ".json"), "utf8"));
  return seoCache[dir];
}
var dictCache = {};
function dictFor(dir) {
  var loc = DIRS[dir].locale;
  if (!dictCache[loc]) dictCache[loc] = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/dict", loc + ".json"), "utf8"));
  return dictCache[loc];
}
function get(obj, keyPath) {
  return keyPath.split(".").reduce(function (o, k) { return o != null ? o[k] : null; }, obj);
}

function escHtml(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fill(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
}
function slugify(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function leagueByKey(key) {
  for (var i = 0; i < LEAGUES.length; i++) if (LEAGUES[i].key === key) return LEAGUES[i];
  return null;
}
function leagueSlug(key) { var l = leagueByKey(key); return l ? slugify(l.displayName) : null; }

// Chemins publics (URL canonique = forme .html, repertoire = "/<dir>/").
function homePath(dir) { return "/" + dir + "/"; }
function leagueHubPath(dir, key) { return "/" + dir + "/leagues/" + leagueSlug(key) + ".html"; }
// Pages match statiques : /match/<id>.html (version x-default, francaise) et
// /<dir>/match/<id>.html pour les autres repertoires.
function matchPath(dir, id) { return dir === X_DEFAULT_DIR ? "/match/" + id + ".html" : "/" + dir + "/match/" + id + ".html"; }
// Blog servi pour un repertoire (gb/za -> /en/blog/, fr -> blog FR racine).
function blogHubPath(dir) { var b = DIRS[dir].blogDir; return b ? "/" + b + "/blog/" : "/blog.html"; }
function guidePath(dir, file) {
  var b = DIRS[dir].blogDir;
  var p = (b ? "/" + b + "/blog/guides/" : "/blog/guides/") + file;
  return fs.existsSync(path.join(ROOT, p.slice(1))) ? p : blogHubPath(dir);
}
// Guides -> cle du titre court deja traduit dans les dictionnaires (blog_hub).
var GUIDE_TITLE_KEYS = {
  "plus-de-2-5-buts-probabilite-methode-poisson.html": "blog_hub.art_over25_title",
  "xg-expected-goals-guide-complet.html": "blog_hub.art_xg_title",
  "prediction-ia-football-guide-2026.html": "blog_hub.art_prediction_title",
  "value-bet-guide-complet-2026.html": "blog_hub.art_valuebet_title",
  "guide-paris-sportifs-debutant-complet.html": "blog_hub.art_beginner_title",
  "meilleurs-bookmakers-monde-2026.html": "blog_hub.art_bookmakers_title",
  "coupe-du-monde-2026-guide-complet.html": "blog_hub.art_worldcup_title"
};
function guideLabel(dir, file) {
  var v = GUIDE_TITLE_KEYS[file] ? get(dictFor(dir), GUIDE_TITLE_KEYS[file]) : null;
  return typeof v === "string" ? v : file;
}

// og:locale (format langue_PAYS) depuis <html lang>.
var OG_LOCALES = { fr: "fr_FR", en: "en_GB", "en-GB": "en_GB", "en-ZA": "en_ZA", es: "es_ES", "es-MX": "es_MX", de: "de_DE", it: "it_IT", pt: "pt_PT" };
function ogLocale(dir) {
  var hl = DIRS[dir].htmlLang;
  // /en/ vise un public international : pas de pays impose.
  if (dir === "en") return "en";
  return OG_LOCALES[hl] || hl.replace("-", "_");
}

function ldScript(obj) {
  return '<script type="application/ld+json">' + JSON.stringify(obj).replace(/</g, "\\u003c") + "</script>";
}
function breadcrumbLd(items) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(function (it, i) {
      var o = { "@type": "ListItem", position: i + 1, name: it.name };
      if (it.url) o.item = it.url;
      return o;
    })
  };
}
function hreflangLinks(alternates) {
  return alternates.map(function (a) { return '<link rel="alternate" hreflang="' + a.hreflang + '" href="' + a.href + '">'; }).join("");
}
// Alternates d'une URL declinee dans tous les repertoires (+ x-default -> fr).
function alternatesFor(pathOf, dirs) {
  dirs = dirs || DIR_CODES;
  var out = dirs.map(function (d) { return { hreflang: DIRS[d].hreflang, href: SITE_URL + pathOf(d) }; });
  if (dirs.indexOf(X_DEFAULT_DIR) !== -1) out.push({ hreflang: "x-default", href: SITE_URL + pathOf(X_DEFAULT_DIR) });
  return out;
}

module.exports = {
  ROOT: ROOT, SITE_URL: SITE_URL, MARKETS: MARKETS, DIRS: DIRS, DIR_CODES: DIR_CODES, X_DEFAULT_DIR: X_DEFAULT_DIR, LEAGUES: LEAGUES,
  seoConf: seoConf, dictFor: dictFor, get: get, escHtml: escHtml, fill: fill, slugify: slugify,
  leagueByKey: leagueByKey, leagueSlug: leagueSlug, homePath: homePath, leagueHubPath: leagueHubPath, matchPath: matchPath,
  blogHubPath: blogHubPath, guidePath: guidePath, guideLabel: guideLabel, GUIDE_TITLE_KEYS: GUIDE_TITLE_KEYS,
  ogLocale: ogLocale, ldScript: ldScript, breadcrumbLd: breadcrumbLd, hreflangLinks: hreflangLinks, alternatesFor: alternatesFor
};
