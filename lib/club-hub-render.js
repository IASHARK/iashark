"use strict";
// Rendu HTML des pages club / derby / index (scripts/build-club-hubs.js).
// Presentation v2 validee par le proprietaire le 15/09/2026, partagee avec les
// pages championnat (scripts/seo-pages.js#renderLeagueHub) : composants
// lib/hub-ui.js, feuille /assets/league-hub.v1.css (mise en cache une fois pour
// tout le site ; en ligne, elle ferait depasser 40 Ko aux pages club/derby).
// En-tete logo, navigation basse, pied de page legal + ressource d'aide du marche.
//
// Donnees affichees : uniquement ce que lib/club-hub-data.js a extrait
// (calendrier, classement, forme, zones, confrontations). JAMAIS de note sur 10
// ni de probabilite, meme pour le match offert du jour (conf est premium) : un
// match analyse porte seulement « Analyse disponible » et le lien vers sa page.
// Aucun champ premium n'est lu ici ; findPremiumLeak() sert de garde-fou final.
const fs = require("fs");
const path = require("path");
const C = require("../scripts/seo-common.js");
const PREMIUM = require("./premium-fields.js");
const UI = require("./hub-ui.js");

const esc = C.escHtml;
var buildLocales = null;
function B() { return buildLocales || (buildLocales = require("../scripts/build-locales.js")); }

// ---------------------------------------------------------------------------
// Formats : langue du repertoire ; fuseau de la page (tz, ex. clubs argentins
// dans /es/) ou, a defaut, du repertoire (i18n/seo/<dir>.json#tz).
function fmt(d, dir, o, tz) {
  try { return new Intl.DateTimeFormat(C.intlLocaleFor(dir), Object.assign({ timeZone: tz || C.seoConf(dir).tz }, o)).format(d); }
  catch (e) { return d.toISOString().slice(0, 16).replace("T", " "); }
}
function whenText(d, dir, tz) { return fmt(d, dir, { weekday: "short", day: "numeric", month: "short" }, tz) + " · " + fmt(d, dir, { hour: "numeric", minute: "2-digit" }, tz); }
function dayShort(d, dir, tz) { return fmt(d, dir, { weekday: "short", day: "numeric", month: "short" }, tz); }
function clockText(d, dir, tz) { return fmt(d, dir, { hour: "numeric", minute: "2-digit" }, tz); }
function dayText(d, dir, tz) { return fmt(d, dir, { day: "numeric", month: "short", year: "numeric" }, tz); }
function longDay(d, dir, tz) { return fmt(d, dir, { day: "numeric", month: "long", year: "numeric" }, tz); }
function tzLabelOf(ctx) { return ctx.tzLabel || C.seoConf(ctx.dir).tz_label; }
function iso(d) { return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
function numText(n, dir, digits) {
  try { return new Intl.NumberFormat(C.intlLocaleFor(dir), { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 }).format(n); }
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

// Libelles des composants (lib/hub-ui.js) depuis i18n/parts/clubs.<locale>.json.
function uiLabels(ctx) {
  var L = ctx.labels;
  return {
    result: L.result, result_long: L.result_long, form: L.form_col, colon: L.colon, analysis_available: L.analysis_available,
    vs: L.vs, zones: L.zones || {}, club_label: L.club_label, derby_label: L.derby_label
  };
}

// ---------------------------------------------------------------------------
// Blocs communs.
function dictLabel(dir, key, fallback) {
  var v = C.get(C.dictFor(dir), key);
  return typeof v === "string" ? v : fallback;
}

function headerHtml(ctx) {
  var dir = ctx.dir;
  return '<header class="hdr"><a href="' + C.homePath(dir) + '" aria-label="IASHARK"><img src="/assets/iashark-logo.webp" width="1648" height="440" alt="IASHARK"></a>' +
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
    var key = { "mentions-legales.html": "footer.mentions_legales", "cgv.html": "footer.cgv", "confidentialite.html": "footer.confidentialite", "cookies.html": "footer.cookies", "jeu-responsable.html": "footer.responsible_gambling", "methodologie.html": "footer.methodology" }[f];
    return '<a href="/' + dir + "/" + f + '">' + esc(key ? dictLabel(dir, key, f) : f) + "</a>";
  }).join(" · ");
  // Ressource supplementaire de la version (config/markets.json#_dirs.<dir>.helplineExtra,
  // /en/ : ligne nationale americaine a cote de Gambling Therapy), comme les
  // pages championnat (scripts/seo-pages.js).
  var help2 = B().helplineExtraFor(dir);
  var helpHtml = help
    ? "<p>" + esc(L.help) + ' <a href="' + esc(help.url) + '" rel="noopener" data-market-helpline="name">' + esc(help.name) + "</a>" +
      (help.phone ? ' · <span data-market-helpline="phone">' + esc(help.phone) + "</span>" : "") +
      (help2 ? ' · <a href="' + esc(help2.url) + '" rel="noopener">' + esc(help2.name) + "</a>" + (help2.phone ? " " + esc(help2.phone) : "") : "") + "</p>"
    : "";
  // Navigation de la version (hubs ligue du perimetre, clubs, articles, blog,
  // marches, methodologie) : scripts/seo-common.js#footerNavHtml.
  return '<footer class="foot"><p>' + esc(C.seoConf(dir).league.disclaimer) + "</p>" + helpHtml + (legal ? "<p>" + legal + "</p>" : "") + "</footer>\n" + C.footerNavHtml(dir) + "\n";
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
    '<link rel="stylesheet" href="' + UI.CSS_HREF + '">\n' +
    '<link rel="stylesheet" href="/assets/bottom-navigation.css">\n' +
    "</head>\n<body>\n";
}

