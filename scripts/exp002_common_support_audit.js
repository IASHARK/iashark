#!/usr/bin/env node
"use strict";
// EXP-002 - audit COMMON SUPPORT (2026-09-05), suite a l'audit utilisateur
// qui a identifie que M0 tel que calcule par run_exp002.js N'ETAIT PAS le
// meme champion que M0 dans EXP-001 (agregats saison courante seule +
// aucun gate calcCriteres, contre agregats multi-saisons poolees + gate
// calcCriteres>=3 dans EXP-001). Confirme empiriquement : 724/748 fixtures
// communes ont des lambdas M0 DIFFERENTS entre les deux rapports (max
// diff lambdaH=2.35, max diff lambdaA=2.04) - PAS le meme champion.
//
// AUCUN REFIT, AUCUN RECALCUL DE LAMBDA : reutilise EXCLUSIVEMENT les
// lambdas DEJA PERSISTES par les deux runs reels :
//   - M0 (vrai champion gele) : scripts/experiments/exp001_report.json
//     #predictions[].{lambdaH,lambdaA,rho_m0} (rho_m0=-0.0845)
//   - M2 (candidat) : scripts/experiments/exp002_report.json
//     #predictions[].{lambdaH_m2,lambdaA_m2} (rho fixe -0.0845, meme constante)
// La seule operation effectuee ici est une JOINTURE par fixture_id et une
// EVALUATION de logProbability (deterministe, pas une optimisation) aux
// points deja connus.

const fs = require("fs");
const path = require("path");
const { logProbability } = require("../lib/lab/dc-log-probability.js");
const { lossDelta } = require("../lib/lab/loss-delta.js");
const { pairedBlockBootstrap } = require("../lib/lab/bootstrap.js");
const { getIsoYearWeek } = require("../lib/lab/iso-week.js");
const { binaryLogLoss, binaryBrier, multiclassLogLoss, multiclassBrier } = require("../lib/lab/metrics.js");

const CHAMPION_RHO = -0.0845;
const LEAGUE_ID = 39;

const exp001 = JSON.parse(fs.readFileSync(path.join(__dirname, "experiments", "exp001_report.json"), "utf8"));
const exp002 = JSON.parse(fs.readFileSync(path.join(__dirname, "experiments", "exp002_report.json"), "utf8"));

const exp001ById = new Map(exp001.predictions.map((p) => [p.fixture_id, p]));
const exp002ById = new Map(exp002.predictions.map((p) => [p.fixture_id, p]));

// --- COMMON_SUPPORT = fixtures ou le VRAI M0 (EXP-001) ET M2 (EXP-002) produisent tous les deux une prediction ---
const commonSupportIds = [...exp001ById.keys()].filter((id) => exp002ById.has(id));
console.log("COMMON_SUPPORT N =", commonSupportIds.length, "(attendu 748)");

const commonRows = commonSupportIds.map((fid) => {
  const m0 = exp001ById.get(fid); // vrai champion, lambdas DEJA PERSISTES par EXP-001
  const m2 = exp002ById.get(fid); // candidat, lambdas DEJA PERSISTES par EXP-002
  const h = m0.goals_home_90, a = m0.goals_away_90;
  const nllM0 = -logProbability(m0.lambdaH, m0.lambdaA, h, a, m0.rho_m0);
  const nllM2 = -logProbability(m2.lambdaH_m2, m2.lambdaA_m2, h, a, CHAMPION_RHO);
  return {
    fixture_id: fid,
    season: m0.season,
    cutoff: m0.cutoff,
    bucket: m2.bucket,
    lambdaH_m0: m0.lambdaH, lambdaA_m0: m0.lambdaA,
    lambdaH_m2: m2.lambdaH_m2, lambdaA_m2: m2.lambdaA_m2,
    goals_home_90: h, goals_away_90: a,
    markets_m0_p1: m0.markets_m0.p1, markets_m0_pN: m0.markets_m0.pN, markets_m0_p2: m0.markets_m0.p2,
    markets_m0_ou25: m0.markets_m0.overUnder["2.5"].over, markets_m0_btts: m0.markets_m0.btts.yes,
    markets_m2_p1: m2.markets_m2.p1, markets_m2_pN: m2.markets_m2.pN, markets_m2_p2: m2.markets_m2.p2,
    markets_m2_ou25: m2.markets_m2.overUnder["2.5"].over, markets_m2_btts: m2.markets_m2.btts.yes,
    nll_m0: nllM0, nll_m2: nllM2,
    delta: lossDelta(nllM2, nllM0),
  };
});

