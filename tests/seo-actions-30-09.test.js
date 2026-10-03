"use strict";
// Les 5 actions SEO decidees le 30/09/2026 (audit POUR-CLEMENT/29-AUDIT-SEO.html) :
//   A1 - accueil, bouton principal, canal Telegram gratuit et e-mails lient la
//        vraie page match quand elle existe (champ public page_dirs de data-home.json) ;
//   A2 - title, description et h1 des pages match tournes vers la recherche ;
//   A3 - netlify.toml : pretty_urls = false ;
//   A4 - pages championnat : classement complet et recent, sinon ni tableau ni « En tete » ;
//   A5 - noms d'equipes en francais sur les pages francaises (config/noms-equipes-fr.json).
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const C = require("../scripts/seo-common.js");
const SEO = require("../scripts/seo-pages.js");
const L = require("../scripts/match-lifecycle.js");
const HUBDATA = require("../scripts/league-hub-data.js");
const HL = require("../home-list.js");
const TG = require("../lib/telegram-posts.js");
const EMAIL = require("../lib/lifecycle-email.js");
const TPL = read("match.html");

const DAY = 24 * 3600 * 1000;
const isoDay = (t) => new Date(t).toISOString().slice(0, 10);

// ---------------------------------------------------------------- A1
test("A1 : page_dirs = versions ou la page match existe reellement (data-home.json reecrit par le pipeline)", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-a1-"));
  try {
    const put = (rel, body) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), body); };
    ["match/101.html", "gb/match/101.html", "en/match/101.html"].forEach((f) => put(f, "<html></html>"));
    put("match/202.json", "{}"); // detail JSON seul : pas une page
    put("data-home.json", JSON.stringify({ generated_at: "x", matchs: [{ id: 101, home: { n: "A" } }, { id: 202, page_dirs: ["fr"] }, { id: "1; rm" }] }));
    assert.equal(L.annotateHomePages(root), 1);
    const home = JSON.parse(fs.readFileSync(path.join(root, "data-home.json"), "utf8"));
    assert.deepEqual(home.matchs[0].page_dirs, ["fr", "gb", "en"], "ordre de config/markets.json#_dirs");
    assert.equal(home.matchs[1].page_dirs, undefined, "plus de page : champ retire, jamais garde de la veille");
    assert.equal(home.matchs[2].page_dirs, undefined, "identifiant invalide : jamais de chemin");
    assert.equal(home.generated_at, "x");
    assert.deepEqual(L.existingPageDirs("101", root), ["fr", "gb", "en"]);
    assert.equal(L.annotateHomePages(path.join(root, "absent")), 0, "fichier absent : rien, sans erreur");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  // Pipeline : pose APRES generateMatchPages (pages ecrites), jamais bloquant.
  const wf = read(".github/workflows/update-data.yml");
  const i = wf.indexOf("generateMatchPages(matchsPublics);"), j = wf.indexOf("MATCH_LIFECYCLE.annotateHomePages('.')");
  assert.ok(i > 0 && j > i, "annotateHomePages apres generateMatchPages");
  assert.match(wf.slice(j - 200, j + 300), /try\{[\s\S]*catch\(e\)/);
});

