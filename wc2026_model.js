// ═══════════════════════════════════════════════════════
// MODÈLE COUPE DU MONDE 2026 — IASHARK
// Corrections : fuseau horaire, fatigue, normalisation log
// ═══════════════════════════════════════════════════════
const https = require('https');
const {
  WC2026_STADIUMS, FIFA_POINTS, SQUAD_VALUE, SQUAD_VALUE_BY_LINE,
  TOP5_DENSITY, QUALS_XG, WC_EXPERIENCE, HOME_BONUS, ALTITUDE_ADAPTED
} = require('./wc2026_data.js');

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

// ── Logique marchés WC ───────────────────────────────────────────
function calcWCMarkets(homeTeam, awayTeam, probs) {
  const xgH = QUALS_XG[homeTeam] || { xg_for: 1.2, xg_against: 1.1 };
  const xgA = QUALS_XG[awayTeam] || { xg_for: 1.2, xg_against: 1.1 };
  const vH  = SQUAD_VALUE_BY_LINE[homeTeam] || { att: 50, mid: 50, def: 50 };
  const vA  = SQUAD_VALUE_BY_LINE[awayTeam] || { att: 50, mid: 50, def: 50 };

  const offCombined = xgH.xg_for + xgA.xg_for;
  const defAvg = (xgH.xg_against + xgA.xg_against) / 2;
  const defStrengthH = vH.def / Math.max(vA.att, 1);
  const defStrengthA = vA.def / Math.max(vH.att, 1);
  const ecart = Math.abs(probs.p1 - probs.p2);
  const favori = probs.p1 > probs.p2 ? 'home' : 'away';

  // Signal Over/Under
  let overSignal = 0;
  if(offCombined > 2.8)     overSignal += 2;
  if(defAvg > 1.0)          overSignal += 1;
  if(xgH.xg_against > 1.1) overSignal += 1;
  if(xgA.xg_against > 1.1) overSignal += 1;
  if(defStrengthH > 1.5)    overSignal -= 1;
  if(defStrengthA > 1.5)    overSignal -= 1;
  if(offCombined < 2.2)     overSignal -= 2;

  // Signal BTTS
  let bttsSignal = 0;
  if(xgH.xg_for > 1.4 && xgA.xg_for > 1.2) bttsSignal += 2;
  if(xgH.xg_against > 0.95) bttsSignal += 1;
  if(xgA.xg_against > 0.95) bttsSignal += 1;
  if(xgH.xg_for < 1.1 || xgA.xg_for < 1.1) bttsSignal -= 2;

  // Marché recommandé — cote attendue 1.60-2.20
  let market_rec = null;
  if(overSignal >= 2)       market_rec = 'Over 2.5';
  else if(overSignal <= -2) market_rec = 'Under 2.5';
  else if(bttsSignal >= 3)  market_rec = 'BTTS Oui';
  else if(bttsSignal <= -1) market_rec = 'BTTS Non';
  else if(ecart > 20)       market_rec = favori==='home' ? 'DC 1X' : 'DC X2';

  return {
    over_signal: overSignal, btts_signal: bttsSignal,
    dc_signal: ecart > 20, favori,
    off_combined: Math.round(offCombined*100)/100,
    def_avg: Math.round(defAvg*100)/100,
    val_att_h: vH.att, val_def_h: vH.def,
    val_att_a: vA.att, val_def_a: vA.def,
    market_rec
  };
}

