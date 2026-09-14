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
