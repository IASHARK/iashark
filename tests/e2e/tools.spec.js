'use strict';
// Page Pro : page de vente sans Pro (21/10/2026), aucune donnee premium ; outils reels pour un Pro simule.
const { test, expect, pathOf } = require('./helpers/fixtures');
const { VERSIONS } = require('./helpers/versions');
const { tr } = require('./helpers/site-data');

async function realTeamNames(siteData) {
  return siteData.matchs.filter((m) => m && m.is_free !== true).slice(0, 25).flatMap((m) => [m.home && m.home.n, m.away && m.away.n]).filter((n) => n && n.length > 3);
}

for (const v of VERSIONS) {
  test.describe(`outils /${v.dir}/`, () => {
    for (const persona of ['anonymous', 'free']) {
      test(`${persona === 'free' ? 'compte gratuit' : 'anonyme'} : page de vente, aucun outil, aucune donnee de match`, async ({ page, supa, siteData, dictFor, baseURL }) => {
        const dict = await dictFor(v.locale);
        if (persona === 'free') await supa.as('free');
        await page.goto(`/${v.dir}/pro.html`);
        await expect(page.locator('#proVente h1')).toContainText(tr(dict, 'pro_vente.hero_title_pre'));
        await expect(page.locator('#proOutils')).toBeHidden();
        const exemple = page.locator('#proVente a[data-track="pro_vente_exemple"]');
        expect(pathOf(await exemple.getAttribute('href'), baseURL)).toBe(`/${v.dir}/exemple-analyse.html`);
        // Le composant de paiement unique est monte (ou sa ligne « pas encore ouvert »).
        await expect(page.locator('#offrePro .op-title')).toHaveText(tr(dict, 'offre_pro.title_general'));
        await page.waitForLoadState('networkidle').catch(() => {});
        expect(supa.callsTo('match-data'), 'match-data appele sans abonnement').toHaveLength(0);
        const text = await page.locator('main').innerText();
        for (const name of await realTeamNames(siteData)) expect(text, `nom d'equipe reel "${name}" affiche sans abonnement`).not.toContain(name);
        const state = await page.evaluate(() => window.__iasharkToolsState);
        expect(state).toBeNull();
      });
    }

    // Journal Pro (fonction vendue) : la base exige estimated_probability (0010).
    // Avant le 18/09/2026, le formulaire ne l'envoyait pas : chaque enregistrement
    // echouait avec l'erreur brute de la base, en anglais.
    // 21/10/2026 (regle de Clement : ni mise, ni ROI, ni profit/perte) : plus de champ
    // Mise. La colonne stake reste obligatoire en base : valeur technique fixe (1),
    // jamais saisie ni affichee.
    test('Pro simule : le journal enregistre une decision avec sa probabilite estimee, sans mise', async ({ page, supa, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('pro');
      await page.goto(`/${v.dir}/pro.html#journal`);
      const add = page.locator('#jrAdd').first();
      await expect(add).toBeVisible();
      await add.click();
      await expect(page.locator('#jrProb')).toHaveValue('52.6');
      await page.locator('#jrOdds').fill('2.5');
      await expect(page.locator('#jrProb'), 'suit la cote tant qu\'elle n\'est pas modifiee').toHaveValue('40');
      await page.locator('#jrMatch').fill('PSG – Marseille');
      await page.locator('#jrMarket').fill('Plus de 2,5 buts');
      await expect(page.locator('#jrStake'), 'plus de champ Mise').toHaveCount(0);
      await page.locator('#jrSave').click();
      await expect(page.locator('#jrDlg')).not.toBeVisible();
      const insert = supa.calls.find((c) => c.kind === 'rest' && c.method === 'POST' && /betting_decisions/.test(c.path));
      expect(insert, 'insertion dans betting_decisions').toBeTruthy();
      const row = Array.isArray(insert.body) ? insert.body[0] : insert.body;
      expect(row).toMatchObject({ match_label: 'PSG – Marseille', market: 'Plus de 2,5 buts', odds: 2.5, stake: 1, estimated_probability: 40 });
      await expect(page.locator('body')).not.toContainText('violates not-null');
      // La decision s'affiche avec son statut, sans montant ni ROI.
      await expect(page.locator('#panel-journal li').first()).toContainText(tr(dict, 'tools_page.journal_status_pending'));
      await expect(page.locator('#panel-journal')).not.toContainText(/\bROI\b|P\/L/);
      expect(tr(dict, 'tools_page.journal_save_error')).toBeTruthy();
    });

    test('Pro simule : le scanner affiche les marches reels', async ({ page, supa, siteData, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('pro');
      // Attente creee AVANT la navigation : l'appel peut partir avant la fin de
      // page.goto() (scripts defer + pre-chargement), l'attente ne doit pas le rater.
      const pending = supa.waitForCall('match-data');
      await page.goto(`/${v.dir}/pro.html`);
      const call = await pending;
      expect(call.body).toEqual({ scope: 'list' });
      const rows = page.locator('#scanBox li');
      await expect(rows.first()).toBeVisible();
      await expect(page.locator('#proVente')).toBeHidden();
      const first = await rows.first().innerText();
      const names = siteData.matchs.flatMap((m) => [m.home && m.home.n, m.away && m.away.n]).filter(Boolean);
      expect(names.some((n) => first.includes(n)), `ligne du scanner sans equipe reelle : ${first}`).toBe(true);
      await expect(rows.first().locator(`a[href^="/${v.dir}/match.html?id="]`)).toHaveCount(1);
    });
  });
}
