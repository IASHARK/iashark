import math

from engine import config
from engine.legs import Leg
from engine.smooth_filters import annotate_legs, filter_eligible_legs
from engine.ticket_solver import solve_best_ticket_tiered, solve_by_leg_count_grid
from engine.portfolio import simulate_fixture_scores, settle_pool, select_triplet_sequential
from engine.score_matrix import build_score_matrix


def _leg(fixture_id, odds, robust_p, mean_p=None, p10=None, sd=0.03, market="1X2", selection="HOME"):
    mean_p = mean_p if mean_p is not None else robust_p
    p10 = p10 if p10 is not None else robust_p - 0.05
    return Leg(fixture_id, "L", "Home", "Away", "2026-09-06T12:00:00Z", market, selection, None,
               odds, "BookX", "SINGLE_BOOK", mean_p=mean_p, robust_log_p=math.log(robust_p), p_geometric=robust_p,
               p10=p10, p90=min(robust_p + 0.05, 0.999), sd=sd, n_bookmakers=5, data_quality="HIGH")


def test_annotate_legs_computes_edge_and_tier():
    legs = [_leg(1, 1.6, 0.80)]
    model_probs = {1: {("1X2", "HOME"): 0.78}}
    consensus_by_key = {}

    class FakeCP:
        def __init__(self, median):
            self.median = median

    consensus_by_key[(1, "1X2", None, "HOME")] = FakeCP(0.62)
    annotate_legs(legs, model_probs, consensus_by_key)
    leg = legs[0]
    assert abs(leg.model_p - 0.78) < 1e-9
    assert abs(leg.fair_market_p - 0.62) < 1e-9
    assert abs(leg.edge - (0.78 - 0.62)) < 1e-9
    assert leg.quality_tier == "A"  # robust_p 0.80 >= 0.75


def test_filter_excludes_longshots_and_low_probability():
    legs = [
        _leg(1, 1.5, 0.80),   # should pass
        _leg(2, 3.40, 0.85),  # odds too high -> excluded even though very probable
        _leg(3, 1.4, 0.55),   # robust_p too low -> excluded
        _leg(4, 1.6, 0.68, p10=0.40),  # robust_p OK but P10 too low -> excluded (uncertainty)
    ]
    model_probs = {i: {("1X2", "HOME"): l.mean_p} for i, l in enumerate(legs, start=1)}
    annotate_legs(legs, model_probs, {})
    eligible, counts = filter_eligible_legs(legs, config.SMOOTH_MAX_LEG_ODDS_PRIMARY)
    assert [l.fixture_id for l in eligible] == [1]
    assert counts.odds_too_high == 1
    assert counts.robust_p_too_low == 1
    assert counts.uncertainty_too_high == 1


def test_edge_filter_excludes_overvalued_selection():
    legs = [_leg(1, 1.5, 0.70)]
    model_probs = {1: {("1X2", "HOME"): 0.65}}  # model thinks 0.65

    class FakeCP:
        def __init__(self, median):
            self.median = median
    consensus_by_key = {(1, "1X2", None, "HOME"): FakeCP(0.72)}  # market thinks 0.72 -> edge = -0.07
    annotate_legs(legs, model_probs, consensus_by_key)
    eligible, counts = filter_eligible_legs(legs, config.SMOOTH_MAX_LEG_ODDS_PRIMARY)
    assert eligible == []
    assert counts.edge_too_negative == 1


def _independent_legs(n=10, seed=0):
    import random
    random.seed(seed)
    legs = []
    for i in range(n):
        odds = round(random.uniform(1.3, 1.9), 2)
        p = min(0.95, 1 / odds * random.uniform(0.95, 1.02))
        legs.append(_leg(i, odds, p))
    return legs


def test_solver_never_exceeds_max_leg_odds_primary():
    legs = _independent_legs(10)
    ticket, tier = solve_best_ticket_tiered(legs, min_odds=5.0)
    assert ticket is not None
    used = [legs[i] for i in ticket.leg_indices]
    assert all(l.exec_odds <= config.SMOOTH_MAX_LEG_ODDS_PRIMARY for l in used)
    assert 4 <= len(used) <= 7
    assert ticket.total_odds >= 5.0 - 1e-9


def test_solver_prefers_5_to_5_5_window_when_available():
    legs = _independent_legs(10)
    ticket, tier = solve_best_ticket_tiered(legs, min_odds=5.0, preferred_odds_max=5.5)
    assert ticket is not None
    if tier["odds_upper"] is not None:
        assert ticket.total_odds <= 5.5 + 1e-6


def test_leg_count_grid_reports_all_cardinalities():
    legs = _independent_legs(12)
    grid = solve_by_leg_count_grid(legs, leg_counts=(4, 5, 6, 7), min_odds=5.0)
    assert set(grid.keys()) == {4, 5, 6, 7}
    for k, res in grid.items():
        if res["ticket"] is not None:
            assert len(res["ticket"].leg_indices) == k


def test_fallback_to_2_00_only_when_1_80_infeasible():
    # only longshots available under any combination reaching odds>=5 with <=1.80 cap:
    # make legs where all odds are just under 2.00 but none under 1.80 combine to 5+ within 4-7 legs bound easily —
    # instead force genuine infeasibility under 1.80 by using very low odds legs only (can't reach 5.0 within 7 legs).
    low_odds_legs = [_leg(i, 1.15, 0.90) for i in range(7)]  # 1.15^7 ~= 2.66 < 5.0 -> infeasible under any cap with only these
    higher_legs = [_leg(100 + i, 1.95, 0.62) for i in range(5)]  # under 2.00 but over 1.80
    ticket, tier = solve_best_ticket_tiered(low_odds_legs + higher_legs, min_odds=5.0)
    assert ticket is not None
    assert tier["max_leg_odds"] == config.SMOOTH_MAX_LEG_ODDS_FALLBACK
    used = [((low_odds_legs + higher_legs)[i]) for i in ticket.leg_indices]
    assert any(l.exec_odds > config.SMOOTH_MAX_LEG_ODDS_PRIMARY for l in used)


def test_select_triplet_sequential_t1_is_global_best():
    from engine.ticket_solver import TicketCandidate
    from engine.portfolio import SettledTicket
    import numpy as np

    Q_by_fixture = {i: build_score_matrix(1.3 + 0.05 * i, 1.0)[0] for i in range(12)}
    scores = simulate_fixture_scores(Q_by_fixture, 30_000, seed=3)

    settled = []
    for i in range(12):
        legs = (_leg(i, 1.5, 0.75 - 0.01 * i),)
        cand = TicketCandidate(leg_indices=(i,), fixtures=(i,), total_odds=1.5,
                                robust_logp_sum=math.log(0.75 - 0.01 * i), mean_p_proxy=0.75 - 0.01 * i)
        wm = settle_ticket_stub = None
        h, a = scores[i]
        win_mask = (h > a)
        p = float(win_mask.mean())
        settled.append(SettledTicket(cand, legs, win_mask, p, math.sqrt(max(p * (1 - p), 0) / 30_000)))

    triplet, relaxed = select_triplet_sequential(settled)
    assert triplet is not None
    # T1 must be the single ticket with the highest robust_logp_sum (fixture 0, p=0.75)
    assert triplet[0].candidate.fixtures == (0,)
    # all three must be pairwise diversified (no shared fixtures possible here anyway — single-leg tickets)
    fixtures_used = [t.candidate.fixtures[0] for t in triplet]
    assert len(set(fixtures_used)) == 3