function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null; }

function bootstrapOn(rows, seed) {
  const byBlock = new Map();
  for (const r of rows) {
    const { isoYear, isoWeek } = getIsoYearWeek(r.cutoff);
    const key = `${LEAGUE_ID}-${r.season}-${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
    if (!byBlock.has(key)) byBlock.set(key, []);
    byBlock.get(key).push(r.delta);
  }
  const blocks = Array.from(byBlock.values());
  if (!blocks.length) return { valid: false, reason: "NO_DATA" };
  return pairedBlockBootstrap(blocks, { seed, nResamples: 10000 });
}

function secondaryOn(rows) {
  const ou25 = { m0: [], m2: [] }, btts = { m0: [], m2: [] }, x12 = { m0: [], m2: [] };
  for (const r of rows) {
    const total = r.goals_home_90 + r.goals_away_90;
    const over25 = total > 2.5 ? 1 : 0;
    const bttsY = r.goals_home_90 > 0 && r.goals_away_90 > 0 ? 1 : 0;
    const outcome = r.goals_home_90 > r.goals_away_90 ? "p1" : (r.goals_home_90 === r.goals_away_90 ? "pN" : "p2");
    ou25.m0.push({ prob: r.markets_m0_ou25, outcome: over25 });
    ou25.m2.push({ prob: r.markets_m2_ou25, outcome: over25 });
    btts.m0.push({ prob: r.markets_m0_btts, outcome: bttsY });
    btts.m2.push({ prob: r.markets_m2_btts, outcome: bttsY });
    x12.m0.push({ probs: { p1: r.markets_m0_p1, pN: r.markets_m0_pN, p2: r.markets_m0_p2 }, outcome });
    x12.m2.push({ probs: { p1: r.markets_m2_p1, pN: r.markets_m2_pN, p2: r.markets_m2_p2 }, outcome });
  }
  return {
    ou25: { logloss_m0: binaryLogLoss(ou25.m0), logloss_m2: binaryLogLoss(ou25.m2), brier_m0: binaryBrier(ou25.m0), brier_m2: binaryBrier(ou25.m2) },
    btts: { logloss_m0: binaryLogLoss(btts.m0), logloss_m2: binaryLogLoss(btts.m2), brier_m0: binaryBrier(btts.m0), brier_m2: binaryBrier(btts.m2) },
    x12: { logloss_m0: multiclassLogLoss(x12.m0), logloss_m2: multiclassLogLoss(x12.m2), brier_m0: multiclassBrier(x12.m0), brier_m2: multiclassBrier(x12.m2) },
  };
}

function summarize(rows, seed) {
  if (!rows.length) return { n: 0 };
  const nllM0 = mean(rows.map((r) => r.nll_m0));
  const nllM2 = mean(rows.map((r) => r.nll_m2));
  return {
    n: rows.length,
    nll_m0: nllM0,
    nll_m2: nllM2,
    delta_mean: nllM2 - nllM0,
    relative_gain: (nllM0 - nllM2) / nllM0,
    bootstrap: bootstrapOn(rows, seed),
    secondary_metrics: secondaryOn(rows),
  };
}

const SEED = "EXP-002-common-support-v1";
const GLOBAL = summarize(commonRows, SEED);
const byBucket = {};
for (const b of ["EARLY", "TRANSITION", "LATE"]) byBucket[b] = summarize(commonRows.filter((r) => r.bucket === b), SEED + "-" + b);
const bySeason = {};
for (const s of [2023, 2024]) bySeason[s] = summarize(commonRows.filter((r) => r.season === s), SEED + "-S" + s);
const byBucketSeason = {};
for (const s of [2023, 2024]) {
  byBucketSeason[s] = {};
  for (const b of ["EARLY", "TRANSITION", "LATE"]) byBucketSeason[s][b] = summarize(commonRows.filter((r) => r.season === s && r.bucket === b), SEED + "-S" + s + "-" + b);
}

console.log("\n=== GLOBAL (common support) ===");
console.log(JSON.stringify(GLOBAL, null, 2));
console.log("\n=== BY BUCKET ===");
console.log(JSON.stringify(byBucket, null, 2));
console.log("\n=== EARLY BY SEASON ===");
console.log(JSON.stringify({ 2023: byBucketSeason[2023].EARLY, 2024: byBucketSeason[2024].EARLY }, null, 2));

// --- M2_COVERAGE_GAIN : les 12 fixtures ou SEUL M2 predit ---
const coverageGainIds = [...exp002ById.keys()].filter((id) => !exp001ById.has(id));
const exp001ExclusionByFid = new Map((exp001.exclusions ? exp001.exclusions.fixtures : []).map((e) => [e.fixture_id, e]));
const coverageGain = coverageGainIds.map((fid) => {
  const m2 = exp002ById.get(fid);
  const exclusion = exp001ExclusionByFid.get(fid);
  const nllM2 = -logProbability(m2.lambdaH_m2, m2.lambdaA_m2, m2.goals_home_90, m2.goals_away_90, CHAMPION_RHO);
  return {
    fixture_id: fid,
    season: m2.season,
    n_home: m2.n_home, n_away: m2.n_away,
    home_returning: m2.home_returning, away_returning: m2.away_returning,
    prior_weight_home: m2.prior_weight_home, prior_weight_away: m2.prior_weight_away,
    lambdaH_m2: m2.lambdaH_m2, lambdaA_m2: m2.lambdaA_m2,
    goals_home_90: m2.goals_home_90, goals_away_90: m2.goals_away_90,
    nll_m2: nllM2,
    predicted_p1: m2.markets_m2.p1, predicted_pN: m2.markets_m2.pN, predicted_p2: m2.markets_m2.p2,
    reason_m0_unavailable: exclusion ? exclusion.reason_code : "INSUFFICIENT_TEAM_HISTORY (calcCriteres<3, voir exp001_report.json#exclusions)",
  };
});

console.log("\n=== M2_COVERAGE_GAIN ===");
console.log("n =", coverageGain.length);
console.log(JSON.stringify(coverageGain, null, 2));

const report = {
  common_support: { n: commonSupportIds.length, fixture_ids: commonSupportIds, global: GLOBAL, by_bucket: byBucket, by_season: bySeason, by_bucket_and_season: byBucketSeason },
  m2_coverage_gain: { n: coverageGain.length, matches: coverageGain },
  m0_definition_mismatch_confirmed: {
    n_common_fixtures_checked: commonSupportIds.length,
    n_lambda_identical: commonSupportIds.filter((fid) => Math.abs(exp001ById.get(fid).lambdaH - exp002ById.get(fid).lambdaH_m0) < 1e-9 && Math.abs(exp001ById.get(fid).lambdaA - exp002ById.get(fid).lambdaA_m0) < 1e-9).length,
    n_lambda_different: commonSupportIds.filter((fid) => Math.abs(exp001ById.get(fid).lambdaH - exp002ById.get(fid).lambdaH_m0) >= 1e-9 || Math.abs(exp001ById.get(fid).lambdaA - exp002ById.get(fid).lambdaA_m0) >= 1e-9).length,
    conclusion: "M0 tel que calcule par scripts/run_exp002.js (agregats saison courante seule, aucun gate calcCriteres) N'EST PAS le meme champion que M0 dans EXP-001 (agregats multi-saisons poolees via lib/data/team-state.js, gate calcCriteres>=3). Ce fichier utilise exclusivement le VRAI M0 (EXP-001) pour la comparaison common-support ci-dessus - le champ 'lambdaH_m0'/'lambdaA_m0' du rapport EXP-002 original doit desormais etre considere DEPRECIE pour toute conclusion scientifique.",
  },
};

fs.writeFileSync(path.join(__dirname, "experiments", "exp002_common_support_report.json"), JSON.stringify(report, null, 2));
console.log("\nRapport ecrit: scripts/experiments/exp002_common_support_report.json");
