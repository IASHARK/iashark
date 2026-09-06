"use strict";
// Player Engine (MASTER V2.1 §10.G/§10.Z). Calcule des probabilites reelles
// pour les marches joueur (buteur, tirs, tirs cadres) a partir d'un taux
// par-90-minutes AJUSTE au temps de jeu attendu et au contexte du match -
// jamais une transformation directe de goals_per_90/shots_per_90 en
// probabilite (regle explicite de l'utilisateur, verrouillee ci-dessous par
// construction : aucune fonction de ce fichier ne retourne un taux brut
// comme probabilite).
//
// Reutilise poissonProb (lib/models.js, deja teste/en production) au lieu
// d'une nouvelle implementation - meme principe que
// lib/markets/score-matrix.js pour les marches equipe.
//
// Comme le score-matrix, ce module est pur (aucun appel reseau) : le
// pipeline lui fournit les entrees deja recuperees (lineup, stats
// historiques joueur, forces d'equipe deja calculees par
// computeDynamicTeamStrength) plutot que de les re-fetcher ici.
const { poissonProb } = require("../models.js");

const MODEL_VERSION = "player-engine-v1";
const MIN_APPEARANCES_FOR_RATE = 3; // en dessous, le taux par-90 est trop bruite pour etre publie
const MIN_SAMPLE_FOR_VALIDATION = 30; // matchs necessaires avant meme d'envisager VALIDATED (jamais atteint automatiquement, voir chooseDistributionModel)
const PREVIOUS_SEASON_PRIOR_MATCHES = 8; // meme convention que lib/markets/early-season.js#blendEarlySeasonRate (previousEquivalentMatches par defaut)

// --- Lissage petit echantillon (saison precedente comme prior) -----------
// A exactement MIN_APPEARANCES_FOR_RATE=3 matchs, un joueur en debut de
// forme (ex: 2 buts en 3 matchs = 2.0 buts/90) publie un taux brut deja
// autorise par assessDataQuality (quality="low", suppress=false) mais
// jamais tempere - une fois injecte dans le Poisson, ce taux produit une
// probabilite implausible (>80% pour un seul joueur). Reprend EXACTEMENT
// la meme forme de decroissance que la production (lib/markets/early-
// season.js#blendEarlySeasonRate, prior_weight(n)=max(0,8-0.5n)),
// appliquee ici au niveau JOUEUR (saison precedente du MEME joueur comme
// prior) plutot qu'equipe. Contrairement a blendEarlySeasonRate, AUCUN
// plancher de ligue n'est ajoute : il n'existe aucun taux moyen de ligue
// par joueur/poste deja mesure dans ce codebase, et en fabriquer un serait
// invente. Si aucune saison precedente n'est disponible pour ce joueur
// (transfert, jeune, premiere saison suivie par le pipeline), le taux
// courant est retourne SANS lissage - MIN_APPEARANCES_FOR_RATE reste alors
// la seule protection, deja en place ailleurs.
function blendPlayerRateAcrossSeasons(currentEvents, currentMatches90, previousEvents, previousMatches90) {
  if (currentMatches90 == null || currentMatches90 < 0) return { rate: null, previous_equivalent_matches: 0, shrinkage_applied: false };
  if (previousMatches90 == null || previousMatches90 <= 0) {
    return { rate: currentMatches90 > 0 ? currentEvents / currentMatches90 : null, previous_equivalent_matches: 0, shrinkage_applied: false };
  }
  var decayingPrior = Math.max(0, PREVIOUS_SEASON_PRIOR_MATCHES - currentMatches90 * 0.5);
  var previousEquivalentMatches = Math.min(previousMatches90, decayingPrior);
  var previousRate = previousEvents / previousMatches90;
  var weightedEvents = currentEvents + previousRate * previousEquivalentMatches;
  var weightedMatches = currentMatches90 + previousEquivalentMatches;
  return {
    rate: weightedMatches > 0 ? weightedEvents / weightedMatches : null,
    previous_equivalent_matches: previousEquivalentMatches,
    shrinkage_applied: true,
  };
}

