"use strict";
// Offre USD de la version /en/ (decision du proprietaire du 19/09/2026 :
// visiteurs des Etats-Unis sur /en/, 19,99 USD par mois, mensuel seul).
// Tout passe par UNE bascule de configuration, config/markets.json#_usdSwitch
// (_dirs.en.market -> "us", us.checkoutOpen -> ["month"]). Ce fichier prouve :
//  (a) configuration actuelle : /en/ affiche 19,95 EUR et paie sur le marche FR
//      (aucun champ market envoye), exactement comme avant ;
//  (b) bascule appliquee a une copie de la configuration, build COMPLET en
//      memoire (tests/helpers/build-in-memory.js, rien n'est ecrit) : /en/
//      affiche "$19.99" partout (pages, titres, descriptions, CGV, donnees
//      runtime), envoie market "us", et create-checkout-session attend
//      exactement un Price USD 1999 mensuel ;
//  (c) les autres versions ne bougent pas.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("node:url");
const { ROOT, readMarkets, applyUsdSwitch, isUsdSwitched } = require("./helpers/usd-switch.js");

const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const MARKETS = readMarkets();
const SWITCHED = applyUsdSwitch(MARKETS);
const ALREADY_SWITCHED = isUsdSwitched(MARKETS);
const norm = (s) => String(s).replace(/[   ]/g, " ");
const EUR_PRICE = /€|\bEUR\b|19[.,]95/;
const pricing = () => import(pathToFileURL(path.join(ROOT, "supabase/functions/create-checkout-session/pricing.ts")).href);
const env = (o) => (k) => o[k];

// Texte visible d'une page : sans commentaires, scripts, styles, ni elements
// hidden (duree non vendue masquee par data-market-price-if).
function visible(html) {
  let out = String(html).replace(/<!--[\s\S]*?-->/g, " ").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ");
  let prev;
  do { prev = out; out = out.replace(/<(p|div|span|li|section)\b[^>]*\shidden(?=[\s>=/])[^>]*>[\s\S]*?<\/\1>/gi, " "); } while (out !== prev);
  return norm(out.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " "));
}
function headMeta(html) {
  const pick = (re) => ((html.match(re) || [])[1] || "");
  return {
    title: pick(/<title>([^<]*)<\/title>/),
    description: pick(/<meta name="description" content="([^"]*)"/),
    ogDescription: pick(/<meta property="og:description" content="([^"]*)"/),
    ogTitle: pick(/<meta property="og:title" content="([^"]*)"/),
  };
}
function loadMarketLib(src, pathname) {
  const win = { location: { pathname: pathname } };
  new Function("window", src)(win);
  return win;
}

test("config : marche us inerte, bascule documentee = deux champs, autres versions intactes", () => {
  const us = MARKETS.us;
  assert.equal(us.country, "US");
  assert.equal(us.currency, "USD");
  assert.equal(us.priceIntlLocale, "en-US", "prix USD ecrits $19.99, jamais US$19.99");
  assert.equal(us.checkoutMarket, "us");
  // 21/09/2026 : hebdomadaire a 4,99 USD ouvert comme porte d'entree ; annuel toujours non vendu.
  assert.deepEqual(us.prices.pro, { week: { amount: 4.99 }, month: { amount: 19.99 }, year: null }, "hebdomadaire + mensuel, jamais d'annuel");
  assert.deepEqual(us.stripeEnvKeys, { month: "STRIPE_PRICE_ID_US_MONTH", week: "STRIPE_PRICE_ID_US_WEEK" });
  assert.equal(us.stripeEnvKeyLegacyMonth, null, "jamais le secret FR historique");
  assert.equal(us.helpline, null, "aucune ressource inventee : /en/ garde la ressource internationale");
  assert.deepEqual(MARKETS._usdSwitch, { "_dirs.en.market": "us", "us.checkoutOpen": ["week", "month"] });
  if (!ALREADY_SWITCHED) {
    assert.equal(MARKETS._dirs.en.market, "fr", "/en/ reste sur le marche EUR tant que Stripe + deploiement ne sont pas faits");
    assert.deepEqual(us.checkoutOpen, [], "marche us ferme au paiement avant la bascule");
  } else {
    assert.deepEqual(us.checkoutOpen, ["week", "month"], "hebdomadaire ouvert le 21/09/2026");
  }
  const readme = MARKETS._usdSwitch_readme;
  for (const s of ["STRIPE_PRICE_ID_US_MONTH", "unit_amount 1999", "0030_subscriptions_market_us.sql", "create-checkout-session", "stripe-webhook", "sync-subscription", "build-locales.js", "lifecycle-email-build.js"]) {
    assert.ok(readme.includes(s), "_usdSwitch_readme : " + s);
  }
  assert.equal(SWITCHED._dirs.en.market, "us");
  assert.deepEqual(SWITCHED.us.checkoutOpen, ["week", "month"]);
  for (const d of Object.keys(MARKETS._dirs)) {
    if (d !== "en") assert.equal(SWITCHED._dirs[d].market, MARKETS._dirs[d].market, d + " : marche inchange par la bascule");
  }
  assert.deepEqual(["gb", "za", "mx"].map((d) => SWITCHED._dirs[d].market), ["gb", "za", "mx"]);
  for (const k of ["fr", "gb", "mx", "za"]) assert.deepEqual(SWITCHED[k], MARKETS[k], k + " : marche intact");
  assert.throws(() => applyUsdSwitch(Object.assign({}, MARKETS, { _usdSwitch: { "_dirs.xx.market": "us" } })), /chemin inconnu/);
});

