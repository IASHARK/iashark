"use strict";
// RUN_OUTPUT_ENGINE (2026-09-06). SAFE_PICK_OF_THE_DAY : UNE seule
// selection, criteres strictement plus durs que les picks normaux.
// Exclusivement des jambes SCORE (SCORE_STATUS=VALIDATED ET
// score_runnable=true exiges explicitement - jamais une jambe PLAYER
// pour la SAFE). Consomme la probabilite modele deja calculee ; ne la
// recalcule ni ne la remplace jamais par SAFE_ROBUSTNESS_SCORE (qui
// n'est PAS une probabilite).

const { isLeagueScoreEligible } = require("./eligibility.js");
const { isMarketSupportedForCombo } = require("./market-status.js");
const { computeSafeRobustnessScore } = require("./robustness.js");

const SAFE_MIN_ODDS = 1.5;
const SAFE_MIN_MODEL_PROBABILITY = 0.55;
const SAFE_MAX_UNCERTAINTY = 0.08; // ecart-type posterieur max tolere, si fourni
const SAFE_MIN_STABILITY = "STABLE";
const SAFE_MIN_GAP_VS_SECOND_BEST = 0.12;

// Regroupe les candidats SCORE par (fixture_id, famille de marche
// mutuellement exclusive) pour calculer l'ecart avec le 2e meilleur
// choix DU MEME match sur LE MEME marche (ex: p(HOME) vs p(DRAW) vs
// p(AWAY) pour FT_1X2). Jamais invente : sans famille connue, le gap
// reste indisponible et le candidat est exclu (critere non verifiable).
function marketFamilyOf(marketId) {
  if (marketId.startsWith("FT_1X2_")) return "FT_1X2";
  if (marketId.startsWith("FT_DC_")) return "FT_DC";
  if (marketId.startsWith("FT_BTTS_")) return "FT_BTTS";
  const totalMatch = marketId.match(/^FT_TOTAL_(\d+\.\d)_(OVER|UNDER)$/);
  if (totalMatch) return `FT_TOTAL_${totalMatch[1]}`;
  const teamTotalMatch = marketId.match(/^FT_TEAM_TOTAL_(HOME|AWAY)_(\d+\.\d)_(OVER|UNDER)$/);
  if (teamTotalMatch) return `FT_TEAM_TOTAL_${teamTotalMatch[1]}_${teamTotalMatch[2]}`;
  return null;
}

function computeGapVsSecondBest(candidate, allScoreCandidates) {
  const family = marketFamilyOf(candidate.market);
  if (!family) return null;
  const siblings = allScoreCandidates.filter((c) => c.fixture_id === candidate.fixture_id && marketFamilyOf(c.market) === family);
  if (siblings.length < 2) return null;
  const sortedProbs = siblings.map((s) => s.model_probability).sort((a, b) => b - a);
  return sortedProbs[0] - sortedProbs[1];
}

function passesSafeCriteria({ candidate, registry, gapVsSecondBest }) {
  const entry = registry.leagues[candidate.league_key];
  if (!isLeagueScoreEligible(entry)) return { pass: false, reason: "SCORE_NOT_VALIDATED_OR_NOT_RUNNABLE" };
  if (!isMarketSupportedForCombo(candidate)) return { pass: false, reason: "MARKET_NOT_SUPPORTED_OR_HOLD" };
  if (typeof candidate.decimal_odds !== "number" || candidate.decimal_odds < SAFE_MIN_ODDS) return { pass: false, reason: "ODDS_BELOW_MIN" };
  if (candidate.data_quality_status !== "PASS") return { pass: false, reason: "DATA_QUALITY_NOT_PASS" };
  if (candidate.model_probability < SAFE_MIN_MODEL_PROBABILITY) return { pass: false, reason: "MODEL_PROBABILITY_TOO_LOW" };
  if (candidate.model_probability_uncertainty != null && candidate.model_probability_uncertainty > SAFE_MAX_UNCERTAINTY) return { pass: false, reason: "UNCERTAINTY_TOO_HIGH" };
  if (candidate.snapshot_stability !== SAFE_MIN_STABILITY) return { pass: false, reason: "SNAPSHOT_NOT_STABLE" };
  if (gapVsSecondBest == null || gapVsSecondBest < SAFE_MIN_GAP_VS_SECOND_BEST) return { pass: false, reason: "GAP_VS_SECOND_BEST_INSUFFICIENT" };
  if (candidate.market_consensus_probability != null) {
    const disagreement = Math.abs(candidate.model_probability - candidate.market_consensus_probability);
    if (disagreement > 0.20) return { pass: false, reason: "MODEL_MARKET_CONFLICT" };
  }
  return { pass: true, reason: null };
}

