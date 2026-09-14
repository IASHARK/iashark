"use strict";
// ALERTES DU WORKFLOW .github/workflows/health-monitor.yml.
//
// Textes (resume francais, issue GitHub, e-mail) : fonctions PURES.
// Envois (Resend, webhook) : fetch injectable, jamais d'exception, et aucun
// secret dans les messages d'erreur (scrub). Chaque canal est ignore
// proprement si son secret est absent :
//   GITHUB_TOKEN                  issue "🚨 Données publiques IAShark – date"
//   RESEND_API_KEY + ALERT_EMAIL  e-mail via https://api.resend.com/emails
//   ALERT_WEBHOOK_URL             POST JSON (Slack : "text", Discord : "content")
//   ALERT_EMAIL_FROM (optionnel)  expediteur, domaine verifie chez Resend

const { parisDay, summarize } = require("./checks.js");

const ALERT_KEY = "donnees-publiques";
const RESEND_API_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "IASHARK Surveillance <alertes@iashark.com>";
const STATUS_LABEL = { fail: "PANNE CRITIQUE", warn: "À SURVEILLER", ok: "TOUT VA BIEN" };
const ICON = { ok: "✅", warn: "⚠️", fail: "❌", skip: "⏭️" };
const ORDER = { fail: 0, warn: 1, ok: 2, skip: 3 };
const PIPELINE_OK = ["success", "skipped", "neutral", ""];

function hasLeak(report) {
  return ((report && report.results) || []).some((r) => r.status === "fail" && r.critical === true);
}

function failures(report) {
  return ((report && report.results) || []).filter((r) => r.status === "fail");
}

function countsLine(summary) {
  const c = (summary && summary.counts) || {};
  return (c.ok || 0) + " OK, " + (c.warn || 0) + " avertissement(s), " + (c.fail || 0) + " échec(s), " + (c.skip || 0) + " non exécuté(s)";
}

// Run "Update IASHARK Daily" en echec (evenement workflow_run) : ajoute un
// echec critique en tete du rapport.
function withPipelineFailure(report, run) {
  const conclusion = String((run && run.conclusion) || "").trim();
  if (PIPELINE_OK.indexOf(conclusion) !== -1) return report;
  const results = [{
    id: "pipeline-quotidien",
    group: "pipeline",
    title: "Pipeline quotidien \"Update IASHARK Daily\"",
    status: "fail",
    detail: "dernier run terminé en « " + conclusion + " »" + (run.url ? " : " + run.url : ""),
    fix: "Ouvrir le run et cliquer sur l'étape en rouge. Quota / 429 api-football : attendre minuit UTC puis relancer. Anthropic / 401 : vérifier ANTHROPIC_KEY et le crédit. Échec au git push : relancer. Contrôle santé des fichiers publics en échec : lire le constat (fuite premium ou liste vide) avant de relancer.",
  }].concat((report && report.results) || []);
  return Object.assign({}, report, { results: results, summary: summarize(results) });
}

// Rapport de secours quand scripts/health-check.js n'a rien produit.
function crashedReport(message, now) {
  const results = [{
    id: "execution", group: "execution", title: "Le contrôle des données publiques n'a pas pu s'exécuter", status: "fail",
    detail: String(message || "erreur inconnue"),
    fix: "Ouvrir le run du workflow health-monitor et lire l'erreur de scripts/health-check.js.",
  }];
  return { generated_at: (now || new Date()).toISOString(), source: null, summary: summarize(results), results: results };
}

function sorted(results) {
  return (results || []).slice().sort((a, b) => (ORDER[a.status] != null ? ORDER[a.status] : 9) - (ORDER[b.status] != null ? ORDER[b.status] : 9));
}

// Resume lisible (terminal, e-mail, webhook).
function formatReportText(report, opts) {
  const o = opts || {};
  const s = (report && report.summary) || summarize((report && report.results) || []);
  const lines = [];
  lines.push("IAShark – données publiques : " + (STATUS_LABEL[s.status] || s.status));
  lines.push("Contrôle du " + ((report && report.generated_at) || "?") + (report && report.source ? " – source : " + report.source : ""));
  if (report && report.data_generated_at) lines.push("Données générées le " + report.data_generated_at);
  lines.push("Bilan : " + countsLine(s));
  if (hasLeak(report)) lines.push("", "‼️ FUITE DE CHAMPS PREMIUM : priorité absolue, des données payantes sont lisibles gratuitement.");
  lines.push("");
  sorted(report && report.results).forEach((r) => {
    lines.push((ICON[r.status] || r.status) + " " + r.title + " : " + (r.detail || ""));
    if (r.fix && (r.status === "fail" || r.status === "warn")) lines.push("   → Que faire : " + r.fix);
  });
  if (o.runUrl) lines.push("", "Run : " + o.runUrl);
  return lines.join("\n");
}

