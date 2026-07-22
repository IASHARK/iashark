/* Header d'authentification partagé — utilisé par index.html, historique.html, pro.html.
   compte.html gère sa propre session mais réutilise chipLabel() pour le même format. */
(function(){
  var SUPA_URL = 'https://ksvjraqitxouwiabecai.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8';

  var _sbInstance = null;
  function getSb(){
    if(window.sb) return window.sb;
    if(!_sbInstance) _sbInstance = window.supabase.createClient(SUPA_URL, SUPA_KEY);
    return _sbInstance;
  }

  function truncateEmail(email){
    if(!email) return '';
    var local = email.split('@')[0];
    return local.length > 14 ? local.slice(0,14)+'…' : local;
  }

  function chipLabel(email, plan, role){
    var tag = role==='admin' ? 'ADMIN' : (plan==='pro' ? 'OUTILS' : 'GRATUIT');
    return truncateEmail(email)+' · '+tag;
  }

  function loggedOutHtml(){
    return '<button type="button" class="btn-login" id="quickLoginBtn" onclick="IasharkAuthHeader.togglePopover()">CONNEXION</button>';
  }

  function loggedInHtml(email, plan, role){
    return '<a href="/compte.html" class="btn-login">'+chipLabel(email, plan, role)+'</a>';
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

  var POPOVER_HTML = '<button type="button" class="close" onclick="IasharkAuthHeader.closePopover()">✕</button>'
    +'<div class="lbl">CONNEXION RAPIDE</div>'
    +'<input type="email" id="quickLoginEmail" placeholder="ton@email.com" autocomplete="email">'
    +'<input type="password" id="quickLoginPwd" placeholder="Mot de passe" autocomplete="current-password" onkeydown="if(event.key===\'Enter\')IasharkAuthHeader.quickLogin()">'
    +'<button type="button" class="submit" id="quickLoginSubmit" onclick="IasharkAuthHeader.quickLogin()">SE CONNECTER →</button>'
    +'<div class="qmsg" id="quickLoginMsg"></div>'
    +'<div class="foot">Pas de compte ? <a href="/compte.html">Inscription</a></div>';

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
    pop.innerHTML = POPOVER_HTML;
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
      msgEl.textContent = 'Remplis les deux champs.';
      msgEl.className = 'qmsg error';
      return;
    }
    btn.disabled = true; btn.textContent = 'CONNEXION...';
    msgEl.textContent = ''; msgEl.className = 'qmsg';
    try{
      var sb = getSb();
      var res = await sb.auth.signInWithPassword({email: email, password: pwd});
      if(res.error) throw res.error;
      msgEl.textContent = 'Connecté ! Rechargement...';
      msgEl.className = 'qmsg success';
      setTimeout(function(){ window.location.reload(); }, 500);
    }catch(e){
      var m = e.message || 'Erreur de connexion';
      if(m.includes('Invalid login')) m = 'Email ou mot de passe incorrect.';
      if(m.includes('Email not confirmed')) m = 'Confirme ton email avant de te connecter.';
      msgEl.textContent = m;
      msgEl.className = 'qmsg error';
      btn.disabled = false; btn.textContent = 'SE CONNECTER →';
    }
  }

  async function mount(selector){
    var el = document.querySelector(selector);
    if(!el) return;
    try{
      var sb = getSb();
      var sessRes = await sb.auth.getSession();
      var session = sessRes.data && sessRes.data.session;
      if(!session){ el.innerHTML = loggedOutHtml(); return; }
      var ures = await sb.from('users').select('plan,role').eq('id', session.user.id).maybeSingle();
      var plan = ures.data && ures.data.plan ? ures.data.plan : 'free';
      var role = ures.data && ures.data.role;
      el.innerHTML = loggedInHtml(session.user.email, plan, role);
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
