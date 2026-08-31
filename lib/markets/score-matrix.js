"use strict";
// Score distribution -> familles de marches (MASTER V2.1 §10.V). Un seul
// matrice de probabilite P(HomeGoals=i, AwayGoals=j) alimente tous les
// marches lies aux buts, au lieu d'un modele independant par marche.
//
// Ne duplique PAS poissonProb/dixonColesCorr (deja dans lib/models.js,
// deja branches sur le pipeline en production) : les reutilise pour
// construire la matrice complete, que lib/models.js ne retourne pas
// aujourd'hui (il ne retourne que des agregats p1/pN/p2/over25/...).
// Cette matrice est ensuite la SEULE entree de deriveMarketsFromMatrix(),
// qui sait deriver n'importe quel marche de buts sans nouveau modele.

const { poissonProb, dixonColesCorr } = require("../models.js");

function buildPoissonMatrix(lambdaH, lambdaA, maxGoals) {
  maxGoals = maxGoals || 8;
  const mat = [];
  for (let h = 0; h <= maxGoals; h++) {
    mat[h] = [];
    for (let a = 0; a <= maxGoals; a++) mat[h][a] = poissonProb(lambdaH, h) * poissonProb(lambdaA, a);
  }
  return mat;
}

function buildDixonColesMatrix(lambdaH, lambdaA, maxGoals) {
  maxGoals = maxGoals || 8;
  const mat = [];
  for (let h = 0; h <= maxGoals; h++) {
    mat[h] = [];
    for (let a = 0; a <= maxGoals; a++) {
      const p = poissonProb(lambdaH, h) * poissonProb(lambdaA, a) * dixonColesCorr(h, a, lambdaH, lambdaA);
      mat[h][a] = Math.max(0, p);
    }
  }
  return mat;
}

// Combine plusieurs matrices (ex: Poisson + Dixon-Coles + Monte-Carlo
// discretise) par une moyenne ponderee, cellule par cellule, puis
// renormalise a 1. Permet de derive les marches depuis un ENSEMBLE plutot
// qu'un seul modele, conformement a §10.Q/10.R (meta-ensemble).
function blendMatrices(matricesWithWeights) {
  if (!matricesWithWeights || !matricesWithWeights.length) return null;
  const maxH = Math.max(...matricesWithWeights.map((m) => m.matrix.length - 1));
  const maxA = Math.max(...matricesWithWeights.map((m) => m.matrix[0].length - 1));
  const totalWeight = matricesWithWeights.reduce((s, m) => s + m.weight, 0) || 1;
  const out = [];
  for (let h = 0; h <= maxH; h++) {
    out[h] = [];
    for (let a = 0; a <= maxA; a++) {
      let sum = 0;
      for (const { matrix, weight } of matricesWithWeights) {
        const row = matrix[h];
        const v = row ? row[a] : undefined;
        if (v != null) sum += v * weight;
      }
      out[h][a] = sum / totalWeight;
    }
  }
  const total = out.reduce((s, row) => s + row.reduce((rs, v) => rs + v, 0), 0);
  if (total > 0) {
    for (let h = 0; h <= maxH; h++) for (let a = 0; a <= maxA; a++) out[h][a] /= total;
  }
  return out;
}

