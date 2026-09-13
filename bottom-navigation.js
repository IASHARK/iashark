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
