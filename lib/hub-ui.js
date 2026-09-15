"use strict";
// Composants HTML partages des pages championnat (scripts/seo-pages.js#renderLeagueHub),
// club, derby et index clubs (lib/club-hub-render.js). Presentation v2 validee par le
// proprietaire le 15/09/2026. Rendu pur : aucune lecture disque, aucun reseau.
//
// Donnees PUBLIQUES uniquement : equipes, dates, stades, scores, classement,
// forme, zones de classement. Jamais de note sur 10 ni de probabilite, meme pour
// le match offert : un match analyse affiche seulement « Analyse disponible » et
// un lien vers sa page. Seul attribut data-* produit : data-i (initiales d'un
// ecusson sans image) ; findPremiumLeak (lib/club-hub-render.js) refuserait
// data-conf, data-val, etc.
//
// Styles : /assets/league-hub.v1.css (nom versionne : /assets/* est servi en
// cache immutable, changer de nom a chaque modification).

const CSS_HREF = "/assets/league-hub.v1.css";
const TEAM_LOGO = "https://media.api-sports.io/football/teams/";
const LEAGUE_LOGO = "https://media.api-sports.io/football/leagues/";
// Taille rendue de l'image dans l'ecusson (width/height : aucun decalage de mise en page).
const CREST_PX = { sm: 18, md: 22, lg: 32, xl: 88 };

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fill(tpl, vars) {
  return String(tpl == null ? "" : tpl).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
}

function initials(name) {
  var w = String(name || "").replace(/[.\-]/g, " ").split(/\s+/).filter(function (x) {
    return x && !/^(fc|cf|as|ac|sc|club|de|du|la|le|des|of|the|u|n|a|m|losc|rc)$/i.test(x);
  });
  if (!w.length) return String(name || "?").slice(0, 2).toUpperCase();
  return (w.length > 1 ? w[0][0] + w[1][0] : w[0].slice(0, 2)).toUpperCase();
}
function validId(id) { return id != null && /^\d{1,9}$/.test(String(id)); }

// Ecusson : image api-sports (autorisee par la CSP) de taille fixe, differee sauf
// au-dessus de la ligne de flottaison (opts.eager) ; initiales sans identifiant.
function crest(id, name, cls, opts) {
  opts = opts || {};
  var size = cls && CREST_PX[cls] ? cls : "md";
  var klass = "crest" + (cls && cls !== "md" ? " " + cls : "");
  if (!validId(id)) return '<i class="' + klass + '" data-i="' + esc(initials(name)) + '"></i>';
  var px = CREST_PX[size];
  return '<i class="' + klass + '"><img src="' + TEAM_LOGO + Number(id) + '.png" width="' + px + '" height="' + px + '" alt=""' +
    (opts.eager ? ' fetchpriority="high"' : ' loading="lazy"') + ' decoding="async"></i>';
}
function leagueLogo(apiId, opts) {
  if (!validId(apiId)) return "";
  opts = opts || {};
  return '<span class="lg-logo"><img src="' + LEAGUE_LOGO + Number(apiId) + '.png" width="46" height="46" alt=""' +
    (opts.eager === false ? ' loading="lazy"' : ' fetchpriority="high"') + ' decoding="async"></span>';
}

// Forme api-football : chaine la plus recente EN PREMIER ("WLDD") -> sequence
// chronologique (plus ancien d'abord), 5 au plus. Tout autre caractere : ignore.
function formSeq(s) {
  var clean = String(s || "").toUpperCase().replace(/[^WDL]/g, "").slice(0, 5);
  return clean ? clean.split("").reverse() : [];
}
// seq : W/D/L du plus ancien au plus recent (la derniere pastille est encadree).
function formPills(seq, L, label) {
  seq = (seq || []).filter(function (c) { return c === "W" || c === "D" || c === "L"; });
  if (!seq.length) return "";
  var pills = seq.map(function (c) { return '<b class="f f-' + c + '">' + esc(L.result[c]) + "</b>"; }).join("");
  if (label === false) return '<span class="form" aria-hidden="true">' + pills + "</span>" +
    '<span class="sr">' + esc(seq.map(function (c) { return L.result_long[c]; }).join(", ")) + "</span>";
  return '<span class="form" role="img" aria-label="' + esc((label || L.form) + (L.colon || " : ") + seq.map(function (c) { return L.result_long[c]; }).join(", ")) + '">' + pills + "</span>";
}

function analysisPill(href, L, asLink) {
  return asLink && href
    ? '<a class="pill-ok" href="' + esc(href) + '">' + esc(L.analysis_available) + "</a>"
    : '<span class="pill-ok">' + esc(L.analysis_available) + "</span>";
}

