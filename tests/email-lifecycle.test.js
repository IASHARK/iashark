"use strict";
// Emails de relance : rendu par langue/marche, liens, mentions obligatoires,
// vocabulaire, selection des destinataires, jeton de desinscription, module
// genere pour les fonctions Edge. Aucun appel reseau.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const L = require("../lib/lifecycle-email.js");
const R = require("../lib/email-render.js");
const build = require("../lib/lifecycle-email-build.js");

const ROOT = path.join(__dirname, "..");
const CONFIG = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "markets.json"), "utf8"));
const BUNDLE = build.loadBundle();
const NOW = new Date("2026-09-17T10:00:00Z"); // jeudi, 12:00 a Paris
const SECRET = "test-unsubscribe-secret-0123456789abcdef";
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const DAY = 86400000;

const RAW_MATCHES = [
  { id: 1570385, sport: "football", home: { n: "Barcelona", id: 529 }, away: { n: "Racing Santander", id: 4665 }, date: "2026-09-17 21:30", league: "La Liga", is_free: true, c1: 1.87, pari_rec: "Over 2.5", conf: 7, p1: 51 },
  { id: 1493124, sport: "football", home: { n: "Banfield" }, away: { n: "Barracas Central" }, date: "2026-09-18 00:00", league: "Liga Profesional Argentina", is_free: false },
  { id: 2001, sport: "football", home: { n: "Paris SG" }, away: { n: "Marseille" }, date: "2026-09-19 21:00", league: "Ligue 1", c1: 1.55, pari_rec: "1" },
  { id: 2002, sport: "football", home: { n: "Arsenal" }, away: { n: "Chelsea" }, date: "2026-09-20 17:30", league: "Premier League" },
  { id: 2003, sport: "football", home: { n: "Monaco" }, away: { n: "Lille" }, date: "2026-09-22 20:00", league: "Ligue 1" },
  { id: 2004, sport: "football", home: { n: "América" }, away: { n: "Chivas" }, date: "2026-09-19 04:00", league: "Liga MX", is_free: true, free_markets: ["mx"] }
];

async function unsubUrl(dir) {
  const token = await L.createUnsubscribeToken({ userId: USER, dir }, SECRET, NOW);
  return L.unsubscribeLinks(token, dir, "https://example.supabase.co").page;
}

async function renderAll(extra) {
  const out = [];
  for (const dir of L.DIRS) {
    const ctx = L.siteContext(BUNDLE.markets, dir);
    const data = Object.assign({
      freeMatch: L.pickFreeMatch(RAW_MATCHES, NOW, ctx),
      weekendMatches: L.weekendMatches(RAW_MATCHES, NOW, ctx),
      marketingOptIn: true
    }, extra || {});
    const unsubscribeUrl = await unsubUrl(dir);
    for (const campaign of Object.keys(L.CAMPAIGNS)) {
      out.push({ dir, campaign, ctx, unsubscribeUrl, r: L.renderLifecycleEmail(BUNDLE, campaign, dir, data, { unsubscribeUrl, now: NOW }) });
    }
  }
  return out;
}

const stripStyle = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, "");
const visible = (html) => stripStyle(html).replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");

// ------------------------------------------------------------ module genere

test("le module des fonctions Edge est a jour (node lib/lifecycle-email-build.js)", () => {
  assert.equal(fs.readFileSync(build.BUNDLE_PATH, "utf8"), build.buildBundleSource(), "lancer node lib/lifecycle-email-build.js");
});

test("le module genere s'importe en ESM et rend le meme email que la lib", async () => {
  const mod = await import(pathToFileURL(build.BUNDLE_PATH).href);
  const dir = "gb";
  const ctx = mod.Lifecycle.siteContext(mod.BUNDLE.markets, dir);
  const data = { freeMatch: mod.Lifecycle.pickFreeMatch(RAW_MATCHES, NOW, ctx), weekendMatches: [], marketingOptIn: true };
  const unsubscribeUrl = await unsubUrl(dir);
  const a = mod.Lifecycle.renderLifecycleEmail(mod.BUNDLE, "free_match", dir, data, { unsubscribeUrl, now: NOW });
  const b = L.renderLifecycleEmail(BUNDLE, "free_match", dir, data, { unsubscribeUrl, now: NOW });
  assert.equal(a.html, b.html);
  assert.equal(a.text, b.text);
});

// ------------------------------------------------------------ marches et liens

