"""Bootstrap uncertainty over the market-anchored matrix (sections 18-19).

Resamples, per (fixture, market, line), the set of contributing bookmakers
with replacement, recomputes the median/MAD consensus from the resampled
set, re-solves the entropy-anchored matrix, and re-derives every market
probability from it. Robustness is expressed as E_bootstrap[log p], never a
naive p - k*sd.
"""
import statistics
from collections import defaultdict

import numpy as np

from . import config
from .entropy_matrix import MarketConstraint, cap_family_weights, FAMILY_OF_MARKET, DEFAULT_SIGMA_SINGLE_BOOK
from .entropy_matrix import solve_entropy_matrix
from .markets import market_probabilities

LOG_P_FLOOR = 1e-9


def resample_constraints(rng, fixture_keys, fair_by_key):
    return _resample_constraints(rng, fixture_keys, fair_by_key)


def _resample_constraints(rng, fixture_keys, fair_by_key):
    raw = []
    for key in fixture_keys:
        market, line = key[1], key[2]
        family = FAMILY_OF_MARKET.get(market)
        if family is None:
            continue
        by_bm = fair_by_key[key]
        bms = list(by_bm.keys())
        n = len(bms)
        if n == 0:
            continue
        idx = rng.integers(0, n, size=n)
        resampled = [bms[i] for i in idx]
        sels = set()
        for bm in resampled:
            sels.update(by_bm[bm].keys())
        for sel in sels:
            vals = [by_bm[bm][sel] for bm in resampled if sel in by_bm[bm]]
            if not vals:
                continue
            median = statistics.median(vals)
            if len(vals) > 1:
                mad = statistics.median([abs(v - median) for v in vals])
                sigma = max(1.4826 * mad, config.SIGMA_FLOOR)
            else:
                sigma = DEFAULT_SIGMA_SINGLE_BOOK
            raw.append(MarketConstraint(market=market, selection=sel, family=family,
                                         m_k=median, sigma_k=sigma, line=line))
    return cap_family_weights(raw)


def bootstrap_fixture(fixture_id, Q, fair_by_key, n_draws, seed, ou_lines=None, team_total_lines=None):
    """Returns dict: (market, [line,] selection) -> {mean_p, median_p, p10,
    p90, sd, robust_log_p, p_geometric, n_draws}."""
    rng = np.random.default_rng(seed)
    fixture_keys = [k for k in fair_by_key if k[0] == fixture_id]
    draws = defaultdict(list)

    for _ in range(n_draws):
        constraints = _resample_constraints(rng, fixture_keys, fair_by_key)
        P_draw, _diag = solve_entropy_matrix(Q, constraints)
        mkts = market_probabilities(P_draw, ou_lines, team_total_lines)
        for k, v in mkts.items():
            draws[k].append(v)

    stats = {}
    for k, vals in draws.items():
        arr = np.array(vals)
        log_arr = np.log(np.clip(arr, LOG_P_FLOOR, 1.0))
        robust_log_p = float(log_arr.mean())
        stats[k] = {
            "mean_p": float(arr.mean()),
            "median_p": float(np.median(arr)),
            "p10": float(np.percentile(arr, 10)),
            "p90": float(np.percentile(arr, 90)),
            "sd": float(arr.std()),
            "robust_log_p": robust_log_p,
            "p_geometric": float(np.exp(robust_log_p)),
            "n_draws": len(vals),
        }
    return stats
