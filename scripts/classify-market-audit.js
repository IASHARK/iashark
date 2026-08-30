#!/usr/bin/env node
"use strict";
// Compare odds-market-audit-report.json (donnees REELLES collectees par
// scripts/audit-odds-markets.js) au Market Registry interne
// (lib/market-registry.js) et classe chaque marche selon la regle du MASTER
// V2.1 §8 rappelee explicitement par l'utilisateur : un marche n'est JAMAIS
// publie avec une probabilite IASHARK juste parce qu'un bookmaker le propose
// - il faut un modele mathematique specifique cote nous.
//
// Classification (vocabulaire de cet audit, distinct du vocabulaire interne
// availability_status du Market Registry - voir mapping explicite ci-dessous) :
//   MODEL_SUPPORTED    : on a un modele IASHARK (registry MODELLED_*) mais
//                        aucune cote reelle observee pour ce marche - le
//                        moteur doit pouvoir analyser sans cote (deja une
//                        exigence produit), ce statut le confirme marche par
//                        marche.
//   MODEL_AND_ODDS     : on a un modele IASHARK ET des cotes reelles
//                        observees pour le marche correspondant.
//   ODDS_AVAILABLE_ONLY: le bookmaker propose reellement ce marche mais nous
//                        n'avons AUCUN modele - ne jamais afficher de
//                        probabilite IASHARK dessus (uniquement la cote brute
//                        si affichee).
//   INSUFFICIENT_DATA  : ni modele fiable ni cote suffisamment fiable (trouve
//                        sur un seul bookmaker et/ou une seule fixture sur
//                        tout l'echantillon) pour s'appuyer dessus.
//   NOT_AVAILABLE      : ni modele ni cote observee du tout dans cet audit.
"use strict";
const fs = require("fs");
const path = require("path");
const { MARKET_REGISTRY } = require(path.join(__dirname, "..", "lib", "market-registry.js"));

const ROOT = path.join(__dirname, "..");
const AUDIT_PATH = path.join(ROOT, "odds-market-audit-report.json");
const OUT_PATH = path.join(ROOT, "market-audit-classification.json");

