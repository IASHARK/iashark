'use strict';
// Inscription sur la page match (25/11/2026) : memes regles que la page d'inscription.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ir = fs.readFileSync(path.join(__dirname, '..', 'lib', 'inscription-rapide.js'), 'utf8');
const ap = fs.readFileSync(path.join(__dirname, '..', 'auth-pages.js'), 'utf8');
const mp = fs.readFileSync(path.join(__dirname, '..', 'match-page.js'), 'utf8');

test('meme preuve de consentement e-mail que la page d inscription, case decochee', () => {
  const version = ap.match(/EMAIL_CONSENT_TEXT_VERSION = '([^']+)'/)[1];
  assert.match(ir, new RegExp("EMAIL_CONSENT_TEXT_VERSION = '" + version + "'"));
  assert.match(ir, /<input type="checkbox" id="irEmails">/);
  assert.doesNotMatch(ir, /id="irEmails"[^>]*checked/);
  assert.match(ir, /auth\.legal_cgv/);
  assert.match(ir, /auth\.legal_privacy/);
});

test('memes mesures que la page d inscription, sans jamais l email', () => {
  for (const ev of ['signup_started', 'signup_form_started', 'signup_submitted', 'signup_completed', 'signup_failed']) assert.match(ir, new RegExp("'" + ev + "'"));
  assert.match(ir, /suivre\('signup_completed', \{\}, s\.user && s\.user\.id, s\.access_token\)/);
  assert.doesNotMatch(ir, /suivre\([^)]*\bv\b[^)]*\)/);
});

test('jamais le message brut du serveur', () => {
  assert.match(ir, /msg\.textContent = messageLisible\(brut\)/);
  assert.match(ir, /auth\.err_generic/);
});

test('la page match ouvre le formulaire sur le bouton du cadenas du match offert, lien de repli conserve', () => {
  const debut = mp.indexOf('function renderAuthWall(');
  const f = mp.slice(debut, mp.indexOf('\n}', debut));
  assert.match(f, /besoin\('IasharkInscriptionRapide','\/lib\/inscription-rapide\.js'\)/);
  assert.match(f, /if\(IR\.ouvrir\(boutonCompte\)\)ev\.preventDefault\(\)/);
  assert.match(f, /lien\('inscription\.html\?next='\+retour\)/);
});
