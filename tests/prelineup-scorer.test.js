// Buteur le plus probable AVANT les compositions (lib/insights.js#scorerModel)
// et son branchement dans la carte « Marches joueurs » (18/09/2026).
// Cas reel a l'origine : Tottenham - Aston Villa, la carte proposait un
// remplacant jamais titularise (1 but en 87 minutes) et affichait 0 % pour
// les titulaires de Tottenham qui n'avaient pas encore marque.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { scorerModel } = require('../lib/insights');
const { buildMatchViewModel } = require('../lib/match-view-model');

const TEAM = 47, OPP = 66;
// 10 matchs de l'equipe, du plus recent (index 0) au plus ancien.
const FIXTURES = Array.from({ length: 10 }, (_, i) => ({ id: 9000 + i, date: `2026-09-${String(14 - i).padStart(2, '0')}` }));

// Onze de base generique + joueurs specifiques. spec(i) -> null (absent de la
// feuille) ou { starter, minutes, goals, shots_on }.
function history(teamId, players) {
  const rows = [];
  FIXTURES.forEach((f, i) => {
    players.forEach(p => {
      const s = p.spec(i);
      if (!s) return;
      rows.push({ fixture_id: f.id, date: f.date, player_id: p.id, team_id: teamId, name: p.name, position: p.position,
        starter: s.starter, minutes: s.minutes, goals: s.goals || 0, shots_on: s.shots_on == null ? null : s.shots_on,
        team_goals: 1, is_current_season: i < 4 });
    });
  });
  return rows;
}
const regular = (id, name, position, shotsOn) => ({ id, name, position, spec: () => ({ starter: true, minutes: 90, goals: 0, shots_on: shotsOn || null }) });
const baseEleven = teamId => [
  regular(teamId * 100 + 1, 'Gardien', 'Goalkeeper'),
  regular(teamId * 100 + 2, 'Defenseur A', 'Defender'), regular(teamId * 100 + 3, 'Defenseur B', 'Defender'),
  regular(teamId * 100 + 4, 'Defenseur C', 'Defender'), regular(teamId * 100 + 5, 'Defenseur D', 'Defender'),
  regular(teamId * 100 + 6, 'Milieu A', 'Midfielder'), regular(teamId * 100 + 7, 'Milieu B', 'Midfielder', 1)
];
const byName = (list, name) => list.find(c => c.name === name);

function tottenhamLike() {
  return baseEleven(TEAM).concat([
    // Avant-centre titulaire : 0 but mais 2 tirs cadres par match.
    { id: 1, name: 'Avant-centre Titulaire', position: 'Attacker', spec: () => ({ starter: true, minutes: 85, goals: 0, shots_on: 2 }) },
    // Ailier titulaire : 1 but sur les 10 matchs.
    { id: 2, name: 'Ailier Titulaire', position: 'Attacker', spec: i => ({ starter: true, minutes: 80, goals: i === 3 ? 1 : 0, shots_on: i % 2 ? 1 : null }) },
    { id: 3, name: 'Milieu Offensif', position: 'Midfielder', spec: () => ({ starter: true, minutes: 88, goals: 0, shots_on: 1 }) },
    { id: 4, name: 'Milieu Relayeur', position: 'Midfielder', spec: () => ({ starter: true, minutes: 90, goals: 0, shots_on: null }) },
    // Remplacant : jamais titulaire, 1 but en 87 minutes (le cas Alysson Edward).
    { id: 5, name: 'Remplacant Chanceux', position: 'Attacker', spec: i => i < 4 ? { starter: false, minutes: i === 0 ? 30 : 19, goals: i === 1 ? 1 : 0, shots_on: i === 1 ? 1 : null } : null }
  ]);
}