test("contexte de site derive de config/markets.json (devise, prix Pro, aide jeu responsable, fuseau)", () => {
  for (const dir of L.DIRS) {
    const d = CONFIG._dirs[dir];
    const ctx = L.siteContext(BUNDLE.markets, dir);
    assert.equal(ctx.currency, CONFIG[d.market].currency, dir);
    assert.equal(ctx.htmlLang, d.htmlLang, dir);
    const help = d.helpline ? CONFIG._helplines[d.helpline] : CONFIG[d.market].helpline;
    assert.equal(ctx.helpline.url, help.url, dir + " aide");
    const pro = CONFIG[d.market].prices.pro;
    assert.equal(ctx.proPriceMinor, Math.round(pro.month.amount * 100), dir + " prix Pro mensuel");
    // Duree vendue mais non payable (config/markets.json#checkoutOpen, ex. /gb/ semaine et annee au 19/09/2026) : jamais annoncee.
    const open = CONFIG[d.market].checkoutOpen;
    for (const iv of ["week", "month", "year"]) assert.equal(ctx.proPricesMinor[iv], pro[iv] && (!Array.isArray(open) || open.includes(iv)) ? Math.round(pro[iv].amount * 100) : null, dir + " prix Pro " + iv);
    assert.ok(L.MARKET_TIMEZONES[d.market], dir + " fuseau");
  }
  assert.deepEqual(Object.keys(CONFIG._dirs).sort(), L.DIRS.slice().sort());
  assert.equal(L.siteContext(BUNDLE.markets, "en").helpline.name, "Gambling Therapy", "/en/ : ressource internationale");
});

// 25/09/2026 : les repertoires retires (config/markets.json#_retiredDirs,
// de/it/pt) gardent leurs e-mails ; leurs liens /de/... menent en 301 vers la
// meme page de /en/ (tests/helpers/public-dirs.js#servedPath).
const { servedPath } = require("./helpers/public-dirs.js");

test("pages de methodologie absentes : liste a jour avec le depot", () => {
  for (const dir of L.DIRS) {
    const exists = fs.existsSync(path.join(ROOT, servedPath(dir + "/methodologie.html")));
    assert.equal(!exists, L.METHODOLOGY_MISSING_DIRS.includes(dir), dir + "/methodologie.html");
  }
});

test("chaque email (6 campagnes x 9 versions du site, 7 langues) : liens absolus du bon repertoire et existants", async () => {
  const EXTERNAL = new Set(Object.values(CONFIG._helplines).concat(["fr", "gb", "mx", "za"].map((k) => CONFIG[k].helpline)).map((h) => h.url));
  for (const { dir, campaign, r } of await renderAll()) {
    const hrefs = [...r.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));
    const textUrls = [...r.text.matchAll(/https?:\/\/[^\s)]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ""));
    assert.ok(hrefs.length >= 6, dir + "/" + campaign);
    for (const url of hrefs.concat(textUrls)) {
      if (EXTERNAL.has(url)) continue;
      assert.ok(url.startsWith("https://iashark.com/"), dir + "/" + campaign + " lien hors site : " + url);
      const rel = url.slice("https://iashark.com/".length).split(/[?#]/)[0];
      if (rel === "en/methodologie.html" && dir !== "en") { assert.ok(L.METHODOLOGY_MISSING_DIRS.includes(dir), dir + " : repli anglais injustifie"); continue; }
      assert.ok(rel.startsWith(dir + "/"), dir + "/" + campaign + " lien d'un autre repertoire : " + url);
      const served = servedPath(rel);
      assert.ok(fs.existsSync(path.join(ROOT, served.endsWith("/") ? served + "index.html" : served)), "page inexistante : " + url);
    }
  }
});

// ------------------------------------------------------------ rendu

test("aucun placeholder non resolu hors BLOCKED_DECISION, identite expediteur jamais inventee", async () => {
  for (const { dir, campaign, r } of await renderAll()) {
    const where = dir + "/" + campaign;
    for (const [part, value] of [["subject", r.subject], ["html", r.html], ["text", r.text]]) {
      assert.doesNotMatch(value, /\{\{|\}\}|LIFECYCLE_BLOCKS/, where + " " + part);
      assert.doesNotMatch(value, /\b(undefined|NaN|null)\b|\[object /, where + " " + part);
      assert.doesNotMatch(value, /\b(TODO|FIXME|XXX)\b|lorem ipsum/i, where + " " + part);
    }
    const brackets = (visible(r.html) + "\n" + r.text + "\n" + r.subject).match(/\[[^\]]*\]/g) || [];
    for (const b of brackets) assert.match(b, /^\[BLOCKED_DECISION: COMPANY_(OPERATOR_NAME|ADDRESS)\]$/, where + " : " + b);
    assert.deepEqual(r.blockedDecisions, ["COMPANY_OPERATOR_NAME", "COMPANY_ADDRESS"], where);
  }
  const ctx = L.siteContext(BUNDLE.markets, "fr");
  const withCompany = L.renderLifecycleEmail(BUNDLE, "inactive_30d", "fr", { marketingOptIn: true }, { unsubscribeUrl: await unsubUrl("fr"), company: { operatorName: "Exploitant Test", address: "1 rue de Test, Paris" } });
  assert.deepEqual(withCompany.blockedDecisions, []);
  assert.ok(withCompany.text.includes("Exploitant Test") && ctx.dir === "fr");
});

