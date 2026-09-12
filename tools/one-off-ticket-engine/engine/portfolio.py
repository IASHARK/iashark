"""Joint day-scenario Monte Carlo and final triplet selection (sections
27-31).

One simulated score per fixture per scenario settles every leg tied to that
fixture, so within-fixture correlation across markets is exact by
construction. Cross-fixture correlation is not modelled (fixtures are
simulated independently) — matches the spec's requirement ("the same
simulated score settles every selection on that fixture") without claiming
more than that.

Selecting the literal best triplet from a pool of up to 500 tickets is a
C(500,3) ~ 20.7M search; instead we rank the pool by individual Monte Carlo
P(ticket) (cheap: a boolean AND/OR over already-simulated arrays) and search
exhaustively over the top TOP_K_FOR_TRIPLET_SEARCH tickets, which is exact
within that shortlist and documented as such.
"""
import math
from dataclasses import dataclass
from itertools import combinations

import numpy as np

from . import config
from .bootstrap import resample_constraints
from .entropy_matrix import solve_entropy_matrix

TOP_K_FOR_TRIPLET_SEARCH = 60


def simulate_fixture_scores(P_by_fixture: dict, n_scenarios: int, seed: int):
    rng = np.random.default_rng(seed)
    scores = {}
    for fixture_id, P in P_by_fixture.items():
        size = P.shape[0]
        flat = P.flatten()
        flat = flat / flat.sum()
        draw_idx = rng.choice(len(flat), size=n_scenarios, p=flat)
        h = draw_idx // size
        a = draw_idx % size
        scores[fixture_id] = (h, a)
    return scores


def settle_leg(leg, h, a):
    """Vectorized settlement -> array of {0: LOSS, 1: WIN, 2: PUSH}."""
    market, sel, line = leg.market, leg.selection, leg.line
    out = np.zeros(len(h), dtype=np.int8)
    if market == "1X2":
        win = {"HOME": h > a, "DRAW": h == a, "AWAY": h < a}[sel]
        out[win] = 1
    elif market == "DC":
        win = {"1X": h >= a, "X2": h <= a, "12": h != a}[sel]
        out[win] = 1
    elif market == "DNB":
        if sel == "HOME":
            out[h > a] = 1
            out[h == a] = 2
        else:
            out[h < a] = 1
            out[h == a] = 2
    elif market == "BTTS":
        yes = (h >= 1) & (a >= 1)
        win = yes if sel == "YES" else ~yes
        out[win] = 1
    elif market == "OU":
        win = (h + a > line) if sel == "OVER" else (h + a < line)
        out[win] = 1
    elif market == "TEAM_TOTAL_HOME":
        win = (h > line) if sel == "OVER" else (h < line)
        out[win] = 1
    elif market == "TEAM_TOTAL_AWAY":
        win = (a > line) if sel == "OVER" else (a < line)
        out[win] = 1
    else:
        raise ValueError(f"unsupported market for settlement: {market}")
    return out


def settle_ticket(legs_subset, fixture_scores) -> np.ndarray:
    n = len(next(iter(fixture_scores.values()))[0])
    any_loss = np.zeros(n, dtype=bool)
    any_win = np.zeros(n, dtype=bool)
    for leg in legs_subset:
        h, a = fixture_scores[leg.fixture_id]
        outcome = settle_leg(leg, h, a)
        any_loss |= (outcome == 0)
        any_win |= (outcome == 1)
    return any_win & ~any_loss


@dataclass
class SettledTicket:
    candidate: object
    legs: tuple
    win_mask: np.ndarray
    p_ticket: float
    se: float


def settle_pool(pool, legs, fixture_scores) -> list:
    settled = []
    for cand in pool:
        legs_subset = tuple(legs[i] for i in cand.leg_indices)
        win_mask = settle_ticket(legs_subset, fixture_scores)
        p = float(win_mask.mean())
        se = math.sqrt(max(p * (1 - p), 0) / len(win_mask))
        settled.append(SettledTicket(cand, legs_subset, win_mask, p, se))
    return settled


def _shared_fixtures(t1: SettledTicket, t2: SettledTicket):
    return set(t1.candidate.fixtures) & set(t2.candidate.fixtures)


def _shared_selections(t1: SettledTicket, t2: SettledTicket):
    s1 = {(l.fixture_id, l.market, l.selection, l.line) for l in t1.legs}
    s2 = {(l.fixture_id, l.market, l.selection, l.line) for l in t2.legs}
    return s1 & s2


def _pair_ok(t1, t2, max_shared_fixtures):
    if len(_shared_fixtures(t1, t2)) > max_shared_fixtures:
        return False
    if len(_shared_selections(t1, t2)) > 1:
        return False
    if t1.legs == t2.legs:
        return False
    return True


