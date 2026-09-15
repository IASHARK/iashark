"use strict";
// Donnees des pages club / derby (scripts/build-club-hubs.js).
//
// Deux sources, jamais melangees avec des champs reserves :
//   1. api-football (lib/club-hub-api.js, cache disque) : identite du club,
//      calendrier (prochains / derniers matchs), classement, confrontations.
//   2. Donnees publiques IASHARK : data-home.json et match/<id>.json. Seuls les
//      champs de la LISTE BLANCHE publicMatch() sont lus (id, date, competition,
//      equipes, stade, conf). Aucun champ premium (pari_rec, cote_rec, edge...)
//      n'est jamais copie, meme pour le match offert.
const fs = require("fs");
const path = require("path");
const MATCH_TIME = require("./match-time.js");

const FINISHED = { FT: true, AET: true, PEN: true };
const SCHEDULED = { NS: true, TBD: true };

function num(v) { return typeof v === "number" && isFinite(v) ? v : null; }
function decodeEntities(s) {
  return String(s).replace(/&apos;|&#0?39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function str(v) {
  if (typeof v !== "string") return null;
  var s = decodeEntities(v).trim();
  return s || null;
}

// ---------------------------------------------------------------------------
// api-football -> formes internes.
function normalizeFixture(f) {
  if (!f || !f.fixture || !f.teams || !f.teams.home || !f.teams.away) return null;
  var d = new Date(f.fixture.date);
  if (isNaN(d.getTime()) || f.fixture.id == null) return null;
  var st = (f.fixture.status && f.fixture.status.short) || "";
  var pen = f.score && f.score.penalty;
  return {
    id: f.fixture.id,
    date: d,
    status: st,
    finished: !!FINISHED[st],
    scheduled: !!SCHEDULED[st],
    league: { id: f.league ? f.league.id : null, name: str(f.league && f.league.name), round: str(f.league && f.league.round) },
    venue: str(f.fixture.venue && f.fixture.venue.name),
    home: { id: f.teams.home.id, name: str(f.teams.home.name) },
    away: { id: f.teams.away.id, name: str(f.teams.away.name) },
    goals: { home: num(f.goals && f.goals.home), away: num(f.goals && f.goals.away) },
    penalty: pen && num(pen.home) != null && num(pen.away) != null ? { home: pen.home, away: pen.away } : null
  };
}

function normalizeTeam(response) {
  var r = Array.isArray(response) ? response[0] : null;
  if (!r || !r.team) return null;
  var v = r.venue || {};
  return {
    id: r.team.id,
    name: str(r.team.name),
    logo: str(r.team.logo),
    founded: num(r.team.founded),
    venue: { name: str(v.name), city: str(v.city), capacity: num(v.capacity) }
  };
}

function seasonFromLeagues(response) {
  var r = Array.isArray(response) ? response[0] : null;
  if (!r || !Array.isArray(r.seasons)) return null;
  var cur = r.seasons.filter(function (s) { return s && s.current; })[0] || r.seasons[r.seasons.length - 1];
  return cur ? num(cur.year) : null;
}

// Classement : tous les groupes de la competition (Liga MX : un groupe
// "Apertura" ; phase de ligue UEFA : un groupe unique).
function normalizeStandings(response) {
  var lg = Array.isArray(response) && response[0] && response[0].league;
  if (!lg || !Array.isArray(lg.standings)) return null;
  var groups = lg.standings.filter(function (g) { return Array.isArray(g) && g.length; }).map(function (g) {
    return {
      name: str(g[0].group),
      updated: str(g[0].update),
      rows: g.filter(function (r) { return r && r.team; }).map(function (r) {
        var all = r.all || {};
        var goals = all.goals || {};
        return {
          rank: num(r.rank), teamId: r.team.id, name: str(r.team.name),
          played: num(all.played), win: num(all.win), draw: num(all.draw), lose: num(all.lose),
          gf: num(goals.for), ga: num(goals.against), gd: num(r.goalsDiff), points: num(r.points)
        };
      })
    };
  });
  if (!groups.length) return null;
  return { league: str(lg.name), season: num(lg.season), groups: groups, partial: false };
}

// Groupe contenant le plus d'equipes demandees (un derby exige les deux).
// A egalite, le groupe le PLUS TARDIF gagne : api-football liste les phases
// dans l'ordre chronologique (Argentine : Apertura A/B puis Clausura A/B ;
// Colombie : Apertura puis Clausura ; Perou : Tabla Anual, Apertura, Clausura),
// le dernier groupe ou figure le club est donc la phase en cours.
function groupFor(table, teamIds) {
  if (!table) return null;
  var best = null;
  table.groups.forEach(function (g) {
    var has = teamIds.filter(function (id) { return g.rows.some(function (r) { return r.teamId === id; }); }).length;
    if (has && (!best || has >= best.has)) best = { group: g, has: has };
  });
  if (!best) return null;
  return { league: table.league, season: table.season, name: best.group.name, updated: best.group.updated, rows: best.group.rows, partial: !!table.partial, containsAll: best.has === teamIds.length };
}

// ---------------------------------------------------------------------------
// Donnees publiques IASHARK (liste blanche).
function publicMatch(m) {
  if (!m || typeof m !== "object" || m.id == null || !/^\d{1,12}$/.test(String(m.id)) || !m.home || !m.away) return null;
  var d = MATCH_TIME.parseParis(m.date);
  if (!d) return null;
  return {
    id: Number(m.id),
    date: d,
    league: str(m.league),
    leagueKey: str(m.league_key),
    home: { id: m.home.id, name: str(m.home.n) },
    away: { id: m.away.id, name: str(m.away.n) },
    // "<equipe> (domicile)" : repli du pipeline sans stade connu, jamais affiche.
    venue: m.stade && str(m.stade.nom) && !/\(domicile\)\s*$/i.test(m.stade.nom) ? str(m.stade.nom) : null,
    isFree: m.is_free === true,
    // conf = probabilite estimee par le modele (pipeline : prob du marche retenu / 10) :
    // lue UNIQUEMENT pour le match offert (is_free === true), jamais pour un match payant.
    conf: m.is_free === true && m.model_output_available !== false ? num(m.conf) : null
  };
}

// { list, byId, generatedAt, details } - details = champs publics de match/<id>.json
// utilises seulement en repli (forme et classement) quand api-football ne repond pas.
function loadPublicMatches(root) {
  var out = { list: [], byId: {}, generatedAt: null, details: [] };
  function add(pm) { if (pm && !out.byId[pm.id]) { out.byId[pm.id] = pm; out.list.push(pm); } }
  try {
    var home = JSON.parse(fs.readFileSync(path.join(root, "data-home.json"), "utf8"));
    out.generatedAt = str(home.generated_at);
    (home.matchs || []).forEach(function (m) { add(publicMatch(m)); });
  } catch (e) { /* pas de data-home.json : pages construites depuis api-football seul */ }
  var dir = path.join(root, "match");
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir).filter(function (f) { return /^\d+\.json$/.test(f); }).sort().forEach(function (f) {
      var m;
      try { m = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch (e) { return; }
      var pm = publicMatch(m);
      if (!pm) return;
      add(pm);
      out.details.push({
        id: pm.id, date: pm.date, league: pm.league, home: pm.home, away: pm.away,
        form_home: Array.isArray(m.form_home) ? m.form_home : null,
        form_away: Array.isArray(m.form_away) ? m.form_away : null,
        classement: m.classement && Array.isArray(m.classement.standings) ? m.classement : null
      });
    });
  }
  out.list.sort(function (a, b) { return a.date - b.date || a.id - b.id; });
  return out;
}