test("desinscription en 1 clic, mention 18+ et aide du pays dans chaque email, HTML et texte", async () => {
  for (const { dir, campaign, ctx, unsubscribeUrl, r } of await renderAll()) {
    const where = dir + "/" + campaign;
    assert.ok(r.html.includes('href="' + unsubscribeUrl + '"'), where + " lien de desinscription HTML");
    assert.ok(r.text.includes(unsubscribeUrl), where + " lien de desinscription texte");
    assert.match(unsubscribeUrl, new RegExp("^https://iashark\\.com/" + dir + "/desinscription-email\\.html#t=v1\\."));
    for (const s of [visible(r.html), r.text]) {
      assert.ok(s.includes("18+"), where + " 18+");
      assert.match(s, /18/, where);
      assert.ok(s.includes(ctx.helpline.name), where + " aide : nom");
      assert.ok(s.includes(ctx.helpline.url), where + " aide : lien");
      if (ctx.helpline.phone) assert.ok(s.includes(ctx.helpline.phone), where + " aide : telephone");
    }
    assert.match(r.html, new RegExp('<html lang="' + ctx.htmlLang + '"'), where);
  }
});

test("vocabulaire interdit (sur, gagnant, garanti, bonus et equivalents) absent de tous les emails et textes", async () => {
  for (const { dir, campaign, r } of await renderAll()) {
    assert.deepEqual(L.findForbiddenWords(r.subject + "\n" + visible(r.html) + "\n" + r.text, r.locale), [], dir + "/" + campaign);
  }
  for (const loc of build.LOCALES) {
    const raw = fs.readFileSync(path.join(ROOT, "emails", "lifecycle", "copy." + loc + ".json"), "utf8");
    assert.deepEqual(L.findForbiddenWords(raw, loc), [], "copy." + loc + ".json");
  }
  assert.deepEqual(L.findForbiddenWords("Un pari sûr, gagnant et garanti avec bonus", "fr"), ["sûr", "gagnant", "garanti", "bonus"]);
  assert.deepEqual(L.findForbiddenWords("A sure winner, guaranteed", "en"), ["sure", "winner", "guaranteed"]);
  const PROMISES = /gains? (assurés?|garantis?|faciles?)|rentabilit|make money|easy money|beat the bookies|ganancias? (seguras|garantizadas|fáciles)|dinero fácil/i;
  for (const { r } of await renderAll()) assert.doesNotMatch(r.text, PROMISES);
});

test("aucune donnee payante : seuls noms, competition, horaire et lien des matchs sortent", async () => {
  for (const { dir, campaign, r } of await renderAll()) {
    for (const s of [r.html, r.text]) {
      assert.doesNotMatch(s, /Over 2\.5|1[.,]87|1[.,]55|pari_rec|\bconf\b|51 ?%/, dir + "/" + campaign);
    }
  }
  const m = L.publicMatch(RAW_MATCHES[0], L.siteContext(BUNDLE.markets, "fr"));
  assert.deepEqual(Object.keys(m).sort(), ["away", "home", "id", "kickoff", "kickoffAt", "league", "url"]);
});

test("textes des 7 langues : meme structure, statut REVIEW, liste Pro alignee sur la page Pro", () => {
  const ref = BUNDLE.copy.fr;
  const shape = (c) => Object.keys(c.campaigns).map((k) => k + ":" + c.campaigns[k].blocks.map((b) => b.type + (b.if || "") + (b.link || "") + (b.items ? b.items.length : "")).join(","));
  for (const loc of build.LOCALES) {
    const c = BUNDLE.copy[loc];
    assert.equal(c.locale, loc);
    assert.match(c._status, /^REVIEW/);
    assert.deepEqual(Object.keys(c.common).sort(), Object.keys(ref.common).sort(), loc);
    assert.deepEqual(shape(c), shape(ref), loc);
    // 25/10/2026 : liste Pro = lignes vraies partout de la page Pro (lib/pro-vente.js : tous les
    // matchs, film du match, scores les plus probables) ; combines, Selection en or et buteur
    // seulement sur le marche francais (hasTickets). Plus d'outils, de journal ni de bankroll.
    const dict = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n", "dict", loc + ".json"), "utf8")).pro_vente;
    for (const k of ["item_all_title", "item_film_title", "item_scores_title", "item_combos_title", "item_gold_title", "item_scorer_title"]) assert.ok(dict[k], loc + " " + k);
    const pro = c.campaigns.pro_features.blocks.filter((b) => b.type === "list");
    assert.deepEqual(pro.map((b) => [b.if || "", b.items.length]), [["", 3], ["hasTickets", 1]], loc);
    const all = JSON.stringify(c);
    assert.doesNotMatch(all, /bankroll|capital|esp[ée]rance|expected value|\bROI\b|journal|six (outils|tools)|seis herramientas/i, loc + " : ni mise, ni capital, ni esperance");
    assert.doesNotMatch(all, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, loc + " : aucun emoji");
  }
  assert.deepEqual(Object.keys(ref.campaigns).sort(), Object.keys(L.CAMPAIGNS).sort());
});

