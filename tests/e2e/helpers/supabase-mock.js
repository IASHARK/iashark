'use strict';
// Simulation complete de Supabase (Auth, REST, Edge Functions) par
// interception reseau Playwright. AUCUNE requete ne part vers le vrai projet :
// tout appel a https://ksvjraqitxouwiabecai.supabase.co est servi ici, et un
// appel non prevu recoit une 404 et est enregistre dans `unmocked` (les tests
// echouent s'il en reste, voir fixtures.js).
//
// Etats simules : anonyme, gratuit, Pro, admin (PERSONAS). La session est
// injectee dans localStorage exactement comme supabase-js v2 la stocke :
// cle `sb-<ref du projet>-auth-token`, valeur JSON de la session.

const SUPABASE_URL = 'https://ksvjraqitxouwiabecai.supabase.co';
const PROJECT_REF = 'ksvjraqitxouwiabecai';
const STORAGE_KEY = 'sb-' + PROJECT_REF + '-auth-token';

const STRIPE_CHECKOUT_URL = 'https://checkout.stripe.com/c/pay/cs_test_e2e_mock';
const STRIPE_PORTAL_URL = 'https://billing.stripe.com/p/session/test_e2e_mock';

function isoInDays(days) { return new Date(Date.now() + days * 86400000).toISOString(); }

const PERSONAS = {
  free: { key: 'free', id: '00000000-0000-4000-8000-0000000000f1', email: 'e2e.free@example.test', plan: 'free', role: 'user', capital: null, subscription: null },
  pro: {
    key: 'pro', id: '00000000-0000-4000-8000-0000000000b2', email: 'e2e.pro@example.test', plan: 'pro', role: 'user', capital: 500,
    subscription: { status: 'active', current_period_end: isoInDays(21), cancel_at_period_end: false, created_at: isoInDays(-9) },
  },
  admin: { key: 'admin', id: '00000000-0000-4000-8000-0000000000a3', email: 'e2e.admin@example.test', plan: 'free', role: 'admin', capital: null, subscription: null },
};

