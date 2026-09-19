"use strict";
// Vague 1 des audits SEO du 19/09/2026 (/en/ Etats-Unis, /gb/, /mx/) :
// donnees justes (conferences et phases des classements, villes des stades,
// classements complets des hubs), fuseaux et formats par version, aucune
// fuite de francais, Liga MX en anglais et /es/ -> /mx/, redirections des
// anciennes URLs, noms d'affichage des equipes, titre SEO conserve, journee
// publique, liens statiques de l'accueil, formulations prudentes.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const C = require("../scripts/seo-common.js");
const SEO = require("../scripts/seo-pages.js");
const HUBDATA = require("../scripts/league-hub-data.js");
const L = require("../scripts/match-lifecycle.js");
const B = require("../scripts/build-locales.js");
const SG = require("../lib/standings-groups.js");
const VENUE = require("../lib/venue.js");
const TEAMS = require("../lib/team-names.js");
const PREMIUM = require("../lib/premium-fields.js");
const TPL = read("match.html");

function head(html) { return html.split(/<\/head>/i)[0]; }
function visible(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]+>/g, " ");
}
function ldBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

// Ligne api-football /standings (forme brute).
function apiRow(rank, id, name, group, played, pts) {
  return { rank, team: { id, name }, points: pts, goalsDiff: 0, group, form: "WDLWW", description: null, all: { played, win: 1, draw: 1, lose: 1 } };
}
function apiGroup(name, ids, played) { return ids.map((id, i) => apiRow(i + 1, id, "Team " + id, name, played, 40 - i)); }

// ---------------------------------------------------------------------------
// 1. Classements : conferences, zones, phases.
test("groupes de classement : conferences paralleles gardees, phase terminee ecartee, nom du groupe", () => {
  const east = apiGroup("Eastern Conference", [1, 2, 3, 4], 25), west = apiGroup("Western Conference", [5, 6, 7, 8], 25);
  const mls = SG.currentPhaseGroups([east, west]);
  assert.deepEqual(mls.map((g) => g.name), ["Eastern Conference", "Western Conference"], "MLS : les deux conferences");
  assert.equal(SG.groupOfTeam([east, west], 6).name, "Western Conference");
  assert.equal(SG.groupLabel("Western Conference", "Major League Soccer", 2), "Western Conference");
  // Argentine : Apertura A/B (terminee, 16 matchs) puis Clausura A/B (en cours).
  const arg = [apiGroup("Apertura - Group A", [1, 2], 16), apiGroup("Apertura - Group B", [3, 4], 16), apiGroup("Clausura - Group A", [1, 2], 5), apiGroup("Clausura - Group B", [3, 4], 5)];
  assert.deepEqual(SG.currentPhaseGroups(arg).map((g) => g.name), ["Clausura - Group A", "Clausura - Group B"]);
  assert.equal(SG.groupOfTeam(arg, 3).name, "Clausura - Group B", "jamais l'Apertura terminee");
  // Colombie : Apertura puis Clausura ; Perou : Tabla Anual, Apertura, Clausura.
  assert.deepEqual(SG.currentPhaseGroups([apiGroup("Apertura", [1, 2], 19), apiGroup("Clausura", [1, 2], 10)]).map((g) => g.name), ["Clausura"]);
  assert.deepEqual(SG.currentPhaseGroups([apiGroup("Primera Division: Tabla Anual", [1, 2], 26), apiGroup("Primera Division: Apertura", [1, 2], 17), apiGroup("Primera Division: Clausura", [1, 2], 9)]).map((g) => g.name), ["Primera Division: Clausura"]);
  assert.equal(SG.groupLabel("Primera Division: Clausura", "Primera Division", 1), "Clausura");
  // Phase suivante listee mais pas commencee : la phase en cours reste affichee.
  assert.deepEqual(SG.currentPhaseGroups([apiGroup("Apertura", [1, 2], 5), apiGroup("Clausura", [1, 2], 0)]).map((g) => g.name), ["Apertura"]);
  // Classement unique au nom de la competition : aucun libelle de groupe.
  assert.equal(SG.groupLabel("Premier League", "Premier League", 1), null);
  assert.equal(SG.groupLabel("Liga MX: Apertura", "Liga MX", 1), "Apertura");
});

test("classements reels en cache (api-football) : phase en cours de chaque competition", () => {
  const cache = path.join(ROOT, "data/club-hubs/cache");
  const seen = {};
  for (const f of fs.readdirSync(cache)) {
    const j = JSON.parse(fs.readFileSync(path.join(cache, f), "utf8"));
    if (j.endpoint !== "/standings" || !j.response[0]) continue;
    const lg = j.response[0].league;
    seen[lg.id] = SG.currentPhaseGroups(lg.standings).map((g) => g.name);
  }
  if (seen[128]) assert.deepEqual(seen[128], ["Clausura - Group A", "Clausura - Group B"], "Argentine");
  if (seen[239]) assert.deepEqual(seen[239], ["Clausura"], "Colombie");
  if (seen[281]) assert.deepEqual(seen[281], ["Primera Division: Clausura"], "Perou");
  if (seen[39]) assert.equal(seen[39].length, 1, "Premier League : un seul classement");
});

