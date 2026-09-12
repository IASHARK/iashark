"""SMOOTH_ACCUMULATOR leg annotation and eligibility filters (user
correction of 2026-09-05, sections 1-2, 6-7).

Pure ticket-construction/reporting logic: reads the already-computed
statistical model (Q) and market consensus, never refits or adjusts either.
"""
from dataclasses import dataclass

from . import config
from .legs import _prob_key


def _market_fair_p(fixture_id, market, selection, line, consensus_by_key):
    """The devigged bookmaker-consensus probability for this exact
    selection. DC has no direct consensus (never Shin-3-way devigged, per
    section 12 of the original spec) — its market_fair_p is reconstructed
    algebraically from the 1X2 consensus medians instead of being left
    undefined."""
    if market == "DC":
        home = consensus_by_key.get((fixture_id, "1X2", None, "HOME"))
        draw = consensus_by_key.get((fixture_id, "1X2", None, "DRAW"))
        away = consensus_by_key.get((fixture_id, "1X2", None, "AWAY"))
        if not (home and draw and away):
            return None
        return {"1X": home.median + draw.median, "X2": draw.median + away.median,
                "12": 1 - draw.median}.get(selection)
    if market == "DNB":
        home = consensus_by_key.get((fixture_id, "1X2", None, "HOME"))
        away = consensus_by_key.get((fixture_id, "1X2", None, "AWAY"))
        if not (home and away):
            cp = consensus_by_key.get((fixture_id, "DNB", line, selection))
            return cp.median if cp else None
        denom = home.median + away.median
        if denom <= 0:
            return None
        return home.median / denom if selection == "HOME" else away.median / denom
    cp = consensus_by_key.get((fixture_id, market, line, selection))
    return cp.median if cp else None


def _model_p(fixture_id, market, selection, line, model_probs_by_fixture):
    key = _prob_key(market, selection, line)
    mkts = model_probs_by_fixture.get(fixture_id, {})
    return mkts.get(key)


def annotate_legs(legs, model_probs_by_fixture, consensus_by_key):
    """In-place annotation: model_p, fair_market_p, edge, quality_tier,
    uncertainty_tag. Returns the same list."""
    for leg in legs:
        leg.model_p = _model_p(leg.fixture_id, leg.market, leg.selection, leg.line, model_probs_by_fixture)
        leg.fair_market_p = _market_fair_p(leg.fixture_id, leg.market, leg.selection, leg.line, consensus_by_key)
        if leg.model_p is not None and leg.fair_market_p is not None:
            leg.edge = leg.model_p - leg.fair_market_p

        if leg.robust_log_p is not None:
            import math
            robust_p = math.exp(leg.robust_log_p)
        else:
            robust_p = leg.p_geometric
        if robust_p >= config.QUALITY_TIER_A_MIN:
            leg.quality_tier = "A"
        elif robust_p >= config.QUALITY_TIER_B_MIN:
            leg.quality_tier = "B"
        elif robust_p >= config.QUALITY_TIER_C_MIN:
            leg.quality_tier = "C"
        else:
            leg.quality_tier = None  # below C: not eligible at all

        uncertainty_too_high = (leg.p10 < config.SMOOTH_P10_MIN) or (leg.sd is not None and leg.sd > config.SMOOTH_SD_MAX)
        leg.uncertainty_tag = "UNCERTAINTY_TOO_HIGH" if uncertainty_too_high else None
    return legs


@dataclass
class RejectionCounts:
    total: int = 0
    odds_too_high: int = 0
    robust_p_too_low: int = 0
    edge_too_negative: int = 0
    uncertainty_too_high: int = 0
    data_quality_low: int = 0
    eligible: int = 0


def filter_eligible_legs(legs, max_leg_odds) -> tuple:
    """Returns (eligible_legs, RejectionCounts). Applies, in order: data
    quality (existing bookmaker-coverage tag), odds cap, robust-p floor,
    edge floor, uncertainty tag — sections 1, 2, 6, 7 of the correction."""
    import math
    counts = RejectionCounts(total=len(legs))
    eligible = []
    for leg in legs:
        if leg.data_quality == "LOW":
            counts.data_quality_low += 1
            continue
        if leg.exec_odds > max_leg_odds:
            counts.odds_too_high += 1
            continue
        robust_p = math.exp(leg.robust_log_p)
        if robust_p < config.SMOOTH_ROBUST_P_MIN:
            counts.robust_p_too_low += 1
            continue
        if leg.edge is not None and leg.edge < config.SMOOTH_EDGE_MIN:
            counts.edge_too_negative += 1
            continue
        if leg.uncertainty_tag == "UNCERTAINTY_TOO_HIGH":
            counts.uncertainty_too_high += 1
            continue
        eligible.append(leg)
    counts.eligible = len(eligible)
    return eligible, counts
