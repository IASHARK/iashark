// VISIBILITE DE LA SIMULATION 15 MIN (decision du proprietaire, 28/09/2026) :
// tout ce qui vient de la simulation (tranches, tranche la plus chaude, equipe qui
// ouvre le score, score a la pause) est reserve aux Pro, comme les autres chiffres du
// modele. Rien ne doit etre lisible par un visiteur non Pro : ni dans les fichiers
// publics (data.json, data-home.json, match/<id>.json), ni dans le HTML statique.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const PREMIUM = require('../lib/premium-fields.js');
const SPLIT = require('../lib/public-data-split.js');
const SEO = require('../scripts/seo-pages.js');
const SIM = require('../lib/simulation-15min.js');
const { buildMatchViewModel } = require('../lib/match-view-model.js');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const SIM_FIELD = SIM.champPipeline({ lambdaH: 1.73, lambdaA: 0.91, favori: 'home', ligueApi: 39 });

function match(extra) {
  return Object.assign({
    id: 424242, sport: 'football', league_id: 39, league: 'Premier League', league_key: 'premier-league',
    date: '2026-10-03 16:00', home: { n: 'Arsenal', id: 42 }, away: { n: 'Chelsea', id: 49 },
    stade: { nom: 'Emirates Stadium' }, model_output_available: true, data_quality_score: 80,
    lambda_h: 1.73, lambda_a: 0.91, p1: 55, pn: 25, p2: 20, sim_15min: SIM_FIELD
  }, extra || {});
}

test('sim_15min est un champ premium (liste unique, copie Deno et copie de la page)', () => {
  assert.ok(PREMIUM.PREMIUM_FIELDS.includes('sim_15min'));
  assert.ok(PREMIUM.PREMIUM_PAYLOAD_FIELDS.includes('sim_15min'), 'persiste dans premium_fields pour les abonnes');
  assert.match(read('supabase/functions/match-data/index.ts'), /"sim_15min"/);
  assert.match(read('match-page.js'), /const CHAMPS_PREMIUM=\[[^\]]*"sim_15min"/);
});

test('copie publique d\'un match non offert : aucune trace de la simulation', () => {
  const m = match();
  assert.ok(SIM_FIELD && SIM_FIELD.tr.length === 6);
  const publique = PREMIUM.stripPremium(m);
  assert.equal(publique.sim_15min, undefined);
  assert.deepEqual(PREMIUM.premiumLeaks(m).includes('sim_15min'), true, 'le controle de fuite la detecte');
  assert.deepEqual(PREMIUM.premiumLeaks(publique), []);
  const pre = SPLIT.preloadedMatch(m);
  assert.equal(pre.sim_15min, undefined);
  const texte = JSON.stringify(pre);
  assert.doesNotMatch(texte, /"tr"|"premier"/);
  // Vue construite a partir de la copie publique : aucun chiffre de simulation.
  assert.equal(buildMatchViewModel(publique).model.goalSimulation, null);
  // Le detail match/<id>.json est ecrit a partir des matchs publics : meme chose.
  const split = SPLIT.buildPublicSplit([publique], {});
  split.list.matchs.forEach(x => assert.equal(x.sim_15min, undefined));
  split.details.forEach(x => assert.equal(x.match.sim_15min, undefined));
  assert.doesNotMatch(JSON.stringify(split.details), /"tr":|"premier":/);
});

test('HTML statique de la page match : aucun chiffre de la simulation, quel que soit le pays', () => {
  const tpl = read('match.html');
  const m = match();
  const pcts = SIM_FIELD.tr.map(p => String(Math.round(p * 100)) + ' ?%');
  for (const d of ['fr', 'gb', 'mx']) {
    const html = SEO.renderMatchPage(tpl, m, d);
    assert.doesNotMatch(html, /sim_15min/, d);
    assert.doesNotMatch(html, /Qui ouvre le score|Who scores first|La fin de match est en général/, d);
    for (const p of pcts) assert.doesNotMatch(html.replace(/<script>var PRELOADED_MATCH=[\s\S]*?<\/script>/, ''), new RegExp('>' + p + '<'), d);
  }
});

test('vue visiteur de la page : ne lit jamais la simulation', () => {
  const js = read('match-page.js');
  const gate = js.slice(js.indexOf('function gateCard(vm,opts)'), js.indexOf('function renderAuthWall'));
  assert.ok(gate.length > 2000);
  for (const interdit of ['goalSimulation', 'sim_15min', 'scenarioCard(', 'scenarioChart(']) assert.ok(!gate.includes(interdit), interdit);
  // La carte scenario n'est rendue que dans l'analyse (abonne, match offert, match termine).
  const analyse = js.slice(js.indexOf('function analyseAbonne(vm)'), js.indexOf('function render(raw)'));
  assert.match(analyse, /scenarioCard\(vm\)/);
});