test("campagnes par langue : sujet, prix de la version, consentement absent, echappement", async () => {
  const fr = (await renderAll()).filter((x) => x.dir === "fr");
  const by = (c) => fr.find((x) => x.campaign === c).r;
  assert.equal(by("free_match").subject, "Ton match offert : Barcelona – Racing Santander");
  const j5 = by("pro_features").text.replace(/[  ]/g, " ");
  // Prix lus dans config/markets.json (meme source que le site et le paiement) : une baisse
  // de prix = changer config/markets.json puis `node lib/lifecycle-email-build.js`, rien d'autre.
  const fmt = (iv) => R.formatMoney(Math.round(CONFIG.fr.prices.pro[iv].amount * 100), "EUR", "fr-FR").replace(/\s/g, " ");
  assert.ok(j5.includes(fmt("week") + " par semaine, " + fmt("month") + " par mois ou " + fmt("year") + " par an"), "J5 : les 3 durees et leurs prix");
  assert.ok(by("pro_features").text.includes("Français"));
  assert.ok(j5.includes("Le Petit et le Grand combiné du jour"), "marche francais : combines, Selection en or, buteur");
  assert.ok(!j5.includes("jours d'essai"), "essai jamais annonce sans confirmation de l'expediteur");
  assert.ok(by("free_match").text.includes("Chaque jour, IASHARK offre le pari d'un match à tous les comptes gratuits"));
  assert.ok(by("inactive_7d").text.includes("Paris SG – Marseille") && by("inactive_7d").text.includes("Arsenal – Chelsea"));
  assert.ok(!by("inactive_7d").text.includes("Monaco"), "match hors week-end");
  const gb = (await renderAll()).find((x) => x.dir === "gb" && x.campaign === "pro_features").r;
  // /gb/ : mensuel seul payable (19/09/2026) -> ligne « mois seul », jamais la semaine ni l'annee.
  assert.ok(gb.text.includes("Price on the English (UK) version of the site: £14.99 per month") && gb.text.includes("English (UK)"));
  assert.ok(!gb.text.includes("Small and Big combo"), "hors marche francais : pas de combines annonces");
  assert.doesNotMatch(gb.text + gb.html, /£4\.99|£149|per week|per year/, "GB : aucune duree non payable annoncee");
  const mx = (await renderAll()).find((x) => x.dir === "mx" && x.campaign === "pro_features").r;
  assert.ok(mx.text.includes("$69.00 MXN a la semana, $199.00 MXN al mes o $1,990.00 MXN al año"));
  const za = (await renderAll()).find((x) => x.dir === "za" && x.campaign === "pro_features").r;
  const zaText = za.text.replace(/[  ]/g, " ");
  assert.match(zaText, /R 69,00 per week or R 199,00 per month\./, "ZA : semaine et mois");
  assert.doesNotMatch(zaText, /per year|1 999/, "ZA : aucun annuel");

  const unsubscribeUrl = await unsubUrl("fr");
  const welcomeNo = L.renderLifecycleEmail(BUNDLE, "welcome", "fr", { marketingOptIn: false, freeMatch: null }, { unsubscribeUrl });
  assert.ok(welcomeNo.text.includes("tu ne recevras de notre part que les e-mails liés à ton compte"));
  assert.ok(!welcomeNo.text.includes("Le match offert en ce moment"), "pas de match publie : bloc omis, rien d'invente");
  assert.ok(welcomeNo.text.includes("Voir les matchs du jour: https://iashark.com/fr/") || welcomeNo.text.includes("Voir les matchs du jour : https://iashark.com/fr/"), "sans match offert : bouton vers les matchs du jour");
  const welcomeYes = L.renderLifecycleEmail(BUNDLE, "welcome", "fr", { marketingOptIn: true, freeMatch: L.publicMatch(RAW_MATCHES[0], L.siteContext(BUNDLE.markets, "fr")) }, { unsubscribeUrl });
  assert.ok(!welcomeYes.text.includes("que les e-mails liés à ton compte") && welcomeYes.text.includes("Barcelona"));
  assert.ok(welcomeYes.text.includes("Voir le pari offert : https://iashark.com/fr/match.html?id=1570385"));

  // Essai Pro : seulement si l'expediteur l'a confirme pour ce compte (trialDays > 0), meme texte que le site.
  const trial = L.renderLifecycleEmail(BUNDLE, "pro_features", "fr", { trialDays: 7 }, { unsubscribeUrl }).text.replace(/[  ]/g, " ");
  assert.ok(trial.includes("7 jours d'essai pour un premier abonnement au mois : ta carte est demandée, rien n'est prélevé pendant l'essai. Ensuite " + fmt("month") + " par mois"), trial);
  const fmTrial = L.renderLifecycleEmail(BUNDLE, "free_match", "fr", { trialDays: 7, freeMatch: L.publicMatch(RAW_MATCHES[0], L.siteContext(BUNDLE.markets, "fr")) }, { unsubscribeUrl }).text;
  assert.ok(fmTrial.includes("7 jours d'essai pour un premier abonnement au mois") && fmTrial.includes("Voir l'offre Pro : https://iashark.com/fr/pro.html"));

  const evil = L.publicMatch({ id: 9, home: { n: "<b>A&B</b>" }, away: { n: "C" }, date: "2026-09-19 20:00", league: "L" }, L.siteContext(BUNDLE.markets, "fr"));
  const esc = L.renderLifecycleEmail(BUNDLE, "free_match", "fr", { freeMatch: evil }, { unsubscribeUrl });
  assert.ok(esc.html.includes("&lt;b&gt;A&amp;B&lt;/b&gt;") && !esc.html.includes("<b>A&B</b>"));
});

