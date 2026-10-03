'use strict';
// Canal Telegram (lib/telegram-posts.js) : regles d'honnetete et de secret.
const test = require('node:test');
const assert = require('node:assert');
const P = require('../lib/telegram-posts.js');
// Une seule source (01/10/2026) : la chance publiee est chance_iashark, posee par le pipeline
// (le plus bas entre le modele et la cote sans marge) ; le pari s'ecrit comme sur la page.
const CHANCE = require('../lib/chance-iashark.js');
const avecChance = (m) => { CHANCE.poserChance(m); return m; };

const libre = {id: 1, is_free: true, status: 'NS', analysis_tier: 'FULL_ANALYSIS', date: '2026-09-27 18:00', league: 'UEFA Nations League',
  home: {n: 'Austria'}, away: {n: 'Kosovo'}, c1: '1.62', cn: '3.90', c2: '5.60',
  pari_rec: 'Premiere mi-temps moins de 1.5 but', market_id: 'fh-under-15', model_probability: 65.5, cote_rec: 1.47,
  p1: 56, pn: 24, p2: 20, market_consensus_p1: 62, market_consensus_pN: 24, market_consensus_p2: 14,
  markets_compared: [{id: 'fh-under-15', market: 'Premiere mi-temps moins de 1.5 but', probability: 65.5, consensus: 64.1, edge: 1.3}],
  // Pari du moteur v3, meme marche, marche « vérifié sur le passé » (ronde 4) : sans lui, aucun pourcentage.
  // Probabilite « modèle + cotes » (lib/moteur-v3.js#origineProbabilite) : cas ou un
  // pourcentage peut partir meme au-dessus de la cote sans marge (condition 1, 30/09).
  moteur_v3: {source: 'v3', origine_probabilite: 'modèle + cotes'}, v3_pari: {market_id: 'fh-under-15', etiquette: 'vérifié sur le passé', fiabilite_marche: 'vérifié sur le passé'}};
avecChance(libre); // 65,5 (modele) face a 64,1 (cote sans marge) : 64 %
const payant = {id: 2, is_free: false, status: 'NS', date: '2026-09-27 20:45', league: 'UEFA Nations League',
  home: {n: 'Norway'}, away: {n: 'Portugal'}, c1: '2.38', cn: '3.80', c2: '2.70', pari_rec: 'SECRET PRO', model_probability: 71, p1: 44};
const home = {matchs: [libre, payant]};
// Heure de Paris de l'envoi (obligatoire : verification du jour, 30/09/2026).
const MATIN = '2026-09-27 10:00';

test('match gratuit : le match, le pari, la cote et la chance calculee par IASHARK (decision de Clement, 30/09)', () => {
  const p = P.matchGratuit(home, {matchs: [libre]}, MATIN);
  assert.strictEqual(p.carte.estimation, 64, 'chance_iashark : le plus bas entre 65,5 et 64,1');
  const libellePage = require('../lib/market-labels.js').marketLabelFr('Premiere mi-temps moins de 1.5 but', {home: 'Austria', away: 'Kosovo'});
  assert.strictEqual(p.carte.pari, libellePage, 'le pari ecrit comme sur la page match');
  assert.match(libellePage, /^1re mi-temps\s?: moins de 1,5\sbut$/);
  assert.strictEqual(p.carte.dit, undefined, 'plus de « ce que dit la cote sans la marge »');
  // Une seule cote (lib/cote-anj.js, 01/10/2026) : sans cote d'un agree ANJ, la cote est « indicative », sans bookmaker.
  assert.ok(p.html.includes('Sélection : <b>' + libellePage + '</b>\nChance calculée par IASHARK : <b>64 %</b>\nCote indicative : 1,47'), p.html);
  // Avec la cote d'un agree ANJ : son nom, la meme cote dans le message et sur l'image.
  const anj = P.matchGratuit(home, {matchs: [Object.assign({}, libre, {cote_rec: '1.52', cote_source: 'anj', cote_bookmaker: 'Winamax'})]}, MATIN);
  assert.ok(anj.html.includes('Cote chez Winamax : 1,52'), anj.html);
  assert.deepEqual([anj.carte.coteTxt, anj.carte.coteLibelle], ['1,52', 'Cote chez Winamax']);
  assert.ok(!/points|plus de chances|en suppose|sans la marge|selon la cote|Sur 100 matchs|mise|il faut gagner/.test(JSON.stringify(p)));
  assert.ok(!/le plus attendu/.test(p.html));
  assert.match(p.html, /la chance d’un but par tranche de 15 minutes \(Pro\)/);
  assert.match(p.html, /les buteurs les plus probables \(Pro\)/, "buteurs reserves au Pro (avocat du diable, 01/10/2026)");
  assert.match(p.html, /les scores exacts les plus probables/);
  assert.ok(p.html.length <= 1024, 'la legende photo Telegram est limitee a 1024 caracteres');
  assert.ok(!/comporte des risques/.test(p.html), 'pas de mention bookmaker (choix de Clement)');
  assert.ok(!JSON.stringify(payant).includes('SECRET') || !JSON.stringify(p).includes('SECRET PRO'), 'jamais le pari d un autre match');
});

