/* IASHARK — inscription directement sur la page match (25/11/2026, decision de Clement).

   Pourquoi : sur 30 jours, 161 visiteurs arrivaient sur la page d'inscription et 84 seulement
   commencaient a taper ; la moitie partait au changement de page. Ici, le bouton « Créer mon
   compte gratuit » du cadenas du match offert ouvre le formulaire A LA PLACE du bouton, sur la
   page du match. Apres la creation du compte, la page se recharge : le compte gratuit voit le
   match offert en entier.

   Memes regles que la page d'inscription (auth-pages.js) :
   - signUp Supabase, email + mot de passe (8 caracteres minimum) ;
   - case e-mails FACULTATIVE, decochee, meme texte et meme version de preuve (2026-10-27) ;
   - ligne CGV + confidentialite ;
   - memes mesures : signup_started, signup_form_started, signup_submitted, signup_completed
     (avec le jeton du compte cree), signup_failed { code } ; metadata inline:true en plus.
     Jamais la valeur saisie, jamais l'email.
   - jamais le message brut du serveur : textes traduits, sinon message generique.
   Sans Supabase ou sans ce module, le bouton reste un lien vers la page d'inscription. */
(function () {
  'use strict';
  var MIN_PASSWORD = 8;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var EMAIL_CONSENT_TEXT_VERSION = '2026-10-27';
  var LOCALE_DU_REPERTOIRE = { fr: 'fr', en: 'en', es: 'es', de: 'de', it: 'it', pt: 'pt', gb: 'en', za: 'en', mx: 'es-mx' };

  function t(key, fallback) { return (window.I18N && window.I18N.t) ? window.I18N.t(key, fallback) : fallback; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function suivre(type, md, userId, token) {
    try { if (window.iasharkTrack) window.iasharkTrack(type, Object.assign({ inline: true }, md || {}), userId, token); } catch (_e) {}
  }
  function repertoire() {
    var m = location.pathname.match(/^\/(fr|en|es|de|it|pt|gb|za|mx)(?:\/|$)/);
    return m ? m[1] : 'fr';
  }
  function lien(p) {
    if (window.I18N && typeof window.I18N.href === 'function') {
      try { var out = window.I18N.href(p); if (out) return out; } catch (_e) {}
    }
    return '/' + repertoire() + '/' + p;
  }
  function donneesEmails(consenti) {
    var dir = repertoire();
    var data = { iashark_marketing_opt_in: consenti ? 'true' : 'false', iashark_locale: LOCALE_DU_REPERTOIRE[dir], iashark_market: dir };
    if (consenti) data.iashark_marketing_text_version = EMAIL_CONSENT_TEXT_VERSION;
    return data;
  }
  function codeErreur(m) {
    m = String(m || '');
    if (/User already registered|already been registered/i.test(m)) return 'deja_inscrit';
    if (/Password should be at least/i.test(m)) return 'mdp_trop_court';
    if (/weak.?password/i.test(m)) return 'mdp_trop_simple';
    if (/rate limit|too many|429/i.test(m)) return 'trop_de_tentatives';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'reseau';
    if (/invalid.*email|email.*invalid|Anonymous sign-ins/i.test(m)) return 'email_refuse';
    if (/signups? not allowed|disabled/i.test(m)) return 'inscriptions_fermees';
    return 'autre';
  }
  function messageLisible(m) {
    m = String(m || '');
    if (/User already registered|already been registered/i.test(m)) return t('auth.err_already_registered', 'Un compte existe déjà avec cette adresse.');
    if (/Password should be at least/i.test(m)) return t('auth.err_password_too_short', 'Mot de passe trop court : ' + MIN_PASSWORD + ' caractères minimum.').replace('{min}', MIN_PASSWORD);
    if (/weak.?password/i.test(m)) return t('auth.err_weak_password', 'Ce mot de passe est trop simple. Choisissez-en un autre.');
    if (/rate limit|too many|429/i.test(m)) return t('auth.err_rate_limit', 'Trop de tentatives. Réessayez dans quelques minutes.');
    if (/Anonymous sign-ins are disabled|invalid.*email/i.test(m)) return t('auth.err_invalid_email_generic', 'Saisissez une adresse email valide.');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return t('auth.err_network', 'Connexion au serveur impossible. Vérifiez votre réseau.');
    return t('auth.err_generic', 'Une erreur est survenue. Réessayez dans quelques instants.');
  }

  var STYLE = '.ir{display:grid;gap:12px;text-align:left}'
    + '.ir label{display:grid;gap:6px;font-size:13.5px;color:var(--op-soft,#a3b1c2)}'
    + '.ir input[type=email],.ir input[type=password]{width:100%;font:inherit;font-size:16px;color:var(--op-text,#e2e8f0);background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:10px;padding:12px 14px;min-height:46px}'
    + '.ir input:focus-visible{outline:2px solid var(--op-cyan,#22d3ee);outline-offset:1px;border-color:transparent}'
    + '.ir .ir-hint{font-size:12px;color:var(--op-soft,#a3b1c2)}'
    + '.ir .ir-case{display:flex;gap:10px;align-items:flex-start;font-size:13px;line-height:1.4}'
    + '.ir .ir-case input{width:20px;height:20px;margin:1px 0 0;flex:none;accent-color:var(--op-cyan,#22d3ee)}'
    + '.ir .ir-case small{display:block;margin-top:3px;font-size:11.5px;opacity:.8}'
    + '.ir button[type=submit]{font:inherit;font-weight:700;font-size:15px;min-height:50px;border:0;border-radius:12px;background:var(--op-cyan,#22d3ee);color:#04121a;cursor:pointer}'
    + '.ir button[disabled]{opacity:.6;cursor:wait}'
    + '.ir .ir-err{font-size:12.5px;color:#f87171;min-height:0}'
    + '.ir .ir-msg{font-size:13px;color:#f87171}'
    + '.ir .ir-legal{font-size:11.5px;color:var(--op-soft,#a3b1c2);text-align:center}'
    + '.ir .ir-legal a{color:var(--op-cyan,#22d3ee)}';

  function poserStyle() {
    if (document.getElementById('irStyle')) return;
    var s = document.createElement('style'); s.id = 'irStyle'; s.textContent = STYLE; document.head.appendChild(s);
  }

  /* Remplace le bouton par le formulaire. bouton : le lien « Créer mon compte gratuit ». */
  function ouvrir(bouton) {
    var sb = window.IasharkApp && window.IasharkApp.supabase;
    if (!sb || !sb.auth || typeof sb.auth.signUp !== 'function' || !bouton || !bouton.parentNode) return false;
    poserStyle();
    var texteBouton = (bouton.textContent || '').trim() || t('auth.signup_submit', 'Créer mon compte gratuit');
    var f = document.createElement('form');
    f.className = 'ir'; f.noValidate = true; f.id = 'irForm';
    f.innerHTML =
      '<label>' + esc(t('auth.email_label', 'Email')) + '<input type="email" name="email" id="irEmail" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false" required></label>'
      + '<p class="ir-err" id="irEmailErr" hidden></p>'
      + '<label>' + esc(t('auth.password_label', 'Mot de passe')) + '<input type="password" name="password" id="irPwd" autocomplete="new-password" minlength="' + MIN_PASSWORD + '" required></label>'
      + '<p class="ir-hint" id="irPwdHint">' + esc(t('auth.password_hint_min_chars', MIN_PASSWORD + ' caractères minimum.')) + '</p>'
      + '<label class="ir-case"><input type="checkbox" id="irEmails"><span>' + esc(t('email_prefs.signup_label', 'Recevoir les analyses offertes, conseils d’utilisation et nos offres Pro par email')) + '<small>' + esc(t('email_prefs.signup_hint', 'Facultatif. Au plus un email tous les 3 jours, désinscription en 1 clic dans chaque email.')) + '</small></span></label>'
      + '<button type="submit" id="irSubmit">' + esc(texteBouton) + '</button>'
      + '<p class="ir-msg" id="irMsg" role="alert" hidden></p>'
      + '<p class="ir-legal">' + esc(t('auth.legal_prefix', 'En créant un compte, tu acceptes les')) + ' <a href="' + esc(lien('cgv.html')) + '">' + esc(t('auth.legal_cgv', 'CGV')) + '</a> ' + esc(t('auth.legal_and', 'et la')) + ' <a href="' + esc(lien('confidentialite.html')) + '">' + esc(t('auth.legal_privacy', 'politique de confidentialité')) + '</a>.</p>';
    bouton.parentNode.replaceChild(f, bouton);
    suivre('signup_started', {});
    var email = f.querySelector('#irEmail'), pwd = f.querySelector('#irPwd'), envoi = f.querySelector('#irSubmit');
    var errEmail = f.querySelector('#irEmailErr'), hint = f.querySelector('#irPwdHint'), msg = f.querySelector('#irMsg');
    var saisie = false;
    f.addEventListener('input', function () { if (!saisie) { saisie = true; suivre('signup_form_started', {}); } });
    try { email.focus({ preventScroll: true }); } catch (_e) {}
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      errEmail.hidden = true; msg.hidden = true; hint.style.color = '';
      var v = email.value.trim(), p = pwd.value, faute = null;
      if (!EMAIL_RE.test(v)) { errEmail.textContent = t('auth.err_enter_valid_email', 'Entrez une adresse email valide.'); errEmail.hidden = false; faute = 'email'; }
      if (p.length < MIN_PASSWORD) { hint.style.color = '#f87171'; faute = faute || 'password'; }
      if (faute) { suivre('signup_failed', { code: faute === 'email' ? 'champ_email' : 'champ_mdp' }); (faute === 'email' ? email : pwd).focus(); return; }
      suivre('signup_submitted', {});
      envoi.disabled = true; envoi.textContent = t('auth.signup_submit_loading', 'Création…');
      var caseEmails = f.querySelector('#irEmails');
      Promise.resolve(sb.auth.signUp({ email: v, password: p, options: { data: donneesEmails(!!caseEmails && caseEmails.checked === true) } })).then(function (res) {
        if (res && res.error) throw res.error;
        var s = res && res.data && res.data.session;
        if (s) {
          suivre('signup_completed', {}, s.user && s.user.id, s.access_token);
          setTimeout(function () { location.reload(); }, 150);
          return;
        }
        envoi.disabled = false; envoi.textContent = texteBouton;
        msg.textContent = t('auth.signup_success_check_login', 'Compte créé. Connectez-vous pour continuer.'); msg.style.color = '#34d399'; msg.hidden = false;
      }).catch(function (err) {
        var brut = String((err && err.message) || '');
        suivre('signup_failed', { code: codeErreur(brut) });
        envoi.disabled = false; envoi.textContent = texteBouton;
        msg.textContent = messageLisible(brut); msg.style.color = ''; msg.hidden = false;
      });
    });
    return true;
  }

  window.IasharkInscriptionRapide = { ouvrir: ouvrir };
})();
