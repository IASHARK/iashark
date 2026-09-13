/* IASHARK i18n runtime (MASTER V2.1 §19) + routage GEO. Site statique sans
   bundler : ce script est charge sur chaque page generee (scripts/build-locales.js
   l'injecte quand la page source ne le charge pas deja), detecte le repertoire
   depuis le chemin de l'URL (/fr/ /en/ /es/ /de/ /it/ /pt/ = langues, /gb/ /za/
   /mx/ = marches pays), charge le dictionnaire correspondant, et applique les
   traductions aux elements marques data-i18n. Ne traduit JAMAIS les
   identifiants sportifs (noms d'equipes/joueurs/competitions) ni les donnees
   SOURCE_API/CALCULATED (cotes, probabilites, scores) - uniquement le texte
   d'interface.

   Liens internes : I18N.href("compte.html#plan") -> "/gb/compte.html#plan" sur
   une page /gb/, "/compte.html" sur une page racine sans prefixe. Forme
   d'appel attendue dans les scripts de page :
     (window.I18N&&window.I18N.href)?window.I18N.href("x.html"):"/x.html"
   Selecteur langue/pays : I18N.switcherOptions() (donnees) ou
   I18N.mountSwitcher(el) (rendu simple). */
(function(global){
  "use strict";
  var SUPPORTED = ["fr","en","es","es-mx","de","it","pt"];
  var DEFAULT_LOCALE = "fr";
  var DEFAULT_DIR = "fr";

  // Repertoires publics generes par scripts/build-locales.js - miroir de
  // config/markets.json#_dirs (coherence verifiee par tests/geo-dirs.test.js).
  // Ordre = ordre du selecteur. Un marche (gb/za/mx) pointe vers UN
  // dictionnaire existant (en / es-mx) : jamais de fork de dictionnaire.
  var DIRS = [
    {dir:"fr", locale:"fr",    htmlLang:"fr",    intl:"fr-FR", market:"fr", blog:"",   label:"Français"},
    {dir:"gb", locale:"en",    htmlLang:"en-GB", intl:"en-GB", market:"gb", blog:"en", label:"English (UK)"},
    {dir:"za", locale:"en",    htmlLang:"en-ZA", intl:"en-ZA", market:"za", blog:"en", label:"English (South Africa)"},
    {dir:"en", locale:"en",    htmlLang:"en",    intl:"en-GB", market:"fr", blog:"en", label:"English (International)"},
    {dir:"mx", locale:"es-mx", htmlLang:"es-MX", intl:"es-MX", market:"mx", blog:"mx", label:"Español (México)"},
    {dir:"es", locale:"es",    htmlLang:"es",    intl:"es-ES", market:"fr", blog:"es", label:"Español"},
    {dir:"de", locale:"de",    htmlLang:"de",    intl:"de-DE", market:"fr", blog:"de", label:"Deutsch"},
    {dir:"it", locale:"it",    htmlLang:"it",    intl:"it-IT", market:"fr", blog:"it", label:"Italiano"},
    {dir:"pt", locale:"pt",    htmlLang:"pt",    intl:"pt-PT", market:"fr", blog:"pt", label:"Português"}
  ];
  var DIR_BY_CODE = {};
  DIRS.forEach(function(d){ DIR_BY_CODE[d.dir] = d; });
  var hasOwn = Object.prototype.hasOwnProperty;
  function isDir(code){ return hasOwn.call(DIR_BY_CODE, code); }

  // Compat : ancienne table marche -> dictionnaire (toujours valable).
  var MARKET_LOCALE = {gb:"en", mx:"es-mx", za:"en"};
  // Locale de dictionnaire -> repertoire de langue correspondant.
  var LOCALE_DIR = {fr:"fr", en:"en", es:"es", "es-mx":"mx", de:"de", it:"it", pt:"pt"};
  var LOCALE_INTL = {fr:"fr-FR", en:"en-GB", es:"es-ES", "es-mx":"es-MX", de:"de-DE", it:"it-IT", pt:"pt-PT"};

  // Pages presentes dans CHAQUE repertoire (scripts/i18n-manifest.js + pages
  // legales config/markets.json#_legalFiles). Tout autre chemin (/data.json,
  // /match/123.html, /assets/...) reste une ressource partagee non prefixee.
  var LOCALIZED_PAGES = {};
  [
    "index.html","marches.html","match.html","pro.html","compte.html","joueur.html",
    "connexion.html","inscription.html","mot-de-passe-oublie.html","reinitialiser-mot-de-passe.html",
    "a-propos.html","abonnement.html","exemple-analyse.html","checkout-annule.html",
    "checkout-succes.html","404.html","landing.html",
    "mentions-legales.html","cgv.html","confidentialite.html","cookies.html","jeu-responsable.html"
  ].forEach(function(p){ LOCALIZED_PAGES[p] = true; });

  var DIR_PREFIX_RE = /^\/([a-z]{2})(\/.*)?$/;

  function pathDir(pathname){
    var m = String(pathname || "").match(DIR_PREFIX_RE);
    return (m && isDir(m[1])) ? m[1] : "";
  }
  function currentLocation(){
    try { return global.location || {pathname:"/", search:"", hash:""}; }
    catch(e){ return {pathname:"/", search:"", hash:""}; }
  }
  var CURRENT_DIR = pathDir(currentLocation().pathname);

  function savedDir(){
    try{
      var d = global.localStorage.getItem("iashark_dir");
      return d && isDir(d) ? d : "";
    }catch(e){ return ""; }
  }

  function detectLocale(){
    if (CURRENT_DIR) return DIR_BY_CODE[CURRENT_DIR].locale;
    // Page sans prefixe (ex: /match/12345.html, /blog/...) : dernier choix
    // explicite de l'utilisateur, sinon FR par defaut.
    try{
      var saved = global.localStorage.getItem("iashark_lang");
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    }catch(e){}
    return DEFAULT_LOCALE;
  }

  function splitSuffix(p){
    var i = p.search(/[?#]/);
    return i === -1 ? [p, ""] : [p.slice(0, i), p.slice(i)];
  }

  // Chemin d'une page dans un repertoire donne ("" = racine sans prefixe).
  function hrefFor(page, dir){
    var raw = page == null ? "" : String(page);
    if (/^[a-z][a-z0-9+.\-]*:/i.test(raw) || raw.indexOf("//") === 0) return raw;
    var parts = splitSuffix(raw.replace(/^\/+/, ""));
    var p = parts[0], suffix = parts[1];
    var conf = dir && isDir(dir) ? DIR_BY_CODE[dir] : null;
    var first = p.split("/")[0];
    if (p.indexOf("/") !== -1 && isDir(first)) return "/" + p + suffix; // deja prefixe
    if (p === "blog.html" || p === "blog" || p.indexOf("blog/") === 0){
      // Blog : /<langue>/blog/ pour en es de it pt, /en/blog/ pour gb et za,
      // /mx/blog/ pour mx (guides es-MX dedies), blog FR racine pour fr et les pages racine.
      var rest = p.indexOf("blog/") === 0 ? p.slice(5) : "";
      if (conf && conf.blog) return "/" + conf.blog + "/blog/" + rest + suffix;
      return (rest ? "/blog/" + rest : "/blog.html") + suffix;
    }
    if (p === "" || p === "index.html") return (conf ? "/" + conf.dir + "/" : "/") + suffix;
    if (hasOwn.call(LOCALIZED_PAGES, p)) return (conf ? "/" + conf.dir + "/" : "/") + p + suffix;
    return "/" + p + suffix;
  }

  // Meme page dans un autre repertoire (selecteur langue/pays).
  function switchHref(target, loc){
    loc = loc || currentLocation();
    if (!isDir(target)) target = DEFAULT_DIR;
    var path = loc.pathname || "/";
    var m = path.match(DIR_PREFIX_RE);
    var rest = (m && isDir(m[1])) ? (m[2] || "/") : path;
    var bare = rest.replace(/^\/+/, "");
    var staticMatch = bare.match(/^match\/(\d+)\.html$/);
    if (staticMatch) return hrefFor("match.html?id=" + staticMatch[1], target);
    // Les slugs d'articles peuvent etre traduits : on vise l'accueil du blog.
    if (bare === "blog.html" || bare === "blog" || bare.indexOf("blog/") === 0) return hrefFor("blog.html", target);
    if (bare === "" || hasOwn.call(LOCALIZED_PAGES, bare)) {
      return hrefFor(bare, target) + (loc.search || "") + (loc.hash || "");
    }
    return hrefFor("", target);
  }

  // Compat : localizePath(path, locale|dir) -> meme chemin dans le repertoire.
  function localizePath(path, code){
    var dir = hasOwn.call(LOCALE_DIR, code) ? LOCALE_DIR[code] : code;
    if (!isDir(dir)) dir = DEFAULT_DIR;
    return switchHref(dir, {pathname: path, search: "", hash: ""});
  }

  function get(obj, path){
    var parts = path.split(".");
    var cur = obj;
    for (var i=0; i<parts.length; i++){
      if (cur == null) return null;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function escHtml(s){
    return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  }

  var dictCache = {};
  function loadDict(locale){
    if (dictCache[locale]) return Promise.resolve(dictCache[locale]);
    return fetch("/i18n/dict/" + locale + ".json").then(function(r){
      if (!r.ok) throw new Error("dict fetch failed: " + r.status);
      return r.json();
    }).then(function(d){ dictCache[locale] = d; return d; });
  }

  var LOCALE = detectLocale();

  var I18N = {
    locale: LOCALE,
    supported: SUPPORTED,
    defaultLocale: DEFAULT_LOCALE,
    defaultDir: DEFAULT_DIR,
    dict: null,
    // Repertoire courant ("" pour une page racine sans prefixe).
    dir: CURRENT_DIR,
    // Cle de marche (config/markets.json) : "gb" | "za" | "mx" | "fr" (EUR par defaut).
    market: CURRENT_DIR ? DIR_BY_CODE[CURRENT_DIR].market : "fr",
    // Valeur de <html lang> pour le repertoire courant (en-GB, en-ZA, es-MX...).
    htmlLang: CURRENT_DIR ? DIR_BY_CODE[CURRENT_DIR].htmlLang : LOCALE,
    marketLocale: MARKET_LOCALE,
    dirs: DIRS.map(function(d){ return {dir:d.dir, locale:d.locale, htmlLang:d.htmlLang, market:d.market, label:d.label}; }),

    localizePath: localizePath,

    // I18N.href("compte.html#plan") -> "/gb/compte.html#plan" (page /gb/),
    // "/compte.html" (page racine). Ne depend pas de `this`.
    href: function(page){ return hrefFor(page, CURRENT_DIR); },
    hrefFor: hrefFor,
    blogHref: function(){ return hrefFor("blog.html", CURRENT_DIR); },
    switchHref: function(targetDir){ return switchHref(targetDir); },

    // Options du selecteur, dans l'ordre : Français, English (UK), English
    // (South Africa), English (International), Español (México), Español,
    // Deutsch, Italiano, Português. href = meme page dans le repertoire cible.
    switcherOptions: function(){
      var active = CURRENT_DIR || savedDir() || DEFAULT_DIR;
      return DIRS.map(function(d){
        return {dir:d.dir, label:d.label, locale:d.locale, hreflang:d.htmlLang, market:d.market,
          href: switchHref(d.dir), active: d.dir === active};
      });
    },

    // A appeler au clic sur une option du selecteur (memorise le choix pour
    // les pages sans prefixe).
    rememberChoice: function(dir){
      if (!isDir(dir)) return;
      try{
        global.localStorage.setItem("iashark_dir", dir);
        global.localStorage.setItem("iashark_lang", DIR_BY_CODE[dir].locale);
      }catch(e){}
    },

    t: function(key, fallback){
      var v = this.dict ? get(this.dict, key) : null;
      return v != null ? v : (fallback != null ? fallback : key);
    },

    formatDate: function(dateStr, opts){
      try{
        var d = (dateStr instanceof Date) ? dateStr : new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return new Intl.DateTimeFormat(this.localeTag(), opts || {day:"2-digit",month:"2-digit",year:"numeric"}).format(d);
      }catch(e){ return dateStr; }
    },
    formatNumber: function(n, opts){
      try{ return new Intl.NumberFormat(this.localeTag(), opts).format(n); }
      catch(e){ return String(n); }
    },
    formatCurrency: function(n, currency){
      try{ return new Intl.NumberFormat(this.localeTag(), {style:"currency", currency: currency || "EUR"}).format(n); }
      catch(e){ return n + " " + (currency||"EUR"); }
    },
    localeTag: function(){
      if (CURRENT_DIR) return DIR_BY_CODE[CURRENT_DIR].intl;
      return LOCALE_INTL[this.locale] || "fr-FR";
    },

    applyToDom: function(root){
      root = root || document;
      var self = this;
      root.querySelectorAll("[data-i18n]").forEach(function(el){
        var key = el.getAttribute("data-i18n");
        var val = self.t(key, null);
        if (val != null) el.textContent = val;
      });
      root.querySelectorAll("[data-i18n-attr]").forEach(function(el){
        var spec = el.getAttribute("data-i18n-attr"); // "placeholder:key1,title:key2"
        spec.split(",").forEach(function(pair){
          var parts = pair.split(":");
          if (parts.length !== 2) return;
          var val = self.t(parts[1].trim(), null);
          if (val != null) el.setAttribute(parts[0].trim(), val);
        });
      });
      root.querySelectorAll("[data-i18n-href-locale]").forEach(function(el){
        var href = el.getAttribute("href");
        if (!href || href.charAt(0) !== "/") return;
        var dir = CURRENT_DIR || LOCALE_DIR[self.locale] || DEFAULT_DIR;
        el.setAttribute("href", hrefFor(href, dir));
      });
    },

    switcherHtml: function(){
      return this.switcherOptions().map(function(o){
        var active = o.active ? ' aria-current="true" style="color:var(--cyan)"' : "";
        return '<a href="' + escHtml(o.href) + '" hreflang="' + o.hreflang + '" lang="' + o.hreflang + '"' + active +
          ' data-dir-link="' + o.dir + '" data-lang-link="' + o.locale + '">' + escHtml(o.label) + "</a>";
      }).join(" · ");
    },

    mountSwitcher: function(selector){
      var el = typeof selector === "string" ? document.querySelector(selector) : selector;
      if (!el) return;
      el.innerHTML = this.switcherHtml();
      var self = this;
      el.querySelectorAll("[data-dir-link]").forEach(function(a){
        a.addEventListener("click", function(){ self.rememberChoice(a.getAttribute("data-dir-link")); });
      });
    },

    init: function(){
      var self = this;
      // Memorise la langue (et le repertoire) reellement consultes - la
      // detection pays/navigateur ne sert que sur la racine "/", geree par la
      // redirection statique (_redirects), jamais ici.
      try{
        global.localStorage.setItem("iashark_lang", this.locale);
        if (CURRENT_DIR) global.localStorage.setItem("iashark_dir", CURRENT_DIR);
      }catch(e){}
      return loadDict(this.locale).then(function(d){
        self.dict = d;
        self.applyToDom(document);
        document.documentElement.setAttribute("lang", self.htmlLang);
        return self;
      }).catch(function(e){
        console.error("i18n load error", e);
        return self;
      });
    }
  };

  global.I18N = I18N;
})(typeof window !== "undefined" ? window : this);
