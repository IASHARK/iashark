#!/usr/bin/env node
"use strict";
// Pages SEO statiques generees depuis les donnees PUBLIQUES du pipeline :
//
// 1. Pages match /<dir>/match/<id>.html pour chaque repertoire hors x-default
//    (en es de it pt gb za mx), en plus de /match/<id>.html (francais,
//    x-default). Meme coquille match.html, meme PRELOADED_MATCH que la page
//    FR (PUBLIC_SPLIT.toListMatch sur la copie assainie matchsPublics : aucun
//    champ premium hors match offert), mais <head>, resume et bloc
//    d'informations rediges dans la langue du repertoire, hreflang
//    reciproques entre les 9 versions, JSON-LD SportsEvent + BreadcrumbList.
//    Pourquoi : la page FR (lang="fr") ne pouvait pas repondre a
//    "Arsenal vs Chelsea prediction" ou "pronóstico América vs Chivas".
// 2. Pages championnat /<dir>/leagues/<slug>.html (competitions de
//    config/leagues.json x 9 repertoires) : presentation factuelle, matchs des
//    14 prochains jours, derniers resultats, classement, pages club et derby,
//    methode, guides (contenu STABLE : scripts/league-hub-data.js). Jamais de
//    probabilite ni de pari : ce sont des donnees reservees (mur Pro de
//    match-page.js). Indexable si la version est dans le perimetre de la
//    competition ET si ce contenu stable existe (classement d'au moins
//    MIN_HUB_STANDING_ROWS lignes, une page club, ou MIN_HUB_FIXTURES
//    rencontres a venir ou jouees) - plus jamais selon les seuls matchs du jour.
// 3. sitemap-matches-i18n.xml et sitemap-leagues.xml, lastmod exact
//    (scripts/seo-lastmod.js).
//
// Appele par le pipeline (.github/workflows/update-data.yml#generateMatchPages)
// avec matchsPublics. En local : node scripts/seo-pages.js (source =
// match/<id>.json, la meme copie assainie deja publiee) regenere aussi les
// pages FR /match/<id>.html avec exactement la meme composition.
const fs = require("fs");
const path = require("path");
const C = require("./seo-common.js");
const PUBLIC_SPLIT = require("../lib/public-data-split.js");
// Liste unique des champs premium : PRELOADED_MATCH n en porte jamais hors
// match offert, meme si l appelant passe un match non assaini.
const PREMIUM = require("../lib/premium-fields.js");
const MATCH_TIME = require("../lib/match-time.js");
const LEAGUE_NAMES = require("../lib/league-names.js");
const LASTMOD = require("./seo-lastmod.js");
// Cycle de vie des pages match (registre, perimetre des versions, 301).
const LIFECYCLE = require("./match-lifecycle.js");
// Contenu stable des pages championnat (calendrier 14 jours, resultats, classement, clubs).
const HUBDATA = require("./league-hub-data.js");

const SITE_URL = C.SITE_URL, DIRS = C.DIRS, DIR_CODES = C.DIR_CODES, X_DEFAULT_DIR = C.X_DEFAULT_DIR;
const esc = C.escHtml;
const MIN_HUB_FIXTURES = 3;
const MIN_HUB_STANDING_ROWS = 4;
const DESCRIPTION_MAX = 155;
// Contenu PROPRE d'une page match (faits specifiques : equipes, competition,
// horaire, stade, forme, classement, confrontations directes, compositions)
// sous ce nombre de mots -> noindex,follow et hors sitemap. Le texte generique
// (presentation IASHARK, liens, avertissement) n'est pas compte.
const MIN_INDEXABLE_WORDS = 80;
const MATCH_GUIDE = "prediction-ia-football-guide-2026.html";
const HUB_GUIDES = ["plus-de-2-5-buts-probabilite-methode-poisson.html", "xg-expected-goals-guide-complet.html"];

var buildLocalesLib = null;
function B() { return buildLocalesLib || (buildLocalesLib = require("./build-locales.js")); }

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === content) return false;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return true;
}

