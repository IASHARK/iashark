#!/usr/bin/env node
"use strict";
// PRODUCTION_CI_GATE (2026-09-06). Liste les fichiers de test LEGERS et
// DETERMINISTES pour le PRE-FLIGHT PRODUCTION (.github/workflows/tests.yml).
// Exclut la suite scientifique lourde (fitters Python M4/M5/NB2/fit_rho,
// synthetic identifiability, walk-forward experiments, tests dependants
// de l'historique git complet type `git show <sha>:...`) - celle-ci vit
// desormais dans .github/workflows/scientific-regression.yml (nightly/
// manual, fetch-depth:0), jamais dans le gate quotidien qui bloquerait
// le pipeline de production pour des experiences rejetees/fermees qui
// ne participent pas au runtime.
//
// Classification PROGRAMMATIQUE (pas une liste figee a maintenir a la
// main) : un fichier est "lourd" s'il importe lib/lab/ (machinerie
// scientifique Score-Lab), invoque un script Python, ou consulte
// l'historique git complet. Tout le reste est considere pre-flight.
// Voir scripts/list-scientific-tests.js pour le complement exact.

const fs = require("fs");
const path = require("path");

const TESTS_DIR = path.join(__dirname, "..", "tests");
const HEAVY_PATTERN = /require\(['"]\.\.\/lib\/lab\/|python|\.py'|git show|execFileSync\('git|spawnSync\('git/;

function isHeavy(fileName) {
  const src = fs.readFileSync(path.join(TESTS_DIR, fileName), "utf8");
  return HEAVY_PATTERN.test(src);
}

function listTestFiles() {
  return fs.readdirSync(TESTS_DIR).filter((f) => f.endsWith(".test.js"));
}

if (require.main === module) {
  const light = listTestFiles().filter((f) => !isHeavy(f));
  console.log(light.map((f) => "tests/" + f).join("\n"));
}

module.exports = { isHeavy, listTestFiles, HEAVY_PATTERN };
