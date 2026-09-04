(function(){'use strict';
const root=document.getElementById('matchRoot');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,d=1)=>n(v)===null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d});
const pct=v=>n(v)===null?'—':fmt(v)+'%';
const odds=v=>n(v)===null?'—':Number(v).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
const clamp=v=>Math.max(0,Math.min(100,n(v)||0));
const img=(src,alt)=>src?`<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">`:'';
const empty=t=>`<div class="empty">${esc(t)}</div>`;

// Selection du "match gratuit du jour" - doit rester identique a getChoc()
// dans index.html (meme calcul de confiance ovrConf/normEdge/normConf) pour
// que ce soit toujours EXACTEMENT le match mis en avant sur l'accueil qui
// reste accessible sans Pro, jamais un autre. m.hot n'est PAS ce signal
// (plusieurs matchs peuvent etre "hot" le meme jour - ecart trouve en test
// reel : 7 matchs hot sur 13, alors qu'un seul doit rester gratuit).
function normConf_(c){c=parseFloat(c)||0;return c<=1?c*10:c;}
function parseEdge_(m){if(m==null||m.edge==null||m.edge==='')return null;const v=parseFloat(String(m.edge).replace(',','.'));return isNaN(v)?null:v;}
function normEdge_(e){if(e==null||isNaN(e))return null;if(e<=1)return e*100;if(e<=10)return e*10;return Math.min(e,100);}
function ovrConf_(m){const e=normEdge_(parseEdge_(m));return e!=null?e:Math.min(normConf_(m.conf)*10,100);}
function todayParis_(){
  const f=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date()),r={};
  f.forEach(x=>{r[x.type]=x.value;});
  return {day:`${r.year}-${r.month}-${r.day}`,now:`${r.year}-${r.month}-${r.day} ${r.hour}:${r.minute}`};
}

// Icones : purement decoratives, memes tokens de couleur, aucune emoticone.
const ICONS={
  h2h:'<path d="M8 3v4M16 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  compare:'<path d="M6 20V10M12 20V4M18 20v-7"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  whistle:'<path d="M4 12a5 5 0 0 1 5-5h6.5A4.5 4.5 0 0 1 20 11.5a4.5 4.5 0 0 1-4.5 4.5H12l-3 3v-3a5 5 0 0 1-5-4Z"/><circle cx="8.5" cy="12" r="1.4"/>',
  reasons:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  target2:'<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/>',
  chart:'<path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6"/>',
  trophy:'<path d="M8 3h8v4a4 4 0 0 1-8 0V3Z"/><path d="M8 4H5a3 3 0 0 0 3 5M16 4h3a3 3 0 0 1-3 5"/><path d="M12 11v3M9.5 18h5M10 15h4l.5 3h-5l.5-3Z"/>',
  leaf:'<path d="M5 19c8 0 14-6 14-14-8 0-14 6-14 14Z"/><path d="M5 19c2-4 5-7 9-9"/>',
  cloud:'<path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 8.5 4.5 4.5 0 0 1 15.5 18H7Z"/>',
  bulb:'<path d="M9 18h6M10 21h4M7 9a5 5 0 1 1 10 0c0 2-1 3-2 4.2-.5.6-.8 1.1-.8 1.8H9.8c0-.7-.3-1.2-.8-1.8C8 12 7 11 7 9Z"/>',
  scale:'<path d="M12 3v18M7 7 4 13a3 3 0 0 0 6 0L7 7ZM17 7l-3 6a3 3 0 0 0 6 0l-3-6ZM4 7h6M14 7h6"/>',
  alert:'<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.01"/>',
  trend:'<path d="M4 17 10 11l4 4 6-8"/><path d="M16 6h4v4"/>',
  faq:'<circle cx="12" cy="12" r="9"/><path d="M9.2 9.3a2.8 2.8 0 0 1 5.5.8c0 1.9-2.7 2.2-2.7 4"/><circle cx="12" cy="17.4" r=".9" fill="currentColor" stroke="none"/>',
  lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'
};
const cardIcon=key=>ICONS[key]?`<svg viewBox="0 0 24 24" class="card-icon">${ICONS[key]}</svg>`:'';
const card=(title,body,cls='',icon='')=>`<section class="card reveal ${cls}"><h2>${cardIcon(icon)}${esc(title)}</h2>${body}</section>`;

function probRing(value,big){
  if(n(value)===null)return '';
  const r=big?46:20,c=2*Math.PI*r,offset=c*(1-clamp(value)/100),size=big?104:48,cx=size/2;
  return `<div class="prob-ring${big?' big':''}"><svg viewBox="0 0 ${size} ${size}"><circle class="track" cx="${cx}" cy="${cx}" r="${r}"></circle><circle class="fill" cx="${cx}" cy="${cx}" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-target="${offset.toFixed(1)}"></circle></svg><div class="val">${Math.round(value)}<small>%</small></div></div>`;
}

function formStrip(form){
  if(!form)return '';
  const chars=String(form).slice(-5).split('').filter(c=>'WDL'.includes(c.toUpperCase()));
  if(!chars.length)return '';
  return `<div class="form-strip">${chars.map(c=>`<i class="f-${c.toLowerCase()}">${esc(c)}</i>`).join('')}</div>`;
}
function teamMeta(s){
  if(!s)return '';
  return `<small>${s.rank}${s.rank===1?'er':'e'} · ${s.pts} pts</small>${formStrip(s.form)}`;
}

function confidenceBadge(label){
  if(!label)return '';
  const l=label.toLowerCase();
  const cls=l.includes('élev')||l.includes('elev')?'b-green':l.includes('moy')?'b-orange':l.includes('faib')?'b-red':'b-cyan';
  return `<span class="badge ${cls}">Confiance ${esc(label)}</span>`;
}
function riskBadge(code){
  if(!code)return '';
  const map={FAIBLE:['b-green','Risque faible'],MODERE:['b-orange','Risque modéré'],ELEVE:['b-red','Risque élevé']};
  const [cls,label]=map[code]||['b-cyan',code];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}

// Rangee de tags "enjeu" : uniquement des signaux 100% reels et calcules -
// nom de competition (reel), meteo (reel, OpenWeather deja branche), et un
// seul tag derive d'un vrai seuil xG combine (jamais une categorie inventee
// type "derby" qui demanderait une liste de rivalites maintenue a la main).
// tagsRow() a ete supprimee de la page : elle affichait le nom de la
// competition (deja dans l'en-tete) et un tag "match offensif attendu"
// redondant avec les buts attendus. Sa seule information propre, la meteo,
// a rejoint la ligne du stade ci-dessous.

// Barre 1X2 : une seule bande divisee en 3 (domicile/nul/exterieur), sous
// les series de forme des deux equipes dans la carte d'en-tete - remplace
// l'ancien affichage en 3 chiffres empiles dans "Notre lecture du match"
// (retire de la, le pari recommande y reste seul narratif). Meme donnee
// (vm.model.probabilities), juste deplacee et reformattee en bande.
function probBar(vm){
  const p=vm.model.probabilities;
  if(!p)return '';
  const homeName=vm.identity.home.name,awayName=vm.identity.away.name;
  const home=n(p.home)||0,draw=n(p.draw)||0,away=n(p.away)||0,total=home+draw+away;
  if(total<=0)return '';
  // La barre 1X2 etait vert / gris / rouge : le vert et le rouge y
  // designaient simplement "domicile" et "exterieur", ce qui suggere a tort
  // "bon" et "mauvais", et faisait du plus gros bloc de la page un aplat
  // multicolore. Elle passe en degrade de gris avec le CYAN sur l'issue la
  // plus probable - la couleur porte enfin une information (le favori du
  // modele) au lieu d'une identite d'equipe.
  const top=Math.max(home,draw,away);
  const seg=(v,cls,label)=>{
    const w=v/total*100;
    const lead=v===top?' is-lead':'';
    return `<span class="${cls}${lead}" style="width:${w.toFixed(2)}%">${w>=13?pct(v):''}</span>`;
  };
  return `<div class="hero-probbar">
    <div class="prob-bar">${seg(home,'home')}${seg(draw,'draw')}${seg(away,'away')}</div>
    <div class="prob-legend"><span>${esc(homeName)}</span><span>Nul</span><span>${esc(awayName)}</span></div>
  </div>`;
}

