/* IASHARK — icones du site : jeu d'icones LUCIDE (https://lucide.dev), repris
   TELS QUELS depuis lucide-static v1.51.0 (https://unpkg.com/lucide-static@1.51.0/icons/),
   contenu SVG exact, aucun trace a la main. Licence ISC :
   Copyright (c) 2026 Lucide Icons and Contributors — permission is hereby granted
   to use, copy, modify, and/or distribute this software for any purpose with or
   without fee, provided that the above copyright notice and this permission
   notice appear in all copies (texte complet : assets/vendor/LICENCES.txt).
   Usage : IasharkIcones.svg("lock", "classe") -> <svg class="lucide lucide-lock classe">.
   Attributs d'origine : viewBox 0 0 24 24, fill none, stroke currentColor,
   stroke-width 2, stroke-linecap / stroke-linejoin round. */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkIcones = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function () {
  "use strict";
  var ICONES = {
    "arrow-right": "<path d=\"M5 12h14\"/> <path d=\"m12 5 7 7-7 7\"/>",
    "arrow-up": "<path d=\"m5 12 7-7 7 7\"/> <path d=\"M12 19V5\"/>",
    "award": "<path d=\"m15.477 12.89 1.515 8.526a.5.5 0 0 1-.81.47l-3.58-2.687a1 1 0 0 0-1.197 0l-3.586 2.686a.5.5 0 0 1-.81-.469l1.514-8.526\"/> <circle cx=\"12\" cy=\"8\" r=\"6\"/>",
    "calendar-days": "<path d=\"M8 2v3\"/> <path d=\"M16 2v3\"/> <rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/> <path d=\"M3 9h18\"/> <path d=\"M8 13h.01\"/> <path d=\"M12 13h.01\"/> <path d=\"M16 13h.01\"/> <path d=\"M8 17h.01\"/> <path d=\"M12 17h.01\"/> <path d=\"M16 17h.01\"/>",
    "chart-column": "<path d=\"M3 3v16a2 2 0 0 0 2 2h16\"/> <path d=\"M18 17V9\"/> <path d=\"M13 17V5\"/> <path d=\"M8 17v-3\"/>",
    "check": "<path d=\"M20 6 9 17l-5-5\"/>",
    "circle-check": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"m16 9-5.5 5.5L8 12\"/>",
    "circle-help": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3\"/> <path d=\"M12 17h.01\"/>",
    "clapperboard": "<path d=\"m12.296 3.464 3.02 3.956\"/> <path d=\"M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z\"/> <path d=\"M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/> <path d=\"m6.18 5.276 3.1 3.899\"/>",
    "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <path d=\"M12 6v6l4 2\"/>",
    "copy": "<rect width=\"14\" height=\"14\" x=\"8\" y=\"8\" rx=\"2\" ry=\"2\"/> <path d=\"M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2\"/>",
    "credit-card": "<rect width=\"20\" height=\"14\" x=\"2\" y=\"5\" rx=\"2\"/> <line x1=\"2\" x2=\"22\" y1=\"10\" y2=\"10\"/> <path d=\"M6 14h2\"/>",
    "flag": "<path d=\"M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528\"/>",
    "goal": "<path d=\"M12 13V2l8 4-8 4\"/> <path d=\"M20.561 10.222a9 9 0 1 1-12.55-5.29\"/> <path d=\"M8.002 9.997a5 5 0 1 0 8.9 2.02\"/>",
    "history": "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/> <path d=\"M3 3v5h5\"/> <path d=\"M12 7v5l4 2\"/>",
    "list-checks": "<path d=\"M13 5h8\"/> <path d=\"M13 12h8\"/> <path d=\"M13 19h8\"/> <path d=\"m3 17 2 2 4-4\"/> <path d=\"m3 7 2 2 4-4\"/>",
    "lock": "<rect width=\"18\" height=\"11\" x=\"3\" y=\"11\" rx=\"2\" ry=\"2\"/> <path d=\"M7 11V7a5 5 0 0 1 10 0v4\"/>",
    "minus": "<path d=\"M5 12h14\"/>",
    "radar": "<path d=\"M19.07 4.93A10 10 0 0 0 6.99 3.34\"/> <path d=\"M4 6h.01\"/> <path d=\"M2.29 9.62A10 10 0 1 0 21.31 8.35\"/> <path d=\"M16.24 7.76A6 6 0 1 0 8.23 16.67\"/> <path d=\"M12 18h.01\"/> <path d=\"M17.99 11.66A6 6 0 0 1 15.77 16.67\"/> <circle cx=\"12\" cy=\"12\" r=\"2\"/> <path d=\"m13.41 10.59 5.66-5.66\"/>",
    "repeat": "<path d=\"m17 2 4 4-4 4\"/> <path d=\"M3 11v-1a4 4 0 0 1 4-4h14\"/> <path d=\"m7 22-4-4 4-4\"/> <path d=\"M21 13v1a4 4 0 0 1-4 4H3\"/>",
    "rotate-ccw": "<path d=\"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8\"/> <path d=\"M3 3v5h5\"/>",
    "search": "<path d=\"m21 21-4.34-4.34\"/> <circle cx=\"11\" cy=\"11\" r=\"8\"/>",
    "shield-check": "<path d=\"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z\"/> <path d=\"m9 12 2 2 4-4\"/>",
    "sliders-horizontal": "<path d=\"M10 5H3\"/> <path d=\"M12 19H3\"/> <path d=\"M14 3v4\"/> <path d=\"M16 17v4\"/> <path d=\"M21 12h-9\"/> <path d=\"M21 19h-5\"/> <path d=\"M21 5h-7\"/> <path d=\"M8 10v4\"/> <path d=\"M8 12H3\"/>",
    "target": "<circle cx=\"12\" cy=\"12\" r=\"10\"/> <circle cx=\"12\" cy=\"12\" r=\"6\"/> <circle cx=\"12\" cy=\"12\" r=\"2\"/>",
    "ticket": "<path d=\"M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z\"/> <path d=\"M13 5v2\"/> <path d=\"M13 17v2\"/> <path d=\"M13 11v2\"/>",
    "trending-down": "<path d=\"M16 17h6v-6\"/> <path d=\"m22 17-8.5-8.5-5 5L2 7\"/>",
    "trending-up": "<path d=\"M16 7h6v6\"/> <path d=\"m22 7-8.5 8.5-5-5L2 17\"/>",
    "user-round": "<circle cx=\"12\" cy=\"8\" r=\"5\"/> <path d=\"M20 21a8 8 0 0 0-16 0\"/>",
    "users": "<path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/> <path d=\"M16 3.128a4 4 0 0 1 0 7.744\"/> <path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/> <circle cx=\"9\" cy=\"7\" r=\"4\"/>",
    "x": "<path d=\"M18 6 6 18\"/> <path d=\"m6 6 12 12\"/>"
  };
  function svg(nom, cls) {
    if (!Object.prototype.hasOwnProperty.call(ICONES, nom)) return "";
    return '<svg class="lucide lucide-' + nom + (cls ? " " + cls : "") + '" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + ICONES[nom] + "</svg>";
  }
  return { svg: svg, noms: Object.keys(ICONES), VERSION: "lucide-static 1.51.0" };
});
