#!/usr/bin/env node
"use strict";
// Pages de resultats indexables (lot R3, docs/SPEC_RESULTATS_HIER.md) :
//
//   /<dir>/resultats/                 liste des journees publiees (30 au plus)
//   /<dir>/resultats/<AAAA-MM-JJ>.html  le detail d'une journee
//
// dans les 9 repertoires publics (fr en gb za es mx de it pt), rediges dans la
// langue et avec le vocabulaire de la version (i18n/seo/<dir>.json#results pour
// les balises, i18n/dict/<locale>.json#results_page pour le corps, alimente par
// i18n/parts/resultats.<locale>.json).
//
// Source : results/<AAAA-MM-JJ>.json ecrit par le pipeline quotidien (lot R1,
// format documente en fin de docs/SPEC_RESULTATS_HIER.md). Rien d'autre n'est
// lu : la page ne montre que ce que ce fichier contient.
//
// Regles non negociables appliquees ici (specification, section « Regles non
// negociables ») :
//  1. Tout est publie, y compris les pertes : les marches gagnes ET perdus
//     d'une journee sont affiches, dans l'ordre des coups d'envoi, jamais dans
//     l'ordre des resultats. Aucune journee n'est choisie : toutes celles qui
//     ont au moins un marche regle sont publiees.
//  2. Jamais avant la fin du match : un marche « pending » est retire (il ne
//     figure ni dans la page, ni dans le compte). Un marche « void » reste
//     visible - c'est un fait - mais SANS le pari ni la cote, parce qu'un match
//     annule n'est pas un match termine.
//  3. Jamais de promesse : aucun ROI, aucun taux cumule, aucun agregat
//     multi-journees (decision du proprietaire du 20/09/2026). Le seul chiffre
//     publie est le compte du jour, « X marches sur Y realises » (void et
//     pending exclus du numerateur comme du denominateur), accompagne sur
//     chaque page de la mention « les resultats passes ne prejugent pas des
//     resultats futurs ».
//  4. Source des cotes telle qu'elle est : « (Pinnacle) » uniquement quand
//     odds_source vaut exactement "pinnacle", sinon « (cotes moyennes) ».
//  5. Verdict jamais par la couleur seule (WCAG 1.4.1) : bordure gauche 3 px,
//     fond teinte, libelle ecrit et icone.
//  6. Une journee sans aucun marche regle n'a pas de page : rien a indexer.
//
// Presentation : charte des pages championnat (/assets/league-hub.v1.css,
// lib/hub-ui.js) + un bloc <style> propre aux verdicts. Aucune dependance,
// aucun framework.
//
// API (le pipeline appelle writeResultsPages ; voir aussi le mode CLI) :
//   writeResultsPages({ root, days, now, today, sitemap })
//     -> { days, pages, removed, sitemap }
//   loadDays({ root, limit })        journees normalisees, de la plus recente
//                                    a la plus ancienne
//   normalizeDay(raw)                un fichier results/<jour>.json -> journee
//                                    normalisee (pending retire, compte calcule)
//   renderDayPage(day, dir, opts)    HTML d'une journee
//   renderIndexPage(days, dir, opts) HTML de la liste des journees
//   dayPath(dir, day) / hubPath(dir) URL publiques
//
// CLI : node scripts/results-pages.js [--root <dir>]. Sans results/ sur le
// disque (lot R1 pas encore passe), repli documente sur historique.json : les
// memes paris publies, avec leur resultat reel, jamais une donnee inventee.
const fs = require("fs");
const path = require("path");
const C = require("./seo-common.js");
const HUBUI = require("../lib/hub-ui.js");
const MATCH_TIME = require("../lib/match-time.js");
const LEAGUE_NAMES = require("../lib/league-names.js");
const TEAMNAMES = require("../lib/team-names.js");
// Libelle du marche dans la langue de la version (« Over 1.5 goals »,
// « 1. Halbzeit: über 0,5 Tore ») : meme fonction qu'au runtime.
const MARKET_LABELS = require("../lib/market-labels.js");
// Lien vers la page match reellement presente pour la version (registre
// data/match-pages-registry.json, versions voisines a defaut).
const LIFECYCLE = require("./match-lifecycle.js");
// sitemap-resultats.xml (lastmod exact, hreflang lus dans les pages ecrites).
const SITEMAPS = require("./i18n-sitemaps.js");

const SITE_URL = C.SITE_URL, DIR_CODES = C.DIR_CODES, DIRS = C.DIRS;
const esc = C.escHtml;
// Dossier des pages, identique dans les 9 versions (URL stables, hreflang
// reciproques) ; les libelles, eux, sont traduits.
const FOLDER = "resultats";
const RESULTS_DIR = "results";
// Journees listees sur la page d'index (specification : « les 30 derniers jours »).
// UNE SEULE JOURNEE : celle de la veille (decision du proprietaire, 20/09/2026,
// apres avoir vu 23 journees generees). « On met juste les resultats de la
// veille » : pas d'historique jour par jour, pas d'archive consultable.
const DAYS_ON_INDEX = 1;
const TITLE_SOFT_MAX = 60;
const DESCRIPTION_MAX = 155;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