function hero(vm){
  const i=vm.identity,s=i.standings||{};
  return `<section class="card hero reveal">
    <div class="hero-top">
      <div class="hero-league">${img(i.league.logo,i.league.name)}<span>${esc(i.league.name)}</span></div>
      <span class="hero-time">${esc(i.date||'Date à confirmer')} · ${esc(i.time||'—')}${vm.model.available?' · <span class="ready"><i></i>Analyse disponible</span>':''}</span>
    </div>
    <div class="hero-teams">
      <div class="hero-team">${img(i.home.logo,i.home.name)}<b>${esc(i.home.name)}</b>${teamMeta(s.home)}</div>
      <div class="hero-vs">VS</div>
      <div class="hero-team">${img(i.away.logo,i.away.name)}<b>${esc(i.away.name)}</b>${teamMeta(s.away)}</div>
    </div>
    ${probBar(vm)}
    ${vm.conditions.venue||vm.conditions.weather?`<div class="hero-venue">${vm.conditions.venue?`<span><svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>${esc(vm.conditions.venue)}</span>`:''}${vm.conditions.weather?`<span>${cardIcon('cloud')}${esc(vm.conditions.weather.temperature)} · ${esc(vm.conditions.weather.description)}</span>`:''}</div>`:''}
  </section>`;
}

// Recommandation : ring + Score IASHARK + Cote juste + Cote marche + Value -
// tous deja calcules cote pipeline/view-model, aucune nouvelle donnee.
// Notre lecture du match : phrase deterministe (jamais un nouvel appel
// LLM) qui distingue l'equipe en tete au 1X2 du marche reellement
// recommande quand ils different, en reutilisant le texte de raison DEJA
// genere (facteur_x) - jamais un nouveau texte invente ici, juste un
// gabarit autour de donnees et de textes deja reels.
function leadingSide(p,homeName,awayName){
  if(!p)return null;
  if(p.home>=p.draw&&p.home>=p.away)return{label:homeName,key:'home'};
  if(p.away>=p.draw&&p.away>=p.home)return{label:awayName,key:'away'};
  return{label:'Le nul',key:'draw'};
}
function findMarket(list,re){return (list||[]).find(m=>re.test(m.market||''))||null;}
function matchReadingCard(vm){
  const p=vm.model.probabilities,r=vm.model.recommendation,homeName=vm.identity.home.name,awayName=vm.identity.away.name;
  if(!p||!r)return '';
  const leading=leadingSide(p,homeName,awayName);
  const marketLower=(r.market||'').toLowerCase();
  const matchesLeader=(leading.key==='home'&&(marketLower.includes('domicile')||marketLower===homeName.toLowerCase()))
    ||(leading.key==='away'&&(marketLower.includes('exterieur')||marketLower.includes('extérieur')||marketLower===awayName.toLowerCase()))
    ||(leading.key==='draw'&&marketLower.includes('nul'));
  const locSuffix=leading.key==='home'?' à domicile':leading.key==='away'?' à l\'extérieur':'';
  const sentence=matchesLeader
    ?`${leading.label} a l'avantage${locSuffix}, et c'est le marché que nous recommandons.`
    :`${leading.label} a l'avantage${locSuffix}, mais ce n'est pas le marché que nous recommandons — nous recommandons plutôt ${marcheFr(vm,r.market)}.`;
  const reason=vm.editorial.decisiveFactor;
  // Le marche recommande est deja affiche dans cette rangee. Quand c'est
  // lui-meme un BTTS, la tuile BTTS generique repetait exactement le meme
  // libelle et le meme pourcentage deux fois cote a cote.
  const btts=/btts|deux [eé]quipes marquent/i.test(marketLower)
    ?null
    :findMarket(vm.model.marketsCompared,/btts/i);
  const x=vm.model.expectedGoals;
  const totalXg=x&&n(x.home)!==null&&n(x.away)!==null?x.home+x.away:null;
  const risk=vm.editorial.risk;
  const risqueDescriptif=risk&&!['FAIBLE','MODERE','ELEVE'].includes(risk)?risk:null;
  return `<section class="card lecture reveal">
    <h2>${cardIcon('bulb')}Notre lecture du match</h2>
    <p class="reading">${esc(texteLisible(vm,sentence))}${reason?' '+esc(texteLisible(vm,reason)):''}</p>
    ${risqueDescriptif?`<div class="risk-note"><b>⚠</b><span>${esc(texteLisible(vm,risqueDescriptif))}</span></div>`:''}
    <div class="lecture-stats">
      ${totalXg!==null?`<div><small>Buts attendus</small><b>${fmt(totalXg)}</b></div>`:''}
      ${btts?`<div><small>BTTS</small><b>${pct(btts.probability)}</b></div>`:''}
      <div><small>${esc(marcheFr(vm,r.market))}</small><b>${pct(r.probability)}</b></div>
      ${vm.model.iasharkScore!==null?`<div><small>Confiance analyse</small><b>${fmt(vm.model.iasharkScore/10)}/10</b></div>`:''}
    </div>
  </section>`;
}

