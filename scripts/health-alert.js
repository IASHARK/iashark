#!/usr/bin/env node
"use strict";
// ALERTES DU WORKFLOW health-monitor.yml, a partir du rapport de
// scripts/health-check.js.
//
//   node scripts/health-alert.js --report health-report.json [--dry-run]
//
// - Controle critique en echec : ouvre ou met a jour l'issue
//   "🚨 Données publiques IAShark – date" (GITHUB_TOKEN), puis e-mail Resend
//   et/ou webhook. Pas de nouvel e-mail/webhook tant que l'issue a deja ete
//   signalee il y a moins de 6 h.
// - Tout repasse : ferme l'issue et envoie un message "Résolu".
// - Chaque canal est ignore proprement si son secret est absent.
//
// Variables d'environnement (secrets GitHub, jamais en clair) :
//   GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_RUN_ID, GITHUB_SERVER_URL
//   RESEND_API_KEY, ALERT_EMAIL (virgules possibles), ALERT_EMAIL_FROM (optionnel)
//   ALERT_WEBHOOK_URL
//   PIPELINE_CONCLUSION, PIPELINE_RUN_URL (evenement workflow_run)

const fs = require("fs");
const alerts = require("../lib/health/alerts.js");
const checks = require("../lib/health/checks.js");
const { createGitHub, upsertAlertIssue, resolveAlertIssue } = require("../lib/health/github.js");

function parseArgs(argv) {
  const a = { report: "health-report.json", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--report") a.report = argv[++i];
    else if (argv[i] === "--dry-run") a.dryRun = true;
  }
  return a;
}

function readReport(file, now) {
  try {
    const r = JSON.parse(fs.readFileSync(file, "utf8"));
    if (!r || !Array.isArray(r.results)) throw new Error("format inattendu");
    return r;
  } catch (e) {
    return alerts.crashedReport("Rapport " + file + " absent ou illisible (" + e.message + ") : scripts/health-check.js s'est arrêté avant la fin.", now);
  }
}

function runUrlFrom(env) {
  return env.GITHUB_RUN_ID && env.GITHUB_REPOSITORY
    ? (env.GITHUB_SERVER_URL || "https://github.com") + "/" + env.GITHUB_REPOSITORY + "/actions/runs/" + env.GITHUB_RUN_ID
    : null;
}

// deps : { env, fetchImpl, github (faux client pour les tests), now, log }
async function runAlert(args, deps) {
  const d = deps || {};
  const env = d.env || process.env;
  const log = d.log || ((s) => console.log(s));
  const now = d.now || new Date();
  const fetchImpl = d.fetchImpl || fetch;

  let report = readReport(args.report, now);
  report = alerts.withPipelineFailure(report, { conclusion: env.PIPELINE_CONCLUSION, url: env.PIPELINE_RUN_URL });
  report.summary = checks.summarize(report.results);
  const runUrl = runUrlFrom(env);
  const ch = alerts.readChannels(env);
  const failing = report.summary.status === "fail";
  const outcome = { status: report.summary.status, issue: null, email: "ignored", webhook: "ignored", errors: [] };

  // 1. Issue GitHub
  if (!ch.github) {
    log("Issue GitHub : ignorée (GITHUB_TOKEN absent).");
  } else if (args.dryRun) {
    log("Issue GitHub : aperçu (--dry-run), aucune écriture.");
    if (failing) log(alerts.formatIssue(report, { runUrl: runUrl, now: now }).title);
  } else {
    const gh = d.github || createGitHub({ token: ch.github.token, repo: ch.github.repo, fetchImpl: fetchImpl });
    try {
      if (failing) {
        const issue = alerts.formatIssue(report, { runUrl: runUrl, now: now });
        issue.comment = alerts.formatIssueComment(report, { runUrl: runUrl });
        outcome.issue = (await upsertAlertIssue(gh, issue, { now: now, labels: ["monitoring"] })).action;
      } else {
        outcome.issue = (await resolveAlertIssue(gh, alerts.ALERT_KEY, alerts.formatRecovery(report, { runUrl: runUrl }))).action;
      }
      log("Issue GitHub : " + outcome.issue + ".");
    } catch (e) {
      outcome.issue = "error";
      outcome.errors.push("issue GitHub : " + alerts.scrub(e.message, [ch.github.token]));
      log("Issue GitHub : ERREUR " + alerts.scrub(e.message, [ch.github.token]));
    }
  }

  // 2. Notifications directes
  const kind = failing ? "alert" : "recovery";
  if (!alerts.shouldNotify(kind, ch.github ? outcome.issue : null)) {
    log(failing
      ? "E-mail / webhook : non renvoyés (alerte déjà signalée il y a moins de 6 h)."
      : "E-mail / webhook : rien à envoyer (aucune alerte en cours).");
    return outcome;
  }
  const message = failing ? alerts.buildAlertMessage(report, { runUrl: runUrl }) : alerts.buildRecoveryMessage(report, { runUrl: runUrl });

  if (!ch.email) {
    log("E-mail : ignoré (secret(s) absent(s) : " + ch.emailMissing.join(", ") + ").");
  } else if (args.dryRun) {
    log("E-mail : aperçu (--dry-run) vers " + ch.email.to.length + " destinataire(s) : " + message.subject);
    outcome.email = "dry-run";
  } else {
    const r = await alerts.sendResendEmail(ch.email, message, fetchImpl);
    outcome.email = r.ok ? "sent" : "error";
    if (!r.ok) outcome.errors.push("e-mail Resend : " + r.error);
    log("E-mail : " + (r.ok ? "envoyé." : "ERREUR " + r.error));
  }

  if (!ch.webhook) {
    log("Webhook : ignoré (" + (ch.webhookInvalid ? "ALERT_WEBHOOK_URL doit commencer par https://" : "secret ALERT_WEBHOOK_URL absent") + ").");
  } else if (args.dryRun) {
    log("Webhook : aperçu (--dry-run) : " + message.subject);
    outcome.webhook = "dry-run";
  } else {
    const r = await alerts.sendWebhook(ch.webhook, message, report, fetchImpl);
    outcome.webhook = r.ok ? "sent" : "error";
    if (!r.ok) outcome.errors.push("webhook : " + r.error);
    log("Webhook : " + (r.ok ? "envoyé." : "ERREUR " + r.error));
  }
  return outcome;
}

if (require.main === module) {
  runAlert(parseArgs(process.argv.slice(2))).then((outcome) => {
    process.exitCode = outcome.errors.length ? 1 : 0;
  }, (e) => {
    console.error("Erreur inattendue de scripts/health-alert.js : " + ((e && e.message) || e));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, readReport, runUrlFrom, runAlert };