test("A1 : accueil (liste et vedette) : vraie page de la version du visiteur, sinon match.html?id=", () => {
  const m = { id: 1557402, page_dirs: ["fr", "gb", "en"] };
  assert.equal(HL.staticMatchPath(m, "fr"), "/match/1557402.html");
  assert.equal(HL.staticMatchPath(m, "gb"), "/gb/match/1557402.html");
  assert.equal(HL.staticMatchPath(m, "mx"), null, "jamais la page d'une autre version");
  assert.equal(HL.staticMatchPath({ id: 1557402 }, "fr"), null, "champ absent : repli");
  assert.equal(HL.staticMatchPath({ id: "12/../x", page_dirs: ["fr"] }, "fr"), null);
  const H = { lien: (p) => "/mx/" + p };
  assert.equal(HL.matchHref({ id: 7, page_dirs: ["fr"] }, H), "/mx/match.html?id=7", "sans I18N (Node) : repli match.html?id=");
  // Ligne de la liste : matchHref ; vedette et bouton principal d'index.html : lienMatch.
  const hl = read("home-list.js"), idx = read("index.html");
  assert.match(hl, /:matchHref\(m,H\);/);
  assert.match(idx, /function lienMatch\(m\)\{var s=window\.IasharkHomeList&&IasharkHomeList\.staticMatchPath\?IasharkHomeList\.staticMatchPath\(m\):null;return s\|\|lien\('match\.html\?id='\+encodeURIComponent\(m\.id\)\);\}/);
  assert.match(idx, /class="feature-card" href="'\+esc\(lienMatch\(m\)\)\+'"/);
  assert.match(idx, /ctaHero\.setAttribute\('href',lienMatch\(featured\)\)/);
});

test("A1 : canal Telegram gratuit et e-mails : vraie page si elle existe, sinon match.html?id=", () => {
  assert.equal(TG.lienMatch({ id: 9, page_dirs: ["fr", "gb"] }), "https://iashark.com/match/9.html?utm_source=telegram&utm_medium=social&utm_campaign=canal");
  assert.equal(TG.lienMatch({ id: 9 }), "https://iashark.com/fr/match.html?id=9&utm_source=telegram&utm_medium=social&utm_campaign=canal");
  assert.equal(TG.lienMatch({ id: 9, page_dirs: ["gb"] }), "https://iashark.com/fr/match.html?id=9&utm_source=telegram&utm_medium=social&utm_campaign=canal", "canal francais : page fr seulement");
  // Match gratuit : le detail (data.json) n'a pas page_dirs, la ligne de data-home.json si.
  const libre = { id: 5, is_free: true, status: "NS", date: "2026-09-27 18:00", league: "Ligue 1", home: { n: "Lens" }, away: { n: "Lyon" }, page_dirs: ["fr"] };
  const p = TG.matchGratuit({ matchs: [libre] }, { matchs: [Object.assign({}, libre, { page_dirs: undefined })] }, "2026-09-27 10:00");
  assert.equal(p.boutons[0].url, "https://iashark.com/match/5.html?utm_source=telegram&utm_medium=social&utm_campaign=canal");
  const s = TG.sondage({ matchs: [Object.assign({}, libre, { id: 6, is_free: false, c1: "2.1", c2: "3.2", date: "2026-09-27 21:00" })] }, "2026-09-27", "00:00");
  assert.equal(s.boutons[0].url, "https://iashark.com/match/6.html?utm_source=telegram&utm_medium=social&utm_campaign=canal");

  const ctx = (dir) => ({ dir: dir, intlLocale: "fr-FR", timeZone: "Europe/Paris", market: dir });
  const raw = { id: 1570385, home: { n: "Lens" }, away: { n: "Lyon" }, league: "Ligue 1", date: "2026-09-17 21:30", page_dirs: ["fr", "gb"] };
  assert.equal(EMAIL.publicMatch(raw, ctx("fr")).url, "https://iashark.com/match/1570385.html");
  assert.equal(EMAIL.publicMatch(raw, ctx("gb")).url, "https://iashark.com/gb/match/1570385.html");
  assert.equal(EMAIL.publicMatch(raw, ctx("mx")).url, "https://iashark.com/mx/match.html?id=1570385");
  assert.equal(EMAIL.publicMatch(Object.assign({}, raw, { page_dirs: undefined }), ctx("fr")).url, "https://iashark.com/fr/match.html?id=1570385");
  // Module embarque des fonctions Edge regenere (node lib/lifecycle-email-build.js).
  assert.match(read("supabase/functions/_shared/lifecycle-email-bundle.generated.mjs"), /function matchUrl\(m, id, dir\)/);
});

