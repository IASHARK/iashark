"use strict";
// PLAYER SCORER V2 (2026-09-05), item 17. Simulation Monte Carlo
// JOINTE par fixture (les deux equipes dans le MEME flux RNG
// deterministe) :
//   1. tire (G_H,G_A) depuis la matrice M2 COMPLETE (tirage categoriel
//      2D, pas seulement les marginales) ;
//   2. pour chaque but credite a une equipe : tire son type
//      (own-goal/penalty/open-play) puis sa minute (goal-clock du
//      cote credite) ;
//   3. simule le processus de substitution de l'equipe (paire stricte
//      1 OUT -> 1 IN, cardinal du terrain toujours preserve) pour
//      connaitre le risk-set exact a cette minute ;
//   4. attribue le but (open-play: softmax(eta) sur R ; penalty:
//      P_pen(i|R) ; own-goal: aucun joueur credite).
// Seed = entier deterministe derive de SHA256(fixture_id+model_version+
// input_hash) par l'appelant - meme input => sortie byte-identique.

const { mulberry32 } = require("../../models.js");
const { attributeOpenPlayGoal } = require("./attribution-v2.js");
const { penaltyTakerDistribution } = require("./penalty-model.js");
const { scoreProbabilityForScenario } = require("./anytime-probability.js");

function sampleGoalsFromMatrix(matrix, rng) {
  const u = rng();
  let cumulative = 0;
  for (let h = 0; h < matrix.length; h++) {
    for (let a = 0; a < matrix[h].length; a++) {
      cumulative += matrix[h][a];
      if (u <= cumulative) return { h, a };
    }
  }
  const last = matrix.length - 1;
  return { h: last, a: matrix[last].length - 1 };
}

function sampleFromDistribution(distributionArray, valueFn, rng) {
  const u = rng();
  let cumulative = 0;
  for (const item of distributionArray) {
    cumulative += item.probability;
    if (u <= cumulative) return valueFn(item);
  }
  return valueFn(distributionArray[distributionArray.length - 1]);
}

function sampleBinFromDistribution(binProbs, rng) {
  const u = rng();
  let cumulative = 0;
  for (let i = 0; i < binProbs.length; i++) {
    cumulative += binProbs[i];
    if (u <= cumulative) return i;
  }
  return binProbs.length - 1;
}

// minute uniforme DANS le bin tire (5 min de large) - granularite du
// modele, jamais un timing plus fin que le bin lui-meme.
function sampleMinuteFromBinnedDistribution(binProbs, rng) {
  const bin = sampleBinFromDistribution(binProbs, rng);
  return bin * 5 + rng() * 5;
}

function drawSubstitutionTimeline(startingXI, bench, positionByPlayer, substitutionModel, rng) {
  const nSubs = sampleFromDistribution(substitutionModel.count_distribution, (item) => item.n_substitutions, rng);
  const changes = [];
  const onFieldStarters = new Set(startingXI);
  const availableBench = new Set(bench);

  function pickWeightedByPosition(candidateIds, positionDist) {
    if (!candidateIds.length) return null;
    const positions = [...positionDist.entries()];
    if (positions.length) {
      const u = rng();
      let cumulative = 0, chosenPos = null;
      for (const [pos, p] of positions) { cumulative += p; if (u <= cumulative) { chosenPos = pos; break; } }
      const matching = candidateIds.filter((id) => positionByPlayer.get(id) === chosenPos);
      if (matching.length) return matching[Math.floor(rng() * matching.length)];
    }
    return candidateIds[Math.floor(rng() * candidateIds.length)];
  }

  for (let k = 0; k < nSubs; k++) {
    const minute = sampleMinuteFromBinnedDistribution(substitutionModel.minute_distribution, rng);
    const starterIds = [...onFieldStarters];
    const benchIds = [...availableBench];
    if (!starterIds.length || !benchIds.length) break; // plus personne a substituer - arret propre
    const playerOut = pickWeightedByPosition(starterIds, substitutionModel.out_position_distribution);
    const playerIn = pickWeightedByPosition(benchIds, substitutionModel.in_position_distribution);
    if (playerOut == null || playerIn == null) break;
    onFieldStarters.delete(playerOut);
    availableBench.delete(playerIn);
    onFieldStarters.add(playerIn); // 1 OUT -> 1 IN strict, cardinal du terrain preserve
    changes.push({ minute, playerOut, playerIn });
  }
  changes.sort((a, b) => a.minute - b.minute);
  return changes;
}