// ---------------------------------------------------------------------------
// Donnees d'un match (dates du pipeline = heure de Paris, lib/match-time.js).
function validMatch(m) {
  return !!(m && m.id != null && PUBLIC_SPLIT.isSafeId(m.id) && m.home && m.away && m.home.n && m.away.n);
}
function kickoff(m) { return MATCH_TIME.parseParis(m && m.date); }
function isoInstant(d) { return d.toISOString().replace(/\.\d{3}Z$/, "Z"); }
function fmt(d, dir, opts) {
  var o = Object.assign({ timeZone: C.seoConf(dir).tz }, opts);
  try { return new Intl.DateTimeFormat(DIRS[dir].intlLocale, o).format(d); } catch (e) { return isoInstant(d); }
}
function longDate(d, dir) { return fmt(d, dir, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
function shortDate(d, dir) { return fmt(d, dir, { day: "numeric", month: "long", year: "numeric" }); }
function clock(d, dir) { return fmt(d, dir, { hour: "2-digit", minute: "2-digit" }); }
function leagueName(m) { return (LEAGUE_NAMES.displayName(m.league_key, m.league) || "").trim(); }
function hubKey(m) { return C.leagueByKey(m.league_key) ? m.league_key : null; }
// "<equipe> (domicile)" = repli du pipeline quand api-football ne donne pas de
// stade : texte francais, jamais un vrai lieu -> stade inconnu.
function venue(m) { return m.stade && typeof m.stade.nom === "string" && m.stade.nom.trim() && !/\(domicile\)\s*$/i.test(m.stade.nom) ? m.stade.nom.trim() : null; }
function teams(m) { return m.home.n + " vs " + m.away.n; }

function cleanTpl(s) {
  // Competition inconnue : "( )" et ", ," laisses par un {league} vide.
  return s.replace(/\s*\(\s*\)/g, "").replace(/,\s*,/g, ",").replace(/\s+([:,])/g, function (m, p) { return p === ":" ? " :" : p; }).replace(/\s{2,}/g, " ").trim();
}
function matchVars(m, dir) {
  var d = kickoff(m);
  return { home: m.home.n, away: m.away.n, league: leagueName(m), date: d ? shortDate(d, dir) : "" };
}
// Titre <= 60 caracteres : gabarit complet + marque, sans la marque (Google
// affiche deja le nom du site au-dessus du lien), gabarit court, puis minimal
// (noms d'equipes a rallonge). Description <= 155 : complete, courte, puis courte sans competition.
var TITLE_SOFT_MAX = 60;
function matchTitle(m, dir) {
  var ms = C.seoConf(dir).match, v = matchVars(m, dir);
  var t = cleanTpl(C.fill(ms.title, v));
  return C.fitText([t + " | IASHARK", t, cleanTpl(C.fill(ms.title_short, v)), cleanTpl(C.fill(ms.title_min, v))], TITLE_SOFT_MAX);
}
function matchDescription(m, dir) {
  var ms = C.seoConf(dir).match, v = matchVars(m, dir);
  // Dernier recours (noms d'equipes ET competition a rallonge, ex. Instituto
  // Cordoba vs Estudiantes de Rio Cuarto, Liga Profesional Argentina) : gabarit
  // court sans la competition (cleanTpl retire les parentheses vides).
  return C.fitText([cleanTpl(C.fill(ms.description, v)), cleanTpl(C.fill(ms.description_short, v)),
    cleanTpl(C.fill(ms.description_short, Object.assign({}, v, { league: "" })))], DESCRIPTION_MAX);
}
function matchImage(m) { return m.home && m.home.id ? "https://media.api-sports.io/football/teams/" + m.home.id + ".png" : null; }

function matchCrumbs(m, dir) {
  var s = C.seoConf(dir);
  var items = [{ name: s.breadcrumb.home, url: SITE_URL + C.homePath(dir) }];
  var k = hubKey(m);
  if (k) items.push({ name: leagueName(m), url: SITE_URL + C.leagueHubPath(dir, k) });
  items.push({ name: teams(m), url: SITE_URL + C.matchPath(dir, m.id) });
  return items;
}

// JSON-LD SportsEvent : uniquement ce qui est reellement connu et affiche.
// startDate = instant reel avec fuseau (les dates du pipeline sont en heure de
// Paris : l'ancien gabarit y collait "Z", une a deux heures d'erreur).
function matchEvent(m, dir, opts) {
  var d = kickoff(m), v = venue(m), ln = leagueName(m), entry = opts && opts.entry;
  var url = SITE_URL + C.matchPath(dir, m.id);
  var ev = {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    "@id": url + "#event",
    name: teams(m),
    description: matchDescription(m, dir),
    url: url,
    inLanguage: DIRS[dir].htmlLang,
    sport: C.seoConf(dir).sport,
    homeTeam: { "@type": "SportsTeam", name: m.home.n },
    awayTeam: { "@type": "SportsTeam", name: m.away.n },
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode"
  };
  if (d) ev.startDate = isoInstant(d);
  // schema.org n'a pas de statut "termine" : un match joue comme prevu garde
  // EventScheduled. Un coup d'envoi deplace entre deux runs (registre
  // data/match-pages-registry.json) est declare EventRescheduled.
  if (entry && entry.previous_kickoff && entry.kickoff && entry.previous_kickoff !== entry.kickoff) {
    ev.eventStatus = "https://schema.org/EventRescheduled";
    ev.previousStartDate = entry.previous_kickoff;
  }
  if (v) ev.location = { "@type": "Place", name: v };
  if (ln) ev.superEvent = { "@type": "SportsEvent", name: ln };
  return ev;
}
function matchJsonLd(m, dir, opts) { return JSON.stringify(matchEvent(m, dir, opts)).replace(/</g, "\\u003c"); }
// Versions reellement generees pour ce match (config/leagues.json#seoMatchDirs,
// fr toujours). hreflang, sitemaps et liens internes ne visent qu'elles.
function matchDirs(m) { return LIFECYCLE.matchDirsFor(m && m.league_key); }
function hasMatchVersion(m, dir) { return matchDirs(m).indexOf(dir) !== -1; }
function matchAlternates(m) {
  var isObj = !!m && typeof m === "object";
  var id = isObj ? m.id : m;
  return C.alternatesFor(function (d) { return C.matchPath(d, id); }, isObj ? matchDirs(m) : [X_DEFAULT_DIR]);
}

// Complements du <head> ajoutes apres le bloc meta historique : hreflang des
// 9 versions, og:site_name/og:locale, fil d'Ariane.
function matchHeadExtras(m, dir) {
  return C.hreflangLinks(matchAlternates(m)) +
    '<meta property="og:site_name" content="IASHARK"><meta property="og:locale" content="' + C.ogLocale(dir) + '">' +
    C.ldScript(C.breadcrumbLd(matchCrumbs(m, dir)));
}

// Bloc meta complet (meme composition que generateMatchPages du pipeline).
function matchMetaBlock(m, dir, opts) {
  var title = matchTitle(m, dir), desc = matchDescription(m, dir), canonical = SITE_URL + C.matchPath(dir, m.id), image = matchImage(m);
  return '<meta name="description" content="' + esc(desc) + '">' +
    '<link rel="canonical" href="' + canonical + '">' +
    '<meta property="og:type" content="website">' +
    '<meta property="og:title" content="' + esc(title) + '">' +
    '<meta property="og:description" content="' + esc(desc) + '">' +
    '<meta property="og:url" content="' + canonical + '">' +
    (image ? '<meta property="og:image" content="' + esc(image) + '">' : "") +
    '<meta name="twitter:card" content="summary">' +
    '<meta name="twitter:title" content="' + esc(title) + '">' +
    '<meta name="twitter:description" content="' + esc(desc) + '">' +
    (image ? '<meta name="twitter:image" content="' + esc(image) + '">' : "") +
    '<script type="application/ld+json">' + matchJsonLd(m, dir, opts) + "</script>" +
    matchHeadExtras(m, dir);
}

// Resume statique (h1 + competition + date + annonce publique). Page match V8
// (16/09/2026) : le HTML statique ne contient que des parties publiques - le
// pari n'y est plus nomme, meme pour le match offert (un visiteur sans compte y
// voit l'avis ferme).
function matchSummaryHtml(m, dir) {
  var day = (m.date || "").split(" ")[0];
  var modelAvailable = m.model_output_available !== false && Number(m.data_quality_score || 0) > 0;
  var dateLabel = day ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(day + "T12:00:00Z")) : "";
  return '<div style="padding:24px 16px;font-family:\'DM Sans\',sans-serif;color:#94a3b8;font-size:13px;line-height:1.6">' +
    '<h1 style="font-family:\'Bebas Neue\',sans-serif;font-size:22px;letter-spacing:.5px;color:#e2e8f0;margin-bottom:8px">' + esc(m.home.n) + " vs " + esc(m.away.n) + "</h1>" +
    "<p>" + (leagueName(m) ? esc(leagueName(m)) + " — " : "") + (day ? '<time data-seo-date datetime="' + esc(day) + '">' + esc(dateLabel) + "</time>" : "") + "</p>" +
    (modelAvailable ? '<p data-i18n="match_page.seo_analysis_available">Analyse statistique IASHARK disponible pour ce match.</p>' : '<p data-i18n="match_page.model_unavailable_reason">Les données disponibles ne permettent pas encore une analyse chiffrée fiable.</p>') +
    "</div>";
}

// Bloc visible sous l'analyse : fil d'Ariane, competition, coup d'envoi avec
// fuseau explicite, stade, liens internes, avertissement. Aucune donnee
// reservee (ni probabilite, ni pari, ni cote).
var LINK = ' style="color:#20d5ef;text-decoration:underline"';
// Affiche fixe du grand match (derby) de la meme version, si elle existe :
// data/derby-index.json, ecrit par scripts/build-club-hubs.js (paire d'ids
// api-football triee -> page par repertoire). Lu au build, jamais publie.
var DERBY_INDEX = null;
function derbyPageFor(m, dir) {
  if (DERBY_INDEX === null) {
    try { DERBY_INDEX = JSON.parse(fs.readFileSync(path.join(C.ROOT, "data/derby-index.json"), "utf8")).pairs || {}; } catch (e) { DERBY_INDEX = {}; }
  }
  if (!m || !m.home || !m.away || m.home.id == null || m.away.id == null) return null;
  var e = DERBY_INDEX[[Number(m.home.id), Number(m.away.id)].sort(function (a, b) { return a - b; }).join("-")];
  return e && e.pages && e.pages[dir] ? e.pages[dir] : null;
}
// Jour calendaire (AAAA-MM-JJ, sans heure) ; la forme utilise date_full, l instant
// reel, formate dans le fuseau de la version.
function dayLabel(day, dir) {
  var t = Date.parse(String(day || "") + "T12:00:00Z");
  return isFinite(t) ? fmt(new Date(t), dir, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";
}
function signed(n) { return n > 0 ? "+" + n : String(n); }
var H3 = ' style="font-size:15px;font-weight:700;color:#f4f7fb;margin:16px 0 6px"';
function listHtml(items) {
  return '<ul style="margin:0 0 8px;padding-left:18px">' + items.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>";
}
// Faits publics specifiques au match, rendus depuis l'instantane en liste
// blanche (scripts/match-lifecycle.js#publicSnapshot) : meme rendu pour la page
// active et la page conservee ; jamais un champ premium, ni conf, ni cote.
function matchFactSections(f, dir) {
  var ms = C.seoConf(dir).match, out = "";
  var forms = [[f.home, f.form_home], [f.away, f.form_away]].filter(function (x) { return x[0] && x[1] && x[1].length; });
  if (forms.length) {
    out += "<h3" + H3 + ">" + esc(ms.form_title) + "</h3>" + forms.map(function (x) {
      return '<p style="margin:6px 0 2px;color:#e2e8f0">' + esc(x[0].n) + "</p>" + listHtml(x[1].map(function (e) {
        return cleanTpl(C.fill(ms.form_row, { date: e.date_full && isFinite(Date.parse(e.date_full)) ? fmt(new Date(e.date_full), dir, { day: "numeric", month: "short", year: "numeric" }) : dayLabel(e.d, dir), result: e.result ? ms["result_" + e.result] : "", score: e.score, opponent: e.opponent, side: e.home === true ? ms.side_home : e.home === false ? ms.side_away : "" }));
      }));
    }).join("");
  }
  var rows = f.classement && Array.isArray(f.classement.standings) ? f.classement.standings.filter(function (r) {
    return r && typeof r.name === "string" && ["rank", "pts", "played", "won", "drawn", "lost", "gd"].every(function (k) { return typeof r[k] === "number"; });
  }).sort(function (a, b) { return a.rank - b.rank; }) : [];
  if (rows.length) {
    out += "<h3" + H3 + ">" + esc(ms.standings_title) + "</h3>" + listHtml(rows.map(function (r) {
      return C.fill(ms.standings_row, { rank: r.rank, team: r.name, pts: r.pts, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, gd: signed(r.gd) });
    }));
  }
  if (Array.isArray(f.h2h) && f.h2h.length) {
    out += "<h3" + H3 + ">" + esc(ms.h2h_title) + "</h3>" + listHtml(f.h2h.map(function (e) {
      return cleanTpl(C.fill(ms.h2h_row, { date: dayLabel(e.d, dir), home: e.home, score: e.s, away: e.away }));
    }));
  }
  if (f.lineups && f.lineups.home && f.lineups.away) {
    out += "<h3" + H3 + ">" + esc(ms.lineups_title) + "</h3>" + [[f.home, f.lineups.home], [f.away, f.lineups.away]].map(function (x) {
      return '<p style="margin:0 0 6px">' + esc(cleanTpl(C.fill(ms.lineup_row, { team: x[0].n, formation: x[1].formation || "", players: x[1].startXI.join(", ") }))) + "</p>";
    }).join("");
  }
  return out;
}
function factRowsHtml(m, dir) {
  var s = C.seoConf(dir), ms = s.match;
  var d = kickoff(m), ln = leagueName(m), k = hubKey(m), v = venue(m);
  var hub = k ? C.leagueHubPath(dir, k) : null;
  function row(label, value) {
    return '<div style="display:flex;flex-wrap:wrap;gap:4px 12px;margin:0 0 4px"><dt style="min-width:120px;color:#91a0b3">' + esc(label) + '</dt><dd style="margin:0;color:#e2e8f0">' + value + "</dd></div>";
  }
  var rows = "";
  if (ln) rows += row(ms.competition, hub ? '<a href="' + hub + '"' + LINK + ">" + esc(ln) + "</a>" : esc(ln));
  if (d) rows += row(ms.kickoff, '<time datetime="' + isoInstant(d) + '">' + esc(longDate(d, dir)) + ", " + esc(clock(d, dir)) + " (" + esc(s.tz_label) + ")</time>");
  if (v) rows += row(ms.venue, esc(v));
  return rows;
}
function snapshotOf(m) { return LIFECYCLE.publicSnapshot(m) || { home: m.home, away: m.away }; }
// Mots du contenu propre (seuil MIN_INDEXABLE_WORDS).
function countWords(html) {
  return String(html).replace(/<[^>]+>/g, " ").replace(/&[#a-z0-9]+;/gi, " ").split(/\s+/).filter(function (w) { return /[\p{L}\p{N}]/u.test(w); }).length;
}
function matchContentWords(m, dir) {
  return countWords(esc(teams(m)) + " " + factRowsHtml(m, dir) + " " + matchFactSections(snapshotOf(m), dir));
}
// Mesure sur la version x-default (fr) : toutes les versions d un meme match
// partagent la meme decision (jamais un groupe hreflang mi-indexable, mi-noindex).
function isThinMatch(m) { return matchContentWords(m, X_DEFAULT_DIR) < MIN_INDEXABLE_WORDS; }
// <meta robots> d'une page match : noindex,follow si contenu propre trop
// mince, si le registre le demande (J+7) ou si le coup d'envoi date de 7 jours.
function matchRobotsMeta(m, dir, opts) {
  opts = opts || {};
  var noindex = !!opts.noindex || isThinMatch(m, dir);
  if (!noindex && opts.now) noindex = LIFECYCLE.stageFor(LIFECYCLE.kickoffIso(m), opts.now, !opts.archived).noindex;
  return noindex ? '<meta name="robots" content="noindex,follow">' : "";
}
function matchFactsHtml(m, dir, opts) {
  opts = opts || {};
  var s = C.seoConf(dir), ms = s.match;
  var ln = leagueName(m), k = hubKey(m);
  var hub = k ? C.leagueHubPath(dir, k) : null;
  var crumbs = matchCrumbs(m, dir);
  var nav = crumbs.map(function (c, i) {
    return i < crumbs.length - 1
      ? '<a href="' + esc(c.url.slice(SITE_URL.length)) + '"' + LINK + ">" + esc(c.name) + "</a>"
      : '<span aria-current="page">' + esc(c.name) + "</span>";
  }).join(' <span aria-hidden="true">›</span> ');
  var links = ['<a href="' + C.homePath(dir) + '"' + LINK + ">" + esc(ms.free_link) + "</a>"];
  if (hub) links.push('<a href="' + hub + '"' + LINK + ">" + esc(C.fill(ms.hub_link, { league: ln })) + "</a>");
  // Pages club des deux equipes et affiche derby de la version, quand elles existent.
  [m.home, m.away].forEach(function (t) {
    var club = t && t.id != null ? C.clubPageFor(t.id, dir) : null;
    if (club) links.push('<a href="' + esc(club.path) + '"' + LINK + ">" + esc(club.name) + "</a>");
  });
  var derby = derbyPageFor(m, dir);
  if (derby) links.push('<a href="' + esc(derby.path) + '"' + LINK + ">" + esc(derby.name) + "</a>");
  links.push('<a href="' + C.guidePath(dir, MATCH_GUIDE) + '"' + LINK + ">" + esc(ms.guide_link) + "</a>");
  return '<section class="match-facts" aria-labelledby="match-facts-title" style="width:100%;max-width:960px;margin:28px auto 0;padding:18px 16px 8px;border-top:1px solid rgba(141,179,211,.18);font-family:\'DM Sans\',system-ui,sans-serif;color:#c3ccd8;font-size:14px;line-height:1.6">' +
    '<nav aria-label="' + esc(ms.breadcrumb_aria) + '" style="font-size:12.5px;color:#91a0b3;margin:0 0 12px">' + nav + "</nav>" +
    '<h2 id="match-facts-title" style="font-size:17px;font-weight:700;color:#f4f7fb;margin:0 0 10px">' + esc(ms.facts_title) + "</h2>" +
    '<dl style="margin:0 0 12px">' + factRowsHtml(m, dir) + "</dl>" +
    matchFactSections(snapshotOf(m), dir) +
    (opts.archived ? "" : '<p style="margin:12px 0 10px">' + esc(ms.about) + "</p>") +
    '<p style="margin:12px 0 10px">' + links.join(" · ") + "</p>" +
    '<p style="margin:0;font-size:12.5px;color:#91a0b3">' + esc(ms.disclaimer) + "</p>" +
    "</section>";
}
// Page conservee (match sorti du run) : titre visible, score final ou statut,
// lien vers le hub ligue de la version. Aucun script d'analyse.
function archivedCardHtml(m, dir, st) {
  var ms = C.seoConf(dir).match, k = hubKey(m), ln = leagueName(m);
  var hub = k ? C.leagueHubPath(dir, k) : C.homePath(dir);
  var status = st.final_score
    ? '<span style="display:block;font-size:12.5px;color:#91a0b3;text-transform:uppercase;letter-spacing:.06em">' + esc(ms.final_score) + '</span><strong style="font-size:24px;color:#f4f7fb">' + esc(m.home.n) + " " + st.final_score.home + "–" + st.final_score.away + " " + esc(m.away.n) + "</strong>"
    : '<strong style="font-size:20px;color:#f4f7fb">' + esc(st.finished ? ms.finished : ms.not_tracked) + "</strong>";
  return '<section class="match-archived" aria-labelledby="match-archived-title" style="max-width:960px;margin:24px auto 0;padding:20px 16px;font-family:\'DM Sans\',system-ui,sans-serif;color:#c3ccd8;font-size:14px;line-height:1.6">' +
    '<h1 id="match-archived-title" style="font-family:\'Bebas Neue\',sans-serif;font-size:30px;letter-spacing:.5px;color:#f4f7fb;margin:0 0 10px">' + esc(teams(m)) + "</h1>" +
    '<p style="margin:0 0 12px">' + status + "</p>" +
    (k ? '<p style="margin:0 0 8px">' + esc(C.fill(ms.archived_note, { league: ln })) + "</p>" : "") +
    '<p style="margin:0"><a href="' + hub + '"' + LINK + ">" + esc(k ? C.fill(ms.hub_cta, { league: ln }) : ms.free_link) + "</a></p>" +
    "</section>";
}

// Liens racine du gabarit -> version FR explicite (copie de liensVersionFr du
// pipeline, testee par tests/qa-f1-app-fixes.test.js).
function liensVersionFr(html) {
  return html.replace(/href="\/([a-z0-9-]+\.html)?"/g, function (m, f) {
    if (!f) return 'href="/fr/"';
    if (f === "blog.html") return m;
    return 'href="/fr/' + f + '"';
  });
}

// Page match complete. rawTpl = match.html tel quel.
// opts : { now, entry (registre), archived ({final_score, finished}), noindex }.
// Page conservee (opts.archived) : ni FIXED_MATCH_ID, ni PRELOADED_MATCH, ni
// match-page.js - uniquement les faits publics de l'instantane.
function renderMatchPage(rawTpl, m, dir, opts) {
  opts = opts || {};
  var archived = opts.archived || null;
  var fr = dir === X_DEFAULT_DIR;
  var html = fr ? liensVersionFr(rawTpl) : rawTpl;
  var robots = matchRobotsMeta(m, dir, opts);
  html = html
    .replace(/<title>[^<]*<\/title>/, function () { return "<title>" + esc(matchTitle(m, dir)) + "</title>"; })
    .replace('<meta name="robots" content="noindex,follow">', function () { return robots; })
    .replace("<!--SEO_META--><!--/SEO_META-->", function () { return matchMetaBlock(m, dir, opts); })
    .replace("<!--SEO_SUMMARY--><!--/SEO_SUMMARY-->", function () { return archived ? "" : matchSummaryHtml(m, dir); })
    .replace("<!--FIXED_ID_SCRIPT--><!--/FIXED_ID_SCRIPT-->", function () { return archived ? "" : "<script>var FIXED_MATCH_ID=" + JSON.stringify(String(m.id)) + ";</script>"; })
    .replace("<!--PRELOADED_MATCH_SCRIPT--><!--/PRELOADED_MATCH_SCRIPT-->", function () { return archived ? "" : "<script>var PRELOADED_MATCH=" + JSON.stringify(PUBLIC_SPLIT.preloadedMatch(m)).replace(/</g, "\\u003c") + ";</script>"; })
    .replace("</main>", function () { return matchFactsHtml(m, dir, opts) + "</main>"; });
  if (archived) {
    html = html
      .replace(/<div id="matchRoot"[^>]*><div class="loading-card">[\s\S]*?<\/div><\/div>/, function () { return '<div id="matchRoot">' + archivedCardHtml(m, dir, archived) + "</div>"; })
      .replace('<script src="/match-page.js"></script>', "");
  }
  if (fr) return html;
  var conf = DIRS[dir];
  var countryMarket = ["gb", "za", "mx"].indexOf(conf.market) !== -1 ? conf.market : null;
  html = B().bakeI18n(html, C.dictFor(dir), countryMarket);
  html = B().bakeMarket(html, dir);
  html = B().rewriteInternalLinks(html, dir);
  html = B().setHtmlLang(html, conf.htmlLang);
  html = B().injectRuntime(html, dir);
  return html;
}
function renderArchivedPage(tpl, e, dir, now) {
  return renderMatchPage(tpl, e.snapshot, dir, { archived: LIFECYCLE.archivedState(e, now), entry: e, now: now, noindex: e.status === "archived_noindex" });
}

// ---------------------------------------------------------------------------
// Pages championnat.
var HUB_CSS = "*{box-sizing:border-box}body{margin:0;background:#060b12;color:#c3ccd8;font:15px/1.65 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;padding-bottom:96px}" +
  "a{color:#20d5ef}a:focus-visible{outline:2px solid #20d5ef;outline-offset:2px}" +
  ".hdr{display:flex;align-items:center;gap:16px;max-width:960px;margin:0 auto;padding:14px 18px;border-bottom:1px solid rgba(141,179,211,.14)}" +
  ".hdr img{display:block;width:132px;height:auto}.hdr nav{margin-left:auto;display:flex;gap:14px;font-size:13px;font-weight:600}.hdr nav a{text-decoration:none;display:inline-flex;align-items:center;min-height:44px}" +
  "main{max-width:960px;margin:0 auto;padding:18px}.crumbs{font-size:12.5px;color:#91a0b3;margin:6px 0 14px}.crumbs a{color:#91a0b3}" +
  "h1{color:#f4f7fb;font-size:clamp(26px,4vw,38px);line-height:1.15;margin:0 0 12px}h2{color:#f4f7fb;font-size:19px;margin:30px 0 10px}" +
  ".intro{max-width:760px}.note{font-size:13px;color:#91a0b3}.fx{list-style:none;padding:0;margin:0;border-top:1px solid rgba(141,179,211,.14)}" +
  ".fx li{padding:12px 0;border-bottom:1px solid rgba(141,179,211,.14)}.fx a{font-weight:700;color:#f4f7fb;text-decoration:none}.fx a:hover{color:#20d5ef}" +
  ".fx .meta{display:block;font-size:13px;color:#91a0b3}.others{display:flex;flex-wrap:wrap;gap:0 16px;font-size:14px}.others a{display:inline-flex;align-items:center;min-height:44px}" +
  ".foot{max-width:960px;margin:24px auto 0;padding:18px;border-top:1px solid rgba(141,179,211,.14);font-size:12.5px;color:#91a0b3}.foot a{color:#91a0b3}";

function hubVars(key, dir) {
  var L = C.seoConf(dir).league;
  return { league: C.leagueByKey(key).displayName, country: (L.countries || {})[key] || "", adjective: (L.adjectives || {})[key] || "", tz: C.seoConf(dir).tz_label };
}
// Title <= 60 / description <= 155 : surcharge de la competition, gabarit, gabarit court.
function hubMeta(key, dir) {
  var L = C.seoConf(dir).league, ov = (L.overrides && L.overrides[key]) || {}, v = hubVars(key, dir);
  var f = function (s) { return s ? C.fill(s, v) : null; };
  return {
    title: C.fitText([f(ov.title), f(L.title), f(L.title_short)], TITLE_SOFT_MAX),
    description: C.fitText([f(ov.description), f(L.description), f(L.description_short)], DESCRIPTION_MAX),
    h1: f(ov.h1) || f(L.h1)
  };
}
// Presentation factuelle : texte propre a la competition s'il existe, sinon
// phrase selon sa nature (championnat national, competitions UEFA, MLS), sans
// chiffre invérifiable.
function hubAbout(key, dir) {
  var L = C.seoConf(dir).league, ov = (L.overrides && L.overrides[key]) || {};
  return C.fill(ov.intro || L.about[C.leagueKind(key)], hubVars(key, dir));
}
function teamLabel(t) { return t && (t.n || t.name) ? String(t.n || t.name) : ""; }
var HUB_TABLE_CSS = ".tbl{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:14px;margin:0 0 8px}caption{caption-side:top;text-align:left;font-size:13px;color:#91a0b3;padding:0 0 6px}" +
  "th,td{padding:6px 8px;text-align:right;border-bottom:1px solid rgba(141,179,211,.14);white-space:nowrap}th{color:#91a0b3;font-weight:600;font-size:12.5px}td.t,th.t{text-align:left;white-space:normal}" +
  ".fx .tm{font-weight:700;color:#f4f7fb}.clubs{display:flex;flex-wrap:wrap;gap:0 16px;font-size:14px}.clubs a{display:inline-flex;align-items:center;min-height:44px}";

function hubMatchItem(e, dir, played, ms) {
  var d = new Date(e.t), v = e.venue;
  var name = esc(teamLabel(e.home)) + (e.score ? " " + e.score.home + "–" + e.score.away + " " : " vs ") + esc(teamLabel(e.away));
  var meta = ['<time datetime="' + isoInstant(d) + '">' + esc(played ? shortDate(d, dir) : longDate(d, dir) + " · " + clock(d, dir)) + "</time>"];
  if (v) meta.push(esc(v));
  if (played && !e.score) meta.push(esc(ms.finished));
  return "<li>" + (e.href ? '<a href="' + e.href + '">' + name + "</a>" : '<span class="tm">' + name + "</span>") + '<span class="meta">' + meta.join(" · ") + "</span></li>";
}
function hubStandingsHtml(key, dir, st, L, dict, name) {
  var lab = function (k, fb) { var x = C.get(dict, "clubs." + k); return esc(typeof x === "string" ? x : fb); };
  var tables = st.groups.map(function (g) {
    var rows = g.rows.map(function (r) {
      var club = r.team_id != null ? C.clubPageFor(r.team_id, dir) : null;
      var team = club ? '<a href="' + club.path + '">' + esc(r.name) + "</a>" : esc(r.name);
      var wdl = [r.won, r.drawn, r.lost].map(function (x) { return x != null ? x : "?"; }).join("-");
      return "<tr><td>" + r.rank + '</td><td class="t">' + team + "</td><td>" + (r.played != null ? r.played : "") + "</td><td>" + wdl + "</td><td>" + (r.gd != null ? signed(r.gd) : "") + "</td><td>" + r.pts + "</td></tr>";
    }).join("");
    return '<div class="tbl"><table><caption>' + esc([g.name || name, st.season ? String(st.season) : null].filter(Boolean).join(" · ")) + "</caption><thead><tr><th>" + lab("col_rank", "#") + '</th><th class="t">' + lab("col_team", "Club") +
      "</th><th>" + lab("col_played", "P") + "</th><th>" + lab("col_wdl", "W-D-L") + "</th><th>" + lab("col_gd", "GD") + "</th><th>" + lab("col_pts", "Pts") + "</th></tr></thead><tbody>" + rows + "</tbody></table></div>";
  }).join("\n");
  var asOf = st.as_of ? shortDate(new Date(st.as_of + "T12:00:00Z"), dir) : "";
  return tables + '\n<p class="note">' + esc(C.fill(L.standings_asof, { date: asOf })) + (st.source === "matchs" ? " " + esc(L.standings_partial) : "") + "</p>";
}

// renderLeagueHub(key, dir, matches, opts) : matches = matchs du run de la
// competition ; opts = { root, now, registry, store, data } ; opts.data
// (facultatif) remplace une partie des donnees collectees (tests).
function renderLeagueHub(key, dir, matches, opts) {
  opts = opts || {};
  var s = C.seoConf(dir), L = s.league, conf = DIRS[dir], dict = C.dictFor(dir);
  var name = C.leagueByKey(key).displayName;
  var meta = hubMeta(key, dir), title = meta.title, desc = meta.description, h1 = meta.h1;
  // Hub hors du perimetre des pages match de la competition (ex. Liga MX en
  // allemand) : noindex,follow, sans hreflang, liens vers la version la plus
  // proche reellement generee (meme langue, puis en, puis fr).
  var scope = LIFECYCLE.matchDirsFor(key), inScope = scope.indexOf(dir) !== -1;
  var linkDir = inScope ? dir : C.nearestDir(dir, scope);
  var data = Object.assign(HUBDATA.collect(key, dir, { root: opts.root, now: opts.now, runMatches: matches || [], registry: opts.registry, store: opts.store, linkDir: linkDir }), opts.data || {});
  var standingRows = data.standings && data.standings.groups ? data.standings.groups.reduce(function (n, g) { return n + g.rows.length; }, 0) : 0;
  var stable = standingRows >= MIN_HUB_STANDING_ROWS || data.clubs.length > 0 || data.upcoming.length + data.results.length >= MIN_HUB_FIXTURES;
  var indexable = inScope && stable;
  var canonical = SITE_URL + C.leagueHubPath(dir, key);
  var crumbs = [{ name: s.breadcrumb.home, url: SITE_URL + C.homePath(dir) }, { name: name, url: canonical }];
  var help = B().helplineFor(dir);

  var fixtures = data.upcoming.length
    ? '<p class="note">' + esc(L.kickoff_note) + '</p><ul class="fx">' + data.upcoming.map(function (e) { return hubMatchItem(e, dir, false, s.match); }).join("") + "</ul>"
    : "<p>" + esc(C.fill(L.none, { league: name })) + "</p>";
  var results = data.results.length
    ? "<h2>" + esc(L.results_title) + '</h2>\n<ul class="fx">' + data.results.map(function (e) { return hubMatchItem(e, dir, true, s.match); }).join("") + "</ul>\n"
    : "";
  var standings = standingRows ? "<h2>" + esc(C.fill(L.standings_title, { league: name })) + "</h2>\n" + hubStandingsHtml(key, dir, data.standings, L, dict, name) + "\n" : "";
  var clubs = data.clubs.length
    ? "<h2>" + esc(L.clubs_title) + '</h2>\n<p class="clubs">' + data.clubs.map(function (c) { return '<a href="' + c.path + '">' + esc(c.name) + "</a>"; }).join("") + "</p>\n"
    : "";
  var others = C.leaguesInScope(dir).filter(function (l) { return l.key !== key; }).map(function (l) {
    return '<a href="' + C.leagueHubPath(dir, l.key) + '">' + esc(l.displayName) + "</a>";
  }).join("");
  var clubsHub = C.clubsHubPath(dir, opts.root);
  var guides = HUB_GUIDES.map(function (g) {
    return '<li><a href="' + C.guidePath(dir, g) + '">' + esc(C.guideLabel(dir, g)) + "</a></li>";
  }).join("");
  var legal = B().LEGAL_FILE_LIST.filter(function (f) { return fs.existsSync(path.join(C.ROOT, "legal", dir, f)); }).map(function (f) {
    var labelKey = { "mentions-legales.html": "footer.mentions_legales", "cgv.html": "footer.cgv", "confidentialite.html": "footer.confidentialite", "cookies.html": "footer.cookies", "jeu-responsable.html": "footer.responsible_gambling", "methodologie.html": "footer.methodology" }[f];
    var label = labelKey ? C.get(dict, labelKey) : null;
    return '<a href="/' + dir + "/" + f + '">' + esc(typeof label === "string" ? label : f) + "</a>";
  }).join(" · ");
  var helpHtml = help ? "<p>" + esc(L.help) + ' <a href="' + esc(help.url) + '" rel="noopener">' + esc(help.name) + "</a>" + (help.phone ? " · " + esc(help.phone) : "") + "</p>" : "";

  var page = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": canonical + "#webpage",
    url: canonical,
    name: title,
    description: desc,
    inLanguage: conf.htmlLang,
    isPartOf: { "@id": SITE_URL + "/#website" },
    about: { "@type": "SportsOrganization", name: name }
  };
  var listed = data.upcoming.filter(function (e) { return e.href; });
  if (listed.length) {
    page.mainEntity = {
      "@type": "ItemList",
      itemListElement: listed.map(function (e, i) { return { "@type": "ListItem", position: i + 1, url: SITE_URL + e.href, name: teamLabel(e.home) + " vs " + teamLabel(e.away) }; })
    };
  }
  var nav = function (k, fb) { var v = C.get(dict, k); return esc(typeof v === "string" ? v : fb); };
  var html = "<!DOCTYPE html>\n" +
    '<html lang="' + conf.htmlLang + '">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="iashark-market" content="' + conf.market + '">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    "<title>" + esc(title) + "</title>\n" +
    '<meta name="description" content="' + esc(desc) + '">\n' +
    (indexable ? "" : '<meta name="robots" content="noindex,follow">\n') +
    '<link rel="canonical" href="' + canonical + '">\n' +
    (inScope ? C.hreflangLinks(C.alternatesFor(function (d) { return C.leagueHubPath(d, key); }, scope)).replace(/></g, ">\n<") + "\n" : "") +
    '<meta property="og:type" content="website">\n<meta property="og:site_name" content="IASHARK">\n' +
    '<meta property="og:locale" content="' + C.ogLocale(dir) + '">\n' +
    '<meta property="og:title" content="' + esc(title) + '">\n<meta property="og:description" content="' + esc(desc) + '">\n' +
    '<meta property="og:url" content="' + canonical + '">\n<meta property="og:image" content="' + SITE_URL + '/icon-512.png">\n' +
    '<meta name="twitter:card" content="summary">\n' +
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n' +
    C.ldScript(C.breadcrumbLd(crumbs)) + "\n" + C.ldScript(page) + "\n" +
    "<style>" + HUB_CSS + HUB_TABLE_CSS + "</style>\n" +
    '<link rel="stylesheet" href="/assets/bottom-navigation.css">\n' +
    "</head>\n<body>\n" +
    '<header class="hdr"><a href="' + C.homePath(dir) + '" aria-label="IASHARK"><img src="/assets/iashark-logo.png" width="1648" height="440" alt="IASHARK"></a>' +
    '<nav><a href="' + C.homePath(dir) + '">' + nav("nav.home", "Home") + "</a>" + (clubsHub ? '<a href="' + clubsHub + '">' + esc(s.nav.clubs) + "</a>" : "") + '<a href="' + C.blogHubPath(dir) + '">' + nav("nav.guides", "Blog") + "</a></nav></header>\n" +
    "<main>\n" +
    '<nav class="crumbs" aria-label="' + esc(s.match.breadcrumb_aria) + '"><a href="' + C.homePath(dir) + '">' + esc(s.breadcrumb.home) + '</a> <span aria-hidden="true">›</span> <span aria-current="page">' + esc(name) + "</span></nav>\n" +
    "<h1>" + esc(h1) + "</h1>\n" +
    '<p class="intro">' + esc(hubAbout(key, dir)) + "</p>\n" +
    '<p class="intro">' + esc(C.fill(L.scope, hubVars(key, dir))) + "</p>\n" +
    "<h2>" + esc(L.fixtures_title) + "</h2>\n" + fixtures + "\n" +
    results + standings + clubs +
    "<h2>" + esc(L.method_title) + "</h2>\n<p class=\"intro\">" + esc(L.method) + "</p>\n" +
    "<ul>" + guides + '</ul>\n<p><a href="' + C.homePath(dir) + '">' + esc(L.free_link) + "</a></p>\n" +
    (others ? "<h2>" + esc(L.others_title) + '</h2>\n<p class="others">' + others + "</p>\n" : "") +
    "</main>\n" +
    '<footer class="foot"><p>' + esc(L.disclaimer) + "</p>" + helpHtml + (legal ? "<p>" + legal + "</p>" : "") + "</footer>\n" +
    C.footerNavHtml(dir, opts.root) + "\n" +
    '<script defer src="/i18n/i18n.js"></script>\n<script defer src="/lib/market-config.js"></script>\n<script defer src="/bottom-navigation.js"></script>\n' +
    "</body>\n</html>\n";
  return { html: html, indexable: indexable, count: data.upcoming.length, data: data };
}

// ---------------------------------------------------------------------------
// Ecriture + sitemaps.
function sortMatches(list) { return list.slice().sort(MATCH_TIME.compareMatches); }

function matchOutDir(root, dir) { return dir === X_DEFAULT_DIR ? path.join(root, "match") : path.join(root, dir, "match"); }
// Pages conservees (matchs sortis du run, avant J+30) des repertoires demandes.
// Renvoie les chemins relatifs ecrits.
function writeArchivedMatchPages(reg, opts) {
  opts = opts || {};
  var root = opts.root || C.ROOT, now = opts.now || new Date();
  var tpl = opts.tpl != null ? opts.tpl : fs.readFileSync(path.join(root, "match.html"), "utf8");
  var dirs = opts.dirs || [X_DEFAULT_DIR], skip = opts.skipIds || {};
  var written = [];
  LIFECYCLE.archivedEntries(reg).forEach(function (e) {
    if (skip[e.id]) return;
    dirs.forEach(function (dir) {
      if ((e.dirs || []).indexOf(dir) === -1) return;
      var file = path.join(matchOutDir(root, dir), e.id + ".html");
      writeIfChanged(file, renderArchivedPage(tpl, e, dir, now));
      written.push(path.relative(root, file).split(path.sep).join("/"));
    });
  });
  return written;
}

// opts : { root, today, now, tpl, registry (data/match-pages-registry.json deja
// mis a jour par l'appelant), matchDirs, hubDirs }. Sans registre : aucune page
// conservee (les pages hors run sont supprimees, comportement historique).
function writeSeoPages(matchs, opts) {
  opts = opts || {};
  var root = opts.root || C.ROOT;
  var today = opts.today || new Date().toISOString().slice(0, 10);
  var now = opts.now || new Date();
  var reg = opts.registry || null;
  var tpl = opts.tpl != null ? opts.tpl : fs.readFileSync(path.join(root, "match.html"), "utf8");
  var list = sortMatches((matchs || []).filter(validMatch));
  var report = { matchPages: 0, archivedPages: 0, hubs: 0, indexableHubs: 0, removed: 0 };
  var inRun = {};
  list.forEach(function (m) { inRun[String(m.id)] = true; });

  var matchDirList = opts.matchDirs || DIR_CODES.filter(function (d) { return d !== X_DEFAULT_DIR; });
  matchDirList.forEach(function (dir) {
    var out = path.join(root, dir, "match");
    fs.mkdirSync(out, { recursive: true });
    var keep = {};
    list.forEach(function (m) {
      if (!hasMatchVersion(m, dir)) return;
      var f = String(m.id) + ".html";
      writeIfChanged(path.join(out, f), renderMatchPage(tpl, m, dir, { now: now, entry: reg ? reg.matches[String(m.id)] || null : null }));
      keep[f] = true;
      report.matchPages++;
    });
    if (reg) {
      writeArchivedMatchPages(reg, { root: root, tpl: tpl, now: now, dirs: [dir], skipIds: inRun }).forEach(function (rel) {
        keep[rel.split("/").pop()] = true;
        report.archivedPages++;
      });
    }
    fs.readdirSync(out).forEach(function (f) {
      if (!keep[f]) { fs.unlinkSync(path.join(out, f)); report.removed++; }
    });
  });

  // Classements conserves d'un run a l'autre (data/league-hubs-registry.json).
  var store = HUBDATA.loadStore(root);
  HUBDATA.updateStore(store, list, now, { root: root });
  var hubDirs = opts.hubDirs || DIR_CODES;
  hubDirs.forEach(function (dir) {
    var out = path.join(root, dir, "leagues");
    fs.mkdirSync(out, { recursive: true });
    var keep = {};
    C.LEAGUES.forEach(function (l) {
      var r = renderLeagueHub(l.key, dir, list.filter(function (m) { return m.league_key === l.key; }), { root: root, now: now, registry: reg, store: store });
      var f = C.leagueSlug(l.key) + ".html";
      writeIfChanged(path.join(out, f), r.html);
      keep[f] = true;
      report.hubs++;
      if (r.indexable) report.indexableHubs++;
    });
    fs.readdirSync(out).forEach(function (f) {
      if (!keep[f]) { fs.unlinkSync(path.join(out, f)); report.removed++; }
    });
  });

  HUBDATA.saveStore(root, store);
  report.sitemaps = writeSeoSitemaps(root, today, now);
  return report;
}

function isNoindex(html) {
  var head = html.split(/<\/head>/i)[0];
  return /<meta name="robots" content="[^"]*noindex/i.test(head);
}
function urlset(entries) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.map(function (e) { return "<url><loc>" + e.loc + "</loc><lastmod>" + e.lastmod + "</lastmod></url>"; }).join("\n") +
    "\n</urlset>\n";
}
// Coup d'envoi declare dans le JSON-LD SportsEvent d'une page match.
function eventStart(html) {
  var mm = /"@type":"SportsEvent"[^<]*?"startDate":"([^"]+)"/.exec(html);
  return mm ? Date.parse(mm[1]) : NaN;
}
// Une page n'entre au sitemap que si elle est indexable et, pour une page match,
// si son coup d'envoi date de moins de 48 h (scripts/match-lifecycle.js).
function sitemapEligible(html, now) {
  if (isNoindex(html)) return false;
  var k = eventStart(html), t = (now || new Date()).getTime();
  return !(isFinite(k) && t - k >= LIFECYCLE.SITEMAP_MAX_AGE_HOURS * 3600 * 1000);
}
// Sitemaps construits depuis les fichiers REELLEMENT presents (jamais une URL
// sans page, jamais une page noindex, jamais un match joue depuis plus de 48 h).
function writeSeoSitemaps(root, today, now) {
  var files = [];
  now = now || new Date();
  function collect(group, sub, fname, dirs) {
    var t = LASTMOD.tracker(root, group, today);
    var entries = [];
    dirs.forEach(function (dir) {
      var abs = path.join(root, dir, sub);
      if (!fs.existsSync(abs)) return;
      fs.readdirSync(abs).filter(function (f) { return /\.html$/.test(f); }).sort().forEach(function (f) {
        var html = fs.readFileSync(path.join(abs, f), "utf8");
        if (!sitemapEligible(html, now)) return;
        var loc = SITE_URL + "/" + dir + "/" + sub + "/" + f;
        entries.push({ loc: loc, lastmod: t.lastmod(loc, html) });
      });
    });
    t.save();
    writeIfChanged(path.join(root, fname), urlset(entries));
    files.push(fname);
  }
  collect("matches-i18n", "match", "sitemap-matches-i18n.xml", DIR_CODES.filter(function (d) { return d !== X_DEFAULT_DIR; }));
  collect("leagues", "leagues", "sitemap-leagues.xml", DIR_CODES);
  return files;
}
// sitemap-fr.xml : pages match FR /match/<id>.html presentes, memes regles,
// lastmod exact (scripts/seo-lastmod.js, groupe matches-fr) au lieu de la date
// du jour systematique.
function writeFrMatchSitemap(root, today, now) {
  root = root || C.ROOT;
  now = now || new Date();
  var t = LASTMOD.tracker(root, "matches-fr", today);
  var abs = path.join(root, "match"), entries = [];
  if (fs.existsSync(abs)) {
    fs.readdirSync(abs).filter(function (f) { return /^\d+\.html$/.test(f); }).sort().forEach(function (f) {
      var html = fs.readFileSync(path.join(abs, f), "utf8");
      if (!sitemapEligible(html, now)) return;
      var loc = SITE_URL + "/match/" + f;
      entries.push({ loc: loc, lastmod: t.lastmod(loc, html) });
    });
  }
  t.save();
  writeIfChanged(path.join(root, "sitemap-fr.xml"), urlset(entries));
  return entries.length;
}

