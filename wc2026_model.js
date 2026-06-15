// ═══════════════════════════════════════════════════════
// MODÈLE COUPE DU MONDE 2026 — IASHARK
// Corrections : fuseau horaire, fatigue, normalisation log
// + Marchés neutres basés sur Poisson (over/under/btts/1X/X2)
// + Edge calculé en JS, fourchette de cote 1.40-2.90
// ═══════════════════════════════════════════════════════
const https = require('https');
const {
  WC2026_STADIUMS, FIFA_POINTS, SQUAD_VALUE, SQUAD_VALUE_BY_LINE,
  TOP5_DENSITY, QUALS_XG, WC_EXPERIENCE, HOME_BONUS, ALTITUDE_ADAPTED
} = require('./wc2026_data.js');

// ── Bornes de cote acceptées pour un pari CM ──────────
const WC_COTE_MIN = 1.40;
const WC_COTE_MAX = 2.90;

// ── Edge minimum pour considérer un marché comme "value" ──
// En dessous, on considère que ce n'est pas un signal exploitable
// (le bruit du modèle CM — basé sur du xG de qualifs — est trop
// important pour distinguer un edge de +1-2% d'un edge nul).
const WC_EDGE_MIN = 3; // en points de %

// ── Haversine distance en km ──────────────────────────
function haversine(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2-lat1)*Math.PI/180;
  const dLng = (lng2-lng1)*Math.PI/180;
  const a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*
            Math.sin(dLng/2)*Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Fatigue logistique ────────────────────────────────
// Correction Gemini : fuseau horaire réel (tz) et non longitude/15
function calcFatigueLogistique(stade1, stade2, joursRecup) {
  if(!stade1||!stade2) return { score: 0, km: 0, jours: joursRecup||3 };
  const s1 = WC2026_STADIUMS[stade1];
  const s2 = WC2026_STADIUMS[stade2];
  if(!s1||!s2) return { score: 0, km: 0, jours: joursRecup||3 };

  const km = haversine(s1.lat, s1.lng, s2.lat, s2.lng);

  // Distance
  let scoreKm = 0;
  if(km > 4000)      scoreKm = 100;
  else if(km > 3000) scoreKm = 80;
  else if(km > 2000) scoreKm = 60;
  else if(km > 1000) scoreKm = 40;
  else if(km > 500)  scoreKm = 20;
  else               scoreKm = 5;

  // Fuseau horaire RÉEL (correction Gemini — pas longitude/15)
  const fuseauDiff = Math.abs((s1.tz||0) - (s2.tz||0));
  const scoreJetlag = Math.min(40, fuseauDiff * 10);

  // Jours de récupération
  let scoreRecup = 0;
  if(joursRecup <= 3)      scoreRecup = 40;
  else if(joursRecup <= 4) scoreRecup = 25;
  else if(joursRecup <= 5) scoreRecup = 10;
  else                     scoreRecup = 0;

  const total = Math.min(100, Math.round(scoreKm*0.5 + scoreJetlag*0.2 + scoreRecup*0.3));
  return { score: total, km: Math.round(km), jours: joursRecup||3, stade1, stade2 };
}

// ── Malus altitude ────────────────────────────────────
// Correction Gemini : Azteca 2240m, Guadalajara 1566m
function calcAltitudeMalus(stadeName, teamName) {
  const s = WC2026_STADIUMS[stadeName];
  if(!s) return 0;
  if(s.alt <= 800) return 0;  // Altitude normale
  if(ALTITUDE_ADAPTED.includes(teamName)) return 0; // Équipe acclimatée
  // Malus progressif selon altitude
  if(s.alt > 2000) return 15; // Azteca → -15% force
  if(s.alt > 1500) return 8;  // Guadalajara → -8%
  if(s.alt > 800)  return 3;  // Monterrey → -3%
  return 0;
}

