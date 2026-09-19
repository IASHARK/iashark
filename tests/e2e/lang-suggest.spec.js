'use strict';
// Suggestion de langue (lib/lang-suggest.js, chargee par i18n/i18n.js) : un
// visiteur dont le navigateur est en anglais (en-US) et qui arrive sur une
// page francaise se voit PROPOSER la page equivalente de /en/ dans un bandeau,
// jamais redirige. Couvre l'accueil /fr/ et une page match statique francaise
// (/match/<id>.html) apres regeneration (audit SEO du 19/09/2026).
//
// Playwright se declare robot (navigator.webdriver, user-agent HeadlessChrome) :
// le site ne montre jamais le bandeau a un robot. Les tests « visiteur » masquent
// ces deux signaux par un script d'initialisation ; le dernier test verifie que
// le robot, lui, ne voit rien.
const fs = require('fs');
const path = require('path');
const { test, expect, expectNotHiddenByBottomNav, pathOf, IS_PROD } = require('./helpers/fixtures');

const ROOT = path.resolve(__dirname, '..', '..');
const DIST = path.resolve(process.env.E2E_DIST || path.join(ROOT, 'dist'));
const HINT = '#iasharkLangHint';

test.use({ locale: 'en-US', timezoneId: 'America/New_York' });

async function asHumanVisitor(page) {
  await page.addInitScript(() => {
    const ua = navigator.userAgent.replace(/HeadlessChrome/g, 'Chrome');
    Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false, configurable: true });
    Object.defineProperty(Navigator.prototype, 'userAgent', { get: () => ua, configurable: true });
  });
}

// Page match francaise statique indexable dont la version /en/ existe (lien
// hreflang="en" de la page ET fichier present dans dist/).
function frMatchWithEnglish() {
  const dir = path.join(DIST, 'match');
  if (!fs.existsSync(dir)) return null;
  for (const f of fs.readdirSync(dir).filter((n) => /^\d+\.html$/.test(n)).sort()) {
    const html = fs.readFileSync(path.join(dir, f), 'utf8');
    const id = f.replace(/\.html$/, '');
    if (/<meta name="robots" content="[^"]*noindex/.test(html)) continue;
    if (!html.includes(`hreflang="en" href="https://iashark.com/en/match/${id}.html"`)) continue;
    if (fs.existsSync(path.join(DIST, 'en', 'match', f))) return id;
  }
  return null;
}

async function expectEnglishHint(page, baseURL, expectedPath) {
  const hint = page.locator(HINT);
  await expect(hint).toBeVisible();
  await expect(hint).toHaveAttribute('lang', 'en');
  await expect(hint).toHaveAttribute('role', 'region');
  await expect(hint.locator('.ias-lang-hint__text')).toHaveText('This page is also available in English.');
  const cta = hint.locator('a.ias-lang-hint__cta');
  await expect(cta).toHaveText('Switch to English');
  expect(pathOf(await cta.getAttribute('href'), baseURL)).toBe(expectedPath);
  await expectNotHiddenByBottomNav(page, HINT + ' a.ias-lang-hint__cta');
  return hint;
}

test.describe('suggestion de langue : visiteur anglophone sur la version francaise', () => {
  test('/fr/ : bandeau en anglais vers /en/, aucune redirection, fermeture retenue @mobile', async ({ page, baseURL, consoleErrors }) => {
    await asHumanVisitor(page);
    const res = await page.goto('/fr/');
    expect(res.status()).toBe(200);
    const hint = await expectEnglishHint(page, baseURL, '/en/');
    expect(new URL(page.url()).pathname, 'jamais de redirection automatique').toBe('/fr/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');

    await test.step('fermeture : bandeau retire et plus propose au rechargement', async () => {
      await hint.locator('.ias-lang-hint__close').click();
      await expect(page.locator(HINT)).toHaveCount(0);
      await page.reload();
      await page.waitForFunction(() => !!window.IasharkLangSuggest);
      const d = await page.evaluate(() => window.IasharkLangSuggest.run(window.I18N, window));
      expect(d).toMatchObject({ show: false, reason: 'dismissed' });
      await expect(page.locator(HINT)).toHaveCount(0);
    });
    expect(consoleErrors).toEqual([]);
  });

  test('page match statique francaise : bandeau vers la meme rencontre sur /en/ @mobile', async ({ page, baseURL, consoleErrors }) => {
    test.skip(IS_PROD, 'page choisie dans dist/ (suite locale)');
    const id = frMatchWithEnglish();
    expect(id, 'aucune page /match/<id>.html indexable avec son equivalent /en/ dans dist/').toBeTruthy();
    await asHumanVisitor(page);
    const res = await page.goto(`/match/${id}.html`);
    expect(res.status()).toBe(200);
    await expectEnglishHint(page, baseURL, `/en/match/${id}.html`);
    expect(new URL(page.url()).pathname).toBe(`/match/${id}.html`);
    const target = await page.request.get(`/en/match/${id}.html`);
    expect(target.status(), 'page /en/ proposee introuvable').toBe(200);
    expect(consoleErrors).toEqual([]);
  });

  test('version deja choisie (cookie nf_country) : aucun bandeau, script jamais charge', async ({ page, context, baseURL }) => {
    await asHumanVisitor(page);
    await context.addCookies([{ name: 'nf_country', value: 'FR', url: baseURL }]);
    await page.goto('/fr/');
    await page.waitForLoadState('load');
    await page.waitForTimeout(2500); // le pre-filtre s'execute 1,2 s apres le chargement
    expect(await page.evaluate(() => !!window.__iasharkLangHint || !!window.IasharkLangSuggest)).toBe(false);
    await expect(page.locator(HINT)).toHaveCount(0);
  });

  test('robot (navigator.webdriver) : aucun bandeau', async ({ page }) => {
    await page.goto('/fr/');
    await page.waitForLoadState('load');
    await page.waitForTimeout(2500);
    expect(await page.evaluate(() => !!window.__iasharkLangHint)).toBe(false);
    await expect(page.locator(HINT)).toHaveCount(0);
  });
});