// ---------------------------------------------------------------------------
// Assemblage.
function involves(home, away, ids, both) {
  var present = [home && home.id, away && away.id];
  return both
    ? ids.every(function (id) { return present.indexOf(id) !== -1; })
    : ids.some(function (id) { return present.indexOf(id) !== -1; });
}

// Prochains matchs : calendrier api-football (toutes competitions) uni aux
// matchs IASHARK publics. Un match IASHARK porte `analysis` (lien + conf).
function upcomingFor(teamIds, apiFixtures, publicList, now, opts) {
  opts = opts || {};
  var both = !!opts.both, limit = opts.limit || 5;
  var byId = {};
  (apiFixtures || []).forEach(function (fx) {
    if (fx && fx.scheduled && fx.date > now && involves(fx.home, fx.away, teamIds, both)) byId[fx.id] = Object.assign({}, fx, { analysis: null });
  });
  (publicList || []).forEach(function (pm) {
    if (!pm || !(pm.date > now) || !involves(pm.home, pm.away, teamIds, both)) return;
    if (byId[pm.id]) { byId[pm.id].analysis = pm; return; }
    byId[pm.id] = {
      id: pm.id, date: pm.date, status: "NS", finished: false, scheduled: true,
      league: { id: null, name: pm.league, round: null }, venue: pm.venue,
      home: pm.home, away: pm.away, goals: { home: null, away: null }, penalty: null, analysis: pm
    };
  });
  return Object.keys(byId).map(function (k) { return byId[k]; })
    .sort(function (a, b) { return a.date - b.date || a.id - b.id; })
    .slice(0, limit);
}

