#!/usr/bin/env python3
"""Paired 20-match comparison of the official lean simulator and a frozen variant.

The variant is declared before reading results:
- H2H weight reduced from 10% to 2%.
- Before the first goal, the home scoring hazard is multiplied by 0.93 to
  address the documented 59% vs 51% home-first bias.
- Team minute profiles are shrunk 80% toward a neutral competition curve.

This is a retrospective diagnostic, not a leakage-free walk-forward backtest.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import random
import statistics
import sys
from collections import Counter
from pathlib import Path


LEAN_PATH = Path("/Users/clement/Downloads/simulate_match_lean.py")
REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "tools" / "one-off-ticket-engine"))
spec = importlib.util.spec_from_file_location("lean_official", LEAN_PATH)
lean = importlib.util.module_from_spec(spec)
assert spec and spec.loader
sys.path.insert(0, str(LEAN_PATH.parent))
spec.loader.exec_module(lean)
sm = lean.sm


def finished_fixtures(league: int, season: int, count: int):
    body = sm.client.get("/fixtures", {"league": league, "season": season, "status": "FT"})
    fixtures = sorted(body.get("response", []), key=lambda x: x["fixture"]["timestamp"], reverse=True)
    usable = [f for f in fixtures if f.get("goals", {}).get("home") is not None]
    return usable[:count]


def real_goal_events(fixture_id: int):
    body = sm.client.get("/fixtures/events", {"fixture": fixture_id})
    goals = []
    for event in body.get("response", []):
        if event.get("type") != "Goal" or event.get("detail") == "Missed Penalty":
            continue
        minute = int((event.get("time") or {}).get("elapsed") or 0)
        extra = (event.get("time") or {}).get("extra")
        goals.append({"minute": min(minute, 90), "extra": extra, "team_id": event["team"]["id"]})
    return sorted(goals, key=lambda g: (g["minute"], g.get("extra") or 0))


def variant_lambdas(ctx):
    """Undo official 10% H2H blend, then apply the frozen 2% blend."""
    if not ctx["h2h"]:
        return ctx["lam_h"], ctx["lam_a"]
    fh = sm.rest_fatigue_multiplier(ctx["rest_h"])
    fa = sm.rest_fatigue_multiplier(ctx["rest_a"])
    post_h = ctx["lam_h"] / fh
    post_a = ctx["lam_a"] / fa
    pre_h = (post_h - sm.H2H_WEIGHT * ctx["h2h"]["gf_avg"]) / (1 - sm.H2H_WEIGHT)
    pre_a = (post_a - sm.H2H_WEIGHT * ctx["h2h"]["ga_avg"]) / (1 - sm.H2H_WEIGHT)
    return ((0.98 * pre_h + 0.02 * ctx["h2h"]["gf_avg"]) * fh,
            (0.98 * pre_a + 0.02 * ctx["h2h"]["ga_avg"]) * fa)


def run_variant_once(lam_h, lam_a, red_h, red_a, seed):
    rng = random.Random(seed)
    slots = sm.minute_slots(rng)
    red = {"home": rng.randint(20, 85) if rng.random() < red_h else None,
           "away": rng.randint(20, 85) if rng.random() < red_a else None}
    sh = sa = 0
    goals = []
    for minute, extra in slots:
        diff = sh - sa
        fatigue = 1.0 + max(0, minute - 70) * 0.003
        mh = sm.state_multiplier(diff, minute) * fatigue
        ma = sm.state_multiplier(-diff, minute) * fatigue
        if not goals:
            mh *= 0.93
        if red["home"] and minute >= red["home"]:
            mh *= 0.75
            ma *= 1.20
        if red["away"] and minute >= red["away"]:
            ma *= 0.75
            mh *= 1.20
        if rng.random() < (lam_h / 90.0) * mh:
            sh += 1
            goals.append({"minute": minute, "team": "home", **({"minuteLabel": f"{minute}+{extra}'"} if extra else {})})
        if rng.random() < (lam_a / 90.0) * ma:
            sa += 1
            goals.append({"minute": minute, "team": "away", **({"minuteLabel": f"{minute}+{extra}'"} if extra else {})})
    return sh, sa, goals


def pick(run_fn, lam_h, lam_a, red_h, red_a, seed, mult_h, mult_a, n):
    rng = random.Random(seed)
    seeds = [rng.randrange(1, 2**31) for _ in range(n)]
    traces = []
    freq = Counter()
    sum_h = sum_a = 0
    for s in seeds:
        h, a, goals = run_fn(lam_h, lam_a, red_h, red_a, s)
        traces.append((h, a, goals))
        freq[(h, a)] += 1
        sum_h += h
        sum_a += a
    mean_h, mean_a = sum_h / n, sum_a / n
    top15 = [score for score, _ in freq.most_common(15)]
    score = min(top15, key=lambda x: (x[0] - mean_h) ** 2 + (x[1] - mean_a) ** 2)
    candidates = [g for h, a, g in traces if (h, a) == score]
    weights = [math.exp(trace_minute_plausibility(g, mult_h, mult_a)) for g in candidates]
    chosen = random.Random(seed ^ 0x5CE1EC7).choices(candidates, weights=weights, k=1)[0]
    return score, sorted(chosen, key=lambda g: g["minute"])


def minute_error(predicted, actual):
    if not predicted and not actual:
        return 0.0
    if not predicted or not actual:
        return 90.0
    p = [g["minute"] for g in predicted]
    a = [g["minute"] for g in actual]
    paired = sum(abs(x - y) for x, y in zip(p, a))
    paired += 45 * abs(len(p) - len(a))
    return paired / max(len(p), len(a))


def first_team(goals, home_id=None):
    if not goals:
        return "none"
    if "team" in goals[0]:
        return goals[0]["team"]
    return "home" if goals[0]["team_id"] == home_id else "away"


def trace_minute_plausibility(goals, mult_h, mult_a):
    """Intended stage-2 score: likelihood of each goal's 15-minute bucket.

    The supplied lean file references this helper, but the supplied base
    module does not contain it. Keeping it here makes the comparison
    executable without altering either user-supplied source file.
    """
    score = 0.0
    for goal in goals:
        table = mult_h if goal["team"] == "home" else mult_a
        multiplier = sm.bucket_multiplier_for_minute(table, goal["minute"])
        score += math.log(max(multiplier, 0.05))
    return score


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--league", type=int, default=2)
    ap.add_argument("--season", type=int, default=2026)
    ap.add_argument("--matches", type=int, default=20)
    ap.add_argument("--simulations", type=int, default=20000)
    ap.add_argument("--output", default="data/match-simulation/paired-backtest-20.json")
    args = ap.parse_args()
    fixtures = finished_fixtures(args.league, args.season, args.matches)
    if len(fixtures) < args.matches:
        raise RuntimeError(f"Seulement {len(fixtures)} matchs termines disponibles")

    rows = []
    for index, fx in enumerate(fixtures, 1):
        ctx = lean.compute_lambdas(fx)
        actual_goals = real_goal_events(fx["fixture"]["id"])
        actual = (fx["goals"]["home"], fx["goals"]["away"])
        seed = 42000 + fx["fixture"]["id"]

        official_score, official_goals = pick(
            lean.run_one_simulation, ctx["lam_h"], ctx["lam_a"], ctx["red_rate_h"],
            ctx["red_rate_a"], seed, ctx["minute_mult_h"], ctx["minute_mult_a"], args.simulations)

        vh, va = variant_lambdas(ctx)
        smooth_h = {b: 0.8 + 0.2 * v for b, v in ctx["minute_mult_h"].items()}
        smooth_a = {b: 0.8 + 0.2 * v for b, v in ctx["minute_mult_a"].items()}
        variant_score, variant_goals = pick(
            run_variant_once, vh, va, ctx["red_rate_h"], ctx["red_rate_a"], seed,
            smooth_h, smooth_a, args.simulations)

        def metrics(score, goals):
            return {
                "score": f"{score[0]}-{score[1]}",
                "exact": score == actual,
                "goal_mae": (abs(score[0] - actual[0]) + abs(score[1] - actual[1])) / 2,
                "within_one_each": abs(score[0] - actual[0]) <= 1 and abs(score[1] - actual[1]) <= 1,
                "minute_mae": round(minute_error(goals, actual_goals), 2),
                "first_team_correct": first_team(goals) == first_team(actual_goals, fx["teams"]["home"]["id"]),
                "goals": goals,
            }

        rows.append({
            "fixture_id": fx["fixture"]["id"],
            "date": fx["fixture"]["date"],
            "match": f"{fx['teams']['home']['name']} - {fx['teams']['away']['name']}",
            "actual": f"{actual[0]}-{actual[1]}",
            "actual_goals": actual_goals,
            "official": metrics(official_score, official_goals),
            "variant": metrics(variant_score, variant_goals),
        })
        print(f"[{index:02d}/{len(fixtures)}] {rows[-1]['match']}: reel {rows[-1]['actual']}, "
              f"officiel {rows[-1]['official']['score']}, variante {rows[-1]['variant']['score']}", flush=True)

    def summary(key):
        vals = [r[key] for r in rows]
        return {
            "exact_scores": sum(v["exact"] for v in vals),
            "within_one_each": sum(v["within_one_each"] for v in vals),
            "mean_goal_mae": round(statistics.mean(v["goal_mae"] for v in vals), 3),
            "mean_minute_mae": round(statistics.mean(v["minute_mae"] for v in vals), 2),
            "first_team_correct": sum(v["first_team_correct"] for v in vals),
        }

    result = {
        "limitations": "Retrospective comparison using API data available today; not leakage-free walk-forward.",
        "frozen_variant": {"h2h_weight": 0.02, "pre_first_goal_home_hazard": 0.93,
                           "team_minute_profile_weight": 0.20},
        "n_matches": len(rows),
        "n_simulations_per_method_per_match": args.simulations,
        "official_summary": summary("official"),
        "variant_summary": summary("variant"),
        "matches": rows,
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({k: result[k] for k in ("official_summary", "variant_summary")}, ensure_ascii=False, indent=2))
    print(f"Rapport: {output.resolve()}")


if __name__ == "__main__":
    main()
