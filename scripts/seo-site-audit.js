#!/usr/bin/env node
"use strict";
// Audit SEO du site CONSTRUIT (dist/, sortie de scripts/build-public.js) :
// ce que sert Netlify, tel qu'un robot le parcourt (liens <a href> du HTML
// statique, hors <script> ; _redirects applique : regles forcees qui masquent
// un fichier, 301/302 sans condition suivies).
//
// Mesures (par version = premier segment d'URL de config/markets.json#_dirs ;
// pages racine /match/, /blog/ = version x-default historique fr) :
//   - pages indexables (pas de noindex, canonical auto-referent) ;
//   - profondeur en clics depuis l'accueil /<dir>/ (BFS), pages inaccessibles ;
//   - sections orphelines (/<dir>/<sous-dossier>/ sans lien entrant externe) ;
//   - titles > 60 et descriptions > 155 caracteres, doublons exacts ;
//   - pages sans H1 statique ; hreflang des pages club (x-default, reciprocite).
//
// Utilise par tests/internal-links.test.js et tests/seo-meta.test.js.
// CLI : node scripts/seo-site-audit.js [dist] [--json]
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SITE_URL = "https://iashark.com";
const MARKETS = JSON.parse(fs.readFileSync(path.join(ROOT, "config/markets.json"), "utf8"));
const DIR_CODES = Object.keys(MARKETS._dirs);
const X_DEFAULT_DIR = MARKETS._xDefaultDir || "fr";
const TITLE_MAX = 60;
const DESCRIPTION_MAX = 155;
const MAX_DEPTH = 3;

function unesc(s) {
  return String(s).replace(/&#(\d+);/g, function (m, n) { return String.fromCodePoint(Number(n)); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, n) { return String.fromCodePoint(parseInt(n, 16)); })
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}
function charLength(s) { return Array.from(String(s)).length; }

function walk(dir, rel, out) {
  fs.readdirSync(dir).forEach(function (name) {
    if (name.charAt(0) === ".") return;
    var abs = path.join(dir, name), r = rel ? rel + "/" + name : name;
    var st = fs.statSync(abs);
    if (st.isDirectory()) walk(abs, r, out);
    // Fichier de validation Google Search Console (google<16 hex>.html) :
    // une preuve de propriete, pas une page du site.
    else if (/^google[0-9a-f]{16}\.html$/.test(name)) return;
    else if (/\.html$/.test(name)) out.push(r);
  });
  return out;
}

// ---------------------------------------------------------------------------
// _redirects : regles sans condition (les regles pays/langue de "/" sont
// conditionnelles ; la derniere, sans condition, masque index.html racine).
function parseRedirects(root) {
  var file = path.join(root, "_redirects");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/).map(function (l) { return l.trim(); })
    .filter(function (l) { return l && l.charAt(0) !== "#"; })
    .map(function (l) {
      var p = l.split(/\s+/);
      return { from: p[0], to: p[1], status: parseInt(p[2], 10), force: /!$/.test(p[2] || ""), cond: p.length > 3 };
    })
    .filter(function (r) { return !r.cond && (r.status === 301 || r.status === 302); });
}
function ruleMatch(rule, p) {
  if (/\/\*$/.test(rule.from)) {
    var base = rule.from.slice(0, -1);
    return p.indexOf(base) === 0 ? rule.to.replace(":splat", p.slice(base.length)) : null;
  }
  return rule.from === p ? rule.to : null;
}

