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
function pickFreeMatchId(list){
  if(!Array.isArray(list)||!list.length)return null;
  const {day,now}=todayParis_();
  const today=list.filter(m=>String(m.date||'').slice(0,10)===day);
  const pool=today.length?today:list;
  const upcoming=pool.filter(m=>String(m.date||'')>=now);
  const source=upcoming.length?upcoming:pool;
  const actionable=source.filter(m=>!!m.pari_rec&&!m.no_signal);
  const candidates=actionable.length?actionable:source;
  if(!candidates.length)return null;
  return candidates.reduce((best,m)=>ovrConf_(m)>ovrConf_(best)?m:best,candidates[0]).id;
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
    :`${leading.label} a l'avantage${locSuffix}, mais ce n'est pas le marché que nous recommandons — nous recommandons plutôt ${r.market}.`;
  const reason=vm.editorial.decisiveFactor;
  const btts=findMarket(vm.model.marketsCompared,/btts/i);
  const x=vm.model.expectedGoals;
  const totalXg=x&&n(x.home)!==null&&n(x.away)!==null?x.home+x.away:null;
  const risk=vm.editorial.risk;
  const risqueDescriptif=risk&&!['FAIBLE','MODERE','ELEVE'].includes(risk)?risk:null;
  return `<section class="card lecture reveal">
    <h2>${cardIcon('bulb')}Notre lecture du match</h2>
    <p class="reading">${esc(sentence)}${reason?' '+esc(reason):''}</p>
    ${risqueDescriptif?`<div class="risk-note"><b>⚠</b><span>${esc(risqueDescriptif)}</span></div>`:''}
    <div class="lecture-stats">
      ${totalXg!==null?`<div><small>Buts attendus</small><b>${fmt(totalXg)}</b></div>`:''}
      ${btts?`<div><small>BTTS</small><b>${pct(btts.probability)}</b></div>`:''}
      <div><small>${esc(r.market)}</small><b>${pct(r.probability)}</b></div>
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
function signalCard(vm){
  const r=vm.model.recommendation;
  if(!r)return card('Le signal IASHARK',empty(vm.model.unavailableReason||'Aucun marché ne franchit les seuils de confiance ou de cote minimale pour ce match — IASHARK préfère ne pas se prononcer.'),'signal-card','target');
  const prob=n(r.probability);
  const fair=prob!==null&&prob>0?100/prob:null;
  const marketOdds=n(vm.model.recommendedOdds);
  const implied=marketOdds!==null&&marketOdds>0?100/marketOdds:null;
  const edge=(prob!==null&&implied!==null)?Math.round((prob-implied)*10)/10:null;
  const verdict=edgeVerdict(edge);
  const kpi=(label,value,cls)=>`<div class="sig-kpi"><span>${esc(label)}</span><b class="${cls||''}">${value}</b></div>`;
  return `<section class="card signal-card reveal">
    <div class="sig-head">
      <span class="sig-eyebrow">${cardIcon('target')}Le signal IASHARK</span>
      <div class="sig-badges">${confidenceBadge(r.reliability)}${riskBadge(vm.editorial.riskCode)}</div>
    </div>
    <div class="sig-body">
      <div class="sig-pick">
        <span class="sig-label">Marché recommandé</span>
        <strong class="sig-market">${esc(r.market)}</strong>
      </div>
      ${probRing(prob,true)}
    </div>
    <div class="sig-kpis">
      ${kpi('Probabilité modèle',pct(prob))}
      ${implied!==null?kpi('Probabilité marché',pct(implied)):''}
      ${kpi('Cote équitable',odds(fair))}
      ${kpi('Cote marché',odds(marketOdds))}
      ${edge!==null?kpi('Écart',(edge>0?'+':'')+fmt(edge)+' pts',edge>=3?'pos':edge<=-3?'neg':'flat'):''}
    </div>
    ${verdict?`<p class="sig-verdict ${verdict.cls}">${esc(verdict.text)}</p>`:''}
  </section>`;
}

function reasonsCard(vm){
  const list=vm.editorial.reasons;
  if(!list.length)return '';
  return card('Pourquoi ce pari ?',`<div class="reasons">${list.map((r,i)=>`<div class="reason"><b>${i+1}</b><p>${esc(r)}</p></div>`).join('')}</div>`,'','reasons');
}

// Buteur a surveiller ("Menaces de but") : vm.players.scoringThreat, classe
// par vrai signal de menace (buts/90 + tirs cadres/90, min 3 apparitions,
// jamais un joueur absent - cf lib/match-view-model.js). scoringProbability
// = vraie probabilite de Poisson (1-e^-lambda) depuis buts/90 reel, jamais
// une "probabilite de marquer" inventee. "Cote equitable" = notre propre
// calcul (100/proba), jamais une cote de marche qu'on n'a pas reellement
// pour un joueur precis.
// Justification "pourquoi ce joueur" : phrase deterministe (jamais un
// nouvel appel LLM), assemblee uniquement a partir des vraies stats deja
// calculees pour ce candidat (goals90/shotsOn90/startProbability, cf
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
// invente. scoringProbability reste la vraie probabilite de Poisson.
function threatSample(p){
  const bits=[];
  if(n(p.appearances)!==null)bits.push(`${p.appearances} match${p.appearances>1?'s':''} joué${p.appearances>1?'s':''}`);
  if(n(p.starts)!==null)bits.push(p.starts>0?`${p.starts} titularisation${p.starts>1?'s':''}`:'aucune titularisation');
  if(n(p.minutes)!==null&&p.minutes>0)bits.push(`${Math.round(p.minutes)} minutes jouées`);
  return bits.length?bits.join(' · '):'';
}
function threatsCard(vm){
  const list=vm.players.scoringThreat;
  if(!list.length)return '';
  const p=list[0];
  const pid=n(p.id);
  const href=pid!==null?` href="/joueur.html?m=${esc(vm.id)}&p=${pid}"`:'';
  const tag=pid!==null?'a':'div';
  const sp=n(p.scoringProbability);
  const fairOdds=sp!==null&&sp>0?100/sp:null;
  const rows=[
    ['Buts par 90 minutes',fmt(p.goals90,2)],
    ['Tirs cadrés par 90 minutes',fmt(p.shotsOn90,2)],
    ['Passes décisives par 90 minutes',fmt(p.assists90,2)],
    ['Note moyenne',n(p.rating5)!==null?Number(p.rating5).toLocaleString('fr-FR',{minimumFractionDigits:1,maximumFractionDigits:1}):null]
  ].filter(r=>r[1]&&r[1]!=='—');
  const sample=threatSample(p);
  return card('Buteur à surveiller',`<${tag} class="threat"${href}>
    <div class="threat-id">
      ${img(p.photo,p.name)}
      <div><b>${esc(p.name)}</b><small>${esc(p.team||'')}${p.position?' · '+esc(p.position):''}</small></div>
    </div>
    ${sp!==null?`<div class="threat-headline">
      <div><b class="pos">${pct(sp)}</b><span>Probabilité qu'il marque</span></div>
      ${fairOdds!==null?`<div><b>${odds(fairOdds)}</b><span>Cote équitable</span></div>`:''}
    </div>`:''}
    ${rows.length?`<table class="threat-table"><tbody>${rows.map(([k,v])=>`<tr><th scope="row">${esc(k)}</th><td>${v}</td></tr>`).join('')}</tbody></table>`:''}
    ${sample?`<p class="threat-sample${p.thinSample?' is-thin':''}"><span>Échantillon</span>${esc(sample)}${p.thinSample?'<em>Temps de jeu limité sur ce championnat : ces moyennes par 90 minutes reposent sur peu de minutes et restent fragiles.</em>':''}</p>`:''}
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
    return `<div class="insight"><div class="insight-head"><span class="insight-mark ${cls}">${mark}</span><b>${esc(item.title)}</b></div><p>${esc(item.text)}</p></div>`;
  }).join('')}</div>`,'','bulb');
}

// Modele vs marche : vm.model.marketsCompared, deja reel (raw.markets_compared,
// calcule cote pipeline) - simple tableau, aucune nouvelle donnee.
function marketsVsMarketCard(vm){
  const list=vm.model.marketsCompared;
  if(!list.length)return '';
  const rows=list.map(m=>`<tr><td>${esc(m.market)}</td><td>${pct(m.probability)}</td><td>${m.consensus!==null?pct(m.consensus):'—'}</td><td class="${m.edge>=0?'pos':'neg'}">${m.edge>=0?'+':''}${fmt(m.edge)}%</td></tr>`).join('');
  return card('Modèle vs marché',`<div class="table-scroll"><table class="mvm-table"><thead><tr><th>Pari</th><th>Modèle</th><th>Marché</th><th>Écart</th></tr></thead><tbody>${rows}</tbody></table></div>`,'','scale');
}

// Value potentielle : le marche du plus gros ecart absolu deja identifie
// par vm.marketsWatch (lui-meme derive de markets_compared reel) - jamais
// un nouveau calcul, juste la mise en avant du 1er de la liste deja triee.
function valuePotentialCard(vm){
  const top=vm.marketsWatch[0];
  if(!top||top.edge===null||Math.abs(top.edge)<4)return '';
  return card('Value potentielle',`<div class="value-potential"><b>${esc(top.market)}</b><p>${top.edge>=0?`Ce marché présente la plus grosse value selon notre modèle (écart de +${fmt(top.edge)}% avec le marché).`:`Le marché est nettement au-dessus de notre modèle sur ce pari (écart de ${fmt(top.edge)}%) - à interpréter avec prudence.`}</p></div>`,'value-card','trophy');
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
  const rows=m.categories.map(c=>`<div class="matchup-row"><span class="${c.advantage==='home'?'adv':''}">${esc(homeName)}</span><b>${esc(c.label)}${c.advantage==='égalité'?' · égalité':''}</b><span class="${c.advantage==='away'?'adv':''}">${esc(awayName)}</span></div>`).join('');
  return card('Matchup : comment les équipes se correspondent',`<div class="matchup-rows">${rows}</div><div class="matchup-global"><div class="mg-side"><b class="pos">${fmt(m.globalHome)}<small>/10</small></b><small>${esc(homeName)}</small></div><div class="mg-bar"><i style="width:${clamp(m.globalHome/(m.globalHome+m.globalAway)*100)}%"></i></div><div class="mg-side"><b class="neg">${fmt(m.globalAway)}<small>/10</small></b><small>${esc(awayName)}</small></div></div>`,'','scale');
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

// 3 marches a surveiller : vm.marketsWatch, deja trie par ecart absolu reel
// (cf lib/insights.js#topMarketsToWatch) - simple affichage.
function marketsWatchCard(vm){
  const list=vm.marketsWatch;
  if(!list.length)return '';
  const rows=list.map(m=>`<tr><td>${esc(m.market)}</td><td>${esc(m.interest)}</td><td>${m.confidence!==null?m.confidence+'/10':'—'}</td></tr>`).join('');
  return card('Marchés à surveiller',`<div class="table-scroll"><table class="mvm-table"><thead><tr><th>Marché</th><th>Intérêt</th><th>Confiance</th></tr></thead><tbody>${rows}</tbody></table></div>`,'','target');
}

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
    cols.push(`<div class="outputs-col"><small>Scores probables</small><div class="scores-row">${s.map(sc=>`<div class="score-pill"><b>${esc(sc.score)}</b><small>${pct(sc.probability)}</small></div>`).join('')}</div></div>`);
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
function comparison(vm){
  const c=vm.comparison;
  if(!c||!c.rows.length)return empty('Statistiques comparatives indisponibles.');
  const rec=vm.model.recommendation;
  const key=rec?keyRowsForMarket(rec.market):{rows:[],topic:null};
  const intro=rec&&key.topic?`<p class="cmp-intro">Les lignes en surbrillance sont celles qui pèsent le plus sur <b>${esc(rec.market)}</b> — c’est-à-dire sur ${esc(key.topic)}.</p>`:'';
  const body=c.rows.map(row=>{
    const max=Math.max(row.home,row.away,1);
    const isKey=key.rows.includes(row.label);
    return `<div class="compare-row${isKey?' is-key':''}"><b>${fmt(row.home)}</b><div class="compare-bar home"><i style="width:${row.home/max*100}%"></i></div><span>${esc(row.label)}${isKey?'<em>clé</em>':''}</span><div class="compare-bar away"><i style="width:${row.away/max*100}%"></i></div><b>${fmt(row.away)}</b></div>`;
  }).join('');
  return intro+body;
}

// Scenario par tranches de 15 minutes : courbe reliant les 6 vraies valeurs
// par tranche (raw.scenario_15min) - une ligne plutot que des barres pour se
// rapprocher du style de reference, mais toujours les 6 memes points reels,
// jamais une interpolation minute par minute qui laisserait croire a une
// precision qu'on n'a pas.
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
  const slots=vm.editorial.scenario15;
  if(!slots.length)return empty('Scénario du match indisponible.');
  const peak=slots.reduce((a,b)=>(n(b.prob)||0)>(n(a.prob)||0)?b:a,slots[0]);
  return `${scenarioChart(slots)}<div class="scenario-insight"><b>!</b><span>${esc(peak.txt||`Fenêtre la plus dangereuse : ${peak.t} (${Math.round(n(peak.prob)||0)}% des buts observés sur cette tranche).`)}</span></div>`;
}

function h2hCard(vm){
  const rows=vm.h2h;
  if(!rows)return '';
  const homeName=vm.identity.home.name,awayName=vm.identity.away.name;
  const over25=rows.filter(r=>{const parts=(r.score||'').split('-').map(Number);return parts.length===2&&parts.every(Number.isFinite)&&parts[0]+parts[1]>2.5;}).length;
  const body=rows.slice(0,5).map(row=>{
    const homeWin=row.winner==='1'&&row.home===homeName||row.winner==='2'&&row.home===awayName;
    const awayWin=row.winner==='1'&&row.away===homeName||row.winner==='2'&&row.away===awayName;
    return `<div class="h2h-row"><span class="h2h-date">${esc(row.date)}</span><span class="h2h-team ${homeWin?'win':''}">${esc(row.home)}</span><b class="h2h-score">${esc(row.score)}</b><span class="h2h-team ${awayWin?'win':''}">${esc(row.away)}</span></div>`;
  }).join('');
  return card('Face-à-face',`<div class="h2h-summary">${over25}/${rows.length} <small>&gt; 2.5 buts</small></div><div class="h2h-list">${body}</div>`,'','h2h');
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

// FAQ du match. Chaque reponse est ASSEMBLEE A PARTIR DES DONNEES DEJA
// CALCULEES du view-model - jamais un appel a un modele de langage, jamais
// une reponse generique. Une question dont la donnee manque n'est tout
// simplement pas affichee : mieux vaut 3 vraies questions que 6 dont la
// moitie repond "information indisponible".
// Repond aux questions qu'un parieur se pose reellement avant de miser, et
// que le reste de la page traite de facon dispersee.
function faqCard(vm){
  const qa=[];
  const p=vm.model.probabilities;
  const i=vm.identity;

  if(p){
    const rows=[[i.home.name,n(p.home)],['Le match nul',n(p.draw)],[i.away.name,n(p.away)]]
      .filter(r=>r[1]!==null).sort((a,b)=>b[1]-a[1]);
    if(rows.length===3){
      const gap=Math.round((rows[0][1]-rows[1][1])*10)/10;
      const serre=gap<8?" L’écart avec l’option suivante n’est que de "+fmt(gap)+" points : le match est ouvert.":"";
      qa.push(['Qui est favori sur ce match ?',
        `${esc(rows[0][0])} sort en tête avec ${pct(rows[0][1])} de probabilité, devant ${esc(rows[1][0])} (${pct(rows[1][1])}) et ${esc(rows[2][0])} (${pct(rows[2][1])}).${serre}`]);
    }
  }

  const x=vm.model.expectedGoals;
  if(x&&n(x.home)!==null&&n(x.away)!==null){
    const total=Math.round((x.home+x.away)*10)/10;
    const lecture=total>=2.8?'un match plutôt ouvert offensivement':total<=2.2?'un match plutôt fermé':'un volume de buts dans la moyenne';
    qa.push(['Combien de buts sont attendus ?',
      `Le modèle attend ${fmt(total)} buts au total : ${fmt(x.home)} pour ${esc(i.home.name)} et ${fmt(x.away)} pour ${esc(i.away.name)}. Cela correspond à ${lecture}.`]);
  }

  const r=vm.model.recommendation;
  if(r){
    const prob=n(r.probability), mktOdds=n(vm.model.recommendedOdds);
    const fair=prob!==null&&prob>0?100/prob:null;
    let txt=`IASHARK retient ${esc(r.market)}, estimé à ${pct(prob)} de probabilité.`;
    if(fair!==null)txt+=` Cela correspond à une cote équitable de ${odds(fair)}.`;
    if(mktOdds!==null){
      const implied=mktOdds>0?100/mktOdds:null;
      txt+=` La cote relevée sur le marché est de ${odds(mktOdds)}`;
      if(implied!==null)txt+=`, soit ${pct(implied)} de probabilité implicite`;
      txt+='.';
      if(implied!==null&&prob!==null){
        txt+=prob-implied>=3?' Le pari est donc joué à une cote plus généreuse que notre estimation.'
            :prob-implied<=-3?' Le pari est donc joué à une cote moins généreuse que notre estimation : l’intérêt est faible.'
            :' Les deux estimations sont très proches.';
      }
    }
    qa.push(['Quel pari IASHARK retient-il, et à quelle cote ?',txt]);
  }

  const mc=(vm.model.marketsCompared||[]).filter(m=>n(m.edge)!==null);
  if(mc.length){
    const top=mc.slice().sort((a,b)=>Math.abs(n(b.edge))-Math.abs(n(a.edge)))[0];
    const e=n(top.edge);
    qa.push(['Le modèle est-il d’accord avec le marché ?',
      `L’écart le plus marqué porte sur ${esc(top.market)} : le modèle l’estime à ${pct(top.probability)} quand le marché en fait ${pct(top.consensus)}, soit ${e>0?'+':''}${fmt(e)} points d’écart. ${Math.abs(e)>=5?'Un écart de cette ampleur mérite d’être vérifié avant de miser.':'Les deux lectures restent proches sur l’ensemble des marchés suivis.'}`]);
  }

  // vm.editorial.risk contient soit une vraie phrase (raw.risk_principal),
  // soit le simple code de niveau (raw.risque = "FAIBLE"/"MODERE"/"ELEVE").
  // Repondre "FAIBLE" a la question "quel est le principal risque ?" est une
  // non-reponse : on ne pose la question que si on a du texte exploitable,
  // et on reformule proprement le cas du simple niveau.
  const NIVEAUX={FAIBLE:'faible',MODERE:'modéré',ELEVE:'élevé'};
  const riskRaw=String(vm.editorial.risk||'').trim();
  if(NIVEAUX[riskRaw.toUpperCase()]){
    qa.push(['Quel est le niveau de risque de ce pari ?',
      `Le modèle classe ce pari en risque <b>${NIVEAUX[riskRaw.toUpperCase()]}</b>. Ce niveau reflète la stabilité des données et la cohérence des marchés sur ce match, pas une garantie sur le résultat.`]);
  } else if(riskRaw.length>12){
    qa.push(['Quel est le principal risque de ce pari ?',esc(riskRaw)]);
  }

  const sources=Array.isArray(vm.model.sources)?vm.model.sources.filter(Boolean):[];
  const sims=n(vm.model.simulationCount), quality=n(vm.model.quality);
  if(sims!==null||sources.length||quality!==null){
    const bits=[];
    if(sims!==null)bits.push(`${sims.toLocaleString('fr-FR')} simulations de Monte-Carlo`);
    if(sources.length)bits.push(`les données ${sources.map(x=>String(x)).join(', ')}`);
    if(quality!==null)bits.push(`un score de qualité des données de ${fmt(quality)}/100`);
    qa.push(['Sur quoi repose cette analyse ?',
      `L’analyse s’appuie sur ${bits.join(', ')}. Les probabilités sont issues de modèles statistiques, pas d’un avis : elles décrivent une fréquence attendue, jamais une certitude sur ce match précis.`]);
  }

  if(qa.length<2)return '';
  return card('Questions sur ce match',
    `<div class="faq-list">${qa.map(([q,a])=>`<details><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}</div>`,
    'faq-card','faq');
}

