'use strict';
// Espace Pro (ancienne page Outils) : aucune donnee premium sans Pro ; resultats
// reels pour un Pro simule. Depuis la V3 du 3/10/2026, le tableau de bord est le
// premier onglet : le detecteur d'ecarts s'ouvre par l'ancre #scanner.
const { test, expect, pathOf } = require('./helpers/fixtures');
const { VERSIONS } = require('./helpers/versions');
const { tr } = require('./helpers/site-data');

async function realTeamNames(siteData) {
  return siteData.matchs.filter((m) => m && m.is_free !== true).slice(0, 25).flatMap((m) => [m.home && m.home.n, m.away && m.away.n]).filter((n) => n && n.length > 3);
}

for (const v of VERSIONS) {
  test.describe(`outils /${v.dir}/`, () => {
    for (const persona of ['anonymous', 'free']) {
      test(`${persona === 'free' ? 'compte gratuit' : 'anonyme'} : demonstration uniquement, aucune donnee de match`, async ({ page, supa, siteData, dictFor, baseURL }) => {
        const dict = await dictFor(v.locale);
        if (persona === 'free') await supa.as('free');
        await page.goto(`/${v.dir}/pro.html#scanner`);
        const panel = page.locator('[data-panel="scanner"]');
        await expect(panel).toContainText(tr(dict, 'tools_page.scan_demo_text'));
        const cta = panel.locator(`a[href$="abonnement.html"]`).first();
        expect(pathOf(await cta.getAttribute('href'), baseURL)).toBe(`/${v.dir}/abonnement.html`);
        await page.waitForLoadState('networkidle').catch(() => {});
        expect(supa.callsTo('match-data'), 'match-data appele sans abonnement').toHaveLength(0);
        const text = await page.locator('main').innerText();
        for (const name of await realTeamNames(siteData)) expect(text, `nom d'equipe reel "${name}" affiche sans abonnement`).not.toContain(name);
        const state = await page.evaluate(() => window.__iasharkToolsState);
        expect(state).toBeNull();
      });
    }

    // Journal (bloc « Mes paris » du tableau de bord depuis la V3 du 3/10/2026 ;
    // l'ancienne ancre #journal y mene) : la base exige estimated_probability
    // (0010), deduite de la cote par le formulaire.
    test('Pro simule : « Mes paris » enregistre un pari avec sa probabilite estimee', async ({ page, supa }) => {
      await supa.as('pro');
      await page.goto(`/${v.dir}/pro.html#journal`);
      const add = page.locator('#noterPari').first();
      await expect(add).toBeVisible();
      await add.click();
      await page.locator('#fpMatch').fill('PSG – Marseille');
      await page.locator('#fpPari').fill('Plus de 2,5 buts');
      await page.locator('#fpCote').fill('2,5');
      await page.locator('#fpMise').fill('10');
      await page.locator('#fpSave').click();
      await expect(page.locator('#dlgPari')).not.toBeVisible();
      const insert = supa.calls.find((c) => c.kind === 'rest' && c.method === 'POST' && /betting_decisions/.test(c.path));
      expect(insert, 'insertion dans betting_decisions').toBeTruthy();
      const row = Array.isArray(insert.body) ? insert.body[0] : insert.body;
      expect(row).toMatchObject({ match_label: 'PSG – Marseille', market: 'Plus de 2,5 buts', odds: 2.5, stake: 10, estimated_probability: 40, source: 'site' });
      await expect(page.locator('body')).not.toContainText('violates not-null');
    });

    // Tableau de bord gratuit : aucun contenu Pro demande (programme, paris
    // publies, tickets Telegram : contrat 0040) ; les blocs Pro ne sont qu'un
    // apercu fictif, et le programme n'est annonce qu'en France.
    test('compte gratuit : le tableau de bord ne demande aucun contenu Pro', async ({ page, supa }) => {
      await supa.as('free');
      await page.goto(`/${v.dir}/pro.html`);
      await expect(page.locator('#bGardeFou')).toBeVisible();
      await page.waitForLoadState('networkidle').catch(() => {});
      const pro = supa.calls.filter((c) => c.kind === 'rest' && /pro_programmes|pro_paris|pro_tickets|preferences_pro|contenus_pro|alertes_pro/.test(c.path));
      expect(supa.calls.some((c) => c.kind === 'rest' && /betting_decisions/.test(c.path)), 'le journal gratuit est bien lu').toBe(true);
      expect(pro, 'contenu Pro (ou ancienne table) demande par un compte gratuit').toHaveLength(0);
      expect(supa.callsTo('match-data'), 'match-data appele sans abonnement').toHaveLength(0);
      // Hors de France (gb, za, mx) : ni apercu du programme, ni nom de bookmaker francais.
      if (['gb', 'za', 'mx'].includes(v.dir)) {
        await expect(page.locator('#bAujourdhui')).toHaveCount(0);
        const texte = await page.locator('#panel-tableau').innerText();
        for (const nom of ['Betclic', 'NetBet', 'PMU', 'Unibet', 'Winamax']) expect(texte, `${nom} affiche sur /${v.dir}/`).not.toContain(nom);
      } else if (v.dir === 'fr') {
        await expect(page.locator('#bAujourdhui')).toBeVisible();
      }
    });

    test('Pro simule : le scanner affiche les marches reels', async ({ page, supa, siteData, dictFor }) => {
      const dict = await dictFor(v.locale);
      await supa.as('pro');
      // Attente creee AVANT la navigation : l'appel peut partir avant la fin de
      // page.goto() (scripts defer + pre-chargement), l'attente ne doit pas le rater.
      const pending = supa.waitForCall('match-data');
      await page.goto(`/${v.dir}/pro.html#scanner`);
      const call = await pending;
      expect(call.body).toEqual({ scope: 'list' });
      const rows = page.locator('#scanBox li');
      await expect(rows.first()).toBeVisible();
      await expect(page.locator('[data-panel="scanner"]')).not.toContainText(tr(dict, 'tools_page.scan_demo_text'));
      const first = await rows.first().innerText();
      const names = siteData.matchs.flatMap((m) => [m.home && m.home.n, m.away && m.away.n]).filter(Boolean);
      expect(names.some((n) => first.includes(n)), `ligne du scanner sans equipe reelle : ${first}`).toBe(true);
      await expect(rows.first().locator(`a[href^="/${v.dir}/match.html?id="]`)).toHaveCount(1);
    });
  });
}
