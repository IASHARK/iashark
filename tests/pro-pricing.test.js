"use strict";
// Offre Pro unique vendue en 3 durees (semaine, mois, annee) - decision du
// proprietaire du 16/09/2026 : prix valides par marche, annuel NON ouvert en
// Afrique du Sud au lancement, duree par defaut Mois, equivalent mensuel et
// economie calcules, aucun repli vers un autre prix / une autre devise, aucune
// reference a l'ancienne offre Edge. Source unique des prix : config/markets.json.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const MARKETS = JSON.parse(read("config/markets.json"));
const MARKET_KEYS = Object.keys(MARKETS).filter((k) => k.charAt(0) !== "_");
const INTERVALS = ["week", "month", "year"];
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
// Prix TTC valides par le proprietaire (null = duree non vendue dans ce marche).
const EXPECTED = {
  fr: { currency: "EUR", week: 6.99, month: 19.95, year: 199 },
  gb: { currency: "GBP", week: 4.99, month: 14.99, year: 149 },
  mx: { currency: "MXN", week: 69, month: 199, year: 1990 },
  za: { currency: "ZAR", week: 69, month: 199, year: null },
  // Offre USD de /en/ (decision du 19/09/2026) : mensuel seul, inerte tant que
  // config/markets.json#_usdSwitch n'est pas applique (tests/usd-switch.test.js).
  us: { currency: "USD", week: null, month: 19.99, year: null }
};
const USD_SWITCHED = MARKETS._dirs.en.market === "us";
const norm = (s) => String(s).replace(/[  ]/g, " ");

function loadMarketLib() {
  const sandbox = {};
  new Function("window", read("lib/market-config.js"))(sandbox);
  return sandbox.IasharkMarketConfig;
}
const lib = loadMarketLib();

test("config : une seule offre payante (pro), prix valides par marche et par duree, ZA sans annuel", () => {
  assert.deepEqual(MARKETS._planKeys, ["free", "pro"]);
  assert.deepEqual(MARKETS._proIntervals, INTERVALS);
  assert.equal(MARKETS._proDefaultInterval, "month");
  assert.deepEqual(MARKET_KEYS.slice().sort(), ["fr", "gb", "mx", "us", "za"]);
  for (const k of MARKET_KEYS) {
    const m = MARKETS[k];
    assert.equal(m.currency, EXPECTED[k].currency, k);
    assert.deepEqual(Object.keys(m.prices).sort(), ["free", "pro"], k + " : cles de prix");
    const sold = INTERVALS.filter((iv) => EXPECTED[k][iv] != null);
    for (const iv of INTERVALS) {
      if (EXPECTED[k][iv] == null) assert.ok(m.prices.pro[iv] == null, k + "." + iv + " : non vendu");
      else assert.equal(m.prices.pro[iv].amount, EXPECTED[k][iv], k + "." + iv);
    }
    // Un secret Stripe par duree VENDUE, jamais pour une duree non vendue.
    assert.deepEqual(Object.keys(m.stripeEnvKeys).sort(), sold.slice().sort(), k + " : secrets Stripe");
    for (const iv of sold) assert.equal(m.stripeEnvKeys[iv], "STRIPE_PRICE_ID_" + k.toUpperCase() + "_" + iv.toUpperCase());
    assert.ok(!("stripeEnvKey" in m), k + " : ancien secret unique retire");
    // Ids de Price Stripe de la configuration (facultatifs, dernier recours de
    // create-checkout-session) : jamais pour une duree non vendue.
    for (const iv of Object.keys(m.stripePriceIds || {})) {
      assert.ok(sold.includes(iv), k + "." + iv + " : id de Price pour une duree non vendue");
      assert.match(m.stripePriceIds[iv], /^price_[A-Za-z0-9]+$/, k + "." + iv);
    }
  }
  assert.ok(!("year" in MARKETS.za.stripeEnvKeys), "aucun STRIPE_PRICE_ID_ZA_YEAR lu");
  assert.equal(MARKETS.fr.stripeEnvKeyLegacyMonth, "STRIPE_PRICE_ID", "seul repli admis : mensuel FR");
  for (const k of ["gb", "mx", "za", "us"]) assert.equal(MARKETS[k].stripeEnvKeyLegacyMonth, null, k);
  assert.doesNotMatch(read("config/markets.json"), /\bedge\b|annual_edge/i, "aucune reference a l'offre Edge");
});

test("market-config : alias pro = mensuel, cles pro.<duree>, forme historique, duree non vendue = null", () => {
  const p = MARKETS.gb.prices;
  assert.equal(lib.priceFor(p, "pro"), 14.99);
  assert.equal(lib.priceFor(p, "pro.week"), 4.99);
  assert.equal(lib.priceFor(p, "pro_year"), 149);
  assert.equal(lib.priceFor(p, "free"), 0);
  assert.equal(lib.priceFor(MARKETS.za.prices, "pro.year"), null, "ZA : annuel non ouvert");
  for (const k of ["edge", "annual_edge", "pro.quarter", "pro.", ""]) assert.equal(lib.priceFor(p, k), null, k);
  assert.equal(lib.priceFor({ pro: { amount: 19.95, interval: "month" } }, "pro"), 19.95, "forme historique");
  assert.equal(lib.priceFor({ pro: { amount: 19.95, interval: "month" } }, "pro.year"), null);
  assert.equal(lib.priceFor({ pro: { week: null, month: { amount: 10 } } }, "pro.week"), null);
  assert.deepEqual(lib.PRO_INTERVALS, INTERVALS);
  assert.equal(lib.PRO_DEFAULT_INTERVAL, "month");
});

