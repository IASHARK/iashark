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

test("bilan d'hier : lu dans le fichier unique du site (preuves/bilan-hier.json, paris_simples), jamais recalcule ; veille a Paris", () => {
  const f = (jour, ps) => ({ version: 1, jour, offert: null, selection_or: null, paris_simples: ps === undefined ? { jour, gagnes: 5, perdus: 2, annules: 1, en_attente: 0, regle: "..." } : ps });
  assert.equal(L.parisYesterday(NOW), "2026-10-26");
  assert.equal(L.parisYesterday(new Date("2026-10-27T23:30:00Z")), "2026-10-27", "00 h 30 a Paris le 28 : la veille est le 27");
  assert.deepEqual(L.recapFromFile(f("2026-10-26"), NOW), { day: "2026-10-26", won: 5, lost: 2, voided: 1, pending: 0 });
  assert.equal(L.recapFromFile(f("2026-10-25"), NOW), null, "fichier d'un autre jour : aucun bilan");
  assert.equal(L.recapFromFile(Object.assign(f("2026-10-26"), { jour: "2026-10-25" }), NOW), null, "paris_simples d'un autre jour que le fichier");
  assert.equal(L.recapFromFile(f("2026-10-26", null), NOW), null, "archive illisible au calcul : aucun bilan");
  assert.equal(L.recapFromFile(null, NOW), null, "fichier absent");
  assert.equal(L.recapFromFile(f("2026-10-26", { jour: "2026-10-26", gagnes: 0, perdus: 0, annules: 0, en_attente: 4 }), NOW), null, "aucun resultat : rien");
  assert.equal(L.recapFromFile(f("2026-10-26", { jour: "2026-10-26", gagnes: "5", perdus: 2 }), NOW), null, "nombre illisible : rien");
  assert.deepEqual(L.recapFromFile(f("2026-10-26", { jour: "2026-10-26", gagnes: 67, perdus: 32, annules: 0, en_attente: 1 }), NOW), { day: "2026-10-26", won: 67, lost: 32, voided: 0, pending: 1 }, "en attente : dit, jamais cache");
  // Plus aucun calcul de bilan dans la fonction ni dans la lib (une seule source).
  const src = fs.readFileSync(path.join(ROOT, "lib", "lifecycle-email.js"), "utf8") + fs.readFileSync(path.join(ROOT, "supabase", "functions", "send-lifecycle-emails", "index.ts"), "utf8") + fs.readFileSync(path.join(ROOT, "supabase", "functions", "send-lifecycle-emails", "handler.ts"), "utf8");
  assert.doesNotMatch(src, /recapFromRows|yesterdayResults|from\("predictions_archive"\)/);
  assert.match(src, /https:\/\/iashark\.com\/preuves\/bilan-hier\.json/);
});

