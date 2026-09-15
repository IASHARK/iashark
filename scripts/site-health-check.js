#!/usr/bin/env node
"use strict";
// SURVEILLANCE AUTOMATIQUE DU SITE IASHARK (guide proprietaire : MONITORING.md).
// Node pur, aucune dependance (fetch natif, Node >= 20).
//
// Trois modes :
//   node scripts/site-health-check.js [--base https://iashark.com] [--out resultats.json]
//       Controle la production. Imprime le rapport JSON sur stdout, un resume
//       lisible sur stderr, ajoute un tableau au resume du job GitHub
//       (GITHUB_STEP_SUMMARY). Code de sortie 1 si un controle CRITIQUE echoue.
//   node scripts/site-health-check.js --sync-issue resultats.json [--dry-run]
//       Ouvre / met a jour l'issue "🚨 Santé du site – <date>" si un controle
//       critique echoue, la ferme quand tout repasse. Exige GITHUB_TOKEN.
//   node scripts/site-health-check.js --workflow-run [--event event.json] [--dry-run]
//       Declenche par l'evenement workflow_run : issue d'echec d'un workflow
//       surveille (pipeline quotidien, collecteurs de cotes, tests), fermee au
//       prochain succes. Exige GITHUB_TOKEN.
//
// Secrets optionnels (controles ignores s'ils sont absents, jamais d'echec) :
//   APISPORTS_KEY          quota api-football (endpoint /status, ne consomme pas de quota)
//   SUPABASE_ACCESS_TOKEN  etat des taches pg_cron (API de gestion Supabase, lecture seule)
// La cle anon Supabase n'est JAMAIS ecrite ici : elle est lue a l'execution
// dans funnel-track.js (cle publique par conception) et refusee si son role
// n'est pas "anon".

const fs = require("fs");
const path = require("path");
const checks = require("../lib/health/checks.js");
const issues = require("../lib/health/issues.js");
const { createGitHub, upsertAlertIssue, resolveAlertIssue } = require("../lib/health/github.js");

const ROOT = path.join(__dirname, "..");
const DEFAULT_BASE = "https://iashark.com";
const API_FOOTBALL_STATUS_URL = "https://v3.football.api-sports.io/status";

// 16/09/2026 (quota Netlify « usage_exceeded » le 15/09) : echantillon reduit,
// une page par regime (FR/UE, UK, MX) + une page match et une page legale ;
// plus aucun telechargement de data.json (n'est plus publie).
const PAGES = [
  ["/fr/", "fr"], ["/gb/", "en-GB"], ["/mx/", "es-MX"],
  ["/gb/match.html", "en-GB"], ["/fr/cgv.html", "fr"],
];
const TEXT_FILES = [
  ["/sitemap.xml", /<(urlset|sitemapindex)\b/i, "ne ressemble pas a un sitemap XML"],
  ["/robots.txt", /Sitemap:/i, "ne declare pas de Sitemap:"],
];
const INTERNAL_FILES = [
  "/FINAL_360_AUDIT.md",
  "/supabase/migrations/0001_users_table.sql",
  "/supabase/functions/match-data/index.ts",
  "/scripts/build-public.js",
];
const REDIRECTS = [
  ["/match.html", 301, "/fr/match.html"],
  ["/cgv", 301, "/fr/cgv.html"],
  ["/index.html", 301, "/fr/"],
  ["/gb/blog.html", 301, "/en/blog/"],
  ["/historique.html", 301, "/fr/"],
];
const DETAIL_SAMPLE_SIZE = 3;

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const a = { base: DEFAULT_BASE, out: null, dataJson: "auto", mode: "check", file: null, event: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === "--base") a.base = argv[++i];
    else if (k === "--out") a.out = argv[++i];
    else if (k === "--data-json") a.dataJson = argv[++i];
    else if (k === "--sync-issue") { a.mode = "sync-issue"; a.file = argv[++i]; }
    else if (k === "--workflow-run") a.mode = "workflow-run";
    else if (k === "--event") a.event = argv[++i];
    else if (k === "--dry-run") a.dryRun = true;
  }
  if (["auto", "always", "never"].indexOf(a.dataJson) === -1) a.dataJson = "auto";
  a.base = String(a.base || DEFAULT_BASE).replace(/\/+$/, "");
  return a;
}