function resultFor(fx, teamId) {
  var gh = fx.goals.home, ga = fx.goals.away;
  if (gh == null || ga == null) return null;
  var mine = fx.home.id === teamId ? gh : ga, theirs = fx.home.id === teamId ? ga : gh;
  return mine > theirs ? "W" : mine < theirs ? "L" : "D";
}

function formItemFromFixture(fx, teamId) {
  return {
    id: fx.id, date: fx.date, dateOnly: false, league: fx.league.name, round: fx.league.round,
    home: fx.home, away: fx.away, gh: fx.goals.home, ga: fx.goals.away, pens: fx.penalty,
    result: teamId != null ? resultFor(fx, teamId) : null
  };
}

function recentResults(apiFixtures, teamId, limit) {
  return (apiFixtures || []).filter(function (fx) {
    return fx && fx.finished && fx.goals.home != null && (fx.home.id === teamId || fx.away.id === teamId);
  }).sort(function (a, b) { return b.date - a.date; }).slice(0, limit || 5).map(function (fx) { return formItemFromFixture(fx, teamId); });
}

// Repli : forme publiee dans le dernier match/<id>.json du club (resultat,
// adversaire, date ; le sens du score n'y est pas garanti, il n'est pas affiche).
function formFromDetails(details, teamId, limit) {
  var best = null;
  (details || []).forEach(function (d) {
    var side = d.home.id === teamId ? d.form_home : d.away.id === teamId ? d.form_away : null;
    if (side && side.length && (!best || d.date > best.date)) best = { date: d.date, side: side };
  });
  if (!best) return [];
  return best.side.filter(function (e) { return e && /^[WDL]$/.test(e.result) && str(e.opponent); }).slice(0, limit || 5).map(function (e) {
    var dt = e.date_full ? new Date(e.date_full) : new Date(String(e.d) + "T12:00:00Z");
    return { id: null, date: isNaN(dt.getTime()) ? null : dt, dateOnly: true, league: null, round: null, opponent: str(e.opponent), isHome: !!e.home, result: e.result };
  });
}

function standingFromDetails(details, teamIds) {
  var best = null;
  (details || []).forEach(function (d) {
    if (!d.classement) return;
    var rows = d.classement.standings;
    var has = teamIds.filter(function (id) { return rows.some(function (r) { return r.team_id === id; }); }).length;
    if (has && (!best || has > best.has || (has === best.has && d.date > best.date))) best = { has: has, date: d.date, c: d.classement };
  });
  if (!best) return null;
  return {
    league: str(best.c.league_name), season: null, groups: [{
      name: null, updated: null,
      rows: best.c.standings.map(function (r) {
        return { rank: num(r.rank), teamId: r.team_id, name: str(r.name), played: num(r.played), win: num(r.won), draw: num(r.drawn), lose: num(r.lost), gf: null, ga: null, gd: num(r.gd), points: num(r.pts) };
      })
    }], partial: true
  };
}