function refereeCard(vm){
  const r=vm.referee;
  if(!r)return '';
  const stats=[];
  if(n(r.cardsPerMatch)!==null)stats.push(['Cartons/match',fmt(r.cardsPerMatch)]);
  if(n(r.penaltiesPerMatch)!==null)stats.push(['Penaltys/match',fmt(r.penaltiesPerMatch)]);
  if(n(r.matches)!==null)stats.push(['Matchs observés',fmt(r.matches,0)]);
  return card('Arbitre',`<div class="referee"><b>${esc(r.name)}</b>${stats.length?`<div class="referee-stats">${stats.map(([l,v])=>`<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}</div>`:''}</div>`,'','whistle');
}

function render(raw){
  const vm=IasharkMatchViewModel.buildMatchViewModel(raw);
  document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;
  // ORDRE DE LECTURE. Avant, la recommandation - le produit vendu -
  // n'apparaissait qu'en 4e position, sous l'en-tete, une ligne de tags et
  // un paragraphe editorial : un parieur devait defiler pour savoir ce
  // qu'on lui conseille. Desormais : QUOI (le signal), puis POURQUOI
  // (lecture + raisons), puis LES PREUVES (comparatif, buteur, scenario),
  // puis LES QUESTIONS RESTANTES (FAQ). La ligne de tags a ete supprimee :
  // elle repetait le nom de la competition deja affiche dans l'en-tete.
  const mainCol=[
    card('Comparatif des deux équipes',comparison(vm),'compare-card','compare'),
    threatsCard(vm),
    // "Scenario probable du match" : NE PAS MODIFIER (carte preferee de
    // l'utilisateur, explicitement gelee - ni le contenu, ni le style).
    card('Scénario probable du match',scenarioCard(vm),'','chart'),
    faqCard(vm)
  ].filter(Boolean);
  const asideCol=[
    marketsVsMarketCard(vm),
    outputsCard(vm),
    matchupCard(vm),
    valuePotentialCard(vm),
    formNoteCard(vm),
    marketsWatchCard(vm),
    h2hCard(vm),
    refereeCard(vm)
  ].filter(Boolean);
  root.innerHTML=`<div class="page">
    ${hero(vm)}
    ${signalCard(vm)}
    ${matchReadingCard(vm)}
    ${reasonsCard(vm)}
    ${keyInsightsCard(vm)}
    <div class="lead-grid">
      <div class="lead-main">${mainCol.join('')}</div>
      <div class="lead-aside">${asideCol.join('')}</div>
    </div>
  </div>`;
  bindMotion();
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
    const isFree=String(raw.id)===String(pickFreeMatchId(list));
    if(isFree&&!ctx.session){renderAuthWall(raw);return;}
    if(!isFree&&!ctx.isPro){renderProWall(raw);return;}
    render(raw);
  }catch(e){
    root.innerHTML=`<div class="match-error"><b>${esc(e.message||'Erreur de chargement')}</b><a href="/">Retour à l'accueil</a></div>`;
  }
}
init();
})();
