'use strict';
// Compte : redirection anonyme, plans gratuit / Pro / admin, portail Stripe,
// suppression du compte, deconnexion, mise en page mobile.
const { test, expect, expectNoHorizontalScroll, expectNotHiddenByBottomNav } = require('./helpers/fixtures');
const { VERSIONS, CONSENT_BOXES } = require('./helpers/versions');
const { STORAGE_KEY, STRIPE_CHECKOUT_URL, STRIPE_PORTAL_URL } = require('./helpers/supabase-mock');
const { tr } = require('./helpers/site-data');
const { useUsdSwitch } = require('./helpers/usd-switch');

// Durees PAYABLES de la version (config/markets.json#checkoutOpen ; gb, mx, za
// fermes le 19/09/2026) : aucune = ni bouton « Decouvrir Pro » ni consentement.
const payableOf = (v) => ['week', 'month', 'year'].filter((iv) => typeof v.proAmounts[iv] === 'number' && (!Array.isArray(v.checkoutOpen) || v.checkoutOpen.includes(iv)));
// Liste Pro du compte = celle de la page d'abonnement (19/09/2026).
const PRO_LIST_KEYS = ['pro_gate_item_bet', 'pro_gate_item_scorer', 'pro_gate_item_scenario', 'pro_gate_item_scores', 'pro_gate_item_odds', 'pro_gate_item_stats', 'pro_gate_item_faq'].map((k) => 'match_page.' + k)
  .concat(['daily_all_matches', 'daily_scorers', 'tool_scanner', 'tool_journal', 'tool_combo'].map((k) => 'pro_offer.' + k));
const squash = (x) => String(x).replace(/[\s\u00a0\u202f\u2009]+/g, ' ').trim();

