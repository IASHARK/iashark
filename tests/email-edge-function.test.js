"use strict";
// Fonction Edge send-transactional-email (handler.ts, dependances injectees) :
// secret interne, no-op sans RESEND_API_KEY, envoi Resend, chemin Stripe,
// scan planifie des rappels MX. Aucun appel reseau reel.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const FN_DIR = path.join(ROOT, "supabase", "functions", "send-transactional-email");
const loadHandler = () => import(pathToFileURL(path.join(FN_DIR, "handler.ts")).href);

const SECRET = "test-internal-secret-0123456789";
const NOW = new Date("2026-09-14T15:00:00Z");
const COMPANY_ENV = {
  COMPANY_OPERATOR_NAME: "Exploitant Test",
  COMPANY_ADDRESS: "1 rue de Test, 75001 Paris, France",
  COMPANY_REGISTRATION: "000 000 000 00000",
  COMPANY_VAT: "FR00000000000",
  COMPANY_PHONE: "+33 1 00 00 00 00",
  COMPANY_MEDIATOR: "Mediateur Test"
};

function makeDeps(opts) {
  opts = opts || {};
  const env = Object.assign({ EMAIL_INTERNAL_SECRET: SECRET }, opts.env || {});
  const calls = [];
  const logs = [];
  const routes = opts.routes || {};
  const deps = {
    env: (k) => env[k],
    now: () => NOW,
    log: { info: (m) => logs.push(["info", m]), warn: (m) => logs.push(["warn", m]), error: (m) => logs.push(["error", m]) },
    db: opts.db === undefined ? null : opts.db,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init: init || {} });
      for (const prefix of Object.keys(routes)) {
        if (String(url).startsWith(prefix)) {
          const r = routes[prefix];
          const out = typeof r === "function" ? r(String(url), init) : r;
          return new Response(JSON.stringify(out.body || {}), { status: out.status || 200, headers: { "Content-Type": "application/json" } });
        }
      }
      throw new Error("fetch inattendu : " + url);
    }
  };
  return { deps, calls, logs };
}

