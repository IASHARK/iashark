/* IASHARK — pages reservees aux affilies valides (03/10/2026) :
   /partenaires-formation.html (formation en 6 modules + plan personnel) et
   /partenaires-kit.html (logos, visuels, accroches a copier, liens, regles).

   Acces : lib/affilie-acces.js (compte connecte + public.affiliates.status =
   'approved', ou administrateur). Sinon : renvoi vers la page Partenaires.
   Rien du contenu n'est affiche avant la reponse (pas de clignotement).

   Textes : dictionnaire partenaires_pages.* (i18n/parts/ugc.<langue>.json),
   7 langues. Aucune promesse de gain, aucune mise, aucun chiffre de resultat.
   Regles rappelees partout : « Collaboration commerciale », 18+, pas de faux
   temoignage, « Image virtuelle » sur un avatar cree par IA. */
(function (global) {
  'use strict';
  var doc = global.document;
  var racine = doc.getElementById('partenaires');
  if (!racine) return;
  var PAGE = racine.getAttribute('data-page') === 'kit' ? 'kit' : 'formation';
  var TELEGRAM = 'https://t.me/iasharkdata';
  var ACCES = global.IasharkAffilieAcces;

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function D() { var I = global.I18N; return (I && I.dict && I.dict.partenaires_pages) || {}; }
  function t(chemin, repli) {
    var v = chemin.split('.').reduce(function (o, k) { return o != null ? o[k] : null; }, D());
    return v != null ? v : (repli != null ? repli : '');
  }
  function lien(p) { var I = global.I18N; return (I && I.href) ? I.href(p) : '/' + p; }
  function siteUrl() {
    var I = global.I18N, dir = I && I.dir;
    return 'https://iashark.com/' + (dir ? dir + '/' : '');
  }

  function onglets() {
    return '<nav class="pt-tabs" aria-label="' + esc(t('back', 'Espace partenaire')) + '">' +
      '<a href="' + esc(lien('partenaires-formation.html')) + '"' + (PAGE === 'formation' ? ' aria-current="page"' : '') + '>' + esc(t('tab_formation', 'Formation')) + '</a>' +
      '<a href="' + esc(lien('partenaires-kit.html')) + '"' + (PAGE === 'kit' ? ' aria-current="page"' : '') + '>' + esc(t('tab_kit', 'Kit')) + '</a></nav>';
  }
  function liste(points, cls) {
    return '<ul class="' + cls + '">' + (points || []).map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
  }

  function formation() {
    var f = t('formation', {});
    var mods = (f.modules || []).map(function (m, i) {
      return '<li class="pt-mod">' +
        '<div class="pt-mod-num" aria-hidden="true">' + (i + 1) + '</div>' +
        '<div class="pt-mod-body">' +
        '<p class="pt-mod-meta">' + esc(String(f.module_label || 'Module {n}').split('{n}').join(String(i + 1))) + ' · ' +
        esc(String(f.minutes || '{n} min').split('{n}').join(m.minutes)) + '</p>' +
        '<h2 class="pt-h2">' + esc(m.title) + '</h2>' +
        '<p class="pt-lead">' + esc(m.intro) + '</p>' + liste(m.points, 'pt-points') +
        '</div></li>';
    }).join('');
    var p = f.plan || {};
    return '<header class="pt-head"><h1 class="pt-h1">' + esc(f.title) + '</h1><p class="pt-intro">' + esc(f.intro) + '</p>' + onglets() + '</header>' +
      '<ol class="pt-mods">' + mods + '</ol>' +
      '<section class="pt-plan" aria-labelledby="ptPlan"><h2 class="pt-h2" id="ptPlan">' + esc(p.title) + '</h2>' +
      '<p class="pt-lead">' + esc(p.intro) + '</p>' + liste(p.points, 'pt-points') +
      '<p class="pt-small">' + esc(p.note) + '</p>' +
      '<a class="pt-btn" href="' + esc(lien('partenaires.html')) + '">' + esc(p.cta) + ' <span aria-hidden="true">→</span></a></section>' +
      '<p class="pt-next"><a href="' + esc(lien('partenaires-kit.html')) + '">' + esc(f.cta_kit) + ' <span aria-hidden="true">→</span></a></p>';
  }

  function telechargement(src, nom, titre, classe) {
    return '<li class="pt-dl ' + (classe || '') + '"><img src="' + esc(src) + '" alt="" loading="lazy" decoding="async">' +
      '<span class="pt-dl-txt">' + esc(titre) + '</span>' +
      '<a class="pt-link" href="' + esc(src) + '" download="' + esc(nom) + '">' + esc(t('kit.download', 'Télécharger')) + '</a></li>';
  }
  function copiable(texte, i) {
    return '<li class="pt-copy"><span class="pt-copy-txt" id="ptc' + i + '">' + esc(texte) + '</span>' +
      '<button type="button" class="pt-copy-btn" data-copy="ptc' + i + '">' + esc(t('kit.copy', 'Copier')) + '</button></li>';
  }
  function kit() {
    var k = t('kit', {});
    var n = 0;
    return '<header class="pt-head"><h1 class="pt-h1">' + esc(k.title) + '</h1><p class="pt-intro">' + esc(k.intro) + '</p>' + onglets() + '</header>' +
      '<section class="pt-sec"><h2 class="pt-h2">' + esc(k.logos_title) + '</h2><p class="pt-lead">' + esc(k.logos_text) + '</p><ul class="pt-dls">' +
      telechargement('/assets/iashark-logo.png', 'iashark-logo.png', k.logo_png, 'is-logo') +
      telechargement('/assets/iashark-logo.webp', 'iashark-logo.webp', k.logo_webp, 'is-logo') +
      telechargement('/assets/iashark-logo-master.png', 'iashark-logo-hd.png', k.logo_master, 'is-logo') + '</ul></section>' +
      '<section class="pt-sec"><h2 class="pt-h2">' + esc(k.visuals_title) + '</h2><p class="pt-lead">' + esc(k.visuals_text) + '</p><ul class="pt-dls">' +
      telechargement('/assets/hero/stade-nuit-portrait.webp', 'iashark-stade-vertical.webp', k.visual_portrait, 'is-portrait') +
      telechargement('/assets/hero/stade-nuit.webp', 'iashark-stade-horizontal.webp', k.visual_landscape, 'is-landscape') + '</ul></section>' +
      '<section class="pt-sec"><h2 class="pt-h2">' + esc(k.hooks_title) + '</h2><p class="pt-lead">' + esc(k.hooks_text) + '</p>' +
      '<ul class="pt-copies">' + (k.hooks || []).map(function (h) { return copiable(h, n++); }).join('') + '</ul>' +
      '<p class="pt-label">' + esc(k.caption_suffix_label) + '</p><ul class="pt-copies">' + copiable(k.caption_suffix, n++) + '</ul></section>' +
      '<section class="pt-sec"><h2 class="pt-h2">' + esc(k.links_title) + '</h2><ul class="pt-copies">' +
      '<li class="pt-copy"><span class="pt-copy-txt"><b>' + esc(k.link_telegram) + '</b><br><span id="ptc' + n + '">' + esc(TELEGRAM) + '</span></span>' +
      '<button type="button" class="pt-copy-btn" data-copy="ptc' + (n++) + '">' + esc(k.copy) + '</button></li>' +
      '<li class="pt-copy"><span class="pt-copy-txt"><b>' + esc(k.link_site) + '</b><br><span id="ptc' + n + '">' + esc(siteUrl()) + '</span></span>' +
      '<button type="button" class="pt-copy-btn" data-copy="ptc' + (n++) + '">' + esc(k.copy) + '</button></li></ul>' +
      '<p class="pt-small">' + esc(k.link_personal) + '</p>' +
      '<a class="pt-btn" href="' + esc(lien('partenaires.html')) + '">' + esc(t('formation.plan.cta', 'Ouvrir mon espace partenaire')) + ' <span aria-hidden="true">→</span></a></section>' +
      '<section class="pt-sec pt-rules"><h2 class="pt-h2">' + esc(k.rules_title) + '</h2>' + liste(k.rules, 'pt-points') + '</section>' +
      '<p class="pt-next"><a href="' + esc(lien('partenaires-formation.html')) + '">' + esc(k.cta_formation) + ' <span aria-hidden="true">→</span></a></p>';
  }

  function copier(texte) {
    if (global.navigator.clipboard && global.navigator.clipboard.writeText) return global.navigator.clipboard.writeText(texte);
    return new Promise(function (ok, ko) {
      var ta = doc.createElement('textarea'); ta.value = texte; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      try { doc.execCommand('copy') ? ok() : ko(); } catch (e) { ko(e); } finally { doc.body.removeChild(ta); }
    });
  }
  function brancherCopie() {
    racine.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-copy]');
      if (!b) return;
      var cible = doc.getElementById(b.getAttribute('data-copy'));
      copier(cible ? cible.textContent : '').then(function () {
        b.textContent = t('kit.copied', 'Copié'); b.classList.add('is-done');
        global.setTimeout(function () { b.textContent = t('kit.copy', 'Copier'); b.classList.remove('is-done'); }, 1800);
      }).catch(function () {});
    });
  }

  function refuser() {
    racine.innerHTML = '<p class="pt-wait">' + esc(t('redirecting', 'Cet espace est réservé aux partenaires validés. Redirection vers la page Partenaires…')) + '</p>';
    global.location.replace(ACCES ? ACCES.pagePartenaires() : '/partenaires.html');
  }

  function demarrer() {
    var I = global.I18N;
    var pret = (I && I.init) ? I.init() : Promise.resolve();
    var app = global.IasharkApp;
    Promise.all([pret, ACCES ? ACCES.verifier(app) : Promise.resolve({ ok: false })]).then(function (res) {
      if (!res[1] || !res[1].ok) return refuser();
      var titre = t(PAGE + '.meta_title', '');
      if (titre) doc.title = titre;
      racine.innerHTML = PAGE === 'kit' ? kit() : formation();
      racine.setAttribute('aria-busy', 'false');
      if (PAGE === 'kit') brancherCopie();
    }).catch(refuser);
  }
  // app-client.js (session) est charge en defer : on attend la fin du chargement.
  if (doc.readyState === 'complete') demarrer(); else global.addEventListener('load', demarrer);
})(typeof window !== 'undefined' ? window : this);
