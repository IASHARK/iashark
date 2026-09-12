"use strict";
// Exporte le DETAIL match par match du backtest offline (voir
// scripts/backtest-current-engine-offline.js pour la methodologie complete
// et les statistiques agregees - CE script-ci ne fait AUCUN calcul de
// calibration lui-meme, il reutilise exactement le meme moteur/replay pour
// produire une liste lisible : un match, un pronostic (l'issue 1X2 la plus
// probable selon le moteur), le resultat reel, correct ou non.
//
// Ne remplace PAS predictions_archive (Supabase) : ceci est un test
// retroactif execute aujourd'hui sur des matchs passes, pas des paris pris
// en direct a l'epoque. Le fichier de sortie porte cette distinction dans
// son propre champ "kind":"backtest_replay" pour qu'aucun affichage ne le
// confonde silencieusement avec une vraie prediction historique.
//
// Usage : node scripts/export-backtest-matches.js [--out=data/backtest-matches.json]

const fs = require("fs");
const path = require("path");

const { computeM0Lambdas } = require("../lib/data/production-replay.js");
const { calcFinalProbs } = require("../lib/engine.js");
const LEAGUES_CONFIG = require("../config/leagues.json");

const REPO_ROOT = path.join(__dirname, "..");
const GATE_B1_DIR = path.join(REPO_ROOT, "data", "gate-b1");

// Identique a scripts/backtest-current-engine-offline.js (memes 5 ligues
// deja en ligne, meme mapping cle config -> prefixe fichier).
const TARGET_LEAGUES = [
  { configKey: "premier", fileBase: "premier-league", displayName: "Premier League" },
  { configKey: "laliga", fileBase: "laliga", displayName: "La Liga" },
  { configKey: "bundesliga", fileBase: "bundesliga", displayName: "Bundesliga" },
  { configKey: "ligue1", fileBase: "ligue1", displayName: "Ligue 1" },
  { configKey: "seriea", fileBase: "seriea", displayName: "Serie A" },
];
const SEASONS = [2021, 2022, 2023, 2024, 2025];
const MIN_MATCHES_PLAYED = 8; // identique au backtest de calibration

function parseArgs(argv) {
  const out = { outFile: path.join(REPO_ROOT, "backtest-matches.json") };
  for (const a of argv) {
    const of = /^--out=(.+)$/.exec(a);
    if (of) out.outFile = path.isAbsolute(of[1]) ? of[1] : path.join(process.cwd(), of[1]);
  }
  return out;
}

function isEvaluable(f) {
  return f.status === "FINISHED" && f.goals_home_90 != null && f.goals_away_90 != null;
}

function loadLeagueFixtures(fileBase) {
  const all = [];
  for (const season of SEASONS) {
    const p = path.join(GATE_B1_DIR, `${fileBase}-${season}.json`);
    if (!fs.existsSync(p)) continue;
    const data = JSON.parse(fs.readFileSync(p, "utf8"));
    for (const f of data) all.push(f);
  }
  return all;
}

function topOutcome1x2(finalProbs) {
  const entries = [
    { key: "HOME", prob: finalProbs.p1 },
    { key: "DRAW", prob: finalProbs.pN },
    { key: "AWAY", prob: finalProbs.p2 },
  ];
  entries.sort((a, b) => b.prob - a.prob);
  return entries[0];
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const matches = [];

  for (const target of TARGET_LEAGUES) {
    const leagueConfig = (LEAGUES_CONFIG.leagues || []).find((l) => l.key === target.configKey);
    if (!leagueConfig) throw new Error(`League config introuvable pour key=${target.configKey}`);
    const leagueId = leagueConfig.apiFootballId;
    const allFixtures = loadLeagueFixtures(target.fileBase);

    for (const season of SEASONS) {
      const seasonFixtures = allFixtures.filter((f) => f.season === season);
      if (!seasonFixtures.length) continue;
      const chronological = seasonFixtures.slice().sort((a, b) => new Date(a.kickoff_timestamp).getTime() - new Date(b.kickoff_timestamp).getTime());

      for (const f of chronological) {
        if (!isEvaluable(f)) continue;

        const m0 = computeM0Lambdas({
          allFixtures,
          season,
          homeTeamId: f.home_team_id,
          awayTeamId: f.away_team_id,
          cutoff: f.kickoff_timestamp,
          leagueAvgH: null,
          leagueAvgA: null,
          leagueId,
          seasonFixtures,
        });
        if (!m0.valid) continue;
        if (m0.homeState.playedTotal < MIN_MATCHES_PLAYED || m0.awayState.playedTotal < MIN_MATCHES_PLAYED) continue;

        const finalProbs = calcFinalProbs(m0.lambdas.lambdaH, m0.lambdas.lambdaA, null);
        const pick = topOutcome1x2(finalProbs);

        const isHome = f.goals_home_90 > f.goals_away_90;
        const isDraw = f.goals_home_90 === f.goals_away_90;
        const actualOutcome = isHome ? "HOME" : isDraw ? "DRAW" : "AWAY";

        matches.push({
          kind: "backtest_replay",
          fixture_id: f.fixture_id,
          league: target.configKey,
          league_display: target.displayName,
          season,
          kickoff: f.kickoff_timestamp,
          home_team: f.home_team_name,
          away_team: f.away_team_name,
          score: `${f.goals_home_90}-${f.goals_away_90}`,
          pick_outcome: pick.key,
          pick_probability_pct: Math.round(pick.prob * 10) / 10,
          actual_outcome: actualOutcome,
          correct: pick.key === actualOutcome,
        });
      }
    }
  }

  matches.sort((a, b) => new Date(b.kickoff).getTime() - new Date(a.kickoff).getTime());

  const correct = matches.filter((m) => m.correct).length;
  const output = {
    kind: "backtest_replay",
    generated_at: new Date().toISOString(),
    disclaimer:
      "Rejeu retroactif du moteur actuel (recalibre) sur des matchs deja termines - calcule aujourd'hui, jamais un pari pris en direct a l'epoque. Voir CURRENT_ENGINE_CALIBRATION_REPORT.md et ENGINE_RECALIBRATION_REPORT.md pour la methodologie complete (anti-leakage, warmup, limites).",
    total_matches: matches.length,
    correct_picks: correct,
    accuracy_pct: matches.length ? Math.round((correct / matches.length) * 1000) / 10 : null,
    matches,
  };

  fs.mkdirSync(path.dirname(options.outFile), { recursive: true });
  fs.writeFileSync(options.outFile, JSON.stringify(output), "utf8");

  console.log(JSON.stringify({ total_matches: matches.length, correct_picks: correct, accuracy_pct: output.accuracy_pct, out: options.outFile }, null, 2));
}

main();
