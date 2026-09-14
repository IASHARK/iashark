"use strict";
// Rendu HTML des pages club / derby / index (scripts/build-club-hubs.js).
// Meme gabarit visuel que les pages championnat (scripts/seo-pages.js) :
// theme sombre, accent cyan, en-tete logo, navigation basse, pied de page
// legal + ressource d'aide du marche. CSS en ligne (pas de requete en plus).
//
// Donnees affichees : uniquement ce que lib/club-hub-data.js a extrait
// (calendrier, classement, forme, confrontations, conf public). Aucun champ
// premium n'est lu ici ; findPremiumLeak() sert de garde-fou final.
const fs = require("fs");
const path = require("path");
const C = require("../scripts/seo-common.js");
const PREMIUM = require("./premium-fields.js");

const esc = C.escHtml;
var buildLocales = null;
function B() { return buildLocales || (buildLocales = require("../scripts/build-locales.js")); }

const CSS = "*{box-sizing:border-box}body{margin:0;background:#060b12;color:#c3ccd8;font:15px/1.65 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding-bottom:96px}" +
  "a{color:#20d5ef}a:focus-visible{outline:2px solid #20d5ef;outline-offset:2px}" +
  ".hdr{display:flex;align-items:center;gap:16px;max-width:960px;margin:0 auto;padding:14px 18px;border-bottom:1px solid rgba(141,179,211,.14)}" +
  ".hdr img{display:block;width:132px;height:auto}.hdr nav{margin-left:auto;display:flex;gap:14px;font-size:13px;font-weight:600}.hdr nav a{text-decoration:none}" +
  "main{max-width:960px;margin:0 auto;padding:18px}.crumbs{font-size:12.5px;color:#91a0b3;margin:6px 0 14px}.crumbs a{color:#91a0b3}" +
  "h1{color:#f4f7fb;font-size:clamp(26px,4vw,38px);line-height:1.15;margin:0}h2{color:#f4f7fb;font-size:19px;margin:30px 0 10px}h3{color:#f4f7fb;font-size:16px;margin:0 0 6px}" +
  ".head{display:flex;align-items:center;gap:14px;margin:0 0 12px}.head img{width:52px;height:52px;flex:none}" +
  ".intro{max-width:760px}.note{font-size:13px;color:#91a0b3}" +
  ".age{display:inline-block;font-size:12.5px;font-weight:600;color:#f59e0b;border:1px solid rgba(245,158,11,.4);border-radius:999px;padding:3px 12px;margin:2px 0 4px}" +
  ".fx{list-style:none;padding:0;margin:0;border-top:1px solid rgba(141,179,211,.14)}.fx li{padding:11px 0;border-bottom:1px solid rgba(141,179,211,.14)}" +
  ".fx time{color:#91a0b3;font-size:13px;margin-right:6px}.fx .tm{font-weight:700;color:#f4f7fb}.fx .meta,.fx .act{display:block;font-size:13px;color:#91a0b3}.fx .act a{font-weight:600}" +
  ".conf{display:inline-block;font-size:12px;font-weight:700;color:#060b12;background:#20d5ef;border-radius:6px;padding:0 7px;margin-left:8px}" +
  ".res{display:inline-flex;align-items:center;justify-content:center;min-width:22px;height:22px;border-radius:6px;font-size:12px;font-weight:800;margin-right:8px;color:#060b12;vertical-align:1px}" +
  ".res-W{background:#10b981}.res-D{background:#91a0b3}.res-L{background:#ef4444;color:#fff}" +
  ".tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px}caption{caption-side:top;text-align:left;font-size:13px;color:#91a0b3;padding:0 0 6px}" +
  "th,td{padding:6px 8px;text-align:right;border-bottom:1px solid rgba(141,179,211,.14);white-space:nowrap}th{color:#91a0b3;font-weight:600;font-size:12.5px}" +
  "td.t,th.t{text-align:left;white-space:normal}tr.me td{color:#f4f7fb;font-weight:700;background:rgba(32,213,239,.08)}" +
  "dl.facts{display:grid;grid-template-columns:max-content 1fr;gap:4px 16px;margin:0 0 6px}dl.facts dt{color:#91a0b3}dl.facts dd{margin:0;color:#e2e8f0}" +
  ".grid2{display:grid;gap:14px}@media(min-width:720px){.grid2{grid-template-columns:1fr 1fr}}" +
  ".card{border:1px solid rgba(141,179,211,.14);border-radius:12px;padding:12px 14px;background:#0d1520}" +
  ".cards{list-style:none;padding:0;margin:0;display:grid;gap:10px}@media(min-width:640px){.cards{grid-template-columns:1fr 1fr}}" +
  ".cards a{font-weight:700;color:#f4f7fb;text-decoration:none}.cards a:hover{color:#20d5ef}.cards .meta{display:block;font-size:13px;color:#91a0b3}" +
  ".others{display:flex;flex-wrap:wrap;gap:8px 16px;font-size:14px}.asof{font-size:12.5px;color:#91a0b3;margin:0}" +
  ".foot{max-width:960px;margin:24px auto 0;padding:18px;border-top:1px solid rgba(141,179,211,.14);font-size:12.5px;color:#91a0b3}.foot a{color:#91a0b3}";

