'use strict';
// Connexion, inscription, reinitialisation du mot de passe.
const { test, expect } = require('./helpers/fixtures');
const { VERSIONS } = require('./helpers/versions');
const { tr } = require('./helpers/site-data');

for (const v of VERSIONS) {
  test.describe(`authentification /${v.dir}/`, () => {
    test('connexion et inscription : messages de validation traduits @mobile', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/connexion.html`);
      await expect(page.locator('html')).toHaveAttribute('lang', v.htmlLang);
      await page.waitForFunction(() => !!(window.I18N && window.I18N.dict));
      await page.locator('#submit').click();
      await expect(page.locator('#emailErr')).toHaveText(tr(dict, 'auth.err_enter_valid_email'));
      await expect(page.locator('#passwordErr')).toHaveText(tr(dict, 'auth.err_enter_password'));

      await page.goto(`/${v.dir}/inscription.html`);
      await page.waitForFunction(() => !!(window.I18N && window.I18N.dict));
      await page.locator('#email').fill('pas-une-adresse');
      await page.locator('#password').fill('court');
      await page.locator('#password2').fill('different');
      await page.locator('#submit').click();
      await expect(page.locator('#emailErr')).toHaveText(tr(dict, 'auth.err_enter_valid_email'));
      await expect(page.locator('#passwordErr')).toHaveText(tr(dict, 'auth.password_hint_min_chars'));
      await expect(page.locator('#password2Err')).toHaveText(tr(dict, 'auth.err_passwords_mismatch'));
      expect(supa.calls.filter((c) => c.path === '/auth/v1/signup'), 'aucune inscription ne doit partir').toHaveLength(0);
    });

    test('connexion simulee : identifiants refuses puis succes vers le compte de la version', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/connexion.html`);
      await page.waitForFunction(() => !!(window.I18N && window.I18N.dict));
      await page.locator('#email').fill('e2e.free@example.test');
      await page.locator('#password').fill('mauvais-mot-de-passe');
      await page.locator('#submit').click();
      await expect(page.locator('#formMsg')).toHaveText(tr(dict, 'auth.err_invalid_credentials'));

      supa.loginSucceedsAs('free');
      await page.locator('#password').fill('mot-de-passe-e2e');
      const call = supa.waitForCall('login-guard');
      await page.locator('#submit').click();
      expect((await call).body).toEqual({ email: 'e2e.free@example.test', password: 'mot-de-passe-e2e' });
      await page.waitForURL(new RegExp(`/${v.dir}/compte\\.html$`));
      await expect(page.locator('#compte')).toContainText('e2e.free@example.test');
    });

    test('reinitialisation sans jeton : etat lien invalide', async ({ page }) => {
      await page.goto(`/${v.dir}/reinitialiser-mot-de-passe.html`);
      await expect(page.locator('#lienInvalide')).toBeVisible({ timeout: 8000 });
      await expect(page.locator('#formulaire')).toBeHidden();
      await expect(page.locator('#chargement')).toBeHidden();
      await expect(page.locator('#lienInvalide a')).toHaveAttribute('href', `/${v.dir}/mot-de-passe-oublie.html`);
    });
  });
}
