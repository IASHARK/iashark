"use strict";

function validateEvidence(name, evidence) {
  if (!evidence) return { events: 0, matches: 0 };
  const events = Number(evidence.events);
  const matches = Number(evidence.matches);
  if (!Number.isFinite(events) || events < 0) throw new RangeError(name + ".events must be non-negative");
  if (!Number.isFinite(matches) || matches < 0) throw new RangeError(name + ".matches must be non-negative");
  return { events, matches };
}

// Empirical-Bayes blend for the opening weeks. The previous season is a
// regularised prior, not an equal continuation of the current season. Its
// effective sample is capped so new competitive matches progressively take
// control. Friendlies are deliberately excluded from the production rate.
function blendEarlySeasonRate(input) {
  input = input || {};
  const current = validateEvidence("current", input.current);
  const previous = validateEvidence("previous", input.previous);
  const leagueRate = Number(input.leaguePrior && input.leaguePrior.rate);
  const leagueMatches = Number(input.leaguePrior && input.leaguePrior.equivalentMatches);
  if (!Number.isFinite(leagueRate) || leagueRate < 0) throw new RangeError("leaguePrior.rate must be non-negative");
  if (!Number.isFinite(leagueMatches) || leagueMatches <= 0) throw new RangeError("leaguePrior.equivalentMatches must be positive");

  const configuredPrior = Number(input.previousEquivalentMatches || 8);
  const decayingPrior = Math.max(0, configuredPrior - current.matches * 0.5);
  const previousEquivalentMatches = Math.min(previous.matches, decayingPrior);
  const previousRate = previous.matches > 0 ? previous.events / previous.matches : leagueRate;
  const weightedEvents = current.events + previousRate * previousEquivalentMatches + leagueRate * leagueMatches;
  const weightedMatches = current.matches + previousEquivalentMatches + leagueMatches;

  return {
    rate: weightedEvents / weightedMatches,
    currentMatches: current.matches,
    previousEquivalentMatches,
    leagueEquivalentMatches: leagueMatches,
    friendliesUsed: false,
  };
}

module.exports = { blendEarlySeasonRate };