const TAIL = '<script defer src="/i18n/i18n.js"></script>\n<script defer src="/lib/market-config.js"></script>\n<script defer src="/bottom-navigation.js"></script>\n</body>\n</html>\n';

// ---------------------------------------------------------------------------
// Blocs de donnees.
// Lien d'un match analyse : page statique de la version si elle existe, sinon l'application.
function analysisHref(fx, ctx) {
  if (!fx.analysis) return null;
  var staticPath = C.matchPath(ctx.dir, fx.id);
  return ctx.linkExists(staticPath) ? staticPath : "/" + ctx.dir + "/match.html?id=" + fx.id;
}
function fixtureEntry(fx, ctx) {
  return {
    iso: iso(fx.date), day: dayShort(fx.date, ctx.dir, ctx.tz), clock: clockText(fx.date, ctx.dir, ctx.tz),
    home: { id: fx.home && fx.home.id, name: nameOf(fx.home, ctx) }, away: { id: fx.away && fx.away.id, name: nameOf(fx.away, ctx) },
    meta: [fx.league && fx.league.name, fx.league && fx.league.round, fx.venue].filter(Boolean).join(" · "),
    href: analysisHref(fx, ctx), pending: fx.analysis ? null : ctx.labels.analysis_pending
  };
}

// Page club : bandeau de cartes. Derby : prochaine confrontation mise en avant, puis les suivantes.
function fixturesBody(list, ctx, noneText, kind) {
  if (!list.length) return "<p>" + esc(noneText) + "</p>\n";
  var L = ctx.labels, U = uiLabels(ctx), entries = list.map(function (fx) { return fixtureEntry(fx, ctx); });
  if (kind !== "derby") return UI.rail(entries, U, L.upcoming_title) + "\n";
  var e = entries[0];
  var foot = e.href ? UI.analysisPill(e.href, U, true) : '<span class="pending">' + esc(e.pending) + "</span>";
  var next = '<div class="next"><time datetime="' + e.iso + '"><b>' + esc(e.day) + "</b><span>" + esc(e.clock) + "</span></time>" +
    '<div class="next-teams"><span class="t">' + UI.crest(e.home.id, e.home.name, "lg") + esc(e.home.name) + '</span><span class="x" aria-hidden="true">VS</span>' +
    '<span class="sr"> ' + esc(L.vs) + " </span>" + '<span class="t">' + UI.crest(e.away.id, e.away.name, "lg") + esc(e.away.name) + "</span></div>" +
    (e.meta ? '<span class="fxc-meta">' + esc(e.meta) + "</span>" : "") + '<span class="fxc-foot">' + foot + "</span></div>";
  var later = entries.length > 1 ? '<ul class="later">' + entries.slice(1).map(function (x) {
    return '<li><time datetime="' + x.iso + '">' + esc(x.day + " · " + x.clock) + '</time><span class="m">' + esc(x.home.name + " " + L.vs + " " + x.away.name) + "</span>" +
      (x.meta ? '<span class="fxc-meta">' + esc(x.meta) + "</span>" : "") +
      (x.href ? UI.analysisPill(x.href, U, true) : '<span class="pending">' + esc(x.pending) + "</span>") + "</li>";
  }).join("") + "</ul>" : "";
  return next + later + "\n";
}
function kickoffNote(list, ctx) { return list.length ? fill(ctx.labels.kickoff_note, { tz: tzLabelOf(ctx) }) : null; }

