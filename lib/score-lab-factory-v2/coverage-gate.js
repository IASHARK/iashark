"use strict";
// SCORE_LAB_FACTORY_V2 (2026-09-06). Corrige l'erreur decouverte lors du
// premier passage Serie A (V1) : MIN_N_OOS=500 (lib/promotion.js) est un
// seuil ABSOLU concu pour un contexte different (challenger-promotion
// avec un support potentiellement cumule) - il est structurellement
// INATTEIGNABLE pour un holdout d'UNE SEULE saison d'une ligue a 20
// equipes (380 matchs, ~377 valides observes). Une ligue a 18 equipes
// (306 matchs) ou 462 matchs (round-robin etendu) rendrait ce seuil
// encore plus arbitraire.
//
// Remplace par un gate a l'echelle de la ligue : VALID_FIXTURE_COVERAGE_RATE
// (proportion des fixtures DE LA SAISON HOLDOUT ayant produit une
// prediction valide), independant du nombre total de matchs de la
// ligue. Un floor ABSOLU reste applique en garde-fou : en dessous, le
// bootstrap par blocs (nombre de blocs/journees) n'a plus assez de
// blocs independants pour etre statistiquement significatif, quelle
// que soit la ligue.
//
// Justification des deux constantes (a documenter dans tout contrat qui
// les utilise, jamais silencieuses) :
//   MIN_VALID_FIXTURE_COVERAGE_RATE = 0.90 : convention statistique
//     standard "moins de 10% de donnees manquantes" pour qu'un
//     echantillon soit considere representatif de la population totale
//     (ici : la saison entiere) - pas une valeur choisie pour faire
//     passer un resultat, applicable a l'identique quelle que soit la
//     taille de la ligue.
//   MIN_ABSOLUTE_FLOOR = 200 : le bootstrap par blocs (lib/lab/bootstrap.js)
//     necessite un nombre de blocs (journees de championnat)
//     suffisant pour que la distribution de reechantillonnage soit
//     credible - 200 predictions valides correspond a peu pres a une
//     demi-saison complete pour la plus petite ligue de la Factory,
//     un plancher conservateur independant du nombre total de matchs.

const MIN_VALID_FIXTURE_COVERAGE_RATE = 0.90;
const MIN_ABSOLUTE_FLOOR = 200;

// totalFixturesInSeason : nombre TOTAL de fixtures de la saison holdout
// (avant tout filtre de validite) - jamais le nombre de fixtures
// valides lui-meme, sinon le taux serait toujours 100% par construction.
function evaluateCoverageGate({ nValidPredictions, totalFixturesInSeason }) {
  if (!totalFixturesInSeason || totalFixturesInSeason <= 0) {
    return { pass: false, reason: "TOTAL_FIXTURES_UNKNOWN_OR_ZERO", coverage_rate: null, n_valid: nValidPredictions, total_fixtures: totalFixturesInSeason };
  }
  const coverageRate = nValidPredictions / totalFixturesInSeason;
  const rateOk = coverageRate >= MIN_VALID_FIXTURE_COVERAGE_RATE;
  const floorOk = nValidPredictions >= MIN_ABSOLUTE_FLOOR;
  return {
    pass: rateOk && floorOk,
    coverage_rate: coverageRate,
    n_valid: nValidPredictions,
    total_fixtures: totalFixturesInSeason,
    rate_threshold: MIN_VALID_FIXTURE_COVERAGE_RATE,
    absolute_floor: MIN_ABSOLUTE_FLOOR,
    rate_ok: rateOk,
    floor_ok: floorOk,
  };
}

module.exports = { evaluateCoverageGate, MIN_VALID_FIXTURE_COVERAGE_RATE, MIN_ABSOLUTE_FLOOR };