var buildLocalesLib = null;
function B() { return buildLocalesLib || (buildLocalesLib = require("./build-locales.js")); }

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}
function exists(root, rel) {
  try { return fs.statSync(path.join(root, String(rel).replace(/^\/+/, ""))).isFile(); } catch (e) { return false; }
}

// ---------------------------------------------------------------------------
// Chemins publics.
function hubPath(dir) { return "/" + dir + "/" + FOLDER + "/"; }
function dayPath(dir, day) { return "/" + dir + "/" + FOLDER + "/" + day + ".html"; }
function hubFile(root, dir) { return path.join(root, dir, FOLDER, "index.html"); }
function dayFile(root, dir, day) { return path.join(root, dir, FOLDER, day + ".html"); }

// ---------------------------------------------------------------------------
// Lecture et normalisation de results/<AAAA-MM-JJ>.json.
function isDayKey(s) { return typeof s === "string" && DAY_RE.test(s); }
function teamName(t) {
  if (t && typeof t === "object") return TEAMNAMES.displayName(t);
  var n = String(t == null ? "" : t).trim();
  return n ? TEAMNAMES.displayName({ n: n }) : "";
}
function num(v) {
  var n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  return typeof n === "number" && isFinite(n) && n > 0 ? n : null;
}
// Un match ne devient une ligne que s'il est identifiable et REGLE : « pending »
// (match non termine) sort ici, avant tout rendu - aucune donnee premium d'un
// match en cours ne peut donc atteindre le HTML.
function normalizeMatch(m) {
  if (!m || typeof m !== "object") return null;
  var result = m.result === "win" || m.result === "loss" || m.result === "void" ? m.result : null;
  var home = teamName(m.home), away = teamName(m.away);
  if (!result || !home || !away) return null;
  var settled = result === "win" || result === "loss";
  var id = m.id != null && /^\d{1,12}$/.test(String(m.id)) ? String(m.id) : null;
  return {
    id: id,
    home: home,
    away: away,
    league: String(m.league || "").trim(),
    league_key: typeof m.league_key === "string" && m.league_key ? m.league_key : null,
    kickoff: typeof m.kickoff === "string" ? m.kickoff : null,
    score: typeof m.score === "string" && /^\d{1,2}-\d{1,2}$/.test(m.score.trim()) ? m.score.trim() : null,
    // Pari et cote : uniquement pour un marche reellement regle (jamais pour un
    // match annule, qui peut n'avoir jamais ete joue).
    pick: settled && typeof m.pick === "string" && m.pick.trim() ? m.pick.trim() : null,
    market_id: settled && typeof m.market_id === "string" && m.market_id.trim() ? m.market_id.trim() : null,
    cote: settled ? num(m.cote) : null,
    odds_source: settled && m.odds_source === "pinnacle" ? "pinnacle" : null,
    result: result,
    href: typeof m.href === "string" && m.href.indexOf("/") === 0 ? m.href : null
  };
}
function normalizeScorer(s) {
  if (!s || typeof s !== "object") return null;
  var result = s.result === "win" || s.result === "loss" ? s.result : null;
  var player = String(s.player == null ? "" : s.player).trim();
  if (!result || !player) return null;
  return {
    id: s.match_id != null && /^\d{1,12}$/.test(String(s.match_id)) ? String(s.match_id) : null,
    match: String(s.match == null ? "" : s.match).trim(),
    player: player,
    result: result
  };
}
// Ordre d'affichage : coup d'envoi, puis competition, puis equipe qui recoit.
// JAMAIS le resultat : une page ne met pas les gagnants en tete.
function sortMatches(list, day) {
  var t = function (m) {
    var d = m.kickoff ? MATCH_TIME.parseParis(m.kickoff) : null;
    return d ? d.getTime() : Date.parse(day + "T12:00:00Z");
  };
  return list.slice().sort(function (a, b) {
    return t(a) - t(b) || (a.league < b.league ? -1 : a.league > b.league ? 1 : 0) || (a.home < b.home ? -1 : a.home > b.home ? 1 : 0);
  });
}
// raw : contenu de results/<jour>.json. Le compte est RECALCULE depuis les
// lignes affichees (jamais copie de totals) : la page et son chiffre ne peuvent
// pas diverger.
function normalizeDay(raw, fallbackDay) {
  var day = isDayKey(raw && raw.day) ? raw.day : (isDayKey(fallbackDay) ? fallbackDay : null);
  if (!day) return null;
  var matches = ((raw && raw.matches) || []).map(normalizeMatch).filter(Boolean);
  var scorers = ((raw && raw.scorers) || []).map(normalizeScorer).filter(Boolean);
  var won = matches.filter(function (m) { return m.result === "win"; }).length;
  var lost = matches.filter(function (m) { return m.result === "loss"; }).length;
  var voided = matches.filter(function (m) { return m.result === "void"; }).length;
  return {
    day: day,
    matches: sortMatches(matches, day),
    scorers: scorers,
    counts: { won: won, lost: lost, void: voided, settled: won + lost }
  };
}
function readDay(root, day) {
  try { return JSON.parse(fs.readFileSync(path.join(root, RESULTS_DIR, day + ".json"), "utf8")); } catch (e) { return null; }
}
function listDays(root) {
  var dir = path.join(root, RESULTS_DIR);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(function (f) { return /^\d{4}-\d{2}-\d{2}\.json$/.test(f); })
    .map(function (f) { return f.slice(0, 10); }).sort().reverse();
}
// Journees publiables : au moins un marche regle (une journee vide n'a rien a
// montrer et rien a indexer), de la plus recente a la plus ancienne, limitees a
// DAYS_ON_INDEX.
function loadDays(opts) {
  opts = opts || {};
  var root = opts.root || C.ROOT;
  var limit = opts.limit != null ? opts.limit : DAYS_ON_INDEX;
  var out = [];
  listDays(root).forEach(function (day) {
    if (out.length >= limit) return;
    var d = normalizeDay(readDay(root, day), day);
    if (d && d.counts.settled > 0) out.push(d);
  });
  return out;
}

