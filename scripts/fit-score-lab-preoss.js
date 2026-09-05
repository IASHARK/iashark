#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 (2026-09-06). Score Lab PRE-OOS pour une
// ligue donnee : fitte rho PAR LIGUE (jamais rho_PL=-0.0845 injecte
// comme candidat) en reutilisant TEL QUEL le runner walk-forward deja
// teste (lib/lab/walkforward-runner.js#runWalkForward) et le VRAI
// fitter (scripts/fit_rho.py, via lib/lab/run-experiment.js#pythonRhoFitter)
// - AUCUNE reimplementation.
//
// IMPORTANT (item "STOP avant OOS") : ce script appelle runWalkForward
// avec oosSeasons = [TRAIN] (PAS OOS_DEV/OOS_FINAL) - la "fenetre
// d'evaluation" walk-forward ici est la saison TRAIN elle-meme, qui
// n'est PAS une donnee tenue secrete (contrairement a OOS_DEV/
// OOS_FINAL). Ceci permet de reutiliser tel quel runWalkForward (deja
// teste, anti-leakage garanti structurellement par
// tests/lab-walkforward-anti-leakage.test.js - test partage, pas
// re-ecrit par ligue) pour PROUVER que le fit converge sur les
// donnees de cette ligue, SANS jamais lire une metrique OOS_DEV/
// OOS_FINAL reelle. Le NLL M0/M1 rapporte ici est un diagnostic
// TRAIN-only, jamais une decision de promotion.
//
// Usage : node scripts/fit-score-lab-preoss.js --league-key=laliga

const fs = require("fs");
const path = require("path");
const { runWalkForward } = require("../lib/lab/walkforward-runner.js");
const { pythonRhoFitter } = require("../lib/lab/run-experiment.js");
const { exactScoreNLL } = require("../lib/lab/metrics.js");

const PRODUCTION_CHAMPION_RHO = -0.0845; // M0 = modele de PRODUCTION tel quel (jamais retune par ligue - c'est la definition de M0)

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; }
  return args;
}
function loadLeagueConfig(leagueKey) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8"));
  const entry = config.leagues.find((l) => l.key === leagueKey);
  if (!entry) throw new Error(`Ligue "${leagueKey}" absente de config/league-expansion.json`);
  return entry;
}
function loadFixtures(leagueKey, season) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8")).map((f) => ({ ...f, season }));
}
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }
function std(arr) { if (arr.length < 2) return 0; const m = mean(arr); return Math.sqrt(mean(arr.map((v) => (v - m) ** 2))); }
function median(arr) { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b); const mid = Math.floor(s.length / 2); return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2; }

