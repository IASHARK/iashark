"use strict";
// Chantier GEO/SEO du 23/10/2026 (actions A2 et A3), verifie sur le site
// CONSTRUIT par scripts/build-public.js (repertoire temporaire) :
//   - /llms.txt publie : presentation courte d'IASHARK pour les assistants IA,
//     liens internes existants, aucun chiffre (hors adresses et « 18+ »),
//     aucun element de la recette (memes termes interdits que la page
//     Methodologie, tests/helpers/recette-interdite.js), aucune promesse ;
//     calendrier et limites repris mot pour mot de la Methodologie validee
//     (« calculees a l'avance, une fois par jour », textes IA non relus un
//     par un) ;
//   - cle IndexNow publiee a la racine ;
//   - X-Robots-Tag: noindex sur chaque match/*.json (donnees lues par les
//     pages, jamais des documents a indexer), sans toucher aux pages match ;
//   - netlify.toml : « Pretty URLs » coupe (liens .html conserves).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { ROOT, buildSite } = require("./helpers/built-site.js");
const { INTERDITS } = require("./helpers/recette-interdite.js");
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

let site;
before(() => { site = buildSite(); });
after(() => { if (site) site.cleanup(); });
const built = (rel) => fs.readFileSync(path.join(site.dir, rel), "utf8");
const builtExists = (rel) => fs.existsSync(path.join(site.dir, rel));

test("llms.txt : publie, titre IASHARK, resume, pas un bookmaker, 18+ et jeu responsable", () => {
  assert.ok(builtExists("llms.txt"), "llms.txt absent de dist/");
  const txt = built("llms.txt");
  assert.equal(txt, src("llms.txt"), "copie publiee differente de la source");
  assert.match(txt, /^# IASHARK\n\n> /, "format llms.txt : titre H1 puis resume en citation");
  assert.match(txt, /calculées à l'avance, une fois par jour/);
  assert.doesNotMatch(txt, /publi[ée]e?s? avant (le coup d'envoi|les matchs)/, "formulation remplacee par celle de la methodologie");
  assert.match(txt, /pas un bookmaker/);
  assert.match(txt, /18\+/);
  assert.match(txt, /https:\/\/iashark\.com\/fr\/jeu-responsable\.html/);
  assert.match(txt, /contact@iashark\.com/);
  assert.doesNotMatch(txt, /IAShark/, "nom de marque unique : IASHARK");
});

test("llms.txt : limites reprises mot pour mot de la page Methodologie validee", () => {
  const txt = built("llms.txt");
  const methodo = src("legal/fr/methodologie.html");
  // Formulations deja validees (legal/fr/methodologie.html, section Limites).
  [
    "Les analyses sont calculées à l'avance, une fois par jour, et ne sont pas refaites juste avant le coup d'envoi.",
    // 23/10/2026 : exception des buteurs (.github/workflows/buteurs-jour-de-match.yml, depuis le 04/10) :
    // un joueur absent de la composition officielle est retire, chances et option mise en avant inchangees.
    "Une blessure de dernière minute, une composition inattendue ou tout autre imprévu ne change ni les chances calculées ni l'option mise en avant.",
    "Exception : le jour du match, les buteurs proposés sont revus quand la composition officielle est connue à temps, et un joueur absent en est retiré.",
    "ne sont pas relus un par un avant publication et peuvent contenir des erreurs d'interprétation.",
    "En cas de différence, ce sont les chiffres affichés qui font foi.",
  ].forEach(function (phrase) {
    assert.ok(txt.includes(phrase), "llms.txt : limite absente : " + phrase);
    assert.ok(methodo.includes(phrase), "methodologie : phrase introuvable (formulation modifiee ?) : " + phrase);
  });
  assert.match(txt, /Les textes rédigés par IA ne sont pas relus un par un avant publication/);
  // Faux depuis le 04/10/2026 : les buteurs absents de la composition officielle sont retires.
  assert.doesNotMatch(txt + methodo, /n'est pas pris en compte/, "phrase « composition inattendue non prise en compte » revenue");
  // Le plan du site ne liste que les pages a indexer, pas « toutes les pages publiques ».
  assert.match(txt, /\(https:\/\/iashark\.com\/sitemap\.xml\) : les pages à indexer/);
  assert.doesNotMatch(txt, /toutes les pages publiques/);
});

test("llms.txt : chaque lien interne existe dans le site construit", () => {
  const links = Array.from(built("llms.txt").matchAll(/https:\/\/iashark\.com(\/[^\s)]*)/g)).map((m) => m[1]);
  assert.ok(links.length >= 10, "trop peu de liens");
  links.forEach((p) => {
    const rel = p === "/" ? "index.html" : p.endsWith("/") ? p.slice(1) + "index.html" : p.slice(1);
    assert.ok(builtExists(rel), p + " : page absente du site construit");
    if (rel.endsWith(".html")) assert.doesNotMatch(built(rel).split("</head>")[0], /<meta name="robots" content="[^"]*noindex/, p + " : page en noindex");
  });
});

test("llms.txt : aucun chiffre hors adresses, aucune recette, aucune promesse ni mise", () => {
  const txt = built("llms.txt");
  // Seules exceptions : adresses, e-mail, « 18+ » et le nom propre « Ligue 1 ».
  const prose = txt.replace(/https?:\/\/[^\s)]+/g, " ").replace(/[\w.+-]+@[\w.-]+/g, " ").replace(/18\+/g, " ").replace(/\bLigue 1\b/g, " ");
  assert.doesNotMatch(prose, /\d/, "chiffre publie dans llms.txt");
  INTERDITS.forEach(function (pair) { assert.doesNotMatch(txt, pair[0], "llms.txt : " + pair[1]); });
  assert.doesNotMatch(txt, /gains? garantis?|r[ée]sultats? garantis?|gagnant|prono s[uû]r|\bROI\b|rentabilit|taux de r[ée]ussite|bankroll|esp[ée]rance|\bmises? (de|conseill)|value bet|bonus/i);
});

test("cle IndexNow publiee a la racine du site construit", () => {
  const IN = require("../scripts/indexnow-ping.js");
  assert.ok(builtExists(IN.KEY_FILE), IN.KEY_FILE + " absent de dist/");
  assert.equal(built(IN.KEY_FILE).trim(), IN.KEY);
});

test("_headers construit : X-Robots-Tag noindex sur chaque match/*.json, jamais sur les pages match", () => {
  const headers = built("_headers");
  const jsons = fs.readdirSync(path.join(site.dir, "match")).filter((f) => f.endsWith(".json"));
  assert.ok(jsons.length > 0, "aucun match/*.json publie");
  jsons.forEach((f) => {
    assert.ok(headers.includes("\n/match/" + f + "\n  X-Robots-Tag: noindex\n"), f + " : noindex absent");
  });
  // La regle large /match/* couvre aussi les pages HTML : elle ne porte que le cache.
  const large = headers.split("\n/match/*\n")[1].split(/\n(?=\S)/)[0];
  assert.doesNotMatch(large, /X-Robots-Tag/);
  assert.doesNotMatch(headers, /\n\/match\/[^\n]*\.html\n  X-Robots-Tag/);
  // Source intacte : la regle est ajoutee a la copie publiee seulement.
  assert.doesNotMatch(src("_headers"), /\/match\/\d+\.json/);
});

test("netlify.toml : « Pretty URLs » coupe (liens .html conserves, comme les canonical)", () => {
  assert.match(src("netlify.toml"), /\[build\.processing\.html\]\s*\n\s*pretty_urls = false/);
});
