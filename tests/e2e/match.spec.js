'use strict';
// Page match V8 (16/09/2026, maquette validee par le proprietaire).
// Regle : tout ce que l'IA donne est FERME pour le visiteur ; toutes les stats
// brutes sont OUVERTES. Scenarios : visiteur sur match payant, match offert
// sans compte, compte gratuit, Pro simule, mobile (sommaire, barre d'appel).
const { test, expect, pathOf } = require('./helpers/fixtures');
const { VERSIONS } = require('./helpers/versions');
const { deepPremiumLeaks, tr } = require('./helpers/site-data');

// Elements qui n'existent que dans l'analyse servie (abonne ou match offert connecte).
const PAID = ['.duo', '.pr-row', '.sig-market', '.sig2-cmp', '.sig-why', '.sig-conf', '.scenario-chart', '.score-bars', '.xg-row', '.threat', '.pm-list']
  .map((s) => '#matchRoot ' + s).concat('#sigSticky').join(', ');

// Identifiant du match offert tel que la version l'affiche (depend du marche).
async function freeMatchIdFromHome(page, dir) {
  await page.goto(`/${dir}/`);
  const href = await page.locator('#heroFeature a.feature-card').getAttribute('href');
  return new URL(href, 'http://x').searchParams.get('id');
}
const sectionOrder = (page) => page.locator('#matchRoot .sec[data-sec]').evaluateAll((els) => els.map((e) => e.dataset.sec));

function expectReadingOrder(order, visitor) {
  expect(order[0]).toBe('avis');
  expect(order[order.length - 1], 'questions frequentes a la fin').toBe('questions');
  expect(order).toContain('analyse');
  if (order.includes('stats')) expect(order.indexOf('stats')).toBeLessThan(order.indexOf('analyse'));
  if (visitor && order.includes('stats')) expect(order.slice(order.indexOf('stats') + 1, order.indexOf('analyse'))).toEqual(['rappel']);
  expect(order.filter((k) => k === 'rappel').length).toBeLessThanOrEqual(1);
}

