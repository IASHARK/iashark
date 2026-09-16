'use strict';
// Page abonnement : consentement par regime, bouton de paiement, appel
// create-checkout-session (simule), redirection Stripe (interceptee).
const { test, expect } = require('./helpers/fixtures');
const { VERSIONS, CONSENT_BOXES, CURRENCY_SYMBOLS, currencyOfCheckoutMarket } = require('./helpers/versions');
const { STRIPE_CHECKOUT_URL } = require('./helpers/supabase-mock');
const { tr } = require('./helpers/site-data');

// Attend le bloc de consentement monte (le bouton est verrouille jusque-la),
// coche toutes les cases puis attend le deverrouillage du bouton.
async function tickAll(page) {
  const boxes = page.locator('#checkoutConsent input[data-consent]');
  await expect(boxes.first()).toBeVisible();
  const n = await boxes.count();
  for (let i = 0; i < n; i++) await boxes.nth(i).check();
  await expect(page.locator('#subscribeButton')).toHaveAttribute('aria-disabled', 'false');
}

// "19.95" -> /19[.,]95/ ; "199" -> 199 non suivi d'un chiffre (espaces de groupe tolérés).
function amountPattern(amount) {
  const [int, dec] = String(amount).split('.');
  const intPart = int.replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s.,]?');
  return intPart + (dec ? '[.,]' + dec : '(?![\\d.,]\\d)');
}
const normalizeSpaces = (s) => String(s).replace(/[   ]/g, ' ').trim();
// Prix dans une devise donnee (symbole colle a un montant pour ZAR et MXN, pour
// ne pas confondre "R" avec une lettre et "MX$" avec "$").
const CURRENCY_PATTERNS = {
  EUR: /€|\bEUR\b/,
  GBP: /£|\bGBP\b/,
  ZAR: /(^|[^A-Za-z])R ?\d|\bZAR\b/,
  MXN: /MX\$ ?\d|\bMXN\b/,
};

