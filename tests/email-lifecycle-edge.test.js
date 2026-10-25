"use strict";
// Fonctions Edge send-lifecycle-emails et email-unsubscribe (handler.ts,
// dependances injectees) : secret d'appel, envoi par Brevo (meme methode que
// relance-emails), envoi reel desactive tant que LIFECYCLE_SENDING_ENABLED n'est
// pas pose, region us-east-2, reservation avant envoi, en-tetes List-Unsubscribe,
// modes apercu et test (patron seulement), journaux sans email, desinscription
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
const RELANCE = "test-relance-secret-0123456789abcdef0123";
const UNSUB_SECRET = "test-unsubscribe-secret-0123456789abcdef";
const NOW = new Date("2026-09-17T10:00:00Z");
const DAY = 86400000;
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const BOSS = "1a2b3c4d-0000-4000-8000-00000000b055";
const EMAIL = "client.relance@example.com";
const BREVO = "https://api.brevo.com/v3/smtp/email";
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
    created_at: ago(2.5), last_sign_in_at: ago(2.5), last_funnel_at: null, last_checkout_at: null, last_activity_at: ago(2.5), last_engagement_at: ago(2.5),
    last_marketing_sent_at: null, sent_keys: ["welcome:"], campaign: "free_match", campaign_key: ""
  }, over || {});
}

function makeDeps(opts) {
  opts = opts || {};
  const env = Object.assign({ EMAIL_INTERNAL_SECRET: INTERNAL, EMAIL_UNSUBSCRIBE_SECRET: UNSUB_SECRET, SUPABASE_URL: "https://example.supabase.co" }, opts.env || {});
  const calls = [], logs = [], db = { listed: 0, reserved: [], completed: [], lookups: [] };
  let nextId = 1;
  const store = opts.db === null ? null : {
    listCandidates: async (args) => { db.listed++; db.args = args; return opts.rows || [row()]; },
    reserveSend: async (args) => { db.reserved.push(args); return opts.reserve === null ? null : nextId++; },
    completeSend: async (args) => { db.completed.push(args); },
    findAccount: async (email) => { db.lookups.push(email); return opts.account === null ? null : { userId: BOSS }; }
  };
  const routes = Object.assign({ [DATA]: { body: { matchs: MATCHS } } }, opts.routes || {});
  const deps = {
    env: (k) => env[k],
    now: () => opts.now || NOW,
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

function post(body, headers) {
  const h = Object.assign({ "Content-Type": "application/json", "x-internal-secret": INTERNAL }, headers || {});
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return new Request("https://example.supabase.co/functions/v1/send-lifecycle-emails", { method: "POST", headers: h, body: body === undefined ? "{}" : JSON.stringify(body) });
}

// Envoi reel active (mise en route) + Brevo + identite de l'expediteur.
const SENDING = Object.assign({ BREVO_API_KEY: "xkeysib-test", LIFECYCLE_SENDING_ENABLED: "true", SB_REGION: "us-east-2" }, COMPANY);
const brevoCalls = (t) => t.calls.filter((c) => c.url === BREVO);

// ---------------------------------------------------------- send-lifecycle-emails

test("send-lifecycle-emails : POST serveur avec secret interne OU secret de relance, aucun en-tete CORS", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps({ env: SENDING });
  assert.equal((await handleRequest(new Request("https://x/fn", { method: "GET" }), t.deps)).status, 405);
  assert.equal((await handleRequest(post({}, { "x-internal-secret": null }), t.deps)).status, 401);
  assert.equal((await handleRequest(post({}, { "x-internal-secret": "mauvais" }), t.deps)).status, 401);
  assert.equal((await handleRequest(post({ limit: 5000 }), t.deps)).status, 400);
  assert.equal((await handleRequest(post({ mode: "envoi_reel" }), t.deps)).status, 400, "mode inconnu");
  const res = await handleRequest(post({}), makeDeps({ env: { EMAIL_INTERNAL_SECRET: "" } }).deps);
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  for (const f of ["handler.ts", "index.ts"]) assert.doesNotMatch(fs.readFileSync(path.join(SEND_DIR, f), "utf8"), /Access-Control-Allow-Origin/i);
  assert.equal(t.calls.length, 0);
  assert.equal(t.db.listed, 0);
  // Workflow GitHub : x-relance-secret (RELANCE_SECRET, 32 caracteres minimum).
  const r = makeDeps({ env: Object.assign({}, SENDING, { EMAIL_INTERNAL_SECRET: "", RELANCE_SECRET: RELANCE }), routes: { [BREVO]: { status: 201, body: { messageId: "<m1@brevo>" } } } });
  assert.equal((await handleRequest(post({ dryRun: true }, { "x-internal-secret": null, "x-relance-secret": RELANCE }), r.deps)).status, 200);
  assert.equal((await handleRequest(post({ dryRun: true }, { "x-internal-secret": null, "x-relance-secret": RELANCE.slice(0, -1) + "x" }), r.deps)).status, 401);
  const court = makeDeps({ env: { EMAIL_INTERNAL_SECRET: "", RELANCE_SECRET: "trop-court" } });
  assert.equal((await handleRequest(post({}, { "x-internal-secret": null, "x-relance-secret": "trop-court" }), court.deps)).status, 503, "secret de relance trop court = non configure");
});

test("envoi reel desactive (LIFECYCLE_SENDING_ENABLED absent) : no-op, aucune lecture de la base, aucun appel reseau", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps({ env: Object.assign({}, SENDING, { LIFECYCLE_SENDING_ENABLED: "" }) });
  const res = await handleRequest(post({}), t.deps);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, processed: false, reason: "sending_disabled" });
  assert.equal(t.db.listed, 0);
  assert.equal(t.calls.length, 0);
  assert.ok(t.logs.some((l) => /envoi reel desactive/.test(l[1])));
});

