"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 5. Propension "core" =
// taux de but par 90 minutes, estimee par SHRINKAGE bayesien conjugue
// Gamma-Poisson vers un prior de POSITION - jamais goals/90 brut.
//
// Modele : lambda_i ~ Gamma(alpha_g, beta_g) [prior du groupe de
// position g, ajuste sur TRAIN uniquement] ; goals_i | lambda_i,
// minutes_i ~ Poisson(lambda_i * minutes_i/90). Posterior conjugue
// EXACT (forme fermee, aucune MCMC necessaire) :
//   alpha_post = alpha_g + goals_i
//   beta_post  = beta_g  + minutes_i/90
//
// Force du prior : PRIOR_STRENGTH_MATCHES90 fixe la "confiance" du
// prior en unites de matchs complets (90 min) - un choix de
// modelisation EXPLICITE (equivalent a un lissage add-k generalise),
// choisi plutot qu'une estimation de variance instable sur une
// population ou la plupart des joueurs marquent 0 but sur un
// echantillon reduit. alpha_g est calibre pour que alpha_g/beta_g =
// taux moyen REEL du groupe (TRAIN uniquement, jamais invente).

const PRIOR_STRENGTH_MATCHES90 = 10;

// trainRows : lignes PLAYER_MATCH de la saison TRAIN uniquement,
// PLAYED (minutes>0). positionGroupFn : position-policy.js#resolvePositionGroup.
function fitPositionRatePriors(trainRows, positionGroupFn) {
  const totals = new Map(); // group -> {goals, minutes90}
  for (const r of trainRows) {
    if (!(r.minutes > 0)) continue;
    const g = positionGroupFn(r.position);
    if (!totals.has(g)) totals.set(g, { goals: 0, minutes90: 0 });
    const t = totals.get(g);
    t.goals += r.goals || 0;
    t.minutes90 += r.minutes / 90;
  }
  const priors = new Map();
  for (const [g, t] of totals) {
    const meanRate = t.minutes90 > 0 ? t.goals / t.minutes90 : 0;
    const beta = PRIOR_STRENGTH_MATCHES90;
    const alpha = meanRate * beta;
    priors.set(g, { alpha, beta, mean_rate_per_90: meanRate, n_observations_minutes90: t.minutes90 });
  }
  return priors;
}

// playerGoals/playerMinutes90 : historique STRICTEMENT anterieur au
// cutoff du match cible (voir anti-leakage.js#reconstructFeaturesBeforeCutoff).
function posteriorCoreRate(playerGoals, playerMinutes90, prior) {
  const alphaPost = prior.alpha + playerGoals;
  const betaPost = prior.beta + playerMinutes90;
  return { alpha: alphaPost, beta: betaPost, mean_rate_per_90: alphaPost / betaPost };
}

module.exports = { fitPositionRatePriors, posteriorCoreRate, PRIOR_STRENGTH_MATCHES90 };
