#!/usr/bin/env node
"use strict";
// SCORE_LAB_FACTORY_V2 - Phase B (2026-09-06). Gele le CONTRAT DE
// VALIDATION PRODUCTION pour n'importe quelle ligue, GENERIQUEMENT
// (lib/score-lab-factory-v2/contract.js) - AVANT toute ouverture du
// holdout sealed_unread. Consomme les predictions du champion deja
// calculees et sauvegardees en Phase A (jamais recalculees deux fois
// avec un risque de divergence).
//
// Usage : node scripts/score-lab-v2-freeze-contract.js --league=ligue1

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execSync } = require("child_process");
const { buildProductionValidationContract } = require("../lib/score-lab-factory-v2/contract.js");
const { exactScoreNLL } = require("../lib/lab/metrics.js");

function parseArgs() { const args = {}; for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; } return args; }
function loadLeagueConfig(leagueKey) { const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8")); return config.leagues.find((l) => l.key === leagueKey); }
function sha256File(p) { return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }

function main() {
  const args = parseArgs();
  const leagueKey = args.league || args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/score-lab-v2-freeze-contract.js --league=<key>"); process.exit(1); }

  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  const v2Dir = path.join(factoryDir, "score-lab-factory-v2");

  const selectionPath = path.join(v2Dir, "champion-selection.json");
  if (!fs.existsSync(selectionPath)) { console.error("Phase A absente - lancer scripts/score-lab-v2-champion-selection.js --league=" + leagueKey + " d'abord."); process.exit(1); }
  const selection = JSON.parse(fs.readFileSync(selectionPath, "utf8"));
  if (!selection.champion_selected) { console.error("Aucun champion selectionne en Phase A - STOP."); process.exit(1); }

  const predictionsPath = path.join(v2Dir, "champion-oos-dev-predictions.json");
  const championPredictions = JSON.parse(fs.readFileSync(predictionsPath, "utf8"));

  const gitSha = execSync("git rev-parse HEAD", { cwd: path.join(__dirname, ".."), encoding: "utf8" }).trim();
  const datasetHashes = {
    warmup: sha256File(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${sp.warmup}.json`)),
    train: sha256File(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${sp.train}.json`)),
    oos_dev: sha256File(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${sp.oos_dev}.json`)),
  };

  const championParams = {
    rho: selection.champion_selected === "B0" ? 0 : selection.rho_frozen,
    league_avg_h: selection.league_avg_h,
    league_avg_a: selection.league_avg_a,
    structural_formula: selection.champion_selected === "M2" ? "prior_equivalents(n)=max(0,8-0.5n) (lib/lab/bayes-early-season.js, transferee de PL sans retuning)" : "N/A",
  };

  const contract = buildProductionValidationContract({
    leagueKey,
    championModelId: selection.champion_selected,
    championPredictions,
    championParams,
    codeSha: gitSha,
    datasetHashes,
    seedPrefix: `SCORE-LAB-FACTORY-V2-${leagueKey.toUpperCase()}`,
    exactScoreNLL,
  });

  const contractHash = crypto.createHash("sha256").update(JSON.stringify(contract)).digest("hex");
  const outPath = path.join(v2Dir, "production-validation-contract.json");
  fs.writeFileSync(outPath, JSON.stringify({ contract, hash: contractHash }, null, 2));
  console.log(JSON.stringify({ contract, hash: contractHash }, null, 2));
  console.log("\nEcrit: " + outPath);
}

main();
