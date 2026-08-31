const test = require('node:test');
const assert = require('node:assert/strict');
const { buildMatchViewModel } = require('../lib/match-view-model');

function base(overrides = {}) {
  return {
    id: 42,
    date: '2026-08-31 18:30',
    league: 'Serie A',
    league_id: 135,
    home: { id: 867, n: 'Lecce' },
    away: { id: 497, n: 'AS Roma' },
    ...overrides
  };
}

test('un modèle non disponible ne publie aucun chiffre de secours', () => {
  const vm = buildMatchViewModel(base({
    model_output_available: false,
    data_quality_score: 0,
    p1: 37, pn: 33, p2: 30,
    mc_scores: [{ score: '1-0', pct: 16 }],
    crit_home: { att: 0, def: 88, fr: 0 },
    crit_away: { att: 0, def: 88, fr: 0 }
  }));
  assert.equal(vm.model.available, false);
  assert.equal(vm.model.probabilities, null);
  assert.deepEqual(vm.model.scores, []);
  assert.equal(vm.comparison, null);
});

test('la météo historique sans provenance reste invisible', () => {
  const vm = buildMatchViewModel(base({ stade: { nom: 'Via del Mare', temp: '37C', desc: 'ciel dégagé' } }));
  assert.equal(vm.conditions.venue, 'Via del Mare');
  assert.equal(vm.conditions.weather, null);
});

test('les données fiables alimentent les cartes avancées', () => {
  const vm = buildMatchViewModel(base({
    model_output_available: true,
    data_quality_score: 75,
    p1: 45, pn: 27, p2: 28,
    model_probability: 68,
    pari_rec: 'BTTS Oui',
    mc_scores: [{ score: '1-1', pct: 14 }],
    simulation_count: 5000,
    crit_home: { source: 'api-sports-team-statistics', sample_size: 8, att: 58, def: 63, fr: 60 },
    crit_away: { source: 'api-sports-team-statistics', sample_size: 9, att: 54, def: 59, fr: 47 },
    events_home: { goals_avg: 1.6, conceded_avg: 1.1 },
    events_away: { goals_avg: 1.2, conceded_avg: 1.4 },
    match_stats_home: { xg: 1.4, possession: 53, shots_total: 12, shots_on: 5, corners: 6 },
    match_stats_away: { xg: 1.1, possession: 47, shots_total: 9, shots_on: 3, corners: 4 }
  }));
  assert.deepEqual(vm.model.probabilities, { home: 45, draw: 27, away: 28 });
  assert.deepEqual(vm.model.expectedGoals, { home: 1.4, away: 1.1 });
  assert.equal(vm.model.simulationCount, 5000);
  assert.equal(vm.comparison.rows.length, 5);
});

test('les patterns exigent une provenance et cinq matchs par équipe', () => {
  const sparse = { source: 'api-sports-fixture-events', games: 1, slots: Array(6).fill({ n: 0 }), slots_against: Array(6).fill({ n: 0 }) };
  const vm = buildMatchViewModel(base({ events_home: sparse, events_away: sparse }));
  assert.equal(vm.patterns, null);
});

test('les absences dupliquées sont dédupliquées et séparées par équipe', () => {
  const injury = { name: 'A. Test', team: 867, reason: 'Blessure', status: 'out' };
  const vm = buildMatchViewModel(base({ injuries: [injury, injury, { name: 'B. Test', team: 497, reason: 'Doute', status: 'uncertain' }] }));
  assert.equal(vm.players.absences.home.length, 1);
  assert.equal(vm.players.absences.away.length, 1);
});

test('aucune section joueurs ne prétend contenir une composition absente', () => {
  const vm = buildMatchViewModel(base());
  assert.equal(vm.players.lineups, null);
  assert.deepEqual(vm.players.watch, []);
  assert.deepEqual(vm.players.projections, []);
});
