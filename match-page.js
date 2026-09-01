(function(){'use strict';
const root=document.getElementById('matchRoot');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,d=1)=>n(v)===null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d});
const pct=v=>n(v)===null?'—':fmt(v)+'%';
const clamp=v=>Math.max(0,Math.min(100,n(v)||0));
const img=(src,alt)=>src?`<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">`:'';
const empty=t=>`<div class="empty">${esc(t)}</div>`;

// Icones de titre de carte : purement decoratives (memes tokens de couleur
// que le reste de la page), aucune information supplementaire encodee -
// juste un reperage visuel plus rapide entre les sections.
const ICONS={
  h2h:'<path d="M8 3v4M16 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  compare:'<path d="M6 20V10M12 20V4M18 20v-7"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  whistle:'<path d="M4 12a5 5 0 0 1 5-5h6.5A4.5 4.5 0 0 1 20 11.5a4.5 4.5 0 0 1-4.5 4.5H12l-3 3v-3a5 5 0 0 1-5-4Z"/><circle cx="8.5" cy="12" r="1.4"/>',
  reasons:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none"/>',
  target2:'<path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"/>',
  chart:'<path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6"/>',
  players:'<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 20c.3-2.3 1.8-3.8 4-4.2"/>',
  info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/>'
};
const cardIcon=key=>ICONS[key]?`<svg viewBox="0 0 24 24" class="card-icon">${ICONS[key]}</svg>`:'';
const card=(title,body,cls='',icon='')=>`<section class="card reveal ${cls}"><h2>${cardIcon(icon)}${esc(title)}</h2>${body}</section>`;
const sectionTitle=(icon,label)=>`<div class="section-title reveal">${cardIcon(icon)}<h2>${esc(label)}</h2></div>`;

// Ring de probabilite : stroke-dasharray/-offset sur un cercle SVG reel,
// aucune approximation visuelle. data-target porte le vrai offset final -
// init() bascule dessus au premier frame pour obtenir un remplissage
// anime au chargement (cf CSS transition sur .fill).
function probRing(value,big){
  if(n(value)===null)return '';
  const r=big?52:20,c=2*Math.PI*r,offset=c*(1-clamp(value)/100),size=big?128:48,cx=size/2;
  return `<div class="prob-ring${big?' big':''}"><svg viewBox="0 0 ${size} ${size}"><circle class="track" cx="${cx}" cy="${cx}" r="${r}"></circle><circle class="fill" cx="${cx}" cy="${cx}" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-target="${offset.toFixed(1)}"></circle></svg><div class="val">${Math.round(value)}<small>%</small></div></div>`;
}

// Forme recente (5 derniers resultats du championnat, raw.classement.form) :
// simples pastilles colorees, aucune interpretation ajoutee.
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

