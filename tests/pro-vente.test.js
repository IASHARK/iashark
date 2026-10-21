"use strict";
// Page Pro qui VEND (21/10/2026). Constat : 36 visites de la page Pro en 5 semaines,
// 2 abonnes ; la page etait un « Tool Center » rempli de lignes fictives et ne disait
// pas ce que recoit un parieur. Carte blanche de Clement pour vendre plus.
// Ce que ces tests gardent :
//   - un visiteur non abonne voit, dans l'ordre : la promesse, ce que recoit un abonne
//     chaque jour, l'exemple d'analyse, comment ca marche, le prix et le bouton (LE
//     composant de paiement unique, jamais un prix ecrit dans la page), les questions ;
//   - chaque ligne « ce que tu recois » n'apparait que si elle est vraie en ligne pour
//     ce visiteur (memes regles que lib/offre-pro.js) ; les messages prives Telegram
//     restent fermes tant qu'ils ne sont pas en ligne ;
//   - la question « essai » n'apparait que si le composant affiche un essai ;
//   - textes dans les 7 langues, sans promesse de gain, sans mise, capital ni esperance,
//     sans emoji, sans chiffre de resultat ;
//   - direction visuelle : ni majuscules a chasse fixe, ni vert ni rouge.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const DICTS = Object.fromEntries(LOCALES.map((l) => [l, JSON.parse(read("i18n/dict/" + l + ".json"))]));
const MARKETS = JSON.parse(read("config/markets.json"));
const DIRS = require("./helpers/public-dirs.js").PUBLIC_DIRS;
const PV = require("../lib/pro-vente.js");

const html = read("pro.html");
const vente = html.slice(html.indexOf('<div id="proVente"'), html.indexOf('<div id="proOutils"'));

test("page de vente : les six parties dans l'ordre demande", () => {
  const reperes = [
    'data-i18n="pro_vente.hero_title_pre"',
    'data-i18n="pro_vente.daily_title"',
    'href="/exemple-analyse.html"',
    'data-i18n="pro_vente.how_title"',
    '<div id="offrePro">',
    'data-i18n="pro_vente.faq_title"'
  ];
  let avant = -1;
  for (const r of reperes) {
    const i = vente.indexOf(r);
    assert.ok(i > avant, "ordre ou partie manquante : " + r);
    avant = i;
  }
  assert.equal((vente.match(/<h1[\s>]/g) || []).length, 1, "un seul h1 dans la page de vente");
  assert.doesNotMatch(html.slice(html.indexOf('<div id="proOutils"')), /<h1[\s>]/, "l'en-tete des outils (h1) n'est rendu que pour un abonne");
  // Ce que recoit un abonne : chaque contenu demande est present.
  for (const k of ["item_all_title", "item_combos_title", "item_gold_title", "item_scorer_title", "item_markets_title", "item_film_title", "item_telegram_title"]) {
    assert.match(vente, new RegExp('data-i18n="pro_vente\\.' + k + '"'), k);
  }
  // Questions : resiliation, essai, operateurs agrees (ANJ), 18 ans et plus.
  for (const k of ["faq_cancel_q", "faq_trial_q", "faq_where_q", "faq_where_anj", "faq_age_q"]) {
    assert.match(vente, new RegExp('data-i18n="pro_vente\\.' + k + '"'), k);
  }
});

