(function(){
  'use strict';
  var localeMatch=location.pathname.match(/^\/(fr|en|es|de|it|pt)(?:\/|$)/);
  var locale=localeMatch?localeMatch[1]:'';
  var prefix=locale?'/'+locale:'';
  var path=location.pathname.replace(/\/+$/,'')||'/';
  var active=path.indexOf('/blog')===0?'blog':path.endsWith('/pro.html')?'tools':path.endsWith('/compte.html')?'account':(path==='/'||path===prefix||path===prefix+'/'||path.endsWith('/index.html')||path.endsWith('/landing.html'))?'home':'';
  var items=[
    {id:'home',href:prefix+'/',label:'Accueil',icon:'<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'},
    {id:'tools',href:prefix+'/pro.html',label:'Outils',icon:'<path d="m12 2 2.9 6.6 7.1.7-5 4.9 1.2 7.8-6.2-3.7L5.8 22 7 14.2 2 9.3l7.1-.7Z"/>'},
    {id:'blog',href:'/blog.html',label:'Blog',icon:'<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z"/>'},
    {id:'account',href:prefix+'/compte.html',label:'Compte',icon:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>'}
  ];
  var nav=document.createElement('nav');
  nav.className='site-bottom-nav';
  nav.setAttribute('aria-label','Navigation principale');
  nav.innerHTML=items.map(function(item){
    return '<a class="site-bottom-nav__item" href="'+item.href+'"'+(active===item.id?' aria-current="page"':'')+'><svg class="site-bottom-nav__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+item.icon+'</svg><span class="site-bottom-nav__label">'+item.label+'</span></a>';
  }).join('');
  var legacy=document.querySelector('.nav-bottom,.bottom-nav');
  if(legacy)legacy.replaceWith(nav);else document.body.appendChild(nav);
})();
