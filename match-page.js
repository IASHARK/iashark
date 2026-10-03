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
// Texte d'une note -> HTML sans coupure genante sur telephone (4e relecture du 30/09) :
// jamais un chiffre separe de son unite (« 3 ans », « 67 matchs », « 15 % »), jamais un mot
// compose coupe a son trait d'union (« Hors-jeu », « 2024-2026 »).
// 5e relecture du 30/09 : le chiffre est colle a l'unite QUI SUIT, jamais au mot qui le precede
// (« trouve 95 fois » faisait un seul bloc de trois mots : trou en fin de ligne sur telephone).
// Seul un nombre isole (debut, espace ordinaire, parenthese, signe) prend son unite. Les noms a
// chiffre (« Ligue 1 », « Liga 1 », « J1 League ») sont colles a part (insecableNom) ; dans
// « Ligue 1 seulement », le 1 appartient au nom et « seulement » n'est pas une unite.
// Pas de « lookbehind » (?<=...) : un vieux Safari refuserait tout le fichier.
// Guillemets francais colles a leur texte (« Attendu... » jamais coupe apres « ) ; « quart d’heure » d'un bloc.
const insecableNom=s=>String(s).replace(/(^|[^\p{L}\d])(Ligue|Liga|League|Serie|Série|Division|Premier|J\d|K) (?=\d\b|[A-Z]\b|League\b)/gu,'$1$2\u00a0').replace(/« /g,'«\u00a0').replace(/ »/g,'\u00a0»').replace(/(quarts?) (d’heure)/g,'$1\u00a0$2');
// Et jamais un mot court seul sur la derniere ligne (« dans ce / match. »).
const insecableTexte=s=>insecableNom(s).replace(/(^|[ \t\n(+−])(\d[\d\u202f.,]*) (?=[\p{L}%(])/gu,'$1$2\u00a0').replace(/ (\S{1,7})$/u,'\u00a0$1');
const insecable=s=>esc(insecableTexte(s)).replace(/[^\s-]+(?:-[^\s-]+)+/g,m=>`<span class="nw">${m}</span>`);
const n=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,d=1)=>n(v)===null?'—':Number(v).toLocaleString(localeTag(),{maximumFractionDigits:d});
// Buts attendus : toujours une decimale (« 2,0 », jamais « 2 »), comme « L'histoire du match » ;
// la valeur est deja arrondie une fois par lib/match-view-model.js (une seule source, 01/10/2026).
const fmtButs=v=>n(v)===null?'—':Number(v).toLocaleString(localeTag(),{minimumFractionDigits:1,maximumFractionDigits:1});
// Pourcentage au format de la langue ("70 %" en francais, "70%" en anglais).
const pct=(v,d=1)=>n(v)===null?'—':(Number(v)/100).toLocaleString(localeTag(),{style:'percent',maximumFractionDigits:d});
const odds=v=>n(v)===null?'—':Number(v).toLocaleString(localeTag(),{minimumFractionDigits:2,maximumFractionDigits:2});
// Une decimale FIXE (« 16,0 % » a cote de « 15,7 % », jamais « 16 % » dans la meme liste).
const pct1=v=>n(v)===null?'—':(Number(v)/100).toLocaleString(localeTag(),{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});
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
  calendar:'<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4M10 14.5l4 3M14 14.5l-4 3"/>',
  history:'<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6L3.5 8.5"/><path d="M3.5 3.5v5h5M12 8v4.5l3 2"/>'
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
// seul : chiffre du modele seul, calcule sans la cote (hors d'Europe, coupes,
// selections, ancien moteur : lib/match-view-model.js#origineProbabilite). Quand il
// depasse la cote, jamais « Le modèle voit plus de chances que le bookmaker » ni
// « +X points » : ces paris passent environ 70 % du temps pour 77 % annonces
// (condition 1 du mathematicien, 30/09/2026).
// v3Seul : le chiffre vient VRAIMENT du moteur v3 « modèle seul » (source v3 et
// origine publiee « modèle seul »). Seul ce cas dit « Estimation du modèle seul,
// sans la cote » ; ancien moteur (80 % de cote sans marge, lib/decision.js),
// origine absente ou inconnue : seulement « Écart non affiché. » (avocat, 30/09).
// enTest : competition « Fiabilité : en test » (lib/match-view-model.js#leagueInTest) :
// aucun ecart dit, ni favorable, ni defavorable, ni « même chose ».
function ecart(model,market,edge,seul,v3Seul,enTest){
  const m=n(model),k=n(market);
  if(m===null||k===null)return{cls:'none',text:t('match_page.proba_gap_none','Pas de cote comparable pour ce pari.'),gap:''};
  if(enTest===true)return{cls:'none',text:t('match_page.proba_gap_in_test','Fiabilité en test : écart non affiché.'),gap:''};
  const e=n(edge)!==null?n(edge):Math.round((m-k)*10)/10;
  const r=Math.round(Math.abs(e));
  if(r===0)return{cls:'flat',text:t('match_page.proba_gap_flat','Notre estimation et la cote disent la même chose.'),gap:''};
  if(seul===true&&e>0)return{cls:'none',text:v3Seul===true?t('match_page.proba_gap_model_only','Estimation du modèle seul, sans la cote : écart non affiché.'):t('match_page.proba_gap_hidden','Écart non affiché.'),gap:''};
  const gap=`${e>0?'+':'−'}${r} ${r===1?t('match_page.proba_point_one','point'):t('match_page.proba_point_other','points')}`;
  return e>0
    ?{cls:'pos',text:t('match_page.proba_gap_pos','Le modèle voit plus de chances que le bookmaker'),gap}
    :{cls:'neg',text:t('match_page.proba_gap_neg','Le modèle voit moins de chances que le bookmaker'),gap};
}
function duoBars(o){
  const m=n(o.model),k=marcheValide(o.market),c=n(o.odds);
  const g=ecart(m,k,k===null?null:o.edge,o.seul===true,o.v3Seul===true,o.enTest===true);
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
// Aucun pari sur le match : « Match reporté » si le match a ete reporte apres l'heure
// prevue (lib/pick-freeze.js POSTPONED_CLOSED, ronde 5), jamais « pas de pari retenu par
// le modele », qui laisserait croire a un choix du modele.
// Match de selections nationales : aucun pari du moteur v3 sur la page (verdict du
// mathematicien, 30/09/2026). Depuis le 03/10/2026, les competitions de la voie « cotes du
// marche » (Ligue des nations...) peuvent avoir une selection Pro envoyee sur Telegram : le
// texte reste neutre et vrai (« Les sélections Pro du jour sont envoyées aux abonnés, en prive
// sur Telegram. »), jamais « pas de pari sur les sélections ».
function estSelection(raw){
  const lib=window.IasharkMatchViewModel;
  return !!(raw&&lib&&lib.estSelectionNationale&&lib.estSelectionNationale(raw));
}
// Match reporte AVANT tout (avocat du diable, 01/10/2026) : un match de selections reporte
// dit « Match reporté », comme l'accueil, jamais « pas de pari sur les sélections ».
function sansPari(raw){
  if(estSelection(raw)&&!(raw&&raw.no_signal_reason==='KICKOFF_POSTPONED'))return t('match_page.avis_no_signal_selections','Les sélections Pro du jour sont envoyées aux abonnés, en privé sur Telegram.');
  return raw&&raw.no_signal_reason==='KICKOFF_POSTPONED'
    ?t('match_page.avis_postponed','Match reporté : aucun pronostic sur ce match')
    :t('match_page.avis_no_signal','Pas de pari retenu par le modèle sur ce match');
}
// ---- SELECTION PRO DU JOUR (03/10/2026 : une seule source avec Telegram) ----
// Un abonne Pro (essai et admin compris) voit sur la page match la selection du Canal Pro
// envoyee pour CE match (public.pro_paris, RLS 0040 : paris PUBLIES et ENVOYES du mode ouvert,
// colonnes accordees seulement, jamais « select * »), avec les memes informations que le
// message Telegram (supabase/functions/_shared/canal-pro.mjs#blocPari) : selection, chance
// calculee et sa source, meilleure cote et bookmaker, N° PRO. Jamais de mise. Table vide ou
// illisible : rien. Textes : i18n match_page.selpro.* (copies des textes du robot,
// tests/page-selection-pro.test.js verifie qu'ils restent identiques).
const SELPRO_COLONNES='id,numero,famille,fixture_id,ligue,dom,ext,coup_envoi,marche,ligne,selection,selections,proba,source_proba,meilleure_cote,meilleur_bookmaker,cote_vue_at,publie_at';
const SELPRO_COMBINES=['combine','fun10','fun25','reve'];
const SELPRO_SOURCE_MARCHE='chance calculée par IASHARK à partir des cotes du marché';
// Noms des bookmakers agrees (France, programme commun) : canal-pro.mjs#BOOKMAKERS_AGREES.FR.
const SELPRO_BOOKMAKERS={betclic:'Betclic',netbet:'NetBet',pmu:'PMU',unibet:'Unibet',winamax:'Winamax',bet365:'bet365',betsson:'Betsson',bwin:'Bwin',circus:'Circus',daznbet:'DAZN Bet',feelingbet:'Feelingbet',genybet:'Genybet',olybet:'Olybet',pokerstars:'PokerStars Sports',vbet:'Vbet',yesorno:'Yesorno'};
// Marche du robot -> marche du moteur v3 (pour ne pas montrer deux fois la meme selection).
const SELPRO_MARCHES={'1':'home-win',N:'draw','2':'away-win','1X':'dc-1x',X2:'dc-x2','12':'dc-12',O25:'over-25',U25:'under-25'};
let SELECTIONS_PRO=[];
async function lireSelectionsPro(sb,fixtureId){
  const fid=Number(fixtureId);
  if(!sb||typeof sb.from!=='function'||!Number.isFinite(fid)||fid<=0)return [];
  const lire=q=>new Promise(ok=>{
    const fin=setTimeout(()=>ok([]),4000);
    try{Promise.resolve(q).then(r=>{clearTimeout(fin);ok(r&&!r.error&&Array.isArray(r.data)?r.data:[]);},()=>{clearTimeout(fin);ok([]);});}
    catch(e){clearTimeout(fin);ok([]);}
  });
  const req=()=>sb.from('pro_paris').select(SELPRO_COLONNES);
  try{
    // Simple / buteur : fixture_id ; combine et tickets : une de leurs selections (nombre ou texte).
    const lots=await Promise.all([
      lire(req().eq('fixture_id',fid)),
      lire(req().contains('selections',JSON.stringify([{fixture_id:fid}]))),
      lire(req().contains('selections',JSON.stringify([{fixture_id:String(fid)}])))
    ]);
    const vus={};
    return lots[0].concat(lots[1],lots[2])
      .filter(p=>p&&p.publie_at&&Number(p.proba)>0&&Number(p.proba)<1&&!vus[p.id]&&(vus[p.id]=true))
      .sort((a,b)=>(Number(a.numero)||0)-(Number(b.numero)||0));
  }catch(e){return [];}
}
const selproCombine=p=>SELPRO_COMBINES.indexOf(p&&p.famille)!==-1;
function selproNombre(x,d){const s=Number(x).toFixed(d);return t('match_page.selpro.decimal',',')==='.'?s:s.replace('.',',');}
function selproPct1(p){const x=p*100;return x>=10?String(Math.round(x)):selproNombre(x,1);}
function selproUneSurN(p){const k=1/p;return k<10?selproNombre(k,1):String(Math.round(k));}
// D'ou vient la chance : canal-pro.mjs#voieChance.
function selproVoie(p){
  if(!p||p.famille==='buteur')return 'v3';
  if(selproCombine(p)){
    const s=Array.isArray(p.selections)?p.selections:[];
    const k=s.filter(j=>j&&j.voie==='cotes_marche').length;
    return !k?'v3':k===s.length?'marche':'mixte';
  }
  return String(p.source_proba||'').indexOf(SELPRO_SOURCE_MARCHE)===0?'marche':'v3';
}
// La chance, mot pour mot comme dans Telegram : canal-pro.mjs#chanceTxt.
function selproChance(p){
  const voie=selproVoie(p),pr=Number(p.proba);
  if(p.famille==='buteur')return tf('match_page.selpro.chance_buteur','Chance calculée par IASHARK : environ {p} % (1 chance sur {n}), lue dans la grille des scores du match.',{p:selproPct1(pr),n:selproUneSurN(pr)});
  if(selproCombine(p)){
    const quoi=voie==='marche'?' à partir des cotes du marché':voie==='mixte'?' (moteur v3 et cotes du marché)':'';
    const k=voie==='marche'?'chance_combine_marche':voie==='mixte'?'chance_combine_mixte':'chance_combine';
    return tf('match_page.selpro.'+k,'Chance calculée par IASHARK'+quoi+' : environ 1 chance sur {n} ({p} %), toutes les sélections doivent passer.',{p:selproPct1(pr),n:selproUneSurN(pr)});
  }
  return voie==='marche'
    ?tf('match_page.selpro.chance_marche','Chance calculée par IASHARK à partir des cotes du marché : {p} %.',{p:Math.round(pr*100)})
    :tf('match_page.selpro.chance_simple','Chance calculée par IASHARK : {p} %.',{p:Math.round(pr*100)});
}
// La selection : en francais le texte archive (celui du message) ; ailleurs, recalculee
// dans la langue a partir du marche, comme le robot (canal-pro.mjs#selectionTxt).
function selproMarche(j){
  if(!j)return '';
  if(estFr()&&j.selection)return String(j.selection);
  if(!j.marche||(!Object.prototype.hasOwnProperty.call(SELPRO_MARCHES,j.marche)&&j.marche!=='AHH'&&j.marche!=='AHA'))return String(j.selection||'');
  const l=j.ligne==null||j.ligne===''?'':(Number(j.ligne)>0?'+':'')+(t('match_page.selpro.decimal',',')==='.'?String(Number(j.ligne)):String(Number(j.ligne)).replace('.',','));
  return tf('match_page.selpro.m_'+j.marche,String(j.selection||''),{home:j.dom||'',away:j.ext||'',line:l});
}
function selproSelection(p){
  if(estFr()&&p.selection)return String(p.selection);
  if(p.famille==='buteur'){const b=Array.isArray(p.selections)&&p.selections[0]||{};return b.equipe&&b.joueur?tf('match_page.selpro.buteur','{team} gagne + {player} marque (à n’importe quel moment)',{team:b.equipe,player:b.joueur}):String(p.selection||'');}
  if(selproCombine(p))return (p.selections||[]).map(selproMarche).filter(Boolean).join(' + ')||String(p.selection||'');
  return selproMarche(p);
}
// Heure de Paris, comme le robot (« 14 h 05 » en francais).
function selproHeure(d){
  const x=new Date(d);
  if(!d||isNaN(x))return '';
  try{
    const hm=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(x).split(':');
    if(estFr())return Number(hm[0])+' h'+(hm[1]==='00'?'':' '+hm[1]);
    const tz=t('match_page.selpro.tz','');
    return new Intl.DateTimeFormat(localeTag(),{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'}).format(x)+(tz?' '+tz:'');
  }catch(e){return '';}
}
function selproCote(p){
  if(p.famille==='buteur')return esc(t('match_page.selpro.sans_preuve_buteur','Cote buteur : à voir chez ton bookmaker (nous ne la relevons pas).'));
  const c=Number(p.meilleure_cote);
  if(!(c>1)||!p.meilleur_bookmaker)return esc(t('match_page.selpro.sans_cote','Cote : pas encore relevée chez les opérateurs autorisés dans ton pays.'));
  const combi=selproCombine(p);
  const lib=combi?(p.famille==='combine'?t('match_page.selpro.cote_combine','Cote du combiné'):t('match_page.selpro.cote_ticket','Cote du ticket')):t('match_page.selpro.cote_simple','Cote');
  const nom=SELPRO_BOOKMAKERS[p.meilleur_bookmaker]||p.meilleur_bookmaker;
  const h=selproHeure(p.cote_vue_at);
  return `${esc(lib)}${estFr()?' : ':': '}<b>${esc(selproNombre(c,2))}</b> ${esc(t('match_page.selpro.chez','chez'))} ${esc(nom)}${combi?esc(t('match_page.selpro.chez_lui',' (toutes les sélections chez lui)')):''}${h?' · '+esc(tf('match_page.selpro.relevee','relevée à {h}',{h})):''}`;
}
function selproJambes(p){
  if(!selproCombine(p))return '';
  const L=(p.selections||[]).map((j,k)=>{
    const c=Number(j&&j.cote);
    return `<li>${k+1}. ${esc(j.ligue||'')}${j.ligue?' · ':''}${esc(j.dom||'')} – ${esc(j.ext||'')}${j.coup_envoi?' · '+esc(selproHeure(j.coup_envoi)):''}${estFr()?' : ':': '}<b>${esc(selproMarche(j))}</b>${c>1?` (${esc(selproNombre(c,2))})`:''}</li>`;
  }).join('');
  return L?`<ol class="selpro-legs">${L}</ol>`:'';
}
function selectionProCard(liste){
  if(!VUE_PRO||!Array.isArray(liste)||!liste.length)return '';
  const marche=liste.some(p=>selproVoie(p)!=='v3'),v3=liste.some(p=>selproVoie(p)!=='marche');
  const items=liste.map(p=>{
    const fam=t('match_page.selpro.fam_'+p.famille,String(p.famille||'').toUpperCase());
    return `<article class="selpro-item">
      <p class="selpro-fam">${esc(fam)}</p>
      ${selproJambes(p)}
      <p class="selpro-sel">${esc(t('match_page.selpro.sel_label','Sélection'))}${estFr()?' : ':': '}<b>${esc(selproSelection(p))}</b></p>
      <p class="selpro-chance">${esc(selproChance(p))}</p>
      <p class="selpro-cote">${selproCote(p)}</p>
      ${p.numero?`<p class="selpro-num">N° PRO-${esc(p.numero)}</p>`:''}
    </article>`;
  }).join('');
  const sources=(v3?`<p class="selpro-source">${esc(t('match_page.selpro.source_v3','Chances calculées par IASHARK (moteur v3).'))}</p>`:'')
    +(marche?`<p class="selpro-source">${esc(t('match_page.selpro.source_marche','Quand c’est écrit « à partir des cotes du marché », la chance vient des cotes des bookmakers, marge retirée.'))}</p>`:'');
  return card(t('match_page.selpro.title','Sélection Pro du jour'),
    `<p class="selpro-intro">${esc(t('match_page.selpro.intro','Le même message que celui envoyé aux abonnés Pro sur Telegram.'))}</p>${items}${sources}`,'selpro-card','target');
}
// Meme selection deja montree par l'avis du moteur v3 (ou match de selections, dont l'avis
// ne dit rien d'autre) : l'avis est retire, le bloc « Sélection Pro du jour » passe en priorite.
function selproRemplaceAvis(raw,liste){
  if(!VUE_PRO||!Array.isArray(liste)||!liste.length||!raw)return false;
  if(estSelection(raw))return true;
  const v3=String((raw.v3_pari&&raw.v3_pari.market_id)||raw.market_id||'');
  return !!v3&&liste.some(p=>p.famille==='simple'&&String(p.fixture_id)===String(raw.id)&&SELPRO_MARCHES[p.marche]===v3);
}

// Etat PUBLIC de l'analyse : 'ready' (has_signal / no_signal:false), 'none'
// (no_signal:true), 'unknown'.
function etatAnalyse(raw){
  if(!raw)return 'unknown';
  if(estSelection(raw))return 'none';
  if(raw.no_signal===true)return 'none';
  if(raw.has_signal===true||raw.no_signal===false)return 'ready';
  return 'unknown';
}

// Defense en profondeur (vue visiteur) : copie de lib/premium-fields.js#PREMIUM_FIELDS
// (tests/match-page-structure.test.js verifie que les deux listes sont
// identiques). prob_band, has_signal et no_signal restent : ils sont publics.
// Une seule cote (lib/cote-anj.js, 01/10/2026) : d'ou vient la cote du pari. Page francaise
// seulement (bookmakers agrees ANJ = France) : « chez Winamax », ou « cote indicative » quand
// aucun agree ne cote ce pari (moyenne du marche, jamais un nom de bookmaker non agree).
function coteOrigine(vm){
  if(!estFr())return '';
  const bk=vm&&vm.model&&vm.model.recommendedBookmaker;
  if(bk)return `<small class="sig-odds-src">chez ${esc(bk)}</small>`;
  return vm&&vm.model&&vm.model.recommendedOddsIndicative?'<small class="sig-odds-src">cote indicative</small>':'';
}
const CHAMPS_PREMIUM=["pari_rec","cote_rec","model_probability","markets_compared","market_id","marche","kelly","edge","verdict_shark","facteur_x","dropping_odds","player_markets","facteur_x_i18n","verdict_shark_i18n","conf","p1","pn","p2","po15","po25","btts","lambda_h","lambda_a","market_aware_p1","market_aware_pN","market_aware_p2","market_consensus_p1","market_consensus_pN","market_consensus_p2","mc_scores","scores","simulation_count","paris_safe","paris_risque","vbet","val","hot","risque","mise","pick_downgrade","odds_available","is_canonical_pick","reliability","model_agreement","crit_home","crit_away","elo_signal","analyse_card","analyse_card_i18n","conseil_public","conseil_public_i18n","contexte","contexte_i18n","scenario","scenario_i18n","scenario_15min","sim_15min","decision_factors","risk_principal","top_scorers","v3_fiabilite","v3_pari","v3_marches","v3_suivi","v3_buteurs","chance_iashark","chance_iashark_source","cote_bookmaker","cote_source","cote_releve_a","sans_marge_anj","stats_iashark","lecture_match","pronostic"];
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
  return ml?(ml.marketLabel||ml.marketLabelFr)(libelle,{home:nomEq(vm.identity.home),away:nomEq(vm.identity.away)}):String(libelle||'');
}
// Ligne du tableau des marches : l'identifiant moteur quand il est connu
// (plus fiable), sinon le libelle.
function libelleLigne(vm,row){
  const ml=window.IasharkMarketLabels,eq={home:nomEq(vm.identity.home),away:nomEq(vm.identity.away)};
  if(ml&&row.id&&ml.marketIdLabel){const s=ml.marketIdLabel(row.id,eq);if(s&&s!==row.id)return s;}
  return marcheFr(vm,row.label);
}

// ---- PRONOSTIC IASHARK (03/10/2026, plan de Clement : un pronostic sur chaque match) ----
// Champ premium `pronostic` pose par le pipeline (lib/pronostic.js) : l'issue la plus probable
// parmi les marches verifies, sa chance calculee (lib/chance-iashark.js, la meme que Telegram),
// la cote si connue et la fiabilite (« vérifiée » / « en test »). La selection IASHARK en est un
// sous-ensemble : « ✓ Sélection IASHARK » quand le pronostic est retenu. Lu seulement en vue
// Pro ou sur le match offert (le serveur ne l'envoie pas ailleurs) ; jamais recalcule ici.
// Aucune mise, aucune esperance, jamais « conseil ».
function pronosticDe(raw){
  const p=raw&&raw.pronostic;
  if(!p||typeof p!=='object'||!p.market_id&&!p.libelle_fr)return null;
  const c=Number(p.chance);
  return Object.assign({},p,{chance:c>0&&c<100?Math.round(c):null});
}
function pronosticCard(vm,raw){
  const p=pronosticDe(raw);
  if(!p)return '';
  const ml=window.IasharkMarketLabels,eq={home:nomEq(vm.identity.home),away:nomEq(vm.identity.away)};
  let issue=estFr()&&p.libelle_fr?p.libelle_fr:'';
  if(!issue&&ml&&p.market_id&&ml.marketIdLabel){const s=ml.marketIdLabel(p.market_id,eq);if(s&&s!==p.market_id)issue=s;}
  if(!issue)issue=p.marche?marcheFr(vm,p.marche):String(p.libelle_fr||'');
  const sep=estFr()?' : ':': ';
  const cote=Number(p.cote)>1?(estFr()?Number(p.cote).toFixed(2).replace('.',','):Number(p.cote).toFixed(2)):null;
  const test=p.fiabilite==='en test';
  const fiab=test?t('match_page.prono.fiab_test','Fiabilité : en test (compétition pas encore vérifiée sur le passé)')
    :p.voie==='cotes_marche'?t('match_page.prono.fiab_marche','Fiabilité : vérifiée (chance calculée à partir des cotes du marché, marge retirée)')
    :t('match_page.prono.fiab_ok','Fiabilité : vérifiée sur le passé');
  const sel=p.selection===true
    ?`<p class="prono-sel"><b>${esc(t('match_page.prono.selection','✓ Sélection IASHARK'))}</b> · ${esc(t('match_page.prono.selection_sub','ce pronostic fait partie des sélections du jour.'))}</p>`
    :`<p class="prono-sel prono-sel--non">${esc(t('match_page.prono.non_selection','Pronostic seulement : pas retenu dans les sélections IASHARK du jour.'))}</p>`;
  return card(t('match_page.prono.title','Pronostic IASHARK'),
    `<p class="prono-issue">${esc(t('match_page.prono.issue','Pronostic'))}${esc(sep)}<b>${esc(issue)}</b></p>
    ${p.chance!=null?`<p class="prono-chance">${esc(tf('match_page.prono.chance','Chance calculée par IASHARK : {p} %.',{p:p.chance}))}</p>`:''}
    ${cote?`<p class="prono-cote">${esc(t('match_page.prono.cote','Cote'))}${esc(sep)}<b>${esc(cote)}</b></p>`:''}
    <p class="prono-fiab">${esc(fiab)}</p>
    ${sel}
    <p class="sig-legal">${esc(t('match_page.avis_legal','Estimation, pas une garantie.'))}</p>`,'prono-card','target');
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
  // Rang absent ou nul (equipe hors du tableau, donnee manquante) : ni « 0e », ni
  // « undefinede », ni « undefined pts » ; les points seulement s'ils sont connus.
  const rang=s?n(s.rank):null,pts=s?n(s.pts):null;
  const bits=rang!==null&&rang>0?`<small>${esc(rangOrdinal(rang))}${pts!==null?` · ${esc(pts)} ${esc(t('match_page.points_short','pts'))}`:''}</small>`:'';
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
  // Nom officiel de l'en-tete : un mot compose ne se coupe pas au trait d'union
// (« Paris / Saint-Germain », jamais « Paris Saint- / Germain » sur telephone).
const nomInsecable=nom=>esc(nom).replace(/[^\s-]+(?:-[^\s-]+)+/g,m=>`<span class="nw">${m}</span>`);
// Page statique /match/<id>.html : le resume SEO garde son h1 et reste en
  // place (plus de suppression = plus de decalage), l'en-tete passe en h2.
  const demo=typeof IASHARK_DEMO!=='undefined'&&IASHARK_DEMO;
  const enH2=demo||!!resumeSeoStatique();
  const titreOuvrant=enH2?'<h2 class="hero-teams">':'<h1 class="hero-teams">',titreFermant=enH2?'</h2>':'</h1>';
  // Pas de classe reveal sur l'en-tete : visible des le rendu (element LCP),
  // jamais en opacite 0 le temps d'une animation.
  return `<header class="card hero">
    <div class="hero-top">
      <span class="hero-league">${img(i.league.logo,'',30,30,{eager:true})}<span>${esc(ln)}</span>${vm.model&&vm.model.leagueInTest===true?`<span class="hero-test">${esc(t('match_page.league_in_test','Fiabilité : en test'))}</span>`:''}</span>
      <span class="hero-time">${esc(dh.date||t('match_page.date_tbc','Date à confirmer'))} · <b>${esc(dh.time||'—')}</b></span>
    </div>
    ${titreOuvrant}
      <span class="hero-team">${img(i.home.logo,'',60,60,{eager:true,priority:true})}<span class="hero-name">${nomInsecable(i.home.name)}</span></span>
      <span class="hero-vs">${esc(t('match_page.vs_label','vs'))}</span>
      <span class="hero-team">${img(i.away.logo,'',60,60,{eager:true,priority:true})}<span class="hero-name">${nomInsecable(i.away.name)}</span></span>
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
// Competition non validee par le mathematicien : ce libelle remplace le niveau
// de fiabilite (config/leagues.json#fiabilite, lib/league-scope.js).
function testBadge(){
  return `<span class="sig-rel sig-rel--test"><i aria-hidden="true"></i>${esc(t('match_page.league_in_test','Fiabilité : en test'))}</span>`;
}
function relBadgeVm(vm,info){return vm&&vm.model&&vm.model.leagueInTest===true?testBadge():relBadge(info);}
function relBadge(info){
  if(!info||!REL_NIVEAUX[info.level])return '';
  return `<span class="sig-rel sig-rel--${info.level}"><i aria-hidden="true"></i>${esc(t(REL_NIVEAUX[info.level][0],REL_NIVEAUX[info.level][1]))}</span>`;
}
function relRaison(info){
  if(!info)return '';
  if(info.reason==='thin_sample')return n(info.sampleSize)!==null
    // « (2) » jamais seul en fin de ligne (5e relecture du 30/09).
    ?tf('match_page.sig_rel_reason_thin_sample','peu de données récentes ({n} matchs cette saison)',{n:info.sampleSize}).replace(/ \((?=\d)/,'\u00a0(')
    :t('match_page.sig_rel_reason_thin_sample_nonum','peu de données récentes');
  // model_only / gap_hidden : fiabilite ramenee a « moyenne », ecart masque (lib/match-view-model.js#fiabiliteAffichee).
  const map={models_disagree:'les modèles ne sont pas d’accord entre eux',weak_data:'données incomplètes sur ce match',solid:'modèles d’accord et données complètes',mixed:'signaux partagés entre les modèles et les données',model_only:'estimation du modèle seul, sans la cote',gap_hidden:'écart avec la cote non affiché'};
  return map[info.reason]?t('match_page.sig_rel_reason_'+info.reason,map[info.reason]):'';
}
function relLigne(info){
  if(!info||!REL_NIVEAUX[info.level])return '';
  const raison=relRaison(info);
  return `${t(REL_NIVEAUX[info.level][0],REL_NIVEAUX[info.level][1])}${raison?t('match_page.label_colon',' :')+' '+raison:''}.`;
}

// Controle des chiffres publics (30/09/2026) : chaque raison dit sa base.
// Buts et cartons : moyennes des evenements du pipeline sur leurs N derniers
// matchs (events_*.games, jusqu'a 20, le meme N que le Comparatif) ; tirs,
// tirs cadres et corners : statistiques de match sur leurs 10 derniers matchs
// au plus. Plus de « Ce pari serait passe dans X des N derniers face-a-face » :
// trop proche d'un taux de reussite (retire dans toutes les langues).
const RAISONS={
  xg:'Buts attendus par le modèle : {home} {homeXg} – {awayXg} {away}.',
  goals_avg:'Par match, sur leurs derniers matchs : {home} marque {homeFor} et encaisse {homeAgainst}, {away} marque {awayFor} et encaisse {awayAgainst}.',
  goals_avg_n:'Par match, sur leurs {n} derniers matchs : {home} marque {homeFor} et encaisse {homeAgainst}, {away} marque {awayFor} et encaisse {awayAgainst}.',
  absences:'{team} privé de {n} joueurs : {names}.',
  form_wins:'Victoires récentes : {home} {homeWins} sur {homeN}, {away} {awayWins} sur {awayN}.',
  count_shots:'Tirs par match, sur leurs 10 derniers matchs au plus : {home} {homeValue}, {away} {awayValue} (total {total}).',
  count_shots_on:'Tirs cadrés par match, sur leurs 10 derniers matchs au plus : {home} {homeValue}, {away} {awayValue} (total {total}).',
  count_corners:'Corners par match, sur leurs 10 derniers matchs au plus : {home} {homeValue}, {away} {awayValue} (total {total}).',
  count_cards:'Cartons jaunes par match, sur leurs derniers matchs : {home} {homeValue}, {away} {awayValue} (total {total}).',
  count_cards_n:'Cartons jaunes par match, sur leurs {n} derniers matchs : {home} {homeValue}, {away} {awayValue} (total {total}).'
};
const NUM_VARS=['homeXg','awayXg','totalXg','homeFor','homeAgainst','awayFor','awayAgainst','homeValue','awayValue','total'];
// Une decimale FIXE : « encaisse 1,0 » comme le Comparatif, jamais « encaisse 1 ».
const un1=v=>n(v)===null?String(v):Number(v).toLocaleString(localeTag(),{minimumFractionDigits:1,maximumFractionDigits:1});
// Nombre de matchs derriere les moyennes de buts et de cartons (events_*.games),
// jamais devine : absent = « sur leurs derniers matchs », sans chiffre.
function matchsEvenements(vm){
  const r=(vm&&vm._raw)||{};
  const h=n(r.events_home&&r.events_home.games),a=n(r.events_away&&r.events_away.games);
  return h!==null&&a!==null&&Math.min(h,a)>=1?Math.min(h,a):null;
}
function texteRaison(item,vm){
  if(!item||!RAISONS[item.key])return null;
  const v=Object.assign({},item.vars);
  NUM_VARS.forEach(k=>{if(v[k]!=null)v[k]=un1(v[k]);});
  let cle=item.key;
  if(cle==='goals_avg'||cle==='count_cards'){
    const nb=matchsEvenements(vm);
    if(nb!==null&&nb>1){cle+='_n';v.n=nb;}
  }
  return tf('match_page.sig_reason_'+cle,RAISONS[cle],v);
}
const RISQUES={
  negative_edge:'cote moins intéressante que notre estimation ({gap} en défaveur)',
  small_edge:'écart faible avec le marché ({gap})',
  models_disagree:'les modèles divergent sur ce match',
  backed_absences:'{team} privé de {n} joueurs',
  low_odds:'cote basse ({odds}) : gain limité'
};
function texteRisqueSignal(item){
  if(!item||!RISQUES[item.key])return null;
  const v=Object.assign({},item.vars);
  // 5e relecture du 30/09 : l'ecart s'ecrit comme dans « Nos chances face a la cote » (arrondi au
  // point, « points » en toutes lettres) : jamais « −3 points » la et « 3,2 pts » ici.
  if(v.gap!=null){
    const r=Math.round(Math.abs(Number(v.gap)));
    v.gap=r===0?t('match_page.sig_gap_under_one','moins d’un point'):`${r}\u00a0${r===1?t('match_page.proba_point_one','point'):t('match_page.proba_point_other','points')}`;
  }
  if(v.odds!=null)v.odds=odds(v.odds);
  return tf('match_page.sig_risk_'+item.key,RISQUES[item.key],v);
}

// 30/09 (page match plus) : « Probabilite estimee x/10 » et « Niveau de cote » retires de
// l'avis : doublons des deux barres « Nos chances face a la cote » et de la cote affichee.

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


// Relecture du 30/09 : la phrase du pipeline (conseil_public) parle des
// « tranches de buts » de l'ANCIENNE repartition des buts ; la page montre la
// simulation par quart d'heure (Scenario), qui peut dire autre chose (31-45+ a
// 44 % contre « parmi les plus faibles »). Quand la simulation est affichee,
// cette partie de la phrase est retiree (francais : la proposition seule ;
// autre langue : la phrase entiere). Jamais deux lectures contraires sur une page.
function lectureSansTranches(vm,lecture){
  const src=String(vm.editorial.decisiveFactor||'');
  if(!lecture||!(vm.model&&vm.model.goalSimulation&&vm.model.goalSimulation.slots&&vm.model.goalSimulation.slots.length)||!/tranche/i.test(src))return lecture;
  if(!/^fr/i.test(localeTag()))return null;
  const s=String(lecture).replace(/\s+et\s+(les\s+)?tranches?\s+de\s+buts?[^.;]*/i,'').trim();
  return /tranche/i.test(s)?null:s;
}

// « Le piege du match » (page francaise) : ce qui peut renverser l'histoire du match. Une stat
// du Book d'abord (vm.plus.piege : phrase + nombre de matchs et periode), sinon une absence
// reelle du match (liste des blesses et suspendus), sinon null : jamais une phrase inventee.
function textePiege(vm,alerte){
  const p=vm.plus&&vm.plus.piege;
  if(p)return `${insecable(p.phrase)} <small>(${insecable(p.detail)}).</small>`;
  const abs=(vm.editorial.signalRisks||[]).find(x=>x&&x.key==='backed_absences');
  const txt=abs?texteRisqueSignal(abs):alerte?texteLisible(vm,alerte):null;
  return txt?esc(sbkMaj(txt))+'.':null;
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
    // Selections nationales : jamais de pari (verdict du 30/09/2026), le texte le dit,
    // avec « Fiabilité : en test » ; jamais « Analyse en cours » ni « aucun marche ».
    const selection=estSelection(raw);
    const msg=selection?sansPari(raw)
      :raw.has_signal===true&&raw.no_signal!==true
      ?t('match_page.sig_premium_updating','Analyse détaillée en cours de mise à jour. Le marché recommandé et les probabilités s’afficheront dès la prochaine actualisation.')
      :raw.no_signal===true?sansPari(raw)
      :vm.model.unavailableReason?t('match_page.model_unavailable_reason',vm.model.unavailableReason)
      :t('match_page.signal_unavailable_fallback','Aucun marché ne franchit les seuils de confiance ou de cote minimale pour ce match — IASHARK préfère ne pas se prononcer.');
    // Sans pari, les probabilites du modele restent affichees plus bas : une
    // fiabilite « Faible » (Colombie, Perou, Chili, Afrique du Sud : donnees
    // limitees, jamais verifiees sur le passe) reste visible ici.
    const faible=vm.model.available&&vm.model.reliabilityInfo&&vm.model.reliabilityInfo.level==='low'?vm.model.reliabilityInfo:null;
    const meta=selection?`<div class="sig2-meta">${testBadge()}</div>`
      :faible?`<div class="sig2-meta">${relBadgeVm(vm,faible)}${vm.model.leagueInTest===true?'':`<p class="sig-rel-note">${esc(relLigne(faible))}</p>`}</div>`:'';
    return card(titre,empty(msg)+meta,'signal-card avis','target');
  }
  // Une probabilite nulle ou absente n'est jamais affichee "0 %" : elle
  // n'existe pas (constate en ligne sur un match servi sans le champ).
  const prob=n(r.probability)!==null&&r.probability>0?n(r.probability):null;
  const cote=n(vm.model.recommendedOdds),implied=n(vm.model.recommendedImplied);
  const edge=prob!==null?n(vm.model.recommendedEdge):null;
  const info=vm.model.reliabilityInfo;
  const raisons=(vm.editorial.signalReasons||[]).map(x=>texteRaison(x,vm)).filter(Boolean);
  // facteur_x/conseil_public : texte du pipeline ; hors FR, sa traduction
  // validee, sinon masque. Cite tel quel, en complement des raisons chiffrees.
  const lecture=lectureSansTranches(vm,narratif(vm.editorial.decisiveFactor,vm.editorial.decisiveFactorI18n));
  const risques=(vm.editorial.signalRisks||[]).map(texteRisqueSignal).filter(Boolean);
  const alerte=vm.editorial.risk&&!['FAIBLE','MODERE','ELEVE'].includes(vm.editorial.risk)?texteRisque(vm,vm.editorial.risk):null;
  if(alerte)risques.unshift(texteLisible(vm,alerte));
  const aSurveiller=risques.length?risques.slice(0,2).join(' · '):t('match_page.sig_risk_default','un seul match reste très aléatoire');
  // Page francaise (30/09) : « Le piege du match » remplace « A surveiller » : UNE vraie stat du
  // Book (vm.plus.piege, avec nombre de matchs et periode), sinon une absence reelle ; sinon rien.
  const piege=estFr()?textePiege(vm,alerte):null;
  // "Pourquoi" : 2 a 3 puces. Raisons chiffrees d'abord, puis la lecture du
  // pipeline si une place reste.
  const puces=raisons.slice(0,3);
  if(puces.length<3&&lecture)puces.push(texteLisible(vm,lecture));
  // Contre-controle ronde 4 (30/09/2026) : la frequence sur 100 matchs seulement
  // avec un pari du moteur v3 calibre (lib/match-view-model.js#frequenceCalibree) ;
  // avec l'ancien moteur, trop sur de lui, rien.
  // « Estimation statistique, pas une garantie » : UNE fois, en bas de la carte (sig-legal) ;
  // 4e relecture du 30/09 : elle etait aussi ici, deux fois dans le meme encadre.
  const plain=vm.model.frequencyCalibrated===true&&prob!==null&&implied!==null
    ?tf('match_page.sig2_plain','Sur 100 matchs comme celui-ci, notre modèle s’attend à voir ce pari passer environ {model} fois ; la cote en suppose {market}.',{model:Math.round(prob),market:Math.round(implied)}):'';
  const compare=prob===null?'':`<div class="sig2-cmp tip-host">
      <div class="sig2-cmp-head"><h3>${esc(t('match_page.sig2_compare_title','Nos chances face à la cote'))}</h3>${aide(texteAideCote(),labelAideCote())}</div>
      ${duoBars({model:prob,market:implied,odds:cote,edge,kind:'odds',seul:vm.model.positiveGapHidden===true,v3Seul:vm.model.modelOnlyV3===true,enTest:vm.model.leagueInTest===true})}
      ${plain?`<p class="sig2-plain">${esc(plain)}</p>`:''}
    </div>`;
  return `<section class="signal-card avis sig2 reveal" aria-labelledby="sigMarket">
    <div class="sig-head"><span class="sig-eyebrow">${cardIcon('target')}${esc(titre)}</span>${relBadgeVm(vm,info)}</div>
    <div class="sig-slip">
      <div class="sig-slip-main">
        <p class="sig-kicker">${esc(t('match_page.sig_bet_label','Pari recommandé'))}</p>
        <h2 class="sig-market" id="sigMarket">${esc(marcheFr(vm,r.market))}</h2>
        <p class="sig-fixture">${esc(tf('match_page.sig_match_line','{home} – {away}',{home:nomEq(vm.identity.home),away:nomEq(vm.identity.away)}))}</p>
      </div>
      ${cote!==null?`<div class="sig-odds-box"><span>${esc(t('match_page.sig_odds_used','Cote utilisée'))}</span><b>${odds(cote)}</b>${coteOrigine(vm)}</div>`:''}
    </div>
    ${compare}
    ${puces.length?`<div class="sig-why"><h3>${esc(t('match_page.sig_why_title','Pourquoi ce pari'))}</h3><ul>${puces.map(x=>`<li>${insecable(x)}</li>`).join('')}</ul></div>`:''}
    ${estFr()?(piege?`<div class="plus-piege" role="note">${cardIcon('alert')}<p><b>Le piège du match</b> ${piege}</p></div>`:'')
      :`<p class="sig-watch"><b>${esc(t('match_page.sig_watch_title','À surveiller'))}</b> ${esc(aSurveiller)}</p>`}
    ${info&&vm.model.leagueInTest!==true?`<div class="sig2-meta"><p class="sig-rel-note">${esc(relLigne(info))}</p></div>`:''}
    <p class="sig-legal">${esc(t('match_page.sig_legal','Estimation statistique, pas une garantie.'))}</p>
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
  const seul=vm.model.positiveGapHidden===true,v3Seul=vm.model.modelOnlyV3===true,enTest=vm.model.leagueInTest===true;
  const ordre=rows.filter(r=>r.recommended).map(r=>({r,g:'signal'}));
  GROUPES_MARCHES.forEach(([g])=>rows.filter(r=>!r.recommended&&r.group===g).forEach(r=>ordre.push({r,g})));
  const nomGroupe=g=>{const x=GROUPES_MARCHES.find(y=>y[0]===g);return x?t('match_page.markets_group_'+g,x[1]):'';};
  const ligne=({r})=>{
    const e=marcheValide(r.market)===null?null:n(r.edge),c=n(r.odds);
    // « Écart favorable » : jamais pour un chiffre du modele seul (voir ecart()).
    // Marche du moteur v3 pas encore verifie sur le passe : « Fiabilité faible ».
    const tags=`${r.recommended?`<span class="mk-tag mk-tag--signal">${esc(t('match_page.proba_tag_signal','Pari conseillé'))}</span>`:''}${!r.recommended&&!seul&&e!==null&&e>=3?`<span class="mk-tag mk-tag--value">${esc(t('match_page.proba_tag_favorable','Écart favorable'))}</span>`:''}${r.unverified?`<span class="mk-tag mk-tag--low">${esc(t('match_page.sig_rel_low','Fiabilité faible'))}</span>`:''}`;
    return `<li class="pr-row${r.recommended?' is-signal':''}">
      <div class="pr-head"><span class="pr-label">${esc(libelleLigne(vm,r))}</span>${tags}${c!==null?`<span class="pr-odds">${esc(t('match_page.proba_odds_short','cote'))} <b>${odds(c)}</b></span>`:''}</div>
      ${duoBars({model:r.model,market:r.market,odds:c,edge:r.edge,kind:c!==null?'odds':'consensus',compact:true,seul,v3Seul,enTest})}
    </li>`;
  };
  const liste=(part,avant)=>{let g0=avant;return part.map(x=>{const h=x.g!=='signal'&&x.g!==g0?`<li class="pr-group"><h4>${esc(nomGroupe(x.g))}</h4></li>`:'';g0=x.g;return h+ligne(x);}).join('');};
  const tete=ordre.slice(0,4),reste=ordre.slice(4);
  return `<div class="pr-legend tip-host"><span class="pr-key is-model" aria-hidden="true"></span>${esc(t('match_page.proba_model_label','Notre estimation'))}<span class="pr-key is-market" aria-hidden="true"></span>${esc(t('match_page.proba_market_label','Ce que dit la cote'))}${aide(texteAideCote(),labelAideCote())}</div>
    <ul class="pr-list">${liste(tete,null)}</ul>
    ${reste.length?repliable({label:(reste.length===1?t('match_page.proba_more_one','Voir l\'autre pari'):tf('match_page.proba_more','Voir les {n} autres paris',{n:reste.length})),labelOpen:t('match_page.proba_less','Masquer les autres paris'),body:`<ul class="pr-list">${liste(reste,tete.length?tete[tete.length-1].g:null)}</ul>`}):''}
    <p class="mk-note">${esc(t('match_page.proba_note','« Ce que dit la cote » : probabilité tirée des cotes, marge du bookmaker retirée quand les deux issues sont cotées. Écart en points de pourcentage. Estimation statistique, pas une garantie.'))}</p>`;
}

// ---------------------------------------------------------------------------
// LES STATS DU MATCH : ouvertes a tous, donnees brutes publiques uniquement
// (forme, classement, confrontations directes, comparatif, compositions
// publiees). Chaque bloc est repliable avec une ligne de resume.
// UN nom par equipe dans TOUT le corps de la page (30/09/2026, deuxieme
// relecture : stats, avis, marches, modele, FAQ) : le nom court du modele de vue
// (lib/match-view-model.js#nomCourt : « PSG »), sur ordinateur comme sur
// telephone. L'en-tete du match et le titre gardent le nom officiel complet
// (« Paris Saint-Germain », lib/match-view-model.js#nomOfficiel).
// ---------------------------------------------------------------------------
const nomEq=e=>e?(e.short||e.name||''):'';
// Nom ecrit par une source (API, pipeline : « Paris Saint Germain ») -> le nom de la page.
const memeEquipe=(e,s)=>!!e&&!!s&&(s===e.name||s===e.api||s===e.short);
const nomPage=(vm,s)=>{const i=vm.identity;return memeEquipe(i.home,s)?nomEq(i.home):memeEquipe(i.away,s)?nomEq(i.away):s;};
// BASE DES CHIFFRES (fiche interne docs/SOURCES-PAGE-MATCH.md, 30/09/2026), page francaise :
// la page dit sur quoi portent la forme, les confrontations et le comparatif. Donnees
// API-Football du calcul du matin : matchs de la competition du match (saison en cours,
// puis la precedente pour completer le comparatif) ; selections : toutes competitions.
function baseToutesComp(vm){const r=vm._raw||{};return (r.events_home&&r.events_home.scope==='all_competitions')||(r.events_away&&r.events_away.scope==='all_competitions');}
function formeFold(vm){
  const f=vm.form||{},i=vm.identity;
  const ligne=(team,rows)=>rows&&rows.length?`<div class="fh-row"><span class="fh-team">${logoEquipe(team.logo,nomEq(team))}<span>${esc(nomEq(team))}</span></span>${formStrip(rows)}<span class="fh-scores" aria-hidden="true">${rows.slice().reverse().map(r=>`<i>${esc(r.score||'')}</i>`).join('')}</span></div>`:'';
  const nb=Math.max((f.home||[]).length,(f.away||[]).length),derniers=nb>1?`Leurs ${nb} derniers matchs`:'Leur dernier match';
  const base=estFr()&&nb?`<p class="cmp-note">${insecable(baseToutesComp(vm)?derniers+' de sélection.':`${derniers} de ${nomLigue(i,vm)||'la compétition'}, saison en cours.`)}</p>`:'';
  const corps=(ligne(i.home,f.home)+ligne(i.away,f.away))||'';
  if(!corps)return '';
  const bilan=rows=>['W','D','L'].map(k=>`${rows.filter(r=>r.result===k).length} ${lettre(k)}`).join(' · ');
  // Bilan d'un seul bloc (« 0 V · 0 N · 5 D » jamais coupe avant « 5 D » sur telephone).
  const resume=[[i.home,f.home],[i.away,f.away]].filter(x=>x[1]&&x[1].length).map(([tm,rows])=>`<b>${esc(nomEq(tm))}</b> ${esc(bilan(rows)).replace(/ /g,'\u00a0')}`).join(' — ');
  return fold({key:'forme',title:t('match_page.stats_form_title','Forme récente'),icon:'trend',summary:resume,body:corps+base,open:true});
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
  // Rang 0 ou absent : jamais « 0e » dans le resume.
  const resume=lignes.filter(x=>n(x[1].rank)>0).map(([tm,s])=>`<b>${esc(nomEq(tm))}</b> ${esc(rangOrdinal(s.rank))}`).join(' · ');
  const corps=`<div class="st-scroll"><table class="st-table">
      <thead><tr><th scope="col">${esc(t('match_page.standings_col_rank','#'))}</th><th scope="col" class="st-team">${esc(t('match_page.standings_col_team','Équipe'))}</th>${COLS.map(([k,fb])=>`<th scope="col">${esc(t('match_page.standings_col_'+k,fb))}</th>`).join('')}<th scope="col">${esc(t('match_page.standings_col_gd','Diff.'))}</th><th scope="col">${esc(t('match_page.standings_col_pts','Pts'))}</th></tr></thead>
      <tbody>${lignes.map(([tm,s])=>`<tr><td>${n(s.rank)>0?v(s.rank):'—'}</td><th scope="row" class="st-team"><span>${logoEquipe(tm.logo,nomEq(tm))}${esc(nomEq(tm))}</span></th>${COLS.map(([k])=>`<td>${v(s[k])}</td>`).join('')}<td>${diff(s.gd)}</td><td class="st-pts">${v(s.pts)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${c.league_name?`<p class="st-note">${esc(nomLigue(i,vm)||c.league_name)} · ${esc(t('match_page.standings_note','classement actuel'))}</p>`:''}`;
  return fold({key:'classement',title:t('match_page.standings_title','Classement'),icon:'table',summary:resume,body:corps,open:true});
}
function h2hFold(vm){
  const h=vm.h2h||[],i=vm.identity;
  if(!h.length)return '';
  const dom=h.filter(r=>r.winner==='1').length,nul=h.filter(r=>r.winner==='N').length,ext=h.filter(r=>r.winner==='2').length,tot=dom+nul+ext||1;
  const mois=d=>{const x=new Date(String(d)+'T12:00:00Z');return isNaN(x)?String(d):x.toLocaleDateString(localeTag(),{month:'short',year:'numeric',timeZone:'UTC'});};
  const resume=esc(tf('match_page.h2h_summary','{home} {homeWins} V · {draws} N · {away} {awayWins} V',{home:nomEq(i.home),away:nomEq(i.away),homeWins:dom,draws:nul,awayWins:ext}));
  const nm=s=>nomPage(vm,s);
  const corps=`<div class="h2h">
    <div class="h2h-bar" aria-hidden="true"><i class="h" style="width:${(dom/tot*100).toFixed(1)}%"></i><i class="d" style="width:${(nul/tot*100).toFixed(1)}%"></i><i class="a" style="width:${(ext/tot*100).toFixed(1)}%"></i></div>
    <ul class="h2h-list">${h.slice(0,5).map(r=>`<li><time>${esc(mois(r.date))}</time><span class="h2h-m"><span class="${r.winner==='1'&&memeEquipe(i.home,r.home)||r.winner==='2'&&memeEquipe(i.away,r.home)?'w':''}">${esc(nm(r.home))}</span><b>${esc(r.score)}</b><span class="${r.winner==='2'&&memeEquipe(i.away,r.away)||r.winner==='1'&&memeEquipe(i.home,r.away)?'w':''}">${esc(nm(r.away))}</span></span></li>`).join('')}</ul>
  </div>`;
  const base=estFr()?`<p class="cmp-note">${insecable('Les '+Math.min(5,h.length)+' dernières confrontations connues sur les 10 dernières années, toutes compétitions.')}</p>`:'';
  return fold({key:'h2h',title:t('match_page.h2h_title','Confrontations directes'),icon:'scale',summary:resume,body:corps+base});
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
      <h4>${logoEquipe(team.logo,nomEq(team))}<span>${esc(nomEq(team))}</span>${x.formation?`<em>${esc(x.formation)}</em>`:''}</h4>
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
  return [formeFold(vm),classementFold(vm),h2hFold(vm),comparatifFold(vm),bookFold(vm),compoFold(vm)].join('');
}
// Ligne « Toutes les stats du match » du mur Pro et de l'avis ferme (relecture
// du 30/09) : EXACTEMENT les blocs que la vue complete affiche pour CE match,
// dans leur ordre. Pas de « face-a-face » sans confrontations ; pour les stats
// IASHARK, « buts par quart d'heure » seulement si le detail Pro de ce match
// les a (b.lockedParts), sinon « premier but ».
// gratuit : liste du panneau « match offert » (compte gratuit) ; jamais ce que seul un Pro
// verra (buts par quart d'heure, arbitre : detail Pro des stats IASHARK).
function statsContenu(vm,gratuit){
  const b=vm.bookStats;
  const parts=[
    formeFold(vm)?t('match_page.stats_part_form','forme'):'',
    classementFold(vm)?t('match_page.stats_part_standings','classement'):'',
    h2hFold(vm)?t('match_page.stats_part_h2h','confrontations directes'):'',
    comparatifFold(vm)?t('match_page.stats_part_comparison','comparatif'):'',
    b?(!gratuit&&Array.isArray(b.lockedParts)&&b.lockedParts.includes('quarts')?t('match_page.stats_part_slots','buts par quart d’heure'):t('match_page.stats_part_first','premier but')):'',
    !gratuit&&b&&Array.isArray(b.lockedParts)&&b.lockedParts.includes('arbitre')?t('match_page.stats_part_ref','arbitre'):'',
    compoFold(vm)?t('match_page.stats_part_lineups','compositions'):''
  ].filter(Boolean);
  return parts.length?tf('match_page.pro_gate_item_stats_list','Toutes les stats du match : {list}',{list:parts.join(', ')}):t('match_page.pro_gate_item_stats_plain','Toutes les stats du match');
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
          <small>${esc(nomPage(vm,p.team||''))}${p.position?' · '+esc(poste(p.position)):''}</small>
        </div>
      </div>
      ${prob===null?'':`<div class="threat-prob">
        <div class="threat-prob-tete"><span>${esc(t('match_page.scoring_probability_label','Probabilité de marquer'))}</span><b>${pct(prob,0)}</b></div>
        <div class="threat-jauge" role="img" aria-label="${esc(t('match_page.scoring_probability_label','Probabilité de marquer'))} : ${pct(prob,0)}"><i style="width:${largeur}%"></i></div>
      </div>`}
      ${stats.length?`<div class="threat-panneau">${stats.map(([v,k])=>`<div><b>${v}</b><span>${esc(k)}</span></div>`).join('')}</div>`:''}
      <div class="threat-pied">
        ${sample?`<span class="threat-sample${p.thinSample?' is-thin':''}">${esc(sample)}</span>`:'<span></span>'}
        ${pid!==null?`<span class="threat-lien">${esc(t('match_page.view_profile_link','Voir la fiche'))} <i aria-hidden="true">→</i></span>`:''}
      </div>
      ${p.thinSample?`<p class="threat-alerte">${esc(t('match_page.thin_sample_alert','Temps de jeu limité sur ce championnat : ces moyennes par 90 minutes reposent sur peu de minutes et restent fragiles.'))}</p>`:''}
    </${tag}>`;
    const autres=list.slice(1,4).filter(x=>n(x.scoringProbability)!==null);
    if(autres.length)corps+=`<ul class="pm-list">${autres.map(x=>`<li><span>${esc(buteur(x.name))}<small>${esc(nomPage(vm,x.team||''))}</small></span><b>${pct(x.scoringProbability,0)}</b></li>`).join('')}</ul>`;
  }
  if(projections.length){
    const ml=window.IasharkMarketLabels;
    corps+=`<ul class="pm-list">${projections.slice(0,6).map(x=>{
      const code=CODES_JOUEUR[x.market];
      const label=code&&ml&&ml.playerMarketLabelFor?ml.playerMarketLabelFor(code,x.player):`${x.player} · ${x.market}`;
      return `<li><span>${esc(label)}</span><b>${pct1(x.probability)}</b></li>`;
    }).join('')}</ul>`;
  }
  corps+=`<p class="pm-note">${esc(t('match_page.players_note','Calcul buteur du moteur IASHARK : chance de marquer à n’importe quel moment, arrondie vers le bas à 5 points, 45 % au plus. Estimée avant les compositions officielles, titulaires probables seulement.'))}</p>`;
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
  return tf('match_page.absence_alert_'+ALERTES_ABSENCE[m[1]],'{player} ({team})',{player:m[2],team:m[3]==='DOM'?nomEq(vm.identity.home):nomEq(vm.identity.away)});
}

// Sorties modele : buts attendus et scores exacts les plus probables, ecrits
// comme au bookmaker ("Score exact : 1-1").
function outputsCard(vm,opts){
  const x=vm.model.expectedGoals,s=vm.model.scores,i=vm.identity;
  // Seules les colonnes qui ont du contenu ; ce qui manque est dit en une
  // ligne discrete. Si TOUT manque, la carte disparait.
  const cols=[],manquant=[];
  if(x){
    cols.push(`<div class="outputs-col outputs-xg"><small>${esc(t('match_page.stat_expected_goals','Buts attendus'))} (xG)</small><div class="xg-row">${img(i.home.logo,'',26,26)}<b>${fmtButs(x.home)}</b><span>${esc(nomEq(i.home))} – ${esc(nomEq(i.away))}</span><b>${fmtButs(x.away)}</b>${img(i.away.logo,'',26,26)}</div></div>`);
  } else manquant.push(t('match_page.xg_unavailable','xG indisponibles'));
  if(s.length){
    const ml=window.IasharkMarketLabels;
    const maxP=Math.max.apply(null,s.map(sc=>Number(sc.probability)||0))||1;
    // « Le score audacieux » (Pro, page francaise, 30/09/2026) : le plus probable des scores a
    // 4 buts ou plus (moteur v3, lib/match-view-model.js#scoreAudacieux). Verdict du
    // mathematicien (ORANGE, 30/09/2026) : sa frequence n'est pas verifiee sur des matchs
    // jamais vus -> plus de « avec sa vraie chance », marque « pas encore vérifié ».
    const au=VUE_PRO&&estFr()?vm.model.boldScore:null;
    const audace=au&&!s.some(sc=>String(sc.score||'').replace(/\s*-\s*/,'-')===au.score)
      ?`<div class="score-bar score-bold"><b>${esc(au.score)}</b><i><span style="width:${clamp(au.probability/maxP*100)}%"></span></i><small>${au.probability<1?'moins de 1\u00a0%':pct(au.probability,0)}</small><em class="score-bold-tag">audacieux</em></div><p class="score-bold-note">${insecable('Le score à 4 buts ou plus le plus probable. Pas encore vérifié.')}</p>`:'';
    cols.push(`<div class="outputs-col"><small>${esc(t('match_page.scores_title','Scores les plus probables'))}</small><div class="score-bars">${s.map(sc=>`<div class="score-bar"><b>${esc(String(sc.score||'').replace(/\s*-\s*/,'-'))}</b><i><span style="width:${clamp(Number(sc.probability)/maxP*100)}%"></span></i><small>${pct(sc.probability,0)}</small></div>`).join('')}${audace}</div></div>`);
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
  // Un seul nom par equipe sur la page : « Paris Saint Germain » (API) -> « PSG ».
  [vm.identity.home,vm.identity.away].forEach(function(e){
    [e.api,e.name].filter(function(x,k,a){return x&&x!==nomEq(e)&&a.indexOf(x)===k;}).sort(function(a,b){return b.length-a.length;}).forEach(function(x){s=s.split(x).join(nomEq(e));});
  });
  if(/^fr/i.test(localeTag()))s=s.replace(/(\d)\s?%/g,'$1\u00a0%');
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
  const dom=nomEq(vm.identity.home),ext=nomEq(vm.identity.away);
  // Une decimale sur les moyennes, aucune sur les pourcentages.
  const un=(v,unite)=>Number(v).toLocaleString(localeTag(),
    unite==='%'?{maximumFractionDigits:0}:{minimumFractionDigits:1,maximumFractionDigits:1});
  // 4e relecture du 30/09 : un pourcentage s'ecrit comme partout sur la page (« 69 % », format
  // de la langue) ; l'ecart entre deux pourcentages est en points. 5e relecture : « points » en
  // toutes lettres, comme l'avis (« +6 points ») ; « pts » reste celui du classement (« 5 pts »).
  const valeur=(v,unite)=>unite==='%'?pct(v,0):un(v,unite);
  const ecartHtml=(v,unite)=>{
    if(unite!=='%')return esc(un(v,unite));
    const r=Math.round(Math.abs(v));
    return `${esc(un(v,unite))}<small class="cmp-u">\u00a0${esc(r===1?t('match_page.proba_point_one','point'):t('match_page.proba_point_other','points'))}</small>`;
  };
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
      const valeurEcart=Math.abs(ecart)<0.001?'—':signe+ecartHtml(Math.abs(ecart),unite);
      // Barres comparees (« Paired Bars » de 21st.dev, 30/09) : sous chaque chiffre, sa barre a
      // l'echelle du plus grand des deux (domicile cyan, exterieur gris), decorative.
      // Un pourcentage (possession) sur l'echelle 0-100 %, sinon a l'echelle du plus grand des deux.
      const haut=unite==='%'?100:Math.max(Math.abs(r.home),Math.abs(r.away),0.0001);
      const barre2=(v,cote)=>`<span class="sbk-bar cmp-bar is-${cote}" aria-hidden="true"><i class="sbk-p" style="width:${sbkPc(Math.abs(v)/haut)}"></i></span>`;
      lignes.push(`<tr>
        <th scope="row">${esc(cmpLabel(r.label))}</th>
        <td class="${devant==='dom'?'gagne':''}">${esc(valeur(r.home,unite))}${barre2(r.home,'home')}</td>
        <td class="${devant==='ext'?'gagne':''}">${esc(valeur(r.away,unite))}${barre2(r.away,'away')}</td>
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
    // 5e relecture du 30/09 : « devant sur les 7 mesures », jamais « sur 7 des 7 ».
    conclusion=meneur&&compte===total
      ? `<b>${esc(meneur)}</b>${esc(t('match_page.comparison_leads_all',' est devant sur les '))}${total}${esc(t('match_page.comparison_leads_suffix',' mesures comparables.'))}`
      : meneur
      ? `<b>${esc(meneur)}</b>${esc(t('match_page.comparison_leads_middle',' est devant sur '))}${compte}${esc(t('match_page.comparison_leads_of',' des '))}${total}${esc(t('match_page.comparison_leads_suffix',' mesures comparables.'))}`
      : `${esc(t('match_page.comparison_tie_prefix','Les deux équipes se partagent les '))}${total}${esc(t('match_page.comparison_leads_suffix',' mesures comparables.'))}`;
  }
  // « Sur leurs N derniers matchs » : a ne pas confondre avec la saison en cours
  // (fiabilite de l'avis) ni avec les 2 ans des stats IASHARK (relecture du 30/09).
  // Page francaise : la vraie base de chaque ligne (les buts portent sur les matchs comptes par
  // le calcul du matin, jusqu'a 20 ; tirs, possession, corners, fautes, hors-jeu et arrets sur
  // les 10 premiers d'entre eux au plus) : une seule phrase « sur N matchs » etait fausse.
  const comp=baseToutesComp(vm)?'toutes compétitions':`${nomLigue(vm.identity,vm)||'la compétition'}, cette saison puis la précédente`;
  const note=estFr()&&n(c.sampleSize)!==null
    ? `Buts marqués et concédés : moyennes sur leurs ${c.sampleSize} derniers matchs (${comp}). Tirs, possession, corners, fautes, hors-jeu et arrêts : sur leurs 10 derniers matchs au plus.`
    // Autres langues (controle du 30/09/2026) : meme base que la page francaise,
    // les buts sur N matchs, les autres lignes sur 10 matchs au plus.
    : n(c.sampleSize)!==null
    ? `${c.sampleSize>1?tf('match_page.comparison_note_last','Buts marqués et concédés : moyennes sur leurs {n} derniers matchs',{n:c.sampleSize}):t('match_page.comparison_note_last_one','Buts marqués et concédés : sur leur dernier match')}${c.sampleSize<5?t('match_page.comparison_note_thin_sample_suffix',' — échantillon encore court'):''}. ${t('match_page.comparison_note_other_stats','Tirs, possession, corners, fautes, hors-jeu et arrêts : sur leurs 10 derniers matchs au plus.')}`
    : t('match_page.comparison_note_simple','Moyennes par match.');
  const table=`<div class="cmp-scroll"><table class="cmp-table">
      <thead><tr>
        <th scope="col">${esc(t('match_page.comparison_table_header','Par match'))}</th>
        <th scope="col"><span class="cmp-eq">${logoEquipe(vm.identity.home.logo,dom)}<span>${esc(dom)}</span></span></th>
        <th scope="col"><span class="cmp-eq">${logoEquipe(vm.identity.away.logo,ext)}<span>${esc(ext)}</span></span></th>
        <th scope="col">${esc(t('match_page.comparison_gap_header','Écart'))}</th>
      </tr></thead>
      <tbody>${lignes.join('')}</tbody>
    </table></div>
    <p class="cmp-note">${insecable(note+' '+t('match_page.comparison_note_disclaimer','Hors-jeu et arrêts sont donnés sans verdict : plus d’arrêts signifie surtout plus de tirs subis.'))}</p>`;
  return {table,conclusion};
}

// ---------------------------------------------------------------------------
// STATS IASHARK (Book, 30/09/2026). Reprise du 30/09 apres retour de Clement :
// la page garde EXACTEMENT sa structure (sommaire, ordre, vue visiteur). Les
// stats du Book sont UNE carte repliable de plus dans « Les stats du match »
// (statsBlocs), au format des autres : composant fold, tableaux .cmp-table du
// Comparatif, notes .cmp-note, sous-titres .sim-sub. vm.bookStats vient de
// lib/match-view-model.js#bookStats (profils calcules par export_stats_book.py).
//  - EN AVANT (toute vue qui montre les stats) : la part des matchs ou chaque
//    equipe a ouvert le score et, pour la ligue, au moins un but apres la 75e.
//    Pour un Pro s'y ajoutent premier but encaisse et 0-0.
//  - REPLIE, PRO SEULEMENT (« Voir tout le detail ») : buts par quart d'heure,
//    apres la pause (bascule tous les matchs / domicile-exterieur), arbitre,
//    profil de la ligue. Sans Pro, le detail n'arrive jamais au navigateur
//    (match-data, fichiers publics sans stats_iashark) : une ligne « Reserve aux
//    abonnes Pro » qui ne cite QUE les rubriques que ce match a vraiment
//    (b.lockedParts, stats_iashark_gratuit.detail_pro).
// Deuxieme relecture visuelle du 30/09 :
//  - plus de tableau « Par match » : buts marques / encaisses et corners sont
//    dans le Comparatif (une seule source, une seule periode : jamais deux
//    chiffres differents pour la meme chose dans deux cartes voisines) ;
//  - la date des donnees est dans le resume de la carte (« matchs joues
//    jusqu'au ... », la veille du calcul) ; au-dela de 14 jours de retard, pas
//    de carte (lib/match-view-model.js#bookAssezFrais) ;
//  - une seule notation de marge, partout : « (62 à 83 %) », « (0,21 à 0,47) »,
//    memes decimales que le chiffre, jamais coupee en fin de ligne ;
//  - un seul nom par equipe dans les stats (nom court : « PSG ») ;
//  - la meme grille de colonnes que le Comparatif pour les tableaux a deux
//    valeurs (premier but, arbitre) et l'apres-pause (trois valeurs).
// Chaque chiffre porte son nombre de matchs, sa periode, son championnat (un
// profil d'equipe ne compte que les matchs d'un championnat) et sa marge a
// 95 %. Ni vert ni rouge, ni gras « gagnant » : aucun chiffre n'est « bon » ou
// « mauvais ». Un ecart d'arbitre n'est souligne (cyan) que s'il sort de la
// marge. Jamais « cette equipe marque tard » : sur 15 minutes, les ecarts entre
// equipes sont surtout du hasard (RAPPORT-SIMULATION), la ligne de la ligue
// sert de repere et la page le dit. Aucune donnee : aucune carte.
// ---------------------------------------------------------------------------
const SBK_TRANCHES=['1-15','16-30','31-45+','46-60','61-75','76-90+'];
// Annees de la periode (« 2024-2026 ») ; le WORD JOINER (U+2060) interdit la coupure « 2024- / 2026 ».
const sbkAnnees=(d,f)=>{const a=String(d||'').slice(0,4),b=String(f||'').slice(0,4);return a&&b?(a===b?a:`${a}-\u2060${b}`):'';};
// comp : championnat du profil d'equipe ({name} ou {nat:true}) ; absent pour une ligue ou un arbitre.
const sbkEchantillon=(nb,d,f,comp)=>comp&&comp.nat?tf('stats_iashark.sample_nat','sur {n} matchs officiels de sélection, {period}',{n:fmt(nb,0),period:sbkAnnees(d,f)})
  :comp&&comp.name?tf('stats_iashark.sample_comp','sur {n} matchs de {comp}, {period}',{n:fmt(nb,0),comp:comp.name,period:sbkAnnees(d,f)})
  :tf('stats_iashark.sample','sur {n} matchs, {period}',{n:fmt(nb,0),period:sbkAnnees(d,f)});
const sbkCompAnnees=(comp,d,f)=>tf('stats_iashark.comp_period','{comp}, {period}',{comp:comp&&comp.name?comp.name:t('stats_iashark.comp_nat','matchs officiels de sélection'),period:sbkAnnees(d,f)});
const sbkPart=v=>pct(n(v)===null?null:Number(v)*100,0);
// Decimales fixes (2,0 et non 2 ; 0,20 et non 0,2) : les colonnes se lisent d'un coup d'oeil.
const sbkFixe=(v,d)=>n(v)===null?'—':Number(v).toLocaleString(localeTag(),{minimumFractionDigits:d,maximumFractionDigits:d});
// Moyenne : 2 decimales sous 1 (0,28), 1 au-dessus (2,8). Sa marge prend les memes.
const sbkDec=v=>n(v)!==null&&Math.abs(v)<1?2:1;
const sbkMoy=v=>sbkFixe(v,sbkDec(v));
// LA notation de marge (une seule sur la carte) : « (62 à 83 %) », « (0,8 à 1,2) »,
// « (0,21 à 0,47) ». Espaces insecables : jamais coupee en fin de ligne.
const sbkEntre=(iv,part)=>{
  const d=sbkDec(iv.p),lo=part?fmt(Number(iv.lo)*100,0):sbkFixe(iv.lo,d),hi=part?sbkPart(iv.hi):sbkFixe(iv.hi,d);
  return tf('stats_iashark.range','({lo} à {hi})',{lo,hi}).replace(/ /g,'\u00a0');
};
// « Ligue 1 », « 2. Bundesliga » : jamais coupe entre le mot et son chiffre (4e relecture du 30/09).
// Pas de « lookbehind » (?<=...) : un vieux Safari refuserait tout le fichier.
function sbkNomLigue(vm){return String(nomLigue(vm.identity,vm)).replace(/(\d\.?) /g,'$1\u00a0').replace(/ (?=\d)/g,'\u00a0');}
// Les deux derniers mots d'un libelle court restent sur la meme ligne (dernier mot de 4 lettres au plus).
const sansVeuve=s=>String(s).replace(/ (\S{1,4})$/,'\u00a0$1');
// Phrase qui commence par l'echantillon (« sur 85 matchs... ») : majuscule initiale.
const sbkMaj=s=>String(s).charAt(0).toUpperCase()+String(s).slice(1);
// VISUELS DES STATS (30/09/2026, demande de Clement : composants de 21st.dev refaits sans
// React, aux couleurs et dans le format de la page ; la mise en page validee ne bouge pas).
// Tout visuel est decoratif (aria-hidden) : le chiffre et sa marge restent ecrits, en texte.
//  - « Paired Bars » / « Leaderboard Bars » (eugeneshilow) : barre de la part sur une echelle
//    0-100 %, la marge en trait fin a moustaches ; domicile cyan, exterieur gris (Comparatif).
//  - « Heat Strip » (eugeneshilow) : fond des cases des quarts d'heure, plus soutenu quand le
//    chiffre est plus haut ; une seule teinte (gris pour la ligne de la ligue), jamais vert ni rouge.
//  - « Meter » (hero_ui) : jauge de l'arbitre, sa moyenne (point), sa marge (trait fin) et
//    l'attendu (trait blanc).
//  - « Count Up » (unlumen) : chiffres-cles animes, voir sbkCompteurs.
const sbkPc=v=>Math.max(0,Math.min(100,Number(v)*100)).toFixed(1)+'%';
const sbkBarre=(iv,cote)=>`<span class="sbk-bar is-${cote==='away'?'away':'home'}" aria-hidden="true"><i class="sbk-p" style="width:${sbkPc(iv.p)}"></i><i class="sbk-m" style="left:${sbkPc(iv.lo)};width:${sbkPc(Math.max(0,iv.hi-iv.lo))}"></i></span>`;
function sbkMetre(iv,attendu){
  const S=(Math.max(Number(iv.hi)||0,Number(attendu)||0)*1.15)||1,pos=v=>sbkPc(Math.max(0,Number(v))/S);
  return `<span class="sbk-metre" aria-hidden="true"><i class="sbk-m" style="left:${pos(iv.lo)};width:${sbkPc(Math.max(0,iv.hi-iv.lo)/S)}"></i><i class="sbk-v" style="left:${pos(iv.p)}"></i><i class="sbk-a" style="left:${pos(attendu)}"></i></span>`;
}
// Chiffre-cle : son texte exact, et de quoi l'animer (data-cu : valeur, data-cu-f : « p » pour une
// part, sinon le nombre de decimales).
const sbkNum=(v,part)=>`<b data-cu="${Number(v)}" data-cu-f="${part?'p':sbkDec(v)}">${esc(part?sbkPart(v):sbkMoy(v))}</b>`;
// Cellule chiffree : le chiffre, son visuel, sa marge dessous. Donnee absente : « — », jamais 0.
// o.cote : barre de la part ; o.metre : attendu de l'arbitre ; o.chaleur : 0 a 1 (quarts d'heure).
const sbkCase=(iv,part,o)=>{
  if(!iv)return '<td class="sbk-na">—</td>';
  const x=o||{},vis=x.metre!=null?sbkMetre(iv,x.metre):part&&x.cote?sbkBarre(iv,x.cote):'';
  const td=x.chaleur!=null?`<td class="sbk-heat${x.repere?' is-ref':''}" style="--h:${Math.max(0,Math.min(1,x.chaleur)).toFixed(2)}">`:'<td>';
  return `${td}${sbkNum(iv.p,part)}${vis}<small>${esc(sbkEntre(iv,part))}</small></td>`;
};
// Colonne vide a la place de « Ecart » : memes colonnes que le Comparatif (ordinateur).
const SBK_VIDE='<td class="sbk-x" aria-hidden="true"></td>';
// Tableau au format du Comparatif ; le titre est la legende du tableau.
const sbkTable=(titre,tete,corps,cls)=>`<div class="cmp-scroll"><table class="cmp-table sbk-table${cls?' '+cls:''}">${titre?`<caption class="sim-sub">${esc(titre)}</caption>`:''}${tete}${corps}</table></div>`;
// En-tete : une colonne par equipe, logo et nom court (comme le Comparatif).
const sbkTete=(vm,premiere)=>`<thead><tr><th scope="col">${esc(premiere||'')}</th>${[vm.identity.home,vm.identity.away].map(e=>`<th scope="col"><span class="cmp-eq">${logoEquipe(e.logo,nomEq(e))}<span>${esc(nomEq(e))}</span></span></th>`).join('')}${SBK_VIDE}</tr></thead>`;
// Ligne de groupe (equipe, arbitre...) : un <tbody> par groupe, en-tete scope="rowgroup".
const sbkGroupe=(txt,cols,petit)=>`<tr class="cmp-groupe"><th scope="rowgroup" colspan="${cols}">${esc(txt)}${petit?` <small>${esc(petit)}</small>`:''}</th></tr>`;
// Echantillons des deux equipes : une seule mention quand ils sont identiques
// (meme nombre de matchs, meme championnat, memes saisons).
function sbkEchs(vm,a,b,ca,cb){
  const id=vm.identity;
  if(a&&b&&a.n===b.n&&sbkAnnees(a.debut,a.fin)===sbkAnnees(b.debut,b.fin)&&ca&&cb&&!ca.nat&&!cb.nat&&ca.name&&ca.name===cb.name)
    return sbkMaj(tf('stats_iashark.sample_each','{n} matchs de {comp} par équipe, {period}',{n:fmt(a.n,0),comp:ca.name,period:sbkAnnees(a.debut,a.fin)}));
  // Un nom court d'equipe ne se coupe pas (« Los / Chankas »).
  const bloc=x=>x.length<=16?x.replace(/ /g,'\u00a0'):x;
  return [[id.home,a,ca],[id.away,b,cb]].filter(([,x])=>x).map(([e,x,c])=>`${bloc(nomEq(e))} : ${sbkEchantillon(x.n,x.debut,x.fin,c)}`).join(' · ');
}

// EN AVANT 1 : le premier but, les deux equipes cote a cote. En-tete « Part
// des matchs » toujours, meme avec une seule ligne (vue gratuite, relecture du
// 30/09 : sans lui, « 76 % » n'etait rattache a rien).
function sbkPremierBut(vm,b){
  const f=b.firstGoal;
  if(!f)return '';
  const eq=[f.home,f.away];
  const LIGNES=[['first_scored','A ouvert le score',x=>x.scores],['first_conceded','A encaissé le premier but',x=>x.concedes],['first_none','Aucun but (0-0)',x=>x.none]].filter(([,,get])=>eq.some(x=>x&&get(x)));
  // Jamais un mot seul sur la derniere ligne du libelle (« A encaissé le premier / but ») : les deux
  // derniers mots restent ensemble.
  const lignes=LIGNES.map(([cle,fb,get])=>`<tr><th scope="row">${esc(sansVeuve(t('stats_iashark.'+cle,fb)))}</th>${eq.map((x,i)=>sbkCase(x&&get(x),true,{cote:i?'away':'home'})).join('')}${SBK_VIDE}</tr>`).join('');
  const unite=t('stats_iashark.first_unit','Part des matchs');
  const echs=sbkEchs(vm,f.home,f.away,f.home&&f.home.comp,f.away&&f.away.comp);
  return `${sbkTable(t('stats_iashark.first_title','Le premier but dans leurs matchs passés'),sbkTete(vm,unite),`<tbody>${lignes}</tbody>`,'sbk-duo')}
    <p class="cmp-note">${insecable(echs+'. '+t('stats_iashark.first_sub','Leur passé : ce n’est pas la chance de marquer en premier dans ce match.'))}</p>`;
}
// EN AVANT 2 : repere de la ligue, une phrase.
function sbkApres75(vm,b){
  const l=b.leagueLate;
  if(!l)return '';
  return `<p class="cmp-conclusion">${sbkNum(l.p.p,true)} ${esc(tf('stats_iashark.late_line','des matchs de {league} ont eu au moins un but après la 75e minute {range}, {sample}.',{league:sbkNomLigue(vm),range:sbkEntre(l.p,true),sample:sbkEchantillon(l.n,l.debut,l.fin)})).replace(/ \(/,'\u00a0(')}</p>`;
}
// Ecart de l'arbitre, ecrit seulement quand l'attendu sort de la marge.
function sbkVerdict(x){
  return tf(x.gap.p>0?'stats_iashark.ref_more':'stats_iashark.ref_less',x.gap.p>0?'{v} de plus que l’attendu':'{v} de moins que l’attendu',{v:sbkMoy(Math.abs(x.gap.p))});
}

// DETAIL PRO 1 : buts par quart d'heure. Un <tbody> par equipe (en-tete
// scope="rowgroup" : le lecteur d'ecran annonce l'equipe sur « Marques /
// Encaisses ») ; sous chaque chiffre, sa marge (meme notation que partout).
// Ordinateur : un tableau de 6 colonnes. Telephone : deux tableaux de 3
// colonnes (1re et 2e mi-temps), pour des chiffres et des marges lisibles.
function sbkQuarts(vm,b,vue){
  const id=vm.identity,T=b.teams||{},lg=b.league;
  const equipes=[['home',id.home],['away',id.away]].map(([c,e])=>{const p=T[c]&&T[c][vue];return p&&p.slots?{c,e,p,comp:T[c].comp}:null;}).filter(Boolean);
  if(!equipes.length)return '';
  // Repere : buts d'UNE equipe de la ligue (les buts du match divises par deux).
  const ref=lg&&lg.slots?lg.slots.goals.map(v=>({p:v.p/2,lo:v.lo/2,hi:v.hi/2})):null;
  const nom=(c,e)=>vue==='venue'?tf(c==='home'?'stats_iashark.team_home':'stats_iashark.team_away',c==='home'?'{team} à domicile':'{team} à l’extérieur',{team:nomEq(e)}):nomEq(e);
  // Carte de chaleur : UNE echelle pour tout le tableau (les deux equipes et le repere), proportionnelle
  // au chiffre (0,30 but est deux fois plus soutenu que 0,15) : jamais un ecart grossi.
  const haut=Math.max(0.0001,...equipes.flatMap(({p})=>p.slots.for.concat(p.slots.against)).concat(ref||[]).map(v=>v?Number(v.p):0).filter(Number.isFinite));
  // cols : tranches montrees ; ech : echantillon ecrit sur la ligne de groupe (premier tableau seulement).
  const tableau=(cols,titre,premiere,ech)=>{
    const nb=cols.length+1,ligne=(a,repere)=>cols.map(i=>sbkCase(a[i],false,{chaleur:a[i]?a[i].p/haut:0,repere})).join('');
    const groupes=equipes.map(({c,e,p,comp})=>`<tbody class="sbk-q-team is-${c}">
      ${sbkGroupe(nom(c,e),nb,ech?sbkEchantillon(p.slots.n,p.debut,p.fin,comp):'')}
      <tr><th scope="row">${esc(t('stats_iashark.slots_scored','Marqués'))}</th>${ligne(p.slots.for)}</tr>
      <tr><th scope="row">${esc(t('stats_iashark.slots_conceded','Encaissés'))}</th>${ligne(p.slots.against)}</tr>
    </tbody>`);
    if(ref)groupes.push(`<tbody class="sbk-q-ref">
      ${sbkGroupe(tf('stats_iashark.slots_league','Repère : une équipe de {league}',{league:sbkNomLigue(vm)}),nb,ech?sbkEchantillon(lg.slots.n,lg.debut,lg.fin):'')}
      <tr><th scope="row">${esc(t('stats_iashark.slots_avg','Moyenne'))}</th>${ligne(ref,true)}</tr>
    </tbody>`);
    const tete=`<thead><tr><th scope="col">${esc(premiere)}</th>${cols.map(i=>`<th scope="col">${esc(SBK_TRANCHES[i])}</th>`).join('')}</tr></thead>`;
    return sbkTable(titre,tete,groupes.join(''),'sbk-quarts');
  };
  const titre=t('stats_iashark.slots_title','Buts par quart d’heure');
  return `<div class="sbk-q-large">${tableau([0,1,2,3,4,5],titre,t('stats_iashark.league_goals','Buts par match'),true)}</div>
    <div class="sbk-q-small">${tableau([0,1,2],titre,t('stats_iashark.slots_half1','1re mi-temps'),true)}${tableau([3,4,5],'',t('stats_iashark.slots_half2','2e mi-temps'),false)}</div>
    <p class="cmp-note">${insecable(t('stats_iashark.slots_caption','Buts par match dans chaque quart d’heure.')+' '+t('stats_iashark.slots_note','Sur 15 minutes, les écarts entre deux équipes viennent surtout du hasard : la ligne de la ligue sert de repère.'))}</p>`;
}
// DETAIL PRO 2 : apres la pause. Victoire / nul / defaite selon le score a la
// mi-temps (parts du meme echantillon, total 100 %). Une seule ligne en tout
// (une equipe, un cas) : une phrase, pas un tableau a moitie vide.
function sbkPause(vm,b,vue){
  const id=vm.identity,T=b.teams||{};
  const CAS=[['leading','ht_leading','Elle mène'],['level','ht_level','À égalité'],['trailing','ht_trailing','Elle est menée']];
  const PHRASE={leading:['ht_case_leading','Quand {team} mène à la pause'],level:['ht_case_level','Quand {team} est à égalité à la pause'],trailing:['ht_case_trailing','Quand {team} est derrière à la pause']};
  const lignes=[];
  [['home',id.home],['away',id.away]].forEach(([c,e])=>{
    const p=T[c]&&T[c][vue],ht=p&&p.halfTime;
    if(ht)CAS.filter(([k])=>ht[k]).forEach(x=>lignes.push({c,e,p,g:ht[x[0]],cas:x}));
  });
  if(!lignes.length)return '';
  const titre=`<p class="sim-sub">${esc(t('stats_iashark.ht_title','Après la pause'))}</p>`;
  if(lignes.length===1){
    const {c,e,p,g,cas}=lignes[0],[cle,fb]=PHRASE[cas[0]];
    const v=iv=>iv?`${sbkPart(iv.p)}\u00a0${sbkEntre(iv,true)}`:'—';
    const vals=[v(g.win),v(g.draw),v(g.loss)];
    // « nul 3 % (1 à 15 %) » d'un seul bloc : le mot, le chiffre et sa marge ne se separent pas.
    let phrase=tf('stats_iashark.ht_line','{case}, sur {n} matchs ({comp}) : victoire {win}, nul {draw}, défaite {loss}.',{case:tf('stats_iashark.'+cle,fb,{team:nomEq(e)}),n:fmt(g.n,0),comp:sbkCompAnnees(T[c].comp,p.debut,p.fin),win:vals[0],draw:vals[1],loss:vals[2]});
    vals.forEach(x=>{phrase=phrase.split(' '+x).join('\u00a0'+x);});
    return `${titre}<p class="sbk-phrase">${esc(phrase)}</p>`;
  }
  const groupes=[['home',id.home],['away',id.away]].map(([c,e])=>{
    const rangs=lignes.filter(x=>x.c===c).map(({g,cas:[,cle,fb]})=>`<tr><th scope="row">${esc(t('stats_iashark.'+cle,fb))} <small>${esc(tf('stats_iashark.sample_short','sur {n} matchs',{n:fmt(g.n,0)}))}</small></th>${sbkCase(g.win,true,{cote:c})}${sbkCase(g.draw,true,{cote:c})}${sbkCase(g.loss,true,{cote:c})}</tr>`).join('');
    return rangs?`<tbody>${sbkGroupe(nomEq(e),4,sbkCompAnnees(T[c].comp,T[c][vue].debut,T[c][vue].fin))}${rangs}</tbody>`:'';
  }).filter(Boolean);
  const tete=`<thead><tr><th scope="col">${esc(t('stats_iashark.ht_unit','Score à la pause'))}</th>${[['ht_win','Victoire'],['ht_draw','Nul'],['ht_loss','Défaite']].map(([k,fb])=>`<th scope="col">${esc(t('stats_iashark.'+k,fb))}</th>`).join('')}</tr></thead>`;
  return `${titre}${sbkTable('',tete,groupes.join(''),'sbk-trio')}
    <p class="cmp-note">${esc(t('stats_iashark.ht_sub','Ce que l’équipe a fait de ses matchs, selon le score à la mi-temps'))}.</p>`;
}
// DETAIL PRO 3 : l'arbitre face a l'attendu pour ses matchs (moyenne de la
// competition et de la saison de chacun de ses matchs, toutes competitions du site,
// sur 3 ans). 4e relecture du 30/09 : la colonne ne s'appelle plus « Moyenne de la
// ligue » (4,2 cartons en face du 4,0 du profil de la ligue, qui ne compte que 2 ans
// du championnat) ; la note dit les deux periodes. Meme grille que les autres tableaux a deux
// valeurs ; l'ecart n'est ecrit que s'il sort de la marge, « conforme » une
// seule fois sous le tableau. Le nom vient de la fiche officielle du match
// (API) : sans arbitre designe, pas de rubrique.
function sbkArbitre(vm,b){
  const a=b.referee;
  if(!a||!a.name)return '';
  const LIGNES=[['cards','ref_cards','Cartons par match'],['reds','ref_reds','Cartons rouges par match'],['penalties','ref_pens','Penaltys par match']].filter(([k])=>a[k]);
  if(!LIGNES.length)return '';
  const rangs=LIGNES.map(([k,cle,fb])=>{
    const x=a[k];
    return `<tr><th scope="row">${esc(t('stats_iashark.'+cle,fb))}</th>${sbkCase(x.m,false,{metre:x.expected})}<td>${sbkNum(x.expected,false)}${x.clear?`<small class="sbk-clear">${esc(sbkVerdict(x))}</small>`:''}</td>${SBK_VIDE}</tr>`;
  }).join('');
  const ecarts=LIGNES.filter(([k])=>a[k].clear).length;
  const conforme=ecarts===LIGNES.length?'':ecarts?t('stats_iashark.ref_ok_rest','Le reste est conforme à l’attendu.'):t('stats_iashark.ref_ok_all','Conforme à l’attendu : aucun chiffre ne sort de la marge.');
  // 5e relecture du 30/09 : « toutes compétitions » vaut pour LES DEUX colonnes (ses matchs et
  // l'attendu) : une ligne de groupe au-dessus des chiffres, « Toutes compétitions · sur 65 matchs,
  // 2023-2026 », comme les equipes des quarts d'heure ; l'en-tete reste court sur telephone.
  const tete=`<thead><tr><th scope="col"></th><th scope="col">${esc(t('stats_iashark.ref_col_with','Ses matchs'))}</th><th scope="col">${esc(t('stats_iashark.ref_col_league','Attendu pour ses matchs'))}</th>${SBK_VIDE}</tr></thead>`;
  // colspan 3 : la colonne vide (sbk-x) est masquee sur telephone ; 4 y creerait une colonne fantome.
  const groupeArb=sbkGroupe(t('stats_iashark.ref_all_comp','Toutes compétitions'),3,sbkEchantillon(a.n,a.debut,a.fin));
  // La raison des 3 ans suit directement la definition de l'attendu ; puis la legende de la jauge.
  const note=tf('stats_iashark.ref_note','« Attendu pour ses matchs » : la moyenne de chaque compétition et saison où il a arbitré, coupes d’Europe et sélections comprises. Un arbitre dirige moins de matchs qu’une équipe n’en joue : il est suivi sur 3 ans. Le profil de la ligue, plus bas, compte 2 ans de {league} seulement : les deux chiffres peuvent différer.',{league:sbkNomLigue(vm)});
  return `${sbkTable(`${t('stats_iashark.ref_kicker','L’arbitre')}${t('match_page.label_colon',' :')} ${a.name}`,tete,`<tbody>${groupeArb}${rangs}</tbody>`,'sbk-duo sbk-arb')}
    <p class="cmp-note tip-host">${insecable((conforme?conforme+' ':'')+note+' '+t('stats_iashark.ref_meter','Sur les barres, le point est sa moyenne et le trait blanc l’attendu.'))}${aide(t('stats_iashark.ref_margin_help','Les marges de l’arbitre sont plus larges que les autres : trois chiffres sont comparés en même temps, et l’ensemble doit rester juste 95 fois sur 100. Un écart n’est écrit que si l’attendu sort de la marge.'),t('stats_iashark.ref_margin_label','Pourquoi ces marges plus larges ?'))}</p>`;
}
// DETAIL PRO 4 : le profil de la ligue (neuf chiffres, 3 colonnes sur
// ordinateur, une liste sur telephone). UNE base de matchs pour tout le profil
// (export_stats_book.py#profil_ligue, relecture du 30/09) ; si un ancien calcul
// a un autre nombre pour un chiffre, la note le dit, jamais dans la case.
function sbkLigue(vm,b){
  const l=b.league;
  if(!l)return '';
  const autres=[];
  const nAutre=(x,cle,fb)=>{if(x&&x.n&&x.n!==l.n)autres.push(tf('stats_iashark.league_other_n','{what} : {n} matchs',{what:t('stats_iashark.'+cle,fb),n:fmt(x.n,0)}));return '';};
  const cases=[
    l.goals?['league_goals','Buts par match',l.goals,false,'']:null,
    l.over25?['league_over','Plus de 2,5 buts',l.over25,true,'']:null,
    l.btts?['league_btts','Les deux équipes marquent',l.btts,true,'']:null,
    l.home?['league_home_win','Victoire à domicile',l.home,true,'']:null,
    l.draw?['league_draw','Nul',l.draw,true,'']:null,
    l.away?['league_away_win','Victoire à l’extérieur',l.away,true,'']:null,
    l.corners?['league_corners','Corners par match',l.corners.m,false,nAutre(l.corners,'league_corners','Corners par match')]:null,
    l.cards?['league_cards','Cartons par match',l.cards.m,false,nAutre(l.cards,'league_cards','Cartons par match')]:null,
    l.penalties?['league_pens','Penaltys par match',l.penalties.m,false,nAutre(l.penalties,'league_pens','Penaltys par match')]:null
  ].filter(Boolean);
  if(!cases.length)return '';
  const lignes=cases.map(([cle,fb,iv,part])=>`<div><dt>${esc(t('stats_iashark.'+cle,fb))}</dt><dd><b>${esc(part?sbkPart(iv.p):sbkMoy(iv.p))}</b>\u00a0<small>${esc(sbkEntre(iv,part))}</small></dd></div>`).join('');
  // Jamais une case seule en bas : 3 colonnes pour 9 ou 6 cases, sinon 2.
  const cols=cases.length%3===0?3:2;
  const note=sbkMaj(sbkEchantillon(l.n,l.debut,l.fin))+(autres.length?` (${autres.join(', ')})`:'');
  return `<p class="sim-sub">${esc(tf('stats_iashark.league_title','{league} : le profil de la ligue',{league:sbkNomLigue(vm)}))}</p>
    <dl class="sbk-ligue sbk-ligue--${cols}">${lignes}</dl>
    <p class="cmp-note">${insecable(note)}.</p>`;
}
// Tout le detail Pro, replie par defaut. Bascule « tous leurs matchs /
// domicile-exterieur » quand les deux vues existent (memes pastilles que le
// sommaire ; le MEME libelle sur ordinateur et sur telephone, relecture du 30/09).
function sbkDetail(vm,b){
  const T=b.teams||{},id=vm.identity;
  const vueEquipes=vue=>[sbkQuarts(vm,b,vue),sbkPause(vm,b,vue)].filter(Boolean).map(x=>`<div class="sbk-part">${x}</div>`).join('');
  const tout=vueEquipes('all'),lieu=['home','away'].some(c=>T[c]&&T[c].venue)?vueEquipes('venue'):'';
  const bascule=tout&&lieu?`<div class="sbk-vue" role="group" aria-label="${esc(t('stats_iashark.view_group','Quels matchs ?'))}">
      <button type="button" aria-pressed="true" data-sbk-vue="all">${esc(t('stats_iashark.view_all_short','Tous leurs matchs'))}</button>
      <button type="button" aria-pressed="false" data-sbk-vue="venue">${esc(tf('stats_iashark.view_venue','{home} à domicile, {away} à l’extérieur',{home:nomEq(id.home),away:nomEq(id.away)}))}</button>
    </div>`:'';
  const equipes=tout?`${bascule}<div data-sbk-panel="all">${tout}</div>${bascule?`<div data-sbk-panel="venue" hidden>${lieu}</div>`:''}`:'';
  const bas=[sbkArbitre(vm,b),sbkLigue(vm,b)].filter(Boolean).map(x=>`<div class="sbk-part">${x}</div>`).join('');
  if(!equipes&&!bas)return '';
  return repliable({label:t('stats_iashark.detail_more','Voir tout le détail'),labelOpen:t('stats_iashark.detail_less','Masquer le détail'),cls:'sbk-detail',body:equipes+bas});
}
// Ligne « Reserve aux abonnes Pro » de la vue sans Pro : EXACTEMENT les
// rubriques que le detail Pro a pour ce match (b.lockedParts), dans l'ordre de
// la page. Liste inconnue (ancien fichier) : une phrase generale, sans liste.
// Aucune rubrique en plus : pas de ligne.
function sbkVerrou(b){
  const R={premier:t('stats_iashark.lock_first','le premier but encaissé et les 0-0'),quarts:t('stats_iashark.lock_slots','les buts par quart d’heure'),pause:t('stats_iashark.lock_ht','ce qui se passe après la pause'),
    lieu:t('stats_iashark.lock_venue','domicile et extérieur'),arbitre:t('stats_iashark.lock_ref','l’arbitre'),ligue:t('stats_iashark.lock_league','le profil de la ligue')};
  let texte;
  if(!Array.isArray(b.lockedParts))texte=t('stats_iashark.pro_only_generic','Réservé aux abonnés Pro : le détail de ces stats.');
  else{
    const l=b.lockedParts.filter(k=>R[k]).map(k=>R[k]);
    if(!l.length)return '';
    const liste=l.length>1?`${l.slice(0,-1).join(', ')} ${t('stats_iashark.and','et')} ${l[l.length-1]}`:l[0];
    texte=tf('stats_iashark.pro_only','Réservé aux abonnés Pro : {list}.',{list:liste});
  }
  // Relecture du 30/09 : une petite ligne grise se ratait. Un encadre lisible (texte
  // clair, cadenas cyan), toujours sans lien de paiement ni essai annonce : l'offre
  // Pro reste le mur de la page.
  return `<div class="sbk-pro">${cardIcon('lock')}<p>${insecable(texte)}</p></div>`;
}
// La carte, dans « Les stats du match ». Detail construit seulement en vue Pro
// ET si le serveur l'a envoye ; sans Pro, la ligne sbkVerrou. Aucun essai
// gratuit annonce (il n'en existe pas, CGV) ; aucun lien de paiement ici :
// l'offre Pro reste le mur de la page.
function bookFold(vm){
  const b=vm.bookStats;
  if(!b)return '';
  const avant=sbkPremierBut(vm,b)+sbkApres75(vm,b);
  const detail=VUE_PRO&&b.pro?sbkDetail(vm,b):VUE_PRO?'':sbkVerrou(b);
  if(!avant&&!(VUE_PRO&&detail))return '';
  // « Matchs joues jusqu'au » : fin de la periode des donnees (periode_fin, la veille
  // du calcul), jamais la date du calcul ; dans le resume, visible carte fermee.
  const finDonnees=new Date(b.periodEnd+'T12:00:00Z');
  let jour=finDonnees.toLocaleDateString(localeTag(),{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
  if(/^fr/.test(localeTag())&&finDonnees.getUTCDate()===1)jour=jour.replace(/^1(?=\s)/,'1er');
  jour=jour.replace(/\s/g,'\u00a0');
  // Le lien et sa bulle « ? » restent sur la meme ligne (.sbk-nw).
  const barres=/class="sbk-(?:bar|metre)/.test(avant+detail);
  const marge=barres?t('stats_iashark.range_note_bars','Entre parenthèses, et en trait fin sur les barres, la marge : le vrai chiffre s’y trouve 95 fois sur 100.'):t('stats_iashark.range_note','Entre parenthèses, la marge : le vrai chiffre s’y trouve 95 fois sur 100.');
  const source=`<p class="cmp-note sbk-source tip-host">${insecable(marge+' '+t('stats_iashark.source','Source : l’archive IASHARK des matchs déjà joués.'))} <span class="sbk-nw"><a href="${esc(lien('methodologie.html')+'#stats-iashark')}">${esc(t('stats_iashark.method_link','Comment on calcule'))}</a>${aide(t('stats_iashark.method_help','Chaque chiffre est compté sur les matchs officiels déjà joués, amicaux exclus : 2 ans de son championnat pour une équipe (de matchs officiels pour une sélection), 2 ans pour une ligue, 3 ans pour un arbitre. La marge donne la zone où se trouve le vrai chiffre 95 fois sur 100. Sous 15 matchs (30 pour un arbitre, une ligue ou un cas « à la pause »), rien n’est affiché.'),t('stats_iashark.method_help_label','Comment lire ces chiffres ?'))}</span></p>`;
  return fold({key:'book',title:t('stats_iashark.title','Les stats IASHARK'),icon:'history',summary:esc(tf('stats_iashark.fold_sub_until','Calculées sur les matchs joués jusqu’au {date}',{date:jour})),body:avant+detail+source,open:true});
}
// Chiffres-cles animes (« Count Up », unlumen, refait sans React) : quand le chiffre entre a
// l'ecran (carte ouverte, detail deplie), il monte de 0 a sa valeur en 0,7 s, au format de la
// langue, puis son texte exact est remis. Rien sous « mouvement reduit » ni sans
// IntersectionObserver : le chiffre est alors ecrit tout de suite, comme avant.
function sbkCompteurs(zone){
  if(!zone||!('IntersectionObserver' in window))return;
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const els=[...zone.querySelectorAll('[data-cu]')];
  if(!els.length)return;
  const io=new IntersectionObserver(entrees=>entrees.forEach(en=>{
    if(!en.isIntersecting)return;
    io.unobserve(en.target);
    sbkCompter(en.target);
  }),{threshold:.9});
  els.forEach(el=>io.observe(el));
}
function sbkCompter(el){
  const fin=el.textContent,v=Number(el.getAttribute('data-cu')),f=el.getAttribute('data-cu-f');
  if(!Number.isFinite(v)||v<=0)return;
  const ecrire=x=>f==='p'?sbkPart(x):sbkFixe(x,Number(f)||0),debut=performance.now(),DUREE=700;
  el.style.minWidth=el.offsetWidth+'px';
  const pas=maintenant=>{
    const k=Math.min(1,(maintenant-debut)/DUREE);
    el.textContent=k<1?ecrire(v*(1-Math.pow(1-k,3))):fin;
    if(k<1)requestAnimationFrame(pas);else el.style.minWidth='';
  };
  requestAnimationFrame(pas);
}
// Bascule « tous leurs matchs / domicile-exterieur ».
function sbkBascule(btn){
  const box=btn.closest('.sbk-detail');
  if(!box)return;
  const vue=btn.getAttribute('data-sbk-vue');
  box.querySelectorAll('[data-sbk-vue]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));
  box.querySelectorAll('[data-sbk-panel]').forEach(p=>{p.hidden=p.getAttribute('data-sbk-panel')!==vue;});
}

// Simulation par tranches de 15 minutes (vm.model.goalSimulation, champ premium
// sim_15min, lib/simulation-15min.js). Remplace la « frequence observee » du
// 18/09 : mesuree sur 6 127 matchs jamais vus, la simulation se trompe de
// 0,7 point en moyenne contre 6,1 pour l'ancienne frequence. Deux chiffres
// (validation du mathematicien, 28/09/2026) : la chance d'au moins un but dans
// chaque tranche, et l'equipe qui ouvre le score. PAS de « tranche la plus chaude »
// propre au match (76e-fin pour 100 % des matchs) ni de score a la pause (0-0 dans
// 97 % des matchs) : seule une phrase generale sur la fin de match. Jamais de verdict « but / pas de but » ni de taux de reussite
// associe (repondre toujours « pas de but » fait aussi bien : 65,0 %). Jamais de
// « cette equipe marque tard » : mesure, c'est du hasard.
// Couleurs : barres cyan, toutes identiques (le vert et le rouge restent
// reserves aux ecarts chiffres).
function scenarioChart(g){
  const max=Math.max(...g.slots.map(s=>n(s.probability)||0),1);
  const barres=g.slots.map(s=>{
    const p=n(s.probability)||0,h=Math.max(6,Math.round(p/max*100));
    return `<li class="sim-bar"><span class="sim-bar-val">${esc(pct(p,0))}</span><span class="sim-bar-track"><i style="height:${h}%"></i></span><span class="sim-bar-lbl">${esc(s.label)}</span></li>`;
  }).join('');
  const aria=tf('match_page.sim_aria','Chance d’au moins un but par tranche : {list}',{list:g.slots.map(s=>`${s.label} ${pct(s.probability,0)}`).join(', ')});
  return `<figure class="sim-chart"><ol class="sim-bars" role="img" aria-label="${esc(aria)}">${barres}</ol></figure>`;
}
function scenarioCard(vm){
  const g=vm.model&&vm.model.goalSimulation;
  if(!g||!g.slots.length)return empty(t('match_page.sim_unavailable','La simulation n’est pas disponible pour ce match.'));
  const id=vm.identity;
  const fin=`<p class="sim-note">${esc(t('match_page.sim_late_general','La fin de match est en général la plus riche en buts.'))}</p>`;
  let premier='';
  if(g.firstGoal){
    const f=g.firstGoal,seg=(cls,p)=>`<i class="${cls}" style="width:${Math.max(0,Math.min(100,n(p)||0)).toFixed(1)}%"></i>`;
    premier=`<div class="sim-first"><p class="sim-sub">${esc(t('match_page.sim_first_title','Qui ouvre le score ?'))}</p>
      <div class="sim-first-bar" aria-hidden="true">${seg('is-home',f.home)}${seg('is-none',f.none)}${seg('is-away',f.away)}</div>
      <ul class="sim-first-leg"><li><span>${esc(nomEq(id.home))}</span><b>${esc(pct(f.home,0))}</b></li><li><span>${esc(t('match_page.sim_first_none','Pas de but'))}</span><b>${esc(pct(f.none,0))}</b></li><li><span>${esc(nomEq(id.away))}</span><b>${esc(pct(f.away,0))}</b></li></ul></div>`;
  }
  return `${scenarioChart(g)}${fin}${premier}
    <p class="scenario-source">${esc(t('match_page.sim_source','Match rejoué minute par minute à partir des buts attendus du modèle, avec l’effet du score du moment, des cartons rouges et du temps additionnel. Estimation, pas une garantie.'))}</p>`;
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
  const id=vm.identity,f=vm.editorial.exclusiveFacts||{},g=vm.model&&vm.model.goalSimulation;
  // Un nom court d'equipe ne se coupe pas (« Cienciano – Los / Chankas ? »).
  const colle=x=>x.length<=16?x.replace(/ /g,'\u00a0'):x;
  const dom=colle(nomEq(id.home)),ext=colle(nomEq(id.away));
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
      tf('match_page.faq_h2h_answer','Sur les {n} dernières confrontations : {home} {hw} V · {draws} N · {away} {aw} V. Dernière rencontre : {lastHome} {lastScore} {lastAway}.',{n:h.length,home:esc(dom),away:esc(ext),hw,draws:dr,aw,lastHome:esc(nomPage(vm,der.home)),lastScore:esc(der.score),lastAway:esc(nomPage(vm,der.away))})]);
  }
  // 2. Statistiques brutes des deux equipes.
  // « Laquelle marque le plus tot » / « laquelle craque en fin de match » retirees
  // le 28/09/2026 : le profil horaire propre a une equipe est du hasard (mesure
  // sur 6 127 matchs, test placebo). La simulation (modele) repond a la place.
  if(f.cartons){
    const rugueux=Math.abs(f.cartons.home-f.cartons.away)<0.3?null:plusGrand(f.cartons);
    const nbRouges=f.rouges?f.rouges.home+f.rouges.away:0;
    const rouges=nbRouges>0?(nbRouges>1?tf('match_page.faq_cards_red_other','Sur la période suivie, {n} cartons rouges au total.',{n:nbRouges}):tf('match_page.faq_cards_red_one','Sur la période suivie, {n} carton rouge au total.',{n:nbRouges})):'';
    const verdict=rugueux?tf('match_page.faq_cards_verdict_team','{team} est la plus sanctionnée des deux.',{team:esc(rugueux)}):t('match_page.faq_cards_verdict_equal','Les deux sont sanctionnées au même rythme.');
    stats.push([t('match_page.faq_q_cards','Combien de cartons dans un match de ces équipes ?'),tf('match_page.faq_cards_answer','{home} en prend {homeCards} par match et {away} {awayCards}. {verdict}',{home:esc(dom),away:esc(ext),homeCards:un1(f.cartons.home),awayCards:un1(f.cartons.away),verdict:verdict+(rouges?' '+rouges:'')})]);
  }
  if(f.xg&&f.xga){
    // 5e relecture du 30/09 : la meme equipe devant sur les deux points, une seule fois son nom.
    stats.push([t('match_page.faq_q_chances','Ces équipes se créent-elles beaucoup d’occasions ?'),(plusGrand(f.xg)===plusPetit(f.xga)?tf('match_page.faq_chances_answer_same','Sur leurs derniers matchs, {home} génère {homeXg} buts attendus par match et en concède {homeXga}&nbsp;; {away} {awayXg} et {awayXga}. {best} se procure le plus d’occasions et en concède le moins.',{home:esc(dom),away:esc(ext),homeXg:fmt(f.xg.home),homeXga:fmt(f.xga.home),awayXg:fmt(f.xg.away),awayXga:fmt(f.xga.away),best:esc(plusGrand(f.xg)),solid:esc(plusPetit(f.xga))}):tf('match_page.faq_chances_answer','Sur la saison, {home} génère {homeXg} buts attendus par match et en concède {homeXga}&nbsp;; {away} {awayXg} et {awayXga}. {best} se procure le plus d’occasions, {solid} en concède le moins.',{home:esc(dom),away:esc(ext),homeXg:fmt(f.xg.home),homeXga:fmt(f.xga.home),awayXg:fmt(f.xg.away),awayXga:fmt(f.xga.away),best:esc(plusGrand(f.xg)),solid:esc(plusPetit(f.xga))}))]);
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
      :raw.no_signal_reason==='KICKOFF_POSTPONED'||estSelection(raw)?esc(sansPari(raw))+'.'
      :esc(t('match_page.faq_pick_none','Le modèle n’a retenu aucun pari sur ce match.'))]);
    if(g&&g.slots.length)modele.push([t('match_page.faq_q_first15','Que peut-il se passer dans les 15 premières minutes ?'),
      tf('match_page.faq_first15_sim','Le modèle donne {p} de chances d’au moins un but dans le premier quart d’heure. Estimation, pas une garantie.',{p:esc(pct(g.slots[0].probability,0))})]);
    if(pr)modele.push([t('match_page.faq_q_outcomes','Quelles chances le modèle donne-t-il à chaque équipe ?'),
      tf('match_page.faq_outcomes_answer','Victoire {home} : {p1} · match nul : {pn} · victoire {away} : {p2}. Estimation statistique, pas une garantie.',{home:esc(dom),away:esc(ext),p1:esc(pct(pr.home,0)),pn:esc(pct(pr.draw,0)),p2:esc(pct(pr.away,0))})]);
    const sources=Array.isArray(vm.model.sources)?vm.model.sources.filter(Boolean):[];
    const sims=n(vm.model.simulationCount),qualite=n(vm.model.quality);
    if(sims!==null||sources.length||qualite!==null){
      const bits=[];
      if(sims!==null)bits.push(tf('match_page.faq_basis_sims','{n} simulations de Monte-Carlo',{n:sims.toLocaleString(localeTag())}));
      // Au milieu d'une phrase, pas de majuscule (« les données calendrier et équipes, cotes du
      // marché ») ; l'allemand garde ses noms communs en majuscule, un sigle garde les siennes.
      const minuscule=x=>/^de/.test(localeTag())||/^[A-Z]{2}/.test(x)?x:x.charAt(0).toLocaleLowerCase(localeTag())+x.slice(1);
      if(sources.length)bits.push(tf('match_page.faq_basis_sources','les données {sources}',{sources:sources.map(x=>esc(minuscule(libelleSource(String(x))))).join(', ')}));
      if(qualite!==null)bits.push(tf('match_page.faq_basis_quality','un score de qualité des données de {score}/100',{score:fmt(qualite)}));
      fin.push([t('match_page.faq_q_basis','Sur quoi repose cette analyse ?'),tf('match_page.faq_basis_answer','L’analyse s’appuie sur {bits}. Les probabilités décrivent une fréquence attendue sur un grand nombre de matchs semblables, jamais une certitude sur celui-ci.',{bits:bits.join(', ')})]);
    }
  }
  const toutes=[...faits.map(x=>[...x,false]),...modele.map(x=>[...x,true]),...stats.map(x=>[...x,false]),...fin.map(x=>[...x,true])];
  if(toutes.length<2)return '';
  return card(t('match_page.faq_section_title','Questions fréquentes'),
    `<div class="faq-list">${toutes.map(([q,a,ia])=>`<details${ia?' class="faq-ia"':''}><summary><span>${esc(q)}</span></summary><p>${insecableTexte(a)}</p></details>`).join('')}</div>`,
    'faq-card','faq');
}

// ---------------------------------------------------------------------------
// PAGE MATCH PLUS (30/09/2026, FRANCAIS SEULEMENT pour l'instant : les autres langues
// gardent la page precedente jusqu'a leur traduction). Chiffres : vm.plus
// (lib/match-view-model.js#matchPlus), jamais calcules ici. Un chiffre absent : le bloc
// n'est pas rendu. Aucune mise, aucune « valeur », aucun « avantage », aucune promesse.
// Visuels : composants 21st.dev refaits sans React, aux couleurs de la page (cyan et gris ;
// vert et rouge restent reserves aux ecarts chiffres) :
//  - « Le match en 30 secondes » : Payment Summary Card (kavikatiyar/card-3 : un chiffre
//    principal, des lignes de detail, une action) + Social Share Button (Shatlyk1011) ;
//  - « Le chiffre fou » : Bold Stats (uilayout.contact/stats-bold : un chiffre en tete) ;
//  - « Le film du match » : Stats Card (kavikatiyar/stats-card-1 : mini barres + resume)
//    et Animated Chart (abui : une legende sous chaque colonne) ;
//  - « Si... alors... » : How It Works (ravikatiyar162 : etapes numerotees) ;
//  - « Les 2 buteurs » : Progress Card (lavikatiyar : titre, jauge, libelles) ;
//  - « Le piege du match » : Alert (cnippet-dev/v-alert : icone, titre, une phrase) ;
//  - carte a partager : Social card (shailendrakumar19999) rendue en PNG dans le navigateur.
// ---------------------------------------------------------------------------
const ICON_PLUS={
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  share:'<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.8 6.6-4M8.7 13.2l6.6 4"/>',
  spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  branch:'<path d="M6 4v8a4 4 0 0 0 4 4h8"/><path d="m15 13 3 3-3 3"/><circle cx="6" cy="4" r="1.6"/>'
};
Object.assign(ICONS,ICON_PLUS);
const iconePlus=cardIcon;
let PARTAGE=null;
// Ligne verrouillee (compte gratuit) : ce que Pro ouvre. Pas de bouton ni de lien : un seul
// bouton « Debloquer » par vue (decision du 19/09/2026), les petits liens disperses retires.
const lignePro=texte=>`<p class="plus-lock">${cardIcon('lock')}<span>${insecable(texte)}</span></p>`;

// 1. LE MATCH EN 30 SECONDES, juste sous l'en-tete. Gratuit : le pari et l'histoire.
// Pro : aussi les 2 buteurs. Sans histoire (pas de buts attendus du moteur) : pas de bloc.
function resumeCard(vm){
  const P=vm.plus||{};
  if(!P.histoire)return '';
  const r=vm.model.recommendation,raw=vm._raw||{},cote=n(vm.model.recommendedOdds);
  const pari=r?`<b>${esc(marcheFr(vm,r.market))}</b>${cote!==null?` <span class="plus-cote">cote ${esc(odds(cote))}</span>`:''}`
    :etatAnalyse(raw)==='none'?esc(sansPari(raw)):'';
  const ligne=(num,titre,corps)=>`<li class="plus-row"><span class="plus-num" aria-hidden="true">${num}</span><div><p class="plus-k">${esc(titre)}</p><p class="plus-v">${corps}</p></div></li>`;
  const B=P.buteurs;
  const buteurs=VUE_PRO
    ?(B?B.map(b=>`<span class="plus-scorer"><b>${esc(b.name)}</b> <small>${esc(b.team)}</small> <em>${esc(b.chanceTexte)}</em></span>`).join(''):'')
    :null;
  const lignes=[
    pari?['Le pari retenu',pari]:null,
    ['L’histoire du match',insecable(P.histoire)],
    VUE_PRO?(buteurs?[B.length>1?'Les 2 buteurs':'Le buteur',buteurs+`<small class="plus-scorer-note">chance de marquer à n’importe quel moment</small>`]:null):null
  ].filter(Boolean);
  PARTAGE=P.partage||null;
  const bouton=PARTAGE?`<button type="button" class="plus-share" data-plus-partage aria-label="Partager l’image du match (sans pari ni cote)">${iconePlus('share')}<span>Partager</span></button>`:'';
  return `<section class="card plus-resume reveal" aria-labelledby="plusResume">
    <div class="plus-head"><h2 id="plusResume">${iconePlus('clock')}Le match en 30 secondes</h2>${bouton}</div>
    <ol class="plus-rows">${lignes.map((l,i)=>ligne(i+1,l[0],l[1])).join('')}</ol>
    ${VUE_PRO?'':(B||vm.players.scoringThreat.length?lignePro('Les 2 buteurs du match : réservé aux abonnés Pro.'):'')}
  </section>`;
}

// 3. LE CHIFFRE FOU : une vraie stat du Book, avec son nombre de matchs et sa periode.
function chiffreFouCard(vm){
  const c=vm.plus&&vm.plus.chiffreFou;
  if(!c)return '';
  return `<section class="card plus-fou reveal" aria-labelledby="plusFou">
    <p class="plus-eyebrow" id="plusFou">${iconePlus('spark')}Le chiffre fou</p>
    <div class="plus-fou-in"><b class="plus-fou-n">${esc(c.grand)}</b><div><p class="plus-fou-t">${insecable(c.phrase+'.')}</p><p class="plus-fou-d">${insecable(sbkMaj(c.detail)+'. Stats IASHARK, matchs déjà joués.')}</p></div></div>
  </section>`;
}

// 4. LE FILM DU MATCH (remplace « Scenario probable ») : les barres par quart d'heure,
// et sous chaque tranche ses buts attendus (plus de mot de tranche : verdict du 30/09/2026).
function filmCard(vm){
  const g=vm.model&&vm.model.goalSimulation,T=vm.plus&&vm.plus.tranches;
  if(!g||!g.slots.length||!T)return '';
  const id=vm.identity;
  const lignes=`<ol class="film-lignes" aria-label="Buts attendus par quart d’heure">${T.map(x=>`<li><span class="sr-only">${esc(x.label)} : </span><small>${esc(fmt(x.buts,1))}\u00a0but</small></li>`).join('')}</ol>`;
  let premier='';
  if(g.firstGoal){
    const f=g.firstGoal,seg=(cls,p)=>`<i class="${cls}" style="width:${Math.max(0,Math.min(100,n(p)||0)).toFixed(1)}%"></i>`;
    premier=`<div class="sim-first"><p class="sim-sub">${esc(t('match_page.sim_first_title','Qui ouvre le score ?'))}</p>
      <div class="sim-first-bar" aria-hidden="true">${seg('is-home',f.home)}${seg('is-none',f.none)}${seg('is-away',f.away)}</div>
      <ul class="sim-first-leg"><li><span>${esc(nomEq(id.home))}</span><b>${esc(pct(f.home,0))}</b></li><li><span>${esc(t('match_page.sim_first_none','Pas de but'))}</span><b>${esc(pct(f.none,0))}</b></li><li><span>${esc(nomEq(id.away))}</span><b>${esc(pct(f.away,0))}</b></li></ul></div>`;
  }
  return `<p class="film-cle">${insecable('Barres : la chance qu’au moins un but tombe dans la tranche. Dessous : les buts attendus de chaque tranche.')}</p>
    ${scenarioChart(g)}${lignes}${premier}
    <p class="scenario-source">${insecable('Match rejoué minute par minute à partir des buts attendus du modèle, avec l’effet du score du moment, des cartons rouges et du temps additionnel (compris dans 31-45+ et 76-90+). Estimation, pas une garantie.')}</p>`;
}

// 5. SI... ALORS... : Poisson sur les buts attendus restants (vm.plus.siAlors).
function siAlorsCard(vm){
  const L=vm.plus&&vm.plus.siAlors;
  if(!L||!L.length)return '';
  return `<ol class="sia-list">${L.map((x,i)=>`<li><span class="sia-n" aria-hidden="true">${i+1}</span><p>${insecable(x.texte)}</p></li>`).join('')}</ol>
    <p class="scenario-source">${insecable('Calcul IASHARK à partir des buts attendus du modèle : les buts qui restent à marquer après la minute donnée suivent une loi de Poisson. Estimation, pas une garantie.')}</p>`;
}

// 6. LES 2 BUTEURS DU MATCH : chance de marquer a n'importe quel moment (arrondie vers
// le bas a 5 points, 45 % au plus), titulaire probable, forme.
function buteursCard(vm){
  const B=vm.plus&&vm.plus.buteurs;
  if(!B)return '';
  const carte=b=>{
    const href=b.id!==null?` href="${esc(lien(`joueur.html?m=${encodeURIComponent(vm.id)}&p=${b.id}`))}"`:'';
    const tag=b.id!==null?'a':'div';
    return `<${tag} class="but-card"${href}>
      <div class="threat-id">${img(b.photo,'',54,54)}<div class="threat-who"><b>${esc(b.name)}</b><small>${esc(b.team)}${b.position?' · '+esc(poste(b.position)):''}</small></div></div>
      <div class="threat-prob"><div class="threat-prob-tete"><span>Marquer à n’importe quel moment</span><b>${esc(b.chanceTexte)}</b></div>
      <div class="threat-jauge" aria-hidden="true"><i style="width:${Math.max(2,b.chance)}%"></i></div></div>
      <ul class="but-faits"><li>${insecable(b.titulaire)}</li>${b.forme?`<li>${insecable('Forme : '+b.forme.charAt(0).toLowerCase()+b.forme.slice(1))}</li>`:''}</ul>
      ${b.id!==null?`<span class="threat-lien">${esc(t('match_page.view_profile_link','Voir la fiche'))} <i aria-hidden="true">→</i></span>`:''}
    </${tag}>`;
  };
  const ml=window.IasharkMarketLabels;
  const proj=(vm.players.projections||[]).filter(p=>n(p.probability)!==null&&p.market!=='Buteur');
  const autres=proj.length?`<ul class="pm-list">${proj.slice(0,6).map(x=>{const code=CODES_JOUEUR[x.market];return `<li><span>${esc(code&&ml&&ml.playerMarketLabelFor?ml.playerMarketLabelFor(code,x.player):`${x.player} · ${x.market}`)}</span><b>${pct1(x.probability)}</b></li>`;}).join('')}</ul>`:'';
  return `<div class="but-grid">${B.map(carte).join('')}</div>${autres}
    <p class="pm-note">${insecable('Calcul buteur du moteur IASHARK, le même que dans les messages Pro : chance de marquer à n’importe quel moment, arrondie vers le bas à 5 points, 45 % au plus. Estimée avant les compositions officielles, titulaires probables seulement.')}</p>`;
}

// L'analyse, version francaise : film, Si... alors..., les 2 buteurs (Pro), puis ce que dit
// le modele et les probabilites. Compte gratuit : UNE carte fermee annonce les trois blocs Pro.
function analysePlus(vm){
  const P=vm.plus||{};
  const blocs=[];
  if(VUE_PRO){
    const film=filmCard(vm),sia=siAlorsCard(vm),but=buteursCard(vm);
    if(film)blocs.push(fold({key:'film',title:'Le film du match',icon:'chart',summary:esc('Quart d’heure par quart d’heure : la chance d’un but et les buts attendus'),body:film,open:true}));
    if(sia)blocs.push(fold({key:'sialors',title:'Si… alors…',icon:'branch',summary:esc('Ce que change le début du match'),body:sia,open:true}));
    if(but)blocs.push(fold({key:'joueurs',title:B2(P.buteurs),icon:'target2',summary:esc('Chance de marquer, titulaire probable et forme'),body:but,open:true}));
  }else if(P.histoire||vm.players.scoringThreat.length){
    // Compte gratuit : la carte fermee n'annonce QUE ce qu'un Pro verrait sur CE match (avocat
    // du diable, 01/10/2026) : pas de « Si… alors… » la ou il est masque (competition en test,
    // selections), pas de buteurs sans buteur du moteur v3.
    const g=vm.model&&vm.model.goalSimulation;
    const aFilm=!!(g&&g.slots&&g.slots.length&&P.tranches),aSia=!!(P.siAlors&&P.siAlors.length),aBut=!!(P.buteurs&&P.buteurs.length);
    const titres=[aFilm?'Le film du match':null,aSia?'« Si… alors… »':null,aBut?B2(P.buteurs).replace(/^L/,'l'):null].filter(Boolean);
    const textes=[aFilm?'le film du match quart d’heure par quart d’heure':null,aSia?'ce qui change si un but tombe tôt ou si c’est 0-0 à la pause':null,aBut?(P.buteurs.length>1?'les 2 buteurs du match avec leur chance de marquer':'le buteur du match avec sa chance de marquer'):null].filter(Boolean);
    const et=l=>l.length>1?l.slice(0,-1).join(', ')+' et '+l[l.length-1]:l[0];
    if(titres.length){
      const titre=et(titres);
      const texte=et(textes);
      blocs.push(fold({key:'film',title:titre.charAt(0).toUpperCase()+titre.slice(1),icon:'lock',summary:esc('Réservé aux abonnés Pro'),body:lignePro(texte.charAt(0).toUpperCase()+texte.slice(1)+' : réservé aux abonnés Pro.'),open:true}));
    }
  }
  blocs.push(outputsCard(vm,{fold:{key:'modele',summary:esc(t('match_page.outputs_sub','Buts attendus et scores les plus probables')),open:true}}));
  const probas=marketsCard(vm);
  if(probas)blocs.push(fold({key:'probas',title:t('match_page.markets_title','Probabilités et cotes'),icon:'table',summary:esc(t('match_page.proba_sub','Nos chances face à la cote, pari par pari')),body:probas,open:true}));
  // En conclusion, apres les buteurs : « Notre lecture du match » (Pro).
  const lecture=lectureCard(vm);
  if(lecture)blocs.push(lecture);
  return blocs.filter(Boolean).join('');
}
// 7. NOTRE LECTURE DU MATCH (decision de Clement, 30/09/2026, Pro) : 3 a 4 phrases ecrites
// par l'IA de l'analyse (update-data.yml, champ lecture_match) a partir de nos chiffres, mais
// SANS aucun chiffre, relues par lib/analyse-mots-interdits.js (chiffre, cote, mise, pari,
// « valeur », « avantage », promesse : phrase retiree). Texte absent ou vide : pas de bloc.
function lectureCard(vm){
  const txt=VUE_PRO?String(vm.editorial.matchReading||'').trim():'';
  if(!txt||/\d/.test(txt))return '';
  return `<section class="card plus-lecture reveal" aria-labelledby="plusLecture">
    <p class="plus-eyebrow" id="plusLecture">${cardIcon('chart')}Notre lecture du match</p>
    <p class="plus-lecture-t">${insecable(txt)}</p>
    <p class="plus-lecture-d">${insecable('Écrit à partir de nos chiffres pour ce match. Une lecture, pas une garantie.')}</p>
  </section>`;
}
const B2=B=>B&&B.length>1?'Les 2 buteurs du match':'Le buteur du match';

// 7. CARTE A PARTAGER (PNG dessine dans le navigateur, 1080 x 1350) : logo, les deux
// equipes, l'histoire du match et le chiffre fou. JAMAIS de cote, de pari, de pourcentage
// de pari ni de mot de jeu d'argent : elle doit pouvoir circuler sur TikTok et WhatsApp.
// Ne lit QUE PARTAGE (vm.plus.partage), rien du pari.
function lignesCanvas(ctx,texte,largeur){
  // Espaces insecables gardes : un chiffre reste colle a son unite, le dernier mot jamais seul.
  const mots=String(texte).replace(/ (\S+)$/,'\u00a0$1').split(/ +/),out=[];let l='';
  mots.forEach(m=>{const essai=l?l+' '+m:m;if(ctx.measureText(essai).width>largeur&&l){out.push(l);l=m;}else l=essai;});
  if(l)out.push(l);
  return out.map(x=>x.replace(/\u00a0/g,' '));
}
function chargerImage(src){return new Promise(ok=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=src;});}
async function dessinerCarte(c){
  const W=1080,H=1350,cv=document.createElement('canvas');cv.width=W;cv.height=H;
  const x=cv.getContext('2d');
  try{if(document.fonts&&document.fonts.load)await Promise.all(['700 80px "DM Sans"','500 40px "DM Sans"'].map(f=>document.fonts.load(f)));}catch(e){}
  const F=(poids,taille)=>`${poids} ${taille}px "DM Sans", system-ui, sans-serif`;
  x.fillStyle='#080c12';x.fillRect(0,0,W,H);
  const g=x.createRadialGradient(W/2,-120,40,W/2,-120,900);g.addColorStop(0,'rgba(34,211,238,.22)');g.addColorStop(1,'rgba(34,211,238,0)');x.fillStyle=g;x.fillRect(0,0,W,H);
  x.strokeStyle='rgba(34,211,238,.28)';x.lineWidth=3;x.strokeRect(36,36,W-72,H-72);
  const logo=await chargerImage('/assets/iashark-logo.png');
  if(logo){const h=96,w=logo.naturalWidth/logo.naturalHeight*h;x.drawImage(logo,80,84,w,h);}
  x.textBaseline='alphabetic';x.textAlign='left';
  x.fillStyle='#8fa1b5';x.font=F(500,32);if(c.ligue)x.fillText(c.ligue,80,236);
  // Competition « en test » : dit sur l'image comme sur la page (avocat du diable, 01/10/2026).
  if(c.enTest){x.textAlign='right';x.fillStyle='#f5a524';x.font=F(700,32);x.fillText('Fiabilité : en test',W-80,236);x.textAlign='left';}
  // Equipes
  let y=350;x.fillStyle='#f4f7fb';x.font=F(700,84);
  const eq=`${c.domicile} – ${c.exterieur}`;
  let taille=84;while(x.measureText(eq).width>W-160&&taille>48){taille-=4;x.font=F(700,taille);}
  lignesCanvas(x,eq,W-160).forEach(l=>{x.fillText(l,80,y);y+=taille+10;});
  // Histoire
  y+=20;x.fillStyle='#c3d1de';x.font=F(500,40);
  lignesCanvas(x,c.histoire,W-160).forEach(l=>{x.fillText(l,80,y);y+=54;});
  if(c.chiffre){
    y+=40;x.fillStyle='rgba(255,255,255,.12)';x.fillRect(80,y,W-160,2);y+=78;
    x.fillStyle='#22d3ee';x.font=F(700,34);x.fillText('Le chiffre fou',80,y);y+=196;
    x.font=F(700,200);x.fillText(c.chiffre.grand.replace(/\u00a0/g,' '),72,y);y+=76;
    x.fillStyle='#f4f7fb';x.font=F(600,44);
    lignesCanvas(x,c.chiffre.phrase+'.',W-160).forEach(l=>{x.fillText(l,80,y);y+=58;});
    y+=8;x.fillStyle='#8fa1b5';x.font=F(500,30);
    lignesCanvas(x,sbkMaj(c.chiffre.detail)+'.',W-160).forEach(l=>{x.fillText(l,80,y);y+=40;});
  }
  x.fillStyle='#8fa1b5';x.font=F(500,30);x.fillText('Stats et analyse : iashark.com',80,H-92);
  return cv;
}
async function partagerCarte(btn){
  if(!PARTAGE)return;
  btn.disabled=true;
  try{
    const cv=await dessinerCarte(PARTAGE);
    const blob=await new Promise(ok=>cv.toBlob(ok,'image/png'));
    if(!blob)return;
    const nom=`iashark-${String(PARTAGE.domicile+'-'+PARTAGE.exterieur).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')}.png`;
    const fichier=typeof File==='function'?new File([blob],nom,{type:'image/png'}):null;
    if(fichier&&navigator.canShare&&navigator.canShare({files:[fichier]})){
      try{await navigator.share({files:[fichier],title:`${PARTAGE.domicile} – ${PARTAGE.exterieur}`});return;}catch(e){if(e&&e.name==='AbortError')return;}
    }
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=nom;document.body.appendChild(a);a.click();
    setTimeout(()=>{URL.revokeObjectURL(a.href);if(a.parentNode)a.parentNode.removeChild(a);},1500);
  }finally{btn.disabled=false;}
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
  {key:'avis',secs:['resume','avis','chiffre'],label:['match_page.nav_avis','Avis IASHARK']},
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
    const partage=ev.target.closest('[data-plus-partage]');
    if(partage){partagerCarte(partage);return;}
    const vueStats=ev.target.closest('[data-sbk-vue]');
    if(vueStats){sbkBascule(vueStats);return;}
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
  // Page statique /match/<id>.html : son <title> de recherche (scripts/seo-pages.js,
  // audit SEO du 29/09/2026, A2) reste en place ; seul match.html?id= le pose ici.
  if(!resumeSeoStatique())document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;
  return vm;
}

// L'ANALYSE IASHARK (abonne / match offert) : 4 blocs repliables, dans l'ordre
// scenario (15 minutes), ce que dit le modele, probabilites et cotes, marches
// joueurs.
// Simulation 15 min : reservee aux Pro SANS EXCEPTION, meme sur le match offert
// (decision de Clement, 29/09/2026). VUE_PRO est pose par init() a partir du plan
// lu par l'application ; le serveur ne l'envoie de toute facon qu'a un Pro.
let VUE_PRO=false;
function analyseAbonne(vm){
  // Pro sans simulation (moteur v3 absent sur ce match) : pas de carte vide,
  // la carte n'est pas affichee (relecture visuelle du 30/09/2026).
  const g=vm.model&&vm.model.goalSimulation,simVide=VUE_PRO&&!(g&&g.slots&&g.slots.length);
  const blocs=[
    simVide?'':fold({key:'scenario',title:t('match_page.scenario_title','Scénario probable du match'),icon:'chart',summary:esc(t('match_page.sim_chart_caption','Chance qu’au moins un but tombe dans chaque tranche de 15 minutes')),body:VUE_PRO?scenarioCard(vm):empty(t('match_page.sim_pro_only','Réservé aux abonnés Pro : la chance d’un but dans chaque tranche de 15 minutes.')),open:true}),
    outputsCard(vm,{fold:{key:'modele',summary:esc(t('match_page.outputs_sub','Buts attendus et scores les plus probables')),open:true}})
  ];
  const probas=marketsCard(vm);
  if(probas)blocs.push(fold({key:'probas',title:t('match_page.markets_title','Probabilités et cotes'),icon:'table',summary:esc(t('match_page.proba_sub','Nos chances face à la cote, pari par pari')),body:probas,open:true}));
  // 30/09 : les buteurs sont reserves aux Pro (meme regle que la page francaise).
  if(VUE_PRO)blocs.push(threatsCard(vm,{fold:{key:'joueurs',summary:esc(t('match_page.players_sub','Les buteurs les plus probables'))}}));
  return blocs.filter(Boolean).join('');
}

function render(raw){
  const vm=viewModel(raw);
  PARTAGE=null;
  // Page match plus (30/09) : francais seulement, les autres langues gardent la page precedente.
  const plus=estFr();
  // ORDRE DE LECTURE (16/09/2026, maquette V8 validee par le proprietaire) :
  // en-tete, l'avis IASHARK, les stats du match (ouvertes), l'analyse
  // IASHARK, les questions frequentes a la fin. Section Absences retiree.
  const stats=statsBlocs(vm),analyse=plus?analysePlus(vm):analyseAbonne(vm);
  // Selection Pro du jour (abonne Pro) : avant l'avis ; l'avis v3 s'efface s'il dit la meme chose.
  const selPro=selectionProCard(SELECTIONS_PRO),sansAvis=!!selPro&&selproRemplaceAvis(raw,SELECTIONS_PRO);
  const prono=pronosticCard(vm,raw);
  const sections=[
    plus?['resume',resumeCard(vm)]:null,
    // Pronostic IASHARK (tous les matchs) avant la selection et l'avis (03/10/2026).
    prono?['prono',prono]:null,
    // Quand il remplace l'avis, il en prend la place (sec-avis : le sommaire y mene).
    selPro?[sansAvis?'avis':'selpro',selPro]:null,
    sansAvis?null:['avis',signalCard(vm)],
    plus?['chiffre',chiffreFouCard(vm)]:null,
    ['stats',stats?groupe({title:t('match_page.stats_group_title','Les stats du match'),sub:stats.indexOf('data-fold="book"')!==-1?t('match_page.stats_group_sub_book','Les chiffres des deux équipes, puis nos stats calculées avec leur marge.'):t('match_page.stats_group_sub','Données brutes des deux équipes.'),body:stats}):''],
    ['analyse',analyse?groupe({title:t('match_page.analysis_group_title','L’analyse IASHARK'),sub:t('match_page.analysis_group_sub','Ce que calcule notre modèle pour ce match.'),body:analyse}):''],
    ['questions',faqCard(vm,{locked:false})]
  ];
  paint(vm,sections,sansAvis?'':signalSticky(vm),'');
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
  sbkCompteurs(root.querySelector('[data-fold="book"]'));
}

// VUE VISITEUR (match payant sans Pro, ou match offert sans compte). Le match
// du jour (pickFreeMatchId, meme choix que l'accueil) reste gratuit mais exige
// un compte ; les autres necessitent Pro. La vraie protection est cote serveur
// (fonction match-data, fichiers publics sans champ premium).
// Regle du proprietaire : tout ce que l'IA donne est FERME, les stats brutes
// sont OUVERTES. Les blocs fermes ne lisent que des champs PUBLICS
// (has_signal, no_signal, prob_band) : aucun chiffre, aucune sortie du modele.
// Plus de « Le scenario des 15 premieres minutes » (contre-controle du
// 30/09/2026) : la simulation par tranches de 15 minutes est reservee aux Pro,
// meme sur le match offert (lib/premium-fields.js#PRO_ONLY_FIELDS de la fusion).
// opts : { free, title, href, cta }
function gateCard(vm,opts){
  const o=opts,raw=vm._raw||{},etat=etatAnalyse(raw),bande=etat==='ready'?bandeDe(raw):null;
  const contenu=[
    ['avis_item_bet','Le pari conseillé et sa cote'],
    ['avis_item_prob','La probabilité estimée par le modèle'],
    ['avis_item_model','L’avis du modèle sur le match'],
    // 30/09 : plus de « marches joueurs et buteurs » ici : les 2 buteurs sont reserves aux Pro.
    ['pro_gate_item_stats','Toutes les stats du match : forme, classement, face-à-face, comparatif'],
    ['pro_gate_item_faq','Les réponses aux questions fréquentes sur ce match']
  ].filter(([k],i)=>(etat!=='none'||i>1)&&(o.stats||(k!=='pro_gate_item_stats'&&k!=='pro_gate_item_faq')));
  const titre=etat==='none'?sansPari(raw):o.title;
  return `<section class="signal-card is-locked gate avis avis--lock reveal" aria-labelledby="gateTitle">
    <div class="sig-head">
      <span class="sig-eyebrow">${cardIcon('target')}${esc(t('match_page.avis_title','L’avis IASHARK'))}</span>
      ${etat==='ready'?`<span class="avis-ready"><i aria-hidden="true"></i>${esc(t('match_page.avis_ready','Analyse prête'))}</span>`:''}
    </div>
    <h2 id="gateTitle" class="avis-h">${esc(titre)}</h2>
    ${o.free?`<p class="avis-free">${esc(t('match_page.gate_free_text','Ce match est gratuit, mais il faut un compte IASHARK gratuit (inscription ou connexion) pour voir l’analyse.'))}</p>`:''}
    ${bande?`<div class="avis-band"><span>${esc(t('match_page.avis_band_label','Niveau du pari conseillé'))}</span>${bandBadge(bande)}</div>`:''}
    ${etat!=='none'?`<div class="sig-slip is-locked">
      <div class="sig-slip-main"><p class="sig-kicker">${esc(t('match_page.sig_bet_label','Pari recommandé'))}</p><div class="sig-ghost" aria-hidden="true"><span class="g1"></span><span class="g2"></span></div></div>
      <div class="sig-odds-box is-locked" aria-hidden="true">${cardIcon('lock')}</div>
    </div>`:''}
    <div class="avis-inc"><p>${esc(t('match_page.avis_includes','Ce que contient l’analyse'))}</p><ul class="gate-facts">${contenu.map(([k,fb])=>`<li>${insecable(k==='pro_gate_item_stats'?statsContenu(vm,true):t('match_page.'+k,fb))}</li>`).join('')}</ul></div>
    <a class="btn-gate avis-cta" href="${esc(o.href)}"${suivi('match_avis_unlock')}>${cardIcon('lock')}<span>${esc(String(o.cta).replace(/ (\S+)$/,'\u00a0$1'))}</span></a>
    ${o.free?'<p class="avis-trial" data-essai-annonce data-track="match_free_trial_hint" hidden></p>':''}
    <p class="sig-legal">${esc(t('match_page.avis_legal','Estimation, pas une garantie.'))}</p>
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
// Prix Pro de la version (19/09/2026) : MEME source que la page
// d'abonnement (lib/market-config.js#proOffer, depuis config/markets.json),
// donc devise et montant du marche du repertoire (GBP sur gb, MXN sur mx,
// ZAR sur za). Jamais ecrit en dur. Seules les durees PAYABLES
// (config/markets.json#checkoutOpen) sont annoncees ; aucune duree payable
// ou config absente = null, le mur garde sa ligne « Resiliable a tout
// moment ». 20/09/2026 : l'hebdo est annonce a cote du mensuel quand les
// deux sont payables (prix d'entree visible des la page match).
function prixPro(interval){
  const M=window.IASHARK_MARKET;
  if(!M||typeof M.proOffer!=='function')return null;
  try{
    const it=M.proOffer().intervals.filter(i=>i.interval===interval)[0];
    return it&&it.amount!=null&&it.open!==false&&it.text?it.text:null;
  }catch(e){return null;}
}
// Ligne de prix sous le bouton « Debloquer avec Pro » : hebdo + mensuel,
// mensuel seul, ou la mention generique quand rien n'est payable.
function lignePrixPro(){
  const mois=prixPro('month'),semaine=prixPro('week');
  // Apres « · », la mention reste d'un seul bloc : jamais un mot seul a la ligne.
  const bloc=x=>String(x).replace(/·\s*([^·]+)$/,(m,y)=>'· '+y.trim().replace(/ /g,'\u00a0'));
  if(mois&&semaine)return bloc(tf('pro_offer.price_week_month','{week}/semaine ou {month}/mois · résiliable à tout moment',{week:semaine,month:mois}));
  if(mois)return bloc(tf('pro_offer.price_month','{price}/mois · résiliable à tout moment',{price:mois}));
  return t('match_page.pro_gate_small','Résiliable à tout moment depuis votre compte.');
}
// Ce que Pro ajoute : la MEME liste que la grille de prix (assets/pricing-grid.js,
// FEATURES : lignes Pro ouvertes, meme ordre, memes textes pricing_grid.f_*,
// meme coche ronde), sur toutes les pages (controle des captures du
// 30/09/2026 : il en existait 3 versions). Plus de « Nos probabilites face aux
// cotes, marche par marche » : une seule cote en football (Bet365, non agree
// en France), rien a comparer. Contenu du Pro de la V3 (3/10/2026), dans le
// meme ordre que la grille. Seulement ce que CE match a : pas de ligne « pari »
// quand le modele n'en retient aucun, simulation seulement sur un match du
// moteur v3 (simulationV3), stats seulement si le match en a (o.stats), stats
// IASHARK seulement si ce match en a (vm.bookStats, branche stats-match ;
// absent ici = ligne masquee).
// FUSION avec stats-match et la copie V3 (samedi 3/10, 7 h) : garder CETTE
// liste et le texte fixe de f_stats (pas statsContenu, qui ajoute « buts par
// quart d'heure » : la ligne f_stats_iashark le dit deja), jamais l'ancienne
// liste du mur de la copie V3 (« Nos probabilites face aux
// cotes, marche par marche »).
const LISTE_PRO=[
  ['f_all_matches','Toutes les analyses du jour, dans chaque compétition suivie'],
  // 03/10/2026 : un pronostic sur chaque match (lib/pronostic.js), contenu Pro.
  ['f_pronostic','Le pronostic IASHARK de ce match, avec sa chance calculée'],
  ['f_pick','Le pari retenu, avec sa probabilité et ses raisons'],
  ['f_scenario','La simulation du match par tranches de 15 minutes'],
  ['f_stats_iashark','Les stats IASHARK : buts par quart d’heure, après la pause'],
  ['f_stats','Toutes les stats du match : forme, classement, face-à-face'],
  ['f_scores','Les scores les plus probables et les buts attendus'],
  ['f_scorers','Les buteurs les plus probables, dont les 3 buteurs du jour']
];
// Simulation par tranches de 15 minutes : seulement sur un match publie par le
// moteur v3 (moteur_v3.source = "v3", champ PUBLIC ecrit par lib/moteur-v3.js
// de la fusion). Match publie avant le branchement (pari de l'ancien moteur,
// fige jusqu'au coup d'envoi : lib/pick-freeze.js), match absent du moteur,
// interrupteur d'urgence, moteur eteint (MOTEUR_V3 = 0) : pas de simulation,
// pas de ligne.
function simulationV3(raw){
  const m=raw&&raw.moteur_v3;
  return !!(m&&m.source==='v3'&&m.raison!=='MOTEUR_V3_URGENCE');
}
const COCHE_PRO='<svg class="mgate-check" aria-hidden="true" focusable="false" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="rgba(32,213,239,.15)"/><path d="M6 10.3l2.6 2.6L14.2 7.3" fill="none" stroke="#20d5ef" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function proGate(vm,o){
  const raw=vm._raw||{},etat=etatAnalyse(raw),bande=etat==='ready'?bandeDe(raw):null;
  const contenu=LISTE_PRO.filter(([k])=>(k!=='f_pronostic'||raw.pronostic_dispo===true)&&(k!=='f_pick'||etat!=='none')&&(k!=='f_scenario'||simulationV3(raw))&&(k!=='f_stats'||o.stats)&&(k!=='f_stats_iashark'||!!vm.bookStats));
  const lignePrix=lignePrixPro();
  return `<section class="signal-card is-locked gate mgate avis avis--lock reveal" aria-labelledby="gateTitle">
    <div class="sig-head">
      <span class="sig-eyebrow">${cardIcon('target')}${esc(t('match_page.avis_title','L’avis IASHARK'))}</span>
      ${etat==='ready'?`<span class="avis-ready"><i aria-hidden="true"></i>${esc(t('match_page.avis_ready','Analyse prête'))}</span>`:''}
    </div>
    <div class="mgate-stage">
      ${apercuFactice(etat!=='none')}
      <div class="mgate-panel"><div class="mgate-card">
        <span class="mgate-lock" aria-hidden="true">${cardIcon('lock')}</span>
        <h2 id="gateTitle" class="mgate-title">${esc(t('match_page.pro_gate_title','Débloquez l’analyse complète de ce match'))}</h2>
        <p class="sr-only">${esc(t('match_page.pro_gate_sr','Aperçu flouté et factice : il ne contient aucune donnée de l’analyse. L’analyse complète de ce match est réservée aux abonnés Pro.'))}</p>
        ${etat==='none'?`<p class="mgate-note">${esc(sansPari(raw))}</p>`:''}
        ${bande?`<div class="mgate-band"><span>${esc(t('match_page.avis_band_label','Niveau du marché retenu'))}</span>${bandBadge(bande)}</div>`:''}
        <ul class="mgate-list">${contenu.map(([k,fb])=>`<li>${COCHE_PRO}<span>${esc(t('pricing_grid.'+k,fb))}</span></li>`).join('')}</ul>
        <div class="mgate-pricing" data-pricing-grid="ligne" data-pg-href="${esc(o.href)}" data-pg-track="match_gate_unlock" data-pg-cta-class="mgate-cta" data-pg-cta="${esc(t('match_page.pro_gate_cta','Débloquer avec Pro'))}">
          <a class="mgate-cta" href="${esc(o.href)}"${suivi('match_gate_unlock')}>${esc(t('match_page.pro_gate_cta','Débloquer avec Pro'))} <span aria-hidden="true">→</span></a>
          <p class="mgate-small">${esc(lignePrix)}</p>
        </div>
      </div></div>
    </div>
    <p class="sig-legal">${esc(t('match_page.avis_legal','Estimation, pas une garantie.'))}</p>
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
  // Decision de Clement (30/09/2026) : le visiteur voit aussi « Le chiffre fou » (page
  // francaise). Il ne lit que le champ PUBLIC stats_iashark_gratuit (premier but de chaque
  // equipe, buts apres la 75e de la ligue), jamais le detail Pro : publicCopy ci-dessus.
  paint(vm,[['avis',o.free?gateCard(vm,o):proGate(vm,o),true],estFr()?['chiffre',chiffreFouCard(vm)]:null],'','',{sansStats:true});
  if(!o.free)monterGrillePrix();
  else annoncerEssai();
}
// Match offert (« gratuit avec un compte ») : ligne « Essai Pro gratuit 7 jours
// (abonnement mensuel) » + lien vers l'abonnement, sous le bouton. Remplie par
// assets/essai-annonce.js (charge a la demande) seulement si le serveur ouvre
// l'essai, que le mois est payable dans ce pays et que la personne y a droit.
function annoncerEssai(){
  const go=()=>{try{if(window.IasharkEssai)window.IasharkEssai.annoncer(document);}catch(e){}};
  if(window.IasharkEssai)return go();
  if(document.querySelector('script[data-essai-loader]'))return;
  const s=document.createElement('script');s.src='/assets/essai-annonce.js';s.setAttribute('data-essai-loader','');s.onload=go;
  (document.head||document.documentElement).appendChild(s);
}
// Grille de prix, variante « ligne » (assets/pricing-grid.js, 30/09/2026) :
// prix Pro du marche, semaine en option, bouton, et l'essai seulement si le
// serveur le confirme. Le bouton et la ligne ci-dessus restent le repli (script
// absent ou lent). Les pages match statiques ne chargent pas le script : il
// est ajoute ici a la demande (il ajoute lui-meme sa feuille de style).
function monterGrillePrix(){
  const go=()=>{try{if(window.IasharkPricingGrid)window.IasharkPricingGrid.mountAll(document);}catch(e){}};
  if(window.IasharkPricingGrid)return go();
  if(document.querySelector('script[data-pg-loader]'))return;
  const s=document.createElement('script');s.src='/assets/pricing-grid.js';s.setAttribute('data-pg-loader','');s.onload=go;
  (document.head||document.documentElement).appendChild(s);
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
    let selProLue=null;
    if(window.IasharkApp){
      ctx=await window.IasharkApp.context();
      // Selection Pro du jour : lue en parallele de match-data (abonne Pro, essai, admin).
      if(ctx.isPro)selProLue=lireSelectionsPro(window.IasharkApp.supabase,id);
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
    SELECTIONS_PRO=ctx.isPro&&selProLue?await selProLue:[];
    VUE_PRO=!!ctx.isPro;
    // Detail Pro (simulation, Stats IASHARK) : jamais rendu hors vue Pro.
    if(!VUE_PRO){delete raw.sim_15min;delete raw.stats_iashark;}
    render(raw);
  }catch(e){
    root.innerHTML=`<div class="match-error"><b>${esc(e.message||t('match_page.generic_load_error','Erreur de chargement'))}</b><a href="${esc(lien(''))}">${esc(t('match_page.back_to_home','Retour à l\'accueil'))}</a></div>`;
  }
}
init();
})();