for (const v of VERSIONS) {
  test.describe(`compte /${v.dir}/`, () => {
    test('anonyme : redirige vers la connexion de la version', async ({ page }) => {
      await page.goto(`/${v.dir}/compte.html`);
      await page.waitForURL(new RegExp(`/${v.dir}/connexion\\.html\\?next=`));
      expect(new URL(page.url()).searchParams.get('next')).toBe(`/${v.dir}/compte.html`);
    });

    test('compte gratuit : plan affiche, paiement depuis le compte', async ({ page, supa, dictFor, consoleErrors }) => {
      const dict = await dictFor(v.locale);
      await supa.as('free');
      supa.onFunction('create-checkout-session', { status: 200, json: { processed: true, url: STRIPE_CHECKOUT_URL } });
      await page.goto(`/${v.dir}/compte.html#abonnement`);
      await expect(page.locator('#compte')).toBeVisible();
      await expect(page.locator('#compte')).toContainText('e2e.free@example.test');
      await expect(page.locator('#panneau')).toContainText(tr(dict, 'compte_page.plan_free_name'));
      await expect(page.locator('#compte')).toContainText(tr(dict, 'compte_page.badge_free'));
      await expect(page.locator('#portail')).toHaveCount(0);
      // Ce que Pro donne : la liste de la page d'abonnement (plus de « six outils », ni de « suivi de bankroll »).
      const items = page.locator('#proListe li');
      await expect(items).toHaveCount(PRO_LIST_KEYS.length);
      const texts = (await items.allTextContents()).map(squash);
      PRO_LIST_KEYS.forEach((k, i) => expect(texts[i], k).toContain(squash(tr(dict, k))));
      await expect(page.locator('#panneau')).toContainText(tr(dict, 'pro_offer.free_matches'));
      await expect(page.locator('#panneau')).toContainText(tr(dict, 'pro_offer.free_tools'));
      for (const k of ['benefit_pro_six_tools', 'benefit_pro_bankroll']) await expect(page.locator('#panneau')).not.toContainText(tr(dict, 'compte_page.' + k));
      if (!payableOf(v).length) {
        // Marche pas encore ouvert : ligne « pas encore ouvert », aucun bouton mort.
        await expect(page.locator('#proPlanPicker .iash-plans-closed')).toHaveText(tr(dict, 'pro_plans.closed'));
        await expect(page.locator('#souscrire')).toBeHidden();
        await expect(page.locator('#checkoutConsent')).toBeHidden();
        await expect(page.locator('#proDureesNote')).toBeHidden();
        expect(supa.callsTo('create-checkout-session')).toHaveLength(0);
        expect(consoleErrors).toEqual([]);
        return;
      }
      const inputs = page.locator('#checkoutConsent input[data-consent]');
      await expect(inputs).toHaveCount(CONSENT_BOXES[v.regime]);
      for (let i = 0; i < CONSENT_BOXES[v.regime]; i++) await inputs.nth(i).check();
      const call = supa.waitForCall('create-checkout-session');
      await page.locator('#souscrire').click();
      const c = await call;
      expect(c.body.dir).toBe(v.dir);
      if (v.checkoutMarket) expect(c.body.market).toBe(v.checkoutMarket);
      else expect(c.body).not.toHaveProperty('market');
      expect(c.body.consent).toMatchObject({ terms: true, dir: v.dir });
      await page.waitForURL(STRIPE_CHECKOUT_URL);
      expect(consoleErrors).toEqual([]);
    });

    test('Pro simule : plan, portail d\'abonnement, deconnexion', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('pro');
      await page.goto(`/${v.dir}/compte.html#abonnement`);
      await expect(page.locator('#panneau')).toContainText(tr(dict, 'compte_page.plan_pro_name'));
      await expect(page.locator('#panneau')).toContainText(tr(dict, 'compte_page.sub_status_active_title'));
      // Offre Pro unique : duree actuelle, prochaine echeance, changement de duree via le portail.
      await expect(page.locator('#panneau')).toContainText(tr(dict, 'compte_page.sub_interval_label'));
      await expect(page.locator('#panneau')).toContainText(tr(dict, 'compte_page.interval_month'));
      await expect(page.locator('#panneau')).toContainText(tr(dict, 'compte_page.next_renewal_label'));
      // « Changer de duree » seulement si plusieurs durees sont payables en
      // ligne (config/markets.json#checkoutOpen) : jamais un bouton vers une
      // duree que l'on ne peut pas acheter.
      const sold = ['week', 'month', 'year'].filter((iv) => typeof v.proAmounts[iv] === 'number');
      const openCount = sold.filter((iv) => !Array.isArray(v.checkoutOpen) || v.checkoutOpen.includes(iv)).length;
      const change = page.locator('#changerDuree');
      if (openCount > 1) {
        await expect(change).toHaveText(tr(dict, 'compte_page.change_interval_cta'));
        const changeCall = supa.waitForCall('create-portal-session');
        await change.click();
        const cc = await changeCall;
        expect(cc.body).toEqual(Object.assign({ flow: 'change_interval' }, v.dir ? { dir: v.dir } : {}));
        await page.waitForURL(STRIPE_PORTAL_URL);
        await page.goto(`/${v.dir}/compte.html#abonnement`);
      } else {
        await expect(change).toHaveCount(0);
      }
      // Resiliation en ligne nommee comme telle (L215-1-1) : ouvre l'espace securise.
      const cancel = page.locator('#resilier');
      await expect(cancel).toHaveText(tr(dict, 'compte_page.cancel_subscription_cta'));
      const cancelCall = supa.waitForCall('create-portal-session');
      await cancel.click();
      expect((await cancelCall).persona).toBe('pro');
      await page.waitForURL(STRIPE_PORTAL_URL);
      await page.goto(`/${v.dir}/compte.html#abonnement`);
      await expect(page.locator('#souscrire')).toHaveCount(0);
      const portal = page.locator('#portail');
      await expect(portal).toHaveText(tr(dict, 'compte_page.manage_subscription_cta'));
      const call = supa.waitForCall('create-portal-session');
      await portal.click();
      expect((await call).persona).toBe('pro');
      await page.waitForURL(STRIPE_PORTAL_URL);

      await page.goto(`/${v.dir}/compte.html#securite`);
      const logout = page.locator('#deconnexion2');
      await expect(logout).toBeVisible();
      await logout.click();
      await page.waitForURL(new RegExp(`/${v.dir}/connexion\\.html$`));
      expect(supa.calls.some((c) => c.path === '/auth/v1/logout')).toBe(true);
      expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
    });

    test('Pro simule : suppression du compte avec le mot de confirmation', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('pro');
      await page.goto(`/${v.dir}/compte.html#donnees`);
      await page.locator('#ouvrirSuppression').click();
      const dialog = page.locator('#dlgSuppr');
      await expect(dialog).toBeVisible();
      const word = tr(dict, 'compte_page.delete_confirm_word');
      await expect(dialog.locator('label[for="confirmationSuppr"] b')).toHaveText(word);

      await page.locator('#confirmationSuppr').fill('pas-le-bon-mot');
      await page.locator('#validerSuppr').click();
      await expect(page.locator('#msgSuppr')).toBeVisible();
      expect(supa.callsTo('delete-account')).toHaveLength(0);

      await page.locator('#confirmationSuppr').fill(word.toLowerCase());
      const call = supa.waitForCall('delete-account');
      await page.locator('#validerSuppr').click();
      const c = await call;
      expect(c.body).toEqual({ confirmation: 'SUPPRIMER' });
      expect(c.persona).toBe('pro');
      await page.waitForURL(new RegExp(`/${v.dir}/\\?compte-supprime=1$`));
      expect(await page.evaluate((k) => localStorage.getItem(k), STORAGE_KEY)).toBeNull();
    });

    test('admin simule : acces de service, aucun paiement propose', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('admin');
      await page.goto(`/${v.dir}/compte.html#abonnement`);
      await expect(page.locator('#panneau')).toContainText(tr(dict, 'compte_page.plan_admin_title'));
      await expect(page.locator('#souscrire')).toHaveCount(0);
      await expect(page.locator('#portail')).toHaveCount(0);
    });

    test('mobile : pas de debordement, boutons atteignables au-dessus de la navigation basse @mobile', async ({ page, supa }) => {
      await supa.as('free');
      await page.goto(`/${v.dir}/compte.html#abonnement`);
      if (payableOf(v).length) {
        await expect(page.locator('#souscrire')).toBeVisible();
        await expectNoHorizontalScroll(page);
        await expectNotHiddenByBottomNav(page, '#souscrire');
      } else {
        await expect(page.locator('#proPlanPicker .iash-plans-closed')).toBeVisible();
        await expect(page.locator('#souscrire')).toBeHidden();
        await expectNoHorizontalScroll(page);
      }
      await page.goto(`/${v.dir}/compte.html#donnees`);
      await expect(page.locator('#ouvrirSuppression')).toBeVisible();
      await expectNoHorizontalScroll(page);
      await expectNotHiddenByBottomNav(page, '#ouvrirSuppression');
      await page.goto(`/${v.dir}/compte.html#securite`);
      await expect(page.locator('#deconnexion2')).toBeVisible();
      await expectNotHiddenByBottomNav(page, '#deconnexion2');
    });
  });
}

