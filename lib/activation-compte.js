/* IASHARK — haut de « Mon compte » pour un compte GRATUIT (27/10/2026, chantier
   « apres l'inscription, rien ne mene au paiement » : 0 compte sur 32 a paye).

   Trois choses, dans cet ordre, et rien d'autre :
     1. « Ton match offert d'aujourd'hui : A – B, 18:30 → » : le MEME match que
        l'accueil (lib/free-match.js#pickFreeMatch sur data-home.json, marche du
        visiteur), le MEME lien (match.html?id=, comme index.html#lienMatch).
        Jamais ecrit en dur ; aucun match designe = aucune ligne.
     2. L'offre Pro avec le bouton « Essayer 7 jours : 0 € aujourd'hui » et, juste
        dessous, « Premier prelevement : 14,99 € le <aujourd'hui + 7 jours>,
        seulement si tu ne resilies pas avant. Resiliation en ligne depuis Mon
        compte. ». L'essai n'est annonce que si le SERVEUR l'accorde (reponse
        availability de create-checkout-session : trial_days > 0, mois ouvert) ET
        si le compte n'a jamais eu d'abonnement (trial.ts : une fois par
        personne). Sinon : le prix du mois et un lien vers l'onglet Abonnement.
        Les deux cases obligatoires (lib/checkout-consent.js) restent avant le
        bouton ; le paiement part de account-page.js#facturation (mois).
     3. « Rejoindre le canal Telegram IASHARK : match offert et resultats » : le robot
        @IASHARK_Pro_Bot ne relie que les comptes Pro (fonction telegram-bot,
        action vip-link : 403 « not_pro » pour un compte gratuit, lu le
        27/10/2026) : lien du canal gratuit (prive depuis le 26/10/2026).

   Module PUR pour le rendu (teste par tests/compte-activation.test.js) ; aucun
   appel reseau ici. Ni mise, ni gain, ni pourcentage, ni fausse urgence, aucun
   emoji. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.IasharkActivationCompte = api;
})(typeof window !== "undefined" ? window : (typeof globalThis !== "undefined" ? globalThis : this), function (G) {
  "use strict";

  var CANAL_TELEGRAM = "https://t.me/+qCEr2JFPDDBlZTFk";
  // Le jour ou telegram-bot saura relier un compte gratuit (vip-link ouvert aux
  // comptes gratuits), passer a true : le lien deviendra celui du robot.
  var ROBOT_RELIE_LES_GRATUITS = false;
  var JOUR = 86400000;
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

  // Date du premier prelevement : maintenant + n jours (Stripe : trial_period_days),
  // jour et mois dans la langue et le fuseau du visiteur (« 3 novembre »).
  function datePremierPrelevement(nowMs, jours, locale, timeZone) {
    var n = Number(jours);
    if (!(typeof nowMs === "number" && isFinite(nowMs)) || !(n > 0)) return null;
    var d = new Date(nowMs + Math.round(n) * JOUR);
    var o = { day: "numeric", month: "long" };
    if (timeZone) o.timeZone = timeZone;
    try { return new Intl.DateTimeFormat(locale || "fr-FR", o).format(d); } catch (e) { return d.toISOString().slice(0, 10); }
  }

  // « 0 € », « $0 », « £0 » : zero dans la devise du marche, sans decimales.
  function zero(currency, locale) {
    try { return new Intl.NumberFormat(locale || "fr-FR", { style: "currency", currency: currency || "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(0); }
    catch (e) { return "0"; }
  }

  // Ligne du match offert. m : match de data-home.json ; MT : lib/match-time.js ;
  // horloge : MT.localClock() ({day, tomorrow}). -> { quand, equipes, heure, date } | null
  function infosMatch(m, MT, horloge, locale) {
    if (!m || m.id == null || !m.home || !m.away || !m.home.n || !m.away.n || !MT) return null;
    var jour = MT.matchDay(m);
    var h = horloge || MT.localClock();
    var quand = jour === h.day ? "today" : (jour === h.tomorrow ? "tomorrow" : "later");
    return {
      id: m.id,
      quand: quand,
      equipes: String(m.home.n) + " – " + String(m.away.n),
      heure: MT.formatTime(m, locale) || "",
      date: quand === "later" ? (MT.formatDate(m, locale) || "") : ""
    };
  }

  var LIBELLES_MATCH = {
    today: ["compte_page.activation.free_match_today", "Ton match offert d’aujourd’hui"],
    tomorrow: ["compte_page.activation.free_match_tomorrow", "Ton match offert de demain"],
    later: ["compte_page.activation.free_match_next", "Ton prochain match offert"]
  };

  function htmlMatch(info, href) {
    if (!info || !href) return "";
    var l = LIBELLES_MATCH[info.quand] || LIBELLES_MATCH.later;
    var quand = [info.date, info.heure].filter(Boolean).join(", ");
    return '<a class="acv-match" href="' + esc(href) + '" data-track="account_free_match">'
      + '<span class="acv-match-k">' + esc(t(l[0], l[1])) + t("compte_page.activation.colon", " :") + "</span>"
      + '<span class="acv-match-v"><b>' + esc(info.equipes) + "</b>" + (quand ? '<span class="acv-match-h">, ' + esc(quand) + "</span>" : "") + "</span>"
      + '<span class="acv-match-go" aria-hidden="true">→</span>'
      + '<span class="acv-match-sub">' + esc(t("compte_page.activation.free_match_sub", "L’analyse complète s’ouvre avec ton compte gratuit.")) + "</span>"
      + "</a>";
  }

  // o : { essai: {jours, prixMois, zero, date} | null, prixMois, autres: [{texte}] , avantages: [[icone, texte]], icone: fn }
  function htmlOffre(o) {
    o = o || {};
    var K = G && G.IasharkComposants;
    var ico = typeof o.icone === "function" ? o.icone : function () { return ""; };
    var bouton = function (label, attrs) {
      if (K && K.boutonShimmer) return K.boutonShimmer({ label: label, icone: "arrow-right", cls: "op-cta", attrs: attrs });
      return '<button type="button" class="mu-shimmer op-cta" ' + attrs + '><span data-mu-label>' + esc(label) + "</span></button>";
    };
    var titre = '<div class="op-head"><h2 class="op-title" id="acvOffreT">' + esc(t("offre_pro.title_general", "Passe Pro : tous les matchs du jour, ouverts")) + "</h2></div>";
    var corps;
    if (o.essai) {
      // Le bouton et la date d'abord (vus sans defiler sur un telephone) ; la case
      // obligatoire s'ouvre juste dessous au premier toucher, et le paiement ne
      // part qu'une fois cochee (account-page.js#monterActivation).
      corps = bouton(tf("compte_page.activation.trial_cta", "Essayer {n} jours : {zero} aujourd’hui", { n: o.essai.jours, zero: o.essai.zero }),
          'id="souscrire" data-track="account_trial_cta" data-track-kind="account_trial_cta"')
        + '<p id="msgFacturation" hidden aria-live="polite"></p>'
        + '<p class="acv-charge">' + esc(tf("compte_page.activation.first_charge", "Premier prélèvement : {price} le {date}, puis {price} chaque mois, seulement si tu ne résilies pas avant. Carte demandée ; résiliation en ligne depuis Mon compte.", { price: o.essai.prixMois, date: o.essai.date })) + "</p>"
        + '<div class="op-consent" id="checkoutConsent" hidden></div>';
    } else {
      corps = (o.prixMois ? '<p class="acv-prix">' + esc(tf("compte_page.activation.month_price", "Pro : {price} par mois, sans engagement.", { price: o.prixMois })) + "</p>" : "")
        + (K && K.boutonShimmer
          ? K.boutonShimmer({ href: "#abonnement", label: t("compte_page.activation.pro_cta", "Voir l’offre Pro"), icone: "arrow-right", cls: "op-cta", attrs: 'data-acv-aller="abonnement" data-track="account_pro_cta"' })
          : '<a class="mu-shimmer op-cta" href="#abonnement" data-acv-aller="abonnement" data-track="account_pro_cta"><span data-mu-label>' + esc(t("compte_page.activation.pro_cta", "Voir l’offre Pro")) + "</span></a>");
    }
    var autres = (o.autres || []).filter(Boolean);
    var lienAutres = autres.length
      ? '<a class="op-alt op-alt--start acv-autres" href="#abonnement" data-acv-aller="abonnement">' + esc(tf("compte_page.activation.other_durations", "Autres durées : {list}", { list: autres.join(" " + t("compte_page.activation.list_sep", "ou") + " ") })) + "</a>"
      : "";
    var plus = (o.avantages && o.avantages.length)
      ? '<ul class="op-benefits">' + o.avantages.map(function (a) { return "<li>" + ico(a[0]) + "<span>" + esc(a[1]) + "</span></li>"; }).join("") + "</ul>"
      : "";
    return '<section class="op op--paiement acv-offre" aria-labelledby="acvOffreT">' + titre + corps + lienAutres + plus + "</section>";
  }

  function lienTelegram() { return CANAL_TELEGRAM; }
  function htmlTelegram(langueFr) {
    return '<a class="acv-tg" href="' + esc(lienTelegram()) + '" target="_blank" rel="noopener" data-track="account_telegram">'
      + '<span class="acv-tg-i" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg></span>'
      + "<span>" + esc(t("compte_page.activation.telegram", "Rejoindre le canal Telegram IASHARK : match offert et résultats"))
      + (langueFr ? "" : " " + esc(t("compte_page.activation.telegram_lang", "(en français)"))) + "</span>"
      + '<span class="acv-match-go" aria-hidden="true">→</span></a>';
  }

  // Bloc complet. o : { match: html deja rendu (htmlMatch), offre: html (htmlOffre) ou "" (pas encore connue), langueFr }
  function html(o) {
    o = o || {};
    return '<div class="acv" data-activation>'
      + (o.match || "")
      + '<div data-acv-offre>' + (o.offre || "") + "</div>"
      + htmlTelegram(o.langueFr !== false)
      + "</div>";
  }

  return {
    CANAL_TELEGRAM: CANAL_TELEGRAM,
    ROBOT_RELIE_LES_GRATUITS: ROBOT_RELIE_LES_GRATUITS,
    datePremierPrelevement: datePremierPrelevement,
    zero: zero,
    infosMatch: infosMatch,
    htmlMatch: htmlMatch,
    htmlOffre: htmlOffre,
    htmlTelegram: htmlTelegram,
    lienTelegram: lienTelegram,
    html: html
  };
});
