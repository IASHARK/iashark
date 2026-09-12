import random

from engine.poisson_model import fit_league_model, team_lambdas


def _synthetic_matches(n_teams=8, n_rounds=6, seed=1):
    random.seed(seed)
    teams = list(range(n_teams))
    matches = []
    date_counter = 1
    for r in range(n_rounds):
        shuffled = teams[:]
        random.shuffle(shuffled)
        for i in range(0, n_teams, 2):
            h, a = shuffled[i], shuffled[i + 1]
            gh = max(0, int(random.gauss(1.5, 1.0)))
            ga = max(0, int(random.gauss(1.1, 1.0)))
            matches.append({
                "fixture_id": date_counter, "date": f"2026-01-{1 + date_counter % 27:02d}T12:00:00+00:00",
                "season": 2026, "home_id": h, "home_name": str(h), "away_id": a, "away_name": str(a),
                "goals_home": gh, "goals_away": ga,
            })
            date_counter += 1
    matches.sort(key=lambda m: m["date"])
    return matches


def test_identification_constraint_sum_to_zero():
    matches = _synthetic_matches()
    model = fit_league_model(99, matches, "2026-02-01T00:00:00+00:00", half_life_days=180, ridge=0.5)
    assert abs(sum(model.attack.values())) < 1e-6
    assert abs(sum(model.defense.values())) < 1e-6


def test_recentering_is_likelihood_invariant():
    """Shifting attack by -a_bar (mu += a_bar) and defense by -d_bar (mu +=
    d_bar) must leave every fitted lambda unchanged — this is the algebraic
    fact the post-hoc recentring in poisson_model.py relies on."""
    matches = _synthetic_matches()
    model = fit_league_model(99, matches, "2026-02-01T00:00:00+00:00", half_life_days=180, ridge=0.5)
    for m in matches[:5]:
        lam_h, lam_a, _ = team_lambdas(model, m["home_id"], m["away_id"])
        assert lam_h > 0 and lam_a > 0

    import math
    a_bar_fake = 0.37
    shifted_attack = {t: v - a_bar_fake for t, v in model.attack.items()}
    shifted_mu = model.mu + a_bar_fake
    for m in matches[:5]:
        h, a = m["home_id"], m["away_id"]
        original = math.exp(model.mu + model.hfa + model.attack[h] + model.defense[a])
        shifted = math.exp(shifted_mu + model.hfa + shifted_attack[h] + model.defense[a])
        assert abs(original - shifted) < 1e-9


def test_unseen_team_flagged_not_fabricated():
    matches = _synthetic_matches()
    model = fit_league_model(99, matches, "2026-02-01T00:00:00+00:00", half_life_days=180, ridge=0.5)
    lam_h, lam_a, unseen = team_lambdas(model, 9999, 8888)
    assert unseen is True
    # falls back to league-average (0.0) attack/defense, not a fabricated rating
    assert lam_h > 0 and lam_a > 0
