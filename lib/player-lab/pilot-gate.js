"use strict";
// PLAYER LAB - PILOT (2026-09-05), item 17. Seuils PRE-ENREGISTRES
// AVANT toute collecte - ne jamais les changer apres coup.
const PILOT_GATE_THRESHOLDS = {
  MIN_LINEUP_PCT: 99,
  MIN_FIXTURE_PLAYER_PCT: 99,
  MIN_EVENTS_PCT: 99,
  MIN_PLAYER_ID_MAPPING_PCT: 99.5,
  MIN_REGULATORY_GOAL_RECONCILIATION_PCT: 99.5,
};

// report = sortie de scripts/analyze-player-lab-pilot.js. leakageDetected
// = bool (verifie separement par les tests anti-leakage - jamais deduit
// ici, ce module ne fait que comparer des pourcentages aux seuils).
function evaluatePilotGate(report, leakageDetected) {
  const reasons = [];
  if (report.both_teams_lineup_pct < PILOT_GATE_THRESHOLDS.MIN_LINEUP_PCT) reasons.push(`LINEUP_COVERAGE_BELOW_THRESHOLD (${report.both_teams_lineup_pct}% < ${PILOT_GATE_THRESHOLDS.MIN_LINEUP_PCT}%)`);
  if (report.fixture_player_available_pct < PILOT_GATE_THRESHOLDS.MIN_FIXTURE_PLAYER_PCT) reasons.push(`FIXTURE_PLAYER_COVERAGE_BELOW_THRESHOLD (${report.fixture_player_available_pct}% < ${PILOT_GATE_THRESHOLDS.MIN_FIXTURE_PLAYER_PCT}%)`);
  if (report.events_available_pct < PILOT_GATE_THRESHOLDS.MIN_EVENTS_PCT) reasons.push(`EVENTS_COVERAGE_BELOW_THRESHOLD (${report.events_available_pct}% < ${PILOT_GATE_THRESHOLDS.MIN_EVENTS_PCT}%)`);
  if (report.player_id_mapping_pct < PILOT_GATE_THRESHOLDS.MIN_PLAYER_ID_MAPPING_PCT) reasons.push(`PLAYER_ID_MAPPING_BELOW_THRESHOLD (${report.player_id_mapping_pct}% < ${PILOT_GATE_THRESHOLDS.MIN_PLAYER_ID_MAPPING_PCT}%)`);
  if (report.regulatory_goal_reconciliation_pct < PILOT_GATE_THRESHOLDS.MIN_REGULATORY_GOAL_RECONCILIATION_PCT) reasons.push(`GOAL_RECONCILIATION_BELOW_THRESHOLD (${report.regulatory_goal_reconciliation_pct}% < ${PILOT_GATE_THRESHOLDS.MIN_REGULATORY_GOAL_RECONCILIATION_PCT}%)`);
  if (leakageDetected) reasons.push("TEMPORAL_LEAKAGE_DETECTED");

  const status = reasons.length === 0 ? "PASS" : (reasons.length === 1 && !leakageDetected ? "PARTIAL" : "BLOCKED");
  return { status, reasons, thresholds: PILOT_GATE_THRESHOLDS };
}

module.exports = { evaluatePilotGate, PILOT_GATE_THRESHOLDS };