test("(a) configuration actuelle : /en/ affiche 19,95 EUR et paie sur le marche FR, sans champ market", { skip: ALREADY_SWITCHED && "bascule deja appliquee" }, async () => {
  const builder = require(path.join(ROOT, "scripts/build-locales.js"));
  assert.equal(builder.formatPrice("en", "pro"), "€19.95");
  const html = read("en/abonnement.html");
  assert.match(headMeta(html).description, /€19\.95 per month/);
  assert.match(html, /data-market-price="pro\.month"[^>]*>€19\.95</);
  assert.match(html, /<meta name="iashark-market" content="fr">/);
  assert.doesNotMatch(visible(html), /\$\s?\d|\bUSD\b/, "aucun prix USD avant la bascule");
  assert.match(read("i18n/i18n.js"), /\{dir:"en",[^}\n]*market:"fr"/);

  const M = loadMarketLib(read("lib/market-config.js"), "/en/abonnement.html").IASHARK_MARKET;
  assert.deepEqual([M.code, M.currency, M.checkoutMarket, M.priceIntlLocale], ["fr", "EUR", null, "en-GB"]);
  assert.equal(M.formatPrice("pro"), "€19.95");
  assert.equal(M.proOffer().intervals.find((i) => i.interval === "month").text, "€19.95");
  // Front : checkoutMarket null -> aucun champ market -> serveur = mensuel FR EUR,
  // meme si le secret USD existait deja.
  const P = await pricing();
  const r = P.resolvePriceId(env({ STRIPE_PRICE_ID: "price_fr_legacy", STRIPE_PRICE_ID_US_MONTH: "price_us" }), M.checkoutMarket || undefined, "month");
  assert.deepEqual([r.ok, r.usedMarket, r.currency, r.unitAmount, r.priceId], [true, "fr", "EUR", 1995, "price_fr_legacy"]);
});

