#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 (2026-09-06). Orchestrateur UNIQUE et
// GENERIQUE - le meme code sert a TOUTES les ligues PLAYER_DATA_GATE=
// PASS de config/league-expansion.json, jamais une copie par
// championnat. Idempotent : chaque etape vérifie d'abord si son
// resultat existe deja (fixtures cachees, raw player-lab cache,
// manifests pre-OOS) avant de relancer quoi que ce soit - reprise
// propre apres interruption, jamais un nouvel appel sur une fixture
// deja correctement cachee (verifie via isCached, deja generique).
//
// Etapes (dans cet ordre) :
//   1. dataset Score  (scripts/collect-league-fixtures.js)
//   2. dataset Player (scripts/collect-league-player-lab.js)
//   3. Score Lab PRE-OOS (scripts/fit-score-lab-preoss.js) - rho appris
//      PAR LIGUE sur TRAIN, jamais rho_PL injecte
//   4. Player Lab PRE-OOS (scripts/fit-player-lab-preoss.js) - priors
//      V1_AGGREGATED_SHARE reappris PAR LIGUE sur TRAIN
//   5. registry update (data/league-validation-registry.json)
//
// Score OOS et Player OOS (walk-forward reel sur OOS_DEV/OOS_FINAL,
// bootstrap, decision de promotion VALIDATED/INCONCLUSIVE/REJECTED)
// sont DELIBEREMENT ABSENTS de cette version - ce sont des etapes
// FUTURES nécessitant une autorisation explicite separee (meme
// discipline que pour Premier League : OOS_DEV et OOS_FINAL ont ete
// des passes distinctes, jamais enchainees automatiquement apres un
// fit TRAIN). --stop-before-oos est donc le comportement PSR de ce
// script (aucun flag n'active encore l'etape OOS - elle n'existe pas
// dans ce fichier).
//
// Usage :
//   node scripts/validate-league.js --league-key=laliga
//   node scripts/validate-league.js --league-id=140

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { isCached } = require("../lib/player-lab/raw-cache.js");
const { updateLeagueEntry } = require("../lib/league-factory/registry.js");

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; }
  return args;
}

function loadLeagueConfig(args) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8"));
  let entry;
  if (args["league-key"]) entry = config.leagues.find((l) => l.key === args["league-key"]);
  else if (args["league-id"]) entry = config.leagues.find((l) => String(l.apiFootballId) === String(args["league-id"]));
  if (!entry) throw new Error("Ligue introuvable dans config/league-expansion.json - ne jamais deviner un league_id, l'ajouter explicitement d'abord (voir data/league-audit/global-league-discovery-audit-2026-09-06.json pour les IDs deja resolus reellement).");
  if (entry.player_data_gate_audit !== "PASS") throw new Error(`Ligue "${entry.key}" a PLAYER_DATA_GATE=${entry.player_data_gate_audit} dans l'audit - la factory ne traite QUE les ligues PASS (item de cadrage LEAGUE_EXPANSION_FACTORY_V1).`);
  return entry;
}

function run(scriptName, args) {
  console.log(`\n>>> node scripts/${scriptName} ${args.join(" ")}`);
  execFileSync("node", [path.join(__dirname, scriptName), ...args], { stdio: "inherit" });
}

function fixturesFileExists(leagueKey, season) {
  return fs.existsSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`));
}

function allPlayerLabCached(leagueKey, seasons) {
  for (const season of seasons) {
    const fpath = path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`);
    if (!fs.existsSync(fpath)) return false;
    const fixtures = JSON.parse(fs.readFileSync(fpath, "utf8"));
    for (const fx of fixtures) {
      if (!isCached("lineups", fx.fixture_id) || !isCached("players", fx.fixture_id) || !isCached("events", fx.fixture_id)) return false;
    }
  }
  return true;
}