test("BREVO_API_KEY absent : no-op propre, aucune lecture de la base, aucun appel reseau", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps({ env: Object.assign({}, SENDING, { BREVO_API_KEY: "" }) });
  const res = await handleRequest(post({}), t.deps);
  assert.deepEqual(await res.json(), { ok: true, processed: false, reason: "brevo_not_configured" });
  assert.equal(t.db.listed, 0);
  assert.equal(t.calls.length, 0);
  assert.ok(t.logs.some((l) => /BREVO_API_KEY absent/.test(l[1])));
});

test("configuration incomplete (secret de desinscription, base) : no-op explicite ; hors region us-east-2 : rien n'est envoye", async () => {
  const { handleRequest } = await loadSend();
  let t = makeDeps({ env: Object.assign({}, SENDING, { EMAIL_UNSUBSCRIBE_SECRET: "trop-court" }) });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.processed, body.reason, body.missing], [false, "not_configured", ["EMAIL_UNSUBSCRIBE_SECRET"]]);
  t = makeDeps({ env: SENDING, db: null });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual(body.missing, ["SUPABASE_SERVICE_ROLE_KEY"]);
  assert.equal(t.calls.length, 0);
  // Brevo n'accepte que les adresses IP de us-east-2 : appel ailleurs = refus avant toute lecture.
  t = makeDeps({ env: Object.assign({}, SENDING, { SB_REGION: "eu-west-3" }) });
  const res = await handleRequest(post({}), t.deps);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "wrong_region");
  assert.equal(t.db.listed, 0);
  assert.equal(brevoCalls(t).length, 0);
});

test("dryRun (sans Brevo ni envoi reel) : selection et rendu complets, rien reserve ni envoye, log masque", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps({ env: COMPANY });
  const res = await handleRequest(post({ dryRun: true, limit: 10 }), t.deps);
  const body = await res.json();
  assert.deepEqual([res.status, body.processed, body.dryRun, body.checked, body.notSent, body.sent], [200, true, true, 1, 1, 0]);
  assert.deepEqual(t.db.args, { nowIso: NOW.toISOString(), limit: 10 });
  assert.equal(t.db.reserved.length, 0);
  assert.equal(brevoCalls(t).length, 0);
  const logs = t.logs.map((l) => l[1]).join("\n");
  assert.match(logs, /c\*\*\*@example\.com/);
  assert.ok(!logs.includes(EMAIL) && !logs.includes(USER), "ni email ni identifiant en clair");
  assert.ok(!JSON.stringify(body).includes(USER) && !JSON.stringify(body).includes(EMAIL));
});

