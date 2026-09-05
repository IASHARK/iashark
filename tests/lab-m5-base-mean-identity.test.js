"use strict";
// M5 DATA/BASELINE GATE (audit 2026-09-05) - contrat obligatoire AVANT
// tout contrat mathematique ou fit M5 : M5_BASE_MEANS == M2_MEANS. M5
// (bivariate count model / shared latent gamma, contrat mathematique
// exact fige separement par l'utilisateur) ne doit JAMAIS re-estimer la
// force des equipes ni repartir de M4 (M4=CLOSED_REJECT) - il doit
// reutiliser EXACTEMENT les lambdas du champion M2 deja ferme
// (EXP-002C, code_sha=b8cb9ff3f3a8d03d529b8ebbdb7c4147faf2438f).
//
// Ce test recalcule M2 EXACTEMENT comme le run EXP-002C ferme (memes
// options : allFixtures 2022+2023+2024, SANS le warm-up 2021-22 - deja
// prouve sans effet par tests/lab-m2c-warmup-invariance.test.js, mais le
// champion FERME reste defini par sa configuration exacte d'origine) et
// verifie que les 760 lambdas (COMMON_SUPPORT + M2_COVERAGE_GAIN) sont
// BYTE-IDENTIQUES a celles persistees dans scripts/experiments/exp002c_report.json
// (deja clos, decision=PROMOTE, jamais rouvert).
//
// N'IMPORTE STRUCTURELLEMENT AUCUN module lie a M4 (nb2*, promotion-m4,
// walkforward-m4-runner) ni a Elo/odds/LLM - la liste des requires de ce
// fichier lui-meme le prouve (verifie plus bas par introspection du
// fichier source).

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const { runWalkForwardM2C } = require("../lib/lab/walkforward-m2c-runner.js");

const GATE_B1_DIR = path.join(__dirname, "..", "data", "gate-b1");
function loadSeason(s) { return JSON.parse(fs.readFileSync(path.join(GATE_B1_DIR, `premier-league-${s}.json`), "utf8")); }

test("M5_BASE_MEANS == M2_MEANS : les 760 lambdas M2 (COMMON_SUPPORT+COVERAGE_GAIN) recalculees sont BYTE-IDENTIQUES au rapport EXP-002C deja ferme (PROMOTE) - M5 partira de ces memes valeurs, jamais de M4", () => {
  const f2022 = loadSeason(2022), f2023 = loadSeason(2023), f2024 = loadSeason(2024);
  const result = runWalkForwardM2C({
    allFixtures: [...f2022, ...f2023, ...f2024],
    oosSeasons: [2023, 2024],
    leagueId: 39, leagueAvgH: 1.35, leagueAvgA: 1.10,
    previousSeasonFixturesBySeasons: new Map([[2023, f2022], [2024, f2023]]),
  });

  const closedReport = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "scripts", "experiments", "exp002c_report.json"), "utf8"));
  assert.equal(closedReport.promotion.status, "PROMOTE", "le rapport de reference doit etre le champion FERME (PROMOTE), pas un brouillon");

  const byId = new Map(closedReport.predictions.map((p) => [p.fixture_id, p]));
  assert.equal(result.predictions.length, 760);
  assert.equal(closedReport.predictions.length, 760);

  let checked = 0;
  for (const p of result.predictions) {
    const real = byId.get(p.fixture_id);
    assert.ok(real, `fixture ${p.fixture_id} absente du rapport EXP-002C ferme`);
    assert.equal(p.lambdaH_m2, real.lambdaH_m2, `lambdaH_m2 fixture ${p.fixture_id} (M5 ne doit jamais re-estimer la force des equipes ni partir de M4)`);
    assert.equal(p.lambdaA_m2, real.lambdaA_m2, `lambdaA_m2 fixture ${p.fixture_id}`);
    assert.equal(p.m0_valid, real.m0_valid, `m0_valid fixture ${p.fixture_id}`);
    checked++;
  }
  assert.equal(checked, 760, "les 760 fixtures OOS (699 COMMON_SUPPORT + 61 M2_COVERAGE_GAIN) doivent toutes etre verifiees");
});

test("aucune trace de M4 (NB2/kappa) ni d'Elo/odds/LLM dans la chaine de dependances RUNTIME de ce gate M5 - preuve par introspection du code effectivement importe (pas ce fichier de test lui-meme, dont les commentaires NOMMENT ces termes pour documenter leur absence)", () => {
  const source = fs.readFileSync(__filename, "utf8");
  const requireLines = source.match(/require\(["'][^"']+["']\)/g) || [];
  for (const line of requireLines) {
    assert.doesNotMatch(line, /nb2|kappa|clubelo|elo|odds|bookmaker|llm/i, `import suspect dans ce fichier de gate M5: ${line}`);
  }

  const filesToCheck = [
    path.join(__dirname, "..", "lib", "lab", "walkforward-m2c-runner.js"),
    path.join(__dirname, "..", "lib", "lab", "bayes-early-season.js"),
  ];
  const forbidden = [/nb2/i, /kappa/i, /clubelo/i, /\belo\b/i, /odds/i, /bookmaker/i, /\bllm\b/i, /anthropic/i, /openai/i];
  for (const file of filesToCheck) {
    const source = fs.readFileSync(file, "utf8");
    for (const re of forbidden) {
      assert.doesNotMatch(source, re, `${file} contient une reference interdite (${re}) - la base M5 doit rester exclusivement M2, aucune trace de M4/Elo/odds/LLM`);
    }
  }
});

test("aucun fichier M5 n'existe encore dans le depot - le contrat mathematique M5 n'a pas ete fige, aucun fit/formule ne doit avoir ete ecrit avant validation explicite de l'utilisateur", () => {
  const repoRoot = path.join(__dirname, "..");
  const candidatePaths = [
    "lib/lab/walkforward-m5-runner.js",
    "lib/lab/bivariate-gamma.js",
    "scripts/fit_m5.py",
    "scripts/run_exp005.js",
    "scripts/experiments/exp005_manifest.json",
  ];
  for (const rel of candidatePaths) {
    assert.equal(fs.existsSync(path.join(repoRoot, rel)), false, `${rel} ne devrait pas encore exister - le contrat mathematique M5 doit etre fige par l'utilisateur AVANT tout code de formule/fit`);
  }
});
