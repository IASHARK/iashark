"use strict";
// Suite courte d'e-mails des comptes gratuits (27/10/2026, NON activee par defaut) :
// J+1 match offert, J+3 bilan d'hier (gagnes ET perdus, archive, aucun pourcentage) + essai,
// J+6 offre Pro ; consentement obligatoire ; au plus 1 e-mail marketing tous les 3 jours
// (promesse de la case d'inscription) ; regles SQL (migration 0055, non appliquee) = JS.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const L = require("../lib/lifecycle-email.js");
const build = require("../lib/lifecycle-email-build.js");
const ROOT = path.join(__dirname, "..");
const BUNDLE = build.loadBundle();
const DAY = 86400000;
const NOW = new Date("2026-10-27T09:00:00Z"); // mardi, 10 h a Paris
const USER = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SECRET = "test-unsubscribe-secret-0123456789abcdef";
const ago = (d) => new Date(NOW - d * DAY).toISOString();
const facts = (over) => Object.assign({ userId: USER, market: "fr", plan: "free", role: "customer", marketingOptIn: true, notifyWeeklyRecap: true, hasSubscription: false, suppressed: false,
  createdAt: ago(1.2), lastSignInAt: ago(1.2), lastFunnelAt: null, lastEngagementAt: null, lastMarketingSentAt: null, sentKeys: ["welcome:"] }, over || {});
const seq = (over, now) => L.decideCampaign(facts(over), now || NOW, { sequence: true });

test("suite : J+1 match offert, J+3 bilan d'hier, J+6 offre Pro, jamais plus d'un e-mail tous les 3 jours", () => {
  assert.deepEqual(seq(), { campaign: "free_match", key: "", reason: null });
  assert.equal(L.decideCampaign(facts(), NOW).reason, "nothing_due", "sans la suite : regles d'avant (J2)");
  assert.equal(seq({ createdAt: ago(3.4), sentKeys: ["welcome:", "free_match:"], lastMarketingSentAt: ago(2.4) }).reason, "frequency_cap", "J+3 attend 3 jours apres J+1");
  assert.equal(seq({ createdAt: ago(4.1), sentKeys: ["welcome:", "free_match:"], lastMarketingSentAt: ago(3.05) }).campaign, "results_recap");
  assert.equal(seq({ createdAt: ago(7.2), sentKeys: ["welcome:", "free_match:", "results_recap:"], lastMarketingSentAt: ago(3.1) }).campaign, "pro_features");
  assert.equal(seq({ createdAt: ago(7.2), sentKeys: ["welcome:", "free_match:", "results_recap:", "pro_features:"], lastMarketingSentAt: ago(3.1) }).reason, "nothing_due", "suite finie");
  assert.equal(seq({ createdAt: ago(3.5), sentKeys: ["welcome:"] }).campaign, "results_recap", "J+1 manque (pas de match publie) : la suite continue");
  assert.equal(seq({ marketingOptIn: false }).reason, "not_opted_in", "consentement obligatoire");
  assert.equal(seq({ plan: "pro" }).campaign, null, "jamais a un abonne");
  assert.equal(seq({}, new Date("2026-10-27T20:30:00Z")).reason, "quiet_hours", "jamais la nuit");
  assert.equal(seq({ createdAt: ago(0.2), sentKeys: [] }).campaign, "welcome");
});

