/* IASHARK — fenetre « Choisis ton pays » (09/11/2026, demande de Clement :
   « des que ca ouvre il voit un petit popup avec les pays, il choisit, et on
   traduit les pages direct ; il ne doit pas le refaire a chaque fois »).

   A la premiere visite seulement, une petite fenetre propose la liste des
   pays (nom ecrit dans la langue du pays). Le pays devine par le reseau
   (/api/geo, deja lu par funnel-track.js) est en tete : un seul toucher sur
   « Continuer » suffit. Au choix :
     - la version du site du pays est memorisee sur le telephone
       (I18N.rememberChoice : localStorage + cookies nf_country / nf_lang lus
       par Netlify pour la racine "/") et le pays dans iashark_pays ;
     - si la page n'est pas deja dans la bonne version, on ouvre la MEME page
       dans la langue du pays (I18N.switchHref).
   Fermer la fenetre (croix, Echap) : elle ne revient plus (iashark_pays_ferme).

   Jamais de fenetre : pour un robot, apres un choix de version (selecteur,
   bandeau, cookies nf_*), si localStorage est indisponible (impossible de
   retenir le choix : on ne harcele pas), sur connexion / inscription /
   compte / paiement / desinscription / 404, et sur les pages sans version
   de langue (admin...).

   decide(env) et dirFor(code, langue) sont pures (tests/pays-choix.test.js) ;
   run(I18N, window) lit le navigateur, decide et affiche. */
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
    "@media print{#iasharkPays{display:none}}";

  function run(I18N, w) {
    w = w || (typeof window !== "undefined" ? window : null);
    if (!w || !I18N || w.__iasharkPaysShown) return;
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
    if (!d.show || !doc.body) return;
    w.__iasharkPaysShown = true;

    var pageLang = baseLang(I18N.locale || pageDir);
    var t = TEXT[pageLang] || TEXT.en;
    var phoneLang = (nav.languages && nav.languages[0]) || nav.language || "";

    if (!doc.getElementById("iasharkPaysCss")) {
      var st = doc.createElement("style");
      st.id = "iasharkPaysCss";
      st.textContent = CSS;
      (doc.head || doc.documentElement).appendChild(st);
    }

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
    var guess = null;
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

    function choose(dir, code) {
      if (!dir) return;
      if (code) safeSet(ls, KEYS.pays, code);
      try { I18N.rememberChoice(dir); } catch (e) {}
      closeBox();
      if (dir !== pageDir) {
        var href = "";
        try { href = I18N.switchHref(dir); } catch (e) {}
        if (href) { try { loc.assign(href); } catch (e) { loc.href = href; } }
      }
    }

    function onKey(e) {
      if (e.key === "Escape") { safeSet(ls, KEYS.ferme, "1"); closeBox(); }
    }

    list.addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button[data-code]") : null;
      if (!b) return;
      var code = b.getAttribute("data-code");
      choose(dirFor(code, phoneLang), code);
    });
    el.querySelector(".ip-langs").addEventListener("click", function (e) {
      var b = e.target && e.target.closest ? e.target.closest("button[data-lang]") : null;
      if (!b) return;
      safeSet(ls, KEYS.pays, "XX");
      choose(b.getAttribute("data-lang"), null);
    });
    go.addEventListener("click", function () { if (guess) choose(dirFor(guess, phoneLang), guess); });
    el.querySelector(".ip-x").addEventListener("click", function () { safeSet(ls, KEYS.ferme, "1"); closeBox(); });
    el.addEventListener("click", function (e) { if (e.target === el) { safeSet(ls, KEYS.ferme, "1"); closeBox(); } });
    input.addEventListener("input", render);
    doc.addEventListener("keydown", onKey, true);

    render();
    doc.body.appendChild(el);
    doc.documentElement.style.overflow = "hidden";
    try { el.querySelector(".ip-x").focus({ preventScroll: true }); } catch (e) {}

    fetchGeoCountry(w, function (code) {
      if (!code || !has(PAYS, code) || !el.parentNode) return;
      guess = code;
      el.querySelector(".ip-go-name").textContent = PAYS[code][0];
      go.hidden = false;
      render();
      try { go.focus({ preventScroll: true }); } catch (e) {}
    });
  }

  return { decide: decide, dirFor: dirFor, orderedList: orderedList, run: run, PAYS: PAYS, TEXT: TEXT, KEYS: KEYS };
});
