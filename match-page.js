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
// Dimensions toujours posees (aucun decalage quand l'image arrive). eager :
// image au-dessus de la ligne de flottaison (en-tete), jamais lazy ;
// priority : element LCP probable (logos d'equipes de l'en-tete).
const img=(src,alt,w,h,opts)=>{
  if(!src)return '';
  const o=opts||{};
  return `<img src="${esc(src)}" alt="${esc(alt)}"${w?` width="${w}" height="${h}"`:''}${o.eager?'':' loading="lazy" decoding="async"'}${o.priority?' fetchpriority="high"':''}>`;
};
const empty=txt=>`<div class="empty">${esc(txt)}</div>`;

// Icones (04/10/2026, exigence de Clement : un vrai jeu d'icones, rien de dessine a
// la main) : jeu Lucide (lib/icones.js, licence ISC, charge avant ce script). Seule la
// cible de l'Avis IASHARK garde son trace d'origine : l'Avis ne change pas d'un
// caractere (tests/match-page-structure.test.js).
const ICONS={
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>'
};
const LUCIDE={pin:'map-pin',cloud:'cloud',lock:'lock',calendar:'calendar-x'};
const lucide=(nom,cls)=>window.IasharkIcones?window.IasharkIcones.svg(nom,cls||'card-icon'):'';
const cardIcon=key=>ICONS[key]?`<svg viewBox="0 0 24 24" class="card-icon" aria-hidden="true" focusable="false">${ICONS[key]}</svg>`:(LUCIDE[key]?lucide(LUCIDE[key]):'');
// Carte. opts.fold : la meme carte en version repliable (le titre est le
// bouton, une ligne de resume reste visible) : { key, summary, open }.
const card=(title,body,cls='',icon='',opts)=>opts&&opts.fold
  ?fold(Object.assign({title,icon,body},opts.fold))
  :`<section class="card reveal ${cls}"><h2>${cardIcon(icon)}${esc(title)}</h2>${body}</section>`;

// ---------------------------------------------------------------------------
// COMPOSANTS DE LA PAGE (maquette V8 validee par le proprietaire, 16/09/2026).
// Regle : tout ce que l'IA donne est FERME pour le visiteur ; toutes les stats
// brutes sont OUVERTES. Mobile 375 px d'abord.
// ---------------------------------------------------------------------------
const reduceMotion=()=>!!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
let seq=0;
const uid=p=>`${p}${++seq}`;
// Suivi funnel-track.js : kind dedie (liste fermee), libelle fixe.
const suivi=kind=>` data-track="${kind}" data-track-kind="${kind}"`;

// Bulle "?" (position absolue dans .tip-host : l'ouvrir ne decale rien).
function aide(texte,label){
  const id=uid('tip');
  return `<span class="tip"><button type="button" class="tip-btn" aria-expanded="false" aria-controls="${id}" aria-label="${esc(label)}">?</button><span class="tip-pop" id="${id}" role="note" hidden>${esc(texte)}</span></span>`;
}
const texteAideCote=()=>t('match_page.proba_help_implied','« Ce que dit la cote » : la chance de réussite que suppose la cote du bookmaker, soit 1 ÷ cote (une cote de 2,00 correspond à 50 %). Quand les deux issues sont cotées, sa marge est retirée.');
const labelAideCote=()=>t('match_page.proba_help_label','Que veut dire « ce que dit la cote » ?');

// Carte repliable : le titre EST le bouton, une ligne de resume reste visible.
// o : { key, title, icon, summary (HTML deja echappe), body (HTML), open }
function fold(o){
  const id=uid('fold'),ouvert=!!o.open;
  return `<section class="card fold rep${ouvert?' is-open':''} reveal"${o.key?` data-fold="${esc(o.key)}"`:''}>
    <h3 class="fold-h"><button type="button" class="rep-btn fold-btn" aria-expanded="${ouvert}" aria-controls="${id}">${cardIcon(o.icon)}<span class="fold-t">${esc(o.title)}</span>${o.summary?`<span class="fold-s">${o.summary}</span>`:''}<i aria-hidden="true"></i></button></h3>
    <div class="rep-panel" id="${id}"${ouvert?'':' inert'}><div class="rep-inner">${o.body}</div></div>
  </section>`;
}
// ---- Deux barres "Notre estimation" / "Ce que dit la cote" + ecart en mots ----
// Probabilite de marche exploitable : > 0. Une donnee ABSENTE n'est jamais
// "0 %" (lib/match-view-model.js#marketTable la laisse a null).
const marcheValide=v=>n(v)!==null&&n(v)>0?n(v):null;
function ecart(model,market,edge){
  const m=n(model),k=n(market);
  if(m===null||k===null)return{cls:'none',text:t('match_page.proba_gap_none','Pas de cote comparable pour ce pari.'),gap:''};
  const e=n(edge)!==null?n(edge):Math.round((m-k)*10)/10;
  const r=Math.round(Math.abs(e));
  if(r===0)return{cls:'flat',text:t('match_page.proba_gap_flat','Notre estimation et la cote disent la même chose.'),gap:''};
  const gap=`${e>0?'+':'−'}${r} ${r===1?t('match_page.proba_point_one','point'):t('match_page.proba_point_other','points')}`;
  return e>0
    ?{cls:'pos',text:t('match_page.proba_gap_pos','Le modèle voit plus de chances que le bookmaker'),gap}
    :{cls:'neg',text:t('match_page.proba_gap_neg','Le modèle voit moins de chances que le bookmaker'),gap};
}
function duoBars(o){
  const m=n(o.model),k=marcheValide(o.market),c=n(o.odds);
  const g=ecart(m,k,k===null?null:o.edge);
  const kLabel=o.kind==='consensus'&&c===null?t('match_page.proba_market_consensus','Ce que disent les cotes'):t('match_page.proba_market_label','Ce que dit la cote');
  const coteTxt=c!==null&&!o.compact?` <em>${esc(odds(c))} →</em>`:'';
  const aria=k===null
    ?tf('match_page.proba_aria_model_only','Notre estimation : {model}',{model:pct(m,0)})
    :tf('match_page.proba_aria','Notre estimation : {model}. Ce que dit la cote : {market}.',{model:pct(m,0),market:pct(k,0)});
  const ligne=(cls,label,val,part)=>`<div class="duo-line ${cls}"><span class="duo-k">${label}</span><b class="duo-v">${esc(val)}</b><span class="duo-track" aria-hidden="true"><i style="--s:${(part/100).toFixed(3)}"></i></span></div>`;
  return `<div class="duo${o.compact?' duo--compact':''}" role="group" aria-label="${esc(aria)}">
    ${ligne('is-model',esc(t('match_page.proba_model_label','Notre estimation')),pct(m,0),clamp(m))}
    ${k!==null?ligne('is-market',esc(kLabel)+coteTxt,pct(k,0),clamp(k))
      :`<div class="duo-line is-market is-na"><span class="duo-k">${esc(kLabel)}</span><span class="duo-na">${esc(t('match_page.proba_market_na','non disponible'))}</span></div>`}
    <p class="duo-gap is-${g.cls}"><i aria-hidden="true"></i><span>${esc(g.text)}${g.gap?`${esc(t('match_page.label_colon',' :'))} <b>${esc(g.gap)}</b>`:''}</span></p>
  </div>`;
}

