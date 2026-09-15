'use strict';
// Accueil : vitrine du match offert + liste des matchs (home-list.js, maquette v2
// validee le 15/09/2026). Anonyme pour les 9 versions ; comportements de la liste
// (lignes verrouillees, Pro, favoris, bande de dates, banniere, niveau de
// probabilite) sur fr / gb / mx.
const { test, expect, expectNoHorizontalScroll, pathOf } = require('./helpers/fixtures');
const { VERSIONS, ALL_DIRS } = require('./helpers/versions');
const { tr } = require('./helpers/site-data');

const FAV_KEY = 'iashark.favLeagues.v1';

// Ligne verrouillee : aucun chiffre, aucune jauge, aucun marche, aucune note.
async function expectLockedRowsClean(page) {
  const locked = page.locator('#homeList .hl-row.is-locked');
  const report = await locked.evaluateAll((els) => els.map((a) => ({
    html: a.outerHTML,
    zone: (a.querySelector('.hl-zone') || { innerText: '' }).innerText,
  })));
  for (const r of report) {
    expect(r.zone, 'chiffre dans la zone droite verrouillee').not.toMatch(/\d/);
    expect(r.html, 'donnee chiffree sur une ligne verrouillee').not.toMatch(/\/10|hl-gauge|hl-market|hl-prob\b|data-conf|NaN/);
  }
  return report.length;
}

