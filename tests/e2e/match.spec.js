'use strict';
// Page match : murs d'acces (anonyme, gratuit) et analyse complete (Pro simule).
const { test, expect, pathOf } = require('./helpers/fixtures');
const { VERSIONS } = require('./helpers/versions');
const { deepPremiumLeaks, tr } = require('./helpers/site-data');

// Identifiant du match offert tel que la version l'affiche (depend du marche).
async function freeMatchIdFromHome(page, dir) {
  await page.goto(`/${dir}/`);
  const href = await page.locator('#heroFeature a.feature-card').getAttribute('href');
  return new URL(href, 'http://x').searchParams.get('id');
}

for (const v of VERSIONS) {
  test.describe(`page match /${v.dir}/`, () => {
    test.use({ timezoneId: v.timezone });

    test('anonyme : match payant = mur Pro, aucune donnee premium', async ({ page, supa, siteData, dictFor, baseURL }) => {
      test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
      const dict = await dictFor(v.locale);
      const served = [];
      // Toute reponse JSON du site (hors dictionnaires i18n) lue par la page.
      page.on('response', async (r) => {
        const u = new URL(r.url());
        if (u.origin !== new URL(baseURL).origin || !/\.json$/.test(u.pathname) || u.pathname.startsWith('/i18n/')) return;
        try { served.push({ url: u.pathname, body: await r.json() }); } catch (e) { /* non JSON (404 HTML) */ }
      });
      await page.goto(`/${v.dir}/match.html?id=${siteData.paid.id}`);
      const gate = page.locator('#matchRoot .gate');
      await expect(gate).toBeVisible();
      await expect(gate.locator('h2')).toHaveText(tr(dict, 'match_page.gate_pro_title'));
      expect(pathOf(await gate.locator('a.btn-gate').getAttribute('href'), baseURL)).toBe(`/${v.dir}/abonnement.html`);
      await expect(page.locator('#matchRoot .secs')).toHaveCount(0);
      await expect(page.locator('#sigSticky')).toHaveCount(0);
      await page.waitForLoadState('networkidle').catch(() => {});
      expect(supa.callsTo('match-data'), 'un visiteur anonyme ne doit pas appeler match-data').toHaveLength(0);
      expect(served.some((s) => /\/match\/\d+\.json$/.test(s.url) || s.url === '/data-home.json'), 'la page match n\'a lu aucune donnee publique').toBe(true);
      // lib/premium-fields.js : aucun champ premium, a aucune profondeur, pour un match non offert.
      const leaks = served.flatMap((s) => deepPremiumLeaks(s.body, s.url));
      expect(leaks, 'champs premium servis a un visiteur anonyme').toEqual([]);
      // Et rien du produit payant dans ce qui est visible : aucune valeur de la
      // reponse Pro simulee (pari recommande, cote) ne s'affiche.
      const visible = await page.locator('main, #matchRoot').first().innerText();
      if (siteData.template.pari_rec) expect(visible).not.toContain(String(siteData.template.pari_rec));
    });

    test('anonyme : le match offert de l\'accueil mene au mur de compte @mobile', async ({ page, dictFor, baseURL }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/`);
      await page.locator('#heroFeature a.feature-card').click();
      await expect(page).toHaveURL(new RegExp(`/${v.dir}/match\\.html\\?id=\\d+$`));
      const gate = page.locator('#matchRoot .gate');
      await expect(gate).toBeVisible();
      await expect(gate.locator('h2')).toHaveText(tr(dict, 'match_page.gate_free_title'));
      expect(pathOf(await gate.locator('a.btn-gate').getAttribute('href'), baseURL)).toBe(`/${v.dir}/compte.html`);
    });

    test('compte gratuit : match offert = analyse ; match payant = mur Pro', async ({ page, supa, siteData, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('free');
      const freeId = await freeMatchIdFromHome(page, v.dir);
      await page.goto(`/${v.dir}/match.html?id=${freeId}`);
      await expect(page.locator('#matchRoot .secs .sec').first()).toBeVisible();
      await expect(page.locator('#matchRoot .gate')).toHaveCount(0);

      test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
      await page.goto(`/${v.dir}/match.html?id=${siteData.paid.id}`);
      await expect(page.locator('#matchRoot .gate h2')).toHaveText(tr(dict, 'match_page.gate_pro_title'));
      await expect(page.locator('#sigSticky')).toHaveCount(0);
    });

    test('Pro simule : analyse complete et heure avec fuseau', async ({ page, supa, siteData, consoleErrors }) => {
      test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
      await supa.as('pro');
      await page.goto(`/${v.dir}/match.html?id=${siteData.paid.id}`);
      await expect(page.locator('#matchRoot .secs .sec').first()).toBeVisible();
      await expect(page.locator('#matchRoot .gate')).toHaveCount(0);
      expect(await page.locator('#matchRoot .secs .sec').count()).toBeGreaterThanOrEqual(3);
      // Marche recommande (champ premium) reellement affiche.
      await expect(page.locator('#sigSticky .ss-market')).not.toBeEmpty();
      const call = supa.callsTo('match-data')[0];
      expect(call && call.body).toEqual({ id: String(siteData.paid.id) });

      const times = await page.evaluate((date) => {
        const mt = window.IasharkMatchTime, loc = window.I18N.localeTag();
        return { zoned: mt.formatTime({ date }, loc, { zone: true }), plain: mt.formatTime({ date }, loc) };
      }, siteData.paid.date);
      expect(times.zoned, 'formatTime(zone:true) ne porte aucun fuseau').not.toBe(times.plain);
      await expect(page.locator('#matchRoot')).toContainText(times.zoned);
      expect(consoleErrors).toEqual([]);
    });
  });
}
