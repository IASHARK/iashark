"use strict";
// GATE A7 item 7 (SPEC LAB PRO v1.0) - calcLambdas ne doit jamais
// retourner une valeur hors des bornes dures documentees dans son propre
// code (minLH/minLA selon isTop/isWC, maxLH=3.4, maxLA=3.0), quelles que
// soient les statistiques brutes en entree (y compris des valeurs
// extremes ou nulles qui pourraient produire un ratio explosif avant
// clamping).

const test = require("node:test");
const assert = require("node:assert/strict");
const { calcLambdas } = require("../lib/engine.js");

const PREMIER_LEAGUE_ID = 39; // ligue "isTop" (config/leagues.json)
const NON_LISTED_LEAGUE_ID = 999999; // hors des 13 competitions de lancement
const WORLD_CUP_ID = 1; // isWC

function assertWithinBounds(result, minLH, maxLH, minLA, maxLA, label) {
  assert.ok(result.lambdaH >= minLH - 1e-9 && result.lambdaH <= maxLH + 1e-9, `${label}: lambdaH=${result.lambdaH} hors [${minLH}, ${maxLH}]`);
  assert.ok(result.lambdaA >= minLA - 1e-9 && result.lambdaA <= maxLA + 1e-9, `${label}: lambdaA=${result.lambdaA} hors [${minLA}, ${maxLA}]`);
}

test("calcLambdas: statistiques extremes (attaque tres forte, defense tres faible) restent clampees a maxLH=3.4/maxLA=3.0", () => {
  const r = calcLambdas(500, 0, 1, 500, 0, 1, 1.35, 1.10, PREMIER_LEAGUE_ID);
  assertWithinBounds(r, 1.05, 3.4, 0.90, 3.0, "ligue isTop, stats extremes");
});

test("calcLambdas: statistiques nulles/absentes ne produisent pas NaN ni division par zero silencieuse, retombent sur le plancher minLH/minLA", () => {
  const r = calcLambdas(0, 0, 0, 0, 0, 0, 1.35, 1.10, PREMIER_LEAGUE_ID);
  assert.ok(Number.isFinite(r.lambdaH), "lambdaH ne doit jamais etre NaN/Infinity");
  assert.ok(Number.isFinite(r.lambdaA), "lambdaA ne doit jamais etre NaN/Infinity");
  assertWithinBounds(r, 1.05, 3.4, 0.90, 3.0, "ligue isTop, stats nulles");
});

test("calcLambdas: ligue non listee (isTop=false) utilise les bornes plus larges 0.95/0.80", () => {
  const r = calcLambdas(0, 0, 0, 0, 0, 0, 1.35, 1.10, NON_LISTED_LEAGUE_ID);
  assertWithinBounds(r, 0.95, 3.4, 0.80, 3.0, "ligue non listee, stats nulles");
});

test("calcLambdas: Coupe du Monde (leagueId=1, isWC) utilise les bornes minimales 0.90/0.80", () => {
  const r = calcLambdas(0, 0, 0, 0, 0, 0, 1.35, 1.10, WORLD_CUP_ID);
  assertWithinBounds(r, 0.90, 3.4, 0.80, 3.0, "Coupe du Monde, stats nulles");
});

test("calcLambdas: leagueId absent (null/undefined) ne casse pas et retombe sur les bornes ligue non-top", () => {
  const r1 = calcLambdas(20, 10, 10, 20, 10, 10, 1.35, 1.10, null);
  const r2 = calcLambdas(20, 10, 10, 20, 10, 10, 1.35, 1.10, undefined);
  assertWithinBounds(r1, 0.95, 3.4, 0.80, 3.0, "leagueId null");
  assertWithinBounds(r2, 0.95, 3.4, 0.80, 3.0, "leagueId undefined");
});

test("calcLambdas: arrondi a 3 decimales (toFixed(3)), jamais plus de precision affichee que ce que le code produit reellement", () => {
  const r = calcLambdas(43, 21, 15, 38, 19, 15, 1.35, 1.10, PREMIER_LEAGUE_ID);
  const decimalsH = (String(r.lambdaH).split(".")[1] || "").length;
  const decimalsA = (String(r.lambdaA).split(".")[1] || "").length;
  assert.ok(decimalsH <= 3, `lambdaH a plus de 3 decimales: ${r.lambdaH}`);
  assert.ok(decimalsA <= 3, `lambdaA a plus de 3 decimales: ${r.lambdaA}`);
});
