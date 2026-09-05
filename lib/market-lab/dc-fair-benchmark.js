"use strict";
// MARKET LAB - PHASE 2.5 (2026-09-05), item 3. Double Chance : 1X, X2 et
// 12 se CHEVAUCHENT (1X et X2 partagent le nul) - ce n'est PAS un
// partitionnement mutuellement exclusif/exhaustif, donc un Shin 3-way
// direct sur les trois cotes DC est mathematiquement invalide (Shin
// suppose un marche exhaustif et exclusif, comme 1X2 ou un O/U
// classique). lib/market-lab/devig.js ne devig JAMAIS DC pour cette
// raison (FT_DC absent de MARKET_FAMILIES).
//
// Au lieu de deviguer DC directement, on derive sa probabilite FAIR a
// partir du 1X2 DEJA deviggue (Shin) du MEME bookmaker au MEME snapshot :
//   fair_DC_1X = fair_H + fair_D
//   fair_DC_X2 = fair_D + fair_A
//   fair_DC_12 = fair_H + fair_A
// Ce benchmark sert de PROBABILITE DE REFERENCE (comparable au modele),
// jamais une cote. La cote DC reellement executable chez ce bookmaker
// (bookmaker_dc_odds) reste conservee separement, intacte, pour un futur
// calcul d'EV - cette fonction ne la modifie ni ne la derive jamais.

function buildDcFairBenchmark(shin1x2) {
  if (!shin1x2 || typeof shin1x2.HOME !== "number" || typeof shin1x2.DRAW !== "number" || typeof shin1x2.AWAY !== "number") {
    throw new Error("buildDcFairBenchmark: attend un 1X2 deja deviggue (Shin) avec HOME/DRAW/AWAY numeriques");
  }
  return {
    dc_fair_source: "DERIVED_FROM_SAME_BOOKMAKER_DEVIGGED_1X2",
    FT_DC_1X: shin1x2.HOME + shin1x2.DRAW,
    FT_DC_X2: shin1x2.DRAW + shin1x2.AWAY,
    FT_DC_12: shin1x2.HOME + shin1x2.AWAY,
  };
}

// Associe le benchmark fair (probabilite) a la cote DC reellement
// executable de CE MEME bookmaker, sans jamais les confondre : le fair
// reste une probabilite derivee, bookmakerDcOdds reste une cote brute
// observee (ou null si ce bookmaker n'a pas publie ce cote de DC).
function pairFairBenchmarkWithExecutableOffer(fairBenchmark, canonicalMarketId, bookmakerDcOdds) {
  if (!(canonicalMarketId in fairBenchmark)) throw new Error(`pairFairBenchmarkWithExecutableOffer: ${canonicalMarketId} absent du benchmark fourni`);
  return {
    canonical_market_id: canonicalMarketId,
    dc_fair_source: fairBenchmark.dc_fair_source,
    fair_probability: fairBenchmark[canonicalMarketId],
    bookmaker_dc_odds: bookmakerDcOdds != null ? bookmakerDcOdds : null,
  };
}

module.exports = { buildDcFairBenchmark, pairFairBenchmarkWithExecutableOffer };
