"use strict";
// Suivi des ouvertures et clics des e-mails (27/10/2026) : 13 e-mails de bienvenue, 0 ouverture
// comptee, parce que rien ne relisait les evenements Brevo des e-mails du cycle de vie.
// send-lifecycle-emails relit desormais les evenements Brevo et les note par identifiant de
// message (public.email_record_event). Aucun appel reseau reel.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "supabase", "functions", "send-lifecycle-emails");
const load = () => import(pathToFileURL(path.join(DIR, "handler.ts")).href);
const INTERNAL = "test-internal-secret-0123456789";
const NOW = new Date("2026-10-27T10:00:00Z");
const EVENTS = "https://api.brevo.com/v3/smtp/statistics/events";

function deps(opts) {
  opts = opts || {};
  const env = Object.assign({ EMAIL_INTERNAL_SECRET: INTERNAL, BREVO_API_KEY: "xkeysib-test", EMAIL_PROVIDER: "brevo" }, opts.env || {});
  const recorded = [], calls = [], logs = [];
  const sends = opts.sends || [
    { message_id: "<202610251622.1@smtp-relay.mailin.fr>", opened_at: null, clicked_at: null, status: "sent" },
    { message_id: "<202610251622.2@smtp-relay.mailin.fr>", opened_at: "2026-10-25T18:00:00.000Z", clicked_at: null, status: "sent" },
    { message_id: "<202610261250.3@smtp-relay.mailin.fr>", opened_at: null, clicked_at: null, status: "sent" }
  ];
  const events = opts.events || {
    opened: [
      { event: "opened", messageId: "<202610251622.1@smtp-relay.mailin.fr>", date: "2026-10-25T19:10:00.000+02:00", email: "a@example.com" },
      { event: "opened", messageId: "<202610251622.2@smtp-relay.mailin.fr>", date: "2026-10-25T20:00:00.000+02:00", email: "b@example.com" },
      { event: "opened", messageId: "<autre-campagne@x>", date: "2026-10-25T20:00:00.000+02:00", email: "c@example.com" }
    ],
    clicks: [{ event: "clicks", messageId: "<202610261250.3@smtp-relay.mailin.fr>", date: "2026-10-26T15:00:00.000+01:00", link: "https://iashark.com/fr/match.html?id=1" }],
    hardBounces: [],
    spam: [],
    loadedByProxy: [{ event: "loadedByProxy", messageId: "<202610261250.3@smtp-relay.mailin.fr>", date: "2026-10-26T13:00:00.000+01:00" }]
  };
  const store = {
    listCandidates: async () => { throw new Error("aucune lecture des destinataires en mode suivi"); },
    reserveSend: async () => { throw new Error("aucune reservation en mode suivi"); },
    completeSend: async () => {},
    recentSends: async (a) => { store.since = a.sinceIso; return sends; },
    recordEvent: async (a) => { recorded.push(a); return true; }
  };
  return {
    recorded, calls, logs, store,
    deps: {
      env: (k) => env[k],
      now: () => NOW,
      log: { info: (m) => logs.push(m), warn: (m) => logs.push(m), error: (m) => logs.push(m) },
      db: store,
      fetch: async (url, init) => {
        calls.push({ url: String(url), init });
        const u = new URL(String(url));
        if (u.origin + u.pathname !== EVENTS) throw new Error("fetch inattendu : " + url);
        if (opts.status) return new Response("{}", { status: opts.status });
        const ev = u.searchParams.get("event");
        const offset = Number(u.searchParams.get("offset"));
        return new Response(JSON.stringify({ events: offset === 0 ? (events[ev] || []) : [] }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
    }
  };
}
const post = (body) => new Request("https://x/functions/v1/send-lifecycle-emails", { method: "POST", headers: { "x-internal-secret": INTERNAL, "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("{ suivi: true } : ouvertures, clics (= ouverture aussi) notes par identifiant de message ; proxy compte a part ; aucun envoi", async () => {
  const { handleRequest } = await load();
  const t = deps();
  const res = await handleRequest(post({ suivi: true }), t.deps);
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.processed, false);
  assert.deepEqual(t.recorded.map((r) => [r.messageId, r.event]), [
    ["<202610251622.1@smtp-relay.mailin.fr>", "opened"],
    ["<202610261250.3@smtp-relay.mailin.fr>", "clicked"],
    ["<202610261250.3@smtp-relay.mailin.fr>", "opened"]
  ], "l'ouverture deja notee n'est pas reecrite ; un message inconnu est ignore");
  assert.equal(t.recorded[0].at, "2026-10-25T17:10:00.000Z");
  assert.deepEqual([body.suivi.opened, body.suivi.clicked, body.suivi.proxy, body.suivi.unknown, body.suivi.synced], [2, 1, 1, 1, true]);
  assert.equal(t.store.since, "2026-10-19T10:00:00.000Z", "8 jours d'envois relus pour 7 jours d'evenements");
  for (const c of t.calls) {
    assert.equal(c.init.headers["api-key"], "xkeysib-test");
    assert.equal(new URL(c.url).searchParams.get("days"), "7");
  }
  assert.deepEqual([...new Set(t.calls.map((c) => new URL(c.url).searchParams.get("event")))].sort(), ["clicks", "hardBounces", "loadedByProxy", "opened", "spam"]);
  assert.ok(!JSON.stringify(body).includes("@example.com"), "aucune adresse dans la reponse");
  assert.ok(!t.logs.join("\n").includes("@example.com"), "aucune adresse dans les journaux");
});

test("rebond definitif et plainte : notes (ils arretent les relances a cette adresse)", async () => {
  const { handleRequest } = await load();
  const t = deps({ events: { opened: [], clicks: [], loadedByProxy: [], hardBounces: [{ messageId: "<202610251622.1@smtp-relay.mailin.fr>", date: "2026-10-25T16:30:00Z" }], spam: [{ messageId: "<202610261250.3@smtp-relay.mailin.fr>", date: "2026-10-26T16:30:00Z" }] } });
  const body = await (await handleRequest(post({ suivi: true }), t.deps)).json();
  assert.deepEqual(t.recorded.map((r) => r.event), ["bounced", "complained"]);
  assert.deepEqual([body.suivi.bounced, body.suivi.complained], [1, 1]);
});

test("Brevo refuse ou injoignable : rien n'est note, l'erreur est dite, aucune exception", async () => {
  const { handleRequest } = await load();
  const t = deps({ status: 401 });
  const body = await (await handleRequest(post({ suivi: true }), t.deps)).json();
  assert.equal(body.ok, false);
  assert.equal(t.recorded.length, 0);
  assert.ok(body.suivi.errors.includes("opened:http_401"));
});

test("fournisseur Resend ou base sans suivi : aucun appel a Brevo", async () => {
  const { syncBrevoEvents } = await load();
  const t = deps();
  assert.equal((await syncBrevoEvents(t.deps, { name: "resend", key: "re" }, NOW)).reason, "provider_not_brevo");
  delete t.store.recordEvent;
  assert.equal((await syncBrevoEvents(t.deps, { name: "brevo", key: "k" }, NOW)).reason, "store_without_tracking");
  assert.equal(t.calls.length, 0);
});

test("index.ts : envois recents lus dans email_sends, evenement ecrit par public.email_record_event (role service)", () => {
  const src = fs.readFileSync(path.join(DIR, "index.ts"), "utf8");
  assert.match(src, /from\("email_sends"\)\.select\("message_id,opened_at,clicked_at,status"\)/);
  assert.match(src, /rpc\("email_record_event", \{ p_message_id: messageId, p_event: event, p_at: at \}\)/);
  const wf = fs.readFileSync(path.join(ROOT, ".github", "workflows", "emails-cycle-de-vie.yml"), "utf8");
  assert.match(wf, /suivi/, "le journal du workflow montre les nombres du suivi");
});
