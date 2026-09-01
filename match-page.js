(function(){'use strict';
const root=document.getElementById('matchRoot');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,d=1)=>n(v)===null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d});
const pct=v=>n(v)===null?'—':fmt(v)+'%';
const clamp=v=>Math.max(0,Math.min(100,n(v)||0));
const img=(src,alt)=>src?`<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">`:'';
const empty=t=>`<div class="empty">${esc(t)}</div>`;

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
  cloud:'<path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 8.5 4.5 4.5 0 0 1 15.5 18H7Z"/>'
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
function tagsRow(vm){
  const tags=[];
  tags.push(['trophy',vm.identity.league.name]);
  const x=vm.model.expectedGoals;
  if(x&&n(x.home)!==null&&n(x.away)!==null&&(x.home+x.away)>=3){
    tags.push(['chart','Match offensif attendu']);
  }
  if(vm.conditions.weather){
    tags.push(['cloud',`${esc(vm.conditions.weather.temperature)} · ${esc(vm.conditions.weather.description)}`]);
  }
  if(!tags.length)return '';
  return `<div class="tags-row reveal">${tags.map(([icon,label])=>`<span class="tag">${cardIcon(icon)}${label}</span>`).join('')}</div>`;
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
    ${vm.conditions.venue?`<div class="hero-venue"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>${esc(vm.conditions.venue)}</div>`:''}
  </section>`;
}

// Recommandation : ring + Score IASHARK + Cote juste + Cote marche + Value -
// tous deja calcules cote pipeline/view-model, aucune nouvelle donnee.
function recommendation(vm){
  const r=vm.model.recommendation;
  if(!r)return card('Recommandation IASHARK',empty(vm.model.unavailableReason||'Aucun marché ne franchit les seuils de confiance ou de cote minimale pour ce match — IASHARK préfère ne pas se prononcer.'));
  const fair=r.probability>0?100/r.probability:null;
  const value=vm.model.value;
  return `<section class="card reco reveal">
    <div class="reco-head">
      <div><span class="reco-eyebrow">Recommandation IASHARK</span><h1 class="reco-market">${esc(r.market)}</h1></div>
      <div class="reco-badges">${confidenceBadge(r.reliability)}${riskBadge(vm.editorial.riskCode)}</div>
    </div>
    <div class="reco-stats">
      <div class="reco-prob"><small>Probabilité modèle</small>${probRing(r.probability,true)}</div>
      <div><small>Score IASHARK</small><b>${vm.model.iasharkScore===null?'—':Math.round(vm.model.iasharkScore)+'/100'}</b></div>
      <div><small>Cote équitable</small><b>${fmt(fair,2)}</b></div>
      <div><small>Cote marché</small><b>${fmt(vm.model.recommendedOdds,2)}</b></div>
      ${value!==null?`<div><small>Value</small><b class="${value>=0?'pos':'neg'}">${value>=0?'+':''}${fmt(value)}%</b></div>`:''}
    </div>
  </section>`;
}

function reasonsCard(vm){
  const list=vm.editorial.reasons;
  if(!list.length)return '';
  return card('Pourquoi ce pari ?',`<div class="reasons">${list.map((r,i)=>`<div class="reason"><b>${i+1}</b><p>${esc(r)}</p></div>`).join('')}</div>`,'','reasons');
}

// Buteurs potentiels ("Menaces de but") : vm.players.scoringThreat, classe
// par vrai signal de menace (buts/90 + tirs cadres/90, min 3 apparitions,
// jamais un joueur absent - cf lib/match-view-model.js). Le chiffre mis en
// avant (buts/90) est une vraie stat, jamais une "probabilite de marquer"
// fabriquee - on n'a pas modelise ca.
function threatsCard(vm){
  const list=vm.players.scoringThreat;
  if(!list.length)return '';
  const max=Math.max(...list.map(p=>p.threatScore),.01);
  return card('Menaces de but',`<div class="threats">${list.slice(0,2).map(p=>{
    const pid=n(p.id);
    const href=pid!==null?` href="/joueur.html?m=${esc(vm.id)}&p=${pid}"`:'';
    const tag=pid!==null?'a':'div';
    const bar=Math.max(6,p.threatScore/max*100);
    return `<${tag} class="threat"${href}>
      <div class="threat-top">${img(p.photo,p.name)}<div><b>${esc(p.name)}</b><small>${esc(p.team||'')}</small></div></div>
      <div class="threat-figure"><b>${fmt(p.goals90)}</b><small>Buts /90</small></div>
      <div class="threat-bar"><i style="width:${bar}%"></i></div>
      <div class="threat-stats"><span>Tirs cadrés/90 <b>${fmt(p.shotsOn90)}</b></span>${n(p.startProbability)!==null?`<span>Titulaire <b>${pct(p.startProbability)}</b></span>`:''}</div>
    </${tag}>`;
  }).join('')}</div>`,'threats-card','target2');
}

function probabilities(vm){
  const p=vm.model.probabilities;
  if(!p)return empty('Probabilités indisponibles.');
  return `<div class="prob-bar"><span class="home" style="width:${clamp(p.home)}%">${p.home>=10?pct(p.home):''}</span><span class="draw" style="width:${clamp(p.draw)}%">${p.draw>=10?pct(p.draw):''}</span><span class="away" style="width:${clamp(p.away)}%">${p.away>=10?pct(p.away):''}</span></div><div class="prob-legend"><span>Domicile</span><span>Nul</span><span>Extérieur</span></div>`;
}

// Sorties modele : 1X2 + xG + Scores probables reunis dans une seule carte
// (au lieu de 3 cartes eparses) - meme densite que la maquette de reference.
function outputsCard(vm){
  const x=vm.model.expectedGoals,s=vm.model.scores;
  return card('Sorties modèle',`<div class="outputs">
    <div class="outputs-col"><small>Probabilités 1X2</small>${probabilities(vm)}</div>
    <div class="outputs-col outputs-xg"><small>Buts attendus (xG)</small>${x?`<div class="xg-row"><b>${fmt(x.home)}</b><span>xG</span><b>${fmt(x.away)}</b></div>`:empty('xG indisponibles.')}</div>
    <div class="outputs-col"><small>Scores probables</small>${s.length?`<div class="scores-row">${s.map(sc=>`<div class="score-pill"><b>${esc(sc.score)}</b><small>${pct(sc.probability)}</small></div>`).join('')}</div>`:empty('Scores probables indisponibles.')}</div>
  </div>`);
}

function comparison(vm){
  const c=vm.comparison;
  if(!c||!c.rows.length)return empty('Statistiques comparatives indisponibles.');
  return c.rows.map(row=>{
    const max=Math.max(row.home,row.away,1);
    return `<div class="compare-row"><b>${fmt(row.home)}</b><div class="compare-bar home"><i style="width:${row.home/max*100}%"></i></div><span>${esc(row.label)}</span><div class="compare-bar away"><i style="width:${row.away/max*100}%"></i></div><b>${fmt(row.away)}</b></div>`;
  }).join('');
}

function reading(vm){
  const text=vm.editorial.reading;
  const risk=vm.editorial.risk;
  const risqueDescriptif=risk&&!['FAIBLE','MODERE','ELEVE'].includes(risk)?risk:null;
  if(!text&&!risqueDescriptif)return empty('Lecture du match indisponible.');
  return `${text?`<p class="reading">${esc(text)}</p>`:''}${risqueDescriptif?`<div class="risk-note"><b>⚠</b><span>${esc(risqueDescriptif)}</span></div>`:''}`;
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
  const dots=slots.map((s,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(n(s.prob)||0).toFixed(1)}" r="3" fill="var(--cyan)"></circle><text x="${x(i).toFixed(1)}" y="${(y(n(s.prob)||0)-9).toFixed(1)}" text-anchor="middle" font-size="9" fill="var(--cyan)" font-weight="700">${Math.round(n(s.prob)||0)}%</text><text x="${x(i).toFixed(1)}" y="${H-4}" text-anchor="middle" font-size="8" fill="var(--muted)">${esc((s.t||'').replace('min',''))}</text>`).join('');
  return `<svg class="scenario-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><line x1="${pad}" y1="${base}" x2="${W-pad}" y2="${base}" stroke="rgba(0,213,255,.12)"></line><path d="${area}" fill="url(#scGrad)" class="sc-area"></path><path d="${path}" fill="none" stroke="var(--cyan)" stroke-width="2" class="sc-line"></path>${dots}<defs><linearGradient id="scGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--cyan)" stop-opacity=".25"/><stop offset="100%" stop-color="var(--cyan)" stop-opacity="0"/></linearGradient></defs></svg>`;
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