// Ligne de resultat (forme, confrontations) en liste compacte.
function miniRow(it, ctx) {
  var L = ctx.labels;
  var badge = it.result ? '<span class="f f-' + it.result + '" title="' + esc(L.result_long[it.result]) + '">' + esc(L.result[it.result]) + "</span>" : "<span></span>";
  var line;
  if (it.home && it.away && it.gh != null) {
    line = esc(nameOf(it.home, ctx)) + " " + it.gh + "–" + it.ga + " " + esc(nameOf(it.away, ctx)) +
      (it.pens ? " (" + esc(L.pens) + " " + it.pens.home + "–" + it.pens.away + ")" : "");
  } else {
    line = esc(L.against) + " " + esc(it.opponent) + " (" + esc(it.isHome ? L.home : L.away) + ")";
  }
  var meta = [it.date ? dayText(it.date, ctx.dir, ctx.tz) : null, it.league, it.round].filter(Boolean).map(esc).join(" · ");
  return "<li>" + badge + '<span class="tm">' + line + "</span>" + (meta ? '<span class="meta">' + meta + "</span>" : "") + "</li>";
}
function formList(items, ctx) {
  if (!items.length) return "<p>" + esc(ctx.labels.form_none) + "</p>\n";
  var s = { n: 0, w: 0, d: 0, l: 0 };
  items.forEach(function (it) { if (it.result) { s.n++; s[it.result === "W" ? "w" : it.result === "D" ? "d" : "l"]++; } });
  return (s.n ? "<p>" + esc(fill(ctx.labels.form_summary, s)) + "</p>\n" : "") +
    '<ul class="mini">' + items.map(function (it) { return miniRow(it, ctx); }).join("") + "</ul>\n";
}
// Sequence de forme (plus ancien d'abord) depuis les derniers resultats (plus recent d'abord).
function formSeqOf(items) { return (items || []).slice(0, 5).map(function (it) { return it.result; }).filter(Boolean).reverse(); }

function rowOf(group, teamId) { return group && group.rows.filter(function (r) { return r.teamId === teamId; })[0] || null; }
function positionSentence(group, teamId, team, ctx) {
  var row = rowOf(group, teamId);
  if (!row || row.rank == null) return "";
  return fill(ctx.labels.table_position, { team: nameOf(team, ctx), rank: row.rank, total: group.rows.length, points: row.points, played: row.played });
}
function rankChip(group, teamId, ctx) {
  var row = rowOf(group, teamId);
  return row && row.rank != null && row.points != null ? fill(ctx.labels.rank_short, { rank: row.rank, points: row.points }) : "";
}

function tableBlock(group, highlight, ctx, leagueName) {
  var L = ctx.labels;
  if (!group || !group.rows.length) return "<p>" + esc(fill(L.table_none, { league: leagueName })) + "</p>\n";
  var caption = [group.name || group.league || leagueName, group.season ? String(group.season) : null].filter(Boolean).join(" · ");
  var rows = group.rows.map(function (r) {
    var link = ctx.clubLinks[r.teamId];
    return {
      rank: r.rank, id: r.teamId, name: nameOf({ id: r.teamId, name: r.name }, ctx), href: link && link !== ctx.path ? link : null,
      played: r.played != null ? r.played : "", wdl: [r.win, r.draw, r.lose].map(function (v) { return v != null ? v : "?"; }).join("-"),
      gd: signed(r.gd), pts: r.points != null ? r.points : "", form: UI.formSeq(r.form), zone: UI.zoneOf(r.description), me: highlight.indexOf(r.teamId) !== -1
    };
  });
  return (group.partial ? '<p class="note">' + esc(L.table_partial) + "</p>\n" : "") +
    UI.standingsTable({ caption: caption, ths: [L.col_rank, L.col_team, L.col_played, L.col_wdl, L.col_gd, L.col_pts], rows: rows }, uiLabels(ctx)) + "\n";
}
function hasForm(group) { return !!(group && group.rows.some(function (r) { return r.form; })); }

