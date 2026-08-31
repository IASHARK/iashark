"use strict";
// Gardes structurels sur le TEXTE SOURCE reel du pipeline
// (.github/workflows/update-data.yml) - pas une copie parallele dans lib/
// qui pourrait diverger silencieusement de ce qui tourne vraiment en
// production. Ces tests echouent si quelqu'un (humain ou IA) reintroduit
// un pattern explicitement banni par le MASTER V2.1 ou par l'utilisateur.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const PIPELINE_PATH = path.join(__dirname, "..", ".github", "workflows", "update-data.yml");
const source = fs.readFileSync(PIPELINE_PATH, "utf8");

test("pipeline source: aucune trace de la variable 'anchored' (probabilite 1X2/DC ancree au marche) - retiree definitivement au profit de pureProbs/marketAware separes", () => {
  assert.ok(!/\banchored\b/.test(source), "la variable 'anchored' (blend PURE+marche non separe) ne doit plus exister dans le pipeline");
});

test("pipeline source: les marches 1X2 (Victoire Domicile/Exterieur) utilisent pureProbs, jamais un objet ancre/market-aware", () => {
  const victoireDomMatch = source.match(/candidate\('home-win','Victoire Domicile',[^,]+,([a-zA-Z0-9_.]+)/);
  const victoireExtMatch = source.match(/candidate\('away-win','Victoire Exterieur',[^,]+,([a-zA-Z0-9_.]+)/);
  assert.ok(victoireDomMatch, "entree 'Victoire Domicile' introuvable dans allMarkets");
  assert.ok(victoireExtMatch, "entree 'Victoire Exterieur' introuvable dans allMarkets");
  assert.equal(victoireDomMatch[1], "pureProbs.p1", "Victoire Domicile doit utiliser pureProbs.p1 (PURE), pas un blend marche");
  assert.equal(victoireExtMatch[1], "pureProbs.p2", "Victoire Exterieur doit utiliser pureProbs.p2 (PURE), pas un blend marche");
});

test("pipeline source: Double Chance (DC 1X/X2) utilise une probabilite derivee de pureProbs, jamais un blend marche", () => {
  const dc1xMatch = source.match(/candidate\('dc-1x','DC 1X',[^,]+,([a-zA-Z0-9_.]+)/);
  const dcX2Match = source.match(/candidate\('dc-x2','DC X2',[^,]+,([a-zA-Z0-9_.]+)/);
  assert.ok(dc1xMatch, "entree 'DC 1X' introuvable dans allMarkets");
  assert.ok(dcX2Match, "entree 'DC X2' introuvable dans allMarkets");
  // Les variables doivent contenir 'pure' dans leur nom (purePropProb1X/X2),
  // jamais faire reference a un anchor/market-aware.
  assert.match(dc1xMatch[1], /pure/i, "DC 1X doit deriver d'une variable PURE");
  assert.match(dcX2Match[1], /pure/i, "DC X2 doit deriver d'une variable PURE");
});

test("pipeline source: matchObj.p1/pn/p2 (probabilite publique principale) viennent de pureProbs", () => {
  const m = source.match(/p1:([a-zA-Z0-9_.]+)\|\|0,pn:([a-zA-Z0-9_.]+)\|\|0,p2:([a-zA-Z0-9_.]+)\|\|0,/);
  assert.ok(m, "assignation matchObj.p1/pn/p2 introuvable ou reformatee de facon inattendue");
  assert.equal(m[1], "pureProbs.p1");
  assert.equal(m[2], "pureProbs.pN");
  assert.equal(m[3], "pureProbs.p2");
});

test("pipeline source: model_probability (le nombre affiche/utilise pour la decision) vient de pickedMarket.prob, lui-meme construit uniquement depuis pureProbs (verifie par les tests precedents)", () => {
  assert.ok(/model_probability:pickedMarket\?Math\.round\(pickedMarket\.prob\*10\)\/10:null/.test(source), "model_probability doit venir directement de pickedMarket.prob");
});

test("pipeline source: market_consensus_* et market_aware_* sont exposes separement, jamais fusionnes dans un seul champ", () => {
  assert.ok(/market_consensus_p1:shinProbs\?shinProbs\.p1:null/.test(source), "market_consensus_p1 doit venir directement de shinProbs (jamais melange a pureProbs)");
  assert.ok(/market_aware_p1:marketAware\.p1/.test(source), "market_aware_p1 doit venir de l'objet marketAware, distinct de pureProbs et market_consensus");
});

test("pipeline source: pickMarketDeterministic/edge/Kelly ne recoivent jamais l'objet marketAware (uniquement allMarkets, construit depuis pureProbs)", () => {
  // pickedMarket est calcule depuis allMarkets uniquement.
  assert.match(source, /var pickedMarket=pickMarketDeterministic\(allMarkets,\{minOdds:1\.50\}\)/);
  // Aucun site d'appel de fractionalKelly/edge ne doit referencer marketAware.
  const kellyBlock = source.slice(source.indexOf("var pickedMarket=pickMarketDeterministic"), source.indexOf("var noSignal="));
  assert.ok(!/marketAware/.test(kellyBlock), "le calcul edge/Kelly ne doit jamais utiliser marketAware (interdiction explicite MASTER §10.2)");
});

test("pipeline source: le debut de saison ne fabrique jamais 30 matchs ou 10 matchs exterieur", () => {
  assert.ok(!/played\.total\)\|\|30/.test(source));
  assert.ok(!/played\.away\)\|\|10/.test(source));
  assert.match(source, /modelDataAvailable=.*sHPrev.*sAPrev/);
});

test("pipeline source: la forme utilise uniquement la ligue competitive demandee", () => {
  assert.match(source, /getLast10\(home\.id,currentSeason,lg\.id\)/);
  assert.match(source, /leagueFilter=leagueId\?'&league='/);
});

test("pipeline source: une abstention ne publie aucune cote de secours", () => {
  assert.match(source, /cote:pickedMarket\?parseFloat\(pickedMarket\.cote\):null/);
});
