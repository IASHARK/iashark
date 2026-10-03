const test=require('node:test'),assert=require('node:assert/strict'),d=require('../lib/tools-domain');
// Decision de Clement (30/09/2026) : IASHARK ne conseille aucune mise. Le calcul de mise
// (Kelly) n'existe plus, ni dans le domaine ni dans l'espace Pro.
test('plus aucun calcul de mise (Kelly) dans le domaine des outils', () => {
  assert.equal(d.calculateStake, undefined);
  assert.deepEqual(Object.keys(d).sort(), ['combo', 'comboRisk', 'comboSelections', 'fairOdds', 'pnl', 'scanValue', 'simulateVariance', 'summarize']);
});
test('le P&L et le résumé utilisent uniquement les décisions réglées',()=>{const rows=[{stake:20,odds:2,status:'won'},{stake:10,odds:3,status:'lost'},{stake:99,odds:2,status:'pending'}];assert.equal(d.pnl(rows[0]),20);assert.deepEqual(d.summarize(1000,rows),{bankroll:1000,profit:10,roi:33.33,winRate:50,settled:2,total:3})});

// Chiffre du moteur v3 « modèle + cotes » (championnat europeen, lib/moteur-v3.js).
const AVEC_COTES = { source: 'v3', origine_probabilite: 'modèle + cotes' };
test('scanValue aplatit les ecarts modele/marche deja calcules et les trie, sans rien recalculer', () => {
  const matchs = [
    { id: 1, home: { n: 'A' }, away: { n: 'B' }, league: 'L1', date: '2026-09-02 20:00', pari_rec: 'Over 2.5', moteur_v3: AVEC_COTES,
      markets_compared: [
        { market: 'Over 2.5', probability: 72.3, consensus: 57.1, edge: 15.2 },
        { market: 'DC 1X', probability: 71.7, consensus: 69, edge: 2.7 }
      ] },
    { id: 2, home: { n: 'C' }, away: { n: 'D' }, league: 'L1', date: '2026-09-02 21:00', moteur_v3: AVEC_COTES,
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

// Condition 1 du mathematicien et de l'avocat du diable (30/09/2026), preuve rejouee :
// pari MLS a 80 % calcule par le modele seul, cote sans marge a 72 % : le detecteur
// d'ecarts ne doit jamais afficher « +8 points ».
test('scanValue : aucun ecart en faveur du modele seul (hors d\'Europe, ancien moteur, origine inconnue)', () => {
  const mls = { id: 999, home: { n: 'Austin' }, away: { n: 'Dallas' }, league: 'Major League Soccer', date: '2026-10-03 23:30', pari_rec: 'Victoire Domicile',
    moteur_v3: { source: 'v3', origine_probabilite: 'modèle seul' },
    markets_compared: [{ id: 'home-win', market: 'Victoire Domicile', probability: 80, consensus: 72, edge: 8 }, { id: 'draw', market: 'Match nul', probability: 12, consensus: 17, edge: -5 }] };
  for (const m of [mls, { ...mls, moteur_v3: { source: 'v3' } }, { ...mls, moteur_v3: undefined }, { ...mls, moteur_v3: { source: 'ancien moteur (repli)', origine_probabilite: 'modèle + cotes' } }]) {
    assert.deepEqual(d.scanValue([m], { minEdge: 3 }), []);
    assert.deepEqual(d.scanValue([m], { minEdge: -100 }).map(r => r.edge), [-5], 'seul un ecart defavorable peut rester');
  }
  const europe = { ...mls, moteur_v3: AVEC_COTES };
  assert.deepEqual(d.scanValue([europe], { minEdge: 3 }).map(r => r.edge), [8]);
});

test('combo multiplie reellement les probabilites et ne donne AUCUNE esperance', () => {
  const c = d.combo([
    { probability: 70, odds: 1.5 },
    { probability: 70, odds: 1.5 }
  ]);
  assert.equal(c.probability, 49, 'deux paris a 70% donnent 49%, jamais 70%');
  assert.equal(c.bookOdds, 2.25);
  // Decision de Clement (30/09/2026) : ni esperance du combine, ni « meilleur pari joue seul ».
  assert.deepEqual(Object.keys(c).sort(), ['bookOdds', 'legs', 'probability']);
  assert.equal(d.combo([{ probability: 70, odds: 1.5 }]), null, 'un combine exige au moins deux selections');
});

// Preuve du mathematicien et de l'avocat du diable (30/09/2026, verif-combine.js) : MLS
// « modèle seul » 70 % (cote sans marge 60 %, cote 1,62) + Liga MX 72,6 % (72,0 %, cote
// 1,45) affichait « Espérance du combiné +19,4 % ». Chaque pari prend maintenant le PLUS
// PETIT des deux chiffres, meme en Europe ; un pari sans cote sans marge sort de la liste.
// Une seule source (01/10/2026) : ce chiffre est chance_iashark, pose UNE fois par le pipeline
// (lib/chance-iashark.js, % entier) ; le combine le lit, il ne recalcule plus rien.
test('comboSelections : le plus petit des deux chiffres, modele ou cote sans marge', () => {
  const CHANCE = require('../lib/chance-iashark.js');
  const pari = (...a) => { const m = pariBrut(...a); CHANCE.poserChance(m); return m; };
  const pariBrut = (id, league, prob, fair, cote, origine) => ({ id, home: { n: 'H' + id }, away: { n: 'A' + id }, league, pari_rec: 'Victoire Domicile', market_id: 'home-win',
    model_probability: prob, cote_rec: String(cote), no_signal: false, moteur_v3: { source: 'v3', origine_probabilite: origine },
    markets_compared: fair === undefined ? [] : [{ id: 'home-win', market: 'Victoire Domicile', probability: prob, consensus: fair, edge: fair === null ? null : prob - fair }] });
  const mls = pari(900001, 'Major League Soccer', 70, 60, 1.62, 'modèle seul');
  const mx = pari(900002, 'Liga MX', 72.6, 72.0, 1.45, 'modèle seul');
  const europe = pari(900003, 'Ligue 1', 60, 55.9, 1.73, 'modèle + cotes');
  const europeSous = pari(900004, 'Serie A', 52, 55, 1.8, 'modèle + cotes');
  const sansMarge = pari(900005, 'Allsvenskan', 75, null, 1.4, 'modèle seul');
  const sansLigne = pari(900006, 'J1 League', 75, undefined, 1.4, 'modèle seul');
  const rows = d.comboSelections([mls, mx, europe, europeSous, sansMarge, sansLigne, { ...mls, id: 1, no_signal: true }]);
  assert.deepEqual(rows.map(r => [r.id, r.probability]), [['900001', 60], ['900002', 72], ['900003', 56], ['900004', 52]]);
  // Sans chance_iashark (jamais posee par le pipeline) : rien, jamais la probabilite brute du modele.
  assert.deepEqual(d.comboSelections([{ ...mls, chance_iashark: undefined }]), []);
  const c = d.combo(rows.slice(0, 2));
  assert.equal(c.probability, 43.2, '60 % x 72 %');
  assert.equal(c.bookOdds, 2.35);
  assert.ok(!('expectedValue' in c) && !('bestSingleEv' in c));
  // Cote en texte avec virgule, et limite a 12 selections.
  assert.equal(d.comboSelections([{ ...europe, cote_rec: '1,73' }])[0].odds, 1.73);
  assert.equal(d.comboSelections(Array.from({ length: 20 }, (_, i) => ({ ...europe, id: i }))).length, 12);
  assert.deepEqual(d.comboSelections(null), []);
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
  // Plus aucune « esperance » (decision de Clement du 30/09/2026).
  assert.ok(!('expectedValue' in r));
});

test("fairOdds : une cote defavorable donne un ecart negatif, jamais masque", () => {
  const r = d.fairOdds({ probability: 45, odds: 1.8 });
  assert.ok(r.edgePoints < 0, "45% a 1.80 est defavorable");
  assert.equal(r.favourable, false);
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
