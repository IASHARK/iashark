"use strict";
// Surveillance du site (MONITORING.md) : fonctions pures de
// lib/health/checks.js et lib/health/issues.js, avec fixtures en memoire.
// AUCUN appel reseau : le client GitHub est remplace par un faux.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const checks = require("../lib/health/checks.js");
const issues = require("../lib/health/issues.js");
const { upsertAlertIssue, resolveAlertIssue } = require("../lib/health/github.js");
const { parseSupabasePublicConfig, parseArgs } = require("../scripts/site-health-check.js");

const FIELDS = checks.BASE_PREMIUM_FIELDS;
const NOW = new Date("2026-09-14T08:00:00Z"); // 10h00 a Paris

function match(id, extra) {
  return Object.assign({ id: id, date: "2026-09-14 21:00", is_free: false, odds_available: true, c1: "1.85" }, extra || {});
}

// --- Scan premium -------------------------------------------------------------
test("scanPremium trouve les champs premium imbriques", () => {
  const paths = checks.scanPremium({ a: 1, detail: { edge: 3, list: [{ pari_rec: "1" }, { ok: true }] }, marche: "1X2" }, FIELDS);
  assert.deepEqual(paths.sort(), ["detail.edge", "detail.list[0].pari_rec", "marche"]);
});

test("noms generiques (val, edge, marche...) : premier niveau seulement", () => {
  const spec = checks.loadPremiumFields("/r", () => { throw new Error("absent"); });
  assert.ok(spec.fields.includes("edge") && spec.fields.includes("marche"));
  assert.ok(!spec.deepFields.includes("edge"));
  const m = match(5, { fatigue: { home: { val: 3, edge: 1 } }, sub: { pari_rec: "x" }, edge: 2 });
  assert.deepEqual(checks.scanPremium(m, spec).sort(), ["edge", "sub.pari_rec"]);
  // DEEP_PREMIUM_KEYS de la liste partagee est cherche en profondeur.
  const shared = checks.loadPremiumFields("/r", (p) => {
    if (p.endsWith("premium-fields.js")) return { PREMIUM_FIELDS: ["val", "top_scorers"], DEEP_PREMIUM_KEYS: ["goal_threat_score"] };
    throw new Error();
  });
  assert.deepEqual(checks.scanPremium(match(6, { top_scorers: [{ goal_threat_score: 1 }], fatigue: { val: 1 } }), shared).sort(),
    ["top_scorers", "top_scorers[0].goal_threat_score"]);
  assert.equal(checks.fieldList(["a", "b", "c"], 2), "a, b et 1 autre(s)");
});

test("findMatchLeaks ignore le match offert et signale les matchs payants", () => {
  const leaks = checks.findMatchLeaks([
    match(1, { is_free: true, pari_rec: "1", kelly: 2 }),
    match(2, { market_id: "FT_1X2" }),
    match(3, { conf: 6.9 }),
  ], FIELDS);
  assert.equal(leaks.length, 1);
  assert.equal(leaks[0].id, "2");
  assert.deepEqual(leaks[0].paths, ["market_id"]);
});

test("checkPremiumLeaks : fail avec les champs, ok sans fuite", () => {
  const bad = checks.checkPremiumLeaks("x", "data.json", [match(2, { marche: "1X2", nested: { verdict_shark: "a" } })], FIELDS);
  assert.equal(bad.status, "fail");
  assert.match(bad.detail, /marche/);
  assert.match(bad.detail, /nested\.verdict_shark/);
  assert.ok(bad.fix);
  assert.equal(checks.checkPremiumLeaks("x", "data.json", [match(3)], FIELDS).status, "ok");
  assert.equal(checks.checkPremiumLeaks("x", "data.json", null, FIELDS).status, "skip");
});

