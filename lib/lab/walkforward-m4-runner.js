"use strict";
// EXP-004 (SPEC LAB PRO v1.0, M4 NB2) - walk-forward candidat = M2
// (champion, INCHANGE) + famille NB2 independante partageant un seul
// kappa. AUCUNE fonction Dixon-Coles n'est appelee ici (verifie par
// tests/lab-m4-no-dixon-coles.test.js - ce module n'importe ni
// lib/models.js#dixonColesCorr ni lib/lab/dc-matrix-with-rho.js ni
// lib/lab/dc-log-probability.js). Les moyennes NE CHANGENT JAMAIS :
// muHome=lambdaH_m2, muAway=lambdaA_m2, litteralement les memes valeurs
// que le champion M2 ferme (EXP-002C) - reutilise runWalkForwardM2C
// directement (jamais une reconstruction "equivalente" du lambda M2).
//
// mu M2 precalcules UNE SEULE FOIS pour les 3 saisons TRAIN+OOS
// (2022-23 comme exemples de train grace au warm-up 2021-22, 2023-24 et
// 2024-25 comme OOS) via runWalkForwardM2C(oosSeasons=[2022,2023,2024]) -
// le mu M2 d'un match ne depend QUE de sa propre saison/etat point-in-time,
// jamais du cutoff walk-forward M4 en cours (meme principe que
// lib/lab/walkforward-runner.js pour les lambdas DC dans EXP-001).

const { runWalkForwardM2C } = require("./walkforward-m2c-runner.js");
const { buildCutoffs } = require("./walkforward-runner.js");
const { buildNb2Matrix } = require("./nb2-matrix.js");
const { pmfNB2, cdfNB2 } = require("./nb2.js");

function marketsFromNb2Matrix(matrix, maxGoal) {
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
      if (total > 4.5) over45 += p; else under45 += p; // over4.5 == "5+ buts" (total entier)
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

// options = { allFixtures, oosSeasons:[2023,2024], leagueId, leagueAvgH,
//   leagueAvgA, previousSeasonFixturesBySeasons (pour M2, doit couvrir
//   2022,2023,2024), candidateKappaFitter (async ou sync - toujours
//   attendu via await ; le lancement reel branche lib/lab/nb2-python-worker.js#Nb2KappaWorker#asFitter(),
//   un fitter synchrone injecte par les tests fonctionne aussi tel quel) }
async function runWalkForwardM4(options) {
  const { allFixtures, leagueId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons, candidateKappaFitter } = options;
  const oosSeasons = options.oosSeasons || [2023, 2024]; // OOS reel M4 (matchs predits/rapportes)
  const trainOnlySeasons = options.trainOnlySeasons || [2022]; // saisons UNIQUEMENT utilisees comme exemples d'entrainement pour kappa, jamais rapportees comme predictions M4

  // --- mu M2 precalcules pour TOUTES les saisons concernees (train-only + OOS), UNE SEULE FOIS ---
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
  // trie chronologique explicite - le filtrage "< cutoff" plus bas en depend.
  m2Rows.sort((r1, r2) => new Date(r1.kickoff).getTime() - new Date(r2.kickoff).getTime());

  const oosFixtures = allFixtures.filter((f) => oosSeasons.includes(f.season));
  const cutoffs = buildCutoffs(oosFixtures);

  const m2RowsByFixtureId = new Map(m2Rows.map((r) => [r.fixture_id, r]));
  const predictions = [];
  const fitLog = [];
  const matrixFailures = [];

  const fitter = candidateKappaFitter; // OBLIGATOIRE au lancement reel (jamais de fallback silencieux) - voir scripts/run_exp004.js

  for (const { cutoff, batch } of cutoffs) {
    const cutoffMs = new Date(cutoff).getTime();
    const trainRows = m2Rows.filter((r) => new Date(r.kickoff).getTime() < cutoffMs && r.h != null && r.a != null);

    const fitResult = await fitter(trainRows);
    fitLog.push({ cutoff, n_train: trainRows.length, ...fitResult });

    for (const f of batch) {
      if (f.goals_home_90 == null || f.goals_away_90 == null) continue;
      const row = m2RowsByFixtureId.get(f.fixture_id);
      if (!row) continue; // ne devrait jamais arriver (m2AllSeasons couvre oosSeasons) - absence rapportee explicitement par le runner appelant si jamais observee

      const kappa = fitResult.kappa_hat;
      let matrixResult = null;
      let matrixError = null;
      if (typeof kappa === "number" && kappa > 0) {
        try {
          matrixResult = buildNb2Matrix(row.muHome, row.muAway, kappa);
        } catch (e) {
          matrixError = e.code || e.message;
          matrixFailures.push({ fixture_id: f.fixture_id, cutoff, error: matrixError });
        }
      }

      const markets_m4 = matrixResult ? marketsFromNb2Matrix(matrixResult.matrix, matrixResult.maxGoal) : null;

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
        matrix_tail_mass: matrixResult ? matrixResult.tailMass : null,
        matrix_hash: matrixResult ? matrixResult.matrixHash : null,
        matrix_error: matrixError,
        markets_m2: row.markets_m2,
        markets_m4,
      });
    }
  }

  return { predictions, fitLog, cutoffs: cutoffs.map((c) => c.cutoff), matrixFailures, m2Rows };
}

module.exports = { runWalkForwardM4, marketsFromNb2Matrix };
