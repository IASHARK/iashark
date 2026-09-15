"use strict";
// scripts/health-check.js (CLI, lecture locale et reseau simule) et
// scripts/health-alert.js (issue, e-mail, webhook avec faux clients).
// AUCUN appel reseau reel.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const hc = require("../scripts/health-check.js");
const ha = require("../scripts/health-alert.js");
const issuesLib = require("../lib/health/issues.js");

const ROOT = path.join(__dirname, "..");
const SCRIPT = path.join(ROOT, "scripts", "health-check.js");
const NOW_ISO = "2026-09-14T08:30:00Z";

function pub(id, extra) {
  return Object.assign({
    id: id, home: { n: "H" + id, id: id * 10 }, away: { n: "A" + id, id: id * 10 + 1 },
    league: "Premier League", league_key: "premier", league_id: 39, date: "2026-09-14 21:00",
    model_output_available: true, has_signal: true, c1: "1.90", cn: "3.40", c2: "4.20", is_free: false,
  }, extra || {});
}

function fixtureDir(home, opts) {
  const o = opts || {};
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "iashark-health-"));
  if (home !== undefined) fs.writeFileSync(path.join(dir, "data-home.json"), typeof home === "string" ? home : JSON.stringify(home));
  if (o.data) fs.writeFileSync(path.join(dir, "data.json"), JSON.stringify(o.data));
  fs.mkdirSync(path.join(dir, "match"));
  (home && home.matchs ? home.matchs : []).forEach((m) => {
    const detail = (o.detail && o.detail[m.id]) || m;
    fs.writeFileSync(path.join(dir, "match", m.id + ".json"), JSON.stringify(detail));
  });
  fs.writeFileSync(path.join(dir, "league-coverage-report.json"), JSON.stringify({ leagues: [{ key: "premier", seasonStart: "2026-08-21", seasonEnd: "2027-05-30" }] }));
  return dir;
}

const FRESH = () => ({ generated_at: "2026-09-14T06:25:00Z", matchs: [pub(1, { is_free: true, pari_rec: "1" }), pub(2), pub(3, { date: "2026-09-15 20:00" })] });

function run(args) {
  return spawnSync(process.execPath, [SCRIPT].concat(args, ["--now", NOW_ISO]), { encoding: "utf8" });
}

// --- scripts/health-check.js en local ------------------------------------------------
test("CLI local : donnees fraiches -> code 0, resume francais, rapport JSON", () => {
  const dir = fixtureDir(FRESH());
  const out = path.join(dir, "rapport.json");
  const r = run(["--local", dir, "--out", out]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /IAShark – données publiques : TOUT VA BIEN/);
  assert.match(r.stdout, /✅ Aucun champ premium public : .*data-home\.json/);
  const report = JSON.parse(fs.readFileSync(out, "utf8"));
  assert.equal(report.mode, "local");
  assert.ok(report.results.some((x) => x.id === "fuite-match-detail" && x.status === "ok"));
});

test("CLI local : donnees vieilles -> code 1, mais --gate laisse publier", () => {
  const stale = { generated_at: "2026-09-12T06:00:00Z", matchs: [pub(1, { is_free: true, date: "2026-09-12 21:00" })] };
  const dir = fixtureDir(stale);
  const r = run(["--local", dir]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /PANNE CRITIQUE/);
  assert.match(r.stdout, /❌ Données publiques générées il y a moins de 30 h/);
  const g = run(["--local", dir, "--gate"]);
  assert.equal(g.status, 0, g.stdout);
  assert.match(g.stdout, /aucun contrôle bloquant en échec/);
});

test("CLI local : liste vide un jour de match -> --gate bloque", () => {
  const dir = fixtureDir({ generated_at: "2026-09-14T06:25:00Z", matchs: [] });
  const r = run(["--local", dir, "--gate"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /❌ Matchs publiés/);
  assert.match(r.stdout, /publication BLOQUÉE/);
});

test("CLI local : fuite premium (liste ou detail) -> code 1 meme en --gate", () => {
  const leaky = FRESH();
  leaky.matchs[1].kelly = 0.04;
  const r = run(["--local", fixtureDir(leaky), "--gate"]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /FUITE PREMIUM : 1 match\(s\) payant\(s\) exposent kelly \(ex\. match 2\)/);

  const home = FRESH();
  const dir = fixtureDir(home, { detail: { 2: Object.assign(pub(2), { verdict_shark: "texte payant" }) } });
  const d = run(["--local", dir, "--gate"]);
  assert.equal(d.status, 1);
  assert.match(d.stdout, /match\/<id>\.json : FUITE PREMIUM .*verdict_shark/);
});

test("CLI local : data-home.json illisible -> repli data.json", () => {
  const data = { matchs: FRESH().matchs, run_output: { snapshot: "2026-09-14T06:25:00Z", safe_pick: { redacted: true } } };
  const dir = fixtureDir("{pas du json", { data: data });
  const r = run(["--local", dir]);
  assert.equal(r.status, 0, r.stdout);
  assert.match(r.stdout, /repli sur .*data\.json/);
  assert.match(r.stdout, /✅ Aucun champ premium public : .*data\.json/);
});

test("CLI : option invalide -> code 2", () => {
  const r = spawnSync(process.execPath, [SCRIPT, "--data-json", "parfois"], { encoding: "utf8" });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /--data-json invalide/);
});

