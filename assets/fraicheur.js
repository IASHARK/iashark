/* IASHARK — message honnete quand les donnees de matchs sont en retard
 * (audit V3 du 02/10/2026, point I1). Si data-home.json a ete calcule il y a
 * plus de 30 heures (panne du fournisseur de donnees, calcul du matin en
 * echec), un bandeau le dit en haut de la page au lieu de laisser croire que
 * « aucun match » est la realite. Meme requete que la liste de l'accueil
 * (cache:'no-cache' : revalidation, aucun telechargement en plus).
 * Texte : home_app.data_late (7 langues). Seuil : RETARD_HEURES. */
(function () {
  'use strict';
  var RETARD_HEURES = 30;
  function t(cle, defaut) {
    try { var v = window.I18N && window.I18N.t ? window.I18N.t(cle, defaut) : defaut; return v && v !== cle ? v : defaut; } catch (e) { return defaut; }
  }
  function enRetard(genereLe, maintenant) {
    var ms = Date.parse(genereLe);
    if (!isFinite(ms)) return false;
    return (maintenant - ms) > RETARD_HEURES * 3600 * 1000;
  }
  function afficher() {
    if (document.getElementById('iasharkDonneesEnRetard')) return;
    var main = document.querySelector('main') || document.body;
    var div = document.createElement('div');
    div.id = 'iasharkDonneesEnRetard';
    div.setAttribute('role', 'status');
    div.style.cssText = 'margin:12px auto;width:calc(100% - 32px);max-width:1200px;box-sizing:border-box;padding:12px 16px;border:1px solid rgba(250,204,21,.45);border-radius:12px;background:rgba(250,204,21,.08);color:inherit;font-size:14px;line-height:1.5';
    div.textContent = t('home_app.data_late', 'Nos données de matchs sont en retard (panne de notre fournisseur). Les analyses reviennent dès que possible.');
    main.insertBefore(div, main.firstChild);
  }
  function verifier() {
    if (!window.fetch) return;
    fetch('/data-home.json', { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (d && d.generated_at && enRetard(d.generated_at, Date.now())) afficher();
    }).catch(function () {});
  }
  if (typeof module === 'object' && module.exports) { module.exports = { enRetard: enRetard, RETARD_HEURES: RETARD_HEURES }; return; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', verifier); else verifier();
})();
