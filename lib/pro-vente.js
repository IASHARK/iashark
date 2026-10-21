/* IASHARK — page Pro pour un visiteur NON abonne (21/10/2026).
   Constat : 36 visites de la page Pro en 5 semaines, 2 abonnes. La page etait un
   « Tool Center » de six outils remplis de lignes fictives « Club A – Club B » : elle
   ne disait pas ce que recoit un parieur. Carte blanche de Clement pour vendre plus.

   Pour un visiteur sans compte ou avec un compte gratuit, pro.html montre maintenant,
   dans l'ordre : la promesse ; ce que recoit un abonne chaque jour ; un lien vers
   l'exemple d'analyse ; comment ca marche ; le prix et le bouton (LE composant de
   paiement unique, lib/offre-pro.js, jamais un prix ecrit ici) ; les questions.
   Un abonne Pro voit ses outils (tools-page.js), sans calculateur de mise ni
   simulateur de capital (regle de Clement : ni mise, ni capital, ni esperance).

   Ce fichier ne fait que brancher la page statique (pro.html, textes data-i18n
   pro_vente.*) :
     - icones Lucide (lib/icones.js) dans les [data-pv-ico] ;
     - INTERRUPTEURS DE VERITE : une ligne « ce que tu recois » n'apparait que si elle
       est vraie EN LIGNE pour CE visiteur, avec les memes regles que le composant de
       paiement (lib/offre-pro.js#avantages) :
         * tickets (petit et grand combine, Selection en or, buteur du jour) :
           OUVERT.tickets de lib/offre-pro.js ET marche francais (cotes d'operateurs
           agrees en France, lib/aujourdhui.js#enLigne) ;
         * marches : version francaise seulement (le panneau Marches n'existe qu'en
           francais) ;
         * telegram : FERME (OUVERT.telegram ci-dessous) ;
       les lignes vraies partout (tous les matchs, film du match, scores les plus
       probables) sont dans le HTML sans condition ;
     - reponse « Ou est-ce que je parie ? » : la phrase ANJ seulement sur le marche
       francais ;
     - question « essai » : affichee SEULEMENT si le composant de paiement affiche un
       essai (meme reponse serveur, lib/offre-pro.js#lireDisponibilite + essaiOuvert),
       avec le meme texte (offre_pro.trial_detail) ;
     - le composant de paiement (mode vitrine) dans #offrePro, et la ligne du gratuit.

   Mots interdits (tests/pro-vente.test.js) : gain, gagner, mise, unite, capital,
   esperance, sur, garanti, offre limitee, derniere chance ; aucun chiffre de resultat. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkProVente = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (G) {
  "use strict";

  // telegram : FERME. Les messages prives du robot a chaque abonne (VIP Telegram,
  // branches telegram-langues / canal-pro) ne sont pas en ligne au 21/10/2026 : seul
  // Clement les recoit en rodage. Passer a true LE JOUR ou chaque abonne Pro lie recoit
  // ses messages ; la ligne est deja ecrite dans les 7 langues (pro_vente.item_telegram_*).
  var OUVERT = { telegram: false };

  var hasOwn = Object.prototype.hasOwnProperty;
  function t(key, fb) { return (G && G.I18N && G.I18N.t) ? G.I18N.t(key, fb) : fb; }
  function tf(key, fb, vars) {
    var s = String(t(key, fb));
    return vars ? s.replace(/\{(\w+)\}/g, function (m, k) { return hasOwn.call(vars, k) && vars[k] != null ? vars[k] : m; }) : s;
  }
  function lien(p) { return (G && G.I18N && G.I18N.href) ? G.I18N.href(p) : "/" + p; }

  // Environnement du visiteur : langue de la page et marche (lib/market-config.js).
  function environnement() {
    var M = G && G.IASHARK_MARKET;
    var OP = G && G.IasharkOffrePro;
    return {
      langueFr: !(G && G.I18N && G.I18N.locale) || G.I18N.locale === "fr",
      marcheFr: !M || !M.code || M.code === "fr",
      tickets: !!(OP && OP.OUVERT && OP.OUVERT.tickets)
    };
  }
  // Fonction pure (testee) : quelles lignes conditionnelles sont vraies pour ce visiteur.
  function conditions(env) {
    env = env || {};
    return {
      tickets: !!(env.tickets && env.marcheFr),
      marches: !!env.langueFr,
      telegram: OUVERT.telegram === true,
      anj: !!env.marcheFr
    };
  }

  function icones(racine) {
    var I = G && G.IasharkIcones;
    if (!I) return;
    racine.querySelectorAll("[data-pv-ico]").forEach(function (el) {
      if (el.firstChild) return;
      el.innerHTML = I.svg(el.getAttribute("data-pv-ico"), "pv-ico-svg");
    });
  }

  function appliquerConditions(racine, c) {
    racine.querySelectorAll("[data-pv-si]").forEach(function (el) {
      el.hidden = !c[el.getAttribute("data-pv-si")];
    });
  }

  // Question « essai » : seulement si le composant affiche un essai (meme reponse
  // serveur, promesse partagee : un seul appel par page).
  function essai(racine, market) {
    var OP = G && G.IasharkOffrePro;
    var bloc = racine.querySelector("[data-pv-essai]");
    if (!OP || !bloc || typeof OP.lireDisponibilite !== "function") return;
    OP.lireDisponibilite(market).then(function (dispo) {
      var jours = OP.essaiOuvert(dispo);
      var mois = OP.plans(market, dispo).filter(function (p) { return p.interval === "month"; })[0];
      if (!jours || !mois) return;
      var rep = bloc.querySelector("[data-pv-essai-texte]");
      if (rep) rep.textContent = tf("offre_pro.trial_detail", "{n} jours d’essai pour un premier abonnement au mois : ta carte est demandée, rien n’est prélevé pendant l’essai. Ensuite {price} par mois, prélevés automatiquement sauf résiliation avant la fin de l’essai.", { n: jours, price: mois.text });
      bloc.hidden = false;
    }, function () {});
  }

  // Un seul mouvement signe : la fiche « tous les matchs ouverts » se trace a son
  // entree a l'ecran. Visible par defaut (sans JS, rien ne manque) ; coupe si le
  // visiteur demande moins de mouvement.
  function animerFiche(racine) {
    var fiche = racine.querySelector("[data-pv-fiche]");
    if (!fiche || !("IntersectionObserver" in G)) return;
    if (G.matchMedia && G.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var r = fiche.getBoundingClientRect();
    if (r.top < (G.innerHeight || 0) * 0.85) return; // deja a l'ecran : pas de rejeu
    fiche.classList.add("pv-fiche--attente");
    var io = new G.IntersectionObserver(function (entrees) {
      entrees.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.disconnect();
        G.requestAnimationFrame(function () { fiche.classList.add("pv-fiche--vue"); });
      });
    }, { rootMargin: "0px 0px -15% 0px" });
    io.observe(fiche);
  }

  // racine : #proVente. opts : { connecte }
  function mount(racine, opts) {
    if (!racine) return null;
    opts = opts || {};
    var market = opts.market || (G && G.IASHARK_MARKET);
    var c = conditions(environnement());
    icones(racine);
    appliquerConditions(racine, c);
    essai(racine, market);
    animerFiche(racine);

    var gratuit = racine.querySelector("#pvGratuit");
    if (gratuit) {
      if (opts.connecte) gratuit.hidden = true;
      else if (c.tickets) gratuit.textContent = t("offre_pro.free_line_tickets", "Gratuit : le match du jour et le petit combiné, avec un compte.");
    }
    var boite = racine.querySelector("#offrePro");
    var OP = G && G.IasharkOffrePro;
    // Apres le paiement : retour sur les matchs du jour (accueil de la version).
    if (boite && OP) OP.mount(boite, { mode: "vitrine", contexte: "general", next: lien(""), connecte: !!opts.connecte, suivi: "pro_vente_offre", market: market });
    return { conditions: c };
  }

  return { OUVERT: OUVERT, conditions: conditions, environnement: environnement, mount: mount };
});