// ── Score modèle par équipe ───────────────────────────
// Correction Gemini : normalisation logarithmique valeur marchande
function calcTeamScore(teamName, phase, stadeName) {
  const isElim = phase === 'elimination';

  const fifa   = FIFA_POINTS[teamName]  || 1400;
  const valeur = SQUAD_VALUE[teamName]  || 50;
  const top5   = TOP5_DENSITY[teamName] || 30;
  const xg     = QUALS_XG[teamName]     || { xg_for: 1.2, xg_against: 1.1 };
  const wcExp  = WC_EXPERIENCE[teamName]|| 5;

  // Normalisation
  const normFifa   = Math.min(100, (fifa - 1200) / 7);
  // Correction Gemini : loi de puissance, plafond 850M€
  const normValeur = Math.min(100, Math.pow(valeur / 850, 0.7) * 100);
  const normXG     = Math.min(100, (xg.xg_for - xg.xg_against + 2) * 25);
  const normExp    = Math.min(100, wcExp * 5);

  // Poids selon la phase
  let score;
  if(!isElim) {
    score = normFifa   * 0.15 +
            normValeur * 0.25 +
            normXG     * 0.20 +
            top5       * 0.20 +
            normExp    * 0.10;
  } else {
    score = normFifa   * 0.05 +
            normValeur * 0.30 +
            normXG     * 0.15 +
            top5       * 0.20 +
            normExp    * 0.20;
  }

  // Bonus pays hôte (correction Gemini)
  if(stadeName) {
    const stade = WC2026_STADIUMS[stadeName];
    if(stade && HOME_BONUS[teamName] && stade.country === (
      teamName === 'USA' ? 'USA' :
      teamName === 'Mexico' ? 'Mexico' :
      teamName === 'Canada' ? 'Canada' : null
    )) {
      score = score * (1 + HOME_BONUS[teamName]/100);
    }
  }

  return {
    total: Math.round(Math.min(100, score) * 10) / 10,
    details: {
      fifa_pts: fifa, fifa_norm: Math.round(normFifa),
      valeur_m: valeur, valeur_norm: Math.round(normValeur),
      top5_pct: top5,
      xg_for: xg.xg_for, xg_against: xg.xg_against,
      xg_diff: Math.round((xg.xg_for - xg.xg_against)*100)/100,
      xg_norm: Math.round(normXG),
      wc_exp: wcExp, exp_norm: Math.round(normExp),
    }
  };
}

// ── Probabilités match ────────────────────────────────
// Correction Gemini : fatigue augmente probN au lieu de s'annuler
function calcMatchProbs(homeTeam, awayTeam, phase, fatigueHome, fatigueAway, stadeName) {
  const scoreH = calcTeamScore(homeTeam, phase, stadeName);
  const scoreA = calcTeamScore(awayTeam, phase, stadeName);

  // Malus altitude
  const altMalusH = calcAltitudeMalus(stadeName, homeTeam);
  const altMalusA = calcAltitudeMalus(stadeName, awayTeam);

  // Appliquer fatigue + altitude
  const fH = fatigueHome ? fatigueHome.score : 0;
  const fA = fatigueAway ? fatigueAway.score : 0;
  const adjH = scoreH.total * (1 - fH/500) * (1 - altMalusH/100);
  const adjA = scoreA.total * (1 - fA/500) * (1 - altMalusA/100);

  const total = adjH + adjA;
  let probH = adjH / total;
  let probA = adjA / total;

  let probN = 0;
  if(phase !== 'elimination') {
    const ecart = Math.abs(probH - probA);
    // Correction Gemini : fatigue cumulée augmente la probabilité de nul
    const fatigueCumulee = (fH + fA) / 200;
    probN = Math.max(0.18, 0.32 - ecart * 0.7 + fatigueCumulee * 0.1);
    probH = probH * (1 - probN);
    probA = probA * (1 - probN);
  }

  return {
    p1: Math.round(probH * 100),
    pN: Math.round(probN * 100),
    p2: Math.round(probA * 100),
    scoreH, scoreA,
    fatigueH: fH, fatigueA: fA,
    altMalusH, altMalusA,
  };
}

// ── Dépendance au buteur ──────────────────────────────
function calcDependanceStar(goals_star, goals_total) {
  if(!goals_total) return null;
  const ratio = goals_star / goals_total;
  return {
    ratio: Math.round(ratio * 100),
    risque: ratio > 0.40 ? 'ÉLEVÉ' : ratio > 0.25 ? 'MODÉRÉ' : 'FAIBLE',
    label: ratio > 0.40 ? `Ultra-dépendant d'un buteur (${Math.round(ratio*100)}% des buts)` : null
  };
}