// --- scripts/health-check.js en reseau (fetch simule) ---------------------------------------
function fakeFetch(routes, calls) {
  return async (url) => {
    calls.push(url);
    const route = routes[url];
    if (route instanceof Error) throw route;
    if (!route) return { status: 404, text: async () => "not found" };
    return { status: route.status || 200, text: async () => (typeof route.body === "string" ? route.body : JSON.stringify(route.body)) };
  };
}

test("reseau : lit data-home.json, echantillon match/<id>.json, pas data.json", async () => {
  const calls = [];
  const home = FRESH();
  const routes = { "https://iashark.com/data-home.json": { body: home } };
  home.matchs.forEach((m) => { routes["https://iashark.com/match/" + m.id + ".json"] = { body: m }; });
  const args = hc.parseArgs(["--now", NOW_ISO]);
  const report = await hc.runHealthCheck(args, { fetchImpl: fakeFetch(routes, calls), retryDelayMs: 0 });
  assert.equal(report.mode, "réseau");
  assert.ok(!calls.includes("https://iashark.com/data.json"));
  assert.equal(calls.filter((u) => /\/match\//.test(u)).length, 3);
  assert.equal(hc.exitCodeFor(report, false), report.summary.status === "fail" ? 1 : 0);
  assert.ok(!report.results.some((x) => x.status === "fail"), JSON.stringify(report.results.filter((x) => x.status === "fail")));
});

// 16/09/2026 : data.json n'est plus publie (quota Netlify) : jamais telecharge en ligne.
test("reseau : data-home.json en 5xx (reessaye) -> echec, jamais de repli data.json ; tout en panne -> echec", async () => {
  const calls = [];
  const data = { matchs: FRESH().matchs, run_output: { snapshot: "2026-09-14T06:25:00Z" } };
  const routes = { "https://iashark.com/data-home.json": { status: 503, body: "" }, "https://iashark.com/data.json": { body: data } };
  const report = await hc.runHealthCheck(hc.parseArgs(["--now", NOW_ISO, "--details", "0", "--data-json", "always"]), { fetchImpl: fakeFetch(routes, calls), retryDelayMs: 0 });
  assert.equal(calls.filter((u) => u.endsWith("/data-home.json")).length, 2);
  assert.ok(!calls.some((u) => /\/data\.json$/.test(u)), "data.json telecharge en ligne");
  assert.equal(report.summary.status, "fail");

  const down = await hc.runHealthCheck(hc.parseArgs(["--now", NOW_ISO]), { fetchImpl: fakeFetch({ "https://iashark.com/data-home.json": new Error("ECONNRESET") }, []), retryDelayMs: 0 });
  assert.equal(down.summary.status, "fail");
  assert.match(down.results[0].detail, /ECONNRESET/);
  assert.ok(!JSON.stringify(down).includes("https://iashark.com/data.json"), "aucune URL data.json en ligne");
  assert.equal(hc.exitCodeFor(down, true), 1);
});

test("selectDetailIds : offerts d'abord puis prochains matchs payants", () => {
  const ms = [pub(5, { date: "2026-09-13 20:00" }), pub(6, { date: "2026-09-15 20:00" }), pub(7, { is_free: true }), pub(8), { id: "../x" }];
  assert.deepEqual(hc.selectDetailIds(ms, new Date(NOW_ISO), 3), ["7", "8", "6"]);
  assert.deepEqual(hc.selectDetailIds(ms, new Date(NOW_ISO), 0), []);
});

// --- scripts/health-alert.js ---------------------------------------------------------------
function fakeGitHub() {
  const state = { issues: [], comments: [], next: 1 };
  return {
    state: state,
    async findOpenIssueByKey(key) { return state.issues.find((i) => i.state === "open" && issuesLib.hasMarker(i.body, key)) || null; },
    async ensureLabel() {},
    async createIssue(f) { const i = Object.assign({ number: state.next++, state: "open", created_at: "x" }, f); state.issues.push(i); return i; },
    async updateIssue(n, f) { Object.assign(state.issues.find((i) => i.number === n), f); return {}; },
    async comment(n, body) { state.comments.push({ n: n, body: body }); return {}; },
  };
}

function reportFile(home, extraEnvNow) {
  const dir = fixtureDir(home);
  const out = path.join(dir, "rapport.json");
  const r = run(["--local", dir, "--out", out]);
  assert.ok(fs.existsSync(out), r.stderr);
  return out;
}

test("alerte : issue creee, e-mail + webhook envoyes, pas de renvoi avant 6 h, fermeture au retablissement", async () => {
  const leaky = FRESH();
  leaky.matchs[1].edge = 0.12;
  const failing = reportFile(leaky);
  const healthy = reportFile(FRESH());
  const gh = fakeGitHub();
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url: url, body: JSON.parse(init.body) }); return { status: 200, text: async () => "{}" }; };
  const env = { GITHUB_TOKEN: "ghs_x", GITHUB_REPOSITORY: "IASHARK/iashark", GITHUB_RUN_ID: "77", RESEND_API_KEY: "re_k", ALERT_EMAIL: "owner@example.com", ALERT_WEBHOOK_URL: "https://hooks.example/h" };
  const logs = [];
  const log = (s) => logs.push(s);
  const t0 = new Date(NOW_ISO);

  const o1 = await ha.runAlert({ report: failing }, { env: env, github: gh, fetchImpl: fetchImpl, now: t0, log: log });
  assert.deepEqual([o1.issue, o1.email, o1.webhook, o1.errors.length], ["created", "sent", "sent", 0]);
  assert.match(gh.state.issues[0].title, /^🚨 FUITE PREMIUM – Données publiques IAShark – 2026-09-14$/);
  assert.match(gh.state.issues[0].body, /actions\/runs\/77/);
  assert.equal(sent[0].url, "https://api.resend.com/emails");
  assert.match(sent[0].body.subject, /FUITE PREMIUM/);
  assert.equal(sent[1].url, "https://hooks.example/h");

  const o2 = await ha.runAlert({ report: failing }, { env: env, github: gh, fetchImpl: fetchImpl, now: new Date(t0.getTime() + 2 * 3600000), log: log });
  assert.deepEqual([o2.issue, o2.email, o2.webhook], ["updated", "ignored", "ignored"]);
  assert.equal(sent.length, 2);

  const o3 = await ha.runAlert({ report: healthy }, { env: env, github: gh, fetchImpl: fetchImpl, now: new Date(t0.getTime() + 10 * 3600000), log: log });
  assert.equal(o3.issue, "closed");
  assert.equal(gh.state.issues[0].state, "closed");
  assert.match(sent[2].body.subject, /Résolu/);
  assert.ok(!logs.join("\n").includes("re_k") && !logs.join("\n").includes("hooks.example/h"), "aucun secret dans les logs");
});

