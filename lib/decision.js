"use strict";
// Decisions deterministes qui appartenaient auparavant au LLM (choix du
// marche, "confiance", niveau de risque) - MASTER V2.1 §1.3/§7.8/§10.AJ :
// "Claude/Anthropic ne peut jamais creer/modifier: probabilite [...]
// resultat de marche [...] score de modele". Extrait pour etre reellement
// testable (voir tests/decision.test.js) et pour que le pipeline appelle
// ces fonctions AVANT le LLM, qui ne recoit plus que le resultat pour le
// commenter en texte.

// Choisit deterministement le marche a mettre en avant : celui de
// probabilite modele la plus elevee parmi les marches jouables (deja
// filtres a cote>=1.50 en amont). Remplace l'ancienne selection libre par
// le LLM (an.pari_rec).
function pickMarketDeterministic(allMarkets) {
  if (!allMarkets || !allMarkets.length) return null;
  return allMarkets.reduce((best, m) => (m.prob > (best ? best.prob : -1) ? m : best), null);
}

// Niveau de risque deterministe a partir de la cote du marche choisi. Reprend
// la regle qui etait jusqu'ici seulement suggeree au LLM dans le prompt
// ("FAIBLE si cote<1.75 | MODERE 1.75-2.20 | ELEVE sinon"), maintenant
// appliquee en code, pas laissee a l'appreciation du LLM.
function computeRiskLabel(cote) {
  const c = parseFloat(cote);
  if (!c || isNaN(c)) return "MODERE";
  if (c < 1.75) return "FAIBLE";
  if (c <= 2.2) return "MODERE";
  return "ELEVE";
}

// Model Agreement (§10.AB) : mesure la divergence entre les probabilites
// des differents modeles (Poisson/Dixon-Coles/Monte-Carlo) pour la MEME
// issue. Un fort accord ne signifie PAS "plus de chances de gagner" - juste
// que les modeles convergent (§11.2, avertissement explicite a respecter
// dans l'UI qui consomme ce champ).
function computeModelAgreement(probs) {
  const valid = (probs || []).filter((p) => p != null && !isNaN(p));
  if (valid.length < 2) return { label: "Faible", stdDev: null, n: valid.length };
  const mean = valid.reduce((s, p) => s + p, 0) / valid.length;
  const variance = valid.reduce((s, p) => s + Math.pow(p - mean, 2), 0) / valid.length;
  const stdDev = Math.sqrt(variance);
  let label;
  if (stdDev <= 4) label = "Fort";
  else if (stdDev <= 10) label = "Moyen";
  else label = "Faible";
  return { label, stdDev: Math.round(stdDev * 100) / 100, n: valid.length };
}

// Data Quality Score V1 simplifie (§11.1/§10.AA proposent jusqu'a 12
// composants ; cette version couvre ce que le pipeline actuel calcule deja
// reellement, honnetement documentee comme V1, pas la version complete du
// MASTER). 0-100, base sur la presence reelle des sources de donnees pour
// CE match, jamais sur une auto-evaluation du LLM.
function computeDataQualityScore(flags) {
  const weights = {
    hasTeamStatsHome: 15,
    hasTeamStatsAway: 15,
    hasOdds: 20,
    hasInjuries: 10,
    hasH2H: 10,
    hasElo: 15,
    hasLineups: 15,
  };
  let score = 0, maxScore = 0;
  for (const key of Object.keys(weights)) {
    maxScore += weights[key];
    if (flags && flags[key]) score += weights[key];
  }
  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
  let label;
  if (pct >= 70) label = "Élevée";
  else if (pct >= 40) label = "Moyenne";
  else label = "Faible";
  return { score: pct, label };
}

module.exports = { pickMarketDeterministic, computeRiskLabel, computeModelAgreement, computeDataQualityScore };
