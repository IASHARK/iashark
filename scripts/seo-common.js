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
// Cible x-default d'un groupe d'equivalents : premiere version de
// config/markets.json#_hreflangXDefault presente dans le groupe (en, puis fr).
// null si aucune (groupe sans en ni fr : pas de x-default).
const HREFLANG_X_DEFAULT = Array.isArray(MARKETS._hreflangXDefault) && MARKETS._hreflangXDefault.length ? MARKETS._hreflangXDefault : [X_DEFAULT_DIR];
function xDefaultDir(dirs) {
  for (var i = 0; i < HREFLANG_X_DEFAULT.length; i++) if (dirs.indexOf(HREFLANG_X_DEFAULT[i]) !== -1) return HREFLANG_X_DEFAULT[i];
  return null;
}
// Alternates d'une URL declinee dans les repertoires donnes (+ x-default).
function alternatesFor(pathOf, dirs) {
  dirs = dirs || DIR_CODES;
  var out = dirs.map(function (d) { return { hreflang: DIRS[d].hreflang, href: SITE_URL + pathOf(d) }; });
  var xd = dirs.length > 1 ? xDefaultDir(dirs) : null;
  if (xd) out.push({ hreflang: "x-default", href: SITE_URL + pathOf(xd) });
  return out;
}

// ---------------------------------------------------------------------------
// Perimetre d'une competition : config/leagues.json#seoMatchDirs (+ fr, toujours).
// Pages match generees, hub ligue indexable et liens de navigation ne visent
// que ces versions (scripts/match-lifecycle.js#matchDirsFor delegue ici).
function leagueDirs(key) {
  var l = key ? leagueByKey(key) : null;
  var extra = l && Array.isArray(l.seoMatchDirs) ? l.seoMatchDirs : [];
  return DIR_CODES.filter(function (d) { return d === X_DEFAULT_DIR || extra.indexOf(d) !== -1; });
}
function leaguesInScope(dir) {
  return LEAGUES.filter(function (l) { return leagueDirs(l.key).indexOf(dir) !== -1; });
}
// Version la plus proche d'un repertoire parmi scope : lui-meme, puis meme
// langue de base (gb -> en, es -> mx), puis la preference x-default (en, fr),
// puis le premier du perimetre.
function nearestDirs(dir, scope) {
  var base = DIRS[dir] ? DIRS[dir].locale.split("-")[0] : null;
  var out = [];
  function add(d) { if (scope.indexOf(d) !== -1 && out.indexOf(d) === -1) out.push(d); }
  add(dir);
  // Version de la langue de base d'abord (gb/za -> en, mx -> es), puis les autres de meme langue.
  if (base && DIRS[base]) add(base);
  DIR_CODES.forEach(function (d) { if (base && DIRS[d].locale.split("-")[0] === base) add(d); });
  HREFLANG_X_DEFAULT.forEach(add);
  scope.forEach(add);
  return out;
}
function nearestDir(dir, scope) { return nearestDirs(dir, scope)[0] || X_DEFAULT_DIR; }

