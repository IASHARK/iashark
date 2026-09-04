"use strict";
// GATE C3 (SPEC LAB PRO v1.0) - bornes mathematiques valides de rho,
// deduites des 4 contraintes de positivite du tau Dixon-Coles
// (lib/models.js#dixonColesCorr), PAS un intervalle arbitraire [-1,1].
//
// tau(0,0) = 1 - lambdaH*lambdaA*rho > 0  =>  rho < 1/(lambdaH*lambdaA)          [lambdaH*lambdaA > 0 toujours, car lambda>0]
// tau(1,0) = 1 + lambdaA*rho > 0          =>  rho > -1/lambdaA
// tau(0,1) = 1 + lambdaH*rho > 0          =>  rho > -1/lambdaH
// tau(1,1) = 1 - rho > 0                  =>  rho < 1
//
// Pour UN match : lower = max(-1/lambdaA, -1/lambdaH), upper = min(1/(lambdaH*lambdaA), 1).
// Pour un ENSEMBLE de matchs TRAIN : intersection sur tous les matchs -
// lower = max des lower individuels, upper = min des upper individuels.

function boundsForSingleMatch(lambdaH, lambdaA) {
  if (!(lambdaH > 0) || !(lambdaA > 0)) return null;
  const lower = Math.max(-1 / lambdaA, -1 / lambdaH);
  const upper = Math.min(1 / (lambdaH * lambdaA), 1);
  return { lower, upper };
}

// pairs : [{lambdaH, lambdaA}, ...] - typiquement tous les matchs du TRAIN
// d'un cutoff donne. Retourne l'intersection des bornes valides, ou
// { valid: false, reason: 'FIT_INVALID_CONSTRAINTS' } si l'intersection
// est vide (lower >= upper).
function deriveRhoBounds(pairs) {
  if (!pairs || !pairs.length) {
    return { valid: false, reason: "FIT_INVALID_CONSTRAINTS", detail: "aucune paire lambda fournie" };
  }
  let lower = -Infinity, upper = Infinity;
  for (const { lambdaH, lambdaA } of pairs) {
    const b = boundsForSingleMatch(lambdaH, lambdaA);
    if (!b) return { valid: false, reason: "FIT_INVALID_CONSTRAINTS", detail: `lambda invalide (lambdaH=${lambdaH}, lambdaA=${lambdaA})` };
    lower = Math.max(lower, b.lower);
    upper = Math.min(upper, b.upper);
  }
  if (lower >= upper) {
    return { valid: false, reason: "FIT_INVALID_CONSTRAINTS", lower, upper, detail: "intersection vide sur l'ensemble TRAIN" };
  }
  return { valid: true, lower, upper };
}

module.exports = { boundsForSingleMatch, deriveRhoBounds };
