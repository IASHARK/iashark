// @ts-check
'use strict';
// Suite E2E IASHARK (tests/e2e/). Voir tests/e2e/README.md.
//
//   npx playwright test                                   -> dist/ local (serveur statique demarre ici)
//   E2E_BASE_URL=https://iashark.com npx playwright test  -> production (redirections, fuites de donnees)
//
// Supabase, Stripe et les analytics sont TOUJOURS simules (tests/e2e/helpers/supabase-mock.js) :
// aucun compte reel, aucun paiement reel, dans les deux modes.
const { defineConfig, devices } = require('@playwright/test');

const PORT = Number(process.env.E2E_PORT || 4173);
const PROD_URL = process.env.E2E_BASE_URL ? process.env.E2E_BASE_URL.replace(/\/$/, '') : '';
const BASE_URL = PROD_URL || 'http://127.0.0.1:' + PORT;
const CI = !!process.env.CI;
const OUT = 'tests/e2e/output';

// Mobile : Chromium 375x812 par defaut (seul navigateur installe en CI) ;
// E2E_MOBILE_BROWSER=webkit pour rejouer les memes scenarios sur iPhone 13 / WebKit.
const mobile = process.env.E2E_MOBILE_BROWSER === 'webkit'
  ? { ...devices['iPhone 13'] }
  : { browserName: 'chromium', viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: devices['iPhone 13'].userAgent };

module.exports = defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.js',
  outputDir: OUT + '/artifacts',
  timeout: 60000,
  expect: { timeout: 12000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 4 : undefined,
  reporter: CI
    ? [['github'], ['list'], ['html', { outputFolder: OUT + '/report', open: 'never' }], ['json', { outputFile: OUT + '/results.json' }]]
    : [['list'], ['html', { outputFolder: OUT + '/report', open: 'never' }], ['json', { outputFile: OUT + '/results.json' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    navigationTimeout: 30000,
    actionTimeout: 15000,
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'desktop-chromium', use: { browserName: 'chromium', viewport: { width: 1366, height: 900 } } },
    // Le mobile rejoue uniquement les scenarios marques @mobile (mise en page,
    // navigation basse, boutons atteignables) : meme contenu, autre presentation.
    { name: 'mobile', grep: /@mobile/, use: mobile },
  ],
  webServer: PROD_URL ? undefined : {
    command: 'node tests/e2e/helpers/static-server.js',
    url: BASE_URL + '/fr/',
    reuseExistingServer: !CI,
    timeout: 30000,
    env: { E2E_PORT: String(PORT) },
  },
});
