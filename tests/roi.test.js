"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { computeStats, computeBreakdown } = require("../lib/roi.js");

test("computeStats: winrate/ROI simples sur un petit jeu de paris", () => {
  const singles = [
    { result: "win", cote: 2.0 },
    { result: "loss", cote: 1.5 },
    { result: "win", cote: 1.5 },
  ];
  const s = computeStats(singles);
  assert.equal(s.total, 3);
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 1);
  assert.equal(s.winrate, Math.round((2 / 3) * 1000) / 10);
  // ROI = (1.0 - 1.0 + 0.5) / 3 * 100
  const expectedRoi = Math.round(((1 + -1 + 0.5) / 3) * 1000) / 10;
  assert.equal(s.roi, expectedRoi);
});

test("computeStats: cote manquante EXCLUE du ROI mais comptee dans le winrate (regression test P1-03)", () => {
  const singles = [
    { result: "win", cote: 2.0 },
    { result: "win", cote: null }, // cote manquante - ne doit jamais devenir 1.75 par defaut
    { result: "loss", cote: undefined },
  ];
  const s = computeStats(singles);
  assert.equal(s.total, 3, "winrate doit compter les 3 paris");
  assert.equal(s.wins, 2);
  assert.equal(s.roiCount, 1, "ROI ne doit compter que le pari avec une vraie cote");
  assert.equal(s.roi, 100, "ROI = (2.0-1)/1 * 100 = 100, sans la cote fictive 1.75");
});

test("computeStats: aucune cote valide du tout -> ROI=0 sans diviser par zero", () => {
  const singles = [
    { result: "win", cote: null },
    { result: "loss", cote: 0 },
    { result: "win", cote: -1 },
  ];
  const s = computeStats(singles);
  assert.equal(s.roiCount, 0);
  assert.equal(s.roi, 0);
  assert.ok(!isNaN(s.roi));
});

test("computeStats: tableau vide -> tout a zero, pas de crash", () => {
  const s = computeStats([]);
  assert.deepEqual(s, { winrate: 0, roi: 0, total: 0, wins: 0, losses: 0, roiCount: 0 });
});

test("computeStats: cote=1 exactement est traitee comme invalide (pas de gain possible)", () => {
  const singles = [{ result: "win", cote: 1 }];
  const s = computeStats(singles);
  assert.equal(s.roiCount, 0, "cote=1 ne doit pas entrer dans le calcul de ROI");
});

test("computeBreakdown: ventile correctement par marche, cote manquante exclue du ROI du groupe", () => {
  const singles = [
    { result: "win", cote: 2.0, market: "over25" },
    { result: "loss", cote: 1.8, market: "over25" },
    { result: "win", cote: null, market: "over25" }, // ne doit pas fausser le ROI du groupe
    { result: "win", cote: 1.6, market: "btts_oui" },
  ];
  const rows = computeBreakdown(singles, "market");
  const over25 = rows.find((r) => r.key === "over25");
  const btts = rows.find((r) => r.key === "btts_oui");
  assert.equal(over25.total, 3, "winrate du groupe compte les 3 paris");
  assert.equal(over25.wins, 2);
  // ROI du groupe over25 : seuls les 2 paris avec cote comptent -> (1.0 + -1)/2*100 = 0
  assert.equal(over25.roi, 0);
  assert.equal(btts.total, 1);
  assert.equal(btts.roi, 60); // (1.6-1)/1*100
});

test("computeBreakdown: paris sans le champ de regroupement -> classes 'inconnu', pas d'exception", () => {
  const singles = [{ result: "win", cote: 2.0 }];
  const rows = computeBreakdown(singles, "market");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].key, "inconnu");
});

test("computeBreakdown: trie par volume decroissant", () => {
  const singles = [
    { result: "win", cote: 2, market: "a" },
    { result: "win", cote: 2, market: "b" },
    { result: "loss", cote: 2, market: "b" },
    { result: "loss", cote: 2, market: "b" },
  ];
  const rows = computeBreakdown(singles, "market");
  assert.equal(rows[0].key, "b");
  assert.equal(rows[0].total, 3);
});
