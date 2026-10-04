/* IASHARK — composant de paiement Pro UNIQUE (04/10/2026, demande de Clement :
   « mal forme, deux blocs ; ca devrait etre plus simple : appel a l'action direct
   en haut, quelques phrases sur ce qu'il y a dans le Pro »).

   LE MEME bloc partout : match bloque (juste sous l'en-tete), page abonnement,
   accueil (#acces), compte (onglet Abonnement d'un compte gratuit), deblocage des
   tickets du jour. Dans l'ordre :
     1. une phrase (le titre change selon la page) ;
     2. le choix de duree, tres visible (Semaine / Mois / Annee, vrais boutons
        radio, 44 px minimum), une ligne qui suit la duree choisie ;
     3. UN gros bouton cyan ;
     4. comment se passe le paiement (carte, Stripe, sans engagement, resiliable),
        juste sous le bouton (controle UX du 04/10, tour 2) ;
     5. 3 ou 4 phrases courtes avec icones : ce que donne Pro (pour CE match sur un
        match bloque : seulement ce que Pro y aura vraiment, pro_sections).

   Deux modes :
     - "vitrine" (match bloque, accueil, tickets) : aucun formulaire, le bouton
       est un lien vers la page abonnement avec la duree choisie (?duree=), ou
       directement vers l'inscription pour un visiteur sans compte (retour sur
       l'abonnement, duree gardee) : le chemin le plus court ;
     - "paiement" (abonnement, compte) : cases legales (lib/checkout-consent.js,
       jamais pre-cochees, verifiees aussi par le serveur) puis appel de
       create-checkout-session. Sans compte : bouton « Creer mon compte et
       continuer », jamais grise, aucune case avant l'inscription.

   Prix : lib/market-config.js#proOffer (config/markets.json), jamais ecrits ici.
   Durees payables : configuration (checkoutOpen) PUIS reponse du serveur (mode
   « availability », corps EXACT {"mode":"availability"} pour la France : JAMAIS
   market:'fr', la fonction deployee repond alors « aucune duree »). Une duree
   fermee n'apparait pas ; aucune duree payable : une ligne « paiement pas encore
   ouvert », pas de bouton.

   Mots interdits ici (tests/offre-pro.test.js) : gain, gagner, mise, sur,
   garanti, offre limitee, derniere chance, recommande. Aucune fausse urgence.

   COMPOSANTS (exigence de Clement du 04/10, 5 h 20 : de vrais composants, aucun
   dessin fait main), repris fidelement de leur code source, licences dans
   assets/vendor/LICENCES.txt :
     - choix de duree : HyperUI « Radio Groups » n° 2 (MIT) ;
     - bouton : Magic UI « Shimmer Button » (MIT) ;
     - cadre : Magic UI « Border Beam » (MIT) ;
     - icones : Lucide (ISC), lib/icones.js. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkOffrePro = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (G) {
  "use strict";

  // INTERRUPTEURS DE VERITE : un texte n'est ecrit que s'il est vrai en ligne.
  //  - essai (demande de Clement du 04/10 : « mois 19,95 EUR avec 7 jours d'essai » ; decision
  //    de 16 h : « on le garde et on l'affiche ») : OUVERT. Les CGV le disent (legal/<dir>/
  //    cgv.html, article 6, version 2026-10-04 : 7 jours sur le mois seulement, premier
  //    abonnement, prelevement automatique a la fin de l'essai sauf resiliation ; TERMS_VERSION
  //    de lib/checkout-consent.js). « 7 jours d'essai » ne s'ecrit QUE si le SERVEUR l'accorde
  //    (reponse availability : trial_days > 0 et "month" dans trial_intervals), et seulement
  //    sur la duree Mois. Fonction en ligne lue le 04/10 (create-checkout-session v23, trial.ts) :
  //    7 jours, mois seulement, une fois par personne, carte demandee.
  //  - tickets : FERME (false) tant que la fonction tickets-du-jour et la migration 0050
  //    ne sont pas deployees (controle de l'avocat du diable du 04/10, point 1) ; passer a
  //    true LE JOUR du deploiement. Le bloc « Aujourd'hui » de l'accueil et du compte suit
  //    le meme interrupteur (lib/aujourdhui.js).
  var OUVERT = { essai: true, tickets: false };

  var INTERVALLES = ["week", "month", "year"];
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
  function cheminInterne(p) { return typeof p === "string" && p.charAt(0) === "/" && p.charAt(1) !== "/" && p.indexOf("\\") === -1; }
  // Lien interne qui reste dans le repertoire courant (/gb/, /mx/...), query gardee.
  function lienLocal(p) {
    var i = p.search(/[?#]/), tail = "";
    if (i >= 0) { tail = p.slice(i); p = p.slice(0, i); }
    if (G && G.I18N && typeof G.I18N.href === "function") {
      try { var out = G.I18N.href(p || "index.html"); if (out) return String(out).replace(/\/index\.html$/, "/") + tail; } catch (e) {}
    }
    return "/" + p + tail;
  }
  // ?duree= lu en LISTE BLANCHE (week | month | year), sinon null.
  function dureeValide(v) { return INTERVALLES.indexOf(String(v || "")) !== -1 ? String(v) : null; }

  // Lien vers la page abonnement avec la duree choisie et le retour (?next=).
  function lienAbonnement(duree, next, extra) {
    var q = "duree=" + encodeURIComponent(dureeValide(duree) || "month");
    if (cheminInterne(next)) q += "&next=" + encodeURIComponent(next);
    if (extra) q += "&" + extra;
    return lienLocal("abonnement.html?" + q);
  }
  // Sans compte : inscription d'abord, retour sur l'abonnement (duree gardee,
  // message « il reste a confirmer le paiement »). « J'ai deja un compte » sur la
  // page d'inscription garde le meme retour (auth-pages.js#propagerNext).
  function lienInscription(duree, next) {
    var retour = lienAbonnement(duree, next, "etape=compte");
    return lienLocal("inscription.html?next=" + encodeURIComponent(retour));
  }

  // ---- Offre : durees affichees ------------------------------------------
  // market : IASHARK_MARKET ; dispo : reponse availability ({intervals, trial_days,
  // trial_intervals}) ou null (inconnue : on garde la configuration).
  function plans(market, dispo) {
    var offer = null;
    try { offer = market && typeof market.proOffer === "function" ? market.proOffer() : null; } catch (e) { offer = null; }
    if (!offer || !Array.isArray(offer.intervals)) return [];
    var ouverts = dispo && dispo.intervals && typeof dispo.intervals === "object" ? dispo.intervals : null;
    return offer.intervals.filter(function (it) {
      if (!it || it.amount == null || it.open === false) return false;
      return !(ouverts && ouverts[it.interval] === false);
    });
  }
  // Reponse sans disponibilites (fonction create-checkout-session deployee plus
  // ancienne que le site, sans mode « availability » ; paiement desactive ;
  // erreur reseau ; aucune reponse en 8 s) : MEME regle que lib/pro-plan-picker.js
  // (ordre de deploiement, 19/09/2026) : seul le MENSUEL du marche par defaut
  // (sans champ market) reste payable ; un marche pays, rien.
  function dispoHistorique(market) {
    return { intervals: { week: false, month: !(market && market.checkoutMarket), year: false }, trial_days: 0, trial_intervals: [], historique: true };
  }
  function essaiOuvert(dispo) {
    if (!OUVERT.essai || !dispo) return 0;
    var j = Number(dispo.trial_days);
    var liste = Array.isArray(dispo.trial_intervals) ? dispo.trial_intervals : [];
    return Number.isFinite(j) && j > 0 && liste.indexOf("month") !== -1 ? Math.round(j) : 0;
  }
  function defaut(liste, voulu) {
    var ids = liste.map(function (p) { return p.interval; });
    if (dureeValide(voulu) && ids.indexOf(voulu) !== -1) return voulu;
    if (ids.indexOf("month") !== -1) return "month";
    return ids[0] || null;
  }

  // ---- Textes --------------------------------------------------------------
  var TITRES = {
    match: ["offre_pro.title_match", "Passe Pro pour ouvrir ce match"],
    tickets: ["offre_pro.title_tickets", "Passe Pro pour le ticket x10 et la Sélection en or"],
    general: ["offre_pro.title_general", "Passe Pro : tous les matchs du jour, ouverts"]
  };
  function titre(contexte) { var x = TITRES[contexte] || TITRES.general; return t(x[0], x[1]); }

  var NOMS = { week: ["offre_pro.plan_week", "Semaine"], month: ["offre_pro.plan_month", "Mois"], year: ["offre_pro.plan_year", "Année"] };
  var PAR = { week: ["offre_pro.per_week", "/ semaine"], month: ["offre_pro.per_month", "/ mois"], year: ["offre_pro.per_year", "/ an"] };

  function noteCase(p, jours) {
    if (p.interval === "month" && jours) return tf("offre_pro.trial_badge", "{n} jours d’essai", { n: jours });
    if (p.interval === "year" && p.weeklyEquivalentText) return tf("offre_pro.year_weekly", "soit {price} / semaine", { price: p.weeklyEquivalentText });
    return "";
  }
  function ligneFacture(p) {
    if (!p) return "";
    if (p.interval === "week") return t("offre_pro.billing_week", "Prélevé chaque semaine");
    if (p.interval === "month") {
      return p.weeklyEquivalentText
        ? tf("offre_pro.billing_month", "soit {price} par semaine · prélevé chaque mois", { price: p.weeklyEquivalentText })
        : t("offre_pro.billing_month_plain", "Prélevé chaque mois");
    }
    var s = tf("offre_pro.billing_year", "Prélevé {price} une fois pour 12 mois", { price: p.text });
    if (p.savingsPct) s += " · " + tf("offre_pro.billing_year_savings", "{pct} % de moins que 12 mois au tarif mensuel", { pct: p.savingsPct });
    return s;
  }
  function ligneBouton(p, mode, connecte, jours) {
    if (!p) return "";
    if (mode === "paiement" && !connecte) return t("offre_pro.cta_signup", "Créer mon compte et continuer");
    if (p.interval === "month" && jours) return tf("offre_pro.cta_trial", "Commencer mes {n} jours d’essai", { n: jours });
    if (mode === "paiement") return tf("offre_pro.cta_pay", "Payer {price}", { price: p.text });
    return t("offre_pro.cta_continue_" + p.interval, { week: "Continuer avec la semaine", month: "Continuer avec le mois", year: "Continuer avec l’année" }[p.interval]);
  }
  function lignePaiement(p) {
    var debut = t("offre_pro.pay_card", "Carte bancaire") + " · " + t("offre_pro.pay_stripe", "Paiement sécurisé par Stripe");
    // Annuel : jamais « sans engagement » (CGV art. 6 : 12 mois payes d'avance).
    if (p && p.interval === "year") return debut + " · " + t("offre_pro.pay_year", "12 mois payés en une fois, renouvelés chaque année sauf résiliation avant l’échéance, depuis ton compte");
    return debut + " · " + t("offre_pro.pay_no_commitment", "Sans engagement") + " · " + t("offre_pro.pay_cancel", "Résiliable en ligne à tout moment");
  }

  // ---- Composants (vrais composants de bibliotheques, aucun dessin fait main) --
  // Icones : Lucide (lib/icones.js, ISC). Bouton : Magic UI « Shimmer Button ».
  // Cadre : Magic UI « Border Beam ». Durees : HyperUI « Radio Groups » n° 2.
  // Comportements et CSS : lib/composants.js, assets/composants.css.
  function icone(k, cls) { var I = G && G.IasharkIcones; return I ? I.svg(k, cls || "op-ico") : ""; }
  function C() { return G && G.IasharkComposants; }
  function bouton(o) {
    var K = C();
    if (K) return K.boutonShimmer(o);
    var attrs = o.attrs ? " " + o.attrs : "";
    var cls = "mu-shimmer" + (o.cls ? " " + o.cls : "");
    var lab = '<span data-mu-label>' + esc(o.label) + "</span>";
    return o.href != null ? '<a class="' + cls + '" href="' + esc(o.href) + '"' + attrs + ">" + lab + "</a>" : '<button type="button" class="' + cls + '"' + attrs + ">" + lab + "</button>";
  }

  // Langue et marche du visiteur : le panneau Marches n'existe qu'en francais (libelles du
  // calcul) ; les tickets portent des cotes d'operateurs agrees EN FRANCE (marche fr).
  function langueFr() { return !(G && G.I18N && G.I18N.locale) || G.I18N.locale === "fr"; }
  function marcheFr() { var M = G && G.IASHARK_MARKET; return !M || !M.code || M.code === "fr"; }
  // Ce que donne Pro : 3 ou 4 phrases, chacune vraie aujourd'hui, POUR CE VISITEUR (OUVERT,
  // langue, marche ; controle de l'avocat du diable du 04/10, points 1 et 4) ET, sur un match
  // bloque, POUR CE MATCH (controle UX du 04/10, tour 2 : on ne promet « les scores les plus
  // probables » ou « le film du match » que si Pro les aura vraiment ici). o : { contexte,
  // contenus (pro_sections du match, liste publique), nbMarches }.
  //  - contexte « match » : le pari de ce match, tous les autres matchs, puis jusqu'a deux
  //    contenus que CE match a vraiment (marches, scores, qui ouvre le score, film, buteurs) ;
  //  - ailleurs : ce qui est vrai pour chaque match du jour, et les contenus du moteur v3
  //    annonces avec leur condition (« sur les championnats les mieux mesures »).
  var MAX_AVANTAGES = 4;
  function avantages(o) {
    o = o || {};
    var l;
    if (o.contexte === "match") {
      var c = Array.isArray(o.contenus) ? o.contenus : [];
      var a = function (k) { return c.indexOf(k) !== -1; };
      l = [["chart-column", t("offre_pro.benefit_pick", "Le pari retenu sur ce match, sa chance et pourquoi.")],
        ["calendar-days", t("offre_pro.benefit_every_match", "Tous les autres matchs du jour, ouverts aussi.")]];
      var nb = Number(o.nbMarches);
      var options = [];
      if (a("marches") && langueFr()) options.push(["list-checks", Number.isInteger(nb) && nb > 0 ? tf("offre_pro.benefit_markets_n", "Les {n} marchés de ce match, avec leur chance.", { n: nb }) : t("offre_pro.benefit_markets", "Tous les marchés du match, avec leur chance.")]);
      if (a("sim")) options.push(["repeat", t("offre_pro.benefit_sim", "Les scores les plus probables et le nombre de buts de ce match.")]);
      if (a("et_si")) options.push(["goal", t("offre_pro.benefit_first_whatif", "Qui ouvre le score, et « Et si… ? » : la chance de gagner selon qui marque en premier.")]);
      else if (a("premier")) options.push(["goal", t("offre_pro.benefit_first", "Qui a le plus de chances d’ouvrir le score.")]);
      if (a("film")) options.push(["clapperboard", a("film_modele") ? t("offre_pro.benefit_film_model", "Le film du match, avec la chance d’un but par quart d’heure.") : t("offre_pro.benefit_film_teams", "Le film du match en six quarts d’heure et les deux équipes comparées.")]);
      if (a("joueurs")) options.push(["user-round", t("offre_pro.benefit_scorers", "Les buteurs les plus probables du match.")]);
      return l.concat(options).slice(0, MAX_AVANTAGES);
    }
    l = [["chart-column", t("offre_pro.benefit_all_matches", "Tous les matchs du jour ouverts : le pari retenu, sa chance et pourquoi.")]];
    if (OUVERT.tickets && marcheFr()) l.push(["ticket", t("offre_pro.benefit_tickets", "Les tickets x5 et x10 du jour et la Sélection en or.")]);
    if (langueFr()) l.push(["list-checks", t("offre_pro.benefit_markets", "Tous les marchés du match, avec leur chance.")]);
    l.push(["clapperboard", t("offre_pro.benefit_film_teams", "Le film du match en six quarts d’heure et les deux équipes comparées.")]);
    l.push(["goal", t("offre_pro.benefit_v3", "Sur les championnats les mieux mesurés : les scores les plus probables et qui ouvre le score.")]);
    return l.slice(0, MAX_AVANTAGES);
  }
  // Comment se passe le paiement : une liste courte, chaque point avec son icone.
  function pointsPaiement(p) {
    var l = [["credit-card", t("offre_pro.pay_card", "Carte bancaire")], ["shield-check", t("offre_pro.pay_stripe", "Paiement sécurisé par Stripe")]];
    // Annuel : jamais « sans engagement » (CGV art. 6 : 12 mois payes d'avance).
    if (p && p.interval === "year") l.push(["calendar-days", t("offre_pro.pay_year", "12 mois payés en une fois, renouvelés chaque année sauf résiliation avant l’échéance, depuis ton compte")]);
    else l.push(["circle-check", t("offre_pro.pay_no_commitment", "Sans engagement")], ["rotate-ccw", t("offre_pro.pay_cancel", "Résiliable en ligne à tout moment")]);
    return l;
  }
  function htmlPaiement(p) {
    return pointsPaiement(p).map(function (x) { return "<li>" + icone(x[0], "op-ico op-ico-s") + "<span>" + esc(x[1]) + "</span></li>"; }).join("");
  }

  var seq = 0;
  // Rendu complet (fonction pure, testee). o : { mode, contexte, plans, choisi,
  // jours, connecte, sousTitre (HTML deja echappe), contexteMatch (texte), uid, lienCta,
  // contenus (pro_sections du match bloque), nbMarches }
  function html(o) {
    var uid = o.uid || "op" + (++seq);
    var liste = o.plans || [];
    var p = liste.filter(function (x) { return x.interval === o.choisi; })[0] || null;
    var mois = liste.filter(function (x) { return x.interval === "month"; })[0] || null;
    var ferme = !liste.length;
    var tete = '<div class="op-head">'
      + (o.contexte === "match" || o.contexte === "tickets" ? '<span class="op-lock" aria-hidden="true">' + icone("lock") + "</span>" : "")
      + '<h2 class="op-title" id="' + uid + '-t">' + esc(titre(o.contexte)) + "</h2>"
      + (o.sousTitre ? '<div class="op-sub">' + o.sousTitre + "</div>" : "")
      + (o.contexteMatch ? '<p class="op-from">' + o.contexteMatch + "</p>" : "")
      + "</div>";
    var choix;
    if (ferme) {
      choix = '<p class="op-closed">' + esc(t("offre_pro.closed", "Le paiement n’est pas encore ouvert pour ce pays. Aucun montant ne sera prélevé.")) + "</p>";
    } else {
      // HyperUI « Radio Groups » n° 2 : une ligne par duree, le prix a droite.
      choix = '<fieldset class="hu-radios op-plans"><legend class="op-sr">' + esc(t("offre_pro.legend", "Choisis ta durée")) + "</legend>"
        + liste.map(function (x) {
          var note = noteCase(x, o.jours);
          var on = x.interval === o.choisi;
          return '<label class="hu-radio op-plan' + (on ? " is-on" : "") + '" data-iv="' + x.interval + '">'
            + '<div class="hu-radio-t"><p class="hu-radio-n op-plan-name">' + esc(t(NOMS[x.interval][0], NOMS[x.interval][1])) + "</p>"
            + (note ? '<p class="hu-radio-d op-plan-note' + (x.interval === "month" && o.jours ? " is-trial" : "") + '">' + esc(note) + "</p>" : "") + "</div>"
            + '<p class="hu-radio-p"><b class="op-plan-price">' + esc(x.text) + '</b><small class="op-plan-per">' + esc(t(PAR[x.interval][0], PAR[x.interval][1])) + "</small></p>"
            + '<input type="radio" name="' + uid + '-d" value="' + x.interval + '"' + (on ? " checked" : "") + ">"
            + "</label>";
        }).join("") + "</fieldset>"
        + '<p class="op-billing" data-op-billing>' + esc(ligneFacture(p)) + "</p>";
    }
    var cta = "";
    if (!ferme) {
      var suivi = o.suivi ? 'data-track="' + esc(o.suivi) + '" data-track-kind="' + esc(o.suivi) + '"' : "";
      var lab = ligneBouton(p, o.mode, o.connecte, o.jours);
      cta = o.mode === "paiement"
        ? '<div class="op-consent" id="checkoutConsent"' + (o.connecte ? "" : " hidden") + "></div>"
          // Connecte : bouton verrouille des le rendu, jusqu'aux cases cochees
          // (lib/checkout-consent.js le deverrouille) ; sans compte : jamais grise.
          + bouton({ label: lab, icone: "arrow-right", cls: "op-cta" + (o.connecte ? " iash-consent-locked" : ""), attrs: 'id="subscribeButton"' + (o.connecte ? ' aria-disabled="true"' : "") + (suivi ? " " + suivi : "") })
          + '<p class="op-msg" id="billingMessage" aria-live="polite"></p>'
        : bouton({ href: o.lienCta || "#", label: lab, icone: "arrow-right", cls: "op-cta", attrs: suivi });
    }
    var plus = '<ul class="op-benefits">' + avantages({ contexte: o.contexte, contenus: o.contenus, nbMarches: o.nbMarches }).map(function (a) {
      return "<li>" + icone(a[0]) + "<span>" + esc(a[1]) + "</span></li>";
    }).join("") + "</ul>";
    var paiement = ferme ? "" : '<ul class="op-pay" data-op-pay>' + htmlPaiement(p) + "</ul>"
      // Essai (mois seulement) : ce qui se passe a la fin, sans detour (CGV art. 6).
      + (o.jours && mois ? '<p class="op-trial" data-op-trial' + (p && p.interval === "month" ? "" : " hidden") + ">"
        + esc(tf("offre_pro.trial_detail", "{n} jours d’essai pour un premier abonnement au mois : ta carte est demandée, rien n’est prélevé pendant l’essai. Ensuite {price} par mois, prélevés automatiquement sauf résiliation avant la fin de l’essai.", { n: o.jours, price: mois.text })) + "</p>" : "");
    var K = C();
    return '<section class="op op--' + esc(o.mode || "vitrine") + '" data-op-ctx="' + esc(o.contexte || "general") + '" aria-labelledby="' + uid + '-t">'
      + (K ? K.faisceau({ taille: 110, duree: 8 }) : "")
      // Comment on paie JUSTE SOUS le bouton (controle UX du 04/10, tour 2 : sur ordinateur, en
      // paiement direct, la ligne « Carte · Stripe · sans engagement » passait sous la flottaison).
      + tete + choix + cta + paiement + plus + "</section>";
  }

  // ---- Disponibilites du serveur ------------------------------------------
  // Corps EXACT : {"mode":"availability"} ; market seulement s'il existe
  // (gb/mx/za/us). Jamais market:'fr'. Une reponse par page (promesse gardee).
  var dispoPromesse = null;
  function corpsDisponibilite(market) {
    var body = { mode: "availability" };
    if (market && market.checkoutMarket && market.checkoutMarket !== "fr") body.market = market.checkoutMarket;
    return body;
  }
  function lireDisponibilite(market) {
    if (dispoPromesse) return dispoPromesse;
    var App = G && G.IasharkApp;
    if (!App || !App.url || !App.key || typeof G.fetch !== "function") return Promise.resolve(null);
    var requete = G.fetch(App.url + "/functions/v1/create-checkout-session", {
      method: "POST",
      headers: { apikey: App.key, Authorization: "Bearer " + App.key, "Content-Type": "application/json" },
      body: JSON.stringify(corpsDisponibilite(market))
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (!d || d.mode !== "availability" || !d.intervals || typeof d.intervals !== "object") return null;
      return { intervals: d.intervals, trial_days: d.trial_days, trial_intervals: d.trial_intervals };
    }).catch(function () { return null; });
    var minuteur = null;
    var delai = new Promise(function (ok) { minuteur = setTimeout(function () { ok(null); }, 8000); });
    dispoPromesse = Promise.race([requete, delai]).then(function (x) { clearTimeout(minuteur); return x; });
    return dispoPromesse;
  }

  // ---- Paiement (mode « paiement ») ---------------------------------------
  // Meme appel que l'ancienne page abonnement (create-checkout-session), sans
  // la promo expiree du 25/09. dir : repertoire de retour Stripe ; market :
  // jamais pour la France (checkoutMarket null).
  function corpsPaiement(market, interval) {
    var body = { interval: interval || "month" };
    if (market && typeof market.dir === "string" && market.dir) body.dir = market.dir;
    if (market && market.checkoutMarket && market.checkoutMarket !== "fr") body.market = market.checkoutMarket;
    return body;
  }
  var RETOUR_KEY = "iashark.checkout.return";
  function chargerConsentement() {
    return new Promise(function (ok) {
      if (G.IasharkCheckoutConsent) return ok(G.IasharkCheckoutConsent);
      var s = G.document.createElement("script"); s.src = "/lib/checkout-consent.js";
      s.onload = function () { ok(G.IasharkCheckoutConsent || null); };
      s.onerror = function () { ok(null); };
      G.document.head.appendChild(s);
    });
  }
  function messageServeur(data) {
    var R = {
      market_not_configured: ["pricing_page.checkout_market_not_configured", "Le paiement n’est pas encore ouvert pour ce pays. Aucun montant n’a été prélevé."],
      interval_not_configured: ["pricing_page.checkout_interval_not_configured", "Cette durée n’est pas encore ouverte au paiement. Choisis une autre durée ou reviens bientôt. Aucun montant n’a été prélevé."],
      already_subscribed: ["pricing_page.checkout_already_subscribed", "Tu as déjà un abonnement Pro. Pour changer de durée, passe par ton compte."],
      price_mismatch: ["pricing_page.checkout_price_mismatch", "Le paiement de cette durée est momentanément indisponible. Aucun montant n’a été prélevé."]
    };
    var x = data && data.processed === false && R[data.reason];
    return x ? t(x[0], x[1]) : t("pricing_page.checkout_unavailable", "Le paiement en ligne sera bientôt disponible.");
  }

  // ---- Montage -------------------------------------------------------------
  // el : conteneur. opts : { mode, contexte, next, duree, connecte, sousTitre,
  //   contexteMatch, suivi, onRetour(chemin), contenus, nbMarches }
  function mount(el, opts) {
    if (!el) return null;
    opts = opts || {};
    var market = opts.market || (G && G.IASHARK_MARKET);
    var mode = opts.mode === "paiement" ? "paiement" : "vitrine";
    var etat = { dispo: null, choisi: null, consent: null };
    var uid = "op" + (++seq);

    function cible() {
      return opts.connecte ? lienAbonnement(etat.choisi, opts.next) : lienInscription(etat.choisi, opts.next);
    }
    function rendre() {
      var liste = plans(market, etat.dispo);
      etat.choisi = defaut(liste, etat.choisi || opts.duree);
      var jours = essaiOuvert(etat.dispo);
      el.innerHTML = html({ mode: mode, contexte: opts.contexte, plans: liste, choisi: etat.choisi, jours: jours,
        connecte: !!opts.connecte, sousTitre: opts.sousTitre, contexteMatch: opts.contexteMatch, uid: uid, contenus: opts.contenus, nbMarches: opts.nbMarches,
        lienCta: mode === "vitrine" ? cible() : null, suivi: opts.suivi });
      brancher(liste, jours);
    }
    function maj(liste, jours) {
      var p = liste.filter(function (x) { return x.interval === etat.choisi; })[0];
      el.querySelectorAll(".op-plan").forEach(function (l) { l.classList.toggle("is-on", l.getAttribute("data-iv") === etat.choisi); });
      var b = el.querySelector("[data-op-billing]"); if (b) b.textContent = ligneFacture(p);
      var lab = el.querySelector(".op-cta [data-mu-label]"); if (lab) lab.textContent = ligneBouton(p, mode, !!opts.connecte, jours);
      var pay = el.querySelector("[data-op-pay]"); if (pay) pay.innerHTML = htmlPaiement(p);
      var tr = el.querySelector("[data-op-trial]"); if (tr) tr.hidden = !(p && p.interval === "month");
      var a = el.querySelector("a.op-cta"); if (a) a.setAttribute("href", cible());
    }
    function brancher(liste, jours) {
      el.querySelectorAll('.op-plan input[type="radio"]').forEach(function (r) {
        r.addEventListener("change", function () { if (r.checked) { etat.choisi = r.value; maj(liste, jours); if (opts.onDuree) opts.onDuree(r.value); } });
      });
      if (mode !== "paiement") return;
      var bouton = el.querySelector("#subscribeButton") || el.querySelector(".op-cta");
      var box = el.querySelector(".op-consent");
      var sortie = el.querySelector(".op-msg");
      var message = function (txt, erreur) { if (!sortie) return; sortie.textContent = txt || ""; sortie.className = "op-msg" + (erreur ? " is-error" : ""); };
      if (!bouton) return;
      if (opts.connecte && box) {
        chargerConsentement().then(function (lib) {
          etat.consent = lib ? lib.mount(box, { buttons: [bouton] }) : null;
          if (etat.consent) box.addEventListener("change", function () { if (etat.consent.isValid()) message("", false); });
          if (opts.focusConsent && box.querySelector("input")) { try { box.querySelector("input").focus({ preventScroll: false }); } catch (e) {} }
        });
      }
      bouton.addEventListener("click", function () {
        if (!opts.connecte) { G.location.href = lienInscription(etat.choisi, opts.next); return; }
        payer(bouton, message);
      });
    }
    async function payer(bouton, message) {
      var consent = etat.consent;
      // Jamais de paiement avant de connaitre les durees payables du serveur.
      var connue = etat.dispo || (await lireDisponibilite(market)) || dispoHistorique(market);
      if (!etat.dispo) { etat.dispo = connue; }
      if (!plans(market, etat.dispo).some(function (x) { return x.interval === etat.choisi; })) {
        message(messageServeur({ processed: false, reason: "interval_not_configured" }), true);
        return;
      }
      if (!consent) { message(t("checkout_consent.error_load", "Les conditions de paiement n’ont pas pu être chargées. Rechargez la page."), true); return; }
      if (!consent.check()) { message("", false); return; }
      var App = G.IasharkApp;
      if (!App) { message(t("pricing_page.checkout_error", "Impossible d’ouvrir le paiement pour le moment."), true); return; }
      var ctx = await App.context();
      if (!ctx || !ctx.user) { G.location.href = lienInscription(etat.choisi, opts.next); return; }
      bouton.disabled = true;
      message(t("pricing_page.checkout_opening", "Ouverture du paiement sécurisé…"), false);
      try {
        var s = await App.supabase.auth.getSession();
        var jeton = s.data.session && s.data.session.access_token;
        var body = corpsPaiement(market, etat.choisi);
        body.consent = consent.payload();
        var r = await G.fetch(App.url + "/functions/v1/create-checkout-session", { method: "POST", headers: { apikey: App.key, Authorization: "Bearer " + jeton, "Content-Type": "application/json" }, body: JSON.stringify(body) });
        var data = await r.json();
        if (data && data.url) {
          if (opts.onRetour) opts.onRetour();
          G.location.href = data.url;
          return;
        }
        if (data && data.code === "consent_required") { if (consent.check()) message(data.message || consent.text("error_required"), true); else message("", false); }
        else message(messageServeur(data), true);
      } catch (e) {
        message(t("pricing_page.checkout_error", "Impossible d’ouvrir le paiement pour le moment."), true);
      }
      bouton.disabled = false;
    }

    rendre();
    var apres = function () { lireDisponibilite(market).then(function (d) { etat.dispo = d || dispoHistorique(market); rendre(); }); };
    // Dictionnaire charge avant le rendu definitif (aucun flash en francais).
    if (G.I18N && G.I18N.init && !G.I18N.dict) Promise.resolve().then(function () { return G.I18N.init(); }).then(function () { rendre(); apres(); }, apres);
    else apres();
    return {
      el: el,
      interval: function () { return etat.choisi; },
      rerender: rendre
    };
  }

  return {
    OUVERT: OUVERT,
    mount: mount,
    html: html,
    plans: plans,
    essaiOuvert: essaiOuvert,
    defaut: defaut,
    dureeValide: dureeValide,
    lienAbonnement: lienAbonnement,
    lienInscription: lienInscription,
    corpsDisponibilite: corpsDisponibilite,
    dispoHistorique: dispoHistorique,
    corpsPaiement: corpsPaiement,
    lireDisponibilite: lireDisponibilite,
    ligneFacture: ligneFacture,
    ligneBouton: ligneBouton,
    lignePaiement: lignePaiement,
    pointsPaiement: pointsPaiement,
    bouton: bouton,
    avantages: avantages,
    cheminInterne: cheminInterne,
    RETOUR_KEY: RETOUR_KEY
  };
});
