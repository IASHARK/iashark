"use strict";
// EXP-005 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - walk-forward candidat
// = M2 (champion, INCHANGE) + facteur latent gamma partage AU-DESSUS de
// la MEME correction Dixon-Coles (rho=-0.0845 FIXE, jamais reestime).
// Les moyennes NE CHANGENT JAMAIS : muHome=lambdaH_m2, muAway=lambdaA_m2,
// litteralement les memes valeurs que le champion M2 ferme (EXP-002C) -
// reutilise runWalkForwardM2C directement (jamais une reconstruction
// "equivalente" du lambda M2). AUCUN import de code M4 (verifie par
// tests/lab-m5-no-m4.test.js).
//
// mu M2 precalcules UNE SEULE FOIS pour les 3 saisons TRAIN+OOS (memes
// principe que lib/lab/walkforward-m4-runner.js, factorisation legitime
// de la PLOMBERIE walk-forward, pas de l'hypothese statistique M4).

const { runWalkForwardM2C } = require("./walkforward-m2c-runner.js");
const { buildCutoffs } = require("./walkforward-runner.js");
const { buildSharedGammaMatrix } = require("./shared-gamma-matrix.js");
const { CHAMPION_RHO } = require("./shared-gamma-dc.js");

function marketsFromMatrix(matrix, maxGoal) {
  let p1 = 0, pN = 0, p2 = 0;
  let over25 = 0, over35 = 0, over45 = 0, under25 = 0, under35 = 0, under45 = 0;
  let btts = 0;
  for (let h = 0; h <= maxGoal; h++) {
    for (let a = 0; a <= maxGoal; a++) {
      const p = matrix[h][a];
      if (h > a) p1 += p; else if (h === a) pN += p; else p2 += p;
      const total = h + a;
      if (total > 2.5) over25 += p; else under25 += p;
      if (total > 3.5) over35 += p; else under35 += p;
      if (total > 4.5) over45 += p; else under45 += p;
      if (h > 0 && a > 0) btts += p;
    }
  }
  return {
    p1, pN, p2,
    overUnder: {
      "2.5": { over: over25, under: under25 },
      "3.5": { over: over35, under: under35 },
      "4.5": { over: over45, under: under45 },
    },
    btts: { yes: btts, no: 1 - btts },
  };
}

// options = { allFixtures, oosSeasons:[2023,2024], trainOnlySeasons:[2022],
//   leagueId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons
//   (pour M2, doit couvrir 2022,2023,2024), candidateKappaFitter (async
//   ou sync - toujours attendu via await ; le lancement reel branche
//   lib/lab/shared-gamma-python-worker.js#SharedGammaKappaWorker#asFitter()) }
async function runWalkForwardM5(options) {
  const { allFixtures, leagueId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons } = options;
  const oosSeasons = options.oosSeasons || [2023, 2024];
  const trainOnlySeasons = options.trainOnlySeasons || [2022];
  const rho = options.rho !== undefined ? options.rho : CHAMPION_RHO; // FIXE - jamais reestime (item 2)

  const m2AllSeasons = Array.from(new Set([...trainOnlySeasons, ...oosSeasons])).sort();
  const m2Result = runWalkForwardM2C({
    allFixtures, oosSeasons: m2AllSeasons, leagueId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons,
  });

  const kickoffById = new Map(allFixtures.map((f) => [f.fixture_id, f.kickoff_timestamp]));
  const m2Rows = m2Result.predictions.map((p) => ({
    fixture_id: p.fixture_id,
    season: p.season,
    kickoff: kickoffById.get(p.fixture_id),
    muHome: p.lambdaH_m2,
    muAway: p.lambdaA_m2,
    h: p.goals_home_90,
    a: p.goals_away_90,
    markets_m2: p.markets_m2,
    m0_valid: p.m0_valid,
    n_home: p.n_home,
    n_away: p.n_away,
    n_min: p.n_min,
    bucket: p.bucket,
  }));
  m2Rows.sort((r1, r2) => new Date(r1.kickoff).getTime() - new Date(r2.kickoff).getTime());

  const oosFixtures = allFixtures.filter((f) => oosSeasons.includes(f.season));
  const cutoffs = buildCutoffs(oosFixtures);

  const m2RowsByFixtureId = new Map(m2Rows.map((r) => [r.fixture_id, r]));
  const predictions = [];
  const fitLog = [];
  const matrixFailures = [];

  const fitter = options.candidateKappaFitter; // OBLIGATOIRE au lancement reel (jamais de fallback silencieux)

  for (const { cutoff, batch } of cutoffs) {
    const cutoffMs = new Date(cutoff).getTime();
    const trainRows = m2Rows.filter((r) => new Date(r.kickoff).getTime() < cutoffMs && r.h != null && r.a != null);

    const fitStart = Date.now();
    const fitResult = await fitter(trainRows);
    const elapsedMs = Date.now() - fitStart;
    fitLog.push({ cutoff, n_train: trainRows.length, elapsed_ms: elapsedMs, ...fitResult });

    for (const f of batch) {
      if (f.goals_home_90 == null || f.goals_away_90 == null) continue;
      const row = m2RowsByFixtureId.get(f.fixture_id);
      if (!row) continue;

      const kappa = fitResult.kappa_hat;
      let matrixResult = null;
      let matrixError = null;
      if (typeof kappa === "number" && kappa > 0) {
        try {
          matrixResult = buildSharedGammaMatrix(row.muHome, row.muAway, kappa, rho);
        } catch (e) {
          matrixError = e.code || e.message;
          matrixFailures.push({ fixture_id: f.fixture_id, cutoff, error: matrixError });
        }
      }

      const markets_m5 = matrixResult ? marketsFromMatrix(matrixResult.matrix, matrixResult.maxGoal) : null;

      predictions.push({
        fixture_id: f.fixture_id,
        season: f.season,
        cutoff,
        n_home: row.n_home, n_away: row.n_away, n_min: row.n_min, bucket: row.bucket,
        muHome: row.muHome, muAway: row.muAway,
        goals_home_90: row.h, goals_away_90: row.a,
        kappa_hat: kappa,
        kappa_fit_convergence: !!fitResult.convergence,
        kappa_fit_n_train: trainRows.length,
        matrix_max_goal: matrixResult ? matrixResult.maxGoal : null,
        matrix_guaranteed_tail_upper_bound: matrixResult ? matrixResult.guaranteedTailUpperBound : null,
        matrix_zdc: matrixResult ? matrixResult.zdc : null,
        // CORRECTIF mean-preservation : thetaHome/thetaAway = intensites INTERNES resolues (JAMAIS des parametres appris) telles que E_M5[H]=muHome, E_M5[A]=muAway exactement (residuals persistes pour audit, item 13).
        theta_home: matrixResult ? matrixResult.thetaHome : null,
        theta_away: matrixResult ? matrixResult.thetaAway : null,
        theta_solver_iterations: matrixResult ? matrixResult.thetaSolverIterations : null,
        theta_residual_h: matrixResult ? matrixResult.thetaResidualH : null,
        theta_residual_a: matrixResult ? matrixResult.thetaResidualA : null,
        matrix_error: matrixError,
        markets_m2: row.markets_m2,
        markets_m5,
      });
    }
  }

  return { predictions, fitLog, cutoffs: cutoffs.map((c) => c.cutoff), matrixFailures, m2Rows };
}

module.exports = { runWalkForwardM5, marketsFromMatrix };
