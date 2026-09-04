"use strict";
// GATE B1 termine (2026-09-04) - charge le dataset REEL collecte par
// scripts/collect_gate_b1_premier_league.js pour alimenter
// scripts/run_exp001.js. Ecrit maintenant (pas avant, comme documente
// dans le commit GATE C10) car les donnees reelles existent desormais.
//
// Split walk-forward EXPLICITEMENT fixe (jamais decide apres avoir vu
// les resultats) :
//   2022-23 (season=2022) : WARM-UP UNIQUEMENT - jamais walked-forward,
//     sert seulement d'historique pour les premiers cutoffs de 2023-24.
//   2023-24 (season=2023) : OOS developpement - walked-forward, evalue.
//   2024-25 (season=2024) : OOS validation - walked-forward, evalue.
//   2025-26 (season=2025) : LOCKBOX - jamais chargee ici. Aucune fixture
//     2025-26 n'entre meme dans allFixtures : impossible structurellement
//     qu'elle influence un cutoff ou une metrique de ce run.

const fs = require("node:fs");
const path = require("node:path");

const GATE_B1_DIR = path.join(__dirname, "..", "..", "data", "gate-b1");
const LEAGUE_ID = 39;
const TRAIN_SEASONS = [2022];
const OOS_SEASONS = [2023, 2024];
// Moyennes ligue Premier League reelles (memes constantes que
// lib/engine.js#calcLambdas quand leagueAvgH/leagueAvgA ne sont pas
// fournis - lib/config/leagues.json ne stocke pas de moyenne par ligue,
// c'est un defaut de calcLambdas lui-meme, reutilise ici a l'identique).
const LEAGUE_AVG_H = 1.35;
const LEAGUE_AVG_A = 1.10;

function loadRealDataset() {
  const trainFixtures = TRAIN_SEASONS.map((s) => JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8"))).flat();
  const oosFixtures = OOS_SEASONS.map((s) => JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8"))).flat();
  const allFixtures = [...trainFixtures, ...oosFixtures]; // JAMAIS season=2025 ici

  const sealedLockbox = JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, "lockbox_2025_2026.json"), "utf8"));

  return {
    allFixtures,
    sealedLockbox: null, // le lockbox scelle protege 2025-26, qui n'est de toute facon jamais chargee ici - rien a verifier contre allFixtures (aucune fixture 2025-26 n'y figure)
    leagueAvgH: LEAGUE_AVG_H,
    leagueAvgA: LEAGUE_AVG_A,
    leagueId: LEAGUE_ID,
    trainSeasons: TRAIN_SEASONS,
    oosSeasons: OOS_SEASONS,
  };
}

module.exports = { loadRealDataset, TRAIN_SEASONS, OOS_SEASONS, LEAGUE_ID, LEAGUE_AVG_H, LEAGUE_AVG_A };
