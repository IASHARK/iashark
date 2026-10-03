"use strict";
// Essai Pro gratuit, ABONNEMENT MENSUEL seulement (02/10/2026, decision de
// Clement) : annonce partout ou il y a un prix ou un appel a s'abonner
// (grille de prix, page d'abonnement, compte, inscription, match offert,
// e-mails de vente), jamais a un abonne, a un ancien abonne ou ancien essai,
// ni dans un pays ou le paiement n'est pas ouvert.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
const DIRS = ["fr", "en", "es", "gb", "za", "mx"];

test("textes : 7 langues, « (abonnement mensuel) », repli = dictionnaire, aucune promesse", () => {
  const win = {};
  new Function("window", read("assets/essai-annonce.js"))(win);
  const T = win.IasharkEssai.TEXTES;
  const MOIS = { fr: /abonnement mensuel/, en: /monthly plan/, es: /suscripción mensual/, "es-mx": /suscripción mensual/, de: /Monatsabo/, it: /abbonamento mensile/, pt: /subscrição mensal/ };
  for (const l of LOCALES) {
    const d = DICTS[l].essai_mensuel;
    assert.equal(T[l].hint, d.hint, l + " : hint");
    assert.equal(T[l].hint_link, d.hint_link, l + " : hint_link");
    for (const k of ["hint", "badge", "headline"]) assert.match(d[k], MOIS[l], l + "." + k + " : abonnement mensuel");
    assert.match(d.hint, /\{days\}/, l);
    assert.match(d.headline, /\{days\}[\s\S]*\{price\}/, l);
    assert.match(DICTS[l].pricing_grid.trial_short, MOIS[l], l + " : formule courte de la grille");
    assert.doesNotMatch(JSON.stringify(d) + DICTS[l].pricing_grid.trial_short + DICTS[l].pricing_grid.trial_terms, /gagn|winn|ganan|gewinn|vinc|ganhar|garanti|guarantee|risque|risk|mise\b|stake/i, l);
  }
  assert.equal(DICTS.fr.essai_mensuel.hint.split("{days}").join("7"), "Essai Pro gratuit 7 jours (abonnement mensuel)");
  assert.equal(DICTS.fr.pricing_grid.trial_short.split("{days}").join("7"), "Essai gratuit 7 jours (abonnement mensuel)");
});

// Faux navigateur minimal pour assets/essai-annonce.js.
function runHint({ path: p = "/fr/inscription.html", server, ctx, jamais = true, market } = {}) {
  const el = {
    hidden: true, attrs: { "data-essai-annonce": "" }, children: [],
    getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; },
    setAttribute(k, v) { this.attrs[k] = v; },
    appendChild(c) { this.children.push(c); },
    set textContent(v) { this.children = []; this._t = v; },
    get textContent() { return this.children.map((c) => c.textContent).join(""); }
  };
  const node = (txt) => ({ textContent: txt, style: {}, setAttribute() {} });
  const calls = [];
  const win = {
    location: { pathname: p },
    document: {
      readyState: "complete",
      querySelectorAll: () => [el],
      createElement: () => node(""),
      createTextNode: (t) => node(t),
      addEventListener() {}
    },
    IASHARK_MARKET: market,
    IasharkCompteLeger: {
      url: "https://projet.supabase.co", key: "k",
      context: () => Promise.resolve(ctx || { user: null, isPro: false }),
      jamaisAbonne: () => Promise.resolve(jamais)
    },
    fetch: (url, init) => { calls.push(JSON.parse(init.body)); return Promise.resolve({ json: () => Promise.resolve(server) }); }
  };
  new Function("window", read("assets/essai-annonce.js"))(win);
  return win.IasharkEssai.aAnnoncer().then(() => new Promise((r) => setTimeout(r, 5))).then(() => ({ el, calls, link: el.children[2] }));
}
const OUVERT = { ok: true, mode: "availability", intervals: { week: true, month: true, year: true }, trial_days: 7, trial_intervals: ["month"] };

