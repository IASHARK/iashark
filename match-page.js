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
// juste un reperage visuel plus rapide entre les sections, comme demande.
const ICONS={
  h2h:'<path d="M8 3v4M16 3v4M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/>',
  compare:'<path d="M6 20V10M12 20V4M18 20v-7"/>',
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  whistle:'<path d="M4 12a5 5 0 0 1 5-5h6.5A4.5 4.5 0 0 1 20 11.5a4.5 4.5 0 0 1-4.5 4.5H12l-3 3v-3a5 5 0 0 1-5-4Z"/><circle cx="8.5" cy="12" r="1.4"/>',
  flame:'<path d="M12 3s4 3.5 4 7.5a4 4 0 0 1-8 0C8 8.5 9 6.5 9 6.5s-1 3-.5 4.5C9 13 10.3 14 12 14s3-1 3-3c0-2.5-1.5-4.5-3-8Z"/><path d="M8.5 14.5a5 5 0 0 0 7 5 5 5 0 0 0 2-6.5"/>',
  reasons:'<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="4.5" cy="18" r="1.4" fill="currentColor" stroke="none"/>'
};
const cardIcon=key=>ICONS[key]?`<svg viewBox="0 0 24 24" class="card-icon">${ICONS[key]}</svg>`:'';
const card=(title,body,cls='',icon='')=>`<section class="card ${cls}"><h2>${cardIcon(icon)}${esc(title)}</h2>${body}</section>`;