// ---- Niveau public prob_band (lib/public-data-split.js#probBand) ----
// 3 niveaux, 3 barres, JAMAIS un chiffre. Libelles partages avec l'accueil.
const BANDES={high:['home_list.band_high','Probabilité élevée',3],good:['home_list.band_good','Bonne probabilité',2],moderate:['home_list.band_moderate','Probabilité modérée',1]};
const BANDES_COURTES={high:'Proba. élevée',good:'Bonne proba.',moderate:'Proba. modérée'};
const bandeDe=m=>m&&Object.prototype.hasOwnProperty.call(BANDES,m.prob_band)?m.prob_band:null;
function bandBadge(b,court){
  if(!BANDES[b])return '';
  const [k,fb,niveau]=BANDES[b];
  const label=court?t(k+'_short',BANDES_COURTES[b]):t(k,fb);
  return `<span class="band is-${b}">${lucide(['signal-low','signal-medium','signal-high'][niveau-1]||'signal-low','band-ico')}<b>${esc(label)}</b></span>`;
}
// Etat PUBLIC de l'analyse : 'ready' (has_signal / no_signal:false), 'none'
// (no_signal:true), 'unknown'.
function etatAnalyse(raw){
  if(!raw)return 'unknown';
  if(raw.no_signal===true)return 'none';
  if(raw.has_signal===true||raw.no_signal===false)return 'ready';
  return 'unknown';
}

// Defense en profondeur (vue visiteur) : copie de lib/premium-fields.js#PREMIUM_FIELDS
// (tests/match-page-structure.test.js verifie qu elle la contient toute ; en plus,
// 04/10/2026 : marches_panneau, sim_resume, jumeaux, premier_but, v3_premiers_buteurs).
// prob_band, has_signal, no_signal
// et nb_marches restent : ils sont publics.
const CHAMPS_PREMIUM=["pari_rec","cote_rec","model_probability","markets_compared","market_id","marche","kelly","edge","verdict_shark","facteur_x","dropping_odds","player_markets","facteur_x_i18n","verdict_shark_i18n","conf","p1","pn","p2","po15","po25","btts","lambda_h","lambda_a","market_aware_p1","market_aware_pN","market_aware_p2","market_consensus_p1","market_consensus_pN","market_consensus_p2","mc_scores","scores","simulation_count","paris_safe","paris_risque","vbet","val","hot","risque","mise","pick_downgrade","odds_available","is_canonical_pick","reliability","model_agreement","crit_home","crit_away","elo_signal","analyse_card","analyse_card_i18n","conseil_public","conseil_public_i18n","contexte","contexte_i18n","scenario","scenario_i18n","scenario_15min","sim_15min","decision_factors","risk_principal","top_scorers","v3_fiabilite","v3_pari","v3_marches","v3_suivi","v3_buteurs","chance_iashark","chance_iashark_source","cote_bookmaker","cote_source","cote_releve_a","sans_marge_anj","stats_iashark","lecture_match","pronostic","marches_flux","option_cote","chance_correction","marches_panneau","sim_resume","jumeaux","premier_but","v3_premiers_buteurs"];
function publicCopy(raw){
  const copie={};
  Object.keys(raw||{}).forEach(k=>{if(CHAMPS_PREMIUM.indexOf(k)===-1)copie[k]=raw[k];});
  return copie;
}

