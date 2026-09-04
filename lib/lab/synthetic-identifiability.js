"use strict";
// GATE C8 (SPEC LAB PRO v1.0) - test d'identifiabilite du fitter
// scripts/fit_rho.py : genere un championnat synthetique (20 equipes,
// plusieurs saisons, lambdas variables et realistes issus de forces
// d'attaque/defense par equipe) avec un rho_true CONNU, echantillonne les
// scores en tirant DIRECTEMENT dans la matrice Dixon-Coles(lambdaH,
// lambdaA,rho_true) - la meme matrice que celle que le fitter est cense
// retrouver (lib/lab/dc-matrix-with-rho.js) - puis appelle le VRAI
// scripts/fit_rho.py (pas une reimplementation) pour verifier qu'il
// recupere approximativement rho_true.
//
// Regle explicite du protocole : si le fitter ne peut pas retrouver le
// parametre sur des donnees generees par son propre modele, EXP-001 reel
// (donnees API-Sports) est interdit, quelle que soit la qualite du reste
// du pipeline.

const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { buildAdaptiveMatrix } = require("./dc-matrix-with-rho.js");
const { deriveRhoBounds } = require("./rho-bounds.js");
const { negLogLikelihood } = require("./dc-log-probability.js");

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Force d'attaque/defense par equipe - multiplicateurs variables et
// realistes (bornes [0.65,1.45]), seed deterministe.
function generateTeamStrengths(nTeams, rng) {
  const teams = [];
  for (let i = 0; i < nTeams; i++) {
    teams.push({ team_id: 1000 + i, attack: 0.65 + rng() * 0.80, defense: 0.65 + rng() * 0.80 });
  }
  return teams;
}

// Echantillonne un score (h,a) par inversion de la fonction de repartition
// cumulee de la matrice fournie - seule facon correcte de generer des
// donnees "issues du modele" : on tire directement dans la matrice que le
// fitter doit retrouver, sans reimplementer une formule a part.
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

// Round-robin complet (aller-retour) entre nTeams equipes sur nSeasons
// saisons : nTeams*(nTeams-1) matchs/saison (20 equipes -> 380/saison,
// echelle realiste d'un championnat).
function generateSyntheticDataset({ nTeams = 20, nSeasons = 3, rhoTrue, seed = 42, homeAdvantage = 1.35, leagueBaseA = 1.05 }) {
  if (typeof rhoTrue !== "number") throw new Error("generateSyntheticDataset: rhoTrue est obligatoire");
  const rng = mulberry32(seed);
  const teams = generateTeamStrengths(nTeams, rng);
  const pairs = [];
  for (let s = 0; s < nSeasons; s++) {
    for (let i = 0; i < nTeams; i++) {
      for (let j = 0; j < nTeams; j++) {
        if (i === j) continue;
        const home = teams[i], away = teams[j];
        const lambdaH = homeAdvantage * home.attack * away.defense;
        const lambdaA = leagueBaseA * away.attack * home.defense;
        const adaptive = buildAdaptiveMatrix(lambdaH, lambdaA, rhoTrue);
        const { h, a } = sampleScoreFromMatrix(adaptive.matrix, rng());
        pairs.push({ lambdaH, lambdaA, h, a, lambda_home: lambdaH, lambda_away: lambdaA, goals_home_90: h, goals_away_90: a });
      }
    }
  }
  return { teams, pairs };
}

const FIT_SCRIPT = path.join(__dirname, "..", "..", "scripts", "fit_rho.py");

// Appelle le VRAI scripts/fit_rho.py (SciPy) - jamais une reimplementation
// Node du fitter, pour que ce test verifie l'identifiabilite du fitter
// reellement utilise par EXP-001.
function fitRhoViaPython(pairs, bounds) {
  const input = JSON.stringify({
    matches: pairs,
    lower_bound: bounds.lower,
    upper_bound: bounds.upper,
    initial_guess: (bounds.lower + bounds.upper) / 2,
  });
  const result = spawnSync("python3", [FIT_SCRIPT], { input, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`fit_rho.py a echoue (status=${result.status}): ${result.stderr}`);
  }
  return JSON.parse(result.stdout);
}

function runIdentifiabilityCheck({ rhoTrue, nTeams = 20, nSeasons = 3, seed = 42 }) {
  const { pairs } = generateSyntheticDataset({ nTeams, nSeasons, rhoTrue, seed });
  const bounds = deriveRhoBounds(pairs);
  if (!bounds.valid) throw new Error(`deriveRhoBounds a echoue sur le jeu synthetique: ${bounds.reason}`);
  const fit = fitRhoViaPython(pairs, bounds);
  // NLL comparees SUR LE MEME ECHANTILLON (reference Node, lib/lab/dc-log-probability.js -
  // pas le fitter Python) : detecte une fonction objectif ou une
  // parametrisation incoherente entre le fitter et l'evaluation, meme si
  // rho_hat "ressemble" a rho_true. Par construction d'un minimiseur
  // correct, NLL(rho_hat) <= NLL(rho) pour TOUT rho dans les bornes,
  // rho_true et 0 inclus - une violation signale un bug reel.
  const nllAtRhoHat = negLogLikelihood(pairs, fit.rho_hat);
  const nllAtZero = negLogLikelihood(pairs, 0);
  const nllAtRhoTrue = negLogLikelihood(pairs, rhoTrue);
  return {
    rho_true: rhoTrue,
    rho_hat: fit.rho_hat,
    abs_error: Math.abs(fit.rho_hat - rhoTrue),
    n_matches: pairs.length,
    nll_at_rho_hat: nllAtRhoHat,
    nll_at_zero: nllAtZero,
    nll_at_rho_true: nllAtRhoTrue,
    bounds,
    fit,
  };
}

module.exports = { generateTeamStrengths, generateSyntheticDataset, sampleScoreFromMatrix, runIdentifiabilityCheck, mulberry32 };