// Hero + Recommandation fusionnes en un seul bloc d'ouverture ("le hook") :
// c'est la toute premiere chose vue, donc le seul endroit ou on peut se
// permettre plus d'impact visuel - tout le reste de la page reste sobre.
// Aucune nouvelle donnee : mêmes champs que l'ancien hero()+recommendation().
function heroHook(vm){
  const i=vm.identity,s=i.standings||{},r=vm.model.recommendation;
  const fair=r&&r.probability>0?100/r.probability:null;
  const venueLine=vm.conditions.venue||vm.conditions.weather?`<div class="hero-venue">${vm.conditions.venue?`<span class="hv-venue"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>${esc(vm.conditions.venue)}</span>`:''}${vm.conditions.weather?`<span class="hv-weather">${esc(vm.conditions.weather.temperature)} · ${esc(vm.conditions.weather.description)}</span>`:''}</div>`:'';
  return `<section class="card hook">
    <div class="hero-top">
      <div class="hero-league">${img(i.league.logo,i.league.name)}<span>${esc(i.league.name)}</span></div>
      <span class="hero-time">${esc(i.date||'Date à confirmer')} · ${esc(i.time||'—')}${vm.model.available?' · <span class="ready"><i></i>Analyse disponible</span>':''}</span>
    </div>
    <div class="hero-teams">
      <div class="hero-team">${img(i.home.logo,i.home.name)}<b>${esc(i.home.name)}</b>${teamMeta(s.home)}</div>
      <div class="hero-vs">VS</div>
      <div class="hero-team">${img(i.away.logo,i.away.name)}<b>${esc(i.away.name)}</b>${teamMeta(s.away)}</div>
    </div>
    ${venueLine}
    ${r?`<div class="pick">
      <div class="pick-head">
        <div><span class="pick-eyebrow">Recommandation IASHARK</span><h1 class="pick-market">${esc(r.market)}</h1></div>
        <div class="pick-badges">${confidenceBadge(r.reliability)}${riskBadge(vm.editorial.riskCode)}</div>
      </div>
      <div class="pick-body">
        ${probRing(r.probability,true)}
        <div class="pick-odds">
          <div><small>Cote juste</small><b>${fmt(fair,2)}</b></div>
          <div><small>Cote du marché</small><b>${fmt(vm.model.recommendedOdds,2)}</b></div>
        </div>
      </div>
    </div>`:`<div class="pick pick-empty">${empty(vm.model.unavailableReason||'Aucun marché ne franchit les seuils de confiance ou de cote minimale pour ce match — IASHARK préfère ne pas se prononcer.')}</div>`}
  </section>`;
}

// "Pourquoi ce pari" : vm.editorial.reasons (raw.decision_factors, deja
// calcule cote pipeline) - jamais rempli ici. Absent -> carte absente,
// jamais une raison generique inventee.
function reasonsCard(vm){
  const list=vm.editorial.reasons;
  if(!list.length)return '';
  return card('Pourquoi ce pari ?',`<div class="reasons">${list.map((r,i)=>`<div class="reason"><b>${i+1}</b><p>${esc(r)}</p></div>`).join('')}</div>`,'','reasons');
}

function probabilities(vm){
  const p=vm.model.probabilities;
  if(!p)return empty('Probabilités indisponibles.');
  return `<div class="prob-bar"><span class="home" style="width:${clamp(p.home)}%">${p.home>=10?pct(p.home):''}</span><span class="draw" style="width:${clamp(p.draw)}%">${p.draw>=10?pct(p.draw):''}</span><span class="away" style="width:${clamp(p.away)}%">${p.away>=10?pct(p.away):''}</span></div><div class="prob-legend"><span>Domicile</span><span>Nul</span><span>Extérieur</span></div>`;
}
function xg(vm){
  const x=vm.model.expectedGoals;
  if(!x)return empty('xG indisponibles.');
  return `<div class="xg-row"><div class="xg-team">${img(vm.identity.home.logo,vm.identity.home.name)}<b>${fmt(x.home)}</b><small>${esc(vm.identity.home.name)}</small></div><span class="xg-sep">xG</span><div class="xg-team">${img(vm.identity.away.logo,vm.identity.away.name)}<b>${fmt(x.away)}</b><small>${esc(vm.identity.away.name)}</small></div></div>`;
}
function scores(vm){
  const s=vm.model.scores;
  if(!s.length)return empty('Scores probables indisponibles.');
  return `<div class="scores-row">${s.map(x=>`<div class="score-pill"><b>${esc(x.score)}</b><small>${pct(x.probability)}</small></div>`).join('')}</div>`;
}

function comparison(vm){
  const c=vm.comparison;
  if(!c||!c.rows.length)return empty('Statistiques comparatives indisponibles.');
  return c.rows.map(row=>{
    const max=Math.max(row.home,row.away,1);
    return `<div class="compare-row"><b>${fmt(row.home)}</b><div class="compare-bar home"><i style="width:${row.home/max*100}%"></i></div><span>${esc(row.label)}</span><div class="compare-bar away"><i style="width:${row.away/max*100}%"></i></div><b>${fmt(row.away)}</b></div>`;
  }).join('');
}

