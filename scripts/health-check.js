#!/usr/bin/env node
"use strict";
// CONTROLE DES DONNEES PUBLIQUES IASHARK (workflow health-monitor.yml).
// Node pur, aucune dependance (fetch natif, Node >= 20). Controles :
// lib/health/checks.js (evaluatePublicData).
//
//   node scripts/health-check.js
//       Production : https://iashark.com/data-home.json (data.json en repli)
//       + un echantillon de match/<id>.json.
//   node scripts/health-check.js --local .
//       Fichiers locaux (data-home.json, data.json, match/<id>.json) : utilise
//       dans le pipeline avant publication, avec --gate.
//
// Options :
//   --base URL            site controle (defaut https://iashark.com)
//   --local DIR           lire les fichiers de DIR au lieu du reseau
//   --home FICHIER        data-home.json local explicite
//   --data FICHIER        data.json local explicite
//   --data-json MODE      fallback (defaut : seulement si data-home.json est
//                         illisible ; en local : lu s'il existe) | always | never
//   --details N           nombre de match/<id>.json controles (defaut 3)
//   --max-age-hours H     fraicheur maximale de generated_at (defaut 30)
//   --out FICHIER         ecrit le rapport JSON (pour scripts/health-alert.js)
//   --gate                code 1 seulement pour fichier illisible, liste vide
//                         un jour de match ou fuite premium
//   --now ISO             date de reference (tests)
//
// Sortie : resume lisible en francais sur stdout. Code 0 = ok ou
// avertissements, 1 = controle critique en echec, 2 = le script a plante.

const fs = require("fs");
const path = require("path");
const checks = require("../lib/health/checks.js");
const alerts = require("../lib/health/alerts.js");

const ROOT = path.join(__dirname, "..");
const DEFAULT_BASE = "https://iashark.com";

const USAGE = "Usage : node scripts/health-check.js [--base URL | --local DIR | --home F --data F] [--data-json fallback|always|never] [--details N] [--max-age-hours H] [--out rapport.json] [--gate] [--now ISO]";

function parseArgs(argv) {
  const a = { base: DEFAULT_BASE, local: null, home: null, data: null, dataJson: "fallback", details: 3, maxAgeHours: 30, out: null, gate: false, now: null, help: false, errors: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    if (k === "--base") a.base = next();
    else if (k === "--local") a.local = next();
    else if (k === "--home") a.home = next();
    else if (k === "--data") a.data = next();
    else if (k === "--data-json") a.dataJson = next();
    else if (k === "--details") a.details = Number(next());
    else if (k === "--max-age-hours") a.maxAgeHours = Number(next());
    else if (k === "--out") a.out = next();
    else if (k === "--gate") a.gate = true;
    else if (k === "--now") a.now = next();
    else if (k === "--help" || k === "-h") a.help = true;
    else a.errors.push("option inconnue : " + k);
  }
  if (["fallback", "always", "never"].indexOf(a.dataJson) === -1) { a.errors.push("--data-json invalide : " + a.dataJson); a.dataJson = "fallback"; }
  if (!Number.isInteger(a.details) || a.details < 0) { a.errors.push("--details invalide"); a.details = 3; }
  if (!(a.maxAgeHours > 0)) { a.errors.push("--max-age-hours invalide"); a.maxAgeHours = 30; }
  if (a.now && isNaN(new Date(a.now).getTime())) { a.errors.push("--now invalide : " + a.now); a.now = null; }
  a.base = String(a.base || DEFAULT_BASE).replace(/\/+$/, "");
  return a;
}

