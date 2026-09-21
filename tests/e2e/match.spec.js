'use strict';
// Page match V8 (16/09/2026, maquette validee par le proprietaire).
// Regle du 19/09/2026 (remplace « stats ouvertes ») : le visiteur ne voit que
// l'en-tete du match (sans classement ni forme) et UN panneau avec UN bouton ;
// stats, FAQ et analyse sont derriere. Scenarios : visiteur sur match payant,
// match offert sans compte, compte gratuit, Pro simule, mobile.
const { test, expect, pathOf } = require('./helpers/fixtures');
const { VERSIONS } = require('./helpers/versions');
const { deepPremiumLeaks, tr } = require('./helpers/site-data');
const { useUsdSwitch } = require('./helpers/usd-switch');

// Elements qui n'existent que dans l'analyse servie (abonne ou match offert connecte).
const PAID = ['.duo', '.pr-row', '.sig-market', '.sig2-cmp', '.sig-why', '.sig-conf', '.scenario-chart', '.score-bars', '.xg-row', '.threat', '.pm-list']
  .map((s) => '#matchRoot ' + s).concat('#sigSticky').join(', ');

// Prix mensuel Pro de la version, lu dans la MEME source que la page
// d'abonnement (lib/market-config.js#proOffer, config/markets.json).
const prixPro = (page, interval) => page.evaluate((iv) => {
  const M = window.IASHARK_MARKET;
  const it = M && M.proOffer ? M.proOffer().intervals.filter((i) => i.interval === iv)[0] : null;
  return it && it.text ? it.text : null;
}, interval);
const prixMensuel = (page) => prixPro(page, 'month');
const squash = (s) => String(s).replace(/[\s\u00a0\u202f\u2009]+/g, ' ').trim();

// Identifiant du match offert tel que la version l'affiche (depend du marche).
async function freeMatchIdFromHome(page, dir) {
  await page.goto(`/${dir}/`);
  const href = await page.locator('#heroFeature a.feature-card').getAttribute('href');
  return new URL(href, 'http://x').searchParams.get('id');
}
// Offre Pro avec retour a ce match apres paiement (abonnement-page.js#contexteMatch).
const proHref = (dir, id) => `/${dir}/abonnement.html?next=${encodeURIComponent(`/${dir}/match.html?id=${id}`)}`;
const sectionOrder = (page) => page.locator('#matchRoot .sec[data-sec]').evaluateAll((els) => els.map((e) => e.dataset.sec));

function expectReadingOrder(order) {
  expect(order[0]).toBe('avis');
  expect(order[order.length - 1], 'questions frequentes a la fin').toBe('questions');
  expect(order).toContain('analyse');
  if (order.includes('stats')) expect(order.indexOf('stats')).toBeLessThan(order.indexOf('analyse'));
}
// Vue visiteur : le panneau seul, un seul bouton « Debloquer », ni stats
// (ni dans l'en-tete), ni FAQ, ni sommaire, ni barre d'appel.
async function expectPanelOnly(page) {
  expect(await sectionOrder(page)).toEqual(['avis']);
  await expect(page.locator('#matchRoot a[data-track$="_unlock"]')).toHaveCount(1);
  await expect(page.locator('#matchRoot .hero-meta, #matchRoot .fold, #matchRoot .faq-card, #matchNav, #ctaBar')).toHaveCount(0);
}

