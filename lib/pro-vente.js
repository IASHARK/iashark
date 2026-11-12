/* IASHARK — page Pro pour un visiteur NON abonne.
   21/10/2026 : la page devient une page de vente (avant, un « Tool Center » de lignes fictives).
   12/11/2026 (Clement : « la raccourcir encore » ; avis ChatGPT, section 3) : au telephone elle
   faisait 6 ecrans et le prix arrivait au 4e. Elle montre maintenant, dans l'ordre :
     1. le titre et une ligne ;
     2. « Pro offert 1 mois » contre une inscription chez Lolly Bet, notre partenaire : la meme
        carte et les memes textes que le cadenas de la page match (match-page.js#carteProOffert) ;
     3. le Pro par abonnement : LE composant de paiement unique (lib/offre-pro.js, mode vitrine),
        jamais un prix ecrit ici ;
     4. deux liens : un exemple d'analyse, l'analyse gratuite du jour.
   Retires : le comparatif gratuit / Pro, le catalogue « ce que tu recois », « Comment ca marche »,
   le bouton intermediaire « Voir l'offre Pro » et les questions.
   Un abonne Pro voit ses outils (tools-page.js).

   Ce fichier ne fait que brancher la page statique (pro.html) : les icones, le logo du partenaire
   dans la carte, les liens de la version (langue, pays) et le composant de paiement.

   Mots interdits (tests/pro-vente.test.js) : gain, gagner, mise, unite, capital, esperance,
   sur, garanti, offre limitee, derniere chance ; aucun chiffre de resultat. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkProVente = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (G) {
  "use strict";

  // Partenaire du « Pro offert » : le meme que match-page.js (BK_NOMS, BK_LOGOS).
  var PARTENAIRE = { nom: "Lolly Bet", logo: "/assets/bk/lolly.svg", w: 62, h: 14 };

  var hasOwn = Object.prototype.hasOwnProperty;
  function t(key, fb) { return (G && G.I18N && G.I18N.t) ? G.I18N.t(key, fb) : fb; }
  function tf(key, fb, vars) {
    var s = String(t(key, fb));
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return hasOwn.call(vars, k) && vars[k] != null ? vars[k] : m; }) : s;
  }
  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function lien(p) { return (G && G.I18N && G.I18N.href) ? G.I18N.href(p) : "/" + p; }

  // Fonction pure (testee) : la ligne de la carte, le logo du partenaire a la place de son nom.
  function ligneOffert() {
    var logo = '<img class="po-logo" src="' + PARTENAIRE.logo + '" alt="' + esc(PARTENAIRE.nom) + '" width="' + PARTENAIRE.w + '" height="' + PARTENAIRE.h + '">';
    var txt = tf("match_page.pro_offert_text", "Inscris-toi chez {book}, notre partenaire, avec notre lien", { book: "@@BK@@" });
    return "<span>" + String(txt).split("@@BK@@").map(esc).join("</span>" + logo + "<span>") + "</span>";
  }

  function icones(racine) {
    var I = G && G.IasharkIcones;
    if (!I) return;
    racine.querySelectorAll("[data-pv-ico]").forEach(function (el) {
      if (el.firstChild) return;
      el.innerHTML = I.svg(el.getAttribute("data-pv-ico"), "pv-ico-svg");
    });
  }

  function carteOffert(racine) {
    var carte = racine.querySelector("[data-pv-offert]");
    if (!carte) return;
    var txt = carte.querySelector("[data-pv-offert-txt]");
    if (txt) txt.innerHTML = ligneOffert();
    var a = carte.querySelector(".po-btn");
    if (a) a.setAttribute("href", lien("lolly.html") + "#pro-offert");
  }

  // racine : #proVente. opts : { connecte }
  function mount(racine, opts) {
    if (!racine) return null;
    opts = opts || {};
    var market = opts.market || (G && G.IASHARK_MARKET);
    icones(racine);
    carteOffert(racine);
    // Dictionnaire charge apres coup (autre langue) : la ligne de la carte dans la bonne langue.
    var I = G && G.I18N;
    if (I && typeof I.init === "function" && !I.dict) Promise.resolve().then(function () { return I.init(); }).then(function () { carteOffert(racine); }, function () {});

    // Lien gratuit : l'inscription ; deja connecte (compte gratuit) : les matchs du jour, ou le
    // match offert est ouvert.
    var gratuit = racine.querySelector("#pvGratuit");
    if (gratuit) gratuit.setAttribute("href", opts.connecte ? lien("") : lien("inscription.html"));

    var boite = racine.querySelector("#offrePro");
    var OP = G && G.IasharkOffrePro;
    // Apres le paiement : retour sur les matchs du jour (accueil de la version).
    if (boite && OP) OP.mount(boite, { mode: "vitrine", contexte: "abonnement", next: lien(""), connecte: !!opts.connecte, suivi: "pro_vente_offre", market: market });
    return { connecte: !!opts.connecte };
  }

  return { PARTENAIRE: PARTENAIRE, ligneOffert: ligneOffert, mount: mount };
});