test("migration 0055 (non appliquee) : memes regles que decideCampaign, p_sequence faux par defaut", () => {
  const raw = fs.readFileSync(path.join(ROOT, "supabase", "migrations", "0055_email_suite_gratuite.sql"), "utf8");
  const sql = raw.split("\n").map((l) => l.replace(/--.*$/, "")).join("\n").replace(/\s+/g, " ");
  assert.match(raw, /MIGRATION NON APPLIQUEE/);
  assert.doesNotMatch(sql, /cron\.schedule|net\.http_post|create extension/i);
  assert.ok(sql.includes("p_sequence boolean default false"));
  assert.ok(sql.includes("drop function if exists public.lifecycle_email_candidates(timestamptz, integer);"));
  const S = L.RULES.sequence;
  const win = (w, c) => "when p_sequence and p_now - f.created_at >= interval '" + w[0] + " days' and p_now - f.created_at < interval '" + w[1] + " days' and not ('" + c + ":' = any (f.sent_keys)) then '" + c + "'";
  assert.ok(sql.includes(win(S.freeMatch, "free_match")));
  assert.ok(sql.includes(win(S.resultsRecap, "results_recap")));
  assert.ok(sql.includes(win(S.proFeatures, "pro_features")));
  assert.ok(sql.includes("when not p_sequence and p_now - f.created_at >= interval '" + L.RULES.freeMatchFromDays + " days'"));
  assert.ok(sql.indexOf("when not f.marketing_opt_in then null") < sql.indexOf("when p_sequence"), "consentement avant la suite");
  assert.ok(sql.includes("p_now - f.last_marketing_sent_at < interval '" + L.RULES.minDaysBetweenMarketing + " days' then null"));
  assert.ok(sql.indexOf("when f.no_sales then") < sql.indexOf("when p_sequence"), "jamais a un abonne");
  assert.match(sql, /'results_recap'\]\)\)/);
  assert.ok(sql.includes("revoke all on function public.lifecycle_email_candidates(timestamptz, integer, boolean) from public, anon, authenticated;"));
  assert.ok(sql.includes("grant execute on function public.lifecycle_email_candidates(timestamptz, integer, boolean) to service_role;"));
});

test("bilan d'hier : paris publies AVANT le coup d'envoi, gagnes et perdus, attente si l'archive n'est pas reglee", () => {
  const w = L.recapWindow(NOW, L.siteContext(BUNDLE.markets, "fr"));
  assert.deepEqual(w, { day: "2026-10-26", fromIso: "2026-10-25T23:00:00.000Z", toIso: "2026-10-26T23:00:00.000Z" });
  const mx = L.recapWindow(new Date("2026-10-27T04:00:00Z"), L.siteContext(BUNDLE.markets, "mx"));
  assert.equal(mx.day, "2026-10-25", "hier du destinataire (Mexico : 22 h le 26/10)");
  const ko = "2026-10-26T19:00:00Z", pub = "2026-10-26T06:00:00Z";
  const rows = [].concat(
    Array(5).fill({ result: "win", published_at: pub, kickoff_at: ko, type: "single" }),
    Array(2).fill({ result: "loss", published_at: pub, kickoff_at: ko, type: "single" }),
    [{ result: "loss", published_at: "2026-10-26T19:30:00Z", kickoff_at: ko, type: "single" }],
    [{ result: "no_signal", published_at: pub, kickoff_at: ko }],
    [{ result: "void", published_at: pub, kickoff_at: ko }]
  );
  const r = L.recapFromRows(rows, "2026-10-26");
  assert.deepEqual(r, { day: "2026-10-26", won: 5, lost: 2, voided: 1, pending: 0, total: 8 }, "publie apres le coup d'envoi : jamais compte");
  assert.equal(L.recapReady(r), true);
  assert.equal(L.recapReady(Object.assign({}, r, { pending: 2, total: 10 })), true, "1 sur 5 en attente au plus");
  assert.equal(L.recapReady(Object.assign({}, r, { pending: 3, total: 10 })), false);
  assert.equal(L.recapReady({ won: 0, lost: 0, voided: 0, pending: 0, total: 0 }), false, "aucun pari regle : pas d'e-mail");
});

