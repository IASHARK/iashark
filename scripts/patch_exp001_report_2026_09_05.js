#!/usr/bin/env node
"use strict";
// Correction du rapport EXP-001 suite a l'audit du 2026-09-05 - AUCUN
// NOUVEAU FITTING : recalcule uniquement les champs DERIVES
// (low_score_diagnostics via le bug de calibration corrige,
// promotion via le seuil corrige 0.25%) a partir des `predictions` DEJA
// STOCKEES par le run reel. nll_m0/nll_m1/bootstrap/rho_*/predictions/
// fit_log restent EXACTEMENT ceux du run reel, jamais recalcules.
// Ajoute aussi la documentation des 12 exclusions et de la politique de
// cutoff/bootstrap, demandee explicitement par l'audit.

const fs = require("fs");
const path = require("path");
const { lowScoreDiagnostics } = require("../lib/lab/metrics.js");
const { evaluatePromotion } = require("../lib/promotion.js");
const { buildTeamState, toCalcCriteresStats } = require("../lib/data/team-state.js");
const { calcCriteres } = require("../lib/engine.js");

const REPORT_PATH = path.join(__dirname, "experiments", "exp001_report.json");
const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));

// --- 1. low_score_diagnostics recalcule (bug de calibration corrige) ---
const lowScoreInput = report.predictions.map((p) => ({
  lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rhoM0: p.rho_m0, rhoM1: p.rho_m1,
}));
report.low_score_diagnostics = lowScoreDiagnostics(lowScoreInput);

// --- 2. promotion recalculee (seuil 0.25%, reason codes renommes) - MEMES nll_m0/nll_m1/bootstrap/convergence/boundary/rho_std que le run reel ---
report.promotion = evaluatePromotion({
  n_oos: report.n_predictions,
  nll_m0: report.nll_m0,
  nll_m1: report.nll_m1,
  ci_lower: report.bootstrap.ci_lower,
  ci_upper: report.bootstrap.ci_upper,
  convergence_rate: report.convergence_rate,
  boundary_hit_rate: report.boundary_hit_rate,
  rho_stability: { std: report.rho_std },
  secondary: {
    ou25: { logloss_m0: report.secondary_metrics.ou25.logloss_m0, logloss_m1: report.secondary_metrics.ou25.logloss_m1 },
    btts: { logloss_m0: report.secondary_metrics.btts.logloss_m0, logloss_m1: report.secondary_metrics.btts.logloss_m1 },
    x12: { logloss_m0: report.secondary_metrics.x12.logloss_m0, logloss_m1: report.secondary_metrics.x12.logloss_m1 },
  },
  low_score_diagnostics: report.low_score_diagnostics,
});

// --- 3. Documentation des 12 exclusions (fixtures OOS sans prediction) ---
const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
const f2022 = JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, "premier-league-2022.json"), "utf8"));
const f2023 = JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, "premier-league-2023.json"), "utf8"));
const f2024 = JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, "premier-league-2024.json"), "utf8"));
const oos = [...f2023, ...f2024];
const predictedIds = new Set(report.predictions.map((p) => p.fixture_id));
const missing = oos.filter((f) => !predictedIds.has(f.fixture_id)).sort((a, b) => a.kickoff_timestamp.localeCompare(b.kickoff_timestamp));

function poolFor(season) { return season === 2023 ? [...f2022, ...f2023] : [...f2022, ...f2023, ...f2024]; }

const exclusions = missing.map((f) => {
  const cutoff = f.kickoff_timestamp.slice(0, 10) + "T00:00:00.000Z";
  const pool = poolFor(f.season).filter((x) => new Date(x.kickoff_timestamp) < new Date(cutoff));
  const hState = buildTeamState(pool, f.home_team_id, cutoff);
  const aState = buildTeamState(pool, f.away_team_id, cutoff);
  const hOk = !!calcCriteres(toCalcCriteresStats(hState), true, null);
  const aOk = !!calcCriteres(toCalcCriteresStats(aState), false, null);
  const reason = (!hOk && !aOk) ? "INSUFFICIENT_TEAM_HISTORY(both)" : (!hOk ? "INSUFFICIENT_TEAM_HISTORY(home)" : "INSUFFICIENT_TEAM_HISTORY(away)");
  return {
    fixture_id: f.fixture_id,
    date: f.kickoff_timestamp.slice(0, 10),
    home_team: f.home_team_name,
    away_team: f.away_team_name,
    home_played_at_cutoff: hState.playedTotal,
    away_played_at_cutoff: aState.playedTotal,
    reason_code: reason,
  };
});

report.exclusions = {
  total_oos_fixtures: oos.length,
  predictions_produced: report.predictions.length,
  n_excluded: exclusions.length,
  exclusion_reason_summary: "calcCriteres (lib/engine.js) exige >=3 matchs joues avant le cutoff pour l'equipe domicile ET l'equipe exterieur - regle PRE-DEFINIE, identique a la production, appliquee AVANT toute prediction (jamais un filtre post-hoc sur le resultat). Les 12 cas sont les 3 premiers matchs de chaque equipe fraichement promue (Burnley/Sheffield Utd/Luton en 2023-24, Ipswich en 2024-25), qui n'ont aucun historique Premier League dans le dataset collecte (elles jouaient en Championship la saison precedente, hors perimetre de GATE B1).",
  fixtures: exclusions,
  m0_m1_same_support: "M0 et M1 sont calcules dans la MEME iteration pour chaque match retenu (lib/lab/walkforward-runner.js) - aucune exclusion independante possible entre les deux modeles. Verifie : " + report.predictions.every((p) => p.markets_m0 && p.markets_m1) + " (100% des predictions ont markets_m0 ET markets_m1).",
};

