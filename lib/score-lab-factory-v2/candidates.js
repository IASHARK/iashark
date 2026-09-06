"use strict";
// SCORE_LAB_FACTORY_V2 (2026-09-06). Calcul GENERIQUE des candidats
// B0/M0/M2 sur une fenetre train/oos donnee, pour N'IMPORTE QUELLE
// ligue - generalise scripts/run-score-champion-selection-preoss.js
// (ecrit ad-hoc pour Serie A lors du protocole V1). Reutilise
// lib/lab/walkforward-runner.js et lib/lab/walkforward-m2r-runner.js
// A L'IDENTIQUE (aucune formule reimplementee) - seule la ligue/les
// saisons changent.
//
// M2 : reutilise le meme "prior_equivalents(n)=max(0,8-0.5n)" transfere
// de PL, jamais retune pour aucune ligue - voir lib/lab/bayes-early-season.js
// (inchange).

const { runWalkForward } = require("../lab/walkforward-runner.js");
const { runWalkForwardM2R } = require("../lab/walkforward-m2r-runner.js");
const { exactScoreNLL } = require("../lab/metrics.js");

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function logloss(p, y) { const c = Math.min(Math.max(p, 1e-12), 1 - 1e-12); return y === 1 ? -Math.log(c) : -Math.log(1 - c); }

function secondaryMetricsFromPredictions(predictions) {
  const ou25 = [], btts = [], x12 = [];
  for (const p of predictions) {
    const total = p.h + p.a;
    ou25.push(logloss(p.markets.overUnder["2.5"].over, total > 2.5 ? 1 : 0));
    btts.push(logloss(p.markets.btts.yes, (p.h > 0 && p.a > 0) ? 1 : 0));
    const outcomeProb = p.h > p.a ? p.markets.p1 : p.h === p.a ? p.markets.pN : p.markets.p2;
    x12.push(logloss(outcomeProb, 1));
  }
  return { ou25_logloss: mean(ou25), btts_logloss: mean(btts), x12_logloss: mean(x12) };
}

// Calcule B0 (rho=0) et M0 (rho gele) sur [trainSeasons]->[oosSeasons],
// via runWalkForward reutilise tel quel (championRho/candidateRhoFitter
// sont de simples "roles" generiques du runner, pas des concepts propres
// a B0/M0 - voir commentaire scripts/run-score-oos-final.js d'origine).
function computeB0AndM0({ allFixtures, trainSeasons, oosSeasons, leagueId, leagueAvgH, leagueAvgA, rhoFrozen }) {
  const constantRhoFitter = () => ({ rho_hat: rhoFrozen, convergence: true, on_boundary: false });
  const wf = runWalkForward({ allFixtures, trainSeasons, oosSeasons, championRho: 0, candidateRhoFitter: constantRhoFitter, leagueAvgH, leagueAvgA, leagueId });
  const predictions = wf.predictions;
  const b0Preds = predictions.map((p) => ({ fixture_id: p.fixture_id, cutoff: p.cutoff, h: p.goals_home_90, a: p.goals_away_90, lambdaH: p.lambdaH, lambdaA: p.lambdaA, rho: 0, markets: p.markets_m0 }));
  const m0Preds = predictions.map((p) => ({ fixture_id: p.fixture_id, cutoff: p.cutoff, h: p.goals_home_90, a: p.goals_away_90, lambdaH: p.lambdaH, lambdaA: p.lambdaA, rho: rhoFrozen, markets: p.markets_m1 }));
  return {
    B0: { nll: exactScoreNLL(b0Preds.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }))), secondary: secondaryMetricsFromPredictions(b0Preds), n_oos: b0Preds.length, predictions: b0Preds },
    M0: { nll: exactScoreNLL(m0Preds.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }))), secondary: secondaryMetricsFromPredictions(m0Preds), n_oos: m0Preds.length, predictions: m0Preds },
  };
}

// Calcule M2 (M0 + structure early-season Bayes) via runWalkForwardM2R
// reutilise tel quel.
function computeM2({ allFixtures, trainSeasons, oosSeasons, leagueId, leagueAvgH, leagueAvgA, rhoFrozen, previousSeasonFixturesBySeasons }) {
  const wf = runWalkForwardM2R({ allFixtures, trainSeasons, oosSeasons, leagueId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons, championRho: rhoFrozen });
  const predictions = wf.predictions.filter((p) => p.m0_valid).map((p) => ({ fixture_id: p.fixture_id, cutoff: p.cutoff, h: p.goals_home_90, a: p.goals_away_90, lambdaH: p.lambdaH_m2, lambdaA: p.lambdaA_m2, rho: rhoFrozen, markets: p.markets_m2 }));
  return { nll: exactScoreNLL(predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.h, a: p.a, rho: p.rho }))), secondary: secondaryMetricsFromPredictions(predictions), n_oos: predictions.length, predictions };
}

module.exports = { computeB0AndM0, computeM2, secondaryMetricsFromPredictions };
