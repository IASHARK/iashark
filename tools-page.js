(function(){'use strict';const $=id=>document.getElementById(id),domain=IasharkToolsDomain;let ctx,decisions=[];
function message(id,text,type=''){const el=$(id);el.textContent=text;el.className='message '+type}
function recalc(){const r=domain.calculateStake({bankroll:$('bankroll').value,odds:$('odds').value,probability:$('probability').value,fraction:$('fraction').value});if(!r){$('stakeResult').textContent='—';$('stakePct').textContent='—';return}$('stakeResult').textContent=r.stake.toLocaleString('fr-FR',{minimumFractionDigits:2})+' €';$('stakePct').textContent=r.bankrollPct+'%';$('decisionStake').value=r.stake||'';message('calcMsg',r.hasEdge?'Espérance : '+(r.expectedValue>=0?'+':'')+r.expectedValue+'%':'Aucun avantage mathématique : mise nulle.',r.hasEdge?'success':'')}
function render(){const s=domain.summarize($('bankroll').value,decisions);$('metricBankroll').textContent=s.bankroll?s.bankroll.toLocaleString('fr-FR')+' €':'—';$('metricProfit').textContent=(s.profit>=0?'+':'')+s.profit.toLocaleString('fr-FR')+' €';$('metricRoi').textContent=(s.roi>=0?'+':'')+s.roi+'%';$('metricTotal').textContent=s.total;$('journalCount').textContent=s.total+' décision'+(s.total>1?'s':'');$('journal').innerHTML=decisions.length?'<table class="table"><thead><tr><th>Match</th><th>Marché</th><th>Cote</th><th>Mise</th><th>Statut</th><th>P&amp;L</th></tr></thead><tbody>'+decisions.map(d=>`<tr><td>${escapeHtml(d.match_label)}</td><td>${escapeHtml(d.market)}</td><td>${d.odds}</td><td>${d.stake} €</td><td><span class="pill ${d.status==='won'?'win':d.status==='lost'?'loss':''}">${d.status}</span></td><td>${d.result_pnl==null?'—':d.result_pnl+' €'}</td></tr>`).join('')+'</tbody></table>':'<div class="muted">Aucune décision enregistrée. Le journal ne montre jamais de données de démonstration.</div>'}
function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
async function init(){ctx=await IasharkApp.context();$('planPill').textContent=ctx.isAdmin?'Admin':ctx.isPro?'Pro':ctx.user?'Gratuit':'Invité';if(ctx.profile&&ctx.profile.capital){$('bankroll').value=ctx.profile.capital}if(ctx.user){const p=await IasharkApp.supabase.from('user_preferences').select('daily_exposure_pct,stop_loss_pct').eq('user_id',ctx.user.id).maybeSingle();if(p.data){$('dailyExposure').textContent=p.data.daily_exposure_pct+'%';$('stopLoss').textContent='-'+p.data.stop_loss_pct+'%'}const q=await IasharkApp.supabase.from('betting_decisions').select('*').eq('user_id',ctx.user.id).order('created_at',{ascending:false}).limit(50);if(!q.error)decisions=q.data||[]}render();recalc()}
['bankroll','odds','probability','fraction'].forEach(id=>$(id).addEventListener('input',recalc));$('saveBankroll').onclick=async()=>{if(!ctx.user)return message('bankrollMsg','Connectez-vous pour enregistrer votre bankroll.','error');const v=Number($('bankroll').value);if(!(v>0))return message('bankrollMsg','Montant invalide.','error');const q=await IasharkApp.supabase.from('users').update({capital:v}).eq('id',ctx.user.id);message('bankrollMsg',q.error?q.error.message:'Bankroll enregistrée.',q.error?'error':'success');render()};$('saveDecision').onclick=async()=>{if(!ctx.user)return message('decisionMsg','Connectez-vous pour utiliser le journal.','error');if(!ctx.isPro)return message('decisionMsg','Le journal synchronisé est réservé au plan Pro. Le calculateur reste gratuit.','error');const row={user_id:ctx.user.id,match_label:$('decisionMatch').value.trim(),market:$('decisionMarket').value.trim(),odds:Number($('odds').value),estimated_probability:Number($('probability').value),stake:Number($('decisionStake').value)};if(!row.match_label||!row.market||!(row.stake>0))return message('decisionMsg','Complétez le match, le marché et la mise.','error');const q=await IasharkApp.supabase.from('betting_decisions').insert(row).select().single();if(q.error)return message('decisionMsg',q.error.message,'error');decisions.unshift(q.data);message('decisionMsg','Décision enregistrée.','success');render()};init()})();

