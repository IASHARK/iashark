"use strict";
// MARKET LAB - PHASE 2.5 (2026-09-05), item 10. Snapshot du modele M2
// IMMUABLE et VERSIONNE, a persister au MEME moment qu'une collecte de
// cotes forward - pour ne jamais, plusieurs semaines plus tard,
// recalculer silencieusement le passe avec une version differente du
// moteur (le champion pourrait changer entre-temps, ce snapshot fige
// ce qui a REELLEMENT tourne a cet instant).

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key]));
    Object.freeze(value);
  }
  return value;
}

function buildModelSnapshot({ fixtureId, capturedAt, modelVersion, lambdaH, lambdaA, sourceMatrixHash, marketCatalogue }) {
  return deepFreeze({
    fixture_id: fixtureId,
    captured_at: capturedAt,
    model_version: modelVersion,
    lambda_h: lambdaH,
    lambda_a: lambdaA,
    source_matrix_hash: sourceMatrixHash,
    market_catalogue: marketCatalogue,
  });
}

module.exports = { buildModelSnapshot, deepFreeze };
