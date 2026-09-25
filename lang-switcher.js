"use strict";
// Selecteur langue / pays partage (racine, non duplique par repertoire).
// Source unique des options : window.I18N.switcherOptions() (i18n/i18n.js),
// qui couvre les 9 versions du site : Français, English (UK), English (South
// Africa), English (International), Español (México), Español, Deutsch,
// Italiano, Português. Chaque option pointe vers la MEME page dans le
// repertoire cible (/gb/match.html, /mx/compte.html...).
(function () {
  var FALLBACK = [
    { dir: "fr", label: "Français" }, { dir: "gb", label: "English (UK)" },
    { dir: "za", label: "English (South Africa)" }, { dir: "en", label: "English (International)" },
    { dir: "mx", label: "Español (México)" }, { dir: "es", label: "Español" }
  ];
  var SHORT = { fr: "FR", gb: "UK", za: "ZA", en: "EN", mx: "MX", es: "ES", de: "DE", it: "IT", pt: "PT" };

  function currentDir() {
    var m = location.pathname.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)(\/|$)/);
    return m ? m[1] : "fr";
  }

  function options() {
    if (window.I18N && typeof window.I18N.switcherOptions === "function") {
      try { return window.I18N.switcherOptions(); } catch (e) {}
    }
    var active = currentDir();
    var slug = location.pathname.replace(/^\/(fr|en|es|de|it|pt|gb|za|mx)(\/|$)/, "/");
    return FALLBACK.map(function (o) {
      return { dir: o.dir, label: o.label, href: slug === "/" ? "/" + o.dir + "/" : "/" + o.dir + slug, active: o.dir === active };
    });
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function mount(selector) {
    var host = typeof selector === "string" ? document.querySelector(selector) : selector;
    if (!host) return;
    var opts = options();
    var activeOpt = opts.filter(function (o) { return o.active; })[0] || { dir: currentDir() };

    host.innerHTML =
      '<div class="lang-switch">' +
      '<button type="button" class="lang-switch-btn" id="langSwitchBtn" aria-haspopup="true" aria-expanded="false">' +
      "<span>" + (SHORT[activeOpt.dir] || activeOpt.dir.toUpperCase()) + "</span>" +
      '<svg viewBox="0 0 24 24" width="10" height="10" style="stroke:currentColor;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;"><polyline points="6 9 12 15 18 9"/></svg>' +
      "</button>" +
      '<div class="lang-switch-menu" id="langSwitchMenu">' +
      opts.map(function (o) {
        return '<a class="lang-switch-item' + (o.active ? " active" : "") + '" href="' + esc(o.href) + '" data-dir="' + o.dir + '">' +
          '<span class="lang-switch-code">' + (SHORT[o.dir] || o.dir.toUpperCase()) + "</span>" +
          '<span class="lang-switch-name">' + esc(o.label) + "</span>" +
          (o.active ? '<span class="lang-switch-check">✓</span>' : "") + "</a>";
      }).join("") +
      "</div></div>";

    var btn = document.getElementById("langSwitchBtn");
    var menu = document.getElementById("langSwitchMenu");
    function closeMenu() { menu.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); }
    btn.addEventListener("click", function (ev) {
      ev.stopPropagation();
      var open = menu.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.addEventListener("click", function (ev) {
      if (!menu.contains(ev.target) && ev.target !== btn) closeMenu();
    });
    menu.querySelectorAll("[data-dir]").forEach(function (a) {
      a.addEventListener("click", function () {
        var dir = a.getAttribute("data-dir");
        if (window.I18N && typeof window.I18N.rememberChoice === "function") window.I18N.rememberChoice(dir);
      });
    });
  }

  // Pages racine sans prefixe (redirigees vers /fr/ en production) : si le
  // visiteur a deja choisi une autre version, on l'y renvoie une seule fois
  // par session, jamais de maniere repetee.
  function applyRememberedChoiceOnce() {
    try {
      if (/^\/(fr|en|es|de|it|pt|gb|za|mx)(\/|$)/.test(location.pathname)) return;
      var saved = localStorage.getItem("iashark_dir");
      if (!saved || saved === "fr" || !SHORT[saved]) return;
      if (sessionStorage.getItem("iashark_lang_redirect_done")) return;
      sessionStorage.setItem("iashark_lang_redirect_done", "1");
      var target = options().filter(function (o) { return o.dir === saved; })[0];
      if (target) location.href = target.href;
    } catch (e) {}
  }

  window.IasharkLangSwitcher = { mount: mount, applyRememberedChoiceOnce: applyRememberedChoiceOnce };
})();
