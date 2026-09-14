#!/usr/bin/env node
"use strict";
// Pages club et derby par version (config/club-hubs.json), rafraichies chaque jour.
//
// Sorties (toutes regenerees integralement, idempotentes) :
//   /<dir>/<hubSlug>/<slug>.html   page club ou derby (gb/za/fr/en : clubs ; mx/es : equipos)
//   /<dir>/<hubSlug>/index.html    index de la version
//   sitemap-clubs.xml              pages indexables, lastmod exact (seo-lastmod.json, groupe "clubs")
//
// Donnees : api-football (cache data/club-hubs/cache/, jamais publie) + donnees
// publiques IASHARK (data-home.json, match/<id>.json ; liste blanche, voir
// lib/club-hub-data.js). A lancer APRES l'ecriture de data-home.json et
// match/*.json dans le pipeline. Sans cle APISPORTS_KEY (ou --offline) : cache
// seul, puis repli sur les donnees publiques ; une page sans aucune donnee
// vivante est ecrite en noindex et sortie du sitemap (jamais de page mince indexee).
//
// Usage : node scripts/build-club-hubs.js [--offline] [--dirs mx,za] [--check]
//   --check : construit en memoire et valide (aucune ecriture).
require("./load-env.js");
const fs = require("fs");
const path = require("path");
const C = require("./seo-common.js");
const LASTMOD = require("./seo-lastmod.js");
const API = require("../lib/club-hub-api.js");
const DATA = require("../lib/club-hub-data.js");
const R = require("../lib/club-hub-render.js");
const SITEMAPS = require("./i18n-sitemaps.js");

const CONFIG_FILE = "config/club-hubs.json";
const SITEMAP_FILE = "sitemap-clubs.xml";
const INTRO_MIN_WORDS = 120, INTRO_MAX_WORDS = 220;

function readJson(file) { return JSON.parse(fs.readFileSync(file, "utf8")); }
function loadConfig(root) { return readJson(path.join(root || C.ROOT, CONFIG_FILE)); }

function loadLabels(root, version) {
  var base = readJson(path.join(root, "i18n", "parts", "clubs." + version.locale + ".json")).clubs;
  return Object.assign({}, base, version.labels || {});
}

function wordCount(s) { return String(s || "").split(/\s+/).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); }).length; }

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

// ---------------------------------------------------------------------------
// Validation de la configuration (erreurs bloquantes).
function validateConfig(cfg) {
  var errors = [];
  var clubsByKey = {};
  (cfg.clubs || []).forEach(function (c) {
    if (clubsByKey[c.key]) errors.push("club en double : " + c.key);
    clubsByKey[c.key] = c;
    if (typeof c.teamId !== "number") errors.push(c.key + " : teamId manquant");
  });
  var slugs = {};
  function checkPage(owner, dir, p, active) {
    if (!cfg.versions[dir]) { errors.push(owner + " : version inconnue " + dir); return; }
    if (!C.DIRS[dir]) errors.push(owner + " : repertoire public inconnu " + dir);
    var id = dir + "/" + p.slug;
    if (!p.slug || !/^[a-z0-9-]+$/.test(p.slug) || p.slug === "index") errors.push(owner + " (" + dir + ") : slug invalide");
    if (slugs[id]) errors.push("slug en double : " + id);
    slugs[id] = true;
    if (!active) return;
    ["name", "title", "description", "h1", "intro"].forEach(function (k) { if (!p[k] || !String(p[k]).trim()) errors.push(owner + " (" + dir + ") : " + k + " manquant"); });
    if (p.tz != null) {
      try { new Intl.DateTimeFormat("en", { timeZone: p.tz }); } catch (e) { errors.push(owner + " (" + dir + ") : fuseau invalide " + p.tz); }
      if (!p.tz_label || !String(p.tz_label).trim()) errors.push(owner + " (" + dir + ") : tz sans tz_label");
    }
    var wc = wordCount(p.intro);
    if (wc < INTRO_MIN_WORDS || wc > INTRO_MAX_WORDS) errors.push(owner + " (" + dir + ") : intro de " + wc + " mots (attendu " + INTRO_MIN_WORDS + "-" + INTRO_MAX_WORDS + ")");
  }
  (cfg.clubs || []).forEach(function (c) {
    Object.keys(c.pages || {}).forEach(function (dir) { checkPage(c.key, dir, c.pages[dir], c.active === true); });
    if (c.active === true && !Object.keys(c.pages || {}).length) errors.push(c.key + " : actif sans page");
  });
  (cfg.derbies || []).forEach(function (d) {
    if (!Array.isArray(d.teams) || d.teams.length !== 2) errors.push(d.key + " : il faut deux equipes");
    (d.teams || []).forEach(function (t) {
      if (t.club && !clubsByKey[t.club]) errors.push(d.key + " : club inconnu " + t.club);
      if (!t.club && typeof t.teamId !== "number") errors.push(d.key + " : equipe sans club ni teamId");
    });
    Object.keys(d.pages || {}).forEach(function (dir) { checkPage(d.key, dir, d.pages[dir], d.active === true); });
  });
  return errors;
}

