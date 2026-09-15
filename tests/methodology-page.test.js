"use strict";
// Page Methodologie (legal/<dir>/methodologie.html -> /<dir>/methodologie.html)
// et textes de methode : conformes au code reel, sans valeurs exactes des seuils
// (BLOCKED_DECISION: NIVEAU_DE_DIVULGATION), sans placeholder visible, sans
// section de publication des resultats, JSON-LD AboutPage + Organization sans
// Person. Liens depuis a-propos, les pieds de page et le bloc signal des pages
// match. Libelle "probabilite estimee" (conf = probabilite du modele / 10),
// jamais affiche pour un match non offert.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));
const MARKETS = JSON.parse(read("config/markets.json"));
const DIRS = ["fr", "en", "gb", "za", "es", "mx"];
const FAMILY = { fr: "fr", en: "en", gb: "en", za: "en", es: "es", mx: "es" };
const TITLES = {
  fr: "Méthodologie IAShark : données, modèle, limites",
  en: "IAShark methodology: data, model and limits",
  es: "Metodología de IAShark: datos, modelo y límites",
};

// Meme expression que scripts/build-public.js (notes internes retirees du HTML servi).
const BUILD_PUBLIC = read("scripts/build-public.js");
const STRIP_RE = /<!--\s*(LEGAL REVIEW|DRAFT|BLOCKED_DECISION|TODO|NOTE INTERNE)[\s\S]*?-->\s*/g;

function visibleText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, "").replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, "").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");
}

test("config : methodologie.html declaree dans _legalFiles, localisee par i18n.js", () => {
  assert.equal(MARKETS._legalFiles.methodology, "methodologie.html");
  assert.match(read("i18n/i18n.js"), /"methodologie\.html"/);
});

test("sources et pages generees : fr, en, gb, za, es, mx (pas de/it/pt)", () => {
  DIRS.forEach(function (d) {
    assert.ok(exists("legal/" + d + "/methodologie.html"), "source " + d);
    assert.ok(exists(d + "/methodologie.html"), "page generee " + d);
  });
  ["de", "it", "pt"].forEach(function (d) { assert.ok(!exists("legal/" + d + "/methodologie.html"), d); });
});

