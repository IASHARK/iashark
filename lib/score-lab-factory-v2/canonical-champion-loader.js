"use strict";
// SCORE_LAB_FACTORY_V2 (2026-09-06). Interface UNIQUE et GENERIQUE pour
// charger le champion Score canonique d'une ligue - AUCUN fallback
// silencieux vers lib/engine.js (l'ancien moteur global). Si le
// champion n'est pas VALIDATED, retourne explicitement
// CANONICAL_CHAMPION_UNAVAILABLE : c'est a l'appelant de decider quoi
// faire (typiquement NO_CANONICAL_PREDICTION), jamais a ce module de
// se replier tout seul sur un ancien pari_rec.
//
// L'artifact charge contient tout ce qu'il faut pour RECALCULER les
// predictions via les memes fonctions reutilisees partout dans ce lab
// (lib/lab/dc-matrix-with-rho.js#predictWithRho, lib/lab/walkforward-*
// pour la reconstruction d'etat d'equipe) - ce module ne reimplemente
// et ne simplifie AUCUNE formule, il transporte seulement les
// parametres geles.

const fs = require("fs");
const path = require("path");

function factoryV2Dir(leagueKey) {
  return path.join(__dirname, "..", "..", "data", "league-factory", leagueKey, "score-lab-factory-v2");
}

const UNAVAILABLE_REASONS = {
  NO_ARTIFACT: "CANONICAL_CHAMPION_UNAVAILABLE_NO_ARTIFACT",
  NOT_VALIDATED: "CANONICAL_CHAMPION_UNAVAILABLE_NOT_VALIDATED",
};

// Retourne soit { available:true, champion:{...} }, soit
// { available:false, reason, verdict } - JAMAIS un objet qui ressemble
// a un champion par defaut/invente, et jamais une reference a
// lib/engine.js.
function loadCanonicalScoreChampion(leagueKey) {
  const dir = factoryV2Dir(leagueKey);
  const holdoutReportPath = path.join(dir, "holdout-validation-report.json");
  if (!fs.existsSync(holdoutReportPath)) {
    return { available: false, reason: UNAVAILABLE_REASONS.NO_ARTIFACT, league_key: leagueKey };
  }
  const report = JSON.parse(fs.readFileSync(holdoutReportPath, "utf8"));
  if (report.verdict !== "VALIDATED") {
    return { available: false, reason: UNAVAILABLE_REASONS.NOT_VALIDATED, league_key: leagueKey, verdict: report.verdict };
  }
  const contractPath = path.join(dir, "production-validation-contract.json");
  const { contract } = JSON.parse(fs.readFileSync(contractPath, "utf8"));
  return {
    available: true,
    league_key: leagueKey,
    champion: {
      model_id: contract.champion.model_id,
      rho: contract.champion.rho,
      league_avg_h: contract.champion.league_avg_h,
      league_avg_a: contract.champion.league_avg_a,
      structural_formula: contract.champion.structural_formula,
      code_sha_at_freeze: contract.champion.code_sha_at_freeze,
    },
    holdout_verdict: report.verdict,
    holdout_season: report.holdout_season,
  };
}

module.exports = { loadCanonicalScoreChampion, UNAVAILABLE_REASONS, factoryV2Dir };
