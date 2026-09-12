import math
import itertools

from engine.legs import Leg
from engine.ticket_solver import solve_one_ticket, generate_ticket_pool


def _leg(fixture_id, odds, robust_log_p, market="1X2", selection="HOME"):
    p = math.exp(robust_log_p)
    return Leg(fixture_id, "L", "Home", "Away", "2026-09-06T12:00:00Z", market, selection, None,
               odds, "BookX", "SINGLE_BOOK", mean_p=p, robust_log_p=robust_log_p, p_geometric=p,
               p10=p * 0.8, p90=p * 1.1, sd=0.02, n_bookmakers=5, data_quality="HIGH")


def _make_synthetic_legs():
    # 6 independent fixtures, one leg each, varied odds/probabilities.
    import random
    random.seed(42)
    legs = []
    for i in range(6):
        odds = 1.3 + i * 0.35
        p = 1 / odds * 0.97  # slightly below fair, realistic
        legs.append(_leg(i, odds, math.log(p)))
    return legs


def test_solver_respects_min_odds_and_leg_bounds():
    legs = _make_synthetic_legs()
    ticket = solve_one_ticket(legs, min_odds=5.0, min_legs=3, max_legs=7, exclusions=[])
    assert ticket is not None
    assert ticket.total_odds >= 5.0 - 1e-9
    assert 3 <= len(ticket.leg_indices) <= 7


def test_solver_max_one_leg_per_fixture():
    legs = _make_synthetic_legs()
    # add a second leg on fixture 0 (different market) that is very attractive
    legs.append(_leg(0, 1.9, math.log(0.9), market="DC", selection="1X"))
    ticket = solve_one_ticket(legs, min_odds=5.0, min_legs=3, max_legs=7, exclusions=[])
    fixtures_used = [legs[i].fixture_id for i in ticket.leg_indices]
    assert len(fixtures_used) == len(set(fixtures_used))


def test_solver_no_duplicate_selections_in_pool():
    legs = _make_synthetic_legs()
    pool = generate_ticket_pool(legs, min_odds=5.0, min_legs=3, max_legs=7, pool_target=(5, 20), time_budget_s=30)
    seen = set()
    for t in pool:
        assert t.leg_indices not in seen
        seen.add(t.leg_indices)
        assert t.total_odds >= 5.0 - 1e-6


def test_solver_deterministic():
    legs = _make_synthetic_legs()
    t1 = solve_one_ticket(legs, min_odds=5.0, min_legs=3, max_legs=7, exclusions=[])
    t2 = solve_one_ticket(legs, min_odds=5.0, min_legs=3, max_legs=7, exclusions=[])
    assert t1.leg_indices == t2.leg_indices


def test_solver_matches_brute_force_on_small_synthetic_case():
    legs = _make_synthetic_legs()
    best_bruteforce = None
    for k in range(3, 7):
        for combo in itertools.combinations(range(len(legs)), k):
            fixtures = [legs[i].fixture_id for i in combo]
            if len(fixtures) != len(set(fixtures)):
                continue
            total_odds = math.exp(sum(math.log(legs[i].exec_odds) for i in combo))
            if total_odds < 5.0:
                continue
            score = sum(legs[i].robust_log_p for i in combo)
            if best_bruteforce is None or score > best_bruteforce[0]:
                best_bruteforce = (score, combo)

    ticket = solve_one_ticket(legs, min_odds=5.0, min_legs=3, max_legs=7, exclusions=[])
    assert abs(ticket.robust_logp_sum - best_bruteforce[0]) < 1e-9