test('cas Tottenham : jamais un remplacant jamais titularise en buteur mis en avant', () => {
  const r = scorerModel.rankMatch({ home: { rows: history(TEAM, tottenhamLike()), teamId: TEAM, lambda: 1.6 } });
  assert.ok(r.pick, 'un buteur est propose');
  assert.notEqual(r.pick.name, 'Remplacant Chanceux');
  assert.ok(!r.shown.some(c => c.name === 'Remplacant Chanceux'), 'un remplacant n\'est pas un titulaire probable');
  assert.ok(r.shown.every(c => c.startProbability >= 0.5), 'seuls les titulaires probables sont mis en avant');
  assert.equal(r.pick.name, 'Avant-centre Titulaire', '2 tirs cadres par match sans marquer : le but va venir');
  const sub = byName(r.all, 'Remplacant Chanceux');
  assert.ok(sub.startProbability < 0.2, 'P(titulaire) du remplacant tres basse');
});

test('cas Tottenham : aucun titulaire a 0 %, aucune probabilite non finie', () => {
  const r = scorerModel.rankMatch({ home: { rows: history(TEAM, tottenhamLike()), teamId: TEAM, lambda: 1.6 } });
  r.all.forEach(c => {
    assert.ok(Number.isFinite(c.probability) && c.probability > 0, c.name + ' : ' + c.probability);
    assert.ok(Number.isFinite(c.displayProbability) && c.displayProbability > 0);
    assert.ok(c.displayProbability <= 45, 'affichage plafonne a 45 %');
  });
  assert.ok(!r.all.some(c => c.position === 'G'), 'jamais un gardien');
});

test('pas forcement l\'attaquant de pointe : un milieu qui cadre beaucoup passe devant un attaquant qui ne tire pas', () => {
  const players = baseEleven(TEAM).concat([
    { id: 10, name: 'Attaquant Discret', position: 'Attacker', spec: () => ({ starter: true, minutes: 80, goals: 0, shots_on: null }) },
    { id: 11, name: 'Milieu Frappeur', position: 'Midfielder', spec: i => ({ starter: true, minutes: 90, goals: i % 3 === 0 ? 1 : 0, shots_on: 2 }) }
  ]);
  const r = scorerModel.rankMatch({ home: { rows: history(TEAM, players), teamId: TEAM, lambda: 1.5 } });
  assert.equal(r.pick.name, 'Milieu Frappeur');
});

test('defense adverse : plus l\'equipe doit marquer (lambda du moteur), plus la probabilite monte', () => {
  const rows = history(TEAM, tottenhamLike());
  const faible = scorerModel.rankMatch({ home: { rows, teamId: TEAM, lambda: 0.8 } }).pick;
  const forte = scorerModel.rankMatch({ home: { rows, teamId: TEAM, lambda: 2.4 } }).pick;
  assert.equal(faible.name, forte.name);
  assert.ok(forte.probability > faible.probability * 1.8, `${forte.probability} vs ${faible.probability}`);
});

test('absent annonce (blessure) : jamais propose, meme s\'il etait le meilleur', () => {
  const rows = history(TEAM, tottenhamLike());
  const r = scorerModel.rankMatch({ home: { rows, teamId: TEAM, lambda: 1.6, absentNames: ['Avant-centre  titulaire'] } });
  assert.ok(!r.all.some(c => c.name === 'Avant-centre Titulaire'), 'nom compare sans casse ni espaces');
  assert.ok(r.pick && r.pick.name !== 'Remplacant Chanceux');
});

test('joueur parti (absent de l\'effectif actuel connu) : jamais propose', () => {
  const players = tottenhamLike();
  const rows = history(TEAM, players);
  const currentIds = players.map(p => p.id).filter(id => id !== 1);
  const r = scorerModel.rankMatch({ home: { rows, teamId: TEAM, lambda: 1.6, currentIds } });
  assert.ok(!r.all.some(c => c.id === 1));
  // Effectif partiel (moins de 11 joueurs : requete ratee) : personne n'est exclu.
  const partiel = scorerModel.rankMatch({ home: { rows, teamId: TEAM, lambda: 1.6, currentIds: [2, 3] } });
  assert.ok(partiel.all.some(c => c.id === 1));
});

