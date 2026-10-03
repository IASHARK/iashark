/* IASHARK — defile de videos courtes (UGC) sous la liste des matchs (03/10/2026).

   Ou : tout element [data-ugc-reel] (accueil sous #decisions, pages championnat
   sous « Matchs des 14 prochains jours »). Il reste cache (attribut hidden) tant
   qu'aucune video ne correspond a la langue de la page : liste vide = pas de
   bandeau du tout.

   Source : config/ugc-videos.json (une seule source), recopiee et verifiee par
   scripts/build-ugc-videos.js dans /assets/ugc-videos.json (le dossier config/
   n'est jamais publie).

   Precisions de Clement (03/10/2026) :
   - videos TOUJOURS MUETTES (aucun bouton son), en boucle, lecture automatique ;
   - une rangee de cartes verticales 9:16 qui defile toute seule, en continu et
     a l'infini, en pause au survol ou au toucher ; defilement au doigt possible ;
     pas de defilement automatique si le visiteur a demande moins d'animations ;
   - un bouton juste en dessous (« Voir le match du jour ») ;
   - seules les cartes visibles jouent, les autres sont en pause ;
   - badge « note + avatars » au-dessus du titre SEULEMENT avec de vrais avis :
     avis des abonnes Pro (migration 0052, RPC avis_pro_resume), a partir de 20
     avis reels, moyenne reelle arrondie vers le bas, nombre reel d'inscrits
     arrondi vers le bas (« plus de 40 », puis « des centaines » seulement a
     partir de 200...). Avatars neutres (aucun visage, aucune donnee personnelle).

   REGLE OBLIGATOIRE : chaque video porte une petite mention dans un coin.
   - type « image virtuelle » (avatar cree par IA) : « Image virtuelle » ;
   - type « affilié » : « Collaboration commerciale ».
   Une video sans type connu n'est JAMAIS affichee (ni ici, ni a la publication).
   Rien d'autre comme avertissement (decision de Clement).

   Leger : rien n'est telecharge avant que le bandeau approche de l'ecran (la
   liste JSON) ; une video n'a son adresse (src) qu'au moment ou sa carte est
   visible : aucune video chargee hors ecran. preload="none" + affiche (poster).
   Economie de donnees : affiches seulement. */