test("HTML compatible clients mail : CSS inline, mode sombre, ni script ni image, < 102 Ko", async () => {
  for (const { dir, campaign, r } of await renderAll()) {
    const where = dir + "/" + campaign;
    assert.match(r.html, /<meta name="color-scheme" content="light dark">/, where);
    assert.match(r.html, /\[data-ogsc\]/, where);
    assert.doesNotMatch(r.html, /<script|<img|<link|<iframe|<form|javascript:|url\(/i, where);
    for (const tag of stripStyle(r.html).match(/<(p|h1|td|table|a)\b[^>]*>/g) || []) assert.match(tag, /style="[^"]+"/, where + " " + tag.slice(0, 60));
    assert.ok(Buffer.byteLength(r.html) < 102 * 1024, where);
    assert.doesNotMatch(r.text, /<[a-z]/i, where);
  }
});

test("refus explicites : contenu manquant jamais remplace par du texte generique", async () => {
  const code = (c) => (e) => e instanceof R.EmailRenderError && e.code === c;
  const unsubscribeUrl = await unsubUrl("fr");
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "free_match", "fr", { freeMatch: null }, { unsubscribeUrl }), code("missing_free_match"));
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "inactive_7d", "fr", { weekendMatches: [] }, { unsubscribeUrl }), code("missing_weekend_matches"));
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "pro_weekly_summary", "fr", {}, { unsubscribeUrl }), code("missing_weekend_matches"));
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "inactive_30d", "fr", {}, {}), code("invalid_unsubscribe_url"));
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "inactive_30d", "fr", {}, { unsubscribeUrl: "https://iashark.com/gb/desinscription-email.html#t=x" }), code("invalid_unsubscribe_url"));
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "promo", "fr", {}, { unsubscribeUrl }), code("unknown_campaign"));
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "inactive_30d", "nl", {}, { unsubscribeUrl }), code("unknown_dir"));
  const noPrice = JSON.parse(JSON.stringify(BUNDLE));
  noPrice.markets.fr.prices.pro = null;
  assert.throws(() => L.renderLifecycleEmail(noPrice, "pro_features", "fr", {}, { unsubscribeUrl }), code("price_unavailable"));
});

// ------------------------------------------------------------ matchs publics

test("match offert : le meme que le site (jour local, free_day) et jamais un match deja commence", () => {
  const fr = L.siteContext(BUNDLE.markets, "fr");
  const list = [
    { id: 11, home: { n: "A" }, away: { n: "B" }, date: "2026-10-25 15:00", is_free: true },
    { id: 12, home: { n: "C" }, away: { n: "D" }, date: "2026-10-26 20:30", is_free: true },
    { id: 13, home: { n: "E" }, away: { n: "F" }, date: "2026-10-25 21:00" }
  ];
  assert.equal(L.pickFreeMatch(list, new Date("2026-10-25T08:00:00Z"), fr).id, 11, "matin : le match offert du jour");
  // Le site garde le match du jour jusqu'a minuit : l'e-mail n'annonce ni ce match deja
  // commence, ni celui du lendemain (qui n'est pas encore le match offert du site).
  assert.equal(L.pickFreeMatch(list, new Date("2026-10-25T14:30:00Z"), fr), null);
  assert.equal(L.pickFreeMatch(list, new Date("2026-10-26T08:00:00Z"), fr).id, 12, "lendemain : le nouveau match offert");
  // Match reporte : free_day (jour de la designation) fait foi.
  const moved = [Object.assign({}, list[1], { date: "2026-10-27 20:30", free_day: "2026-10-26" })];
  assert.equal(L.pickFreeMatch(moved, new Date("2026-10-26T08:00:00Z"), fr).id, 12);
  assert.equal(L.pickFreeMatch(moved, new Date("2026-10-27T08:00:00Z"), fr), null, "designation d'un jour passe : jamais offerte");
  // Lien : vraie page du match quand le pipeline l'a ecrite (page_dirs).
  const withPage = L.pickFreeMatch([Object.assign({}, list[0], { page_dirs: ["fr", "en"] })], new Date("2026-10-25T08:00:00Z"), fr);
  assert.equal(withPage.url, "https://iashark.com/match/11.html");
  assert.equal(L.pickFreeMatch([Object.assign({}, list[0], { page_dirs: ["fr"] })], new Date("2026-10-25T08:00:00Z"), L.siteContext(BUNDLE.markets, "gb")).url, "https://iashark.com/gb/match.html?id=11");
});

