/* IASHARK — suggestion de langue sur les pages profondes (19/09/2026).

   Un visiteur qui arrive sur une page (depuis Google, un lien partage...) dont
   la langue differe de la PREMIERE langue de son navigateur voit un petit
   bandeau discret en bas d'ecran, dans SA langue :
     « This page is also available in English. [Switch to English] [x] »
   Jamais de redirection automatique d'une page profonde (seule la racine "/"
   est aiguillee, cote serveur : _redirects, lib/lang-routing.js).

   Charge a la demande par i18n/i18n.js (pre-filtre gratuit : langue du
   navigateur proposee par le site et differente de celle de la page), apres
   le chargement complet de la page. Aucune dependance, aucun texte dans
   i18n/dict : petit dictionnaire autonome ci-dessous (fr, en, es, es-mx, de,
   it, pt).

   Jamais de bandeau :
   - pour un robot (navigator.webdriver, user-agent de robot) ;
   - si le visiteur a deja choisi une version (selecteur ou bandeau :
     localStorage iashark_dir_chosen, cookies nf_country / nf_lang) ;
   - s'il a ferme le bandeau pour cette suggestion, ou apres 3 affichages ;
   - si localStorage est indisponible (impossible de retenir la fermeture :
     on ne harcele pas) ;
   - si la page n'existe pas dans la langue proposee (liens hreflang de la
     page, sinon helpers de chemins de i18n/i18n.js) ;
   - sur les pages de connexion / inscription / mot de passe / retour de
     paiement / 404 ;
   - si la suggestion ferait changer d'offre (devise) un visiteur dont le
     pays n'est pas connu ou n'y correspond pas (marches gb GBP, za ZAR,
     mx MXN ; le pays vient du cache de /api/geo deja lu par funnel-track.js,
     jamais d'appel supplementaire).

   decide(env) est pure (tests/lang-suggest.test.js) ; run(I18N, window) lit
   le navigateur, decide et affiche. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else if (root) root.IasharkLangSuggest = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var ID = "iasharkLangHint";
  var KEYS = { chosen: "iashark_dir_chosen", dismissed: "iashark_lang_hint_dismissed", seen: "iashark_lang_hint_seen" };
  var MAX_IMPRESSIONS = 3;
  var GEO_KEY = "iashark_geo_v1"; // cache de funnel-track.js (sessionStorage)

  // Langue du navigateur -> version internationale de cette langue.
  var LANG_DIR = { fr: "fr", en: "en", es: "es", de: "en", it: "en", pt: "en" }; // de/it/pt retires le 25/09/2026 -> anglais

  // Textes du bandeau, dans la langue PROPOSEE (celle que le visiteur lit).
  var TEXT = {
    fr: { lang: "fr", region: "Suggestion de langue", msg: "Cette page existe aussi en français.", cta: "Passer en français", close: "Fermer" },
    en: { lang: "en", region: "Language suggestion", msg: "This page is also available in English.", cta: "Switch to English", close: "Close" },
    gb: { lang: "en-GB", region: "Language suggestion", msg: "This page is also available in English.", cta: "Switch to English (UK)", close: "Close" },
    za: { lang: "en-ZA", region: "Language suggestion", msg: "This page is also available in English.", cta: "Switch to English (South Africa)", close: "Close" },
    es: { lang: "es", region: "Sugerencia de idioma", msg: "Esta página también está disponible en español.", cta: "Cambiar a español", close: "Cerrar" },
    mx: { lang: "es-MX", region: "Sugerencia de idioma", msg: "Esta página también está disponible en español.", cta: "Cambiar a español (México)", close: "Cerrar" },
    de: { lang: "de", region: "Sprachvorschlag", msg: "Diese Seite gibt es auch auf Deutsch.", cta: "Auf Deutsch wechseln", close: "Schließen" },
    it: { lang: "it", region: "Suggerimento di lingua", msg: "Questa pagina è disponibile anche in italiano.", cta: "Passa all'italiano", close: "Chiudi" },
    pt: { lang: "pt", region: "Sugestão de idioma", msg: "Esta página também está disponível em português.", cta: "Mudar para português", close: "Fechar" }
  };

  var BOT_RE = /bot\/|bot-|bot;|telegrambot|crawl|spider|slurp|mediapartners|facebookexternalhit|facebookcatalog|embedly|pinterest|preview|lighthouse|pagespeed|headless|phantomjs|prerender|gtmetrix|google-inspectiontool|yandex|baiduspider|bytespider|petalbot|ahrefs|semrush|mj12|dotbot/i;
  // Pages ou un bandeau gene un parcours en cours (formulaires, paiement) ou n'a pas de sens.
  var SKIP_PAGE_RE = /\/(connexion|inscription|mot-de-passe-oublie|reinitialiser-mot-de-passe|checkout-annule|checkout-succes|404)\.html$/;

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function safeGet(storage, key) { try { return storage ? storage.getItem(key) : null; } catch (e) { return null; } }
  function safeSet(storage, key, value) { try { if (storage) storage.setItem(key, value); } catch (e) {} }
  function baseLang(tag) { return String(tag || "").toLowerCase().split(/[-_]/)[0]; }
  function isBot(ua, webdriver) { return !!webdriver || BOT_RE.test(String(ua || "")); }
  function hasChoiceCookie(cookie) { return /(?:^|;\s*)nf_(?:country|lang)=/.test(String(cookie || "")); }
  function seenCount(storage) { var n = parseInt(safeGet(storage, KEYS.seen), 10); return isNaN(n) ? 0 : n; }

  // Offre pays : repertoire de son propre marche (gb, za, mx : code du
  // repertoire = cle de marche = code pays), reservee aux visiteurs de ce pays.
  // Un marche servi par un repertoire de langue (us : offre USD de /en/,
  // config/markets.json#_usdSwitch) n'est reserve a aucun pays : /en/ reste la
  // version anglaise de tous les visiteurs, comme pour l'aiguillage de la
  // racine (lib/lang-routing.js).
  function isCountryOffer(d) { return !!d && d.market !== "fr" && d.dir === d.market; }
  // Offre pays qui s'applique a un pays (cle de marche = code pays en
  // minuscules) ; tout autre pays releve de l'offre internationale "fr".
  function countryMarket(country, dirs) {
    var c = String(country || "").toLowerCase();
    if (!c) return "";
    for (var i = 0; i < dirs.length; i++) if (dirs[i].market === c && c !== "fr" && isCountryOffer(dirs[i])) return c;
    return "fr";
  }

  // env : {
  //   pageDir, pageLocale, pathname,
  //   dirs: [{dir, locale, htmlLang, market}] (I18N.dirs),
  //   languages: navigator.languages, userAgent, webdriver,
  //   storage: localStorage utilisable ou null, cookie: document.cookie,
  //   geoCountry: "GB"|null (cache /api/geo), alternates: {hreflang minuscule: chemin},
  //   fallbackHref: function(dir) -> chemin|null (utilise seulement sans liens hreflang)
  // }
  // -> { show: false, reason } | { show: true, target, href, text }
  function decide(env) {
    env = env || {};
    var dirs = env.dirs || [];
    var byDir = {};
    dirs.forEach(function (d) { byDir[d.dir] = d; });
    var page = byDir[env.pageDir];
    if (!page) return { show: false, reason: "no-page-dir" };
    if (SKIP_PAGE_RE.test(String(env.pathname || ""))) return { show: false, reason: "skip-page" };
    if (isBot(env.userAgent, env.webdriver)) return { show: false, reason: "bot" };
    if (!env.storage) return { show: false, reason: "no-storage" };
    if (safeGet(env.storage, KEYS.chosen) || hasChoiceCookie(env.cookie)) return { show: false, reason: "chosen" };

    var langs = env.languages || [];
    var browser = baseLang(langs[0]);
    if (!has(LANG_DIR, browser)) return { show: false, reason: "unsupported-language" };
    if (browser === baseLang(env.pageLocale || page.locale)) return { show: false, reason: "same-language" };

    // Version proposee : celle de la langue ; version pays (gb, za, mx) seulement
    // si le pays du visiteur est CONNU et que sa langue est celle du navigateur.
    var target = LANG_DIR[browser];
    var geoMarket = countryMarket(env.geoCountry, dirs);
    if (geoMarket && geoMarket !== "fr") {
      dirs.forEach(function (d) { if (d.market === geoMarket && baseLang(d.locale) === browser) target = d.dir; });
    }
    var t = byDir[target];
    if (!t || target === env.pageDir) return { show: false, reason: "no-target" };

    // Jamais vers (ni hors d') une offre pays sans savoir qu'elle s'applique au
    // visiteur. Entre versions de langue (fr, en, es...), meme si leurs devises
    // different (/en/ en USD apres _usdSwitch), la suggestion reste libre.
    if (t.market !== page.market && (isCountryOffer(t) || isCountryOffer(page))) {
      if (!geoMarket) return { show: false, reason: "market-unknown-country" };
      if (t.market !== geoMarket) return { show: false, reason: "other-market" };
    }

    // URL equivalente : lien hreflang de la page (source de verite du build).
    // Sans aucun lien hreflang : helpers de chemins de i18n/i18n.js.
    var alts = env.alternates || {};
    var href = null;
    if (Object.keys(alts).length) href = alts[String(t.htmlLang).toLowerCase()] || null;
    else if (typeof env.fallbackHref === "function") href = env.fallbackHref(target) || null;
    if (!href || /\/404\.html$/.test(href.split(/[?#]/)[0]) || href === env.pathname) return { show: false, reason: "no-equivalent" };

    if (safeGet(env.storage, KEYS.dismissed) === target) return { show: false, reason: "dismissed" };
    if (seenCount(env.storage) >= MAX_IMPRESSIONS) return { show: false, reason: "cap" };
    return { show: true, target: target, href: href, text: TEXT[target] };
  }

  // ---------------------------------------------------------------------------
  // Navigateur.
  function usableStorage(win) {
    try {
      var ls = win.localStorage;
      ls.setItem("iashark_lang_hint_probe", "1");
      ls.removeItem("iashark_lang_hint_probe");
      return ls;
    } catch (e) { return null; }
  }
  function readGeoCountry(win) {
    try {
      var raw = win.sessionStorage.getItem(GEO_KEY);
      if (!raw || raw === "none") return null;
      var c = JSON.parse(raw).country;
      return typeof c === "string" && /^[A-Z]{2}$/i.test(c) ? c.toUpperCase() : null;
    } catch (e) { return null; }
  }
  function readAlternates(win) {
    var out = {};
    try {
      var loc = win.location;
      var links = win.document.querySelectorAll('link[rel="alternate"][hreflang]');
      for (var i = 0; i < links.length; i++) {
        var hl = String(links[i].getAttribute("hreflang") || "").toLowerCase();
        var href = links[i].getAttribute("href");
        if (!hl || hl === "x-default" || !href) continue;
        var path = null;
        if (typeof win.URL === "function") {
          var u = new win.URL(href, loc.href);
          // Liens absolus vers le site de production : meme chemin sur l'origine
          // courante (apercu de deploiement compris).
          if (u.hostname === loc.hostname || /(^|\.)iashark\.com$/.test(u.hostname)) path = u.pathname + u.search;
        } else {
          path = String(href).replace(/^https?:\/\/[^\/]+/, "");
        }
        if (path && path.charAt(0) === "/") out[hl] = path;
      }
    } catch (e) {}
    return out;
  }
  function collectEnv(i18n, win) {
    var nav = win.navigator || {};
    var langs = [];
    try { langs = nav.languages && nav.languages.length ? Array.prototype.slice.call(nav.languages) : [nav.language]; } catch (e) {}
    var cookie = "";
    try { cookie = win.document.cookie || ""; } catch (e) {}
    var pathname = (win.location && win.location.pathname) || "/";
    return {
      pageDir: typeof i18n.hintPageDir === "function" ? i18n.hintPageDir() : i18n.dir,
      pageLocale: i18n.locale,
      pathname: pathname,
      dirs: i18n.dirs || [],
      languages: langs,
      userAgent: nav.userAgent || "",
      webdriver: !!nav.webdriver,
      storage: usableStorage(win),
      cookie: cookie,
      geoCountry: readGeoCountry(win),
      alternates: readAlternates(win),
      fallbackHref: function (dir) {
        try {
          var h = i18n.switchHref(dir);
          var isHome = /^\/[a-z]{2}\/(index\.html)?$/.test(pathname);
          // switchHref renvoie l'accueil quand la page n'a pas d'equivalent connu.
          if (h === i18n.hrefFor("", dir) && !isHome) return null;
          return h;
        } catch (e) { return null; }
      }
    };
  }

  var CSS =
    ".ias-lang-hint{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:1001;" +
    "box-sizing:border-box;width:calc(100% - 24px);max-width:560px;display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;" +
    "margin:0;padding:10px 50px 10px 14px;border:1px solid rgba(34,211,238,.28);border-radius:12px;background:rgba(10,18,28,.97);" +
    "color:#e2e8f0;box-shadow:0 10px 30px rgba(0,0,0,.45);font:14px/1.4 'DM Sans','Inter',system-ui,-apple-system,'Segoe UI',sans-serif;text-align:left}" +
    ".ias-lang-hint--nav{bottom:calc(96px + env(safe-area-inset-bottom))}" +
    "@media(max-width:700px){.ias-lang-hint--nav{bottom:calc(84px + env(safe-area-inset-bottom))}}" +
    ".ias-lang-hint__text{flex:1 1 200px;min-width:0;margin:0;color:#e2e8f0;font:inherit}" +
    ".ias-lang-hint__cta{display:inline-flex;align-items:center;min-height:36px;padding:6px 12px;border-radius:8px;background:#22d3ee;" +
    "color:#04121c;font-weight:700;text-decoration:none;white-space:nowrap}" +
    ".ias-lang-hint__cta:hover{background:#67e8f9;color:#04121c}" +
    ".ias-lang-hint__close{position:absolute;top:8px;right:8px;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:0;" +
    "border-radius:8px;background:transparent;color:#8fa3b8;font-size:22px;line-height:1;cursor:pointer}" +
    ".ias-lang-hint__close:hover{color:#e2e8f0;background:rgba(255,255,255,.06)}" +
    ".ias-lang-hint__cta:focus-visible,.ias-lang-hint__close:focus-visible{outline:2px solid #22d3ee;outline-offset:2px}" +
    "@media print{.ias-lang-hint{display:none}}";

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function mount(d, i18n, win, storage) {
    var doc = win.document;
    if (!doc.getElementById(ID + "Css")) {
      var st = doc.createElement("style");
      st.id = ID + "Css";
      st.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(st);
    }
    var t = d.text;
    var el = doc.createElement("div");
    el.id = ID;
    el.className = "ias-lang-hint" + (doc.querySelector(".site-bottom-nav") ? " ias-lang-hint--nav" : "");
    el.setAttribute("role", "region");
    el.setAttribute("aria-label", t.region);
    el.setAttribute("lang", t.lang);
    el.innerHTML =
      '<p class="ias-lang-hint__text">' + esc(t.msg) + "</p>" +
      '<a class="ias-lang-hint__cta" href="' + esc(d.href) + '" hreflang="' + esc(t.lang) + '">' + esc(t.cta) + "</a>" +
      '<button type="button" class="ias-lang-hint__close" aria-label="' + esc(t.close) + '" title="' + esc(t.close) + '">' +
      '<span aria-hidden="true">×</span></button>';
    function dismiss() {
      safeSet(storage, KEYS.dismissed, d.target);
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    el.querySelector(".ias-lang-hint__cta").addEventListener("click", function () {
      try { if (i18n && typeof i18n.rememberChoice === "function") i18n.rememberChoice(d.target); } catch (e) {}
    });
    el.querySelector(".ias-lang-hint__close").addEventListener("click", dismiss);
    el.addEventListener("keydown", function (ev) { if (ev && (ev.key === "Escape" || ev.key === "Esc")) dismiss(); });
    doc.body.appendChild(el);
    safeSet(storage, KEYS.seen, String(seenCount(storage) + 1));
    return el;
  }

  // Point d'entree (i18n/i18n.js). Ne redirige jamais : affiche au plus un bandeau.
  function run(i18n, win) {
    try {
      win = win || (typeof window !== "undefined" ? window : null);
      if (!win || !i18n || !win.document || !win.document.body) return { show: false, reason: "no-runtime" };
      if (win.document.getElementById(ID)) return { show: false, reason: "already-shown" };
      var env = collectEnv(i18n, win);
      var d = decide(env);
      if (d.show) mount(d, i18n, win, env.storage);
      return d;
    } catch (e) {
      return { show: false, reason: "error" };
    }
  }

  return {
    decide: decide, run: run, countryMarket: countryMarket, isCountryOffer: isCountryOffer, isBot: isBot,
    TEXT: TEXT, KEYS: KEYS, LANG_DIR: LANG_DIR, MAX_IMPRESSIONS: MAX_IMPRESSIONS
  };
});
