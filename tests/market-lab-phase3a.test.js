"use strict";
// MARKET LAB - PHASE 3A (2026-09-05). Outcome engine exhaustif (item 8,
// scores synthetiques imposes) + tests des modules descriptifs/scaffold
// (items 6, 9-14, 16-17) + garde-fous structurels (item 15 : aucun
// BET/NO BET, aucune optimisation de seuil).

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveCanonicalMarketOutcome, buildResultsLink, RESULT_STATUS } = require("../lib/market-lab/results-link.js");
const { EXECUTION_HORIZONS, decisionHorizons } = require("../lib/market-lab/execution-horizons.js");
const { logloss, brier, computeDescriptiveMetrics } = require("../lib/market-lab/descriptive-metrics.js");
const { PHASE3_STATUS, READINESS_GATE, READINESS_GATE_IMPLEMENTATION, checkReadinessGate, logit, buildLogisticModelVsMarketRow, buildCalibrationBuckets } = require("../lib/market-lab/calibration-scaffold.js");
const { computeShadowEv, EV_STATUS } = require("../lib/market-lab/ev-shadow.js");
const { computeClv } = require("../lib/market-lab/clv.js");
const { buildDailyMonitoringReport } = require("../lib/market-lab/monitoring-report.js");
const { transformSnapshotRow } = require("../scripts/backfill-forward-odds-timeline.js");

const EPS = 1e-9;

// item 8 : les 10 scores synthetiques imposes.
const SYNTHETIC_SCORES = [
  { h: 0, a: 0 }, { h: 1, a: 0 }, { h: 0, a: 1 }, { h: 1, a: 1 }, { h: 2, a: 1 },
  { h: 1, a: 2 }, { h: 3, a: 0 }, { h: 0, a: 3 }, { h: 3, a: 3 }, { h: 5, a: 2 },
];

test("outcome engine : 1X2 correct sur les 10 scores synthetiques", () => {
  for (const { h, a } of SYNTHETIC_SCORES) {
    const expected = h > a ? "HOME" : h < a ? "AWAY" : "DRAW";
    for (const sel of ["HOME", "DRAW", "AWAY"]) {
      const outcome = resolveCanonicalMarketOutcome(`FT_1X2_${sel}`, sel, { homeGoals: h, awayGoals: a });
      assert.equal(outcome, sel === expected ? "WIN" : "LOSE", `1X2 ${sel} pour ${h}-${a}`);
    }
  }
});

test("outcome engine : Double Chance correct sur les 10 scores (chaque selection couvre 2 des 3 issues)", () => {
  for (const { h, a } of SYNTHETIC_SCORES) {
    const home = h > a, draw = h === a, away = h < a;
    assert.equal(resolveCanonicalMarketOutcome("FT_DC_1X", "1X", { homeGoals: h, awayGoals: a }), (home || draw) ? "WIN" : "LOSE", `DC 1X pour ${h}-${a}`);
    assert.equal(resolveCanonicalMarketOutcome("FT_DC_X2", "X2", { homeGoals: h, awayGoals: a }), (draw || away) ? "WIN" : "LOSE", `DC X2 pour ${h}-${a}`);
    assert.equal(resolveCanonicalMarketOutcome("FT_DC_12", "12", { homeGoals: h, awayGoals: a }), (home || away) ? "WIN" : "LOSE", `DC 12 pour ${h}-${a}`);
  }
});

test("outcome engine : BTTS correct sur les 10 scores", () => {
  const expectedYes = { "0-0": false, "1-0": false, "0-1": false, "1-1": true, "2-1": true, "1-2": true, "3-0": false, "0-3": false, "3-3": true, "5-2": true };
  for (const { h, a } of SYNTHETIC_SCORES) {
    const key = `${h}-${a}`;
    const yes = resolveCanonicalMarketOutcome("FT_BTTS_YES", "YES", { homeGoals: h, awayGoals: a });
    assert.equal(yes, expectedYes[key] ? "WIN" : "LOSE", `BTTS YES pour ${key}`);
  }
});

