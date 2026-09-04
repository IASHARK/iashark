"use strict";
// EXP-004 item 6 (SPEC LAB PRO v1.0, M4 NB2) - fonction objectif EXACTE
// pour le fitting de kappa. NE PASSE JAMAIS par la matrice tronquee
// (lib/lab/nb2-matrix.js) - direct logP = logNB(h|muH,kappa) +
// logNB(a|muA,kappa), pour eviter que la troncature de la matrice
// n'influence artificiellement le MLE. C'est la reference Node contre
// laquelle scripts/fit_kappa.py (Python/SciPy) est verifie
// (tests/lab-nb2-node-python-fidelity.test.js).
//
// Marges INDEPENDANTES conditionnellement aux moyennes M2 - aucun tau
// Dixon-Coles, aucune fonction de lib/models.js#dixonColesCorr n'est
// appelee ici ni ailleurs dans M4 (voir tests/lab-m4-no-dixon-coles.test.js).

const { logPmfNB2 } = require("./nb2.js");

// log P(H=h, A=a) = logNB2(h|muHome,kappa) + logNB2(a|muAway,kappa)
function logProbability(muHome, muAway, h, a, kappa) {
  return logPmfNB2(h, muHome, kappa) + logPmfNB2(a, muAway, kappa);
}

// NLL exact-score moyenne pour un ensemble de matchs {muHome, muAway, h, a}
// et un kappa donne - fonction objectif que scripts/fit_kappa.py minimise.
function negLogLikelihood(matches, kappa) {
  let sum = 0;
  for (const m of matches) sum += -logProbability(m.muHome, m.muAway, m.h, m.a, kappa);
  return sum / matches.length;
}

module.exports = { logProbability, negLogLikelihood };
