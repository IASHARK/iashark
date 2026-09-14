'use strict';
// Accueil anonyme, pour chacune des 9 versions.
const { test, expect, expectNoHorizontalScroll, pathOf } = require('./helpers/fixtures');
const { VERSIONS, ALL_DIRS } = require('./helpers/versions');

for (const v of VERSIONS) {
  test.describe(`accueil /${v.dir}/`, () => {
    test(`anonyme : page, match offert, cartes, langues, navigation, aide @mobile`, async ({ page, consoleErrors, baseURL }) => {
      const res = await page.goto(`/${v.dir}/`);
      expect(res.status()).toBe(200);

      await test.step('<html lang> de la version', async () => {
        await expect(page.locator('html')).toHaveAttribute('lang', v.htmlLang);
      });

      await test.step('match offert : vitrine presente, lien dans la version', async () => {
        const hero = page.locator('#heroFeature a.feature-card');
        await expect(hero).toBeVisible();
        expect(pathOf(await hero.getAttribute('href'), baseURL)).toMatch(new RegExp(`^/${v.dir}/match\\.html\\?id=\\d+$`));
        const cta = page.locator('a.hero-cta').first();
        await expect(cta).toHaveAttribute('href', new RegExp(`^/${v.dir}/match\\.html\\?id=\\d+$`));
      });

      await test.step('cartes de match rendues, liens dans la version', async () => {
        const today = Number(await page.locator('#countToday').textContent()) || 0;
        const tomorrow = Number(await page.locator('#countTomorrow').textContent()) || 0;
        test.skip(today + tomorrow <= 1, 'Aucun autre match aujourd\'hui ni demain dans les donnees en ligne');
        const cards = page.locator('#cardsList a.mc');
        await expect(cards.first()).toBeVisible();
        const hrefs = await cards.evaluateAll((els) => els.map((a) => a.getAttribute('href')));
        expect(hrefs.length).toBeGreaterThan(0);
        for (const h of hrefs) expect(pathOf(h, baseURL), 'lien de carte hors version').toMatch(new RegExp(`^/${v.dir}/`));
      });

      await test.step('ressource d\'aide au jeu du marche', async () => {
        const link = page.locator('a[data-market-helpline="url"]').first();
        await expect(link).toHaveAttribute('href', new RegExp(v.helpline.replace(/\./g, '\\.')));
      });

      await test.step('selecteur de langue : 9 versions', async () => {
        const btn = page.locator('#langSwitchBtn');
        await expect(btn).toBeAttached();
        const items = page.locator('#langSwitchMenu .lang-switch-item');
        await expect(items).toHaveCount(9);
        const dirs = await items.evaluateAll((els) => els.map((a) => a.getAttribute('data-dir')));
        expect([...dirs].sort()).toEqual([...ALL_DIRS].sort());
        const active = await page.locator('#langSwitchMenu .lang-switch-item.active').getAttribute('data-dir');
        expect(active).toBe(v.dir);
        if (await btn.isVisible()) {
          await btn.click();
          await expect(page.locator('#langSwitchMenu')).toHaveClass(/open/);
          await expect(items.first()).toBeVisible();
          await page.keyboard.press('Escape');
          await page.mouse.click(5, 300);
        }
      });

      await test.step('navigation basse : liens dans la version', async () => {
        const links = page.locator('nav.site-bottom-nav a');
        await expect(links).toHaveCount(4);
        await page.waitForFunction(() => !!(window.I18N && window.I18N.dict));
        const hrefs = (await links.evaluateAll((els) => els.map((a) => a.getAttribute('href')))).map((h) => pathOf(h, baseURL));
        expect(hrefs).toEqual([`/${v.dir}/`, `/${v.dir}/pro.html`, v.blogHub, `/${v.dir}/compte.html`]);
      });

      await test.step('pas de defilement horizontal', async () => {
        await expectNoHorizontalScroll(page);
      });

      await test.step('aucune erreur console', async () => {
        await page.waitForLoadState('networkidle').catch(() => {});
        expect(consoleErrors).toEqual([]);
      });
    });

    test(`filtre de championnat`, async ({ page }) => {
      await page.goto(`/${v.dir}/`);
      const cards = page.locator('#cardsList a.mc');
      // Onglet qui contient le plus de cartes (le filtre porte sur la liste affichee).
      const today = Number(await page.locator('#countToday').textContent()) || 0;
      const tomorrow = Number(await page.locator('#countTomorrow').textContent()) || 0;
      if (tomorrow > today) await page.locator('#tabTomorrow').click();
      test.skip(Math.max(today, tomorrow) <= 1, 'Pas assez de matchs pour filtrer');
      await expect(cards.first()).toBeVisible();
      const before = await cards.count();
      const firstLeague = (await cards.first().locator('.mc-league').innerText()).split('·')[0].trim();

      await page.locator('#champDropdownBtn').click();
      const panel = page.locator('#champDropdownPanel');
      await expect(panel).toBeVisible();
      const items = panel.locator('.champ-item');
      expect(await items.count(), 'la liste des championnats est vide').toBeGreaterThan(1);
      const names = await items.evaluateAll((els) => els.map((e) => e.textContent.replace(/^\S+\s+/, '').trim()));
      const index = names.findIndex((n, i) => i > 0 && firstLeague.includes(n.toUpperCase()));
      expect(index, `championnat "${firstLeague}" absent de la liste ${JSON.stringify(names)}`).toBeGreaterThan(0);
      await items.nth(index).click();

      await expect(panel).toBeHidden();
      await expect(page.locator('#champDropdownLabel')).toContainText(names[index].toUpperCase());
      const after = await cards.evaluateAll((els) => els.map((a) => a.querySelector('.mc-league').textContent));
      expect(after.length).toBeGreaterThan(0);
      expect(after.length).toBeLessThanOrEqual(before);
      for (const t of after) expect(t.toUpperCase()).toContain(names[index].toUpperCase());

      // Retour a tous les championnats.
      await page.locator('#champDropdownBtn').click();
      await items.first().click();
      await expect(cards).toHaveCount(before);
    });
  });
}
