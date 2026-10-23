"use strict";
// robots.txt (23/10/2026, chantier GEO/SEO, action A1) : les robots des
// moteurs de recherche et des assistants IA (recherche, citation, lecture a la
// demande d'un utilisateur) ont chacun un groupe nomme qui les autorise. Un
// groupe nomme REMPLACE le groupe * pour son robot : chaque groupe doit donc
// repeter l'interdiction de /admin.html, sinon ce robot pourrait la lire.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const TXT = fs.readFileSync(path.join(__dirname, "..", "robots.txt"), "utf8");

// Groupes : une ou plusieurs lignes User-agent consecutives, puis leurs regles.
function groups(txt) {
  const out = [];
  let cur = null, lastWasAgent = false;
  txt.split(/\r?\n/).forEach(function (raw) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    assert.ok(m, "ligne illisible dans robots.txt : " + raw);
    const field = m[1].toLowerCase(), value = m[2].trim();
    if (field === "user-agent") {
      if (!lastWasAgent) { cur = { agents: [], rules: [] }; out.push(cur); }
      cur.agents.push(value);
      lastWasAgent = true;
      return;
    }
    lastWasAgent = false;
    if (field === "sitemap") return;
    assert.ok(cur, "regle avant tout User-agent : " + raw);
    cur.rules.push({ field: field, value: value });
  });
  return out;
}

const ROBOTS_IA = ["OAI-SearchBot", "ChatGPT-User", "GPTBot", "PerplexityBot", "Perplexity-User", "ClaudeBot",
  "Claude-SearchBot", "Claude-User", "Google-Extended", "Bingbot", "Applebot", "Applebot-Extended"];

test("robots.txt : un groupe nomme par robot IA, site autorise, /admin.html interdit", () => {
  const g = groups(TXT);
  ROBOTS_IA.forEach(function (bot) {
    const grp = g.filter(function (x) { return x.agents.some(function (a) { return a.toLowerCase() === bot.toLowerCase(); }); });
    assert.equal(grp.length, 1, bot + " : un seul groupe attendu");
    const rules = grp[0].rules;
    assert.ok(rules.some(function (r) { return r.field === "allow" && r.value === "/"; }), bot + " : Allow: / absent");
    assert.ok(rules.some(function (r) { return r.field === "disallow" && r.value === "/admin.html"; }), bot + " : /admin.html non interdit");
  });
});

test("robots.txt : groupe * conserve, aucun groupe ne ferme le site, sitemap declare", () => {
  const g = groups(TXT);
  const star = g.filter(function (x) { return x.agents.indexOf("*") !== -1; });
  assert.equal(star.length, 1, "groupe * absent ou en double");
  assert.ok(star[0].rules.some(function (r) { return r.field === "disallow" && r.value === "/admin.html"; }));
  g.forEach(function (x) {
    assert.ok(!x.rules.some(function (r) { return r.field === "disallow" && r.value === "/"; }), x.agents.join(", ") + " : site entier interdit");
    // Chaque groupe porte au moins une regle (un groupe vide n'aurait aucun effet).
    assert.ok(x.rules.length, x.agents.join(", ") + " : groupe sans regle");
  });
  assert.match(TXT, /^Sitemap: https:\/\/iashark\.com\/sitemap\.xml$/m);
});
