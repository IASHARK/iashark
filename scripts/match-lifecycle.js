"use strict";
// Cycle de vie des pages match statiques (/match/<id>.html et
// /<dir>/match/<id>.html), audit SEO du 15/09/2026.
//
// Avant : une page match etait supprimee des que le match sortait du run
// quotidien -> des centaines d'URLs creees puis passees en 404 chaque jour.
//
// Maintenant, un registre versionne (data/match-pages-registry.json, jamais
// publie : scripts/build-public.js refuse data/) garde pour chaque match :
// ligue, versions generees, coup d'envoi, statut et un instantane de FAITS
// PUBLICS (liste blanche ci-dessous : equipes, stade, forme, classement,
// confrontations directes, compositions). Aucun champ de lib/premium-fields.js,
// ni conf, ni cote : une page conservee est rendue depuis cet instantane,
// jamais depuis le detail premium.
//
// Calendrier, compte depuis le coup d'envoi :
//   - dans le run                 : page d'analyse normale ("active") ;
//   - sorti du run                : page conservee, score final si connu
//                                   (sinon "Match termine"), lien vers le hub ;
//   - J+2 (48 h)                  : hors sitemap (page toujours servie) ;
//   - J+7                         : noindex,follow ;
//   - J+30                        : pages supprimees, 301 vers le hub ligue de
//                                   la version (_redirects, bloc ci-dessous,
//                                   reecrit aussi par scripts/build-locales.js) ;
//   - J+30 + 90 jours             : regle 301 et entree retirees du registre.
const fs = require("fs");
const path = require("path");
const C = require("./seo-common.js");
const MATCH_TIME = require("../lib/match-time.js");

const REGISTRY_FILE = "data/match-pages-registry.json";
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const SITEMAP_MAX_AGE_HOURS = 48;
const NOINDEX_AFTER_DAYS = 7;
const REMOVE_AFTER_DAYS = 30;
const REDIRECT_RETENTION_DAYS = 90;
// Au-dela, un match parti du run apres son coup d'envoi est dit "termine".
const FINISHED_AFTER_MINUTES = 120;

const REDIRECTS_BEGIN = "# --- Pages match retirees (J+30 apres le coup d'envoi) : 301 vers le hub ligue de la version.";
const REDIRECTS_NOTE = "# Genere depuis data/match-pages-registry.json (scripts/match-lifecycle.js), versions sorties du perimetre comprises (retired_dirs). Non force : ne s'applique que si la page n'existe plus.";
const REDIRECTS_END = "# --- Fin des pages match retirees.";

// ---------------------------------------------------------------------------
// Perimetre des versions : config/leagues.json#seoMatchDirs (+ fr, toujours).
function matchDirsFor(leagueKey) { return C.leagueDirs(leagueKey); }

