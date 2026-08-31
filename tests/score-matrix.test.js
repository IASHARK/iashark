"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildPoissonMatrix, buildDixonColesMatrix, blendMatrices, deriveMarketsFromMatrix } = require("../lib/markets/score-matrix.js");

function sumMatrix(mat) {
  return mat.reduce((s, row) => s + row.reduce((rs, v) => rs + v, 0), 0);
}

test("buildPoissonMatrix: la matrice somme a ~1 (distribution de probabilite valide)", () => {
  const mat = buildPoissonMatrix(1.4, 1.1, 10);
  assert.ok(Math.abs(sumMatrix(mat) - 1) < 1e-4, "sum=" + sumMatrix(mat));
});

test("buildDixonColesMatrix: la matrice somme a ~1", () => {
  const mat = buildDixonColesMatrix(1.4, 1.1, 10);
  assert.ok(Math.abs(sumMatrix(mat) - 1) < 1e-4, "sum=" + sumMatrix(mat));
});

test("blendMatrices: melange pondere de deux matrices identiques = la matrice elle-meme (a la renormalisation pres)", () => {
  // buildPoissonMatrix tronque a maxGoals=8, donc sa somme est tres proche
  // de 1 mais pas exactement 1 (masse residuelle au-dela de 8 buts) ;
  // blendMatrices renormalise a 1 exactement, d'ou un ecart minime attendu.
  const mat = buildPoissonMatrix(1.4, 1.1, 8);
  const blended = blendMatrices([{ matrix: mat, weight: 0.5 }, { matrix: mat, weight: 0.5 }]);
  assert.ok(Math.abs(blended[1][1] - mat[1][1]) < 1e-4, "blended=" + blended[1][1] + " orig=" + mat[1][1]);
});

test("blendMatrices: entree vide -> null, pas de crash", () => {
  assert.equal(blendMatrices([]), null);
});

