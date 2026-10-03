const test = require('node:test');
const assert = require('node:assert/strict');
const SIM = require('../lib/simulation-15min.js');
const PARAMS = require('../lib/simulation-15min-params.json');
const GOLDEN = require('./fixtures/simulation-15min-golden.json');

const TOL = 0.001;

function proche(a, b, quoi) {
  assert.ok(Math.abs(a - b) <= TOL, `${quoi} : JS ${a} contre Python ${b}`);
}

test('golden : 50 matchs du test, JS = Python à 0,001 près (avant le match)', () => {
  assert.equal(GOLDEN.version, PARAMS.version);
  assert.equal(GOLDEN.cas.length, 50);
  let ecartMax = 0;
  for (const c of GOLDEN.cas) {
    const s = SIM.simuler({ lambdaH: c.lambda_h, lambdaA: c.lambda_a, favori: c.favori, ligueApi: c.ligue_api });
    c.p_but_tranche.forEach((p, k) => { proche(s.tranches[k].pBut, p, `${c.fixture_id} tranche ${k}`); ecartMax = Math.max(ecartMax, Math.abs(s.tranches[k].pBut - p)); });
    for (const cote of [0, 1]) c.premier[cote].forEach((p, k) => proche(s.premierBut.parTranche[cote][k], p, `${c.fixture_id} premier ${cote}/${k}`));
    c.mi_temps.forEach((ligne, i) => ligne.forEach((p, j) => proche(s.miTemps.dist[i][j], p, `${c.fixture_id} pause ${i}-${j}`)));
    c.final.forEach((ligne, i) => ligne.forEach((p, j) => proche(s.final.dist[i][j], p, `${c.fixture_id} final ${i}-${j}`)));
    c.buts_apres_75.forEach((p, k) => proche(s.butsApres75[k], p, `${c.fixture_id} après 75e ${k}`));
    proche(s.kappa[0], c.kappa[0], 'kappa dom'); proche(s.kappa[1], c.kappa[1], 'kappa ext');
    // le total de buts attendus reste celui du moteur
    proche(s.butsAttendus[0], c.lambda_h, 'buts attendus dom');
    proche(s.butsAttendus[1], c.lambda_a, 'buts attendus ext');
  }
  assert.ok(ecartMax < TOL);
});

test('golden : repartir de la pause avec le vrai score donne le même résultat qu\'en Python', () => {
  for (const c of GOLDEN.cas) {
    const e = c.pause.etat;
    const s = SIM.simuler({ lambdaH: c.lambda_h, lambdaA: c.lambda_a, favori: c.favori, ligueApi: c.ligue_api,
      etat: { minute: 45, butsDom: e.buts_dom, butsExt: e.buts_ext, rougeDom: e.rouge_dom, rougeExt: e.rouge_ext } });
    c.pause.p_but_tranche.forEach((p, k) => {
      if (p === null) assert.equal(s.tranches[k].pBut, null);
      else proche(s.tranches[k].pBut, p, `${c.fixture_id} pause tranche ${k}`);
    });
    c.pause.final.forEach((ligne, i) => ligne.forEach((p, j) => proche(s.final.dist[i][j], p, `${c.fixture_id} pause final ${i}-${j}`)));
  }
});

test('les probabilités sont cohérentes (sommes à 1, tranche chaude = maximum)', () => {
  const s = SIM.simuler({ lambdaH: 1.6, lambdaA: 1.1, favori: 'home', ligueApi: 61 });
  const pb = s.premierBut;
  assert.ok(Math.abs(pb.home + pb.away + pb.aucun - 1) < 1e-9);
  const max = Math.max(...s.tranches.map(x => x.pBut));
  assert.equal(s.trancheChaude.pBut, max);
  assert.equal(s.trancheChaude.label, '76-90+');
  const tot = s.miTemps.dist.flat().reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(tot - 1) < 1e-9);
  assert.ok(pb.home > pb.away, 'le favori à domicile ouvre plus souvent le score');
});

test('entrées invalides : aucun chiffre fabriqué', () => {
  assert.equal(SIM.simuler({ lambdaH: null, lambdaA: 1 }), null);
  assert.equal(SIM.champPipeline({ lambdaH: 0, lambdaA: 1 }), null);
});

test('champ compact du pipeline', () => {
  const c = SIM.champPipeline({ lambdaH: 1.4, lambdaA: 1.2, favori: null, ligueApi: 39 });
  assert.equal(c.v, PARAMS.version);
  assert.equal(c.tr.length, 6);
  assert.ok(Math.abs(c.premier.h + c.premier.a + c.premier.n - 1) < 0.003);
  // Validation du mathematicien : ni tranche la plus chaude ni score a la pause publies.
  assert.deepEqual(Object.keys(c).sort(), ['premier', 'tr', 'v']);
});

test('repartir en cours de match : les tranches déjà jouées ne sont plus annoncées, un but déjà marqué supprime « premier but »', () => {
  const s = SIM.simuler({ lambdaH: 1.5, lambdaA: 1.0, favori: 'home', etat: { minute: 70, butsDom: 1, butsExt: 0 } });
  assert.deepEqual(s.tranches.slice(0, 4).map(x => x.pBut), [null, null, null, null]);
  assert.ok(s.tranches[4].pBut > 0 && s.tranches[5].pBut > 0);
  assert.equal(s.premierBut, null);
  assert.ok(s.final.p1n2[0] > 0.6);
});
