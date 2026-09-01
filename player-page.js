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

function scoreRing(score,label){
  if(n(score)===null)return '';
  const r=22,c=2*Math.PI*r,offset=c*(1-clamp(score)/100);
  return `<div class="score-ring"><svg viewBox="0 0 52 52"><circle class="track" cx="26" cy="26" r="${r}"></circle><circle class="fill" cx="26" cy="26" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"></circle></svg><div class="val">${Math.round(score)}<small>/100</small></div></div>${label?`<span class="score-ring-label">${esc(label)}</span>`:''}`;
}

// ts (top-scorer entry, raw.top_scorers) n'existe QUE pour les 2 candidats
// buteurs deja selectionnes pour ce match (cf lib/markets/top-scorer-picker.js)
// - un autre joueur ("Joueurs cles" mais pas retenu comme candidat buteur)
// n'aura ni bio, ni stats saison, ni texte "pourquoi ce joueur" : la page
// se degrade honnetement plutot que d'inventer ces sections.
function playerHeader(vm,player,matchId,ts){
  const team=vm.identity[player.teamId===vm.identity.home.id?'home':'away'];
  const bio=ts&&ts.bio;
  const bioItems=[];
  if(bio){
    if(n(bio.age)!==null)bioItems.push(['Âge',bio.age+' ans']);
    if(bio.birthDate)bioItems.push(['Né le',bio.birthDate]);
    if(bio.nationality)bioItems.push(['Nationalité',bio.nationality]);
    if(n(bio.heightCm)!==null)bioItems.push(['Taille',(bio.heightCm/100).toFixed(2)+' m']);
    if(n(bio.weightKg)!==null)bioItems.push(['Poids',bio.weightKg+' kg']);
  }
  const ringScore=ts?ts.goal_threat_score:player.impact;
  const ringLabel=ts?'Score menace de but':'Impact';
  return `<section class="card player-hero">
    <a class="back-to-match" href="/match.html?id=${esc(matchId)}">← Retour au match : ${esc(vm.identity.home.name)} vs ${esc(vm.identity.away.name)}</a>
    <div class="player-hero-main">
      ${player.photo?`<img class="player-hero-photo" src="${esc(player.photo)}" alt="${esc(player.name)}">`:'<div class="player-hero-photo placeholder">♟</div>'}
      <div class="player-hero-info">
        <h1>${player.number!==null?`<span class="hero-number">${esc(String(player.number))}</span>`:''}${esc(player.name)}</h1>
        <div class="player-hero-meta">${img(team.logo,team.name)}<span>${esc(player.team)}</span>${player.position?`<span>· ${esc(player.position)}</span>`:''}</div>
        ${player.absent?'<span class="badge b-red">Absence signalée</span>':''}
        ${bioItems.length?`<div class="player-bio-row">${bioItems.map(([l,v])=>`<div><small>${esc(l)}</small><b>${esc(v)}</b></div>`).join('')}</div>`:''}
      </div>
      <div class="hero-ring-wrap">${scoreRing(ringScore,ringLabel)}</div>
    </div>
  </section>`;
}

// Badge contextuel : uniquement si ce joueur est un candidat buteur pour CE
// match (ts.opponent_defense_multiplier = meme multiplicateur reel utilise
// pour le calcul, pas une nouvelle estimation).
function contextBadge(ts){
  if(!ts||n(ts.opponent_defense_multiplier)===null)return '';
  const m=ts.opponent_defense_multiplier;
  const txt=m>1.05?'Défense adverse plus perméable que la moyenne':m<0.95?'Défense adverse solide':'Défense adverse dans la moyenne';
  const cls=m>1.05?'b-green':m<0.95?'b-orange':'b-cyan';
  return `<div class="context-badge"><span class="badge ${cls}">${esc(txt)}</span><small>Multiplicateur adversaire : ${fmt(m,2)} (1.0 = neutre)</small></div>`;
}

function whyThisPlayer(ts){
  if(!ts||!ts.analyse)return '';
  return card('Pourquoi ce joueur ?',`<p class="reading">${esc(ts.analyse)}</p>`,'why-player-card');
}

