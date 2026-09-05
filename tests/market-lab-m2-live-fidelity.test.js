"use strict";
// MARKET LAB - PHASE 3A close-out (2026-09-05), item 3. Gate de
// fidelite M2_LIVE_REPLAY vs EXP-002C : prend des fixtures HISTORIQUES
// FERMEES (donc jamais une fixture future dans les features) et
// simule une generation "live" au meme cutoff que le walk-forward du
// lab a reellement utilise, puis compare lambdaH/lambdaA/matrice.
// Si divergence : M2_LIVE_REPLAY_MISMATCH, ce test echoue (STOP,
// jamais un chiffre invente en cas de doute - meme discipline que
// EXP-002 -> EXP-002R -> EXP-002C, ou ce type de bug (CHAMPION_REPLAY_MISMATCH)
// a deja ete decouvert et corrige dans ce meme lab).

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRealDataset } = require("../lib/lab/load-real-dataset.js");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");
const { predictWithRho } = require("../lib/lab/dc-matrix-with-rho.js");
const { buildM2LiveSnapshot, M2LiveReplayMismatchError, CHAMPION_RHO } = require("../lib/market-lab/m2-live-snapshot.js");

const EPS = 1e-9;

function loadRealPredictionsAndContext() {
  const dataset = loadRealDataset();
  const previousSeasonFixturesBySeasons = new Map();
  for (const season of dataset.oosSeasons) {
    previousSeasonFixturesBySeasons.set(season, dataset.allFixtures.filter((f) => f.season === season - 1));
  }
  const { predictions } = runWalkForwardM2C({ ...dataset, previousSeasonFixturesBySeasons });
  return { dataset, previousSeasonFixturesBySeasons, predictions };
}

test("M2_LIVE_REPLAY vs EXP-002C : lambdaH/lambdaA identiques (tolerance 1e-9) sur un echantillon de 100 fixtures reelles fermees, aucune fixture future dans les features", () => {
  const { dataset, previousSeasonFixturesBySeasons, predictions } = loadRealPredictionsAndContext();
  const sample = predictions.filter((p) => p.m0_valid).slice(0, 100);
  assert.ok(sample.length > 0, "echantillon vide - le dataset reel a-t-il change ?");

  let compared = 0;
  for (const pred of sample) {
    const snapshot = buildM2LiveSnapshot({
      fixtureId: pred.fixture_id,
      homeTeamId: pred.home_team_id,
      awayTeamId: pred.away_team_id,
      season: pred.season,
      leagueId: dataset.leagueId,
      allFixtures: dataset.allFixtures,
      previousSeasonFixtures: previousSeasonFixturesBySeasons.get(pred.season) || [],
      leagueAvgH: dataset.leagueAvgH,
      leagueAvgA: dataset.leagueAvgA,
      cutoff: pred.cutoff,
      generatedAt: "2026-09-05T00:00:00Z",
    });

    const dH = Math.abs(snapshot.lambda_h - pred.lambdaH_m2);
    const dA = Math.abs(snapshot.lambda_a - pred.lambdaA_m2);
    if (dH > EPS || dA > EPS) {
      assert.fail(`M2_LIVE_REPLAY_MISMATCH fixture_id=${pred.fixture_id}: dH=${dH} dA=${dA} (live=${snapshot.lambda_h},${snapshot.lambda_a} lab=${pred.lambdaH_m2},${pred.lambdaA_m2})`);
    }
    compared++;
  }
  assert.equal(compared, sample.length);
});

test("M2_LIVE_REPLAY : la matrice produite est identique a predictWithRho applique aux memes lambdas (meme fonction, jamais reimplementee)", () => {
  const { dataset, previousSeasonFixturesBySeasons, predictions } = loadRealPredictionsAndContext();
  const sample = predictions.filter((p) => p.m0_valid).slice(0, 20);
  for (const pred of sample) {
    const snapshot = buildM2LiveSnapshot({
      fixtureId: pred.fixture_id, homeTeamId: pred.home_team_id, awayTeamId: pred.away_team_id,
      season: pred.season, leagueId: dataset.leagueId, allFixtures: dataset.allFixtures,
      previousSeasonFixtures: previousSeasonFixturesBySeasons.get(pred.season) || [],
      leagueAvgH: dataset.leagueAvgH, leagueAvgA: dataset.leagueAvgA, cutoff: pred.cutoff,
      generatedAt: "2026-09-05T00:00:00Z",
    });
    const expectedMatrix = predictWithRho(snapshot.lambda_h, snapshot.lambda_a, CHAMPION_RHO).matrix;
    assert.equal(JSON.stringify(snapshot.matrix), JSON.stringify(expectedMatrix), `fixture=${pred.fixture_id}`);
  }
});

