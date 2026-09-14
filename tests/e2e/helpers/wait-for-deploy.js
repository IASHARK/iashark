#!/usr/bin/env node
'use strict';
// Attend que le deploiement Netlify du commit courant soit en ligne avant de
// lancer la suite production (.github/workflows/e2e.yml).
//
// Signaux acceptes, dans l'ordre :
//  1. marqueur de build dans la page live /gb/ : le SHA du commit (ex.
//     <meta name="iashark-build" content="<sha>">) - le plus fiable ;
//  2. statut de commit ou check-run GitHub "netlify" en succes (integration
//     GitHub de Netlify) ;
//  3. a defaut de tout signal : attente fixe (DEPLOY_FALLBACK_WAIT_SECONDS),
//     puis la suite tourne quand meme contre ce qui est en ligne.
// Ne fait jamais echouer le job : un avertissement est emis si le delai expire.
//
// Env : E2E_BASE_URL, GITHUB_SHA, GITHUB_REPOSITORY, GITHUB_TOKEN,
//       DEPLOY_TIMEOUT_MINUTES (20), DEPLOY_FALLBACK_WAIT_SECONDS (240).
const BASE = (process.env.E2E_BASE_URL || 'https://iashark.com').replace(/\/$/, '');
const SHA = process.env.GITHUB_SHA || '';
const REPO = process.env.GITHUB_REPOSITORY || '';
const TOKEN = process.env.GITHUB_TOKEN || '';
const TIMEOUT_MS = Number(process.env.DEPLOY_TIMEOUT_MINUTES || 20) * 60000;
const FALLBACK_MS = Number(process.env.DEPLOY_FALLBACK_WAIT_SECONDS || 240) * 1000;
const POLL_MS = 20000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (m) => console.log('[wait-for-deploy] ' + m);

async function liveHasMarker() {
  if (!SHA) return false;
  try {
    const r = await fetch(BASE + '/gb/?e2e=' + Date.now(), { headers: { 'Cache-Control': 'no-cache' } });
    const html = await r.text();
    return html.includes(SHA) || html.includes('content="' + SHA.slice(0, 7));
  } catch (e) { return false; }
}

async function gh(path) {
  if (!TOKEN || !REPO) return null;
  try {
    const r = await fetch('https://api.github.com/repos/' + REPO + path, { headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' } });
    return r.ok ? r.json() : null;
  } catch (e) { return null; }
}

async function netlifyState() {
  const st = await gh('/commits/' + SHA + '/status');
  const statuses = (st && st.statuses) || [];
  const s = statuses.find((x) => /netlify/i.test(x.context || '') && !/preview/i.test(x.context || ''));
  if (s) return s.state; // success | pending | failure | error
  const cr = await gh('/commits/' + SHA + '/check-runs');
  const run = ((cr && cr.check_runs) || []).find((x) => /netlify/i.test((x.name || '') + (x.app && x.app.slug || '')));
  if (run) return run.status !== 'completed' ? 'pending' : (run.conclusion === 'success' ? 'success' : 'failure');
  return null;
}

(async () => {
  const start = Date.now();
  let sawSignal = false;
  log('commit ' + (SHA || '(inconnu)') + ', cible ' + BASE);
  while (Date.now() - start < TIMEOUT_MS) {
    if (await liveHasMarker()) { log('marqueur de build du commit trouve sur ' + BASE + '/gb/ : deploiement en ligne.'); return; }
    const state = await netlifyState();
    if (state) sawSignal = true;
    if (state === 'success') { log('statut GitHub Netlify = success : deploiement en ligne.'); await sleep(15000); return; }
    if (state === 'failure' || state === 'error') { console.log('::warning::Le deploiement Netlify du commit a echoue : la suite production teste la version precedente encore en ligne.'); return; }
    if (!sawSignal && Date.now() - start >= FALLBACK_MS) {
      console.log('::warning::Aucun signal de deploiement (ni marqueur de build, ni statut Netlify) apres ' + Math.round(FALLBACK_MS / 1000) + ' s : la suite production tourne contre la version en ligne.');
      return;
    }
    log('deploiement pas encore visible (' + Math.round((Date.now() - start) / 1000) + ' s, statut Netlify : ' + (state || 'aucun') + ')');
    await sleep(POLL_MS);
  }
  console.log('::warning::Delai de ' + Math.round(TIMEOUT_MS / 60000) + ' min depasse en attendant le deploiement Netlify : la suite production tourne contre la version en ligne.');
})();
