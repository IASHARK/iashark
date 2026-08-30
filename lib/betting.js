"use strict";
// Formules de paris (Kelly, EV, edge), extraites de update-data.yml pour
// etre reellement testables. Voir tests/betting.test.js.

// Kelly fractionnaire. probIA en decimal (0-1), cote decimale (>1),
// fraction du Kelly plein a appliquer (0.25 = quart de Kelly, standard pour
// limiter le risque de ruine). Retourne null si aucun edge reel (kelly<=0) -
// jamais une valeur par defaut arbitraire. Plafonne a 5% de la bankroll par
// pari, meme avec un edge enorme, par prudence.
function fractionalKelly(probIA, cote, fraction) {
  fraction = fraction || 0.25;
  if (probIA == null || cote == null || cote <= 1 || probIA <= 0 || probIA >= 1) return null;
  const b = cote - 1;
  const q = 1 - probIA;
  const kelly = (probIA * b - q) / b;
  if (kelly <= 0) return null;
  return Math.min(kelly * fraction * 100, 5).toFixed(1);
}

// Edge en points de probabilite : difference entre la probabilite du modele
// et la probabilite "fair" du marche (marge bookmaker deja retiree, via
// shinProbabilities ou au moins impliedProbability en repli). Positif = le
// modele voit plus de chances que le marche n'en implique. JAMAIS calcule
// comme "la probabilite du modele toute seule" (bug historique corrige).
function edgePoints(modelProb, marketProb) {
  if (modelProb == null || marketProb == null) return null;
  return modelProb - marketProb;
}

// Expected value pour une mise unitaire : EV = p*cote - 1.
function expectedValue(probIA, cote) {
  if (probIA == null || cote == null) return null;
  return probIA * cote - 1;
}

module.exports = { fractionalKelly, edgePoints, expectedValue };