test("deriveMarketsFromMatrix: p1+pN+p2 = 1", () => {
  const mat = buildPoissonMatrix(1.4, 1.1, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(Math.abs(m.p1 + m.pN + m.p2 - 1) < 1e-6);
});

test("deriveMarketsFromMatrix: btts.yes + btts.no = 1", () => {
  const mat = buildPoissonMatrix(1.4, 1.1, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(Math.abs(m.btts.yes + m.btts.no - 1) < 1e-6);
});

test("deriveMarketsFromMatrix: chaque over+under d'une meme ligne = 1", () => {
  const mat = buildPoissonMatrix(1.4, 1.1, 10);
  const m = deriveMarketsFromMatrix(mat);
  for (const line of Object.keys(m.overUnder)) {
    const ou = m.overUnder[line];
    assert.ok(Math.abs(ou.over + ou.under - 1) < 1e-6, "line=" + line);
  }
});

test("deriveMarketsFromMatrix: les lignes de totaux sont monotones decroissantes (P(over 0.5) > P(over 6.5))", () => {
  const mat = buildPoissonMatrix(1.4, 1.1, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(m.overUnder["0.5"].over > m.overUnder["6.5"].over);
  assert.ok(m.overUnder["0.5"].over > m.overUnder["2.5"].over);
  assert.ok(m.overUnder["2.5"].over > m.overUnder["4.5"].over);
});

test("deriveMarketsFromMatrix: exact score - la somme des scores connus + 'Other' = 1", () => {
  const mat = buildPoissonMatrix(1.4, 1.1, 10);
  const m = deriveMarketsFromMatrix(mat);
  const sum = Object.values(m.exactScore).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, "sum=" + sum);
});

test("deriveMarketsFromMatrix: bandes de buts sommes a 1", () => {
  const mat = buildPoissonMatrix(1.4, 1.1, 10);
  const m = deriveMarketsFromMatrix(mat);
  const sum = Object.values(m.goalBands).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(sum - 1) < 1e-6, "sum=" + sum);
});

test("deriveMarketsFromMatrix: clean sheet - si l'exterieur ne marque jamais (lambdaA=0), homeCleanSheet=1", () => {
  const mat = buildPoissonMatrix(1.4, 0, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(Math.abs(m.cleanSheet.home - 1) < 1e-6);
  // awayCleanSheet = P(le domicile ne marque pas) = P(h=0) = exp(-1.4), independant de lambdaA.
  assert.ok(Math.abs(m.cleanSheet.away - Math.exp(-1.4)) < 1e-3, "away CS=" + m.cleanSheet.away);
});

test("deriveMarketsFromMatrix: win to nil - domicile favori net et exterieur ne marque jamais -> forte proba win to nil domicile", () => {
  const mat = buildPoissonMatrix(2.0, 0, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(m.winToNil.home > 0.8, "winToNil.home=" + m.winToNil.home);
  assert.equal(m.winToNil.away, 0);
});

test("deriveMarketsFromMatrix: team totals - over/under d'une meme ligne = 1", () => {
  const mat = buildPoissonMatrix(1.4, 1.1, 10);
  const m = deriveMarketsFromMatrix(mat);
  for (const side of ["home", "away"]) {
    for (const line of Object.keys(m.teamTotals[side])) {
      const t = m.teamTotals[side][line];
      assert.ok(Math.abs(t.over + t.under - 1) < 1e-6, side + " " + line);
    }
  }
});

test("deriveMarketsFromMatrix: double chance - 1X+X2+12 coherents avec p1/pN/p2", () => {
  const mat = buildPoissonMatrix(1.4, 1.1, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(Math.abs(m.doubleChance.oneX - (m.p1 + m.pN)) < 1e-9);
  assert.ok(Math.abs(m.doubleChance.xTwo - (m.pN + m.p2)) < 1e-9);
  assert.ok(Math.abs(m.doubleChance.oneTwo - (m.p1 + m.p2)) < 1e-9);
});

test("deriveMarketsFromMatrix: draw no bet - home+away=1, favori net a domicile -> DNB home > 0.5", () => {
  const mat = buildPoissonMatrix(2.0, 0.7, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(Math.abs(m.drawNoBet.home + m.drawNoBet.away - 1) < 1e-9);
  assert.ok(m.drawNoBet.home > 0.5, "home=" + m.drawNoBet.home);
});

test("deriveMarketsFromMatrix: draw no bet - match parfaitement symetrique -> 0.5/0.5", () => {
  const mat = buildPoissonMatrix(1.3, 1.3, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(Math.abs(m.drawNoBet.home - 0.5) < 0.02, "home=" + m.drawNoBet.home);
});

test("deriveMarketsFromMatrix: favori net a domicile -> p1 nettement superieur a p2 (coherence avec calcPoissonProbs deja teste)", () => {
  const mat = buildPoissonMatrix(2.5, 0.6, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(m.p1 > m.p2 + 0.3, JSON.stringify({ p1: m.p1, p2: m.p2 }));
});

test("deriveMarketsFromMatrix: resultat+total buts - les 6 cases (home/draw/away x over/under 2.5) sommes a 1", () => {
  const mat = buildPoissonMatrix(1.6, 1.2, 10);
  const m = deriveMarketsFromMatrix(mat);
  const total = m.resultAndOver25.home + m.resultAndOver25.draw + m.resultAndOver25.away
    + m.resultAndUnder25.home + m.resultAndUnder25.draw + m.resultAndUnder25.away;
  assert.ok(Math.abs(total - 1) < 1e-5, "total=" + total);
});

test("deriveMarketsFromMatrix: resultat+total buts - chaque case <= la probabilite du resultat seul (c'est une intersection, jamais plus grand que l'ensemble)", () => {
  const mat = buildPoissonMatrix(1.6, 1.2, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(m.resultAndOver25.home <= m.p1 + 1e-9);
  assert.ok(m.resultAndUnder25.home <= m.p1 + 1e-9);
  assert.ok(Math.abs(m.resultAndOver25.home + m.resultAndUnder25.home - m.p1) < 1e-9, "over+under d'un meme resultat doit reconstituer p1 exactement");
});

test("deriveMarketsFromMatrix: resultat+total buts - jamais une simple multiplication naive (les deux evenements ne sont pas independants)", () => {
  // Favori net a domicile : un match avec beaucoup de buts est structurellement
  // plus souvent un match ou le favori s'impose largement (et donc gagne) que
  // l'inverse - la vraie proba jointe doit differ de p1 * pOver25 (independance
  // supposee a tort), pas seulement dans un cas limite artificiel.
  const mat = buildPoissonMatrix(2.3, 0.7, 10);
  const m = deriveMarketsFromMatrix(mat);
  const naiveMultiplication = m.p1 * m.overUnder[2.5].over;
  assert.ok(Math.abs(m.resultAndOver25.home - naiveMultiplication) > 0.01, "la jointe reelle (" + m.resultAndOver25.home + ") ne doit pas coincider avec la multiplication naive (" + naiveMultiplication + ")");
});

test("deriveMarketsFromMatrix: resultat+BTTS - les 6 cases sommes a 1, et over/under d'un meme resultat reconstitue ce resultat", () => {
  const mat = buildPoissonMatrix(1.5, 1.3, 10);
  const m = deriveMarketsFromMatrix(mat);
  const total = m.resultAndBtts.home + m.resultAndBtts.draw + m.resultAndBtts.away
    + m.resultAndNoBtts.home + m.resultAndNoBtts.draw + m.resultAndNoBtts.away;
  assert.ok(Math.abs(total - 1) < 1e-6, "total=" + total);
  assert.ok(Math.abs(m.resultAndBtts.away + m.resultAndNoBtts.away - m.p2) < 1e-9);
});

test("deriveMarketsFromMatrix: resultat+BTTS - un match nul avec BTTS est impossible sur 0-0 uniquement, mais possible sur 1-1/2-2/etc -> resultAndBtts.draw > 0 des que lambda > 0 des deux cotes", () => {
  const mat = buildPoissonMatrix(1.2, 1.2, 10);
  const m = deriveMarketsFromMatrix(mat);
  assert.ok(m.resultAndBtts.draw > 0, "un nul BTTS (1-1, 2-2...) doit avoir une probabilite reelle non nulle");
});