module.exports = {
  MIN_HUB_FIXTURES: MIN_HUB_FIXTURES, MIN_HUB_STANDING_ROWS: MIN_HUB_STANDING_ROWS, MIN_INDEXABLE_WORDS: MIN_INDEXABLE_WORDS,
  matchTitle: matchTitle, matchDescription: matchDescription, matchJsonLd: matchJsonLd, matchEvent: matchEvent,
  matchHeadExtras: matchHeadExtras, matchFactsHtml: matchFactsHtml, matchSummaryHtml: matchSummaryHtml, matchMetaBlock: matchMetaBlock,
  matchAlternates: matchAlternates, matchDirs: matchDirs, hasMatchVersion: hasMatchVersion,
  matchContentWords: matchContentWords, isThinMatch: isThinMatch, matchRobotsMeta: matchRobotsMeta,
  renderMatchPage: renderMatchPage, renderArchivedPage: renderArchivedPage, renderLeagueHub: renderLeagueHub,
  writeSeoPages: writeSeoPages, writeArchivedMatchPages: writeArchivedMatchPages, writeSeoSitemaps: writeSeoSitemaps,
  writeFrMatchSitemap: writeFrMatchSitemap, sitemapEligible: sitemapEligible, liensVersionFr: liensVersionFr
};

