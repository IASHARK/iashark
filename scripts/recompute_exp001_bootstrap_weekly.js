#!/usr/bin/env node
"use strict";
// Correction protocole EXP-001 (audit 2026-09-05, point A) : la SPEC
// pre-enregistree impose block = semaine x league-season pour le
// bootstrap, pas un bloc par jour/cutoff (ce que le premier rapport
// utilisait par erreur). AUCUN REFIT : reutilise EXACTEMENT les 748
// differentiels deja produits par le run reel (d_i = NLL_M1 - NLL_M0,
// convention lib/lab/loss-delta.js), regroupes differemment, avec le
// MEME seed que l'experience originale ("EXP-001-v1").

const fs = require("fs");
const path = require("path");
const { logProbability } = require("../lib/lab/dc-log-probability.js");
const { lossDelta } = require("../lib/lab/loss-delta.js");
const { pairedBlockBootstrap } = require("../lib/lab/bootstrap.js");
const { evaluatePromotion } = require("../lib/promotion.js");
const { getIsoYearWeek } = require("../lib/lab/iso-week.js");

const REPORT_PATH = path.join(__dirname, "experiments", "exp001_report.json");
const report = JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"));
const LEAGUE_ID = 39;
const SEED = "EXP-001-v1"; // identique au manifest original (methodology.bootstrap.seed)

const byBlock = new Map();
for (const p of report.predictions) {
  const nllChampion = -logProbability(p.lambdaH, p.lambdaA, p.goals_home_90, p.goals_away_90, p.rho_m0);
  const nllCandidate = -logProbability(p.lambdaH, p.lambdaA, p.goals_home_90, p.goals_away_90, p.rho_m1);
  const delta = lossDelta(nllCandidate, nllChampion);
  const { isoYear, isoWeek } = getIsoYearWeek(p.cutoff); // cutoff = jour calendaire exact du match (voir methodology_notes)
  const blockKey = `${LEAGUE_ID}-${p.season}-${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
  if (!byBlock.has(blockKey)) byBlock.set(blockKey, []);
  byBlock.get(blockKey).push(delta);
}

const blockKeys = Array.from(byBlock.keys()).sort();
const blocks = blockKeys.map((k) => byBlock.get(k));

const bootstrapWeekly = pairedBlockBootstrap(blocks, { seed: SEED, nResamples: 10000 });

console.log("=== Bootstrap corrige : block = semaine x league-season ===");
console.log("n_blocks_weekly:", bootstrapWeekly.n_blocks);
console.log("n_total_deltas:", bootstrapWeekly.n_total_deltas);
console.log("seed:", bootstrapWeekly.seed, `("${SEED}")`);
console.log("observed_mean_delta:", bootstrapWeekly.observed_mean_delta);
console.log("CI95:", `[${bootstrapWeekly.ci_lower}, ${bootstrapWeekly.ci_upper}]`);
console.log("ci_crosses_zero:", bootstrapWeekly.ci_crosses_zero);
console.log("probability_candidate_better:", bootstrapWeekly.probability_candidate_better);
console.log("\nblock keys (sample):", blockKeys.slice(0, 5), "...", blockKeys.slice(-3));

// Recalcule la decision de promotion avec le CI corrige (memes
// nll_m0/nll_m1/convergence/boundary/rho_std/secondary/low_score que le
// run reel - AUCUN nouveau fitting).
const promotionWeekly = evaluatePromotion({
  n_oos: report.n_predictions,
  nll_m0: report.nll_m0,
  nll_m1: report.nll_m1,
  ci_lower: bootstrapWeekly.ci_lower,
  ci_upper: bootstrapWeekly.ci_upper,
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
console.log("\nPromotion (CI hebdomadaire):", JSON.stringify(promotionWeekly, null, 2));

// --- Ecrit le rapport : conserve le bootstrap ORIGINAL (bloc journalier,
// tel que reellement calcule au moment du run) sous un nom explicite pour
// l'audit, et fait du bootstrap CORRECT (bloc semaine x league-season,
// conforme SPEC) le champ `bootstrap` principal - jamais un remplacement
// silencieux, les deux restent visibles.
report.bootstrap_daily_block_superseded = {
  ...report.bootstrap,
  note: "Bootstrap ORIGINAL du run reel (2026-09-04), bloc = jour/cutoff - NE RESPECTAIT PAS la SPEC pre-enregistree (bloc = semaine x league-season). Conserve tel quel pour l'audit, remplace par bootstrap_weekly_block ci-dessous comme resultat officiel.",
};
report.bootstrap = {
  ...bootstrapWeekly,
  block_definition: "league_id + season + ISO_YEAR_WEEK(kickoff_timestamp_utc) - conforme SPEC pre-enregistree",
};
report.promotion = promotionWeekly;
report.methodology_notes.bootstrap_block_definition = "CORRIGE (2026-09-05) : un bloc = league_id + season + semaine ISO 8601 (annee-semaine) du kickoff_timestamp UTC - PAS un bloc par jour/cutoff comme dans le calcul initial (conserve dans bootstrap_daily_block_superseded pour audit). lib/lab/iso-week.js#getIsoYearWeek, lib/lab/bootstrap.js#pairedBlockBootstrap rechantillonne des semaines entieres.";
report.methodology_notes.bootstrap_n_blocks_declared = bootstrapWeekly.n_blocks;
report.methodology_notes.bootstrap_n_blocks_check = `${bootstrapWeekly.n_blocks} blocs hebdomadaires (vs 225 blocs journaliers precedemment) - ${blockKeys.length} semaines distinctes couvertes sur 2023-24+2024-25`;

fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log("\nRapport ecrit.");