test("title/meta de notes.md, canonical du repertoire, JSON-LD AboutPage + Organization sans Person", () => {
  DIRS.forEach(function (d) {
    const html = read(d + "/methodologie.html");
    const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
    assert.equal(title, TITLES[FAMILY[d]], d);
    assert.ok(title.length <= 60, d + " title <= 60");
    const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
    assert.ok(desc && desc.replace(/&#x27;|&#39;/g, "'").length <= 155, d + " description <= 155");
    assert.match(html, new RegExp('<link rel="canonical" href="https://iashark\\.com/' + d + '/methodologie\\.html">'));
    const blocks = Array.from(html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)).map((m) => JSON.parse(m[1]));
    const nodes = [].concat.apply([], blocks.map((b) => b["@graph"] || [b]));
    const types = nodes.map((n) => n["@type"]);
    assert.ok(types.includes("AboutPage"), d + " AboutPage");
    assert.ok(types.includes("Organization"), d + " Organization");
    assert.ok(!types.includes("Person"), d + " : aucun noeud Person");
    const org = nodes.find((n) => n["@type"] === "Organization");
    assert.equal(org.name, "IAShark");
    assert.ok(!("legalName" in org), "legalName bloque");
    assert.doesNotMatch(JSON.stringify(blocks), /BLOCKED_DECISION/);
    assert.doesNotMatch(title + " " + desc, /prono s[uû]r|gagnant|bonus|garanti|\bsure\b|winner|guarantee|seguro|ganador|garantizado/i);
  });
});

test("decisions bloquees : en commentaire HTML seulement, retirees par build-public, jamais visibles", () => {
  assert.ok(BUILD_PUBLIC.includes("(LEGAL REVIEW|DRAFT|BLOCKED_DECISION|TODO|NOTE INTERNE)"), "regex de build-public.js modifiee : mettre a jour ce test");
  DIRS.forEach(function (d) {
    const html = read(d + "/methodologie.html");
    ["IDENTITE_LEGALE", "NOM_RESPONSABLE_EDITORIAL", "NIVEAU_DE_DIVULGATION"].forEach(function (k) {
      assert.match(html, new RegExp("<!-- BLOCKED_DECISION: " + k), d + " " + k);
    });
    assert.doesNotMatch(visibleText(html), /BLOCKED_DECISION|\[À VALIDER|\[SUBJECT TO|\[PENDIENTE/, d);
    const served = html.replace(STRIP_RE, "");
    assert.doesNotMatch(served, /BLOCKED_DECISION|LEGAL REVIEW/, d + " : note interne restante apres build-public");
    // Editeur affiche + lien de contact existant.
    assert.match(visibleText(html), /IAShark/);
    assert.match(html, /href="mailto:contact@iashark\.com"/);
    assert.match(html, /href="mentions-legales\.html"/);
  });
});

test("contenu : aucune valeur exacte de seuil, aucune section de publication des resultats", () => {
  DIRS.forEach(function (d) {
    const txt = visibleText(read(d + "/methodologie.html"));
    // Seuils du code (lib/decision.js, update-data.yml, safe-pick, free match, paliers).
    assert.doesNotMatch(txt, /1[.,]50|\b97\s?%|\b55\s?%|\b45\s?%|1[.,]75|2[.,]20|\b15 min|0[.,]0845|1[.,]35|≥|≤/, d + " : valeur de seuil publiee");
    assert.doesNotMatch(txt, /publierons|publication des résultats|will measure and publish|mediremos y publicaremos|bilan|track record|balance de resultados/i, d);
    // Faits verifies dans le code.
    assert.match(txt, /Dixon-Coles/);
    assert.match(txt, /Shin/);
    assert.match(txt, /5[  .,]?000/);
    assert.match(txt, /06:00 UTC/);
    assert.match(txt, /score-matrix-dc-early-season-v2/);
  });
  assert.doesNotMatch(visibleText(read("mx/methodologie.html")), /\bcuotas?\b/i, "/mx/ : momios");
});

test("les faits cites existent dans le code", () => {
  const pipeline = read(".github/workflows/update-data.yml");
  assert.match(pipeline, /cron: '0 6 \* \* \*'/);
  assert.match(pipeline, /const MODEL_VERSION = 'score-matrix-dc-early-season-v2';/);
  assert.match(pipeline, /pickMarketDeterministic\(allMarkets,\{minOdds:1\.50\}\)/);
  assert.match(read("lib/decision.js"), /const PROBABILITE_MAX_RECOMMANDABLE = 97;/);
  assert.match(read("lib/models.js"), /const n = opts\.n \|\| 5000;/);
  assert.match(read("lib/models.js"), /function shinProbabilities\(/);
  assert.match(read("lib/engine.js"), /buildAdaptiveDixonColesMatrix\(lambdaH,lambdaA\)/);
  assert.match(read("lib/engine.js"), /elo_used:false/);
  assert.match(pipeline, /conf:pickedMarket\?Math\.round\(\(pickedMarket\.prob\/10\)\*10\)\/10/);
  const calib = JSON.parse(read("lib/data/calibration-params.json"));
  assert.equal(JSON.stringify(calib).split('"wired":true').length - 1, 3, "trois courbes de calibration branchees");
  assert.equal(JSON.parse(read("config/leagues.json")).leagues.length, 19);
});

test("liens Methodologie : a-propos, pieds de page, bloc signal des pages match ; retires ou la page n'existe pas", () => {
  ["fr", "gb", "za", "en", "mx", "es"].forEach(function (d) {
    assert.match(read(d + "/a-propos.html"), new RegExp('href="/' + d + '/methodologie\\.html"'), d + "/a-propos");
    assert.match(read(d + "/index.html"), new RegExp('href="/' + d + '/methodologie\\.html"'), d + "/index (pied de page)");
    assert.match(read(d + "/match.html"), new RegExp('href="/' + d + '/methodologie\\.html"'), d + "/match (pied de page)");
  });
  ["de", "it", "pt"].forEach(function (d) {
    ["a-propos.html", "index.html", "match.html"].forEach(function (f) {
      assert.doesNotMatch(read(d + "/" + f), /methodologie\.html/, d + "/" + f + " : lien vers une page absente");
    });
  });
  const js = read("match-page.js");
  const signal = js.slice(js.indexOf("function signalCard(vm)"), js.indexOf("function marketsCard"));
  const gate = js.slice(js.indexOf("function gateCard(vm,opts)"), js.indexOf("function renderAuthWall"));
  assert.ok(signal.includes("methodLink()") && gate.includes("methodLink()"));
  assert.match(js, /METHODOLOGY_DIRS=\['fr','gb','za','en','mx','es'\]/);
  assert.match(read("scripts/seo-pages.js"), /"methodologie\.html": "footer\.methodology"/);
});

test("a-propos : plus de convergence de modeles, de methode proprietaire ni de 4 modeles croises", () => {
  const src = read("a-propos.html");
  const txt = visibleText(src);
  assert.doesNotMatch(txt, /convergent|propriétaire|plusieurs saisons|compositions probables|MODÈLES CROISÉS|value bet/i);
  assert.match(txt, /Dixon-Coles/);
  ["fr", "en", "es", "es-mx", "de", "it", "pt"].forEach(function (loc) {
    const a = JSON.parse(read("i18n/dict/" + loc + ".json")).about_page;
    const all = JSON.stringify(a);
    assert.doesNotMatch(all, /convergent|converge|propriétaire|proprietary|propietari|proprietär|proprietari|value bet/i, loc);
    assert.ok(a.method_link, loc + " method_link");
  });
  assert.doesNotMatch(read("tools-page.js"), /Modèles croisés/);
  assert.doesNotMatch(read("index.html"), /Modèles croisés/);
});

test("libelle probabilite estimee dans les 7 dictionnaires, et jamais de chiffre conf pour un match non offert", () => {
  const expected = { fr: /Probabilité estimée/, en: /Estimated probability/, es: /Probabilidad estimada/, "es-mx": /Probabilidad estimada/, de: /Geschätzte Wahrscheinlichkeit/, it: /Probabilità stimata/, pt: /Probabilidade estimada/ };
  Object.keys(expected).forEach(function (loc) {
    const dict = JSON.parse(read("i18n/dict/" + loc + ".json"));
    assert.match(dict.match_page.sig_conf_label, expected[loc], loc);
    assert.match(dict.clubs.conf_label, expected[loc], loc);
    assert.doesNotMatch(JSON.stringify(dict.match_page) + JSON.stringify(dict.clubs), /indice de confiance|confidence index|índice de confianza|indice di fiducia|Vertrauensindex|índice de confiança/i, loc);
  });
  const pipeline = read(".github/workflows/update-data.yml");
  assert.doesNotMatch(pipeline, /\(m\.conf!=null&&!m\.no_signal\)\?\(' — '\+confiance/, "resume SEO accueil : conf d'un match non offert");
  const home = read("index.html");
  // Liste des matchs (home-list.js, 16/09/2026) : verrou avant toute lecture de conf.
  const list = read("home-list.js");
  assert.match(list, /if\(!ctx\.isPro&&!free\)return \{state:'locked',band:probBandOf\(m\)\};/);
  assert.match(list, /tf\('home_list\.aria_prob','Probabilité estimée \{p\} sur 10\.'/);
  assert.doesNotMatch(home, /home_app\.seo_confidence">[^<]*<\/span> [0-9.,]+\/10<\/li>/, "resume SEO statique : conf d'un match non offert");
});

test("prompts IA du pipeline : description conforme au code (pas d'ensemble avec Elo, le LLM ne choisit rien)", () => {
  const pipeline = read(".github/workflows/update-data.yml");
  assert.doesNotMatch(pipeline, /ensemble Poisson\+Dixon-Coles\+Monte-Carlo\+Elo/);
  assert.doesNotMatch(pipeline, /coherence du marche que tu choisis|choisis autre marche/);
  assert.doesNotMatch(pipeline, /pas de cote fiable >= 1\.50 disponible pour ce match/);
  assert.match(pipeline, /matrice de scores Dixon-Coles, calibree sur 1X2 \/ plus de 2\.5 buts \/ BTTS/);
});