test('match gratuit : seulement la chance calculee et la cote, aucun ecart ni chiffre du marche', () => {
  const m = avecChance({...libre, markets_compared: [{id: 'fh-under-15', probability: 60, consensus: 64, edge: -4}], model_probability: 60});
  const c = P.chancesMatchGratuit(m);
  assert.deepStrictEqual([c.estimation, c.coteTxt, c.dit, c.ecartTxt], [60, '1,47', undefined, undefined]);
});

test('match gratuit : donnee absente = aucun chiffre (jamais 0 %)', () => {
  const p = P.matchGratuit({matchs: [{...libre, chance_iashark: null}]}, null, MATIN);
  assert.strictEqual(p.type, 'text');
  assert.ok(!/%/.test(p.html));
  assert.strictEqual(P.matchGratuit({matchs: [payant]}, null, MATIN), null);
});

test('match gratuit : jamais un match deja commence ou joue', () => {
  assert.strictEqual(P.matchGratuit({matchs: [{...libre, status: '1H'}]}, null, MATIN), null);
  assert.strictEqual(P.matchGratuit(home, null, '2026-09-27 18:00'), null);
  assert.ok(P.matchGratuit(home, null, '2026-09-27 13:05'));
});

test('match gratuit : seulement celui du jour, avec sa date (contre-controle, 30/09/2026)', () => {
  // Jour sans match offert : celui du lendemain n'est JAMAIS annonce comme « du jour ».
  const demain = {...libre, id: 7, date: '2026-10-04 17:30', home: {n: 'Arsenal'}, away: {n: 'Chelsea'}};
  assert.strictEqual(P.matchGratuit({matchs: [demain, payant]}, {matchs: [demain]}, '2026-10-03 13:05'), null);
  // Offre du jour ET du lendemain (liste dans n'importe quel ordre) : celle du jour.
  const p = P.matchGratuit({matchs: [demain, libre, payant]}, null, MATIN);
  assert.strictEqual(p.matchId, 1);
  assert.strictEqual(p.jour, '2026-09-27');
  // La date est ecrite en toutes lettres, dans le message et sur l'image.
  assert.match(p.html, /UEFA Nations League|Ligue des nations/);
  assert.match(p.html, /dimanche 27 septembre · 18h00/);
  assert.match(p.carte.quand, /dimanche 27 septembre · 18h00/);
  const texte = P.matchGratuit({matchs: [{...libre, analysis_tier: 'UNVERIFIED'}]}, null, MATIN);
  assert.match(texte.html, /dimanche 27 septembre · 18h00/);
  // Donnees completes d'un autre jour pour le meme numero : refus.
  assert.strictEqual(P.matchGratuit(home, {matchs: [{...libre, date: '2026-09-28 18:00'}]}, MATIN), null);
  // Sans heure d'envoi, aucune verification possible : pas de message.
  assert.strictEqual(P.matchGratuit(home, null), null);
  assert.strictEqual(P.matchGratuit(home, null, 'demain'), null);
});