// ---------------------------------------------------------------------------
// Sections de chaque version (maillage interne), toujours verifiees sur disque.
function exists(rel, root) { return fs.existsSync(path.join(root || ROOT, rel.replace(/^\/+/, "").replace(/\/$/, "/index.html"))); }
var clubCfgCache = null;
function clubConfig() {
  if (clubCfgCache === null) {
    try { clubCfgCache = JSON.parse(fs.readFileSync(path.join(ROOT, "config/club-hubs.json"), "utf8")); } catch (e) { clubCfgCache = { versions: {}, clubs: [], derbies: [] }; }
  }
  return clubCfgCache;
}
function clubsHubPath(dir, root) {
  var v = clubConfig().versions[dir];
  if (!v) return null;
  var p = "/" + dir + "/" + v.hubSlug + "/";
  return exists(p, root) ? p : null;
}
function articlesHubPath(dir, root) {
  var file = path.join(ROOT, "content/local-articles", dir + ".json");
  if (!fs.existsSync(file)) return null;
  try {
    var p = "/" + dir + "/" + JSON.parse(fs.readFileSync(file, "utf8")).folder + "/";
    return exists(p, root) ? p : null;
  } catch (e) { return null; }
}
function methodologyPath(dir, root) {
  var p = "/" + dir + "/methodologie.html";
  return fs.existsSync(path.join(ROOT, "legal", dir, "methodologie.html")) || exists(p, root) ? p : null;
}
// Pages club et derby actives d'une version pour une competition (ou un club
// par id api-football), dont le fichier existe.
function clubEntries(dir, root) {
  var cfg = clubConfig(), v = cfg.versions[dir], out = [];
  if (!v) return out;
  (cfg.clubs || []).forEach(function (c) {
    var pg = c.active === true && c.pages && c.pages[dir];
    if (!pg) return;
    var p = "/" + dir + "/" + v.hubSlug + "/" + pg.slug + ".html";
    if (exists(p, root)) out.push({ kind: "club", key: c.key, leagueKey: c.leagueKey, teamIds: [c.teamId], name: pg.name, path: p });
  });
  var byKey = {};
  (cfg.clubs || []).forEach(function (c) { byKey[c.key] = c; });
  (cfg.derbies || []).forEach(function (d) {
    var pg = d.active === true && d.pages && d.pages[dir];
    if (!pg) return;
    var p = "/" + dir + "/" + v.hubSlug + "/" + pg.slug + ".html";
    var ids = (d.teams || []).map(function (t) { return t.club ? (byKey[t.club] || {}).teamId : t.teamId; });
    if (exists(p, root)) out.push({ kind: "derby", key: d.key, leagueKey: d.leagueKey, teamIds: ids, name: pg.name, path: p });
  });
  return out;
}
function leagueClubPages(key, dir, root) {
  return clubEntries(dir, root).filter(function (e) { return e.leagueKey === key; });
}
function clubPageFor(teamId, dir, root) {
  var id = Number(teamId);
  return clubEntries(dir, root).filter(function (e) { return e.kind === "club" && e.teamIds[0] === id; })[0] || null;
}

// Liens de navigation d'une version (accueil, pied de page) : hubs ligue du
// perimetre, clubs, articles, blog, marches, methodologie. Libelles :
// i18n/seo/<dir>.json#nav.
function versionNav(dir, root) {
  var s = seoConf(dir), n = s.nav;
  var prio = (s.home && s.home.priority_leagues) || [];
  var scope = leaguesInScope(dir).map(function (l) { return l.key; });
  var keys = prio.filter(function (k) { return scope.indexOf(k) !== -1; }).concat(scope.filter(function (k) { return prio.indexOf(k) === -1; }));
  var leagues = keys.map(function (k) { return { href: leagueHubPath(dir, k), label: leagueByKey(k).displayName }; })
    .filter(function (x) { return exists(x.href, root); });
  var sections = [];
  var clubs = clubsHubPath(dir, root), arts = articlesHubPath(dir, root), meth = methodologyPath(dir, root);
  if (clubs) sections.push({ href: clubs, label: n.clubs });
  if (arts) sections.push({ href: arts, label: n.articles });
  sections.push({ href: blogHubPath(dir), label: n.blog });
  if (exists("/" + dir + "/marches.html", root) || fs.existsSync(path.join(ROOT, "marches.html"))) sections.push({ href: "/" + dir + "/marches.html", label: n.markets });
  if (meth) sections.push({ href: meth, label: n.methodology });
  return { leagues: leagues, sections: sections, labels: n };
}
const FOOTER_NAV_OPEN = "<!--SEO_FOOTER_NAV-->", FOOTER_NAV_CLOSE = "<!--/SEO_FOOTER_NAV-->";
function footerNavHtml(dir, root) {
  var nav = versionNav(dir, root), n = nav.labels;
  var a = function (x) { return '<a href="' + x.href + '" style="color:#91a0b3;text-decoration:underline;text-underline-offset:2px">' + escHtml(x.label) + "</a>"; };
  return FOOTER_NAV_OPEN + '<nav class="seo-foot-nav" aria-label="' + escHtml(n.aria) + '" style="max-width:1100px;margin:16px auto 0;padding:14px 20px 22px;border-top:1px solid rgba(141,179,211,.14);font:12.5px/1.8 system-ui,-apple-system,\'Segoe UI\',Roboto,sans-serif;color:#91a0b3;text-align:center">' +
    (nav.leagues.length ? '<p style="margin:0 0 4px"><span style="color:#c3ccd8">' + escHtml(n.leagues) + "</span> " + nav.leagues.map(a).join(" · ") + "</p>" : "") +
    '<p style="margin:0">' + nav.sections.map(a).join(" · ") + "</p></nav>" + FOOTER_NAV_CLOSE;
}
// Insere (ou remplace) le bloc de navigation : apres le dernier </footer> du
// corps s'il existe, sinon avant </body>.
function injectFooterNav(html, dir, root) {
  var block = footerNavHtml(dir, root);
  var i = html.indexOf(FOOTER_NAV_OPEN), j = html.indexOf(FOOTER_NAV_CLOSE);
  if (i !== -1 && j > i) return html.slice(0, i) + block + html.slice(j + FOOTER_NAV_CLOSE.length);
  var stash = [];
  var masked = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, function (m) { stash.push(m); return " S" + (stash.length - 1) + " "; });
  var k = masked.lastIndexOf("</footer>");
  if (k !== -1) masked = masked.slice(0, k + 9) + "\n" + block + masked.slice(k + 9);
  else masked = masked.replace(/<\/body>/i, function () { return block + "\n</body>"; });
  return masked.replace(/ S(\d+) /g, function (m, x) { return stash[+x]; });
}