function post(body, secret) {
  const headers = { "Content-Type": "application/json" };
  if (secret !== null) headers["x-internal-secret"] = secret === undefined ? SECRET : secret;
  return new Request("https://example.supabase.co/functions/v1/send-transactional-email", {
    method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

const directPurchase = (over) => Object.assign({
  type: "purchase_confirmation",
  market: "fr",
  to: "client@example.com",
  idempotencyKey: "purchase_confirmation:fr:sub_TEST",
  data: {
    planName: "IASHARK Pro", amountMinor: 1995, currency: "EUR", interval: "month", intervalCount: 1,
    startDate: "2026-09-14T08:00:00Z", nextBillingDate: "2026-10-14T08:00:00Z", customerEmail: "client@example.com",
    immediateStartRequested: true, termsVersion: "2026-09-13", reference: "sub_TEST"
  }
}, over || {});

const RESEND = "https://api.resend.com/emails";
const STRIPE = "https://api.stripe.com/v1";

// -------------------------------------------------------------- securite

test("refuse tout ce qui n'est pas un POST serveur authentifie par le secret interne", async () => {
  const { handleRequest } = await loadHandler();
  const { deps, calls } = makeDeps();
  assert.equal((await handleRequest(new Request("https://x/fn", { method: "GET" }), deps)).status, 405);
  assert.equal((await handleRequest(new Request("https://x/fn", { method: "OPTIONS" }), deps)).status, 405);
  assert.equal((await handleRequest(post(directPurchase(), null), deps)).status, 401);
  assert.equal((await handleRequest(post(directPurchase(), "mauvais"), deps)).status, 401);
  assert.equal((await handleRequest(post("{pas du json"), deps)).status, 400);
  assert.equal((await handleRequest(post([1, 2]), deps)).status, 400);
  assert.equal((await handleRequest(post({ type: "welcome" }), deps)).status, 400);
  assert.equal((await handleRequest(post("x".repeat(70000)), deps)).status, 413);
  assert.equal(calls.length, 0);
});

test("EMAIL_INTERNAL_SECRET absent cote serveur : 503, jamais ouvert", async () => {
  const { handleRequest } = await loadHandler();
  const { deps, calls } = makeDeps({ env: { EMAIL_INTERNAL_SECRET: "" } });
  const res = await handleRequest(post(directPurchase(), ""), deps);
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, "internal_secret_not_configured");
  assert.equal(calls.length, 0);
});

test("aucun en-tete CORS : la fonction n'est pas appelable depuis un navigateur", async () => {
  const { handleRequest } = await loadHandler();
  const { deps } = makeDeps();
  const res = await handleRequest(post(directPurchase()), deps);
  assert.equal(res.headers.get("access-control-allow-origin"), null);
  for (const f of ["handler.ts", "index.ts"]) {
    assert.doesNotMatch(fs.readFileSync(path.join(FN_DIR, f), "utf8"), /Access-Control-Allow-Origin/i, f);
  }
});

// ---------------------------------------------------------------- no-op

test("RESEND_API_KEY absent : no-op propre, rendu valide, log sans adresse en clair", async () => {
  const { handleRequest } = await loadHandler();
  const { deps, calls, logs } = makeDeps({ env: { EMAIL_FROM: "IASHARK <no-reply@iashark.com>" } });
  const res = await handleRequest(post(directPurchase()), deps);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.sent, false);
  assert.equal(body.reason, "resend_not_configured");
  assert.ok(body.blockedDecisions.includes("COMPANY_REGISTRATION"));
  assert.equal(calls.length, 0, "aucun appel reseau");
  const line = logs.map((l) => l[1]).join("\n");
  assert.match(line, /RESEND_API_KEY absent/);
  assert.match(line, /c\*\*\*@example\.com/);
  assert.ok(!line.includes("client@example.com"), "adresse masquee dans les logs");
});

test("no-op aussi si EMAIL_FROM manque, ou si l'identite vendeur est incomplete (BLOCKED_DECISION)", async () => {
  const { handleRequest } = await loadHandler();
  let t = makeDeps({ env: Object.assign({ RESEND_API_KEY: "re_test" }, COMPANY_ENV) });
  let body = await (await handleRequest(post(directPurchase()), t.deps)).json();
  assert.equal(body.reason, "email_from_not_configured");
  assert.equal(t.calls.length, 0);

  t = makeDeps({ env: { RESEND_API_KEY: "re_test", EMAIL_FROM: "IASHARK <no-reply@iashark.com>" } });
  body = await (await handleRequest(post(directPurchase()), t.deps)).json();
  assert.equal(body.sent, false);
  assert.equal(body.reason, "blocked_decision_placeholders");
  assert.equal(t.calls.length, 0);
  assert.ok(t.logs.some((l) => l[0] === "warn" && /BLOCKED_DECISION/.test(l[1])));
});

test("donnees invalides : 422 explicite, aucun envoi", async () => {
  const { handleRequest } = await loadHandler();
  const { deps, calls } = makeDeps({ env: Object.assign({ RESEND_API_KEY: "re_test", EMAIL_FROM: "a@iashark.com" }, COMPANY_ENV) });
  const bad = directPurchase();
  bad.data.currency = "GBP";
  const res = await handleRequest(post(bad), deps);
  assert.equal(res.status, 422);
  assert.equal((await res.json()).code, "currency_mismatch");
  assert.equal((await handleRequest(post(directPurchase({ to: "nope" })), deps)).status, 422);
  assert.equal((await handleRequest(post(directPurchase({ market: "za" })), deps)).status, 422);
  assert.equal(calls.length, 0);
});

// ---------------------------------------------------------------- envoi

test("envoi Resend : en-tetes, cle d'idempotence, HTML + texte, expediteur des secrets", async () => {
  const { handleRequest } = await loadHandler();
  const { deps, calls } = makeDeps({
    env: Object.assign({ RESEND_API_KEY: "re_test_key", EMAIL_FROM: "IASHARK <no-reply@iashark.com>" }, COMPANY_ENV),
    routes: { [RESEND]: { status: 200, body: { id: "email_123" } } }
  });
  const res = await handleRequest(post(directPurchase()), deps);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual([body.ok, body.sent, body.id, body.market], [true, true, "email_123", "fr"]);
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, RESEND);
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer re_test_key");
  assert.equal(init.headers["Idempotency-Key"], "purchase_confirmation:fr:sub_TEST");
  const payload = JSON.parse(init.body);
  assert.equal(payload.from, "IASHARK <no-reply@iashark.com>");
  assert.deepEqual(payload.to, ["client@example.com"]);
  assert.equal(payload.reply_to, "contact@iashark.com");
  assert.equal(payload.subject, "Confirmation de votre abonnement IASHARK Pro");
  assert.match(payload.html, /<html lang="fr"/);
  assert.match(payload.text, /19,95\s€ TTC/);
  assert.ok(!payload.html.includes("BLOCKED_DECISION"));
});

