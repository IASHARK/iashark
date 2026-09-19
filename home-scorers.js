/* =========================================================================
   IASHARK — « Buteurs du jour » sur l'accueil (window.IasharkHomeScorers).
   19/09/2026. Monte par index.html (source des 9 accueils) ; styles :
   assets/home-scorers.css ; donnees : /buteurs-du-jour.json, ecrit chaque jour
   par le pipeline (lib/buteurs-du-jour.js#buildDailyFile).

   REGLES :
   - Le fichier public ne contient AUCUNE probabilite : identite des 3 joueurs
     et de leur match (lib/buteurs-du-jour.js#PUBLIC_FIELDS). Visiteur et
     compte gratuit voient un verrou « Probabilité réservée aux abonnés Pro ».
   - Abonne Pro : les donnees premium des 3 matchs sont demandees a la
     fonction match-data (meme appel que la page match) ; les chiffres ne sont
     affiches que si le SERVEUR confirme le plan (reponse isPro === true), et
     sont recalcules par lib/buteurs-du-jour.js#scorerNumbersFor, le meme
     calcul que la carte « Marchés joueurs » de la page match. Echec : verrou.
   - Jamais « 0 % » : une probabilite absente ou nulle n'est pas affichee.
   - Jour : le jour de Paris (cle du fichier), puis le suivant present dans le
     fichier ; bascule seul a minuit. Rien a montrer : section masquee.
   - Meme contenu et memes droits sur mobile et sur ordinateur : seule la
     mise en page change (assets/home-scorers.css).
   ========================================================================= */
