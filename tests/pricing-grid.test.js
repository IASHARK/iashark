"use strict";
// Grille de prix interactive (assets/pricing-grid.js, 30/09/2026) : reprise
// sans React d'un composant 21st.dev, branchee partout ou un prix apparait,
// remise au propre le meme jour (une seule liste, un seul choix de duree,
// plus d'onglet « Comparer » ni de liste en double sous la grille).
// Ce que ces tests verrouillent :
//   - prix IDENTIQUES a config/markets.json (via lib/market-config.js), dans
//     la bonne devise pour chaque version du site, jamais une duree non payable ;
//   - pas d'annee sans prix annuel payable (option eteinte par defaut ;
//     aujourd'hui seuls l'euro et le peso ont un prix annuel Stripe) ;
//   - essai : jamais « 14 jours » ni « sans carte » ; annonce seulement si le
//     serveur le confirme ; conditions reelles (carte demandee, rappel 2 jours
//     avant, annulation en 1 clic, reserve a un premier abonnement) ;
//   - i18n complet dans les 7 dictionnaires ; aucune promesse de gain ;
//   - accessibilite : choix de la duree (boutons radio), icones ;
//   - mise en page (controle des captures du 30/09/2026) : un seul dessin
//     partout (carte Pro sur toute la largeur puis le Gratuit sur une ligne),
//     aucun doublon (Gratuit = fonctions gratuites, Pro = fonctions Pro, meme
//     liste sur le mur Pro et le compte), « sans engagement » une seule fois ;
//   - branchement : chaque page qui affiche un prix charge la grille.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const MARKETS = JSON.parse(read("config/markets.json"));
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
const DIRS = require("./helpers/public-dirs.js").PUBLIC_DIRS;
const INTERVALS = ["week", "month", "year"];
const norm = (s) => String(s).replace(/[  ]/g, " ");
const unesc = (s) => String(s).replace(/<span class="whitespace-nowrap">([^<]*)<\/span>/g, "$1").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function loadMarketLib() {
  const sb = {};
  new Function("window", read("lib/market-config.js"))(sb);
  return sb.IasharkMarketConfig;
}
function loadGrid(win) {
  win = win || {};
  new Function("window", read("assets/pricing-grid.js"))(win);
  return win.IasharkPricingGrid;
}
const LIB = loadMarketLib();
const G = loadGrid();
// Textes dans la langue d'une version (comme le composant, dictionnaire charge).
function textsFor(dir) {
  const locale = MARKETS._dirs[dir].locale;
  const g = loadGrid({ I18N: { dict: DICTS[locale] } });
  return (k) => g.textFor(k);
}
// Texte affiche d'une ligne de la grille (cle ou texte de remplacement, date
// de la simulation remplie), comme le composant.
function lineFor(dir) {
  const locale = MARKETS._dirs[dir].locale;
  const g = loadGrid({ I18N: { dict: DICTS[locale] } });
  return (f) => g.featureText(f, (k) => g.textFor(k));
}
// Grille chargee avec d'autres valeurs des interrupteurs (STATS_IASHARK, SIMULATION).
function gridWith(replacements) {
  let src = read("assets/pricing-grid.js");
  for (const [from, to] of replacements) {
    assert.ok(src.includes(from), "interrupteur introuvable : " + from);
    src = src.replace(from, to);
  }
  const w = {}; new Function("window", src)(w);
  return w.IasharkPricingGrid;
}
// Lignes Pro de la V3 (hors « bientot » de nature), dans l'ordre de la grille :
// la liste du mur Pro des pages match (match-page.js#LISTE_PRO).
const PRO_V3 = ["f_all_matches", "f_pronostic", "f_pick", "f_scenario", "f_stats_iashark", "f_stats", "f_scores", "f_scorers"];
// Lignes Pro ouvertes attendues selon les interrupteurs du composant.
function proOuvertes(g) {
  return PRO_V3.filter((k) => (k !== "f_stats_iashark" || g.STATS_IASHARK) && (k !== "f_scenario" || g.SIMULATION === "mention" || g.SIMULATION === "ouverte"));
}
function ctx(extra) {
  return Object.assign({ uid: "t", variant: "complet", checkout: false, isPro: false, loggedIn: false,
    href: (iv) => "/abonnement.html?interval=" + iv, freeHref: "/inscription.html", trialDays: null }, extra || {});
}
function render(dir, opts, state, c, availability) {
  const market = LIB.build(dir);
  const model = G.offerModel(market, opts || { annual: true }, availability);
  return { market, model, html: norm(unesc(G.buildHtml(model, state || { cycle: "month" }, textsFor(dir), ctx(c)))) };
}
// Durees payables selon la configuration (prix + checkoutOpen).
function payable(marketKey) {
  const m = MARKETS[marketKey];
  return INTERVALS.filter((iv) => m.prices.pro[iv] && m.prices.pro[iv].amount != null && (!Array.isArray(m.checkoutOpen) || m.checkoutOpen.includes(iv)));
}
function fmt(marketKey, dir, amount) {
  const m = MARKETS[marketKey];
  return norm(LIB.formatAmount(amount, m.currency, m.priceIntlLocale || MARKETS._dirs[dir].intlLocale));
}

test("prix : identiques a config/markets.json, dans la devise de chaque version, jamais une duree non payable", () => {
  for (const dir of DIRS) {
    const mk = MARKETS._dirs[dir].market;
    const conf = MARKETS[mk];
    const open = payable(mk);
    const { html, model } = render(dir, { annual: true }, { cycle: "month" });
    assert.deepEqual(model.visible, open, dir + " : durees proposees = durees payables");
    assert.equal(model.currency, conf.currency, dir);
    // Gratuit : 0 dans la devise du marche.
    assert.ok(html.includes(fmt(mk, dir, conf.prices.free.amount)), dir + " : prix Gratuit");
    // Mensuel en grand, semaine en option.
    if (open.includes("month")) assert.ok(html.includes(fmt(mk, dir, conf.prices.pro.month.amount)), dir + " : mensuel");
    if (open.includes("week") && open.includes("month")) assert.ok(html.includes(fmt(mk, dir, conf.prices.pro.week.amount)), dir + " : semaine proposee");
    // Duree non payable : son prix n'apparait nulle part (GB : ni 4,99 ni 149).
    for (const iv of INTERVALS) {
      if (open.includes(iv) || !conf.prices.pro[iv]) continue;
      assert.ok(!html.includes(fmt(mk, dir, conf.prices.pro[iv].amount)), dir + " : prix " + iv + " non payable affiche");
    }
    // Annuel : le montant REELLEMENT preleve en grand (prix Stripe, « / an ») ;
    // equivalent mensuel (centime SUPERIEUR) et economie (entier INFERIEUR)
    // seulement dans la mention en petit (controle de l'avocat du 30/09/2026).
    if (open.includes("year")) {
      const y = render(dir, { annual: true }, { cycle: "year" }).html;
      const yr = conf.prices.pro.year.amount, mo = conf.prices.pro.month.amount;
      const eq = Math.ceil(Math.round(yr * 100) / 12) / 100;
      const pct = Math.floor((1 - (yr * 100) / (mo * 1200)) * 100 + 1e-9);
      const t = textsFor(dir);
      const big = y.match(/data-pg-amount>([^<]*)<\/span><span[^>]*>([^<]*)<\/span>/);
      assert.ok(big, dir + " : prix en grand");
      assert.equal(big[1], fmt(mk, dir, yr), dir + " : en grand, le montant annuel preleve");
      assert.equal(big[2], norm(t("per_year")), dir + " : « / an » a cote du montant annuel");
      const billed = (y.match(/data-pg-billed>([^<]*)</) || [])[1] || "";
      assert.ok(billed.includes(fmt(mk, dir, eq)), dir + " : equivalent mensuel " + eq + " en petit");
      assert.ok(billed.includes(String(pct)), dir + " : economie " + pct + " %");
      assert.ok(eq * 12 >= yr, dir + " : equivalent jamais sous le prix reel");
    }
  }
  // Valeurs attendues (decision du proprietaire du 16/09/2026, rien d'invente).
  const fr = render("fr", { annual: true }, { cycle: "year" }).html;
  assert.match(fr, /data-pg-amount>199 €<\/span><span[^>]*>\/ an<\/span>/);
  assert.match(fr, /Prélevé en une fois pour 12 mois · soit 16,59 € par mois, 16 % de moins qu’au mois/);
  assert.doesNotMatch(fr, /data-pg-amount>16,59/, "l'equivalent mensuel n'est jamais le prix en grand");
  assert.match(render("mx", { annual: true }, { cycle: "year" }).html, /data-pg-amount>MX\$1,990<\/span>/);
  assert.match(render("gb").html, /£14\.99/);
  assert.match(render("en").html, /\$19\.99/);
  assert.match(render("mx").html, /MX\$199/);
  assert.match(render("za").html, /R 199/);
});

