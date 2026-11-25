/* Préférences partagées sur toutes les pages : chargement de Google Analytics,
   opposition (opt-out), liens internes localisés. L'ancien bandeau de
   consentement a été retiré (décision propriétaire du 2026-09-13, voir plus bas) ;
   son code mort, qui pointait encore vers /confidentialite.html racine, est supprimé.
   Historique du bandeau :
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
    // Meme opposition pour PostHog (revoir les visites, tests A/B).
    try{ if(window.posthog && window.posthog.opt_out_capturing) window.posthog.opt_out_capturing(); }catch(e){}
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

/* PostHog (25/11/2026, choix de Clement) : SEULEMENT pour revoir des visites
   (enregistrements d'ecran) et faire des tests A/B. Le tunnel (visites,
   inscriptions, paiements) reste mesure par funnel-track.js : pas de doublon.
   Meme regle que Google Analytics (decision du 13/09) : charge pour tous,
   opposition respectee (iashark_cookie_consent = refused). Jamais charge :
   hors iashark.com, sur l'admin, pour les robots et navigateurs pilotes, ni
   pour le trafic interne (iashark_internal = 1). Tout ce qui est tape dans
   un champ est masque dans les enregistrements (maskAllInputs). Serveur
   europeen (eu.i.posthog.com). La cle phc_ est publique par conception. */
(function(){
  try{
    if(window.posthog && window.posthog.__loaded) return;
    if(!/^(www\.)?iashark\.com$/.test(location.hostname)) return;
    if(/\/admin/.test(location.pathname)) return;
    if(window.__iasharkLangRedirecting) return;
    var ua = navigator.userAgent || '';
    if(navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|playwright|puppeteer|phantom/i.test(ua)) return;
    if(localStorage.getItem('iashark_cookie_consent') === 'refused') return;
    if(localStorage.getItem('iashark_internal') === '1' || /[?&]internal=1/.test(location.search)) return;
  }catch(e){ return; }
  /* Code d'installation officiel de PostHog (Web, HTML snippet), inchange. */
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog && window.posthog.__loaded)||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}p||((p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",p.onerror=function(){p=null},(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r));var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],Object.defineProperty(u,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e}}),Object.defineProperty(u.people,"toString",{configurable:!0,enumerable:!0,writable:!0,value:function(){return u.toString(1)+".people (stub)"}}),o="Eh Rh Ph Oh Dh qh init yd bd dd fd Sd wc md xd ad Ed Ad Rd Pd Od Fd capture getExtension gr pd gd calculateEventProperties Dd register register_once register_for_session unregister unregister_for_session zd hd jd getFeatureFlag getFeatureFlagPayload getFeatureFlagResult getAllFeatureFlags isFeatureEnabled reloadFeatureFlags updateFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys onActiveMatchingSurveysChanged renderSurvey displaySurvey cancelPendingSurvey canRenderSurvey canRenderSurveyAsync Hd identify setPersonProperties unsetPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset Ud shutdown setIdentity clearIdentity get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException addExceptionStep captureLog startExceptionAutocapture stopExceptionAutocapture loadToolbar get_property getSessionProperty qd Td createPersonProfile setInternalOrTestUser Bd Uh zh opt_in_capturing opt_out_capturing Hh has_opted_in_capturing has_opted_out_capturing get_explicit_consent_status is_capturing clear_opt_in_out_capturing $d debug kc Ds getPageViewId captureTraceFeedback captureTraceMetric rd".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  window.posthog.init('phc_r4PvKrhbJaLUua3s54LuYkES5VCNzwJekkNNXeBvWmNC', {
    api_host: 'https://eu.i.posthog.com',
    defaults: '2026-05-30',
    person_profiles: 'identified_only',
    session_recording: { maskAllInputs: true }
  });
})();

/* Mesure interne des visites (funnel-track.js) chargee sur TOUTES les pages
   depuis ce script partage. Sans cookie ; pour un utilisateur CONNECTE, les
   evenements portent l'identifiant du compte (sauf option « Ne pas lier mes
   visites a mon compte ») - voir l'en-tete de funnel-track.js et la page
   cookies (audit du 18/09/2026 : l'ancien commentaire disait le contraire). */
(function(){
  if(window.__iasharkTrackLoaded || document.querySelector('script[src$="funnel-track.js"]')) return;
  var s = document.createElement('script');
  s.src = '/funnel-track.js';
  s.defer = true;
  document.head.appendChild(s);
})();

/* Panneau Lolly Bet (lib/lolly-panneau.js, 15/11/2026) : charge sur les pages
   non exclues (jamais connexion, inscription, compte, paiement, Pro, page Lolly ni
   admin). Le script le montre jusqu'a ce qu'il soit ferme, une fois par jour
   (version 2 du 15/11 soir : la v1 ne l'ouvrait que sur la premiere page de la
   visite et le comptait vu des l'affichage, Clement ne l'a jamais vu). */
(function(){
  try{
    if(window.__iasharkLangRedirecting) return;
    if(/\/(connexion|inscription|mot-de-passe-oublie|reinitialiser-mot-de-passe|compte|abonnement|checkout-annule|checkout-succes|desinscription-email|pro|lolly|partenaires-conditions|admin|maintenance|404)(\.html)?$/.test(location.pathname)) return;
    if(navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly/i.test(navigator.userAgent || '')) return;
    var s = document.createElement('script');
    s.src = '/lib/lolly-panneau.js';
    s.defer = true;
    document.head.appendChild(s);
  }catch(e){}
})();

/* « Nous contacter » (pied de page) et fenetre d'essai gratuit des comptes
   gratuits connectes : lib/contact-essai.js (30/10/2026), charge sur TOUTES
   les pages depuis ce script partage, comme la mesure des visites. */
(function(){
  if(window.__iasharkContactEssai || document.querySelector('script[src$="/lib/contact-essai.js"]')) return;
  var s = document.createElement('script');
  s.src = '/lib/contact-essai.js';
  s.defer = true;
  document.head.appendChild(s);
})();
