/* =========================================================================
   IASHARK — « Buteurs du jour » sur l'accueil (window.IasharkHomeScorers).
   19/09/2026. Monte par index.html (source des 9 accueils) ; styles :
   assets/home-scorers.css ; donnees : /buteurs-du-jour.json, ecrit chaque jour
   par le pipeline (lib/buteurs-du-jour.js#buildDailyFile).

   REGLES :
   - Tunnel de vente (decision du proprietaire, 19/09/2026) : un non-abonne,
     meme inscrit, ne voit NI les joueurs NI les chiffres. Le fichier public
     ne porte que match, competition, heure et rang du joueur dans son match
     (lib/buteurs-du-jour.js#PUBLIC_FIELDS) : aucun nom a flouter, rien a
     lire dans le code de la page. Visiteur et compte gratuit voient trois
     lignes floutees (fausses, sans donnee) et un panneau « Débloquer ».
   - Abonne Pro : les donnees premium des 3 matchs sont demandees a la
     fonction match-data (meme appel que la page match) ; joueurs et chiffres
     ne sont affiches que si le SERVEUR confirme le plan (reponse isPro ===
     true), retrouves par lib/buteurs-du-jour.js#resolvePick, le meme calcul
     que la carte « Marchés joueurs » de la page match. Echec : renvoi vers
     la page du match, jamais un joueur devine.
   - Jamais « 0 % » : une probabilite absente ou nulle n'est pas affichee.
   - Jour : le jour de Paris (cle du fichier), puis le suivant present dans le
     fichier ; bascule seul a minuit. Rien a montrer : section masquee.
   - Meme contenu et memes droits sur mobile et sur ordinateur : seule la
     mise en page change (assets/home-scorers.css).
   - 20/09/2026 (docs/SPEC_RESULTATS_HIER.md) : quand l'onglet « Hier » de la
     liste des matchs est ouvert, la section montre les 3 buteurs de la VEILLE
     tels que le flux de resultats les a regles (setResults, appele par
     index.html) : nom visible — le match est termine, plus rien n'est payant —
     et « a marqué » / « n'a pas marqué » avec bordure, fond teinte, libelle et
     icone, jamais la couleur seule. Un buteur dont le resultat n'est pas connu
     n'est pas colore. Aujourd'hui et demain ne changent pas : flou et panneau
     « Débloquer ».
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
// Verdicts de la veille : l'icone double toujours le libelle (WCAG 1.4.1).
var ICON_OK='<svg class="hs-v-ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M3.4 8.6l3 3 6.2-7.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
var ICON_KO='<svg class="hs-v-ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>';
var ICON_WAIT='<svg class="hs-v-ico" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.8v3.4l2.2 1.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

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
    // Joueur (identite + chiffres) designe par {match_id, match_rank}, sur les
    // donnees premium de son match.
    resolve:function(raw,rank){var B=root.IasharkButeursDuJour;return B&&B.resolvePick?B.resolvePick(raw,rank):null;}
  };
}

/* ---------- Donnees ---------- */
// Entree publique exploitable : match + rang du joueur dans ce match. Aucun
// nom, aucune photo, aucune equipe (voir l'en-tete). Tout autre champ est ignore.
function cleanEntry(p){
  if(!p||typeof p!=='object')return null;
  var mid=p.match_id!=null&&String(p.match_id).trim()?String(p.match_id).trim():null;
  var rank=num(p.match_rank);
  if(!mid||!/^\d{1,12}$/.test(mid)||rank===null||rank<0||Math.floor(rank)!==rank)return null;
  return {match_id:mid,match_rank:rank,league:text(p.league),league_key:text(p.league_key),league_id:num(p.league_id),kickoff:text(p.kickoff)};
}
// Jour a montrer : aujourd'hui (Paris) s'il a des entrees, sinon le premier
// jour suivant present dans le fichier. null : rien a montrer.
function pickDay(file,today){
  var days=file&&file.days&&typeof file.days==='object'?file.days:null;
  if(!days)return null;
  var keys=Object.keys(days).filter(function(k){return /^\d{4}-\d{2}-\d{2}$/.test(k)&&k>=String(today||'');}).sort();
  for(var i=0;i<keys.length;i++){
    var entries=(Array.isArray(days[keys[i]])?days[keys[i]]:[]).map(cleanEntry).filter(Boolean).slice(0,LIMIT);
    if(entries.length)return {day:keys[i],players:entries};
  }
  return null;
}
function numbersKey(day,e){return day+'|'+e.match_id+'|'+e.match_rank;}
// Joueur Pro affichable : nom et probabilite > 0 obligatoires (jamais « 0 % »).
function usableNumbers(n){
  var p=n?num(n.displayProbability):null;
  return p!==null&&p>0&&text(n.name)?n:null;
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

var GHOST='<svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><circle cx="20" cy="15" r="7" fill="currentColor"/><path d="M6 36c1.8-7.4 7.2-11 14-11s12.2 3.6 14 11" fill="currentColor"/></svg>';
// Ligne sans joueur : 'pending' (droits ou donnees en cours), 'locked'
// (non-abonne : faux contenu floute, AUCUNE donnee reelle du joueur, clic ->
// offre Pro), 'unavailable' (Pro, joueur introuvable : renvoi vers le match).
function renderTeaser(e,index,state,H,clock){
  var league=H.leagueName(e)||'';
  var when=kickoffLabel(e,H,clock);
  var iso=H.kickoffIso(e);
  var timeHtml=when?'<time'+(iso?' datetime="'+esc(iso)+'"':'')+'>'+esc(when)+'</time>':'';
  var rank='<span class="hs-rank" aria-hidden="true">'+pad(index+1)+'</span>';
  if(state==='unavailable'){
    return '<li class="hs-card"><a class="hs-link" href="'+esc(H.matchHref(e))+'" data-track="home_scorers_card" data-track-kind="home_scorers_card">'
      +rank+'<span class="hs-photo-wrap"><span class="hs-photo hs-ghost" aria-hidden="true">'+GHOST+'</span></span>'
      +'<span class="hs-id"><span class="hs-name">'+esc(t('home_scorers.pro_unavailable','Probabilité à voir sur la page du match'))+'</span>'
      +'<span class="hs-meta">'+timeHtml+'</span>'+(league?'<span class="hs-club"><span class="hs-league">'+esc(league)+'</span></span>':'')+'</span>'
      +'<span class="hs-zone is-locked"><span class="hs-lock is-pro">'+esc(t('home_scorers.view_match','Voir le match'))+' →</span></span>'
      +'</a></li>';
  }
  var locked=state==='locked';
  var inner=rank
    +'<span class="hs-photo-wrap"><span class="hs-photo hs-ghost" aria-hidden="true">'+GHOST+'</span></span>'
    +'<span class="hs-id">'
      +(locked
        ?'<span class="hs-name hs-blurred" aria-hidden="true">'+(index===0?'Xxxxxxx':index===1?'Xx. Xxxxxx':'Xxxxxx Xx')+'</span>'
          +'<span class="sr-only">'+esc(t('home_scorers.hidden_player','Joueur réservé aux abonnés Pro'))+'</span>'
          +'<span class="hs-meta"><span class="hs-vs hs-blurred" aria-hidden="true">xxxxxx Xxxxxxx</span>'+(timeHtml?'<span class="hs-dot" aria-hidden="true">·</span>'+timeHtml:'')+'</span>'
        :'<span class="hs-sk hs-sk-n" aria-hidden="true"></span>'
          +'<span class="hs-meta">'+timeHtml+'</span>')
      +(league?'<span class="hs-club"><span class="hs-league">'+esc(league)+'</span></span>':'')
    +'</span>'
    +(locked
      ?'<span class="hs-zone is-locked"><span class="hs-prob-fake hs-blurred" aria-hidden="true">??,? %</span><span class="hs-pro-tag" aria-hidden="true">'+LOCK+'Pro</span>'
        +'<span class="hs-gauge is-empty" aria-hidden="true"></span>'
        +'<span class="hs-lock sr-only">'+esc(t('home_scorers.locked','Probabilité réservée aux abonnés Pro'))+'</span></span>'
      :renderZone('pending',null));
  if(locked){
    return '<li class="hs-card is-locked"><a class="hs-link" href="'+esc(H.proHref())+'" data-vente data-track="home_scorers_locked_row" data-track-kind="home_scorers_locked_row">'+inner+'</a></li>';
  }
  return '<li class="hs-card" aria-hidden="true"><div class="hs-link">'+inner+'</div></li>';
}

// Panneau « Débloquer » pose sur les lignes floutees (non-abonne).
function renderGate(){
  return '<div class="hs-gate-card">'
    +'<span class="hs-gate-lock" aria-hidden="true">'+LOCK+'</span>'
    +'<div class="hs-gate-copy"><p class="hs-gate-title">'+esc(t('home_scorers.gate_title','Débloque les 3 buteurs du jour'))+'</p>'
    +'<p class="hs-gate-text">'+esc(t('home_scorers.gate_text','Noms, probabilité de marquer et temps de jeu attendu : réservés aux abonnés Pro.'))+'</p></div>'
    +'<div class="hs-gate-action"><a class="hs-gate-cta" href="'+esc(lien('abonnement.html'))+'" data-vente data-track="home_scorers_unlock" data-track-kind="home_scorers_unlock">'
      +esc(t('home_scorers.gate_cta','Débloquer avec Pro'))+' <span aria-hidden="true">→</span></a>'
    +'<p class="hs-gate-small">'+esc(t('home_scorers.gate_small','Résiliable à tout moment depuis ton compte.'))+'</p></div>'
    +'</div>';
}

/* ---------- Buteurs de la veille (flux de resultats) ----------
   Entrees {match_id, match, player, goals, result} de results/<jour>.json,
   transmises par la liste des matchs (home-list.js) quand l'onglet Hier est
   ouvert. Le match est termine : plus rien n'est payant, le nom s'affiche pour
   tout le monde. Un buteur dont le resultat n'est pas connu reste neutre. */
var SCORER_RESULTS=['win','loss','void','pending'];
function cleanScorer(s){
  var mid=s&&s.match_id!=null&&/^\d{1,12}$/.test(String(s.match_id))?String(s.match_id):null;
  var name=s?text(s.player)||text(s.name):null;
  if(!mid||!name)return null;
  var r=String(s.result||'').toLowerCase();
  return {match_id:mid,match:text(s.match)||'',player:name,goals:num(s.goals),
    result:SCORER_RESULTS.indexOf(r)!==-1?r:'pending'};
}
function cleanScorers(list){
  var out=[];
  (Array.isArray(list)?list:[]).forEach(function(s){var c=cleanScorer(s);if(c)out.push(c);});
  return out.slice(0,LIMIT);
}
var SCORER_VERDICT={win:['home_scorers.res_scored','A marqué',ICON_OK],
  loss:['home_scorers.res_missed','N’a pas marqué',ICON_KO],
  'void':['home_scorers.res_void','Match annulé',ICON_WAIT],
  pending:['home_scorers.res_wait','En attente',ICON_WAIT]};
function scorerVerdict(r){return SCORER_VERDICT[r]?r:'pending';}
// Jamais la couleur seule : bordure, fond teinte, libelle ET icone.
function renderScorerVerdict(r){
  var v=SCORER_VERDICT[r];
  return '<span class="hs-zone hs-vzone"><span class="hs-verdict is-'+r+'">'+v[2]
    +'<span class="hs-verdict-t">'+esc(t(v[0],v[1]))+'</span></span></span>';
}
function goalsHtml(s){
  var g=num(s.goals);
  if(s.result!=='win'||g===null||g<=0)return '';
  return '<span class="hs-stats"><span>'+esc(g===1?t('home_scorers.goals_one','1 but'):tf('home_scorers.goals_many','{n} buts',{n:g}))+'</span></span>';
}
function renderResultCard(s,index,H){
  var r=scorerVerdict(s.result);
  return '<li class="hs-card hs-rcard is-'+r+'" data-hs-match="'+esc(s.match_id)+'">'
    +'<a class="hs-link" href="'+esc(H.matchHref(s))+'" data-track="home_scorers_result" data-track-kind="home_scorers_result">'
    +'<span class="hs-rank" aria-hidden="true">'+pad(index+1)+'</span>'
    +'<span class="hs-photo-wrap"><span class="hs-photo hs-avatar" aria-hidden="true">'+esc(initials(s.player))+'</span></span>'
    +'<span class="hs-id"><h3 class="hs-name">'+esc(s.player)+'</h3>'
    +(s.match?'<span class="hs-meta"><span class="hs-vs">'+esc(s.match)+'</span></span>':'')
    +goalsHtml(s)+'</span>'
    +renderScorerVerdict(r)
    +'<span class="sr-only">'+esc(t('home_scorers.view_match','Voir le match'))+'</span>'
    +'</a></li>';
}
function renderResultList(list,H){
  return cleanScorers(list).map(function(s,i){return renderResultCard(s,i,H);}).join('');
}

function renderFoot(viewer){
  var pro=!!(viewer&&viewer.isPro);
  var note='<p class="hs-note">'+esc(pro?t('home_scorers.note_pro','Estimation avant les compositions officielles, jamais une garantie. Même calcul que la carte « Marchés joueurs » de chaque match.'):t('home_scorers.note','Estimation avant les compositions officielles, jamais une garantie.'))+'</p>';
  return note;
}

function subtitleFor(day,today,H){
  if(day===today)return t('home_scorers.subtitle','Les 3 joueurs les plus susceptibles de marquer aujourd’hui, avant les compositions.');
  if(day===addDays(today,1))return t('home_scorers.subtitle_tomorrow','Les 3 joueurs les plus susceptibles de marquer demain, avant les compositions.');
  return tf('home_scorers.subtitle_date','Les 3 joueurs les plus susceptibles de marquer le {date}, avant les compositions.',{date:H.formatDay(day)});
}

// Ordre d'affichage : celui du fichier ; pour un Pro dont les 3 joueurs sont
// retrouves, du plus probable au moins probable (memes chiffres que la page match).
function orderResolved(rows){
  if(!rows.every(function(r){return r.player;}))return rows;
  return rows.map(function(r,i){return {r:r,i:i};}).sort(function(a,b){
    var d=Number(b.r.player.displayProbability)-Number(a.r.player.displayProbability);
    return d||a.i-b.i;
  }).map(function(x){return x.r;});
}

function renderList(entries,viewer,premium,resolvedOf,H,clock){
  if(!viewer)return entries.map(function(e,i){return renderTeaser(e,i,'pending',H,clock);}).join('');
  if(!viewer.isPro)return entries.map(function(e,i){return renderTeaser(e,i,'locked',H,clock);}).join('');
  if(premium!=='done')return entries.map(function(e,i){return renderTeaser(e,i,'pending',H,clock);}).join('');
  var rows=orderResolved(entries.map(function(e){return {e:e,player:usableNumbers(resolvedOf(e))};}));
  return rows.map(function(r,i){
    return r.player?renderCard(r.player,i,'numbers',r.player,H,clock):renderTeaser(r.e,i,'unavailable',H,clock);
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
  var listEl=el.querySelector('[data-hs-list]'),subEl=el.querySelector('[data-hs-sub]'),footEl=el.querySelector('[data-hs-foot]'),gateEl=el.querySelector('[data-hs-gate]');
  // Libelle de la liste du jour (« du plus probable au moins probable ») :
  // faux pour la veille, donc remplace puis remis.
  var listAria=listEl?listEl.getAttribute('aria-label'):null;
  var state={file:null,loaded:false,viewer:null,numbers:{},premiumDay:null,premium:null,today:null,
    resultsDay:null,results:[]};
  function numbersOf(day){return function(p){return state.numbers[numbersKey(day,p)]||null;};}

  function render(){
    // Onglet Hier ouvert et buteurs regles connus : la section montre la
    // veille. Sans buteur regle, rien n'est invente : elle garde son contenu
    // du jour.
    if(state.resultsDay&&state.results.length){
      el.hidden=false;
      el.classList.remove('is-locked');
      el.classList.add('is-results');
      if(listEl){
        listEl.innerHTML=renderResultList(state.results,H);
        listEl.setAttribute('aria-busy','false');
        // « du plus probable au moins probable » ne veut plus rien dire ici.
        listEl.setAttribute('aria-label',t('home_scorers.list_aria_results','Buteurs suivis la veille et ce qu’ils ont fait'));
      }
      if(subEl)subEl.textContent=t('home_scorers.subtitle_yesterday','Les 3 joueurs suivis hier, et ce qu’ils ont fait.');
      if(footEl)footEl.innerHTML='<p class="hs-note">'+esc(t('home_scorers.note_results','Résultats de la veille, publiés tels quels. Les résultats passés ne préjugent pas des résultats futurs.'))+'</p>';
      if(gateEl){gateEl.hidden=true;gateEl.innerHTML='';}
      return {day:state.resultsDay,players:state.results};
    }
    el.classList.remove('is-results');
    if(listEl&&listAria)listEl.setAttribute('aria-label',listAria);
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
    var locked=!!(state.viewer&&!state.viewer.isPro);
    el.classList.toggle('is-locked',locked);
    if(gateEl){gateEl.hidden=!locked;gateEl.innerHTML=locked?renderGate():'';}
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
        if(raw&&String(raw.id)===String(p.match_id)){try{n=usableNumbers(H.resolve(raw,p.match_rank));}catch(e){n=null;}}
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

  // Buteurs regles d'un jour passe (flux de resultats, transmis par
  // index.html quand l'onglet Hier de la liste des matchs est ouvert).
  // setResults(null) revient au jour courant.
  function setResults(day,list){
    var clean=cleanScorers(list);
    state.results=clean;
    state.resultsDay=(day&&clean.length)?day:null;
    return render();
  }

  return {
    ready:ready,
    setViewer:setViewer,
    setResults:setResults,
    render:render,
    state:state,
    destroy:function(){clearTimeout(viewerTimer);clearInterval(dayTimer);}
  };
}

return {
  FILE_URL:FILE_URL,
  mount:mount,
  pickDay:pickDay,
  cleanEntry:cleanEntry,
  renderCard:renderCard,
  renderZone:renderZone,
  renderTeaser:renderTeaser,
  renderGate:renderGate,
  renderList:renderList,
  renderFoot:renderFoot,
  cleanScorer:cleanScorer,
  cleanScorers:cleanScorers,
  renderResultCard:renderResultCard,
  renderResultList:renderResultList,
  subtitleFor:subtitleFor,
  defaultHelpers:defaultHelpers,
  usableNumbers:usableNumbers,
  pct:pct
};
});
