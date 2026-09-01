(function(){'use strict';
const root=document.getElementById('playerRoot');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,d=1)=>n(v)===null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d});
const pct=v=>n(v)===null?'—':fmt(v)+'%';
const clamp=v=>Math.max(0,Math.min(100,n(v)||0));
const img=(src,alt)=>src?`<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">`:'';
const empty=t=>`<div class="empty">${esc(t)}</div>`;
const card=(title,body,cls='')=>`<section class="card ${cls}"><h2>${esc(title)}</h2>${body}</section>`;

function scoreRing(score){
  if(n(score)===null)return '';
  const r=22,c=2*Math.PI*r,offset=c*(1-clamp(score)/100);
  return `<div class="score-ring"><svg viewBox="0 0 52 52"><circle class="track" cx="26" cy="26" r="${r}"></circle><circle class="fill" cx="26" cy="26" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"></circle></svg><div class="val">${Math.round(score)}</div></div>`;
}

function playerHeader(vm,player,matchId){
  const team=vm.identity[player.teamId===vm.identity.home.id?'home':'away'];
  return `<section class="card player-hero">
    <a class="back-to-match" href="/match.html?id=${esc(matchId)}">← Retour au match : ${esc(vm.identity.home.name)} vs ${esc(vm.identity.away.name)}</a>
    <div class="player-hero-main">
      ${player.photo?`<img class="player-hero-photo" src="${esc(player.photo)}" alt="${esc(player.name)}">`:'<div class="player-hero-photo placeholder">♟</div>'}
      <div class="player-hero-info">
        <h1>${esc(player.name)}</h1>
        <div class="player-hero-meta">${img(team.logo,team.name)}<span>${esc(player.team)}</span>${player.position?`<span>· ${esc(player.position)}</span>`:''}${player.number!==null?`<span>· N°${esc(String(player.number))}</span>`:''}</div>
        ${player.absent?'<span class="badge b-red">Absence signalée</span>':''}
      </div>
      ${player.impact!==null?scoreRing(player.impact):''}
    </div>
  </section>`;
}

