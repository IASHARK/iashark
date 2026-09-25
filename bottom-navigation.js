(function(){
  'use strict';
  // Chaque repertoire public (langues /fr/ /en/ /es/ /de/ /it/ /pt/, marches
  // pays /gb/ /za/ /mx/) contient desormais TOUTES les pages publiques
  // (scripts/build-locales.js) : la navigation reste donc toujours dans le
  // repertoire courant (/gb/pro.html, /mx/compte.html...). Blog : /<langue>/blog/,
  // /en/blog/ pour gb et za, /mx/blog/ pour mx, blog FR racine pour fr.
  // I18N.href (i18n/i18n.js) fait foi quand il est charge ; le repli ci-dessous
  // applique exactement la meme regle (page sans prefixe -> /fr/, jamais un
  // lien racine qui redirige).
  var BLOG_DIR={fr:'',en:'en',es:'es',de:'de',it:'it',pt:'pt',gb:'en',za:'en',mx:'mx'};
  var DIR_LOCALE={fr:'fr',en:'en',gb:'en',za:'en',es:'es',mx:'es-mx',de:'de',it:'it',pt:'pt'};
  var segMatch=location.pathname.match(/^\/([a-z]{2})(?:\/|$)/);
  var dir=(segMatch&&BLOG_DIR.hasOwnProperty(segMatch[1]))?segMatch[1]:'';
  // Blog anglais partage par gb et za (audit QA : un visiteur /gb/ envoye sur
  // /en/blog/ sortait de son marche). Sur /en/blog/**, les liens vers les pages
  // du site suivent la version memorisee (localStorage iashark_dir = gb|za).
  var linkDir=dir;
  if(dir==='en'&&/^\/en\/blog(\/|$)/.test(location.pathname)){
    try{var saved=localStorage.getItem('iashark_dir');if(saved==='gb'||saved==='za')linkDir=saved;}catch(e){}
  }
  function href(page){
    if(page==='blog.html'){
      if(linkDir!==dir)return '/en/blog/';
      if(window.I18N&&window.I18N.href)return window.I18N.href(page);
      return BLOG_DIR[dir]?'/'+BLOG_DIR[dir]+'/blog/':'/blog.html';
    }
    if(linkDir===dir&&window.I18N&&window.I18N.href)return window.I18N.href(page);
    return '/'+(linkDir||'fr')+'/'+(page==='index.html'?'':page);
  }
  var rest=(dir?location.pathname.slice(dir.length+1):location.pathname).replace(/\/+$/,'')||'/';
  var active=/^\/blog(\.html|\/|$)/.test(rest)?'blog':/\/pro\.html$/.test(rest)?'tools':/\/compte\.html$/.test(rest)?'account':(rest==='/'||/^\/(index|landing)\.html$/.test(rest))?'home':'';
  // Libelles : les 4 valeurs label ci-dessous sont le repli FR. Cles
  // dictionnaire : nav.home/tools/guides/account et geo.nav.aria_label
  // (i18n/dict/*.json). Tant que i18n.js n'est pas charge (il l'est parfois
  // apres ce script, via site-header.js), la langue du repertoire s'affiche
  // quand meme grace a FALLBACK, copie exacte des valeurs du dictionnaire
  // (verifiee par tests/bottom-navigation.test.js).
  var FALLBACK={
    en:{home:'HOME',tools:'TOOLS',guides:'BLOG',account:'ACCOUNT',aria:'Main navigation'},
    es:{home:'INICIO',tools:'HERRAMIENTAS',guides:'BLOG',account:'CUENTA',aria:'Navegación principal'},
    'es-mx':{home:'INICIO',tools:'HERRAMIENTAS',guides:'BLOG',account:'CUENTA',aria:'Navegación principal'},
    de:{home:'START',tools:'TOOLS',guides:'BLOG',account:'KONTO',aria:'Hauptnavigation'},
    it:{home:'HOME',tools:'STRUMENTI',guides:'BLOG',account:'ACCOUNT',aria:'Navigazione principale'},
    pt:{home:'INÍCIO',tools:'FERRAMENTAS',guides:'BLOG',account:'CONTA',aria:'Navegação principal'}
  };
  var locale=DIR_LOCALE[dir]||'fr';
  var fb=FALLBACK[locale]||null;
  function t(key,fallback){return (window.I18N && window.I18N.t && window.I18N.dict) ? window.I18N.t(key,fallback) : fallback;}
  var items=[
    {id:'home',href:href('index.html'),key:'nav.home',label:'Accueil',icon:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'},
    {id:'tools',href:href('pro.html'),key:'nav.tools',label:'Outils',icon:'<path d="m12 2 2.9 6.6 7.1.7-5 4.9 1.2 7.8-6.2-3.7L5.8 22 7 14.2 2 9.3l7.1-.7Z"/>'},
    {id:'blog',href:href('blog.html'),key:'nav.guides',label:'Blog',icon:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'},
    {id:'account',href:href('compte.html'),key:'nav.account',label:'Compte',icon:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'}
  ];
  function renderLabel(item){return t(item.key,fb?fb[item.key.split('.')[1]]:item.label);}
  function ariaLabel(){return t('geo.nav.aria_label',fb?fb.aria:'Navigation principale');}
  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');}
  var nav=document.createElement('nav');
  nav.className='site-bottom-nav';
  nav.setAttribute('aria-label',ariaLabel());
  // data-i18n / data-i18n-attr : si i18n.js applique le dictionnaire au
  // document apres ce script, les libelles sont traduits au meme moment.
  nav.setAttribute('data-i18n-attr','aria-label:geo.nav.aria_label');
  nav.innerHTML=items.map(function(item){
    return '<a class="site-bottom-nav__item" href="'+esc(item.href)+'"'+(active===item.id?' aria-current="page"':'')+'><svg class="site-bottom-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+item.icon+'</svg><span class="site-bottom-nav__label" data-nav-id="'+item.id+'" data-i18n="'+item.key+'">'+esc(renderLabel(item))+'</span></a>';
  }).join('');
  var legacy=document.querySelector('.nav-bottom,.bottom-nav');
  if(legacy)legacy.replaceWith(nav);else document.body.appendChild(nav);
  function relabel(){
    nav.setAttribute('aria-label',ariaLabel());
    items.forEach(function(item){
      var el=nav.querySelector('[data-nav-id="'+item.id+'"]');
      if(el)el.textContent=renderLabel(item);
      // Liens : I18N.href peut maintenant repondre (page sans prefixe).
      var a=el&&el.parentNode;
      if(a&&a.tagName==='A'){var h=href(item.id==='home'?'index.html':item.id==='tools'?'pro.html':item.id==='blog'?'blog.html':'compte.html');if(h)a.setAttribute('href',h);}
    });
  }
  // i18n.js peut arriver apres ce script (charge a la demande par
  // site-header.js sur le blog, ou plus bas dans la page) : on attend qu'il
  // existe (10 s maximum) puis on relabelle une fois le dictionnaire pret.
  // I18N.init() est mis en cache par i18n.js : jamais de double fetch.
  var tries=0;
  (function waitI18n(){
    if(window.I18N&&window.I18N.init){
      window.I18N.init().then(relabel,function(){});
      return;
    }
    if(++tries<=66)setTimeout(waitI18n,150);
  })();
})();

/* Offre Pro du 25/09/2026 (campagne Turquie–France) - A RETIRER ENSUITE.
   Ici plutot que dans auth-header.js : bottom-navigation.js est charge sur
   toutes les pages publiques (landing et Compte comprises), sauf les pages
   d'authentification et l'admin.
   Source unique de l'offre pour tout le site (window.IasharkPromo) : jusqu'a
   20h45 Paris, chaque prix Pro mensuel affiche ([data-market-price="pro"],
   [data-market-price="pro.month"], ligne [data-market-price-line="pro"])
   devient « prix barre + 9,95 » ; a l'heure limite tout est remis au prix
   normal sans recharger. Les pages qui paient (abonnement-page.js,
   account-page.js) envoient IasharkPromo.code() a create-checkout-session,
   qui applique le code Stripe d'office (liste blanche BLEUS / CAIRO5).
   ?promo=CAIRO5 dans l'URL choisit ce code pour la visite. Hors mx/za. */
(function(){
  var FIN = Date.UTC(2026, 8, 25, 18, 45, 0);
  var seg = (location.pathname.split('/')[1] || '').toLowerCase();
  var DIRS = ['fr','en','gb','es','de','it','pt','mx','za'];
  var dir = DIRS.indexOf(seg) === -1 ? 'fr' : seg;
  var EUR = ['19,95 €','9,95 €','5 €'];
  var PRIX = { fr:EUR, es:EUR, de:EUR, it:EUR, pt:EUR, en:['$19.99','$9.95','$5'], gb:['£14.99','£9.95','£5'] };
  var LIGNE = {
    fr:'Pro à {new} le premier mois au lieu de {old} avec le code {code}, jusqu’à 20h45',
    es:'Pro a {new} el primer mes en lugar de {old} con el código {code}, hasta las 20:45',
    de:'Pro für {new} im ersten Monat statt {old} mit dem Code {code}, bis 20:45 Uhr',
    it:'Pro a {new} il primo mese invece di {old} con il codice {code}, fino alle 20:45',
    pt:'Pro por {new} no primeiro mês em vez de {old} com o código {code}, até às 20h45',
    en:'Pro for {new} your first month instead of {old} with code {code}, until 20:45 (Paris time)'
  };
  var NOTE = {
    fr:{n:'Code {code} appliqué automatiquement : {new} le premier mois au lieu de {old}, puis {old}/mois. Offre valable jusqu’à 20h45.',w:'L’offre à {new} s’applique à la formule au mois.',m:'Tu pourras saisir ton code sur la page de paiement.',a:'J’ai un autre code',b:'Utiliser le code {code}'},
    es:{n:'Código {code} aplicado automáticamente: {new} el primer mes en lugar de {old}, luego {old}/mes. Válido hasta las 20:45 (hora de París).',w:'La oferta de {new} se aplica al plan mensual.',m:'Podrás introducir tu código en la página de pago.',a:'Tengo otro código',b:'Usar el código {code}'},
    de:{n:'Code {code} automatisch angewendet: {new} im ersten Monat statt {old}, danach {old}/Monat. Gültig bis 20:45 Uhr (Pariser Zeit).',w:'Das Angebot für {new} gilt für das Monatsabo.',m:'Du kannst deinen Code auf der Zahlungsseite eingeben.',a:'Ich habe einen anderen Code',b:'Code {code} verwenden'},
    it:{n:'Codice {code} applicato automaticamente: {new} il primo mese invece di {old}, poi {old}/mese. Valido fino alle 20:45 (ora di Parigi).',w:'L’offerta a {new} vale per il piano mensile.',m:'Potrai inserire il codice nella pagina di pagamento.',a:'Ho un altro codice',b:'Usa il codice {code}'},
    pt:{n:'Código {code} aplicado automaticamente: {new} no primeiro mês em vez de {old}, depois {old}/mês. Válido até às 20h45 (hora de Paris).',w:'A oferta de {new} aplica-se ao plano mensal.',m:'Poderás introduzir o teu código na página de pagamento.',a:'Tenho outro código',b:'Usar o código {code}'},
    en:{n:'Code {code} applied automatically: {new} for your first month instead of {old}, then {old}/month. Valid until 20:45 (Paris time).',w:'The {new} offer applies to the monthly plan.',m:'You can enter your code on the payment page.',a:'I have another code',b:'Use code {code}'}
  };
  LIGNE.gb = LIGNE.en; NOTE.gb = NOTE.en;
  var code = (function(){
    var q = '';
    try { q = (new URLSearchParams(location.search).get('promo') || '').toUpperCase(); } catch (_e) {}
    if (q === 'BLEUS' || q === 'CAIRO5') { try { sessionStorage.setItem('ias-promo-code', q); } catch (_e) {} return q; }
    try { var v = sessionStorage.getItem('ias-promo-code'); if (v === 'BLEUS' || v === 'CAIRO5') return v; } catch (_e) {}
    return 'BLEUS';
  })();
  var manuel = false;
  function actif(){ return Date.now() < FIN && !!PRIX[dir]; }
  function prix(){ var p = PRIX[dir] || EUR; return { old:p[0], nw: code === 'CAIRO5' ? p[2] : p[1] }; }
  function remplir(t){ var p = prix(); return t.split('{code}').join(code).split('{new}').join(p.nw).split('{old}').join(p.old); }
  // La page d'abonnement gere son propre bloc (abonnement-page.js).
  var pageAbo = /abonnement\.html$/.test(location.pathname);
  function gere(el){ return pageAbo && el.closest && el.closest('#proPlanPicker'); }
  var enCours = false;
  function appliquer(){
    if (enCours || !document.body) return;
    enCours = true;
    try {
      var on = actif() && !manuel, p = prix();
      document.querySelectorAll('[data-market-price="pro"],[data-market-price="pro.month"]').forEach(function(el){
        if (gere(el)) return;
        var fait = !!el.querySelector('s[data-promo]');
        if (on && !fait) el.innerHTML = '<s data-promo style="opacity:.45;font-size:.55em;margin-right:.25em;font-weight:inherit">' + p.old + '</s>' + p.nw;
        else if (!on && fait) el.textContent = p.old;
      });
      var ligne = remplir(LIGNE[dir] || LIGNE.fr);
      document.querySelectorAll('[data-market-price-line="pro"]').forEach(function(el){
        var orig = el.getAttribute('data-promo-orig');
        // lib/market-config.js peut reecrire la ligne apres nous : on garde
        // son dernier texte comme original et on repose l'offre.
        if (on && el.textContent !== ligne) { el.setAttribute('data-promo-orig', el.textContent); el.textContent = ligne; }
        else if (!on && orig !== null) { el.textContent = orig; el.removeAttribute('data-promo-orig'); }
      });
      // Encart sous le selecteur de duree hors page d'abonnement (Compte).
      var box = document.getElementById('proPlanPicker');
      var note = document.getElementById('promoNoteSite');
      if (box && !pageAbo && actif()) {
        if (!note) {
          note = document.createElement('div'); note.id = 'promoNoteSite';
          note.style.cssText = 'margin:12px 0 4px;padding:11px 13px;border:1px solid rgba(34,211,238,.28);border-left:3px solid #22d3ee;border-radius:10px;background:rgba(34,211,238,.06);font-size:13px;line-height:1.5;color:#dce8ee';
          box.parentNode.insertBefore(note, box.nextSibling);
        }
        var T = NOTE[dir] || NOTE.fr;
        var radio = box.querySelector('input[type=radio]:checked');
        var ivl = radio ? ((radio.closest('[data-interval]') || {}).getAttribute ? radio.closest('[data-interval]').getAttribute('data-interval') : 'month') : 'month';
        var texte = manuel ? T.m : (ivl === 'month' ? T.n : T.w);
        var lien = manuel ? T.b : T.a;
        var voulu = remplir(texte) + '|' + remplir(lien);
        if (note.getAttribute('data-v') !== voulu) {
          note.setAttribute('data-v', voulu);
          note.textContent = remplir(texte) + ' ';
          var a = document.createElement('a'); a.href = '#';
          a.style.cssText = 'color:#22d3ee;text-decoration:underline;text-underline-offset:3px;white-space:nowrap';
          a.textContent = remplir(lien);
          a.onclick = function(e){ e.preventDefault(); manuel = !manuel; appliquer(); };
          note.appendChild(a);
        }
      } else if (note) { note.remove(); }
    } finally { enCours = false; }
  }
  window.IasharkPromo = {
    actif: actif,
    auto: function(){ return actif() && !manuel; },
    code: function(){ return code; },
    prix: prix,
    appliquer: appliquer
  };
  if (!actif()) return;
  var prevu = false;
  function planifier(){ if (prevu) return; prevu = true; (window.requestAnimationFrame || setTimeout)(function(){ prevu = false; appliquer(); }); }
  function demarrer(){
    appliquer();
    if (window.MutationObserver) new MutationObserver(function(){ if (!enCours) planifier(); }).observe(document.body, { childList:true, subtree:true, characterData:true });
    document.addEventListener('change', function(e){ if (e.target && e.target.closest && e.target.closest('#proPlanPicker')) planifier(); });
    setTimeout(appliquer, Math.max(0, FIN - Date.now() + 500));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrer); else demarrer();
})();

/* Bandeau d'offre Pro 9,95 (25/09/2026, campagne Turquie–France). Reprise du composant 21st.dev
   « Promo Banner » (shadcndesign/banner-1 : barre fine, texte, lien, fermer),
   avec un compte a rebours discret. Code promo BLEUS (Stripe) : 1er mois Pro a
   9,95 (EUR / USD / GBP), formule mensuelle, jusqu'au coup d'envoi 20h45 Paris.
   Disparait seul a l'heure limite ; jamais affiche aux comptes Pro, ni sur
   mx/za (MXN/ZAR non couverts par le code) ni sur les pages d'authentification
   et de paiement. A RETIRER apres la campagne. */
(function(){
  var FIN = Date.UTC(2026, 8, 25, 18, 45, 0);
  if (Date.now() >= FIN) return;
  var seg = (location.pathname.split('/')[1] || '').toLowerCase();
  // Les versions es/de/it/pt sont en euros (marche fr, 19,95 EUR) ; en = USD,
  // gb = GBP. BLEUS retire 10 EUR / 10,04 USD / 5,04 GBP : 9,95 partout.
  var L = {
    fr: { b:'Pro à <strong>9,95 €</strong> le premier mois avec le code <strong>BLEUS</strong>', f:'Fin dans', c:'En profiter', x:'Fermer', r:'Offre Pro' },
    es: { b:'Pro a <strong>9,95 €</strong> el primer mes con el código <strong>BLEUS</strong>', f:'Termina en', c:'Aprovechar', x:'Cerrar', r:'Oferta Pro' },
    de: { b:'Pro für <strong>9,95 €</strong> im ersten Monat mit dem Code <strong>BLEUS</strong>', f:'Endet in', c:'Jetzt sichern', x:'Schließen', r:'Pro-Angebot' },
    it: { b:'Pro a <strong>9,95 €</strong> il primo mese con il codice <strong>BLEUS</strong>', f:'Termina tra', c:'Approfitta', x:'Chiudi', r:'Offerta Pro' },
    pt: { b:'Pro por <strong>9,95 €</strong> no primeiro mês com o código <strong>BLEUS</strong>', f:'Termina em', c:'Aproveitar', x:'Fechar', r:'Oferta Pro' },
    en: { b:'Pro for <strong>$9.95</strong> your first month with code <strong>BLEUS</strong>', f:'Ends in', c:'Get the offer', x:'Close', r:'Pro offer' },
    gb: { b:'Pro for <strong>£9.95</strong> your first month with code <strong>BLEUS</strong>', f:'Ends in', c:'Get the offer', x:'Close', r:'Pro offer' }
  };
  var dirs = ['fr','en','gb','es','de','it','pt','mx','za'];
  var dir = dirs.indexOf(seg) === -1 ? 'fr' : seg;
  var txt = L[dir];
  if (!txt) return;
  txt.u = '/' + dir + '/abonnement.html';
  if (/checkout-(succes|annule)|connexion|inscription|mot-de-passe|reinitialiser/.test(location.pathname)) return;
  try { if (sessionStorage.getItem('ias-promo-bleus') === '0') return; } catch (_e) {}

  function montrer(){
    if (document.getElementById('ias-promo')) return;
    var css = document.createElement('style');
    css.textContent =
      '#ias-promo{position:relative;z-index:60;background:#08141c;border-bottom:1px solid rgba(148,173,186,.14);font-family:Inter,system-ui,sans-serif;-webkit-font-smoothing:antialiased}' +
      '#ias-promo .ip{max-width:1180px;margin:0 auto;min-height:40px;display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 44px;position:relative;font-size:13.5px;line-height:1.45;color:#b4c6cf;text-align:center}' +
      '#ias-promo strong{color:#fff;font-weight:600;letter-spacing:.02em}' +
      '#ias-promo .ip-sep{color:#4d6573}' +
      '#ias-promo .ip-t{color:#8ea7b4;font-variant-numeric:tabular-nums;white-space:nowrap}' +
      '#ias-promo .ip-c{color:#22d3ee;font-weight:600;text-decoration:none;white-space:nowrap;border-bottom:1px solid rgba(34,211,238,.35);padding-bottom:1px;transition:border-color .15s}' +
      '#ias-promo .ip-c:hover{border-bottom-color:#22d3ee}' +
      '#ias-promo .ip-x{position:absolute;right:12px;top:50%;transform:translateY(-50%);width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:none;border:0;border-radius:6px;color:#6f8793;cursor:pointer}' +
      '#ias-promo .ip-x:hover{color:#dce8ee;background:rgba(148,173,186,.08)}' +
      '@media (max-width:760px){#ias-promo .ip{flex-wrap:wrap;gap:2px 8px;padding:8px 40px 8px 14px;font-size:12.5px;justify-content:flex-start;text-align:left}#ias-promo .ip-sep.s2{display:none}#ias-promo .ip-x{right:6px}}';
    document.head.appendChild(css);
    var b = document.createElement('div');
    b.id = 'ias-promo';
    b.setAttribute('role', 'region');
    b.setAttribute('aria-label', txt.r);
    b.innerHTML = '<div class="ip">' +
      '<span>' + txt.b + '</span><span class="ip-sep s2"> · </span>' +
      '<span class="ip-t">' + txt.f + ' <span data-cd>--:--:--</span></span>' +
      '<a class="ip-c" href="' + txt.u + '">' + txt.c + ' →</a>' +
      '<button class="ip-x" type="button" aria-label="' + txt.x + '"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>';
    document.body.insertBefore(b, document.body.firstChild);
    b.querySelector('.ip-x').onclick = function(){
      b.remove();
      try { sessionStorage.setItem('ias-promo-bleus', '0'); } catch (_e) {}
    };
    var cd = b.querySelector('[data-cd]');
    var deux = function(n){ return (n < 10 ? '0' : '') + n; };
    (function tic(){
      var r = FIN - Date.now();
      if (r <= 0) { b.remove(); return; }
      var t = Math.floor(r / 1000);
      cd.textContent = deux(Math.floor(t / 3600)) + ':' + deux(Math.floor(t % 3600 / 60)) + ':' + deux(t % 60);
      setTimeout(tic, 1000);
    })();
  }

  function lancer(){
    var app = window.IasharkApp;
    if (app && typeof app.context === 'function') {
      app.context().then(function(c){ if (!c || !c.isPro) montrer(); }).catch(montrer);
    } else {
      montrer();
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', lancer); else lancer();
})();
