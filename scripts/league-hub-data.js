"use strict";
// Contenu STABLE des pages championnat /<dir>/leagues/<slug>.html
// (scripts/seo-pages.js#renderLeagueHub), audit SEO du 15/09/2026.
//
// Avant : un hub n'etait indexable qu'avec au moins 2 matchs dans le run du
// jour ; Liga MX (/mx/) ou PSL (/za/) passaient en noindex les jours sans
// match. Le hub repose desormais sur des donnees publiques qui ne disparaissent
// pas d'un jour a l'autre :
//   - matchs des 14 prochains jours : run du jour, registre du cycle de vie
//     (data/match-pages-registry.json), calendrier api-football en cache
//     (data/club-hubs/cache, prochains matchs des clubs suivis) ;
//   - derniers resultats (30 jours) : score final du registre (tire des
//     donnees publiques, scripts/match-lifecycle.js#findFinalScore) et
//     derniers matchs termines du cache ;
//   - classement : dernier classement COMPLET connu, conserve dans
//     data/league-hubs-registry.json (jamais publie : data/ est refuse par
//     scripts/build-public.js) depuis la reponse /standings api-football
//     (celle que le pipeline lit pour ses matchs du jour, ou le cache des pages
//     club) ; retire apres 45 jours. Audit du 19/09/2026 : l'extrait publie
//     avec un match (rangs voisins des deux equipes) n'est JAMAIS un classement
//     de championnat (Premier League : 17 lignes des rangs 2 a 18, Arsenal 1er
//     absent, « En tete : Manchester City ») ; groupes et phases suivent
//     lib/standings-groups.js (MLS : deux conferences, jamais fusionnees) ;
//   - pages club et derby de la competition dans la version.
// Aucun champ premium, ni conf, ni cote, ni pari : equipes, dates, stades,
// scores, classement, forme et zones de classement uniquement.
const fs = require("fs");
const path = require("path");
const C = require("./seo-common.js");
const MATCH_TIME = require("../lib/match-time.js");
const SG = require("../lib/standings-groups.js");
const VENUE = require("../lib/venue.js");

const STORE_FILE = "data/league-hubs-registry.json";
const CACHE_DIR = "data/club-hubs/cache";
const DAY = 24 * 3600 * 1000;
const UPCOMING_DAYS = 14;
const RESULTS_DAYS = 30;
const STANDINGS_MAX_AGE_DAYS = 45;
// Un match commence depuis plus de 2 h est considere joue (meme seuil que
// scripts/match-lifecycle.js#FINISHED_AFTER_MINUTES).
const FINISHED_AFTER_MS = 120 * 60000;
const MAX_UPCOMING = 20, MAX_RESULTS = 10;

const README = [
  "Classements des pages championnat (scripts/league-hub-data.js), ecrit par scripts/seo-pages.js#writeSeoPages",
  "(pipeline : generateMatchPages ; local : node scripts/seo-pages.js). Jamais publie.",
  "leagues.<cle>.standings = dernier classement COMPLET connu, source 'api-football' : reponse /standings lue par le pipeline",
  "(opts.standings) ou cache data/club-hubs/cache. Tous les groupes (conferences, zones, phases) sont gardes avec leur nom.",
  "Un extrait publie avec un match (source 'matchs') n'est plus jamais retenu (audit du 19/09/2026).",
  "as_of = date des donnees ; retire apres " + STANDINGS_MAX_AGE_DAYS + " jours sans mise a jour."
];

function num(v) { return typeof v === "number" && isFinite(v) ? v : (typeof v === "string" && v.trim() !== "" && isFinite(Number(v)) ? Number(v) : null); }
function str(v, max) { return typeof v === "string" && v.trim() ? v.trim().slice(0, max || 80) : null; }
function isoDay(t) { return new Date(t).toISOString().slice(0, 10); }
// Stade affiche : lib/venue.js (ville seulement si verifiee, jamais "(domicile)").
function venueName(stade) { return VENUE.venueLabel(stade); }

