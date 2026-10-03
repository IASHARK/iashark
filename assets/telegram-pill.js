/* IASHARK — pastille Telegram, la MEME sur toutes les pages (02/10/2026).

   Remplace la bulle du 27/09 (francais seulement, absente des pages de
   paiement, cachee 7 jours apres un clic). Decision de Clement : presente sur
   TOUTES les pages, connecte ou non, dans toutes les langues, au meme endroit
   et avec la meme apparence.

   Ou : une bande fixe collee AU-DESSUS de la barre du bas (bottom-navigation),
   ou tout en bas sur les pages sans barre (connexion, inscription, mot de
   passe). Elle ne cache jamais de texte : la page reserve sa hauteur (marge du
   bas du <body>, variable --ias-tg-h, assets/bottom-navigation.css et le
   style ci-dessous), comme pour la barre du bas ; la bande est opaque, comme
   la barre.

   Ce qu'elle ouvre :
   - visiteur ou compte gratuit : le canal gratuit https://t.me/iasharkdata
     (« Rejoins-nous sur Telegram », nouvel onglet) ;
   - abonne Pro, en essai ou administrateur (IasharkApp.context().isPro) :
     « Mes messages Pro ». Clic = le meme appel que le bouton « Ouvrir mon
     robot sur Telegram » de la page Compte (account-page.js#rejoindreVip :
     functions/v1/telegram-bot, action vip-link). Le serveur renvoie
     t.me/<robot>?start=<code> si le compte n'est pas encore relie (le robot
     relie le compte), ou t.me/<robot> s'il l'est deja : la personne arrive
     DIRECTEMENT dans sa conversation privee. L'appel n'est fait qu'au clic
     (jamais au chargement de la page). Sans JavaScript ou en cas d'erreur :
     page Compte (ou se trouve le meme bouton).
   - messages Pro fermes (assets/ouverture.js : canalPro !== true) : un Pro
     voit la pastille du canal gratuit, comme avant l'ouverture.
   Qui est connecte : IasharkApp (app-client.js) si la page le charge, sinon
   assets/compte-leger.js (aucune requete pour un visiteur).
   Textes : dictionnaire (telegram_pill.*) puis repli ci-dessous, memes
   valeurs (tests/telegram-pill.test.js). */