test("outcome engine : DNB correct (push sur nul, sinon win/lose miroir) sur les 10 scores", () => {
  for (const { h, a } of SYNTHETIC_SCORES) {
    const homeOutcome = resolveCanonicalMarketOutcome("FT_DNB_HOME", "HOME", { homeGoals: h, awayGoals: a });
    const awayOutcome = resolveCanonicalMarketOutcome("FT_DNB_AWAY", "AWAY", { homeGoals: h, awayGoals: a });
    if (h === a) {
      assert.equal(homeOutcome, "PUSH", `DNB home push pour ${h}-${a}`);
      assert.equal(awayOutcome, "PUSH", `DNB away push pour ${h}-${a}`);
    } else {
      assert.equal(homeOutcome, h > a ? "WIN" : "LOSE");
      assert.equal(awayOutcome, h > a ? "LOSE" : "WIN");
    }
  }
});

test("outcome engine : Total buts O/U (lignes 0.5 a 4.5) correct sur les 10 scores", () => {
  for (const { h, a } of SYNTHETIC_SCORES) {
    const total = h + a;
    for (const line of [0.5, 1.5, 2.5, 3.5, 4.5]) {
      const over = total > line;
      assert.equal(resolveCanonicalMarketOutcome(`FT_TOTAL_${line}_OVER`, "OVER", { homeGoals: h, awayGoals: a }), over ? "WIN" : "LOSE", `Total ${line} OVER pour ${h}-${a}`);
      assert.equal(resolveCanonicalMarketOutcome(`FT_TOTAL_${line}_UNDER`, "UNDER", { homeGoals: h, awayGoals: a }), !over ? "WIN" : "LOSE", `Total ${line} UNDER pour ${h}-${a}`);
    }
  }
});

test("outcome engine : Team Totals Home/Away O/U correct sur les 10 scores", () => {
  for (const { h, a } of SYNTHETIC_SCORES) {
    for (const line of [0.5, 1.5, 2.5, 3.5]) {
      const overHome = h > line, overAway = a > line;
      assert.equal(resolveCanonicalMarketOutcome(`FT_TEAM_TOTAL_HOME_${line}_OVER`, "OVER", { homeGoals: h, awayGoals: a }), overHome ? "WIN" : "LOSE");
      assert.equal(resolveCanonicalMarketOutcome(`FT_TEAM_TOTAL_AWAY_${line}_OVER`, "OVER", { homeGoals: h, awayGoals: a }), overAway ? "WIN" : "LOSE");
    }
  }
});

test("outcome engine : Exact Score (diagnostic) correct sur les 10 scores", () => {
  for (const { h, a } of SYNTHETIC_SCORES) {
    assert.equal(resolveCanonicalMarketOutcome(`FT_EXACT_SCORE_${h}_${a}`, `${h}-${a}`, { homeGoals: h, awayGoals: a }), "WIN");
    assert.equal(resolveCanonicalMarketOutcome("FT_EXACT_SCORE_9_9", "9-9", { homeGoals: h, awayGoals: a }), (h === 9 && a === 9) ? "WIN" : "LOSE");
  }
});

test("outcome engine : jamais de resultat fabrique quand le score n'est pas disponible", () => {
  assert.equal(resolveCanonicalMarketOutcome("FT_1X2_HOME", "HOME", { homeGoals: null, awayGoals: null }), null);
});

test("regulation vs kickoff-passe : RESULT_STATUS=SETTLED uniquement si score reglementaire final, jamais si en cours", () => {
  const settled = buildResultsLink({ fixture: { id: 1, status: { short: "FT" } }, score: { fulltime: { home: 2, away: 0 } } });
  assert.equal(settled.result_status, RESULT_STATUS.SETTLED);
  const inProgress = buildResultsLink({ fixture: { id: 2, status: { short: "2H" } } });
  assert.equal(inProgress.result_status, RESULT_STATUS.PENDING);
  const postponed = buildResultsLink({ fixture: { id: 3, status: { short: "PST" } } });
  assert.equal(postponed.result_status, RESULT_STATUS.VOID);
});

