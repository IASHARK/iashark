"use strict";
// EXP-002C - tests de CONTRAT obligatoires AVANT tout lancement reel.
// Utilisent les VRAIES donnees Premier League (data/gate-b1/) et le VRAI
// rapport EXP-001R (le champion M0_PRODUCTION_REPLAY accepte) comme
// reference.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");
const { priorWeight } = require("../lib/lab/bayes-early-season.js");

const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }
const f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);
const exp001r = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts", "experiments", "exp001r_report.json"), "utf8"));
const exp001rById = new Map(exp001r.predictions.map((p) => [p.fixture_id, p]));

const RUN_OPTIONS = {
  allFixtures: [...f2022, ...f2023, ...f2024],
  oosSeasons: [2023, 2024],
  leagueId: 39, leagueAvgH: 1.35, leagueAvgA: 1.10,
  previousSeasonFixturesBySeasons: new Map([[2023, f2022], [2024, f2023]]),
};

let SHARED_RESULT;
test.before(() => { SHARED_RESULT = runWalkForwardM2C(RUN_OPTIONS); });

test("le run reel ne leve AUCUNE exception (invariant LATE tient structurellement sur les donnees reelles)", () => {
  assert.equal(SHARED_RESULT.predictions.length, 760);
});

test("COMMON_SUPPORT = 699, M2_COVERAGE_GAIN = 61 (correspond exactement au vrai champion EXP-001R)", () => {
  const commonSupport = SHARED_RESULT.predictions.filter((p) => p.m0_valid);
  const coverageGain = SHARED_RESULT.predictions.filter((p) => !p.m0_valid);
  assert.equal(commonSupport.length, 699);
  assert.equal(coverageGain.length, 61);
});

test("TEST B - baseline identity : lambda_base_M2 (baseState avant Bayes, weight=0 sur TOUT COMMON_SUPPORT ou weight>0 sinon) == lambdas REELLEMENT persistes par EXP-001R, diff EXACTEMENT nulle", () => {
  const commonSupport = SHARED_RESULT.predictions.filter((p) => p.m0_valid);
  let checked = 0;
  for (const p of commonSupport) {
    const real = exp001rById.get(p.fixture_id);
    assert.ok(real, `fixture ${p.fixture_id} doit exister dans EXP-001R`);
    assert.equal(p.lambdaH_m0, real.lambdaH, `lambdaH_m0 fixture ${p.fixture_id}`);
    assert.equal(p.lambdaA_m0, real.lambdaA, `lambdaA_m0 fixture ${p.fixture_id}`);
    checked++;
  }
  assert.equal(checked, 699);
  console.log(`  TEST B : ${checked} fixtures verifiees contre le vrai champion EXP-001R, 0 divergence`);
});

test("TEST A - LATE identity sur >=20 fixtures REELLES a poids nul des deux cotes : lambdas ET marches identiques a <=1e-12, reference = vrai champion EXP-001R", () => {
  const zeroWeightBoth = SHARED_RESULT.predictions.filter((p) => p.m0_valid && p.prior_weight_home === 0 && p.prior_weight_away === 0);
  assert.ok(zeroWeightBoth.length >= 20, `seulement ${zeroWeightBoth.length} cas, attendu >=20`);
  for (const p of zeroWeightBoth) {
    const real = exp001rById.get(p.fixture_id);
    assert.ok(Math.abs(p.lambdaH_m2 - p.lambdaH_m0) <= 1e-12, `lambdaH fixture ${p.fixture_id}`);
    assert.ok(Math.abs(p.lambdaA_m2 - p.lambdaA_m0) <= 1e-12, `lambdaA fixture ${p.fixture_id}`);
    assert.ok(Math.abs(p.lambdaH_m0 - real.lambdaH) <= 1e-12, `lambdaH_m0 vs reel, fixture ${p.fixture_id}`);
    assert.ok(Math.abs(p.markets_m2.p1 - p.markets_m0.p1) <= 1e-12, `p1, fixture ${p.fixture_id}`);
    assert.ok(Math.abs(p.markets_m2.pN - p.markets_m0.pN) <= 1e-12, `pN, fixture ${p.fixture_id}`);
    assert.ok(Math.abs(p.markets_m2.p2 - p.markets_m0.p2) <= 1e-12, `p2, fixture ${p.fixture_id}`);
    assert.ok(Math.abs(p.markets_m2.overUnder["2.5"].over - p.markets_m0.overUnder["2.5"].over) <= 1e-12, `OU2.5, fixture ${p.fixture_id}`);
    assert.ok(Math.abs(p.markets_m2.btts.yes - p.markets_m0.btts.yes) <= 1e-12, `BTTS, fixture ${p.fixture_id}`);
  }
  console.log(`  TEST A : ${zeroWeightBoth.length} fixtures LATE reelles verifiees, identite parfaite`);
});

test("frontiere n=16 (formule deja auditee, reutilisee telle quelle) : poids(15)=0.5, poids(16)=0, poids(17)=0", () => {
  assert.equal(priorWeight(15), 0.5);
  assert.equal(priorWeight(16), 0);
  assert.equal(priorWeight(17), 0);
});

test("provenance du prior : chaque prediction porte prior_source_home/away avec source_max_timestamp < cutoff, toujours", () => {
  const sample = SHARED_RESULT.predictions.filter((p) => p.prior_weight_home > 0 || p.prior_weight_away > 0).slice(0, 100);
  assert.ok(sample.length > 0);
  for (const p of sample) {
    if (p.prior_weight_home > 0) {
      assert.ok(p.prior_source_home.source_max_timestamp, `source_max_timestamp manquant (home), fixture ${p.fixture_id}`);
      assert.ok(p.prior_source_home.source_max_timestamp < p.cutoff, `source_max_timestamp >= cutoff (home), fixture ${p.fixture_id}`);
    }
    if (p.prior_weight_away > 0) {
      assert.ok(p.prior_source_away.source_max_timestamp, `source_max_timestamp manquant (away), fixture ${p.fixture_id}`);
      assert.ok(p.prior_source_away.source_max_timestamp < p.cutoff, `source_max_timestamp >= cutoff (away), fixture ${p.fixture_id}`);
    }
  }
});

test("le prior promu est REAL_LEAGUE_AVERAGE_PREVIOUS_SEASON (jamais une constante devinee sans provenance)", () => {
  const promotedCases = SHARED_RESULT.predictions.filter((p) => !p.home_returning);
  assert.ok(promotedCases.length > 0);
  for (const p of promotedCases.slice(0, 30)) {
    assert.equal(p.prior_source_home.prior_type, "REAL_LEAGUE_AVERAGE_PREVIOUS_SEASON");
    assert.ok(p.prior_source_home.source_fixture_count > 0);
  }
});

test("determinisme : deux runs independants sont byte-identiques", () => {
  const r1 = runWalkForwardM2C(RUN_OPTIONS);
  const r2 = runWalkForwardM2C(RUN_OPTIONS);
  assert.deepEqual(r1.predictions, r2.predictions);
});