test("pages championnat : classement COMPLET uniquement, conferences separees, « En tete » seulement pour un classement unique", () => {
  const now = new Date("2026-09-19T08:00:00Z");
  const store = HUBDATA.emptyStore();
  // Registre precedent : extrait publie avec un match (Premier League, rangs 2 a 18) -> jamais retenu.
  store.leagues.premier = { standings: { as_of: "2026-09-19", source: "matchs", season: null, groups: [{ name: "Premier League", rows: [{ rank: 2, name: "Manchester City", team_id: 50, pts: 12, played: 5 }] }] } };
  const mlsApi = { league: { id: 253, name: "Major League Soccer", season: 2026, standings: [apiGroup("Eastern Conference", [1602, 1604, 1614, 1613], 25), apiGroup("Western Conference", [1603, 1600, 1597, 1596], 25)] }, fetched_at: "2026-09-19T06:10:00Z" };
  const runMls = [{ id: 1, league_key: "mls", classement: { league_name: "Major League Soccer", standings: [{ rank: 1, name: "Vancouver", team_id: 1603, pts: 46, played: 24 }, { rank: 2, name: "X", team_id: 2, pts: 40, played: 24 }, { rank: 3, name: "Y", team_id: 3, pts: 40, played: 24 }, { rank: 4, name: "Z", team_id: 4, pts: 40, played: 24 }] } }];
  HUBDATA.updateStore(store, runMls, now, { root: path.join(ROOT, "tests/fixtures/__none__"), standings: { 253: mlsApi } });
  assert.equal(store.leagues.premier, undefined, "extrait « matchs » supprime du registre");
  const st = store.leagues.mls.standings;
  assert.equal(st.source, "api-football");
  assert.deepEqual(st.groups.map((g) => g.name), ["Eastern Conference", "Western Conference"]);
  const hub = SEO.renderLeagueHub("mls", "en", [], { store, now, data: { upcoming: [], results: [], clubs: [] } });
  const html = hub.html;
  assert.match(html, /<caption>Eastern Conference · 2026<\/caption>/);
  assert.match(html, /<caption>Western Conference · 2026<\/caption>/);
  assert.doesNotMatch(html, /<caption>(Major League Soccer|MLS)/, "jamais une conference titree du nom de la ligue");
  assert.doesNotMatch(html, /Top of the table/, "pas de « En tete » pour deux conferences");
  assert.match(html, /MLS standings/);
  // Classement unique complet : « En tete » = rang 1.
  const one = SEO.renderLeagueHub("premier", "gb", [], { now, data: { upcoming: [], results: [], clubs: [], standings: { as_of: "2026-09-19", source: "api-football", season: 2026, league_name: "Premier League", groups: [{ name: "Premier League", rows: [1, 2, 3, 4].map((i) => ({ rank: i, team_id: 40 + i, name: "Club " + i, pts: 20 - i, played: 5 })) }] } } });
  assert.match(one.html, /Top of the table<\/dt><dd>Club 1 · 19 pts/);
  // Extrait sans le rang 1 (ancien registre) : jamais affiche.
  assert.deepEqual(HUBDATA.displayGroups({ as_of: "2026-09-19", source: "matchs", groups: [{ name: "Premier League", rows: [{ rank: 2 }] }] }), []);
});

test("pipeline : classement publie depuis le groupe de chaque equipe, modele inchange (standings[0])", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /var grpH=STANDINGS_GROUPS\.groupOfTeam\(groupesSt,home\.id\), grpA=STANDINGS_GROUPS\.groupOfTeam\(groupesSt,away\.id\);/);
  assert.match(wf, /classementObj=\{league_name:lg\.name,group:libelleGrp\(grpH\|\|grpA\),standings:lignesSt,home:resumeEquipe\(stH,grpH\),away:resumeEquipe\(stA,grpA\)\};/);
  assert.match(wf, /STANDINGS_COMPLETS\[lg\.id\]=\{league:/);
  assert.match(wf, /standings:STANDINGS_COMPLETS\}\)/, "classements complets transmis aux pages championnat");
  // Entrees du modele : toujours standings[0] (aucun changement de calibration).
  assert.match(wf, /standingsCache\[lg\.id\]=\(stResp\.response&&stResp\.response\[0\]&&stResp\.response\[0\]\.league&&stResp\.response\[0\]\.league\.standings&&stResp\.response\[0\]\.league\.standings\[0\]\)\|\|\[\];/);
  assert.match(wf, /var entryH=standings\.find\(function\(s\)\{return s\.team\.id===home\.id;\}\);/);
});