// Fausse alerte du 15/09 (issue #2) : le script passait premium.fields (liste
// simple, tout cherche en profondeur) et signalait fatigue.home.val, donnee
// publique. Il doit passer la specification { fields, deepFields }.
test("controle en ligne : fatigue.*.val n'est pas une fuite, un vrai champ premium si", () => {
  const spec = checks.loadPremiumFields(path.join(__dirname, ".."));
  const pub = match(7, { fatigue: { home: { val: 70, info: "3j" }, away: { val: 15 } }, fatigue_home: { val: 70 }, fatigue_away: { val: 15 } });
  delete pub.odds_available; // premium depuis le 14/09 : absent des fichiers publics
  assert.equal(checks.checkPremiumLeaks("x", "match/<id>.json", [pub], spec).status, "ok");
  assert.equal(checks.checkPremiumLeaks("x", "match/<id>.json", [match(8, { paris_safe: { bet: "x" } })], spec).status, "fail");
  const src = fs.readFileSync(path.join(__dirname, "..", "scripts", "site-health-check.js"), "utf8");
  assert.doesNotMatch(src, /checkPremiumLeaks\([^)]*premium\.fields\)/);
  assert.doesNotMatch(src, /checkMatchDataFunction\([^)]*premium\.fields\)/);
});

test("loadPremiumFields fusionne les listes partagees et tolere un module absent", () => {
  const fake = (p) => {
    if (p.endsWith("premium-fields.js")) return { PREMIUM_FIELDS: ["dropping_odds"], PREMIUM_I18N: ["facteur_x_i18n"], OTHER: ["pas_premium"] };
    throw new Error("absent");
  };
  const r = checks.loadPremiumFields("/racine", fake);
  assert.ok(r.fields.includes("dropping_odds"));
  assert.ok(r.fields.includes("facteur_x_i18n"));
  assert.ok(!r.fields.includes("pas_premium"));
  FIELDS.forEach((f) => assert.ok(r.fields.includes(f), f));
  assert.deepEqual(r.sources, ["base", "lib/premium-fields.js"]);
  // Tableau exporte directement.
  assert.ok(checks.loadPremiumFields("/r", (p) => { if (p.endsWith("premium-fields.js")) return ["x_premium"]; throw new Error(); }).fields.includes("x_premium"));
});

test("la liste de base couvre les champs premium de lib/public-data-split.js", () => {
  const r = checks.loadPremiumFields(path.join(__dirname, ".."));
  require("../lib/public-data-split.js").PREMIUM_FIELDS.forEach((f) => assert.ok(r.fields.includes(f), f));
});

// --- Fraicheur ------------------------------------------------------------------
test("parisDay et addDays suivent l'heure de Paris", () => {
  assert.equal(checks.parisDay(new Date("2026-09-14T22:30:00Z")), "2026-09-15");
  assert.equal(checks.parisDay(new Date("2026-09-14T21:59:00Z")), "2026-09-14");
  assert.equal(checks.addDays("2026-09-30", 1), "2026-10-01");
  assert.equal(checks.addDays("2026-10-25", 1), "2026-10-26"); // changement d'heure
});

test("checkUpcomingMatches : aujourd'hui ou demain a Paris", () => {
  assert.equal(checks.checkUpcomingMatches([match(1, { date: "2026-09-15 20:00" })], NOW).status, "ok");
  const stale = checks.checkUpcomingMatches([match(1, { date: "2026-09-12 20:00" }), match(2, { date: "2026-09-13 18:00" })], NOW);
  assert.equal(stale.status, "fail");
  assert.match(stale.detail, /2026-09-12, 2026-09-13/);
  assert.equal(checks.checkUpcomingMatches([], NOW).status, "fail");
  assert.equal(checks.checkUpcomingMatches(null, NOW).status, "fail");
});

test("checkDailyCommitAge : seuil de 30 heures", () => {
  assert.equal(checks.checkDailyCommitAge("2026-09-13T03:00:00Z", NOW).status, "ok"); // 29 h
  assert.equal(checks.checkDailyCommitAge("2026-09-13T01:00:00Z", NOW).status, "fail"); // 31 h
  assert.equal(checks.checkDailyCommitAge(null, NOW).status, "fail");
  assert.equal(checks.checkDailyCommitAge("pas une date", NOW).status, "skip");
});

test("checkDeployLag : detecte un deploiement Netlify bloque", () => {
  assert.equal(checks.checkDeployLag("2026-09-14T06:40:00Z", "2026-09-13T06:30:00Z", NOW).status, "fail");
  assert.equal(checks.checkDeployLag("2026-09-14T06:40:00Z", "2026-09-14T06:39:30Z", NOW).status, "ok");
  // Commit tres recent : Netlify a encore le temps de deployer.
  assert.equal(checks.checkDeployLag("2026-09-14T07:30:00Z", "2026-09-13T06:30:00Z", NOW).status, "ok");
  assert.equal(checks.checkDeployLag(null, "2026-09-13T06:30:00Z", NOW).status, "skip");
});