function formatIssue(report, opts) {
  const o = opts || {};
  const date = o.date || parisDay(o.now || new Date());
  const leak = hasLeak(report);
  const title = "🚨 " + (leak ? "FUITE PREMIUM – " : "") + "Données publiques IAShark – " + date;
  const fails = failures(report);
  const warns = ((report && report.results) || []).filter((r) => r.status === "warn");
  const lines = [];
  lines.push(fails.length + " contrôle(s) critique(s) en échec (contrôle du " + ((report && report.generated_at) || "?") + (report && report.source ? ", source `" + report.source + "`" : "") + ").");
  if (leak) lines.push("", "> **‼️ Fuite de champs premium : priorité absolue.**");
  if (o.runUrl) lines.push("", "Run du contrôle : " + o.runUrl);
  lines.push("");
  fails.forEach((r) => {
    lines.push("### ❌ " + r.title);
    lines.push("- Constat : " + r.detail);
    if (r.leak_paths && r.leak_paths.length) lines.push("- Exemples de chemins : `" + r.leak_paths.slice(0, 5).join("`, `") + "`");
    if (r.fix) lines.push("- **Que faire :** " + r.fix);
    lines.push("");
  });
  if (warns.length) {
    lines.push("### Avertissements");
    warns.forEach((r) => lines.push("- ⚠️ " + r.title + " : " + r.detail));
    lines.push("");
  }
  lines.push("_Issue ouverte par .github/workflows/health-monitor.yml. Elle se ferme automatiquement quand tous les contrôles critiques repassent._");
  return { key: ALERT_KEY, title: title, body: lines.join("\n") };
}

function formatIssueComment(report, opts) {
  return "Toujours en échec (" + ((report && report.generated_at) || "?") + ") : " +
    failures(report).map((r) => r.title).join(" ; ") + (opts && opts.runUrl ? "\n\nRun : " + opts.runUrl : "");
}

function formatRecovery(report, opts) {
  return "✅ Résolu automatiquement : tous les contrôles critiques des données publiques passent (" + ((report && report.generated_at) || "?") + ")." +
    (opts && opts.runUrl ? "\n\nRun : " + opts.runUrl : "");
}

function buildAlertMessage(report, opts) {
  const names = failures(report).map((r) => r.title).join(" ; ");
  const prefix = hasLeak(report) ? "[IAShark] FUITE PREMIUM – " : "[IAShark] Alerte données publiques – ";
  const subject = (prefix + names).slice(0, 180);
  return { subject: subject, text: formatReportText(report, opts) };
}

function buildRecoveryMessage(report, opts) {
  return { subject: "[IAShark] Résolu – données publiques OK", text: formatRecovery(report, opts) + "\n\n" + formatReportText(report, opts) };
}

// alerte : notifier sauf si l'issue a seulement ete mise a jour (deja
// signalee il y a moins de 6 h, voir upsertAlertIssue). Sans GitHub
// (issueAction null) ou erreur GitHub : notifier.
// retablissement : notifier seulement si une issue ouverte vient d'etre fermee.
function shouldNotify(kind, issueAction) {
  if (kind === "recovery") return issueAction === "closed";
  return issueAction !== "updated";
}

function envValue(env, name) {
  const v = env && env[name];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function readChannels(env) {
  const token = envValue(env, "GITHUB_TOKEN");
  const apiKey = envValue(env, "RESEND_API_KEY");
  const toRaw = envValue(env, "ALERT_EMAIL");
  const to = toRaw ? toRaw.split(/[,;\s]+/).filter(Boolean) : [];
  const hook = envValue(env, "ALERT_WEBHOOK_URL");
  const emailMissing = [];
  if (!apiKey) emailMissing.push("RESEND_API_KEY");
  if (!to.length) emailMissing.push("ALERT_EMAIL");
  return {
    github: token ? { token: token, repo: envValue(env, "GITHUB_REPOSITORY") || "IASHARK/iashark" } : null,
    email: emailMissing.length ? null : { apiKey: apiKey, to: to, from: envValue(env, "ALERT_EMAIL_FROM") || DEFAULT_FROM },
    emailMissing: emailMissing,
    webhook: hook && /^https:\/\//i.test(hook) ? { url: hook } : null,
    webhookInvalid: !!hook && !/^https:\/\//i.test(hook),
  };
}

// Retire toute valeur secrete d'un texte (messages d'erreur, logs).
function scrub(text, secrets) {
  let s = String(text == null ? "" : text);
  (secrets || []).filter((x) => typeof x === "string" && x.length >= 4).forEach((x) => { s = s.split(x).join("***"); });
  return s;
}

async function postJson(fetchImpl, url, headers, payload, secrets) {
  try {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: Object.assign({ "Content-Type": "application/json", "User-Agent": "iashark-health-monitor/1.0" }, headers || {}),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status };
    let body = "";
    try { body = await res.text(); } catch (e) { body = ""; }
    return { ok: false, status: res.status, error: scrub("HTTP " + res.status + " " + body.slice(0, 200), secrets) };
  } catch (e) {
    return { ok: false, error: scrub((e && e.message) || String(e), secrets) };
  }
}

function sendResendEmail(cfg, message, fetchImpl) {
  return postJson(fetchImpl || fetch, RESEND_API_URL, { Authorization: "Bearer " + cfg.apiKey },
    { from: cfg.from, to: cfg.to, subject: message.subject, text: message.text }, [cfg.apiKey]);
}

function sendWebhook(cfg, message, report, fetchImpl) {
  const text = message.subject + "\n\n" + message.text;
  const s = (report && report.summary) || {};
  return postJson(fetchImpl || fetch, cfg.url, {}, {
    text: text.slice(0, 3500),
    content: text.slice(0, 1900),
    username: "IAShark Surveillance",
    status: s.status || null,
    counts: s.counts || null,
    failures: failures(report).map((r) => ({ id: r.id, title: r.title, detail: r.detail, critical: r.critical === true })),
  }, [cfg.url]);
}

module.exports = {
  ALERT_KEY,
  RESEND_API_URL,
  DEFAULT_FROM,
  hasLeak,
  withPipelineFailure,
  crashedReport,
  formatReportText,
  formatIssue,
  formatIssueComment,
  formatRecovery,
  buildAlertMessage,
  buildRecoveryMessage,
  shouldNotify,
  readChannels,
  scrub,
  sendResendEmail,
  sendWebhook,
};
