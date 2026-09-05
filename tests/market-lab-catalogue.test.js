"use strict";
// MARKET LAB - PHASE 1 (2026-09-05). Tests synthetiques a matrice
// calculable a la main (item 7) + invariants mathematiques obligatoires
// (item 4) pour lib/market-lab/market-catalogue.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildMarketCatalogue, hashMatrix, MODEL_VERSION } = require("../lib/market-lab/market-catalogue.js");

const EPS = 1e-9;

// Matrice 3x3 (maxGoal=2) choisie a la main, somme = 1 exactement.
// Valeurs attendues calculees manuellement (voir description de la
// tache) : p1=0.45, pDraw=0.30, p2=0.25 ; BTTS_YES=0.35 ; etc.
const SYNTHETIC_MATRIX = [
  [0.10, 0.15, 0.05],
  [0.20, 0.10, 0.05],
  [0.15, 0.10, 0.10],
];

function marketsById(catalogue) {
  const map = new Map();
  for (const m of catalogue.markets) map.set(m.market_id, m);
  return map;
}

test("matrice synthetique a somme 1 (verification de l'hypothese du test lui-meme)", () => {
  let total = 0;
  for (const row of SYNTHETIC_MATRIX) for (const v of row) total += v;
  assert.ok(Math.abs(total - 1) < EPS);
});

test("1X2 : correspond exactement au calcul a la main (p1=0.45, draw=0.30, p2=0.25)", () => {
  const catalogue = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  const byId = marketsById(catalogue);
  assert.ok(Math.abs(byId.get("FT_1X2_HOME").probability - 0.45) < EPS);
  assert.ok(Math.abs(byId.get("FT_1X2_DRAW").probability - 0.30) < EPS);
  assert.ok(Math.abs(byId.get("FT_1X2_AWAY").probability - 0.25) < EPS);
});

test("Double Chance : derive exactement de 1X2 (1X=0.75, X2=0.55, 12=0.70)", () => {
  const catalogue = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  const byId = marketsById(catalogue);
  assert.ok(Math.abs(byId.get("FT_DC_1X").probability - 0.75) < EPS);
  assert.ok(Math.abs(byId.get("FT_DC_X2").probability - 0.55) < EPS);
  assert.ok(Math.abs(byId.get("FT_DC_12").probability - 0.70) < EPS);
});

test("DNB : structure win/push/loss complete, jamais une probabilite binaire", () => {
  const catalogue = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  const byId = marketsById(catalogue);
  const dnbHome = byId.get("FT_DNB_HOME");
  const dnbAway = byId.get("FT_DNB_AWAY");
  assert.equal(dnbHome.settlement_structure, "WIN_PUSH_LOSS");
  assert.equal(dnbAway.settlement_structure, "WIN_PUSH_LOSS");
  assert.ok(Math.abs(dnbHome.settlement.win_probability - 0.45) < EPS);
  assert.ok(Math.abs(dnbHome.settlement.push_probability - 0.30) < EPS);
  assert.ok(Math.abs(dnbHome.settlement.loss_probability - 0.25) < EPS);
  assert.ok(Math.abs(dnbAway.settlement.win_probability - 0.25) < EPS);
  assert.ok(Math.abs(dnbAway.settlement.push_probability - 0.30) < EPS);
  assert.ok(Math.abs(dnbAway.settlement.loss_probability - 0.45) < EPS);
  const sumHome = dnbHome.settlement.win_probability + dnbHome.settlement.push_probability + dnbHome.settlement.loss_probability;
  const sumAway = dnbAway.settlement.win_probability + dnbAway.settlement.push_probability + dnbAway.settlement.loss_probability;
  assert.ok(Math.abs(sumHome - 1) < EPS);
  assert.ok(Math.abs(sumAway - 1) < EPS);
});

test("BTTS : YES=0.35, NO=0.65, somme=1", () => {
  const catalogue = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  const byId = marketsById(catalogue);
  assert.ok(Math.abs(byId.get("FT_BTTS_YES").probability - 0.35) < EPS);
  assert.ok(Math.abs(byId.get("FT_BTTS_NO").probability - 0.65) < EPS);
});

test("Total buts O/U : correspond exactement au calcul a la main pour chaque ligne", () => {
  const catalogue = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  const byId = marketsById(catalogue);
  const expected = { "0.5": 0.90, "1.5": 0.55, "2.5": 0.25, "3.5": 0.10, "4.5": 0 };
  for (const [line, over] of Object.entries(expected)) {
    assert.ok(Math.abs(byId.get(`FT_TOTAL_${line}_OVER`).probability - over) < EPS, `ligne ${line} over`);
    assert.ok(Math.abs(byId.get(`FT_TOTAL_${line}_UNDER`).probability - (1 - over)) < EPS, `ligne ${line} under`);
  }
});

