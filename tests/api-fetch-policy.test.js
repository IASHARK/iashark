"use strict";
// OPERATIONAL_FIX (2026-09-06). Tests deterministes de lib/api-fetch-policy.js
// (rate-limit != donnee absente, queue/throttling, cache, retry/backoff).
// Aucun vrai reseau ni vrai timer : rawFetch/sleepFn/nowFn sont tous
// injectes pour un comportement 100% deterministe et rapide.

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  classifyApiResponse,
  shouldRetryRateLimit,
  backoffDelayMs,
  decideSeasonFallback,
  decideCurrentSeasonGate,
  createApiCache,
  createThrottledFetcher,
} = require("../lib/api-fetch-policy.js");

test("classifyApiResponse : distingue RATE_LIMIT, API_ERROR et OK", () => {
  assert.equal(classifyApiResponse({ errors: { requests: "Too many requests" }, response: [] }), "RATE_LIMIT");
  assert.equal(classifyApiResponse({ errors: { requests: "You have reached the request limit" }, response: [] }), "RATE_LIMIT");
  assert.equal(classifyApiResponse({ errors: { referee: "The Referee field do not exist" }, response: [] }), "API_ERROR");
  assert.equal(classifyApiResponse({ errors: { h2h: "The H2h field do not exist" }, response: [] }), "API_ERROR");
  assert.equal(classifyApiResponse({ response: [] }), "OK");
  assert.equal(classifyApiResponse({ response: [{ id: 1 }] }), "OK");
  assert.equal(classifyApiResponse({ __ia_network_error: true }), "API_ERROR");
  assert.equal(classifyApiResponse(null), "API_ERROR");
});

test("decideSeasonFallback : 429/erreur API -> JAMAIS de fallback de saison, meme si la reponse est vide", () => {
  assert.equal(decideSeasonFallback({ status: "RATE_LIMIT", isEmpty: true }).fallback, false);
  assert.equal(decideSeasonFallback({ status: "RATE_LIMIT", isEmpty: true }).reason, "RATE_LIMIT_NO_FALLBACK");
  assert.equal(decideSeasonFallback({ status: "API_ERROR", isEmpty: true }).fallback, false);
});

test("decideSeasonFallback : reponse OK et reellement vide -> fallback autorise (comportement legitime early-season)", () => {
  const d = decideSeasonFallback({ status: "OK", isEmpty: true });
  assert.equal(d.fallback, true);
  assert.equal(d.reason, "EMPTY_CONFIRMED_FALLBACK_ALLOWED");
});

test("decideSeasonFallback : reponse OK et non-vide -> pas besoin de fallback", () => {
  assert.equal(decideSeasonFallback({ status: "OK", isEmpty: false }).fallback, false);
});

test("decideCurrentSeasonGate : rate-limit sur une seule equipe -> dataQualityOk=false, jamais un modelDataAvailable silencieux", () => {
  const g = decideCurrentSeasonGate({ statusHome: "RATE_LIMIT", statusAway: "OK" });
  assert.equal(g.dataQualityOk, false);
  assert.equal(g.reason, "DATA_QUALITY_FAIL_RATE_LIMIT");
});

test("decideCurrentSeasonGate : les deux equipes OK (meme si stats vides - vrai debut de saison) -> dataQualityOk=true", () => {
  const g = decideCurrentSeasonGate({ statusHome: "OK", statusAway: "OK" });
  assert.equal(g.dataQualityOk, true);
  assert.equal(g.reason, null);
});

test("decideCurrentSeasonGate : API_ERROR (non-quota) traite comme rate-limit pour la decision - jamais de fallback silencieux non plus", () => {
  const g = decideCurrentSeasonGate({ statusHome: "OK", statusAway: "API_ERROR" });
  assert.equal(g.dataQualityOk, false);
  assert.equal(g.reason, "DATA_QUALITY_FAIL_API_ERROR");
});

