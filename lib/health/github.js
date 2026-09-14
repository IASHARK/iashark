"use strict";
// Mini client REST GitHub (fetch natif, aucune dependance) pour la
// surveillance : lecture des commits et des jobs d'un run, ouverture / mise a
// jour / fermeture des issues d'alerte. Le jeton est GITHUB_TOKEN du workflow
// (permissions issues: write, contents: read, actions: read) ; sans jeton,
// seules les lectures publiques fonctionnent (60 requetes/heure).

const { buildMeta, parseMeta, hasMarker } = require("./issues.js");

function createGitHub(opts) {
  const o = opts || {};
  const repo = o.repo || "IASHARK/iashark";
  const token = o.token || "";
  const fetchImpl = o.fetchImpl || fetch;
  const apiBase = o.apiBase || "https://api.github.com";

  async function request(method, pathname, body) {
    const headers = {
      "Accept": "application/vnd.github+json",
      "User-Agent": "iashark-site-health",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = "Bearer " + token;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const res = await fetchImpl(apiBase + pathname, {
      method: method,
      headers: headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
    if (!res.ok) {
      const err = new Error("GitHub " + method + " " + pathname + " -> " + res.status + " " + ((json && json.message) || text.slice(0, 200)));
      err.status = res.status;
      throw err;
    }
    return json;
  }

  const r = "/repos/" + repo;

  return {
    repo: repo,
    request: request,

    // Dernier commit de la branche dont le message correspond. Cherche d'abord
    // parmi les commits touchant data.json (les "Daily update" le modifient
    // toujours), puis dans l'historique general.
    async latestCommitMatching(branch, regex) {
      const lists = [
        r + "/commits?sha=" + encodeURIComponent(branch) + "&path=data.json&per_page=30",
        r + "/commits?sha=" + encodeURIComponent(branch) + "&per_page=100",
      ];
      for (const url of lists) {
        const commits = await request("GET", url);
        const hit = (commits || []).find((c) => regex.test(String(c.commit && c.commit.message)));
        if (hit) return { sha: hit.sha, date: hit.commit.committer.date, message: String(hit.commit.message).split("\n")[0] };
      }
      return null;
    },

    async runJobs(runId) {
      const j = await request("GET", r + "/actions/runs/" + runId + "/jobs?filter=latest&per_page=100");
      return (j && j.jobs) || [];
    },

    async findOpenIssueByKey(key) {
      for (let page = 1; page <= 5; page++) {
        const issues = await request("GET", r + "/issues?state=open&per_page=100&page=" + page);
        if (!issues || !issues.length) return null;
        const hit = issues.find((i) => !i.pull_request && hasMarker(i.body, key));
        if (hit) return hit;
        if (issues.length < 100) return null;
      }
      return null;
    },

    async ensureLabel(name, color, description) {
      try {
        await request("POST", r + "/labels", { name: name, color: color, description: description });
      } catch (e) {
        if (e.status !== 422) throw e; // 422 : le label existe deja
      }
    },

    createIssue(fields) { return request("POST", r + "/issues", fields); },
    updateIssue(number, fields) { return request("PATCH", r + "/issues/" + number, fields); },
    comment(number, body) { return request("POST", r + "/issues/" + number + "/comments", { body: body }); },
  };
}

// Ouvre ou met a jour l'issue d'alerte de cle `key`.
// - pas d'issue ouverte : creation (titre date du premier echec) ;
// - issue ouverte : corps remplace par le constat le plus recent, compteur
//   incremente, et commentaire (qui declenche une notification) au plus une
//   fois toutes les `commentEveryHours` heures pour ne pas inonder la boite mail.
async function upsertAlertIssue(gh, alert, opts) {
  const o = opts || {};
  const now = o.now || new Date();
  const every = o.commentEveryHours != null ? o.commentEveryHours : 6;
  const labels = o.labels || ["monitoring"];
  const existing = await gh.findOpenIssueByKey(alert.key);
  if (!existing) {
    try { await gh.ensureLabel(labels[0], "d73a4a", "Alerte automatique de surveillance (MONITORING.md)"); } catch (e) { /* label optionnel */ }
    const body = alert.body + "\n\n" + buildMeta(alert.key, { occurrences: 1, firstSeen: now.toISOString(), lastComment: now.toISOString() });
    let created;
    try {
      created = await gh.createIssue({ title: alert.title, body: body, labels: labels });
    } catch (e) {
      created = await gh.createIssue({ title: alert.title, body: body });
    }
    return { action: "created", number: created && created.number };
  }
  const meta = parseMeta(existing.body);
  const last = meta.lastComment ? new Date(meta.lastComment) : null;
  const shouldComment = !last || isNaN(last.getTime()) || (now.getTime() - last.getTime()) >= every * 3600000;
  const next = {
    occurrences: (meta.occurrences || 1) + 1,
    firstSeen: meta.firstSeen || existing.created_at || "",
    lastComment: shouldComment ? now.toISOString() : meta.lastComment,
  };
  const body = alert.body + "\n\n_Occurrences depuis l'ouverture : " + next.occurrences + "._\n\n" + buildMeta(alert.key, next);
  await gh.updateIssue(existing.number, { body: body });
  if (shouldComment && alert.comment) await gh.comment(existing.number, alert.comment);
  return { action: shouldComment ? "updated+commented" : "updated", number: existing.number };
}

async function resolveAlertIssue(gh, key, comment) {
  const existing = await gh.findOpenIssueByKey(key);
  if (!existing) return { action: "none" };
  if (comment) await gh.comment(existing.number, comment);
  await gh.updateIssue(existing.number, { state: "closed", state_reason: "completed" });
  return { action: "closed", number: existing.number };
}

module.exports = { createGitHub, upsertAlertIssue, resolveAlertIssue };
