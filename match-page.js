(function(){'use strict';
const root=document.getElementById('matchRoot');
// i18n : repli local, jamais une erreur si I18N n'est pas charge (ou pas
// encore pret) - on renvoie alors toujours le libelle francais d'origine.
function t(key,fallback){return (window.I18N&&window.I18N.t)?window.I18N.t(key,fallback):fallback;}
function localeTag(){return (window.I18N&&window.I18N.localeTag)?window.I18N.localeTag():'fr-FR';}
// Gabarit a variables {nom} (remplacement en une passe : une valeur qui
// contient elle-meme des accolades n'est jamais re-substituee).
function tf(key,fallback,vars){const s=String(t(key,fallback));return vars?s.replace(/\{(\w+)\}/g,(m,k)=>vars[k]!=null?vars[k]:m):s;}
// Lien interne qui garde le visiteur dans son repertoire de langue/marche.
function lien(p){return (window.I18N&&window.I18N.href)?window.I18N.href(p):'/'+p;}
function estFr(){return !(window.I18N&&window.I18N.locale)||window.I18N.locale==='fr';}
// Textes rediges par le pipeline : francais d'origine ; hors FR, uniquement
// leur traduction validee (<champ>_i18n, es-mx -> es) ; sans traduction,
// rien - jamais du francais, jamais une traduction inventee.
function narratif(v,i18n){
  if(estFr())return v;
  const vmLib=window.IasharkMatchViewModel;
  return vmLib&&vmLib.localizedNarrative?vmLib.localizedNarrative(v,i18n,window.I18N.locale):null;
}
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,d=1)=>n(v)===null?'—':Number(v).toLocaleString(localeTag(),{maximumFractionDigits:d});
// Pourcentage au format de la langue ("70 %" en francais, "70%" en anglais).
const pct=(v,d=1)=>n(v)===null?'—':(Number(v)/100).toLocaleString(localeTag(),{style:'percent',maximumFractionDigits:d});
const odds=v=>n(v)===null?'—':Number(v).toLocaleString(localeTag(),{minimumFractionDigits:2,maximumFractionDigits:2});
// Ecart en points : toujours signe ("+4,4 pts", "−2,1 pts").
const pts=v=>n(v)===null?'—':`${v>0?'+':v<0?'−':''}${fmt(Math.abs(v))} ${t('match_page.points_short','pts')}`;
const clamp=v=>Math.max(0,Math.min(100,n(v)||0));
const img=(src,alt)=>src?`<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">`:'';
const empty=txt=>`<div class="empty">${esc(txt)}</div>`;

// Icones : purement decoratives (aria-hidden), memes tokens de couleur.
const ICONS={
  compare:'<path d="M6 20V10M12 20V4M18 20v-7"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  target2:'<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/>',
  chart:'<path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6"/>',
  cloud:'<path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 8.5 4.5 4.5 0 0 1 15.5 18H7Z"/>',
  scale:'<path d="M12 3v18M7 7 4 13a3 3 0 0 0 6 0L7 7ZM17 7l-3 6a3 3 0 0 0 6 0l-3-6ZM4 7h6M14 7h6"/>',
  alert:'<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.01"/>',
  trend:'<path d="M4 17 10 11l4 4 6-8"/><path d="M16 6h4v4"/>',
  faq:'<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.8 2.8 0 0 1 5.5.8c0 1.9-2.7 2.2-2.7 4"/><circle cx="12" cy="17.4" r=".9" fill="currentColor" stroke="none"/>',
  lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  table:'<path d="M4 5h16v14H4zM4 10h16M4 15h16M10 5v14"/>',
  cross:'<path d="M12 5v14M5 12h14"/><circle cx="12" cy="12" r="9"/>',
  pin:'<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/>'
};
const cardIcon=key=>ICONS[key]?`<svg viewBox="0 0 24 24" class="card-icon" aria-hidden="true" focusable="false">${ICONS[key]}</svg>`:'';
const card=(title,body,cls='',icon='')=>`<section class="card reveal ${cls}"><h2>${cardIcon(icon)}${esc(title)}</h2>${body}</section>`;

// Traduction d'un libelle de marche du moteur dans la forme standard des
// bookmakers, avec les noms des equipes (lib/market-labels.js) : "DC 1X" ->
// "Double chance : Leeds ou nul". Appliquee a l'AFFICHAGE seulement.
// Nom historique conserve ; le libelle sort dans la langue active.
function marcheFr(vm,libelle){
  const ml=window.IasharkMarketLabels;
  return ml?(ml.marketLabel||ml.marketLabelFr)(libelle,{home:vm.identity.home.name,away:vm.identity.away.name}):String(libelle||'');
}
// Ligne du tableau des marches : l'identifiant moteur quand il est connu
// (plus fiable), sinon le libelle.
function libelleLigne(vm,row){
  const ml=window.IasharkMarketLabels,eq={home:vm.identity.home.name,away:vm.identity.away.name};
  if(ml&&row.id&&ml.marketIdLabel){const s=ml.marketIdLabel(row.id,eq);if(s&&s!==row.id)return s;}
  return marcheFr(vm,row.label);
}

// Rang au classement dans la convention de la langue (1er/2e, 1st/2nd...).
function rangOrdinal(v){
  let cat='other';
  try{cat=new Intl.PluralRules(localeTag(),{type:'ordinal'}).select(Number(v));}catch(e){}
  return tf('match_page.rank_ordinal_'+cat,cat==='one'?'{n}er':'{n}e',{n:v});
}
// Forme : lettres de la langue (V/N/D en francais, W/D/L en anglais).
const FORM_LETTRES={W:['match_page.form_letter_w','V'],D:['match_page.form_letter_d','N'],L:['match_page.form_letter_l','D']};
const FORM_ISSUES={W:['match_page.form_result_w','Victoire'],D:['match_page.form_result_d','Nul'],L:['match_page.form_result_l','Défaite']};
const lettre=r=>FORM_LETTRES[r]?t(FORM_LETTRES[r][0],FORM_LETTRES[r][1]):r;
function formStrip(rows,standingsForm){
  // Du plus ancien au plus recent : le dernier match est a droite.
  const list=rows&&rows.length?rows.slice().reverse():String(standingsForm||'').slice(-5).split('').filter(c=>'WDL'.includes(c)).map(c=>({result:c}));
  if(!list.length)return '';
  return `<ol class="form-strip" aria-label="${esc(t('match_page.form_aria','Forme récente, du plus ancien au plus récent'))}">${list.map(r=>{
    const issue=FORM_ISSUES[r.result]?t(FORM_ISSUES[r.result][0],FORM_ISSUES[r.result][1]):r.result;
    const detail=r.score?`${issue} ${r.score}${r.opponent?' · '+r.opponent:''}`:issue;
    return `<li class="f-${r.result.toLowerCase()}" title="${esc(detail)}"><span aria-hidden="true">${esc(lettre(r.result))}</span><span class="sr-only">${esc(detail)}</span></li>`;
  }).join('')}</ol>`;
}
function teamMeta(s,rows){
  const bits=s?`<small>${esc(rangOrdinal(s.rank))} · ${esc(s.pts)} ${esc(t('match_page.points_short','pts'))}</small>`:'';
  return `${bits}${formStrip(rows,s&&s.form)}`;
}
// Nom de competition : config/leagues.json (lib/league-names.js) d'abord.
function nomLigue(i,vm){
  const officiel=vm&&vm._raw&&window.IasharkLeagueNames?window.IasharkLeagueNames.displayName(vm._raw.league_key):null;
  if(officiel)return officiel;
  return i.league.name==='Compétition'?t('match_page.league_fallback','Compétition'):i.league.name;
}
// Date et heure du coup d'envoi dans la langue ET le fuseau du visiteur, nom
// court du fuseau a cote de l'heure (lib/match-time.js).
function dateHeure(vm){
  const mt=window.IasharkMatchTime,raw=vm._raw;
  if(mt&&raw&&mt.matchDate(raw))return{date:mt.formatDate(raw,localeTag()),time:mt.formatTime(raw,localeTag(),{zone:true})};
  return{date:vm.identity.date,time:vm.identity.time};
}
// "21C" (OpenWeather via le pipeline) -> "21 °C" au format de la langue.
function temperature(v){
  const m=String(v==null?'':v).match(/-?\d+(?:[.,]\d+)?/);
  if(!m)return String(v==null?'':v);
  return `${Number(m[0].replace(',','.')).toLocaleString(localeTag(),{maximumFractionDigits:0})} °C`;
}
const METEO_CLES={
  'ciel dégagé':'clear_sky','peu nuageux':'few_clouds','partiellement nuageux':'scattered_clouds','nuageux':'broken_clouds',
  'couvert':'overcast','légère pluie':'light_rain','pluie modérée':'moderate_rain','forte pluie':'heavy_rain',
  'très forte pluie':'very_heavy_rain','pluie verglaçante':'freezing_rain','légère averse de pluie':'light_shower_rain',
  'averse de pluie':'shower_rain','forte averse de pluie':'heavy_shower_rain','bruine légère':'light_drizzle','bruine':'drizzle',
  'orage':'thunderstorm','orage et pluie fine':'thunderstorm_light_rain','orage et pluie':'thunderstorm_rain',
  'légère neige':'light_snow','neige':'snow','forte neige':'heavy_snow','brume':'mist','brouillard':'fog','brume sèche':'haze'
};
// Description inconnue hors FR : masquee (la temperature reste affichee).
function meteo(desc){
  const d=String(desc||'').trim();
  if(!d)return '';
  if(estFr())return d;
  const k=METEO_CLES[d.toLowerCase()];
  return k?t('match_page.weather_'+k,''):'';
}

// EN-TETE. Le h1 unique de la page : les deux equipes. Competition, heure
// locale avec fuseau, stade, meteo, rang et forme. AUCUNE probabilite du
// modele : l'en-tete est aussi celui des murs d'acces (match payant sans Pro).
function hero(vm){
  const i=vm.identity,s=i.standings||{},dh=dateHeure(vm),ln=nomLigue(i,vm),f=vm.form||{};
  const c=vm.conditions;
  const lieu=c.venue||c.weather?`<div class="hero-venue">${c.venue?`<span>${cardIcon('pin')}${esc(c.venue)}</span>`:''}${c.weather?`<span>${cardIcon('cloud')}${esc(temperature(c.weather.temperature))}${meteo(c.weather.description)?' · '+esc(meteo(c.weather.description)):''}</span>`:''}</div>`:'';
  return `<header class="card hero reveal">
    <div class="hero-top">
      <span class="hero-league">${img(i.league.logo,'')}<span>${esc(ln)}</span></span>
      <span class="hero-time">${esc(dh.date||t('match_page.date_tbc','Date à confirmer'))} · <b>${esc(dh.time||'—')}</b></span>
    </div>
    <h1 class="hero-teams">
      <span class="hero-team">${img(i.home.logo,'')}<span class="hero-name">${esc(i.home.name)}</span></span>
      <span class="hero-vs">${esc(t('match_page.vs_label','vs'))}</span>
      <span class="hero-team">${img(i.away.logo,'')}<span class="hero-name">${esc(i.away.name)}</span></span>
    </h1>
    <div class="hero-meta"><div>${teamMeta(s.home,f.home)}</div><div>${teamMeta(s.away,f.away)}</div></div>
    ${lieu}
  </header>`;
}

// ---------------------------------------------------------------------------
// LE SIGNAL IASHARK — centre de la page, juste sous l'en-tete.
// Dans l'ordre de lecture d'un parieur : le pari (forme standard, en grand),
// la fiabilite en une ligne, la probabilite du modele sur une jauge ou le
// marche est pose en repere, la cote utilisee et sa probabilite implicite,
// l'ecart dit simplement, deux ou trois raisons tirees des donnees reelles,
// les points a surveiller, et la mention 18+.
// L'ecart est affiche HONNETEMENT, y compris quand il est defavorable.
// ---------------------------------------------------------------------------
const REL_NIVEAUX={high:['match_page.sig_rel_high','Fiabilité élevée'],medium:['match_page.sig_rel_medium','Fiabilité moyenne'],low:['match_page.sig_rel_low','Fiabilité faible']};
function relBadge(info){
  if(!info||!REL_NIVEAUX[info.level])return '';
  return `<span class="sig-rel sig-rel--${info.level}"><i aria-hidden="true"></i>${esc(t(REL_NIVEAUX[info.level][0],REL_NIVEAUX[info.level][1]))}</span>`;
}
function relRaison(info){
  if(!info)return '';
  if(info.reason==='thin_sample')return n(info.sampleSize)!==null
    ?tf('match_page.sig_rel_reason_thin_sample','peu de données récentes ({n} matchs cette saison)',{n:info.sampleSize})
    :t('match_page.sig_rel_reason_thin_sample_nonum','peu de données récentes');
  const map={models_disagree:'les modèles ne sont pas d’accord entre eux',weak_data:'données incomplètes sur ce match',solid:'modèles d’accord et données complètes',mixed:'signaux partagés entre les modèles et les données'};
  return map[info.reason]?t('match_page.sig_rel_reason_'+info.reason,map[info.reason]):'';
}
function relLigne(info){
  if(!info||!REL_NIVEAUX[info.level])return '';
  const raison=relRaison(info);
  return `${t(REL_NIVEAUX[info.level][0],REL_NIVEAUX[info.level][1])}${raison?t('match_page.label_colon',' :')+' '+raison:''}.`;
}

const RAISONS={
  xg:'Buts attendus par le modèle : {home} {homeXg} – {awayXg} {away}.',
  goals_avg:'Cette saison par match : {home} marque {homeFor} et encaisse {homeAgainst}, {away} marque {awayFor} et encaisse {awayAgainst}.',
  h2h_hits:'Ce pari serait passé dans {wins} des {sample} derniers face-à-face.',
  absences:'{team} privé de {n} joueurs : {names}.',
  form_wins:'Victoires récentes : {home} {homeWins} sur {homeN}, {away} {awayWins} sur {awayN}.',
  count_shots:'Tirs par match : {home} {homeValue}, {away} {awayValue} (total {total}).',
  count_shots_on:'Tirs cadrés par match : {home} {homeValue}, {away} {awayValue} (total {total}).',
  count_corners:'Corners par match : {home} {homeValue}, {away} {awayValue} (total {total}).',
  count_cards:'Cartons jaunes par match : {home} {homeValue}, {away} {awayValue} (total {total}).'
};
const NUM_VARS=['homeXg','awayXg','totalXg','homeFor','homeAgainst','awayFor','awayAgainst','homeValue','awayValue','total'];
function texteRaison(item){
  if(!item||!RAISONS[item.key])return null;
  const v=Object.assign({},item.vars);
  NUM_VARS.forEach(k=>{if(v[k]!=null)v[k]=fmt(v[k]);});
  return tf('match_page.sig_reason_'+item.key,RAISONS[item.key],v);
}
const RISQUES={
  negative_edge:'cote moins intéressante que notre estimation ({gap} pts en défaveur)',
  small_edge:'écart faible avec le marché ({gap} pts)',
  models_disagree:'les modèles divergent sur ce match',
  backed_absences:'{team} privé de {n} joueurs',
  low_odds:'cote basse ({odds}) : gain limité'
};
function texteRisqueSignal(item){
  if(!item||!RISQUES[item.key])return null;
  const v=Object.assign({},item.vars);
  if(v.gap!=null)v.gap=fmt(v.gap);
  if(v.odds!=null)v.odds=odds(v.odds);
  return tf('match_page.sig_risk_'+item.key,RISQUES[item.key],v);
}

// Probabilite estimee : conf 0-10 = probabilite du modele pour le marche retenu
// divisee par 10 (pipeline). C'est une probabilite : affichee uniquement dans le
// signal servi (match offert ou abonne), jamais sur un mur d'acces. 10 segments.
function confMeter(conf){
  const c=n(conf);
  if(c===null||c<0||c>10)return '';
  const v=Math.round(c*10)/10,pleins=Math.round(v);
  const txt=v.toLocaleString(localeTag(),{maximumFractionDigits:1});
  const aria=tf('match_page.sig_conf_aria','Probabilité estimée : {value} sur 10',{value:txt});
  return `<div class="sig-stat sig-conf">
      <span class="sig-stat-label">${esc(t('match_page.sig_conf_label','Probabilité estimée'))}</span>
      <div class="sig-stat-row"><b class="sig-conf-val">${esc(txt)}<small>/10</small></b><span class="sig-conf-bar" role="meter" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${v}" aria-valuetext="${esc(txt)}/10" aria-label="${esc(aria)}">${Array.from({length:10},(_,i)=>`<i${i<pleins?' class="on"':''}></i>`).join('')}</span></div>
    </div>`;
}
// Niveau de risque : code deterministe du pipeline (risque = FAIBLE/MODERE/
// ELEVE, lib/decision.js#computeRiskLabel), champ premium. Absent : rien.
const RISQUE_NIVEAUX={FAIBLE:['low','Faible',1],MODERE:['medium','Modéré',2],ELEVE:['high','Élevé',3]};
function riskStat(code){
  const r=RISQUE_NIVEAUX[code];
  if(!r)return '';
  return `<div class="sig-stat sig-risk sig-risk--${r[0]}">
      <span class="sig-stat-label">${esc(t('match_page.sig_risk_label','Niveau de risque'))}</span>
      <div class="sig-stat-row"><b>${esc(t('match_page.sig_risk_level_'+r[0],r[1]))}</b><span class="sig-risk-steps" aria-hidden="true">${[1,2,3].map(i=>`<i${i<=r[2]?' class="on"':''}></i>`).join('')}</span></div>
    </div>`;
}

// Lien vers la page Methodologie du repertoire courant. Pages disponibles :
// config/markets.json#_legalFiles.methodology, sources legal/<dir>/ (fr, gb, za,
// en, mx, es) ; les autres repertoires renvoient vers la version anglaise.
const METHODOLOGY_DIRS=['fr','gb','za','en','mx','es'];
function methodologyHref(){
  const dir=(window.I18N&&window.I18N.dir)||'';
  if(METHODOLOGY_DIRS.includes(dir))return '/'+dir+'/methodologie.html';
  return dir?'/en/methodologie.html':'/fr/methodologie.html';
}
function methodLink(){
  return `<p class="sig-method"><a href="${esc(methodologyHref())}">${esc(t('match_page.sig_method_link','Comment ce chiffre est calculé : méthodologie'))}</a></p>`;
}

function signalCard(vm){
  const r=vm.model.recommendation,raw=vm._raw||{};
  // Une analyse existe (has_signal, amorce publique) mais son detail premium
  // n est pas servi par match-data (abonne Pro avant la prochaine mise a jour
  // de match_premium_data) : etat neutre, jamais "aucun marche".
  if(!r&&raw.has_signal===true&&raw.no_signal!==true)return card(t('match_page.signal_title','Le signal IASHARK'),empty(t('match_page.sig_premium_updating','Analyse détaillée en cours de mise à jour. Le marché recommandé et les probabilités s’afficheront dès la prochaine actualisation.')),'signal-card','target');
  if(!r)return card(t('match_page.signal_title','Le signal IASHARK'),empty(vm.model.unavailableReason?t('match_page.model_unavailable_reason',vm.model.unavailableReason):t('match_page.signal_unavailable_fallback','Aucun marché ne franchit les seuils de confiance ou de cote minimale pour ce match — IASHARK préfère ne pas se prononcer.')),'signal-card','target');
  // Une probabilite nulle ou absente n'est jamais affichee "0 %" : elle
  // n'existe pas (constate en ligne sur un match servi sans le champ).
  const prob=n(r.probability)!==null&&r.probability>0?n(r.probability):null;
  const cote=n(vm.model.recommendedOdds);
  const implied=n(vm.model.recommendedImplied);
  const edge=prob!==null?n(vm.model.recommendedEdge):null;
  const info=vm.model.reliabilityInfo;
  const edgeCls=edge===null?'':edge>=3?'pos':edge<0?'neg':'flat';
  const marche=marcheFr(vm,r.market);

  const jauge=prob===null?'':`<div class="sig-gauge">
      <div class="sig-prob"><b>${pct(prob,0)}</b><span>${esc(t('match_page.sig_model_prob','Probabilité du modèle'))}</span></div>
      <div class="sig-bar" role="img" aria-label="${esc(tf('match_page.sig_gauge_aria','Modèle {model}, marché {market}',{model:pct(prob),market:pct(implied)}))}">
        <i class="sig-bar-model" style="--w:${clamp(prob)}%"></i>
        ${implied!==null?`<em class="sig-bar-market" style="left:${clamp(implied)}%"><span>${esc(t('match_page.sig_market_marker','Marché'))}</span></em>`:''}
      </div>
      <div class="sig-scale" aria-hidden="true"><span>0</span><span>50</span><span>100</span></div>
    </div>`;
  const chiffres=`<dl class="sig-figures">
      <div><dt>${esc(t('match_page.sig_implied','Probabilité implicite'))}</dt><dd>${pct(implied)}</dd></div>
      <div><dt>${esc(t('match_page.sig_edge','Écart (value)'))}</dt><dd class="sig-edge ${edgeCls}">${pts(edge)}</dd></div>
    </dl>`;
  const verdict=prob!==null&&implied!==null
    ?`<p class="sig-verdict">${esc(tf('match_page.sig_verdict','Le modèle voit {model} contre {market} pour le marché ({gap}).',{model:pct(prob),market:pct(implied),gap:pts(edge)}))}</p>`:'';

  const raisons=(vm.editorial.signalReasons||[]).map(texteRaison).filter(Boolean);
  // facteur_x/conseil_public : texte du pipeline ; hors FR, sa traduction
  // validee, sinon masque. Cite tel quel, en complement des raisons chiffrees.
  const lecture=narratif(vm.editorial.decisiveFactor,vm.editorial.decisiveFactorI18n);
  const risques=(vm.editorial.signalRisks||[]).map(texteRisqueSignal).filter(Boolean);
  const alerte=vm.editorial.risk&&!['FAIBLE','MODERE','ELEVE'].includes(vm.editorial.risk)?texteRisque(vm,vm.editorial.risk):null;
  if(alerte)risques.unshift(texteLisible(vm,alerte));
  const aSurveiller=risques.length?risques.slice(0,2).join(' · '):t('match_page.sig_risk_default','un seul match reste très aléatoire, même avec un écart favorable');
  // "Pourquoi" : 2 a 3 puces. Raisons chiffrees d'abord, puis la lecture du
  // pipeline si une place reste.
  const puces=raisons.slice(0,3);
  if(puces.length<3&&lecture)puces.push(texteLisible(vm,lecture));
  const stats=[confMeter(r.confidence),riskStat(vm.editorial.riskCode)].filter(Boolean);

  return `<section class="signal-card reveal" aria-labelledby="sigMarket">
    <div class="sig-head">
      <span class="sig-eyebrow">${cardIcon('target')}${esc(t('match_page.signal_title','Le signal IASHARK'))}</span>
      ${relBadge(info)}
    </div>
    <div class="sig-slip">
      <div class="sig-slip-main">
        <p class="sig-kicker">${esc(t('match_page.sig_bet_label','Pari recommandé'))}</p>
        <h2 class="sig-market" id="sigMarket">${esc(marche)}</h2>
        <p class="sig-fixture">${esc(tf('match_page.sig_match_line','{home} – {away}',{home:vm.identity.home.name,away:vm.identity.away.name}))}</p>
      </div>
      ${cote!==null?`<div class="sig-odds-box"><span>${esc(t('match_page.sig_odds_used','Cote utilisée'))}</span><b>${odds(cote)}</b></div>`:''}
    </div>
    ${stats.length?`<div class="sig-stats${stats.length===1?' is-single':''}">${stats.join('')}</div>`:''}
    ${info?`<p class="sig-rel-note">${esc(relLigne(info))}</p>`:''}
    <div class="sig-grid">${jauge}${chiffres}</div>
    ${verdict}
    ${puces.length?`<div class="sig-why"><h3>${esc(t('match_page.sig_why_title','Pourquoi ce pari'))}</h3><ul>${puces.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    <p class="sig-watch"><b>${esc(t('match_page.sig_watch_title','À surveiller'))}</b> ${esc(aSurveiller)}</p>
    ${methodLink()}
    <p class="sig-legal">${esc(t('match_page.sig_legal','18+ · Estimation statistique, pas une garantie. Jouez responsable.'))}</p>
  </section>`;
}

// ---------------------------------------------------------------------------
// PROBABILITES ET COTES : modele / marche / ecart / cote, pari en forme
// standard, value mise en evidence (+3 pts et plus). Donnees : 1N2 et
// consensus sans marge du pipeline, plus de 2,5 buts et les deux equipes
// marquent (cotes des deux cotes), marches compares par le pipeline
// (lib/match-view-model.js#marketTable). Le pari du signal ouvre le tableau.
// ---------------------------------------------------------------------------
const GROUPES_MARCHES=[['result','Résultat'],['goals','Buts'],['stats','Tirs, corners, cartons'],['other','Autres marchés']];
function marketsCard(vm){
  const rows=vm.model.marketTable||[];
  if(rows.length<2)return '';
  const col=(k,fr)=>t('match_page.markets_col_'+k,fr);
  const ligne=r=>{
    const e=n(r.edge),cls=e===null?'':e>=3?'pos':e<=-3?'neg':'flat';
    const tags=`${r.recommended?`<span class="mk-tag mk-tag--signal">${esc(t('match_page.markets_tag_signal','Signal'))}</span>`:''}${e!==null&&e>=3?`<span class="mk-tag mk-tag--value">${esc(t('match_page.markets_tag_value','Value'))}</span>`:''}`;
    return `<tr class="${r.recommended?'is-signal ':''}${e!==null&&e>=3?'is-value':''}">
      <th scope="row"><span class="mk-label">${esc(libelleLigne(vm,r))}</span>${tags}</th>
      <td data-label="${esc(col('model','Modèle'))}" class="mk-model">${pct(r.model)}</td>
      <td data-label="${esc(col('market','Marché'))}">${pct(r.market)}</td>
      <td data-label="${esc(col('gap','Écart'))}" class="mk-gap ${cls}">${pts(e)}</td>
      <td data-label="${esc(col('odds','Cote'))}">${odds(r.odds)}</td>
    </tr>`;
  };
  const signal=rows.filter(r=>r.recommended);
  let corps=signal.map(ligne).join('');
  GROUPES_MARCHES.forEach(([g,fr])=>{
    const list=rows.filter(r=>!r.recommended&&r.group===g);
    if(!list.length)return;
    corps+=`<tr class="mk-group"><th scope="rowgroup" colspan="5">${esc(t('match_page.markets_group_'+g,fr))}</th></tr>${list.map(ligne).join('')}`;
  });
  return card(t('match_page.markets_title','Probabilités et cotes'),
    `<div class="mk-scroll"><table class="mk-table">
      <thead><tr><th scope="col">${esc(col('bet','Pari'))}</th><th scope="col">${esc(col('model','Modèle'))}</th><th scope="col">${esc(col('market','Marché'))}</th><th scope="col">${esc(col('gap','Écart'))}</th><th scope="col">${esc(col('odds','Cote'))}</th></tr></thead>
      <tbody>${corps}</tbody>
    </table></div>
    <p class="mk-note">${esc(t('match_page.markets_note','Marché : probabilité tirée des cotes, marge du bookmaker retirée quand les deux issues sont cotées. Écart en points ; value à partir de +3 pts.'))}</p>`,
    'markets-card','table');
}

// ---------------------------------------------------------------------------
// FORME ET FACE-A-FACE : pastilles des derniers resultats reels (score au
// survol et pour les lecteurs d'ecran) et les cinq dernieres confrontations,
// resumees par une barre victoires/nuls/victoires.
// ---------------------------------------------------------------------------
function formH2HCard(vm){
  const f=vm.form||{},h=vm.h2h||[],i=vm.identity;
  const ligneForme=(team,rows)=>rows&&rows.length?`<div class="fh-row"><span class="fh-team">${logoEquipe(team.logo,team.name)}<span>${esc(team.name)}</span></span>${formStrip(rows)}<span class="fh-scores" aria-hidden="true">${rows.slice().reverse().map(r=>`<i>${esc(r.score||'')}</i>`).join('')}</span></div>`:'';
  const forme=ligneForme(i.home,f.home)+ligneForme(i.away,f.away);
  let confrontations='';
  if(h.length){
    const dom=h.filter(r=>r.winner==='1').length,nul=h.filter(r=>r.winner==='N').length,ext=h.filter(r=>r.winner==='2').length,tot=dom+nul+ext||1;
    const annee=d=>{const x=new Date(String(d)+'T12:00:00Z');return isNaN(x)?String(d):x.toLocaleDateString(localeTag(),{month:'short',year:'numeric',timeZone:'UTC'});};
    confrontations=`<div class="h2h">
      <p class="h2h-sum">${esc(tf('match_page.h2h_summary','{home} {homeWins} V · {draws} N · {away} {awayWins} V',{home:i.home.name,away:i.away.name,homeWins:dom,draws:nul,awayWins:ext}))}</p>
      <div class="h2h-bar" aria-hidden="true"><i class="h" style="width:${(dom/tot*100).toFixed(1)}%"></i><i class="d" style="width:${(nul/tot*100).toFixed(1)}%"></i><i class="a" style="width:${(ext/tot*100).toFixed(1)}%"></i></div>
      <ul class="h2h-list">${h.slice(0,5).map(r=>`<li><time>${esc(annee(r.date))}</time><span class="h2h-m"><span class="${r.winner==='1'&&r.home===i.home.name||r.winner==='2'&&r.home===i.away.name?'w':''}">${esc(r.home)}</span><b>${esc(r.score)}</b><span class="${r.winner==='2'&&r.away===i.away.name||r.winner==='1'&&r.away===i.home.name?'w':''}">${esc(r.away)}</span></span></li>`).join('')}</ul>
    </div>`;
  }
  if(!forme&&!confrontations)return '';
  return card(t('match_page.formh2h_title','Forme et face-à-face'),
    `<div class="fh-grid">${forme?`<div><h3 class="sub">${esc(t('match_page.form_label','Derniers matchs'))}</h3>${forme}</div>`:''}${confrontations?`<div><h3 class="sub">${esc(t('match_page.h2h_label','Derniers face-à-face'))}</h3>${confrontations}</div>`:''}</div>`,
    'formh2h-card','trend');
}

// ---------------------------------------------------------------------------
// ABSENCES : joueurs reellement signales absents ou incertains (API), avec
// leur part de production offensive recente quand le joueur est retrouve
// (lib/insights.js#computeOutputShare). Section masquee s'il n'y en a aucune.
// ---------------------------------------------------------------------------
function categorieAbsence(reason){
  const r=String(reason||'').toLowerCase();
  if(/suspen|red card|yellow card|card/.test(r))return 'suspension';
  if(/illness|sick|virus/.test(r))return 'illness';
  if(/injur|knock|strain|fracture|surgery|muscle|knee|ankle|hamstring|thigh|calf|groin|back|shoulder|foot|hip/.test(r))return 'injury';
  return 'other';
}
function absencesCard(vm){
  const a=vm.players.absences||{home:[],away:[]};
  if(!a.home.length&&!a.away.length)return '';
  const CAT={injury:'Blessure',suspension:'Suspension',illness:'Maladie',other:'Raison non précisée'};
  const colonne=(team,list)=>`<div class="abs-col"><h3>${logoEquipe(team.logo,team.name)}<span>${esc(team.name)}</span><em>${list.length}</em></h3>${list.length?`<ul>${list.map(p=>{
    const cat=categorieAbsence(p.reason),doute=/question|doubt/i.test(String(p.status||''));
    const part=n(p.outputShare)!==null&&p.outputShare>=5?`<small>${esc(tf('match_page.absence_share','{pct} de la production offensive récente',{pct:pct(p.outputShare,0)}))}</small>`:'';
    return `<li><span class="abs-name">${esc(p.name)}</span><span class="abs-why${doute?' is-doubt':''}">${esc(doute?t('match_page.absence_status_doubtful','Incertain'):t('match_page.absence_reason_'+cat,CAT[cat]))}</span>${part}</li>`;
  }).join('')}</ul>`:`<p class="abs-none">${esc(t('match_page.absences_none','Aucune absence signalée'))}</p>`}</div>`;
  return card(t('match_page.absences_title','Absences'),`<div class="abs-grid">${colonne(vm.identity.home,a.home)}${colonne(vm.identity.away,a.away)}</div>`,'absences-card','cross');
}

// Logo d'equipe accole a son nom. SANS pastille ronde : un ecusson a sa propre
// forme, un masque circulaire lui rogne les angles.
function logoEquipe(src,nom){
  return src?`<img class="logo-eq" src="${esc(src)}" alt="" width="16" height="16" loading="lazy">`:'';
}

// ---------------------------------------------------------------------------
// MARCHES JOUEURS. Le joueur le plus dangereux du match, ecrit comme un pari
// ("A. Elanga buteur"), avec sa probabilite estimee (Poisson sur ses vrais
// buts/90, lib/insights.js) et les statistiques mesurees, ECHANTILLON
// compris : "2,9 buts/90" ne veut rien dire sans savoir sur combien de
// minutes. Les projections du Player Engine, quand elles existent, suivent.
// ---------------------------------------------------------------------------
function threatSample(p){
  const bits=[];
  if(n(p.appearances)!==null)bits.push(`${p.appearances} ${p.appearances>1?t('match_page.matches_played_plural','matchs joués'):t('match_page.matches_played_singular','match joué')}`);
  if(n(p.starts)!==null)bits.push(p.starts>0?`${p.starts} ${p.starts>1?t('match_page.starts_plural','titularisations'):t('match_page.starts_singular','titularisation')}`:t('match_page.starts_none','aucune titularisation'));
  if(n(p.minutes)!==null&&p.minutes>0)bits.push(`${Math.round(p.minutes)} ${t('match_page.minutes_played_suffix','minutes jouées')}`);
  return bits.length?bits.join(' · '):'';
}
// Cle francaise -> [cle i18n, repli francais], resolue a l'appel (le
// dictionnaire n'est pas encore charge quand ce module s'evalue).
const POSTES={
  goalkeeper:['match_page.position_goalkeeper','Gardien'],
  defender:['match_page.position_defender','Défenseur'],
  midfielder:['match_page.position_midfielder','Milieu'],
  attacker:['match_page.position_forward','Attaquant']
};
const poste=v=>{const k=String(v||'').trim();const e=POSTES[k.toLowerCase()];return e?t(e[0],e[1]):k;};
const buteur=name=>{const ml=window.IasharkMarketLabels;return ml&&ml.playerMarketLabelFor?ml.playerMarketLabelFor('ANYTIME_GOALSCORER',name):name;};
const CODES_JOUEUR={'Buteur':'ANYTIME_GOALSCORER','Tirs':'PLAYER_SHOTS','Tirs cadrés':'PLAYER_SHOTS_ON_TARGET'};

function threatsCard(vm){
  const list=vm.players.scoringThreat;
  const projections=(vm.players.projections||[]).filter(p=>n(p.probability)!==null);
  if(!list.length&&!projections.length)return '';
  let corps='';
  if(list.length){
    const p=list[0];
    const pid=n(p.id);
    const href=pid!==null?` href="${esc(lien(`joueur.html?m=${encodeURIComponent(vm.id)}&p=${pid}`))}"`:'';
    const tag=pid!==null?'a':'div';
    const prob=n(p.scoringProbability);
    // Deux decimales fixes sur les moyennes par 90, pour que les colonnes
    // du panneau s'alignent.
    const deux=v=>Number(v).toLocaleString(localeTag(),{minimumFractionDigits:2,maximumFractionDigits:2});
    const stats=[
      n(p.goals90)!==null&&p.goals90>0?[deux(p.goals90),t('match_page.stat_goals_per90','Buts / 90 min')]:null,
      n(p.shotsOn90)!==null&&p.shotsOn90>0?[deux(p.shotsOn90),t('match_page.stat_shots_on_target_per90','Tirs cadrés / 90 min')]:null,
      n(p.expectedGoals90)!==null?[deux(p.expectedGoals90),t('match_page.stat_expected_goals_per90','Buts attendus / 90 min')]:null,
      n(p.assists90)!==null&&p.assists90>0?[deux(p.assists90),t('match_page.stat_assists_per90','Passes déc. / 90 min')]:null,
      n(p.rating5)!==null?[Number(p.rating5).toLocaleString(localeTag(),{minimumFractionDigits:1,maximumFractionDigits:1}),t('match_page.stat_average_rating','Note moyenne')]:null
    ].filter(Boolean).slice(0,3);
    const sample=threatSample(p);
    const largeur=prob===null?null:clamp(prob);
    corps+=`<${tag} class="threat group"${href}>
      <div class="threat-id">
        ${img(p.photo,'')}
        <div class="threat-who">
          <b>${esc(buteur(p.name))}</b>
          <small>${esc(p.team||'')}${p.position?' · '+esc(poste(p.position)):''}</small>
        </div>
      </div>
      ${prob===null?'':`<div class="threat-prob">
        <div class="threat-prob-tete"><span>${esc(t('match_page.scoring_probability_label','Probabilité de marquer'))}</span><b>${pct(prob)}</b></div>
        <div class="threat-jauge" role="img" aria-label="${esc(t('match_page.scoring_probability_label','Probabilité de marquer'))} : ${pct(prob)}"><i style="width:${largeur}%"></i></div>
      </div>`}
      ${stats.length?`<div class="threat-panneau">${stats.map(([v,k])=>`<div><b>${v}</b><span>${esc(k)}</span></div>`).join('')}</div>`:''}
      <div class="threat-pied">
        ${sample?`<span class="threat-sample${p.thinSample?' is-thin':''}">${esc(sample)}</span>`:'<span></span>'}
        ${pid!==null?`<span class="threat-lien">${esc(t('match_page.view_profile_link','Voir la fiche'))} <i aria-hidden="true">→</i></span>`:''}
      </div>
      ${p.thinSample?`<p class="threat-alerte">${esc(t('match_page.thin_sample_alert','Temps de jeu limité sur ce championnat : ces moyennes par 90 minutes reposent sur peu de minutes et restent fragiles.'))}</p>`:''}
    </${tag}>`;
    const autres=list.slice(1,4).filter(x=>n(x.scoringProbability)!==null);
    if(autres.length)corps+=`<ul class="pm-list">${autres.map(x=>`<li><span>${esc(buteur(x.name))}<small>${esc(x.team||'')}</small></span><b>${pct(x.scoringProbability)}</b></li>`).join('')}</ul>`;
  }
  if(projections.length){
    const ml=window.IasharkMarketLabels;
    corps+=`<ul class="pm-list">${projections.slice(0,6).map(x=>{
      const code=CODES_JOUEUR[x.market];
      const label=code&&ml&&ml.playerMarketLabelFor?ml.playerMarketLabelFor(code,x.player):`${x.player} · ${x.market}`;
      return `<li><span>${esc(label)}</span><b>${pct(x.probability)}</b></li>`;
    }).join('')}</ul>`;
  }
  corps+=`<p class="pm-note">${esc(t('match_page.players_note','Probabilités estimées à partir des statistiques réelles des joueurs, sans cote de bookmaker.'))}</p>`;
  return card(t('match_page.player_markets_title','Marchés joueurs'),corps,'threats-card','target2');
}

// Alertes d'absence du pipeline (update-data.yml#calcKeyAbsences) : gabarit
// francais fixe "<GRAVITE>: <joueur> (DOM|EXT) ABSENT", re-redige dans la
// langue active. Tout autre texte descriptif est du francais redige : FR seul.
const ALERTES_ABSENCE={'ALERTE ROUGE':'red','ABSENCE MAJEURE':'major','Absence notable':'notable'};
function texteRisque(vm,texte){
  const brut=String(texte||'').trim();
  if(!brut||estFr())return brut||null;
  const m=/^(ALERTE ROUGE|ABSENCE MAJEURE|Absence notable):\s*(.+?)\s*\((DOM|EXT)\)\s*ABSENT$/.exec(brut);
  if(!m)return null;
  return tf('match_page.absence_alert_'+ALERTES_ABSENCE[m[1]],'{player} ({team})',{player:m[2],team:m[3]==='DOM'?vm.identity.home.name:vm.identity.away.name});
}

// Sorties modele : buts attendus et scores exacts les plus probables, ecrits
// comme au bookmaker ("Score exact : 1-1").
function outputsCard(vm){
  const x=vm.model.expectedGoals,s=vm.model.scores,i=vm.identity;
  // Seules les colonnes qui ont du contenu ; ce qui manque est dit en une
  // ligne discrete. Si TOUT manque, la carte disparait.
  const cols=[],manquant=[];
  if(x){
    cols.push(`<div class="outputs-col outputs-xg"><small>${esc(t('match_page.stat_expected_goals','Buts attendus'))} (xG)</small><div class="xg-row">${img(i.home.logo,'')}<b>${fmt(x.home)}</b><span>${esc(i.home.name)} – ${esc(i.away.name)}</span><b>${fmt(x.away)}</b>${img(i.away.logo,'')}</div></div>`);
  } else manquant.push(t('match_page.xg_unavailable','xG indisponibles'));
  if(s.length){
    const ml=window.IasharkMarketLabels;
    const maxP=Math.max.apply(null,s.map(sc=>Number(sc.probability)||0))||1;
    cols.push(`<div class="outputs-col"><small>${esc(t('match_page.scores_title','Scores les plus probables'))}</small><div class="score-bars">${s.map(sc=>`<div class="score-bar"><b>${esc(ml&&ml.exactScoreLabel?ml.exactScoreLabel(sc.score):sc.score)}</b><i><span style="width:${clamp(Number(sc.probability)/maxP*100)}%"></span></i><small>${pct(sc.probability,0)}</small></div>`).join('')}</div></div>`);
  } else manquant.push(t('match_page.scores_unavailable','Scores probables indisponibles'));
  if(!cols.length)return '';
  return card(t('match_page.outputs_title','Ce que dit le modèle'),
    `<div class="outputs${cols.length===1?' outputs-1col':' outputs-2col'}">${cols.join('')}</div>`
    +(manquant.length?`<p class="outputs-missing">${esc(manquant.join(' · '))}.</p>`:''),'','chart');
}

// Nettoyage des textes rediges (editorial, points de vigilance) : tout
// libelle de marche connu y est remplace par sa forme standard, puis les
// decimales passent au separateur de la langue. Le texte n'est jamais reecrit.
function texteLisible(vm,texte){
  var s=String(texte==null?'':texte);
  if(!s)return s;
  var libelles=[];
  if(vm.model.recommendation&&vm.model.recommendation.market)libelles.push(vm.model.recommendation.market);
  (vm.marketsWatch||[]).forEach(function(m){if(m&&m.market)libelles.push(m.market);});
  // Les plus longs d'abord : "DC 12" ne doit pas etre remplace a l'interieur
  // d'un libelle plus complet.
  libelles.sort(function(a,b){return b.length-a.length;}).forEach(function(brut){
    var lisible=marcheFr(vm,brut);
    if(lisible&&lisible!==brut)s=s.split(brut).join(lisible);
  });
  if((1.5).toLocaleString(localeTag()).indexOf(',')===-1)return s;
  return s.replace(/(\d),(\d)/g,'$1<VIRG>$2').replace(/(\d)\.(\d)/g,'$1,$2').replace(/<VIRG>/g,',');
}

// Sources de donnees (lib/display-data.js#sourceLabels, libelles francais) :
// premier segment traduit, nom de fournisseur conserve.
const SOURCES_CLES={'Calendrier et équipes':'source_fixtures','Statistiques équipes':'source_team_stats','Événements historiques':'source_events','Blessures et suspensions':'source_injuries','Marché':'source_market'};
function libelleSource(x){
  const parts=String(x).split(' · ');
  const k=SOURCES_CLES[parts[0]];
  if(!k)return String(x);
  let reste=parts.slice(1).join(' · ');
  if(reste==='Cotes moyennes multi-bookmakers')reste=t('match_page.source_avg_odds',reste);
  return t('match_page.'+k,parts[0])+(reste?' · '+reste:'');
}

// ---------------------------------------------------------------------------
// COMPARATIF DES DEUX EQUIPES : vrai tableau groupe par theme, micro-barre
// d'ecart dans la ligne, pied qui conclut. Sur "Buts concedes" et "Fautes",
// le plus petit gagne ; "Hors-jeu" et "Arrets" n'ont pas de verdict.
// CMP_* sont des CLES DE CORRESPONDANCE avec vm.comparison.rows[].label
// (toujours en francais) : jamais traduites, seul le texte affiche l'est.
// ---------------------------------------------------------------------------
const CMP_SENS={
  'Buts marqués':'haut','Tirs':'haut','Tirs cadrés':'haut','Possession':'haut','Corners':'haut',
  'Buts concédés':'bas','Fautes':'bas',
  'Hors-jeu':'neutre','Arrêts':'neutre'
};
const CMP_GROUPES=[
  ['Attaque',['Buts marqués','Tirs','Tirs cadrés']],
  ['Maîtrise',['Possession','Corners']],
  ['Défense',['Buts concédés','Arrêts']],
  ['Discipline',['Fautes','Hors-jeu']]
];
const CMP_UNITE={'Possession':'%'};
const CMP_LABEL_KEYS={
  'Buts marqués':'stat_goals_scored','Buts concédés':'stat_goals_conceded','Tirs':'stat_shots',
  'Tirs cadrés':'stat_shots_on_target','Possession':'stat_possession','Corners':'stat_corners',
  'Fautes':'stat_fouls','Hors-jeu':'stat_offsides','Arrêts':'stat_saves'
};
const CMP_GROUP_KEYS={'Attaque':'group_attack','Maîtrise':'group_control','Défense':'group_defense','Discipline':'group_discipline'};
const cmpLabel=label=>{const k=CMP_LABEL_KEYS[label];return k?t('match_page.'+k,label):label;};

function comparison(vm){
  const c=vm.comparison;
  if(!c||!c.rows.length)return empty(t('match_page.comparison_unavailable','Statistiques comparatives indisponibles.'));
  const parLabel={};
  c.rows.forEach(r=>{parLabel[r.label]=r;});
  const dom=vm.identity.home.name,ext=vm.identity.away.name;
  // Une decimale sur les moyennes, aucune sur les pourcentages.
  const un=(v,unite)=>Number(v).toLocaleString(localeTag(),
    unite==='%'?{maximumFractionDigits:0}:{minimumFractionDigits:1,maximumFractionDigits:1});
  let gagnesDom=0,gagnesExt=0,depart=0;
  const lignes=[];
  // Barres a l'echelle du plus grand ecart relatif du tableau.
  const relatif=r=>Math.abs(r.home-r.away)/Math.max(Math.abs(r.home),Math.abs(r.away),0.0001);
  const comparables=c.rows.filter(r=>(CMP_SENS[r.label]||'neutre')!=='neutre');
  const ecartMax=comparables.length?Math.max(...comparables.map(relatif),0.0001):1;

  CMP_GROUPES.forEach(([groupe,labels])=>{
    const presentes=labels.map(l=>parLabel[l]).filter(Boolean);
    if(!presentes.length)return;
    lignes.push(`<tr class="cmp-groupe"><th scope="rowgroup" colspan="4">${esc(CMP_GROUP_KEYS[groupe]?t('match_page.'+CMP_GROUP_KEYS[groupe],groupe):groupe)}</th></tr>`);
    presentes.forEach(r=>{
      const sens=CMP_SENS[r.label]||'neutre';
      const unite=CMP_UNITE[r.label]||'';
      const ecart=r.home-r.away;
      let devant=null;
      if(sens!=='neutre'&&Math.abs(ecart)>0.001) devant=(sens==='haut')===(ecart>0)?'dom':'ext';
      if(devant==='dom')gagnesDom++; else if(devant==='ext')gagnesExt++; else if(sens!=='neutre')depart++;
      const part=Math.min(100,Math.round(relatif(r)/ecartMax*100));
      const cote=ecart>0?'g':'d';
      const barre=devant===null
        ? '<span class="cmp-jauge" aria-hidden="true"><i class="axe"></i></span>'
        : `<span class="cmp-jauge" aria-hidden="true"><i class="axe"></i><i class="trait ${cote} ${devant}" style="width:${part/2}%"></i></span>`;
      const signe=ecart>0?'+':ecart<0?'−':'';
      const valeurEcart=Math.abs(ecart)<0.001?'—':signe+un(Math.abs(ecart),unite)+unite;
      lignes.push(`<tr>
        <th scope="row">${esc(cmpLabel(r.label))}</th>
        <td class="${devant==='dom'?'gagne':''}">${un(r.home,unite)}${esc(unite)}</td>
        <td class="${devant==='ext'?'gagne':''}">${un(r.away,unite)}${esc(unite)}</td>
        <td class="cmp-ecart">${barre}<span class="cmp-val ${devant||'nul'}">${valeurEcart}</span></td>
      </tr>`);
    });
  });
  const rangees=new Set(CMP_GROUPES.flatMap(g=>g[1]));
  const orphelines=c.rows.filter(r=>!rangees.has(r.label));
  if(orphelines.length){
    lignes.push(`<tr class="cmp-groupe"><th scope="rowgroup" colspan="4">${esc(t('match_page.group_other','Autres'))}</th></tr>`);
    orphelines.forEach(r=>{
      lignes.push(`<tr><th scope="row">${esc(cmpLabel(r.label))}</th><td>${un(r.home)}</td><td>${un(r.away)}</td><td class="cmp-ecart"><span class="cmp-val nul">—</span></td></tr>`);
    });
  }
  const total=gagnesDom+gagnesExt+depart;
  let conclusion='';
  if(total){
    const meneur=gagnesDom>gagnesExt?dom:gagnesExt>gagnesDom?ext:null;
    const compte=Math.max(gagnesDom,gagnesExt);
    conclusion=meneur
      ? `<b>${esc(meneur)}</b>${esc(t('match_page.comparison_leads_middle',' est devant sur '))}${compte}${esc(t('match_page.comparison_leads_of',' des '))}${total}${esc(t('match_page.comparison_leads_suffix',' mesures comparables.'))}`
      : `${esc(t('match_page.comparison_tie_prefix','Les deux équipes se partagent les '))}${total}${esc(t('match_page.comparison_leads_suffix',' mesures comparables.'))}`;
  }
  const note=n(c.sampleSize)!==null
    ? `${t('match_page.comparison_note_with_sample_prefix','Moyennes par match sur ')}${c.sampleSize} ${c.sampleSize>1?t('match_page.comparison_note_match_plural','rencontres'):t('match_page.comparison_note_match_singular','rencontre')}${c.sampleSize<5?t('match_page.comparison_note_thin_sample_suffix',' — échantillon encore court'):''}.`
    : t('match_page.comparison_note_simple','Moyennes par match.');
  return `<div class="cmp-scroll"><table class="cmp-table">
      <thead><tr>
        <th scope="col">${esc(t('match_page.comparison_table_header','Par match'))}</th>
        <th scope="col"><span class="cmp-eq">${logoEquipe(vm.identity.home.logo,dom)}${esc(dom)}</span></th>
        <th scope="col"><span class="cmp-eq">${logoEquipe(vm.identity.away.logo,ext)}${esc(ext)}</span></th>
        <th scope="col">${esc(t('match_page.comparison_gap_header','Écart'))}</th>
      </tr></thead>
      <tbody>${lignes.join('')}</tbody>
    </table></div>
    ${conclusion?`<p class="cmp-conclusion">${conclusion}</p>`:''}
    <p class="cmp-note">${esc(note)} ${esc(t('match_page.comparison_note_disclaimer',"Hors-jeu et arrêts sont donnés sans verdict : plus d'arrêts signifie surtout plus de tirs subis."))}</p>`;
}

// Repartition des buts par tranche de 15 minutes : buts REELLEMENT comptes
// pour les deux equipes (vm.editorial.goalTiming), 6 vrais points.
function scenarioChart(slots){
  const W=460,H=140,pad=22,top=18,base=H-20;
  const max=Math.max(...slots.map(s=>n(s.prob)||0),1);
  const x=i=>pad+i*(W-2*pad)/(slots.length-1);
  const y=v=>base-(v/max)*(base-top);
  const path=slots.map((s,i)=>`${i===0?'M':'L'}${x(i).toFixed(1)},${y(n(s.prob)||0).toFixed(1)}`).join(' ');
  const area=`${path} L${x(slots.length-1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;
  const dots=slots.map((s,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(n(s.prob)||0).toFixed(1)}" r="3" fill="var(--accent)"></circle><text x="${x(i).toFixed(1)}" y="${(y(n(s.prob)||0)-9).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--accent)" font-weight="700">${Math.round(n(s.prob)||0)}%</text><text x="${x(i).toFixed(1)}" y="${H-4}" text-anchor="middle" font-size="8" fill="var(--muted)">${esc((s.t||'').replace('min',''))}</text>`).join('');
  return `<svg class="scenario-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><line x1="${pad}" y1="${base}" x2="${W-pad}" y2="${base}" stroke="var(--line)"></line><path d="${area}" fill="url(#scGrad)" class="sc-area"></path><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" class="sc-line"></path>${dots}<defs><linearGradient id="scGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".2"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs></svg>`;
}
function scenarioCard(vm){
  const g=vm.editorial.goalTiming;
  if(!g||!g.slots.length)return empty(t('match_page.scenario_unavailable','Pas assez de buts enregistrés pour établir une répartition fiable.'));
  const slots=g.slots.map(sl=>({t:sl.label,prob:sl.share}));
  return `${scenarioChart(slots)}
    <div class="scenario-insight"><b aria-hidden="true">!</b><span>${esc(t('match_page.scenario_peak_prefix','Tranche la plus fournie : '))}<b>${esc(g.peak.label)}${esc(t('match_page.scenario_peak_middle',' min'))}</b> — ${Math.round(g.peak.share)}${esc(t('match_page.scenario_peak_suffix',' % des buts des deux équipes y sont tombés.'))}</span></div>
    <p class="scenario-source">${esc(t('match_page.scenario_source_prefix','Sur '))}${g.totalGoals}${esc(t('match_page.scenario_source_middle',' buts marqués par '))}${esc(vm.identity.home.name)}${esc(t('match_page.scenario_source_and',' et '))}${esc(vm.identity.away.name)}${esc(t('match_page.scenario_source_suffix',' cette saison. Fréquence observée sur leurs matchs passés, pas une prévision pour celui-ci.'))}</p>`;
}

// FAQ — en dernier. Regle posee par l'utilisateur : uniquement des questions
// dont la reponse n'est affichee nulle part ailleurs, nourries par
// vm.editorial.exclusiveFacts (cartons, buts attendus de saison, precision de
// passe, tranches d'encaissement).
function faqCard(vm){
  const qa=[];
  const id=vm.identity, f=vm.editorial.exclusiveFacts||{}, g=vm.editorial.goalTiming;
  const dom=id.home.name, ext=id.away.name;
  const plusGrand=(p)=>p.home>=p.away?dom:ext;
  const plusPetit=(p)=>p.home<=p.away?dom:ext;

  // 1. Qui marque le plus tot : le graphique cumule les deux equipes.
  if(g&&g.slots.length>=6){
    const totD=g.slots.reduce((a,x)=>a+x.home,0),totE=g.slots.reduce((a,x)=>a+x.away,0);
    const avD=g.slots.slice(0,3).reduce((a,x)=>a+x.home,0);
    const avE=g.slots.slice(0,3).reduce((a,x)=>a+x.away,0);
    if(totD>0&&totE>0){
      const pD=Math.round(avD/totD*100),pE=Math.round(avE/totE*100);
      const verdict=Math.abs(pD-pE)<3
        ? t('match_page.faq_early_verdict_equal','Les deux entrent dans leurs matchs au même rythme.')
        : tf('match_page.faq_early_verdict_team','{team} entre donc plus vite dans ses matchs.',{team:esc(pD>pE?dom:ext)});
      qa.push([t('match_page.faq_q_early','Laquelle des deux marque le plus tôt ?'),
        tf('match_page.faq_early_answer','{home} inscrit {homePct} % de ses buts avant la mi-temps, {away} {awayPct} %. {verdict} Le graphique plus haut cumule les deux équipes&nbsp;: ce détail par équipe n’y apparaît pas.',{home:esc(dom),away:esc(ext),homePct:pD,awayPct:pE,verdict})]);
    }
  }
  // 2. Encaissement en fin de match.
  if(f.encaisseFin){
    const ecartFin=Math.abs(f.encaisseFin.home-f.encaisseFin.away);
    const verdictFin=ecartFin<4
      ? t('match_page.faq_late_verdict_equal','Les deux tiennent la fin de match de la même façon.')
      : tf('match_page.faq_late_verdict_team','{team} est la plus exposée sur la fin, ce qui compte pour un pari qui se joue au score final.',{team:esc(plusGrand(f.encaisseFin))});
    qa.push([t('match_page.faq_q_late','Une des deux craque-t-elle en fin de match ?'),
      tf('match_page.faq_late_answer','{home} encaisse {homePct} % de ses buts sur la dernière demi-heure, {away} {awayPct} %. {verdict}',{home:esc(dom),away:esc(ext),homePct:f.encaisseFin.home,awayPct:f.encaisseFin.away,verdict:verdictFin})]);
  }
  // 3. Cartons.
  if(f.cartons){
    const rugueux=Math.abs(f.cartons.home-f.cartons.away)<0.3?null:plusGrand(f.cartons);
    const nbRouges=f.rouges?f.rouges.home+f.rouges.away:0;
    const rouges=nbRouges>0
      ? (nbRouges>1
        ? tf('match_page.faq_cards_red_other','Sur la période suivie, {n} cartons rouges au total.',{n:nbRouges})
        : tf('match_page.faq_cards_red_one','Sur la période suivie, {n} carton rouge au total.',{n:nbRouges})) : '';
    const verdictCartons=rugueux
      ? tf('match_page.faq_cards_verdict_team','{team} est la plus sanctionnée des deux.',{team:esc(rugueux)})
      : t('match_page.faq_cards_verdict_equal','Les deux sont sanctionnées au même rythme.');
    qa.push([t('match_page.faq_q_cards','Combien de cartons dans un match de ces équipes ?'),
      tf('match_page.faq_cards_answer','{home} en prend {homeCards} par match et {away} {awayCards}. {verdict}',{home:esc(dom),away:esc(ext),homeCards:fmt(f.cartons.home),awayCards:fmt(f.cartons.away),verdict:verdictCartons+(rouges?' '+rouges:'')})]);
  }
  // 4. Buts attendus de saison (pas ceux DE CE MATCH, affiches plus haut).
  if(f.xg&&f.xga){
    const meilleure=plusGrand(f.xg), solide=plusPetit(f.xga);
    qa.push([t('match_page.faq_q_chances','Ces équipes se créent-elles beaucoup d’occasions ?'),
      tf('match_page.faq_chances_answer','Sur la saison, {home} génère {homeXg} buts attendus par match et en concède {homeXga}&nbsp;; {away} {awayXg} et {awayXga}. {best} se procure le plus d’occasions, {solid} en concède le moins.',{home:esc(dom),away:esc(ext),homeXg:fmt(f.xg.home),homeXga:fmt(f.xga.home),awayXg:fmt(f.xg.away),awayXga:fmt(f.xga.away),best:esc(meilleure),solid:esc(solide)})]);
  }
  // 5. Precision de passe.
  if(f.passes&&Math.abs(f.passes.home-f.passes.away)>=2){
    const propre=plusGrand(f.passes);
    qa.push([t('match_page.faq_q_passing','Laquelle joue le plus proprement ?'),
      tf('match_page.faq_passing_answer','{team} réussit {best} % de ses passes, contre {other} % en face. Une différence de cet ordre se traduit souvent par plus de possession et moins de contres subis.',{team:esc(propre),best:fmt(Math.max(f.passes.home,f.passes.away),0),other:fmt(Math.min(f.passes.home,f.passes.away),0)})]);
  }
  // 6. Methode.
  const sources=Array.isArray(vm.model.sources)?vm.model.sources.filter(Boolean):[];
  const sims=n(vm.model.simulationCount),quality=n(vm.model.quality);
  if(sims!==null||sources.length||quality!==null){
    const bits=[];
    if(sims!==null)bits.push(tf('match_page.faq_basis_sims','{n} simulations de Monte-Carlo',{n:sims.toLocaleString(localeTag())}));
    if(sources.length)bits.push(tf('match_page.faq_basis_sources','les données {sources}',{sources:sources.map(x=>esc(libelleSource(String(x)))).join(', ')}));
    if(quality!==null)bits.push(tf('match_page.faq_basis_quality','un score de qualité des données de {score}/100',{score:fmt(quality)}));
    qa.push([t('match_page.faq_q_basis','Sur quoi repose cette analyse ?'),
      tf('match_page.faq_basis_answer','L’analyse s’appuie sur {bits}. Les probabilités décrivent une fréquence attendue sur un grand nombre de matchs semblables, jamais une certitude sur celui-ci.',{bits:bits.join(', ')})]);
  }
  if(qa.length<2)return '';
  return card(t('match_page.faq_title','Questions sur ce match'),
    `<div class="faq-list">${qa.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}</div>`,
    'faq-card','faq');
}

// Barre collante : garde le pari et sa cote sous les yeux une fois le signal
// sorti de l'ecran par le haut. Elle recopie le signal, ne calcule rien.
function signalSticky(vm){
  const r=vm.model.recommendation;
  if(!r)return '';
  const marketOdds=n(vm.model.recommendedOdds);
  const prob=n(r.probability)!==null&&r.probability>0?r.probability:null;
  return `<div class="sig-sticky" id="sigSticky" aria-hidden="true">
    <div class="ss-in">
      <span class="ss-tag">${esc(t('match_page.sig_bet_label','Pari recommandé'))}</span>
      <b class="ss-market">${esc(marcheFr(vm,r.market))}</b>
      ${marketOdds!==null?`<span class="ss-odds">${odds(marketOdds)}</span>`:''}
      ${prob!==null?`<span class="ss-prob">${pct(prob)}</span>`:''}
    </div>
  </div>`;
}
function bindSticky(){
  const bar=document.getElementById('sigSticky'),anchor=root.querySelector('.signal-card');
  if(!bar||!anchor||!('IntersectionObserver' in window))return;
  new IntersectionObserver(([en])=>{
    bar.classList.toggle('on',!en.isIntersecting&&en.boundingClientRect.top<0);
  },{threshold:0}).observe(anchor);
}

// Bloc SEO statique des pages /match/<id>.html (h1 + resume) : VISIBLE tant
// que l'analyse charge, puis remplace par l'en-tete de l'application, qui
// porte le seul h1 de la page. Jamais de texte masque en CSS.
function remplacerResumeSeo(){
  document.querySelectorAll('.match-shell>div:not(#matchRoot)').forEach(el=>el.remove());
}

function viewModel(raw){
  const vm=IasharkMatchViewModel.buildMatchViewModel(raw);
  vm._raw=raw;
  document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;
  return vm;
}

function render(raw){
  const vm=viewModel(raw);
  // ORDRE DE LECTURE (14/09/2026, demande du proprietaire) : en-tete, le
  // signal au centre, les probabilites et cotes, la forme et les
  // face-a-face, les absences, les statistiques, les scores, les marches
  // joueurs, la repartition des buts, et la FAQ en dernier.
  // Retires a la meme occasion (doublons du signal ou du tableau) : "Notre
  // lecture du match", "Ce qu'il faut savoir", "Matchup", "Stats a ne pas
  // surinterpreter", "Value potentielle".
  const sections=[
    signalCard(vm),
    marketsCard(vm),
    formH2HCard(vm),
    absencesCard(vm),
    card(t('match_page.comparison_title','Comparatif des deux équipes'),comparison(vm),'compare-card','compare'),
    outputsCard(vm),
    threatsCard(vm),
    card(t('match_page.scenario_title','Scénario probable du match'),scenarioCard(vm),'','chart'),
    faqCard(vm)
  ];
  const corps=sections.filter(Boolean).map(node=>`<div class="sec">${node}</div>`).join('');
  remplacerResumeSeo();
  root.innerHTML=`<div class="page">${hero(vm)}<div class="secs">${corps}</div></div>${signalSticky(vm)}`;
  bindMotion();
  bindSticky();
}

function bindMotion(){
  const reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduce&&'IntersectionObserver' in window){
    const items=root.querySelectorAll('.reveal');
    let i=0;
    const io=new IntersectionObserver(entries=>{
      entries.forEach(en=>{
        if(en.isIntersecting){
          en.target.style.transitionDelay=(i%6)*55+'ms';
          i++;
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    },{threshold:.12,rootMargin:'0px 0px -6% 0px'});
    items.forEach(el=>io.observe(el));
    setTimeout(()=>{items.forEach(el=>el.classList.add('in'));},2500);
  }else{
    root.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
  }
}

// MURS D'ACCES. Le match du jour (pickFreeMatchId, meme choix que l'accueil)
// reste gratuit mais exige un compte ; les autres necessitent Pro. La vraie
// protection est cote serveur (fonction match-data). Le teaser n'affiche
// AUCUNE donnee du modele : ni pari, ni probabilite, ni ecart - seulement le
// nombre de cotes de bookmaker comparees, le niveau de fiabilite publie et un
// gabarit flou sans texte.
function gateCard(vm,opts){
  const tz=vm.teaser||{},pub=vm._raw||{};
  // Champs PUBLICS du teaser uniquement (lib/premium-fields.js) : no_signal et
  // has_signal disent "une analyse existe", sans la donner. conf (probabilite du
  // modele / 10) n'est plus affiche ici : une probabilite ne s'affiche jamais
  // sur un match non offert.
  const annonce=pub.no_signal===true?t('match_page.sig_teaser_no_signal','Aucun pari retenu par le modèle sur ce match.')
    :(pub.has_signal===true||pub.no_signal===false)?t('match_page.sig_teaser_exists','Une analyse IASHARK existe pour ce match.'):'';
  const faits=[
    n(tz.oddsCount)!==null&&tz.oddsCount>0?tf('match_page.gate_teaser_odds','{n} cotes de marché comparées au modèle',{n:tz.oddsCount}):null,
    tz.reliability?relLigne(tz.reliability):null,
    t('match_page.gate_teaser_content','Pari recommandé, probabilité du modèle, value et raisons chiffrées')
  ].filter(Boolean);
  return `<div class="page">
    ${hero(vm)}
    <section class="signal-card is-locked gate reveal" aria-labelledby="gateTitle">
      <div class="sig-head">
        <span class="sig-eyebrow">${cardIcon('target')}${esc(t('match_page.signal_title','Le signal IASHARK'))}</span>
        ${relBadge(tz.reliability)}
      </div>
      ${annonce?`<p class="sig-teaser-line">${esc(annonce)}</p>`:''}
      <div class="sig-slip is-locked">
        <div class="sig-slip-main">
          <p class="sig-kicker">${esc(t('match_page.sig_bet_label','Pari recommandé'))}</p>
          <div class="sig-ghost" aria-hidden="true"><span class="g1"></span><span class="g2"></span></div>
        </div>
        <div class="sig-odds-box is-locked" aria-hidden="true">${cardIcon('lock')}</div>
      </div>
      <div class="gate-body">
        ${cardIcon('lock')}
        <h2 id="gateTitle">${esc(opts.title)}</h2>
        <p>${esc(opts.text)}</p>
        <ul class="gate-facts">${faits.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
        <a class="btn-gate" href="${esc(opts.href)}">${esc(opts.cta)}</a>
      </div>
      ${methodLink()}
      <p class="sig-legal">${esc(t('match_page.sig_legal','18+ · Estimation statistique, pas une garantie. Jouez responsable.'))}</p>
    </section>
  </div>`;
}
function renderAuthWall(raw){
  const vm=viewModel(raw);
  remplacerResumeSeo();
  root.innerHTML=gateCard(vm,{
    title:t('match_page.gate_free_title','Match gratuit du jour'),
    text:t('match_page.gate_free_text','Ce match est gratuit, mais il faut un compte IASHARK gratuit (inscription ou connexion) pour voir l’analyse complète.'),
    href:lien('compte.html'),
    cta:t('match_page.gate_free_cta','Se connecter / Créer un compte')
  });
  bindMotion();
}
function renderProWall(raw){
  const vm=viewModel(raw);
  remplacerResumeSeo();
  root.innerHTML=gateCard(vm,{
    title:t('match_page.gate_pro_title','Analyse réservée aux membres Pro'),
    text:t('match_page.gate_pro_text','Le marché recommandé, la confiance du modèle et l’analyse complète de ce match sont réservés aux membres Pro. Le match du jour, lui, reste gratuit.'),
    href:lien('abonnement.html'),
    cta:t('match_page.gate_pro_cta','Devenir Pro')
  });
  bindMotion();
}

// Bloc SEO statique : libelles de marche poses bruts dans data-market-label,
// rediges ici dans la langue active.
function traduireShellSeo(){
  const ml=window.IasharkMarketLabels;
  if(!ml||!ml.marketLabel)return;
  document.querySelectorAll('[data-market-label]').forEach(el=>{
    el.textContent=ml.marketLabel(el.getAttribute('data-market-label'),{home:el.getAttribute('data-home')||undefined,away:el.getAttribute('data-away')||undefined});
  });
}
// "← Retour" : retour arriere seulement si le visiteur vient du site ; sinon
// l'accueil de sa version du site.
function bindBackLink(){
  document.querySelectorAll('[data-back-link]').forEach(el=>{
    el.setAttribute('href',lien(''));
    el.addEventListener('click',ev=>{
      let memeSite=false;
      try{memeSite=!!document.referrer&&new URL(document.referrer).origin===location.origin;}catch(e){}
      if(memeSite&&history.length>1){ev.preventDefault();history.back();}
    });
  });
}
async function init(){
  bindBackLink();
  try{
    // Dictionnaire charge AVANT tout rendu : jamais un flash en francais.
    if(window.I18N&&window.I18N.init){ try{ await window.I18N.init(); }catch(e){} }
    traduireShellSeo();
    // Marche sans ressource d'aide au jeu confirmee : ligne "Aide :" masquee.
    if(window.IASHARK_MARKET&&!window.IASHARK_MARKET.helpline)document.querySelectorAll('[data-helpline-row]').forEach(el=>{el.hidden=true;});
    // MODE DEMO (exemple-analyse.html) : analyse reelle figee dans le HTML.
    if(typeof IASHARK_DEMO!=='undefined'&&IASHARK_DEMO&&typeof PRELOADED_MATCH!=='undefined'){
      render(PRELOADED_MATCH);
      return;
    }
    let raw=typeof PRELOADED_MATCH!=='undefined'?PRELOADED_MATCH:null;
    // match.html ouvert sans ?id= (ou id vide/"null") : aucune requete vers
    // /match/null.json ni match-data, message "Match introuvable" directement.
    const idBrut=typeof FIXED_MATCH_ID!=='undefined'&&FIXED_MATCH_ID!=null?String(FIXED_MATCH_ID):new URLSearchParams(location.search).get('id');
    const id=idBrut&&!/^(null|undefined)$/.test(idBrut.trim())?idBrut.trim():(raw&&raw.id!=null?String(raw.id):null);
    if(!id)throw new Error(t('match_page.match_not_found','Match introuvable'));
    let list=null;
    let ctx={session:null,isPro:false};
    if(window.IasharkApp){
      ctx=await window.IasharkApp.context();
      if(ctx.session){
        const result=await window.IasharkApp.supabase.functions.invoke('match-data',{body:{id:String(id)}});
        if(result.data&&!result.error){
          list=result.data.matchs||[];
          raw=list.find(x=>String(x.id)===String(id))||raw;
        }
      }
    }
    // Sans session : liste legere data-home.json et detail match/<id>.json en
    // parallele (lib/public-data-split.js). cache:'no-cache' revalide (ETag).
    const lire=u=>fetch(u,{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
    const fusion=(complet,partiel)=>{const m=Object.assign({},complet,partiel||{});delete m.detail_omitted;return m;};
    if(!list||!raw||raw.detail_omitted){
      const [liste,detail]=await Promise.all([
        list?null:lire('/data-home.json'),
        raw&&!raw.detail_omitted?null:lire('/match/'+encodeURIComponent(id)+'.json')
      ]);
      if(!list&&liste&&Array.isArray(liste.matchs))list=liste.matchs;
      if(detail&&String(detail.id)===String(id))raw=fusion(detail,raw);
    }
    if(!list||!raw||raw.detail_omitted){
      const data=await fetch('/data.json',{cache:'no-cache'}).then(r=>r.json());
      list=list||data.matchs||[];
      const complet=(data.matchs||[]).find(x=>String(x.id)===String(id));
      if(complet)raw=fusion(complet,raw);
      else if(raw)raw=fusion({},raw);
    }
    if(!raw)throw new Error(t('match_page.match_not_found','Match introuvable'));
    const isFree=String(raw.id)===String(IasharkFreeMatch.pickFreeMatchId(list,null,(window.IASHARK_MARKET&&window.IASHARK_MARKET.code)||null));
    if(isFree&&!ctx.session){renderAuthWall(raw);return;}
    if(!isFree&&!ctx.isPro){renderProWall(raw);return;}
    render(raw);
  }catch(e){
    root.innerHTML=`<div class="match-error"><b>${esc(e.message||t('match_page.generic_load_error','Erreur de chargement'))}</b><a href="${esc(lien(''))}">${esc(t('match_page.back_to_home','Retour à l\'accueil'))}</a></div>`;
  }
}
init();
})();
