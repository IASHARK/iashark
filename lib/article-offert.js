/* Bloc « Match offert aujourd'hui » des articles et guides (02/11/2026, demande de Clement).
   Constat Search Console + funnel_events (30 jours) : depuis Google, les accueils font 95 visites et
   20 inscrits, les articles 42 visites et 1 inscrit. Le bloc, juste sous le titre, mene au match offert du
   jour : la meme source que l'accueil (lib/free-match.js#offertDuJour, jamais ecrit en dur). Sans match
   offert ce jour : rien. Suivi : clic « cta » libelle article_free_match (funnel-track.js).
   Charge par bottom-navigation.js sur les seules pages d'article. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.IasharkArticleOffert = api;
})(typeof window !== "undefined" ? window : this, function (G) {
  "use strict";
  var TEXTES = {
    fr: ["Match offert aujourd’hui", "Le pari, sa cote et l’analyse complète, gratuits avec un compte.", "Voir le match offert"],
    en: ["Free match today", "The pick, its odds and the full analysis, free with an account.", "See the free match"],
    es: ["Partido gratis de hoy", "La apuesta, su cuota y el análisis completo, gratis con una cuenta.", "Ver el partido gratis"],
    mx: ["Partido gratis de hoy", "La apuesta, su momio y el análisis completo, gratis con una cuenta.", "Ver el partido gratis"]
  };
  // Version du site d'apres l'adresse : /blog/… est la version francaise.
  function version(chemin) {
    var m = /^\/(fr|en|gb|za|es|mx)\//.exec(String(chemin || ""));
    return m ? m[1] : "fr";
  }
  function marche(v) { return v === "en" ? "us" : v === "gb" || v === "za" || v === "mx" ? v : "fr"; }
  function langue(v) { return v === "gb" || v === "za" ? "en" : TEXTES[v] ? v : "fr"; }
  function nomEquipe(e) { return e && typeof e === "object" ? e.n : e; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function lienMatch(v, m) { return "/" + v + "/match.html?id=" + encodeURIComponent(m.id); }
  function html(v, m) {
    var x = TEXTES[langue(v)];
    return '<p class="ao-k">' + esc(x[0]) + '</p><p class="ao-m">' + esc(nomEquipe(m.home) + " – " + nomEquipe(m.away)) + '</p><p class="ao-t">' + esc(x[1]) + "</p>"
      + '<a class="ao-b" href="' + esc(lienMatch(v, m)) + '" data-track="article_free_match">' + esc(x[2]) + ' <span aria-hidden="true">→</span></a>';
  }
  var CSS = ".ao{box-sizing:border-box;max-width:720px;margin:20px auto 8px;padding:18px 20px;border:1px solid rgba(32,213,239,.4);border-radius:14px;background:#0d1b26;color:#f4f7fb;font-family:inherit}"
    + ".ao p{margin:0}.ao .ao-k{color:#20d5ef;font-size:13px;font-weight:700}.ao .ao-m{margin-top:4px;color:#f4f7fb;font-size:20px;font-weight:800;line-height:1.25}"
    + ".ao .ao-t{margin-top:6px;color:#b6c2cf;font-size:14px;line-height:1.45}"
    + ".ao .ao-b{display:inline-block;margin-top:12px;padding:11px 18px;border-radius:10px;background:#20d5ef;color:#060b12;font-size:15px;font-weight:800;text-decoration:none}"
    + "@media(max-width:760px){.ao{margin:16px 16px 8px}}";
  function poser(v, m) {
    var D = G.document, titre = D.querySelector(".art-hero, .hero");
    if (!titre || !m || D.getElementById("articleOffert")) return false;
    var st = D.createElement("style"); st.textContent = CSS; D.head.appendChild(st);
    var bloc = D.createElement("aside"); bloc.id = "articleOffert"; bloc.className = "ao"; bloc.innerHTML = html(v, m);
    titre.parentNode.insertBefore(bloc, titre.nextSibling);
    // Le bouton de fin d'article mene au meme match.
    var fin = D.querySelector(".cta a.btn");
    if (fin) { fin.href = lienMatch(v, m); fin.setAttribute("data-track", "article_free_match_end"); }
    return true;
  }
  function lancer() {
    var v = version(G.location.pathname), s = G.document.createElement("script");
    s.src = "/lib/free-match.js";
    s.onload = function () {
      G.fetch("/data-home.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        var FM = G.IasharkFreeMatch;
        if (!FM || !FM.offertDuJour || !j || !Array.isArray(j.matchs)) return;
        poser(v, FM.offertDuJour(j.matchs, null, marche(v)));
      }).catch(function () {});
    };
    G.document.head.appendChild(s);
  }
  if (G && G.document && G.location) {
    if (G.document.readyState === "loading") G.document.addEventListener("DOMContentLoaded", lancer); else lancer();
  }
  return { version: version, marche: marche, html: html, lienMatch: lienMatch, poser: poser };
});
