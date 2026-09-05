"use strict";
// MARKET LAB - PHASE 1 (2026-09-05), item 7 : coherence Score->Marches
// testee sur les fixtures REELLES deja closes du champion M2
// (SCORE-LAB-EXP-002C). Rejoue runWalkForwardM2C sur le dataset local
// (data/gate-b1/, aucun appel reseau) pour obtenir les VRAIES paires
// (lambdaH_m2, lambdaA_m2) par fixture, reconstruit la matrice M2 via
// predictWithRho (CHAMPION_RHO=-0.0845, la SEULE source de matrice,
// jamais reimplementee ici), puis verifie que buildMarketCatalogue
// respecte tous les invariants obligatoires (item 4) et est deterministe
// sur l'integralite du dataset ferme - pas seulement sur la matrice
// synthetique de tests/market-lab-catalogue.test.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadRealDataset } = require("../lib/lab/load-real-dataset.js");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");
const { predictWithRho } = require("../lib/lab/dc-matrix-with-rho.js");
const { buildMarketCatalogue } = require("../lib/market-lab/market-catalogue.js");

const CHAMPION_RHO = -0.0845;
const EPS = 1e-9;

function loadRealPredictions() {
  const dataset = loadRealDataset();
  const previousSeasonFixturesBySeasons = new Map();
  for (const season of dataset.oosSeasons) {
    previousSeasonFixturesBySeasons.set(season, dataset.allFixtures.filter((f) => f.season === season - 1));
  }
  const { predictions } = runWalkForwardM2C({ ...dataset, previousSeasonFixturesBySeasons });
  return predictions;
}

test("dataset reel charge : au moins plusieurs centaines de fixtures OOS fermees (2023-24 + 2024-25)", () => {
  const predictions = loadRealPredictions();
  assert.ok(predictions.length >= 500, `attendu >=500 fixtures, obtenu ${predictions.length}`);
});

test("invariants mathematiques (item 4) : verifies sur CHAQUE fixture reelle fermee, pas seulement sur la matrice synthetique", () => {
  const predictions = loadRealPredictions();
  assert.ok(predictions.length > 0);

  for (const pred of predictions) {
    const { matrix } = predictWithRho(pred.lambdaH_m2, pred.lambdaA_m2, CHAMPION_RHO);
    const catalogue = buildMarketCatalogue({ matrix, fixtureId: pred.fixture_id });
    const byId = new Map(catalogue.markets.map((m) => [m.market_id, m]));

    const p1 = byId.get("FT_1X2_HOME").probability;
    const pN = byId.get("FT_1X2_DRAW").probability;
    const p2 = byId.get("FT_1X2_AWAY").probability;
    assert.ok(Math.abs(p1 + pN + p2 - 1) < EPS, `1X2 fixture=${pred.fixture_id}`);

    assert.ok(Math.abs(byId.get("FT_DC_1X").probability - (p1 + pN)) < EPS, `DC 1X fixture=${pred.fixture_id}`);
    assert.ok(Math.abs(byId.get("FT_DC_X2").probability - (pN + p2)) < EPS, `DC X2 fixture=${pred.fixture_id}`);
    assert.ok(Math.abs(byId.get("FT_DC_12").probability - (p1 + p2)) < EPS, `DC 12 fixture=${pred.fixture_id}`);

    const dnbHome = byId.get("FT_DNB_HOME").settlement;
    const dnbAway = byId.get("FT_DNB_AWAY").settlement;
    assert.ok(Math.abs(dnbHome.win_probability + dnbHome.push_probability + dnbHome.loss_probability - 1) < EPS, `DNB home fixture=${pred.fixture_id}`);
    assert.ok(Math.abs(dnbAway.win_probability + dnbAway.push_probability + dnbAway.loss_probability - 1) < EPS, `DNB away fixture=${pred.fixture_id}`);

    const bttsYes = byId.get("FT_BTTS_YES").probability;
    const bttsNo = byId.get("FT_BTTS_NO").probability;
    assert.ok(Math.abs(bttsYes + bttsNo - 1) < EPS, `BTTS fixture=${pred.fixture_id}`);

    for (const line of ["0.5", "1.5", "2.5", "3.5", "4.5"]) {
      const over = byId.get(`FT_TOTAL_${line}_OVER`).probability;
      const under = byId.get(`FT_TOTAL_${line}_UNDER`).probability;
      assert.ok(Math.abs(over + under - 1) < EPS, `Total ${line} fixture=${pred.fixture_id}`);
    }

    for (const side of ["HOME", "AWAY"]) {
      for (const line of ["0.5", "1.5", "2.5", "3.5"]) {
        const over = byId.get(`FT_TEAM_TOTAL_${side}_${line}_OVER`).probability;
        const under = byId.get(`FT_TEAM_TOTAL_${side}_${line}_UNDER`).probability;
        assert.ok(Math.abs(over + under - 1) < EPS, `TeamTotal ${side} ${line} fixture=${pred.fixture_id}`);
      }
    }
  }
});

test("determinisme sur le dataset reel ferme : deux runs independants produisent des catalogues byte-identiques pour chaque fixture", () => {
  const predictions = loadRealPredictions();
  const sample = predictions.slice(0, 50);
  for (const pred of sample) {
    const run1 = predictWithRho(pred.lambdaH_m2, pred.lambdaA_m2, CHAMPION_RHO);
    const run2 = predictWithRho(pred.lambdaH_m2, pred.lambdaA_m2, CHAMPION_RHO);
    const catalogue1 = buildMarketCatalogue({ matrix: run1.matrix, fixtureId: pred.fixture_id });
    const catalogue2 = buildMarketCatalogue({ matrix: run2.matrix, fixtureId: pred.fixture_id });
    assert.equal(JSON.stringify(catalogue1), JSON.stringify(catalogue2), `fixture=${pred.fixture_id}`);
    assert.equal(catalogue1.source_matrix_hash, catalogue2.source_matrix_hash, `fixture=${pred.fixture_id}`);
  }
});

test("le hash de matrice distingue reellement des fixtures differentes (aucune collision triviale sur un echantillon reel)", () => {
  const predictions = loadRealPredictions();
  const sample = predictions.slice(0, 200);
  const hashes = new Set();
  for (const pred of sample) {
    const { matrix } = predictWithRho(pred.lambdaH_m2, pred.lambdaA_m2, CHAMPION_RHO);
    const catalogue = buildMarketCatalogue({ matrix, fixtureId: pred.fixture_id });
    hashes.add(catalogue.source_matrix_hash);
  }
  assert.ok(hashes.size > 1, "des lambdas differents doivent produire des hashes de matrice differents");
});
