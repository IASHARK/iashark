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
  cloud:'<path d="M7 18a4 4 0 0 1-.5-7.97A5 5 0 0 1 16 8.5 4.5 4.5 0 0 1 15.5 18H7Z"/>',
  bulb:'<path d="M9 18h6M10 21h4M7 9a5 5 0 1 1 10 0c0 2-1 3-2 4.2-.5.6-.8 1.1-.8 1.8H9.8c0-.7-.3-1.2-.8-1.8C8 12 7 11 7 9Z"/>',
  scale:'<path d="M12 3v18M7 7 4 13a3 3 0 0 0 6 0L7 7ZM17 7l-3 6a3 3 0 0 0 6 0l-3-6ZM4 7h6M14 7h6"/>',
  alert:'<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.01"/>',
  trend:'<path d="M4 17 10 11l4 4 6-8"/><path d="M16 6h4v4"/>'
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

// Buteur a surveiller ("Menaces de but") : vm.players.scoringThreat, classe
// par vrai signal de menace (buts/90 + tirs cadres/90, min 3 apparitions,
// jamais un joueur absent - cf lib/match-view-model.js). scoringProbability
// = vraie probabilite de Poisson (1-e^-lambda) depuis buts/90 reel, jamais
// une "probabilite de marquer" inventee. "Cote equitable" = notre propre
// calcul (100/proba), jamais une cote de marche qu'on n'a pas reellement
// pour un joueur precis.
function threatsCard(vm){
  const list=vm.players.scoringThreat;
  if(!list.length)return '';
  return card('Buteur à surveiller',`<div class="threats">${list.slice(0,1).map(p=>{
    const pid=n(p.id);
    const href=pid!==null?` href="/joueur.html?m=${esc(vm.id)}&p=${pid}"`:'';
    const tag=pid!==null?'a':'div';
    const sp=n(p.scoringProbability);
    const fairOdds=sp&&sp>0?100/sp:null;
    return `<${tag} class="threat"${href}>
      <div class="threat-top">${img(p.photo,p.name)}<div><b>${esc(p.name)}</b><small>${esc(p.team||'')}${p.position?' · '+esc(p.position):''}</small></div></div>
      <div class="threat-figures">
        ${sp!==null?`<div><b class="pos">${pct(sp)}</b><small>Probabilité de marquer</small></div>`:''}
        ${fairOdds!==null?`<div><b>${fmt(fairOdds,2)}</b><small>Cote équitable</small></div>`:''}
      </div>
      <div class="threat-stats"><span>Buts/90 <b>${fmt(p.goals90)}</b></span><span>Tirs cadrés/90 <b>${fmt(p.shotsOn90)}</b></span>${n(p.startProbability)!==null?`<span>Titulaire <b>${pct(p.startProbability)}</b></span>`:''}</div>
    </${tag}>`;
  }).join('')}</div>`,'threats-card','target2');
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
  const rows=m.categories.map(c=>`<div class="matchup-row"><span class="${c.advantage==='home'?'adv':''}">${c.advantage==='home'?homeName:c.advantage==='away'?'':''}</span><b>${esc(c.label)}</b><span class="${c.advantage==='away'?'adv':''}">${c.advantage==='away'?awayName:c.advantage==='home'?'':c.advantage==='égalité'?'Équilibré':''}</span></div>`).join('');
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
function formReelleCard(vm){
  const s=vm.identity.standings||{};
  const side=(team,st,trend)=>{
    if(!st||!st.form)return '';
    const arrow=trend&&trend.trend==='up'?'↑':trend&&trend.trend==='down'?'↓':'';
    return `<div class="form-side"><b>${esc(team.name)}</b>${arrow?`<span class="trend-${trend.trend}">${arrow}</span>`:''}${formStrip(st.form)}</div>`;
  };
  const body=side(vm.identity.home,s.home,vm.formTrend.home)+side(vm.identity.away,s.away,vm.formTrend.away);
  if(!body)return '';
  return card('Forme réelle (5 derniers matchs)',`<div class="form-reelle">${body}</div>`,'','trend');
}

// 3 marches a surveiller : vm.marketsWatch, deja trie par ecart absolu reel
// (cf lib/insights.js#topMarketsToWatch) - simple affichage.
function marketsWatchCard(vm){
  const list=vm.marketsWatch;
  if(!list.length)return '';
  const rows=list.map(m=>`<tr><td>${esc(m.market)}</td><td>${esc(m.interest)}</td><td>${m.confidence!==null?m.confidence+'/10':'—'}</td></tr>`).join('');
  return card('Marchés à surveiller',`<div class="table-scroll"><table class="mvm-table"><thead><tr><th>Marché</th><th>Intérêt</th><th>Confiance</th></tr></thead><tbody>${rows}</tbody></table></div>`,'','target');
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
function absences(vm){
  const a=vm.players.absences;
  if(!a.home.length&&!a.away.length&&!vm.players.injuriesFetchOk)return '';
  const side=(team,items)=>`<div><h3>${img(team.logo,team.name)}${esc(team.name)}</h3>${items.length?items.slice(0,4).map(x=>`<div class="abs-row"><div class="abs-row-head"><b>${esc(x.name)}</b><span>${esc(x.status||'Incertain')}</span></div>${n(x.outputShare)!==null?`<small class="abs-impact">Estimation : ${pct(x.outputShare)} de la production offensive récente de l'équipe</small>`:''}</div>`).join(''):'<p class="abs-none">Aucune absence signalée</p>'}</div>`;
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
  const mainCol=[
    keyInsightsCard(vm),
    card('Pourquoi le pari ressort ?',comparison(vm),'','compare'),
    threatsCard(vm),
    matchupCard(vm),
    formNoteCard(vm),
    card('Scénario probable du match',scenarioCard(vm),'','chart')
  ].filter(Boolean);
  const asideCol=[
    marketsVsMarketCard(vm),
    valuePotentialCard(vm),
    absences(vm),
    formReelleCard(vm),
    marketsWatchCard(vm),
    h2hCard(vm),
    refereeCard(vm)
  ].filter(Boolean);
  root.innerHTML=`<div class="page">
    ${hero(vm)}
    ${tagsRow(vm)}
    ${recommendation(vm)}
    ${reasonsCard(vm)}
    ${outputsCard(vm)}
    ${card('Lecture du match',reading(vm))}
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