test("langue du compte : repertoire du rendu (user_preferences.language d'abord)", () => {
  assert.equal(L.dirForLanguage(null, "gb"), "gb");
  assert.equal(L.dirForLanguage("en", "gb"), "gb");
  assert.equal(L.dirForLanguage("es", "fr"), "es");
  assert.equal(L.dirForLanguage("es-MX", "mx"), "mx");
  assert.equal(L.dirForLanguage("fr", "za"), "fr");
  assert.equal(L.dirForLanguage("nl", "de"), "de");
  assert.equal(L.dirForLanguage("en", "inconnu"), "en");
});

test("match offert : designation du pipeline, pas commence, designation pays pour mx", () => {
  const fr = L.siteContext(BUNDLE.markets, "fr");
  const mx = L.siteContext(BUNDLE.markets, "mx");
  assert.equal(L.pickFreeMatch(RAW_MATCHES, NOW, fr).id, 1570385);
  assert.equal(L.pickFreeMatch(RAW_MATCHES, NOW, mx).id, 2004);
  assert.equal(L.pickFreeMatch(RAW_MATCHES, new Date("2026-09-17T19:31:00Z"), fr), null, "coup d'envoi passe");
  assert.equal(L.pickFreeMatch(RAW_MATCHES.map((m) => Object.assign({}, m, { is_free: false })), NOW, fr), null);
  assert.equal(L.pickFreeMatch(null, NOW, fr), null);
  const m = L.pickFreeMatch(RAW_MATCHES, NOW, fr);
  assert.equal(m.url, "https://iashark.com/fr/match.html?id=1570385");
  assert.equal(m.kickoffAt, "2026-09-17T19:30:00.000Z");
});

test("matchs du week-end : samedi et dimanche locaux, a venir, tries", () => {
  const fr = L.siteContext(BUNDLE.markets, "fr");
  assert.deepEqual(L.weekendMatches(RAW_MATCHES, NOW, fr).map((m) => m.id), [2004, 2001, 2002]);
  // Heure de Mexico : America - Chivas (samedi 04:00 a Paris) = vendredi soir.
  assert.deepEqual(L.weekendMatches(RAW_MATCHES, NOW, L.siteContext(BUNDLE.markets, "mx")).map((m) => m.id), [2001, 2002]);
  assert.deepEqual(L.weekendMatches(RAW_MATCHES, new Date("2026-09-20T18:00:00Z"), fr).map((m) => m.id), [], "dimanche soir : plus rien a venir ce week-end");
  assert.equal(L.weekendMatches(RAW_MATCHES, NOW, fr, 1).length, 1);
});

test("dates : heure de Paris du pipeline, changement d'heure, semaine ISO", () => {
  assert.equal(L.parisDate("2026-03-29 12:00").toISOString(), "2026-03-29T10:00:00.000Z");
  assert.equal(L.parisDate("2026-01-10 12:00").toISOString(), "2026-01-10T11:00:00.000Z");
  assert.equal(L.parisDate("demain"), null);
  assert.deepEqual(L.localClock(NOW, "Europe/Paris"), { date: "2026-09-17", hour: 12, minute: 0, isoDow: 4, isoWeek: "2026-W38" });
  assert.equal(L.localClock(new Date("2027-01-01T12:00:00Z"), "Europe/Paris").isoWeek, "2026-W53");
  assert.equal(L.localClock(new Date("2026-09-17T04:30:00Z"), "America/Mexico_City").date, "2026-09-16");
});

// ------------------------------------------------------------ selection

function facts(over) {
  return Object.assign({
    market: "fr", plan: "free", role: "customer", marketingOptIn: true, notifyWeeklyRecap: true,
    hasSubscription: false, suppressed: false,
    createdAt: new Date(NOW - 2.5 * DAY).toISOString(), lastSignInAt: new Date(NOW - 2.5 * DAY).toISOString(), lastFunnelAt: null,
    lastEngagementAt: null, lastMarketingSentAt: null, sentKeys: ["welcome:"]
  }, over || {});
}
const decide = (over, now) => L.decideCampaign(facts(over), now || NOW);
const ago = (days) => new Date(NOW - days * DAY).toISOString();

test("J0 bienvenue : a tous (meme sans consentement), une seule fois, fenetre de 3 jours", () => {
  assert.deepEqual(decide({ createdAt: ago(0.01), sentKeys: [], marketingOptIn: false }), { campaign: "welcome", key: "", reason: null });
  assert.equal(decide({ createdAt: ago(0.01), sentKeys: [] }, new Date("2026-09-17T01:00:00Z")).campaign, "welcome", "transactionnel : pas de plage de nuit");
  assert.equal(decide({ createdAt: ago(4), sentKeys: [], marketingOptIn: false }).reason, "not_opted_in", "compte ancien : jamais de bienvenue a l'activation");
  assert.equal(decide({ createdAt: ago(1), sentKeys: ["welcome:"], marketingOptIn: false }).campaign, null);
});

test("sans consentement : aucun email marketing, quels que soient l'anciennete et l'inactivite", () => {
  for (const over of [{}, { createdAt: ago(6), lastSignInAt: ago(6), sentKeys: ["welcome:", "free_match:"] }, { createdAt: ago(40), lastSignInAt: ago(35) }, { createdAt: ago(20), lastSignInAt: ago(8) }]) {
    assert.deepEqual(decide(Object.assign({ marketingOptIn: false }, over)), { campaign: null, key: "", reason: "not_opted_in" });
  }
});

