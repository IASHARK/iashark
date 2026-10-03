/* IASHARK — demande d'avis aux abonnes Pro (espace Pro, 03/10/2026).

   Une note de 1 a 5 etoiles + une phrase facultative (280 caracteres au plus),
   demandee seulement a un abonne Pro dont l'abonnement est actif depuis au
   moins 7 jours (decide par le SERVEUR : RPC avis_pro_etat / avis_pro_envoyer,
   migration 0052, non appliquee : tant qu'elle ne l'est pas, rien ne s'affiche).
   Deja repondu : rien. « Plus tard » : la demande revient 7 jours apres.
   Ces avis alimentent le badge public « note + avatars » au-dessus du defile de
   videos (assets/ugc-reel.js), seulement a partir de 20 avis reels, sans nom.

   Emplacement : <div data-avis-pro hidden> (pro.html). Textes : avis_pro.* du
   dictionnaire, repli francais ci-dessous. */
(function (global) {
  'use strict';
  var CLE_PLUS_TARD = 'iashark_avis_pro_plus_tard';
  var SEPT_JOURS = 7 * 24 * 3600 * 1000;

  function plusTardActif(maintenant, valeur) {
    var t = Number(valeur);
    return t > 0 && maintenant - t < SEPT_JOURS;
  }
  // Doit-on montrer la demande ? (etat = reponse de avis_pro_etat)
  function aMontrer(ctx, etat, plusTard, maintenant) {
    if (!ctx || !ctx.session || !ctx.isPro) return false;
    if (!etat || etat.eligible !== true || etat.avis) return false;
    return !plusTardActif(maintenant, plusTard);
  }
  var API = { aMontrer: aMontrer, plusTardActif: plusTardActif };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  var doc = global.document;
  if (!doc || global.IasharkAvisPro) return;
  global.IasharkAvisPro = API;

  var REPLI = {
    title: 'Ton avis sur IASHARK',
    intro: 'Tu es abonné depuis plus d’une semaine : quelle note donnes-tu à IASHARK ?',
    star: '{n} sur 5',
    comment_label: 'Une phrase pour expliquer ta note (facultatif)',
    comment_placeholder: 'Ce qui te sert le plus, ce qui manque…',
    privacy: 'Ta note entre dans la moyenne affichée sur le site à partir de 20 avis. Ton nom n’apparaît jamais.',
    send: 'Envoyer ma note',
    later: 'Plus tard',
    pick: 'Choisis une note de 1 à 5.',
    thanks: 'Merci, ta note est enregistrée.',
    error: 'L’envoi n’a pas marché. Réessaie dans un instant.'
  };
  function tr(k) {
    var I = global.I18N, v = I && I.dict && I.dict.avis_pro && I.dict.avis_pro[k];
    return typeof v === 'string' ? v : REPLI[k];
  }
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function lirePlusTard() { try { return global.localStorage.getItem(CLE_PLUS_TARD); } catch (e) { return null; } }
  function poserPlusTard() { try { global.localStorage.setItem(CLE_PLUS_TARD, String(Date.now())); } catch (e) {} }

  function rendre(box, app) {
    if (!doc.querySelector('link[data-avp-css]')) {
      var l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = '/assets/avis-pro.css'; l.setAttribute('data-avp-css', '');
      (doc.head || doc.documentElement).appendChild(l);
    }
    box.classList.add('avp');
    var etoiles = '';
    for (var n = 1; n <= 5; n++) {
      etoiles += '<button type="button" class="avp-star" role="radio" aria-checked="false" data-n="' + n + '" aria-label="' +
        esc(tr('star').split('{n}').join(String(n))) + '">★</button>';
    }
    box.innerHTML =
      '<h2 class="avp-title">' + esc(tr('title')) + '</h2>' +
      '<p class="avp-intro">' + esc(tr('intro')) + '</p>' +
      '<div class="avp-stars" role="radiogroup" aria-label="' + esc(tr('title')) + '">' + etoiles + '</div>' +
      '<label class="avp-label" for="avpTexte">' + esc(tr('comment_label')) + '</label>' +
      '<textarea id="avpTexte" class="avp-text" maxlength="280" rows="2" placeholder="' + esc(tr('comment_placeholder')) + '"></textarea>' +
      '<p class="avp-privacy">' + esc(tr('privacy')) + '</p>' +
      '<div class="avp-actions"><button type="button" class="avp-send">' + esc(tr('send')) + '</button>' +
      '<button type="button" class="avp-later">' + esc(tr('later')) + '</button></div>' +
      '<p class="avp-msg" role="status" aria-live="polite"></p>';
    box.hidden = false;
    var note = 0, msg = box.querySelector('.avp-msg');
    var boutons = Array.prototype.slice.call(box.querySelectorAll('.avp-star'));
    boutons.forEach(function (b) {
      b.addEventListener('click', function () {
        note = Number(b.getAttribute('data-n'));
        boutons.forEach(function (o) {
          var on = Number(o.getAttribute('data-n')) <= note;
          o.classList.toggle('is-on', on);
          o.setAttribute('aria-checked', Number(o.getAttribute('data-n')) === note ? 'true' : 'false');
        });
      });
    });
    box.querySelector('.avp-later').addEventListener('click', function () { poserPlusTard(); box.hidden = true; });
    box.querySelector('.avp-send').addEventListener('click', function () {
      if (!note) { msg.textContent = tr('pick'); return; }
      var envoi = box.querySelector('.avp-send');
      envoi.disabled = true;
      var texte = box.querySelector('.avp-text').value.trim().slice(0, 280);
      app.supabase.rpc('avis_pro_envoyer', { p_note: note, p_texte: texte || null }).then(function (r) {
        if (r && r.error) throw r.error;
        box.innerHTML = '<p class="avp-thanks">' + esc(tr('thanks')) + '</p>';
      }).catch(function () { envoi.disabled = false; msg.textContent = tr('error'); });
    });
  }

  function demarrer() {
    var box = doc.querySelector('[data-avis-pro]');
    var app = global.IasharkApp;
    if (!box || !app || !app.supabase) return;
    var plusTard = lirePlusTard();
    if (plusTardActif(Date.now(), plusTard)) return;
    Promise.resolve(app.context()).then(function (ctx) {
      if (!ctx || !ctx.session || !ctx.isPro) return null;
      return app.supabase.rpc('avis_pro_etat').then(function (r) {
        if (r && r.error) return null; // migration 0052 pas encore appliquee : rien
        if (aMontrer(ctx, r && r.data, plusTard, Date.now())) rendre(box, app);
        return null;
      });
    }).catch(function () {});
  }
  // app-client.js est charge en defer : on attend la fin du chargement.
  if (doc.readyState === 'complete') demarrer(); else global.addEventListener('load', demarrer);
})(typeof window !== 'undefined' ? window : this);
