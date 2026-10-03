"use strict";
// Liste des matchs de l'accueil (home-list.js, maquette v2 validee le
// 15/09/2026, integree le 16/09). Rendu teste en Node, sans navigateur :
//   - ligne verrouillee : AUCUN champ premium lu (Proxy), aucun chiffre, seul le
//     niveau public prob_band (3 valeurs) ;
//   - Pro confirme / match offert : « Proba. x/10 », jauge, marche ;
//   - statut, derby, favoris (lib/fav-leagues.js), suivi du tunnel, vocabulaire.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const HL = require("../home-list.js");
const FL = require("../lib/fav-leagues.js");
const PREMIUM = require("../lib/premium-fields.js");

const NOW = Date.parse("2026-09-16T16:00:00Z");
function helpers(ts) {
  const H = HL.defaultHelpers();
  return Object.assign(H, {
    leagueName: (m) => m.league || m.league_key,
    heure: () => "20:00",
    matchTimestamp: () => (ts == null ? NOW + 3 * 3600e3 : ts),
    matchDay: () => "2026-09-16",
    translateMarket: (r) => "Plus de 2,5 buts (" + r + ")",
    marketIdLabel: () => null,
    hasReliableModelOutput: () => true,
    lien: (p) => "/gb/" + p,
  });
}
const favs = { has: () => false, list: () => [] };
const ctx = (extra) => Object.assign({ isPro: false, freeMatchId: null, simulations: 5000, nowTs: NOW, favorites: favs, collapsed: {}, lockedHref: "match" }, extra || {});
const base = (extra) => Object.assign({ id: 1570383, league_key: "laliga", league: "La Liga", home: { n: "Alaves", id: 542 }, away: { n: "Valencia", id: 532 }, date: "2026-09-16 20:00", data_quality_label: "élevée", has_signal: true }, extra || {});
const SECRET = { conf: 7.7, pari_rec: "Over 2.5", market_id: "over-25", cote_rec: 1.93, model_probability: 77.4, markets_compared: [{ id: "over-25", probability: 77.4 }], edge: 9.1, marche: "TOTAL_BUTS" };