(function(root,factory){
  var api=factory(root||{});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkHomeScorers=api;
})(typeof window!=='undefined'?window:null,function(root){
'use strict';

var FILE_URL='/buteurs-du-jour.json';
var LIMIT=3;
var VIEWER_TIMEOUT_MS=8000;

/* ---------- i18n (memes helpers qu'index.html et home-list.js) ---------- */
function t(key,fb){return (root.I18N&&root.I18N.t)?root.I18N.t(key,fb):fb;}
function tf(key,fb,vars){var s=String(t(key,fb));return vars?s.replace(/\{(\w+)\}/g,function(m,k){return vars[k]!=null?vars[k]:m;}):s;}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function localeTag(){return (root.I18N&&root.I18N.localeTag)?root.I18N.localeTag():'fr-FR';}
function lien(p){return (root.I18N&&root.I18N.href)?root.I18N.href(p):'/'+p;}

var LOCK='<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="3" y="7" width="10" height="7" rx="1.6" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 015.6 0V7" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>';

function text(v){return typeof v==='string'&&v.trim()?v.trim():null;}
function num(v){return v==null||v===''||!isFinite(Number(v))?null:Number(v);}
function pad(n){return (n<10?'0':'')+n;}
function parisDayOf(date){
  try{
    var p={};
    new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).forEach(function(x){p[x.type]=x.value;});
    return p.year+'-'+p.month+'-'+p.day;
  }catch(e){return date.getUTCFullYear()+'-'+pad(date.getUTCMonth()+1)+'-'+pad(date.getUTCDate());}
}

/* ---------- Helpers injectables (index.html) ; replis = libs du depot ---------- */
function defaultHelpers(){
  var MT=root.IasharkMatchTime,LN=root.IasharkLeagueNames;
  var kick=function(p){return {date:p&&p.kickoff};};
  return {
    now:function(){return new Date();},
    // Cle du fichier : jour de Paris.
    parisToday:function(){return parisDayOf(this.now());},
    // Jour du VISITEUR (fuseau du navigateur) : libelle « Demain » d'une carte.
    visitorClock:function(){if(MT)return MT.localClock(this.now());var d=parisDayOf(this.now());return {day:d,tomorrow:''};},
    leagueName:function(p){var k=String(p&&p.league_key||'').toLowerCase();return (LN&&k?LN.displayName(k):null)||text(p&&p.league)||'';},
    time:function(p){return MT?MT.formatTime(kick(p),localeTag()):String(p&&p.kickoff||'').slice(11,16);},
    kickoffIso:function(p){var d=MT?MT.matchDate(kick(p)):null;return d&&!isNaN(d.getTime())?d.toISOString():'';},
    kickoffDay:function(p){return MT?MT.matchDay(kick(p)):String(p&&p.kickoff||'').slice(0,10);},
    formatDate:function(p){return MT?MT.formatDate(kick(p),localeTag()):String(p&&p.kickoff||'').slice(0,10);},
    formatDay:function(day){
      try{var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(day);if(!m)return day;
        return new Intl.DateTimeFormat(localeTag(),{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(Date.UTC(+m[1],+m[2]-1,+m[3],12)));}
      catch(e){return day;}
    },
    matchHref:function(p){return lien('match.html?id='+encodeURIComponent(p.match_id));},
    proHref:function(){return lien('abonnement.html');},
    teamLogo:function(p){var id=num(p&&p.team_id);return id!==null?'https://media.api-sports.io/football/teams/'+id+'.png':'';},
    // Chiffres d'un joueur sur les donnees premium de son match.
    numbersFor:function(raw,playerId){var B=root.IasharkButeursDuJour;return B&&B.scorerNumbersFor?B.scorerNumbersFor(raw,playerId):null;}
  };
}

/* ---------- Donnees ---------- */
// Entree publique exploitable : joueur, nom, match. Tout autre champ est ignore.
function cleanPlayer(p){
  if(!p||typeof p!=='object')return null;
  var id=num(p.player_id),name=text(p.name),mid=p.match_id!=null&&String(p.match_id).trim()?String(p.match_id).trim():null;
  if(id===null||!name||!mid||!/^\d{1,12}$/.test(mid))return null;
  return {player_id:id,name:name,photo:text(p.photo),team:text(p.team)||'',team_id:num(p.team_id),opponent:text(p.opponent)||'',
    match_id:mid,league:text(p.league),league_key:text(p.league_key),league_id:num(p.league_id),kickoff:text(p.kickoff),is_home:p.is_home===true};
}
// Jour a montrer : aujourd'hui (Paris) s'il a des joueurs, sinon le premier
// jour suivant present dans le fichier. null : rien a montrer.
function pickDay(file,today){
  var days=file&&file.days&&typeof file.days==='object'?file.days:null;
  if(!days)return null;
  var keys=Object.keys(days).filter(function(k){return /^\d{4}-\d{2}-\d{2}$/.test(k)&&k>=String(today||'');}).sort();
  for(var i=0;i<keys.length;i++){
    var players=(Array.isArray(days[keys[i]])?days[keys[i]]:[]).map(cleanPlayer).filter(Boolean).slice(0,LIMIT);
    if(players.length)return {day:keys[i],players:players};
  }
  return null;
}
function numbersKey(day,p){return day+'|'+p.match_id+'|'+p.player_id;}
// Chiffres affichables : probabilite > 0 obligatoire (jamais « 0 % »).
function usableNumbers(n){
  var p=n?num(n.displayProbability):null;
  return p!==null&&p>0?n:null;
}

/* ---------- Rendu ---------- */
function pct(v){
  var x=Number(v);
  try{return (x/100).toLocaleString(localeTag(),{style:'percent',maximumFractionDigits:1});}
  catch(e){return (Math.round(x*10)/10)+' %';}
}
// Texte traduit echappe, variables HTML deja sures inserees ensuite.
function tfHtml(key,fb,varsHtml){return esc(String(t(key,fb))).replace(/\{(\w+)\}/g,function(m,k){return varsHtml[k]!=null?varsHtml[k]:m;});}
function addDays(day,n){
  var m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day||''));
  if(!m)return '';
  var d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3]+n));
  return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
}
function initials(name){
  var parts=String(name||'').split(/[\s.]+/).filter(Boolean);
  var s=parts.length>1?parts[0].charAt(0)+parts[parts.length-1].charAt(0):String(name||'?').slice(0,2);
  return s.toUpperCase();
}
function kickoffLabel(p,H,clock){
  var time=H.time(p)||'';
  var day=H.kickoffDay(p);
  if(!day||!clock||day===clock.day)return time;
  var prefix=clock.tomorrow&&day===clock.tomorrow?t('home_scorers.tomorrow','Demain'):H.formatDate(p);
  return prefix?prefix+' · '+time:time;
}

