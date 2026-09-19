'use strict';
// Accueil : vitrine du match offert + liste des matchs (home-list.js, maquette v2
// validee le 15/09/2026). Anonyme pour les 9 versions ; comportements de la liste
// (lignes verrouillees, Pro, favoris competitions et matchs, jours, niveau de
// probabilite) sur fr / gb / mx.
const { test, expect, expectNoHorizontalScroll, pathOf } = require('./helpers/fixtures');
const { VERSIONS, ALL_DIRS } = require('./helpers/versions');
const { tr } = require('./helpers/site-data');

const FAV_KEY = 'iashark.favLeagues.v1';
const FAV_MATCHES_KEY = 'iashark.favMatches.v1';

// Ligne verrouillee : aucun chiffre, aucune jauge, aucun marche, aucune note.
async function expectLockedRowsClean(page) {
  const locked = page.locator('#homeList .hl-row.is-locked');
  const report = await locked.evaluateAll((els) => els.map((a) => ({
    html: a.outerHTML,
    zone: (a.querySelector('.hl-zone') || { innerText: '' }).innerText,
  })));
  for (const r of report) {
    expect(r.zone, 'chiffre dans la zone droite verrouillee').not.toMatch(/\d/);
    // « /10 » = une note sur 10 (« 6,4/10 »), jamais un morceau d'URL : le logo
    // d'une equipe dont l'identifiant commence par 10 (teams/1065.png) n'est
    // pas une donnee chiffree (faux positif du 19/09/2026).
    expect(r.html, 'donnee chiffree sur une ligne verrouillee').not.toMatch(/\d\s*\/\s*10(?!\d)|hl-gauge|hl-market|hl-prob\b|data-conf|NaN/);
  }
  return report.length;
}