// Le risque n'est affiche en toutes lettres ici que s'il s'agit d'un texte
// descriptif reel (raw.risk_principal) - le simple CODE FAIBLE/MODERE/ELEVE
// est deja rendu par le badge de la recommandation, pas repete en pseudo-
// phrase ici.
function reading(vm){
  const text=vm.editorial.reading;
  const risk=vm.editorial.risk;
  const risqueDescriptif=risk&&!['FAIBLE','MODERE','ELEVE'].includes(risk)?risk:null;
  if(!text&&!risqueDescriptif)return empty('Lecture du match indisponible.');
  return `${text?`<p class="reading">${esc(text)}</p>`:''}${risqueDescriptif?`<div class="risk-note"><b>⚠</b><span>${esc(risqueDescriptif)}</span></div>`:''}`;
}

// Scenario par tranches de 15 minutes : texte reel genere par le pipeline
// (raw.scenario_15min), aucune nouvelle logique. Graphique en barres au-
// dessus : mêmes probabilites reelles par tranche (s.prob), juste une
// lecture visuelle plus rapide qu'un bloc de texte uniforme.
function scenario15Chart(slots,max){
  const W=300,H=80,pad=6,gap=6,base=64,top=14,nBars=slots.length,bw=(W-2*pad-gap*(nBars-1))/nBars;
  const bars=slots.map((s,i)=>{
    const val=n(s.prob)||0,h=Math.max(3,val/max*(base-top)),x=pad+i*(bw+gap),y=base-h,labelY=Math.max(9,y-4);
    return `<rect class="sc-bar" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" style="animation-delay:${i*60}ms"></rect><text x="${(x+bw/2).toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="middle" font-size="7" fill="var(--cyan)">${Math.round(val)}%</text><text x="${(x+bw/2).toFixed(1)}" y="${(H-2).toFixed(1)}" text-anchor="middle" font-size="6" fill="var(--muted)">${esc((s.t||'').replace('min',''))}</text>`;
  }).join('');
  return `<svg class="scenario-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="${pad}" y1="${base}" x2="${W-pad}" y2="${base}" stroke="rgba(0,213,255,.12)"></line>${bars}</svg>`;
}
function scenario15(vm){
  const slots=vm.editorial.scenario15;
  if(!slots.length)return empty('Scénario par tranches de 15 minutes indisponible.');
  const max=Math.max(...slots.map(s=>n(s.prob)||0),1);
  const rows=slots.map(s=>{
    const intensity=Math.max(.15,(n(s.prob)||0)/max).toFixed(2);
    return `<div class="scenario-row" style="border-left:3px solid rgba(0,213,255,${intensity})"><div class="scenario-row-head"><b>${esc(s.t)}</b><span>${pct(s.prob)}</span></div><p>${esc(s.txt)}</p></div>`;
  }).join('');
  return `${scenario15Chart(slots,max)}<div class="scenario-15">${rows}</div>`;
}

// Face-a-face : vm.h2h deja formate/filtre (5 dernieres confrontations
// reelles). Le camp gagnant (winner '1'/'2') est deja relatif a l'equipe
// domicile DU MATCH ACTUEL - on retrouve juste laquelle des deux equipes de
// CETTE ligne correspond a ce camp, aucune donnee recalculee.
function h2hCard(vm){
  const rows=vm.h2h;
  if(!rows)return '';
  const homeName=vm.identity.home.name,awayName=vm.identity.away.name;
  const body=rows.map(row=>{
    const homeWin=row.winner==='1'&&row.home===homeName||row.winner==='2'&&row.home===awayName;
    const awayWin=row.winner==='1'&&row.away===homeName||row.winner==='2'&&row.away===awayName;
    return `<div class="h2h-row"><span class="h2h-date">${esc(row.date)}</span><span class="h2h-teams"><span class="${homeWin?'win':''}">${esc(row.home)}</span><b class="h2h-score">${esc(row.score)}</b><span class="${awayWin?'win':''}">${esc(row.away)}</span></span></div>`;
  }).join('');
  return card('Face-à-face',`<div class="h2h-list">${body}</div>`,'','h2h');
}