// ---------------------------------------------------------------------------
async function pool(items, n, fn) {
  var out = new Array(items.length), i = 0;
  var workers = Array.from({ length: Math.min(n, items.length) }, async function () {
    while (i < items.length) { var k = i++; out[k] = await fn(items[k], k); }
  });
  await Promise.all(workers);
  return out;
}

function derbyTeamId(t, clubsByKey) { return t.club ? clubsByKey[t.club].teamId : t.teamId; }

// buildClubHubs(opts) -> rapport. opts : root (lecture), outRoot (ecriture), client,
// now (Date), today ('YYYY-MM-DD'), dirs (liste), write (bool), log (fn).
async function buildClubHubs(opts) {
  opts = opts || {};
  var root = opts.root || C.ROOT;
  var outRoot = opts.outRoot || root;
  var now = opts.now || new Date();
  var today = opts.today || now.toISOString().slice(0, 10);
  var log = opts.log || function () {};
  var write = opts.write !== false;
  var cfg = opts.config || loadConfig(root);
  var errors = validateConfig(cfg);
  if (errors.length) throw new Error("config/club-hubs.json invalide :\n  " + errors.join("\n  "));
  var client = opts.client || API.createClient({ offline: !!opts.offline, log: log });
  var dirs = (opts.dirs || Object.keys(cfg.versions)).filter(function (d) { return cfg.versions[d]; });

  var report = { pages: [], skipped: [], written: 0, removed: 0, sitemap: null, api: client.stats };
  var clubsByKey = {}, factsByTeam = {};
  cfg.clubs.forEach(function (c) { clubsByKey[c.key] = c; if (c.facts) factsByTeam[c.teamId] = c.facts; });
  var pub = DATA.loadPublicMatches(opts.dataRoot || root);
  var asOf = pub.generatedAt ? new Date(pub.generatedAt) : now;

  function leagueOk(key) { return !!(key && C.leagueByKey(key)); }

  // 1. Pages candidates par version.
  var plan = [];
  cfg.clubs.forEach(function (c) {
    Object.keys(c.pages || {}).forEach(function (dir) {
      if (dirs.indexOf(dir) === -1) return;
      if (c.active !== true) return report.skipped.push({ key: c.key, dir: dir, reason: c.inactiveReason || "active=false" });
      if (!leagueOk(c.leagueKey)) return report.skipped.push({ key: c.key, dir: dir, reason: "competition " + c.leagueKey + " absente de config/leagues.json" });
      plan.push({ kind: "club", key: c.key, dir: dir, cfg: c, text: c.pages[dir], leagueKey: c.leagueKey, teamIds: [c.teamId] });
    });
    if (c.active !== true && !Object.keys(c.pages || {}).length) report.skipped.push({ key: c.key, dir: null, reason: c.inactiveReason || "active=false" });
  });
  (cfg.derbies || []).forEach(function (d) {
    Object.keys(d.pages || {}).forEach(function (dir) {
      if (dirs.indexOf(dir) === -1) return;
      if (d.active !== true) return report.skipped.push({ key: d.key, dir: dir, reason: "active=false" });
      if (!leagueOk(d.leagueKey)) return report.skipped.push({ key: d.key, dir: dir, reason: "competition " + d.leagueKey + " absente de config/leagues.json" });
      var inactive = d.teams.filter(function (t) { return t.club && clubsByKey[t.club].active !== true; });
      if (inactive.length) return report.skipped.push({ key: d.key, dir: dir, reason: "club inactif : " + inactive.map(function (t) { return t.club; }).join(", ") });
      plan.push({ kind: "derby", key: d.key, dir: dir, cfg: d, text: d.pages[dir], leagueKey: d.leagueKey, teamIds: d.teams.map(function (t) { return derbyTeamId(t, clubsByKey); }) });
    });
  });

  // 2. Donnees api-football (une fois par competition / equipe / derby).
  var leagueKeys = Array.from(new Set(plan.map(function (p) { return p.leagueKey; })));
  var leagues = {};
  await pool(leagueKeys, 3, async function (key) {
    var lg = C.leagueByKey(key);
    var fallbackSeason = (pub.list.filter(function (m) { return m.leagueKey === key; })[0] || {}).season || null;
    var res = await DATA.fetchLeague(client, lg.apiFootballId, fallbackSeason);
    if (!res.table) res.table = DATA.standingFromDetails(pub.details.filter(function (d) { return d.league && d.league === lg.displayName; }), plan.filter(function (p) { return p.leagueKey === key; }).reduce(function (a, p) { return a.concat(p.teamIds); }, []));
    leagues[key] = { conf: lg, table: res.table, season: res.season };
  });
  var teamIds = Array.from(new Set(plan.reduce(function (a, p) { return a.concat(p.teamIds); }, [])));
  var teams = {};
  await pool(teamIds, 4, async function (id) { teams[id] = await DATA.fetchTeam(client, id); });
  var h2h = {};
  await pool(plan.filter(function (p) { return p.kind === "derby"; }), 3, async function (p) {
    var k = p.teamIds.join("-");
    if (!h2h[k]) h2h[k] = await DATA.fetchH2H(client, p.teamIds[0], p.teamIds[1]);
  });

  // 3. Filtre derby : les deux clubs dans le meme groupe de classement, sauf
  // derby marque splitStandings (Argentine : zones A/B distinctes, chaque club
  // est alors montre dans son propre groupe).
  plan = plan.filter(function (p) {
    if (p.kind !== "derby") return true;
    var g = DATA.groupFor(leagues[p.leagueKey].table, p.teamIds);
    if (g && !g.containsAll && p.cfg.splitStandings !== true) {
      report.skipped.push({ key: p.key, dir: p.dir, reason: "les deux clubs ne sont pas dans le meme classement " + leagues[p.leagueKey].conf.displayName });
      return false;
    }
    return true;
  });

  // 4. Chemins et liens par version.
  function pathOf(p) { return R.pagePath(p.dir, cfg.versions[p.dir], p.text.slug); }
  var planned = {};
  plan.forEach(function (p) { p.path = pathOf(p); planned[p.path] = true; });
  dirs.forEach(function (dir) { if (plan.some(function (p) { return p.dir === dir; })) planned[R.hubPath(dir, cfg.versions[dir])] = true; });
  function linkExists(rel) {
    var clean = rel.split("?")[0].split("#")[0];
    if (planned[clean]) return true;
    var f = clean.endsWith("/") ? clean + "index.html" : clean;
    return fs.existsSync(path.join(root, f.slice(1))) || fs.existsSync(path.join(outRoot, f.slice(1)));
  }

  // Equivalents (meme cle dans plusieurs versions) -> hreflang.
  function alternatesFor(p) {
    var same = plan.filter(function (q) { return q.kind === p.kind && q.key === p.key; });
    return same.map(function (q) { return { hreflang: C.DIRS[q.dir].hreflang, href: R.abs(q.path) }; });
  }

  function teamBundle(id, dir, limitForm) {
    var t = teams[id] || { id: id, info: null, next: [], last: [] };
    var form = DATA.recentResults(t.last, id, limitForm || 5);
    if (!form.length) form = DATA.formFromDetails(pub.details, id, limitForm || 5);
    return { id: id, name: t.info && t.info.name, info: applyFacts(t.info, factsByTeam[id]), form: form, next: t.next };
  }

  var outputs = {};
  var titles = {};
  var hubData = {};
  plan.forEach(function (p) {
    var dir = p.dir, version = cfg.versions[dir];
    var labels = loadLabels(root, version);
    var names = {}, clubLinks = {};
    cfg.clubs.forEach(function (c) {
      if (c.pages && c.pages[dir]) {
        names[c.teamId] = c.pages[dir].name;
        var cp = plan.filter(function (q) { return q.kind === "club" && q.key === c.key && q.dir === dir; })[0];
        if (cp) clubLinks[c.teamId] = cp.path;
      }
    });
    // Nom d'equipe par version : club sans page dans cette version (ex. PSG et OM
    // dans /en/, affiche Le Classique) ou equipe hors config (Everton).
    (cfg.derbies || []).forEach(function (d) {
      d.teams.forEach(function (t) {
        var id = derbyTeamId(t, clubsByKey);
        if (t.names && t.names[dir] && !names[id]) names[id] = t.names[dir];
      });
    });
    var league = leagues[p.leagueKey];
    var group = DATA.groupFor(league.table, p.teamIds);
    var groups = p.kind === "derby" && group && !group.containsAll
      ? p.teamIds.map(function (id) { return DATA.groupFor(league.table, [id]); })
      : null;
    var bundles = p.teamIds.map(function (id) { return teamBundle(id, dir); });
    var ctx = {
      kind: p.kind, dir: dir, version: version, labels: labels, text: p.text, path: p.path, names: names, clubLinks: clubLinks,
      league: { key: p.leagueKey, name: league.conf.displayName, hubPath: C.leagueHubPath(dir, p.leagueKey) },
      group: group, groups: groups, teams: bundles, asOf: asOf, linkExists: linkExists, alternates: alternatesFor(p),
      // Fuseau propre a la page (clubs d'Amerique du Sud dans /es/) : sinon celui du repertoire.
      tz: p.text.tz || null, tzLabel: p.text.tz_label || null
    };
    var related = [{ href: C.leagueHubPath(dir, p.leagueKey), label: fill(labels.league_link, { league: league.conf.displayName }) }];
    var html;
    if (p.kind === "club") {
      ctx.upcoming = DATA.upcomingFor(p.teamIds, bundles[0].next, pub.list, now, { limit: 5 });
      plan.filter(function (q) { return q.dir === dir && q.kind === "derby" && q.teamIds.indexOf(p.teamIds[0]) !== -1; })
        .forEach(function (q) { related.push({ href: q.path, label: q.text.name }); });
      plan.filter(function (q) { return q.dir === dir && q.kind === "club" && q !== p; })
        .forEach(function (q) { related.push({ href: q.path, label: q.text.name }); });
      related.push({ href: R.hubPath(dir, version), label: labels.hub_link }, { href: C.homePath(dir), label: labels.free_link });
      ctx.related = related;
      ctx.noindex = !ctx.upcoming.length && !bundles[0].form.length && !group;
      html = R.renderClubPage(ctx);
    } else {
      var hh = h2h[p.teamIds.join("-")] || { last: [], next: [] };
      ctx.upcoming = DATA.upcomingFor(p.teamIds, bundles[0].next.concat(bundles[1].next, hh.next), pub.list, now, { both: true, limit: 3 });
      ctx.h2h = DATA.h2hResults(hh.last, p.teamIds[0], p.teamIds[1], 6);
      p.teamIds.forEach(function (id) { if (clubLinks[id]) related.push({ href: clubLinks[id], label: names[id] }); });
      plan.filter(function (q) { return q.dir === dir && q.kind === "derby" && q !== p; })
        .forEach(function (q) { related.push({ href: q.path, label: q.text.name }); });
      related.push({ href: R.hubPath(dir, version), label: labels.hub_link }, { href: C.homePath(dir), label: labels.free_link });
      ctx.related = related;
      ctx.noindex = !ctx.upcoming.length && !ctx.h2h.items.length && !group;
      html = R.renderDerbyPage(ctx);
    }
    var leak = R.findPremiumLeak(html);
    if (leak) throw new Error("Champ premium dans " + p.path + " : " + leak);
    if (titles[p.text.title]) throw new Error("Titre en double : " + p.text.title);
    titles[p.text.title] = true;
    outputs[p.path] = html;
    report.pages.push({ kind: p.kind, key: p.key, dir: dir, path: p.path, title: p.text.title, noindex: ctx.noindex, upcoming: ctx.upcoming.length, bytes: Buffer.byteLength(html) });
    hubData[dir] = hubData[dir] || { clubs: [], derbies: [], labels: labels };
    var nextFx = ctx.upcoming[0] ? ctx.upcoming[0].date : null;
    hubData[dir][p.kind === "club" ? "clubs" : "derbies"].push({ name: p.text.name, href: p.path, league: league.conf.displayName, next: nextFx, noindex: ctx.noindex, leagueKey: p.leagueKey, tz: ctx.tz, tzLabel: ctx.tzLabel });
  });

  // 5. Index par version.
  Object.keys(hubData).forEach(function (dir) {
    var version = cfg.versions[dir], hd = hubData[dir];
    var leagueLinks = Array.from(new Set(hd.clubs.concat(hd.derbies).map(function (x) { return x.leagueKey; }))).map(function (k) {
      return { href: C.leagueHubPath(dir, k), label: fill(hd.labels.league_link, { league: C.leagueByKey(k).displayName }) };
    });
    var ctx = {
      dir: dir, version: version, labels: hd.labels, path: R.hubPath(dir, version),
      text: Object.assign({ name: hd.labels.hub_crumb }, version.hub), clubs: hd.clubs, derbies: hd.derbies, asOf: asOf,
      related: leagueLinks.concat([{ href: C.homePath(dir), label: hd.labels.free_link }]),
      noindex: hd.clubs.concat(hd.derbies).every(function (x) { return x.noindex; })
    };
    var html = R.renderHubPage(ctx);
    var leak = R.findPremiumLeak(html);
    if (leak) throw new Error("Champ premium dans " + ctx.path + " : " + leak);
    if (titles[version.hub.title]) throw new Error("Titre en double : " + version.hub.title);
    titles[version.hub.title] = true;
    outputs[ctx.path + "index.html"] = html;
    report.pages.push({ kind: "hub", key: "index", dir: dir, path: ctx.path, title: version.hub.title, noindex: ctx.noindex, bytes: Buffer.byteLength(html) });
  });

  // Index des affiches derby par paire d'ids api-football (tries) : une page
  // match retrouve ainsi l'affiche de SA version (lien retour). Fichier interne
  // data/derby-index.json : data/ n'est jamais publie, il est lu au build.
  var derbyIndex = { _readme: DERBY_INDEX_README, pairs: {} };
  plan.filter(function (p) { return p.kind === "derby"; }).forEach(function (p) {
    var pair = pairKey(p.teamIds[0], p.teamIds[1]);
    var e = derbyIndex.pairs[pair] = derbyIndex.pairs[pair] || { key: p.key, teams: p.teamIds.slice(), pages: {} };
    if (e.key !== p.key) return; // une seule affiche par paire : la premiere de la configuration
    var info = report.pages.filter(function (r) { return r.kind === "derby" && r.path === p.path; })[0];
    e.pages[p.dir] = { path: p.path, name: p.text.name, noindex: !!(info && info.noindex) };
  });
  report.derbyIndex = derbyIndex;

  report.outputs = outputs;
  if (!write) return report;

  // 6. Ecriture + nettoyage des pages perimees dans les dossiers generes.
  Object.keys(outputs).forEach(function (rel) { if (writeIfChanged(path.join(outRoot, rel.slice(1)), outputs[rel])) report.written++; });
  dirs.forEach(function (dir) {
    var folder = path.join(outRoot, dir, cfg.versions[dir].hubSlug);
    if (!fs.existsSync(folder)) return;
    fs.readdirSync(folder).filter(function (f) { return /\.html$/.test(f); }).forEach(function (f) {
      var rel = "/" + dir + "/" + cfg.versions[dir].hubSlug + "/" + f;
      if (!outputs[rel]) { fs.unlinkSync(path.join(folder, f)); report.removed++; }
    });
  });
  report.derbyIndexFile = writeDerbyIndex(outRoot, derbyIndex, dirs);
  report.sitemap = writeSitemap(outRoot, cfg, today);
  // Index sitemap.xml : reference sitemap-clubs.xml (et tous les sitemap-*.xml
  // non vides presents), meme fonction que le pipeline.
  if (opts.sitemapIndex !== false) report.sitemapIndex = SITEMAPS.writeSitemapIndex(outRoot, today);
  return report;
}

