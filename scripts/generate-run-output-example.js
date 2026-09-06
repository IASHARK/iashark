#!/usr/bin/env node
"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06). Genere un exemple illustratif de RUN
// OUTPUT (TOP_5_SCORERS_OF_DAY / DAILY_COMBOS / SAFE_PICK_OF_THE_DAY)
// pour verification manuelle. Les candidats d'entree sont ILLUSTRATIFS
// (probabilites plausibles saisies a la main) : en production, chaque
// model_probability provient du pipeline Score/Player DEJA valide et
// non touche (memes fonctions que scripts/run-player-oos-final.js /
// scripts/run-score-oos-final.js) - ce script ne fait que demontrer la
// couche de selection produit au-dessus.
//
// Utilise le registry REEL (13 ligues PLAYER_STATUS=VALIDATED, 0 ligue
// SCORE_STATUS=VALIDATED aujourd'hui) + une ligue Score fictive pour
// illustrer le chemin SAFE_PICK positif (qui reste NO_SAFE_SELECTION
// tant qu'aucune vraie ligue Score n'est VALIDATED - voir le test
// dedie dans tests/run-output-engine.test.js).

const { runOutputForSnapshot } = require("../lib/run-output/index.js");
const { loadRegistry } = require("../lib/league-factory/registry.js");

const snapshotTime = "2026-09-07T09:00:00.000Z";

const registry = loadRegistry();
registry.leagues["fake_score_league_demo"] = { score_status: "VALIDATED", score_runnable: true, player_status: "NOT_STARTED", player_runnable: false };

function player(p) {
  return {
    source: "PLAYER", market: "ANYTIME_GOALSCORER", selection: "YES",
    player_model_version: `PLAYER_SCORER_V1_AGGREGATED_SHARE_${p.league_key.toUpperCase()}`,
    snapshot_stability: "STABLE", data_quality_status: "PASS",
    ...p,
  };
}

const playerCandidates = [
  player({ league_key: "ligue2", fixture_id: 900001, kickoff: "2026-09-07T18:00:00.000Z", home_team: "Lorient", away_team: "Guingamp", player_id: "p_5001", player_name: "T. Bamba", team: "Lorient", opponent: "Guingamp", model_probability: 0.415, decimal_odds: 2.35, lineup_status: "CONFIRMED_POST_LINEUP" }),
  player({ league_key: "laliga", fixture_id: 900002, kickoff: "2026-09-07T19:00:00.000Z", home_team: "Villarreal", away_team: "Getafe", player_id: "p_5002", player_name: "A. Moreno", team: "Villarreal", opponent: "Getafe", model_probability: 0.388, decimal_odds: 2.55, lineup_status: "CONFIRMED_POST_LINEUP" }),
  player({ league_key: "seriea", fixture_id: 900003, kickoff: "2026-09-07T16:30:00.000Z", home_team: "Bologna", away_team: "Torino", player_id: "p_5003", player_name: "R. Orsolini", team: "Bologna", opponent: "Torino", model_probability: 0.362, decimal_odds: 2.70, lineup_status: "PROVISIONAL_PRE_LINEUP" }),
  player({ league_key: "eredivisie", fixture_id: 900004, kickoff: "2026-09-07T14:30:00.000Z", home_team: "Twente", away_team: "Heerenveen", player_id: "p_5004", player_name: "S. van Wolfswinkel", team: "Twente", opponent: "Heerenveen", model_probability: 0.341, decimal_odds: 2.85, lineup_status: "CONFIRMED_POST_LINEUP" }),
  player({ league_key: "jleague", fixture_id: 900005, kickoff: "2026-09-07T08:00:00.000Z", home_team: "Kashima Antlers", away_team: "Urawa Reds", player_id: "p_5005", player_name: "Y. Ueda", team: "Kashima Antlers", opponent: "Urawa Reds", model_probability: 0.329, decimal_odds: 2.95, lineup_status: "CONFIRMED_POST_LINEUP" }),
  player({ league_key: "championship", fixture_id: 900006, kickoff: "2026-09-07T15:00:00.000Z", home_team: "Leeds", away_team: "Norwich", player_id: "p_5006", player_name: "J. Piroe", team: "Leeds", opponent: "Norwich", model_probability: 0.298, decimal_odds: 3.10, lineup_status: "CONFIRMED_POST_LINEUP" }),
  player({ league_key: "brazil_seriea", fixture_id: 900007, kickoff: "2026-09-07T21:00:00.000Z", home_team: "Fluminense", away_team: "Vasco", player_id: "p_5007", player_name: "G. Cano", team: "Fluminense", opponent: "Vasco", model_probability: 0.275, decimal_odds: 3.30, lineup_status: "PROVISIONAL_PRE_LINEUP" }),
  player({ league_key: "denmark_superliga", fixture_id: 900008, kickoff: "2026-09-07T13:00:00.000Z", home_team: "FC Midtjylland", away_team: "Silkeborg", player_id: "p_5008", player_name: "S. Isaksen", team: "FC Midtjylland", opponent: "Silkeborg", model_probability: 0.253, decimal_odds: 3.55, lineup_status: "CONFIRMED_POST_LINEUP" }),
];

function score(s) {
  return { source: "SCORE", score_model_version: "SCORE_M0_FAKE_SCORE_LEAGUE_DEMO", league_key: "fake_score_league_demo", snapshot_stability: "STABLE", data_quality_status: "PASS", ...s };
}

const scoreCandidates = [
  score({ fixture_id: 900101, kickoff: "2026-09-07T18:00:00.000Z", home_team: "Demo FC", away_team: "Demo United", market: "FT_1X2_HOME", selection: "HOME", model_probability: 0.66, model_probability_uncertainty: 0.025, decimal_odds: 1.55 }),
  score({ fixture_id: 900101, kickoff: "2026-09-07T18:00:00.000Z", home_team: "Demo FC", away_team: "Demo United", market: "FT_1X2_DRAW", selection: "DRAW", model_probability: 0.22 }),
  score({ fixture_id: 900101, kickoff: "2026-09-07T18:00:00.000Z", home_team: "Demo FC", away_team: "Demo United", market: "FT_1X2_AWAY", selection: "AWAY", model_probability: 0.12 }),
];

const candidates = [...playerCandidates, ...scoreCandidates];
const runOutput = runOutputForSnapshot({ candidates, registry, snapshotTime, snapshotLabel: "T24", runId: "RUN_EXAMPLE_2026-09-07" });

console.log(JSON.stringify(runOutput, null, 2));