// Mapping explicite et revu manuellement entre nos entrees du Market
// Registry et les bet_id reels observes dans l'audit (ids API-Football
// confirmes dans odds-market-audit-report.json, jamais devines a l'aveugle).
// Chaque entree note aussi les cas ou le libelle bookmaker ne correspond pas
// exactement 1:1 a notre marche (proxy, split home/away, etc.) - transparence
// plutot que faux positif silencieux.
const REGISTRY_TO_BET_IDS = {
  MATCH_WINNER: { betIds: [1], note: "bet_id 1 'Match Winner' = 1X2 plein match, correspondance directe." },
  DOUBLE_CHANCE: { betIds: [12], note: "bet_id 12 'Double Chance' = correspondance directe." },
  DRAW_NO_BET: { betIds: [], note: "AUCUN bet type plein-match 'Draw No Bet' dans le catalogue API-Football (338 entrees) - seuls 'Draw No Bet (1st Half)' [109] et '(2nd Half)' [182] existent. Un proxy indirect existe (Handicap Result [9] a la ligne 0.0) mais n'est pas un flux 'DNB' verifie ; pas retenu comme correspondance directe tant que non teste." },
  TOTAL_GOALS: { betIds: [5], note: "bet_id 5 'Goals Over/Under' plein match = correspondance directe (lignes 0.5-6.5)." },
  TEAM_TOTALS: { betIds: [16, 17], note: "bet_id 16/17 'Total - Home'/'Total - Away' = correspondance directe. Resolver toujours NOT_IMPLEMENTED cote nous (deja documente dans le registry), independant de la disponibilite des cotes." },
  BTTS: { betIds: [8], note: "bet_id 8 'Both Teams Score' plein match = correspondance directe." },
  CLEAN_SHEET: { betIds: [27, 28], note: "bet_id 27/28 'Clean Sheet - Home/Away' = correspondance directe (split home/away). Le bet type combine 'Clean Sheet' [188] n'a lui pas ete observe chez nos bookmakers echantillonnes." },
  WIN_TO_NIL: { betIds: [36, 29, 30], note: "bet_id 36 'Win To Nil' (generique) + 29/30 (split home/away) = correspondance directe." },
  EXACT_SCORE: { betIds: [10], note: "bet_id 10 'Exact Score' plein match = correspondance directe." },
  GOAL_BANDS: { betIds: [], note: "Aucun bet type 'bandes de buts' (0-1/2-3/4-5/6+) dans le catalogue API-Football - les bookmakers ne pricent pas ce decoupage, c'est une metrique propre a IASHARK." },
  HANDICAP_WHOLE_HALF: { betIds: [4], note: "bet_id 4 'Asian Handicap' plein match = correspondance directe (lignes entieres et demi-lignes incluses dans le meme flux)." },
  HANDICAP_QUARTER: { betIds: [4], note: "Les lignes quart (.25/.75) sont retournees dans le MEME flux 'Asian Handicap' [4] que les lignes entieres/demies - impossible de les isoler par bet_id. La cote existe donc bien, mais notre resolver refuse explicitement de regler ces lignes (voir lib/resolvers.js) : c'est une limite de modele/resolver cote nous, pas un manque de donnee bookmaker." },
  HALF_TIME_MARKETS: { betIds: [13, 6, 34, 7], note: "bet_id 13 'First Half Winner', 6 'Goals O/U First Half', 34 'BTTS First Half', 7 'HT/FT Double' = marches mi-temps reellement proposes par les bookmakers. Aucun modele temporel IASHARK dedie (MASTER §10.W) : jamais de probabilite IASHARK affichee dessus." },
  CORNERS: { betIds: [45, 55, 57, 58], note: "bet_id 45 'Corners Over Under', 55 'Corners 1x2', 57/58 Home/Away = marches corners reellement proposes et liquides (frequence maximale observee). Aucun modele corners cote nous." },
  CARDS: { betIds: [80, 81, 82, 83], note: "bet_id 80 'Cards Over/Under', 81 'Cards Asian Handicap', 82/83 Home/Away Total Cards = reellement proposes (frequence ~0.73). Aucun modele cartons cote nous." },
  ANYTIME_GOALSCORER: { betIds: [92, 218, 231], note: "bet_id 92 'Anytime Goal Scorer' (freq=0.867) + variantes Home/Away 218/231 = correspondance directe. Player Engine ajoute le 2026-08-30 (lib/markets/player-engine.js)." },
  PLAYER_SHOTS: { betIds: [240, 241, 276], note: "bet_id 240/241 'Home/Away Player Shots' + 276 'Away Player Shots Total' = correspondance directe." },
  PLAYER_SHOTS_ON_TARGET: { betIds: [242, 269, 275], note: "bet_id 242 'Player Shots On Target' + 269/275 'Home/Away Player Shots On Target Total' = correspondance directe." },
  PLAYER_PROPS: { betIds: [212, 257, 215], note: "Player Assists/Score-or-Assist/Singles - hors perimetre du Player Engine actuel (buteur/tirs/tirs cadres uniquement). Necessite des extensions futures (passes decisives, etc.) - MASTER §8.6/§10.Z." },
};

function classifyMappedRegistryEntry(entry, betIdsInfo, observedByBetId) {
  var hasModel = entry.availability_status === "MODELLED_AND_VALIDATED" || entry.availability_status === "MODELLED_EXPERIMENTAL";
  var observedMatches = betIdsInfo.betIds.map(function (id) { return observedByBetId[id]; }).filter(Boolean);
  var maxFrequency = observedMatches.reduce(function (max, m) { return Math.max(max, m.real_frequency); }, 0);
  var totalBookmakers = observedMatches.reduce(function (max, m) { return Math.max(max, m.bookmaker_count); }, 0);
  var hasRealOdds = observedMatches.length > 0 && maxFrequency > 0;

  var classification;
  if (hasModel && hasRealOdds) classification = "MODEL_AND_ODDS";
  else if (hasModel && !hasRealOdds) classification = "MODEL_SUPPORTED";
  else if (!hasModel && hasRealOdds) classification = "ODDS_AVAILABLE_ONLY";
  else classification = "NOT_AVAILABLE";

  return {
    registry_id: entry.id,
    registry_status: entry.availability_status,
    matched_bet_ids: betIdsInfo.betIds,
    matched_bet_names: observedMatches.map(function (m) { return m.market_name_api; }),
    real_frequency_max: +maxFrequency.toFixed(3),
    bookmaker_count_max: totalBookmakers,
    classification: classification,
    mapping_note: betIdsInfo.note,
  };
}

