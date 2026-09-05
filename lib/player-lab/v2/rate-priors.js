"use strict";
// PLAYER SCORER V2 (2026-09-05), items 5-7. Trois signaux bayesiens
// conjugues, chacun sur les observations REELLEMENT presentes
// uniquement (NULL != 0, jamais impute) :
//   - Goals (open-play, non-penalty) : r_i ~ Gamma(a_p,b_p), meme
//     conjugaison que V1 (lib/player-lab/core-rate-model.js), reimplementee
//     ici en V2 car V1 "reste intact" (non modifie) et sa fonction
//     agrege TOUS les buts (y compris penalty) - V2 a besoin du signal
//     open-play seul pour eta_i.
//   - Shots : lambda_shot_i ~ Gamma(aShot_p,bShot_p), Poisson sur les
//     lignes ou shots != null uniquement.
//   - SOT : q_i ~ Beta(aSOT_p,bSOT_p), Binomial(Shots,q) sur les lignes
//     ou shots ET shots_on_target sont TOUS DEUX observes.
//
// X_goal_i = log(E[r_i|data]+eps) ; X_shot_i = log(E[lambda_shot_i]+eps) ;
// X_sot_i = logit(E[q_i]). Peu de donnees => posterior proche du prior
// de position (memes disciplines de shrinkage que V1).

const EPS = 1e-6;
const PRIOR_STRENGTH_GOALS_MATCHES90 = 10;
const PRIOR_STRENGTH_SHOTS_MATCHES90 = 10;
const PRIOR_STRENGTH_SOT_SHOTS = 15; // pseudo-tirs de confiance du prior de conversion

function fitGoalRatePriors(trainRowsOpenPlayGoalsOnly, positionGroupFn) {
  const totals = new Map();
  for (const r of trainRowsOpenPlayGoalsOnly) {
    if (!(r.minutes > 0)) continue;
    const g = positionGroupFn(r.position);
    if (!totals.has(g)) totals.set(g, { goals: 0, minutes90: 0 });
    const t = totals.get(g);
    t.goals += r.open_play_goals || 0;
    t.minutes90 += r.minutes / 90;
  }
  const priors = new Map();
  for (const [g, t] of totals) {
    const mean = t.minutes90 > 0 ? t.goals / t.minutes90 : 0;
    priors.set(g, { alpha: mean * PRIOR_STRENGTH_GOALS_MATCHES90, beta: PRIOR_STRENGTH_GOALS_MATCHES90, mean_rate_per_90: mean });
  }
  return priors;
}

function posteriorGoalRate(openPlayGoals, minutes90, prior) {
  const alphaPost = prior.alpha + openPlayGoals;
  const betaPost = prior.beta + minutes90;
  return { alpha: alphaPost, beta: betaPost, mean: alphaPost / betaPost };
}

function fitShotRatePriors(trainRows, positionGroupFn) {
  const totals = new Map();
  for (const r of trainRows) {
    if (r.shots == null || !(r.minutes > 0)) continue;
    const g = positionGroupFn(r.position);
    if (!totals.has(g)) totals.set(g, { shots: 0, minutes90: 0 });
    const t = totals.get(g);
    t.shots += r.shots;
    t.minutes90 += r.minutes / 90;
  }
  const priors = new Map();
  for (const [g, t] of totals) {
    const mean = t.minutes90 > 0 ? t.shots / t.minutes90 : 0;
    priors.set(g, { alpha: mean * PRIOR_STRENGTH_SHOTS_MATCHES90, beta: PRIOR_STRENGTH_SHOTS_MATCHES90, mean_rate_per_90: mean });
  }
  return priors;
}

// shotsHistory/minutes90 : uniquement les lignes ou shots != null
// (deja filtrees par l'appelant). Retourne le prior seul (mean egal a
// prior.mean_rate_per_90) si aucune observation - jamais 0 fabrique.
function posteriorShotRate(shotsObserved, minutes90Observed, prior) {
  const alphaPost = prior.alpha + shotsObserved;
  const betaPost = prior.beta + minutes90Observed;
  return { alpha: alphaPost, beta: betaPost, mean: alphaPost / betaPost };
}

function fitSotConversionPriors(trainRows, positionGroupFn) {
  const totals = new Map();
  for (const r of trainRows) {
    if (r.shots == null || r.shots_on_target == null) continue;
    const g = positionGroupFn(r.position);
    if (!totals.has(g)) totals.set(g, { sot: 0, shots: 0 });
    const t = totals.get(g);
    t.sot += r.shots_on_target;
    t.shots += r.shots;
  }
  const priors = new Map();
  for (const [g, t] of totals) {
    const mean = t.shots > 0 ? t.sot / t.shots : 0;
    priors.set(g, { a: mean * PRIOR_STRENGTH_SOT_SHOTS, b: (1 - mean) * PRIOR_STRENGTH_SOT_SHOTS, mean_conversion: mean });
  }
  return priors;
}

// sotObserved/shotsObserved : uniquement quand shots ET sot connus
// (l'appelant filtre). Retourne null si jamais observe (l'appelant
// utilise alors le prior de groupe directement - jamais un 0 fabrique).
function posteriorSotConversion(sotObserved, shotsObserved, prior) {
  if (shotsObserved == null || sotObserved == null) return null;
  const aPost = prior.a + sotObserved;
  const bPost = prior.b + (shotsObserved - sotObserved);
  return { a: aPost, b: bPost, mean: aPost / (aPost + bPost) };
}

function logit(p) {
  const c = Math.min(Math.max(p, EPS), 1 - EPS);
  return Math.log(c / (1 - c));
}

module.exports = {
  EPS,
  fitGoalRatePriors, posteriorGoalRate,
  fitShotRatePriors, posteriorShotRate,
  fitSotConversionPriors, posteriorSotConversion,
  logit,
  PRIOR_STRENGTH_GOALS_MATCHES90, PRIOR_STRENGTH_SHOTS_MATCHES90, PRIOR_STRENGTH_SOT_SHOTS,
};