// Tient sur une seule ligne (desktop) : marche + probabilite (ring
// compact) + cotes + value + badges, plus de rangee separee "Score
// IASHARK" (retire, redondant avec la confiance deja affichee dans
// "Notre lecture du match").
// LE SIGNAL — carte-ancre de la page, placee juste sous l'en-tete.
// Un parieur qui arrive doit voir immediatement CE QU'ON RECOMMANDE, A
// QUELLE COTE, et SI LE MARCHE EST D'ACCORD. Avant, cette carte arrivait en
// 4e position, apres l'editorial : le produit vendu n'etait pas visible sans
// defiler. Aucune donnee nouvelle - marche, probabilite, cote et badges
// viennent tous du view-model, comme avant.
//
// L'ecart modele/marche est affiche HONNETEMENT, y compris quand il est
// defavorable : si la cote proposee est moins interessante que notre propre
// cote equitable, on l'ecrit. Un produit payant ne doit jamais maquiller une
// value negative en signal positif.
function edgeVerdict(edge){
  if(edge===null)return null;
  if(edge>=3)return{cls:'pos',text:`Le marché sous-estime ce scénario de ${fmt(Math.abs(edge))} points de probabilité.`};
  if(edge<=-3)return{cls:'neg',text:`La cote proposée est moins intéressante que notre estimation (${fmt(Math.abs(edge))} points d'écart en défaveur du parieur).`};
  return{cls:'flat',text:'Le marché est aligné sur notre estimation : l’écart reste dans la marge d’erreur du modèle.'};
}
// LE SIGNAL. Le marche recommande domine, et la comparaison modele/marche
// est lue d'un coup d'oeil sur deux barres. Le bandeau du bas ne reprend PAS
// la probabilite modele, la probabilite marche ni l'ecart : ils sont deja
// dans le tableau au-dessus. Il ne porte que ce que le tableau ne dit pas,
// les deux cotes.
function signalCard(vm){
  const r=vm.model.recommendation;
  if(!r)return card('Le signal IASHARK',empty(vm.model.unavailableReason||'Aucun marché ne franchit les seuils de confiance ou de cote minimale pour ce match — IASHARK préfère ne pas se prononcer.'),'signal-card','target');
  const prob=n(r.probability);
  const fair=prob!==null&&prob>0?100/prob:null;
  const marketOdds=n(vm.model.recommendedOdds);
  const implied=marketOdds!==null&&marketOdds>0?100/marketOdds:null;
  const edge=(prob!==null&&implied!==null)?Math.round((prob-implied)*10)/10:null;
  const verdict=edgeVerdict(edge);
  const kpi=(label,value,accent)=>`<div class="min-w-0 border-l border-white/[.07] pl-4 first:border-l-0 first:pl-0"><span class="block text-xs leading-5 text-soft">${esc(label)}</span><b class="mt-1 block text-xl font-semibold tabular-nums ${accent?'text-cyan':'text-ink'}">${value}</b></div>`;
  const compare=(label,value,isModel)=>value===null?'':`<div><div class="mb-2 flex items-baseline justify-between gap-3 text-sm"><span class="text-soft">${label}</span><b class="tabular-nums ${isModel?'text-cyan':'text-ink'}">${pct(value)}</b></div><div class="h-2 overflow-hidden rounded-full bg-white/[.07]" role="img" aria-label="${label} ${pct(value)}"><span class="block h-full rounded-full ${isModel?'bg-cyan':'bg-white/40'} motion-safe:transition-[width] motion-safe:duration-700" style="width:${clamp(value)}%"></span></div></div>`;
  return `<section class="signal-card reveal overflow-hidden rounded-2xl border border-cyan/20 bg-panel p-5 shadow-2xl shadow-black/30 sm:p-7 lg:p-8">
    <div class="flex flex-wrap items-center justify-between gap-3"><span class="inline-flex items-center gap-2 text-sm font-semibold text-cyan">${cardIcon('target')}Le signal IASHARK</span><div class="sig-badges flex flex-wrap gap-2">${confidenceBadge(r.reliability)}${riskBadge(vm.editorial.riskCode)}</div></div>
    <div class="mt-7 grid gap-7 lg:grid-cols-[minmax(0,1.35fr)_minmax(250px,1fr)] lg:items-end">
      <div><span class="block text-sm text-soft">Marché recommandé</span><h1 class="mt-2 max-w-3xl text-balance text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-4xl">${esc(marcheFr(vm,r.market))}</h1></div>
      <div class="space-y-4 rounded-xl border border-white/[.07] bg-black/15 p-4" aria-label="Comparaison du modèle et du marché">${compare('Probabilité modèle',prob,true)}${compare('Probabilité marché',implied,false)}${edge!==null?`<p class="flex items-center justify-between border-t border-white/[.07] pt-3 text-sm text-soft"><span>Écart détecté</span><b class="tabular-nums text-cyan">${edge>0?'+':''}${fmt(edge)} pts</b></p>`:''}</div>
    </div>
    <div class="mt-7 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-white/[.07] pt-5">${kpi('Cote juste',odds(fair))}${kpi('Cote marché',odds(marketOdds))}</div>
    ${verdict?`<p class="mt-6 max-w-3xl text-sm leading-6 text-soft">${esc(verdict.text)}</p>`:''}
  </section>`;
}


// Buteur a surveiller : vm.players.scoringThreat, classe cote view-model
// (saison en cours uniquement, score pilote par les tirs cadres).
// La carte n'affiche QUE des statistiques mesurees. La "probabilite de
// marquer" et la "cote equitable" du joueur ont ete retirees : elles
// n'avaient pas ete demandees, et la seconde n'etait que l'inverse de la
// premiere - jamais une cote reellement proposee par un operateur pour ce
// joueur. Sur un produit payant, mieux vaut ne rien afficher qu'un prix
// qui n'existe nulle part.
// Justification "pourquoi ce joueur" : phrase deterministe (jamais un
// nouvel appel LLM), assemblee uniquement a partir des vraies stats deja
// calculees pour ce candidat (goals90/shotsOn90/minutes, cf
// scoringThreatRanking). Rien n'est invente, juste mis en phrase.
// Buteur a surveiller. AVANT : la carte affichait "Titulaire 8%" a cote
// d'un discours sur "le profil le plus dangereux de la rencontre" - une
// contradiction qui detruisait la credibilite, et un chiffre qui n'aide pas
// a decider. REMPLACE par un vrai tableau de statistiques, avec surtout
// l'ECHANTILLON sur lequel elles sont calculees : "2,9 buts/90" ne veut
// rien dire sans savoir que c'est mesure sur 62 minutes. Rendre
// l'echantillon visible est ce qui rend la stat credible, pas ce qui
// l'affaiblit.
// Toutes les valeurs viennent de vm.players.scoringThreat (deja calculees
// par lib/match-view-model.js) - aucune donnee nouvelle, aucun chiffre
function threatSample(p){
  const bits=[];
  if(n(p.appearances)!==null)bits.push(`${p.appearances} match${p.appearances>1?'s':''} joué${p.appearances>1?'s':''}`);
  if(n(p.starts)!==null)bits.push(p.starts>0?`${p.starts} titularisation${p.starts>1?'s':''}`:'aucune titularisation');
  if(n(p.minutes)!==null&&p.minutes>0)bits.push(`${Math.round(p.minutes)} minutes jouées`);
  return bits.length?bits.join(' · '):'';
}
// L'API renvoie le poste en anglais. Repli sur la valeur brute si elle sort
// de ces quatre cas : mieux vaut un mot anglais qu'un poste efface.
const POSTES={goalkeeper:'Gardien',defender:'Défenseur',midfielder:'Milieu',attacker:'Attaquant'};
const poste=v=>{const k=String(v||'').trim();return POSTES[k.toLowerCase()]||k;};

// Le joueur le plus dangereux du match.
//
// La carte menait avec sa probabilite de marquer en 42px cyan. Le chiffre
// etait juste, mais il criait plus fort que le nom du joueur - or on vient
// d'abord savoir DE QUI on parle. Reprise plus sobre : rien au-dessus de
// 20px, une seule couleur d'accent, et les chiffres secondaires regroupes
// dans un panneau encastre plutot qu'en tableau borde.
//
// Aucune donnee nouvelle : ce sont exactement les memes valeurs qu'avant,
// toutes deja calculees (probabilite de marquer par lib/insights.js, le
// reste par playerAnalytics).
function threatsCard(vm){
  const list=vm.players.scoringThreat;
  if(!list.length)return '';
  const p=list[0];
  const pid=n(p.id);
  const href=pid!==null?` href="/joueur.html?m=${esc(vm.id)}&p=${pid}"`:'';
  const tag=pid!==null?'a':'div';
  const prob=n(p.scoringProbability);

  // Trois chiffres au maximum dans le panneau, et seulement ceux qui
  // existent vraiment : une colonne vide vaut moins que deux colonnes
  // pleines.
  // Deux decimales fixes sur les moyennes par 90 : "1,30" et non "1,3", pour
  // que les trois colonnes du panneau s'alignent au lieu de danser.
  const deux=v=>Number(v).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const stats=[
    n(p.goals90)!==null&&p.goals90>0?[deux(p.goals90),'Buts / 90 min']:null,
    n(p.shotsOn90)!==null&&p.shotsOn90>0?[deux(p.shotsOn90),'Tirs cadrés / 90 min']:null,
    n(p.expectedGoals90)!==null?[deux(p.expectedGoals90),'Buts attendus / 90 min']:null,
    n(p.assists90)!==null&&p.assists90>0?[deux(p.assists90),'Passes déc. / 90 min']:null,
    n(p.rating5)!==null?[Number(p.rating5).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}),'Note moyenne']:null
  ].filter(Boolean).slice(0,3);

  const sample=threatSample(p);
  const largeur=prob===null?null:Math.max(0,Math.min(100,prob));

  return card('Buteur à surveiller',`<${tag} class="threat group"${href}>
    <div class="threat-id">
      ${img(p.photo,p.name)}
      <div class="threat-who">
        <b>${esc(p.name)}</b>
        <small>${esc(p.team||'')}${p.position?' · '+esc(poste(p.position)):''}</small>
      </div>
      ${list.length>1?'<span class="threat-rank">Menace n°1</span>':''}
    </div>

    ${prob===null?'':`<div class="threat-prob">
      <div class="threat-prob-tete">
        <span>Probabilité de marquer</span>
        <b>${pct(prob)}</b>
      </div>
      <div class="threat-jauge" role="img" aria-label="Probabilité de marquer : ${pct(prob)}"><i style="width:${largeur}%"></i></div>
    </div>`}

    ${stats.length?`<div class="threat-panneau">${stats.map(([v,k])=>
      `<div><b>${v}</b><span>${esc(k)}</span></div>`).join('')}</div>`:''}

    <div class="threat-pied">
      ${sample?`<span class="threat-sample${p.thinSample?' is-thin':''}">${esc(sample)}</span>`:'<span></span>'}
      ${pid!==null?'<span class="threat-lien">Voir la fiche <i aria-hidden="true">→</i></span>':''}
    </div>
    ${p.thinSample?'<p class="threat-alerte">Temps de jeu limité sur ce championnat : ces moyennes par 90 minutes reposent sur peu de minutes et restent fragiles.</p>':''}
  </${tag}>`,'threats-card','target2');
}