test("page match et application : le groupe est nomme (conference), jamais « la ligue »", () => {
  const m = { id: 900001, league_key: "mls", league: "Major League Soccer", date: "2026-09-20 03:30", home: { n: "Colorado Rapids", id: 1610 }, away: { n: "Seattle Sounders", id: 1595 },
    classement: { league_name: "Major League Soccer", group: "Western Conference", standings: [
      { rank: 7, name: "Colorado Rapids", team_id: 1610, played: 25, won: 10, drawn: 5, lost: 10, gd: 1, pts: 35, group: "Western Conference" },
      { rank: 14, name: "Seattle Sounders", team_id: 1595, played: 23, won: 7, drawn: 7, lost: 9, gd: -3, pts: 28, group: "Western Conference" }] } };
  const snap = L.publicSnapshot(m);
  assert.equal(snap.classement.standings[0].group, "Western Conference");
  const html = SEO.renderMatchPage(TPL, m, "en");
  assert.match(visible(html), /Standings · Western Conference/);
  // Deux conferences : chaque ligne porte la sienne.
  const cross = Object.assign({}, m, { away: { n: "FC Cincinnati", id: 2242 }, classement: { league_name: "Major League Soccer", standings: [m.classement.standings[0], { rank: 3, name: "FC Cincinnati", team_id: 2242, played: 25, won: 13, drawn: 6, lost: 6, gd: 9, pts: 45, group: "Eastern Conference" }] } });
  const t2 = visible(SEO.renderMatchPage(TPL, cross, "en"));
  assert.match(t2, /Colorado Rapids: 35 pts from 25 matches \(10 W, 5 D, 10 L\), goal difference \+1 \(Western Conference\)/);
  assert.match(t2, /FC Cincinnati: 45 pts from 25 matches \(13 W, 6 D, 6 L\), goal difference \+9 \(Eastern Conference\)/);
  const mp = read("match-page.js");
  assert.match(mp, /const groupes=lignes\.map\(x=>x\[1\]\.group\|\|c\.group\|\|''\);/);
  assert.match(mp, /\[c\.league_name,memeGroupe\?groupes\[0\]:null\]/);
});

// ---------------------------------------------------------------------------
// 2. Stades : jamais une ville fausse.
test("stade : ville seulement si verifiee, sinon le stade seul ; meteo et JSON-LD idem", () => {
  // Donnees anterieures (ville non verifiable) : stade seul.
  assert.equal(VENUE.venueLabel({ nom: "Allianz Field - Sao Paulo" }), "Allianz Field");
  assert.equal(VENUE.venueLabel({ nom: "Dick's Sporting Goods Park - Trade City" }), "Dick's Sporting Goods Park");
  assert.equal(VENUE.venueLabel({ nom: "Leeds United (domicile)" }), null);
  // Nouveau format du pipeline : ville verifiee (stade rattache a api-football).
  assert.equal(VENUE.venueLabel({ nom: "Allianz Field - Saint Paul, Minnesota", ville: "Saint Paul, Minnesota" }), "Allianz Field - Saint Paul, Minnesota");
  assert.equal(VENUE.venueLabel({ nom: "Allianz Field", ville: "" }), "Allianz Field");
  assert.equal(VENUE.verifiedApiCity({ id: null, name: "Allianz Field", city: "Sao Paulo" }), null);
  assert.equal(VENUE.verifiedApiCity({ id: 0, name: "Dick's Sporting Goods Park", city: "Trade City" }), null);
  assert.equal(VENUE.verifiedApiCity({ id: 1617, name: "Allianz Field", city: "Saint Paul, Minnesota" }), "Saint Paul, Minnesota");
  const base = { id: 900002, league_key: "mls", league: "Major League Soccer", date: "2026-09-20 02:30", home: { n: "Minnesota United FC", id: 1612 }, away: { n: "Los Angeles Galaxy", id: 1605 } };
  const old = Object.assign({}, base, { stade: { nom: "Allianz Field - Sao Paulo", temp: "21C", desc: "nuageux", weather_source: "openweathermap", weather_forecast_at: "2026-09-20T00:00:00.000Z" } });
  const html = SEO.renderMatchPage(TPL, old, "en");
  // PRELOADED_MATCH garde la donnee brute du run (reecrite au prochain pipeline) ;
  // rien de visible ni de structure ne la reprend.
  assert.doesNotMatch(html.replace(/<script>var PRELOADED_MATCH=[\s\S]*?<\/script>/, ""), /Sao Paulo/, "jamais la ville fausse, ni visible ni en JSON-LD");
  const ev = ldBlocks(html).find((b) => b["@type"] === "SportsEvent");
  assert.deepEqual(ev.location, { "@type": "Place", name: "Allianz Field" });
  const ok = SEO.matchEvent(Object.assign({}, base, { stade: { nom: "Allianz Field - Saint Paul, Minnesota", ville: "Saint Paul, Minnesota" } }), "en");
  assert.deepEqual(ev.homeTeam.name, "Minnesota United FC");
  assert.deepEqual(ok.location.address, { "@type": "PostalAddress", addressLocality: "Saint Paul", addressRegion: "Minnesota" });
  // Application : meteo cachee pour une ville non verifiee.
  const VMM = require("../lib/match-view-model.js");
  const vmOld = VMM.buildMatchViewModel(old);
  assert.equal(vmOld.conditions.venue, "Allianz Field");
  assert.equal(vmOld.conditions.weather, null, "meteo de Sao Paulo jamais affichee");
  const vmNew = VMM.buildMatchViewModel(Object.assign({}, old, { stade: Object.assign({}, old.stade, { nom: "Allianz Field - Saint Paul, Minnesota", ville: "Saint Paul, Minnesota" }) }));
  assert.ok(vmNew.conditions.weather, "meteo d'une ville verifiee affichee");
  // Pipeline : ville et meteo uniquement depuis un stade rattache.
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /getWeather\(VENUE\.verifiedApiCity\(f\.venue\)\|\|'',f\.date\)/);
  assert.match(wf, /ville:VENUE\.verifiedApiCity\(f\.venue\)\|\|'',/);
  assert.doesNotMatch(wf, /f\.venue\.city\?' - '\+f\.venue\.city/);
});