test("EMAIL_ALLOW_BLOCKED_DECISION=true : envoi malgre les mentions manquantes", async () => {
  const { handleRequest } = await loadHandler();
  const { deps, calls } = makeDeps({
    env: { RESEND_API_KEY: "re_test", EMAIL_FROM: "a@iashark.com", EMAIL_ALLOW_BLOCKED_DECISION: "true" },
    routes: { [RESEND]: { body: { id: "email_9" } } }
  });
  const body = await (await handleRequest(post(directPurchase()), deps)).json();
  assert.equal(body.sent, true);
  assert.ok(body.blockedDecisions.length > 0);
  assert.equal(calls.length, 1);
});

test("erreurs Resend : 5xx -> 502, 409 idempotence -> 200 non envoye, reseau -> 502", async () => {
  const { handleRequest } = await loadHandler();
  const env = Object.assign({ RESEND_API_KEY: "re_test", EMAIL_FROM: "a@iashark.com" }, COMPANY_ENV);
  let t = makeDeps({ env, routes: { [RESEND]: { status: 500, body: { message: "boom" } } } });
  let res = await handleRequest(post(directPurchase()), t.deps);
  assert.equal(res.status, 502);
  assert.equal((await res.json()).reason, "resend_http_500");

  t = makeDeps({ env, routes: { [RESEND]: { status: 409, body: { name: "concurrent_idempotent_requests" } } } });
  res = await handleRequest(post(directPurchase()), t.deps);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).reason, "idempotency_conflict");

  t = makeDeps({ env });
  t.deps.fetch = async () => { throw new Error("ECONNRESET"); };
  res = await handleRequest(post(directPurchase()), t.deps);
  assert.equal(res.status, 502);
});

// ------------------------------------------------------------ chemin Stripe

function stripeSubscription(over) {
  return Object.assign({
    id: "sub_GB1", status: "active", start_date: 1789372800, cancel_at_period_end: false,
    customer: { id: "cus_1", email: "uk@example.com" },
    metadata: { market: "gb", consent_waiver: "true", consent_terms_version: "2026-09-13" },
    items: { data: [{ quantity: 1, current_period_end: 1791964800, price: { unit_amount: 1499, currency: "gbp", recurring: { interval: "month", interval_count: 1 }, product: { name: "IASHARK Pro" } } }] },
    latest_invoice: { id: "in_1", amount_paid: 1499 }
  }, over || {});
}

test("purchase_confirmation par stripeSubscriptionId : donnees relues chez Stripe, email GB envoye", async () => {
  const { handleRequest } = await loadHandler();
  const { deps, calls } = makeDeps({
    env: Object.assign({ RESEND_API_KEY: "re_test", EMAIL_FROM: "a@iashark.com", STRIPE_SECRET_KEY: "sk_test_x" }, COMPANY_ENV),
    routes: { [STRIPE + "/subscriptions/sub_GB1"]: { body: stripeSubscription() }, [RESEND]: { body: { id: "email_gb" } } }
  });
  const res = await handleRequest(post({ type: "purchase_confirmation", stripeSubscriptionId: "sub_GB1" }), deps);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual([body.sent, body.market], [true, "gb"]);
  assert.equal(calls[0].init.headers.Authorization, "Bearer sk_test_x");
  assert.equal(calls[0].init.headers["Stripe-Version"], "2026-06-24.dahlia");
  assert.match(calls[0].url, /expand%5B%5D=items\.data\.price\.product/);
  const payload = JSON.parse(calls[1].init.body);
  assert.deepEqual(payload.to, ["uk@example.com"]);
  assert.equal(calls[1].init.headers["Idempotency-Key"], "purchase_confirmation:gb:sub_GB1");
  assert.match(payload.text, /£14\.99/);
});