function factsBlock(info, ctx) {
  if (!info) return "";
  var L = ctx.labels, dir = ctx.dir, v = info.venue || {};
  var rows = [];
  if (info.founded) rows.push([L.founded, String(info.founded)]);
  if (v.name) rows.push([L.stadium, v.name]);
  if (v.capacity) rows.push([L.capacity, numText(v.capacity, dir)]);
  if (v.city) rows.push([L.city, v.city]);
  if (!rows.length) return "";
  return '<dl class="facts">' + rows.map(function (r) { return "<div><dt>" + esc(r[0]) + "</dt><dd>" + esc(r[1]) + "</dd></div>"; }).join("") + "</dl>\n" +
    '<p class="note">' + esc(L.facts_source) + "</p>\n";
}

function relatedBlock(ctx) {
  if (!ctx.related.length) return "";
  return UI.section(null, ctx.labels.related_title, '<p class="others">' + ctx.related.map(function (r) {
    return '<a href="' + r.href + '">' + esc(r.label) + "</a>";
  }).join("") + "</p>");
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
  var L = ctx.labels, U = uiLabels(ctx), t = ctx.text, team = ctx.teams[0];
  var crumbs = crumbItems(ctx);
  var sportsTeam = Object.assign({ "@context": "https://schema.org", "@id": abs(ctx.path) + "#team" }, teamLd(team, ctx), { url: abs(ctx.path) });
  var ld = [C.breadcrumbLd(crumbs), sportsTeam].concat(eventsLd(ctx.upcoming, ctx));
  var leagueName = ctx.league.name;
  var pos = positionSentence(ctx.group, team.id, team, ctx);
  var rank = rankChip(ctx.group, team.id, ctx);
  var seq = formSeqOf(team.form);
  var hero = '<div class="hero"><div class="hero-top">' + UI.crest(team.id, nameOf(team, ctx), "xl", { eager: true }) +
    '<div class="chips">' + UI.chip(leagueName, ctx.league.hubPath) + (rank ? UI.chip(rank) : "") +
    (seq.length ? '<span class="chip">' + esc(L.form_col) + " " + UI.formPills(seq, U, L.form_all_note) + "</span>" : "") + "</div></div>\n" +
    "<h1>" + esc(t.h1) + "</h1>\n" + '<p class="intro">' + esc(t.intro) + "</p>\n" +
    '<div class="meta-row"><p class="age">' + esc(L.age) + "</p>\n" + asOfHtml(ctx) + "</div></div>\n";
  var jump = [["fixtures", L.jump.fixtures], ["table", L.jump.table], ["form", L.jump.form]];
  if (team.info) jump.push(["facts", L.jump.facts]);
  var body = headerHtml(ctx) + "<main>\n" + crumbsHtml(crumbs, ctx) + hero + UI.jumpNav(jump, L.jump_aria) +
    UI.section("fixtures", L.upcoming_title, fixturesBody(ctx.upcoming, ctx, L.upcoming_none, "club"), kickoffNote(ctx.upcoming, ctx)) +
    '<div class="cols">' +
    UI.section("table", fill(L.table_title, { league: leagueName }), (pos ? '<p class="pos-line">' + esc(pos) + "</p>\n" : "") + tableBlock(ctx.group, [team.id], ctx, leagueName) +
      (hasForm(ctx.group) ? '<p class="note">' + esc(L.form_note) + "</p>\n" : "")) +
    "<div>" +
    UI.section("form", L.form_title, '<div class="team">' + formList(team.form, ctx) + "</div>") +
    (team.info ? UI.section("facts", L.facts_title, factsBlock(team.info, ctx)) : "") +
    "</div></div>\n" +
    relatedBlock(ctx) + "</main>\n" + footerHtml(ctx);
  return headHtml(Object.assign({}, ctx, { image: team.info && team.info.logo }), ld) + body + TAIL;
}

