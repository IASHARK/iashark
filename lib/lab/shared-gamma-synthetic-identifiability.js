"use strict";
// EXP-005 item 12 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - test
// d'identifiabilite du fitter scripts/fit_m5_kappa_worker.py : genere un
// championnat synthetique avec un kappa_true CONNU, echantillonne les
// scores en tirant DIRECTEMENT dans la matrice M5 (shared-gamma+DC,
// lib/lab/shared-gamma-matrix.js#buildSharedGammaMatrix - la meme
// matrice que celle que le fitter est cense retrouver), puis appelle le
// VRAI fitter (lib/lab/shared-gamma-python-worker.js, jamais une
// reimplementation) pour verifier qu'il recupere approximativement
// kappa_true. rho reste FIXE (-0.0845) - jamais un parametre genere ni fitte.

const { buildSharedGammaMatrix } = require("./shared-gamma-matrix.js");
const { negLogLikelihood, CHAMPION_RHO } = require("./shared-gamma-dc.js");
const { SharedGammaKappaWorker } = require("./shared-gamma-python-worker.js");

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateTeamStrengths(nTeams, rng) {
  const teams = [];
  for (let i = 0; i < nTeams; i++) teams.push({ team_id: 3000 + i, attack: 0.65 + rng() * 0.80, defense: 0.65 + rng() * 0.80 });
  return teams;
}

function sampleScoreFromMatrix(matrix, u) {
  let cum = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      cum += matrix[h][a];
      if (u <= cum) return { h, a };
    }
  }
  const lastRow = matrix.length - 1;
  return { h: lastRow, a: matrix[lastRow].length - 1 };
}

function generateSyntheticDatasetM5({ nTeams = 20, nSeasons = 3, kappaTrue, seed = 42, homeAdvantage = 1.35, leagueBaseA = 1.05 }) {
  if (typeof kappaTrue !== "number" || !(kappaTrue > 0)) throw new Error("generateSyntheticDatasetM5: kappaTrue est obligatoire et doit etre >0");
  const rng = mulberry32(seed);
  const teams = generateTeamStrengths(nTeams, rng);
  const rows = [];
  for (let s = 0; s < nSeasons; s++) {
    for (let i = 0; i < nTeams; i++) {
      for (let j = 0; j < nTeams; j++) {
        if (i === j) continue;
        const home = teams[i], away = teams[j];
        const muHome = homeAdvantage * home.attack * away.defense;
        const muAway = leagueBaseA * away.attack * home.defense;
        const { matrix } = buildSharedGammaMatrix(muHome, muAway, kappaTrue, CHAMPION_RHO);
        const { h, a } = sampleScoreFromMatrix(matrix, rng());
        rows.push({ muHome, muAway, h, a });
      }
    }
  }
  return { teams, rows };
}

async function runIdentifiabilityCheckM5({ kappaTrue, nTeams = 20, nSeasons = 3, seed = 42, worker }) {
  const { rows } = generateSyntheticDatasetM5({ nTeams, nSeasons, kappaTrue, seed });
  const ownWorker = !worker;
  const w = worker || new SharedGammaKappaWorker({ timeoutMs: 20000 });
  const fit = await w.fit(rows);
  if (ownWorker) await w.shutdown();

  if (!fit.convergence || typeof fit.kappa_hat !== "number") {
    throw new Error(`fit_m5_kappa_worker.py n'a pas converge sur le jeu synthetique (kappa_true=${kappaTrue}): ${JSON.stringify(fit)}`);
  }

  const nllAtKappaHat = negLogLikelihood(rows, fit.kappa_hat, CHAMPION_RHO);
  const nllAtKappaTrue = negLogLikelihood(rows, kappaTrue, CHAMPION_RHO);
  const nllAtM2Limit = negLogLikelihood(rows, 1e6, CHAMPION_RHO);

  return {
    kappa_true: kappaTrue,
    kappa_hat: fit.kappa_hat,
    log_kappa_hat: fit.log_kappa_hat,
    abs_error: Math.abs(fit.kappa_hat - kappaTrue),
    log_error: Math.abs(Math.log(fit.kappa_hat) - Math.log(kappaTrue)),
    n_matches: rows.length,
    nll_at_kappa_hat: nllAtKappaHat,
    nll_at_kappa_true: nllAtKappaTrue,
    nll_at_m2_limit: nllAtM2Limit,
    fit,
  };
}

module.exports = { generateTeamStrengths, generateSyntheticDatasetM5, sampleScoreFromMatrix, runIdentifiabilityCheckM5, mulberry32 };
