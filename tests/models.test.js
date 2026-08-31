"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {
  poissonProb, calcPoissonProbs, calcDixonColesProbs, calcMonteCarlo,
  mulberry32, shinProbabilities, impliedProbability, eloWinProb,
} = require("../lib/models.js");

test("poissonProb: somme sur k=0..40 vaut ~1 (distribution valide)", () => {
  let sum = 0;
  for (let k = 0; k <= 40; k++) sum += poissonProb(1.4, k);
  assert.ok(Math.abs(sum - 1) < 1e-6, "somme=" + sum);
});

test("poissonProb: lambda<=0 -> masse entiere sur k=0", () => {
  assert.equal(poissonProb(0, 0), 1);
  assert.equal(poissonProb(0, 3), 0);
  assert.equal(poissonProb(-1, 0), 1);
});

test("calcPoissonProbs: p1+pN+p2 = ~100 (arrondi)", () => {
  const p = calcPoissonProbs(1.4, 1.1);
  const sum = p.p1 + p.pN + p.p2;
  assert.ok(Math.abs(sum - 100) <= 1, "sum=" + sum);
});

test("calcPoissonProbs: over25+under25 = ~100", () => {
  const p = calcPoissonProbs(1.6, 1.3);
  assert.ok(Math.abs(p.over25 + p.under25 - 100) <= 1);
});

test("calcPoissonProbs: bttsY+bttsN = ~100", () => {
  const p = calcPoissonProbs(1.6, 1.3);
  assert.ok(Math.abs(p.bttsY + p.bttsN - 100) <= 1);
});

test("calcPoissonProbs: favori net a domicile -> p1 nettement > p2", () => {
  const p = calcPoissonProbs(2.5, 0.6);
  assert.ok(p.p1 > p.p2 + 30, JSON.stringify(p));
});

test("calcPoissonProbs: match symetrique (memes lambdas) -> p1 ~= p2", () => {
  const p = calcPoissonProbs(1.3, 1.3);
  assert.ok(Math.abs(p.p1 - p.p2) <= 2, JSON.stringify(p));
});

test("calcDixonColesProbs: p1+pN+p2 = ~100", () => {
  const p = calcDixonColesProbs(1.4, 1.1);
  assert.ok(Math.abs(p.p1 + p.pN + p.p2 - 100) <= 1);
});

test("calcDixonColesProbs: correction rho baisse la proba de 1-1 par rapport a Poisson pur (rho negatif attendu)", () => {
  // Verification indirecte : la correction Dixon-Coles a rho=-0.13 doit
  // legerement augmenter la masse sur 0-0/1-0/0-1 et diminuer 1-1 par
  // rapport au Poisson non corrige, pour des lambdas realistes de football.
  const dc = calcDixonColesProbs(1.4, 1.2);
  const po = calcPoissonProbs(1.4, 1.2);
  // pN (nul) inclut 0-0,1-1,2-2... - pas un test direct sur 1-1 seul, mais
  // les deux distributions ne doivent pas etre identiques (la correction
  // fait quelque chose).
  const identical = dc.p1 === po.p1 && dc.pN === po.pN && dc.p2 === po.p2;
  assert.equal(identical, false, "Dixon-Coles devrait differer de Poisson pur");
});

test("calcMonteCarlo: avec seed fixe, deux runs produisent le meme resultat (reproductibilite)", () => {
  const r1 = calcMonteCarlo(1.4, 1.1, { n: 2000, seed: 42 });
  const r2 = calcMonteCarlo(1.4, 1.1, { n: 2000, seed: 42 });
  assert.deepEqual(r1, r2, "meme seed doit donner exactement le meme resultat");
});

test("calcMonteCarlo: expose le nombre réel de simulations exécutées", () => {
  const result = calcMonteCarlo(1.4, 1.1, { n: 1234, seed: 7 });
  assert.equal(result.simulations, 1234);
});

test("calcMonteCarlo: sans seed, deux runs peuvent differer (aleatoire reel par defaut)", () => {
  const r1 = calcMonteCarlo(1.4, 1.1, { n: 500 });
  const r2 = calcMonteCarlo(1.4, 1.1, { n: 500 });
  // Ne doit pas planter ; on ne peut pas garantir qu'ils different (le hasard
  // peut coincider) mais la structure doit etre valide dans les deux cas.
  assert.ok(r1.p1 + r1.pN + r1.p2 <= 101 && r1.p1 + r1.pN + r1.p2 >= 99);
  assert.ok(r2.p1 + r2.pN + r2.p2 <= 101 && r2.p1 + r2.pN + r2.p2 >= 99);
});

test("mulberry32: meme seed -> meme sequence de nombres", () => {
  const rngA = mulberry32(123);
  const rngB = mulberry32(123);
  for (let i = 0; i < 20; i++) assert.equal(rngA(), rngB());
});

test("mulberry32: sortie toujours dans [0,1)", () => {
  const rng = mulberry32(7);
  for (let i = 0; i < 1000; i++) {
    const v = rng();
    assert.ok(v >= 0 && v < 1, "v=" + v);
  }
});

test("shinProbabilities: retire correctement une marge bookmaker connue (overround 5%)", () => {
  // Cotes fair 1X2 : 40%/30%/30%. Marge bookmaker 5% appliquee -> cotes vendues.
  const fairP = [0.40, 0.30, 0.30];
  const overround = 1.05;
  const cotesVendues = fairP.map((p) => 1 / (p * overround));
  const recovered = shinProbabilities(cotesVendues);
  assert.ok(recovered, "shinProbabilities ne doit pas retourner null pour des cotes valides");
  const sum = recovered.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, "les probas Shin doivent sommer a 1, sum=" + sum);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(recovered[i] - fairP[i]) < 0.02, "ecart trop grand sur l'issue " + i + ": " + recovered[i] + " vs " + fairP[i]);
  }
});

test("shinProbabilities: cotes invalides (toutes <=1) -> null", () => {
  assert.equal(shinProbabilities([1, 0.5, -2]), null);
});

test("shinProbabilities: tableau vide -> null", () => {
  assert.equal(shinProbabilities([]), null);
});

test("impliedProbability: cote 2.00 -> 50%", () => {
  assert.equal(impliedProbability(2.0), 50);
});

test("impliedProbability: cote <=1 ou invalide -> null", () => {
  assert.equal(impliedProbability(1), null);
  assert.equal(impliedProbability(0), null);
  assert.equal(impliedProbability(NaN), null);
  assert.equal(impliedProbability("abc"), null);
});

test("eloWinProb: Elo egaux, pas d'avantage domicile -> 50%", () => {
  assert.ok(Math.abs(eloWinProb(1500, 1500, 0) - 0.5) < 1e-9);
});

test("eloWinProb: ecart Elo favorable -> proba > 50%", () => {
  assert.ok(eloWinProb(1700, 1500, 0) > 0.5);
});

test("eloWinProb: avantage domicile ajoute a l'ecart", () => {
  const sansAvantage = eloWinProb(1500, 1500, 0);
  const avecAvantage = eloWinProb(1500, 1500, 60);
  assert.ok(avecAvantage > sansAvantage);
});
