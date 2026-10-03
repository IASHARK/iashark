"use strict";
// Contre-controle de l'avocat du diable (30/09/2026), accueil :
//  1. « 5000 simulations » ne s'affiche que si le match porte le champ
//     nb_simulations (un pari du moteur v3 est calcule exactement, sans
//     simulation) : chiffre cle de l'accueil et etiquette de la liste, 7 accueils ;
//  2. la FAQ ne dit plus « choisie parmi les ecarts les plus favorables » ni
//     « offerte chaque jour » : le match offert suit une regle fixe du moteur et
//     certains jours il n'y en a pas (regle du v3).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const HL = require("../home-list.js");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const ACCUEILS = ["index.html", "fr/index.html", "en/index.html", "es/index.html", "gb/index.html", "mx/index.html", "za/index.html"];

const NOW = Date.parse("2026-10-03T10:00:00Z");
function helpers() {
  const H = HL.defaultHelpers();
  return Object.assign(H, {
    leagueName: (m) => m.league || m.league_key,
    heure: () => "20:00",
    matchTimestamp: () => NOW + 3 * 3600e3,
    matchDay: () => "2026-10-03",
    translateMarket: (r) => String(r),
    marketIdLabel: () => null,
    hasReliableModelOutput: () => true,
    lien: (p) => "/" + p,
  });
}
const ctx = { isPro: false, freeMatchId: null, nowTs: NOW, favorites: { has: () => false, list: () => [] }, collapsed: {}, lockedHref: "match" };
const match = (extra) => Object.assign({ id: 1, league_key: "ligue1", league: "Ligue 1", home: { n: "Lens" }, away: { n: "Lille" }, date: "2026-10-03 20:00", has_signal: true }, extra || {});

test("liste : aucune etiquette « simulations » sans le champ nb_simulations", () => {
  const sans = HL.renderMatchRow(match(), ctx, helpers(), 0);
  assert.doesNotMatch(sans, /hl-tag-sim|simulations/, "pari v3 (calcul exact) : aucun nombre de simulations");
  const avec = HL.renderMatchRow(match({ nb_simulations: 20000 }), ctx, helpers(), 0);
  assert.match(avec, /hl-tag-sim">20[\s  .,]?000 simulations</, "le vrai nombre, jamais 5000 par defaut");
  // Valeurs non valables : rien.
  for (const v of [0, -5, 12.5, "abc", null]) {
    assert.doesNotMatch(HL.renderMatchRow(match({ nb_simulations: v }), ctx, helpers(), 0), /hl-tag-sim/);
  }
  assert.doesNotMatch(read("home-list.js"), /simulations:5000/);
});

test("chiffre cle « N simulations par match » : seulement si TOUS les matchs portent nb_simulations", () => {
  assert.equal(HL.simulationsParMatch([]), null);
  assert.equal(HL.simulationsParMatch([match(), match({ nb_simulations: 5000 })]), null);
  assert.equal(HL.simulationsParMatch([match({ nb_simulations: 5000 }), match({ nb_simulations: 10000 })]), 5000);
});

test("7 accueils : chiffre cle cache par defaut, sans « 5000 » ecrit en dur", () => {
  for (const f of ACCUEILS) {
    const html = read(f);
    const kpi = html.match(/<div id="kpiSimulations"[^>]*>[\s\S]*?<\/div>/);
    assert.ok(kpi, f + " : bloc #kpiSimulations");
    assert.match(kpi[0], /style="display:none"/, f + " : cache tant que nb_simulations n'existe pas");
    assert.doesNotMatch(kpi[0], /5[\s.,]?000/, f);
    assert.match(html, /majKpiSimulations\(allMatchs\);/, f);
    assert.match(html, /IasharkHomeList\.simulationsParMatch\(list\)/, f);
    assert.doesNotMatch(html, /return n>0\?n:5000/, f + " : plus de 5000 par defaut");
  }
});

test("FAQ de l'accueil : conforme a la regle du match offert, dans les 7 accueils", () => {
  const INTERDIT = /écarts les plus favorables|most favourable gaps|diferencias más favorables|günstigsten Abweichungen|scarti più favorevoli|diferenças mais favoráveis|offerte chaque jour|free every day|gratis cada día/;
  const ATTENDU = {
    "index.html": "Certains jours, aucun match n’est offert.",
    "fr/index.html": "Certains jours, aucun match n’est offert.",
    "en/index.html": "Some days, there is no free match.",
    "gb/index.html": "Some days, there is no free match.",
    "za/index.html": "Some days, there is no free match.",
    "es/index.html": "Algunos días no hay partido gratis.",
    "mx/index.html": "Algunos días no hay partido gratis.",
  };
  for (const f of ACCUEILS) {
    const html = read(f);
    assert.doesNotMatch(html, INTERDIT, f);
    assert.ok(html.includes(ATTENDU[f]), f + " : jours sans match offert annonces");
  }
  // Source des traductions : plus aucune version de l'ancienne phrase de la FAQ.
  const manifest = read("scripts/i18n-manifest.js");
  assert.doesNotMatch(manifest, /écarts les plus favorables|most favourable gaps|diferencias más favorables|günstigsten Abweichungen|scarti più favorevoli|diferenças mais favoráveis/);
});

// 2e contre-controle de l'avocat du diable (30/09/2026).
test("FAQ : plus de « le même contenu que pour un abonné » (la simulation par quart d'heure est réservée aux Pro)", () => {
  const MEME = /même contenu que|same content a subscriber|mismo contenido que recibe|derselbe Inhalt wie|stesso contenuto che riceve|mesmo conteúdo que recebe/;
  const ATTENDU = {
    "index.html": "tu lis l’analyse du match offert. Ce match est désigné",
    "fr/index.html": "tu lis l’analyse du match offert. Ce match est désigné",
    "en/index.html": "you can read the analysis of the free match. That match is picked",
    "gb/index.html": "you can read the analysis of the free match. That match is picked",
    "za/index.html": "you can read the analysis of the free match. That match is picked",
    "es/index.html": "lees el análisis del partido gratis. Ese partido lo designa",
    "mx/index.html": "lees el análisis del partido gratis. Ese partido lo designa",
  };
  for (const f of ACCUEILS) {
    const html = read(f);
    assert.doesNotMatch(html, MEME, f);
    assert.ok(html.includes(ATTENDU[f]), f);
  }
  const manifest = read("scripts/i18n-manifest.js");
  assert.doesNotMatch(manifest, MEME);
  // Regle de traduction : la phrase francaise cherchee est bien celle des pages sources.
  assert.ok(manifest.includes('{find: "Oui. Avec un compte gratuit, sans carte bancaire, tu lis l’analyse du match offert. Ce match est désigné par une règle fixe du moteur, écrite à l’avance. Certains jours, aucun match n’est offert."'));
});

test("page Pro (outils) : plus de « 5000 simulations par match » écrit en dur", () => {
  const src = read("tools-page.js");
  assert.doesNotMatch(src, /kpi\('5[\s.,]?000'/);
  assert.doesNotMatch(src, /tools_page\.scan_kpi_models/, "le chiffre clé des simulations n'est plus affiché");
  // Le simulateur de capital (runs: 5000) est retire de l'espace Pro (fusion V3, 30/09/2026).
  assert.doesNotMatch(src, /function rendreBankroll|runs: 5000/);
});