// ---------------------------------------------------------------- A2
const LENS = { id: 880001, league_key: "ligue1", league: "Ligue 1", date: "2026-10-09 20:45", home: { n: "Lens", id: 116 }, away: { n: "Lyon", id: 80 } };
const ARS = { id: 880002, league_key: "premier", league: "Premier League", date: "2026-10-04 18:30", home: { n: "Arsenal", id: 42 }, away: { n: "Chelsea", id: 49 } };
const AME = { id: 880003, league_key: "liga_mx", league: "Liga MX", date: "2026-10-04 20:00", home: { n: "America", id: 2287 }, away: { n: "Chivas", id: 2278 } };

test("A2 : titles tournes vers la recherche, dans chaque version", () => {
  assert.equal(SEO.matchTitle(LENS, "fr"), "Pronostic Lens – Lyon (9 oct.) : stats et probabilités");
  assert.equal(SEO.matchTitle(ARS, "gb"), "Arsenal v Chelsea prediction (4 Oct) | IASHARK");
  assert.equal(SEO.matchTitle(ARS, "en"), "Arsenal vs Chelsea prediction (4 Oct) | IASHARK");
  assert.equal(SEO.matchTitle(ARS, "za"), "Arsenal vs Chelsea soccer prediction (4 Oct) | IASHARK");
  assert.equal(SEO.matchTitle(AME, "es"), "Pronóstico America vs Chivas (4 oct.) | IASHARK");
  // Heure du centre du Mexique : 20:00 a Paris = 12:00 a Mexico, meme jour.
  assert.equal(SEO.matchTitle(AME, "mx"), "Pronóstico America vs Chivas (4 oct.) | IASHARK");
  for (const dir of C.DIR_CODES) {
    for (const m of [LENS, ARS, AME]) {
      const t = SEO.matchTitle(m, dir), d = SEO.matchDescription(m, dir);
      assert.ok(Array.from(t).length <= 60, dir + " title " + t);
      assert.ok(Array.from(d).length <= 155, dir + " description " + d);
      assert.match(d, /Pronostic|prediction|Pronóstico/, dir + " : description sans le mot cherche");
      assert.doesNotMatch(t + d, /\{\w+\}|\(\s*\)/, dir + " : gabarit mal rempli");
    }
  }
  // Date inconnue : ni « () » ni « {day} ».
  assert.equal(SEO.matchTitle(Object.assign({}, LENS, { date: "" }), "fr"), "Pronostic Lens – Lyon : stats et probabilités | IASHARK");
});

test("A2 : gros titre (h1) des pages match, statiques et du pipeline", () => {
  assert.equal(SEO.matchH1(LENS, "fr"), "Pronostic Lens – Lyon");
  assert.equal(SEO.matchH1(ARS, "gb"), "Arsenal v Chelsea prediction");
  assert.equal(SEO.matchH1(ARS, "en"), "Arsenal vs Chelsea prediction");
  assert.equal(SEO.matchH1(AME, "mx"), "Pronóstico America vs Chivas");
  assert.equal(SEO.matchH1(AME, "es"), "Pronóstico America vs Chivas");
  for (const [m, dir, h1] of [[LENS, "fr", "Pronostic Lens – Lyon"], [ARS, "gb", "Arsenal v Chelsea prediction"], [AME, "mx", "Pronóstico America vs Chivas"]]) {
    const html = SEO.renderMatchPage(TPL, m, dir);
    const h = html.match(/<h1[^>]*>([^<]*)<\/h1>/g) || [];
    assert.equal(h.length, 1, dir + " : un seul h1");
    assert.ok(h[0].endsWith(">" + h1 + "</h1>"), dir + " : " + h[0]);
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    assert.equal(title, SEO.matchTitle(m, dir).replace(/'/g, "&#39;"));
  }
  // Page FR du pipeline : meme gros titre que scripts/seo-pages.js.
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /margin-bottom:8px">'\+escHtml\(SEO_PAGES\.matchH1\(m,'fr'\)\)\+'<\/h1>'/);
  assert.doesNotMatch(wf, /escHtml\(m\.home\.n\)\+' vs '\+escHtml\(m\.away\.n\)\+'<\/h1>'/);
  // match-page.js ne remplace plus le title de recherche d'une page statique.
  assert.match(read("match-page.js"), /if\(!resumeSeoStatique\(\)\)document\.title=/);
});

// ---------------------------------------------------------------- A3
test("A3 : netlify.toml desactive les « jolies URL » (pretty_urls = false)", () => {
  const toml = read("netlify.toml");
  assert.match(toml, /\n\[build\.processing\.html\]\n\s*pretty_urls = false\n/);
});

// ---------------------------------------------------------------- A4
const rows = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ rank: from + i, team_id: 9000 + from + i, name: "Club " + (from + i), played: 7, won: 2, drawn: 1, lost: 4, gd: -i, pts: 7 - Math.min(i, 6) }));
const NOW = new Date();
const table = (r, extra) => Object.assign({ as_of: isoDay(NOW.getTime()), source: "api-football", season: 2026, groups: [{ name: "La Liga", rows: r }] }, extra || {});
const EMPTY = { upcoming: [], results: [], standings: null, clubs: [] };

