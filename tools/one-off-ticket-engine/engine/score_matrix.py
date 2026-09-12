"""Statistical score matrix Q(h,a) (section 8): adaptive grid, tail mass
control, and a per-league Dixon-Coles rho fit only when the sample supports
a stable estimate."""
import math
import numpy as np
from scipy.stats import poisson
from scipy.optimize import minimize_scalar

from . import config

DC_MIN_MATCHES = 150
DC_RHO_BOUNDS = (-0.30, 0.30)


def _dixon_coles_tau(h, a, lam_h, lam_a, rho):
    if h == 0 and a == 0:
        return 1 - lam_h * lam_a * rho
    if h == 0 and a == 1:
        return 1 + lam_h * rho
    if h == 1 and a == 0:
        return 1 + lam_a * rho
    if h == 1 and a == 1:
        return 1 - rho
    return 1.0


def build_score_matrix(lam_h: float, lam_a: float, rho: float = 0.0,
                        tail_eps: float = config.TAIL_MASS_EPS,
                        max_goals: int = config.MAX_GOALS_GRID):
    size = 6
    while True:
        goals = np.arange(size + 1)
        ph = poisson.pmf(goals, lam_h)
        pa = poisson.pmf(goals, lam_a)
        q = np.outer(ph, pa)
        tail_mass = 1.0 - q.sum()
        if tail_mass < tail_eps or size >= max_goals:
            break
        size += 3

    if rho != 0.0:
        for h in (0, 1):
            for a in (0, 1):
                q[h, a] *= _dixon_coles_tau(h, a, lam_h, lam_a, rho)
        q = np.clip(q, 0, None)

    total = q.sum()
    q = q / total
    return q, float(tail_mass), size, tail_mass < tail_eps


def _neg_loglik_rho(rho, low_score_counts, lam_pairs, weights):
    """low_score_counts: list of (h,a) actual outcomes restricted to {0,1}x{0,1}
    is not required — we evaluate the tau-reweighted Poisson likelihood over
    the *actual* observed score for every match, which only differs from the
    unmodified Poisson likelihood when the observed score is one of the 4
    low-score cells."""
    nll = 0.0
    for (h, a), (lam_h, lam_a), w in zip(low_score_counts, lam_pairs, weights):
        tau = _dixon_coles_tau(min(h, 1), min(a, 1), lam_h, lam_a, rho) if h <= 1 and a <= 1 else 1.0
        if tau <= 0:
            tau = 1e-9
        nll -= w * math.log(tau)
    return nll


def fit_dixon_coles_rho(matches_with_lambdas):
    """matches_with_lambdas: list of (goals_h, goals_a, lam_h, lam_a, weight).
    Returns (rho, fitted: bool). Falls back to rho=0 below DC_MIN_MATCHES or
    on unstable/bound-hitting optimization, per section 8's instruction to
    never import a rho from another league."""
    n = len(matches_with_lambdas)
    if n < DC_MIN_MATCHES:
        return 0.0, False

    outcomes = [(m[0], m[1]) for m in matches_with_lambdas]
    lam_pairs = [(m[2], m[3]) for m in matches_with_lambdas]
    weights = [m[4] for m in matches_with_lambdas]

    result = minimize_scalar(
        _neg_loglik_rho, bounds=DC_RHO_BOUNDS, method="bounded",
        args=(outcomes, lam_pairs, weights),
    )
    rho = float(result.x)
    at_bound = abs(rho - DC_RHO_BOUNDS[0]) < 1e-4 or abs(rho - DC_RHO_BOUNDS[1]) < 1e-4
    if not result.success or at_bound:
        return 0.0, False
    return rho, True