test("equivalent mensuel et economie de l'annuel : calcules, jamais surestimes ; aucune economie sans annuel", () => {
  for (const k of MARKET_KEYS) {
    const m = MARKETS[k];
    const offer = lib.proOffer(m.prices, m.currency, m.intlLocale);
    assert.equal(offer.defaultInterval, "month");
    const year = offer.intervals.find((i) => i.interval === "year");
    for (const iv of ["week", "month"]) {
      const it = offer.intervals.find((i) => i.interval === iv);
      assert.equal(it.amount, EXPECTED[k][iv]);
      assert.equal(it.savingsPct, null, k + " " + iv + " : aucune economie affichee");
      assert.equal(it.monthlyEquivalent, null);
    }
    if (EXPECTED[k].year == null) {
      assert.deepEqual([year.amount, year.text, year.monthlyEquivalent, year.savingsPct], [null, null, null, null], k);
      continue;
    }
    const month = m.prices.pro.month.amount, annual = m.prices.pro.year.amount;
    assert.ok(year.monthlyEquivalent * 12 >= annual - 1e-9, k + " equivalent sous-estime");
    assert.ok((year.monthlyEquivalent - 0.01) * 12 < annual, k + " equivalent trop arrondi");
    const real = (1 - annual / (12 * month)) * 100;
    assert.ok(year.savingsPct <= real && year.savingsPct > real - 1, k + " economie " + year.savingsPct + " vs " + real);
  }
  const offerOf = (k) => lib.proOffer(MARKETS[k].prices, MARKETS[k].currency, MARKETS[k].intlLocale);
  assert.deepEqual(["fr", "gb", "mx", "za"].map((k) => offerOf(k).intervals[2].savingsPct), [16, 17, 16, null]);
  assert.deepEqual(["fr", "gb", "mx"].map((k) => offerOf(k).intervals[2].monthlyEquivalent), [16.59, 12.42, 165.84]);
  const noSave = lib.proOffer({ pro: { week: { amount: 1 }, month: { amount: 10 }, year: { amount: 120 } } }, "EUR", "fr-FR");
  assert.equal(noSave.intervals[2].savingsPct, null, "aucune economie si l'annuel n'est pas moins cher que 12 mois");
});

test("apply() : prix par duree, equivalent, economie, element masque si la duree n'est pas vendue", () => {
  function el(attrs) {
    return { tagName: "SPAN", attrs: Object.assign({}, attrs), textContent: "orig", hidden: false,
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
      setAttribute(k, v) { this.attrs[k] = String(v); }, removeAttribute(k) { delete this.attrs[k]; } };
  }
  const root = (els) => ({ querySelectorAll(sel) { const a = sel.replace(/^\[|\]$/g, ""); return els.filter((e) => a in e.attrs); } });
  const fr = [el({ "data-market-price": "pro.year" }), el({ "data-market-price-equiv": "year" }), el({ "data-market-savings": "year" }), el({ "data-market-price": "edge" }), el({ "data-market-price-if": "pro.year" })];
  lib.build("fr").apply(root(fr));
  assert.match(fr[0].textContent, /199/);
  assert.match(norm(fr[1].textContent), /16,59/);
  assert.equal(fr[2].textContent, "16");
  assert.equal(fr[3].textContent, "orig");
  assert.ok("data-market-price-unavailable" in fr[3].attrs);
  assert.equal(fr[4].hidden, false);
  const za = [el({ "data-market-price": "pro.year" }), el({ "data-market-savings": "year" }), el({ "data-market-price-if": "pro.year" }), el({ "data-market-price": "pro.week" })];
  lib.build("za").apply(root(za));
  assert.equal(za[0].textContent, "orig");
  assert.ok("data-market-price-unavailable" in za[0].attrs, "ZA : aucun prix annuel invente");
  assert.equal(za[1].hidden, true);
  assert.equal(za[2].hidden, true);
  assert.match(norm(za[3].textContent), /R ?69/);
});

test("build-locales : prix masques cuits dans le HTML genere ; l'accueil n'annonce plus semaine ni annee", () => {
  const builder = require(path.join(ROOT, "scripts/build-locales.js"));
  assert.doesNotMatch(builder.bakeMarket('<p data-market-price-if="pro.year" hidden>x</p>', "gb"), /\shidden/);
  assert.match(builder.bakeMarket('<p data-market-price-if="pro.year">x</p>', "za"), /\shidden/);
  // 19/09/2026 (decision du proprietaire) : plus de « Bientot aussi a la
  // semaine ou a l'annee » sur l'accueil - le visiteur ne doit pas attendre
  // une duree qui n'est pas payable. Ligne et cles retirees.
  assert.doesNotMatch(read("index.html"), /prixProDurees|pro_other_durations|Bientôt aussi à la semaine/);
  for (const d of Object.keys(MARKETS._dirs)) {
    const html = norm(read(d + "/index.html"));
    assert.doesNotMatch(html, /prixProDurees|Bientôt aussi|Coming soon: weekly|Próximamente también semanal|Demnächst auch wöchentlich|Presto anche settimanale|Em breve também semanal/, d);
    assert.doesNotMatch(html, /data-market-price="pro\.(week|year)"/, d + " : aucun prix semaine / annee sur l'accueil");
  }
  // Carte Pro de l'accueil : prix mensuel (duree par defaut) conserve.
  assert.match(norm(read("za/index.html")), /id="prixPro" data-market-price="pro"[^>]*>R ?199</);
});

test("table des prix de create-checkout-session synchronisee avec config/markets.json (durees vendues seulement)", () => {
  const builder = require(path.join(ROOT, "scripts/build-locales.js"));
  const table = builder.checkoutPriceTable();
  for (const k of MARKET_KEYS) {
    assert.equal(table[k].currency, MARKETS[k].currency);
    for (const iv of INTERVALS) {
      if (EXPECTED[k][iv] == null) { assert.ok(!(iv in table[k].intervals), k + "." + iv + " absent de la table"); continue; }
      assert.equal(table[k].intervals[iv].unitAmount, Math.round(EXPECTED[k][iv] * 100), k + "." + iv);
      assert.equal(table[k].intervals[iv].envKey, MARKETS[k].stripeEnvKeys[iv]);
    }
  }
  const generated = read("supabase/functions/create-checkout-session/prices.generated.ts");
  assert.ok(generated.includes(JSON.stringify(table, null, 2)), "prices.generated.ts perime : relancer node scripts/build-locales.js");
});