// Premier texte de la liste qui tient dans max caracteres (titles <= 60,
// descriptions <= 155) ; a defaut, le plus court.
function fitText(candidates, max) {
  var list = candidates.filter(function (c) { return typeof c === "string" && c.trim(); }).map(function (c) { return c.replace(/\s{2,}/g, " ").trim(); });
  for (var i = 0; i < list.length; i++) if (Array.from(list[i]).length <= max) return list[i];
  return list.slice().sort(function (a, b) { return Array.from(a).length - Array.from(b).length; })[0] || "";
}
// Nature d'une competition pour la presentation factuelle des hubs.
const LEAGUE_KIND = { ldc: "ucl", el: "uel", ecl: "uecl", mls: "mls" };
function leagueKind(key) { return LEAGUE_KIND[key] || "national"; }

module.exports = {
  ROOT: ROOT, SITE_URL: SITE_URL, MARKETS: MARKETS, DIRS: DIRS, DIR_CODES: DIR_CODES, X_DEFAULT_DIR: X_DEFAULT_DIR, LEAGUES: LEAGUES,
  seoConf: seoConf, dictFor: dictFor, get: get, escHtml: escHtml, fill: fill, slugify: slugify,
  leagueByKey: leagueByKey, leagueSlug: leagueSlug, homePath: homePath, leagueHubPath: leagueHubPath, matchPath: matchPath,
  blogHubPath: blogHubPath, guidePath: guidePath, guideLabel: guideLabel, GUIDE_TITLE_KEYS: GUIDE_TITLE_KEYS,
  ogLocale: ogLocale, ldScript: ldScript, breadcrumbLd: breadcrumbLd, hreflangLinks: hreflangLinks, alternatesFor: alternatesFor,
  HREFLANG_X_DEFAULT: HREFLANG_X_DEFAULT, xDefaultDir: xDefaultDir, leagueDirs: leagueDirs, leaguesInScope: leaguesInScope,
  nearestDirs: nearestDirs, nearestDir: nearestDir, clubsHubPath: clubsHubPath, articlesHubPath: articlesHubPath, methodologyPath: methodologyPath,
  clubEntries: clubEntries, leagueClubPages: leagueClubPages, clubPageFor: clubPageFor, versionNav: versionNav,
  footerNavHtml: footerNavHtml, injectFooterNav: injectFooterNav, FOOTER_NAV_OPEN: FOOTER_NAV_OPEN, FOOTER_NAV_CLOSE: FOOTER_NAV_CLOSE,
  fitText: fitText, leagueKind: leagueKind
};
