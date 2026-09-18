#!/usr/bin/env node
"use strict";
// Backtest hors echantillon du buteur AVANT composition (lib/insights.js#scorerModel),
// dans les conditions EXACTES de la page match : le module ne voit que les
// feuilles des 10 derniers matchs de championnat de chaque equipe (comme
// player_history), jamais la composition du match cible.
//
// Donnees : cache du labo joueurs (data/player-lab/raw, Premier League) et
// lambdas du moteur de score recalcules pas a pas dans le temps
// (lib/lab/walkforward-m2c-runner.js). Aucun appel reseau.
//
// Protocole (fixe AVANT de regarder la saison de verification) :
//   - 2022-23 : entrainement des moyennes par poste (priors) ;
//   - 2023-24 : reglage (poids des tirs cadres, echelle de calibration) ;
//   - 2024-25 : verification, un seul passage, parametres geles.
// Compare a la methode en production jusqu'au 18/09/2026 (replique de
// lib/match-view-model.js#scoringThreatRanking + withScoringProbability).
//
// Usage : node scripts/backtest-prelineup-scorer.js
//   BT_NO_FIRST=1 : sans la regle « recrue » (matchs avant la premiere feuille
//   d un joueur comptes comme non titulaire), pour comparaison.

const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const R = (p) => path.join(ROOT, p);
const { readCached, isCached } = require(R("lib/player-lab/raw-cache.js"));
const { buildPlayerMatchRowsForFixture } = require(R("lib/player-lab/build-player-match-table.js"));
const { extractGoalEvents } = require(R("lib/player-lab/goal-events.js"));
const { loadRealDataset } = require(R("lib/lab/load-real-dataset.js"));
const { runWalkForwardM2C } = require(R("lib/lab/walkforward-m2c-runner.js"));
const SM = require(R("lib/insights.js")).scorerModel;

const TRAIN = 2022, TUNE = 2023, CHECK = 2024;
const ts = (x) => new Date(x).getTime();

// ---------------------------------------------------------------- donnees
const fixtures = new Map(), rowsByFixture = new Map(), scorersByFixture = new Map(), teamFixtures = new Map();
for (const season of [2021, 2022, 2023, 2024]) {
  const file = R(`data/gate-b1/premier-league-${season}.json`);
  if (!fs.existsSync(file)) continue;
  for (const fx0 of JSON.parse(fs.readFileSync(file, "utf8"))) {
    const fx = { ...fx0, season };
    if (!isCached("lineups", fx.fixture_id) || !isCached("players", fx.fixture_id) || !isCached("events", fx.fixture_id)) continue;
    const { rows } = buildPlayerMatchRowsForFixture({ fixtureMeta: fx, lineupsRaw: readCached("lineups", fx.fixture_id).raw_payload, playersRaw: readCached("players", fx.fixture_id).raw_payload, sourceHashes: {} });
    if (!rows.length) continue;
    const { goalEvents } = extractGoalEvents(fx, readCached("events", fx.fixture_id).raw_payload);
    const gH = fx.goals_home_90 != null ? fx.goals_home_90 : fx.goals_home_final;
    const gA = fx.goals_away_90 != null ? fx.goals_away_90 : fx.goals_away_final;
    // Format player_history de la page match.
    const hist = rows.map((r) => ({
      fixture_id: r.fixture_id, date: r.kickoff, player_id: r.player_id, team_id: r.team_id, name: r.player_name,
      position: r.position, minutes: r.played ? r.minutes : null, starter: r.lineup_role === "STARTER",
      goals: r.goals, shots_on: r.shots_on_target, team_goals: r.team_id === fx.home_team_id ? gH : gA,
    }));
    fixtures.set(fx.fixture_id, fx);
    rowsByFixture.set(fx.fixture_id, { raw: rows, hist });
    scorersByFixture.set(fx.fixture_id, new Set(goalEvents.filter((g) => !g.own_goal_flag && g.player_id != null).map((g) => g.player_id)));
    for (const t of [fx.home_team_id, fx.away_team_id]) { if (!teamFixtures.has(t)) teamFixtures.set(t, []); teamFixtures.get(t).push(fx); }
  }
}
for (const l of teamFixtures.values()) l.sort((a, b) => ts(a.kickoff_timestamp) - ts(b.kickoff_timestamp));

// Lambdas du moteur (pas a pas dans le temps, jamais le futur).
const dataset = loadRealDataset();
const prev = new Map();
for (const s of dataset.oosSeasons) prev.set(s, dataset.allFixtures.filter((f) => f.season === s - 1));
const lambdas = new Map(runWalkForwardM2C({ ...dataset, previousSeasonFixturesBySeasons: prev }).predictions
  .filter((p) => p.m0_valid).map((p) => [p.fixture_id, { home: p.lambdaH_m2, away: p.lambdaA_m2 }]));

