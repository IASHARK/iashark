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

// ---------------------------------------------------------------
// OPERATIONAL_FIX (2026-09-06) : RUN_OPERATIONAL_FIX, items 1-5.
// ---------------------------------------------------------------

test("pipeline source: getH2H utilise le vrai endpoint v3 dedie /fixtures/headtohead, jamais /fixtures?h2h= (invalide en v3, 'The H2h field do not exist')", () => {
  assert.match(source, /fixtures\/headtohead\?h2h=/, "getH2H doit appeler /fixtures/headtohead");
  assert.ok(!/fixtures\?h2h=/.test(source), "l'ancien appel invalide /fixtures?h2h= ne doit plus exister");
});

test("pipeline source: getRefereeStats ne fait plus AUCUN appel reseau (endpoint /fixtures?referee= invalide, inexistant dans l'API) - retourne null immediatement", () => {
  const m = source.match(/function getRefereeStats\(refName\)\s*\{[^}]*\}/);
  assert.ok(m, "getRefereeStats introuvable");
  assert.ok(!/get\(/.test(m[0]), "getRefereeStats ne doit plus appeler get()/getArr() - endpoint inexistant, appel toujours voue a l'echec");
  assert.match(m[0], /return null/);
});

test("pipeline source: getTeamStats/getLast10 consultent decideSeasonFallback avant tout repli de saison - jamais un repli base sur la seule vacuite de la reponse", () => {
  assert.match(source, /require\('\.\/lib\/api-fetch-policy\.js'\)/);
  const teamStatsBlock = source.slice(source.indexOf("async function getTeamStats"), source.indexOf("async function getLast10"));
  assert.match(teamStatsBlock, /decideSeasonFallback\(/, "getTeamStats doit utiliser decideSeasonFallback, jamais isEmpty seul, pour decider d'un repli de saison");
  const last10Block = source.slice(source.indexOf("async function getLast10"), source.indexOf("async function getOdds"));
  assert.match(last10Block, /decideSeasonFallback\(/, "getLast10 doit utiliser decideSeasonFallback");
});

test("pipeline source: un 429/erreur API sur les stats saison courante force modelDataAvailable=false INCONDITIONNELLEMENT (jamais un blend silencieux avec la saison precedente)", () => {
  assert.match(source, /modelDataAvailable=currentSeasonGate\.dataQualityOk&&.*sHPrev.*sAPrev/, "modelDataAvailable doit etre prefixe par currentSeasonGate.dataQualityOk&&, et garder la meme formule sHPrev/sAPrev qu'avant (comportement Score Engine valide inchange dans le cas OK)");
  assert.match(source, /decideCurrentSeasonGate\(\{/);
});

test("pipeline source: noSignalReason distingue DATA_QUALITY_FAIL_* (rate-limit/erreur API) de INSUFFICIENT_MODEL_DATA (vraie saison vide confirmee)", () => {
  assert.match(source, /noSignalReason=!currentSeasonGate\.dataQualityOk\?currentSeasonGate\.reason:/);
});

test("pipeline source: explanation_status publie honnêtement l'echec de genAnalyse (OK/FAILED), jamais fabrique de texte de remplacement", () => {
  assert.match(source, /explanation_status:an\?'OK':'FAILED'/);
  // La selection (pari_rec/cote_rec/model_probability) doit rester
  // calculee AVANT l'appel a genAnalyse et ne jamais dependre de `an`.
  const beforeGenAnalyse = source.slice(0, source.indexOf("var an=await genAnalyse"));
  assert.match(beforeGenAnalyse, /var pickedMarket=pickMarketDeterministic/, "pickedMarket doit deja exister avant l'appel a genAnalyse");
});

test("pipeline source: genAnalyse ne fabrique jamais de contenu si le JSON est illisible - retourne null (jamais un objet partiel invente)", () => {
  assert.match(source, /catch\(e\)\{console\.error\('  \[genAnalyse\] JSON illisible[^}]*return null;\}/);
});

test("pipeline source: compteurs API_CALLS/CACHE_HITS/RATE_LIMIT_RETRIES/RATE_LIMIT_FAILURES logues a chaque run", () => {
  assert.match(source, /API_CALLS='\+API_FETCHER\.stats\.calls/);
  assert.match(source, /CACHE_HITS='\+API_FETCHER\.stats\.cache_hits/);
  assert.match(source, /RATE_LIMIT_RETRIES='\+API_FETCHER\.stats\.rate_limit_retries/);
  assert.match(source, /RATE_LIMIT_FAILURES='\+API_FETCHER\.stats\.rate_limit_failures/);
});

test("pipeline source: seul v3.football.api-sports.io passe par la file API_FETCHER (throttling/cache/retry) - les autres hotes (meteo/news/odds) gardent leurs propres headers, jamais la cle api-sports", () => {
  assert.match(source, /function isApiSportsUrl\(url\) \{ return url\.indexOf\('v3\.football\.api-sports\.io'\) !== -1; \}/);
  const getFnBlock = source.slice(source.indexOf("function get(url, headers) {"), source.indexOf("function getArr(url, headers) {"));
  assert.match(getFnBlock, /rawHttpGetJson\(url, headers\)/, "la branche non-api-sports de get() doit transmettre les headers de l'appelant, jamais forcer APS");
});
