"use strict";
// Textes des issues GitHub d'alerte (MONITORING.md) - fonctions PURES.
// Une issue d'alerte porte un marqueur invisible <!-- iashark-monitor:CLE -->
// qui permet de la retrouver (mise a jour, fermeture) sans dependre des
// labels ni de l'index de recherche GitHub (qui a du retard).

const { parisDay } = require("./checks.js");

const MARKER_PREFIX = "iashark-monitor:";
const HEALTH_KEY = "site-health";

function marker(key) {
  return "<!-- " + MARKER_PREFIX + key + " -->";
}
function hasMarker(body, key) {
  return String(body || "").indexOf(marker(key)) !== -1;
}

// Meta cachees en fin de corps : nombre d'occurrences, dernier commentaire.
function buildMeta(key, meta) {
  return [
    marker(key),
    "<!-- occurrences:" + (meta.occurrences || 1) + " -->",
    "<!-- first-seen:" + (meta.firstSeen || "") + " -->",
    "<!-- last-comment:" + (meta.lastComment || "") + " -->",
  ].join("\n");
}
function parseMeta(body) {
  const s = String(body || "");
  const get = (name) => { const m = s.match(new RegExp("<!-- " + name + ":([^>]*?) -->")); return m ? m[1].trim() : ""; };
  return {
    occurrences: parseInt(get("occurrences"), 10) || 0,
    firstSeen: get("first-seen"),
    lastComment: get("last-comment"),
  };
}

// --- Workflows GitHub Actions ------------------------------------------------
const WORKFLOW_INFO = {
  "Update IASHARK Daily": {
    label: "Pipeline quotidien",
    frequent: false,
    explain: "Le pipeline quotidien calcule les matchs, les pronostics, les textes IA et publie data.json, data-home.json, match/*.json, les pages match et les sitemaps. Tant qu'il est en echec, le site affiche les donnees de la veille puis plus aucun match du jour.",
    todo: [
      "Ouvrir le lien du run ci-dessous et cliquer sur l'etape en rouge pour lire l'erreur.",
      "Erreur de quota ou 429 api-football : attendre minuit UTC (remise a zero du quota) puis relancer.",
      "Erreur Anthropic / ANTHROPIC_KEY : verifier le secret et le credit Anthropic.",
      "Erreur au moment du \"git push\" : un autre commit est arrive pendant le run ; relancer simplement.",
      "Delai depasse : le run est trop long (trop de ligues ou API lente) ; relancer, et si cela se repete, reduire le perimetre.",
      "Relancer : Actions -> Update IASHARK Daily -> Run workflow.",
    ],
  },
  "closing-odds": {
    label: "Capture des cotes de cloture",
    frequent: true,
    explain: "Ce job (toutes les 30 min) enregistre les cotes juste avant le coup d'envoi. En echec, la mesure de la valeur des pronostics (CLV) a des trous, mais le site public continue de fonctionner.",
    todo: [
      "Lire l'etape en rouge du run.",
      "Erreur Supabase (401/403) : verifier les secrets SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.",
      "Erreur api-football (429, quota) : attendre la remise a zero du quota.",
      "Si un seul run echoue puis le suivant reussit, l'issue se ferme toute seule.",
    ],
  },
  "forward-odds-broad": {
    label: "Collecte des cotes (72 h)",
    frequent: true,
    explain: "Ce job (toutes les 6 h) collecte les cotes des matchs des 3 prochains jours dans Supabase. En echec, l'historique des cotes a des trous ; le site public n'est pas directement touche.",
    todo: [
      "Lire l'etape en rouge du run.",
      "Erreur de quota api-football : attendre minuit UTC.",
      "Erreur Supabase : verifier SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.",
    ],
  },
  "forward-odds-near-kickoff": {
    label: "Collecte des cotes avant match",
    frequent: true,
    explain: "Ce job (toutes les heures) collecte les cotes des matchs qui commencent dans les 6 heures. En echec, l'historique des cotes proches du coup d'envoi a des trous ; le site public n'est pas directement touche.",
    todo: [
      "Lire l'etape en rouge du run.",
      "Erreur de quota api-football : attendre minuit UTC.",
      "Erreur Supabase : verifier SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY.",
    ],
  },
  "tests": {
    label: "Tests automatiques",
    frequent: false,
    explain: "Les tests automatiques ont echoue sur main : le dernier changement de code a probablement casse quelque chose (fuite de donnees premium, page, calcul). Le site peut deja etre deploye avec ce defaut.",
    todo: [
      "Ouvrir le run et lire le nom du test en echec.",
      "Identifier le dernier commit sur main et demander sa correction (ou l'annuler).",
      "Ne pas ignorer : ces tests protegent notamment contre les fuites de donnees payantes.",
    ],
  },
};

