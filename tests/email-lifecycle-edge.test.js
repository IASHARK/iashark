"use strict";
// Fonctions Edge send-lifecycle-emails et email-unsubscribe (handler.ts,
// dependances injectees) : secret interne, no-op sans Resend, reservation
// avant envoi, en-tetes List-Unsubscribe, journaux sans email, desinscription
// par jeton signe. Aucun appel reseau reel.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const L = require("../lib/lifecycle-email.js");

const ROOT = path.join(__dirname, "..");
const SEND_DIR = path.join(ROOT, "supabase", "functions", "send-lifecycle-emails");
const UNSUB_DIR = path.join(ROOT, "supabase", "functions", "email-unsubscribe");
const loadSend = () => import(pathToFileURL(path.join(SEND_DIR, "handler.ts")).href);
const loadUnsub = () => import(pathToFileURL(path.join(UNSUB_DIR, "handler.ts")).href);

const INTERNAL = "test-internal-secret-0123456789";
const UNSUB_SECRET = "test-unsubscribe-secret-0123456789abcdef";
const NOW = new Date("2026-09-17T10:00:00Z");
const DAY = 86400000;
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const EMAIL = "client.relance@example.com";
const RESEND = "https://api.resend.com/emails";
const DATA = "https://iashark.com/data-home.json";
const COMPANY = { COMPANY_OPERATOR_NAME: "Exploitant Test", COMPANY_ADDRESS: "1 rue de Test, Paris" };
const ago = (d) => new Date(NOW - d * DAY).toISOString();

const MATCHS = [
  { id: 1570385, sport: "football", home: { n: "Barcelona" }, away: { n: "Racing Santander" }, date: "2026-09-17 21:30", league: "La Liga", is_free: true, c1: 1.87 },
  { id: 2001, sport: "football", home: { n: "Paris SG" }, away: { n: "Marseille" }, date: "2026-09-19 21:00", league: "Ligue 1" }
];

function row(over) {
  return Object.assign({
    user_id: USER, email: EMAIL, plan: "free", role: "customer", market: "fr", locale: "fr",
    marketing_opt_in: true, notify_weekly_recap: true, has_subscription: false, suppressed: false,
    created_at: ago(2.5), last_sign_in_at: ago(2.5), last_funnel_at: null, last_activity_at: ago(2.5), last_engagement_at: ago(2.5),
    last_marketing_sent_at: null, sent_keys: ["welcome:"], campaign: "free_match", campaign_key: ""
  }, over || {});
}

function makeDeps(opts) {
  opts = opts || {};
  const env = Object.assign({ EMAIL_INTERNAL_SECRET: INTERNAL, EMAIL_UNSUBSCRIBE_SECRET: UNSUB_SECRET, SUPABASE_URL: "https://example.supabase.co" }, opts.env || {});
  const calls = [], logs = [], db = { listed: 0, reserved: [], completed: [] };
  let nextId = 1;
  const store = opts.db === null ? null : {
    listCandidates: async (args) => { db.listed++; db.args = args; return opts.rows || [row()]; },
    reserveSend: async (args) => { db.reserved.push(args); return opts.reserve === null ? null : nextId++; },
    completeSend: async (args) => { db.completed.push(args); }
  };
  const routes = Object.assign({ [DATA]: { body: { matchs: MATCHS } } }, opts.routes || {});
  const deps = {
    env: (k) => env[k],
    now: () => NOW,
    log: { info: (m) => logs.push(["info", m]), warn: (m) => logs.push(["warn", m]), error: (m) => logs.push(["error", m]) },
    db: store,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      const r = routes[String(url)];
      if (!r) throw new Error("fetch inattendu : " + url);
      if (r.throws) throw new Error("reseau");
      return new Response(JSON.stringify(r.body || {}), { status: r.status || 200, headers: { "Content-Type": "application/json" } });
    }
  };
  return { deps, calls, logs, db };
}

function post(body, secret) {
  const headers = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-internal-secret"] = secret === undefined ? INTERNAL : secret;
  return new Request("https://example.supabase.co/functions/v1/send-lifecycle-emails", { method: "POST", headers, body: body === undefined ? "{}" : JSON.stringify(body) });
}

const SENDING = Object.assign({ RESEND_API_KEY: "re_test_key", EMAIL_FROM: "IASHARK <news@iashark.com>" }, COMPANY);

// ---------------------------------------------------------- send-lifecycle-emails

