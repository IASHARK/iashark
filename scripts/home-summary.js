"use strict";
// Resume SEO « Analyses IA du jour » de l'accueil de chaque version
// (<!--SEO_MATCHES_SUMMARY-->, HTML lu par les moteurs de recherche ; le JS de
// l'accueil le remplace par les cartes en heure locale du visiteur).
//
// Audit SEO du 19/09/2026 : le bloc etait ecrit UNE fois, en heure de Paris et
// pour le jour de Paris, puis recopie dans les 9 versions (« 01:30 — New York
// City FC vs New York Red Bulls » sur /en/ pour un match joue la veille a
// 19:30 ET ; « (hora de París) » sur /mx/). Desormais chaque version recoit son
// propre bloc :
//   - matchs du jour DANS LE FUSEAU de la version (i18n/seo/<dir>.json#tz) ;
//   - heure dans ce fuseau, libelle explicite (clock_list, home.summary_tz,
//     tz_label ; /en/ : « 9:30 PM ET (01:30 UTC) ») ;
//   - competitions de la version d'abord (home.priority_leagues, puis le reste
//     de son perimetre, puis les autres), puis coup d'envoi ;
//   - lien vers la page match de la version si elle existe
//     (scripts/match-lifecycle.js#homeSummaryHref), sinon nom sans lien ;
//   - noms d'affichage des equipes (lib/team-names.js).
// Une seule fonction pour le pipeline (.github/workflows/update-data.yml,
// injectHomeSeoSummary) et pour scripts/build-locales.js
// (rewriteHomeMatchSummary) : un rebuild local donne le meme bloc.
const C = require("./seo-common.js");
const LIFECYCLE = require("./match-lifecycle.js");
const MATCH_TIME = require("../lib/match-time.js");
const LEAGUE_NAMES = require("../lib/league-names.js");
const TEAMNAMES = require("../lib/team-names.js");

const esc = C.escHtml;

function validMatch(m) {
  return !!(m && m.id != null && /^\d{1,12}$/.test(String(m.id)) && m.home && m.away && m.home.n && m.away.n && MATCH_TIME.parseParis(m.date));
}

// Rang d'une competition pour une version : priorites de la version, puis son
// perimetre (config/leagues.json#seoMatchDirs), puis le reste.
function leagueRank(key, dir) {
  var prio = (C.seoConf(dir).home && C.seoConf(dir).home.priority_leagues) || [];
  var inScope = key && C.leagueByKey(key) ? LIFECYCLE.matchDirsFor(key).indexOf(dir) !== -1 : false;
  var i = prio.indexOf(key);
  if (i !== -1 && inScope) return i;
  return inScope ? 100 : 200;
}

// matchs : matchs du run (champs publics : id, date, home, away, league, league_key).
// opts : { today: "AAAA-MM-JJ" (jour du run), root, title (texte du titre),
//          hrefFor(id, leagueKey, dir) (tests) }.
// "" si aucun match ce jour-la dans le fuseau de la version.
function homeSummaryHtml(matchs, dir, opts) {
  opts = opts || {};
  var s = C.seoConf(dir);
  var today = opts.today;
  var root = opts.root || C.ROOT;
  var hrefFor = opts.hrefFor || function (id, key, d) { return LIFECYCLE.homeSummaryHref(id, key, d, root); };
  var seen = {};
  var list = (matchs || []).filter(validMatch).filter(function (m) {
    if (seen[m.id]) return false;
    seen[m.id] = true;
    return !today || C.dayKeyIn(MATCH_TIME.parseParis(m.date), dir) === today;
  }).map(function (m) { return { m: m, d: MATCH_TIME.parseParis(m.date), rank: leagueRank(m.league_key, dir) }; });
  if (!list.length) return "";
  list.sort(function (a, b) { return a.rank - b.rank || a.d - b.d || String(a.m.id).localeCompare(String(b.m.id)); });
  var items = list.map(function (x) {
    var m = x.m;
    var href = hrefFor(m.id, m.league_key, dir);
    var name = esc(TEAMNAMES.displayName(m.home)) + " vs " + esc(TEAMNAMES.displayName(m.away));
    var league = (LEAGUE_NAMES.displayName(m.league_key, m.league) || "").trim();
    // Le pari n'est JAMAIS nomme (ni note, ni probabilite) : HTML lu sans compte.
    return '<li><time datetime="' + x.d.toISOString().replace(/\.\d{3}Z$/, "Z") + '">' + esc(C.zonedClock(x.d, dir, "list")) + "</time> — <strong>" +
      (href ? '<a href="' + esc(href) + '" style="color:inherit">' + name + "</a>" : name) + "</strong>" + (league ? " (" + esc(league) + ")" : "") + "</li>";
  }).join("");
  var title = opts.title != null ? opts.title : (C.get(C.dictFor(dir), "home_app.seo_summary_title") || "");
  var dateLabel = today ? C.fmtIn(new Date(today + "T12:00:00Z"), dir, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "";
  var tzNote = (s.home && s.home.summary_tz) || s.tz_label;
  // Fuseau : texte statique de la version (pas de data-i18n : le runtime le
  // remplacerait par un libelle generique du dictionnaire).
  return '<div style="padding:4px 0 12px"><h2 style="font-family:\'Bebas Neue\',sans-serif;font-size:20px;color:#e2e8f0;margin-bottom:10px">' +
    '<span data-i18n="home_app.seo_summary_title">' + esc(title) + "</span>" +
    (today ? ' — <time data-seo-date datetime="' + esc(today) + '">' + esc(dateLabel) + "</time>" : "") +
    ' <small style="font-family:\'DM Sans\',sans-serif;font-size:11px;color:#64748b">(<span data-seo-tz>' + esc(tzNote) + "</span>)</small></h2>" +
    '<ul style="list-style:none;padding:0;margin:0;color:#94a3b8;font-size:12.5px;line-height:1.8">' + items + "</ul></div>";
}

// Jour du run porte par un bloc deja ecrit (<time data-seo-date datetime=...>).
function summaryDay(html) {
  var mm = /<!--SEO_MATCHES_SUMMARY-->[\s\S]*?<time data-seo-date datetime="(\d{4}-\d{2}-\d{2})"[\s\S]*?<!--\/SEO_MATCHES_SUMMARY-->/.exec(String(html || ""));
  return mm ? mm[1] : null;
}
function replaceSummary(html, summary) {
  return String(html).replace(/<!--SEO_MATCHES_SUMMARY-->[\s\S]*?<!--\/SEO_MATCHES_SUMMARY-->/, function () {
    return "<!--SEO_MATCHES_SUMMARY-->" + summary + "<!--/SEO_MATCHES_SUMMARY-->";
  });
}

module.exports = { homeSummaryHtml: homeSummaryHtml, summaryDay: summaryDay, replaceSummary: replaceSummary, leagueRank: leagueRank };
