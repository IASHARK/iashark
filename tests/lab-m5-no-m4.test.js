"use strict";
// EXP-005 item 7 (SPEC LAB PRO v1.0, M5_SHARED_GAMMA_DC) - M4 est
// CLOSED_REJECT (EXP-004) : son modele (marges NB2 INDEPENDANTES) n'est
// PAS la baseline de M5, et son kappa/fitter/decision ne doivent JAMAIS
// entrer dans M5. Les utilitaires vraiment GENERIQUES (worker Python
// persistant, timeout, metrics, walk-forward, bootstrap) restent
// reutilisables - ce contrat interdit specifiquement l'HYPOTHESE
// statistique M4 (modele NB2 independant, son fitter dedie, sa decision),
// pas l'infrastructure de plomberie partagee.

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const M5_SOURCE_FILES = [
  "lib/lab/shared-gamma-dc.js",
  "lib/lab/shared-gamma-matrix.js",
  "lib/lab/shared-gamma-python-worker.js",
  "lib/lab/shared-gamma-synthetic-identifiability.js",
  "lib/lab/walkforward-m5-runner.js",
];

const FORBIDDEN_IMPORT_PATTERNS = [
  { name: "lib/lab/nb2.js (modele NB2 independant M4)", re: /require\([^)]*\/nb2\.js[^)]*\)/ },
  { name: "lib/lab/nb2-matrix.js", re: /require\([^)]*nb2-matrix\.js[^)]*\)/ },
  { name: "lib/lab/nb2-log-probability.js", re: /require\([^)]*nb2-log-probability\.js[^)]*\)/ },
  { name: "lib/lab/nb2-python-fitter.js / nb2-python-worker.js", re: /require\([^)]*nb2-python-(fitter|worker)\.js[^)]*\)/ },
  { name: "lib/lab/promotion-m4.js", re: /require\([^)]*promotion-m4\.js[^)]*\)/ },
  { name: "lib/lab/walkforward-m4-runner.js", re: /require\([^)]*walkforward-m4-runner\.js[^)]*\)/ },
];

test("aucun fichier source du coeur mathematique M5 n'importe un module M4 (NB2 independant, son fitter, sa decision)", () => {
  for (const relPath of M5_SOURCE_FILES) {
    const fullPath = path.join(__dirname, "..", relPath);
    assert.ok(fs.existsSync(fullPath), `fichier attendu manquant: ${relPath}`);
    const source = fs.readFileSync(fullPath, "utf8");
    for (const { name, re } of FORBIDDEN_IMPORT_PATTERNS) {
      assert.doesNotMatch(source, re, `${relPath} importe un module M4 interdit (${name}) - M4 est CLOSED_REJECT, pas la baseline de M5`);
    }
  }
});

test("la matrice M5 derive sa propre marge NB2-shared-gamma INDEPENDAMMENT (pas un import de lib/lab/nb2.js) - meme si la formule marginale est mathematiquement une NB2, ce n'est pas une reutilisation de l'hypothese M4", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "lib", "lab", "shared-gamma-matrix.js"), "utf8");
  assert.match(source, /function marginalLogPmf/, "la marge doit etre definie localement dans ce fichier");
  assert.doesNotMatch(source, /require\([^)]*\/nb2["']?\.js[^)]*\)/);
});

test("aucune constante kappa issue d'EXP-004 (le kappa M4 observe reel, ~12.33) n'apparait en dur dans le code source M5", () => {
  for (const relPath of M5_SOURCE_FILES) {
    const source = fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");
    assert.doesNotMatch(source, /12\.33491251843262|12\.542467302413975/, `${relPath} contient une valeur kappa issue du rapport EXP-004 en dur`);
  }
});