(function (global) {
  'use strict';

  var TYPES = { image_virtuelle: 'badge_virtual', affilie: 'badge_affiliate' };
  var LOCALES = ['fr', 'en', 'es', 'es-mx', 'de', 'it', 'pt'];
  var MARCHES = ['fr', 'gb', 'za', 'us', 'mx'];
  var URL_LISTE = '/assets/ugc-videos.json';
  var URL_CSS = '/assets/ugc-reel.css';
  var VITESSE = 28; // pixels par seconde, defilement automatique

  // Badges de secours (dictionnaire indisponible) : le badge ne manque JAMAIS.
  var BADGES = {
    fr: { badge_virtual: 'Image virtuelle', badge_affiliate: 'Collaboration commerciale' },
    en: { badge_virtual: 'Virtual image', badge_affiliate: 'Paid partnership' },
    es: { badge_virtual: 'Imagen virtual', badge_affiliate: 'Colaboración comercial' },
    'es-mx': { badge_virtual: 'Imagen virtual', badge_affiliate: 'Colaboración comercial' },
    de: { badge_virtual: 'Virtuelles Bild', badge_affiliate: 'Bezahlte Partnerschaft' },
    it: { badge_virtual: 'Immagine virtuale', badge_affiliate: 'Collaborazione commerciale' },
    pt: { badge_virtual: 'Imagem virtual', badge_affiliate: 'Parceria comercial' }
  };

  // « Image virtuelle », « image_virtuelle », « affilié », « Affilie »... -> cle unique.
  function normaliserType(t) {
    var s = String(t == null ? '' : t).toLowerCase().trim();
    try { s = s.normalize('NFD').replace(/[̀-ͯ]/g, ''); } catch (e) {}
    s = s.replace(/[\s\-]+/g, '_');
    return Object.prototype.hasOwnProperty.call(TYPES, s) ? s : null;
  }

  // Adresse de fichier acceptee : /assets/ugc/<nom> ou stockage public Supabase du projet.
  var SUPABASE_PUBLIC = 'https://ksvjraqitxouwiabecai.supabase.co/storage/v1/object/public/';
  function adresseOk(u, extensions) {
    var s = String(u || '');
    if (!extensions.test(s.split('?')[0])) return false;
    if (/^\/assets\/ugc\/[A-Za-z0-9._\-\/]+$/.test(s) && s.indexOf('..') === -1) return true;
    return s.indexOf(SUPABASE_PUBLIC) === 0 && s.indexOf('..') === -1 && !/[\s"'<>]/.test(s);
  }
  var EXT_VIDEO = /\.(mp4|webm)$/i;
  var EXT_IMAGE = /\.(jpe?g|webp|png)$/i;

  // Verifie une entree de config/ugc-videos.json. Renvoie {video} ou {erreur}.
  function valider(v) {
    if (!v || typeof v !== 'object') return { erreur: 'entree invalide' };
    var id = String(v.id || '').trim();
    if (!/^[a-z0-9][a-z0-9\-_]{0,63}$/i.test(id)) return { erreur: 'id manquant ou invalide' };
    var type = normaliserType(v.type);
    if (!type) return { erreur: id + ' : type inconnu (« image virtuelle » ou « affilié »)' };
    if (!adresseOk(v.src, EXT_VIDEO)) return { erreur: id + ' : src refusee (' + v.src + ')' };
    if (!adresseOk(v.poster, EXT_IMAGE)) return { erreur: id + ' : poster refuse (' + v.poster + ')' };
    var langue = String(v.langue || '').toLowerCase();
    if (LOCALES.indexOf(langue) === -1) return { erreur: id + ' : langue inconnue (' + v.langue + ')' };
    var pays = Array.isArray(v.pays) ? v.pays.map(function (p) { return String(p).toLowerCase(); }) : [];
    for (var i = 0; i < pays.length; i++) {
      if (MARCHES.indexOf(pays[i]) === -1) return { erreur: id + ' : pays inconnu (' + pays[i] + ')' };
    }
    var auteur = String(v.auteur || '').trim() || 'IASHARK';
    if (auteur.length > 40) return { erreur: id + ' : auteur trop long' };
    if (type === 'affilie' && /^iashark$/i.test(auteur)) return { erreur: id + ' : une video d\'affilie porte le pseudo de l\'affilie' };
    return { video: { id: id, src: v.src, poster: v.poster, langue: langue, pays: pays, auteur: auteur, type: type } };
  }

  // Videos d'une page : meme langue (une video « es » sert aussi /mx/ ; une
  // video « es-mx » seulement /mx/), et pays de la page si la video en limite.
  function pourPage(liste, locale, marche) {
    var loc = String(locale || 'fr').toLowerCase();
    var base = loc.split('-')[0];
    return (Array.isArray(liste) ? liste : []).filter(function (v) {
      if (!v || !normaliserType(v.type)) return false;
      if (v.langue !== loc && v.langue !== base) return false;
      if (v.pays && v.pays.length && v.pays.indexOf(marche) === -1) return false;
      return true;
    });
  }

  function texteBadge(type, locale, dict) {
    var cle = TYPES[normaliserType(type)];
    if (!cle) return null;
    var d = dict && dict.ugc_reel && dict.ugc_reel[cle];
    if (d) return d;
    var b = BADGES[locale] || BADGES[String(locale).split('-')[0]] || BADGES.fr;
    return b[cle];
  }

  // Nombre de copies de la liste pour un defile sans fin : la rangee doit
  // toujours depasser deux largeurs d'ecran (au moins 2 copies).
  function copiesNecessaires(largeurListe, largeurEcran) {
    if (!(largeurListe > 0)) return 2;
    return Math.max(2, Math.ceil((2 * largeurEcran) / largeurListe) + 1);
  }

  // --- badge « note + avatars » : vrais avis seulement.
  var SEUIL_AVIS = 20;
  // Nombre d'inscrits arrondi vers le bas, jamais gonfle :
  // « plus de N » est toujours strictement vrai : 20-100 -> dizaine strictement inferieure
  // (41 -> « plus de 40 », 40 -> « plus de 30 »), 101-199 -> « plus de 100 »,
  // 200-1 000 -> « des centaines », 1 001-1 999 -> « plus de 1 000 », 2 000 et plus -> « des milliers ».
  function libelleInscrits(n) {
    n = Math.floor(Number(n));
    if (!(n >= SEUIL_AVIS)) return null;
    if (n <= 100) return { cle: 'members_more_than', n: Math.floor((n - 1) / 10) * 10 };
    if (n < 200) return { cle: 'members_more_than', n: 100 };
    if (n <= 1000) return { cle: 'members_hundreds' };
    if (n < 2000) return { cle: 'members_more_than', n: 1000 };
    return { cle: 'members_thousands' };
  }
  // Resume serveur -> badge, ou null (moins de 20 avis, donnees incoherentes).
  function badgeAvis(r) {
    if (!r || r.visible !== true) return null;
    var avis = Math.floor(Number(r.avis)), m = Number(r.moyenne), inscrits = Math.floor(Number(r.inscrits));
    if (!(avis >= SEUIL_AVIS) || !(m >= 1 && m <= 5) || !(inscrits >= avis)) return null;
    return { avis: avis, moyenne: Math.floor(m * 10) / 10, inscrits: libelleInscrits(inscrits) };
  }

  var API = { normaliserType: normaliserType, valider: valider, pourPage: pourPage, texteBadge: texteBadge,
    copiesNecessaires: copiesNecessaires, libelleInscrits: libelleInscrits, badgeAvis: badgeAvis, BADGES: BADGES };
  if (typeof module !== 'undefined' && module.exports) { module.exports = API; }
  var doc = global.document;
  if (!doc || global.IasharkUgcReel) return;
  global.IasharkUgcReel = API;

  // ------------------------------------------------------------------ page
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function i18n() { return global.I18N || null; }
  function localePage() {
    var I = i18n();
    if (I && I.locale) return I.locale;
    var l = String(doc.documentElement.getAttribute('lang') || 'fr').toLowerCase();
    return LOCALES.indexOf(l) !== -1 ? l : l.split('-')[0];
  }
  function marchePage() { var I = i18n(); return (I && I.market) || 'fr'; }
  function dictPret() {
    var I = i18n();
    if (!I) return Promise.resolve(null);
    if (I.dict) return Promise.resolve(I.dict);
    return (I.loadDict ? I.loadDict(I.locale) : Promise.resolve(null)).catch(function () { return null; });
  }
  function tr(dict, cle, repli) {
    var v = dict && dict.ugc_reel && dict.ugc_reel[cle];
    return typeof v === 'string' ? v : repli;
  }
  // Bouton sous le bandeau : la liste des matchs de la page si elle existe, sinon l'accueil.
  function lienMatchDuJour() {
    if (doc.getElementById('decisions')) return '#decisions';
    var I = i18n();
    return (I && I.href) ? I.href('index.html') : '/';
  }

  var reduit = false, economie = false;
  try { reduit = global.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  try { economie = !!(global.navigator.connection && global.navigator.connection.saveData); } catch (e) {}
  var lectureAuto = !reduit && !economie;

  // Feuille de style chargee seulement s'il y a des videos ; le bandeau attend
  // qu'elle soit prete (au plus 1,5 s) pour ne jamais s'afficher sans mise en forme.
  function chargerCss() {
    return new Promise(function (ok) {
      var l = doc.querySelector('link[data-ugc-css]');
      if (l) return ok();
      l = doc.createElement('link');
      l.rel = 'stylesheet'; l.href = URL_CSS; l.setAttribute('data-ugc-css', '');
      l.onload = l.onerror = function () { ok(); };
      global.setTimeout(ok, 1500);
      (doc.head || doc.documentElement).appendChild(l);
    });
  }

  function carteHtml(v, locale, dict, copie) {
    var badge = texteBadge(v.type, locale, dict);
    var auteur = v.auteur === 'IASHARK' ? 'IASHARK' : '@' + v.auteur.replace(/^@/, '');
    var label = tr(dict, 'video_label', 'Vidéo de présentation d\'IASHARK') + ' — ' + badge + ' — ' + auteur;
    return '<li class="ugc-card" data-type="' + esc(v.type) + '"' + (copie ? ' aria-hidden="true"' : '') + '>' +
      '<video class="ugc-video" muted playsinline loop preload="none" disablepictureinpicture disableremoteplayback' +
      ' poster="' + esc(v.poster) + '" data-src="' + esc(v.src) + '"' + (copie ? '' : ' aria-label="' + esc(label) + '"') + '></video>' +
      '<span class="ugc-badge">' + esc(badge) + '</span>' +
      '<span class="ugc-author">' + esc(auteur) + '</span>' +
      '</li>';
  }

  function monter(el, videos, locale, dict) {
    var une = videos.map(function (v) { return carteHtml(v, locale, dict, false); }).join('');
    el.innerHTML =
      '<div class="ugc-proof" hidden></div>' +
      '<h2 class="ugc-title">' + esc(tr(dict, 'title', 'IASHARK en vidéo')) + '</h2>' +
      '<div class="ugc-viewport"><ul class="ugc-track" role="list">' + une + '</ul></div>' +
      '<div class="ugc-foot"><a class="ugc-cta" href="' + esc(lienMatchDuJour()) + '">' + esc(tr(dict, 'cta_today', 'Voir le match du jour')) +
      ' <span aria-hidden="true">→</span></a></div>';
    el.classList.add('ugc');
    el.setAttribute('aria-label', tr(dict, 'title', 'IASHARK en vidéo'));
    el.hidden = false;
    var track = el.querySelector('.ugc-track');
    // Copies pour un defile sans fin (cachees aux lecteurs d'ecran).
    var largeurListe = track.scrollWidth;
    var n = copiesNecessaires(largeurListe, global.innerWidth || 400);
    var copies = '';
    for (var i = 1; i < n; i++) copies += videos.map(function (v) { return carteHtml(v, locale, dict, true); }).join('');
    track.insertAdjacentHTML('beforeend', copies);
    brancher(el, track, videos.length);
    afficherAvis(el.querySelector('.ugc-proof'), dict);
  }

  // Badge « note + avatars » : resume public des avis (RPC avis_pro_resume, cle
  // publique de app-client.js). Pas de cle, erreur, ou moins de 20 avis : rien.
  function afficherAvis(box, dict) {
    var app = global.IasharkApp;
    if (!box || !app || !app.url || !app.key) return;
    global.fetch(app.url + '/rest/v1/rpc/avis_pro_resume', {
      method: 'POST', credentials: 'omit',
      headers: { apikey: app.key, Authorization: 'Bearer ' + app.key, 'Content-Type': 'application/json' }, body: '{}'
    }).then(function (r) { return r.ok ? r.json() : null; }).then(function (r) {
      var b = badgeAvis(r);
      if (!b) return;
      var I = i18n();
      var fmt = function (x, o) { return (I && I.formatNumber) ? I.formatNumber(x, o) : String(x); };
      var replis = { members_more_than: 'Rejoins plus de {n} passionnés', members_hundreds: 'Rejoins des centaines de passionnés', members_thousands: 'Rejoins des milliers de passionnés' };
      var avatars = '';
      for (var i = 0; i < 4; i++) avatars += '<span class="ugc-av ugc-av' + i + '" aria-hidden="true"></span>';
      box.innerHTML = '<span class="ugc-avs">' + avatars + '</span>' +
        '<span class="ugc-proof-txt"><span class="ugc-proof-l1"><b class="ugc-star" aria-hidden="true">★</b> <b>' +
        esc(fmt(b.moyenne, { minimumFractionDigits: 1, maximumFractionDigits: 1 })) + '/5</b> · ' +
        esc(tr(dict, 'reviews_count', '{n} avis d’abonnés').split('{n}').join(fmt(b.avis))) + '</span>' +
        '<span class="ugc-proof-l2">' + esc(tr(dict, b.inscrits.cle, replis[b.inscrits.cle]).split('{n}').join(b.inscrits.n != null ? fmt(b.inscrits.n) : '')) + '</span></span>';
      box.hidden = false;
    }).catch(function () {});
  }

  function brancher(el, track, parListe) {
    var cartes = Array.prototype.slice.call(track.querySelectorAll('.ugc-card'));

    // --- lecture : seules les cartes visibles jouent (muettes, en boucle).
    function lire(c) {
      var v = c.querySelector('video');
      if (!v.getAttribute('src')) v.setAttribute('src', v.getAttribute('data-src')); // jamais avant d'etre visible
      v.muted = true;
      var p = v.play(); if (p && p.catch) p.catch(function () {});
    }
    function stop(c) { var v = c.querySelector('video'); if (!v.paused) v.pause(); }
    if (lectureAuto && 'IntersectionObserver' in global) {
      var io = new global.IntersectionObserver(function (entries) {
        entries.forEach(function (e) { if (e.isIntersecting && e.intersectionRatio >= 0.5) lire(e.target); else stop(e.target); });
      }, { threshold: [0, 0.5] });
      cartes.forEach(function (c) { io.observe(c); });
    }
    if (!lectureAuto) { // moins d'animations / economie de donnees : la video part au toucher
      cartes.forEach(function (c) {
        c.querySelector('video').addEventListener('click', function () { var v = c.querySelector('video'); if (v.paused) lire(c); else stop(c); });
      });
    }

    // --- defile continu et sans fin (jamais si moins d'animations demande).
    if (reduit || typeof global.requestAnimationFrame !== 'function') return;
    var largeurListe = function () { return cartes[parListe] ? cartes[parListe].offsetLeft - cartes[0].offsetLeft : track.scrollWidth / 2; };
    var pos = track.scrollLeft, dernier = 0, pause = false, horsEcran = false, reprise = null, ecrit = -1;
    function retenir() { pause = true; if (reprise) { global.clearTimeout(reprise); reprise = null; } }
    function relacher(delai) {
      if (reprise) global.clearTimeout(reprise);
      reprise = global.setTimeout(function () { pause = false; pos = track.scrollLeft; reprise = null; }, delai);
    }
    el.addEventListener('mouseenter', retenir);
    el.addEventListener('mouseleave', function () { relacher(300); });
    track.addEventListener('touchstart', retenir, { passive: true });
    track.addEventListener('touchend', function () { relacher(2500); }, { passive: true });
    track.addEventListener('wheel', function () { retenir(); relacher(2500); }, { passive: true });
    el.addEventListener('focusin', retenir);
    el.addEventListener('focusout', function () { relacher(300); });
    // Defilement a la main (doigt, molette) : on repart de la ou la personne s'est arretee,
    // et on reste dans la zone sans fin (la rangee est faite de copies identiques).
    track.addEventListener('scroll', function () {
      if (Math.abs(track.scrollLeft - ecrit) <= 1) return; // notre propre mouvement
      var L = largeurListe();
      if (L > 0 && track.scrollLeft >= 2 * L) { track.scrollLeft -= L; }
      pos = track.scrollLeft;
    }, { passive: true });
    if ('IntersectionObserver' in global) {
      new global.IntersectionObserver(function (e) { horsEcran = !e[0].isIntersecting; }).observe(el);
    }
    function pas(t) {
      var dt = dernier ? Math.min(64, t - dernier) : 0;
      dernier = t;
      if (!pause && !horsEcran && !doc.hidden) {
        var L = largeurListe();
        pos += (VITESSE * dt) / 1000;
        if (L > 0 && pos >= L) pos -= L; // la copie suivante est identique : aucun saut visible
        ecrit = Math.round(pos);
        track.scrollLeft = ecrit;
      }
      global.requestAnimationFrame(pas);
    }
    global.requestAnimationFrame(pas);
  }

  function demarrer(el) {
    if (el.__ugc) return;
    el.__ugc = true;
    var locale = localePage(), marche = marchePage();
    Promise.all([
      global.fetch(URL_LISTE, { credentials: 'omit' }).then(function (r) { return r.ok ? r.json() : { videos: [] }; }).catch(function () { return { videos: [] }; }),
      dictPret()
    ]).then(function (res) {
      var videos = pourPage(res[0] && res[0].videos, locale, marche);
      if (!videos.length) { el.hidden = true; return; } // liste vide : pas de bandeau
      return chargerCss().then(function () { monter(el, videos, locale, res[1]); });
    });
  }

  function init() {
    var els = Array.prototype.slice.call(doc.querySelectorAll('[data-ugc-reel]'));
    if (!els.length || typeof global.fetch !== 'function') return;
    if (!('IntersectionObserver' in global)) { els.forEach(demarrer); return; }
    // La liste n'est demandee que quand le bandeau approche de l'ecran. L'emplacement
    // est cache (display:none ne croise jamais l'ecran) : on surveille le bloc juste
    // au-dessus (la liste des matchs).
    var io = new global.IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); demarrer(e.target.__ugcCible); } });
    }, { rootMargin: '600px 0px' });
    els.forEach(function (el) {
      var repere = el.previousElementSibling || el.parentNode;
      if (!repere || repere === doc.body || repere.__ugcCible) { demarrer(el); return; }
      repere.__ugcCible = el;
      io.observe(repere);
    });
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', init); else init();
})(typeof window !== 'undefined' ? window : this);