// Traduction d'un libelle de marche du moteur dans la forme standard des
// bookmakers, avec les noms des equipes (lib/market-labels.js) : "DC 1X" ->
// "Double chance : Leeds ou nul". Appliquee a l'AFFICHAGE seulement.
// Nom historique conserve ; le libelle sort dans la langue active.
function marcheFr(vm,libelle){
  const ml=window.IasharkMarketLabels;
  return ml?(ml.marketLabel||ml.marketLabelFr)(libelle,{home:vm.identity.home.name,away:vm.identity.away.name}):String(libelle||'');
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
function hero(vm,o){
  o=o||{};
  const i=vm.identity,s=i.standings||{},dh=dateHeure(vm),ln=nomLigue(i,vm),f=vm.form||{};
  const c=vm.conditions;
  const lieu=c.venue||c.weather?`<div class="hero-venue">${c.venue?`<span>${cardIcon('pin')}${esc(c.venue)}</span>`:''}${c.weather?`<span>${cardIcon('cloud')}${esc(temperature(c.weather.temperature))}${meteo(c.weather.description)?' · '+esc(meteo(c.weather.description)):''}</span>`:''}</div>`:'';
  // Page exemple-analyse : son H1 est statique (bandeau), l'en-tete y passe en h2.
  // Page statique /match/<id>.html : le resume SEO garde son h1 et reste en
  // place (plus de suppression = plus de decalage), l'en-tete passe en h2.
  const demo=typeof IASHARK_DEMO!=='undefined'&&IASHARK_DEMO;
  const enH2=demo||!!resumeSeoStatique();
  const titreOuvrant=enH2?'<h2 class="hero-teams">':'<h1 class="hero-teams">',titreFermant=enH2?'</h2>':'</h1>';
  // Pas de classe reveal sur l'en-tete : visible des le rendu (element LCP),
  // jamais en opacite 0 le temps d'une animation.
  return `<header class="card hero">
    <div class="hero-top">
      <span class="hero-league">${img(i.league.logo,'',18,18,{eager:true})}<span>${esc(ln)}</span></span>
      <span class="hero-time">${esc(dh.date||t('match_page.date_tbc','Date à confirmer'))} · <b>${esc(dh.time||'—')}</b></span>
    </div>
    ${titreOuvrant}
      <span class="hero-team">${img(i.home.logo,'',60,60,{eager:true,priority:true})}<span class="hero-name">${esc(i.home.name)}</span></span>
      <span class="hero-vs">${esc(t('match_page.vs_label','vs'))}</span>
      <span class="hero-team">${img(i.away.logo,'',60,60,{eager:true,priority:true})}<span class="hero-name">${esc(i.away.name)}</span></span>
    ${titreFermant}
    ${o.sansStats?'':`<div class="hero-meta"><div>${teamMeta(s.home,f.home)}</div><div>${teamMeta(s.away,f.away)}</div></div>`}
    ${lieu}
  </header>`;
}

// ---------------------------------------------------------------------------
// LE SIGNAL IASHARK — centre de la page, juste sous l'en-tete.
// Dans l'ordre de lecture d'un parieur : le pari (forme standard, en grand),
// la fiabilite en une ligne, la probabilite du modele sur une jauge ou le
// marche est pose en repere, la cote utilisee et sa probabilite implicite,
// l'ecart dit simplement, deux ou trois raisons tirees des donnees reelles,
// les points a surveiller, et la mention « estimation, pas une garantie »
// (21/09/2026 : detail des chiffres, lien methodologie et mentions 18+ /
// jeu responsable retires de la page match - outil d'analyse, pas un
// bookmaker ; la mention 18+ reste au pied de page et dans les CGV).
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
// config/markets.json#_legalFiles.methodology, sources legal/<dir>/ (les 9
// repertoires depuis le 19/09/2026) ; un repertoire inconnu renvoie vers
// la version anglaise.
// Un match est TERMINE quand l'API le dit (FT/AET/PEN) ou, a defaut, plus de
// 3 h 30 apres le coup d'envoi — large, pour couvrir prolongations, tirs au but
// et coup d'envoi retarde. Un match reporte, annule ou sans heure fiable n'est
// JAMAIS considere comme termine : son pari garde toute sa valeur.
var STATUTS_FINIS=['FT','AET','PEN'];
var STATUTS_BLOQUANTS=['PST','CANC','SUSP','INT','ABD','AWD','WO','TBD'];
function matchTermine(m){
  if(!m)return false;
  var st=String(m.status||'').trim().toUpperCase();
  if(STATUTS_BLOQUANTS.indexOf(st)!==-1)return false;
  if(STATUTS_FINIS.indexOf(st)!==-1)return true;
  var MT=window.IasharkMatchTime;
  var ts=MT&&MT.matchTimestamp?MT.matchTimestamp(m):NaN;
  if(!isFinite(ts))return false;
  return Date.now()-ts>3.5*60*60*1000;
}


// L'AVIS IASHARK (abonne Pro ou match offert connecte) : le pari et sa cote,
// « Nos chances face a la cote » en deux barres avec l'ecart dit en mots, sur
// 100 matchs, pourquoi, a surveiller, risque et fiabilite, puis le detail des
// chiffres replie (note /10, probabilite implicite, ecart exact).
// L'ecart est affiche HONNETEMENT, y compris quand il est defavorable.
function signalCard(vm){
  const r=vm.model.recommendation,raw=vm._raw||{};
  const titre=t('match_page.avis_title','L’avis IASHARK');
  if(!r){
    // Une analyse existe (has_signal, amorce publique) mais son detail premium
    // n est pas servi par match-data (abonne Pro avant la prochaine mise a jour
    // de match_premium_data) : etat neutre, jamais "aucun marche".
    const msg=raw.has_signal===true&&raw.no_signal!==true
      ?t('match_page.sig_premium_updating','Analyse détaillée en cours de mise à jour. Le marché recommandé et les probabilités s’afficheront dès la prochaine actualisation.')
      :raw.no_signal===true?t('match_page.avis_no_signal','Pas de pari retenu par le modèle sur ce match')
      :vm.model.unavailableReason?t('match_page.model_unavailable_reason',vm.model.unavailableReason)
      :t('match_page.signal_unavailable_fallback','Aucun marché ne franchit les seuils de confiance ou de cote minimale pour ce match — IASHARK préfère ne pas se prononcer.');
    return card(titre,empty(msg),'signal-card avis','target');
  }
  // Une probabilite nulle ou absente n'est jamais affichee "0 %" : elle
  // n'existe pas (constate en ligne sur un match servi sans le champ).
  const prob=n(r.probability)!==null&&r.probability>0?n(r.probability):null;
  const cote=n(vm.model.recommendedOdds),implied=n(vm.model.recommendedImplied);
  const edge=prob!==null?n(vm.model.recommendedEdge):null;
  const info=vm.model.reliabilityInfo;
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
  const plain=prob!==null&&implied!==null
    ?tf('match_page.sig2_plain','Sur 100 matchs comme celui-ci, notre modèle s’attend à voir ce pari passer environ {model} fois ; la cote en suppose {market}.',{model:Math.round(prob),market:Math.round(implied)}):'';
  const compare=prob===null?'':`<div class="sig2-cmp tip-host">
      <div class="sig2-cmp-head"><h3>${esc(t('match_page.sig2_compare_title','Nos chances face à la cote'))}</h3>${aide(texteAideCote(),labelAideCote())}</div>
      ${duoBars({model:prob,market:implied,odds:cote,edge,kind:'odds'})}
      ${plain?`<p class="sig2-plain">${esc(plain)} <span>${esc(t('match_page.sig2_not_guarantee','Estimation statistique, pas une garantie.'))}</span></p>`:''}
    </div>`;
  const risque=riskStat(vm.editorial.riskCode);
  return `<section class="signal-card avis sig2 reveal" aria-labelledby="sigMarket">
    <div class="sig-head"><span class="sig-eyebrow">${cardIcon('target')}${esc(titre)}</span>${relBadge(info)}</div>
    <div class="sig-slip">
      <div class="sig-slip-main">
        <p class="sig-kicker">${esc(t('match_page.sig_bet_label','Pari recommandé'))}</p>
        <h2 class="sig-market" id="sigMarket">${esc(marcheFr(vm,r.market))}</h2>
        <p class="sig-fixture">${esc(tf('match_page.sig_match_line','{home} – {away}',{home:vm.identity.home.name,away:vm.identity.away.name}))}</p>
      </div>
      ${cote!==null?`<div class="sig-odds-box"><span>${esc(t('match_page.sig_odds_used','Cote utilisée'))}</span><b>${odds(cote)}</b></div>`:''}
    </div>
    ${compare}
    ${puces.length?`<div class="sig-why"><h3>${esc(t('match_page.sig_why_title','Pourquoi ce pari'))}</h3><ul>${puces.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div>`:''}
    <p class="sig-watch"><b>${esc(t('match_page.sig_watch_title','À surveiller'))}</b> ${esc(aSurveiller)}</p>
    ${confMeter(r.confidence)}
    ${risque||info?`<div class="sig2-meta">${risque}${info?`<p class="sig-rel-note">${esc(relLigne(info))}</p>`:''}</div>`:''}
    <p class="sig-legal">${esc(t('match_page.sig_legal','Estimation statistique, pas une garantie.'))}</p>
  </section>`;
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


// ---------------------------------------------------------------------------
// PAGE MATCH V4 (04/10/2026, demande de Clement). L'Avis IASHARK ci-dessus ne
// change pas d'un caractere. Retires : confrontations directes (tete-a-tete),
// questions frequentes, barre collante du pari, « Probabilites et cotes »,
// « Ce que dit le modele », « Scenario probable », ancien calcul buteur
// (scorerModel). Les nouvelles sections (le match en simulation, le film du
// match, qui ouvre le score et « Et si... ? », les jumeaux, les deux equipes,
// les joueurs, l'arbitre) et le panneau Marches vivent dans
// lib/match-sections.js ; aucune information n'y est ecrite deux fois
// (registre unique, l'Avis inscrit ses cles en premier).
// ---------------------------------------------------------------------------

// Modules charges a la demande : une page statique /match/<id>.html generee
// avant cette version n'inclut pas encore ces fichiers (regeneree par le calcul
// quotidien). Jamais d'erreur : sans module, la section manque, rien de plus.
function besoin(nomGlobal,src){
  return new Promise(ok=>{
    if(window[nomGlobal])return ok(window[nomGlobal]);
    const s=document.createElement('script');s.src=src;
    s.onload=()=>ok(window[nomGlobal]||null);s.onerror=()=>ok(null);
    document.head.appendChild(s);
  });
}
function feuille(href){
  if(document.querySelector(`link[href^="${href}"]`))return;
  const l=document.createElement('link');l.rel='stylesheet';l.href=href;document.head.appendChild(l);
}
// Composants de bibliotheques (04/10/2026, exigence de Clement : de vrais
// composants) : icones Lucide (lib/icones.js), Magic UI / HyperUI / Flowbite /
// Chart.js (lib/composants.js, assets/composants.css), charges avant les sections.
const composants=()=>{feuille('/assets/composants.css');return besoin('IasharkIcones','/lib/icones.js').then(()=>besoin('IasharkComposants','/lib/composants.js'));};
const modulesV4=()=>{feuille('/assets/match-sections.css');return composants().then(()=>besoin('IasharkMatchSections','/lib/match-sections.js'));};
const moduleOffre=()=>{feuille('/assets/offre-pro.css');return composants().then(()=>besoin('IasharkOffrePro','/lib/offre-pro.js'));};
// Gros bouton d'action (Magic UI Shimmer Button) ; repli : lien simple.
const boutonAction=(href,label,attrs,cls)=>window.IasharkComposants?IasharkComposants.boutonShimmer({href,label,icone:'arrow-right',cls:cls||'op-cta',attrs:attrs||''}):`<a class="mu-shimmer ${cls||'op-cta'}" href="${esc(href)}"${attrs?' '+attrs:''}>${esc(label)}</a>`;

// SOMMAIRE COLLANT : une puce par section rendue, dans l'ordre de la page ;
// sur telephone, une puce « Marches » ouvre le tiroir.
function navChips(items,apres){
  if(items.length<2&&!apres)return '';
  return `<nav class="mnav" id="matchNav" aria-label="${esc(t('match_page.nav_aria','Sommaire du match'))}">
    <ul class="mnav-chips">${items.map(x=>`<li><a class="mnav-chip" href="#sec-${x.cle}" data-nav="${x.cle}">${esc(x.label)}${x.lock?cardIcon('lock'):''}</a></li>`).join('')}${apres||''}</ul>
  </nav>`;
}
let navSurDefilement=null,navSurRedim=null;
function bindNav(){
  if(navSurDefilement)window.removeEventListener('scroll',navSurDefilement);
  if(navSurRedim)window.removeEventListener('resize',navSurRedim);
  navSurDefilement=navSurRedim=null;
  const nav=root.querySelector('#matchNav');
  if(!nav)return;
  const bar=nav.querySelector('.mnav-chips'),chips=[...nav.querySelectorAll('a.mnav-chip')];
  const secs=[...root.querySelectorAll('.sec[data-sec]')];
  let actif,attente=false;
  const maj=()=>{
    attente=false;
    const seuil=Math.max(nav.getBoundingClientRect().bottom+96,window.innerHeight*0.4);
    let cur=null;
    for(const s of secs){if(s.getBoundingClientRect().top<=seuil)cur=s;else break;}
    if(secs.length&&window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-4)cur=secs[secs.length-1];
    const key=cur?cur.dataset.sec:null;
    if(key===actif)return;
    actif=key;
    chips.forEach(c=>{const on=c.dataset.nav===key;c.classList.toggle('is-active',on);if(on)c.setAttribute('aria-current','true');else c.removeAttribute('aria-current');});
    const chip=chips.find(c=>c.dataset.nav===key);
    if(chip&&bar.scrollWidth>bar.clientWidth)bar.scrollTo({left:Math.max(0,chip.offsetLeft-(bar.clientWidth-chip.offsetWidth)/2),behavior:reduceMotion()?'auto':'smooth'});
  };
  navSurDefilement=()=>{if(!attente){attente=true;requestAnimationFrame(maj);}};
  navSurRedim=()=>{actif=undefined;maj();};
  window.addEventListener('scroll',navSurDefilement,{passive:true});
  window.addEventListener('resize',navSurRedim,{passive:true});
  chips.forEach(c=>c.addEventListener('click',ev=>{
    const cible=document.getElementById(c.getAttribute('href').slice(1));
    if(!cible)return;
    ev.preventDefault();
    cible.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'});
    try{history.replaceState(null,'',c.getAttribute('href'));}catch(e){}
  }));
  maj();
}
let uiLie=false;
function bindUi(){
  if(uiLie)return;
  uiLie=true;
  const fermerBulles=sauf=>root.querySelectorAll('.tip-btn[aria-expanded="true"]').forEach(b=>{
    if(b===sauf)return;
    b.setAttribute('aria-expanded','false');
    const p=document.getElementById(b.getAttribute('aria-controls'));if(p)p.hidden=true;
  });
  root.addEventListener('click',ev=>{
    const rep=ev.target.closest('.rep-btn');
    if(rep){
      const box=rep.closest('.rep'),panel=document.getElementById(rep.getAttribute('aria-controls'));
      const ouvert=!box.classList.contains('is-open');
      box.classList.toggle('is-open',ouvert);
      rep.setAttribute('aria-expanded',String(ouvert));
      if(panel){if(ouvert)panel.removeAttribute('inert');else panel.setAttribute('inert','');}
      if(rep.dataset.labelOpen)rep.querySelector('span').textContent=ouvert?rep.dataset.labelOpen:rep.dataset.labelClosed;
      return;
    }
    const tip=ev.target.closest('.tip-btn');
    if(tip){
      const pop=document.getElementById(tip.getAttribute('aria-controls')),ouvrir=tip.getAttribute('aria-expanded')!=='true';
      fermerBulles(tip);
      tip.setAttribute('aria-expanded',String(ouvrir));
      if(pop)pop.hidden=!ouvrir;
      return;
    }
    if(!ev.target.closest('.tip-pop'))fermerBulles(null);
  });
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape')fermerBulles(null);});
}

// Bloc SEO statique des pages /match/<id>.html (h1 + resume). Il RESTE en
// place apres le rendu (audit perf 15/09/2026 : sa suppression decalait toute
// la page, CLS 0,7) et garde le seul h1 ; l'en-tete de l'application passe
// alors en h2 (hero). Jamais de texte masque en CSS. null sur match.html?id=.
function resumeSeoStatique(){
  return document.querySelector('.match-shell>div:not(#matchRoot)');
}

function viewModel(raw){
  const vm=IasharkMatchViewModel.buildMatchViewModel(raw);
  vm._raw=raw;
  document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;
  return vm;
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


// Assemble la page. sections : [cle, html, libelle du sommaire (ou null), verrouillee].
// opts : { sansStats, panneau: { html, nb, flou, fab } }.
// Ordinateur (>= 1100 px) : panneau Marches en colonne gauche collante.
// Telephone : bouton flottant et puce « Marches » qui ouvrent le tiroir du bas.
function paint(vm,sections,opts){
  opts=opts||{};
  const S=sections.filter(x=>x&&x[1]);
  const items=S.filter(x=>x[2]).map(x=>({cle:x[0],label:x[2],lock:!!x[3]}));
  const corps=S.map(([k,html,,lock])=>`<div class="sec" id="sec-${k}" data-sec="${k}"${lock?' data-locked="true"':''}>${html}</div>`).join('');
  const mk=opts.panneau||null;
  const libMk=t('match_v4.panel_title','Marchés');
  const puce=mk&&mk.fab?`<li class="mnav-mk"><button type="button" class="mnav-chip" data-mk-open>${esc(libMk)}${mk.flou?cardIcon('lock'):''}</button></li>`:'';
  const fab=mk&&mk.fab?`<button type="button" class="mk-fab" data-mk-open>${esc(libMk)}${mk.nb?` <b>· ${esc(Number(mk.nb).toLocaleString(localeTag()))}</b>`:''}${mk.flou?cardIcon('lock'):''}</button>`:'';
  document.body.classList.remove('has-cta-bar');
  root.innerHTML=`<div class="page${mk?' has-mk':''}">${mk?`<aside class="mk-col${mk.flou?' is-locked':''}" id="mkCol" aria-labelledby="mkTitle">${mk.html}</aside>`:''}<div class="page-main">${hero(vm,opts)}${navChips(items,puce)}<div class="secs">${corps}</div></div></div>${fab}`;
  bindMotion();
  bindUi();
  bindNav();
  const MS=window.IasharkMatchSections;
  if(MS){
    try{MS.bind(root);}catch(e){}
    const col=document.getElementById('mkCol');
    if(col){
      const tir=MS.tiroir(col,[...root.querySelectorAll('[data-mk-open]')]);
      MS.bindPanneau(col,tir);
      col.querySelectorAll('[data-mk-scroll]').forEach(a=>a.addEventListener('click',ev=>{
        const cible=document.querySelector(a.getAttribute('href'));
        if(!cible)return;
        ev.preventDefault();tir.fermer();
        cible.scrollIntoView({behavior:reduceMotion()?'auto':'smooth',block:'start'});
      }));
    }
  }
}

// Chemin de CE match (retour apres inscription ou paiement).
function cheminMatch(raw){
  const id=raw&&raw.id!=null?String(raw.id):'';
  return /^\d+$/.test(id)?lien('match.html?id='+id):lien('');
}
// o : { vuePro (abonne confirme), verrouPro (compte gratuit sur le match offert :
// lignes cadenas et panneau flou), panneau (false : aucun panneau) }
function render(raw,o){
  o=o||{};
  const vm=viewModel(raw);
  const MS=window.IasharkMatchSections;
  const secs=[['avis',signalCard(vm),t('match_v4.nav_avis','Avis'),false]];
  let panneau=null;
  if(MS){
    const dit=MS.registre();
    MS.clesAvis(vm,raw,dit);
    const c={raw,vm,vuePro:!!o.vuePro,verrouPro:!!o.verrouPro,dit};
    MS.sections(c).forEach(([k,html,lab])=>secs.push([k,html,t(lab[0],lab[1]),false]));
    if(o.panneau!==false){
      if(o.vuePro){const p=MS.panneau(c);if(p)panneau={html:p.html,nb:p.nb,fab:true};}
      else if(o.verrouPro){
        const cta=boutonAction(window.IasharkOffrePro?IasharkOffrePro.lienAbonnement('month',cheminMatch(raw)):lien('abonnement.html'),t('match_v4.panel_cta','Passe Pro'),suivi('match_gate_unlock').trim(),'mk-cta');
        panneau={html:MS.panneauFlou(raw.nb_marches,cta),nb:n(raw.nb_marches),flou:true,fab:true};
      }
    }
  }
  paint(vm,secs,{panneau});
}

// VUE VISITEUR. Le serveur decide ce qu'il envoie (match-data, fichiers publics
// sans champ premium) ; ici, copie sans aucun champ premium AVANT tout calcul,
// et seulement des champs PUBLICS (has_signal, no_signal, prob_band, nb_marches).
// MATCH BLOQUE (04/10/2026, demande de Clement) : juste sous l'en-tete, LE
// composant de paiement (lib/offre-pro.js, mode vitrine : appel a l'action en
// haut, la duree, un bouton, ce que donne Pro, comment on paie) ; dessous un
// apercu flou COURT de faux chiffres. Sur ordinateur, le panneau Marches flou a
// gauche renvoie au meme composant (aucun deuxieme chemin de paiement).
function enTeteOffre(raw){
  const etat=etatAnalyse(raw),bande=etat==='ready'?bandeDe(raw):null;
  if(etat==='ready')return `<span class="avis-ready">${lucide('circle-check','avis-ready-ico')}<span>${esc(t('match_page.avis_ready','Analyse prête'))}</span></span>${bande?' '+bandBadge(bande):''}`;
  if(etat==='none')return esc(t('match_page.avis_no_signal','Pas de pari retenu par le modèle sur ce match'));
  return '';
}
function renderProWall(raw,ctx){
  const vm=viewModel(publicCopy(raw));
  const pub=vm._raw;
  const MS=window.IasharkMatchSections;
  // Repli sans module : un lien vers l'abonnement (jamais une page vide).
  const repli=`<section class="op op--vitrine"><h2 class="op-title">${esc(t('offre_pro.title_match','Passe Pro pour ouvrir ce match'))}</h2>${boutonAction(lien('abonnement.html?duree=month&next='+encodeURIComponent(cheminMatch(raw))),t('match_v4.panel_cta','Passe Pro'),suivi('match_gate_unlock').trim())}</section>`;
  const secs=[['offre',`<div id="offreMatch" class="gate">${repli}</div>`,null,true]];
  if(MS)secs.push(['apercu',MS.apercuFlou(),null,true]);
  const cta=window.IasharkComposants?IasharkComposants.boutonShimmer({href:'#sec-offre',label:t('match_v4.panel_cta','Passe Pro'),icone:'arrow-up',cls:'mk-cta',attrs:'data-mk-scroll'}):`<a class="mu-shimmer mk-cta" href="#sec-offre" data-mk-scroll>${esc(t('match_v4.panel_cta','Passe Pro'))}</a>`;
  paint(vm,secs,{sansStats:true,panneau:MS?{html:MS.panneauFlou(pub.nb_marches,cta),flou:true,fab:false}:null});
  const box=document.getElementById('offreMatch');
  if(window.IasharkOffrePro&&box)IasharkOffrePro.mount(box,{mode:'vitrine',contexte:'match',next:cheminMatch(raw),connecte:!!(ctx&&ctx.session),sousTitre:enTeteOffre(pub),suivi:'match_gate_unlock'});
}
// MATCH OFFERT, SANS COMPTE : meme dessin que le composant de paiement, un seul
// bouton « Creer mon compte gratuit » (retour sur ce match), lien discret
// « J'ai deja un compte ». Aucun panneau Marches (un seul bouton par page).
function renderAuthWall(raw){
  const vm=viewModel(publicCopy(raw));
  const MS=window.IasharkMatchSections;
  const retour=encodeURIComponent(cheminMatch(raw));
  const sous=enTeteOffre(vm._raw);
  const carte=`<section class="op op--vitrine gate" aria-labelledby="opCompteT">
    <div class="op-head"><span class="op-lock" aria-hidden="true">${lucide('lock','')}</span><h2 class="op-title" id="opCompteT">${esc(t('match_v4.free_title','Ce match est offert aujourd’hui'))}</h2>${sous?`<div class="op-sub">${sous}</div>`:''}<p class="op-from">${esc(t('match_v4.free_sub','Crée ton compte gratuit pour ouvrir toute l’analyse. Sans carte bancaire.'))}</p></div>
    ${boutonAction(lien('inscription.html?next='+retour),t('match_v4.free_cta','Créer mon compte gratuit'),suivi('match_avis_unlock').trim())}
    <a class="op-alt" href="${esc(lien('connexion.html?next='+retour))}">${esc(t('match_v4.free_login','J’ai déjà un compte'))}</a>
  </section>`;
  const secs=[['offre',carte,null,true]];
  if(MS)secs.push(['apercu',MS.apercuFlou(),null,true]);
  paint(vm,secs,{sansStats:true});
}
// Apercu : en-tete du match (donnees publiques, aucune sortie du modele) et
// place reservee du signal / mur d'acces, le temps de lire la session.
function renderApercu(raw){
  try{
    root.innerHTML=`<div class="page">${hero(viewModel(raw),{sansStats:true})}<div class="loading-card sig-pending"><span></span><p>${esc(t('match_page.loading_analysis','Chargement de l’analyse…'))}</p></div></div>`;
  }catch(e){}
}

// Detail du match absent (identifiant inconnu, match termine ou plus publie) :
// plus d'impasse « Match introuvable ». Bloc de reprise : message court, le
// match gratuit du jour (meme source que l'accueil, lib/free-match.js, lu dans
// data-home.json ; seulement s'il existe et n'est pas ce match-ci) et les
// matchs du jour (accueil de la version). Lien discret vers la competition
// quand la page statique en donne une. La page reste noindex (match.html).
// list : matchs de data-home.json (null si indisponible) ; id : identifiant demande.
function renderIntrouvable(list,id){
  const hub=document.querySelector('.match-facts a[href*="/leagues/"]');
  let offert=null;
  try{
    offert=Array.isArray(list)&&list.length&&window.IasharkFreeMatch
      ?IasharkFreeMatch.pickFreeMatchId(list,null,(window.IASHARK_MARKET&&window.IASHARK_MARKET.code)||null):null;
  }catch(e){offert=null;}
  if(offert!=null&&(!/^\d+$/.test(String(offert))||String(offert)===String(id)))offert=null;
  // Page statique : le resume SEO garde le seul h1.
  const niveau=resumeSeoStatique()?'h2':'h1';
  root.innerHTML=`<section class="match-recovery" aria-labelledby="recoveryTitle">
    <span class="mrec-icon" aria-hidden="true">${cardIcon('calendar')}</span>
    <${niveau} id="recoveryTitle" class="mrec-title">${esc(t('match_page.recovery_title','Ce match n’est plus disponible'))}</${niveau}>
    <p class="mrec-text">${esc(t('match_page.recovery_text','Il est terminé, ou ce lien n’est plus valide.'))}</p>
    <div class="mrec-actions">
      ${offert!=null?`<a class="mrec-btn is-primary" href="${esc(lien('match.html?id='+offert))}">${esc(t('match_page.recovery_free_cta','Voir le match gratuit du jour'))}</a>`:''}
      <a class="mrec-btn${offert!=null?'':' is-primary'}" href="${esc(lien(''))}">${esc(t('match_page.recovery_home_cta','Voir les matchs du jour'))}</a>
    </div>
    ${hub?`<a class="mrec-link" href="${esc(hub.getAttribute('href'))}">${esc(t('match_page.league_matches_link','Voir les matchs de la compétition'))}</a>`:''}
  </section>`;
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
    const demoMode=typeof IASHARK_DEMO!=='undefined'&&IASHARK_DEMO&&typeof PRELOADED_MATCH!=='undefined';
    let raw=typeof PRELOADED_MATCH!=='undefined'?PRELOADED_MATCH:null;
    // match.html ouvert sans ?id= (ou id vide/"null", ex. /fr/match) : aucune
    // requete vers /match/null.json ni match-data, et plus d'ecran d'erreur :
    // retour immediat a l'accueil de la version (sans entree d'historique).
    const idBrut=typeof FIXED_MATCH_ID!=='undefined'&&FIXED_MATCH_ID!=null?String(FIXED_MATCH_ID):new URLSearchParams(location.search).get('id');
    const id=idBrut&&!/^(null|undefined)$/.test(idBrut.trim())?idBrut.trim():(raw&&raw.id!=null?String(raw.id):null);
    if(!demoMode&&!id){location.replace(lien(''));return;}
    // Sections V4 et composant de paiement : charges en parallele des donnees.
    const modules=Promise.all([modulesV4(),moduleOffre()]);
    // Donnees PUBLIQUES (liste legere + detail du match) demandees tout de
    // suite, en parallele du dictionnaire et sans attendre supabase-js (charge
    // en defer) : l'en-tete s'affiche des que les deux sont la (element LCP,
    // audit perf 15/09/2026). Aucun champ premium ici.
    const lire=u=>fetch(u,{cache:'no-cache'}).then(r=>r.ok?r.json():null).catch(()=>null);
    const fusion=(complet,partiel)=>{const m=Object.assign({},complet,partiel||{});delete m.detail_omitted;return m;};
    const publiques=demoMode||!id?null:Promise.all([
      lire('/data-home.json'),
      raw&&!raw.detail_omitted?null:lire('/match/'+encodeURIComponent(id)+'.json')
    ]);
    // Dictionnaire charge AVANT tout rendu : jamais un flash en francais.
    if(window.I18N&&window.I18N.init){ try{ await window.I18N.init(); }catch(e){} }
    traduireShellSeo();
    // Marche sans ressource d'aide au jeu confirmee : ligne "Aide :" masquee.
    if(window.IASHARK_MARKET&&!window.IASHARK_MARKET.helpline)document.querySelectorAll('[data-helpline-row]').forEach(el=>{el.hidden=true;});
    // MODE DEMO (exemple-analyse.html) : analyse reelle figee dans le HTML.
    if(demoMode){
      await modules;
      render(PRELOADED_MATCH,{vuePro:true});
      return;
    }
    const [liste,detail]=await publiques;
    if(detail&&String(detail.id)===String(id))raw=fusion(detail,raw);
    // prob_band (niveau public high/good/moderate, jamais un chiffre) : porte par
    // match/<id>.json et PRELOADED_MATCH ; repli sur la liste d'accueil. Recopie
    // sur la version servie par match-data si elle ne l'a pas.
    const ligneListe=liste&&Array.isArray(liste.matchs)?liste.matchs.find(m=>m&&String(m.id)===String(id)):null;
    const bandePublique=bandeDe(raw)||bandeDe(ligneListe);
    const avecBande=m=>m&&bandePublique&&!bandeDe(m)?Object.assign({},m,{prob_band:bandePublique}):m;
    raw=avecBande(raw);
    if(raw&&!raw.detail_omitted)renderApercu(raw);
    // Session : app-client.js et supabase-js (defer) sont executes avant DOMContentLoaded.
    // BUG REEL (audit du 18/09/2026) : apres l'attente de data-home, readyState vaut
    // souvent deja 'interactive' alors que les scripts defer ne sont pas encore
    // executes -> window.IasharkApp absent -> un abonne Pro voyait le mur « Debloquer »
    // (et un compte gratuit le mur « compte gratuit » sur le match offert). On attend
    // donc IasharkApp lui-meme : DOMContentLoaded part APRES tous les scripts defer ;
    // 'load' couvre le cas ou DOMContentLoaded est deja passe.
    await new Promise(ok=>{
      if(window.IasharkApp||document.readyState==='complete'){ok();return;}
      document.addEventListener('DOMContentLoaded',ok,{once:true});
      window.addEventListener('load',ok,{once:true});
    });
    let list=null;
    let ctx={session:null,isPro:false};
    // Plan confirme par le SERVEUR (reponse match-data) : un plan lu cote client
    // ne suffit jamais a montrer la vue Pro.
    let serveurPro=null;
    if(window.IasharkApp){
      ctx=await window.IasharkApp.context();
      // On interroge match-data des qu'il peut avoir quelque chose a rendre :
      // pour un visiteur connecte (abonne, compte gratuit sur le match offert)
      // ET, depuis le 20/09/2026, pour TOUT LE MONDE sur un match deja termine,
      // dont l'analyse est ouverte. Sans session et sur un match a venir, la
      // requete serait inutile : elle ne renverrait rien de plus.
      // C'est ce qui permet a un visiteur venu de l'onglet « Hier » d'ouvrir un
      // match joue et de voir l'analyse qu'il portait : la preuve, sans compte.
      if(ctx.session||matchTermine(raw)){
        const result=await window.IasharkApp.supabase.functions.invoke('match-data',{body:{id:String(id)}});
        if(result.data&&!result.error){
          list=result.data.matchs||[];
          if(typeof result.data.isPro==='boolean')serveurPro=result.data.isPro;
          raw=avecBande(list.find(x=>String(x.id)===String(id))||raw);
        }
      }
    }
    // Sans session : liste legere data-home.json et detail match/<id>.json lus
    // plus haut (lib/public-data-split.js). cache:'no-cache' revalide (ETag).
    if(!list&&liste&&Array.isArray(liste.matchs))list=liste.matchs;
    // Plus AUCUN repli sur /data.json (~25 Mo, audit perf 15/09/2026) : sans
    // detail publie (match/<id>.json retire apres le match, ou identifiant
    // inconnu), la page le dit et propose le match gratuit et les matchs du jour.
    if(!raw||raw.detail_omitted){renderIntrouvable(liste&&Array.isArray(liste.matchs)?liste.matchs:null,id);return;}
    // Liste du jour indisponible : aucun match n'est suppose offert (mur Pro
    // pour un non-abonne), jamais l'inverse.
    list=list||[];
    const isFree=String(raw.id)===String(IasharkFreeMatch.pickFreeMatchId(list,null,(window.IASHARK_MARKET&&window.IASHARK_MARKET.code)||null));
    // MATCH TERMINE (20/09/2026, demande du proprietaire) : l'analyse d'un match
    // deja joue n'a plus aucune valeur de pari, elle devient la preuve du
    // travail et s'ouvre a tout le monde depuis l'onglet « Hier ». C'est le
    // SERVEUR qui decide ce qu'il envoie (match-data applique la meme regle) :
    // si la fonction n'a rien renvoye de premium, la page n'affichera rien de
    // plus, elle ne peut pas fabriquer une analyse.
    const termine=matchTermine(raw);
    const vuePro=!!ctx.isPro&&serveurPro!==false;
    await modules;
    if(isFree&&!ctx.session){renderAuthWall(raw);return;}
    if(!isFree&&!termine&&!vuePro){renderProWall(raw,ctx);return;}
    // Compte gratuit sur le match offert : lignes cadenas pour le Pro seulement
    // (sim_15min, stats_iashark) et panneau Marches flou. Match termine : aucun
    // panneau (plus rien a jouer).
    render(raw,{vuePro,verrouPro:!vuePro&&isFree&&!termine,panneau:termine?false:undefined});
  }catch(e){
    root.innerHTML=`<div class="match-error"><b>${esc(e.message||t('match_page.generic_load_error','Erreur de chargement'))}</b><a href="${esc(lien(''))}">${esc(t('match_page.back_to_home','Retour à l\'accueil'))}</a></div>`;
  }
}
init();
})();
