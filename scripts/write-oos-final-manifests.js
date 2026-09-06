#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 - OOS_FINAL (2026-09-06). Ecrit et hashe
// les manifests Score(B0/M0) + Player AVANT toute lecture de 2024-25.
// Usage : node scripts/write-oos-final-manifests.js --league-key=laliga

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { buildScoreFinalManifest, buildPlayerFinalManifest } = require("../lib/league-factory/oos-manifest.js");

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
  if (!leagueKey) { console.error("Usage: node scripts/write-oos-final-manifests.js --league-key=<key>"); process.exit(1); }
  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);

  const { manifest: scoreDevManifest, hash: scoreDevHash } = JSON.parse(fs.readFileSync(path.join(factoryDir, "score-oos-manifest.json"), "utf8"));
  const { manifest: playerDevManifest, hash: playerDevHash } = JSON.parse(fs.readFileSync(path.join(factoryDir, "player-oos-manifest.json"), "utf8"));

  // dataset_hash_final : empreinte des fixture-lists WARMUP+TRAIN+OOS_DEV+OOS_FINAL
  const seasonsForHash = [sp.warmup, sp.train, sp.oos_dev, sp.oos_final];
  const hasher = crypto.createHash("sha256");
  for (const season of seasonsForHash) {
    const content = fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8");
    hasher.update(`${season}:${content}`);
  }
  const datasetHashFinal = hasher.digest("hex");
  const createdAt = new Date().toISOString();

  const scoreResult = buildScoreFinalManifest({
    leagueKey, leagueId: league.apiFootballId, calendarType: league.calendarType, seasonSplit: sp, createdAt,
    datasetHashFinal, frozenFromDevManifestHash: scoreDevHash,
    leagueAvgH: scoreDevManifest.league_averages.leagueAvgH, leagueAvgA: scoreDevManifest.league_averages.leagueAvgA,
    rhoFinal: scoreDevManifest.rho.final_value,
  });
  const playerResult = buildPlayerFinalManifest({
    leagueKey, leagueId: league.apiFootballId, calendarType: league.calendarType, seasonSplit: sp, createdAt,
    datasetHashFinal, frozenFromDevManifestHash: playerDevHash,
    priorsHash: playerDevManifest.candidate_c.fitted_priors_hash,
  });

  fs.writeFileSync(path.join(factoryDir, "score-oos-final-manifest.json"), JSON.stringify({ manifest: scoreResult.manifest, hash: scoreResult.hash }, null, 2));
  fs.writeFileSync(path.join(factoryDir, "player-oos-final-manifest.json"), JSON.stringify({ manifest: playerResult.manifest, hash: playerResult.hash }, null, 2));

  console.log(`=== Manifests OOS_FINAL ecrits et hashes (AVANT toute lecture 2024-25) ===`);
  console.log(`dataset_hash_final=${datasetHashFinal}`);
  console.log(`SCORE_${leagueKey.toUpperCase()}_OOS_FINAL_MANIFEST hash=${scoreResult.hash}`);
  console.log(`PLAYER_${leagueKey.toUpperCase()}_OOS_FINAL_MANIFEST hash=${playerResult.hash}`);
  console.log(`rho (gele, reutilise du DEV)=${scoreResult.manifest.rho.final_value}`);
}

main();
