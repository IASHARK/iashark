"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 5 (couche AUXILIAIRE).
// shots/SOT ne sont JAMAIS impute a 0 quand absents (null != 0, voir
// PLAYER LAB PILOT DATA GATE). Quand observes, ajustent la propension
// core via un multiplicateur de conversion shrinke (meme discipline de
// prior fixe que core-rate-model.js). Quand absents : le posterior
// core est utilise SANS ajustement - jamais une baisse artificielle
// pour donnee manquante (marginalisation = ne pas appliquer ce facteur,
// pas une imputation).

const PRIOR_STRENGTH_SOT = 20; // pseudo-tirs cadres de confiance du prior

function fitConversionPriors(trainRows, positionGroupFn) {
  const totals = new Map();
  for (const r of trainRows) {
    if (r.shots_on_target == null || !(r.minutes > 0)) continue;
    const g = positionGroupFn(r.position);
    if (!totals.has(g)) totals.set(g, { goals: 0, sot: 0 });
    const t = totals.get(g);
    t.goals += r.goals || 0;
    t.sot += r.shots_on_target;
  }
  const priors = new Map();
  for (const [g, t] of totals) {
    priors.set(g, { mean_conversion: t.sot > 0 ? t.goals / t.sot : 0, n_sot: t.sot });
  }
  return priors;
}

// playerGoals/playerSot : historique anterieur (memes regles anti-fuite
// que core-rate-model.js). Retourne null si aucune donnee shots/SOT
// dans l'historique - jamais une valeur fabriquee.
function posteriorConversion(playerGoals, playerSot, groupPrior) {
  if (playerSot == null) return null;
  const shrunkGoals = groupPrior.mean_conversion * PRIOR_STRENGTH_SOT + playerGoals;
  const shrunkSot = PRIOR_STRENGTH_SOT + playerSot;
  return { conversion: shrunkGoals / shrunkSot };
}

// Applique le multiplicateur shots-layer AU posterior core rate. Si
// playerSot est null (pas de donnee), retourne coreRateMean INCHANGE.
function applyShotsAdjustment(coreRateMean, playerGoals, playerSot, groupPrior) {
  const posterior = posteriorConversion(playerGoals, playerSot, groupPrior);
  if (!posterior || groupPrior.mean_conversion <= 0) return coreRateMean;
  return coreRateMean * (posterior.conversion / groupPrior.mean_conversion);
}

module.exports = { fitConversionPriors, posteriorConversion, applyShotsAdjustment, PRIOR_STRENGTH_SOT };