for (const v of VERSIONS) {
  test.describe(`page match /${v.dir}/`, () => {
    test.use({ timezoneId: v.timezone });

    test('anonyme : match payant = panneau seul, aucune donnee premium', async ({ page, supa, siteData, dictFor, baseURL }) => {
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
      // Mur Pro unique (19/09/2026) : apercu factice floute + panneau + bouton ambre.
      const gate = page.locator('#matchRoot .gate.mgate');
      await expect(gate).toBeVisible();
      await expect(gate.locator('h2')).toHaveText(tr(dict, 'match_page.pro_gate_title'));
      await expect(gate.locator('.avis-ready')).toHaveText(tr(dict, 'match_page.avis_ready'));
      const cta = gate.locator('a.mgate-cta');
      await expect(cta).toContainText(tr(dict, 'match_page.pro_gate_cta'));
      await expect(cta).toHaveAttribute('data-track', 'match_gate_unlock');
      expect(pathOf(await cta.getAttribute('href'), baseURL)).toBe(proHref(v.dir, siteData.paid.id));
      // 19/09/2026 : prix mensuel du marche pres du bouton (devise de la
      // version, jamais ecrit en dur) et ce que Pro donne en plus du match.
      // Mensuel pas encore payable (gb, mx, za : checkoutOpen = [] depuis le
      // 19/09/2026) : aucun prix annonce, la ligne de resiliation seule.
      const monthOpen = typeof v.proAmount === 'number' && (!Array.isArray(v.checkoutOpen) || v.checkoutOpen.includes('month'));
      const weekOpen = typeof v.proAmounts.week === 'number' && (!Array.isArray(v.checkoutOpen) || v.checkoutOpen.includes('week'));
      if (monthOpen) {
        const prix = await prixMensuel(page);
        expect(prix, 'prix mensuel absent de lib/market-config.js').toBeTruthy();
        expect(squash(prix), `prix ${prix} : montant ${v.proAmount}`).toMatch(new RegExp(String(v.proAmount).replace('.', '[.,]') + '(?![\\d])'));
        expect(prix).toContain(v.currencySymbol);
        // 20/09/2026 : hebdo annonce a cote du mensuel quand il est payable.
        if (weekOpen) {
          const semaine = await prixPro(page, 'week');
          expect(semaine, 'prix hebdo absent de lib/market-config.js').toBeTruthy();
          await expect(gate.locator('.mgate-small')).toHaveText(tr(dict, 'pro_offer.price_week_month').replace('{week}', semaine).replace('{month}', prix));
        } else {
          await expect(gate.locator('.mgate-small')).toHaveText(tr(dict, 'pro_offer.price_month').replace('{price}', prix));
        }
      } else {
        await expect(gate.locator('.mgate-small')).toHaveText(tr(dict, 'match_page.pro_gate_small'));
      }
      await expect(gate.locator('.mgate-more')).toHaveText(tr(dict, 'pro_offer.match_more'));
      const liste = await gate.locator('.mgate-list').innerText();
      for (const k of ['pro_gate_item_bet', 'pro_gate_item_scorer', 'pro_gate_item_scenario', 'pro_gate_item_scores', 'pro_gate_item_odds']) expect(liste).toContain(tr(dict, 'match_page.' + k));
      await expect(gate.locator('.mgate-preview')).toHaveAttribute('aria-hidden', 'true');
      expect(await gate.locator('.mgate-preview').textContent(), 'apercu factice : aucun chiffre').not.toMatch(/\d/);
      await expect(gate.locator('.sr-only')).toHaveText(tr(dict, 'match_page.pro_gate_sr'));
      await expect(page.locator('#matchRoot .avis-cta, #matchRoot [data-track="match_avis_unlock"]')).toHaveCount(0);
      await expectPanelOnly(page);
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
      await expectPanelOnly(page);
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
      // Match offert : jamais de prix (seul un compte gratuit est demande).
      const prix = await prixMensuel(page);
      expect(squash(await gate.textContent())).not.toContain(squash(prix));
      await expect(gate.locator('.mgate-small, .mgate-more')).toHaveCount(0);
      await expectPanelOnly(page);
      await expect(page.locator(PAID)).toHaveCount(0);
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
      await expect(page.locator('#matchRoot .gate h2')).toHaveText(tr(dict, 'match_page.pro_gate_title'));
      await expect(page.locator('#matchRoot a.mgate-cta')).toHaveCount(1);
      await expectPanelOnly(page);
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
      expectReadingOrder(await sectionOrder(page));
      await expect(page.locator('#matchRoot .hero-meta')).toHaveCount(1);
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

    // Plus d'impasse « Match introuvable » (19/09/2026).
    test('sans identifiant : retour a l\'accueil de la version, sans ecran d\'erreur @mobile', async ({ page }) => {
      await page.goto(`/${v.dir}/match.html`);
      await page.waitForURL((u) => u.pathname === `/${v.dir}/`, { timeout: 15000 });
      await expect(page.locator('.match-error')).toHaveCount(0);
    });

    test('identifiant inconnu : bloc de reprise (match gratuit du jour, matchs du jour), page noindex @mobile', async ({ page, dictFor, baseURL }) => {
      const dict = await dictFor(v.locale);
      const freeId = await freeMatchIdFromHome(page, v.dir);
      await page.goto(`/${v.dir}/match.html?id=999999999`);
      const rec = page.locator('#matchRoot .match-recovery');
      await expect(rec).toBeVisible();
      await expect(rec.locator('#recoveryTitle')).toHaveText(tr(dict, 'match_page.recovery_title'));
      await expect(rec.locator('.mrec-text')).toHaveText(tr(dict, 'match_page.recovery_text'));
      const home = rec.locator('a.mrec-btn', { hasText: tr(dict, 'match_page.recovery_home_cta') });
      expect(pathOf(await home.getAttribute('href'), baseURL)).toBe(`/${v.dir}/`);
      const free = rec.locator('a.mrec-btn', { hasText: tr(dict, 'match_page.recovery_free_cta') });
      if (freeId) expect(pathOf(await free.getAttribute('href'), baseURL)).toBe(`/${v.dir}/match.html?id=${freeId}`);
      else await expect(free).toHaveCount(0);
      await expect(page.locator('.match-error')).toHaveCount(0);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    });

    test('mobile visiteur : panneau seul, bouton visible, ni sommaire ni barre d\'appel @mobile', async ({ page, siteData }, testInfo) => {
      test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
      test.skip(testInfo.project.name !== 'mobile', 'projet mobile seulement');
      await page.goto(`/${v.dir}/match.html?id=${siteData.paid.id}`);
      await expect(page.locator('#matchRoot .gate')).toBeVisible();
      await expectPanelOnly(page);
      await page.locator('#matchRoot a.mgate-cta').scrollIntoViewIfNeeded();
      await expect(page.locator('#matchRoot a.mgate-cta')).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), 'defilement horizontal').toBeLessThanOrEqual(0);
    });
  });
}

