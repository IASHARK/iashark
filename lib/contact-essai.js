/* IASHARK — « Nous contacter » et fenetre d'essai gratuit (30/10/2026).

   Charge sur TOUTES les pages par site-prefs.js (meme principe que
   funnel-track.js), donc une seule copie, localisee au runtime.

   1) Nous contacter : une ligne ajoutee au pied de page de chaque page (le
      dernier <footer> ; a defaut, un petit pied de page cree avant la barre de
      navigation du bas). Lien vers la page Contact de la version (contact.html :
      Telegram prive https://t.me/IASHARK, compte qui accepte les messages, et
      formulaire). La chaine t.me/iasharkdata ne permet pas de repondre. Les
      lignes statiques [data-contact-paiement] des pages Pro et abonnement sont
      ecrites dans le HTML (traduites au build).
      CONTACT.email : VIDE tant que Clement n'a pas donne d'adresse ; aucune
      adresse affichee nulle part, jamais d'adresse inventee.

   2) Fenetre d'essai : A CHAQUE PAGE VUE (decision du 31/10/2026 : plus de
      limite par jour ; sans localStorage, jamais de fenetre), seulement si
        - la page n'est pas une page de paiement, connexion, inscription, Pro ou
          compte (EXCLUES ci-dessous) ;
        - un compte est connecte (session Supabase de ce navigateur) ;
        - ce compte n'est ni Pro ni admin (public.users : plan pro/famille,
          role admin = meme regle que app-client.js#context) ;
        - ce compte n'a AUCUNE ligne dans public.subscriptions (tous statuts) :
          un ancien abonne n'a pas droit a l'essai (create-checkout-session/
          trial.ts, « already_had_subscription ») ;
        - le serveur accorde l'essai en ce moment (mode « availability » :
          trial_days > 0 et "month" dans trial_intervals, meme regle que
          lib/offre-pro.js#essaiOuvert). Nombre de jours lu chez le serveur.
      Au moindre doute (erreur reseau, jeton expire, reponse illisible) : rien.
      Bouton principal : paiement Stripe direct (voir 4), case de consentement
      dans la fenetre.

   3) Visiteurs SANS compte (decision du 31/10/2026) : meme fenetre, memes
      exclusions de pages, a chaque page vue, des la page
      d'arrivee, ~4 s apres l'ouverture (ou a mi-defilement si c'est avant),
      jamais pour un robot (navigator.webdriver ou user agent de robot), jamais
      sur une page quittee par la redirection de langue (i18n/i18n.js,
      __iasharkLangRedirecting : la page de langue l'affiche).
      Titre propre (title_visiteur) ; meme compte a rebours de 5 jours (voir plus bas).

   3 bis) Compte gratuit sur le MATCH OFFERT (decision du 31/10/2026) : c'est
      la place principale. match-page.js signale l'analyse ouverte
      (evenement iashark:match-offert-ouvert) ; la fenetre s'ouvre ~4 s apres,
      en grand, titre « Ne t’arrête pas là. ». Sur match.html sans
      ce signal (10 s), et sur les autres pages, la fenetre classique reste le
      repli. A chaque page vue (plus de limite par jour).

   4) Paiement DIRECT depuis la fenetre (decision du 31/10/2026) : ni pro.html
      ni abonnement.html. La case de consentement (lib/checkout-consent.js,
      la meme que partout : CGV + demande de debut immediat selon le marche)
      est DANS la fenetre et obligatoire avant le clic ; le serveur la
      re-verifie (create-checkout-session/consent.ts), rien n'est contourne.
      - Compte gratuit connecte : clic -> create-checkout-session (mois, meme
        appel que lib/offre-pro.js#payer) -> page Stripe.
      - Visiteur sans compte : clic -> consentement garde en sessionStorage
        (30 min) -> inscription.html?next=<page courante>?ia_essai=1 ; au retour,
        compte cree, ce fichier lance le paiement tout seul (ecran « Ouverture
        du paiement securise… ») -> page Stripe. En cas d'echec : repli sur
        abonnement.html?duree=month&etape=compte. */
