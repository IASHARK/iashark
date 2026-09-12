import numpy as np

from engine.score_matrix import build_score_matrix
from engine.entropy_matrix import build_constraints, solve_entropy_matrix
from engine.markets import market_probabilities
from engine.consensus import ConsensusPoint


def _cp(fixture, market, sel, line, median, n_bm=5, mad=0.01):
    return ConsensusPoint(fixture, market, sel, line, median, mad, 1.4826 * mad, median - 0.02, median + 0.02, n_bm, 2.0, "X", {})


def test_matrix_sums_to_one_and_nonnegative():
    Q, tail, size, ok = build_score_matrix(1.4, 1.1)
    assert abs(Q.sum() - 1.0) < 1e-9
    assert (Q >= 0).all()
    assert ok
    assert tail < 1e-9


def test_tail_mass_acceptable_across_lambda_range():
    for lam_h, lam_a in [(0.3, 0.2), (1.5, 1.2), (3.5, 3.0), (5.0, 4.5)]:
        Q, tail, size, ok = build_score_matrix(lam_h, lam_a)
        assert ok, f"tail mass not controlled for lambdas {lam_h},{lam_a} (tail={tail})"


def test_market_probabilities_reconstruct_1x2_conservation():
    Q, *_ = build_score_matrix(1.6, 1.1)
    mkts = market_probabilities(Q)
    assert abs(mkts[("1X2", "HOME")] + mkts[("1X2", "DRAW")] + mkts[("1X2", "AWAY")] - 1.0) < 1e-9


def test_double_chance_identities():
    Q, *_ = build_score_matrix(1.6, 1.1)
    mkts = market_probabilities(Q)
    assert abs(mkts[("DC", "1X")] - (mkts[("1X2", "HOME")] + mkts[("1X2", "DRAW")])) < 1e-9
    assert abs(mkts[("DC", "X2")] - (mkts[("1X2", "DRAW")] + mkts[("1X2", "AWAY")])) < 1e-9
    assert abs(mkts[("DC", "12")] - (1 - mkts[("1X2", "DRAW")])) < 1e-9


def test_btts_and_totals_bounds():
    Q, *_ = build_score_matrix(1.8, 1.4)
    mkts = market_probabilities(Q)
    assert 0 <= mkts[("BTTS", "YES")] <= 1
    assert abs(mkts[("BTTS", "YES")] + mkts[("BTTS", "NO")] - 1) < 1e-9
    assert abs(mkts[("OU", 2.5, "OVER")] + mkts[("OU", 2.5, "UNDER")] - 1) < 1e-9
    # monotonic: P(over 1.5) >= P(over 2.5) >= P(over 3.5)
    assert mkts[("OU", 1.5, "OVER")] >= mkts[("OU", 2.5, "OVER")] >= mkts[("OU", 3.5, "OVER")]


def test_team_total_conservation():
    Q, *_ = build_score_matrix(1.8, 1.4)
    mkts = market_probabilities(Q)
    assert abs(mkts[("TEAM_TOTAL_HOME", 1.5, "OVER")] + mkts[("TEAM_TOTAL_HOME", 1.5, "UNDER")] - 1) < 1e-9
    assert abs(mkts[("TEAM_TOTAL_AWAY", 1.5, "OVER")] + mkts[("TEAM_TOTAL_AWAY", 1.5, "UNDER")] - 1) < 1e-9


def test_dnb_push_identity():
    Q, *_ = build_score_matrix(1.8, 1.4)
    mkts = market_probabilities(Q)
    assert abs(mkts[("DNB", "HOME_WIN")] + mkts[("DNB", "HOME_PUSH")] + mkts[("DNB", "HOME_LOSS")] - 1) < 1e-9
    assert abs(mkts[("DNB", "HOME_COND")] - mkts[("1X2", "HOME")] / (mkts[("1X2", "HOME")] + mkts[("1X2", "AWAY")])) < 1e-9


def test_entropy_optimizer_converges_and_matches_market():
    Q, *_ = build_score_matrix(1.5, 1.2)
    points = [
        _cp(1, "1X2", "HOME", None, 0.50), _cp(1, "1X2", "DRAW", None, 0.27), _cp(1, "1X2", "AWAY", None, 0.23),
        _cp(1, "BTTS", "YES", None, 0.55), _cp(1, "BTTS", "NO", None, 0.45),
    ]
    constraints = build_constraints(points)
    P, diag = solve_entropy_matrix(Q, constraints)
    assert diag["converged"]
    assert abs(P.sum() - 1.0) < 1e-8
    assert (P >= 0).all()
    mkts = market_probabilities(P)
    assert abs(mkts[("1X2", "HOME")] - 0.50) < 0.01
    assert abs(mkts[("BTTS", "YES")] - 0.55) < 0.01


def test_entropy_optimizer_deterministic():
    Q, *_ = build_score_matrix(1.5, 1.2)
    points = [_cp(1, "1X2", "HOME", None, 0.5), _cp(1, "1X2", "DRAW", None, 0.27), _cp(1, "1X2", "AWAY", None, 0.23)]
    constraints = build_constraints(points)
    P1, _ = solve_entropy_matrix(Q, constraints)
    P2, _ = solve_entropy_matrix(Q, constraints)
    assert np.allclose(P1, P2)


def test_no_market_falls_back_to_pure_q():
    Q, *_ = build_score_matrix(1.5, 1.2)
    P, diag = solve_entropy_matrix(Q, [])
    assert np.allclose(P, Q)
    assert diag["n_constraints"] == 0


def test_family_weight_cap_shrinks_multi_line_family():
    Q, *_ = build_score_matrix(1.5, 1.2)
    many_lines = [_cp(1, "OU", "OVER", ln, 0.5, mad=0.005) for ln in (1.5, 2.5, 3.5, 4.5)] + \
                 [_cp(1, "OU", "UNDER", ln, 0.5, mad=0.005) for ln in (1.5, 2.5, 3.5, 4.5)]
    one_line = [_cp(1, "OU", "OVER", 2.5, 0.5, mad=0.005), _cp(1, "OU", "UNDER", 2.5, 0.5, mad=0.005)]
    c_many = build_constraints(many_lines)
    c_one = build_constraints(one_line)
    total_weight_many = sum(1 / c.sigma_k ** 2 for c in c_many)
    total_weight_one = sum(1 / c.sigma_k ** 2 for c in c_one)
    # 4 lines must not weigh ~4x more than a single line in the same family
    assert total_weight_many < 2.5 * total_weight_one