function round2(x) { return Math.round(x * 10000) / 10000; }
function pct2(x) { return Math.round(x * 10000) / 100; }

function computeSafePickOfDay({ candidates, registry, snapshotTime }) {
  if (!snapshotTime) throw new Error("computeSafePickOfDay: snapshotTime requis (determinisme)");
  const scoreCandidates = (candidates || []).filter((c) => c.source === "SCORE");

  const evaluated = scoreCandidates.map((c) => {
    const gapVsSecondBest = computeGapVsSecondBest(c, scoreCandidates);
    const verdict = passesSafeCriteria({ candidate: c, registry, gapVsSecondBest });
    return { candidate: c, gapVsSecondBest, verdict };
  });

  const passing = evaluated.filter((e) => e.verdict.pass);
  if (!passing.length) {
    return { generated_at: snapshotTime, status: "NO_SAFE_SELECTION", evaluated_count: evaluated.length, rejection_reasons: evaluated.map((e) => e.verdict.reason) };
  }

  // Selection deterministe parmi les qualifies : SAFE_ROBUSTNESS_SCORE
  // decroissant (jamais model_probability seule - c'est explicitement
  // interdit par le protocole), depart d'egalite fixture_id/market asc.
  const scored = passing.map((e) => ({ ...e, safeRobustnessScore: computeSafeRobustnessScore({ candidate: e.candidate, gapVsSecondBest: e.gapVsSecondBest }) }));
  scored.sort((a, b) => {
    if (b.safeRobustnessScore !== a.safeRobustnessScore) return b.safeRobustnessScore - a.safeRobustnessScore;
    if (a.candidate.fixture_id !== b.candidate.fixture_id) return a.candidate.fixture_id - b.candidate.fixture_id;
    return String(a.candidate.market).localeCompare(String(b.candidate.market));
  });
  const winner = scored[0];
  const c = winner.candidate;

  return {
    generated_at: snapshotTime,
    status: "SELECTED",
    fixture: { fixture_id: c.fixture_id, home_team: c.home_team, away_team: c.away_team, kickoff: c.kickoff },
    league: c.league_key,
    selection: c.selection,
    market: c.market,
    model_probability: round2(c.model_probability),
    model_probability_pct: pct2(c.model_probability),
    decimal_odds: c.decimal_odds,
    robustness_score: winner.safeRobustnessScore,
    snapshot_stability: c.snapshot_stability,
    data_quality_status: c.data_quality_status,
    lineup_status: c.lineup_status ?? null,
    snapshot_time: snapshotTime,
    reason_selected: `Score le plus robuste du RUN (SAFE_ROBUSTNESS_SCORE=${winner.safeRobustnessScore}) parmi ${passing.length} candidat(s) ayant passe tous les criteres stricts (SCORE_STATUS=VALIDATED, score_runnable, cote>=${SAFE_MIN_ODDS}, DATA_QUALITY=PASS, probabilite>=${SAFE_MIN_MODEL_PROBABILITY}, stabilite=STABLE, ecart 2e choix>=${SAFE_MIN_GAP_VS_SECOND_BEST}).`,
    evaluated_count: evaluated.length,
  };
}

module.exports = { computeSafePickOfDay, passesSafeCriteria, computeGapVsSecondBest, marketFamilyOf, SAFE_MIN_ODDS, SAFE_MIN_MODEL_PROBABILITY, SAFE_MAX_UNCERTAINTY, SAFE_MIN_GAP_VS_SECOND_BEST };
