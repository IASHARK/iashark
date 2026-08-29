"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fractionalKelly, edgePoints, expectedValue } = require("../lib/betting.js");

test("fractionalKelly: edge net positif (65% vs cote 1.80 = 55.6% implicite) -> stake > 0", () => {
  const k = fractionalKelly(0.65, 1.8, 0.25);
  assert.notEqual(k, null);
  assert.ok(parseFloat(k) > 0);
});

test("fractionalKelly: probabilite ~= implicite du marche (pas d'edge reel) -> null", () => {
  // cote 1.80 -> implicite 55.56% ; probIA 0.55 est EN DESSOUS -> pas d'edge.
  const k = fractionalKelly(0.55, 1.8, 0.25);
  assert.equal(k, null);
});

test("fractionalKelly: edge negatif -> null (jamais une mise pour un pari perdant en esperance)", () => {
  const k = fractionalKelly(0.45, 1.8, 0.25);
  assert.equal(k, null);
});

test("fractionalKelly: plafonne a 5% meme avec un edge enorme", () => {
  const k = fractionalKelly(0.95, 5.0, 1.0); // Kelly plein, edge massif
  assert.ok(parseFloat(k) <= 5);
});

test("fractionalKelly: deux cotes differentes pour le meme edge => stakes differents (preuve que ce n'est pas une constante)", () => {
  // C'est la preuve mathematique utilisee dans l'audit : Kelly depend de la
  // cote (b=cote-1), donc une sortie CONSTANTE quel que soit (p,cote) ne
  // peut pas etre un vrai calcul de Kelly.
  const kLow = fractionalKelly(0.60, 1.5, 0.25);
  const kHigh = fractionalKelly(0.60, 2.5, 0.25);
  assert.notEqual(kLow, kHigh, "des cotes differentes doivent donner des stakes differents pour la meme probabilite");
});

test("fractionalKelly: inputs invalides -> null (pas de crash, pas de NaN)", () => {
  assert.equal(fractionalKelly(null, 1.8, 0.25), null);
  assert.equal(fractionalKelly(0.6, null, 0.25), null);
  assert.equal(fractionalKelly(0.6, 1.0, 0.25), null); // cote=1 (b=0) -> division par zero evitee
  assert.equal(fractionalKelly(0.6, 0.5, 0.25), null); // cote < 1, invalide
  assert.equal(fractionalKelly(0, 1.8, 0.25), null);   // probIA=0
  assert.equal(fractionalKelly(1, 1.8, 0.25), null);   // probIA=1
});

test("fractionalKelly: jamais NaN ni Infinity sur une plage large d'inputs valides", () => {
  for (let p = 0.05; p < 1; p += 0.05) {
    for (let cote = 1.05; cote < 10; cote += 0.5) {
      const k = fractionalKelly(p, cote, 0.25);
      if (k !== null) {
        assert.ok(!isNaN(parseFloat(k)), `NaN pour p=${p} cote=${cote}`);
        assert.ok(isFinite(parseFloat(k)), `Infinity pour p=${p} cote=${cote}`);
      }
    }
  }
});

test("edgePoints: difference simple modele - marche, peut etre negatif", () => {
  assert.ok(Math.abs(edgePoints(65, 55.6) - 9.4) < 1e-9);
  assert.ok(Math.abs(edgePoints(45, 55.6) - -10.6) < 1e-9);
});

test("edgePoints: valeurs manquantes -> null (jamais une soustraction avec 0 par defaut)", () => {
  assert.equal(edgePoints(null, 55), null);
  assert.equal(edgePoints(55, null), null);
});

test("expectedValue: EV=0 exactement a l'equilibre (probIA = implicite exacte)", () => {
  // cote 2.0 -> implicite 50% -> EV = 0.5*2 - 1 = 0
  assert.ok(Math.abs(expectedValue(0.5, 2.0)) < 1e-9);
});

test("expectedValue: EV positif quand probIA > implicite", () => {
  assert.ok(expectedValue(0.6, 2.0) > 0);
});

test("expectedValue: EV negatif quand probIA < implicite", () => {
  assert.ok(expectedValue(0.4, 2.0) < 0);
});