// ── Prompt Claude WC ──────────────────────────────────
// Correction Gemini : pas d'injection JSON en fin de prompt
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

  // Choisir les cotes selon le marché recommandé
  const mkCotes = {
    'Over 2.5':  over25   && over25!=='--'  ? over25   : null,
    'Under 2.5': under25  && under25!=='--' ? under25  : null,
    'BTTS Oui':  btts_oui && btts_oui!=='--'? btts_oui : null,
    'BTTS Non':  btts_non && btts_non!=='--'? btts_non : null,
    'DC 1X':     dc1x     && dc1x!=='--'    ? dc1x     : null,
    'DC X2':     dcx2     && dcx2!=='--'    ? dcx2     : null,
  };

  return `Tu es l'ingénieur IA principal de iashark.com. Analyse les données du modèle et génère un verdict JSON strict.

=== CONTEXTE MATCH ===
${home} vs ${away} — Coupe du Monde 2026 (${phaseLabel})
Stade: ${stade} | Date: ${date}

=== SCORES MODÈLE IASHARK ===
${home}: Force ${probs.scoreH.total}/100 | Fatigue ${probs.fatigueH}/100 (${fatigueH?fatigueH.km:0}km, ${fatigueH?fatigueH.jours:3}j récup)${probs.altMalusH>0?' | ⚠️ Malus altitude -'+probs.altMalusH+'%':''}
${away}: Force ${probs.scoreA.total}/100 | Fatigue ${probs.fatigueA}/100 (${fatigueA?fatigueA.km:0}km, ${fatigueA?fatigueA.jours:3}j récup)${probs.altMalusA>0?' | ⚠️ Malus altitude -'+probs.altMalusA+'%':''}

=== PROBABILITÉS MOTEUR ===
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

=== SIGNAUX MARCHÉS (calculés par le modèle) ===
xG offensif combiné: ${mkt.off_combined} ${mkt.off_combined>2.8?'→ SIGNAL OVER FORT':mkt.off_combined<2.2?'→ SIGNAL UNDER FORT':'→ neutre'}
xG défensif moyen concédé: ${mkt.def_avg} ${mkt.def_avg>1.0?'→ défenses perméables':'→ défenses solides'}
Signal Over/Under: ${mkt.over_signal>0?'+'+mkt.over_signal+' (Over)':mkt.over_signal+'(Under)'}
Signal BTTS: ${mkt.btts_signal>0?'+'+mkt.btts_signal+' (Oui)':mkt.btts_signal+' (Non)'}
Marché recommandé par le modèle: ${mkt.market_rec||'Aucun signal clair'}

=== COTES DISPONIBLES ===
Over 2.5: ${mkCotes['Over 2.5']||'N/A'} | Under 2.5: ${mkCotes['Under 2.5']||'N/A'}
BTTS Oui: ${mkCotes['BTTS Oui']||'N/A'} | BTTS Non: ${mkCotes['BTTS Non']||'N/A'}
DC 1X: ${mkCotes['DC 1X']||'N/A'} | DC X2: ${mkCotes['DC X2']||'N/A'}

=== H2H & ABSENCES ===
H2H officiel: ${h2h||'Pas d historique recent en competition officielle'}
Absences confirmées: ${absences||'Aucune absence majeure confirmée'}

=== VALIDATION PINNACLE ===
${pinnacle_p1?`${home}: ${pinnacle_p1}% | Nul: ${pinnacle_pN||'N/A'}% | ${away}: ${pinnacle_p2}%
Alignement: ${Math.abs(probs.p1-pinnacle_p1)<=10?'✅ Cohérent':'⚠️ DIVERGENCE >10% → passe ton tour sauf explication logistique'}`:'Pinnacle non disponible — baser la décision sur le modèle seul'}

=== RÈGLES ABSOLUES ===
1. COTE MINIMUM 1.60 — si aucun marché n'atteint 1.60, passe_ton_tour = true
2. MARCHÉ PRIORITAIRE : Over/Under 2.5 et BTTS en premier — DC en dernier recours
3. Si signal Over ET signal BTTS Oui → choisir Over 2.5 (plus de valeur)
4. Fatigue >60 → l'équipe fatiguée marque moins → renforce Under ou BTTS Non
5. Altitude >1500m + équipe non acclimatée → renforce Under (fatigue physique)
6. Pinnacle diverge >10% → passe_ton_tour = true SAUF si fatigue ou altitude l'explique
7. ${isElim?'ÉLIMINATION: qualifier_h + qualifier_a obligatoires. Expérience CM décisive aux TAB':'3ème journée: équipe déjà qualifiée → rotation → décote attaque -30%'}
Tu peux ajuster les probabilités de ±5% max si absences majeures le justifient.

Réponds UNIQUEMENT en JSON valide sans markdown:
{
  "passe_ton_tour": false,
  "confiance": 0.0,
  "pari_rec": "",
  "cote_rec": "",
  "marche": "Over 2.5|Under 2.5|BTTS Oui|BTTS Non|DC 1X|DC X2",
  "risque": "FAIBLE|MODERE|ELEVE",
  "verdict_shark": "1 phrase avec stat clé chiffrée",
  "analyse_card": "2-3 phrases attaque/défense basées sur les données",
  "conseil": "1 directive directe",
  "contexte": "enjeux groupe ou bracket",
  "facteur_x": "le signal chiffré décisif",
  "p1": 0, "pN": 0, "p2": 0,
  "qualification_h": ${isElim?0:'null'},
  "qualification_a": ${isElim?0:'null'},
  "edge": "",
  "vbet": "OUI|NON",
  "kelly": ""
}`;
}


module.exports = {
  calcFatigueLogistique, calcTeamScore, calcMatchProbs,
  calcDependanceStar, calcWCMarkets, buildWCPrompt,
  haversine, calcAltitudeMalus
};