// Stats principales : si le joueur est candidat buteur pour ce match (ts),
// on montre les vrais chiffres qui ont servi au calcul (tirs/90, tirs
// cadres/90, buts saison, taux de conversion lisse). Sinon repli honnete
// sur les stats deja disponibles par ailleurs (note, buts/90, etc.).
function statsGrid(player,ts){
  if(ts){
    const items=[
      ['Tirs /90',fmt(player.shots90)],
      ['Tirs cadrés /90',fmt(player.shotsOn90)],
      ['Buts (saison)',ts.season?fmt(ts.season.goals,0):fmt(ts.goals,0)],
      ['Taux conversion',pct(Math.round(ts.conversion_rate*1000)/10)]
    ];
    return `<div class="player-stats-grid">${items.map(([l,v])=>`<div class="player-stat-card"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>${contextBadge(ts)}`;
  }
  const items=[
    ['Note moy. (5 derniers)',n(player.rating5)!==null?fmt(player.rating5):null],
    ['Buts /90',n(player.goals90)!==null?fmt(player.goals90):null],
    ['Passes décisives /90',n(player.assists90)!==null?fmt(player.assists90):null],
    ['Passes clés /90',n(player.keyPasses90)!==null?fmt(player.keyPasses90):null],
    ['Tirs /90',n(player.shots90)!==null?fmt(player.shots90):null],
    ['Tirs cadrés /90',n(player.shotsOn90)!==null?fmt(player.shotsOn90):null]
  ].filter(([,v])=>v!==null);
  if(!items.length)return empty('Statistiques indisponibles pour ce joueur.');
  return `<div class="player-stats-grid">${items.map(([l,v])=>`<div class="player-stat-card"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>`;
}

// Moyennes/90 : toujours calculables des que le joueur a un historique
// recent, independant du statut "candidat buteur".
function per90Grid(player){
  const items=[
    ['Buts',n(player.goals90)!==null?fmt(player.goals90):null],
    ['Tirs',n(player.shots90)!==null?fmt(player.shots90):null],
    ['Tirs cadrés',n(player.shotsOn90)!==null?fmt(player.shotsOn90):null],
    ['Passes clés',n(player.keyPasses90)!==null?fmt(player.keyPasses90):null],
    ['Passes décisives',n(player.assists90)!==null?fmt(player.assists90):null]
  ].filter(([,v])=>v!==null);
  if(!items.length)return '';
  return card('Moyennes par 90 minutes',`<div class="player-stats-grid">${items.map(([l,v])=>`<div class="player-stat-card"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>`);
}

function startProbCard(player){
  if(n(player.startProbability)===null)return '';
  const p=clamp(player.startProbability);
  return card('Probabilité de titularisation',`<div class="start-prob"><b>${pct(player.startProbability)}</b><div class="progress-bar"><i style="width:${p}%"></i></div><small>Probabilité d'être titulaire lors du prochain match</small></div>`);
}

function availability(ts){
  if(!ts||!ts.bio||ts.bio.injured===null||ts.bio.injured===undefined)return '';
  const injured=ts.bio.injured===true;
  return card('Disponibilité',`<div class="availability ${injured?'bad':'good'}"><span class="dot"></span><div><b>${injured?'Blessure signalée':'Aucun problème signalé'}</b><small>${injured?'À confirmer avant le prochain match':'Prêt pour le prochain match'}</small></div></div>`);
}

// Stats saison completes : uniquement pour les candidats buteurs (seul cas
// ou le pipeline recupere /players season complet - cout API borne, pas
// fait pour tout l'effectif).
function seasonStatsGrid(ts){
  if(!ts||!ts.season)return '';
  const s=ts.season;
  const items=[
    ['Apparitions',s.appearances],['Titularisations',s.lineups],['Minutes',s.minutes],
    ['Buts',s.goals],['Passes déc.',s.assists],
    ['Cartons jaunes',s.cardsYellow],['Cartons rouges',s.cardsRed],
    ['Pénaltys tirés',s.penaltyWon],['Pénaltys marqués',s.penaltyScored],['Pénaltys manqués',s.penaltyMissed],
    ['Tirs total',s.shotsTotal],['Tirs cadrés',s.shotsOn],['Passes clés',s.passesKey],
    ['Passes réussies',n(s.passesAccuracy)!==null?pct(s.passesAccuracy):null],
    ['Dribbles réussis',(n(s.dribblesAttempts)&&s.dribblesAttempts>0)?pct(Math.round(s.dribblesSuccess/s.dribblesAttempts*1000)/10):null]
  ].filter(([,v])=>v!==null&&v!==undefined);
  if(!items.length)return '';
  return card('Stats saison',`<div class="player-stats-grid">${items.map(([l,v])=>`<div class="player-stat-card"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>`);
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

// Historique match par match : ne garde que les matchs reellement tagues
// "saison en cours" par le pipeline (is_current_season, base sur la vraie
// saison/competition de chaque match, jamais devine). Si le champ est
// absent (ancien format de donnees), repli honnete sur les lignes
// disponibles plutot que de tout masquer. Si la saison vient de
// reprendre, la liste est simplement plus courte que 10 - jamais
// completee avec des matchs d'une autre saison.
function matchHistory(allRows){
  const hasSeasonInfo=allRows.some(r=>r.is_current_season!==undefined);
  const rows=hasSeasonInfo?allRows.filter(r=>r.is_current_season!==false):allRows;
  if(!rows.length)return empty('Aucun match de la saison en cours suivi pour ce joueur.');
  const seasonNote=hasSeasonInfo?`<p class="history-note">${rows.length} match${rows.length>1?'s':''} de la saison en cours suivi${rows.length>1?'s':''} pour ce joueur — le plus récent en haut. Si la saison vient de reprendre, la liste est volontairement courte plutôt que complétée avec la saison précédente.</p>`:`<p class="history-note">Le plus récent en haut.</p>`;
  return `<div class="table-scroll"><table class="history-table"><thead><tr><th>Date</th><th>Compétition</th><th>Match</th><th>Min</th><th>Note</th><th>Statut</th><th>Buts</th><th>Passes D.</th><th>Tirs (cadrés)</th><th>Passes clés</th><th>Cartons</th></tr></thead><tbody>${rows.map(r=>{
    const cards=[n(r.yellow)>0?`${r.yellow}🟨`:'',n(r.red)>0?`${r.red}🟥`:''].filter(Boolean).join(' ')||'—';
    const scored=n(r.goals)>0;
    const matchLbl=r.opponent?`${r.is_home?'vs':'@'} ${esc(r.opponent)}${n(r.team_goals)!==null&&n(r.opponent_goals)!==null?` (${fmt(r.team_goals,0)}-${fmt(r.opponent_goals,0)})`:''}`:'—';
    return `<tr class="${scored?'scored':''}"><td>${r.date?esc(r.date):'—'}</td><td>${r.league_name?esc(r.league_name):'—'}</td><td>${matchLbl}</td><td>${n(r.minutes)!==null?fmt(r.minutes,0):'—'}</td><td>${n(r.rating)!==null?fmt(r.rating):'—'}</td><td>${r.starter?'Titulaire':'Remplaçant'}</td><td>${scored?'⚽ ':''}${n(r.goals)!==null?fmt(r.goals,0):'—'}</td><td>${n(r.assists)!==null?fmt(r.assists,0):'—'}</td><td>${n(r.shots_total)!==null?fmt(r.shots_total,0):'—'}${n(r.shots_on)!==null?` (${fmt(r.shots_on,0)})`:''}</td><td>${n(r.key_passes)!==null?fmt(r.key_passes,0):'—'}</td><td>${cards}</td></tr>`;
  }).join('')}</tbody></table></div>${seasonNote}`;
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
  const topScorerEntry=Array.isArray(raw.top_scorers)?raw.top_scorers.find(p=>Number(p.player_id)===playerId)||null:null;
  return {vm,player,rawRows,matchId,ts:topScorerEntry};
}

function render({vm,player,rawRows,matchId,ts}){
  document.title=`${player.name} — Fiche joueur | IASHARK`;
  root.innerHTML=`<div class="page">
    ${playerHeader(vm,player,matchId,ts)}
    ${card(ts?'Statistiques clés':'Statistiques',statsGrid(player,ts))}
    ${whyThisPlayer(ts)}
    ${ratingTrend(player)?card('Évolution de la note',ratingTrend(player)):''}
    ${card('Historique match par match',matchHistory(rawRows))}
    ${seasonStatsGrid(ts)}
    ${per90Grid(player)}
    <div class="row2">${startProbCard(player)}${availability(ts)}</div>
  </div>`;
}

load().then(render).catch(e=>{
  root.innerHTML=`<div class="match-error"><b>${esc(e.message||'Erreur de chargement')}</b><a href="/">Retour à l'accueil</a></div>`;
});
})();
