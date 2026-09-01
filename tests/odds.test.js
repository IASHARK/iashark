"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseOdds } = require("../lib/odds.js");

function bookmaker(bets) {
  return { bookmakers: [{ bets }] };
}

test("parseOdds: aucune donnee -> toutes les cotes a '--'", () => {
  const p = parseOdds(null);
  assert.equal(p.c1, "--");
  assert.equal(p.co25, "--");
  assert.equal(p.btts_oui, "--");
});

test("parseOdds: 1X2 simple, un seul bookmaker -> mediane = la cote elle-meme", () => {
  const raw = bookmaker([
    { name: "Match Winner", values: [{ value: "Home", odd: "1.80" }, { value: "Draw", odd: "3.50" }, { value: "Away", odd: "4.20" }] },
  ]);
  const p = parseOdds(raw);
  assert.equal(p.c1, "1.80");
  assert.equal(p.cn, "3.50");
  assert.equal(p.c2, "4.20");
});

test("parseOdds: plusieurs bookmakers -> mediane, pas moyenne", () => {
  const raw = {
    bookmakers: [
      { bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "1.50" }] }] },
      { bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "2.00" }] }] },
      { bets: [{ name: "Match Winner", values: [{ value: "Home", odd: "9.00" }] }] },
    ],
  };
  const p = parseOdds(raw);
  assert.equal(p.c1, "2.00", "la mediane de [1.50,2.00,9.00] est 2.00, pas la moyenne 4.17");
});

test("parseOdds: cotes hors plage [1.05, 15] sont ignorees (anti-anomalie bookmaker)", () => {
  const raw = bookmaker([{ name: "Match Winner", values: [{ value: "Home", odd: "1.01" }] }]);
  const p = parseOdds(raw);
  assert.equal(p.c1, "--", "une cote 1.01 (hors plage) ne doit jamais devenir LA cote retenue");
});

test("parseOdds: Over/Under 2.5, BTTS, Double Chance", () => {
  const raw = bookmaker([
    { name: "Goals Over/Under", values: [{ value: "Over 2.5", odd: "1.90" }, { value: "Under 2.5", odd: "1.85" }] },
    { name: "Both Teams Score", values: [{ value: "Yes", odd: "1.70" }, { value: "No", odd: "2.05" }] },
    { name: "Double Chance", values: [{ value: "Home/Draw", odd: "1.20" }, { value: "Draw/Away", odd: "1.40" }] },
  ]);
  const p = parseOdds(raw);
  assert.equal(p.co25, "1.90");
  assert.equal(p.cu25, "1.85");
  assert.equal(p.btts_oui, "1.70");
  assert.equal(p.btts_non, "2.05");
  assert.equal(p.dc1x, "1.20");
  assert.equal(p.dc2x, "1.40");
});

test("parseOdds: bookmakers vide -> pas de crash, retourne l'objet vide", () => {
  const p = parseOdds({ bookmakers: [] });
  assert.equal(p.c1, "--");
});

test("parseOdds: expose les cotes reelles des totaux equipe, win-to-nil et resultat+total", () => {
  const raw = bookmaker([
    { name: "Home Team Total Goals", values: [{ value: "Over 1.5", odd: "1.72" }, { value: "Under 1.5", odd: "2.05" }] },
    { name: "Away Team Total Goals", values: [{ value: "Over 1.5", odd: "2.30" }] },
    { name: "Win to Nil - Home", values: [{ value: "Yes", odd: "2.80" }] },
    { name: "Result/Total Goals", values: [{ value: "Home/Over 2.5", odd: "2.12" }, { value: "Away/Under 3.5", odd: "4.40" }] },
  ]);
  const p = parseOdds(raw);
  assert.equal(p.home_over15, "1.72");
  assert.equal(p.home_under15, "2.05");
  assert.equal(p.away_over15, "2.30");
  assert.equal(p.home_win_to_nil, "2.80");
  assert.equal(p.home_win_over25, "2.12");
  assert.equal(p.away_win_under35, "4.40");
});

test("parseOdds: expose les cotes reelles Clean Sheet - Home/Away (bet_id 27/28, confirmes chez les bookmakers)", () => {
  const raw = bookmaker([
    { name: "Clean Sheet - Home", values: [{ value: "Yes", odd: "2.45" }, { value: "No", odd: "1.55" }] },
    { name: "Clean Sheet - Away", values: [{ value: "Yes", odd: "3.60" }] },
  ]);
  const p = parseOdds(raw);
  assert.equal(p.home_clean_sheet, "2.45");
  assert.equal(p.away_clean_sheet, "3.60");
});

test("parseOdds: normalise les lignes premiere mi-temps et tirs sans ligne codee en dur", () => {
  const raw = bookmaker([
    { id: 6, name: "Goals Over/Under First Half", values: [{ value: "Over 0.5", odd: "1.61" }, { value: "Under 1.5", odd: "1.74" }] },
    { id: 211, name: "Total Shots", values: [{ value: "Over 23.5", odd: "1.83" }, { value: "Under 23.5", odd: "1.91" }] },
    { id: 87, name: "Total ShotOnGoal", values: [{ value: "Over 8.5", odd: "1.88" }] },
    { id: 32, name: "Win Both Halves", values: [{ value: "Home", odd: "3.40" }, { value: "Away", odd: "7.00" }] },
  ]);
  const p = parseOdds(raw);
  assert.equal(p.fh_over05, "1.61");
  assert.equal(p.fh_under15, "1.74");
  assert.equal(p.home_win_both_halves, "3.40");
  assert.equal(p.away_win_both_halves, "7.00");
  assert.deepEqual(p.dynamic_count_offers, [
    { market: "total-shots", side: "over", line: 23.5, odds: 1.83 },
    { market: "total-shots", side: "under", line: 23.5, odds: 1.91 },
    { market: "total-shots-on-target", side: "over", line: 8.5, odds: 1.88 },
  ]);
});
