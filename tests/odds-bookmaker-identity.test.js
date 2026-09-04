"use strict";
// Item 5 (audit 2026-09-04) - parseOdds() detruisait l'identite bookmaker :
// chaque cote acceptee etait immediatement reduite a un nombre anonyme
// dans un tableau, la mediane multi-bookmakers ecrasant toute tracabilite
// individuelle. Corrige via lib/odds.js#extractRawOffers (identite
// preservee) + computeMarketConsensus (mediane calculee SEPAREMENT,
// jamais melangee a la liste brute).

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseOdds, extractRawOffers, computeMarketConsensus } = require("../lib/odds.js");

function buildThreeBookmakersFixture() {
  return {
    bookmakers: [
      { id: 101, name: "Bookmaker Alpha", bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "1.85" }, { value: "Draw", odd: "3.60" }, { value: "Away", odd: "4.20" }] }] },
      { id: 102, name: "Bookmaker Beta", bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "1.92" }, { value: "Draw", odd: "3.50" }, { value: "Away", odd: "4.10" }] }] },
      { id: 103, name: "Bookmaker Gamma", bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "1.97" }, { value: "Draw", odd: "3.70" }, { value: "Away", odd: "4.30" }] }] },
    ],
  };
}

test("SCENARIO REQUIS - trois bookmakers proposent 1.85 / 1.92 / 1.97 sur 1X2 Home", () => {
  const o = buildThreeBookmakersFixture();
  const context = { fixtureId: 555, capturedAt: "2026-09-04T10:00:00Z" };

  const rawOffers = extractRawOffers(o, context);
  const homeOffers = rawOffers.filter((r) => r.market === "1x2" && r.selection === "home");

  // 1) le consensus est calculable
  const consensus = computeMarketConsensus(rawOffers);
  assert.ok(consensus["1x2"] && consensus["1x2"].home, "le consensus 1X2/home doit exister");
  assert.equal(consensus["1x2"].home.median, 1.92, "la mediane de [1.85,1.92,1.97] doit etre 1.92");
  assert.equal(consensus["1x2"].home.n_bookmakers, 3);

  // 2) les TROIS cotes individuelles restent recuperables (jamais ecrasees)
  assert.equal(homeOffers.length, 3, "les 3 cotes individuelles doivent toutes etre presentes dans raw_offers");
  const oddsSet = homeOffers.map((o) => o.odds).sort((a, b) => a - b);
  assert.deepEqual(oddsSet, [1.85, 1.92, 1.97]);
  const alpha = homeOffers.find((o) => o.bookmaker_id === 101);
  assert.equal(alpha.odds, 1.85);
  assert.equal(alpha.bookmaker_name, "Bookmaker Alpha");
  assert.equal(alpha.fixture_id, 555);
  assert.equal(alpha.captured_at, "2026-09-04T10:00:00Z");
  const beta = homeOffers.find((o) => o.bookmaker_id === 102);
  assert.equal(beta.odds, 1.92);
  const gamma = homeOffers.find((o) => o.bookmaker_id === 103);
  assert.equal(gamma.odds, 1.97);

  // 3) AUCUNE cote synthetique n'est presentee comme prix d'execution -
  // chaque entree de raw_offers correspond a un bookmaker REEL identifie
  // (bookmaker_id non nul), jamais une valeur agregee/fabriquee glissee
  // dans la meme liste que les cotes reelles.
  for (const offer of rawOffers) {
    assert.ok(offer.bookmaker_id != null, "toute entree de raw_offers doit porter un bookmaker_id reel - jamais un prix consensus deguise en offre");
    assert.ok(offer.bookmaker_name, "toute entree de raw_offers doit porter un bookmaker_name reel");
  }
  // Le consensus (1.92) n'est PRESENT que dans market_consensus, jamais
  // injecte comme une 4e "offre" dans raw_offers avec un faux bookmaker_id.
  assert.equal(homeOffers.filter((o) => o.odds === 1.92 && o.bookmaker_id !== 102).length, 0, "la valeur du consensus ne doit apparaitre comme offre que si un VRAI bookmaker l'a reellement proposee (ici Beta)");
});

test("parseOdds: expose market_consensus et raw_offers separement, jamais fusionnes", () => {
  const o = buildThreeBookmakersFixture();
  const res = parseOdds(o, { fixtureId: 555, capturedAt: "2026-09-04T10:00:00Z" });
  assert.equal(res.c1, "1.92", "le champ historique c1 reste le consensus (mediane), pour ne rien casser en aval");
  assert.equal(res.market_consensus["1x2"].home.median, 1.92);
  assert.equal(res.raw_offers.filter((r) => r.market === "1x2" && r.selection === "home").length, 3);
  // raw_offers et market_consensus sont deux cles DISTINCTES du meme objet
  // retourne, jamais une seule structure ambigue.
  assert.notEqual(res.raw_offers, res.market_consensus);
});

test("extractRawOffers: un seul bookmaker -> une seule offre, consensus egal a cette offre unique", () => {
  const o = { bookmakers: [{ id: 1, name: "Solo", bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "2.10" }] }] }] };
  const rawOffers = extractRawOffers(o, {});
  assert.equal(rawOffers.length, 1);
  const consensus = computeMarketConsensus(rawOffers);
  assert.equal(consensus["1x2"].home.median, 2.10);
  assert.equal(consensus["1x2"].home.n_bookmakers, 1);
});

test("extractRawOffers: sans context, fixture_id/captured_at restent null - jamais une valeur fabriquee", () => {
  const o = buildThreeBookmakersFixture();
  const rawOffers = extractRawOffers(o); // pas de context du tout
  assert.ok(rawOffers.length > 0);
  for (const offer of rawOffers) {
    assert.equal(offer.fixture_id, null);
    assert.equal(offer.captured_at, null);
  }
});

test("computeMarketConsensus: calcule bien a partir d'une liste brute deja construite, jamais l'inverse (pas de dependance a parseOdds)", () => {
  const manualOffers = [
    { bookmaker_id: 1, bookmaker_name: "X", fixture_id: 1, market: "1x2", selection: "home", odds: 1.80, captured_at: null },
    { bookmaker_id: 2, bookmaker_name: "Y", fixture_id: 1, market: "1x2", selection: "home", odds: 2.00, captured_at: null },
  ];
  const consensus = computeMarketConsensus(manualOffers);
  assert.equal(consensus["1x2"].home.median, 1.90);
});