if (require.main === module) {
  var root = C.ROOT;
  var now = new Date();
  var today = now.toISOString().slice(0, 10);
  // Source locale = copie assainie deja publiee : match/<id>.json pour chaque
  // page match/<id>.html existante (memes donnees que matchsPublics).
  var matchDir = path.join(root, "match");
  var matchs = fs.existsSync(matchDir) ? fs.readdirSync(matchDir).filter(function (f) { return /^\d+\.json$/.test(f); }).map(function (f) {
    try { return JSON.parse(fs.readFileSync(path.join(matchDir, f), "utf8")); } catch (e) { return null; }
  }).filter(function (m) { return validMatch(m) && fs.existsSync(path.join(matchDir, m.id + ".html")); }) : [];
  var tpl = fs.readFileSync(path.join(root, "match.html"), "utf8");
  // Meme cycle de vie que le pipeline (registre, pages conservees, 301).
  var reg = LIFECYCLE.loadRegistry(root);
  var hist = null;
  try { hist = JSON.parse(fs.readFileSync(path.join(root, "historique.json"), "utf8")); } catch (e) {}
  var lc = LIFECYCLE.updateRegistry(reg, matchs, now, { historique: hist });
  if (process.argv.indexOf("--no-fr") === -1) {
    var keepFr = {}, runIds = {};
    matchs.forEach(function (m) {
      writeIfChanged(path.join(matchDir, m.id + ".html"), renderMatchPage(tpl, m, X_DEFAULT_DIR, { now: now, entry: reg.matches[String(m.id)] || null }));
      keepFr[m.id + ".html"] = true;
      runIds[String(m.id)] = true;
    });
    writeArchivedMatchPages(reg, { root: root, tpl: tpl, now: now, dirs: [X_DEFAULT_DIR], skipIds: runIds }).forEach(function (rel) { keepFr[rel.split("/").pop()] = true; });
    if (fs.existsSync(matchDir)) fs.readdirSync(matchDir).filter(function (f) { return /^\d+\.html$/.test(f) && !keepFr[f]; }).forEach(function (f) { fs.unlinkSync(path.join(matchDir, f)); });
    writeFrMatchSitemap(root, today, now);
  }
  var rep = writeSeoPages(matchs, { root: root, today: today, tpl: tpl, registry: reg, now: now });
  LIFECYCLE.saveRegistry(root, reg);
  LIFECYCLE.writeRedirects(root, reg);
  console.log("SEO pages : " + matchs.length + " match(s) ; " + rep.matchPages + " page(s) match localisee(s), " + rep.archivedPages + " conservee(s), " + rep.hubs + " page(s) championnat (" + rep.indexableHubs + " indexable(s)), " + rep.removed + " fichier(s) perime(s) supprime(s) ; sitemaps : " + rep.sitemaps.join(", ") + " ; cycle de vie : " + JSON.stringify(lc));
}
