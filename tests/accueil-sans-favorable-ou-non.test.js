"use strict";
// Avocat du diable (30/09/2026, point 2 bloquant) : la page d'accueil promettait
// « l'écart entre notre estimation et la cote, favorable ou non ». Hors d'Europe, le
// moteur v3 calcule seul et son ecart favorable n'est PAS affiche (« écart non
// affiché ») : la promesse etait fausse. Desormais : « notre estimation face à la
// cote », vrai partout (les deux barres sont toujours montrees). Racine, fr, en, gb,
// za, es, mx, pages generees par scripts/build-locales.js (scripts/i18n-manifest.js).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const lire = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
const INTERDIT = /favorable ou non|favourable or not|favorable o no|ob günstig oder nicht|favorevole o no|favorável ou não/i;

test("accueil : plus aucune promesse « favorable ou non », dans aucune version", () => {
  const attendu = {
    "index.html": "avec notre estimation face à la cote.", "fr/index.html": "avec notre estimation face à la cote.",
    "en/index.html": "with our estimate set against the odds.", "gb/index.html": "with our estimate set against the odds.", "za/index.html": "with our estimate set against the odds.",
    "es/index.html": "con nuestra estimación comparada con la cuota.", "mx/index.html": "con nuestra estimación comparada con el momio.",
  };
  for (const [f, phrase] of Object.entries(attendu)) {
    const html = lire(f);
    assert.doesNotMatch(html, INTERDIT, f);
    assert.ok(html.includes(phrase), f + " : « " + phrase + " » attendu");
  }
});

test("manifeste : la regle de traduction et les 6 textes sont a jour", () => {
  const src = lire("scripts/i18n-manifest.js");
  assert.doesNotMatch(src, INTERDIT);
  const home = require("../scripts/i18n-manifest.js").find((p) => p.file === "index.html");
  const regle = home.replacements.find((r) => r.find === "Le marché le plus probable parmi ceux qui sont cotés, avec notre estimation face à la cote.");
  assert.ok(regle, "regle de traduction introuvable");
  for (const l of ["fr", "en", "es", "de", "it", "pt"]) assert.doesNotMatch(regle.build({}, l), INTERDIT, l);
});
