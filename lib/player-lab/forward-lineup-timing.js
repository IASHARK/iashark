"use strict";
// PLAYER LAB (2026-09-05), item 21. Capture FORWARD des timestamps de
// confirmation de lineup - n'interfere jamais avec le dataset
// historique (le pilot PRE_LINEUP/POST_LINEUP_CONDITIONAL reste base
// sur les donnees deja collectees). Objectif : accumuler assez de
// couples (first_seen_lineup_at, kickoff) REELS pour transformer plus
// tard POST_LINEUP_CONDITIONAL en POST_LINEUP_OPERATIONAL (voir
// modes.js) - pas encore atteignable aujourd'hui (0 observation).
//
// Fonctions pures uniquement ici : le script de collecte reel (qui
// appellerait /fixtures/lineups a intervalles reguliers sur les
// fixtures deja suivies) n'est PAS deploye dans cette session - prepare
// et teste, en attente d'une decision explicite de planification (meme
// discipline que Market Lab Phase 3A avant d'activer un cron).

function recordLineupObservation({ fixtureId, kickoff, observedAt, lineupResponse }) {
  const isNonEmpty = Array.isArray(lineupResponse) && lineupResponse.length >= 2;
  const minutesBeforeKickoff = (new Date(kickoff).getTime() - new Date(observedAt).getTime()) / 60000;
  return {
    fixture_id: fixtureId,
    kickoff,
    observed_at: observedAt,
    minutes_before_kickoff: minutesBeforeKickoff,
    lineup_non_empty: isNonEmpty,
  };
}

// Reduit une SERIE d'observations (plusieurs passages du collecteur sur
// la meme fixture) au premier instant ou une reponse a ete vue (meme
// vide) et au premier instant ou elle etait NON VIDE - jamais recalcule
// retroactivement si un instant plus ancien existe deja en cache.
function reduceToFirstSeen(observations) {
  const sorted = observations.slice().sort((a, b) => new Date(a.observed_at) - new Date(b.observed_at));
  const firstSeen = sorted[0] || null;
  const firstNonEmpty = sorted.find((o) => o.lineup_non_empty) || null;
  return {
    fixture_id: firstSeen ? firstSeen.fixture_id : null,
    first_seen_response_at: firstSeen ? firstSeen.observed_at : null,
    first_non_empty_lineup_at: firstNonEmpty ? firstNonEmpty.observed_at : null,
    kickoff: firstSeen ? firstSeen.kickoff : null,
    minutes_before_kickoff_at_first_non_empty: firstNonEmpty ? firstNonEmpty.minutes_before_kickoff : null,
  };
}

module.exports = { recordLineupObservation, reduceToFirstSeen };