(function (global) {
  'use strict';
  var d = global.document;
  if (!d || global.IasharkTelegramPill) return;
  var GRATUIT = 'https://t.me/iasharkdata';
  var hasOwn = Object.prototype.hasOwnProperty;
  var DIR_LOCALE = { fr: 'fr', en: 'en', gb: 'en', za: 'en', es: 'es', mx: 'es-mx', de: 'de', it: 'it', pt: 'pt' };
  var TEXTES = {
    fr: { free_title: 'Rejoins-nous sur Telegram', free_sub: 'Match du jour, actu, résultats', pro_title: 'Mes messages Pro', pro_sub: 'Ta conversation privée sur Telegram', opening: 'Ouverture…' },
    en: { free_title: 'Join us on Telegram', free_sub: 'Match of the day, news, results', pro_title: 'My Pro messages', pro_sub: 'Your private chat on Telegram', opening: 'Opening…' },
    es: { free_title: 'Únete en Telegram', free_sub: 'Partido del día, noticias, resultados', pro_title: 'Mis mensajes Pro', pro_sub: 'Tu conversación privada en Telegram', opening: 'Abriendo…' },
    'es-mx': { free_title: 'Únete en Telegram', free_sub: 'Partido del día, noticias, resultados', pro_title: 'Mis mensajes Pro', pro_sub: 'Tu chat privado en Telegram', opening: 'Abriendo…' },
    de: { free_title: 'Komm zu uns auf Telegram', free_sub: 'Spiel des Tages, News, Ergebnisse', pro_title: 'Meine Pro-Nachrichten', pro_sub: 'Dein privater Chat auf Telegram', opening: 'Wird geöffnet…' },
    it: { free_title: 'Unisciti a noi su Telegram', free_sub: 'Partita del giorno, news, risultati', pro_title: 'I miei messaggi Pro', pro_sub: 'La tua chat privata su Telegram', opening: 'Apertura…' },
    pt: { free_title: 'Junta-te a nós no Telegram', free_sub: 'Jogo do dia, notícias, resultados', pro_title: 'As minhas mensagens Pro', pro_sub: 'A tua conversa privada no Telegram', opening: 'A abrir…' }
  };
  // Hauteur reservee (la meme dans assets/bottom-navigation.css) : 52 px, 48 px sur telephone.
  var CSS = ''
    + 'html.ias-tg-on{--ias-tg-h:52px}'
    + '@media(max-width:700px){html.ias-tg-on{--ias-tg-h:48px}}'
    // Pages sans barre du bas : la bande est tout en bas, la page lui laisse sa place.
    + 'html.ias-tg-on:not(.ias-nav-on) body{padding-bottom:calc(var(--ias-tg-h) + env(safe-area-inset-bottom))!important}'
    + 'html.ias-tg-on:not(.ias-nav-on){scroll-padding-bottom:calc(var(--ias-tg-h) + 12px + env(safe-area-inset-bottom))}'
    + '#ias-tg-band{position:fixed;left:0;right:0;bottom:0;z-index:1001;box-sizing:border-box;height:calc(var(--ias-tg-h,52px) + env(safe-area-inset-bottom));padding:0 16px env(safe-area-inset-bottom);display:flex;align-items:center;justify-content:center;background:rgba(6,11,17,.97);border-top:1px solid rgba(96,125,151,.18);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);box-shadow:0 -12px 36px rgba(0,0,0,.28)}'
    // Avec la barre du bas : juste au-dessus d'elle (84 px, 72 px sur telephone).
    + 'html.ias-nav-on #ias-tg-band{bottom:calc(84px + env(safe-area-inset-bottom));height:var(--ias-tg-h,52px);padding:0 16px}'
    + '@media(max-width:700px){html.ias-nav-on #ias-tg-band{bottom:calc(72px + env(safe-area-inset-bottom))}}'
    + '#ias-tg{display:inline-flex;align-items:center;gap:9px;box-sizing:border-box;max-width:100%;height:38px;padding:0 16px 0 5px;border-radius:999px;background:rgba(13,25,38,.94);border:1px solid rgba(32,213,239,.35);font-family:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-style:normal;letter-spacing:0;text-transform:none;text-decoration:none;-webkit-tap-highlight-color:transparent;transition:transform .12s ease,border-color .18s ease;cursor:pointer}'
    + '#ias-tg:hover{border-color:rgba(32,213,239,.7)}#ias-tg:active{transform:scale(.97)}'
    + '#ias-tg:focus-visible{outline:2px solid #20d5ef;outline-offset:2px}'
    + '#ias-tg .ias-tg-i{flex:none;width:28px;height:28px;border-radius:50%;background:#20d5ef;display:flex;align-items:center;justify-content:center}'
    // Meme police partout (jamais celle de la page : Inter, DM Sans ou Bebas selon les pages).
    + '#ias-tg span{font:inherit;letter-spacing:0;text-transform:none}'
    + '#ias-tg .ias-tg-1{color:#f4f7fb;font-size:13.5px;font-weight:700;line-height:1.2;white-space:nowrap}'
    + '#ias-tg .ias-tg-2{color:#91a0b3;font-size:12px;font-weight:500;line-height:1.2;white-space:nowrap}'
    + '#ias-tg .ias-tg-s{color:#4d6573}'
    // Telephone : le titre seul (jamais un sous-titre coupe en plein mot).
    + '@media(max-width:560px){#ias-tg .ias-tg-2,#ias-tg .ias-tg-s{display:none}}'
    + '#ias-tg[aria-busy="true"]{opacity:.7;cursor:wait}'
    + '@media(prefers-reduced-motion:reduce){#ias-tg{transition:none}#ias-tg:active{transform:none}}'
    + '@media print{#ias-tg-band{display:none}html.ias-tg-on body{padding-bottom:0!important}}';

  var seg = (global.location.pathname.match(/^\/([a-z]{2})(?:\/|$)/) || [])[1] || '';
  function locale() { return DIR_LOCALE[seg] || 'fr'; }
  function texte(cle) {
    var I = global.I18N;
    if (I && I.dict && I.dict.telegram_pill && typeof I.dict.telegram_pill[cle] === 'string' && I.dict.telegram_pill[cle]) return I.dict.telegram_pill[cle];
    return (TEXTES[locale()] || TEXTES.fr)[cle];
  }
  function lienCompte() {
    var I = global.I18N;
    if (I && typeof I.href === 'function') { try { var o = I.href('compte.html'); if (o) return String(o); } catch (e) {} }
    return '/' + (seg || 'fr') + '/compte.html';
  }
  function chargerScript(src) {
    return new Promise(function (resolve) {
      var s = d.createElement('script');
      s.src = src;
      s.onload = function () { resolve(true); };
      s.onerror = function () { resolve(false); };
      (d.head || d.documentElement).appendChild(s);
    });
  }
  function compte() {
    if (global.IasharkCompteLeger) return Promise.resolve(global.IasharkCompteLeger);
    return chargerScript('/assets/compte-leger.js').then(function () { return global.IasharkCompteLeger || null; });
  }
  function messagesProOuverts() {
    if (global.IASHARK_OUVERTURE) return Promise.resolve(global.IASHARK_OUVERTURE.canalPro === true);
    return chargerScript('/assets/ouverture.js').then(function () { return !!(global.IASHARK_OUVERTURE && global.IASHARK_OUVERTURE.canalPro === true); });
  }

  var ICONE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#060b12" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>';
  var etat = 'gratuit';
  var a = null, occupe = false;

  function dessiner() {
    if (!a) return;
    var pro = etat === 'pro';
    var t1 = texte(pro ? 'pro_title' : 'free_title'), t2 = texte(pro ? 'pro_sub' : 'free_sub');
    a.setAttribute('data-tg-mode', pro ? 'pro' : 'gratuit');
    a.setAttribute('data-track', pro ? 'telegram_pro_pill' : 'telegram_bubble');
    a.setAttribute('data-track-kind', 'cta');
    a.setAttribute('aria-label', t1 + ' : ' + t2);
    if (pro) { a.href = lienCompte(); a.removeAttribute('target'); a.removeAttribute('rel'); }
    else { a.href = GRATUIT; a.target = '_blank'; a.rel = 'noopener'; }
    while (a.firstChild) a.removeChild(a.firstChild);
    var parts = [['ias-tg-i', null], ['ias-tg-1', t1], ['ias-tg-s', '·'], ['ias-tg-2', t2]];
    parts.forEach(function (p) {
      var sp = d.createElement('span');
      sp.className = p[0];
      if (p[0] === 'ias-tg-i') sp.innerHTML = ICONE;
      else sp.textContent = p[1];
      if (p[0] === 'ias-tg-s') sp.setAttribute('aria-hidden', 'true');
      a.appendChild(sp);
    });
  }

  // Clic d'un Pro : conversation privee avec le robot (meme appel que la page Compte).
  function ouvrirRobot(ev) {
    if (etat !== 'pro') return;
    ev.preventDefault();
    if (occupe) return;
    occupe = true;
    a.setAttribute('aria-busy', 'true');
    var t1 = a.querySelector('.ias-tg-1'), avant = t1 ? t1.textContent : '';
    if (t1) t1.textContent = texte('opening');
    var fin = function (cible) {
      occupe = false;
      a.removeAttribute('aria-busy');
      if (t1) t1.textContent = avant;
      if (cible) global.location.href = cible;
    };
    compte().then(function (C) {
      if (!C) return lienCompte();
      return C.jeton().then(function (jeton) {
        if (!jeton) return lienCompte();
        return global.fetch(C.url + '/functions/v1/telegram-bot', {
          method: 'POST',
          headers: { apikey: C.key, Authorization: 'Bearer ' + jeton, 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'vip-link' })
        }).then(function (r) { return r.json(); }).then(function (j) {
          // Seul un lien t.me est suivi (jamais une adresse libre).
          if (j && typeof j.robot_url === 'string' && /^https:\/\/t\.me\/[A-Za-z0-9_]+(\?start=[A-Za-z0-9_-]+)?$/.test(j.robot_url)) return j.robot_url;
          if (j && j.code === 'not_pro') return GRATUIT;
          return lienCompte();
        });
      });
    }).then(fin, function () { fin(lienCompte()); });
  }

  function poser() {
    if (d.getElementById('ias-tg-band')) return;
    var st = d.createElement('style');
    st.id = 'ias-tg-style';
    st.textContent = CSS;
    (d.head || d.documentElement).appendChild(st);
    var band = d.createElement('div');
    band.id = 'ias-tg-band';
    a = d.createElement('a');
    a.id = 'ias-tg';
    a.addEventListener('click', ouvrirRobot);
    dessiner();
    band.appendChild(a);
    d.body.appendChild(band);
    // Textes dans la langue de la page des que le dictionnaire est la.
    var I = global.I18N;
    if (I && typeof I.init === 'function') { try { Promise.resolve(I.init()).then(dessiner, function () {}); } catch (e) {} }
    // Pro (ou essai, ou admin) : « Mes messages Pro ».
    compte().then(function (C) { return C ? C.context() : null; }).then(function (ctx) {
      if (!ctx || !ctx.isPro) return;
      return messagesProOuverts().then(function (ouvert) { if (ouvert) { etat = 'pro'; dessiner(); } });
    }).catch(function () {});
  }

  d.documentElement.classList.add('ias-tg-on');
  global.IasharkTelegramPill = { GRATUIT: GRATUIT, TEXTES: TEXTES, mode: function () { return etat; } };
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', poser);
  else poser();
})(typeof window !== 'undefined' ? window : this);