// --- Contenu ------------------------------------------------------------------
test("checkFreeMatch exige un match offert quand il y a des matchs", () => {
  assert.equal(checks.checkFreeMatch([match(1), match(2, { is_free: true })]).status, "ok");
  assert.equal(checks.checkFreeMatch([match(1), match(2, { is_free: "true" })]).status, "fail");
  assert.equal(checks.checkFreeMatch([]).status, "skip");
});

test("checkSafePick : complet seulement pour le match offert", () => {
  const ms = [match(10, { is_free: true }), match(11)];
  const pick = (fid) => ({ status: "SELECTED", fixture: { fixture_id: fid }, market: "FT_1X2_HOME", model_probability: 0.7, decimal_odds: 1.6 });
  assert.equal(checks.checkSafePick({ safe_pick: pick(10) }, ms).status, "ok");
  assert.equal(checks.checkSafePick({ safe_pick: pick(11) }, ms).status, "fail");
  assert.equal(checks.checkSafePick({ safe_pick: { status: "SELECTED", redacted: true } }, ms).status, "ok");
  assert.equal(checks.checkSafePick({ safe_pick: null, daily_combos: { combos: [{ combo_id: "c", legs: [{ market: "x" }] }] } }, ms).status, "fail");
  assert.equal(checks.checkSafePick({ top5_scorers: { players: [{ name: "x" }] } }, ms).status, "fail");
  assert.equal(checks.checkSafePick({ daily_combos: { combos: [{ combo_id: "c", status: "OK" }], redacted: true } }, ms).status, "ok");
  assert.equal(checks.checkSafePick(null, ms).status, "skip");
});

test("checkLlmTexts : avertit (jamais d'echec) a 0 % en citant ANTHROPIC_KEY", () => {
  const none = checks.checkLlmTexts([match(1, { analyse_card: "" }), match(2, { contexte: { fr: "  " } })], "data.json");
  assert.equal(none.status, "warn");
  assert.match(none.detail, /ANTHROPIC_KEY/);
  assert.equal(checks.checkLlmTexts([match(1, { contexte: { fr: "Texte" } }), match(2)], "data.json").status, "ok");
  assert.equal(checks.checkLlmTexts([], "data.json").status, "skip");
  // Textes premium : ratio calcule sur les seuls matchs offerts.
  const mixed = [match(1, { is_free: true, contexte: { fr: "Texte" } }), match(2), match(3)];
  assert.equal(checks.checkLlmTexts(mixed, "data.json", { freeOnly: true }).status, "ok");
  assert.equal(checks.checkLlmTexts([match(1, { is_free: true }), match(2, { contexte: "x" })], "data.json", { freeOnly: true }).status, "warn");
  assert.equal(checks.checkLlmTexts([match(2)], "data.json", { freeOnly: true }).status, "skip");
});

test("checkOdds : 0 % echoue, moins de 50 % avertit", () => {
  const noOdds = (id) => match(id, { odds_available: false, c1: "" });
  assert.equal(checks.checkOdds([noOdds(1), noOdds(2)]).status, "fail");
  assert.equal(checks.checkOdds([match(1), noOdds(2), noOdds(3)]).status, "warn");
  assert.equal(checks.checkOdds([match(1), match(2)]).status, "ok");
  assert.equal(checks.checkPinnacle([match(1)]).status, "warn");
  assert.equal(checks.checkPinnacle([match(1, { pinnacle_snapshot: { home: 1.9 } })]).status, "ok");
});

// --- Pages -----------------------------------------------------------------------
test("pages, fichiers internes et redirections", () => {
  assert.equal(checks.htmlLang('<!doctype html><html class="x" lang="en-GB">'), "en-GB");
  assert.equal(checks.checkPage("/gb/", { status: 200, body: '<html lang="en-GB">' }, "en-GB").status, "ok");
  assert.equal(checks.checkPage("/gb/", { status: 200, body: '<html lang="fr">' }, "en-GB").status, "fail");
  assert.equal(checks.checkPage("/gb/", { status: 500, body: "" }, "en-GB").status, "fail");
  assert.equal(checks.checkPage("/gb/", { error: "delai depasse" }, "en-GB").status, "fail");
  assert.equal(checks.checkNotPublic("/FINAL_360_AUDIT.md", { status: 404 }).status, "ok");
  assert.equal(checks.checkNotPublic("/FINAL_360_AUDIT.md", { status: 200 }).status, "fail");
  assert.equal(checks.checkRedirect("/cgv", { status: 301, location: "https://iashark.com/fr/cgv.html" }, 301, "/fr/cgv.html").status, "ok");
  assert.equal(checks.checkRedirect("/cgv", { status: 302, location: "/fr/cgv.html" }, 301, "/fr/cgv.html").status, "fail");
  assert.equal(checks.checkRedirect("/cgv", { status: 301, location: "/en/" }, 301, "/fr/cgv.html").status, "fail");
});

