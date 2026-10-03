"use strict";
// Textes du match offert (3e contre-controle de l'avocat du diable, 30/09/2026).
//  1. Plus de promesse « analyse complete » sur le match offert : la simulation par
//     quart d'heure y reste reservee aux Pro (regle S2, decidee par Clement le 29/09).
//  2. Decision 5 (« une analyse offerte chaque jour ») : la liste preparee pour Clement
//     (docs/DECISION-5-ANALYSE-OFFERTE.md) contient TOUS les textes du site qui font
//     cette promesse, dont match_page.gate_pro_text et HOME_V4.ff1 qui manquaient.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const lire = (f) => fs.readFileSync(path.join(root, f), "utf8");
const LOCALES = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
const dict = (l) => JSON.parse(lire("i18n/dict/" + l + ".json"));
const valeur = (o, cle) => cle.split(".").reduce((a, k) => (a == null ? a : a[k]), o);
function aplatir(o, p, out) {
  out = out || {};
  for (const k of Object.keys(o)) {
    const v = o[k], kk = p ? p + "." + k : k;
    if (v && typeof v === "object" && !Array.isArray(v)) aplatir(v, kk, out);
    else if (typeof v === "string") out[kk] = v;
  }
  return out;
}
const MANIFESTE = lire("scripts/i18n-manifest.js");
function objetManifeste(nom) {
  const ligne = MANIFESTE.split("\n").find((l) => l.startsWith("var " + nom + " = {"));
  assert.ok(ligne, nom);
  return JSON.parse(ligne.slice(ligne.indexOf("=") + 1).trim().replace(/;$/, ""));
}

// « complet » dans chaque langue.
const COMPLET = { fr: /compl[eè]te?s?\b/i, en: /\bfull\b|\bin full\b/i, es: /complet[oa]s?\b/i, "es-mx": /complet[oa]s?\b/i, de: /vollständig/i, it: /complet[oa]\b/i, pt: /complet[oa]s?\b/i };
const CLES_MATCH_OFFERT = [
  "home_app.free_card_cta", "match_page.gate_free_text", "match_page.cta_recall_free", "tools_page.scan_kpi_free",
  "compte_page.benefit_free_analysis", "auth.signup_bullet_analysis", "landing_page.plan_free_feat1",
  "geo.meta.index.description", "demo_page.bar_text",
];