test("alerte : secrets absents -> canaux ignores proprement ; pipeline en echec ; rapport absent", async () => {
  const healthy = reportFile(FRESH());
  const logs = [];
  const neverFetch = async () => { throw new Error("aucun appel reseau attendu"); };
  const o = await ha.runAlert({ report: healthy }, { env: { PIPELINE_CONCLUSION: "failure", PIPELINE_RUN_URL: "https://github.com/o/r/actions/runs/5" }, fetchImpl: neverFetch, log: (s) => logs.push(s) });
  assert.equal(o.status, "fail");
  assert.deepEqual([o.issue, o.email, o.webhook, o.errors.length], [null, "ignored", "ignored", 0]);
  assert.match(logs.join("\n"), /Issue GitHub : ignorée \(GITHUB_TOKEN absent\)/);
  assert.match(logs.join("\n"), /E-mail : ignoré \(secret\(s\) absent\(s\) : RESEND_API_KEY, ALERT_EMAIL\)/);
  assert.match(logs.join("\n"), /Webhook : ignoré \(secret ALERT_WEBHOOK_URL absent\)/);

  const quiet = [];
  const ok = await ha.runAlert({ report: healthy }, { env: {}, fetchImpl: neverFetch, log: (s) => quiet.push(s) });
  assert.equal(ok.status, "ok");
  assert.match(quiet.join("\n"), /rien à envoyer/);

  const missing = await ha.runAlert({ report: path.join(os.tmpdir(), "absent-" + Date.now() + ".json") }, { env: {}, fetchImpl: neverFetch, log: () => {} });
  assert.equal(missing.status, "fail");

  const gh = fakeGitHub();
  const failed = await ha.runAlert({ report: healthy }, {
    env: { GITHUB_TOKEN: "t", RESEND_API_KEY: "re_k", ALERT_EMAIL: "a@b.fr", PIPELINE_CONCLUSION: "timed_out" },
    github: gh, fetchImpl: async () => ({ status: 500, text: async () => "boom" }), log: () => {},
  });
  assert.equal(failed.issue, "created");
  assert.match(gh.state.issues[0].body, /Pipeline quotidien/);
  assert.equal(failed.email, "error");
  assert.equal(failed.errors.length, 1);
});
