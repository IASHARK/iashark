"use strict";
// « Ce que Pro donne », partout pareil (decision du proprietaire du 19/09/2026).
// Un visiteur qui hesite a payer doit VOIR concretement ce que Pro ouvre :
//   - page d'abonnement : la carte Pro de la grille de prix (30/09/2026) porte
//     la seule liste (« Tout le Gratuit, et en plus », « Bientot dans Pro ») ;
//     la liste en 3 groupes sous la grille est retiree (elle repetait la carte
//     Pro : « des grosses cases en bas », Clement, 30/09/2026) ; plus de
//     tableau « Gratuit ou Pro » (retire le 19/09/2026) ;
//   - mur Pro de la page match : la MEME liste que la carte Pro de la grille
//     (match-page.js#LISTE_PRO, controle des captures du 30/09/2026) + prix du
//     marche pres du bouton (match-page.js#proGate) ;
//   - compte gratuit : la carte Pro de la page d'abonnement telle quelle
//     (assets/pricing-grid.js, variante complete avec paiement).
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
  // Espace Pro (29/09/2026) : le journal de paris et le garde-fou sont
  // GRATUITS (tableau de bord gratuit). Plus de calculateur de mise ni de
  // simulateur de capital (decision de Clement du 30/09/2026 : aucune mise).
  assert.equal(DICTS.fr.pro_offer.free_tools, "Ton journal de paris et ton garde-fou");
  for (const l of Object.keys(DICTS)) assert.doesNotMatch(DICTS[l].pro_offer.free_tools, /mise|stake|importe|monto|montante|Einsatz|puntata|capital/i, l);
  assert.doesNotMatch(JSON.stringify(DICTS.fr.pro_offer), /Suivi de bankroll/i);
  // Controle de l'avocat du diable (30/09/2026) : la liste « Tout ce que Pro
  // debloque » suit la grille de prix (assets/pricing-grid.js). Journal, bilan
  // et garde-fou sont GRATUITS : jamais vendus comme Pro. Programme du jour,
  // qualite des cotes, alertes, Canal Pro et robot ne sont pas ouverts : le
  // groupe dit « bientot ». Comparateur (France seulement, bientot) : aucune
  // « meilleure cote chez tes bookmakers » dans la liste.
  for (const l of LOCALES) {
    const d = DICTS[l].pro_offer, g = DICTS[l].pricing_grid;
    assert.ok(d.group_tools.toLowerCase().includes(g.tag_soon.toLowerCase()), l + " : groupe « outils » = « " + g.tag_soon + " »");
    assert.equal(d.tool_scanner, g.f_programme, l + " : programme = texte de la grille");
    assert.equal(d.tool_journal, g.f_quality, l + " : qualite des cotes = texte de la grille");
  }
  const toolsFr = [DICTS.fr.pro_offer.tool_scanner, DICTS.fr.pro_offer.tool_journal, DICTS.fr.pro_offer.tool_combo].join(" | ");
  assert.doesNotMatch(toolsFr, /journal|bilan|garde-fou|tableau de bord|bookmaker|meilleure cote|comparateur|combiné/i);
  const toolsEn = [DICTS.en.pro_offer.tool_scanner, DICTS.en.pro_offer.tool_journal, DICTS.en.pro_offer.tool_combo].join(" | ");
  assert.doesNotMatch(toolsEn, /dashboard|results|safety|bookmaker|best odds|comparison|accumulator/i);
  // Migration de l'espace Pro : 0033 dans le depot, renommee 0041 par l'agent
  // Espace Pro (30/09/2026) : le test lit celle qui existe.
  const migPro = ["supabase/migrations/0041_pro_accueil.sql", "supabase/migrations/0033_pro_accueil.sql"].find((f) => fs.existsSync(path.join(ROOT, f)));
  assert.ok(migPro, "migration de l'espace Pro introuvable (0041 ou 0033)");
  assert.match(read(migPro), /drop policy if exists betting_decisions_insert_pro[\s\S]*create policy betting_decisions_insert_own[^;]*\(select auth\.uid\(\)\) = user_id\);/);
  assert.doesNotMatch(read("tools-page.js"), /function rendreBankroll/, "simulateur de capital retire (remplace par le garde-fou)");
});

