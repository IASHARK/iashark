(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.IasharkToolsDomain=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
  const number=v=>Number.isFinite(Number(v))?Number(v):null;
  function calculateStake({bankroll,odds,probability,fraction=.5,cap=.05}){const b=number(bankroll),o=number(odds),p=number(probability),f=number(fraction);if(!(b>0)||!(o>1)||!(p>0&&p<100)||!(f>0&&f<=1))return null;const q=p/100;const full=((q*(o-1))-(1-q))/(o-1);const pct=Math.max(0,Math.min(full*f,cap));return{stake:Number((b*pct).toFixed(2)),bankrollPct:Number((pct*100).toFixed(2)),expectedValue:Number(((q*o-1)*100).toFixed(2)),hasEdge:full>0};}
  function pnl(decision){if(!decision)return 0;const stake=number(decision.stake)||0,odds=number(decision.odds)||0;if(decision.status==='won')return Number((stake*(odds-1)).toFixed(2));if(decision.status==='lost')return -stake;return 0;}
  function summarize(bankroll,decisions){const rows=Array.isArray(decisions)?decisions:[];const settled=rows.filter(x=>['won','lost','void'].includes(x.status));const profit=settled.reduce((s,x)=>s+(number(x.result_pnl)??pnl(x)),0);const staked=settled.reduce((s,x)=>s+(number(x.stake)||0),0);const wins=settled.filter(x=>x.status==='won').length;return{bankroll:number(bankroll),profit:Number(profit.toFixed(2)),roi:staked?Number((profit/staked*100).toFixed(2)):0,winRate:settled.length?Number((wins/settled.length*100).toFixed(1)):0,settled:settled.length,total:rows.length};}

  // ---------------------------------------------------------------------
  // OUTILS PRO. Chacun exploite les sorties du modele IASHARK - c'est ce qui
  // les distingue d'une calculette generique qu'on trouve gratuitement
  // ailleurs, et donc ce qui justifie l'abonnement.
  // ---------------------------------------------------------------------

  // 1. SCANNER DE VALUE. L'ecart modele/marche est deja calcule par le
  // pipeline pour chaque marche de chaque match (markets_compared), mais il
  // n'est visible qu'une rencontre a la fois. On l'aplatit et on le trie :
  // "ou est le meilleur pari aujourd'hui" repondu en un ecran.
  // Aucun chiffre n'est recalcule ni invente ici.
  function scanValue(matchs, options) {
    const minEdge = number(options && options.minEdge) ?? 0;
    const rows = [];
    (Array.isArray(matchs) ? matchs : []).forEach(m => {
      const compared = Array.isArray(m && m.markets_compared) ? m.markets_compared : [];
      compared.forEach(c => {
        const prob = number(c && c.probability), consensus = number(c && c.consensus), edge = number(c && c.edge);
        if (prob === null || edge === null) return;
        if (edge < minEdge) return;
        rows.push({
          id: m.id,
          match: (m.home && m.home.n ? m.home.n : '') + ' – ' + (m.away && m.away.n ? m.away.n : ''),
          league: m.league || '',
          date: m.date || '',
          market: c.market || c.id || '',
          modelProbability: prob,
          marketProbability: consensus,
          edge: Number(edge.toFixed(1)),
          fairOdds: prob > 0 ? Number((100 / prob).toFixed(2)) : null,
          isRecommended: !!(m.pari_rec && c.market && String(c.market) === String(m.pari_rec))
        });
      });
    });
    return rows.sort((a, b) => b.edge - a.edge);
  }

  // 2. COMBINE. Les probabilites se multiplient, les cotes aussi. La plupart
  // des parieurs l'ignorent : deux paris a 60% ne font pas un combine a 60%
  // mais a 36%. On expose la probabilite reelle, la cote equitable, la cote
  // du bookmaker et l'esperance qui en decoule - y compris, et surtout,
  // quand elle est negative.
  function combo(selections) {
    const rows = (Array.isArray(selections) ? selections : [])
      .map(s => ({ probability: number(s && s.probability), odds: number(s && s.odds), label: (s && s.label) || '' }))
      .filter(s => s.probability > 0 && s.probability <= 100 && s.odds > 1);
    if (rows.length < 2) return null;
    const probability = rows.reduce((acc, s) => acc * (s.probability / 100), 1);
    const bookOdds = rows.reduce((acc, s) => acc * s.odds, 1);
    const fairOdds = probability > 0 ? 1 / probability : null;
    const expectedValue = probability * bookOdds - 1;
    // Esperance de chaque pari joue seul, pour comparaison : c'est la
    // demonstration la plus parlante que le combine detruit l'avantage.
    const singlesEv = rows.map(s => (s.probability / 100) * s.odds - 1);
    const bestSingleEv = singlesEv.length ? Math.max.apply(null, singlesEv) : null;
    return {
      legs: rows.length,
      probability: Number((probability * 100).toFixed(2)),
      fairOdds: fairOdds === null ? null : Number(fairOdds.toFixed(2)),
      bookOdds: Number(bookOdds.toFixed(2)),
      expectedValue: Number((expectedValue * 100).toFixed(2)),
      bestSingleEv: bestSingleEv === null ? null : Number((bestSingleEv * 100).toFixed(2)),
      worseThanSingle: bestSingleEv !== null && expectedValue < bestSingleEv
    };
  }

  // 3. SIMULATEUR DE VARIANCE. Un ROI positif ne dit rien du chemin parcouru
  // pour y arriver : on peut gagner sur 500 paris en ayant perdu la moitie
  // de sa bankroll en route. On rejoue donc la saison des milliers de fois a
  // partir du taux de reussite et de la cote moyenne REELS fournis, et on
  // montre la dispersion plutot qu'une moyenne rassurante.
  // Generateur pseudo-aleatoire deterministe (meme entree -> meme resultat),
  // pour qu'un utilisateur qui relance le calcul ne voie pas les chiffres
  // bouger sans raison.
  function makeRandom(seed) {
    let state = (Math.abs(Math.round(seed)) % 2147483646) + 1;
    return function () { state = (state * 16807) % 2147483647; return (state - 1) / 2147483646; };
  }
  function simulateVariance(params) {
    const bankroll = number(params && params.bankroll);
    const stakePct = number(params && params.stakePct);
    const bets = number(params && params.bets);
    const winRate = number(params && params.winRate);
    const odds = number(params && params.odds);
    const runs = number(params && params.runs) || 5000;
    if (!(bankroll > 0) || !(stakePct > 0 && stakePct <= 100) || !(bets > 0) || !(winRate > 0 && winRate < 100) || !(odds > 1)) return null;
    const p = winRate / 100, fraction = stakePct / 100;
    const rand = makeRandom(bankroll + stakePct * 1000 + bets * 7 + winRate * 13 + odds * 101);
    const finals = [];
    let ruined = 0, drawdown30 = 0, totalWorstDrawdown = 0;
    for (let r = 0; r < runs; r++) {
      let cash = bankroll, peak = bankroll, worst = 0;
      for (let b = 0; b < bets; b++) {
        const stake = cash * fraction;
        if (stake <= 0) break;
        cash += rand() < p ? stake * (odds - 1) : -stake;
        if (cash > peak) peak = cash;
        const dd = peak > 0 ? (peak - cash) / peak : 0;
        if (dd > worst) worst = dd;
      }
      finals.push(cash);
      if (cash < bankroll * 0.5) ruined++;
      if (worst >= 0.30) drawdown30++;
      totalWorstDrawdown += worst;
    }
    finals.sort((a, b) => a - b);
    const at = q => finals[Math.min(finals.length - 1, Math.max(0, Math.floor(q * finals.length)))];
    return {
      runs,
      median: Number(at(0.5).toFixed(2)),
      p05: Number(at(0.05).toFixed(2)),
      p95: Number(at(0.95).toFixed(2)),
      lossProbability: Number((finals.filter(v => v < bankroll).length / runs * 100).toFixed(1)),
      halfBankrollProbability: Number((ruined / runs * 100).toFixed(1)),
      drawdown30Probability: Number((drawdown30 / runs * 100).toFixed(1)),
      averageWorstDrawdown: Number((totalWorstDrawdown / runs * 100).toFixed(1))
    };
  }

  return{calculateStake,pnl,summarize,scanValue,combo,simulateVariance};
});