// Zone de droite : 'pending' (droits en cours de verification), 'locked'
// (visiteur, compte gratuit), 'numbers' (Pro confirme), 'unavailable' (Pro,
// donnees indisponibles : renvoi vers le match, sans offre commerciale).
// Design fin (19/09/2026, retour du proprietaire : « pas de grosses cases ») :
// une ligne par joueur, la probabilite a droite avec une jauge fine. Largeur
// et hauteur fixes dans les 4 etats : rien ne bouge au chargement.
function renderZone(state,n){
  var label='<span class="sr-only">'+esc(t('home_scorers.prob_label','Probabilité de marquer'))+' : </span>';
  if(state==='numbers'&&usableNumbers(n)){
    var prob=Number(n.displayProbability);
    var width=Math.max(0,Math.min(100,prob));
    return '<span class="hs-zone is-numbers">'+label
      +'<b class="hs-prob-val">'+esc(pct(prob))+'</b>'
      +'<span class="hs-gauge" aria-hidden="true"><i style="width:'+width+'%"></i></span>'
      +'</span>';
  }
  if(state==='pending'){
    return '<span class="hs-zone is-pending"><span class="hs-sk hs-sk-v" aria-hidden="true"></span>'
      +'<span class="hs-gauge is-empty" aria-hidden="true"></span>'
      +'<span class="sr-only">'+esc(t('home_scorers.loading','Chargement de la probabilité…'))+'</span></span>';
  }
  if(state==='unavailable'){
    return '<span class="hs-zone is-locked"><span class="hs-lock is-pro">'+esc(t('home_scorers.pro_unavailable','Probabilité à voir sur la page du match'))+'</span>'
      +'<span class="hs-gauge is-empty" aria-hidden="true"></span></span>';
  }
  // Verrou : aucun chiffre, ni vrai ni faux ; le badge Pro et une jauge vide.
  return '<span class="hs-zone is-locked">'
    +'<span class="hs-pro-tag" aria-hidden="true">'+LOCK+'Pro</span>'
    +'<span class="hs-gauge is-empty" aria-hidden="true"></span>'
    +'<span class="hs-lock sr-only">'+esc(t('home_scorers.locked','Probabilité réservée aux abonnés Pro'))+'</span></span>';
}

// Detail Pro sous le nom : titularisations recentes, minutes attendues.
function renderStats(state,n){
  if(state!=='numbers'||!usableNumbers(n))return '';
  var stats=[];
  if(num(n.startsLast)!==null&&num(n.teamMatchesLast)>0)stats.push('<span>'+tfHtml('home_scorers.starts_recent','Titulaire {n}/{total}',{n:'<b>'+esc(num(n.startsLast))+'</b>',total:'<b>'+esc(num(n.teamMatchesLast))+'</b>'})+'</span>');
  if(num(n.expectedMinutes)!==null&&num(n.expectedMinutes)>0)stats.push('<span>'+tfHtml('home_scorers.expected_minutes','≈{n} min',{n:'<b>'+esc(Math.round(num(n.expectedMinutes)))+'</b>'})+'</span>');
  return stats.length?'<span class="hs-stats">'+stats.join('<span class="hs-dot" aria-hidden="true">·</span>')+'</span>':'';
}

function renderCard(p,index,zone,numbers,H,clock){
  var league=H.leagueName(p)||'';
  var when=kickoffLabel(p,H,clock);
  var iso=H.kickoffIso(p);
  var logo=H.teamLogo(p);
  var photo=p.photo
    ?'<img class="hs-photo" src="'+esc(p.photo)+'" width="40" height="40" loading="lazy" decoding="async" alt="'+esc(tf('home_scorers.photo_alt','Photo de {name}',{name:p.name}))+'" data-hs-initials="'+esc(initials(p.name))+'">'
    :'<span class="hs-photo hs-avatar" aria-hidden="true">'+esc(initials(p.name))+'</span>';
  var crest=logo?'<img class="hs-crest" src="'+esc(logo)+'" width="16" height="16" loading="lazy" decoding="async" alt="">':'';
  // Pas d'aria-label sur le lien : il masquerait la probabilite (Pro) ou le
  // verrou aux lecteurs d'ecran. Le contenu se lit tel quel, rang compris
  // (liste ordonnee), suivi de « Voir le match ».
  return '<li class="hs-card" data-hs-player="'+esc(p.player_id)+'" data-hs-match="'+esc(p.match_id)+'">'
    +'<a class="hs-link" href="'+esc(H.matchHref(p))+'" data-track="home_scorers_card" data-track-kind="home_scorers_card">'
    +'<span class="hs-rank" aria-hidden="true">'+pad(index+1)+'</span>'
    +'<span class="hs-photo-wrap">'+photo+crest+'</span>'
    +'<span class="hs-id">'
      +'<h3 class="hs-name">'+esc(p.name)+'</h3>'
      // Ligne 1 : adversaire et heure (l'heure ne se tronque jamais).
      // Ligne 2 : club et competition (les noms s'abregent si besoin).
      +'<span class="hs-meta"><span class="hs-vs">'+esc(tf('home_scorers.opponent_line','contre {opponent}',{opponent:p.opponent}))+'</span>'
        +(when?'<span class="hs-dot" aria-hidden="true">·</span><time'+(iso?' datetime="'+esc(iso)+'"':'')+'>'+esc(when)+'</time>':'')
      +'</span>'
      +'<span class="hs-club"><span class="hs-teams">'+esc(p.team)+'</span>'
        +(league?'<span class="hs-dot" aria-hidden="true">·</span><span class="hs-league">'+esc(league)+'</span>':'')
      +'</span>'
      +renderStats(zone,numbers)
    +'</span>'
    +renderZone(zone,numbers)
    +'<span class="sr-only">'+esc(t('home_scorers.view_match','Voir le match'))+'</span>'
    +'</a></li>';
}

