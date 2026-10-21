const test=require('node:test'),assert=require('node:assert/strict'),d=require('../lib/tools-domain');
// 21/10/2026 (regle de Clement : ni mise, ni ROI, ni profit/perte) : le journal compte des
// paris, jamais des montants. Les anciennes lignes gardent stake / result_pnl : ignorees.
test('journal : paris notes, gagnes, perdus et taux de reussite, sans aucun montant', () => {
  const rows = [
    { stake: 20, odds: 2, status: 'won', result_pnl: 20 },
    { stake: 10, odds: 3, status: 'lost', result_pnl: -10 },
    { stake: 99, odds: 2, status: 'pending' },
    { stake: 5, odds: 1.9, status: 'void', result_pnl: 0 },
    { odds: 1.7, status: 'won' }
  ];
  const s = d.summarize(rows);
  assert.deepEqual(s, { total: 5, won: 2, lost: 1, void: 1, pending: 1, decided: 3, winRate: 66.7 });
  for (const champ of ['profit', 'roi', 'bankroll', 'stake', 'pnl']) assert.ok(!(champ in s), 'aucun montant : ' + champ);
  assert.equal(d.pnl, undefined, 'plus de calcul de profit / perte');
});

test('journal : aucune decision tranchee -> pas de taux (null, jamais un 0 % trompeur), anciennes donnees sans planter', () => {
  assert.equal(d.summarize([{ status: 'pending' }, { status: 'void' }]).winRate, null);
  assert.deepEqual(d.summarize(null), { total: 0, won: 0, lost: 0, void: 0, pending: 0, decided: 0, winRate: null });
  const anciennes = d.summarize([null, 'x', { status: null, stake: 'abc' }, { status: 'inconnu' }, { status: 'lost', result_pnl: 'n/a' }]);
  assert.equal(anciennes.total, 3, 'les lignes qui ne sont pas des objets sont ignorees');
  assert.equal(anciennes.pending, 2);
  assert.equal(anciennes.winRate, 0);
});

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

test('combo multiplie reellement les probabilites : probabilite combinee, cote juste et cote proposee, sans esperance', () => {
  const c = d.combo([
    { probability: 70, odds: 1.5 },
    { probability: 70, odds: 1.5 }
  ]);
  assert.equal(c.probability, 49, 'deux paris a 70% donnent 49%, jamais 70%');
  assert.equal(c.bookOdds, 2.25);
  assert.equal(c.fairOdds, 2.04);
  assert.equal(c.comparison, 'above', 'cote proposee plus haute que la cote juste');
  assert.deepEqual(Object.keys(c).sort(), ['bookOdds', 'comparison', 'fairOdds', 'legs', 'probability']);
  assert.equal(d.combo([{ probability: 70, odds: 1.5 }]), null, 'un combine exige au moins deux selections');
});

test('combo : cote proposee plus basse que la cote juste, ou egale, dite telle quelle', () => {
  const bas = d.combo([
    { probability: 60, odds: 1.8 },
    { probability: 40, odds: 2.0 }
  ]);
  assert.equal(bas.probability, 24);
  assert.equal(bas.fairOdds, 4.17);
  assert.equal(bas.bookOdds, 3.6);
  assert.equal(bas.comparison, 'below');
  assert.equal(d.combo([{ probability: 50, odds: 2 }, { probability: 50, odds: 2 }]).comparison, 'equal');
});

test('calculateur de mise et simulateur de capital retires (21/10/2026 : ni mise, ni capital)', () => {
  assert.equal(d.calculateStake, undefined);
  assert.equal(d.simulateVariance, undefined);
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
  assert.ok(!('expectedValue' in r), 'aucune esperance (21/10/2026)');
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
  assert.equal(r.favourable, false);
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