function workflowKey(run) {
  const p = String((run && run.path) || (run && run.name) || "workflow");
  const base = p.split("/").pop().replace(/\.ya?ml$/, "");
  return "workflow-" + base.toLowerCase().replace(/[^a-z0-9-]+/g, "-");
}

const ALERT_CONCLUSIONS = ["failure", "timed_out", "cancelled", "startup_failure"];

// Faut-il alerter ? Les collecteurs frequents partagent un groupe de
// concurrence : GitHub annule un run en attente quand un plus recent arrive.
// Une annulation n'y est donc PAS une panne (pas d'issue).
function shouldAlert(workflowName, conclusion) {
  if (ALERT_CONCLUSIONS.indexOf(conclusion) === -1) return false;
  const info = WORKFLOW_INFO[workflowName];
  if (conclusion === "cancelled" && info && info.frequent) return false;
  return true;
}
function isRecovery(conclusion) {
  return conclusion === "success";
}

function conclusionText(conclusion) {
  switch (conclusion) {
    case "timed_out": return "a depasse sa duree maximale et a ete arrete";
    case "cancelled": return "a ete annule avant la fin (annulation manuelle ou arret par GitHub)";
    case "startup_failure": return "n'a pas pu demarrer (fichier de workflow invalide ou runner indisponible)";
    default: return "a echoue";
  }
}

// failedJobs : [{ name, conclusion, html_url, steps: [{ name, conclusion }] }]
function formatWorkflowIssue(opts) {
  const run = opts.run || {};
  const name = run.name || "workflow";
  const info = WORKFLOW_INFO[name] || { label: "Workflow " + name, explain: "Ce workflow GitHub Actions a echoue.", todo: ["Ouvrir le run et lire l'etape en rouge."] };
  const date = opts.date || parisDay(opts.now || new Date());
  const title = "🚨 " + info.label + " en échec – " + date;
  const jobs = (opts.failedJobs || []);
  const lines = [];
  lines.push("**" + info.label + "** (`" + name + "`) " + conclusionText(run.conclusion) + ".");
  lines.push("");
  lines.push("- Run : " + (run.html_url || "(lien indisponible)"));
  lines.push("- Declencheur : `" + (run.event || "?") + "` sur `" + (run.head_branch || "?") + "`, commit `" + String(run.head_sha || "").slice(0, 7) + "`");
  lines.push("- Resultat : `" + (run.conclusion || "?") + "` le " + (run.updated_at || run.run_started_at || "?"));
  lines.push("");
  lines.push("### Ce qui a echoue");
  if (!jobs.length) {
    lines.push("Aucun job en echec lisible via l'API (voir le lien du run).");
  } else {
    jobs.forEach((j) => {
      const steps = (j.steps || []).filter((s) => ALERT_CONCLUSIONS.indexOf(s.conclusion) !== -1).map((s) => "\"" + s.name + "\" (" + s.conclusion + ")");
      lines.push("- Job **" + j.name + "** (" + j.conclusion + ")" + (j.html_url ? " - [logs](" + j.html_url + ")" : "") +
        (steps.length ? " : etape(s) " + steps.join(", ") : ""));
    });
  }
  lines.push("");
  lines.push("### En clair");
  lines.push(info.explain);
  lines.push("");
  lines.push("### Que faire");
  info.todo.forEach((t, i) => lines.push((i + 1) + ". " + t));
  lines.push("");
  lines.push("_Cette issue se ferme automatiquement au prochain run reussi de ce workflow. Guide : MONITORING.md._");
  return { key: workflowKey(run), title: title, body: lines.join("\n") };
}

function formatWorkflowComment(opts) {
  const run = opts.run || {};
  const jobs = (opts.failedJobs || []).map((j) => j.name).join(", ");
  return "Nouvel echec (`" + (run.conclusion || "?") + "`) : " + (run.html_url || "") + (jobs ? " - job(s) : " + jobs : "");
}

function formatWorkflowRecovery(run) {
  return "✅ Resolu automatiquement : le run " + ((run && run.html_url) || "") + " de `" + ((run && run.name) || "?") + "` a reussi.";
}

// --- Sante du site -----------------------------------------------------------
const GROUP_LABELS = {
  fraicheur: "Fraicheur des donnees",
  deploiement: "Deploiement",
  contenu: "Contenu",
  fuite: "Fuite de donnees premium",
  pages: "Pages et redirections",
  securite: "Fichiers internes",
  supabase: "Supabase",
  fournisseurs: "Fournisseurs",
  execution: "Execution du controle",
};

