"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06), correctif PASS FINAL point 1. Premier
// League a ete validee AVANT l'existence de LEAGUE_EXPANSION_FACTORY_V1
// et n'est donc JAMAIS inscrite dans data/league-validation-registry.json
// (qui ne couvre que les ligues de la factory). Son statut canonique vit
// dans DEUX fichiers legacy, JAMAIS modifies ici (lecture seule) :
//
//   - Score  : scripts/experiments/experiment_registry.json, entree
//              canonical_id="SCORE-LAB-EXP-002C". Protocole SPEC LAB
//              PRO v1.0 (PAS le protocole OOS_DEV/OOS_FINAL B0-vs-M0 de
//              la factory - vocabulaire different, jamais presente comme
//              equivalent). "CLOSED_PROMOTE ... FINAL_SCORE_ENGINE_CHAMPION"
//              est la traduction PL de VALIDATED+runnable.
//   - Player : data/player-lab/oos-final-2024-25-report.json, champ
//              decision.PLAYER_SCORER_PL === "VALIDATED".
//
// Ce module ne fait QUE lire et traduire ces deux statuts DANS LE MEME
// SCHEMA que le registry factory ({player_status, player_runnable,
// score_status, score_runnable, ...}) pour qu'une SEULE vue
// d'eligibilite existe cote RUN OUTPUT ENGINE. Aucun fichier source
// n'est jamais ecrit ici (loadCanonicalEligibilityRegistry ne fait que
// merger en memoire, jamais persiste).

const fs = require("fs");
const path = require("path");

const PL_LEAGUE_KEY = "premier_league";
const PL_EXPERIMENT_REGISTRY_PATH = path.join(__dirname, "..", "..", "scripts", "experiments", "experiment_registry.json");
const PL_PLAYER_OOS_FINAL_PATH = path.join(__dirname, "..", "..", "data", "player-lab", "oos-final-2024-25-report.json");

function derivePremierLeagueScoreStatus() {
  if (!fs.existsSync(PL_EXPERIMENT_REGISTRY_PATH)) {
    return { score_status: null, score_runnable: false, score_champion: null, score_source_note: "scripts/experiments/experiment_registry.json introuvable" };
  }
  const registry = JSON.parse(fs.readFileSync(PL_EXPERIMENT_REGISTRY_PATH, "utf8"));
  const experiments = Array.isArray(registry.experiments) ? registry.experiments : [];
  const exp002c = experiments.find((e) => e.canonical_id === "SCORE-LAB-EXP-002C");
  if (!exp002c) {
    return { score_status: null, score_runnable: false, score_champion: null, score_source_note: "SCORE-LAB-EXP-002C introuvable dans experiment_registry.json" };
  }
  const status = exp002c.status || "";
  const promoted = /^CLOSED_PROMOTE/.test(status) && /FINAL_SCORE_ENGINE_CHAMPION/.test(status);
  return {
    score_status: promoted ? "VALIDATED" : null,
    score_runnable: promoted,
    score_champion: promoted ? "SCORE_ENGINE_M2_PL_EXP002C" : null,
    score_source_note: `scripts/experiments/experiment_registry.json#SCORE-LAB-EXP-002C (protocole SPEC LAB PRO v1.0, distinct du protocole OOS_DEV/OOS_FINAL de la factory) - status brut: "${status}"`,
  };
}

function derivePremierLeaguePlayerStatus() {
  if (!fs.existsSync(PL_PLAYER_OOS_FINAL_PATH)) {
    return { player_status: null, player_runnable: false, player_champion: null, player_source_note: "data/player-lab/oos-final-2024-25-report.json introuvable" };
  }
  const report = JSON.parse(fs.readFileSync(PL_PLAYER_OOS_FINAL_PATH, "utf8"));
  const decision = report.decision || {};
  const rawStatus = decision.PLAYER_SCORER_PL || null;
  const validated = rawStatus === "VALIDATED";
  return {
    player_status: rawStatus,
    player_runnable: validated,
    player_champion: validated ? (decision.current_player_champion_pl || "PLAYER_SCORER_V1_AGGREGATED_SHARE") : null,
    player_source_note: "data/player-lab/oos-final-2024-25-report.json#decision.PLAYER_SCORER_PL",
  };
}

function buildPremierLeagueCanonicalEntry() {
  const score = derivePremierLeagueScoreStatus();
  const player = derivePremierLeaguePlayerStatus();
  return {
    league_key: PL_LEAGUE_KEY,
    score_status: score.score_status,
    score_runnable: score.score_runnable,
    score_champion: score.score_champion,
    player_status: player.player_status,
    player_runnable: player.player_runnable,
    player_champion: player.player_champion,
    live_eligible: !!(score.score_runnable && player.player_runnable),
    canonical_source: "LEGACY_PRE_FACTORY", // jamais confondu avec un statut LEAGUE_EXPANSION_FACTORY_V1
    score_source_note: score.score_source_note,
    player_source_note: player.player_source_note,
  };
}

// Fusionne le registry League Expansion Factory (INCHANGE, passe tel
// quel par l'appelant - jamais relu ici pour rester pur/testable) avec
// l'entree canonique Premier League. Ceci est une VUE en memoire,
// jamais une ecriture : ni data/league-validation-registry.json ni les
// fichiers legacy PL ne sont jamais touches.
function loadCanonicalEligibilityRegistry(factoryRegistry) {
  const base = factoryRegistry && factoryRegistry.leagues ? factoryRegistry : { leagues: {} };
  const merged = { ...base, leagues: { ...base.leagues } };
  if (!merged.leagues[PL_LEAGUE_KEY]) merged.leagues[PL_LEAGUE_KEY] = buildPremierLeagueCanonicalEntry();
  return merged;
}

module.exports = { loadCanonicalEligibilityRegistry, buildPremierLeagueCanonicalEntry, derivePremierLeagueScoreStatus, derivePremierLeaguePlayerStatus, PL_LEAGUE_KEY };
