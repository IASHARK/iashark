(function(){'use strict';
const root=document.getElementById('matchRoot');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>Number.isFinite(Number(v))?Number(v).toLocaleString('fr-FR',{maximumFractionDigits:1}):'—';
const empty=t=>`<div class="empty">${esc(t)}</div>`;
const logo=(url,name)=>url?`<img src="${esc(url)}" alt="${esc(name)}">`:'';
const panel=(title,body,cls='')=>`<section class="panel ${cls}"><h2 class="panel-title">${esc(title)}</h2>${body}</section>`;
const list=(items,cls='detail-list')=>`<ul class="${cls}">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;

// Bandeaux confiance/risque/value : traduisent des champs REELS deja
// calcules par le pipeline (reliability.label, editorial.risk, model.value)
// en pastille visuelle - aucune nouvelle logique de decision ici, juste un
// mappage texte -> classe CSS.
function confidenceBadge(label){
  if(!label)return '';
  const l=label.toLowerCase();
  const cls=l.includes('élev')||l.includes('elev')?'b-high':l.includes('moy')?'b-medium':l.includes('faib')?'b-low':'b-neutral';
  return `<span class="badge ${cls}">Confiance ${esc(label)}</span>`;
}
function riskBadge(riskCode){
  if(!riskCode)return '';
  const map={FAIBLE:['b-low-risk','Risque faible'],MODERE:['b-medium-risk','Risque modéré'],ELEVE:['b-high-risk','Risque élevé']};
  const [cls,label]=map[riskCode]||['b-neutral',riskCode];
  return `<span class="badge ${cls}">${esc(label)}</span>`;
}
function valueBadge(value){
  if(value===null||value===undefined)return '';
  const cls=value>0?'b-positive':value<0?'b-negative':'b-neutral';
  return `<span class="badge ${cls}">${value>0?'+':''}${fmt(value)} pts value</span>`;
}

// Score IASHARK : anneau SVG, rempli proportionnellement (jamais un simple
// texte decoratif). r=22, circonference = 2*pi*22.
function scoreRing(score){
  if(score===null)return '';
  const r=22,c=2*Math.PI*r,offset=c*(1-Math.max(0,Math.min(100,score))/100);
  return `<div class="score-ring" title="Score IASHARK : combine probabilité modèle, qualité des données, accord des modèles et taille d'échantillon"><svg viewBox="0 0 52 52"><circle class="track" cx="26" cy="26" r="${r}"></circle><circle class="fill" cx="26" cy="26" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"></circle></svg><div class="val">${Math.round(score)}</div></div>`;
}

function header(vm){const i=vm.identity;return `<header class="match-head"><div class="meta-row"><div class="league">${logo(i.league.logo,i.league.name)}<span>${esc(i.league.name)}</span></div><span>${esc(i.date||'Date à confirmer')} · ${esc(i.time||'—')}</span></div><div class="teams"><div class="team">${logo(i.home.logo,i.home.name)}<h1>${esc(i.home.name)}</h1><small>Domicile</small></div><div class="versus"><b>VS</b><i></i></div><div class="team">${logo(i.away.logo,i.away.name)}<h1>${esc(i.away.name)}</h1><small>Extérieur</small></div></div><div class="venue">${vm.conditions.venue?`⌾ ${esc(vm.conditions.venue)}`:'Lieu à confirmer'}${vm.model.available?' <span>● Analyse disponible</span>':''}</div><div class="tabs" role="tablist" aria-label="Analyse du match"><button class="tab active" role="tab" aria-selected="true" data-tab="summary">Résumé</button><button class="tab" role="tab" aria-selected="false" data-tab="advanced">Données avancées</button><button class="tab" role="tab" aria-selected="false" data-tab="players">Joueurs</button></div></header>`}

// Table "Marchés recommandés" : la ligne du haut (etoile) est le marche
// retenu par le moteur (pari_rec/recommendation), les lignes suivantes sont
// les autres marches reellement compares (raw.markets_compared). Cote
// equitable = 1/probabilite (calcul documente, pas une donnee bookmaker).
function recoTable(vm){
  const r=vm.model.recommendation;
  const compared=vm.model.marketsCompared||[];
  let rows=compared.length?compared:(r?[{market:r.market,probability:r.probability,consensus:null,edge:null}]:[]);
  if(!rows.length)return empty('Aucun marché comparable ne franchit encore les seuils du moteur.');
  return `<table class="reco-table"><thead><tr><th>Marché</th><th>Prob. IA</th><th>Cote équitable</th><th>Value</th></tr></thead><tbody>${rows.map((x,i)=>{const fair=x.probability>0?(100/x.probability):null;return `<tr class="${i===0?'top':''}"><td class="rk-mkt">${i===0?'<i>★</i>':'<i></i>'}${esc(x.market)}</td><td>${fmt(x.probability)}%</td><td>${fair?fmt(fair):'—'}</td><td class="rk-val">${x.edge===null||x.edge===undefined?'—':`${x.edge>0?'+':''}${fmt(x.edge)} pts`}</td></tr>`}).join('')}</tbody></table>`;
}
// Consensus bookmakers : barres a partir du champ consensus reel de
// raw.markets_compared (moyenne de cotes/probabilite implicite calculee par
// le pipeline, jamais generee ici).
function consensusSection(vm){
  const rows=(vm.model.marketsCompared||[]).filter(x=>x.consensus!==null&&x.consensus!==undefined);
  if(!rows.length)return empty('Consensus bookmakers indisponible pour ce match.');
  const max=Math.max(...rows.map(x=>x.consensus),1);
  return `${rows.map(x=>`<div class="consensus-row"><span>${esc(x.market)}</span><div class="cbar"><i style="width:${(x.consensus/max*100).toFixed(0)}%"></i></div><b>${fmt(x.consensus)}%</b><span>${x.consensus>0?fmt(100/x.consensus):'—'}</span></div>`).join('')}<p class="consensus-foot">(i) Probabilité implicite calculée à partir des cotes moyennes agrégées par le moteur IASHARK.</p>`;
}
function infoMarche(vm){
  const items=[];
  if(vm.model.sources.length)items.push(`${vm.model.sources.length} sources de données confirmées`);
  if(vm.model.simulationCount)items.push(`${Number(vm.model.simulationCount).toLocaleString('fr-FR')} simulations Monte-Carlo`);
  const r=vm.model.recommendation;
  if(r&&r.reliability)items.push(`Fiabilité modèle : ${r.reliability}`);
  if(!items.length)items.push('Détails du marché non disponibles pour ce match.');
  return `<ul class="info-list">${items.map(x=>`<li><i>●</i>${esc(x)}</li>`).join('')}</ul>`;
}
function signal(vm){
  const r=vm.model.recommendation;
  if(!r)return `<div class="signal-card">${empty(vm.model.unavailableReason||'Aucun marché ne franchit les seuils de confiance ou de cote minimale pour ce match — IASHARK préfère ne pas se prononcer.')}</div>`;
  const riskCode=vm.editorial.riskCode||null;
  const value=vm.model.value;
  return `<div class="signal-card">
    <div class="signal-top">
      <div><span class="micro">Signal IASHARK</span><h3 class="signal-market">${esc(r.market)}</h3><p class="signal-sub">${esc(vm.editorial.reading||'Analyse en cours de consolidation.')}</p></div>
      ${value!==null&&value!==undefined?`<div class="value-pill"><b>${value>0?'+':''}${fmt(value)}%</b><small>Value estimée</small></div>`:''}
    </div>
    <div class="signal-main">
      ${scoreRing(vm.model.iasharkScore)}
      <div class="badge-col">${confidenceBadge(r.reliability)}${riskBadge(riskCode)}</div>
      <div class="signal-metrics"><div><b>${fmt(r.probability)}%</b><small>Probabilité modèle</small></div><div><b>${vm.model.simulationCount?Number(vm.model.simulationCount).toLocaleString('fr-FR'):'—'}</b><small>Simulations</small></div></div>
    </div>
    <h4 class="micro" style="display:block;margin:12px 0 2px">Marchés recommandés</h4>
    ${recoTable(vm)}
    <h4 class="micro" style="display:block;margin:14px 0 2px">Consensus bookmakers</h4>
    ${consensusSection(vm)}
    <div class="signal-bottom">
      <div><h4 class="micro" style="display:block;margin:0 0 8px">Gestion de mise</h4><div class="stake-tiers"><div class="stake-tier"><b>1u</b>Prudent</div><div class="stake-tier active"><b>1.5u</b>Standard</div><div class="stake-tier"><b>2u</b>Agressif</div></div></div>
      <div><h4 class="micro" style="display:block;margin:0 0 8px">Info marché</h4>${infoMarche(vm)}</div>
    </div>
    <button class="cta-watchlist" type="button">★ Ajouter à ma watchlist</button>
  </div>`;
}
function factors(vm){const rows=[...vm.editorial.reasons];if(vm.editorial.decisiveFactor)rows.push(vm.editorial.decisiveFactor);return rows.length?`<div class="factor-grid">${rows.slice(0,3).map((x,i)=>`<div><i>${i===0?'↗':i===1?'◉':'◎'}</i><span>${esc(x)}</span></div>`).join('')}</div>`:empty('Les facteurs détaillés seront publiés dès que les données seront suffisamment complètes.')}
function scenario(vm){const slots=vm.editorial.scenario15;if(!slots.length)return vm.editorial.scenario?`<p class="copy">${esc(vm.editorial.scenario)}</p>`:empty('Scénario indisponible.');const groups=[[slots[0],slots[1]],[slots[2],slots[3]],[slots[4],slots[5]]];return `<div class="scenario">${groups.map((items,i)=>{const available=items.filter(Boolean);if(!available.length)return'';const label=['0–30′','30–60′','60–90′'][i];return `<span>${label}</span><p>${esc(available.map(x=>x.txt).filter(Boolean).join(' '))}</p>`}).join('')}</div>`}
function matchupsSection(vm){const m=vm.matchups;if(!m||!m.length)return empty('Aucun écart statistique assez net entre les deux équipes pour cibler un matchup fiable.');return `<div class="matchup-grid">${m.slice(0,3).map(x=>`<div class="matchup-card"><b>${esc(x.title)}</b><p>${esc(x.text)}</p></div>`).join('')}</div>`}
function summary(vm){return `${signal(vm)}${panel('Pourquoi ce choix ?',factors(vm),'summary-factors')}<div class="risk-strip"><b>⚠ Risque principal</b><span>${esc(vm.editorial.risk||'Risque spécifique non disponible dans les données actuelles.')}</span></div><div class="summary-bottom">${panel('Lecture du match',vm.editorial.reading?`<p class="copy">${esc(vm.editorial.reading)}</p>`:empty('Lecture en attente de données fiables.'))}${panel('Scénario probable',scenario(vm))}</div>${panel('Matchups à cibler',matchupsSection(vm),'advanced-wide')}`}

function probabilities(vm){const p=vm.model.probabilities;if(!p)return empty('Probabilités indisponibles.');return `<div class="probabilities"><div><span>Domicile</span><strong>${fmt(p.home)}%</strong></div><div><span>Nul</span><strong>${fmt(p.draw)}%</strong></div><div><span>Extérieur</span><strong>${fmt(p.away)}%</strong></div></div>`}
function xg(vm){const x=vm.model.expectedGoals;if(!x)return empty('xG indisponibles.');return `<div class="xg-teams"><div>${logo(vm.identity.home.logo,vm.identity.home.name)}<strong>${fmt(x.home)}</strong><small>${esc(vm.identity.home.name)}</small></div><div>${logo(vm.identity.away.logo,vm.identity.away.name)}<strong>${fmt(x.away)}</strong><small>${esc(vm.identity.away.name)}</small></div></div>`}
function scores(vm){return vm.model.scores.length?vm.model.scores.map(s=>`<div class="score"><b>${esc(s.score)}</b><span>${fmt(s.probability)} %</span></div>`).join(''):empty('Scores indisponibles.')}
function conditions(vm){const w=vm.conditions.weather;return `<div class="condition-grid"><div><small>Stade</small><b>${esc(vm.conditions.venue||'À confirmer')}</b></div><div><small>Météo</small><b>${w?esc(w.description||w.temperature):'À confirmer'}</b></div>${w&&w.temperature?`<div><small>Température</small><b>${esc(w.temperature)}</b></div>`:''}</div>`}
function referee(vm){const a=vm.referee;if(!a)return empty('Arbitre non encore désigné ou données disciplinaires indisponibles.');return `<div class="referee"><b>${esc(a.name)}</b><div><span>${fmt(a.cardsPerMatch)}</span><small>Cartons / match</small></div><div><span>${fmt(a.penaltiesPerMatch)}</span><small>Penaltys / match</small></div><div><span>${fmt(a.matches)}</span><small>Matchs analysés</small></div></div>`}
function comparison(vm){if(!vm.comparison)return empty('Comparaison indisponible.');return `<div class="comparison">${vm.comparison.rows.map(r=>{const max=Math.max(r.home,r.away,1);return `<div class="compare-row"><b>${fmt(r.home)}</b><div class="bar"><i style="width:${r.home/max*100}%"></i></div><span>${esc(r.label)}</span><div class="bar away"><i style="width:${r.away/max*100}%"></i></div><b>${fmt(r.away)}</b></div>`}).join('')}</div>`}
function patterns(vm){if(!vm.patterns)return empty('Tranches de 15 minutes indisponibles : échantillon insuffisant.');const h=vm.patterns.home.slots||[],a=vm.patterns.away.slots||[],max=Math.max(...h.map(x=>+x.n||0),...a.map(x=>+x.n||0),1);return `<div class="patterns">${h.map((x,n)=>`<div><span>${fmt(x.n)}%</span><span>${fmt(a[n]&&a[n].n)}%</span><div><i style="height:${(+x.n||0)/max*54}px"></i><i style="height:${(+(a[n]&&a[n].n)||0)/max*54}px"></i></div><small>${esc(x.t)}</small></div>`).join('')}</div>`}

// Momentum IASHARK : SVG courbe, 2 series (domicile/exterieur), echelle
// fixe -100/+100 (bornee visuellement, les valeurs reelles peuvent depasser
// legerement - clampees ici uniquement pour l'affichage, jamais dans le
// calcul lui-meme qui reste dans lib/match-view-model.js).
// Courbe lissee (Catmull-Rom -> Bezier cubique) : purement cosmetique, ne
// modifie aucune valeur - les points d'ancrage restent les vraies valeurs
// calculees par slotPercents()/momentumSeries() dans le view-model.
function smoothPath(points){
  if(points.length<2)return `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  let d=`M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)} `;
  for(let i=0;i<points.length-1;i++){
    const p0=points[i===0?0:i-1],p1=points[i],p2=points[i+1],p3=points[i+2<points.length?i+2:i+1];
    const c1x=p1[0]+(p2[0]-p0[0])/6,c1y=p1[1]+(p2[1]-p0[1])/6;
    const c2x=p2[0]-(p3[0]-p1[0])/6,c2y=p2[1]-(p3[1]-p1[1])/6;
    d+=`C${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)} `;
  }
  return d.trim();
}
function momentumChart(vm){
  const pts=vm.momentum;
  if(!pts)return empty('Momentum IASHARK indisponible : historique événementiel insuffisant pour les deux équipes.');
  const W=300,H=110,padX=8,padY=10,clamp=v=>Math.max(-100,Math.min(100,v));
  const x=i=>padX+(i*(W-2*padX)/(pts.length-1));
  const y=v=>padY+(H-2*padY)/2-(clamp(v)/100)*((H-2*padY)/2);
  const line=key=>smoothPath(pts.map((p,i)=>[x(i),y(p[key])]));
  const ticks=[0,15,30,45,60,75,90];
  const tx=t=>padX+(t/90)*(W-2*padX);
  const grid=[0.2,0.4,0.6,0.8].map(f=>`<line x1="${padX}" y1="${(padY+f*(H-2*padY)).toFixed(1)}" x2="${W-padX}" y2="${(padY+f*(H-2*padY)).toFixed(1)}" stroke="rgba(0,200,255,.06)" stroke-width="1"></line>`).join('');
  const vgrid=ticks.map(t=>`<line x1="${tx(t).toFixed(1)}" y1="${padY}" x2="${tx(t).toFixed(1)}" y2="${H-padY}" stroke="rgba(0,200,255,.05)" stroke-width="1"></line>`).join('');
  const axis=ticks.map(t=>`<text x="${tx(t).toFixed(1)}" y="${H-1}" text-anchor="middle" font-size="6" fill="var(--muted)">${t}</text>`).join('');
  return `<div class="momentum-wrap"><div class="momentum-legend"><span class="l-home"><i></i>${esc(vm.identity.home.name)}</span><span class="l-away"><i></i>${esc(vm.identity.away.name)}</span></div><svg class="momentum-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${grid}${vgrid}<line x1="${padX}" y1="${(padY+(H-2*padY)/2).toFixed(1)}" x2="${W-padX}" y2="${(padY+(H-2*padY)/2).toFixed(1)}" stroke="rgba(0,200,255,.15)" stroke-width="1"></line><path d="${line('home')}" fill="none" stroke="var(--cyan)" stroke-width="1.8" stroke-linecap="round"></path><path d="${line('away')}" fill="none" stroke="var(--red)" stroke-width="1.8" stroke-linecap="round"></path>${axis}</svg><p class="momentum-note">Momentum IASHARK — projection pré-match construite à partir des tendances historiques par tranche de 15 minutes (API-Football), pas une mesure live.</p></div>`;
}

