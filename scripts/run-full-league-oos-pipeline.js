#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 - VAGUE 2 (2026-09-06). Orchestrateur
// UNIQUE et GENERIQUE qui enchaine EXACTEMENT la factory deja prouvee
// sur La Liga, sans reecrire aucune etape :
//   dataset -> TRAIN (Score+Player pre-OOS) -> manifests pre-OOS ->
//   OOS_DEV -> manifests FINAL (freeze) -> OOS_FINAL -> registry update.
// Idempotent (chaque sous-script verifie deja son propre cache avant
// tout appel). AUCUN transfert automatique de parametre entre ligues -
// chaque etape refitte/refige ENTIEREMENT sur les donnees de LA ligue
// en cours (--league-key), jamais une valeur PL ou La Liga injectee.
//
// Usage : node scripts/run-full-league-oos-pipeline.js --league-key=bundesliga

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { updateLeagueEntry } = require("../lib/league-factory/registry.js");

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; }
  return args;
}
function loadLeagueConfig(leagueKey) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8"));
  const entry = config.leagues.find((l) => l.key === leagueKey);
  if (!entry) throw new Error(`Ligue "${leagueKey}" absente de config/league-expansion.json`);
  if (entry.player_data_gate_audit !== "PASS") throw new Error(`Ligue "${leagueKey}" a PLAYER_DATA_GATE=${entry.player_data_gate_audit} - factory reservee aux ligues PASS.`);
  return entry;
}
function run(scriptName, args) {
  console.log(`\n>>> node scripts/${scriptName} ${args.join(" ")}`);
  execFileSync("node", [path.join(__dirname, scriptName), ...args], { stdio: "inherit" });
}
function readJson(p) { return JSON.parse(fs.readFileSync(p, "utf8")); }