test("send-lifecycle-emails : POST serveur avec secret interne uniquement, aucun en-tete CORS", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps({ env: SENDING });
  assert.equal((await handleRequest(new Request("https://x/fn", { method: "GET" }), t.deps)).status, 405);
  assert.equal((await handleRequest(post({}, null), t.deps)).status, 401);
  assert.equal((await handleRequest(post({}, "mauvais"), t.deps)).status, 401);
  assert.equal((await handleRequest(post({ limit: 5000 }), t.deps)).status, 400);
  const res = await handleRequest(post({}), makeDeps({ env: { EMAIL_INTERNAL_SECRET: "" } }).deps);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  for (const f of ["handler.ts", "index.ts"]) assert.doesNotMatch(fs.readFileSync(path.join(SEND_DIR, f), "utf8"), /Access-Control-Allow-Origin/i);
  assert.equal(t.calls.length, 0);
  assert.equal(t.db.listed, 0);
});

test("RESEND_API_KEY absent : no-op propre, aucune lecture de la base, aucun appel reseau", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps();
  const res = await handleRequest(post({}), t.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, processed: false, reason: "resend_not_configured" });
  assert.equal(t.db.listed, 0);
  assert.equal(t.calls.length, 0);
  assert.ok(t.logs.some((l) => /RESEND_API_KEY absent/.test(l[1])));
});

test("configuration incomplete (secret de desinscription, expediteur, base) : no-op explicite", async () => {
  const { handleRequest } = await loadSend();
  let t = makeDeps({ env: Object.assign({}, SENDING, { EMAIL_UNSUBSCRIBE_SECRET: "trop-court", EMAIL_FROM: "" }) });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.processed, body.reason, body.missing], [false, "not_configured", ["EMAIL_UNSUBSCRIBE_SECRET", "EMAIL_FROM"]]);
  t = makeDeps({ env: SENDING, db: null });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual(body.missing, ["SUPABASE_SERVICE_ROLE_KEY"]);
  assert.equal(t.calls.length, 0);
});

test("dryRun (sans Resend) : selection et rendu complets, rien reserve ni envoye, log masque", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps({ env: COMPANY });
  const res = await handleRequest(post({ dryRun: true, limit: 10 }), t.deps);
  const body = await res.json();
  assert.deepEqual([res.status, body.processed, body.dryRun, body.checked, body.notSent, body.sent], [200, true, true, 1, 1, 0]);
  assert.deepEqual(t.db.args, { nowIso: NOW.toISOString(), limit: 10 });
  assert.equal(t.db.reserved.length, 0);
  assert.ok(!t.calls.some((c) => c.url === RESEND));
  const logs = t.logs.map((l) => l[1]).join("\n");
  assert.match(logs, /c\*\*\*@example\.com/);
  assert.ok(!logs.includes(EMAIL) && !logs.includes(USER), "ni email ni identifiant en clair");
  assert.ok(!JSON.stringify(body).includes(USER) && !JSON.stringify(body).includes(EMAIL));
});

test("envoi : reservation puis Resend (idempotence, List-Unsubscribe en 1 clic) puis journal 'sent'", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps({ env: SENDING, routes: { [RESEND]: { body: { id: "email_42" } } } });
  const res = await handleRequest(post({}), t.deps);
  const body = await res.json();
  assert.deepEqual([res.status, body.sent, body.failed], [200, 1, 0]);
  assert.deepEqual(t.db.reserved, [{ userId: USER, campaign: "free_match", key: "", market: "fr" }]);
  assert.deepEqual(t.db.completed, [{ id: 1, status: "sent", messageId: "email_42", error: null }]);
  const call = t.calls.find((c) => c.url === RESEND);
  assert.equal(call.init.headers.Authorization, "Bearer re_test_key");
  assert.equal(call.init.headers["Idempotency-Key"], "lifecycle:free_match:" + USER + ":once");
  const payload = JSON.parse(call.init.body);
  assert.deepEqual(payload.to, [EMAIL]);
  assert.equal(payload.from, "IASHARK <news@iashark.com>");
  assert.equal(payload.subject, "Le match offert du jour : Barcelona – Racing Santander");
  assert.match(payload.headers["List-Unsubscribe"], /^<https:\/\/example\.supabase\.co\/functions\/v1\/email-unsubscribe\?t=v1\.[^>]+>$/);
  assert.equal(payload.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const token = decodeURIComponent(payload.headers["List-Unsubscribe"].match(/t=([^>]+)>/)[1]);
  const v = await L.verifyUnsubscribeToken(token, UNSUB_SECRET, NOW);
  assert.deepEqual([v.ok, v.userId, v.dir], [true, USER, "fr"]);
  assert.ok(payload.text.includes("https://iashark.com/fr/desinscription-email.html#t="));
  assert.doesNotMatch(payload.text + payload.html, /1[.,]87/, "aucune cote");
  assert.deepEqual(payload.tags, [{ name: "category", value: "lifecycle_free_match" }, { name: "market", value: "fr" }]);
  assert.ok(!t.logs.map((l) => l[1]).join("\n").includes(EMAIL));
});