test("create-checkout-session : ligne us generee (USD 1999 mensuel), CHECKOUT_MARKETS, priceMatches USD, jamais de repli", async () => {
  const builder = require(path.join(ROOT, "scripts/build-locales.js"));
  const row = { currency: "USD", intervals: {
    week: { unitAmount: 499, envKey: "STRIPE_PRICE_ID_US_WEEK", legacyEnvKey: null, priceId: MARKETS.us.stripePriceIds ? MARKETS.us.stripePriceIds.week : null },
    month: { unitAmount: 1999, envKey: "STRIPE_PRICE_ID_US_MONTH", legacyEnvKey: null, priceId: MARKETS.us.stripePriceIds ? MARKETS.us.stripePriceIds.month : null } } };
  assert.deepEqual(builder.checkoutPriceTable().us, row);
  assert.deepEqual(builder.checkoutPriceTable(SWITCHED), builder.checkoutPriceTable(), "table independante de la bascule");
  assert.ok(read("supabase/functions/create-checkout-session/prices.generated.ts").includes('"us": ' + JSON.stringify(row, null, 2).replace(/\n/g, "\n  ")), "prices.generated.ts : ligne us (relancer node scripts/build-locales.js)");
  const P = await pricing();
  assert.ok(P.CHECKOUT_MARKETS.includes("us"));
  // Table sans id de Price dans la configuration : seul le secret compte ici
  // (l'id de configuration, dernier recours, est teste dans tests/pro-pricing.test.js).
  const noIds = JSON.parse(JSON.stringify(MARKETS));
  for (const k of Object.keys(noIds)) if (k[0] !== "_") delete noIds[k].stripePriceIds;
  const T = builder.checkoutPriceTable(noIds);
  const R = (e, m, iv) => P.resolvePriceId(env(e), m, iv, T);
  const ok = R({ STRIPE_PRICE_ID_US_MONTH: " price_us " }, "us", "month");
  assert.deepEqual({ ...ok }, { ok: true, priceId: "price_us", usedMarket: "us", interval: "month", currency: "USD", unitAmount: 1999 });
  assert.equal(R({ STRIPE_PRICE_ID_US_MONTH: "price_us" }, "US", undefined).usedMarket, "us", "duree par defaut = mois");
  // Aucun Price USD (ni secret ni configuration) : refus explicite, jamais le prix EUR.
  assert.equal(R({ STRIPE_PRICE_ID: "legacy", STRIPE_PRICE_ID_FR_MONTH: "fr" }, "us", "month").reason, "market_not_configured");
  // Annuel toujours non vendu ; hebdomadaire ouvert le 21/09/2026.
  {
    const r = R({ STRIPE_PRICE_ID_US_MONTH: "p", STRIPE_PRICE_ID_US_WEEK: "w", STRIPE_PRICE_ID_US_YEAR: "y" }, "us", "year");
    assert.deepEqual([r.ok, r.reason], [false, "interval_not_configured"], "year : non vendu, secret jamais lu");
  }
  assert.equal(R({ STRIPE_PRICE_ID_US_WEEK: "w" }, "us", "week").ok, true, "week : vendu depuis le 21/09/2026");
  assert.deepEqual({ ...P.availability(env({ STRIPE_PRICE_ID_US_MONTH: "p", STRIPE_PRICE_ID_US_WEEK: "w" }), "us", T) }, { week: true, month: true, year: false });
  assert.deepEqual({ ...P.availability(env({ STRIPE_PRICE_ID: "legacy" }), "us", T) }, { week: false, month: false, year: false });
  const good = { active: true, type: "recurring", currency: "usd", unit_amount: 1999, tax_behavior: "inclusive", recurring: { interval: "month", interval_count: 1 } };
  const exp = { currency: ok.currency, unitAmount: ok.unitAmount, interval: ok.interval };
  assert.equal(P.priceMatches(good, exp), true);
  for (const bad of [{ currency: "eur" }, { unit_amount: 1995 }, { unit_amount: 2000 }, { recurring: { interval: "year", interval_count: 1 } }, { recurring: { interval: "month", interval_count: 3 } }, { tax_behavior: "exclusive" }, { active: false }]) {
    assert.equal(P.priceMatches({ ...good, ...bad }, exp), false, JSON.stringify(bad));
  }
  // Consentement : regime "eu" (celui de /en/ aujourd'hui, /en/ sert aussi l'UE), navigateur et serveur.
  const srv = await import(pathToFileURL(path.join(ROOT, "supabase/functions/create-checkout-session/consent.ts")).href);
  const win = {};
  new Function("window", read("lib/checkout-consent.js"))(win);
  assert.equal(srv.regimeForMarket("us").id, "eu");
  assert.equal(win.IasharkCheckoutConsent.regimeFor("us").id, "eu");
  assert.equal(srv.validateConsent({ terms: true }, "us", "2026-09-19T00:00:00Z").ok, false, "us : demande expresse obligatoire comme en EUR");
});

