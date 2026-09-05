"use strict";
// MARKET LAB - PHASE 2.5 (2026-09-05), item 15 : les 12 tests
// supplementaires obligatoires.

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildBookmakerOffers, CANONICAL_MARKET_MAP, EXECUTABLE_DNB_AVAILABLE } = require("../lib/market-lab/odds-ingest.js");
const { devigBookmakerMarket, familyOf, MARKET_FAMILIES } = require("../lib/market-lab/devig.js");
const { buildDcFairBenchmark, pairFairBenchmarkWithExecutableOffer } = require("../lib/market-lab/dc-fair-benchmark.js");
const { buildForwardOddsRow, loadOddsTimeline, visibleOffersAt, hashRawPayload } = require("../lib/market-lab/forward-odds-dataset.js");
const { buildModelSnapshot } = require("../lib/market-lab/model-snapshot.js");
const { buildResultsLink, resolveCanonicalMarketOutcome } = require("../lib/market-lab/results-link.js");

const EPS = 1e-9;

function ou(values) { return { name: "Goals Over/Under", values }; }
function totalHome(values) { return { name: "Total - Home", values }; }
function makePayload(bookmakers) { return { bookmakers }; }

// --- 1. Total 0.5/4.5 extraction ---
test("1) Total buts : 0.5 et 4.5 sont desormais extraites et mappees (deja presentes dans le payload reel, jamais avant)", () => {
  const payload = makePayload([
    { id: 8, name: "Bet365", bets: [ou([{ value: "Over 0.5", odd: "1.05" }, { value: "Under 0.5", odd: "12.0" }, { value: "Over 4.5", odd: "6.5" }, { value: "Under 4.5", odd: "1.08" }])] },
  ]);
  const { valid } = buildBookmakerOffers(payload, { fixtureId: 1, retrievedAt: "2026-09-05T00:00:00Z" });
  const ids = valid.map((o) => o.canonical_market_id).sort();
  assert.deepEqual(ids, ["FT_TOTAL_0.5_OVER", "FT_TOTAL_0.5_UNDER", "FT_TOTAL_4.5_OVER", "FT_TOTAL_4.5_UNDER"]);
});

// --- 2. Team Total 0.5/2.5/3.5 extraction ---
test("2) Team Totals Home : 0.5/2.5/3.5 desormais extraites (seule 1.5 l'etait avant)", () => {
  const payload = makePayload([
    { id: 8, name: "Bet365", bets: [totalHome([{ value: "Over 0.5", odd: "1.15" }, { value: "Under 0.5", odd: "4.5" }, { value: "Over 2.5", odd: "3.2" }, { value: "Under 2.5", odd: "1.32" }, { value: "Over 3.5", odd: "6.0" }, { value: "Under 3.5", odd: "1.08" }])] },
  ]);
  const { valid } = buildBookmakerOffers(payload, { fixtureId: 1, retrievedAt: "2026-09-05T00:00:00Z" });
  const ids = valid.map((o) => o.canonical_market_id).sort();
  assert.deepEqual(ids, ["FT_TEAM_TOTAL_HOME_0.5_OVER", "FT_TEAM_TOTAL_HOME_0.5_UNDER", "FT_TEAM_TOTAL_HOME_2.5_OVER", "FT_TEAM_TOTAL_HOME_2.5_UNDER", "FT_TEAM_TOTAL_HOME_3.5_OVER", "FT_TEAM_TOTAL_HOME_3.5_UNDER"]);
});

// --- 3. Total 1.5 both sides when payload contains them ---
test("3) Total 1.5 : quand le payload contient les DEUX cotes, le marche devient COMPLET pour le devig (ne l'etait jamais avant)", () => {
  const payload = makePayload([
    { id: 8, name: "Bet365", bets: [ou([{ value: "Over 1.5", odd: "1.30" }, { value: "Under 1.5", odd: "3.4" }])] },
  ]);
  const { valid } = buildBookmakerOffers(payload, { fixtureId: 1, retrievedAt: "2026-09-05T00:00:00Z" });
  const over = valid.find((o) => o.canonical_market_id === "FT_TOTAL_1.5_OVER");
  const under = valid.find((o) => o.canonical_market_id === "FT_TOTAL_1.5_UNDER");
  assert.ok(over && under);
  const result = devigBookmakerMarket("FT_TOTAL_1.5", { OVER: over.decimal_odds, UNDER: under.decimal_odds });
  assert.equal(result.complete, true);
  assert.equal(result.shin_status, "OK");
});

