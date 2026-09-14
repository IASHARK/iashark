#!/usr/bin/env node
"use strict";
// Pages SEO statiques generees depuis les donnees PUBLIQUES du pipeline :
//
// 1. Pages match /<dir>/match/<id>.html pour chaque repertoire hors x-default
//    (en es de it pt gb za mx), en plus de /match/<id>.html (francais,
//    x-default). Meme coquille match.html, meme PRELOADED_MATCH que la page
//    FR (PUBLIC_SPLIT.toListMatch sur la copie assainie matchsPublics : aucun
//    champ premium hors match offert), mais <head>, resume et bloc
//    d'informations rediges dans la langue du repertoire, hreflang
//    reciproques entre les 9 versions, JSON-LD SportsEvent + BreadcrumbList.
//    Pourquoi : la page FR (lang="fr") ne pouvait pas repondre a
//    "Arsenal vs Chelsea prediction" ou "pronóstico América vs Chivas".
// 2. Pages championnat /<dir>/leagues/<slug>.html (15 competitions de
//    config/leagues.json x 9 repertoires) : introduction factuelle, matchs
//    analyses (lien, date, heure dans le fuseau du marche, stade), methode,
//    liens vers les guides. Jamais de probabilite ni de pari : ce sont des
//    donnees reservees (mur Pro de match-page.js). Une page avec moins de
//    MIN_INDEXABLE_FIXTURES matchs est noindex,follow et hors sitemap
//    (contenu trop mince pour etre propose a l'index).
// 3. sitemap-matches-i18n.xml et sitemap-leagues.xml, lastmod exact
//    (scripts/seo-lastmod.js).
//
// Appele par le pipeline (.github/workflows/update-data.yml#generateMatchPages)
// avec matchsPublics. En local : node scripts/seo-pages.js (source =
// match/<id>.json, la meme copie assainie deja publiee) regenere aussi les
// pages FR /match/<id>.html avec exactement la meme composition.
const fs = require("fs");
const path = require("path");
const C = require("./seo-common.js");
const PUBLIC_SPLIT = require("../lib/public-data-split.js");
// Liste unique des champs premium : PRELOADED_MATCH n en porte jamais hors
// match offert, meme si l appelant passe un match non assaini.
const PREMIUM = require("../lib/premium-fields.js");
const MATCH_TIME = require("../lib/match-time.js");
const LEAGUE_NAMES = require("../lib/league-names.js");
const LASTMOD = require("./seo-lastmod.js");

const SITE_URL = C.SITE_URL, DIRS = C.DIRS, DIR_CODES = C.DIR_CODES, X_DEFAULT_DIR = C.X_DEFAULT_DIR;
const esc = C.escHtml;
const MIN_INDEXABLE_FIXTURES = 2;
const MATCH_GUIDE = "prediction-ia-football-guide-2026.html";
const HUB_GUIDES = ["plus-de-2-5-buts-probabilite-methode-poisson.html", "xg-expected-goals-guide-complet.html"];

var buildLocalesLib = null;
function B() { return buildLocalesLib || (buildLocalesLib = require("./build-locales.js")); }

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

