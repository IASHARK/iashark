#!/usr/bin/env node
"use strict";
// SCORE_LAB_FACTORY_V2 - Phase C (2026-09-06). OUVERTURE DU HOLDOUT,
// GENERIQUE. NE PAS INVOQUER sans autorisation explicite pour la ligue
// concernee - verifie le scellement AVANT tout fetch (lib/score-lab-
// factory-v2/holdout-seal.js#assertHoldoutSealedBeforeAccess, leve une
// exception si le holdout est deja consomme).
//
// Usage : node scripts/score-lab-v2-holdout-validation.js --league=ligue1

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const { runWalkForward } = require("../lib/lab/walkforward-runner.js");
const { runWalkForwardM2R } = require("../lib/lab/walkforward-m2r-runner.js");
const { exactScoreNLL } = require("../lib/lab/metrics.js");
const { assertHoldoutSealedBeforeAccess } = require("../lib/score-lab-factory-v2/holdout-seal.js");
const { evaluateHoldout } = require("../lib/score-lab-factory-v2/holdout-validation.js");

function parseArgs() { const args = {}; for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; } return args; }
function loadLeagueConfig(leagueKey) { const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8")); return config.leagues.find((l) => l.key === leagueKey); }
function loadFixtures(leagueKey, season) { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8")).map((f) => ({ ...f, season })); }

function computeAll(leagueKey, league, contract) {
  const sp = league.seasonSplit;
  const holdoutSeason = sp.sealed_unread;
  const championIsM2 = contract.champion.model_id === "M2";
  const championIsB0 = contract.champion.model_id === "B0";
  const rhoFrozen = contract.champion.rho;
  const leagueAvgH = contract.champion.league_avg_h;
  const leagueAvgA = contract.champion.league_avg_a;

  const warmup = loadFixtures(leagueKey, sp.warmup);
  const train = loadFixtures(leagueKey, sp.train);
  const oosDev = loadFixtures(leagueKey, sp.oos_dev);
  const oosFinal = loadFixtures(leagueKey, sp.oos_final);
  const holdout = loadFixtures(leagueKey, holdoutSeason);
  const allFixtures = [...warmup, ...train, ...oosDev, ...oosFinal, ...holdout];
  const trainSeasons = [sp.warmup, sp.train, sp.oos_dev, sp.oos_final];

  let predictions;
  if (championIsM2) {
    const previousSeasonFixturesBySeasons = new Map([[holdoutSeason, oosFinal]]);
    const wf = runWalkForwardM2R({ allFixtures, trainSeasons, oosSeasons: [holdoutSeason], leagueId: league.apiFootballId, leagueAvgH, leagueAvgA, previousSeasonFixturesBySeasons, championRho: rhoFrozen });
    predictions = wf.predictions.filter((p) => p.m0_valid).map((p) => ({ fixture_id: p.fixture_id, cutoff: p.cutoff, lambdaH: p.lambdaH_m2, lambdaA: p.lambdaA_m2, h: p.goals_home_90, a: p.goals_away_90, rho: rhoFrozen, markets: p.markets_m2 }));
  } else {
    const rhoUsed = championIsB0 ? 0 : rhoFrozen;
    const constantRhoFitter = () => ({ rho_hat: rhoUsed, convergence: true, on_boundary: false });
    const wf = runWalkForward({ allFixtures, trainSeasons, oosSeasons: [holdoutSeason], championRho: rhoUsed, candidateRhoFitter: constantRhoFitter, leagueAvgH, leagueAvgA, leagueId: league.apiFootballId });
    predictions = wf.predictions.map((p) => ({ fixture_id: p.fixture_id, cutoff: p.cutoff, lambdaH: p.lambdaH, lambdaA: p.lambdaA, h: p.goals_home_90, a: p.goals_away_90, rho: rhoUsed, markets: championIsB0 ? p.markets_m0 : p.markets_m1 }));
  }

  const holdoutFixtureIds = new Set(holdout.map((f) => f.fixture_id));
  const evaluation = evaluateHoldout({ contract, predictions, totalFixturesInHoldoutSeason: holdout.length, holdoutFixtureIds, exactScoreNLL });

  return {
    protocol: "SCORE_LAB_FACTORY_V2",
    phase: "C_HOLDOUT_EVALUATION",
    league_key: leagueKey,
    holdout_season: holdoutSeason,
    champion: contract.champion.model_id,
    generated_at: new Date().toISOString(),
    ...evaluation,
  };
}

function main() {
  const args = parseArgs();
  const leagueKey = args.league || args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/score-lab-v2-holdout-validation.js --league=<key>"); process.exit(1); }
  if (args.confirm !== "OPEN_HOLDOUT") {
    console.error("REFUS : ce script ouvre un holdout SEALED de maniere definitive et irreversible.");
    console.error("Relancer avec --confirm=OPEN_HOLDOUT UNIQUEMENT apres autorisation explicite pour cette ligue precise.");
    process.exit(1);
  }

  const league = loadLeagueConfig(leagueKey);
  if (!league) { console.error(`Ligue inconnue: ${leagueKey}`); process.exit(1); }

  // GARDE-FOU (lib/score-lab-factory-v2/holdout-seal.js) : leve une
  // exception si le holdout de cette ligue a deja ete consomme -
  // AVANT tout fetch. Jamais contourne.
  const sealStatus = assertHoldoutSealedBeforeAccess(league);
  console.log("Seal verifie AVANT ouverture : " + JSON.stringify(sealStatus));

  const factoryDir = path.join(__dirname, "..", "data", "league-factory", leagueKey, "score-lab-factory-v2");
  const contractPath = path.join(factoryDir, "production-validation-contract.json");
  if (!fs.existsSync(contractPath)) { console.error("Contrat de validation absent - lancer Phase A puis Phase B et les COMMITTER avant d'ouvrir le holdout."); process.exit(1); }
  const { contract } = JSON.parse(fs.readFileSync(contractPath, "utf8"));

  // Fetch UNIQUE de la saison sealed_unread - c'est CETTE ligne qui
  // "casse" le seal (verifie par holdout-seal.js a la prochaine execution).
  execFileSync("node", [path.join(__dirname, "collect-league-fixtures.js"), `--league-key=${leagueKey}`, `--seasons=${league.seasonSplit.sealed_unread}`], { stdio: "inherit" });

  console.log("=== Run 1/2 (reproductibilite) ===");
  const result1 = computeAll(leagueKey, league, contract);
  console.log("=== Run 2/2 (reproductibilite) ===");
  const result2 = computeAll(leagueKey, league, contract);
  const strip = (r) => { const { generated_at, ...rest } = r; return rest; };
  const hash1 = crypto.createHash("sha256").update(JSON.stringify(strip(result1))).digest("hex");
  const hash2 = crypto.createHash("sha256").update(JSON.stringify(strip(result2))).digest("hex");
  const reproducible = hash1 === hash2;

  let finalVerdict = result1.verdict;
  const rejectTriggers = [...result1.reject_triggers];
  if (!reproducible) { rejectTriggers.push("REPRODUCIBILITY"); finalVerdict = "REJECTED"; }

  const report = { ...result1, gates: { ...result1.gates, REPRODUCIBILITY: { pass: reproducible } }, reject_triggers: rejectTriggers, verdict: finalVerdict, score_runnable: finalVerdict === "VALIDATED", hash_run1: hash1, hash_run2: hash2, reproducible };

  const outPath = path.join(factoryDir, "holdout-validation-report.json");
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log("\nEcrit: " + outPath);
}

if (require.main === module) main();

module.exports = { computeAll };
