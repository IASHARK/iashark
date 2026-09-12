#!/usr/bin/env python3
"""Rank full-time UCL betting markets with separate count models.

The goal model is loaded from the pre-match hierarchical analysis.  Corners,
shots, shots on target, yellow cards, fouls and offsides are estimated from
recent fixture statistics with recency weighting, venue blending, opponent
allowance and shrinkage.  Bookmaker odds are only used after probabilities are
frozen, for quality control and ticket construction.

This is a one-day research tool, not a claim of guaranteed profitability.
"""

from __future__ import annotations

import itertools
import json
import math
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from scipy.stats import beta, nbinom, poisson


REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools" / "one-off-ticket-engine"))
from engine.api_client import ApiClient  # noqa: E402
from engine.score_matrix import build_score_matrix  # noqa: E402


MODEL_PATH = REPO / "data/match-simulation/2026-09-09/ucl-sep9-hierarchical-analysis.json"
OUT_DIR = REPO / "data/analysis/2026-09-09-ucl-all-markets"
CACHE_DIR = OUT_DIR / "api-cache"
OUT_PATH = OUT_DIR / "all-markets-ticket.json"

TARGET_IDS = (1635741, 1635628, 1635686, 1635705, 1635736, 1635698)
METRICS = {
    "shots_on_target": "Shots on Goal",
    "shots": "Total Shots",
    "corners": "Corner Kicks",
    "yellow_cards": "Yellow Cards",
    "fouls": "Fouls",
    "offsides": "Offsides",
}
VARIANTS = (
    {"lookback": 10, "half_life": 75.0, "shrink": 6.0, "venue_weight": 0.20},
    {"lookback": 15, "half_life": 120.0, "shrink": 8.0, "venue_weight": 0.30},
    {"lookback": 20, "half_life": 180.0, "shrink": 10.0, "venue_weight": 0.35},
    {"lookback": 25, "half_life": 240.0, "shrink": 12.0, "venue_weight": 0.40},
    {"lookback": 20, "half_life": 120.0, "shrink": 14.0, "venue_weight": 0.20},
)


def parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip().replace("%", "")
    try:
        return float(text)
    except ValueError:
        return None


def weighted_mean(values: list[tuple[float, float]]) -> float | None:
    if not values:
        return None
    den = sum(weight for _, weight in values)
    if den <= 0:
        return None
    return sum(value * weight for value, weight in values) / den


def shrunk_mean(values: list[tuple[float, float]], baseline: float, shrink: float) -> float:
    den = sum(weight for _, weight in values)
    return (sum(value * weight for value, weight in values) + shrink * baseline) / (den + shrink)


def count_distribution(mu: float, variance: float, max_count: int = 100) -> np.ndarray:
    mu = max(float(mu), 1e-6)
    variance = max(float(variance), mu)
    grid = np.arange(max_count + 1)
    if variance <= mu * 1.03:
        probs = poisson.pmf(grid, mu)
    else:
        size = mu * mu / max(variance - mu, 1e-9)
        probability = size / (size + mu)
        probs = nbinom.pmf(grid, size, probability)
    probs[-1] += max(0.0, 1.0 - float(probs.sum()))
    return probs / probs.sum()


def probability_over(dist: np.ndarray, line: float) -> float:
    return float(dist[np.arange(len(dist)) > line].sum())


def probability_under(dist: np.ndarray, line: float) -> float:
    return float(dist[np.arange(len(dist)) < line].sum())


def probability_1x2(home: np.ndarray, away: np.ndarray) -> dict[str, float]:
    matrix = np.outer(home, away)
    hg, ag = np.meshgrid(np.arange(len(home)), np.arange(len(away)), indexing="ij")
    return {
        "Home": float(matrix[hg > ag].sum()),
        "Draw": float(matrix[hg == ag].sum()),
        "Away": float(matrix[hg < ag].sum()),
    }


