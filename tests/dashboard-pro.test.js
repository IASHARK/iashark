"use strict";
// Espace Pro : tableau de bord du jour, et affiliation visible (03/10/2026).
// - « Ton programme du jour » = les selections du message Telegram, dans le MEME rendu que la page
//   match (lib/selection-pro.js = copie fidele de match-page.js, verifiee ici mot pour mot) ;
// - plus de « Bientot » trompeur ; interrupteur tableauPro ouvert ;
// - accueil : competitions par importance, sans emoji ni pays, selections nationales en francais,
//   bloc « Deviens partenaire IASHARK » juste apres la liste des matchs ;
// - aucune mise, aucune promesse de gain, pas de « jouer comporte des risques ».
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vmLib = require("node:vm");
const VM = require("../lib/match-view-model.js");
const S = require("../lib/selection-pro.js");
const HL = require("../home-list.js");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
const get = (o, k) => k.split(".").reduce((x, y) => (x == null ? x : x[y]), o);

const LIGNE = {
  id: "0c6c7a8e-0000-4000-8000-000000000001", numero: 42, famille: "simple", fixture_id: 1528900, ligue: "Ligue des nations",
  dom: "Espagne", ext: "Croatie", coup_envoi: "2026-10-03T18:45:00Z", marche: "1", ligne: null, selection: "Espagne gagne", selections: [],
  proba: 0.6123, source_proba: "chance calculée par IASHARK à partir des cotes du marché (Pinnacle, marge retirée)",
  meilleure_cote: 1.85, meilleur_bookmaker: "winamax", cote_vue_at: "2026-10-03T10:05:00Z", publie_at: "2026-10-03T10:06:00Z",
};
const COMBI = { ...LIGNE, id: "c2", numero: 43, famille: "combine", marche: "combine", selection: "Espagne gagne + Lens ou nul", proba: 0.4, meilleure_cote: 2.59,
  selections: [{ fixture_id: 1528900, ligue: "Ligue des nations", dom: "Espagne", ext: "Croatie", coup_envoi: LIGNE.coup_envoi, marche: "1", selection: "Espagne gagne", cote: 1.85, voie: "cotes_marche" },
    { fixture_id: 99, ligue: "Ligue 1", dom: "Lens", ext: "Nice", coup_envoi: LIGNE.coup_envoi, marche: "1X", selection: "Lens ou nul", cote: 1.4 }] };
const BUTEUR = { ...LIGNE, id: "b3", numero: 44, famille: "buteur", marche: "buteur", selection: "Espagne gagne + Morata marque (à n'importe quel moment)", proba: 0.2,
  selections: [{ type: "buteur", equipe: "Espagne", joueur: "Morata" }], meilleure_cote: null, meilleur_bookmaker: null };

function chargerPageMatch(locale) {
  const src = read("match-page.js");
  const i = src.lastIndexOf("init();");
  const code = src.slice(0, i) + "window.__MP={selectionProCard,vuePro:v=>{VUE_PRO=v;}};\n" + src.slice(i + "init();".length);
  const el = { innerHTML: "", addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, style: {} };
  const I18N = { locale, t: (k, f) => { const v = get(DICTS[locale], k); return typeof v === "string" ? v : f; }, localeTag: () => (locale === "fr" ? "fr-FR" : "en-GB") };
  const win = { IasharkMatchViewModel: VM, I18N, location: { search: "", href: "" }, matchMedia: () => ({ matches: false }), addEventListener() {} };
  const ctx = { window: win, IasharkMatchViewModel: VM, document: { getElementById: () => el, querySelector: () => null, querySelectorAll: () => [], addEventListener() {}, createElement: () => el, documentElement: el, body: el }, console, setTimeout, clearTimeout, URLSearchParams, Intl, navigator: {}, Promise };
  vmLib.createContext(ctx);
  vmLib.runInContext(code, ctx);
  win.__MP.vuePro(true);
  return { MP: win.__MP, I18N };
}
const plat = (h) => String(h).replace(/\s+/g, " ").replace(/> </g, "><").trim();

test("programme du jour : meme rendu, mot pour mot, que le bloc « Sélection Pro du jour » de la page match (fr et en)", () => {
  for (const locale of ["fr", "en"]) {
    const { MP, I18N } = chargerPageMatch(locale);
    const o = { t: I18N.t, estFr: () => locale === "fr", localeTag: I18N.localeTag };
    for (const p of [LIGNE, COMBI, BUTEUR]) {
      const page = plat(MP.selectionProCard([p]));
      const lib = plat(S.article(p, o) + S.sources([p], o));
      assert.ok(page.includes(lib), locale + " " + p.famille + " :\n" + lib + "\n---\n" + page);
    }
  }
  // Colonnes : celles de la page match, toutes accordees par 0040, jamais « * ».
  assert.match(read("match-page.js"), new RegExp("const SELPRO_COLONNES='" + S.COLONNES + "'"));
  const M = require("../lib/pro-dashboard-model.js");
  ["selections", "proba", "source_proba", "publie_at", "fixture_id"].forEach((c) => assert.match(M.COLONNES_PARIS, new RegExp("\\b" + c + "\\b")));
  assert.doesNotMatch(M.COLONNES_PARIS, /\*/);
});

