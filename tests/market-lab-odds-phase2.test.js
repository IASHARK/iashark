"use strict";
// MARKET LAB - PHASE 2 (2026-09-05), item 15 : les 15 tests synthetiques
// obligatoires + garde-fous structurels (item 17 : aucun EV/Kelly/stake/
// BET-NO-BET ne doit jamais apparaitre dans ces modules).

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildBookmakerOffers, CANONICAL_MARKET_MAP } = require("../lib/market-lab/odds-ingest.js");
const { devigBookmakerMarket, flattenDevigResult } = require("../lib/market-lab/devig.js");
const { buildDevigConsensus, bestExecutableOffer } = require("../lib/market-lab/odds-consensus.js");
const { dnbConditionalFromModel, buildModelMarketGap } = require("../lib/market-lab/model-vs-market.js");

const EPS = 1e-6;

function bkBets(bets) { return { bets }; }
function mw(values) { return { name: "Match Winner", values }; }
function dc(values) { return { name: "Double Chance", values }; }
function btts(values) { return { name: "Both Teams Score", values }; }
function ou(values) { return { name: "Goals Over/Under", values }; }

function makePayload(bookmakers) {
  return { bookmakers };
}

// --- 1. identite bookmaker preservee ---
test("1) identite bookmaker preservee : chaque offre valide porte le bon bookmaker_id/name, jamais anonymisee", () => {
  const payload = makePayload([
    { id: 8, name: "Bet365", bets: [bkBets([mw([{ value: "Home", odd: "1.91" }, { value: "Draw", odd: "3.4" }, { value: "Away", odd: "4.2" }])]).bets[0]] },
    { id: 4, name: "Pinnacle", bets: [mw([{ value: "Home", odd: "1.95" }, { value: "Draw", odd: "3.5" }, { value: "Away", odd: "4.0" }])] },
  ]);
  const { valid } = buildBookmakerOffers(payload, { fixtureId: 1, retrievedAt: "2026-09-05T00:00:00Z" });
  const bet365Home = valid.find((o) => o.bookmaker_id === 8 && o.canonical_market_id === "FT_1X2_HOME");
  const pinnacleHome = valid.find((o) => o.bookmaker_id === 4 && o.canonical_market_id === "FT_1X2_HOME");
  assert.equal(bet365Home.bookmaker_name, "Bet365");
  assert.equal(bet365Home.decimal_odds, 1.91);
  assert.equal(pinnacleHome.bookmaker_name, "Pinnacle");
  assert.equal(pinnacleHome.decimal_odds, 1.95);
});

// --- 2. aucune fusion prematuree ---
test("2) aucune fusion prematuree : 2 bookmakers x 3 selections 1X2 = 6 offres distinctes, jamais reduites a 3", () => {
  const payload = makePayload([
    { id: 8, name: "Bet365", bets: [mw([{ value: "Home", odd: "1.91" }, { value: "Draw", odd: "3.4" }, { value: "Away", odd: "4.2" }])] },
    { id: 4, name: "Pinnacle", bets: [mw([{ value: "Home", odd: "1.95" }, { value: "Draw", odd: "3.5" }, { value: "Away", odd: "4.0" }])] },
  ]);
  const { valid } = buildBookmakerOffers(payload, { fixtureId: 1, retrievedAt: "2026-09-05T00:00:00Z" });
  const oneX2 = valid.filter((o) => o.canonical_market_id.startsWith("FT_1X2_"));
  assert.equal(oneX2.length, 6);
  assert.equal(new Set(oneX2.map((o) => o.bookmaker_id)).size, 2);
});

// --- 3. 1X2 Shin sums to 1 ---
test("3) devig 1X2 (Shin) : les 3 probabilites sommant a 1", () => {
  const result = devigBookmakerMarket("FT_1X2", { HOME: 1.85, DRAW: 3.4, AWAY: 4.2 });
  assert.equal(result.shin_status, "OK");
  const sum = result.shin.HOME + result.shin.DRAW + result.shin.AWAY;
  assert.ok(Math.abs(sum - 1) < EPS);
});

// --- 4. binary Shin sums to 1 ---
test("4) devig marche binaire (BTTS, Shin) : somme a 1", () => {
  const result = devigBookmakerMarket("FT_BTTS", { YES: 1.9, NO: 1.95 });
  assert.equal(result.shin_status, "OK");
  assert.ok(Math.abs(result.shin.YES + result.shin.NO - 1) < EPS);
});