test("e-mail du bilan : gagnes ET perdus, aucun pourcentage, essai avec la date du premier prelevement", async () => {
  const token = await L.createUnsubscribeToken({ userId: USER, dir: "fr" }, SECRET, NOW);
  const unsubscribeUrl = L.unsubscribeLinks(token, "fr", "https://example.supabase.co").page;
  const bilan = { day: "2026-10-26", won: 5, lost: 2, voided: 1, pending: 1, total: 9 };
  const r = L.renderLifecycleEmail(BUNDLE, "results_recap", "fr", { marketingOptIn: true, trialDays: 7, bilan }, { unsubscribeUrl, now: NOW });
  const txt = r.text.replace(/[  ]/g, " ");
  assert.equal(r.subject, "Le bilan d'hier : 5 gagnés, 2 perdus");
  assert.ok(txt.includes("Hier, lundi 26 octobre,") && txt.includes("- 5 gagnés") && txt.includes("- 2 perdus") && txt.includes("1 annulé (match annulé ou reporté)"), txt);
  assert.ok(txt.includes("1 pari pas encore réglé"));
  assert.ok(txt.includes("Premier prélèvement : 14,99 € le 3 novembre si tu commences aujourd'hui"));
  assert.doesNotMatch(r.subject + txt, /%|taux|réussite|rentab|gain/i);
  const one = L.renderLifecycleEmail(BUNDLE, "results_recap", "fr", { marketingOptIn: true, bilan: { day: "2026-10-26", won: 1, lost: 0, voided: 0, pending: 0, total: 1 } }, { unsubscribeUrl, now: NOW });
  assert.equal(one.subject, "Le bilan d'hier : 1 gagné, 0 perdu");
  assert.ok(!one.text.includes("Premier prélèvement") && one.text.includes("Voir les matchs du jour"), "sans essai confirme : pas d'offre d'essai");
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "results_recap", "fr", { marketingOptIn: true, bilan: null }, { unsubscribeUrl, now: NOW }), (e) => e.code === "missing_results");
  for (const dir of ["en", "es", "gb", "mx", "za"]) {
    const x = L.renderLifecycleEmail(BUNDLE, "results_recap", dir, { marketingOptIn: true, trialDays: 7, bilan }, { unsubscribeUrl: L.unsubscribeLinks(await L.createUnsubscribeToken({ userId: USER, dir }, SECRET, NOW), dir, "https://example.supabase.co").page, now: NOW });
    assert.doesNotMatch(x.subject + x.text, /\{\{|\}\}|undefined|null|%/, dir);
    assert.ok(x.text.includes("5") && x.text.includes("2"), dir);
  }
});

// ------------------------------------------------------------ fonction Edge
const loadSend = () => import(pathToFileURL(path.join(ROOT, "supabase", "functions", "send-lifecycle-emails", "handler.ts")).href);
const INTERNAL = "test-internal-secret-0123456789";
const BREVO = "https://api.brevo.com/v3/smtp/email";
const DATA = "https://iashark.com/data-home.json";
function deps(opts) {
  const env = { EMAIL_INTERNAL_SECRET: INTERNAL, EMAIL_UNSUBSCRIBE_SECRET: SECRET, SUPABASE_URL: "https://example.supabase.co", BREVO_API_KEY: "k", EMAIL_FROM: "IASHARK <news@iashark.com>", COMPANY_OPERATOR_NAME: "IASHARK, entrepreneur individuel", LIFECYCLE_SENDER_CONTACT: "contact@iashark.com" };
  const calls = [], db = { args: null, windows: [] };
  const row = Object.assign({ user_id: USER, email: "client@example.com", plan: "free", role: "customer", market: "fr", marketing_opt_in: true, notify_weekly_recap: true, has_subscription: false, suppressed: false,
    created_at: ago(4.1), last_sign_in_at: ago(4.1), last_funnel_at: null, last_marketing_sent_at: ago(3.05), sent_keys: ["welcome:", "free_match:"], campaign: "results_recap", campaign_key: "", ever_subscribed: false }, opts.row || {});
  const store = {
    listCandidates: async (a) => { db.args = a; return [row]; },
    reserveSend: async () => 1,
    completeSend: async () => {},
  };
  if (opts.archive) store.yesterdayResults = async (w) => { db.windows.push(w); return opts.archive; };
  return { db, calls, deps: { env: (k) => env[k], now: () => NOW, log: { info() {}, warn() {}, error() {} }, db: store,
    fetch: async (url, init) => { calls.push({ url: String(url), init }); if (String(url) === DATA) return new Response(JSON.stringify({ matchs: [] }), { status: 200 }); if (String(url) === BREVO) return new Response(JSON.stringify({ messageId: "<m@x>" }), { status: 201 }); throw new Error("fetch inattendu : " + url); } } };
}
const post = (body) => new Request("https://x/fn", { method: "POST", headers: { "x-internal-secret": INTERNAL }, body: JSON.stringify(body) });
const ARCHIVE = [].concat(Array(5).fill({ result: "win", published_at: "2026-10-26T06:00:00Z", kickoff_at: "2026-10-26T19:00:00Z", type: "single" }), Array(2).fill({ result: "loss", published_at: "2026-10-26T06:00:00Z", kickoff_at: "2026-10-26T19:00:00Z", type: "single" }));