function formSummary(items) {
  var s = { n: 0, w: 0, d: 0, l: 0 };
  items.forEach(function (it) {
    if (!it.result) return;
    s.n++;
    if (it.result === "W") s.w++; else if (it.result === "D") s.d++; else s.l++;
  });
  return s;
}

function isFriendly(fx) { return /friendl/i.test(fx.league && fx.league.name || ""); }

// Confrontations officielles terminees (matchs amicaux exclus), plus recentes d'abord.
function h2hResults(apiFixtures, idA, idB, limit) {
  var items = (apiFixtures || []).filter(function (fx) {
    return fx && fx.finished && !isFriendly(fx) && fx.goals.home != null && involves(fx.home, fx.away, [idA, idB], true);
  }).sort(function (a, b) { return b.date - a.date; }).slice(0, limit || 6);
  var summary = { n: items.length, winsA: 0, winsB: 0, draws: 0 };
  items.forEach(function (fx) {
    var r = resultFor(fx, idA);
    if (r === "W") summary.winsA++; else if (r === "L") summary.winsB++; else summary.draws++;
  });
  return { items: items.map(function (fx) { return formItemFromFixture(fx, null); }), summary: summary };
}

// ---------------------------------------------------------------------------
// Appels api-football (client = lib/club-hub-api.js).
async function fetchLeague(client, apiLeagueId, fallbackSeason) {
  var lr = await client.get("/leagues", { id: apiLeagueId, current: "true" });
  var season = seasonFromLeagues(lr.response) || fallbackSeason || null;
  if (!season) return { season: null, table: null, status: lr.status };
  var st = await client.get("/standings", { league: apiLeagueId, season: season });
  return { season: season, table: normalizeStandings(st.response), status: st.status, fetchedAt: st.fetched_at };
}

async function fetchTeam(client, teamId) {
  var r = await Promise.all([
    client.get("/teams", { id: teamId }),
    client.get("/fixtures", { team: teamId, next: 5 }),
    client.get("/fixtures", { team: teamId, last: 5 })
  ]);
  return {
    id: teamId,
    info: normalizeTeam(r[0].response),
    next: r[1].response.map(normalizeFixture).filter(Boolean),
    last: r[2].response.map(normalizeFixture).filter(Boolean),
    status: { info: r[0].status, next: r[1].status, last: r[2].status }
  };
}

async function fetchH2H(client, idA, idB) {
  var key = idA + "-" + idB;
  var r = await Promise.all([
    client.get("/fixtures/headtohead", { h2h: key, last: 10 }),
    client.get("/fixtures/headtohead", { h2h: key, next: 2 })
  ]);
  return {
    last: r[0].response.map(normalizeFixture).filter(Boolean),
    next: r[1].response.map(normalizeFixture).filter(Boolean),
    status: { last: r[0].status, next: r[1].status }
  };
}

module.exports = {
  normalizeFixture: normalizeFixture, normalizeTeam: normalizeTeam, normalizeStandings: normalizeStandings,
  seasonFromLeagues: seasonFromLeagues, groupFor: groupFor, publicMatch: publicMatch, loadPublicMatches: loadPublicMatches,
  upcomingFor: upcomingFor, resultFor: resultFor, recentResults: recentResults, formFromDetails: formFromDetails,
  standingFromDetails: standingFromDetails, formSummary: formSummary, h2hResults: h2hResults,
  fetchLeague: fetchLeague, fetchTeam: fetchTeam, fetchH2H: fetchH2H, decodeEntities: decodeEntities
};