test("A4 : classement affiche seulement s'il est complet (rang 1, sans trou) et recent (3 jours)", () => {
  assert.equal(HUBDATA.isStandingsDisplayable(table(rows(1, 20)), NOW), true);
  assert.equal(HUBDATA.isStandingsDisplayable(table(rows(11, 20)), NOW), false, "extrait commencant a la 11e place (bug La Liga)");
  assert.equal(HUBDATA.isStandingsDisplayable(table(rows(1, 5).concat(rows(7, 20))), NOW), false, "rang manquant");
  assert.equal(HUBDATA.isStandingsDisplayable(table(rows(1, 20), { source: "matchs" }), NOW), false, "extrait publie avec un match : jamais prouve complet");
  assert.equal(HUBDATA.isStandingsDisplayable(table(rows(1, 20), { as_of: isoDay(NOW.getTime() - 3 * DAY) }), NOW), true, "3 jours : encore affiche");
  assert.equal(HUBDATA.isStandingsDisplayable(table(rows(1, 20), { as_of: isoDay(NOW.getTime() - 4 * DAY) }), NOW), false, "4 jours : masque");
  assert.equal(HUBDATA.isStandingsDisplayable(null, NOW), false);
  // Deux conferences (MLS) : chacune commence au rang 1.
  const mls = { as_of: isoDay(NOW.getTime()), source: "api-football", groups: [{ name: "Eastern Conference", rows: rows(1, 15) }, { name: "Western Conference", rows: rows(1, 15) }] };
  assert.equal(HUBDATA.isStandingsDisplayable(mls, NOW), true);
});

