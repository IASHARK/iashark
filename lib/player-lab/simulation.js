"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 12. Simulation Monte
// Carlo DETERMINISTE (seed versionnee, lib/models.js#mulberry32
// reutilise tel quel, jamais reimplemente) - tire JOINTEMENT, pour
// chaque scenario s, un vecteur de parts (une par joueur candidat de
// l'equipe) respectant l'invariant sum(shares)+own_goal_share=1 A
// CHAQUE TIRAGE (jamais seulement en moyenne).

const { mulberry32 } = require("../models.js");
const { sampleGamma } = require("./gamma-sampler.js");
const { normalizeAttributionShares } = require("./attribution.js");
const { scoreProbabilityGivenShare } = require("./scoring-formula.js");

// candidates = [{ player_id, gamma_alpha, gamma_beta, presence_mass }] -
// gamma_alpha/beta = posterior core rate (deja ajuste shots-layer, voir
// buildCandidateGammaParams). presence_mass = poids de presence-au-but
// (goal-timing.js#presenceMassForGoal), dans [0,1].
function drawScenario(candidates, ownGoalMass, rng) {
  const rawScores = candidates.map((c) => ({
    player_id: c.player_id,
    score: sampleGamma(c.gamma_alpha, c.gamma_beta, rng) * c.presence_mass,
  }));
  return normalizeAttributionShares(rawScores, ownGoalMass);
}

// Ajuste beta pour que alpha/beta_adjusted = adjustedMean, en gardant
// alpha (la forme/precision) inchange - meme discipline documentee que
// shots-layer.js#applyShotsAdjustment (preserve l'incertitude relative
// du posterior core, deplace seulement sa moyenne).
function buildCandidateGammaParams(corePosterior, adjustedMean) {
  if (!(adjustedMean > 0) || !(corePosterior.alpha > 0)) return { alpha: corePosterior.alpha, beta: corePosterior.beta };
  return { alpha: corePosterior.alpha, beta: corePosterior.alpha / adjustedMean };
}

// teamGoalDist = p_T(n) (team-goal-distribution.js). nDraws = nombre de
// scenarios s. seed = entier deterministe.
function simulateAnytimeScorer(candidates, ownGoalMass, teamGoalDist, nDraws, seed) {
  const rng = mulberry32(seed);
  const perPlayerDraws = new Map(candidates.map((c) => [c.player_id, []]));

  for (let s = 0; s < nDraws; s++) {
    const scenario = drawScenario(candidates, ownGoalMass, rng);
    for (const { player_id, share } of scenario.shares) {
      perPlayerDraws.get(player_id).push(scoreProbabilityGivenShare(teamGoalDist, share));
    }
  }

  const results = [];
  for (const [player_id, draws] of perPlayerDraws) {
    const sorted = draws.slice().sort((a, b) => a - b);
    const quantile = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    results.push({ player_id, posterior_mean: mean, p10: quantile(0.10), p50: quantile(0.50), p90: quantile(0.90), n_draws: draws.length });
  }
  return results;
}

module.exports = { drawScenario, buildCandidateGammaParams, simulateAnytimeScorer };