// --- 4. DC fair derived only from same-bookmaker 1X2 ---
test("4) DC fair benchmark : derive UNIQUEMENT du 1X2 deja deviggue du MEME bookmaker", () => {
  const shin1x2 = devigBookmakerMarket("FT_1X2", { HOME: 1.85, DRAW: 3.4, AWAY: 4.2 }).shin;
  const fair = buildDcFairBenchmark(shin1x2);
  assert.equal(fair.dc_fair_source, "DERIVED_FROM_SAME_BOOKMAKER_DEVIGGED_1X2");
  assert.ok(Math.abs(fair.FT_DC_1X - (shin1x2.HOME + shin1x2.DRAW)) < EPS);
  assert.ok(Math.abs(fair.FT_DC_X2 - (shin1x2.DRAW + shin1x2.AWAY)) < EPS);
  assert.ok(Math.abs(fair.FT_DC_12 - (shin1x2.HOME + shin1x2.AWAY)) < EPS);
  // refuse un 1X2 non deviggue (pas de HOME/DRAW/AWAY numeriques) - jamais une derivation depuis des cotes brutes
  assert.throws(() => buildDcFairBenchmark({ home: 1.85, draw: 3.4, away: 4.2 }));
});

// --- 5. DC selections never Shin-devigged as a 3-way ---
test("5) DC n'est JAMAIS une famille de devig Shin 3-way : absente de MARKET_FAMILIES", () => {
  assert.equal(familyOf("FT_DC_1X"), null);
  assert.equal(familyOf("FT_DC_X2"), null);
  assert.equal(familyOf("FT_DC_12"), null);
  assert.ok(!MARKET_FAMILIES.has("FT_DC"));
});

// --- 6. no synthetic DC executable odds ---
test("6) DC : jamais de cote executable fabriquee - le benchmark fair ne contient aucun champ de cote, seule pairFairBenchmarkWithExecutableOffer persiste une cote REELLEMENT fournie (ou null)", () => {
  const shin1x2 = devigBookmakerMarket("FT_1X2", { HOME: 1.85, DRAW: 3.4, AWAY: 4.2 }).shin;
  const fair = buildDcFairBenchmark(shin1x2);
  assert.ok(!("bookmaker_dc_odds" in fair));
  assert.ok(!("odds" in fair));
  const pairedNoOffer = pairFairBenchmarkWithExecutableOffer(fair, "FT_DC_1X", null);
  assert.equal(pairedNoOffer.bookmaker_dc_odds, null, "aucune cote fournie -> null, jamais une valeur inventee");
  const pairedWithOffer = pairFairBenchmarkWithExecutableOffer(fair, "FT_DC_1X", 1.30);
  assert.equal(pairedWithOffer.bookmaker_dc_odds, 1.30);
});

// --- 7. no synthetic DNB executable odds ---
test("7) DNB : EXECUTABLE_DNB_AVAILABLE=false, aucune entree de mapping - jamais de cote synthetisee depuis 1X2", () => {
  assert.equal(EXECUTABLE_DNB_AVAILABLE, false);
  const dnbEntries = [...CANONICAL_MARKET_MAP.values()].filter((m) => m.canonicalMarketId.startsWith("FT_DNB"));
  assert.deepEqual(dnbEntries, []);
});

// --- 8. forward timeline immutable ---
test("8) forward_odds_timeline : une ligne construite est gelee, toute mutation est refusee", () => {
  const row = buildForwardOddsRow({
    fixtureId: 1, leagueId: 39, kickoff: "2026-09-06T18:00:00Z", snapshotPhase: "T6",
    collectedAt: "2026-09-06T12:00:00Z", bookmakerId: 8, bookmakerName: "Bet365",
    canonicalMarketId: "FT_1X2_HOME", selection: "HOME", decimalOdds: 1.91, rawPayloadHash: "abc123",
  });
  assert.ok(Object.isFrozen(row));
  assert.throws(() => { row.decimal_odds = 999; }, TypeError);
  assert.equal(row.decimal_odds, 1.91);
});