function matchupsCard(vm){
  const list=vm.matchups;
  if(!list.length)return '';
  return card('Matchups à cibler',`<div class="matchups">${list.map(mchp=>`<div class="matchup"><b>${esc(mchp.title)}</b><p>${esc(mchp.text)}</p></div>`).join('')}</div>`,'','target');
}

function absences(vm){
  const a=vm.players.absences;
  if(!a.home.length&&!a.away.length&&!vm.players.injuriesFetchOk)return '';
  const side=(team,items)=>`<div><h3>${img(team.logo,team.name)}${esc(team.name)}</h3>${items.length?items.slice(0,4).map(x=>`<div class="abs-row"><b>${esc(x.name)}</b><span>${esc(x.status||'Incertain')}</span></div>`).join(''):'<p class="abs-none">Aucune absence signalée</p>'}</div>`;
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

function render(raw){
  const vm=IasharkMatchViewModel.buildMatchViewModel(raw);
  document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;
  const bottomRow=[h2hCard(vm),matchupsCard(vm),absences(vm),refereeCard(vm)].filter(Boolean);
  root.innerHTML=`<div class="page">
    ${hero(vm)}
    ${tagsRow(vm)}
    ${recommendation(vm)}
    <div class="grid2">${reasonsCard(vm)}${threatsCard(vm)}</div>
    ${outputsCard(vm)}
    <div class="grid2 grid2-wide">${card('Comparatif des équipes',comparison(vm),'','compare')}${card('Scénario du match',scenarioCard(vm),'','chart')}</div>
    ${card('Lecture du match',reading(vm))}
    ${bottomRow.length?`<div class="grid-bottom">${bottomRow.join('')}</div>`:''}
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
