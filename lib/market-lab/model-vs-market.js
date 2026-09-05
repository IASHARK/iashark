"use strict";
// MARKET LAB - PHASE 2 (2026-09-05), items 7 et 10. AUCUN EV, AUCUN
// Kelly, AUCUN seuil ici - uniquement le GAP model-vs-market (jamais
// nomme "edge" au sens betting/promotion, la calibration n'a pas encore
// ete validee).

// DNB : le nul est rembourse, donc la probabilite conditionnelle
// pertinente du modele est win/(win+loss), PAS win seul et PAS
// 1/odds_dnb naivement compare a P(win). Conserve les trois masses
// d'origine (win/push/loss) pour ne jamais reduire DNB a un chiffre
// (meme regle que market-catalogue.js#threeWayMarket).
function dnbConditionalFromModel({ winProbability, pushProbability, lossProbability }) {
  const nonPush = winProbability + lossProbability;
  return {
    model_win: winProbability,
    model_push: pushProbability,
    model_loss: lossProbability,
    conditional_nonpush_model_probability: nonPush > 0 ? winProbability / nonPush : null,
  };
}

// Meme logique cote marche : SI un jour une cote DNB plein-temps directe
// existe (aujourd'hui absente de la source - voir odds-ingest.js), sa
// probabilite brute 1/odds N'EST PAS comparable telle quelle a
// model_win (elle inclut deja implicitement le remboursement du push
// dans le prix, mais pas la meme decomposition win/push/loss qu'un
// 1X2). Cette fonction reste prete pour ce cas, non exercee aujourd'hui
// faute de donnee reelle (aucune cote DNB plein-temps observee).
function dnbConditionalFromDecimalOdds(decimalOdds) {
  if (!(typeof decimalOdds === "number" && Number.isFinite(decimalOdds) && decimalOdds > 1)) return null;
  return { market_conditional_nonpush_probability: 1 / decimalOdds };
}

// PAS "edge" : aucun seuil, aucune decision BET/NO BET. Juste l'ecart
// signe entre la probabilite du modele et le consensus marche
// deja deviggue.
function buildModelMarketGap({ fixtureId, marketId, modelProbability, consensusMarketProbability }) {
  return {
    fixture_id: fixtureId,
    market_id: marketId,
    model_probability: modelProbability,
    consensus_market_probability: consensusMarketProbability,
    probability_gap: modelProbability - consensusMarketProbability,
  };
}

module.exports = { dnbConditionalFromModel, dnbConditionalFromDecimalOdds, buildModelMarketGap };