// ------------------------------------------------- priors (entrainement)
function fitPriors(season) {
  const t = {};
  for (const [fid, fx] of fixtures) {
    if (fx.season !== season) continue;
    const hist = rowsByFixture.get(fid).hist;
    const shotsKnown = new Set(hist.filter((r) => r.shots_on != null).map((r) => r.team_id));
    for (const r0 of hist) {
      // null = 0 tir cadre quand l'equipe a des tirs renseignes (meme regle que le module).
      const r = r0.shots_on == null && shotsKnown.has(r0.team_id) ? { ...r0, shots_on: 0 } : r0;
      const g = SM.group(r.position); if (g === "G" || !(r.minutes > 0)) continue;
      const a = t[g] || (t[g] = { m: 0, goals: 0, sot: 0, mSot: 0, st: 0, stMin: 0, sub: 0, subMin: 0 });
      a.m += r.minutes; a.goals += r.goals || 0;
      if (r.shots_on != null) { a.sot += r.shots_on; a.mSot += r.minutes; }
      if (r.starter) { a.st++; a.stMin += r.minutes; } else { a.sub++; a.subMin += r.minutes; }
    }
  }
  const out = {};
  for (const [g, a] of Object.entries(t)) {
    out[g] = { goals90: a.goals / (a.m / 90), sot90: a.sot / (a.mSot / 90), conversion: a.sot ? a.goals / a.sot : 0.3, minStart: a.stMin / a.st, minSub: a.subMin / a.sub };
  }
  return out;
}

// ------------------------------------------------- production (replique)
function prodPick(histRows, fx) {
  const players = [];
  let pooledGoals = 0, pooledSot = 0;
  for (const team of [fx.home_team_id, fx.away_team_id]) {
    const rowsT = histRows.filter((r) => r.team_id === team);
    const cur = rowsT.filter((r) => r.season === fx.season);
    const rowsP = cur.length ? cur : rowsT;
    const g = new Map();
    for (const r of rowsP) { if (!g.has(r.player_id)) g.set(r.player_id, []); g.get(r.player_id).push(r); }
    for (const [pid, list] of g) {
      const recent = list.slice(0, 10), last5 = recent.slice(0, 5);
      const minutes = recent.reduce((s, r) => s + (r.minutes || 0), 0);
      const apps = recent.filter((r) => r.minutes > 0).length; if (!apps) continue;
      const goals = recent.reduce((s, r) => s + (r.goals || 0), 0), sot = recent.reduce((s, r) => s + (r.shots_on || 0), 0);
      pooledGoals += goals; pooledSot += sot;
      const r1 = (v) => Math.round(v * 10) / 10;
      players.push({ pid, minutes, goals90: minutes ? r1(goals * 90 / minutes) : 0, shotsOn90: minutes ? r1(sot * 90 / minutes) : 0, apps, minutesRecent: last5.reduce((s, r) => s + (r.minutes || 0), 0) });
    }
  }
  const conv = pooledSot >= 20 && pooledGoals / pooledSot > 0.05 && pooledGoals / pooledSot < 0.6 ? pooledGoals / pooledSot : 0.30;
  const elig = players.filter((p) => p.goals90 > 0 || p.shotsOn90 > 0);
  let pool = elig.filter((p) => p.minutes >= 45); if (!pool.length) pool = elig;
  const score = (p) => (0.65 * p.shotsOn90 * conv + 0.35 * p.goals90) * (p.minutes / (p.minutes + 180));
  pool.sort((a, b) => score(b) - score(a) || b.minutes - a.minutes);
  return pool[0] || null;
}