test('titulaire disparu des 3 dernieres feuilles (blessure non annoncee) : plus un titulaire probable', () => {
  const players = baseEleven(TEAM).concat([
    { id: 20, name: 'Buteur Disparu', position: 'Attacker', spec: i => i >= 3 ? { starter: true, minutes: 90, goals: 1, shots_on: 3 } : null },
    { id: 21, name: 'Remplacant Du Buteur', position: 'Attacker', spec: i => i < 3 ? { starter: true, minutes: 85, goals: 0, shots_on: 1 } : { starter: false, minutes: 15, goals: 0, shots_on: null } }
  ]);
  const r = scorerModel.rankMatch({ home: { rows: history(TEAM, players), teamId: TEAM, lambda: 1.5 } });
  const disparu = byName(r.all, 'Buteur Disparu');
  assert.ok(disparu.startProbability < 0.5, String(disparu.startProbability));
  assert.ok(!r.shown.some(c => c.name === 'Buteur Disparu'));
});

test('recrue titulaire sur les 2 derniers matchs : titulaire probable (les matchs d\'avant son arrivee ne comptent pas)', () => {
  const players = baseEleven(TEAM).concat([
    { id: 30, name: 'Recrue', position: 'Attacker', spec: i => i < 2 ? { starter: true, minutes: 80, goals: 0, shots_on: 2 } : null }
  ]);
  const r = scorerModel.rankMatch({ home: { rows: history(TEAM, players), teamId: TEAM, lambda: 1.5 } });
  const recrue = byName(r.all, 'Recrue');
  assert.ok(recrue.startProbability >= 0.5, String(recrue.startProbability));
  assert.equal(recrue.startsLast, 2);
  assert.equal(recrue.teamMatchesLast, 2);
});

test('tirs cadres : null = 0 quand le match est couvert, jamais un taux gonfle', () => {
  // Deux profils identiques en buts ; l'un a des tirs cadres, l'autre null
  // (0 selon l'API) sur des matchs ou l'equipe a des tirs renseignes.
  const players = baseEleven(TEAM).concat([
    { id: 40, name: 'Cadre', position: 'Attacker', spec: () => ({ starter: true, minutes: 90, goals: 0, shots_on: 2 }) },
    { id: 41, name: 'Jamais Cadre', position: 'Attacker', spec: () => ({ starter: true, minutes: 90, goals: 0, shots_on: null }) }
  ]);
  const r = scorerModel.rankMatch({ home: { rows: history(TEAM, players), teamId: TEAM, lambda: 1.5 } });
  assert.ok(byName(r.all, 'Cadre').probability > byName(r.all, 'Jamais Cadre').probability * 2);
});

test('donnees abimees : jamais d\'exception, jamais de NaN', () => {
  const junk = [null, undefined, 42, 'x', {}, { player_id: 'abc' }, { player_id: 7, team_id: TEAM },
    { player_id: 8, team_id: TEAM, fixture_id: 1, minutes: 'NaN', starter: 'oui', goals: null, shots_on: 'deux', position: null, name: null },
    { player_id: 9, team_id: TEAM, fixture_id: 2, minutes: 90, starter: true, goals: 1, shots_on: 3, position: 'Attacker', name: 'Sans Date' }];
  for (const rows of [junk, [], null, undefined, 'pas un tableau']) {
    const r = scorerModel.rankMatch({ home: { rows, teamId: TEAM, lambda: 'NaN' }, away: null });
    assert.ok(Array.isArray(r.all) && Array.isArray(r.shown));
    r.all.forEach(c => { assert.ok(Number.isFinite(c.probability)); assert.ok(Number.isFinite(c.displayProbability)); });
  }
  assert.deepEqual(scorerModel.rankMatch(null).shown, []);
  assert.deepEqual(scorerModel.rankMatch(undefined).shown, []);
});