function renderDerbyPage(ctx) {
  var L = ctx.labels, U = uiLabels(ctx), t = ctx.text;
  var a = ctx.teams[0], b = ctx.teams[1];
  var crumbs = crumbItems(ctx);
  var page = {
    "@context": "https://schema.org", "@type": "WebPage", "@id": abs(ctx.path) + "#webpage", url: abs(ctx.path),
    name: t.title, description: t.description, inLanguage: C.DIRS[ctx.dir].htmlLang,
    about: [teamLd(a, ctx), teamLd(b, ctx)]
  };
  // Affiche derby : un seul SportsEvent, la prochaine confrontation reelle
  // (calendrier api-football ou donnees publiques). Aucune si rien n'est programme.
  var ld = [C.breadcrumbLd(crumbs), page].concat(eventsLd(ctx.upcoming.slice(0, 1), ctx));
  var leagueName = ctx.league.name;
  var h = ctx.h2h;
  // ctx.groups (derby splitStandings) : chaque club dans son propre groupe.
  var groupOf = function (i) { return ctx.groups ? ctx.groups[i] : ctx.group; };
  function side(tm, i) {
    var link = ctx.clubLinks[tm.id], nm = nameOf(tm, ctx), rank = rankChip(groupOf(i), tm.id, ctx);
    return '<div class="side">' + UI.crest(tm.id, nm, "xl", { eager: true }) +
      (link ? '<a class="nm" href="' + link + '">' + esc(nm) + "</a>" : '<span class="nm">' + esc(nm) + "</span>") +
      (rank ? '<span class="sub">' + esc(rank) + "</span>" : "") + UI.formPills(formSeqOf(tm.form), U, L.form_all_note) + "</div>";
  }
  var hero = '<div class="hero"><div class="chips">' + UI.chip(leagueName, ctx.league.hubPath) + UI.chip(L.derby_label) + '<p class="age">' + esc(L.age) + "</p></div>\n" +
    "<h1>" + esc(t.h1) + "</h1>\n" +
    '<div class="duel">' + side(a, 0) + '<span class="vs" aria-hidden="true">VS</span>' + side(b, 1) + "</div>\n" +
    (ctx.asOf ? '<div class="meta-row">' + asOfHtml(ctx) + "</div>" : "") + "</div>\n" +
    '<p class="intro">' + esc(t.intro) + "</p>\n";
  var h2hHtml;
  if (h.items.length) {
    var s = h.summary, total = s.winsA + s.draws + s.winsB;
    var bar = total ? '<div class="bar" aria-hidden="true">' + [["a", s.winsA], ["d", s.draws], ["b", s.winsB]].filter(function (x) { return x[1]; })
      .map(function (x) { return '<span class="seg-' + x[0] + '" style="flex:' + x[1] + '"></span>'; }).join("") + "</div>" +
      '<ul class="bar-legend"><li><b>' + s.winsA + "</b><span>" + esc(fill(L.wins_of, { team: nameOf(a, ctx) })) + "</span></li><li><b>" + s.draws + "</b><span>" + esc(L.draws_label) +
      "</span></li><li><b>" + s.winsB + "</b><span>" + esc(fill(L.wins_of, { team: nameOf(b, ctx) })) + "</span></li></ul>" : "";
    h2hHtml = '<div class="h2h"><p>' + esc(fill(L.h2h_summary, { n: s.n, a: nameOf(a, ctx), b: nameOf(b, ctx), wa: s.winsA, wb: s.winsB, d: s.draws })) + "</p>" + bar +
      '<ul class="res">' + h.items.map(function (it) {
        return UI.resultRow({
          home: { id: it.home.id, name: nameOf(it.home, ctx) }, away: { id: it.away.id, name: nameOf(it.away, ctx) }, gh: it.gh, ga: it.ga,
          iso: it.date ? iso(it.date) : null, date: it.date ? dayText(it.date, ctx.dir, ctx.tz) : "", meta: [it.league, it.round].filter(Boolean).join(" · "),
          pens: it.pens ? "(" + L.pens + " " + it.pens.home + "–" + it.pens.away + ")" : null
        }, U);
      }).join("") + "</ul></div>\n";
  } else {
    h2hHtml = "<p>" + esc(L.h2h_none) + "</p>\n";
  }
  var positions = [a, b].map(function (tm, i) { return positionSentence(groupOf(i), tm.id, tm, ctx); }).filter(Boolean);
  var split = ctx.groups && ctx.groups[0] && ctx.groups[1] && ctx.groups[0].name !== ctx.groups[1].name;
  var tables = split
    ? tableBlock(ctx.groups[0], [a.id, b.id], ctx, leagueName) + tableBlock(ctx.groups[1], [a.id, b.id], ctx, leagueName)
    : tableBlock(ctx.groups ? (ctx.groups[0] || ctx.groups[1]) : ctx.group, [a.id, b.id], ctx, leagueName);
  var anyForm = ctx.groups ? ctx.groups.some(hasForm) : hasForm(ctx.group);
  var cards = [a, b].map(function (tm) {
    var link = ctx.clubLinks[tm.id], nm = nameOf(tm, ctx);
    var title = link ? '<a href="' + link + '">' + esc(nm) + "</a>" : esc(nm);
    return '<div class="team"><div class="team-h">' + UI.crest(tm.id, nm, "lg") + "<h3>" + title + "</h3></div>\n" + formList(tm.form, ctx) + factsBlock(tm.info, ctx) + "</div>";
  }).join("\n");
  var jump = [["fixtures", L.jump.fixtures], ["h2h", L.jump.h2h], ["table", L.jump.table], ["teams", L.jump.teams]];
  var body = headerHtml(ctx) + "<main>\n" + crumbsHtml(crumbs, ctx) + hero + UI.jumpNav(jump, L.jump_aria) +
    '<div class="cols flip"><div>' +
    UI.section("fixtures", L.next_meeting_title, fixturesBody(ctx.upcoming, ctx, L.next_meeting_none, "derby"), kickoffNote(ctx.upcoming, ctx)) +
    UI.section("h2h", L.h2h_title, h2hHtml) +
    "</div>" +
    UI.section("table", fill(L.table_title, { league: leagueName }), positions.map(function (p) { return '<p class="pos-line">' + esc(p) + "</p>\n"; }).join("") + tables +
      (anyForm ? '<p class="note">' + esc(L.form_note) + "</p>\n" : "")) +
    "</div>\n" +
    UI.section("teams", L.teams_title, '<div class="grid2">\n' + cards + "\n</div>\n") +
    relatedBlock(ctx) + "</main>\n" + footerHtml(ctx);
  return headHtml(ctx, ld) + body + TAIL;
}

