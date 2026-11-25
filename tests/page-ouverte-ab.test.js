'use strict';
// Test A/B « page ouverte » (25/11/2026) : le groupe B voit les blocs PUBLICS sous le cadenas,
// jamais une donnee du modele ; funnel-track lit le groupe sans jamais le tirer.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const mp = fs.readFileSync(path.join(__dirname, '..', 'match-page.js'), 'utf8');
const ft = fs.readFileSync(path.join(__dirname, '..', 'funnel-track.js'), 'utf8');

test('groupe A/B : refus des cookies = groupe A sans rien ecrire, groupe force par ?ab=', () => {
  const f = mp.slice(mp.indexOf('function groupeAB('), mp.indexOf('function blocsPublics('));
  assert.match(f, /iashark_cookie_consent'\)==='refused'\)return 'A'/);
  assert.match(f, /get\('ab'\)/);
  assert.match(f, /localStorage\.setItem\('iashark_ab_page',g\)/);
});

test('blocs publics : seulement forme, classement, comparatif, compositions', () => {
  const f = mp.slice(mp.indexOf('function blocsPublics('), mp.indexOf('function renderProWall('));
  assert.match(f, /formeCarte\(vm\)/);
  assert.match(f, /classementCarte\(vm\)/);
  assert.match(f, /comparatifCarte\(vm\)/);
  assert.match(f, /compoCarte\(vm\)/);
  assert.doesNotMatch(f, /signalCard|marchesJoueursCarte|probasCarte|modeleCarte|scenarioCarte/);
});

test('les deux murs (Pro et compte gratuit) ajoutent les blocs publics au groupe B seulement, sur la copie publique', () => {
  for (const nom of ['function renderProWall(', 'function renderAuthWall(']) {
    const debut = mp.indexOf(nom);
    const f = mp.slice(debut, mp.indexOf('\n}', debut));
    assert.match(f, /const vm=viewModel\(publicCopy\(raw\)\)/, nom);
    assert.match(f, /if\(groupeAB\(\)==='B'\)secs\.push\(\.\.\.blocsPublics\(vm\)\)/, nom);
  }
});

test('funnel-track lit le groupe A/B sans jamais le tirer ni l ecrire', () => {
  assert.match(ft, /localStorage\.getItem\("iashark_ab_page"\)/);
  assert.match(ft, /md\.ab_page = ab/);
  assert.doesNotMatch(ft, /setItem\("iashark_ab_page"/);
});
