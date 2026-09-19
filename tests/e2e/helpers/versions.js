'use strict';
// Les 9 versions publiques du site (config/markets.json#_dirs). Une ligne par
// repertoire : ce que chaque scenario E2E attend de cette version.
//
// Prix : jamais recopies ici. Les montants Pro (semaine, mois, annee) sont lus dans
// config/markets.json (source de verite GEO : pays/devise/prix) ; seule la
// devise attendue par version est ecrite en dur, pour qu'un repertoire branche
// sur le mauvais marche (ex. /gb/ en EUR) fasse echouer la suite.
//
// E2E_VERSIONS=gb,fr limite l'execution a certaines versions (debug local).
const MARKETS = require('../../../config/markets.json');
// /en/ : deux etats admis, et deux seulement - marche EUR "fr" (avant la
// bascule) ou marche "us" en USD (config/markets.json#_usdSwitch applique).
// Tout autre marche pour /en/ fait echouer la suite.
const EN_USD = MARKETS._dirs.en.market === 'us';

const BASE_VERSIONS = [
  { dir: 'fr', htmlLang: 'fr', locale: 'fr', regime: 'eu', currency: 'EUR', checkoutMarket: null, blogHub: '/blog.html', helpline: 'joueurs-info-service.fr', timezone: 'Europe/Paris' },
  { dir: 'gb', htmlLang: 'en-GB', locale: 'en', regime: 'uk', currency: 'GBP', checkoutMarket: 'gb', blogHub: '/en/blog/', helpline: 'gamcare.org.uk', timezone: 'Europe/London' },
  { dir: 'za', htmlLang: 'en-ZA', locale: 'en', regime: 'za', currency: 'ZAR', checkoutMarket: 'za', blogHub: '/en/blog/', helpline: 'responsiblegambling.org.za', timezone: 'Africa/Johannesburg' },
  { dir: 'en', htmlLang: 'en', locale: 'en', regime: 'eu', currency: EN_USD ? 'USD' : 'EUR', checkoutMarket: EN_USD ? 'us' : null, blogHub: '/en/blog/', helpline: 'gamblingtherapy.org', timezone: 'Europe/Berlin' },
  { dir: 'mx', htmlLang: 'es-MX', locale: 'es-mx', regime: 'mx', currency: 'MXN', checkoutMarket: 'mx', blogHub: '/mx/blog/', helpline: 'gob.mx', timezone: 'America/Mexico_City' },
  { dir: 'es', htmlLang: 'es', locale: 'es', regime: 'eu', currency: 'EUR', checkoutMarket: null, blogHub: '/es/blog/', helpline: 'gamblingtherapy.org', timezone: 'Europe/Madrid' },
  { dir: 'de', htmlLang: 'de', locale: 'de', regime: 'eu', currency: 'EUR', checkoutMarket: null, blogHub: '/de/blog/', helpline: 'gamblingtherapy.org', timezone: 'Europe/Berlin' },
  { dir: 'it', htmlLang: 'it', locale: 'it', regime: 'eu', currency: 'EUR', checkoutMarket: null, blogHub: '/it/blog/', helpline: 'gamblingtherapy.org', timezone: 'Europe/Rome' },
  { dir: 'pt', htmlLang: 'pt', locale: 'pt', regime: 'eu', currency: 'EUR', checkoutMarket: null, blogHub: '/pt/blog/', helpline: 'gamblingtherapy.org', timezone: 'Europe/Lisbon' },
];

// Symbole affiche par devise (lib/market-config.js formatAmount : MXN -> "MX$" ;
// USD de /en/ formate en en-US -> "$").
const CURRENCY_SYMBOLS = { EUR: '€', GBP: '£', ZAR: 'R', MXN: 'MX$', USD: '$' };

// Marche (config/markets.json) d'une version, et devise facturee pour un
// champ `market` envoye a create-checkout-session (absent = marche EUR par defaut).
function marketOfDir(dir) {
  const d = MARKETS._dirs && MARKETS._dirs[dir];
  if (!d || !MARKETS[d.market]) throw new Error('config/markets.json : repertoire ' + dir + ' sans marche');
  return MARKETS[d.market];
}
function currencyOfCheckoutMarket(market) {
  const key = market || Object.keys(MARKETS).find((k) => !k.startsWith('_') && MARKETS[k].checkoutMarket == null);
  return MARKETS[key] ? MARKETS[key].currency : null;
}

const ALL_VERSIONS = BASE_VERSIONS.map((v) => {
  const m = marketOfDir(v.dir);
  const pro = (m.prices && m.prices.pro) || {};
  const amount = (iv) => (pro[iv] && typeof pro[iv].amount === 'number' ? pro[iv].amount : null);
  return Object.assign({}, v, {
    configCurrency: m.currency,
    // proAmount = mensuel (duree cochee par defaut) ; proAmounts = les 3 durees.
    proAmount: amount('month'),
    proAmounts: { week: amount('week'), month: amount('month'), year: amount('year') },
    // Durees payables en ligne (config/markets.json#<marche>.checkoutOpen) ;
    // null = toutes les durees vendues.
    checkoutOpen: Array.isArray(m.checkoutOpen) ? m.checkoutOpen.slice() : null,
    currencySymbol: CURRENCY_SYMBOLS[v.currency],
  });
});

// Nombre de cases de consentement obligatoires par regime (lib/checkout-consent.js).
// Une seule case depuis le 19/09/2026 (CGV + demande de debut immediat dans la
// meme case pour eu/uk/za ; lib/checkout-consent.js#buildHtml).
const CONSENT_BOXES = { eu: 1, uk: 1, za: 1, mx: 1 };

// Pages legales generees dans chaque repertoire (config/markets.json#_legalFiles).
// methodologie.html existe dans les 9 repertoires depuis le 19/09/2026.
const LEGAL_FILES = ['mentions-legales.html', 'cgv.html', 'confidentialite.html', 'cookies.html', 'jeu-responsable.html', 'methodologie.html'];

const ALL_DIRS = ALL_VERSIONS.map((v) => v.dir);

const only = String(process.env.E2E_VERSIONS || '').split(',').map((s) => s.trim()).filter(Boolean);
const VERSIONS = only.length ? ALL_VERSIONS.filter((v) => only.includes(v.dir)) : ALL_VERSIONS;

module.exports = { VERSIONS, ALL_VERSIONS, ALL_DIRS, CONSENT_BOXES, LEGAL_FILES, CURRENCY_SYMBOLS, currencyOfCheckoutMarket };
