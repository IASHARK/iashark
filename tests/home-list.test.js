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
const zoneOf = (html) => (html.match(/<span class="hl-zone[^"]*">([\s\S]*)<\/span><\/a><\/li>$/) || [])[1] || "";
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

test("Pro confirme ou match offert : Proba. x/10, jauge, marche ; sans signal : pas de pari force", () => {
  const pro = HL.renderMatchRow(Object.assign(base({ prob_band: "high" }), SECRET), ctx({ isPro: true }), helpers(), 0);
  assert.match(pro, /is-open/);
  assert.match(pro, /<b>7,7<\/b><small>\/10<\/small>/);
  assert.match(pro, /hl-gauge/);
  assert.match(pro, /Plus de 2,5 buts/);
  assert.doesNotMatch(pro, /hl-band|hl-lockpill/, "le Pro garde la note exacte, pas la pastille");
  const free = HL.renderMatchRow(Object.assign(base({ is_free: true }), SECRET), ctx({ freeMatchId: 1570383 }), helpers(), 0);
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

test("competition : favoris puis A->Z, en-tete « N matchs · M analyses pretes », ajout aux favoris suivi", () => {
  const H = helpers();
  const groups = HL.groupByLeague([base({ league: "La Liga" }), base({ id: 2, league_key: "el", league: "Europa League", has_signal: false, no_signal: true }), base({ id: 3 })], H);
  assert.deepEqual(groups.map((g) => g.name), ["Europa League", "La Liga"]);
  const block = HL.renderLeagueBlock(groups[1], ctx(), H, 0);
  assert.match(block, /2 matchs · <b>2 analyses prêtes<\/b>/);
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
