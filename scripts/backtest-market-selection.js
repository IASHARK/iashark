#!/usr/bin/env node
"use strict";
// Banc d'essai de la REGLE DE CHOIX DU PARI sur les vraies cotes historiques
// (football-data.co.uk, 12 championnats, 2019-20 -> 2025-26) - 19/09/2026.
//
// Donnees (non versionnees, ~15 Mo) : un CSV par championnat et par saison,
// https://football-data.co.uk/mmz4281/<saison>/<code>.csv, enregistre sous
// <dossier>/<code>_<saison>.csv (codes E0 E1 SP1 I1 D1 F1 N1 P1 B1 T1 SC0 G1,
// saisons 1920 a 2526).
// Usage : node scripts/backtest-market-selection.js <dossier>
// Compare la regle d'avant (plus haute probabilite du modele, cote >= 1,50)
// a la regle de production lib/decision.js#pickMarketFair.
// Le moteur rejoue est celui de production : lib/engine.js#calcLambdas +
// calcFinalProbs (courbes de calibration branchees incluses), avec les memes
// taux regularises que update-data.yml (blendEarlySeasonRate, priors 1.35/1.10,
// saison precedente) et le facteur qualite de tir. Sans le melange xG (pas d'xG
// historique) : limite connue.
const fs = require("fs");
const path = require("path");
const REPO = path.join(__dirname, "..");
const { calcLambdas, calcFinalProbs } = require(REPO + "/lib/engine.js");
const { blendEarlySeasonRate } = require(REPO + "/lib/markets/early-season.js");
const DIR = process.argv[2];
if (!DIR || !fs.existsSync(DIR)) { console.error("Usage : node scripts/backtest-market-selection.js <dossier des CSV football-data>"); process.exit(1); }
const { pickMarketFair } = require(REPO + "/lib/decision.js");
const LEAGUE_API_ID = { E0: 39, E1: 40, SP1: 140, I1: 135, D1: 78, F1: 61, N1: 88, P1: 94, B1: 144, T1: 203, SC0: 179, G1: 197 };
const SEASONS = ["1920", "2021", "2122", "2223", "2324", "2425", "2526"];
const TUNE = new Set(["2021", "2122", "2223"]), TEST = new Set(["2324", "2425"]), LIVE = new Set(["2526"]);

function readCsv(file) {
  const txt = fs.readFileSync(file, "latin1").replace(/^﻿/, "");
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0].split(",");
  return lines.slice(1).map((l) => { const c = l.split(","); const o = {}; head.forEach((h, i) => (o[h] = c[i])); return o; })
    .filter((r) => r.HomeTeam && r.FTHG !== "" && r.FTHG != null);
}
const num = (v) => { const x = parseFloat(v); return Number.isFinite(x) ? x : null; };
function dateKey(r) { const [d, m, y] = r.Date.split("/"); const yy = y.length === 2 ? "20" + y : y; return `${yy}-${m}-${d} ${r.Time || "00:00"}`; }

// Stats par equipe et par lieu sur une saison complete (saison precedente).
function venueTotals(rows) {
  const t = {};
  const get = (k) => t[k] || (t[k] = { hF: 0, hA: 0, hN: 0, aF: 0, aA: 0, aN: 0 });
  rows.forEach((r) => {
    const h = get(r.HomeTeam), a = get(r.AwayTeam), gh = +r.FTHG, ga = +r.FTAG;
    h.hF += gh; h.hA += ga; h.hN++; a.aF += ga; a.aA += gh; a.aN++;
  });
  return t;
}
function devig(odds) {
  if (odds.some((o) => !(o > 1))) return null;
  const inv = odds.map((o) => 1 / o), s = inv.reduce((a, b) => a + b, 0);
  return inv.map((x) => x / s);
}