test('abonne : la vue lit la simulation et ne parle plus de frequence observee', () => {
  const vm = buildMatchViewModel(match());
  const g = vm.model.goalSimulation;
  const js = read('match-page.js');
  assert.equal(g.slots.length, 6);
  assert.ok(g.firstGoal.home > g.firstGoal.away);
  // Validation du mathematicien (28/09/2026) : pas de tranche « pronostiquee », pas de score a la
  // pause, aucun verdict but / pas de but, jamais « calibre » ni taux de reussite affiche.
  assert.equal(g.hot, undefined);
  assert.equal(g.halfTime, undefined);
  const carte = js.slice(js.indexOf('function scenarioChart(g)'), js.indexOf('// QUESTIONS FREQUENTES'));
  assert.doesNotMatch(carte, /halfTime|hotIndex|g\.hot|is-hot|sim_hot|sim_half/);
  const langues = ['fr', 'en', 'es', 'es-mx', 'de', 'it', 'pt'];
  const nos = langues.map(l => read('i18n/parts/sim15.' + l + '.json')).join('');
  assert.doesNotMatch(nos + carte, /calibr|taux de réussite|Tranche la plus chaude|Hottest period|pause|half-time/i);
  const dicts = langues.map(l => read('i18n/dict/' + l + '.json')).join('');
  assert.doesNotMatch(dicts, /"sim_hot"|"sim_half_title"/);
  assert.equal(vm.editorial.goalTiming, undefined);
  assert.doesNotMatch(js, /Fréquence observée, pas une prévision pour celui-ci/);
  assert.doesNotMatch(js, /entre donc plus vite dans ses matchs|la plus exposée sur la fin/);
});

// ===========================================================================
// Relecture de l'avocat du diable (29/09/2026) : S1, S2, S3
// ===========================================================================

