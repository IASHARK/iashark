'use strict';
// Deuxieme barriere (audit du 28/09/2026) : aucun pari n'entre dans l'historique
// s'il n'a pas ete publie avant le coup d'envoi.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parisLocalToMs, publishedBeforeKickoff } = require('../lib/kickoff-guard.js');

test('heure de Paris convertie avec l’heure d’ete et d’hiver', () => {
  assert.equal(new Date(parisLocalToMs('2026-09-27 18:00')).toISOString(), '2026-09-27T16:00:00.000Z');
  assert.equal(new Date(parisLocalToMs('2026-12-05 21:00')).toISOString(), '2026-12-05T20:00:00.000Z');
  assert.equal(parisLocalToMs('pas une date'), null);
  // Nuits du changement d'heure : 01h30 a Paris est encore l'heure d'ete le 25/10
  // et deja l'heure d'hiver le 28/03 (avant le passage de 02h00).
  assert.equal(new Date(parisLocalToMs('2026-10-25 01:30')).toISOString(), '2026-10-24T23:30:00.000Z');
  assert.equal(new Date(parisLocalToMs('2027-03-28 01:30')).toISOString(), '2027-03-28T00:30:00.000Z');
});

test('cas reel : Liga MX a 03h00 Paris, publie a 13h24 Paris le meme jour = refuse', () => {
  const m = { date: '2026-09-14 03:00', pick_frozen_at: '2026-09-14T11:24:00Z' };
  assert.equal(publishedBeforeKickoff(m), false);
});

test('publie avant le coup d’envoi = accepte ; sans horodatage, jugement a l’heure du run', () => {
  assert.equal(publishedBeforeKickoff({ date: '2026-09-27 18:00', pick_frozen_at: '2026-09-27T11:26:00Z' }), true);
  assert.equal(publishedBeforeKickoff({ date: '2026-09-27 18:00' }, Date.parse('2026-09-27T17:00:00Z')), false);
  assert.equal(publishedBeforeKickoff({ date: '2026-09-27 18:00' }, Date.parse('2026-09-27T12:00:00Z')), true);
  assert.equal(publishedBeforeKickoff({}), false);
});

test('la barriere est branchee avant l’ajout a l’historique', () => {
  const wf = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/update-data.yml'), 'utf8');
  const barriere = wf.indexOf('!publishedBeforeKickoff(m,Date.now())');
  const ajout = wf.indexOf('histo.predictions.unshift({');
  assert.ok(barriere > 0 && barriere < ajout);
});
