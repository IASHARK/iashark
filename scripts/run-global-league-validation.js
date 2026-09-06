#!/usr/bin/env node
"use strict";
// GLOBAL_LEAGUE_VALIDATION_RUN (2026-09-06). Enchaine
// scripts/run-full-league-oos-pipeline.js (la factory DEJA PROUVEE, sur
// La Liga puis Bundesliga/Serie A/Ligue 1/Eredivisie/Primeira Liga) sur
// TOUTES les ligues PLAYER_DATA_GATE=PASS de config/league-expansion.json,
// SEQUENTIELLEMENT (jamais en parallele - protege le quota API), en
// SAUTANT toute ligue deja completement traitee (registry deja rempli),
// et en marquant BLOCKED_RUNTIME_<RAISON> + en CONTINUANT sur la
// suivante si une ligue echoue (jamais d'arret de toute la vague, jamais
// une reponse partielle traitee comme complete - voir la modification
// de scripts/collect-league-player-lab.js : exit code 2 si la collecte
// s'est arretee avant la fin, jamais un exit 0 trompeur).
//
// Usage : node scripts/run-global-league-validation.js [--limit=N]

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { loadRegistry, updateLeagueEntry } = require("../lib/league-factory/registry.js");

function parseArgs() {
  const args = {};
  for (const a of process.argv.slice(2)) { const m = a.match(/^--([^=]+)=(.*)$/); if (m) args[m[1]] = m[2]; }
  return args;
}

const TERMINAL_STATUSES = new Set(["VALIDATED", "INCONCLUSIVE", "REJECTED"]);

function isAlreadyFullyProcessed(registry, key) {
  const entry = registry.leagues[key];
  if (!entry) return false;
  return TERMINAL_STATUSES.has(entry.score_status) && TERMINAL_STATUSES.has(entry.player_status);
}

function classifyFailureReason(err) {
  const status = err.status;
  const tail = ((err.stderr && err.stderr.toString()) || (err.stdout && err.stdout.toString()) || err.message || "").slice(-500);
  if (status === 2) return "BLOCKED_RUNTIME_INCOMPLETE_COLLECTION_QUOTA_OR_RATELIMIT";
  if (/APISPORTS_KEY/i.test(tail)) return "BLOCKED_RUNTIME_MISSING_API_KEY";
  if (/no FT fixtures|aucune fixture/i.test(tail)) return "BLOCKED_RUNTIME_NO_FIXTURES";
  return "BLOCKED_RUNTIME_UNKNOWN_ERROR";
}

function estimateApiCalls(leagueKey, sp) {
  // Estimation ANALYTIQUE (pas un compteur temps-reel) : 4 appels fixtures
  // (1/saison, page unique la plupart du temps) + fixtures*3 endpoints
  // (lineups/players/events) sur les 4 saisons, en lisant les VRAIS
  // comptes de fixtures deja collectes pour cette ligue.
  let total = 4; // fixtures-list, 1 par saison (peut etre >1 si pagination, ignore ici - diagnostic seulement)
  for (const season of [sp.warmup, sp.train, sp.oos_dev, sp.oos_final]) {
    const p = path.join(__dirname, "..", "data", "gate-b1", `${leagueKey}-${season}.json`);
    if (fs.existsSync(p)) { const fixtures = JSON.parse(fs.readFileSync(p, "utf8")); total += fixtures.length * 3; }
  }
  return total;
}

function main() {
  const args = parseArgs();
  const limit = args.limit ? parseInt(args.limit, 10) : Infinity;
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "config", "league-expansion.json"), "utf8"));
  const passLeagues = config.leagues.filter((l) => l.player_data_gate_audit === "PASS").sort((a, b) => (a.wave_order || 0) - (b.wave_order || 0));

  const registry = loadRegistry();
  const toProcess = passLeagues.filter((l) => !isAlreadyFullyProcessed(registry, l.key));
  const alreadyDone = passLeagues.filter((l) => isAlreadyFullyProcessed(registry, l.key));

  console.log(`########## GLOBAL_LEAGUE_VALIDATION_RUN ##########`);
  console.log(`Total ligues PASS=${passLeagues.length} deja traitees=${alreadyDone.length} (${alreadyDone.map((l) => l.key).join(", ")}) a traiter=${toProcess.length}`);
  console.log(`Ordre (wave_order) : ${toProcess.map((l) => l.key).join(", ")}`);

  const results = [];
  let processed = 0;
  for (const league of toProcess) {
    if (processed >= limit) { console.log(`\nLimite --limit=${limit} atteinte - arret propre a la frontiere d'une ligue, reprise possible au prochain lancement.`); break; }
    processed++;
    const t0 = Date.now();
    console.log(`\n\n================ [${processed}/${toProcess.length}] ${league.displayName} (${league.key}, id=${league.apiFootballId}) ================`);
    try {
      execFileSync("node", [path.join(__dirname, "run-full-league-oos-pipeline.js"), `--league-key=${league.key}`], { stdio: "inherit" });
      const updated = loadRegistry().leagues[league.key];
      const apiCalls = estimateApiCalls(league.key, league.seasonSplit);
      results.push({ key: league.key, name: league.displayName, status: "PROCESSED", score_status: updated.score_status, player_status: updated.player_status, live_eligible: updated.live_eligible, score_champion: updated.score_champion, player_champion: updated.player_champion, api_calls_estimate: apiCalls, elapsed_min: +((Date.now() - t0) / 60000).toFixed(1) });
    } catch (err) {
      const reason = classifyFailureReason(err);
      console.error(`\n!!! ECHEC ${league.displayName} (${league.key}) : ${reason} - marquage BLOCKED_RUNTIME, passage a la ligue suivante (la vague continue). !!!`);
      updateLeagueEntry(league.key, {
        league_key: league.key, league_id: league.apiFootballId, calendar_type: league.calendarType,
        score_status: reason, player_status: reason, score_runnable: false, player_runnable: false, live_eligible: false,
        market_status: "NOT_ASSESSED_THIS_PASS",
        note: `Echec runtime lors du run global : ${reason}. Reprise possible en relancant scripts/run-global-league-validation.js (idempotent - le cache deja ecrit n'est jamais rappele).`,
      });
      results.push({ key: league.key, name: league.displayName, status: "BLOCKED", reason, elapsed_min: +((Date.now() - t0) / 60000).toFixed(1) });
    }
  }

  console.log("\n\n########## GLOBAL_LEAGUE_VALIDATION_RUN - RESUME ##########");
  console.log(JSON.stringify(results, null, 2));

  const outPath = path.join(__dirname, "..", "data", "league-factory", "global-validation-run-summary.json");
  const existing = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, "utf8")) : { runs: [] };
  existing.runs.push({ generated_at: new Date().toISOString(), results });
  fs.writeFileSync(outPath, JSON.stringify(existing, null, 2));
  console.log(`\nEcrit: ${outPath}`);
}

main();
