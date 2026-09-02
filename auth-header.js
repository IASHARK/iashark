/* Header d'authentification partagé — utilisé par index.html, historique.html, pro.html.
   compte.html gère sa propre session mais réutilise chipLabel() pour le même format.
   i18n : ce script est partagé (une seule copie, jamais dupliqué par page/langue comme
   le reste du site généré par scripts/build-locales.js), donc localisé au runtime via
   /i18n/dict/{locale}.json — détection de la locale identique à i18n/i18n.js (préfixe
   d'URL /en/, /es/... ; racine ou /fr/ = défaut FR). Repli silencieux sur le FR figé
   ci-dessous si le dictionnaire ne charge pas (jamais bloquer la connexion pour un
   probleme de traduction). */
(function(){
  var SUPA_URL = 'https://ksvjraqitxouwiabecai.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8';

  var FALLBACK_T = {
    login_btn:'CONNEXION', quick_login_title:'CONNEXION RAPIDE', email_placeholder:'ton@email.com',
    password_placeholder:'Mot de passe', submit_login:'SE CONNECTER →', submit_login_loading:'CONNEXION...',
    no_account_label:'Pas de compte ?', signup_link:'Inscription', fill_both_fields:'Remplis les deux champs.',
    too_many_attempts:'Trop de tentatives.', generic_login_error:'Erreur de connexion',
    connected_reloading:'Connecté ! Rechargement...', invalid_login:'Email ou mot de passe incorrect.',
    confirm_email:'Confirme ton email avant de te connecter.'
  };
  var T = FALLBACK_T;

  function detectLocale(){
    var m = location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    var supported = ['fr','en','es','de','it','pt'];
    return (m && supported.indexOf(m[1]) !== -1) ? m[1] : 'fr';
  }

  var _dictPromise = null;
  function loadT(){
    if(_dictPromise) return _dictPromise;
    var locale = detectLocale();
    if(locale === 'fr'){ _dictPromise = Promise.resolve(FALLBACK_T); return _dictPromise; }
    _dictPromise = fetch('/i18n/dict/'+locale+'.json')
      .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
      .then(function(d){ T = (d && d.auth_header) ? d.auth_header : FALLBACK_T; return T; })
      .catch(function(){ T = FALLBACK_T; return T; });
    return _dictPromise;
  }

  var _sbInstance = null;
  // Reutilise le client Supabase d'app-client.js quand il est present sur la
  // page (window.IasharkApp.supabase) plutot que d'en creer un second -
  // deux instances distinctes du meme projet declenchent l'avertissement
  // "Multiple GoTrue Client instances" et peuvent desynchroniser l'etat de
  // session affiche par le header vs le reste de la page. Repli sur une
  // instance dediee uniquement sur les pages qui ne chargent pas
  // app-client.js (ex: blog.html, index.html).
  function getSb(){
    if(window.sb) return window.sb;
    if(window.IasharkApp && window.IasharkApp.supabase) return window.IasharkApp.supabase;
    if(!_sbInstance) _sbInstance = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    return _sbInstance;
  }

  function truncateEmail(email){
    if(!email) return '';
    var local = email.split('@')[0];
    return local.length > 14 ? local.slice(0,14)+'…' : local;
  }

  function chipLabel(identity, plan, role){
    var tag = role==='admin' ? 'ADMIN' : (plan==='pro' ? 'PRO' : 'GRATUIT');
    return truncateEmail(identity)+' · '+tag;
  }

  function loggedOutHtml(){
    return '<button type="button" class="btn-login" id="quickLoginBtn" onclick="IasharkAuthHeader.togglePopover()">'+T.login_btn+'</button>';
  }

  function loggedInHtml(identity, plan, role){
    return '<a href="/compte.html" class="btn-login">'+chipLabel(identity, plan, role)+'</a>';
  }

  var POPOVER_CSS = '.iashark-login-pop{position:fixed;top:60px;right:16px;z-index:300;background:#0d1520;'
    +'border:1px solid rgba(34,211,238,0.18);border-radius:14px;padding:20px 18px 16px;width:240px;'
    +'box-shadow:0 16px 40px rgba(0,0,0,0.55);display:none;}'
    +'.iashark-login-pop.open{display:block;}'
    +'.iashark-login-pop .lbl{font-family:"Space Mono",monospace;font-size:9px;letter-spacing:1.5px;color:#4a6580;margin-bottom:12px;}'
    +'.iashark-login-pop input{width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);'
    +'border-radius:10px;padding:10px 12px;color:#e2e8f0;font-family:"DM Sans",sans-serif;font-size:13px;outline:none;'
    +'margin-bottom:9px;box-sizing:border-box;}'
    +'.iashark-login-pop input:focus{border-color:#22d3ee;}'
    +'.iashark-login-pop button.submit{width:100%;padding:11px;border-radius:10px;border:1px solid rgba(34,211,238,0.25);'
    +'background:rgba(34,211,238,0.1);color:#22d3ee;font-family:"Space Mono",monospace;font-size:10px;'
    +'letter-spacing:1.5px;cursor:pointer;}'
    +'.iashark-login-pop button.submit:disabled{opacity:0.5;cursor:not-allowed;}'
    +'.iashark-login-pop .qmsg{font-size:11.5px;margin-top:8px;color:#4a6580;min-height:14px;}'
    +'.iashark-login-pop .qmsg.error{color:#ef4444;}'
    +'.iashark-login-pop .qmsg.success{color:#10b981;}'
    +'.iashark-login-pop .foot{font-family:"Space Mono",monospace;font-size:9px;color:#4a6580;text-align:center;margin-top:12px;}'
    +'.iashark-login-pop .foot a{color:#22d3ee;text-decoration:none;}'
    +'.iashark-login-pop .close{position:absolute;top:8px;right:10px;background:none;border:none;color:#4a6580;font-size:14px;cursor:pointer;line-height:1;}';

  function popoverHtml(){
    return '<button type="button" class="close" onclick="IasharkAuthHeader.closePopover()">✕</button>'
      +'<div class="lbl">'+T.quick_login_title+'</div>'
      +'<input type="email" id="quickLoginEmail" placeholder="'+T.email_placeholder+'" autocomplete="email">'
      +'<input type="password" id="quickLoginPwd" placeholder="'+T.password_placeholder+'" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')IasharkAuthHeader.quickLogin()">'
      +'<button type="button" class="submit" id="quickLoginSubmit" onclick="IasharkAuthHeader.quickLogin()">'+T.submit_login+'</button>'
      +'<div class="qmsg" id="quickLoginMsg"></div>'
      +'<div class="foot">'+T.no_account_label+' <a href="/compte.html">'+T.signup_link+'</a></div>';
  }

  function injectStyle(){
    if(document.getElementById('iashark-auth-style')) return;
    var s = document.createElement('style');
    s.id = 'iashark-auth-style';
    s.textContent = POPOVER_CSS;
    document.head.appendChild(s);
  }

  function ensurePopover(){
    var pop = document.getElementById('quickLoginPopover');
    if(pop) return pop;
    injectStyle();
    pop = document.createElement('div');
    pop.id = 'quickLoginPopover';
    pop.className = 'iashark-login-pop';
    pop.innerHTML = popoverHtml();
    document.body.appendChild(pop);
    document.addEventListener('click', function(e){
      if(pop.classList.contains('open') && !pop.contains(e.target) && e.target.id!=='quickLoginBtn'){
        pop.classList.remove('open');
      }
    });
    return pop;
  }

  function togglePopover(){
    var pop = ensurePopover();
    pop.classList.toggle('open');
    if(pop.classList.contains('open')) document.getElementById('quickLoginEmail').focus();
  }

  function closePopover(){
    var pop = document.getElementById('quickLoginPopover');
    if(pop) pop.classList.remove('open');
  }

  async function quickLogin(){
    var email = document.getElementById('quickLoginEmail').value.trim();
    var pwd = document.getElementById('quickLoginPwd').value;
    var msgEl = document.getElementById('quickLoginMsg');
    var btn = document.getElementById('quickLoginSubmit');
    if(!email || !pwd){
      msgEl.textContent = T.fill_both_fields;
      msgEl.className = 'qmsg error';
      return;
    }
    btn.disabled = true; btn.textContent = T.submit_login_loading;
    msgEl.textContent = ''; msgEl.className = 'qmsg';
    try{
      var sb = getSb();
      var res;
      try{
        var r = await fetch(SUPA_URL+'/functions/v1/login-guard', {
          method:'POST',
          headers:{'Content-Type':'application/json','apikey':SUPA_KEY},
          body:JSON.stringify({email:email, password:pwd})
        });
        var j = await r.json();
        if(r.status===429){
          msgEl.textContent = j.message || T.too_many_attempts;
          msgEl.className = 'qmsg error';
          btn.disabled = false; btn.textContent = T.submit_login;
          return;
        }
        if(!r.ok) throw {message: j.msg||j.error_description||j.error||T.generic_login_error};
        var setRes = await sb.auth.setSession({access_token:j.access_token, refresh_token:j.refresh_token});
        if(setRes.error) throw setRes.error;
        res = {error:null};
      }catch(guardErr){
        if(guardErr && guardErr.message && guardErr.message!=='Failed to fetch'){ throw guardErr; }
        res = await sb.auth.signInWithPassword({email: email, password: pwd});
        if(res.error) throw res.error;
      }
      msgEl.textContent = T.connected_reloading;
      msgEl.className = 'qmsg success';
      setTimeout(function(){ window.location.reload(); }, 500);
    }catch(e){
      var m = e.message || T.generic_login_error;
      if(m.includes('Invalid login')) m = T.invalid_login;
      if(m.includes('Email not confirmed')) m = T.confirm_email;
      msgEl.textContent = m;
      msgEl.className = 'qmsg error';
      btn.disabled = false; btn.textContent = T.submit_login;
    }
  }

  async function mount(selector){
    var el = document.querySelector(selector);
    if(!el) return;
    await loadT();
    try{
      var sb = getSb();
      var sessRes = await sb.auth.getSession();
      var session = sessRes.data && sessRes.data.session;
      if(!session){ el.innerHTML = loggedOutHtml(); return; }
      var ures = await sb.from('users').select('plan,role').eq('id', session.user.id).maybeSingle();
      var plan = ures.data && ures.data.plan ? ures.data.plan : 'free';
      var role = ures.data && ures.data.role;
      var meta=session.user.user_metadata||{};
      var identity=meta.username||meta.display_name||meta.full_name||meta.name||session.user.email;
      el.innerHTML = loggedInHtml(identity, plan, role);
      sb.auth.onAuthStateChange(function(event, newSession){
        if(!newSession){ el.innerHTML = loggedOutHtml(); }
      });
    }catch(e){
      el.innerHTML = loggedOutHtml();
    }
  }

  window.IasharkAuthHeader = {
    truncateEmail: truncateEmail,
    chipLabel: chipLabel,
    mount: mount,
    togglePopover: togglePopover,
    closePopover: closePopover,
    quickLogin: quickLogin
  };
})();
