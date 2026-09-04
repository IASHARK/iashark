"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDatasetVersion, sealLockbox, verifyLockboxIntegrity } = require("../lib/data/dataset-version.js");

test("buildDatasetVersion: deterministe (meme manifest -> meme hash)", () => {
  const manifest = { league_id: 39, seasons: [2024, 2023], response_hashes: ["b", "a"], fixture_counts: { 2023: 380 }, exclusions: {} };
  const v1 = buildDatasetVersion(manifest);
  const v2 = buildDatasetVersion(manifest);
  assert.equal(v1.dataset_version, v2.dataset_version);
});

test("buildDatasetVersion: insensible a l'ordre des seasons/response_hashes dans l'entree (canonicalise avant hash)", () => {
  const m1 = { league_id: 39, seasons: [2023, 2024], response_hashes: ["a", "b"] };
  const m2 = { league_id: 39, seasons: [2024, 2023], response_hashes: ["b", "a"] };
  assert.equal(buildDatasetVersion(m1).dataset_version, buildDatasetVersion(m2).dataset_version);
});

test("buildDatasetVersion: differe si le contenu differe reellement", () => {
  const m1 = { league_id: 39, seasons: [2023] };
  const m2 = { league_id: 39, seasons: [2024] };
  assert.notEqual(buildDatasetVersion(m1).dataset_version, buildDatasetVersion(m2).dataset_version);
});

test("sealLockbox: hash deterministe et independant de l'ordre d'entree des fixture_ids", () => {
  const s1 = sealLockbox([3, 1, 2], 39, 2025);
  const s2 = sealLockbox([1, 2, 3], 39, 2025);
  assert.equal(s1.fixture_ids_hash, s2.fixture_ids_hash);
  assert.equal(s1.status, "SEALED");
  assert.equal(s1.fixture_count, 3);
});

test("verifyLockboxIntegrity: detecte une derive (fixture ajoutee/retiree apres scellement)", () => {
  const sealed = sealLockbox([1, 2, 3], 39, 2025);
  const intact = verifyLockboxIntegrity(sealed, [1, 2, 3]);
  assert.equal(intact.intact, true);
  const drifted = verifyLockboxIntegrity(sealed, [1, 2, 3, 4]);
  assert.equal(drifted.intact, false, "une lockbox qui a change de contenu doit etre detectee, jamais silencieusement acceptee");
});