// « Mes compétitions préférées » (16/09/2026) : user_metadata.fav_leagues,
// enregistrement immediat, confirmation, meme liste que l'accueil.
for (const v of VERSIONS.filter((x) => ['fr', 'gb', 'mx'].includes(x.dir))) {
  test.describe(`compte /${v.dir}/ : compétitions préférées`, () => {
    test('étoiles des compétitions couvertes, enregistrement immédiat et persistant @mobile', async ({ page, supa, dictFor, consoleErrors }) => {
      const dict = await dictFor(v.locale);
      await supa.as('free');
      await page.goto(`/${v.dir}/compte.html#competitions`);
      await expect(page.locator('#panneau')).toContainText(tr(dict, 'compte_page.fav_leagues_heading'));
      const buttons = page.locator('#listeFavoris [data-fav-ligue]');
      await expect(buttons).toHaveCount(19);
      const laliga = page.locator('#listeFavoris [data-fav-ligue="laliga"]');
      await expect(laliga).toHaveAttribute('aria-pressed', 'false');
      const box = await laliga.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      await laliga.click();
      await expect(page.locator('#listeFavoris [data-fav-ligue="laliga"]')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('#msgFavoris')).toBeVisible();
      await expect(page.locator('#msgFavoris')).toContainText('La Liga');
      await expect.poll(() => supa.calls.filter((c) => c.kind === 'auth' && c.method === 'PUT' && c.path === '/auth/v1/user').map((c) => c.body.data.fav_leagues).pop()).toEqual(['laliga']);
      await expectNoHorizontalScroll(page);
      // Persistant cote compte : sans liste locale, apres rechargement.
      await page.evaluate(() => localStorage.removeItem('iashark.favLeagues.v1'));
      await page.reload();
      await expect(page.locator('#listeFavoris [data-fav-ligue="laliga"]')).toHaveAttribute('aria-pressed', 'true');
      // Retrait : meme chemin, liste vide enregistree.
      await page.locator('#listeFavoris [data-fav-ligue="laliga"]').click();
      await expect.poll(() => supa.calls.filter((c) => c.kind === 'auth' && c.method === 'PUT' && c.path === '/auth/v1/user').map((c) => c.body.data.fav_leagues).pop()).toEqual([]);
      expect(consoleErrors).toEqual([]);
    });
  });
}

// Offre USD de /en/ : bascule config/markets.json#_usdSwitch rejouee sans etre
// publiee (tests/e2e/helpers/usd-switch.js). Le paiement depuis le compte
// envoie le marche us (account-page.js : IASHARK_MARKET.checkoutMarket, plus
// de liste gb/mx/za en dur qui aurait facture l'offre USD au tarif EUR).
test.describe('compte /en/ apres la bascule USD (config de test _usdSwitch)', () => {
  test('compte gratuit : $19.99 / mois, paiement envoye sur le marche us @mobile', async ({ page, supa, consoleErrors }) => {
    await useUsdSwitch(page);
    await supa.as('free');
    supa.onFunction('create-checkout-session', { status: 200, json: { processed: true, url: STRIPE_CHECKOUT_URL } });
    await page.goto('/en/compte.html#abonnement');
    await expect(page.locator('#compte')).toBeVisible();
    await expect(page.locator('#proPlanPicker [data-market-price="pro.month"]')).toHaveText('$19.99');
    await expect(page.locator('#proPlanPicker input[type="radio"]')).toHaveCount(0);
    expect(squash(await page.locator('#panneau').innerText()), 'aucun prix EUR ni "US$"').not.toMatch(/€|19[.,]95|US\$/);
    const inputs = page.locator('#checkoutConsent input[data-consent]');
    await expect(inputs).toHaveCount(CONSENT_BOXES.eu);
    for (let i = 0; i < CONSENT_BOXES.eu; i++) await inputs.nth(i).check();
    const call = supa.waitForCall('create-checkout-session');
    await page.locator('#souscrire').click();
    const c = await call;
    expect(c.body).toMatchObject({ market: 'us', dir: 'en', interval: 'month' });
    expect(c.body.consent).toMatchObject({ terms: true, waiver: true, dir: 'en' });
    await page.waitForURL(STRIPE_CHECKOUT_URL);
    expect(consoleErrors).toEqual([]);
  });
});
