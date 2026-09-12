"use strict";
// Mesure de calibration/backtest — Brier score, log loss, table de fiabilite
// (calibration curve) et erreur de calibration attendue (ECE). Generique :
// prend n'importe quelle liste de {prob, outcome} (outcome 0/1), pas
// specifique a IASHARK. Voir scripts/backtest_historique.js pour l'usage
// reel contre historique.json, et tests/calibration.test.js.

// Brier score : moyenne de (prob - outcome)^2. 0 = parfait, 0.25 = pas mieux
// qu'un pile ou face constant a 50%, plus haut = pire qu'un pile ou face.
function brierScore(items) {
  if (!items || !items.length) return null;
  let sum = 0;
  for (const it of items) sum += Math.pow(it.prob - it.outcome, 2);
  return sum / items.length;
}

// Log loss (entropie croisee binaire). Clampe prob dans [eps, 1-eps] pour
// eviter -Infinity sur une prediction absolument certaine et fausse.
function logLoss(items) {
  if (!items || !items.length) return null;
  const eps = 1e-9;
  let sum = 0;
  for (const it of items) {
    const p = Math.min(1 - eps, Math.max(eps, it.prob));
    sum += it.outcome === 1 ? -Math.log(p) : -Math.log(1 - p);
  }
  return sum / items.length;
}

