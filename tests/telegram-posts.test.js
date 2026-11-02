'use strict';
// Chaine Telegram (lib/telegram-posts.js) : les 4 rendez-vous du plan du 03/11/2026.
// Dates fixes : l'horloge de la machine n'entre jamais dans ces essais.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync, spawnSync} = require('node:child_process');
const P = require('../lib/telegram-posts.js');

const RACINE = path.join(__dirname, '..');
const lireFichier = (...f) => fs.readFileSync(path.join(RACINE, ...f), 'utf8');

// Ce qui ne doit jamais partir, quel que soit le message.
const INTERDIT = /\bmises?\b|\bunités?\b|capital|espérance|bankroll|garanti|gagner à coup sûr|sûr de gagner|argent facile|comporte des risques|winamax|betclic|unibet|parions ?sport|\bpmu\b|bwin|zebet|pokerstars|vbet|feelingbet|genybet|netbet|1xbet|bet365|bookmaker|\bvalue\b|\bedge\b|\bBTTS\b|\bover\b|\bunder\b|marge|kelly|\bxg\b/i;
const EMOTICONE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const propre = (p) => {
  assert.ok(p && p.html, 'message attendu');
  assert.ok(!INTERDIT.test(p.html), 'mot interdit : ' + p.html);
  assert.ok(!EMOTICONE.test(p.html), 'emoticone : ' + p.html);
};

// ---------- Donnees d'essai ----------
const JOUR = '2026-11-01';
const bandeau = {genere_le: '2026-11-02T07:06:59.972Z',
  combines: [{t: 'x10', j: JOUR, n: 6, c: 8.73, r: 'loss'}, {t: 'x5', j: JOUR, n: 4, c: 4.09, r: 'win'}, {t: 'x5', j: '2026-10-31', n: 4, c: 4.07, r: 'loss'}],
  or: [{j: JOUR, n: 3, g: 2, p: 1, a: 0, v: 0}, {j: '2026-10-31', n: 3, g: 1, p: 2, a: 0, v: 0}]};
const pas = (h, a, p, c, r, cc) => ({j: JOUR, f: 1, h, a, m: 'x', p, c, r, cc});
const montantes = {montantes: [
  {rang: 1, objectifs: [], historique: [{j: '2026-10-31', h: 'V', a: 'W', p: 'Vieux pari', c: 1.5, r: 'perdu', cc: null}, pas('PEC Zwolle', 'ADO Den Haag', 'PEC Zwolle ou match nul', 1.4, 'gagne', 1.4)]},
  {rang: 2, objectifs: [], historique: [pas('Trabzonspor', 'Gaziantep FK', 'Plus de 2,5 buts', 1.4, 'perdu', null)]},
  {rang: 3, objectifs: [], historique: [pas('Eintracht Frankfurt', 'Hamburger SV', 'Plus de 2,5 buts', 1.41, 'gagne', 1.41)]}]};
const bilan = {jour: JOUR, offert: null, selection_or: null, paris_simples: {jour: JOUR, gagnes: 55, perdus: 34, annules: 0, en_attente: 1}};
const registre = {matchs: [{jour: JOUR, fixture_id: 1575205, match: 'Eintracht Frankfurt - Hamburger SV', pari: 'Over 2.5', market_id: 'over-25', cote_affichee: 1.41}]};
const buteurs = [{joueur: 'Samuel Essende', domicile: 'BSC Young Boys', exterieur: 'FC Zurich', verdict: 'marque'}, {joueur: 'Dušan Vlahović', domicile: 'Kasımpaşa', exterieur: 'Beşiktaş', verdict: 'pas_marque'}];
const complet = {jour: JOUR, bandeau, montantes, bilan, registre, archiveOffert: {market: 'over-25', result: 'win'}, buteurs};

const hist = (equipe, ids) => ids.flatMap((pid, i) => [1, 2, 3, 4, 5].map((f) => ({fixture_id: equipe * 100 + f, player_id: pid, name: 'J' + pid, minutes: 90, date: '2026-10-0' + f})));
const eq = (base) => Array.from({length: 11}, (_, i) => ({id: base + i, name: 'J' + (base + i)}));
const psg = {id: 10, date: '2026-11-03 21:00', status: 'NS', league: 'UEFA Champions League', league_key: 'ldc', analysis_tier: 'FULL_ANALYSIS', league_reliability: 'validee', has_signal: true, no_signal: false,
  home: {n: 'Villarreal', id: 533}, away: {n: 'Paris Saint Germain', id: 85}, c1: '4.77', c2: '1.60',
  player_history: {home: hist(1, eq(100).map((p) => p.id)), away: hist(2, eq(200).map((p) => p.id))}, current_squads: {}};
const compoApi = {home: {startXI: eq(100), substitutes: [{id: 300, name: 'B'}]}, away: {startXI: eq(200), substitutes: [{id: 301, name: 'C'}]}};

