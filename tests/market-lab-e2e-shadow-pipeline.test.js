"use strict";
// MARKET LAB - PHASE 3A close-out (2026-09-05), item 7. Demonstration
// BOUT-EN-BOUT sur UNE fixture REELLE (1557393, Ipswich vs Liverpool,
// Premier League, coup d'envoi reel 2026-09-04T19:00:00Z) :
// fixture -> M2 snapshot -> cotes bookmaker reelles -> devig -> consensus
// -> gap model-vs-market -> EV shadow -> resultat reel -> settlement,
// avec anti-lookahead garanti a chaque etape.
//
// Le cote M2 utilise un etat "zero historique" (homePrior/awayPrior =
// moyennes de ligue reelles Premier League, aucun match joue) - un
// scenario limite LEGITIME (equivalent journee 1 / equipe promue),
// PAS une fabrication : la reconstruction complete d'un etat live a
// partir de l'historique reel de la saison en cours (item 3 Phase 3A,
// gap deja documente dans lib/market-lab/m2-live.js) n'est pas encore
// cablee pour une fixture arbitraire hors du dataset de backtest -
// cette demonstration prouve la PLOMBERIE bout-en-bout, pas une
// prediction reelle sur ce match precis.
//
// Les cotes bookmaker (3 snapshots T72/T24/T6) et le resultat final
// (0-2, statut FT) sont REELS : cotes deja stockees dans Supabase
// (odds_snapshots), resultat confirme le 2026-09-05 via UN appel reel
// a l'API-Football (voir retour de session Phase 3A).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const { computeM2Lambdas, computeM2MarketCatalogue } = require("../lib/market-lab/m2-live.js");
const { buildBookmakerOffers } = require("../lib/market-lab/odds-ingest.js");
const { devigBookmakerMarket, flattenDevigResult } = require("../lib/market-lab/devig.js");
const { buildDevigConsensus, bestExecutableOffer } = require("../lib/market-lab/odds-consensus.js");
const { buildModelMarketGap } = require("../lib/market-lab/model-vs-market.js");
const { computeShadowEv, EV_STATUS } = require("../lib/market-lab/ev-shadow.js");
const { resolveCanonicalMarketOutcome } = require("../lib/market-lab/results-link.js");
const { visibleOffersAt } = require("../lib/market-lab/forward-odds-dataset.js");

const FIXTURE_ID = 1557393;
// Ipswich 0-2 Liverpool, FT - confirme reellement le 2026-09-05 via
// l'API-Football (1 appel, groupe avec 13 autres fixtures - voir
// retour de session Phase 3A).
const REAL_RESULT = { homeGoals: 0, awayGoals: 2 };

const snapshots = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "market-lab-e2e-fixture-1557393.json"), "utf8"));

function extractValidOffers(snapshot) {
  const payload = { bookmakers: snapshot.bookmakers_filtered.filter((b) => b.bets && b.bets.length) };
  const ctx = { fixtureId: FIXTURE_ID, retrievedAt: snapshot.captured_at, kickoff: snapshot.kickoff, oddsSnapshotId: `${FIXTURE_ID}|${snapshot.snapshot_phase}` };
  return buildBookmakerOffers(payload, ctx).valid;
}

