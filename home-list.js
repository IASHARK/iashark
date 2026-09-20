/* =========================================================================
   IASHARK — Liste des matchs de l'accueil (window.IasharkHomeList).
   Maquette v2 validee par le proprietaire (15/09/2026), integree le 16/09,
   simplifiee le 16/09 (demande du proprietaire) : trois onglets, plus de
   banniere, de recherche ni de filtres ; etoile sur chaque competition ET sur
   chaque match ; competitions favorites en tete de la meme liste, matchs
   favoris en tete de leur competition et petite section « Mes matchs » en haut
   s'il y en a.
   Monte par index.html (source des 9 accueils) ; styles : assets/home-list.css.

   20/09/2026 (docs/SPEC_RESULTATS_HIER.md, decision du proprietaire) :
   l'onglet « Apres-demain », toujours vide, est remplace par « Hier ». Ordre
   affiche Hier | Aujourd'hui | Demain, actif par defaut Aujourd'hui.
   L'onglet Hier sert de PREUVE : le marche retenu la veille, sa cote, sa
   source et le verdict, sans clic et sans payer, pertes comprises. Il ne lit
   QUE le flux de resultats (results/<jour>.json, repli Supabase
   match_results) : des matchs termines et regles, jamais un champ payant d'un
   match en cours ou a venir. Un match sans marche retenu (no_signal) n'y
   figure pas, et une entree sans score final n'affiche aucun pari.

   REGLE ABSOLUE : aucune donnee payante (lib/premium-fields.js : conf,
   pari_rec, market_id, cote_rec, probabilites...) n'est lue pour un match
   verrouille. analysisFor() sort AVANT toute lecture de ces champs quand le
   visiteur n'y a pas droit ; la ligne verrouillee n'utilise que des donnees
   publiques : equipes, heure, status, has_signal/no_signal,
   data_quality_label, derby et prob_band (niveau grossier high/good/moderate,
   calcule cote serveur, lib/public-data-split.js#probBand).
   Droit d'ouvrir une analyse : abonne Pro CONFIRME (reponse match-data) ou
   match offert du jour (lib/free-match.js, meme choix que la vitrine) AVEC un
   compte (meme regle que la page match, match-page.js#renderAuthWall) : sans
   compte, la ligne du match offert dit « Analyse offerte · Compte gratuit »
   sans lire le pari ni la note.
   ========================================================================= */
