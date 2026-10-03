'use strict';
// Audit du 28/09/2026 : « plus de 1,5 but » (po15) etait ecrit a 0 en dur sur
// 100 % des matchs alors que le moteur le calcule (lib/engine.js, over15).
// Aucune probabilite publiee ne doit etre une constante ecrite en dur.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const wf = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/update-data.yml'), 'utf8');

test('po15 vient du moteur, jamais un 0 ecrit en dur', () => {
  assert.ok(!/\bpo15\s*:\s*0\s*[,}]/.test(wf), 'po15:0 en dur interdit');
  assert.match(wf, /po15:\(pureProbs\.over15!=null/);
});

test('aucune probabilite de marche publiee a une constante', () => {
  for (const champ of ['p1', 'pn', 'p2', 'po15', 'po25', 'btts']) {
    const re = new RegExp('[{,]\\s*' + champ + '\\s*:\\s*(0|50|100)\\s*[,}]');
    assert.ok(!re.test(wf), champ + ' ecrit en dur');
  }
});

test('match offert : un match analyse (FULL/STANDARD) passe avant un match non verifie', () => {
  const bloc = wf.slice(wf.indexOf('function designerMatchGratuit'), wf.indexOf('var cles=Object.keys(elus)'));
  assert.match(bloc, /var tierFiable=function\(m\)\{ return !!m && \(m\.analysis_tier==='FULL_ANALYSIS'\|\|m\.analysis_tier==='STANDARD_ANALYSIS'\); \};/);
  assert.match(bloc, /if\(fiablesDuJour\.length\) duJour=fiablesDuJour;/);
  assert.match(bloc, /meilleur\(tousFiables\.length\?tousFiables:tousAnalysables\)/);
});
