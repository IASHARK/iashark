"""Combinatorial ticket solver (sections 20-26) — an exact binary MILP
(via PuLP/CBC), not a greedy heuristic, enumerated repeatedly with no-good
cuts to build a pool of top admissible tickets."""
import math
import time
from dataclasses import dataclass, field

import pulp

from . import config


@dataclass
class TicketCandidate:
    leg_indices: tuple
    fixtures: tuple
    total_odds: float
    robust_logp_sum: float
    mean_p_proxy: float  # product of independent mean_p — a naive (non-joint) sanity figure only


def _build_problem(legs, min_odds, min_legs, max_legs, exclusions, odds_upper=None, leg_count=None,
                    fixture_caps=None):
    prob = pulp.LpProblem("ticket", pulp.LpMaximize)
    x = {i: pulp.LpVariable(f"x_{i}", cat="Binary") for i in range(len(legs))}

    prob += pulp.lpSum(x[i] * legs[i].robust_log_p for i in x)

    log_min_odds = math.log(min_odds)
    log_odds_expr = pulp.lpSum(x[i] * math.log(legs[i].exec_odds) for i in x)
    prob += log_odds_expr >= log_min_odds
    if odds_upper is not None:
        prob += log_odds_expr <= math.log(odds_upper)

    n_legs_expr = pulp.lpSum(x.values())
    if leg_count is not None:
        prob += n_legs_expr == leg_count
    else:
        prob += n_legs_expr >= min_legs
        prob += n_legs_expr <= max_legs

    fixtures = {}
    for i, leg in enumerate(legs):
        fixtures.setdefault(leg.fixture_id, []).append(i)
    for fixture_id, idxs in fixtures.items():
        if len(idxs) > 1:
            prob += pulp.lpSum(x[i] for i in idxs) <= 1

    # Diversification against one or more already-chosen tickets (section 9):
    # "at most `max_shared` legs whose fixture is in that other ticket's
    # fixture set" — enforced directly in the MILP rather than hoping a
    # generic top-N pool happens to contain a diversified combo.
    for fixture_id_set, max_shared in (fixture_caps or []):
        idxs = [i for i, leg in enumerate(legs) if leg.fixture_id in fixture_id_set]
        if idxs:
            prob += pulp.lpSum(x[i] for i in idxs) <= max_shared

    for k, excluded_set in enumerate(exclusions):
        prob += pulp.lpSum(x[i] for i in excluded_set) <= len(excluded_set) - 1

    return prob, x


def solve_one_ticket(legs, min_odds, min_legs, max_legs, exclusions, odds_upper=None, leg_count=None,
                      fixture_caps=None):
    prob, x = _build_problem(legs, min_odds, min_legs, max_legs, exclusions, odds_upper, leg_count, fixture_caps)
    prob.solve(pulp.PULP_CBC_CMD(msg=0))
    if pulp.LpStatus[prob.status] != "Optimal":
        return None
    chosen = tuple(sorted(i for i in x if pulp.value(x[i]) > 0.5))
    if not chosen:
        return None
    total_odds = math.exp(sum(math.log(legs[i].exec_odds) for i in chosen))
    robust_sum = sum(legs[i].robust_log_p for i in chosen)
    mean_p_proxy = math.exp(sum(math.log(max(legs[i].mean_p, 1e-9)) for i in chosen))
    fixtures = tuple(sorted({legs[i].fixture_id for i in chosen}))
    return TicketCandidate(chosen, fixtures, total_odds, robust_sum, mean_p_proxy)


def solve_best_ticket_tiered(legs, min_odds=config.SMOOTH_TOTAL_ODDS_MIN,
                              preferred_odds_max=config.SMOOTH_TOTAL_ODDS_PREFERRED_MAX,
                              min_legs=config.SMOOTH_MIN_LEGS, max_legs=config.SMOOTH_MAX_LEGS,
                              max_leg_odds_primary=config.SMOOTH_MAX_LEG_ODDS_PRIMARY,
                              max_leg_odds_fallback=config.SMOOTH_MAX_LEG_ODDS_FALLBACK,
                              leg_count=None, fixture_caps=None):
    """Section 1+4 of the 2026-09-05 correction: try, in order —
    (1.80, [5.00,5.50]) -> (1.80, [5.00,inf)) -> (2.00, [5.00,5.50]) ->
    (2.00, [5.00,inf)). Returns (ticket, tier_dict) or (None, None). The
    2.00 leg cap is a documented last resort, never the default."""
    tiers = [
        {"max_leg_odds": max_leg_odds_primary, "odds_upper": preferred_odds_max, "label": "PRIMARY_PREFERRED_WINDOW"},
        {"max_leg_odds": max_leg_odds_primary, "odds_upper": None, "label": "PRIMARY_UNBOUNDED"},
        {"max_leg_odds": max_leg_odds_fallback, "odds_upper": preferred_odds_max, "label": "FALLBACK_PREFERRED_WINDOW"},
        {"max_leg_odds": max_leg_odds_fallback, "odds_upper": None, "label": "FALLBACK_UNBOUNDED"},
    ]
    orig_index_by_id = {id(l): i for i, l in enumerate(legs)}
    for tier in tiers:
        filtered = [l for l in legs if l.exec_odds <= tier["max_leg_odds"]]
        if not filtered:
            continue
        ticket = solve_one_ticket(filtered, min_odds, min_legs, max_legs, [],
                                   odds_upper=tier["odds_upper"], leg_count=leg_count,
                                   fixture_caps=fixture_caps)
        if ticket is not None:
            # remap indices back to the caller's original `legs` list — solve_one_ticket
            # only knows about `filtered`, and silently leaking that frame to the
            # caller is a footgun (see tests/test_smooth_accumulator.py).
            remapped = tuple(sorted(orig_index_by_id[id(filtered[i])] for i in ticket.leg_indices))
            ticket = TicketCandidate(remapped, ticket.fixtures, ticket.total_odds,
                                      ticket.robust_logp_sum, ticket.mean_p_proxy)
            return ticket, tier
    return None, None


def solve_by_leg_count_grid(legs, leg_counts=(4, 5, 6, 7), **kwargs):
    """Section 10: solve each cardinality independently (exact MILP, no
    greedy) and report all of them before picking the overall winner."""
    results = {}
    for k in leg_counts:
        ticket, tier = solve_best_ticket_tiered(legs, leg_count=k, **kwargs)
        results[k] = {"ticket": ticket, "tier": tier}
    return results


def generate_ticket_pool(legs, min_odds=config.MIN_TICKET_ODDS, min_legs=config.MIN_LEGS,
                          max_legs=config.MAX_LEGS, pool_target=config.CANDIDATE_POOL_TARGET,
                          time_budget_s=180, odds_upper=None, fixture_caps=None):
    """Repeated exact-MILP solves with no-good cuts (section 24, 26): each
    solve is the true optimum among tickets not already found, so pool
    members come out in (approximately, due to the cuts) decreasing
    objective order. Never a greedy leg-by-leg heuristic. `fixture_caps`
    (if given) makes every generated ticket already diversified against
    one or more fixed tickets — see section 9."""
    pool = []
    exclusions = []
    t0 = time.monotonic()
    target_max = pool_target[1]
    while len(pool) < target_max and (time.monotonic() - t0) < time_budget_s:
        ticket = solve_one_ticket(legs, min_odds, min_legs, max_legs, exclusions,
                                   odds_upper=odds_upper, fixture_caps=fixture_caps)
        if ticket is None:
            break
        pool.append(ticket)
        exclusions.append(ticket.leg_indices)
    return pool