test("pipeline bout-en-bout (item 7) : fixture reelle 1557393, M2 snapshot -> odds -> devig -> consensus -> gap -> EV shadow -> settlement", () => {
  // --- 1. M2 snapshot ---
  const homeState = { goalsForHome: 0, goalsAgainstHome: 0, playedHome: 0, playedTotal: 0 };
  const awayState = { goalsForAway: 0, goalsAgainstAway: 0, playedAway: 0, playedTotal: 0 };
  const homePrior = { forRate: 1.35, againstRate: 1.10 };
  const awayPrior = { forRate: 1.10, againstRate: 1.35 };
  const lambdas = computeM2Lambdas({ homeState, awayState, homePrior, awayPrior, leagueAvgH: 1.35, leagueAvgA: 1.10, leagueId: 39 });
  const m2Catalogue = computeM2MarketCatalogue({ lambdaH: lambdas.lambdaH, lambdaA: lambdas.lambdaA, fixtureId: FIXTURE_ID });
  assert.equal(m2Catalogue.model_version, "M2");
  const modelHomeWin = m2Catalogue.markets.find((m) => m.market_id === "FT_1X2_HOME").probability;
  assert.ok(modelHomeWin > 0 && modelHomeWin < 1);

  // --- 2. cotes bookmaker reelles (snapshot T24 reel) ---
  const t24 = snapshots.find((s) => s.snapshot_phase === "T24");
  assert.ok(t24, "snapshot T24 reel doit exister pour cette fixture");
  const valid = extractValidOffers(t24);
  assert.ok(valid.length > 0, "des offres reelles doivent exister pour ce snapshot");

  // --- 3. devig (Shin) par bookmaker, sur le 1X2 reel ---
  const byBookmaker = new Map();
  for (const offer of valid) {
    if (!offer.canonical_market_id.startsWith("FT_1X2_")) continue;
    if (!byBookmaker.has(offer.bookmaker_id)) byBookmaker.set(offer.bookmaker_id, {});
    byBookmaker.get(offer.bookmaker_id)[offer.selection] = offer.decimal_odds;
  }
  assert.ok(byBookmaker.size >= 3, "au moins 3 bookmakers reels doivent offrir un 1X2 complet");

  const consensusRows = [];
  for (const [bookmakerId, odds] of byBookmaker) {
    const result = devigBookmakerMarket("FT_1X2", odds);
    if (!result.complete) continue;
    for (const flat of flattenDevigResult("FT_1X2", result)) consensusRows.push({ fixture_id: FIXTURE_ID, bookmaker_id: bookmakerId, ...flat });
  }
  assert.ok(consensusRows.length > 0);

  // --- 4. consensus post-devig ---
  const consensus = buildDevigConsensus(consensusRows);
  const homeConsensus = consensus.find((c) => c.canonical_market_id === "FT_1X2_HOME");
  assert.ok(homeConsensus.bookmakers_count >= 3);
  assert.equal(homeConsensus.consensus_method, "MEDIAN_OF_BOOKMAKER_DEVIG_PROBABILITIES");

  // --- 5. gap model-vs-market (jamais "edge") ---
  const gap = buildModelMarketGap({ fixtureId: FIXTURE_ID, marketId: "FT_1X2_HOME", modelProbability: modelHomeWin, consensusMarketProbability: homeConsensus.median_devig_probability });
  assert.ok(!("edge" in gap));
  assert.ok(typeof gap.probability_gap === "number");

  // --- 6. meilleur prix executable reel + EV shadow ---
  const homeOffers = valid.filter((o) => o.canonical_market_id === "FT_1X2_HOME").map((o) => ({ ...o, excluded_post_kickoff: false }));
  const best = bestExecutableOffer(homeOffers);
  assert.ok(best.best_decimal_odds > 1);
  const ev = computeShadowEv({ modelProbability: modelHomeWin, decimalOdds: best.best_decimal_odds });
  assert.equal(ev.ev_status, EV_STATUS);
  assert.ok(typeof ev.ev === "number");
  assert.ok(!("bet_recommendation" in ev) && !("stake" in ev));

  // --- 7. resultat REEL (0-2, confirme via API) + settlement ---
  assert.equal(resolveCanonicalMarketOutcome("FT_1X2_HOME", "HOME", REAL_RESULT), "LOSE");
  assert.equal(resolveCanonicalMarketOutcome("FT_1X2_AWAY", "AWAY", REAL_RESULT), "WIN");
  assert.equal(resolveCanonicalMarketOutcome("FT_1X2_DRAW", "DRAW", REAL_RESULT), "LOSE");

  // --- 8. anti-lookahead : une decision au moment de T72 ne voit jamais les cotes T24/T6 collectees plus tard ---
  const allOffersWithCollectedAt = snapshots.flatMap((s) => extractValidOffers(s).map((o) => ({ ...o, collected_at: s.captured_at })));
  const t72 = snapshots.find((s) => s.snapshot_phase === "T72");
  const visibleAtT72 = visibleOffersAt(allOffersWithCollectedAt, t72.captured_at);
  assert.ok(visibleAtT72.every((o) => new Date(o.collected_at).getTime() <= new Date(t72.captured_at).getTime()));
  assert.ok(visibleAtT72.length < allOffersWithCollectedAt.length, "une decision a T72 ne doit PAS voir les offres T24/T6, collectees plus tard");
});
