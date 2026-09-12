(function(){
  'use strict';
  // GEO markets (config/markets.json: /gb /mx /za) are NOT interface locales -
  // they point to an existing locale dictionary (i18n/i18n.js MARKET_LOCALE)
  // but have no market-specific copy of shared app pages (pro.html/compte.html
  // only exist per-LOCALE, e.g. /en/, never per-market, e.g. /gb/). So a market
  // page keeps its own prefix for its own home link, but routes Outils/Compte
  // through the underlying locale instead of 404-ing on e.g. /gb/pro.html.
  var MARKET_LOCALE={gb:'en',mx:'es-mx',za:'en'};
  // Repertoire de PAGES partagees (pro.html/compte.html) reellement present
  // sur disque pour chaque marche - distinct de MARKET_LOCALE (dictionnaire
  // de traduction) car es-mx n'a pas son propre repertoire de pages, juste
  // un dictionnaire. mx retombe donc sur les pages /es/ (le plus proche
  // repertoire reel), jamais sur /es-mx/pro.html qui n'existe pas (404 reel
  // trouve et corrige - voir historique du depot).
  var MARKET_PAGE_LOCALE={gb:'en',mx:'es',za:'en'};
  var segMatch=location.pathname.match(/^\/([a-z]{2}(?:-[a-z]{2})?)(?:\/|$)/);
  var seg=segMatch?segMatch[1]:'';
  var isLocale=/^(fr|en|es|de|it|pt)$/.test(seg);
  var isMarket=MARKET_LOCALE.hasOwnProperty(seg);
  var locale=isLocale?seg:(isMarket?MARKET_LOCALE[seg]:'');
  var pageLocale=isLocale?seg:(isMarket?MARKET_PAGE_LOCALE[seg]:'');
  var ownPrefix=(isLocale||isMarket)?'/'+seg:'';
  var sharedPrefix=pageLocale?'/'+pageLocale:'';
  var path=location.pathname.replace(/\/+$/,'')||'/';
  var active=path.indexOf('/blog')===0?'blog':path.endsWith('/pro.html')?'tools':path.endsWith('/compte.html')?'account':(path==='/'||path===ownPrefix||path===ownPrefix+'/'||path.endsWith('/index.html')||path.endsWith('/landing.html'))?'home':'';
  // Libelles : les 4 valeurs par defaut ci-dessous sont le repli FR - ce
  // composant est charge sur toutes les pages/langues, donc jamais de texte
  // en dur affiche tel quel sans passer par t() (meme discipline que le
  // reste du chantier i18n de cette session). Cle dictionnaire existante :
  // nav.home/tools/guides/account (i18n/dict/*.json).
  function t(key,fallback){return (window.I18N && window.I18N.t) ? window.I18N.t(key,fallback) : fallback;}
  var items=[
    {id:'home',href:ownPrefix+'/',key:'nav.home',label:'Accueil',icon:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'},
    {id:'tools',href:sharedPrefix+'/pro.html',key:'nav.tools',label:'Outils',icon:'<path d="m12 2 2.9 6.6 7.1.7-5 4.9 1.2 7.8-6.2-3.7L5.8 22 7 14.2 2 9.3l7.1-.7Z"/>'},
    {id:'blog',href:'/blog.html',key:'nav.guides',label:'Blog',icon:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'},
    {id:'account',href:sharedPrefix+'/compte.html',key:'nav.account',label:'Compte',icon:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'}
  ];
  function renderLabel(item){return t(item.key,item.label);}
  var nav=document.createElement('nav');
  nav.className='site-bottom-nav';
  nav.setAttribute('aria-label','Navigation principale');
  nav.innerHTML=items.map(function(item){
    return '<a class="site-bottom-nav__item" href="'+item.href+'"'+(active===item.id?' aria-current="page"':'')+'><svg class="site-bottom-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+item.icon+'</svg><span class="site-bottom-nav__label" data-nav-id="'+item.id+'">'+renderLabel(item)+'</span></a>';
  }).join('');
  var legacy=document.querySelector('.nav-bottom,.bottom-nav');
  if(legacy)legacy.replaceWith(nav);else document.body.appendChild(nav);
  // Au premier rendu, le dictionnaire n'est pas forcement deja charge (ce
  // script peut s'executer avant qu'un autre appelle I18N.init() sur la
  // page) - on relabelle une fois pret, sans jamais dupliquer le fetch
  // (I18N.init()/loadDict() sont deja mis en cache par i18n.js).
  if(window.I18N && window.I18N.init){
    window.I18N.init().then(function(){
      items.forEach(function(item){
        var el=nav.querySelector('[data-nav-id="'+item.id+'"]');
        if(el)el.textContent=renderLabel(item);
      });
    });
  }
})();
