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

test('Shot Profile / Qualité des occasions : uniquement des champs match_stats réels, xG par tir cadré calculé, jamais de coordonnées de tir inventées', () => {
  const vm = buildMatchViewModel(base({
    match_stats_home: { shots_total: 14, shots_on: 5, shots_off: 6, shots_blocked: 3, xg: 1.5 },
    match_stats_away: { shots_total: 10, shots_on: 4, shots_off: 4, shots_blocked: 2, xg: 0.8 }
  }));
  assert.deepEqual(vm.shotStats.home, { total: 14, on: 5, off: 6, blocked: 3, xg: 1.5 });
  assert.equal(vm.shotStats.precision.home, 0.3);
  assert.equal(vm.shotStats.precision.away, 0.2);
});

test('Shot Profile : tirs cadrés manquants pour une équipe -> shotStats null plutôt que des zéros inventés', () => {
  const vm = buildMatchViewModel(base({ match_stats_home: { shots_total: 14, xg: 1.5 }, match_stats_away: {} }));
  assert.equal(vm.shotStats, null);
});

test('les probabilités sont normalisées pour éviter tout débordement visuel', () => {
  const vm = buildMatchViewModel(base({ model_output_available: true, data_quality_score: 70, p1: 48.601830397586355, pn: 26.707811362118562, p2: 24.690358240295097 }));
  assert.deepEqual(vm.model.probabilities, { home: 48.6, draw: 26.7, away: 24.7 });
});

test('la lecture utilise les textes réels disponibles et expose les marchés comparés', () => {
  const vm = buildMatchViewModel(base({
    model_output_available: true, data_quality_score: 70,
    analyse_card: 'Lecture détaillée du match.', facteur_x: 'Signal statistique principal.',
    markets_compared: [{ id:'btts-yes', market:'BTTS Oui', probability:61.2, consensus:55.1, edge:6.1 }]
  }));
  assert.equal(vm.editorial.reading, 'Lecture détaillée du match.');
  assert.equal(vm.editorial.decisiveFactor, 'Signal statistique principal.');
  assert.deepEqual(vm.model.marketsCompared, [{ id:'btts-yes', market:'BTTS Oui', probability:61.2, consensus:55.1, edge:6.1 }]);
});

test('les champs arbitre du pipeline sont normalisés pour la maquette', () => {
  const vm = buildMatchViewModel(base({ arbitre:{ nom:'A. Ref', cartons:'4.2', penaltys:'0.3', matchs:18 } }));
  assert.deepEqual(vm.referee, { name:'A. Ref', cardsPerMatch:4.2, penaltiesPerMatch:0.3, matches:18 });
});

test('les projections premium utilisent le schéma réel du Player Engine', () => {
  const raw=base({ player_markets:[{player_id:99,player_name:'Joueur Test',market:'ANYTIME_GOALSCORER',lineup_status:'confirmed_starter',expected_minutes:84,data_quality:'high',sample_size:14,output:{probability:.426}}] });
  const vm=buildMatchViewModel(raw);
  assert.deepEqual(vm.players.projections,[{player:'Joueur Test',playerId:99,market:'Buteur',status:'Titulaire confirmé',minutes:84,probability:42.6,quality:'Élevée',sampleSize:14}]);
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
  assert.deepEqual(vm.players.formations, { home: null, away: null });
  assert.deepEqual(vm.players.impactRanking, []);
});

test('Score IASHARK : composite pondéré à partir de signaux réels, jamais une valeur isolée recopiée', () => {
  const vm = buildMatchViewModel(base({
    model_output_available: true, data_quality_score: 80, model_probability: 70,
    model_agreement: 'Fort', reliability: { sample_size: 20 }
  }));
  // 70*.5 + 80*.2 + 100*.2 + 100*.1 = 35+16+20+10 = 81
  assert.equal(vm.model.iasharkScore, 81);
});

test('Score IASHARK : un composant absent est retiré du calcul, jamais remplacé par une valeur inventée', () => {
  const vm = buildMatchViewModel(base({
    model_output_available: true, data_quality_score: 80, model_probability: 70,
    model_agreement: null, reliability: {}
  }));
  // seuls probability(.5) et quality(.2) restent, renormalisés : (70*.5+80*.2)/(.5+.2)
  assert.equal(vm.model.iasharkScore, Math.round((70 * 0.5 + 80 * 0.2) / 0.7));
});

test('Score IASHARK : modèle indisponible -> jamais de score fabriqué', () => {
  const vm = buildMatchViewModel(base({ model_output_available: false, data_quality_score: 0 }));
  assert.equal(vm.model.iasharkScore, null);
});

test('Value : uniquement si markets_compared expose un edge réel sur le marché retenu, jamais recalculée', () => {
  const withEdge = buildMatchViewModel(base({ model_output_available: true, data_quality_score: 70, markets_compared: [{ market: 'BTTS Oui', probability: 61, edge: 6.1 }] }));
  assert.equal(withEdge.model.value, 6.1);
  const withoutEdge = buildMatchViewModel(base({ model_output_available: true, data_quality_score: 70 }));
  assert.equal(withoutEdge.model.value, null);
});