def get_recent_data(client: ApiClient, target_fixtures: list[dict[str, Any]], cutoff: datetime):
    team_ids = sorted({side["id"] for fixture in target_fixtures for side in fixture["teams"].values()})
    fixture_rows: dict[int, dict[str, Any]] = {}
    team_fixture_ids: dict[int, list[int]] = defaultdict(list)

    for team_id in team_ids:
        body = client.get("/fixtures", {"team": team_id, "last": 25})
        rows = []
        for fixture in body.get("response", []):
            when = parse_date(fixture["fixture"]["date"])
            if when >= cutoff or fixture["fixture"]["status"]["short"] not in {"FT", "AET", "PEN"}:
                continue
            rows.append(fixture)
        rows.sort(key=lambda row: parse_date(row["fixture"]["date"]), reverse=True)
        for fixture in rows[:25]:
            fixture_id = int(fixture["fixture"]["id"])
            fixture_rows[fixture_id] = fixture
            team_fixture_ids[team_id].append(fixture_id)

    stats_by_fixture: dict[int, dict[int, dict[str, float]]] = {}
    for index, fixture_id in enumerate(sorted(fixture_rows), start=1):
        body = client.get("/fixtures/statistics", {"fixture": fixture_id})
        sides: dict[int, dict[str, float]] = {}
        for row in body.get("response", []):
            values = {item["type"]: number(item.get("value")) for item in row.get("statistics", [])}
            sides[int(row["team"]["id"])] = {
                metric: values.get(api_name)
                for metric, api_name in METRICS.items()
            }
        stats_by_fixture[fixture_id] = sides
        if index % 50 == 0:
            print(f"statistics {index}/{len(fixture_rows)}", flush=True)

    histories: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for team_id, fixture_ids in team_fixture_ids.items():
        for fixture_id in fixture_ids:
            fixture = fixture_rows[fixture_id]
            home_id = int(fixture["teams"]["home"]["id"])
            away_id = int(fixture["teams"]["away"]["id"])
            opponent_id = away_id if team_id == home_id else home_id
            sides = stats_by_fixture.get(fixture_id, {})
            if team_id not in sides or opponent_id not in sides:
                continue
            histories[team_id].append({
                "fixture_id": fixture_id,
                "date": parse_date(fixture["fixture"]["date"]),
                "is_home": team_id == home_id,
                "for": sides[team_id],
                "against": sides[opponent_id],
            })
        histories[team_id].sort(key=lambda row: row["date"], reverse=True)
    return histories, len(fixture_rows)


def metric_baseline(histories: dict[int, list[dict[str, Any]]], metric: str) -> float:
    values = []
    seen = set()
    for rows in histories.values():
        for row in rows:
            key = (row["fixture_id"], metric)
            value = row["for"].get(metric)
            if key in seen or value is None:
                continue
            seen.add(key)
            values.append(value)
    return float(np.mean(values)) if values else 1.0


def weighted_rows(
    rows: list[dict[str, Any]], metric: str, key: str, cutoff: datetime,
    variant: dict[str, float], venue: bool | None = None,
) -> list[tuple[float, float]]:
    selected = []
    for row in rows[: int(variant["lookback"])]:
        if venue is not None and row["is_home"] != venue:
            continue
        value = row[key].get(metric)
        if value is None:
            continue
        age = max(0.0, (cutoff - row["date"]).total_seconds() / 86400.0)
        weight = math.exp(-math.log(2.0) * age / variant["half_life"])
        selected.append((float(value), weight))
    return selected


def estimate_side_mean(
    rows: list[dict[str, Any]], metric: str, key: str, venue: bool,
    baseline: float, cutoff: datetime, variant: dict[str, float],
) -> float:
    all_values = weighted_rows(rows, metric, key, cutoff, variant)
    venue_values = weighted_rows(rows, metric, key, cutoff, variant, venue)
    overall = shrunk_mean(all_values, baseline, variant["shrink"])
    if len(venue_values) < 3:
        return overall
    venue_mean = shrunk_mean(venue_values, baseline, variant["shrink"] * 0.65)
    weight = variant["venue_weight"]
    return (1.0 - weight) * overall + weight * venue_mean


