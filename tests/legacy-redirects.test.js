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
// 25/09/2026 : versions de/it/pt retirees (config/markets.json#_retiredDirs,
// 301 en bloc vers /en/) ; anciennes langues (/tr, /ja...) en 410 (CFG.gone).
const { PUBLIC_DIRS, RETIRED_DIRS } = require("./helpers/public-dirs.js");
const exists = (p) => fs.existsSync(path.join(ROOT, p.replace(/^\/+/, "") + (p.endsWith("/") ? "index.html" : "")));

test("configuration : chaque cible existe, aucune source n'est une page vivante", () => {
  assert.ok(CFG.rules.length > 1000, "regles des anciennes pages de pronostics");
  assert.ok(CFG.prefixes.length > 15, "prefixes Coupe du monde et resultats");
  assert.ok(CFG.gone.length > 20, "anciennes langues supprimees (410)");
  for (const r of CFG.rules.concat(CFG.prefixes)) {
    assert.ok(exists(r.to), "cible absente : " + r.to);
    assert.ok(!CFG.rules.some((x) => x.from === r.to), "cible elle-meme redirigee : " + r.to);
  }
  for (const r of CFG.rules) assert.ok(!exists(r.from), "page vivante redirigee : " + r.from);
});

test("langues supprimees : jamais un repertoire encore publie", () => {
  const live = PUBLIC_DIRS.concat(["match", "blog", "assets", "i18n", "results"]);
  for (const p of CFG.prefixes) {
    const top = p.from.split("/")[1];
    // Sous-dossiers retires d'une langue vivante : jamais le dossier de langue lui-meme.
    if (/world-cup-2026|\/resultats\/$/.test(p.from)) { assert.notEqual(p.from.split("/").length, 2); continue; }
    assert.ok(!live.includes(top), "prefixe sur un repertoire vivant : " + p.from);
    assert.ok(!fs.existsSync(path.join(ROOT, top)), "repertoire de nouveau present : " + top);
  }
  // Anciennes langues en 410 : jamais un repertoire publie ni une version
  // retiree (celles-ci restent en 301 vers leur repli).
  for (const g of CFG.gone) {
    assert.match(g, /^\/[a-z]{2,3}$/, g);
    const top = g.slice(1);
    assert.ok(!live.includes(top) && !Object.prototype.hasOwnProperty.call(RETIRED_DIRS, top), "410 sur un repertoire vivant ou retire : " + g);
    assert.ok(!fs.existsSync(path.join(ROOT, top)), "repertoire de nouveau present : " + top);
    assert.ok(!CFG.prefixes.some((p) => p.from.split("/")[1] === top), g + " a la fois 410 et redirige");
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
  for (const g of CFG.gone) {
    assert.match(REDIRECTS, new RegExp("^" + g + "\\s+/fr/404\\.html\\s+410!$", "m"), g + " : 410 absent");
    assert.match(REDIRECTS, new RegExp("^" + g + "/\\*\\s+/fr/404\\.html\\s+410!$", "m"), g + "/* : 410 absent");
  }
  assert.ok(fs.existsSync(path.join(ROOT, "fr/404.html")), "page servie avec le 410");
  assert.match(REDIRECTS, /^\/en\/world-cup-2026\/\*\s+\/en\/\s+301$/m);
});