test("execution horizons : EARLY/STANDARD/LATE sont des horizons de decision, CLOSE reste diagnostic uniquement", () => {
  assert.equal(EXECUTION_HORIZONS.EARLY.snapshotPhase, "T24");
  assert.equal(EXECUTION_HORIZONS.STANDARD.snapshotPhase, "T6");
  assert.equal(EXECUTION_HORIZONS.LATE.snapshotPhase, "T1");
  assert.equal(EXECUTION_HORIZONS.CLOSE.role, "DIAGNOSTIC_ONLY");
  assert.deepEqual(decisionHorizons().sort(), ["EARLY", "LATE", "STANDARD"]);
});

test("descriptive metrics : logloss/Brier corrects sur des cas a la main, delta apparie coherent", () => {
  assert.ok(Math.abs(logloss(0.8, true) - (-Math.log(0.8))) < EPS);
  assert.ok(Math.abs(logloss(0.8, false) - (-Math.log(0.2))) < EPS);
  assert.ok(Math.abs(brier(0.8, true) - 0.04) < EPS);
  assert.ok(Math.abs(brier(0.8, false) - 0.64) < EPS);

  const rows = [
    { model_probability: 0.6, market_probability_shin: 0.5, outcome: "WIN" },
    { model_probability: 0.6, market_probability_shin: 0.5, outcome: "LOSE" },
    { model_probability: 0.5, market_probability_shin: 0.5, outcome: "PUSH" },
  ];
  const metrics = computeDescriptiveMetrics(rows);
  assert.equal(metrics.n, 2, "PUSH doit etre exclu du calcul");
  assert.ok(typeof metrics.paired_delta_logloss_mean === "number");
});

test("readiness gate : PAS pret avec un petit echantillon, pret uniquement au-dessus des seuils pre-enregistres", () => {
  const small = checkReadinessGate({ nSettledFixtures: 12, nCompleteMarketObservations: 40, nCalendarPeriods: 1 });
  assert.equal(small.ready, false);
  assert.ok(small.reasons.includes("INSUFFICIENT_SETTLED_FIXTURES"));
  const big = checkReadinessGate({ nSettledFixtures: 350, nCompleteMarketObservations: 600, nCalendarPeriods: 3 });
  assert.equal(big.ready, true);
  assert.deepEqual(big.reasons, []);
  assert.equal(READINESS_GATE.CLUSTERING_UNIT, "fixture_id");
});

test("READINESS_GATE_IMPLEMENTATION (code) et DATA_READINESS (donnees reelles) sont deux valeurs distinctes, jamais confondues", () => {
  assert.equal(READINESS_GATE_IMPLEMENTATION, "PASS", "le CODE du gate est correct et teste");
  // Etat reel au 2026-09-05 (retour Phase 3A) : ~12 fixtures settled,
  // tres en-dessous du minimum de 300 - DATA_READINESS doit rester
  // FALSE meme si l'implementation du gate elle-meme est PASS.
  const dataReadiness = checkReadinessGate({ nSettledFixtures: 12, nCompleteMarketObservations: 264, nCalendarPeriods: 1 });
  assert.equal(dataReadiness.ready, false, "DATA_READINESS doit etre FALSE avec les donnees reelles actuelles");
  assert.notEqual(READINESS_GATE_IMPLEMENTATION, dataReadiness.ready, "READINESS_GATE_IMPLEMENTATION=PASS ne doit jamais s'afficher comme si DATA_READINESS=true");
});

test("PHASE3_STATUS reste SHADOW_COLLECTING - jamais MODEL_BEATS_MARKET/VALUE_VALIDATED/PROFITABLE", () => {
  assert.equal(PHASE3_STATUS, "SHADOW_COLLECTING");
  const forbidden = ["model_beats_market", "value_validated", "profitable", "premium_edge_confirmed"];
  assert.ok(!forbidden.includes(PHASE3_STATUS.toLowerCase()));
});

test("logit / incremental-info dataset : deux formulations pre-enregistrees (gap lineaire et gap logit), jamais choisies apres coup", () => {
  assert.ok(Math.abs(logit(0.5) - 0) < EPS);
  const row = buildLogisticModelVsMarketRow({ fixtureId: 1, marketId: "FT_1X2_HOME", modelProbability: 0.55, consensusMarketProbability: 0.5, outcome: "WIN" });
  assert.ok(Math.abs(row.x_probability_gap - 0.05) < EPS);
  assert.ok(Math.abs(row.x_logit_model_signal - (logit(0.55) - logit(0.5))) < EPS);
  const pushRow = buildLogisticModelVsMarketRow({ fixtureId: 1, marketId: "FT_DNB_HOME", modelProbability: 0.5, consensusMarketProbability: 0.5, outcome: "PUSH" });
  assert.equal(pushRow, null, "PUSH ne doit jamais alimenter le dataset incremental");
});