test('match gratuit non fiable : publie SANS aucun pourcentage', () => {
  const nonVerifie = P.matchGratuit({matchs: [{...libre, analysis_tier: 'UNVERIFIED'}]}, null, MATIN);
  assert.strictEqual(nonVerifie.type, 'text');
  assert.ok(!/%/.test(nonVerifie.html), 'aucun pourcentage');
  assert.match(nonVerifie.html, /les scores exacts les plus probables/);
  // Favori inverse par rapport au marche, gros ecart (cas Autriche-Kosovo) : pas de chiffre.
  const inverse = {...libre, p1: 33.1, pn: 28.2, p2: 38.6, market_consensus_p1: 62, market_consensus_pN: 24, market_consensus_p2: 14};
  assert.strictEqual(P.chiffresFiables(inverse), false);
  assert.strictEqual(P.matchGratuit({matchs: [inverse]}, null, MATIN).type, 'text');
  // Meme favori : chiffres publies.
  assert.strictEqual(P.chiffresFiables({...libre, p1: 55, pn: 25, p2: 20, market_consensus_p1: 60, market_consensus_pN: 24, market_consensus_p2: 16}), true);
});

test('sondage : aucune donnee payante, jamais le match gratuit', () => {
  const p = P.sondage(home, '2026-09-27', '12:00');
  assert.strictEqual(p.matchId, 2);
  const tout = JSON.stringify(p);
  assert.ok(!tout.includes('SECRET') && !tout.includes('71') && !tout.includes('44'));
  assert.deepStrictEqual(p.options, ['Norvège', 'Match nul', 'Portugal']);
});

test('sondage : pas de match deja commence ou trop tot', () => {
  assert.strictEqual(P.sondage(home, '2026-09-27', '21:00'), null);
});

// T3 (decision de Clement, 29/09/2026) : bilan des SEULS paris du moteur v3.
const lignes = (v3, ancien) => [].concat(
  Object.entries(v3).flatMap(([r, n]) => Array.from({length: n}, () => ({result: r, moteur: 'v3'}))),
  Object.entries(ancien || {}).flatMap(([r, n]) => Array.from({length: n}, () => ({result: r, moteur: 'ancien'}))),
  [{result: 'win'}]);
test('resultats : gagnes ET perdus du seul moteur v3, rien si pas de bilan v3', () => {
  const p = P.resultats({day: '2026-09-26', totals: {settled: 30, won: 25, lost: 5}, matches: lignes({win: 12, loss: 3}, {win: 13, loss: 2})});
  // Base exacte (avocat du diable, 01/10/2026) : les paris du SITE (moteur v3), un par match.
  assert.match(p.html, /Paris publiés sur le site pour les matchs d'hier \(moteur IASHARK v3, un pari par match\) : <b>12 gagnés, 3 perdus<\/b>/);
  assert.ok(!/validée|On publie tout/.test(p.html), 'ni « validées » ni « On publie tout »');
  assert.match(p.html, /samedi 26 septembre/);
  assert.ok(!/%|taux/i.test(p.html), 'aucun taux de reussite');
  assert.ok(!/historique|archiv|<a href/i.test(p.html), "ni historique public ni archive citee (decision de Clement)");
  assert.strictEqual(P.resultats({day: '2026-09-26', totals: {settled: 15, won: 12, lost: 3}, matches: lignes({}, {win: 12, loss: 3})}), null, 'ancien moteur seul : pas de message');
  assert.strictEqual(P.resultats({day: '2026-09-26', totals: {settled: 15, won: 12, lost: 3}}), null, 'sans le detail par moteur : pas de message');
  assert.strictEqual(P.resultats({day: '2026-09-26', matches: []}), null);
});

test('actu : titres fiables recents seulement, echappes', () => {
  const now = Date.parse('2026-09-27T12:00:00Z');
  const items = [
    {fiabilite: 'high', title: 'A <b>', source: 'X', link: 'https://a.fr/1', date: 'Sun, 27 Sep 2026 10:00:00 GMT'},
    {fiabilite: 'mid', title: 'B', source: 'Y', link: 'https://a.fr/2', date: 'Sun, 27 Sep 2026 10:00:00 GMT'},
    {fiabilite: 'high', title: 'C', source: 'Z', link: 'https://a.fr/3', date: 'Sat, 26 Sep 2026 13:00:00 GMT'},
    {fiabilite: 'high', title: 'D', source: 'W', link: 'https://a.fr/4', date: 'Fri, 25 Sep 2026 10:00:00 GMT'}];
  const p = P.actu({items}, now);
  assert.match(p.html, /A &lt;b&gt;/);
  assert.ok(!p.html.includes('• B') && !p.html.includes('• D'));
});

test('protection : une probabilite 1N2 manquante = pas de pourcentage', () => {
  assert.strictEqual(P.chiffresFiables({...libre, p1: null}), false);
});

test('resultats : matchs pas encore termines signales', () => {
  const p = P.resultats({day: '2026-09-26', matches: lignes({win: 7, loss: 3, pending: 2}, {pending: 5})});
  assert.match(p.html, /<b>7 gagnés, 3 perdus<\/b>/);
  assert.match(p.html, /2 encore en attente/);
});

test('guide : tourne chaque jour', () => {
  const g = [{title: 'Un', url: 'https://iashark.com/1'}, {title: 'Deux', url: 'https://iashark.com/2'}];
  assert.notStrictEqual(P.guide(g, '2026-09-27').html, P.guide(g, '2026-09-28').html);
});

test('panne du calcul du matin : le canal tourne quand meme et Clement est prevenu en prive', () => {
  const wf = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', '.github', 'workflows', 'telegram-canal.yml'), 'utf8');
  assert.match(wf, /github\.event\.workflow_run\.conclusion == 'failure' \}\}/);
  assert.match(wf, /name: Prevenir Clement \(calcul du matin en echec\)/);
  assert.match(wf, /chat_id=\$\{TELEGRAM_CHAT_ID\}/);
  assert.ok(!/TELEGRAM_CHANNEL_ID[^\n]*\n[^\n]*Prevenir/.test(wf));
});