// ------------------------------------------------------ carte de la page
function raw(overrides) {
  return {
    id: 42, date: '2026-09-19 18:30', league: 'Premier League', league_id: 39,
    home: { id: TEAM, n: 'Tottenham' }, away: { id: OPP, n: 'Aston Villa' },
    player_history: { home: history(TEAM, tottenhamLike()), away: history(OPP, baseEleven(OPP).concat([
      { id: 60, name: 'Buteur Villa', position: 'Attacker', spec: i => ({ starter: true, minutes: 85, goals: i % 2 ? 1 : 0, shots_on: 2 }) }
    ])) },
    ...overrides
  };
}

test('carte Marches joueurs : titulaires probables, probabilites > 0, titularisations recentes exposees', () => {
  const vm = buildMatchViewModel(raw({ data_quality_score: 80, lambda_h: 1.6, lambda_a: 1.3 }));
  const list = vm.players.scoringThreat;
  assert.ok(list.length >= 2 && list.length <= 4);
  assert.ok(!list.some(p => p.name === 'Remplacant Chanceux'));
  list.forEach(p => {
    assert.ok(Number.isFinite(p.scoringProbability) && p.scoringProbability > 0 && p.scoringProbability <= 45, p.name);
    assert.ok(p.startsLast >= 1 && p.teamMatchesLast >= p.startsLast);
    assert.ok(!('startProbability' in p), 'aucune probabilite de titularisation publiee (decision du 04/09/2026)');
    assert.ok(['Tottenham', 'Aston Villa'].includes(p.team));
  });
  for (let i = 1; i < list.length; i++) assert.ok(list[i - 1].scoringProbability >= list[i].scoringProbability);
});

test('carte Marches joueurs : lambda du moteur utilise seulement quand sa sortie est fiable', () => {
  const fiable = buildMatchViewModel(raw({ data_quality_score: 80, lambda_h: 3, lambda_a: 0.5 })).players.scoringThreat;
  const nonFiable = buildMatchViewModel(raw({ data_quality_score: 0, lambda_h: 3, lambda_a: 0.5 })).players.scoringThreat;
  const spurs = l => l.find(p => p.team === 'Tottenham');
  assert.ok(spurs(fiable).scoringProbability > spurs(nonFiable).scoringProbability, 'lambda 3 retenu seulement si le modele est fiable');
});

test('carte Marches joueurs : un blesse annonce n\'apparait jamais', () => {
  const vm = buildMatchViewModel(raw({ injuries: [{ team: TEAM, name: 'Avant-centre Titulaire', reason: 'Genou', status: 'Missing Fixture' }] }));
  assert.ok(!vm.players.scoringThreat.some(p => p.name === 'Avant-centre Titulaire'));
});

test('carte Marches joueurs : sans historique joueur (visiteur non abonne), liste vide sans erreur', () => {
  const vm = buildMatchViewModel(raw({ player_history: undefined }));
  assert.deepEqual(vm.players.scoringThreat, []);
});

test('page match : la carte affiche les titularisations recentes, traduites dans les 7 langues', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'match-page.js'), 'utf8');
  const bloc = js.slice(js.indexOf('function threatsCard'), js.indexOf('const ALERTES_ABSENCE'));
  assert.match(bloc, /match_page\.stat_recent_starts/);
  assert.match(bloc, /p\.startsLast/);
  for (const loc of ['fr', 'en', 'es', 'es-mx', 'de', 'it', 'pt']) {
    const dict = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'i18n', 'dict', loc + '.json'), 'utf8'));
    assert.ok(dict.match_page.stat_recent_starts, loc);
    assert.ok(dict.match_page.players_note, loc);
  }
});

test('feuilles sans champ titulaire (trou de donnees) : 60 minutes jouees en tiennent lieu, jamais une carte vide', () => {
  const rows = history(TEAM, tottenhamLike()).map(r => ({ ...r, starter: null }));
  const r = scorerModel.rankMatch({ home: { rows, teamId: TEAM, lambda: 1.6 } });
  assert.ok(r.shown.length > 0);
  assert.notEqual(r.pick.name, 'Remplacant Chanceux');
  assert.ok(byName(r.all, 'Remplacant Chanceux').startProbability < 0.5);
});