def estimate_metric_variant(
    home_id: int, away_id: int, metric: str, histories: dict[int, list[dict[str, Any]]],
    baseline: float, cutoff: datetime, variant: dict[str, float],
) -> dict[str, Any]:
    home_rows = histories[home_id]
    away_rows = histories[away_id]
    hf = estimate_side_mean(home_rows, metric, "for", True, baseline, cutoff, variant)
    aa = estimate_side_mean(away_rows, metric, "against", False, baseline, cutoff, variant)
    af = estimate_side_mean(away_rows, metric, "for", False, baseline, cutoff, variant)
    ha = estimate_side_mean(home_rows, metric, "against", True, baseline, cutoff, variant)
    mu_home = math.sqrt(max(hf, 0.03) * max(aa, 0.03))
    mu_away = math.sqrt(max(af, 0.03) * max(ha, 0.03))

    totals = []
    for rows in (home_rows, away_rows):
        for row in rows[: int(variant["lookback"])]:
            own = row["for"].get(metric)
            opp = row["against"].get(metric)
            if own is None or opp is None:
                continue
            age = max(0.0, (cutoff - row["date"]).total_seconds() / 86400.0)
            weight = math.exp(-math.log(2.0) * age / variant["half_life"])
            totals.append((float(own + opp), weight))
    observed_total_mean = weighted_mean(totals) or (2.0 * baseline)
    component_total = mu_home + mu_away
    target_total = 0.75 * component_total + 0.25 * observed_total_mean
    scale = target_total / max(component_total, 1e-6)
    mu_home *= scale
    mu_away *= scale

    total_values = [value for value, _ in totals]
    observed_var = float(np.var(total_values, ddof=1)) if len(total_values) >= 5 else target_total
    observed_mean = float(np.mean(total_values)) if total_values else target_total
    fano = min(3.0, max(1.0, observed_var / max(observed_mean, 1e-6)))
    total_var = target_total * fano

    team_values = []
    for rows in (home_rows, away_rows):
        for row in rows[: int(variant["lookback"])]:
            value = row["for"].get(metric)
            if value is not None:
                team_values.append(float(value))
    team_var = float(np.var(team_values, ddof=1)) if len(team_values) >= 5 else baseline
    team_mean = float(np.mean(team_values)) if team_values else baseline
    team_fano = min(2.5, max(1.0, team_var / max(team_mean, 1e-6)))
    return {
        "home_mean": mu_home,
        "away_mean": mu_away,
        "total_mean": target_total,
        "home_dist": count_distribution(mu_home, mu_home * team_fano),
        "away_dist": count_distribution(mu_away, mu_away * team_fano),
        "total_dist": count_distribution(target_total, total_var),
        "n_home": sum(row["for"].get(metric) is not None for row in home_rows[: int(variant["lookback"])]),
        "n_away": sum(row["for"].get(metric) is not None for row in away_rows[: int(variant["lookback"])]),
    }


def event_probabilities(
    target_fixtures: list[dict[str, Any]], histories: dict[int, list[dict[str, Any]]], cutoff: datetime,
) -> dict[int, dict[str, list[dict[str, Any]]]]:
    baselines = {metric: metric_baseline(histories, metric) for metric in METRICS}
    output: dict[int, dict[str, list[dict[str, Any]]]] = defaultdict(dict)
    for fixture in target_fixtures:
        fixture_id = int(fixture["fixture"]["id"])
        home_id = int(fixture["teams"]["home"]["id"])
        away_id = int(fixture["teams"]["away"]["id"])
        for metric in METRICS:
            output[fixture_id][metric] = [
                estimate_metric_variant(home_id, away_id, metric, histories, baselines[metric], cutoff, variant)
                for variant in VARIANTS
            ]
    return output


def goal_matrices(model: dict[str, Any]) -> dict[int, list[np.ndarray]]:
    rhos = model["method"]["rho_values"]
    result = {}
    for match in model["matches"]:
        result[match["fixture_id"]] = [
            build_score_matrix(row["home"], row["away"], rho=rho)[0]
            for row, rho in zip(match["variant_lambdas"], rhos)
        ]
    return result