test("create-checkout-session (pricing.ts) : duree validee, secret absent = bientot disponible, jamais de repli", async () => {
  const pricing = await import(pathToFileURL(path.join(ROOT, "supabase/functions/create-checkout-session/pricing.ts")).href);
  const builder = require(path.join(ROOT, "scripts/build-locales.js"));
  const env = (o) => (k) => o[k];
  const all = {};
  for (const k of MARKET_KEYS) for (const iv of Object.keys(MARKETS[k].stripeEnvKeys)) all[MARKETS[k].stripeEnvKeys[iv]] = "price_" + k + "_" + iv;
  // Resolution par les SEULS secrets : table sans les ids de Price de la
  // configuration (dernier recours, teste a part ci-dessous et dans
  // tests/usd-switch.test.js), sinon chaque duree payable serait toujours resolue.
  const noIds = JSON.parse(JSON.stringify(MARKETS));
  for (const k of MARKET_KEYS) delete noIds[k].stripePriceIds;
  const T0 = builder.checkoutPriceTable(noIds);
  const R = (e, m, iv) => pricing.resolvePriceId(env(e), m, iv, T0);

  assert.deepEqual({ ...R(all, undefined, undefined) }, { ok: true, priceId: "price_fr_month", usedMarket: "fr", interval: "month", currency: "EUR", unitAmount: 1995 }, "defaut = mensuel FR");
  assert.equal(R(all, "gb", "year").priceId, "price_gb_year");
  assert.equal(R(all, "mx", "WEEK").unitAmount, 6900);
  assert.equal(R(all, undefined, "quarter").reason, "invalid_interval");
  assert.equal(R(all, "gb", 12).reason, "invalid_interval");
  assert.equal(R(all, "fr", "month").reason, "market_not_configured", "fr explicite : comportement historique");
  assert.equal(R(all, "ca", "month").reason, "market_not_configured", "marche inconnu");
  assert.equal(R(all, "us", "month").unitAmount, 1999, "us : USD mensuel");
  assert.equal(R(all, "us", "year").reason, "interval_not_configured", "us : annuel non vendu");
  // ZA : annuel non vendu -> jamais facture, meme si un secret existait (table reelle, ids de configuration compris).
  assert.equal(pricing.resolvePriceId(env(Object.assign({ STRIPE_PRICE_ID_ZA_YEAR: "price_cree_par_erreur" }, all)), "za", "year").reason, "interval_not_configured");
  // Duree dont le secret manque : jamais le prix d'une autre duree.
  for (const k of MARKET_KEYS) {
    const noWeek = { ...all }; delete noWeek[MARKETS[k].stripeEnvKeys.week];
    const r = R(noWeek, k === "fr" ? undefined : k, "week");
    assert.equal(r.ok, false, k);
    assert.equal(r.reason, "interval_not_configured", k);
  }
  assert.equal(R({ STRIPE_PRICE_ID: "price_legacy", STRIPE_PRICE_ID_FR_WEEK: "w" }, "za", "month").reason, "market_not_configured", "jamais le prix FR / EUR");
  assert.equal(R({ STRIPE_PRICE_ID: "price_legacy" }, undefined, "month").priceId, "price_legacy");
  assert.equal(R({ STRIPE_PRICE_ID: "price_legacy" }, undefined, "year").reason, "interval_not_configured");
  assert.equal(R({ STRIPE_PRICE_ID_GB: "old" }, "gb", "month").reason, "market_not_configured", "anciens secrets marche uniques ignores");

  assert.deepEqual({ ...pricing.availability(env({ STRIPE_PRICE_ID_MX_YEAR: "p" }), "mx", T0) }, { week: false, month: false, year: true });
  assert.deepEqual({ ...pricing.availability(env(all), "za") }, { week: true, month: true, year: false });
  assert.deepEqual({ ...pricing.availability(env(all), "ca") }, { week: false, month: false, year: false });
  assert.deepEqual({ ...pricing.availability(env(all), "us") }, { week: false, month: true, year: false });

  const good = { active: true, type: "recurring", currency: "gbp", unit_amount: 14900, tax_behavior: "inclusive", recurring: { interval: "year", interval_count: 1 } };
  const exp = { currency: "GBP", unitAmount: 14900, interval: "year" };
  assert.equal(pricing.priceMatches(good, exp), true);
  assert.equal(pricing.priceMatches({ ...good, tax_behavior: "unspecified" }, exp), true);
  for (const bad of [{ currency: "eur" }, { unit_amount: 14999 }, { recurring: { interval: "month", interval_count: 1 } }, { recurring: { interval: "year", interval_count: 2 } }, { active: false }, { tax_behavior: "exclusive" }, { type: "one_time" }]) {
    assert.equal(pricing.priceMatches({ ...good, ...bad }, exp), false, JSON.stringify(bad));
  }
});