// Contre-controle de l'avocat du diable (30/09/2026) : un calcul du matin en echec ne
// consomme plus l'envoi du match gratuit. Les scripts du workflow sont EXECUTES ici.
test('memoire des envois : une cle par message, posee seulement si le message est parti', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const {execFileSync} = require('node:child_process');
  const wf = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'telegram-canal.yml'), 'utf8');
  const script = (nom) => {
    const i = wf.indexOf('- name: ' + nom);
    assert.ok(i > 0, nom);
    const bloc = wf.slice(i).split('\n      - ')[0];
    const run = bloc.split('run: |\n')[1];
    return run.split('\n').map((l) => l.replace(/^ {10}/, '')).join('\n');
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-'));
  const lancer = (nom, env) => {
    const out = path.join(dir, 'out-' + Math.random().toString(36).slice(2));
    fs.writeFileSync(out, '');
    execFileSync('bash', ['-c', script(nom)], {env: {...process.env, GITHUB_OUTPUT: out, RUNNER_TEMP: dir, ...env}, cwd: dir, stdio: 'pipe'});
    return Object.fromEntries(fs.readFileSync(out, 'utf8').split('\n').filter(Boolean).map((l) => l.split('=')));
  };
  // Choix des messages a preparer.
  const choix = (slot, r, m, a) => lancer('Messages a preparer', {SLOT: slot, DEJA_RESULTATS: r || '', DEJA_MATCH: m || '', DEJA_AUTRE: a || ''}).slot;
  assert.strictEqual(choix('apres-maj'), 'apres-maj');
  assert.strictEqual(choix('apres-maj', 'true'), 'match', 'resultats deja partis (calcul en echec) : le match gratuit reste a envoyer');
  assert.strictEqual(choix('apres-maj', '', 'true'), 'resultats');
  assert.strictEqual(choix('apres-maj', 'true', 'true'), '');
  assert.strictEqual(choix('sondage'), 'sondage');
  assert.strictEqual(choix('sondage', '', '', 'true'), '');
  // Ce qui est parti : seul un message vraiment envoye est memorise.
  fs.mkdirSync(path.join(dir, 'telegram'), {recursive: true});
  const envoyes = path.join(dir, 'telegram', 'envoyes.txt');
  fs.writeFileSync(envoyes, 'resultats\n');
  assert.deepStrictEqual(lancer('Ce qui est parti', {SLOT: 'apres-maj', ENVOI: 'success'}), {resultats: '1'}, 'calcul en echec : match gratuit NON memorise');
  fs.writeFileSync(envoyes, 'resultats\nmatch\n');
  assert.deepStrictEqual(lancer('Ce qui est parti', {SLOT: 'apres-maj', ENVOI: 'failure'}), {resultats: '1', match: '1'});
  fs.rmSync(envoyes);
  assert.deepStrictEqual(lancer('Ce qui est parti', {SLOT: 'apres-maj', ENVOI: 'success'}), {});
  assert.deepStrictEqual(lancer('Ce qui est parti', {SLOT: 'guide', ENVOI: 'success'}), {autre: '1'});
  assert.deepStrictEqual(lancer('Ce qui est parti', {SLOT: 'guide', ENVOI: 'failure'}), {});
  fs.rmSync(dir, {recursive: true, force: true});
  // Cles distinctes par message, sauvegardees seulement sur ces sorties.
  assert.match(wf, /key: telegram-\$\{\{ steps\.slot\.outputs\.date \}\}-resultats/);
  assert.match(wf, /key: telegram-\$\{\{ steps\.slot\.outputs\.date \}\}-match/);
  assert.match(wf, /if: \$\{\{ always\(\) && steps\.parti\.outputs\.match == '1' \}\}/);
  assert.doesNotMatch(wf, /key: telegram-\$\{\{ steps\.slot\.outputs\.date \}\}-apres-maj/);
  // send-posts.mjs trace chaque message accepte par Telegram.
  const send = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'telegram', 'send-posts.mjs'), 'utf8');
  assert.match(send, /fs\.appendFileSync\(path\.join\(dir, "envoyes\.txt"\), p\.slot \+ "\\n"\);\n  console\.log\(`envoye : \$\{p\.slot\}`\);/);
});

