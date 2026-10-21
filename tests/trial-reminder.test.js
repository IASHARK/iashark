"use strict";
// Fonction Edge trial-reminder (campagne trial_ending, rappel 2 jours avant la fin
// de l'essai Pro) : reutilisee (deja en ligne depuis le 03/10/2026), envoi par
// Brevo, envoi reel desactive tant que LIFECYCLE_SENDING_ENABLED n'est pas pose,
// region us-east-2, montant exact de la prochaine facture Stripe, une seule fois
// par abonnement, modes apercu et test (patron seulement). Aucun appel reseau reel.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const L = require("../lib/lifecycle-email.js");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "supabase", "functions", "trial-reminder");
const load = () => import(pathToFileURL(path.join(DIR, "handler.ts")).href);

const INTERNAL = "test-internal-secret-0123456789";
const RELANCE = "test-relance-secret-0123456789abcdef0123";
const UNSUB_SECRET = "test-unsubscribe-secret-0123456789abcdef";
const NOW = new Date("2026-10-21T08:00:00Z");
const HOUR = 3600000;
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const BOSS = "1a2b3c4d-0000-4000-8000-00000000b055";
const EMAIL = "essai.pro@example.com";
const BREVO = "https://api.brevo.com/v3/smtp/email";
const STRIPE = "https://api.stripe.com/v1/invoices/create_preview";
const COMPANY = { COMPANY_OPERATOR_NAME: "Exploitant Test", COMPANY_ADDRESS: "1 rue de Test, Paris" };
const SENDING = Object.assign({ BREVO_API_KEY: "xkeysib-test", LIFECYCLE_SENDING_ENABLED: "true", SB_REGION: "us-east-2", STRIPE_SECRET_KEY: "sk_test_x" }, COMPANY);

function sub(over) {
  return Object.assign({
    stripe_subscription_id: "sub_TRIAL1", user_id: USER, email: EMAIL, status: "trialing", cancel_at_period_end: false,
    trial_reminder_sent_at: null, current_period_end: new Date(NOW.getTime() + 48 * HOUR).toISOString(),
    market: "fr", billing_interval: "month", dir: "fr"
  }, over || {});
}

