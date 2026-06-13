// ═══════════════════════════════════════════════════════
// MODÈLE COUPE DU MONDE 2026 — IASHARK
// Corrections : fuseau horaire, fatigue, normalisation log
// ═══════════════════════════════════════════════════════
const https = require('https');
const {
  WC2026_STADIUMS, FIFA_POINTS, SQUAD_VALUE, TOP5_DENSITY,
  QUALS_XG, WC_EXPERIENCE, HOME_BONUS, ALTITUDE_ADAPTED
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

// ── Prompt Claude WC ──────────────────────────────────
// Correction Gemini : pas d'injection JSON en fin de prompt
function buildWCPrompt(data) {
  const {
    home, away, league, date, stade, phase, probs,
    fatigueH, fatigueA, h2h, absences,
    tournoi_xg_h, tournoi_xg_a,
    pinnacle_p1, pinnacle_pN, pinnacle_p2,
    dc1x, dcx2, over25, dependanceH, dependanceA
  } = data;

  const isElim = phase === 'elimination';
  const phaseLabel = isElim ? 'PHASE ÉLIMINATOIRE' : 'PHASE DE GROUPES';

  return `Tu es l'ingénieur IA principal de iashark.com. Analyse les données de notre modèle et génère un verdict JSON strict.

=== CONTEXTE MATCH ===
${home} vs ${away} — Coupe du Monde 2026 (${phaseLabel})
Stade: ${stade} | Date: ${date}

=== OUTPUTS DU MODÈLE IASHARK ===
Force brute ${home}: ${probs.scoreH.total}/100 | Fatigue: ${probs.fatigueH}/100 (${fatigueH?fatigueH.km:0}km, ${fatigueH?fatigueH.jours:3}j repos)${probs.altMalusH>0?' | Malus altitude: -'+probs.altMalusH+'%':''}
Force brute ${away}: ${probs.scoreA.total}/100 | Fatigue: ${probs.fatigueA}/100 (${fatigueA?fatigueA.km:0}km, ${fatigueA?fatigueA.jours:3}j repos)${probs.altMalusA>0?' | Malus altitude: -'+probs.altMalusA+'%':''}

=== PROBABILITÉS MOTEUR ===
${home}: ${probs.p1}%${!isElim?' | Nul: '+probs.pN+'%':''} | ${away}: ${probs.p2}%

=== SIGNAUX DÉTAILLÉS ===
${home}: FIFA ${probs.scoreH.details.fifa_pts}pts | Valeur ${probs.scoreH.details.valeur_m}M€ | Top5 ${probs.scoreH.details.top5_pct}% | xG qualifs +${probs.scoreH.details.xg_for}/-${probs.scoreH.details.xg_against} | Expérience CM: ${probs.scoreH.details.wc_exp} joueurs
${away}: FIFA ${probs.scoreA.details.fifa_pts}pts | Valeur ${probs.scoreA.details.valeur_m}M€ | Top5 ${probs.scoreA.details.top5_pct}% | xG qualifs +${probs.scoreA.details.xg_for}/-${probs.scoreA.details.xg_against} | Expérience CM: ${probs.scoreA.details.wc_exp} joueurs
${tournoi_xg_h?`\nxG dans ce tournoi — ${home}: +${tournoi_xg_h.for}/-${tournoi_xg_h.against} | ${away}: +${tournoi_xg_a.for}/-${tournoi_xg_a.against}`:''}
${dependanceH&&dependanceH.risque==='ÉLEVÉ'?`\n⚠️ ${home} DÉPENDANCE STAR: ${dependanceH.label}`:''}
${dependanceA&&dependanceA.risque==='ÉLEVÉ'?`\n⚠️ ${away} DÉPENDANCE STAR: ${dependanceA.label}`:''}

=== H2H & ABSENCES ===
H2H compétitions officielles: ${h2h||'Pas d\'historique récent'}
Absences confirmées: ${absences||'Aucune absence majeure'}

=== VALIDATION PINNACLE ===
${pinnacle_p1?`${home}: ${pinnacle_p1}% | Nul: ${pinnacle_pN||'N/A'}% | ${away}: ${pinnacle_p2}%\nAlignement modèle/marché: ${Math.abs(probs.p1-pinnacle_p1)<=10?'✅ Cohérent (écart <10%)':'⚠️ DIVERGENCE >10% — passe ton tour si inexpliqué'}`:'Pinnacle non disponible'}

=== MARCHÉS ===
${dc1x&&dc1x!=='--'?'DC 1X: '+dc1x:'DC 1X: N/A'} | ${dcx2&&dcx2!=='--'?'DC X2: '+dcx2:'DC X2: N/A'} | ${over25&&over25!=='--'?'Over 2.5: '+over25:'Over 2.5: N/A'}

=== RÈGLES CRITIQUES ===
1. Fatigue >60 + voyage côte-à-côte → pénalise l'attaque de cette équipe
2. 3ème journée groupes: équipe déjà qualifiée → rotation (-30% valeur effective)
3. Altitude >1500m → vérifier si équipe non acclimatée (malus déjà appliqué)
4. Divergence Pinnacle >10% → passe_ton_tour sauf explication logistique claire
5. ${isElim?'ÉLIMINATION: exprimer en qualification_h/qualification_a. Tirs au but: favoriser l\'expérience CM':'GROUPES: 1N2 + Over/Under 2.5'}
Tu peux ajuster les probabilités de ±5% maximum si une absence majeure ou la fatigue le justifie.
Cote minimum 1.60. Réponds UNIQUEMENT en JSON valide sans markdown:
{
  "passe_ton_tour": false,
  "confiance": 7.5,
  "pari_rec": "",
  "cote_rec": "1.75",
  "risque": "FAIBLE|MODERE|ELEVE",
  "verdict_shark": "1 phrase avec chiffre clé",
  "analyse_card": "2-3 phrases techniques basées sur les données",
  "conseil": "1 directive directe",
  "contexte": "enjeux du groupe ou bracket",
  "facteur_x": "stat ou fait logistique décisif",
  "p1": 0, "pN": 0, "p2": 0,
  "qualification_h": ${isElim?0:'null'},
  "qualification_a": ${isElim?0:'null'},
  "vbet": "OUI|NON",
  "kelly": "3.5%"
}`;
}

module.exports = {
  calcFatigueLogistique, calcTeamScore, calcMatchProbs,
  calcDependanceStar, buildWCPrompt, haversine, calcAltitudeMalus
};