function renderFoot(viewer){
  var pro=!!(viewer&&viewer.isPro);
  var note='<p class="hs-note">'+esc(pro?t('home_scorers.note_pro','Estimation avant les compositions officielles, jamais une garantie. Même calcul que la carte « Marchés joueurs » de chaque match.'):t('home_scorers.note','Estimation avant les compositions officielles, jamais une garantie.'))+'</p>';
  if(pro)return note;
  return note+'<a class="hs-cta" href="'+esc(lien('abonnement.html'))+'" data-vente data-track="home_scorers_upsell" data-track-kind="home_scorers_upsell">'
    +LOCK+'<span>'+esc(t('home_scorers.locked','Probabilité réservée aux abonnés Pro'))+'</span><b>'+esc(t('home_scorers.cta','Voir l’offre Pro'))+' <span aria-hidden="true">→</span></b></a>';
}

function subtitleFor(day,today,H){
  if(day===today)return t('home_scorers.subtitle','Les 3 joueurs les plus susceptibles de marquer aujourd’hui, avant les compositions.');
  if(day===addDays(today,1))return t('home_scorers.subtitle_tomorrow','Les 3 joueurs les plus susceptibles de marquer demain, avant les compositions.');
  return tf('home_scorers.subtitle_date','Les 3 joueurs les plus susceptibles de marquer le {date}, avant les compositions.',{date:H.formatDay(day)});
}

// Etat de la zone chiffree d'une carte.
function zoneState(viewer,premium,numbers){
  if(!viewer)return 'pending';
  if(!viewer.isPro)return 'locked';
  if(premium==='loading')return 'pending';
  return usableNumbers(numbers)?'numbers':'unavailable';
}

// Ordre d'affichage : celui du fichier ; pour un Pro dont les 3 chiffres sont
// connus, du plus probable au moins probable (meme donnees que la page match).
function orderPlayers(players,viewer,numbersOf){
  if(!viewer||!viewer.isPro)return players.slice();
  var all=players.every(function(p){return usableNumbers(numbersOf(p));});
  if(!all)return players.slice();
  return players.map(function(p,i){return {p:p,i:i};}).sort(function(a,b){
    var d=Number(numbersOf(b.p).displayProbability)-Number(numbersOf(a.p).displayProbability);
    return d||a.i-b.i;
  }).map(function(x){return x.p;});
}

function renderList(players,viewer,premium,numbersOf,H,clock){
  return orderPlayers(players,viewer,numbersOf).map(function(p,i){
    var n=numbersOf(p);
    return renderCard(p,i,zoneState(viewer,premium,n),n,H,clock);
  }).join('');
}

/* ---------- Montage ---------- */
function defaultFetchJson(url){
  if(!root.fetch)return Promise.resolve(null);
  return root.fetch(url,{cache:'no-cache'}).then(function(r){return r&&r.ok?r.json():null;}).catch(function(){return null;});
}
// Donnees premium d'UN match pour un abonne : fonction Edge match-data (meme
// appel que la page match). null si le serveur ne confirme pas le plan Pro.
function defaultFetchPremium(id){
  var app=root.IasharkApp;
  if(!app||!app.supabase||!app.supabase.functions)return Promise.resolve(null);
  return app.supabase.functions.invoke('match-data',{body:{id:String(id)}}).then(function(res){
    if(!res||res.error||!res.data||res.data.isPro!==true)return null;
    var list=Array.isArray(res.data.matchs)?res.data.matchs:[];
    return list.filter(function(m){return m&&String(m.id)===String(id);})[0]||null;
  }).catch(function(){return null;});
}

