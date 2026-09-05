"use strict";
// MARKET LAB - PHASE 2.5 (2026-09-05), item 9. Lie IMMUABLEMENT le
// resultat REGLEMENTAIRE (90 minutes, jamais AET/PEN) d'une fixture aux
// marches V1. Reutilise EXCLUSIVEMENT lib/resolvers.js#extractRegulationScore
// / classifyFixtureStatus - deja audite et corrige le 2026-09-04
// (BLOCKER_IMPLEMENTATION : l'ancienne resolution lisait le score APRES
// prolongation) - jamais reimplemente ici.

const { extractRegulationScore, classifyFixtureStatus } = require("../resolvers.js");

// PHASE 3A (2026-09-05), item 7 : "kickoff passe" n'est JAMAIS confondu
// avec "match termine" - verifie contre 14 fixtures forward reelles
// dont le coup d'envoi etait deja passe (2026-09-05) : 12 etaient
// effectivement FT, mais 2 etaient encore en "1H"/"2H" (en cours), ce
// que classifyFixtureStatus distingue correctement (status="PENDING",
// jamais "FINISHED").
const RESULT_STATUS = { SETTLED: "SETTLED", PENDING: "PENDING", VOID: "VOID" };

function resultStatusFor(classifiedStatus) {
  if (classifiedStatus === "FINISHED") return RESULT_STATUS.SETTLED;
  if (classifiedStatus === "VOID") return RESULT_STATUS.VOID;
  return RESULT_STATUS.PENDING;
}

// fixture = objet brut api-football (fixture.fixture.status.short,
// fixture.score.fulltime.*, fixture.goals.*) - meme forme que celle
// deja consommee par lib/resolvers.js ailleurs dans le pipeline.
function buildResultsLink(fixture) {
  const fixtureId = fixture && fixture.fixture ? fixture.fixture.id : null;
  const shortStatus = (fixture && fixture.fixture && fixture.fixture.status && fixture.fixture.status.short) || "";
  const status = classifyFixtureStatus(shortStatus);
  if (status !== "FINISHED") {
    return Object.freeze({ fixture_id: fixtureId, status, result_status: resultStatusFor(status), goals_home_90: null, goals_away_90: null, is_regulation_final: false });
  }
  const { gh, ga } = extractRegulationScore(fixture);
  const isRegulationFinal = gh != null && ga != null;
  return Object.freeze({
    fixture_id: fixtureId,
    status,
    result_status: isRegulationFinal ? RESULT_STATUS.SETTLED : RESULT_STATUS.PENDING,
    goals_home_90: gh,
    goals_away_90: ga,
    is_regulation_final: isRegulationFinal,
  });
}

// Reglement generique par ID canonique V1 (item 9 : lier "market
// outcomes" immuablement). Analyse l'ID canonique lui-meme, jamais une
// resolution ad-hoc par marche. Retourne WIN/LOSE/PUSH, ou null si le
// resultat reglementaire n'est pas disponible - aucune fabrication.
function resolveCanonicalMarketOutcome(marketId, selection, { homeGoals, awayGoals }) {
  if (homeGoals == null || awayGoals == null) return null;
  const total = homeGoals + awayGoals;

  if (marketId.startsWith("FT_1X2_")) {
    const outcome = homeGoals > awayGoals ? "HOME" : homeGoals < awayGoals ? "AWAY" : "DRAW";
    return outcome === selection ? "WIN" : "LOSE";
  }
  if (marketId.startsWith("FT_DC_")) {
    const home = homeGoals > awayGoals, draw = homeGoals === awayGoals, away = homeGoals < awayGoals;
    if (selection === "1X") return home || draw ? "WIN" : "LOSE";
    if (selection === "X2") return draw || away ? "WIN" : "LOSE";
    if (selection === "12") return home || away ? "WIN" : "LOSE";
    return null;
  }
  if (marketId.startsWith("FT_DNB_")) {
    if (homeGoals === awayGoals) return "PUSH";
    const homeWon = homeGoals > awayGoals;
    if (selection === "HOME") return homeWon ? "WIN" : "LOSE";
    if (selection === "AWAY") return !homeWon ? "WIN" : "LOSE";
    return null;
  }
  if (marketId.startsWith("FT_BTTS_")) {
    const bothScored = homeGoals > 0 && awayGoals > 0;
    if (selection === "YES") return bothScored ? "WIN" : "LOSE";
    if (selection === "NO") return !bothScored ? "WIN" : "LOSE";
    return null;
  }
  const totalMatch = /^FT_TOTAL_(\d+(?:\.\d+)?)_(OVER|UNDER)$/.exec(marketId);
  if (totalMatch) {
    const over = total > Number(totalMatch[1]);
    return (totalMatch[2] === "OVER") === over ? "WIN" : "LOSE";
  }
  const teamTotalMatch = /^FT_TEAM_TOTAL_(HOME|AWAY)_(\d+(?:\.\d+)?)_(OVER|UNDER)$/.exec(marketId);
  if (teamTotalMatch) {
    const goals = teamTotalMatch[1] === "HOME" ? homeGoals : awayGoals;
    const over = goals > Number(teamTotalMatch[2]);
    return (teamTotalMatch[3] === "OVER") === over ? "WIN" : "LOSE";
  }
  const exactScoreMatch = /^FT_EXACT_SCORE_(\d+)_(\d+)$/.exec(marketId);
  if (exactScoreMatch) {
    return Number(exactScoreMatch[1]) === homeGoals && Number(exactScoreMatch[2]) === awayGoals ? "WIN" : "LOSE";
  }
  return null;
}

module.exports = { buildResultsLink, resolveCanonicalMarketOutcome, RESULT_STATUS };