test("chemin Stripe : marche sans gabarit ignore proprement, Stripe absent = no-op, id invalide = 400", async () => {
  const { handleRequest } = await loadHandler();
  let t = makeDeps({
    env: { STRIPE_SECRET_KEY: "sk_test_x" },
    routes: { [STRIPE + "/subscriptions/"]: { body: stripeSubscription({ metadata: { market: "za" } }) } }
  });
  let body = await (await handleRequest(post({ type: "purchase_confirmation", stripeSubscriptionId: "sub_ZA1" }), t.deps)).json();
  assert.deepEqual([body.ok, body.sent, body.reason], [true, false, "no_template_for_market"]);

  t = makeDeps();
  body = await (await handleRequest(post({ type: "purchase_confirmation", stripeSubscriptionId: "sub_GB1" }), t.deps)).json();
  assert.equal(body.reason, "stripe_not_configured");
  assert.equal(t.calls.length, 0);

  assert.equal((await handleRequest(post({ type: "purchase_confirmation", stripeSubscriptionId: "../customers" }), t.deps)).status, 400);

  t = makeDeps({ env: { STRIPE_SECRET_KEY: "sk_test_x" }, routes: { [STRIPE]: { status: 500, body: { error: { code: "api_error" } } } } });
  assert.equal((await handleRequest(post({ type: "purchase_confirmation", stripeSubscriptionId: "sub_GB1" }), t.deps)).status, 502);
});

// ------------------------------------------------------ scan planifie MX

function mxSubscription(id, over) {
  return Object.assign({
    id, status: "active", cancel_at_period_end: false,
    customer: { id: "cus_" + id, email: id + "@example.mx" },
    metadata: { market: "mx" },
    items: { data: [{ current_period_end: Date.parse("2026-09-21T15:00:00Z") / 1000, price: { unit_amount: 19900, currency: "mxn", recurring: { interval: "month" }, product: { name: "IASHARK Pro" } } }] }
  }, over || {});
}

test("renewal_reminder_scan : fenetre J+7 heure de Mexico, montant de l'apercu Stripe, abonnements non eligibles ignores", async () => {
  const { handleRequest } = await loadHandler();
  let query = null;
  const db = { listRenewingSubscriptions: async (args) => { query = args; return [{ stripe_subscription_id: "sub_OK" }, { stripe_subscription_id: "sub_CANCEL" }, { stripe_subscription_id: "sub_MOVED" }]; } };
  const subs = {
    sub_OK: mxSubscription("sub_OK"),
    sub_CANCEL: mxSubscription("sub_CANCEL", { cancel_at_period_end: true }),
    sub_MOVED: mxSubscription("sub_MOVED", { items: { data: [{ current_period_end: Date.parse("2026-10-21T15:00:00Z") / 1000, price: { unit_amount: 19900, currency: "mxn", recurring: { interval: "month" } } }] } })
  };
  const routes = {
    [STRIPE + "/subscriptions/"]: (url) => ({ body: subs[decodeURIComponent(url.split("/subscriptions/")[1].split("?")[0])] }),
    [STRIPE + "/invoices/create_preview"]: () => ({ body: { amount_due: 17910, currency: "mxn" } }),
    [RESEND]: { body: { id: "email_mx" } }
  };
  const env = Object.assign({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PRICE_ID_MX: "price_mx", RESEND_API_KEY: "re_test", EMAIL_FROM: "a@iashark.com" }, COMPANY_ENV);
  const { deps, calls } = makeDeps({ env, db, routes });
  const res = await handleRequest(post({ type: "renewal_reminder_scan" }), deps);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.deepEqual(query, { priceId: "price_mx", startIso: "2026-09-21T06:00:00.000Z", endIso: "2026-09-22T06:00:00.000Z" });
  assert.deepEqual([body.checked, body.sent, body.skipped, body.failed], [3, 1, 2, 0]);
  assert.deepEqual(body.results.map((r) => r.reason || r.status), ["sent", "cancel_at_period_end", "renewal_date_changed"]);
  const preview = calls.find((c) => c.url.endsWith("/invoices/create_preview"));
  assert.equal(preview.init.body, "subscription=sub_OK");
  const sent = calls.filter((c) => c.url === RESEND);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].init.headers["Idempotency-Key"], "renewal_reminder:mx:sub_OK:2026-09-21");
  const payload = JSON.parse(sent[0].init.body);
  assert.deepEqual(payload.to, ["sub_OK@example.mx"]);
  assert.match(payload.text, /\$179\.10 MXN/, "montant exact de l'apercu (remise comprise), jamais le prix catalogue");
  assert.match(payload.subject, /21 de septiembre de 2026/);
});