function b64url(input) {
  return Buffer.from(typeof input === 'string' ? input : JSON.stringify(input)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function decodeJwt(token) {
  try { return JSON.parse(Buffer.from(String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')); } catch (e) { return null; }
}

function userOf(p) {
  return {
    id: p.id, aud: 'authenticated', role: 'authenticated', email: p.email, phone: '',
    email_confirmed_at: '2026-08-01T10:00:00.000Z', confirmed_at: '2026-08-01T10:00:00.000Z', last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, identities: [],
    created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z', is_anonymous: false,
  };
}
function sessionOf(p) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 3600;
  const access = b64url({ alg: 'HS256', typ: 'JWT' }) + '.' + b64url({
    iss: SUPABASE_URL + '/auth/v1', sub: p.id, aud: 'authenticated', exp, iat: now, email: p.email, role: 'authenticated', session_id: 'e2e-' + p.key, is_anonymous: false,
  }) + '.' + b64url('e2e-mock-signature');
  return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'e2e-refresh-' + p.key, user: userOf(p) };
}

class SupabaseMock {
  constructor(page, siteData) {
    this.page = page;
    this.siteData = siteData;
    this.persona = null;          // persona dont la session est injectee
    this.loginPersona = null;     // persona renvoyee par login-guard (connexion simulee)
    this.calls = [];
    this.unmocked = [];
    this.fnHandlers = {};
    this._waiters = [];
  }

  // Session injectee AVANT le chargement de la page, une seule fois par onglet
  // (sessionStorage) : une deconnexion reste une deconnexion aux navigations suivantes.
  async as(personaKey) {
    const p = PERSONAS[personaKey];
    if (!p) throw new Error('Persona inconnue : ' + personaKey);
    this.persona = p;
    const session = sessionOf(p);
    await this.page.addInitScript(([key, value]) => {
      try {
        if (!sessionStorage.getItem('e2e_session_injected')) {
          localStorage.setItem(key, value);
          sessionStorage.setItem('e2e_session_injected', '1');
        }
      } catch (e) { /* stockage indisponible */ }
    }, [STORAGE_KEY, JSON.stringify(session)]);
    return p;
  }

  // La prochaine connexion (login-guard) reussit pour cette persona.
  loginSucceedsAs(personaKey) { this.loginPersona = PERSONAS[personaKey]; }

  // Reponse d'une fonction Edge : objet {status, json} ou fonction (body, call) -> {status, json}.
  // Un tableau = file de reponses successives (la derniere est reutilisee).
  onFunction(name, handler) { this.fnHandlers[name] = Array.isArray(handler) ? handler.slice() : handler; }

  callsTo(name) { return this.calls.filter((c) => c.kind === 'function' && c.name === name); }

  waitForCall(name, timeout = 15000) {
    const existing = this.callsTo(name).length;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Aucun appel a la fonction ' + name + ' en ' + timeout + ' ms')), timeout);
      this._waiters.push({ name, after: existing, resolve: (c) => { clearTimeout(timer); resolve(c); } });
    });
  }

  _record(call) {
    this.calls.push(call);
    if (call.kind !== 'function') return;
    const count = this.callsTo(call.name).length;
    this._waiters = this._waiters.filter((w) => {
      if (w.name === call.name && count > w.after) { w.resolve(call); return false; }
      return true;
    });
  }

  _personaFromAuth(headers) {
    const auth = headers['authorization'] || '';
    const payload = decodeJwt(auth.replace(/^Bearer\s+/i, ''));
    if (!payload || payload.role !== 'authenticated') return null;
    return Object.values(PERSONAS).find((p) => p.id === payload.sub) || null;
  }

  async install() {
    await this.page.route(SUPABASE_URL + '/**', (route) => this._handle(route));
  }

  async _handle(route) {
    const req = route.request();
    const url = new URL(req.url());
    const headers = req.headers();
    const cors = {
      'Access-Control-Allow-Origin': headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS',
      'Access-Control-Allow-Headers': headers['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info,prefer,accept,accept-profile,content-profile,range,x-supabase-api-version',
      'Access-Control-Expose-Headers': 'Content-Range, X-Total-Count, Content-Location',
    };
    const json = (status, body, extra) => route.fulfill({ status, headers: Object.assign({ 'Content-Type': 'application/json' }, cors, extra || {}), body: body === undefined ? '' : JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    let body = null;
    try { body = req.postData() ? JSON.parse(req.postData()) : null; } catch (e) { body = req.postData(); }
    const p = url.pathname;
    const caller = this._personaFromAuth(headers);
    const call = { method: req.method(), path: p, search: url.search, body, headers, persona: caller && caller.key };

    // ---------------- Auth ----------------
    if (p.startsWith('/auth/v1/')) {
      this._record(Object.assign({ kind: 'auth' }, call));
      if (p === '/auth/v1/user') return caller ? json(200, userOf(caller)) : json(401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' });
      if (p === '/auth/v1/token') {
        const who = caller || this.persona || this.loginPersona;
        return who ? json(200, sessionOf(who)) : json(400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      }
      if (p === '/auth/v1/logout') return route.fulfill({ status: 204, headers: cors });
      if (p === '/auth/v1/recover') return json(200, {});
      if (p === '/auth/v1/settings') return json(200, { external: { email: true }, disable_signup: false, mailer_autoconfirm: true });
      this.unmocked.push(req.method() + ' ' + p);
      return json(404, { error: 'e2e: auth endpoint non simule ' + p });
    }

    // ---------------- REST (PostgREST) ----------------
    if (p.startsWith('/rest/v1/')) {
      this._record(Object.assign({ kind: 'rest' }, call));
      const table = p.slice('/rest/v1/'.length);
      const wantsObject = /vnd\.pgrst\.object/.test(headers.accept || '');
      const rows = (list) => {
        if (req.method() === 'HEAD') return route.fulfill({ status: 200, headers: Object.assign({ 'Content-Range': '*/' + list.length }, cors) });
        if (wantsObject) return list.length ? json(200, list[0]) : json(406, { code: 'PGRST116', details: 'The result contains 0 rows', hint: null, message: 'JSON object requested, multiple (or no) rows returned' });
        return json(200, list, { 'Content-Range': (list.length ? '0-' + (list.length - 1) : '*') + '/' + list.length });
      };
      if (req.method() === 'GET' || req.method() === 'HEAD') {
        if (!caller) return rows([]);
        if (table === 'users') return rows([{ id: caller.id, email: caller.email, plan: caller.plan, role: caller.role, capital: caller.capital, created_at: '2026-08-01T10:00:00.000Z', updated_at: '2026-09-01T10:00:00.000Z' }]);
        if (table === 'subscriptions') return rows(caller.subscription ? [caller.subscription] : []);
        return rows([]); // user_preferences, betting_decisions, ...
      }
      // Ecritures (upsert preferences, funnel_events...) : acceptees sans effet.
      return route.fulfill({ status: 201, headers: cors });
    }

    // ---------------- Edge Functions ----------------
    if (p.startsWith('/functions/v1/')) {
      const name = p.slice('/functions/v1/'.length).replace(/\/.*$/, '');
      const fnCall = Object.assign({ kind: 'function', name }, call);
      this._record(fnCall);
      let handler = this.fnHandlers[name];
      if (Array.isArray(handler)) handler = handler.length > 1 ? handler.shift() : handler[0];
      let out;
      if (typeof handler === 'function') out = await handler(body, fnCall);
      else if (handler) out = handler;
      else out = await this._defaultFunction(name, body, caller);
      return json(out.status || 200, out.json);
    }

    this.unmocked.push(req.method() + ' ' + p);
    return json(404, { error: 'e2e: endpoint Supabase non simule ' + p });
  }

  async _defaultFunction(name, body, caller) {
    const isPro = !!(caller && (caller.plan === 'pro' || caller.role === 'admin'));
    switch (name) {
      case 'login-guard':
        if (this.loginPersona) return { status: 200, json: sessionOf(this.loginPersona) };
        return { status: 400, json: { error: 'Invalid login credentials' } };
      case 'match-data':
        if (!caller) return { status: 401, json: { error: 'unauthorized' } };
        return { status: 200, json: await this.siteData.matchDataResponse(body, isPro) };
      case 'sync-subscription':
        return { status: 200, json: { ok: true, plan: caller ? caller.plan : null } };
      case 'create-portal-session':
        return { status: 200, json: { url: STRIPE_PORTAL_URL } };
      case 'delete-account':
        return { status: 200, json: { ok: true } };
      case 'create-checkout-session':
        // Jamais d'URL par defaut : chaque test de paiement choisit sa reponse.
        return { status: 500, json: { error: 'e2e: create-checkout-session non configure pour ce test' } };
      default:
        this.unmocked.push('POST /functions/v1/' + name);
        return { status: 404, json: { error: 'e2e: fonction non simulee ' + name } };
    }
  }
}

// Tiers externes : jamais appeles pendant les tests (analytics, Stripe, logos
// d'API), servis par des reponses neutres pour ne produire ni bruit ni erreur.
// Le SDK supabase-js (jsdelivr) est bien telecharge, puis mis en cache par worker.
const cdnCache = new Map();
const PNG_1PX = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

async function isolateThirdParties(page) {
  await page.route(/^https:\/\/(www\.)?(googletagmanager|google-analytics)\.com\//, (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  await page.route(/^https:\/\/[^/]*\.(google-analytics|analytics\.google)\.com\//, (r) => r.fulfill({ status: 204, body: '' }));
  await page.route(/^https:\/\/ingesteer\.services-prod\.nsvcs\.net\//, (r) => r.fulfill({ status: 204, body: '' }));
  await page.route(/^https:\/\/(media|widgets)\.api-sports\.io\//, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG_1PX }));
  await page.route(/^https:\/\/fonts\.googleapis\.com\//, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.route(/^https:\/\/(checkout|billing)\.stripe\.com\//, (r) => r.fulfill({
    status: 200, contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html lang="en"><title>Stripe (simulation E2E)</title><h1 id="e2e-stripe-mock">Stripe simule - aucun paiement reel</h1></html>',
  }));
  await page.route(/^https:\/\/cdn\.jsdelivr\.net\//, async (route) => {
    const key = route.request().url();
    if (!cdnCache.has(key)) {
      const res = await route.fetch();
      cdnCache.set(key, { status: res.status(), headers: res.headers(), body: await res.body() });
    }
    const c = cdnCache.get(key);
    return route.fulfill({ status: c.status, headers: c.headers, body: c.body });
  });
}

module.exports = { SupabaseMock, PERSONAS, STORAGE_KEY, SUPABASE_URL, STRIPE_CHECKOUT_URL, STRIPE_PORTAL_URL, sessionOf, isolateThirdParties };