// --- Fonctions Edge / fournisseurs ----------------------------------------------------
test("fonctions Edge : match-data, checkout, login-guard", () => {
  const md = (matchs, extra) => ({ status: 200, json: Object.assign({ matchs: matchs, isPro: false }, extra || {}) });
  assert.equal(checks.checkMatchDataFunction(md([match(1, { is_free: true, pari_rec: "1" }), match(2)]), FIELDS).status, "ok");
  assert.equal(checks.checkMatchDataFunction(md([match(2, { edge: 4 })]), FIELDS).status, "fail");
  assert.equal(checks.checkMatchDataFunction(md([]), FIELDS).status, "fail");
  assert.equal(checks.checkMatchDataFunction(md([match(2)], { isPro: true }), FIELDS).status, "fail");
  assert.equal(checks.checkMatchDataFunction({ status: 502, json: {} }, FIELDS).status, "fail");

  assert.equal(checks.checkCheckoutFunction({ status: 400, json: { code: "consent_required" } }).status, "ok");
  assert.equal(checks.checkCheckoutFunction({ status: 200, json: { ok: true, processed: false, payment_provider: "disabled" } }).status, "ok");
  assert.equal(checks.checkCheckoutFunction({ status: 200, json: { processed: true, url: "https://checkout" } }).status, "fail");
  assert.equal(checks.checkCheckoutFunction({ status: 500, json: { error: "billing_misconfigured" } }).status, "fail");
  assert.equal(checks.checkCheckoutFunction({ status: 401, json: { error: "unauthorized" } }).status, "warn");

  assert.equal(checks.checkLoginGuardFunction({ status: 400, json: { error: "invalid_json" } }).status, "ok");
  assert.equal(checks.checkLoginGuardFunction({ status: 500, json: {} }).status, "fail");
});

test("quota api-football et taches pg_cron", () => {
  const api = (current, limit) => ({ status: 200, json: { errors: [], response: { subscription: { active: true }, requests: { current: current, limit_day: limit } } } });
  assert.equal(checks.checkApiFootballStatus(null).status, "skip");
  assert.equal(checks.checkApiFootballStatus(api(100, 7500)).status, "ok");
  assert.equal(checks.checkApiFootballStatus(api(7000, 7500)).status, "warn");
  assert.equal(checks.checkApiFootballStatus(api(7500, 7500)).status, "fail");
  assert.equal(checks.checkApiFootballStatus({ status: 200, json: { errors: { token: "Error/Missing application key" }, response: [] } }).status, "fail");

  const rows = [
    { jobname: "expire-past-due-access", active: true, status: "succeeded", start_time: "2026-09-14T03:07:00Z" },
    { jobname: "purge-old-funnel-events", active: true, status: "failed", start_time: "2026-09-14T03:17:00Z", return_message: "ERROR: boom" },
  ];
  const r = checks.checkCronJobs(rows, NOW);
  assert.deepEqual(r.map((x) => x.status), ["ok", "fail"]);
  assert.match(r[1].detail, /boom/);
  assert.equal(checks.checkCronJobs([rows[0]], NOW)[1].status, "fail"); // tache disparue
  assert.equal(checks.checkCronJobs([{ jobname: "expire-past-due-access", active: true, status: "succeeded", start_time: "2026-09-12T03:07:00Z" }, rows[0]].slice(0, 1), NOW)[0].status, "warn");
  assert.equal(checks.checkCronJobs(null, NOW)[0].status, "skip");
});

test("summarize : un seul echec rend le bilan critique", () => {
  assert.equal(checks.summarize([{ status: "ok" }, { status: "warn" }]).status, "warn");
  assert.equal(checks.summarize([{ status: "ok" }, { status: "fail" }, { status: "skip" }]).status, "fail");
  assert.equal(checks.summarize([{ status: "ok" }, { status: "skip" }]).status, "ok");
});

