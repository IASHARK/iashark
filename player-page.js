(function(){'use strict';
const root=document.getElementById('playerRoot');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,d=1)=>n(v)===null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d});
const pct=v=>n(v)===null?'—':fmt(v)+'%';
const clamp=v=>Math.max(0,Math.min(100,n(v)||0));
const img=(src,alt)=>src?`<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">`:'';
const empty=t=>`<div class="empty">${esc(t)}</div>`;

const ICONS={
  target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r=".6" fill="currentColor"/>',
  history:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  trophy:'<path d="M8 3h8v4a4 4 0 0 1-8 0V3Z"/><path d="M8 4H5a3 3 0 0 0 3 5M16 4h3a3 3 0 0 1-3 5"/><path d="M12 11v3M9.5 18h5M10 15h4l.5 3h-5l.5-3Z"/>',
  chart:'<path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6"/>'
};
const cardIcon=key=>ICONS[key]?`<svg viewBox="0 0 24 24" class="card-icon">${ICONS[key]}</svg>`:'';
const card=(title,body,cls='',icon='')=>`<section class="card reveal ${cls}"><h2>${cardIcon(icon)}${esc(title)}</h2>${body}</section>`;

function scoreRing(score,label){
  if(n(score)===null)return '';
  const r=46,c=2*Math.PI*r,offset=c*(1-clamp(score)/100);
  return `<div class="score-ring"><svg viewBox="0 0 104 104"><circle class="track" cx="52" cy="52" r="${r}"></circle><circle class="fill" cx="52" cy="52" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-target="${offset.toFixed(1)}"></circle></svg><div class="val">${Math.round(score)}<small>/100</small></div></div>${label?`<span class="score-ring-label">${esc(label)}</span>`:''}`;
}

// ts (top-scorer entry, raw.top_scorers) n'existe QUE pour les 2 candidats
// buteurs deja selectionnes pour ce match (cf lib/markets/top-scorer-picker.js)
// - un autre joueur n'aura ni bio, ni stats saison, ni "pourquoi ce joueur" :
// degradation honnete plutot que d'inventer ces sections. Aucun "pied
// prefere" (l'API n'expose pas ce champ - verifie en direct) ni valeur
// marchande/percentile "TOP X%" (aucun pool de comparaison reel).
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
    if(bio.injured!==null&&bio.injured!==undefined)bioItems.push(['Blessé',bio.injured?'Oui':'Non']);
  }
  const ringScore=ts?ts.goal_threat_score:player.impact;
  const ringLabel=ts?'Score menace de but':'Impact';
  return `<section class="card player-hero reveal">
    <a class="back-to-match" href="/match.html?id=${esc(matchId)}">← Retour au match : ${esc(vm.identity.home.name)} vs ${esc(vm.identity.away.name)}</a>
    <div class="player-hero-main">
      ${player.photo?`<img class="player-hero-photo" src="${esc(player.photo)}" alt="${esc(player.name)}">`:'<div class="player-hero-photo placeholder">?</div>'}
      <div class="player-hero-info">
        <h1>${player.number!==null?`<span class="hero-number">${esc(String(player.number))}</span>`:''}${esc(player.name)}</h1>
        <div class="player-hero-meta">${img(team.logo,team.name)}<span>${esc(player.team)}</span></div>
        ${player.position?`<div class="player-hero-position">${esc(player.position)}</div>`:''}
        ${player.absent?'<span class="badge b-red">Absence signalée</span>':''}
      </div>
      <div class="hero-ring-wrap">${scoreRing(ringScore,ringLabel)}</div>
    </div>
    ${bioItems.length?`<div class="player-bio-row">${bioItems.map(([l,v])=>`<div><small>${esc(l)}</small><b${l==='Blessé'?` class="${bio.injured?'neg':'pos'}"`:''}>${esc(v)}</b></div>`).join('')}</div>`:''}
  </section>`;
}

function contextBadge(ts){
  if(!ts||n(ts.opponent_defense_multiplier)===null)return '';
  const m=ts.opponent_defense_multiplier;
  const txt=m>1.05?'Défense adverse concède beaucoup':m<0.95?'Défense adverse solide':'Défense adverse dans la moyenne';
  const cls=m>1.05?'b-green':m<0.95?'b-orange':'b-cyan';
  return `<div class="context-card"><small>Contexte du match</small><span class="badge ${cls}">${esc(txt)}</span><small class="context-detail">Multiplicateur adversaire : ${fmt(m,2)} (1.0 = neutre)</small></div>`;
}

