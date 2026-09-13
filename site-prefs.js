/* Bannière de consentement (RGPD) — partagée sur toutes les pages.
   Volontairement neutre dans les noms (pas de "cookie"/"gdpr"/"consent" dans les
   identifiants CSS/JS) : de nombreux bloqueurs de pub masquent ou bloquent par défaut
   toute ressource/élément dont le nom matche ces mots-clés, ce qui empêcherait une
   partie des visiteurs de voir la bannière — contre-productif pour la conformité.
   Les cookies essentiels (session Supabase) tournent sans consentement.
   Google Analytics n'est chargé qu'après acceptation explicite. */
(function(){
  var CONSENT_KEY = 'iashark_cookie_consent';
  var GA_ID = 'G-R30ZBHG8J0';

  function getConsent(){
    try{ return localStorage.getItem(CONSENT_KEY); }catch(e){ return null; }
  }
  function setConsent(v){
    try{ localStorage.setItem(CONSENT_KEY, v); }catch(e){}
  }

  function loadGA(){
    if(window._iasharkGaLoaded) return;
    window._iasharkGaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id='+GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  function injectStyle(){
    if(document.getElementById('iashark-notice-style')) return;
    var s = document.createElement('style');
    s.id = 'iashark-notice-style';
    s.textContent = '.iashark-notice-bar{position:fixed;left:0;right:0;bottom:0;z-index:400;background:#0d1520;'
      +'border-top:1px solid rgba(34,211,238,0.18);padding:16px 20px;display:flex;gap:14px;align-items:center;'
      +'flex-wrap:wrap;box-shadow:0 -8px 24px rgba(0,0,0,0.4);font-family:"DM Sans",sans-serif;}'
      +'.iashark-notice-bar p{flex:1;min-width:200px;font-size:12.5px;color:#e2e8f0;line-height:1.5;margin:0;}'
      +'.iashark-notice-bar a{color:#22d3ee;text-decoration:underline;}'
      +'.iashark-notice-actions{display:flex;gap:8px;flex-shrink:0;}'
      +'.iashark-notice-actions button{font-family:"Space Mono",monospace;font-size:9px;letter-spacing:1px;'
      +'padding:10px 16px;border-radius:8px;cursor:pointer;white-space:nowrap;}'
      +'.iashark-notice-decline{border:1px solid rgba(255,255,255,0.12);background:transparent;color:#94a3b8;}'
      +'.iashark-notice-accept{border:1px solid rgba(34,211,238,0.3);background:rgba(34,211,238,0.1);color:#22d3ee;}'
      +'@media(max-width:560px){.iashark-notice-bar{flex-direction:column;align-items:stretch;}'
      +'.iashark-notice-actions{justify-content:stretch;}.iashark-notice-actions button{flex:1;}}';
    document.head.appendChild(s);
  }

  // t() : meme discipline i18n que le reste du chantier (repli FR si I18N
  // n'est pas charge sur la page, jamais un texte fige different du repli).
  function t(key,fallback){return (window.I18N && window.I18N.t) ? window.I18N.t(key,fallback) : fallback;}

  // Lien interne localise : garde /gb/, /mx/, /en/... quand la page est servie
  // sous un repertoire de langue/marche. N'agit QUE si le helper I18N.href
  // existe - sinon on ne touche a rien (le href statique, deja reecrit par le
  // generateur pour chaque repertoire, reste la reference).
  function localHref(p){
    p = p || '';
    var i = p.search(/[?#]/), tail = '';
    if(i >= 0){ tail = p.slice(i); p = p.slice(0, i); }
    var out = null;
    if(window.I18N && typeof window.I18N.href === 'function'){
      try{ out = window.I18N.href(p || 'index.html'); }catch(e){ out = null; }
    }
    if(!out) return null;
    return String(out).replace(/\/index\.html$/, '/') + tail;
  }
  window.IasharkLocalHref = localHref;

  // Enrichissements partages, appliques une fois le dictionnaire charge :
  // - [data-i18n-html="cle"] : contenu avec balisage simple (<b>, <br>, <a>)
  //   que data-i18n (textContent) ne peut pas porter. Valeurs issues des
  //   dictionnaires du depot uniquement, jamais de donnees utilisateur.
  // - a[data-href="page.html"] : lien interne reecrit via I18N.href.
  var NONE = '\u0000';
  function enhance(){
    var I = window.I18N;
    if(I && I.t){
      var nodes = document.querySelectorAll('[data-i18n-html]');
      for(var n = 0; n < nodes.length; n++){
        var v = I.t(nodes[n].getAttribute('data-i18n-html'), NONE);
        if(v !== NONE && v != null) nodes[n].innerHTML = v;
      }
    }
    var links = document.querySelectorAll('a[data-href]');
    for(var k = 0; k < links.length; k++){
      var href = localHref(links[k].getAttribute('data-href'));
      if(href) links[k].setAttribute('href', href);
    }
  }
  if(window.I18N && window.I18N.init){
    window.I18N.init().then(enhance, enhance);
  } else {
    enhance();
  }

  function showBanner(){
    injectStyle();
    var bar = document.createElement('div');
    bar.className = 'iashark-notice-bar';
    bar.id = 'iasharkNoticeBar';
    bar.innerHTML = '<p>'+t('cookie_banner.text',"On utilise des cookies essentiels au fonctionnement du site, et des cookies analytiques (Google Analytics) pour comprendre l'usage du site — uniquement avec ton accord.")+' '
      +'<a href="'+((window.I18N&&window.I18N.href)?window.I18N.href('cookies.html'):'/confidentialite.html')+'">'+t('cookie_banner.learn_more','En savoir plus')+'</a></p>'
      +'<div class="iashark-notice-actions">'
      +'<button type="button" class="iashark-notice-decline" id="iasharkNoticeDecline">'+t('cookie_banner.decline','REFUSER')+'</button>'
      +'<button type="button" class="iashark-notice-accept" id="iasharkNoticeAccept">'+t('cookie_banner.accept','ACCEPTER')+'</button>'
      +'</div>';
    document.body.appendChild(bar);
    // La barre de navigation du bas est montee par bottom-navigation.js, parfois
    // apres ce bandeau : on remesure plusieurs fois et au redimensionnement pour
    // que le bandeau (et ses boutons) reste toujours visible au-dessus d'elle.
    function placeAboveNav(){
      var nav = document.querySelector('.nav-bottom, nav.bottom-nav, [data-bottom-nav]');
      var h = 0;
      if(nav){
        var r = nav.getBoundingClientRect();
        if(r.height && r.top < window.innerHeight) h = Math.max(0, window.innerHeight - r.top);
      }
      bar.style.bottom = h + 'px';
    }
    placeAboveNav();
    [100, 400, 1200].forEach(function(ms){ setTimeout(placeAboveNav, ms); });
    window.addEventListener('resize', placeAboveNav);
    document.getElementById('iasharkNoticeAccept').onclick = function(){
      setConsent('accepted');
      loadGA();
      bar.remove();
    };
    document.getElementById('iasharkNoticeDecline').onclick = function(){
      setConsent('refused');
      bar.remove();
    };
  }

  // DECISION PROPRIETAIRE (2026-09-13, confirmee explicitement) : plus de
  // bandeau de consentement. Google Analytics est charge des l'arrivee pour
  // tous les visiteurs. Risque signale au proprietaire : en France/UE la CNIL
  // exige un consentement prealable pour Google Analytics ; au Royaume-Uni,
  // en Afrique du Sud et au Mexique une information claire + un moyen simple
  // de s'y opposer suffisent. Opposition : lien [data-analytics-optout] sur
  // la page cookies, ou window.IasharkAnalyticsOptOut(). Un refus deja
  // exprime avec l'ancien bandeau reste respecte.
  window.IasharkAnalyticsOptOut = function(){
    setConsent('refused');
    window['ga-disable-' + GA_ID] = true;
    try{
      document.cookie.split(';').forEach(function(c){
        var name = c.split('=')[0].trim();
        if(/^_ga/.test(name)){
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; domain=.' + location.hostname.replace(/^www\./, '');
          document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
        }
      });
    }catch(e){}
  };

  if(getConsent() === 'refused'){
    window['ga-disable-' + GA_ID] = true;
  } else {
    loadGA();
  }

  function wireOptOut(){
    var els = document.querySelectorAll('[data-analytics-optout]');
    for(var i = 0; i < els.length; i++){
      els[i].addEventListener('click', function(ev){
        ev.preventDefault();
        window.IasharkAnalyticsOptOut();
        this.textContent = t('analytics_optout.done', 'Statistiques Google Analytics désactivées sur ce navigateur.');
      });
    }
  }
  if(document.readyState === 'loading'){ document.addEventListener('DOMContentLoaded', wireOptOut); } else { wireOptOut(); }
})();

/* Suivi interne anonyme des visites (funnel-track.js) charge sur TOUTES les
   pages depuis ce script partage. Sans cookie ni lien avec un compte : voir
   l'en-tete de funnel-track.js. */
(function(){
  if(window.__iasharkTrackLoaded || document.querySelector('script[src$="funnel-track.js"]')) return;
  var s = document.createElement('script');
  s.src = '/funnel-track.js';
  s.defer = true;
  document.head.appendChild(s);
})();