// Cle anon + URL Supabase depuis le source de funnel-track.js. Refuse toute
// cle dont le role JWT n'est pas "anon" (jamais de cle privilegiee).
function parseSupabasePublicConfig(src) {
  const url = (String(src).match(/SUPA_URL\s*=\s*["'](https:\/\/[a-z0-9]+\.supabase\.co)["']/) || [])[1];
  const key = (String(src).match(/SUPA_KEY\s*=\s*["']([A-Za-z0-9_\-.]+)["']/) || [])[1];
  if (!url || !key) return { error: "SUPA_URL ou SUPA_KEY introuvable dans funnel-track.js" };
  let role = null;
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    role = payload.role;
  } catch (e) {
    return { error: "cle Supabase illisible" };
  }
  if (role !== "anon") return { error: "la cle trouvee n'est pas une cle anon (role=" + role + ") : refus de l'utiliser" };
  return { url: url, key: key, ref: url.replace(/^https:\/\//, "").split(".")[0] };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Requete HTTP tolerante : jamais d'exception, une nouvelle tentative sur
// erreur reseau ou 5xx (evite les fausses alertes sur un raté ponctuel).
async function http(url, o) {
  const opts = o || {};
  const attempts = opts.retries != null ? opts.retries + 1 : 2;
  let last = null;
  for (let i = 0; i < attempts; i++) {
    if (i) await sleep(opts.retryDelayMs != null ? opts.retryDelayMs : 3000);
    try {
      const res = await fetch(url, {
        method: opts.method || "GET",
        headers: Object.assign({ "User-Agent": "iashark-site-health/1.0" }, opts.headers || {}),
        body: opts.body,
        redirect: opts.redirect || "follow",
        signal: AbortSignal.timeout(opts.timeoutMs || 45000),
      });
      const body = await res.text();
      let json = null;
      if (opts.json !== false) { try { json = JSON.parse(body); } catch (e) { json = null; } }
      last = { status: res.status, body: opts.keepBody === false ? "" : body, json: json, location: res.headers.get("location"), bytes: body.length };
      if (res.status < 500) return last;
    } catch (e) {
      last = { error: (e && (e.name === "TimeoutError" ? "delai depasse" : e.message)) || String(e) };
    }
  }
  return last;
}

const R = checks.result;

async function runChecks(args) {
  const base = args.base;
  const now = args.now || new Date();
  const results = [];
  const notes = [];
  const premium = checks.loadPremiumFields(ROOT);
  notes.push("Champs premium surveilles : " + premium.fields.length + " (sources : " + premium.sources.join(" + ") + ").");

  // --- Donnees publiques ------------------------------------------------------
  const homeRes = await http(base + "/data-home.json", { timeoutMs: 60000 });
  const home = homeRes && homeRes.status === 200 && homeRes.json && Array.isArray(homeRes.json.matchs) ? homeRes.json : null;
  if (home) {
    results.push(R("source-data-home", "deploiement", "Fichier data-home.json publie", "ok", home.matchs.length + " match(s), genere le " + (home.generated_at || "?")));
  } else {
    results.push(R("source-data-home", "deploiement", "Fichier data-home.json publie", "warn",
      "HTTP " + ((homeRes && (homeRes.status || homeRes.error)) || "?") + " : la liste des matchs n'est pas en ligne",
      "Verifier le dernier deploiement Netlify et que data-home.json est copie dans dist/ par scripts/build-public.js."));
  }
  // data.json n'est plus publie (16/09/2026) : --data-json est accepte pour
  // compatibilite mais ignore. run_output (safe_pick) est controle sur les
  // fichiers du depot par tests/premium-leak-real-files.test.js.
  const data = null;
  notes.push("data.json n'est plus publie : liste data-home.json + echantillon de " + DETAIL_SAMPLE_SIZE + " match/<id>.json.");
  const matches = home ? home.matchs : data ? data.matchs : null;

  results.push(checks.checkUpcomingMatches(matches, now));

  // --- GitHub : dernier Daily update + retard de deploiement --------------------
  const gh = createGitHub({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY || "IASHARK/iashark" });
  let commit = null;
  try {
    commit = await gh.latestCommitMatching("main", /^Daily update/);
    results.push(checks.checkDailyCommitAge(commit && commit.date, now, 30));
  } catch (e) {
    results.push(R("fraicheur-commit", "fraicheur", "Dernier commit \"Daily update\" sur main de moins de 30 h", "skip", "API GitHub indisponible : " + e.message));
  }
  const ro = data && data.run_output;
  const generatedAt = (home && home.generated_at) ||
    (ro && typeof ro.snapshot === "string" ? ro.snapshot : null) ||
    (ro && ro.safe_pick && ro.safe_pick.generated_at) || null;
  results.push(checks.checkDeployLag(commit && commit.date, generatedAt, now));

  // --- Contenu -----------------------------------------------------------------
  results.push(checks.checkFreeMatch(matches));
  results.push(checks.checkOdds(matches));
  if (home) results.push(checks.checkPremiumLeaks("fuite-data-home", "data-home.json", home.matchs, premium));
  if (data) results.push(checks.checkPremiumLeaks("fuite-data-json", "data.json", data.matchs, premium));
  results.push(data ? checks.checkSafePick(data.run_output, data.matchs)
    : R("fuite-safe-pick", "fuite", "run_output (safe_pick, combines, buteurs) masque hors match offert", "skip", "data.json n'est plus publie : controle sur le depot (tests/premium-leak-real-files.test.js)"));

  // Echantillon match/<id>.json : matchs offerts + prochains matchs payants.
  let details = [];
  if (Array.isArray(matches) && matches.length) {
    const today = checks.parisDay(now);
    const sorted = matches.filter((m) => m && m.id != null && /^\d{1,12}$/.test(String(m.id)))
      .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const free = sorted.filter((m) => m.is_free === true).slice(0, 2);
    const paid = sorted.filter((m) => m.is_free !== true && (checks.matchDay(m) || "") >= today).slice(0, DETAIL_SAMPLE_SIZE - free.length);
    const sample = free.concat(paid.length ? paid : sorted.filter((m) => m.is_free !== true).slice(0, DETAIL_SAMPLE_SIZE - free.length));
    const fetched = await Promise.all(sample.map((m) => http(base + "/match/" + m.id + ".json", { timeoutMs: 60000 })));
    const missing = [];
    fetched.forEach((res, i) => {
      if (res && res.status === 200 && res.json && typeof res.json === "object") details.push(res.json);
      else missing.push(sample[i].id + " (" + ((res && (res.status || res.error)) || "?") + ")");
    });
    if (!details.length) {
      results.push(R("source-match-detail", "deploiement", "Fichiers match/<id>.json publies", "warn",
        "aucun des " + sample.length + " fichiers testes n'est en ligne (" + missing.slice(0, 3).join(", ") + ") : fichiers decoupes pas encore deployes",
        "Normal avant le premier Daily update avec lib/public-data-split.js. Si data-home.json est en ligne mais pas match/<id>.json, verifier scripts/build-public.js."));
    } else {
      results.push(R("source-match-detail", "deploiement", "Fichiers match/<id>.json publies", missing.length ? "warn" : "ok",
        details.length + "/" + sample.length + " fichier(s) en ligne" + (missing.length ? ", manquants : " + missing.join(", ") : ""),
        missing.length ? "Un match liste dans data-home.json n'a pas de fichier detail : la page match sera vide pour lui. Verifier le log du pipeline (generateMatchPages)." : undefined));
      results.push(checks.checkPremiumLeaks("fuite-match-detail", "echantillon match/<id>.json", details, premium));
    }
  }
  const textSource = data ? { list: data.matchs, label: "data.json" } : details.length ? { list: details, label: "echantillon match/<id>.json" } : null;
  const textsArePremium = premium.fields.indexOf("analyse_card") !== -1 || premium.fields.indexOf("contexte") !== -1;
  results.push(checks.checkLlmTexts(textSource && textSource.list, textSource && textSource.label, { freeOnly: textsArePremium }));
  results.push(checks.checkPinnacle(textSource && textSource.list));

  // --- Pages, fichiers internes, redirections ------------------------------------
  const pageRes = await Promise.all(PAGES.map((p) => http(base + p[0])));
  PAGES.forEach((p, i) => results.push(checks.checkPage(p[0], pageRes[i], p[1])));
  const textRes = await Promise.all(TEXT_FILES.map((t) => http(base + t[0])));
  TEXT_FILES.forEach((t, i) => {
    const r = checks.checkPage(t[0], textRes[i], null);
    if (r.status === "ok" && !t[1].test(textRes[i].body || "")) {
      r.status = "fail";
      r.detail = "200 mais le contenu " + t[2];
      r.fix = "Regenerer le fichier (node scripts/i18n-sitemaps.js) et redeployer.";
    }
    results.push(r);
  });
  const internalRes = await Promise.all(INTERNAL_FILES.map((f) => http(base + f, { redirect: "manual" })));
  INTERNAL_FILES.forEach((f, i) => results.push(checks.checkNotPublic(f, internalRes[i])));
  const redirRes = await Promise.all(REDIRECTS.map((r) => http(base + r[0], { redirect: "manual" })));
  REDIRECTS.forEach((r, i) => results.push(checks.checkRedirect(r[0], redirRes[i], r[1], r[2])));

  // --- Fonctions Edge Supabase -----------------------------------------------------
  let supa;
  try { supa = parseSupabasePublicConfig(fs.readFileSync(path.join(ROOT, "funnel-track.js"), "utf8")); } catch (e) { supa = { error: "funnel-track.js illisible : " + e.message }; }
  if (supa.error) {
    results.push(R("edge:config", "supabase", "Configuration Supabase publique", "warn", supa.error, "Les controles des fonctions Edge n'ont pas pu tourner : verifier SUPA_URL / SUPA_KEY dans funnel-track.js."));
  } else {
    const headers = { apikey: supa.key, Authorization: "Bearer " + supa.key, "Content-Type": "application/json" };
    const fn = (name) => supa.url + "/functions/v1/" + name;
    const [md, co, lg] = await Promise.all([
      http(fn("match-data"), { method: "POST", headers: headers, body: JSON.stringify({ scope: "list" }), timeoutMs: 180000, keepBody: false }),
      // Corps sans marche ni consentement : flux FR historique, qui doit
      // s'arreter sur consent_required (ou processed:false si paiement coupe).
      http(fn("create-checkout-session"), { method: "POST", headers: headers, body: JSON.stringify({}), timeoutMs: 60000 }),
      http(fn("login-guard"), { method: "POST", headers: headers, body: "{ceci n'est pas du json", timeoutMs: 60000 }),
    ]);
    results.push(checks.checkMatchDataFunction(md, premium));
    results.push(checks.checkCheckoutFunction(co));
    results.push(checks.checkLoginGuardFunction(lg));

    // pg_cron via l'API de gestion Supabase (optionnel).
    if (process.env.SUPABASE_ACCESS_TOKEN) {
      const sql = "select j.jobname, j.active, d.status, d.start_time, left(d.return_message, 300) as return_message " +
        "from cron.job j left join lateral (select status, to_char(start_time at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') as start_time, return_message " +
        "from cron.job_run_details r where r.jobid = j.jobid order by r.start_time desc limit 1) d on true";
      const cr = await http("https://api.supabase.com/v1/projects/" + supa.ref + "/database/query", {
        method: "POST",
        headers: { Authorization: "Bearer " + process.env.SUPABASE_ACCESS_TOKEN, "Content-Type": "application/json" },
        body: JSON.stringify({ query: sql }),
        timeoutMs: 60000,
      });
      if (cr && (cr.status === 200 || cr.status === 201) && Array.isArray(cr.json)) {
        checks.checkCronJobs(cr.json, now).forEach((r) => results.push(r));
      } else {
        results.push(R("pg-cron", "supabase", "Taches pg_cron Supabase", "warn", "lecture impossible : HTTP " + ((cr && (cr.status || cr.error)) || "?"),
          "Verifier le secret SUPABASE_ACCESS_TOKEN (jeton personnel Supabase, non expire)."));
      }
    } else {
      checks.checkCronJobs(null, now).forEach((r) => results.push(r));
    }
  }

  // --- api-football (optionnel) ---------------------------------------------------
  let apiRes = null;
  if (process.env.APISPORTS_KEY) {
    apiRes = await http(API_FOOTBALL_STATUS_URL, { headers: { "x-apisports-key": process.env.APISPORTS_KEY }, timeoutMs: 30000 });
  }
  results.push(checks.checkApiFootballStatus(apiRes));

  const summary = checks.summarize(results);
  return { generated_at: now.toISOString(), base_url: base, summary: summary, notes: notes, results: results };
}

function printHuman(report) {
  const icon = { ok: "OK  ", warn: "WARN", fail: "FAIL", skip: "SKIP" };
  report.results.forEach((r) => process.stderr.write("[" + icon[r.status] + "] " + r.title + " - " + r.detail + "\n"));
  (report.notes || []).forEach((n) => process.stderr.write("note: " + n + "\n"));
  const c = report.summary.counts;
  process.stderr.write("\nBilan : " + report.summary.status.toUpperCase() + " (ok " + c.ok + ", warn " + c.warn + ", fail " + c.fail + ", skip " + c.skip + ")\n");
}

function appendStepSummary(markdown) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + "\n"); } catch (e) { /* resume optionnel */ }
}

function runUrl() {
  const e = process.env;
  return e.GITHUB_RUN_ID ? (e.GITHUB_SERVER_URL || "https://github.com") + "/" + e.GITHUB_REPOSITORY + "/actions/runs/" + e.GITHUB_RUN_ID : null;
}

function githubClientOrExit(dryRun) {
  if (dryRun) return null;
  if (!process.env.GITHUB_TOKEN) {
    process.stderr.write("GITHUB_TOKEN absent : impossible de gerer les issues (utiliser --dry-run pour un apercu).\n");
    process.exit(2);
  }
  return createGitHub({ token: process.env.GITHUB_TOKEN, repo: process.env.GITHUB_REPOSITORY || "IASHARK/iashark" });
}

async function syncHealthIssue(args) {
  let report;
  try {
    report = JSON.parse(fs.readFileSync(args.file, "utf8"));
    if (!report || !Array.isArray(report.results)) throw new Error("format inattendu");
  } catch (e) {
    report = issues.crashedReport("Fichier de resultats " + args.file + " absent ou illisible (" + e.message + ") : le script de controle s'est arrete avant la fin.");
  }
  report.summary = checks.summarize(report.results);
  const url = runUrl();
  const gh = githubClientOrExit(args.dryRun);
  if (report.summary.status === "fail") {
    const alert = issues.formatHealthIssue(report, { runUrl: url });
    alert.comment = issues.formatHealthComment(report, { runUrl: url });
    if (args.dryRun) { console.log(alert.title + "\n\n" + alert.body); return; }
    const r = await upsertAlertIssue(gh, alert, { labels: ["monitoring"] });
    console.log("Issue sante du site : " + r.action + (r.number ? " #" + r.number : ""));
  } else {
    if (args.dryRun) { console.log("Aucun controle critique en echec : l'issue ouverte serait fermee."); return; }
    const r = await resolveAlertIssue(gh, issues.HEALTH_KEY, issues.formatHealthRecovery(report, { runUrl: url }));
    console.log("Issue sante du site : " + r.action + (r.number ? " #" + r.number : ""));
  }
}

async function handleWorkflowRun(args) {
  const eventPath = args.event || process.env.GITHUB_EVENT_PATH;
  const event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  const run = event && event.workflow_run;
  if (!run) { console.log("Pas d'evenement workflow_run : rien a faire."); return; }
  if (run.event === "pull_request" || (run.head_branch && run.head_branch !== "main")) {
    console.log("Run hors de main (" + run.event + " / " + run.head_branch + ") : ignore.");
    return;
  }
  const gh = githubClientOrExit(args.dryRun);
  if (issues.shouldAlert(run.name, run.conclusion)) {
    let failedJobs = [];
    if (gh) {
      try {
        failedJobs = (await gh.runJobs(run.id)).filter((j) => issues.ALERT_CONCLUSIONS.indexOf(j.conclusion) !== -1);
      } catch (e) {
        process.stderr.write("Lecture des jobs impossible : " + e.message + "\n");
      }
    }
    const alert = issues.formatWorkflowIssue({ run: run, failedJobs: failedJobs });
    alert.comment = issues.formatWorkflowComment({ run: run, failedJobs: failedJobs });
    if (args.dryRun) { console.log(alert.title + "\n\n" + alert.body); return; }
    const r = await upsertAlertIssue(gh, alert, { labels: ["monitoring"] });
    console.log(run.name + " (" + run.conclusion + ") : issue " + r.action + (r.number ? " #" + r.number : ""));
    appendStepSummary("## Alerte : " + alert.title + "\n\n" + alert.body);
  } else if (issues.isRecovery(run.conclusion)) {
    if (args.dryRun) { console.log("Succes : l'issue ouverte de " + run.name + " serait fermee."); return; }
    const r = await resolveAlertIssue(gh, issues.workflowKey(run), issues.formatWorkflowRecovery(run));
    console.log(run.name + " reussi : issue " + r.action + (r.number ? " #" + r.number : ""));
  } else {
    console.log(run.name + " (" + run.conclusion + ") : pas d'alerte.");
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "sync-issue") return syncHealthIssue(args);
  if (args.mode === "workflow-run") return handleWorkflowRun(args);
  const report = await runChecks(args);
  const json = JSON.stringify(report, null, 2);
  if (args.out) fs.writeFileSync(args.out, json);
  console.log(json);
  printHuman(report);
  appendStepSummary(issues.formatStepSummary(report));
  process.exitCode = report.summary.status === "fail" ? 1 : 0;
}

if (require.main === module) {
  main().catch((e) => {
    process.stderr.write("Erreur inattendue du controle de sante : " + ((e && e.stack) || e) + "\n");
    process.exit(1);
  });
}

module.exports = { parseArgs, parseSupabasePublicConfig, runChecks, PAGES, INTERNAL_FILES, REDIRECTS };
