"use strict";
// EXP-002 item 1 (audit prealable, 2026-09-05) - confirme par test de
// CONTRAT que la regle REELLEMENT implementee dans
// lib/markets/early-season.js#blendEarlySeasonRate (deja EN PRODUCTION,
// .github/workflows/update-data.yml, MODEL_VERSION='score-matrix-dc-early-season-v2')
// est exactement :
//   prior_weight(n) = max(0, 8 - 0.5*n)
// ou n = nombre de matchs DE LA SAISON COURANTE deja joues par l'equipe
// avant le match a predire (`current.matches`). Le prior ne disparait
// donc PAS a 8 matchs (poids encore a 4) - il disparait a 16 matchs
// (poids exactement 0), pas avant.
//
// Test indirect via blendEarlySeasonRate#previousEquivalentMatches (la
// fonction n'expose pas prior_weight(n) brut comme fonction separee) :
// previous.matches est fixe a 38 (une saison complete) pour que le
// plafond Math.min(previous.matches, decayingPrior) ne joue JAMAIS
// (decayingPrior <= 8 <= 38 sur toute la plage testee), isolant
// exactement prior_weight(n).

const test = require("node:test");
const assert = require("node:assert/strict");
const { blendEarlySeasonRate } = require("../lib/markets/early-season.js");

function priorWeightViaBlend(n) {
  const result = blendEarlySeasonRate({
    current: { events: 0, matches: n },
    previous: { events: 38, matches: 38 }, // saison complete, ne plafonne jamais le prior sur n<=16
    leaguePrior: { rate: 1.35, equivalentMatches: 6 },
  });
  return result.previousEquivalentMatches;
}

const CONTRACT_CASES = [
  [0, 8],
  [4, 6],
  [8, 4],
  [12, 2],
  [16, 0],
];

for (const [n, expectedWeight] of CONTRACT_CASES) {
  test(`prior_weight(n=${n}) = max(0, 8 - 0.5*${n}) = ${expectedWeight}`, () => {
    const weight = priorWeightViaBlend(n);
    assert.equal(weight, expectedWeight, `prior_weight(${n})=${weight}, attendu ${expectedWeight}`);
  });
}

test("le prior ne disparait PAS a 8 matchs - poids encore a 4 (moitie du poids initial)", () => {
  assert.equal(priorWeightViaBlend(8), 4);
  assert.notEqual(priorWeightViaBlend(8), 0);
});

test("le prior disparait EXACTEMENT a 16 matchs, jamais avant, jamais negatif au-dela", () => {
  assert.equal(priorWeightViaBlend(16), 0);
  assert.equal(priorWeightViaBlend(20), 0, "max(0, 8-10)=max(0,-2)=0, jamais negatif");
  assert.equal(priorWeightViaBlend(15), 0.5, "juste avant 16 : poids encore strictement positif");
});

test("previousEquivalentMatches est plafonne par previous.matches reellement disponible (equipe promue avec peu d'historique)", () => {
  // Une equipe avec seulement 3 matchs d'historique "saison precedente"
  // (ex: promue en cours d'audit synthetique) ne peut pas fournir plus
  // de 3 matchs-equivalents de prior, meme si prior_weight(n) en demande 8.
  const result = blendEarlySeasonRate({
    current: { events: 0, matches: 0 },
    previous: { events: 5, matches: 3 },
    leaguePrior: { rate: 1.35, equivalentMatches: 6 },
  });
  assert.equal(result.previousEquivalentMatches, 3, "plafonne a previous.matches=3, pas au prior_weight(0)=8 brut");
});
