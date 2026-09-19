'use strict';
// Pages legales (6 par version, methodologie comprise) et accueil du blog.
const { test, expect } = require('./helpers/fixtures');
const { VERSIONS, LEGAL_FILES } = require('./helpers/versions');

function htmlLang(html) {
  const m = /<html[^>]*\slang="([^"]+)"/i.exec(html);
  return m ? m[1] : null;
}

for (const v of VERSIONS) {
  test.describe(`legal et blog /${v.dir}/`, () => {
    test('6 pages legales (dont methodologie) en 200 avec la bonne langue', async ({ request }) => {
      for (const file of LEGAL_FILES) {
        const url = `/${v.dir}/${file}`;
        const r = await request.get(url, { maxRedirects: 0 });
        expect(r.status(), url).toBe(200);
        expect(htmlLang(await r.text()), `<html lang> de ${url}`).toBe(v.htmlLang);
      }
    });

    test('accueil du blog @mobile', async ({ page, consoleErrors }) => {
      const r = await page.goto(v.blogHub);
      expect(r.status()).toBe(200);
      const lang = await page.locator('html').getAttribute('lang');
      expect(lang, 'langue du blog').toMatch(new RegExp('^' + v.htmlLang.slice(0, 2)));
      const articles = page.locator('a[href*="/blog/"], a[href*="blog/guides/"]');
      expect(await articles.count(), 'aucun lien d\'article sur l\'accueil du blog').toBeGreaterThan(0);
      await page.waitForLoadState('networkidle').catch(() => {});
      expect(consoleErrors).toEqual([]);
    });
  });
}