function Site(root) {
  this.root = root;
  this.rules = parseRedirects(root);
  this.files = {};
  var self = this;
  walk(root, "", []).forEach(function (f) { self.files[f] = true; });
}
// Fichier servi pour un chemin, sans redirection.
Site.prototype.fileFor = function (p) {
  var rel = p.replace(/^\/+/, "");
  if (rel === "" || /\/$/.test(rel)) return this.files[rel + "index.html"] ? rel + "index.html" : null;
  if (this.files[rel]) return rel;
  if (!/\.[a-z0-9]+$/i.test(rel)) {
    if (this.files[rel + ".html"]) return rel + ".html";
    if (this.files[rel + "/index.html"]) return rel + "/index.html";
  }
  return null;
};
// Chemin -> { file, url } apres redirections (null : ni fichier ni page).
Site.prototype.resolve = function (p) {
  for (var hop = 0; hop < 6; hop++) {
    var file = this.fileFor(p), next = null;
    for (var i = 0; i < this.rules.length; i++) {
      var r = this.rules[i], to = ruleMatch(r, p);
      if (to == null) continue;
      if (r.force || !file) next = to;
      break;
    }
    if (next == null) return file ? { file: file, url: urlOf(file) } : null;
    if (/^https?:/.test(next)) return null;
    p = next;
  }
  return null;
};
function urlOf(file) { return "/" + file.replace(/(^|\/)index\.html$/, "$1"); }
function versionOf(url) {
  var seg = url.split("/")[1];
  return DIR_CODES.indexOf(seg) !== -1 ? seg : X_DEFAULT_DIR;
}
// Section = /<dir>/<sous-dossier>/ (ou /<sous-dossier>/ a la racine) ; null
// pour une page de premier niveau.
function sectionOf(url) {
  var seg = url.split("/").filter(Boolean);
  if (DIR_CODES.indexOf(seg[0]) !== -1) return seg.length > 2 || /\/$/.test(url) && seg.length === 2 ? "/" + seg[0] + "/" + seg[1] + "/" : null;
  return seg.length > 1 || (/\/$/.test(url) && seg.length === 1) ? "/" + seg[0] + "/" : null;
}

function headOf(html) { return html.split(/<\/head>/i)[0]; }
function stripScripts(html) { return html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " "); }
function pageInfo(site, file) {
  var html = fs.readFileSync(path.join(site.root, file), "utf8");
  var head = headOf(html);
  var url = urlOf(file);
  var title = (head.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  var desc = (head.match(/<meta\s+name="description"\s+content="([^"]*)"/i) || [])[1];
  var canonical = (head.match(/<link\s+rel="canonical"\s+href="([^"]*)"/i) || [])[1] || null;
  var noindex = /<meta\s+name="robots"\s+content="[^"]*noindex/i.test(head);
  var alternates = [];
  head.replace(/<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]+)"/gi, function (m, hl, href) { alternates.push({ hreflang: hl, href: href }); return m; });
  var body = stripScripts(html.slice(head.length));
  var links = [];
  body.replace(/<a\b[^>]*?\shref="([^"]*)"/gi, function (m, href) { links.push(unesc(href)); return m; });
  var selfUrl = SITE_URL + url;
  var canonicalOk = !canonical || canonical === selfUrl || canonical === SITE_URL + url.replace(/\.html$/, "");
  return {
    file: file, url: url, version: versionOf(url), section: sectionOf(url),
    title: title != null ? unesc(title.replace(/\s+/g, " ").trim()) : null,
    description: desc != null ? unesc(desc) : null,
    canonical: canonical, noindex: noindex, alternates: alternates,
    indexable: !noindex && canonicalOk && !/(^|\/)404\.html$/.test(file),
    h1: (body.match(/<h1[\s>]/gi) || []).length,
    rawLinks: links
  };
}