test("aucun prix ecrit a la main dans le composant", () => {
  const src = read("assets/pricing-grid.js").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(src, /\d+[,.]\d{2}\s?€|€\s?\d|£\s?\d|\$\s?\d|MX\$|\bR\s?\d{2}|\b(19[.,]9[59]|14[.,]99|6[.,]99|4[.,]99|199|149|1990|69)\b/);
});

test("choix de la duree : seulement les durees payables, annee eteinte par defaut, jamais sans prix annuel payable", () => {
  for (const dir of DIRS) {
    const mk = MARKETS._dirs[dir].market;
    const open = payable(mk);
    const hasYear = open.includes("year") && open.includes("month");
    // Option allumee : l'annee seulement si elle est vendue ET payable dans ce marche.
    const on = render(dir, { annual: true }).html;
    assert.equal(/data-pg-dur="year"/.test(on), hasYear, dir + " : annee");
    // Durees proposees = durees payables (au moins deux, sinon aucun choix).
    const durs = [...on.matchAll(/data-pg-dur="(\w+)"/g)].map((m) => m[1]);
    const expected = open.length > 1 ? open : [];
    assert.deepEqual(durs, expected, dir + " : durees du choix");
    // Option absente (valeur par defaut) : jamais d'annee.
    const off = render(dir, {}).html;
    assert.doesNotMatch(off, /data-pg-dur="year"/, dir + " : option eteinte par defaut");
    // Serveur : annee fermee -> retiree du choix.
    if (hasYear) assert.doesNotMatch(render(dir, { annual: true }, null, null, { year: false }).html, /data-pg-dur="year"/, dir + " : annee fermee par le serveur");
    // Plus d'interrupteur ni d'onglets.
    assert.doesNotMatch(on, /role="switch"|role="tablist"|<table/, dir);
  }
  // Aujourd'hui (depot du 30/09/2026) : euro et peso seulement.
  assert.ok(G.offerModel(LIB.build("fr"), { annual: true }).annual);
  assert.ok(G.offerModel(LIB.build("mx"), { annual: true }).annual);
  for (const d of ["gb", "za", "en"]) assert.equal(G.offerModel(LIB.build(d), { annual: true }).annual, false, d);
  // Pastille d'economie calculee, jamais saisie.
  assert.match(render("fr", { annual: true }).html, /data-pg-dur="year"[^>]*>[\s\S]*?>199 €<\/span><span[^>]*>−16 %<\/span><\/span><\/button>/, "pastille dans la case, a cote du prix");
  // Une seule duree payable (GB : le mois) : aucun choix affiche.
  assert.deepEqual(G.durationsOf(G.offerModel(LIB.build("gb"), { annual: true })), []);
});