test("shouldRetryRateLimit / backoffDelayMs : retry uniquement sur RATE_LIMIT, backoff strictement croissant", () => {
  assert.equal(shouldRetryRateLimit("RATE_LIMIT", 0, 2), true);
  assert.equal(shouldRetryRateLimit("RATE_LIMIT", 2, 2), false);
  assert.equal(shouldRetryRateLimit("API_ERROR", 0, 2), false, "API_ERROR non-quota ne doit jamais etre retente en boucle");
  assert.equal(shouldRetryRateLimit("OK", 0, 2), false);
  assert.ok(backoffDelayMs(2, 800) > backoffDelayMs(1, 800));
});

test("createThrottledFetcher : cache valide -> aucun nouvel appel reseau, cache_hits incremente", async () => {
  let realCalls = 0;
  const fetcher = createThrottledFetcher(
    async () => { realCalls++; return { response: [{ id: 1 }] }; },
    { sleepFn: async () => {}, minIntervalMs: 0 }
  );
  const r1 = await fetcher.fetchWithPolicy("https://x/ok");
  const r2 = await fetcher.fetchWithPolicy("https://x/ok");
  assert.equal(realCalls, 1, "le 2e appel sur la meme URL ne doit jamais retaper le reseau");
  assert.equal(fetcher.stats.cache_hits, 1);
  assert.equal(fetcher.stats.calls, 1);
  assert.deepEqual(r1.parsed, r2.parsed);
});

test("createThrottledFetcher : 429 -> retry avec backoff, jamais un martelement immediat, puis succes si le retry reussit", async () => {
  let calls = 0;
  const sleeps = [];
  const fetcher = createThrottledFetcher(
    async () => { calls++; return calls < 2 ? { errors: { requests: "Too many requests" }, response: [] } : { response: [{ id: 42 }] }; },
    { sleepFn: async (ms) => { sleeps.push(ms); }, minIntervalMs: 0, maxRetries: 2, baseBackoffMs: 100 }
  );
  const r = await fetcher.fetchWithPolicy("https://x/flaky");
  assert.equal(r.status, "OK");
  assert.equal(calls, 2, "doit reessayer une fois apres le premier 429");
  assert.equal(fetcher.stats.rate_limit_retries, 1);
  assert.equal(fetcher.stats.rate_limit_failures, 0);
  assert.ok(sleeps.includes(100), "le backoff doit etre applique avant le retry");
});

test("createThrottledFetcher : 429 non resolu apres tous les retries -> rate_limit_failures, jamais mis en cache comme une reponse OK", async () => {
  let calls = 0;
  const fetcher = createThrottledFetcher(
    async () => { calls++; return { errors: { requests: "Too many requests" }, response: [] }; },
    { sleepFn: async () => {}, minIntervalMs: 0, maxRetries: 2, baseBackoffMs: 1 }
  );
  const r = await fetcher.fetchWithPolicy("https://x/always-limited");
  assert.equal(r.status, "RATE_LIMIT");
  assert.equal(calls, 3, "1 appel initial + 2 retries, jamais un martelement illimite");
  assert.equal(fetcher.stats.rate_limit_failures, 1);
  assert.equal(fetcher.cache.get("https://x/always-limited"), null, "une reponse en echec ne doit jamais etre mise en cache");
});

test("createThrottledFetcher : jamais plus d'appels que necessaire pour 2 URLs differentes deja en cache", async () => {
  let calls = 0;
  const fetcher = createThrottledFetcher(
    async (url) => { calls++; return { response: [{ url }] }; },
    { sleepFn: async () => {}, minIntervalMs: 0 }
  );
  await fetcher.fetchWithPolicy("https://x/a");
  await fetcher.fetchWithPolicy("https://x/b");
  await fetcher.fetchWithPolicy("https://x/a");
  await fetcher.fetchWithPolicy("https://x/b");
  assert.equal(calls, 2);
  assert.equal(fetcher.stats.cache_hits, 2);
});

test("createApiCache : ne met jamais en cache un statut non-OK", () => {
  const cache = createApiCache();
  cache.set("u1", "RATE_LIMIT", { errors: { requests: "x" } });
  cache.set("u2", "API_ERROR", { errors: { referee: "x" } });
  cache.set("u3", "OK", { response: [1] });
  assert.equal(cache.get("u1"), null);
  assert.equal(cache.get("u2"), null);
  assert.deepEqual(cache.get("u3"), { response: [1] });
  assert.equal(cache.size(), 1);
});