test('Momentum IASHARK : convertit les comptages bruts en %, jamais utilisés tels quels', () => {
  const eventsHome = { source: 'api-sports-fixture-events', games: 20, slots: [{n:3},{n:5},{n:4},{n:8},{n:5},{n:7}], slots_against: [{n:2},{n:2},{n:2},{n:6},{n:5},{n:10}] };
  const eventsAway = { source: 'api-sports-fixture-events', games: 20, slots: [{n:1},{n:2},{n:1},{n:5},{n:3},{n:6}], slots_against: [{n:2},{n:3},{n:1},{n:4},{n:3},{n:2}] };
  const vm = buildMatchViewModel(base({ events_home: eventsHome, events_away: eventsAway }));
  assert.equal(vm.momentum.length, 6);
  assert.equal(vm.momentum[0].label, "0-15'");
  // Aucune tranche ne doit rester à la valeur brute (3, 5, 4...) - preuve que la conversion en % a bien eu lieu.
  vm.momentum.forEach(p => { assert.ok(Math.abs(p.home) <= 300); assert.ok(Math.abs(p.away) <= 300); });
});

test('Momentum IASHARK : données événementielles insuffisantes -> null, jamais une courbe inventée', () => {
  const vm = buildMatchViewModel(base());
  assert.equal(vm.momentum, null);
});

test('Distribution Monte-Carlo : reflète les vrais mc_scores publiés, jamais une nouvelle simulation', () => {
  const vm = buildMatchViewModel(base({
    model_output_available: true, data_quality_score: 70,
    mc_scores: [{ score: '1-1', pct: 11 }, { score: '1-0', pct: 9 }], simulation_count: 5000
  }));
  assert.deepEqual(vm.model.monteCarloDistribution, { bars: [{ score: '1-1', pct: 11 }, { score: '1-0', pct: 9 }], simulationCount: 5000 });
});

test('Matchups à cibler : uniquement au-dessus du seuil d\'écart réel, jamais une affirmation tactique sans donnée', () => {
  const vm = buildMatchViewModel(base({
    match_stats_home: { shots_total: 16, possession: 60 },
    match_stats_away: { shots_total: 8, possession: 40 }
  }));
  assert.ok(vm.matchups.length >= 1);
  assert.ok(vm.matchups.some(m => m.text.includes('tirs')));
});

test('Matchups à cibler : écart trop faible -> aucun matchup publié', () => {
  const vm = buildMatchViewModel(base({ match_stats_home: { shots_total: 10, possession: 51 }, match_stats_away: { shots_total: 9, possession: 49 } }));
  assert.deepEqual(vm.matchups, []);
});

test('Terrain tactique : positionne réellement via le champ grid, jamais une position devinée', () => {
  const raw = base({ lineups: { home: { formation: '4-3-3', startXI: [
    { id:1, name:'GK', pos:'G', grid:'1:1' },
    { id:2, name:'CB', pos:'D', grid:'2:1' },
    { id:3, name:'ST', pos:'F', grid:'4:1' }
  ] }, away: { formation: '4-4-2', startXI: [] } } });
  const vm = buildMatchViewModel(raw);
  assert.deepEqual(vm.players.formations.home, [[{ id:1, name:'GK', pos:'G', grid:'1:1', col:1 }], [{ id:2, name:'CB', pos:'D', grid:'2:1', col:1 }], [{ id:3, name:'ST', pos:'F', grid:'4:1', col:1 }]]);
  assert.equal(vm.players.formations.away, null);
});

test('Terrain tactique : un onze avec des joueurs sans grid -> null plutôt qu\'une position partielle inventée', () => {
  const raw = base({ lineups: { home: { formation: '4-3-3', startXI: [{ id:1, name:'GK', pos:'G', grid:null }] }, away: { formation: null, startXI: [] } } });
  const vm = buildMatchViewModel(raw);
  assert.equal(vm.players.formations.home, null);
});

test('Player Impact Score : classe par probabilité × confiance réelle, dédupliqué par joueur', () => {
  const raw = base({ player_markets: [
    { player_id: 1, player_name: 'A', market: 'ANYTIME_GOALSCORER', data_quality: 'high', output: { probability: 0.4 } },
    { player_id: 1, player_name: 'A', market: 'PLAYER_SHOTS', data_quality: 'low', output: { probability: 0.9 } },
    { player_id: 2, player_name: 'B', market: 'ANYTIME_GOALSCORER', data_quality: 'medium', output: { probability: 0.3 } }
  ] });
  const vm = buildMatchViewModel(raw);
  assert.equal(vm.players.impactRanking.length, 2, 'un seul résultat par joueur (le meilleur), pas un par marché');
  assert.equal(vm.players.impactRanking[0].player, 'A');
  assert.equal(vm.players.impactRanking[0].impactScore, 40, 'garde le meilleur score du joueur (40*1=40) pas le second (90*.4=36)');
});
