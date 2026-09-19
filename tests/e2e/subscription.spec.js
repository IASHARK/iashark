'use strict';
// Page abonnement : consentement par regime, bouton de paiement, appel
// create-checkout-session (simule), redirection Stripe (interceptee).
const { test, expect, expectNoHorizontalScroll } = require('./helpers/fixtures');
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
const squash = (s) => normalizeSpaces(s).replace(/\s+/g, ' ');
// « Ce que Pro donne » (19/09/2026) : memes cles que le mur Pro de la page
// match (match_page.pro_gate_item_*) et textes pro_offer.* partages.
const MATCH_KEYS = ['pro_gate_item_bet', 'pro_gate_item_scorer', 'pro_gate_item_scenario', 'pro_gate_item_scores', 'pro_gate_item_odds', 'pro_gate_item_stats', 'pro_gate_item_faq'];
const LIST_KEYS = MATCH_KEYS.map((k) => 'match_page.' + k).concat(['daily_all_matches', 'daily_scorers', 'tool_scanner', 'tool_journal', 'tool_combo'].map((k) => 'pro_offer.' + k));
// Durees affichees = durees PAYABLES : vendues sur ce marche et ouvertes par
// config/markets.json#checkoutOpen (le serveur simule les ouvre toutes).
const shownOf = (v) => ['week', 'month', 'year'].filter((iv) => typeof v.proAmounts[iv] === 'number' && (!Array.isArray(v.checkoutOpen) || v.checkoutOpen.includes(iv)));
// Marche ouvert au paiement ? gb, mx, za : checkoutOpen = [] depuis le
// 19/09/2026 (« cache-le » : aucun Price Stripe) -> ni bouton ni consentement.
const payable = (v) => shownOf(v).length > 0;
const CLOSED_SKIP = (v) => `/${v.dir}/ pas encore ouvert au paiement (config/markets.json#checkoutOpen = [])`;
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
    test('prix Pro et devise du marche de la version @mobile', async ({ page, consoleErrors, dictFor }) => {
      expect(v.configCurrency, `config/markets.json : /${v.dir}/ n'est pas facture en ${v.currency}`).toBe(v.currency);
      expect(typeof v.proAmount, `config/markets.json : aucun prix Pro pour /${v.dir}/`).toBe('number');
      await page.goto(`/${v.dir}/abonnement.html`);
      // Selecteur de duree : une option par duree PAYABLE sur ce marche
      // (config/markets.json ; l'annuel ZA est volontairement ferme, jamais un
      // prix invente ; une duree pas encore payable n'est pas affichee du tout,
      // 19/09/2026). Plusieurs : "Mois" coche par defaut et « meme acces Pro » ;
      // une seule : son prix seul, sans bouton radio. Memes donnees sur mobile
      // et desktop (@mobile).
      const sold = ['week', 'month', 'year'].filter((iv) => typeof v.proAmounts[iv] === 'number');
      const shown = shownOf(v);
      const radios = page.locator('#proPlanPicker input[type="radio"]');
      await expect(page.locator('#proPlanPicker [data-interval]')).toHaveCount(shown.length);
      if (shown.length === 0) {
        // Marche pas encore ouvert : « paiement pas encore ouvert », ni prix,
        // ni consentement, ni bouton qui echouerait a chaque fois.
        const dict = await dictFor(v.locale);
        await expect(page.locator('#proPlanPicker .iash-plans-closed')).toHaveText(tr(dict, 'pro_plans.closed'));
        await expect(page.locator('#proPlanPicker [data-market-price]')).toHaveCount(0);
        await expect(page.locator('#subscribeButton')).toBeHidden();
        await expect(page.locator('#checkoutConsent')).toBeHidden();
        await expect(page.locator('#proCommitment')).toBeHidden();
        await expect(page.locator('.pro-list-card li')).toHaveCount(LIST_KEYS.length);
      } else if (shown.length > 1) {
        await expect(radios).toHaveCount(shown.length);
        await expect(page.locator('#proPlanPicker input[value="month"]')).toBeChecked();
        await expect(page.locator('#proCommitment')).toBeVisible();
      } else {
        await expect(page.locator('#proPlanPicker .iash-plans-single')).toHaveAttribute('data-interval', 'month');
        await expect(radios).toHaveCount(0);
        await expect(page.locator('#proCommitment')).toBeHidden();
      }
      for (const iv of sold.filter((x) => !shown.includes(x))) await expect(page.locator(`#proPlanPicker [data-market-price="pro.${iv}"]`), `${iv} pas encore payable : masque`).toHaveCount(0);
      await expect(page.locator('#proPlanPicker .is-soon')).toHaveCount(0);
      const market = await page.evaluate(() => {
        const M = window.IASHARK_MARKET;
        const o = M && M.proOffer ? M.proOffer() : null;
        return M ? { dir: M.dir, currency: M.currency, checkoutMarket: M.checkoutMarket, amounts: o ? Object.fromEntries(o.intervals.map((i) => [i.interval, i.amount])) : null } : null;
      });
      expect(market, 'window.IASHARK_MARKET absent (lib/market-config.js non charge)').not.toBeNull();
      expect(market).toEqual({ dir: v.dir, currency: v.currency, checkoutMarket: v.checkoutMarket, amounts: v.proAmounts });

      const others = Object.keys(CURRENCY_PATTERNS).filter((c) => c !== v.currency);
      for (const iv of shown) {
        const price = page.locator(`#proPlanPicker [data-market-price="pro.${iv}"]`);
        await expect(price).toBeVisible();
        const t = normalizeSpaces(await price.innerText());
        expect(t, `prix ${iv} "${t}" : montant ${v.proAmounts[iv]} attendu`).toMatch(new RegExp(amountPattern(v.proAmounts[iv])));
        expect(t, `prix ${iv} "${t}" : symbole ${CURRENCY_SYMBOLS[v.currency]} attendu`).toMatch(CURRENCY_PATTERNS[v.currency]);
        for (const c of others) expect(t, `prix ${iv} "${t}" : devise d'un autre marche (${c})`).not.toMatch(CURRENCY_PATTERNS[c]);
      }
      // Economie de l'annuel : calculee (arrondi inferieur), jamais inventee ;
      // aucune mention d'economie quand l'annuel n'est pas vendu.
      if (shown.includes('year')) {
        const expectedPct = Math.floor((1 - v.proAmounts.year / (12 * v.proAmounts.month)) * 100 + 1e-9);
        await expect(page.locator('#proPlanPicker .iash-plan-save')).toContainText(String(expectedPct));
      } else {
        await expect(page.locator('#proPlanPicker .iash-plan-save')).toHaveCount(0);
        await expect(page.locator('#proPlanPicker input[value="year"]')).toHaveCount(0);
      }
      await expect(page.locator('body')).not.toContainText(/\bEdge\b/);
      // Le titre de la page ne doit jamais annoncer le prix d'un autre marche.
      const title = normalizeSpaces(await page.title());
      for (const c of others) expect(title, `<title> "${title}" cite un prix en ${c}`).not.toMatch(CURRENCY_PATTERNS[c]);
      await page.waitForLoadState('networkidle').catch(() => {});
      expect(consoleErrors).toEqual([]);
    });

    test('cases de consentement du regime, bouton verrouille tant qu\'elles ne sont pas cochees @mobile', async ({ page, consoleErrors }) => {
      test.skip(!payable(v), CLOSED_SKIP(v));
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

      // Anonyme avec consentement : inscription directe de la version (un
      // visiteur qui clique « Devenir Pro » n'a presque jamais de compte), avec
      // retour sur cette page - jamais le detour compte -> connexion -> « Mon compte ».
      await pay.click();
      await expect(page).toHaveURL(new RegExp(`/${v.dir}/inscription\\.html\\?next=`));
      expect(new URL(page.url()).searchParams.get('next')).toBe(`/${v.dir}/abonnement.html`);
      expect(consoleErrors).toEqual([]);
    });

    test('compte gratuit : le paiement envoie market, dir et consent puis ouvre Stripe (simule)', async ({ page, supa }) => {
      test.skip(!payable(v), CLOSED_SKIP(v));
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
      test.skip(typeof v.proAmounts.year !== 'number', `annuel non vendu sur /${v.dir}/ (config/markets.json)`);
      test.skip(Array.isArray(v.checkoutOpen) && !v.checkoutOpen.includes('year'), `annuel pas encore payable en ligne sur /${v.dir}/ (checkoutOpen)`);
      await supa.as('free');
      supa.onFunction('create-checkout-session', { status: 200, json: { processed: true, url: STRIPE_CHECKOUT_URL } });
      await page.goto(`/${v.dir}/abonnement.html`);
      await page.locator('#proPlanPicker input[value="year"]').check();
      await tickAll(page);
      const call = supa.waitForCall('create-checkout-session');
      await page.locator('#subscribeButton').click();
      expect((await call).body.interval).toBe('year');
    });

    // 19/09/2026 : une duree que le serveur declare fermee (Price Stripe absent)
    // n'est plus affichee « bientot disponible » : elle disparait, et le
    // paiement n'envoie jamais qu'une duree payable.
    test('duree fermee par le serveur : masquee, jamais envoyee au paiement', async ({ page, supa }) => {
      test.skip(Array.isArray(v.checkoutOpen) && !v.checkoutOpen.includes('week'), `semaine deja fermee par la configuration sur /${v.dir}/ (test dedie ci-dessous)`);
      await supa.as('free');
      supa.availability({ week: false, month: true, year: true });
      supa.onFunction('create-checkout-session', { status: 200, json: { processed: true, url: STRIPE_CHECKOUT_URL } });
      await page.goto(`/${v.dir}/abonnement.html`);
      await expect(page.locator('#proPlanPicker [data-interval="week"]')).toHaveCount(0);
      await expect(page.locator('#proPlanPicker [data-market-price="pro.week"]')).toHaveCount(0);
      await expect(page.locator('#proPlanPicker [data-interval="month"]')).toHaveCount(1);
      await expect(page.locator('#proPlanPicker .is-soon')).toHaveCount(0);
      await tickAll(page);
      const call = supa.waitForCall('create-checkout-session');
      await page.locator('#subscribeButton').click();
      expect((await call).body.interval).toBe('month');
    });

    // Fonction de paiement redeployee dans un pays sans Price Stripe : toutes
    // les durees fermees. Ni selecteur vide, ni bouton mort : une ligne
    // « paiement pas encore ouvert, aucun montant preleve » ; la comparaison
    // et la liste Pro restent.
    test('aucune duree payable : ni bouton ni consentement, ligne « pas encore ouvert », offre toujours detaillee @mobile', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('free');
      supa.availability({ week: false, month: false, year: false });
      await page.goto(`/${v.dir}/abonnement.html`);
      await expect(page.locator('#proPlanPicker .iash-plans-closed')).toHaveText(tr(dict, 'pro_plans.closed'));
      await expect(page.locator('#proPlanPicker [data-market-price]')).toHaveCount(0);
      await expect(page.locator('#subscribeButton')).toBeHidden();
      await expect(page.locator('#checkoutConsent')).toBeHidden();
      await expect(page.locator('#proCommitment')).toBeHidden();
      await expect(page.locator('.pro-list-card li')).toHaveCount(LIST_KEYS.length);
      await expectNoHorizontalScroll(page);
      expect(supa.callsTo('create-checkout-session')).toHaveLength(0);
    });

    test('reponses d\'erreur : marche non ouvert et consentement refuse', async ({ page, supa, dictFor }) => {
      test.skip(!payable(v), CLOSED_SKIP(v));
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
    // Decision du 18/09/2026 : seule une duree payable en ligne peut etre
    // choisie. Decision du 19/09/2026 : les autres ne sont plus affichees
    // (« Bientot disponible » faisait hesiter) ; elles reapparaitront des que
    // config/markets.json#checkoutOpen les ouvrira.
    test('durees pas encore payables : absentes de la page, seule la duree ouverte est proposee et envoyee @mobile', async ({ page, supa }) => {
      test.skip(!Array.isArray(v.checkoutOpen), `toutes les durees ouvertes sur /${v.dir}/`);
      test.skip(!payable(v), CLOSED_SKIP(v));
      await supa.as('free');
      supa.onFunction('create-checkout-session', { status: 200, json: { processed: true, url: STRIPE_CHECKOUT_URL } });
      await page.goto(`/${v.dir}/abonnement.html`);
      const sold = ['week', 'month', 'year'].filter((iv) => typeof v.proAmounts[iv] === 'number');
      const closed = sold.filter((iv) => !v.checkoutOpen.includes(iv));
      await expect(page.locator('#proPlanPicker [data-interval]')).toHaveCount(sold.length - closed.length);
      for (const iv of closed) {
        await expect(page.locator(`#proPlanPicker [data-interval="${iv}"]`)).toHaveCount(0);
        await expect(page.locator(`#proPlanPicker [data-market-price="pro.${iv}"]`)).toHaveCount(0);
      }
      await expect(page.locator('#proPlanPicker .is-soon')).toHaveCount(0);
      if (v.checkoutOpen.length === 1) {
        await expect(page.locator('#proPlanPicker input[type="radio"]')).toHaveCount(0);
        await expect(page.locator('#proCommitment'), '« meme acces quelle que soit la duree » sans choix de duree').toBeHidden();
      }
      await tickAll(page);
      const call = supa.waitForCall('create-checkout-session');
      await page.locator('#subscribeButton').click();
      expect(v.checkoutOpen, 'duree envoyee au paiement').toContain((await call).body.interval);
    });

    // Ce que Pro donne, concretement (19/09/2026) : la liste complete en 3
    // groupes, dans la langue de la version ; a cote du prix sur ordinateur,
    // sous le bouton sur mobile. Plus de tableau « Gratuit ou Pro » (retire a
    // la demande du proprietaire).
    test('tout ce que Pro debloque, a cote du prix (ordinateur) ou sous le bouton (mobile), traduit, sans defilement horizontal @mobile', async ({ page, dictFor, consoleErrors }) => {
      const dict = await dictFor(v.locale);
      await page.goto(`/${v.dir}/abonnement.html`);
      await expect(page.locator('.pro-compare, table.cmp')).toHaveCount(0);
      const card = await page.locator('.pricing-card').boundingBox(), list = await page.locator('.pro-list-card').boundingBox();
      if (page.viewportSize().width > 760) {
        expect(list.x, 'liste a droite du prix').toBeGreaterThanOrEqual(card.x + card.width);
        expect(Math.abs(list.y - card.y), 'cartes alignees en haut').toBeLessThanOrEqual(2);
      } else {
        expect(list.y, 'liste sous la carte prix').toBeGreaterThanOrEqual(card.y + card.height);
      }
      const items = page.locator('.pro-list-card li');
      await expect(items).toHaveCount(LIST_KEYS.length);
      const texts = (await items.allTextContents()).map(squash);
      LIST_KEYS.forEach((k, i) => expect(texts[i], k).toContain(squash(tr(dict, k))));
      await expect(page.locator('.pro-list-card .tag-new')).toHaveText(tr(dict, 'pro_offer.badge_new'));
      await expect(page.locator('.pro-list-card h3')).toHaveText(['group_match', 'group_daily', 'group_tools'].map((k) => tr(dict, 'pro_offer.' + k)));
      await expect(page.locator('body')).not.toContainText(/pari (conseillé|recommandé)|recommended bet/i);
      await expectNoHorizontalScroll(page);
      await page.waitForLoadState('networkidle').catch(() => {});
      expect(consoleErrors).toEqual([]);
    });

    // Tunnel reel (analytics 09/2026) : match -> « Debloquer » -> abonnement.
    // Le match d'origine est nomme sur la page, suit l'inscription et est
    // memorise pour les pages de retour Stripe.
    test('venu d\'un match : contexte affiche, retour propage a l\'inscription et memorise pour Stripe @mobile', async ({ page, supa, siteData }) => {
      test.skip(!siteData.paid, 'Aucun match payant dans les donnees');
      const id = String(siteData.paid.id);
      const d = await siteData.detail(id);
      const matchPath = `/${v.dir}/match.html?id=${id}`;
      await page.goto(`/${v.dir}/abonnement.html?next=${encodeURIComponent(matchPath)}`);
      await expect(page.locator('#proContext')).toBeVisible();
      await expect(page.locator('#proContext b')).toHaveText(`${d.home.n} – ${d.away.n}`);
      if (!payable(v)) {
        // Marche pas encore ouvert : le contexte reste, aucun bouton de paiement.
        await expect(page.locator('#subscribeButton')).toBeHidden();
        return;
      }
      await tickAll(page);
      await page.locator('#subscribeButton').click();
      await expect(page).toHaveURL(new RegExp(`/${v.dir}/inscription\\.html\\?next=`));
      const next = new URL(page.url()).searchParams.get('next');
      expect(next).toMatch(new RegExp(`^/${v.dir}/abonnement\\.html\\?next=`));
      expect(new URL(next, 'http://e2e').searchParams.get('next'), 'le match suit l\'inscription').toBe(matchPath);

      // Compte gratuit : le depart vers Stripe memorise le match, et la page
      // d'annulation propose d'y revenir ou de reprendre le paiement.
      await supa.as('free');
      supa.onFunction('create-checkout-session', { status: 200, json: { processed: true, url: STRIPE_CHECKOUT_URL } });
      await page.goto(`/${v.dir}/abonnement.html?next=${encodeURIComponent(matchPath)}`);
      await tickAll(page);
      await page.locator('#subscribeButton').click();
      await page.waitForURL(STRIPE_CHECKOUT_URL);
      await page.goto(`/${v.dir}/checkout-annule.html`);
      await expect(page.locator('#ctaMatch')).toBeVisible();
      expect(await page.locator('#ctaMatch').getAttribute('href')).toBe(matchPath);
      const retry = await page.locator('#ctaRetry').getAttribute('href');
      expect(retry).toMatch(new RegExp(`^/${v.dir}/abonnement\\.html\\?next=`));
      expect(new URL(retry, 'http://e2e').searchParams.get('next')).toBe(matchPath);
      await expect(page.locator('#ctaAccount')).toBeHidden();
    });
  });
}
