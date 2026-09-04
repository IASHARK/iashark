"use strict";
// GATE B7+B8 (SPEC LAB PRO v1.0) - versioning de dataset et scellement de
// lockbox. Fonctions pures, testables sans donnees reelles collectees -
// la VALEUR produite ne devient significative qu'une fois B1 execute
// (collecte reelle), mais le mecanisme est deja construit et verifie.

const crypto = require("crypto");

// Construit le manifest canonique (ordre de cles stable) et son hash.
// manifest attendu : { league_id, seasons: [...], response_hashes: [...],
// fixture_counts: {...}, exclusions: {...}, schema_version }
function buildDatasetVersion(manifest) {
  const canonical = {
    league_id: manifest.league_id,
    seasons: (manifest.seasons || []).slice().sort(),
    response_hashes: (manifest.response_hashes || []).slice().sort(),
    fixture_counts: manifest.fixture_counts || {},
    exclusions: manifest.exclusions || {},
    schema_version: manifest.schema_version || "v1",
  };
  const canonicalJson = JSON.stringify(canonical, Object.keys(canonical).sort());
  const hash = crypto.createHash("sha256").update(canonicalJson).digest("hex");
  return { dataset_version: hash, canonical_manifest: canonical };
}

// Scelle une lockbox : liste ordonnee (par fixture_id croissant, ordre
// stable et reproductible) + hash. Une fois seal() appele, la liste ne
// doit plus jamais etre recalculee a partir d'une source qui pourrait
// changer (toujours relire depuis la valeur scellee stockee).
function sealLockbox(fixtureIds, leagueId, season) {
  const sorted = fixtureIds.slice().sort((a, b) => a - b);
  const hash = crypto.createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
  return {
    league_id: leagueId,
    season,
    status: "SEALED",
    fixture_count: sorted.length,
    fixture_ids_hash: hash,
    fixture_ids: sorted,
    sealed_at: new Date().toISOString(),
  };
}

// Verifie qu'un ensemble de fixture_ids proposes correspond exactement a
// une lockbox deja scellee - a utiliser avant toute lecture de la
// lockbox pour detecter une derive silencieuse (SPEC LAB PRO v1.0 SS12).
function verifyLockboxIntegrity(sealedLockbox, currentFixtureIds) {
  const sorted = currentFixtureIds.slice().sort((a, b) => a - b);
  const hash = require("crypto").createHash("sha256").update(JSON.stringify(sorted)).digest("hex");
  return {
    intact: hash === sealedLockbox.fixture_ids_hash,
    expected_hash: sealedLockbox.fixture_ids_hash,
    actual_hash: hash,
  };
}

module.exports = { buildDatasetVersion, sealLockbox, verifyLockboxIntegrity };