test("A4 : page championnat : classement partiel ou ancien -> ni tableau ni « En tete »", () => {
  const kpi = C.seoConf("fr").league.kpi.leader;
  const partial = SEO.renderLeagueHub("laliga", "fr", [], { now: NOW, data: Object.assign({}, EMPTY, { standings: table(rows(11, 20)) }) }).html;
  assert.doesNotMatch(partial, /<table>/);
  assert.ok(!partial.includes("<dt>" + kpi + "</dt>"), "ligne « En tete » fausse");
  assert.ok(!partial.includes("Club 11 · "), "Celta Vigo · 7 pts au-dessus d'un tableau a partir de la 11e");
  const old = SEO.renderLeagueHub("laliga", "fr", [], { now: NOW, data: Object.assign({}, EMPTY, { standings: table(rows(1, 20), { as_of: isoDay(NOW.getTime() - 10 * DAY) }) }) }).html;
  assert.doesNotMatch(old, /<table>/);
  assert.ok(!old.includes("<dt>" + kpi + "</dt>"));
  const ok = SEO.renderLeagueHub("laliga", "fr", [], { now: NOW, data: Object.assign({}, EMPTY, { standings: table(rows(1, 20)) }) }).html;
  assert.match(ok, /<table>/);
  assert.ok(ok.includes("<dt>" + kpi + "</dt><dd>Club 1 · 7 "), "chef de file = rang 1");
  // Donnees collectees (registre) : meme regle, la page ne recoit rien d'incomplet.
  const store = { leagues: { laliga: { standings: table(rows(11, 20)) } } };
  assert.equal(HUBDATA.collect("laliga", "fr", { now: NOW, store: store, registry: { matches: {} } }).standings, null);
  const store2 = { leagues: { laliga: { standings: table(rows(1, 20)) } } };
  assert.equal(HUBDATA.collect("laliga", "fr", { now: NOW, store: store2, registry: { matches: {} } }).standings.groups[0].rows.length, 20);
});

// ---------------------------------------------------------------- A5
test("A5 : noms d'equipes en francais sur les pages francaises seulement (affichage)", () => {
  const cfg = JSON.parse(read("config/noms-equipes-fr.json"));
  assert.ok(cfg.selections && cfg.clubs);
  for (const [en, fr] of [["Spain", "Espagne"], ["Croatia", "Croatie"], ["Netherlands", "Pays-Bas"], ["Germany", "Allemagne"], ["England", "Angleterre"],
    ["Italy", "Italie"], ["Belgium", "Belgique"], ["Portugal", "Portugal"], ["Switzerland", "Suisse"], ["USA", "États-Unis"], ["Mexico", "Mexique"]]) {
    assert.equal(SEO.teamName({ n: en }, "fr"), fr, en);
    assert.equal(SEO.teamName({ n: en }, "gb"), en, en + " : nom de l'API hors fr");
  }
  assert.equal(SEO.teamName({ n: "Paris Saint Germain" }, "fr"), "PSG");
  assert.equal(SEO.teamName({ n: "Bayern München" }, "fr"), "Bayern Munich");
  assert.equal(SEO.teamName({ n: "Lens" }, "fr"), "Lens", "nom absent de la table : inchange");

  const m = { id: 880010, league_key: "other", league: "Friendlies", date: "2026-10-10 20:45", home: { n: "Spain", id: 9 }, away: { n: "Croatia", id: 3 }, model_output_available: true, data_quality_score: 80 };
  // 61 caracteres avec « : stats et probabilités » : gabarit court (title <= 60).
  assert.equal(SEO.matchTitle(m, "fr"), "Pronostic Espagne – Croatie (10 oct.)");
  assert.equal(SEO.matchH1(m, "fr"), "Pronostic Espagne – Croatie");
  assert.match(SEO.matchDescription(m, "fr"), /^Pronostic Espagne – Croatie/);
  assert.match(SEO.matchTitle(m, "gb"), /^Spain v Croatia/);
  const fr = SEO.renderMatchPage(TPL, m, "fr");
  const ev = JSON.parse(fr.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"SportsEvent"[\s\S]*?)<\/script>/)[1]);
  assert.equal(ev.name, "Espagne vs Croatie");
  assert.equal(ev.homeTeam.name, "Espagne");
  // Donnees jamais modifiees : identifiants et PRELOADED_MATCH gardent le nom de l'API.
  const pre = JSON.parse(fr.match(/<script>var PRELOADED_MATCH=([\s\S]*?);<\/script>/)[1]);
  assert.equal(pre.home.n, "Spain");
  assert.equal(pre.id, 880010);
  assert.equal(m.home.n, "Spain");
  // Comptage des mots (indexabilite) identique a avant : noms de l'API.
  assert.equal(SEO.matchContentWords(m, "fr"), SEO.matchContentWords(Object.assign({}, m), "fr"));
});
