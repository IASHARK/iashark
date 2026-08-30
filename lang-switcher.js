"use strict";
// Selecteur de langue partage (racine, non duplique par locale - meme
// patron que funnel-track.js/auth-header.js/site-prefs.js). Monte sur
// toutes les pages coeur du produit, desktop + mobile (meme composant,
// juste redimensionne en CSS).
//
// Le FR "par defaut" est servi a la racine non prefixee (/pro.html), pas
// sous /fr/ (qui existe comme copie symetrique pour le hreflang mais n'est
// pas l'URL canonique reellement en production - voir
// IASHARK_V2_EXECUTION_STATE.md). Le selecteur pointe donc toujours vers
// la racine non prefixee pour FR, et vers /xx/<page> pour les 5 autres
// langues - jamais vers /fr/<page>, pour ne jamais dupliquer une URL FR
// deja vue par l'utilisateur sous une autre forme.
(function () {
  var LOCALES = [
    { code: "fr", name: "Français" },
    { code: "en", name: "English" },
    { code: "es", name: "Español" },
    { code: "de", name: "Deutsch" },
    { code: "it", name: "Italiano" },
    { code: "pt", name: "Português" }
  ];

  function currentLocale() {
    var m = location.pathname.match(/^\/([a-z]{2})\//);
    return m && LOCALES.some(function (l) { return l.code === m[1]; }) ? m[1] : "fr";
  }

  // Chemin "nu" de la page courante, sans prefixe de locale - ex.
  // "/pro.html", "/", "/marches.html".
  function currentSlug() {
    var p = location.pathname.replace(/^\/([a-z]{2})(\/|$)/, "/");
    return p;
  }

  function urlFor(locale, slug) {
    if (locale === "fr") return slug;
    return slug === "/" ? "/" + locale + "/" : "/" + locale + slug;
  }

  function buildMenu(active, slug) {
    return LOCALES.map(function (l) {
      var cls = "lang-switch-item" + (l.code === active ? " active" : "");
      return '<a class="' + cls + '" href="' + urlFor(l.code, slug) + '" data-lang="' + l.code + '">'
        + '<span class="lang-switch-code">' + l.code.toUpperCase() + "</span>"
        + '<span class="lang-switch-name">' + l.name + "</span>"
        + (l.code === active ? '<span class="lang-switch-check">✓</span>' : "")
        + "</a>";
    }).join("");
  }

  function mount(selector) {
    var host = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!host) return;
    var active = currentLocale();
    var slug = currentSlug();

    host.innerHTML =
      '<div class="lang-switch">' +
      '<button type="button" class="lang-switch-btn" id="langSwitchBtn" aria-haspopup="true" aria-expanded="false">' +
      '<span>' + active.toUpperCase() + "</span>" +
      '<svg viewBox="0 0 24 24" width="10" height="10" style="stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="6 9 12 15 18 9"/></svg>' +
      "</button>" +
      '<div class="lang-switch-menu" id="langSwitchMenu">' + buildMenu(active, slug) + "</div>" +
      "</div>";

    var btn = document.getElementById("langSwitchBtn");
    var menu = document.getElementById("langSwitchMenu");
    function closeMenu() {
      menu.classList.remove("open");
      btn.setAttribute("aria-expanded", "false");
    }
    function toggleMenu(ev) {
      ev.stopPropagation();
      var open = menu.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    }
    btn.addEventListener("click", toggleMenu);
    document.addEventListener("click", function (ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) closeMenu();
    });
    menu.querySelectorAll("[data-lang]").forEach(function (a) {
      a.addEventListener("click", function () {
        try { localStorage.setItem("iashark_lang", a.getAttribute("data-lang")); } catch (e) {}
      });
    });
  }

  // Memoire : si l'utilisateur a deja choisi explicitement une langue
  // differente de celle affichee, et que la page courante est une URL non
  // prefixee (donc pas deja un choix explicite de langue via l'URL elle-
  // meme), propose une seule fois par session de bascule vers la langue
  // memorisee - jamais impose, jamais repete a chaque page (sinon on
  // combattrait un visiteur qui navigue volontairement dans une autre
  // langue que sa preference memorisee).
  function applyRememberedChoiceOnce() {
    try {
      var remembered = localStorage.getItem("iashark_lang");
      if (!remembered || remembered === "fr") return;
      if (!LOCALES.some(function (l) { return l.code === remembered; })) return;
      var isUnprefixed = !/^\/[a-z]{2}\//.test(location.pathname);
      if (!isUnprefixed) return;
      if (sessionStorage.getItem("iashark_lang_redirect_done")) return;
      sessionStorage.setItem("iashark_lang_redirect_done", "1");
      location.href = urlFor(remembered, currentSlug());
    } catch (e) {}
  }

  window.IasharkLangSwitcher = { mount: mount, applyRememberedChoiceOnce: applyRememberedChoiceOnce };
})();