function main() {
  const args = parseArgs();
  const league = loadLeagueConfig(args);
  const key = league.key;
  const sp = league.seasonSplit;
  const scoreSeasons = [sp.warmup, sp.train, sp.oos_dev, sp.oos_final]; // dataset COLLECTE en entier (4 saisons, item A) - PAS lu/utilise au-dela de TRAIN dans cette version
  const playerLabSeasons = [sp.warmup, sp.train]; // PRE-OOS : seul WARMUP+TRAIN necessaire tant que Player OOS n'existe pas

  console.log(`===== LEAGUE_EXPANSION_FACTORY_V1 : ${league.displayName} (${key}, id=${league.apiFootballId}) =====`);
  console.log(`calendarType=${league.calendarType} seasonSplit=${JSON.stringify(sp)}`);

  // 1. Dataset Score
  const missingFixtureSeasons = scoreSeasons.filter((s) => !fixturesFileExists(key, s));
  if (missingFixtureSeasons.length) {
    console.log(`\n=== Etape 1/5 : dataset Score - saisons manquantes ${JSON.stringify(missingFixtureSeasons)} ===`);
    run("collect-league-fixtures.js", [`--league-key=${key}`, `--seasons=${scoreSeasons.join(",")}`]);
  } else {
    console.log("\n=== Etape 1/5 : dataset Score - deja complet (idempotent, 0 appel) ===");
  }

  // 2. Dataset Player (WARMUP+TRAIN uniquement pour cette version pre-OOS)
  if (!allPlayerLabCached(key, playerLabSeasons)) {
    console.log(`\n=== Etape 2/5 : dataset Player (lineups/events/players) - WARMUP+TRAIN ===`);
    run("collect-league-player-lab.js", [`--league-key=${key}`, `--seasons=${playerLabSeasons.join(",")}`]);
  } else {
    console.log("\n=== Etape 2/5 : dataset Player - deja complet (idempotent, 0 appel) ===");
  }

  // 3. Score Lab PRE-OOS
  console.log("\n=== Etape 3/5 : Score Lab PRE-OOS (rho appris sur TRAIN, jamais rho_PL) ===");
  run("fit-score-lab-preoss.js", [`--league-key=${key}`]);

  // 4. Player Lab PRE-OOS
  console.log("\n=== Etape 4/5 : Player Lab PRE-OOS (priors V1_AGGREGATED_SHARE reappris sur TRAIN) ===");
  run("fit-player-lab-preoss.js", [`--league-key=${key}`]);

  // 5. Registry update
  console.log("\n=== Etape 5/5 : registry update ===");
  const scoreLabPath = path.join(__dirname, "..", "data", "league-factory", key, "score-lab-preoss.json");
  const playerLabPath = path.join(__dirname, "..", "data", "league-factory", key, "player-lab-preoss.json");
  const scoreLab = JSON.parse(fs.readFileSync(scoreLabPath, "utf8"));
  const playerLab = JSON.parse(fs.readFileSync(playerLabPath, "utf8"));

  const entry = updateLeagueEntry(key, {
    league_key: key, league_id: league.apiFootballId, calendar_type: league.calendarType,
    dataset_versions: { fixtures_seasons: scoreSeasons, player_lab_seasons: playerLabSeasons },
    score_champion: `CANDIDATE_SCORE_CHAMPION_${key.toUpperCase()}_UNVALIDATED`,
    score_status: "PRE_OOS_READY",
    player_champion: `PLAYER_SCORER_V1_AGGREGATED_SHARE_${key.toUpperCase()}_FITTED_UNVALIDATED`,
    player_status: "PRE_OOS_READY",
    market_status: "NOT_ASSESSED_THIS_PASS",
    oos_report_hashes: {},
    score_runnable: false, // reste false tant que SCORE_STATUS != VALIDATED (regle explicite)
    player_runnable: false,
    live_eligible: false,
    pre_oos_score_rho_candidate: scoreLab.fitted_rho_candidate_m2.value,
    pre_oos_score_convergence_rate: scoreLab.convergence_rate,
    pre_oos_player_anti_leakage_pass: playerLab.anti_leakage_smoke_test.pass,
    pre_oos_player_determinism_pass: playerLab.determinism_smoke_test.pass,
    pre_oos_goal_reconciliation_pct: playerLab.goal_reconciliation_rate_pct,
  });

  console.log(JSON.stringify(entry, null, 2));
  console.log("\n===== STOP AVANT OOS (comportement par defaut de cette version - aucune etape OOS n'existe dans ce script) =====");
}

main();