def goal_probability(matrix: np.ndarray, bet_id: int, value: str) -> float | None:
    hg, ag = np.meshgrid(np.arange(matrix.shape[0]), np.arange(matrix.shape[1]), indexing="ij")
    total = hg + ag
    if bet_id == 1:
        masks = {"Home": hg > ag, "Draw": hg == ag, "Away": hg < ag}
        return float(matrix[masks[value]].sum()) if value in masks else None
    if bet_id == 12:
        masks = {"Home/Draw": hg >= ag, "Draw/Away": hg <= ag, "Home/Away": hg != ag}
        return float(matrix[masks[value]].sum()) if value in masks else None
    if bet_id == 8 and value in {"Yes", "No"}:
        yes = (hg >= 1) & (ag >= 1)
        return float(matrix[yes if value == "Yes" else ~yes].sum())
    if bet_id in {5, 16, 17}:
        parts = value.split()
        if len(parts) != 2:
            return None
        direction, raw_line = parts
        try:
            line = float(raw_line)
        except ValueError:
            return None
        if not math.isclose(line % 1, 0.5, abs_tol=1e-9):
            return None
        grid = total if bet_id == 5 else (hg if bet_id == 16 else ag)
        mask = grid > line if direction == "Over" else grid < line
        return float(matrix[mask].sum())
    if bet_id in {43, 44} and value in {"Yes", "No"}:
        score = hg >= 1 if bet_id == 43 else ag >= 1
        return float(matrix[score if value == "Yes" else ~score].sum())
    if bet_id in {27, 28} and value in {"Yes", "No"}:
        clean = ag == 0 if bet_id == 27 else hg == 0
        return float(matrix[clean if value == "Yes" else ~clean].sum())
    if bet_id in {29, 30} and value in {"Yes", "No"}:
        win_nil = ((hg > ag) & (ag == 0)) if bet_id == 29 else ((ag > hg) & (hg == 0))
        return float(matrix[win_nil if value == "Yes" else ~win_nil].sum())
    return None


EVENT_MARKETS = {
    45: ("corners", "total"),
    57: ("corners", "home"),
    58: ("corners", "away"),
    55: ("corners", "1x2"),
    87: ("shots_on_target", "total"),
    176: ("shots_on_target", "1x2"),
    211: ("shots", "total"),
    340: ("shots", "1x2"),
    153: ("yellow_cards", "total"),
    150: ("yellow_cards", "home"),
    151: ("yellow_cards", "away"),
    158: ("yellow_cards", "1x2"),
    173: ("fouls", "total"),
    170: ("fouls", "away"),
    171: ("fouls", "home"),
    175: ("fouls", "1x2"),
    164: ("offsides", "total"),
    167: ("offsides", "home"),
    168: ("offsides", "away"),
    165: ("offsides", "1x2"),
}


def event_probability(variant: dict[str, Any], scope: str, value: str) -> float | None:
    if scope == "1x2":
        return probability_1x2(variant["home_dist"], variant["away_dist"]).get(value)
    parts = value.split()
    if len(parts) != 2 or parts[0] not in {"Over", "Under"}:
        return None
    try:
        line = float(parts[1])
    except ValueError:
        return None
    if not math.isclose(line % 1, 0.5, abs_tol=1e-9):
        return None
    dist = variant[f"{scope}_dist"]
    return probability_over(dist, line) if parts[0] == "Over" else probability_under(dist, line)


def empirical_event_lower_bound(
    fixture: dict[str, Any], histories: dict[int, list[dict[str, Any]]],
    metric: str, scope: str, value: str,
) -> tuple[float | None, int]:
    """A 10% beta-posterior lower bound from directly observed comparable rows."""
    if scope == "1x2":
        return None, 0
    parts = value.split()
    if len(parts) != 2 or parts[0] not in {"Over", "Under"}:
        return None, 0
    try:
        line = float(parts[1])
    except ValueError:
        return None, 0
    home_id = int(fixture["teams"]["home"]["id"])
    away_id = int(fixture["teams"]["away"]["id"])
    samples: list[float] = []
    if scope == "total":
        seen = set()
        for rows in (histories[home_id], histories[away_id]):
            for row in rows[:20]:
                if row["fixture_id"] in seen:
                    continue
                own = row["for"].get(metric)
                opp = row["against"].get(metric)
                if own is None or opp is None:
                    continue
                seen.add(row["fixture_id"])
                samples.append(float(own + opp))
    elif scope == "home":
        samples.extend(
            float(row["for"][metric]) for row in histories[home_id][:20]
            if row["for"].get(metric) is not None
        )
        samples.extend(
            float(row["against"][metric]) for row in histories[away_id][:20]
            if row["against"].get(metric) is not None
        )
    elif scope == "away":
        samples.extend(
            float(row["for"][metric]) for row in histories[away_id][:20]
            if row["for"].get(metric) is not None
        )
        samples.extend(
            float(row["against"][metric]) for row in histories[home_id][:20]
            if row["against"].get(metric) is not None
        )
    if len(samples) < 12:
        return None, len(samples)
    if parts[0] == "Over":
        successes = sum(sample > line for sample in samples)
    else:
        successes = sum(sample < line for sample in samples)
    failures = len(samples) - successes
    return float(beta.ppf(0.10, successes + 1, failures + 1)), len(samples)


