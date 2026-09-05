"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 12. Echantillonneur Gamma
// (Marsaglia & Tsang, 2000) sur un flux uniforme DETERMINISTE
// (lib/models.js#mulberry32, reutilise tel quel, jamais reimplemente) -
// necessaire pour tirer des posterior draws lambda_i ~ Gamma(alpha,beta)
// du modele bayesien joueur (core-rate-model.js). Aucun echantillonneur
// Gamma n'existait dans ce codebase - implementation standard, VALIDEE
// empiriquement (moyenne/variance sur un grand nombre de tirages,
// tests/player-lab-scorer-engine.test.js) plutot que supposee correcte.

function sampleStandardNormal(rng) {
  let u1 = 0;
  while (u1 === 0) u1 = rng(); // evite log(0)
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// Gamma(alpha, 1) - Marsaglia-Tsang, alpha > 0.
function sampleGamma1(alpha, rng) {
  if (alpha < 1) {
    const u = rng();
    return sampleGamma1(alpha + 1, rng) * Math.pow(u, 1 / alpha);
  }
  const d = alpha - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do {
      x = sampleStandardNormal(rng);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

// Gamma(alpha, beta) convention "taux" (E[X]=alpha/beta) - utilisee
// partout dans lib/player-lab.
function sampleGamma(alpha, beta, rng) {
  if (alpha <= 0 || beta <= 0) return 0;
  return sampleGamma1(alpha, rng) / beta;
}

module.exports = { sampleGamma, sampleGamma1, sampleStandardNormal };
