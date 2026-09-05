"use strict";
// PLAYER SCORER ENGINE V1 (2026-09-05), item 14. Trois baselines
// OBLIGATOIRES pour la future comparaison OOS (pas encore executee -
// voir items 16-17, STOP avant tout resultat OOS). L'ancien
// player-engine-v1 (lib/markets/player-engine.js) reste INCHANGE, tag
// LEGACY_PLAYER_MODEL, utilise ici UNIQUEMENT comme comparateur externe.

const LEGACY_PLAYER_MODEL = "LEGACY_PLAYER_MODEL";

// A. Plus haut goals/90 historique, shrinkage SIMPLE (add-k basique,
// deliberement PLUS NAIF que core-rate-model.js#fitPositionRatePriors -
// une baseline doit etre plus simple que le modele teste, jamais une
// variante deguisee du meme modele).
const BASELINE_A_PSEUDO_MATCHES90 = 3;
function baselineA_simpleShrunkRate(rowsBeforeCutoff, leagueMeanRatePer90) {
  const goals = rowsBeforeCutoff.reduce((s, r) => s + (r.goals || 0), 0);
  const minutes90 = rowsBeforeCutoff.reduce((s, r) => s + (r.minutes || 0), 0) / 90;
  return (goals + leagueMeanRatePer90 * BASELINE_A_PSEUDO_MATCHES90) / (minutes90 + BASELINE_A_PSEUDO_MATCHES90);
}

// B. Plus haute part historique des buts de SON EQUIPE - ignore
// entierement M2/timing/exposition, un pur ranking descriptif.
function baselineB_teamGoalShare(playerGoalsBeforeCutoff, teamGoalsBeforeCutoff) {
  return teamGoalsBeforeCutoff > 0 ? playerGoalsBeforeCutoff / teamGoalsBeforeCutoff : 0;
}

// C. Wrapper explicite de l'ancien moteur - appelle SEULEMENT sa
// fonction publique, ne lit ni ne modifie son code source.
function baselineC_legacyPlayerEngine(buildPlayerMarketOutputFn, args) {
  return { source: LEGACY_PLAYER_MODEL, output: buildPlayerMarketOutputFn(args) };
}

module.exports = { LEGACY_PLAYER_MODEL, baselineA_simpleShrunkRate, baselineB_teamGoalShare, baselineC_legacyPlayerEngine, BASELINE_A_PSEUDO_MATCHES90 };
