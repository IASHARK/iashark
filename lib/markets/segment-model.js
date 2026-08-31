"use strict";

const { buildPoissonMatrix, deriveMarketsFromMatrix } = require("./score-matrix.js");

function clampShare(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0.32, Math.min(0.56, n)) : 0.44;
}

function estimateFirstHalfShare(input) {
  input = input || {};
  if (Number(input.sampleMatches) < 5) return null;
  const own = input.forSlots || [], opponent = input.opponentAgainstSlots || [];
  const counts = [];
  for (let i = 0; i < 6; i++) counts.push(Number((own[i] && own[i].n) || 0) + Number((opponent[i] && opponent[i].n) || 0));
  const observed = counts.reduce((a, b) => a + b, 0);
  if (observed < 5) return null;
  const first = counts.slice(0, 3).reduce((a, b) => a + b, 0);
  const priorShare = 0.44, priorEquivalentGoals = 20;
  return clampShare((first + priorShare * priorEquivalentGoals) / (observed + priorEquivalentGoals));
}

function buildSegmentMarkets(input) {
  input = input || {};
  if (input.lambdaHome == null || input.lambdaAway == null) return null;
  const lambdaHome = Number(input.lambdaHome);
  const lambdaAway = Number(input.lambdaAway);
  if (!Number.isFinite(lambdaHome) || !Number.isFinite(lambdaAway) || lambdaHome < 0 || lambdaAway < 0) return null;
  const homeShare = clampShare(input.homeFirstHalfShare);
  const awayShare = clampShare(input.awayFirstHalfShare);
  const first = deriveMarketsFromMatrix(buildPoissonMatrix(lambdaHome * homeShare, lambdaAway * awayShare, 8));
  const second = deriveMarketsFromMatrix(buildPoissonMatrix(lambdaHome * (1 - homeShare), lambdaAway * (1 - awayShare), 8));
  return {
    firstHalf: {
      over05: first.overUnder[0.5].over,
      under05: first.overUnder[0.5].under,
      over15: first.overUnder[1.5].over,
      under15: first.overUnder[1.5].under,
      homeWin: first.p1,
      awayWin: first.p2,
    },
    secondHalf: { homeWin: second.p1, awayWin: second.p2 },
    // Independent Poisson increments between halves: explicit baseline,
    // only activated when a real bookmaker quote exists.
    winBothHalves: { home: first.p1 * second.p1, away: first.p2 * second.p2 },
  };
}

module.exports = { buildSegmentMarkets, estimateFirstHalfShare };
