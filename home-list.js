/* =========================================================================
   IASHARK — Liste des matchs de l'accueil (window.IasharkHomeList).
   Maquette v2 validee par le proprietaire (15/09/2026), integree le 16/09,
   simplifiee le 16/09 (demande du proprietaire) : trois onglets
   Aujourd'hui / Demain / Apres-demain, plus de banniere, de recherche ni de
   filtres ; etoile sur chaque competition ET sur chaque match ; competitions
   favorites en tete de la meme liste, matchs favoris en tete de leur
   competition et petite section « Mes matchs » en haut s'il y en a.
   Monte par index.html (source des 9 accueils) ; styles : assets/home-list.css.

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
  collapsedKey:'iashark.hlCollapsed.v1'};
var PROB_BANDS=['high','good','moderate'];

/* ---------- i18n (memes helpers qu'index.html) ---------- */
function t(key,fb){return (root.I18N&&root.I18N.t)?root.I18N.t(key,fb):fb;}
function tf(key,fb,vars){var s=String(t(key,fb));return vars?s.replace(/\{(\w+)\}/g,function(m,k){return vars[k]!=null?vars[k]:m;}):s;}
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function localeTag(){return (root.I18N&&root.I18N.localeTag)?root.I18N.localeTag():'fr-FR';}
function lien(p){return (root.I18N&&root.I18N.href)?root.I18N.href(p):'/'+p;}
function reducedMotion(){return !!(root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches);}

/* ---------- Icones ---------- */
var ICON={
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3L2.8 9.5l6.4-.9z"/></svg>',
  chev:'<svg class="hl-chev" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  lock:'<svg class="hl-lock-ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1.6" fill="currentColor"/><path d="M5.2 7V5.2a2.8 2.8 0 015.6 0V7" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  cal:'<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  alert:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.5l9.5 16.5h-19z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.2v.3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
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
    lien:lien
  };
}
// Store vide (tests, ou lib/fav-leagues.js absent) : aucune etoile allumee.
var NO_FAVS={has:function(){return false;},list:function(){return [];},toggle:function(){return false;},prune:function(){return false;},subscribe:function(){return function(){};}};

