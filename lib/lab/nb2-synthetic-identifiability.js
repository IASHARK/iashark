"use strict";
// EXP-004 item 10 (SPEC LAB PRO v1.0, M4 NB2) - test d'identifiabilite du
// fitter scripts/fit_kappa.py : genere un championnat synthetique (20
// equipes, plusieurs saisons, mu M2-like issus de forces d'attaque/
// defense par equipe) avec un kappa_true CONNU, echantillonne les scores
// en tirant DIRECTEMENT dans la matrice NB2(muHome,muAway,kappa_true)
// (lib/lab/nb2-matrix.js - la meme matrice que celle que le fitter est
// cense retrouver), puis appelle le VRAI scripts/fit_kappa.py (via
// lib/lab/nb2-python-fitter.js, pas une reimplementation) pour verifier
// qu'il recupere approximativement kappa_true.
//
// Regle explicite du protocole (identique a EXP-001/GATE C8) : si le
// fitter ne peut pas retrouver le parametre sur des donnees generees par
// son propre modele, EXP-004 reel (donnees M2 reelles) est interdit.

const { buildNb2Matrix } = require("./nb2-matrix.js");
const { negLogLikelihood } = require("./nb2-log-probability.js");
const { pythonKappaFitter } = require("./nb2-python-fitter.js");

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
// realistes (bornes [0.65,1.45]), meme forme que EXP-001/GATE C8 (ecrit
// independamment ici, pas importe, pour ne pas coupler les deux tests).
function generateTeamStrengths(nTeams, rng) {
  const teams = [];
  for (let i = 0; i < nTeams; i++) {
    teams.push({ team_id: 2000 + i, attack: 0.65 + rng() * 0.80, defense: 0.65 + rng() * 0.80 });
  }
  return teams;
}

// Echantillonne un score (h,a) par inversion de la fonction de repartition
// cumulee de la matrice NB2 fournie.
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

// Round-robin complet (aller-retour) : nTeams*(nTeams-1) matchs/saison.
function generateSyntheticDatasetNB2({ nTeams = 20, nSeasons = 3, kappaTrue, seed = 42, homeAdvantage = 1.35, leagueBaseA = 1.05 }) {
  if (typeof kappaTrue !== "number" || !(kappaTrue > 0)) throw new Error("generateSyntheticDatasetNB2: kappaTrue est obligatoire et doit etre >0");
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
        const { matrix } = buildNb2Matrix(muHome, muAway, kappaTrue);
        const { h, a } = sampleScoreFromMatrix(matrix, rng());
        rows.push({ muHome, muAway, h, a });
      }
    }
  }
  return { teams, rows };
}

function runIdentifiabilityCheckNB2({ kappaTrue, nTeams = 20, nSeasons = 3, seed = 42 }) {
  const { rows } = generateSyntheticDatasetNB2({ nTeams, nSeasons, kappaTrue, seed });
  const fitter = pythonKappaFitter();
  const fit = fitter(rows);
  if (!fit.convergence || typeof fit.kappa_hat !== "number") {
    throw new Error(`fit_kappa.py n'a pas converge sur le jeu synthetique (kappa_true=${kappaTrue}): ${JSON.stringify(fit)}`);
  }

  // NLL comparees SUR LE MEME ECHANTILLON via la reference Node
  // (lib/lab/nb2-log-probability.js), pas le fitter Python - detecte une
  // fonction objectif ou une parametrisation incoherente entre le fitter
  // et l'evaluation. Par construction d'un minimiseur correct,
  // NLL(kappa_hat) <= NLL(kappa) pour TOUT kappa dans les bornes,
  // kappa_true et la limite Poisson (kappa enorme) inclus.
  const nllAtKappaHat = negLogLikelihood(rows, fit.kappa_hat);
  const nllAtKappaTrue = negLogLikelihood(rows, kappaTrue);
  const nllAtPoissonLimit = negLogLikelihood(rows, 1e7);

  return {
    kappa_true: kappaTrue,
    kappa_hat: fit.kappa_hat,
    log_kappa_hat: fit.log_kappa_hat,
    abs_error: Math.abs(fit.kappa_hat - kappaTrue),
    log_error: Math.abs(Math.log(fit.kappa_hat) - Math.log(kappaTrue)),
    n_matches: rows.length,
    nll_at_kappa_hat: nllAtKappaHat,
    nll_at_kappa_true: nllAtKappaTrue,
    nll_at_poisson_limit: nllAtPoissonLimit,
    fit,
  };
}

module.exports = { generateTeamStrengths, generateSyntheticDatasetNB2, sampleScoreFromMatrix, runIdentifiabilityCheckNB2, mulberry32 };