// ---------------------------------------------------------------------------
// 3. Fuseaux et formats par version.
test("fuseaux des versions : ET pour /en/ (UTC entre parentheses, format americain), heure locale ailleurs", () => {
  const TZ = { fr: "Europe/Paris", gb: "Europe/London", za: "Africa/Johannesburg", mx: "America/Mexico_City", es: "Europe/Madrid", de: "Europe/Berlin", it: "Europe/Rome", pt: "Europe/Lisbon", en: "America/New_York" };
  for (const d of C.DIR_CODES) assert.equal(C.seoConf(d).tz, TZ[d], d);
  assert.equal(C.intlLocaleFor("en"), "en-US");
  assert.equal(C.ogLocale("en"), "en_US");
  // Nashville SC vs Chicago Fire : 01:30 Paris le 20/09 = 21:30 ET le 19/09.
  const m = { id: 1490493, league_key: "mls", league: "Major League Soccer", date: "2026-09-20 03:30", home: { n: "Nashville SC", id: 9569 }, away: { n: "Chicago Fire", id: 1607 }, stade: { nom: "GEODIS Park" } };
  const html = SEO.renderMatchPage(TPL, m, "en");
  const t = visible(html);
  assert.match(t, /Saturday, September 19, 2026, 9:30 PM ET \(01:30 UTC\)/, "bloc d'informations : ET + UTC");
  assert.match(html, /<time data-seo-date datetime="2026-09-19">September 19, 2026<\/time>/, "jour du match dans le fuseau de la version");
  const ev = ldBlocks(html).find((b) => b["@type"] === "SportsEvent");
  assert.equal(ev.startDate, "2026-09-19T21:30:00-04:00", "startDate avec le decalage");
  assert.match(SEO.matchDescription(m, "en"), /September 19, 2026, 9:30 PM ET/);
  // /mx/ : Clasico du samedi 19 a 21:15 heure du centre (date correcte sous le H1).
  const clasico = { id: 1550971, league_key: "liga_mx", league: "Liga MX", date: "2026-09-20 05:15", home: { n: "Club America", id: 2287 }, away: { n: "Guadalajara Chivas", id: 2278 } };
  const mx = SEO.renderMatchPage(TPL, clasico, "mx");
  assert.match(mx, /<time data-seo-date datetime="2026-09-19">19 de septiembre de 2026<\/time>/);
  assert.match(visible(mx), /21:15 h \(tiempo del centro de México\)/);
  // Autres versions : heure et libelle de leur fuseau.
  assert.match(visible(SEO.renderMatchPage(TPL, clasico, "fr")), /05:15 \(heure de Paris\)/);
  const hub = SEO.renderLeagueHub("mls", "en", [m], { data: { upcoming: [{ id: "1490493", t: Date.parse("2026-09-20T01:30:00Z"), home: m.home, away: m.away, href: "/en/match/1490493.html" }], results: [], clubs: [] } });
  assert.match(hub.html, /<span>9:30 PM ET \(01:30 UTC\)<\/span>/);
  assert.match(hub.html, /Kickoff times in US Eastern Time \(ET\), with UTC in brackets\./);
  assert.doesNotMatch(hub.html, /Kick-off times are shown in UTC/);
});