// ── Poisson helpers (mêmes formules que le pipeline foot) ─────────
function poissonProb(lambda, k) {
  if(lambda<=0) return k===0?1:0;
  let logFact = 0;
  for(let i=2;i<=k;i++) logFact += Math.log(i);
  const logP = -lambda + k*Math.log(lambda) - logFact;
  return Math.exp(logP);
}

// Calcule les probas Over/Under 2.5 et BTTS depuis 2 lambdas (xG attendus)
// + le score le plus probable (mode de la matrice Poisson) pour score_central
function calcPoissonMarketProbs(lambdaH, lambdaA) {
  const mat = [];
  for(let h=0;h<=8;h++){
    mat[h]=[];
    for(let a=0;a<=8;a++) mat[h][a]=poissonProb(lambdaH,h)*poissonProb(lambdaA,a);
  }
  let over25=0, under25=0, bttsY=0, bttsN=0;
  let bestP=-1, bestH=0, bestA=0;
  for(let h=0;h<=8;h++) for(let a=0;a<=8;a++){
    const p=mat[h][a];
    if(h+a>2.5) over25+=p; else under25+=p;
    if(h>0&&a>0) bttsY+=p; else bttsN+=p;
    if(p>bestP){bestP=p;bestH=h;bestA=a;}
  }
  return {
    over25: Math.round(over25*100),
    under25: Math.round(under25*100),
    bttsY: Math.round(bttsY*100),
    bttsN: Math.round(bttsN*100),
    score_central: bestH+'-'+bestA,
  };
}

// ── Logique marchés WC — version neutre ───────────────────────────
// Produit pour chaque marché : prob_modele (continue, via Poisson + 1X/X2 du moteur)
// et edge = prob_modele - 1/cote, filtré sur la fourchette WC_COTE_MIN-WC_COTE_MAX.
// Aucun marché n'est favorisé a priori : même formule d'edge pour les 6.
function calcWCMarkets(homeTeam, awayTeam, probs) {
  const xgH = QUALS_XG[homeTeam] || { xg_for: 1.2, xg_against: 1.1 };
  const xgA = QUALS_XG[awayTeam] || { xg_for: 1.2, xg_against: 1.1 };
  const vH  = SQUAD_VALUE_BY_LINE[homeTeam] || { att: 50, mid: 50, def: 50 };
  const vA  = SQUAD_VALUE_BY_LINE[awayTeam] || { att: 50, mid: 50, def: 50 };

  const offCombined = xgH.xg_for + xgA.xg_for;
  const defAvg = (xgH.xg_against + xgA.xg_against) / 2;

  // Lambdas attendus pour le match = moyenne entre "ce que l'équipe marque"
  // et "ce que l'adversaire concède", borné à un minimum réaliste.
  const lambdaH = Math.max(0.4, (xgH.xg_for + xgA.xg_against) / 2);
  const lambdaA = Math.max(0.4, (xgA.xg_for + xgH.xg_against) / 2);

  const poissonMkt = calcPoissonMarketProbs(lambdaH, lambdaA);

  return {
    off_combined: Math.round(offCombined*100)/100,
    def_avg: Math.round(defAvg*100)/100,
    lambda_h: Math.round(lambdaH*100)/100,
    lambda_a: Math.round(lambdaA*100)/100,
    val_att_h: vH.att, val_def_h: vH.def,
    val_att_a: vA.att, val_def_a: vA.def,
    // Probabilités continues par marché — base neutre pour le calcul d'edge
    prob_over25: poissonMkt.over25,
    prob_under25: poissonMkt.under25,
    prob_btts_oui: poissonMkt.bttsY,
    prob_btts_non: poissonMkt.bttsN,
    prob_dc1x: probs.p1 + probs.pN,
    prob_dcx2: probs.p2 + probs.pN,
    // Champs utilitaires pour compléter matchObj (alignés avec le pipeline foot)
    score_central: poissonMkt.score_central,
    po25: poissonMkt.over25,
    btts: poissonMkt.bttsY,
  };
}

