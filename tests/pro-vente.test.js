"use strict";
// Page Pro qui VEND (21/10/2026), raccourcie le 12/11/2026 (Clement : « la raccourcir encore » ;
// avis ChatGPT, section 3). Constat du 12/11 : au telephone la page faisait 6 ecrans et le prix
// arrivait au 4e. Ce que ces tests gardent :
//   - un visiteur non abonne voit, dans l'ordre : le titre et une ligne ; « Pro offert 1 mois »
//     (Lolly Bet, notre partenaire : la meme carte que le cadenas de la page match) ; le Pro par
//     abonnement (LE composant de paiement unique, jamais un prix ecrit dans la page) ; deux liens
//     (un exemple d'analyse, l'analyse gratuite du jour) ;
//   - le comparatif, le catalogue, « Comment ca marche », le bouton intermediaire et les questions
//     ne reviennent pas ;
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

test("page de vente courte : titre, Pro offert, Pro par abonnement, deux liens, dans cet ordre", () => {
  const reperes = [
    'data-i18n="pro_vente.short_title"',
    'data-i18n="pro_vente.short_sub"',
    'class="po-carte" data-pv-offert',
    '<div id="offrePro">',
    'href="/exemple-analyse.html"',
    'id="pvGratuit" href="/inscription.html"'
  ];
  let avant = -1;
  for (const r of reperes) {
    const i = vente.indexOf(r);
    assert.ok(i > avant, "ordre ou partie manquante : " + r);
    avant = i;
  }
  assert.equal((vente.match(/<h1[\s>]/g) || []).length, 1, "un seul h1 dans la page de vente");
  assert.doesNotMatch(html.slice(html.indexOf('<div id="proOutils"')), /<h1[\s>]/, "l'en-tete des outils (h1) n'est rendu que pour un abonne");
  // Ce qui a ete retire le 12/11 ne revient pas : comparatif, catalogue, etapes, bouton intermediaire, questions.
  assert.doesNotMatch(vente, /pv-cmp|pv-liste|pv-fiche|pv-etapes|pv-faq|<details|pv-hero-cta|href="#offre"/);
  assert.ok(vente.length < 4500, "la page de vente reste courte (" + vente.length + " caracteres)");
});