test("envoi : reservation puis Brevo (meme expediteur que la relance, desinscription en 1 clic) puis journal 'sent'", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps({ env: SENDING, routes: { [BREVO]: { status: 201, body: { messageId: "<42@smtp-relay.brevo.com>" } } } });
  const res = await handleRequest(post({}), t.deps);
  const body = await res.json();
  assert.deepEqual([res.status, body.sent, body.failed], [200, 1, 0]);
  assert.deepEqual(t.db.reserved, [{ userId: USER, campaign: "free_match", key: "", market: "fr" }]);
  assert.deepEqual(t.db.completed, [{ id: 1, status: "sent", messageId: "<42@smtp-relay.brevo.com>", error: null }]);
  const [call] = brevoCalls(t);
  assert.equal(call.init.method, "POST");
  assert.equal(call.init.headers["api-key"], "xkeysib-test");
  const payload = JSON.parse(call.init.body);
  assert.deepEqual(payload.sender, { name: "Clément, IASHARK", email: "news@iashark.com" });
  assert.deepEqual(payload.replyTo, { email: "contact@iashark.com" });
  assert.deepEqual(payload.to, [{ email: EMAIL }]);
  assert.equal(payload.subject, "Le match offert du jour : Barcelona – Racing Santander");
  const lu = payload.headers["List-Unsubscribe"];
  assert.match(lu, /^<https:\/\/example\.supabase\.co\/functions\/v1\/email-unsubscribe\?t=v1\.[^>]+>, <https:\/\/iashark\.com\/fr\/desinscription-email\.html#t=v1\.[^>]+>$/);
  assert.equal(payload.headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
  const token = decodeURIComponent(lu.match(/\?t=([^>]+)>/)[1]);
  const v = await L.verifyUnsubscribeToken(token, UNSUB_SECRET, NOW);
  assert.deepEqual([v.ok, v.userId, v.dir], [true, USER, "fr"]);
  assert.ok(payload.textContent.includes("https://iashark.com/fr/desinscription-email.html#t="));
  assert.ok(payload.htmlContent.includes("Clément, IASHARK"), "signe Clement");
  assert.doesNotMatch(payload.textContent + payload.htmlContent, /1[.,]87/, "aucune cote");
  assert.deepEqual(payload.tags, ["lifecycle-free_match", "market-fr"]);
  assert.ok(!t.logs.map((l) => l[1]).join("\n").includes(EMAIL));
  // Expediteur personnalisable comme relance-emails.
  const c = makeDeps({ env: Object.assign({}, SENDING, { EMAIL_FROM_NAME: "IASHARK", EMAIL_FROM_ADDRESS: "bonjour@iashark.com" }), routes: { [BREVO]: { status: 201, body: { messageId: "x" } } } });
  await handleRequest(post({}), c.deps);
  assert.deepEqual(JSON.parse(brevoCalls(c)[0].init.body).sender, { name: "IASHARK", email: "bonjour@iashark.com" });
});

test("jamais deux fois : reservation refusee = aucun appel Brevo", async () => {
  const { handleRequest } = await loadSend();
  const t = makeDeps({ env: SENDING, reserve: null, routes: { [BREVO]: { status: 201, body: { messageId: "x" } } } });
  const body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.sent, body.skipped, body.results[0].reason], [0, 1, "already_reserved"]);
  assert.equal(brevoCalls(t).length, 0);
});

test("regles SQL et JS en desaccord, consentement absent, Pro, fin d'essai : rien n'est envoye", async () => {
  const { handleRequest } = await loadSend();
  const rows = [
    row({ campaign: "pro_features" }),
    row({ marketing_opt_in: false }),
    row({ plan: "pro", created_at: ago(6), last_sign_in_at: ago(6), sent_keys: ["welcome:", "free_match:"], campaign: "pro_features" }),
    row({ email: "pas-un-email" }),
    row({ campaign: "trial_ending" })
  ];
  const t = makeDeps({ env: SENDING, rows, routes: { [BREVO]: { status: 201, body: { messageId: "x" } } } });
  const body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual(body.results.map((r) => r.reason), ["rule_mismatch", "not_opted_in", "rule_mismatch", "invalid_email", "rule_mismatch"]);
  assert.equal(body.sent, 0);
  assert.equal(t.db.reserved.length, 0);
  assert.ok(t.logs.some((l) => l[0] === "warn" && /divergentes/.test(l[1])));
});

test("paiement abandonne : choisi par la base ET par le module, envoye une fois avec un bouton vers l'abonnement", async () => {
  const { handleRequest } = await loadSend();
  const abandon = row({ created_at: ago(20), last_sign_in_at: ago(1.5), last_funnel_at: ago(1.5), last_checkout_at: ago(1.5), sent_keys: ["welcome:", "free_match:", "pro_features:"], campaign: "checkout_abandoned" });
  const t = makeDeps({ env: SENDING, rows: [abandon], routes: { [BREVO]: { status: 201, body: { messageId: "m" } } } });
  const body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.sent, 1);
  assert.deepEqual(t.db.reserved, [{ userId: USER, campaign: "checkout_abandoned", key: "", market: "fr" }]);
  const payload = JSON.parse(brevoCalls(t)[0].init.body);
  assert.equal(payload.subject, "Ton abonnement Pro n'est pas allé au bout");
  assert.ok(payload.textContent.includes("Reprendre mon abonnement : https://iashark.com/fr/abonnement.html"));
  assert.ok(!t.calls.some((c) => c.url === DATA), "aucun match necessaire : data-home.json n'est pas lu");
});

