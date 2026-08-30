"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const matchPage = fs.readFileSync(path.join(__dirname, "..", "match.html"), "utf8");

test("la page match expose exactement les trois espaces produit validés", () => {
  assert.match(matchPage, />RÉSUMÉ<\/button>/);
  assert.match(matchPage, />DONNÉES AVANCÉES<\/button>/);
  assert.match(matchPage, />JOUEURS<\/button>/);
  assert.doesNotMatch(matchPage, />VUE D'ENSEMBLE<\/button>/);
  assert.doesNotMatch(matchPage, />EN SAVOIR \+<\/button>/);
});

test("le scénario par tranches de 15 minutes reste dans les données avancées", () => {
  const advancedStart = matchPage.indexOf("var tabDonneesAvancees=");
  const playersStart = matchPage.indexOf("var tabJoueurs=");
  assert.ok(advancedStart > -1, "le panneau Données avancées doit exister");
  assert.ok(playersStart > advancedStart, "le panneau Joueurs doit suivre");
  const advancedSource = matchPage.slice(advancedStart, playersStart);
  assert.match(advancedSource, /buildPatterns\(/);
});

test("les données avancées commencent par le contexte utile et se terminent par la FAQ", () => {
  const advancedStart = matchPage.indexOf("var tabDonneesAvancees=");
  const playersStart = matchPage.indexOf("var tabJoueurs=");
  const advancedSource = matchPage.slice(advancedStart, playersStart);
  const conditions = advancedSource.indexOf("buildMatchConditions(");
  const referee = advancedSource.indexOf("arbitreHtml");
  const probabilities = advancedSource.indexOf("buildDonut(");
  const faq = advancedSource.lastIndexOf("buildFAQ(");

  assert.ok(conditions > -1, "les conditions du match doivent être affichées");
  assert.ok(referee > conditions, "l’arbitre doit suivre les conditions");
  assert.ok(probabilities > referee, "les données existantes doivent rester après le contexte");
  assert.ok(faq > probabilities, "la FAQ doit fermer l’onglet avancé");
});

test("le momentum avancé est calculé depuis les événements disponibles", () => {
  assert.match(matchPage, /function buildMomentum\(/);
  assert.match(matchPage, /events_home/);
  assert.match(matchPage, /events_away/);
  const advancedStart = matchPage.indexOf("var tabDonneesAvancees=");
  const playersStart = matchPage.indexOf("var tabJoueurs=");
  assert.match(matchPage.slice(advancedStart, playersStart), /buildMomentum\(/);
});

test("le résumé garde la décision, le contexte, les risques et les marchés comparés", () => {
  const summaryStart = matchPage.indexOf("var tabResume=");
  const advancedStart = matchPage.indexOf("var tabDonneesAvancees=");
  assert.ok(summaryStart > -1 && advancedStart > summaryStart);
  const summarySource = matchPage.slice(summaryStart, advancedStart);
  assert.match(summarySource, /parisHtml/);
  assert.match(summarySource, /ctxHtml/);
  assert.match(summarySource, /insightHtml/);
  assert.match(summarySource, /buildMarketsTable\(/);
});

test("les onglets exposent leur état et leur panneau aux technologies d’assistance", () => {
  assert.match(matchPage, /role="tablist"/);
  assert.match(matchPage, /role="tab"[^>]+aria-selected="true"/);
  assert.match(matchPage, /role="tabpanel"/);
  assert.match(matchPage, /setAttribute\('aria-selected',b===btn\?'true':'false'\)/);
});

test("les cartes avancées vides sont masquées et le tennis conserve un espace joueurs utile", () => {
  assert.match(matchPage, /\.advanced-card:empty/);
  const playersStart = matchPage.indexOf("var tabJoueurs=");
  const tabsStart = matchPage.indexOf("var tabsNav=");
  const playersSource = matchPage.slice(playersStart, tabsStart);
  assert.match(playersSource, /isTennis\s*\?/);
  assert.match(playersSource, /buildSurface\(/);
  assert.match(playersSource, /buildTennisH2H\(/);
  assert.match(playersSource, /buildTourRecord\(/);
});