def collect_odds(client: ApiClient) -> tuple[dict[int, dict[str, Any]], str]:
    output = {}
    latest = ""
    for fixture_id in TARGET_IDS:
        body = client.get("/odds", {"fixture": fixture_id}, use_cache=False)
        rows = body.get("response", [])
        if not rows:
            continue
        output[fixture_id] = rows[0]
        latest = max(latest, rows[0].get("update", ""))
    return output, latest


def no_vig_probability(bet: dict[str, Any], value: str) -> float | None:
    target_parts = value.split()
    if len(target_parts) == 2 and target_parts[0] in {"Over", "Under"}:
        try:
            target_line = float(target_parts[1])
        except ValueError:
            return None

        def belongs(item_value: str) -> bool:
            parts = item_value.split()
            if len(parts) != 2 or parts[0] not in {"Over", "Under"}:
                return False
            try:
                return math.isclose(float(parts[1]), target_line, abs_tol=1e-9)
            except ValueError:
                return False
    elif value in {"Yes", "No"}:
        def belongs(item_value: str) -> bool:
            return item_value in {"Yes", "No"}
    elif value in {"Home", "Draw", "Away"}:
        def belongs(item_value: str) -> bool:
            return item_value in {"Home", "Draw", "Away"}
    else:
        return None

    values = []
    target = None
    for item in bet.get("values", []):
        item_value = str(item.get("value"))
        if not belongs(item_value):
            continue
        try:
            implied = 1.0 / float(item["odd"])
        except (TypeError, ValueError, ZeroDivisionError):
            continue
        values.append(implied)
        if item_value == value:
            target = implied
    if target is None or len(values) < 2:
        return None
    return target / sum(values)


def build_candidates(
    odds: dict[int, dict[str, Any]], goal_probs: dict[int, list[np.ndarray]],
    event_probs: dict[int, dict[str, list[dict[str, Any]]]], names: dict[int, str],
    histories: dict[int, list[dict[str, Any]]], fixtures_by_id: dict[int, dict[str, Any]],
) -> list[dict[str, Any]]:
    rows = []
    for fixture_id, raw in odds.items():
        for bookmaker in raw.get("bookmakers", []):
            for bet in bookmaker.get("bets", []):
                bet_id = int(bet["id"])
                for offer in bet.get("values", []):
                    value = str(offer.get("value"))
                    probabilities = []
                    family = "goals"
                    coverage = None
                    empirical_lower = None
                    empirical_n = None
                    if bet_id in {1, 5, 8, 12, 16, 17, 27, 28, 29, 30, 43, 44}:
                        probabilities = [goal_probability(matrix, bet_id, value) for matrix in goal_probs[fixture_id]]
                    elif bet_id in EVENT_MARKETS:
                        metric, scope = EVENT_MARKETS[bet_id]
                        family = metric
                        variants = event_probs[fixture_id][metric]
                        probabilities = [event_probability(variant, scope, value) for variant in variants]
                        coverage = min(min(v["n_home"], v["n_away"]) for v in variants)
                        empirical_lower, empirical_n = empirical_event_lower_bound(
                            fixtures_by_id[fixture_id], histories, metric, scope, value
                        )
                    probabilities = [p for p in probabilities if p is not None]
                    if len(probabilities) != 5:
                        continue
                    try:
                        price = float(offer["odd"])
                    except (TypeError, ValueError):
                        continue
                    market_probability = no_vig_probability(bet, value)
                    conservative_probability = float(min(probabilities))
                    if empirical_lower is not None:
                        conservative_probability = min(conservative_probability, empirical_lower)
                    rows.append({
                        "fixture_id": fixture_id,
                        "match": names[fixture_id],
                        "bookmaker": bookmaker["name"],
                        "bet_id": bet_id,
                        "market": bet["name"],
                        "selection": value,
                        "family": family,
                        "odds": price,
                        "probability": float(np.mean(probabilities)),
                        "conservative_probability": conservative_probability,
                        "sensitivity_high": float(max(probabilities)),
                        "market_no_vig_probability": market_probability,
                        "coverage_min": coverage,
                        "empirical_lower_bound": empirical_lower,
                        "empirical_sample": empirical_n,
                    })
    return rows


