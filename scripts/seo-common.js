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
// Locale Intl des dates et heures du HTML statique d'une version :
// i18n/seo/<dir>.json#intlLocale (ex. /en/ : en-US, format americain « Sep 19 »,
// « 9:30 PM ») sinon config/markets.json#_dirs.<dir>.intlLocale.
function intlLocaleFor(dir) {
  var s = seoConf(dir);
  return (s && typeof s.intlLocale === "string" && s.intlLocale) || DIRS[dir].intlLocale;
}

// ---------------------------------------------------------------------------
// Dates et heures du HTML statique, dans le fuseau et la locale de la version
// (i18n/seo/<dir>.json : tz, intlLocale, clock_options, clock_zone, clock_list).
function fmtIn(d, dir, opts) {
  var o = Object.assign({ timeZone: seoConf(dir).tz }, opts);
  try { return new Intl.DateTimeFormat(intlLocaleFor(dir), o).format(d); } catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
}
// Heure seule ("20:45", "9:30 PM").
function clockIn(d, dir) {
  var co = seoConf(dir).clock_options;
  return fmtIn(d, dir, co && typeof co === "object" ? co : { hour: "2-digit", minute: "2-digit" });
}
// Heure UTC 24 h ("01:30"), seconde heure de /en/.
function utcClock(d) {
  try { return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d); } catch (e) { return d.toISOString().slice(11, 16); }
}
// Heure avec fuseau explicite : clock_zone (bloc d'informations d'une page
// match, defaut "{time} ({tz})") ou clock_list (listes : accueil, hubs,
// defaut "{time}"). /en/ : "9:30 PM ET (01:30 UTC)".
function zonedClock(d, dir, kind) {
  var s = seoConf(dir);
  var tpl = kind === "list" ? (s.clock_list || "{time}") : (s.clock_zone || "{time} ({tz})");
  return fill(tpl, { time: clockIn(d, dir), utc: utcClock(d), tz: s.tz_label });
}
// Jour calendaire (AAAA-MM-JJ) d'un instant dans le fuseau de la version.
function dayKeyIn(d, dir) {
  try {
    var p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: seoConf(dir).tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.year + "-" + p.month + "-" + p.day;
  } catch (e) { return d.toISOString().slice(0, 10); }
}
// Instant ISO 8601 avec le decalage du fuseau de la version
// ("2026-09-19T21:30:00-04:00") : startDate des JSON-LD SportsEvent.
function isoWithOffset(d, tz) {
  try {
    var p = {};
    new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    var wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
    var off = Math.round((wall - Math.floor(d.getTime() / 1000) * 1000) / 60000);
    var sign = off < 0 ? "-" : "+", a = Math.abs(off);
    return p.year + "-" + p.month + "-" + p.day + "T" + ("0" + (+p.hour % 24)).slice(-2) + ":" + p.minute + ":" + p.second + sign + ("0" + Math.floor(a / 60)).slice(-2) + ":" + ("0" + (a % 60)).slice(-2);
  } catch (e) { return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
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
// Slug d'URL : toujours depuis config/leagues.json#displayName (jamais depuis un
// nom localise : /fr/leagues/champions-league.html reste l'URL publiee).
function leagueSlug(key) { var l = leagueByKey(key); return l ? slugify(l.displayName) : null; }
// Nom AFFICHE d'une competition dans une version (vague 2 SEO, 19/09/2026) :
// i18n/seo/<dir>.json#league_names (ex. /fr/ : « Ligue des champions »,
// « Ligue Europa », « Ligue Conference », « Liga » ; /pt/ : « Liga dos
// Campeoes »), sinon config/leagues.json#displayName, sinon fallback (nom du
// flux pour une competition inconnue). Titres, H1, fils d'Ariane, JSON-LD et
// listes des pages generees ; jamais les URL.
function leagueNameIn(key, dir, fallback) {
  var names = dir && DIRS[dir] ? seoConf(dir).league_names : null;
  if (key && names && typeof names[key] === "string" && names[key].trim()) return names[key].trim();
  var l = key ? leagueByKey(key) : null;
  return l ? l.displayName : String(fallback || "").trim();
}
// Alias court d'une equipe pour les TITRES et H1 d'une version seulement
// (« PSG », « OM », « OL » sur /fr/) : i18n/seo/<dir>.json#match.team_aliases
// (id api-football -> alias), sinon config/team-display-names.json#titleAliases.<dir>.
// Jamais dans le corps de page ni dans le JSON-LD (nom d'affichage complet).
var teamCfgCache = null;
function teamTitleAlias(team, dir) {
  if (!team || team.id == null || !DIRS[dir]) return null;
  var id = String(team.id);
  var own = (seoConf(dir).match || {}).team_aliases;
  if (own && typeof own[id] === "string" && own[id].trim()) return own[id].trim();
  if (teamCfgCache === null) {
    try { teamCfgCache = JSON.parse(fs.readFileSync(path.join(ROOT, "config/team-display-names.json"), "utf8")); } catch (e) { teamCfgCache = {}; }
  }
  var a = teamCfgCache.titleAliases && teamCfgCache.titleAliases[dir];
  return a && typeof a[id] === "string" && a[id].trim() ? a[id].trim() : null;
}

// ---------------------------------------------------------------------------
// Pages « pronostics » (scripts/seo-hubs.js) : URL stables par version,
// config/seo-hubs.json. Aujourd'hui / demain / week-end, et journee en cours
// de chaque competition du perimetre de la version.
var hubsCfgCache = null;
function hubsConfig() {
  if (hubsCfgCache === null) {
    try { hubsCfgCache = JSON.parse(fs.readFileSync(path.join(ROOT, "config/seo-hubs.json"), "utf8")); } catch (e) { hubsCfgCache = { dirs: {} }; }
  }
  return hubsCfgCache;
}
const DATE_HUB_KINDS = ["today", "tomorrow", "weekend"];
function hubDirConf(dir) { var d = hubsConfig().dirs || {}; return DIRS[dir] && d[dir] && d[dir].folder ? d[dir] : null; }
function hubFolderPath(dir) { var h = hubDirConf(dir); return h ? "/" + dir + "/" + h.folder + "/" : null; }
function dateHubPath(dir, kind) {
  var h = hubDirConf(dir);
  return h && DATE_HUB_KINDS.indexOf(kind) !== -1 && h[kind] ? "/" + dir + "/" + h.folder + "/" + h[kind] + ".html" : null;
}
function matchdayHubPath(dir, key) {
  var h = hubDirConf(dir), s = leagueSlug(key);
  return h && s && h.matchday ? "/" + dir + "/" + h.folder + "/" + s + "-" + h.matchday + ".html" : null;
}
// Competitions qui ont une page « journee » dans une version : son perimetre
// (config/leagues.json#seoMatchDirs), hors versions redirigees (Liga MX /es/).
function matchdayLeagueKeys(dir) {
  return orderedLeagueKeys(dir).filter(function (k) { return !leagueRedirectDirs(k)[dir]; });
}

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
  // /en/ : version anglaise internationale ciblant explicitement les Etats-Unis
  // depuis le 19/09/2026 (heure ET, format en-US, offre USD). og:locale exige
  // la forme langue_PAYS : en_US (l'ancien "en" n'etait pas une valeur valide).
  if (dir === "en") return "en_US";
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
// aliases (facultatif) : {dir: ["es-US", "es"]} = codes hreflang
// SUPPLEMENTAIRES portes par la meme URL (config/leagues.json#hreflangAliases,
// ex. Liga MX : /mx/ sert aussi es-US). Un alias n'est ajoute que si aucune
// autre version du groupe ne declare deja ce code (jamais deux URLs pour un
// meme code).
function alternatesFor(pathOf, dirs, aliases) {
  dirs = dirs || DIR_CODES;
  var out = dirs.map(function (d) { return { hreflang: DIRS[d].hreflang, href: SITE_URL + pathOf(d) }; });
  var taken = {};
  out.forEach(function (a) { taken[a.hreflang.toLowerCase()] = true; });
  if (aliases && typeof aliases === "object") {
    dirs.forEach(function (d) {
      (Array.isArray(aliases[d]) ? aliases[d] : []).forEach(function (code) {
        if (typeof code !== "string" || !/^[a-z]{2}(-[A-Z]{2})?$/.test(code) || taken[code.toLowerCase()]) return;
        taken[code.toLowerCase()] = true;
        out.push({ hreflang: code, href: SITE_URL + pathOf(d) });
      });
    });
  }
  var xd = dirs.length > 1 ? xDefaultDir(dirs) : null;
  if (xd) out.push({ hreflang: "x-default", href: SITE_URL + pathOf(xd) });
  return out;
}
// Alias hreflang d'une competition (config/leagues.json#hreflangAliases).
function leagueHreflangAliases(key) {
  var l = key ? leagueByKey(key) : null;
  return l && l.hreflangAliases && typeof l.hreflangAliases === "object" ? l.hreflangAliases : null;
}
// Versions d'une competition redirigees vers une autre version de la meme
// langue (config/leagues.json#seoRedirectDirs, ex. Liga MX : es -> mx, audit
// SEO /mx/ du 19/09/2026) : {dir: cible} ou {}.
function leagueRedirectDirs(key) {
  var l = key ? leagueByKey(key) : null;
  var r = l && l.seoRedirectDirs && typeof l.seoRedirectDirs === "object" ? l.seoRedirectDirs : {};
  var out = {};
  Object.keys(r).forEach(function (d) { if (DIRS[d] && DIRS[r[d]] && d !== r[d]) out[d] = r[d]; });
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
  // Puis la preference x-default (en), les autres versions generees, et la
  // version francaise EN DERNIER pour un lecteur non francophone (audit SEO US
  // du 19/09/2026 : /en/ renvoyait la Liga MX vers les pages francaises).
  HREFLANG_X_DEFAULT.forEach(function (d) { if (d !== X_DEFAULT_DIR || base === "fr") add(d); });
  scope.forEach(function (d) { if (d !== X_DEFAULT_DIR) add(d); });
  add(X_DEFAULT_DIR);
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
// Competitions du perimetre d'une version, dans l'ordre de ses priorites
// (i18n/seo/<dir>.json#home.priority_leagues, ex. /en/ : MLS d'abord), puis
// l'ordre de config/leagues.json.
function orderedLeagueKeys(dir) {
  var s = seoConf(dir);
  var prio = (s.home && s.home.priority_leagues) || [];
  var scope = leaguesInScope(dir).map(function (l) { return l.key; });
  return prio.filter(function (k) { return scope.indexOf(k) !== -1; }).concat(scope.filter(function (k) { return prio.indexOf(k) === -1; }));
}
// Pages « pronostics » de la version presentes sur disque : aujourd'hui,
// demain, week-end, puis la journee en cours des premieres competitions de la
// version (config/seo-hubs.json#navMatchdayLeagues). Libelles :
// i18n/seo/<dir>.json#hubs.nav.
function hubNav(dir, root) {
  var s = seoConf(dir), hn = (s.hubs && s.hubs.nav) || {};
  var out = [];
  DATE_HUB_KINDS.forEach(function (k) {
    var p = dateHubPath(dir, k);
    if (p && hn[k] && exists(p, root)) out.push({ href: p, label: hn[k] });
  });
  var max = hubsConfig().navMatchdayLeagues != null ? hubsConfig().navMatchdayLeagues : 2;
  matchdayLeagueKeys(dir).slice(0, max).forEach(function (k) {
    var p = matchdayHubPath(dir, k);
    if (p && hn.matchday && exists(p, root)) out.push({ href: p, label: fill(hn.matchday, { league: leagueNameIn(k, dir) }) });
  });
  return out;
}
function versionNav(dir, root) {
  var s = seoConf(dir), n = s.nav;
  var keys = orderedLeagueKeys(dir);
  var leagues = keys.map(function (k) { return { href: leagueHubPath(dir, k), label: leagueNameIn(k, dir) }; })
    .filter(function (x) { return exists(x.href, root); });
  var sections = [];
  var clubs = clubsHubPath(dir, root), arts = articlesHubPath(dir, root), meth = methodologyPath(dir, root);
  if (clubs) sections.push({ href: clubs, label: n.clubs });
  if (arts) sections.push({ href: arts, label: n.articles });
  sections.push({ href: blogHubPath(dir), label: n.blog });
  if (exists("/" + dir + "/marches.html", root) || fs.existsSync(path.join(ROOT, "marches.html"))) sections.push({ href: "/" + dir + "/marches.html", label: n.markets });
  if (meth) sections.push({ href: meth, label: n.methodology });
  return { leagues: leagues, sections: sections, hubs: hubNav(dir, root), labels: n };
}
const FOOTER_NAV_OPEN = "<!--SEO_FOOTER_NAV-->", FOOTER_NAV_CLOSE = "<!--/SEO_FOOTER_NAV-->";
function footerNavHtml(dir, root) {
  var nav = versionNav(dir, root), n = nav.labels;
  var a = function (x) { return '<a href="' + x.href + '" style="color:#91a0b3;text-decoration:underline;text-underline-offset:2px">' + escHtml(x.label) + "</a>"; };
  return FOOTER_NAV_OPEN + '<nav class="seo-foot-nav" aria-label="' + escHtml(n.aria) + '" style="max-width:1100px;margin:16px auto 0;padding:14px 20px 22px;border-top:1px solid rgba(141,179,211,.14);font:12.5px/1.8 system-ui,-apple-system,\'Segoe UI\',Roboto,sans-serif;color:#91a0b3;text-align:center">' +
    (nav.hubs.length ? '<p style="margin:0 0 4px"><span style="color:#c3ccd8">' + escHtml(n.predictions || "") + "</span> " + nav.hubs.map(a).join(" · ") + "</p>" : "") +
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
  seoConf: seoConf, dictFor: dictFor, get: get, intlLocaleFor: intlLocaleFor, escHtml: escHtml, fill: fill, slugify: slugify,
  fmtIn: fmtIn, clockIn: clockIn, utcClock: utcClock, zonedClock: zonedClock, dayKeyIn: dayKeyIn, isoWithOffset: isoWithOffset,
  leagueByKey: leagueByKey, leagueSlug: leagueSlug, leagueNameIn: leagueNameIn, teamTitleAlias: teamTitleAlias,
  hubsConfig: hubsConfig, DATE_HUB_KINDS: DATE_HUB_KINDS, hubDirConf: hubDirConf, hubFolderPath: hubFolderPath, dateHubPath: dateHubPath,
  matchdayHubPath: matchdayHubPath, matchdayLeagueKeys: matchdayLeagueKeys, hubNav: hubNav,
  homePath: homePath, leagueHubPath: leagueHubPath, matchPath: matchPath,
  blogHubPath: blogHubPath, guidePath: guidePath, guideLabel: guideLabel, GUIDE_TITLE_KEYS: GUIDE_TITLE_KEYS,
  ogLocale: ogLocale, ldScript: ldScript, breadcrumbLd: breadcrumbLd, hreflangLinks: hreflangLinks, alternatesFor: alternatesFor,
  leagueHreflangAliases: leagueHreflangAliases, leagueRedirectDirs: leagueRedirectDirs,
  HREFLANG_X_DEFAULT: HREFLANG_X_DEFAULT, xDefaultDir: xDefaultDir, leagueDirs: leagueDirs, leaguesInScope: leaguesInScope,
  nearestDirs: nearestDirs, nearestDir: nearestDir, orderedLeagueKeys: orderedLeagueKeys, clubsHubPath: clubsHubPath, articlesHubPath: articlesHubPath, methodologyPath: methodologyPath,
  clubEntries: clubEntries, leagueClubPages: leagueClubPages, clubPageFor: clubPageFor, versionNav: versionNav,
  footerNavHtml: footerNavHtml, injectFooterNav: injectFooterNav, FOOTER_NAV_OPEN: FOOTER_NAV_OPEN, FOOTER_NAV_CLOSE: FOOTER_NAV_CLOSE,
  fitText: fitText, leagueKind: leagueKind
};
