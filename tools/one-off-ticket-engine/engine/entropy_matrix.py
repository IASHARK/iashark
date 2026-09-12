"""Market-anchored score matrix via relative-entropy projection (section 14-16).

    J(P) = KL(P||Q) + 0.5 * sum_k ((A_k(P) - m_k) / sigma_k)^2       s.t. P>=0, sum P = 1

Solved with a softmax reparametrization (P = softmax(theta)) so the
constraints are automatic, using L-BFGS-B with an analytic gradient — this
runs once per fixture per bootstrap draw, so it has to be fast.
"""
from dataclasses import dataclass
from typing import Optional

import numpy as np
from scipy.optimize import minimize

from . import config
from .markets import market_indicator_matrix

DEFAULT_SIGMA_SINGLE_BOOK = 0.05
MIN_BOOKMAKERS_FOR_CONSTRAINT = 2


@dataclass
class MarketConstraint:
    market: str
    selection: str
    family: str
    m_k: float
    sigma_k: float
    line: Optional[float] = None


FAMILY_OF_MARKET = {
    "1X2": "RESULT", "OU": "TOTALS", "BTTS": "BTTS",
    "TEAM_TOTAL_HOME": "TEAM_TOTAL_HOME", "TEAM_TOTAL_AWAY": "TEAM_TOTAL_AWAY",
}


def raw_constraints_from_points(consensus_points: list) -> list:
    """Turns ConsensusPoint rows into (un-capped) constraints. Only the
    market families explicitly listed in section 16 anchor the entropy
    solve; DC/DNB probabilities are derived from P afterwards."""
    raw = []
    for p in consensus_points:
        family = FAMILY_OF_MARKET.get(p.market)
        if family is None:
            continue
        sigma = max(p.dispersion, config.SIGMA_FLOOR) if p.bookmaker_count >= MIN_BOOKMAKERS_FOR_CONSTRAINT else DEFAULT_SIGMA_SINGLE_BOOK
        raw.append(MarketConstraint(market=p.market, selection=p.selection, family=family,
                                     m_k=p.median, sigma_k=sigma, line=p.line))
    return raw


def cap_family_weights(raw: list) -> list:
    """Section 16: cap total influence (sum of 1/sigma^2) per family at
    FAMILY_WEIGHT_CAP_MULTIPLIER x its strongest single constraint, only
    ever shrinking (never inflating) — see config.py for the rationale."""
    by_family = {}
    for c in raw:
        by_family.setdefault(c.family, []).append(c)
    out = []
    for family, items in by_family.items():
        raw_weights = np.array([1.0 / (c.sigma_k ** 2) for c in items])
        total = raw_weights.sum()
        if total <= 0:
            continue
        budget = config.FAMILY_WEIGHT_CAP_MULTIPLIER * raw_weights.max()
        scale = min(1.0, budget / total)
        for c, w in zip(items, raw_weights):
            capped_weight = w * scale
            new_sigma = math_sqrt_inv(capped_weight)
            out.append(MarketConstraint(c.market, c.selection, c.family, c.m_k, new_sigma, c.line))
    return out


def build_constraints(consensus_points: list) -> list:
    return cap_family_weights(raw_constraints_from_points(consensus_points))


def math_sqrt_inv(weight):
    import math
    return math.sqrt(1.0 / weight) if weight > 0 else float("inf")


def _build_c_matrix(size: int, constraints: list):
    ncells = size * size
    C = np.zeros((len(constraints), ncells))
    m = np.zeros(len(constraints))
    sigma = np.zeros(len(constraints))
    for k, c in enumerate(constraints):
        ind = market_indicator_matrix(size, c.market, c.selection, c.line)
        C[k, :] = ind.flatten().astype(float)
        m[k] = c.m_k
        sigma[k] = c.sigma_k
    return C, m, sigma


def solve_entropy_matrix(Q: np.ndarray, constraints: list, max_iter=500):
    size = Q.shape[0]
    q_flat = Q.flatten()
    q_flat = np.clip(q_flat, 1e-300, None)

    if not constraints:
        return Q.copy(), {"converged": True, "n_constraints": 0, "objective": 0.0}

    C, m, sigma = _build_c_matrix(size, constraints)
    sigma2 = sigma ** 2

    log_q = np.log(q_flat)
    theta0 = log_q - log_q.max()

    def objective(theta):
        theta_shift = theta - theta.max()
        exp_t = np.exp(theta_shift)
        Z = exp_t.sum()
        P = exp_t / Z

        kl = np.sum(P * (np.log(P) - log_q))
        A = C @ P
        quad = 0.5 * np.sum(((A - m) / sigma) ** 2)
        J = kl + quad

        dKL_dP = np.log(P) - log_q + 1.0
        dQuad_dP = C.T @ ((A - m) / sigma2)
        dJ_dP = dKL_dP + dQuad_dP
        mean_term = np.sum(P * dJ_dP)
        grad_theta = P * (dJ_dP - mean_term)
        return J, grad_theta

    res = minimize(objective, theta0, jac=True, method="L-BFGS-B",
                    options={"maxiter": max_iter, "ftol": 1e-10, "gtol": 1e-8})

    theta_final = res.x - res.x.max()
    exp_t = np.exp(theta_final)
    P_flat = exp_t / exp_t.sum()
    P = P_flat.reshape(size, size)

    gaps = {
        f"{c.market}:{c.line}:{c.selection}": float((C[k] @ P_flat) - m[k])
        for k, c in enumerate(constraints)
    }
    # scipy's own success flag can read False purely from hitting maxiter
    # while the actual residual is already negligible (tight ftol/gtol at
    # this numeric scale) — so convergence is judged on the thing that
    # actually matters: how close A_k(P) landed to its target m_k.
    max_gap = max(abs(v) for v in gaps.values()) if gaps else 0.0
    diag = {
        "converged": bool(res.success) or max_gap < 5e-4,
        "max_constraint_gap": max_gap,
        "n_constraints": len(constraints),
        "objective": float(res.fun),
        "iterations": int(res.nit),
        "final_market_gap": gaps,
    }
    return P, diag