// Match qui enregistre toute lecture d'un champ premium.
function spyMatch(extra) {
  const reads = [];
  const target = Object.assign(base(extra), SECRET);
  const m = new Proxy(target, { get(t, k) { if (typeof k === "string" && PREMIUM.PREMIUM_FIELDS.includes(k)) reads.push(k); return t[k]; } });
  return { m, reads };
}
const zoneOf = (html) => (html.match(/<span class="hl-zone[^"]*">([\s\S]*)<\/span><\/a>/) || [])[1] || "";
const setStore = (ids) => ({ has: (k) => ids.map(String).includes(String(k)), list: () => ids.map(String) });
const strip = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ");

test("ligne verrouillee : aucun champ premium lu, aucun chiffre ni pari dans le HTML", () => {
  for (const band of [undefined, "high", "good", "moderate"]) {
    const { m, reads } = spyMatch(band ? { prob_band: band } : {});
    const html = HL.renderMatchRow(m, ctx(), helpers(), 0);
    assert.deepEqual(reads, [], "champ premium lu pour une ligne verrouillee (" + band + ")");
    assert.match(html, /class="hl-row hl-grid is-locked/);
    assert.doesNotMatch(html, /\/10|Proba\.\s*\d|hl-gauge|hl-market|Over|over-25|7[,.]7|77[,.]4|1[,.]93|TOTAL_BUTS/);
    assert.doesNotMatch(strip(zoneOf(html)), /\d/, "chiffre dans la zone droite verrouillee");
    assert.match(html, /href="\/gb\/match\.html\?id=1570383"/, "ligne verrouillee -> page match (mur Pro)");
    assert.match(html, /data-track-kind="home_row_lock"/);
    assert.doesNotMatch(html, /"conf"|data-conf|conf=/);
  }
});

test("pastille de niveau : 3 libelles, 3 barres (3/3, 2/3, 1/3), note « pas une garantie », valeur hors liste ignoree", () => {
  const expected = { high: ["Probabilité élevée", 3], good: ["Bonne probabilité", 2], moderate: ["Probabilité modérée", 1] };
  for (const band of Object.keys(expected)) {
    const html = HL.renderMatchRow(base({ prob_band: band }), ctx(), helpers(), 0);
    const pill = html.match(/<span class="hl-band is-[a-z]+"[\s\S]*?<span class="hl-band-i" aria-hidden="true">i<\/span><\/span>/)[0];
    assert.match(pill, new RegExp('class="hl-band is-' + band + '"'));
    assert.match(pill, new RegExp(expected[band][0]));
    assert.equal((pill.match(/<i class="on"><\/i>/g) || []).length, expected[band][1]);
    assert.match(pill, /title="Estimation du modèle, pas une garantie\. Détail et pari réservés aux abonnés Pro\."/);
    assert.match(html, /aria-label="[^"]*Estimation du modèle, pas une garantie/);
    assert.doesNotMatch(pill, /confiance/i);
  }
  const bad = HL.renderMatchRow(base({ prob_band: "77" }), ctx(), helpers(), 0);
  assert.doesNotMatch(bad, /hl-band/);
  assert.equal(HL.probBandOf({ prob_band: "high" }), "high");
  assert.equal(HL.probBandOf({ prob_band: 0.8 }), null);
});

test("Pro confirme ou match offert : Proba. x/10 et jauge, jamais le marche ; sans signal : pas de pari force", () => {
  const pro = HL.renderMatchRow(Object.assign(base({ prob_band: "high" }), SECRET), ctx({ isPro: true }), helpers(), 0);
  assert.match(pro, /is-open/);
  assert.match(pro, /<b>7,7<\/b><small>\/10<\/small>/);
  assert.match(pro, /hl-gauge/);
  // Le marche retenu a quitte la liste le 16/09/2026 : il se lit sur la fiche
  // du match. Ni a l'ecran, ni dans l'aria-label — sinon le pari repart par le
  // lecteur d'ecran.
  assert.doesNotMatch(pro, /Plus de 2,5 buts/, "le marche retenu est revenu dans la liste");
  assert.doesNotMatch(pro, /Marché/, "le marche retenu est revenu dans la liste");
  assert.doesNotMatch(pro, /hl-band|hl-lockpill/, "le Pro garde la note exacte, pas la pastille");
  const free = HL.renderMatchRow(Object.assign(base({ is_free: true }), SECRET), ctx({ freeMatchId: 1570383, hasAccount: true }), helpers(), 0);
  assert.match(free, /is-open is-free/);
  assert.match(free, /hl-tag-free">Offert</);
  const none = HL.renderMatchRow(base({ has_signal: false, no_signal: true }), ctx(), helpers(), 0);
  assert.match(none, /Pas de signal clair/);
  assert.match(none, /Aucun pari forcé/);
  assert.doesNotMatch(none, /Analyse prête|hl-lockpill/);
});

test("statut : champ API public prioritaire, statut en direct perime ignore, estimation signalee", () => {
  const H = helpers(NOW - 30 * 60e3);
  assert.equal(HL.countdown(base({ status: "FT" }), H, NOW).kind, "finished");
  assert.equal(HL.countdown(base({ status: "FT" }), H, NOW).estimated, false);
  assert.equal(HL.countdown(base({ status: "PST" }), helpers(NOW + 3600e3), NOW).kind, "postponed");
  assert.equal(HL.countdown(base({ status: "2H" }), H, NOW).kind, "live");
  const stale = HL.countdown(base({ status: "1H" }), helpers(NOW - 5 * 3600e3), NOW);
  assert.deepEqual([stale.kind, stale.estimated], ["finished", true], "1H vieux de 5 h : estimation");
  const ns = HL.countdown(base({ status: "NS" }), helpers(NOW + 2 * 3600e3 + 11 * 60e3), NOW);
  assert.equal(ns.text, "dans 2 h 11");
  const html = HL.renderMatchRow(base({ status: "FT" }), ctx(), H, 0);
  assert.match(html, /hl-tag-time is-finished"[^>]*>Terminé</);
  assert.doesNotMatch(html.match(/hl-tag-time[^>]*>/)[0], /title=/, "statut API : pas de mention d'estimation");
});

test("derby : puce depuis le champ public derby", () => {
  const html = HL.renderMatchRow(base({ derby: { key: "clasico-nacional", name: "Clásico Nacional" } }), ctx(), helpers(), 0);
  assert.match(html, /hl-tag-derby" title="Clásico Nacional">Derby</);
  assert.doesNotMatch(HL.renderMatchRow(base(), ctx(), helpers(), 0), /hl-tag-derby/);
});

test("jours : Aujourd'hui / Demain seulement, onglet sans match desactive « aucun match »", () => {
  const H = Object.assign(helpers(), { matchDay: (m) => m.date.slice(0, 10) });
  const clock = { day: "2026-09-16", tomorrow: "2026-09-17" };
  // Onglet « Hier » retire le 21/09/2026 (demande du proprietaire) : la
  // veille n'est plus ni comptee ni affichee, et les jours passes de la liste
  // n'apparaissent dans aucun onglet.
  const days = HL.buildDays([base({ date: "2026-09-15 20:00" }), base({ date: "2026-09-16 20:00" }), base({ id: 2, date: "2026-09-16 21:00" }), base({ id: 3, date: "2026-09-18 18:00" })], H, clock);
  assert.deepEqual(days.map((d) => [d.day, d.count]), [["2026-09-16", 2], ["2026-09-17", 0]]);
  assert.deepEqual(days.map((d) => !!d.yesterday), [false, false]);
  const strip = HL.renderDateStrip(days, "2026-09-16");
  assert.equal((strip.match(/role="tab"/g) || []).length, 2);
  assert.match(strip, /<span class="hl-day-name">Aujourd’hui<\/span><span class="hl-day-sub">2 matchs<\/span>/);
  assert.match(strip, /data-hl-day="2026-09-17"[^>]*disabled aria-disabled="true"[^>]*><span class="hl-day-name">Demain<\/span><span class="hl-day-sub">aucun match<\/span>/);
  assert.doesNotMatch(strip, /Hier|Après-demain|Auj\.|Dem\.|\bJE\b|hl-dates-nav/);
});

test("accueil : plus aucune requete vers results/<jour>.json (onglet « Hier » retire)", () => {
  const src = fs.readFileSync(path.join(root, "home-list.js"), "utf8");
  const garde = src.slice(src.indexOf("function chargerVeille()"), src.indexOf("function chargerVeille()") + 600);
  assert.match(garde, /DAY_NAMES\.some[\s\S]*day_yesterday[\s\S]*\)return;/, "sortie immediate tant que l'onglet n'existe pas");
  assert.ok(src.indexOf("day_yesterday") === -1 || !/var DAY_NAMES=\[[^\]]*day_yesterday/.test(src), "« Hier » absent des onglets");
});

test("accueil simplifie : ni banniere, ni recherche, ni filtres, ni bloc « Mes compétitions » separe", () => {
  const src = fs.readFileSync(path.join(root, "home-list.js"), "utf8");
  assert.doesNotMatch(src, /hl-banner|hl-search|hl-chip|data-hl-filter|home_banner_ready|hl-block"|fav_title|all_title/);
  const html = HL.renderDayBody([base(), base({ id: 2, league_key: "el", league: "Europa League" })], ctx({ upsellAfter: 3 }), helpers());
  assert.doesNotMatch(html, /hl-banner|hl-summary|hl-mine/, "pas de section « Mes matchs » sans match favori");
  assert.equal((html.match(/class="hl-upsell"/g) || []).length, 1, "un seul rappel Pro");
  assert.doesNotMatch(html.match(/<aside class="hl-upsell"[\s\S]*?<\/aside>/)[0], /[€£$]|MX\$|\bR\s?\d/, "rappel sans prix");
});

test("favoris : competitions favorites en tete de la meme liste, matchs favoris en tete de leur competition + « Mes matchs »", () => {
  const H = Object.assign(helpers(), { compareMatches: (a, b) => a.id - b.id });
  const list = [base({ id: 1 }), base({ id: 2 }), base({ id: 3, league_key: "el", league: "Europa League" }), base({ id: 4, league_key: "premier", league: "Premier League" })];
  const favL = setStore(["premier"]);
  const favM = setStore([2, 999]);
  const groups = HL.groupByLeague(list, H, favL, favM);
  assert.deepEqual(groups.map((g) => g.key), ["premier", "el", "laliga"], "favorite d'abord, puis A->Z");
  assert.deepEqual(groups[2].matches.map((m) => m.id), [2, 1], "match favori en tete de sa competition");
  const html = HL.renderDayBody(list, ctx({ favorites: favL, favMatches: favM }), H);
  const mine = html.match(/<section class="hl-mine"[\s\S]*?<\/section>/);
  assert.ok(mine, "section « Mes matchs »");
  assert.ok(html.indexOf("hl-mine") < html.indexOf("hl-leagues"), "« Mes matchs » en haut");
  assert.match(mine[0], /Mes matchs<\/span> <span class="hl-mine-n">1<\/span>/);
  assert.equal((mine[0].match(/class="hl-item/g) || []).length, 1);
  assert.match(html, /<section class="hl-league is-fav" data-league="premier">/);
  // Etoile du match : bouton frere du lien, jamais dans le <a>.
  const row = HL.renderMatchRow(base({ id: 2 }), ctx({ favMatches: favM }), H, 0);
  assert.match(row, /<\/a><button type="button" class="hl-mstar is-on" data-hl-mfav="2" aria-pressed="true" aria-label="Retirer Alaves – Valencia de mes matchs"/);
  assert.doesNotMatch(row.match(/<a [\s\S]*?<\/a>/)[0], /<button/);
  const off = HL.renderMatchRow(base({ id: 5 }), ctx({ favMatches: favM }), H, 0);
  assert.match(off, /class="hl-mstar" data-hl-mfav="5" aria-pressed="false" aria-label="Ajouter Alaves – Valencia à mes matchs"/);
  // Ligne verrouillee dans « Mes matchs » : memes regles, aucun champ premium lu.
  const { m, reads } = spyMatch({ id: 2, prob_band: "high" });
  const lockedMine = HL.renderMine([m], ctx({ favMatches: favM }), H, 0);
  assert.deepEqual(reads, []);
  assert.match(lockedMine, /is-locked/);
  assert.match(lockedMine, /hl-lockpill/);
  assert.match(lockedMine, /hl-band is-high/);
});

test("matchs favoris : store {id, ko}, nettoyage des matchs passes, fusion avec user_metadata.fav_matches", async () => {
  const now = Date.now();
  const store = FL.createStore({ kind: "matches", storageKey: "tm" });
  assert.equal(store.toggle(1570383, now + 3600e3), true);
  assert.equal(store.toggle("42", now - 5 * 3600e3), true, "ajout accepte, retire au prochain nettoyage");
  assert.equal(store.has(1570383), true);
  assert.equal(store.prune(), true, "match commence il y a 5 h : nettoye");
  assert.deepEqual(store.list(), ["1570383"]);
  assert.equal(store.prune((e) => e.id === "1570383"), true, "match termine d'apres son statut : nettoye");
  assert.deepEqual(store.list(), []);
  store.toggle("7", now + 7200e3);
  const saved = [];
  const merged = await store.connectRemote({ load: () => Promise.resolve([{ id: "8", ko: now + 3600e3 }, { id: "9", ko: now - 10 * 3600e3 }, { id: "<x>" }]), save: (a) => { saved.push(a); return Promise.resolve(); } });
  assert.deepEqual(merged, ["8", "7"]);
  assert.equal(saved.length, 1, "match passe retire et favori local ajoute : ecriture sur le compte");
  assert.deepEqual(saved[0].map((e) => e.id), ["8", "7"]);
  assert.deepEqual(FL.cleanMatches([{ id: 1, ko: now - 4 * 3600e3 }, { id: 2, ko: null }, { id: 2 }], now).map((e) => e.id), ["2"]);
  const calls = [];
  const sb = { auth: { getUser: () => Promise.resolve({ data: { user: { user_metadata: { fav_leagues: ["el"], fav_matches: [{ id: "8", ko: now + 1e6 }] } } } }), updateUser: (p) => { calls.push(p); return Promise.resolve({ data: {} }); } } };
  assert.deepEqual(await FL.supabaseAdapter(sb, "fav_matches").load(), [{ id: "8", ko: now + 1e6 }]);
  await FL.supabaseAdapter(sb, "fav_matches").save([{ id: "8", ko: now + 1e6 }]);
  assert.deepEqual(calls, [{ data: { fav_matches: [{ id: "8", ko: now + 1e6 }] } }], "seul fav_matches est ecrit (fav_leagues intact)");
});

test("competition : favoris puis A->Z, en-tete « N matchs » sans decompte d'analyses, ajout aux favoris suivi", () => {
  const H = helpers();
  const groups = HL.groupByLeague([base({ league: "La Liga" }), base({ id: 2, league_key: "el", league: "Europa League", has_signal: false, no_signal: true }), base({ id: 3 })], H);
  assert.deepEqual(groups.map((g) => g.name), ["Europa League", "La Liga"]);
  const block = HL.renderLeagueBlock(groups[1], ctx(), H, 0);
  // Le decompte « M analyses prêtes » a ete retire de l'en-tete le 16/09/2026 :
  // il repetait ce que chaque ligne dit deja, et chargeait la barre de competition.
  assert.match(block, />2 matchs</);
  const stats = (block.match(/<span class="hl-league-stats">([^<]*(?:<[^>]+>[^<]*)*?)<\/span>/) || [])[1] || "";
  assert.doesNotMatch(stats, /analyse/i, "le decompte d'analyses est revenu dans l'en-tete : " + stats);
  // L'aria-label des lignes verrouillees, lui, continue de decrire l'etat au
  // lecteur d'ecran : c'est la seule mention qui doit subsister.
  assert.match(block, /aria-label="[^"]*Analyse prête, réservée aux abonnés Pro/);
  assert.match(block, /data-track="laliga" data-track-kind="home_fav_add"/);
  const favBlock = HL.renderLeagueBlock(groups[1], ctx({ favorites: { has: () => true, list: () => ["laliga"] } }), H, 0);
  assert.doesNotMatch(favBlock, /home_fav_add/, "retrait d'un favori : pas d'evenement d'ajout");
});

test("favoris : store local + fusion avec le compte (user_metadata.fav_leagues), sauvegarde si la fusion ajoute", async () => {
  const store = FL.createStore({ storageKey: "test" });
  assert.equal(store.toggle("laliga"), true);
  assert.equal(store.toggle("el"), true);
  assert.equal(store.toggle("el"), false);
  assert.deepEqual(store.list(), ["laliga"]);
  const saved = [];
  const merged = await store.connectRemote({ load: () => Promise.resolve(["premier", "LALIGA<script>", "laliga"]), save: (a) => { saved.push(a); return Promise.resolve(); } });
  assert.deepEqual(merged, ["premier", "laliga"]);
  assert.deepEqual(saved, [], "rien de nouveau par rapport au compte : aucune ecriture");
  store.toggle("liga_mx");
  await store.lastSave;
  assert.deepEqual(saved, [["premier", "laliga", "liga_mx"]]);
  const store2 = FL.createStore({ storageKey: "test2" });
  store2.toggle("ldc");
  const saved2 = [];
  await store2.connectRemote({ load: () => Promise.resolve(["premier"]), save: (a) => { saved2.push(a); return Promise.resolve(); } });
  assert.deepEqual(saved2, [["premier", "ldc"]], "favori local ajoute au compte a la connexion");
  assert.equal(FL.clean(new Array(80).fill(0).map((_, i) => "k" + i)).length, 50);
  // Adaptateur Supabase : updateUser({ data: { fav_leagues } }).
  const calls = [];
  const sb = { auth: { getUser: () => Promise.resolve({ data: { user: { user_metadata: { fav_leagues: ["el"] } } } }), updateUser: (p) => { calls.push(p); return Promise.resolve({ data: {} }); } } };
  assert.deepEqual(await FL.supabaseAdapter(sb).load(), ["el"]);
  await FL.supabaseAdapter(sb).save(["el", "ldc"]);
  assert.deepEqual(calls, [{ data: { fav_leagues: ["el", "ldc"] } }]);
});

test("i18n : cles home_list dans les 7 langues, memes placeholders, vocabulaire interdit absent", () => {
  const fr = JSON.parse(fs.readFileSync(path.join(root, "i18n/dict/fr.json"), "utf8")).home_list;
  const used = new Set();
  const src = fs.readFileSync(path.join(root, "home-list.js"), "utf8") + fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const m of src.matchAll(/'home_list\.([a-z_]+)'/g)) used.add(m[1]);
  used.add("band_high_short"); used.add("band_good_short"); used.add("band_moderate_short");
  for (const k of used) assert.ok(typeof fr[k] === "string", "cle FR absente : home_list." + k);
  const FORBIDDEN = /\bsûrs?\b|\bsûres?\b|\bgagnant|\bbonus\b|\bconfiance élevée\b/i;
  for (const loc of ["fr", "en", "es", "es-mx", "de", "it", "pt"]) {
    const d = JSON.parse(fs.readFileSync(path.join(root, "i18n/dict/" + loc + ".json"), "utf8"));
    const hl = d.home_list;
    for (const k of Object.keys(fr)) {
      assert.ok(hl && hl[k] != null, loc + " : home_list." + k + " absent");
      if (typeof fr[k] !== "string") continue;
      const ph = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
      assert.equal(ph(hl[k]), ph(fr[k]), loc + " : placeholders de home_list." + k);
      assert.doesNotMatch(hl[k], FORBIDDEN, loc + " : home_list." + k);
    }
    for (const key of Object.keys(fr.country)) assert.ok(hl.country[key], loc + " : pays " + key);
    assert.ok(d.compte_page.fav_leagues_heading, loc + " : compte_page.fav_leagues_heading");
  }
  assert.equal(Object.keys(fr.country).sort().join(), Object.keys(require("../lib/league-names.js").LEAGUES).sort().join(), "un pays par competition couverte");
});

test("match offert sans compte : « Analyse offerte · Compte gratuit », aucun champ premium lu ; avec compte : ouvert", () => {
  const { m, reads } = spyMatch({ is_free: true });
  const html = HL.renderMatchRow(m, ctx({ freeMatchId: 1570383, hasAccount: false }), helpers(), 0);
  assert.deepEqual(reads, [], "aucun champ premium lu sans compte");
  assert.match(html, /is-gated is-free/);
  assert.match(html, /hl-tag-free">Offert</);
  assert.match(html, /Analyse offerte<\/span><span class="hl-freepill">Compte gratuit<\/span>/);
  assert.doesNotMatch(html, /\/10|hl-gauge|hl-market|Over|7[,.]7/);
  assert.match(html, /href="\/gb\/match\.html\?id=1570383"/);
  const open = HL.renderMatchRow(Object.assign(base({ is_free: true }), SECRET), ctx({ freeMatchId: 1570383, hasAccount: true }), helpers(), 0);
  assert.match(open, /is-open is-free/);
});

test("match offert epingle en tete tant que le visiteur n'est pas Pro (26/09/2026), sans toucher « Mes matchs »", () => {
  const list = [base({ id: 2, league_key: "el", league: "Europa League" }), base({ is_free: true })];
  const anon = HL.renderDayBody(list, ctx({ freeMatchId: 1570383, hasAccount: false }), helpers());
  const offer = anon.match(/<section class="hl-offer"[\s\S]*?<\/section>/);
  assert.ok(offer, "bloc du match offert present sans compte");
  assert.ok(anon.indexOf("hl-offer") < anon.indexOf("hl-leagues"), "en tete de la liste");
  assert.match(offer[0], /id=1570383/);
  assert.doesNotMatch(offer[0], /id=2"/, "seul le match offert est epingle");
  assert.match(offer[0], /is-gated is-free/, "sans compte : toujours ferme");
  assert.doesNotMatch(anon, /hl-mine/, "« Mes matchs » reste reserve aux vrais favoris");
  const free = HL.renderDayBody(list, ctx({ freeMatchId: 1570383, hasAccount: true }), helpers());
  assert.doesNotMatch(free.match(/<section class="hl-offer"[\s\S]*?<\/section>/)[0], /is-gated/, "compte gratuit : plus de mur « compte gratuit »");
  const pro = HL.renderDayBody(list, ctx({ freeMatchId: 1570383, isPro: true, hasAccount: true }), helpers());
  assert.doesNotMatch(pro, /hl-offer/, "Pro : plus rien d'epingle");
});