// --- 9. T6 cannot see CLOSE ---
test("9) anti-lookahead : une decision simulee a T6 ne voit jamais une offre CLOSE collectee plus tard", () => {
  const kickoff = "2026-09-06T18:00:00Z";
  const rowT6 = buildForwardOddsRow({ fixtureId: 1, leagueId: 39, kickoff, snapshotPhase: "T6", collectedAt: "2026-09-06T12:00:00Z", bookmakerId: 8, bookmakerName: "Bet365", canonicalMarketId: "FT_1X2_HOME", selection: "HOME", decimalOdds: 1.91, rawPayloadHash: "h1" });
  const rowClose = buildForwardOddsRow({ fixtureId: 1, leagueId: 39, kickoff, snapshotPhase: "CLOSE", collectedAt: "2026-09-06T17:30:00Z", bookmakerId: 8, bookmakerName: "Bet365", canonicalMarketId: "FT_1X2_HOME", selection: "HOME", decimalOdds: 1.85, rawPayloadHash: "h2" });
  const allRows = [rowT6, rowClose];

  const decisionAtT6 = visibleOffersAt(allRows, rowT6.collected_at);
  assert.equal(decisionAtT6.length, 1);
  assert.equal(decisionAtT6[0].snapshot_phase, "T6");

  const decisionAtClose = visibleOffersAt(allRows, rowClose.collected_at);
  assert.equal(decisionAtClose.length, 2);

  const timeline = loadOddsTimeline(allRows, 1);
  const t6Phase = timeline.phases.find((p) => p.phase === "T6");
  const closePhase = timeline.phases.find((p) => p.phase === "CLOSE");
  assert.equal(t6Phase.rows.length, 1);
  assert.equal(closePhase.rows.length, 1);
});

// --- 10. model snapshot immutable ---
test("10) model snapshot : construit gele (deep freeze), toute mutation (y compris imbriquee) est refusee", () => {
  const snapshot = buildModelSnapshot({
    fixtureId: 1, capturedAt: "2026-09-05T00:00:00Z", modelVersion: "M2",
    lambdaH: 1.4, lambdaA: 1.1, sourceMatrixHash: "hash123",
    marketCatalogue: { markets: [{ market_id: "FT_1X2_HOME", probability: 0.45 }] },
  });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.market_catalogue));
  assert.ok(Object.isFrozen(snapshot.market_catalogue.markets[0]));
  assert.throws(() => { snapshot.model_version = "M99"; }, TypeError);
  assert.throws(() => { snapshot.market_catalogue.markets[0].probability = 0.99; }, TypeError);
  assert.equal(snapshot.market_catalogue.markets[0].probability, 0.45);
});

// --- 11. regulatory 90-min settlement ---
test("11) resultat reglementaire : un match termine APRES prolongation (AET) est lie a son score DE 90 MINUTES, jamais le score final", () => {
  const fixtureAfterExtraTime = {
    fixture: { id: 555, status: { short: "AET" } },
    score: { fulltime: { home: 1, away: 1 } },
    goals: { home: 2, away: 1 },
  };
  const link = buildResultsLink(fixtureAfterExtraTime);
  assert.equal(link.goals_home_90, 1);
  assert.equal(link.goals_away_90, 1);
  assert.equal(link.is_regulation_final, true);
  assert.equal(resolveCanonicalMarketOutcome("FT_1X2_DRAW", "DRAW", { homeGoals: link.goals_home_90, awayGoals: link.goals_away_90 }), "WIN");
  assert.equal(resolveCanonicalMarketOutcome("FT_1X2_HOME", "HOME", { homeGoals: link.goals_home_90, awayGoals: link.goals_away_90 }), "LOSE");
  assert.equal(resolveCanonicalMarketOutcome("FT_DNB_HOME", "HOME", { homeGoals: link.goals_home_90, awayGoals: link.goals_away_90 }), "PUSH");
  assert.equal(resolveCanonicalMarketOutcome("FT_TOTAL_2.5_UNDER", "UNDER", { homeGoals: link.goals_home_90, awayGoals: link.goals_away_90 }), "WIN");

  const notFinished = buildResultsLink({ fixture: { id: 556, status: { short: "NS" } } });
  assert.equal(notFinished.goals_home_90, null);
  assert.equal(notFinished.is_regulation_final, false);
});

// --- 12. replay raw payload => same canonical offers ---
test("12) replay : rejouer le MEME payload brut stocke (pas de nouvel appel API) produit les memes offres canoniques, hash identique", () => {
  const payload = makePayload([
    { id: 8, name: "Bet365", bets: [ou([{ value: "Over 2.5", odd: "1.91" }, { value: "Under 2.5", odd: "1.95" }])] },
  ]);
  const ctx = { fixtureId: 1, retrievedAt: "2026-09-05T00:00:00Z" };
  const run1 = buildBookmakerOffers(payload, ctx);
  const run2 = buildBookmakerOffers(payload, ctx);
  assert.equal(JSON.stringify(run1), JSON.stringify(run2));
  assert.equal(hashRawPayload(payload), hashRawPayload(payload));
});
