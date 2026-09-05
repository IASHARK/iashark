"use strict";
// MARKET LAB - PHASE 2 (2026-09-05), items 8-9-13. Construit le
// benchmark consensus APRES devig (jamais avant : ce module ne recoit
// jamais une cote brute, uniquement des probabilites deja deviggees
// par bookmaker - lib/market-lab/devig.js#flattenDevigResult) ET
// separement le meilleur prix executable (jamais fabrique a partir du
// consensus - item 13).

const CONSENSUS_METHOD = "MEDIAN_OF_BOOKMAKER_DEVIG_PROBABILITIES";

function quantile(sortedValues, p) {
  if (sortedValues.length === 1) return sortedValues[0];
  const idx = p * (sortedValues.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sortedValues[lo];
  return sortedValues[lo] + (sortedValues[hi] - sortedValues[lo]) * (idx - lo);
}

function summarize(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    n_bookmakers: sorted.length,
    median: quantile(sorted, 0.5),
    mean: sorted.reduce((a, b) => a + b, 0) / sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    iqr: quantile(sorted, 0.75) - quantile(sorted, 0.25),
  };
}

// rows = [{ fixture_id, canonical_market_id, bookmaker_id, shin_probability, proportional_probability }, ...]
// UNE ligne par bookmaker par selection, DEJA deviggee (produite par
// devig.js#flattenDevigResult pour chaque bookmaker separement, jamais
// fusionnee avant cet appel).
function buildDevigConsensus(rows) {
  const buckets = new Map();
  for (const row of rows) {
    const key = `${row.fixture_id}|${row.canonical_market_id}`;
    if (!buckets.has(key)) buckets.set(key, { fixture_id: row.fixture_id, canonical_market_id: row.canonical_market_id, shin: [], proportional: [] });
    const bucket = buckets.get(key);
    if (row.shin_probability != null) bucket.shin.push(row.shin_probability);
    if (row.proportional_probability != null) bucket.proportional.push(row.proportional_probability);
  }

  const consensus = [];
  for (const bucket of buckets.values()) {
    const shinSummary = summarize(bucket.shin);
    consensus.push({
      fixture_id: bucket.fixture_id,
      canonical_market_id: bucket.canonical_market_id,
      consensus_method: CONSENSUS_METHOD,
      devig_method: "SHIN",
      bookmakers_count: shinSummary ? shinSummary.n_bookmakers : 0,
      median_devig_probability: shinSummary ? shinSummary.median : null,
      mean_devig_probability: shinSummary ? shinSummary.mean : null,
      min_devig_probability: shinSummary ? shinSummary.min : null,
      max_devig_probability: shinSummary ? shinSummary.max : null,
      iqr_devig_probability: shinSummary ? shinSummary.iqr : null,
      proportional_diagnostic: summarize(bucket.proportional),
    });
  }
  return consensus;
}

// offers = liste d'offres VALIDES, PRE-MATCH (excluded_post_kickoff
// false) pour UN (fixture_id, canonical_market_id) - jamais une cote
// consensus fictive (item 13 : "Ne jamais utiliser une cote consensus
// fictive pour le calcul d'un futur ROI").
function bestExecutableOffer(offers) {
  const eligible = offers.filter((o) => !o.excluded_post_kickoff);
  if (!eligible.length) return null;
  const sorted = eligible.slice().sort((a, b) => {
    if (b.decimal_odds !== a.decimal_odds) return b.decimal_odds - a.decimal_odds;
    const idA = a.bookmaker_id != null ? String(a.bookmaker_id) : (a.bookmaker_name || "");
    const idB = b.bookmaker_id != null ? String(b.bookmaker_id) : (b.bookmaker_name || "");
    return idA.localeCompare(idB);
  });
  const best = sorted[0];
  return {
    fixture_id: best.fixture_id,
    canonical_market_id: best.canonical_market_id,
    best_decimal_odds: best.decimal_odds,
    best_bookmaker_id: best.bookmaker_id,
    best_bookmaker_name: best.bookmaker_name,
    odds_snapshot_id: best.odds_snapshot_id,
    n_bookmakers: eligible.length,
  };
}

module.exports = { buildDevigConsensus, bestExecutableOffer, CONSENSUS_METHOD, quantile };