// --- Configuration Supabase publique --------------------------------------------
test("parseSupabasePublicConfig accepte la cle anon et refuse une cle privilegiee", () => {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const src = (role) => 'var SUPA_URL = "https://abcdef.supabase.co";\n  var SUPA_KEY = "' + b64({ alg: "HS256" }) + "." + b64({ role: role }) + '.sig";';
  const ok = parseSupabasePublicConfig(src("anon"));
  assert.equal(ok.ref, "abcdef");
  assert.ok(!ok.error);
  assert.match(parseSupabasePublicConfig(src("service_role")).error, /pas une cle anon/);
  assert.ok(parseSupabasePublicConfig("rien").error);
  // Le vrai fichier du depot porte bien une cle anon.
  const real = parseSupabasePublicConfig(fs.readFileSync(path.join(__dirname, "..", "funnel-track.js"), "utf8"));
  assert.ok(!real.error, real.error);
  assert.equal(parseArgs(["--data-json", "n'importe quoi"]).dataJson, "auto");
});

// --- Textes des issues -----------------------------------------------------------
const REPORT = {
  generated_at: "2026-09-14T08:00:00.000Z",
  base_url: "https://iashark.com",
  results: [
    { id: "a", group: "fuite", title: "Aucun champ premium public : data.json", status: "fail", detail: "54 match(s) payant(s) exposent : marche", fix: "Relancer le pipeline." },
    { id: "b", group: "contenu", title: "Textes d'analyse IA presents", status: "warn", detail: "0/55 - ANTHROPIC_KEY", fix: "Verifier le secret." },
    { id: "c", group: "pages", title: "Page /fr/ en ligne", status: "ok", detail: "200, lang=fr" },
  ],
};
REPORT.summary = checks.summarize(REPORT.results);

