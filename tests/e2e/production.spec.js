'use strict';
// Controles propres au site servi : redirections Netlify, fichiers internes
// non publies, absence de champs premium dans les fichiers publics.
// Les redirections et les 404 ne tournent qu'en production (_redirects n'est
// pas applique par le serveur statique local) ; le controle de fuite tourne
// dans les deux modes (dist/ local puis production).
const { test, expect, IS_PROD } = require('./helpers/fixtures');
const { premiumLeaks } = require('./helpers/site-data');

test.describe('production', () => {
  test('redirections', async ({ request }) => {
    test.skip(!IS_PROD, 'Redirections Netlify : production uniquement');
    const cases = [
      ['/pro', '/fr/pro.html'],
      ['/gb/blog/', '/en/blog/'],
      ['/historique', '/fr/'],
    ];
    const failures = [];
    for (const [from, to] of cases) {
      const r = await request.get(from, { maxRedirects: 0 });
      const loc = r.headers()['location'];
      const got = loc ? new URL(loc, 'https://iashark.com').pathname : null;
      if (![301, 302, 308].includes(r.status()) || got !== to) failures.push(`${from} -> HTTP ${r.status()} ${loc || '(sans Location)'} ; attendu 301 vers ${to}`);
    }
    expect(failures).toEqual([]);
  });

  test('fichiers internes non publies (404)', async ({ request }) => {
    test.skip(!IS_PROD, 'Production uniquement');
    const internal = ['/FINAL_360_AUDIT.md', '/supabase/functions/match-data/index.ts', '/supabase/migrations/', '/scripts/build-public.js', '/package.json', '/tests/e2e/README.md', '/config/markets.json'];
    const exposed = [];
    for (const p of internal) {
      const r = await request.get(p, { maxRedirects: 0 });
      if (r.status() !== 404) exposed.push(`${p} -> HTTP ${r.status()}`);
    }
    expect(exposed).toEqual([]);
  });

  test('aucun champ premium pour les matchs payants (data-home.json et echantillon match/<id>.json, anonyme)', async ({ request }) => {
    const leaks = [];
    const home = await request.get('/data-home.json');
    const homeIsJson = home.status() === 200 && /json/.test(home.headers()['content-type'] || '');
    // Liste publique lue par le site. data.json n'est plus publie (16/09/2026) : aucun repli.
    const listUrl = '/data-home.json';
    expect(homeIsJson, '/data-home.json absent (HTTP ' + home.status() + ')').toBe(true);
    const data = await home.json();
    expect(Array.isArray(data.matchs) && data.matchs.length, listUrl + ' sans matchs').toBeTruthy();
    for (const m of data.matchs) { const l = premiumLeaks(m); if (l.length) leaks.push(`${listUrl} match ${m.id} : ${l.join(', ')}`); }
    const sample = data.matchs.filter((m) => m.is_free !== true).slice(0, 8);
    for (const m of sample) {
      const r = await request.get(`/match/${m.id}.json`);
      if (r.status() !== 200 || !/json/.test(r.headers()['content-type'] || '')) continue; // detail absent : rien a divulguer
      const d = await r.json();
      const l = premiumLeaks(d);
      if (l.length) leaks.push(`match/${m.id}.json : ${l.join(', ')}`);
    }
    expect(leaks).toEqual([]);
  });
});
