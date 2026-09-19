'use strict';
// Rejoue /en/ avec la bascule USD (config/markets.json#_usdSwitch) appliquee,
// SANS la publier : lib/market-config.js et i18n/i18n.js servis au navigateur
// recoivent les donnees que scripts/build-locales.js ecrirait apres la bascule
// (memes fonctions : marketRuntimeData, syncI18nDirMarkets). Tout le reste
// (pages, scripts de page, Supabase simule) est inchange. Le HTML statique
// garde ses prix EUR : c'est le runtime (lib/market-config.js#apply, selecteur
// de duree, panneau Pro, compte) qui est teste ici ; le HTML genere apres la
// bascule est verifie par tests/usd-switch.test.js (build complet en memoire).
//
// scripts/build-locales.js est execute dans un processus node a part : le
// chargeur de Playwright (Babel, mode strict) refuse ses doubles declarations
// de fonctions, que node accepte.
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const DATA_BLOCK = /\/\*IASHARK_MARKETS_DATA_START\*\/[\s\S]*?\/\*IASHARK_MARKETS_DATA_END\*\//;

let cache = null;
function switched() {
  if (cache) return cache;
  const script = [
    'const { applyUsdSwitch } = require(' + JSON.stringify(path.join(ROOT, 'tests/helpers/usd-switch.js')) + ');',
    'const b = require(' + JSON.stringify(path.join(ROOT, 'scripts/build-locales.js')) + ');',
    'const cfg = applyUsdSwitch();',
    'const w = { location: { pathname: "/en/" } };',
    'new Function("window", require("fs").readFileSync(' + JSON.stringify(path.join(ROOT, 'lib/market-config.js')) + ', "utf8"))(w);',
    'const us = cfg[cfg._dirs.en.market];',
    'process.stdout.write(JSON.stringify({ data: b.marketRuntimeData(cfg), dirs: cfg._dirs,',
    '  enMonthly: w.IasharkMarketConfig.formatAmount(us.prices.pro.month.amount, us.currency, us.priceIntlLocale) }));',
  ].join('\n');
  cache = JSON.parse(execFileSync(process.execPath, ['-e', script], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }));
  return cache;
}

// Meme regle que scripts/build-locales.js#syncI18nDirMarkets (champ market de
// chaque ligne DIRS de i18n/i18n.js).
function rewriteI18n(src, dirs) {
  for (const d of Object.keys(dirs)) {
    const re = new RegExp('(\\{dir:"' + d + '",[^}\\n]*?\\bmarket:")[a-z]+(")');
    if (!re.test(src)) throw new Error('i18n/i18n.js : ligne DIRS du repertoire ' + d + ' introuvable');
    src = src.replace(re, (m, a, b) => a + dirs[d].market + b);
  }
  return src;
}

async function serveRewritten(page, pattern, rewrite) {
  await page.route(pattern, async (route) => {
    const res = await route.fetch();
    const body = rewrite(await res.text());
    await route.fulfill({ status: res.status(), headers: Object.assign({}, res.headers(), { 'content-type': 'application/javascript; charset=utf-8' }), body });
  });
}

async function useUsdSwitch(page) {
  const s = switched();
  await serveRewritten(page, /\/lib\/market-config\.js(\?.*)?$/, (src) => {
    if (!DATA_BLOCK.test(src)) throw new Error('lib/market-config.js : bloc de donnees introuvable');
    return src.replace(DATA_BLOCK, () => '/*IASHARK_MARKETS_DATA_START*/\n  var DATA = ' + JSON.stringify(s.data, null, 2) + ';\n  /*IASHARK_MARKETS_DATA_END*/');
  });
  await serveRewritten(page, /\/i18n\/i18n\.js(\?.*)?$/, (src) => rewriteI18n(src, s.dirs));
}

// Prix mensuel de /en/ apres la bascule, formate depuis la config par la
// fonction du site (lib/market-config.js#formatAmount), jamais ecrit en dur.
function switchedEnMonthly() { return switched().enMonthly; }

module.exports = { useUsdSwitch, switchedEnMonthly };