// Matchups a cibler : vm.matchups deja calcule (ecart reel >= seuil,
// domicile et exterieur sur deux metriques reelles differentes - cf
// lib/match-view-model.js) - simple affichage, aucune nouvelle logique.
function matchupsCard(vm){
  const list=vm.matchups;
  if(!list.length)return '';
  return card('Matchups à cibler',`<div class="matchups">${list.map(mchp=>`<div class="matchup"><b>${esc(mchp.title)}</b><p>${esc(mchp.text)}</p></div>`).join('')}</div>`,'','target');
}

// Buteurs potentiels : vm.players.scoringThreat, classement REEL par signal
// de menace de but (buts/90 + tirs cadres/90, cf lib/match-view-model.js) -
// distinct de l'ancien classement "impact" generique. Barre de menace
// relative au max du lot affiche, purement visuelle (pas une nouvelle
// donnee). Absent -> section absente, jamais un joueur invente.
function scoringThreatCard(vm){
  const list=vm.players.scoringThreat;
  if(!list.length)return '';
  const max=Math.max(...list.map(p=>p.threatScore),.01);
  return card('Buteurs potentiels',`<div class="threats">${list.map(p=>{
    const pid=n(p.id);
    const href=pid!==null?` href="/joueur.html?m=${esc(vm.id)}&p=${pid}"`:'';
    const tag=pid!==null?'a':'div';
    const bar=Math.max(6,p.threatScore/max*100);
    return `<${tag} class="threat"${href}>${img(p.photo,p.name)}<div class="threat-info"><b>${esc(p.name)}</b><small>${esc(p.team||'')}</small><div class="threat-bar"><i style="width:${bar}%"></i></div><div class="threat-stats"><span>But/90 <b>${fmt(p.goals90)}</b></span><span>Tirs cadrés/90 <b>${fmt(p.shotsOn90)}</b></span>${n(p.startProbability)!==null?`<span>Titulaire <b>${pct(p.startProbability)}</b></span>`:''}</div></div></${tag}>`;
  }).join('')}</div>`,'threats-card','target2');
}