for (const v of VERSIONS) {
  test.describe(`accueil /${v.dir}/`, () => {
    test(`anonyme : page, match offert, liste des matchs, langues, navigation, aide @mobile`, async ({ page, consoleErrors, baseURL, dictFor }) => {
      const dict = await dictFor(v.locale);
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

      await test.step('liste des matchs : titre traduit, lignes rendues, liens dans la version', async () => {
        await expect(page.locator('#homeList .hl-title')).toHaveText(tr(dict, 'home_list.title'));
        const rows = page.locator('#homeList a.hl-row');
        await expect(rows.first()).toBeVisible();
        const hrefs = await rows.evaluateAll((els) => els.map((a) => a.getAttribute('href')));
        for (const h of hrefs) expect(pathOf(h, baseURL), 'lien de ligne hors version').toMatch(new RegExp(`^/${v.dir}/match\\.html\\?id=\\d+$`));
        await expectLockedRowsClean(page);
        // conf et tout champ premium : absents des donnees chargees par la page (match non offert).
        const leaked = await page.evaluate(() => (window.allMatchs || []).filter((m) => m && m.is_free !== true && ('conf' in m || 'pari_rec' in m || 'model_probability' in m)).map((m) => m.id));
        expect(leaked, 'champ premium en memoire pour un visiteur').toEqual([]);
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
  });
}

for (const v of VERSIONS.filter((x) => ['fr', 'gb', 'mx'].includes(x.dir))) {
  test.describe(`liste des matchs /${v.dir}/`, () => {
    test('anonyme : lignes verrouillees sans chiffre, banniere, match offert dans sa competition', async ({ page, dictFor, baseURL }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/`);
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      const locked = await expectLockedRowsClean(page);
      test.skip(!locked, 'Aucune analyse payante le jour affiche');
      const row = page.locator('#homeList .hl-row.is-locked').first();
      await expect(row.locator('.hl-ready')).toHaveText(tr(dict, 'home_list.ready'));
      await expect(row.locator('.hl-lockpill')).toBeAttached();
      await expect(row).toHaveAttribute('data-track-kind', 'home_row_lock');
      expect(pathOf(await row.getAttribute('href'), baseURL), 'ligne verrouillee -> page match (mur Pro)').toMatch(new RegExp(`^/${v.dir}/match\\.html\\?id=\\d+$`));
      const banner = page.locator('#homeList .hl-banner');
      await expect(banner).toBeVisible();
      await expect(banner.locator('a.hl-banner-cta')).toHaveAttribute('href', new RegExp(`^/${v.dir}/abonnement\\.html$`));
      await expect(banner.locator('a.hl-banner-cta')).toHaveAttribute('data-track-kind', 'home_banner_ready');
      // Rappel Pro : un seul, sans prix.
      const upsell = page.locator('#homeList .hl-upsell');
      expect(await upsell.count()).toBeLessThanOrEqual(1);
      if (await upsell.count()) expect(await upsell.innerText()).not.toMatch(/[€£$]|MX\$|\bR\s?\d/);
      // Match offert du jour : dans sa competition, puce « Offert », analyse ouverte.
      const freeId = await page.evaluate(() => window.freeMatchId);
      const freeRow = page.locator(`#homeList a.hl-row[href$="match.html?id=${freeId}"]`);
      if (await freeRow.count()) {
        await expect(freeRow.first()).toHaveClass(/is-free/);
        await expect(freeRow.first().locator('.hl-tag-free')).toHaveText(tr(dict, 'home_list.free_chip'));
      }
    });

    test('bande de dates : changer de jour met a jour la liste et l\'onglet actif', async ({ page }) => {
      await page.goto(`/${v.dir}/`);
      const days = page.locator('#homeList .hl-day');
      await expect(days.first()).toBeVisible();
      expect(await days.count()).toBeGreaterThanOrEqual(2);
      const active = page.locator('#homeList .hl-day[aria-selected="true"]');
      await expect(active).toHaveCount(1);
      const before = await active.getAttribute('data-hl-day');
      const target = page.locator('#homeList .hl-day[aria-selected="false"]:not(.is-empty)').first();
      test.skip(!(await target.count()), 'Un seul jour avec des matchs');
      const day = await target.getAttribute('data-hl-day');
      await target.click();
      await expect(page.locator(`#homeList .hl-day[data-hl-day="${day}"]`)).toHaveAttribute('aria-selected', 'true');
      expect(day).not.toBe(before);
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      const ids = await page.locator('#homeList a.hl-row').evaluateAll((els) => els.map((a) => (a.getAttribute('href').match(/id=(\d+)/) || [])[1]));
      const dayOf = await page.evaluate((list) => list.map((id) => { const m = window.allMatchs.find((x) => String(x.id) === id); return m ? window.IasharkMatchTime.matchDay(m) : null; }), ids);
      for (const d of dayOf) expect(d).toBe(day);
    });

    test('niveau de probabilite public (prob_band) : pastille sur la ligne verrouillee, aucun chiffre', async ({ page, siteData, dictFor }) => {
      const dict = await dictFor(v.locale);
      // Fixture de test : prob_band ajoute a la liste publique (le pipeline le calcule cote serveur).
      const bands = ['high', 'good', 'moderate'];
      let n = 0;
      const home = Object.assign({}, siteData.home, { matchs: siteData.home.matchs.map((m) => (m && m.is_free !== true && m.has_signal && !m.no_signal ? Object.assign({}, m, { prob_band: bands[n++ % 3] }) : m)) });
      test.skip(!n, 'Aucune analyse payante dans les donnees');
      await page.route(/\/data-home\.json(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(home) }));
      await page.goto(`/${v.dir}/`);
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      const pills = page.locator('#homeList .hl-row.is-locked .hl-band');
      test.skip(!(await pills.count()), 'Aucune ligne verrouillee le jour affiche');
      const seen = await pills.evaluateAll((els) => els.map((e) => ({ cls: e.className, on: e.querySelectorAll('.hl-bars i.on').length, text: e.innerText, title: e.getAttribute('title') })));
      const LEVEL = { high: 3, good: 2, moderate: 1 };
      for (const p of seen) {
        const band = (p.cls.match(/is-(high|good|moderate)/) || [])[1];
        expect(band).toBeTruthy();
        expect(p.on).toBe(LEVEL[band]);
        expect(p.text).not.toMatch(/\d/);
        expect(p.title).toBe(tr(dict, 'home_list.band_note'));
      }
      await expectLockedRowsClean(page);
      await expect(page.locator('#homeList .hl-band-note')).toContainText(tr(dict, 'home_list.band_note'));
    });

    test('Pro simule : probabilite /10 visible, banniere masquee, aucun cadenas', async ({ page, supa }) => {
      await supa.as('pro');
      // Attente creee AVANT la navigation : l'appel part des DOMContentLoaded
      // (scripts defer), souvent avant la fin de page.goto().
      const call = supa.waitForCall('match-data');
      await page.goto(`/${v.dir}/`);
      expect((await call).body).toEqual({ scope: 'list' });
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      await expect(page.locator('#homeList .hl-row.is-open .hl-prob').first()).toContainText('/10');
      await expect(page.locator('#homeList .hl-banner')).toHaveCount(0);
      await expect(page.locator('#homeList .hl-lockpill')).toHaveCount(0);
      await expect(page.locator('#homeList .hl-summary')).toBeVisible();
    });

    test('compte gratuit : aucun chiffre avant confirmation Pro (match-data isPro=false)', async ({ page, supa }) => {
      await supa.as('free');
      // Attente creee AVANT la navigation : l'appel part des DOMContentLoaded
      // (scripts defer), souvent avant la fin de page.goto().
      const call = supa.waitForCall('match-data');
      await page.goto(`/${v.dir}/`);
      expect((await call).body).toEqual({ scope: 'list' });
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      await expectLockedRowsClean(page);
      await expect(page.locator('#homeList .hl-row.is-open:not(.is-free)')).toHaveCount(0);
    });

    test('favoris : visiteur (localStorage) puis compte (user_metadata), persistants', async ({ page, supa }) => {
      await page.goto(`/${v.dir}/`);
      const star = page.locator('#homeList .hl-block').nth(1).locator('.hl-star').first();
      await expect(star).toBeVisible();
      const key = await star.getAttribute('data-hl-fav');
      await expect(star).toHaveAttribute('data-track-kind', 'home_fav_add');
      await star.click();
      const favBlock = page.locator('#homeList .hl-block').first();
      await expect(favBlock.locator(`.hl-league[data-league="${key}"]`)).toBeVisible();
      await expect(favBlock.locator(`.hl-star[data-hl-fav="${key}"]`)).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), FAV_KEY)).toEqual([key]);
      await page.reload();
      await expect(page.locator('#homeList .hl-block').first().locator(`.hl-league[data-league="${key}"]`)).toBeVisible();

      // Connexion : le favori local est fusionne dans user_metadata.fav_leagues...
      await supa.as('free');
      await page.goto(`/${v.dir}/`);
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      await expect.poll(() => supa.calls.filter((c) => c.kind === 'auth' && c.method === 'PUT' && c.path === '/auth/v1/user').map((c) => c.body.data.fav_leagues).pop()).toEqual([key]);
      // ... et reste la sur un navigateur sans liste locale.
      await page.evaluate((k) => localStorage.removeItem(k), FAV_KEY);
      await page.reload();
      await expect(page.locator('#homeList .hl-block').first().locator(`.hl-league[data-league="${key}"]`)).toBeVisible();
    });
  });
}
