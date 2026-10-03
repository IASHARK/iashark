/* IASHARK — ligne « Essai Pro gratuit 7 jours (abonnement mensuel) » (02/10/2026).

   Petite ligne + lien vers l'abonnement, posee dans les parcours qui ne
   montrent pas la grille de prix : inscription (surtout depuis le match
   offert), encart « gratuit avec un compte » de la page match, bienvenue et
   vue d'ensemble du compte gratuit. Un element <p data-essai-annonce hidden>
   est rempli puis montre SEULEMENT si toutes les conditions sont reunies :
   - le serveur confirme l'essai (create-checkout-session, mode
     "availability" : trial_days > 0) ET le mois y est payable (jamais dans
     un pays ou le paiement n'est pas ouvert ; config/markets.json d'abord) ;
   - la personne y a droit : visiteur (les conditions disent « reserve a un
     premier abonnement »), ou compte connecte qui n'a JAMAIS eu d'abonnement
     (meme regle que create-checkout-session/trial.ts) ; jamais un Pro, un
     abonne en essai, un ancien abonne, ni un compte illisible.
   Essai : abonnement MENSUEL seulement (trial.ts#TRIAL_INTERVALS) ; le lien
   ouvre l'abonnement sur le mois (?interval=month).
   Textes : dictionnaire (essai_mensuel.hint / hint_link) puis repli ci-dessous
   (memes valeurs, verifie par tests/essai-mensuel.test.js). */