test("identite expediteur manquante (BLOCKED_DECISION) : non envoye sauf EMAIL_ALLOW_BLOCKED_DECISION=true", async () => {
  const { handleRequest } = await loadSend();
  const base = { BREVO_API_KEY: "k", LIFECYCLE_SENDING_ENABLED: "true" };
  let t = makeDeps({ env: base, routes: { [BREVO]: { status: 201, body: { messageId: "x" } } } });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.sent, body.notSent, body.results[0].reason], [0, 1, "blocked_decision_placeholders"]);
  assert.equal(t.db.reserved.length, 0);
  t = makeDeps({ env: Object.assign({ EMAIL_ALLOW_BLOCKED_DECISION: "true" }, base), routes: { [BREVO]: { status: 201, body: { messageId: "x" } } } });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.sent, 1);
});

test("contenu public absent : match offert ou matchs du week-end manquants = aucun email invente", async () => {
  const { handleRequest } = await loadSend();
  // Aucun match a venir : ni designation ni repli possible.
  const passe = [Object.assign({}, MATCHS[1], { id: 2002, date: "2026-09-16 21:00" })];
  let t = makeDeps({ env: SENDING, routes: { [DATA]: { body: { matchs: passe } }, [BREVO]: { status: 201, body: { messageId: "x" } } } });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.results[0].reason, "no_free_match");
  t = makeDeps({ env: SENDING, routes: { [DATA]: { status: 503 } } });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.results[0].reason, "public_data_unavailable");
  const weekly = row({ plan: "pro", created_at: ago(40), last_sign_in_at: ago(2), campaign: "pro_weekly_summary", campaign_key: "2026-W38" });
  t = makeDeps({ env: SENDING, rows: [weekly], routes: { [DATA]: { body: { matchs: [MATCHS[0]] } } } });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.results[0].reason, "no_weekend_matches");
  assert.equal(brevoCalls(t).length, 0);
});

test("match offert sans designation : le meme repli que le site (lib/free-match.js), jamais un match deja commence", async () => {
  const { handleRequest } = await loadSend();
  const sansDesignation = MATCHS.map((m) => Object.assign({}, m, { is_free: false }));
  const t = makeDeps({ env: SENDING, routes: { [DATA]: { body: { matchs: sansDesignation } }, [BREVO]: { status: 201, body: { messageId: "x" } } } });
  await handleRequest(post({}), t.deps);
  assert.equal(JSON.parse(brevoCalls(t)[0].init.body).subject, "Le match offert du jour : Barcelona – Racing Santander");
  const soir = makeDeps({ env: SENDING, now: new Date("2026-09-17T19:45:00Z"), routes: { [BREVO]: { status: 201, body: { messageId: "x" } } } });
  const body = await (await handleRequest(post({}), soir.deps)).json();
  assert.equal(body.results[0].reason, "quiet_hours");
});

test("bienvenue : envoyee meme sans match publie ; erreurs Brevo journalisees en 'failed' (207)", async () => {
  const { handleRequest } = await loadSend();
  const welcome = row({ created_at: ago(0.1), last_sign_in_at: ago(0.1), sent_keys: [], marketing_opt_in: false, campaign: "welcome" });
  let t = makeDeps({ env: SENDING, rows: [welcome], routes: { [DATA]: { throws: true }, [BREVO]: { status: 201, body: { messageId: "w1" } } } });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.sent, 1);
  const text = JSON.parse(brevoCalls(t)[0].init.body).textContent;
  assert.ok(text.includes("tu ne recevras que ceux liés à ton compte"));
  assert.ok(text.includes("Voir les matchs du jour : https://iashark.com/fr/"));

  t = makeDeps({ env: SENDING, routes: { [BREVO]: { status: 401, body: { code: "unauthorized", message: "IP" } } } });
  const res = await handleRequest(post({}), t.deps);
  body = await res.json();
  assert.deepEqual([res.status, body.failed], [207, 1]);
  assert.deepEqual(t.db.completed, [{ id: 1, status: "failed", messageId: null, error: "brevo_http_401_unauthorized" }]);
  t = makeDeps({ env: SENDING, routes: { [BREVO]: { throws: true } } });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.results[0].reason, "brevo_network_error");
});