test("renewal_reminder_scan : daysBefore parametrable, dryRun, configuration absente = no-op", async () => {
  const { handleRequest } = await loadHandler();
  let query = null;
  const db = { listRenewingSubscriptions: async (args) => { query = args; return [{ stripe_subscription_id: "sub_OK" }]; } };
  const routes = {
    [STRIPE + "/subscriptions/"]: { body: mxSubscription("sub_OK", { items: { data: [{ current_period_end: Date.parse("2026-09-17T15:00:00Z") / 1000, price: { unit_amount: 19900, currency: "mxn", recurring: { interval: "month" } } }] } }) },
    [STRIPE + "/invoices/create_preview"]: { body: { amount_due: 19900, currency: "mxn" } }
  };
  const env = { STRIPE_SECRET_KEY: "sk_test_x", STRIPE_PRICE_ID_MX: "price_mx", MX_RENEWAL_REMINDER_DAYS: "3" };
  let t = makeDeps({ env, db, routes });
  let body = await (await handleRequest(post({ type: "renewal_reminder_scan", dryRun: true }), t.deps)).json();
  assert.equal(query.startIso, "2026-09-17T06:00:00.000Z", "MX_RENEWAL_REMINDER_DAYS=3");
  assert.deepEqual([body.dryRun, body.sent, body.notSent], [true, 0, 1]);
  assert.ok(!t.calls.some((c) => c.url === RESEND));
  assert.ok(t.logs.some((l) => l[0] === "warn" && /minimum recommande/.test(l[1])), "alerte sous 5 jours");

  body = await (await handleRequest(post({ type: "renewal_reminder_scan", daysBefore: 10 }), t.deps)).json();
  assert.equal(body.window.localDate, "2026-09-24");
  assert.equal((await handleRequest(post({ type: "renewal_reminder_scan", daysBefore: 90 }), t.deps)).status, 400);

  t = makeDeps({ db });
  body = await (await handleRequest(post({ type: "renewal_reminder_scan" }), t.deps)).json();
  assert.deepEqual([body.processed, body.reason], [false, "not_configured"]);
  assert.deepEqual(body.missing, ["STRIPE_PRICE_ID_MX", "STRIPE_SECRET_KEY"]);
  assert.equal(t.calls.length, 0);
});

test("renewal_reminder par stripeSubscriptionId (webhook invoice.upcoming) : sans RESEND_API_KEY, no-op", async () => {
  const { handleRequest } = await loadHandler();
  const { deps, calls } = makeDeps({
    env: { STRIPE_SECRET_KEY: "sk_test_x" },
    routes: {
      [STRIPE + "/subscriptions/"]: { body: mxSubscription("sub_OK") },
      [STRIPE + "/invoices/create_preview"]: { body: { amount_due: 19900, currency: "mxn" } }
    }
  });
  const body = await (await handleRequest(post({ type: "renewal_reminder", stripeSubscriptionId: "sub_OK" }), deps)).json();
  assert.deepEqual([body.ok, body.sent, body.reason, body.market], [true, false, "resend_not_configured", "mx"]);
  assert.ok(!calls.some((c) => c.url === RESEND));
});
