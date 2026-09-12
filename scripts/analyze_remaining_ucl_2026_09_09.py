#!/usr/bin/env python3
"""Refresh every remaining UCL Matchday 1 fixture with the validated lean model."""
from __future__ import annotations

import importlib.util
import json
import math
import random
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
LEAN_PATH = Path("/Users/clement/Downloads/simulate_match_lean.py")
sys.path.insert(0, str(REPO / "tools" / "one-off-ticket-engine"))
sys.path.insert(0, str(LEAN_PATH.parent))

spec = importlib.util.spec_from_file_location("lean_official", LEAN_PATH)
lean = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(lean)
sm = lean.sm


def trace_minute_plausibility(goals, mult_h, mult_a):
    score = 0.0
    for goal in goals:
        table = mult_h if goal["team"] == "home" else mult_a
        multiplier = sm.bucket_multiplier_for_minute(table, goal["minute"])
        score += math.log(max(multiplier, 0.05))
    return score


sm.trace_minute_plausibility = trace_minute_plausibility
lean.N_SIMULATIONS = 20_000

# Verified against league=2, season=2026, round="League Stage - 1".
# Finished fixtures from 8 September are deliberately excluded.
FIXTURE_IDS = [
    1635741,
    1635628,
    1635686,
    1635705,
    1635736,
    1635698,
    1635659,
    1635708,
    1635648,
    1635632,
    1635697,
    1635729,
]


def simulate_market_probabilities(ctx, seed):
    counts = {
        "home_win": 0,
        "draw": 0,
        "away_win": 0,
        "home_or_draw": 0,
        "away_or_draw": 0,
        "no_draw": 0,
        "btts": 0,
        "btts_no": 0,
        "over_0_5": 0,
        "over_1_5": 0,
        "over_2_5": 0,
        "over_3_5": 0,
        "under_1_5": 0,
        "under_2_5": 0,
        "under_3_5": 0,
        "under_4_5": 0,
        "home_over_0_5": 0,
        "home_over_1_5": 0,
        "home_under_2_5": 0,
        "away_over_0_5": 0,
        "away_over_1_5": 0,
        "away_under_2_5": 0,
        "first_half_over_0_5": 0,
        "first_half_over_1_5": 0,
        "first_half_under_1_5": 0,
        "home_clean_sheet": 0,
        "away_clean_sheet": 0,
        "first_goal_home": 0,
        "first_goal_away": 0,
        "no_goal": 0,
    }
    rng = random.Random(seed ^ 0x1A5A2026)
    for _ in range(lean.N_SIMULATIONS):
        h, a, goals = lean.run_one_simulation(
            ctx["lam_h"],
            ctx["lam_a"],
            ctx["red_rate_h"],
            ctx["red_rate_a"],
            rng.randrange(1, 2**31),
        )
        if h > a:
            counts["home_win"] += 1
        elif h == a:
            counts["draw"] += 1
        else:
            counts["away_win"] += 1
        counts["home_or_draw"] += int(h >= a)
        counts["away_or_draw"] += int(a >= h)
        counts["no_draw"] += int(h != a)
        counts["btts"] += int(h > 0 and a > 0)
        counts["btts_no"] += int(h == 0 or a == 0)
        counts["over_0_5"] += int(h + a >= 1)
        counts["over_1_5"] += int(h + a >= 2)
        counts["over_2_5"] += int(h + a >= 3)
        counts["over_3_5"] += int(h + a >= 4)
        counts["under_1_5"] += int(h + a <= 1)
        counts["under_2_5"] += int(h + a <= 2)
        counts["under_3_5"] += int(h + a <= 3)
        counts["under_4_5"] += int(h + a <= 4)
        counts["home_over_0_5"] += int(h >= 1)
        counts["home_over_1_5"] += int(h >= 2)
        counts["home_under_2_5"] += int(h <= 2)
        counts["away_over_0_5"] += int(a >= 1)
        counts["away_over_1_5"] += int(a >= 2)
        counts["away_under_2_5"] += int(a <= 2)
        first_half_goals = sum(goal["minute"] <= 45 for goal in goals)
        counts["first_half_over_0_5"] += int(first_half_goals >= 1)
        counts["first_half_over_1_5"] += int(first_half_goals >= 2)
        counts["first_half_under_1_5"] += int(first_half_goals <= 1)
        counts["home_clean_sheet"] += int(a == 0)
        counts["away_clean_sheet"] += int(h == 0)
        if not goals:
            counts["no_goal"] += 1
        elif goals[0]["team"] == "home":
            counts["first_goal_home"] += 1
        else:
            counts["first_goal_away"] += 1

    probabilities = {
        key: round(value / lean.N_SIMULATIONS * 100, 1) for key, value in counts.items()
    }
    decisive = counts["home_win"] + counts["away_win"]
    probabilities["home_draw_no_bet"] = round(counts["home_win"] / decisive * 100, 1) if decisive else 50.0
    probabilities["away_draw_no_bet"] = round(counts["away_win"] / decisive * 100, 1) if decisive else 50.0
    return probabilities