// Lien d'une carte de match (audit SEO du 19/09/2026) : page statique indexable de
// la version quand elle existe (/<dir>/match/<id>.html ; version fr = /match/<id>.html),
// sinon le shell de la version match.html?id=. Jamais une autre version.
const matchLinkRe = (dir) => new RegExp(`^(/${dir}/match/\\d+\\.html|/${dir}/match\\.html\\?id=\\d+${dir === 'fr' ? '|/match/\\d+\\.html' : ''})$`);
const idOfMatchHref = (h) => (String(h).match(/(?:[?&]id=|\/match\/)(\d+)/) || [])[1];

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
        expect(pathOf(await hero.getAttribute('href'), baseURL)).toMatch(matchLinkRe(v.dir));
        const cta = page.locator('a.hero-cta').first();
        await expect(cta).toHaveAttribute('href', matchLinkRe(v.dir));
      });

      await test.step('liste des matchs : titre traduit, lignes rendues, liens dans la version', async () => {
        await expect(page.locator('#homeList .hl-title')).toHaveText(tr(dict, 'home_list.title'));
        const rows = page.locator('#homeList a.hl-row');
        await expect(rows.first()).toBeVisible();
        const hrefs = await rows.evaluateAll((els) => els.map((a) => a.getAttribute('href')));
        for (const h of hrefs) expect(pathOf(h, baseURL), 'lien de ligne hors version').toMatch(matchLinkRe(v.dir));
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
    test('anonyme : lignes verrouillees sans chiffre, accueil simplifie, match offert dans sa competition', async ({ page, dictFor, baseURL }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/`);
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      const locked = await expectLockedRowsClean(page);
      test.skip(!locked, 'Aucune analyse payante le jour affiche');
      const row = page.locator('#homeList .hl-row.is-locked').first();
      // Le badge « Analyse prête » a ete retire de la ligne verrouillee le
      // 16/09/2026 : il doublait le cadenas affiche juste a cote. L'etat reste
      // annonce au lecteur d'ecran par l'aria-label de la ligne.
      await expect(row.locator('.hl-ready')).toHaveCount(0);
      await expect(row.locator('.hl-lockpill')).toBeAttached();
      expect(await row.getAttribute('aria-label'), 'etat verrouille annonce au lecteur d\'ecran').toContain(tr(dict, 'home_list.aria_locked'));
      await expect(row).toHaveAttribute('data-track-kind', 'home_row_lock');
      // Page statique indexable de la version si elle existe, sinon le shell
      // match.html?id= (audit SEO du 19/09/2026) ; mur Pro verifie en fin de test.
      const lockedHref = pathOf(await row.getAttribute('href'), baseURL);
      expect(lockedHref, 'ligne verrouillee -> page match (mur Pro)').toMatch(matchLinkRe(v.dir));
      // Accueil simplifie : ni banniere « X analyses pretes », ni recherche, ni filtres, ni bloc favoris separe.
      await expect(page.locator('#homeList .hl-banner, #homeList .hl-search, #homeList .hl-chips, #homeList .hl-block')).toHaveCount(0);
      // Etoile sur chaque competition et sur chaque match.
      expect(await page.locator('#homeList .hl-leagues .hl-star').count()).toBe(await page.locator('#homeList .hl-leagues .hl-league').count());
      expect(await page.locator('#homeList .hl-leagues .hl-mstar').count()).toBe(await page.locator('#homeList .hl-leagues a.hl-row').count());
      // Rappel Pro : un seul, sans prix.
      const upsell = page.locator('#homeList .hl-upsell');
      expect(await upsell.count()).toBeLessThanOrEqual(1);
      if (await upsell.count()) expect(await upsell.innerText()).not.toMatch(/[€£$]|MX\$|\bR\s?\d/);
      // Match offert du jour : dans sa competition, puce « Offert ». Sans compte (regle
      // de la page match) : « Analyse offerte · Compte gratuit », ni pari ni note, et
      // la vitrine invite a creer un compte gratuit.
      const freeId = await page.evaluate(() => window.freeMatchId);
      const freeRow = page.locator(`#homeList a.hl-row[href$="match.html?id=${freeId}"], #homeList a.hl-row[href$="/match/${freeId}.html"]`);
      if (await freeRow.count()) {
        await expect(freeRow.first()).toHaveClass(/is-free/);
        await expect(freeRow.first()).toHaveClass(/is-gated/);
        await expect(freeRow.first().locator('.hl-tag-free')).toHaveText(tr(dict, 'home_list.free_chip'));
        await expect(freeRow.first().locator('.hl-freepill')).toHaveText(tr(dict, 'home_list.free_gated_cta'));
        expect(await freeRow.first().locator('.hl-zone').innerText()).not.toMatch(/\d/);
      }
      if (freeId) {
        await expect(page.locator('#heroFeature .feature-gate .signal-gate')).toHaveText(tr(dict, 'home_app.free_gate_text'));
        await expect(page.locator('#heroFeature .signal-stat')).toHaveCount(0);
      }
      // La page ouverte par la ligne verrouillee (statique ou shell) montre le mur
      // Pro au visiteur, sans aucun element de l'analyse payante.
      await page.goto(lockedHref);
      await expect(page.locator('#matchRoot .gate.mgate')).toBeVisible();
      await expect(page.locator('#matchRoot .gate.mgate h2')).toHaveText(tr(dict, 'match_page.pro_gate_title'));
      await expect(page.locator(['.duo', '.pr-row', '.sig-market', '.scenario-chart', '.score-bars', '.threat', '.pm-list'].map((x) => '#matchRoot ' + x).join(', '))).toHaveCount(0);
    });

    test('jours : Aujourd\'hui / Demain / Apres-demain, changer de jour met a jour la liste @mobile', async ({ page, dictFor }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/`);
      const days = page.locator('#homeList .hl-day');
      await expect(days.first()).toBeVisible();
      await expect(days).toHaveCount(3);
      expect(await days.locator('.hl-day-name').allInnerTexts()).toEqual([tr(dict, 'home_list.day_today'), tr(dict, 'home_list.day_tomorrow'), tr(dict, 'home_list.day_after')]);
      // Jour sans match : onglet desactive « aucun match ».
      for (const empty of await page.locator('#homeList .hl-day.is-empty').all()) {
        await expect(empty).toBeDisabled();
        await expect(empty.locator('.hl-day-sub')).toHaveText(tr(dict, 'home_list.day_none'));
      }
      const active = page.locator('#homeList .hl-day[aria-selected="true"]');
      await expect(active).toHaveCount(1);
      const before = await active.getAttribute('data-hl-day');
      const target = page.locator('#homeList .hl-day[aria-selected="false"]:not([disabled])').first();
      test.skip(!(await target.count()), 'Un seul jour avec des matchs');
      const day = await target.getAttribute('data-hl-day');
      await target.click();
      await expect(page.locator(`#homeList .hl-day[data-hl-day="${day}"]`)).toHaveAttribute('aria-selected', 'true');
      expect(day).not.toBe(before);
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      const ids = await page.locator('#homeList a.hl-row').evaluateAll((els) => els.map((a) => (a.getAttribute('href').match(/(?:[?&]id=|\/match\/)(\d+)/) || [])[1]));
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

    test('Pro simule : probabilite /10 visible, aucun cadenas ni rappel Pro', async ({ page, supa }) => {
      await supa.as('pro');
      // Attente creee AVANT la navigation : l'appel part des DOMContentLoaded
      // (scripts defer), souvent avant la fin de page.goto().
      const call = supa.waitForCall('match-data');
      await page.goto(`/${v.dir}/`);
      expect((await call).body).toEqual({ scope: 'list' });
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      await expect(page.locator('#homeList .hl-row.is-open .hl-prob').first()).toContainText('/10');
      await expect(page.locator('#homeList .hl-lockpill')).toHaveCount(0);
      await expect(page.locator('#homeList .hl-upsell')).toHaveCount(0);
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
      // Compte gratuit : le match offert s'ouvre (plus de « Compte gratuit »), vitrine sans invitation.
      await expect(page.locator('#homeList .hl-row.is-gated')).toHaveCount(0);
      await expect(page.locator('#heroFeature .feature-gate')).toHaveCount(0);
    });

    test('favoris : competition en tete de la liste, visiteur (localStorage) puis compte (user_metadata), persistants', async ({ page, supa }) => {
      await page.goto(`/${v.dir}/`);
      const leagues = page.locator('#homeList .hl-leagues .hl-league');
      await expect(leagues.first()).toBeVisible();
      const star = leagues.last().locator('.hl-star');
      const key = await star.getAttribute('data-hl-fav');
      await expect(star).toHaveAttribute('data-track-kind', 'home_fav_add');
      await star.click();
      // Meme liste, competition favorite en premier (pas de bloc separe).
      await expect(leagues.first()).toHaveAttribute('data-league', key);
      await expect(leagues.first().locator('.hl-star')).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), FAV_KEY)).toEqual([key]);
      await page.reload();
      await expect(page.locator('#homeList .hl-leagues .hl-league').first()).toHaveAttribute('data-league', key);

      // Connexion : le favori local est fusionne dans user_metadata.fav_leagues...
      await supa.as('free');
      await page.goto(`/${v.dir}/`);
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      await expect.poll(() => supa.calls.filter((c) => c.kind === 'auth' && c.method === 'PUT' && c.path === '/auth/v1/user' && c.body.data.fav_leagues).map((c) => c.body.data.fav_leagues).pop()).toEqual([key]);
      // ... et reste la sur un navigateur sans liste locale.
      await page.evaluate((k) => localStorage.removeItem(k), FAV_KEY);
      await page.reload();
      await expect(page.locator('#homeList .hl-leagues .hl-league').first()).toHaveAttribute('data-league', key);
    });

    test('matchs favoris : etoile sur le match, « Mes matchs » en haut, en tete de sa competition, compte (user_metadata.fav_matches) @mobile', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/`);
      const leagues = page.locator('#homeList .hl-leagues .hl-league');
      await expect(leagues.first()).toBeVisible();
      await expect(page.locator('#homeList .hl-mine')).toHaveCount(0);
      // Un match A VENIR (un favori termine est nettoye au rechargement, par conception) :
      // premier jour qui en a, dans l'ordre des onglets.
      const upcoming = '.hl-item:has(a.hl-row:not(.cd-finished):not(.cd-live):not(.cd-postponed))';
      for (const tab of await page.locator('#homeList .hl-day:not([disabled])').all()) {
        if (await page.locator('#homeList .hl-leagues ' + upcoming).count()) break;
        await tab.click();
      }
      test.skip(!(await page.locator('#homeList .hl-leagues ' + upcoming).count()), 'Aucun match a venir dans les donnees');
      const scope = leagues.filter({ has: page.locator(upcoming) }).first();
      const item = scope.locator(upcoming).last();
      const mstar = item.locator('.hl-mstar');
      const id = await mstar.getAttribute('data-hl-mfav');
      await expect(mstar).toHaveAttribute('aria-pressed', 'false');
      await mstar.click();
      const mine = page.locator('#homeList .hl-mine');
      await expect(mine).toBeVisible();
      await expect(mine.locator('.hl-block-title')).toContainText(tr(dict, 'home_list.mine_title'));
      await expect(mine.locator('a.hl-row')).toHaveCount(1);
      await expect(mine.locator(`.hl-mstar[data-hl-mfav="${id}"]`)).toHaveAttribute('aria-pressed', 'true');
      // En tete de sa competition.
      const leagueKey = await scope.getAttribute('data-league');
      await expect(page.locator(`#homeList .hl-leagues .hl-league[data-league="${leagueKey}"] .hl-item`).first().locator('.hl-mstar')).toHaveAttribute('data-hl-mfav', id);
      // Le lien reste une ligne complete (l'etoile est hors du <a>), memes regles de verrou.
      expect(await mine.locator('a.hl-row button').count()).toBe(0);
      await expectLockedRowsClean(page);
      const stored = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]'), FAV_MATCHES_KEY);
      expect(stored.map((e) => e.id)).toEqual([id]);
      expect(stored[0].ko).toBeGreaterThan(0);
      await expectNoHorizontalScroll(page);
      const jour = await page.locator('#homeList .hl-day[aria-selected="true"]').getAttribute('data-hl-day');
      const memeJour = async () => { const t = page.locator(`#homeList .hl-day[data-hl-day="${jour}"]`); await expect(t).toBeVisible(); if ((await t.getAttribute('aria-selected')) !== 'true') await t.click(); };
      await page.reload();
      await memeJour();
      await expect(page.locator('#homeList .hl-mine a.hl-row')).toHaveCount(1);

      // Compte : fusion dans user_metadata.fav_matches, sans toucher fav_leagues.
      await supa.as('free');
      await page.goto(`/${v.dir}/`);
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      await memeJour();
      await expect.poll(() => supa.calls.filter((c) => c.kind === 'auth' && c.method === 'PUT' && c.path === '/auth/v1/user' && c.body.data.fav_matches).map((c) => c.body.data.fav_matches.map((e) => e.id)).pop()).toEqual([id]);
      await page.evaluate((k) => localStorage.removeItem(k), FAV_MATCHES_KEY);
      await page.reload();
      await memeJour();
      await expect(page.locator('#homeList .hl-mine a.hl-row')).toHaveCount(1);
      // Retrait : la section disparait.
      await page.locator('#homeList .hl-mine .hl-mstar').click();
      await expect(page.locator('#homeList .hl-mine')).toHaveCount(0);
    });

    test('matchs favoris passes : nettoyes automatiquement', async ({ page }) => {
      await page.addInitScript((k) => {
        if (!sessionStorage.getItem('seeded')) {
          localStorage.setItem(k, JSON.stringify([{ id: '999000111', ko: Date.now() - 6 * 3600e3 }, { id: '999000222', ko: Date.now() + 3600e3 }]));
          sessionStorage.setItem('seeded', '1');
        }
      }, FAV_MATCHES_KEY);
      await page.goto(`/${v.dir}/`);
      await expect(page.locator('#homeList a.hl-row').first()).toBeVisible();
      await expect.poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '[]').map((e) => e.id), FAV_MATCHES_KEY)).toEqual(['999000222']);
    });
  });
}
