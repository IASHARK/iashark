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

test("le résumé garde la décision, la lecture, les risques et les marchés comparés", () => {
  const summaryStart = matchPage.indexOf("var tabResume=");
  const advancedStart = matchPage.indexOf("var tabDonneesAvancees=");
  assert.ok(summaryStart > -1 && advancedStart > summaryStart);
  const summarySource = matchPage.slice(summaryStart, advancedStart);
  assert.match(summarySource, /v4-reading-card/);
  assert.match(summarySource, /v4-decision-card/);
  assert.match(summarySource, /v4-risk-strip/);
  assert.match(summarySource, /v4MarketRows\(/);
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

test("la page suit le contrat visuel compact de la maquette validée", () => {
  assert.match(matchPage, /MATCH V4 — reproduction stricte de la maquette/);
  assert.match(matchPage, /font-family:'Inter'/);
  assert.match(matchPage, /class="[^"]*v4-reading-card/);
  assert.match(matchPage, /class="[^"]*v4-decision-card/);
  assert.match(matchPage, /class="[^"]*v4-why-card/);
  assert.match(matchPage, /class="v4-risk-strip"/);
  assert.match(matchPage, /class="[^"]*v4-prob-card/);
  assert.match(matchPage, /class="[^"]*v4-xg-card/);
  assert.match(matchPage, /class="[^"]*v4-team-compare/);
  assert.match(matchPage, /class="[^"]*v4-lineups-card/);
  assert.match(matchPage, /class="[^"]*v4-absences-card/);
  assert.match(matchPage, /class="[^"]*v4-player-watch/);
});