// --- 5. proportional diagnostic sums to 1 ---
test("5) diagnostic proportionnel : somme a 1 (1X2 et binaire)", () => {
  const r1 = devigBookmakerMarket("FT_1X2", { HOME: 1.85, DRAW: 3.4, AWAY: 4.2 });
  assert.ok(Math.abs(r1.proportional_diagnostic.HOME + r1.proportional_diagnostic.DRAW + r1.proportional_diagnostic.AWAY - 1) < EPS);
  const r2 = devigBookmakerMarket("FT_TOTAL_2.5", { OVER: 1.91, UNDER: 1.95 });
  assert.ok(Math.abs(r2.proportional_diagnostic.OVER + r2.proportional_diagnostic.UNDER - 1) < EPS);
});

// --- 6. bookmaker A jamais melange avec B pendant le devig ---
test("6) devig : bookmaker A et bookmaker B ne sont jamais melanges - deux devigs independants donnent des resultats differents et corrects chacun", () => {
  const resultA = devigBookmakerMarket("FT_1X2", { HOME: 1.85, DRAW: 3.4, AWAY: 4.2 });
  const resultB = devigBookmakerMarket("FT_1X2", { HOME: 2.10, DRAW: 3.3, AWAY: 3.5 });
  assert.notEqual(resultA.shin.HOME, resultB.shin.HOME);
  // chaque resultat reste base UNIQUEMENT sur ses propres cotes d'entree
  assert.ok(Math.abs(resultA.raw_implied.HOME - 1 / 1.85) < EPS);
  assert.ok(Math.abs(resultB.raw_implied.HOME - 1 / 2.10) < EPS);
});

// --- 7. incomplete 1X2 rejected for devig ---
test("7) 1X2 incomplet (AWAY manquant) : rejete pour le devig, jamais une valeur fabriquee", () => {
  const result = devigBookmakerMarket("FT_1X2", { HOME: 1.85, DRAW: 3.4 });
  assert.equal(result.complete, false);
  assert.equal(result.reason, "INCOMPLETE_MARKET");
  assert.deepEqual(result.missing_selections, ["AWAY"]);
});

// --- 8. missing side O/U rejected ---
test("8) Over/Under avec un seul cote (UNDER manquant) : rejete pour le devig", () => {
  const result = devigBookmakerMarket("FT_TOTAL_2.5", { OVER: 1.91 });
  assert.equal(result.complete, false);
  assert.equal(result.reason, "INCOMPLETE_MARKET");
  assert.deepEqual(result.missing_selections, ["UNDER"]);
});

// --- 9. invalid odds rejected ---
test("9) cotes invalides (<=1, marche sans borne declaree) : rejetees explicitement, jamais corrigees silencieusement", () => {
  const payload = makePayload([
    { id: 8, name: "Bet365", bets: [dc([{ value: "Home/Draw", odd: "0.5" }, { value: "Draw/Away", odd: "1.3" }, { value: "Home/Away", odd: "1.2" }])] },
  ]);
  const { valid, rejected } = buildBookmakerOffers(payload, { fixtureId: 1, retrievedAt: "2026-09-05T00:00:00Z" });
  const rejectedDc1x = rejected.find((o) => o.canonical_market_id === "FT_DC_1X");
  assert.ok(rejectedDc1x, "la cote DC 1X=0.5 doit etre rejetee");
  assert.equal(rejectedDc1x.reason, "INVALID_ODDS");
  assert.ok(!valid.some((o) => o.canonical_market_id === "FT_DC_1X"), "aucune cote invalide ne doit atteindre la liste valide");
});

// --- 10. duplicate offers deterministic ---
test("10) doublons : identiques dedupliques deterministe, incoherents rejetes explicitement (jamais moyennes)", () => {
  const identicalPayload = makePayload([
    { id: 8, name: "Bet365", bets: [mw([{ value: "Home", odd: "1.91" }, { value: "Draw", odd: "3.4" }, { value: "Away", odd: "4.2" }])] },
    { id: 8, name: "Bet365", bets: [mw([{ value: "Home", odd: "1.91" }, { value: "Draw", odd: "3.4" }, { value: "Away", odd: "4.2" }])] },
  ]);
  const r1 = buildBookmakerOffers(identicalPayload, { fixtureId: 1, retrievedAt: "2026-09-05T00:00:00Z", oddsSnapshotId: "snap-1" });
  assert.equal(r1.valid.filter((o) => o.canonical_market_id === "FT_1X2_HOME").length, 1, "doublon identique -> une seule offre valide");

  const inconsistentPayload = makePayload([
    { id: 8, name: "Bet365", bets: [mw([{ value: "Home", odd: "1.91" }, { value: "Draw", odd: "3.4" }, { value: "Away", odd: "4.2" }])] },
    { id: 8, name: "Bet365", bets: [mw([{ value: "Home", odd: "1.85" }, { value: "Draw", odd: "3.4" }, { value: "Away", odd: "4.2" }])] },
  ]);
  const r2 = buildBookmakerOffers(inconsistentPayload, { fixtureId: 1, retrievedAt: "2026-09-05T00:00:00Z", oddsSnapshotId: "snap-1" });
  assert.ok(!r2.valid.some((o) => o.canonical_market_id === "FT_1X2_HOME"), "doublon incoherent -> exclu de valid");
  assert.ok(r2.rejected.filter((o) => o.canonical_market_id === "FT_1X2_HOME" && o.reason === "DUPLICATE_INCONSISTENT").length >= 2);
});