test("annuel : jamais « sans engagement » (CGV : 12 mois payes d'avance), pied et reassurance adaptes", () => {
  const mois = render("fr", { annual: true }, { cycle: "month" }).html;
  const an = render("fr", { annual: true }, { cycle: "year" }).html;
  const foot = (h) => h.slice(h.indexOf("data-pg-footer>"));
  assert.match(foot(mois), /Sans engagement · résiliable à tout moment/);
  assert.doesNotMatch(foot(an), /[Ss]ans engagement/, "annuel : pas de « sans engagement » dans le pied");
  assert.match(foot(an), /Formule annuelle : 12 mois payés d’avance, reconduite pour un an sauf résiliation avant l’échéance/);
  assert.doesNotMatch(an, /[Ss]ans engagement/, "annuel : nulle part dans la grille");
  // Chaque langue a son texte annuel, sans « sans engagement ».
  const NO_TERM = /sans engagement|no minimum term|sin permanencia|sin plazo forzoso|ohne Mindestlaufzeit|senza vincoli|sem compromisso/i;
  for (const [l, d] of Object.entries(DICTS)) {
    assert.doesNotMatch(d.pricing_grid.footer_base_annual, NO_TERM, l);
    assert.doesNotMatch(d.pricing_grid.billed_annual + d.pricing_grid.billed_annual_nosave, NO_TERM, l);
    assert.match(d.pricing_grid.footer_base_annual, /12/, l + " : 12 mois");
  }
  // Ligne compacte en annuel : la mention de prelevement, pas « sans engagement ».
  const t = textsFor("fr");
  const model = G.offerModel(LIB.build("fr"), { annual: true });
  const ligneAn = norm(unesc(G.buildHtml(model, { cycle: "year" }, t, ctx({ variant: "ligne" }))));
  assert.doesNotMatch(ligneAn, /[Ss]ans engagement/);
  assert.match(ligneAn, /Prélevé en une fois pour 12 mois/);
  // La grille met a jour le pied et masque [data-pg-hide-year] (reassurance de la page) en annuel.
  const src = read("assets/pricing-grid.js");
  assert.match(src, /function syncYear\(iv\) \{\s*Array\.prototype\.forEach\.call\(el\.querySelectorAll\('\[data-pg-hide-year\]'\), function \(n\) \{ n\.hidden = iv === 'year'; \}\);/);
  assert.match(src, /foot\.innerHTML = footerHtml\(model, t, c\.trialDays, iv, c\);\s*syncYear\(iv\);/);
  // Page de paiement qui affiche sa reassurance sous le bouton (hasTrust) : le
  // pied ne la repete pas au mois, mais garde le texte annuel en annuel.
  const payMois = render("fr", { annual: true }, { cycle: "month" }, { checkout: true, hasTrust: true }).html;
  const payAn = render("fr", { annual: true }, { cycle: "year" }, { checkout: true, hasTrust: true }).html;
  assert.doesNotMatch(foot(payMois), /Sans engagement/);
  assert.match(foot(payMois), /aucun résultat n’est garanti/);
  assert.match(foot(payAn), /Formule annuelle : 12 mois payés d’avance/);
  assert.doesNotMatch(foot(payAn), /paiement sécurisé/, "annuel, page de paiement : « paiement securise » deja dans la ligne de confiance");
  // Ligne de confiance de la grille (compte, landings pays) : au mois, une fois
  // chaque mention ; en annuel, seulement « paiement securise ».
  const trustMois = render("fr", { annual: true }, { cycle: "month" }, { checkout: true, showTrust: true }).html;
  const trustAn = render("fr", { annual: true }, { cycle: "year" }, { checkout: true, showTrust: true }).html;
  assert.match(trustMois, /data-pg-trust>[\s\S]*Paiement sécurisé[\s\S]*Sans engagement[\s\S]*Résiliable à tout moment/);
  assert.equal((trustMois.match(/[Ss]ans engagement/g) || []).length, 1, "une seule fois par ecran");
  assert.equal((trustMois.match(/[Rr]ésiliable à tout moment/g) || []).length, 1, "une seule fois par ecran");
  assert.doesNotMatch(trustAn, /[Ss]ans engagement|[Rr]ésiliable à tout moment/, "annuel : 12 mois payes d'avance");
  assert.match(trustAn, /Paiement sécurisé/);
  for (const d of [""].concat(DIRS.map((x) => x + "/"))) {
    const page = read(d + "abonnement.html");
    assert.match(page, /<span data-pg-hide-year>◇ <span data-i18n="pricing_page\.trust_no_commitment">/, d + "abonnement.html");
    assert.match(page, /<span data-pg-hide-year>↻ <span data-i18n="pricing_page\.trust_cancel">/, d + "abonnement.html : « resiliable » masque en annuel");
  }
  // Mention de prelevement au mois : plus de « sans engagement » (dit une seule fois, ailleurs).
  for (const [l, d] of Object.entries(DICTS)) assert.doesNotMatch(d.pricing_grid.billed_month + d.pricing_grid.billed_week, NO_TERM, l);
});

test("essai : jamais « 14 jours » ni « sans carte » ; annonce seulement si le serveur le confirme ; conditions reelles", () => {
  const CARD = { fr: /carte est demandée/, en: /card is required/, es: /pide tu tarjeta/, "es-mx": /pide tu tarjeta/, de: /Karte wird abgefragt/, it: /carta viene richiesta/, pt: /cartão é pedido/ };
  const NOTE_CARD = { fr: /Carte demandée/, en: /Card required/, es: /Se pide tarjeta/, "es-mx": /Se pide tarjeta/, de: /Karte erforderlich/, it: /Carta richiesta/, pt: /Cartão pedido/ };
  const FIRST = { fr: /premier abonnement/, en: /first subscription/, es: /primera suscripción/, "es-mx": /primera suscripción/, de: /erstes Abo/, it: /primo abbonamento/, pt: /primeira subscrição/ };
  for (const l of LOCALES) {
    const g = DICTS[l].pricing_grid;
    const all = JSON.stringify(g);
    assert.doesNotMatch(all, /\b14\b/, l + " : aucun « 14 jours »");
    assert.doesNotMatch(all, /sans carte|no card|sin tarjeta|ohne Karte|senza carta|sem cartão|without (a )?card/i, l + " : jamais « sans carte »");
    assert.match(g.footer_trial, /\{days\}/, l + " : duree lue sur le serveur");
    assert.match(g.trial_note, /\{days\}/, l);
    assert.match(g.footer_trial, CARD[l], l + " : carte demandee");
    assert.match(g.footer_trial, /2/, l + " : rappel 2 jours avant la fin");
    assert.match(g.footer_trial, /1/, l + " : annulation en 1 clic");
    // Ligne compacte (mur des pages match, accueil) : memes conditions (controle du 30/09/2026).
    assert.match(g.trial_note, NOTE_CARD[l], l + " : ligne d'essai, carte demandee");
    assert.match(g.trial_note, FIRST[l], l + " : ligne d'essai, reserve a un premier abonnement");
  }
  const t = textsFor("fr");
  const market = LIB.build("fr");
  const model = G.offerModel(market, { annual: true });
  const without = G.buildHtml(model, { cycle: "month" }, t, ctx({ trialDays: null }));
  assert.doesNotMatch(without, /data-pg-footer-trial|Essai gratuit|jours gratuits/, "essai inconnu : rien d'annonce");
  assert.match(without, /Devenir Pro/);
  const zero = G.buildHtml(model, { cycle: "month" }, t, ctx({ trialDays: 0 }));
  assert.doesNotMatch(zero, /data-pg-footer-trial/, "TRIAL_DAYS=0 : pas d'essai");
  const seven = norm(unesc(G.buildHtml(model, { cycle: "month" }, t, ctx({ trialDays: 7 }))));
  assert.match(seven, /Essai gratuit de 7 jours sur l’abonnement mensuel uniquement, réservé à un premier abonnement/);
  assert.match(seven, /Commencer l’essai gratuit/);
  assert.match(seven, /Essai gratuit 7 jours \(abonnement mensuel\)\. Puis 19,95 € \/ mois, annulable en 1 clic/);
  // 02/10/2026 (soir) : essai sur l'ABONNEMENT MENSUEL seulement. Annee et
  // semaine : aucune annonce, bouton « Devenir Pro ».
  for (const st of [{ cycle: "year" }, { cycle: "month", weekly: true }]) {
    const other = norm(unesc(G.buildHtml(model, st, t, ctx({ trialDays: 7 }))));
    assert.doesNotMatch(other, /data-pg-trial-note|data-pg-footer-trial|Commencer l’essai|Essai gratuit|jours gratuits/, JSON.stringify(st) + " : pas d'essai");
    assert.match(other, /Devenir Pro/);
  }
  // Abonne : pas de promesse d'essai, bouton « Gerer mon abonnement ».
  const pro = G.buildHtml(model, { cycle: "month" }, t, ctx({ trialDays: 7, isPro: true }));
  assert.doesNotMatch(pro, /data-pg-trial-note|Commencer l’essai/);
  assert.match(pro, /Gérer mon abonnement/);
  assert.match(pro, /Ton offre actuelle/);
  // Compte deja abonne une fois (espace Pro) : option showTrial=false respectee par mount (ctx.trialDays null).
  assert.match(read("pro-dashboard.js"), /data-pg-trial="false"/);
  // Ligne compacte (mur des pages match) : conditions completes.
  const ligne = norm(unesc(G.buildHtml(model, { cycle: "month" }, t, ctx({ variant: "ligne", trialDays: 7 }))));
  assert.match(ligne, /Essai gratuit 7 jours \(abonnement mensuel\)\. Puis 19,95 € \/ mois, annulable en 1 clic\. Carte demandée, rien n’est prélevé pendant l’essai, rappel par e-mail 2 jours avant la fin\. Réservé à un premier abonnement\./);
  // Nouvelles mentions (abonnement mensuel) : memes conditions dans les 7 langues.
  for (const l of LOCALES) {
    const g = DICTS[l].pricing_grid;
    assert.match(g.trial_short, /\{days\}/, l);
    assert.match(g.trial_terms, NOTE_CARD[l].source === "Se pide tarjeta" ? /tarjeta/ : NOTE_CARD[l], l + " : carte demandee");
    assert.match(g.trial_terms, FIRST[l], l + " : premier abonnement");
    assert.match(g.trial_terms + g.footer_trial_month, /\b2\b/, l + " : rappel 2 jours avant");
    assert.match(g.footer_trial_month, CARD[l], l + " : carte demandee");
  }
});

test("essai : annonce seulement a qui y a droit (jamais a un ancien abonne), rien tant que la session est inconnue", async () => {
  const f = G.trialFor;
  const anon = { known: true, isPro: false, loggedIn: false, trialOk: true };
  assert.equal(f(7, anon), 7, "visiteur non connecte : essai annonce avec ses conditions");
  assert.equal(f(0, anon), null, "TRIAL_DAYS=0 (defaut du serveur) : rien");
  assert.equal(f(null, anon), null, "serveur muet : rien");
  assert.equal(f(7, anon, false), null, "option showTrial=false");
  assert.equal(f(7, { known: false, isPro: false, loggedIn: false, trialOk: null }), null, "session pas encore lue : rien");
  assert.equal(f(7, { known: true, isPro: true, loggedIn: true, trialOk: false }), null, "abonne : rien");
  assert.equal(f(7, { known: true, isPro: false, loggedIn: true, trialOk: null }), null, "compte connecte pas encore verifie : rien");
  assert.equal(f(7, { known: true, isPro: false, loggedIn: true, trialOk: false }), null, "ancien abonne : rien");
  assert.equal(f(7, { known: true, isPro: false, loggedIn: true, trialOk: true }), 7, "compte jamais abonne : essai");
  // Lecture des abonnements passes : meme requete que abonnement-page.js#verifierCompteEssai.
  const calls = [];
  const app = (res) => ({ supabase: { from: (t) => ({ select: (c, o) => ({ eq: (k, v) => { calls.push([t, c, o, k, v]); return typeof res === "function" ? res() : Promise.resolve(res); } }) }) } });
  const g = loadGrid({});
  assert.equal(await g.trialEligibility(app({ count: 0, error: null }), { id: "u1" }), true);
  assert.deepEqual(calls[0], ["subscriptions", "stripe_subscription_id", { count: "exact", head: true }, "user_id", "u1"]);
  assert.equal(await g.trialEligibility(app({ count: 0 }), { id: "u1" }), true, "une lecture par compte et par page");
  assert.equal(calls.length, 1);
  assert.equal(await g.trialEligibility(app({ count: 1, error: null }), { id: "u2" }), false, "ancien abonne");
  assert.equal(await g.trialEligibility(app({ count: null, error: { message: "x" } }), { id: "u3" }), false, "lecture impossible : pas d'essai");
  assert.equal(await g.trialEligibility(app(() => Promise.reject(new Error("reseau"))), { id: "u4" }), false);
  assert.equal(await g.trialEligibility({}, { id: "u5" }), false, "client absent : pas d'essai");
  assert.equal(await g.trialEligibility(app({ count: 5 }), null), true, "visiteur : conditions ecrites");
  // mount : jours annonces = trialFor(serveur, session) ; lecture du compte seulement si l'essai est ouvert.
  const src = read("assets/pricing-grid.js");
  assert.match(src, /trialDays: trialFor\(trialDays, session, options\.showTrial\)/);
  assert.match(src, /if \(!\(trialDays > 0\) \|\| !session\.known \|\| !session\.loggedIn \|\| session\.isPro \|\| session\.trialOk !== null \|\| session\.checking\) return;/);
});

test("i18n : pricing_grid.* complet dans les 7 dictionnaires, identique aux parts, memes variables", () => {
  const keys = Object.keys(G.FALLBACK).sort();
  assert.deepEqual(Object.keys(DICTS.fr.pricing_grid).sort(), keys, "fr : memes cles que le repli du composant");
  for (const k of keys) assert.equal(DICTS.fr.pricing_grid[k], G.FALLBACK[k], "fr." + k + " = repli du composant");
  const vars = (s) => (String(s).match(/\{\w+\}/g) || []).sort().join(",");
  for (const l of LOCALES) {
    const d = DICTS[l].pricing_grid;
    assert.deepEqual(Object.keys(d).sort(), keys, l + " : cles");
    for (const k of keys) {
      assert.equal(typeof d[k], "string", l + "." + k);
      assert.ok(d[k].trim().length > 0, l + "." + k + " vide");
      assert.equal(vars(d[k]), vars(DICTS.fr.pricing_grid[k]), l + "." + k + " : variables");
    }
    const part = JSON.parse(read("i18n/parts/pricing_grid." + l + ".json"));
    assert.deepEqual(part.pricing_grid, d, l + " : part et dictionnaire identiques (node scripts/merge-i18n-parts.js)");
    assert.equal(typeof DICTS[l].checkout_pages.success_heading_trial, "string", l + " : titre de la page de retour pendant l'essai");
  }
  // Chaque fonction de la grille a son texte.
  for (const f of G.FEATURES) assert.ok(G.FALLBACK[f.key], f.key);
});

test("textes : aucune promesse de gain, familles au bon nom, tags honnetes", () => {
  for (const l of LOCALES) {
    const all = JSON.stringify(DICTS[l].pricing_grid);
    assert.doesNotMatch(all, /gagnant|gagner|winning|win money|profit|rentab|ganar dinero|ganancia segura|gewinnen|vincere|vincente|ganhar|lucro/i, l + " : promesse de gain");
    assert.doesNotMatch(all, /Sûre|\bSure\b/, l + " : la famille « Sure » s'appelle « Prudent »");
    assert.doesNotMatch(all, /le plus choisi|most popular|más elegid|meistgewählt|più scelt|mais escolhid/i, l + " : « le plus choisi » sans preuve");
  }
  // Fonctions pas encore ouvertes a tous : marquees.
  const tag = Object.fromEntries(G.FEATURES.map((f) => [f.key, f.tag || null]));
  assert.equal(tag.f_channel, "soon");
  assert.equal(tag.f_robot, "soon");
  // Programme de 9 h 30 et comparateur : rejetes au controle du 30/09/2026, « Bientot »
  // dans l'espace Pro : jamais « en test » (ce qui voudrait dire deja ouverts).
  assert.equal(tag.f_programme, "soon");
  assert.equal(tag.f_comparator, "soon");
  assert.deepEqual(G.FEATURES.filter((f) => f.tag === "test").map((f) => f.key), [], "aucune fonction « en test » aujourd'hui");
  // Sans source aujourd'hui (migration 0041 : plus de cote de fin ; alertes par le robot, pas encore ouvert).
  assert.equal(tag.f_quality, "soon");
  assert.equal(tag.f_alerts, "soon");
  // Gratuit, le 3/10 (lancement de la V3) : uniquement ce qui l'est vraiment
  // ce jour-la (analyse du match offert, stats IASHARK en acces libre). Plus
  // de journal ni de garde-fou : l'espace Pro (migration 0041) ne part pas le
  // 3/10. Plus de calculateur de mise (decision de Clement du 30/09/2026 :
  // plus aucune mise ni esperance sur le site) ; pas de ligne « historique
  // public » a la place tant qu'aucun historique n'est publie.
  assert.deepEqual(G.FEATURES.filter((f) => f.free).map((f) => f.key), ["f_free_match", "f_free_stats"]);
  assert.ok(!G.FEATURES.some((f) => f.key === "f_journal"), "journal : pas ouvert aux comptes gratuits le 3/10");
  assert.ok(G.FEATURES.every((f) => f.pro), "Pro inclut tout le Gratuit");
  // Carte Gratuite : aucune fonction « bientot » barree (elle laisserait croire que Pro l'a deja).
  assert.deepEqual(G.FEATURES.filter((f) => f.tag === "soon" && f.card && f.card.free).map((f) => f.key), []);
});

test("Pro de la V3 (lancement du 3/10) : seulement ce qui est ouvert ce jour-la, stats IASHARK sur un seul interrupteur", () => {
  // Source : POUR-CLEMENT/27-LANCEMENT-3-OCTOBRE.html (partent : nouveau moteur,
  // simulation Pro, grille, stats de la page match ; restent en rodage : Canal
  // Pro, comparateur, robot ; l'espace Pro n'est pas dans la liste).
  const t = textsFor("fr");
  const line = lineFor("fr");
  const ouvertes = (m) => m.features.filter((f) => f.tag !== "soon");
  const fr = G.offerModel(LIB.build("fr"), { annual: true });
  // Pari retenu juste apres « toutes les analyses » ; sans cote minimum
  // (jamais ecrite vers le site, lib/moteur-v3.js C4 du 29/09/2026).
  assert.deepEqual(ouvertes(fr).filter((f) => !f.free).map((f) => f.key).slice(0, 3), ["f_all_matches", "f_pronostic", "f_pick"]);
  for (const l of LOCALES) {
    const g = DICTS[l].pricing_grid;
    const txt = G.FEATURES.filter((f) => f.tag !== "soon").map((f) => g[f.key]).concat(g.f_scenario_since).join(" | ");
    assert.doesNotMatch(txt, /cote minimum|minimum odds|cuota mínima|momio mínimo|Mindestquote|quota minima|odd mínima/i, l + " : pas de cote minimum dans ce qui est ouvert");
    assert.doesNotMatch(JSON.stringify(g), /\b(valeur|avantage|value bet|edge)\b/i, l + " : ni « valeur » ni « avantage »");
    // Jamais « nouveau moteur » (contre-controle du 30/09/2026) : les matchs
    // publies avant le branchement gardent le pari de l'ancien moteur, fige
    // (lib/moteur-v3.js#apresGel), et MOTEUR_V3 peut repasser a 0.
    assert.doesNotMatch(JSON.stringify(g), /nouveau moteur|new engine|nuevo motor|neue[nr]? Engine|nuovo motore|novo motor/i, l + " : pas de « nouveau moteur »");
    // Pas d'espace Pro le 3/10 (absent de la copie de fusion, tableau de bord « bientot »).
    assert.doesNotMatch(g.pro_desc, /espace|space|espacio|Bereich|spazio|espaço|suivre tes paris|track your bets/i, l + " : description sans espace Pro");
  }
  // Gratuit : ni « en entier » (la simulation reste Pro, meme sur le match
  // offert), ni « du jour » (decision 5), ni journal ou garde-fou (espace Pro).
  for (const g of [G, gridWith([["var STATS_IASHARK = false;", "var STATS_IASHARK = true;"]])]) {
    const gratuit = ouvertes(g.offerModel(LIB.build("fr"), { annual: true })).filter((f) => f.free).map(line).join(" | ");
    assert.doesNotMatch(gratuit, /en entier|du jour|chaque jour|journal|garde-fou|bilan/);
  }
  // (Simulation Pro seulement, meme sur le match offert : lib/premium-fields.js#PRO_ONLY_FIELDS
  // de la copie de fusion V3, pas encore dans cette branche.)
  // Espace Pro : « bientot », en France seulement (regle du contre-controle, ronde 3).
  const dash = G.FEATURES.find((f) => f.key === "f_dashboard");
  assert.ok(dash && dash.tag === "soon" && dash.france === true && !dash.free);
  // Comparateur (bientot, France) : c'est lui qui apporte la cote minimum.
  assert.match(t("f_comparator"), /cote minimum/);
  // Stats IASHARK : un seul interrupteur, ETEINT par defaut (contre-controle du
  // 30/09/2026 : un oubli ne doit jamais laisser les lignes sans les stats).
  // Allume seulement dans la fusion qui apporte les stats (vendredi 2/10, 18 h).
  assert.equal(G.STATS_IASHARK, false, "STATS_IASHARK eteint par defaut (a allumer dans la fusion des stats)");
  const avecStats = G.FEATURES.filter((f) => f.stats).map((f) => f.key);
  assert.deepEqual(avecStats, ["f_free_stats", "f_stats_iashark"]);
  const sans = G.offerModel(LIB.build("fr"), { annual: true }).features.map((f) => f.key);
  for (const k of avecStats) assert.ok(!sans.includes(k), k + " : masquee tant que les stats ne partent pas");
  assert.ok(sans.includes("f_stats") && sans.includes("f_pick"), "le reste de la liste ne bouge pas");
  const avec = gridWith([["var STATS_IASHARK = false;", "var STATS_IASHARK = true;"]]).offerModel(LIB.build("fr"), { annual: true }).features.map((f) => f.key);
  for (const k of avecStats) assert.ok(avec.includes(k), k + " : affichee quand les stats partent");
  // Stats du Gratuit : accrochees au match offert (un visiteur, ou un compte
  // gratuit sur un match payant, ne voit que le mur : sansStats).
  const OFFERT = { fr: "match offert", en: "free match", es: "partido gratis", "es-mx": "partido gratis", de: "kostenlosen Spiel", it: "partita gratuita", pt: "jogo gratuito" };
  for (const l of LOCALES) {
    const g = DICTS[l].pricing_grid;
    assert.ok(g.f_free_match.includes(OFFERT[l]) && g.f_free_stats.includes(OFFERT[l]), l + " : stats du Gratuit sur le match offert");
  }
});

test("simulation par tranches de 15 minutes : un seul interrupteur (decision 6), jamais plus que ce qui existe", () => {
  // Les matchs publies avant le branchement du moteur v3 gardent leur analyse
  // d'origine jusqu'au coup d'envoi (lib/pick-freeze.js de la fusion), donc sans
  // simulation, jusqu'au lundi 5/10 au plus tard.
  assert.ok(["mention", "bientot", "ouverte"].includes(G.SIMULATION), "valeur connue");
  assert.equal(G.SIMULATION, "mention", "par defaut : option B, ligne ouverte avec la mention");
  assert.equal(G.SIMULATION_DEPUIS, "2026-10-03");
  const scen = (g, dir) => g.offerModel(LIB.build(dir || "fr"), { annual: true }).features.find((f) => f.key === "f_scenario");
  // B : ouverte, avec « sur les matchs publies depuis le 3 octobre ».
  const b = scen(G);
  assert.ok(b && !b.tag && b.text === "f_scenario_since");
  assert.equal(lineFor("fr")(b), "La simulation du match par tranches de 15 minutes, sur les matchs publiés depuis le 3 octobre");
  for (const l of LOCALES) assert.match(DICTS[l].pricing_grid.f_scenario_since, /\{date\}/, l + " : date de la mention");
  const html = render("fr", { annual: true }).html;
  assert.ok(html.includes(">La simulation du match par tranches de 15 minutes, sur les matchs publiés depuis le 3 octobre<"), "mention sur la carte");
  // Le modele ne modifie jamais la liste du composant (FEATURES reste la liste V3).
  assert.ok(!G.FEATURES.find((f) => f.key === "f_scenario").text && !G.FEATURES.find((f) => f.key === "f_scenario").tag);
  // A : « Bientot dans Pro », sur toutes les versions (la simulation existe
  // deja sur les matchs du moteur v3, partout) ; jamais cochee « Inclus ».
  const A = gridWith([["var SIMULATION = 'mention';", "var SIMULATION = 'bientot';"]]);
  for (const dir of ["fr", "gb", "mx"]) {
    const a = scen(A, dir);
    assert.ok(a && a.tag === "soon" && !a.text, dir + " : bientot");
  }
  const cardA = norm(unesc(A.buildHtml(A.offerModel(LIB.build("gb"), { annual: true }), { cycle: "month" }, textsFor("gb"), ctx())));
  assert.ok(cardA.indexOf("data-pg-soon") > 0 && cardA.indexOf(textsFor("gb")("f_scenario")) > cardA.indexOf("data-pg-soon"), "gb : sous « Bientot dans Pro »");
  // Lundi 5/10 : ouverte, sans mention.
  const o = scen(gridWith([["var SIMULATION = 'mention';", "var SIMULATION = 'ouverte';"]]));
  assert.ok(o && !o.tag && !o.text);
  // Valeur inconnue : le plus prudent (bientot).
  assert.equal(scen(gridWith([["var SIMULATION = 'mention';", "var SIMULATION = 'oui';"]])).tag, "soon");
});

test("bientot : jamais coche « Inclus », regroupe (replie) sous « Bientot dans Pro » sur la carte", () => {
  const { html, model } = render("fr", { annual: true }, { cycle: "month" });
  const soon = model.features.filter((f) => f.tag === "soon");
  assert.ok(soon.length >= 5);
  const t = textsFor("fr");
  // Carte Pro : fonctions ouvertes cochees, puis « Bientot dans Pro » (replie) et les autres, sans coche.
  const card = html.slice(html.indexOf('aria-labelledby="t-pro"'), html.indexOf("</article>", html.indexOf('aria-labelledby="t-pro"')));
  const at = card.indexOf("<details class=\"group mt-4\" data-pg-soon>");
  assert.ok(at > 0, "« Bientot dans Pro » replie");
  assert.match(card.slice(at), /<summary[^>]*>[\s\S]*?<span>Bientôt dans Pro<\/span>/, "titre « Bientot dans Pro »");
  for (const f of soon) assert.ok(card.indexOf(t(f.key)) > at, f.key + " : sous « Bientot dans Pro »");
  for (const k of proOuvertes(G)) assert.ok(card.indexOf(t(k)) > 0 && card.indexOf(t(k)) < at, k + " : ouverte, avant");
  assert.equal((card.slice(at).match(/class="sr-only"> : Inclus</g) || []).length, 0, "aucun « Inclus » sous « Bientot »");
  assert.equal((card.slice(at).match(/class="sr-only"> : pas encore disponible</g) || []).length, soon.length);
});

test("comparateur : seulement sur les pages francaises (seule liste de bookmakers agrees : la France)", () => {
  const BK = JSON.parse(read("config/bookmakers-agrees.json"));
  const withList = Object.keys(BK.pays).filter((c) => Array.isArray(BK.pays[c].bookmakers) && BK.pays[c].bookmakers.length > 0);
  // Espagne (02/10/2026) : liste DGOJ pour le robot et le questionnaire Pro ; le comparateur du site reste
  // francais (lib/cote-anj.js ne lit que la France), donc comparatorOpen ne change pas.
  assert.deepEqual(withList, ["fr", "es"], "si un autre pays recoit une liste, revoir comparatorOpen (assets/pricing-grid.js)");
  for (const dir of DIRS) {
    const { html, model } = render(dir, { annual: true }, { cycle: "month" });
    const has = model.features.some((f) => f.key === "f_comparator");
    assert.equal(has, dir === "fr", dir + " : comparateur");
    assert.equal(html.includes(textsFor(dir)("f_comparator")), dir === "fr", dir + " : texte du comparateur");
    // Chaque fonction du marche apparait UNE fois (une seule liste, aucun doublon).
    for (const f of model.features) assert.equal(html.split(">" + lineFor(dir)(f) + "<").length - 1, 1, dir + " : " + f.key + " une seule fois");
  }
  assert.equal(G.comparatorOpen(LIB.build("")), true, "pages racine (francais, marche euro)");
  for (const d of ["gb", "za", "mx", "en", "es"]) assert.equal(G.comparatorOpen(LIB.build(d)), false, d);
});

test("accessibilite : choix de la duree (boutons radio), icones masquees, prix annonce", () => {
  const { html } = render("fr", { annual: true }, { cycle: "month" });
  // Un seul controle de duree : groupe de boutons radio, un seul arret clavier (tabindex mobile).
  assert.match(html, /<div role="radiogroup" aria-label="Durée de l’abonnement"/);
  assert.equal((html.match(/role="radio" /g) || []).length, 3);
  assert.match(html, /role="radio" aria-checked="true" tabindex="0" data-pg-dur="month"/);
  assert.match(html, /role="radio" aria-checked="false" tabindex="-1" data-pg-dur="week"/);
  assert.match(render("fr", { annual: true }, { cycle: "year" }).html, /role="radio" aria-checked="true" tabindex="0" data-pg-dur="year"/);
  assert.match(render("fr", { annual: true }, { cycle: "month", weekly: true }).html, /role="radio" aria-checked="true" tabindex="0" data-pg-dur="week"/);
  // Chaque duree : cible tactile de 48 px, prix de la duree ecrit dessous.
  assert.match(html, /data-pg-dur="week"\s+class="[^"]*\bmin-h-\[52px\]/);
  assert.match(html, /data-pg-dur="week"[^>]*>[\s\S]*?>6,99 €<\/span>/);
  // Toutes les icones sont decoratives ; le sens est donne en texte (lecteur d'ecran).
  const svgs = html.match(/<svg[^>]*>/g) || [];
  assert.ok(svgs.length >= 6);
  for (const sv of svgs) assert.match(sv, /aria-hidden="true"/);
  assert.match(html, /class="sr-only"> : Inclus</);
  assert.match(html, /class="sr-only"> : pas encore disponible</);
  // Prix annonce aux lecteurs d'ecran quand il change (choix de la duree).
  assert.match(html, /data-pg-price aria-live="polite" aria-atomic="true"/);
  assert.match(render("fr", { annual: true }, null, { variant: "prix" }).html, /data-pg-price aria-live="polite" aria-atomic="true"/);
  // Clavier : fleches, Debut, Fin sur le choix de la duree ; focus visible partout.
  const src = read("assets/pricing-grid.js");
  for (const k of ["ArrowRight", "ArrowLeft", "Home", "End"]) assert.ok(src.includes("'" + k + "'"), k);
  assert.match(src, /focus-visible:outline-cyan/);
  assert.match(src, /prefers-reduced-motion/);
});

