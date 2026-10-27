// Page match et choix du pari par une meme regle pour toutes les familles
// (lib/decision.js#pickMarketFair, 19/09/2026) : la carte « Pari recommande »
// et la ligne du tableau montrent la meme estimation, comparee a la
// probabilite juste du bookmaker (marge retiree) portee par markets_compared.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMatchViewModel } = require('../lib/match-view-model');

function raw(overrides) {
  return {
    id: 7, date: '2026-09-20 15:00', league: 'Premier League', league_id: 39,
    home: { id: 1, n: 'Home FC' }, away: { id: 2, n: 'Away FC' },
    data_quality_score: 80, model_output_available: true,
    p1: 48, pn: 27, p2: 25, po25: 58, btts: 55,
    c1: 1.95, cn: 3.6, c2: 4.1, co25: 1.62, cu25: 2.35, cbtts: 1.8, cbtts_non: 2.0,
    market_consensus_p1: 49.6, market_consensus_pN: 27.1, market_consensus_p2: 23.3,
    pari_rec: 'Over 2.5', market_id: 'over-25', cote_rec: '1.62', model_probability: 59.8, conf: 6,
    markets_compared: [
      { id: 'over-25', market: 'Over 2.5', probability: 59.8, consensus: 59.2, edge: 0.6 },
      { id: 'home-win', market: 'Victoire Domicile', probability: 49.3, consensus: 49.6, edge: -0.3 },
      { id: 'btts-yes', market: 'BTTS Oui', probability: 53.4, consensus: 52.9, edge: 0.5 }
    ],
    ...overrides
  };
}

// Correction C3 du 27/10/2026 (controle trader-de-cotes) : la carte compare la chance du MODELE au chiffre sans marge
// enregistre a la publication du pari (pronostic.sans_marge) ; jamais markets_compared, jamais 1 / cote, jamais des cotes
// plus recentes ; chance tiree des cotes (source « marche ») ou origine inconnue : aucune comparaison.
const PUBLIE = { pronostic: { market_id: 'over-25', source_chance: 'modele', sans_marge: 59.2 } };
test('carte : le pari retenu est compare au chiffre sans marge de sa publication, pas a 1 / cote', () => {
  const vm = buildMatchViewModel(raw(PUBLIE));
  assert.equal(vm.model.recommendedImplied, 59.2);
  assert.equal(vm.model.recommendedEdge, 0.6);
  assert.equal(vm.model.chanceSource, 'modele');
});

test('carte : sans chiffre de la publication, ou chance tiree des cotes, aucune comparaison (jamais 1 / cote ni markets_compared)', () => {
  for (const extra of [{}, { markets_compared: [] }, { pronostic: { market_id: 'over-25', source_chance: 'modele' } }, { pronostic: { market_id: 'over-25', source_chance: 'marche', sans_marge: 59.2 } }]) {
    const vm = buildMatchViewModel(raw(extra));
    assert.equal(vm.model.recommendedImplied, null, JSON.stringify(extra));
    assert.equal(vm.model.recommendedEdge, null);
  }
});

test('carte : un chiffre sans marge aberrant (0, 100, absent) n\'est jamais utilise', () => {
  for (const sans_marge of [0, 100, null, '', 'abc']) {
    const vm = buildMatchViewModel(raw({ pronostic: { market_id: 'over-25', source_chance: 'modele', sans_marge } }));
    assert.equal(vm.model.recommendedImplied, null, String(sans_marge));
  }
});

test('tableau : la ligne du pari retenu reprend exactement les chiffres de la carte', () => {
  const vm = buildMatchViewModel(raw(PUBLIE));
  const row = vm.model.marketTable.find(r => r.recommended);
  assert.ok(row, 'ligne du pari retenu presente');
  assert.equal(row.model, vm.recommendation ? vm.recommendation.probability : 59.8);
  assert.equal(row.market, 59.2);
  assert.equal(row.edge, 0.6);
  assert.equal(vm.model.marketTable.filter(r => r.recommended).length, 1);
});

test('tableau : jusqu\'a 8 lignes de markets_compared lues (pari retenu + marches de base sur la meme echelle)', () => {
  const extra = ['dc-1x', 'dc-x2', 'under-25', 'draw', 'away-win'].map((id, i) => ({ id, market: id, probability: 40 - i, consensus: 39 - i, edge: 1 }));
  const vm = buildMatchViewModel(raw({ markets_compared: raw({}).markets_compared.concat(extra) }));
  assert.ok(vm.model.marketTable.some(r => r.label === 'Match nul' || r.id === 'draw'));
  assert.ok(vm.model.marketTable.every(r => Number.isFinite(r.model)));
});
