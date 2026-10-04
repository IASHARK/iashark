"use strict";
// « Ce que Pro donne », partout pareil (decision du proprietaire du 19/09/2026).
// Un visiteur qui hesite a payer doit VOIR concretement ce que Pro ouvre :
//   - page d'abonnement : a cote du prix, la liste complete en 3 groupes
//     (chaque match, chaque jour, outils) ; plus de tableau « Gratuit ou Pro »
//     (retire a la demande du proprietaire le 19/09/2026) ;
//   - mur Pro de la page match : les 7 lignes du match + une ligne « en plus »
//     + prix mensuel du marche pres du bouton (match-page.js#proGate) ;
//   - compte gratuit : la meme liste, en compact (account-page.js#listePro).
// Le verrou « Buteurs du jour » de l'accueil reste tel quel (choix du
// proprietaire du 19/09/2026).
// Une seule source de textes : cles pro_offer.* (+ match_page.pro_gate_item_*)
// dans les 7 dictionnaires. Durees non payables masquees sur la page
// d'abonnement ; aucune duree payable = ni bouton ni consentement.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const MARKETS = JSON.parse(read("config/markets.json"));
// 25/09/2026 : pages generees des repertoires publics (de/it/pt retires, 301 vers /en/).
const DIRS = require("./helpers/public-dirs.js").PUBLIC_DIRS;
const LEAGUES = JSON.parse(read("config/leagues.json")).leagues;
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
const MATCH_KEYS = ["pro_gate_item_bet", "pro_gate_item_scorer", "pro_gate_item_scenario", "pro_gate_item_scores", "pro_gate_item_odds", "pro_gate_item_stats", "pro_gate_item_faq"];
const OFFER_KEYS = ["list_title", "group_match", "group_daily", "group_tools", "daily_all_matches", "daily_scorers", "badge_new", "tool_scanner", "tool_journal", "tool_combo",
  "free_matches", "free_tools", "match_more", "price_month", "price_week_month"];
const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

test("i18n : pro_offer.* complet et identique dans les 7 dictionnaires et leurs parts, sans promesse ni « pari conseille »", () => {
  for (const l of LOCALES) {
    const d = DICTS[l].pro_offer;
    assert.deepEqual(Object.keys(d || {}).sort(), OFFER_KEYS.slice().sort(), l + " : cles pro_offer");
    const part = JSON.parse(read("i18n/parts/site." + l + ".json"));
    assert.deepEqual(part.pro_offer, d, l + " : part site." + l + ".json et dictionnaire identiques");
    assert.equal(part.pro_plans.closed, DICTS[l].pro_plans.closed, l + " : pro_plans.closed");
    assert.ok(!("unavailable" in DICTS[l].pro_plans) && !("unavailable" in part.pro_plans), l + " : plus de « Bientot disponible »");
    for (const k of OFFER_KEYS) assert.ok(typeof d[k] === "string" && d[k].trim(), l + " pro_offer." + k);
    for (const k of MATCH_KEYS) assert.ok(DICTS[l].match_page[k], l + " match_page." + k);
    assert.equal((d.price_month.match(/\{price\}/g) || []).length, 1, l + " : {price} une fois");
    assert.equal((d.price_week_month.match(/\{week\}/g) || []).length, 1, l + " : {week} une fois");
    assert.equal((d.price_week_month.match(/\{month\}/g) || []).length, 1, l + " : {month} une fois");
    // Nombre de competitions = config/leagues.json (jamais un chiffre invente).
    for (const k of ["daily_all_matches"]) {
      assert.deepEqual(d[k].match(/\d+/g), [String(LEAGUES.length)], l + " pro_offer." + k + " : " + LEAGUES.length + " competitions");
    }
    const all = JSON.stringify([d, DICTS[l].pro_plans.closed]);
    assert.doesNotMatch(all, /pari (conseillé|recommandé)|recommended bet|apuesta recomendada|empfohlene Wette|scommessa consigliata|aposta recomendada/i, l);
    assert.doesNotMatch(all, /\b(sûrs?|gagnants?|garanti(e|s|es)?|guaranteed?|garantizad[oa]s?|garantiert|garantit[oa]|ROI|rentab\w*|profit\w*|bénéfices?|winnings?|winners?)\b/i, l + " : aucune promesse de gain");
    assert.doesNotMatch(all, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, l + " : aucun emoji");
    assert.doesNotMatch(all, /\bEdge\b/, l);
  }
  // Suivi de bankroll : simulateur de capital, calculateur de mise et capital
  // enregistre sont GRATUITS (tools-page.js, sans verrou Pro) ; seul le journal
  // synchronise (insertion reservee au plan pro, migration 0010) est Pro.
  assert.match(DICTS.fr.pro_offer.free_tools, /Calculateur de mise, cote juste, simulateur de capital/);
  assert.doesNotMatch(JSON.stringify(DICTS.fr.pro_offer), /Suivi de bankroll/i);
  assert.match(read("supabase/migrations/0010_user_workspace.sql"), /create policy betting_decisions_insert_pro[\s\S]{0,200}u\.plan='pro'/);
  assert.doesNotMatch(read("tools-page.js").slice(read("tools-page.js").indexOf("function rendreBankroll"), read("tools-page.js").indexOf("05 — COMBO AUDITOR")), /ctx\.isPro/, "le simulateur de capital n'est pas verrouille");
});