test("ligne « Essai Pro gratuit » : seulement si le serveur, le pays et la personne le permettent", async () => {
  const v = await runHint({ server: OUVERT });
  assert.equal(v.el.hidden, false, "visiteur : ligne montree");
  assert.equal(v.el.textContent, "Essai Pro gratuit 7 jours (abonnement mensuel) · Voir l’offre");
  assert.equal(v.link.href, "/fr/abonnement.html?interval=month", "le lien ouvre l'abonnement sur le mois");
  assert.deepEqual(v.calls[0], { mode: "availability" });
  const gb = await runHint({ path: "/gb/inscription.html", server: OUVERT });
  assert.deepEqual(gb.calls[0], { mode: "availability", market: "gb" }, "marche du pays");
  assert.match(gb.el.textContent, /^Free 7-day Pro trial \(monthly plan\)/);
  const mx = await runHint({ path: "/mx/inscription.html", server: OUVERT });
  assert.match(mx.el.textContent, /^Prueba Pro gratis de 7 días \(suscripción mensual\)/);
  // Jamais :
  const cas = {
    "abonne (ou en essai, ou admin)": { server: OUVERT, ctx: { user: { id: "u" }, isPro: true } },
    "ancien abonne ou ancien essai": { server: OUVERT, ctx: { user: { id: "u" }, isPro: false }, jamais: false },
    "essai coupe (TRIAL_DAYS = 0)": { server: Object.assign({}, OUVERT, { trial_days: 0 }) },
    "mois non payable dans ce pays (serveur)": { server: Object.assign({}, OUVERT, { intervals: { week: true, month: false, year: false } }) },
    "mois ferme dans la configuration": { server: OUVERT, market: { dir: "gb", checkoutMarket: "gb", proOffer: () => ({ intervals: [{ interval: "month", amount: 14.99, open: false }] }) } },
    "serveur sans essai sur le mois": { server: Object.assign({}, OUVERT, { trial_intervals: ["week"] }) },
    "serveur muet": { server: null }
  };
  for (const [nom, o] of Object.entries(cas)) {
    const r = await runHint(o);
    assert.equal(r.el.hidden, true, nom);
  }
  const libre = await runHint({ server: OUVERT, ctx: { user: { id: "u" }, isPro: false }, jamais: true });
  assert.equal(libre.el.hidden, false, "compte gratuit jamais abonne : ligne montree");
});

test("parcours d'inscription, match offert, bienvenue et compte : emplacements de la ligne", () => {
  for (const d of DIRS) {
    const html = read(d + "/inscription.html");
    assert.match(html, /data-essai-annonce data-track="signup_trial_hint" hidden><\/p>/, d + " : inscription");
    assert.match(html, /<script src="\/assets\/essai-annonce\.js" defer><\/script>/, d);
  }
  const mp = read("match-page.js");
  assert.match(mp, /\$\{o\.free\?'<p class="avis-trial" data-essai-annonce data-track="match_free_trial_hint" hidden><\/p>':''\}/, "encart « gratuit avec un compte » du match offert");
  assert.match(mp, /if\(!o\.free\)monterGrillePrix\(\);\n  else annoncerEssai\(\);/);
  const ac = read("account-page.js");
  assert.match(ac, /ligne\.setAttribute\('data-track', 'account_welcome_trial_hint'\);/, "bienvenue « Votre compte est cree »");
  assert.match(ac, /data-essai-annonce data-track="account_overview_trial_hint" hidden/, "vue d'ensemble d'un compte gratuit (« Voir l'abonnement »)");
  assert.match(ac, /function ligneEssaiPossible\(\) \{ return typeDeCompte\(\) !== 'pro' && typeDeCompte\(\) !== 'admin' && !abo && !aboInconnu; \}/);
});