test("Team Totals Home/Away O/U : correspond exactement au calcul a la main pour chaque ligne", () => {
  const catalogue = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  const byId = marketsById(catalogue);
  const expectedHome = { "0.5": 0.70, "1.5": 0.35, "2.5": 0, "3.5": 0 };
  const expectedAway = { "0.5": 0.55, "1.5": 0.20, "2.5": 0, "3.5": 0 };
  for (const [line, over] of Object.entries(expectedHome)) {
    assert.ok(Math.abs(byId.get(`FT_TEAM_TOTAL_HOME_${line}_OVER`).probability - over) < EPS, `home ${line} over`);
    assert.ok(Math.abs(byId.get(`FT_TEAM_TOTAL_HOME_${line}_UNDER`).probability - (1 - over)) < EPS, `home ${line} under`);
  }
  for (const [line, over] of Object.entries(expectedAway)) {
    assert.ok(Math.abs(byId.get(`FT_TEAM_TOTAL_AWAY_${line}_OVER`).probability - over) < EPS, `away ${line} over`);
    assert.ok(Math.abs(byId.get(`FT_TEAM_TOTAL_AWAY_${line}_UNDER`).probability - (1 - over)) < EPS, `away ${line} under`);
  }
});

test("Exact Score : chaque cellule de la matrice est presente, marquee diagnostic_only, et vaut exactement la cellule", () => {
  const catalogue = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  const byId = marketsById(catalogue);
  for (let h = 0; h < 3; h++) {
    for (let a = 0; a < 3; a++) {
      const m = byId.get(`FT_EXACT_SCORE_${h}_${a}`);
      assert.ok(m, `FT_EXACT_SCORE_${h}_${a} doit exister`);
      assert.equal(m.diagnostic_only, true);
      assert.ok(Math.abs(m.probability - SYNTHETIC_MATRIX[h][a]) < EPS);
    }
  }
});

test("chaque objet marche contient au minimum : fixture_id, model_version, market_id, selection, probability, settlement_structure, source_matrix_hash", () => {
  const catalogue = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "FIX-42" });
  for (const m of catalogue.markets) {
    assert.equal(m.fixture_id, "FIX-42");
    assert.equal(m.model_version, MODEL_VERSION);
    assert.ok(typeof m.market_id === "string" && m.market_id.length > 0);
    assert.ok(typeof m.selection === "string" && m.selection.length > 0);
    assert.ok(typeof m.probability === "number");
    assert.ok(["BINARY", "WIN_PUSH_LOSS"].includes(m.settlement_structure));
    assert.equal(m.source_matrix_hash, catalogue.source_matrix_hash);
  }
});

test("invariant : 1X2 somme a 1 pour toute matrice normalisee valide (pas seulement le cas synthetique choisi)", () => {
  const otherMatrix = [
    [0.5, 0.2],
    [0.2, 0.1],
  ];
  const catalogue = buildMarketCatalogue({ matrix: otherMatrix, fixtureId: "SYN-2" });
  const byId = marketsById(catalogue);
  const sum = byId.get("FT_1X2_HOME").probability + byId.get("FT_1X2_DRAW").probability + byId.get("FT_1X2_AWAY").probability;
  assert.ok(Math.abs(sum - 1) < EPS);
});

test("determinisme : deux appels sur la MEME matrice produisent une sortie JSON strictement byte-identique", () => {
  const catalogue1 = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  const catalogue2 = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  assert.equal(JSON.stringify(catalogue1), JSON.stringify(catalogue2));
});

test("coherence : meme hash de matrice => memes probabilites de marche (le hash n'est pas un simple decor)", () => {
  const catalogue1 = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-A" });
  const catalogue2 = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-B" });
  assert.equal(catalogue1.source_matrix_hash, catalogue2.source_matrix_hash);
  assert.equal(catalogue1.source_matrix_hash, hashMatrix(SYNTHETIC_MATRIX));
  for (let i = 0; i < catalogue1.markets.length; i++) {
    assert.equal(catalogue1.markets[i].probability, catalogue2.markets[i].probability);
    assert.equal(catalogue1.markets[i].market_id, catalogue2.markets[i].market_id);
  }
});

test("aucun marche Asian n'est calcule en V1 : le catalogue ne contient aucun market_id commencant par FT_ASIAN", () => {
  const catalogue = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  const asianMarkets = catalogue.markets.filter((m) => m.market_id.startsWith("FT_ASIAN"));
  assert.deepEqual(asianMarkets, []);
});

test("aucun marche hors-perimetre V1 (joueurs, corners, cartons, mi-temps, combines) n'est jamais produit", () => {
  const catalogue = buildMarketCatalogue({ matrix: SYNTHETIC_MATRIX, fixtureId: "SYN-1" });
  const forbiddenPrefixes = ["PLAYER_", "CORNERS_", "SHOTS_", "CARDS_", "HT_", "COMBO_"];
  for (const m of catalogue.markets) {
    for (const prefix of forbiddenPrefixes) {
      assert.ok(!m.market_id.startsWith(prefix), `${m.market_id} ne doit jamais exister en V1`);
    }
  }
});