function makeDeps(opts) {
  opts = opts || {};
  const env = Object.assign({ EMAIL_INTERNAL_SECRET: INTERNAL, EMAIL_UNSUBSCRIBE_SECRET: UNSUB_SECRET, SUPABASE_URL: "https://example.supabase.co" }, opts.env || {});
  const calls = [], logs = [], db = { listed: [], reserved: [], released: [], lookups: [] };
  const store = opts.db === null ? null : {
    listDue: async (args) => { db.listed.push(args); return opts.rows || [sub()]; },
    reserve: async (id) => { db.reserved.push(id); return opts.reserve !== false; },
    release: async (id) => { db.released.push(id); },
    findAccount: async (email) => { db.lookups.push(email); return { userId: BOSS }; }
  };
  const routes = Object.assign({
    [STRIPE]: { body: { amount_due: 1795, currency: "eur" } },
    [BREVO]: { status: 201, body: { messageId: "<t@brevo>" } }
  }, opts.routes || {});
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

function post(body, headers) {
  const h = Object.assign({ "Content-Type": "application/json", "x-internal-secret": INTERNAL }, headers || {});
  for (const k of Object.keys(h)) if (h[k] === null) delete h[k];
  return new Request("https://example.supabase.co/functions/v1/trial-reminder", { method: "POST", headers: h, body: body === undefined ? "{}" : JSON.stringify(body) });
}
const brevoCalls = (t) => t.calls.filter((c) => c.url === BREVO);

test("trial-reminder : POST serveur, secret interne ou de relance, sinon refus", async () => {
  const { handleRequest } = await load();
  const t = makeDeps({ env: SENDING });
  assert.equal((await handleRequest(new Request("https://x/fn", { method: "GET" }), t.deps)).status, 405);
  assert.equal((await handleRequest(post({}, { "x-internal-secret": "mauvais" }), t.deps)).status, 401);
  assert.equal((await handleRequest(post({}), makeDeps({ env: { EMAIL_INTERNAL_SECRET: "" } }).deps)).status, 503);
  assert.equal((await handleRequest(post({ mode: "envoi_force" }), t.deps)).status, 400);
  const r = makeDeps({ env: Object.assign({}, SENDING, { EMAIL_INTERNAL_SECRET: "", RELANCE_SECRET: RELANCE }) });
  assert.equal((await handleRequest(post({ dryRun: true }, { "x-internal-secret": null, "x-relance-secret": RELANCE }), r.deps)).status, 200);
  assert.equal(t.calls.length, 0);
  for (const f of ["handler.ts", "index.ts"]) assert.doesNotMatch(fs.readFileSync(path.join(DIR, f), "utf8"), /Access-Control-Allow-Origin/i);
});

test("envoi reel desactive ou Brevo absent : no-op, aucune lecture, aucun appel", async () => {
  const { handleRequest } = await load();
  let t = makeDeps({ env: Object.assign({}, SENDING, { LIFECYCLE_SENDING_ENABLED: "" }) });
  assert.deepEqual(await (await handleRequest(post({}), t.deps)).json(), { ok: true, processed: false, reason: "sending_disabled" });
  assert.equal(t.db.listed.length + t.calls.length, 0);
  t = makeDeps({ env: Object.assign({}, SENDING, { BREVO_API_KEY: "" }) });
  assert.deepEqual(await (await handleRequest(post({}), t.deps)).json(), { ok: true, processed: false, reason: "brevo_not_configured" });
  assert.equal(t.db.listed.length + t.calls.length, 0);
  t = makeDeps({ env: Object.assign({}, SENDING, { SB_REGION: "eu-west-3" }) });
  const res = await handleRequest(post({}), t.deps);
  assert.equal(res.status, 409);
  assert.equal(t.db.listed.length + t.calls.length, 0, "hors us-east-2 : rien n'est lu ni envoye");
});

test("envoi : fenetre 36-60 h, montant de la prochaine facture Stripe, reservation puis Brevo (expediteur de la relance)", async () => {
  const { handleRequest } = await load();
  const t = makeDeps({ env: SENDING });
  const body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.processed, body.due, body.sent, body.failed], [true, 1, 1, 0]);
  assert.deepEqual(t.db.listed, [{ fromIso: new Date(NOW.getTime() + 36 * HOUR).toISOString(), toIso: new Date(NOW.getTime() + 60 * HOUR).toISOString(), limit: 200 }]);
  assert.deepEqual(t.db.reserved, ["sub_TRIAL1"]);
  assert.deepEqual(t.db.released, []);
  const stripe = t.calls.find((c) => c.url === STRIPE);
  assert.equal(stripe.init.headers.Authorization, "Bearer sk_test_x");
  assert.equal(stripe.init.body, "subscription=sub_TRIAL1");
  const order = t.calls.map((c) => c.url);
  assert.ok(order.indexOf(STRIPE) < order.indexOf(BREVO));
  const p = JSON.parse(brevoCalls(t)[0].init.body);
  assert.deepEqual(p.sender, { name: "Clément, IASHARK", email: "news@iashark.com" });
  assert.deepEqual(p.to, [{ email: EMAIL }]);
  assert.equal(p.subject, "Ton essai IASHARK Pro se termine dans 2 jours");
  assert.ok(p.textContent.replace(/[  ]/g, " ").includes("17,95 € par mois"), "montant Stripe (promo comprise), pas le prix catalogue");
  assert.ok(p.textContent.includes("se termine le vendredi 23 octobre à 10:00 UTC+2"));
  assert.ok(p.textContent.includes("Gérer mon abonnement : https://iashark.com/fr/compte.html#abonnement"));
  assert.match(p.headers["List-Unsubscribe"], /^<https:\/\/example\.supabase\.co\/functions\/v1\/email-unsubscribe\?t=v1\.[^>]+>, <https:\/\/iashark\.com\/fr\/desinscription-email\.html#t=v1\.[^>]+>$/);
  assert.deepEqual(p.tags, ["lifecycle-trial_ending", "market-fr"]);
  const logs = t.logs.map((l) => l[1]).join("\n");
  assert.ok(!logs.includes(EMAIL) && !logs.includes(USER), "journaux sans adresse ni identifiant");
  assert.ok(!JSON.stringify(body).includes(EMAIL));
});

