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
  pin:'<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/>',
  calendar:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M10 14.5l4 3M14 14.5l-4 3"/>'
};
const cardIcon=key=>ICONS[key]?`<svg viewBox="0 0 24 24" class="card-icon" aria-hidden="true" focusable="false">${ICONS[key]}</svg>`:'';
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

// Bouton + panneau repliable (grid-template-rows 0fr -> 1fr ; ferme = inert).
function repliable(o){
  const id=uid('rep'),ouvert=!!o.open;
  return `<div class="rep${ouvert?' is-open':''}${o.cls?' '+o.cls:''}">
    <button type="button" class="rep-btn" aria-expanded="${ouvert}" aria-controls="${id}" data-label-open="${esc(o.labelOpen||o.label)}" data-label-closed="${esc(o.label)}"><span>${esc(ouvert?(o.labelOpen||o.label):o.label)}</span><i aria-hidden="true"></i></button>
    <div class="rep-panel" id="${id}"${ouvert?'':' inert'}><div class="rep-inner">${o.body}</div></div>
  </div>`;
}
// Carte repliable : le titre EST le bouton, une ligne de resume reste visible.
// o : { key, title, icon, summary (HTML deja echappe), body (HTML), open }
function fold(o){
  const id=uid('fold'),ouvert=!!o.open;
  return `<section class="card fold rep${ouvert?' is-open':''} reveal"${o.key?` data-fold="${esc(o.key)}"`:''}>
    <h3 class="fold-h"><button type="button" class="rep-btn fold-btn" aria-expanded="${ouvert}" aria-controls="${id}">${cardIcon(o.icon)}<span class="fold-t">${esc(o.title)}</span>${o.summary?`<span class="fold-s">${o.summary}</span>`:''}<i aria-hidden="true"></i></button></h3>
    <div class="rep-panel" id="${id}"${ouvert?'':' inert'}><div class="rep-inner">${o.body}</div></div>
  </section>`;
}
// Groupe de blocs sous un grand titre (Les stats du match / L'analyse IASHARK).
function groupe(o){
  return `<div class="grp">
    <div class="grp-head"><h2 class="grp-title">${esc(o.title)}${o.pill?`<span class="lock-pill">${cardIcon('lock')}${esc(o.pill)}</span>`:''}</h2>${o.sub?`<p class="grp-sub">${esc(o.sub)}</p>`:''}</div>
    <div class="grp-body">${o.body}</div>
  </div>`;
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
  return `<span class="band is-${b}"><span class="band-bars" aria-hidden="true">${[1,2,3].map(i=>`<i${i<=niveau?' class="on"':''}></i>`).join('')}</span><b>${esc(label)}</b></span>`;
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
// (tests/match-page-structure.test.js verifie que les deux listes sont
// identiques). prob_band, has_signal et no_signal restent : ils sont publics.
const CHAMPS_PREMIUM=["pari_rec","cote_rec","model_probability","markets_compared","market_id","marche","kelly","edge","verdict_shark","facteur_x","dropping_odds","player_markets","facteur_x_i18n","verdict_shark_i18n","conf","p1","pn","p2","po15","po25","btts","lambda_h","lambda_a","market_aware_p1","market_aware_pN","market_aware_p2","market_consensus_p1","market_consensus_pN","market_consensus_p2","mc_scores","scores","simulation_count","paris_safe","paris_risque","vbet","val","hot","risque","mise","pick_downgrade","odds_available","is_canonical_pick","reliability","model_agreement","crit_home","crit_away","elo_signal","analyse_card","analyse_card_i18n","conseil_public","conseil_public_i18n","contexte","contexte_i18n","scenario","scenario_i18n","scenario_15min","decision_factors","risk_principal","top_scorers"];
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
// config/markets.json#_legalFiles.methodology, sources legal/<dir>/ (les 9
// repertoires depuis le 19/09/2026) ; un repertoire inconnu renvoie vers
// la version anglaise.
const METHODOLOGY_DIRS=['fr','gb','za','en','mx','es','de','it','pt'];
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

function methodologyHref(){
  const dir=(window.I18N&&window.I18N.dir)||'';
  if(METHODOLOGY_DIRS.includes(dir))return '/'+dir+'/methodologie.html';
  return dir?'/en/methodologie.html':'/fr/methodologie.html';
}
function methodLink(){
  // Repertoire sans page Methodologie : le lien vise la version anglaise,
  // et le dit (audit du 16/09/2026).
  const dir=(window.I18N&&window.I18N.dir)||'';
  const anglais=!!dir&&!METHODOLOGY_DIRS.includes(dir);
  return `<p class="sig-method"><a href="${esc(methodologyHref())}"${anglais?' hreflang="en"':''}>${esc(t('match_page.sig_method_link','Comment ce chiffre est calculé : méthodologie'))}${anglais?esc(t('match_page.sig_method_in_english',' (en anglais)')):''}</a></p>`;
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
  const detail=repliable({
    label:t('match_page.sig2_details_show','Détail des chiffres'),labelOpen:t('match_page.sig2_details_hide','Masquer le détail'),cls:'sig2-detail',
    body:`${confMeter(r.confidence)}<dl class="sig-figures sig2-figures">
      <div><dt>${esc(t('match_page.sig2_model_exact','Notre estimation (précise)'))}</dt><dd>${pct(prob)}</dd></div>
      <div><dt>${esc(t('match_page.sig2_implied_exact','Probabilité selon la cote (implicite)'))}</dt><dd>${pct(implied)}</dd></div>
      <div><dt>${esc(t('match_page.sig2_edge_exact','Écart exact'))}</dt><dd class="sig-edge">${pts(edge)}</dd></div>
    </dl>`
  });
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
    ${risque||info?`<div class="sig2-meta">${risque}${info?`<p class="sig-rel-note">${esc(relLigne(info))}</p>`:''}</div>`:''}
    ${detail}
    ${methodLink()}
    <p class="sig-legal">${esc(t('match_page.sig_legal','18+ · Estimation statistique, pas une garantie. Jouez responsable.'))}</p>
  </section>`;
}

// ---------------------------------------------------------------------------
// PROBABILITES ET COTES (abonne / match offert) : deux barres par pari
// (« Notre estimation » / « Ce que dit la cote »), ecart dit en mots, bulle
// « ? ». Le pari conseille ouvre la liste, 4 lignes visibles, le reste replie.
// Donnees : lib/match-view-model.js#marketTable (marche absent = non
// disponible, jamais 0 %).
// ---------------------------------------------------------------------------
const GROUPES_MARCHES=[['result','Résultat'],['goals','Buts'],['stats','Tirs, corners, cartons'],['other','Autres marchés']];
function marketsCard(vm){
  const rows=vm.model.marketTable||[];
  if(rows.length<2)return '';
  const ordre=rows.filter(r=>r.recommended).map(r=>({r,g:'signal'}));
  GROUPES_MARCHES.forEach(([g])=>rows.filter(r=>!r.recommended&&r.group===g).forEach(r=>ordre.push({r,g})));
  const nomGroupe=g=>{const x=GROUPES_MARCHES.find(y=>y[0]===g);return x?t('match_page.markets_group_'+g,x[1]):'';};
  const ligne=({r})=>{
    const e=marcheValide(r.market)===null?null:n(r.edge),c=n(r.odds);
    const tags=`${r.recommended?`<span class="mk-tag mk-tag--signal">${esc(t('match_page.proba_tag_signal','Pari conseillé'))}</span>`:''}${!r.recommended&&e!==null&&e>=3?`<span class="mk-tag mk-tag--value">${esc(t('match_page.proba_tag_favorable','Écart favorable'))}</span>`:''}`;
    return `<li class="pr-row${r.recommended?' is-signal':''}">
      <div class="pr-head"><span class="pr-label">${esc(libelleLigne(vm,r))}</span>${tags}${c!==null?`<span class="pr-odds">${esc(t('match_page.proba_odds_short','cote'))} <b>${odds(c)}</b></span>`:''}</div>
      ${duoBars({model:r.model,market:r.market,odds:c,edge:r.edge,kind:c!==null?'odds':'consensus',compact:true})}
    </li>`;
  };
  const liste=(part,avant)=>{let g0=avant;return part.map(x=>{const h=x.g!=='signal'&&x.g!==g0?`<li class="pr-group"><h4>${esc(nomGroupe(x.g))}</h4></li>`:'';g0=x.g;return h+ligne(x);}).join('');};
  const tete=ordre.slice(0,4),reste=ordre.slice(4);
  return `<div class="pr-legend tip-host"><span class="pr-key is-model" aria-hidden="true"></span>${esc(t('match_page.proba_model_label','Notre estimation'))}<span class="pr-key is-market" aria-hidden="true"></span>${esc(t('match_page.proba_market_label','Ce que dit la cote'))}${aide(texteAideCote(),labelAideCote())}</div>
    <ul class="pr-list">${liste(tete,null)}</ul>
    ${reste.length?repliable({label:tf('match_page.proba_more','Voir les {n} autres paris',{n:reste.length}),labelOpen:t('match_page.proba_less','Masquer les autres paris'),body:`<ul class="pr-list">${liste(reste,tete.length?tete[tete.length-1].g:null)}</ul>`}):''}
    <p class="mk-note">${esc(t('match_page.proba_note','« Ce que dit la cote » : probabilité tirée des cotes, marge du bookmaker retirée quand les deux issues sont cotées. Écart en points de pourcentage. Estimation statistique, pas une garantie.'))}</p>`;
}

// ---------------------------------------------------------------------------
// LES STATS DU MATCH : ouvertes a tous, donnees brutes publiques uniquement
// (forme, classement, confrontations directes, comparatif, compositions
// publiees). Chaque bloc est repliable avec une ligne de resume.
// ---------------------------------------------------------------------------
function formeFold(vm){
  const f=vm.form||{},i=vm.identity;
  const ligne=(team,rows)=>rows&&rows.length?`<div class="fh-row"><span class="fh-team">${logoEquipe(team.logo,team.name)}<span>${esc(team.name)}</span></span>${formStrip(rows)}<span class="fh-scores" aria-hidden="true">${rows.slice().reverse().map(r=>`<i>${esc(r.score||'')}</i>`).join('')}</span></div>`:'';
  const corps=ligne(i.home,f.home)+ligne(i.away,f.away);
  if(!corps)return '';
  const bilan=rows=>['W','D','L'].map(k=>`${rows.filter(r=>r.result===k).length} ${lettre(k)}`).join(' · ');
  const resume=[[i.home,f.home],[i.away,f.away]].filter(x=>x[1]&&x[1].length).map(([tm,rows])=>`<b>${esc(tm.name)}</b> ${esc(bilan(rows))}`).join(' — ');
  return fold({key:'forme',title:t('match_page.stats_form_title','Forme récente'),icon:'trend',summary:resume,body:corps,open:true});
}
function classementFold(vm){
  const c=(vm._raw||{}).classement;
  if(!c||typeof c!=='object')return '';
  const i=vm.identity;
  const ligneDe=(team,cote)=>{
    const st=Array.isArray(c.standings)?c.standings.find(s=>s&&team.id!=null&&Number(s.team_id)===Number(team.id)):null;
    return st||(c[cote]&&typeof c[cote]==='object'?c[cote]:null);
  };
  const lignes=[[i.home,ligneDe(i.home,'home')],[i.away,ligneDe(i.away,'away')]].filter(x=>x[1]);
  if(!lignes.length)return '';
  lignes.sort((a,b)=>(n(a[1].rank)===null?99:n(a[1].rank))-(n(b[1].rank)===null?99:n(b[1].rank)));
  const v=x=>n(x)===null?'—':esc(n(x));
  const diff=x=>n(x)===null?'—':`${x>0?'+':x<0?'−':''}${Math.abs(n(x))}`;
  const COLS=[['played','J'],['won','V'],['drawn','N'],['lost','D']];
  const resume=lignes.filter(x=>n(x[1].rank)!==null).map(([tm,s])=>`<b>${esc(tm.name)}</b> ${esc(rangOrdinal(s.rank))}`).join(' · ');
  const corps=`<div class="st-scroll"><table class="st-table">
      <thead><tr><th scope="col">${esc(t('match_page.standings_col_rank','#'))}</th><th scope="col" class="st-team">${esc(t('match_page.standings_col_team','Équipe'))}</th>${COLS.map(([k,fb])=>`<th scope="col">${esc(t('match_page.standings_col_'+k,fb))}</th>`).join('')}<th scope="col">${esc(t('match_page.standings_col_gd','Diff.'))}</th><th scope="col">${esc(t('match_page.standings_col_pts','Pts'))}</th></tr></thead>
      <tbody>${lignes.map(([tm,s])=>`<tr><td>${v(s.rank)}</td><th scope="row" class="st-team"><span>${logoEquipe(tm.logo,tm.name)}${esc(tm.name)}</span></th>${COLS.map(([k])=>`<td>${v(s[k])}</td>`).join('')}<td>${diff(s.gd)}</td><td class="st-pts">${v(s.pts)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${c.league_name?`<p class="st-note">${esc(c.league_name)} · ${esc(t('match_page.standings_note','classement actuel'))}</p>`:''}`;
  return fold({key:'classement',title:t('match_page.standings_title','Classement'),icon:'table',summary:resume,body:corps,open:true});
}
function h2hFold(vm){
  const h=vm.h2h||[],i=vm.identity;
  if(!h.length)return '';
  const dom=h.filter(r=>r.winner==='1').length,nul=h.filter(r=>r.winner==='N').length,ext=h.filter(r=>r.winner==='2').length,tot=dom+nul+ext||1;
  const mois=d=>{const x=new Date(String(d)+'T12:00:00Z');return isNaN(x)?String(d):x.toLocaleDateString(localeTag(),{month:'short',year:'numeric',timeZone:'UTC'});};
  const resume=esc(tf('match_page.h2h_summary','{home} {homeWins} V · {draws} N · {away} {awayWins} V',{home:i.home.name,away:i.away.name,homeWins:dom,draws:nul,awayWins:ext}));
  const corps=`<div class="h2h">
    <div class="h2h-bar" aria-hidden="true"><i class="h" style="width:${(dom/tot*100).toFixed(1)}%"></i><i class="d" style="width:${(nul/tot*100).toFixed(1)}%"></i><i class="a" style="width:${(ext/tot*100).toFixed(1)}%"></i></div>
    <ul class="h2h-list">${h.slice(0,5).map(r=>`<li><time>${esc(mois(r.date))}</time><span class="h2h-m"><span class="${r.winner==='1'&&r.home===i.home.name||r.winner==='2'&&r.home===i.away.name?'w':''}">${esc(r.home)}</span><b>${esc(r.score)}</b><span class="${r.winner==='2'&&r.away===i.away.name||r.winner==='1'&&r.away===i.home.name?'w':''}">${esc(r.away)}</span></span></li>`).join('')}</ul>
  </div>`;
  return fold({key:'h2h',title:t('match_page.h2h_title','Confrontations directes'),icon:'scale',summary:resume,body:corps});
}
function comparatifFold(vm){
  const c=vm.comparison;
  if(!c||!c.rows.length)return '';
  const cmp=comparison(vm);
  return fold({key:'comparatif',title:t('match_page.comparison_title','Comparatif des deux équipes'),icon:'compare',summary:cmp.conclusion,body:cmp.table});
}
// Compositions : champ public lineups (/fixtures/lineups), rendu seulement
// quand un onze existe. Jamais une composition devinee.
const POSTES_COURTS={G:['match_page.lineup_pos_g','G'],D:['match_page.lineup_pos_d','D'],M:['match_page.lineup_pos_m','M'],F:['match_page.lineup_pos_f','A']};
function compoFold(vm){
  const l=vm.players&&vm.players.lineups,i=vm.identity;
  if(!l)return '';
  const joueur=p=>p&&p.player?p.player:p||{};
  const colonne=(team,x)=>{
    if(!x||!Array.isArray(x.startXI)||!x.startXI.length)return '';
    const subs=Array.isArray(x.substitutes)?x.substitutes.map(joueur).filter(p=>p.name):[];
    return `<div class="lu-col">
      <h4>${logoEquipe(team.logo,team.name)}<span>${esc(team.name)}</span>${x.formation?`<em>${esc(x.formation)}</em>`:''}</h4>
      <ol class="lu-list">${x.startXI.map(joueur).map(p=>{const pos=POSTES_COURTS[p.pos];return `<li><span class="lu-pos">${esc(pos?t(pos[0],pos[1]):(p.pos||'·'))}</span>${esc(p.name||'')}</li>`;}).join('')}</ol>
      ${x.coach?`<p class="lu-coach">${esc(t('match_page.lineup_coach','Entraîneur'))}${esc(t('match_page.label_colon',' :'))} ${esc(x.coach)}</p>`:''}
      ${subs.length?`<p class="lu-subs"><b>${esc(t('match_page.lineup_subs','Remplaçants'))}</b> ${subs.map(p=>esc(p.name)).join(', ')}</p>`:''}
    </div>`;
  };
  const cols=colonne(i.home,l.home)+colonne(i.away,l.away);
  if(!cols)return '';
  const forms=[l.home&&l.home.formation,l.away&&l.away.formation].filter(Boolean).map(esc).join(' · ');
  return fold({key:'compos',title:t('match_page.lineups_title','Compositions'),icon:'pin',summary:`${esc(t('match_page.lineups_official','Compositions officielles'))}${forms?' · '+forms:''}`,body:`<div class="lu-grid">${cols}</div>`});
}
function statsBlocs(vm){
  return [formeFold(vm),classementFold(vm),h2hFold(vm),comparatifFold(vm),compoFold(vm)].join('');
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

function threatsCard(vm,opts){
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
    // Titularisations sur les derniers matchs de l'equipe : ce qui fait de lui
    // un titulaire probable (compositions pas encore connues).
    const titu=n(p.startsLast)!==null&&n(p.teamMatchesLast)>0?[`${p.startsLast}/${p.teamMatchesLast}`,t('match_page.stat_recent_starts','Titularisations récentes')]:null;
    const stats=[
      titu,
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
        ${img(p.photo,'',54,54)}
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
  corps+=`<p class="pm-note">${esc(t('match_page.players_note','Estimé avant les compositions officielles : seuls les titulaires probables (titularisations récentes) sont mis en avant, avec leurs tirs cadrés et buts récents et les buts attendus de leur équipe dans ce match. Aucune cote de bookmaker.'))}</p>`;
  return card(t('match_page.player_markets_title','Marchés joueurs'),corps,'threats-card','target2',opts);
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
function outputsCard(vm,opts){
  const x=vm.model.expectedGoals,s=vm.model.scores,i=vm.identity;
  // Seules les colonnes qui ont du contenu ; ce qui manque est dit en une
  // ligne discrete. Si TOUT manque, la carte disparait.
  const cols=[],manquant=[];
  if(x){
    cols.push(`<div class="outputs-col outputs-xg"><small>${esc(t('match_page.stat_expected_goals','Buts attendus'))} (xG)</small><div class="xg-row">${img(i.home.logo,'',26,26)}<b>${fmt(x.home)}</b><span>${esc(i.home.name)} – ${esc(i.away.name)}</span><b>${fmt(x.away)}</b>${img(i.away.logo,'',26,26)}</div></div>`);
  } else manquant.push(t('match_page.xg_unavailable','xG indisponibles'));
  if(s.length){
    const ml=window.IasharkMarketLabels;
    const maxP=Math.max.apply(null,s.map(sc=>Number(sc.probability)||0))||1;
    cols.push(`<div class="outputs-col"><small>${esc(t('match_page.scores_title','Scores les plus probables'))}</small><div class="score-bars">${s.map(sc=>`<div class="score-bar"><b>${esc(ml&&ml.exactScoreLabel?ml.exactScoreLabel(sc.score):sc.score)}</b><i><span style="width:${clamp(Number(sc.probability)/maxP*100)}%"></span></i><small>${pct(sc.probability,0)}</small></div>`).join('')}</div></div>`);
  } else manquant.push(t('match_page.scores_unavailable','Scores probables indisponibles'));
  if(!cols.length)return '';
  return card(t('match_page.outputs_title','Ce que dit le modèle'),
    `<div class="outputs${cols.length===1?' outputs-1col':' outputs-2col'}">${cols.join('')}</div>`
    +(manquant.length?`<p class="outputs-missing">${esc(manquant.join(' · '))}.</p>`:''),'','chart',opts);
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

// Renvoie { table (HTML), conclusion (HTML, ligne de resume du bloc repliable) }.
function comparison(vm){
  const c=vm.comparison;
  if(!c||!c.rows.length)return {table:empty(t('match_page.comparison_unavailable','Statistiques comparatives indisponibles.')),conclusion:''};
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
  const table=`<div class="cmp-scroll"><table class="cmp-table">
      <thead><tr>
        <th scope="col">${esc(t('match_page.comparison_table_header','Par match'))}</th>
        <th scope="col"><span class="cmp-eq">${logoEquipe(vm.identity.home.logo,dom)}${esc(dom)}</span></th>
        <th scope="col"><span class="cmp-eq">${logoEquipe(vm.identity.away.logo,ext)}${esc(ext)}</span></th>
        <th scope="col">${esc(t('match_page.comparison_gap_header','Écart'))}</th>
      </tr></thead>
      <tbody>${lignes.join('')}</tbody>
    </table></div>
    <p class="cmp-note">${esc(note)} ${esc(t('match_page.comparison_note_disclaimer',"Hors-jeu et arrêts sont donnés sans verdict : plus d'arrêts signifie surtout plus de tirs subis."))}</p>`;
  return {table,conclusion};
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
  // Periode reelle : les derniers matchs de chaque equipe dans la competition
  // (compteur du pipeline), jamais « cette saison » (18/09/2026 : la saison
  // venait de commencer, les buts venaient aussi de la saison precedente).
  const gh=g.games&&g.games.home,ga=g.games&&g.games.away;
  const periode=(gh>0&&ga>0)
    ?(gh===ga?tf('match_page.scenario_source_games_same',' lors de leurs {n} derniers matchs.',{n:gh})
      :tf('match_page.scenario_source_games_each',' lors de leurs {home} et {away} derniers matchs.',{home:gh,away:ga}))
      +t('match_page.scenario_source_note',' Fréquence observée, pas une prévision pour celui-ci.')
    :t('match_page.scenario_source_suffix',' sur leurs derniers matchs. Fréquence observée, pas une prévision pour celui-ci.');
  return `${scenarioChart(slots)}
    <div class="scenario-insight"><b aria-hidden="true">!</b><span>${esc(t('match_page.scenario_peak_prefix','Tranche la plus fournie : '))}<b>${esc(g.peak.label)}${esc(t('match_page.scenario_peak_middle',' min'))}</b> — ${Math.round(g.peak.share)}${esc(t('match_page.scenario_peak_suffix',' % des buts des deux équipes y sont tombés.'))}</span></div>
    <p class="scenario-source">${esc(t('match_page.scenario_source_prefix','Sur '))}${g.totalGoals}${esc(t('match_page.scenario_source_middle',' buts marqués par '))}${esc(vm.identity.home.name)}${esc(t('match_page.scenario_source_and',' et '))}${esc(vm.identity.away.name)}${esc(periode)}</p>`;
}

// QUESTIONS FREQUENTES — en dernier. Faits publics (quand/ou, forme,
// face-a-face) et statistiques brutes (vm.editorial.exclusiveFacts : buts avant
// la mi-temps, fin de match, cartons, occasions, passes) : reponses ouvertes.
// Reponses qui viennent du modele (pronostic, 15 premieres minutes, chances de
// chaque equipe, sur quoi repose l'analyse) : fermees au visiteur
// (o.locked) - leur texte n'est meme pas construit.
// o : { locked, href, lockText, linkText, pill }
function faqCard(vm,o){
  o=o||{};
  const raw=vm._raw||{},etat=etatAnalyse(raw);
  const id=vm.identity,f=vm.editorial.exclusiveFacts||{},g=vm.editorial.goalTiming;
  const dom=id.home.name,ext=id.away.name;
  const plusGrand=p=>p.home>=p.away?dom:ext,plusPetit=p=>p.home<=p.away?dom:ext;
  const faits=[],stats=[],modele=[],fin=[];
  // 1. Faits publics.
  const dh=dateHeure(vm),lieu=vm.conditions&&vm.conditions.venue;
  if(dh.date&&dh.time)faits.push([tf('match_page.faq_q_when','Quand et où se joue {home} – {away} ?',{home:dom,away:ext}),
    tf('match_page.faq_when_answer','Coup d’envoi le {date} à {time} (heure locale).',{date:esc(dh.date),time:esc(dh.time)})+(lieu?' '+tf('match_page.faq_when_venue','Stade : {venue}.',{venue:esc(lieu)}):'')]);
  const fm=vm.form||{};
  const bilan=rows=>({w:rows.filter(r=>r.result==='W').length,d:rows.filter(r=>r.result==='D').length,l:rows.filter(r=>r.result==='L').length,n:rows.length});
  if(fm.home&&fm.home.length&&fm.away&&fm.away.length){
    const a=bilan(fm.home),b=bilan(fm.away);
    faits.push([t('match_page.faq_q_form','Quelle est la forme récente des deux équipes ?'),
      tf('match_page.faq_form_answer','{home} : {hw} V · {hd} N · {hl} D sur ses {hn} derniers matchs. {away} : {aw} V · {ad} N · {al} D sur ses {an} derniers matchs.',{home:esc(dom),away:esc(ext),hw:a.w,hd:a.d,hl:a.l,hn:a.n,aw:b.w,ad:b.d,al:b.l,an:b.n})]);
  }
  const h=vm.h2h||[];
  if(h.length){
    const hw=h.filter(r=>r.winner==='1').length,dr=h.filter(r=>r.winner==='N').length,aw=h.filter(r=>r.winner==='2').length,der=h[0];
    faits.push([t('match_page.faq_q_h2h','Qui a gagné les derniers face-à-face ?'),
      tf('match_page.faq_h2h_answer','Sur les {n} dernières confrontations : {home} {hw} V · {draws} N · {away} {aw} V. Dernière rencontre : {lastHome} {lastScore} {lastAway}.',{n:h.length,home:esc(dom),away:esc(ext),hw,draws:dr,aw,lastHome:esc(der.home),lastScore:esc(der.score),lastAway:esc(der.away)})]);
  }
  // 2. Statistiques brutes des deux equipes.
  if(g&&g.slots.length>=6){
    const totD=g.slots.reduce((s,x)=>s+x.home,0),totE=g.slots.reduce((s,x)=>s+x.away,0);
    if(totD>0&&totE>0){
      const pD=Math.round(g.slots.slice(0,3).reduce((s,x)=>s+x.home,0)/totD*100),pE=Math.round(g.slots.slice(0,3).reduce((s,x)=>s+x.away,0)/totE*100);
      const verdict=Math.abs(pD-pE)<3?t('match_page.faq_early_verdict_equal','Les deux entrent dans leurs matchs au même rythme.'):tf('match_page.faq_early_verdict_team','{team} entre donc plus vite dans ses matchs.',{team:esc(pD>pE?dom:ext)});
      stats.push([t('match_page.faq_q_early','Laquelle des deux marque le plus tôt ?'),tf('match_page.faq_early_answer_plain','{home} inscrit {homePct} % de ses buts avant la mi-temps, {away} {awayPct} %. {verdict}',{home:esc(dom),away:esc(ext),homePct:pD,awayPct:pE,verdict})]);
    }
  }
  if(f.encaisseFin){
    const verdictFin=Math.abs(f.encaisseFin.home-f.encaisseFin.away)<4?t('match_page.faq_late_verdict_equal','Les deux tiennent la fin de match de la même façon.'):tf('match_page.faq_late_verdict_team','{team} est la plus exposée sur la fin, ce qui compte pour un pari qui se joue au score final.',{team:esc(plusGrand(f.encaisseFin))});
    stats.push([t('match_page.faq_q_late','Une des deux craque-t-elle en fin de match ?'),tf('match_page.faq_late_answer','{home} encaisse {homePct} % de ses buts sur la dernière demi-heure, {away} {awayPct} %. {verdict}',{home:esc(dom),away:esc(ext),homePct:f.encaisseFin.home,awayPct:f.encaisseFin.away,verdict:verdictFin})]);
  }
  if(f.cartons){
    const rugueux=Math.abs(f.cartons.home-f.cartons.away)<0.3?null:plusGrand(f.cartons);
    const nbRouges=f.rouges?f.rouges.home+f.rouges.away:0;
    const rouges=nbRouges>0?(nbRouges>1?tf('match_page.faq_cards_red_other','Sur la période suivie, {n} cartons rouges au total.',{n:nbRouges}):tf('match_page.faq_cards_red_one','Sur la période suivie, {n} carton rouge au total.',{n:nbRouges})):'';
    const verdict=rugueux?tf('match_page.faq_cards_verdict_team','{team} est la plus sanctionnée des deux.',{team:esc(rugueux)}):t('match_page.faq_cards_verdict_equal','Les deux sont sanctionnées au même rythme.');
    stats.push([t('match_page.faq_q_cards','Combien de cartons dans un match de ces équipes ?'),tf('match_page.faq_cards_answer','{home} en prend {homeCards} par match et {away} {awayCards}. {verdict}',{home:esc(dom),away:esc(ext),homeCards:fmt(f.cartons.home),awayCards:fmt(f.cartons.away),verdict:verdict+(rouges?' '+rouges:'')})]);
  }
  if(f.xg&&f.xga){
    stats.push([t('match_page.faq_q_chances','Ces équipes se créent-elles beaucoup d’occasions ?'),tf('match_page.faq_chances_answer','Sur la saison, {home} génère {homeXg} buts attendus par match et en concède {homeXga}&nbsp;; {away} {awayXg} et {awayXga}. {best} se procure le plus d’occasions, {solid} en concède le moins.',{home:esc(dom),away:esc(ext),homeXg:fmt(f.xg.home),homeXga:fmt(f.xga.home),awayXg:fmt(f.xg.away),awayXga:fmt(f.xga.away),best:esc(plusGrand(f.xg)),solid:esc(plusPetit(f.xga))})]);
  }
  if(f.passes&&Math.abs(f.passes.home-f.passes.away)>=2){
    stats.push([t('match_page.faq_q_passing','Laquelle joue le plus proprement ?'),tf('match_page.faq_passing_answer','{team} réussit {best} % de ses passes, contre {other} % en face. Une différence de cet ordre se traduit souvent par plus de possession et moins de contres subis.',{team:esc(plusGrand(f.passes)),best:fmt(Math.max(f.passes.home,f.passes.away),0),other:fmt(Math.min(f.passes.home,f.passes.away),0)})]);
  }
  // 3. Reponses du modele. Vue abonne seulement : depuis le 19/09/2026 le
  // visiteur ne voit plus la FAQ (panneau seul, renderVisitor).
  {
    const r=vm.model.recommendation,pr=vm.model.probabilities;
    if(r||etat==='none')modele.push([t('match_page.faq_q_pick','Quel est le pronostic IASHARK pour ce match ?'),r
      ?tf('match_page.faq_pick_answer','Pari conseillé : {market}, cote {odds}, probabilité estimée {prob}. Estimation statistique, pas une garantie.',{market:esc(marcheFr(vm,r.market)),odds:esc(odds(vm.model.recommendedOdds)),prob:esc(pct(r.probability,0))})
      :esc(t('match_page.faq_pick_none','Le modèle n’a retenu aucun pari sur ce match.'))]);
    if(g&&g.slots.length&&g.totalGoals)modele.push([t('match_page.faq_q_first15','Que peut-il se passer dans les 15 premières minutes ?'),
      tf('match_page.faq_first15_answer','Sur les matchs de la saison de ces deux équipes, {share} % des buts sont tombés dans le premier quart d’heure ({n} sur {total}). Fréquence observée, pas une prévision.',{share:Math.round(g.slots[0].share),n:g.slots[0].home+g.slots[0].away,total:g.totalGoals})]);
    if(pr)modele.push([t('match_page.faq_q_outcomes','Quelles chances le modèle donne-t-il à chaque équipe ?'),
      tf('match_page.faq_outcomes_answer','Victoire {home} : {p1} · match nul : {pn} · victoire {away} : {p2}. Estimation statistique, pas une garantie.',{home:esc(dom),away:esc(ext),p1:esc(pct(pr.home,0)),pn:esc(pct(pr.draw,0)),p2:esc(pct(pr.away,0))})]);
    const sources=Array.isArray(vm.model.sources)?vm.model.sources.filter(Boolean):[];
    const sims=n(vm.model.simulationCount),qualite=n(vm.model.quality);
    if(sims!==null||sources.length||qualite!==null){
      const bits=[];
      if(sims!==null)bits.push(tf('match_page.faq_basis_sims','{n} simulations de Monte-Carlo',{n:sims.toLocaleString(localeTag())}));
      if(sources.length)bits.push(tf('match_page.faq_basis_sources','les données {sources}',{sources:sources.map(x=>esc(libelleSource(String(x)))).join(', ')}));
      if(qualite!==null)bits.push(tf('match_page.faq_basis_quality','un score de qualité des données de {score}/100',{score:fmt(qualite)}));
      fin.push([t('match_page.faq_q_basis','Sur quoi repose cette analyse ?'),tf('match_page.faq_basis_answer','L’analyse s’appuie sur {bits}. Les probabilités décrivent une fréquence attendue sur un grand nombre de matchs semblables, jamais une certitude sur celui-ci.',{bits:bits.join(', ')})]);
    }
  }
  const toutes=[...faits.map(x=>[...x,false]),...modele.map(x=>[...x,true]),...stats.map(x=>[...x,false]),...fin.map(x=>[...x,true])];
  if(toutes.length<2)return '';
  return card(t('match_page.faq_section_title','Questions fréquentes'),
    `<div class="faq-list">${toutes.map(([q,a,ia])=>`<details${ia?' class="faq-ia"':''}><summary><span>${esc(q)}</span></summary><p>${a}</p></details>`).join('')}</div>`,
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

// ---------------------------------------------------------------------------
// SOMMAIRE COLLANT (Avis IASHARK · Stats · Analyse · Questions), BARRE
// D'APPEL A L'ACTION MOBILE (visiteur) ET INTERACTIONS (repliables, bulles).
// ---------------------------------------------------------------------------
const NAV=[
  {key:'avis',secs:['avis'],label:['match_page.nav_avis','Avis IASHARK']},
  {key:'stats',secs:['stats','rappel'],label:['match_page.nav_stats','Stats']},
  {key:'analyse',secs:['analyse'],label:['match_page.nav_analysis','Analyse']},
  {key:'questions',secs:['questions'],label:['match_page.nav_questions','Questions']}
];
function navChips(presents,verrouilles,apres){
  const items=NAV.map(x=>Object.assign({},x,{cible:x.secs.find(s=>presents.includes(s))})).filter(x=>x.cible);
  if(items.length<2)return '';
  return `<nav class="mnav" id="matchNav" aria-label="${esc(t('match_page.nav_aria','Sommaire du match'))}">
    <ul class="mnav-chips">${items.map(x=>{
      const lock=x.secs.filter(s=>presents.includes(s)).every(s=>verrouilles.includes(s));
      return `<li><a class="mnav-chip" href="#sec-${x.cible}" data-nav="${x.key}">${esc(t(x.label[0],x.label[1]))}${lock?cardIcon('lock'):''}</a></li>`;
    }).join('')}</ul>
    ${apres||''}
  </nav>`;
}
let navSurDefilement=null,navSurRedim=null;
function bindNav(){
  if(navSurDefilement)window.removeEventListener('scroll',navSurDefilement);
  if(navSurRedim)window.removeEventListener('resize',navSurRedim);
  navSurDefilement=navSurRedim=null;
  const nav=root.querySelector('#matchNav');
  if(!nav)return;
  const bar=nav.querySelector('.mnav-chips'),chips=[...nav.querySelectorAll('.mnav-chip')];
  const secVersPuce={};
  NAV.forEach(x=>x.secs.forEach(s=>{secVersPuce[s]=x.key;}));
  const secs=[...root.querySelectorAll('.sec[data-sec]')];
  let actif,attente=false;
  const maj=()=>{
    attente=false;
    const seuil=Math.max(nav.getBoundingClientRect().bottom+96,window.innerHeight*0.4);
    let cur=null;
    for(const s of secs){if(s.getBoundingClientRect().top<=seuil)cur=s;else break;}
    if(secs.length&&window.innerHeight+window.scrollY>=document.documentElement.scrollHeight-4)cur=secs[secs.length-1];
    const key=cur?secVersPuce[cur.dataset.sec]:null;
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

// Assemble la page : sections [cle, html, verrouillee] ; seules les sections
// non vides sont rendues (sections.filter(x=>x&&x[1])).
function paint(vm,sections,apresNav,apresPage,opts){
  const S=sections.filter(x=>x&&x[1]);
  const presents=S.map(x=>x[0]),verrouilles=S.filter(x=>x[2]).map(x=>x[0]);
  const corps=S.map(([k,html,lock])=>`<div class="sec" id="sec-${k}" data-sec="${k}"${lock?' data-locked="true"':''}>${html}</div>`).join('');
  document.body.classList.toggle('has-cta-bar',!!apresPage);
  root.innerHTML=`<div class="page">${hero(vm,opts)}${navChips(presents,verrouilles,apresNav)}<div class="secs">${corps}</div></div>${apresPage||''}`;
  bindMotion();
  bindUi();
  bindNav();
  bindSticky();
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

// L'ANALYSE IASHARK (abonne / match offert) : 4 blocs repliables, dans l'ordre
// scenario (15 minutes), ce que dit le modele, probabilites et cotes, marches
// joueurs.
function analyseAbonne(vm){
  const blocs=[
    fold({key:'scenario',title:t('match_page.scenario_title','Scénario probable du match'),icon:'chart',summary:esc(t('match_page.scenario_sub','Quand les buts tombent, par tranche de 15 minutes')),body:scenarioCard(vm),open:true}),
    outputsCard(vm,{fold:{key:'modele',summary:esc(t('match_page.outputs_sub','Buts attendus et scores les plus probables')),open:true}})
  ];
  const probas=marketsCard(vm);
  if(probas)blocs.push(fold({key:'probas',title:t('match_page.markets_title','Probabilités et cotes'),icon:'table',summary:esc(t('match_page.proba_sub','Nos chances face à la cote, pari par pari')),body:probas,open:true}));
  blocs.push(threatsCard(vm,{fold:{key:'joueurs',summary:esc(t('match_page.players_sub','Les buteurs les plus probables'))}}));
  return blocs.filter(Boolean).join('');
}

function render(raw){
  const vm=viewModel(raw);
  // ORDRE DE LECTURE (16/09/2026, maquette V8 validee par le proprietaire) :
  // en-tete, l'avis IASHARK, les stats du match (ouvertes), l'analyse
  // IASHARK, les questions frequentes a la fin. Section Absences retiree.
  const stats=statsBlocs(vm),analyse=analyseAbonne(vm);
  const sections=[
    ['avis',signalCard(vm)],
    ['stats',stats?groupe({title:t('match_page.stats_group_title','Les stats du match'),sub:t('match_page.stats_group_sub','Données brutes des deux équipes.'),body:stats}):''],
    ['analyse',analyse?groupe({title:t('match_page.analysis_group_title','L’analyse IASHARK'),sub:t('match_page.analysis_group_sub','Ce que calcule notre modèle pour ce match.'),body:analyse}):''],
    ['questions',faqCard(vm,{locked:false})]
  ];
  paint(vm,sections,signalSticky(vm),'');
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

// VUE VISITEUR (match payant sans Pro, ou match offert sans compte). Le match
// du jour (pickFreeMatchId, meme choix que l'accueil) reste gratuit mais exige
// un compte ; les autres necessitent Pro. La vraie protection est cote serveur
// (fonction match-data, fichiers publics sans champ premium).
// Regle du proprietaire : tout ce que l'IA donne est FERME, les stats brutes
// sont OUVERTES. Les blocs fermes ne lisent que des champs PUBLICS
// (has_signal, no_signal, prob_band) : aucun chiffre, aucune sortie du modele.
// opts : { free, title, href, cta }
function gateCard(vm,opts){
  const o=opts,raw=vm._raw||{},etat=etatAnalyse(raw),bande=etat==='ready'?bandeDe(raw):null;
  const contenu=[
    ['avis_item_bet','Le pari conseillé et sa cote'],
    ['avis_item_prob','La probabilité estimée par le modèle'],
    ['avis_item_scenario','Le scénario des 15 premières minutes'],
    ['avis_item_model','L’avis du modèle sur le match'],
    ['avis_item_players','Les marchés joueurs et buteurs'],
    ['pro_gate_item_stats','Toutes les stats du match : forme, classement, face-à-face, comparatif'],
    ['pro_gate_item_faq','Les réponses aux questions fréquentes sur ce match']
  ].filter(([k],i)=>(etat!=='none'||i>1)&&(o.stats||(k!=='pro_gate_item_stats'&&k!=='pro_gate_item_faq')));
  const titre=etat==='none'?t('match_page.avis_no_signal','Pas de pari retenu par le modèle sur ce match'):o.title;
  return `<section class="signal-card is-locked gate avis avis--lock reveal" aria-labelledby="gateTitle">
    <div class="sig-head">
      <span class="sig-eyebrow">${cardIcon('target')}${esc(t('match_page.avis_title','L’avis IASHARK'))}</span>
      ${etat==='ready'?`<span class="avis-ready"><i aria-hidden="true"></i>${esc(t('match_page.avis_ready','Analyse prête'))}</span>`:''}
    </div>
    <h2 id="gateTitle" class="avis-h">${esc(titre)}</h2>
    ${o.free?`<p class="avis-free">${esc(t('match_page.gate_free_text','Ce match est gratuit, mais il faut un compte IASHARK gratuit (inscription ou connexion) pour voir l’analyse complète.'))}</p>`:''}
    ${bande?`<div class="avis-band"><span>${esc(t('match_page.avis_band_label','Niveau du pari conseillé'))}</span>${bandBadge(bande)}</div>`:''}
    ${etat!=='none'?`<div class="sig-slip is-locked">
      <div class="sig-slip-main"><p class="sig-kicker">${esc(t('match_page.sig_bet_label','Pari recommandé'))}</p><div class="sig-ghost" aria-hidden="true"><span class="g1"></span><span class="g2"></span></div></div>
      <div class="sig-odds-box is-locked" aria-hidden="true">${cardIcon('lock')}</div>
    </div>`:''}
    <div class="avis-inc"><p>${esc(t('match_page.avis_includes','Ce que contient l’analyse'))}</p><ul class="gate-facts">${contenu.map(([k,fb])=>`<li>${esc(t('match_page.'+k,fb))}</li>`).join('')}</ul></div>
    <a class="btn-gate avis-cta" href="${esc(o.href)}"${suivi('match_avis_unlock')}>${cardIcon('lock')}<span>${esc(o.cta)}</span></a>
    <p class="sig-legal">${esc(t('match_page.avis_legal','Estimation, pas une garantie · 18+ · Jouez responsable.'))}</p>
    ${methodLink()}
  </section>`;
}
// MUR PRO (visiteur ou compte gratuit, match payant ; 19/09/2026). Constat du
// proprietaire : 3 visiteurs sur 4 n'atteignaient jamais l'offre Pro et les
// petits « Debloquer » disperses ne recevaient aucun clic. UN mur net, la ou
// l'analyse commence, dans le langage du verrou « Buteurs du jour » de
// l'accueil (home-scorers.js#renderGate) : apercu FACTICE floute (forme d'un
// ticket, d'une jauge, d'une ligne buteur ; texte « Xxxx » et « ??,? % »,
// aucune donnee, aria-hidden) et panneau par-dessus : cadenas, titre, ce que
// Pro ouvre (seulement ce que la vue abonne affiche), bouton ambre, resiliation.
// Champs publics seulement (etat de l'analyse, niveau prob_band).
const FAUX_TICKET=`<div class="mgp-slip"><span class="mgp-slip-main"><span class="mgp-k">Xxxxxx xxxxxx xxx xx xxxxxx</span><span class="mgp-market">Xxxxxxx xx Xxxxx</span><span class="mgp-fix">Xxxxxxxx – Xxxxxxx</span></span><span class="mgp-odds">?,??</span></div>
  <div class="mgp-duo"><span class="mgp-line is-model"><span>Xxxxx xxxxxxxxxx</span><b>??,? %</b><i class="mgp-bar wa"></i></span><span class="mgp-line is-market"><span>Xx xxx xxx xx xxxx</span><b>??,? %</b><i class="mgp-bar wb"></i></span></div>`;
const FAUX_BUTEUR=`<div class="mgp-scorer"><span class="mgp-avatar"></span><span class="mgp-who"><b>Xx. Xxxxxxxx xxxxxx</b><small>Xxxxxxxx · Xxxxxxxx</small></span><b class="mgp-prob">??,? %</b><i class="mgp-bar wc"></i></div>`;
const FAUX_SCORES=`<div class="mgp-scores"><span class="mgp-score"><b>Xxxxx xxxxx : ?-?</b><i class="mgp-bar wd"></i><small>?? %</small></span><span class="mgp-score"><b>Xxxxx xxxxx : ?-?</b><i class="mgp-bar we"></i><small>?? %</small></span><span class="mgp-score"><b>Xxxxx xxxxx : ?-?</b><i class="mgp-bar wf"></i><small>?? %</small></span></div>`;
function apercuFactice(avecPari){
  return `<div class="mgate-preview" aria-hidden="true">${avecPari?FAUX_TICKET:''}${FAUX_BUTEUR}${FAUX_SCORES}</div>`;
}
// Prix mensuel Pro de la version (19/09/2026) : MEME source que la page
// d'abonnement (lib/market-config.js#proOffer, depuis config/markets.json),
// donc devise et montant du marche du repertoire (GBP sur gb, MXN sur mx,
// ZAR sur za). Jamais ecrit en dur. Mensuel absent ou pas encore payable
// (config/markets.json#checkoutOpen : gb, mx, za fermes le 19/09/2026) ou
// config absente = null : aucun prix annonce pour une offre qu'on ne peut pas
// acheter, le mur garde sa ligne « Resiliable a tout moment ».
function prixMensuelPro(){
  const M=window.IASHARK_MARKET;
  if(!M||typeof M.proOffer!=='function')return null;
  try{
    const it=M.proOffer().intervals.filter(i=>i.interval==='month')[0];
    return it&&it.amount!=null&&it.open!==false&&it.text?it.text:null;
  }catch(e){return null;}
}
function proGate(vm,o){
  const raw=vm._raw||{},etat=etatAnalyse(raw),bande=etat==='ready'?bandeDe(raw):null;
  // Tout ce que la vue abonne affiche (render + analyseAbonne), rien de plus.
  // Stats et FAQ : seulement si le match en a (o.stats).
  const contenu=[
    ['pro_gate_item_bet','Le marché retenu par le modèle et sa probabilité en %'],
    ['pro_gate_item_scorer','Le buteur le plus probable et les marchés joueurs'],
    ['pro_gate_item_scenario','Le scénario du match par tranche de 15 minutes : quand les buts tombent'],
    ['pro_gate_item_scores','Les scores les plus probables et les buts attendus'],
    ['pro_gate_item_odds','Nos probabilités face aux cotes, marché par marché'],
    ['pro_gate_item_stats','Toutes les stats du match : forme, classement, face-à-face, comparatif'],
    ['pro_gate_item_faq','Les réponses aux questions fréquentes sur ce match']
  ].filter(([k],i)=>(etat!=='none'||i>0)&&(o.stats||(k!=='pro_gate_item_stats'&&k!=='pro_gate_item_faq')));
  const prix=prixMensuelPro();
  return `<section class="signal-card is-locked gate mgate avis avis--lock reveal" aria-labelledby="gateTitle">
    <div class="sig-head">
      <span class="sig-eyebrow">${cardIcon('target')}${esc(t('match_page.avis_title','L’avis IASHARK'))}</span>
      ${etat==='ready'?`<span class="avis-ready"><i aria-hidden="true"></i>${esc(t('match_page.avis_ready','Analyse prête'))}</span>`:''}
    </div>
    <div class="mgate-stage">
      ${apercuFactice(etat!=='none')}
      <div class="mgate-panel"><div class="mgate-card">
        <span class="mgate-lock" aria-hidden="true">${cardIcon('lock')}</span>
        <h2 id="gateTitle" class="mgate-title">${esc(t('match_page.pro_gate_title','Débloque l’analyse complète de ce match'))}</h2>
        <p class="sr-only">${esc(t('match_page.pro_gate_sr','Aperçu flouté et factice : il ne contient aucune donnée de l’analyse. L’analyse complète de ce match est réservée aux abonnés Pro.'))}</p>
        ${etat==='none'?`<p class="mgate-note">${esc(t('match_page.avis_no_signal','Pas de pari retenu par le modèle sur ce match'))}</p>`:''}
        ${bande?`<div class="mgate-band"><span>${esc(t('match_page.avis_band_label','Niveau du marché retenu'))}</span>${bandBadge(bande)}</div>`:''}
        <ul class="mgate-list">${contenu.map(([k,fb])=>`<li>${esc(t('match_page.'+k,fb))}</li>`).join('')}</ul>
        <p class="mgate-more">${esc(t('pro_offer.match_more','+ tous les matchs du jour, les 3 buteurs du jour et les outils Pro'))}</p>
        <a class="mgate-cta" href="${esc(o.href)}"${suivi('match_gate_unlock')}>${esc(t('match_page.pro_gate_cta','Débloquer avec Pro'))} <span aria-hidden="true">→</span></a>
        <p class="mgate-small">${esc(prix?tf('pro_offer.price_month','{price}/mois · résiliable à tout moment',{price:prix}):t('match_page.pro_gate_small','Résiliable à tout moment depuis ton compte.'))}</p>
      </div></div>
    </div>
    <p class="sig-legal">${esc(t('match_page.avis_legal','Estimation, pas une garantie · 18+ · Jouez responsable.'))}</p>
    ${methodLink()}
  </section>`;
}
function renderVisitor(raw,opts){
  const o=Object.assign({
    free:false,
    title:t('match_page.avis_lock_title','Notre modèle a analysé ce match'),
    href:lien('abonnement.html'),
    cta:t('match_page.avis_unlock','Débloquer l’analyse')
  },opts||{});
  // Defense en profondeur : copie sans aucun champ premium AVANT tout calcul.
  const vm=viewModel(publicCopy(raw));
  // DECISION DU PROPRIETAIRE (19/09/2026, remplace la regle « stats ouvertes »
  // du 16/09) : le visiteur ne voit QUE l'en-tete du match et UN panneau —
  // avis ferme « compte gratuit » (gateCard) sur le match offert, mur Pro
  // (proGate) sur un match payant. Stats (y compris classement et forme de
  // l'en-tete), FAQ, analyse : tout est derriere ce panneau, qui les liste.
  // Un seul bouton « Debloquer » par page.
  o.stats=!!statsBlocs(vm);
  paint(vm,[['avis',o.free?gateCard(vm,o):proGate(vm,o),true]],'','',{sansStats:true});
}
function renderAuthWall(raw){
  renderVisitor(raw,{
    free:true,
    title:t('match_page.gate_free_title','Match gratuit du jour'),
    href:lien('compte.html'),
    cta:t('match_page.free_cta','Créer un compte gratuit / Se connecter')
  });
}
// Offre Pro avec retour a CE match apres paiement : ?next= interne vers
// match.html?id= (abonnement-page.js#contexteMatch le garde en sessionStorage
// iashark.checkout.return pour checkout-succes / checkout-annule). Explicite :
// le referrer ne suffit pas depuis une page statique /match/<id>.html.
function offrePro(raw){
  const id=raw&&raw.id!=null?String(raw.id):'';
  return /^\d+$/.test(id)?lien('abonnement.html?next='+encodeURIComponent(lien('match.html?id='+id))):lien('abonnement.html');
}
function renderProWall(raw){
  renderVisitor(raw,{href:offrePro(raw)});
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
      render(PRELOADED_MATCH);
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
    if(window.IasharkApp){
      ctx=await window.IasharkApp.context();
      if(ctx.session){
        const result=await window.IasharkApp.supabase.functions.invoke('match-data',{body:{id:String(id)}});
        if(result.data&&!result.error){
          list=result.data.matchs||[];
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
    if(isFree&&!ctx.session){renderAuthWall(raw);return;}
    if(!isFree&&!termine&&!ctx.isPro){renderProWall(raw);return;}
    render(raw);
  }catch(e){
    root.innerHTML=`<div class="match-error"><b>${esc(e.message||t('match_page.generic_load_error','Erreur de chargement'))}</b><a href="${esc(lien(''))}">${esc(t('match_page.back_to_home','Retour à l\'accueil'))}</a></div>`;
  }
}
init();
})();