// ctx : { dir, version, labels, path, text, clubs:[{name, href, league, next, teamIds}], derbies:[...], related, noindex }
function renderHubPage(ctx) {
  var L = ctx.labels, U = uiLabels(ctx), t = ctx.text, dir = ctx.dir;
  var s = C.seoConf(dir);
  var crumbs = [{ name: s.breadcrumb.home, url: abs(C.homePath(dir)) }, { name: L.hub_crumb, url: abs(ctx.path) }];
  var items = ctx.clubs.concat(ctx.derbies);
  var page = {
    "@context": "https://schema.org", "@type": "CollectionPage", "@id": abs(ctx.path) + "#webpage", url: abs(ctx.path),
    name: t.title, description: t.description, inLanguage: C.DIRS[dir].htmlLang, isPartOf: { "@id": C.SITE_URL + "/#website" },
    mainEntity: { "@type": "ItemList", itemListElement: items.map(function (it, i) { return { "@type": "ListItem", position: i + 1, url: abs(it.href), name: it.name }; }) }
  };
  function grid(list, kind) {
    return UI.clubGrid(list.map(function (it) {
      var next = it.next ? fill(L.hub_next, { date: whenText(it.next, dir, it.tz) + (it.tzLabel ? " (" + it.tzLabel + ")" : "") }) : L.hub_no_next;
      return {
        href: it.href, name: it.name, kind: kind, ids: it.teamIds || [], sub: it.league,
        metaHtml: it.next ? '<time datetime="' + iso(it.next) + '">' + esc(next) + "</time>" : esc(next)
      };
    }), U) + "\n";
  }
  var jump = [];
  if (ctx.clubs.length) jump.push(["clubs", L.clubs_title]);
  if (ctx.derbies.length) jump.push(["derbies", L.derbies_title]);
  var body = headerHtml(ctx) + "<main>\n" + crumbsHtml(crumbs, ctx) +
    '<div class="hero"><h1>' + esc(t.h1) + "</h1>\n" + '<p class="intro">' + esc(t.intro) + "</p>\n" +
    '<div class="meta-row"><p class="age">' + esc(L.age) + "</p>\n" + asOfHtml(ctx) + "</div></div>\n" +
    (jump.length > 1 ? UI.jumpNav(jump, L.jump_aria) : "") +
    (ctx.clubs.length ? UI.section("clubs", L.clubs_title, grid(ctx.clubs, "club")) : "") +
    (ctx.derbies.length ? UI.section("derbies", L.derbies_title, grid(ctx.derbies, "derby")) : "") +
    '<p class="note hub-note">' + esc(fill(L.kickoff_note, { tz: s.tz_label })) + "</p>\n" +
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
  CSS: UI.CSS_HREF, hubPath: hubPath, pagePath: pagePath, abs: abs,
  renderClubPage: renderClubPage, renderDerbyPage: renderDerbyPage, renderHubPage: renderHubPage,
  findPremiumLeak: findPremiumLeak, PREMIUM_ALL: PREMIUM_ALL, stripVolatile: stripVolatile, isNoindex: isNoindex,
  whenText: whenText, dayText: dayText
};
