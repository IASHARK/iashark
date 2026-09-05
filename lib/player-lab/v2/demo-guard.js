"use strict";
// PLAYER SCORER V2 (2026-09-05), item 21. La fixture OOS_DEV 1035076
// (Score Engine 2023-24) a servi de DEMONSTRATION TECHNIQUE UNIQUEMENT
// pour V1 (scripts/build-player-scorer-priors.js) - aucun outcome/score
// reel n'a ete consulte pour cette demonstration, et AUCUN parametre
// n'a ete ajuste en fonction des noms/probabilites qui en sont sortis.
// Ce module sert de garde-fou documente et testable : toute fixture
// listee ici reste taguee, jamais reutilisee pour justifier un choix
// de modelisation a posteriori.

const PRE_OOS_TECHNICAL_DEMO_ONLY = "PRE_OOS_TECHNICAL_DEMO_ONLY";

const DEMO_FIXTURES = Object.freeze([
  { fixture_id: 1035076, season: 2023, model_version: "PLAYER_SCORER_V1_AGGREGATED_SHARE", tag: PRE_OOS_TECHNICAL_DEMO_ONLY, note: "Demonstration technique de plomberie (M2 -> exposition -> attribution -> simulation), aucun outcome consulte, aucun parametre tune sur cette fixture." },
]);

function isDemoFixture(fixtureId) {
  return DEMO_FIXTURES.some((f) => f.fixture_id === fixtureId);
}

module.exports = { PRE_OOS_TECHNICAL_DEMO_ONLY, DEMO_FIXTURES, isDemoFixture };
