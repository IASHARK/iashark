'use strict';
// Retours Stripe : checkout-succes (session simulee ou absente), checkout-annule.
const { test, expect, pathOf } = require('./helpers/fixtures');
const { VERSIONS } = require('./helpers/versions');
const { tr } = require('./helpers/site-data');

for (const v of VERSIONS) {
  test.describe(`retour paiement /${v.dir}/`, () => {
    test('succes avec session Pro simulee : acces active', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('pro');
      await page.goto(`/${v.dir}/checkout-succes.html?session_id=cs_test_e2e`);
      await expect(page.locator('#statusTxt')).toHaveText(tr(dict, 'checkout_pages.success_active'));
      const sync = supa.callsTo('sync-subscription');
      expect(sync.length).toBeGreaterThan(0);
      expect(sync[0].body).toEqual({ session_id: 'cs_test_e2e' });
    });

    test('succes sans session : invitation a se connecter', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/checkout-succes.html`);
      await expect(page.locator('#statusTxt')).toHaveText(tr(dict, 'checkout_pages.success_login_needed'));
      expect(supa.callsTo('sync-subscription')).toHaveLength(0);
    });

    // Acces confirme + match d'origine memorise : bouton vers le match et retour
    // automatique dessus (l'acheteur voulait lire cette analyse, pas son compte).
    test('succes venu d\'un match : bouton vers le match puis retour automatique', async ({ page, supa, siteData, dictFor }) => {
      test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
      const dict = await dictFor(v.locale);
      const matchPath = `/${v.dir}/match.html?id=${siteData.paid.id}`;
      await supa.as('pro');
      await page.goto(`/${v.dir}/checkout-annule.html`);
      await page.evaluate((p) => sessionStorage.setItem('iashark.checkout.return', JSON.stringify({ path: p, id: null, label: 'E2E Home – E2E Away' })), matchPath);
      await page.goto(`/${v.dir}/checkout-succes.html?session_id=cs_test_e2e`);
      await expect(page.locator('#ctaMatch')).toBeVisible();
      expect(await page.locator('#ctaMatch').getAttribute('href')).toBe(matchPath);
      await expect(page.locator('#statusTxt')).toContainText(tr(dict, 'checkout_pages.success_active'));
      await expect(page.locator('#statusTxt')).toContainText('E2E Home – E2E Away');
      await page.waitForURL((u) => u.pathname + u.search === matchPath, { timeout: 10000 });
      expect(await page.evaluate(() => sessionStorage.getItem('iashark.checkout.return')), 'contexte consomme').toBeNull();
    });

    // Sans match d'origine : aucun bouton vers un match, aucune redirection.
    test('succes sans match d\'origine : compte seul, pas de redirection', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('pro');
      await page.goto(`/${v.dir}/checkout-succes.html?session_id=cs_test_e2e`);
      await expect(page.locator('#statusTxt')).toHaveText(tr(dict, 'checkout_pages.success_active'));
      await expect(page.locator('#ctaMatch')).toBeHidden();
      await page.waitForTimeout(3500);
      expect(new URL(page.url()).pathname).toBe(`/${v.dir}/checkout-succes.html`);
    });

    test('annulation : message et liens dans la version', async ({ page, dictFor, baseURL }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/checkout-annule.html`);
      await expect(page.getByText(tr(dict, 'checkout_pages.cancel_heading'), { exact: true })).toBeVisible();
      const hrefs = await page.locator('a[data-href]').evaluateAll((els) => els.map((a) => a.getAttribute('href')));
      expect(hrefs.length).toBeGreaterThan(0);
      for (const h of hrefs) expect(pathOf(h, baseURL)).toMatch(new RegExp(`^/${v.dir}/`));
    });
  });
}