// Distribution Monte-Carlo : barres SVG a partir des vrais mc_scores (top
// scores exacts issus des simulations reelles du pipeline).
function mcDistributionChart(vm){
  const d=vm.model.monteCarloDistribution;
  if(!d)return empty('Distribution Monte-Carlo indisponible.');
  const W=300,H=70,pad=4,gap=6,n=d.bars.length,bw=(W-2*pad-gap*(n-1))/n,max=Math.max(...d.bars.map(b=>b.pct),1);
  const bars=d.bars.map((b,i)=>{const h=(b.pct/max)*(H-16);const bx=pad+i*(bw+gap);return `<rect x="${bx.toFixed(1)}" y="${(H-h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="var(--cyan)" opacity="${i===0?1:0.55}"></rect><text x="${(bx+bw/2).toFixed(1)}" y="${H-h-4}" text-anchor="middle" font-size="6" fill="var(--soft)">${b.pct}%</text><text x="${(bx+bw/2).toFixed(1)}" y="${H+8}" text-anchor="middle" font-size="6" fill="var(--muted)">${esc(b.score)}</text>`;}).join('');
  return `<svg class="mc-distribution" viewBox="0 0 ${W} ${H+12}" preserveAspectRatio="none">${bars}</svg><div class="mc-stats"><div><b>${Number(d.simulationCount||0).toLocaleString('fr-FR')}</b><small>Simulations</small></div><div><b>${esc(d.bars[0].score)}</b><small>Score le + probable</small></div><div><b>${d.bars[0].pct}%</b><small>Probabilité</small></div></div>`;
}