function main() {
  var audit = JSON.parse(fs.readFileSync(AUDIT_PATH, "utf8"));
  var observedByBetId = {};
  audit.markets_observed.forEach(function (m) { observedByBetId[m.bet_id] = m; });

  var registryClassifications = MARKET_REGISTRY.map(function (entry) {
    var mapping = REGISTRY_TO_BET_IDS[entry.id] || { betIds: [], note: "Aucune correspondance bet_id identifiee dans cet audit (pas de marche bookmaker jugee equivalente)." };
    return classifyMappedRegistryEntry(entry, mapping, observedByBetId);
  });

  var mappedBetIds = {};
  Object.keys(REGISTRY_TO_BET_IDS).forEach(function (k) { REGISTRY_TO_BET_IDS[k].betIds.forEach(function (id) { mappedBetIds[id] = true; }); });

  // Marches observes reellement mais SANS correspondance registry -> classes
  // par un seuil objectif et documente (pas de jugement au cas par cas pour
  // ~150 marches, mais une regle transparente basee sur la frequence/le
  // nombre de bookmakers reellement mesures).
  var unmappedObserved = audit.markets_observed.filter(function (m) { return !mappedBetIds[m.bet_id]; });
  var unmappedClassified = unmappedObserved.map(function (m) {
    var thin = m.bookmaker_count <= 1 && m.real_frequency < 0.3;
    return {
      bet_id: m.bet_id,
      market_name_api: m.market_name_api,
      real_frequency: m.real_frequency,
      bookmaker_count: m.bookmaker_count,
      classification: thin ? "INSUFFICIENT_DATA" : "ODDS_AVAILABLE_ONLY",
      rule: thin ? "1 seul bookmaker ET frequence < 0.3 sur l'echantillon reel - trop marginal pour s'appuyer dessus, meme comme simple affichage de cote." : "Bookmaker(s) et frequence reelle suffisants pour un affichage de cote brute, mais aucun modele IASHARK - jamais de probabilite IASHARK dessus (regle explicite).",
    };
  });

  var observedBetIdSet = {};
  audit.markets_observed.forEach(function (m) { observedBetIdSet[m.bet_id] = true; });
  var notAvailableCount = audit.bets_catalog_total - audit.markets_observed.length;

  var summary = {
    MODEL_AND_ODDS: registryClassifications.filter(function (r) { return r.classification === "MODEL_AND_ODDS"; }).length,
    MODEL_SUPPORTED: registryClassifications.filter(function (r) { return r.classification === "MODEL_SUPPORTED"; }).length,
    ODDS_AVAILABLE_ONLY: registryClassifications.filter(function (r) { return r.classification === "ODDS_AVAILABLE_ONLY"; }).length + unmappedClassified.filter(function (u) { return u.classification === "ODDS_AVAILABLE_ONLY"; }).length,
    INSUFFICIENT_DATA: registryClassifications.filter(function (r) { return r.classification === "INSUFFICIENT_DATA"; }).length + unmappedClassified.filter(function (u) { return u.classification === "INSUFFICIENT_DATA"; }).length,
    NOT_AVAILABLE: registryClassifications.filter(function (r) { return r.classification === "NOT_AVAILABLE"; }).length,
    catalog_markets_never_observed_in_this_audit: notAvailableCount,
  };

  var out = {
    generatedAt: new Date().toISOString(),
    source_audit: audit.generatedAt,
    rule_reminder: "Un marche n'est JAMAIS publie avec une probabilite IASHARK juste parce qu'un bookmaker le propose (MASTER V2.1 §8). MODEL_AND_ODDS/MODEL_SUPPORTED sont les deux seuls statuts ou une probabilite IASHARK peut etre affichee (avec etiquette 'experimental' si le registry le dit) ; ODDS_AVAILABLE_ONLY autorise au plus l'affichage de la cote brute, jamais une probabilite modele.",
    registry_markets: registryClassifications,
    unmapped_observed_markets: unmappedClassified,
    catalog_markets_never_observed_count: notAvailableCount,
    summary: summary,
  };
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + "\n");

  console.log("=== Classification par marche du Market Registry ===");
  registryClassifications.forEach(function (r) {
    console.log(r.registry_id.padEnd(22), r.classification.padEnd(18), "(registry:", r.registry_status + ")", r.matched_bet_names.length ? "-> " + r.matched_bet_names.join(", ") : "-> aucune cote observee");
  });
  console.log("\n=== Resume ===");
  console.log(JSON.stringify(summary, null, 2));
  console.log("\nRapport ecrit :", OUT_PATH);
}

if (require.main === module) main();
module.exports = { REGISTRY_TO_BET_IDS: REGISTRY_TO_BET_IDS, classifyMappedRegistryEntry: classifyMappedRegistryEntry };