test("une seule fois par abonnement : deja reserve = rien ; echec Brevo = reservation levee (le passage suivant reessaie)", async () => {
  const { handleRequest } = await load();
  let t = makeDeps({ env: SENDING, reserve: false });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.sent, body.raisons.already_reserved], [0, 1]);
  assert.equal(brevoCalls(t).length, 0);
  t = makeDeps({ env: SENDING, routes: { [BREVO]: { status: 401, body: { code: "unauthorized" } } } });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.ok, body.failed], [false, 1]);
  assert.deepEqual(t.db.released, ["sub_TRIAL1"]);
});

test("essai annule, deja rappele, hors fenetre, adresse invalide : jamais d'envoi (double controle par le module)", async () => {
  const { handleRequest } = await load();
  const rows = [
    sub({ cancel_at_period_end: true }),
    sub({ trial_reminder_sent_at: NOW.toISOString() }),
    sub({ current_period_end: new Date(NOW.getTime() + 70 * HOUR).toISOString() }),
    sub({ status: "active" }),
    sub({ email: "pas-un-email" })
  ];
  const t = makeDeps({ env: SENDING, rows });
  const body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.sent, 0);
  assert.deepEqual(body.raisons, { cancel_scheduled: 1, already_sent: 1, too_early: 1, not_trialing: 1, invalid_email: 1 });
  assert.equal(t.calls.length, 0);
  assert.equal(t.db.reserved.length, 0);
});

test("montant : Stripe illisible = pas d'envoi a ce passage (rien de reserve) ; sans cle Stripe = prix catalogue ; inconnu = rien", async () => {
  const { handleRequest } = await load();
  let t = makeDeps({ env: SENDING, routes: { [STRIPE]: { status: 500 } } });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.failed, body.raisons.stripe_unreadable], [1, 1]);
  assert.equal(t.db.reserved.length, 0);
  const sansStripe = Object.assign({}, SENDING, { STRIPE_SECRET_KEY: "" });
  t = makeDeps({ env: sansStripe, rows: [sub({ market: "gb", dir: "gb" })] });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.sent, 1);
  assert.ok(JSON.parse(brevoCalls(t)[0].init.body).textContent.includes("£14.99 per month"), "prix catalogue /gb/");
  t = makeDeps({ env: sansStripe, rows: [sub({ market: "za", billing_interval: "year", dir: "za" })] });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.sent, body.raisons.amount_unknown], [0, 1], "jamais un montant invente");
});

test("langue et version du site : preferences e-mail du compte, sinon marche de facturation (us = /en/)", async () => {
  const { handleRequest, dirFor } = await load();
  assert.equal(dirFor({ dir: "mx", market: "mx" }), "mx");
  assert.equal(dirFor({ dir: null, market: "us" }), "en");
  assert.equal(dirFor({ dir: "nl", market: "gb" }), "gb");
  assert.equal(dirFor({ dir: null, market: null }), "fr");
  const t = makeDeps({ env: SENDING, rows: [sub({ market: "mx", dir: "mx" })], routes: { [STRIPE]: { body: { amount_due: 19900, currency: "mxn" } } } });
  await handleRequest(post({}), t.deps);
  const p = JSON.parse(brevoCalls(t)[0].init.body);
  assert.equal(p.subject, "Tu prueba de IASHARK Pro termina en 2 días");
  assert.ok(p.textContent.includes("$199.00 MXN al mes") && p.textContent.includes("GMT-6"));
  assert.ok(p.htmlContent.includes('<html lang="es-MX"'));
});

test("identite de l'expediteur manquante : non envoye (BLOCKED_DECISION), sauf EMAIL_ALLOW_BLOCKED_DECISION=true", async () => {
  const { handleRequest } = await load();
  const env = { BREVO_API_KEY: "k", LIFECYCLE_SENDING_ENABLED: "true", STRIPE_SECRET_KEY: "sk_test_x" };
  let t = makeDeps({ env });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual([body.sent, body.raisons.blocked_decision_placeholders], [0, 1]);
  assert.equal(t.db.reserved.length, 0);
  t = makeDeps({ env: Object.assign({ EMAIL_ALLOW_BLOCKED_DECISION: "true" }, env) });
  body = await (await handleRequest(post({}), t.deps)).json();
  assert.equal(body.sent, 1);
});