function readJsonFile(file) {
  try {
    return { json: JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (e) {
    return { error: e && e.code === "ENOENT" ? "fichier absent" : "JSON illisible (" + String((e && e.message) || e).slice(0, 80) + ")" };
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// GET JSON tolerant : jamais d'exception, une nouvelle tentative sur erreur
// reseau ou 5xx (evite une fausse alerte sur un rate ponctuel).
async function fetchJson(url, deps, timeoutMs) {
  const fetchImpl = (deps && deps.fetchImpl) || fetch;
  const retryDelayMs = deps && deps.retryDelayMs != null ? deps.retryDelayMs : 3000;
  let last = { error: "pas de réponse" };
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(retryDelayMs);
    try {
      const res = await fetchImpl(url, { headers: { "User-Agent": "iashark-health-monitor/1.0", "Cache-Control": "no-cache" }, signal: AbortSignal.timeout(timeoutMs || 60000) });
      if (res.status >= 500) { last = { error: "HTTP " + res.status }; continue; }
      if (res.status !== 200) return { error: "HTTP " + res.status };
      const text = await res.text();
      try { return { json: JSON.parse(text), bytes: text.length }; } catch (e) { return { error: "JSON illisible" }; }
    } catch (e) {
      last = { error: e && e.name === "TimeoutError" ? "délai dépassé" : String((e && e.message) || e) };
    }
  }
  return last;
}

// Matchs offerts d'abord (2 max), puis les prochains matchs payants.
function selectDetailIds(matches, now, n) {
  if (!Array.isArray(matches) || !n) return [];
  const today = checks.parisDay(now);
  const valid = matches.filter((m) => m && /^\d{1,12}$/.test(String(m.id)))
    .slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const free = valid.filter((m) => m.is_free === true).slice(0, Math.min(2, n));
  const paid = valid.filter((m) => m.is_free !== true);
  const upcoming = paid.filter((m) => (checks.matchDay(m) || "") >= today);
  const rest = (upcoming.length ? upcoming : paid).slice(0, n - free.length);
  return free.concat(rest).map((m) => String(m.id));
}

function loadDeepLeaksFn(root) {
  try {
    const mod = require(path.join(root, "lib/premium-fields.js"));
    return typeof mod.deepPremiumLeaks === "function" ? mod.deepPremiumLeaks : null;
  } catch (e) {
    return null;
  }
}

async function runHealthCheck(args, deps) {
  const d = deps || {};
  const root = d.root || ROOT;
  const now = args.now ? new Date(args.now) : (d.now || new Date());
  const input = { now: now, maxAgeHours: args.maxAgeHours, details: {}, detailsMissing: [] };
  const local = !!(args.local || args.home || args.data);
  let detailDir = null;

  if (local) {
    const homeFile = args.home || (args.local ? path.join(args.local, "data-home.json") : null);
    const dataFile = args.data || (args.local ? path.join(args.local, "data.json") : null);
    detailDir = args.local ? path.join(args.local, "match") : homeFile ? path.join(path.dirname(homeFile), "match") : null;
    if (homeFile) {
      const r = readJsonFile(homeFile);
      input.home = r.json; input.homeError = r.error; input.homeLabel = homeFile;
    } else {
      input.homeError = "non fourni";
    }
    // En local, data.json est lu s'il existe (fuites + safe_pick) ; son
    // absence n'est une erreur que si data-home.json est lui aussi illisible.
    const homeOk = input.home && Array.isArray(input.home.matchs);
    if (dataFile && args.dataJson !== "never") {
      const r = readJsonFile(dataFile);
      if (!(r.error === "fichier absent" && homeOk && args.dataJson !== "always")) { input.data = r.json; input.dataError = r.error; }
      input.dataLabel = dataFile;
    }
  } else {
    input.homeLabel = args.base + "/data-home.json";
    const h = await fetchJson(input.homeLabel, d, 60000);
    input.home = h.json; input.homeError = h.error;
    const homeOk = input.home && Array.isArray(input.home.matchs);
    // data.json n'est plus publie (16/09/2026, quota Netlify depasse le 15/09) :
    // jamais telecharge en ligne, quel que soit --data-json (fichiers locaux seulement).
    if (!homeOk) input.dataError = "data.json n'est plus publié";
  }

  const list = input.home && Array.isArray(input.home.matchs) ? input.home.matchs
    : input.data && Array.isArray(input.data.matchs) ? input.data.matchs : null;
  const ids = selectDetailIds(list, now, args.details);
  if (local && detailDir) {
    ids.forEach((id) => {
      const r = readJsonFile(path.join(detailDir, id + ".json"));
      if (r.json && typeof r.json === "object") input.details["match/" + id + ".json"] = r.json;
      else input.detailsMissing.push(id + " (" + r.error + ")");
    });
  } else if (!local) {
    const fetched = await Promise.all(ids.map((id) => fetchJson(args.base + "/match/" + id + ".json", d, 60000)));
    fetched.forEach((r, i) => {
      if (r.json && typeof r.json === "object") input.details["match/" + ids[i] + ".json"] = r.json;
      else input.detailsMissing.push(ids[i] + " (" + r.error + ")");
    });
  }

  input.leaguesConfig = readJsonFile(path.join(root, "config/leagues.json")).json || null;
  const localCoverage = args.local ? readJsonFile(path.join(args.local, "league-coverage-report.json")).json : null;
  input.coverage = localCoverage || readJsonFile(path.join(root, "league-coverage-report.json")).json || null;
  input.deepLeaksFn = d.deepLeaksFn !== undefined ? d.deepLeaksFn : loadDeepLeaksFn(root);

  const report = checks.evaluatePublicData(input);
  report.mode = local ? "local" : "réseau";
  report.target = local ? (args.local || args.home || args.data) : args.base;
  return report;
}

function exitCodeFor(report, gate) {
  const results = (report && report.results) || [];
  if (gate) return results.some(checks.isGateFailure) ? 1 : 0;
  return report && report.summary && report.summary.status === "fail" ? 1 : 0;
}

function appendStepSummary(text) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, "## Données publiques IAShark\n\n```\n" + text + "\n```\n"); } catch (e) { /* resume optionnel */ }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { console.log(USAGE); return 0; }
  if (args.errors.length) { console.error(args.errors.join("\n") + "\n" + USAGE); return 2; }
  let report;
  let code;
  try {
    report = await runHealthCheck(args);
    code = exitCodeFor(report, args.gate);
  } catch (e) {
    report = alerts.crashedReport("Erreur inattendue de scripts/health-check.js : " + ((e && e.message) || e));
    console.error((e && e.stack) || e);
    code = 2;
  }
  if (args.out) {
    try { fs.writeFileSync(args.out, JSON.stringify(report, null, 2)); } catch (e) { console.error("Écriture de " + args.out + " impossible : " + e.message); }
  }
  const text = alerts.formatReportText(report);
  console.log(text);
  if (args.gate) {
    console.log("\nMode --gate : " + (code ? "publication BLOQUÉE (fichier illisible, liste vide ou fuite premium)." : "aucun contrôle bloquant en échec."));
  }
  appendStepSummary(text);
  return code;
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }, (e) => {
    console.error("Erreur inattendue : " + ((e && e.stack) || e));
    process.exitCode = 2;
  });
}

module.exports = { parseArgs, readJsonFile, fetchJson, selectDetailIds, loadDeepLeaksFn, runHealthCheck, exitCodeFor };
