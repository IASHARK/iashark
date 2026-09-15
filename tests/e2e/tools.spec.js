'use strict';
// Page Outils : aucune donnee premium sans Pro ; resultats reels pour un Pro simule.
const { test, expect, pathOf } = require('./helpers/fixtures');
const { VERSIONS } = require('./helpers/versions');
const { tr } = require('./helpers/site-data');

async function realTeamNames(siteData) {
  return siteData.matchs.filter((m) => m && m.is_free !== true).slice(0, 25).flatMap((m) => [m.home && m.home.n, m.away && m.away.n]).filter((n) => n && n.length > 3);
}

for (const v of VERSIONS) {
  test.describe(`outils /${v.dir}/`, () => {
    for (const persona of ['anonymous', 'free']) {
      test(`${persona === 'free' ? 'compte gratuit' : 'anonyme'} : demonstration uniquement, aucune donnee de match`, async ({ page, supa, siteData, dictFor, baseURL }) => {
        const dict = await dictFor(v.locale);
        if (persona === 'free') await supa.as('free');
        await page.goto(`/${v.dir}/pro.html`);
        const panel = page.locator('[data-panel="scanner"]');
        await expect(panel).toContainText(tr(dict, 'tools_page.scan_demo_text'));
        const cta = panel.locator(`a[href$="abonnement.html"]`).first();
        expect(pathOf(await cta.getAttribute('href'), baseURL)).toBe(`/${v.dir}/abonnement.html`);
        await page.waitForLoadState('networkidle').catch(() => {});
        expect(supa.callsTo('match-data'), 'match-data appele sans abonnement').toHaveLength(0);
        const text = await page.locator('main').innerText();
        for (const name of await realTeamNames(siteData)) expect(text, `nom d'equipe reel "${name}" affiche sans abonnement`).not.toContain(name);
        const state = await page.evaluate(() => window.__iasharkToolsState);
        expect(state).toBeNull();
      });
    }

    test('Pro simule : le scanner affiche les marches reels', async ({ page, supa, siteData, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('pro');
      // Attente creee AVANT la navigation : l'appel peut partir avant la fin de
      // page.goto() (scripts defer + pre-chargement), l'attente ne doit pas le rater.
      const pending = supa.waitForCall('match-data');
      await page.goto(`/${v.dir}/pro.html`);
      const call = await pending;
      expect(call.body).toEqual({ scope: 'list' });
      const rows = page.locator('#scanBox li');
      await expect(rows.first()).toBeVisible();
      await expect(page.locator('[data-panel="scanner"]')).not.toContainText(tr(dict, 'tools_page.scan_demo_text'));
      const first = await rows.first().innerText();
      const names = siteData.matchs.flatMap((m) => [m.home && m.home.n, m.away && m.away.n]).filter(Boolean);
      expect(names.some((n) => first.includes(n)), `ligne du scanner sans equipe reelle : ${first}`).toBe(true);
      await expect(rows.first().locator(`a[href^="/${v.dir}/match.html?id="]`)).toHaveCount(1);
    });
  });
}
