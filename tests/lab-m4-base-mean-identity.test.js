"use strict";
// M4 DATA/BASELINE GATE (audit 2026-09-05) - contrat obligatoire AVANT
// tout manifest EXP-004 ou calcul de performance : M4_BASE_MEANS ==
// M2_MEANS. M4 (quel que soit son contrat mathematique final, fige
// separement par l'utilisateur) ne doit JAMAIS re-estimer la force des
// equipes - il doit reutiliser EXACTEMENT les lambdas du champion M2 deja
// ferme (EXP-002C, code_sha=b8cb9ff3f3a8d03d529b8ebbdb7c4147faf2438f) et
// tester uniquement la distribution des buts autour de ces memes moyennes.
//
// Ce test recalcule M2 EXACTEMENT comme l'a fait le run EXP-002C ferme
// (memes options : allFixtures 2022+2023+2024, SANS le warm-up 2021-22 -
// deja prouve sans effet par tests/lab-m2c-warmup-invariance.test.js,
// mais le champion FERME reste defini par sa configuration exacte
// d'origine, jamais une reconstruction "equivalente") et verifie que les
// 760 lambdas (COMMON_SUPPORT + M2_COVERAGE_GAIN) sont BYTE-IDENTIQUES a
// celles persistees dans scripts/experiments/exp002c_report.json (deja
// clos, decision=PROMOTE, jamais rouvert).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");

const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }

test("M4_BASE_MEANS == M2_MEANS : les 760 lambdas M2 (COMMON_SUPPORT+COVERAGE_GAIN) recalculees sont BYTE-IDENTIQUES au rapport EXP-002C deja ferme (PROMOTE)", () => {
  const f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);
  const result = runWalkForwardM2C({
    allFixtures: [...f2022, ...f2023, ...f2024],
    oosSeasons: [2023, 2024],
    leagueId: 39, leagueAvgH: 1.35, leagueAvgA: 1.10,
    previousSeasonFixturesBySeasons: new Map([[2023, f2022], [2024, f2023]]),
  });

  const closedReport = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts", "experiments", "exp002c_report.json"), "utf8"));
  assert.equal(closedReport.promotion.status, "PROMOTE", "le rapport de reference doit etre le champion FERME (PROMOTE), pas un brouillon");

  const byId = new Map(closedReport.predictions.map((p) => [p.fixture_id, p]));
  assert.equal(result.predictions.length, 760);
  assert.equal(closedReport.predictions.length, 760);

  let checked = 0;
  for (const p of result.predictions) {
    const real = byId.get(p.fixture_id);
    assert.ok(real, `fixture ${p.fixture_id} absente du rapport EXP-002C ferme`);
    assert.equal(p.lambdaH_m2, real.lambdaH_m2, `lambdaH_m2 fixture ${p.fixture_id} (M4 ne doit jamais re-estimer la force des equipes)`);
    assert.equal(p.lambdaA_m2, real.lambdaA_m2, `lambdaA_m2 fixture ${p.fixture_id}`);
    assert.equal(p.m0_valid, real.m0_valid, `m0_valid fixture ${p.fixture_id}`);
    checked++;
  }
  assert.equal(checked, 760, "les 760 fixtures OOS (699 COMMON_SUPPORT + 61 M2_COVERAGE_GAIN) doivent toutes etre verifiees");
});

test("OOS 2023-24 + 2024-25 = 760 matchs M2 exactement (699 COMMON_SUPPORT + 61 M2_COVERAGE_GAIN)", () => {
  const closedReport = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts", "experiments", "exp002c_report.json"), "utf8"));
  const commonSupport = closedReport.predictions.filter((p) => p.m0_valid);
  const coverageGain = closedReport.predictions.filter((p) => !p.m0_valid);
  assert.equal(commonSupport.length, 699);
  assert.equal(coverageGain.length, 61);
  assert.equal(commonSupport.length + coverageGain.length, 760);
});

test("lockbox 2025-2026 reste SEALED_UNREAD - aucune fixture 2025 n'apparait dans les 760 predictions M2 utilisees comme base M4", () => {
  const closedReport = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts", "experiments", "exp002c_report.json"), "utf8"));
  const seasons = new Set(closedReport.predictions.map((p) => p.season));
  assert.deepEqual(Array.from(seasons).sort(), [2023, 2024]);
  assert.equal(closedReport.lockbox_hash_2025_2026, "f611ad31213505fd69edfc8941e79ec7d182dc83b426df3a8fb04d67ec4fa01a", "hash de la lockbox scellee, jamais recalcule depuis les vraies donnees 2025-26");
});

test("TRAIN 2022-23 reconstructible ENTIEREMENT avec M2 grace au warm-up 2021-22 (0 exception, 0 NaN sur les 380 matchs 2022-23)", () => {
  const f2021 = loadSeason(2021), f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);
  const result = runWalkForwardM2C({
    allFixtures: [...f2021, ...f2022, ...f2023, ...f2024],
    oosSeasons: [2022], // reconstruit 2022-23 comme s'il etait "OOS" pour prouver que M2 y est entierement calculable
    leagueId: 39, leagueAvgH: 1.35, leagueAvgA: 1.10,
    previousSeasonFixturesBySeasons: new Map([[2022, f2021]]),
  });
  assert.equal(result.predictions.length, 380, "les 380 matchs 2022-23 doivent tous produire une prediction M2 (aucune exclusion pour cause de prior manquant)");
  for (const p of result.predictions) {
    assert.ok(Number.isFinite(p.lambdaH_m2), `lambdaH_m2 non-fini pour fixture ${p.fixture_id}`);
    assert.ok(Number.isFinite(p.lambdaA_m2), `lambdaA_m2 non-fini pour fixture ${p.fixture_id}`);
  }
});
