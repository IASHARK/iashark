(function(){
  'use strict';
  // Chaque repertoire public (langues /fr/ /en/ /es/ /de/ /it/ /pt/, marches
  // pays /gb/ /za/ /mx/) contient desormais TOUTES les pages publiques
  // (scripts/build-locales.js) : la navigation reste donc toujours dans le
  // repertoire courant (/gb/pro.html, /mx/compte.html...). Blog : /<langue>/blog/,
  // /en/blog/ pour gb et za, /mx/blog/ pour mx, blog FR racine pour fr.
  // I18N.href (i18n/i18n.js) fait foi quand il est charge ; le repli ci-dessous
  // applique exactement la meme regle.
  var BLOG_DIR={fr:'',en:'en',es:'es',de:'de',it:'it',pt:'pt',gb:'en',za:'en',mx:'mx'};
  var segMatch=location.pathname.match(/^\/([a-z]{2})(?:\/|$)/);
  var dir=(segMatch&&BLOG_DIR.hasOwnProperty(segMatch[1]))?segMatch[1]:'';
  function href(page){
    if(window.I18N&&window.I18N.href)return window.I18N.href(page);
    if(page==='blog.html')return BLOG_DIR[dir]?'/'+BLOG_DIR[dir]+'/blog/':'/blog.html';
    return (dir?'/'+dir:'')+'/'+(page==='index.html'?'':page);
  }
  var rest=(dir?location.pathname.slice(dir.length+1):location.pathname).replace(/\/+$/,'')||'/';
  var active=/^\/blog(\.html|\/|$)/.test(rest)?'blog':/\/pro\.html$/.test(rest)?'tools':/\/compte\.html$/.test(rest)?'account':(rest==='/'||/^\/(index|landing)\.html$/.test(rest))?'home':'';
  // Libelles : les 4 valeurs par defaut ci-dessous sont le repli FR - ce
  // composant est charge sur toutes les pages/langues, donc jamais de texte
  // en dur affiche tel quel sans passer par t() (meme discipline que le
  // reste du chantier i18n de cette session). Cle dictionnaire existante :
  // nav.home/tools/guides/account (i18n/dict/*.json).
  function t(key,fallback){return (window.I18N && window.I18N.t) ? window.I18N.t(key,fallback) : fallback;}
  var items=[
    {id:'home',href:href('index.html'),key:'nav.home',label:'Accueil',icon:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'},
    {id:'tools',href:href('pro.html'),key:'nav.tools',label:'Outils',icon:'<path d="m12 2 2.9 6.6 7.1.7-5 4.9 1.2 7.8-6.2-3.7L5.8 22 7 14.2 2 9.3l7.1-.7Z"/>'},
    {id:'blog',href:href('blog.html'),key:'nav.guides',label:'Blog',icon:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'},
    {id:'account',href:href('compte.html'),key:'nav.account',label:'Compte',icon:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'}
  ];
  function renderLabel(item){return t(item.key,item.label);}
  var nav=document.createElement('nav');
  nav.className='site-bottom-nav';
  // aria-label traduit : cle geo.nav.aria_label (i18n/parts/geo.<locale>.json),
  // repli FR tant que le dictionnaire n'est pas charge.
  function ariaLabel(){return t('geo.nav.aria_label','Navigation principale');}
  nav.setAttribute('aria-label',ariaLabel());
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
      nav.setAttribute('aria-label',ariaLabel());
      items.forEach(function(item){
        var el=nav.querySelector('[data-nav-id="'+item.id+'"]');
        if(el)el.textContent=renderLabel(item);
      });
    });
  }
})();
