"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 (2026-09-06). Registry global des ligues
// en cours/fin de validation - data/league-validation-registry.json.
// Lecture/ecriture simple, jamais de fabrication : un champ absent
// reste absent (null), jamais une valeur par defaut inventee.

const fs = require("fs");
const path = require("path");

const REGISTRY_PATH = path.join(__dirname, "..", "..", "data", "league-validation-registry.json");

function loadRegistry() {
  if (!fs.existsSync(REGISTRY_PATH)) return { generated_at: null, leagues: {} };
  return JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf8"));
}

function saveRegistry(registry) {
  registry.generated_at = new Date().toISOString();
  fs.mkdirSync(path.dirname(REGISTRY_PATH), { recursive: true });
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  return registry;
}

// Merge PARTIEL - ne remplace que les champs fournis, jamais tout
// l'enregistrement (evite d'ecraser un champ deja rempli par une etape
// anterieure du pipeline avec null).
function updateLeagueEntry(leagueKey, partialUpdate) {
  const registry = loadRegistry();
  const existing = registry.leagues[leagueKey] || {
    league_key: leagueKey, league_id: null, calendar_type: null,
    dataset_versions: {}, score_champion: null, score_status: "NOT_STARTED",
    player_champion: null, player_status: "NOT_STARTED", market_status: "NO_DATA",
    oos_report_hashes: {}, score_runnable: false, player_runnable: false,
    live_eligible: false, updated_at: null,
  };
  const merged = { ...existing, ...partialUpdate, updated_at: new Date().toISOString() };
  registry.leagues[leagueKey] = merged;
  saveRegistry(registry);
  return merged;
}

module.exports = { REGISTRY_PATH, loadRegistry, saveRegistry, updateLeagueEntry };