test("dryRun et apercu : rien n'est reserve ni envoye ; apercu = l'e-mail dans les 9 versions, compte fictif", async () => {
  const { handleRequest } = await load();
  let t = makeDeps({ env: Object.assign({}, COMPANY, { STRIPE_SECRET_KEY: "sk_test_x" }) });
  let body = await (await handleRequest(post({ dryRun: true }), t.deps)).json();
  assert.deepEqual([body.processed, body.dryRun, body.not_sent, body.raisons.dry_run], [true, true, 1, 1]);
  assert.equal(t.db.reserved.length + brevoCalls(t).length, 0);
  t = makeDeps({ env: SENDING });
  body = await (await handleRequest(post({ mode: "apercu" }), t.deps)).json();
  assert.equal(body.apercus.length, 9);
  assert.deepEqual(body.non_rendus, []);
  assert.equal(body.essais.lus, true);
  assert.equal(body.essais.due, 1);
  assert.equal(t.db.reserved.length + brevoCalls(t).length, 0);
  for (const a of body.apercus) {
    assert.equal(a.campaign, "trial_ending");
    assert.ok(a.html.includes("#t=APERCU") && !a.html.includes("#t=v1."), a.dir);
  }
  assert.ok(!JSON.stringify(body).includes(EMAIL));
});

test("mode test : l'e-mail en francais a la SEULE adresse du patron, sans toucher aux abonnements", async () => {
  const { handleRequest } = await load();
  const t = makeDeps({ env: Object.assign({}, SENDING, { LIFECYCLE_SENDING_ENABLED: "" }) });
  const res = await handleRequest(post({ mode: "test", to: "autre@example.com" }), t.deps);
  const body = await res.json();
  assert.deepEqual([res.status, body.ok, body.envoyes], [200, true, 1]);
  const sent = brevoCalls(t).map((c) => JSON.parse(c.init.body));
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, [{ email: L.TEST_RECIPIENT }]);
  assert.equal(sent[0].subject, "[TEST] Ton essai IASHARK Pro se termine dans 2 jours");
  assert.ok(sent[0].textContent.replace(/[  ]/g, " ").includes("19,95 € par mois"), "essai fictif : prix mensuel catalogue");
  assert.equal(t.db.listed.length + t.db.reserved.length, 0, "aucun abonnement lu ni modifie");
  assert.ok(!t.calls.some((c) => c.url === STRIPE));
  const token = decodeURIComponent(sent[0].headers["List-Unsubscribe"].match(/\?t=([^>]+)>/)[1]);
  assert.equal((await L.verifyUnsubscribeToken(token, UNSUB_SECRET, NOW)).userId, BOSS);
  assert.ok(!JSON.stringify(body).includes("yaramode81"));
  const ailleurs = makeDeps({ env: Object.assign({}, SENDING, { SB_REGION: "ap-south-1" }) });
  assert.equal((await handleRequest(post({ mode: "test" }), ailleurs.deps)).status, 409);
  assert.equal(brevoCalls(ailleurs).length, 0);
});

test("index.ts : essais trialing sans annulation ni rappel, dans la fenetre ; version du site lue dans email_preferences", () => {
  const src = fs.readFileSync(path.join(DIR, "index.ts"), "utf8");
  for (const s of ['.eq("status", "trialing")', '.eq("cancel_at_period_end", false)', '.is("trial_reminder_sent_at", null)', '.gte("current_period_end", fromIso)', '.lt("current_period_end", toIso)',
    'from("email_preferences").select("user_id,market")', '.update({ trial_reminder_sent_at: nowIso })', '.ilike("email", email)']) {
    assert.ok(src.includes(s), s);
  }
  const handler = fs.readFileSync(path.join(DIR, "handler.ts"), "utf8");
  assert.match(handler, /import \{ BUNDLE, Lifecycle, Render \} from "\.\.\/_shared\/lifecycle-email-bundle\.generated\.mjs";/);
  assert.match(handler, /from "\.\.\/_shared\/brevo\.ts";/);
  assert.doesNotMatch(handler, /api\.resend\.com|RESEND_API_KEY/, "plus aucun envoi par Resend");
});