function mount(el,options){
  options=options||{};
  var H=Object.assign(defaultHelpers(),options.helpers||{});
  var fetchJson=options.fetchJson||defaultFetchJson;
  var fetchPremium=options.fetchPremium||defaultFetchPremium;
  var listEl=el.querySelector('[data-hs-list]'),subEl=el.querySelector('[data-hs-sub]'),footEl=el.querySelector('[data-hs-foot]');
  var state={file:null,loaded:false,viewer:null,numbers:{},premiumDay:null,premium:null,today:null};
  function numbersOf(day){return function(p){return state.numbers[numbersKey(day,p)]||null;};}

  function render(){
    if(!state.loaded)return;
    var today=H.parisToday();
    state.today=today;
    var pick=pickDay(state.file,today);
    if(!pick){el.hidden=true;if(listEl)listEl.setAttribute('aria-busy','false');return null;}
    el.hidden=false;
    var premium=state.premiumDay===pick.day?state.premium:(state.viewer&&state.viewer.isPro?'loading':null);
    if(listEl){
      listEl.innerHTML=renderList(pick.players,state.viewer,premium,numbersOf(pick.day),H,H.visitorClock());
      listEl.setAttribute('aria-busy',state.viewer&&!(state.viewer.isPro&&premium==='loading')?'false':'true');
    }
    if(subEl)subEl.textContent=subtitleFor(pick.day,today,H);
    if(footEl)footEl.innerHTML=renderFoot(state.viewer);
    return pick;
  }

  function loadPremium(){
    if(!state.loaded||!state.viewer||!state.viewer.isPro)return Promise.resolve();
    var pick=pickDay(state.file,H.parisToday());
    if(!pick||state.premiumDay===pick.day)return Promise.resolve();
    var day=pick.day;
    state.premiumDay=day;state.premium='loading';
    render();
    var ids=[];
    pick.players.forEach(function(p){if(ids.indexOf(p.match_id)===-1)ids.push(p.match_id);});
    return Promise.all(ids.map(function(id){
      return Promise.resolve().then(function(){return fetchPremium(id);}).catch(function(){return null;});
    })).then(function(raws){
      if(state.premiumDay!==day)return;
      pick.players.forEach(function(p){
        var raw=raws[ids.indexOf(p.match_id)];
        var n=null;
        if(raw&&String(raw.id)===String(p.match_id)){try{n=usableNumbers(H.numbersFor(raw,p.player_id));}catch(e){n=null;}}
        state.numbers[numbersKey(day,p)]=n;
      });
      state.premium='done';
      render();
    });
  }

  // Visiteur connu (index.html, apres IasharkApp.context()) : { session, isPro }.
  function setViewer(v){
    state.viewer={isPro:!!(v&&v.isPro===true),hasSession:!!(v&&v.session)};
    if(!state.viewer.isPro){state.premiumDay=null;state.premium=null;}
    render();
    return loadPremium();
  }

  // Jamais bloque en attente : sans reponse sur les droits, verrou standard.
  var viewerTimer=setTimeout(function(){if(!state.viewer)setViewer({isPro:false});},VIEWER_TIMEOUT_MS);

  // Photo introuvable : initiales a la place, meme taille (aucun decalage).
  el.addEventListener('error',function(ev){
    var img=ev.target;
    if(img&&img.classList&&img.classList.contains('hs-crest')&&img.parentNode){img.parentNode.removeChild(img);return;}
    if(!img||!img.classList||!img.classList.contains('hs-photo')||img.tagName!=='IMG')return;
    var span=el.ownerDocument.createElement('span');
    span.className='hs-photo hs-avatar';
    span.setAttribute('aria-hidden','true');
    span.textContent=img.getAttribute('data-hs-initials')||'';
    if(img.parentNode)img.parentNode.replaceChild(span,img);
  },true);

  var ready=Promise.resolve().then(function(){return fetchJson(FILE_URL);}).catch(function(){return null;}).then(function(file){
    state.file=file&&typeof file==='object'?file:null;
    state.loaded=true;
    render();
    return loadPremium();
  });

  // A minuit (Paris), la liste du jour suivant prend la place, sans rechargement.
  var dayTimer=setInterval(function(){
    if(!state.loaded)return;
    if(H.parisToday()!==state.today){render();loadPremium();}
  },60000);

  return {
    ready:ready,
    setViewer:setViewer,
    render:render,
    state:state,
    destroy:function(){clearTimeout(viewerTimer);clearInterval(dayTimer);}
  };
}

return {
  FILE_URL:FILE_URL,
  mount:mount,
  pickDay:pickDay,
  cleanPlayer:cleanPlayer,
  renderCard:renderCard,
  renderZone:renderZone,
  renderList:renderList,
  renderFoot:renderFoot,
  zoneState:zoneState,
  orderPlayers:orderPlayers,
  subtitleFor:subtitleFor,
  defaultHelpers:defaultHelpers,
  usableNumbers:usableNumbers,
  pct:pct
};
});