// --- Minutes attendues ------------------------------------------------
// Variable centrale (demande explicite) : un joueur a 30 min attendues ne
// doit jamais recevoir la meme distribution qu'a 90 min. Toutes les
// fonctions de probabilite en aval prennent expected_minutes en entree et
// mettent le lambda a l'echelle de expectedMinutes/90.
//
// lineupStatus attendu : 'confirmed_starter' | 'confirmed_bench' |
// 'expected_starter' | 'expected_bench' | 'unknown'.
// historicalMinutes : { appearences, lineups, minutes } - champs reels de
// GET /players?id=X&season=Y (verifie en session : games.appearences,
// games.lineups, games.minutes).
function resolveExpectedMinutes(lineupStatus, historicalMinutes, starterProbability) {
  var h = historicalMinutes || {};
  var appearences = h.appearences || 0;
  var lineups = h.lineups || 0;
  var minutes = h.minutes || 0;
  var subAppearances = Math.max(0, appearences - lineups);

  // Minutes moyennes quand titulaire vs quand entre en cours de match -
  // estimees a partir de l'historique reel du joueur cette saison (pas de
  // valeur inventee si aucun historique n'existe).
  var avgStartMinutes = lineups > 0 ? Math.min(90, minutes / lineups) : null;
  var avgSubMinutes = subAppearances > 0 ? Math.min(45, (minutes - (avgStartMinutes || 0) * lineups) / subAppearances) : null;

  if (lineupStatus === "confirmed_starter") {
    return { expectedMinutes: avgStartMinutes != null ? Math.round(avgStartMinutes) : 80, source: avgStartMinutes != null ? "historical_start_average" : "default_starter_no_history" };
  }
  if (lineupStatus === "confirmed_bench") {
    return { expectedMinutes: avgSubMinutes != null ? Math.round(avgSubMinutes) : 20, source: avgSubMinutes != null ? "historical_sub_average" : "default_sub_no_history" };
  }
  if (lineupStatus === "expected_starter" || lineupStatus === "expected_bench") {
    if (typeof starterProbability !== "number") return { expectedMinutes: null, source: "insufficient_data_no_starter_probability" };
    var startMin = avgStartMinutes != null ? avgStartMinutes : 80;
    var subMin = avgSubMinutes != null ? avgSubMinutes : 20;
    var blended = starterProbability * startMin + (1 - starterProbability) * subMin;
    return { expectedMinutes: Math.round(blended), source: "blended_starter_probability" };
  }
  return { expectedMinutes: null, source: "unknown_lineup_status" };
}

// --- Buteur -------------------------------------------------------------
// P(marque >= 1) = 1 - Poisson(lambda, 0), lambda mis a l'echelle du temps
// de jeu attendu et des forces d'equipe deja calculees ailleurs dans le
// pipeline (teamAttackMultiplier/opponentDefenseMultiplier ne sont PAS
// recalcules ici, reutilises tels quels - meme principe DRY que
// score-matrix.js).
function computeGoalscorerProbability(input) {
  var expectedMinutes = input.expectedMinutes;
  var goalsPer90 = input.goalsPer90;
  var teamAttackMultiplier = input.teamAttackMultiplier != null ? input.teamAttackMultiplier : 1;
  var opponentDefenseMultiplier = input.opponentDefenseMultiplier != null ? input.opponentDefenseMultiplier : 1;
  var penaltyGoalsPer90 = input.penaltyGoalsPer90 || 0;

  if (expectedMinutes == null || goalsPer90 == null || goalsPer90 < 0) return null;
  var lambda = goalsPer90 * (expectedMinutes / 90) * teamAttackMultiplier * opponentDefenseMultiplier;
  lambda = Math.max(0, lambda);
  var probability = 1 - poissonProb(lambda, 0);
  return {
    market: "ANYTIME_GOALSCORER",
    probability: +probability.toFixed(4),
    lambda: +lambda.toFixed(4),
    penalty_share: goalsPer90 > 0 ? +(penaltyGoalsPer90 / goalsPer90).toFixed(3) : null,
    distribution_model: "poisson",
  };
}

// --- Tirs / tirs cadres --------------------------------------------------
// Modeles DISTINCTS du modele buteur (demande explicite) : meme mise a
// l'echelle par expected_minutes, mais volumes/variance differents (un
// joueur tire plusieurs fois par match, contrairement aux buts). Retourne
// une distribution complete (P(over X.5) pour les lignes usuelles), pas
// seulement une probabilite binaire.
function computeCountDistribution(market, input) {
  var expectedMinutes = input.expectedMinutes;
  var ratePer90 = input.ratePer90;
  var teamAttackMultiplier = input.teamAttackMultiplier != null ? input.teamAttackMultiplier : 1;
  var opponentDefenseMultiplier = input.opponentDefenseMultiplier != null ? input.opponentDefenseMultiplier : 1;
  var lines = input.lines || [0.5, 1.5, 2.5, 3.5];

  if (expectedMinutes == null || ratePer90 == null || ratePer90 < 0) return null;
  var lambda = ratePer90 * (expectedMinutes / 90) * teamAttackMultiplier * opponentDefenseMultiplier;
  lambda = Math.max(0, lambda);

  var overProbs = {};
  lines.forEach(function (line) {
    var kMax = Math.floor(line); // P(over line) = 1 - P(X <= floor(line))
    var cumulative = 0;
    for (var k = 0; k <= kMax; k++) cumulative += poissonProb(lambda, k);
    overProbs["over_" + line] = +Math.max(0, 1 - cumulative).toFixed(4);
  });

  return {
    market: market,
    lambda: +lambda.toFixed(4),
    distribution_model: "poisson",
    over_lines: overProbs,
  };
}