test("mode apercu : chaque campagne rendue dans les 9 versions (compte fictif), vrais destinataires comptes sans adresse, RIEN n'est envoye", async () => {
  const { handleRequest, OWN_CAMPAIGNS } = await loadSend();
  assert.deepEqual(OWN_CAMPAIGNS, ["welcome", "free_match", "pro_features", "checkout_abandoned", "inactive_7d", "inactive_30d", "pro_weekly_summary"]);
  const t = makeDeps({ env: SENDING });
  const res = await handleRequest(post({ mode: "apercu" }), t.deps);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(brevoCalls(t).length, 0, "aucun envoi");
  assert.equal(t.db.reserved.length, 0, "rien n'est reserve");
  assert.equal(body.candidats.lus, true);
  assert.equal(body.candidats.notSent, 1);
  assert.deepEqual(body.candidats.par_campagne_et_raison, { "free_match:dry_run": 1 });
  const fr = body.apercus.filter((a) => a.dir === "fr").map((a) => a.campaign);
  assert.deepEqual(fr, ["welcome", "welcome-sans-accord", "free_match", "pro_features", "checkout_abandoned", "inactive_7d", "inactive_30d", "pro_weekly_summary"]);
  assert.equal(new Set(body.apercus.map((a) => a.dir)).size, 9);
  for (const a of body.apercus) assert.ok(a.html.includes("desinscription-email.html#t=APERCU") && !a.html.includes("#t=v1."), a.dir + "/" + a.campaign + " : lien factice");
  const serialized = JSON.stringify(body);
  assert.ok(!serialized.includes(EMAIL) && !serialized.includes(USER), "aucune adresse ni identifiant dans la reponse (journal public)");
  assert.equal(body.pret.envoi_reel_active, true);
  assert.equal(body.pret.region, "us-east-2");
});

test("mode test : un exemplaire de chaque campagne, en francais, a la SEULE adresse du patron, rien n'est reserve", async () => {
  const { handleRequest, OWN_CAMPAIGNS } = await loadSend();
  // L'envoi reel n'a pas besoin d'etre active pour le test (patron seulement).
  const env = Object.assign({}, SENDING, { LIFECYCLE_SENDING_ENABLED: "" });
  const t = makeDeps({ env, routes: { [BREVO]: { status: 201, body: { messageId: "t" } } } });
  const res = await handleRequest(post({ mode: "test", to: "quelquun@example.com" }), t.deps);
  const body = await res.json();
  assert.equal(res.status, 200);
  const sent = brevoCalls(t).map((c) => JSON.parse(c.init.body));
  assert.ok(sent.length >= 5);
  for (const p of sent) {
    assert.deepEqual(p.to, [{ email: L.TEST_RECIPIENT }], "jamais une autre adresse, meme demandee");
    assert.match(p.subject, /^\[TEST\] /);
    assert.match(p.htmlContent, /<html lang="fr"/);
  }
  assert.equal(L.TEST_RECIPIENT, "yaramode81@gmail.com");
  assert.deepEqual(t.db.lookups, [L.TEST_RECIPIENT]);
  const token = decodeURIComponent(sent[0].headers["List-Unsubscribe"].match(/\?t=([^>]+)>/)[1]);
  assert.equal((await L.verifyUnsubscribeToken(token, UNSUB_SECRET, NOW)).userId, BOSS, "lien de desinscription du compte du patron");
  assert.equal(t.db.listed, 0, "aucun client lu");
  assert.equal(t.db.reserved.length, 0);
  assert.deepEqual(body.results.map((r) => r.campaign), OWN_CAMPAIGNS);
  // NOW = jeudi 17/09 : week-end publie (Paris SG - Marseille samedi) ; match offert du jour.
  assert.deepEqual(body.results.filter((r) => r.status !== "sent"), []);
  assert.equal(body.envoyes, OWN_CAMPAIGNS.length);
  assert.ok(!JSON.stringify(body).includes("yaramode81"), "adresse masquee dans la reponse");
  // Hors us-east-2 : refus avant tout envoi.
  const ailleurs = makeDeps({ env: Object.assign({}, env, { SB_REGION: "eu-central-1" }) });
  assert.equal((await handleRequest(post({ mode: "test" }), ailleurs.deps)).status, 409);
  assert.equal(brevoCalls(ailleurs).length, 0);
  // Sans Brevo : refus explicite.
  const sansCle = makeDeps({ env: Object.assign({}, env, { BREVO_API_KEY: "" }) });
  const r2 = await handleRequest(post({ mode: "test" }), sansCle.deps);
  assert.equal(r2.status, 503);
  assert.deepEqual((await r2.json()).missing, ["BREVO_API_KEY"]);
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