function formatHealthIssue(report, opts) {
  const o = opts || {};
  const results = (report && report.results) || [];
  const failures = results.filter((r) => r.status === "fail");
  const date = o.date || parisDay(o.now || new Date());
  const title = "🚨 Santé du site – " + date;
  const lines = [];
  lines.push(failures.length + " controle(s) critique(s) en echec sur " + ((report && report.base_url) || "le site") + " (controle du " + ((report && report.generated_at) || "?") + ").");
  if (o.runUrl) lines.push("", "Run du controle : " + o.runUrl);
  lines.push("");
  failures.forEach((r) => {
    lines.push("### ❌ " + r.title);
    lines.push("- Categorie : " + (GROUP_LABELS[r.group] || r.group));
    lines.push("- Constat : " + r.detail);
    if (r.fix) lines.push("- **Que faire :** " + r.fix);
    lines.push("");
  });
  lines.push("_Les avertissements (non bloquants) sont dans le resume du job. Cette issue se ferme automatiquement quand tous les controles critiques repassent. Guide : MONITORING.md._");
  return { key: HEALTH_KEY, title: title, body: lines.join("\n") };
}

function formatHealthComment(report, opts) {
  const failures = ((report && report.results) || []).filter((r) => r.status === "fail");
  return "Toujours en echec (" + ((report && report.generated_at) || "?") + ") : " +
    failures.map((r) => r.title).join(" ; ") + ((opts && opts.runUrl) ? "\n\nRun : " + opts.runUrl : "");
}

function formatHealthRecovery(report, opts) {
  return "✅ Resolu automatiquement : tous les controles critiques passent (" + ((report && report.generated_at) || "?") + ")." +
    ((opts && opts.runUrl) ? "\n\nRun : " + opts.runUrl : "");
}

const STATUS_ICON = { ok: "✅", warn: "⚠️", fail: "❌", skip: "⏭️" };

function escapeCell(s) {
  return String(s == null ? "" : s).replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function formatStepSummary(report) {
  const results = (report && report.results) || [];
  const s = report && report.summary ? report.summary : { status: "?", counts: {} };
  const lines = [];
  lines.push("## Sante du site IAShark - " + (s.status === "fail" ? "❌ panne critique" : s.status === "warn" ? "⚠️ avertissements" : "✅ tout va bien"));
  lines.push("");
  lines.push("Cible : " + ((report && report.base_url) || "?") + " - " + ((report && report.generated_at) || "") +
    " - ok " + (s.counts.ok || 0) + ", avertissements " + (s.counts.warn || 0) + ", echecs " + (s.counts.fail || 0) + ", non executes " + (s.counts.skip || 0));
  if (report && report.notes && report.notes.length) {
    lines.push("");
    report.notes.forEach((n) => lines.push("> " + n));
  }
  const warns = results.filter((r) => r.status === "warn");
  if (warns.length) {
    lines.push("", "### Avertissements");
    warns.forEach((r) => lines.push("- ⚠️ **" + r.title + "** : " + r.detail + (r.fix ? " - _" + r.fix + "_" : "")));
  }
  lines.push("", "### Tous les controles", "", "| | Categorie | Controle | Detail |", "|---|---|---|---|");
  results.forEach((r) => lines.push("| " + (STATUS_ICON[r.status] || r.status) + " | " + escapeCell(GROUP_LABELS[r.group] || r.group) + " | " + escapeCell(r.title) + " | " + escapeCell(r.detail) + " |"));
  return lines.join("\n") + "\n";
}

// Rapport de secours quand le script de controle n'a produit aucun fichier.
function crashedReport(message, now) {
  return {
    generated_at: (now || new Date()).toISOString(),
    base_url: "https://iashark.com",
    summary: { status: "fail", counts: { ok: 0, warn: 0, fail: 1, skip: 0 } },
    results: [{
      id: "execution", group: "execution", title: "Le controle de sante n'a pas pu s'executer", status: "fail",
      detail: message,
      fix: "Ouvrir le run du workflow site-health et lire l'erreur de scripts/site-health-check.js.",
    }],
  };
}

module.exports = {
  MARKER_PREFIX,
  HEALTH_KEY,
  WORKFLOW_INFO,
  ALERT_CONCLUSIONS,
  marker,
  hasMarker,
  buildMeta,
  parseMeta,
  workflowKey,
  shouldAlert,
  isRecovery,
  conclusionText,
  formatWorkflowIssue,
  formatWorkflowComment,
  formatWorkflowRecovery,
  formatHealthIssue,
  formatHealthComment,
  formatHealthRecovery,
  formatStepSummary,
  crashedReport,
};