test("la simulation par quart d'heure reste Pro, meme sur le match offert (la raison du texte)", () => {
  const mp = lire("match-page.js");
  assert.match(mp, /body:VUE_PRO\?scenarioCard\(vm\):empty\(t\('match_page\.sim_pro_only'/);
  assert.match(dict("fr").match_page.sim_pro_only, /^Réservé aux abonnés Pro/);
});

test("plus aucune promesse « analyse complete » sur le match offert, dans les 7 langues", () => {
  for (const l of LOCALES) {
    const d = dict(l);
    for (const cle of CLES_MATCH_OFFERT) {
      const v = valeur(d, cle);
      assert.equal(typeof v, "string", l + " " + cle);
      assert.doesNotMatch(v, COMPLET[l], l + " " + cle + " : " + v);
    }
  }
  // Toute phrase francaise qui parle d'une analyse offerte / gratuite ne dit plus « complète ».
  for (const [cle, v] of Object.entries(aplatir(dict("fr")))) {
    for (const phrase of v.split(/(?<=[.!?])\s+/)) {
      if (/offert|gratuit/i.test(phrase)) assert.doesNotMatch(phrase, /analyse compl[eè]te/i, cle + " : " + phrase);
    }
  }
  // Accueil (HOME_V4.ff1, 7 accueils) : manifeste, source et pages fabriquees.
  const v4 = objetManifeste("HOME_V4");
  for (const l of Object.keys(v4)) assert.doesNotMatch(v4[l].ff1, COMPLET[l], "HOME_V4." + l + ".ff1 : " + v4[l].ff1);
  // Fusion V3 (30/09/2026) : les cartes de prix ecrites en dur sur l'accueil sont remplacees par
  // la grille de prix (assets/pricing-grid.js, textes pricing_grid.*) : la regle ff1 n'a plus de cible.
  for (const f of ["index.html", "fr/index.html", "en/index.html", "es/index.html", "gb/index.html", "mx/index.html", "za/index.html"]) {
    const html = lire(f);
    assert.doesNotMatch(html, /Analyse gratuite du jour, complète|free analysis, in full|del día, completo/, f);
    assert.doesNotMatch(html, /home_app\.free_card_cta','Voir l’analyse complète'/, f);
  }
  // Repli francais dans le code, message Telegram du match gratuit, guides du blog.
  assert.doesNotMatch(lire("match-page.js"), /pour voir l’analyse complète/);
  assert.doesNotMatch(lire("tools-page.js"), /Analyse complète offerte/);
  assert.doesNotMatch(lire("lib/telegram-posts.js"), /analyse complète/i);
  // Fusion V3 (30/09/2026) : les guides « value bet » et « prediction IA » (mise Kelly) sont retires du site.
  for (const f of ["blog/guides/prediction-ia-football-guide-2026.html", "blog/guides/guide-paris-sportifs-debutant-complet.html", "blog/guides/value-bet-guide-complet-2026.html"].filter((x) => fs.existsSync(path.join(__dirname, "..", x)))) {
    assert.doesNotMatch(lire(f), /analyse complète est offerte/i, f);
  }
});

// Promesse d'une analyse gratuite CHAQUE JOUR (francais).
const PROMESSE_QUOTIDIENNE = /(?:offert|gratuit)[^.!?]*?(?:chaque jour|par jour|du jour|quotidien)|(?:du jour|chaque jour|par jour|quotidien)[^.!?]*?(?:offert|gratuit)/i;
const DOC = lire("docs/DECISION-5-ANALYSE-OFFERTE.md");
const listee = (cle) => DOC.includes("`" + cle + "`");
const sansBalises = (s) => s.replace(/\\(["'])/g, "$1").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

test("decision 5 : les 2 cles oubliees sont dans la liste (preuve de l'avocat)", () => {
  assert.ok(listee("match_page.gate_pro_text"), "match_page.gate_pro_text");
  assert.ok(listee("HOME_V4.ff1"), "HOME_V4.ff1");
  assert.match(dict("fr").match_page.gate_pro_text, PROMESSE_QUOTIDIENNE);
  assert.match(objetManifeste("HOME_V4").fr.ff1, PROMESSE_QUOTIDIENNE);
});

test("decision 5 : la liste contient TOUS les textes du site qui promettent une analyse gratuite chaque jour", () => {
  const manquantes = [];
  // Dictionnaire francais et textes SEO : par cle.
  for (const [cle, v] of Object.entries(aplatir(dict("fr")))) if (PROMESSE_QUOTIDIENNE.test(v) && !listee(cle)) manquantes.push("i18n/dict/fr.json " + cle);
  for (const [cle, v] of Object.entries(aplatir(JSON.parse(lire("i18n/seo/fr.json"))))) if (PROMESSE_QUOTIDIENNE.test(v) && !listee(cle)) manquantes.push("i18n/seo/fr.json " + cle);
  // Manifeste des pages : chaque texte francais concerne figure mot pour mot dans la liste.
  const litteral = /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g;
  let m;
  while ((m = litteral.exec(MANIFESTE)) !== null) {
    const s = sansBalises(m[1] !== undefined ? m[1] : m[2]);
    if (PROMESSE_QUOTIDIENNE.test(s) && !DOC.includes(s)) manquantes.push("scripts/i18n-manifest.js « " + s + " »");
  }
  assert.deepEqual(manquantes, [], "a ajouter dans docs/DECISION-5-ANALYSE-OFFERTE.md");
  // Option A appliquee EN PARTIE le 30/09/2026 (controle des chiffres publics) : la liste le dit.
  assert.match(DOC, /Option A appliquée en partie le 30\/09\/2026/);
  assert.doesNotMatch(dict("fr").landing_page.hero_cta_note_b, /chaque jour/, "option A appliquee sur la landing");
});

// Contre-controle ronde 4.1 (30/09/2026). Preuves de l'avocat : 1) les 3 landings pays
// ecrites a la main (gb, za, mx) promettaient encore « 1 full analysis every day » /
// « 1 análisis completo cada día » ; ce test ne les lisait pas. 2) La liste de la
// decision 5 se disait complete sans ces landings ni les CGV des 8 autres versions.
test("landings pays ecrites a la main : plus de « full analysis » ni « análisis completo »", () => {
  // (« Full access to the blog » reste : le blog est bien en acces complet.)
  for (const f of ["gb/landing.html", "za/landing.html", "mx/landing.html"]) {
    assert.doesNotMatch(sansBalises(lire(f)), /\bfull (?:match )?analys[ie]s|analys[ie]s in full|an[aá]lisis complet[oa]/i, f);
  }
});

// Promesse d'une analyse gratuite chaque jour, dans les 7 langues du site.
// Ronde 5 (30/09/2026) : « of the day » / « of today » ajoutes. Sans eux, 6 articles
// gb/za (« The match of the day is always free ») passaient le test sans etre listes
// (preuve de l'avocat : avocat-r42/trou-of-the-day.js).
const GRATUIT_7 = /\b(?:offert|offerte|gratuit|gratuite|free|gratis|gratuito|gratuita|kostenlos|kostenlose|oferecid[oa])\b/i;
const JOUR_7 = /chaque jour|par jour|du jour|quotidien|every day|each day|per day|a day\b|\bdaily\b|today['’]s|of the day|of today|cada d[ií]a|por d[ií]a|al d[ií]a|del d[ií]a|de hoy|t[äa]glich|pro tag|jeden tag|des tages|ogni giorno|al giorno|del giorno|todos os dias|por dia|do dia|di oggi/i;
const AIDE = /24 ?h|24 hours|24 horas|24 stunden|24 ore|counsel|helpline|hotline|[ée]coute/i;
function pagesPubliques() {
  const out = [];
  const marche = (d) => {
    for (const n of fs.readdirSync(path.join(root, d))) {
      if (n.startsWith(".") || n === "match") continue; // pages de match : clés match.* deja listees
      const r = d + "/" + n;
      if (fs.statSync(path.join(root, r)).isDirectory()) marche(r);
      else if (n.endsWith(".html")) out.push(r);
    }
  };
  ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx", "blog", "legal"].filter((d) => fs.existsSync(path.join(root, d))).forEach(marche);
  return out.concat(fs.readdirSync(root).filter((f) => f.endsWith(".html")));
}
// Ronde 4.2 (30/09/2026) : l'apostrophe est DECODEE avant la recherche. Avant, « &#39; »
// etait efface : « Today&#39;s free analysis » devenait « Today s free analysis » et
// 25 pages clubs en/gb/za passaient le test sans etre dans la liste (preuve de l'avocat).
const ENTITES = { "&#39;": "'", "&#x27;": "'", "&apos;": "'", "&rsquo;": "’", "&#8217;": "’", "&lsquo;": "‘", "&amp;": "&", "&nbsp;": " ", "&#160;": " " };
const decoder = (s) => s.replace(/&(?:#39|#x27|apos|rsquo|#8217|lsquo|amp|nbsp|#160);/gi, (e) => ENTITES[e.toLowerCase()]);
const texteVisible = (html) => decoder(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/&[a-z#0-9]+;/gi, " ");
const GROUPES = [...DOC.matchAll(/`([^`\s]+\.html)`/g)].map((m) => m[1]);
const couvert = (f) => GROUPES.some((g) => new RegExp("^" + g.split("*").map((x) => x.replace(/[.?+^$()[\]{}|\\]/g, "\\$&")).join("[^/]+") + "$").test(f));

test("decision 5 : chaque page publiee (7 langues) qui promet une analyse gratuite chaque jour est dans la liste", () => {
  const manquantes = [];
  for (const f of pagesPubliques()) {
    const t = texteVisible(lire(f));
    const promesse = t.split(/[.!?\n]+/).find((ph) => ph.length <= 400 && GRATUIT_7.test(ph) && JOUR_7.test(ph) && !AIDE.test(ph));
    if (promesse && !couvert(f)) manquantes.push(f + " « " + promesse.replace(/\s+/g, " ").trim().slice(0, 90) + " »");
  }
  assert.deepEqual(manquantes, [], "a ajouter dans docs/DECISION-5-ANALYSE-OFFERTE.md");
  // Preuve de l'avocat : les 3 landings pays sont nommees, et les pages de match aussi.
  for (const f of ["gb/landing.html", "za/landing.html", "mx/landing.html", "match/*.html", "*/match/*.html"]) assert.ok(DOC.includes("`" + f + "`"), f);
  // Option A appliquee sur les 3 landings pays (30/09/2026).
  for (const f of ["gb/landing.html", "za/landing.html", "mx/landing.html"]) assert.doesNotMatch(lire(f), /free analysis every day|analysis offered every day|an[aá]lisis gratis cada d[ií]a|Free daily analysis|An[aá]lisis diario gratis/i, f + " : promesse quotidienne retiree");
});

test("decision 5 : les pages clubs en/gb/za (« Today's free analysis ») sont detectees et listees", () => {
  const promet = (f) => texteVisible(lire(f)).split(/[.!?\n]+/).some((ph) => ph.length <= 400 && GRATUIT_7.test(ph) && JOUR_7.test(ph) && !AIDE.test(ph));
  const clubs = ["en/clubs", "gb/clubs", "za/clubs"].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((n) => n.endsWith(".html")).map((n) => d + "/" + n));
  const detectees = clubs.filter(promet);
  assert.ok(detectees.length >= 25, "pages clubs en/gb/za detectees : " + detectees.length);
  assert.deepEqual(detectees.filter((f) => !couvert(f)), []);
  assert.ok(DOC.includes("`*/clubs/*.html`"), "groupe */clubs/*.html dans la liste");
  // Le texte source : clubs.free_link en anglais (option A non appliquee).
  assert.equal(dict("en").clubs.free_link, "Today's free analysis");
});

test("decision 5 : les CGV des 9 versions qui promettent une analyse par jour sont nommees une par une", () => {
  const PAR_JOUR = /(?:match|partido|spiels|partita|jogo)[^.;<]{0,40}(?:par jour|per day|al d[ií]a|pro tag|al giorno|por dia)/i;
  const cgv = pagesPubliques().filter((f) => /(?:^|\/)cgv\.html$/.test(f) && !/\/archives\//.test(f));
  assert.ok(cgv.length >= 15, "cgv trouvees : " + cgv.length);
  // CGV du 01/10/2026 (9 versions) : plus aucune analyse promise « par jour » (option A appliquee).
  const avecPromesse = cgv.filter((f) => PAR_JOUR.test(sansBalises(lire(f))));
  assert.deepEqual(avecPromesse, [], "CGV qui promettent encore une analyse par jour");
  for (const v of ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx"]) assert.match(DOC, new RegExp("\\n\\| " + v + " \\| `"), "version " + v);
});

// Ronde 5 (30/09/2026). Preuve de l'avocat : 3 articles gb et 3 articles za disent « The
// match of the day is always free ». Le motif JOUR_7 ne contenait pas « of the day » : ils
// n'etaient ni vus par le test, ni dans la liste. Rien n'est change sur les pages (option A
// non appliquee) : ils sont detectes et listes.
test("decision 5 : les 6 articles gb/za (« The match of the day is always free ») sont detectes et listes", () => {
  const promet = (f) => texteVisible(lire(f)).split(/[.!?\n]+/).some((ph) => ph.length <= 400 && GRATUIT_7.test(ph) && JOUR_7.test(ph) && !AIDE.test(ph));
  const articles = ["gb/articles", "za/articles"].flatMap((d) => fs.readdirSync(path.join(root, d)).filter((n) => n.endsWith(".html")).map((n) => d + "/" + n));
  const detectes = articles.filter(promet);
  assert.deepEqual(detectes.sort(), [
    "gb/articles/fractional-vs-decimal-odds.html", "gb/articles/premier-league-derbies-guide.html", "gb/articles/premier-league-season-calendar-explained.html",
    "za/articles/betway-premiership-psl-explained.html", "za/articles/psl-cup-competitions-mtn8-nedbank-carling.html", "za/articles/soweto-derby-chiefs-pirates-guide.html",
  ]);
  assert.deepEqual(detectes.filter((f) => !couvert(f)), []);
  for (const g of ["gb/articles/*.html", "za/articles/*.html"]) assert.ok(DOC.includes("`" + g + "`"), g + " dans la liste");
  // Le motif attrape la phrase elle-meme, et plus seulement « today's ».
  assert.ok(GRATUIT_7.test("The match of the day is always free") && JOUR_7.test("The match of the day is always free"));
  // Option A non appliquee : la phrase est encore sur les 6 pages.
  for (const f of detectes) assert.match(lire(f), /The match of the day is always free\./, f);
});
