"""Per-league Poisson log-linear attack/defense model (section 6-7).

log(lambda_H) = mu + HFA + attack[home] + defense[away]
log(lambda_A) = mu + attack[away] + defense[home]

Fit by weighted MLE (L-BFGS-B, analytic gradient) with L2 ridge on the
attack/defense vectors. Sum-to-zero identification (Sigma attack = Sigma
defense = 0) is restored by a post-hoc recentering that is provably
likelihood-invariant (shifting attack by -a_bar and mu by +a_bar leaves both
lambda_H and lambda_A unchanged; same for defense/d_bar) — see module test.

Half-life and ridge are NOT picked by looking at the target date's matches;
they are frozen beforehand by rolling forward-validation NLL on history only
(section 7).
"""
import math
from dataclasses import dataclass, field

import numpy as np

from . import config


@dataclass
class LeagueModel:
    league_id: int
    team_ids: list
    team_index: dict
    mu: float
    hfa: float
    attack: dict
    defense: dict
    half_life_days: float
    ridge: float
    n_matches: int
    low_confidence: bool
    rho: float = 0.0


def _weights(dates, ref_date_ordinal, half_life_days):
    if half_life_days == float("inf"):
        return np.ones(len(dates))
    age_days = ref_date_ordinal - dates
    return np.exp(-math.log(2) * age_days / half_life_days)


def _build_arrays(matches, ref_date_ordinal, half_life_days, team_index):
    n = len(matches)
    home_idx = np.empty(n, dtype=int)
    away_idx = np.empty(n, dtype=int)
    goals_h = np.empty(n)
    goals_a = np.empty(n)
    dates = np.empty(n)
    for i, m in enumerate(matches):
        home_idx[i] = team_index[m["home_id"]]
        away_idx[i] = team_index[m["away_id"]]
        goals_h[i] = m["goals_home"]
        goals_a[i] = m["goals_away"]
        dates[i] = _date_ordinal(m["date"])
    w = _weights(dates, ref_date_ordinal, half_life_days)
    return home_idx, away_idx, goals_h, goals_a, w


def _date_ordinal(iso_date: str) -> int:
    # 'YYYY-MM-DDTHH:MM:SS+00:00' -> ordinal day
    y, mo, d = int(iso_date[0:4]), int(iso_date[5:7]), int(iso_date[8:10])
    import datetime
    return datetime.date(y, mo, d).toordinal()


def _nll_and_grad(params, n_teams, home_idx, away_idx, goals_h, goals_a, w, ridge):
    mu = params[0]
    hfa = params[1]
    attack = params[2:2 + n_teams]
    defense = params[2 + n_teams:2 + 2 * n_teams]

    log_lam_h = mu + hfa + attack[home_idx] + defense[away_idx]
    log_lam_a = mu + attack[away_idx] + defense[home_idx]
    lam_h = np.exp(log_lam_h)
    lam_a = np.exp(log_lam_a)

    nll = np.sum(w * (lam_h - goals_h * log_lam_h + lam_a - goals_a * log_lam_a))
    nll += ridge * (np.sum(attack ** 2) + np.sum(defense ** 2))

    d_h = w * (lam_h - goals_h)
    d_a = w * (lam_a - goals_a)

    grad = np.zeros_like(params)
    grad[0] = np.sum(d_h) + np.sum(d_a)   # mu
    grad[1] = np.sum(d_h)                  # hfa

    g_attack = np.zeros(n_teams)
    g_defense = np.zeros(n_teams)
    np.add.at(g_attack, home_idx, d_h)     # d/d attack[home]
    np.add.at(g_attack, away_idx, d_a)     # d/d attack[away]
    np.add.at(g_defense, away_idx, d_h)    # d/d defense[away]
    np.add.at(g_defense, home_idx, d_a)    # d/d defense[home]
    g_attack += 2 * ridge * attack
    g_defense += 2 * ridge * defense

    grad[2:2 + n_teams] = g_attack
    grad[2 + n_teams:2 + 2 * n_teams] = g_defense
    return nll, grad