const matches = [];
for (const league of Object.keys(LEAGUE_API_ID)) {
  for (let si = 1; si < SEASONS.length; si++) {
    const season = SEASONS[si];
    const file = path.join(DIR, `${league}_${season}.csv`), prevFile = path.join(DIR, `${league}_${SEASONS[si - 1]}.csv`);
    if (!fs.existsSync(file)) continue;
    const rows = readCsv(file).map((r) => ({ ...r, key: dateKey(r) })).sort((a, b) => (a.key < b.key ? -1 : 1));
    const prev = fs.existsSync(prevFile) ? venueTotals(readCsv(prevFile)) : {};
    const cur = {}, shots = {};
    const get = (k) => cur[k] || (cur[k] = { hF: 0, hA: 0, hN: 0, aF: 0, aA: 0, aN: 0 });
    const sh = (k) => shots[k] || (shots[k] = []);
    for (const r of rows) {
      const H = r.HomeTeam, A = r.AwayTeam, h = get(H), a = get(A), pH = prev[H] || {}, pA = prev[A] || {};
      const rate = (ev, n, pev, pn, prior) => blendEarlySeasonRate({ current: { events: ev, matches: n }, previous: { events: pev || 0, matches: pn || 0 }, leaguePrior: { rate: prior, equivalentMatches: 6 } }).rate;
      const lam = calcLambdas(rate(h.hF, h.hN, pH.hF, pH.hN, 1.35), rate(h.hA, h.hN, pH.hA, pH.hN, 1.10), 1,
        rate(a.aF, a.aN, pA.aF, pA.aN, 1.10), rate(a.aA, a.aN, pA.aA, pA.aN, 1.35), 1, null, null, LEAGUE_API_ID[league]);
      // Facteur qualite de tir (update-data.yml#calcShotQualityFactor), 5 matchs mini.
      const sq = (list) => { if (list.length < 5) return 1; const on = list.reduce((s, x) => s + x.on, 0), tot = list.reduce((s, x) => s + x.tot, 0); return tot > 0 && on > 0 ? Math.max(0.85, Math.min(1.15, (on / tot) / 0.35)) : 1; };
      const lH = +(lam.lambdaH * sq(sh(H).slice(-10))).toFixed(3), lA = +(lam.lambdaA * sq(sh(A).slice(-10))).toFixed(3);
      const enough = h.hN + h.aN >= 3 && a.hN + a.aN >= 3; // debut de saison : le pipeline a la saison precedente
      const gh = +r.FTHG, ga = +r.FTAG;
      matches.push({ league, season, key: r.key, H, A, gh, ga, lH, lA, enough, r });
      h.hF += gh; h.hA += ga; h.hN++; a.aF += ga; a.aA += gh; a.aN++;
      const hs = num(r.HS), as = num(r.AS), hst = num(r.HST), ast = num(r.AST);
      if (hs != null && hst != null) sh(H).push({ on: hst, tot: hs });
      if (as != null && ast != null) sh(A).push({ on: ast, tot: as });
    }
  }
}