function resolveHref(site, fromUrl, href) {
  if (!href || /^(mailto:|tel:|javascript:|data:|#)/i.test(href)) return null;
  if (/'\s*\+|\+\s*'/.test(href)) return null; // concatenation JS residuelle
  var p;
  if (/^https?:\/\//i.test(href)) {
    if (href.indexOf(SITE_URL + "/") !== 0 && href !== SITE_URL) return null;
    p = href.slice(SITE_URL.length) || "/";
  } else if (href.indexOf("//") === 0) {
    return null;
  } else if (href.charAt(0) === "/") {
    p = href;
  } else {
    p = path.posix.join(path.posix.dirname(fromUrl.replace(/\/$/, "/x")), href);
  }
  p = p.split("#")[0].split("?")[0];
  if (!p) return null;
  return site.resolve(p);
}

// ---------------------------------------------------------------------------
function audit(root, opts) {
  opts = opts || {};
  var site = new Site(root);
  var pages = {};
  Object.keys(site.files).forEach(function (file) {
    var url = urlOf(file);
    var r = site.resolve(url);
    if (!r || r.file !== file) return; // masque par une regle forcee
    pages[url] = pageInfo(site, file);
  });
  var broken = [];
  Object.keys(pages).forEach(function (url) {
    var pg = pages[url];
    pg.links = [];
    pg.rawLinks.forEach(function (href) {
      var r = resolveHref(site, url, href);
      if (r && pages[r.url]) { if (pg.links.indexOf(r.url) === -1) pg.links.push(r.url); }
      else if (href.charAt(0) === "/" && !/\.(js|css|png|jpe?g|svg|webp|ico|json|xml|txt)$/i.test(href.split(/[?#]/)[0])) broken.push({ from: url, href: href });
    });
    delete pg.rawLinks;
  });

  function bfs(start) {
    var depth = {}, queue = [start];
    if (!pages[start]) return depth;
    depth[start] = 0;
    while (queue.length) {
      var u = queue.shift();
      pages[u].links.forEach(function (v) {
        if (depth[v] == null) { depth[v] = depth[u] + 1; queue.push(v); }
      });
    }
    return depth;
  }

  var versions = {};
  DIR_CODES.forEach(function (v) {
    var depth = bfs("/" + v + "/");
    var own = Object.keys(pages).filter(function (u) { return pages[u].version === v && pages[u].indexable; });
    var unreachable = own.filter(function (u) { return depth[u] == null; }).sort();
    var tooDeep = own.filter(function (u) { return depth[u] != null && depth[u] > MAX_DEPTH; }).sort();
    var maxDepth = own.reduce(function (m, u) { return depth[u] != null ? Math.max(m, depth[u]) : m; }, 0);
    versions[v] = { indexable: own.length, unreachable: unreachable, tooDeep: tooDeep, maxDepth: maxDepth, depth: depth };
  });

  // Sections : lien entrant depuis une page hors de la section.
  var sections = {};
  Object.keys(pages).forEach(function (u) {
    var s = pages[u].section;
    if (!s) return;
    sections[s] = sections[s] || { pages: 0, indexable: 0, inbound: 0 };
    sections[s].pages++;
    if (pages[u].indexable) sections[s].indexable++;
  });
  Object.keys(pages).forEach(function (u) {
    pages[u].links.forEach(function (v) {
      var s = pages[v].section;
      if (s && pages[u].section !== s) sections[s].inbound++;
    });
  });
  var orphanSections = Object.keys(sections).filter(function (s) { return sections[s].indexable && !sections[s].inbound; }).sort();

  var indexable = Object.keys(pages).filter(function (u) { return pages[u].indexable; }).map(function (u) { return pages[u]; });
  var longTitles = indexable.filter(function (p) { return p.title != null && charLength(p.title) > TITLE_MAX; });
  var longDescriptions = indexable.filter(function (p) { return p.description != null && charLength(p.description) > DESCRIPTION_MAX; });
  var missingMeta = indexable.filter(function (p) { return !p.title || !p.description; });
  function dupes(field, scope) {
    var groups = {};
    indexable.forEach(function (p) {
      if (!p[field]) return;
      var k = (scope === "version" ? p.version + "|" : "") + p[field];
      (groups[k] = groups[k] || []).push(p.url);
    });
    return Object.keys(groups).filter(function (k) { return groups[k].length > 1; }).map(function (k) { return { value: k, urls: groups[k] }; });
  }
  var noH1 = indexable.filter(function (p) { return p.h1 === 0; }).map(function (p) { return p.url; });

  // Pages club/derby : hreflang reciproques et x-default quand un groupe existe.
  var clubIssues = [];
  indexable.filter(function (p) { return /^\/[a-z]{2}\/(clubs|equipos)\/[^/]+\.html$/.test(p.url); }).forEach(function (p) {
    if (!p.alternates.length) return;
    if (!p.alternates.some(function (a) { return a.hreflang === "x-default"; })) clubIssues.push({ url: p.url, issue: "x-default absent" });
    p.alternates.forEach(function (a) {
      if (a.hreflang === "x-default") return;
      var target = pages[a.href.slice(SITE_URL.length)];
      if (!target) return clubIssues.push({ url: p.url, issue: "hreflang vers une page absente " + a.href });
      if (!target.alternates.some(function (b) { return b.href === SITE_URL + p.url; })) clubIssues.push({ url: p.url, issue: "hreflang non reciproque " + a.href });
    });
  });

  var leagueHubs = indexable.filter(function (p) { return /^\/[a-z]{2}\/leagues\/[^/]+\.html$/.test(p.url); }).map(function (p) { return p.url; });

  return {
    pages: pages, versions: versions, sections: sections, orphanSections: orphanSections, broken: broken,
    indexable: indexable.length, longTitles: longTitles, longDescriptions: longDescriptions, missingMeta: missingMeta,
    duplicateTitlesByVersion: dupes("title", "version"), duplicateTitles: dupes("title"), duplicateDescriptionsByVersion: dupes("description", "version"),
    noH1: noH1, clubIssues: clubIssues, leagueHubs: leagueHubs
  };
}

function summary(a) {
  var out = {
    indexable: a.indexable,
    orphanSections: a.orphanSections,
    unreachable: {}, maxDepth: {}, tooDeep: {},
    longTitles: a.longTitles.length, longDescriptions: a.longDescriptions.length,
    duplicateTitlesByVersion: a.duplicateTitlesByVersion.length, duplicateTitlesAll: a.duplicateTitles.length,
    duplicateDescriptionsByVersion: a.duplicateDescriptionsByVersion.length,
    noH1: a.noH1.length, clubIssues: a.clubIssues.length, indexableLeagueHubs: a.leagueHubs.length, brokenInternalLinks: a.broken.length
  };
  DIR_CODES.forEach(function (v) {
    out.unreachable[v] = a.versions[v].unreachable.length;
    out.maxDepth[v] = a.versions[v].maxDepth;
    out.tooDeep[v] = a.versions[v].tooDeep.length;
  });
  return out;
}

module.exports = { audit: audit, summary: summary, charLength: charLength, unesc: unesc, TITLE_MAX: TITLE_MAX, DESCRIPTION_MAX: DESCRIPTION_MAX, MAX_DEPTH: MAX_DEPTH, DIR_CODES: DIR_CODES };

if (require.main === module) {
  var args = process.argv.slice(2);
  var dir = path.resolve(ROOT, args.filter(function (x) { return x.charAt(0) !== "-"; })[0] || "dist");
  var a = audit(dir);
  if (args.indexOf("--json") !== -1) {
    console.log(JSON.stringify({
      summary: summary(a), orphanSections: a.orphanSections,
      unreachable: DIR_CODES.reduce(function (o, v) { o[v] = a.versions[v].unreachable; return o; }, {}),
      tooDeep: DIR_CODES.reduce(function (o, v) { o[v] = a.versions[v].tooDeep; return o; }, {}),
      longTitles: a.longTitles.map(function (p) { return p.url + " (" + charLength(p.title) + ") " + p.title; }),
      longDescriptions: a.longDescriptions.map(function (p) { return p.url + " (" + charLength(p.description) + ")"; }),
      duplicateTitlesByVersion: a.duplicateTitlesByVersion, duplicateTitles: a.duplicateTitles, noH1: a.noH1, clubIssues: a.clubIssues, broken: a.broken.slice(0, 50)
    }, null, 1));
  } else {
    console.log(JSON.stringify(summary(a), null, 1));
  }
}