// --- 11. stale/post-kickoff excluded from prematch set ---
test("11) cote recuperee apres le coup d'envoi : exclue du set pre-match, jamais silencieusement incluse", () => {
  const payload = makePayload([
    { id: 8, name: "Bet365", bets: [mw([{ value: "Home", odd: "1.91" }, { value: "Draw", odd: "3.4" }, { value: "Away", odd: "4.2" }])] },
  ]);
  const { valid } = buildBookmakerOffers(payload, { fixtureId: 1, retrievedAt: "2026-09-05T15:00:00Z", kickoff: "2026-09-05T14:00:00Z" });
  assert.ok(valid.every((o) => o.excluded_post_kickoff === true));
  const best = bestExecutableOffer(valid);
  assert.equal(best, null, "aucune offre executable pre-match disponible -> null, jamais une cote post-kickoff utilisee");
});

// --- 12. consensus median calcule APRES devig ---
test("12) consensus : mediane calculee sur des probabilites DEJA deviggees, jamais sur des cotes brutes", () => {
  const rows = [
    { fixture_id: 1, canonical_market_id: "FT_1X2_HOME", bookmaker_id: 8, shin_probability: 0.50, proportional_probability: 0.51 },
    { fixture_id: 1, canonical_market_id: "FT_1X2_HOME", bookmaker_id: 4, shin_probability: 0.52, proportional_probability: 0.53 },
    { fixture_id: 1, canonical_market_id: "FT_1X2_HOME", bookmaker_id: 16, shin_probability: 0.48, proportional_probability: 0.49 },
  ];
  const consensus = buildDevigConsensus(rows);
  const home = consensus.find((c) => c.canonical_market_id === "FT_1X2_HOME");
  assert.equal(home.consensus_method, "MEDIAN_OF_BOOKMAKER_DEVIG_PROBABILITIES");
  assert.equal(home.bookmakers_count, 3);
  assert.ok(Math.abs(home.median_devig_probability - 0.50) < EPS);
  // le champ ignore toute cote brute presente par erreur - preuve que le calcul n'utilise QUE les probabilites deja deviggees
  const rowsWithStrayOdds = rows.map((r) => ({ ...r, decimal_odds: 999 }));
  const consensus2 = buildDevigConsensus(rowsWithStrayOdds);
  assert.equal(JSON.stringify(consensus), JSON.stringify(consensus2));
});

// --- 13. best executable bookmaker correctly identified ---
test("13) meilleure cote executable : bookmaker correctement identifie, jamais une cote consensus fictive", () => {
  const offers = [
    { fixture_id: 1, canonical_market_id: "FT_1X2_HOME", bookmaker_id: 8, bookmaker_name: "Bet365", decimal_odds: 1.91, odds_snapshot_id: "s1", excluded_post_kickoff: false },
    { fixture_id: 1, canonical_market_id: "FT_1X2_HOME", bookmaker_id: 4, bookmaker_name: "Pinnacle", decimal_odds: 1.95, odds_snapshot_id: "s1", excluded_post_kickoff: false },
    { fixture_id: 1, canonical_market_id: "FT_1X2_HOME", bookmaker_id: 16, bookmaker_name: "Unibet", decimal_odds: 1.88, odds_snapshot_id: "s1", excluded_post_kickoff: false },
  ];
  const best = bestExecutableOffer(offers);
  assert.equal(best.best_decimal_odds, 1.95);
  assert.equal(best.best_bookmaker_id, 4);
  assert.equal(best.best_bookmaker_name, "Pinnacle");
});