// ---------------------------------------------------------------------------
// Registre des classements.
function emptyStore() { return { _readme: README.slice(), version: 1, leagues: {} }; }
function loadStore(root) {
  try {
    var s = JSON.parse(fs.readFileSync(path.join(root || C.ROOT, STORE_FILE), "utf8"));
    if (!s || typeof s.leagues !== "object" || !s.leagues) return emptyStore();
    s._readme = README.slice();
    s.version = 1;
    return s;
  } catch (e) { return emptyStore(); }
}
function serializeStore(store) {
  var keys = Object.keys(store.leagues).sort();
  return "{\n \"_readme\": " + JSON.stringify(README) + ",\n \"version\": 1,\n \"leagues\": {" +
    (keys.length ? "\n" + keys.map(function (k) { return "  " + JSON.stringify(k) + ": " + JSON.stringify(store.leagues[k]); }).join(",\n") + "\n " : "") + "}\n}\n";
}
function saveStore(root, store) {
  var p = path.join(root || C.ROOT, STORE_FILE), s = serializeStore(store);
  if (fs.existsSync(p) && fs.readFileSync(p, "utf8") === s) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
  return true;
}

// Ligne de classement normalisee (liste blanche).
function row(r) {
  var o = { rank: num(r.rank), team_id: num(r.team_id != null ? r.team_id : r.teamId), name: str(r.name), played: num(r.played),
    won: num(r.won != null ? r.won : r.win), drawn: num(r.drawn != null ? r.drawn : r.draw), lost: num(r.lost != null ? r.lost : r.lose),
    gd: num(r.gd), pts: num(r.pts != null ? r.pts : r.points) };
  // Forme (api-football : plus recent en premier) et zone de classement
  // (description publique, ex. "Promotion - Champions League") : facultatives.
  var form = typeof r.form === "string" ? r.form.toUpperCase().replace(/[^WDL]/g, "").slice(0, 5) : "";
  if (form) o.form = form;
  var zone = str(r.zone != null ? r.zone : r.description, 80);
  if (zone) o.zone = zone;
  return o.name && o.rank != null && o.pts != null ? o : null;
}

// Cache api-football (lecture synchrone, memoisee par racine).
var cacheMemo = {};
function cacheEntries(root) {
  var dir = path.join(root || C.ROOT, CACHE_DIR);
  if (cacheMemo[dir]) return cacheMemo[dir];
  var out = { standings: [], fixtures: [] };
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).filter(function (f) { return /\.json$/.test(f); }).sort().forEach(function (f) {
      var j;
      try { j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { return; }
      if (!j || !Array.isArray(j.response)) return;
      if (j.endpoint === "/standings") out.standings.push(j);
      else if (j.endpoint === "/fixtures" || j.endpoint === "/fixtures/headtohead") out.fixtures.push(j);
    });
  }
  return (cacheMemo[dir] = out);
}
function clearCache() { cacheMemo = {}; }

// Reponse api-football /standings (response[0].league) -> classement du
// registre : TOUS les groupes, chacun avec son nom api-football.
function fromApiLeague(lg, fetchedAt) {
  if (!lg || !Array.isArray(lg.standings)) return null;
  var groups = lg.standings.filter(function (g) { return Array.isArray(g) && g.length; }).map(function (g) {
    return { name: str(g[0].group), rows: g.map(function (r) { var a = r.all || {}; return row({ rank: r.rank, team_id: r.team && r.team.id, name: r.team && r.team.name, played: a.played, win: a.win, draw: a.draw, lose: a.lose, gd: r.goalsDiff, points: r.points, form: r.form, description: r.description }); }).filter(Boolean) };
  }).filter(function (g) { return g.rows.length; });
  if (!groups.length) return null;
  var at = str(fetchedAt, 30);
  return { as_of: at ? at.slice(0, 10) : null, source: "api-football", season: num(lg.season), league_name: str(lg.name), groups: groups };
}
function cacheStandings(root, apiId) {
  var best = null;
  cacheEntries(root).standings.forEach(function (j) {
    var lg = j.response[0] && j.response[0].league;
    if (!lg || Number(lg.id != null ? lg.id : j.params && j.params.league) !== apiId) return;
    var st = fromApiLeague(lg, j.fetched_at);
    if (st && st.as_of && (!best || Date.parse(st.as_of) > Date.parse(best.as_of))) best = st;
  });
  return best;
}