// ------------------------------------------------------------------------
// 04/10/2026 (demande de Clement : « mal forme, deux blocs ; appel a l'action
// direct en haut, quelques phrases sur ce qu'il y a dans le Pro ») : UN SEUL
// composant de paiement (lib/offre-pro.js), le meme sur le match bloque, la page
// abonnement, l'accueil et le compte. Les anciennes listes (3 groupes, mur Pro a
// 7 lignes, listePro du compte) sont retirees. Ces tests gardent les regles qui
// comptent : durees payables seulement, ordre de deploiement, aucun bouton mort,
// une seule source de prix, textes dans les 7 langues.
const OP = require("../lib/offre-pro.js");
function marche(dir, reopened) {
  const mk = {};
  new Function("window", read("lib/market-config.js"))(mk);
  const m = mk.IasharkMarketConfig.build(dir);
  if (reopened) m.checkoutOpen = null;
  return m;
}
const ids = (l) => l.map((x) => x.interval);

test("page d'abonnement : une colonne, le composant de paiement unique, ni tableau ni dessin fait main", () => {
  const html = read("abonnement.html");
  assert.doesNotMatch(html, /pro-compare|class="cmp"|\.cmp[\s{.,]|compare_(title|col_|row_|matches_|scorers_|tools_)/);
  for (const l of LOCALES) assert.deepEqual(Object.keys(DICTS[l].pro_offer).filter((k) => /^compare_/.test(k)), [], l + " : cles du tableau retirees");
  assert.doesNotMatch(html, /pricing-layout|pro-list-card|ab-inc|ab-tile|<svg/, "deux blocs ou vignettes dessinees a la main");
  assert.match(html, /<div id="offrePro">/);
  assert.match(html, /\.pricing-page\{width:min\(560px,calc\(100% - 32px\)\)/);
  assert.match(html, /<script src="\/lib\/checkout-consent\.js"><\/script><script src="\/lib\/icones\.js"><\/script><script src="\/lib\/composants\.js"><\/script><script src="\/lib\/offre-pro\.js"><\/script><script src="\/abonnement-page\.js" defer><\/script>/);
  const js = read("abonnement-page.js");
  assert.match(js, /IasharkOffrePro\.mount\(boite,\{\s*mode:'paiement'/);
  assert.match(js, /duree:window\.IasharkOffrePro\.dureeValide\(params\.get\('duree'\)\)/, "duree choisie gardee (liste blanche)");
  assert.doesNotMatch(js.replace(/\/\/.*$/gm, ""), /BLEUS|CAIRO5|promo/i, "promo expiree du 25/09 retiree");
  // Ce que Pro donne : 3 ou 4 phrases ; comment on paie : carte, Stripe, sans engagement, resiliable.
  const plans = [{ interval: "month", amount: 19.95, text: "19,95 €", open: true }, { interval: "year", amount: 199, text: "199 €", open: true }];
  const h = OP.html({ mode: "vitrine", contexte: "general", plans, choisi: "month", jours: 0, connecte: false, uid: "a" });
  const phrases = (h.match(/<ul class="op-benefits">([\s\S]*?)<\/ul>/) || ["", ""])[1].match(/<li>/g) || [];
  assert.ok(phrases.length >= 3 && phrases.length <= 4, "3 ou 4 phrases");
  for (const x of ["Carte bancaire", "Paiement sécurisé par Stripe", "Sans engagement", "Résiliable en ligne à tout moment"]) assert.ok(h.includes(x), x);
  assert.equal((h.match(/class="mu-shimmer op-cta"/g) || []).length, 1, "un seul gros bouton");
  const an = OP.html({ mode: "vitrine", contexte: "general", plans, choisi: "year", jours: 0, connecte: false, uid: "b" });
  assert.doesNotMatch(an.slice(an.indexOf('data-op-pay')), /Sans engagement/, "annuel : jamais « sans engagement » (CGV art. 6)");
});

test("pages generees : textes du composant traduits dans les versions publiques, prix cuit dans le HTML", () => {
  const src = read("abonnement.html");
  const keys = [...src.matchAll(/data-i18n="(offre_pro\.\w+)"/g)].map((m) => m[1]);
  assert.ok(keys.length >= 6, keys.join(" "));
  const get = (d, k) => k.split(".").reduce((o, p) => (o ? o[p] : undefined), d);
  for (const dir of DIRS) {
    const loc = MARKETS._dirs[dir].locale;
    const page = read(dir + "/abonnement.html");
    for (const k of keys) {
      const v = get(DICTS[loc], k);
      assert.ok(typeof v === "string" && v.trim(), loc + " " + k);
      const re = new RegExp('data-i18n="' + k.replace(".", "\\.") + '"[^>]*>([^<]*)<');
      const vu = (page.match(re) || [])[1];
      assert.ok(vu !== undefined && (vu === escHtml(v) || dir === "fr"), dir + " : " + k + " non traduit");
    }
  }
  assert.match(read("gb/abonnement.html"), /data-market-price="pro\.month"[^>]*>£14\.99</);
  assert.match(read("mx/abonnement.html"), /data-market-price="pro\.month"[^>]*>MX\$199</);
  assert.match(read("za/abonnement.html"), /data-market-price="pro\.month"[^>]*>R\s?199</);
});

test("lib/offre-pro.js : durees payables seulement, ordre de deploiement, aucune = ni bouton ni consentement", () => {
  const ALL = { intervals: { week: true, month: true, year: true } };
  const EXPECT = { fr: ["week", "month", "year"], mx: ["week", "month", "year"], za: ["week", "month"], gb: ["month"], en: ["week", "month"] };
  for (const [dir, ivs] of Object.entries(EXPECT)) {
    const m = marche(dir);
    assert.deepEqual(ids(OP.plans(m, ALL)), ivs, dir);
    // Corps EXACT de la demande de disponibilites : jamais market:'fr'.
    assert.deepEqual(OP.corpsDisponibilite(m), m.checkoutMarket && m.checkoutMarket !== "fr" ? { mode: "availability", market: m.checkoutMarket } : { mode: "availability" }, dir);
  }
  assert.deepEqual(OP.corpsDisponibilite(marche("fr")), { mode: "availability" }, "France : jamais de champ market");
  // Fonction deployee plus ancienne que le site (aucune disponibilite) : FR =
  // mensuel seul, marches pays = aucun paiement (meme regle que pro-plan-picker).
  assert.deepEqual(ids(OP.plans(marche("fr"), OP.dispoHistorique(marche("fr")))), ["month"]);
  assert.deepEqual(ids(OP.plans(marche("fr", true), OP.dispoHistorique(marche("fr", true)))), ["month"]);
  for (const dir of ["gb", "mx", "za", "en"]) assert.deepEqual(ids(OP.plans(marche(dir, true), OP.dispoHistorique(marche(dir, true)))), [], dir);
  // Le serveur ferme une duree : masquee ; jamais rouverte si la configuration la ferme.
  assert.deepEqual(ids(OP.plans(marche("gb", true), { intervals: { week: false, month: true, year: true } })), ["month", "year"]);
  assert.deepEqual(ids(OP.plans(marche("gb"), ALL)), ["month"], "gb : semaine et annee fermees par la configuration");
  // Tout ferme : ligne « pas encore ouvert », ni prix, ni bouton, ni consentement.
  const none = OP.html({ mode: "paiement", contexte: "general", plans: [], choisi: null, jours: 0, connecte: true, uid: "z" });
  assert.match(none, /class="op-closed"/);
  assert.doesNotMatch(none, /subscribeButton|checkoutConsent|op-cta|data-op-pay|€|£|MX\$/);
  // Essai : OUVERT depuis le 04/10/2026, 16 h (decision de Clement, CGV du 04/10 a l'appui),
  // seulement si le serveur l'accorde sur le mois ; ferme, jamais ecrit.
  assert.equal(OP.OUVERT.essai, true);
  assert.equal(OP.essaiOuvert({ trial_days: 7, trial_intervals: ["month"] }), 7);
  assert.equal(OP.essaiOuvert({ trial_days: 7, trial_intervals: ["year"] }), 0);
  assert.equal(OP.essaiOuvert(OP.dispoHistorique(marche("fr"))), 0);
  OP.OUVERT.essai = false;
  try {
    assert.equal(OP.essaiOuvert({ trial_days: 7, trial_intervals: ["month"] }), 0);
  } finally { OP.OUVERT.essai = true; }
  // ?duree= en liste blanche.
  assert.equal(OP.dureeValide("year"), "year");
  assert.equal(OP.dureeValide("<script>"), null);
  assert.equal(OP.defaut([{ interval: "week" }, { interval: "month" }], "decade"), "month");
});

test("compte gratuit : le meme composant de paiement, paiement direct, jamais de bouton mort", () => {
  const js = read("account-page.js");
  assert.match(js, /IasharkOffrePro\.mount\(\$\('offreCompte'\), \{ mode: 'paiement', contexte: 'general', connecte: true \}\)/);
  assert.match(js, /<div id="offreCompte"><\/div>/);
  assert.doesNotMatch(js, /function listePro\(\)/, "ancienne liste retiree (une seule source : le composant)");
  for (const d of [""].concat(DIRS.map((x) => x + "/"))) {
    const html = read(d + "compte.html");
    const at = (x) => html.indexOf(x);
    for (const src of ["/lib/checkout-consent.js", "/lib/icones.js", "/lib/composants.js", "/lib/offre-pro.js", "/lib/aujourdhui.js"]) assert.ok(at('<script src="' + src + '"></script>') > 0, d + "compte.html : " + src);
    assert.ok(at('<script src="/lib/offre-pro.js"></script>') < at('<script src="/account-page.js"'), d + "compte.html : composant apres le script de page");
  }
});

test("landings gb, mx, za : aucune duree payable = ni bouton de paiement ni consentement, ligne « pas encore ouvert »", () => {
  for (const d of ["gb", "mx", "za"]) {
    const js = read(d + "/" + d + "-page.js");
    assert.match(js, /IasharkProPlanPicker\.mount\(document\.getElementById\("proPlanPicker"\), \{ onUpdate: offerUpdate \}\)/, d);
    assert.match(js, /function offerUpdate\(visible\) \{\s*var closed = !visible \|\| visible\.length === 0;\s*\["subscribeProBtn", "checkoutConsent", "proMsg"\]\.forEach/, d);
    assert.match(js, /el\.style\.display = closed \? "none" : "";/, d + " : .block Tailwind masque aussi");
    const html = read(d + "/landing.html");
    for (const id of ["subscribeProBtn", "checkoutConsent", "proMsg", "proPlanPicker"]) assert.match(html, new RegExp('id="' + id + '"'), d + " " + id);
  }
});