// "Ce qu'il faut savoir" : classification deja faite par
// lib/insights.js#classifyKeyInsights a partir de signaux DEJA reels
// (matchups a cibler, absences cles, ecart modele/marche) - simple
// affichage ici, aucune nouvelle donnee.
const INSIGHT_STYLE={
  positive_home:['b-green','✓'],positive_away:['b-green','✓'],
  watch:['b-orange','!'],contradiction:['b-orange','⇄']
};
function keyInsightsCard(vm){
  const list=vm.keyInsights;
  if(!list.length)return '';
  return card('Ce qu\'il faut savoir',`<div class="insights-grid">${list.map(item=>{
    const [cls,mark]=INSIGHT_STYLE[item.type]||['b-cyan','·'];
    return `<div class="insight"><div class="insight-head"><span class="insight-mark ${cls}">${mark}</span><b>${esc(texteLisible(vm,item.title))}</b></div><p>${esc(texteLisible(vm,item.text))}</p></div>`;
  }).join('')}</div>`,'','bulb');
}


// Value potentielle : le marche du plus gros ecart absolu deja identifie
// par vm.marketsWatch (lui-meme derive de markets_compared reel) - jamais
// un nouveau calcul, juste la mise en avant du 1er de la liste deja triee.
function valuePotentialCard(vm){
  const top=vm.marketsWatch[0];
  if(!top||top.edge===null||Math.abs(top.edge)<4)return '';
  return card('Value potentielle',`<div class="value-potential"><b>${esc(marcheFr(vm,top.market))}</b><p>${top.edge>=0?`Ce marché présente la plus grosse value selon notre modèle (écart de +${fmt(top.edge)}% avec le marché).`:`Le marché est nettement au-dessus de notre modèle sur ce pari (écart de ${fmt(top.edge)}%) - à interpréter avec prudence.`}</p></div>`,'value-card','trophy');
}

// Matchup : vm.matchupScores, categories reellement mesurables (attaque/
// defense/possession/discipline/coups de pied arretes - cf
// lib/insights.js#computeMatchup). Categories non mesurables avec nos
// donnees (pressing, transitions, bloc defensif...) volontairement
// absentes plutot qu'inventees.
function matchupCard(vm){
  const m=vm.matchupScores;
  if(!m)return '';
  const homeName=vm.identity.home.name,awayName=vm.identity.away.name;
  // AVANT : le nom des deux equipes etait repete a CHAQUE ligne, en 10px,
  // ce qui remplissait la carte de bruit et masquait la seule information
  // utile - qui domine, et de combien. Desormais les noms n'apparaissent
  // qu'une fois en en-tete, et chaque categorie devient une barre centree
  // dont l'inclinaison montre l'ecart reel.
  // L'avantage vient de c.advantage, deja calcule dans lib/insights.js :
  // on ne le recalcule pas ici, car il tient compte du sens de la mesure
  // (encaisser MOINS de buts est un avantage, pas un desavantage).
  const rows=m.categories.map(c=>{
    const h=Math.abs(Number(c.home)||0),a=Math.abs(Number(c.away)||0),tot=h+a;
    const ecart=tot?Math.abs(h-a)/tot:0;
    const pente=clamp(50+ecart*50);
    const homeWin=c.advantage==='home',awayWin=c.advantage==='away';
    const partHome=homeWin?pente:awayWin?100-pente:50;
    return `<div class="mu-row">
      <span class="mu-val${homeWin?' win':''}">${fmt(c.home)}</span>
      <div class="mu-mid">
        <b>${esc(c.label)}${c.advantage==='égalité'?' · égalité':''}<em>${esc(c.unit||'')}${c.lowerIsBetter?' · moins = mieux':''}</em></b>
        <div class="mu-bar"><i class="mu-h${homeWin?' win':''}" style="width:${partHome}%"></i><i class="mu-a${awayWin?' win':''}" style="width:${100-partHome}%"></i></div>
      </div>
      <span class="mu-val${awayWin?' win':''}">${fmt(c.away)}</span>
    </div>`;
  }).join('');
  const total=(Number(m.globalHome)||0)+(Number(m.globalAway)||0);
  const partGlobal=total?clamp(Number(m.globalHome)/total*100):50;
  const homeMieux=Number(m.globalHome)>=Number(m.globalAway);
  return card('Matchup : comment les équipes se correspondent',
    `<div class="mu-head"><span>${logoEquipe(vm.identity.home.logo,homeName)}${esc(homeName)}</span><span>${logoEquipe(vm.identity.away.logo,awayName)}${esc(awayName)}</span></div>
     <div class="mu-rows">${rows}</div>
     <div class="mu-global">
       <div class="mu-g-side"><b class="${homeMieux?'win':''}">${fmt(m.globalHome)}<small>/10</small></b></div>
       <div class="mu-g-bar"><i style="width:${partGlobal}%"></i></div>
       <div class="mu-g-side right"><b class="${homeMieux?'':'win'}">${fmt(m.globalAway)}<small>/10</small></b></div>
     </div>
     <p class="mu-foot">Note globale, toutes catégories confondues.</p>`,
    '','scale');
}

// "Stats a ne pas surinterpreter" : signale les victoires a marge etroite
// dans le vrai historique recent (vm.formNote, cf
// lib/insights.js#formMarginNote) - repli honnete a la place d'un indice
// de force des adversaires recents qu'on ne peut pas calculer sans appel
// API supplementaire par adversaire.
function formNoteCard(vm){
  const home=vm.formNote.home,away=vm.formNote.away;
  if(!home&&!away)return '';
  const line=(name,note)=>note?`<div class="caveat"><b>!</b><span><b>${esc(name)}</b> : ${note.wins} victoire${note.wins>1?'s':''} sur les ${note.sample} derniers matchs, mais ${note.narrowWins} à un seul but d'écart.</span></div>`:'';
  return card('Stats à ne pas surinterpréter',`${line(vm.identity.home.name,home)}${line(vm.identity.away.name,away)}`,'','alert');
}