// « Marge retiree » : plus de chiffre du marche dans le message (decision de Clement,
// 30/09/2026, canal-pro) : seulement la chance calculee par IASHARK et la cote.
test('match gratuit : plus aucun chiffre « selon la cote », ni marge, ni « Sur 100 matchs »', () => {
  const p = P.matchGratuit(home, {matchs: [libre]}, MATIN);
  assert.ok(!/selon la cote|marge|Sur 100 matchs|en suppose/.test(JSON.stringify(p)), p.html);
  const fs = require('node:fs'), path = require('node:path');
  const tpl = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'telegram', 'card.tpl'), 'utf8');
  assert.ok(!/MARGE|\{\{DIT\}\}|Ce que dit la cote/.test(tpl), 'card.tpl : plus de « ce que dit la cote »');
  assert.match(tpl, /Chance calculée par IASHARK/);
});

// Contre-controle ronde 4 (30/09/2026) : « Sur 100 matchs comme celui-ci… » s'affichait
// avec l'ancien moteur, trop sur de lui (6,1 a 9,5 points d'ecart au 1N2).
test('match gratuit : pari et pourcentage seulement avec un pari v3 calibre', () => {
  const sansChiffre = (m, pourquoi) => {
    const p = P.matchGratuit({matchs: [m]}, null, MATIN);
    assert.strictEqual(p.type, 'text', pourquoi);
    assert.ok(!/%|Sur 100 matchs|Pari :|mi-temps/.test(JSON.stringify(p)), pourquoi + ' : ni pari ni pourcentage');
  };
  const {moteur_v3, v3_pari, ...ancien} = libre;
  sansChiffre(ancien, 'ancien moteur (aucun pari v3)');
  sansChiffre({...libre, moteur_v3: {source: 'ancien moteur (repli)'}}, 'repli sur l\'ancien moteur');
  sansChiffre({...libre, v3_pari: {...libre.v3_pari, market_id: 'home-win'}}, 'pari v3 sur un autre marche');
  sansChiffre({...libre, v3_pari: {...libre.v3_pari, etiquette: 'logique installée, pas encore vérifié'}}, 'marche v3 pas encore verifie');
  sansChiffre({...libre, v3_pari: {...libre.v3_pari, fiabilite_marche: 'non vérifié sur le passé / données limitées'}}, 'competition non verifiee');
  sansChiffre({...libre, league_reliability: 'en_test'}, 'competition « Fiabilité : en test » (config/leagues.json#fiabilite)');
  sansChiffre({...libre, market_id: null}, 'marche du pari absent');
  sansChiffre({...libre, pari_rec: ''}, 'libelle du pari absent');
  const ok = P.matchGratuit({matchs: [libre]}, null, MATIN);
  assert.strictEqual(ok.type, 'photo');
  assert.match(ok.carte.phrase, /^Chance calculée par IASHARK/);
  assert.strictEqual(P.pariV3Calibre(libre), true);
});