function playersOnFieldAt(startingXI, changes, minute) {
  const onField = new Set(startingXI);
  for (const c of changes) {
    if (c.minute > minute) break;
    onField.delete(c.playerOut);
    onField.add(c.playerIn);
  }
  return onField;
}

// teamConfig = { startingXI, bench, positionByPlayer, etaByPlayer,
// substitutionModel, goalClock (18 bins), penaltyTakerCounts (Map ou
// null) }.
function simulateTeamGoalsForDraw(teamConfig, nGoalsCredited, omegaOwn, omegaPen, rng) {
  const substitutionChanges = drawSubstitutionTimeline(teamConfig.startingXI, teamConfig.bench, teamConfig.positionByPlayer, teamConfig.substitutionModel, rng);
  const allPlayerIds = [...teamConfig.startingXI, ...teamConfig.bench];
  const perGoalSharesByPlayer = new Map(allPlayerIds.map((id) => [id, []]));

  for (let g = 0; g < nGoalsCredited; g++) {
    const isOwnGoal = rng() < omegaOwn;
    if (isOwnGoal) continue; // credite a cette equipe mais marque par l'adversaire - aucun joueur de CETTE equipe credite
    const isPenalty = rng() < omegaPen;
    const minute = sampleMinuteFromBinnedDistribution(teamConfig.goalClock, rng);
    const onField = [...playersOnFieldAt(teamConfig.startingXI, substitutionChanges, minute)];
    if (!onField.length) continue; // garde de securite, etat degenere impossible en pratique

    let shares;
    if (isPenalty && teamConfig.penaltyTakerCounts) {
      shares = penaltyTakerDistribution(teamConfig.penaltyTakerCounts, onField);
    } else {
      const etaValues = onField.map((id) => teamConfig.etaByPlayer.get(id) || 0);
      shares = attributeOpenPlayGoal(onField, etaValues);
    }
    for (const id of allPlayerIds) perGoalSharesByPlayer.get(id).push(shares.get(id) || 0);
  }

  const result = new Map();
  for (const [id, shares] of perGoalSharesByPlayer) result.set(id, scoreProbabilityForScenario(shares));
  return result;
}

function simulateMatchV2(matrix, homeConfig, awayConfig, omegaOwn, omegaPen, nDraws, seed) {
  const rng = mulberry32(seed);
  const allIds = [...homeConfig.startingXI, ...homeConfig.bench, ...awayConfig.startingXI, ...awayConfig.bench];
  const drawsByPlayer = new Map(allIds.map((id) => [id, []]));

  for (let s = 0; s < nDraws; s++) {
    const { h, a } = sampleGoalsFromMatrix(matrix, rng);
    const homeResult = simulateTeamGoalsForDraw(homeConfig, h, omegaOwn, omegaPen, rng);
    const awayResult = simulateTeamGoalsForDraw(awayConfig, a, omegaOwn, omegaPen, rng);
    for (const [id, p] of homeResult) drawsByPlayer.get(id).push(p);
    for (const [id, p] of awayResult) drawsByPlayer.get(id).push(p);
  }

  const results = [];
  for (const [player_id, draws] of drawsByPlayer) {
    const sorted = draws.slice().sort((a, b) => a - b);
    const quantile = (p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    const variance = draws.reduce((s, v) => s + (v - mean) * (v - mean), 0) / draws.length;
    results.push({ player_id, posterior_mean: mean, p10: quantile(0.10), p50: quantile(0.50), p90: quantile(0.90), sd: Math.sqrt(variance), n_draws: draws.length });
  }
  return results;
}

module.exports = { sampleGoalsFromMatrix, drawSubstitutionTimeline, playersOnFieldAt, simulateTeamGoalsForDraw, simulateMatchV2 };