test("chance identique a Telegram (canal-pro.mjs#chanceTxt), aucune mise ni esperance", async () => {
  const C = await import(path.join(ROOT, "supabase/functions/_shared/canal-pro.mjs"));
  for (const p of [LIGNE, COMBI, BUTEUR]) assert.equal(S.chance(p, { estFr: () => true }), C.chanceTxt(p));
  const html = [LIGNE, COMBI, BUTEUR].map((p) => S.article(p)).join("");
  assert.doesNotMatch(html, /mise|unité|espérance|garanti/i);
});

test("tableau de bord ouvert, plus aucun « Bientot » trompeur sur l'espace Pro", () => {
  assert.match(read("assets/ouverture.js"), /tableauPro: true/);
  for (const d of ["", "fr/", "en/", "es/", "gb/", "mx/", "za/"]) {
    const h = read(d + "pro.html");
    assert.match(h, /data-tool="tableau"/, d + "pro.html");
    assert.match(h, /lib\/selection-pro\.js/, d + "pro.html : rendu commun");
    assert.doesNotMatch(h, /Bientôt : ton tableau de bord|le programme du jour et la qualité de tes cotes/, d + "pro.html");
  }
  for (const l of LOCALES) {
    const d = DICTS[l];
    for (const k of ["tools_page.static_hero_sub", "pro_space.sub_pro", "pro_space.locked_today", "pro_space.guard_robot_note", "pro_onboarding.telegram_help", "geo.meta.pro.description"]) {
      assert.doesNotMatch(String(get(d, k)), /bientôt|\bsoon\b|pronto|\bbald\b|presto|em breve/i, l + " " + k);
    }
    for (const k of Object.keys(d.dashboard_pro)) assert.ok(String(d.dashboard_pro[k]).length > 0, l + " dashboard_pro." + k);
  }
  const js = read("pro-dashboard.js");
  assert.doesNotMatch(js, /function blocBientot\(/);
  assert.match(js, /function blocTelegram\(\)/);
  assert.match(js, /appelRobot\('statut'\)/);
  assert.match(js, /appelRobot\('vip-link'\)/);
});

test("Mes reglages = la ligne pro_preferences que lit le robot ; statut Telegram en lecture seule", () => {
  const bot = read("supabase/functions/telegram-bot/index.ts");
  assert.match(bot, /db\.from\("pro_preferences"\)\.select\("\*"\)\.eq\("user_id", ab\.user_id\)/, "le robot lit pro_preferences");
  const statut = bot.slice(bot.indexOf("async function statutLiaison"), bot.indexOf("async function clic"));
  assert.ok(statut.length > 100);
  assert.doesNotMatch(statut, /upsert|insert|update\(|delete\(/, "statut : aucune ecriture");
  assert.match(statut, /select\("chat_id, bloque"\)/);
  assert.match(bot, /body\.action === "statut"\) return await statutLiaison\(req\)/);
  assert.match(read("pro-dashboard.js"), /sb\.from\(P\.TABLE\)\.select\(P\.COLONNES\.join\(','\)\)/);
});

test("accueil : competitions par importance, sans emoji ni pays, 3 ouvertes d'office", () => {
  const H = {
    leagueKey: (m) => m.league_key, leagueName: (m) => m.league, leagueCountry: () => "Brésil", leagueFlag: () => "🏆", leagueLogoUrl: (m) => "https://media.api-sports.io/football/leagues/" + m.league_id + ".png",
    compareMatches: () => 0, matchTimestamp: () => Date.now() + 3600e3, heure: () => "20:45", teamLogoUrl: () => "", lien: (p) => "/" + p, hasReliableModelOutput: () => false,
  };
  const m = (k, n, id) => ({ id: k, league_key: k, league: n, league_id: id, home: { n: "Finland" }, away: { n: "Albania" } });
  const g = HL.groupByLeague([m("brazil_seriea", "Brasileirão Série A", 71), m("laliga", "La Liga", 140), m("nations_league", "Ligue des nations", 5), m("ldc", "Champions League", 2), m("zz", "Autre", 999)], H);
  assert.deepEqual(g.map((x) => x.key), ["nations_league", "ldc", "laliga", "brazil_seriea", "zz"]);
  g.forEach((x, i) => { x.rang = i; });
  const ctx = { favorites: { has: () => false }, favMatches: { has: () => false }, collapsed: {}, nowTs: Date.now() };
  const ouvert = HL.renderLeagueBlock(g[0], ctx, H, 0), ferme = HL.renderLeagueBlock(g[3], ctx, H, 0);
  assert.doesNotMatch(ouvert, /is-collapsed/);
  assert.match(ferme, /is-collapsed/);
  assert.match(ferme, /1 match · prochain à 20:45/);
  assert.match(ouvert, /hl-league-logo"><img src="https:\/\/media\.api-sports\.io\/football\/leagues\/5\.png"/);
  assert.doesNotMatch(ouvert + ferme, /🏆|Brésil|hl-league-country/);
  // Un clic de la personne l'emporte (0 = ouverte, 1 = repliee).
  assert.doesNotMatch(HL.renderLeagueBlock(g[3], { ...ctx, collapsed: { brazil_seriea: 0 } }, H, 0), /is-collapsed/);
  assert.match(HL.renderLeagueBlock(g[0], { ...ctx, collapsed: { nations_league: 1 } }, H, 0), /is-collapsed/);
});

test("selections nationales en francais sur les pages francaises (meme table que les pages match)", () => {
  const N = require("../lib/noms-equipes-fr.js");
  const cfg = JSON.parse(read("config/noms-equipes-fr.json"));
  const attendu = {};
  [cfg.selections, cfg.clubs].forEach((o) => Object.keys(o).forEach((k) => { if (typeof o[k] === "string" && o[k].trim()) attendu[k] = o[k].trim(); }));
  assert.deepEqual(N.NOMS, attendu, "lib/noms-equipes-fr.js = config/noms-equipes-fr.json (node scripts/sync-noms-equipes-fr.js)");
  ["Albania", "Finland", "Spain", "Croatia", "Czechia", "Rep. Of Ireland", "Northern Ireland", "Türkiye", "Russia", "Bosnia & Herzegovina", "Faroe Islands"].forEach((n) => assert.notEqual(N.nom(n), n, n));
  assert.equal(N.nom("Finland"), "Finlande");
  assert.equal(N.nom("Équipe inconnue"), "Équipe inconnue");
  assert.match(read("home-list.js"), /esc\(nomEquipe\(tm&&tm\.n\|\|''\)\)/);
  for (const d of ["", "fr/"]) assert.match(read(d + "index.html"), /<script src="\/lib\/noms-equipes-fr\.js"><\/script>/);
});

test("affiliation visible : bloc juste apres la liste des matchs, menu, compte ; image legere ; aucune promesse", () => {
  for (const d of ["", "fr/", "en/", "es/", "gb/", "mx/", "za/"]) {
    const h = read(d + "index.html");
    const i = h.indexOf('id="decisions"'), j = h.indexOf('class="home-partner"');
    assert.ok(i > 0 && j > i, d + "index.html : bloc partenaire apres la liste");
    const entre = h.slice(i, j);
    assert.equal((entre.match(/<section\b/g) || []).length, 1, d + "index.html : rien entre la liste et le bloc partenaire");
    assert.match(h.slice(j, j + 3000), /href="\/(?:[a-z]{2}\/)?partenaires\.html" class="home-partner-cta"/);
    assert.match(h, /class="desktop-nav"[\s\S]{0,400}partenaires\.html/, d + "index.html : lien du menu");
    assert.match(h.slice(j, j + 3000), /<b>40 %<\/b>/);
  }
  assert.ok(fs.statSync(path.join(ROOT, "assets/partenaires/partenaire-iashark.webp")).size < 120 * 1024);
  const acc = read("account-page.js");
  assert.match(acc, /sb\.rpc\('affiliate_me'\)/);
  assert.match(acc, /partner_promo\.account_title/);
  for (const l of LOCALES) {
    const txt = JSON.stringify([DICTS[l].partner_promo, DICTS[l].accueil_v3, DICTS[l].dashboard_pro]);
    assert.doesNotMatch(txt, /mise\b|stake\b|espérance|expected value|garanti|guarantee|gagner à coup sûr|comporte des risques|revenu garanti/i, l);
    assert.match(DICTS[l].partner_promo.account_title, /40/);
  }
});

test("essai gratuit 7 jours : annonce seulement si le serveur le confirme (meme regle que la grille de prix)", () => {
  const js = read("assets/essai-cta.js");
  assert.match(js, /PG\.trialFor\(jours, \{ known: true, loggedIn: !!user, trialOk: ok === true, isPro: !!c\.isPro \}, true\)/);
  assert.match(js, /PG\.fetchAvailability\(global\.IASHARK_MARKET\)/);
  const h = read("index.html");
  assert.match(h, /data-essai-cta data-vente/);
  assert.doesNotMatch(h.slice(h.indexOf("<main>"), h.indexOf("</main>")).replace(/<!--[\s\S]*?-->/g, ""), /Essai gratuit 7 jours/, "jamais ecrit en dur");
});