// Condition 1 du mathematicien et de l'avocat du diable (30/09/2026). Preuve rejouee
// (avocat-r6/condition1.js) : un pari MLS a 80 %, calcule par le modele seul, face a
// une cote sans marge a 72 %, partait dans le canal avec « Sur 100 matchs comme
// celui-ci… environ 80 fois ». Ces paris passent environ 70 % du temps.
test('match gratuit : modele seul au-dessus de la cote sans marge, aucun pourcentage (preuve de l\'avocat, MLS 80 % / 72 %)', () => {
  const V = 'vérifié sur le passé';
  const mls = {id: 999, is_free: true, league: 'Major League Soccer', league_key: 'mls', home: {n: 'Austin'}, away: {n: 'Dallas'}, date: '2026-10-03 23:30', status: 'NS',
    pari_rec: 'Victoire Domicile', market_id: 'home-win', model_probability: 80, cote_rec: '1.30', model_output_available: true, data_quality_score: 80,
    markets_compared: [{id: 'home-win', market: 'Victoire Domicile', probability: 80, consensus: 72, edge: 8}],
    v3_pari: {market_id: 'home-win', probabilite: 80, etiquette: V, fiabilite_marche: V}, moteur_v3: {source: 'v3', origine_probabilite: 'modèle seul', couverture: 'vérifiée', fiabilite_niveau: V},
    reliability: {label: 'Élevée'}, p1: 80, pn: 12, p2: 8, c1: 1.30, cn: 5.5, c2: 9.0, analysis_tier: 'FULL_ANALYSIS', market_consensus_p1: 72, market_consensus_pN: 17, market_consensus_p2: 11};
  const JOUR = '2026-10-03 09:00';
  const sansChiffre = (m, pourquoi) => {
    assert.strictEqual(P.pariV3Calibre(m), false, pourquoi);
    const p = P.matchGratuit({matchs: [m]}, {matchs: [m]}, JOUR);
    assert.strictEqual(p.type, 'text', pourquoi);
    assert.ok(!/%|Sur 100 matchs|plus de chances|points/.test(JSON.stringify(p)), pourquoi);
  };
  sansChiffre(mls, 'preuve de l\'avocat : modele seul 80 % > cote sans marge 72 %');
  sansChiffre({...mls, moteur_v3: {source: 'v3', couverture: 'vérifiée'}}, 'origine absente (donnees d\'avant le correctif)');
  sansChiffre({...mls, moteur_v3: {...mls.moteur_v3, origine_probabilite: 'modele et cotes'}}, 'origine inconnue');
  sansChiffre({...mls, model_probability: 72.2, v3_pari: {...mls.v3_pari, probabilite: 72.2}}, 'a peine au-dessus');
  sansChiffre({...mls, model_probability: 70, markets_compared: []}, 'cote sans marge inconnue (1/cote garde la marge)');
  // Meme pari, probabilite « modèle + cotes » (championnat europeen) : permis.
  // Chance publiee : le plus bas entre 80 (modele) et 72 (cote sans marge), la meme que la page.
  const europe = avecChance({...mls, moteur_v3: {...mls.moteur_v3, origine_probabilite: 'modèle + cotes'}});
  assert.strictEqual(P.pariV3Calibre(europe), true);
  assert.strictEqual(P.matchGratuit({matchs: [europe]}, {matchs: [europe]}, JOUR).carte.estimation, 72);
  // Modele seul SOUS la cote sans marge (ou egal) : permis (chance calculee et cote).
  for (const prob of [70, 72]) {
    const dessous = avecChance({...mls, model_probability: prob, v3_pari: {...mls.v3_pari, probabilite: prob}, p1: prob});
    assert.strictEqual(P.pariV3Calibre(dessous), true, String(prob));
    const p = P.matchGratuit({matchs: [dessous]}, {matchs: [dessous]}, JOUR);
    assert.strictEqual(p.type, 'photo');
    assert.strictEqual(p.carte.estimation, prob);
    assert.ok(!/plus de chances|points/.test(JSON.stringify(p)));
  }
});

test('canal : aucun mot « valeur » ou « avantage », aucun taux de reussite dans les messages v3', () => {
  const p = P.matchGratuit({matchs: [libre]}, {matchs: [libre]}, MATIN);
  const r = P.resultats({day: '2026-09-26', matches: [{moteur: 'v3', result: 'win'}, {moteur: 'v3', result: 'loss'}, {moteur: 'v3', result: 'win'}]});
  for (const msg of [p, r]) {
    const t = JSON.stringify(msg);
    assert.ok(!/valeur|avantage|\bvalue\b|taux de réussite|réussite/i.test(t), t);
  }
  assert.ok(!/%/.test(r.html), 'resultats : jamais de pourcentage de reussite');
});