// Offre USD de /en/ : bascule config/markets.json#_usdSwitch rejouee sans etre
// publiee (tests/e2e/helpers/usd-switch.js). Ligne de prix du panneau Pro
// (match-page.js#prixPro -> IASHARK_MARKET.proOffer()) en USD. Hebdomadaire
// ouvert le 21/09/2026 : la ligne annonce les deux durees.
test.describe('page match /en/ apres la bascule USD (config de test _usdSwitch)', () => {
  test('anonyme : panneau Pro « $4.99 / semaine ou $19.99 / mois », aucun prix EUR @mobile', async ({ page, siteData, dictFor }) => {
    test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
    const dict = await dictFor('en');
    await useUsdSwitch(page);
    await page.goto(`/en/match.html?id=${siteData.paid.id}`);
    const gate = page.locator('#matchRoot .gate.mgate');
    await expect(gate).toBeVisible();
    expect(await prixMensuel(page)).toBe('$19.99');
    expect(await prixPro(page, 'week')).toBe('$4.99');
    await expect(gate.locator('.mgate-small')).toHaveText(tr(dict, 'pro_offer.price_week_month').replace('{week}', '$4.99').replace('{month}', '$19.99'));
    expect(squash(await gate.innerText()), 'aucun prix EUR ni "US$"').not.toMatch(/€|19[.,]95|US\$/);
    await expectPanelOnly(page);
  });
});
