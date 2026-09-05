"use strict";
// PLAYER SCORER OOS_DEV 2023-24 (2026-09-05). Tests des fonctions
// d'analyse pures utilisees pour la comparaison A/B/C/D - n'affecte
// AUCUN modele existant (V1/V2/baselines), couvre uniquement
// lib/player-lab/oos-eval-metrics.js.

const test = require("node:test");
const assert = require("node:assert/strict");
const { isoWeekKey, mean, pairedBlockBootstrapDelta, calibrationInterceptSlope, reliabilityBins, expectedCalibrationError } = require("../lib/player-lab/oos-eval-metrics.js");

test("isoWeekKey : semaine ISO connue (2023-08-11 est un vendredi de la semaine ISO 32)", () => {
  assert.equal(isoWeekKey("2023-08-11T19:00:00+00:00"), "2023-W32");
});

test("isoWeekKey : le 1er janvier peut appartenir a la derniere semaine ISO de l'annee precedente", () => {
  // 2023-01-01 est un dimanche -> semaine ISO 52 de 2022, jamais "2023-W01" fabrique.
  assert.equal(isoWeekKey("2023-01-01T00:00:00+00:00"), "2022-W52");
});

test("mean : moyenne simple, tableau vide -> null (jamais 0 fabrique)", () => {
  assert.equal(mean([1, 2, 3]), 2);
  assert.equal(mean([]), null);
});

test("pairedBlockBootstrapDelta : resample les BLOCS (pas les lignes), delta observe exact, CI95 coherente", () => {
  // Modele A strictement meilleur (logloss plus bas) que B sur chaque ligne -> delta<0 partout, CI95 entierement negative.
  const rows = [];
  for (let b = 0; b < 20; b++) {
    for (let i = 0; i < 10; i++) rows.push({ block: `W${b}`, valueA: 0.2, valueB: 0.5 });
  }
  const result = pairedBlockBootstrapDelta(rows, 2000, 42);
  assert.equal(result.n_blocks, 20);
  assert.ok(Math.abs(result.observed_delta - (0.2 - 0.5)) < 1e-9);
  assert.ok(result.ci_upper < 0, "A strictement meilleur partout -> CI95 du delta entierement negative");
  assert.equal(result.probability_a_better, 1);
});

test("pairedBlockBootstrapDelta : determinisme (meme seed => meme resultat)", () => {
  const rows = Array.from({ length: 200 }, (_, i) => ({ block: `W${i % 15}`, valueA: 0.1 + (i % 7) * 0.01, valueB: 0.15 + (i % 5) * 0.02 }));
  const r1 = pairedBlockBootstrapDelta(rows, 500, 7);
  const r2 = pairedBlockBootstrapDelta(rows, 500, 7);
  assert.deepEqual(r1, r2);
});

test("calibrationInterceptSlope : donnees parfaitement calibrees -> intercept~=0, slope~=1", () => {
  // p genere directement comme la vraie probabilite generative -> calibration ideale.
  const rows = [];
  let seed = 1234567;
  const rng = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 0; i < 20000; i++) {
    const p = 0.02 + rng() * 0.5;
    const y = rng() < p ? 1 : 0;
    rows.push({ p, y });
  }
  const fit = calibrationInterceptSlope(rows);
  assert.ok(fit.converged, "doit converger sur des donnees bien conditionnees");
  assert.ok(Math.abs(fit.intercept) < 0.15, `intercept doit etre proche de 0 (obtenu ${fit.intercept})`);
  assert.ok(Math.abs(fit.slope - 1) < 0.15, `slope doit etre proche de 1 (obtenu ${fit.slope})`);
});

test("calibrationInterceptSlope : cas degenerescent (masse ponctuelle p=0 pour la majorite) reste FINI (jamais 1e10)", () => {
  const rows = [];
  for (let i = 0; i < 6000; i++) rows.push({ p: 0, y: 0 });
  for (let i = 0; i < 20; i++) rows.push({ p: 0, y: 1 }); // rare bruit
  for (let i = 0; i < 6000; i++) rows.push({ p: 0.1, y: i % 10 === 0 ? 1 : 0 });
  const fit = calibrationInterceptSlope(rows);
  assert.ok(Number.isFinite(fit.intercept) && Number.isFinite(fit.slope));
  assert.ok(Math.abs(fit.intercept) < 50 && Math.abs(fit.slope) < 50, `doit rester dans une echelle raisonnable, jamais diverger vers 1e6+ (obtenu intercept=${fit.intercept} slope=${fit.slope})`);
});

test("reliabilityBins : jamais de crash pour p=0 ou p=1 exactement, ni pour une derive flottante legerement hors [0,1]", () => {
  const rows = [{ p: 0, y: 0 }, { p: 1, y: 1 }, { p: -1e-16, y: 0 }, { p: 1 + 1e-16, y: 1 }, { p: 0.55, y: 1 }];
  const bins = reliabilityBins(rows, 10);
  assert.equal(bins.length, 10);
  assert.equal(bins.reduce((s, b) => s + b.n, 0), rows.length);
});

test("expectedCalibrationError : 0 quand parfaitement calibre par bin", () => {
  const bins = [{ n: 10, mean_predicted: 0.3, observed_rate: 0.3 }, { n: 10, mean_predicted: 0.7, observed_rate: 0.7 }];
  assert.equal(expectedCalibrationError(bins, 20), 0);
});
