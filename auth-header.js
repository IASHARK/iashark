/* Header d'authentification partagé — utilisé par index.html, historique.html, pro.html.
   compte.html gère sa propre session mais réutilise chipLabel() pour le même format. */
(function(){
  var SUPA_URL = 'https://ksvjraqitxouwiabecai.supabase.co';
  var SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdmpyYXFpdHhvdXdpYWJlY2FpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3ODcwMjMsImV4cCI6MjA4ODM2MzAyM30.Eh3qk4tATM40hoYxdErAllLEo1y8KNt4BSCET_fAgT8';

  function truncateEmail(email){
    if(!email) return '';
    var local = email.split('@')[0];
    return local.length > 14 ? local.slice(0,14)+'…' : local;
  }

  function chipLabel(email, plan){
    return truncateEmail(email)+' · '+(plan==='pro'?'OUTILS':'GRATUIT');
  }

  function loggedOutHtml(){
    return '<a href="/compte.html" class="btn-login">CONNEXION</a>';
  }

  function loggedInHtml(email, plan){
    return '<a href="/compte.html" class="btn-login">'+chipLabel(email, plan)+'</a>';
  }

  async function mount(selector){
    var el = document.querySelector(selector);
    if(!el) return;
    try{
      var sb = window.sb || window.supabase.createClient(SUPA_URL, SUPA_KEY);
      var sessRes = await sb.auth.getSession();
      var session = sessRes.data && sessRes.data.session;
      if(!session){ el.innerHTML = loggedOutHtml(); return; }
      var ures = await sb.from('users').select('plan').eq('id', session.user.id).maybeSingle();
      var plan = ures.data && ures.data.plan ? ures.data.plan : 'free';
      el.innerHTML = loggedInHtml(session.user.email, plan);
      sb.auth.onAuthStateChange(function(event, newSession){
        if(!newSession){ el.innerHTML = loggedOutHtml(); }
      });
    }catch(e){
      el.innerHTML = loggedOutHtml();
    }
  }

  window.IasharkAuthHeader = { truncateEmail: truncateEmail, chipLabel: chipLabel, mount: mount };
})();
