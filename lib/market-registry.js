"use strict";
// Registre central des marches (MASTER V2.1 §8 et §10.AN). Chaque entree
// declare honnetement son statut reel : un marche n'est jamais affiche comme
// "calcule" s'il n'a pas a la fois une fonction de modele ET une fonction de
// resolution testee (§8, regle d'interdiction explicite).
//
// Statuts (vocabulaire §10.AN, version finale/autoritaire - §8 utilisait
// un vocabulaire legerement different en premiere lecture du document,
// ce fichier suit §10.AN uniformement, y compris NOT_SUPPORTED plutot
// que le UNSUPPORTED de §8) :
//   MODELLED_AND_VALIDATED : modele + resolver + tests + backtest minimal.
//   MODELLED_EXPERIMENTAL  : modele et/ou resolver existent mais pas encore
//                            valides par un backtest reel (sample insuffisant
//                            ou pas encore mesure).
//   ODDS_ONLY               : seule la cote marche est affichable, pas de
//                            probabilite modele IASHARK.
//   INSUFFICIENT_DATA       : donnee source manquante pour ce marche.
//   UNSUPPORTED             : ni modele ni resolver n'existent.
//
// L'UI ne doit afficher une probabilite IASHARK que pour MODELLED_AND_VALIDATED
// ou MODELLED_EXPERIMENTAL (avec etiquette explicite "experimental").

