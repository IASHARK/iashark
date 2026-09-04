"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const cache = require("../lib/data/cache.js");

const TEST_PROVIDER = "test-provider";
const TEST_ENDPOINT = "test-endpoint";

test.afterEach(() => {
  const dir = path.join(cache.RAW_API_ROOT, TEST_PROVIDER);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
});

test("cache: requestHash est stable quel que soit l'ordre des cles des params (canonicalisation)", () => {
  const h1 = cache.requestHash("p", "e", { b: 2, a: 1 });
  const h2 = cache.requestHash("p", "e", { a: 1, b: 2 });
  assert.equal(h1, h2, "l'ordre des cles ne doit jamais changer le hash");
});

test("cache: requestHash differe si les params different reellement", () => {
  const h1 = cache.requestHash("p", "e", { league: 39, season: 2024 });
  const h2 = cache.requestHash("p", "e", { league: 39, season: 2025 });
  assert.notEqual(h1, h2);
});

test("cache: write puis read retrouve exactement le meme contenu", () => {
  const params = { league: 39, season: 2024 };
  const body = { response: [{ fixture: { id: 1 } }] };
  const result = cache.writeSnapshot(TEST_PROVIDER, TEST_ENDPOINT, params, {
    body, httpStatus: 200, pagingCurrent: 1, pagingTotal: 1,
  });
  assert.ok(result.created);
  const latest = cache.getLatestCached(TEST_PROVIDER, TEST_ENDPOINT, params);
  assert.deepEqual(latest.body, body);
  assert.equal(latest.http_status, 200);
});

test("cache: un appel deja cache est retrouve sans nouvelle ecriture (meme response_hash -> pas de doublon)", () => {
  const params = { league: 39, season: 2024 };
  const body = { response: [{ fixture: { id: 1 } }] };
  cache.writeSnapshot(TEST_PROVIDER, TEST_ENDPOINT, params, { body, httpStatus: 200 });
  const second = cache.writeSnapshot(TEST_PROVIDER, TEST_ENDPOINT, params, { body, httpStatus: 200 });
  assert.equal(second.created, false, "une reponse identique ne doit pas creer un second fichier");
  const snapshots = cache.listCachedSnapshots(TEST_PROVIDER, TEST_ENDPOINT, params);
  assert.equal(snapshots.length, 1);
});

test("cache: une reponse DIFFERENTE pour les memes params cree un NOUVEAU snapshot, jamais un ecrasement", () => {
  const params = { league: 39, season: 2024 };
  const bodyV1 = { response: [{ fixture: { id: 1 }, goals: { home: 1, away: 0 } }] };
  const bodyV2 = { response: [{ fixture: { id: 1 }, goals: { home: 2, away: 0 } }] }; // correction API ulterieure
  cache.writeSnapshot(TEST_PROVIDER, TEST_ENDPOINT, params, { body: bodyV1, retrievedAt: "2026-01-01T00:00:00.000Z" });
  cache.writeSnapshot(TEST_PROVIDER, TEST_ENDPOINT, params, { body: bodyV2, retrievedAt: "2026-01-02T00:00:00.000Z" });
  const snapshots = cache.listCachedSnapshots(TEST_PROVIDER, TEST_ENDPOINT, params);
  assert.equal(snapshots.length, 2, "deux versions distinctes doivent produire deux fichiers, jamais un seul ecrase");
  const latest = cache.getLatestCached(TEST_PROVIDER, TEST_ENDPOINT, params);
  assert.deepEqual(latest.body, bodyV2, "getLatestCached doit renvoyer la version la plus recente");
});

test("cache: getLatestCached renvoie null si rien n'est en cache (jamais une valeur fabriquee)", () => {
  const result = cache.getLatestCached(TEST_PROVIDER, "endpoint-jamais-appele", { x: 1 });
  assert.equal(result, null);
});