// ---------------------------------------------------------------------------
// Donnees d'un match (dates du pipeline = heure de Paris, lib/match-time.js).
function validMatch(m) {
  return !!(m && m.id != null && PUBLIC_SPLIT.isSafeId(m.id) && m.home && m.away && m.home.n && m.away.n);
}
function kickoff(m) { return MATCH_TIME.parseParis(m && m.date); }
function isoInstant(d) { return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
function fmt(d, dir, opts) {
  var o = Object.assign({ timeZone: C.seoConf(dir).tz }, opts);
  try { return new Intl.DateTimeFormat(DIRS[dir].intlLocale, o).format(d); } catch (e) { return isoInstant(d); }
}
function longDate(d, dir) { return fmt(d, dir, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
function shortDate(d, dir) { return fmt(d, dir, { day: "numeric", month: "long", year: "numeric" }); }
function clock(d, dir) { return fmt(d, dir, { hour: "2-digit", minute: "2-digit" }); }
function leagueName(m) { return (LEAGUE_NAMES.displayName(m.league_key, m.league) || "").trim(); }
function hubKey(m) { return C.leagueByKey(m.league_key) ? m.league_key : null; }
function venue(m) { return m.stade && typeof m.stade.nom === "string" && m.stade.nom.trim() ? m.stade.nom.trim() : null; }
function teams(m) { return m.home.n + " vs " + m.away.n; }

function cleanTpl(s) {
  // Competition inconnue : "( )" et ", ," laisses par un {league} vide.
  return s.replace(/\s*\(\s*\)/g, "").replace(/,\s*,/g, ",").replace(/\s+([:,])/g, function (m, p) { return p === ":" ? " :" : p; }).replace(/\s{2,}/g, " ").trim();
}
function matchVars(m, dir) {
  var d = kickoff(m);
  return { home: m.home.n, away: m.away.n, league: leagueName(m), date: d ? shortDate(d, dir) : "" };
}
// Titre long (noms d'equipes a rallonge) : la marque saute en premier, Google
// affiche deja le nom du site au-dessus du lien (Search Central, "title links").
var TITLE_SOFT_MAX = 60;
function matchTitle(m, dir) {
  var t = cleanTpl(C.fill(C.seoConf(dir).match.title, matchVars(m, dir)));
  return t.length > TITLE_SOFT_MAX ? t.replace(/\s*\|\s*IASHARK$/, "") : t;
}
function matchDescription(m, dir) { return cleanTpl(C.fill(C.seoConf(dir).match.description, matchVars(m, dir))); }
function matchImage(m) { return m.home && m.home.id ? "https://media.api-sports.io/football/teams/" + m.home.id + ".png" : null; }

function matchCrumbs(m, dir) {
  var s = C.seoConf(dir);
  var items = [{ name: s.breadcrumb.home, url: SITE_URL + C.homePath(dir) }];
  var k = hubKey(m);
  if (k) items.push({ name: leagueName(m), url: SITE_URL + C.leagueHubPath(dir, k) });
  items.push({ name: teams(m), url: SITE_URL + C.matchPath(dir, m.id) });
  return items;
}

// JSON-LD SportsEvent : uniquement ce qui est reellement connu et affiche.
// startDate = instant reel avec fuseau (les dates du pipeline sont en heure de
// Paris : l'ancien gabarit y collait "Z", une a deux heures d'erreur).
function matchEvent(m, dir) {
  var d = kickoff(m), v = venue(m), ln = leagueName(m);
  var url = SITE_URL + C.matchPath(dir, m.id);
  var ev = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": url + "#event",
    name: teams(m),
    description: matchDescription(m, dir),
    url: url,
    inLanguage: DIRS[dir].htmlLang,
    sport: C.seoConf(dir).sport,
    homeTeam: { "@type": "SportsTeam", name: m.home.n },
    awayTeam: { "@type": "SportsTeam", name: m.away.n },
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode"
  };
  if (d) ev.startDate = isoInstant(d);
  if (v) ev.location = { "@type": "Place", name: v };
  if (ln) ev.superEvent = { "@type": "SportsEvent", name: ln };
  return ev;
}
function matchJsonLd(m, dir) { return JSON.stringify(matchEvent(m, dir)).replace(/</g, "\\u003c"); }
function matchAlternates(id) { return C.alternatesFor(function (d) { return C.matchPath(d, id); }); }

// Complements du <head> ajoutes apres le bloc meta historique : hreflang des
// 9 versions, og:site_name/og:locale, fil d'Ariane.
function matchHeadExtras(m, dir) {
  return C.hreflangLinks(matchAlternates(m.id)) +
    '<meta property="og:site_name" content="IASHARK"><meta property="og:locale" content="' + C.ogLocale(dir) + '">' +
    C.ldScript(C.breadcrumbLd(matchCrumbs(m, dir)));
}

// Bloc meta complet (meme composition que generateMatchPages du pipeline).
function matchMetaBlock(m, dir) {
  var title = matchTitle(m, dir), desc = matchDescription(m, dir), canonical = SITE_URL + C.matchPath(dir, m.id), image = matchImage(m);
  return '<meta name="description" content="' + esc(desc) + '">' +
    '<link rel="canonical" href="' + canonical + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:url" content="' + canonical + '">' +
    (image ? '<meta property="og:image" content="' + esc(image) + '">' : "") +
    '<meta name="twitter:card" content="summary">' +
    '<meta name="twitter:title" content="' + esc(title) + '">' +
    '<meta name="twitter:description" content="' + esc(desc) + '">' +
    (image ? '<meta name="twitter:image" content="' + esc(image) + '">' : "") +
    '<script type="application/ld+json">' + matchJsonLd(m, dir) + "</script>" +
    matchHeadExtras(m, dir);
}

// Resume statique historique (div masquee par assets/match-page.css, meme
// contenu que le rendu JS). Le pari n'y est nomme que pour le match offert.
function marketLabelFr(m) {
  try {
    var lib = require("../lib/market-labels.js");
    return lib.marketLabel(m.pari_rec, { home: m.home.n, away: m.away.n }, { locale: "fr", dict: C.dictFor("fr") });
  } catch (e) { return m.pari_rec; }
}
function matchSummaryHtml(m, dir) {
  var day = (m.date || "").split(" ")[0];
  var modelAvailable = m.model_output_available !== false && Number(m.data_quality_score || 0) > 0;
  var pari = (m.is_free && modelAvailable && m.pari_rec && !m.no_signal)
    ? '<p><span data-i18n="match_page.seo_recommended_market">Marché recommandé par le modèle :</span> <strong data-market-label="' + esc(m.pari_rec) + '" data-home="' + esc(m.home.n) + '" data-away="' + esc(m.away.n) + '">' + esc(marketLabelFr(m)) + "</strong> (" + esc(String(m.conf || "")) + "/10)</p>"
    : "";
  var dateLabel = day ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z")) : "";
  return '<div style="padding:24px 16px;font-family:\'DM Sans\',sans-serif;color:#94a3b8;font-size:13px;line-height:1.6">' +
    '<h1 style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;letter-spacing:.5px;color:#e2e8f0;margin-bottom:8px">' + esc(m.home.n) + " vs " + esc(m.away.n) + "</h1>" +
    "<p>" + (leagueName(m) ? esc(leagueName(m)) + " — " : "") + (day ? '<time data-seo-date datetime="' + esc(day) + '">' + esc(dateLabel) + "</time>" : "") + "</p>" +
    pari +
    (modelAvailable ? '<p data-i18n="match_page.seo_analysis_available">Analyse statistique IASHARK disponible pour ce match.</p>' : '<p data-i18n="match_page.model_unavailable_reason">Les données disponibles ne permettent pas encore une analyse chiffrée fiable.</p>') +
    "</div>";
}

// Bloc visible sous l'analyse : fil d'Ariane, competition, coup d'envoi avec
// fuseau explicite, stade, liens internes, avertissement. Aucune donnee
// reservee (ni probabilite, ni pari, ni cote).
var LINK = ' style="color:#20d5ef;text-decoration:underline"';
// Affiche fixe du grand match (derby) de la meme version, si elle existe :
// data/derby-index.json, ecrit par scripts/build-club-hubs.js (paire d'ids
// api-football triee -> page par repertoire). Lu au build, jamais publie.
var DERBY_INDEX = null;
function derbyPageFor(m, dir) {
  if (DERBY_INDEX === null) {
    try { DERBY_INDEX = JSON.parse(fs.readFileSync(path.join(C.ROOT, "data/derby-index.json"), "utf8")).pairs || {}; } catch (e) { DERBY_INDEX = {}; }
  }
  if (!m || !m.home || !m.away || m.home.id == null || m.away.id == null) return null;
  var e = DERBY_INDEX[[Number(m.home.id), Number(m.away.id)].sort(function (a, b) { return a - b; }).join("-")];
  return e && e.pages && e.pages[dir] ? e.pages[dir] : null;
}
function matchFactsHtml(m, dir) {
  var s = C.seoConf(dir), ms = s.match;
  var d = kickoff(m), ln = leagueName(m), k = hubKey(m), v = venue(m);
  var hub = k ? C.leagueHubPath(dir, k) : null;
  var crumbs = matchCrumbs(m, dir);
  var nav = crumbs.map(function (c, i) {
    return i < crumbs.length - 1
      ? '<a href="' + esc(c.url.slice(SITE_URL.length)) + '"' + LINK + ">" + esc(c.name) + "</a>"
      : '<span aria-current="page">' + esc(c.name) + "</span>";
  }).join(' <span aria-hidden="true">›</span> ');
  function row(label, value) {
    return '<div style="display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 4px"><dt style="min-width:120px;color:#91a0b3">' + esc(label) + '</dt><dd style="margin:0;color:#e2e8f0">' + value + "</dd></div>";
  }
  var rows = "";
  if (ln) rows += row(ms.competition, hub ? '<a href="' + hub + '"' + LINK + ">" + esc(ln) + "</a>" : esc(ln));
  if (d) rows += row(ms.kickoff, '<time datetime="' + isoInstant(d) + '">' + esc(longDate(d, dir)) + ", " + esc(clock(d, dir)) + " (" + esc(s.tz_label) + ")</time>");
  if (v) rows += row(ms.venue, esc(v));
  var links = ['<a href="' + C.homePath(dir) + '"' + LINK + ">" + esc(ms.free_link) + "</a>"];
  if (hub) links.push('<a href="' + hub + '"' + LINK + ">" + esc(C.fill(ms.hub_link, { league: ln })) + "</a>");
  var derby = derbyPageFor(m, dir);
  if (derby) links.push('<a href="' + esc(derby.path) + '"' + LINK + ">" + esc(derby.name) + "</a>");
  links.push('<a href="' + C.guidePath(dir, MATCH_GUIDE) + '"' + LINK + ">" + esc(ms.guide_link) + "</a>");
  return '<section class="match-facts" aria-labelledby="match-facts-title" style="width:100%;max-width:960px;margin:28px auto 0;padding:18px 16px 8px;border-top:1px solid rgba(141,179,211,.18);font-family:\'DM Sans\',system-ui,sans-serif;color:#c3ccd8;font-size:14px;line-height:1.6">' +
    '<nav aria-label="' + esc(ms.breadcrumb_aria) + '" style="font-size:12.5px;color:#91a0b3;margin:0 0 12px">' + nav + "</nav>" +
    '<h2 id="match-facts-title" style="font-size:17px;font-weight:700;color:#f4f7fb;margin:0 0 10px">' + esc(ms.facts_title) + "</h2>" +
    '<dl style="margin:0 0 12px">' + rows + "</dl>" +
    '<p style="margin:0 0 10px">' + esc(ms.about) + "</p>" +
    '<p style="margin:0 0 10px">' + links.join(" · ") + "</p>" +
    '<p style="margin:0;font-size:12.5px;color:#91a0b3">' + esc(ms.disclaimer) + "</p>" +
    "</section>";
}

// Liens racine du gabarit -> version FR explicite (copie de liensVersionFr du
// pipeline, testee par tests/qa-f1-app-fixes.test.js).
function liensVersionFr(html) {
  return html.replace(/href="\/([a-z0-9-]+\.html)?"/g, function (m, f) {
    if (!f) return 'href="/fr/"';
    if (f === "blog.html") return m;
    return 'href="/fr/' + f + '"';
  });
}

// Page match complete. rawTpl = match.html tel quel.
function renderMatchPage(rawTpl, m, dir) {
  var fr = dir === X_DEFAULT_DIR;
  var html = fr ? liensVersionFr(rawTpl) : rawTpl;
  html = html
    .replace(/<title>[^<]*<\/title>/, function () { return "<title>" + esc(matchTitle(m, dir)) + "</title>"; })
    .replace('<meta name="robots" content="noindex,follow">', "")
    .replace("<!--SEO_META--><!--/SEO_META-->", function () { return matchMetaBlock(m, dir); })
    .replace("<!--SEO_SUMMARY--><!--/SEO_SUMMARY-->", function () { return matchSummaryHtml(m, dir); })
    .replace("<!--FIXED_ID_SCRIPT--><!--/FIXED_ID_SCRIPT-->", function () { return "<script>var FIXED_MATCH_ID=" + JSON.stringify(String(m.id)) + ";</script>"; })
    .replace("<!--PRELOADED_MATCH_SCRIPT--><!--/PRELOADED_MATCH_SCRIPT-->", function () { return "<script>var PRELOADED_MATCH=" + JSON.stringify(PUBLIC_SPLIT.toListMatch(PREMIUM.stripPremium(m))).replace(/</g, "\\u003c") + ";</script>"; })
    .replace("</main>", function () { return matchFactsHtml(m, dir) + "</main>"; });
  if (fr) return html;
  var conf = DIRS[dir];
  var countryMarket = ["gb", "za", "mx"].indexOf(conf.market) !== -1 ? conf.market : null;
  html = B().bakeI18n(html, C.dictFor(dir), countryMarket);
  html = B().bakeMarket(html, dir);
  html = B().rewriteInternalLinks(html, dir);
  html = B().setHtmlLang(html, conf.htmlLang);
  html = B().injectRuntime(html, dir);
  return html;
}

// ---------------------------------------------------------------------------
// Pages championnat.
var HUB_CSS = "*{box-sizing:border-box}body{margin:0;background:#060b12;color:#c3ccd8;font:15px/1.65 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding-bottom:96px}" +
  "a{color:#20d5ef}a:focus-visible{outline:2px solid #20d5ef;outline-offset:2px}" +
  ".hdr{display:flex;align-items:center;gap:16px;max-width:960px;margin:0 auto;padding:14px 18px;border-bottom:1px solid rgba(141,179,211,.14)}" +
  ".hdr img{display:block;width:132px;height:auto}.hdr nav{margin-left:auto;display:flex;gap:14px;font-size:13px;font-weight:600}.hdr nav a{text-decoration:none;display:inline-flex;align-items:center;min-height:44px}" +
  "main{max-width:960px;margin:0 auto;padding:18px}.crumbs{font-size:12.5px;color:#91a0b3;margin:6px 0 14px}.crumbs a{color:#91a0b3}" +
  "h1{color:#f4f7fb;font-size:clamp(26px,4vw,38px);line-height:1.15;margin:0 0 12px}h2{color:#f4f7fb;font-size:19px;margin:30px 0 10px}" +
  ".intro{max-width:760px}.note{font-size:13px;color:#91a0b3}.fx{list-style:none;padding:0;margin:0;border-top:1px solid rgba(141,179,211,.14)}" +
  ".fx li{padding:12px 0;border-bottom:1px solid rgba(141,179,211,.14)}.fx a{font-weight:700;color:#f4f7fb;text-decoration:none}.fx a:hover{color:#20d5ef}" +
  ".fx .meta{display:block;font-size:13px;color:#91a0b3}.others{display:flex;flex-wrap:wrap;gap:0 16px;font-size:14px}.others a{display:inline-flex;align-items:center;min-height:44px}" +
  ".foot{max-width:960px;margin:24px auto 0;padding:18px;border-top:1px solid rgba(141,179,211,.14);font-size:12.5px;color:#91a0b3}.foot a{color:#91a0b3}";

function hubVars(key, dir) {
  var L = C.seoConf(dir).league;
  return { league: C.leagueByKey(key).displayName, country: (L.countries || {})[key] || "" };
}
function hubText(key, dir, field, genericField) {
  var L = C.seoConf(dir).league;
  var ov = (L.overrides && L.overrides[key]) || {};
  return C.fill(ov[field] || L[genericField || field], hubVars(key, dir));
}

function renderLeagueHub(key, dir, matches) {
  var s = C.seoConf(dir), L = s.league, conf = DIRS[dir], dict = C.dictFor(dir);
  var name = C.leagueByKey(key).displayName;
  var title = hubText(key, dir, "title"), desc = hubText(key, dir, "description"), h1 = hubText(key, dir, "h1");
  var intro = hubText(key, dir, "intro", "intro_generic");
  var indexable = matches.length >= MIN_INDEXABLE_FIXTURES;
  var canonical = SITE_URL + C.leagueHubPath(dir, key);
  var crumbs = [{ name: s.breadcrumb.home, url: SITE_URL + C.homePath(dir) }, { name: name, url: canonical }];
  var help = B().helplineFor(dir);

  var items = matches.map(function (m) {
    var d = kickoff(m), v = venue(m);
    var meta = [];
    if (d) meta.push('<time datetime="' + isoInstant(d) + '">' + esc(longDate(d, dir)) + " · " + esc(clock(d, dir)) + "</time>");
    if (v) meta.push(esc(v));
    return '<li><a href="' + C.matchPath(dir, m.id) + '">' + esc(teams(m)) + '</a><span class="meta">' + meta.join(" · ") + "</span></li>";
  }).join("");
  var fixtures = matches.length
    ? '<p class="note">' + esc(L.kickoff_note) + '</p><ul class="fx">' + items + "</ul>"
    : "<p>" + esc(C.fill(L.none, { league: name })) + "</p>";
  var others = C.LEAGUES.filter(function (l) { return l.key !== key; }).map(function (l) {
    return '<a href="' + C.leagueHubPath(dir, l.key) + '">' + esc(l.displayName) + "</a>";
  }).join("");
  var guides = HUB_GUIDES.map(function (g) {
    return '<li><a href="' + C.guidePath(dir, g) + '">' + esc(C.guideLabel(dir, g)) + "</a></li>";
  }).join("");
  var legal = B().LEGAL_FILE_LIST.filter(function (f) { return fs.existsSync(path.join(C.ROOT, "legal", dir, f)); }).map(function (f) {
    var labelKey = { "mentions-legales.html": "footer.mentions_legales", "cgv.html": "footer.cgv", "confidentialite.html": "footer.confidentialite", "cookies.html": "footer.cookies", "jeu-responsable.html": "footer.responsible_gambling", "methodologie.html": "footer.methodology" }[f];
    var label = labelKey ? C.get(dict, labelKey) : null;
    return '<a href="/' + dir + "/" + f + '">' + esc(typeof label === "string" ? label : f) + "</a>";
  }).join(" · ");
  var helpHtml = help ? "<p>" + esc(L.help) + ' <a href="' + esc(help.url) + '" rel="noopener">' + esc(help.name) + "</a>" + (help.phone ? " · " + esc(help.phone) : "") + "</p>" : "";

  var page = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": canonical + "#webpage",
    url: canonical,
    name: title,
    description: desc,
    inLanguage: conf.htmlLang,
    isPartOf: { "@id": SITE_URL + "/#website" },
    about: { "@type": "SportsOrganization", name: name }
  };
  if (matches.length) {
    page.mainEntity = {
      "@type": "ItemList",
      itemListElement: matches.map(function (m, i) { return { "@type": "ListItem", position: i + 1, url: SITE_URL + C.matchPath(dir, m.id), name: teams(m) }; })
    };
  }
  var nav = function (k, fb) { var v = C.get(dict, k); return esc(typeof v === "string" ? v : fb); };
  var html = "<!DOCTYPE html>\n" +
    '<html lang="' + conf.htmlLang + '">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="iashark-market" content="' + conf.market + '">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    "<title>" + esc(title) + "</title>\n" +
    '<meta name="description" content="' + esc(desc) + '">\n' +
    (indexable ? "" : '<meta name="robots" content="noindex,follow">\n') +
    '<link rel="canonical" href="' + canonical + '">\n' +
    C.hreflangLinks(C.alternatesFor(function (d) { return C.leagueHubPath(d, key); })).replace(/></g, ">\n<") + "\n" +
    '<meta property="og:type" content="website">\n<meta property="og:site_name" content="IASHARK">\n' +
    '<meta property="og:locale" content="' + C.ogLocale(dir) + '">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n<meta property="og:description" content="' + esc(desc) + '">\n' +
    '<meta property="og:url" content="' + canonical + '">\n<meta property="og:image" content="' + SITE_URL + '/icon-512.png">\n' +
    '<meta name="twitter:card" content="summary">\n' +
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n' +
    C.ldScript(C.breadcrumbLd(crumbs)) + "\n" + C.ldScript(page) + "\n" +
    "<style>" + HUB_CSS + "</style>\n" +
    '<link rel="stylesheet" href="/assets/bottom-navigation.css">\n' +
    "</head>\n<body>\n" +
    '<header class="hdr"><a href="' + C.homePath(dir) + '" aria-label="IASHARK"><img src="/assets/iashark-logo.png" width="1648" height="440" alt="IASHARK"></a>' +
    '<nav><a href="' + C.homePath(dir) + '">' + nav("nav.home", "Home") + '</a><a href="' + C.blogHubPath(dir) + '">' + nav("nav.guides", "Blog") + "</a></nav></header>\n" +
    "<main>\n" +
    '<nav class="crumbs" aria-label="' + esc(s.match.breadcrumb_aria) + '"><a href="' + C.homePath(dir) + '">' + esc(s.breadcrumb.home) + '</a> <span aria-hidden="true">›</span> <span aria-current="page">' + esc(name) + "</span></nav>\n" +
    "<h1>" + esc(h1) + "</h1>\n" +
    '<p class="intro">' + esc(intro) + "</p>\n" +
    "<h2>" + esc(L.fixtures_title) + "</h2>\n" + fixtures + "\n" +
    "<h2>" + esc(L.method_title) + "</h2>\n<p class=\"intro\">" + esc(L.method) + "</p>\n" +
    "<ul>" + guides + '</ul>\n<p><a href="' + C.homePath(dir) + '">' + esc(L.free_link) + "</a></p>\n" +
    "<h2>" + esc(L.others_title) + '</h2>\n<p class="others">' + others + "</p>\n" +
    "</main>\n" +
    '<footer class="foot"><p>' + esc(L.disclaimer) + "</p>" + helpHtml + (legal ? "<p>" + legal + "</p>" : "") + "</footer>\n" +
    '<script defer src="/i18n/i18n.js"></script>\n<script defer src="/lib/market-config.js"></script>\n<script defer src="/bottom-navigation.js"></script>\n' +
    "</body>\n</html>\n";
  return { html: html, indexable: indexable, count: matches.length };
}

// ---------------------------------------------------------------------------
// Ecriture + sitemaps.
function sortMatches(list) { return list.slice().sort(MATCH_TIME.compareMatches); }

function writeSeoPages(matchs, opts) {
  opts = opts || {};
  var root = opts.root || C.ROOT;
  var today = opts.today || new Date().toISOString().slice(0, 10);
  var tpl = opts.tpl != null ? opts.tpl : fs.readFileSync(path.join(root, "match.html"), "utf8");
  var list = sortMatches((matchs || []).filter(validMatch));
  var report = { matchPages: 0, hubs: 0, indexableHubs: 0, removed: 0 };

  var matchDirs = opts.matchDirs || DIR_CODES.filter(function (d) { return d !== X_DEFAULT_DIR; });
  matchDirs.forEach(function (dir) {
    var out = path.join(root, dir, "match");
    fs.mkdirSync(out, { recursive: true });
    var keep = {};
    list.forEach(function (m) {
      var f = String(m.id) + ".html";
      writeIfChanged(path.join(out, f), renderMatchPage(tpl, m, dir));
      keep[f] = true;
      report.matchPages++;
    });
    fs.readdirSync(out).forEach(function (f) {
      if (!keep[f]) { fs.unlinkSync(path.join(out, f)); report.removed++; }
    });
  });

  var hubDirs = opts.hubDirs || DIR_CODES;
  hubDirs.forEach(function (dir) {
    var out = path.join(root, dir, "leagues");
    fs.mkdirSync(out, { recursive: true });
    var keep = {};
    C.LEAGUES.forEach(function (l) {
      var r = renderLeagueHub(l.key, dir, list.filter(function (m) { return m.league_key === l.key; }));
      var f = C.leagueSlug(l.key) + ".html";
      writeIfChanged(path.join(out, f), r.html);
      keep[f] = true;
      report.hubs++;
      if (r.indexable) report.indexableHubs++;
    });
    fs.readdirSync(out).forEach(function (f) {
      if (!keep[f]) { fs.unlinkSync(path.join(out, f)); report.removed++; }
    });
  });

  report.sitemaps = writeSeoSitemaps(root, today);
  return report;
}

function isNoindex(html) {
  var head = html.split(/<\/head>/i)[0];
  return /<meta name="robots" content="[^"]*noindex/i.test(head);
}
function urlset(entries) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map(function (e) { return "<url><loc>" + e.loc + "</loc><lastmod>" + e.lastmod + "</lastmod></url>"; }).join("\n") +
    "\n</urlset>\n";
}
// Sitemaps construits depuis les fichiers REELLEMENT presents (jamais une URL
// sans page, jamais une page noindex).
function writeSeoSitemaps(root, today) {
  var files = [];
  function collect(group, sub, fname, dirs) {
    var t = LASTMOD.tracker(root, group, today);
    var entries = [];
    dirs.forEach(function (dir) {
      var abs = path.join(root, dir, sub);
      if (!fs.existsSync(abs)) return;
      fs.readdirSync(abs).filter(function (f) { return /\.html$/.test(f); }).sort().forEach(function (f) {
        var html = fs.readFileSync(path.join(abs, f), "utf8");
        if (isNoindex(html)) return;
        var loc = SITE_URL + "/" + dir + "/" + sub + "/" + f;
        entries.push({ loc: loc, lastmod: t.lastmod(loc, html) });
      });
    });
    t.save();
    writeIfChanged(path.join(root, fname), urlset(entries));
    files.push(fname);
  }
  collect("matches-i18n", "match", "sitemap-matches-i18n.xml", DIR_CODES.filter(function (d) { return d !== X_DEFAULT_DIR; }));
  collect("leagues", "leagues", "sitemap-leagues.xml", DIR_CODES);
  return files;
}