// Met a jour le registre EN PLACE. Sources, toutes COMPLETES (reponse
// /standings api-football) : opts.standings = {<apiFootballId>: {league,
// fetched_at}} (lu par le pipeline pour ses matchs du jour), cache des pages
// club, registre precedent. Le plus recent gagne ; a date egale, le registre
// precedent cede. Un extrait publie avec un match (m.classement) n'est plus
// jamais utilise (runMatches garde pour la compatibilite d'appel).
function updateStore(store, runMatches, now, opts) {
  opts = opts || {};
  var t = (now || new Date()).getTime();
  var fresh = opts.standings && typeof opts.standings === "object" ? opts.standings : {};
  C.LEAGUES.forEach(function (l) {
    var cur = store.leagues[l.key] && store.leagues[l.key].standings || null;
    var candidates = [];
    var run = fresh[l.apiFootballId] || fresh[String(l.apiFootballId)] || null;
    var fromRun = run ? fromApiLeague(run.league, run.fetched_at || new Date(t).toISOString()) : null;
    if (fromRun) candidates.push(fromRun);
    var cached = cacheStandings(opts.root, l.apiFootballId);
    if (cached) candidates.push(cached);
    if (cur && cur.as_of && cur.source === "api-football") candidates.push(cur);
    candidates.sort(function (a, b) { return Date.parse(b.as_of + "T00:00:00Z") - Date.parse(a.as_of + "T00:00:00Z"); });
    var pick = candidates[0] || null;
    if (pick && t - Date.parse(pick.as_of + "T00:00:00Z") > STANDINGS_MAX_AGE_DAYS * DAY) pick = null;
    if (pick) store.leagues[l.key] = { standings: pick };
    else delete store.leagues[l.key];
  });
  Object.keys(store.leagues).forEach(function (k) { if (!C.leagueByKey(k)) delete store.leagues[k]; });
  return store;
}

// Groupes affiches : phase en cours (lib/standings-groups.js) - conferences
// MLS, zones A/B de l'Argentine, Clausura seule en Colombie et au Perou - ;
// chaque groupe garde son nom, jamais fusionne. Un extrait publie avec un
// match (source 'matchs', anciens registres) n'est jamais affiche.
function displayGroups(st) {
  if (!st || st.source !== "api-football" || !Array.isArray(st.groups) || !st.groups.length) return [];
  return SG.currentPhaseGroups(st.groups).map(function (g) { return { name: g.name, rows: g.rows }; });
}

// ---------------------------------------------------------------------------
// Assemblage d'un hub.
function teamName(t) { return t && (t.n || t.name) ? String(t.n || t.name) : ""; }
function fixtureFromCache(f) {
  if (!f || !f.fixture || !f.teams || !f.teams.home || !f.teams.away || f.fixture.id == null) return null;
  var d = Date.parse(f.fixture.date);
  if (!isFinite(d)) return null;
  var st = (f.fixture.status && f.fixture.status.short) || "";
  return {
    id: String(f.fixture.id), leagueId: f.league ? Number(f.league.id) : null, t: d,
    home: { id: f.teams.home.id, n: str(f.teams.home.name) }, away: { id: f.teams.away.id, n: str(f.teams.away.name) },
    venue: str(f.fixture.venue && f.fixture.venue.name),
    scheduled: st === "NS" || st === "TBD", finished: st === "FT" || st === "AET" || st === "PEN",
    score: f.goals && num(f.goals.home) != null && num(f.goals.away) != null ? { home: f.goals.home, away: f.goals.away } : null
  };
}