test("jamais deux fois : reservation refusee = aucun appel Resend", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps({ env: SENDING, reserve: null, routes: { [RESEND]: { body: { id: "x" } } } });
  const body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.sent, body.skipped, body.results[0].reason], [0, 1, "already_reserved"]);
  assert.ok(!t.calls.some((c) => c.url === RESEND));
});

test("regles SQL et JS en desaccord, consentement absent, Pro : rien n'est envoye", async () => {
  const { handleRequest } = await loadSend();
  const rows = [
    row({ campaign: "pro_features" }),
    row({ marketing_opt_in: false }),
    row({ plan: "pro", created_at: ago(6), last_sign_in_at: ago(6), sent_keys: ["welcome:", "free_match:"], campaign: "pro_features" }),
    row({ email: "pas-un-email" })
  ];
  const t = makeDeps({ env: SENDING, rows, routes: { [RESEND]: { body: { id: "x" } } } });
  const body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual(body.results.map((r) => r.reason), ["rule_mismatch", "not_opted_in", "rule_mismatch", "invalid_email"]);
  assert.equal(body.sent, 0);
  assert.equal(t.db.reserved.length, 0);
  assert.ok(t.logs.some((l) => l[0] === "warn" && /divergentes/.test(l[1])));
});

test("identite expediteur manquante (BLOCKED_DECISION) : non envoye sauf EMAIL_ALLOW_BLOCKED_DECISION=true", async () => {
  const { handleRequest } = await loadSend();
  let t = makeDeps({ env: { RESEND_API_KEY: "re", EMAIL_FROM: "a@iashark.com" }, routes: { [RESEND]: { body: { id: "x" } } } });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.sent, body.notSent, body.results[0].reason], [0, 1, "blocked_decision_placeholders"]);
  assert.equal(t.db.reserved.length, 0);
  t = makeDeps({ env: { RESEND_API_KEY: "re", EMAIL_FROM: "a@iashark.com", EMAIL_ALLOW_BLOCKED_DECISION: "true" }, routes: { [RESEND]: { body: { id: "x" } } } });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.sent, 1);
});

test("contenu public absent : match offert ou matchs du week-end manquants = aucun email invente", async () => {
  const { handleRequest } = await loadSend();
  let t = makeDeps({ env: SENDING, routes: { [DATA]: { body: { matchs: [MATCHS[1]] } }, [RESEND]: { body: { id: "x" } } } });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.results[0].reason, "no_free_match");
  t = makeDeps({ env: SENDING, routes: { [DATA]: { status: 503 } } });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.results[0].reason, "public_data_unavailable");
  const weekly = row({ plan: "pro", created_at: ago(40), last_sign_in_at: ago(2), campaign: "pro_weekly_summary", campaign_key: "2026-W38" });
  t = makeDeps({ env: SENDING, rows: [weekly], routes: { [DATA]: { body: { matchs: [MATCHS[0]] } } } });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.results[0].reason, "no_weekend_matches");
  assert.ok(!t.calls.some((c) => c.url === RESEND));
});

test("bienvenue : envoyee meme sans match publie ; erreurs Resend journalisees en 'failed' (207)", async () => {
  const { handleRequest } = await loadSend();
  const welcome = row({ created_at: ago(0.1), last_sign_in_at: ago(0.1), sent_keys: [], marketing_opt_in: false, campaign: "welcome" });
  let t = makeDeps({ env: SENDING, rows: [welcome], routes: { [DATA]: { throws: true }, [RESEND]: { body: { id: "w1" } } } });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.sent, 1);
  assert.ok(JSON.parse(t.calls.find((c) => c.url === RESEND).init.body).text.includes("que les emails liés à votre compte"));

  t = makeDeps({ env: SENDING, routes: { [RESEND]: { status: 500, body: { message: "boom" } } } });
  const res = await handleRequest(post({}), t.deps);
  body = await res.json();
  assert.deepEqual([res.status, body.failed], [207, 1]);
  assert.deepEqual(t.db.completed, [{ id: 1, status: "failed", messageId: null, error: "resend_http_500" }]);
});

// ---------------------------------------------------------- email-unsubscribe

function makeUnsubDeps(opts) {
  opts = opts || {};
  const env = Object.assign({ EMAIL_UNSUBSCRIBE_SECRET: UNSUB_SECRET }, opts.env || {});
  const calls = [], logs = [];
  const db = opts.db === null ? null : {
    unsubscribe: async (args) => { calls.push(args); if (opts.fail) throw new Error("db down"); return opts.status || "unsubscribed"; }
  };
  return { deps: { env: (k) => env[k], now: () => NOW, log: { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) }, db }, calls, logs };
}