// Indicateurs avances : 4 cards (icone + gros chiffre), memes 4 champs
// reels qu'avant (agreementLabel/simulationCount/quality/sources), juste
// restyles en cards au lieu d'un tableau - pas de "delta" invente faute de
// donnee de reference reelle a comparer.
// Shot Profile : repartition reelle cadres/non-cadres/contres par equipe
// (match_stats_home/away.shots_on/off/blocked). Precision offensive : xG
// par tir cadre (proxy honnete de "qualite des occasions" - API-Football ne
// fournit pas de coordonnees de tir, donc pas de vraies zones spatiales).
function shotProfile(vm){
  const s=vm.shotStats;
  if(!s)return empty('Profil de tirs indisponible pour ce match.');
  const row=(team,d)=>{const total=Math.max(d.total||0,d.on+d.off+d.blocked,1);return `<div class="shot-team">${logo(team.logo,team.name)}<span class="name">${esc(team.name)}</span><div class="shot-bar"><i class="on" style="width:${(d.on/total*100).toFixed(1)}%"></i><i class="off" style="width:${(d.off/total*100).toFixed(1)}%"></i><i class="blocked" style="width:${(d.blocked/total*100).toFixed(1)}%"></i></div><span class="shot-total">${fmt(d.total)}</span></div>`};
  return `<div class="shot-profile">${row(vm.identity.home,s.home)}${row(vm.identity.away,s.away)}<div class="shot-legend"><span><i style="background:var(--cyan)"></i>Cadrés</span><span><i style="background:var(--muted)"></i>Non cadrés</span><span><i style="background:var(--amber)"></i>Contrés</span></div></div>`;
}
function precisionOffensive(vm){
  const s=vm.shotStats;
  if(!s||s.precision.home===null||s.precision.away===null)return empty('Qualité des occasions indisponible : xG ou tirs cadrés manquants.');
  const max=Math.max(s.precision.home,s.precision.away,0.1);
  const row=(team,val)=>`<div class="precision-row"><span class="name">${esc(team.name)}</span><div class="precision-gauge"><i style="width:${(val/max*100).toFixed(0)}%"></i></div><span class="precision-val">${fmt(val)}</span></div>`;
  return `<div class="precision-wrap">${row(vm.identity.home,s.precision.home)}${row(vm.identity.away,s.precision.away)}<p class="precision-note">xG par tir cadré — donnée de zones de tir non fournie par API-Football, indicateur de qualité d'occasion utilisé à la place.</p></div>`;
}
function quality(vm){
  const items=[
    ['◈',esc(vm.model.agreementLabel||'—'),'Accord des modèles'],
    ['◉',vm.model.simulationCount?Number(vm.model.simulationCount).toLocaleString('fr-FR'):'—','Simulations IA'],
    ['▣',`${fmt(vm.model.quality)}%`,'Qualité des données'],
    ['✓',String(vm.model.sources.length),'Sources confirmées']
  ];
  return `<div class="indicator-grid">${items.map(([icon,val,label])=>`<div class="indicator-card"><i>${icon}</i><b>${val}</b><small>${label}</small></div>`).join('')}</div>`;
}
function faq(vm){return `<div class="faq"><details open><summary>Pourquoi ce marché est-il retenu ?</summary><p>Il obtient le meilleur compromis calculé entre probabilité, fiabilité des données et cote admissible parmi les marchés modélisés.</p></details><details><summary>D'où viennent les données ?</summary><p>${esc(vm.model.sources.join(' · ')||'API-Football.')}</p></details><details><summary>C'est quoi le Momentum IASHARK ?</summary><p>Une projection pré-match de la pression offensive par tranche de 15 minutes, construite à partir des tendances historiques réelles des deux équipes — pas un tracking live.</p></details><details><summary>Pourquoi certains blocs manquent-ils ?</summary><p>IASHARK masque une donnée lorsqu'elle n'est pas confirmée ou que son échantillon est insuffisant.</p></details></div>`}
function advanced(vm){return `<div class="context-top">${panel('Conditions du match',conditions(vm))}${panel('Arbitre & discipline',referee(vm))}</div><div class="advanced-top">${panel('Probabilités 1X2',probabilities(vm))}${panel('Buts attendus (xG)',xg(vm))}${panel('Scores les plus probables',scores(vm))}</div>${panel('Momentum offensif IASHARK',momentumChart(vm),'advanced-wide')}${panel('Distribution Monte-Carlo',mcDistributionChart(vm),'advanced-wide')}<div class="shots-top">${panel('Shot Profile',shotProfile(vm))}${panel('Qualité des occasions',precisionOffensive(vm))}</div>${panel('Comparaison des équipes',comparison(vm),'advanced-wide')}${panel('Scénario par tranches de 15 min',patterns(vm),'advanced-wide')}${panel('Indicateurs avancés',quality(vm),'advanced-wide')}${panel('Questions sur ce match',faq(vm),'advanced-wide')}`}

