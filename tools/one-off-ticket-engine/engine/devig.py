"""Per-bookmaker devigging (section 12).

Shin's method for the 1X2 family (mutually exclusive, 3-way), with a
documented fallback to simple normalization if Newton-Raphson fails to
converge. Simple 2-way devig for OU / BTTS / TEAM_TOTAL pairs.

Double Chance is intentionally NEVER devigged as a 3-way family here (1X,
X2, 12 are not mutually exclusive) — its raw executable odds are kept as-is
and its fair probability is derived later from the market-anchored score
matrix (section 12, 17).
"""
import math


def shin_probabilities(odds: list):
    """Returns (fair_probs, converged: bool). Same Newton-Raphson formulation
    as the production repo's lib/models.js::shinProbabilities, reimplemented
    independently here (isolated tool, no cross-import)."""
    prices = [o for o in odds if o and o > 1]
    if not prices:
        return None, False
    raw_probs = [1.0 / o for o in prices]
    sum_raw = sum(raw_probs)
    if sum_raw <= 1:
        return raw_probs, True  # no overround to remove

    z = 0.02
    converged = False
    for _ in range(50):
        f, df = 0.0, 0.0
        for qi in raw_probs:
            denom = math.sqrt(z * z + (4 * (1 - z) * qi * qi) / sum_raw)
            f += (z + denom) / (2 * (1 - z))
            df += (1 + ((2 * z) / sum_raw - (2 * qi * qi * (1 - 2 * z)) / (sum_raw ** 2)) / denom) / (2 * (1 - z)) \
                  + (z + denom) / (2 * (1 - z) ** 2)
        f -= 1
        if df == 0:
            break
        z_new = z - f / df
        if abs(z_new - z) < 1e-8:
            z = max(0.0, min(0.15, z_new))
            converged = True
            break
        z = max(0.0, min(0.15, z_new))

    true_probs = [
        (z + math.sqrt(z * z + (4 * (1 - z) * qi * qi) / sum_raw)) / (2 * (1 - z))
        for qi in raw_probs
    ]
    sum_true = sum(true_probs)
    if sum_true <= 0 or not converged:
        # documented fallback: plain normalization of implied probabilities
        return [q / sum_raw for q in raw_probs], False
    return [p / sum_true for p in true_probs], True


def two_way_devig(odd_a: float, odd_b: float):
    """Simple normalization devig for a mutually exclusive 2-way pair
    (Over/Under, BTTS Yes/No, Team Total Over/Under)."""
    pa, pb = 1.0 / odd_a, 1.0 / odd_b
    total = pa + pb
    return pa / total, pb / total