test("mise en page : un seul dessin (carte Pro puis Gratuit sur une ligne), bouton sous le choix de la duree, paiement en 2 colonnes", () => {
  const { html, model } = render("fr", { annual: true });
  const t = textsFor("fr");
  const free = html.indexOf('aria-labelledby="t-free"'), pro = html.indexOf('aria-labelledby="t-pro"');
  assert.ok(pro > 0 && free > pro, "carte Pro sur toute la largeur, puis le Gratuit sur une ligne (meme dessin que la page d'abonnement)");
  assert.match(html, /data-pg-layout="cartes"/);
  const tagOf = (i) => html.slice(html.lastIndexOf("<article", i), html.indexOf(">", i));
  assert.match(tagOf(pro), /border-cyan\/50/);
  assert.doesNotMatch(tagOf(pro), /scale-/, "carte Pro plus agrandie (bords decales, texte flou)");
  assert.doesNotMatch(html, /Recommandé/, "plus de pastille « Recommande » sur la seule offre payante");
  // Gratuit : « 0 € », jamais « 0 € / mois » ; ses 3 lignes en 3 colonnes egales sur ordinateur.
  const bande = html.slice(free, html.indexOf("</article>", free));
  assert.doesNotMatch(bande, /\/ mois/);
  assert.match(bande, /lg:grid-cols-3/);
  // Bouton « Devenir Pro » JUSTE sous le choix de la duree et « Meme acces Pro,
  // quelle que soit la duree » (plus pousse en bas de la carte), liste a droite.
  const radios = html.indexOf('role="radiogroup"'), same = html.indexOf("data-pg-same"), cta = html.indexOf("data-pg-cta"), liste = html.indexOf(t("pro_plus"));
  assert.ok(radios > 0 && same > radios && cta > same, "duree, « meme acces », bouton");
  assert.ok(liste > radios && liste < cta, "liste entre les deux dans le HTML (telephone : prix, duree, liste, bouton)");
  assert.doesNotMatch(html, /mt-auto/, "aucun bouton pousse en bas");
  assert.match(html, /md:row-span-2 md:row-start-1/, "liste a droite, sur toute la hauteur (ordinateur)");
  // Lignes Pro ouvertes le 3/10 (selon les interrupteurs STATS_IASHARK et
  // SIMULATION), les memes partout. Mur Pro (match-page.js#LISTE_PRO) : toute
  // la liste V3, meme ordre, memes textes ; il n'affiche que ce que CE match a.
  const open = model.features.filter((f) => f.pro && !f.free && f.tag !== "soon").map((f) => f.key);
  assert.deepEqual(open, proOuvertes(G));
  assert.deepEqual(G.FEATURES.filter((f) => f.pro && !f.free && !f.tag).map((f) => f.key), PRO_V3);
  const mp = read("match-page.js");
  assert.deepEqual([...mp.slice(mp.indexOf("const LISTE_PRO=["), mp.indexOf("];", mp.indexOf("const LISTE_PRO=["))).matchAll(/\['(f_\w+)','((?:[^'\\]|\\.)*)'\]/g)].map((m) => [m[1], m[2]]), PRO_V3.map((k) => [k, G.FALLBACK[k]]), "mur Pro : meme liste, meme ordre, memes textes");
  assert.doesNotMatch(mp, /pro_gate_item_odds/, "plus de « Nos probabilites face aux cotes »");
  assert.doesNotMatch(JSON.stringify(G.FALLBACK), /face aux cotes/);
  // Une seule liste : la carte Gratuite montre ce qui est gratuit (sans croix),
  // la carte Pro ce que Pro ajoute ; plus de tableau, d'onglets ni d'interrupteur.
  const freeCard = html.slice(free, html.indexOf("</article>", free));
  for (const f of model.features) assert.equal(freeCard.includes(">" + lineFor("fr")(f) + "<"), !!f.free, f.key + " : carte Gratuite");
  assert.doesNotMatch(html, /Non inclus|<table|role="tablist"|role="switch"/);
  // Page de paiement : a gauche le prix puis la liste ; a droite la duree puis
  // le paiement de la page (plus de trou sous le bouton : controle du 30/09/2026).
  const co = render("fr", { annual: true }, null, { checkout: true }).html;
  assert.match(co, /data-pg-layout="paiement"/);
  assert.match(co, /data-pg-slot/);
  assert.match(co, /data-pg-place-durations/, "« Meme acces » sous le choix de la duree");
  assert.ok(co.indexOf('aria-labelledby="t-pro"') < co.indexOf('aria-labelledby="t-free"'), "Pro puis Gratuit");
  assert.doesNotMatch(co, /data-pg-cta(?![-\w])/);
  const at = (s) => co.indexOf(s);
  assert.ok(at("data-pg-amount") < at('role="radiogroup"') && at('role="radiogroup"') < at(t("pro_plus")) && at(t("pro_plus")) < at("data-pg-slot"), "prix, duree, liste, paiement");
  assert.match(co, /md:col-start-2 md:row-start-2 flex flex-col[^"]*md:justify-center[^"]*" data-pg-cta-box>/, "paiement a droite, centre en hauteur");
  assert.doesNotMatch(co.slice(at("<article"), at('aria-labelledby="t-free"')), /md:border-l/, "pas de trait vertical qui fait ressortir un trou");
  // Une seule duree payable (gb) : prix et liste a gauche, paiement a droite sur toute la hauteur.
  const gbco = render("gb", { annual: true }, null, { checkout: true }).html;
  assert.match(gbco, /md:col-start-2 md:row-span-2 md:row-start-1 flex flex-col[^"]*" data-pg-cta-box>/);
  // La page a sa phrase sous la duree (abonnement : #proCommitment) : pas de doublon.
  assert.doesNotMatch(render("fr", { annual: true }, null, { checkout: true, ownNote: true }).html, /data-pg-same/);
  assert.match(co, /data-pg-same>Même accès Pro, quelle que soit la durée</);
  // Ailleurs : le bouton mene au parcours d'abonnement existant, avec la duree choisie.
  assert.match(html, /href="\/abonnement\.html\?interval=month" data-pg-cta/);
  assert.match(render("fr", { annual: true }, { cycle: "year" }).html, /href="\/abonnement\.html\?interval=year"/);
  assert.match(render("fr", { annual: true }, { cycle: "month", weekly: true }).html, /href="\/abonnement\.html\?interval=week"/);
  // Page d'abonnement : plus de liste « Tout ce que Pro debloque » sous la grille (elle repetait la carte Pro).
  for (const d of [""].concat(DIRS.map((x) => x + "/"))) assert.doesNotMatch(read(d + "abonnement.html"), /pro-list-card|data-group=/, d + "abonnement.html");
});

test("marche ferme au paiement : ni prix Pro, ni interrupteur, ni bouton, la ligne « pas encore ouvert »", () => {
  const market = LIB.build("gb");
  market.checkoutOpen = [];
  const model = G.offerModel(market, { annual: true });
  assert.equal(model.closed, true);
  const html = norm(unesc(G.buildHtml(model, { cycle: "month" }, textsFor("gb"), ctx({ trialDays: 7 }))));
  assert.doesNotMatch(html, /£14\.99|£4\.99|£149|data-pg-dur|data-pg-cta(?![-\w])|data-pg-footer-trial/);
  assert.ok(html.includes(DICTS.en.pricing_grid.closed));
  for (const v of ["ligne", "prix", "carte"]) {
    const h = G.buildHtml(model, { cycle: "month" }, textsFor("gb"), ctx({ variant: v }));
    assert.doesNotMatch(h, /£14\.99|data-pg-cta(?![-\w])/, v);
  }
});

test("variantes compactes : ligne (mur Pro), carte, prix (compte), rappel (retour de paiement)", () => {
  const t = textsFor("fr");
  const model = G.offerModel(LIB.build("fr"), { annual: true });
  const ligne = norm(unesc(G.buildHtml(model, { cycle: "month" }, t, ctx({ variant: "ligne", ctaLabel: "Débloquer avec Pro", href: (iv) => "/abonnement.html?next=%2Fmatch.html%3Fid%3D1&interval=" + iv }))));
  // Ligne de prix courte (telephone : « semaine » n'est plus seul sur sa ligne).
  assert.match(ligne, /<span class="whitespace-nowrap"><b[^>]*>19,95 €<\/b> <span class="text-soft">\/ mois<\/span><\/span> <span class="whitespace-nowrap text-soft">· ou 6,99 € \/ semaine<\/span>/);
  assert.doesNotMatch(ligne, /IASHARK Pro<\/span> ·/);
  assert.match(ligne, /Débloquer avec Pro/);
  assert.match(ligne, /next=%2Fmatch\.html%3Fid%3D1&interval=month/, "retour au match conserve");
  assert.doesNotMatch(G.buildHtml(model, { cycle: "month" }, t, ctx({ variant: "ligne", noCta: true })), /data-pg-cta/, "rappel sans bouton");
  const prix = G.buildHtml(model, { cycle: "month" }, t, ctx({ variant: "prix" }));
  assert.match(prix, /role="radiogroup"/);
  assert.doesNotMatch(prix, /<article|data-pg-cta/, "le compte garde sa carte et son bouton");
  const carte = G.buildHtml(model, { cycle: "month" }, t, ctx({ variant: "carte" }));
  assert.match(carte, /aria-labelledby="t-pro"/);
  assert.doesNotMatch(carte, /aria-labelledby="t-free"/);
  const rappel = norm(unesc(G.buildHtml(model, { cycle: "month" }, t, ctx({ variant: "rappel", interval: "year", trialEnd: "2026-10-07T10:00:00Z" }))));
  assert.match(rappel, /Essai gratuit en cours jusqu’au 7 octobre : rien n’est prélevé avant\. Ensuite, 199 € \/ an/);
  const paye = norm(unesc(G.buildHtml(model, { cycle: "month" }, t, ctx({ variant: "rappel", interval: "week" }))));
  assert.match(paye, /6,99 € \/ semaine · résiliable/);
  // Duree du compte sans prix dans ce marche : rien, jamais le prix d'une autre duree.
  assert.equal(G.buildHtml(G.offerModel(LIB.build("za"), {}), { cycle: "month" }, t, ctx({ variant: "rappel", interval: "year" })), "");
});

test("disponibilites : une requete par marche, marche pays envoye, regle des pages de paiement", async () => {
  const bodies = [];
  const win = {
    IasharkApp: { url: "https://x.supabase.co", key: "anon" },
    fetch: async (url, init) => { bodies.push(JSON.parse(init.body)); return { json: async () => ({ mode: "availability", intervals: { week: true, month: true, year: false }, trial_days: 7 }) }; }
  };
  const g = loadGrid(win);
  const gb = LIB.build("gb");
  const r1 = await g.fetchAvailability(gb);
  const r2 = await g.fetchAvailability(gb);
  assert.deepEqual(bodies, [{ mode: "availability", market: "gb" }], "une seule requete par marche et par page");
  assert.equal(r1.trialDays, 7);
  assert.equal(r2, r1);
  await g.fetchAvailability(LIB.build("fr"));
  assert.deepEqual(bodies[1], { mode: "availability" }, "marche EUR par defaut : aucun champ market");
  // Sans App (page sans app-client.js) : aucune requete, configuration seule.
  const none = loadGrid({});
  const r = await none.fetchAvailability(gb);
  assert.deepEqual(r, { asked: false, intervals: null, trialDays: null });
  assert.equal(none.availabilityFrom(r, gb, true), null);
  // Reponse sans disponibilites (ancienne fonction) : paiement = mensuel du marche par defaut seul.
  assert.deepEqual(none.availabilityFrom({ asked: true, intervals: null }, LIB.build("fr"), true), { week: false, month: true, year: false });
  assert.deepEqual(none.availabilityFrom({ asked: true, intervals: null }, gb, true), { week: false, month: false, year: false });
  assert.equal(none.availabilityFrom({ asked: true, intervals: null }, gb, false), null, "page d'information : la configuration decide");
});

test("branchement : chaque endroit qui affiche un prix charge la grille (toutes les versions)", () => {
  const PAGES = {
    "abonnement.html": /id="pricingGrid"/,
    "index.html": /data-pricing-grid="complet"[^>]*data-pg-annual="true"/,
    "compte.html": /<script src="\/assets\/pricing-grid\.js"><\/script>/,
    "pro.html": /<script src="\/assets\/pricing-grid\.js"><\/script>/,
    "checkout-succes.html": /id="rappelOffre"/,
    "checkout-annule.html": /id="rappelOffre"/,
    "landing.html": /data-pricing-grid="complet"/
  };
  for (const [file, re] of Object.entries(PAGES)) {
    for (const d of [""].concat(DIRS.map((x) => x + "/"))) {
      const f = d + file;
      if (file === "landing.html" && d && MARKETS._dirs[d.slice(0, -1)].customLanding) continue;
      const html = read(f);
      assert.match(html, /\/assets\/pricing-grid\.js/, f + " : composant non charge");
      assert.match(html, re, f + " : emplacement de la grille");
    }
  }
  for (const d of ["gb", "za", "mx"]) {
    const html = read(d + "/landing.html");
    assert.match(html, /<script src="\/assets\/pricing-grid\.js"><\/script>/, d);
    assert.match(html, /id="pricingGrid"/, d);
    assert.match(html, /<link rel="stylesheet" href="\/assets\/tailwind\.css">/, d);
  }
  // Mur Pro des pages match (variante compacte, script charge a la demande sur les pages statiques).
  const mp = read("match-page.js");
  assert.match(mp, /data-pricing-grid="ligne" data-pg-href="\$\{esc\(o\.href\)\}" data-pg-track="match_gate_unlock"/);
  assert.match(mp, /s\.src='\/assets\/pricing-grid\.js'/);
  assert.match(mp, /if\(!o\.free\)monterGrillePrix\(\);/);
  // Espace Pro (compte gratuit) et compte.
  assert.match(read("pro-dashboard.js"), /data-pricing-grid="ligne"/);
  assert.match(read("pro-dashboard.js"), /IasharkPricingGrid\.mountAll\(panneau\)/);
  // Compte : la carte de la page d'abonnement telle quelle (paiement deplace dans la carte, Gratuit « Ton offre actuelle »).
  assert.match(read("account-page.js"), /window\.IasharkPricingGrid\.mount\(el, Object\.assign\(\{ variant: 'complet', heading: false, annual: true, checkout: true, session: false, loggedIn: true,/);
  // Pages de retour : duree choisie gardee avant Stripe, rappel de l'offre, titre honnete pendant l'essai.
  assert.match(read("abonnement-page.js"), /sessionStorage\.setItem\('iashark\.checkout\.interval',body\.interval\)/);
  // Titre honnete (controle du 30/09, ronde 2) : neutre par defaut, puis
  // « Essai active, rien n'a ete preleve » (pro_trial.success_title_trial).
  assert.match(read("checkout-succes.html"), /pro_trial\.success_title_trial/);
  assert.match(read("checkout-succes.html"), /variant:'rappel'/);
  // Styles : classes du composant compilees (Tailwind), remise a zero limitee a .pg-root.
  assert.match(read("tailwind.config.js"), /"\.\/assets\/pricing-grid\.js"/);
  const css = read("assets/tailwind.css");
  assert.match(css, /\.pg-root/);
  assert.match(css, /aria-checked\\:bg-cyan/);
  assert.match(css, /group-open\\:rotate-180/);
  assert.match(css, /md\\:grid-rows-\\\[auto_1fr\\\]/);
  assert.match(css, /md\\:grid-cols-\\\[minmax\\\(0\\2c 1fr\\\)_minmax\\\(0\\2c 1\\\.15fr\\\)\\\]/);
  // Ligne de confiance : une ligne ou une colonne selon la largeur de SA colonne ; « (obligatoire) » jamais seul.
  assert.match(css, /@container \(min-width:\s?430px\)\{\.pg-root \.pg-trust\{flex-direction:row/);
  assert.match(css, /\.pg-root \.iash-consent-req\{white-space:nowrap\}/);
  // Police de la page hote (jamais une troisieme police), consentement sans case dans la carte Pro.
  assert.match(css, /\.pg-root\{font-family:inherit;/);
  assert.match(css, /\.pg-root \.iash-consent\{[^}]*border:0/);
  // Direction visuelle : aucune police a chasse fixe dans le composant.
  assert.doesNotMatch(read("assets/pricing-grid.js"), /Space Mono|font-mono|uppercase/);
});

test("plus aucune mise ni esperance dans la grille (decision de Clement du 30/09/2026)", () => {
  // Il n'est pas conseiller. Ni
  // calculateur de mise, ni capital, ni unites, ni esperance, dans aucune
  // langue, ni dans le code (repli francais), ni dans les dictionnaires.
  const src = fs.readFileSync(path.join(ROOT, "assets/pricing-grid.js"), "utf8");
  assert.ok(!G.FEATURES.some((f) => f.key === "f_stake"), "calculateur de mise retire");
  assert.doesNotMatch(src, /f_stake|'Le calculateur de mise'/);
  const INTERDIT = /\b(mises?|miser|capital|bankroll|unités?|units?|espérance|expected value|stake|importe|monto|montante|Einsatz\w*|puntata|esperanza|valor esperado|valore atteso|Erwartungswert)\b/i;
  for (const l of LOCALES) {
    const g = DICTS[l].pricing_grid;
    assert.equal(g.f_stake, undefined, l + " : cle f_stake retiree");
    for (const f of G.FEATURES) assert.doesNotMatch(g[f.key] + " " + (g.f_scenario_since || ""), INTERDIT, l + " " + f.key);
    const part = JSON.parse(fs.readFileSync(path.join(ROOT, "i18n/parts/pricing_grid." + l + ".json"), "utf8")).pricing_grid;
    assert.equal(part.f_stake, undefined, l + " : part sans f_stake");
  }
  // Pas de ligne « historique public » : aucun historique publie sur le site
  // du 3/10 (results/ hors du build public, tests/results-prives.test.js).
  assert.ok(!G.FEATURES.some((f) => /histor/i.test(f.key)), "pas de ligne historique");
  for (const l of LOCALES) assert.doesNotMatch(JSON.stringify(DICTS[l].pricing_grid), /historique public|public (track )?record|historial público/i, l);
  const build = fs.readFileSync(path.join(ROOT, "scripts/build-public.js"), "utf8");
  assert.ok(!/"results"/.test(build.split("\n").find((x) => /^const PUBLIC_DIRS\s*=/.test(x)) || ""), "si l'historique est publie un jour, ajouter la ligne");
});