// collect(key, dir, { root, now, runMatches, registry, store, linkDir })
// -> { upcoming: [...], results: [...], standings: {as_of, source, groups} | null, clubs: [...] }
// Chaque rencontre : { id, t (ms), home, away, venue, score, href }.
function collect(key, dir, opts) {
  opts = opts || {};
  var root = opts.root || C.ROOT, now = (opts.now || new Date()).getTime();
  var lg = C.leagueByKey(key);
  var scope = C.leagueDirs(key);
  var LIFECYCLE = require("./match-lifecycle.js");
  var linkDir = opts.linkDir || C.nearestDir(dir, scope);
  var byId = {};
  function put(e) {
    var k = String(e.id);
    var prev = byId[k];
    if (!prev) { byId[k] = e; return; }
    if (!prev.score && e.score) prev.score = e.score;
    if (!prev.venue && e.venue) prev.venue = e.venue;
    if (!prev.href && e.href) prev.href = e.href;
  }
  // 1. Matchs du run : pages generees dans le meme passage (lien sans verification disque).
  (opts.runMatches || []).forEach(function (m) {
    var d = MATCH_TIME.parseParis(m && m.date);
    if (!m || m.league_key !== key || !d || !m.home || !m.away) return;
    put({ id: String(m.id), t: d.getTime(), home: m.home, away: m.away, venue: venueName(m.stade), score: null, href: C.matchPath(linkDir, m.id), run: true });
  });
  // 2. Registre du cycle de vie (pages conservees, scores finals).
  var reg = opts.registry;
  if (reg && reg.matches) {
    Object.keys(reg.matches).forEach(function (id) {
      var e = reg.matches[id];
      if (!e || e.league_key !== key || !e.kickoff || e.status === "redirected" || !e.snapshot) return;
      var t = Date.parse(e.kickoff);
      if (!isFinite(t)) return;
      var fs0 = e.final_score && num(e.final_score.home) != null && num(e.final_score.away) != null ? { home: e.final_score.home, away: e.final_score.away } : null;
      put({ id: String(id), t: t, home: e.snapshot.home, away: e.snapshot.away, venue: venueName(e.snapshot.stade), score: fs0, href: LIFECYCLE.versionMatchHref(id, key, dir, root) });
    });
  }
  // 3. Calendrier api-football en cache (clubs suivis).
  if (lg && lg.apiFootballId != null) {
    cacheEntries(root).fixtures.forEach(function (j) {
      j.response.forEach(function (f) {
        var x = fixtureFromCache(f);
        if (!x || x.leagueId !== lg.apiFootballId) return;
        if (x.scheduled && x.t > now) put({ id: x.id, t: x.t, home: x.home, away: x.away, venue: x.venue, score: null, href: LIFECYCLE.versionMatchHref(x.id, key, dir, root) });
        else if (x.finished && x.score) put({ id: x.id, t: x.t, home: x.home, away: x.away, venue: x.venue, score: x.score, href: LIFECYCLE.versionMatchHref(x.id, key, dir, root) });
      });
    });
  }
  var all = Object.keys(byId).map(function (k) { return byId[k]; }).filter(function (e) { return teamName(e.home) && teamName(e.away); });
  var upcoming = all.filter(function (e) {
    if (e.t > now + UPCOMING_DAYS * DAY && !e.run) return false;
    return e.t >= now - FINISHED_AFTER_MS && !e.score;
  }).sort(function (a, b) { return a.t - b.t || (a.id < b.id ? -1 : 1); }).slice(0, MAX_UPCOMING);
  var upIds = {};
  upcoming.forEach(function (e) { upIds[e.id] = true; });
  var results = all.filter(function (e) {
    if (upIds[e.id] || e.t >= now - FINISHED_AFTER_MS && !e.score) return false;
    // Matchs du run : toujours listes (leur page vient d'etre ecrite, le lien la rend accessible).
    if (!e.run && (e.t < now - RESULTS_DAYS * DAY || e.t > now)) return false;
    // Sans score, un match joue n'est liste que s'il a une page (lien a garder).
    return !!e.score || !!e.href;
  }).sort(function (a, b) { return b.t - a.t || (a.id < b.id ? 1 : -1); }).filter(function (e, i) {
    // Au-dela des MAX_RESULTS plus recents, une page match encore indexable
    // (moins de NOINDEX_AFTER_DAYS) reste listee : une journee europeenne
    // compte 18 matchs, et une page sans lien entrant serait orpheline.
    return i < MAX_RESULTS || !!e.href && e.t >= now - LIFECYCLE.NOINDEX_AFTER_DAYS * DAY;
  });
  var store = opts.store || loadStore(root);
  var st = store.leagues[key] && store.leagues[key].standings || null;
  if (st && now - Date.parse(st.as_of + "T00:00:00Z") > STANDINGS_MAX_AGE_DAYS * DAY) st = null;
  var groups = st ? displayGroups(st) : [];
  return { upcoming: upcoming, results: results, standings: groups.length ? Object.assign({}, st, { groups: groups }) : null, clubs: C.leagueClubPages(key, dir, root) };
}

module.exports = {
  STORE_FILE: STORE_FILE, UPCOMING_DAYS: UPCOMING_DAYS, RESULTS_DAYS: RESULTS_DAYS, STANDINGS_MAX_AGE_DAYS: STANDINGS_MAX_AGE_DAYS,
  emptyStore: emptyStore, loadStore: loadStore, saveStore: saveStore, serializeStore: serializeStore, updateStore: updateStore,
  fromApiLeague: fromApiLeague, cacheStandings: cacheStandings, clearCache: clearCache, displayGroups: displayGroups, collect: collect
};