function fill(tpl, vars) { return C.fill(tpl, vars); }

// ---------------------------------------------------------------------------
// data/derby-index.json : { pairs: { "<idMin>-<idMax>": { key, teams, pages: { <dir>: { path, name, noindex } } } } }
const DERBY_INDEX_FILE = "data/derby-index.json";
const DERBY_INDEX_README = "Genere par scripts/build-club-hubs.js. Cle = ids api-football des deux equipes tries et joints par '-'. pages.<dir>.path = affiche derby de cette version (fichier present sur disque). Fichier interne (data/ jamais publie) : a lire au build des pages match.";

function pairKey(a, b) { return [Number(a), Number(b)].sort(function (x, y) { return x - y; }).join("-"); }

// Fusion avec l'index existant : les versions non reconstruites (--dirs) sont
// conservees, seules les pages presentes sur disque sont gardees ; ordre stable.
function writeDerbyIndex(outRoot, next, dirs) {
  var file = path.join(outRoot, DERBY_INDEX_FILE);
  var prev = null;
  try { prev = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { prev = null; }
  var merged = {};
  function add(pair, e, keepDir) {
    Object.keys(e.pages || {}).forEach(function (d) {
      if (!keepDir(d)) return;
      if (!fs.existsSync(path.join(outRoot, e.pages[d].path.slice(1)))) return;
      var o = merged[pair] = merged[pair] || { key: e.key, teams: e.teams, pages: {} };
      if (o.key !== e.key) return;
      o.pages[d] = e.pages[d];
    });
  }
  Object.keys(next.pairs).forEach(function (pair) { add(pair, next.pairs[pair], function () { return true; }); });
  if (prev && prev.pairs) Object.keys(prev.pairs).forEach(function (pair) { add(pair, prev.pairs[pair], function (d) { return dirs.indexOf(d) === -1 && !(merged[pair] && merged[pair].pages[d]); }); });
  var out = { _readme: DERBY_INDEX_README, pairs: {} };
  Object.keys(merged).sort().forEach(function (pair) {
    var e = merged[pair], pages = {};
    Object.keys(e.pages).sort().forEach(function (d) { pages[d] = e.pages[d]; });
    out.pairs[pair] = { key: e.key, teams: e.teams, pages: pages };
  });
  writeIfChanged(file, JSON.stringify(out, null, 2) + "\n");
  return { file: DERBY_INDEX_FILE, pairs: Object.keys(out.pairs).length };
}

// Fiche club : donnees api-football, surchargees par config/club-hubs.json#facts
// (valeurs verifiees ; null masque le champ). Certaines donnees api-football
// sont perimees (stade renomme, capacite d'avant travaux) : la capacite n'est
// donc affichee que si elle est renseignee et verifiee dans la configuration.
function applyFacts(info, facts) {
  if (!info) return info;
  facts = facts || {};
  var has = function (k) { return Object.prototype.hasOwnProperty.call(facts, k); };
  var venue = Object.assign({}, info.venue);
  if (has("stadium")) venue.name = facts.stadium;
  if (has("city")) venue.city = facts.city;
  venue.capacity = typeof facts.capacity === "number" ? facts.capacity : null;
  return Object.assign({}, info, { founded: has("founded") ? facts.founded : info.founded, venue: venue });
}

// Sitemap construit depuis les fichiers REELLEMENT presents (jamais une URL
// sans page, jamais une page noindex).
function writeSitemap(outRoot, cfg, today) {
  var tracker = LASTMOD.tracker(outRoot, "clubs", today);
  var entries = [];
  Object.keys(cfg.versions).forEach(function (dir) {
    var sub = cfg.versions[dir].hubSlug;
    var folder = path.join(outRoot, dir, sub);
    if (!fs.existsSync(folder)) return;
    fs.readdirSync(folder).filter(function (f) { return /\.html$/.test(f); }).sort().forEach(function (f) {
      var html = fs.readFileSync(path.join(folder, f), "utf8");
      if (R.isNoindex(html)) return;
      var loc = C.SITE_URL + "/" + dir + "/" + sub + "/" + (f === "index.html" ? "" : f);
      entries.push({ loc: loc, lastmod: tracker.lastmod(loc, R.stripVolatile(html)) });
    });
  });
  tracker.save();
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map(function (e) { return "<url><loc>" + e.loc + "</loc><lastmod>" + e.lastmod + "</lastmod></url>"; }).join("\n") + "\n</urlset>\n";
  writeIfChanged(path.join(outRoot, SITEMAP_FILE), xml);
  return { file: SITEMAP_FILE, urls: entries.length };
}

module.exports = { buildClubHubs: buildClubHubs, validateConfig: validateConfig, applyFacts: applyFacts, loadConfig: loadConfig, loadLabels: loadLabels, wordCount: wordCount, writeSitemap: writeSitemap, CONFIG_FILE: CONFIG_FILE, SITEMAP_FILE: SITEMAP_FILE, INTRO_MIN_WORDS: INTRO_MIN_WORDS, INTRO_MAX_WORDS: INTRO_MAX_WORDS };

if (require.main === module) {
  var argv = process.argv.slice(2);
  var dirsArg = argv.indexOf("--dirs") !== -1 ? argv[argv.indexOf("--dirs") + 1].split(",") : null;
  var started = Date.now();
  buildClubHubs({
    offline: argv.indexOf("--offline") !== -1,
    write: argv.indexOf("--check") === -1,
    dirs: dirsArg,
    log: function (m) { console.warn("  [club-hubs] " + m); }
  }).then(function (rep) {
    var idx = rep.pages.filter(function (p) { return !p.noindex; }).length;
    console.log("Club hubs : " + rep.pages.length + " page(s) (" + idx + " indexable(s)), " + rep.written + " ecrite(s), " + rep.removed + " supprimee(s)" +
      (rep.sitemap ? ", " + rep.sitemap.file + " " + rep.sitemap.urls + " URL(s)" : "") + " ; api-football " + JSON.stringify(rep.api) + " ; " + (Date.now() - started) + " ms");
    rep.pages.filter(function (p) { return p.noindex; }).forEach(function (p) { console.log("  noindex (aucune donnee vivante) : " + p.path); });
    var seen = {};
    rep.skipped.forEach(function (s) {
      var k = s.key + "|" + s.reason;
      if (seen[k]) return;
      seen[k] = true;
      console.log("  ignore : " + s.key + (s.dir ? " (" + s.dir + ")" : "") + " - " + s.reason);
    });
  }).catch(function (e) { console.error("build-club-hubs : " + e.message); process.exit(1); });
}
