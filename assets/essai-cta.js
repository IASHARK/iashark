/* IASHARK — boutons « Essai gratuit 7 jours » (03/10/2026).
   Chaque lien [data-essai-cta] affiche par defaut « Voir l'offre Pro » (abonnement mensuel). Il devient
   « Essai gratuit {days} jours » SEULEMENT si le serveur confirme l'essai (create-checkout-session,
   mode availability : trial_days > 0) ET si la personne y a droit (visiteur, ou compte jamais abonne) :
   meme regle que la grille de prix (assets/pricing-grid.js#trialFor, #trialEligibility). Un abonne Pro
   ne voit pas ces boutons (data-vente). Aucune autre donnee lue. */
(function (global) {
  'use strict';
  var d = global.document;
  function tr(k, f) { var I = global.I18N; return I && I.t ? I.t(k, f) : f; }
  function poser(jours) {
    Array.prototype.forEach.call(d.querySelectorAll('[data-essai-cta]'), function (a) {
      var l = a.querySelector('[data-essai-label]') || a;
      l.removeAttribute('data-i18n');
      l.textContent = String(tr('accueil_v3.trial_cta', 'Essai gratuit {days} jours')).split('{days}').join(String(jours));
      a.setAttribute('data-essai', String(jours));
    });
  }
  function lancer() {
    if (!d.querySelector('[data-essai-cta]')) return;
    var PG = global.IasharkPricingGrid, App = global.IasharkApp;
    if (!PG || !PG.fetchAvailability || !PG.trialFor) return;
    var contexte = App && App.context ? Promise.resolve().then(function () { return App.context(); }).catch(function () { return null; }) : Promise.resolve(null);
    var langue = global.I18N && global.I18N.init ? Promise.resolve(global.I18N.init()).catch(function () {}) : Promise.resolve();
    Promise.all([PG.fetchAvailability(global.IASHARK_MARKET), contexte, langue]).then(function (r) {
      var jours = r[0] && r[0].trialDays, c = r[1];
      if (!c) return; // session inconnue : rien d'annonce
      var user = c.user || null;
      return (user && PG.trialEligibility ? PG.trialEligibility(App, user) : Promise.resolve(!user)).then(function (ok) {
        var n = PG.trialFor(jours, { known: true, loggedIn: !!user, trialOk: ok === true, isPro: !!c.isPro }, true);
        if (n) poser(n);
      });
    }).catch(function () {});
  }
  if (d.readyState === 'complete') lancer();
  else global.addEventListener('load', lancer);
})(typeof window !== 'undefined' ? window : this);