for (const v of VERSIONS) {
  test.describe(`page match /${v.dir}/`, () => {
    test.use({ timezoneId: v.timezone });

    test('anonyme : match payant = stats ouvertes, IA fermee, aucune donnee premium', async ({ page, supa, siteData, dictFor, baseURL }) => {
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
      await expect(gate.locator('h2')).toHaveText(tr(dict, 'match_page.avis_lock_title'));
      await expect(gate.locator('.avis-ready')).toHaveText(tr(dict, 'match_page.avis_ready'));
      expect(pathOf(await gate.locator('a.btn-gate').getAttribute('href'), baseURL)).toBe(`/${v.dir}/abonnement.html`);
      expectReadingOrder(await sectionOrder(page), true);
      // Stats brutes ouvertes, analyse fermee en un seul bloc, reponses du modele fermees.
      await expect(page.locator('#sec-stats .fold').first()).toBeVisible();
      await expect(page.locator('#matchRoot .lock-card--analyse')).toHaveCount(1);
      expect(await page.locator('#matchRoot .faq-lock').count()).toBeGreaterThan(0);
      await expect(page.locator(PAID)).toHaveCount(0);
      await expect(page.locator('#matchRoot .absences-card')).toHaveCount(0);
      await page.waitForLoadState('networkidle').catch(() => {});
      expect(supa.callsTo('match-data'), 'un visiteur anonyme ne doit pas appeler match-data').toHaveLength(0);
      expect(served.some((s) => /\/match\/\d+\.json$/.test(s.url) || s.url === '/data-home.json'), 'la page match n\'a lu aucune donnee publique').toBe(true);
      // lib/premium-fields.js : aucun champ premium, a aucune profondeur, pour un match non offert.
      const leaks = served.flatMap((s) => deepPremiumLeaks(s.body, s.url));
      expect(leaks, 'champs premium servis a un visiteur anonyme').toEqual([]);
      const visible = await page.locator('main, #matchRoot').first().innerText();
      if (siteData.template.pari_rec) expect(visible).not.toContain(String(siteData.template.pari_rec));
      // Aucun chiffre dans les reponses fermees, le rappel et la barre mobile.
      const texte = await page.locator('#matchRoot .faq-lock, #matchRoot .cta-recall, #ctaBar').evaluateAll((els) => els.map((e) => e.textContent).join(' '));
      expect(texte).not.toMatch(/\d/);
    });

    // Defense en profondeur : meme si une reponse publique portait par erreur
    // TOUTE l'analyse (champs premium du match offert recopies sur le match
    // payant), le DOM du visiteur n'en contient aucune valeur ni aucun bloc.
    test('anonyme : le DOM visiteur ne contient aucune valeur premium, meme injectee dans les donnees', async ({ page, siteData, dictFor }) => {
      test.skip(!siteData.paid || !siteData.template.pari_rec, 'Aucun match payant ou aucun gabarit premium');
      const dict = await dictFor(v.locale);
      const id = String(siteData.paid.id);
      const complet = siteData.withPremium(await siteData.detail(id));
      await page.route(new RegExp(`/match/${id}\\.json(\\?.*)?$`), (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(complet) }));
      await page.route(/\/data-home\.json(\?.*)?$/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Object.assign({}, siteData.home, { matchs: siteData.home.matchs.map((m) => (String(m.id) === id ? siteData.withPremium(m) : m)) })) }));
      await page.goto(`/${v.dir}/match.html?id=${id}`);
      await expect(page.locator('#matchRoot .gate')).toBeVisible();
      await expect(page.locator('#matchRoot .sec[data-sec="questions"]')).toHaveCount(1);
      await expect(page.locator(PAID)).toHaveCount(0);
      const found = await page.evaluate(({ tpl, home, away, labels }) => {
        const loc = window.I18N.localeTag();
        const html = document.getElementById('matchRoot').innerHTML;
        const ml = window.IasharkMarketLabels;
        const values = [String(tpl.pari_rec)];
        if (ml && ml.marketLabel) values.push(ml.marketLabel(tpl.pari_rec, { home, away }));
        if (tpl.cote_rec != null) values.push(Number(tpl.cote_rec).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
        if (tpl.model_probability != null) values.push((Number(tpl.model_probability) / 100).toLocaleString(loc, { style: 'percent', maximumFractionDigits: 1 }));
        const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        return values.concat(labels).filter((x) => x && (html.includes(x) || html.includes(esc(x))));
      }, { tpl: siteData.template, home: complet.home.n, away: complet.away.n, labels: ['sig_why_title', 'proba_model_label', 'sig_watch_title', 'sig2_details_show', 'sig_odds_used', 'sig2_not_guarantee'].map((k) => tr(dict, 'match_page.' + k)) });
      expect(found, 'valeurs ou libelles de l\'analyse dans le DOM visiteur').toEqual([]);
    });

    test('anonyme : le match offert de l\'accueil mene a la page visiteur avec compte gratuit @mobile', async ({ page, dictFor, baseURL }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/`);
      await page.locator('#heroFeature a.feature-card').click();
      await expect(page).toHaveURL(new RegExp(`/${v.dir}/match\\.html\\?id=\\d+$`));
      const gate = page.locator('#matchRoot .gate');
      await expect(gate).toBeVisible();
      await expect(gate.locator('h2')).toHaveText(tr(dict, 'match_page.gate_free_title'));
      expect(pathOf(await gate.locator('a.btn-gate').getAttribute('href'), baseURL)).toBe(`/${v.dir}/compte.html`);
      await expect(gate.locator('a.btn-gate')).toHaveText(tr(dict, 'match_page.free_cta'));
      await expect(page.locator('#matchRoot .lock-card--analyse')).toHaveCount(1);
      await expect(page.locator(PAID)).toHaveCount(0);
      for (const href of await page.locator('#matchRoot .cta-recall-btn, #matchRoot .lock-cta, #matchRoot .faq-lock a, #ctaBar a').evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
        expect(pathOf(href, baseURL)).toBe(`/${v.dir}/compte.html`);
      }
    });

    test('compte gratuit : match offert = analyse ; match payant = page visiteur', async ({ page, supa, siteData, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('free');
      const freeId = await freeMatchIdFromHome(page, v.dir);
      await page.goto(`/${v.dir}/match.html?id=${freeId}`);
      await expect(page.locator('#matchRoot .secs .sec').first()).toBeVisible();
      await expect(page.locator('#matchRoot .gate')).toHaveCount(0);
      await expect(page.locator('#matchRoot .faq-lock')).toHaveCount(0);

      test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
      await page.goto(`/${v.dir}/match.html?id=${siteData.paid.id}`);
      await expect(page.locator('#matchRoot .gate h2')).toHaveText(tr(dict, 'match_page.avis_lock_title'));
      await expect(page.locator('#sigSticky')).toHaveCount(0);
      await expect(page.locator(PAID)).toHaveCount(0);
    });

    test('Pro simule : analyse complete et heure avec fuseau', async ({ page, supa, siteData, consoleErrors }) => {
      test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
      await supa.as('pro');
      await page.goto(`/${v.dir}/match.html?id=${siteData.paid.id}`);
      await expect(page.locator('#matchRoot .secs .sec').first()).toBeVisible();
      await expect(page.locator('#matchRoot .gate')).toHaveCount(0);
      expect(await page.locator('#matchRoot .secs .sec').count()).toBeGreaterThanOrEqual(3);
      expectReadingOrder(await sectionOrder(page), false);
      // Marche recommande (champ premium) reellement affiche, deux barres, aucun verrou.
      await expect(page.locator('#sigSticky .ss-market')).not.toBeEmpty();
      await expect(page.locator('#matchRoot .sig2-cmp .duo')).toHaveCount(1);
      await expect(page.locator('#matchRoot .faq-lock, #matchRoot .lock-card, #ctaBar')).toHaveCount(0);
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

    test('mobile Pro : ni barre d\'appel ni reponse fermee @mobile', async ({ page, supa, siteData }, testInfo) => {
      test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
      test.skip(testInfo.project.name !== 'mobile', 'projet mobile seulement');
      await supa.as('pro');
      await page.goto(`/${v.dir}/match.html?id=${siteData.paid.id}`);
      await expect(page.locator('#matchRoot .signal-card').first()).toBeVisible();
      await expect(page.locator('#ctaBar')).toHaveCount(0);
      await expect(page.locator('#matchRoot .faq-lock')).toHaveCount(0);
    });

    test('mobile visiteur : sommaire collant, barre d\'appel masquee en haut, pied de page non recouvert @mobile', async ({ page, siteData }, testInfo) => {
      test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
      test.skip(testInfo.project.name !== 'mobile', 'barre d\'appel mobile (<= 640 px) : projet mobile seulement');
      await page.goto(`/${v.dir}/match.html?id=${siteData.paid.id}`);
      await expect(page.locator('#matchRoot .gate')).toBeVisible();
      const bar = page.locator('#ctaBar');
      await expect(bar).toHaveCount(1);
      await expect(bar).toHaveClass(/is-hidden/);
      await expect(page.locator('#matchNav .mnav-chip')).toHaveCount(4);
      await page.locator('.mnav-chip[data-nav="questions"]').click();
      await expect(page.locator('.mnav-chip[data-nav="questions"]')).toHaveAttribute('aria-current', 'true');
      await expect(bar).not.toHaveClass(/is-hidden/);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await page.waitForTimeout(500);
      const m = await page.evaluate(() => {
        const f = document.querySelector('.legal-footer').getBoundingClientRect();
        const b = document.getElementById('ctaBar');
        return { footerBottom: Math.round(f.bottom), barTop: b.classList.contains('is-hidden') ? 100000 : Math.round(b.getBoundingClientRect().top) };
      });
      expect(m.footerBottom, 'la barre d\'appel recouvre le pied de page').toBeLessThanOrEqual(m.barTop + 1);
    });
  });
}