// Table de fiabilite : regroupe les items par bucketFn(item) et calcule, par
// groupe, la probabilite moyenne predite vs le taux de reussite reel. Une
// calibration parfaite a avgPredictedProb ~= actualRate pour chaque bucket.
// Un bucket ou actualRate < avgPredictedProb est SURCONFIANT (le modele
// annonce plus de certitude qu'il n'en a reellement).
function calibrationTable(items, bucketFn) {
  const groups = {};
  for (const it of items) {
    const key = bucketFn(it);
    if (!groups[key]) groups[key] = { key, count: 0, probSum: 0, wins: 0 };
    groups[key].count++;
    groups[key].probSum += it.prob;
    if (it.outcome === 1) groups[key].wins++;
  }
  return Object.values(groups)
    .map((g) => ({
      key: g.key,
      count: g.count,
      avgPredictedProb: g.probSum / g.count,
      actualRate: g.wins / g.count,
      gap: g.wins / g.count - g.probSum / g.count,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

// Expected Calibration Error : moyenne (ponderee par la taille des buckets)
// de l'ecart absolu entre probabilite predite et taux reel. 0 = calibration
// parfaite.
function expectedCalibrationError(table) {
  const total = table.reduce((s, g) => s + g.count, 0);
  if (!total) return null;
  return table.reduce((s, g) => s + g.count * Math.abs(g.gap), 0) / total;
}

// --- Recalibration post-hoc (2026-09-13, voir ENGINE_RECALIBRATION_REPORT.md) ---
//
// Le diagnostic (CURRENT_ENGINE_CALIBRATION_REPORT.md) montre un moteur
// SURCONFIANT en haut d'echelle (80-90% predit -> ~71.5% reel sur 1X2 ;
// jusqu'a 90%+ -> ~52% reel sur Over/Under 2.5) et SOUS-CONFIANT en bas
// d'echelle (0-30% predit -> taux reel plus eleve que predit) - un pattern
// de miscalibration qui change de sens selon la tranche, jamais une simple
// translation ou un simple facteur d'echelle constant. Isotonic regression
// (Pool Adjacent Violators Algorithm, PAVA) est choisie plutot que Platt/
// logistic scaling PRECISEMENT pour cette raison : Platt scaling ajuste une
// sigmoide a 2 parametres (a,b) sur logit(prob) - une forme parametrique
// FIXE qui suppose implicitement un biais de calibration globalement
// monotone et de courbure constante. Le pattern observe ici (sous-confiant
// puis surconfiant) EST monotone en probabilite (jamais le cas ou une
// tranche plus confiante serait moins fiable qu'une tranche moins confiante
// juste en dessous) mais n'a pas une courbure constante compatible avec une
// seule sigmoide - isotonic regression n'impose qu'une seule contrainte
// (monotonie, deja vraie par construction : une probabilite modele plus
// elevee ne doit jamais correspondre a un taux reel plus faible) et laisse
// les donnees dicter la forme exacte, sans risque de mauvaise specification
// parametrique. Cout connu et documente : isotonic regression peut
// surapprendre sur de petits echantillons (chaque "coude" de la courbe est
// litteralement un point de donnee sur les cas extremes) - mitige ici par
// un fit GLOBAL (5 ligues combinees, jamais par ligue) : voir
// ENGINE_RECALIBRATION_REPORT.md pour la justification chiffree complete.

// PAVA (Pool Adjacent Violators Algorithm). rows = [{x, y, w?}] (x = proba
// brute predite dans [0,1], y = outcome 0/1 observe, w = poids optionnel,
// defaut 1). Retourne les BLOCS ajustes (une sequence non-decroissante de
// valeurs y qui minimise l'erreur quadratique ponderee sum w*(yhat-y)^2),
// tries par x croissant - c'est l'algorithme lui-meme, pas encore une
// courbe interpolable (voir fitIsotonicCurve ci-dessous pour ca).
//
// Regroupe D'ABORD les x EXACTEMENT identiques en un seul point pondere
// avant de lancer le pooling - detecte sur les vraies donnees IASHARK :
// calcLambdas() clampe lambdaH/lambdaA a des bornes fixes (minLH/maxLH/
// minLA/maxLA, lib/engine.js) et arrondit a 3 decimales, donc des matchs
// DIFFERENTS (equipes/saisons differentes) produisent parfois la MEME
// probabilite finale EXACTE, en particulier pres des bornes hautes (ex:
// 91 lignes 1X2 a x=0.8353297548658687 dans les donnees d'entrainement
// reelles). Sans ce regroupement prealable, des x identiques arrives dans
// un ordre chronologique par coincidence deja croissant en y ne
// declenchent JAMAIS de fusion (aucune "violation" detectee entre eux),
// laissant plusieurs points a la MEME abscisse dans la courbe finale - et
// si le tout dernier de ces blocs est un singleton bruyant (n=1, y=1),
// TOUTE probabilite brute superieure ou egale a ce x serait alors clampee
// a 100% de confiance par applyIsotonicCurve - exactement l'inverse de
// l'objectif (une "correction" qui rendrait la queue haute encore plus
// surconfiante). Regrouper par x identique AVANT le pooling est le
// comportement standard d'une isotonic regression ponderee et elimine ce
// risque : le point agrege devient une moyenne ponderee honnete de tous
// les echantillons a cette valeur, jamais un singleton isole.
function poolAdjacentViolators(rows) {
  const grouped = new Map();
  for (const r of rows) {
    const w = r.w != null ? r.w : 1;
    let g = grouped.get(r.x);
    if (!g) { g = { x: r.x, sumY: 0, sumW: 0 }; grouped.set(r.x, g); }
    g.sumY += r.y * w;
    g.sumW += w;
  }
  const uniquePoints = Array.from(grouped.values()).sort((a, b) => a.x - b.x);

  const blocks = [];
  for (const g of uniquePoints) {
    blocks.push({ sumY: g.sumY, sumW: g.sumW, xmin: g.x, xmax: g.x, n: g.sumW });
    // Violation = le bloc precedent a une moyenne STRICTEMENT plus haute que
    // le nouveau -> fusionner (jamais l'inverse, jamais sauter un bloc au
    // milieu - PAVA fusionne toujours les deux derniers en cascade).
    while (
      blocks.length > 1 &&
      blocks[blocks.length - 2].sumY / blocks[blocks.length - 2].sumW >
        blocks[blocks.length - 1].sumY / blocks[blocks.length - 1].sumW
    ) {
      const b2 = blocks.pop();
      const b1 = blocks.pop();
      blocks.push({ sumY: b1.sumY + b2.sumY, sumW: b1.sumW + b2.sumW, xmin: b1.xmin, xmax: b2.xmax, n: b1.n + b2.n });
    }
  }
  return blocks.map((b) => ({ xmin: b.xmin, xmax: b.xmax, y: b.sumY / b.sumW, n: b.n }));
}

// Construit une courbe de calibration interpolable (points {x,y} tries par
// x strictement croissant) depuis des rows={prob,outcome} en [0,1]. Chaque
// bloc PAVA contribue jusqu'a 2 points (xmin,y) et (xmax,y > xmin) - plat a
// l'interieur d'un bloc, rampe lineaire entre la fin d'un bloc et le debut
// du suivant (meme convention que scikit-learn IsotonicRegression en mode
// interpolation) : jamais un saut brutal non justifie, jamais une
// extrapolation en dehors du domaine observe (voir applyIsotonicCurve).
// Retourne null si rows est vide/trop petit pour ajuster quoi que ce soit
// (jamais une courbe fabriquee sur rien).
function fitIsotonicCurve(rows) {
  if (!rows || rows.length < 2) return null;
  const blocks = poolAdjacentViolators(rows.map((r) => ({ x: r.prob, y: r.outcome })));
  const points = [];
  for (const b of blocks) {
    const last = points[points.length - 1];
    // poolAdjacentViolators regroupe deja les x identiques en un seul bloc
    // (voir son en-tete) : deux blocs consecutifs ne peuvent donc jamais
    // partager le meme xmin - la branche else est un filet defensif,
    // jamais cense s'executer, gardee uniquement pour ne jamais produire
    // une courbe avec un x en double si cette invariante changeait un jour.
    if (!last || last.x < b.xmin) points.push({ x: b.xmin, y: b.y });
    else last.y = b.y;
    if (b.xmax > b.xmin) points.push({ x: b.xmax, y: b.y });
  }
  return { method: "isotonic_pava", points, n: rows.length };
}

// Interpolation O(log n) (recherche binaire) contre une courbe deja
// ajustee (fitIsotonicCurve). Clampe strictement au domaine d'entrainement
// (jamais d'extrapolation au-dela du min/max observe pendant le fit) -
// prob en [0,1] -> renvoie [0,1]. curve=null -> repli identite (prob
// inchangee), pour qu'un marche sans courbe fittee ne casse jamais
// l'appelant.
function applyIsotonicCurve(prob, curve) {
  if (!curve || !curve.points || !curve.points.length) return prob;
  const pts = curve.points;
  if (prob <= pts[0].x) return pts[0].y;
  if (prob >= pts[pts.length - 1].x) return pts[pts.length - 1].y;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (pts[mid].x <= prob) lo = mid; else hi = mid;
  }
  const p0 = pts[lo], p1 = pts[hi];
  if (p1.x === p0.x) return p0.y;
  const t = (prob - p0.x) / (p1.x - p0.x);
  return p0.y + t * (p1.y - p0.y);
}

// Point d'entree generique voulu par la tache de recalibration - enveloppe
// fine autour de applyIsotonicCurve, nommee par methode plutot que par
// algorithme pour que lib/engine.js n'ait jamais a connaitre "PAVA" : si une
// autre methode de fit est ajoutee plus tard (ex: Platt), curve.method
// permet de brancher sans changer l'appelant. Aujourd'hui, une seule
// methode existe (isotonic_pava) et vaut l'implementation par defaut.
function applyCalibration(prob, curve) {
  if (!curve) return prob;
  if (curve.method === "isotonic_pava" || !curve.method) return applyIsotonicCurve(prob, curve);
  return prob;
}

// Renormalise un jeu de probabilites MUTUELLEMENT EXCLUSIVES ET EXHAUSTIVES
// (ex: p1/pN/p2 apres calibration independante de chacune) pour qu'elles
// somment exactement a 1 - meme convention que lib/markets/score-matrix.js
// #blendMatrices (renormalisation proportionnelle, jamais une redistribution
// arbitraire). Necessaire car calibrer chaque issue independamment via la
// MEME courbe (une courbe par marche, pas par issue - voir
// ENGINE_RECALIBRATION_REPORT.md) ne garantit pas nativement une somme a 1.
// Repli honnete (distribution uniforme) si la somme calibree est <=0 (ne
// devrait jamais arriver avec des courbes fittees sur [0,1], mais jamais de
// division par zero silencieuse).
function renormalizeToSumOne(values) {
  const sum = values.reduce((s, v) => s + v, 0);
  if (!(sum > 0)) return values.map(() => 1 / values.length);
  return values.map((v) => v / sum);
}

module.exports = {
  brierScore, logLoss, calibrationTable, expectedCalibrationError,
  poolAdjacentViolators, fitIsotonicCurve, applyIsotonicCurve, applyCalibration, renormalizeToSumOne,
};