(function(root,factory){
  var api=factory(root||{});
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.IasharkHomeList=api;
})(typeof window!=='undefined'?window:null,function(root){
'use strict';

var DEFAULTS={upsellAfter:3,lockedHref:'match',liveWindowMin:115,staleLiveMin:150,simulations:5000,
  collapsedKey:'iashark.hlCollapsed.v1',
  // Le job de reglement ecrit la table toutes les 30 min en soiree : la page
  // relit le flux au meme rythme, sans rechargement.
  resultsRefreshMs:1800000};
var PROB_BANDS=['high','good','moderate'];

/* ---------- i18n (memes helpers qu'index.html) ---------- */
function t(key,fb){return (root.I18N&&root.I18N.t)?root.I18N.t(key,fb):fb;}
function tf(key,fb,vars){var s=String(t(key,fb));return vars?s.replace(/\{(\w+)\}/g,function(m,k){return vars[k]!=null?vars[k]:m;}):s;}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function localeTag(){return (root.I18N&&root.I18N.localeTag)?root.I18N.localeTag():'fr-FR';}
function lien(p){return (root.I18N&&root.I18N.href)?root.I18N.href(p):'/'+p;}
// Page « tous les resultats » de la version courante (<dir>/resultats/, lot
// R3) : le repertoire vient d'I18N, le lien passe par I18N.href comme les
// autres. Jamais d'URL ecrite en dur ailleurs.
function resultsHref(H){
  var I=root.I18N,d=(I&&(I.linkDir?I.linkDir():I.dir))||'';
  return ((H&&H.lien)||lien)((d?d+'/':'')+'resultats/');
}
function reducedMotion(){return !!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);}

/* ---------- Icones ---------- */
var ICON={
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3L2.8 9.5l6.4-.9z"/></svg>',
  chev:'<svg class="hl-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock:'<svg class="hl-lock-ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.6" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 015.6 0V7" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  cal:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  alert:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l9.5 16.5h-19z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  // Verdicts : l'icone double toujours le libelle et le fond teinte.
  ok:'<svg class="hl-v-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.4 8.6l3 3 6.2-7.2" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ko:'<svg class="hl-v-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
  ban:'<svg class="hl-v-ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.2 11.8l7.6-7.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  wait:'<svg class="hl-v-ico" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="5.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4.8v3.4l2.2 1.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};

/* ---------- Helpers injectables (index.html) ; replis = libs du depot ---------- */
function addDays(day,n){var d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
function defaultHelpers(){
  var MT=root.IasharkMatchTime,LN=root.IasharkLeagueNames,ML=root.IasharkMarketLabels,DD=root.IasharkDisplayData,FM=root.IasharkFreeMatch;
  function key(m){return String(m&&m.league_key||'').toLowerCase();}
  return {
    localClock:function(){if(MT)return MT.localClock();var d=new Date().toISOString();return{day:d.slice(0,10),tomorrow:addDays(d.slice(0,10),1),now:d.slice(0,16).replace('T',' ')};},
    matchDay:function(m){return MT?MT.matchDay(m):String(m&&m.date||'').slice(0,10);},
    matchTimestamp:function(m){return MT?MT.matchTimestamp(m):Date.parse(String(m&&m.date||'').replace(' ','T'));},
    compareMatches:function(a,b){if(MT)return MT.compareMatches(a,b);return String(a.date)<String(b.date)?-1:String(a.date)>String(b.date)?1:0;},
    heure:function(m){var h=MT?MT.formatTime(m,localeTag()):'';return h||(String(m&&m.date||'').split(' ')[1]||'');},
    leagueKey:key,
    leagueName:function(m){var k=key(m);return (LN&&LN.displayName(k))||m.league||k;},
    leagueCountry:function(){return '';},
    leagueFlag:function(){return '';},
    leagueLogoUrl:function(m){var id=m.league_id||(LN?LN.apiFootballId(key(m)):null);return id?'https://media.api-sports.io/football/leagues/'+id+'.png':'';},
    teamLogoUrl:function(tm){return tm&&(tm.photo||tm.logo||(tm.id?'https://media.api-sports.io/football/teams/'+tm.id+'.png':''))||'';},
    translateMarket:function(r){return (r&&ML&&ML.marketLabel)?ML.marketLabel(r):r;},
    marketIdLabel:function(m){return (m&&m.market_id&&ML)?(ML.marketIdLabel||ML.marketIdLabelFr)(m.market_id,{home:m.home&&m.home.n,away:m.away&&m.away.n}):null;},
    hasReliableModelOutput:function(m){return DD?DD.hasReliableModelOutput(m):true;},
    pickFreeMatch:function(list){return FM?FM.pickFreeMatch(list,null,(root.IASHARK_MARKET&&root.IASHARK_MARKET.code)||null):null;},
    lien:lien,
    // Page match statique indexable de la version (/<dir>/match/<id>.html,
    // lib/league-names.js#staticMatchPath) si elle existe, sinon match.html?id=
    // (audit SEO du 19/09/2026 : les cartes liaient le shell noindex).
    matchHref:function(m,H){var d=root.I18N&&root.I18N.dir;var p=(LN&&LN.staticMatchPath&&m)?LN.staticMatchPath(m.id,key(m),d):null;return p||((H&&H.lien)||lien)('match.html?id='+encodeURIComponent(m&&m.id));},
    teamName:function(tm){var TN=root.IasharkTeamNames;return TN?TN.displayName(tm):((tm&&tm.n)||'');},
    fetchResults:defaultFetchResults
  };
}
// Flux de resultats d'un jour : fichier statique d'abord, table Supabase
// ensuite. Le client et ses reglages sont ceux du site (app-client.js,
// window.IasharkApp) : aucune seconde configuration, aucune cle ici.
function defaultFetchResults(day){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(day||'')))return Promise.resolve(null);
  var file=root.fetch
    ?root.fetch('/results/'+day+'.json',{cache:'no-cache'}).then(function(r){return r&&r.ok?r.json():null;}).catch(function(){return null;})
    :Promise.resolve(null);
  return file.then(function(j){
    return (j&&Array.isArray(j.matches))?j:supabaseResults(day);
  }).catch(function(){return null;});
}
// Repli : table match_results en lecture anonyme (RLS SELECT pour anon, lignes
// de matchs termines uniquement). Le fichier du jour n'est ecrit que vers 8 h
// de Paris, la table l'est toutes les 30 minutes : a 00 h 05, c'est elle qui
// repond. Memes noms de champs que le fichier (contrat R1).
function supabaseResults(day){
  var app=root.IasharkApp,sb=app&&app.supabase;
  if(!sb||!sb.from)return Promise.resolve(null);
  try{
    return Promise.resolve(sb.from('match_results').select('*').eq('day',day)).then(function(res){
      var rows=res&&!res.error&&Array.isArray(res.data)?res.data:null;
      return rows?{day:day,matches:rows,scorers:[]}:null;
    }).catch(function(){return null;});
  }catch(e){return Promise.resolve(null);}
}
// Store vide (tests, ou lib/fav-leagues.js absent) : aucune etoile allumee.
var NO_FAVS={has:function(){return false;},list:function(){return [];},toggle:function(){return false;},prune:function(){return false;},subscribe:function(){return function(){};}};

/* ---------- Dates : Hier / Aujourd'hui / Demain ---------- */
// 20/09/2026 : « Apres-demain » (toujours vide) laisse la place a « Hier ».
// Hier ne compte QUE les matchs du flux de resultats (un marche retenu, un
// match termine) : les matchs du jour meme ne s'y invitent jamais.
var DAY_NAMES=[['home_list.day_yesterday','Hier'],['home_list.day_today','Aujourd’hui'],['home_list.day_tomorrow','Demain']];
function yesterdayOf(clock){return addDays(clock.day,-1);}
function buildDays(matches,H,clock,resultsByDay){
  var y=yesterdayOf(clock);
  var ds=[y,clock.day,clock.tomorrow||addDays(clock.day,1)],counts={};
  (matches||[]).forEach(function(m){var d=H.matchDay(m);if(ds.indexOf(d)!==-1)counts[d]=(counts[d]||0)+1;});
  var res=(resultsByDay&&resultsByDay[y])||[];
  counts[y]=res.length;
  return ds.map(function(d,i){return {day:d,count:counts[d]||0,rel:i,results:d===y};});
}
function dayName(d){return t(DAY_NAMES[d.rel][0],DAY_NAMES[d.rel][1]);}
function fullDate(day){
  try{return new Intl.DateTimeFormat(localeTag(),{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(day+'T12:00:00Z'));}catch(e){return day;}
}
function countLabel(n){return n===1?t('home_list.match_one','1 match'):tf('home_list.match_many','{n} matchs',{n:n});}

// Trois onglets de largeur egale. Un jour sans match : onglet desactive « aucun match ».
function renderDateStrip(days,activeDay){
  return '<div class="hl-days" role="tablist" aria-label="'+esc(t('home_list.days_label','Choisir le jour'))+'">'+days.map(function(d){
    var on=d.day===activeDay,empty=!d.count,date=fullDate(d.day);
    var sub=empty?t('home_list.day_none','aucun match'):countLabel(d.count);
    return '<button type="button" role="tab" class="hl-day'+(on?' is-active':'')+(empty?' is-empty':'')+'" id="hl-day-'+d.day+'" data-hl-day="'+d.day+'"'
      +' aria-selected="'+on+'" tabindex="'+(on&&!empty?0:-1)+'" aria-controls="hl-body"'+(empty?' disabled aria-disabled="true"':'')+' title="'+esc(date)+'">'
      +'<span class="hl-day-name">'+esc(dayName(d))+'</span><span class="hl-day-sub">'+esc(sub)+'</span>'
      +'<span class="sr-only">, '+esc(date)+'</span></button>';
  }).join('')+'</div>';
}

/* ---------- Flux de resultats (matchs termines ET regles) ----------
   Source : results/<jour>.json (fichier public, contrat en fin de
   docs/SPEC_RESULTATS_HIER.md, ecrit par le run quotidien vers 8 h de Paris),
   repli sur la table Supabase match_results (lecture anonyme, ecrite toutes
   les 30 min en soiree) quand le fichier du jour n'existe pas encore : a
   00 h 05 l'onglet Hier doit deja etre juste.
   Tout ce qui s'affiche ici vient de CE flux. Aucun champ payant d'un match
   (pari_rec, cote_rec, conf...) n'est lu pour produire un verdict, et une
   entree sans score final n'affiche ni marche ni cote : rien ne prouverait
   que le match est termine. */
var RESULTS=['win','loss','void','pending'];
function rtxt(v){return typeof v==='string'&&v.trim()?v.trim():null;}
function rnum(v){v=parseFloat(v);return isFinite(v)&&v>0?v:null;}
// href : uniquement un chemin absolu du site. Jamais un schema (javascript:)
// ni un domaine externe pose dans la donnee.
function rhref(v){var s=rtxt(v);return s&&s.charAt(0)==='/'&&s.charAt(1)!=='/'?s:null;}
function resultOf(e){var r=String(e&&e.result||'').toLowerCase();return RESULTS.indexOf(r)!==-1?r:'pending';}
// Score final « 2-1 » -> ['2','1'] ; toute autre forme n'est pas un score.
function splitScore(s){var m=/^\s*(\d{1,2})\s*[-–:]\s*(\d{1,2})\s*$/.exec(String(s==null?'':s));return m?[m[1],m[2]]:null;}
function hasScore(e){return !!splitScore(e&&e.score);}
function isSettled(e){var r=resultOf(e);return (r==='win'||r==='loss'||r==='void')&&hasScore(e);}

// Entree du flux, nettoyee. Sans identifiant numerique ou sans marche retenu
// (no_signal), elle n'existe pas pour l'accueil.
function cleanResult(e){
  if(!e||typeof e!=='object')return null;
  var id=e.id!=null?e.id:(e.match_id!=null?e.match_id:e.fixture_id);
  if(id==null||!/^\d{1,12}$/.test(String(id))||e.no_signal===true)return null;
  var pick=rtxt(e.pick);
  if(!pick)return null;
  return {id:String(id),home:rtxt(e.home)||'',away:rtxt(e.away)||'',
    league:rtxt(e.league)||'',league_key:String(e.league_key||'').toLowerCase(),
    kickoff:rtxt(e.kickoff)||rtxt(e.date)||'',score:rtxt(e.score),
    pick:pick,market_id:rtxt(e.market_id),cote:rnum(e.cote!=null?e.cote:e.odds),
    odds_source:String(e.odds_source||e.market_source||'').toLowerCase(),
    result:resultOf(e),href:rhref(e.href)};
}
function cleanResults(file){
  var out=[];
  ((file&&file.matches)||[]).forEach(function(e){var c=cleanResult(e);if(c)out.push(c);});
  return out;
}
// Bilan de la journee : void et pending sortent du compte (ni au numerateur
// ni au denominateur) — « 47 marches sur 52 realises » = won sur won+lost.
function resultTotals(list){
  var tot={won:0,lost:0,voided:0,pending:0};
  (list||[]).forEach(function(e){
    var r=resultOf(e);
    if(r==='win')tot.won++;else if(r==='loss')tot.lost++;else if(r==='void')tot.voided++;else tot.pending++;
  });
  tot.settled=tot.won+tot.lost;
  return tot;
}

var VERDICT={win:['home_list.res_won','Gagné','ok'],loss:['home_list.res_lost','Perdu','ko'],
  'void':['home_list.res_void','Match annulé','ban'],pending:['home_list.res_wait','En attente','wait']};
function verdictLabel(r){return t(VERDICT[r][0],VERDICT[r][1]);}
// Jamais la couleur seule (daltonisme, WCAG 1.4.1) : la ligne porte une
// bordure gauche et un fond teinte, le badge un libelle ET une icone.
function verdictHtml(r){
  return '<span class="hl-verdict is-'+r+'">'+ICON[VERDICT[r][2]]+'<span class="hl-verdict-t">'+esc(verdictLabel(r))+'</span></span>';
}
// La source est dite telle qu'elle est : « Pinnacle » seulement quand la cote
// vient vraiment de Pinnacle, sinon « cotes moyennes ». Jamais devinee.
function oddsSource(e){
  return String(e&&e.odds_source)==='pinnacle'?t('home_list.res_src_pinnacle','Pinnacle'):t('home_list.res_src_avg','cotes moyennes');
}
function fmtOdds(v){return v==null?null:Number(v).toLocaleString(localeTag(),{minimumFractionDigits:2,maximumFractionDigits:2});}
// Marche retenu + cote suivie de sa source, en tout petit, entre parentheses.
// Sans score final, rien du tout : le match n'est pas prouve termine.
function pickHtml(e){
  if(!hasScore(e))return '';
  var o=fmtOdds(e.cote);
  return '<span class="hl-rpick">'+esc(e.pick)+'</span>'
    +(o?'<span class="hl-rodds">'+esc(o)+' <small>('+esc(oddsSource(e))+')</small></span>':'');
}
function pickAria(e){
  if(!hasScore(e))return '';
  var o=fmtOdds(e.cote);
  return tf('home_list.res_aria_pick','Marché retenu : {pick}.',{pick:e.pick})
    +(o?' '+tf('home_list.res_aria_odds','Cote {odds} ({source}).',{odds:o,source:oddsSource(e)}):'');
}

function renderResultsBanner(list,H){
  var tot=resultTotals(list),notes=[];
  var head=!tot.settled?t('home_list.res_count_none','Résultats d’hier : aucun marché réglé pour le moment.')
    :tot.won<2?tf('home_list.res_count_one','Résultats d’hier : {won} marché sur {total} réalisé',{won:tot.won,total:tot.settled})
    :tf('home_list.res_count','Résultats d’hier : {won} marchés sur {total} réalisés',{won:tot.won,total:tot.settled});
  if(tot.voided)notes.push(tot.voided===1?t('home_list.res_void_one','1 match annulé, hors décompte.')
    :tf('home_list.res_void_many','{n} matchs annulés, hors décompte.',{n:tot.voided}));
  if(tot.pending)notes.push(tot.pending===1?t('home_list.res_pending_one','1 marché en attente de règlement, hors décompte.')
    :tf('home_list.res_pending_many','{n} marchés en attente de règlement, hors décompte.',{n:tot.pending}));
  return '<section class="hl-rbanner" aria-label="'+esc(t('home_list.res_banner_aria','Bilan de la veille'))+'">'
    +'<p class="hl-rbanner-h">'+esc(head)+'</p>'
    +(notes.length?'<p class="hl-rbanner-x">'+esc(notes.join(' '))+'</p>':'')
    +'<p class="hl-rbanner-note">'+esc(t('home_list.res_disclaimer','Les résultats passés ne préjugent pas des résultats futurs.'))+'</p>'
    +'<a class="hl-rbanner-cta" href="'+esc(resultsHref(H))+'" data-track="home_results_all" data-track-kind="home_results_all">'
    +esc(t('home_list.res_all','Voir tous les résultats'))+' <span aria-hidden="true">→</span></a></section>';
}

function scoreHtml(g){return g==null?'':'<b class="hl-rscore">'+esc(g)+'</b>';}
// Une entree du flux devient un match au format de la liste : l'onglet Hier
// est rendu par le MEME code que Aujourd'hui et Demain (regroupement par
// competition, en-tetes, etoiles de favori, lignes, tailles, espacements,
// ordre). Demande du proprietaire, 20/09/2026 : « la structure est pareille,
// juste la couleur qui change et le resultat ». S'ajoutent sur la ligne le
// verdict, le score final et le marche retenu avec sa cote ; ne disparaissent
// que les matchs sans marche retenu, absents du flux.
// status FT : le flux ne porte que des matchs termines. __result : l'entree
// elle-meme — une ligne de l'onglet Hier n'existe QUE parce que le flux la
// porte, son verdict ne depend d'aucun contexte exterieur et aucun champ
// payant du match n'est lu.
function resultAsMatch(e){
  return {id:e.id,league:e.league,league_key:e.league_key,home:{n:e.home},away:{n:e.away},
    date:e.kickoff,status:'FT',has_signal:true,__href:e.href||null,__result:e};
}
// Corps de l'onglet Hier (fonction pure, testee en Node) : le bandeau du jour,
// puis le corps habituel de la liste, pertes comprises et sans tri par resultat.
function renderResultsDay(list,ctx,H){
  return renderResultsBanner(list,H)+renderDayBody((list||[]).map(resultAsMatch),ctx,H);
}
// Verdict d'un match du jour deja termine et regle : il vient UNIQUEMENT du
// flux (ctx.results), jamais des champs payants du match lui-meme.
function settledFor(m,ctx){
  if(!m)return null;
  // Ligne de l'onglet Hier : l'entree du flux EST le match (verdict « En
  // attente » compris, sans marche ni cote tant qu'il n'y a pas de score).
  if(m.__result)return m.__result;
  // Match du jour : seulement une entree reglee, score final a l'appui.
  var map=ctx&&ctx.results;
  if(!map||m.id==null)return null;
  var e=map[String(m.id)];
  return e&&isSettled(e)?e:null;
}

/* ---------- Donnees match (publiques sauf analysisFor ouvert) ---------- */
// has_signal (public) d'abord : pour un match verrouille, pari_rec n'est jamais lu.
function hasSignal(m){return !!(m&&(m.has_signal||m.pari_rec||m.market_id))&&!m.no_signal;}
function isFree(m,ctx){return ctx.freeMatchId!=null&&String(m.id)===String(ctx.freeMatchId);}
function fmtProb(v){v=Math.min(Math.max(v,0),10);return (Math.round(v*10)/10).toLocaleString(localeTag(),{minimumFractionDigits:1,maximumFractionDigits:1});}
function normConf(c){c=parseFloat(c);if(isNaN(c)||c<0)return null;return c<=1?c*10:c;}
function probBandOf(m){return m&&PROB_BANDS.indexOf(m.prob_band)!==-1?m.prob_band:null;}
// Nom du derby : champ public m.derby ({key,name}, lib/public-data-split.js).
function derbyName(m){var d=m&&m.derby;if(!d)return null;return typeof d==='string'?d:(d.name||d.key||null);}

// Statut : champ public m.status (fixture.status.short d'API-Football au moment
// du run). Termine / reporte : definitifs. En cours : seulement dans la fenetre
// du match (un statut vieux de plusieurs heures n'est plus cru). Sinon
// estimation par l'heure du coup d'envoi, signalee comme telle.
function matchStatus(m,H,nowTs){
  var s=String(m&&m.status||'').toUpperCase(),ts=H.matchTimestamp(m),since=isFinite(ts)?(nowTs-ts)/60000:NaN;
  if(/^(FT|AET|PEN)$/.test(s))return {kind:'finished',estimated:false};
  if(/^(PST|CANC|ABD|SUSP|AWD|WO)$/.test(s))return {kind:'postponed',estimated:false};
  if(/^(1H|HT|2H|ET|BT|P|LIVE|INT)$/.test(s)&&!(since>DEFAULTS.staleLiveMin))return {kind:'live',estimated:false};
  if(!isFinite(ts)||nowTs<ts)return null;
  return {kind:since<=DEFAULTS.liveWindowMin?'live':'finished',estimated:true};
}
var STATUS_LABEL={live:['home_list.status_live','En cours'],finished:['home_list.status_finished','Terminé'],postponed:['home_list.status_postponed','Reporté']};
// Compte a rebours honnete : rien au-dela de 24 h (la date est dans l'onglet).
function countdown(m,H,nowTs){
  var st=matchStatus(m,H,nowTs);
  if(st)return {kind:st.kind,text:t(STATUS_LABEL[st.kind][0],STATUS_LABEL[st.kind][1]),estimated:st.estimated};
  var ts=H.matchTimestamp(m);
  if(!isFinite(ts))return null;
  var min=Math.ceil((ts-nowTs)/60000);
  if(min<=30)return {kind:'soon',text:t('home_list.cd_soon','Commence bientôt')};
  if(min<60)return {kind:'in',text:tf('home_list.cd_min','dans {m} min',{m:min})};
  if(min<1440){var h=Math.floor(min/60),mm=min%60;
    return {kind:'in',text:mm?tf('home_list.cd_hm','dans {h} h {m}',{h:h,m:(mm<10?'0':'')+mm}):tf('home_list.cd_h','dans {h} h',{h:h})};}
  return null;
}
var QUALITY={'élevée':['high','home_list.q_high','Données élevées'],'moyenne':['mid','home_list.q_mid','Données moyennes'],'faible':['low','home_list.q_low','Données limitées']};
function qualityFor(m){
  var q=QUALITY[String(m&&m.data_quality_label||'').toLowerCase()];
  return q?{level:q[0],text:t(q[1],q[2])}:null;
}
var BAND_LABEL={high:['home_list.band_high','Probabilité élevée'],good:['home_list.band_good','Bonne probabilité'],moderate:['home_list.band_moderate','Probabilité modérée']};
var BAND_LEVEL={high:3,good:2,moderate:1};
var BAND_SHORT={high:'Proba. élevée',good:'Bonne proba.',moderate:'Proba. modérée'};
function bandLabel(b){return t(BAND_LABEL[b][0],BAND_LABEL[b][1]);}
function bandNote(){return t('home_list.band_note','Estimation du modèle, pas une garantie. Détail et pari réservés aux abonnés Pro.');}

function analysisFor(m,ctx,H){
  var free=isFree(m,ctx);
  if(!hasSignal(m))return {state:'none',free:free,label:m.no_signal_label||t('home_app.no_signal_label','Aucun signal clair sur ce match')};
  // Match offert sans compte : la page match exige un compte gratuit ; ici non
  // plus, aucun champ payant n'est lu.
  if(free&&!ctx.isPro&&!ctx.hasAccount)return {state:'gated',free:true};
  // Verrou : on sort ICI, avant de lire conf / pari_rec / market_id. Seul le
  // niveau public prob_band est repris.
  if(!ctx.isPro&&!free)return {state:'locked',band:probBandOf(m)};
  var market=m.pari_rec?H.translateMarket(m.pari_rec):(H.marketIdLabel(m)||null);
  var c=(H.hasReliableModelOutput(m)&&m.conf!=null&&m.conf!=='')?normConf(m.conf):null;
  var pn=c==null?null:Math.min(c,10);
  if(!market)return {state:'pending',free:free,prob:pn!=null?fmtProb(pn):null};
  return {state:'open',free:free,probNum:pn,prob:pn!=null?fmtProb(pn):null,market:market};
}

// Competitions favorites d'abord, puis A->Z ; dans chaque competition, matchs
// favoris d'abord, puis par heure de coup d'envoi.
function groupByLeague(list,H,favLeagues,favMatches){
  var map={},order=[],fl=favLeagues||NO_FAVS,fm=favMatches||NO_FAVS;
  list.forEach(function(m){
    var k=H.leagueKey(m)||'autres';
    if(!map[k]){map[k]={key:k,name:H.leagueName(m),country:H.leagueCountry(m),flag:H.leagueFlag(k),logo:H.leagueLogoUrl(m),matches:[]};order.push(k);}
    map[k].matches.push(m);
  });
  var lt=localeTag();
  return order.map(function(k){
    var g=map[k];
    g.fav=!!fl.has(k);
    g.matches.sort(function(a,b){return ((fm.has(a.id)?0:1)-(fm.has(b.id)?0:1))||H.compareMatches(a,b);});
    g.ready=g.matches.filter(hasSignal).length;
    return g;
  }).sort(function(a,b){return ((a.fav?0:1)-(b.fav?0:1))||String(a.name).localeCompare(String(b.name),lt,{sensitivity:'base'});});
}

/* ---------- Rendu ligne ---------- */
function initials(n){return String(n||'?').replace(/[^A-Za-zÀ-ÿ0-9 ]/g,'').split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase()||'?';}
// goals : buts marques, seulement pour un match termine et regle (flux de
// resultats). Rien pour un match a venir ou en cours.
function teamHtml(tm,H,goals){
  var url=H.teamLogoUrl(tm),ini=esc(initials(tm&&tm.n));
  var logo=url?'<img class="hl-logo" src="'+esc(url)+'" width="18" height="18" alt="" loading="lazy" decoding="async" data-ini="'+ini+'">'
    :'<span class="hl-logo hl-logo-ph" aria-hidden="true">'+ini+'</span>';
  return '<span class="hl-team">'+logo+'<span class="hl-tname">'+esc((H.teamName?H.teamName(tm):(tm&&tm.n))||'')+'</span>'+scoreHtml(goals)+'</span>';
}
function fmtInt(n){return Number(n).toLocaleString(localeTag());}
function barsHtml(b){
  var lvl=BAND_LEVEL[b];
  return '<span class="hl-bars" aria-hidden="true"><i class="'+(lvl>=1?'on':'')+'"></i><i class="'+(lvl>=2?'on':'')+'"></i><i class="'+(lvl>=3?'on':'')+'"></i></span>';
}
// Pastille de niveau (ligne verrouillee) : libelle court sur mobile, complet sur desktop.
function bandHtml(b){
  return '<span class="hl-band is-'+b+'" title="'+esc(bandNote())+'">'+barsHtml(b)
    +'<span class="hl-band-txt"><span class="hl-m">'+esc(t(BAND_LABEL[b][0]+'_short',BAND_SHORT[b]))+'</span><span class="hl-d">'+esc(bandLabel(b))+'</span></span>'
    +'<span class="hl-band-i" aria-hidden="true">i</span></span>';
}
function matchTitle(m){return (m&&m.home&&m.home.n||'')+' – '+(m&&m.away&&m.away.n||'');}
// Etoile du match : bouton frere du lien (jamais un bouton dans un <a>).
function matchStarHtml(m,ctx){
  var fm=ctx.favMatches;
  if(!fm||m==null||m.id==null)return '';
  var on=!!fm.has(m.id);
  var lbl=tf(on?'home_list.mfav_remove':'home_list.mfav_add',on?'Retirer {match} de mes matchs':'Ajouter {match} à mes matchs',{match:matchTitle(m)});
  return '<button type="button" class="hl-mstar'+(on?' is-on':'')+'" data-hl-mfav="'+esc(m.id)+'" aria-pressed="'+on+'" aria-label="'+esc(lbl)+'" title="'+esc(lbl)+'">'+ICON.star+'</button>';
}

function renderMatchRow(m,ctx,H,index){
  // Match du jour deja termine ET regle : le verdict prend la place de la zone
  // d'analyse, avec le marche retenu du flux. analysisFor n'est alors jamais
  // appele, donc aucun champ payant n'est lu.
  var res=settledFor(m,ctx),sc=res?splitScore(res.score):null;
  var a=res?{state:'result',free:isFree(m,ctx),result:res}:analysisFor(m,ctx,H);
  var ts=H.matchTimestamp(m),cd=countdown(m,H,ctx.nowTs);
  var home=m.home||{},away=m.away||{},heure=H.heure(m),derby=derbyName(m),q=qualityFor(m),sig=res?true:hasSignal(m);
  var cls='hl-row hl-grid is-'+a.state+(res?' hl-rrow is-'+resultOf(res):'')+(a.free?' is-free':'')+(cd?' cd-'+cd.kind:'');
  // __href : chemin de la page match donne par le flux de resultats (registre
  // data/match-pages-registry.json, lot R1). Sinon, meme regle que partout.
  var href=(a.state==='locked'&&ctx.lockedHref==='abonnement')?H.lien('abonnement.html')
    :(m.__href||(H.matchHref?H.matchHref(m,H):H.lien('match.html?id='+encodeURIComponent(m.id))));

  // Indicateurs PUBLICS reels uniquement.
  var tags=[];
  if(a.free)tags.push('<span class="hl-tag hl-tag-free">'+esc(t('home_list.free_chip','Offert'))+'</span>');
  if(derby)tags.push('<span class="hl-tag hl-tag-derby" title="'+esc(derby)+'">'+esc(t('home_list.derby_chip','Derby'))+'</span>');
  if(cd)tags.push('<span class="hl-tag hl-tag-time is-'+cd.kind+'" data-hl-ts="'+(isFinite(ts)?ts:'')+'"'+(cd.estimated?' title="'+esc(t('home_list.status_estimated','Statut estimé d’après l’heure du coup d’envoi'))+'"':'')+'>'+esc(cd.text)+'</span>');
  if(q)tags.push('<span class="hl-tag hl-tag-q is-'+q.level+'"><i aria-hidden="true"></i>'+esc(q.text)+'</span>');
  if(sig)tags.push('<span class="hl-tag hl-tag-sim">'+esc(tf('home_list.sims','{n} simulations',{n:fmtInt(ctx.simulations)}))+'</span>');

  var zone;
  if(a.state==='locked'){
    // Aucune donnee de pari : badge, niveau public et pilule abstraite (barres CSS, pas de chiffre).
    zone='<span class="hl-zone">'
      +(a.band?'<span class="hl-zone-top">'+bandHtml(a.band)+'</span>':'')
      +'<span class="hl-lockpill" aria-hidden="true">'+ICON.lock
      +'<span class="hl-ghost"><i class="g1"></i><i class="g2"></i><i class="g3"></i><i class="g4"></i></span>'
      +'<span class="hl-lockpill-pro">PRO</span>'
      +'<span class="hl-lockpill-cta">'+esc(t('home_list.unlock','Débloquer avec Pro'))+'</span></span></span>';
  }else if(a.state==='open'){
    zone='<span class="hl-zone">'
      +(a.prob!=null
        ?'<span class="hl-prob-row">'
          +'<span class="hl-prob-lbl"><span class="hl-m">'+esc(t('home_list.prob_short','Proba.'))+'</span><span class="hl-d">'+esc(t('home_list.prob_long','Probabilité estimée'))+'</span></span>'
          +'<span class="hl-prob"><b>'+a.prob+'</b><small>/10</small></span></span>'
          +'<span class="hl-gauge" aria-hidden="true"><i style="--p:'+Math.round(a.probNum*10)+'%"></i></span>'
        :'<span class="hl-prelim">'+esc(t('home_list.preliminary','Analyse préliminaire'))+'</span>')
      +'</span>';
  }else if(a.state==='result'){
    zone='<span class="hl-zone hl-rzone">'+pickHtml(a.result)+verdictHtml(resultOf(a.result))+'</span>';
  }else if(a.state==='gated'){
    zone='<span class="hl-zone"><span class="hl-ready"><i class="hl-dot" aria-hidden="true"></i>'+esc(t('home_list.free_gated','Analyse offerte'))+'</span>'
      +'<span class="hl-freepill">'+esc(t('home_list.free_gated_cta','Compte gratuit'))+'</span></span>';
  }else if(a.state==='pending'){
    zone='<span class="hl-zone hl-zone-none"><span class="hl-none-t">'+esc(t('home_app.analysis_in_progress','Analyse en cours'))+'</span></span>';
  }else{
    zone='<span class="hl-zone hl-zone-none"><span class="hl-none-t">'+esc(t('home_list.no_signal_short','Pas de signal clair'))+'</span>'
      +'<span class="hl-none-s">'+esc(t('home_list.no_signal_sub','Aucun pari forcé'))+'</span></span>';
  }

  var anaAria=a.state==='result'?[pickAria(a.result),verdictLabel(resultOf(a.result))+'.'].filter(Boolean).join(' ')
    :a.state==='locked'?t('home_list.aria_locked','Analyse prête, réservée aux abonnés Pro.')+(a.band?' '+bandLabel(a.band)+'. '+bandNote():'')
    :a.state==='open'?(a.prob!=null?tf('home_list.aria_prob','Probabilité estimée {p} sur 10.',{p:a.prob}):t('home_list.aria_open','Analyse disponible.'))
      +(a.free?' '+t('home_list.aria_free','Analyse offerte.'):'')
    :a.state==='gated'?t('home_list.aria_free_gated','Analyse offerte avec un compte gratuit.')
    :a.state==='pending'?t('home_app.analysis_in_progress','Analyse en cours')+'.':a.label+'.';
  var extra=[derby?tf('home_list.aria_derby','Derby : {name}',{name:derby}):'',cd?cd.text+(cd.estimated?' ('+t('home_list.estimated','estimé')+')':''):'',q?q.text:''].filter(Boolean).join(', ');
  var aria=tf('home_list.row_aria','{home} contre {away}, {time}. {extra}. {analysis}',{home:home.n||'',away:away.n||'',time:heure,extra:extra,analysis:anaAria}).replace(/\.\s\./g,'.');
  // Suivi du tunnel (funnel-track.js) : ligne verrouillee = kind dedie, sans donnee personnelle.
  var track=a.state==='locked'?' data-track="home_row_lock" data-track-kind="home_row_lock"':'';
  var star=matchStarHtml(m,ctx);

  return '<li class="hl-item'+(star?' has-star':'')+'"><a class="'+cls+'" href="'+esc(href)+'" aria-label="'+esc(aria)+'"'+track+' style="--i:'+Math.min(index||0,14)+'">'
    +'<span class="hl-time"><span class="hl-kick">'+esc(heure)+'</span></span>'
    +'<span class="hl-teams">'+teamHtml(home,H,sc?sc[0]:null)+teamHtml(away,H,sc?sc[1]:null)+'</span>'
    +'<span class="hl-meta">'+tags.join('')+'</span>'
    +zone+'</a>'+star+'</li>';
}

/* ---------- Rendu competition ---------- */
function renderLeagueBlock(g,ctx,H,startIndex){
  var favs=ctx.favorites||NO_FAVS;
  var fav=!!favs.has(g.key),open=!(ctx.collapsed||{})[g.key],k=esc(g.key);
  var hid='hl-h-'+k,pid='hl-p-'+k;
  var favLbl=tf(fav?'home_list.fav_remove':'home_list.fav_add',fav?'Retirer {league} de mes compétitions':'Ajouter {league} à mes compétitions',{league:g.name});
  var stats=esc(countLabel(g.matches.length));
  // Ajout aux favoris : kind dedie (cle de competition seulement).
  var track=fav?'':' data-track="'+k+'" data-track-kind="home_fav_add"';
  return '<section class="hl-league'+(fav?' is-fav':'')+(open?'':' is-collapsed')+'" data-league="'+k+'">'
    +'<div class="hl-league-head">'
    +'<button type="button" class="hl-star'+(fav?' is-on':'')+'" data-hl-fav="'+k+'" aria-pressed="'+fav+'" aria-label="'+esc(favLbl)+'" title="'+esc(favLbl)+'"'+track+'>'+ICON.star+'</button>'
    +'<h4 class="hl-league-h"><button type="button" class="hl-league-toggle" id="'+hid+'" data-hl-toggle="'+k+'" aria-expanded="'+open+'" aria-controls="'+pid+'">'
    +(g.logo?'<span class="hl-league-logo"><img src="'+esc(g.logo)+'" width="19" height="19" alt="" loading="lazy" decoding="async"></span>':'')
    +'<span class="hl-league-text"><span class="hl-league-l1"><span class="hl-league-name">'+esc(g.name)+'</span>'
    +'<span class="hl-league-country">'+(g.flag?'<span aria-hidden="true">'+g.flag+'</span> ':'')+esc(g.country||t('home_list.country_intl','International'))+'</span></span>'
    +'<span class="hl-league-stats">'+stats+'</span></span>'
    +ICON.chev+'</button></h4></div>'
    +'<div class="hl-league-panel" id="'+pid+'" role="region" aria-labelledby="'+hid+'"'+(open?'':' inert aria-hidden="true"')+'><div class="hl-league-inner">'
    +'<ul class="hl-rows">'+g.matches.map(function(m,i){return renderMatchRow(m,ctx,H,(startIndex||0)+i);}).join('')+'</ul>'
    +'</div></div></section>';
}

// « Mes matchs » : section compacte en haut, seulement s'il y a des matchs favoris ce jour.
function renderMine(list,ctx,H,startIndex){
  if(!list||!list.length)return '';
  return '<section class="hl-mine" aria-labelledby="hl-mine-h">'
    +'<h3 class="hl-block-title" id="hl-mine-h">'+ICON.star+'<span>'+esc(t('home_list.mine_title','Mes matchs'))+'</span> <span class="hl-mine-n">'+list.length+'</span></h3>'
    +'<ul class="hl-rows hl-mine-rows">'+list.map(function(m,i){return renderMatchRow(m,ctx,H,(startIndex||0)+i);}).join('')+'</ul></section>';
}

function renderUpsell(n,H){
  return '<aside class="hl-upsell" data-vente aria-label="'+esc(t('home_list.upsell_aria','Offre Pro'))+'">'
    +'<span class="hl-upsell-ico">'+ICON.lock+'</span>'
    +'<div class="hl-upsell-txt"><strong>'+esc(t('home_list.upsell_title','Débloque toutes les analyses'))+'</strong>'
    +'<p>'+esc(tf('home_list.upsell_text','Probabilité estimée et marché conseillé pour les {n} analyses prêtes de ce jour. Sans engagement.',{n:n}))+'</p></div>'
    +'<a class="hl-upsell-cta" href="'+esc(H.lien('abonnement.html'))+'" data-track="home_list_upsell" data-track-kind="home_list_upsell">'+esc(t('home_list.upsell_cta','Voir les offres'))+' <span aria-hidden="true">→</span></a></aside>';
}

function renderSkeleton(){
  function row(){return '<div class="hl-skel-row"><span class="hl-sk" style="width:34px;height:14px"></span><span style="flex:1;display:grid;gap:7px"><span class="hl-sk" style="width:62%;height:13px"></span><span class="hl-sk" style="width:48%;height:13px"></span></span><span style="display:grid;gap:5px;justify-items:end"><span class="hl-sk" style="width:74px;height:11px"></span><span class="hl-sk" style="width:110px;height:22px;border-radius:11px"></span></span></div>';}
  function league(){return '<div class="hl-skel-league"><div class="hl-skel-head"><span class="hl-sk" style="width:26px;height:26px;border-radius:7px"></span><span class="hl-sk" style="width:40%;height:14px"></span></div>'+row()+row()+row()+'</div>';}
  return '<div class="hl-skel" aria-hidden="true">'+league()+league()+'</div>';
}

// Corps du jour affiche (fonction pure, testee en Node) :
// « Mes matchs » (s'il y en a), note du niveau public, competitions, un seul rappel Pro.
function renderDayBody(all,ctx,H){
  var favs=ctx.favorites||NO_FAVS,fm=ctx.favMatches||NO_FAVS;
  // Un match deja regle n'est plus verrouille : il ne compte pas dans le rappel Pro.
  var lockedAll=ctx.isPro?[]:all.filter(function(m){return !settledFor(m,ctx)&&hasSignal(m)&&!isFree(m,ctx);});
  var html='',idx=0;
  var mine=all.filter(function(m){return fm.has(m.id);}).sort(H.compareMatches);
  if(mine.length){html+=renderMine(mine,ctx,H,idx);idx+=mine.length;}
  if(lockedAll.some(probBandOf))html+='<p class="hl-band-note"><span class="hl-band-i" aria-hidden="true">i</span>'+esc(bandNote())+'</p>';
  var groups=groupByLeague(all,H,favs,fm);
  var locked=lockedAll.length,upsellDone=!locked;
  html+='<div class="hl-leagues">';
  groups.forEach(function(g,i){
    html+=renderLeagueBlock(g,ctx,H,idx);idx+=g.matches.length;
    if(!upsellDone&&(i+1===ctx.upsellAfter||i===groups.length-1)){html+=renderUpsell(locked,H);upsellDone=true;}
  });
  return html+'</div>';
}

/* ---------- Composant ---------- */
function mount(rootEl,options){
  options=options||{};
  var H=Object.assign(defaultHelpers(),options.helpers||{});
  var FL=root.IasharkFavLeagues;
  var favorites=options.favorites||(FL?FL.createStore():null)||NO_FAVS;
  var favMatches=options.favMatches||(FL?FL.createStore({kind:'matches'}):null)||NO_FAVS;
  var collapsed={};
  try{collapsed=JSON.parse(root.sessionStorage.getItem(DEFAULTS.collapsedKey)||'{}')||{};}catch(e){collapsed={};}
  var ctx={isPro:!!options.isPro,hasAccount:!!options.hasAccount,freeMatchId:null,lockedHref:options.lockedHref||DEFAULTS.lockedHref,
    upsellAfter:options.upsellAfter||DEFAULTS.upsellAfter,simulations:options.simulations||DEFAULTS.simulations,
    favorites:favorites,favMatches:favMatches,collapsed:collapsed,nowTs:Date.now(),results:null};
  var state={status:'loading',matches:[],days:[],day:null,clock:H.localClock(),onRetry:null,resultsByDay:{}};
  // Flux de resultats : fichiers deja recus (cle = jour demande), buteurs du
  // meme flux, et heure du dernier rafraichissement.
  var resultFiles={},resultScorers={},lastResults=0;

  rootEl.classList.add('hl');
  rootEl.innerHTML='<div class="hl-head"><h2 class="hl-title" id="hlTitle">'+esc(t('home_list.title','Matchs du jour'))+'</h2>'
    +'<p class="hl-sub">'+esc(t('home_list.subtitle','Heures dans ton fuseau · touche l’étoile pour suivre une compétition ou un match'))+'</p></div>'
    +'<div class="hl-dates" data-hl-dates></div>'
    +'<p class="sr-only" role="status" aria-live="polite" data-hl-live></p>'
    +'<div id="hl-body" class="hl-body" role="tabpanel" data-hl-body></div>';
  var $dates=rootEl.querySelector('[data-hl-dates]'),$body=rootEl.querySelector('[data-hl-body]'),$live=rootEl.querySelector('[data-hl-live]');

  function announce(msg){$live.textContent='';setTimeout(function(){$live.textContent=msg;},30);}
  function dayMatches(){return state.matches.filter(function(m){return H.matchDay(m)===state.day;});}
  function isResultsDay(day){return !!day&&day===yesterdayOf(state.clock);}

  // Entrees rangees par jour DU VISITEUR (le flux porte des heures de Paris,
  // comme data.json : lib/match-time.js fait la conversion), et par identifiant
  // pour le verdict des matchs du jour.
  function indexResults(){
    var byDay={},byId={},seen={};
    Object.keys(resultFiles).forEach(function(k){
      resultFiles[k].forEach(function(e){
        if(seen[e.id])return;
        seen[e.id]=1;byId[e.id]=e;
        var d=(e.kickoff&&H.matchDay({date:e.kickoff}))||k;
        (byDay[d]=byDay[d]||[]).push(e);
      });
    });
    Object.keys(byDay).forEach(function(d){
      byDay[d].sort(function(a,b){
        var ta=H.matchTimestamp({date:a.kickoff}),tb=H.matchTimestamp({date:b.kickoff});
        return ta!==tb?(ta<tb?-1:1):(a.id<b.id?-1:a.id>b.id?1:0);
      });
    });
    state.resultsByDay=byDay;ctx.results=byId;
  }
  // La veille (onglet Hier) et le jour meme (verdict des matchs termines).
  function loadResults(){
    var days=[yesterdayOf(state.clock),state.clock.day],left=days.length,changed=false;
    lastResults=Date.now();
    days.forEach(function(d){
      Promise.resolve().then(function(){return H.fetchResults?H.fetchResults(d):null;}).catch(function(){return null;})
        .then(function(file){
          var list=cleanResults(file);
          if(list.length||resultFiles[d]){resultFiles[d]=list;changed=true;}
          resultScorers[d]=(file&&Array.isArray(file.scorers))?file.scorers:[];
          if(--left)return;
          if(!changed)return;
          indexResults();
          if(state.status!=='ready')return;
          state.days=buildDays(state.matches,H,state.clock,state.resultsByDay);
          renderAll(false);
        });
    });
  }
  function findMatch(id){var f=null;state.matches.some(function(x){if(x&&String(x.id)===String(id)){f=x;return true;}return false;});return f;}

  function renderDates(){$dates.innerHTML=state.status==='ready'&&state.days.length?renderDateStrip(state.days,state.day):'';}

  function renderBody(animate){
    if(state.status==='loading'){$body.setAttribute('aria-busy','true');$body.innerHTML=renderSkeleton()+'<p class="sr-only">'+esc(t('home_list.loading','Chargement des matchs…'))+'</p>';return;}
    $body.removeAttribute('aria-busy');
    if(state.status==='error'){
      $body.innerHTML='<div class="hl-empty hl-error" role="alert">'+ICON.alert+'<h3>'+esc(t('home_list.error_title','Impossible de charger les matchs'))+'</h3>'
        +'<p>'+esc(t('home_list.error_text','Vérifie ta connexion internet, puis réessaie.'))+'</p>'
        +'<button type="button" class="hl-btn" data-hl-retry>'+esc(t('home_list.retry','Réessayer'))+'</button></div>';
      return;
    }
    ctx.nowTs=Date.now();
    var res=isResultsDay(state.day);
    var all=res?(state.resultsByDay[state.day]||[]):dayMatches();
    if(!all.length){
      $body.innerHTML='<div class="hl-empty">'+ICON.cal
        +'<h3>'+esc(res?t('home_list.res_empty_title','Aucun marché retenu hier'):t('home_list.empty_title','Aucun match analysé ce jour'))+'</h3>'
        +'<p>'+esc(res?t('home_list.res_empty_text','Quand aucun marché n’est assez clair, le modèle ne force pas de pari. Les résultats réglés apparaissent ici dès la fin des matchs.')
          :t('home_list.empty_text','Les analyses sont publiées avant le coup d’envoi. Reviens plus tard ou choisis un autre jour.'))+'</p></div>';
      return;
    }
    $body.classList.toggle('hl-enter',!!animate&&!reducedMotion());
    $body.innerHTML=res?renderResultsDay(all,ctx,H):renderDayBody(all,ctx,H);
    if(animate){clearTimeout(renderBody._t);renderBody._t=setTimeout(function(){$body.classList.remove('hl-enter');},1400);}
  }

  function renderAll(animate){renderDates();renderBody(animate);notifyDay();}
  // L'accueil suit l'onglet actif (index.html met « Buteurs du jour » sur la
  // veille quand l'onglet Hier est ouvert).
  function notifyDay(){
    if(typeof options.onDay!=='function'||state.status!=='ready'||!state.day)return;
    var d=state.days.filter(function(x){return x.day===state.day;})[0];
    try{options.onDay(state.day,{rel:d?d.rel:null,results:isResultsDay(state.day),count:d?d.count:0});}catch(e){}
  }

  function selectDay(day,focus){
    if(!day||day===state.day)return;
    var d=state.days.filter(function(x){return x.day===day;})[0];
    if(!d||!d.count)return;
    state.day=day;
    $dates.querySelectorAll('.hl-day').forEach(function(b){
      var on=b.getAttribute('data-hl-day')===day;
      b.classList.toggle('is-active',on);b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;
      if(on&&focus)b.focus({preventScroll:true});
    });
    renderBody(true);
    notifyDay();
    announce(dayName(d)+', '+fullDate(day)+' : '+countLabel(d.count));
  }
  function toggleLeague(btn){
    var sec=btn.closest('.hl-league'),k=sec.getAttribute('data-league'),panel=sec.querySelector('.hl-league-panel');
    var open=btn.getAttribute('aria-expanded')!=='true';
    btn.setAttribute('aria-expanded',open);sec.classList.toggle('is-collapsed',!open);
    if(open){panel.removeAttribute('inert');panel.removeAttribute('aria-hidden');delete collapsed[k];}
    else{panel.setAttribute('inert','');panel.setAttribute('aria-hidden','true');collapsed[k]=1;}
    try{root.sessionStorage.setItem(DEFAULTS.collapsedKey,JSON.stringify(collapsed));}catch(e){}
  }
  function pop(el,added){if(el){el.focus({preventScroll:false});if(added&&!reducedMotion())el.classList.add('is-pop');}}

  rootEl.addEventListener('click',function(e){
    var el=e.target.closest('button');
    if(!el||!rootEl.contains(el))return;
    if(el.hasAttribute('data-hl-day'))return selectDay(el.getAttribute('data-hl-day'));
    if(el.hasAttribute('data-hl-toggle'))return toggleLeague(el);
    if(el.hasAttribute('data-hl-fav')){
      var k=el.getAttribute('data-hl-fav'),name=(el.closest('.hl-league').querySelector('.hl-league-name')||{}).textContent||k;
      var added=favorites.toggle(k);
      renderBody(false);
      pop(rootEl.querySelector('[data-hl-fav="'+k+'"]'),added);
      announce(tf(added?'home_list.fav_added':'home_list.fav_removed',added?'{league} ajoutée à mes compétitions':'{league} retirée de mes compétitions',{league:name}));
      return;
    }
    if(el.hasAttribute('data-hl-mfav')){
      var id=el.getAttribute('data-hl-mfav'),m=findMatch(id),ts=m?H.matchTimestamp(m):null;
      var addedM=favMatches.toggle(id,isFinite(ts)?ts:null);
      renderBody(false);
      var sel='[data-hl-mfav="'+String(id).replace(/"/g,'')+'"]';
      pop(rootEl.querySelector('.hl-leagues '+sel)||rootEl.querySelector(sel),addedM);
      announce(tf(addedM?'home_list.mfav_added':'home_list.mfav_removed',addedM?'{match} ajouté à mes matchs':'{match} retiré de mes matchs',{match:matchTitle(m)}));
      return;
    }
    if(el.hasAttribute('data-hl-retry')&&state.onRetry)state.onRetry();
  });
  rootEl.addEventListener('keydown',function(e){
    var el=e.target;
    if(el.classList&&el.classList.contains('hl-day')){
      var tabs=[].slice.call($dates.querySelectorAll('.hl-day:not([disabled])')),i=tabs.indexOf(el),n=null;
      if(e.key==='ArrowRight')n=Math.min(i+1,tabs.length-1);else if(e.key==='ArrowLeft')n=Math.max(i-1,0);
      else if(e.key==='Home')n=0;else if(e.key==='End')n=tabs.length-1;
      if(n!=null&&tabs[n]){e.preventDefault();selectDay(tabs[n].getAttribute('data-hl-day'),true);tabs[n].focus();}
      return;
    }
    if(el.classList&&el.classList.contains('hl-league-toggle')){
      var heads=[].slice.call(rootEl.querySelectorAll('.hl-league-toggle')),j=heads.indexOf(el),to=null;
      if(e.key==='ArrowDown')to=(j+1)%heads.length;else if(e.key==='ArrowUp')to=(j-1+heads.length)%heads.length;
      else if(e.key==='Home')to=0;else if(e.key==='End')to=heads.length-1;
      if(to!=null){e.preventDefault();heads[to].focus();}
    }
  });
  rootEl.addEventListener('animationend',function(e){if(e.target.classList&&e.target.classList.contains('is-pop'))e.target.classList.remove('is-pop');},true);
  rootEl.addEventListener('error',function(e){
    var img=e.target;
    if(!img||img.tagName!=='IMG')return;
    if(img.classList.contains('hl-logo')){var s=document.createElement('span');s.className='hl-logo hl-logo-ph';s.setAttribute('aria-hidden','true');s.textContent=img.getAttribute('data-ini')||'?';img.replaceWith(s);}
    else{var box=img.closest('.hl-league-logo');if(box)box.remove();else img.remove();}
  },true);
  // A minuit (heure du visiteur), les trois onglets glissent d'un jour : celui
  // d'hier devient avant-hier, le flux est relu, et l'onglet ouvert garde sa
  // place (Aujourd'hui reste Aujourd'hui).
  function rollDay(){
    var was=state.days.filter(function(x){return x.day===state.day;})[0];
    state.clock=H.localClock();
    resultFiles={};resultScorers={};indexResults();
    state.days=buildDays(state.matches,H,state.clock,state.resultsByDay);
    var same=was?state.days.filter(function(x){return x.rel===was.rel&&x.count>0;})[0]:null;
    state.day=null;
    state.day=same?same.day:pickDay();
    loadResults();
    renderAll(true);
  }
  // Comptes a rebours : mise a jour du texte seul (pas de re-rendu, pas de perte de focus).
  var tick=setInterval(function(){
    if(state.status!=='ready')return;
    ctx.nowTs=Date.now();
    if(H.localClock().day!==state.clock.day)return rollDay();
    if(Date.now()-lastResults>=DEFAULTS.resultsRefreshMs)loadResults();
    $body.querySelectorAll('[data-hl-ts]').forEach(function(el){
      var row=el.closest('.hl-row'),href=row&&row.getAttribute('href')||'',id=(href.match(/[?&]id=(\d+)/)||[])[1];
      var m=id?findMatch(id):null,cd=m&&countdown(m,H,ctx.nowTs);
      if(cd){el.textContent=cd.text;el.className='hl-tag hl-tag-time is-'+cd.kind;}
    });
  },60000);
  var onFavs=function(){if(state.status==='ready')renderBody(false);};
  var unsub=favorites.subscribe(onFavs),unsubM=favMatches.subscribe(onFavs);

  // Onglet actif par defaut : Aujourd'hui. Hier ne prend jamais la main tout
  // seul (la preuve se consulte, elle ne s'impose pas a l'ouverture).
  function pickDay(preferred){
    var ok=function(d){return state.days.some(function(x){return x.day===d&&x.count>0;});};
    if(preferred&&ok(preferred))return preferred;
    if(state.day&&ok(state.day))return state.day;
    var order=[state.clock.day,state.clock.tomorrow||addDays(state.clock.day,1),yesterdayOf(state.clock)];
    for(var i=0;i<order.length;i++)if(ok(order[i]))return order[i];
    return (state.days[1]||state.days[0]).day;
  }
  // Matchs favoris termines (statut public ou heure du coup d'envoi) : retires de la liste.
  function pruneFavMatches(matches,now){
    var byId={};
    matches.forEach(function(m){if(m&&m.id!=null)byId[String(m.id)]=m;});
    favMatches.prune(function(e){var m=byId[e.id],st=m?matchStatus(m,H,now):null;return !!(st&&st.kind==='finished');});
  }

  renderAll(false);
  loadResults();

  return {
    setLoading:function(){state.status='loading';renderAll();},
    setError:function(onRetry){state.status='error';state.onRetry=onRetry||null;renderAll();},
    // Onglet Hier ouvert depuis l'exterieur (appel a l'action de l'accueil).
    showResults:function(focus){var y=yesterdayOf(state.clock);selectDay(y,focus);return state.day===y;},
    // Entrees du flux d'un jour (buteurs compris) pour « Buteurs du jour ».
    resultsOf:function(day){return (state.resultsByDay[day]||[]).slice();},
    scorersOf:function(day){return (resultScorers[day]||[]).slice();},
    setData:function(matches,opts){
      opts=opts||{};
      if(opts.isPro!==undefined)ctx.isPro=!!opts.isPro;
      if(opts.hasAccount!==undefined)ctx.hasAccount=!!opts.hasAccount;
      matches=Array.isArray(matches)?matches:[];
      pruneFavMatches(matches,Date.now());
      state.status='ready';state.matches=matches;state.clock=H.localClock();
      state.days=buildDays(state.matches,H,state.clock,state.resultsByDay);
      ctx.freeMatchId=opts.freeMatchId!==undefined?opts.freeMatchId:(function(){var f=H.pickFreeMatch(state.matches);return f?f.id:null;})();
      state.day=pickDay(opts.day);
      renderAll(true);
    },
    setContext:function(patch){Object.assign(ctx,patch||{});if(state.status==='ready')renderBody(false);},
    getState:function(){return {day:state.day,days:state.days.slice(),freeMatchId:ctx.freeMatchId,isPro:ctx.isPro,hasAccount:ctx.hasAccount};},
    destroy:function(){unsub();unsubM();clearInterval(tick);rootEl.innerHTML='';}
  };
}

return {mount:mount,renderDateStrip:renderDateStrip,groupByLeague:groupByLeague,renderLeagueBlock:renderLeagueBlock,renderMatchRow:renderMatchRow,
  renderMine:renderMine,renderDayBody:renderDayBody,matchStarHtml:matchStarHtml,
  analysisFor:analysisFor,hasSignal:hasSignal,buildDays:buildDays,countdown:countdown,matchStatus:matchStatus,derbyName:derbyName,
  probBandOf:probBandOf,PROB_BANDS:PROB_BANDS,defaultHelpers:defaultHelpers,
  // Flux de resultats (onglet Hier et verdicts du jour).
  RESULTS:RESULTS,cleanResult:cleanResult,cleanResults:cleanResults,resultTotals:resultTotals,resultOf:resultOf,
  isSettled:isSettled,splitScore:splitScore,resultAsMatch:resultAsMatch,renderResultsBanner:renderResultsBanner,
  renderResultsDay:renderResultsDay,resultsHref:resultsHref};
});