function absences(vm){const side=(team,items)=>`<div><h3>${esc(team.name)}</h3>${items.length?list(items.map(x=>`${x.name}${x.reason?` — ${x.reason}`:''}`),'absence-list'):`<p class="muted">Aucune absence disponible dans les données.</p>`}</div>`;return `<div class="absence-cols">${side(vm.identity.home,vm.players.absences.home)}${side(vm.identity.away,vm.players.absences.away)}</div>`}

// Terrain tactique : positions REELLES par ligne (vm.players.formations,
// derive du champ grid API-Football) quand disponible ; sinon repli honnete
// sur un regroupement par poste (ancien comportement) ; sinon etat vide.
const POS_ORDER=['G','D','M','F'];
function pitchTeam(team,data,formationRows,isAway){
  if(!data||!Array.isArray(data.startXI)||!data.startXI.length)return `<div class="pitch-empty"><b>${esc(team.name)}</b><small>${esc((data&&data.formation)||'Formation à confirmer')}</small><span>Onze non confirmé</span></div>`;
  const rows=formationRows||POS_ORDER.map(pos=>data.startXI.filter(p=>p.pos===pos)).filter(g=>g.length);
  const orderedRows=isAway?rows.slice().reverse():rows;
  return `<div class="pitch"><header><b>${esc(team.name)}</b><small>${esc(data.formation||'—')}</small></header><div class="pitch-formation">${orderedRows.map((group,i)=>`<div class="pitch-row" style="top:${(i/(Math.max(orderedRows.length-1,1)))*100}%">${group.map(p=>`<span class="pitch-player${isAway?' away':''}" title="${esc(p.name)}"><i></i><em>${esc(p.name)}</em></span>`).join('')}</div>`).join('')}</div></div>`;
}
function lineups(vm){const l=vm.players.lineups;if(!l)return empty('Compositions probables — confirmation attendue environ une heure avant le match.');const f=vm.players.formations||{home:null,away:null};return `<div class="lineup-grid">${pitchTeam(vm.identity.home,l.home,f.home,false)}${pitchTeam(vm.identity.away,l.away,f.away,true)}</div>`}