test("fonction : la suite ne part que si elle est demandee (sequence: true -> p_sequence), bilan lu dans l'archive", async () => {
  const { handleRequest } = await loadSend();
  let t = deps({ archive: ARCHIVE });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual(t.db.args, { nowIso: NOW.toISOString(), limit: 200 }, "sans la suite : aucun p_sequence envoye");
  assert.deepEqual([body.sent, body.results[0].status, body.results[0].reason], [0, "skipped", "nothing_due"], "sans la suite, le JS refuse un bilan propose : rien ne part");
  t = deps({ archive: ARCHIVE });
  body = await (await handleRequest(post({ sequence: true }), t.deps)).json();
  assert.deepEqual(t.db.args, { nowIso: NOW.toISOString(), limit: 200, sequence: true });
  assert.deepEqual([body.sent, body.sequence], [1, true]);
  assert.deepEqual(t.db.windows, [{ fromIso: "2026-10-25T23:00:00.000Z", toIso: "2026-10-26T23:00:00.000Z" }]);
  const p = JSON.parse(t.calls.find((c) => c.url === BREVO).init.body);
  assert.equal(p.subject, "Le bilan d'hier : 5 gagnés, 2 perdus");
  assert.ok(p.textContent.includes("Premier prélèvement") && p.textContent.includes("abonnement.html?duree=month"));
  assert.ok(p.textContent.includes("https://iashark.com/fr/desinscription-email.html#t="), "lien de desinscription");
  assert.match(p.headers["List-Unsubscribe"], /email-unsubscribe\?t=/);
});

test("fonction : archive pas encore reglee ou illisible = aucun e-mail (nouvel essai l'heure suivante)", async () => {
  const { handleRequest } = await loadSend();
  const pending = ARCHIVE.concat(Array(3).fill({ result: "scheduled", published_at: "2026-10-26T06:00:00Z", kickoff_at: "2026-10-26T20:00:00Z", type: "single" }));
  let t = deps({ archive: pending });
  let body = await (await handleRequest(post({ sequence: true }), t.deps)).json();
  assert.deepEqual([body.sent, body.results[0].reason], [0, "results_not_settled"]);
  t = deps({});
  body = await (await handleRequest(post({ sequence: true }), t.deps)).json();
  assert.deepEqual([body.sent, body.results[0].reason], [0, "results_unavailable"]);
  assert.ok(!t.calls.some((c) => c.url === BREVO));
});

test("workflow : la suite n'est demandee que par la variable EMAILS_SUITE_ACTIVE ou la case « suite »", () => {
  const wf = fs.readFileSync(path.join(ROOT, ".github", "workflows", "emails-cycle-de-vie.yml"), "utf8");
  assert.match(wf, /vars\.EMAILS_SUITE_ACTIVE == 'true'/);
  assert.match(wf, /suite:\n\s+description: [^\n]+\n\s+required: false\n\s+default: false/);
  assert.match(wf, /sequence: \$s/);
});