// Ring de probabilite : meme technique que score-ring (fiche joueur,
// player-page.js) - stroke-dasharray/-offset sur un cercle SVG reel, aucune
// approximation visuelle. Version compacte pour tenir dans une cellule de
// stat de la carte Recommandation.
function probRing(value){
  if(n(value)===null)return '';
  const r=20,c=2*Math.PI*r,offset=c*(1-clamp(value)/100);
  return `<div class="prob-ring"><svg viewBox="0 0 48 48"><circle class="track" cx="24" cy="24" r="${r}"></circle><circle class="fill" cx="24" cy="24" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"></circle></svg><div class="val">${Math.round(value)}<small>%</small></div></div>`;
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
function hero(vm){
  const i=vm.identity;
  const s=i.standings||{};
  return `<section class="card hero">
    <div class="hero-top">
      <div class="hero-league">${img(i.league.logo,i.league.name)}<span>${esc(i.league.name)}</span></div>
      <span class="hero-time">${esc(i.date||'Date à confirmer')} · ${esc(i.time||'—')}${vm.model.available?' · <span class="ready">● Analyse disponible</span>':''}</span>
    </div>
    <div class="hero-teams">
      <div class="hero-team">${img(i.home.logo,i.home.name)}<b>${esc(i.home.name)}</b>${teamMeta(s.home)}</div>
      <div class="hero-vs">VS</div>
      <div class="hero-team">${img(i.away.logo,i.away.name)}<b>${esc(i.away.name)}</b>${teamMeta(s.away)}</div>
    </div>
    ${vm.conditions.venue||vm.conditions.weather?`<div class="hero-venue">${vm.conditions.venue?`<span class="hv-venue"><svg viewBox="0 0 24 24"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>${esc(vm.conditions.venue)}</span>`:''}${vm.conditions.weather?`<span class="hv-weather">${esc(vm.conditions.weather.temperature)} · ${esc(vm.conditions.weather.description)}</span>`:''}</div>`:''}
  </section>`;
}

// Badge confiance/risque : mappage texte -> couleur, aucune logique de
// decision ici, uniquement les champs deja calcules par le pipeline.
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

function recommendation(vm){
  const r=vm.model.recommendation;
  if(!r)return card('Recommandation IASHARK',empty(vm.model.unavailableReason||'Aucun marché ne franchit les seuils de confiance ou de cote minimale pour ce match — IASHARK préfère ne pas se prononcer.'));
  const fair=r.probability>0?100/r.probability:null;
  const value=vm.model.value;
  return `<section class="card reco">
    <div class="reco-head">
      <div><span class="reco-eyebrow">Recommandation IASHARK</span><h1 class="reco-market">${esc(r.market)}</h1></div>
      <div class="reco-badges">${confidenceBadge(r.reliability)}${riskBadge(vm.editorial.riskCode)}</div>
    </div>
    <div class="reco-stats">
      <div class="reco-prob"><small>Probabilité</small>${probRing(r.probability)}</div>
      <div><small>Score IASHARK</small><b>${vm.model.iasharkScore===null?'—':Math.round(vm.model.iasharkScore)+'/100'}</b></div>
      <div><small>Cote équitable</small><b>${fmt(fair,2)}</b></div>
      <div><small>Cote moyenne</small><b>${fmt(vm.model.recommendedOdds,2)}</b></div>
      ${value!==null?`<div><small>Value</small><b class="${value>=0?'pos':'neg'}">${value>=0?'+':''}${fmt(value)}%</b></div>`:''}
    </div>
  </section>`;
}

// "Pourquoi ce pari" : vm.editorial.reasons (raw.decision_factors, deja
// calcule cote pipeline - cf lib/decision.js) - jamais rempli ici, juste mis
// en avant visuellement en liste numerotee plutot que noye dans le texte de
// lecture. Absent -> carte absente, jamais une raison generique inventee.
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

function comparison(vm){
  const c=vm.comparison;
  if(!c||!c.rows.length)return empty('Statistiques comparatives indisponibles.');
  return c.rows.map(row=>{
    const max=Math.max(row.home,row.away,1);
    return `<div class="compare-row"><b>${fmt(row.home)}</b><div class="compare-bar home"><i style="width:${row.home/max*100}%"></i></div><span>${esc(row.label)}</span><div class="compare-bar away"><i style="width:${row.away/max*100}%"></i></div><b>${fmt(row.away)}</b></div>`;
  }).join('');
}

function scores(vm){
  const s=vm.model.scores;
  if(!s.length)return empty('Scores probables indisponibles.');
  return `<div class="scores-row">${s.map(x=>`<div class="score-pill"><b>${esc(x.score)}</b><small>${pct(x.probability)}</small></div>`).join('')}</div>`;
}

// Le risque n'est affiche en toutes lettres ici que s'il s'agit d'un texte
// descriptif reel (raw.risk_principal) - le simple CODE FAIBLE/MODERE/ELEVE
// (raw.risque) est deja rendu par le badge de la recommandation, pas repete
// tel quel en pseudo-phrase ici.
function reading(vm){
  const text=vm.editorial.reading;
  const risk=vm.editorial.risk;
  const risqueDescriptif=risk&&!['FAIBLE','MODERE','ELEVE'].includes(risk)?risk:null;
  if(!text&&!risqueDescriptif)return empty('Lecture du match indisponible.');
  return `${text?`<p class="reading">${esc(text)}</p>`:''}${risqueDescriptif?`<div class="risk-note"><b>⚠</b><span>${esc(risqueDescriptif)}</span></div>`:''}`;
}

// Joueurs cles : vm.players.impactRanking vient soit des vraies stats
// historiques du joueur (playerAnalytics, name/team/position/rating5/
// goals90/keyPasses90/minutesRecent), soit - a defaut - des props joueur
// (playerImpactRanking, player/impactScore, sans team/photo/position).
// Les deux formes sont gerees ici, chaque stat n'est affichee que si elle
// existe reellement pour CE joueur.
function players(vm){
  const list=vm.players.impactRanking.slice(0,3);
  if(!list.length)return '';
  return card('Joueurs clés',`<div class="players">${list.map(p=>{
    const name=p.name||p.player||'Joueur';
    const impactVal=n(p.impact)!==null?n(p.impact):n(p.impactScore);
    const stats=[];
    if(n(p.rating5)!==null)stats.push(['Note moy.',fmt(p.rating5)]);
    if(n(p.goals90)!==null)stats.push(['Buts/90',fmt(p.goals90)]);
    if(n(p.keyPasses90)!==null)stats.push(['Passes clés/90',fmt(p.keyPasses90)]);
    if(n(p.minutesRecent)!==null)stats.push(['Min. récentes',fmt(p.minutesRecent,0)]);
    if(n(p.startProbability)!==null)stats.push(['Proba. titulaire',pct(p.startProbability)]);
    // Fiche joueur cliquable uniquement quand on a un vrai id joueur
    // (forme playerAnalytics) - la forme de repli (props joueur) n'a pas
    // toujours d'id exploitable, reste alors une simple carte non cliquable.
    const pid=n(p.id)!==null?n(p.id):n(p.playerId);
    const tag=pid!==null?'a':'div';
    const href=pid!==null?` href="/joueur.html?m=${esc(vm.id)}&p=${pid}"`:'';
    return `<${tag} class="player"${href}>${img(p.photo,name)}<div class="player-info"><b>${esc(name)}</b><small>${esc(p.team||'')}${p.team&&p.position?' · ':''}${esc(p.position||'')}</small>${stats.length?`<div class="player-stats">${stats.map(([l,v])=>`<span>${esc(l)} <b>${esc(v)}</b></span>`).join('')}</div>`:''}</div><div class="player-impact"><b>${impactVal===null?'—':Math.round(impactVal)}</b><small>Impact</small></div></${tag}>`;
  }).join('')}</div>`,'players-card');
}

// Scenario par tranches de 15 minutes : texte reel genere par le pipeline
// (raw.scenario_15min) a partir des tendances historiques par tranche,
// deja calcule - aucune nouvelle logique ici, juste l'affichage.
// Petit graphique en barres au-dessus de la liste : reprend les memes
// probabilites reelles par tranche (s.prob) deja affichees en texte,
// aucune nouvelle donnee - juste une lecture visuelle plus rapide qu'un
// bloc de texte uniforme.
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

function absences(vm){
  const a=vm.players.absences;
  if(!a.home.length&&!a.away.length&&!vm.players.injuriesFetchOk)return '';
  const side=(team,items)=>`<div><h3>${img(team.logo,team.name)}${esc(team.name)}</h3>${items.length?items.slice(0,5).map(x=>`<div class="abs-row"><b>${esc(x.name)}</b><span>${esc(x.status||'Incertain')}</span></div>`).join(''):'<p class="abs-none">Aucune absence signalée</p>'}</div>`;
  return card('Absents & incertains',`<div class="absences">${side(vm.identity.home,a.home)}${side(vm.identity.away,a.away)}</div>`);
}

// Face-a-face : vm.h2h deja formate/filtre par le view-model (5 dernieres
// confrontations reelles). Le camp gagnant (winner '1'/'2') est deja
// relatif a l'equipe domicile DU MATCH ACTUEL - on retrouve juste laquelle
// des deux equipes de CETTE ligne correspond a ce camp pour la mettre en
// evidence, aucune donnee recalculee.
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

function refereeCard(vm){
  const r=vm.referee;
  if(!r)return '';
  const stats=[];
  if(n(r.cardsPerMatch)!==null)stats.push(['Cartons/match',fmt(r.cardsPerMatch)]);
  if(n(r.penaltiesPerMatch)!==null)stats.push(['Penaltys/match',fmt(r.penaltiesPerMatch)]);
  if(n(r.matches)!==null)stats.push(['Matchs observés',fmt(r.matches,0)]);
  return card('Arbitre',`<div class="referee"><b>${esc(r.name)}</b>${stats.length?`<div class="referee-stats">${stats.map(([l,v])=>`<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}</div>`:''}</div>`,'','whistle');
}

// Matchups a cibler : vm.matchups deja calcule (ecart reel >= seuil, cf
// lib/match-view-model.js) - simple affichage, aucune nouvelle logique.
function matchupsCard(vm){
  const list=vm.matchups;
  if(!list.length)return '';
  return card('Matchups à cibler',`<div class="matchups">${list.map(mchp=>`<div class="matchup"><b>${esc(mchp.title)}</b><p>${esc(mchp.text)}</p></div>`).join('')}</div>`,'','target');
}

// Joueurs en forme : vm.players.watch (buteur/passeur le plus actif sur les
// evenements reels des derniers matchs, deja calcule) - distinct des
// "Joueurs cles" (impact toutes stats confondues), volontairement plus
// discret / secondaire.
function watchCard(vm){
  const list=vm.players.watch;
  if(!list.length)return '';
  return card('Joueurs en forme',`<div class="watch-list">${list.map(p=>`<div class="watch-pill">${img(p.photo,p.name)}<span>${esc(p.name)}</span>${n(p.value)!==null?`<b>${esc(fmt(p.value,0))}</b>`:''}</div>`).join('')}</div>`,'watch-card','flame');
}

function render(raw){
  const vm=IasharkMatchViewModel.buildMatchViewModel(raw);
  document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;
  root.innerHTML=`<div class="page">
    ${hero(vm)}
    ${recommendation(vm)}
    <div class="dashboard">
      <div class="col-main">
        ${reasonsCard(vm)}
        <div class="row2">${card('Probabilités 1X2',probabilities(vm))}${card('Buts attendus',xg(vm))}</div>
        ${card('Comparatif des équipes',comparison(vm),'','compare')}
        ${card('Scénario par tranches de 15 minutes',scenario15(vm))}
        ${card('Lecture du match',reading(vm))}
        ${players(vm)}
      </div>
      <div class="col-side">
        ${watchCard(vm)}
        ${h2hCard(vm)}
        ${matchupsCard(vm)}
        ${card('Scores les plus probables',scores(vm))}
        ${absences(vm)}
        ${refereeCard(vm)}
      </div>
    </div>
  </div>`;
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
