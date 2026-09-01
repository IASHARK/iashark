(function(){'use strict';
const root=document.getElementById('playerRoot');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=v=>Number.isFinite(Number(v))?Number(v):null;
const fmt=(v,d=1)=>n(v)===null?'—':Number(v).toLocaleString('fr-FR',{maximumFractionDigits:d});
const pct=v=>n(v)===null?'—':fmt(v)+'%';
const clamp=v=>Math.max(0,Math.min(100,n(v)||0));
const img=(src,alt)=>src?`<img src="${esc(src)}" alt="${esc(alt)}" loading="lazy">`:'';
const empty=t=>`<div class="empty">${esc(t)}</div>`;

// Icones de titre : purement decoratives, aucune emoticone (SVG uniquement).
const ICONS={
  profile:'<circle cx="12" cy="8" r="3.6"/><path d="M4 20c0-3.5 3.2-6 8-6s8 2.5 8 6"/>',
  chart:'<path d="M4 19V5M4 19h16M8 15l3-4 3 2 4-6"/>',
  history:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  trophy:'<path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5"/><path d="M12 13v4M9 20h6M9.5 17h5"/>'
};
const cardIcon=key=>ICONS[key]?`<svg viewBox="0 0 24 24" class="card-icon">${ICONS[key]}</svg>`:'';
const card=(title,body,cls='',icon='')=>`<section class="card reveal ${cls}"><h2>${cardIcon(icon)}${esc(title)}</h2>${body}</section>`;
const sectionTitle=(icon,label)=>`<div class="section-title reveal">${cardIcon(icon)}<h2>${esc(label)}</h2></div>`;

function scoreRing(score,label){
  if(n(score)===null)return '';
  const r=34,c=2*Math.PI*r,offset=c*(1-clamp(score)/100);
  return `<div class="score-ring"><svg viewBox="0 0 80 80"><circle class="track" cx="40" cy="40" r="${r}"></circle><circle class="fill" cx="40" cy="40" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-target="${offset.toFixed(1)}"></circle></svg><div class="val">${Math.round(score)}<small>/100</small></div></div>${label?`<span class="score-ring-label">${esc(label)}</span>`:''}`;
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
      ${player.photo?`<img class="player-hero-photo" src="${esc(player.photo)}" alt="${esc(player.name)}">`:'<div class="player-hero-photo placeholder">?</div>'}
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
  return card('Stats saison',`<div class="player-stats-grid">${items.map(([l,v])=>`<div class="player-stat-card"><b>${esc(v)}</b><small>${esc(l)}</small></div>`).join('')}</div>`,'','trophy');
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

// Historique match par match : liste de cartes (pas un tableau) - plus
// lisible sur mobile, aucun scroll horizontal necessaire. Ne garde que les
// matchs reellement tagues "saison en cours" par le pipeline
// (is_current_season, base sur la vraie saison/competition de chaque
// match, jamais devine). Repli honnete si le champ est absent (ancien
// format). Aucune emoticone : le but est signale par la couleur ET le
// texte ("But" en vert), jamais la couleur seule.
function matchHistory(allRows){
  const hasSeasonInfo=allRows.some(r=>r.is_current_season!==undefined);
  const rows=hasSeasonInfo?allRows.filter(r=>r.is_current_season!==false):allRows;
  if(!rows.length)return empty('Aucun match de la saison en cours suivi pour ce joueur.');
  const seasonNote=hasSeasonInfo?`<p class="history-note">${rows.length} match${rows.length>1?'s':''} de la saison en cours suivi${rows.length>1?'s':''} pour ce joueur — le plus récent en haut. Si la saison vient de reprendre, la liste est volontairement courte plutôt que complétée avec la saison précédente.</p>`:`<p class="history-note">Le plus récent en haut.</p>`;
  const list=rows.map(r=>{
    const scored=n(r.goals)>0;
    const matchLbl=r.opponent?`${r.is_home?'vs':'@'} ${esc(r.opponent)}${n(r.team_goals)!==null&&n(r.opponent_goals)!==null?` (${fmt(r.team_goals,0)}-${fmt(r.opponent_goals,0)})`:''}`:'Match';
    const chips=[];
    if(n(r.minutes)!==null)chips.push(['Min',fmt(r.minutes,0)]);
    if(n(r.rating)!==null)chips.push(['Note',fmt(r.rating)]);
    chips.push(['Buts',n(r.goals)!==null?fmt(r.goals,0):'—',scored]);
    if(n(r.assists)!==null)chips.push(['Passes D.',fmt(r.assists,0)]);
    if(n(r.shots_total)!==null)chips.push(['Tirs',fmt(r.shots_total,0)+(n(r.shots_on)!==null?` (${fmt(r.shots_on,0)} cadrés)`:'')]);
    if(n(r.key_passes)!==null)chips.push(['Passes clés',fmt(r.key_passes,0)]);
    const cardChips=[];
    if(n(r.yellow)>0)cardChips.push(`<span class="card-chip yellow">${r.yellow} jaune${r.yellow>1?'s':''}</span>`);
    if(n(r.red)>0)cardChips.push(`<span class="card-chip red">${r.red} rouge${r.red>1?'s':''}</span>`);
    return `<div class="hist-row ${scored?'scored':''}">
      <div class="hist-top"><span class="hist-date">${r.date?esc(r.date):'—'}${r.league_name?` · ${esc(r.league_name)}`:''}</span><span class="hist-status">${r.starter?'Titulaire':'Remplaçant'}</span></div>
      <div class="hist-match">${matchLbl}</div>
      <div class="hist-stats">${chips.map(([l,v,hl])=>`<span${hl?' class="pos"':''}>${esc(l)} <b>${esc(v)}</b></span>`).join('')}${cardChips.join('')}</div>
    </div>`;
  }).join('');
  return `<div class="hist-list">${list}</div>${seasonNote}`;
}

// Navigation d'ancres : uniquement les sections presentes pour CE joueur.
function buildSections(vm,player,ts){
  const profilBody=`${card(ts?'Statistiques clés':'Statistiques',statsGrid(player,ts))}${whyThisPlayer(ts)}`;
  const formeBody=`${ratingTrend(player)?card('Évolution de la note',ratingTrend(player)):''}<div class="row2">${startProbCard(player)}${availability(ts)}</div>`;
  const historiqueBody=card('Historique match par match',matchHistory(player.__rows||[]),'','history');
  const saisonBody=`${seasonStatsGrid(ts)}${per90Grid(player)}`;
  const sections=[
    {id:'profil',label:'Profil',icon:'profile',body:profilBody,always:true},
    {id:'forme',label:'Forme',icon:'chart',body:formeBody,present:!!(ratingTrend(player)||n(player.startProbability)!==null||availability(ts))},
    {id:'historique',label:'Historique',icon:'history',body:historiqueBody,always:true},
    {id:'saison',label:'Saison',icon:'trophy',body:saisonBody,present:!!(seasonStatsGrid(ts)||per90Grid(player))}
  ].filter(s=>s.always||s.present);
  const nav=`<nav class="section-nav"><div class="section-nav-inner">${sections.map(s=>`<a href="#sec-${s.id}" data-target="sec-${s.id}">${cardIcon(s.icon)}${esc(s.label)}</a>`).join('')}</div></nav>`;
  const body=sections.map(s=>`<section id="sec-${s.id}" class="page-section">${sectionTitle(s.icon,s.label)}${s.body}</section>`).join('');
  return nav+body;
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
  player.__rows=rawRows;
  const topScorerEntry=Array.isArray(raw.top_scorers)?raw.top_scorers.find(p=>Number(p.player_id)===playerId)||null:null;
  return {vm,player,matchId,ts:topScorerEntry};
}

function render({vm,player,matchId,ts}){
  document.title=`${player.name} — Fiche joueur | IASHARK`;
  root.innerHTML=`<div class="page">
    ${playerHeader(vm,player,matchId,ts)}
    ${buildSections(vm,player,ts)}
  </div>`;
  bindMotion();
}

// Meme systeme que match-page.js : reveal au scroll avec filet de securite
// (jamais de contenu bloque a opacite 0), scroll-spy pour la nav d'ancres,
// remplissage anime du ring au chargement.
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
  const nav=root.querySelector('.section-nav');
  if(!nav)return;
  const links=[...nav.querySelectorAll('a')];
  const sections=links.map(a=>document.getElementById(a.dataset.target)).filter(Boolean);
  if('IntersectionObserver' in window && sections.length){
    const spy=new IntersectionObserver(entries=>{
      entries.forEach(en=>{
        if(en.isIntersecting)links.forEach(a=>a.classList.toggle('active',a.dataset.target===en.target.id));
      });
    },{rootMargin:'-40% 0px -55% 0px',threshold:0});
    sections.forEach(s=>spy.observe(s));
  }
}

load().then(render).catch(e=>{
  root.innerHTML=`<div class="match-error"><b>${esc(e.message||'Erreur de chargement')}</b><a href="/">Retour à l'accueil</a></div>`;
});
})();