// ------------------------------------------------------------- evaluation
function evaluate(season, params) {
  const acc = { n: 0, hit: 0, started: 0, prodHit: 0, prodStarted: 0, naiveHit: 0, rows: 0, brier: 0, ll: 0, sumP: 0, sumY: 0, bins: Array.from({ length: 10 }, () => ({ n: 0, p: 0, y: 0 })), noPick: 0 };
  const clip = (p) => Math.min(1 - 1e-4, Math.max(1e-4, p));
  for (const [fid, fx] of fixtures) {
    if (fx.season !== season) continue;
    const lam = lambdas.get(fid); if (!lam) continue;
    const T = ts(fx.kickoff_timestamp);
    const input = {}; const histAll = [];
    let ok = true;
    for (const [side, team] of [["home", fx.home_team_id], ["away", fx.away_team_id]]) {
      const past = teamFixtures.get(team).filter((f) => ts(f.kickoff_timestamp) < T).slice(-10).reverse();
      if (past.length < 3) { ok = false; break; }
      const rows = [];
      for (const f of past) for (const r of rowsByFixture.get(f.fixture_id).hist) if (r.team_id === team) rows.push({ ...r, season: f.season });
      histAll.push(...rows);
      input[side] = { rows, teamId: team, lambda: lam[side] };
    }
    if (!ok) continue;
    const scorers = scorersByFixture.get(fid);
    const starters = new Set(rowsByFixture.get(fid).raw.filter((r) => r.lineup_role === "STARTER").map((r) => r.player_id));
    const res = SM.rankMatch(input, params);
    acc.n++;
    if (res.pick) { if (scorers.has(res.pick.id)) acc.hit++; if (starters.has(res.pick.id)) acc.started++; } else acc.noPick++;
    const pp = prodPick(histAll, fx);
    if (pp) { if (scorers.has(pp.pid)) acc.prodHit++; if (starters.has(pp.pid)) acc.prodStarted++; }
    // Naif : le plus de buts sur les 10 derniers matchs.
    const gm = new Map(); for (const r of histAll) gm.set(r.player_id, (gm.get(r.player_id) || 0) + (r.goals || 0));
    const naive = [...gm.entries()].sort((a, b) => b[1] - a[1])[0]; if (naive && scorers.has(naive[0])) acc.naiveHit++;
    for (const c of res.all) {
      const y = scorers.has(c.id) ? 1 : 0, p = c.probability;
      acc.rows++; acc.brier += (p - y) ** 2; acc.ll += y ? -Math.log(clip(p)) : -Math.log(1 - clip(p)); acc.sumP += p; acc.sumY += y;
      const b = acc.bins[Math.min(9, Math.floor(p * 10))]; b.n++; b.p += p; b.y += y;
    }
  }
  return acc;
}
function withParams(over) {
  const p = { ...SM.PARAMS, ...over, priors: over.priors || SM.PARAMS.priors, startSmoothing: SM.PARAMS.startSmoothing };
  if (process.env.BT_NO_FIRST === "1") p.startSinceFirstAppearance = false;
  return p;
}

const priors = fitPriors(TRAIN);
const r3 = (x) => Math.round(x * 1000) / 1000;
for (const g of Object.keys(priors)) for (const k of Object.keys(priors[g])) priors[g][k] = r3(priors[g][k]);

// Reglage sur 2023-24 : poids des tirs cadres puis echelle de calibration.
// Egalite (ecart de log-loss < 0,0002) : on garde le plus petit poids des
// tirs, pour que les buts reellement marques (penalties, finition) comptent
// encore (18/09/2026 : 0,75 -> 0,17274, 1 -> 0,17271).
const grid = [];
for (const shotsWeight of [0, 0.25, 0.5, 0.75, 1]) {
  for (const calibration of [0.6, 0.7, 0.75, 0.8, 0.85, 0.9, 1, 1.1]) {
    const a = evaluate(TUNE, withParams({ priors, shotsWeight, calibration }));
    grid.push({ shotsWeight, calibration, ll: a.ll / a.rows, a });
  }
}
const bestLl = Math.min(...grid.map((g) => g.ll));
const best = grid.filter((g) => g.ll <= bestLl + 0.0002).sort((x, y) => x.shotsWeight - y.shotsWeight || x.ll - y.ll)[0];
const frozen = withParams({ priors, shotsWeight: best.shotsWeight, calibration: best.calibration });
const tune = best.a, check = evaluate(CHECK, frozen);

function report(label, a) {
  const pc = (x) => (100 * x / a.n).toFixed(1) + " %";
  return {
    saison: label, matchs: a.n,
    buteur_choisi_a_marque: { nouveau: pc(a.hit), production_actuelle: pc(a.prodHit), plus_de_buts_sur_10: pc(a.naiveHit) },
    buteur_choisi_titulaire: { nouveau: pc(a.started), production_actuelle: pc(a.prodStarted) },
    matchs_sans_choix: a.noPick,
    brier: r3(1000 * a.brier / a.rows) / 1000, log_loss: r3(a.ll / a.rows),
    proba_moyenne_vs_frequence_reelle: (100 * a.sumP / a.rows).toFixed(2) + " % / " + (100 * a.sumY / a.rows).toFixed(2) + " %",
    calibration_par_tranche: a.bins.filter((b) => b.n).map((b) => `${(100 * b.p / b.n).toFixed(0)}% annonces -> ${(100 * b.y / b.n).toFixed(0)}% reels (n=${b.n})`),
  };
}
const out = {
  protocole: "priors 2022-23, reglage 2023-24, verification 2024-25 (parametres geles)",
  parametres_retenus: { shotsWeight: best.shotsWeight, calibration: best.calibration, priors },
  reglage_2023_24: report("2023-24", tune),
  verification_2024_25: report("2024-25", check),
};
console.log(JSON.stringify(out, null, 2));
