'use strict';
// Donnees de match utilisees par les tests : TOUJOURS les vraies formes de
// donnees du site (data-home.json, match/<id>.json), jamais un modele invente.
//
// - Mode local (dist/) : les fichiers de dist/ sont lus puis leurs dates sont
//   decalees pour que le match offert (is_free) tombe aujourd'hui (heure de
//   Paris). Sans ce decalage, un dist/ construit la veille n'affiche plus
//   aucune carte "Aujourd'hui/Demain" et les tests deviendraient dependants
//   de la date du jour. Les pages recoivent ces fichiers decales via
//   page.route (voir fixtures.js).
// - Mode production (E2E_BASE_URL) : donnees live, non modifiees.
//
// Les champs premium ajoutes pour simuler la reponse de la fonction Edge
// match-data a un abonne Pro sont copies du match offert (seul match publie
// en clair avec ces champs) : memes cles, memes types que la production.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const DIST = path.resolve(process.env.E2E_DIST || path.join(ROOT, 'dist'));
const IS_PROD = !!process.env.E2E_BASE_URL;

// Liste de reference des champs premium : lib/premium-fields.js (liste unique
// du depot, partagee avec le pipeline et la fonction match-data). Pas de copie
// locale : si le module disparait, la suite doit echouer, pas tester moins.
const PREMIUM = require(path.join(ROOT, 'lib', 'premium-fields.js'));
const PREMIUM_FIELDS = PREMIUM.PREMIUM_FIELDS;

// Champs premium de premier niveau d'un match non offert.
function premiumLeaks(m) { return PREMIUM.premiumLeaks(m); }
// Champs premium a toute profondeur (fichier entier ou match isole).
function deepPremiumLeaks(value, basePath) { return PREMIUM.deepPremiumLeaks(value, basePath); }

function parisDay(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date || new Date());
}
function dayDiff(fromDay, toDay) {
  const a = Date.UTC(+fromDay.slice(0, 4), +fromDay.slice(5, 7) - 1, +fromDay.slice(8, 10));
  const b = Date.UTC(+toDay.slice(0, 4), +toDay.slice(5, 7) - 1, +toDay.slice(8, 10));
  return Math.round((b - a) / 86400000);
}
function shiftDateString(value, days) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(String(value || ''));
  if (!m || !days) return value;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + days));
  return d.toISOString().slice(0, 10) + m[4];
}
function shiftMatch(m, days) {
  if (!m || !days) return m;
  return Object.assign({}, m, { date: shiftDateString(m.date, days) });
}

const PREMIUM_TEMPLATE_FALLBACK = {
  pari_rec: 'Under 3.5', cote_rec: 1.62, model_probability: 66.1, conf: 6.6, market_id: 'under-35', marche: 'TOTAL_BUTS',
  markets_compared: [{ id: 'under-35', market: 'Under 3.5', probability: 71.2, consensus: 61.7, edge: 9.5 }],
};

async function fetchJson(url) {
  const r = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (!r.ok) throw new Error('GET ' + url + ' -> HTTP ' + r.status);
  return r.json();
}