test("sequence gratuite : J2 match offert, J5 Pro, inactivite 7 j (jeudi-samedi) puis 30 j", () => {
  assert.equal(decide().campaign, "free_match");
  assert.equal(decide({ createdAt: ago(5.5), lastSignInAt: ago(5.5), sentKeys: ["welcome:", "free_match:"], lastMarketingSentAt: ago(3.2) }).campaign, "pro_features");
  const d7 = decide({ createdAt: ago(25), lastSignInAt: ago(8), sentKeys: ["welcome:", "free_match:", "pro_features:"], lastMarketingSentAt: ago(10) });
  assert.deepEqual(d7, { campaign: "inactive_7d", key: ago(8).slice(0, 10), reason: null });
  assert.equal(decide({ createdAt: ago(25), lastSignInAt: ago(8), sentKeys: ["welcome:", "free_match:", "pro_features:"] }, new Date(NOW.getTime() - 3 * DAY)).reason, "nothing_due", "lundi : pas de relance week-end");
  assert.equal(decide({ createdAt: ago(25), lastSignInAt: ago(8), sentKeys: ["free_match:", "pro_features:", "inactive_7d:" + ago(8).slice(0, 10)] }).reason, "nothing_due", "meme episode : pas de doublon");
  assert.equal(decide({ createdAt: ago(25), lastSignInAt: ago(1), sentKeys: ["free_match:", "pro_features:"] }).reason, "nothing_due", "actif : rien");
  assert.deepEqual(decide({ createdAt: ago(90), lastSignInAt: ago(31), sentKeys: ["inactive_7d:" + ago(31).slice(0, 10)] }), { campaign: "inactive_30d", key: ago(31).slice(0, 10), reason: null });
  assert.equal(decide({ createdAt: ago(90), lastSignInAt: ago(31), sentKeys: ["inactive_30d:" + ago(31).slice(0, 10)] }).reason, "nothing_due");
  assert.equal(decide({ createdAt: ago(90), lastSignInAt: ago(12), lastFunnelAt: ago(6) }).reason, "nothing_due", "activite funnel_events prise en compte");
});

test("frequence max 1 email marketing / 3 jours, jamais la nuit (heure du marche)", () => {
  assert.equal(decide({ lastMarketingSentAt: ago(2.9) }).reason, "frequency_cap");
  assert.equal(decide({ lastMarketingSentAt: ago(3.01) }).campaign, "free_match");
  assert.equal(decide({}, new Date("2026-09-17T19:30:00Z")).reason, "quiet_hours", "21:30 a Paris");
  assert.equal(decide({}, new Date("2026-09-17T06:30:00Z")).reason, "quiet_hours", "08:30 a Paris");
  assert.equal(decide({}, new Date("2026-09-17T07:00:00Z")).campaign, "free_match", "09:00 a Paris");
  // Mexique : 16:00 UTC = 10:00 a Mexico (ok) ; 04:00 UTC = 22:00 la veille (nuit).
  assert.equal(decide({ market: "mx" }, new Date("2026-09-17T16:00:00Z")).campaign, "free_match");
  assert.equal(decide({ market: "mx" }, new Date("2026-09-17T04:00:00Z")).reason, "quiet_hours");
  assert.equal(decide({ market: "gb" }, new Date("2026-09-17T20:30:00Z")).reason, "quiet_hours", "21:30 a Londres");
});

test("arret automatique apres 60 jours sans visite, ouverture ni clic", () => {
  assert.equal(decide({ createdAt: ago(200), lastSignInAt: ago(61) }).reason, "stopped_inactive_60d");
  assert.equal(decide({ createdAt: ago(200), lastSignInAt: ago(61), lastEngagementAt: ago(10) }).reason, "nothing_due", "un clic recent maintient l'abonnement, sans relance d'inactivite au-dela de 60 j");
  assert.equal(decide({ createdAt: ago(200), lastSignInAt: ago(59) }).campaign, "inactive_30d");
});

test("abonne Pro, abonnement actif ou admin : jamais d'email de vente, resume hebdomadaire optionnel", () => {
  for (const over of [{ plan: "pro" }, { hasSubscription: true }, { role: "admin" }]) {
    const young = Object.assign({ createdAt: ago(6), lastSignInAt: ago(6), sentKeys: ["welcome:", "free_match:"] }, over);
    assert.notEqual(decide(young).campaign, "pro_features");
    assert.notEqual(decide(Object.assign({}, over, { createdAt: ago(3) })).campaign, "free_match");
    assert.equal(decide(Object.assign({}, over, { createdAt: ago(40), lastSignInAt: ago(10) })).campaign, "pro_weekly_summary");
  }
  assert.deepEqual(decide({ plan: "pro", createdAt: ago(40) }), { campaign: "pro_weekly_summary", key: "2026-W38", reason: null });
  assert.equal(decide({ plan: "pro", createdAt: ago(40), notifyWeeklyRecap: false }).reason, "nothing_due");
  assert.equal(decide({ plan: "pro", createdAt: ago(40), sentKeys: ["pro_weekly_summary:2026-W38"] }).reason, "nothing_due", "une fois par semaine");
  assert.equal(decide({ plan: "pro", createdAt: ago(40) }, new Date("2026-09-15T10:00:00Z")).reason, "nothing_due", "mardi");
  assert.equal(decide({ plan: "pro", createdAt: ago(40), marketingOptIn: false }).reason, "not_opted_in");
});