module.exports = {
  MIN_INDEXABLE_FIXTURES: MIN_INDEXABLE_FIXTURES,
  matchTitle: matchTitle, matchDescription: matchDescription, matchJsonLd: matchJsonLd, matchEvent: matchEvent,
  matchHeadExtras: matchHeadExtras, matchFactsHtml: matchFactsHtml, matchSummaryHtml: matchSummaryHtml, matchMetaBlock: matchMetaBlock,
  matchAlternates: matchAlternates, renderMatchPage: renderMatchPage, renderLeagueHub: renderLeagueHub,
  writeSeoPages: writeSeoPages, writeSeoSitemaps: writeSeoSitemaps, liensVersionFr: liensVersionFr
};

if (require.main === module) {
  var root = C.ROOT;
  var today = new Date().toISOString().slice(0, 10);
  // Source locale = copie assainie deja publiee : match/<id>.json pour chaque
  // page match/<id>.html existante (memes donnees que matchsPublics).
  var matchDir = path.join(root, "match");
  var matchs = fs.existsSync(matchDir) ? fs.readdirSync(matchDir).filter(function (f) { return /^\d+\.json$/.test(f); }).map(function (f) {
    try { return JSON.parse(fs.readFileSync(path.join(matchDir, f), "utf8")); } catch (e) { return null; }
  }).filter(function (m) { return validMatch(m) && fs.existsSync(path.join(matchDir, m.id + ".html")); }) : [];
  var tpl = fs.readFileSync(path.join(root, "match.html"), "utf8");
  if (process.argv.indexOf("--no-fr") === -1) {
    matchs.forEach(function (m) { writeIfChanged(path.join(matchDir, m.id + ".html"), renderMatchPage(tpl, m, X_DEFAULT_DIR)); });
  }
  var rep = writeSeoPages(matchs, { root: root, today: today, tpl: tpl });
  console.log("SEO pages : " + matchs.length + " match(s) ; " + rep.matchPages + " page(s) match localisee(s), " + rep.hubs + " page(s) championnat (" + rep.indexableHubs + " indexable(s)), " + rep.removed + " fichier(s) perime(s) supprime(s) ; sitemaps : " + rep.sitemaps.join(", "));
}
