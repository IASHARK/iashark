/* IASHARK — compte « leger » (02/10/2026).

   Pour les pages qui ne chargent PAS app-client.js (accueil des landings
   fr/en/es, blog, pages legales, clubs, competitions, methodologie...) : savoir
   qui regarde la page (visiteur, compte gratuit, Pro) sans charger supabase-js
   pour rien. Utilise par la pastille Telegram (assets/telegram-pill.js) et par
   la grille de prix (assets/pricing-grid.js : annonce de l'essai).

   Regles :
   - app-client.js present (window.IasharkApp) : c'est LUI qui repond, toujours
     (meme lecture que le reste du site : users.plan / users.role) ;
   - sinon, aucune session enregistree dans ce navigateur : visiteur, AUCUNE
     requete ;
   - session enregistree et encore valable : lecture de users (plan, role) avec
     le jeton de la personne, sous RLS, comme app-client.js ;
   - session expiree ou lecture impossible : le vrai client est charge
     (supabase-js epingle + /app-client.js : il renouvelle la session) ; s'il
     ne se charge pas, la personne est traitee comme un visiteur.
   Lecture seule : rien n'est jamais ecrit ici.

   URL et cle PUBLIQUE (anon) du projet : les memes que app-client.js et
   funnel-track.js (elles sont publiques par nature, la base est protegee par
   RLS). Jamais de cle secrete dans un fichier du site. */
(function (global) {
  'use strict';
  if (global.IasharkCompteLeger) return;
  var URL = 'https://ksvjraqitxouwiabecai.supabase.co';
  var KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8';
  // Nom de la session dans le navigateur (supabase-js v2 : sb-<projet>-auth-token).
  var CLE_SESSION = 'sb-ksvjraqitxouwiabecai-auth-token';
  // Meme version epinglee que les pages (scripts/build-public.js refuse une version flottante).
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.116.0/dist/umd/supabase.min.js';
  var VISITEUR = { session: null, user: null, profile: null, isPro: false, isAdmin: false };

  function app() { return global.IasharkApp && global.IasharkApp.supabase ? global.IasharkApp : null; }
  function sessionEnregistree() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(CLE_SESSION);
      if (!raw) return null;
      var s = JSON.parse(raw);
      if (s && s.currentSession) s = s.currentSession;
      return s && s.access_token && s.user && s.user.id ? s : null;
    } catch (e) { return null; }
  }
  function valable(s) { return !!(s && s.expires_at && s.expires_at * 1000 > Date.now() + 60000); }
  // Scripts « defer » de la page executes (app-client.js compris) avant de decider.
  function pagePrete() {
    var d = global.document;
    return new Promise(function (resolve) {
      if (!d || d.readyState !== 'loading') resolve();
      else d.addEventListener('DOMContentLoaded', function () { resolve(); });
    });
  }
  function chargerScript(src) {
    return new Promise(function (resolve, reject) {
      var d = global.document;
      var s = d.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('script')); };
      (d.head || d.documentElement).appendChild(s);
    });
  }
  var appEnCours = null;
  function chargerApp() {
    if (app()) return Promise.resolve(app());
    if (!appEnCours) {
      appEnCours = (global.supabase && global.supabase.createClient ? Promise.resolve() : chargerScript(SUPABASE_JS))
        .then(function () { return app() ? null : chargerScript('/app-client.js'); })
        .then(function () { return app(); }, function () { return null; });
    }
    return appEnCours;
  }
  function viaApp() {
    return chargerApp().then(function (a) { return a ? a.context() : VISITEUR; }).catch(function () { return VISITEUR; });
  }
  function profil(s, p) {
    p = p || {};
    return { session: s, user: s.user, profile: p, isAdmin: p.role === 'admin', isPro: p.plan === 'pro' || p.plan === 'famille' || p.role === 'admin' };
  }
  function lire(chemin, jeton) {
    return global.fetch(URL + '/rest/v1/' + chemin, { headers: { apikey: KEY, Authorization: 'Bearer ' + jeton } })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
  }

  var ctxEnCours = null;
  // Meme forme que IasharkApp.context() : {session, user, profile, isPro, isAdmin}.
  function context() {
    if (!ctxEnCours) {
      ctxEnCours = pagePrete().then(function () {
        if (app()) return app().context();
        var s = sessionEnregistree();
        if (!s) return VISITEUR;
        if (!valable(s) || typeof global.fetch !== 'function') return viaApp();
        return lire('users?select=plan,role&id=eq.' + encodeURIComponent(s.user.id), s.access_token)
          .then(function (rows) { return profil(s, rows && rows[0]); }, viaApp);
      }).catch(function () { return VISITEUR; });
    }
    return ctxEnCours;
  }
  // Jeton de la personne connectee (appel des fonctions du site), ou null.
  function jeton() {
    return pagePrete().then(function () {
      if (app()) return app().supabase.auth.getSession().then(function (r) { return r && r.data && r.data.session ? r.data.session.access_token : null; });
      var s = sessionEnregistree();
      if (!s) return null;
      if (valable(s)) return s.access_token;
      return chargerApp().then(function (a) {
        return a ? a.supabase.auth.getSession().then(function (r) { return r && r.data && r.data.session ? r.data.session.access_token : null; }) : null;
      });
    }).catch(function () { return null; });
  }
  // Le compte n'a-t-il JAMAIS eu d'abonnement (toutes lignes, tous statuts) ?
  // Meme regle que create-checkout-session/trial.ts. Erreur = false (on
  // n'annonce jamais un essai par erreur).
  function jamaisAbonne(user) {
    if (!user || !user.id) return Promise.resolve(false);
    if (app()) {
      try {
        return Promise.resolve(app().supabase.from('subscriptions').select('stripe_subscription_id', { count: 'exact', head: true }).eq('user_id', user.id))
          .then(function (r) { return !!r && !r.error && r.count === 0; }, function () { return false; });
      } catch (e) { return Promise.resolve(false); }
    }
    return jeton().then(function (j) {
      if (!j) return false;
      return lire('subscriptions?select=user_id&limit=1&user_id=eq.' + encodeURIComponent(user.id), j)
        .then(function (rows) { return Array.isArray(rows) && rows.length === 0; }, function () { return false; });
    });
  }

  global.IasharkCompteLeger = {
    url: URL,
    key: KEY,
    context: context,
    jeton: jeton,
    jamaisAbonne: jamaisAbonne,
    chargerApp: chargerApp,
    // Pour les tests : nom de la session dans le navigateur.
    CLE_SESSION: CLE_SESSION
  };
})(typeof window !== 'undefined' ? window : this);