(function (global) {
  'use strict';
  if (global.IasharkEssai) return;
  var hasOwn = Object.prototype.hasOwnProperty;
  var DIR_LOCALE = { fr: 'fr', en: 'en', gb: 'en', za: 'en', es: 'es', mx: 'es-mx', de: 'de', it: 'it', pt: 'pt' };
  var MARCHES = ['gb', 'mx', 'za'];
  var TEXTES = {
    fr: { hint: 'Essai Pro gratuit {days} jours (abonnement mensuel)', hint_link: 'Voir l’offre' },
    en: { hint: 'Free {days}-day Pro trial (monthly plan)', hint_link: 'See the offer' },
    es: { hint: 'Prueba Pro gratis de {days} días (suscripción mensual)', hint_link: 'Ver la oferta' },
    'es-mx': { hint: 'Prueba Pro gratis de {days} días (suscripción mensual)', hint_link: 'Ver la oferta' },
    de: { hint: 'Pro {days} Tage kostenlos testen (Monatsabo)', hint_link: 'Angebot ansehen' },
    it: { hint: 'Prova Pro gratuita di {days} giorni (abbonamento mensile)', hint_link: 'Vedi l’offerta' },
    pt: { hint: 'Teste Pro gratuito de {days} dias (subscrição mensal)', hint_link: 'Ver a oferta' }
  };
  var TRIAL_INTERVALS = ['month'];

  function dir() {
    var m = (global.location && global.location.pathname || '').match(/^\/([a-z]{2})(?:\/|$)/);
    return m && hasOwn.call(DIR_LOCALE, m[1]) ? m[1] : '';
  }
  function locale() { return DIR_LOCALE[dir()] || 'fr'; }
  function texte(cle) {
    var I = global.I18N;
    if (I && I.dict && I.dict.essai_mensuel && typeof I.dict.essai_mensuel[cle] === 'string' && I.dict.essai_mensuel[cle]) return I.dict.essai_mensuel[cle];
    return (TEXTES[locale()] || TEXTES.fr)[cle];
  }
  function lien(p) {
    var I = global.I18N;
    if (I && typeof I.href === 'function') { try { var o = I.href(p); if (o) return String(o); } catch (e) {} }
    return '/' + (dir() || 'fr') + '/' + p;
  }
  // Marche de paiement de la page (lib/market-config.js si charge ; sinon le
  // repertoire : gb, mx, za ; autre = marche euro par defaut, sans champ).
  function marche() {
    var M = global.IASHARK_MARKET;
    if (M && typeof M.dir === 'string') return M.checkoutMarket || null;
    var d = dir();
    return MARCHES.indexOf(d) !== -1 ? d : null;
  }
  // Mois ouvert dans la configuration (checkoutOpen) : un pays ferme n'a jamais d'annonce.
  function moisOuvertConfig() {
    var M = global.IASHARK_MARKET;
    if (!M || typeof M.proOffer !== 'function') return true; // le serveur decide (intervals.month)
    var it = (M.proOffer().intervals || []).filter(function (x) { return x.interval === 'month'; })[0];
    return !!(it && it.amount != null && it.open !== false);
  }
  function compte() {
    if (global.IasharkCompteLeger) return Promise.resolve(global.IasharkCompteLeger);
    return new Promise(function (resolve) {
      var s = global.document.createElement('script');
      s.src = '/assets/compte-leger.js';
      s.onload = function () { resolve(global.IasharkCompteLeger || null); };
      s.onerror = function () { resolve(null); };
      (global.document.head || global.document.documentElement).appendChild(s);
    });
  }
  // Reponse du serveur : jours d'essai si le mois est payable, sinon 0.
  var dispo = null;
  function joursServeur(C) {
    if (!dispo) {
      var corps = { mode: 'availability' }, m = marche();
      if (m) corps.market = m;
      var url = (global.IasharkApp && global.IasharkApp.url) || C.url, key = (global.IasharkApp && global.IasharkApp.key) || C.key;
      dispo = global.fetch(url + '/functions/v1/create-checkout-session', {
        method: 'POST',
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify(corps)
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (!d || d.mode !== 'availability' || !(d.trial_days > 0)) return 0;
        if (!d.intervals || d.intervals.month !== true) return 0;
        // Ancienne fonction sans trial_intervals : le mois reste la seule duree annoncee.
        if (Array.isArray(d.trial_intervals) && d.trial_intervals.indexOf('month') === -1) return 0;
        return Math.round(d.trial_days);
      }).catch(function () { return 0; });
    }
    return dispo;
  }
  var decision = null;
  // Promise<nombre de jours a annoncer | null>.
  function aAnnoncer() {
    if (!decision) {
      decision = (!moisOuvertConfig() || typeof global.fetch !== 'function' ? Promise.resolve(null) : compte().then(function (C) {
        if (!C) return null;
        return joursServeur(C).then(function (jours) {
          if (!(jours > 0)) return null;
          return C.context().then(function (ctx) {
            if (!ctx || ctx.isPro) return null;
            if (!ctx.user) return jours;
            return C.jamaisAbonne(ctx.user).then(function (ok) { return ok === true ? jours : null; });
          });
        });
      })).catch(function () { return null; });
    }
    return decision;
  }
  function remplir(el, jours) {
    if (el.getAttribute('data-essai-fait') === '1') return;
    el.setAttribute('data-essai-fait', '1');
    el.textContent = '';
    var b = global.document.createElement('span');
    b.textContent = texte('hint').split('{days}').join(String(jours));
    el.appendChild(b);
    el.appendChild(global.document.createTextNode(' · '));
    var a = global.document.createElement('a');
    a.href = lien('abonnement.html?interval=month');
    a.textContent = texte('hint_link');
    a.setAttribute('data-track', el.getAttribute('data-track') || 'trial_hint');
    a.style.cssText = 'color:#20d5ef;font-weight:600;text-decoration:underline;text-underline-offset:3px;white-space:nowrap';
    el.appendChild(a);
    el.hidden = false;
  }
  // Remplit chaque [data-essai-annonce] de root (document par defaut).
  function annoncer(root) {
    root = root || global.document;
    if (!root || !root.querySelectorAll) return Promise.resolve(null);
    var els = Array.prototype.slice.call(root.querySelectorAll('[data-essai-annonce]')).filter(function (el) { return el.getAttribute('data-essai-fait') !== '1'; });
    if (!els.length) return Promise.resolve(null);
    return aAnnoncer().then(function (jours) {
      if (jours > 0) els.forEach(function (el) { remplir(el, jours); });
      return jours;
    });
  }

  global.IasharkEssai = { annoncer: annoncer, aAnnoncer: aAnnoncer, TEXTES: TEXTES, TRIAL_INTERVALS: TRIAL_INTERVALS };
  var d0 = global.document;
  if (d0 && d0.addEventListener) {
    if (d0.readyState === 'loading') d0.addEventListener('DOMContentLoaded', function () { annoncer(d0); });
    else annoncer(d0);
  }
})(typeof window !== 'undefined' ? window : this);
