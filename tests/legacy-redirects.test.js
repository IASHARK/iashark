"use strict";
// Anciennes URLs supprimees encore demandees par Google (config/legacy-redirects.json,
// rapport Indexation de la Search Console du 21/09/2026 : 365 pages 404).
// Ces redirections avaient disparu avec le retour arriere 3fa03d606 sans
// qu'aucun test ne le signale : ce fichier est la pour que ca ne se reproduise pas.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const CFG = JSON.parse(fs.readFileSync(path.join(ROOT, "config/legacy-redirects.json"), "utf8"));
const BUILD = require("../scripts/build-locales.js");
const REDIRECTS = fs.readFileSync(path.join(ROOT, "_redirects"), "utf8");
const exists = (p) => fs.existsSync(path.join(ROOT, p.replace(/^\/+/, "") + (p.endsWith("/") ? "index.html" : "")));

test("configuration : chaque cible existe, aucune source n'est une page vivante", () => {
  assert.ok(CFG.rules.length > 1000, "regles des anciennes pages de pronostics");
  assert.ok(CFG.prefixes.length > 40, "prefixes Coupe du monde et langues supprimees");
  for (const r of CFG.rules.concat(CFG.prefixes)) {
    assert.ok(exists(r.to), "cible absente : " + r.to);
    assert.ok(!CFG.rules.some((x) => x.from === r.to), "cible elle-meme redirigee : " + r.to);
  }
  for (const r of CFG.rules) assert.ok(!exists(r.from), "page vivante redirigee : " + r.from);
});

test("langues supprimees : jamais un repertoire encore publie", () => {
  const live = ["fr", "en", "es", "de", "it", "pt", "gb", "za", "mx", "match", "blog", "assets", "i18n", "results"];
  for (const p of CFG.prefixes) {
    const top = p.from.split("/")[1];
    if (/world-cup-2026/.test(p.from)) continue;
    assert.ok(!live.includes(top), "prefixe sur un repertoire vivant : " + p.from);
    assert.ok(!fs.existsSync(path.join(ROOT, top)), "repertoire de nouveau present : " + top);
  }
});

test("_redirects : le bloc des anciennes URLs est genere, en 301 non force", () => {
  const rules = BUILD.legacyRedirectRules();
  assert.ok(rules.length > 1000);
  assert.match(REDIRECTS, /# --- Anciennes URLs supprimees/);
  for (const [from, to] of rules.slice(0, 50)) {
    const line = REDIRECTS.split("\n").find((l) => l.split(/\s+/)[0] === from);
    assert.ok(line, "regle absente de _redirects : " + from);
    assert.deepEqual(line.trim().split(/\s+/).slice(1), [to, "301"], from);
  }
  assert.match(REDIRECTS, /^\/tr\/\*\s+\/en\/\s+301$/m);
  assert.match(REDIRECTS, /^\/en\/world-cup-2026\/\*\s+\/en\/blog\/guides\/coupe-du-monde-2026-guide-complet\.html\s+301$/m);
});
