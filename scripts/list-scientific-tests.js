#!/usr/bin/env node
"use strict";
// PRODUCTION_CI_GATE (2026-09-06). Complement exact de
// scripts/list-preflight-tests.js : la suite scientifique lourde
// (fitters Python M4/M5/NB2/fit_rho, synthetic identifiability,
// walk-forward experiments, tests dependants de l'historique git
// complet). Executee UNIQUEMENT par .github/workflows/scientific-
// regression.yml (nightly/manual, fetch-depth:0) - jamais dans le
// pre-flight quotidien de update-data.yml.

const { isHeavy, listTestFiles } = require("./list-preflight-tests.js");

if (require.main === module) {
  const heavy = listTestFiles().filter((f) => isHeavy(f));
  console.log(heavy.map((f) => "tests/" + f).join("\n"));
}
