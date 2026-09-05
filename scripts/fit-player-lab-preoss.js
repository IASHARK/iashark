#!/usr/bin/env node
"use strict";
// LEAGUE_EXPANSION_FACTORY_V1 (2026-09-06). Player Lab PRE-OOS pour une
// ligue donnee : refitte TOUS les priors (position, exposition,
// conversion, goal-timing, own-goal, penalty) sur le TRAIN de CETTE
// ligue, en reutilisant TEL QUEL lib/player-lab/fit-all-priors.js
// (deja generique - filtre lui-meme sur splitFor(season)==="TRAIN").
// PLAYER_SCORER_V1_AGGREGATED_SHARE (le champion PL) devient ici un
// CANDIDAT STRUCTUREL, pas un champion automatique - ses PARAMETRES
// (les priors ci-dessous) sont entierement RE-APPRIS sur les donnees de
// cette ligue, jamais copies depuis PL.
//
// splitFor() (lib/player-lab/season-split.js) est reutilise SANS
// MODIFICATION : le mapping annee->phase (2021=WARMUP, 2022=TRAIN,
// 2023=OOS_DEV, 2024=OOS_FINAL, 2025=SEALED_UNREAD) est un simple
// mapping d'etiquette d'annee API-Football, valide pour N'IMPORTE
// QUELLE ligue (calendrier europeen ou civil) tant que le season-split
// choisi pour cette ligue utilise les memes etiquettes - c'est le cas
// ici (config/league-expansion.json).
//
// STOP AVANT OOS : ce script ne charge QUE WARMUP+TRAIN. OOS_DEV/
// OOS_FINAL ne sont ni charges ni references.
//
// Usage : node scripts/fit-player-lab-preoss.js --league-key=laliga

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { readCached, isCached } = require("../lib/player-lab/raw-cache.js");
const { buildPlayerMatchRowsForFixture } = require("../lib/player-lab/build-player-match-table.js");
const { extractGoalEvents, reconcileRegulatoryGoals } = require("../lib/player-lab/goal-events.js");
const { fitAllPriorsFromTrain } = require("../lib/player-lab/fit-all-priors.js");
const { splitFor } = require("../lib/player-lab/season-split.js");
const { reconstructCumulativeHistoryBeforeCutoff } = require("../lib/player-lab/anti-leakage.js");
const { posteriorCoreRate } = require("../lib/player-lab/core-rate-model.js");
const { buildCandidateGammaParams, simulateAnytimeScorer } = require("../lib/player-lab/simulation.js");
const { teamGoalDistribution } = require("../lib/player-lab/team-goal-distribution.js");

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; }
  return args;
}
function loadLeagueConfig(leagueKey) {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8"));
  const entry = config.leagues.find((l) => l.key === leagueKey);
  if (!entry) throw new Error(`Ligue "${leagueKey}" absente de config/league-expansion.json`);
  return entry;
}
function loadFixturesMeta(leagueKey, season) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`), "utf8")).map((f) => ({ ...f, season }));
}

function main() {
  const args = parseArgs();
  const leagueKey = args["league-key"];
  if (!leagueKey) { console.error("Usage: node scripts/fit-player-lab-preoss.js --league-key=<key>"); process.exit(1); }
  const league = loadLeagueConfig(leagueKey);
  const sp = league.seasonSplit;
  const seasonsToLoad = [sp.warmup, sp.train]; // STOP AVANT OOS : jamais oos_dev/oos_final ici

  console.log(`=== Player Lab PRE-OOS : ${league.displayName} (league_id=${league.apiFootballId}) ===`);
  console.log(`Saisons chargees (splitFor): ${seasonsToLoad.map((s) => `${s}=${splitFor(s)}`).join(", ")} - OOS_DEV(${sp.oos_dev})/OOS_FINAL(${sp.oos_final}) NON charges.`);

  let allRows = [], allGoalEvents = [];
  let nFixturesTotal = 0, nFixturesCached = 0, nFixturesMissing = 0;
  const missingFixtureIds = [];
  const reconciliations = [];

  for (const season of seasonsToLoad) {
    const fixtures = loadFixturesMeta(leagueKey, season);
    for (const fx of fixtures) {
      nFixturesTotal++;
      if (!isCached("lineups", fx.fixture_id) || !isCached("players", fx.fixture_id) || !isCached("events", fx.fixture_id)) {
        nFixturesMissing++; missingFixtureIds.push(fx.fixture_id); continue;
      }
      nFixturesCached++;
      const lineupsRaw = readCached("lineups", fx.fixture_id).raw_payload;
      const playersRaw = readCached("players", fx.fixture_id).raw_payload;
      const eventsRaw = readCached("events", fx.fixture_id).raw_payload;
      const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: fx, lineupsRaw, playersRaw, sourceHashes: {} });
      allRows = allRows.concat(rows);
      const { goalEvents } = extractGoalEvents(fx, eventsRaw);
      allGoalEvents = allGoalEvents.concat(goalEvents.map((g) => ({ ...g, season })));
      if (rows.length) reconciliations.push(reconcileRegulatoryGoals(fx, goalEvents));
    }
  }

  console.log(`fixtures: total=${nFixturesTotal} cached=${nFixturesCached} missing=${nFixturesMissing}`);
  if (nFixturesMissing > 0) console.log(`ATTENTION : ${nFixturesMissing} fixtures non encore cachees (collecte en cours ?) - ignorees, jamais fabriquees. Exemples: ${missingFixtureIds.slice(0, 5).join(",")}`);
  if (!nFixturesCached) { console.error("Aucune fixture disponible - collecte requise avant de fitter."); process.exit(1); }

  const reconciled = reconciliations.filter((r) => r.match).length;
  console.log(`reconciliation but reglementaire (item goal reconciliation) : ${reconciled}/${reconciliations.length} = ${((reconciled / reconciliations.length) * 100).toFixed(2)}%`);

  const bySeasonSplit = {};
  for (const r of allRows) { const s = splitFor(r.season); bySeasonSplit[s] = (bySeasonSplit[s] || 0) + 1; }
  console.log(`rows_by_split=${JSON.stringify(bySeasonSplit)}`);

  console.log("\n=== Fit priors (TRAIN uniquement, via splitFor - fonction partagee inchangee) ===");
  const priors = fitAllPriorsFromTrain(allRows, allGoalEvents);
  console.log(`n_train_rows=${priors.n_train_rows} n_train_goal_events=${priors.n_train_goal_events}`);
  console.log("core_rate_priors=" + JSON.stringify([...priors.core_rate_priors.entries()]));
  console.log("own_goal_rate=" + JSON.stringify(priors.own_goal_rate));
  console.log("penalty_rate=" + JSON.stringify(priors.penalty_rate));

  // Anti-leakage : reconstruit l'historique d'un joueur pris au hasard
  // dans TRAIN strictement avant sa propre fixture - verifie que la
  // fixture CIBLE n'apparait jamais dans son propre historique (meme
  // fonction partagee que PL, tests deja existants la couvrent
  // generiquement - ce controle ici est un smoke-test sur les
  // donnees REELLES de cette ligue, pas un nouveau test unitaire).
  let antiLeakagePass = true, antiLeakageChecked = 0;
  const trainRowsForCheck = allRows.filter((r) => splitFor(r.season) === "TRAIN").slice(0, 200);
  for (const row of trainRowsForCheck) {
    const rowsForPlayer = allRows.filter((r) => r.player_id === row.player_id);
    const history = reconstructCumulativeHistoryBeforeCutoff(rowsForPlayer, row.kickoff);
    antiLeakageChecked++;
    if (history.some((h) => h.fixture_id === row.fixture_id)) { antiLeakagePass = false; break; }
  }
  console.log(`anti-leakage smoke-test : ${antiLeakageChecked} lignes verifiees, pass=${antiLeakagePass}`);

  // Determinisme : simulation identique a seed identique, sur un candidat
  // synthetique simple construit a partir des priors reels de CETTE ligue.
  const groupSample = [...priors.core_rate_priors.keys()][0] || "UNKNOWN";
  const corePrior = priors.core_rate_priors.get(groupSample);
  const core = posteriorCoreRate(0, 0, corePrior);
  const gammaParams = buildCandidateGammaParams(core, core.mean_rate_per_90);
  const candidates = [{ player_id: "smoke_test_player", gamma_alpha: gammaParams.alpha, gamma_beta: gammaParams.beta, presence_mass: 0.5 }];
  const teamGoalDist = teamGoalDistribution([[0.3, 0.2], [0.3, 0.2]], "HOME");
  const seed = crypto.createHash("sha256").update(`${leagueKey}|determinism-smoke-test`).digest().readUInt32BE(0);
  const sim1 = simulateAnytimeScorer(candidates, priors.own_goal_rate.own_goal_mass, teamGoalDist, 2000, seed);
  const sim2 = simulateAnytimeScorer(candidates, priors.own_goal_rate.own_goal_mass, teamGoalDist, 2000, seed);
  const determinismPass = JSON.stringify(sim1) === JSON.stringify(sim2);
  console.log(`determinisme (meme seed, 2000 tirages) : ${determinismPass ? "PASS" : "FAIL"}`);

  const result = {
    league_key: leagueKey, league_id: league.apiFootballId, generated_at: new Date().toISOString(),
    warmup_season: sp.warmup, train_season: sp.train,
    disclaimer: "PRE-OOS - seuls WARMUP et TRAIN sont charges. OOS_DEV/OOS_FINAL ni charges ni consultes.",
    fixtures: { total: nFixturesTotal, cached: nFixturesCached, missing: nFixturesMissing, missing_sample: missingFixtureIds.slice(0, 20) },
    goal_reconciliation_rate_pct: reconciliations.length ? (reconciled / reconciliations.length) * 100 : null,
    rows_by_split: bySeasonSplit,
    n_train_rows: priors.n_train_rows, n_train_goal_events: priors.n_train_goal_events,
    priors_candidate: {
      status: `PLAYER_SCORER_V1_AGGREGATED_SHARE_${leagueKey.toUpperCase()}_FITTED_UNVALIDATED`,
      core_rate_priors: [...priors.core_rate_priors.entries()],
      conversion_priors: [...priors.conversion_priors.entries()],
      exposure_priors: [...priors.exposure_priors.entries()],
      goal_timing_distribution: priors.goal_timing_distribution,
      own_goal_rate: priors.own_goal_rate,
      penalty_rate: priors.penalty_rate,
    },
    anti_leakage_smoke_test: { n_checked: antiLeakageChecked, pass: antiLeakagePass },
    determinism_smoke_test: { n_draws: 2000, pass: determinismPass },
  };

  const outDir = path.join(__dirname, "..", "data", "league-factory", leagueKey);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "player-lab-preoss.json"), JSON.stringify(result, null, 2));
  console.log(`\nEcrit: ${path.join(outDir, "player-lab-preoss.json")}`);
}

main();
