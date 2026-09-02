/* En-tete de site partage — logo, navigation haute, et surtout ETAT DE CONNEXION.
 *
 * Pourquoi ce fichier existe : les pages du blog (/blog/index.html,
 * /blog/guides/*.html) etaient un ilot separe du reste du site. Elles ne
 * chargeaient ni supabase-js ni auth-header.js, donc un visiteur connecte y
 * apparaissait toujours comme deconnecte - alors que toutes les autres pages
 * affichent bien son compte. C'est le bug rapporte : "quand une personne se
 * connecte elle doit voir qu'elle est connectee sur toutes les pages, mais
 * sur le blog ca ne le fait jamais".
 *
 * Ce script est la reponse durable : UNE ligne a inclure sur n'importe quelle
 * page du site, et l'en-tete devient identique partout, avec la session.
 * Meme principe que bottom-navigation.js (qui remplace deja les barres de
 * navigation historiques par la barre partagee) : on remplace l'en-tete
 * existant de la page (.hdr ou .topbar) plutot que d'en ajouter un second.
 *
 * Il charge lui-meme supabase-js puis auth-header.js si la page ne les a pas
 * deja - une page n'a donc rien d'autre a faire que d'inclure ce script.
 * Le CSS est embarque ici (et non dans une feuille externe) pour que les
 * anciennes pages du blog, qui ont leur propre theme, recoivent quand meme
 * l'en-tete aux couleurs du site sans dependre de leur feuille de style.
 */
(function(){
  'use strict';
  if (window.__iasharkSiteHeader) return;
  window.__iasharkSiteHeader = true;

  var SUPABASE_UMD = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';

  var localeMatch = location.pathname.match(/^\/(fr|en|es|de|it|pt)(?:\/|$)/);
  var prefix = localeMatch ? '/' + localeMatch[1] : '';

  var CSS = ''
    + '.site-header{position:sticky;top:0;z-index:120;display:flex;align-items:center;gap:18px;'
    + 'height:64px;padding:0 max(20px,calc((100vw - 1180px)/2));'
    + 'background:rgba(4,10,17,.94);backdrop-filter:blur(12px);border-bottom:1px solid #132738;}'
    + '.site-header__brand{display:flex;align-items:center;text-decoration:none;font-family:"Bebas Neue",Impact,sans-serif;'
    + 'font-size:23px;letter-spacing:2.5px;color:#f4f7fa;line-height:1;}'
    + '.site-header__brand span{color:#16d6f4;}'
    + '.site-header__brand img{width:132px;height:40px;object-fit:contain;object-position:left center;}'
    + '.site-header__nav{display:flex;align-items:center;gap:6px;margin-left:6px;}'
    + '.site-header__nav a{font-family:"Space Mono",ui-monospace,monospace;font-size:9.5px;letter-spacing:1.4px;'
    + 'text-transform:uppercase;color:#9baec0;text-decoration:none;padding:7px 11px;border-radius:8px;transition:.18s;}'
    + '.site-header__nav a:hover{color:#16d6f4;background:rgba(22,214,244,.07);text-decoration:none;}'
    + '.site-header__nav a[aria-current="page"]{color:#16d6f4;background:rgba(22,214,244,.1);}'
    + '.site-header__actions{margin-left:auto;display:flex;align-items:center;gap:12px;}'
    + '.site-header__actions .btn-login{display:inline-block;border:1px solid #1a4960;border-radius:9px;padding:9px 14px;'
    + 'color:#16d6f4;text-decoration:none;background:none;cursor:pointer;'
    + 'font-family:"Space Mono",ui-monospace,monospace;font-weight:700;font-size:10px;letter-spacing:.5px;white-space:nowrap;}'
    + '.site-header__actions .btn-login:hover{border-color:#16d6f4;text-decoration:none;}'
    + '@media(max-width:720px){.site-header{gap:10px;height:58px;padding:0 14px;}'
    + '.site-header__nav{display:none;}.site-header__brand img{width:108px;height:34px;}}';

  // Liens hauts : les memes reperes que la barre du bas, pour qu'un visiteur
  // arrive sur un article de blog par Google et retrouve immediatement le
  // produit (c'est le chemin de conversion principal du blog).
  var NAV = [
    { href: prefix + '/',           label: 'Analyses du jour', match: function(p){ return p === '/' || p === prefix || p === prefix + '/' || /\/(index|landing)\.html$/.test(p); } },
    { href: prefix + '/pro.html',   label: 'Outils',           match: function(p){ return /\/pro\.html$/.test(p); } },
    { href: '/blog.html',           label: 'Blog',             match: function(p){ return p.indexOf('/blog') === 0; } }
  ];

  function injectStyle(){
    if (document.getElementById('iashark-site-header-style')) return;
    var s = document.createElement('style');
    s.id = 'iashark-site-header-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function buildHeader(){
    var path = location.pathname.replace(/\/+$/, '') || '/';
    var header = document.createElement('header');
    header.className = 'site-header';
    header.innerHTML = ''
      + '<a class="site-header__brand" href="' + prefix + '/" aria-label="IASHARK, accueil">'
      +   '<img src="/assets/iashark-logo.png" alt="IASHARK" '
      +   'onerror="this.outerHTML=\'<span>IA</span>SHARK\'">'
      + '</a>'
      + '<nav class="site-header__nav" aria-label="Navigation du site">'
      +   NAV.map(function(item){
            return '<a href="' + item.href + '"' + (item.match(path) ? ' aria-current="page"' : '') + '>' + item.label + '</a>';
          }).join('')
      + '</nav>'
      + '<div class="site-header__actions">'
      +   '<span id="authHeaderSlot"><a class="btn-login" href="' + prefix + '/compte.html">CONNEXION</a></span>'
      + '</div>';
    return header;
  }

  function loadScript(src){
    return new Promise(function(resolve, reject){
      var existing = document.querySelector('script[src="' + src + '"]');
      if (existing){
        if (existing.dataset.loaded === '1') return resolve();
        existing.addEventListener('load', function(){ resolve(); });
        existing.addEventListener('error', reject);
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.onload = function(){ s.dataset.loaded = '1'; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function mountHeader(){
    injectStyle();
    var header = buildHeader();
    // Remplace l'en-tete historique de la page plutot que d'en empiler deux
    // (meme strategie que bottom-navigation.js avec .nav-bottom/.bottom-nav).
    var legacy = document.querySelector('header.hdr, header.topbar, .topbar');
    if (legacy) legacy.replaceWith(header);
    else document.body.insertBefore(header, document.body.firstChild);

    // Etat de connexion : on n'echoue jamais bruyamment. Si supabase ou
    // auth-header.js ne se chargent pas, le bouton CONNEXION deja affiche
    // reste utilisable - une panne de session ne doit pas casser un article.
    Promise.resolve()
      .then(function(){ return window.supabase ? null : loadScript(SUPABASE_UMD); })
      .then(function(){ return window.IasharkAuthHeader ? null : loadScript('/auth-header.js'); })
      .then(function(){
        if (window.IasharkAuthHeader) window.IasharkAuthHeader.mount('#authHeaderSlot');
      })
      .catch(function(err){
        if (window.console) console.warn('[site-header] etat de connexion indisponible:', err && err.message);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountHeader);
  else mountHeader();
})();