// Derive TOUTES les familles de marches buts listees au §8.1 depuis une
// seule matrice P(h,a). Les probabilites sont retournees en decimal [0,1]
// (pas de *100/Math.round ici — l'arrondi/affichage est une responsabilite
// de la couche presentation, pas du calcul).
function deriveMarketsFromMatrix(matrix) {
  const maxH = matrix.length - 1;
  const maxA = matrix[0].length - 1;

  let p1 = 0, pN = 0, p2 = 0;
  let bttsYes = 0, bttsNo = 0;
  let homeCleanSheet = 0, awayCleanSheet = 0;
  let homeWinToNil = 0, awayWinToNil = 0;
  const overUnderLines = [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
  const overSums = {}; overUnderLines.forEach((l) => { overSums[l] = 0; });
  const homeTotalLines = [0.5, 1.5, 2.5, 3.5];
  const homeTotalOver = {}; homeTotalLines.forEach((l) => { homeTotalOver[l] = 0; });
  const awayTotalOver = {}; homeTotalLines.forEach((l) => { awayTotalOver[l] = 0; });
  const exactScores = {};
  const bands = { "0-1": 0, "2-3": 0, "4-5": 0, "6+": 0 };
  const resultTotals = {
    home: { over1_5: 0, over2_5: 0, over3_5: 0, under2_5: 0, under3_5: 0 },
    away: { over1_5: 0, over2_5: 0, over3_5: 0, under2_5: 0, under3_5: 0 },
  };

  for (let h = 0; h <= maxH; h++) {
    for (let a = 0; a <= maxA; a++) {
      const p = matrix[h][a] || 0;
      const total = h + a;
      if (h > a) p1 += p; else if (h === a) pN += p; else p2 += p;
      if (h > 0 && a > 0) bttsYes += p; else bttsNo += p;
      if (a === 0) homeCleanSheet += p;
      if (h === 0) awayCleanSheet += p;
      if (a === 0 && h > 0) homeWinToNil += p;
      if (h === 0 && a > 0) awayWinToNil += p;
      overUnderLines.forEach((l) => { if (total > l) overSums[l] += p; });
      homeTotalLines.forEach((l) => { if (h > l) homeTotalOver[l] += p; });
      homeTotalLines.forEach((l) => { if (a > l) awayTotalOver[l] += p; });
      if (h <= 4 && a <= 4) exactScores[h + "-" + a] = (exactScores[h + "-" + a] || 0) + p;
      if (total <= 1) bands["0-1"] += p;
      else if (total <= 3) bands["2-3"] += p;
      else if (total <= 5) bands["4-5"] += p;
      else bands["6+"] += p;
      const winningSide = h > a ? resultTotals.home : (a > h ? resultTotals.away : null);
      if (winningSide) {
        if (total > 1.5) winningSide.over1_5 += p;
        if (total > 2.5) winningSide.over2_5 += p;
        if (total > 3.5) winningSide.over3_5 += p;
        if (total < 2.5) winningSide.under2_5 += p;
        if (total < 3.5) winningSide.under3_5 += p;
      }
    }
  }

  const exactScoreSum = Object.values(exactScores).reduce((s, v) => s + v, 0);
  exactScores["Other"] = Math.max(0, 1 - exactScoreSum);

  const overUnder = {};
  overUnderLines.forEach((l) => { overUnder[l] = { over: overSums[l], under: 1 - overSums[l] }; });
  const homeTotals = {};
  homeTotalLines.forEach((l) => { homeTotals[l] = { over: homeTotalOver[l], under: 1 - homeTotalOver[l] }; });
  const awayTotals = {};
  homeTotalLines.forEach((l) => { awayTotals[l] = { over: awayTotalOver[l], under: 1 - awayTotalOver[l] }; });

  // Double Chance et Draw No Bet : triviaux depuis p1/pN/p2, pas de nouveau
  // modele (MASTER V2.1 §10.V "deriver sans modeles independants inutiles").
  const doubleChance = { oneX: p1 + pN, xTwo: pN + p2, oneTwo: p1 + p2 };
  const p1p2 = p1 + p2;
  const drawNoBet = p1p2 > 0 ? { home: p1 / p1p2, away: p2 / p1p2 } : { home: 0.5, away: 0.5 };

  return {
    p1, pN, p2,
    doubleChance,
    drawNoBet,
    btts: { yes: bttsYes, no: bttsNo },
    overUnder,
    teamTotals: { home: homeTotals, away: awayTotals },
    cleanSheet: { home: homeCleanSheet, away: awayCleanSheet },
    winToNil: { home: homeWinToNil, away: awayWinToNil },
    exactScore: exactScores,
    goalBands: bands,
    resultTotals,
  };
}

module.exports = { buildPoissonMatrix, buildDixonColesMatrix, blendMatrices, deriveMarketsFromMatrix };