// Forme reelle : vrais resultats recents (form_home/away deja exposes),
// tendance reelle (vm.formTrend, points W/D/L des vrais resultats - cf
// lib/insights.js#computeFormTrend). Jamais une note de forme fabriquee.
// formReelleCard() a ete supprimee : elle re-affichait la serie WDL des deux
// equipes, deja presente dans l'en-tete de la page (formStrip dans hero()).
// Pure duplication, retiree a la demande de l'utilisateur.


// Sorties modele : xG (avec les logos des 2 equipes) + Scores probables -
// les probabilites 1X2 sont retirees d'ici (deja dans "Notre lecture du
// match" juste au-dessus, redondant).
function outputsCard(vm){
  const x=vm.model.expectedGoals,s=vm.model.scores,i=vm.identity;
  // Une colonne qui n'affiche que "indisponible" occupait la moitie de la
  // carte pour ne rien dire. Mais taire completement l'absence serait pire :
  // le lecteur ne sait plus si la donnee manque ou si elle n'existe pas.
  // Compromis : on n'affiche que les colonnes qui ont du contenu, et ce qui
  // manque est signale en une ligne discrete sous la carte. Si TOUT manque,
  // la carte disparait - une carte vide n'affirme rien d'utile.
  const cols=[],manquant=[];
  if(x){
    cols.push(`<div class="outputs-col outputs-xg"><small>Buts attendus (xG)</small><div class="xg-row">${img(i.home.logo,i.home.name)}<b>${fmt(x.home)}</b><span>xG</span><b>${fmt(x.away)}</b>${img(i.away.logo,i.away.name)}</div></div>`);
  } else manquant.push('xG indisponibles');
  if(s.length){
    // Trois pastilles de largeur egale se cassaient sur deux lignes et ne
    // disaient rien de la hierarchie entre les scores. Des barres classees
    // montrent tout de suite lequel domine, et ne debordent jamais.
    const maxP=Math.max.apply(null,s.map(sc=>Number(sc.probability)||0))||1;
    cols.push(`<div class="outputs-col"><small>Scores les plus probables</small><div class="score-bars">${s.map(sc=>`<div class="score-bar"><b>${esc(sc.score)}</b><i><span style="width:${clamp(Number(sc.probability)/maxP*100)}%"></span></i><small>${pct(sc.probability)}</small></div>`).join('')}</div></div>`);
  } else manquant.push('Scores probables indisponibles');
  if(!cols.length)return '';
  return card('Ce que dit le modèle',
    `<div class="outputs${cols.length===1?' outputs-1col':' outputs-2col'}">${cols.join('')}</div>`
    +(manquant.length?`<p class="outputs-missing">${esc(manquant.join(' · '))}.</p>`:''));
}