// Rangee de stats principales + contexte, dans une seule carte (comme la
// maquette) - si le joueur est candidat buteur pour ce match (ts), les
// vrais chiffres qui ont servi au calcul ; sinon repli honnete sur les
// stats deja disponibles par ailleurs.
function statsRow(player,ts){
  if(ts){
    const items=[
      ['Tirs /90',fmt(player.shots90)],
      ['Tirs cadrés /90',fmt(player.shotsOn90)],
      ['Buts (saison)',ts.season?fmt(ts.season.goals,0):fmt(ts.goals,0)],
      ['Taux conversion',pct(Math.round(ts.conversion_rate*1000)/10)]
    ];
    const ctx=contextBadge(ts);
    return card('',`<div class="stats-row">${items.map(([l,v])=>`<div class="player-stat-card"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}${ctx}</div>`);
  }
  const items=[
    ['Note moy. (5 derniers)',n(player.rating5)!==null?fmt(player.rating5):null],
    ['Buts /90',n(player.goals90)!==null?fmt(player.goals90):null],
    ['Passes décisives /90',n(player.assists90)!==null?fmt(player.assists90):null],
    ['Tirs /90',n(player.shots90)!==null?fmt(player.shots90):null],
    ['Tirs cadrés /90',n(player.shotsOn90)!==null?fmt(player.shotsOn90):null]
  ].filter(([,v])=>v!==null);
  if(!items.length)return '';
  return card('',`<div class="stats-row">${items.map(([l,v])=>`<div class="player-stat-card"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>`);
}

function whyThisPlayer(ts){
  if(!ts||!ts.analyse)return '';
  return card('Pourquoi ce joueur ?',`<p class="reading">${esc(ts.analyse)}</p>`,'why-player-card','target');
}

// Forme recente : tableau compact (5 derniers matchs) - correspond au style
// de la maquette de reference. Meme filtre "saison en cours" que la version
// precedente (is_current_season, jamais devine).
function recentFormTable(allRows){
  const hasSeasonInfo=allRows.some(r=>r.is_current_season!==undefined);
  const rows=(hasSeasonInfo?allRows.filter(r=>r.is_current_season!==false):allRows).slice(0,5);
  if(!rows.length)return empty('Aucun match de la saison en cours suivi pour ce joueur.');
  const body=rows.map(r=>{
    const scored=n(r.goals)>0;
    return `<tr class="${scored?'scored':''}"><td>${r.date?esc(r.date):'—'}</td><td>${r.opponent?`${r.is_home?'vs':'@'} ${esc(r.opponent)}`:'—'}</td><td>${r.starter?'T':'R'}</td><td>${n(r.minutes)!==null?fmt(r.minutes,0):'—'}</td><td>${n(r.rating)!==null?fmt(r.rating):'—'}</td><td class="pos">${n(r.goals)!==null?fmt(r.goals,0):'—'}</td><td>${n(r.assists)!==null?fmt(r.assists,0):'—'}</td><td>${n(r.shots_total)!==null?fmt(r.shots_total,0):'—'}</td><td>${n(r.shots_on)!==null?fmt(r.shots_on,0):'—'}</td><td>${n(r.key_passes)!==null?fmt(r.key_passes,0):'—'}</td></tr>`;
  }).join('');
  return `<div class="table-scroll"><table class="history-table"><thead><tr><th>Date</th><th>Adversaire</th><th>Statut</th><th>Min</th><th>Note</th><th>B</th><th>PD</th><th>Tirs</th><th>TC</th><th>P. clés</th></tr></thead><tbody>${body}</tbody></table></div>`;
}

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
  return `<div class="player-stats-grid">${items.map(([l,v])=>`<div class="player-stat-card"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>`;
}

function per90Grid(player){
  const items=[
    ['Buts',n(player.goals90)!==null?fmt(player.goals90):null],
    ['Tirs',n(player.shots90)!==null?fmt(player.shots90):null],
    ['Tirs cadrés',n(player.shotsOn90)!==null?fmt(player.shotsOn90):null],
    ['Passes clés',n(player.keyPasses90)!==null?fmt(player.keyPasses90):null],
    ['Dribbles',n(player.dribbles90)!==null?fmt(player.dribbles90):null]
  ].filter(([,v])=>v!==null);
  if(!items.length)return '';
  return card('Moyennes par 90',`<div class="player-stats-grid player-stats-grid-5">${items.map(([l,v])=>`<div class="player-stat-card"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>`);
}

function availability(ts){
  if(!ts||!ts.bio||ts.bio.injured===null||ts.bio.injured===undefined)return '';
  const injured=ts.bio.injured===true;
  return card('Disponibilité',`<div class="availability ${injured?'bad':'good'}"><span class="dot"></span><div><b>${injured?'Blessure signalée':'Aucun problème signalé'}</b><small>${injured?'À confirmer avant le prochain match':'Prêt pour le prochain match'}</small></div></div>`);
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
    ${statsRow(player,ts)}
    ${whyThisPlayer(ts)}
    <div class="row2">
      ${card('Forme récente (5 derniers matchs)',recentFormTable(rawRows),'','history')}
      ${card('Stats saison',seasonStatsGrid(ts)||empty('Stats saison indisponibles pour ce joueur.'),'','trophy')}
    </div>
    <div class="row3">
      ${per90Grid(player)}
      ${availability(ts)}
    </div>
  </div>`;
  bindMotion();
}

function bindMotion(){
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    root.querySelectorAll('.score-ring .fill').forEach(c=>{c.style.strokeDashoffset=c.dataset.target;});
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

load().then(render).catch(e=>{
  root.innerHTML=`<div class="match-error"><b>${esc(e.message||'Erreur de chargement')}</b><a href="/">Retour à l'accueil</a></div>`;
});
})();