// ---------- 1. Hier ----------
test('Hier : tout ce qu\'on a donne la veille, gagnes ET perdus', () => {
  const p = P.hier(complet);
  propre(p);
  assert.strictEqual(p.slot, 'hier');
  assert.match(p.html, /Hier, dimanche 1er novembre/);
  assert.match(p.html, /Petit combiné \(4 matchs, cote 4,09\) : <b>gagné<\/b>/);
  assert.match(p.html, /Grand combiné \(6 matchs, cote 8,73\) : <b>perdu<\/b>/);
  assert.match(p.html, /Samuel Essende \(BSC Young Boys - FC Zurich\) : a marqué/);
  assert.match(p.html, /Dušan Vlahović \(Kasımpaşa - Beşiktaş\) : n'a pas marqué/);
  assert.match(p.html, /Montante 1 : pari gagné, cote totale 1,40/);
  assert.match(p.html, /Montante 2 : pari perdu, retour au premier pari/);
  assert.match(p.html, /Sélection en or<\/b> : 2 gagnés, 1 perdu/);
  assert.match(p.html, /- Trabzonspor - Gaziantep FK : Plus de 2,5 buts, cote 1,40 : perdu/);
  assert.match(p.html, /Match offert<\/b> : Eintracht Frankfurt - Hamburger SV, Plus de 2,5 buts, cote 1,41 : gagné/);
  assert.match(p.html, /55 gagnés, 34 perdus, 1 en attente/);
  assert.ok(!/Vieux pari/.test(p.html), 'seulement la veille');
  assert.ok(!/%|taux/i.test(p.html), 'aucun taux de reussite');
});

test('Hier : perdus jamais caches, meme un jour tout perdu', () => {
  const p = P.hier({jour: JOUR, bandeau: {combines: [{t: 'x5', j: JOUR, n: 4, c: 4, r: 'loss'}, {t: 'x10', j: JOUR, n: 6, c: 9, r: 'loss'}], or: [{j: JOUR, n: 3, g: 0, p: 3, a: 0, v: 0}]},
    bilan: {jour: JOUR, paris_simples: {jour: JOUR, gagnes: 0, perdus: 40, annules: 0, en_attente: 0}}});
  assert.strictEqual((p.html.match(/<b>perdu<\/b>/g) || []).length, 2);
  assert.match(p.html, /0 gagné, 3 perdus/);
  assert.match(p.html, /0 gagné, 40 perdus/);
});

test('Hier : une donnee absente, la ligne n\'apparait pas ; rien du tout, pas de message', () => {
  const sans = (champ, motif) => {
    const p = P.hier({...complet, [champ]: null});
    assert.ok(p);
    assert.ok(!motif.test(p.html), champ + ' : ' + p.html);
    propre(p);
  };
  sans('buteurs', /buteurs? du jour/i);
  sans('archiveOffert', /Match offert/);
  sans('registre', /Match offert/);
  sans('montantes', /Montante \d/);
  sans('bandeau', /combiné|Sélection en or/);
  sans('bilan', /paris simples/i);
  assert.strictEqual(P.hier({jour: JOUR}), null);
  assert.strictEqual(P.hier({...complet, jour: 'hier'}), null);
  // Fichiers d'un autre jour : rien.
  assert.strictEqual(P.hier({jour: '2026-10-01', bandeau, montantes, bilan, registre, buteurs: null}), null);
  // Un seul combine connu : l'autre ligne n'apparait pas.
  const un = P.hier({jour: JOUR, bandeau: {combines: [{t: 'x5', j: JOUR, n: 4, c: 4.09, r: 'win'}]}});
  assert.ok(/Petit combiné/.test(un.html) && !/Grand combiné/.test(un.html));
  // Detail de la Selection en or different du compte : le compte reste, pas le detail.
  const faux = P.hier({jour: JOUR, bandeau: {or: [{j: JOUR, n: 3, g: 3, p: 0, a: 0, v: 0}]}, montantes});
  assert.match(faux.html, /3 gagnés, 0 perdu/);
  assert.ok(!/- PEC Zwolle/.test(faux.html));
});

test('Hier : le match offert regle seulement par le meme marche', () => {
  assert.ok(!/Match offert/.test(P.hier({...complet, archiveOffert: {market: 'under-25', result: 'win'}}).html));
  assert.ok(!/Match offert/.test(P.hier({...complet, registre: {matchs: [{...registre.matchs[0], masque: true}]}}).html), 'pari encore masque');
  const deux = {matchs: [registre.matchs[0], {...registre.matchs[0], fixture_id: 2}]};
  assert.ok(!/Match offert/.test(P.hier({...complet, registre: deux}).html), 'deux offres : jamais deviner');
  // L'archive : seulement un pari publie avant le coup d'envoi.
  assert.strictEqual(P.ligneArchive([{market: 'a', published_at: '2026-11-01T18:00:00Z', kickoff_at: '2026-11-01T16:00:00Z'}]), null);
  assert.strictEqual(P.ligneArchive([{market: 'a', published_at: '2026-11-01T10:00:00Z', kickoff_at: '2026-11-01T16:00:00Z'}]).market, 'a');
  assert.strictEqual(P.ligneArchive(null), null);
});

const feuille = (id, buts, extra) => Object.assign({fixture: {id, status: {short: 'FT'}}, teams: {home: {id: 1}, away: {id: 2}}, score: {fulltime: {home: buts.filter((b) => b.t === 1).length, away: buts.filter((b) => b.t === 2).length}, halftime: {home: 0, away: 0}},
  goals: {home: 0, away: 0},
  events: buts.map((b) => ({type: 'Goal', detail: b.d || 'Normal Goal', team: {id: b.t}, player: {id: b.j}, time: {elapsed: b.m || 30}})).concat([{type: 'Card', detail: 'Yellow Card', team: {id: 1}, player: {id: 9}, time: {elapsed: 10}}]),
  players: [{players: [{player: {id: 8651}, statistics: [{games: {minutes: 90}}]}, {player: {id: 7}, statistics: [{games: {minutes: 0}}]}]}]}, extra);

test('Buteurs d\'hier : a marque, n\'a pas marque, n\'a pas joue, et rien sans liste des buts juste', () => {
  const b = {joueur_id: 8651};
  assert.strictEqual(P.verdictButeur(b, feuille(1, [{t: 1, j: 8651}])), 'marque');
  assert.strictEqual(P.verdictButeur(b, feuille(1, [{t: 1, j: 5}])), 'pas_marque');
  assert.strictEqual(P.verdictButeur(b, feuille(1, [{t: 2, j: 8651, d: 'Own Goal'}])), 'pas_marque', 'contre son camp : pas un but de buteur');
  assert.strictEqual(P.verdictButeur({joueur_id: 7}, feuille(1, [{t: 1, j: 5}])), 'pas_joue');
  assert.strictEqual(P.verdictButeur(b, null), 'verif');
  const fx = feuille(1, [{t: 1, j: 8651}]); fx.score.fulltime.home = 3;
  assert.strictEqual(P.verdictButeur(b, fx), 'verif', 'score different de la liste des buts');
  assert.strictEqual(P.verdictButeur(b, feuille(1, [], {fixture: {id: 1, status: {short: 'PST'}}})), 'annule');
  assert.strictEqual(P.verdictButeur(b, feuille(1, []), 'retire'), 'retire');
  // Le ticket : les deux joueurs, jamais un seul en silence ; sans feuille lue, pas de ligne.
  const ligne = {contenu: {buteurs: [{joueur: 'A', joueur_id: 8651, fixture_id: 1, domicile: 'X', exterieur: 'Y'}, {joueur: 'B', joueur_id: 3, fixture_id: 2, domicile: 'Z', exterieur: 'W'}]}, etats: {}};
  const r = P.buteursHier(ligne, [feuille(1, [{t: 1, j: 8651}])]);
  assert.deepStrictEqual(r.map((x) => x.verdict), ['marque', 'verif']);
  assert.strictEqual(P.buteursHier(ligne, null), null);
  assert.strictEqual(P.buteursHier(null, []), null);
});

// ---------- 2. Le match offert ----------
const offertM = {id: 1550185, is_free: true, status: 'NS', date: '2026-11-02 18:30', league: 'Serie A', league_key: 'seriea', home: {n: 'Sassuolo', id: 488}, away: {n: 'Fiorentina', id: 502},
  // Le pari ne doit jamais sortir, meme present dans les donnees.
  pari_rec: 'PARI SECRET', cote_rec: 1.77, chance_iashark: 58, market_id: 'x',
  classement: {home: {rank: 15, pts: 8, played: 9}, away: {rank: 17, pts: 5, played: 9}},
  h2h: [{home: 'Fiorentina', away: 'Sassuolo', s: '0-0', w: 'N'}, {home: 'Sassuolo', away: 'Fiorentina', s: '3-1', w: '1'}, {home: 'Fiorentina', away: 'Sassuolo', s: '2-1', w: '2'}],
  form_home: Array(5).fill({result: 'L'}), form_away: Array(5).fill({result: 'W'})};
const offertHome = {matchs: [offertM]}, MIDI = '2026-11-02 12:05';

test('Match offert : l\'affiche, l\'heure, 2 faits, le lien du compte gratuit, jamais le pari', () => {
  const p = P.offert(offertHome, {matchs: [offertM]}, MIDI);
  propre(p);
  assert.strictEqual(p.slot, 'offert');
  assert.match(p.html, /Le match offert : Sassuolo – Fiorentina/);
  assert.match(p.html, /Serie A · lundi 2 novembre · 18h30/);
  assert.match(p.html, /Classement : Sassuolo 15e \(8 points\), Fiorentina 17e \(5 points\)\./);
  // Recompte par les scores : le 1er match du fichier est un nul, le 3e une victoire de la Fiorentina a domicile.
  assert.match(p.html, /Leurs 3 derniers face-à-face : 1 victoire de Sassuolo, 1 victoire de Fiorentina, 1 nul\./);
  assert.ok(p.html.includes('https://iashark.com/fr/match.html?id=1550185&amp;utm_source=telegram&amp;utm_campaign=offert'), 'lien echappe pour le mode HTML de Telegram');
  assert.match(p.html, /compte gratuit/);
  const tout = JSON.stringify(p);
  assert.ok(!/PARI SECRET|1,77|1\.77|58|%/.test(tout), tout);
  assert.ok(p.html.length <= 1024, 'la legende photo est limitee a 1024 caracteres');
});

test('Match offert : faits absents, ligne absente ; seulement celui du jour, pas encore commence', () => {
  const {classement, h2h, ...reste} = offertM;
  const p = P.offert({matchs: [reste]}, {matchs: [reste]}, MIDI);
  assert.match(p.html, /Sur leurs 5 derniers matchs : Sassuolo 0 victoire, 0 nul, 5 défaites ; Fiorentina 5 victoires, 0 nul, 0 défaite\./);
  const nu = {id: 1, is_free: true, status: 'NS', date: '2026-11-02 18:30', league: 'Serie A', home: {n: 'A'}, away: {n: 'B'}};
  assert.ok(!/Classement|face-à-face|derniers matchs/.test(P.offert({matchs: [nu]}, null, MIDI).html));
  assert.deepStrictEqual(P.faitsPublics(nu), []);
  assert.strictEqual(P.offert(offertHome, null, '2026-11-03 12:05'), null, 'un autre jour');
  assert.strictEqual(P.offert(offertHome, null, '2026-11-02 18:30'), null, 'deja commence');
  assert.strictEqual(P.offert({matchs: [{...offertM, status: '1H'}]}, null, MIDI), null);
  assert.strictEqual(P.offert({matchs: [{...offertM, is_free: false}]}, null, MIDI), null, 'jamais un match non designe');
  assert.strictEqual(P.offert(offertHome, null, 'midi'), null);
  // Fiche fausse (un autre club dans le face-a-face) : pas de fait.
  const faux = {...offertM, classement: null, form_home: null, h2h: [{home: 'Milan', away: 'Sassuolo', s: '1-0'}, ...offertM.h2h]};
  assert.deepStrictEqual(P.faitsPublics(faux), []);
});

// ---------- 3. Le gros match ----------
const mk = (id, league_key, h, a, heure, extra) => ({id, league_key, league: league_key, date: '2026-11-03 ' + (heure || '21:00'), status: 'NS', home: {n: h}, away: {n: a}, ...extra});
test('Gros match : Ligue des champions, puis clubs francais, puis les plus gros championnats', () => {
  const choix = (...l) => { const g = P.grosMatch(l, '2026-11-03'); return g && g.id; };
  const ldc = mk(1, 'ldc', 'Feyenoord', 'Inter'), fr = mk(2, 'ligue1', 'Lorient', 'Auxerre'), pl = mk(3, 'premier', 'Arsenal', 'Chelsea'), liga = mk(4, 'laliga', 'Real Madrid', 'Barcelona');
  const a = mk(5, 'seriea', 'Inter', 'Juventus'), b = mk(6, 'bundesliga', 'Bayern Munich', 'Borussia Dortmund'), el = mk(7, 'el', 'Ajax', 'Porto');
  assert.strictEqual(choix(pl, fr, ldc), 1);
  assert.strictEqual(choix(pl, fr), 2, 'club francais avant la Premier League');
  assert.strictEqual(choix(liga, pl), 3);
  assert.strictEqual(choix(a, liga), 4);
  assert.strictEqual(choix(b, a), 5);
  assert.strictEqual(choix(el, b), 6);
  // Un club francais en coupe d'Europe passe avant les championnats etrangers.
  assert.strictEqual(choix(pl, mk(8, 'el', 'Lyon', 'Ajax')), 8);
  // Dans la meme competition : le club francais le plus suivi, puis les grandes equipes, puis les cotes serrees.
  assert.strictEqual(choix(mk(9, 'ldc', 'Bodo/Glimt', 'Lille', '21:00', {c1: 1.85, c2: 3.9}), mk(10, 'ldc', 'Villarreal', 'Paris Saint Germain', '21:00', {c1: 4.77, c2: 1.6}), mk(11, 'ldc', 'Atletico Madrid', 'Bayern München')), 10);
  assert.strictEqual(choix(mk(12, 'ldc', 'Lask Linz', 'Slovan Bratislava'), mk(13, 'ldc', 'Atletico Madrid', 'Bayern München')), 13);
  assert.strictEqual(choix(mk(14, 'premier', 'Burnley', 'Leeds', '21:00', {c1: 2, c2: 4}), mk(15, 'premier', 'Fulham', 'Brentford', '21:00', {c1: 2.5, c2: 2.6})), 15);
});
test('Gros match : pas le match offert, pas sans pari annonce, seulement le soir, jamais une ligue voisine', () => {
  const choix = (...l) => { const g = P.grosMatch(l, '2026-11-03'); return g && g.id; };
  assert.strictEqual(choix(mk(1, 'ldc', 'A', 'B', '21:00', {is_free: true}), mk(2, 'premier', 'C', 'D')), 2);
  assert.strictEqual(choix(mk(1, 'ligue1', 'Lorient', 'Brest', '20:45', {no_signal: true, has_signal: false}), mk(2, 'premier', 'C', 'D')), 2);
  assert.strictEqual(choix(mk(1, 'ldc', 'A', 'B', '17:30'), mk(2, 'premier', 'C', 'D', '18:00')), 2, 'soir : a partir de 18 h');
  assert.strictEqual(choix(mk(1, 'brazil_seriea', 'A', 'B')), null, 'Serie A du Bresil : pas la Serie A');
  assert.strictEqual(choix(mk(1, 'libertadores', 'A', 'B')), null);
  assert.strictEqual(choix(mk(1, 'ligue2', 'Reims', 'Sochaux')), null);
  assert.strictEqual(choix(mk(1, 'ldc', 'A', 'B', '21:00', {status: 'PST'})), null, 'match reporte');
  assert.strictEqual(P.grosMatch([{...mk(1, 'ldc', 'A', 'B'), date: '2026-11-04 21:00'}], '2026-11-03'), null, 'un autre jour');
  assert.strictEqual(P.grosMatch(null, '2026-11-03'), null);
  // Toujours le meme match, quel que soit l'ordre du fichier.
  const l = [mk(1, 'ldc', 'A', 'B'), mk(2, 'ldc', 'C', 'D'), mk(3, 'ldc', 'E', 'F')];
  assert.strictEqual(P.grosMatch(l, '2026-11-03').id, P.grosMatch(l.slice().reverse(), '2026-11-03').id);
});

// ---------- 3 bis. Les compos ----------
const proteges = {pari_rec: 'Victoire Exterieur', market_id: 'away-win', cote_rec: 1.61, chance_iashark: 61};
test('Compos : absents et remplacants, faits de la composition, et 1 seul prono avec cote et chance', () => {
  // 200 (titulaire habituel) sur le banc, 201 pas sur la feuille ; 100 a 110 tous titulaires.
  const away = {startXI: eq(202).slice(0, 9).concat(eq(400).slice(0, 2)), substitutes: [{id: 200, name: 'J200'}, {id: 500, name: 'X'}]};
  const prono = P.pronoAppel(psg, proteges, {});
  const p = P.compos(psg, {home: compoApi.home, away}, prono);
  propre(p);
  assert.match(p.html, /Les compos : Villarreal – PSG/);
  assert.match(p.html, /Ligue des champions · 21h00/);
  assert.match(p.html, /<b>Villarreal<\/b> : tous ses joueurs les plus utilisés sont titulaires\./);
  assert.match(p.html, /Pas sur la feuille de match : J201/);
  assert.match(p.html, /Sur le banc au coup d'envoi : J200/);
  assert.ok(!/J400/.test(p.html), 'un titulaire sans historique n\'est pas cite');
  assert.match(p.html, /Notre prono : <b>[^<]+<\/b>\nCote 1,61, chance calculée 61 %/);
  assert.strictEqual((p.html.match(/Notre prono/g) || []).length, 1);
  assert.ok(p.html.includes('utm_source=telegram&amp;utm_campaign=compos'));
});

test('Compos : composition non publiee ou incomplete, pas de message ; jamais d\'invention', () => {
  assert.strictEqual(P.compos(psg, null, null), null);
  assert.strictEqual(P.compos(psg, {home: compoApi.home}, null), null, 'une seule equipe');
  assert.strictEqual(P.compos(psg, {home: compoApi.home, away: {startXI: eq(200).slice(0, 10), substitutes: [{id: 1}]}}, null), null, '10 titulaires');
  assert.strictEqual(P.compos(psg, {home: compoApi.home, away: {startXI: eq(200), substitutes: []}}, null), null, 'banc vide : on ne dit pas « absent »');
  // Pas d'historique : rien a dire, pas de message.
  assert.strictEqual(P.compos({...psg, player_history: null}, compoApi, null), null);
  // Feuille sans numero de joueur, ou trop d'absents : la ligne de cette equipe ne part pas.
  const sansId = {home: {startXI: eq(100).map((x) => ({...x, id: null})), substitutes: [{id: 1, name: 'B'}]}, away: compoApi.away};
  assert.ok(!/Villarreal<\/b>/.test(P.compos(psg, sansId, null).html));
  const autres = {home: {startXI: eq(700), substitutes: [{id: 1, name: 'B'}]}, away: compoApi.away};
  assert.ok(!/Villarreal<\/b>/.test(P.compos(psg, autres, null).html));
  // Un joueur parti du club (hors de l'effectif actuel) n'est pas dit absent.
  const cles = P.joueursCles(psg.player_history.home, eq(100).slice(1).map((x) => ({player_id: x.id})));
  assert.ok(!cles.some((x) => x.id === '100') && cles.length === 10);
  assert.strictEqual(P.joueursCles(hist(1, [1]).slice(0, 2), null), null, 'moins de 3 matchs');
});

test('Prono d\'appel : jamais un pari d\'un combine ou de la Selection en or, jamais au-dessus de la cote', () => {
  const ok = P.pronoAppel(psg, proteges, {});
  assert.deepStrictEqual([ok.coteTxt, ok.chance], ['1,61', 61]);
  assert.strictEqual(P.pronoAppel(psg, proteges, {10: true}), null, 'le match est dans un ticket');
  assert.strictEqual(P.pronoAppel(psg, proteges, null), null, 'tickets illisibles : prudence');
  assert.strictEqual(P.pronoAppel(psg, null, {}), null, 'base illisible');
  assert.strictEqual(P.pronoAppel(psg, {...proteges, chance_iashark: 70}, {}), null, '70 % au-dessus de la cote 1,61 (62 %)');
  assert.strictEqual(P.pronoAppel(psg, {...proteges, chance_iashark: null}, {}), null);
  assert.strictEqual(P.pronoAppel(psg, {...proteges, pari_rec: ''}, {}), null);
  assert.strictEqual(P.pronoAppel({...psg, league_reliability: 'en_test'}, proteges, {}), null);
  assert.strictEqual(P.pronoAppel({...psg, analysis_tier: 'LIMITED_DATA'}, proteges, {}), null);
  const ids = P.matchsDesTickets([{type: 'or', contenu: {paris: [{fixture_id: 1}]}}, {type: 'x5', contenu: {jambes: [{fixture_id: 2}]}}]);
  assert.deepStrictEqual(Object.keys(ids).sort(), ['1', '2']);
  assert.strictEqual(P.matchsDesTickets(null), null);
  // Le bookmaker de la base n'est jamais repris.
  const n = P.compos(psg, compoApi, P.pronoAppel(psg, {...proteges, cote_bookmaker: 'Winamax', cote_source: 'anj'}, {}));
  propre(n);
});

const repFixture = (st) => ({response: [{fixture: {id: 10, status: {short: st}}}]});
const repCompo = {response: [
  {team: {id: 533}, startXI: eq(100).map((x) => ({player: x})), substitutes: [{player: {id: 300, name: 'B'}}]},
  {team: {id: 85}, startXI: eq(200).map((x) => ({player: x})), substitutes: [{player: {id: 301, name: 'C'}}]}]};
const flux = (maintenant, reponses, extra) => {
  const appels = [];
  const api = async (c) => { appels.push(c); return c.startsWith('fixtures/lineups') ? reponses.compo : reponses.fx; };
  return P.composDuSoir({matchs: [psg], maintenant, fenetreMinutes: 70, api, lireProteges: async () => proteges, lireTickets: async () => [], ...extra})
    .then((p) => ({p, appels}));
};
test('Passage des compos : aucun appel hors de la fenetre, 2 appels dedans, rien si pas publiee', async () => {
  let r = await flux('2026-11-03 17:00', {fx: repFixture('NS'), compo: repCompo});
  assert.deepStrictEqual([r.p, r.appels.length], [null, 0], 'trop tot : aucun appel');
  r = await flux('2026-11-03 21:00', {fx: repFixture('NS'), compo: repCompo});
  assert.deepStrictEqual([r.p, r.appels.length], [null, 0], 'coup d\'envoi passe : aucun appel');
  r = await flux('2026-11-03 20:00', {fx: repFixture('NS'), compo: repCompo});
  assert.strictEqual(r.p.slot, 'compos');
  assert.strictEqual(r.appels.length, 2);
  assert.match(r.p.html, /Notre prono/);
  // Composition pas encore la (reponse vide, API en panne) : pas de message.
  r = await flux('2026-11-03 20:50', {fx: repFixture('NS'), compo: {response: []}});
  assert.strictEqual(r.p, null);
  r = await flux('2026-11-03 20:50', {fx: repFixture('NS'), compo: null});
  assert.strictEqual(r.p, null);
  // Match commence ou reporte, statut illisible : pas de composition lue.
  for (const fx of [repFixture('1H'), repFixture('PST'), null]) {
    r = await flux('2026-11-03 20:50', {fx, compo: repCompo});
    assert.deepStrictEqual([r.p, r.appels.length], [null, 1]);
  }
  // Tickets illisibles : le message part sans prono.
  r = await flux('2026-11-03 20:00', {fx: repFixture('NS'), compo: repCompo}, {lireTickets: async () => null});
  assert.ok(r.p && !/Notre prono/.test(r.p.html));
});

// ---------- 4. Le debat ----------
const fin = (id, h, a, buts, extra) => Object.assign({fixture: {id, status: {short: 'FT'}}, teams: {home: {id: h}, away: {id: a}},
  score: {fulltime: {home: buts.filter((t) => t === h).length, away: buts.filter((t) => t === a).length}},
  events: [{type: 'Card', detail: 'Yellow Card', team: {id: h}, time: {elapsed: 5}}].concat(buts.map((t) => ({type: 'Goal', detail: 'Normal Goal', team: {id: t}, player: {id: 1}, time: {elapsed: 30}})))}, extra);
const mD = (id, h, a) => ({id, league: 'UEFA Champions League', league_key: 'ldc', date: '2026-11-03 21:00', status: 'NS', home: {n: h, id: id * 10 + 1}, away: {n: a, id: id * 10 + 2}, pari_rec: 'PARI SECRET', cote_rec: 1.5});

test('Debat : scores de l\'API controles par la liste des buts, une question ouverte en une phrase', () => {
  const a = mD(1, 'Villarreal', 'Paris Saint Germain'), b = mD(2, 'Arsenal', 'Chelsea');
  const p = P.debat([{m: a, fx: fin(1, 11, 12, [12, 12, 11])}, {m: b, fx: fin(2, 21, 22, [])}]);
  propre(p);
  assert.strictEqual(p.slot, 'debat');
  assert.match(p.html, /Villarreal 1-2 PSG \(Ligue des champions\)/);
  assert.match(p.html, /Arsenal 0-0 Chelsea/);
  assert.strictEqual((p.html.match(/\?/g) || []).filter(Boolean).length, 2, 'la question et l\'invitation');
  assert.match(p.html, /PSG gagne chez Villarreal : exploit ou simple logique, selon vous \?/);
  assert.ok(p.html.endsWith(P.INVITATION));
  assert.ok(!/PARI SECRET|1,5/.test(p.html));
});

test('Debat : score different de la liste des buts ou match pas fini, jamais publie', () => {
  const a = mD(1, 'A', 'B'), b = mD(2, 'C', 'D');
  const faux = fin(1, 11, 12, [11]); faux.score.fulltime.home = 2; // API : 2-0 au score, 1 but dans la liste (cas du 24/10/2026)
  assert.strictEqual(P.scoreVerifie(faux), null);
  const p = P.debat([{m: a, fx: faux}, {m: b, fx: fin(2, 21, 22, [21])}]);
  assert.ok(!/A 2-0|A 1-0/.test(p.html), 'score faux : match non cite');
  assert.match(p.html, /C 1-0 D/);
  assert.strictEqual(P.debat([{m: a, fx: faux}]), null, 'aucun score verifie : pas de message');
  assert.strictEqual(P.debat([{m: a, fx: fin(1, 11, 12, [11], {fixture: {id: 1, status: {short: '2H'}}})}]), null, 'pas termine');
  assert.strictEqual(P.debat([{m: a, fx: fin(1, 99, 12, [99])}]), null, 'une autre equipe que celle de la fiche');
  assert.strictEqual(P.debat([{m: a, fx: null}]), null);
  assert.strictEqual(P.debat([]), null);
  assert.strictEqual(P.scoreVerifie(fin(1, 11, 12, [], {events: []})), null, 'sans evenements : pas de controle possible');
});

test('Debat : prolongation et tirs au but controles, questions selon le score', () => {
  const ap = fin(1, 11, 12, [11, 12], {fixture: {id: 1, status: {short: 'AET'}}, goals: {home: 2, away: 1}});
  ap.events.push({type: 'Goal', detail: 'Normal Goal', team: {id: 11}, player: {id: 3}, time: {elapsed: 105}});
  assert.deepStrictEqual([P.scoreVerifie(ap).texte, P.scoreVerifie(ap).suite], ['2-1', ' après prolongation']);
  const tab = fin(1, 11, 12, [11, 12], {fixture: {id: 1, status: {short: 'PEN'}}, goals: {home: 1, away: 1}, score: {fulltime: {home: 1, away: 1}, penalty: {home: 4, away: 3}}});
  tab.events.push({type: 'Goal', detail: 'Penalty', comments: 'Penalty Shootout', team: {id: 11}, player: {id: 3}, time: {elapsed: 120}});
  assert.strictEqual(P.scoreVerifie(tab).suite, ' après prolongation, 4-3 aux tirs au but');
  const fauxAp = fin(1, 11, 12, [11, 12], {fixture: {id: 1, status: {short: 'AET'}}, goals: {home: 2, away: 1}});
  assert.strictEqual(P.scoreVerifie(fauxAp), null, 'but de la prolongation absent de la liste');
  const q = (buts) => P.debat([{m: mD(1, 'Lens', 'Como'), fx: fin(1, 11, 12, buts)}]).html;
  assert.match(q([11, 12]), /Lens - Como, 1-1 : qui a le plus à regretter ce soir \?/);
  assert.match(q([11, 11, 11]), /Lens gagne de 3 buts : ce score dit-il tout du match, selon vous \?/);
  assert.match(q([11]), /Lens gagne à domicile contre Como : mérité ou non, selon vous \?/);
});

test('Passage du debat : 1 seul appel pour 5 matchs au plus, seulement ceux deja commences', async () => {
  const l = [1, 2, 3, 4, 5, 6, 7].map((i) => mD(i, 'E' + i, 'F' + i)).concat([{...mD(8, 'G', 'H'), date: '2026-11-03 23:45'}]);
  const appels = [];
  const api = async (c) => { appels.push(c); return {response: [fin(1, 11, 12, [11])]}; };
  const p = await P.debatDuSoir({matchs: l, jour: '2026-11-03', maxMatchs: 5, maintenant: '2026-11-03 23:15', api});
  assert.strictEqual(appels.length, 1);
  assert.strictEqual(appels[0].split('=')[1].split('-').length, 5);
  assert.ok(!appels[0].includes('8'));
  assert.match(p.html, /E1 1-0 F1/);
  assert.strictEqual(P.composEtat([], '2026-11-03 12:05'), 'attendre', 'pas de gros match : le debat attend 18 h');
  assert.strictEqual(P.composEtat([], '2026-11-03 18:00'), 'fini');
  assert.strictEqual(P.composEtat([psg], '2026-11-03 20:59'), 'attendre');
  assert.strictEqual(P.composEtat([psg], '2026-11-03 21:00'), 'fini', 'coup d\'envoi : plus de message');
  assert.strictEqual(await P.debatDuSoir({matchs: [], jour: '2026-11-03', maxMatchs: 5, maintenant: '2026-11-03 23:15', api}), null);
  assert.strictEqual(appels.length, 1, 'pas de gros match : aucun appel');
});

// ---------- Regles absolues ----------
test('Avant match : aucun pari payant, aucun combine, buteur, montante ni match en or', async () => {
  const autre = {...mk(99, 'premier', 'Arsenal', 'Chelsea'), pari_rec: 'SECRET PRO', cote_rec: 1.9, chance_iashark: 50, market_id: 'y', analysis_tier: 'FULL_ANALYSIS'};
  const avant = [
    P.offert({matchs: [offertM, autre]}, {matchs: [offertM, autre]}, MIDI),
    (await P.composDuSoir({matchs: [psg, autre], maintenant: '2026-11-03 20:00', fenetreMinutes: 70, api: async (c) => (c.startsWith('fixtures/lineups') ? repCompo : repFixture('NS')), lireProteges: async () => proteges, lireTickets: async () => []})),
  ];
  for (const p of avant) {
    propre(p);
    assert.ok(!/combiné|buteur|montante|Sélection en or|match en or|SECRET|Arsenal/i.test(p.html), p.html);
  }
  assert.ok(!/%|cote/i.test(avant[0].html), 'le match offert : ni cote ni chance');
});

test('Les anciens rendez-vous ont disparu', () => {
  for (const nom of ['guide', 'sondage', 'actu', 'soir', 'resultats', 'matchGratuit']) assert.strictEqual(P[nom], undefined, nom);
  const wf = lireFichier('.github', 'workflows', 'telegram-canal.yml');
  assert.ok(!/SLOT=(guide|sondage|actu|soir)|\[tout, .*(guide|sondage|actu|soir)/.test(wf));
  const build = lireFichier('scripts', 'telegram', 'build-posts.mjs');
  assert.ok(!/actus\.json|blog\/guides|sondage/.test(build));
  assert.ok(!/sendPoll/.test(lireFichier('scripts', 'telegram', 'send-posts.mjs')));
  assert.match(lireFichier('scripts', 'telegram', 'card.tpl'), /LE MATCH OFFERT/);
});

// ---------- Workflows : les scripts sont EXECUTES ici ----------
const script = (wf, nom) => {
  const i = wf.indexOf('- name: ' + nom);
  assert.ok(i > 0, nom);
  const bloc = wf.slice(i).split('\n      - ')[0];
  const run = bloc.split('run: |\n')[1];
  return run.split('\n').map((l) => l.replace(/^ {10}/, '')).join('\n');
};
const lanceur = (wf, dir) => (nom, env) => {
  const out = path.join(dir, 'out-' + Math.random().toString(36).slice(2));
  fs.writeFileSync(out, '');
  execFileSync('bash', ['-e', '-c', script(wf, nom)], {env: {...process.env, GITHUB_OUTPUT: out, RUNNER_TEMP: dir, ...env}, cwd: dir, stdio: 'pipe'});
  return Object.fromEntries(fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
};

test('Canal : le bon creneau a la bonne heure, ete comme hiver, jamais avant 9 h', () => {
  const wf = lireFichier('.github', 'workflows', 'telegram-canal.yml');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-'));
  const lancer = lanceur(wf, dir);
  const choix = (EVENT, h, m, extra) => lancer('Choix des messages', {EVENT, FORCER_HEURE: String(h), FORCER_MINUTE: String(m || 0), INPUT_SLOT: '', INPUT_TEST: '', ...extra});
  const creneau = (EVENT, h) => choix(EVENT, h).slot || '';
  assert.deepStrictEqual([3, 4, 8, 9, 11, 12, 20, 21, 23, 0, 2].map((h) => creneau('schedule', h)), ['', 'hier', 'hier', 'hier', 'hier', 'rattrapage', 'rattrapage', 'debat', 'debat', 'debat', 'debat']);
  assert.deepStrictEqual([3, 8, 9, 11, 12, 20, 21].map((h) => creneau('workflow_run', h)), ['', 'hier', 'hier', 'hier', 'rattrapage', 'rattrapage', '']);
  // Chaque message attend son heure : calcul du matin fini a 8 h 08 -> 52 min avant Hier.
  assert.strictEqual(choix('workflow_run', 8, 8).attente, '52');
  assert.strictEqual(choix('workflow_run', 9, 30).attente, '0', 'calcul en retard : tout de suite');
  const dispatch = (slot, h, m, test) => choix('workflow_dispatch', h, m, {INPUT_SLOT: slot, INPUT_TEST: test || 'false'});
  assert.deepStrictEqual([dispatch('offert', 9, 10).slot, dispatch('offert', 9, 10).attente], ['offert', '170']);
  assert.deepStrictEqual([dispatch('debat', 21, 15).slot, dispatch('debat', 21, 15).attente], ['debat', '120']);
  assert.strictEqual(dispatch('debat', 0, 20).attente, '0', 'passage en retard, apres minuit : tout de suite');
  // Au-dela de 5 h 45 (limite de 6 h de GitHub) : ce passage ne fait rien.
  assert.strictEqual(dispatch('debat', 12, 0).slot || '', '');
  assert.strictEqual(dispatch('hier', 2, 0).slot || '', '');
  assert.strictEqual(dispatch('hier', 2, 0, 'true').attente, '0', 'en test : jamais d\'attente');
  // La chaine : Hier -> match offert -> compos -> debat, jamais en test.
  assert.match(wf, /hier\) gh workflow run telegram-canal\.yml .* -f slot=offert -f test=false/);
  assert.match(wf, /offert\|rattrapage\) gh workflow run telegram-compos\.yml .* -f test=false/);
  assert.match(wf, /actions: write/);
  assert.match(wf, /timeout-minutes: 360/);
  // Crons UTC : hiver (UTC+1) et ete (UTC+2) tombent sur 9 h, 12 h et 23 h 15 de Paris.
  assert.match(wf, /cron: '5 7,8 \* \* \*'/);
  assert.match(wf, /cron: '5 10,11 \* \* \*'/);
  assert.match(wf, /cron: '15 21,22 \* \* \*'/);
  assert.strictEqual((wf.match(/- cron:/g) || []).length, 3);
  // Essai manuel : TEST par defaut.
  assert.deepStrictEqual(lancer('Choix des messages', {EVENT: 'workflow_dispatch', FORCER_HEURE: '15', INPUT_SLOT: 'hier', INPUT_TEST: 'true'}).test, '1');
  fs.rmSync(dir, {recursive: true, force: true});
});

test('Envoi unique : une cle par message et par jour, posee seulement si le message est parti', () => {
  const wf = lireFichier('.github', 'workflows', 'telegram-canal.yml');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-'));
  const lancer = lanceur(wf, dir);
  const choix = (slot, h, o, d) => lancer('Messages a preparer', {SLOT: slot, DEJA_HIER: h || '', DEJA_OFFERT: o || '', DEJA_DEBAT: d || ''}).slot || '';
  assert.strictEqual(choix('hier'), 'hier');
  assert.strictEqual(choix('hier', 'true'), '');
  assert.strictEqual(choix('offert'), 'offert');
  assert.strictEqual(choix('offert', '', 'true'), '');
  assert.strictEqual(choix('debat'), 'debat');
  assert.strictEqual(choix('debat', '', '', 'true'), '');
  assert.strictEqual(choix('rattrapage'), 'rattrapage');
  assert.strictEqual(choix('rattrapage', 'true'), 'offert');
  assert.strictEqual(choix('rattrapage', '', 'true'), 'hier');
  assert.strictEqual(choix('rattrapage', 'true', 'true'), '');
  fs.mkdirSync(path.join(dir, 'telegram'), {recursive: true});
  const envoyes = path.join(dir, 'telegram', 'envoyes.txt');
  assert.deepStrictEqual(lancer('Ce qui est parti', {}), {}, 'rien n\'est parti : rien de memorise');
  fs.writeFileSync(envoyes, 'hier\n');
  assert.deepStrictEqual(lancer('Ce qui est parti', {}), {hier: '1'}, 'le match offert reste a envoyer');
  fs.writeFileSync(envoyes, 'hier\noffert\n');
  assert.deepStrictEqual(lancer('Ce qui est parti', {}), {hier: '1', offert: '1'});
  fs.writeFileSync(envoyes, 'debat\n');
  assert.deepStrictEqual(lancer('Ce qui est parti', {}), {debat: '1'});
  fs.rmSync(dir, {recursive: true, force: true});
  for (const s of ['hier', 'offert', 'debat']) {
    assert.match(wf, new RegExp('key: telegram-\\$\\{\\{ steps\\.slot\\.outputs\\.date \\}\\}-' + s));
    assert.match(wf, new RegExp("if: \\$\\{\\{ always\\(\\) && steps\\.parti\\.outputs\\." + s + " == '1' \\}\\}"));
  }
  const send = lireFichier('scripts', 'telegram', 'send-posts.mjs');
  assert.match(send, /fs\.appendFileSync\(path\.join\(dir, "envoyes\.txt"\), p\.slot \+ "\\n"\);\n  console\.log\(`envoye : \$\{p\.slot\}`\);/);
});

test('Panne du calcul du matin : Clement est prevenu en prive, Hier attend le calcul du jour', () => {
  const wf = lireFichier('.github', 'workflows', 'telegram-canal.yml');
  assert.match(wf, /github\.event\.workflow_run\.conclusion == 'failure' \}\}/);
  assert.match(wf, /name: Prevenir Clement \(calcul du matin en echec\)/);
  assert.match(wf, /chat_id=\$\{TELEGRAM_CHAT_ID\}/);
  assert.ok(!EMOTICONE.test(wf), 'aucune emoticone');
  assert.match(lireFichier('scripts', 'telegram', 'build-posts.mjs'), /frais\(bandeau\.genere_le\)/);
});