def accepted(candidate: dict[str, Any]) -> bool:
    p = candidate["conservative_probability"]
    price = candidate["odds"]
    market = candidate["market_no_vig_probability"]
    if not (0.60 <= p <= 0.985 and 1.02 <= price <= 2.20):
        return False
    if candidate["family"] != "goals" and (candidate["coverage_min"] or 0) < 8:
        return False
    if market is not None and abs(p - market) > 0.12:
        return False
    if p * price < 0.97:
        return False
    return True


def robust_probability(candidate: dict[str, Any]) -> float:
    model = candidate["conservative_probability"]
    market = candidate["market_no_vig_probability"]
    return min(model, market) if market is not None else model * 0.95


def optimise_tickets(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_book_fixture: dict[str, dict[int, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in candidates:
        if accepted(row):
            by_book_fixture[row["bookmaker"]][row["fixture_id"]].append(row)

    tickets = []
    for bookmaker, fixture_map in by_book_fixture.items():
        compact = {}
        for fixture_id, rows in fixture_map.items():
            # Keep the strongest distinct selections so enumeration stays bounded.
            rows.sort(key=lambda row: (robust_probability(row), row["conservative_probability"] * row["odds"]), reverse=True)
            distinct = []
            seen = set()
            for row in rows:
                key = (row["bet_id"], row["selection"])
                if key in seen:
                    continue
                seen.add(key)
                distinct.append(row)
            compact[fixture_id] = distinct[:18]

        fixture_ids = sorted(compact)
        for leg_count in range(2, min(5, len(fixture_ids)) + 1):
            for chosen_fixtures in itertools.combinations(fixture_ids, leg_count):
                for legs in itertools.product(*(compact[fixture_id] for fixture_id in chosen_fixtures)):
                    odds_product = math.prod(leg["odds"] for leg in legs)
                    if not 1.90 <= odds_product <= 2.10:
                        continue
                    model_joint = math.prod(leg["conservative_probability"] for leg in legs)
                    robust_joint = math.prod(robust_probability(leg) for leg in legs)
                    tickets.append({
                        "bookmaker": bookmaker,
                        "odds": odds_product,
                        "model_joint_probability": model_joint,
                        "robust_joint_probability": robust_joint,
                        "legs": list(legs),
                    })
    tickets.sort(
        key=lambda row: (row["robust_joint_probability"], row["model_joint_probability"], -len(row["legs"])),
        reverse=True,
    )
    return tickets[:30]


def optimise_high_confidence_tickets(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Find near-2.00 tickets made only of individually high-probability legs."""
    by_book_fixture: dict[str, dict[int, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in candidates:
        if not accepted(row) or row["conservative_probability"] < 0.78:
            continue
        by_book_fixture[row["bookmaker"]][row["fixture_id"]].append(row)

    tickets = []
    for bookmaker, fixture_map in by_book_fixture.items():
        compact = {}
        for fixture_id, rows in fixture_map.items():
            rows.sort(
                key=lambda row: (row["conservative_probability"], robust_probability(row), row["odds"]),
                reverse=True,
            )
            distinct = []
            seen = set()
            for row in rows:
                key = (row["bet_id"], row["selection"])
                if key in seen:
                    continue
                seen.add(key)
                distinct.append(row)
            compact[fixture_id] = distinct[:8]

        fixture_ids = sorted(compact)
        for leg_count in range(2, min(6, len(fixture_ids)) + 1):
            for chosen_fixtures in itertools.combinations(fixture_ids, leg_count):
                for legs in itertools.product(*(compact[fixture_id] for fixture_id in chosen_fixtures)):
                    odds_product = math.prod(leg["odds"] for leg in legs)
                    if not 1.90 <= odds_product <= 2.10:
                        continue
                    model_joint = math.prod(leg["conservative_probability"] for leg in legs)
                    robust_joint = math.prod(robust_probability(leg) for leg in legs)
                    tickets.append({
                        "bookmaker": bookmaker,
                        "odds": odds_product,
                        "model_joint_probability": model_joint,
                        "robust_joint_probability": robust_joint,
                        "legs": list(legs),
                    })
    tickets.sort(
        key=lambda row: (row["model_joint_probability"], row["robust_joint_probability"], -len(row["legs"])),
        reverse=True,
    )
    return tickets[:30]


def per_match_shortlist(candidates: list[dict[str, Any]]) -> dict[int, list[dict[str, Any]]]:
    grouped: dict[int, dict[tuple, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    for row in candidates:
        if not accepted(row):
            continue
        grouped[row["fixture_id"]][(row["bet_id"], row["selection"], row["family"])].append(row)
    result = {}
    for fixture_id, selections in grouped.items():
        compact = []
        for _, rows in selections.items():
            prices = [row["odds"] for row in rows]
            exemplar = max(rows, key=lambda row: row["odds"])
            compact.append({
                "market": exemplar["market"],
                "selection": exemplar["selection"],
                "family": exemplar["family"],
                "conservative_probability": exemplar["conservative_probability"],
                "median_odds": float(statistics.median(prices)),
                "best_odds": max(prices),
                "bookmaker_count": len(prices),
                "coverage_min": exemplar["coverage_min"],
            })
        compact.sort(key=lambda row: (row["conservative_probability"], row["median_odds"]), reverse=True)
        result[fixture_id] = compact[:15]
    return result


def serialise(value: Any):
    if isinstance(value, dict):
        return {key: serialise(item) for key, item in value.items()}
    if isinstance(value, list):
        return [serialise(item) for item in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    return value


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    model = json.loads(MODEL_PATH.read_text())
    client = ApiClient(cache_dir=CACHE_DIR)
    target_fixtures = []
    for fixture_id in TARGET_IDS:
        body = client.get("/fixtures", {"id": fixture_id}, use_cache=False)
        if not body.get("response"):
            raise RuntimeError(f"Fixture unavailable: {fixture_id}")
        target_fixtures.append(body["response"][0])
    cutoff = min(parse_date(row["fixture"]["date"]) for row in target_fixtures)
    names = {
        int(row["fixture"]["id"]): f'{row["teams"]["home"]["name"]} - {row["teams"]["away"]["name"]}'
        for row in target_fixtures
    }
    fixtures_by_id = {int(row["fixture"]["id"]): row for row in target_fixtures}

    histories, unique_fixtures = get_recent_data(client, target_fixtures, cutoff)
    events = event_probabilities(target_fixtures, histories, cutoff)
    goals = goal_matrices(model)
    odds, odds_updated = collect_odds(client)
    candidates = build_candidates(odds, goals, events, names, histories, fixtures_by_id)
    tickets = optimise_tickets(candidates)
    high_confidence_tickets = optimise_high_confidence_tickets(candidates)
    shortlist = per_match_shortlist(candidates)

    event_summary = {}
    for fixture_id, metrics in events.items():
        event_summary[fixture_id] = {}
        for metric, variants in metrics.items():
            event_summary[fixture_id][metric] = {
                "home_mean_range": [min(v["home_mean"] for v in variants), max(v["home_mean"] for v in variants)],
                "away_mean_range": [min(v["away_mean"] for v in variants), max(v["away_mean"] for v in variants)],
                "total_mean_range": [min(v["total_mean"] for v in variants), max(v["total_mean"] for v in variants)],
                "coverage_min": min(min(v["n_home"], v["n_away"]) for v in variants),
            }

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "odds_updated_at": odds_updated,
        "cutoff": cutoff.isoformat(),
        "recent_unique_fixtures": unique_fixtures,
        "method": {
            "goal_model": model["method"],
            "event_models": "recency-weighted negative-binomial count models with venue/opponent blending and shrinkage",
            "event_variants": VARIANTS,
            "ticket_filter": "one leg per match; same bookmaker; odds 1.90-2.10; model/market gap <=12pp; minimum eight observations",
            "important": "Event models are not historically calibrated and do not guarantee future returns.",
        },
        "event_summary": event_summary,
        "per_match_shortlist": shortlist,
        "top_tickets": tickets,
        "high_confidence_tickets": high_confidence_tickets,
        "api_call_summary": client.call_summary(),
    }
    OUT_PATH.write_text(json.dumps(serialise(output), indent=2, ensure_ascii=False))
    print(f"wrote {OUT_PATH}")
    print(json.dumps(serialise({
        "top_tickets": tickets[:5],
        "high_confidence_tickets": high_confidence_tickets[:10],
        "shortlist": shortlist,
    }), indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