const tokenFor = (dir, ttl) => L.createUnsubscribeToken({ userId: USER, dir: dir || "gb" }, UNSUB_SECRET, NOW, ttl);
const pagePost = (token, origin) => new Request("https://example.supabase.co/functions/v1/email-unsubscribe", {
  method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, origin ? { Origin: origin } : {}), body: JSON.stringify({ token })
});

test("email-unsubscribe : page du site (JSON + CORS limite a iashark.com), statut et repertoire renvoyes", async () => {
  const { handleRequest } = await loadUnsub();
  const t = makeUnsubDeps();
  const res = await handleRequest(pagePost(await tokenFor("gb"), "https://iashark.com"), t.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: "unsubscribed", dir: "gb" });
  assert.equal(res.headers.get("access-control-allow-origin"), "https://iashark.com");
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(t.calls, [{ userId: USER, source: "link" }]);
  assert.ok(!t.logs.join("\n").includes(USER), "aucun identifiant dans les journaux");

  const pre = await handleRequest(new Request("https://x/fn", { method: "OPTIONS", headers: { Origin: "https://iashark.com" } }), t.deps);
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-methods"), /POST/);
  const other = await handleRequest(pagePost(await tokenFor("gb"), "https://evil.example"), makeUnsubDeps().deps);
  assert.equal(other.headers.get("access-control-allow-origin"), null);
});

test("email-unsubscribe : desinscription en 1 clic RFC 8058 (client mail), GET ne desinscrit jamais", async () => {
  const { handleRequest } = await loadUnsub();
  const t = makeUnsubDeps({ status: "already_unsubscribed" });
  const token = await tokenFor("fr");
  const res = await handleRequest(new Request("https://example.supabase.co/functions/v1/email-unsubscribe?t=" + encodeURIComponent(token), {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click"
  }), t.deps);
  assert.deepEqual([res.status, (await res.json()).status], [200, "already_unsubscribed"]);
  assert.deepEqual(t.calls, [{ userId: USER, source: "one_click" }]);

  const g = makeUnsubDeps();
  const get = await handleRequest(new Request("https://example.supabase.co/functions/v1/email-unsubscribe?t=" + encodeURIComponent(token)), g.deps);
  assert.equal(get.status, 405);
  assert.equal(g.calls.length, 0);
});

test("email-unsubscribe : jeton falsifie, expire, absent ; secret ou base manquants ; erreur base", async () => {
  const { handleRequest } = await loadUnsub();
  const t = makeUnsubDeps();
  const token = await tokenFor("fr");
  let res = await handleRequest(pagePost(token.slice(0, -3) + "abc"), t.deps);
  assert.deepEqual([res.status, (await res.json()).error], [400, "invalid_token"]);
  res = await handleRequest(pagePost(await tokenFor("mx", -1)), t.deps);
  assert.deepEqual([res.status, (await res.json()).error], [410, "expired_token"]);
  res = await handleRequest(pagePost(""), t.deps);
  assert.equal(res.status, 400);
  res = await handleRequest(new Request("https://x/fn", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{pas du json" }), t.deps);
  assert.equal(res.status, 400);
  assert.equal(t.calls.length, 0, "aucune ecriture sans jeton valide");

  assert.equal((await handleRequest(pagePost(token), makeUnsubDeps({ env: { EMAIL_UNSUBSCRIBE_SECRET: "court" } }).deps)).status, 503);
  assert.equal((await handleRequest(pagePost(token), makeUnsubDeps({ db: null }).deps)).status, 503);
  assert.equal((await handleRequest(pagePost(token), makeUnsubDeps({ fail: true }).deps)).status, 500);
  assert.equal((await handleRequest(new Request("https://x/fn", { method: "POST", body: "x".repeat(5000) }), t.deps)).status, 413);
});

test("index.ts : branchements RPC et deploiement sans verification JWT documente", () => {
  const send = fs.readFileSync(path.join(SEND_DIR, "index.ts"), "utf8");
  for (const rpc of ["lifecycle_email_candidates", "email_reserve_send", "email_complete_send"]) assert.ok(send.includes('rpc("' + rpc + '"'), rpc);
  const unsub = fs.readFileSync(path.join(UNSUB_DIR, "index.ts"), "utf8");
  assert.ok(unsub.includes('rpc("email_unsubscribe"'));
  assert.match(unsub, /--no-verify-jwt/);
  const sql = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "0024_email_preferences.sql"), "utf8");
  for (const fn of ["lifecycle_email_candidates(p_now timestamptz", "email_reserve_send(p_user_id uuid, p_campaign text, p_campaign_key text, p_market text", "email_complete_send(p_id bigint, p_status text, p_message_id text", "email_unsubscribe(p_user_id uuid, p_source text)"]) {
    assert.ok(sql.includes(fn), "signature SQL " + fn);
  }
});