(function () {
  "use strict";
  if (window.__iasharkContactEssai) return;
  window.__iasharkContactEssai = true;

  var CONTACT = {
    telegram: "https://t.me/IASHARK",
    // Adresse e-mail de contact : a remplir quand Clement l'aura donnee.
    email: ""
  };
  window.IasharkContact = CONTACT;

  var SUPA_URL = "https://ksvjraqitxouwiabecai.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8";
  var SESSION_KEY = "sb-ksvjraqitxouwiabecai-auth-token";
  var CONSENT_KEY = "iashark_essai_consent";
  var RETOUR_PARAM = "ia_essai";

  var DEBUT = Date.now();
  // Offre de 5 jours (compte gratuit, et visiteur avec la cle « visiteur ») : la 1re apparition de la fenetre pour ce
  // compte est datee (localStorage, cle par compte) ; « Offre valable encore X
  // jours » est calcule depuis cette date ; apres 5 jours la fenetre ne s'ouvre
  // plus pour ce compte. Sans stockage : pas de fenetre (jamais de faux compte).
  var OFFRE_JOURS = 5, JOUR_MS = 86400000;
  // Jours restants (5..1), 0 si l'offre est finie, null si stockage indisponible.
  function joursOffreRestants(userId) {
    try {
      var k = "iashark_essai_offre_" + userId, v = parseInt(localStorage.getItem(k), 10);
      if (!v || v > Date.now()) return OFFRE_JOURS;
      return Math.max(0, OFFRE_JOURS - Math.floor((Date.now() - v) / JOUR_MS));
    } catch (e) { return null; }
  }
  function dateroffre(userId) {
    try {
      var k = "iashark_essai_offre_" + userId;
      if (!parseInt(localStorage.getItem(k), 10)) localStorage.setItem(k, String(Date.now()));
    } catch (e) {}
  }
  // Visiteur : ~4 s apres l'ouverture, ou des la moitie de la page defilee.
  function attendreVisiteur() {
    return new Promise(function (ok) {
      var fini = false, minuterie;
      var go = function () { if (fini) return; fini = true; clearTimeout(minuterie); window.removeEventListener("scroll", defile); ok(); };
      var defile = function () {
        var h = document.documentElement.scrollHeight - window.innerHeight;
        if (h > 0 && window.scrollY / h >= 0.5) go();
      };
      minuterie = setTimeout(go, Math.max(0, 4000 - (Date.now() - DEBUT)));
      window.addEventListener("scroll", defile, { passive: true });
      defile();
    });
  }
  function estRobot() {
    try {
      if (navigator.webdriver) return true;
      return /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|curl|wget|python|axios|node-fetch|phantom|puppeteer|playwright/i.test(navigator.userAgent || "");
    } catch (e) { return true; }
  }

  // Pages ou la fenetre ne s'ouvre jamais.
  var EXCLUES = {
    "abonnement.html": 1, "checkout-succes.html": 1, "checkout-annule.html": 1,
    "connexion.html": 1, "inscription.html": 1, "mot-de-passe-oublie.html": 1,
    "reinitialiser-mot-de-passe.html": 1, "pro.html": 1, "compte.html": 1,
    "admin.html": 1, "maintenance.html": 1, "desinscription-email.html": 1
  };

  // Textes de repli (FR) ; traductions dans i18n/dict/<langue>.json.
  var FR = {
    contact: {
      question: "Une question ?",
      link: "Nous contacter",
      email_label: "E-mail"
    },
    essai_fenetre: {
      title: "Ne t’arrête pas là.",
      text: "Une semaine de Pro offerte : tous les paris du jour, la Sélection en or, les buteurs du jour, les combinés, les montantes.",
      text_n: "{n} jours de Pro offerts : tous les paris du jour, la Sélection en or, les buteurs du jour, les combinés, les montantes.",
      title_visiteur: "Découvre la semaine Pro offerte",
      title_visiteur_n: "Découvre tes {n} jours de Pro offerts",
      text_visiteur: "Tous les paris du jour, la Sélection en or, les buteurs du jour, les combinés, les montantes.",
      offer_days: "Offre valable encore {x} jours",
      offer_last: "Offre valable encore aujourd’hui",
      fine: "Carte demandée. Ensuite {price} par mois, sauf résiliation avant la fin de l’essai.",
      fine_noprice: "Carte demandée. Ensuite le prix du mois, sauf résiliation avant la fin de l’essai.",
      cta: "Activer ma semaine offerte",
      cta_n: "Activer mes {n} jours offerts",
      later: "Plus tard",
      opening: "Ouverture du paiement sécurisé…",
      error: "Impossible d’ouvrir le paiement pour le moment.",
      close: "Fermer"
    }
  };

  // ---------- Langue ----------
  function detectLocale() {
    if (window.I18N && window.I18N.locale) return window.I18N.locale;
    var supported = ["fr", "en", "es", "es-mx", "de", "it", "pt"];
    var marches = { gb: "en", mx: "es-mx", za: "en" };
    var m = location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    if (m) {
      if (Object.prototype.hasOwnProperty.call(marches, m[1])) return marches[m[1]];
      if (supported.indexOf(m[1]) !== -1) return m[1];
    }
    return "fr";
  }
  var dict = null;
  function chargerTextes() {
    var I = window.I18N;
    if (I && typeof I.init === "function") {
      return Promise.resolve(I.dict || I.init()).then(function () { dict = I.dict || null; }, function () {});
    }
    var loc = detectLocale();
    if (loc === "fr") return Promise.resolve();
    return fetch("/i18n/dict/" + loc + ".json").then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { dict = d; }, function () {});
  }
  function t(chemin, vars) {
    var lire = function (src) { return chemin.split(".").reduce(function (o, k) { return o != null ? o[k] : null; }, src); };
    var s = (dict && lire(dict)) || lire(FR) || "";
    if (vars) s = String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; });
    return String(s);
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function lienLocal(p) {
    var i = p.search(/[?#]/), tail = "";
    if (i >= 0) { tail = p.slice(i); p = p.slice(0, i); }
    if (window.I18N && typeof window.I18N.href === "function") {
      try { var out = window.I18N.href(p); if (out) return String(out) + tail; } catch (e) {}
    }
    var m = location.pathname.match(/^\/([a-z]{2})\//);
    return (m ? "/" + m[1] + "/" : "/") + p + tail;
  }
  function pageCourante() {
    var f = location.pathname.split("/").pop();
    return f || "index.html";
  }

  // ---------- Styles (une seule feuille, injectee une fois) ----------
  var CSS = ""
    + ".ia-contact{margin:12px 0 0;font-size:13px;line-height:1.5;color:#91a0b3}"
    + ".ia-contact a{color:#20d5ef;text-decoration:underline;text-decoration-color:rgba(32,213,239,.4);text-underline-offset:3px;font-weight:600}"
    + ".ia-contact a:hover{text-decoration-color:#20d5ef}"
    + ".ia-contact a:focus-visible{outline:2px solid #20d5ef;outline-offset:3px;border-radius:3px}"
    + ".ia-contact-foot{max-width:1100px;margin:0 auto;padding:8px 20px 96px;text-align:center}"
    // Fenetre d'essai (dialog natif : piege du focus, Echap, fond inerte).
    + ".ia-essai{border:0;padding:0;margin:auto;background:transparent;color:#f4f7fb;width:min(440px,calc(100% - 32px));max-width:none;max-height:none;overflow:visible;font-family:Inter,system-ui,-apple-system,'Segoe UI',sans-serif}"
    + ".ia-essai::backdrop{background:rgba(3,7,12,.74)}"
    + ".ia-essai-panel{position:relative;background:#0a1420;background-image:radial-gradient(120% 70% at 50% -10%,rgba(32,213,239,.13),transparent 60%);border:1px solid rgba(141,179,211,.16);border-radius:16px;padding:28px 24px 18px;box-shadow:0 28px 64px -16px rgba(0,0,0,.7)}"
    + ".ia-essai[open] .ia-essai-panel{animation:iaEssaiIn .42s cubic-bezier(.16,1,.3,1)}"
    + ".ia-essai[open]::backdrop{animation:iaEssaiFond .3s ease-out}"
    + "@keyframes iaEssaiIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}"
    + "@keyframes iaEssaiFond{from{opacity:0}to{opacity:1}}"
    + ".ia-essai-x{position:absolute;top:10px;right:10px;width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:10px;background:transparent;color:#91a0b3;cursor:pointer}"
    + ".ia-essai-x:hover{color:#f4f7fb;background:rgba(255,255,255,.05)}"
    + ".ia-essai-x:focus-visible,.ia-essai-cta:focus-visible,.ia-essai-later:focus-visible{outline:2px solid #20d5ef;outline-offset:3px}"
    + ".ia-essai-marque{display:block;width:34px;height:3px;border-radius:2px;background:#20d5ef;margin:0 0 18px}"
    + ".ia-essai-titre{margin:0 36px 10px 0;font-size:22px;line-height:1.22;font-weight:800;letter-spacing:-.02em;text-wrap:balance}"
    + ".ia-essai-texte{margin:0;font-size:15px;line-height:1.55;color:#c6d1de}"
    + ".ia-essai-fin{margin:10px 0 0;font-size:12.5px;line-height:1.5;color:#91a0b3}"
    + ".ia-essai-actions{display:flex;flex-direction:column;gap:4px;margin-top:22px}"
    + ".ia-essai-cta{display:flex;align-items:center;justify-content:center;gap:8px;min-height:50px;border-radius:12px;background:#20d5ef;color:#04141b;font-size:15.5px;font-weight:800;text-decoration:none;letter-spacing:-.005em;transition:background-color .15s ease,transform .15s ease}"
    + ".ia-essai-cta:hover{background:#5fe2f4}"
    + ".ia-essai-cta:active{transform:translateY(1px)}"
    + ".ia-essai-cta svg{transition:transform .2s cubic-bezier(.16,1,.3,1)}"
    + ".ia-essai-cta:hover svg{transform:translateX(3px)}"
    + ".ia-essai-later{min-height:44px;border:0;background:transparent;color:#91a0b3;font:inherit;font-size:14px;font-weight:500;cursor:pointer;border-radius:10px;text-decoration:underline;text-decoration-color:rgba(145,160,179,.35);text-underline-offset:3px}"
    + ".ia-essai-later:hover{color:#f4f7fb}"
    + "@media (max-width:560px){"
    + ".ia-essai{width:100%;margin:auto 0 0;}"
    + ".ia-essai-panel{border-radius:18px 18px 0 0;border-bottom:0;padding:26px 20px calc(14px + env(safe-area-inset-bottom))}"
    + "@keyframes iaEssaiIn{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:none}}"
    + "}"
    + "@media (prefers-reduced-motion:reduce){.ia-essai[open] .ia-essai-panel,.ia-essai[open]::backdrop{animation:none}.ia-essai-cta svg{transition:none}}"
    // Ajouts du 31/10/2026 (meme design que la PR #237) : bouton au lieu d'un lien,
    // petite ligne de l'offre de 5 jours, case de consentement, message, ecran d'attente.
    + ".ia-essai-cta{width:100%;border:0;font-family:inherit;cursor:pointer}"
    + ".ia-essai-cta[aria-disabled=true]{opacity:.72;cursor:not-allowed}"
    + ".ia-essai-panel{max-height:calc(100dvh - 24px);overflow:auto;outline:none}"
    + ".ia-essai-offre{margin:10px 0 0;font-size:12.5px;line-height:1.5;color:#7fe8f7;font-weight:600;font-variant-numeric:tabular-nums}"
    + ".ia-essai .iash-consent{margin:16px 0 0;padding:10px 12px}"
    + ".ia-essai .ia-essai-accord{margin:10px 0 0;font-size:12px;line-height:1.45;color:#8aa0ad;text-align:center}.ia-essai .ia-essai-accord a{color:inherit;text-decoration:underline}"
    + ".ia-essai .iash-consent-title{display:none}"
    + ".ia-essai .iash-consent-row{font-size:12.5px;line-height:1.45}"
    + ".ia-essai-msg{margin:8px 0 0;font-size:13px;line-height:1.5;color:#c6d1de;text-align:center}"
    + ".ia-essai-msg.is-err{color:#f59e0b;font-weight:600}"
    + ".ia-essai-go{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;background:#05090f;color:#f4f7fb;font:600 16px/1.5 Inter,system-ui,sans-serif;text-align:center;padding:24px}";
    + "@media (prefers-reduced-motion:reduce){.ia-essai[open] .ia-essai-panel,.ia-essai[open]::backdrop{animation:none}.ia-essai-cta svg{transition:none}}";
  function injecterStyle() {
    if (document.getElementById("ia-contact-essai-style")) return;
    var s = document.createElement("style");
    s.id = "ia-contact-essai-style";
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // ---------- 1) Nous contacter ----------
  function htmlContact() {
    return esc(t("contact.question")) + ' <a href="' + esc(lienLocal("contact.html")) + '" data-track="contact_footer">'
      + esc(t("contact.link")) + "</a>";
  }
  function poserContact() {
    if (pageCourante() === "contact.html" || document.querySelector("[data-ia-contact]")) return;
    var p = document.createElement("p");
    p.className = "ia-contact";
    p.setAttribute("data-ia-contact", "");
    p.innerHTML = htmlContact();
    var pieds = document.querySelectorAll("footer");
    var pied = pieds.length ? pieds[pieds.length - 1] : null;
    if (pied) { pied.appendChild(p); return; }
    var f = document.createElement("footer");
    f.className = "ia-contact-foot";
    f.appendChild(p);
    var nav = document.querySelector(".bottom-nav");
    if (nav && nav.parentNode) nav.parentNode.insertBefore(f, nav);
    else document.body.appendChild(f);
  }

  // ---------- 2) Fenetre d'essai ----------

  // Jeton du compte connecte : client Supabase de la page s'il existe (jeton
  // rafraichi), sinon session memorisee par supabase-js dans ce navigateur.
  function session() {
    var App = window.IasharkApp;
    var client = window.sb || (App && App.supabase);
    if (client && client.auth && typeof client.auth.getSession === "function") {
      return client.auth.getSession().then(function (r) {
        var s = r && r.data && r.data.session;
        return s && s.access_token && s.user ? { token: s.access_token, id: s.user.id } : null;
      }, function () { return null; });
    }
    try {
      var brut = localStorage.getItem(SESSION_KEY);
      if (!brut) return Promise.resolve(null);
      var s = JSON.parse(brut);
      if (s && s.currentSession) s = s.currentSession;
      if (!s || !s.access_token || !s.user || !s.user.id) return Promise.resolve(null);
      if (s.expires_at && s.expires_at * 1000 < Date.now() + 30000) return Promise.resolve(null);
      return Promise.resolve({ token: s.access_token, id: s.user.id });
    } catch (e) { return Promise.resolve(null); }
  }
  function lireTable(chemin, jeton) {
    return fetch(SUPA_URL + "/rest/v1/" + chemin, { headers: { apikey: SUPA_KEY, Authorization: "Bearer " + jeton } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
  }
  // Compte gratuit, jamais abonne : true ; Pro, admin, ancien abonne ou doute : false.
  function compteGratuitSansHistorique(s) {
    var id = encodeURIComponent(s.id);
    return Promise.all([
      lireTable("users?select=plan,role&id=eq." + id, s.token),
      lireTable("subscriptions?select=status&user_id=eq." + id, s.token)
    ]).then(function (r) {
      var u = Array.isArray(r[0]) ? r[0][0] : null;
      if (!u) return false;
      if (u.plan === "pro" || u.plan === "famille" || u.role === "admin") return false;
      return Array.isArray(r[1]) && r[1].length === 0;
    }, function () { return false; });
  }
  // Jours d'essai accordes par le serveur en ce moment (0 = pas d'essai).
  function joursEssai() {
    var M = window.IASHARK_MARKET;
    var corps = { mode: "availability" };
    if (M && M.checkoutMarket && M.checkoutMarket !== "fr") corps.market = M.checkoutMarket;
    return fetch(SUPA_URL + "/functions/v1/create-checkout-session", {
      method: "POST",
      headers: { apikey: SUPA_KEY, Authorization: "Bearer " + SUPA_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(corps)
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || d.mode !== "availability" || !d.intervals || d.intervals.month !== true) return 0;
      var j = Number(d.trial_days), liste = Array.isArray(d.trial_intervals) ? d.trial_intervals : [];
      return Number.isFinite(j) && j > 0 && liste.indexOf("month") !== -1 ? Math.round(j) : 0;
    }, function () { return 0; });
  }
  function prixMois() {
    try {
      var M = window.IASHARK_MARKET, o = M && typeof M.proOffer === "function" ? M.proOffer() : null;
      var m = o && Array.isArray(o.intervals) ? o.intervals.filter(function (x) { return x && x.interval === "month"; })[0] : null;
      return m && m.text ? m.text : null;
    } catch (e) { return null; }
  }

  var ICONE_X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>';
  var ICONE_FLECHE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';


  // Visiteur sans compte : inscription, puis retour sur CETTE page avec
  // ?ia_essai=1, qui lance le paiement tout seul (lancerApresInscription).
  function lienInscriptionEssai() {
    var sp = new URLSearchParams(location.search);
    sp.set(RETOUR_PARAM, "1");
    var retour = location.pathname + "?" + sp.toString();
    if (retour.charAt(0) !== "/" || retour.charAt(1) === "/") retour = lienLocal("index.html?" + RETOUR_PARAM + "=1");
    return lienLocal("inscription.html?next=" + encodeURIComponent(retour));
  }

  // Composant de consentement partage (charge a la demande, comme lib/offre-pro.js).
  function chargerConsentement() {
    return new Promise(function (ok) {
      if (window.IasharkCheckoutConsent) return ok(window.IasharkCheckoutConsent);
      var s = document.createElement("script");
      s.src = "/lib/checkout-consent.js";
      s.onload = function () { ok(window.IasharkCheckoutConsent || null); };
      s.onerror = function () { ok(null); };
      document.head.appendChild(s);
    });
  }

  // Meme corps que lib/offre-pro.js#corpsPaiement (formule au mois).
  function corpsPaiement(consent) {
    var M = window.IASHARK_MARKET, I = window.I18N;
    var body = { interval: "month" };
    var dir = M && typeof M.dir === "string" ? M.dir : (I && typeof I.dir === "string" ? I.dir : "");
    if (dir) body.dir = dir;
    if (M && M.checkoutMarket && M.checkoutMarket !== "fr") body.market = M.checkoutMarket;
    body.consent = consent;
    return body;
  }
  // Ouvre la session Stripe ; resout l'URL Stripe, ou null en cas d'echec.
  function ouvrirStripe(consent) {
    return session().then(function (s) {
      if (!s) return null;
      return fetch(SUPA_URL + "/functions/v1/create-checkout-session", {
        method: "POST",
        headers: { apikey: SUPA_KEY, Authorization: "Bearer " + s.token, "Content-Type": "application/json" },
        body: JSON.stringify(corpsPaiement(consent))
      }).then(function (r) { return r.json(); }).then(function (d) {
        return d && typeof d.url === "string" && /^https:\/\/(?:[a-z0-9-]+\.)*stripe\.com\//.test(d.url) ? d.url : null;
      });
    }).catch(function () { return null; });
  }
  function partirVersStripe(url) {
    try { if (window.iasharkTrack) window.iasharkTrack("checkout_started", { interval: "month", contexte: "essai_fenetre" }); } catch (e) {}
    location.href = url;
  }

  // Retour d'inscription (?ia_essai=1) : paiement lance sans autre clic, avec
  // le consentement donne dans la fenetre juste avant (30 min au plus).
  function lancerApresInscription() {
    var sp = new URLSearchParams(location.search);
    if (sp.get(RETOUR_PARAM) !== "1") return false;
    sp.delete(RETOUR_PARAM);
    var propre = location.pathname + (sp.toString() ? "?" + sp.toString() : "") + location.hash;
    try { history.replaceState(history.state, "", propre); } catch (e) {}
    var garde = null;
    try { garde = JSON.parse(sessionStorage.getItem(CONSENT_KEY) || "null"); sessionStorage.removeItem(CONSENT_KEY); } catch (e) {}
    if (!garde || !garde.consent || !(Date.now() - garde.at < 30 * 60 * 1000)) return false;
    var ecran = document.createElement("div");
    ecran.className = "ia-essai-go";
    ecran.setAttribute("role", "status");
    ecran.textContent = t("essai_fenetre.opening");
    document.body.appendChild(ecran);
    var repli = function () { location.href = lienLocal("abonnement.html?duree=month&etape=compte"); };
    ouvrirStripe(garde.consent).then(function (url) { if (url) partirVersStripe(url); else repli(); }, repli);
    return true;
  }

  // Match offert ouvert (match-page.js) : {home, away}, ou null apres 10 s.
  function attendreMatchOffert() {
    return new Promise(function (ok) {
      if (window.__iasharkMatchOffertOuvert) return ok(window.__iasharkMatchOffertOuvert);
      var fini = false;
      var fin = function (v) { if (!fini) { fini = true; ok(v); } };
      document.addEventListener("iashark:match-offert-ouvert", function (e) { fin(e && e.detail || window.__iasharkMatchOffertOuvert || {}); });
      setTimeout(function () { fin(null); }, 10000);
    });
  }

  // joursOffre : jours restants de l'offre de 5 jours (compte gratuit), null sinon.
  function ouvrirFenetre(jours, visiteur, match, joursOffre) {
    if (typeof HTMLDialogElement === "undefined") return;
    var prix = prixMois();
    var d = document.createElement("dialog");
    d.className = "ia-essai";
    d.setAttribute("aria-labelledby", "iaEssaiTitre");
    d.setAttribute("aria-describedby", "iaEssaiTexte");
    var semaine = Number(jours) === 7;
    var titre = visiteur ? t(semaine ? "essai_fenetre.title_visiteur" : "essai_fenetre.title_visiteur_n", { n: jours }) : t("essai_fenetre.title");
    var texte = visiteur ? t("essai_fenetre.text_visiteur") : t(semaine ? "essai_fenetre.text" : "essai_fenetre.text_n", { n: jours });
    var offre = joursOffre == null ? "" : '<p class="ia-essai-offre">'
      + esc(joursOffre <= 1 ? t("essai_fenetre.offer_last") : t("essai_fenetre.offer_days", { x: joursOffre })) + "</p>";
    var libelle = t(semaine ? "essai_fenetre.cta" : "essai_fenetre.cta_n", { n: jours });
    d.innerHTML = '<div class="ia-essai-panel" tabindex="-1" autofocus>'
      + '<button type="button" class="ia-essai-x" data-ia-fermer aria-label="' + esc(t("essai_fenetre.close")) + '">' + ICONE_X + "</button>"
      + '<span class="ia-essai-marque" aria-hidden="true"></span>'
      + '<h2 class="ia-essai-titre" id="iaEssaiTitre">' + esc(titre) + "</h2>"
      + '<p class="ia-essai-texte" id="iaEssaiTexte">' + esc(texte) + "</p>"
      + offre
      + '<p class="ia-essai-fin">' + esc(prix ? t("essai_fenetre.fine", { price: prix }) : t("essai_fenetre.fine_noprice")) + "</p>"
      + '<div class="ia-essai-consent"></div>'
      + '<div class="ia-essai-actions">'
      + '<button type="button" class="ia-essai-cta" data-track="' + (visiteur ? "essai_fenetre_cta_visiteur" : "essai_fenetre_cta") + '" aria-disabled="true">' + esc(libelle) + ICONE_FLECHE + "</button>"
      + '<p class="ia-essai-msg" role="status" hidden></p>'
      + '<p class="ia-essai-accord">' + accordTexte() + "</p>"
      + '<button type="button" class="ia-essai-later" data-ia-fermer data-track="essai_fenetre_plus_tard">' + esc(t("essai_fenetre.later")) + "</button>"
      + "</div></div>";
    document.body.appendChild(d);
    var fermer = function () { if (d.open) d.close(); };
    d.addEventListener("close", function () { if (d.parentNode) d.parentNode.removeChild(d); });
    Array.prototype.forEach.call(d.querySelectorAll("[data-ia-fermer]"), function (b) { b.addEventListener("click", fermer); });
    // Clic sur le fond (hors du panneau) : ferme aussi.
    d.addEventListener("click", function (e) { if (e.target === d) fermer(); });
    var cta = d.querySelector(".ia-essai-cta"), msg = d.querySelector(".ia-essai-msg");
    var dire = function (texte, err) { msg.textContent = texte || ""; msg.hidden = !texte; msg.className = "ia-essai-msg" + (err ? " is-err" : ""); };
    var consent = null;
    chargerConsentement().then(function (lib) {
      consent = lib ? lib.mount(d.querySelector(".ia-essai-consent"), { buttons: [cta] }) : null;
      // Decision de Clement (31/10) : pas de case a cocher dans la fenetre. L'accord est donne par le clic
      // sur le bouton, avec la phrase visible juste dessous (CGV + debut immediat de l'essai) ; le serveur
      // (consent.ts) recoit toujours terms et waiver.
      var boite = d.querySelector(".ia-essai-consent");
      if (consent && boite) {
        Array.prototype.forEach.call(boite.querySelectorAll('input[type="checkbox"]'), function (c) {
          c.checked = true;
          c.dispatchEvent(new Event("change", { bubbles: true }));
        });
        boite.hidden = true;
        boite.style.display = "none";
      }
    });
    cta.addEventListener("click", function () {
      if (cta.getAttribute("data-busy")) return;
      if (!consent) { dire(t("essai_fenetre.error"), true); return; }
      if (!consent.check()) { dire("", false); return; }
      var accord = consent.payload();
      if (visiteur) {
        try { sessionStorage.setItem(CONSENT_KEY, JSON.stringify({ consent: accord, at: Date.now() })); } catch (e) {}
        location.href = lienInscriptionEssai();
        return;
      }
      cta.setAttribute("data-busy", "1");
      dire(t("essai_fenetre.opening"), false);
      ouvrirStripe(accord).then(function (url) {
        if (url) { partirVersStripe(url); return; }
        cta.removeAttribute("data-busy");
        dire(t("essai_fenetre.error"), true);
      });
    });
    try { d.showModal(); } catch (e) { if (d.parentNode) d.parentNode.removeChild(d); }
  }

  // Phrase d'accord affichee sous le bouton (remplace la case a cocher, decision du 31/10).
  function accordTexte() {
    var l = (document.documentElement.lang || "fr").slice(0, 2);
    var dir = (location.pathname.split("/")[1] || "").replace(/[^a-z]/g, "");
    var cgv = "/" + (["en", "es", "gb", "mx", "za"].indexOf(dir) >= 0 ? dir + "/" : "fr/") + "cgv.html";
    var a = '<a href="' + cgv + '" target="_blank" rel="noopener">';
    if (l === "en") return "By activating, you accept the " + a + "terms of sale</a> and ask for your trial to start right away.";
    if (l === "es") return "Al activar, aceptas las " + a + "condiciones de venta</a> y pides que la prueba empiece ya.";
    return "En activant, tu acceptes les " + a + "conditions de vente</a> et demandes que l\u2019essai commence tout de suite.";
  }

  function peutEtreEssai() {
    if (EXCLUES[pageCourante()]) return;
    var visiteur = false, match = null, offre = null, uid = null;
    session().then(function (s) {
      if (!s) {
        // Sans compte : jamais pour un robot ; ~4 s ou mi-defilement.
        if (estRobot()) return 0;
        visiteur = true;
        uid = "visiteur";
        offre = joursOffreRestants(uid);
        if (!offre) return 0;
        return Promise.all([joursEssai(), attendreVisiteur()]).then(function (r) { return r[0]; });
      }
      uid = s.id;
      offre = joursOffreRestants(uid);
      if (!offre) return 0; // offre de 5 jours finie (ou stockage indisponible)
      return compteGratuitSansHistorique(s).then(function (ok) {
        if (!ok) return 0;
        if (pageCourante() !== "match.html") return joursEssai();
        // Page match : on attend l'analyse du match offert, puis ~4 s.
        return Promise.all([joursEssai(), attendreMatchOffert()]).then(function (r) {
          match = r[1];
          if (!match) return r[0];
          return new Promise(function (ok2) { setTimeout(function () { ok2(r[0]); }, 4000); });
        });
      });
    }).then(function (jours) {
      if (!jours) return;
      if (document.querySelector("dialog[open]")) return; // jamais par-dessus une autre fenetre
      dateroffre(uid);
      ouvrirFenetre(jours, visiteur, match, offre);
    }).catch(function () {});
  }

  function demarrer() {
    // Page quittee par la redirection de langue : la page de langue s'en charge.
    if (window.__iasharkLangRedirecting) return;
    injecterStyle();
    chargerTextes().then(function () {
      poserContact();
      if (window.__iasharkLangRedirecting) return;
      if (lancerApresInscription()) return;
      // Laisse la page se poser avant de proposer l'essai.
      setTimeout(peutEtreEssai, 2000);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
