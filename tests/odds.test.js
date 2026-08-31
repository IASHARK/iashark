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

test("parseOdds: Clean Sheet - Home/Away (deux bets separes, valeur 'Yes' retenue)", () => {
  const raw = bookmaker([
    { name: "Clean Sheet - Home", values: [{ value: "Yes", odd: "6.50" }, { value: "No", odd: "1.11" }] },
    { name: "Clean Sheet - Away", values: [{ value: "Yes", odd: "2.00" }, { value: "No", odd: "1.73" }] },
  ]);
  const p = parseOdds(raw);
  assert.equal(p.cs_home, "6.50");
  assert.equal(p.cs_away, "2.00");
});

test("parseOdds: Win To Nil (un seul bet, valeurs Home/Away)", () => {
  const raw = bookmaker([{ name: "Win To Nil", values: [{ value: "Home", odd: "10.00" }, { value: "Away", odd: "2.40" }] }]);
  const p = parseOdds(raw);
  assert.equal(p.wtn_home, "10.00");
  assert.equal(p.wtn_away, "2.40");
});

test("parseOdds: Total - Home/Away (lignes 0.5/1.5/2.5/3.5, comme les vraies cotes API-Football)", () => {
  const raw = bookmaker([
    { name: "Total - Home", values: [{ value: "Over 1.5", odd: "4.50" }, { value: "Under 1.5", odd: "1.18" }, { value: "Over 0.5", odd: "1.73" }] },
    { name: "Total - Away", values: [{ value: "Over 2.5", odd: "2.75" }, { value: "Under 2.5", odd: "1.40" }] },
  ]);
  const p = parseOdds(raw);
  assert.equal(p.th_o15, "4.50");
  assert.equal(p.th_u15, "1.18");
  assert.equal(p.th_o05, "1.73");
  assert.equal(p.ta_o25, "2.75");
  assert.equal(p.ta_u25, "1.40");
});

test("parseOdds: Total - Home avec une ligne non suivie (ex: 4.5) -> ignoree, jamais fabriquee sous une mauvaise cle", () => {
  const raw = bookmaker([{ name: "Total - Home", values: [{ value: "Over 4.5", odd: "15.00" }] }]);
  const p = parseOdds(raw);
  assert.equal(p.th_o05, "--");
  assert.equal(Object.keys(p).some((k) => k.includes("45")), false, "aucune cle th_o45/th_u45 ne doit apparaitre - ligne hors perimetre suivi");
});

test("parseOdds: aucune donnee -> Clean Sheet/Win To Nil/Total par equipe a '--' aussi (pas seulement 1X2)", () => {
  const p = parseOdds(null);
  assert.equal(p.cs_home, "--");
  assert.equal(p.wtn_away, "--");
  assert.equal(p.th_o25, "--");
  assert.equal(p.ta_u15, "--");
});

test("parseOdds: Result/Total Goals (combo resultat + total buts, ligne 2.5 uniquement)", () => {
  const raw = bookmaker([{
    name: "Result/Total Goals",
    values: [
      { value: "Home/Over 2.5", odd: "2.30" }, { value: "Draw/Over 2.5", odd: "8.00" }, { value: "Away/Over 2.5", odd: "5.50" },
      { value: "Home/Under 2.5", odd: "3.10" }, { value: "Draw/Under 2.5", odd: "3.80" }, { value: "Away/Under 2.5", odd: "6.00" },
    ],
  }]);
  const p = parseOdds(raw);
  assert.equal(p.combo_home_over25, "2.30");
  assert.equal(p.combo_draw_over25, "8.00");
  assert.equal(p.combo_away_over25, "5.50");
  assert.equal(p.combo_home_under25, "3.10");
});

test("parseOdds: Results/Both Teams Score (combo resultat + BTTS)", () => {
  const raw = bookmaker([{
    name: "Results/Both Teams Score",
    values: [
      { value: "Home/Yes", odd: "11.00" }, { value: "Draw/Yes", odd: "5.50" }, { value: "Away/Yes", odd: "3.10" },
      { value: "Home/No", odd: "11.00" }, { value: "Draw/No", odd: "11.00" }, { value: "Away/No", odd: "2.38" },
    ],
  }]);
  const p = parseOdds(raw);
  assert.equal(p.combo_home_btts, "11.00");
  assert.equal(p.combo_away_btts, "3.10");
  assert.equal(p.combo_away_nobtts, "2.38");
});

test("parseOdds: Result/Total Goals ignore les lignes autres que 2.5 (ex: Over 1.5) plutot que de les melanger a tort", () => {
  const raw = bookmaker([{ name: "Result/Total Goals", values: [{ value: "Home/Over 1.5", odd: "1.50" }] }]);
  const p = parseOdds(raw);
  assert.equal(p.combo_home_over25, "--", "une ligne 1.5 ne doit jamais alimenter la cle 'over25'");
});