function watches(vm){return vm.players.watch.length?`<div class="watch-grid">${vm.players.watch.slice(0,3).map(x=>`<article class="watch">${x.photo?`<img src="${esc(x.photo)}" alt="">`:''}<b>${esc(x.name)}</b><small>${x.value!==null?`${fmt(x.value)} contribution(s) récente(s)`:'Joueur à suivre'}</small></article>`).join('')}</div>`:empty('Aucun joueur suffisamment documenté.')}

// Joueurs clés a suivre : classes par IASHARK Player Impact Score (deja
// calcule dans le view-model a partir des vrais marches joueur reels) -
// distinct de watches() ci-dessus (qui vient de hot_scorer/hot_assist,
// signal different mais tout aussi reel).
function impactSection(vm){
  const ranked=vm.players.impactRanking;
  if(!ranked.length)return empty('Player Impact Score indisponible : nécessite des marchés joueurs modélisés (compositions/statistiques insuffisantes pour ce match).');
  return `<div class="impact-grid">${ranked.map(p=>`<div class="impact-card"><div class="impact-avatar empty">♟</div><b>${esc(p.player)}</b><small>${esc(p.market)}</small><div class="impact-stats"><div><b>${fmt(p.probability)}%</b><span>Probabilité</span></div><div><b>${p.minutes===null?'—':fmt(p.minutes)}</b><span>Min. att.</span></div></div></div>`).join('')}</div>`;
}
function propsSection(vm){
  const rows=vm.players.projections;
  if(!rows.length)return empty('Aucune prop joueur fiable pour ce match — compositions ou échantillon insuffisants.');
  return `<div class="props-list">${rows.slice(0,5).map(x=>`<div class="prop-row"><div><b>${esc(x.player)}</b><small>${esc(x.market)} · ${esc(x.status)}</small></div><span class="prop-val">${x.probability===null?'N/D':`${fmt(x.probability)}%`}</span></div>`).join('')}</div>`;
}
function projections(vm){if(!vm.players.projections.length)return empty('Aucune projection joueur fiable pour ce match.');return `<div class="table-scroll"><table class="projection-table"><thead><tr><th>Joueur</th><th>Marché</th><th>Statut</th><th>Minutes</th><th>Probabilité</th><th>Qualité</th></tr></thead><tbody>${vm.players.projections.slice(0,6).map(x=>`<tr><td>${esc(x.player)}</td><td>${esc(x.market)}</td><td>${esc(x.status)}</td><td>${x.minutes===null?'—':fmt(x.minutes)}</td><td>${x.probability===null?'—':`${fmt(x.probability)} %`}</td><td>${esc(x.quality)}</td></tr>`).join('')}</tbody></table></div>`}
function players(vm){return `<div class="players-top">${panel('Compositions probables',lineups(vm))}${panel('Absents & incertains',absences(vm))}</div>${panel('Joueurs clés — Player Impact Score IASHARK',impactSection(vm),'players-wide')}${panel('Joueurs à suivre',watches(vm),'players-wide')}${panel('Props joueurs IASHARK',propsSection(vm),'players-wide')}${panel('Projections joueurs IASHARK',projections(vm),'players-wide')}<div class="scorer-lock"><b>Marché buteur</b><span>Disponible quand les compositions et les minutes attendues sont suffisamment fiables.</span></div>`}

