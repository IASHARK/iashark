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

  /* ---------- Messages ----------
     On ne montre JAMAIS le message brut du fournisseur : il fuite des
     details inutiles ("AuthApiError: Invalid login credentials") et n'est pas
     en francais. Chaque cas connu est traduit, le reste tombe sur un message
     generique. */
  function messageLisible(brut) {
    var m = String(brut || '');
    if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
    if (/Email not confirmed/i.test(m)) return 'Cette adresse doit encore être confirmée.';
    if (/User already registered|already been registered/i.test(m)) return 'Un compte existe déjà avec cette adresse.';
    if (/Password should be at least/i.test(m)) return 'Mot de passe trop court : ' + MIN_PASSWORD + ' caractères minimum.';
    if (/weak.?password/i.test(m)) return 'Ce mot de passe est trop simple. Choisissez-en un autre.';
    if (/rate limit|too many|429/i.test(m)) return 'Trop de tentatives. Réessayez dans quelques minutes.';
    if (/Anonymous sign-ins are disabled/i.test(m)) return 'Saisissez une adresse email valide.';
    if (/same as the old password/i.test(m)) return 'Ce mot de passe est identique à l’ancien.';
    if (/Failed to fetch|NetworkError/i.test(m)) return 'Connexion au serveur impossible. Vérifiez votre réseau.';
    if (/expired|invalid.*token/i.test(m)) return 'Ce lien a expiré. Demandez-en un nouveau.';
    return 'Une erreur est survenue. Réessayez dans quelques instants.';
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
      btn.setAttribute('aria-label', visible ? 'Afficher le mot de passe' : 'Masquer le mot de passe');
      btn.setAttribute('aria-pressed', visible ? 'false' : 'true');
      btn.innerHTML = visible ? OEIL : OEIL_BARRE;
      input.focus();
    });
  }
  var OEIL = '<svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>';
  var OEIL_BARRE = '<svg viewBox="0 0 24 24" class="h-[18px] w-[18px]" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.2A9.8 9.8 0 0 1 12 6c6.4 0 10 6 10 6a17 17 0 0 1-3.2 3.9M6.2 7.1A16.7 16.7 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

  /* ---------- Destination apres connexion ----------
     ?next= n'est suivi QUE s'il s'agit d'un chemin interne. Une URL absolue,
     un protocole, ou un "//host" sont refuses : sinon la page devient une
     redirection ouverte utilisable pour du hameconnage. */
  function destination() {
    var brut = new URLSearchParams(location.search).get('next') || '';
    if (!brut || brut.charAt(0) !== '/' || brut.charAt(1) === '/' || brut.indexOf('\\') !== -1) return '/compte.html';
    return brut;
  }

  /* ---------- Connexion ---------- */
  async function connexion(e) {
    if (e) e.preventDefault();
    viderChamps(['email', 'password']);
    global('formMsg', '');
    var email = $('email').value.trim(), pwd = $('password').value;
    var faute = null;
    if (!EMAIL_RE.test(email)) { champ('email', 'Entrez une adresse email valide.'); faute = 'email'; }
    if (!pwd) { champ('password', 'Entrez votre mot de passe.'); faute = faute || 'password'; }
    if (faute) { $(faute).focus(); return; }

    var relacher = occuper($('submit'), 'Connexion…');
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
      if (passeParGuard) { location.href = destination(); return; }
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

  /* ---------- Inscription ---------- */
  async function inscription(e) {
    if (e) e.preventDefault();
    viderChamps(['email', 'password', 'password2']);
    global('formMsg', '');
    var email = $('email').value.trim(), pwd = $('password').value, pwd2 = $('password2').value;
    var faute = null;
    if (!EMAIL_RE.test(email)) { champ('email', 'Entrez une adresse email valide.'); faute = faute || 'email'; }
    if (pwd.length < MIN_PASSWORD) { champ('password', MIN_PASSWORD + ' caractères minimum.'); faute = faute || 'password'; }
    if (pwd2 !== pwd) { champ('password2', 'Les deux mots de passe ne correspondent pas.'); faute = faute || 'password2'; }
    if (faute) { $(faute).focus(); return; }

    var relacher = occuper($('submit'), 'Création…');
    try {
      var res = await sb.auth.signUp({ email: email, password: pwd });
      if (res.error) throw res.error;
      // La verification d'email est desactivee sur ce projet : signUp ouvre
      // une session directement. Le cas sans session ne devrait pas se
      // produire, mais s'il se produit on le dit honnetement plutot que de
      // laisser l'utilisateur devant un ecran muet.
      if (res.data && res.data.session) { location.href = '/compte.html?bienvenue=1'; return; }
      relacher();
      global('formMsg', 'Compte créé. Connectez-vous pour continuer.', 'success');
    } catch (err) {
      relacher();
      var texte = messageLisible(err && err.message);
      global('formMsg', texte, 'error');
      if (/existe déjà/.test(texte)) champ('email', texte);
    }
  }

  /* ---------- Mot de passe oublie ---------- */
  async function oubli(e) {
    if (e) e.preventDefault();
    viderChamps(['email']);
    global('formMsg', '');
    var email = $('email').value.trim();
    if (!EMAIL_RE.test(email)) { champ('email', 'Entrez une adresse email valide.'); $('email').focus(); return; }

    var relacher = occuper($('submit'), 'Envoi…');
    var redirection = new URL('/reinitialiser-mot-de-passe.html', location.origin).href;
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
    var abonnement = null;
    var session = await new Promise(function (resolve) {
      var fini = false;
      var terminer = function (valeur) { if (fini) return; fini = true; resolve(valeur); };
      abonnement = sb.auth.onAuthStateChange(function (evt, s) { if (s) terminer(s); });
      sb.auth.getSession().then(function (r) { if (r.data && r.data.session) terminer(r.data.session); });
      setTimeout(function () { terminer(null); }, 2500);
    });
    if (abonnement && abonnement.data && abonnement.data.subscription) abonnement.data.subscription.unsubscribe();
    $('chargement').hidden = true;
    if (!session) { $('lienInvalide').hidden = false; return; }
    $('formulaire').hidden = false;
    $('password').focus();
  }

  async function reinitialiser(e) {
    if (e) e.preventDefault();
    viderChamps(['password', 'password2']);
    global('formMsg', '');
    var pwd = $('password').value, pwd2 = $('password2').value;
    var faute = null;
    if (pwd.length < MIN_PASSWORD) { champ('password', MIN_PASSWORD + ' caractères minimum.'); faute = 'password'; }
    else if (pwd2 !== pwd) { champ('password2', 'Les deux mots de passe ne correspondent pas.'); faute = 'password2'; }
    if (faute) { $(faute).focus(); return; }

    var relacher = occuper($('submit'), 'Mise à jour…');
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