// --- Choix Poisson vs Negative Binomial ----------------------------------
// Compare deux modeles candidats sur un echantillon HISTORIQUE reel de
// comptages par match (jamais invente) et garde celui qui maximise la
// vraisemblance hors echantillon. Tant qu'aucun vrai backtest walk-forward
// n'a ete execute (ce module ne le fait pas lui-meme - il fournit
// seulement la comparaison de vraisemblance in-sample), le statut renvoye
// est TOUJOURS FORWARD_VALIDATION_ONLY, jamais VALIDATED (regle explicite
// de l'utilisateur : pas de VALIDATED sans validation honnete hors
// echantillon, qu'on ne peut pas fabriquer ici).
function poissonLogLikelihood(counts, lambda) {
  return counts.reduce(function (sum, k) { return sum + Math.log(Math.max(poissonProb(lambda, k), 1e-12)); }, 0);
}
function negBinomLogLikelihood(counts, mean, variance) {
  // Parametrisation par la methode des moments : r = mean^2/(variance-mean), p = r/(r+mean).
  // Retourne null si la variance n'excede pas la moyenne (pas de surdispersion
  // detectable, Negative Binomial degenere vers Poisson dans ce cas).
  if (variance <= mean) return null;
  var r = (mean * mean) / (variance - mean);
  var p = r / (r + mean);
  return counts.reduce(function (sum, k) {
    var logC = logGammaRatio(k, r);
    var logP = logC + r * Math.log(p) + k * Math.log(1 - p);
    return sum + logP;
  }, 0);
}
function logGammaRatio(k, r) {
  // log( Gamma(k+r) / (k! * Gamma(r)) ), calcule terme a terme pour rester stable numeriquement.
  var sum = 0;
  for (var i = 0; i < k; i++) sum += Math.log(r + i) - Math.log(i + 1);
  return sum;
}
function chooseDistributionModel(historicalCounts) {
  if (!historicalCounts || historicalCounts.length < MIN_SAMPLE_FOR_VALIDATION) {
    return { chosenModel: "poisson", validation_status: "FORWARD_VALIDATION_ONLY", reason: "Echantillon historique (" + (historicalCounts ? historicalCounts.length : 0) + " matchs) < " + MIN_SAMPLE_FOR_VALIDATION + " requis pour meme envisager une validation - repli sur Poisson par defaut." };
  }
  var mean = historicalCounts.reduce(function (a, b) { return a + b; }, 0) / historicalCounts.length;
  var variance = historicalCounts.reduce(function (a, b) { return a + Math.pow(b - mean, 2); }, 0) / historicalCounts.length;
  var llPoisson = poissonLogLikelihood(historicalCounts, mean);
  var llNegBinom = negBinomLogLikelihood(historicalCounts, mean, variance);
  var chosen = llNegBinom != null && llNegBinom > llPoisson ? "negative_binomial" : "poisson";
  return {
    chosenModel: chosen,
    validation_status: "FORWARD_VALIDATION_ONLY",
    reason: "Comparaison de vraisemblance in-sample seulement (Poisson ll=" + llPoisson.toFixed(2) + (llNegBinom != null ? ", NegBinom ll=" + llNegBinom.toFixed(2) : ", NegBinom non-applicable (pas de surdispersion)") + "). Un vrai walk-forward hors echantillon reste a executer avant tout statut VALIDATED - jamais fabrique automatiquement.",
  };
}

// --- Qualite des donnees / suppression si insuffisant ---------------------
function assessDataQuality(input) {
  var appearences = (input.historicalMinutes && input.historicalMinutes.appearences) || 0;
  var hasExpectedMinutes = input.expectedMinutes != null;
  var hasOpponentContext = input.opponentDefenseMultiplier != null;

  if (!hasExpectedMinutes || appearences < MIN_APPEARANCES_FOR_RATE) {
    return { quality: "insufficient", sampleSize: appearences, suppress: true };
  }
  var quality = "low";
  if (appearences >= 10 && hasOpponentContext) quality = "medium";
  if (appearences >= 20 && hasOpponentContext && input.lineupStatus && input.lineupStatus.indexOf("confirmed") === 0) quality = "high";
  return { quality: quality, sampleSize: appearences, suppress: false };
}