// e : { iso, day, clock, home:{id,name}, away:{id,name}, meta, href, pending }
function fixtureCard(e, L) {
  var inner = '<time datetime="' + esc(e.iso) + '"><b>' + esc(e.day) + "</b><span>" + esc(e.clock) + "</span></time>" +
    '<span class="tm-row">' + crest(e.home.id, e.home.name) + '<span class="n">' + esc(e.home.name) + "</span></span>" +
    '<span class="sr"> ' + esc(L.vs) + " </span>" +
    '<span class="tm-row">' + crest(e.away.id, e.away.name) + '<span class="n">' + esc(e.away.name) + "</span></span>" +
    (e.meta ? '<span class="fxc-meta">' + esc(e.meta) + "</span>" : "") +
    (e.href ? '<span class="fxc-foot">' + analysisPill(null, L, false) + "</span>"
      : e.pending ? '<span class="fxc-foot"><span class="pending">' + esc(e.pending) + "</span></span>" : "");
  return "<li>" + (e.href ? '<a class="fxc" href="' + esc(e.href) + '">' + inner + "</a>" : '<div class="fxc">' + inner + "</div>") + "</li>";
}
function rail(list, L, label) {
  return '<div class="rail-wrap"><ul class="rail" tabindex="0" aria-label="' + esc(label) + '">' + list.map(function (e) { return fixtureCard(e, L); }).join("") + "</ul></div>";
}

// r : { home:{id,name}, away:{id,name}, gh, ga, iso, date, meta, pens, href }
// La ligne complete « A 2–1 B » reste en texte (.sr) pour lecteurs d'ecran, robots et tests.
function resultRow(r, L) {
  var line = function (t, g, win) {
    return '<span class="rs-l' + (win ? " win" : "") + '">' + crest(t.id, t.name, "sm") + '<span class="n">' + esc(t.name) + "</span><b>" + g + "</b></span>";
  };
  var scored = r.gh != null && r.ga != null;
  var inner = '<span class="sr">' + esc(scored ? r.home.name + " " + r.gh + "–" + r.ga + " " + r.away.name : r.home.name + " " + L.vs + " " + r.away.name) + (r.pens ? " " + esc(r.pens) : "") + "</span>" +
    '<span class="rs-t" aria-hidden="true">' + line(r.home, scored ? r.gh : "", scored && r.gh > r.ga) + line(r.away, scored ? r.ga : "", scored && r.ga > r.gh) + "</span>" +
    '<span class="rs-meta">' + (r.iso ? '<time datetime="' + esc(r.iso) + '">' + esc(r.date) + "</time>" : esc(r.date || "")) +
    (r.meta ? "<span>" + esc(r.meta) + "</span>" : "") + (r.pens ? '<span aria-hidden="true">' + esc(r.pens) + "</span>" : "") +
    (r.href ? analysisPill(null, L, false) : "") + "</span>";
  return "<li>" + (r.href ? '<a class="rs" href="' + esc(r.href) + '">' + inner + "</a>" : '<div class="rs">' + inner + "</div>") + "</li>";
}

// Zone de classement depuis la description api-football (donnee publique, en anglais).
function zoneOf(desc) {
  var d = String(desc || "").toLowerCase();
  if (!d.trim()) return null;
  if (/relegation play/.test(d)) return "relpo";
  if (/relegation/.test(d)) return "rel";
  if (/liga mx/.test(d) && /play ?-?offs?/.test(d)) return "lig";
  if (/champions league/.test(d)) return "ucl";
  if (/europa league/.test(d)) return "uel";
  if (/conference league/.test(d)) return "uecl";
  if (/libertadores/.test(d)) return "lib";
  if (/sudamericana/.test(d)) return "sud";
  if (/qualif/.test(d)) return "q";
  if (/play ?-?offs?|promotion/.test(d)) return "po";
  return null;
}