def fit_league_model(league_id, matches, ref_date_iso, half_life_days, ridge,
                      min_matches=40) -> LeagueModel:
    from scipy.optimize import minimize

    ref_ord = _date_ordinal(ref_date_iso)
    team_ids = sorted({m["home_id"] for m in matches} | {m["away_id"] for m in matches})
    team_index = {t: i for i, t in enumerate(team_ids)}
    n_teams = len(team_ids)
    low_confidence = len(matches) < min_matches or n_teams < 6

    if n_teams == 0:
        return LeagueModel(league_id, [], {}, math.log(1.35), 0.25, {}, {}, half_life_days, ridge, 0, True)

    home_idx, away_idx, goals_h, goals_a, w = _build_arrays(matches, ref_ord, half_life_days, team_index)

    x0 = np.zeros(2 + 2 * n_teams)
    x0[0] = math.log(max(np.average(np.concatenate([goals_h, goals_a]), weights=np.concatenate([w, w])), 0.1))
    x0[1] = 0.25

    if low_confidence:
        ridge = max(ridge, 2.0)  # section 7: strongly shrunk league-level prior

    res = minimize(
        _nll_and_grad, x0, jac=True, method="L-BFGS-B",
        args=(n_teams, home_idx, away_idx, goals_h, goals_a, w, ridge),
        options={"maxiter": 300},
    )
    params = res.x
    mu, hfa = params[0], params[1]
    attack = params[2:2 + n_teams].copy()
    defense = params[2 + n_teams:2 + 2 * n_teams].copy()

    a_bar, d_bar = attack.mean(), defense.mean()
    attack -= a_bar
    defense -= d_bar
    mu += a_bar + d_bar

    return LeagueModel(
        league_id=league_id, team_ids=team_ids, team_index=team_index,
        mu=float(mu), hfa=float(hfa),
        attack={t: float(attack[i]) for t, i in team_index.items()},
        defense={t: float(defense[i]) for t, i in team_index.items()},
        half_life_days=half_life_days, ridge=ridge, n_matches=len(matches),
        low_confidence=low_confidence,
    )


def team_lambdas(model: LeagueModel, home_id, away_id):
    """Returns (lambda_H, lambda_A). Unknown teams (promoted/new) fall back
    to league-average attack/defense (0.0) and are flagged LOW_CONFIDENCE by
    the caller, never fabricated a specific rating."""
    a_h = model.attack.get(home_id, 0.0)
    d_a = model.defense.get(away_id, 0.0)
    a_a = model.attack.get(away_id, 0.0)
    d_h = model.defense.get(home_id, 0.0)
    unseen = home_id not in model.attack or away_id not in model.attack
    lam_h = math.exp(model.mu + model.hfa + a_h + d_a)
    lam_a = math.exp(model.mu + a_a + d_h)
    return lam_h, lam_a, unseen


def select_hyperparameters(league_id, matches, target_ref_date_iso, n_folds=5, min_train=60):
    """Rolling forward-validation NLL grid search over HALF_LIFE_GRID_DAYS x
    RIDGE_GRID, history-only (section 7). Returns (best_H, best_ridge, cv_table)."""
    if len(matches) < min_train + 20:
        return float("inf"), 1.0, []  # not enough history: force LOW_CONFIDENCE league prior upstream

    n = len(matches)
    bounds = np.linspace(min_train, n, n_folds + 1, dtype=int)
    folds = []
    for i in range(n_folds):
        train_end, val_end = bounds[i], bounds[i + 1]
        if val_end <= train_end:
            continue
        folds.append((matches[:train_end], matches[train_end:val_end]))

    cv_table = []
    best = (None, None, float("inf"))
    for H in config.HALF_LIFE_GRID_DAYS:
        for ridge in config.RIDGE_GRID:
            total_nll, total_n = 0.0, 0
            for train, val in folds:
                if not train or not val:
                    continue
                cutoff_iso = val[0]["date"]
                model = fit_league_model(league_id, train, cutoff_iso, H, ridge)
                for m in val:
                    lam_h, lam_a, _ = team_lambdas(model, m["home_id"], m["away_id"])
                    total_nll += _poisson_nll_point(lam_h, m["goals_home"]) + _poisson_nll_point(lam_a, m["goals_away"])
                    total_n += 1
            avg_nll = total_nll / total_n if total_n else float("inf")
            cv_table.append({"half_life_days": H, "ridge": ridge, "forward_nll_per_match": avg_nll, "n_val_matches": total_n})
            if avg_nll < best[2]:
                best = (H, ridge, avg_nll)
    return best[0], best[1], cv_table


def _poisson_nll_point(lam, k):
    return lam - k * math.log(lam) + math.lgamma(k + 1)