// Candidats cotes : 1X2, double chance (cote synthetique a partir du 1X2
// moyen), plus/moins de 2,5 buts. Probabilite modele = sortie de calcFinalProbs
// telle que le pipeline la met dans allMarketCandidates.
for (const m of matches) {
  const P = calcFinalProbs(m.lH, m.lA, null);
  const r = m.r;
  const avg1x2 = [num(r.AvgH), num(r.AvgD), num(r.AvgA)];
  const pin1x2 = [num(r.PSH), num(r.PSD), num(r.PSA)];
  const avgOU = [num(r["Avg>2.5"]), num(r["Avg<2.5"])], pinOU = [num(r["P>2.5"]), num(r["P<2.5"])];
  const mk1x2 = devig(pin1x2.every(Boolean) ? pin1x2 : avg1x2), mkOU = devig(pinOU.every(Boolean) ? pinOU : avgOU);
  const dcOdds = (a, b) => (a > 1 && b > 1 ? 1 / (1 / a + 1 / b) : null);
  const tot = m.gh + m.ga;
  const c = [];
  if (avg1x2.every(Boolean) && mk1x2) {
    const [oH, oD, oA] = avg1x2, [qH, qD, qA] = mk1x2;
    c.push({ id: "home-win", fam: "1X2", odds: oH, model: P.p1, market: qH * 100, win: m.gh > m.ga });
    c.push({ id: "draw", fam: "1X2", odds: oD, model: P.pN, market: qD * 100, win: m.gh === m.ga });
    c.push({ id: "away-win", fam: "1X2", odds: oA, model: P.p2, market: qA * 100, win: m.gh < m.ga });
    c.push({ id: "dc-1x", fam: "DC", odds: dcOdds(oH, oD), model: P.p1 + P.pN, market: (qH + qD) * 100, win: m.gh >= m.ga });
    c.push({ id: "dc-x2", fam: "DC", odds: dcOdds(oA, oD), model: P.p2 + P.pN, market: (qA + qD) * 100, win: m.gh <= m.ga });
    c.push({ id: "dc-12", fam: "DC", odds: dcOdds(oH, oA), model: P.derived.doubleChance.oneTwo * 100, market: (qH + qA) * 100, win: m.gh !== m.ga });
  }
  if (avgOU.every(Boolean) && mkOU) {
    c.push({ id: "over-25", fam: "O/U", odds: avgOU[0], model: P.over25, market: mkOU[0] * 100, win: tot > 2.5 });
    c.push({ id: "under-25", fam: "O/U", odds: avgOU[1], model: P.under25, market: mkOU[1] * 100, win: tot < 2.5 });
  }
  m.cands = c;
  delete m.r;
}

// ------------------------------------------------------------------ regles
function oldRule(c) {
  const pick = (lo) => { const ok = c.filter((x) => x.odds >= lo && x.model < 97); return ok.length ? ok.reduce((b, x) => (x.model > b.model ? x : b), ok[0]) : null; };
  return pick(1.5) || pick(1.01);
}
function newRule(c) {
  const by = Object.fromEntries(c.map((x) => [x.id, x]));
  const shin = by["home-win"] ? { p1: by["home-win"].market, pN: by["draw"].market, p2: by["away-win"].market } : null;
  const r = pickMarketFair(c.map((x) => ({ id: x.id, market: x.id, cote: x.odds, prob: x.model })), { shin });
  return r ? by[r.market.id] : null;
}
function evaluate(set, rule) {
  const a = { n: 0, win: 0, odds: 0, profit: 0, fam: {} };
  for (const m of matches) {
    if (!set.has(m.season) || !m.enough || !m.cands.length) continue;
    const p = rule(m.cands); if (!p) continue;
    a.n++; a.odds += p.odds; if (p.win) { a.win++; a.profit += p.odds - 1; } else a.profit -= 1;
    a.fam[p.id] = (a.fam[p.id] || 0) + 1;
  }
  return a;
}
const fmt = (a) => `n=${a.n} | gagnes ${(100 * a.win / a.n).toFixed(1)} % | cote moyenne ${(a.odds / a.n).toFixed(2)} | resultat ${(100 * a.profit / a.n).toFixed(1)} % des mises`;
const fam = (a) => Object.entries(a.fam).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} ${(100 * v / a.n).toFixed(0)} %`).join(", ");
for (const [label, set] of [["2020-21 a 2022-23", TUNE], ["2023-24 + 2024-25", TEST], ["2025-26", LIVE]]) {
  console.log("== " + label);
  for (const [name, rule] of [["avant (modele seul, cote >= 1,50)", oldRule], ["pickMarketFair (production)", newRule]]) {
    const a = evaluate(set, rule);
    console.log("  " + name.padEnd(36) + fmt(a));
    console.log("      familles : " + fam(a));
  }
}
