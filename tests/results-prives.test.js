'use strict';
// Decision de Clement (28/09/2026) : l'historique (results/<jour>.json) n'est plus
// publie sur le site. Le build public ne doit jamais le copier dans dist/.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'scripts/build-public.js'), 'utf8');

test('results/ ne fait plus partie des repertoires publies', () => {
  const ligne = src.split('\n').find((l) => /^const PUBLIC_DIRS\s*=/.test(l));
  assert.ok(ligne, 'PUBLIC_DIRS trouve');
  assert.ok(!/"results"/.test(ligne), 'results/ ne doit plus etre publie');
});