// tb : { caption, ths:[rang, club, joues, v-n-d, diff, pts], rows:[{ rank, id, name, href, played, wdl, gd, pts, form:[], zone, me }] }
// <table> SANS attribut : tests/seo-pages.test.js et tests/club-hubs-seo.test.js le cherchent tel quel.
function standingsTable(tb, L) {
  var zones = [], withForm = tb.rows.some(function (r) { return r.form && r.form.length; });
  var rows = tb.rows.map(function (r) {
    if (r.zone && zones.indexOf(r.zone) === -1) zones.push(r.zone);
    var cls = [r.zone ? "z-" + r.zone : null, r.me ? "me" : null].filter(Boolean).join(" ");
    var club = crest(r.id, r.name, "sm") + '<span class="n">' + esc(r.name) + "</span>";
    return "<tr" + (cls ? ' class="' + cls + '"' : "") + '><td class="pos"><span class="rk">' + (r.rank != null ? r.rank : "") + '</span></td><td class="t">' +
      (r.href ? '<a href="' + esc(r.href) + '">' + club + "</a>" : '<span class="club">' + club + "</span>") + "</td><td>" + esc(r.played) + "</td><td>" + esc(r.wdl) + "</td><td>" + esc(r.gd) +
      '</td><td class="pts">' + esc(r.pts) + "</td>" + (withForm ? "<td>" + formPills(r.form, L, false) + "</td>" : "") + "</tr>";
  }).join("");
  var th = tb.ths;
  var order = ZONE_ORDER.filter(function (z) { return zones.indexOf(z) !== -1; });
  return '<div class="tbl" tabindex="0" role="region" aria-label="' + esc(tb.caption) + '"><table><caption>' + esc(tb.caption) + "</caption><thead><tr>" +
    '<th class="pos" scope="col">' + esc(th[0]) + '</th><th class="t" scope="col">' + esc(th[1]) + '</th><th scope="col">' + esc(th[2]) + '</th><th scope="col">' + esc(th[3]) +
    '</th><th scope="col">' + esc(th[4]) + '</th><th scope="col">' + esc(th[5]) + "</th>" + (withForm ? '<th scope="col">' + esc(L.form) + "</th>" : "") +
    "</tr></thead><tbody>" + rows + "</tbody></table></div>" +
    (order.length ? '<ul class="legend">' + order.map(function (z) { return '<li><i class="z-' + z + '"></i>' + esc(L.zones[z]) + "</li>"; }).join("") + "</ul>" : "");
}
const ZONE_ORDER = ["ucl", "q", "uel", "uecl", "lib", "sud", "po", "lig", "relpo", "rel"];

// items : { href, name, kind ("club" | "derby"), ids:[...], sub (texte), metaHtml (HTML deja echappe) }
function clubGrid(items, L) {
  return '<ul class="clubs">' + items.map(function (c) {
    var ids = (c.ids || []).filter(validId);
    var art = c.kind === "derby" && ids.length > 1
      ? '<span class="duo">' + ids.slice(0, 2).map(function (id) { return crest(id, c.name, "lg"); }).join("") + "</span>"
      : crest(ids[0], c.name, "lg");
    return '<li><a class="cc" href="' + esc(c.href) + '">' + art + '<span class="n"><small>' + esc(c.sub != null ? c.sub : (c.kind === "derby" ? L.derby_label : L.club_label)) + "</small>" + esc(c.name) +
      (c.metaHtml ? '<span class="cc-meta">' + c.metaHtml + "</span>" : "") + "</span></a></li>";
  }).join("") + "</ul>";
}

// items : [[id, libelle], ...]
function jumpNav(items, aria) {
  if (!items.length) return "";
  return '<nav class="jump" aria-label="' + esc(aria) + '">' + items.map(function (x) { return '<a href="#' + esc(x[0]) + '">' + esc(x[1]) + "</a>"; }).join("") + "</nav>\n";
}
// title et note : texte brut (echappe ici) ; body : HTML.
function section(id, title, body, note) {
  return '<section class="sec"><div class="sec-h"><h2' + (id ? ' id="' + esc(id) + '"' : "") + ">" + esc(title) + "</h2>" + (note ? '<p class="note">' + esc(note) + "</p>" : "") + "</div>" + body + "</section>\n";
}
function chip(text, href, cls) {
  var k = "chip" + (cls ? " " + cls : "");
  return href ? '<a class="' + k + '" href="' + esc(href) + '">' + esc(text) + "</a>" : '<span class="' + k + '">' + esc(text) + "</span>";
}
function kpis(items) {
  items = items.filter(function (x) { return x && x[1] != null && x[1] !== ""; });
  if (!items.length) return "";
  return '<dl class="kpis">' + items.map(function (x) { return "<div><dt>" + esc(x[0]) + "</dt><dd>" + x[1] + "</dd></div>"; }).join("") + "</dl>";
}

module.exports = {
  CSS_HREF: CSS_HREF, TEAM_LOGO: TEAM_LOGO, LEAGUE_LOGO: LEAGUE_LOGO, esc: esc, fill: fill, initials: initials,
  crest: crest, leagueLogo: leagueLogo, formSeq: formSeq, formPills: formPills, analysisPill: analysisPill,
  fixtureCard: fixtureCard, rail: rail, resultRow: resultRow, zoneOf: zoneOf, standingsTable: standingsTable,
  clubGrid: clubGrid, jumpNav: jumpNav, section: section, chip: chip, kpis: kpis
};