test("e-mail du bilan : gagnes ET perdus, aucun pourcentage, essai avec la date du premier prelevement", async () => {
  const token = await L.createUnsubscribeToken({ userId: USER, dir: "fr" }, SECRET, NOW);
  const unsubscribeUrl = L.unsubscribeLinks(token, "fr", "https://example.supabase.co").page;
  const bilan = { day: "2026-10-26", won: 5, lost: 2, voided: 1, pending: 1, total: 9 };
  const r = L.renderLifecycleEmail(BUNDLE, "results_recap", "fr", { marketingOptIn: true, trialDays: 7, bilan }, { unsubscribeUrl, now: NOW });
  const txt = r.text.replace(/[  ]/g, " ");
  assert.equal(r.subject, "Le bilan d'hier : 5 gagnés, 2 perdus");
  assert.ok(txt.includes("Hier, lundi 26 octobre, voici") && txt.includes("- 5 gagnés") && txt.includes("- 2 perdus") && txt.includes("- 1 annulé"), txt);
  assert.ok(txt.includes("Au moment de cet e-mail : 1 en attente de résultat."));
  assert.ok(!txt.includes("heure de Paris"), "France : pas de precision");
  assert.ok(txt.includes("Premier prélèvement : 14,99 € le 3 novembre si tu commences aujourd'hui"));
  assert.doesNotMatch(r.subject + txt, /%|taux|réussite|rentab|gain/i);
  const one = L.renderLifecycleEmail(BUNDLE, "results_recap", "fr", { marketingOptIn: true, bilan: { day: "2026-10-26", won: 1, lost: 0, voided: 0, pending: 0, total: 1 } }, { unsubscribeUrl, now: NOW });
  assert.equal(one.subject, "Le bilan d'hier : 1 gagné, 0 perdu");
  assert.ok(!one.text.includes("Premier prélèvement") && one.text.includes("Voir les matchs du jour"), "sans essai confirme : pas d'offre d'essai");
  assert.throws(() => L.renderLifecycleEmail(BUNDLE, "results_recap", "fr", { marketingOptIn: true, bilan: null }, { unsubscribeUrl, now: NOW }), (e) => e.code === "missing_results");
  const gbTok = await L.createUnsubscribeToken({ userId: USER, dir: "gb" }, SECRET, NOW);
  const gb = L.renderLifecycleEmail(BUNDLE, "results_recap", "gb", { marketingOptIn: true, bilan }, { unsubscribeUrl: L.unsubscribeLinks(gbTok, "gb", "https://example.supabase.co").page, now: NOW });
  assert.ok(gb.text.includes("Yesterday, Monday 26 October (Paris time),"), "gb, mx, za : « hier, heure de Paris »");
  const mxTok = await L.createUnsubscribeToken({ userId: USER, dir: "mx" }, SECRET, NOW);
  assert.ok(L.renderLifecycleEmail(BUNDLE, "results_recap", "mx", { marketingOptIn: true, bilan }, { unsubscribeUrl: L.unsubscribeLinks(mxTok, "mx", "https://example.supabase.co").page, now: NOW }).text.includes("(hora de París)"));
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
  const calls = [], db = { args: null };
  const row = Object.assign({ user_id: USER, email: "client@example.com", plan: "free", role: "customer", market: "fr", marketing_opt_in: true, notify_weekly_recap: true, has_subscription: false, suppressed: false,
    created_at: ago(4.1), last_sign_in_at: ago(4.1), last_funnel_at: null, last_marketing_sent_at: ago(3.05), sent_keys: ["welcome:", "free_match:"], campaign: "results_recap", campaign_key: "", ever_subscribed: false }, opts.row || {});
  const store = {
    listCandidates: async (a) => { db.args = a; return [row]; },
    reserveSend: async () => 1,
    completeSend: async () => {},
  };
  return { db, calls, deps: { env: (k) => env[k], now: () => NOW, log: { info() {}, warn() {}, error() {} }, db: store,
    fetch: async (url, init) => {
      calls.push({ url: String(url), init });
      if (String(url) === DATA) return new Response(JSON.stringify({ matchs: [] }), { status: 200 });
      if (String(url) === BILAN_URL) return opts.fichier === undefined ? new Response("{}", { status: 404 }) : new Response(JSON.stringify(opts.fichier), { status: 200 });
      if (String(url) === BREVO) return new Response(JSON.stringify({ messageId: "<m@x>" }), { status: 201 });
      throw new Error("fetch inattendu : " + url);
    } } };
}
const post = (body) => new Request("https://x/fn", { method: "POST", headers: { "x-internal-secret": INTERNAL }, body: JSON.stringify(body) });
const BILAN_URL = "https://iashark.com/preuves/bilan-hier.json";
const FICHIER = { version: 1, jour: "2026-10-26", offert: null, selection_or: null, paris_simples: { jour: "2026-10-26", gagnes: 5, perdus: 2, annules: 0, en_attente: 0 } };

test("fonction : la suite ne part que si elle est demandee (sequence: true -> p_sequence), bilan lu dans preuves/bilan-hier.json", async () => {
  const { handleRequest } = await loadSend();
  let t = deps({ fichier: FICHIER });
  let body = await (await handleRequest(post({}), t.deps)).json();
  assert.deepEqual(t.db.args, { nowIso: NOW.toISOString(), limit: 200 }, "sans la suite : aucun p_sequence envoye");
  assert.deepEqual([body.sent, body.results[0].status, body.results[0].reason], [0, "skipped", "nothing_due"], "sans la suite, le JS refuse un bilan propose : rien ne part");
  t = deps({ fichier: FICHIER });
  body = await (await handleRequest(post({ sequence: true }), t.deps)).json();
  assert.deepEqual(t.db.args, { nowIso: NOW.toISOString(), limit: 200, sequence: true });
  assert.deepEqual([body.sent, body.sequence], [1, true]);
  assert.equal(t.calls.filter((c) => c.url === BILAN_URL).length, 1, "le fichier unique, lu une fois par passage");
  const p = JSON.parse(t.calls.find((c) => c.url === BREVO).init.body);
  assert.equal(p.subject, "Le bilan d'hier : 5 gagnés, 2 perdus");
  assert.ok(p.textContent.includes("Premier prélèvement") && p.textContent.includes("abonnement.html?duree=month"));
  assert.ok(p.textContent.includes("https://iashark.com/fr/desinscription-email.html#t="), "lien de desinscription");
  assert.match(p.headers["List-Unsubscribe"], /email-unsubscribe\?t=/);
});

test("fonction : fichier absent ou d'un autre jour = aucun bilan, donc aucun e-mail J+3 (nouvel essai l'heure suivante)", async () => {
  const { handleRequest } = await loadSend();
  let t = deps({ fichier: Object.assign({}, FICHIER, { jour: "2026-10-25", paris_simples: Object.assign({}, FICHIER.paris_simples, { jour: "2026-10-25" }) }) });
  let body = await (await handleRequest(post({ sequence: true }), t.deps)).json();
  assert.deepEqual([body.sent, body.results[0].reason], [0, "results_not_ready"]);
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
