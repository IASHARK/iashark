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

  function showBanner(){
    injectStyle();
    var bar = document.createElement('div');
    bar.className = 'iashark-notice-bar';
    bar.id = 'iasharkNoticeBar';
    bar.innerHTML = '<p>On utilise des cookies essentiels au fonctionnement du site, et des cookies analytiques '
      +'(Google Analytics) pour comprendre l\'usage du site — uniquement avec ton accord. '
      +'<a href="/confidentialite.html">En savoir plus</a></p>'
      +'<div class="iashark-notice-actions">'
      +'<button type="button" class="iashark-notice-decline" id="iasharkNoticeDecline">REFUSER</button>'
      +'<button type="button" class="iashark-notice-accept" id="iasharkNoticeAccept">ACCEPTER</button>'
      +'</div>';
    document.body.appendChild(bar);
    var nav = document.querySelector('.nav-bottom');
    if(nav){ bar.style.bottom = nav.getBoundingClientRect().height + 'px'; }
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

  var consent = getConsent();
  if(consent === 'accepted'){
    loadGA();
  } else if(consent !== 'refused'){
    showBanner();
  }
})();