test("adresse en rebond ou plainte : plus aucun email de relance", () => {
  assert.equal(decide({ suppressed: true, createdAt: ago(0.1), sentKeys: [] }).reason, "suppressed");
});

test("factsFromRow : ligne SQL -> faits (miroir de lifecycle_email_candidates)", () => {
  const f = L.factsFromRow({ user_id: USER, market: "gb", plan: "free", marketing_opt_in: true, notify_weekly_recap: null, created_at: ago(3), last_sign_in_at: ago(3), sent_keys: ["welcome:"] });
  assert.equal(f.market, "gb");
  assert.equal(f.notifyWeeklyRecap, true);
  assert.equal(L.decideCampaign(f, NOW).campaign, "free_match");
  assert.equal(L.factsFromRow({ marketing_opt_in: "true" }).marketingOptIn, false, "seul le booleen true vaut consentement");
});

// ------------------------------------------------------------ jeton

test("jeton de desinscription : signature HMAC, aucune donnee personnelle, expiration", async () => {
  const token = await L.createUnsubscribeToken({ userId: USER, dir: "mx" }, SECRET, NOW);
  assert.match(token, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
  assert.ok(!token.includes("@"));
  const ok = await L.verifyUnsubscribeToken(token, SECRET, NOW);
  assert.deepEqual([ok.ok, ok.userId, ok.dir], [true, USER, "mx"]);
  assert.equal(ok.expiresAt, new Date(NOW.getTime() + L.TOKEN_TTL_DAYS * DAY).toISOString());

  const [v, payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ u: "11111111-2222-3333-4444-555555555555", d: "mx", e: 9999999999 })).toString("base64url");
  assert.equal((await L.verifyUnsubscribeToken([v, forged, sig].join("."), SECRET, NOW)).reason, "bad_signature");
  assert.equal((await L.verifyUnsubscribeToken(token, SECRET + "x", NOW)).reason, "bad_signature");
  assert.equal((await L.verifyUnsubscribeToken(token.slice(0, -2) + "AA", SECRET, NOW)).reason, "bad_signature");
  assert.equal((await L.verifyUnsubscribeToken([v, payload].join("."), SECRET, NOW)).reason, "malformed");
  assert.equal((await L.verifyUnsubscribeToken("v2." + payload + "." + sig, SECRET, NOW)).reason, "malformed");
  assert.equal((await L.verifyUnsubscribeToken(null, SECRET, NOW)).reason, "malformed");
  assert.equal((await L.verifyUnsubscribeToken(token, SECRET, new Date(NOW.getTime() + (L.TOKEN_TTL_DAYS + 1) * DAY))).reason, "expired");
  const short = await L.createUnsubscribeToken({ userId: USER, dir: "fr" }, SECRET, NOW, 1);
  assert.equal((await L.verifyUnsubscribeToken(short, SECRET, new Date(NOW.getTime() + DAY + 1000))).reason, "expired");
  assert.equal((await L.verifyUnsubscribeToken(short, SECRET, new Date(NOW.getTime() + DAY - 1000))).ok, true);

  assert.equal((await L.verifyUnsubscribeToken(token, "court", NOW)).reason, "secret_missing");
  await assert.rejects(L.createUnsubscribeToken({ userId: USER, dir: "fr" }, "court", NOW), (e) => e.code === "secret_missing");
  await assert.rejects(L.createUnsubscribeToken({ userId: "pas-un-uuid", dir: "fr" }, SECRET, NOW), (e) => e.code === "invalid_user");
  await assert.rejects(L.createUnsubscribeToken({ userId: USER, dir: "nl" }, SECRET, NOW), (e) => e.code === "unknown_dir");
});

test("liens et en-tetes List-Unsubscribe (RFC 2369 / RFC 8058)", async () => {
  const token = await L.createUnsubscribeToken({ userId: USER, dir: "gb" }, SECRET, NOW);
  const links = L.unsubscribeLinks(token, "gb", "https://ksvjraqitxouwiabecai.supabase.co/");
  assert.equal(links.page, "https://iashark.com/gb/desinscription-email.html#t=" + token);
  assert.equal(links.oneClick, "https://ksvjraqitxouwiabecai.supabase.co/functions/v1/email-unsubscribe?t=" + token);
  assert.deepEqual(L.listUnsubscribeHeaders(links.oneClick), { "List-Unsubscribe": "<" + links.oneClick + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" });
  assert.throws(() => L.unsubscribeLinks(token, "gb", "http://insecure.example"), (e) => e.code === "invalid_base_url");
});