// --- 4. Documentation cutoff + bootstrap ---
const cutoffsWithPredictions = new Set(report.predictions.map((p) => p.cutoff));
const cutoffsWithoutPredictions = report.fit_log.map((f) => f.cutoff).filter((c) => !cutoffsWithPredictions.has(c));
const byCutoff = {};
for (const p of report.predictions) byCutoff[p.cutoff] = (byCutoff[p.cutoff] || 0) + 1;
const batchSizes = Object.values(byCutoff);

report.methodology_notes = {
  cutoff_definition: "Un cutoff = un jour calendaire UTC (YYYY-MM-DDT00:00:00.000Z) contenant au moins un match OOS. lib/lab/walkforward-runner.js#buildCutoffs groupe les fixtures OOS par date calendaire de kickoff_timestamp (YYYY-MM-DD, tronque a l'heure) ; le cutoff est le DEBUT de cette journee.",
  same_day_batching: "Tous les matchs partageant la meme date calendaire (meme si des heures de coup d'envoi differentes, ex: samedi 12h30/15h00/17h30) sont traites dans le MEME batch, au MEME cutoff - aucun match d'un batch n'informe la prediction d'un autre match du meme batch, meme si l'un a deja ete joue au moment ou l'autre commence.",
  train_strictly_before_cutoff: "lib/data/team-state.js#buildTeamState filtre kickoff_timestamp < cutoff, STRICTEMENT (jamais <=). Verifie par tests/lab-walkforward-anti-leakage.test.js (ajout d'un match futur aberrant, predictions anterieures inchangees).",
  batch_never_in_own_train: "Consequence directe de train_strictly_before_cutoff : les matchs du batch ont kickoff >= cutoff (meme jour), donc structurellement exclus de leur propre pool d'entrainement - jamais besoin d'un filtre special.",
  rescheduled_matches_ordering: "API-Football expose fixture.date comme l'horodatage REEL du coup d'envoi (deja tenant compte de tout report/decalage TV) - jamais une date 'initialement prevue'. Aucune ambiguite d'ordre : le cutoff est toujours calcule sur la date EFFECTIVEMENT jouee. Confirme par la collecte reelle : 0 statut PST/CANC/ABD sur les 4 saisons (aucun cas de report-puis-rejoue avec deux dates concurrentes dans ce dataset). Le tri des cutoffs (Array.sort() sur des chaines ISO 8601) est lexicographique = chronologique, deterministe (aucun alea).",
  n_cutoffs_total: report.fit_log.length,
  n_cutoffs_with_predictions: cutoffsWithPredictions.size,
  n_cutoffs_zero_predictions: cutoffsWithoutPredictions.length,
  cutoffs_zero_predictions_detail: cutoffsWithoutPredictions,
  cutoffs_zero_predictions_explanation: "Ces 4 journees ne contenaient qu'UN SEUL match OOS, et ce match impliquait une equipe fraichement promue sans historique suffisant (voir report.exclusions) - aucune prediction resoluble ce jour-la, donc aucun bloc de bootstrap pour ce cutoff.",
  batch_size_min: Math.min(...batchSizes),
  batch_size_max: Math.max(...batchSizes),
  batch_size_avg: batchSizes.reduce((a, b) => a + b, 0) / batchSizes.length,
  bootstrap_block_definition: "Un bloc = l'ensemble des deltas (loss_candidate - loss_champion, lib/lab/loss-delta.js) de TOUS les matchs partageant le MEME cutoff (meme jour calendaire) - PAS un bootstrap IID match par match. lib/lab/bootstrap.js#pairedBlockBootstrap rechantillonne des BLOCS ENTIERS (tous les deltas d'un cutoff ensemble), preservant la dependance temporelle intra-journee tout en cassant la dependance inter-journees, conformement a la SPEC.",
  bootstrap_n_blocks_declared: report.bootstrap.n_blocks,
  bootstrap_n_blocks_check: report.bootstrap.n_blocks === cutoffsWithPredictions.size ? "OK (egal au nombre de cutoffs avec >=1 prediction)" : "ECART A INVESTIGUER",
};

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log("Rapport corrige. Nouveau statut promotion:", JSON.stringify(report.promotion, null, 2));
console.log("\nExclusions:", report.exclusions.n_excluded, "sur", report.exclusions.total_oos_fixtures);
console.log("\nCutoffs:", report.methodology_notes.n_cutoffs_total, "total,", report.methodology_notes.n_cutoffs_with_predictions, "avec predictions,", report.methodology_notes.n_cutoffs_zero_predictions, "vides");
console.log("Bootstrap blocks:", report.methodology_notes.bootstrap_n_blocks_declared, "-", report.methodology_notes.bootstrap_n_blocks_check);
