"use strict";
// EXP-003 item 1 (audit 2026-09-05) - INVARIANT OBLIGATOIRE avant toute
// utilisation du dataset warm-up 2021-22 : ajouter 2021-22 a allFixtures
// ne doit modifier AUCUNE sortie M2 deja validee sur les 760 fixtures
// OOS d'EXP-002C (2023-24, 2024-25). Si cet invariant echoue, EXP-003
// doit s'arreter avant tout calcul de performance (Si cet invariant
// echoue: STOP, spec utilisateur).
//
// Raison structurelle attendue (verifiee ici empiriquement, pas
// supposee) : buildProductionStateAtCutoff filtre STRICTEMENT
// f.season===targetSeason (2021 n'est jamais la saison cible pour un
// match OOS 2023/2024), et previousSeasonFixturesBySeasons(2023/2024)
// pointe toujours vers 2022/2023 - 2021 n'est referencee par AUCUN
// chemin du calcul des 760 predictions OOS existantes.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");

const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }

test("M2_EXP002C_OUTPUTS == M2_NEW_DATASET_OUTPUTS : ajouter 2021-22 a allFixtures ne change AUCUNE des 760 predictions OOS (byte-identique)", () => {
  const f2021 = loadSeason(2021), f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);
  assert.equal(f2021.length, 380, "warm-up 2021-22 doit contenir 380 fixtures (saison complete)");

  const baseOptions = {
    oosSeasons: [2023, 2024],
    leagueId: 39, leagueAvgH: 1.35, leagueAvgA: 1.10,
    previousSeasonFixturesBySeasons: new Map([[2023, f2022], [2024, f2023]]),
  };

  const resultWithout2021 = runWalkForwardM2C({ ...baseOptions, allFixtures: [...f2022, ...f2023, ...f2024] });
  const resultWith2021 = runWalkForwardM2C({ ...baseOptions, allFixtures: [...f2021, ...f2022, ...f2023, ...f2024] });

  assert.equal(resultWithout2021.predictions.length, 760);
  assert.equal(resultWith2021.predictions.length, 760, "le nombre de predictions OOS ne doit pas changer avec le warm-up");
  assert.deepEqual(resultWith2021.predictions, resultWithout2021.predictions, "M2_NEW_DATASET_OUTPUTS doit etre BYTE-IDENTIQUE a M2_EXP002C_OUTPUTS sur les 760 fixtures OOS");

  // Contre-verification a <=1e-12 sur les champs numeriques cles, independamment de deepEqual, pour un diagnostic plus lisible en cas d'echec futur.
  let maxDiffLambdaH = 0, maxDiffLambdaA = 0;
  for (let i = 0; i < resultWithout2021.predictions.length; i++) {
    const a = resultWithout2021.predictions[i], b = resultWith2021.predictions[i];
    assert.equal(a.fixture_id, b.fixture_id);
    maxDiffLambdaH = Math.max(maxDiffLambdaH, Math.abs(a.lambdaH_m2 - b.lambdaH_m2));
    maxDiffLambdaA = Math.max(maxDiffLambdaA, Math.abs(a.lambdaA_m2 - b.lambdaA_m2));
  }
  assert.ok(maxDiffLambdaH <= 1e-12, `maxDiffLambdaH=${maxDiffLambdaH}`);
  assert.ok(maxDiffLambdaA <= 1e-12, `maxDiffLambdaA=${maxDiffLambdaA}`);
});

test("M2_EXP002C_OUTPUTS == M2_NEW_DATASET_OUTPUTS : identique aussi contre le vrai rapport EXP-002C persiste (pas seulement entre deux runs locaux)", () => {
  const f2021 = loadSeason(2021), f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);
  const result = runWalkForwardM2C({
    allFixtures: [...f2021, ...f2022, ...f2023, ...f2024],
    oosSeasons: [2023, 2024],
    leagueId: 39, leagueAvgH: 1.35, leagueAvgA: 1.10,
    previousSeasonFixturesBySeasons: new Map([[2023, f2022], [2024, f2023]]),
  });
  const exp002cReport = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts", "experiments", "exp002c_report.json"), "utf8"));
  const byId = new Map(exp002cReport.predictions.map((p) => [p.fixture_id, p]));
  let checked = 0;
  for (const p of result.predictions) {
    if (!p.m0_valid) continue; // COMMON_SUPPORT uniquement, comme le rapport persiste
    const real = byId.get(p.fixture_id);
    assert.ok(real, `fixture ${p.fixture_id} doit exister dans le rapport EXP-002C deja clos`);
    assert.equal(p.lambdaH_m2, real.lambdaH_m2, `lambdaH_m2 fixture ${p.fixture_id}`);
    assert.equal(p.lambdaA_m2, real.lambdaA_m2, `lambdaA_m2 fixture ${p.fixture_id}`);
    checked++;
  }
  assert.equal(checked, 699, "doit verifier exactement les 699 fixtures COMMON_SUPPORT deja closes");
});
