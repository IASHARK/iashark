/* IASHARK — page /<dir>/desinscription-email.html (emails de relance).
   Desinscription en 1 clic, SANS connexion : le jeton signe arrive dans le
   fragment de l'URL (#t=...), jamais envoye au serveur du site ni dans un
   en-tete Referer. Il est retire de la barre d'adresse puis POSTe a la
   fonction Edge email-unsubscribe, qui verifie la signature et l'expiration.
   Etats affiches : [data-unsub-state] loading | done | already | invalid |
   expired | error (textes : i18n/parts/emails.<locale>.json, cle email_prefs). */
(function () {
  'use strict';
  var ENDPOINT = 'https://ksvjraqitxouwiabecai.supabase.co/functions/v1/email-unsubscribe';

  function show(state) {
    var els = document.querySelectorAll('[data-unsub-state]');
    for (var i = 0; i < els.length; i++) els[i].hidden = els[i].getAttribute('data-unsub-state') !== state;
  }

  function readToken() {
    var m = /(?:^#|&)t=([^&]+)/.exec(location.hash || '');
    if (!m) return '';
    try { return decodeURIComponent(m[1]); } catch (_e) { return ''; }
  }

  function start() {
    var token = readToken();
    try { if (location.hash) history.replaceState(null, '', location.pathname + location.search); } catch (_e) {}
    if (!token) { show('invalid'); return; }
    show('loading');
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token }),
      credentials: 'omit',
      referrerPolicy: 'no-referrer'
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, body: j }; });
    }).then(function (res) {
      if (res.body && res.body.ok) { show(res.body.status === 'unsubscribed' ? 'done' : 'already'); return; }
      if (res.status === 410) { show('expired'); return; }
      if (res.status === 400) { show('invalid'); return; }
      show('error');
    }).catch(function () { show('error'); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