// --- Sortie standard ------------------------------------------------------
// Assemble la sortie complete requise (fixture_id, player_id,
// model_version, generated_at, expected_minutes, lineup_status, market,
// probability/distribution, data_quality, sample_size, validation_status,
// inputs_snapshot). Retourne null si les donnees minimales manquent -
// AUCUN resultat n'est fabrique dans ce cas (regle explicite).
function buildPlayerMarketOutput(params) {
  var fixtureId = params.fixtureId;
  var playerId = params.playerId;
  var market = params.market; // 'ANYTIME_GOALSCORER' | 'PLAYER_SHOTS' | 'PLAYER_SHOTS_ON_TARGET'
  var lineupStatus = params.lineupStatus;
  var starterProbability = params.starterProbability;
  var historicalMinutes = params.historicalMinutes;
  var ratePer90 = params.ratePer90; // goalsPer90 pour ANYTIME_GOALSCORER, shotsPer90/shotsOnTargetPer90 sinon
  var teamAttackMultiplier = params.teamAttackMultiplier;
  var opponentDefenseMultiplier = params.opponentDefenseMultiplier;
  var penaltyGoalsPer90 = params.penaltyGoalsPer90;
  var historicalCounts = params.historicalCounts; // comptages reels par match pour ce marche, si disponibles

  if (fixtureId == null || playerId == null || !market) return null;

  var minutesResolved = resolveExpectedMinutes(lineupStatus, historicalMinutes, starterProbability);
  var quality = assessDataQuality({
    expectedMinutes: minutesResolved.expectedMinutes,
    historicalMinutes: historicalMinutes,
    opponentDefenseMultiplier: opponentDefenseMultiplier,
    lineupStatus: lineupStatus,
  });
  if (quality.suppress || ratePer90 == null) return null;

  var modelChoice = chooseDistributionModel(historicalCounts);

  var probabilityOrDistribution;
  if (market === "ANYTIME_GOALSCORER") {
    probabilityOrDistribution = computeGoalscorerProbability({
      expectedMinutes: minutesResolved.expectedMinutes,
      goalsPer90: ratePer90,
      teamAttackMultiplier: teamAttackMultiplier,
      opponentDefenseMultiplier: opponentDefenseMultiplier,
      penaltyGoalsPer90: penaltyGoalsPer90,
    });
  } else if (market === "PLAYER_SHOTS" || market === "PLAYER_SHOTS_ON_TARGET") {
    probabilityOrDistribution = computeCountDistribution(market, {
      expectedMinutes: minutesResolved.expectedMinutes,
      ratePer90: ratePer90,
      teamAttackMultiplier: teamAttackMultiplier,
      opponentDefenseMultiplier: opponentDefenseMultiplier,
    });
  } else {
    return null; // marche non supporte par ce moteur
  }
  if (!probabilityOrDistribution) return null;

  return {
    fixture_id: fixtureId,
    player_id: playerId,
    model_version: MODEL_VERSION,
    generated_at: new Date().toISOString(),
    expected_minutes: minutesResolved.expectedMinutes,
    expected_minutes_source: minutesResolved.source,
    lineup_status: lineupStatus,
    market: market,
    output: probabilityOrDistribution,
    data_quality: quality.quality,
    sample_size: quality.sampleSize,
    validation_status: modelChoice.validation_status,
    validation_note: modelChoice.reason,
    inputs_snapshot: {
      rate_per_90: ratePer90,
      historical_minutes: historicalMinutes || null,
      starter_probability: starterProbability != null ? starterProbability : null,
      team_attack_multiplier: teamAttackMultiplier != null ? teamAttackMultiplier : null,
      opponent_defense_multiplier: opponentDefenseMultiplier != null ? opponentDefenseMultiplier : null,
    },
  };
}

module.exports = {
  MODEL_VERSION: MODEL_VERSION,
  resolveExpectedMinutes: resolveExpectedMinutes,
  computeGoalscorerProbability: computeGoalscorerProbability,
  computeCountDistribution: computeCountDistribution,
  chooseDistributionModel: chooseDistributionModel,
  assessDataQuality: assessDataQuality,
  buildPlayerMarketOutput: buildPlayerMarketOutput,
  blendPlayerRateAcrossSeasons: blendPlayerRateAcrossSeasons,
};