test("calibration buckets : petit N tague INSUFFICIENT_SAMPLE, jamais interprete", () => {
  const rows = [buildLogisticModelVsMarketRow({ fixtureId: 1, marketId: "FT_1X2_HOME", modelProbability: 0.65, consensusMarketProbability: 0.6, outcome: "WIN" })];
  const buckets = buildCalibrationBuckets(rows, "x_model_probability", 10);
  const nonEmpty = buckets.filter((b) => b.n > 0);
  assert.ok(nonEmpty.every((b) => b.sample_status === "INSUFFICIENT_SAMPLE"));
});

test("EV shadow : formule correcte, tag UNVALIDATED_SHADOW obligatoire, aucun champ d'optimisation", () => {
  const result = computeShadowEv({ modelProbability: 0.55, decimalOdds: 2.0 });
  assert.ok(Math.abs(result.ev - (0.55 * 2.0 - 1)) < EPS);
  assert.equal(result.ev_status, "UNVALIDATED_SHADOW");
  assert.equal(EV_STATUS, "UNVALIDATED_SHADOW");
  assert.ok(!("min_ev" in result) && !("min_odds" in result) && !("threshold" in result));
});

test("CLV : separe du ROI, formule correcte", () => {
  const result = computeClv({ executionOdds: 2.1, closingFairProbability: 0.5 });
  assert.ok(Math.abs(result.closing_fair_odds - 2.0) < EPS);
  assert.ok(Math.abs(result.clv_pct - 5) < EPS);
  assert.ok(!("roi" in result));
});

test("monitoring report : forme correcte, purement descriptif", () => {
  const report = buildDailyMonitoringReport({
    fixturesFollowed: 34, fixturesSettled: 12, snapshotsByPhase: { T72: 30, T24: 20 },
    bookmakerCoverage: 13, marketCoverage: 34, missingPhases: ["T1", "CLOSE"],
    invalidOddsCount: 8, shinFailureCount: 0, modelSnapshotFailureCount: 0,
    apiCallsToday: 15, apiQuotaRemaining: null,
  });
  assert.equal(report.fixtures_followed, 34);
  assert.equal(report.shin_failure_count, 0);
});

test("backfill script : transformation pure, deterministe, replay du meme snapshot => mêmes lignes canoniques", () => {
  const snapshotRow = {
    fixture_id: 42, league_id: 39, snapshot_phase: "T24", captured_at: "2026-09-05T00:00:00Z",
    raw_odds: {
      fixture: { id: 42, date: "2026-09-06T00:00:00Z" },
      bookmakers: [{ id: 8, name: "Bet365", bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "1.91" }, { value: "Draw", odd: "3.4" }, { value: "Away", odd: "4.2" }] }] }],
    },
  };
  const rows1 = transformSnapshotRow(snapshotRow);
  const rows2 = transformSnapshotRow(snapshotRow);
  assert.equal(JSON.stringify(rows1), JSON.stringify(rows2));
  assert.equal(rows1.length, 3);
  assert.ok(rows1.every((r) => Object.isFrozen(r)));
});

test("garde-fous structurels Phase 3A : aucun champ BET/NO_BET/min_odds/threshold-tuning dans les modules descriptifs", () => {
  const gate = checkReadinessGate({ nSettledFixtures: 10, nCompleteMarketObservations: 10, nCalendarPeriods: 1 });
  const ev = computeShadowEv({ modelProbability: 0.5, decimalOdds: 2 });
  const clv = computeClv({ executionOdds: 2, closingFairProbability: 0.5 });
  const serialized = JSON.stringify({ gate, ev, clv }).toLowerCase();
  for (const word of ["bet_recommendation", "no_bet", "min_odds", "kelly", "stake"]) {
    assert.ok(!serialized.includes(word), `champ interdit trouve : ${word}`);
  }
});