def model_inputs(fixture, ctx):
    home = fixture["teams"]["home"]
    away = fixture["teams"]["away"]
    season = fixture["league"]["season"]
    return {
        "home_league_id": ctx["home_league"],
        "away_league_id": ctx["away_league"],
        "home_home_away_rates": sm.home_away_rates(home["id"], ctx["home_league"], season),
        "away_home_away_rates": sm.home_away_rates(away["id"], ctx["away_league"], season),
        "home_recent_form": sm.recent_form_rate(home["id"]),
        "away_recent_form": sm.recent_form_rate(away["id"]),
        "red_card_rate_pct": {
            "home": round(ctx["red_rate_h"] * 100, 1),
            "away": round(ctx["red_rate_a"] * 100, 1),
        },
        "rest_days": {"home": ctx["rest_h"], "away": ctx["rest_a"]},
        "h2h": ctx["h2h"],
        "market_recalibration": ctx["market_detail"],
    }


def quality_flags(ctx, probabilities):
    flags = []
    market = ctx["market_detail"]
    fair = market.get("fair_1x2_pct") if market.get("applied") else None
    if fair:
        model = [probabilities["home_win"], probabilities["draw"], probabilities["away_win"]]
        labels = ["domicile", "nul", "extérieur"]
        market_index = max(range(3), key=lambda index: fair[index])
        if fair[market_index] - model[market_index] >= 20:
            flags.append(
                f"Écart majeur modèle/marché sur {labels[market_index]}: "
                f"{model[market_index]:.1f}% contre {fair[market_index]:.1f}% marché juste."
            )
        if abs(market.get("market_implied_home_share", 0.5) - market.get("model_home_share_pre", 0.5)) >= 0.25:
            flags.append("Comparaison inter-championnats instable avant recalibrage marché.")
    return flags


def main():
    # A fresh isolated cache ensures the pre-match inputs and odds are read now,
    # without deleting or altering the user's historical API cache.
    sm.client = sm.ApiClient(cache_dir=Path(tempfile.mkdtemp(prefix="iashark-ucl-live-")))

    out_dir = REPO / "data" / "match-simulation" / "2026-09-09"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "remaining-ucl-analysis-refresh.json"
    existing_by_fixture = {}
    if out_path.exists():
        previous = json.loads(out_path.read_text())
        existing_by_fixture = {row["fixture_id"]: row for row in previous.get("matches", [])}

    analyses = []
    for index, fixture_id in enumerate(FIXTURE_IDS):
        fixture_response = sm.client.get("/fixtures", {"id": fixture_id}, use_cache=False)
        fixtures = fixture_response.get("response", [])
        if not fixtures:
            raise RuntimeError(f"Fixture API introuvable: {fixture_id}")
        fixture = fixtures[0]
        status = fixture["fixture"]["status"]["short"]
        if status not in lean.NOT_YET_STARTED_STATUSES:
            continue

        ctx = lean.compute_lambdas(fixture)
        seed = 26_090_900 + index
        probabilities = simulate_market_probabilities(ctx, seed)
        if fixture_id in existing_by_fixture:
            result = existing_by_fixture[fixture_id]
        else:
            result = lean.simulate(fixture_id, seed)
        analyses.append(
            {
                **result,
                "kickoff": fixture["fixture"]["date"],
                "status": status,
                "probabilities_pct": probabilities,
                "model_inputs": model_inputs(fixture, ctx),
                "quality_flags": quality_flags(ctx, probabilities),
            }
        )
        score = result["final_score"]
        print(
            f"{result['homeTeam']} {score['home']}-{score['away']} {result['awayTeam']} "
            f"| moyenne {result['mean_simulated_score']['home']}-{result['mean_simulated_score']['away']}",
            flush=True,
        )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": "simulate_match_lean.py — méthode validée en deux étapes",
        "simulations_per_match": lean.N_SIMULATIONS,
        "matches": analyses,
    }
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"REPORT={out_path}")


if __name__ == "__main__":
    main()
