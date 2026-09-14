'use strict';
// Fixtures partagees par toutes les specs :
//   test, expect   - Playwright etendu
//   supa           - SupabaseMock (auto : AUCUN test ne parle au vrai Supabase)
//   siteData       - donnees de match du run (worker)
//   dictFor(loc)   - dictionnaire i18n publie
//   consoleErrors  - erreurs console + exceptions JS de la page
const base = require('@playwright/test');
const { SupabaseMock, isolateThirdParties } = require('./supabase-mock');
const { loadSiteData, loadDict, IS_PROD } = require('./site-data');

const test = base.test.extend({
  siteData: [async ({}, use, workerInfo) => {
    await use(await loadSiteData(workerInfo.project.use.baseURL));
  }, { scope: 'worker' }],

  _dicts: [async ({}, use, workerInfo) => {
    const cache = new Map();
    await use(async (locale) => {
      if (!cache.has(locale)) cache.set(locale, await loadDict(workerInfo.project.use.baseURL, locale));
      return cache.get(locale);
    });
  }, { scope: 'worker' }],

  dictFor: async ({ _dicts }, use) => { await use(_dicts); },

  consoleErrors: [async ({ page }, use) => {
    const errors = [];
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return;
      const loc = msg.location();
      errors.push(msg.text() + (loc && loc.url ? '  (' + loc.url + ':' + loc.lineNumber + ')' : ''));
    });
    page.on('pageerror', (err) => errors.push('Exception JS non interceptee : ' + err.message));
    await use(errors);
  }, { auto: true }],

  supa: [async ({ page, siteData }, use) => {
    await isolateThirdParties(page);
    // Mode local : les pages lisent les fichiers de dist/ dates d'aujourd'hui.
    if (!IS_PROD && siteData.shiftDays) {
      await page.route(/\/data-home\.json(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(siteData.home) }));
      await page.route(/\/match\/\d+\.json(\?.*)?$/, async (r) => {
        const id = new URL(r.request().url()).pathname.match(/(\d+)\.json$/)[1];
        try { return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(await siteData.detail(id)) }); } catch (e) { return r.fallback(); }
      });
    }
    const mock = new SupabaseMock(page, siteData);
    await mock.install();
    await use(mock);
    base.expect(mock.unmocked, 'Appels Supabase non simules (a ajouter dans supabase-mock.js)').toEqual([]);
  }, { auto: true }],
});

const expect = base.expect;

// ---------------------------------------------------------------------------
// Assertions reutilisables
async function expectNoHorizontalScroll(page) {
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, w: window.innerWidth }));
  expect(m.sw, 'Defilement horizontal : largeur du document ' + m.sw + ' px > fenetre ' + m.cw + ' px').toBeLessThanOrEqual(m.cw + 1);
}

// Un bouton est "atteignable" s'il peut etre amene au-dessus de la barre de
// navigation basse fixe (mobile) et qu'il recoit bien le toucher a cet endroit.
async function expectNotHiddenByBottomNav(page, selector) {
  const res = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { error: 'introuvable' };
    const nav = document.querySelector('.site-bottom-nav');
    const navTop = nav && getComputedStyle(nav).display !== 'none' ? nav.getBoundingClientRect().top : window.innerHeight;
    el.scrollIntoView({ block: 'end' });
    let r = el.getBoundingClientRect();
    if (r.bottom > navTop) { window.scrollBy(0, r.bottom - navTop + 8); r = el.getBoundingClientRect(); }
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return { bottom: Math.round(r.bottom), navTop: Math.round(navTop), height: Math.round(r.height), width: Math.round(r.width), receives: !!hit && (hit === el || el.contains(hit)), hit: hit ? hit.outerHTML.slice(0, 120) : null };
  }, selector);
  expect(res.error, selector + ' ' + res.error).toBeUndefined();
  expect(res.bottom, selector + ' reste masque par la barre de navigation basse (bas ' + res.bottom + ' px, barre a ' + res.navTop + ' px)').toBeLessThanOrEqual(res.navTop + 1);
  expect(res.receives, selector + ' ne recoit pas le toucher (element au-dessus : ' + res.hit + ')').toBe(true);
  expect(Math.min(res.height, res.width), selector + ' trop petit pour etre touche (' + res.width + 'x' + res.height + ')').toBeGreaterThanOrEqual(36);
}

function pathOf(href, baseURL) {
  const u = new URL(href, baseURL || 'http://localhost');
  return u.pathname + u.search;
}

module.exports = { test, expect, expectNoHorizontalScroll, expectNotHiddenByBottomNav, pathOf, IS_PROD };