test("formatHealthIssue : titre date, uniquement les echecs, avec la solution", () => {
  const a = issues.formatHealthIssue(REPORT, { now: NOW, runUrl: "https://github.com/IASHARK/iashark/actions/runs/1" });
  assert.equal(a.title, "🚨 Santé du site – 2026-09-14");
  assert.equal(a.key, "site-health");
  assert.match(a.body, /### ❌ Aucun champ premium public : data\.json/);
  assert.match(a.body, /\*\*Que faire :\*\* Relancer le pipeline\./);
  assert.match(a.body, /actions\/runs\/1/);
  assert.doesNotMatch(a.body, /Textes d'analyse IA/); // avertissement : resume du job seulement
});

test("formatStepSummary liste les avertissements et tous les controles", () => {
  const md = issues.formatStepSummary(REPORT);
  assert.match(md, /panne critique/);
  assert.match(md, /### Avertissements[\s\S]*Textes d'analyse IA/);
  assert.match(md, /\| ✅ \| Pages et redirections \| Page \/fr\/ en ligne \| 200, lang=fr \|/);
});

const RUN = {
  id: 42, name: "Update IASHARK Daily", path: ".github/workflows/update-data.yml", conclusion: "failure",
  html_url: "https://github.com/IASHARK/iashark/actions/runs/42", event: "schedule", head_branch: "main",
  head_sha: "0123456789abcdef", updated_at: "2026-09-14T06:40:00Z",
};
const JOBS = [{ name: "update", conclusion: "failure", html_url: "https://github.com/x/job/1", steps: [
  { name: "Checkout", conclusion: "success" },
  { name: "Run pipeline", conclusion: "failure" },
  { name: "Commit", conclusion: "skipped" },
] }];

test("formatWorkflowIssue : titre, lien du run, job et etape en echec, explication", () => {
  const a = issues.formatWorkflowIssue({ run: RUN, failedJobs: JOBS, now: NOW });
  assert.equal(a.title, "🚨 Pipeline quotidien en échec – 2026-09-14");
  assert.equal(a.key, "workflow-update-data");
  assert.match(a.body, /actions\/runs\/42/);
  assert.match(a.body, /Job \*\*update\*\* \(failure\)/);
  assert.match(a.body, /"Run pipeline" \(failure\)/);
  assert.doesNotMatch(a.body, /"Commit"/);
  assert.match(a.body, /### En clair/);
  const t = issues.formatWorkflowIssue({ run: Object.assign({}, RUN, { conclusion: "timed_out" }), failedJobs: [], now: NOW });
  assert.match(t.body, /depasse sa duree maximale/);
});

test("shouldAlert : annulation ignoree pour les collecteurs frequents", () => {
  assert.equal(issues.shouldAlert("Update IASHARK Daily", "failure"), true);
  assert.equal(issues.shouldAlert("Update IASHARK Daily", "cancelled"), true);
  assert.equal(issues.shouldAlert("tests", "timed_out"), true);
  assert.equal(issues.shouldAlert("closing-odds", "cancelled"), false);
  assert.equal(issues.shouldAlert("closing-odds", "failure"), true);
  assert.equal(issues.shouldAlert("tests", "success"), false);
  assert.equal(issues.shouldAlert("tests", "skipped"), false);
  assert.equal(issues.workflowKey({ path: ".github/workflows/forward-odds-broad.yml" }), "workflow-forward-odds-broad");
});

test("meta cachees : aller-retour", () => {
  const body = "texte\n\n" + issues.buildMeta("site-health", { occurrences: 3, firstSeen: "2026-09-13T08:00:00Z", lastComment: "2026-09-14T02:00:00Z" });
  assert.ok(issues.hasMarker(body, "site-health"));
  assert.ok(!issues.hasMarker(body, "workflow-tests"));
  assert.deepEqual(issues.parseMeta(body), { occurrences: 3, firstSeen: "2026-09-13T08:00:00Z", lastComment: "2026-09-14T02:00:00Z" });
});

// --- Cycle de vie d'une issue (faux client GitHub) -------------------------------
function fakeGitHub() {
  const state = { issues: [], comments: [], next: 1 };
  return {
    state: state,
    async findOpenIssueByKey(key) { return state.issues.find((i) => i.state === "open" && issues.hasMarker(i.body, key)) || null; },
    async ensureLabel() {},
    async createIssue(f) { const i = { number: state.next++, state: "open", title: f.title, body: f.body, labels: f.labels, created_at: "x" }; state.issues.push(i); return i; },
    async updateIssue(n, f) { Object.assign(state.issues.find((i) => i.number === n), f); return {}; },
    async comment(n, body) { state.comments.push({ n: n, body: body }); return {}; },
  };
}

test("upsert puis resolve : une seule issue, commentaires espaces, fermeture au succes", async () => {
  const gh = fakeGitHub();
  const alert = Object.assign(issues.formatHealthIssue(REPORT, { now: NOW }), { comment: "toujours en panne" });

  assert.equal((await upsertAlertIssue(gh, alert, { now: NOW })).action, "created");
  assert.equal(gh.state.issues.length, 1);
  assert.deepEqual(gh.state.issues[0].labels, ["monitoring"]);

  const in2h = new Date(NOW.getTime() + 2 * 3600000);
  assert.equal((await upsertAlertIssue(gh, alert, { now: in2h })).action, "updated");
  assert.equal(gh.state.comments.length, 0);
  assert.equal(issues.parseMeta(gh.state.issues[0].body).occurrences, 2);

  const in7h = new Date(NOW.getTime() + 7 * 3600000);
  assert.equal((await upsertAlertIssue(gh, alert, { now: in7h })).action, "updated+commented");
  assert.equal(gh.state.comments.length, 1);
  assert.equal(gh.state.issues.length, 1);
  assert.equal(gh.state.issues[0].title, "🚨 Santé du site – 2026-09-14"); // titre du premier echec conserve

  // Une alerte d'un autre workflow ouvre sa propre issue.
  await upsertAlertIssue(gh, Object.assign(issues.formatWorkflowIssue({ run: RUN, failedJobs: JOBS, now: NOW }), { comment: "c" }), { now: NOW });
  assert.equal(gh.state.issues.length, 2);

  assert.equal((await resolveAlertIssue(gh, "site-health", "resolu")).action, "closed");
  assert.equal(gh.state.issues[0].state, "closed");
  assert.equal(gh.state.issues[1].state, "open");
  assert.equal((await resolveAlertIssue(gh, "site-health", "resolu")).action, "none");
});

test("crashedReport produit un echec critique lisible", () => {
  const r = issues.crashedReport("fichier absent", NOW);
  assert.equal(checks.summarize(r.results).status, "fail");
  assert.match(issues.formatHealthIssue(r, { now: NOW }).body, /n'a pas pu s'executer/);
});