for (const v of VERSIONS) {
  test.describe(`abonnement /${v.dir}/`, () => {
    test('prix Pro et devise du marche de la version @mobile', async ({ page, consoleErrors }) => {
      expect(v.configCurrency, `config/markets.json : /${v.dir}/ n'est pas facture en ${v.currency}`).toBe(v.currency);
      expect(typeof v.proAmount, `config/markets.json : aucun prix Pro pour /${v.dir}/`).toBe('number');
      await page.goto(`/${v.dir}/abonnement.html`);
      // Selecteur de duree : 3 options, "Mois" coche par defaut, memes donnees
      // sur mobile et desktop (@mobile).
      const radios = page.locator('#proPlanPicker input[type="radio"]');
      await expect(radios).toHaveCount(3);
      await expect(page.locator('#proPlanPicker input[value="month"]')).toBeChecked();
      const market = await page.evaluate(() => {
        const M = window.IASHARK_MARKET;
        const o = M && M.proOffer ? M.proOffer() : null;
        return M ? { dir: M.dir, currency: M.currency, checkoutMarket: M.checkoutMarket, amounts: o ? Object.fromEntries(o.intervals.map((i) => [i.interval, i.amount])) : null } : null;
      });
      expect(market, 'window.IASHARK_MARKET absent (lib/market-config.js non charge)').not.toBeNull();
      expect(market).toEqual({ dir: v.dir, currency: v.currency, checkoutMarket: v.checkoutMarket, amounts: v.proAmounts });

      const others = Object.keys(CURRENCY_PATTERNS).filter((c) => c !== v.currency);
      for (const iv of ['week', 'month', 'year']) {
        const price = page.locator(`#proPlanPicker [data-market-price="pro.${iv}"]`);
        await expect(price).toBeVisible();
        const t = normalizeSpaces(await price.innerText());
        expect(t, `prix ${iv} "${t}" : montant ${v.proAmounts[iv]} attendu`).toMatch(new RegExp(amountPattern(v.proAmounts[iv])));
        expect(t, `prix ${iv} "${t}" : symbole ${CURRENCY_SYMBOLS[v.currency]} attendu`).toMatch(CURRENCY_PATTERNS[v.currency]);
        for (const c of others) expect(t, `prix ${iv} "${t}" : devise d'un autre marche (${c})`).not.toMatch(CURRENCY_PATTERNS[c]);
      }
      // Economie de l'annuel : calculee (arrondi inferieur), jamais inventee.
      const expectedPct = Math.floor((1 - v.proAmounts.year / (12 * v.proAmounts.month)) * 100 + 1e-9);
      await expect(page.locator('#proPlanPicker .iash-plan-save')).toContainText(String(expectedPct));
      await expect(page.locator('body')).not.toContainText(/\bEdge\b/);
      // Le titre de la page ne doit jamais annoncer le prix d'un autre marche.
      const title = normalizeSpaces(await page.title());
      for (const c of others) expect(title, `<title> "${title}" cite un prix en ${c}`).not.toMatch(CURRENCY_PATTERNS[c]);
      await page.waitForLoadState('networkidle').catch(() => {});
      expect(consoleErrors).toEqual([]);
    });

    test('cases de consentement du regime, bouton verrouille tant qu\'elles ne sont pas cochees @mobile', async ({ page, consoleErrors }) => {
      await page.goto(`/${v.dir}/abonnement.html`);
      const box = page.locator('#checkoutConsent');
      await expect(box).toHaveAttribute('data-consent-regime', v.regime);
      const inputs = box.locator('input[data-consent]');
      await expect(inputs).toHaveCount(CONSENT_BOXES[v.regime]);
      for (let i = 0; i < CONSENT_BOXES[v.regime]; i++) await expect(inputs.nth(i)).not.toBeChecked();
      if (v.regime === 'mx') await expect(box.locator('.iash-consent-info')).toBeVisible();
      else await expect(box.locator('.iash-consent-info')).toHaveCount(0);

      const pay = page.locator('#subscribeButton');
      await expect(pay).toHaveAttribute('aria-disabled', 'true');
      // Clic sans consentement (aria-disabled n'empeche pas le clic reel) :
      // aucun appel, message d'erreur du bloc.
      await pay.click({ force: true });
      await expect(box.locator('.iash-consent-error')).toBeVisible();
      await inputs.first().check();
      if (CONSENT_BOXES[v.regime] > 1) {
        await expect(pay).toHaveAttribute('aria-disabled', 'true');
        await inputs.nth(1).check();
      }
      await expect(pay).toHaveAttribute('aria-disabled', 'false');

      // Anonyme avec consentement : envoye vers le compte (connexion) de la version.
      await pay.click();
      await expect(page).toHaveURL(new RegExp(`/${v.dir}/connexion\\.html\\?next=`));
      expect(consoleErrors).toEqual([]);
    });

    test('compte gratuit : le paiement envoie market, dir et consent puis ouvre Stripe (simule)', async ({ page, supa }) => {
      await supa.as('free');
      supa.onFunction('create-checkout-session', { status: 200, json: { processed: true, url: STRIPE_CHECKOUT_URL } });
      await page.goto(`/${v.dir}/abonnement.html`);
      await tickAll(page);
      const call = supa.waitForCall('create-checkout-session');
      await page.locator('#subscribeButton').click();
      const c = await call;
      expect(c.persona).toBe('free');
      expect(c.body.dir).toBe(v.dir);
      expect(c.body.interval, 'duree par defaut').toBe('month');
      if (v.checkoutMarket) expect(c.body.market).toBe(v.checkoutMarket);
      else expect(c.body, 'marche EUR par defaut : aucun champ market').not.toHaveProperty('market');
      expect(currencyOfCheckoutMarket(c.body.market), 'devise facturee pour le champ market envoye').toBe(v.currency);
      expect(c.headers.authorization, 'jeton de la session simulee').toMatch(/^Bearer ey/);
      expect(c.body.consent).toMatchObject({ terms: true, waiver: v.regime === 'mx' ? null : true, dir: v.dir, locale: v.locale });
      expect(c.body.consent.terms_version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      await page.waitForURL(STRIPE_CHECKOUT_URL);
      await expect(page.locator('#e2e-stripe-mock')).toBeVisible();
    });

    test('duree annuelle choisie : interval=year envoye @mobile', async ({ page, supa }) => {
      await supa.as('free');
      supa.onFunction('create-checkout-session', { status: 200, json: { processed: true, url: STRIPE_CHECKOUT_URL } });
      await page.goto(`/${v.dir}/abonnement.html`);
      await page.locator('#proPlanPicker input[value="year"]').check();
      await tickAll(page);
      const call = supa.waitForCall('create-checkout-session');
      await page.locator('#subscribeButton').click();
      expect((await call).body.interval).toBe('year');
    });

    test('duree non configuree cote Stripe : "bientot disponible", aucun paiement', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('free');
      supa.availability({ week: false, month: true, year: true });
      supa.onFunction('create-checkout-session', { status: 200, json: { processed: false, reason: 'interval_not_configured' } });
      await page.goto(`/${v.dir}/abonnement.html`);
      await expect(page.locator('#proPlanPicker .iash-plan.is-soon')).toHaveCount(1);
      await page.locator('#proPlanPicker input[value="week"]').check();
      await tickAll(page);
      await page.locator('#subscribeButton').click();
      await expect(page.locator('#billingMessage')).toHaveText(tr(dict, 'pricing_page.checkout_interval_not_configured'));
      expect(supa.callsTo('create-checkout-session')).toHaveLength(0);
    });

    test('reponses d\'erreur : marche non ouvert et consentement refuse', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      const serverConsentMessage = tr(dict, 'checkout_consent.error_required');
      await supa.as('free');
      supa.onFunction('create-checkout-session', [
        { status: 200, json: { processed: false, reason: 'market_not_configured' } },
        { status: 400, json: { code: 'consent_required', message: serverConsentMessage } },
      ]);
      await page.goto(`/${v.dir}/abonnement.html`);
      await tickAll(page);
      const msg = page.locator('#billingMessage');
      const pay = page.locator('#subscribeButton');

      await pay.click();
      await expect(msg).toHaveText(tr(dict, 'pricing_page.checkout_market_not_configured'));
      await expect(msg).toHaveClass(/error/);
      await expect(pay).toBeEnabled();

      await pay.click();
      await expect(msg).toHaveText(serverConsentMessage);
      await expect(msg).toHaveClass(/error/);
      expect(supa.callsTo('create-checkout-session')).toHaveLength(2);
      await expect(page).toHaveURL(new RegExp(`/${v.dir}/abonnement\\.html$`));
    });

    test('Pro simule : aucun second paiement propose', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('pro');
      await page.goto(`/${v.dir}/abonnement.html`);
      const pay = page.locator('#subscribeButton');
      await expect(pay).toHaveText(tr(dict, 'pricing_page.cta_pro_member'));
      await expect(page.locator('#checkoutConsent')).toBeHidden();
      await pay.click();
      await expect(page).toHaveURL(new RegExp(`/${v.dir}/$`));
      expect(supa.callsTo('create-checkout-session')).toHaveLength(0);
    });
  });
}
