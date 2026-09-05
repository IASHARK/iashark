"use strict";
// MARKET LAB - PHASE 3A (2026-09-05), item 17. Rapport de qualite de
// donnees QUOTIDIEN, descriptif uniquement - pure fonction, prend des
// chiffres deja calcules par l'appelant (jamais de requete live ici).
function buildDailyMonitoringReport(input) {
  return {
    fixtures_followed: input.fixturesFollowed,
    fixtures_settled: input.fixturesSettled,
    snapshots_by_phase: input.snapshotsByPhase,
    bookmaker_coverage: input.bookmakerCoverage,
    market_coverage: input.marketCoverage,
    missing_phases: input.missingPhases,
    invalid_odds_count: input.invalidOddsCount,
    shin_failure_count: input.shinFailureCount,
    model_snapshot_failure_count: input.modelSnapshotFailureCount,
    api_calls_today: input.apiCallsToday,
    api_quota_remaining: input.apiQuotaRemaining != null ? input.apiQuotaRemaining : null,
  };
}

module.exports = { buildDailyMonitoringReport };