test("(b) bascule appliquee, build complet en memoire : /en/ en USD partout, checkout market us, autres versions intactes", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-usd-"));
  let out;
  try {
    const cfgFile = path.join(tmp, "markets.json");
    fs.writeFileSync(cfgFile, JSON.stringify(SWITCHED));
    out = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, "tests/helpers/build-in-memory.js"), cfgFile,
      "en/", "i18n/i18n.js", "lib/market-config.js", "supabase/functions/create-checkout-session/prices.generated.ts",
      "fr/abonnement.html", "es/abonnement.html", "de/abonnement.html", "gb/abonnement.html", "za/abonnement.html", "mx/abonnement.html"],
    { cwd: ROOT, encoding: "utf8", maxBuffer: 256 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  const files = out.files;
  // Pages produites par scripts/build-locales.js (hors pages maintenues a la main,
  // ex. en/desinscription-email.html, sans prix).
  const builder = require(path.join(ROOT, "scripts/build-locales.js"));
  const generated = builder.PAGE_FILES.concat(builder.LEGAL_FILE_LIST);
  const enPages = Object.keys(files).filter((f) => /^en\/[^/]+\.html$/.test(f) && generated.includes(f.slice(3)));
  assert.ok(enPages.length >= 20, "pages /en/ regenerees : " + enPages.length);

  // 1. Pages : marche us, aucun prix EUR (titres, descriptions, texte visible, JSON-LD).
  for (const f of enPages) {
    const html = files[f], meta = headMeta(html);
    assert.match(html, /<meta name="iashark-market" content="us">/, f);
    for (const k of Object.keys(meta)) assert.doesNotMatch(meta[k], EUR_PRICE, f + " " + k + " : " + meta[k]);
    assert.doesNotMatch(visible(html), /€|19[.,]95|US\$/, f + " : prix EUR ou US$ visible");
    for (const ld of html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) || []) {
      assert.doesNotMatch(ld, /€|\\u20ac|"EUR"|19[.,]95|priceCurrency/, f + " : JSON-LD");
    }
  }
  const ab = files["en/abonnement.html"];
  assert.equal(headMeta(ab).description.startsWith("IASHARK Pro at $19.99 per month"), true, headMeta(ab).description);
  assert.match(headMeta(ab).ogDescription, /\$19\.99 per month/);
  assert.match(ab, /data-market-price="pro\.month"[^>]*>\$19\.99</);
  assert.doesNotMatch(ab, /data-market-price="pro\.(week|year)"[^>]*>[^<]*\d/, "aucune autre duree prix");
  const home = files["en/index.html"];
  assert.match(visible(home), /Pro at \$19\.99 per month/);
  assert.match(home, /id="prixGratuit" data-market-price="free"[^>]*>\$0</);
  assert.match(home, /id="prixPro" data-market-price="pro"[^>]*>\$19\.99</);
  assert.match(files["en/landing.html"], /data-market-price="pro"[^>]*>\$19\.99</);
  const cgv = visible(files["en/cgv.html"]);
  assert.match(cgv, /Monthly: \$19\.99 per month/);
  assert.match(cgv, /Weekly: \$4\.99 per week/, "CGV : hebdomadaire vendu depuis le 21/09/2026");
  assert.doesNotMatch(cgv, /Annual: |For information, /, "CGV : annuel non vendu, masque");
  // Autres versions : prix de leur marche, inchanges.
  assert.match(files["fr/abonnement.html"], />19,95\s€</);
  for (const d of ["es", "de"]) assert.match(files[d + "/abonnement.html"], /19,95\s€/, d);
  assert.match(files["gb/abonnement.html"], /£14\.99/);
  assert.match(files["za/abonnement.html"], /<meta name="iashark-market" content="za">/);
  assert.match(files["mx/abonnement.html"], /MX\$199/);

  // 2. Donnees runtime (lib/market-config.js) : ce que lisent la page
  // d'abonnement, le panneau Pro de la page match et le compte.
  const src = files["lib/market-config.js"];
  const M = loadMarketLib(src, "/en/abonnement.html").IASHARK_MARKET;
  assert.deepEqual([M.code, M.dir, M.currency, M.checkoutMarket, M.priceIntlLocale, M.intlLocale], ["us", "en", "USD", "us", "en-US", "en-GB"]);
  assert.deepEqual(M.checkoutOpen, ["week", "month"]);
  assert.equal(M.formatPrice("pro"), "$19.99");
  assert.equal(M.formatPrice("pro.month"), "$19.99");
  assert.equal(M.formatPrice("free"), "$0");
  assert.equal(M.formatPrice("pro.week"), "$4.99");
  assert.equal(M.formatPrice("pro.year"), null);
  const month = M.proOffer().intervals.find((i) => i.interval === "month");
  assert.deepEqual([month.amount, month.text, month.open], [19.99, "$19.99", true], "ligne de prix du panneau Pro (match-page.js#prixPro)");
  assert.deepEqual(M.proOffer().intervals.filter((i) => i.amount != null).map((i) => i.interval), ["week", "month"]);
  assert.equal(M.isPayable("pro"), true);
  assert.equal(M.helpline.name, "Gambling Therapy");
  assert.equal(norm(loadMarketLib(src, "/es/").IASHARK_MARKET.formatPrice("pro")), "19,95 €");
  assert.equal(loadMarketLib(src, "/gb/").IASHARK_MARKET.formatPrice("pro"), "£14.99");
  assert.match(files["i18n/i18n.js"], /\{dir:"en",[^}\n]*market:"us"/);
  assert.match(files["i18n/i18n.js"], /\{dir:"es",[^}\n]*market:"fr"/);
  assert.equal(files["supabase/functions/create-checkout-session/prices.generated.ts"], read("supabase/functions/create-checkout-session/prices.generated.ts"), "la bascule ne change pas la table des prix");

  // 3. Prix affiche == prix facture : le market envoye par le front (checkoutMarket)
  // resout exactement le Price attendu par create-checkout-session.
  const P = await pricing();
  const r = P.resolvePriceId(env({ STRIPE_PRICE_ID_US_MONTH: "price_us", STRIPE_PRICE_ID: "price_fr_legacy" }), M.checkoutMarket, "month");
  assert.deepEqual([r.ok, r.usedMarket, r.currency, r.unitAmount], [true, "us", M.currency, Math.round(month.amount * 100)]);
});

