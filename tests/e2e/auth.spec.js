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

// Trajet reel observe sur le tableau de bord le 18/09/2026 : les trois
// inscrits du jour ont clique « Débloquer » sur un match, sont passes par
// Mon compte -> Connexion -> Inscription... et ont atterri sur « Mon compte »
// sans leur match, qu'ils ont du retrouver a la main depuis l'accueil. Trois
// fuites : compte.html renvoyait next=compte.html (lui-meme), le lien
// « Pas encore de compte ? » perdait le ?next=, et l'inscription redirigeait
// en dur vers compte.html. Ce test suit le visiteur de bout en bout.
for (const v of VERSIONS.filter((x) => ['fr', 'gb'].includes(x.dir))) {
  test.describe(`inscription depuis un match /${v.dir}/`, () => {
    test('Débloquer -> connexion -> inscription -> retour sur le match (next conserve de bout en bout)', async ({ page, supa }) => {
      // 1. Le visiteur ouvre le match offert depuis l'accueil.
      await page.goto(`/${v.dir}/`);
      const carte = page.locator('.feature-card');
      await expect(carte).toBeVisible();
      await carte.click();
      await page.waitForURL(new RegExp(`/${v.dir}/match\\.html\\?id=\\d+`));
      const matchUrl = new URL(page.url());
      const matchPath = matchUrl.pathname + matchUrl.search;
      // 2. Il clique « Débloquer » (mur compte gratuit) -> compte.html -> connexion avec next = LE MATCH.
      const debloquer = page.locator('main a[href*="compte.html"]').first();
      await expect(debloquer).toBeVisible();
      await debloquer.click();
      await page.waitForURL(new RegExp(`/${v.dir}/connexion\\.html\\?next=`));
      expect(new URL(page.url()).searchParams.get('next'), 'next doit etre le match, pas compte.html').toBe(matchPath);
      // 3. « Pas encore de compte ? » garde le next.
      await page.waitForFunction(() => !!(window.I18N && window.I18N.dict));
      const lienInscription = page.locator('a[href*="inscription.html"]').first();
      expect(await lienInscription.getAttribute('href')).toContain('next=');
      await lienInscription.click();
      await page.waitForURL(new RegExp(`/${v.dir}/inscription\\.html\\?next=`));
      expect(new URL(page.url()).searchParams.get('next')).toBe(matchPath);
      // 4. Inscription simulee -> retour direct sur le match.
      await page.waitForFunction(() => !!(window.I18N && window.I18N.dict));
      supa.signupSucceedsAs('free');
      await page.locator('#email').fill('nouveau.e2e@example.test');
      await page.locator('#password').fill('mot-de-passe-e2e');
      await page.locator('#password2').fill('mot-de-passe-e2e');
      await page.locator('#submit').click();
      await page.waitForURL((u) => u.pathname + u.search === matchPath, { timeout: 15000 });
      // 5. Et il est bien connecte sur cette page.
      await expect(page.locator('#authHeaderSlot')).toContainText('e2e.free', { timeout: 15000 });
    });

    test('inscription directe (sans next) : accueil du compte avec le message de bienvenue', async ({ page, supa }) => {
      await page.goto(`/${v.dir}/inscription.html`);
      await page.waitForFunction(() => !!(window.I18N && window.I18N.dict));
      supa.signupSucceedsAs('free');
      await page.locator('#email').fill('nouveau.e2e@example.test');
      await page.locator('#password').fill('mot-de-passe-e2e');
      await page.locator('#password2').fill('mot-de-passe-e2e');
      await page.locator('#submit').click();
      await page.waitForURL(new RegExp(`/${v.dir}/compte\\.html\\?bienvenue=1`));
    });
  });
}