const MARKET_REGISTRY = [
  {
    id: "MATCH_WINNER",
    category: "1X2",
    label_fr: "Résultat du match (1X2)",
    required_inputs: ["lambdaHome", "lambdaAway"],
    model_function: "lib/markets/score-matrix.js#deriveMarketsFromMatrix (p1/pN/p2)",
    resolver_function: "lib/resolvers.js#resolveMarketWin (Victoire Domicile/Exterieur, Nul)",
    min_data_quality: "low",
    availability_status: "MODELLED_AND_VALIDATED",
    version: "v1",
    notes: "Modele = ensemble Poisson/Dixon-Coles/Monte-Carlo/Elo (calcFinalProbs dans le pipeline). Resolver + modele testes independamment.",
  },
  {
    id: "DOUBLE_CHANCE",
    category: "1X2",
    label_fr: "Double Chance (1X / X2 / 12)",
    required_inputs: ["lambdaHome", "lambdaAway"],
    model_function: "lib/markets/score-matrix.js#deriveMarketsFromMatrix (doubleChance)",
    resolver_function: "lib/resolvers.js#resolveMarketWin (DC 1X, DC X2)",
    min_data_quality: "low",
    availability_status: "MODELLED_AND_VALIDATED",
    version: "v1",
    notes: "Derive trivialement de p1/pN/p2, pas de modele independant (§10.V).",
  },
  {
    id: "DRAW_NO_BET",
    category: "1X2",
    label_fr: "Draw No Bet (DNB)",
    required_inputs: ["lambdaHome", "lambdaAway"],
    model_function: "lib/markets/score-matrix.js#deriveMarketsFromMatrix (drawNoBet)",
    resolver_function: "lib/resolvers.js#resolveMarketWin (DNB Domicile/Exterieur, avec VOID sur match nul)",
    min_data_quality: "low",
    availability_status: "MODELLED_AND_VALIDATED",
    version: "v1",
    notes: "Ajoute cette session (modele + resolver + tests nouveaux). Pas encore branche dans le pipeline de production (allMarkets) ni backteste sur donnees reelles - a considerer MODELLED_EXPERIMENTAL tant qu'aucun echantillon reel n'existe.",
  },
  {
    id: "TOTAL_GOALS",
    category: "GOALS",
    label_fr: "Total de buts (Over/Under 0.5 à 6.5)",
    required_inputs: ["lambdaHome", "lambdaAway"],
    model_function: "lib/markets/score-matrix.js#deriveMarketsFromMatrix (overUnder)",
    resolver_function: "lib/resolvers.js#resolveMarketWin (ligne O/U générique, régulière expression)",
    min_data_quality: "low",
    availability_status: "MODELLED_AND_VALIDATED",
    version: "v1",
    notes: "1.5/2.5/3.5 valides en production depuis longtemps (odds réelles collectées). 0.5/4.5/5.5/6.5 nouvellement modélisés/résolus cette session mais jamais encore utilisés en production ni backtestés - MODELLED_EXPERIMENTAL pour ces lignes spécifiquement tant qu'aucune cote/résultat réel n'a été observé dessus.",
  },
  {
    id: "TEAM_TOTALS",
    category: "GOALS",
    label_fr: "Totaux par équipe (Over/Under 0.5 à 3.5)",
    required_inputs: ["lambdaHome", "lambdaAway"],
    model_function: "lib/markets/score-matrix.js#deriveMarketsFromMatrix (teamTotals)",
    resolver_function: "NOT_IMPLEMENTED",
    min_data_quality: "low",
    availability_status: "MODELLED_EXPERIMENTAL",
    version: "v1",
    notes: "Modèle et tests de cohérence mathématique existent (score-matrix.test.js). Aucun resolver dédié dans lib/resolvers.js - ne peut pas encore être marqué WIN/LOSS automatiquement.",
  },
  {
    id: "BTTS",
    category: "GOALS",
    label_fr: "Les deux équipes marquent (BTTS)",
    required_inputs: ["lambdaHome", "lambdaAway"],
    model_function: "lib/markets/score-matrix.js#deriveMarketsFromMatrix (btts) / lib/models.js#calcPoissonProbs",
    resolver_function: "lib/resolvers.js#resolveMarketWin (BTTS Oui/Non)",
    min_data_quality: "low",
    availability_status: "MODELLED_AND_VALIDATED",
    version: "v1",
    notes: "En production depuis longtemps.",
  },
  {
    id: "CLEAN_SHEET",
    category: "GOALS",
    label_fr: "Clean sheet (domicile/extérieur)",
    required_inputs: ["lambdaHome", "lambdaAway"],
    model_function: "lib/markets/score-matrix.js#deriveMarketsFromMatrix (cleanSheet)",
    resolver_function: "NOT_IMPLEMENTED",
    min_data_quality: "low",
    availability_status: "MODELLED_EXPERIMENTAL",
    version: "v1",
    notes: "Modèle testé, resolver manquant.",
  },
  {
    id: "WIN_TO_NIL",
    category: "GOALS",
    label_fr: "Gagne sans encaisser (win to nil)",
    required_inputs: ["lambdaHome", "lambdaAway"],
    model_function: "lib/markets/score-matrix.js#deriveMarketsFromMatrix (winToNil)",
    resolver_function: "NOT_IMPLEMENTED",
    min_data_quality: "low",
    availability_status: "MODELLED_EXPERIMENTAL",
    version: "v1",
    notes: "Modèle testé, resolver manquant.",
  },
  {
    id: "EXACT_SCORE",
    category: "GOALS",
    label_fr: "Score exact",
    required_inputs: ["lambdaHome", "lambdaAway"],
    model_function: "lib/markets/score-matrix.js#deriveMarketsFromMatrix (exactScore, avec 'Other' pour la masse restante)",
    resolver_function: "NOT_IMPLEMENTED (comparaison directe score prédit vs score réel, triviale mais pas encore codée)",
    min_data_quality: "low",
    availability_status: "MODELLED_EXPERIMENTAL",
    version: "v1",
    notes: "Le pipeline affiche déjà des top-scores Monte-Carlo (mc_scores) côté public, mais ce n'est pas relié à un vrai resolver testé.",
  },
  {
    id: "GOAL_BANDS",
    category: "GOALS",
    label_fr: "Bandes de buts (0-1 / 2-3 / 4-5 / 6+)",
    required_inputs: ["lambdaHome", "lambdaAway"],
    model_function: "lib/markets/score-matrix.js#deriveMarketsFromMatrix (goalBands)",
    resolver_function: "NOT_IMPLEMENTED",
    min_data_quality: "low",
    availability_status: "MODELLED_EXPERIMENTAL",
    version: "v1",
    notes: "Modèle testé, resolver manquant.",
  },
  {
    id: "HANDICAP_WHOLE_HALF",
    category: "HANDICAP",
    label_fr: "Handicap (lignes entières et demi-lignes)",
    required_inputs: ["scoreFinal"],
    model_function: "N/A (dérivé directement du score, pas de modèle probabiliste dédié requis pour la résolution)",
    resolver_function: "lib/resolvers.js#resolveMarketWin (gère WIN/LOSS/VOID correctement pour lignes .0/.5)",
    min_data_quality: "low",
    availability_status: "MODELLED_AND_VALIDATED",
    version: "v1",
    notes: "En production. Le VOID (push) sur ligne entière est géré depuis cette session.",
  },
  {
    id: "HANDICAP_QUARTER",
    category: "HANDICAP",
    label_fr: "Handicap asiatique quart de ligne (.25 / .75)",
    required_inputs: ["scoreFinal"],
    model_function: "N/A",
    resolver_function: "lib/resolvers.js#resolveMarketWin retourne explicitement null (refuse de résoudre)",
    min_data_quality: "low",
    availability_status: "NOT_SUPPORTED",
    version: "v1",
    notes: "Découvert et corrigé cette session : l'ancien code aurait résolu une ligne .25/.75 comme un WIN/LOSS complet, alors que le vrai règlement Asian Handicap nécessite un demi-gain/demi-perte (split sur deux lignes). Refuse maintenant explicitement plutôt que de mal compter. Nécessite d'étendre le contrat de retour de resolveMarketWin (valeur fractionnaire) avant activation - MASTER V2.1 §8.2 : 'Le resolver doit être terminé avant activation UI.'",
  },
  {
    id: "HALF_TIME_MARKETS",
    category: "TIME_SEGMENT",
    label_fr: "Marchés mi-temps (HT 1X2, HT O/U, HT BTTS)",
    required_inputs: ["distribution temporelle des buts par tranche horaire"],
    model_function: "NOT_IMPLEMENTED",
    resolver_function: "NOT_IMPLEMENTED",
    min_data_quality: "n/a",
    availability_status: "NOT_SUPPORTED",
    version: "n/a",
    notes: "MASTER §8.3/§10.W : nécessite un modèle temporel séparé (piecewise Poisson process ou équivalent), ne pas extrapoler full-time/2. Aucune donnée de distribution par tranche horaire collectée aujourd'hui.",
  },
  {
    id: "CORNERS",
    category: "CORNERS",
    label_fr: "Marchés corners",
    required_inputs: ["historique corners for/against par équipe"],
    model_function: "NOT_IMPLEMENTED",
    resolver_function: "NOT_IMPLEMENTED",
    min_data_quality: "n/a",
    availability_status: "NOT_SUPPORTED",
    version: "n/a",
    notes: "MASTER §8.4/§10.X : modèle séparé obligatoire (jamais dérivé de la matrice de buts). Le pipeline n'appelle pas aujourd'hui l'endpoint statistiques nécessaire pour accumuler un historique de corners par équipe.",
  },
  {
    id: "CARDS",
    category: "CARDS",
    label_fr: "Marchés cartons",
    required_inputs: ["historique cartons/fautes par équipe et arbitre"],
    model_function: "NOT_IMPLEMENTED",
    resolver_function: "NOT_IMPLEMENTED",
    min_data_quality: "n/a",
    availability_status: "NOT_SUPPORTED",
    version: "n/a",
    notes: "MASTER §8.5/§10.Y : idem corners, modèle séparé requis, données pas encore collectées à l'échelle nécessaire.",
  },
  {
    id: "PLAYER_PROPS",
    category: "PLAYER_PROPS",
    label_fr: "Player props (buteur, tirs, cartons joueur)",
    required_inputs: ["P(starter)", "expected_minutes", "player_goal_rate", "team_goal_distribution", "opponent_defence"],
    model_function: "NOT_IMPLEMENTED",
    resolver_function: "NOT_IMPLEMENTED",
    min_data_quality: "n/a",
    availability_status: "NOT_SUPPORTED",
    version: "n/a",
    notes: "MASTER §8.6/§10.Z. Nécessite le Player Impact Engine (§10.G) et le Lineup Strength Engine (§10.J), aucun des deux encore construit.",
  },
];

function getMarket(id) {
  return MARKET_REGISTRY.find((m) => m.id === id) || null;
}

function getMarketsByStatus(status) {
  return MARKET_REGISTRY.filter((m) => m.availability_status === status);
}

module.exports = { MARKET_REGISTRY, getMarket, getMarketsByStatus };
