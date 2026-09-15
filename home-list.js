/* =========================================================================
   IASHARK — Liste des matchs de l'accueil (window.IasharkHomeList).
   Maquette v2 validee par le proprietaire (15/09/2026), integree le 16/09.
   Monte par index.html (source des 9 accueils) ; styles : assets/home-list.css.

   REGLE ABSOLUE : aucune donnee payante (lib/premium-fields.js : conf,
   pari_rec, market_id, cote_rec, probabilites...) n'est lue pour un match
   verrouille. analysisFor() sort AVANT toute lecture de ces champs quand le
   visiteur n'y a pas droit ; la ligne verrouillee n'utilise que des donnees
   publiques : equipes, heure, status, has_signal/no_signal,
   data_quality_label, derby et prob_band (niveau grossier high/good/moderate,
   calcule cote serveur, lib/public-data-split.js#probBand).
   Droit d'ouvrir une analyse : abonne Pro CONFIRME (reponse match-data) ou
   match offert du jour (lib/free-match.js, meme choix que la vitrine).
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
  left:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3.5L5.5 8l4.5 4.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  right:'<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3.5L10.5 8 6 12.5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search:'<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10.5 10.5L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
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

/* ---------- Dates ---------- */
function buildDays(matches,H,clock){
  var counts={};
  matches.forEach(function(m){var d=H.matchDay(m);if(d)counts[d]=(counts[d]||0)+1;});
  [clock.day,clock.tomorrow].forEach(function(d){if(!counts[d])counts[d]=0;});
  return Object.keys(counts).sort().map(function(d){return {day:d,count:counts[d]};});
}
function dayLabels(day,clock){
  var dt=new Date(day+'T12:00:00Z'),lt=localeTag();
  var wd=new Intl.DateTimeFormat(lt,{weekday:'short',timeZone:'UTC'}).format(dt).replace(/\./g,'').slice(0,2).toUpperCase();
  var full=new Intl.DateTimeFormat(lt,{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(dt);
  var top=day===clock.day?t('home_list.day_today_short','Auj.')
    :day===clock.tomorrow?t('home_list.day_tomorrow_short','Dem.')
    :day===addDays(clock.day,-1)?t('home_list.day_yesterday_short','Hier'):wd;
  var rel=day===clock.day?t('home_list.day_today','Aujourd’hui')+', ':day===clock.tomorrow?t('home_list.day_tomorrow','Demain')+', ':'';
  return {top:top,dm:day.slice(8,10)+'.'+day.slice(5,7),full:rel+full};
}
function countLabel(n){return n===1?t('home_list.match_one','1 match'):tf('home_list.match_many','{n} matchs',{n:n});}
function readyLabel(n){return n===1?t('home_list.ready_one','1 analyse prête'):tf('home_list.ready_many','{n} analyses prêtes',{n:n});}

function renderDateStrip(days,activeDay,clock){
  var tabs=days.map(function(d){
    var L=dayLabels(d.day,clock),on=d.day===activeDay;
    return '<button type="button" role="tab" class="hl-day'+(on?' is-active':'')+(d.count?'':' is-empty')+'" id="hl-day-'+d.day+'" data-hl-day="'+d.day+'"'
      +' aria-selected="'+on+'" tabindex="'+(on?0:-1)+'" aria-controls="hl-body">'
      +'<span class="hl-day-top" aria-hidden="true">'+esc(L.top)+'<span class="hl-day-count">'+d.count+'</span></span><span class="hl-day-dm" aria-hidden="true">'+L.dm+'</span>'
      +'<span class="sr-only">'+esc(L.full)+', '+esc(countLabel(d.count))+'</span></button>';
  }).join('');
  return '<button type="button" class="hl-dates-nav" data-hl-scroll="-1" aria-label="'+esc(t('home_list.days_prev','Jours précédents'))+'">'+ICON.left+'</button>'
    +'<div class="hl-dates-track" role="tablist" aria-label="'+esc(t('home_list.days_label','Choisir le jour'))+'">'+tabs+'<span class="hl-dates-ink" aria-hidden="true"></span></div>'
    +'<button type="button" class="hl-dates-nav" data-hl-scroll="1" aria-label="'+esc(t('home_list.days_next','Jours suivants'))+'">'+ICON.right+'</button>';
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
// Compte a rebours honnete : rien au-dela de 24 h (la date est dans la bande).
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
  // Verrou : on sort ICI, avant de lire conf / pari_rec / market_id. Seul le
  // niveau public prob_band est repris.
  if(!ctx.isPro&&!free)return {state:'locked',band:probBandOf(m)};
  var market=m.pari_rec?H.translateMarket(m.pari_rec):(H.marketIdLabel(m)||null);
  var c=(H.hasReliableModelOutput(m)&&m.conf!=null&&m.conf!=='')?normConf(m.conf):null;
  var pn=c==null?null:Math.min(c,10);
  if(!market)return {state:'pending',free:free,prob:pn!=null?fmtProb(pn):null};
  return {state:'open',free:free,probNum:pn,prob:pn!=null?fmtProb(pn):null,market:market};
}

function groupByLeague(list,H){
  var map={},order=[];
  list.forEach(function(m){
    var k=H.leagueKey(m)||'autres';
    if(!map[k]){map[k]={key:k,name:H.leagueName(m),country:H.leagueCountry(m),flag:H.leagueFlag(k),logo:H.leagueLogoUrl(m),matches:[]};order.push(k);}
    map[k].matches.push(m);
  });
  var lt=localeTag();
  return order.map(function(k){var g=map[k];g.matches.sort(H.compareMatches);g.ready=g.matches.filter(hasSignal).length;return g;})
    .sort(function(a,b){return String(a.name).localeCompare(String(b.name),lt,{sensitivity:'base'});});
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

function renderMatchRow(m,ctx,H,index){
  var a=analysisFor(m,ctx,H),ts=H.matchTimestamp(m),cd=countdown(m,H,ctx.nowTs);
  var home=m.home||{},away=m.away||{},heure=H.heure(m),derby=derbyName(m),q=qualityFor(m),sig=hasSignal(m);
  var cls='hl-row hl-grid is-'+a.state+(a.free?' is-free':'')+(cd?' cd-'+cd.kind:'');
  var href=(a.state==='locked'&&ctx.lockedHref==='abonnement')?H.lien('abonnement.html'):H.lien('match.html?id='+encodeURIComponent(m.id));

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
      +'<span class="hl-zone-top"><span class="hl-ready"><i class="hl-dot" aria-hidden="true"></i>'+esc(t('home_list.ready','Analyse prête'))+'</span>'
      +(a.band?bandHtml(a.band):'')+'</span>'
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
      +'<span class="hl-market"><span class="hl-market-lbl">'+esc(t('home_list.market_short','Marché :'))+'</span><span class="hl-market-txt">'+esc(a.market)+'</span></span></span>';
  }else if(a.state==='pending'){
    zone='<span class="hl-zone hl-zone-none"><span class="hl-none-t">'+esc(t('home_app.analysis_in_progress','Analyse en cours'))+'</span></span>';
  }else{
    zone='<span class="hl-zone hl-zone-none"><span class="hl-none-t">'+esc(t('home_list.no_signal_short','Pas de signal clair'))+'</span>'
      +'<span class="hl-none-s">'+esc(t('home_list.no_signal_sub','Aucun pari forcé'))+'</span></span>';
  }

  var anaAria=a.state==='locked'?t('home_list.aria_locked','Analyse prête, réservée aux abonnés Pro.')+(a.band?' '+bandLabel(a.band)+'. '+bandNote():'')
    :a.state==='open'?(a.prob!=null?tf('home_list.aria_prob','Probabilité estimée {p} sur 10.',{p:a.prob})+' ':'')+tf('home_list.aria_market','Marché conseillé : {market}.',{market:a.market})
      +(a.free?' '+t('home_list.aria_free','Analyse offerte.'):'')
    :a.state==='pending'?t('home_app.analysis_in_progress','Analyse en cours')+'.':a.label+'.';
  var extra=[derby?tf('home_list.aria_derby','Derby : {name}',{name:derby}):'',cd?cd.text+(cd.estimated?' ('+t('home_list.estimated','estimé')+')':''):'',q?q.text:''].filter(Boolean).join(', ');
  var aria=tf('home_list.row_aria','{home} contre {away}, {time}. {extra}. {analysis}',{home:home.n||'',away:away.n||'',time:heure,extra:extra,analysis:anaAria}).replace(/\.\s\./g,'.');
  // Suivi du tunnel (funnel-track.js) : ligne verrouillee = kind dedie, sans donnee personnelle.
  var track=a.state==='locked'?' data-track="home_row_lock" data-track-kind="home_row_lock"':'';

  return '<li><a class="'+cls+'" href="'+esc(href)+'" aria-label="'+esc(aria)+'"'+track+' style="--i:'+Math.min(index||0,14)+'">'
    +'<span class="hl-time"><span class="hl-kick">'+esc(heure)+'</span></span>'
    +'<span class="hl-teams">'+teamHtml(home,H)+teamHtml(away,H)+'</span>'
    +'<span class="hl-meta">'+tags.join('')+'</span>'
    +zone+'</a></li>';
}

/* ---------- Rendu competition ---------- */
function renderLeagueBlock(g,ctx,H,startIndex){
  var fav=ctx.favorites.has(g.key),open=!ctx.collapsed[g.key],k=esc(g.key);
  var hid='hl-h-'+k,pid='hl-p-'+k;
  var favLbl=tf(fav?'home_list.fav_remove':'home_list.fav_add',fav?'Retirer {league} de mes compétitions':'Ajouter {league} à mes compétitions',{league:g.name});
  var stats=esc(countLabel(g.matches.length))+(g.ready?' · <b>'+esc(readyLabel(g.ready))+'</b>':'');
  // Ajout aux favoris : kind dedie (cle de competition seulement).
  var track=fav?'':' data-track="'+k+'" data-track-kind="home_fav_add"';
  return '<section class="hl-league'+(open?'':' is-collapsed')+'" data-league="'+k+'">'
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

function renderUpsell(n,H){
  return '<aside class="hl-upsell" data-vente aria-label="'+esc(t('home_list.upsell_aria','Offre Pro'))+'">'
    +'<span class="hl-upsell-ico">'+ICON.lock+'</span>'
    +'<div class="hl-upsell-txt"><strong>'+esc(t('home_list.upsell_title','Débloque toutes les analyses'))+'</strong>'
    +'<p>'+esc(tf('home_list.upsell_text','Probabilité estimée et marché conseillé pour les {n} analyses prêtes de ce jour. Sans engagement.',{n:n}))+'</p></div>'
    +'<a class="hl-upsell-cta" href="'+esc(H.lien('abonnement.html'))+'" data-track="home_list_upsell" data-track-kind="home_list_upsell">'+esc(t('home_list.upsell_cta','Voir les offres'))+' <span aria-hidden="true">→</span></a></aside>';
}
function bannerDayPhrase(day,clock){
  if(day===clock.day)return t('home_list.banner_today','aujourd’hui');
  if(day===clock.tomorrow)return t('home_list.banner_tomorrow','pour demain');
  var L=dayLabels(day,clock);
  return tf('home_list.banner_day','pour {day}',{day:L.top+' '+L.dm});
}
function renderBanner(ready,high,logos,day,clock,ctx,H){
  var past=day<clock.day;
  var num='<span class="hl-num" data-hl-num="'+ready+'">'+ready+'</span>';
  var title=past?tf('home_list.banner_title_past','{ready} publiées ce jour-là',{ready:num+' '+esc(ready===1?t('home_list.ready_word_one','analyse'):t('home_list.ready_word_many','analyses'))})
    :num+' '+esc(ready===1?t('home_list.ready_word_one_ready','analyse prête'):t('home_list.ready_word_many_ready','analyses prêtes'))+' '+esc(bannerDayPhrase(day,clock));
  var highLine=high>0?'<span class="hl-banner-high"><span class="hl-band is-high">'+barsHtml('high')+'</span>'
    +esc(high===1?t('home_list.banner_high_one','dont 1 à probabilité élevée'):tf('home_list.banner_high_many','dont {n} à probabilité élevée',{n:high}))+'</span>':'';
  return '<aside class="hl-banner" data-vente aria-label="'+esc(t('home_list.banner_aria','Analyses disponibles'))+'">'
    +'<span class="hl-banner-logos" aria-hidden="true">'+logos.slice(0,4).map(function(u,i){return '<span style="--k:'+i+'"><img src="'+esc(u)+'" width="18" height="18" alt="" loading="lazy"></span>';}).join('')+'</span>'
    +'<span class="hl-banner-txt"><strong>'+title+'</strong>'+highLine
    +'<small>'+esc(tf('home_list.banner_sub','Probabilité estimée et marché conseillé, calculés sur {n} simulations par match.',{n:fmtInt(ctx.simulations)}))+'</small></span>'
    +'<a class="hl-banner-cta" href="'+esc(H.lien('abonnement.html'))+'" data-track="home_banner_ready" data-track-kind="home_banner_ready">'+esc(t('home_list.banner_cta','Voir les offres'))+'</a></aside>';
}

function renderSkeleton(){
  function row(){return '<div class="hl-skel-row"><span class="hl-sk" style="width:34px;height:14px"></span><span style="flex:1;display:grid;gap:7px"><span class="hl-sk" style="width:62%;height:13px"></span><span class="hl-sk" style="width:48%;height:13px"></span></span><span style="display:grid;gap:5px;justify-items:end"><span class="hl-sk" style="width:74px;height:11px"></span><span class="hl-sk" style="width:110px;height:22px;border-radius:11px"></span></span></div>';}
  function league(){return '<div class="hl-skel-league"><div class="hl-skel-head"><span class="hl-sk" style="width:26px;height:26px;border-radius:7px"></span><span class="hl-sk" style="width:40%;height:14px"></span></div>'+row()+row()+row()+'</div>';}
  return '<div class="hl-skel" aria-hidden="true">'+league()+league()+'</div>';
}

/* ---------- Composant ---------- */
function mount(rootEl,options){
  options=options||{};
  var H=Object.assign(defaultHelpers(),options.helpers||{});
  var FL=root.IasharkFavLeagues;
  var favorites=options.favorites||(FL?FL.createStore():null);
  var collapsed={};
  try{collapsed=JSON.parse(root.sessionStorage.getItem(DEFAULTS.collapsedKey)||'{}')||{};}catch(e){collapsed={};}
  var ctx={isPro:!!options.isPro,freeMatchId:null,lockedHref:options.lockedHref||DEFAULTS.lockedHref,
    upsellAfter:options.upsellAfter||DEFAULTS.upsellAfter,simulations:options.simulations||DEFAULTS.simulations,
    favorites:favorites,collapsed:collapsed,nowTs:Date.now(),counted:false};
  var state={status:'loading',matches:[],days:[],day:null,filter:'all',search:'',clock:H.localClock(),onRetry:null};

  rootEl.classList.add('hl');
  rootEl.innerHTML='<div class="hl-head"><h2 class="hl-title" id="hlTitle">'+esc(t('home_list.title','Matchs du jour'))+'</h2>'
    +'<p class="hl-sub">'+esc(t('home_list.subtitle','Heures dans ton fuseau · touche un match pour ouvrir son analyse'))+'</p></div>'
    +'<div class="hl-dates" data-hl-dates></div>'
    +'<div class="hl-toolbar"><div class="hl-chips" role="group" aria-label="'+esc(t('home_list.filters_label','Filtrer les matchs'))+'" data-hl-chips></div>'
    +'<div class="hl-search">'+ICON.search+'<input type="search" data-hl-search autocomplete="off" enterkeyhint="search" placeholder="'+esc(t('home_list.search_placeholder','Rechercher une équipe'))+'" aria-label="'+esc(t('home_list.search_label','Rechercher une équipe ou une compétition'))+'"></div></div>'
    +'<p class="sr-only" role="status" aria-live="polite" data-hl-live></p>'
    +'<div id="hl-body" class="hl-body" role="tabpanel" data-hl-body></div>';
  var $dates=rootEl.querySelector('[data-hl-dates]'),$chips=rootEl.querySelector('[data-hl-chips]'),
      $search=rootEl.querySelector('[data-hl-search]'),$body=rootEl.querySelector('[data-hl-body]'),$live=rootEl.querySelector('[data-hl-live]');

  function announce(msg){$live.textContent='';setTimeout(function(){$live.textContent=msg;},30);}
  function dayMatches(){return state.matches.filter(function(m){return H.matchDay(m)===state.day;});}
  function searched(list){
    var q=state.search.trim().toLowerCase();
    if(!q)return list;
    return list.filter(function(m){return [m.home&&m.home.n,m.away&&m.away.n,m.league,H.leagueName(m)].some(function(s){return String(s||'').toLowerCase().indexOf(q)!==-1;});});
  }
  function isFav(m){return favorites.has(H.leagueKey(m));}

  function track(){return $dates.querySelector('.hl-dates-track');}
  function renderDates(){$dates.innerHTML=renderDateStrip(state.days,state.day,state.clock);centerActiveDay(false);moveInk(false);}
  function moveInk(animate){
    var tr=track(),ink=tr&&tr.querySelector('.hl-dates-ink'),el=tr&&tr.querySelector('.is-active');
    if(!ink)return;
    if(!el){ink.style.width='0';return;}
    ink.classList.toggle('is-anim',!!animate&&!reducedMotion());
    ink.style.width=el.offsetWidth+'px';
    ink.style.transform='translateX('+el.offsetLeft+'px)';
  }
  function updateNav(){
    var tr=track();if(!tr)return;
    var btns=$dates.querySelectorAll('[data-hl-scroll]');
    if(btns[0])btns[0].disabled=tr.scrollLeft<=2;
    if(btns[1])btns[1].disabled=tr.scrollLeft+tr.clientWidth>=tr.scrollWidth-2;
  }
  function centerActiveDay(smooth){
    var tr=track(),el=tr&&tr.querySelector('.is-active');
    if(!el){updateNav();return;}
    var target=el.offsetLeft-(tr.clientWidth-el.offsetWidth)/2;
    if(smooth&&tr.scrollTo)tr.scrollTo({left:target,behavior:reducedMotion()?'auto':'smooth'});else tr.scrollLeft=target;
    setTimeout(updateNav,smooth?350:0);
  }

  function renderChips(){
    if(state.status!=='ready'){$chips.innerHTML='';return;}
    var base=searched(dayMatches());
    var items=[['all',t('home_list.filter_all','Tous'),base.length],
      ['analysed',t('home_list.filter_analysed','Analyses prêtes'),base.filter(hasSignal).length],
      ['fav',t('home_list.filter_fav','Favoris'),base.filter(isFav).length]];
    $chips.innerHTML=items.map(function(i){
      return '<button type="button" class="hl-chip-btn" data-hl-filter="'+i[0]+'" aria-pressed="'+(state.filter===i[0])+'">'+esc(i[1])+' <b>'+i[2]+'</b></button>';
    }).join('');
  }

  // Compteur qui s'incremente UNE fois (valeur finale deja ecrite dans le DOM).
  function countUpOnce(){
    if(ctx.counted)return;
    var els=$body.querySelectorAll('[data-hl-num]');
    if(!els.length)return;
    ctx.counted=true;
    if(reducedMotion()||!root.requestAnimationFrame)return;
    els.forEach(function(el){
      var end=Number(el.getAttribute('data-hl-num'))||0,t0=root.performance?root.performance.now():0,dur=700;
      if(end<2)return;
      (function step(now){var k=Math.min(1,(now-t0)/dur);el.textContent=Math.round(end*(1-Math.pow(1-k,3)));if(k<1)root.requestAnimationFrame(step);else el.textContent=end;})(t0);
    });
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
      var next=state.days.filter(function(d){return d.day>state.day&&d.count>0;})[0]||state.days.filter(function(d){return d.count>0;}).slice(-1)[0];
      var L=next?dayLabels(next.day,state.clock):null;
      $body.innerHTML='<div class="hl-empty">'+ICON.cal+'<h3>'+esc(t('home_list.empty_title','Aucun match analysé ce jour'))+'</h3>'
        +'<p>'+esc(t('home_list.empty_text','Les analyses sont publiées avant le coup d’envoi. Reviens plus tard ou choisis un autre jour.'))+'</p>'
        +(next?'<button type="button" class="hl-btn" data-hl-goto="'+next.day+'">'+esc(tf('home_list.empty_goto','Voir {day} ({count})',{day:L.top+' '+L.dm,count:countLabel(next.count)}))+'</button>':'')+'</div>';
      return;
    }
    var base=searched(all);
    var list=state.filter==='analysed'?base.filter(hasSignal):state.filter==='fav'?base.filter(isFav):base;
    var readyDay=all.filter(hasSignal).length;
    var lockedAll=ctx.isPro?[]:all.filter(function(m){return hasSignal(m)&&!isFree(m,ctx);});
    var html='';
    if(!ctx.isPro&&readyDay>0){
      var logos=[];groupByLeague(all.filter(hasSignal),H).forEach(function(g){if(g.logo&&logos.indexOf(g.logo)===-1)logos.push(g.logo);});
      var high=lockedAll.filter(function(m){return probBandOf(m)==='high';}).length;
      html+=renderBanner(readyDay,high,logos,state.day,state.clock,ctx,H);
      if(lockedAll.some(probBandOf))html+='<p class="hl-band-note"><span class="hl-band-i" aria-hidden="true">i</span>'+esc(bandNote())+'</p>';
    }else{
      html+='<p class="hl-summary">'+esc(countLabel(base.length))+' · '+esc(readyLabel(base.filter(hasSignal).length))+'</p>';
    }

    if(!list.length&&state.filter!=='fav'){
      $body.innerHTML=html+'<div class="hl-empty">'+ICON.search+'<h3>'+esc(t('home_list.noresult_title','Aucun match trouvé'))+'</h3>'
        +'<p>'+esc(state.search?tf('home_list.noresult_search','Aucun match ne correspond à « {q} » ce jour.',{q:state.search.trim()}):t('home_list.noresult_filter','Aucun match ne correspond à ce filtre ce jour.'))+'</p>'
        +'<button type="button" class="hl-btn" data-hl-reset>'+esc(t('home_list.reset','Afficher tous les matchs'))+'</button></div>';
      return;
    }
    var groups=groupByLeague(list,H);
    var favGroups=groups.filter(function(g){return favorites.has(g.key);});
    var others=groups.filter(function(g){return !favorites.has(g.key);});
    var locked=lockedAll.length;
    var upsellDone=!locked||state.filter==='fav';
    var idx=0;

    html+='<div class="hl-block"><h3 class="hl-block-title">'+ICON.star+esc(t('home_list.fav_title','Mes compétitions'))+'</h3>';
    if(favGroups.length){favGroups.forEach(function(g){html+=renderLeagueBlock(g,ctx,H,idx);idx+=g.matches.length;});}
    else{
      var hint=favorites.list().length?t('home_list.fav_none_today','Aucun match de tes compétitions favorites ce jour.'):t('home_list.fav_hint','Touche l’étoile d’une compétition pour l’épingler ici. Elle restera en haut de la liste.');
      html+='<p class="hl-fav-hint">'+ICON.star+'<span>'+esc(hint)+'</span></p>';
    }
    if(!others.length&&!upsellDone&&favGroups.length){html+=renderUpsell(locked,H);upsellDone=true;}
    html+='</div>';

    if(state.filter!=='fav'&&others.length){
      html+='<div class="hl-block"><h3 class="hl-block-title">'+esc(t('home_list.all_title','Toutes les compétitions'))+' <span class="hl-az">A→Z</span></h3>';
      others.forEach(function(g,i){
        html+=renderLeagueBlock(g,ctx,H,idx);idx+=g.matches.length;
        if(!upsellDone&&(i+1===ctx.upsellAfter||i===others.length-1)){html+=renderUpsell(locked,H);upsellDone=true;}
      });
      html+='</div>';
    }
    $body.classList.toggle('hl-enter',!!animate&&!reducedMotion());
    $body.innerHTML=html;
    if(animate){clearTimeout(renderBody._t);renderBody._t=setTimeout(function(){$body.classList.remove('hl-enter');},1400);}
    countUpOnce();
  }

  function renderAll(animate){renderDates();renderChips();renderBody(animate);}

  function selectDay(day,focus){
    if(!day||day===state.day)return;
    state.day=day;
    $dates.querySelectorAll('.hl-day').forEach(function(b){
      var on=b.getAttribute('data-hl-day')===day;
      b.classList.toggle('is-active',on);b.setAttribute('aria-selected',on);b.tabIndex=on?0:-1;
      if(on&&focus)b.focus({preventScroll:true});
    });
    moveInk(true);centerActiveDay(true);renderChips();renderBody(true);
    var d=state.days.filter(function(x){return x.day===day;})[0];
    announce(dayLabels(day,state.clock).full+' : '+countLabel(d?d.count:0));
  }
  function toggleLeague(btn){
    var sec=btn.closest('.hl-league'),k=sec.getAttribute('data-league'),panel=sec.querySelector('.hl-league-panel');
    var open=btn.getAttribute('aria-expanded')!=='true';
    btn.setAttribute('aria-expanded',open);sec.classList.toggle('is-collapsed',!open);
    if(open){panel.removeAttribute('inert');panel.removeAttribute('aria-hidden');delete collapsed[k];}
    else{panel.setAttribute('inert','');panel.setAttribute('aria-hidden','true');collapsed[k]=1;}
    try{root.sessionStorage.setItem(DEFAULTS.collapsedKey,JSON.stringify(collapsed));}catch(e){}
  }

  rootEl.addEventListener('click',function(e){
    var el=e.target.closest('button');
    if(!el||!rootEl.contains(el))return;
    if(el.hasAttribute('data-hl-day'))return selectDay(el.getAttribute('data-hl-day'));
    if(el.hasAttribute('data-hl-scroll')){var tr=track();tr.scrollBy({left:Number(el.getAttribute('data-hl-scroll'))*tr.clientWidth*.7,behavior:reducedMotion()?'auto':'smooth'});return;}
    if(el.hasAttribute('data-hl-toggle'))return toggleLeague(el);
    if(el.hasAttribute('data-hl-fav')){
      var k=el.getAttribute('data-hl-fav'),name=(el.closest('.hl-league').querySelector('.hl-league-name')||{}).textContent||k;
      var added=favorites.toggle(k);
      renderChips();renderBody(false);
      var again=rootEl.querySelector('[data-hl-fav="'+k+'"]');
      if(again){again.focus({preventScroll:false});if(added&&!reducedMotion())again.classList.add('is-pop');}
      announce(tf(added?'home_list.fav_added':'home_list.fav_removed',added?'{league} ajoutée à mes compétitions':'{league} retirée de mes compétitions',{league:name}));
      return;
    }
    if(el.hasAttribute('data-hl-filter')){state.filter=el.getAttribute('data-hl-filter');renderChips();renderBody(false);return;}
    if(el.hasAttribute('data-hl-goto'))return selectDay(el.getAttribute('data-hl-goto'),true);
    if(el.hasAttribute('data-hl-reset')){state.filter='all';state.search='';$search.value='';renderChips();renderBody(false);return;}
    if(el.hasAttribute('data-hl-retry')&&state.onRetry)state.onRetry();
  });
  rootEl.addEventListener('keydown',function(e){
    var el=e.target;
    if(el.classList&&el.classList.contains('hl-day')){
      var tabs=[].slice.call($dates.querySelectorAll('.hl-day')),i=tabs.indexOf(el),n=null;
      if(e.key==='ArrowRight')n=Math.min(i+1,tabs.length-1);else if(e.key==='ArrowLeft')n=Math.max(i-1,0);
      else if(e.key==='Home')n=0;else if(e.key==='End')n=tabs.length-1;
      if(n!=null){e.preventDefault();selectDay(tabs[n].getAttribute('data-hl-day'),true);tabs[n].focus();}
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
  var timer=null;
  $search.addEventListener('input',function(){clearTimeout(timer);timer=setTimeout(function(){state.search=$search.value;renderChips();renderBody(false);},140);});
  $dates.addEventListener('scroll',updateNav,true);
  var onResize=function(){moveInk(false);updateNav();};
  root.addEventListener('resize',onResize);
  rootEl.addEventListener('error',function(e){
    var img=e.target;
    if(!img||img.tagName!=='IMG')return;
    if(img.classList.contains('hl-logo')){var s=document.createElement('span');s.className='hl-logo hl-logo-ph';s.setAttribute('aria-hidden','true');s.textContent=img.getAttribute('data-ini')||'?';img.replaceWith(s);}
    else{var box=img.closest('.hl-league-logo,.hl-banner-logos>span');if(box)box.remove();else img.remove();}
  },true);
  // Comptes a rebours : mise a jour du texte seul (pas de re-rendu, pas de perte de focus).
  var tick=setInterval(function(){
    if(state.status!=='ready')return;
    ctx.nowTs=Date.now();
    $body.querySelectorAll('[data-hl-ts]').forEach(function(el){
      var row=el.closest('.hl-row'),href=row&&row.getAttribute('href')||'',id=(href.match(/[?&]id=(\d+)/)||[])[1],m=null;
      if(id)state.matches.some(function(x){if(String(x.id)===id){m=x;return true;}return false;});
      var cd=m&&countdown(m,H,ctx.nowTs);
      if(cd){el.textContent=cd.text;el.className='hl-tag hl-tag-time is-'+cd.kind;}
    });
  },60000);
  var unsub=favorites.subscribe(function(){if(state.status==='ready'){renderChips();renderBody(false);}});

  function pickDay(preferred){
    var has=function(d){return state.days.some(function(x){return x.day===d&&x.count>0;});};
    if(preferred&&state.days.some(function(x){return x.day===preferred;}))return preferred;
    if(state.day&&state.days.some(function(x){return x.day===state.day;})&&state.day>=state.clock.day)return state.day;
    if(has(state.clock.day))return state.clock.day;
    if(has(state.clock.tomorrow))return state.clock.tomorrow;
    var fut=state.days.filter(function(x){return x.day>state.clock.day&&x.count>0;})[0];
    return fut?fut.day:state.clock.day;
  }

  renderAll(false);

  return {
    setLoading:function(){state.status='loading';renderChips();renderBody();},
    setError:function(onRetry){state.status='error';state.onRetry=onRetry||null;renderChips();renderBody();},
    setData:function(matches,opts){
      opts=opts||{};
      if(opts.isPro!==undefined)ctx.isPro=!!opts.isPro;
      state.status='ready';state.matches=Array.isArray(matches)?matches:[];state.clock=H.localClock();
      state.days=buildDays(state.matches,H,state.clock);
      ctx.freeMatchId=opts.freeMatchId!==undefined?opts.freeMatchId:(function(){var f=H.pickFreeMatch(state.matches);return f?f.id:null;})();
      state.day=pickDay(opts.day);
      renderAll(true);
    },
    setContext:function(patch){Object.assign(ctx,patch||{});if(state.status==='ready'){renderChips();renderBody(false);}},
    getState:function(){return {day:state.day,filter:state.filter,search:state.search,freeMatchId:ctx.freeMatchId,isPro:ctx.isPro};},
    destroy:function(){unsub();clearInterval(tick);root.removeEventListener('resize',onResize);rootEl.innerHTML='';}
  };
}

return {mount:mount,renderDateStrip:renderDateStrip,groupByLeague:groupByLeague,renderLeagueBlock:renderLeagueBlock,renderMatchRow:renderMatchRow,
  analysisFor:analysisFor,hasSignal:hasSignal,buildDays:buildDays,countdown:countdown,matchStatus:matchStatus,derbyName:derbyName,
  probBandOf:probBandOf,PROB_BANDS:PROB_BANDS,defaultHelpers:defaultHelpers};
});