def select_triplet_sequential(settled_pool: list):
    """Section 9 of the 2026-09-05 correction: an explicitly asymmetric
    construction, not a symmetric C(pool,3) search —
      T1 = single best ticket by robust_logP(T) (the primary objective,
           section 5), full stop.
      T2 = best remaining ticket by robust_logP(T) that diversifies from T1
           (<=1 shared fixture, prefer 0; <=1 shared selection).
      T3 = the remaining candidate that maximizes the realized portfolio
           P(T1 or T2 or T3) (Monte Carlo, using the already-settled win
           masks), not simply the third-best individual ticket — subject to
           diversifying from BOTH T1 and T2.
    Returns (triplet, relaxed: bool) or (None, None) if no admissible
    triplet exists even after relaxing to <=1 shared fixture per pair.
    """
    if len(settled_pool) < 3:
        return None, None

    ranked = sorted(settled_pool, key=lambda t: -t.candidate.robust_logp_sum)
    t1 = ranked[0]

    for max_shared, relaxed in ((0, False), (1, True)):
        remaining_for_t2 = [t for t in ranked[1:] if _pair_ok(t1, t, max_shared)]
        if not remaining_for_t2:
            continue
        t2 = remaining_for_t2[0]  # already sorted by robust_logp_sum descending

        candidates_for_t3 = [t for t in ranked if t is not t1 and t is not t2
                              and _pair_ok(t1, t, max_shared) and _pair_ok(t2, t, max_shared)]
        if not candidates_for_t3:
            continue

        best_t3, best_p_any = None, -1.0
        for cand in candidates_for_t3:
            p_any = float((t1.win_mask | t2.win_mask | cand.win_mask).mean())
            if p_any > best_p_any:
                best_p_any, best_t3 = p_any, cand
        return (t1, t2, best_t3), relaxed

    return None, None


def select_best_triplet(settled_pool: list, n_tickets=config.TICKET_COUNT):
    """Section 28-29: maximize P_any, tie-break by min individual P, then
    mean P, then overlap, then total legs. Tries 0-shared-fixture pairs
    first, relaxes to <=1 shared fixture if no admissible triplet exists."""
    ranked = sorted(settled_pool, key=lambda t: -t.p_ticket)[:TOP_K_FOR_TRIPLET_SEARCH]

    for max_shared, relaxed in ((0, False), (1, True)):
        best = None
        for combo in combinations(ranked, n_tickets):
            ok = all(_pair_ok(a, b, max_shared) for a, b in combinations(combo, 2))
            if not ok:
                continue
            any_win = np.zeros_like(combo[0].win_mask)
            win_masks = [t.win_mask for t in combo]
            for wm in win_masks:
                any_win |= wm
            p_any = float(any_win.mean())
            p_individual = [t.p_ticket for t in combo]
            min_p = min(p_individual)
            mean_p = sum(p_individual) / len(p_individual)
            overlap = sum(len(_shared_fixtures(a, b)) for a, b in combinations(combo, 2))
            total_legs = sum(len(t.legs) for t in combo)
            key = (p_any, min_p, mean_p, -overlap, -total_legs)
            if best is None or key > best[0]:
                best = (key, combo, p_any)
        if best is not None:
            return best[1], best[2], relaxed
    return None, None, None


def portfolio_stats(triplet, n_scenarios):
    masks = [t.win_mask for t in triplet]
    any_win = masks[0] | masks[1] | masks[2]
    stacked = np.vstack(masks).astype(int)
    count_wins = stacked.sum(axis=0)
    p_any = float(any_win.mean())
    p_2plus = float((count_wins >= 2).mean())
    p_all3 = float((count_wins == 3).mean())

    def se(p):
        return math.sqrt(max(p * (1 - p), 0) / n_scenarios)

    return {
        "p_t1": triplet[0].p_ticket, "p_t2": triplet[1].p_ticket, "p_t3": triplet[2].p_ticket,
        "p_any": p_any, "p_any_se": se(p_any),
        "p_2plus": p_2plus, "p_2plus_se": se(p_2plus),
        "p_all3": p_all3, "p_all3_se": se(p_all3),
        "n_scenarios": n_scenarios,
    }


def bootstrap_final_portfolio(triplet_legs_by_ticket, fair_by_key, Q_by_fixture,
                               n_draws, n_inner_scenarios, seed):
    """Section 31: a second, independent robustness layer for the *final*
    triplet only. Each draw resamples bookmaker consensus (market/model
    uncertainty, same mechanism as bootstrap.py) for every fixture the
    triplet touches, re-solves the entropy matrix, then re-simulates a
    (smaller) batch of day scenarios to get that draw's P(T1..T3, any).
    n_draws/n_inner_scenarios are configurable; defaults are documented in
    config.py as a deliberate reduction from stage-2's 2000 draws x 200k
    scenarios, which would be needed here for every draw and is not
    tractable at that scale for a single run."""
    rng = np.random.default_rng(seed)
    relevant_fixtures = sorted({leg.fixture_id for legs in triplet_legs_by_ticket for leg in legs})

    out = {"p_t1": [], "p_t2": [], "p_t3": [], "p_any": []}
    for _ in range(n_draws):
        P_draw_by_fixture = {}
        for fid in relevant_fixtures:
            fixture_keys = [k for k in fair_by_key if k[0] == fid]
            constraints = resample_constraints(rng, fixture_keys, fair_by_key)
            P_draw, _diag = solve_entropy_matrix(Q_by_fixture[fid], constraints)
            P_draw_by_fixture[fid] = P_draw
        scores = simulate_fixture_scores(P_draw_by_fixture, n_inner_scenarios, seed=int(rng.integers(0, 2**31 - 1)))
        masks = [settle_ticket(legs, scores) for legs in triplet_legs_by_ticket]
        out["p_t1"].append(float(masks[0].mean()))
        out["p_t2"].append(float(masks[1].mean()))
        out["p_t3"].append(float(masks[2].mean()))
        out["p_any"].append(float((masks[0] | masks[1] | masks[2]).mean()))

    summary = {}
    for k, vals in out.items():
        arr = np.array(vals)
        summary[k] = {"mean": float(arr.mean()), "median": float(np.median(arr)),
                      "p10": float(np.percentile(arr, 10)), "p90": float(np.percentile(arr, 90))}
    return summary
