"use strict";
// GATE A5 (SPEC LAB PRO v1.0) - mesure de l'effet CAUSE UNIQUEMENT par la
// troncature adaptative (A4), separement des changements A1/A3 deja
// verifies a delta=0/1e-14. Compare fixed_10 (ancienne troncature) vs
// adaptive_1e-10 (nouvelle), memes lambdas, meme rho=-0.0845 (M0 post-A3).

const { buildDixonColesMatrix, buildAdaptiveDixonColesMatrix, blendMatrices, deriveMarketsFromMatrix } = require("../../lib/markets/score-matrix.js");
const { pickMarketDeterministic } = require("../../lib/decision.js");
const fs = require("fs");

function marketsFixed10(lambdaH, lambdaA) {
  const mat = buildDixonColesMatrix(lambdaH, lambdaA, 10);
  const matrix = blendMatrices([{ matrix: mat, weight: 1 }]);
  return deriveMarketsFromMatrix(matrix);
}
function marketsAdaptive(lambdaH, lambdaA) {
  const adaptive = buildAdaptiveDixonColesMatrix(lambdaH, lambdaA);
  const matrix = blendMatrices([{ matrix: adaptive.matrix, weight: 1 }]);
  return { markets: deriveMarketsFromMatrix(matrix), maxGoal: adaptive.maxGoal, tailMass: adaptive.tailMass };
}

function toMarketList(markets, m) {
  // Reconstruit la meme forme que allMarkets en production (id, prob 0-100, cote reelle si disponible)
  const list = [
    { id: "home-win", market: "Victoire Domicile", prob: markets.p1 * 100, cote: parseFloat(m.c1) || null },
    { id: "draw", market: "Match Nul", prob: markets.pN * 100, cote: parseFloat(m.cn) || null },
    { id: "away-win", market: "Victoire Exterieur", prob: markets.p2 * 100, cote: parseFloat(m.c2) || null },
    { id: "over-15", market: "Over 1.5", prob: markets.overUnder["1.5"].over * 100, cote: parseFloat(m.co15) || null },
    { id: "over-25", market: "Over 2.5", prob: markets.overUnder["2.5"].over * 100, cote: parseFloat(m.co25) || null },
    { id: "under-25", market: "Under 2.5", prob: markets.overUnder["2.5"].under * 100, cote: parseFloat(m.cu25) || null },
    { id: "btts-yes", market: "BTTS Oui", prob: markets.btts.yes * 100, cote: parseFloat(m.btts_oui) || null },
    { id: "btts-no", market: "BTTS Non", prob: markets.btts.no * 100, cote: parseFloat(m.btts_non) || null },
  ];
  return list.filter((x) => x.cote && x.cote > 1);
}

function run() {
  const data = JSON.parse(fs.readFileSync(__dirname + "/../../data.json", "utf8"));
  const marketFields = ["p1", "pN", "p2"];
  const ouLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
  const deltasByMarket = {};
  const trackFields = ["p1", "pN", "p2", "OU1.5", "OU2.5", "OU3.5", "BTTS", "DNB"];
  for (const f of trackFields) deltasByMarket[f] = [];

  let maxGoalDistribution = {};
  let maxTailMassBefore = 0, maxTailMassAfter = 0;
  const decisionChanges = [];

  const pairs = data.matchs.filter((m) => m.lambda_h != null && m.lambda_a != null);

  for (const m of pairs) {
    const lh = m.lambda_h, la = m.lambda_a;
    const fixed = marketsFixed10(lh, la);
    const adapt = marketsAdaptive(lh, la);

    maxGoalDistribution[adapt.maxGoal] = (maxGoalDistribution[adapt.maxGoal] || 0) + 1;
    maxTailMassBefore = Math.max(maxTailMassBefore, 1 - (function () {
      // masse fixed10 = somme matrice non renormalisee a 10
      const mat = buildDixonColesMatrix(lh, la, 10);
      let s = 0; for (const row of mat) for (const v of row) s += v; return s;
    })());
    maxTailMassAfter = Math.max(maxTailMassAfter, adapt.tailMass);

    for (const f of marketFields) deltasByMarket[f].push(Math.abs(fixed[f] - adapt.markets[f]));
    for (const line of [1.5, 2.5, 3.5]) {
      deltasByMarket[`OU${line}`].push(Math.abs(fixed.overUnder[line].over - adapt.markets.overUnder[line].over));
    }
    deltasByMarket.BTTS.push(Math.abs(fixed.btts.yes - adapt.markets.btts.yes));
    deltasByMarket.DNB.push(Math.abs(fixed.drawNoBet.home - adapt.markets.drawNoBet.home));

    // Marche choisi : avec les vraies cotes du jour (m.c1, m.co25, etc.)
    const listFixed = toMarketList(fixed, m);
    const listAdapt = toMarketList(adapt.markets, m);
    if (listFixed.length && listAdapt.length) {
      const pickedFixed = pickMarketDeterministic(listFixed, { minOdds: 1.5 });
      const pickedAdapt = pickMarketDeterministic(listAdapt, { minOdds: 1.5 });
      const idFixed = pickedFixed ? pickedFixed.id : null;
      const idAdapt = pickedAdapt ? pickedAdapt.id : null;
      if (idFixed !== idAdapt) {
        decisionChanges.push({ fixture_id: m.id, home: m.home && m.home.n, away: m.away && m.away.n, lambdaH: lh, lambdaA: la, marche_fixed10: idFixed, marche_adaptive: idAdapt });
      }
    }
  }

  function stats(arr) {
    if (!arr.length) return null;
    const sorted = arr.slice().sort((a, b) => a - b);
    const mean = arr.reduce((s, v) => s + v, 0) / arr.length;
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(0.95 * sorted.length))];
    const max = sorted[sorted.length - 1];
    return { mean_abs_delta: mean, p95_abs_delta: p95, max_abs_delta: max, n: arr.length };
  }

  const report = {
    experiment_id: "EXP-005",
    description: "Delta cause uniquement par la troncature adaptative (A4) vs maxGoals=10 fixe, sur les 46 matchs reels de production du jour",
    n_matches: pairs.length,
    max_goal_distribution: maxGoalDistribution,
    max_tail_mass_before_fixed10: maxTailMassBefore,
    max_tail_mass_after_adaptive: maxTailMassAfter,
    delta_by_market: Object.fromEntries(Object.entries(deltasByMarket).map(([k, v]) => [k, stats(v)])),
    n_decision_changes: decisionChanges.length,
    decision_changes: decisionChanges,
  };
  console.log(JSON.stringify(report, null, 1));
  fs.writeFileSync(__dirname + "/exp005_report.json", JSON.stringify(report, null, 1));
}
run();