test('S1 : la simulation part des buts attendus du moteur v3, calculee apres lui ; sans v3, pas de simulation', () => {
  const wf = read('.github/workflows/update-data.yml');
  const script = wf.slice(wf.indexOf("cat > pipeline.js << 'JSEOF'"), wf.indexOf('          JSEOF'));
  // Plus dans le litteral du match (calcule avant que le moteur v3 ne remplace lambda_h/lambda_a).
  assert.doesNotMatch(script, /sim_15min:sim15Champ\(lambdas\./);
  const i = script.indexOf('matchObj.sim_15min=');
  assert.ok(i > 0, 'calcul sur matchObj');
  const ligne = script.slice(i, script.indexOf(':null;', i));
  assert.match(ligne, /matchObj\.moteur_v3&&matchObj\.moteur_v3\.source==='v3'/);
  assert.match(ligne, /matchObj\.reliability\.source==='moteur_v3'/);
  assert.match(ligne, /sim15Champ\(matchObj\.lambda_h,matchObj\.lambda_a,matchObj\.p1,matchObj\.p2,/);
  assert.match(ligne, /kickoffGateFix\.open/);
  // Apres la garde coup d'envoi du match (et donc apres le bloc du moteur v3 qui la precede).
  assert.ok(i > script.indexOf('if(!kickoffGateFix.open) closeMatchForPick(matchObj'));
  assert.ok(i < script.indexOf('matchsData.push(matchObj);'));
});

test('S2 : TOUT en Pro, meme sur le match offert (fichiers publics, fonction Edge, page)', () => {
  // 30/09/2026 : le detail des Stats IASHARK suit la meme regle (tests/stats-book.test.js).
  assert.deepEqual(PREMIUM.PRO_ONLY_FIELDS, ['sim_15min', 'stats_iashark', 'lecture_match']);
  const offert = match({ is_free: true, pari_rec: 'Over 1.5' });
  const pub = PREMIUM.stripPremium(offert);
  assert.equal(pub.sim_15min, undefined, 'match offert : simulation retiree');
  assert.equal(pub.pari_rec, 'Over 1.5', 'le reste de l analyse offerte reste public');
  assert.deepEqual(PREMIUM.premiumLeaks(offert), ['sim_15min']);
  assert.deepEqual(PREMIUM.premiumLeaks(pub), []);
  assert.equal(PREMIUM.deepPremiumLeaks({ matchs: [offert] }).length, 1);
  assert.equal(SPLIT.preloadedMatch(offert).sim_15min, undefined);
  const html = SEO.renderMatchPage(read('match.html'), offert, 'fr');
  assert.doesNotMatch(html, /sim_15min/);
  // Pipeline : la copie publique du match offert passe par sansChampsPro.
  const wf = read('.github/workflows/update-data.yml');
  assert.match(wf, /if\(m\.is_free\)return PREMIUM_FIELDS_LIB\.sansChampsPro\(m\);/);
  assert.doesNotMatch(wf, /if\(!m\|\|m\.is_free\|\|!PEUT_PROTEGER\)return m;/);
  // Fonction Edge : meme liste, appliquee au match offert d'un non-abonne.
  const edge = read('supabase/functions/match-data/index.ts');
  const liste = JSON.parse(/const CHAMPS_PRO_SEULEMENT = (\[[^\]]*\]);/.exec(edge)[1]);
  assert.deepEqual(liste, PREMIUM.PRO_ONLY_FIELDS);
  assert.match(edge, /if \(estGratuit\(m\)\) return sansChampsPro\(m\);/);
  // Page : la carte n'est rendue que pour un Pro ; sinon la donnee est jetee.
  const js = read('match-page.js');
  assert.match(js, /body:VUE_PRO\?scenarioCard\(vm\):empty\(/);
  // 30/09/2026 : le detail des Stats IASHARK est jete de la meme facon.
  assert.match(js, /VUE_PRO=!!ctx\.isPro;\n[^\n]*\n\s*if\(!VUE_PRO\)\{delete raw\.sim_15min;delete raw\.stats_iashark;\}\n\s*render\(raw\);/);
  for (const l of ['fr', 'en', 'es', 'es-mx', 'de', 'it', 'pt']) {
    assert.ok(JSON.parse(read('i18n/dict/' + l + '.json')).match_page.sim_pro_only, l);
  }
});

test('S3 : les videos lisent la simulation et les buts attendus du site, jamais un troisieme jeu', () => {
  const v = read('scripts/videos/build-daily-videos.mjs').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  assert.match(v, /premium_fields\?\.sim_15min/);
  assert.doesNotMatch(v, /DEFAULT_SHARES|scenario_15min/);
  assert.doesNotMatch(v, /PLUS CHAUD|MEILLEURE FENÊTRE|C'EST ICI QUE LES BUTS/);
  // Decision de Clement (29/09/2026) : un match des videos, le plus sur du v3 (publie ou non), departage le plus tot.
  assert.match(v, /\.filter\(\(\{p\}\) => p && simDe\(p\) && plusSurDe\(p\) !== null\)/);
  assert.match(v, /plusSurDe\(b\.p\) - plusSurDe\(a\.p\)\s*\|\| kickoffParis\(a\.m\)\.localeCompare\(kickoffParis\(b\.m\)\)/);
  assert.doesNotMatch(v, /\|\| 5000|simulation_count/, 'jamais un nombre de simulations invente');
  assert.match(v, /simDe\(p\)\?\.nb_simulations/);
  const sim = 'remotion-score-template/simulator/src/';
  for (const f of ['index.ts', 'batch.ts']) {
    const src = read(sim + f);
    assert.doesNotMatch(src, /buildStrength/, f);
    assert.match(src, /strengthFromSite\(/, f);
  }
});

test('nb_simulations : absent du calcul exact, transmis seulement quand la simulation en a vraiment tire', () => {
  assert.equal('nb_simulations' in SIM_FIELD, false, 'calcul exact : aucun tirage, aucun nombre');
  const src = read('lib/simulation-15min.js');
  assert.match(src, /var nb = Number\(s\.nb_simulations\);\s*if \(Number\.isInteger\(nb\) && nb > 0\) out\.nb_simulations = nb;/);
});

test('videos : aucune promesse de gain (ni « GAGNER » ni « SAFE ») et une panne du calcul ne coupe plus tout sans prevenir', () => {
  const comp = read('remotion-score-template/src/Composition.tsx');
  assert.doesNotMatch(comp, /GAGNER|title: "SAFE"/);
  assert.match(comp, /ANTICIPER&nbsp;&nbsp; \| &nbsp;&nbsp;COMPRENDRE/);
  assert.match(comp, /title: "LE PLUS PROBABLE"/);
  const v = read('scripts/videos/build-daily-videos.mjs');
  assert.match(v, /ticketProps\("LE PLUS PROBABLE", safe\)/);
  assert.doesNotMatch(v, /`SAFE du/);
  const wf = read('.github/workflows/daily-videos.yml');
  assert.match(wf, /github\.event\.workflow_run\.conclusion == 'failure'/);
  assert.match(wf, /CALCUL_EN_ECHEC:/);
  assert.match(read('scripts/videos/send-telegram.mjs'), /process\.env\.CALCUL_EN_ECHEC === "1"/);
});