test("page d'abonnement : la grille de prix seule (une seule liste), paiement dans la carte Pro, sans ancien tableau « Gratuit ou Pro »", () => {
  const html = read("abonnement.html");
  const at = (s) => html.indexOf(s);
  // Ancien tableau « Gratuit ou Pro » (retire le 19/09/2026) : ni balisage, ni styles, ni cles.
  assert.doesNotMatch(html, /pro-compare|class="cmp"|\.cmp[\s{.,]|compare_(title|col_|row_|matches_|scorers_|tools_)/);
  for (const l of LOCALES) assert.deepEqual(Object.keys(DICTS[l].pro_offer).filter((k) => /^compare_/.test(k)), [], l + " : cles du tableau retirees");
  // Grille de prix (hote #pricingGrid) sous l'introduction ; plus de liste « Tout ce que Pro debloque »
  // sous la grille (30/09/2026 : elle repetait la carte Pro, une seule liste).
  assert.ok(at('class="pricing-intro"') < at('<section class="pricing-grid-section"'));
  assert.ok(at('id="pricingGrid"') > 0);
  assert.doesNotMatch(html, /pro-list-card|pro-list-section|data-group=|feature-list|data-france-seulement/);
  assert.doesNotMatch(html, /pricing-layout|id="proPlanPicker"/, "ancienne mise en page 2 colonnes retiree");
  // Annuel (CGV : 12 mois payes d'avance) : « Sans engagement » masque par la grille.
  assert.match(html, /<span data-pg-hide-year>◇ <span data-i18n="pricing_page\.trust_no_commitment">/);
  // Anciennes listes vagues retirees (aucun doublon).
  assert.doesNotMatch(html, /pro_feat_|free_feat_|free_heading|unlock_(title|analyses|journal|bankroll)|class="free-card"|class="unlock-grid"/);
  for (const l of LOCALES) assert.ok(!/pro_feat_|free_feat_|unlock_analyses/.test(Object.keys(DICTS[l].pricing_page).join(" ")), l + " : anciennes cles retirees");
  // Paiement intact : bloc #proCheckout (deplace dans la carte Pro de la grille),
  // consentement unique avant le bouton, bouton verrouille, modules charges.
  const pay = html.slice(at('id="proCheckout"'), html.indexOf("</section>", at('id="proCheckout"')));
  for (const id of ["proCommitment", "checkoutConsent", "subscribeButton", "billingMessage", "proTrust"]) assert.match(pay, new RegExp('id="' + id + '"'), id);
  // Essai remis le 02/10/2026 (CGV, article 6 bis) : encart cache, montre seulement
  // si le serveur confirme l'essai et que le compte n'a jamais ete abonne.
  assert.match(html, /<div class="trial-box" id="proTrialInfo" hidden>/);
  assert.ok(at('id="proTrialInfo"') < at('id="checkoutConsent"'), "essai annonce avant le consentement et le bouton");
  assert.ok(at('id="checkoutConsent"') < at('id="subscribeButton"'));
  assert.match(html, /<link rel="stylesheet" href="\/assets\/tailwind\.css">/);
  assert.match(html, /<script src="\/lib\/checkout-consent\.js"><\/script><script src="\/assets\/pricing-grid\.js"><\/script><script src="\/abonnement-page\.js" defer><\/script>/);
  // « Meme acces Pro, quelle que soit la duree » : masque tant qu'une seule duree est proposee,
  // place par la grille sous le choix de la duree.
  assert.match(html, /<div class="commitment" id="proCommitment" data-i18n="pricing_page\.commitment" data-pg-place="durations" hidden>/);
  assert.match(html, /\.pro-checkout \[hidden\]\{display:none!important\}/, "trust-row (display:flex) masquable");
  // Direction visuelle : plus de capitales a chasse fixe dans les styles de la grille et du bouton.
  assert.doesNotMatch(html.slice(at(".pricing-cta{"), html.indexOf("}", at(".pricing-cta{"))), /Space Mono|uppercase/);
  // abonnement-page.js : la grille recoit tout le bloc de paiement (option slot).
  assert.match(read("abonnement-page.js"), /\['proCommitment','proTrialInfo','checkoutConsent','subscribeButton','billingMessage','proTrust'\]/);
});

test("pages generees : textes traduits dans les versions publiques, prix ou « pas encore ouvert » cuit dans le HTML", () => {
  const src = read("abonnement.html");
  const keys = [...src.matchAll(/data-i18n="((?:pro_offer|match_page)\.\w+)"/g)].map((m) => m[1]);
  // Plus de liste « Tout ce que Pro debloque » (30/09/2026) : seul « Aide : » (pied de page).
  assert.deepEqual(keys, ["match_page.shell_help_label"]);
  const get = (d, k) => k.split(".").reduce((o, p) => (o ? o[p] : undefined), d);
  for (const dir of DIRS) {
    const loc = MARKETS._dirs[dir].locale;
    const page = read(dir + "/abonnement.html");
    assert.doesNotMatch(page, /pro-list-card|data-group=|data-france-seulement/, dir + " : liste en double retiree");
    for (const k of keys) {
      const v = get(DICTS[loc], k);
      assert.ok(typeof v === "string", loc + " " + k);
      assert.ok(page.includes('data-i18n="' + k + '">' + escHtml(v) + "<") || (dir === "fr" && page.includes('data-i18n="' + k + '">')), dir + " : " + k + " non traduit");
    }
    assert.match(page, /id="proCommitment"[^>]*hidden>/, dir);
    assert.match(page, /<button[^>]*id="subscribeButton"[^>]*aria-disabled="true"/, dir);
    // Marche ferme au paiement (checkoutOpen = []) : ni prix, ni consentement,
    // ni bouton dans le HTML genere ; la ligne « pas encore ouvert » a la place.
    const mk = MARKETS[MARKETS._dirs[dir].market];
    const closed = Array.isArray(mk.checkoutOpen) && mk.checkoutOpen.length === 0;
    const tagOf = (re) => (page.match(re) || [""])[0];
    const isHidden = (tag) => /\shidden(?=[\s>=])/.test(tag);
    assert.equal(isHidden(tagOf(/<div class="price" data-market-open-if="pro\.month"[^>]*>/)), closed, dir + " : prix");
    assert.equal(isHidden(tagOf(/<button[^>]*id="subscribeButton"[^>]*>/)), closed, dir + " : bouton");
    assert.equal(isHidden(tagOf(/<div id="checkoutConsent"[^>]*>/)), closed, dir + " : consentement");
    assert.equal(isHidden(tagOf(/<div class="trust-row" id="proTrust"[^>]*>/)), closed, dir + " : reassurance paiement");
    const closedLine = tagOf(/<p class="iash-plans-closed" data-market-closed-if="pro"[^>]*>[^<]*<\/p>/);
    assert.ok(closedLine, dir + " : ligne « pas encore ouvert » absente");
    assert.equal(isHidden(closedLine), !closed, dir + " : ligne « pas encore ouvert »");
    assert.ok(closedLine.includes(escHtml(DICTS[loc].pro_plans.closed)) || dir === "fr", dir + " : ligne traduite");
  }
  assert.match(read("gb/abonnement.html"), /data-market-price="pro\.month"[^>]*>£14\.99</);
  assert.match(read("mx/abonnement.html"), /data-market-price="pro\.month"[^>]*>MX\$199</);
  assert.match(read("za/abonnement.html"), /data-market-price="pro\.month"[^>]*>R\s?199</);
});

// ------------------------------------------------------------------------
// abonnement-page.js execute sur un faux DOM : durees proposees -> ligne
// « meme acces », bouton, consentement. Aucune duree payable (fonction
// redeployee, pays sans Price Stripe) : ni duree vide ni bouton mort.
// La grille de prix est remplacee par une doublure qui applique les VRAIES
// regles du composant (assets/pricing-grid.js : offerModel, fetchAvailability,
// availabilityFrom), sans DOM.
function fakeEl(id) {
  const attrs = {}, classes = new Set(), listeners = {};
  return {
    id, hidden: false, textContent: "", className: "", innerHTML: "", children: [],
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
    setAttribute: (k, v) => { attrs[k] = String(v); }, getAttribute: (k) => (k in attrs ? attrs[k] : null), removeAttribute: (k) => { delete attrs[k]; },
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    querySelectorAll: () => [], appendChild(c) { this.children.push(c); return c; },
    get parentNode() { return { insertBefore() {} }; },
    firstChild: { classList: { add() {} } }
  };
}
function gridDouble(win) {
  const real = {};
  new Function("window", read("assets/pricing-grid.js"))(Object.assign(real, { IasharkApp: win.IasharkApp, fetch: win.fetch }));
  const G = real.IasharkPricingGrid;
  return {
    mounts: [],
    mount(el, o) {
      const market = win.IASHARK_MARKET;
      let availability = {}, trial = null, chosen = o.interval || "month";
      const model = () => G.offerModel(market, o, availability);
      const api = {
        opts: o, visible: () => model().visible, interval: () => G.resolveInterval(model(), G.stateFor(model(), chosen)),
        // Choix d'une duree dans la grille (comme un clic) : onChange de la page.
        setInterval: (iv) => { chosen = iv; if (typeof o.onChange === "function") o.onChange(api.interval()); },
        isAvailable: (iv) => model().visible.indexOf(iv || api.interval()) !== -1, trialDays: () => trial,
        whenReady: () => Promise.resolve(),
        loadAvailability: () => G.fetchAvailability(market).then((r) => {
          trial = r.trialDays; const map = G.availabilityFrom(r, market, !!o.checkout);
          if (map) availability = Object.fromEntries(Object.entries(map).filter(([, v]) => v === false));
          o.onUpdate(model().visible);
        })
      };
      this.mounts.push(api);
      o.onUpdate(model().visible);
      return api;
    }
  };
}
// reopened : simule un marche rouvert (config/markets.json#checkoutOpen retire).
async function runSubscriptionPage(dir, availability, reopened) {
  const els = Object.fromEntries(["subscribeButton", "billingMessage", "checkoutConsent", "pricingGrid", "proCommitment", "proTrust", "proTrialInfo", "proTrialHeadline", "proContext"].map((id) => [id, fakeEl(id)]));
  els.proCommitment.hidden = true;
  els.subscribeButton.setAttribute("aria-disabled", "true");
  const doc = { readyState: "complete", referrer: "", getElementById: (id) => els[id] || null, createElement: () => fakeEl(), head: fakeEl("head"), addEventListener() {} };
  const calls = [];
  const win = {
    document: doc,
    I18N: { dict: DICTS[MARKETS._dirs[dir].locale], t: (k, f) => f, init: () => Promise.resolve() },
    IasharkApp: { url: "https://x.supabase.co", key: "anon", context: () => Promise.resolve({ user: null, isPro: false }) },
    IasharkCheckoutConsent: { mount: () => ({ isValid: () => false, check: () => false, payload: () => ({}), text: () => "" }) },
    fetch: (url, init) => {
      calls.push(JSON.parse(init.body));
      return Promise.resolve({ json: () => Promise.resolve(availability ? { ok: true, processed: false, mode: "availability", intervals: availability, trial_days: 7 } : { ok: true, processed: false, reason: "market_not_configured" }) });
    }
  };
  const mk = {};
  new Function("window", read("lib/market-config.js"))(mk);
  win.IASHARK_MARKET = mk.IasharkMarketConfig.build(dir);
  if (reopened) win.IASHARK_MARKET.checkoutOpen = null;
  win.IasharkPricingGrid = gridDouble(win);
  const loc = { pathname: "/" + dir + "/abonnement.html", search: "", origin: "http://x" };
  new Function("window", "document", "location", "IasharkApp", "fetch", "sessionStorage", "URLSearchParams", read("abonnement-page.js"))(win, doc, loc, win.IasharkApp, win.fetch, { setItem() {}, removeItem() {} }, URLSearchParams);
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
  const grid = win.IasharkPricingGrid.mounts[0];
  return { els, calls, grid, visible: grid ? grid.visible() : null };
}

test("abonnement-page.js : durees de la grille = durees payables ; plusieurs = « meme acces » ; aucune = ni bouton ni consentement", async () => {
  // Configuration du 19/09/2026 (decisions du proprietaire), fonction de
  // paiement a jour (mode "availability", toutes les durees disponibles cote
  // serveur) : FR et MX 3 durees, ZA et EN semaine + mois, GB mois seul
  // (semaine et annee jamais proposees, meme si le serveur les annoncait).
  const ALL = { week: true, month: true, year: true };
  const EXPECT = { fr: ["week", "month", "year"], mx: ["week", "month", "year"], za: ["week", "month"], gb: ["month"], en: ["week", "month"] };
  for (const [dir, ivs] of Object.entries(EXPECT)) {
    const r = await runSubscriptionPage(dir, ALL);
    assert.ok(r.grid, dir + " : grille non montee");
    assert.equal(r.grid.opts.checkout, true, dir + " : bouton de la page (slot), pas un lien");
    assert.equal(r.grid.opts.annual, true, dir + " : interrupteur annuel demande (affiche seulement si l'annuel est payable)");
    assert.deepEqual(r.grid.opts.slot.map((e) => e.id), ["proCommitment", "proTrialInfo", "checkoutConsent", "subscribeButton", "billingMessage", "proTrust"], dir);
    // Visiteur, serveur qui confirme 7 jours : essai annonce, prix des durees payables.
    assert.equal(r.els.proTrialInfo.hidden, false, dir + " : essai annonce au visiteur");
    // 02/10/2026 (soir) : essai sur l'abonnement MENSUEL seulement ; prix du mois.
    assert.match(r.els.proTrialHeadline.textContent, /^7 jours gratuits sur l’abonnement mensuel, puis .+ \/ mois, annulable en 1 clic$/, dir);
    if (dir === "fr") assert.equal(r.els.proTrialHeadline.textContent.replace(/[\u00a0\u202f]/g, " "), "7 jours gratuits sur l’abonnement mensuel, puis 19,95 € / mois, annulable en 1 clic");
    assert.doesNotMatch(r.els.proTrialHeadline.textContent, /semaine|\/ an/, dir + " : jamais le prix d'une autre duree");
    // Semaine (ou Annee) choisie : encart masque, « Devenir Pro » ; retour au Mois : il revient.
    if (ivs.length > 1) {
      r.grid.setInterval(ivs[0]);
      assert.equal(r.els.proTrialInfo.hidden, true, dir + " : " + ivs[0] + " = pas d'encart d'essai");
      assert.doesNotMatch(r.els.subscribeButton.textContent, /essai/i, dir);
      r.grid.setInterval("month");
      assert.equal(r.els.proTrialInfo.hidden, false, dir + " : retour au mois");
    }
    assert.deepEqual(r.visible, ivs, dir);
    assert.equal(r.els.subscribeButton.hidden, false, dir + " : bouton de paiement");
    assert.equal(r.els.checkoutConsent.hidden, false, dir + " : consentement");
    assert.equal(r.els.proCommitment.hidden, ivs.length < 2, dir + " : « meme acces » seulement avec plusieurs durees");
    assert.equal(r.calls.length, 1, dir);
    assert.deepEqual(r.calls[0], MARKETS[MARKETS._dirs[dir].market].checkoutMarket ? { mode: "availability", market: MARKETS[MARKETS._dirs[dir].market].checkoutMarket } : { mode: "availability" }, dir + " : disponibilites du bon marche");
    assert.equal(r.grid.trialDays(), 7, dir + " : jours d'essai lus dans la reponse du serveur");
  }
  // Fonction deployee plus ancienne que le site (sans mode "availability") :
  // FR = mensuel seul (flux historique, sans champ market) ; marches pays
  // (gb, mx, za, us) = aucun paiement.
  const frOldFn = await runSubscriptionPage("fr", null);
  assert.deepEqual(frOldFn.visible, ["month"]);
  assert.equal(frOldFn.els.proCommitment.hidden, true, "une seule duree : pas de « meme acces, quelle que soit la duree »");
  assert.equal(frOldFn.els.subscribeButton.hidden, false);
  assert.equal(frOldFn.els.checkoutConsent.hidden, false);
  assert.equal(frOldFn.grid.trialDays(), null, "ancienne fonction : aucun essai annonce");
  for (const dir of ["gb", "mx", "za", "en"]) {
    const cfg = await runSubscriptionPage(dir, null);
    assert.deepEqual(cfg.visible, [], dir);
    assert.equal(cfg.els.subscribeButton.hidden, true, dir + " : pas de bouton qui echoue");
    assert.equal(cfg.els.checkoutConsent.hidden, true, dir);
  }
  // Marche rouvert, fonction sans mode "availability" : aucun paiement de marche pays.
  const gb = await runSubscriptionPage("gb", null, true);
  assert.deepEqual(gb.calls[0], { mode: "availability", market: "gb" });
  assert.deepEqual(gb.visible, []);
  assert.equal(gb.els.subscribeButton.hidden, true, "ancienne fonction : pas de paiement GBP");
  const frOld = await runSubscriptionPage("fr", null, true);
  assert.deepEqual(frOld.calls[0], { mode: "availability" });
  assert.deepEqual(frOld.visible, ["month"]);
  // Fonction a jour, toutes les durees ouvertes : 3 durees et « meme acces ».
  const gbAll = await runSubscriptionPage("gb", { week: true, month: true, year: true }, true);
  assert.deepEqual(gbAll.visible, ["week", "month", "year"]);
  assert.equal(gbAll.els.proCommitment.hidden, false);
  // Serveur : semaine fermee -> jamais proposee.
  const gb2 = await runSubscriptionPage("gb", { week: false, month: true, year: true }, true);
  assert.deepEqual(gb2.visible, ["month", "year"]);
  // Serveur : tout ferme -> ni prix, ni bouton, ni consentement.
  for (const dir of ["gb", "mx", "za"]) {
    const none = await runSubscriptionPage(dir, { week: false, month: false, year: false }, true);
    assert.deepEqual(none.visible, [], dir);
    assert.equal(none.els.subscribeButton.hidden, true, dir + " : pas de bouton mort");
    assert.equal(none.els.checkoutConsent.hidden, true, dir);
    assert.equal(none.els.proTrust.hidden, true, dir);
    assert.equal(none.els.billingMessage.hidden, true, dir);
    assert.equal(none.els.proCommitment.hidden, true, dir);
  }
});

test("compte gratuit : la carte Pro de la page d'abonnement telle quelle, meme regle pour les durees, jamais de bouton mort", () => {
  const js = read("account-page.js");
  // Controle des captures du 30/09/2026 : plus de liste propre au compte (7 + 2 + 3
  // lignes, coches fines, « Bientot » deplie), plus de bouton « Decouvrir Pro » etroit.
  assert.doesNotMatch(js, /function listePro\(\)|pro_gate_item_|id="proListe"|proDureesNote|compte_page\.discover_pro_cta/);
  assert.match(js, /window\.IasharkPricingGrid\.mount\(el, Object\.assign\(\{ variant: 'complet', heading: false, annual: true, checkout: true, session: false, loggedIn: true, ownTrial: true,\s*slot: paiement \? Array\.prototype\.slice\.call\(paiement\.children\) : \[\] \}, o\)\);/);
  // Paiement deplace dans la carte : consentement, essai, bouton « Devenir Pro » pleine largeur, message.
  const free = js.slice(js.indexOf("var alerte = etat && etat.ton === 'alerte'"), js.indexOf("function boutonPaiement(texte)"));
  const at = (s) => free.indexOf(s);
  assert.ok(at('<div id="comptePaiement"') > 0 && at('<div id="checkoutConsent"></div>') > at('<div id="comptePaiement"') && at("boutonPaiement(") > at('<div id="checkoutConsent"></div>') && at('<p id="msgFacturation"') > at("boutonPaiement("), "ordre du paiement");
  assert.match(js, /tr\('pricing_grid\.cta_pro', 'Devenir Pro'\)/);
  assert.match(js, /function boutonPaiement\(texte\) \{\s*return '<button type="button" id="souscrire" class="inline-flex min-h-\[48px\] w-full /);
  // Anciennes promesses retirees de l'affichage (six outils, suivi de bankroll).
  assert.doesNotMatch(js, /tr\('compte_page\.benefit_(pro_all_matches|pro_six_tools|pro_decisions_log|pro_bankroll|free_analysis|free_tools)'/);
  // Aucune duree payable : ni bouton « Devenir Pro » ni consentement.
  assert.match(js, /\['souscrire', 'checkoutConsent', 'msgFacturation'\]\.forEach/);
  assert.match(js, /if \(n === 0\) \{ el\.hidden = true; el\.style\.display = 'none'; \}/);
  // BUG REEL (19/09/2026) : compte.html ne chargeait pas lib/pro-plan-picker.js,
  // le selecteur n'etait jamais monte (prix de repli fixe, « meme acces quelle
  // que soit la duree » toujours affiche, aucun masquage possible).
  for (const d of [""].concat(DIRS.map((x) => x + "/"))) {
    const html = read(d + "compte.html");
    const at = (x) => html.indexOf(x);
    // Grille de prix (30/09/2026, variante « prix ») a la place du selecteur de duree.
    assert.ok(at('<script src="/assets/pricing-grid.js"></script>') > 0, d + "compte.html : grille de prix non chargee");
    assert.ok(at('<script src="/assets/pricing-grid.js"></script>') < at('<script src="/account-page.js"'), d + "compte.html : grille avant le script de page");
  }
});

test("landings gb, mx, za : grille de prix avec le bouton de la page ; aucune duree payable = ni bouton de paiement ni consentement", () => {
  for (const d of ["gb", "mx", "za"]) {
    const js = read(d + "/" + d + "-page.js");
    assert.match(js, /window\.IasharkPricingGrid\.mount\(gridEl, \{\s*variant: "complet", heading: false, annual: true, checkout: true,\s*slot: \["checkoutConsent", "subscribeProBtn", "proMsg"\]/, d);
    // La devise est dite une fois, sous la grille (plus de ligne « Prices shown in ... » en double).
    assert.doesNotMatch(read(d + "/landing.html"), /Prices shown in|Precios mostrados/, d);
    assert.match(js, /onUpdate: offerUpdate/, d);
    assert.match(js, /function offerUpdate\(visible\) \{\s*var closed = !visible \|\| visible\.length === 0;\s*\["subscribeProBtn", "checkoutConsent", "proMsg"\]\.forEach/, d);
    assert.match(js, /el\.style\.display = closed \? "none" : "";/, d + " : .block Tailwind masque aussi");
    const html = read(d + "/landing.html");
    for (const id of ["subscribeProBtn", "checkoutConsent", "proMsg", "pricingGrid", "proCheckout"]) assert.match(html, new RegExp('id="' + id + '"'), d + " " + id);
    assert.ok(html.indexOf('id="checkoutConsent"') < html.indexOf('id="subscribeProBtn"'), d + " : consentement avant le bouton");
    assert.doesNotMatch(html, /id="proPlanPicker"/, d + " : ancien selecteur retire");
  }
});