// Comparatif des deux equipes. AVANT : ce tableau etait titre "Pourquoi le
// pari ressort ?" alors qu'il ne contient qu'une comparaison generique
// (tirs, possession, corners, fautes...) qui n'explique rien du marche
// recommande. Le titre promettait une justification que le contenu ne
// donnait pas. CORRIGE de deux facons : le titre dit desormais ce que le
// tableau est reellement, ET les lignes qui pesent vraiment sur le marche
// recommande sont mises en avant, ce qui cree le lien qui manquait.
// La correspondance marche -> lignes est deterministe, jamais un texte
// genere : on lit le libelle du marche deja recommande.
const MARKET_KEY_ROWS=[
  [/btts|deux[\s-]?equipes|both/i,['Buts marqués','Buts concédés'],'les deux équipes marquent'],
  [/corner/i,['Corners'],'le nombre de corners'],
  [/carton|card/i,['Fautes'],'le nombre de cartons'],
  [/over|under|plus de|moins de|\bbut/i,['Buts marqués','Buts concédés','Tirs cadrés'],'le nombre de buts'],
  [/./,['Buts marqués','Buts concédés','Possession'],'l’issue du match']
];
function keyRowsForMarket(market){
  const label=String(market||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  for(const [re,rows,topic] of MARKET_KEY_ROWS){ if(re.test(label))return{rows,topic}; }
  return{rows:[],topic:null};
}
// Comparatif des deux equipes.
//
// Un vrai tableau, plus une seule barre pleine largeur. Trois idees reprises
// de tableaux de donnees sombres examines sur 21st.dev, adaptees :
//   - le repere visuel vit DANS la ligne, minuscule, et ne remplace jamais le
//     nombre : une micro-barre centree qui penche du cote de l'equipe devant ;
//   - les lignes sont regroupees par theme, sinon neuf rangees se lisent
//     comme une liste sans relief ;
//   - un pied conclut, au lieu de laisser le lecteur compter lui-meme.
//
// Le sens compte : sur "Buts concedes" et "Fautes", le plus petit gagne.
// Sur "Hors-jeu" et "Arrets", aucun des deux ne gagne - plus d'arrets veut
// surtout dire plus de tirs subis. Ces deux-la n'ont donc pas de verdict et
// ne comptent pas dans le total du pied.
// Logo d'equipe accole a son nom. Volontairement SANS pastille ronde ni
// fond : les ecussons de club ont leur propre forme (bouclier, cercle,
// blason) et un masque circulaire leur rogne les angles. On les pose tels
// qu'ils sont, sur le fond de la carte.
// Traduction d'un libelle de marche en francais courant, avec les noms des
// deux equipes. Voir lib/market-labels.js : "DC 12" devient "PSG ou Monaco
// gagne, sans match nul", et tous les seuils a virgule disparaissent.
// Appliquee a l'AFFICHAGE seulement : les donnees gardent les libelles du
// moteur, dont dependent la selection du marche et le comparatif.
function marcheFr(vm,libelle){
  const t=window.IasharkMarketLabels;
  return t?t.marketLabelFr(libelle,{home:vm.identity.home.name,away:vm.identity.away.name}):String(libelle||'');
}

// Nettoyage des textes rediges (editorial, matchups, points de vigilance).
// Ils citent parfois le libelle brut d'un marche - "Miser sur Premiere
// mi-temps moins de 1.5 but..." - et ecrivent les decimales avec un point.
//
// On remplace donc, DANS le texte, tout libelle de marche connu par sa
// version francaise, puis on passe les decimales a la virgule. Le texte
// lui-meme n'est jamais reecrit : seuls ces deux motifs sont touches.
function texteLisible(vm,texte){
  var t=String(texte==null?'':texte);
  if(!t)return t;
  var libelles=[];
  if(vm.model.recommendation&&vm.model.recommendation.market)libelles.push(vm.model.recommendation.market);
  (vm.marketsWatch||[]).forEach(function(m){if(m&&m.market)libelles.push(m.market);});
  // Les plus longs d'abord : "DC 12" ne doit pas etre remplace a l'interieur
  // d'un libelle plus complet.
  libelles.sort(function(a,b){return b.length-a.length;}).forEach(function(brut){
    var lisible=marcheFr(vm,brut);
    if(lisible&&lisible!==brut)t=t.split(brut).join(lisible);
  });
  // Decimales a la francaise, sans toucher aux nombres deja corrects ni aux
  // eventuelles URL.
  return t.replace(/(\d),(\d)/g,'$1<VIRG>$2').replace(/(\d)\.(\d)/g,'$1,$2').replace(/<VIRG>/g,',');
}

function logoEquipe(src,nom){
  return src?`<img class="logo-eq" src="${esc(src)}" alt="" width="16" height="16" loading="lazy">`:'';
}

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

function comparison(vm){
  const c=vm.comparison;
  if(!c||!c.rows.length)return empty('Statistiques comparatives indisponibles.');
  const parLabel={};
  c.rows.forEach(r=>{parLabel[r.label]=r;});
  const dom=vm.identity.home.name,ext=vm.identity.away.name;

  // Une decimale partout dans les colonnes : "1" a cote de "1,4" donne
  // l'impression d'une mesure moins precise que sa voisine.
  // Une decimale sur les moyennes, aucune sur les pourcentages : "69,0 %"
  // suggere une precision que la possession n'a pas.
  const un=(v,unite)=>Number(v).toLocaleString('fr-FR',
    unite==='%'?{maximumFractionDigits:0}:{minimumFractionDigits:1,maximumFractionDigits:1});

  let gagnesDom=0,gagnesExt=0,depart=0;
  const lignes=[];

  // Les barres sont mises a l'echelle du plus grand ecart relatif du tableau :
  // rapportees dans l'absolu, un +0,3 sur 2,2 buts donnait un trait de 4px,
  // illisible. Le plus grand ecart remplit la demi-largeur, les autres
  // suivent proportionnellement.
  const relatif=r=>Math.abs(r.home-r.away)/Math.max(Math.abs(r.home),Math.abs(r.away),0.0001);
  const comparables=c.rows.filter(r=>(CMP_SENS[r.label]||'neutre')!=='neutre');
  const ecartMax=comparables.length?Math.max(...comparables.map(relatif),0.0001):1;

  CMP_GROUPES.forEach(([groupe,labels])=>{
    const presentes=labels.map(l=>parLabel[l]).filter(Boolean);
    if(!presentes.length)return;
    lignes.push(`<tr class="cmp-groupe"><th scope="rowgroup" colspan="4">${esc(groupe)}</th></tr>`);
    presentes.forEach(r=>{
      const sens=CMP_SENS[r.label]||'neutre';
      const unite=CMP_UNITE[r.label]||'';
      const ecart=r.home-r.away;
      // Qui est devant, selon le sens de la mesure. Sur une egalite parfaite,
      // personne.
      let devant=null;
      if(sens!=='neutre'&&Math.abs(ecart)>0.001) devant=(sens==='haut')===(ecart>0)?'dom':'ext';
      if(devant==='dom')gagnesDom++; else if(devant==='ext')gagnesExt++; else if(sens!=='neutre')depart++;
      // Longueur de la micro-barre : l'ecart rapporte a la plus grande des
      // deux valeurs. Un +15 de possession et un +0,3 de buts deviennent
      // comparables, parce que c'est l'ecart RELATIF qu'on montre.
      const part=Math.min(100,Math.round(relatif(r)/ecartMax*100));
      const cote=ecart>0?'g':'d';
      const barre=devant===null
        ? '<span class="cmp-jauge" aria-hidden="true"><i class="axe"></i></span>'
        : `<span class="cmp-jauge" aria-hidden="true"><i class="axe"></i><i class="trait ${cote} ${devant}" style="width:${part/2}%"></i></span>`;
      const signe=ecart>0?'+':ecart<0?'−':'';
      const valeurEcart=Math.abs(ecart)<0.001?'—':signe+un(Math.abs(ecart),unite)+unite;
      lignes.push(`<tr>
        <th scope="row">${esc(r.label)}</th>
        <td class="${devant==='dom'?'gagne':''}">${un(r.home,unite)}${esc(unite)}</td>
        <td class="${devant==='ext'?'gagne':''}">${un(r.away,unite)}${esc(unite)}</td>
        <td class="cmp-ecart">${barre}<span class="cmp-val ${devant||'nul'}">${valeurEcart}</span></td>
      </tr>`);
    });
  });

  // Les mesures qu'on n'a pas su ranger dans un theme ne sont pas perdues.
  const rangees=new Set(CMP_GROUPES.flatMap(g=>g[1]));
  const orphelines=c.rows.filter(r=>!rangees.has(r.label));
  if(orphelines.length){
    lignes.push('<tr class="cmp-groupe"><th scope="rowgroup" colspan="4">Autres</th></tr>');
    orphelines.forEach(r=>{
      lignes.push(`<tr><th scope="row">${esc(r.label)}</th><td>${un(r.home)}</td><td>${un(r.away)}</td><td class="cmp-ecart"><span class="cmp-val nul">—</span></td></tr>`);
    });
  }

  const total=gagnesDom+gagnesExt+depart;
  let conclusion='';
  if(total){
    const meneur=gagnesDom>gagnesExt?dom:gagnesExt>gagnesDom?ext:null;
    const compte=Math.max(gagnesDom,gagnesExt);
    conclusion=meneur
      ? `<b>${esc(meneur)}</b> est devant sur ${compte} des ${total} mesures comparables.`
      : `Les deux équipes se partagent les ${total} mesures comparables.`;
  }

  const note=n(c.sampleSize)!==null
    ? `Moyennes par match sur ${c.sampleSize} rencontre${c.sampleSize>1?'s':''}${c.sampleSize<5?' — échantillon encore court':''}.`
    : 'Moyennes par match.';

  return `<div class="cmp-scroll"><table class="cmp-table">
      <thead><tr>
        <th scope="col">Par match</th>
        <th scope="col"><span class="cmp-eq">${logoEquipe(vm.identity.home.logo,dom)}${esc(dom)}</span></th>
        <th scope="col"><span class="cmp-eq">${logoEquipe(vm.identity.away.logo,ext)}${esc(ext)}</span></th>
        <th scope="col">Écart</th>
      </tr></thead>
      <tbody>${lignes.join('')}</tbody>
    </table></div>
    ${conclusion?`<p class="cmp-conclusion">${conclusion}</p>`:''}
    <p class="cmp-note">${note} Hors-jeu et arrêts sont donnés sans verdict&nbsp;: plus d'arrêts signifie surtout plus de tirs subis.</p>`;
}

// Scenario par tranches de 15 minutes : courbe reliant les 6 vraies valeurs
// par tranche - une ligne plutot que des barres, et toujours les 6 memes
// points reels, jamais une interpolation minute par minute qui laisserait
// croire a une precision qu'on n'a pas.
//
// La courbe est inchangee. Ce qui change, c'est CE QU'ELLE TRACE. Elle lisait
// scenario_15min, un texte redige par le modele de langage : il n'existait
// que sur 1 des 46 matchs publies, la section annoncait donc "indisponible"
// partout ailleurs. Elle trace desormais les buts REELLEMENT comptes par
// tranche pour les deux equipes (vm.editorial.goalTiming), disponibles sur
// 43 matchs sur 46. Aucun texte n'est requis pour l'afficher.
function scenarioChart(slots){
  const W=460,H=140,pad=22,top=18,base=H-20;
  const max=Math.max(...slots.map(s=>n(s.prob)||0),1);
  const x=i=>pad+i*(W-2*pad)/(slots.length-1);
  const y=v=>base-(v/max)*(base-top);
  const path=slots.map((s,i)=>`${i===0?'M':'L'}${x(i).toFixed(1)},${y(n(s.prob)||0).toFixed(1)}`).join(' ');
  const area=`${path} L${x(slots.length-1).toFixed(1)},${base} L${x(0).toFixed(1)},${base} Z`;
  const dots=slots.map((s,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(n(s.prob)||0).toFixed(1)}" r="3" fill="var(--accent)"></circle><text x="${x(i).toFixed(1)}" y="${(y(n(s.prob)||0)-9).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--accent)" font-weight="700">${Math.round(n(s.prob)||0)}%</text><text x="${x(i).toFixed(1)}" y="${H-4}" text-anchor="middle" font-size="8" fill="var(--muted)">${esc((s.t||'').replace('min',''))}</text>`).join('');
  return `<svg class="scenario-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="${pad}" y1="${base}" x2="${W-pad}" y2="${base}" stroke="var(--line)"></line><path d="${area}" fill="url(#scGrad)" class="sc-area"></path><path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2" class="sc-line"></path>${dots}<defs><linearGradient id="scGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--accent)" stop-opacity=".2"/><stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs></svg>`;
}
function scenarioCard(vm){
  const g=vm.editorial.goalTiming;
  if(!g||!g.slots.length)return empty('Pas assez de buts enregistrés pour établir une répartition fiable.');
  // Meme forme d'entree que la courbe attendait deja : { t, prob }.
  const slots=g.slots.map(sl=>({t:sl.label,prob:sl.share}));
  return `${scenarioChart(slots)}
    <div class="scenario-insight"><b>!</b><span>Tranche la plus fournie : <b>${esc(g.peak.label)} min</b> — ${Math.round(g.peak.share)} % des buts des deux équipes y sont tombés.</span></div>
    <p class="scenario-source">Sur ${g.totalGoals} buts marqués par ${esc(vm.identity.home.name)} et ${esc(vm.identity.away.name)} cette saison. Fréquence observée sur leurs matchs passés, pas une prévision pour celui-ci.</p>`;
}


// outputShare (vm.players.absences[].outputShare) : part reelle du joueur
// dans les buts+passes decisives+passes cles recents de son equipe (cf
// lib/insights.js#computeOutputShare) - une estimation, jamais un modele
// causal "l'equipe perd X% sans lui". N'apparait que si le joueur absent a
// ete retrouve dans l'historique recent (sinon aucun chiffre affiche).
// absences() a ete supprimee : sur la majorite des matchs elle n'affichait
// que "Aucune absence signalee" pour les deux equipes, occupant une carte
// entiere pour zero information. Retiree a la demande de l'utilisateur.
// Les absences reelles restent prises en compte par le modele en amont
// (lib/match-view-model.js) et dans "Ce qu'il faut savoir".

// FAQ.
//
// Regle posee par l'utilisateur : "il faut se poser des questions dont les
// gens n'ont pas la reponse dans la page". Les anciennes questions - qui est
// favori, quel pari est retenu, le modele est-il d'accord avec le marche,
// quel niveau de risque - reprenaient toutes une information deja affichee
// en grand plus haut. Elles sont retirees.
//
// Ne restent que des questions dont la reponse n'existe nulle part ailleurs,
// nourries par vm.editorial.exclusiveFacts : cartons, buts attendus de
// saison, precision de passe, tranches d'encaissement. Ces donnees etaient
// relevees par le pipeline sans etre affichees par aucune carte.
function faqCard(vm){
  const qa=[];
  const id=vm.identity, f=vm.editorial.exclusiveFacts||{}, g=vm.editorial.goalTiming;
  const dom=id.home.name, ext=id.away.name;
  const plusGrand=(p)=>p.home>=p.away?dom:ext;
  const plusPetit=(p)=>p.home<=p.away?dom:ext;

  // 1. Qui ouvre le score le plus tot. Le graphique du scenario cumule les
  // deux equipes : la repartition equipe par equipe n'est visible nulle part.
  if(g&&g.slots.length>=6){
    const totD=g.slots.reduce((a,x)=>a+x.home,0),totE=g.slots.reduce((a,x)=>a+x.away,0);
    const avD=g.slots.slice(0,3).reduce((a,x)=>a+x.home,0);
    const avE=g.slots.slice(0,3).reduce((a,x)=>a+x.away,0);
    if(totD>0&&totE>0){
      const pD=Math.round(avD/totD*100),pE=Math.round(avE/totE*100);
      // Sur une egalite, on ne designe personne : "X entre plus vite" serait
      // faux a 35 % contre 35 %.
      const verdict=Math.abs(pD-pE)<3
        ? 'Les deux entrent dans leurs matchs au même rythme.'
        : `${esc(pD>pE?dom:ext)} entre donc plus vite dans ses matchs.`;
      qa.push(['Laquelle des deux marque le plus tôt ?',
        `${esc(dom)} inscrit ${pD} % de ses buts avant la mi-temps, ${esc(ext)} ${pE} %. ${verdict} Le graphique plus haut cumule les deux équipes&nbsp;: ce détail par équipe n’y apparaît pas.`]);
    }
  }

  // 2. Encaissement en fin de match : releve, jamais affiche.
  if(f.encaisseFin){
    const ecartFin=Math.abs(f.encaisseFin.home-f.encaisseFin.away);
    const verdictFin=ecartFin<4
      ? 'Les deux tiennent la fin de match de la même façon.'
      : `${esc(plusGrand(f.encaisseFin))} est la plus exposée sur la fin, ce qui compte pour un pari qui se joue au score final.`;
    qa.push(['Une des deux craque-t-elle en fin de match ?',
      `${esc(dom)} encaisse ${f.encaisseFin.home} % de ses buts sur la dernière demi-heure, ${esc(ext)} ${f.encaisseFin.away} %. ${verdictFin}`]);
  }

  // 3. Cartons : donnee relevee par le pipeline, affichee nulle part.
  if(f.cartons){
    const rugueux=Math.abs(f.cartons.home-f.cartons.away)<0.3?null:plusGrand(f.cartons);
    const rouges=f.rouges&&(f.rouges.home+f.rouges.away)>0
      ? ` Sur la période suivie, ${f.rouges.home+f.rouges.away} carton${f.rouges.home+f.rouges.away>1?'s':''} rouge${f.rouges.home+f.rouges.away>1?'s':''} au total.` : '';
    qa.push(['Combien de cartons dans un match de ces équipes ?',
      `${esc(dom)} en prend ${fmt(f.cartons.home)} par match et ${esc(ext)} ${fmt(f.cartons.away)}.${rugueux?` ${esc(rugueux)} est la plus sanctionnée des deux.`:' Les deux sont sanctionnées au même rythme.'}${rouges}`]);
  }

  // 4. Buts attendus de saison : a ne pas confondre avec les buts attendus
  // DE CE MATCH, affiches plus haut. Ceux-ci decrivent la saison entiere.
  if(f.xg&&f.xga){
    const meilleure=plusGrand(f.xg), solide=plusPetit(f.xga);
    qa.push(['Ces équipes se créent-elles beaucoup d’occasions ?',
      `Sur la saison, ${esc(dom)} génère ${fmt(f.xg.home)} buts attendus par match et en concède ${fmt(f.xga.home)}&nbsp;; ${esc(ext)} ${fmt(f.xg.away)} et ${fmt(f.xga.away)}. ${esc(meilleure)} se procure le plus d’occasions, ${esc(solide)} en concède le moins.`]);
  }

  // 5. Precision de passe : jamais affichee non plus.
  if(f.passes&&Math.abs(f.passes.home-f.passes.away)>=2){
    const propre=plusGrand(f.passes);
    qa.push(['Laquelle joue le plus proprement ?',
      `${esc(propre)} réussit ${fmt(Math.max(f.passes.home,f.passes.away),0)} % de ses passes, contre ${fmt(Math.min(f.passes.home,f.passes.away),0)} % en face. Une différence de cet ordre se traduit souvent par plus de possession et moins de contres subis.`]);
  }

  // 6. Methode : sa reponse n'est affichee nulle part.
  const sources=Array.isArray(vm.model.sources)?vm.model.sources.filter(Boolean):[];
  const sims=n(vm.model.simulationCount),quality=n(vm.model.quality);
  if(sims!==null||sources.length||quality!==null){
    const bits=[];
    if(sims!==null)bits.push(`${sims.toLocaleString('fr-FR')} simulations de Monte-Carlo`);
    if(sources.length)bits.push(`les données ${sources.map(x=>esc(String(x))).join(', ')}`);
    if(quality!==null)bits.push(`un score de qualité des données de ${fmt(quality)}/100`);
    qa.push(['Sur quoi repose cette analyse ?',
      `L’analyse s’appuie sur ${bits.join(', ')}. Les probabilités décrivent une fréquence attendue sur un grand nombre de matchs semblables, jamais une certitude sur celui-ci.`]);
  }

  // 7. Risque : uniquement s'il y a une vraie phrase, pas un simple niveau.
  const NIVEAUX={FAIBLE:1,MODERE:1,ELEVE:1};
  const risque=String(vm.editorial.risk||'').trim();
  if(risque.length>12&&!NIVEAUX[risque.toUpperCase()]){
    qa.push(['Quel est le principal risque de ce pari ?',esc(risque)]);
  }

  if(qa.length<2)return '';
  return card('Questions sur ce match',
    `<div class="faq-list">${qa.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}</div>`,
    'faq-card','faq');
}



// Une fois le signal depasse, le parieur lit 10 sections sans plus voir CE
// QU'ON LUI RECOMMANDE ni A QUELLE COTE. Cette barre le garde sous les yeux
// pendant toute la lecture. Elle ne calcule rien : elle recopie le signal
// deja affiche, et disparait tant qu'il est visible.
function signalSticky(vm){
  const r=vm.model.recommendation;
  if(!r)return '';
  const marketOdds=n(vm.model.recommendedOdds);
  return `<div class="sig-sticky" id="sigSticky" aria-hidden="true">
    <div class="ss-in">
      <span class="ss-tag">Marché recommandé</span>
      <b class="ss-market">${esc(marcheFr(vm,r.market))}</b>
      ${marketOdds!==null?`<span class="ss-odds">${odds(marketOdds)}</span>`:''}
      ${n(r.probability)!==null?`<span class="ss-prob">${pct(r.probability)}</span>`:''}
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

function render(raw){
  const vm=IasharkMatchViewModel.buildMatchViewModel(raw);
  document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;
  // ORDRE DE LECTURE, fixe par l'utilisateur le 03/09/2026. Une seule
  // colonne : la page se lit comme un dossier, de haut en bas, au lieu de
  // deux colonnes ou l'oeil ne sait pas laquelle lire en premier.
  // On sort le signal, puis on l'interprete, puis on l'etaye par les
  // donnees, puis le scenario, puis les questions restantes.
  // Retires a la meme occasion : "Pourquoi ce pari ?", "Modele vs marche",
  // "Marches a surveiller", "Face a face" et "Arbitre".
  const sections=[
    signalCard(vm),
    matchReadingCard(vm),
    keyInsightsCard(vm),
    outputsCard(vm),
    card('Comparatif des deux équipes',comparison(vm),'compare-card','compare'),
    threatsCard(vm),
    matchupCard(vm),
    formNoteCard(vm),
    valuePotentialCard(vm),
    // "Scenario probable du match" : contenu et style geles a la demande de
    // l'utilisateur. Seule sa POSITION change ici.
    card('Scénario probable du match',scenarioCard(vm),'','chart'),
    faqCard(vm)
  ];
  // Pas de numerotation : les titres de cartes suffisent a situer la lecture.
  // La colonne de chiffres ajoutait un repere que personne ne suit et volait
  // de la largeur a la carte sur grand ecran.
  const corps=sections.filter(Boolean).map(node=>`<div class="sec">${node}</div>`).join('');
  root.innerHTML=`<div class="page">${hero(vm)}<div class="secs">${corps}</div></div>${signalSticky(vm)}`;
  bindMotion();
  bindSticky();
}

function bindMotion(){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    root.querySelectorAll('.prob-ring .fill').forEach(c=>{c.style.strokeDashoffset=c.dataset.target;});
  }));
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

// Mur d'acces : le match du jour choisi par pickFreeMatchId() (identique au
// choix de la carte "Analyse gratuite" sur l'accueil) reste gratuit mais
// exige un compte (inscription ou connexion) ; tous les autres necessitent
// Pro. Rendu cote client uniquement (comme le reste du site) - une vraie
// protection cote serveur existe deja separement sur les champs premium via
// la fonction match-data (voir supabase/functions/match-data).
function gateCard(vm,opts){
  const homeName=vm.identity.home.name,awayName=vm.identity.away.name;
  return `<div class="page">
    ${hero(vm)}
    <section class="card gate reveal">
      ${cardIcon('lock')}
      <h2>${esc(opts.title)}</h2>
      <p>${esc(opts.text)}</p>
      <a class="btn-gate" href="${opts.href}">${esc(opts.cta)}</a>
    </section>
  </div>`;
}
function renderAuthWall(raw){
  const vm=IasharkMatchViewModel.buildMatchViewModel(raw);
  document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;
  root.innerHTML=gateCard(vm,{
    title:'Match gratuit du jour',
    text:'Ce match est gratuit, mais il faut un compte IASHARK (inscription ou connexion) pour voir l’analyse complete.',
    href:'/compte.html',
    cta:'Se connecter / Creer un compte'
  });
  bindMotion();
}
function renderProWall(raw){
  const vm=IasharkMatchViewModel.buildMatchViewModel(raw);
  document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;
  root.innerHTML=gateCard(vm,{
    title:'Analyse reservee aux membres Pro',
    text:'Le marche recommande, la confiance du modele et l’analyse complete de ce match sont reserves aux membres Pro. Le match du jour, lui, reste gratuit.',
    href:'/abonnement.html',
    cta:'Devenir Pro'
  });
  bindMotion();
}

async function init(){
  try{
    // MODE DEMO (exemple-analyse.html) : la page de demonstration montre une
    // analyse REELLE et complete, sans compte et sans appel reseau. Aucune
    // logique d'acces n'est contournee ailleurs - le drapeau n'existe que sur
    // cette page marketing, et le match y est fige dans le HTML.
    if(typeof IASHARK_DEMO!=='undefined'&&IASHARK_DEMO&&typeof PRELOADED_MATCH!=='undefined'){
      render(PRELOADED_MATCH);
      return;
    }
    const id=typeof FIXED_MATCH_ID!=='undefined'?String(FIXED_MATCH_ID):new URLSearchParams(location.search).get('id');
    let raw=typeof PRELOADED_MATCH!=='undefined'?PRELOADED_MATCH:null;
    let list=null;
    let ctx={session:null,isPro:false};
    if(window.IasharkApp){
      ctx=await window.IasharkApp.context();
      if(ctx.session){
        const result=await window.IasharkApp.supabase.functions.invoke('match-data');
        if(result.data&&!result.error){
          list=result.data.matchs||[];
          raw=list.find(x=>String(x.id)===String(id))||raw;
        }
      }
    }
    if(!raw||!list){
      const data=await fetch(`/data.json?t=${Date.now()}`).then(r=>r.json());
      list=list||data.matchs||[];
      raw=raw||list.find(x=>String(x.id)===String(id));
    }
    if(!raw)throw new Error('Match introuvable');
    const isFree=String(raw.id)===String(IasharkFreeMatch.pickFreeMatchId(list));
    if(isFree&&!ctx.session){renderAuthWall(raw);return;}
    if(!isFree&&!ctx.isPro){renderProWall(raw);return;}
    render(raw);
  }catch(e){
    root.innerHTML=`<div class="match-error"><b>${esc(e.message||'Erreur de chargement')}</b><a href="/">Retour à l'accueil</a></div>`;
  }
}
init();
})();
