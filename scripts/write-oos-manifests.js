#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 - OOS_DEV (2026-09-06). Ecrit et hashe les
// manifests Score + Player AVANT toute lecture de metrique OOS_DEV.
// Usage : node scripts/write-oos-manifests.js --league-key=laliga

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildScoreOosManifest, buildPlayerOosManifest, sha256 } = require("../lib/league-factory/oos-manifest.js");

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; }
  return args;
}
function loadLeagueConfig(leagueKey) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8"));
  const entry = config.leagues.find((l) => l.key === leagueKey);
  if (!entry) throw new Error(`Ligue "${leagueKey}" absente de config/league-expansion.json`);
  return entry;
}

function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/write-oos-manifests.js --league-key=<key>"); process.exit(1); }
  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);

  const scoreLab = JSON.parse(fs.readFileSync(path.join(factoryDir, "score-lab-preoss.json"), "utf8"));
  const playerLab = JSON.parse(fs.readFileSync(path.join(factoryDir, "player-lab-preoss.json"), "utf8"));

  // dataset_hash : empreinte des fixture-lists WARMUP+TRAIN+OOS_DEV (les
  // SEULES saisons touchees par cette passe - jamais OOS_FINAL/sealed).
  const seasonsForHash = [sp.warmup, sp.train, sp.oos_dev];
  const hasher = crypto.createHash("sha256");
  for (const season of seasonsForHash) {
    const content = fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8");
    hasher.update(`${season}:${content}`);
  }
  const datasetHash = hasher.digest("hex");
  const priorsHash = sha256(playerLab.priors_candidate);
  const createdAt = new Date().toISOString();

  const scoreResult = buildScoreOosManifest({
    leagueKey, leagueId: league.apiFootballId, calendarType: league.calendarType, seasonSplit: sp, createdAt,
    datasetHash,
    leagueAvgH: scoreLab.league_avg_h_real, leagueAvgA: scoreLab.league_avg_a_real,
    rhoFinal: scoreLab.fitted_rho_candidate_m2.value,
    rhoBounds: null, // bornes exactes non re-exposees par le rapport pre-OOS (deja verifiees valid=true en amont par pythonRhoFitter/deriveRhoBounds - convergence=true en est la preuve suffisante) - jamais fabriquees ici
    rhoConvergence: scoreLab.fitted_rho_candidate_m2.convergence,
    rhoTrainFixtureCount: scoreLab.fitted_rho_candidate_m2.n_train_at_last_cutoff,
  });

  const playerResult = buildPlayerOosManifest({
    leagueKey, leagueId: league.apiFootballId, calendarType: league.calendarType, seasonSplit: sp, createdAt,
    datasetHash, priorsHash,
  });

  fs.writeFileSync(path.join(factoryDir, "score-oos-manifest.json"), JSON.stringify({ manifest: scoreResult.manifest, hash: scoreResult.hash }, null, 2));
  fs.writeFileSync(path.join(factoryDir, "player-oos-manifest.json"), JSON.stringify({ manifest: playerResult.manifest, hash: playerResult.hash }, null, 2));

  console.log(`=== Manifests OOS_DEV ecrits et hashes (AVANT toute lecture de metrique OOS_DEV=${sp.oos_dev}) ===`);
  console.log(`dataset_hash (WARMUP+TRAIN+OOS_DEV fixture-lists)=${datasetHash}`);
  console.log(`SCORE_${leagueKey.toUpperCase()}_OOS_MANIFEST hash=${scoreResult.hash}`);
  console.log(`PLAYER_${leagueKey.toUpperCase()}_OOS_MANIFEST hash=${playerResult.hash}`);
  console.log(`rho_final=${scoreResult.manifest.rho.final_value}`);
}

main();
