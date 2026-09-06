"use strict";
// SCORE_LAB_FACTORY_V2 (2026-09-06). Verification EXPLICITE du scellement
// du holdout avant tout acces - generique, jamais une liste de ligues
// codee en dur. Le seal est considere BROKEN des que le fichier de
// fixtures de la saison sealed_unread existe sur disque
// (data/gate-b1/<league>-<sealed_unread>.json) : c'est exactement ce que
// scripts/collect-league-fixtures.js cree, et c'est la SEULE action qui
// "ouvre" un holdout dans ce pipeline. Serie A (2025 deja consomme lors
// du protocole V1) est donc detecte comme BROKEN automatiquement par
// cette meme regle, sans cas particulier code en dur.

const fs = require("fs");
const path = require("path");

function gateB1Path(leagueKey, season) {
  return path.join(__dirname, "..", "..", "data", "gate-b1", `${leagueKey}-${season}.json`);
}

// league: entree de config/league-expansion.json (doit porter .key et
// .seasonSplit.sealed_unread).
function getHoldoutSealStatus(league) {
  const sealedSeason = league.seasonSplit.sealed_unread;
  const fixturesPath = gateB1Path(league.key, sealedSeason);
  const fixtureFileExists = fs.existsSync(fixturesPath);
  return {
    league_key: league.key,
    sealed_unread_season: sealedSeason,
    sealed: !fixtureFileExists,
    access_count: fixtureFileExists ? 1 : 0,
    fixture_file_path: fixturesPath,
    fixture_file_exists: fixtureFileExists,
  };
}

// A appeler en tout DEBUT de tout script qui s'appreterait a lire le
// holdout - leve une exception (jamais un simple warning) si le seal
// est deja casse, pour qu'aucun script ne puisse "relire" un holdout
// deja consomme par accident.
function assertHoldoutSealedBeforeAccess(league) {
  const status = getHoldoutSealStatus(league);
  if (!status.sealed) {
    const err = new Error(`HOLDOUT DEJA CONSOMME pour ${league.key} (saison ${status.sealed_unread_season}) - fichier ${status.fixture_file_path} existe deja. Un holdout deja ouvert ne peut jamais etre relu comme "vierge". STOP.`);
    err.code = "HOLDOUT_ALREADY_CONSUMED";
    err.status = status;
    throw err;
  }
  return status;
}

module.exports = { getHoldoutSealStatus, assertHoldoutSealedBeforeAccess };
