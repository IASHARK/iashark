/* IASHARK — logique partagee des pages d'authentification.
   Utilisee par connexion.html, inscription.html, mot-de-passe-oublie.html et
   reinitialiser-mot-de-passe.html.

   AUDIT (03/09/2026), tout ce qui suit est verifie contre le projet reel :
   - fournisseur : Supabase Auth, EMAIL + MOT DE PASSE uniquement. L'endpoint
     public /auth/v1/settings renvoie `external` a false pour Google, Apple,
     GitHub, Discord et tous les autres : aucun bouton social n'est propose
     ici, il ne fonctionnerait pas.
   - verification d'email : DESACTIVEE (`mailer_autoconfirm: true`). Une
     inscription ouvre donc une session immediatement. On n'affiche jamais
     "verifiez votre boite mail" apres une inscription : ce serait faux.
   - inscriptions ouvertes (`disable_signup: false`).
   - la connexion passe par la fonction login-guard, qui ajoute un vrai
     rate limit par IP et par email au-dessus de Supabase Auth. Repli sur
     l'appel direct uniquement si la fonction est injoignable (reseau), pas
     si elle repond une erreur metier. */
(function () {
  'use strict';
  var SUPA_URL = 'https://ksvjraqitxouwiabecai.supabase.co';
  var sb = window.IasharkApp && window.IasharkApp.supabase;
  var KEY = window.IasharkApp && window.IasharkApp.key;
  var MIN_PASSWORD = 8;

  var $ = function (id) { return document.getElementById(id); };

  /* Lien interne qui reste dans le repertoire de langue/marche courant
     (/gb/, /mx/, /en/...) via I18N.href quand il existe ; sinon chemin
     racine, comportement historique. */
  function localHref(p) {
    var i = p.search(/[?#]/), tail = '';
    if (i >= 0) { tail = p.slice(i); p = p.slice(0, i); }
    if (window.I18N && typeof window.I18N.href === 'function') {
      try { var out = window.I18N.href(p || 'index.html'); if (out) return String(out).replace(/\/index\.html$/, '/') + tail; } catch (_e) {}
    }
    return '/' + p + tail;
  }

  /* i18n : repli local sur le francais d'origine si I18N n'est pas charge (ou
     pas encore pret) - meme motif que celui deja utilise par match-page.js /
     tools-page.js / bottom-navigation.js / site-prefs.js. Ne traduit jamais
     les donnees utilisateur (email saisi) ni les codes d'erreur bruts de
     Supabase, uniquement le texte d'interface qui les habille. */
  function t(key, fallback) { return (window.I18N && window.I18N.t) ? window.I18N.t(key, fallback) : fallback; }

  /* ---------- Messages ----------
     On ne montre JAMAIS le message brut du fournisseur : il fuite des
     details inutiles ("AuthApiError: Invalid login credentials") et n'est pas
     dans la langue de la personne. Chaque cas connu est traduit, le reste
     tombe sur un message generique. */
  function messageLisible(brut) {
    var m = String(brut || '');
    if (/Invalid login credentials/i.test(m)) return t('auth.err_invalid_credentials', 'Email ou mot de passe incorrect.');
    if (/Email not confirmed/i.test(m)) return t('auth.err_email_not_confirmed', 'Cette adresse doit encore être confirmée.');
    if (/User already registered|already been registered/i.test(m)) return t('auth.err_already_registered', 'Un compte existe déjà avec cette adresse.');
    if (/Password should be at least/i.test(m)) return t('auth.err_password_too_short', 'Mot de passe trop court : ' + MIN_PASSWORD + ' caractères minimum.').replace('{min}', MIN_PASSWORD);
    if (/weak.?password/i.test(m)) return t('auth.err_weak_password', 'Ce mot de passe est trop simple. Choisissez-en un autre.');
    if (/rate limit|too many|429/i.test(m)) return t('auth.err_rate_limit', 'Trop de tentatives. Réessayez dans quelques minutes.');
    if (/Anonymous sign-ins are disabled/i.test(m)) return t('auth.err_invalid_email_generic', 'Saisissez une adresse email valide.');
    if (/same as the old password/i.test(m)) return t('auth.err_same_as_old_password', 'Ce mot de passe est identique à l’ancien.');
    if (/Failed to fetch|NetworkError/i.test(m)) return t('auth.err_network', 'Connexion au serveur impossible. Vérifiez votre réseau.');
    if (/expired|invalid.*token/i.test(m)) return t('auth.err_link_expired', 'Ce lien a expiré. Demandez-en un nouveau.');
    return t('auth.err_generic', 'Une erreur est survenue. Réessayez dans quelques instants.');
  }

  /* Zone de message globale du formulaire. aria-live pour que les lecteurs
     d'ecran annoncent le resultat sans deplacer le focus. */
  function global(id, texte, type) {
    var el = $(id);
    if (!el) return;
    el.textContent = texte || '';
    el.hidden = !texte;
    el.className = 'mt-4 rounded-lg border px-3.5 py-3 text-[13.5px] leading-relaxed ' + (
      type === 'error' ? 'border-red-500/30 bg-red-500/[.07] text-red-300'
      : type === 'success' ? 'border-emerald-500/30 bg-emerald-500/[.07] text-emerald-300'
      : 'border-hairline bg-white/[.03] text-soft');
  }

  /* Erreur attachee a UN champ, affichee sous lui : l'utilisateur voit
     immediatement lequel corriger. */
  function champ(inputId, texte) {
    var input = $(inputId), zone = $(inputId + 'Err');
    if (!input || !zone) return;
    zone.textContent = texte || '';
    zone.hidden = !texte;
    if (texte) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  function viderChamps(ids) { ids.forEach(function (id) { champ(id, ''); }); }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------- Bouton en cours ----------
     Le bouton est desactive pendant l'appel : pas de double soumission
     possible, et le libelle dit ce qui se passe. */
  function occuper(btn, texte) {
    if (!btn) return function () {};
    var initial = btn.textContent, largeur = btn.offsetWidth;
    btn.disabled = true;
    btn.style.minWidth = largeur + 'px';
    btn.textContent = texte;
    return function () { btn.disabled = false; btn.textContent = initial; btn.style.minWidth = ''; };
  }

  /* ---------- Afficher / masquer le mot de passe ---------- */
  function brancherOeil(btnId, inputId) {
    var btn = $(btnId), input = $(inputId);
    if (!btn || !input) return;
    btn.addEventListener('click', function () {
      var visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      btn.setAttribute('aria-label', visible ? t('auth.show_password', 'Afficher le mot de passe') : t('auth.hide_password', 'Masquer le mot de passe'));
      btn.setAttribute('aria-pressed', visible ? 'false' : 'true');
      btn.innerHTML = visible ? OEIL : OEIL_BARRE;
      input.focus();
    });
  }
  // Icones Lucide « eye » et « eye-off » (lucide-static v1.51.0, ISC ; trace exact, aucun dessin
  // fait main : controle UX du 04/10/2026, tour 2 ; licence dans assets/vendor/LICENCES.txt).
  var OEIL = '<svg viewBox="0 0 24 24" class="lucide lucide-eye h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
  var OEIL_BARRE = '<svg viewBox="0 0 24 24" class="lucide lucide-eye-off h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';

  /* ---------- Destination apres connexion ----------
     ?next= n'est suivi QUE s'il s'agit d'un chemin interne. Une URL absolue,
     un protocole, ou un "//host" sont refuses : sinon la page devient une
     redirection ouverte utilisable pour du hameconnage. */
  function destination() {
    var brut = new URLSearchParams(location.search).get('next') || '';
    if (!brut || brut.charAt(0) !== '/' || brut.charAt(1) === '/' || brut.indexOf('\\') !== -1) return localHref('compte.html');
    return brut;
  }

  /* ---------- ?next= suit le visiteur d'une page d'auth a l'autre ----------
     « Pas encore de compte ? » (connexion -> inscription) et « Déjà membre ? »
     (inscription -> connexion) perdaient le ?next=. Un visiteur envoye a la
     connexion depuis un match, qui choisit de s'inscrire, atterrissait sur
     « Mon compte » au lieu de revenir sur son match. */
  function propagerNext() {
    var brut = new URLSearchParams(location.search).get('next') || '';
    if (!brut || brut.charAt(0) !== '/' || brut.charAt(1) === '/' || brut.indexOf('\\') !== -1) return;
    var liens = document.querySelectorAll('a[href*="inscription.html"], a[href*="connexion.html"]');
    var avecNext = function (u) { return u.indexOf('next=') !== -1 ? u : u + (u.indexOf('?') === -1 ? '?' : '&') + 'next=' + encodeURIComponent(brut); };
    for (var i = 0; i < liens.length; i++) {
      var href = liens[i].getAttribute('href') || '';
      liens[i].setAttribute('href', avecNext(href));
      // site-prefs.js reecrit href depuis data-href une fois le dictionnaire
      // charge (I18N.href conserve la query) : le next doit donc vivre aussi
      // dans data-href, sinon il est efface juste apres avoir ete pose.
      var dataHref = liens[i].getAttribute('data-href');
      if (dataHref) liens[i].setAttribute('data-href', avecNext(dataHref));
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', propagerNext); else propagerNext();

  /* ---------- Chemin de paiement : etape 1 sur 2 (controle UX du 04/10/2026, tour 2) ----------
     Sans compte, « Continuer avec l'annee » (lib/offre-pro.js) passe par l'inscription puis
     revient sur l'abonnement : ?next=/abonnement.html?duree=year... La page d'inscription le
     dit au lieu de « Compte gratuit, commencez gratuitement » : etape 1 sur 2, la duree choisie
     et son prix (config/markets.json via lib/market-config.js, jamais ecrit ici), puis le
     paiement par Stripe. Duree lue en LISTE BLANCHE ; un ?next= externe est ignore. */
  function dureeDuRetour(brut) {
    if (!brut || brut.charAt(0) !== '/' || brut.charAt(1) === '/' || brut.indexOf('\\') !== -1) return null;
    var m = /^\/(?:[a-z]{2}\/)?abonnement\.html\?(?:[^#]*&)?duree=(week|month|year)(?:[&#]|$)/.exec(brut);
    return m ? m[1] : null;
  }
  function tf(key, fallback, vars) {
    return String(t(key, fallback)).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  }
  function etapePaiement() {
    var h1 = document.querySelector('[data-i18n="auth.signup_h1"], [data-pay-step="h1"]');
    if (!h1) return;
    var duree = dureeDuRetour(new URLSearchParams(location.search).get('next') || '');
    if (!duree) return;
    var prix = null;
    try {
      var M = window.IASHARK_MARKET, o = M && typeof M.proOffer === 'function' ? M.proOffer() : null;
      var p = o && Array.isArray(o.intervals) ? o.intervals.filter(function (x) { return x && x.interval === duree && x.text; })[0] : null;
      prix = p ? p.text : null;
    } catch (_e) { prix = null; }
    var NOMS = { week: ['auth.pay_step_week', 'de la semaine'], month: ['auth.pay_step_month', 'du mois'], year: ['auth.pay_step_year', 'de l’année'] };
    var poser = function () {
      var vars = { duree: t(NOMS[duree][0], NOMS[duree][1]), prix: prix };
      var fixer = function (cle, texte) {
        var el = document.querySelector('[data-i18n="auth.signup_' + cle + '"], [data-pay-step="' + cle + '"]');
        if (!el) return;
        el.removeAttribute('data-i18n');
        el.setAttribute('data-pay-step', cle);
        el.textContent = texte;
      };
      fixer('eyebrow', t('auth.pay_step_eyebrow', 'Passer Pro'));
      fixer('h1', t('auth.pay_step_h1', 'Étape 1 sur 2 : ton compte.'));
      fixer('intro', prix ? tf('auth.pay_step_intro', 'Ensuite : paiement {duree} ({prix}) par Stripe. Ta durée reste choisie.', vars)
        : tf('auth.pay_step_intro_noprice', 'Ensuite : le paiement {duree} par Stripe. Ta durée reste choisie.', vars));
      // Les avantages du compte gratuit (« aucune carte demandée »...) ne decrivent pas ce chemin.
      var puce = document.querySelector('[data-i18n="auth.signup_bullet_analysis"]');
      var liste = puce && puce.closest('ul');
      if (liste) { liste.hidden = true; liste.style.display = 'none'; }
    };
    poser();
    // Dictionnaire charge apres coup (autre langue) : on reecrit dans la bonne langue.
    var I = window.I18N;
    if (I && typeof I.init === 'function' && !I.dict) Promise.resolve().then(function () { return I.init(); }).then(poser, function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', etapePaiement); else etapePaiement();

  /* ---------- Connexion ---------- */
  async function connexion(e) {
    if (e) e.preventDefault();
    viderChamps(['email', 'password']);
    global('formMsg', '');
    var email = $('email').value.trim(), pwd = $('password').value;
    var faute = null;
    if (!EMAIL_RE.test(email)) { champ('email', t('auth.err_enter_valid_email', 'Entrez une adresse email valide.')); faute = 'email'; }
    if (!pwd) { champ('password', t('auth.err_enter_password', 'Entrez votre mot de passe.')); faute = faute || 'password'; }
    if (faute) { $(faute).focus(); return; }

    var relacher = occuper($('submit'), t('auth.login_submit_loading', 'Connexion…'));
    try {
      var passeParGuard = false;
      try {
        var r = await fetch(SUPA_URL + '/functions/v1/login-guard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', apikey: KEY },
          body: JSON.stringify({ email: email, password: pwd })
        });
        var j = await r.json();
        if (r.status === 429) throw new Error('rate limit');
        if (!r.ok) throw new Error(j.msg || j.error_description || j.error || 'login_failed');
        var setRes = await sb.auth.setSession({ access_token: j.access_token, refresh_token: j.refresh_token });
        if (setRes.error) throw setRes.error;
        passeParGuard = true;
      } catch (err) {
        // Repli sur l'appel direct UNIQUEMENT si le garde est injoignable.
        // Une erreur metier (identifiants faux, rate limit) doit remonter.
        if (!/Failed to fetch|NetworkError/i.test(String(err && err.message))) throw err;
        var res = await sb.auth.signInWithPassword({ email: email, password: pwd });
        if (res.error) throw res.error;
        passeParGuard = true;
      }
      if (passeParGuard) {
        // Suivi interne anonyme : la connexion n'est jamais reliee au compte.
        if (window.iasharkTrack) window.iasharkTrack('login_completed', {});
        location.href = destination();
        return;
      }
    } catch (err) {
      relacher();
      var texte = messageLisible(err && err.message);
      global('formMsg', texte, 'error');
      // L'erreur d'identifiants porte sur le couple, pas sur un champ : on
      // ne designe pas l'email comme fautif, cela reviendrait a dire qu'il
      // existe ou non (enumeration de comptes).
      $('password').focus();
    }
  }

  /* ---------- Consentement aux emails de relance ----------
     Case facultative et jamais pre-cochee de inscription.html (absente des
     copies /<dir>/ tant que build-locales n'a pas ete relance : consentement
     alors a false). Metadonnees lues par le declencheur SQL
     handle_new_user_email_preferences (migration 0024), qui pose la date cote
     serveur. Version = date du texte de la case (preuve du consentement). */
  var EMAIL_CONSENT_TEXT_VERSION = '2026-09-15';
  var LOCALE_DU_REPERTOIRE = { fr: 'fr', en: 'en', es: 'es', de: 'de', it: 'it', pt: 'pt', gb: 'en', za: 'en', mx: 'es-mx' };
  function donneesEmails(consenti) {
    var m = location.pathname.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)(?:\/|$)/);
    var dir = m ? m[1] : 'fr';
    var data = { iashark_marketing_opt_in: consenti ? 'true' : 'false', iashark_locale: LOCALE_DU_REPERTOIRE[dir], iashark_market: dir };
    if (consenti) data.iashark_marketing_text_version = EMAIL_CONSENT_TEXT_VERSION;
    return data;
  }

  /* ---------- Inscription ---------- */
  async function inscription(e) {
    if (e) e.preventDefault();
    viderChamps(['email', 'password', 'password2']);
    global('formMsg', '');
    var email = $('email').value.trim(), pwd = $('password').value, pwd2 = $('password2').value;
    var faute = null;
    if (!EMAIL_RE.test(email)) { champ('email', t('auth.err_enter_valid_email', 'Entrez une adresse email valide.')); faute = faute || 'email'; }
    if (pwd.length < MIN_PASSWORD) { champ('password', t('auth.password_hint_min_chars', MIN_PASSWORD + ' caractères minimum.')); faute = faute || 'password'; }
    if (pwd2 !== pwd) { champ('password2', t('auth.err_passwords_mismatch', 'Les deux mots de passe ne correspondent pas.')); faute = faute || 'password2'; }
    if (faute) { $(faute).focus(); return; }

    var relacher = occuper($('submit'), t('auth.signup_submit_loading', 'Création…'));
    try {
      var caseEmails = $('emailMarketing');
      var res = await sb.auth.signUp({ email: email, password: pwd, options: { data: donneesEmails(!!caseEmails && caseEmails.checked === true) } });
      if (res.error) throw res.error;
      // La verification d'email est desactivee sur ce projet : signUp ouvre
      // une session directement. Le cas sans session ne devrait pas se
      // produire, mais s'il se produit on le dit honnetement plutot que de
      // laisser l'utilisateur devant un ecran muet.
      if (res.data && res.data.session) {
        // Jeton du compte cree transmis avec son user_id : sans lui la
        // politique RLS de funnel_events rejetait l'evenement (cle anon seule).
        var nouvelleSession = res.data.session;
        if (window.iasharkTrack) window.iasharkTrack('signup_completed', {}, nouvelleSession.user && nouvelleSession.user.id, nouvelleSession.access_token);
        // Retour la ou l'inscription a commence (match, abonnement...) quand
        // un ?next= interne existe ; sinon « Mon compte » avec le message de
        // bienvenue. Avant : compte.html en dur, le match etait perdu.
        var dest = destination();
        location.href = dest === localHref('compte.html') ? localHref('compte.html?bienvenue=1') : dest;
        return;
      }
      relacher();
      global('formMsg', t('auth.signup_success_check_login', 'Compte créé. Connectez-vous pour continuer.'), 'success');
    } catch (err) {
      relacher();
      var brut = String((err && err.message) || '');
      var texte = messageLisible(brut);
      global('formMsg', texte, 'error');
      // Teste le signal brut (toujours en anglais, cote Supabase), pas le
      // texte deja traduit : sinon ce marquage du champ email ne se
      // declenchait qu'en francais (bug reel trouve pendant la
      // localisation - le texte traduit ne contient plus "existe deja").
      if (/User already registered|already been registered/i.test(brut)) champ('email', texte);
    }
  }

  /* URL absolue-racine de la page de reinitialisation du repertoire courant.
     Page sans prefixe : I18N.href si disponible, sinon /fr/ (jamais la racine,
     qui redirige). */
  function lienReinitialisation() {
    var m = location.pathname.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)(?:\/|$)/);
    if (m) return '/' + m[1] + '/reinitialiser-mot-de-passe.html';
    var h = localHref('reinitialiser-mot-de-passe.html');
    return /^\/[a-z]{2}\//.test(h) ? h : '/fr/reinitialiser-mot-de-passe.html';
  }

  /* ---------- Mot de passe oublie ---------- */
  async function oubli(e) {
    if (e) e.preventDefault();
    viderChamps(['email']);
    global('formMsg', '');
    var email = $('email').value.trim();
    if (!EMAIL_RE.test(email)) { champ('email', t('auth.err_enter_valid_email', 'Entrez une adresse email valide.')); $('email').focus(); return; }

    var relacher = occuper($('submit'), t('auth.forgot_submit_loading', 'Envoi…'));
    // Page du repertoire courant (/gb/, /mx/, /en/...) : la racine redirige
    // desormais en 301 vers /fr/, un visiteur non francais aurait atterri sur
    // la page francaise (audit QA 14/09/2026).
    // PREREQUIS COTE SUPABASE (Auth > URL Configuration > Redirect URLs) :
    // autoriser https://iashark.com/*/reinitialiser-mot-de-passe.html. Sans
    // cette entree, Supabase ignore redirectTo et renvoie sur la Site URL :
    // aucun repli n'est possible cote navigateur (la liste est verifiee par
    // le serveur d'authentification au moment de l'envoi du mail).
    var redirection = new URL(lienReinitialisation(), location.origin).href;
    try {
      await sb.auth.resetPasswordForEmail(email, { redirectTo: redirection });
    } catch (_e) { /* voir ci-dessous */ }
    relacher();
    // Reponse volontairement identique que le compte existe ou non : sinon
    // cette page devient un moyen de tester si une adresse est inscrite.
    $('formulaire').hidden = true;
    $('envoye').hidden = false;
    $('envoyeEmail').textContent = email;
  }

  /* ---------- Nouveau mot de passe ----------
     Supabase place la session de recuperation dans le fragment de l'URL et
     le SDK la consomme tout seul. On attend donc d'avoir une session avant
     d'autoriser la saisie : sans elle, updateUser echouerait. */
  async function preparerReinit() {
    // Jamais bloque sur "Verification du lien..." (audit QA 14/09/2026 : /fr/
    // restait fige) : sans session apres 2,5 s -> lien invalide ; client
    // Supabase absent ou SDK en erreur -> lien invalide immediatement. Une
    // session qui arrive plus tard (reseau lent) reaffiche le formulaire.
    var etat = 'attente', abonnement = null;
    function arreterEcoute() {
      try { if (abonnement && abonnement.data && abonnement.data.subscription) abonnement.data.subscription.unsubscribe(); } catch (_e) {}
    }
    function montrer(session) {
      if (etat === 'formulaire') return;
      if (!session && etat !== 'attente') return;
      $('chargement').hidden = true;
      if (session) {
        etat = 'formulaire';
        arreterEcoute();
        $('lienInvalide').hidden = true;
        $('formulaire').hidden = false;
        $('password').focus();
      } else {
        etat = 'invalide';
        $('lienInvalide').hidden = false;
      }
    }
    if (!sb || !sb.auth) { montrer(null); return; }
    setTimeout(function () { montrer(null); }, 2500);
    setTimeout(arreterEcoute, 30000);
    try {
      abonnement = sb.auth.onAuthStateChange(function (evt, s) { if (s) montrer(s); });
    } catch (_e) {}
    try {
      var r = await Promise.race([
        sb.auth.getSession(),
        new Promise(function (resolve) { setTimeout(function () { resolve(null); }, 2500); })
      ]);
      if (r && r.data && r.data.session) montrer(r.data.session);
    } catch (_e) { montrer(null); }
  }

  async function reinitialiser(e) {
    if (e) e.preventDefault();
    viderChamps(['password', 'password2']);
    global('formMsg', '');
    var pwd = $('password').value, pwd2 = $('password2').value;
    var faute = null;
    if (pwd.length < MIN_PASSWORD) { champ('password', t('auth.password_hint_min_chars', MIN_PASSWORD + ' caractères minimum.')); faute = 'password'; }
    else if (pwd2 !== pwd) { champ('password2', t('auth.err_passwords_mismatch', 'Les deux mots de passe ne correspondent pas.')); faute = 'password2'; }
    if (faute) { $(faute).focus(); return; }

    var relacher = occuper($('submit'), t('auth.reset_submit_loading', 'Mise à jour…'));
    try {
      var res = await sb.auth.updateUser({ password: pwd });
      if (res.error) throw res.error;
      $('formulaire').hidden = true;
      $('termine').hidden = false;
    } catch (err) {
      relacher();
      global('formMsg', messageLisible(err && err.message), 'error');
    }
  }

  /* ---------- Deja connecte ----------
     Inutile d'afficher un formulaire de connexion a quelqu'un qui a deja une
     session : on l'envoie directement sur son compte. */
  async function redirigerSiConnecte() {
    try {
      var r = await sb.auth.getSession();
      if (r.data && r.data.session) location.replace(destination());
    } catch (_e) {}
  }

  window.IasharkAuth = {
    connexion: connexion,
    inscription: inscription,
    oubli: oubli,
    preparerReinit: preparerReinit,
    reinitialiser: reinitialiser,
    brancherOeil: brancherOeil,
    redirigerSiConnecte: redirigerSiConnecte,
    messageLisible: messageLisible,
    MIN_PASSWORD: MIN_PASSWORD
  };
})();
