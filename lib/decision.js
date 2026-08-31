"use strict";
// Decisions deterministes qui appartenaient auparavant au LLM (choix du
// marche, "confiance", niveau de risque) - MASTER V2.1 §1.3/§7.8/§10.AJ :
// "Claude/Anthropic ne peut jamais creer/modifier: probabilite [...]
// resultat de marche [...] score de modele". Extrait pour etre reellement
// testable (voir tests/decision.test.js) et pour que le pipeline appelle
// ces fonctions AVANT le LLM, qui ne recoit plus que le resultat pour le
// commenter en texte.

// Choisit deterministement le marche a mettre en avant.
//
// Priorite aux marches a EDGE REEL POSITIF (probabilite modele > probabilite
// de marche, marge retiree quand disponible - memes champs prob/marketProb
// deja calcules par le pipeline, jamais une nouvelle source de donnees).
// Publier une "recommandation" sur un marche ou le marche est DEJA plus
// confiant que nous (edge negatif ou nul) n'a aucune justification
// statistique, meme si ce marche a la plus haute probabilite brute du lot -
// ca revient a annoncer une conviction qu'on n'a pas reellement (incoherent
// avec la methode "value bet" documentee ailleurs sur le site, ex.
// blog/guides/value-bet-guide-complet-2026.html). Parmi les marches a edge
// positif, retient celui de plus haute probabilite modele : c'est la
// probabilite - pas l'ampleur de l'edge - qui determine le taux de reussite
// reel des picks publies. Si AUCUN marche n'a d'edge positif (le marche est
// partout au moins aussi bien informe que nous sur cette rencontre), repli
// sur l'ancien comportement (plus haute probabilite brute, sans condition
// d'edge) plutot que de ne rien publier du tout - preserve la couverture du
// produit (chaque match garde une recommandation) sans jamais afficher une
// fausse conviction quand une vraie existe.
function pickMarketDeterministic(allMarkets) {
  if (!allMarkets || !allMarkets.length) return null;
  const valueMarkets = allMarkets.filter((m) => m.marketProb != null && m.prob > m.marketProb);
  const pool = valueMarkets.length ? valueMarkets : allMarkets;
  return pool.reduce((best, m) => (m.prob > (best ? best.prob : -1) ? m : best), null);
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

// Fiabilite (§11.2 et retour utilisateur explicite : "la confiance doit
// rester separee et provenir de choses mesurables"). Ce n'est PAS une
// probabilite - jamais une copie de model_probability sous un autre nom.
// Composite a partir de trois signaux reellement mesurables aujourd'hui :
//   - model_agreement : accord entre Poisson/Dixon-Coles/Monte-Carlo
//   - data_quality     : couverture des sources de donnees pour ce match
//   - sample_size      : nombre de matchs joues par les deux equipes cette
//                        saison (null si inconnu - jamais une valeur par
//                        defaut deguisee en donnee reelle)
// Un quatrieme signal demande explicitement - "calibration historique du
// modele concerne" - N'EST PAS INCLUS ICI : aucune prediction generee par
// le pipeline deterministe (post-fix LLM) n'a encore ete resolue, donc il
// n'existe aucune calibration historique reelle a mesurer pour CE moteur.
// L'ajouter maintenant reviendrait a fabriquer un chiffre. Voir
// CALIBRATION_REPORT.md - des que match_snapshots aura accumule assez de
// predictions resolues, calibrationHistorique doit devenir un vrai
// quatrieme composant ici, pas avant.
function computeReliability(modelAgreement, dataQuality, sampleSize) {
  let sampleLabel;
  if (sampleSize == null) sampleLabel = "Inconnue";
  else if (sampleSize >= 15) sampleLabel = "Suffisante";
  else if (sampleSize >= 5) sampleLabel = "Limitée";
  else sampleLabel = "Insuffisante";

  const scores = { Fort: 2, Élevée: 2, Suffisante: 2, Moyen: 1, Moyenne: 1, Limitée: 1, Faible: 0, Insuffisante: 0, Inconnue: 0 };
  const total = (scores[modelAgreement.label] || 0) + (scores[dataQuality.label] || 0) + (scores[sampleLabel] || 0);
  let label;
  if (total >= 5) label = "Élevée";
  else if (total >= 3) label = "Moyenne";
  else label = "Faible";

  return {
    label,
    model_agreement: modelAgreement.label,
    data_quality: dataQuality.label,
    sample_size: sampleSize,
    sample_size_label: sampleLabel,
    historical_calibration: "NOT_AVAILABLE_YET",
  };
}

module.exports = { pickMarketDeterministic, computeRiskLabel, computeModelAgreement, computeDataQualityScore, computeReliability };