function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/fit-score-lab-preoss.js --league-key=<key>"); process.exit(1); }
  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;

  console.log(`=== Score Lab PRE-OOS : ${league.displayName} (league_id=${league.apiFootballId}) ===`);
  console.log(`WARMUP=${sp.warmup} TRAIN=${sp.train} (OOS_DEV=${sp.oos_dev}/OOS_FINAL=${sp.oos_final} NON CHARGES dans ce script)`);

  const warmupFixtures = loadFixtures(leagueKey, sp.warmup);
  const trainFixtures = loadFixtures(leagueKey, sp.train);
  const allFixtures = [...warmupFixtures, ...trainFixtures];
  console.log(`fixtures WARMUP=${warmupFixtures.length} TRAIN=${trainFixtures.length}`);

  // leagueAvgH/leagueAvgA REELS de CETTE ligue (TRAIN uniquement) -
  // jamais les valeurs 1.35/1.10 par defaut (celles-ci sont un fallback
  // generique de lib/engine.js#calcLambdas, pas un parametre PL a copier).
  const validTrain = trainFixtures.filter((f) => f.goals_home_90 != null && f.goals_away_90 != null);
  const leagueAvgH = mean(validTrain.map((f) => f.goals_home_90));
  const leagueAvgA = mean(validTrain.map((f) => f.goals_away_90));
  console.log(`leagueAvgH(TRAIN reel)=${leagueAvgH.toFixed(4)} leagueAvgA(TRAIN reel)=${leagueAvgA.toFixed(4)} (jamais 1.35/1.10 par defaut)`);

  const wf = runWalkForward({
    allFixtures,
    trainSeasons: [sp.warmup],
    oosSeasons: [sp.train], // fenetre d'evaluation walk-forward = TRAIN lui-meme, PAS OOS_DEV/OOS_FINAL
    championRho: PRODUCTION_CHAMPION_RHO,
    candidateRhoFitter: pythonRhoFitter(),
    leagueAvgH, leagueAvgA, leagueId: league.apiFootballId,
  });

  console.log(`\nn_cutoffs=${wf.cutoffs.length} n_predictions=${wf.predictions.length}`);
  if (!wf.predictions.length) { console.error("AUCUNE prediction produite - donnees TRAIN insuffisantes (moins de 3 matchs joues par equipe au debut de TRAIN ?). Arret."); process.exit(1); }

  const rhoValues = wf.fitLog.map((f) => f.rho_hat).filter((v) => typeof v === "number");
  const convergedCount = wf.fitLog.filter((f) => f.convergence).length;
  const boundaryCount = wf.fitLog.filter((f) => f.on_boundary).length;
  const convergenceRate = wf.fitLog.length ? convergedCount / wf.fitLog.length : 0;
  const boundaryHitRate = wf.fitLog.length ? boundaryCount / wf.fitLog.length : 0;

  const nllM0 = exactScoreNLL(wf.predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, rho: p.rho_m0, h: p.goals_home_90, a: p.goals_away_90 })));
  const nllM1 = exactScoreNLL(wf.predictions.map((p) => ({ lambdaH: p.lambdaH, lambdaA: p.lambdaA, rho: p.rho_m1, h: p.goals_home_90, a: p.goals_away_90 })));

  // rho final = celui fitte au DERNIER cutoff TRAIN (le plus de donnees
  // disponibles) - c'est CE rho qui devient le candidat M2 fige pour
  // cette ligue, a evaluer plus tard sur le VRAI OOS_DEV/OOS_FINAL.
  const lastFit = wf.fitLog[wf.fitLog.length - 1];

  const result = {
    league_key: leagueKey, league_id: league.apiFootballId, generated_at: new Date().toISOString(),
    warmup_season: sp.warmup, train_season: sp.train,
    disclaimer: "DIAGNOSTIC TRAIN-ONLY - oosSeasons ici = saison TRAIN elle-meme, jamais OOS_DEV/OOS_FINAL. Aucune metrique OOS reelle n'a ete calculee ni consultee.",
    league_avg_h_real: leagueAvgH, league_avg_a_real: leagueAvgA,
    n_cutoffs: wf.cutoffs.length, n_predictions: wf.predictions.length,
    production_champion_rho_m0: PRODUCTION_CHAMPION_RHO,
    fitted_rho_candidate_m2: {
      value: lastFit.rho_hat, convergence: lastFit.convergence, on_boundary: !!lastFit.on_boundary, n_train_at_last_cutoff: lastFit.n_train,
      status: `CANDIDATE_SCORE_CHAMPION_${leagueKey.toUpperCase()}_UNVALIDATED`,
    },
    rho_across_train_cutoffs: { mean: mean(rhoValues), median: median(rhoValues), std: std(rhoValues), min: rhoValues.length ? Math.min(...rhoValues) : null, max: rhoValues.length ? Math.max(...rhoValues) : null, n_fits: rhoValues.length },
    convergence_rate: convergenceRate, boundary_hit_rate: boundaryHitRate,
    train_window_diagnostic_nll: { nll_m0_production_rho: nllM0, nll_m1_league_fitted_rho: nllM1, note: "Diagnostic sur TRAIN (donnee visible, pas tenue secrete) - PAS une decision de promotion. La vraie comparaison M0 vs M2 se fera sur OOS_DEV/OOS_FINAL dans une passe future explicitement autorisee." },
  };

  const outDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "score-lab-preoss.json"), JSON.stringify(result, null, 2));

  console.log("\n=== RESULTAT ===");
  console.log(JSON.stringify(result, null, 2));
}

main();