test("prix et bouton : LE composant de paiement, aucun prix ecrit dans la page", () => {
  assert.doesNotMatch(vente, /\d+[,.]\d{2}\s?(€|£)|(€|£|MX\$|US\$)\s?\d|\bR\s?\d{2,}|data-market-price/, "aucun prix en dur");
  const js = read("lib/pro-vente.js");
  assert.match(js, /OP\.mount\(boite, \{ mode: "vitrine", contexte: "general"/);
  assert.doesNotMatch(js, /\d+[,.]\d{2}\s?(€|£)|19,95|14\.99|MX\$|R199/);
  assert.match(html, /<script src="\/lib\/icones\.js"><\/script><script src="\/lib\/composants\.js"><\/script><script src="\/lib\/offre-pro\.js"><\/script><script src="\/lib\/pro-vente\.js"><\/script>\s*<script src="\/tools-page\.js">/);
  for (const css of ["composants.css", "offre-pro.css", "pro-vente.css"]) assert.match(html, new RegExp('href="/assets/' + css.replace(".", "\\.") + '"'), css);
  // Repli sans JS : un lien vers la page abonnement, pas de prix.
  assert.match(vente, /<div id="offrePro"><section class="op op--vitrine">[\s\S]*?href="\/abonnement\.html"/);
});

test("interrupteurs de verite : une ligne n'apparait que si elle est vraie pour ce visiteur", () => {
  // Lignes conditionnelles cachees dans le HTML, montrees par lib/pro-vente.js.
  const conditionnelles = [...vente.matchAll(/<(li|p)\b[^>]*data-pv-si="(\w+)"[^>]*>/g)];
  assert.ok(conditionnelles.length >= 6);
  for (const m of conditionnelles) assert.match(m[0], /\shidden[\s>]/, "cachee par defaut : " + m[0]);
  const si = (nom) => conditionnelles.filter((m) => m[2] === nom).length;
  assert.equal(si("tickets"), 3, "petit et grand combine, Selection en or, buteur du jour");
  assert.equal(si("marches"), 1);
  assert.equal(si("telegram"), 1);
  assert.equal(si("anj"), 1);
  // Memes regles que le composant (lib/offre-pro.js#avantages, lib/aujourdhui.js#enLigne).
  assert.deepEqual(PV.conditions({ tickets: true, marcheFr: true, langueFr: true }), { tickets: true, marches: true, telegram: false, anj: true });
  assert.deepEqual(PV.conditions({ tickets: true, marcheFr: false, langueFr: false }), { tickets: false, marches: false, telegram: false, anj: false });
  assert.deepEqual(PV.conditions({ tickets: false, marcheFr: true, langueFr: true }), { tickets: false, marches: true, telegram: false, anj: true });
  // Messages prives Telegram : pas en ligne au 21/10/2026 (seul Clement les recoit en
  // rodage). Passer OUVERT.telegram a true LE JOUR ou chaque abonne lie les recoit, et
  // mettre ce test a jour le meme jour.
  assert.equal(PV.OUVERT.telegram, false);
});

test("question « essai » : seulement si le composant de paiement affiche un essai, avec son texte", () => {
  assert.match(vente, /<details class="pv-q" data-pv-essai hidden>/);
  const js = read("lib/pro-vente.js");
  assert.match(js, /OP\.lireDisponibilite\(market\)\.then/);
  assert.match(js, /var jours = OP\.essaiOuvert\(dispo\);/);
  assert.match(js, /if \(!jours \|\| !mois\) return;/);
  assert.match(js, /tf\("offre_pro\.trial_detail"/);
});

test("i18n : pro_vente.* complet et identique dans les 7 dictionnaires et leurs parts", () => {
  const ref = Object.keys(DICTS.fr.pro_vente).sort();
  assert.ok(ref.length >= 45);
  const cles = [...html.matchAll(/data-i18n(?:-attr="[^"]*:|=")(pro_vente\.\w+)/g)].map((m) => m[1].split(".")[1]);
  for (const k of cles) assert.ok(ref.includes(k), "cle utilisee par la page et absente : " + k);
  for (const l of LOCALES) {
    const d = DICTS[l].pro_vente;
    assert.deepEqual(Object.keys(d).sort(), ref, l + " : cles pro_vente");
    assert.deepEqual(JSON.parse(read("i18n/parts/pro-vente." + l + ".json")).pro_vente, d, l + " : part et dictionnaire identiques");
    for (const k of ref) assert.ok(typeof d[k] === "string" && d[k].trim(), l + " pro_vente." + k);
  }
});

test("textes : aucune promesse de gain, ni mise, ni capital, ni esperance, ni chiffre de resultat, ni emoji", () => {
  const INTERDITS = /\b(sûrs?|gagnants?|gains?|gagner|mises?|unités?|capital|espérance|bankroll|garanti\w*|guarantee\w*|winnings?|stakes?|expected value|ganancias?|ganar|garantizad\w*|Gewinn\w*|Einsatz|Kapital|garantiert|guadagn\w*|puntata|capitale|ganhos?|ganhar|garantid\w*)\b|offre limitée|dernière chance|réussite|win rate|success rate|ROI\b|rentab\w*|profit\w*/i;
  for (const l of LOCALES) {
    const tout = JSON.stringify(DICTS[l].pro_vente);
    assert.doesNotMatch(tout, INTERDITS, l);
    assert.doesNotMatch(tout, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, l + " : aucun emoji");
    assert.doesNotMatch(tout, /\d+\s?%\s?(de réussite|of wins|de acierto|Treffer|di successo|de acerto)/i, l + " : aucun chiffre de resultat");
  }
  const texteVente = vente.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(texteVente, INTERDITS, "texte statique francais");
});

test("direction visuelle : ni majuscules a chasse fixe, ni vert ni rouge, mouvement reduit respecte", () => {
  const css = read("assets/pro-vente.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /text-transform\s*:\s*uppercase|monospace|Space Mono/i);
  assert.doesNotMatch(css, /#(22c55e|16a34a|10b981|ef4444|dc2626|ff8f85|f43f5e)\b/i, "vert et rouge reserves aux ecarts chiffres");
  assert.match(css, /prefers-reduced-motion:no-preference/);
  assert.match(read("lib/pro-vente.js"), /prefers-reduced-motion: reduce/);
});

test("pages generees : la page de vente traduite dans chaque version publique", () => {
  const get = (d, k) => k.split(".").reduce((o, p) => (o ? o[p] : undefined), d);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const dir of DIRS) {
    const page = read(dir + "/pro.html");
    const loc = MARKETS._dirs[dir].locale;
    for (const k of ["pro_vente.hero_title_pre", "pro_vente.daily_title", "pro_vente.faq_title"]) {
      const v = get(DICTS[loc], k);
      assert.ok(page.includes('data-i18n="' + k + '">' + esc(v) + "<"), dir + " : " + k + " non traduit");
    }
    assert.match(page, new RegExp('href="/' + dir + '/exemple-analyse\\.html"'), dir + " : lien vers l'exemple de la version");
    assert.doesNotMatch(page, /Calculateur de mise|Simulateur de capital|data-tool="(stake|bankroll)"/, dir);
  }
});