// --- 14. same input => byte-identical output (determinisme) ---
test("14) determinisme : memes entrees => sorties JSON strictement identiques (ingest, devig, consensus, best-price)", () => {
  const payload = makePayload([
    { id: 8, name: "Bet365", bets: [mw([{ value: "Home", odd: "1.91" }, { value: "Draw", odd: "3.4" }, { value: "Away", odd: "4.2" }]), btts([{ value: "Yes", odd: "1.9" }, { value: "No", odd: "1.95" }])] },
  ]);
  const ctx = { fixtureId: 1, retrievedAt: "2026-09-05T00:00:00Z", kickoff: "2026-09-06T00:00:00Z", oddsSnapshotId: "s1" };
  const a1 = buildBookmakerOffers(payload, ctx);
  const a2 = buildBookmakerOffers(payload, ctx);
  assert.equal(JSON.stringify(a1), JSON.stringify(a2));

  const d1 = devigBookmakerMarket("FT_1X2", { HOME: 1.91, DRAW: 3.4, AWAY: 4.2 });
  const d2 = devigBookmakerMarket("FT_1X2", { HOME: 1.91, DRAW: 3.4, AWAY: 4.2 });
  assert.equal(JSON.stringify(d1), JSON.stringify(d2));

  const rows = flattenDevigResult("FT_1X2", d1).map((r) => ({ fixture_id: 1, bookmaker_id: 8, ...r }));
  const c1 = buildDevigConsensus(rows);
  const c2 = buildDevigConsensus(rows);
  assert.equal(JSON.stringify(c1), JSON.stringify(c2));

  const best1 = bestExecutableOffer(a1.valid.filter((o) => o.canonical_market_id === "FT_1X2_HOME"));
  const best2 = bestExecutableOffer(a2.valid.filter((o) => o.canonical_market_id === "FT_1X2_HOME"));
  assert.equal(JSON.stringify(best1), JSON.stringify(best2));
});

// --- 15. DNB conditional model probability correct ---
test("15) DNB : probabilite conditionnelle du modele = win/(win+loss), le nul est retire, jamais une comparaison naive", () => {
  const result = dnbConditionalFromModel({ winProbability: 0.45, pushProbability: 0.30, lossProbability: 0.25 });
  assert.equal(result.model_win, 0.45);
  assert.equal(result.model_push, 0.30);
  assert.equal(result.model_loss, 0.25);
  assert.ok(Math.abs(result.conditional_nonpush_model_probability - 0.45 / 0.70) < EPS);
});

// --- garde-fous structurels (item 17) ---
test("aucun champ EV/Kelly/stake/edge/BET-NO-BET/ROI n'apparait jamais dans les sorties Phase 2", () => {
  const d = devigBookmakerMarket("FT_1X2", { HOME: 1.85, DRAW: 3.4, AWAY: 4.2 });
  const consensus = buildDevigConsensus(flattenDevigResult("FT_1X2", d).map((r) => ({ fixture_id: 1, bookmaker_id: 8, ...r })));
  const gap = buildModelMarketGap({ fixtureId: 1, marketId: "FT_1X2_HOME", modelProbability: 0.5, consensusMarketProbability: 0.48 });
  const forbidden = ["kelly", "stake", "edge", "bet_recommendation", "roi", "min_odds", "threshold"];
  const serialized = JSON.stringify({ d, consensus, gap }).toLowerCase();
  for (const word of forbidden) assert.ok(!serialized.includes(word), `champ interdit trouve : ${word}`);
  // "ev" seul (pas en sous-chaine de "devig") : verifie via les cles
  // d'objet directement plutot qu'une recherche de sous-chaine, "devig"
  // contenant legitimement "ev".
  const allKeys = JSON.stringify(Object.keys(gap).concat(Object.keys(consensus[0] || {})));
  assert.ok(!/\bev\b/i.test(allKeys.replace(/[_-]/g, " ")));
  assert.ok(!("edge" in gap));
});

test("model-vs-market gap : jamais nomme edge, juste model_probability - consensus_market_probability", () => {
  const gap = buildModelMarketGap({ fixtureId: 42, marketId: "FT_BTTS_YES", modelProbability: 0.58, consensusMarketProbability: 0.52 });
  assert.ok(Math.abs(gap.probability_gap - 0.06) < EPS);
  assert.equal(gap.fixture_id, 42);
  assert.equal(gap.market_id, "FT_BTTS_YES");
});

test("FT_DNB n'a aucune entree de mapping bookmaker : aucune cote plein-temps directe dans la source, jamais synthetisee depuis 1X2", () => {
  const dnbEntries = [...CANONICAL_MARKET_MAP.values()].filter((m) => m.canonicalMarketId.startsWith("FT_DNB"));
  assert.deepEqual(dnbEntries, []);
});