function statsGrid(player){
  const items=[
    ['Note moy. (5 derniers)',n(player.rating5)!==null?fmt(player.rating5):null],
    ['Buts /90',n(player.goals90)!==null?fmt(player.goals90):null],
    ['Passes décisives /90',n(player.assists90)!==null?fmt(player.assists90):null],
    ['Passes clés /90',n(player.keyPasses90)!==null?fmt(player.keyPasses90):null],
    ['Tirs /90',n(player.shots90)!==null?fmt(player.shots90):null],
    ['Tirs cadrés /90',n(player.shotsOn90)!==null?fmt(player.shotsOn90):null],
    ['Minutes récentes',n(player.minutesRecent)!==null?fmt(player.minutesRecent,0):null],
    ['Apparitions récentes',n(player.appearances)!==null?String(player.appearances):null],
    ['Titularisations',n(player.starts)!==null?String(player.starts):null],
    ['Proba. de titularisation',n(player.startProbability)!==null?pct(player.startProbability):null]
  ].filter(([,v])=>v!==null);
  if(!items.length)return empty('Statistiques indisponibles pour ce joueur.');
  return `<div class="player-stats-grid">${items.map(([l,v])=>`<div class="player-stat-card"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>`;
}

function ratingTrend(player){
  const ratings=Array.isArray(player.ratings)?player.ratings.slice().reverse():[];
  if(!ratings.length)return '';
  const W=300,H=60,pad=8;
  const x=i=>ratings.length>1?pad+(i*(W-2*pad)/(ratings.length-1)):W/2;
  const y=v=>H-pad-((clamp(v*10))/100)*(H-2*pad);
  const path=ratings.map((v,i)=>`${i===0?'M':'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const dots=ratings.map((v,i)=>`<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.4" fill="var(--cyan)"></circle><text x="${x(i).toFixed(1)}" y="${(y(v)-6).toFixed(1)}" text-anchor="middle" font-size="7" fill="var(--cyan)">${fmt(v)}</text>`).join('');
  return `<svg class="rating-trend" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${path}" fill="none" stroke="var(--cyan)" stroke-width="1.6"></path>${dots}</svg><p class="rating-trend-note">Note par match (5 derniers matchs suivis), du plus ancien au plus récent.</p>`;
}

function matchHistory(rows){
  if(!rows.length)return empty('Historique match par match indisponible pour ce joueur.');
  return `<div class="table-scroll"><table class="history-table"><thead><tr><th>#</th><th>Min</th><th>Note</th><th>Statut</th><th>Buts</th><th>Passes D.</th><th>Tirs (cadrés)</th><th>Passes clés</th><th>Cartons</th></tr></thead><tbody>${rows.map((r,i)=>{
    const cards=[n(r.yellow)>0?`${r.yellow}🟨`:'',n(r.red)>0?`${r.red}🟥`:''].filter(Boolean).join(' ')||'—';
    return `<tr><td>${rows.length-i}</td><td>${n(r.minutes)!==null?fmt(r.minutes,0):'—'}</td><td>${n(r.rating)!==null?fmt(r.rating):'—'}</td><td>${r.starter?'Titulaire':'Remplaçant'}</td><td>${n(r.goals)!==null?fmt(r.goals,0):'—'}</td><td>${n(r.assists)!==null?fmt(r.assists,0):'—'}</td><td>${n(r.shots_total)!==null?fmt(r.shots_total,0):'—'}${n(r.shots_on)!==null?` (${fmt(r.shots_on,0)})`:''}</td><td>${n(r.key_passes)!==null?fmt(r.key_passes,0):'—'}</td><td>${cards}</td></tr>`;
  }).join('')}</tbody></table></div><p class="history-note">Le plus récent en haut. "#" numérote les matchs suivis pour ce joueur (pas l'historique complet de sa carrière).</p>`;
}

async function load(){
  const params=new URLSearchParams(location.search);
  const matchId=params.get('m'),playerId=Number(params.get('p'));
  if(!matchId||!Number.isFinite(playerId))throw new Error('Fiche joueur introuvable : lien invalide.');
  let raw=null;
  if(window.IasharkApp){
    const session=(await window.IasharkApp.supabase.auth.getSession()).data.session;
    if(session){
      const result=await window.IasharkApp.supabase.functions.invoke('match-data');
      if(result.data&&!result.error)raw=(result.data.matchs||[]).find(x=>String(x.id)===String(matchId));
    }
  }
  if(!raw){
    const data=await fetch(`/data.json?t=${Date.now()}`).then(r=>r.json());
    raw=(data.matchs||[]).find(x=>String(x.id)===String(matchId));
  }
  if(!raw)throw new Error('Match introuvable.');
  const vm=IasharkMatchViewModel.buildMatchViewModel(raw);
  const analytics=vm.players.analytics;
  const homePlayer=analytics.home.players.find(p=>p.id===playerId);
  const awayPlayer=analytics.away.players.find(p=>p.id===playerId);
  const player=homePlayer||awayPlayer;
  if(!player)throw new Error('Statistiques indisponibles pour ce joueur sur ce match.');
  const side=homePlayer?'home':'away';
  const rawRows=((raw.player_history&&raw.player_history[side])||[]).filter(r=>Number(r.player_id)===playerId).slice(0,10);
  return {vm,player,rawRows,matchId};
}

function render({vm,player,rawRows,matchId}){
  document.title=`${player.name} — Fiche joueur | IASHARK`;
  root.innerHTML=`<div class="page">
    ${playerHeader(vm,player,matchId)}
    ${card('Statistiques',statsGrid(player))}
    ${ratingTrend(player)?card('Évolution de la note',ratingTrend(player)):''}
    ${card('Historique match par match',matchHistory(rawRows))}
  </div>`;
}

load().then(render).catch(e=>{
  root.innerHTML=`<div class="match-error"><b>${esc(e.message||'Erreur de chargement')}</b><a href="/">Retour à l'accueil</a></div>`;
});
})();