/* ---------- Dates : Aujourd'hui / Demain / Apres-demain ---------- */
// Onglets (20/09/2026, demande du proprietaire) : « Apres-demain » etait
// toujours vide ; il laisse la place a « Hier », qui montre les memes lignes
// que les autres jours avec, en plus, un liseré vert si la recommandation est
// passee, rouge sinon. Rien d'autre n'est ajoute : ni score, ni pari, ni cote.
var DAY_NAMES=[['home_list.day_yesterday','Hier'],['home_list.day_today','Aujourd’hui'],['home_list.day_tomorrow','Demain']];
function buildDays(matches,H,clock,veille){
  var hier=addDays(clock.day,-1);
  var ds=[hier,clock.day,clock.tomorrow||addDays(clock.day,1)],counts={};
  (matches||[]).forEach(function(m){var d=H.matchDay(m);if(ds.indexOf(d)!==-1)counts[d]=(counts[d]||0)+1;});
  // La veille ne vient pas de la liste du jour (le calcul quotidien ne publie
  // que le jour meme et les suivants) mais du fichier de resultats.
  counts[hier]=(veille&&veille.length)||0;
  return ds.map(function(d,i){return {day:d,count:counts[d]||0,rel:i,yesterday:d===hier};});
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

/* ---------- Donnees match (publiques sauf analysisFor ouvert) ---------- */
// has_signal (public) d'abord : pour un match verrouille, pari_rec n'est jamais lu.
// Ligne d'une journee passee (onglet « Hier ») : elle n'a pas de champ
// d'analyse et on n'en lit aucun, meme pour un abonne (tests/home-list-yesterday).
function hasSignal(m){
  if(m&&m.past===true)return false;
  return !!(m&&(m.has_signal||m.pari_rec||m.market_id))&&!m.no_signal;
}
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
  // Journee passee (onglet « Hier ») : la ligne ne porte aucune analyse, juste
  // son liseré. Aucun champ payant n'est lu, meme pour un abonne.
  if(m&&m.past===true)return {state:'past',free:false};
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

/* ---------- Resultats de la veille : la couleur, rien d'autre ----------
   Source : /results/<jour>.json, ecrit chaque jour par le calcul quotidien
   (lib/match-results.js). On n'en lit QUE le verdict et de quoi afficher la
   ligne comme les autres jours : equipes, ecussons, competition, heure.
   Aucun pari, aucune cote, aucun score : la ligne d'hier ressemble a celle
   d'aujourd'hui, avec un liseré vert ou rouge en plus.
   Match non regle : aucune couleur, jamais une couleur au hasard. */
function rtxt(v){return typeof v==='string'&&v.trim()?v.trim():null;}
function rid(v){return v!=null&&/^\d{1,12}$/.test(String(v))?Number(v):null;}
function veilleEntree(e){
  if(!e||typeof e!=='object')return null;
  var id=rid(e.id!=null?e.id:e.fixture_id);
  if(id==null)return null;
  var verdict=String(e.result||'').toLowerCase();
  return {
    id:String(id),
    home:{n:rtxt(e.home)||'',id:rid(e.home_id)},
    away:{n:rtxt(e.away)||'',id:rid(e.away_id)},
    league:rtxt(e.league)||'',league_key:String(e.league_key||'').toLowerCase(),
    date:rtxt(e.kickoff)||'',status:'FT',
    // Le verdict n'existe que s'il a vraiment ete etabli.
    verdict:verdict==='win'||verdict==='loss'?verdict:null,
    past:true
  };
}
function veilleListe(fichier){
  var out=[];
  ((fichier&&fichier.matches)||[]).forEach(function(e){var c=veilleEntree(e);if(c&&c.home.n&&c.away.n)out.push(c);});
  return out;
}

// Petit appel a aller voir la preuve (20/09/2026) : une pastille sous les
// onglets, visible seulement quand on n'est PAS deja sur « Hier ». Elle dit le
// compte du jour ecoule, rien de cumule.
function veilleAppel(liste,actif,jourHier){
  if(!liste||!liste.length||actif===jourHier)return '';
  var passees=0,reglees=0;
  liste.forEach(function(m){ if(m.verdict==='win'){passees++;reglees++;} else if(m.verdict==='loss')reglees++; });
  if(!reglees)return '';
  return '<button type="button" class="hl-proof" data-hl-proof>'
    +'<span class="hl-proof-dot" aria-hidden="true"></span>'
    +'<span class="hl-proof-t">'+esc(tf('home_list.proof_cta','Hier : {won} recommandations passées sur {total}',{won:passees,total:reglees}))+'</span>'
    +'<span class="hl-proof-go" aria-hidden="true">→</span></button>';
}

/* ---------- Rendu ligne ---------- */
function initials(n){return String(n||'?').replace(/[^A-Za-zÀ-ÿ0-9 ]/g,'').split(' ').filter(Boolean).slice(0,2).map(function(w){return w[0];}).join('').toUpperCase()||'?';}
function teamHtml(tm,H){
  var url=H.teamLogoUrl(tm),ini=esc(initials(tm&&tm.n));
  var logo=url?'<img class="hl-logo" src="'+esc(url)+'" width="18" height="18" alt="" loading="lazy" decoding="async" data-ini="'+ini+'">'
    :'<span class="hl-logo hl-logo-ph" aria-hidden="true">'+ini+'</span>';
  return '<span class="hl-team">'+logo+'<span class="hl-tname">'+esc(tm&&tm.n||'')+'</span></span>';
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
  var a=analysisFor(m,ctx,H),ts=H.matchTimestamp(m),cd=countdown(m,H,ctx.nowTs);
  var home=m.home||{},away=m.away||{},heure=H.heure(m),derby=derbyName(m),q=qualityFor(m),sig=hasSignal(m);
  // Liseré de verdict : vert si la recommandation est passee, rouge sinon.
  // Rien si le match n'a pas encore ete regle.
  var verdict=m&&m.verdict==='win'?' hl-win':m&&m.verdict==='loss'?' hl-loss':'';
  var cls='hl-row hl-grid is-'+a.state+(a.free?' is-free':'')+(cd?' cd-'+cd.kind:'')+verdict;
  var href=(a.state==='locked'&&ctx.lockedHref==='abonnement')?H.lien('abonnement.html'):H.lien('match.html?id='+encodeURIComponent(m.id));

  // Indicateurs PUBLICS reels uniquement.
  var tags=[];
  if(a.free)tags.push('<span class="hl-tag hl-tag-free">'+esc(t('home_list.free_chip','Offert'))+'</span>');
  if(derby)tags.push('<span class="hl-tag hl-tag-derby" title="'+esc(derby)+'">'+esc(t('home_list.derby_chip','Derby'))+'</span>');
  if(cd)tags.push('<span class="hl-tag hl-tag-time is-'+cd.kind+'" data-hl-ts="'+(isFinite(ts)?ts:'')+'"'+(cd.estimated?' title="'+esc(t('home_list.status_estimated','Statut estimé d’après l’heure du coup d’envoi'))+'"':'')+'>'+esc(cd.text)+'</span>');
  if(q)tags.push('<span class="hl-tag hl-tag-q is-'+q.level+'"><i aria-hidden="true"></i>'+esc(q.text)+'</span>');
  if(sig)tags.push('<span class="hl-tag hl-tag-sim">'+esc(tf('home_list.sims','{n} simulations',{n:fmtInt(ctx.simulations)}))+'</span>');

  var zone;
  if(a.state==='past'){
    zone='';
  }else if(a.state==='locked'){
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
  }else if(a.state==='gated'){
    zone='<span class="hl-zone"><span class="hl-ready"><i class="hl-dot" aria-hidden="true"></i>'+esc(t('home_list.free_gated','Analyse offerte'))+'</span>'
      +'<span class="hl-freepill">'+esc(t('home_list.free_gated_cta','Compte gratuit'))+'</span></span>';
  }else if(a.state==='pending'){
    zone='<span class="hl-zone hl-zone-none"><span class="hl-none-t">'+esc(t('home_app.analysis_in_progress','Analyse en cours'))+'</span></span>';
  }else{
    zone='<span class="hl-zone hl-zone-none"><span class="hl-none-t">'+esc(t('home_list.no_signal_short','Pas de signal clair'))+'</span>'
      +'<span class="hl-none-s">'+esc(t('home_list.no_signal_sub','Aucun pari forcé'))+'</span></span>';
  }

  var anaAria=a.state==='past'?(m.verdict==='win'?t('home_list.aria_won','Recommandation passée.')
      :m.verdict==='loss'?t('home_list.aria_lost','Recommandation non passée.'):t('home_list.aria_pending','Résultat non encore établi.'))
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
    +'<span class="hl-teams">'+teamHtml(home,H)+teamHtml(away,H)+'</span>'
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
  var lockedAll=ctx.isPro?[]:all.filter(function(m){return hasSignal(m)&&!isFree(m,ctx);});
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
    favorites:favorites,favMatches:favMatches,collapsed:collapsed,nowTs:Date.now()};
  var state={status:'loading',matches:[],days:[],day:null,clock:H.localClock(),onRetry:null,veille:[],veilleJour:null};

  rootEl.classList.add('hl');
  rootEl.innerHTML='<div class="hl-head"><h2 class="hl-title" id="hlTitle">'+esc(t('home_list.title','Matchs du jour'))+'</h2>'
    +'<p class="hl-sub">'+esc(t('home_list.subtitle','Heures dans ton fuseau · touche l’étoile pour suivre une compétition ou un match'))+'</p></div>'
    +'<div class="hl-dates" data-hl-dates></div>'
    +'<p class="sr-only" role="status" aria-live="polite" data-hl-live></p>'
    +'<div id="hl-body" class="hl-body" role="tabpanel" data-hl-body></div>';
  var $dates=rootEl.querySelector('[data-hl-dates]'),$body=rootEl.querySelector('[data-hl-body]'),$live=rootEl.querySelector('[data-hl-live]');

  function announce(msg){$live.textContent='';setTimeout(function(){$live.textContent=msg;},30);}
  function hierJour(){return addDays(state.clock.day,-1);}
  function dayMatches(){
    if(state.day===hierJour())return state.veille;
    return state.matches.filter(function(m){return H.matchDay(m)===state.day;});
  }
  // Fichier de la veille : une seule requete, au chargement et a chaque
  // changement de jour. Absent (404, reseau) : l'onglet reste vide, rien ne
  // casse et aucun autre jour n'est affecte.
  function chargerVeille(){
    var jour=hierJour();
    if(state.veilleJour===jour||typeof root.fetch!=='function')return;
    state.veilleJour=jour;
    root.fetch('/results/'+jour+'.json',{cache:'no-cache'}).then(function(r){
      return r&&r.ok?r.json():null;
    }).then(function(f){
      if(!f||state.veilleJour!==jour)return;
      state.veille=veilleListe(f);
      if(state.status==='ready'){
        state.days=buildDays(state.matches,H,state.clock,state.veille);
        renderDates();
        if(state.day===jour)renderBody(false);
      }
    }).catch(function(){});
  }
  function findMatch(id){var f=null;state.matches.some(function(x){if(x&&String(x.id)===String(id)){f=x;return true;}return false;});return f;}

  function renderDates(){
    $dates.innerHTML=state.status==='ready'&&state.days.length
      ?renderDateStrip(state.days,state.day)+veilleAppel(state.veille,state.day,hierJour()):'';
  }

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
    var all=dayMatches();
    if(!all.length){
      $body.innerHTML='<div class="hl-empty">'+ICON.cal+'<h3>'+esc(t('home_list.empty_title','Aucun match analysé ce jour'))+'</h3>'
        +'<p>'+esc(t('home_list.empty_text','Les analyses sont publiées avant le coup d’envoi. Reviens plus tard ou choisis un autre jour.'))+'</p></div>';
      return;
    }
    $body.classList.toggle('hl-enter',!!animate&&!reducedMotion());
    $body.innerHTML=renderDayBody(all,ctx,H);
    if(animate){clearTimeout(renderBody._t);renderBody._t=setTimeout(function(){$body.classList.remove('hl-enter');},1400);}
  }

  function renderAll(animate){renderDates();renderBody(animate);}

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
    if(el.hasAttribute('data-hl-proof'))return selectDay(hierJour(),true);
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
  // Comptes a rebours : mise a jour du texte seul (pas de re-rendu, pas de perte de focus).
  var tick=setInterval(function(){
    if(state.status!=='ready')return;
    ctx.nowTs=Date.now();
    $body.querySelectorAll('[data-hl-ts]').forEach(function(el){
      var row=el.closest('.hl-row'),href=row&&row.getAttribute('href')||'',id=(href.match(/[?&]id=(\d+)/)||[])[1];
      var m=id?findMatch(id):null,cd=m&&countdown(m,H,ctx.nowTs);
      if(cd){el.textContent=cd.text;el.className='hl-tag hl-tag-time is-'+cd.kind;}
    });
  },60000);
  var onFavs=function(){if(state.status==='ready')renderBody(false);};
  var unsub=favorites.subscribe(onFavs),unsubM=favMatches.subscribe(onFavs);

  function pickDay(preferred){
    var ok=function(d){return state.days.some(function(x){return x.day===d&&x.count>0;});};
    if(preferred&&ok(preferred))return preferred;
    if(state.day&&ok(state.day))return state.day;
    // Toujours ouvrir sur AUJOURD'HUI, puis demain. « Hier » ne s'ouvre jamais
    // tout seul : c'est une preuve qu'on consulte, pas le jour a jouer.
    var ordre=state.days.filter(function(x){return !x.yesterday&&x.count>0;});
    if(ordre.length)return ordre[0].day;
    var veille=state.days.filter(function(x){return x.count>0;})[0];
    return veille?veille.day:state.days[1]?state.days[1].day:state.days[0].day;
  }
  // Matchs favoris termines (statut public ou heure du coup d'envoi) : retires de la liste.
  function pruneFavMatches(matches,now){
    var byId={};
    matches.forEach(function(m){if(m&&m.id!=null)byId[String(m.id)]=m;});
    favMatches.prune(function(e){var m=byId[e.id],st=m?matchStatus(m,H,now):null;return !!(st&&st.kind==='finished');});
  }

  renderAll(false);

  return {
    setLoading:function(){state.status='loading';renderAll();},
    setError:function(onRetry){state.status='error';state.onRetry=onRetry||null;renderAll();},
    setData:function(matches,opts){
      opts=opts||{};
      if(opts.isPro!==undefined)ctx.isPro=!!opts.isPro;
      if(opts.hasAccount!==undefined)ctx.hasAccount=!!opts.hasAccount;
      matches=Array.isArray(matches)?matches:[];
      pruneFavMatches(matches,Date.now());
      state.status='ready';state.matches=matches;state.clock=H.localClock();
      state.days=buildDays(state.matches,H,state.clock,state.veille);
      ctx.freeMatchId=opts.freeMatchId!==undefined?opts.freeMatchId:(function(){var f=H.pickFreeMatch(state.matches);return f?f.id:null;})();
      state.day=pickDay(opts.day);
      renderAll(true);
      chargerVeille();
    },
    setContext:function(patch){Object.assign(ctx,patch||{});if(state.status==='ready')renderBody(false);},
    getState:function(){return {day:state.day,days:state.days.slice(),freeMatchId:ctx.freeMatchId,isPro:ctx.isPro,hasAccount:ctx.hasAccount};},
    destroy:function(){unsub();unsubM();clearInterval(tick);rootEl.innerHTML='';}
  };
}

return {mount:mount,veilleListe:veilleListe,veilleAppel:veilleAppel,renderDateStrip:renderDateStrip,groupByLeague:groupByLeague,renderLeagueBlock:renderLeagueBlock,renderMatchRow:renderMatchRow,
  renderMine:renderMine,renderDayBody:renderDayBody,matchStarHtml:matchStarHtml,
  analysisFor:analysisFor,hasSignal:hasSignal,buildDays:buildDays,countdown:countdown,matchStatus:matchStatus,derbyName:derbyName,
  probBandOf:probBandOf,PROB_BANDS:PROB_BANDS,defaultHelpers:defaultHelpers};
});
