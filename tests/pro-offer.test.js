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
const DIRS = Object.keys(MARKETS._dirs);
const LEAGUES = JSON.parse(read("config/leagues.json")).leagues;
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
const MATCH_KEYS = ["pro_gate_item_bet", "pro_gate_item_scorer", "pro_gate_item_scenario", "pro_gate_item_scores", "pro_gate_item_odds", "pro_gate_item_stats", "pro_gate_item_faq"];
const OFFER_KEYS = ["list_title", "group_match", "group_daily", "group_tools", "daily_all_matches", "daily_scorers", "badge_new", "tool_scanner", "tool_journal", "tool_combo",
  "free_matches", "free_tools", "match_more", "price_month"];
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

test("page d'abonnement : prix et liste Pro en 3 groupes cote a cote, sans tableau « Gratuit ou Pro » (une seule source de textes)", () => {
  const html = read("abonnement.html");
  const at = (s) => html.indexOf(s);
  // Tableau « Gratuit ou Pro » retire (proprietaire, 19/09/2026) : ni balisage, ni styles, ni cles.
  assert.doesNotMatch(html, /pro-compare|class="cmp"|\.cmp[\s{.,]|compare_(title|col_|row_|matches_|scorers_|tools_)/);
  for (const l of LOCALES) assert.deepEqual(Object.keys(DICTS[l].pro_offer).filter((k) => /^compare_/.test(k)), [], l + " : cles du tableau retirees");
  // Carte prix puis carte liste, dans la meme grille (cote a cote sur ordinateur, prix d'abord sur mobile).
  const layout = html.slice(at('<section class="pricing-layout"'), html.indexOf("</section>", at('<section class="pricing-layout"')));
  assert.ok(layout.indexOf('class="pricing-card"') > 0 && layout.indexOf('class="pricing-card"') < layout.indexOf('class="pro-list-card"'), "prix puis liste");
  assert.ok(at('class="pricing-intro"') < at('<section class="pricing-layout"'));
  assert.match(html, /\.pricing-layout\{display:grid;grid-template-columns:minmax\(0,\.92fr\) minmax\(0,1\.08fr\);/);
  assert.match(html, /@media\(max-width:760px\)\{[^@]*\.pricing-layout\{grid-template-columns:1fr\}/);
  // Liste complete : 3 groupes, les 7 lignes du mur Pro de la page match, dans son ordre.
  const list = html.slice(at('class="pro-list-card"'), html.indexOf("</article>", at('class="pro-list-card"')));
  assert.deepEqual([...list.matchAll(/data-group="(\w+)"/g)].map((m) => m[1]), ["match", "daily", "tools"]);
  const matchGroup = list.slice(list.indexOf('data-group="match"'), list.indexOf('data-group="daily"'));
  assert.deepEqual([...matchGroup.matchAll(/data-i18n="match_page\.(\w+)"/g)].map((m) => m[1]), MATCH_KEYS);
  const gate = read("match-page.js").slice(read("match-page.js").indexOf("function proGate(vm,o)"));
  assert.deepEqual([...gate.slice(0, gate.indexOf("].filter(")).matchAll(/\['(pro_gate_item_\w+)',/g)].map((m) => m[1]), MATCH_KEYS, "meme liste que le mur Pro de la page match");
  const daily = list.slice(list.indexOf('data-group="daily"'), list.indexOf('data-group="tools"'));
  assert.deepEqual([...daily.matchAll(/data-i18n="pro_offer\.(\w+)"/g)].map((m) => m[1]), ["group_daily", "daily_all_matches", "daily_scorers", "badge_new"]);
  assert.match(daily, /<span class="tag-new" data-i18n="pro_offer\.badge_new">Nouveau<\/span>/);
  const tools = list.slice(list.indexOf('data-group="tools"'));
  assert.deepEqual([...tools.matchAll(/data-i18n="pro_offer\.(\w+)"/g)].map((m) => m[1]), ["group_tools", "tool_scanner", "tool_journal", "tool_combo"]);
  assert.equal((list.match(/<li>/g) || []).length, 12);
  // Anciennes listes vagues retirees (aucun doublon).
  assert.doesNotMatch(html, /pro_feat_|free_feat_|free_heading|unlock_(title|analyses|journal|bankroll)|class="free-card"|class="unlock-grid"/);
  for (const l of LOCALES) assert.ok(!/pro_feat_|free_feat_|unlock_analyses/.test(Object.keys(DICTS[l].pricing_page).join(" ")), l + " : anciennes cles retirees");
  // Paiement intact : consentement unique avant le bouton, bouton verrouille, modules charges.
  assert.ok(at('id="checkoutConsent"') < at('id="subscribeButton"'));
  assert.match(html, /<script src="\/lib\/checkout-consent\.js"><\/script><script src="\/lib\/pro-plan-picker\.js"><\/script><script src="\/abonnement-page\.js" defer><\/script>/);
  // « Meme acces Pro, quelle que soit la duree » : masque tant qu'une seule duree est proposee.
  assert.match(html, /<div class="commitment" id="proCommitment" data-i18n="pricing_page\.commitment" hidden>/);
  assert.match(html, /\.pricing-card \[hidden\]\{display:none!important\}/, "trust-row (display:flex) masquable");
  // Mobile : la comparaison passe en 2 colonnes (libelle au-dessus), jamais de defilement horizontal.
});

test("pages generees : liste Pro traduite dans les 9 versions, prix ou « pas encore ouvert » cuit dans le HTML", () => {
  const src = read("abonnement.html");
  const keys = [...src.matchAll(/data-i18n="((?:pro_offer|match_page)\.\w+)"/g)].map((m) => m[1]);
  // Titre, 3 groupes, 7 lignes « match », 5 autres lignes, « Nouveau » + « Aide : » (pied de page).
  assert.equal(keys.length, 18, keys.join(" "));
  const get = (d, k) => k.split(".").reduce((o, p) => (o ? o[p] : undefined), d);
  for (const dir of DIRS) {
    const loc = MARKETS._dirs[dir].locale;
    const page = read(dir + "/abonnement.html");
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
// abonnement-page.js execute sur un faux DOM : durees affichees -> ligne
// « meme acces », bouton, consentement. Aucune duree payable (fonction
// redeployee, pays sans Price Stripe) : ni selecteur vide ni bouton mort.
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
// reopened : simule un marche rouvert (config/markets.json#checkoutOpen retire).
async function runSubscriptionPage(dir, availability, reopened) {
  const els = Object.fromEntries(["subscribeButton", "billingMessage", "checkoutConsent", "proPlanPicker", "proCommitment", "proTrust", "proContext"].map((id) => [id, fakeEl(id)]));
  els.proCommitment.hidden = true;
  els.subscribeButton.setAttribute("aria-disabled", "true");
  const doc = { readyState: "complete", referrer: "", getElementById: (id) => els[id] || null, createElement: () => fakeEl(), head: fakeEl("head"), addEventListener() {} };
  els.proPlanPicker.ownerDocument = doc;
  const calls = [];
  const win = {
    document: doc,
    I18N: { dict: DICTS[MARKETS._dirs[dir].locale], t: (k, f) => f, init: () => Promise.resolve() },
    IasharkApp: { url: "https://x.supabase.co", key: "anon", context: () => Promise.resolve({ user: null, isPro: false }) },
    IasharkCheckoutConsent: { mount: () => ({ isValid: () => false, check: () => false, payload: () => ({}), text: () => "" }) },
    fetch: (url, init) => {
      calls.push(JSON.parse(init.body));
      return Promise.resolve({ json: () => Promise.resolve(availability ? { ok: true, processed: false, mode: "availability", intervals: availability } : { ok: true, processed: false, reason: "market_not_configured" }) });
    }
  };
  const mk = {};
  new Function("window", read("lib/market-config.js"))(mk);
  win.IASHARK_MARKET = mk.IasharkMarketConfig.build(dir);
  if (reopened) win.IASHARK_MARKET.checkoutOpen = null;
  new Function("window", read("lib/pro-plan-picker.js"))(win);
  const loc = { pathname: "/" + dir + "/abonnement.html", search: "", origin: "http://x" };
  new Function("window", "document", "location", "IasharkApp", "fetch", "sessionStorage", read("abonnement-page.js"))(win, doc, loc, win.IasharkApp, win.fetch, { setItem() {}, removeItem() {} });
  for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r));
  return { els, calls };
}

test("abonnement-page.js : une duree = prix seul sans « meme acces », plusieurs = choix, aucune = ni bouton ni consentement", async () => {
  // FR : seul le mensuel est payable (checkoutOpen) ; semaine et annee absentes de la page.
  const fr = await runSubscriptionPage("fr", null);
  assert.match(fr.els.proPlanPicker.innerHTML, /^<div class="iash-plans iash-plans-single" data-interval="month">/);
  assert.doesNotMatch(fr.els.proPlanPicker.innerHTML, /pro\.week|pro\.year|<input/);
  assert.equal(fr.els.proCommitment.hidden, true, "une seule duree : pas de « meme acces, quelle que soit la duree »");
  assert.equal(fr.els.subscribeButton.hidden, false);
  assert.equal(fr.els.checkoutConsent.hidden, false);
  // GB, MX, ZA (19/09/2026, « cache-le ») : aucune duree payable par la
  // configuration -> ligne « pas encore ouvert », ni bouton ni consentement,
  // meme sans reponse du serveur.
  for (const dir of ["gb", "mx", "za"]) {
    const cfg = await runSubscriptionPage(dir, null);
    assert.match(cfg.els.proPlanPicker.innerHTML, /^<p class="iash-plans-closed" role="status">/, dir);
    assert.equal(cfg.els.subscribeButton.hidden, true, dir + " : pas de bouton qui echoue");
    assert.equal(cfg.els.checkoutConsent.hidden, true, dir);
  }
  // Marche rouvert, fonction deployee sans mode "availability" -> disponibilite inconnue, configuration conservee.
  const gb = await runSubscriptionPage("gb", null, true);
  assert.equal(gb.calls.length, 1);
  assert.deepEqual(gb.calls[0], { mode: "availability", market: "gb" });
  assert.equal((gb.els.proPlanPicker.innerHTML.match(/<input type="radio"/g) || []).length, 3);
  assert.equal(gb.els.proCommitment.hidden, false, "plusieurs durees : « meme acces » affiche");
  // Serveur : semaine fermee -> masquee.
  const gb2 = await runSubscriptionPage("gb", { week: false, month: true, year: true }, true);
  assert.doesNotMatch(gb2.els.proPlanPicker.innerHTML, /value="week"/);
  assert.equal((gb2.els.proPlanPicker.innerHTML.match(/<input type="radio"/g) || []).length, 2);
  // Serveur : tout ferme -> ligne « paiement pas encore ouvert », ni prix, ni bouton, ni consentement.
  for (const dir of ["gb", "mx", "za"]) {
    const none = await runSubscriptionPage(dir, { week: false, month: false, year: false }, true);
    const loc = MARKETS._dirs[dir].locale;
    // Meme echappement que lib/pro-plan-picker.js#esc (apostrophe droite -> &#39;).
    assert.equal(none.els.proPlanPicker.innerHTML, '<p class="iash-plans-closed" role="status">' + escHtml(DICTS[loc].pro_plans.closed).replace(/'/g, "&#39;") + "</p>", dir);
    assert.doesNotMatch(none.els.proPlanPicker.innerHTML, /data-market-price|£|€|MX\$|R\s?\d/, dir + " : aucun prix");
    assert.equal(none.els.subscribeButton.hidden, true, dir + " : pas de bouton mort");
    assert.equal(none.els.checkoutConsent.hidden, true, dir);
    assert.equal(none.els.proTrust.hidden, true, dir);
    assert.equal(none.els.billingMessage.hidden, true, dir);
    assert.equal(none.els.proCommitment.hidden, true, dir);
  }
});

test("compte gratuit : meme liste Pro que la page d'abonnement, meme regle pour les durees, jamais de bouton mort", () => {
  const js = read("account-page.js");
  const liste = js.slice(js.indexOf("function listePro()"), js.indexOf("/* Préférences : profil"));
  assert.ok(liste.length > 500, "listePro introuvable");
  assert.deepEqual([...liste.matchAll(/\['(pro_gate_item_\w+)',/g)].map((m) => m[1]), MATCH_KEYS, "memes lignes que le mur Pro de la page match");
  assert.deepEqual([...liste.matchAll(/tr\('pro_offer\.(\w+)'/g)].map((m) => m[1]), ["group_match", "group_daily", "daily_all_matches", "daily_scorers", "badge_new", "group_tools", "tool_scanner", "tool_journal", "tool_combo"]);
  for (const m of js.matchAll(/tr\('pro_offer\.(free_\w+)', '((?:[^'\\]|\\.)*)'\)/g)) assert.equal(m[2], DICTS.fr.pro_offer[m[1]], m[1]);
  // Fallbacks = dictionnaire FR (une seule source).
  for (const m of liste.matchAll(/tr\('(pro_offer|match_page)\.(\w+)', '((?:[^'\\]|\\.)*)'\)/g)) assert.equal(m[3], DICTS.fr[m[1]][m[2]], m[1] + "." + m[2]);
  for (const m of liste.matchAll(/\['(pro_gate_item_\w+)', '((?:[^'\\]|\\.)*)'\]/g)) assert.equal(m[2], DICTS.fr.match_page[m[1]], m[1]);
  assert.match(js, /\+ listePro\(\)/);
  // Anciennes promesses retirees de l'affichage (six outils, suivi de bankroll).
  assert.doesNotMatch(js, /tr\('compte_page\.benefit_(pro_all_matches|pro_six_tools|pro_decisions_log|pro_bankroll|free_analysis|free_tools)'/);
  assert.match(js, /esc\(tr\('pro_offer\.free_matches', '1 match offert par jour, avec un compte gratuit'\)\)/);
  assert.match(js, /esc\(tr\('pro_offer\.free_tools', 'Calculateur de mise, cote juste, simulateur de capital'\)\)/);
  // Aucune duree payable : ni bouton « Decouvrir Pro » ni consentement.
  assert.match(js, /\['souscrire', 'checkoutConsent', 'msgFacturation'\]\.forEach/);
  assert.match(js, /if \(n === 0\) \{ el\.hidden = true; el\.style\.display = 'none'; \}/);
  assert.match(js, /<p id="proDureesNote" class="mt-2 text-\[13\.5px\] text-soft">' \+ tr\('compte_page\.pro_durations_note'/);
  assert.match(js, /var note = \$\('proDureesNote'\); if \(note\) note\.hidden = n < 2;/);
  // BUG REEL (19/09/2026) : compte.html ne chargeait pas lib/pro-plan-picker.js,
  // le selecteur n'etait jamais monte (prix de repli fixe, « meme acces quelle
  // que soit la duree » toujours affiche, aucun masquage possible).
  for (const d of [""].concat(DIRS.map((x) => x + "/"))) {
    const html = read(d + "compte.html");
    const at = (x) => html.indexOf(x);
    assert.ok(at('<script src="/lib/pro-plan-picker.js"></script>') > 0, d + "compte.html : selecteur non charge");
    assert.ok(at('<script src="/lib/pro-plan-picker.js"></script>') < at('<script src="/account-page.js"'), d + "compte.html : selecteur apres le script de page");
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
