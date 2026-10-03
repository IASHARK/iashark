/* IASHARK — acces aux pages reservees aux affilies valides (03/10/2026) :
   partenaires-formation.html et partenaires-kit.html.

   Regle : seul un compte connecte ET affilie valide (ou un administrateur)
   voit ces pages. Visiteur non connecte, compte non affilie, affiliation pas
   encore validee, ou toute erreur de lecture : renvoi vers la page Partenaires
   (partenaires.html). On ferme par defaut : jamais d'acces « au cas ou ».

   Donnee lue : la ligne de l'affilie dans public.affiliates, table posee par
   la branche « affiliation » (migration 0050_affiliation.sql : colonnes
   user_id et status = 'pending' | 'approved' | 'refused' | 'suspended' ;
   politique affiliates_select_own : chacun ne lit que SA ligne). Seul
   'approved' (valide par Clement d'un clic) ouvre l'acces. Noms regroupes
   dans CONTRAT : un seul endroit a changer si cette branche les modifie.

   Les textes de ces pages n'ont rien de secret (formation et kit) : ce controle
   reserve l'affichage, il ne protege pas une donnee sensible. */
(function (global) {
  'use strict';

  var CONTRAT = {
    table: 'affiliates',
    colonneUtilisateur: 'user_id',
    colonneStatut: 'status',
    // Seul statut qui ouvre l'acces (en attente, refuse, suspendu : non).
    statutsValides: ['approved']
  };

  function normaliser(s) {
    var v = String(s == null ? '' : s).toLowerCase().trim();
    try { v = v.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    return v;
  }

  // Decision pure (testee) : ctx = IasharkApp.context(), ligne = ligne de la table ou null.
  function decider(ctx, ligne, erreur) {
    if (!ctx || !ctx.session || !ctx.user) return { ok: false, raison: 'non_connecte' };
    if (ctx.isAdmin) return { ok: true, raison: 'admin' };
    if (erreur) return { ok: false, raison: 'erreur' };
    if (!ligne) return { ok: false, raison: 'non_affilie' };
    var statut = normaliser(ligne[CONTRAT.colonneStatut]);
    return CONTRAT.statutsValides.indexOf(statut) !== -1 ? { ok: true, raison: 'affilie_valide' } : { ok: false, raison: 'non_valide' };
  }

  function verifier(app) {
    if (!app || typeof app.context !== 'function') return Promise.resolve(decider(null));
    return Promise.resolve(app.context()).then(function (ctx) {
      if (!ctx || !ctx.session || ctx.isAdmin) return decider(ctx, null, null);
      return Promise.resolve(app.supabase.from(CONTRAT.table).select(CONTRAT.colonneStatut)
        .eq(CONTRAT.colonneUtilisateur, ctx.user.id).maybeSingle())
        .then(function (q) { return decider(ctx, q && q.data, q ? q.error : 'vide'); });
    }).catch(function () { return { ok: false, raison: 'erreur' }; });
  }

  function pagePartenaires() {
    var I = global.I18N;
    return (I && I.href) ? I.href('partenaires.html') : '/partenaires.html';
  }

  var API = { CONTRAT: CONTRAT, decider: decider, verifier: verifier, pagePartenaires: pagePartenaires };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  if (global && global.document) global.IasharkAffilieAcces = API;
})(typeof window !== 'undefined' ? window : this);
