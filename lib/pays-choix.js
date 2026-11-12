/* IASHARK — choix du pays (09/11/2026, demande de Clement : « il choisit, et on
   traduit les pages direct ; il ne doit pas le refaire a chaque fois »).

   12/11/2026 : PLUS DE FENETRE A L'ARRIVEE. Du 09/11 au 12/11 la fenetre recouvrait
   tout l'ecran a la premiere visite ; sur ces jours, les visiteurs sans compte qui ne
   touchent rien sont passes de 81 % a 94 % et les inscriptions de 43 en 11 jours a 2
   en 3 jours (funnel_events ; pas une preuve, un signal). Decision de Clement : garder
   l'idee, enlever le mur.

   Maintenant, a la premiere visite :
     - le pays est devine par le reseau (/api/geo, deja lu par funnel-track.js) ;
     - si la page est DEJA dans la version du site de ce pays (le cas de presque tout
       le monde) : rien ne s'affiche, rien ne bloque ;
     - sinon : une petite bande en bas de l'ecran, dans la langue du pays, propose la
       meme page dans sa version (« Brasil · Ver o site em português »). Elle ne
       recouvre rien, se ferme d'un toucher et ne revient plus (iashark_pays_ferme).
       « Autre pays » y ouvre la liste complete, a la demande seulement ;
     - pays inconnu ou hors liste : rien ici, le bandeau de langue du navigateur
       (lib/lang-suggest.js) reprend la main.
   Au choix (bande ou liste) :
     - la version du site est memorisee sur le telephone (I18N.rememberChoice :
       localStorage + cookies nf_country / nf_lang lus par Netlify pour la racine "/")
       et le pays dans iashark_pays ;
     - on ouvre la MEME page dans la version choisie (I18N.switchHref).

   Jamais rien : pour un robot, apres un choix de version (selecteur, bandeau,
   cookies nf_*), si localStorage est indisponible (impossible de retenir le choix :
   on ne harcele pas), sur connexion / inscription / compte / paiement /
   desinscription / 404, et sur les pages sans version de langue (admin...).

   decide(env), dirFor(code, langue) et proposition(pageDir, code, langue) sont pures
   (tests/pays-choix.test.js) ; run(I18N, window, fin) lit le navigateur et affiche ;
   fin(montre) est appele une fois la decision prise. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module && module.exports) module.exports = api;
  else if (root) root.IasharkPaysChoix = api;
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var ID = "iasharkPays";
  var KEYS = { pays: "iashark_pays", ferme: "iashark_pays_ferme", chosen: "iashark_dir_chosen" };
  var GEO_KEY = "iashark_geo_v1"; // cache de funnel-track.js (sessionStorage)

  // Code pays ISO -> [nom dans la langue du pays, version du site].
  // "ca" (Canada) : version selon la langue du telephone (fr sinon en).
  var PAYS = {
    FR: ["France", "fr"], BE: ["Belgique", "fr"], CH: ["Suisse", "fr"], LU: ["Luxembourg", "fr"],
    MC: ["Monaco", "fr"], CA: ["Canada", "ca"], CI: ["Côte d'Ivoire", "fr"], SN: ["Sénégal", "fr"],
    CM: ["Cameroun", "fr"], ML: ["Mali", "fr"], BF: ["Burkina Faso", "fr"], GN: ["Guinée", "fr"],
    BJ: ["Bénin", "fr"], TG: ["Togo", "fr"], NE: ["Niger", "fr"], GA: ["Gabon", "fr"],
    CG: ["Congo", "fr"], CD: ["RD Congo", "fr"], MG: ["Madagascar", "fr"], MA: ["Maroc", "fr"],
    DZ: ["Algérie", "fr"], TN: ["Tunisie", "fr"], HT: ["Haïti", "fr"],
    GB: ["United Kingdom", "gb"], ZA: ["South Africa", "za"],
    US: ["United States", "en"], IE: ["Ireland", "en"], NG: ["Nigeria", "en"], GH: ["Ghana", "en"],
    KE: ["Kenya", "en"], UG: ["Uganda", "en"], TZ: ["Tanzania", "en"], ZM: ["Zambia", "en"],
    IN: ["India", "en"], AU: ["Australia", "en"], NZ: ["New Zealand", "en"],
    DE: ["Deutschland", "en"], AT: ["Österreich", "en"], IT: ["Italia", "en"], NL: ["Nederland", "en"],
    SE: ["Sverige", "en"], NO: ["Norge", "en"], DK: ["Danmark", "en"], FI: ["Suomi", "en"],
    PL: ["Polska", "en"], RO: ["România", "en"], GR: ["Ελλάδα", "en"], TR: ["Türkiye", "en"],
    AE: ["United Arab Emirates", "en"],
    MX: ["México", "mx"],
    ES: ["España", "es"], AR: ["Argentina", "es"], CO: ["Colombia", "es"], CL: ["Chile", "es"],
    PE: ["Perú", "es"], VE: ["Venezuela", "es"], EC: ["Ecuador", "es"], UY: ["Uruguay", "es"],
    PY: ["Paraguay", "es"], BO: ["Bolivia", "es"], CR: ["Costa Rica", "es"], GT: ["Guatemala", "es"],
    DO: ["República Dominicana", "es"], PA: ["Panamá", "es"],
    BR: ["Brasil", "pt"], PT: ["Portugal", "pt"], AO: ["Angola", "pt"], MZ: ["Moçambique", "pt"],
    CV: ["Cabo Verde", "pt"]
  };
  // Ordre d'affichage : les pays qui viennent le plus, puis les autres par nom.
  var EN_TETE = ["FR", "US", "GB", "BR", "ES", "MX", "BE", "CI", "PT", "CA", "SN", "MA"];

  // Textes, dans la langue de la page.
  var TEXT = {
    fr: { lang: "fr", title: "Choisis ton pays", go: "Continuer", search: "Chercher un pays", close: "Fermer", other: "Autre pays", empty: "Aucun pays trouvé" },
    en: { lang: "en", title: "Choose your country", go: "Continue", search: "Search a country", close: "Close", other: "Other country", empty: "No country found" },
    es: { lang: "es", title: "Elige tu país", go: "Continuar", search: "Buscar un país", close: "Cerrar", other: "Otro país", empty: "Ningún país encontrado" },
    pt: { lang: "pt", title: "Escolhe o teu país", go: "Continuar", search: "Procurar um país", close: "Fechar", other: "Outro país", empty: "Nenhum país encontrado" }
  };
  // Bande du bas : « {pays} · Voir le site en francais », dans la langue de la version proposee.
  var BANDE = {
    fr: { lang: "fr", go: "Voir le site en français", other: "Autre pays", close: "Fermer", label: "Version du site" },
    en: { lang: "en", go: "View the site in English", other: "Other country", close: "Close", label: "Site version" },
    es: { lang: "es", go: "Ver el sitio en español", other: "Otro país", close: "Cerrar", label: "Versión del sitio" },
    pt: { lang: "pt", go: "Ver o site em português", other: "Outro país", close: "Fechar", label: "Versão do site" }
  };
  // Langue des textes d'une version du site (gb, za : anglais ; mx : espagnol).
  var LANGUE_DIR = { fr: "fr", en: "en", gb: "en", za: "en", es: "es", mx: "es", pt: "pt" };
  // « Autre pays » : choix de la langue seulement.
  var LANGUES = [["fr", "Français"], ["en", "English"], ["es", "Español"], ["pt", "Português"]];

  var BOT_RE = /bot\/|bot-|bot;|telegrambot|crawl|spider|slurp|mediapartners|facebookexternalhit|facebookcatalog|embedly|pinterest|preview|lighthouse|pagespeed|headless|phantomjs|prerender|gtmetrix|google-inspectiontool|yandex|baiduspider|bytespider|petalbot|ahrefs|semrush|mj12|dotbot/i;
  var SKIP_PAGE_RE = /\/(connexion|inscription|mot-de-passe-oublie|reinitialiser-mot-de-passe|compte|abonnement|checkout-annule|checkout-succes|desinscription-email|404|admin)\.html$/;

  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function safeGet(s, k) { try { return s ? s.getItem(k) : null; } catch (e) { return null; } }
  function safeSet(s, k, v) { try { if (s) s.setItem(k, v); } catch (e) {} }
  function baseLang(tag) { return String(tag || "").toLowerCase().split(/[-_]/)[0]; }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }

  // Version du site d'un pays ("" si pays inconnu).
  function dirFor(code, phoneLang) {
    var c = String(code || "").toUpperCase();
    if (!has(PAYS, c)) return "";
    var d = PAYS[c][1];
    if (d === "ca") return baseLang(phoneLang) === "fr" ? "fr" : "en";
    return d;
  }

  // env : { pageDir, pathname, userAgent, webdriver, storageOk, chosen,
  //   choiceCookie, pays, ferme }
  function decide(env) {
    env = env || {};
    if (!env.pageDir) return { show: false, reason: "no-page-dir" };
    if (SKIP_PAGE_RE.test(String(env.pathname || ""))) return { show: false, reason: "skip-page" };
    if (env.webdriver || BOT_RE.test(String(env.userAgent || ""))) return { show: false, reason: "bot" };
    if (!env.storageOk) return { show: false, reason: "no-storage" };
    if (env.pays) return { show: false, reason: "already-chosen" };
    if (env.ferme) return { show: false, reason: "closed" };
    if (env.chosen || env.choiceCookie) return { show: false, reason: "dir-chosen" };
    return { show: true };
  }

  // Faut-il proposer une autre version ? null si pays inconnu, hors liste, ou si la page est deja
  // dans la version de ce pays. Sinon { code, name, dir, lang } (lang : langue des textes de la bande).
  function proposition(pageDir, code, phoneLang) {
    var c = String(code || "").toUpperCase();
    var d = dirFor(c, phoneLang);
    if (!d || !pageDir || d === pageDir) return null;
    return { code: c, name: PAYS[c][0], dir: d, lang: LANGUE_DIR[d] || "en" };
  }

  // Liste ordonnee [{code, name}] avec le pays devine en premier.
  function orderedList(guess) {
    var seen = {}, out = [];
    function push(c) { if (has(PAYS, c) && !seen[c]) { seen[c] = 1; out.push({ code: c, name: PAYS[c][0] }); } }
    if (guess) push(String(guess).toUpperCase());
    EN_TETE.forEach(push);
    Object.keys(PAYS).sort(function (a, b) { return PAYS[a][0].localeCompare(PAYS[b][0]); }).forEach(push);
    return out;
  }

  function norm(s) {
    s = String(s || "").toLowerCase();
    try { s = s.normalize("NFD").replace(/[̀-ͯ]/g, ""); } catch (e) {}
    return s;
  }

  function readGeoCountry(w) {
    try {
      var raw = w.sessionStorage.getItem(GEO_KEY);
      if (!raw || raw === "none") return null;
      var g = JSON.parse(raw);
      return g && typeof g.country === "string" && /^[A-Z]{2}$/.test(g.country) ? g.country : null;
    } catch (e) { return null; }
  }
  function fetchGeoCountry(w, done) {
    var c = readGeoCountry(w);
    if (c) { done(c); return; }
    try {
      if (typeof w.fetch !== "function") { done(null); return; }
      w.fetch("/api/geo", { method: "GET", credentials: "omit", cache: "no-store" })
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (d) {
          var code = d && typeof d.country === "string" && /^[A-Z]{2}$/.test(d.country) ? d.country : null;
          done(code);
        }, function () { done(null); });
    } catch (e) { done(null); }
  }

  var CSS =
    "#iasharkPays{position:fixed;inset:0;z-index:10050;display:flex;align-items:center;justify-content:center;padding:16px;" +
    "background:rgba(3,7,12,.72);font:15px/1.4 Inter,'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#f4f7fb}" +
    "#iasharkPays .ip-box{position:relative;width:100%;max-width:400px;max-height:min(560px,calc(100vh - 32px));display:flex;flex-direction:column;" +
    "background:#0a1420;border:1px solid rgba(141,179,211,.18);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.55);overflow:hidden}" +
    "#iasharkPays .ip-head{padding:20px 20px 12px}" +
    "#iasharkPays h2{margin:0 40px 14px 0;font:400 30px/1 Anton,Impact,'Arial Narrow',sans-serif;letter-spacing:.01em;text-transform:uppercase;color:#f4f7fb}" +
    "#iasharkPays .ip-x{position:absolute;top:10px;right:10px;width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:#91a0b3;font-size:24px;line-height:1;cursor:pointer}" +
    "#iasharkPays .ip-x:hover{color:#f4f7fb;background:rgba(141,179,211,.08)}" +
    "#iasharkPays .ip-go{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:52px;padding:0 18px;border:0;border-radius:12px;" +
    "background:#20d5ef;color:#060b12;font:800 16px/1.2 Inter,system-ui,sans-serif;cursor:pointer;box-shadow:0 8px 24px rgba(32,213,239,.25)}" +
    "#iasharkPays .ip-go:hover{background:#06b6d4}" +
    "#iasharkPays .ip-go[hidden]{display:none}" +
    "#iasharkPays .ip-search{display:block;width:100%;box-sizing:border-box;margin-top:12px;height:46px;padding:0 14px;border:1px solid rgba(141,179,211,.22);border-radius:12px;" +
    "background:#0d1926;color:#f4f7fb;font:16px Inter,system-ui,sans-serif;outline:none}" +
    "#iasharkPays .ip-search:focus{border-color:#20d5ef}" +
    "#iasharkPays .ip-search::placeholder{color:#91a0b3}" +
    "#iasharkPays .ip-list{list-style:none;margin:0;padding:0 8px 8px;overflow-y:auto;-webkit-overflow-scrolling:touch;flex:1 1 auto;min-height:120px}" +
    "#iasharkPays .ip-list button{display:block;width:100%;min-height:46px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:#f4f7fb;" +
    "font:15px/1.2 Inter,system-ui,sans-serif;text-align:left;cursor:pointer}" +
    "#iasharkPays .ip-list button:hover,#iasharkPays .ip-list button:focus-visible{background:rgba(32,213,239,.10);outline:none}" +
    "#iasharkPays .ip-list .ip-sel{color:#20d5ef;font-weight:700}" +
    "#iasharkPays .ip-empty{padding:12px;color:#91a0b3}" +
    "#iasharkPays .ip-other{padding:12px 20px 16px;border-top:1px solid rgba(141,179,211,.14)}" +
    "#iasharkPays .ip-other p{margin:0 0 8px;color:#91a0b3;font-size:13px}" +
    "#iasharkPays .ip-langs{display:flex;flex-wrap:wrap;gap:8px}" +
    "#iasharkPays .ip-langs button{min-height:40px;padding:0 14px;border:1px solid rgba(141,179,211,.22);border-radius:10px;background:transparent;color:#f4f7fb;font:14px Inter,system-ui,sans-serif;cursor:pointer}" +
    "#iasharkPays .ip-langs button:hover{border-color:#20d5ef;color:#20d5ef}" +
    "#iasharkPays button:focus-visible{outline:2px solid #20d5ef;outline-offset:2px}" +
    "@media (max-width:520px){#iasharkPays{align-items:flex-end;padding:0}" +
    "#iasharkPays .ip-box{max-width:none;max-height:86vh;border-radius:18px 18px 0 0;padding-bottom:env(safe-area-inset-bottom)}}" +
    "@media print{#iasharkPays,#iasharkPaysBande{display:none}}" +
    // Bande du bas (12/11/2026) : ne recouvre rien, memes mesures que le bandeau de langue (lib/lang-suggest.js).
    "#iasharkPaysBande{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:1001;" +
    "display:flex;align-items:center;gap:4px;width:max-content;max-width:calc(100vw - 24px);box-sizing:border-box;padding:6px 6px 6px 14px;" +
    "background:#0d1926;border:1px solid rgba(141,179,211,.22);border-radius:14px;box-shadow:0 12px 32px rgba(0,0,0,.45);" +
    "font:14px/1.3 Inter,'DM Sans',system-ui,-apple-system,'Segoe UI',sans-serif;color:#c6d1de}" +
    "#iasharkPaysBande.ip-nav{bottom:calc(96px + env(safe-area-inset-bottom))}" +
    "@media(max-width:700px){#iasharkPaysBande.ip-nav{bottom:calc(84px + env(safe-area-inset-bottom))}}" +
    "#iasharkPaysBande .ipb-go{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 4px 0 0;border:0;background:transparent;color:#f4f7fb;font:600 14px/1.3 Inter,system-ui,sans-serif;text-align:left;cursor:pointer}" +
    "#iasharkPaysBande .ipb-go b{font-weight:700;color:#c6d1de}" +
    "#iasharkPaysBande .ipb-go i{font-style:normal;color:#20d5ef}" +
    "#iasharkPaysBande .ipb-go:hover span{text-decoration:underline;text-underline-offset:3px}" +
    "#iasharkPaysBande .ipb-autre{min-height:44px;padding:0 8px;border:0;background:transparent;color:#91a0b3;font:13px/1.3 Inter,system-ui,sans-serif;white-space:nowrap;cursor:pointer}" +
    "#iasharkPaysBande .ipb-autre:hover{color:#f4f7fb}" +
    "#iasharkPaysBande .ipb-x{flex:none;width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:#91a0b3;font-size:22px;line-height:1;cursor:pointer}" +
    "#iasharkPaysBande .ipb-x:hover{color:#f4f7fb;background:rgba(141,179,211,.08)}" +
    "#iasharkPaysBande button:focus-visible{outline:2px solid #20d5ef;outline-offset:2px}" +
    "@media(max-width:420px){#iasharkPaysBande .ipb-autre{display:none}}";

  function run(I18N, w, fin) {
    w = w || (typeof window !== "undefined" ? window : null);
    var rendu = false;
    function finir(montre) { if (rendu) return; rendu = true; if (typeof fin === "function") { try { fin(!!montre); } catch (e) {} } }
    if (!w || !I18N || w.__iasharkPaysShown) { finir(false); return; }
    var doc = w.document, nav = w.navigator || {}, loc = w.location || {};
    var ls = null, storageOk = false;
    try { ls = w.localStorage; ls.setItem("iashark_pays_test", "1"); ls.removeItem("iashark_pays_test"); storageOk = true; } catch (e) { ls = null; }
    var pageDir = "";
    pageDir = I18N.dir || "";
    if (!pageDir) {
      var m = String(loc.pathname || "").match(/^\/([a-z]{2})(\/|$)/);
      pageDir = m ? m[1] : (loc.pathname === "/" || /^\/match\/\d+\.html$/.test(String(loc.pathname || "")) ? "fr" : "");
    }
    var d = decide({
      pageDir: pageDir, pathname: loc.pathname, userAgent: nav.userAgent, webdriver: !!nav.webdriver,
      storageOk: storageOk, chosen: !!safeGet(ls, KEYS.chosen),
      choiceCookie: /(?:^|;\s*)nf_(?:country|lang)=/.test(String(doc.cookie || "")),
      pays: safeGet(ls, KEYS.pays), ferme: safeGet(ls, KEYS.ferme)
    });
    if (!d.show || !doc.body) { finir(false); return; }
    var phoneLang = (nav.languages && nav.languages[0]) || nav.language || "";

    function poserCss() {
      if (doc.getElementById("iasharkPaysCss")) return;
      var st = doc.createElement("style");
      st.id = "iasharkPaysCss";
      st.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(st);
    }
    function choose(dir, code) {
      if (!dir) return;
      if (code) safeSet(ls, KEYS.pays, code);
      try { I18N.rememberChoice(dir); } catch (e) {}
      if (dir !== pageDir) {
        var href = "";
        try { href = I18N.switchHref(dir); } catch (e) {}
        if (href) { try { loc.assign(href); } catch (e) { loc.href = href; } }
      }
    }
    function suivre(kind) {
      try { if (typeof w.iasharkTrack === "function") w.iasharkTrack("click", { kind: kind }); } catch (e) {}
    }

    // LA BANDE : seulement si le pays devine a une autre version du site que celle de la page.
    fetchGeoCountry(w, function (code) {
      var p = proposition(pageDir, code, phoneLang);
      if (!p || w.__iasharkPaysShown || !doc.body) { finir(false); return; }
      w.__iasharkPaysShown = true;
      poserCss();
      var tb = BANDE[p.lang] || BANDE.en;
      var bande = doc.createElement("div");
      bande.id = "iasharkPaysBande";
      bande.setAttribute("role", "region");
      bande.setAttribute("aria-label", tb.label);
      bande.setAttribute("lang", tb.lang);
      // Barre d'onglets du bas (bottom-navigation.js) : la bande se pose juste au-dessus, jamais dessus.
      if (doc.querySelector(".site-bottom-nav")) bande.className = "ip-nav";
      bande.innerHTML =
        '<button type="button" class="ipb-go"><b>' + esc(p.name) + '</b><span>' + esc(tb.go) + '</span><i aria-hidden="true">→</i></button>' +
        '<button type="button" class="ipb-autre">' + esc(tb.other) + "</button>" +
        '<button type="button" class="ipb-x" aria-label="' + esc(tb.close) + '"><span aria-hidden="true">×</span></button>';
      function retirer() { if (bande.parentNode) bande.parentNode.removeChild(bande); }
      bande.querySelector(".ipb-go").addEventListener("click", function () { suivre("pays_bande_changer"); retirer(); choose(p.dir, p.code); });
      bande.querySelector(".ipb-x").addEventListener("click", function () { suivre("pays_bande_fermer"); safeSet(ls, KEYS.ferme, "1"); retirer(); });
      bande.querySelector(".ipb-autre").addEventListener("click", function () { suivre("pays_bande_autre"); retirer(); ouvrirListe(p.code); });
      doc.body.appendChild(bande);
      finir(true);
    });

    // LA LISTE COMPLETE : a la demande seulement (« Autre pays » de la bande).
    function ouvrirListe(guessInitial) {
    var pageLang = baseLang(I18N.locale || pageDir);
    var t = TEXT[pageLang] || TEXT.en;
    poserCss();

    var el = doc.createElement("div");
    el.id = ID;
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "iasharkPaysTitle");
    el.setAttribute("lang", t.lang);
    el.innerHTML =
      '<div class="ip-box">' +
      '<div class="ip-head">' +
      '<h2 id="iasharkPaysTitle">' + esc(t.title) + "</h2>" +
      '<button type="button" class="ip-x" aria-label="' + esc(t.close) + '"><span aria-hidden="true">×</span></button>' +
      '<button type="button" class="ip-go" hidden><span class="ip-go-name"></span><span>' + esc(t.go) + " →</span></button>" +
      '<input class="ip-search" type="search" autocomplete="off" placeholder="' + esc(t.search) + '" aria-label="' + esc(t.search) + '">' +
      "</div>" +
      '<ul class="ip-list" role="list"></ul>' +
      '<div class="ip-other"><p>' + esc(t.other) + '</p><div class="ip-langs">' +
      LANGUES.map(function (l) { return '<button type="button" data-lang="' + l[0] + '" lang="' + l[0] + '">' + esc(l[1]) + "</button>"; }).join("") +
      "</div></div></div>";

    var list = el.querySelector(".ip-list"), input = el.querySelector(".ip-search"), go = el.querySelector(".ip-go");
    var guess = guessInitial && has(PAYS, guessInitial) ? guessInitial : null;
    var prevOverflow = doc.documentElement.style.overflow;

    function render() {
      var q = norm(input.value).trim();
      var items = orderedList(guess).filter(function (p) { return !q || norm(p.name).indexOf(q) !== -1 || p.code.toLowerCase() === q; });
      list.innerHTML = items.length ? items.map(function (p) {
        return '<li><button type="button" data-code="' + p.code + '"' + (p.code === guess ? ' class="ip-sel"' : "") + ">" + esc(p.name) + "</button></li>";
      }).join("") : '<li class="ip-empty">' + esc(t.empty) + "</li>";
    }

    function closeBox() {
      if (el.parentNode) el.parentNode.removeChild(el);
      doc.documentElement.style.overflow = prevOverflow;
      doc.removeEventListener("keydown", onKey, true);
    }

    function choisir(dir, code) { closeBox(); choose(dir, code); }

    function onKey(e) {
      if (e.key === "Escape") { safeSet(ls, KEYS.ferme, "1"); closeBox(); }
    }

    list.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button[data-code]") : null;
      if (!b) return;
      var code = b.getAttribute("data-code");
      choisir(dirFor(code, phoneLang), code);
    });
    el.querySelector(".ip-langs").addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button[data-lang]") : null;
      if (!b) return;
      safeSet(ls, KEYS.pays, "XX");
      choisir(b.getAttribute("data-lang"), null);
    });
    go.addEventListener("click", function () { if (guess) choisir(dirFor(guess, phoneLang), guess); });
    el.querySelector(".ip-x").addEventListener("click", function () { safeSet(ls, KEYS.ferme, "1"); closeBox(); });
    el.addEventListener("click", function (e) { if (e.target === el) { safeSet(ls, KEYS.ferme, "1"); closeBox(); } });
    input.addEventListener("input", render);
    doc.addEventListener("keydown", onKey, true);

    render();
    doc.body.appendChild(el);
    doc.documentElement.style.overflow = "hidden";
    if (guess) { el.querySelector(".ip-go-name").textContent = PAYS[guess][0]; go.hidden = false; }
    try { (guess ? go : el.querySelector(".ip-x")).focus({ preventScroll: true }); } catch (e) {}
    }
  }

  return { decide: decide, dirFor: dirFor, proposition: proposition, orderedList: orderedList, run: run, PAYS: PAYS, TEXT: TEXT, BANDE: BANDE, KEYS: KEYS };
});
