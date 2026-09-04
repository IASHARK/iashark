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

// Bug remonte par l'utilisateur le 04/09/2026 : "les tirs, pas cadres, tirs
// normal, elle existe pas la cote, elle doit etre a 1,01".
//
// Le flux contient deux familles de lignes sous le nom "Total Shots". Celles
// autour de 20 sont coherentes avec un match entier. Celles sous 12 ne
// peuvent pas designer le total de tirs d'un match de football : notre
// modele leur repond 100 %, alors que le bookmaker price "over 9.5" a 1.60,
// soit 62 %. Si les deux parlaient de la meme chose, cette cote serait a
// 1.01. Comparer les deux fabriquait un ecart de +40 points entierement faux.
test("parseOdds: les lignes de tirs du match trop basses pour un match entier sont ecartees", () => {
  const raw = bookmaker([
    { id: 211, name: "Total Shots", values: [
      { value: "Over 7.5", odd: "1.30" },
      { value: "Over 8.5", odd: "1.47" },
      { value: "Over 9.5", odd: "1.60" },
      { value: "Over 10.5", odd: "1.98" },
      { value: "Over 11.5", odd: "2.55" },
      { value: "Over 19.5", odd: "1.21" },
      { value: "Over 21.5", odd: "1.55" },
      { value: "Over 22.5", odd: "1.57" },
      { value: "Under 22.5", odd: "2.30" },
      { value: "Over 24.5", odd: "1.73" }
    ] },
    // Les tirs CADRES ne sont pas concernes : leurs lignes basses sont
    // coherentes avec un match entier et le modele s'accorde avec le marche.
    { id: 87, name: "Total ShotOnGoal", values: [
      { value: "Over 4.5", odd: "1.06" },
      { value: "Over 5.5", odd: "1.12" },
      { value: "Over 7.5", odd: "1.50" }
    ] }
  ]);
  const p = parseOdds(raw);
  const tirs = p.dynamic_count_offers.filter((o) => o.market === "total-shots");
  const cadres = p.dynamic_count_offers.filter((o) => o.market === "total-shots-on-target");

  assert.deepEqual(tirs.map((o) => o.line).sort((a, b) => a - b), [19.5, 21.5, 22.5, 22.5, 24.5],
    "les lignes de tirs du match sous 15.5 doivent disparaitre, les autres rester");
  for (const o of tirs) {
    assert.ok(o.line >= 15.5, `ligne ${o.line} conservee alors qu'elle est impossible sur un match entier`);
  }
  assert.deepEqual(cadres.map((o) => o.line).sort((a, b) => a - b), [4.5, 5.5, 7.5],
    "les tirs cadres ne doivent pas etre touches");
});

test("les totaux par equipe sont lus sous le nom REEL renvoye par l'API (Total - Home/Away)", () => {
  // Bug reel trouve le 02/09/2026 en comparant le code aux 29 snapshots de
  // cotes reellement enregistres : le parseur cherchait "Home Team Total
  // Goals" / "Away Team Total Goals", noms qu'API-Football ne renvoie
  // jamais. Ces deux marches n'ont donc jamais ete recuperes depuis la mise
  // en service, sans la moindre erreur visible.
  const cotes = { bookmakers: [{ name: "Bet365", bets: [
    { name: "Total - Home", values: [{ value: "Over 1.5", odd: "2.20" }, { value: "Under 1.5", odd: "1.65" }] },
    { name: "Total - Away", values: [{ value: "Over 1.5", odd: "2.50" }, { value: "Under 1.5", odd: "1.52" }] }
  ] }] };
  const r = parseOdds(cotes);
  assert.equal(String(r.home_over15), '2.20');
  assert.equal(String(r.home_under15), '1.65');
  assert.equal(String(r.away_over15), '2.50');
  assert.equal(String(r.away_under15), '1.52');
});

test("l'ancien nom reste accepte, pour ne rien casser si l'API le renvoyait un jour", () => {
  const cotes = { bookmakers: [{ name: "X", bets: [
    { name: "Home Team Total Goals", values: [{ value: "Over 1.5", odd: "2.10" }] }
  ] }] };
  assert.equal(String(parseOdds(cotes).home_over15), '2.10');
});
