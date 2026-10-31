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
    {dir:"en", locale:"en",    htmlLang:"en",    intl:"en-GB", market:"us", blog:"en", label:"English (International)"},
    {dir:"mx", locale:"es-mx", htmlLang:"es-MX", intl:"es-MX", market:"mx", blog:"mx", label:"Español (México)"},
    {dir:"es", locale:"es",    htmlLang:"es",    intl:"es-ES", market:"fr", blog:"es", label:"Español"}
    // de / it / pt retires le 25/09/2026 (config/markets.json#_retiredDirs) :
    // /de/*, /it/*, /pt/* sont rediriges en 301 vers /en/.
  ];
  var DIR_BY_CODE = {};
  DIRS.forEach(function(d){ DIR_BY_CODE[d.dir] = d; });
  var hasOwn = Object.prototype.hasOwnProperty;
  function isDir(code){ return hasOwn.call(DIR_BY_CODE, code); }

  // Compat : ancienne table marche -> dictionnaire (toujours valable).
  var MARKET_LOCALE = {gb:"en", mx:"es-mx", za:"en"};
  // Locale de dictionnaire -> repertoire de langue correspondant.
  var LOCALE_DIR = {fr:"fr", en:"en", es:"es", "es-mx":"mx", de:"en", it:"en", pt:"en"};
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
    "mentions-legales.html","cgv.html","confidentialite.html","cookies.html","jeu-responsable.html",
    "methodologie.html",
    // 28/10/2026 : pages traduites oubliees ; depuis /gb/ ou /en/, leurs liens partaient
    // a la racine, redirigee vers /fr/ (un abonne anglophone a atterri sur /fr/partenaires.html).
    "combines.html","partenaires.html","partenaires-conditions.html","desinscription-email.html",
    // 30/10/2026 : page Contact.
    "contact.html"
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

  // Locale imposee par la page : <meta name="iashark-force-locale" content="fr">
  // (blog FR racine, pages editoriales sans prefixe). null sinon.
  function forcedLocale(){
    try{
      var doc = global.document;
      var el = doc && doc.querySelector && doc.querySelector('meta[name="iashark-force-locale"]');
      var v = el && el.getAttribute("content");
      return v && SUPPORTED.indexOf(v) !== -1 ? v : null;
    }catch(e){ return null; }
  }
  // <html lang> explicite d'une page statique sans prefixe (blog FR,
  // /match/<id>.html) : "fr" -> "fr", "es-MX" -> "es-mx". null sinon.
  function declaredLocale(){
    try{
      var doc = global.document;
      var lang = doc && doc.documentElement && doc.documentElement.getAttribute("lang");
      if (!lang) return null;
      var l = String(lang).toLowerCase();
      if (SUPPORTED.indexOf(l) !== -1) return l;
      var base = l.split("-")[0];
      return SUPPORTED.indexOf(base) !== -1 ? base : null;
    }catch(e){ return null; }
  }
  var FORCED_LOCALE = CURRENT_DIR ? null : forcedLocale();

  // Choix EXPLICITE du visiteur (selecteur, bandeau de suggestion) - distinct
  // de iashark_dir, qui memorise seulement le dernier repertoire consulte.
  var CHOSEN_KEY = "iashark_dir_chosen";
  // Racine "/" (_redirects, lib/lang-routing.js) : Netlify lit les cookies
  // nf_country / nf_lang A LA PLACE du pays GeoIP et de l'Accept-Language.
  // Un pays representatif par repertoire, route vers ce repertoire sans
  // condition de langue (verifie par tests/lang-routing.test.js) : apres un
  // choix, "/" renvoie toujours vers la version choisie.
  var CHOICE_COOKIES = {fr:["fr","fr"], gb:["gb","en"], za:["za","en"], en:["us","en"],
    mx:["mx","es"], es:["es","es"]};
  function setChoiceCookies(dir){
    var c = CHOICE_COOKIES[dir];
    if (!c) return;
    try{
      var doc = global.document;
      if (!doc) return;
      var loc = currentLocation();
      // 13 mois maximum (recommandation CNIL) ; cookie fonctionnel pose a la
      // demande du visiteur (choix de langue), sans donnee personnelle.
      var tail = "; Path=/; Max-Age=31536000; SameSite=Lax" + (loc.protocol === "https:" ? "; Secure" : "");
      doc.cookie = "nf_country=" + c[0] + tail;
      doc.cookie = "nf_lang=" + c[1] + tail;
    }catch(e){}
  }

  function detectLocale(){
    if (CURRENT_DIR) return DIR_BY_CODE[CURRENT_DIR].locale;
    // Page sans prefixe (ex: /match/12345.html, /blog/...). Ordre (audit QA
    // 14/09/2026 : le blog FR passait en espagnol apres une visite de /mx/) :
    //   1. marqueur <meta name="iashark-force-locale"> ;
    //   2. <html lang> explicite : le contenu statique de la page est redige
    //      dans cette langue, jamais habille d'une autre interface ;
    //   3. dernier choix memorise, sinon FR.
    if (FORCED_LOCALE) return FORCED_LOCALE;
    var declared = declaredLocale();
    if (declared) return declared;
    try{
      var saved = global.localStorage.getItem("iashark_lang");
      if (saved && SUPPORTED.indexOf(saved) !== -1) return saved;
    }catch(e){}
    return DEFAULT_LOCALE;
  }

  // Repertoire cible des liens internes. Page prefixee : son repertoire.
  // Page sans prefixe (les pages racine redirigent vers /fr/ en production) :
  // repertoire de la locale imposee (blog FR -> /fr/), sinon la version
  // memorisee du visiteur (/match/<id>.html -> /gb/ apres une visite de
  // /gb/), sinon /fr/. Jamais un lien racine qui redirige.
  function linkDir(){
    if (CURRENT_DIR) return CURRENT_DIR;
    if (FORCED_LOCALE) return LOCALE_DIR[FORCED_LOCALE] || DEFAULT_DIR;
    return savedDir() || DEFAULT_DIR;
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

  // Cache de la PROMESSE (pas seulement du resultat) : match-page.js,
  // bottom-navigation.js et la page appellent init() quasi simultanement ;
  // sans ce cache, le dictionnaire etait telecharge 3 a 4 fois par page.
  // Un echec n'est pas memorise (nouvel essai au prochain appel).
  var dictCache = {};
  function loadDict(locale){
    if (dictCache[locale]) return dictCache[locale];
    var p = fetch("/i18n/dict/" + locale + ".json").then(function(r){
      if (!r.ok) throw new Error("dict fetch failed: " + r.status);
      return r.json();
    });
    dictCache[locale] = p;
    p.catch(function(){ if (dictCache[locale] === p) delete dictCache[locale]; });
    return p;
  }

  var LOCALE = detectLocale();

  // Suggestion de langue sur les pages profondes (19/09/2026) : petit bandeau
  // discret, jamais de redirection (lib/lang-suggest.js). Ici seulement un
  // pre-filtre gratuit pour ne telecharger ce script que si la PREMIERE
  // langue du navigateur est une autre langue du site que celle de la page.
  var HINT_LANGS = {fr:1, en:1, es:1, de:1, it:1, pt:1}; // de/it/pt : suggestion de la version anglaise
  function hintPageDir(){
    if (CURRENT_DIR) return CURRENT_DIR;
    // Pages match FR statiques sans prefixe (/match/<id>.html, <html lang="fr">).
    var p = currentLocation().pathname || "";
    return /^\/match\/[^\/]+\.html$/.test(p) && declaredLocale() === "fr" ? "fr" : "";
  }
  function langHintWanted(){
    try{
      var nav = global.navigator;
      if (!nav || nav.webdriver) return false;
      if (!hintPageDir()) return false;
      // Version deja choisie (selecteur ou bandeau) : rien a proposer.
      if (global.localStorage.getItem(CHOSEN_KEY)) return false;
      if (/(?:^|;\s*)nf_(?:country|lang)=/.test(String((global.document && global.document.cookie) || ""))) return false;
      var first = String((nav.languages && nav.languages[0]) || nav.language || "").toLowerCase().split(/[-_]/)[0];
      return hasOwn.call(HINT_LANGS, first) && first !== String(LOCALE).split("-")[0];
    }catch(e){ return false; }
  }
  function loadLangHint(){
    if (global.__iasharkLangHint || !langHintWanted()) return;
    global.__iasharkLangHint = true;
    try{
      var doc = global.document;
      var s = doc.createElement("script");
      s.src = "/lib/lang-suggest.js";
      s.async = true;
      s.onload = function(){
        try{ if (global.IasharkLangSuggest) global.IasharkLangSuggest.run(global.I18N, global); }catch(e){}
      };
      (doc.head || doc.documentElement).appendChild(s);
    }catch(e){}
  }

  // ---------------------------------------------------------------------------
  // Langue de la PAGE D'ARRIVEE (31/10/2026). Mesure sur 14 jours : des
  // visiteurs arrivaient par un lien /fr/... partage (X, Telegram) avec un
  // telephone en anglais, turc, portugais... et lisaient une langue qu'ils ne
  // comprennent pas (et inversement des telephones francais sur /en/).
  // Regle : a la PREMIERE page d'une visite seulement, si le visiteur n'a
  // jamais choisi de version et que la langue de son telephone n'est pas celle
  // de la page, il est envoye sur la MEME page dans sa langue (parametres
  // d'URL et ancre gardes). Un petit lien « Lire en français » (langue
  // d'origine) permet de revenir et memorise ce choix.
  // Jamais : pour un robot (les pages traduites restent indexables telles
  // quelles, hreflang inchange), apres un choix (selecteur, bandeau, cookies
  // nf_*), en cours de navigation, sans sessionStorage (impossible d'eviter
  // une boucle), sur connexion / inscription / compte / paiement, ni si la
  // page n'existe pas dans la langue cible.
  // decideLandingRedirect(env) est pure (tests/lang-landing.test.js).
  var AUTO_KEY = "iashark_lang_auto";          // sessionStorage : redirection faite (origine, cible, retour)
  var LANDING_KEY = "iashark_lang_landing";    // sessionStorage : visite commencee (page d'arrivee vue)
  var AUTO_SKIP_RE = /\/(connexion|inscription|mot-de-passe-oublie|reinitialiser-mot-de-passe|compte|abonnement|checkout-annule|checkout-succes|desinscription-email|404)\.html$/;
  var AUTO_BOT_RE = /bot\/|bot-|bot;|telegrambot|crawl|spider|slurp|mediapartners|facebookexternalhit|facebookcatalog|embedly|pinterest|preview|lighthouse|pagespeed|headless|phantomjs|prerender|gtmetrix|google-inspectiontool|yandex|baiduspider|bytespider|petalbot|ahrefs|semrush|mj12|dotbot/i;
  // Fuseaux du Mexique (offre MXN de /mx/) ; Royaume-Uni (/gb/) ; Afrique du Sud (/za/).
  var MX_TZ_RE = /^America\/(Mexico_City|Cancun|Merida|Monterrey|Matamoros|Chihuahua|Ciudad_Juarez|Ojinaga|Mazatlan|Bahia_Banderas|Hermosillo|Tijuana)$/;
  function baseLang(tag){ return String(tag || "").toLowerCase().split(/[-_]/)[0]; }
  function dirLang(dir){ return isDir(dir) ? baseLang(DIR_BY_CODE[dir].locale) : ""; }

  // Langue du telephone (+ fuseau horaire) -> version du site.
  // fr -> fr ; es -> es (mx au Mexique) ; en et TOUTE autre langue (arabe,
  // turc, portugais, allemand...) -> anglais (gb au Royaume-Uni, za en
  // Afrique du Sud). Aucune langue connue -> "" (rien ne change).
  function autoTargetDir(lang, timeZone){
    var b = baseLang(lang);
    if (!b || !/^[a-z]{2,3}$/.test(b)) return "";
    var tz = String(timeZone || "");
    if (b === "fr") return "fr";
    if (b === "es") return MX_TZ_RE.test(tz) ? "mx" : "es";
    if (tz === "Europe/London") return "gb";
    if (tz === "Africa/Johannesburg") return "za";
    return "en";
  }

  // Repertoire de la page pour cette regle : page prefixee, accueil "/" (sert
  // l'accueil francais) et pages match statiques /match/<id>.html (francais).
  function landingPageDir(pathname){
    var p = String(pathname || "/");
    var d = pathDir(p);
    if (d) return d;
    if (p === "/" || /^\/match\/\d+\.html$/.test(p)) return "fr";
    return "";
  }

  // env : { pathname, search, hash, languages, timeZone, userAgent, webdriver,
  //   sessionOk, visitStarted, referrerHost, host, chosen, choiceCookie,
  //   alternates: {hreflang minuscule: chemin} }
  // -> { redirect:false, reason } | { redirect:true, from, to, href }
  function decideLandingRedirect(env){
    env = env || {};
    var pathname = String(env.pathname || "/");
    var from = landingPageDir(pathname);
    if (!from) return {redirect:false, reason:"no-page-dir"};
    if (AUTO_SKIP_RE.test(pathname)) return {redirect:false, reason:"skip-page"};
    if (env.webdriver || AUTO_BOT_RE.test(String(env.userAgent || ""))) return {redirect:false, reason:"bot"};
    if (!env.sessionOk) return {redirect:false, reason:"no-session"};
    if (env.visitStarted) return {redirect:false, reason:"not-landing"};
    if (env.referrerHost && env.host && env.referrerHost === env.host) return {redirect:false, reason:"internal"};
    if (env.chosen || env.choiceCookie) return {redirect:false, reason:"chosen"};
    var langs = env.languages || [];
    var to = autoTargetDir(langs[0], env.timeZone);
    if (!to) return {redirect:false, reason:"no-language"};
    if (dirLang(to) === dirLang(from)) return {redirect:false, reason:"same-language"};

    var search = String(env.search || ""), hash = String(env.hash || "");
    var path;
    var staticMatch = pathname.match(/^\/match\/(\d+)\.html$/);
    if (staticMatch) {
      // /match/<id>.html -> /<dir>/match.html?id=<id> + les autres parametres.
      var rest = search.replace(/^\?/, "").split("&").filter(function(kv){ return kv && !/^id=/.test(kv); });
      path = "/" + to + "/match.html";
      search = "?id=" + staticMatch[1] + (rest.length ? "&" + rest.join("&") : "");
    } else {
      var m = pathname.match(DIR_PREFIX_RE);
      var bare = ((m && isDir(m[1])) ? (m[2] || "/") : pathname).replace(/^\/+/, "");
      if (bare !== "" && !hasOwn.call(LOCALIZED_PAGES, bare)) return {redirect:false, reason:"no-equivalent"};
      path = hrefFor(bare, to);
    }
    // Liens hreflang de la page (source de verite du build) : si la page en
    // declare, la version cible doit y figurer.
    var alts = env.alternates || {};
    if (Object.keys(alts).length && !hasOwn.call(alts, String(DIR_BY_CODE[to].htmlLang).toLowerCase())) {
      return {redirect:false, reason:"no-equivalent"};
    }
    if (path === pathname) return {redirect:false, reason:"same-page"};
    return {redirect:true, from:from, to:to, href: path + search + hash};
  }

  function readAlternates(doc){
    var out = {};
    try{
      var links = doc.querySelectorAll('link[rel="alternate"][hreflang]');
      for (var i = 0; i < links.length; i++) {
        var hl = String(links[i].getAttribute("hreflang") || "").toLowerCase();
        if (hl && hl !== "x-default" && links[i].getAttribute("href")) out[hl] = links[i].getAttribute("href");
      }
    }catch(e){}
    return out;
  }

  function autoLangRedirect(){
    try{
      var doc = global.document, loc = global.location, nav = global.navigator || {};
      if (!doc || !loc || !loc.pathname) return;
      var ss = null, visitStarted = false;
      try{
        ss = global.sessionStorage;
        visitStarted = !!(ss.getItem(LANDING_KEY) || ss.getItem(AUTO_KEY) || ss.getItem("iashark_visit_pages"));
        ss.setItem(LANDING_KEY, "1");
      }catch(e){ ss = null; }
      var refHost = "";
      try{ refHost = doc.referrer ? new global.URL(doc.referrer).hostname : ""; }catch(e){}
      var chosen = "";
      try{ chosen = global.localStorage.getItem(CHOSEN_KEY) || ""; }catch(e){}
      var tz = "";
      try{ tz = global.Intl.DateTimeFormat().resolvedOptions().timeZone || ""; }catch(e){}
      var langs = [];
      try{ langs = nav.languages && nav.languages.length ? Array.prototype.slice.call(nav.languages) : [nav.language]; }catch(e){}
      var d = decideLandingRedirect({
        pathname: loc.pathname, search: loc.search, hash: loc.hash,
        languages: langs, timeZone: tz, userAgent: nav.userAgent, webdriver: !!nav.webdriver,
        sessionOk: !!ss, visitStarted: visitStarted, referrerHost: refHost, host: loc.hostname,
        chosen: !!chosen, choiceCookie: /(?:^|;\s*)nf_(?:country|lang)=/.test(String(doc.cookie || "")),
        alternates: readAlternates(doc)
      });
      if (!d.redirect) return;
      ss.setItem(AUTO_KEY, JSON.stringify({
        from: d.from, to: d.to, back: loc.pathname + (loc.search || "") + (loc.hash || ""),
        ref: refHost && refHost !== loc.hostname ? refHost : ""
      }));
      global.__iasharkLangRedirecting = true;
      loc.replace(d.href);
    }catch(e){}
  }

  // Lien discret de retour vers la langue d'origine, sur la page d'arrivee
  // apres une redirection automatique. Au clic : choix memorise (selecteur).
  var BACK_TEXT = {
    fr: {lang:"fr", label:"Lire en français", close:"Fermer"},
    en: {lang:"en", label:"Read in English", close:"Close"},
    es: {lang:"es", label:"Leer en español", close:"Cerrar"}
  };
  function mountBackLink(){
    try{
      var doc = global.document, ss = global.sessionStorage;
      var info = JSON.parse(ss.getItem(AUTO_KEY) || "null");
      if (!info || info.shown || !isDir(info.from) || info.to !== CURRENT_DIR || !doc.body) return;
      if (typeof info.back !== "string" || !/^\/(?!\/)/.test(info.back)) return;
      info.shown = 1;
      ss.setItem(AUTO_KEY, JSON.stringify(info));
      var t = BACK_TEXT[dirLang(info.from)] || BACK_TEXT.fr;
      if (!doc.getElementById("iasharkLangBackCss")) {
        var st = doc.createElement("style");
        st.id = "iasharkLangBackCss";
        st.textContent =
          ".ias-lang-back{position:fixed;left:12px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:1001;display:flex;align-items:center;gap:2px;" +
          "padding:2px 2px 2px 12px;border:1px solid rgba(148,163,184,.28);border-radius:999px;background:rgba(10,18,28,.94);" +
          "box-shadow:0 6px 18px rgba(0,0,0,.35);font:13px/1.3 'DM Sans','Inter',system-ui,-apple-system,'Segoe UI',sans-serif}" +
          ".ias-lang-back--nav{bottom:calc(96px + env(safe-area-inset-bottom))}" +
          "@media(max-width:700px){.ias-lang-back--nav{bottom:calc(84px + env(safe-area-inset-bottom))}}" +
          ".ias-lang-back a{color:#67e8f9;text-decoration:underline;text-underline-offset:2px;padding:6px 2px}" +
          ".ias-lang-back button{width:32px;height:32px;border:0;border-radius:999px;background:transparent;color:#8fa3b8;font-size:18px;line-height:1;cursor:pointer}" +
          ".ias-lang-back button:hover{color:#e2e8f0}" +
          ".ias-lang-back a:focus-visible,.ias-lang-back button:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}" +
          "@media print{.ias-lang-back{display:none}}";
        (doc.head || doc.documentElement).appendChild(st);
      }
      var el = doc.createElement("div");
      el.id = "iasharkLangBack";
      el.className = "ias-lang-back" + (doc.querySelector(".site-bottom-nav") ? " ias-lang-back--nav" : "");
      el.setAttribute("lang", t.lang);
      el.innerHTML = '<a href="' + escHtml(info.back) + '" hreflang="' + t.lang + '">' + escHtml(t.label) + "</a>" +
        '<button type="button" aria-label="' + t.close + '" title="' + t.close + '"><span aria-hidden="true">×</span></button>';
      el.querySelector("a").addEventListener("click", function(){ try{ I18N.rememberChoice(info.from); }catch(e){} });
      el.querySelector("button").addEventListener("click", function(){ if (el.parentNode) el.parentNode.removeChild(el); });
      doc.body.appendChild(el);
      // La barre du bas (bottom-navigation.js) peut apparaitre apres : on remonte le lien au-dessus.
      var lift = function(){ try{ if (doc.querySelector(".site-bottom-nav")) el.className = "ias-lang-back ias-lang-back--nav"; }catch(e){} };
      if (typeof global.setTimeout === "function") { global.setTimeout(lift, 300); global.setTimeout(lift, 1500); }
    }catch(e){}
  }

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

    // Dictionnaire brut d'une locale, SANS effet sur le DOM, via le meme cache
    // de promesse que init() : auth-header.js le reutilise au lieu de
    // retelecharger /i18n/dict/<locale>.json.
    loadDict: loadDict,

    // I18N.href("compte.html#plan") -> "/gb/compte.html#plan" (page /gb/) ;
    // page sans prefixe : repertoire de linkDir() ("/fr/compte.html#plan"
    // sur le blog FR, "/gb/compte.html#plan" sur /match/<id>.html pour un
    // visiteur de /gb/). Ne depend pas de `this`.
    href: function(page){ return hrefFor(page, linkDir()); },
    hrefFor: hrefFor,
    linkDir: linkDir,
    blogHref: function(){ return hrefFor("blog.html", linkDir()); },
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
    // les pages sans prefixe, et pour la racine "/" via nf_country/nf_lang).
    rememberChoice: function(dir){
      if (!isDir(dir)) return;
      try{
        global.localStorage.setItem("iashark_dir", dir);
        global.localStorage.setItem("iashark_lang", DIR_BY_CODE[dir].locale);
        global.localStorage.setItem(CHOSEN_KEY, dir);
      }catch(e){}
      setChoiceCookies(dir);
    },
    // Repertoire choisi explicitement ("" si aucun choix) et cookies associes
    // (tests/lang-routing.test.js).
    chosenDir: function(){
      try{
        var d = global.localStorage.getItem(CHOSEN_KEY);
        return d && isDir(d) ? d : "";
      }catch(e){ return ""; }
    },
    choiceCookies: CHOICE_COOKIES,
    // Bandeau de suggestion de langue : repertoire de la page ("" = jamais de
    // bandeau) et pre-filtre gratuit (langHintWanted, plus haut).
    hintPageDir: function(){ return hintPageDir(); },
    langHintWanted: function(){ return langHintWanted(); },
    // Langue de la page d'arrivee (tests/lang-landing.test.js).
    decideLandingRedirect: decideLandingRedirect,
    autoTargetDir: autoTargetDir,

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
      // Cle absente du dictionnaire (ex. dictionnaire encore en cache chez le visiteur apres
      // une mise en ligne, 04/10/2026) : on GARDE le texte du HTML, jamais le nom de la cle.
      root.querySelectorAll("[data-i18n]").forEach(function(el){
        var key = el.getAttribute("data-i18n");
        var val = self.dict ? get(self.dict, key) : null;
        if (val != null) el.textContent = val;
      });
      root.querySelectorAll("[data-i18n-attr]").forEach(function(el){
        var spec = el.getAttribute("data-i18n-attr"); // "placeholder:key1,title:key2"
        spec.split(",").forEach(function(pair){
          var parts = pair.split(":");
          if (parts.length !== 2) return;
          var val = self.dict ? get(self.dict, parts[1].trim()) : null;
          if (val != null) el.setAttribute(parts[0].trim(), val);
        });
      });
      root.querySelectorAll("[data-i18n-href-locale]").forEach(function(el){
        var href = el.getAttribute("href");
        if (!href || href.charAt(0) !== "/") return;
        var dir = linkDir();
        // Lien deja prefixe (/fr/pro.html ecrit en dur dans une page statique
        // sans prefixe) : on le re-cible vers le repertoire du visiteur.
        var m = href.match(/^\/([a-z]{2})(\/.*)?$/);
        if (m && isDir(m[1])) href = m[2] || "/";
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
      // Seule une page PREFIXEE memorise : une page sans prefixe (blog FR,
      // /match/<id>.html) affiche sa propre langue et ne doit jamais ecraser
      // la version choisie par le visiteur.
      try{
        if (CURRENT_DIR) {
          global.localStorage.setItem("iashark_lang", this.locale);
          global.localStorage.setItem("iashark_dir", CURRENT_DIR);
        }
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

  // Page d'arrivee : redirection eventuelle vers la langue du telephone (une
  // seule fois par script), puis lien de retour apres une redirection.
  if (!global.__iasharkLangLanding) {
    global.__iasharkLangLanding = true;
    autoLangRedirect();
    if (!global.__iasharkLangRedirecting) {
      try{
        var doc0 = global.document;
        if (doc0 && doc0.body) mountBackLink();
        else if (doc0 && typeof doc0.addEventListener === "function") doc0.addEventListener("DOMContentLoaded", mountBackLink);
      }catch(e){}
    }
  }

  // Bandeau de suggestion : apres le chargement complet de la page (+1,2 s),
  // jamais pendant le premier affichage. Une seule planification meme si ce
  // script est execute deux fois sur la page.
  try{
    if (!global.__iasharkLangHintScheduled && global.document &&
        typeof global.addEventListener === "function" && typeof global.setTimeout === "function") {
      global.__iasharkLangHintScheduled = true;
      var later = function(){ global.setTimeout(loadLangHint, 1200); };
      if (global.document.readyState === "complete") later();
      else global.addEventListener("load", later);
    }
  }catch(e){}
})(typeof window !== "undefined" ? window : this);