// ── Edge neutre par marché ─────────────────────────────────────────
// Pour chaque marché : edge = prob_modele/100 - 1/cote (si cote dans la fourchette).
// Retourne la liste triée : edge décroissant, puis (à edge proche) proba la plus
// haute en premier — privilégie le "plus sûr" parmi les value bets.
function calcWCEdges(markets, cotes) {
  const candidats = [
    { marche: 'Over 2.5',  prob: markets.prob_over25,  cote: cotes.over25 },
    { marche: 'Under 2.5', prob: markets.prob_under25, cote: cotes.under25 },
    { marche: 'BTTS Oui',  prob: markets.prob_btts_oui, cote: cotes.btts_oui },
    { marche: 'BTTS Non',  prob: markets.prob_btts_non, cote: cotes.btts_non },
    { marche: 'DC 1X',     prob: markets.prob_dc1x,     cote: cotes.dc1x },
    { marche: 'DC X2',     prob: markets.prob_dcx2,     cote: cotes.dcx2 },
  ];

  const valides = candidats
    .map(function(c){
      const cote = parseFloat(c.cote);
      if(!c.cote || c.cote==='--' || isNaN(cote)) return null;
      if(cote < WC_COTE_MIN || cote > WC_COTE_MAX) return null;
      const probDec = c.prob/100;
      const edge = probDec - (1/cote);
      const edgePct = Math.round(edge*1000)/10; // en %
      return {
        marche: c.marche,
        cote: cote.toFixed(2),
        prob_modele: c.prob,
        edge: edgePct,
        value: edgePct >= WC_EDGE_MIN, // au-dessus du seuil minimum exploitable
      };
    })
    .filter(Boolean);

  // Tri neutre : edge décroissant. À edge proche (<1 point), la proba la plus
  // haute (= le plus "sûr") passe devant — pas de favoritisme de marché.
  valides.sort(function(a,b){
    if(Math.abs(b.edge - a.edge) < 1) return b.prob_modele - a.prob_modele;
    return b.edge - a.edge;
  });

  return valides;
}