test("front : chaque point d'entree du paiement envoie IASHARK_MARKET.checkoutMarket, jamais une liste de marches en dur", () => {
  const acc = read("account-page.js");
  assert.match(acc, /var code = mk \? \(mk\.checkoutMarket \|\| ''\) :/);
  assert.match(acc, /if \(code\) corps\.market = String\(code\)\.toLowerCase\(\);/);
  assert.doesNotMatch(acc, /code === 'gb' \|\| code === 'mx' \|\| code === 'za'\) corps\.market/, "marche us oublie = facture en EUR");
  assert.match(read("abonnement-page.js"), /if\(M\.checkoutMarket\)body\.market=M\.checkoutMarket;/);
  assert.match(read("lib/pro-plan-picker.js"), /if \(market && market\.checkoutMarket\) body\.market = market\.checkoutMarket;/);
  // Accueil : prix gratuit formate comme les autres prix du marche ($0, jamais US$0).
  assert.match(read("index.html"), /var gratuit=typeof mk\.formatPrice==='function'\?mk\.formatPrice\('free'\):null;/);
  // Blog anglais (partage par /en/ /gb/ /za/) : aucun prix ecrit en dur.
  assert.doesNotMatch(read("en/blog/guides/prediction-ia-football-guide-2026.html"), /19[.,]95|€19|\\u20ac19/);
});

test("e-mails de cycle de vie apres la bascule : fuseau connu, devise USD, jamais un prix faux", () => {
  const { marketsSubset } = require(path.join(ROOT, "lib/lifecycle-email-build.js"));
  const L = require(path.join(ROOT, "lib/lifecycle-email.js"));
  const ctx = L.siteContext(marketsSubset(SWITCHED), "en");
  assert.deepEqual([ctx.market, ctx.currency, ctx.proPriceMinor, ctx.timeZone, ctx.helpline.name], ["us", "USD", 1999, "Europe/Paris", "Gambling Therapy"]);
  assert.deepEqual(ctx.proPricesMinor, { week: 499, month: 1999, year: null });
  // Email « Ce que debloque Pro » : hebdomadaire + mensuel depuis le
  // 21/09/2026 -> les deux prix, ecrits "$4.99" et "$19.99" (locale des prix du
  // marche), jamais un prix a l'annee invente.
  const bundle = require(path.join(ROOT, "lib/lifecycle-email-build.js")).loadBundle();
  bundle.markets = marketsSubset(SWITCHED);
  const mail = L.renderLifecycleEmail(bundle, "pro_features", "en", {}, { unsubscribeUrl: "https://iashark.com/en/desinscription-email.html#t=x", now: new Date("2026-09-19T10:00:00Z") });
  assert.match(mail.text, /Prices on the English \(International\) version of the site: \$4\.99 per week or \$19\.99 per month\./);
  assert.doesNotMatch(mail.text + mail.html, /€|US\$|per year|null|undefined/);
});
