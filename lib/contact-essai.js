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

   2) Fenetre d'essai : au plus UNE fois par jour (date locale en
      localStorage, try/catch : sans stockage, jamais de fenetre), seulement si
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
      Bouton principal : meme parcours que le bouton d'essai de la page Pro
      (abonnement.html?duree=month, retour sur la page courante). */
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
  var JOUR_KEY = "iashark_essai_fenetre_jour";

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
      title: "Ce soir, tous les paris sont dans le Pro",
      text: "Essaie IASHARK Pro {n} jours gratuitement. Rien n’est prélevé pendant l’essai, tu annules en ligne depuis ton compte.",
      fine: "Carte demandée. Ensuite {price} par mois, sauf résiliation avant la fin de l’essai.",
      fine_noprice: "Carte demandée. Ensuite le prix du mois, sauf résiliation avant la fin de l’essai.",
      cta: "Commencer mon essai",
      later: "Plus tard",
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
  function jourLocal() {
    var d = new Date();
    return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2);
  }
  // null = stockage indisponible (alors jamais de fenetre).
  function dejaVueAujourdhui() {
    try { return localStorage.getItem(JOUR_KEY) === jourLocal(); } catch (e) { return null; }
  }
  function noterVue() {
    try { localStorage.setItem(JOUR_KEY, jourLocal()); return true; } catch (e) { return false; }
  }

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

  function lienEssai() {
    var retour = location.pathname + location.search;
    var q = "duree=month";
    if (retour.charAt(0) === "/" && retour.charAt(1) !== "/") q += "&next=" + encodeURIComponent(retour);
    return lienLocal("abonnement.html?" + q);
  }

  function ouvrirFenetre(jours) {
    if (typeof HTMLDialogElement === "undefined") return;
    if (!noterVue()) return;
    var prix = prixMois();
    var d = document.createElement("dialog");
    d.className = "ia-essai";
    d.setAttribute("aria-labelledby", "iaEssaiTitre");
    d.setAttribute("aria-describedby", "iaEssaiTexte");
    d.innerHTML = '<div class="ia-essai-panel">'
      + '<button type="button" class="ia-essai-x" data-ia-fermer aria-label="' + esc(t("essai_fenetre.close")) + '">' + ICONE_X + "</button>"
      + '<span class="ia-essai-marque" aria-hidden="true"></span>'
      + '<h2 class="ia-essai-titre" id="iaEssaiTitre">' + esc(t("essai_fenetre.title")) + "</h2>"
      + '<p class="ia-essai-texte" id="iaEssaiTexte">' + esc(t("essai_fenetre.text", { n: jours })) + "</p>"
      + '<p class="ia-essai-fin">' + esc(prix ? t("essai_fenetre.fine", { price: prix }) : t("essai_fenetre.fine_noprice")) + "</p>"
      + '<div class="ia-essai-actions">'
      + '<a class="ia-essai-cta" href="' + esc(lienEssai()) + '" data-track="essai_fenetre_cta" autofocus>' + esc(t("essai_fenetre.cta")) + ICONE_FLECHE + "</a>"
      + '<button type="button" class="ia-essai-later" data-ia-fermer data-track="essai_fenetre_plus_tard">' + esc(t("essai_fenetre.later")) + "</button>"
      + "</div></div>";
    document.body.appendChild(d);
    var fermer = function () { if (d.open) d.close(); };
    d.addEventListener("close", function () { if (d.parentNode) d.parentNode.removeChild(d); });
    Array.prototype.forEach.call(d.querySelectorAll("[data-ia-fermer]"), function (b) { b.addEventListener("click", fermer); });
    // Clic sur le fond (hors du panneau) : ferme aussi.
    d.addEventListener("click", function (e) { if (e.target === d) fermer(); });
    try { d.showModal(); } catch (e) { if (d.parentNode) d.parentNode.removeChild(d); }
  }

  function peutEtreEssai() {
    if (EXCLUES[pageCourante()]) return;
    if (dejaVueAujourdhui() !== false) return;
    session().then(function (s) {
      if (!s) return null;
      return compteGratuitSansHistorique(s).then(function (ok) { return ok ? joursEssai() : 0; });
    }).then(function (jours) {
      if (!jours || dejaVueAujourdhui() !== false) return;
      if (document.querySelector("dialog[open]")) return; // jamais par-dessus une autre fenetre
      ouvrirFenetre(jours);
    }).catch(function () {});
  }

  function demarrer() {
    injecterStyle();
    chargerTextes().then(function () {
      poserContact();
      // Laisse la page se poser avant de proposer l'essai.
      setTimeout(peutEtreEssai, 2500);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer);
  else demarrer();
})();
