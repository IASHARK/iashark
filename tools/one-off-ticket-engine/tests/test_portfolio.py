import math

import numpy as np

from engine.score_matrix import build_score_matrix
from engine.legs import Leg
from engine.ticket_solver import TicketCandidate
from engine.portfolio import (simulate_fixture_scores, settle_leg, settle_ticket, settle_pool,
                               select_best_triplet, portfolio_stats)


def _leg(fixture_id, market, selection, odds, line=None):
    return Leg(fixture_id, "L", "Home", "Away", "2026-09-06T12:00:00Z", market, selection, line,
               odds, "BookX", "SINGLE_BOOK", mean_p=0.5, robust_log_p=math.log(0.5), p_geometric=0.5,
               p10=0.4, p90=0.6, sd=0.05, n_bookmakers=5, data_quality="HIGH")


def test_settle_leg_1x2_and_dnb_push():
    h = np.array([2, 1, 0])
    a = np.array([1, 1, 1])
    leg_home = _leg(1, "1X2", "HOME", 2.0)
    assert list(settle_leg(leg_home, h, a)) == [1, 0, 0]

    leg_dnb_home = _leg(1, "DNB", "HOME", 1.3)
    out = settle_leg(leg_dnb_home, h, a)
    assert list(out) == [1, 2, 0]  # win, push (draw), loss


def test_settle_leg_totals_and_btts():
    h = np.array([2, 1, 0])
    a = np.array([1, 1, 1])
    over15 = _leg(1, "OU", "OVER", 1.5, line=1.5)
    assert list(settle_leg(over15, h, a)) == [1, 1, 0]
    btts_yes = _leg(1, "BTTS", "YES", 1.8)
    assert list(settle_leg(btts_yes, h, a)) == [1, 1, 0]


def test_ticket_win_requires_no_leg_loss():
    fixture_scores = {1: (np.array([2, 0]), np.array([0, 2])), 2: (np.array([1, 1]), np.array([0, 0]))}
    legs = (_leg(1, "1X2", "HOME", 1.8), _leg(2, "1X2", "HOME", 1.5))
    win_mask = settle_ticket(legs, fixture_scores)
    # scenario 0: fixture1 home win (WIN), fixture2 home win (WIN) -> ticket WIN
    # scenario 1: fixture1 away win (LOSS) -> ticket LOSS regardless of fixture2
    assert list(win_mask) == [True, False]


def test_monte_carlo_matches_analytic_for_independent_ticket():
    Q1, *_ = build_score_matrix(1.6, 1.1)
    Q2, *_ = build_score_matrix(1.2, 1.3)
    scores = simulate_fixture_scores({1: Q1, 2: Q2}, 400_000, seed=123)
    legs = (_leg(1, "1X2", "HOME", 1.8), _leg(2, "1X2", "AWAY", 3.0))
    win_mask = settle_ticket(legs, scores)
    mc_p = win_mask.mean()

    from engine.markets import market_probabilities
    p1 = market_probabilities(Q1)[("1X2", "HOME")]
    p2 = market_probabilities(Q2)[("1X2", "AWAY")]
    analytic_p = p1 * p2
    assert abs(mc_p - analytic_p) < 0.01  # Monte Carlo noise at 400k draws


def test_select_best_triplet_diversification_and_bounds():
    Q_by_fixture = {i: build_score_matrix(1.3 + 0.1 * i, 1.0)[0] for i in range(10)}
    scores = simulate_fixture_scores(Q_by_fixture, 50_000, seed=7)

    pool = []
    for i in range(10):
        legs = (_leg(i, "1X2", "HOME", 6.0), _leg((i + 1) % 10, "1X2", "AWAY", 1.2))
        cand = TicketCandidate(leg_indices=(i,), fixtures=(i, (i + 1) % 10), total_odds=7.2,
                                robust_logp_sum=0.0, mean_p_proxy=0.5)
        pool.append((cand, legs))

    # settle_pool expects (candidate, legs-by-index) shape; build directly here
    from engine.portfolio import SettledTicket
    settled = []
    for cand, legs in pool:
        wm = settle_ticket(legs, scores)
        p = float(wm.mean())
        settled.append(SettledTicket(cand, legs, wm, p, math.sqrt(max(p * (1 - p), 0) / 50_000)))

    triplet, p_any, relaxed = select_best_triplet(settled, n_tickets=3)
    assert triplet is not None
    assert len(triplet) == 3
    assert 0 <= p_any <= 1
    assert p_any >= max(t.p_ticket for t in triplet) - 1e-9
    stats = portfolio_stats(triplet, 50_000)
    for key in ("p_t1", "p_t2", "p_t3", "p_any", "p_2plus", "p_all3"):
        assert 0 <= stats[key] <= 1
    assert stats["p_all3"] <= stats["p_2plus"] <= stats["p_any"] + 1e-9