// ---------------------------------------------------------------------------
// 4. Aucune fuite de francais.
test("aucun francais dans le HTML statique d'une page match non francaise (barre du bas, fuseau, JSON-LD)", () => {
  assert.match(TPL, /<b data-i18n="nav\.home">Accueil<\/b>/, "barre du bas traduite au build (data-i18n)");
  assert.match(read("joueur.html"), /<b data-i18n="nav\.account">Compte<\/b>/);
  const m = { id: 900003, league_key: "premier", league: "Premier League", date: "2026-09-20 17:30", home: { n: "Fulham", id: 36 }, away: { n: "Manchester United", id: 33 }, stade: { nom: "Craven Cottage" } };
  for (const d of ["en", "gb", "za", "es", "de", "it", "pt", "mx"]) {
    const html = SEO.renderMatchPage(TPL, m, d);
    const t = visible(html) + " " + head(html);
    assert.doesNotMatch(t, /\b(Accueil|Outils|Compte|Navigation principale|heure de Paris|Chargement de l|Coup d'envoi|Informations du match)\b/, d);
  }
});

// ---------------------------------------------------------------------------
// 5. Liga MX : /en/ en anglais, /es/ -> /mx/, hreflang es-MX + es-US.
test("Liga MX : pages /en/ indexables, /es/ redirige vers /mx/, /mx/ porte es-MX, es-US et es", () => {
  assert.deepEqual(L.matchDirsFor("liga_mx").slice().sort(), ["en", "fr", "mx"]);
  const m = { id: 1550966, league_key: "liga_mx", league: "Liga MX", date: "2026-09-19 03:00", home: { n: "Puebla", id: 2291 }, away: { n: "Atlante FC", id: 2312 } };
  const alts = SEO.matchAlternates(m).map((a) => a.hreflang + " " + a.href);
  assert.deepEqual(alts.sort(), [
    "en https://iashark.com/en/match/1550966.html", "es https://iashark.com/mx/match/1550966.html", "es-MX https://iashark.com/mx/match/1550966.html",
    "es-US https://iashark.com/mx/match/1550966.html", "fr https://iashark.com/match/1550966.html", "x-default https://iashark.com/en/match/1550966.html"
  ]);
  // Hub /en/ Liga MX : indexable (contenu stable), hreflang, copie anglaise.
  const hub = SEO.renderLeagueHub("liga_mx", "en", [], { data: { upcoming: [1, 2, 3].map((i) => ({ id: String(i), t: Date.parse("2026-09-25T02:00:00Z"), home: { n: "A" + i }, away: { n: "B" + i } })), results: [], clubs: [] } });
  assert.equal(hub.indexable, true);
  assert.doesNotMatch(head(hub.html), /noindex/);
  assert.match(head(hub.html), /<title>Liga MX Predictions, Fixtures &amp; Table \| IASHARK<\/title>/);
  assert.match(head(hub.html), /hreflang="es-US" href="https:\/\/iashark\.com\/mx\/leagues\/liga-mx\.html"/);
  // Jamais le francais en repli pour un lecteur anglophone.
  assert.equal(C.nearestDir("en", ["fr", "mx"]), "mx");
  assert.deepEqual(C.nearestDirs("gb", ["fr", "mx", "en"]).slice(0, 1), ["en"]);
  // /es/ : plus de hub ni de page Liga MX, 301 forcee vers /mx/.
  const redirects = B.redirectsContent();
  assert.match(redirects, /^\/es\/leagues\/liga-mx\.html\s+\/mx\/leagues\/liga-mx\.html\s+301!$/m);
  assert.equal(L.retiredDirTarget({ league_key: "liga_mx", dirs: ["fr", "mx", "en"], status: "archived" }, "es", "1550966"), "/mx/match/1550966.html");
  assert.equal(L.retiredDirTarget({ league_key: "liga_mx", dirs: ["fr", "mx", "en"], status: "archived" }, "en", "1550948"), "/en/leagues/liga-mx.html", "anciennes URLs /en/ : hub anglais, plus la page francaise");
});

test("accueil : les cartes de match visent la page statique de la version quand elle existe", () => {
  global.window = undefined;
  const LN = require("../lib/league-names.js");
  assert.equal(LN.staticMatchPath(1490493, "mls", "en"), "/en/match/1490493.html");
  assert.equal(LN.staticMatchPath(1550966, "liga_mx", "en"), "/en/match/1550966.html");
  assert.equal(LN.staticMatchPath(1550966, "liga_mx", "es"), null, "hors perimetre : repli match.html?id=");
  assert.equal(LN.staticMatchPath(1550966, "liga_mx", "fr"), "/match/1550966.html");
  assert.equal(LN.staticMatchPath("x", "mls", "en"), null);
  // home-list.js : meme regle via I18N.dir.
  const sandbox = { window: { I18N: { dir: "en", t: (k, f) => f, localeTag: () => "en-US", href: (p) => "/en/" + p } } };
  sandbox.window.window = sandbox.window;
  vm.createContext(sandbox);
  vm.runInContext(read("lib/league-names.js"), sandbox);
  vm.runInContext(read("lib/team-names.js"), sandbox);
  vm.runInContext(read("home-list.js"), sandbox);
  const HL = sandbox.window.IasharkHomeList;
  const H = HL.defaultHelpers();
  assert.equal(H.matchHref({ id: 1490493, league_key: "mls" }, H), "/en/match/1490493.html");
  assert.equal(H.matchHref({ id: 1493137, league_key: "jleague_inconnue" }, H), "/en/match.html?id=1493137");
  assert.equal(H.teamName({ id: 2287, n: "Club America" }), "América");
});

// ---------------------------------------------------------------------------
// 6. Anciennes URLs : 301 sans chaine ni boucle.
test("anciennes URLs /en/ supprimees le 21/07 : 301 vers une page existante, sans chaine ni boucle", () => {
  const rules = B.legacyRedirectRules();
  assert.ok(rules.length >= 300, "au moins 300 anciennes URLs couvertes (" + rules.length + ")");
  const text = B.redirectsContent();
  const all = text.split("\n").filter((l) => l.trim() && l[0] !== "#").map((l) => l.trim().split(/\s+/));
  const sources = new Set(all.map((r) => r[0]));
  for (const [from, to] of rules) {
    assert.ok(from.indexOf("/en/") === 0, from);
    assert.notEqual(from, to, "boucle " + from);
    const rel = to.replace(/^\//, "");
    assert.ok(fs.existsSync(path.join(ROOT, /\/$/.test(to) ? rel + "index.html" : rel)), "cible absente " + to);
    assert.ok(!sources.has(to), "chaine : " + from + " -> " + to + " est elle-meme redirigee");
    assert.ok(!fs.existsSync(path.join(ROOT, from.replace(/^\//, ""))) || /\*$/.test(from), "URL source de nouveau servie : " + from);
  }
  assert.ok(rules.some((r) => r[0] === "/en/world-cup-2026/*"), "Coupe du monde 2026 : prefixe");
  assert.ok(rules.some((r) => r[0] === "/en/match/1899-hoffenheim-vs-vfl-wolfsburg-2026-03-14.html" && r[1] === "/en/leagues/bundesliga.html"), "competition lue dans la page supprimee");
  // Avant la 404 traduite (Netlify applique la premiere regle).
  const i404 = all.findIndex((r) => r[0] === "/en/*" && r[2] === "404");
  const iWc = all.findIndex((r) => r[0] === "/en/world-cup-2026/*");
  assert.ok(iWc !== -1 && iWc < i404);
});

// ---------------------------------------------------------------------------
// 7. Noms d'affichage des equipes.
test("noms d'affichage : ids api-football verifies, jamais un autre club, titres/H1/JSON-LD/application", () => {
  const cfg = JSON.parse(read("config/team-display-names.json"));
  const names = {};
  for (const [id, t] of Object.entries(cfg.teams)) {
    assert.match(id, /^\d+$/);
    assert.ok(t.name && t.feedName && t.name !== t.feedName, id);
    assert.equal(TEAMS.displayName({ id: Number(id), n: t.feedName }), t.name);
    names[id] = t;
  }
  // Coherence avec le flux reel (classements en cache, matchs publics) : meme id, meme nom de flux.
  const cache = path.join(ROOT, "data/club-hubs/cache");
  for (const f of fs.readdirSync(cache)) {
    const j = JSON.parse(fs.readFileSync(path.join(cache, f), "utf8"));
    if (j.endpoint !== "/standings" || !j.response[0]) continue;
    for (const g of j.response[0].league.standings) for (const r of g) {
      if (names[r.team.id]) assert.equal(r.team.name, names[r.team.id].feedName, "id " + r.team.id);
    }
  }
  assert.equal(TEAMS.displayName({ id: 42, n: "Arsenal" }), "Arsenal", "sans entree : nom du flux");
  const m = { id: 1550971, league_key: "liga_mx", league: "Liga MX", date: "2026-09-20 05:15", home: { n: "Club America", id: 2287 }, away: { n: "Guadalajara Chivas", id: 2278 } };
  assert.match(SEO.matchTitle(m, "mx"), /América vs Chivas/);
  const html = SEO.renderMatchPage(TPL, m, "mx");
  assert.match(html, /<h1[^>]*>América vs Chivas/);
  const ev = ldBlocks(html).find((b) => b["@type"] === "SportsEvent");
  assert.deepEqual([ev.homeTeam.name, ev.homeTeam.alternateName, ev.awayTeam.name, ev.awayTeam.alternateName], ["América", "Club America", "Chivas", "Guadalajara Chivas"]);
  assert.match(read("match.html"), /<script src="\/lib\/team-names\.js"><\/script><script src="\/lib\/venue\.js"><\/script><script src="\/lib\/match-view-model\.js">/);
  assert.equal(require("../lib/match-view-model.js").buildMatchViewModel(m).identity.home.name, "América");
  // Titres /en/ : « soccer » la ou il est naturel, jamais « picks » ni « tips ».
  const mls = { id: 1490493, league_key: "mls", league: "Major League Soccer", date: "2026-09-20 03:30", home: { n: "Nashville SC", id: 9569 }, away: { n: "Chicago Fire", id: 1607 } };
  assert.equal(SEO.matchTitle(mls, "en"), "Nashville SC vs Chicago Fire prediction & stats – MLS soccer");
  const enSeo = Object.assign({}, C.seoConf("en")); delete enSeo._readme;
  assert.doesNotMatch(JSON.stringify(enSeo), /\bpicks?\b|\btips?\b/i);
  assert.deepEqual(C.seoConf("en").home.priority_leagues.slice(0, 3), ["mls", "premier", "liga_mx"]);
});

// ---------------------------------------------------------------------------
// 8. Titre SEO conserve, journee publique, formulations.
test("page match statique : le titre SEO n'est jamais remplace au rendu ; titre localise sur match.html?id=", () => {
  const src = read("match-page.js");
  assert.doesNotMatch(src, /\n  document\.title=`\$\{vm\.identity/, "ancien titre force");
  assert.match(src, /const statique=typeof window\.FIXED_MATCH_ID!=='undefined'\|\|\(typeof IASHARK_DEMO!=='undefined'&&IASHARK_DEMO\);\n  if\(!statique\)document\.title=tf\('match_page\.document_title'/);
  for (const l of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(read("i18n/dict/" + l + ".json"));
    assert.match(d.match_page.document_title, /\{home\}.*\{away\}/, l);
  }
  // Execution reelle : page statique -> titre intact ; shell dynamique -> titre localise.
  function run(fixed) {
    const doc = { title: "Nashville SC vs Chicago Fire prediction & stats – MLS soccer", getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], body: { classList: { toggle() {} } }, addEventListener() {} };
    const w = { document: doc, I18N: { t: (k, f) => f, localeTag: () => "en-US" }, IasharkMatchViewModel: require("../lib/match-view-model.js"), addEventListener() {}, location: { search: "" } };
    if (fixed) w.FIXED_MATCH_ID = "1490493";
    const ctx = vm.createContext(Object.assign({ window: w, document: doc, IasharkMatchViewModel: w.IasharkMatchViewModel }, w));
    const code = src.replace(/^\(function\(\)\{'use strict';/, "").replace(/\}\)\(\);\s*$/, "");
    const fn = code.match(/function viewModel\(raw\)\{[\s\S]*?\n\}/)[0];
    vm.runInContext("function tf(k,f,v){return String(f).replace(/\\{(\\w+)\\}/g,(m,x)=>v[x]);}" + fn + ";viewModel({home:{n:'Nashville SC',id:9569},away:{n:'Chicago Fire',id:1607}});", ctx);
    return doc.title;
  }
  assert.equal(run(true), "Nashville SC vs Chicago Fire prediction & stats – MLS soccer");
  assert.equal(run(false), "Nashville SC vs Chicago Fire — IASHARK");
});

test("journee (league.round) : champ PUBLIC garde par le pipeline et l'instantane", () => {
  const wf = read(".github/workflows/update-data.yml");
  assert.match(wf, /round:lg\.round\|\|null,/);
  assert.ok(!PREMIUM.PREMIUM_FIELDS.includes("round"), "round n'est pas un champ premium");
  const snap = L.publicSnapshot({ id: 1, league_key: "liga_mx", date: "2026-09-19 21:00", round: "Apertura - 9", home: { n: "A", id: 1 }, away: { n: "B", id: 2 } });
  assert.equal(snap.round, "Apertura - 9");
  assert.deepEqual(PREMIUM.deepPremiumLeaks(snap), []);
  const split = require("../lib/public-data-split.js");
  assert.ok(!split.DETAIL_ONLY_FIELDS.includes("round"), "round aussi dans la liste legere de l'accueil");
});

test("formulations : plus de « n'utilise jamais les cotes », d'« Edge Detector » ni de « BANKROLL (€) » hors EUR", () => {
  const files = ["fr", "gb", "za", "en", "mx", "es", "de", "it", "pt"].map((d) => "i18n/seo/" + d + ".json")
    .concat(["fr", "en", "es", "es-mx", "de", "it", "pt"].map((l) => "i18n/dict/" + l + ".json"), ["landing.html", "gb/landing.html", "za/landing.html", "mx/landing.html"]);
  const banned = /never uses? the odds|never using the odds|sans jamais utiliser les cotes|nunca usa (los momios|las cuotas|as odds)|sin usar nunca (los momios|las cuotas)|nie die Quoten|ohne jemals die Quoten|non usa mai le quote|senza mai usare le quote|sem nunca usar as odds/i;
  for (const f of files) assert.doesNotMatch(read(f), banned, f);
  const en = JSON.parse(read("i18n/dict/en.json")).tools_page;
  assert.equal(en.scan_title, "Odds Gap Finder");
  for (const k of ["scan_title", "scan_sub", "scan_pro_title", "scan_filter_edge_label", "scan_sort_edge", "fair_result_label_gap", "fair_note_favourable", "stake_no_edge_note", "kelly_bankroll", "modal_stake_label", "kelly_no_edge_stake"]) {
    assert.doesNotMatch(en[k], /\bedge\b|€/i, k);
  }
  assert.match(en.stake_result_label, /illustration only/);
  const mxd = JSON.parse(read("i18n/dict/es-mx.json")).tools_page;
  for (const k of ["kelly_bankroll", "modal_stake_label", "kelly_no_edge_stake"]) assert.doesNotMatch(mxd[k], /€/, "mx : pas d'euro (" + k + ")");
  for (const l of ["es", "es-mx", "de", "it", "pt"]) assert.doesNotMatch(JSON.parse(read("i18n/dict/" + l + ".json")).tools_page.scan_title, /ventaja|Vorteil|vantagg|vantagem/i, l);
});

test("aide jeu responsable : ressource supplementaire par version, jamais inventee", () => {
  const cfg = { _helplines: { us: { name: "National Problem Gambling Helpline", phone: "1-800-MY-RESET", url: "https://www.ncpgambling.org/help-treatment/" } }, _dirs: { en: { helplineExtra: "us" }, gb: {} } };
  assert.equal(B.helplineExtraFor("en", cfg).phone, "1-800-MY-RESET");
  assert.equal(B.helplineExtraFor("gb", cfg), null);
  assert.equal(B.helplineExtraFor("en", { _helplines: {}, _dirs: { en: { helplineExtra: "absente" } } }), null, "cle inconnue : rien");
  // Marqueurs presents (caches par defaut) sur l'accueil et la page match.
  assert.match(read("match.html"), /<p data-market-helpline-extra-if hidden>/);
  assert.match(read("index.html"), /data-market-helpline-extra-if hidden/);
  // /en/ : 21+ la ou la loi de l'Etat l'exige (source : ncgaming.gov), 18+ conserve.
  assert.match(C.seoConf("en").match.disclaimer, /18\+ \(21\+ where required by state law\)/);
});

test("aide jeu responsable des pages statiques : ligne GamCare sur /gb/, ligne americaine sur /en/, meme balisage que les generateurs", () => {
  const gb = B.helplineFor("gb"), us = B.helplineExtraFor("en");
  assert.equal(gb.url, "https://www.gamcare.org.uk");
  assert.equal(us.phone, "1-800-MY-RESET");
  const htmlIn = (dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith(".html")).map((f) => dir + "/" + f);
  // /gb/ : plus aucun lien vers begambleaware.org (pages club, articles, landing).
  const gbPages = htmlIn("gb/clubs").concat(htmlIn("gb/articles"), ["gb/landing.html"]);
  gbPages.forEach((rel) => assert.doesNotMatch(read(rel), /href="https?:\/\/(www\.)?begambleaware\.org/i, rel));
  htmlIn("gb/clubs").forEach((rel) => assert.ok(read(rel).includes('<a href="https://www.gamcare.org.uk" rel="noopener" data-market-helpline="name">'), rel + " : ligne GamCare"));
  assert.doesNotMatch(read("content/local-articles/gb.json"), /begambleaware\.org/i);
  // /en/ : ligne americaine a cote de Gambling Therapy (pages club et championnat).
  htmlIn("en/clubs").concat(htmlIn("en/leagues")).forEach((rel) => {
    const foot = read(rel).split('<footer class="foot">')[1] || "";
    assert.ok(foot.includes("gamblingtherapy.org") && foot.includes(us.url) && foot.includes(us.phone), rel + " : Gambling Therapy + " + us.phone);
  });
});