function render(raw){const vm=IasharkMatchViewModel.buildMatchViewModel(raw);document.title=`${vm.identity.home.name} vs ${vm.identity.away.name} — IASHARK`;root.innerHTML=`<article class="match-card">${header(vm)}<main class="tab-panel" id="summary">${summary(vm)}</main><main class="tab-panel" id="advanced" hidden>${advanced(vm)}</main><main class="tab-panel" id="players" hidden>${players(vm)}</main></article>`;root.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{root.querySelectorAll('.tab').forEach(x=>{const active=x===btn;x.classList.toggle('active',active);x.setAttribute('aria-selected',String(active))});root.querySelectorAll('.tab-panel').forEach(x=>x.hidden=x.id!==btn.dataset.tab)}))}
async function init(){try{const id=typeof FIXED_MATCH_ID!=='undefined'?String(FIXED_MATCH_ID):new URLSearchParams(location.search).get('id');let raw=typeof PRELOADED_MATCH!=='undefined'?PRELOADED_MATCH:null;if(window.IasharkApp){const session=(await window.IasharkApp.supabase.auth.getSession()).data.session;if(session){const result=await window.IasharkApp.supabase.functions.invoke('match-data');if(result.data&&!result.error)raw=(result.data.matchs||[]).find(x=>String(x.id)===String(id))||raw}}if(!raw){const data=await fetch(`/data.json?t=${Date.now()}`).then(r=>r.json());raw=(data.matchs||[]).find(x=>String(x.id)===String(id))}if(!raw)throw new Error('Match introuvable');render(raw)}catch(e){root.innerHTML=`<div class="loading-card"><p>${esc(e.message||'Erreur de chargement')}</p><a class="btn-login" href="/">Retour à l'accueil</a></div>`}}
init();
})();