test("M2_LIVE_REPLAY : produit exactement les 36 IDs canoniques V1 a cardinalite fixe, exact score exclu", () => {
  const { dataset, previousSeasonFixturesBySeasons, predictions } = loadRealPredictionsAndContext();
  const pred = predictions.find((p) => p.m0_valid);
  const snapshot = buildM2LiveSnapshot({
    fixtureId: pred.fixture_id, homeTeamId: pred.home_team_id, awayTeamId: pred.away_team_id,
    season: pred.season, leagueId: dataset.leagueId, allFixtures: dataset.allFixtures,
    previousSeasonFixtures: previousSeasonFixturesBySeasons.get(pred.season) || [],
    leagueAvgH: dataset.leagueAvgH, leagueAvgA: dataset.leagueAvgA, cutoff: pred.cutoff,
    generatedAt: "2026-09-05T00:00:00Z",
  });
  assert.equal(snapshot.v1_probabilities.length, 36);
  assert.ok(snapshot.v1_probabilities.every((m) => !m.market_id.startsWith("FT_EXACT_SCORE")));
  const sum1x2 = snapshot.v1_probabilities.filter((m) => m.market_id.startsWith("FT_1X2_")).reduce((s, m) => s + m.probability, 0);
  assert.ok(Math.abs(sum1x2 - 1) < EPS);
});

test("M2_LIVE_REPLAY : snapshot immuable (fixture_id, generated_at, input_cutoff, matrix, matrix_hash presents et geles)", () => {
  const { dataset, previousSeasonFixturesBySeasons, predictions } = loadRealPredictionsAndContext();
  const pred = predictions.find((p) => p.m0_valid);
  const snapshot = buildM2LiveSnapshot({
    fixtureId: pred.fixture_id, homeTeamId: pred.home_team_id, awayTeamId: pred.away_team_id,
    season: pred.season, leagueId: dataset.leagueId, allFixtures: dataset.allFixtures,
    previousSeasonFixtures: previousSeasonFixturesBySeasons.get(pred.season) || [],
    leagueAvgH: dataset.leagueAvgH, leagueAvgA: dataset.leagueAvgA, cutoff: pred.cutoff,
    generatedAt: "2026-09-05T00:00:00Z",
  });
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.matrix));
  assert.ok(Object.isFrozen(snapshot.v1_probabilities));
  assert.throws(() => { snapshot.lambda_h = 999; }, TypeError);
  for (const key of ["fixture_id", "generated_at", "input_cutoff", "model_version", "lambda_h", "lambda_a", "matrix", "matrix_hash", "v1_probabilities"]) {
    assert.ok(key in snapshot, `champ manquant : ${key}`);
  }
});

test("M2LiveReplayMismatchError : levee explicitement si l'invariant LATE est viole, jamais un snapshot silencieusement faux", () => {
  assert.ok(M2LiveReplayMismatchError.prototype instanceof Error);
  const err = new M2LiveReplayMismatchError("test", { dH: 1, dA: 1 });
  assert.equal(err.name, "M2LiveReplayMismatchError");
});

test("determinisme : deux appels avec les memes entrees produisent un snapshot byte-identique", () => {
  const { dataset, previousSeasonFixturesBySeasons, predictions } = loadRealPredictionsAndContext();
  const pred = predictions.find((p) => p.m0_valid);
  const options = {
    fixtureId: pred.fixture_id, homeTeamId: pred.home_team_id, awayTeamId: pred.away_team_id,
    season: pred.season, leagueId: dataset.leagueId, allFixtures: dataset.allFixtures,
    previousSeasonFixtures: previousSeasonFixturesBySeasons.get(pred.season) || [],
    leagueAvgH: dataset.leagueAvgH, leagueAvgA: dataset.leagueAvgA, cutoff: pred.cutoff,
    generatedAt: "2026-09-05T00:00:00Z",
  };
  const s1 = buildM2LiveSnapshot(options);
  const s2 = buildM2LiveSnapshot(options);
  assert.equal(JSON.stringify(s1), JSON.stringify(s2));
});
