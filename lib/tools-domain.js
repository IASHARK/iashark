(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.IasharkToolsDomain=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){'use strict';
  const number=v=>Number.isFinite(Number(v))?Number(v):null;
  // 21/10/2026 : calculateStake (calculateur de mise) et simulateVariance (simulateur de
  // capital) retires avec leurs outils (regle de Clement : ni mise, ni capital, ni esperance).
  // Meme jour : pnl() et le ROI / profit-perte du journal retires a leur tour. Le journal
  // ne compte plus que des paris : notes, gagnes, perdus, taux de reussite. Les anciennes
  // lignes de betting_decisions gardent leurs colonnes stake / result_pnl : elles sont
  // simplement ignorees ici, jamais lues ni affichees.
  function summarize(decisions){
    const rows=Array.isArray(decisions)?decisions.filter(x=>x&&typeof x==='object'):[];
    const count=status=>rows.filter(x=>x.status===status).length;
    const won=count('won'),lost=count('lost'),voided=count('void');
    const decided=won+lost; // un pari annule (void) n'est ni gagne ni perdu
    return{total:rows.length,won,lost,void:voided,pending:rows.length-won-lost-voided,decided,
      winRate:decided?Number((won/decided*100).toFixed(1)):null};
  }

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
  // mais a 36%. On expose la probabilite reelle du combine, sa cote juste
  // (1 / probabilite) et la cote totale proposee, puis on dit laquelle des
  // deux cotes est la plus haute. Ni esperance ni montant (21/10/2026).
  function combo(selections) {
    const rows = (Array.isArray(selections) ? selections : [])
      .map(s => ({ probability: number(s && s.probability), odds: number(s && s.odds), label: (s && s.label) || '' }))
      .filter(s => s.probability > 0 && s.probability <= 100 && s.odds > 1);
    if (rows.length < 2) return null;
    const probability = rows.reduce((acc, s) => acc * (s.probability / 100), 1);
    const bookOdds = Number(rows.reduce((acc, s) => acc * s.odds, 1).toFixed(2));
    const fairOdds = probability > 0 ? Number((1 / probability).toFixed(2)) : null;
    // Comparaison sur les cotes arrondies, celles que la page affiche : le texte
    // ne contredit jamais les deux chiffres poses a cote.
    const comparison = fairOdds === null ? null : bookOdds > fairOdds ? 'above' : bookOdds < fairOdds ? 'below' : 'equal';
    return {
      legs: rows.length,
      probability: Number((probability * 100).toFixed(2)),
      fairOdds,
      bookOdds,
      comparison
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
    // Pas d'esperance (21/10/2026, regle de Clement) : l'ecart en points suffit.
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

  return{summarize,scanValue,combo,fairOdds,comboRisk};
});