/* ---------------------------------------------------------------------
   OUTILS PRO (ajoutes le 02/09/2026).
   Les trois exploitent les sorties du modele deja publiees dans data.json
   - aucune probabilite n'est recalculee ni inventee cote navigateur.
   Verrou : un visiteur gratuit VOIT l'outil, son titre et son explication
   (il doit comprendre ce qu'on lui propose), mais le contenu est floute et
   inerte. Seul un abonne peut s'en servir.
   --------------------------------------------------------------------- */
(function(){
  'use strict';
  var domain = window.IasharkToolsDomain;
  var matchs = [];

  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function el(id){return document.getElementById(id);}
  function fmt(v,d){return Number(v).toLocaleString('fr-FR',{minimumFractionDigits:d,maximumFractionDigits:d});}

  function unlock(isPro){
    ['toolScan','toolCombo','toolVariance'].forEach(function(id){
      var node = el(id);
      if(node) node.setAttribute('data-locked', isPro ? '0' : '1');
    });
  }

  /* ---- 1. Scanner de value ---- */
  function renderScan(){
    var box = el('scanList'); if(!box) return;
    var minEdge = parseFloat((el('scanMinEdge')||{}).value || '5');
    var rows = domain.scanValue(matchs, {minEdge: minEdge}).slice(0, 12);
    if(!rows.length){
      box.innerHTML = '<div class="scan-empty">Aucun marché ne dépasse cet écart aujourd’hui. C’est une information en soi : le marché est aligné sur nos calculs.</div>';
      return;
    }
    box.innerHTML = rows.map(function(r, i){
      var heure = (r.date||'').split(' ')[1] || '';
      return '<div class="scan-row'+(i===0?' top':'')+'">'
        + '<div class="scan-edge">+'+fmt(r.edge,1)+'<small>points</small></div>'
        + '<div class="scan-main"><b>'+esc(r.match)+'</b>'
        + '<span><em>'+esc(r.market)+'</em>'+(r.isRecommended?' · pari retenu par le modèle':'')
        + ' · '+esc(r.league)+(heure?' · '+esc(heure):'')+'</span></div>'
        + '<div class="scan-side"><b>'+fmt(r.modelProbability,1)+'%</b><span>modèle</span>'
        + (r.marketProbability!=null?'<b style="color:var(--soft);font-size:13px">'+fmt(r.marketProbability,1)+'%</b><span>marché</span>':'')
        + '</div></div>';
    }).join('');
  }

  /* ---- 2. Combine ---- */
  function comboCandidates(){
    return matchs.filter(function(m){
      return m && m.pari_rec && !m.no_signal && Number(m.model_probability) > 0 && Number(m.cote_rec) > 1;
    });
  }
  function renderComboPicks(){
    var box = el('comboPicks'); if(!box) return;
    var list = comboCandidates();
    if(!list.length){ box.innerHTML = '<div class="scan-empty">Aucune sélection disponible aujourd’hui.</div>'; return; }
    box.innerHTML = list.map(function(m,i){
      return '<label class="combo-pick">'
        + '<input type="checkbox" data-combo="'+i+'">'
        + '<span class="cp-main"><b>'+esc((m.home&&m.home.n)+' – '+(m.away&&m.away.n))+'</b>'
        + '<span>'+esc(m.pari_rec)+' · '+fmt(m.model_probability,1)+'% estimés</span></span>'
        + '<span class="cp-odds">'+fmt(m.cote_rec,2)+'</span></label>';
    }).join('');
    box.querySelectorAll('input[data-combo]').forEach(function(input){
      input.addEventListener('change', renderCombo);
    });
  }
  function renderCombo(){
    var box = el('comboOut'), verdict = el('comboVerdict');
    if(!box||!verdict) return;
    var list = comboCandidates();
    var picks = [];
    document.querySelectorAll('input[data-combo]:checked').forEach(function(input){
      var m = list[Number(input.getAttribute('data-combo'))];
      if(m) picks.push({probability:Number(m.model_probability), odds:Number(m.cote_rec), label:m.pari_rec});
    });
    var r = domain.combo(picks);
    if(!r){
      box.innerHTML='';
      verdict.textContent = 'Sélectionnez au moins deux paris.';
      return;
    }
    box.innerHTML = ''
      + '<div><b>'+fmt(r.probability,1)+'%</b><span>probabilité réelle du combiné</span></div>'
      + '<div><b>'+fmt(r.fairOdds,2)+'</b><span>cote équitable</span></div>'
      + '<div><b>'+fmt(r.bookOdds,2)+'</b><span>cote du combiné</span></div>'
      + '<div><b class="'+(r.expectedValue>=0?'pos':'neg')+'">'+(r.expectedValue>=0?'+':'')+fmt(r.expectedValue,1)+'%</b><span>espérance du combiné</span></div>';
    verdict.innerHTML = r.worseThanSingle
      ? 'Ce combiné rapporte <b>moins</b> que le meilleur de ces paris joué seul ('+(r.bestSingleEv>=0?'+':'')+fmt(r.bestSingleEv,1)+'% d’espérance). Multiplier les sélections multiplie surtout le risque.'
      : 'Espérance du meilleur pari joué seul : '+(r.bestSingleEv>=0?'+':'')+fmt(r.bestSingleEv,1)+'%. Un combiné reste plus volatil : il faut que <b>toutes</b> les sélections passent.';
  }

  /* ---- 3. Variance ---- */
  function renderVariance(){
    var box = el('varOut'), note = el('varNote');
    if(!box||!note) return;
    var r = domain.simulateVariance({
      bankroll: (el('varBankroll')||{}).value,
      stakePct: (el('varStake')||{}).value,
      bets: (el('varBets')||{}).value,
      winRate: (el('varWinRate')||{}).value,
      odds: (el('varOdds')||{}).value,
      runs: 5000
    });
    if(!r){ box.innerHTML=''; note.textContent='Renseignez des valeurs valides pour lancer la simulation.'; return; }
    var start = Number((el('varBankroll')||{}).value);
    var cls = function(v,seuil){return v>=seuil?'bad':v>=seuil/2?'warn':'good';};
    box.innerHTML = ''
      + '<div><b>'+fmt(r.median,0)+' €</b><span>capital médian après la série</span></div>'
      + '<div><b>'+fmt(r.p05,0)+' €</b><span>scénario défavorable (5 % des cas font pire)</span></div>'
      + '<div><b>'+fmt(r.p95,0)+' €</b><span>scénario favorable (5 % des cas font mieux)</span></div>'
      + '<div><b class="'+cls(r.lossProbability,50)+'">'+fmt(r.lossProbability,1)+'%</b><span>de finir sous le capital de départ</span></div>'
      + '<div><b class="'+cls(r.drawdown30Probability,50)+'">'+fmt(r.drawdown30Probability,1)+'%</b><span>de subir une baisse de 30 % en cours de route</span></div>'
      + '<div><b class="'+cls(r.halfBankrollProbability,25)+'">'+fmt(r.halfBankrollProbability,1)+'%</b><span>de perdre la moitié du capital</span></div>';
    var evParPari = (Number((el('varWinRate')||{}).value)/100) * Number((el('varOdds')||{}).value) - 1;
    note.innerHTML = 'Avec ces réglages, chaque pari a une espérance de <b>'+(evParPari>=0?'+':'')+fmt(evParPari*100,1)+'%</b>. '
      + (evParPari < 0
          ? 'Elle est <b>négative</b> : aucune gestion de mise ne peut rendre cette série gagnante sur la durée. Le seul levier est d’améliorer le taux de réussite ou d’obtenir de meilleures cotes.'
          : 'Elle est positive, mais la colonne « baisse de 30 % » montre le creux qu’il faut être capable de traverser sans dévier de la méthode.')
      + ' Simulation sur 5 000 séries, à partir de ' + fmt(start,0) + ' €.';
  }

  /* ---- Initialisation ---- */
  async function initTools(){
    try{
      var ctx = await window.IasharkApp.context();
      unlock(!!ctx.isPro);
    }catch(e){ unlock(false); }
    try{
      var data = await fetch('/data.json?t='+Date.now()).then(function(r){return r.json();});
      matchs = data.matchs || [];
    }catch(e){ matchs = []; }
    renderScan();
    renderComboPicks();
    renderCombo();
    renderVariance();
    var sel = el('scanMinEdge'); if(sel) sel.addEventListener('change', renderScan);
    ['varBankroll','varStake','varBets','varWinRate','varOdds'].forEach(function(id){
      var node = el(id); if(node) node.addEventListener('input', renderVariance);
    });
  }
  initTools();
})();