test("create-checkout-session : id de Price de la configuration en dernier recours (secret, ancien secret, puis configuration), jamais d'un autre marche ou d'une autre duree", async () => {
  const builder = require(path.join(ROOT, "scripts/build-locales.js"));
  const pricing = await import(pathToFileURL(path.join(ROOT, "supabase/functions/create-checkout-session/pricing.ts")).href);
  const env = (o) => (k) => o[k];
  // FR mensuel comme aujourd'hui : le secret historique STRIPE_PRICE_ID, table generee reelle.
  const today = pricing.resolvePriceId(env({ STRIPE_PRICE_ID: "price_1UB7tpCz0CerLuxwNxsTsMRM" }), undefined, "month");
  assert.deepEqual({ ...today }, { ok: true, priceId: "price_1UB7tpCz0CerLuxwNxsTsMRM", usedMarket: "fr", interval: "month", currency: "EUR", unitAmount: 1995 });
  // Configuration reelle du 19/09/2026 (decisions du proprietaire) : un id de
  // Price par duree PAYABLE, jamais pour une duree fermee ; sans aucun secret,
  // les durees payables de chaque marche sont resolues par ces ids.
  const PAYABLE_IDS = {
    fr: { week: "price_1UHPKzCz0CerLuxwrFe5hklH", month: "price_1UB7tpCz0CerLuxwNxsTsMRM", year: "price_1UHPL0Cz0CerLuxw26Kh72BF" },
    gb: { month: "price_1UHPIRCz0CerLuxwwMv0zpmY" },
    mx: { week: "price_1UHPKuCz0CerLuxwIFBrhhxf", month: "price_1UHPKtCz0CerLuxwQHegdC33", year: "price_1UHPKvCz0CerLuxwMfX8KdmC" },
    za: { week: "price_1UHPKyCz0CerLuxwOHUtjn4i", month: "price_1UHPKxCz0CerLuxw9cieICvO" },
    us: { month: "price_1UHPIGCz0CerLuxwjBlGekGk" }
  };
  for (const k of MARKET_KEYS) {
    assert.deepEqual(MARKETS[k].stripePriceIds, PAYABLE_IDS[k], k + " : ids de Price");
    assert.deepEqual(MARKETS[k].checkoutOpen, Object.keys(PAYABLE_IDS[k]), k + " : durees payables = durees avec un Price");
    const avail = { ...pricing.availability(env({}), k === "fr" ? undefined : k) };
    assert.deepEqual(avail, Object.fromEntries(INTERVALS.map((iv) => [iv, iv in PAYABLE_IDS[k]])), k + " : disponibilites sans secret");
    for (const iv of Object.keys(PAYABLE_IDS[k])) {
      const r = pricing.resolvePriceId(env({}), k === "fr" ? undefined : k, iv);
      assert.deepEqual([r.ok, r.priceId, r.usedMarket, r.currency, r.unitAmount], [true, PAYABLE_IDS[k][iv], k, MARKETS[k].currency, Math.round(EXPECTED[k][iv] * 100)], k + "." + iv);
    }
  }
  assert.equal(pricing.resolvePriceId(env({}), "gb", "week").reason, "interval_not_configured", "GB semaine : aucun Price, jamais le mensuel");
  assert.equal(pricing.resolvePriceId(env({}), "gb", "year").reason, "interval_not_configured", "GB annee : aucun Price");

  // Configuration de test : ids synthetiques seulement (les ids reels sont verifies plus haut).
  const cfg = JSON.parse(JSON.stringify(MARKETS));
  for (const k of MARKET_KEYS) delete cfg[k].stripePriceIds;
  cfg.fr.stripePriceIds = { week: "price_cfgFrWeek", month: "price_cfgFrMonth", year: "price_cfgFrYear" };
  cfg.gb.stripePriceIds = { month: "price_cfgGbMonth" };
  cfg.us.stripePriceIds = { month: "price_cfgUsMonth" };
  cfg.za.stripePriceIds = { year: "price_cfgZaYear" };
  const T = builder.checkoutPriceTable(cfg);
  assert.equal(T.fr.intervals.month.priceId, "price_cfgFrMonth");
  assert.equal(T.gb.intervals.week.priceId, null, "duree vendue sans id : null");
  assert.ok(!("year" in T.za.intervals), "ZA : annuel non vendu, id de configuration ignore");
  const R = (e, m, iv) => pricing.resolvePriceId(env(e), m, iv, T);
  // Ordre : secret du marche/duree, ancien secret (mensuel FR), configuration.
  assert.equal(R({ STRIPE_PRICE_ID_FR_MONTH: "price_env", STRIPE_PRICE_ID: "price_legacy" }, undefined, "month").priceId, "price_env");
  assert.equal(R({ STRIPE_PRICE_ID: "price_legacy" }, undefined, "month").priceId, "price_legacy", "FR mensuel : secret historique avant la configuration");
  assert.equal(R({}, undefined, "month").priceId, "price_cfgFrMonth");
  assert.equal(R({}, undefined, "week").priceId, "price_cfgFrWeek");
  assert.equal(R({ STRIPE_PRICE_ID: "price_legacy" }, undefined, "year").priceId, "price_cfgFrYear", "ancien secret : mensuel seulement");
  const gb = R({}, "gb", "month");
  assert.deepEqual([gb.ok, gb.priceId, gb.currency, gb.unitAmount], [true, "price_cfgGbMonth", "GBP", 1499]);
  assert.equal(R({ STRIPE_PRICE_ID_GB_MONTH: "price_envGb" }, "gb", "month").priceId, "price_envGb", "secret prioritaire");
  assert.equal(R({}, "gb", "week").reason, "interval_not_configured", "GB semaine : aucun id, jamais le mensuel");
  assert.equal(R({}, "gb", "year").reason, "interval_not_configured");
  assert.equal(R({}, "mx", "month").reason, "market_not_configured", "jamais l'id d'un autre marche");
  assert.equal(R({}, "za", "year").reason, "market_not_configured", "ZA annuel non vendu : id de configuration jamais lu");
  assert.equal(R({}, "za", "month").reason, "market_not_configured", "id d'une duree non vendue jamais utilise");
  const us = R({}, "us", "month");
  assert.deepEqual([us.ok, us.priceId, us.currency, us.unitAmount], [true, "price_cfgUsMonth", "USD", 1999]);
  assert.deepEqual({ ...pricing.availability(env({}), undefined, T) }, { week: true, month: true, year: true });
  assert.deepEqual({ ...pricing.availability(env({}), "gb", T) }, { week: false, month: true, year: false });
  assert.deepEqual({ ...pricing.availability(env({}), "mx", T) }, { week: false, month: false, year: false });
  // Le Price resolu reste relu chez Stripe et compare au prix affiche.
  const src = read("supabase/functions/create-checkout-session/index.ts");
  assert.ok(src.indexOf("resolvePriceId(getEnv, requestedMarket, requestedInterval)") < src.indexOf("priceMatches("));
  assert.match(read("supabase/functions/create-checkout-session/pricing.ts"), /if \(typeof row\.priceId === "string" && row\.priceId\.trim\(\)\) return row\.priceId\.trim\(\);\n  return null;/);
});

