"use strict";
// EXP-005 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - contrats runtime du
// walk-forward M5 : identite des moyennes (item 13, ETENDUE aux rows de
// training utilisees pour fitter kappa), determinisme, anti-leakage,
// support complet 760/760. Utilise un fitter FIXE injecte (pas le vrai
// fitter Python) pour isoler la plomberie du runner - le fitter reel est
// verifie separement (fidelite Node/Python, identifiabilite synthetique).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { runWalkForwardM5 } = require("../lib/lab/walkforward-m5-runner.js");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");

const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }
const f2021 = loadSeason(2021), f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);

const BASE_OPTIONS = {
  allFixtures: [...f2021, ...f2022, ...f2023, ...f2024],
  oosSeasons: [2023, 2024],
  trainOnlySeasons: [2022],
  leagueId: 39, leagueAvgH: 1.35, leagueAvgA: 1.10,
  previousSeasonFixturesBySeasons: new Map([[2022, f2021], [2023, f2022], [2024, f2023]]),
};

async function fixedKappaFitter(rows) {
  return { kappa_hat: 8, convergence: true, log_kappa_hat: Math.log(8), training_N: rows.length, numerical_boundary_status: "OK" };
}

test("support complet : COMMON_SUPPORT M5 = 760/760 (identique a M2), 0 matrixFailures", async () => {
  const result = await runWalkForwardM5({ ...BASE_OPTIONS, candidateKappaFitter: fixedKappaFitter });
  assert.equal(result.predictions.length, 760);
  assert.equal(result.matrixFailures.length, 0);
});

test("M5_BASE_MEANS == M2_MEANS (runtime, item 13) : muHome/muAway sont BYTE-IDENTIQUES a lambdaH_m2/lambdaA_m2 du champion ferme, sur les 760 OOS ET sur les 380 rows TRAIN 2022-23 utilisees pour fitter kappa", async () => {
  const result = await runWalkForwardM5({ ...BASE_OPTIONS, candidateKappaFitter: fixedKappaFitter });
  const closedReport = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts", "experiments", "exp002c_report.json"), "utf8"));
  const closedById = new Map(closedReport.predictions.map((p) => [p.fixture_id, p]));

  let checkedOos = 0;
  for (const p of result.predictions) {
    const real = closedById.get(p.fixture_id);
    assert.ok(real, `fixture ${p.fixture_id} absente du rapport EXP-002C ferme`);
    assert.equal(p.muHome, real.lambdaH_m2, `muHome fixture ${p.fixture_id}`);
    assert.equal(p.muAway, real.lambdaA_m2, `muAway fixture ${p.fixture_id}`);
    checkedOos++;
  }
  assert.equal(checkedOos, 760, "les 760 fixtures OOS doivent toutes etre verifiees");

  // ETEND le gate aux 380 rows TRAIN 2022-23 (item 13 : "L'etendre
  // egalement aux rows de training utilisees pour fitter kappa").
  const m2Only2022 = runWalkForwardM2C({
    allFixtures: BASE_OPTIONS.allFixtures, oosSeasons: [2022], leagueId: 39, leagueAvgH: 1.35, leagueAvgA: 1.10,
    previousSeasonFixturesBySeasons: new Map([[2022, f2021]]),
  });
  assert.equal(m2Only2022.predictions.length, 380);
  const m2Only2022ById = new Map(m2Only2022.predictions.map((p) => [p.fixture_id, p]));
  const trainRows2022 = result.m2Rows.filter((r) => r.season === 2022);
  assert.equal(trainRows2022.length, 380, "les 380 matchs 2022-23 doivent tous fournir un mu M2 (grace au warm-up 2021-22)");
  for (const r of trainRows2022) {
    const indep = m2Only2022ById.get(r.fixture_id);
    assert.equal(r.muHome, indep.lambdaH_m2, `muHome TRAIN fixture ${r.fixture_id} incoherent avec un recalcul independant`);
    assert.equal(r.muAway, indep.lambdaA_m2, `muAway TRAIN fixture ${r.fixture_id} incoherent avec un recalcul independant`);
  }
});

test("rho reste FIXE (-0.0845) - jamais un parametre appris (item 2)", async () => {
  const { CHAMPION_RHO } = require("../lib/lab/shared-gamma-dc.js");
  assert.equal(CHAMPION_RHO, -0.0845);
  const source = fs.readFileSync(path.join(__dirname, "..", "lib", "lab", "walkforward-m5-runner.js"), "utf8");
  assert.doesNotMatch(source, /fit.*rho|rho.*fit/i, "aucune trace de fitting de rho dans le runner M5");
});

test("determinisme : deux runs independants avec le meme fitter sont BYTE-IDENTIQUES", async () => {
  const r1 = await runWalkForwardM5({ ...BASE_OPTIONS, candidateKappaFitter: fixedKappaFitter });
  const r2 = await runWalkForwardM5({ ...BASE_OPTIONS, candidateKappaFitter: fixedKappaFitter });
  assert.deepEqual(r1.predictions, r2.predictions);
  assert.deepEqual(r1.fitLog.map(({ elapsed_ms, ...rest }) => rest), r2.fitLog.map(({ elapsed_ms, ...rest }) => rest));
});

test("anti-leakage : muter le score d'un match OOS FUTUR ne change AUCUNE prediction/fitLog anterieure", async () => {
  const resultBefore = await runWalkForwardM5({ ...BASE_OPTIONS, candidateKappaFitter: fixedKappaFitter });

  const oos2024 = f2024.slice().sort((a, b) => new Date(b.kickoff_timestamp) - new Date(a.kickoff_timestamp));
  const lastFixtureId = oos2024[0].fixture_id;
  const mutatedF2024 = f2024.map((f) => (f.fixture_id === lastFixtureId ? { ...f, goals_home_90: 19, goals_away_90: 0, goals_home_final: 19, goals_away_final: 0 } : f));

  const resultAfter = await runWalkForwardM5({
    ...BASE_OPTIONS,
    allFixtures: [...f2021, ...f2022, ...f2023, ...mutatedF2024],
    candidateKappaFitter: fixedKappaFitter,
  });

  assert.equal(resultAfter.predictions.length, resultBefore.predictions.length);
  for (let i = 0; i < resultBefore.predictions.length; i++) {
    const before = resultBefore.predictions[i];
    if (before.fixture_id === lastFixtureId) continue;
    const after = resultAfter.predictions.find((p) => p.fixture_id === before.fixture_id);
    assert.deepEqual(after, before, `fixture_id=${before.fixture_id} a change apres mutation d'un match FUTUR - FUITE DE DONNEES DETECTEE`);
  }
  const fitLogBeforeExceptLast = resultBefore.fitLog.filter((f) => f.cutoff !== resultBefore.fitLog[resultBefore.fitLog.length - 1].cutoff).map(({ elapsed_ms, ...rest }) => rest);
  const fitLogAfterMatching = resultAfter.fitLog.filter((f) => fitLogBeforeExceptLast.some((b) => b.cutoff === f.cutoff)).map(({ elapsed_ms, ...rest }) => rest);
  assert.deepEqual(fitLogAfterMatching, fitLogBeforeExceptLast, "le training N et le fit a chaque cutoff anterieur ne doivent jamais changer suite a la mutation d'un match futur");
});