test("Pro offert 1 mois : la carte du cadenas, Lolly Bet nomme comme partenaire, vers la page Lolly", () => {
  const carte = vente.slice(vente.indexOf('class="po-carte"'), vente.indexOf('<section class="pv-offre"'));
  for (const k of ["pro_offert_title", "pro_offert_cta"]) assert.match(carte, new RegExp('data-i18n="match_page\\.' + k + '"'), k);
  assert.match(carte, /Lolly Bet, notre partenaire/, "repli sans JS : le partenaire est nomme");
  assert.match(carte, /<a class="po-btn" href="\/lolly\.html#pro-offert" data-track="lolly_pro_offert_pro"/);
  // Avec JS : le meme texte que le cadenas (match_page.pro_offert_text), le logo a la place du nom.
  const ligne = PV.ligneOffert();
  assert.match(ligne, /^<span>Inscris-toi chez <\/span><img class="po-logo" src="\/assets\/bk\/lolly\.svg" alt="Lolly Bet" width="62" height="14"><span>, notre partenaire, avec notre lien<\/span>$/);
  assert.ok(fs.existsSync(path.join(ROOT, "assets/bk/lolly.svg")));
  const mp = read("match-page.js");
  assert.match(mp, /'lolly':\{f:'lolly\.svg',w:62,h:14\}/, "meme logo que match-page.js");
  assert.match(mp, /tf\('match_page\.pro_offert_text'/);
  for (const l of LOCALES) assert.match(DICTS[l].match_page.pro_offert_text, /\{book\}/, l);
  // Une seule carte, deux feuilles : les regles .po-* sont recopiees telles quelles de match-page.css.
  const regles = (css) => css.split("\n").filter((x) => /^\.po-/.test(x));
  const ref = regles(read("assets/match-page.css"));
  assert.ok(ref.length >= 6);
  assert.deepEqual(regles(read("assets/pro-vente.css")), ref, "carte « Pro offert » : memes regles que le cadenas");
});

test("prix et bouton : LE composant de paiement, aucun prix ecrit dans la page", () => {
  assert.doesNotMatch(vente, /\d+[,.]\d{2}\s?(€|£)|(€|£|MX\$|US\$)\s?\d|\bR\s?\d{2,}|data-market-price/, "aucun prix en dur");
  const js = read("lib/pro-vente.js");
  assert.match(js, /OP\.mount\(boite, \{ mode: "vitrine", contexte: "abonnement"/);
  assert.doesNotMatch(js, /\d+[,.]\d{2}\s?(€|£)|19,95|14\.99|MX\$|R199/);
  // Titre du composant sur cette page : « Pro par abonnement » ; memes avantages que le contexte general.
  const op = read("lib/offre-pro.js");
  assert.match(op, /abonnement: \["offre_pro\.title_sub", "Pro par abonnement"\]/);
  for (const l of LOCALES) {
    assert.ok(String(DICTS[l].offre_pro.title_sub || "").trim(), l + " offre_pro.title_sub");
    assert.equal(JSON.parse(read("i18n/parts/vente." + l + ".json")).offre_pro.title_sub, DICTS[l].offre_pro.title_sub, l);
  }
  assert.match(html, /<script src="\/lib\/icones\.js"><\/script><script src="\/lib\/composants\.js"><\/script><script src="\/lib\/offre-pro\.js"><\/script><script src="\/lib\/pro-vente\.js"><\/script>\s*<script src="\/tools-page\.js">/);
  for (const css of ["composants.css", "offre-pro.css", "pro-vente.css"]) assert.match(html, new RegExp('href="/assets/' + css.replace(".", "\\.") + '"'), css);
  // Repli sans JS : un lien vers la page abonnement, pas de prix.
  assert.match(vente, /<div id="offrePro"><section class="op op--vitrine">[\s\S]*?href="\/abonnement\.html"/);
});

test("lien gratuit : l'inscription ; deja connecte, les matchs du jour", () => {
  const js = read("lib/pro-vente.js");
  assert.match(js, /gratuit\.setAttribute\("href", opts\.connecte \? lien\(""\) : lien\("inscription\.html"\)\);/);
});

test("i18n : pro_vente.* complet et identique dans les 7 dictionnaires et leurs parts", () => {
  const ref = Object.keys(DICTS.fr.pro_vente).sort();
  assert.deepEqual(ref, ["example_cta", "free_link", "links_aria", "offer_aria", "offer_fallback_cta", "short_sub", "short_title", "tools_sub"]);
  const cles = [...html.matchAll(/data-i18n(?:-attr="[^"]*:|=")(pro_vente\.\w+)/g)].map((m) => m[1].split(".")[1]);
  assert.ok(cles.length >= 6);
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
    const tout = JSON.stringify(DICTS[l].pro_vente) + " " + DICTS[l].offre_pro.title_sub;
    assert.doesNotMatch(tout, INTERDITS, l);
    assert.doesNotMatch(tout, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, l + " : aucun emoji");
    assert.doesNotMatch(tout, /\d+\s?%\s?(de réussite|of wins|de acierto|Treffer|di successo|de acerto)/i, l + " : aucun chiffre de resultat");
  }
  const texteVente = vente.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, " ");
  assert.doesNotMatch(texteVente, INTERDITS, "texte statique francais");
  assert.doesNotMatch(texteVente, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, "aucun emoji");
});

test("direction visuelle : ni majuscules a chasse fixe, ni vert ni rouge, mouvement reduit respecte", () => {
  const css = read("assets/pro-vente.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(css, /text-transform\s*:\s*uppercase|monospace|Space Mono/i);
  assert.doesNotMatch(css, /#(22c55e|16a34a|10b981|ef4444|dc2626|ff8f85|f43f5e)\b/i, "vert et rouge reserves aux ecarts chiffres");
  assert.match(css, /prefers-reduced-motion:no-preference/);
});

test("pages generees : la page de vente traduite dans chaque version publique", () => {
  const get = (d, k) => k.split(".").reduce((o, p) => (o ? o[p] : undefined), d);
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  for (const dir of DIRS) {
    const page = read(dir + "/pro.html");
    const loc = MARKETS._dirs[dir].locale;
    for (const k of ["pro_vente.short_title", "pro_vente.short_sub", "pro_vente.free_link", "match_page.pro_offert_title", "match_page.pro_offert_cta"]) {
      const v = get(DICTS[loc], k);
      assert.ok(page.includes('data-i18n="' + k + '">' + esc(v) + "<"), dir + " : " + k + " non traduit");
    }
    assert.match(page, new RegExp('href="/' + dir + '/exemple-analyse\\.html"'), dir + " : lien vers l'exemple de la version");
    assert.match(page, new RegExp('href="/' + dir + '/lolly\\.html#pro-offert"'), dir + " : lien vers la page Lolly de la version");
    assert.match(page, new RegExp('id="pvGratuit" href="/' + dir + '/inscription\\.html"'), dir + " : lien vers l'inscription de la version");
    assert.doesNotMatch(page, /Calculateur de mise|Simulateur de capital|data-tool="(stake|bankroll)"/, dir);
    assert.doesNotMatch(page, /pv-cmp|pv-faq|pv-etapes/, dir + " : ancienne page longue");
  }
});