test("create-checkout-session (source) : disponibilites sans auth, controles avant la session Stripe, aucun second abonnement", () => {
  const src = read("supabase/functions/create-checkout-session/index.ts");
  const at = (s) => src.indexOf(s);
  const sessionAt = at("stripe.checkout.sessions.create");
  assert.ok(at('requestedMode === "availability"') > 0 && at('requestedMode === "availability"') < at("auth.getUser()"), "disponibilites avant authentification, sans id de Price");
  assert.ok(at("resolvePriceId(getEnv, requestedMarket, requestedInterval)") > 0);
  assert.match(src, /const LIVE_STATUSES = \["active", "trialing", "past_due"\];/);
  assert.ok(at('reason: "already_subscribed"') > at("auth.getUser()") && at('reason: "already_subscribed"') < sessionAt, "abonnement vivant verifie avant la session");
  assert.ok(at("stripe.prices.retrieve") > 0 && at("stripe.prices.retrieve") < sessionAt, "Price relu avant la session");
  assert.ok(at("priceMatches(") > 0 && at("priceMatches(") < sessionAt);
  assert.match(src, /reason: "price_mismatch"/);
  assert.match(src, /code: "invalid_interval"/);
  assert.match(src, /metadata: \{ market: usedMarket, plan: "pro", interval: usedInterval, \.\.\.consent\.metadata \}/);
  assert.match(src, /subscription_data: \{ metadata: \{ market: usedMarket, plan: "pro", interval: usedInterval, \.\.\.consent\.metadata \} \}/);
  assert.doesNotMatch(src, /edge_price|annual_edge|STRIPE_PRICE_ID_(GB|MX|ZA)"/);
});

// --------------------------------------------------------- selecteur de duree

function loadPicker(i18n) {
  const win = { I18N: i18n };
  new Function("window", read("lib/pro-plan-picker.js"))(win);
  return win.IasharkProPlanPicker;
}

test("selecteur : 3 options (2 en ZA), Mois coche par defaut, equivalent et economie calcules, duree fermee masquee", () => {
  const P = loadPicker();
  const t = (k) => P.textFor(k, null, {});
  const offerOf = (k) => lib.proOffer(MARKETS[k].prices, MARKETS[k].currency, MARKETS[k].intlLocale);
  const radios = (html) => (html.match(/<input type="radio"[^>]*>/g) || []);
  for (const k of MARKET_KEYS) {
    const offer = offerOf(k);
    assert.equal(P.pickDefault(offer), "month", k + " : Mois par defaut");
    const html = P.buildHtml(offer, t, "t", P.pickDefault(offer), {});
    const sold = INTERVALS.filter((iv) => EXPECTED[k][iv] != null);
    if (sold.length === 1) {
      // us : mensuel seul -> son prix seul, rien a choisir.
      assert.match(html, /^<div class="iash-plans iash-plans-single" data-interval="month">/, k);
      assert.equal(radios(html).length, 0, k);
    } else {
      assert.deepEqual(radios(html).map((r) => r.match(/value="(\w+)"/)[1]), sold, k);
      assert.equal(radios(html).filter((r) => / checked/.test(r)).length, 1, k);
      assert.match(radios(html).find((r) => / checked/.test(r)), /value="month"/, k);
    }
    for (const iv of sold) assert.match(html, new RegExp('data-market-price="pro\\.' + iv + '">'), k + " " + iv);
    if (EXPECTED[k].year != null) {
      const y = offer.intervals[2];
      assert.ok(norm(html).includes("soit " + norm(y.monthlyEquivalentText) + " / mois"), k + " : equivalent mensuel");
      assert.ok(html.includes(y.savingsPct + " % de moins que 12 mois"), k + " : economie");
    } else {
      assert.doesNotMatch(html, /value="year"|iash-plan-save|iash-plan-equiv/, "ZA : ni annuel, ni economie");
    }
    assert.doesNotMatch(html, /recommand|populaire|meilleur/i, k + " : aucune duree mise en avant");
  }
  assert.equal(P.pickDefault(offerOf("za"), "year"), "month", "ZA : annuel demande -> mois");
  // 19/09/2026 : une duree declaree fermee par le serveur n'est plus affichee
  // (« Bientot disponible » faisait hesiter), jamais cochee.
  const soon = P.buildHtml(offerOf("gb"), t, "u", "month", { week: false });
  assert.deepEqual(radios(soon).map((r) => r.match(/value="(\w+)"/)[1]), ["month", "year"]);
  assert.doesNotMatch(soon, /value="week"|pro\.week|is-soon|Bientôt disponible|disabled/);
  assert.equal(P.pickDefault(offerOf("gb"), "week", { week: false }), "month", "duree fermee demandee -> mois");
  // Textes : labels explicites > dictionnaire (variante marche) > repli francais.
  // Le faux I18N reproduit le VRAI contrat de i18n/i18n.js#t : une cle absente
  // renvoie LA CLE (fallback != null ? fallback : key), jamais null. L'ancien
  // mock renvoyait null et n'a donc jamais vu le bug de production du
  // 18/09/2026 : le selecteur affichait "pro_plans.week_label_fr" sur les
  // trois offres de la page d'abonnement.
  const I = {
    dict: { pro_plans: { legend: "Choose your billing period", legend_za: "Choose (ZA)", week_label: "1 week", per_week: "/ week", billed_week: "Billed {price} each week" } },
    t: (k, f) => (f != null ? f : k),
  };
  const Pi = loadPicker(I);
  assert.equal(Pi.textFor("legend", { code: "gb" }), "Choose your billing period");
  assert.equal(Pi.textFor("legend", { code: "za" }), "Choose (ZA)");
  assert.equal(Pi.textFor("legend", { code: "gb" }, { legend: "X" }), "X");
  assert.equal(Pi.textFor("closed", { code: "gb" }), "Le paiement n’est pas encore ouvert pour ce pays. Aucun montant ne sera prélevé.");
  assert.equal(Pi.textFor("unavailable", { code: "gb" }), undefined, "plus de libelle « Bientot disponible »");
  // Regression : la variante par marche n'existe pas -> la cle generique, jamais la clef brute.
  assert.equal(Pi.textFor("week_label", { code: "fr" }), "1 week");
  assert.equal(Pi.textFor("billed_week", { code: "mx" }), "Billed {price} each week");
  const rendered = Pi.buildHtml(offerOf("fr"), (k) => Pi.textFor(k, { code: "fr" }, {}), "u", "month", null);
  assert.doesNotMatch(rendered, /pro_plans\./i, "une cle i18n brute est affichee sur la page d'abonnement");
});

// Faux conteneur pour IasharkProPlanPicker.mount (aucun DOM en test unitaire).
function fakeContainer() {
  return { innerHTML: "", ownerDocument: { getElementById: () => ({}), readyState: "complete" }, querySelectorAll: () => [], firstChild: { classList: { add() {} } } };
}

test("checkoutOpen : seules les durees payables en ligne sont affichees, les autres masquees (19/09/2026)", () => {
  // Decision du proprietaire du 19/09/2026 : une duree non payable n'est jamais
  // affichee (« Bientot disponible » faisait hesiter) ; durees payables le
  // 19/09/2026 : FR et MX semaine / mois / annee, ZA semaine / mois, GB et US
  // (offre USD de /en/) mois seul. Une seule duree : son prix seul, rien a choisir.
  const OPEN = { fr: ["week", "month", "year"], gb: ["month"], mx: ["week", "month", "year"], za: ["week", "month"], us: ["month"] };
  const P = loadPicker();
  const t = (k) => P.textFor(k, null, {});
  for (const k of MARKET_KEYS) {
    assert.deepEqual(MARKETS[k].checkoutOpen, OPEN[k], k + " : durees payables");
    assert.ok(!/POUR ROUVRIR CE MARCHE|AUCUNE duree payable \(decision/.test(MARKETS[k].checkoutOpen_readme), k + " : readme de marche ferme perime");
    const offer = lib.proOffer(MARKETS[k].prices, MARKETS[k].currency, MARKETS[k].intlLocale, MARKETS[k].checkoutOpen);
    assert.deepEqual(P.visibleIntervals(offer), OPEN[k], k);
    const html = P.buildHtml(offer, t, "o" + k, P.pickDefault(offer), {});
    if (OPEN[k].length === 1) {
      assert.match(html, /^<div class="iash-plans iash-plans-single" data-interval="month">/, k + " : une duree = prix seul");
      assert.doesNotMatch(html, /<input|pro\.week|pro\.year|is-soon|Bientôt disponible/, k + " : ni bouton radio, ni duree fermee");
    } else {
      assert.equal((html.match(/<input type="radio"/g) || []).length, OPEN[k].length, k);
    }
  }
  assert.ok(USD_SWITCHED, "bascule _usdSwitch appliquee le 19/09/2026 (/en/ = marche us)");
  assert.match(MARKETS.us.checkoutOpen_readme, /POUR OUVRIR CE MARCHE[\s\S]*secrets[\s\S]*deployer[\s\S]*lister ici les durees[\s\S]*_dirs\.en\.market/);
  // GB : semaine et annee gardent leur prix (config) mais ne sont jamais affichees.
  const gbOffer = lib.proOffer(MARKETS.gb.prices, "GBP", "en-GB", MARKETS.gb.checkoutOpen);
  assert.deepEqual(gbOffer.intervals.map((i) => [i.interval, i.open]), [["week", false], ["month", true], ["year", false]]);
  assert.match(P.buildHtml(gbOffer, t, "g", "month", {}), /<b data-market-price="pro\.month">£14\.99<\/b>/);
  assert.equal(P.pickDefault(gbOffer, "week"), "month", "duree fermee demandee -> mois");
  assert.equal(P.pickDefault(gbOffer, "year"), "month");
  assert.ok(lib.proOffer(MARKETS.gb.prices, "GBP", "en-GB").intervals.every((i) => i.open), "sans liste : toutes ouvertes");
  const usOpen = lib.proOffer(MARKETS.us.prices, "USD", "en-US", MARKETS.us.checkoutOpen);
  assert.match(P.buildHtml(usOpen, t, "u", "month", {}), /<b data-market-price="pro\.month">\$19\.99<\/b>/);
  // Marche ferme (checkoutOpen = []) : aucune duree, la ligne « paiement pas encore ouvert ».
  const closedOffer = lib.proOffer(MARKETS.gb.prices, "GBP", "en-GB", []);
  assert.deepEqual(P.visibleIntervals(closedOffer), []);
  assert.match(P.buildHtml(closedOffer, t, "z", null, null), /^<p class="iash-plans-closed" role="status">/);
  // Le serveur ne peut pas rouvrir une duree fermee par la configuration.
  const win = { I18N: null, IasharkApp: null };
  new Function("window", read("lib/pro-plan-picker.js"))(win);
  const updates = [];
  const api = win.IasharkProPlanPicker.mount(fakeContainer(), { market: { proOffer: () => gbOffer, code: "gb" }, onUpdate: (v) => updates.push(v) });
  api.setAvailability({ week: true, month: true, year: true });
  assert.equal(api.isAvailable("week"), false);
  assert.equal(api.isAvailable("year"), false);
  assert.equal(api.isAvailable("month"), true);
  assert.equal(api.interval(), "month");
  assert.deepEqual(updates, [["month"], ["month"]], "onUpdate : durees affichees apres chaque rendu");
});

test("disponibilite serveur : duree fermee masquee, inconnue = configuration, aucune = « paiement pas encore ouvert »", () => {
  const P = loadPicker();
  const t = (k) => P.textFor(k, null, {});
  // Marche GB suppose rouvert (checkoutOpen absent) : le serveur tranche.
  const gb = lib.proOffer(MARKETS.gb.prices, "GBP", "en-GB", null);
  // Disponibilite inconnue (fonction deployee sans mode "availability", erreur
  // reseau) : les durees ouvertes par la configuration restent affichees.
  assert.deepEqual(P.visibleIntervals(gb, null), ["week", "month", "year"]);
  assert.deepEqual(P.visibleIntervals(gb, {}), ["week", "month", "year"]);
  assert.deepEqual(P.visibleIntervals(gb, { week: false, year: false }), ["month"]);
  // Aucune duree payable : la ligne pro_plans.closed, aucun prix, aucun bouton radio.
  const none = P.buildHtml(gb, t, "n", null, { week: false, month: false, year: false });
  assert.equal(none, '<p class="iash-plans-closed" role="status">Le paiement n’est pas encore ouvert pour ce pays. Aucun montant ne sera prélevé.</p>');
  assert.equal(P.pickDefault(gb, "month", { week: false, month: false, year: false }), null);

  // Duree cochee fermee par le serveur : bascule sur la duree par defaut restante, signalee.
  const win = { I18N: null, IasharkApp: null };
  new Function("window", read("lib/pro-plan-picker.js"))(win);
  const changes = [], updates = [];
  const api = win.IasharkProPlanPicker.mount(fakeContainer(), { market: { proOffer: () => gb, code: "gb" }, interval: "week", onChange: (iv) => changes.push(iv), onUpdate: (v) => updates.push(v) });
  assert.equal(api.interval(), "week");
  api.setAvailability({ week: false, month: true, year: true });
  assert.equal(api.interval(), "month");
  assert.deepEqual(changes, ["month"]);
  assert.deepEqual(api.visible(), ["month", "year"]);
  // Tout ferme (fonction redeployee, pays sans Price Stripe) : rien de payable.
  api.setAvailability({ week: false, month: false, year: false });
  assert.equal(api.interval(), null);
  assert.equal(api.isAvailable(), false, "aucune duree : jamais d'appel au paiement");
  assert.equal(api.isAvailable("month"), false);
  assert.deepEqual(updates[updates.length - 1], []);
  assert.match(api.el.innerHTML, /iash-plans-closed/);
  // Marche sans aucun prix : rien a monter (le repli HTML reste affiche).
  assert.equal(win.IasharkProPlanPicker.mount(fakeContainer(), { market: { proOffer: () => ({ defaultInterval: "month", intervals: [{ interval: "month", amount: null }] }) } }), null, "marche sans aucun prix : rien a monter");
});

test("ordre de deploiement : fonction de paiement plus ancienne que le site -> seul le mensuel du marche par defaut reste payable", async () => {
  // Anciennes versions de create-checkout-session (avant le 16/09/2026) : pas de
  // mode "availability", duree ignoree (mensuel facture), marche inconnu refuse
  // ou (12/09) facture au prix FR. Le selecteur ne propose alors que le flux
  // historique : mensuel, sans champ market.
  const offer = lib.proOffer(MARKETS.fr.prices, "EUR", "fr-FR", ["week", "month", "year"]);
  const usOffer = lib.proOffer(MARKETS.us.prices, "USD", "en-US", ["month"]);
  async function mountWith(response, market) {
    const bodies = [];
    const win = { I18N: null, IasharkApp: { url: "https://x.supabase.co", key: "anon" },
      fetch: async (url, init) => { bodies.push(JSON.parse(init.body)); return { json: async () => response }; } };
    new Function("window", read("lib/pro-plan-picker.js"))(win);
    const api = win.IasharkProPlanPicker.mount(fakeContainer(), { market });
    await api.loadAvailability();
    await api.whenReady();
    return { api, bodies };
  }
  const oldFr = await mountWith({ ok: false, code: "consent_required", missing: ["terms", "waiver"] }, { proOffer: () => offer, code: "fr", checkoutMarket: null });
  assert.deepEqual(oldFr.bodies, [{ mode: "availability" }]);
  assert.deepEqual(oldFr.api.visible(), ["month"], "ancienne fonction : mensuel FR seul");
  assert.equal(oldFr.api.isAvailable("week"), false);
  assert.equal(oldFr.api.isAvailable("year"), false);
  const oldUs = await mountWith({ ok: true, processed: false, market: "us", reason: "market_not_configured" }, { proOffer: () => usOffer, code: "us", checkoutMarket: "us" });
  assert.deepEqual(oldUs.bodies, [{ mode: "availability", market: "us" }]);
  assert.deepEqual(oldUs.api.visible(), [], "ancienne fonction : aucun paiement USD propose (« paiement pas encore ouvert »)");
  assert.equal(oldUs.api.isAvailable(), false);
  const off = await mountWith({ ok: true, payment_provider: "disabled", processed: false }, { proOffer: () => offer, code: "fr", checkoutMarket: null });
  assert.deepEqual(off.api.visible(), ["month"], "paiement desactive : flux historique seul");
  const fresh = await mountWith({ ok: true, processed: false, mode: "availability", intervals: { week: true, month: true, year: false } }, { proOffer: () => offer, code: "fr", checkoutMarket: null });
  assert.deepEqual(fresh.api.visible(), ["week", "month"], "fonction a jour : disponibilites du serveur");
  for (const f of ["abonnement-page.js", "account-page.js", "gb/gb-page.js", "mx/mx-page.js", "za/za-page.js"]) {
    const js = read(f);
    assert.ok(/whenReady\(\)/.test(js) && js.indexOf("whenReady()") < js.indexOf(".isAvailable()"), f + " : disponibilites attendues avant le paiement");
  }
});

test("front : chaque point d'entree du checkout envoie la duree, marque les durees non ouvertes et ne les facture jamais", () => {
  for (const f of ["abonnement-page.js", "account-page.js", "gb/gb-page.js", "mx/mx-page.js", "za/za-page.js"]) {
    const js = read(f);
    assert.match(js, /IasharkProPlanPicker\.mount\(/, f + " : selecteur non monte");
    assert.match(js, /loadAvailability\(\)/, f + " : disponibilites non chargees");
    assert.match(js, /\.isAvailable\(\)/, f + " : duree non ouverte non bloquee avant l'appel");
    assert.match(js, /interval/, f + " : duree non envoyee");
    assert.match(js, /already_subscribed/, f + " : second abonnement non gere");
    assert.match(js, /interval_not_configured/, f);
  }
  for (const f of ["abonnement.html", "gb/landing.html", "mx/landing.html", "za/landing.html"]) {
    assert.match(read(f), /<script src="\/lib\/pro-plan-picker\.js"><\/script>/, f + " : module non charge");
  }
  const ab = read("abonnement-page.js");
  assert.ok(ab.indexOf("picker&&!picker.isAvailable()") < ab.indexOf("functions/v1/create-checkout-session"), "abonnement : blocage avant l'appel de paiement");
  assert.match(ab, /if\(ctx\.isPro\)\{if\(box\)box\.hidden=true;if\(pickerBox\)pickerBox\.hidden=true;/, "abonne : ni selecteur ni paiement");
  // Landings pays (liste de repli sans JS) : exactement les durees payables du
  // marche (config/markets.json#checkoutOpen, 19/09/2026 : /gb/ mensuel seul).
  for (const d of ["gb", "mx", "za"]) {
    const html = read(d + "/landing.html");
    for (const iv of INTERVALS) assert.equal(new RegExp('data-market-price="pro\\.' + iv + '"').test(html), MARKETS[d].checkoutOpen.includes(iv), d + " : " + iv);
  }
  assert.doesNotMatch(read("za/landing.html"), />Annual</, "ZA : aucune option annuelle");
});

test("compte : duree, prochaine echeance, changement de duree par le portail, selecteur pour le compte gratuit", () => {
  const js = read("account-page.js");
  assert.match(js, /function libelleDuree\(\)/);
  assert.match(js, /compte_page\.sub_interval_label/);
  assert.match(js, /compte_page\.next_renewal_label/);
  assert.match(js, /boutonSecondaire\('changerDuree'/);
  assert.match(js, /facturation\('create-portal-session', \$\('changerDuree'\), \{ flow: 'change_interval' \}\)/);
  // 18/09/2026 : « Changer de duree » seulement si plusieurs durees sont payables ;
  // resiliation en ligne nommee comme telle (L215-1-1) ; duree inconnue = ligne masquee.
  assert.match(js, /function plusieursDureesOuvertes\(\)/);
  assert.match(js, /!abo.cancel_at_period_end && plusieursDureesOuvertes\(\) \? boutonSecondaire\('changerDuree'/);
  assert.match(js, /boutonSecondaire\('resilier', tr\('compte_page.cancel_subscription_cta'/);
  assert.match(js, /\$\('resilier'\).addEventListener\('click', function \(\) \{ facturation\('create-portal-session', \$\('resilier'\)\); \}\)/);
  assert.doesNotMatch(js, /compte_page.interval_unknown/, "plus d'etat « en cours de synchronisation » permanent");
  for (const l of LOCALES) assert.equal(typeof JSON.parse(read("i18n/dict/" + l + ".json")).compte_page.cancel_subscription_cta, "string", l);
  assert.match(js, /if \(options && options\.flow === 'change_interval'\) corps\.flow = 'change_interval';/);
  assert.match(js, /corps\.interval = selecteur \? selecteur\.interval\(\) : 'month';/);
  assert.match(js, /select\('status,billing_interval,current_period_end,cancel_at_period_end,created_at'\)/);
  assert.match(js, /if \(resultats\[1\]\.error\) \{/, "repli si la migration 0026 n'est pas encore appliquee");
});

test("i18n : textes de l'offre Pro complets dans les 7 langues, sans promesse de gain", () => {
  const dicts = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
  const PLAN_KEYS = ["legend", "week_label", "month_label", "year_label", "per_week", "per_month", "per_year", "year_equiv", "year_savings", "billed_week", "billed_month", "billed_year", "closed"];
  const COMPTE = ["sub_interval_label", "interval_week", "interval_month", "interval_year", "interval_unknown", "next_renewal_label", "change_interval_cta", "change_interval_note", "pro_durations_note"];
  const PRICING = ["commitment", "checkout_interval_not_configured", "checkout_already_subscribed", "checkout_price_mismatch"];
  assert.deepEqual(Object.keys(dicts.fr.pro_plans).sort(), PLAN_KEYS.slice().sort());
  for (const l of LOCALES) {
    const d = dicts[l];
    assert.deepEqual(Object.keys(d.pro_plans).sort(), PLAN_KEYS.slice().sort(), l);
    for (const k of PLAN_KEYS) assert.ok(typeof d.pro_plans[k] === "string" && d.pro_plans[k].trim(), l + " pro_plans." + k);
    assert.match(d.pro_plans.year_equiv, /\{price\}/, l);
    assert.match(d.pro_plans.year_savings, /\{pct\}/, l);
    assert.match(d.pro_plans.billed_year, /\{price\}/, l);
    for (const k of COMPTE) assert.ok(d.compte_page[k], l + " compte_page." + k);
    for (const k of PRICING) assert.ok(d.pricing_page[k], l + " pricing_page." + k);
    assert.ok(!("pro_other_durations" in d.home_app) && !("pro_other_durations_week" in d.home_app), l + " : plus d'annonce semaine / annee sur l'accueil");
    const app = JSON.parse(read("i18n/parts/app." + l + ".json")).home_app;
    assert.ok(!("pro_other_durations" in app) && !("pro_other_durations_week" in app), l + " : part app." + l + ".json");
    const texts = JSON.stringify([d.pro_plans, PRICING.map((k) => d.pricing_page[k]), COMPTE.map((k) => d.compte_page[k])]);
    assert.doesNotMatch(texts, /\b(sûrs?|gagnants?|garanti(e|s|es)?|bonus|guaranteed|garantizad[oa]s?|garantiert|garantit[oa])\b/i, l + " : vocabulaire interdit");
    assert.doesNotMatch(texts, /\bEdge\b/, l);
  }
});

test("aucune reference a l'ancienne offre Edge (config, code, pages, textes, CGV, documentation)", () => {
  const OFFER = /Annual Edge|Edge Anual|annual_edge|edge_price|Pro (and|y|et) Edge|\bEdge\b/;
  // "Edge Function(s)" / "fonction(s) Edge" = infrastructure Supabase ; edge-functions = hebergement Netlify.
  const infra = (s) => s.replace(/(Supabase )?Edge Functions?|fonctions? Edge|Edge function|edge[-_]functions?/gi, "");
  const files = ["config/markets.json", "lib/market-config.js", "scripts/build-locales.js", "lib/pro-plan-picker.js", "abonnement.html", "abonnement-page.js", "account-page.js",
    "gb/landing.html", "mx/landing.html", "za/landing.html", "gb/gb-page.js", "mx/mx-page.js", "za/za-page.js", "LATAM_OPENING_STATUS.md", "legal/README.md",
    "supabase/functions/create-checkout-session/index.ts", "supabase/functions/create-checkout-session/pricing.ts", "supabase/functions/create-checkout-session/prices.generated.ts",
    "supabase/migrations/0026_subscription_interval.sql"]
    .concat(["fr", "en", "es", "de", "it", "pt", "gb", "mx", "za"].map((d) => "legal/" + d + "/cgv.html"))
    .concat(LOCALES.map((l) => "emails/lifecycle/copy." + l + ".json"));
  for (const f of files) assert.doesNotMatch(infra(read(f)), OFFER, f);
  // Accueil : "edge" y designe aussi l'ecart modele / marche ; seule l'offre est interdite.
  for (const d of ["", "fr/", "gb/", "za/", "mx/"]) assert.doesNotMatch(read(d + "index.html"), /Annual Edge|Edge Anual|annual_edge|Pro (and|y|et) Edge|offre Edge/, d + "index.html");
});
