"use strict";
// PLAYER LAB - PILOT (2026-09-05), item 7. Verifie la coherence
// minutes/evenements SANS supposer que "minute de substitution =
// minutes jouees" (conventions d'arrondi/temps additionnel variables) -
// mesure les ecarts reels et produit des reason codes, jamais un simple
// pass/fail muet.

const REASON = {
  BENCH_UNUSED_NONZERO_MINUTES: "BENCH_UNUSED_NONZERO_MINUTES", // jamais entre (pas de subst-on) mais minutes>0
  BENCH_USED_ZERO_MINUTES: "BENCH_USED_ZERO_MINUTES", // subst-on trouve mais minutes=0
  STARTER_LOW_MINUTES_NO_EXPLANATION: "STARTER_LOW_MINUTES_NO_EXPLANATION", // <60 min sans sortie ni carton rouge
  SUBST_OFF_MINUTE_MISMATCH: "SUBST_OFF_MINUTE_MISMATCH",
  SUBST_ON_MINUTE_MISMATCH: "SUBST_ON_MINUTE_MISMATCH",
};

const SUBST_OFF_TOLERANCE = 3; // temps additionnel/arrondi API
const SUBST_ON_TOLERANCE = 8; // plus large : depend du temps additionnel total du match, inconnu a l'avance

function findSubstOff(events, teamId, playerId) {
  return events.find((e) => e.type === "subst" && e.team && e.team.id === teamId && e.player && e.player.id === playerId);
}
function findSubstOn(events, teamId, playerId) {
  return events.find((e) => e.type === "subst" && e.team && e.team.id === teamId && e.assist && e.assist.id === playerId);
}
function findRedCard(events, teamId, playerId) {
  return events.find((e) => e.type === "Card" && /red/i.test(e.detail || "") && e.team && e.team.id === teamId && e.player && e.player.id === playerId);
}

function checkRowConsistency(row, eventsResponse) {
  const events = eventsResponse || [];
  const reasons = [];
  const deltas = {};
  const substOff = findSubstOff(events, row.team_id, row.player_id);
  const substOn = findSubstOn(events, row.team_id, row.player_id);
  const redCard = findRedCard(events, row.team_id, row.player_id);

  if (row.lineup_role === "BENCH" && !substOn && row.minutes > 0) reasons.push(REASON.BENCH_UNUSED_NONZERO_MINUTES);
  if (row.lineup_role === "BENCH" && substOn && row.minutes === 0) reasons.push(REASON.BENCH_USED_ZERO_MINUTES);
  if (row.lineup_role === "STARTER" && !substOff && !redCard && row.minutes < 60) reasons.push(REASON.STARTER_LOW_MINUTES_NO_EXPLANATION);

  if (row.lineup_role === "STARTER" && substOff) {
    const expected = substOff.time.elapsed + (substOff.time.extra || 0);
    deltas.subst_off_delta = row.minutes - expected;
    if (Math.abs(deltas.subst_off_delta) > SUBST_OFF_TOLERANCE) reasons.push(REASON.SUBST_OFF_MINUTE_MISMATCH);
  }
  if (row.lineup_role === "BENCH" && substOn) {
    const onMinute = substOn.time.elapsed + (substOn.time.extra || 0);
    const expected = 90 - onMinute;
    deltas.subst_on_delta = row.minutes - expected;
    if (Math.abs(deltas.subst_on_delta) > SUBST_ON_TOLERANCE) reasons.push(REASON.SUBST_ON_MINUTE_MISMATCH);
  }

  return { fixture_id: row.fixture_id, player_id: row.player_id, lineup_role: row.lineup_role, minutes: row.minutes, reasons, deltas };
}

module.exports = { checkRowConsistency, REASON, SUBST_OFF_TOLERANCE, SUBST_ON_TOLERANCE };
