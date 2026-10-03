(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.IasharkToolsDomain=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
  const number=v=>Number.isFinite(Number(v))?Number(v):null;
  // Plus de calcul de mise (Kelly) : decision de Clement du 30/09/2026, IASHARK ne
  // conseille aucune mise ni aucun pourcentage du capital. L'onglet « Mise » de
  // l'espace Pro est retire.
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
  //
  // Condition 1 du mathematicien et de l'avocat du diable (30/09/2026) : un ecart en
  // faveur du modele n'est montre que pour un chiffre « modèle + cotes » (moteur v3,
  // championnat europeen avec cote d'avant-match). Modele seul (hors d'Europe, coupes,
  // selections, ancien moteur, origine inconnue) : sur 549 paris jamais vus ou il
  // depassait la cote sans marge, 77,0 % annonces pour 69,6 % passes. Meme regle que
  // la page match (lib/match-view-model.js#origineProbabilite).
  const ORIGINE_AVEC_COTES = 'modèle + cotes';
  const chiffreAvecCotes = m => !!(m && m.moteur_v3 && m.moteur_v3.source === 'v3' && m.moteur_v3.origine_probabilite === ORIGINE_AVEC_COTES);
  function scanValue(matchs, options) {
    const minEdge = number(options && options.minEdge) ?? 0;
    const rows = [];
    (Array.isArray(matchs) ? matchs : []).forEach(m => {
      // Competition « Fiabilité : en test » (config/leagues.json#fiabilite, champ
      // public league_reliability) : aucun ecart face a la cote, dans aucun sens.
      if (m && m.league_reliability === 'en_test') return;
      const compared = Array.isArray(m && m.markets_compared) ? m.markets_compared : [];
      const avecCotes = chiffreAvecCotes(m);
      compared.forEach(c => {
        // Ligne du pari retenu : sa chance IASHARK (chance_iashark, une seule source,
        // 01/10/2026), la meme que la page match et Telegram ; jamais recalculee ici.
        const estPari = !!(m.market_id != null && c && c.id != null && String(c.id) === String(m.market_id));
        const chance = estPari ? chanceLue(m) : null;
        if (estPari && chance === null) return;
        const consensus = number(c && c.consensus);
        const prob = estPari ? chance : number(c && c.probability);
        const edge = estPari ? (consensus === null ? null : Number((chance - consensus).toFixed(1))) : number(c && c.edge);
        if (prob === null || edge === null) return;
        if (edge < minEdge) return;
        if (edge > 0 && !avecCotes) return;
        rows.push({
          id: m.id,
          match: (m.home && m.home.n ? m.home.n : '') + ' – ' + (m.away && m.away.n ? m.away.n : ''),
          league: m.league || '',
          // Cle de competition et identifiant du marche : seulement pour la mise en avant
          // des choix de l'abonne (tools-page.js), jamais pour un calcul.
          leagueKey: String(m.league_key || '').toLowerCase(),
          marketKey: c.id != null ? String(c.id) : null,
          date: m.date || '',
          market: c.market || c.id || '',
          modelProbability: prob,
          marketProbability: consensus,
          edge: Number(edge.toFixed(1)),
          fairOdds: prob > 0 ? Number((100 / prob).toFixed(2)) : null,
          // Chance IASHARK du pari retenu (entier) : affichee sans decimale, comme partout.
          chanceIashark: estPari,
          isRecommended: estPari || !!(m.pari_rec && c.market && String(c.market) === String(m.pari_rec))
        });
      });
    });
    return rows.sort((a, b) => b.edge - a.edge);
  }

  // 2. COMBINE. Les probabilites se multiplient, les cotes aussi : deux paris a
  // 60 % ne font pas un combine a 60 % mais a 36 %. On expose la chance que
  // tout passe et la cote du combine, RIEN d'autre : plus aucune « esperance »
  // (decision de Clement du 30/09/2026 ; avocat du diable et mathematicien, preuve
  // MLS 70 % + Liga MX 72,6 % qui affichait « +19,4 % »).
  function combo(selections) {
    const rows = (Array.isArray(selections) ? selections : [])
      .map(s => ({ probability: number(s && s.probability), odds: number(s && s.odds), label: (s && s.label) || '' }))
      .filter(s => s.probability > 0 && s.probability <= 100 && s.odds > 1);
    if (rows.length < 2) return null;
    const probability = rows.reduce((acc, s) => acc * (s.probability / 100), 1);
    const bookOdds = rows.reduce((acc, s) => acc * s.odds, 1);
    return {
      legs: rows.length,
      probability: Number((probability * 100).toFixed(2)),
      bookOdds: Number(bookOdds.toFixed(2))
    };
  }

  // Selections du combine (abonne Pro), a partir des paris du jour. Pour chaque
  // pari, la chance retenue est SA chance IASHARK (chance_iashark) : le PLUS PETIT des
  // deux chiffres, celui du modele ou celui de la cote sans marge, calcule UNE FOIS par
  // le pipeline (lib/chance-iashark.js, une seule source, 01/10/2026), le meme que la
  // page match, le Canal Pro et Telegram. Rien n'est recalcule ici. Un pari sans cote
  // sans marge sort de la liste (regle inchangee : le combine ne prend que des chances
  // confrontees a la cote).
  function coteSansMarge(m) {
    const id = m && m.market_id != null ? String(m.market_id) : null;
    // Une seule cote (lib/cote-anj.js) : cote ANJ -> cote sans marge de la meme source.
    const anj = id && m.cote_source === 'anj' && m.sans_marge_anj ? number(m.sans_marge_anj[id]) : null;
    if (anj !== null && anj > 0 && anj < 100) return anj;
    const row = id ? (Array.isArray(m.markets_compared) ? m.markets_compared : []).find(c => c && c.id != null && String(c.id) === id) : null;
    const fair = row && row.consensus !== null && row.consensus !== '' ? number(row.consensus) : null;
    return fair !== null && fair > 0 && fair < 100 ? fair : null;
  }
  const decimal = v => (v === null || v === undefined || v === '' ? null : number(String(v).replace(',', '.')));
  // Chance publiee du pari (entier, %), ou null : jamais la probabilite brute du modele.
  function chanceLue(m) {
    const c = m && m.chance_iashark != null && m.chance_iashark !== '' ? number(m.chance_iashark) : null;
    return c !== null && c > 0 && c < 100 ? c : null;
  }
  function comboSelections(matchs, options) {
    const limite = number(options && options.limit) || 12;
    const out = [];
    (Array.isArray(matchs) ? matchs : []).forEach(m => {
      if (!m || m.no_signal) return;
      const chance = chanceLue(m), odds = decimal(m.cote_rec), fair = coteSansMarge(m);
      if (chance === null || !(odds > 1) || fair === null) return;
      out.push({
        id: String(m.id), matchKey: String(m.id),
        match: (m.home && m.home.n ? m.home.n : '') + ' – ' + (m.away && m.away.n ? m.away.n : ''),
        market: m.pari_rec || '', marketId: m.market_id != null ? String(m.market_id) : null,
        leagueKey: String(m.league_key || '').toLowerCase(),
        probability: chance,
        fairProbability: fair, odds: odds
      });
    });
    return out.slice(0, limite);
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
    // Courbe optionnelle : on releve le capital a une quarantaine de points de
    // controle sur chaque trajectoire, pour pouvoir tracer une mediane et une
    // bande de percentiles. On ne stocke jamais les 5 000 trajectoires
    // completes - seulement les releves, ce qui suffit au graphique.
    const wantCurve = !!(params && params.curve);
    const steps = wantCurve ? Math.min(40, Math.max(2, Math.round(bets))) : 0;
    const every = steps ? Math.max(1, Math.round(bets / steps)) : 0;
    const releves = [];
    for (let r = 0; r < runs; r++) {
      let cash = bankroll, peak = bankroll, worst = 0;
      let k = 0;
      for (let b = 0; b < bets; b++) {
        const stake = cash * fraction;
        if (stake <= 0) {
          if (wantCurve) { for (let j = k; j < steps; j++) { (releves[j] = releves[j] || []).push(cash); } k = steps; }
          break;
        }
        cash += rand() < p ? stake * (odds - 1) : -stake;
        if (cash > peak) peak = cash;
        const dd = peak > 0 ? (peak - cash) / peak : 0;
        if (dd > worst) worst = dd;
        if (wantCurve && k < steps && (b + 1) % every === 0) { (releves[k] = releves[k] || []).push(cash); k++; }
      }
      if (wantCurve) { for (let j = k; j < steps; j++) { (releves[j] = releves[j] || []).push(cash); } }
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
      averageWorstDrawdown: Number((totalWorstDrawdown / runs * 100).toFixed(1)),
      curve: wantCurve ? releves.map(function (col, i) {
        const tri = col.slice().sort(function (a, b) { return a - b; });
        const q = function (x) { return tri[Math.min(tri.length - 1, Math.max(0, Math.floor(x * tri.length)))]; };
        return {
          bet: Math.round((i + 1) * every),
          p05: Number(q(0.05).toFixed(2)),
          p50: Number(q(0.5).toFixed(2)),
          p95: Number(q(0.95).toFixed(2))
        };
      }) : null
    };
  }


  // ---------------------------------------------------------------------
  // FAIR ODDS / EDGE CHECKER (outil 02).
  // Repond a : "cette cote reflete-t-elle la probabilite ?".
  // Tout est derive des deux seules entrees de l'utilisateur - aucune
  // donnee du modele n'est utilisee ici, l'outil marche donc pour un
  // visiteur gratuit sans lui donner quoi que ce soit de premium.
  // ---------------------------------------------------------------------
  function fairOdds(input) {
    var p = number(input && input.probability);
    var o = number(input && input.odds);
    if (!(p > 0 && p < 100)) return null;
    if (!(o > 1)) return null;
    var q = p / 100;
    var implied = 1 / o;                 // probabilite implicite de la cote
    var fair = 1 / q;                    // cote qui rendrait le pari neutre
    var edgePts = (q - implied) * 100;   // ecart en POINTS de probabilite
    // Plus aucune « esperance » (decision de Clement du 30/09/2026) : la cote
    // juste et l'ecart en points seulement.
    return {
      impliedProbability: round(implied * 100, 1),
      estimatedProbability: round(p, 1),
      fairOdds: round(fair, 2),
      marketOdds: round(o, 2),
      edgePoints: round(edgePts, 1),
      favourable: edgePts > 0
    };
  }

  // ---------------------------------------------------------------------
  // RISQUE DE CORRELATION D'UN COMBINE (outil 05).
  // On ne FABRIQUE PAS de coefficient de correlation : le projet n'a aucune
  // donnee de dependance entre marches. On detecte uniquement ce qui est
  // verifiable de facon certaine - plusieurs selections sur le MEME match -
  // et on le signale. Multiplier des probabilites suppose l'independance ;
  // deux marches du meme match ne le sont pas.
  // ---------------------------------------------------------------------
  function comboRisk(selections) {
    var list = Array.isArray(selections) ? selections : [];
    var parMatch = {};
    list.forEach(function (s) {
      var cle = s && s.matchKey != null ? String(s.matchKey) : null;
      if (!cle) return;
      parMatch[cle] = (parMatch[cle] || 0) + 1;
    });
    var groupes = Object.keys(parMatch).filter(function (k) { return parMatch[k] > 1; });
    return {
      selections: list.length,
      sameMatchGroups: groupes.length,
      correlated: groupes.length > 0,
      // Volontairement null : sans donnee de dependance, tout chiffre serait invente.
      correlationCoefficient: null
    };
  }

  function round(v, d) {
    var f = Math.pow(10, d);
    return Math.round(Number(v) * f) / f;
  }

  return{pnl,summarize,scanValue,combo,comboSelections,simulateVariance,fairOdds,comboRisk};
});