// ---------------------------------------------------------------------------
// Formats : langue du repertoire ; fuseau de la page (tz, ex. clubs argentins
// dans /es/) ou, a defaut, du repertoire (i18n/seo/<dir>.json#tz).
function fmt(d, dir, o, tz) {
  try { return new Intl.DateTimeFormat(C.DIRS[dir].intlLocale, Object.assign({ timeZone: tz || C.seoConf(dir).tz }, o)).format(d); }
  catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
}
function whenText(d, dir, tz) { return fmt(d, dir, { weekday: "short", day: "numeric", month: "short" }, tz) + " · " + fmt(d, dir, { hour: "numeric", minute: "2-digit" }, tz); }
function dayText(d, dir, tz) { return fmt(d, dir, { day: "numeric", month: "short", year: "numeric" }, tz); }
function longDay(d, dir, tz) { return fmt(d, dir, { day: "numeric", month: "long", year: "numeric" }, tz); }
function tzLabelOf(ctx) { return ctx.tzLabel || C.seoConf(ctx.dir).tz_label; }
function iso(d) { return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
function numText(n, dir, digits) {
  try { return new Intl.NumberFormat(C.DIRS[dir].intlLocale, { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 }).format(n); }
  catch (e) { return String(n); }
}
function signed(n) { return n == null ? "" : n > 0 ? "+" + n : String(n); }
function fill(tpl, vars) { return C.fill(tpl, vars); }

// Chemins (URL canonique absolue, liens internes relatifs a la racine).
function hubPath(dir, version) { return "/" + dir + "/" + version.hubSlug + "/"; }
function pagePath(dir, version, slug) { return "/" + dir + "/" + version.hubSlug + "/" + slug + ".html"; }
function abs(p) { return C.SITE_URL + p; }

function nameOf(team, ctx) {
  if (!team) return "";
  return (team.id != null && ctx.names[team.id]) || team.name || "";
}

// ---------------------------------------------------------------------------
// Blocs communs.
function dictLabel(dir, key, fallback) {
  var v = C.get(C.dictFor(dir), key);
  return typeof v === "string" ? v : fallback;
}

function headerHtml(ctx) {
  var dir = ctx.dir;
  return '<header class="hdr"><a href="' + C.homePath(dir) + '" aria-label="IASHARK"><img src="/assets/iashark-logo.png" width="1648" height="440" alt="IASHARK"></a>' +
    '<nav><a href="' + C.homePath(dir) + '">' + esc(dictLabel(dir, "nav.home", "HOME")) + "</a>" +
    '<a href="' + hubPath(dir, ctx.version) + '">' + esc(ctx.labels.nav_clubs) + "</a>" +
    '<a href="' + C.blogHubPath(dir) + '">' + esc(dictLabel(dir, "nav.guides", "BLOG")) + "</a></nav></header>\n";
}

function crumbsHtml(items, ctx) {
  return '<nav class="crumbs" aria-label="' + esc(C.seoConf(ctx.dir).match.breadcrumb_aria) + '">' + items.map(function (it, i) {
    return i < items.length - 1
      ? '<a href="' + esc(it.url.slice(C.SITE_URL.length)) + '">' + esc(it.name) + "</a>"
      : '<span aria-current="page">' + esc(it.name) + "</span>";
  }).join(' <span aria-hidden="true">›</span> ') + "</nav>\n";
}

function footerHtml(ctx) {
  var dir = ctx.dir, L = ctx.labels;
  var help = B().helplineFor(dir);
  var legal = B().LEGAL_FILE_LIST.filter(function (f) { return fs.existsSync(path.join(C.ROOT, "legal", dir, f)); }).map(function (f) {
    var key = { "mentions-legales.html": "footer.mentions_legales", "cgv.html": "footer.cgv", "confidentialite.html": "footer.confidentialite", "cookies.html": "footer.cookies", "jeu-responsable.html": "footer.responsible_gambling" }[f];
    return '<a href="/' + dir + "/" + f + '">' + esc(key ? dictLabel(dir, key, f) : f) + "</a>";
  }).join(" · ");
  var helpHtml = help
    ? "<p>" + esc(L.help) + ' <a href="' + esc(help.url) + '" rel="noopener" data-market-helpline="name">' + esc(help.name) + "</a>" +
      (help.phone ? ' · <span data-market-helpline="phone">' + esc(help.phone) + "</span>" : "") + "</p>"
    : "";
  return '<footer class="foot"><p>' + esc(C.seoConf(dir).league.disclaimer) + "</p>" + helpHtml + (legal ? "<p>" + legal + "</p>" : "") + "</footer>\n";
}

function headHtml(ctx, jsonLd) {
  var conf = C.DIRS[ctx.dir];
  var canonical = abs(ctx.path);
  var t = ctx.text;
  var alt = ctx.alternates && ctx.alternates.length > 1 ? C.hreflangLinks(ctx.alternates).replace(/></g, ">\n<") + "\n" : "";
  return "<!DOCTYPE html>\n" +
    '<html lang="' + conf.htmlLang + '">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="iashark-market" content="' + conf.market + '">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    "<title>" + esc(t.title) + "</title>\n" +
    '<meta name="description" content="' + esc(t.description) + '">\n' +
    (ctx.noindex ? '<meta name="robots" content="noindex,follow">\n' : "") +
    '<link rel="canonical" href="' + canonical + '">\n' + alt +
    '<meta property="og:type" content="website">\n<meta property="og:site_name" content="IASHARK">\n' +
    '<meta property="og:locale" content="' + C.ogLocale(ctx.dir) + '">\n' +
    '<meta property="og:title" content="' + esc(t.title) + '">\n<meta property="og:description" content="' + esc(t.description) + '">\n' +
    '<meta property="og:url" content="' + canonical + '">\n<meta property="og:image" content="' + esc(ctx.image || C.SITE_URL + "/icon-512.png") + '">\n' +
    '<meta name="twitter:card" content="summary">\n' +
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n' +
    jsonLd.map(C.ldScript).join("\n") + "\n" +
    "<style>" + CSS + "</style>\n" +
    '<link rel="stylesheet" href="/assets/bottom-navigation.css">\n' +
    "</head>\n<body>\n";
}

const TAIL = '<script defer src="/i18n/i18n.js"></script>\n<script defer src="/lib/market-config.js"></script>\n<script defer src="/bottom-navigation.js"></script>\n</body>\n</html>\n';

// ---------------------------------------------------------------------------
// Blocs de donnees.
function fixtureItem(fx, ctx) {
  var L = ctx.labels, dir = ctx.dir;
  var meta = [fx.league && fx.league.name, fx.league && fx.league.round, fx.venue].filter(Boolean).map(esc).join(" · ");
  var act;
  if (fx.analysis) {
    var staticPath = C.matchPath(dir, fx.id);
    var appPath = "/" + dir + "/match.html?id=" + fx.id;
    var hasStatic = ctx.linkExists(staticPath);
    act = '<a href="' + (hasStatic ? staticPath : appPath) + '">' + esc(L.analysis_link) + "</a>" +
      (hasStatic ? ' · <a href="' + appPath + '">' + esc(L.app_link) + "</a>" : "") +
      (fx.analysis.conf != null ? '<span class="conf">' + esc(L.conf_label) + " " + esc(numText(fx.analysis.conf, dir, 1)) + "/10</span>" : "");
  } else {
    act = esc(L.analysis_pending);
  }
  return '<li><time datetime="' + iso(fx.date) + '">' + esc(whenText(fx.date, dir, ctx.tz)) + '</time><span class="tm">' +
    esc(nameOf(fx.home, ctx)) + " " + esc(L.vs) + " " + esc(nameOf(fx.away, ctx)) + "</span>" +
    (meta ? '<span class="meta">' + meta + "</span>" : "") + '<span class="act">' + act + "</span></li>";
}

function fixturesBlock(list, ctx, noneText) {
  if (!list.length) return "<p>" + esc(noneText) + "</p>\n";
  var anyConf = list.some(function (fx) { return fx.analysis && fx.analysis.conf != null; });
  return '<p class="note">' + esc(fill(ctx.labels.kickoff_note, { tz: tzLabelOf(ctx) })) + "</p>\n" +
    '<ul class="fx">' + list.map(function (fx) { return fixtureItem(fx, ctx); }).join("") + "</ul>\n" +
    (anyConf ? '<p class="note">' + esc(ctx.labels.conf_note) + "</p>\n" : "");
}

function resultItem(it, ctx) {
  var L = ctx.labels;
  var badge = it.result ? '<span class="res res-' + it.result + '" title="' + esc(L.result_long[it.result]) + '">' + esc(L.result[it.result]) + "</span>" : "";
  var line;
  if (it.home && it.away && it.gh != null) {
    line = '<span class="tm">' + esc(nameOf(it.home, ctx)) + " " + it.gh + "–" + it.ga + " " + esc(nameOf(it.away, ctx)) + "</span>" +
      (it.pens ? " (" + esc(L.pens) + " " + it.pens.home + "–" + it.pens.away + ")" : "");
  } else {
    line = '<span class="tm">' + esc(L.against) + " " + esc(it.opponent) + "</span> (" + esc(it.isHome ? L.home : L.away) + ")";
  }
  var meta = [it.date ? dayText(it.date, ctx.dir, ctx.tz) : null, it.league, it.round].filter(Boolean).map(esc).join(" · ");
  return "<li>" + badge + line + (meta ? '<span class="meta">' + meta + "</span>" : "") + "</li>";
}

function formBlock(items, ctx) {
  if (!items.length) return "<p>" + esc(ctx.labels.form_none) + "</p>\n";
  var s = { n: 0, w: 0, d: 0, l: 0 };
  items.forEach(function (it) { if (it.result) { s.n++; s[it.result === "W" ? "w" : it.result === "D" ? "d" : "l"]++; } });
  return (s.n ? "<p>" + esc(fill(ctx.labels.form_summary, s)) + "</p>\n" : "") +
    '<ul class="fx">' + items.map(function (it) { return resultItem(it, ctx); }).join("") + "</ul>\n";
}

function positionSentence(group, teamId, team, ctx) {
  var row = group && group.rows.filter(function (r) { return r.teamId === teamId; })[0];
  if (!row || row.rank == null) return "";
  return fill(ctx.labels.table_position, { team: nameOf(team, ctx), rank: row.rank, total: group.rows.length, points: row.points, played: row.played });
}

function tableBlock(group, highlight, ctx, leagueName) {
  var L = ctx.labels, dir = ctx.dir;
  if (!group || !group.rows.length) return "<p>" + esc(fill(L.table_none, { league: leagueName })) + "</p>\n";
  var caption = [group.name || group.league || leagueName, group.season ? String(group.season) : null].filter(Boolean).join(" · ");
  var rows = group.rows.map(function (r) {
    var link = ctx.clubLinks[r.teamId];
    var nm = esc(nameOf({ id: r.teamId, name: r.name }, ctx));
    if (link && link !== ctx.path) nm = '<a href="' + link + '">' + nm + "</a>";
    return "<tr" + (highlight.indexOf(r.teamId) !== -1 ? ' class="me"' : "") + "><td>" + (r.rank != null ? r.rank : "") + '</td><td class="t">' + nm + "</td><td>" +
      (r.played != null ? r.played : "") + "</td><td>" + [r.win, r.draw, r.lose].map(function (v) { return v != null ? v : "?"; }).join("-") + "</td><td>" + signed(r.gd) + "</td><td>" + (r.points != null ? r.points : "") + "</td></tr>";
  }).join("");
  return (group.partial ? '<p class="note">' + esc(L.table_partial) + "</p>\n" : "") +
    '<div class="tbl"><table><caption>' + esc(caption) + "</caption><thead><tr><th>" + esc(L.col_rank) + '</th><th class="t">' + esc(L.col_team) + "</th><th>" + esc(L.col_played) +
    "</th><th>" + esc(L.col_wdl) + "</th><th>" + esc(L.col_gd) + "</th><th>" + esc(L.col_pts) + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>\n" +
    (dir ? "" : "");
}

function factsBlock(info, ctx) {
  if (!info) return "";
  var L = ctx.labels, dir = ctx.dir, v = info.venue || {};
  var rows = [];
  if (info.founded) rows.push([L.founded, String(info.founded)]);
  if (v.name) rows.push([L.stadium, v.name]);
  if (v.capacity) rows.push([L.capacity, numText(v.capacity, dir)]);
  if (v.city) rows.push([L.city, v.city]);
  if (!rows.length) return "";
  return '<dl class="facts">' + rows.map(function (r) { return "<dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd>"; }).join("") + "</dl>\n" +
    '<p class="note">' + esc(L.facts_source) + "</p>\n";
}

function relatedBlock(ctx) {
  if (!ctx.related.length) return "";
  return "<h2>" + esc(ctx.labels.related_title) + '</h2>\n<p class="others">' + ctx.related.map(function (r) {
    return '<a href="' + r.href + '">' + esc(r.label) + "</a>";
  }).join("") + "</p>\n";
}

function asOfHtml(ctx) {
  return ctx.asOf ? '<p class="asof">' + esc(fill(ctx.labels.asof, { date: longDay(ctx.asOf, ctx.dir, ctx.tz) })) + "</p>\n" : "";
}

// ---------------------------------------------------------------------------
// JSON-LD.
function teamLd(team, ctx) {
  var o = { "@type": "SportsTeam", name: nameOf(team, ctx), sport: C.seoConf(ctx.dir).sport };
  var info = team.info;
  if (info) {
    if (info.name && info.name !== o.name) o.alternateName = info.name;
    if (info.logo) o.logo = info.logo;
    if (info.founded) o.foundingDate = String(info.founded);
    if (info.venue && info.venue.name) {
      o.location = { "@type": "Place", name: info.venue.name };
      if (info.venue.city) o.location.address = { "@type": "PostalAddress", addressLocality: info.venue.city };
    }
  }
  if (ctx.league && ctx.league.name) o.memberOf = { "@type": "SportsOrganization", name: ctx.league.name };
  if (ctx.clubLinks[team.id]) o.url = abs(ctx.clubLinks[team.id]);
  return o;
}

function eventsLd(list, ctx) {
  return list.slice(0, 5).map(function (fx) {
    var ev = {
      "@context": "https://schema.org",
      "@type": "SportsEvent",
      name: nameOf(fx.home, ctx) + " " + ctx.labels.vs + " " + nameOf(fx.away, ctx),
      startDate: iso(fx.date),
      sport: C.seoConf(ctx.dir).sport,
      eventStatus: "https://schema.org/EventScheduled",
      eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
      homeTeam: { "@type": "SportsTeam", name: nameOf(fx.home, ctx) },
      awayTeam: { "@type": "SportsTeam", name: nameOf(fx.away, ctx) }
    };
    if (fx.venue) ev.location = { "@type": "Place", name: fx.venue };
    if (fx.league && fx.league.name) ev.superEvent = { "@type": "SportsEvent", name: fx.league.name };
    if (fx.analysis && ctx.linkExists(C.matchPath(ctx.dir, fx.id))) ev.url = abs(C.matchPath(ctx.dir, fx.id));
    return ev;
  });
}

function crumbItems(ctx) {
  var s = C.seoConf(ctx.dir);
  return [
    { name: s.breadcrumb.home, url: abs(C.homePath(ctx.dir)) },
    { name: ctx.labels.hub_crumb, url: abs(hubPath(ctx.dir, ctx.version)) },
    { name: ctx.text.name, url: abs(ctx.path) }
  ];
}

// ---------------------------------------------------------------------------
// Pages.
function renderClubPage(ctx) {
  var L = ctx.labels, t = ctx.text, team = ctx.teams[0];
  var crumbs = crumbItems(ctx);
  var sportsTeam = Object.assign({ "@context": "https://schema.org", "@id": abs(ctx.path) + "#team" }, teamLd(team, ctx), { url: abs(ctx.path) });
  var ld = [C.breadcrumbLd(crumbs), sportsTeam].concat(eventsLd(ctx.upcoming, ctx));
  var leagueName = ctx.league.name;
  var pos = positionSentence(ctx.group, team.id, team, ctx);
  var logo = team.info && team.info.logo ? '<img src="' + esc(team.info.logo) + '" width="52" height="52" alt="" loading="lazy">' : "";
  var body = headerHtml(ctx) + "<main>\n" + crumbsHtml(crumbs, ctx) +
    '<div class="head">' + logo + "<h1>" + esc(t.h1) + "</h1></div>\n" +
    '<p class="intro">' + esc(t.intro) + "</p>\n" +
    '<p class="age">' + esc(L.age) + "</p>\n" + asOfHtml(ctx) +
    '<h2 id="fixtures">' + esc(L.upcoming_title) + "</h2>\n" + fixturesBlock(ctx.upcoming, ctx, L.upcoming_none) +
    '<h2 id="table">' + esc(fill(L.table_title, { league: leagueName })) + "</h2>\n" + (pos ? "<p>" + esc(pos) + "</p>\n" : "") + tableBlock(ctx.group, [team.id], ctx, leagueName) +
    '<h2 id="form">' + esc(L.form_title) + "</h2>\n" + formBlock(team.form, ctx) +
    (team.info ? '<h2 id="facts">' + esc(L.facts_title) + "</h2>\n" + factsBlock(team.info, ctx) : "") +
    relatedBlock(ctx) + "</main>\n" + footerHtml(ctx);
  return headHtml(Object.assign({}, ctx, { image: team.info && team.info.logo }), ld) + body + TAIL;
}

function renderDerbyPage(ctx) {
  var L = ctx.labels, t = ctx.text;
  var a = ctx.teams[0], b = ctx.teams[1];
  var crumbs = crumbItems(ctx);
  var page = {
    "@context": "https://schema.org", "@type": "WebPage", "@id": abs(ctx.path) + "#webpage", url: abs(ctx.path),
    name: t.title, description: t.description, inLanguage: C.DIRS[ctx.dir].htmlLang,
    about: [teamLd(a, ctx), teamLd(b, ctx)]
  };
  var ld = [C.breadcrumbLd(crumbs), page].concat(eventsLd(ctx.upcoming, ctx));
  var leagueName = ctx.league.name;
  var h = ctx.h2h;
  var h2hHtml = h.items.length
    ? "<p>" + esc(fill(L.h2h_summary, { n: h.summary.n, a: nameOf(a, ctx), b: nameOf(b, ctx), wa: h.summary.winsA, wb: h.summary.winsB, d: h.summary.draws })) + "</p>\n" +
      '<ul class="fx">' + h.items.map(function (it) { return resultItem(it, ctx); }).join("") + "</ul>\n"
    : "<p>" + esc(L.h2h_none) + "</p>\n";
  // ctx.groups (derby splitStandings) : chaque club dans son propre groupe.
  var groupOf = function (i) { return ctx.groups ? ctx.groups[i] : ctx.group; };
  var positions = [a, b].map(function (tm, i) { return positionSentence(groupOf(i), tm.id, tm, ctx); }).filter(Boolean);
  var tables = ctx.groups && ctx.groups[0] && ctx.groups[1] && ctx.groups[0].name !== ctx.groups[1].name
    ? tableBlock(ctx.groups[0], [a.id, b.id], ctx, leagueName) + tableBlock(ctx.groups[1], [a.id, b.id], ctx, leagueName)
    : tableBlock(ctx.groups ? (ctx.groups[0] || ctx.groups[1]) : ctx.group, [a.id, b.id], ctx, leagueName);
  var cards = [a, b].map(function (tm) {
    var link = ctx.clubLinks[tm.id];
    var title = link ? '<a href="' + link + '">' + esc(nameOf(tm, ctx)) + "</a>" : esc(nameOf(tm, ctx));
    return '<div class="card"><h3>' + title + "</h3>\n" + formBlock(tm.form, ctx) + factsBlock(tm.info, ctx) + "</div>";
  }).join("\n");
  var body = headerHtml(ctx) + "<main>\n" + crumbsHtml(crumbs, ctx) +
    '<div class="head"><h1>' + esc(t.h1) + "</h1></div>\n" +
    '<p class="intro">' + esc(t.intro) + "</p>\n" +
    '<p class="age">' + esc(L.age) + "</p>\n" + asOfHtml(ctx) +
    '<h2 id="fixtures">' + esc(L.next_meeting_title) + "</h2>\n" + fixturesBlock(ctx.upcoming, ctx, L.next_meeting_none) +
    '<h2 id="h2h">' + esc(L.h2h_title) + "</h2>\n" + h2hHtml +
    '<h2 id="table">' + esc(fill(L.table_title, { league: leagueName })) + "</h2>\n" + positions.map(function (p) { return "<p>" + esc(p) + "</p>\n"; }).join("") +
    tables +
    '<h2 id="teams">' + esc(L.teams_title) + '</h2>\n<div class="grid2">\n' + cards + "\n</div>\n" +
    relatedBlock(ctx) + "</main>\n" + footerHtml(ctx);
  return headHtml(ctx, ld) + body + TAIL;
}

// ctx : { dir, version, labels, path, text, clubs:[{name, href, league, next}], derbies:[...], related, noindex }
function renderHubPage(ctx) {
  var L = ctx.labels, t = ctx.text, dir = ctx.dir;
  var s = C.seoConf(dir);
  var crumbs = [{ name: s.breadcrumb.home, url: abs(C.homePath(dir)) }, { name: L.hub_crumb, url: abs(ctx.path) }];
  var items = ctx.clubs.concat(ctx.derbies);
  var page = {
    "@context": "https://schema.org", "@type": "CollectionPage", "@id": abs(ctx.path) + "#webpage", url: abs(ctx.path),
    name: t.title, description: t.description, inLanguage: C.DIRS[dir].htmlLang, isPartOf: { "@id": C.SITE_URL + "/#website" },
    mainEntity: { "@type": "ItemList", itemListElement: items.map(function (it, i) { return { "@type": "ListItem", position: i + 1, url: abs(it.href), name: it.name }; }) }
  };
  function cardList(list) {
    return '<ul class="cards">' + list.map(function (it) {
      var next = it.next ? fill(L.hub_next, { date: whenText(it.next, dir, it.tz) + (it.tzLabel ? " (" + it.tzLabel + ")" : "") }) : L.hub_no_next;
      return '<li><a href="' + it.href + '">' + esc(it.name) + '</a><span class="meta">' + esc(it.league) + "</span>" +
        '<span class="meta">' + (it.next ? '<time datetime="' + iso(it.next) + '">' + esc(next) + "</time>" : esc(next)) + "</span></li>";
    }).join("") + "</ul>\n";
  }
  var body = headerHtml(ctx) + "<main>\n" + crumbsHtml(crumbs, ctx) +
    "<h1>" + esc(t.h1) + "</h1>\n" + '<p class="intro">' + esc(t.intro) + "</p>\n" +
    '<p class="age">' + esc(L.age) + "</p>\n" + asOfHtml(ctx) +
    (ctx.clubs.length ? '<h2 id="clubs">' + esc(L.clubs_title) + "</h2>\n" + cardList(ctx.clubs) : "") +
    (ctx.derbies.length ? '<h2 id="derbies">' + esc(L.derbies_title) + "</h2>\n" + cardList(ctx.derbies) : "") +
    '<p class="note">' + esc(fill(L.kickoff_note, { tz: s.tz_label })) + "</p>\n" +
    relatedBlock(ctx) + "</main>\n" + footerHtml(ctx);
  return headHtml(Object.assign({ alternates: [] }, ctx), [C.breadcrumbLd(crumbs), page]) + body + TAIL;
}

// ---------------------------------------------------------------------------
// Garde-fou : noms de champs premium, liste UNIQUE lib/premium-fields.js
// (PREMIUM_FIELDS + cles de modele imbriquees). Les noms composes (pari_rec,
// top_scorers...) sont signales partout ; les noms courts qui sont aussi des
// mots courants (edge, kelly, marche, val, mise, scores...) seulement sous
// forme de cle JSON ou d'attribut ("edge": / data-edge).
function reEscape(x) { return x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
const PREMIUM_ALL = Array.from(new Set(PREMIUM.PREMIUM_FIELDS.concat(PREMIUM.DEEP_PREMIUM_KEYS || [])));
const PREMIUM_COMPOUND = PREMIUM_ALL.filter(function (k) { return k.indexOf("_") !== -1; });
const PREMIUM_SHORT = PREMIUM_ALL.filter(function (k) { return k.indexOf("_") === -1; });
const PREMIUM_NAMES = new RegExp("\\b(" + PREMIUM_COMPOUND.map(reEscape).join("|") + ")\\b");
const PREMIUM_KEYS = new RegExp("[\"'](" + PREMIUM_SHORT.map(reEscape).join("|") + ")[\"']\\s*:|data-(" + PREMIUM_SHORT.map(reEscape).join("|") + ")\\b");
function findPremiumLeak(html) {
  var m = PREMIUM_NAMES.exec(html) || PREMIUM_KEYS.exec(html);
  return m ? m[0] : null;
}

// Empreinte lastmod : la ligne "Donnees au ..." change chaque jour sans que
// le contenu change ; elle est exclue de l'empreinte (scripts/seo-lastmod.js).
function stripVolatile(html) { return String(html).replace(/<p class="asof">[^<]*<\/p>\n?/g, ""); }

function isNoindex(html) { return /<meta name="robots" content="[^"]*noindex/i.test(String(html).split(/<\/head>/i)[0]); }

module.exports = {
  CSS: CSS, hubPath: hubPath, pagePath: pagePath, abs: abs,
  renderClubPage: renderClubPage, renderDerbyPage: renderDerbyPage, renderHubPage: renderHubPage,
  findPremiumLeak: findPremiumLeak, PREMIUM_ALL: PREMIUM_ALL, stripVolatile: stripVolatile, isNoindex: isNoindex,
  whenText: whenText, dayText: dayText
};
