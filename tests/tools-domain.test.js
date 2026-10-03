const test=require('node:test'),assert=require('node:assert/strict'),d=require('../lib/tools-domain');
test('le calculateur refuse les entrées invalides',()=>assert.equal(d.calculateStake({bankroll:0,odds:2,probability:60}),null));
test('Kelly fractionné est plafonné à 5% de bankroll',()=>{const r=d.calculateStake({bankroll:1000,odds:4,probability:80,fraction:1});assert.equal(r.stake,50);assert.equal(r.bankrollPct,5)});
test('sans edge la mise recommandée vaut zéro',()=>{const r=d.calculateStake({bankroll:1000,odds:2,probability:40});assert.equal(r.stake,0);assert.equal(r.hasEdge,false)});
test('le P&L et le résumé utilisent uniquement les décisions réglées',()=>{const rows=[{stake:20,odds:2,status:'won'},{stake:10,odds:3,status:'lost'},{stake:99,odds:2,status:'pending'}];assert.equal(d.pnl(rows[0]),20);assert.deepEqual(d.summarize(1000,rows),{bankroll:1000,profit:10,roi:33.33,winRate:50,settled:2,total:3})});

test('scanValue aplatit les ecarts modele/marche deja calcules et les trie, sans rien recalculer', () => {
  const matchs = [
    { id: 1, home: { n: 'A' }, away: { n: 'B' }, league: 'L1', date: '2026-09-02 20:00', pari_rec: 'Over 2.5',
      markets_compared: [
        { market: 'Over 2.5', probability: 72.3, consensus: 57.1, edge: 15.2 },
        { market: 'DC 1X', probability: 71.7, consensus: 69, edge: 2.7 }
      ] },
    { id: 2, home: { n: 'C' }, away: { n: 'D' }, league: 'L1', date: '2026-09-02 21:00',
      markets_compared: [{ market: 'BTTS Oui', probability: 60, consensus: 52, edge: 8 }] }
  ];
  const all = d.scanValue(matchs);
  assert.equal(all.length, 3);
  assert.deepEqual(all.map(r => r.edge), [15.2, 8, 2.7], 'trie par ecart decroissant');
  assert.equal(all[0].fairOdds, 1.38, 'cote equitable derivee de la probabilite du modele');
  assert.equal(all[0].isRecommended, true, 'le marche retenu par le modele est signale');
  assert.equal(d.scanValue(matchs, { minEdge: 10 }).length, 1, 'le seuil filtre les ecarts trop faibles');
  assert.deepEqual(d.scanValue(null), [], 'aucune donnee -> aucune ligne, jamais une erreur');
});

test('combo multiplie reellement les probabilites et expose l\'esperance, meme defavorable', () => {
  const c = d.combo([
    { probability: 70, odds: 1.5 },
    { probability: 70, odds: 1.5 }
  ]);
  assert.equal(c.probability, 49, 'deux paris a 70% donnent 49%, jamais 70%');
  assert.equal(c.bookOdds, 2.25);
  assert.equal(c.fairOdds, 2.04);
  assert.equal(c.expectedValue, 10.25);
  assert.equal(c.bestSingleEv, 5, 'esperance de chaque pari joue seul');
  assert.equal(d.combo([{ probability: 70, odds: 1.5 }]), null, 'un combine exige au moins deux selections');
});

test('combo signale quand le combine est moins interessant que le meilleur pari seul', () => {
  const c = d.combo([
    { probability: 60, odds: 1.8 },
    { probability: 40, odds: 2.0 }
  ]);
  assert.equal(c.probability, 24);
  assert.ok(c.expectedValue < c.bestSingleEv);
  assert.equal(c.worseThanSingle, true);
});

test('simulateVariance est deterministe et montre la dispersion, pas une moyenne rassurante', () => {
  const params = { bankroll: 1000, stakePct: 3, bets: 200, winRate: 54, odds: 1.8, runs: 2000 };
  const a = d.simulateVariance(params);
  const b = d.simulateVariance(params);
  assert.deepEqual(a, b, 'memes entrees -> memes resultats, l\'utilisateur ne voit pas les chiffres bouger sans raison');
  assert.ok(a.p05 < a.median && a.median < a.p95, 'les percentiles sont ordonnes');
  assert.ok(a.drawdown30Probability >= 0 && a.drawdown30Probability <= 100);
  assert.equal(d.simulateVariance({ bankroll: 0 }), null, 'entrees invalides -> null, jamais un chiffre invente');
});

// ---------------------------------------------------------------------------
// FAIR ODDS / EDGE CHECKER
// ---------------------------------------------------------------------------
test("fairOdds : derive cote juste, probabilite implicite et ecart en points", () => {
  const r = d.fairOdds({ probability: 58, odds: 1.9 });
  assert.equal(r.impliedProbability, 52.6);
  assert.equal(r.fairOdds, 1.72);
  assert.equal(r.edgePoints, 5.4);
  assert.equal(r.favourable, true);
});

test("fairOdds : une cote defavorable donne un ecart negatif, jamais masque", () => {
  const r = d.fairOdds({ probability: 45, odds: 1.8 });
  assert.ok(r.edgePoints < 0, "45% a 1.80 est defavorable");
  assert.equal(r.favourable, false);
  assert.ok(r.expectedValue < 0);
});

test("fairOdds : entrees invalides -> null, jamais un resultat invente", () => {
  assert.equal(d.fairOdds({ probability: 0, odds: 2 }), null);
  assert.equal(d.fairOdds({ probability: 100, odds: 2 }), null);
  assert.equal(d.fairOdds({ probability: 50, odds: 1 }), null);
  assert.equal(d.fairOdds({ probability: 50 }), null);
  assert.equal(d.fairOdds(null), null);
});

test("fairOdds : a la cote juste exacte, l'ecart est nul", () => {
  const r = d.fairOdds({ probability: 50, odds: 2 });
  assert.equal(r.edgePoints, 0);
  assert.equal(r.expectedValue, 0);
});

// ---------------------------------------------------------------------------
// CORRELATION D'UN COMBINE
// Le projet n'a AUCUNE donnee de dependance entre marches. On ne detecte donc
// que ce qui est certain (meme match) et on ne fabrique jamais de coefficient.
// ---------------------------------------------------------------------------
test("comboRisk : signale plusieurs selections sur le meme match", () => {
  const r = d.comboRisk([{ matchKey: "psg-om" }, { matchKey: "psg-om" }, { matchKey: "ol-lille" }]);
  assert.equal(r.correlated, true);
  assert.equal(r.sameMatchGroups, 1);
  assert.equal(r.selections, 3);
});

test("comboRisk : selections toutes sur des matchs differents -> aucune alerte", () => {
  const r = d.comboRisk([{ matchKey: "a" }, { matchKey: "b" }, { matchKey: "c" }]);
  assert.equal(r.correlated, false);
  assert.equal(r.sameMatchGroups, 0);
});

test("comboRisk : ne fabrique jamais de coefficient de correlation", () => {
  const r = d.comboRisk([{ matchKey: "a" }, { matchKey: "a" }]);
  assert.equal(r.correlationCoefficient, null,
    "sans donnee de dependance, tout coefficient serait invente");
});