// ── Prompt Claude WC ──────────────────────────────────
// Version neutre : aucun marché n'est priorisé par défaut, le choix se fait
// sur l'edge calculé en JS (calcWCEdges) dans la fourchette 1.40-2.90.
function buildWCPrompt(data) {
  const {
    home, away, league, date, stade, phase, probs, markets,
    fatigueH, fatigueA, h2h, absences,
    tournoi_xg_h, tournoi_xg_a,
    pinnacle_p1, pinnacle_pN, pinnacle_p2,
    dc1x, dcx2, over25, under25, btts_oui, btts_non,
  } = data;

  const isElim = phase === 'elimination';
  const phaseLabel = isElim ? 'PHASE ÉLIMINATOIRE' : 'PHASE DE GROUPES';
  const mkt = markets || {};

  const cotes = { dc1x, dcx2, over25, under25, btts_oui, btts_non };
  const edges = calcWCEdges(mkt, cotes);

  const edgesLines = edges.length
    ? edges.map(function(e){
        return e.marche+': cote '+e.cote+' | prob modèle '+e.prob_modele+'% | edge '+(e.edge>=0?'+':'')+e.edge+'%'+(e.value?' ✅ VALUE (>= seuil '+WC_EDGE_MIN+'%)':'');
      }).join('\n')
    : 'Aucun marché avec une cote entre '+WC_COTE_MIN.toFixed(2)+' et '+WC_COTE_MAX.toFixed(2)+'.';

  const meilleur = edges.length ? edges[0] : null;
  const aUnValue = edges.some(function(e){ return e.value; });

  return `Tu es l'ingénieur IA principal de iashark.com. Analyse les données du modèle et génère un verdict JSON strict.

=== CONTEXTE MATCH ===
${home} vs ${away} — Coupe du Monde 2026 (${phaseLabel})
Stade: ${stade} | Date: ${date}

=== SCORES MODÈLE IASHARK ===
${home}: Force ${probs.scoreH.total}/100 | Fatigue ${probs.fatigueH}/100 (${fatigueH?fatigueH.km:0}km, ${fatigueH?fatigueH.jours:3}j récup)${probs.altMalusH>0?' | ⚠️ Malus altitude -'+probs.altMalusH+'%':''}
${away}: Force ${probs.scoreA.total}/100 | Fatigue ${probs.fatigueA}/100 (${fatigueA?fatigueA.km:0}km, ${fatigueA?fatigueA.jours:3}j récup)${probs.altMalusA>0?' | ⚠️ Malus altitude -'+probs.altMalusA+'%':''}

=== PROBABILITÉS MOTEUR (résultat) ===
${home}: ${probs.p1}%${!isElim?' | Nul: '+probs.pN+'%':''} | ${away}: ${probs.p2}%

=== ANALYSE ATTAQUE / DÉFENSE ===
${home}:
  Valeur attaque: ${mkt.val_att_h}M€ | Valeur défense: ${mkt.val_def_h}M€
  xG généré qualifs: ${probs.scoreH.details.xg_for} / xG concédé: ${probs.scoreH.details.xg_against}
  FIFA: ${probs.scoreH.details.fifa_pts}pts | Top5: ${probs.scoreH.details.top5_pct}% | Exp CM: ${probs.scoreH.details.wc_exp} joueurs

${away}:
  Valeur attaque: ${mkt.val_att_a}M€ | Valeur défense: ${mkt.val_def_a}M€
  xG généré qualifs: ${probs.scoreA.details.xg_for} / xG concédé: ${probs.scoreA.details.xg_against}
  FIFA: ${probs.scoreA.details.fifa_pts}pts | Top5: ${probs.scoreA.details.top5_pct}% | Exp CM: ${probs.scoreA.details.wc_exp} joueurs
${tournoi_xg_h?`
xG dans ce tournoi — ${home}: +${tournoi_xg_h.for}/-${tournoi_xg_h.against} | ${away}: +${tournoi_xg_a.for}/-${tournoi_xg_a.against}`:''}

=== MODÈLE OFFENSIF/DÉFENSIF (base du calcul Poisson) ===
xG offensif combiné: ${mkt.off_combined} | xG défensif moyen concédé: ${mkt.def_avg}
Lambdas Poisson estimés pour ce match: ${home} ${mkt.lambda_h} buts | ${away} ${mkt.lambda_a} buts

=== TOUS LES MARCHÉS AVEC EDGE CALCULÉ (cote entre ${WC_COTE_MIN.toFixed(2)} et ${WC_COTE_MAX.toFixed(2)}) ===
Seuil minimum d'edge pour qu'un marché soit jouable: ${WC_EDGE_MIN}%
${edgesLines}
${meilleur?`
Meilleur edge actuel: ${meilleur.marche} (cote ${meilleur.cote}, edge ${meilleur.edge>=0?'+':''}${meilleur.edge}%, prob modèle ${meilleur.prob_modele}%)${aUnValue?'':' — sous le seuil minimum, donc PAS une value bet'}`:''}

=== H2H & ABSENCES ===
H2H officiel: ${h2h||'Pas d historique recent en competition officielle'}
Absences confirmées: ${absences||'Aucune absence majeure confirmée'}

=== VALIDATION PINNACLE ===
${pinnacle_p1?`${home}: ${pinnacle_p1}% | Nul: ${pinnacle_pN||'N/A'}% | ${away}: ${pinnacle_p2}%
Alignement: ${Math.abs(probs.p1-pinnacle_p1)<=10?'✅ Cohérent':'⚠️ DIVERGENCE >10% → passe ton tour sauf explication logistique'}`:'Pinnacle non disponible — baser la décision sur le modèle seul'}

=== RÈGLES ABSOLUES (NEUTRALITÉ) ===
1. COTE ENTRE ${WC_COTE_MIN.toFixed(2)} ET ${WC_COTE_MAX.toFixed(2)} ET EDGE >= ${WC_EDGE_MIN}% (marqué ✅ VALUE ci-dessus) — c'est la condition pour jouer. Si la liste "TOUS LES MARCHÉS AVEC EDGE CALCULÉ" est vide OU si AUCUN marché n'est marqué ✅ VALUE → passe_ton_tour = true. Un edge positif mais inférieur à ${WC_EDGE_MIN}% n'est PAS suffisant pour jouer.
2. NEUTRALITÉ TOTALE ENTRE MARCHÉS : Over 2.5, Under 2.5, BTTS Oui, BTTS Non, DC 1X, DC X2 sont à traiter exactement à égalité. Tu ne dois JAMAIS préférer un type de marché par défaut (par ex. ne pas privilégier Over/BTTS sur DC, ni l'inverse). Le seul critère est l'edge calculé ci-dessus.
3. CHOIX DU MARCHÉ : parmi les marchés ✅ VALUE, prends celui avec le edge le plus élevé. Si deux marchés ✅ VALUE ont un edge proche (écart < 1 point), choisis celui avec la probabilité modèle la plus haute (= le plus sûr).
4. Fatigue >60 → l'équipe fatiguée marque moins → cela doit déjà être reflété dans les lambdas/probabilités ci-dessus, ne pas appliquer de correction supplémentaire.
5. Altitude >1500m + équipe non acclimatée → idem, déjà reflété dans les probabilités, ne pas dupliquer la correction.
6. Pinnacle diverge >10% du modèle → passe_ton_tour = true SAUF si fatigue ou altitude l'explique clairement.
7. ${isElim?'ÉLIMINATION: qualifier_h + qualifier_a obligatoires. Expérience CM décisive aux TAB':'3ème journée: équipe déjà qualifiée → rotation → décote attaque -30% (ajuste ta confiance en conséquence)'}
Tu peux ajuster les probabilités de ±5% max si absences majeures le justifient — recalcule alors mentalement l'edge avant de répondre.
RÈGLE ABSOLUE: analyse_card, conseil, contexte, facteur_x, scenario, scenario_15min TOUJOURS remplis même si passe_ton_tour=true.

Réponds UNIQUEMENT en JSON valide sans markdown:
{
  "passe_ton_tour": false,
  "confiance": 0.0,
  "pari_rec": "",
  "cote_rec": "",
  "marche": "Over 2.5|Under 2.5|BTTS Oui|BTTS Non|DC 1X|DC X2",
  "risque": "FAIBLE|MODERE|ELEVE",
  "verdict_shark": "1 phrase avec stat clé chiffrée",
  "analyse_card": "[TOUJOURS REMPLI] 2-3 phrases attaque/défense basées sur les données",
  "conseil": "[TOUJOURS REMPLI] 1 directive directe",
  "contexte": "[TOUJOURS REMPLI] enjeux groupe ou bracket",
  "facteur_x": "[TOUJOURS REMPLI] le signal chiffré décisif",
  "score_central": "${mkt.score_central||'?-?'}",
  "p1": ${probs.p1}, "pN": ${probs.pN}, "p2": ${probs.p2},
  "po25": ${mkt.po25||0}, "btts": ${mkt.btts||0},
  "qualification_h": ${isElim?0:'null'},
  "qualification_a": ${isElim?0:'null'},
  "edge": "",
  "vbet": "OUI|NON",
  "kelly": "",
  "scenario": {"phase1":"[TOUJOURS REMPLI]","phase2":"[TOUJOURS REMPLI]","phase3":"[TOUJOURS REMPLI]"},
  "scenario_15min": [
    {"t":"0-15min","prob":8,"txt":"[TOUJOURS REMPLI]"},
    {"t":"15-30min","prob":12,"txt":"[TOUJOURS REMPLI]"},
    {"t":"30-45min","prob":10,"txt":"[TOUJOURS REMPLI]"},
    {"t":"45-60min","prob":15,"txt":"[TOUJOURS REMPLI]"},
    {"t":"60-75min","prob":18,"txt":"[TOUJOURS REMPLI]"},
    {"t":"75-90min","prob":20,"txt":"[TOUJOURS REMPLI]"}
  ]
}`;
}


module.exports = {
  calcFatigueLogistique, calcTeamScore, calcMatchProbs,
  calcDependanceStar, calcWCMarkets, calcWCEdges, calcPoissonMarketProbs,
  buildWCPrompt, haversine, calcAltitudeMalus,
  WC_COTE_MIN, WC_COTE_MAX, WC_EDGE_MIN
};