function absences(vm){
  const a=vm.players.absences;
  if(!a.home.length&&!a.away.length&&!vm.players.injuriesFetchOk)return '';
  const side=(team,items)=>`<div><h3>${img(team.logo,team.name)}${esc(team.name)}</h3>${items.length?items.slice(0,5).map(x=>`<div class="abs-row"><b>${esc(x.name)}</b><span>${esc(x.status||'Incertain')}</span></div>`).join(''):'<p class="abs-none">Aucune absence signalée</p>'}</div>`;
  return card('Absents & incertains',`<div class="absences">${side(vm.identity.home,a.home)}${side(vm.identity.away,a.away)}</div>`);
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

// Navigation d'ancres : uniquement les sections qui existent reellement pour
// CE match (jamais un lien mort vers une section vide). Le suivi de section
// active (scroll-spy) et le scroll fluide sont geres par bindNav() apres
// insertion dans le DOM.
function buildSections(vm){
  const analyseBody=`
    <div class="signal-strip">
      ${card('Probabilités 1X2',probabilities(vm))}
      ${card('Buts attendus',xg(vm))}
      ${card('Scores les plus probables',scores(vm))}
    </div>
    ${card('Lecture du match',reading(vm),'','info')}
    ${card('Scénario par tranches de 15 minutes',scenario15(vm),'','chart')}
  `;
  const compareBody=`
    ${card('Comparatif des équipes',comparison(vm),'','compare')}
    <div class="row2">${h2hCard(vm)}${matchupsCard(vm)}</div>
  `;
  const buteursBody=scoringThreatCard(vm);
  const contexteBody=`<div class="row2">${absences(vm)}${refereeCard(vm)}</div>`;
  const sections=[
    {id:'analyse',label:'Analyse',icon:'chart',body:analyseBody,always:true},
    {id:'comparatif',label:'Comparatif',icon:'compare',body:compareBody,present:!!(vm.comparison||vm.h2h||vm.matchups.length)},
    {id:'buteurs',label:'Buteurs',icon:'target2',body:buteursBody,present:!!buteursBody},
    {id:'contexte',label:'Contexte',icon:'whistle',body:contexteBody,present:!!(vm.players.absences.home.length||vm.players.absences.away.length||vm.players.injuriesFetchOk||vm.referee)}
  ].filter(s=>s.always||s.present);
  const nav=`<nav class="section-nav"><div class="section-nav-inner">${sections.map(s=>`<a href="#sec-${s.id}" data-target="sec-${s.id}">${cardIcon(s.icon)}${esc(s.label)}</a>`).join('')}</div></nav>`;
  const body=sections.map(s=>`<section id="sec-${s.id}" class="page-section">${sectionTitle(s.icon,s.label)}${s.body}</section>`).join('');
  return nav+body;
}

function render(raw){
  const vm=IasharkMatchViewModel.buildMatchViewModel(raw);
  document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;
  root.innerHTML=`<div class="page">
    ${heroHook(vm)}
    ${reasonsCard(vm)}
    ${buildSections(vm)}
  </div>`;
  bindMotion();
}

// Scroll-spy + scroll fluide pour la nav de sections, et remplissage anime
// du ring de probabilite au chargement. reveal-on-scroll respecte
// prefers-reduced-motion (les elements restent simplement visibles, sans
// classe .reveal appliquee par CSS dans ce cas - cf assets/match-page.css).
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
    // Filet de securite : un onglet en arriere-plan au chargement (ouvert
    // depuis un lien externe, prerender...) suspend IntersectionObserver -
    // sans ce filet le contenu resterait invisible indefiniment. Jamais de
    // contenu bloque a opacite 0 : au pire l'animation d'entree est sautee.
    setTimeout(()=>{items.forEach(el=>el.classList.add('in'));},2500);
  }else{
    root.querySelectorAll('.reveal').forEach(el=>el.classList.add('in'));
  }
  const nav=root.querySelector('.section-nav');
  if(!nav)return;
  const links=[...nav.querySelectorAll('a')];
  const sections=links.map(a=>document.getElementById(a.dataset.target)).filter(Boolean);
  if('IntersectionObserver' in window && sections.length){
    const spy=new IntersectionObserver(entries=>{
      entries.forEach(en=>{
        if(en.isIntersecting){
          links.forEach(a=>a.classList.toggle('active',a.dataset.target===en.target.id));
        }
      });
    },{rootMargin:'-40% 0px -55% 0px',threshold:0});
    sections.forEach(s=>spy.observe(s));
  }
}

async function init(){
  try{
    const id=typeof FIXED_MATCH_ID!=='undefined'?String(FIXED_MATCH_ID):new URLSearchParams(location.search).get('id');
    let raw=typeof PRELOADED_MATCH!=='undefined'?PRELOADED_MATCH:null;
    if(window.IasharkApp){
      const session=(await window.IasharkApp.supabase.auth.getSession()).data.session;
      if(session){
        const result=await window.IasharkApp.supabase.functions.invoke('match-data');
        if(result.data&&!result.error)raw=(result.data.matchs||[]).find(x=>String(x.id)===String(id))||raw;
      }
    }
    if(!raw){
      const data=await fetch(`/data.json?t=${Date.now()}`).then(r=>r.json());
      raw=(data.matchs||[]).find(x=>String(x.id)===String(id));
    }
    if(!raw)throw new Error('Match introuvable');
    render(raw);
  }catch(e){
    root.innerHTML=`<div class="match-error"><b>${esc(e.message||'Erreur de chargement')}</b><a href="/">Retour à l'accueil</a></div>`;
  }
}
init();
})();