function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/run-full-league-oos-pipeline.js --league-key=<key>"); process.exit(1); }
  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  const t0 = Date.now();

  console.log(`\n########## LEAGUE_EXPANSION_FACTORY_V1 - ${league.displayName} (${leagueKey}, id=${league.apiFootballId}) ##########`);

  // 1. Dataset Score (4 saisons, idempotent)
  console.log("\n===== [1/10] Dataset Score =====");
  run("collect-league-fixtures.js", [`--league-key=${leagueKey}`, `--seasons=${sp.warmup},${sp.train},${sp.oos_dev},${sp.oos_final}`]);

  // 2. Dataset Player - WARMUP+TRAIN (necessaire pour le fit pre-OOS)
  console.log("\n===== [2/10] Dataset Player (WARMUP+TRAIN) =====");
  run("collect-league-player-lab.js", [`--league-key=${leagueKey}`, `--seasons=${sp.warmup},${sp.train}`]);

  // 3. Score Lab PRE-OOS (rho appris sur TRAIN de CETTE ligue)
  console.log("\n===== [3/10] Score Lab PRE-OOS =====");
  run("fit-score-lab-preoss.js", [`--league-key=${leagueKey}`]);

  // 4. Player Lab PRE-OOS (priors reappris sur TRAIN de CETTE ligue)
  console.log("\n===== [4/10] Player Lab PRE-OOS =====");
  run("fit-player-lab-preoss.js", [`--league-key=${leagueKey}`]);

  // 5. Manifests pre-OOS (haches AVANT OOS_DEV)
  console.log("\n===== [5/10] Manifests pre-OOS (haches avant OOS_DEV) =====");
  run("write-oos-manifests.js", [`--league-key=${leagueKey}`]);

  // 6. Dataset Player OOS_DEV
  console.log("\n===== [6/10] Dataset Player OOS_DEV =====");
  run("collect-league-player-lab.js", [`--league-key=${leagueKey}`, `--seasons=${sp.oos_dev}`]);

  // 7. Score + Player OOS_DEV
  console.log("\n===== [7/10] Score OOS_DEV =====");
  run("run-score-oos-dev.js", [`--league-key=${leagueKey}`]);
  console.log("\n===== [7/10] Player OOS_DEV =====");
  run("run-player-oos-dev.js", [`--league-key=${leagueKey}`]);

  const scoreDevReport = readJson(path.join(factoryDir, "score-oos-dev-report.json"));
  const playerDevReport = readJson(path.join(factoryDir, "player-oos-dev-report.json"));
  console.log(`\n[DEV SUMMARY] Score=${scoreDevReport.promotion.decision_label} Player=${playerDevReport.decision.status}`);

  // 8. FREEZE : manifests FINAL (haches AVANT OOS_FINAL, reutilisent tel quel rho/priors du DEV)
  console.log("\n===== [8/10] Manifests OOS_FINAL (freeze, haches avant OOS_FINAL) =====");
  run("write-oos-final-manifests.js", [`--league-key=${leagueKey}`]);

  // 9. Dataset Player OOS_FINAL
  console.log("\n===== [9/10] Dataset Player OOS_FINAL =====");
  run("collect-league-player-lab.js", [`--league-key=${leagueKey}`, `--seasons=${sp.oos_final}`]);

  // 10. Score + Player OOS_FINAL (chacun execute 2x en interne pour la reproductibilite)
  console.log("\n===== [10/10] Score OOS_FINAL =====");
  run("run-score-oos-final.js", [`--league-key=${leagueKey}`]);
  console.log("\n===== [10/10] Player OOS_FINAL =====");
  run("run-player-oos-final.js", [`--league-key=${leagueKey}`]);

  const scoreFinalReport = readJson(path.join(factoryDir, "score-oos-final-report.json"));
  const playerFinalReport = readJson(path.join(factoryDir, "player-oos-final-report.json"));
  const scoreManifest = readJson(path.join(factoryDir, "score-oos-final-manifest.json"));

  const scoreStatus = scoreFinalReport.decision.status; // VALIDATED | INCONCLUSIVE | REJECTED
  const playerStatus = playerFinalReport.decision.status;
  const scoreRunnable = scoreStatus === "VALIDATED";
  const playerRunnable = playerStatus === "VALIDATED";
  const liveEligible = scoreRunnable && playerRunnable;
  const fullModelStatus = scoreRunnable && playerRunnable ? "VALIDATED" : (playerRunnable ? "PARTIAL_PLAYER_ONLY" : (scoreRunnable ? "PARTIAL_SCORE_ONLY" : "NONE_VALIDATED"));
  const scoreChampionId = scoreManifest.manifest.model_m0.id; // SCORE_M0_<LEAGUE> reste le candidat structurel qu'il soit VALIDATED ou non
  const playerChampionId = `PLAYER_SCORER_V1_AGGREGATED_SHARE_${leagueKey.toUpperCase()}`;

  const entry = updateLeagueEntry(leagueKey, {
    league_key: leagueKey, league_id: league.apiFootballId, calendar_type: league.calendarType,
    dataset_versions: { fixtures_seasons: [sp.warmup, sp.train, sp.oos_dev, sp.oos_final], player_lab_seasons: [sp.warmup, sp.train, sp.oos_dev, sp.oos_final] },
    score_champion: scoreChampionId, score_status: scoreStatus,
    player_champion: playerChampionId, player_status: playerStatus,
    market_status: "MARKET_VALIDATION_PENDING",
    oos_report_hashes: {
      score_oos_dev_manifest_hash: readJson(path.join(factoryDir, "score-oos-manifest.json")).hash,
      player_oos_dev_manifest_hash: readJson(path.join(factoryDir, "player-oos-manifest.json")).hash,
      score_oos_final_manifest_hash: readJson(path.join(factoryDir, "score-oos-final-manifest.json")).hash,
      player_oos_final_manifest_hash: readJson(path.join(factoryDir, "player-oos-final-manifest.json")).hash,
    },
    score_runnable: scoreRunnable, player_runnable: playerRunnable, live_eligible: liveEligible,
    [`current_score_champion_${leagueKey}`]: scoreRunnable ? scoreChampionId : null,
    [`current_player_champion_${leagueKey}`]: playerRunnable ? playerChampionId : null,
    [`${leagueKey}_full_model_status`]: fullModelStatus,
    note: `OOS_DEV(${sp.oos_dev}) puis OOS_FINAL(${sp.oos_final}) termines, chaque etape gelee avant lecture. Score=${scoreStatus} (${scoreFinalReport.decision.reason_code}). Player=${playerStatus} (${playerFinalReport.decision.reason_code}). Reproductibilite : Score=${scoreFinalReport.reproducible} Player=${playerFinalReport.reproducible}.`,
  });

  const elapsedMin = ((Date.now() - t0) / 60000).toFixed(1);
  console.log(`\n########## ${league.displayName} TERMINE (${elapsedMin} min) ##########`);
  console.log(JSON.stringify(entry, null, 2));
}

main();