test("pages de paiement sans encart propre (landings gb/za/mx) : encart de la grille, mois seulement", () => {
  const win = { IasharkApp: null };
  new Function("window", read("assets/pricing-grid.js"))(win);
  const G = win.IasharkPricingGrid;
  const lib = {}; new Function("window", read("lib/market-config.js"))(lib);
  const market = lib.IasharkMarketConfig.build("fr");
  const model = G.offerModel(market, { annual: true });
  const fr = DICTS.fr.pricing_grid;
  const t = (k) => fr[k];
  const ctx = (o) => Object.assign({ uid: "t", variant: "complet", checkout: true, href: (iv) => "/abonnement.html?interval=" + iv, freeHref: "/inscription.html", isPro: false, loggedIn: false }, o);
  const html = (st, o) => G.buildHtml(model, st, t, ctx(o)).replace(/&#39;/g, "'").replace(/[  ]/g, " ");
  const mois = html({ cycle: "month" }, { trialDays: 7 });
  assert.match(mois, /<div data-pg-trial-box><div class="mb-4 [^"]*" data-pg-trial-note><p [^>]*>Essai gratuit 7 jours \(abonnement mensuel\)<\/p>/);
  assert.doesNotMatch(html({ cycle: "month", weekly: true }, { trialDays: 7 }), /Essai gratuit/, "semaine : rien");
  assert.doesNotMatch(html({ cycle: "year" }, { trialDays: 7 }), /Essai gratuit/, "annee : rien");
  assert.doesNotMatch(html({ cycle: "month" }, { trialDays: 7, ownTrial: true }), /data-pg-trial-note/, "page d'abonnement : son propre encart");
  assert.doesNotMatch(html({ cycle: "month" }, { trialDays: 7, isPro: true }), /Essai gratuit/, "abonne : rien");
  // Pays ferme : aucune duree, aucun essai.
  const ferme = G.offerModel(market, { annual: true }, { week: false, month: false, year: false });
  assert.doesNotMatch(G.buildHtml(ferme, { cycle: "month" }, t, ctx({ trialDays: 7 })), /Essai gratuit|data-pg-trial-note|data-pg-footer-trial/);
});

test("e-mails de vente (free_match, pro_features, inactive) : essai mensuel seulement pour un compte jamais abonne", async () => {
  const L = require("../lib/lifecycle-email.js");
  const build = require("../lib/lifecycle-email-build.js");
  const BUNDLE = build.loadBundle();
  const NOW = new Date("2026-09-17T10:00:00Z");
  const token = await L.createUnsubscribeToken({ userId: "0f8fad5b-d9cb-469f-a165-70867728950e", dir: "fr" }, "secret-de-test-0123456789abcdef-0123456789", NOW);
  const unsub = (dir) => L.unsubscribeLinks(token, dir, "https://example.supabase.co").page.replace("/fr/", "/" + dir + "/");
  const freeMatch = { home: "A", away: "B", league: "Ligue 1", kickoff: "21:00", url: "https://iashark.com/fr/match.html?id=1" };
  const weekend = [freeMatch];
  const render = (campaign, dir, trialDays) => L.renderLifecycleEmail(BUNDLE, campaign, dir, { freeMatch, weekendMatches: weekend, marketingOptIn: true, trialDays }, { unsubscribeUrl: unsub(dir), now: NOW });
  for (const campaign of ["free_match", "pro_features", "inactive_7d", "inactive_30d"]) {
    const avec = render(campaign, "fr", 7).text;
    assert.match(avec, /[Ee]ssai (Pro )?gratuit 7 jours (\(abonnement mensuel\)|sur l'abonnement mensuel)/, campaign + " : annonce");
    assert.match(avec, /premier abonnement/, campaign);
    assert.match(avec, /abonnement\.html/, campaign + " : lien vers l'abonnement");
    for (const sans of [0, undefined, null]) assert.doesNotMatch(render(campaign, "fr", sans).text, /[Ee]ssai/, campaign + " : pas d'essai (" + sans + ")");
  }
  for (const dir of ["en", "gb", "mx", "es", "za"]) assert.match(render("pro_features", dir, 7).text, /7/, dir);
  // Expediteur : essai seulement si le compte n'a jamais eu d'abonnement (toutes lignes).
  const h = read("supabase/functions/send-lifecycle-emails/handler.ts");
  assert.match(h, /const venteAvecEssai = \["free_match", "pro_features", "inactive_7d", "inactive_30d"\]\.includes\(campaign\) && row\.ever_subscribed === false;/);
  assert.match(h, /trialDays: venteAvecEssai \? trialDays\(\(k: string\) => deps\.env\(k\)\) : 0/);
  assert.match(read("supabase/functions/send-lifecycle-emails/index.ts"), /\.from\("subscriptions"\)\.select\("user_id"\)\.in\("user_id", ids\)/);
  // Module embarque a jour.
  assert.equal(read("supabase/functions/_shared/lifecycle-email-bundle.generated.mjs"), build.buildBundleSource());
});

test("CGV (9 versions) : essai sur l'abonnement mensuel uniquement", () => {
  const M = {
    fr: "sur l'abonnement mensuel uniquement", en: "on the monthly subscription only", es: "solo en la suscripción mensual",
    de: "nur beim Monatsabonnement", it: "solo sull'abbonamento mensile", pt: "apenas na subscrição mensal",
    gb: "on the monthly subscription only", za: "on the monthly subscription only", mx: "solo en la suscripción mensual"
  };
  for (const [d, m] of Object.entries(M)) {
    const files = ["legal/" + d + "/cgv.html"].concat(fs.existsSync(path.join(ROOT, d + "/cgv.html")) ? [d + "/cgv.html"] : []);
    for (const f of files) {
      const full = read(f);
      // Article de l'essai seulement (de son titre au titre suivant).
      const i = full.search(/<h2>[^<]*(6 bis|6A|6a|6-bis|6\.º-A)/);
      assert.ok(i > 0, f + " : article de l'essai");
      const html = full.slice(i, full.indexOf("<h2>", i + 4));
      assert.ok(html.includes(m), f + " : " + m);
      assert.doesNotMatch(html, /quelle que soit la période choisie|whichever (billing )?period you choose|sea cual sea el periodo elegido|unabhängig von der gewählten Laufzeit|qualunque sia il periodo scelto|seja qual for o período escolhido|con cualquier plazo que elijas/, f);
    }
  }
});