// Lien d'un resume (accueil de version, pipeline injectHomeSeoSummary et
// scripts/build-locales.js) vers la page statique d'un match : page de la
// version si elle existe, sinon la version la plus proche reellement generee
// (meme langue, puis en, puis fr), toujours dans le perimetre de la
// competition. leagueKey inconnue : registre, puis match/<id>.json, sinon
// seule l'existence du fichier compte. null : aucune page (nom sans lien).
function versionMatchHref(id, leagueKey, dir, root) {
  root = root || C.ROOT;
  if (!/^\d{1,12}$/.test(String(id))) return null;
  dir = C.DIRS[dir] ? dir : C.X_DEFAULT_DIR;
  var key = leagueKey || null;
  if (!key) {
    try { var e = loadRegistry(root).matches[String(id)]; key = e && e.league_key || null; } catch (err) {}
  }
  if (!key) {
    try { key = JSON.parse(fs.readFileSync(path.join(root, "match", id + ".json"), "utf8")).league_key || null; } catch (err) {}
  }
  var scope = key && C.leagueByKey(key) ? matchDirsFor(key) : C.DIR_CODES;
  var order = C.nearestDirs(dir, scope);
  for (var i = 0; i < order.length; i++) {
    var p = C.matchPath(order[i], id);
    if (fs.existsSync(path.join(root, p.slice(1)))) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
function validMatch(m) {
  return !!(m && m.id != null && /^\d{1,12}$/.test(String(m.id)) && m.home && m.away && m.home.n && m.away.n);
}
function isoInstant(d) { return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
function isoDay(d) { return d.toISOString().slice(0, 10); }
function kickoffIso(m) { var d = MATCH_TIME.parseParis(m && m.date); return d ? isoInstant(d) : null; }

// Etape du cycle de vie a l'instant now (Date ou ms).
function stageFor(kickoff, now, inRun) {
  var t = typeof now === "number" ? now : (now || new Date()).getTime();
  var k = kickoff ? Date.parse(kickoff) : NaN;
  var age = isFinite(k) ? t - k : -Infinity;
  var removed = !inRun && age >= REMOVE_AFTER_DAYS * DAY;
  var noindex = age >= NOINDEX_AFTER_DAYS * DAY;
  return {
    status: inRun ? "active" : removed ? "redirected" : noindex ? "archived_noindex" : "archived",
    inSitemap: !removed && !noindex && age < SITEMAP_MAX_AGE_HOURS * HOUR,
    noindex: noindex,
    removed: removed
  };
}

// ---------------------------------------------------------------------------
// Instantane de faits publics (liste blanche stricte, types controles).
function str(v, max) { return typeof v === "string" && v.trim() ? v.trim().slice(0, max || 120) : null; }
function num(v) { var n = typeof v === "number" ? v : (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN); return isFinite(n) ? n : null; }
function compact(o) { Object.keys(o).forEach(function (k) { if (o[k] == null) delete o[k]; }); return o; }
function team(t) { return compact({ id: num(t.id), n: str(t.n) }); }
function formEntries(list) {
  return (Array.isArray(list) ? list : []).slice(0, 5).map(function (e) {
    if (!e || typeof e !== "object") return null;
    var r = str(e.result, 1);
    var out = compact({ d: str(e.d, 10), opponent: str(e.opponent), score: str(e.score, 7), result: r && /^[WDL]$/.test(r) ? r : null, home: typeof e.home === "boolean" ? e.home : null, date_full: str(e.date_full, 30) });
    return out.opponent && out.score ? out : null;
  }).filter(Boolean);
}
function h2hEntries(list) {
  return (Array.isArray(list) ? list : []).slice(0, 5).map(function (e) {
    if (!e || typeof e !== "object") return null;
    var out = compact({ d: str(e.d, 10), home: str(e.home), away: str(e.away), s: str(e.s, 7) });
    return out.home && out.away && out.s ? out : null;
  }).filter(Boolean);
}
function standingRows(classement, m) {
  var rows = classement && Array.isArray(classement.standings) ? classement.standings : [];
  var ids = [num(m.home.id), num(m.away.id)].filter(function (x) { return x != null; });
  var names = [m.home.n, m.away.n];
  return rows.filter(function (r) {
    return r && ((r.team_id != null && ids.indexOf(num(r.team_id)) !== -1) || names.indexOf(r.name) !== -1);
  }).slice(0, 2).map(function (r) {
    return compact({ rank: num(r.rank), name: str(r.name), team_id: num(r.team_id), played: num(r.played), won: num(r.won), drawn: num(r.drawn), lost: num(r.lost), gd: num(r.gd), pts: num(r.pts) });
  }).filter(function (r) { return r.name && r.rank != null; });
}
function lineupSide(side) {
  if (!side || typeof side !== "object" || !Array.isArray(side.startXI)) return null;
  var xi = side.startXI.map(function (p) { return p && str(p.name, 60); }).filter(Boolean);
  if (xi.length < 11) return null;
  return compact({ formation: str(side.formation, 12), startXI: xi.slice(0, 11) });
}
function publicSnapshot(m) {
  if (!validMatch(m)) return null;
  var s = { id: String(m.id), league_key: str(m.league_key, 60), league: str(m.league), date: str(m.date, 16), home: team(m.home), away: team(m.away) };
  var venue = m.stade && str(m.stade.nom);
  if (venue) s.stade = { nom: venue };
  var fh = formEntries(m.form_home), fa = formEntries(m.form_away);
  if (fh.length) s.form_home = fh;
  if (fa.length) s.form_away = fa;
  var h = h2hEntries(m.h2h);
  if (h.length) s.h2h = h;
  var rows = standingRows(m.classement, m);
  if (rows.length) s.classement = { standings: rows };
  var lh = m.lineups && lineupSide(m.lineups.home), la = m.lineups && lineupSide(m.lineups.away);
  if (lh && la) s.lineups = { home: lh, away: la };
  return compact(s);
}

// ---------------------------------------------------------------------------
// Score final depuis des donnees publiques deja presentes : historique.json
// (score regle d'un pronostic), confrontations directes et forme recente des
// matchs du run (qui contiennent souvent la rencontre deja jouee).
function parseScore(s) {
  var mm = /^\s*(\d{1,2})\s*[-:–]\s*(\d{1,2})\s*$/.exec(String(s == null ? "" : s));
  return mm ? { home: Number(mm[1]), away: Number(mm[2]) } : null;
}
function near(day, fullIso, kickoff) {
  var k = Date.parse(kickoff);
  if (!isFinite(k)) return false;
  if (fullIso && isFinite(Date.parse(fullIso))) return Math.abs(Date.parse(fullIso) - k) <= 3 * HOUR;
  var t = Date.parse(String(day || "") + "T12:00:00Z");
  return isFinite(t) && Math.abs(t - k) <= 36 * HOUR;
}
function findFinalScore(entry, ctx) {
  var snap = entry && entry.snapshot;
  if (!snap || !entry.kickoff) return null;
  var H = snap.home.n, A = snap.away.n, hid = snap.home.id, aid = snap.away.id;
  ctx = ctx || {};
  var preds = ctx.historique && Array.isArray(ctx.historique.predictions) ? ctx.historique.predictions : [];
  for (var i = 0; i < preds.length; i++) {
    var p = preds[i];
    if (!p || String(p.fixture_id) !== String(entry.id)) continue;
    if (["win", "loss", "void"].indexOf(p.result) === -1) continue;
    if ((p.home && p.home !== H) || (p.away && p.away !== A)) continue;
    var sc = parseScore(p.score);
    if (sc) return Object.assign(sc, { source: "historique" });
  }
  var pool = (Array.isArray(ctx.matchs) ? ctx.matchs : []).concat([snap]);
  for (var j = 0; j < pool.length; j++) {
    var x = pool[j];
    if (!x || !x.home || !x.away) continue;
    var h2h = Array.isArray(x.h2h) ? x.h2h : [];
    for (var a = 0; a < h2h.length; a++) {
      var e = h2h[a];
      if (e && e.home === H && e.away === A && near(e.d, null, entry.kickoff)) {
        var s1 = parseScore(e.s);
        if (s1) return Object.assign(s1, { source: "h2h" });
      }
    }
    // Forme : score vu depuis l'equipe de la liste (buts pour - buts contre).
    var sides = [[x.home, x.form_home], [x.away, x.form_away]];
    for (var b = 0; b < sides.length; b++) {
      var t = sides[b][0], list = Array.isArray(sides[b][1]) ? sides[b][1] : [];
      var isHome = (hid != null && t.id === hid) || t.n === H;
      var isAway = (aid != null && t.id === aid) || t.n === A;
      if (!isHome && !isAway) continue;
      for (var c = 0; c < list.length; c++) {
        var f = list[c];
        if (!f || !near(f.d, f.date_full, entry.kickoff)) continue;
        var s2 = parseScore(f.score);
        if (!s2) continue;
        if (isHome && f.home === true && f.opponent === A) return { home: s2.home, away: s2.away, source: "form" };
        if (isAway && f.home === false && f.opponent === H) return { home: s2.away, away: s2.home, source: "form" };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Registre.
var README = [
  "Registre du cycle de vie des pages match statiques (scripts/match-lifecycle.js). Ecrit par le pipeline",
  "(.github/workflows/update-data.yml#generateMatchPages) et par node scripts/seo-pages.js. Jamais publie.",
  "status : active (dans le run) | archived (page conservee) | archived_noindex (J+7, noindex,follow) |",
  "redirected (J+30 : pages supprimees, 301 vers le hub ligue de chaque version, cf. _redirects).",
  "snapshot = faits publics uniquement (liste blanche de publicSnapshot : jamais de champ premium, de conf ni de cote).",
  "retired_dirs = {dir: date} des versions sorties du perimetre (seoMatchDirs reduit) : 301 vers le hub ligue de la version s'il est dans le perimetre, sinon vers la version FR du match, pendant 90 jours."
];
function emptyRegistry() { return { _readme: README.slice(), version: 1, matches: {} }; }
function loadRegistry(root) {
  try {
    var reg = JSON.parse(fs.readFileSync(path.join(root || C.ROOT, REGISTRY_FILE), "utf8"));
    if (!reg || typeof reg !== "object" || !reg.matches || typeof reg.matches !== "object") return emptyRegistry();
    reg._readme = README.slice();
    reg.version = 1;
    return reg;
  } catch (e) { return emptyRegistry(); }
}
// Une ligne par match : diff git lisible d'un run a l'autre.
function serializeRegistry(reg) {
  var ids = Object.keys(reg.matches).sort(function (a, b) { return Number(a) - Number(b) || (a < b ? -1 : 1); });
  return "{\n \"_readme\": " + JSON.stringify(README) + ",\n \"version\": 1,\n \"matches\": {" +
    (ids.length ? "\n" + ids.map(function (id) { return "  " + JSON.stringify(id) + ": " + JSON.stringify(reg.matches[id]); }).join(",\n") + "\n " : "") +
    "}\n}\n";
}
function saveRegistry(root, reg) {
  var p = path.join(root || C.ROOT, REGISTRY_FILE);
  var s = serializeRegistry(reg);
  if (fs.existsSync(p) && fs.readFileSync(p, "utf8") === s) return false;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
  return true;
}

// Met a jour le registre EN PLACE. runMatchs = matchs du run (copie publique) ;
// ctx.historique = historique.json (score regle). Renvoie un resume.
function updateRegistry(reg, runMatchs, now, ctx) {
  now = now || new Date();
  var t = now.getTime(), today = isoDay(now);
  var seen = {};
  var matchs = (runMatchs || []).filter(validMatch);
  var lookup = { historique: ctx && ctx.historique, matchs: matchs };
  var summary = { active: 0, archived: 0, archived_noindex: 0, redirected: 0, purged: 0, scores: 0 };
  matchs.forEach(function (m) {
    var id = String(m.id);
    seen[id] = true;
    var e = reg.matches[id] || { id: id, first_seen: today };
    var k = kickoffIso(m) || e.kickoff || null;
    if (e.kickoff && k && e.kickoff !== k) e.previous_kickoff = e.kickoff;
    e.kickoff = k;
    e.league_key = m.league_key || null;
    var previousDirs = Array.isArray(e.dirs) ? e.dirs : [];
    e.dirs = matchDirsFor(m.league_key);
    retireDirs(e, previousDirs, today);
    e.last_seen = today;
    e.in_run = true;
    delete e.left_run_at; delete e.left_run_before_kickoff; delete e.removed_at;
    e.snapshot = publicSnapshot(m);
    reg.matches[id] = e;
  });
  Object.keys(reg.matches).forEach(function (id) {
    var e = reg.matches[id];
    pruneRetiredDirs(e, t);
    if (!seen[id]) {
      if (e.in_run !== false) {
        e.in_run = false;
        e.left_run_at = today;
        if (e.kickoff && t < Date.parse(e.kickoff)) e.left_run_before_kickoff = true;
      }
    }
    var kick = e.kickoff || (e.left_run_at ? e.left_run_at + "T00:00:00Z" : null);
    if (!e.final_score && e.snapshot && e.kickoff && t >= Date.parse(e.kickoff) + FINISHED_AFTER_MINUTES * 60000) {
      var sc = findFinalScore(e, lookup);
      if (sc) { e.final_score = sc; summary.scores++; }
    }
    var st = stageFor(kick, t, !!e.in_run);
    e.status = st.status;
    if (st.status === "redirected") {
      e.removed_at = e.removed_at || today;
      delete e.snapshot;
      if (t - Date.parse(e.removed_at + "T00:00:00Z") > REDIRECT_RETENTION_DAYS * DAY) {
        delete reg.matches[id];
        summary.purged++;
        return;
      }
    }
    summary[st.status]++;
  });
  return summary;
}

// Pages conservees a ecrire (hors run, avant J+30, instantane exploitable).
function archivedEntries(reg) {
  return Object.keys(reg.matches).map(function (id) { return reg.matches[id]; }).filter(function (e) {
    return e && !e.in_run && (e.status === "archived" || e.status === "archived_noindex") && validMatch(e.snapshot);
  });
}
// Etat affiche d'une page conservee.
function archivedState(e, now) {
  var t = (now || new Date()).getTime();
  var k = e.kickoff ? Date.parse(e.kickoff) : NaN;
  return {
    final_score: e.final_score && e.final_score.home != null && e.final_score.away != null ? { home: e.final_score.home, away: e.final_score.away } : null,
    finished: !e.left_run_before_kickoff && isFinite(k) && t >= k + FINISHED_AFTER_MINUTES * 60000
  };
}

// ---------------------------------------------------------------------------
// Redirections 301.
function redirectTarget(e, dir) {
  return e.league_key && C.leagueByKey(e.league_key) ? C.leagueHubPath(dir, e.league_key) : C.homePath(dir);
}
// Versions retirees du perimetre (config/leagues.json#seoMatchDirs reduit,
// cf. commit 07fc2b081 : 145 pages /<dir>/match/<id>.html supprimees alors
// qu'elles etaient au sitemap). e.retired_dirs = {dir: "AAAA-MM-JJ"} (date du
// retrait). Ordre stable (C.DIR_CODES) ; une version revenue dans e.dirs
// n'est plus retiree ; une date deja connue n'est jamais repoussee.
function retireDirs(e, dirs, day) {
  var cur = e.retired_dirs && typeof e.retired_dirs === "object" ? e.retired_dirs : {};
  var current = Array.isArray(e.dirs) ? e.dirs : [];
  var add = Array.isArray(dirs) ? dirs : [];
  var out = {};
  C.DIR_CODES.forEach(function (d) {
    if (d === C.X_DEFAULT_DIR || current.indexOf(d) !== -1) return;
    if (Object.prototype.hasOwnProperty.call(cur, d) && /^\d{4}-\d{2}-\d{2}$/.test(cur[d])) out[d] = cur[d];
    else if (add.indexOf(d) !== -1) out[d] = day;
  });
  if (Object.keys(out).length) e.retired_dirs = out; else delete e.retired_dirs;
  return e;
}
// Meme retention que les pages retirees a J+30 : regle retiree 90 jours apres.
function pruneRetiredDirs(e, now) {
  if (!e || !e.retired_dirs || typeof e.retired_dirs !== "object") return;
  var t = typeof now === "number" ? now : (now || new Date()).getTime();
  Object.keys(e.retired_dirs).forEach(function (d) {
    var since = Date.parse(String(e.retired_dirs[d]) + "T00:00:00Z");
    if (!isFinite(since) || t - since > REDIRECT_RETENTION_DAYS * DAY) delete e.retired_dirs[d];
  });
  if (!Object.keys(e.retired_dirs).length) delete e.retired_dirs;
}
// Cible d'une version retiree : hub ligue de la version s'il est dans le
// perimetre (indexable) ; sinon version FR du match, toujours generee ; une
// fois celle-ci retiree (J+30), directement son hub FR (jamais de chaine 301).
function retiredDirTarget(e, dir, id) {
  if (e.league_key && C.leagueByKey(e.league_key) && matchDirsFor(e.league_key).indexOf(dir) !== -1) return C.leagueHubPath(dir, e.league_key);
  return e.status === "redirected" ? redirectTarget(e, C.X_DEFAULT_DIR) : C.matchPath(C.X_DEFAULT_DIR, id);
}
function redirectRules(reg) {
  var rules = [];
  Object.keys(reg.matches).sort(function (a, b) { return Number(a) - Number(b); }).forEach(function (id) {
    var e = reg.matches[id];
    if (!e || !/^\d{1,12}$/.test(id)) return;
    var dirs = Array.isArray(e.dirs) && e.dirs.length ? e.dirs : [C.X_DEFAULT_DIR];
    if (e.status === "redirected") {
      dirs.forEach(function (dir) {
        if (!C.DIRS[dir]) return;
        rules.push([C.matchPath(dir, id), redirectTarget(e, dir), "301"]);
      });
    }
    if (e.retired_dirs && typeof e.retired_dirs === "object") {
      C.DIR_CODES.forEach(function (dir) {
        if (dir === C.X_DEFAULT_DIR || dirs.indexOf(dir) !== -1 || !Object.prototype.hasOwnProperty.call(e.retired_dirs, dir)) return;
        rules.push([C.matchPath(dir, id), retiredDirTarget(e, dir, id), "301"]);
      });
    }
  });
  return rules;
}
function padCol(s, n) { return s.length >= n ? s + "  " : s + new Array(n - s.length + 1).join(" "); }
function redirectsBlockLines(reg) {
  var rules = redirectRules(reg);
  if (!rules.length) return [];
  return [REDIRECTS_BEGIN, REDIRECTS_NOTE].concat(rules.map(function (r) { return padCol(r[0], 34) + padCol(r[1], 30) + r[2]; }), [REDIRECTS_END]);
}
// Remplace (ou insere avant la section 404 finale) le bloc des pages retirees.
function applyRedirectsBlock(text, reg) {
  var lines = String(text || "").split("\n");
  var out = [], skipping = false;
  lines.forEach(function (l) {
    if (l === REDIRECTS_BEGIN) { skipping = true; if (out.length && out[out.length - 1] === "") out.pop(); return; }
    if (skipping) { if (l === REDIRECTS_END) skipping = false; return; }
    out.push(l);
  });
  var block = redirectsBlockLines(reg);
  if (!block.length) return out.join("\n");
  var at = out.findIndex(function (l) { return /^# --- 404 traduite/.test(l); });
  if (at === -1) {
    while (out.length && out[out.length - 1] === "") out.pop();
    return out.concat([""], block).join("\n") + "\n";
  }
  var before = out.slice(0, at);
  while (before.length && before[before.length - 1] === "") before.pop();
  return before.concat([""], block, [""], out.slice(at)).join("\n");
}
function writeRedirects(root, reg) {
  var p = path.join(root || C.ROOT, "_redirects");
  if (!fs.existsSync(p)) return false;
  var before = fs.readFileSync(p, "utf8");
  var after = applyRedirectsBlock(before, reg);
  if (after === before) return false;
  fs.writeFileSync(p, after);
  return true;
}

module.exports = {
  REGISTRY_FILE: REGISTRY_FILE, SITEMAP_MAX_AGE_HOURS: SITEMAP_MAX_AGE_HOURS, NOINDEX_AFTER_DAYS: NOINDEX_AFTER_DAYS,
  REMOVE_AFTER_DAYS: REMOVE_AFTER_DAYS, REDIRECT_RETENTION_DAYS: REDIRECT_RETENTION_DAYS, FINISHED_AFTER_MINUTES: FINISHED_AFTER_MINUTES,
  REDIRECTS_BEGIN: REDIRECTS_BEGIN, REDIRECTS_END: REDIRECTS_END,
  matchDirsFor: matchDirsFor, versionMatchHref: versionMatchHref, stageFor: stageFor, kickoffIso: kickoffIso, validMatch: validMatch,
  publicSnapshot: publicSnapshot, parseScore: parseScore, findFinalScore: findFinalScore,
  emptyRegistry: emptyRegistry, loadRegistry: loadRegistry, saveRegistry: saveRegistry, serializeRegistry: serializeRegistry,
  updateRegistry: updateRegistry, archivedEntries: archivedEntries, archivedState: archivedState,
  retireDirs: retireDirs, pruneRetiredDirs: pruneRetiredDirs, retiredDirTarget: retiredDirTarget,
  redirectTarget: redirectTarget, redirectRules: redirectRules, redirectsBlockLines: redirectsBlockLines,
  applyRedirectsBlock: applyRedirectsBlock, writeRedirects: writeRedirects
};