// Repli local documente : historique.json (paris publies, resultats reels du
// pipeline) quand results/ n'existe pas encore. Jamais utilise par le pipeline,
// qui passe ses propres journees.
function daysFromHistorique(root, limit) {
  var hist = null;
  try { hist = JSON.parse(fs.readFileSync(path.join(root || C.ROOT, "historique.json"), "utf8")); } catch (e) { return []; }
  var byDay = {};
  (hist.predictions || []).forEach(function (p) {
    if (!isDayKey(p && p.date)) return;
    var result = p.result === "win" || p.result === "loss" || p.result === "void" ? p.result : null;
    if (!result) return;
    (byDay[p.date] = byDay[p.date] || []).push({
      id: p.fixture_id, home: p.home, away: p.away, league: p.league, league_key: p.league_key,
      score: p.score, pick: p.prediction, market_id: p.market, cote: p.cote,
      // has_pinnacle = instantane Pinnacle utilise pour ce match
      // (.github/workflows/update-data.yml) : c'est la source reelle, pas une
      // supposition. Tout le reste est declare « cotes moyennes ».
      odds_source: p.has_pinnacle === true ? "pinnacle" : "moyenne",
      result: result
    });
  });
  var out = [];
  Object.keys(byDay).sort().reverse().forEach(function (day) {
    if (out.length >= (limit || DAYS_ON_INDEX)) return;
    var d = normalizeDay({ day: day, matches: byDay[day] }, day);
    if (d && d.counts.settled > 0) out.push(d);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Textes de la version.
function T(dir) {
  var t = C.get(C.dictFor(dir), "results_page");
  if (!t) throw new Error("results_page absent de i18n/dict/" + DIRS[dir].locale + ".json : lancer node scripts/merge-i18n-parts.js");
  return t;
}
function lab(t, key) {
  var v = t[key];
  if (typeof v !== "string" || !v.trim()) throw new Error("results_page." + key + " manquant (i18n/parts/resultats.<locale>.json)");
  return v;
}
function S(dir) {
  var s = C.seoConf(dir).results;
  if (!s) throw new Error("results absent de i18n/seo/" + dir + ".json");
  return s;
}
// Jour calendaire -> libelle dans la locale de la version (jamais decale : le
// jour est une date, pas un instant).
function dayDate(day) { return new Date(day + "T12:00:00Z"); }
function dayLabel(day, dir) { return C.fmtIn(dayDate(day), dir, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
function dayLabelLong(day, dir) { return C.fmtIn(dayDate(day), dir, { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); }
// « 47 marches sur 52 realises » (singulier pour 0 et 1).
function countLabel(day, dir) {
  var t = T(dir), c = day.counts;
  return C.fill(lab(t, c.won <= 1 ? "day_count_one" : "day_count"), { won: c.won, total: c.settled });
}
function leagueName(m, dir) {
  var feed = (LEAGUE_NAMES.displayName(m.league_key, m.league) || "").trim();
  return C.leagueNameIn(m.league_key, dir, feed);
}
// Hub de la competition dans la version : celui de la version si la page
// existe, sinon celui de la version vers laquelle elle redirige
// (config/leagues.json#seoRedirectDirs), sinon aucun lien.
function leagueHubHref(m, dir, root) {
  if (!m.league_key || !C.leagueByKey(m.league_key)) return null;
  var target = C.leagueRedirectDirs(m.league_key)[dir] || dir;
  var p = C.leagueHubPath(target, m.league_key);
  return exists(root, p) ? p : null;
}
// Lien vers la page match de la version (scripts/match-lifecycle.js : page de
// la version, sinon la version la plus proche reellement generee), a defaut le
// href du fichier de resultats s'il pointe sur un fichier present.
function matchHref(m, dir, root) {
  if (m.id) {
    var p = LIFECYCLE.versionMatchHref(m.id, m.league_key, dir, root);
    if (p) return p;
  }
  return m.href && exists(root, m.href) ? m.href : null;
}
// Libelle du marche dans la langue de la version. L'identifiant prime quand il
// est connu du catalogue ; sinon le libelle publie, traduit s'il est reconnu.
function pickLabel(m, dir) {
  if (!m.pick && !m.market_id) return null;
  var opts = { locale: DIRS[dir].locale, dict: C.dictFor(dir) };
  var teams = { home: m.home, away: m.away };
  if (m.market_id) {
    var byId = MARKET_LABELS.marketIdLabel(m.market_id, teams, opts);
    if (byId && byId !== m.market_id) return byId;
  }
  return m.pick ? MARKET_LABELS.marketLabel(m.pick, teams, opts) : null;
}

// ---------------------------------------------------------------------------
// Rendu.
// Verdict : bordure gauche + fond teinte + libelle + icone (jamais la couleur
// seule). Icones typographiques, aucun emoji.
var VERDICT_ICON = { win: "✓", loss: "✗", void: "—" };
function verdictBadge(result, t) {
  var key = result === "win" ? "verdict_win" : result === "loss" ? "verdict_loss" : "verdict_void";
  return '<span class="vb ' + result + '"><i aria-hidden="true">' + VERDICT_ICON[result] + "</i>" + esc(lab(t, key)) + "</span>";
}
// « (Pinnacle) » seulement quand la cote vient vraiment de Pinnacle.
function oddsHtml(m, t) {
  if (m.cote == null) return "";
  var src = m.odds_source === "pinnacle" ? lab(t, "odds_pinnacle") : lab(t, "odds_average");
  // Deux decimales, point decimal : la forme utilisee partout sur le site
  // (lib/odds.js) et chez les bookmakers.
  return esc(lab(t, "odds_label")) + " <b>" + esc(m.cote.toFixed(2)) + "</b> " + '<span class="src">(' + esc(src) + ")</span>";
}
function kickoffTime(m, dir) {
  var d = m.kickoff ? MATCH_TIME.parseParis(m.kickoff) : null;
  if (!d) return "";
  return '<time datetime="' + d.toISOString().replace(/\.\d{3}Z$/, "Z") + '">' + esc(C.zonedClock(d, dir, "list")) + "</time>";
}
function matchRow(m, dir, opts) {
  var t = T(dir), root = opts.root;
  var href = matchHref(m, dir, root), hub = leagueHubHref(m, dir, root);
  var ln = leagueName(m, dir), pick = pickLabel(m, dir);
  var meta = [kickoffTime(m, dir), ln ? (hub ? '<a href="' + hub + '">' + esc(ln) + "</a>" : esc(ln)) : ""].filter(Boolean).join(" · ");
  return '<li class="rr ' + m.result + '">' +
    '<p class="rr-h"><span class="rr-t">' + esc(m.home) + " – " + esc(m.away) + "</span>" +
    (m.score ? '<span class="rr-s">' + esc(m.score) + "</span>" : "") + "</p>" +
    (pick ? '<p class="rr-m"><b>' + esc(pick) + "</b>" + (m.cote != null ? " · " + oddsHtml(m, t) : "") + "</p>" : "") +
    '<p class="rr-f">' + verdictBadge(m.result, t) + (meta ? '<span class="rr-meta">' + meta + "</span>" : "") +
    (href ? '<a class="rr-a" href="' + esc(href) + '">' + esc(lab(t, "match_link")) + "</a>" : "") + "</p></li>";
}
function scorerRow(s, dir, opts) {
  var t = T(dir);
  var href = s.id ? LIFECYCLE.versionMatchHref(s.id, null, dir, opts.root) : null;
  return '<li class="rr ' + s.result + '">' +
    '<p class="rr-h"><span class="rr-t">' + esc(s.player) + "</span></p>" +
    (s.match ? '<p class="rr-m">' + esc(s.match) + "</p>" : "") +
    '<p class="rr-f"><span class="vb ' + s.result + '"><i aria-hidden="true">' + VERDICT_ICON[s.result] + "</i>" +
    esc(lab(t, s.result === "win" ? "scorer_win" : "scorer_loss")) + "</span>" +
    (href ? '<a class="rr-a" href="' + esc(href) + '">' + esc(lab(t, "match_link")) + "</a>" : "") + "</p></li>";
}

// Feuille de style propre aux pages de resultats : jetons et composants
// absents de /assets/league-hub.v1.css. Les couleurs du verdict sont celles de
// la specification (#34d399 / #fb8a8a) et ne portent jamais seules le sens.
const STYLE = "<style>" +
  ':root{--res-win:#34d399;--res-win-bg:rgba(52,211,153,.10);--res-loss:#fb8a8a;--res-loss-bg:rgba(251,138,138,.10)}' +
  '.rcount{margin:14px 0 8px;color:var(--text);font-size:clamp(18px,4.6vw,24px);font-weight:800;letter-spacing:-.01em;line-height:1.2}' +
  '.rchips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px;padding:0;list-style:none}' +
  '.rchips li{display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:0 10px;border-radius:999px;border:1px solid var(--line2);background:rgba(255,255,255,.03);font-size:12.5px;font-weight:700;color:var(--soft)}' +
  '.rchips li.win{color:var(--res-win);border-color:rgba(52,211,153,.45)}' +
  '.rchips li.loss{color:var(--res-loss);border-color:rgba(251,138,138,.45)}' +
  '.rl{list-style:none;margin:0;padding:0;display:grid;gap:8px}' +
  '@media(min-width:1024px){.rl{grid-template-columns:1fr 1fr}}' +
  '.rr{padding:10px 12px;border-radius:14px;border:1px solid var(--line);border-left:3px solid var(--line2);background:var(--card)}' +
  '.rr.win{border-left-color:var(--res-win);background:var(--res-win-bg)}' +
  '.rr.loss{border-left-color:var(--res-loss);background:var(--res-loss-bg)}' +
  '.rr p{margin:0}' +
  '.rr-h{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px}' +
  '.rr-t{color:var(--text);font-weight:700;font-size:14.5px;line-height:1.25;overflow-wrap:anywhere}' +
  '.rr-s{margin-left:auto;color:var(--text);font-weight:800;font-variant-numeric:tabular-nums}' +
  '.rr-m{margin:6px 0 0;font-size:13.5px;line-height:1.4;color:var(--body);overflow-wrap:anywhere}' +
  '.rr-m b{color:var(--text);font-weight:700}' +
  '.src{font-size:11px;color:var(--muted)}' +
  '.rr-f{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin:8px 0 0;padding:6px 0 0;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}' +
  '.rr-f .rr-a{margin-left:auto;color:var(--cyan);font-weight:600;text-decoration:none}' +
  '.rr-f .rr-a:hover{text-decoration:underline}' +
  '.rr-meta time{font-variant-numeric:tabular-nums}' +
  '.vb{display:inline-flex;align-items:center;gap:5px;min-height:22px;padding:0 9px;border-radius:999px;border:1px solid currentColor;font-size:11.5px;font-weight:800;white-space:nowrap}' +
  '.vb.win{color:var(--res-win)}.vb.loss{color:var(--res-loss)}.vb.void{color:var(--muted)}' +
  '.vb i{font-style:normal;font-size:12px;line-height:1}' +
  '.days{list-style:none;margin:0;padding:0;display:grid;gap:8px}' +
  '@media(min-width:760px){.days{grid-template-columns:1fr 1fr}}' +
  '.dr{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 12px;padding:12px;border-radius:14px;background:var(--card);border:1px solid var(--line);color:inherit;text-decoration:none}' +
  '.dr:hover{border-color:rgba(32,213,239,.5)}' +
  '.dr .d{color:var(--text);font-weight:700;font-size:15px}' +
  '.dr .c{flex-basis:100%;color:var(--soft);font-size:13.5px}' +
  '.dr .go{margin-left:auto;color:var(--cyan);font-weight:700;font-size:13px}' +
  '.pager{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:20px 0 0}' +
  '.pager a{display:inline-flex;align-items:center;min-height:38px;padding:0 13px;border-radius:999px;border:1px solid var(--line);background:var(--card);color:var(--soft);font-size:13px;font-weight:600;text-decoration:none}' +
  '.pager a:hover{color:var(--text);border-color:rgba(32,213,239,.45)}' +
  "</style>";

// En-tete, pied de page et scripts : exactement la coquille des pages
// championnat (scripts/seo-pages.js#renderLeagueHub).
function header(dir, root) {
  var s = C.seoConf(dir), dict = C.dictFor(dir);
  var nav = function (k, fb) { var v = C.get(dict, k); return esc(typeof v === "string" ? v : fb); };
  var clubsHub = C.clubsHubPath(dir, root);
  return '<header class="hdr"><a href="' + C.homePath(dir) + '" aria-label="IASHARK"><img src="/assets/iashark-logo.webp" width="1648" height="440" alt="IASHARK"></a>' +
    '<nav><a href="' + C.homePath(dir) + '">' + nav("nav.home", "Home") + "</a>" +
    (clubsHub ? '<a href="' + clubsHub + '">' + esc(s.nav.clubs) + "</a>" : "") +
    '<a href="' + C.blogHubPath(dir) + '">' + nav("nav.guides", "Blog") + "</a></nav></header>\n";
}
function footer(dir, root) {
  var s = C.seoConf(dir), L = s.league, dict = C.dictFor(dir), t = T(dir);
  var help = B().helplineFor(dir), help2 = B().helplineExtraFor(dir);
  var helpHtml = help ? "<p>" + esc(L.help) + ' <a href="' + esc(help.url) + '" rel="noopener" data-market-helpline="name">' + esc(help.name) + "</a>" +
    (help.phone ? ' · <span data-market-helpline="phone">' + esc(help.phone) + "</span>" : "") +
    (help2 ? ' · <a href="' + esc(help2.url) + '" rel="noopener">' + esc(help2.name) + "</a>" + (help2.phone ? " " + esc(help2.phone) : "") : "") + "</p>" : "";
  var legal = B().LEGAL_FILE_LIST.filter(function (f) { return fs.existsSync(path.join(C.ROOT, "legal", dir, f)); }).map(function (f) {
    var labelKey = { "mentions-legales.html": "footer.mentions_legales", "cgv.html": "footer.cgv", "confidentialite.html": "footer.confidentialite", "cookies.html": "footer.cookies", "jeu-responsable.html": "footer.responsible_gambling", "methodologie.html": "footer.methodology" }[f];
    var label = labelKey ? C.get(dict, labelKey) : null;
    return '<a href="/' + dir + "/" + f + '">' + esc(typeof label === "string" ? label : f) + "</a>";
  }).join(" · ");
  return '<footer class="foot"><p>' + esc(lab(t, "disclaimer")) + "</p><p>" + esc(L.disclaimer) + "</p>" + helpHtml +
    (legal ? "<p>" + legal + "</p>" : "") + "</footer>\n" + C.footerNavHtml(dir, root) + "\n";
}
function scripts() {
  return '<script defer src="/i18n/i18n.js"></script>\n<script defer src="/lib/market-config.js"></script>\n<script defer src="/bottom-navigation.js"></script>\n';
}
function crumbsNav(dir, items) {
  var aria = C.seoConf(dir).match.breadcrumb_aria;
  return '<nav class="crumbs" aria-label="' + esc(aria) + '">' + items.map(function (it, i) {
    return i < items.length - 1 ? '<a href="' + esc(it.url.slice(SITE_URL.length)) + '">' + esc(it.name) + "</a>"
      : '<span aria-current="page">' + esc(it.name) + "</span>";
  }).join(' <span aria-hidden="true">›</span> ') + "</nav>\n";
}
// <head> commun : balises completes, hreflang reciproques des 9 versions,
// pagination semantique, JSON-LD honnete (BreadcrumbList + CollectionPage).
function head(dir, o) {
  var conf = DIRS[dir];
  return "<!DOCTYPE html>\n" +
    '<html lang="' + conf.htmlLang + '">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="iashark-market" content="' + conf.market + '">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    "<title>" + esc(o.title) + "</title>\n" +
    '<meta name="description" content="' + esc(o.description) + '">\n' +
    (o.noindex ? '<meta name="robots" content="noindex,follow">\n' : "") +
    '<link rel="canonical" href="' + o.canonical + '">\n' +
    C.hreflangLinks(o.alternates).replace(/></g, ">\n<") + "\n" +
    (o.prev ? '<link rel="prev" href="' + SITE_URL + o.prev + '">\n' : "") +
    (o.next ? '<link rel="next" href="' + SITE_URL + o.next + '">\n' : "") +
    '<meta property="og:type" content="website">\n<meta property="og:site_name" content="IASHARK">\n' +
    '<meta property="og:locale" content="' + C.ogLocale(dir) + '">\n' +
    '<meta property="og:title" content="' + esc(o.title) + '">\n' +
    '<meta property="og:description" content="' + esc(o.description) + '">\n' +
    '<meta property="og:url" content="' + o.canonical + '">\n' +
    '<meta property="og:image" content="' + SITE_URL + '/icon-512.png">\n' +
    '<meta name="twitter:card" content="summary">\n' +
    '<meta name="twitter:title" content="' + esc(o.title) + '">\n' +
    '<meta name="twitter:description" content="' + esc(o.description) + '">\n' +
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n' +
    C.ldScript(C.breadcrumbLd(o.crumbs)) + "\n" + C.ldScript(o.pageLd) + "\n" +
    '<link rel="stylesheet" href="' + HUBUI.CSS_HREF + '">\n' +
    '<link rel="stylesheet" href="/assets/bottom-navigation.css">\n' + STYLE + "\n" +
    "</head>\n<body>\n";
}
function collectionLd(dir, canonical, title, desc, items) {
  var page = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": canonical + "#webpage",
    url: canonical,
    name: title,
    description: desc,
    inLanguage: DIRS[dir].htmlLang,
    isPartOf: { "@id": SITE_URL + "/#website" }
  };
  // ItemList : la liste reellement affichee, rien de plus. Aucun balisage
  // Review/Rating/AggregateRating : il serait faux ici.
  if (items.length) {
    page.mainEntity = {
      "@type": "ItemList",
      numberOfItems: items.length,
      itemListElement: items.map(function (it, i) {
        var o = { "@type": "ListItem", position: i + 1, name: it.name };
        if (it.url) o.url = it.url;
        return o;
      })
    };
  }
  return page;
}
function pagerHtml(dir, o) {
  var t = T(dir);
  var links = [];
  if (o.prev) links.push('<a rel="prev" href="' + o.prev + '">‹ ' + esc(lab(t, "prev_day")) + "</a>");
  links.push('<a href="' + hubPath(dir) + '">' + esc(lab(t, "back_link")) + "</a>");
  if (o.next) links.push('<a rel="next" href="' + o.next + '">' + esc(lab(t, "next_day")) + " ›</a>");
  return '<nav class="pager" aria-label="' + esc(lab(t, "pagination_aria")) + '">' + links.join("") + "</nav>\n";
}

// renderDayPage(day, dir, opts) : opts = { root, prev, next } (jours voisins
// publies, du plus ancien au plus recent).
function renderDayPage(day, dir, opts) {
  opts = opts || {};
  var root = opts.root || C.ROOT;
  var t = T(dir), s = S(dir), seo = C.seoConf(dir);
  var date = dayLabel(day.day, dir), count = countLabel(day, dir);
  var vars = { date: date, count: count };
  var title = C.fitText([C.fill(s.day_title, vars), C.fill(s.day_title_short, vars), C.fill(s.day_h1, vars)], TITLE_SOFT_MAX);
  var desc = C.fitText([C.fill(s.day_description, vars), C.fill(s.day_description_short, vars)], DESCRIPTION_MAX);
  var canonical = SITE_URL + dayPath(dir, day.day);
  var alternates = C.alternatesFor(function (d) { return dayPath(d, day.day); }, DIR_CODES);
  var crumbs = [
    { name: seo.breadcrumb.home, url: SITE_URL + C.homePath(dir) },
    { name: s.breadcrumb, url: SITE_URL + hubPath(dir) },
    { name: date, url: canonical }
  ];
  var items = day.matches.map(function (m) {
    var href = matchHref(m, dir, root);
    return { name: m.home + " – " + m.away, url: href ? SITE_URL + href : null };
  });
  var prev = opts.prev ? dayPath(dir, opts.prev) : null, next = opts.next ? dayPath(dir, opts.next) : null;
  var c = day.counts;
  var chips = ['<li class="win">' + esc(C.fill(lab(t, "won_count"), { n: c.won })) + "</li>",
    '<li class="loss">' + esc(C.fill(lab(t, "lost_count"), { n: c.lost })) + "</li>"];
  if (c.void) chips.push("<li>" + esc(C.fill(lab(t, "void_count"), { n: c.void })) + "</li>");

  var hero = '<div class="hero"><div class="hero-top"><div class="chips">' +
    HUBUI.chip("18+", fs.existsSync(path.join(C.ROOT, "legal", dir, "jeu-responsable.html")) ? "/" + dir + "/jeu-responsable.html" : null, "chip-18") +
    "</div></div>\n" +
    "<h1>" + esc(C.fill(s.day_h1, vars)) + "</h1>\n" +
    '<p class="asof"><time datetime="' + day.day + '">' + esc(dayLabelLong(day.day, dir)) + "</time></p>\n" +
    '<p class="rcount">' + esc(count) + "</p>\n" +
    '<ul class="rchips">' + chips.join("") + "</ul>\n" +
    '<p class="intro">' + esc(s.day_intro) + "</p>\n" +
    '<p class="note">' + esc(lab(t, "disclaimer")) + "</p></div>\n";

  var matches = HUBUI.section("marches", lab(t, "matches_title"),
    '<ul class="rl">' + day.matches.map(function (m) { return matchRow(m, dir, { root: root }); }).join("") + "</ul>",
    lab(t, "method_note"));
  var scorers = day.scorers.length
    ? HUBUI.section("buteurs", lab(t, "scorers_title"), '<ul class="rl">' + day.scorers.map(function (sc) { return scorerRow(sc, dir, { root: root }); }).join("") + "</ul>")
    : "";
  // Maillage : hubs des competitions presentes ce jour-la, sans doublon.
  var hubs = [], seen = {};
  day.matches.forEach(function (m) {
    var href = leagueHubHref(m, dir, root), name = leagueName(m, dir);
    if (!href || !name || seen[href]) return;
    seen[href] = true;
    hubs.push('<a href="' + href + '">' + esc(name) + "</a>");
  });
  var others = hubs.length ? HUBUI.section("competitions", seo.league.others_title, '<p class="others">' + hubs.join("") + "</p>") : "";

  return head(dir, {
    title: title, description: desc, canonical: canonical, alternates: alternates,
    prev: prev, next: next, crumbs: crumbs, pageLd: collectionLd(dir, canonical, title, desc, items)
  }) +
    header(dir, root) + "<main>\n" +
    crumbsNav(dir, crumbs) + hero + pagerHtml(dir, { prev: prev, next: next }) +
    matches + scorers + others +
    '<section class="sec"><div class="panel"><h2>' + esc(seo.league.method_title) + "</h2>\n" +
    '<p class="intro">' + esc(seo.league.method) + "</p>\n" +
    '<a class="btn" href="' + C.homePath(dir) + '">' + esc(lab(t, "home_link")) + "</a></div></section>\n" +
    pagerHtml(dir, { prev: prev, next: next }) +
    "</main>\n" + footer(dir, root) + scripts() + "</body>\n</html>\n";
}

// renderIndexPage(days, dir, opts) : liste des journees publiees, du plus
// recent au plus ancien. Aucun cumul, aucune moyenne, aucun agregat
// multi-journees (decision du proprietaire du 20/09/2026) : chaque ligne porte
// le compte de SA journee.
function renderIndexPage(days, dir, opts) {
  opts = opts || {};
  var root = opts.root || C.ROOT;
  var t = T(dir), s = S(dir), seo = C.seoConf(dir);
  var title = C.fitText([s.hub_title, s.hub_title_short, s.hub_h1], TITLE_SOFT_MAX);
  var desc = C.fitText([s.hub_description, s.hub_description_short], DESCRIPTION_MAX);
  var canonical = SITE_URL + hubPath(dir);
  var alternates = C.alternatesFor(hubPath, DIR_CODES);
  var crumbs = [{ name: seo.breadcrumb.home, url: SITE_URL + C.homePath(dir) }, { name: s.breadcrumb, url: canonical }];
  var items = days.map(function (d) { return { name: dayLabel(d.day, dir), url: SITE_URL + dayPath(dir, d.day) }; });

  var list = days.length
    ? '<ul class="days">' + days.map(function (d) {
      return '<li><a class="dr" href="' + dayPath(dir, d.day) + '">' +
        '<span class="d"><time datetime="' + d.day + '">' + esc(dayLabel(d.day, dir)) + "</time></span>" +
        '<span class="go">' + esc(lab(t, "day_link")) + "</span>" +
        '<span class="c">' + esc(countLabel(d, dir)) + "</span></a></li>";
    }).join("") + "</ul>"
    : "<p>" + esc(lab(t, "empty_hub")) + "</p>";

  var hero = '<div class="hero"><div class="hero-top"><div class="chips">' +
    HUBUI.chip("18+", fs.existsSync(path.join(C.ROOT, "legal", dir, "jeu-responsable.html")) ? "/" + dir + "/jeu-responsable.html" : null, "chip-18") +
    "</div></div>\n" +
    "<h1>" + esc(s.hub_h1) + "</h1>\n" +
    '<p class="intro">' + esc(s.hub_intro) + "</p>\n" +
    '<p class="note">' + esc(lab(t, "disclaimer")) + "</p></div>\n";

  return head(dir, {
    title: title, description: desc, canonical: canonical, alternates: alternates,
    noindex: days.length === 0, crumbs: crumbs, pageLd: collectionLd(dir, canonical, title, desc, items)
  }) +
    header(dir, root) + "<main>\n" + crumbsNav(dir, crumbs) + hero +
    HUBUI.section("journees", lab(t, "days_title"), list, lab(t, "method_note")) +
    '<section class="sec"><div class="panel"><h2>' + esc(seo.league.method_title) + "</h2>\n" +
    '<p class="intro">' + esc(seo.league.method) + "</p>\n" +
    '<a class="btn" href="' + C.homePath(dir) + '">' + esc(lab(t, "home_link")) + "</a></div></section>\n" +
    "</main>\n" + footer(dir, root) + scripts() + "</body>\n</html>\n";
}

// ---------------------------------------------------------------------------
// Ecriture des 9 versions + sitemap.
// opts : { root, days (journees deja normalisees), now, today, sitemap:false }.
function writeResultsPages(opts) {
  opts = opts || {};
  var root = opts.root || C.ROOT;
  var now = opts.now || new Date();
  var today = opts.today || C.dayKeyIn(now, C.X_DEFAULT_DIR);
  // opts.limit : seulement pour les tests de mecanique (pagination, nettoyage).
  // La production garde DAYS_ON_INDEX (la veille seule).
  var days = opts.days || loadDays({ root: root, limit: opts.limit != null ? opts.limit : DAYS_ON_INDEX });
  var report = { days: days.length, pages: 0, removed: 0, sitemap: null };
  // Voisins : du plus ancien au plus recent (days est trie du plus recent au
  // plus ancien). Seules les journees publiees entrent dans la chaine.
  var order = days.slice().reverse();
  var neighbours = {};
  order.forEach(function (d, i) {
    neighbours[d.day] = { prev: i > 0 ? order[i - 1].day : null, next: i < order.length - 1 ? order[i + 1].day : null };
  });

  DIR_CODES.forEach(function (dir) {
    var out = path.join(root, dir, FOLDER);
    fs.mkdirSync(out, { recursive: true });
    var keep = { "index.html": true };
    writeIfChanged(hubFile(root, dir), renderIndexPage(days, dir, { root: root }));
    report.pages++;
    days.forEach(function (d) {
      var n = neighbours[d.day];
      writeIfChanged(dayFile(root, dir, d.day), renderDayPage(d, dir, { root: root, prev: n.prev, next: n.next }));
      keep[d.day + ".html"] = true;
      report.pages++;
    });
    fs.readdirSync(out).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
      if (!keep[f]) { fs.unlinkSync(path.join(out, f)); report.removed++; }
    });
  });

  if (opts.sitemap !== false) {
    report.sitemap = SITEMAPS.generateResultsSitemap(today, root, root);
    // Index sitemap.xml : reference sitemap-resultats.xml (et tous les
    // sitemap-*.xml non vides presents), meme fonction que le pipeline.
    if (opts.sitemapIndex !== false) SITEMAPS.writeSitemapIndex(root, today);
  }
  return report;
}

module.exports = {
  FOLDER: FOLDER, RESULTS_DIR: RESULTS_DIR, DAYS_ON_INDEX: DAYS_ON_INDEX,
  hubPath: hubPath, dayPath: dayPath, isDayKey: isDayKey,
  normalizeDay: normalizeDay, readDay: readDay, listDays: listDays, loadDays: loadDays, daysFromHistorique: daysFromHistorique,
  countLabel: countLabel, dayLabel: dayLabel, pickLabel: pickLabel, matchHref: matchHref,
  renderDayPage: renderDayPage, renderIndexPage: renderIndexPage, writeResultsPages: writeResultsPages
};

if (require.main === module) {
  var argv = process.argv.slice(2);
  var rootArg = argv.indexOf("--root");
  var root = rootArg !== -1 && argv[rootArg + 1] ? path.resolve(argv[rootArg + 1]) : C.ROOT;
  var now = new Date();
  var days = loadDays({ root: root, limit: DAYS_ON_INDEX });
  if (!days.length) {
    days = daysFromHistorique(root, DAYS_ON_INDEX);
    console.log("results/ absent ou vide : repli sur historique.json (" + days.length + " journee(s) reglee(s) publiee(s) par le pipeline).");
  }
  var rep = writeResultsPages({ root: root, days: days, now: now });
  console.log("Pages resultats : " + rep.days + " journee(s) x " + DIR_CODES.length + " version(s) = " + rep.pages +
    " fichier(s) ; " + rep.removed + " page(s) perimee(s) supprimee(s) ; sitemap : " + (rep.sitemap || "aucun"));
  if (days.length) {
    var last = days[0].day;
    console.log("Derniere journee : " + last + " (" + days[0].counts.won + "/" + days[0].counts.settled + ") - " + SITE_URL + dayPath(C.X_DEFAULT_DIR, last));
  }
}
