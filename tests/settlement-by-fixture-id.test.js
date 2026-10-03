'use strict';
// Audit du 28/09/2026 : un resultat ne doit JAMAIS etre donne a un pari parce que
// les noms d'equipes « se ressemblent » (Levenshtein). Seul le numero de match
// compte ; repli unique : pari sans numero ET noms strictement identiques.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const wf = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/update-data.yml'), 'utf8');

test('reglement historique : aucun rapprochement par noms ressemblants', () => {
  const lignes = wf.split('\n').filter((l) => /histo(Early)?\.predictions\.find/.test(l));
  assert.ok(lignes.length >= 4, 'les deux blocs de reglement sont trouves');
  for (const l of lignes) assert.ok(!/levenshtein/.test(l), 'Levenshtein interdit : ' + l.trim().slice(0, 90));
});

test('reglement historique : le repli par noms exige un pari sans numero de match', () => {
  const replis = wf.split('\n').filter((l) => /if\(!found\)found=histo(Early)?\.predictions\.find/.test(l));
  assert.equal(replis.length, 2);
  for (const l of replis) assert.match(l, /!p\.fixture_id/);
});

test('reglement : les equipes du resultat doivent etre celles du pari', () => {
  assert.equal((wf.match(/if\(!memesEquipes\(found,homeN,awayN\)\)/g) || []).length, 2);
  const code = wf.slice(wf.indexOf('function memesEquipes'), wf.indexOf('function levenshtein'))
    + wf.slice(wf.indexOf('function levenshtein'), wf.indexOf('}', wf.indexOf('return dp[') > 0 ? wf.indexOf('return dp[') : wf.indexOf('function levenshtein')) + 1);
  assert.ok(code.includes('proche(p.home,homeN)&&proche(p.away,awayN)'));
});