// Charge (une fois par worker) le jeu de donnees d'un run.
async function loadSiteData(baseURL) {
  let home;
  let fullData = null; // data.json, repli production tant que les fichiers decoupes ne sont pas deployes
  if (IS_PROD) {
    try { home = await fetchJson(baseURL.replace(/\/$/, '') + '/data-home.json'); } catch (e) {
      // Meme repli que le site (index.html, match-page.js) : data.json complet.
      fullData = await fetchJson(baseURL.replace(/\/$/, '') + '/data.json');
      home = fullData;
    }
  } else home = JSON.parse(fs.readFileSync(path.join(DIST, 'data-home.json'), 'utf8'));
  const raw = Array.isArray(home.matchs) ? home.matchs : [];

  const free = raw.find((m) => m && m.is_free === true) || null;
  let shiftDays = 0;
  if (!IS_PROD && raw.length) {
    const anchor = (free && free.date) || raw[0].date;
    shiftDays = dayDiff(String(anchor).slice(0, 10), parisDay());
  }
  const matchs = raw.map((m) => shiftMatch(m, shiftDays));
  const shiftedHome = Object.assign({}, home, { matchs });

  const template = free && free.pari_rec
    ? PREMIUM_FIELDS.reduce((o, k) => { if (free[k] !== undefined) o[k] = free[k]; return o; }, {})
    : PREMIUM_TEMPLATE_FALLBACK;

  // Match payant de reference : jamais designe offert (quel que soit le marche),
  // avec une analyse publiee et un fichier de detail disponible.
  const freeDay = free ? String(free.date).slice(0, 10) : null;
  const paidCandidates = matchs
    .filter((m) => m && m.is_free !== true && !(Array.isArray(m.free_markets) && m.free_markets.length) && m.has_signal && !m.no_signal)
    .sort((a, b) => (String(a.date).slice(0, 10) === freeDay ? -1 : 0) - (String(b.date).slice(0, 10) === freeDay ? -1 : 0));
  let paid = null;
  for (const m of paidCandidates) {
    if (IS_PROD) { paid = m; break; }
    if (fs.existsSync(path.join(DIST, 'match', m.id + '.json'))) { paid = m; break; }
  }

  const detailCache = new Map();
  async function detail(id) {
    const key = String(id);
    if (detailCache.has(key)) return detailCache.get(key);
    let d;
    if (IS_PROD) {
      try { d = await fetchJson(baseURL.replace(/\/$/, '') + '/match/' + key + '.json'); } catch (e) {
        if (!fullData) fullData = await fetchJson(baseURL.replace(/\/$/, '') + '/data.json');
        d = (fullData.matchs || []).find((m) => String(m.id) === key);
        if (!d) throw e;
      }
    } else d = JSON.parse(fs.readFileSync(path.join(DIST, 'match', key + '.json'), 'utf8'));
    d = shiftMatch(d, shiftDays);
    detailCache.set(key, d);
    return d;
  }

  function withPremium(m) {
    if (!m || m.is_free === true) return m;
    return Object.assign({}, m, template);
  }

  // Reponse simulee de match-data : Pro = champs premium ; sinon liste publique.
  async function matchDataResponse(body, isPro) {
    const list = matchs.map((m) => (isPro ? withPremium(m) : m));
    if (body && body.id != null) {
      const id = String(body.id);
      let d = null;
      try { d = await detail(id); } catch (e) { d = null; }
      if (d) {
        const full = isPro ? withPremium(d) : d;
        const i = list.findIndex((m) => String(m.id) === id);
        if (i === -1) list.push(full); else list[i] = Object.assign({}, list[i], full);
      }
    }
    // isPro : meme contrat que supabase/functions/match-data (plan lu cote serveur).
    return { matchs: list.map((m) => { const c = Object.assign({}, m); delete c.detail_omitted; return c; }), generated_at: home.generated_at || null, isPro: !!isPro };
  }

  return {
    isProd: IS_PROD, splitDeployed: !fullData, shiftDays, home: shiftedHome, matchs, free, paid, template,
    detail, withPremium, matchDataResponse,
  };
}

// Dictionnaires i18n (i18n/dict/<locale>.json) tels que publies.
async function loadDict(baseURL, locale) {
  if (IS_PROD) return fetchJson(baseURL.replace(/\/$/, '') + '/i18n/dict/' + locale + '.json');
  return JSON.parse(fs.readFileSync(path.join(DIST, 'i18n', 'dict', locale + '.json'), 'utf8'));
}
function tr(dict, key) {
  const v = key.split('.').reduce((o, k) => (o == null ? null : o[k]), dict);
  if (typeof v !== 'string') throw new Error('Cle i18n absente : ' + key);
  return v;
}

module.exports = { IS_PROD, DIST, PREMIUM_FIELDS, premiumLeaks, deepPremiumLeaks, loadSiteData, loadDict, tr, parisDay, shiftDateString };