test('Compos : passage toutes les 15 min aux heures utiles, une fois par jour, sans piece jointe', () => {
  const wf = lireFichier('.github', 'workflows', 'telegram-compos.yml');
  assert.match(wf, /cron: '4,19,34,49 14-20 \* \* \*'/);
  assert.match(wf, /key: telegram-\$\{\{ steps\.passage\.outputs\.date \}\}-compos/);
  assert.match(wf, /lookup-only: true/);
  assert.match(wf, /if: \$\{\{ always\(\) && steps\.parti\.outputs\.compos == '1' \}\}/);
  assert.match(wf, /steps\.deja\.outputs\.cache-hit != 'true'/);
  assert.ok(!/upload-artifact/.test(wf), 'depot public : pas de copie du prono');
  assert.match(wf, /TELEGRAM_AUTO: \$\{\{ vars\.TELEGRAM_AUTO \}\}/);
  assert.match(lireFichier('.github', 'workflows', 'telegram-canal.yml'), /TELEGRAM_AUTO: \$\{\{ vars\.TELEGRAM_AUTO \}\}/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-'));
  const lancer = lanceur(wf, dir);
  const utile = (h) => lancer('Heure utile ?', {EVENT: 'schedule', FORCER_HEURE: String(h), INPUT_TEST: ''}).utile;
  assert.deepStrictEqual([5, 6, 20, 22, 23].map(utile), ['0', '1', '1', '1', '0']);
  // Les passages : 15 min entre chaque, arret des que le message est pret ou le coup d'envoi passe, relais avant 6 h.
  const faux = path.join(dir, 'faux');
  fs.mkdirSync(faux);
  const etats = path.join(dir, 'etats'), compte = path.join(dir, 'sommeils');
  fs.writeFileSync(path.join(faux, 'node'), `#!/bin/bash
set -e
E=$(head -1 "${etats}"); sed -i.bak 1d "${etats}"
mkdir -p "$RUNNER_TEMP/telegram"
printf '{\\n  "compos_etat": "%s"\\n}' "$E" > "$RUNNER_TEMP/telegram/posts.json"
`, {mode: 0o755});
  fs.writeFileSync(path.join(faux, 'sleep'), `#!/bin/bash\necho "$1" >> "${compte}"\n`, {mode: 0o755});
  const passages = (liste, TEST) => {
    fs.writeFileSync(etats, liste.join('\n') + '\n');
    fs.writeFileSync(compte, '');
    const r = lancer('Passages toutes les 15 min', {PATH: faux + ':' + process.env.PATH, TEST: TEST || '0'});
    return [r.suite, fs.readFileSync(compte, 'utf8').split('\n').filter(Boolean)];
  };
  assert.deepStrictEqual(passages(['attendre', 'attendre', 'pret']), ['debat', ['900', '900']], 'composition publiee au 3e passage');
  assert.deepStrictEqual(passages(['attendre', 'fini']), ['debat', ['900']], 'jamais publiee : on s\'arrete au coup d\'envoi, sans message');
  assert.deepStrictEqual(passages(['attendre'], '1'), ['debat', []], 'essai : un seul passage');
  assert.match(script(wf, 'Passages toutes les 15 min'), /SECONDS" -ge "\$FIN" \]; then SUITE=relais/);
  assert.match(script(wf, 'Relais ou debat'), /-f slot=debat -f test=false/);
  fs.writeFileSync(path.join(dir, 'x'), '');
  assert.deepStrictEqual(lancer('Ce qui est parti', {}), {});
  fs.mkdirSync(path.join(dir, 'telegram'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'telegram', 'envoyes.txt'), 'compos\n');
  assert.deepStrictEqual(lancer('Ce qui est parti', {}), {compos: '1'});
  fs.rmSync(dir, {recursive: true, force: true});
});

test('Quotas : reglages lus dans config/quotas.json, plafond du jour respecte, budget par passage', () => {
  const q = JSON.parse(lireFichier('config', 'quotas.json')).api_football;
  assert.strictEqual(q.telegram_canal.fenetre_compos_minutes, 70);
  assert.ok(q.telegram_canal.max_appels_par_lancement <= 3);
  // Au pire 5 passages dans la fenetre x 2 appels + Hier 1 + debat 1 : 12 appels par jour, loin du plafond.
  assert.ok(12 < q.plafond_jour);
  const build = lireFichier('scripts', 'telegram', 'build-posts.mjs');
  assert.match(build, /QUOTAS\.autorise\("api_football", QUOTAS\.lireEtat\(\), CFG\)/);
  assert.match(build, /appels >= REGLAGES\.max_appels_par_lancement/);
});

// ---------- Envoi : Telegram est simule, rien ne sort de la machine ----------
function envoyer(env, posts, chat) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-envoi-'));
  fs.writeFileSync(path.join(dir, 'posts.json'), JSON.stringify({date: '2026-11-03', slot: 'x', posts}));
  const faux = path.join(dir, 'faux.mjs'), trace = path.join(dir, 'appels.jsonl');
  fs.writeFileSync(faux, `import fs from "node:fs";
globalThis.fetch = async (u, o) => {
  const methode = String(u).split("/").pop();
  fs.appendFileSync(${JSON.stringify(trace)}, JSON.stringify({methode, corps: o && typeof o.body === "string" ? JSON.parse(o.body) : null}) + "\\n");
  const result = methode === "getChat" ? ${JSON.stringify(chat || {type: 'channel', title: 'IASHARK'})} : methode === "getChatMember" ? {status: "administrator"} : methode === "getMe" ? {id: 1} : {};
  return {status: 200, json: async () => ({ok: true, result})};
};
globalThis.setTimeout = ((st) => (f) => st(f, 0))(globalThis.setTimeout);
`);
  const base = {PATH: process.env.PATH, TELEGRAM_BOT_TOKEN: 'faux', TELEGRAM_CHAT_ID: '111'};
  const r = spawnSync(process.execPath, ['--import', faux, path.join(RACINE, 'scripts', 'telegram', 'send-posts.mjs'), dir], {env: {...base, ...env}, encoding: 'utf8'});
  const appels = fs.existsSync(trace) ? fs.readFileSync(trace, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const parti = fs.existsSync(path.join(dir, 'envoyes.txt')) ? fs.readFileSync(path.join(dir, 'envoyes.txt'), 'utf8') : '';
  fs.rmSync(dir, {recursive: true, force: true});
  return {code: r.status, sortie: r.stdout + r.stderr, envois: appels.filter((a) => a.methode === 'sendMessage'), parti};
}
const msg = {type: 'text', slot: 'hier', html: 'Essai', apercu: false};
const CHAINE = '-1001234567890';

test('Envoi : le clic du patron reste tant que TELEGRAM_AUTO n\'est pas a 1', () => {
  const r = envoyer({TELEGRAM_CHANNEL_ID: CHAINE}, [msg]);
  assert.strictEqual(r.code, 0, r.sortie);
  assert.strictEqual(r.envois[0].corps.chat_id, '111');
  assert.match(JSON.stringify(r.envois[0].corps.reply_markup), /Publier sur le canal/);
  const sansId = envoyer({TELEGRAM_AUTO: '1'}, [msg]);
  assert.strictEqual(sansId.envois[0].corps.chat_id, '111', 'AUTO sans chaine : reste a valider');
  assert.match(sansId.sortie, /TELEGRAM_CHANNEL_ID absent/);
});
test('Envoi : TELEGRAM_AUTO=1 publie sur la chaine privee, sans bouton, et trace ce qui est parti', () => {
  const r = envoyer({TELEGRAM_AUTO: '1', TELEGRAM_CHANNEL_ID: CHAINE}, [msg]);
  assert.strictEqual(r.code, 0, r.sortie);
  assert.strictEqual(r.envois[0].corps.chat_id, CHAINE);
  assert.strictEqual(r.envois[0].corps.reply_markup, undefined);
  assert.strictEqual(r.parti, 'hier\n');
  assert.ok(!r.sortie.includes(CHAINE), 'la valeur du reglage n\'est jamais affichee');
});
test('Envoi : ancienne adresse ou chaine publique refusees, rien ne part', () => {
  const ancienne = envoyer({TELEGRAM_AUTO: '1', TELEGRAM_CHANNEL_ID: '@iasharkdata'}, [msg]);
  assert.notStrictEqual(ancienne.code, 0);
  assert.strictEqual(ancienne.envois.length, 0);
  assert.ok(!ancienne.sortie.includes('@iasharkdata'));
  const publique = envoyer({TELEGRAM_AUTO: '1', TELEGRAM_CHANNEL_ID: CHAINE}, [msg], {type: 'channel', username: 'iasharkdata'});
  assert.notStrictEqual(publique.code, 0);
  assert.strictEqual(publique.envois.length, 0);
  assert.strictEqual(publique.parti, '');
  // En test : jamais la chaine, meme avec TELEGRAM_AUTO=1.
  const t = envoyer({TEST: '1', TELEGRAM_AUTO: '1', TELEGRAM_CHANNEL_ID: CHAINE}, [msg]);
  assert.strictEqual(t.envois[0].corps.chat_id, '111');
});
test('Chaine visee : verdict sans valeur secrete', () => {
  assert.deepStrictEqual(P.verdictChaine({type: 'channel', title: 'T', invite_link: P.INVITATION}, {status: 'administrator'}), {chaine: true, privee: true, robotAdmin: true, lienIdentique: true, titre: 'T'});
  const v = P.verdictChaine({type: 'channel', username: 'iasharkdata'}, {status: 'member'});
  assert.deepStrictEqual([v.privee, v.robotAdmin, v.lienIdentique], [false, false, null]);
  assert.strictEqual(P.verdictChaine({type: 'supergroup'}, null).chaine, false);
});
