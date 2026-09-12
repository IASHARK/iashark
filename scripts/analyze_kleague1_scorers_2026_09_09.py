#!/usr/bin/env python3
"""Pre-lineup scorer probabilities for K League 1 fixtures on 2026-09-09.

This model is separate from the team score model.  It learns a regularised
shots-to-non-penalty-goals relationship from league player-seasons, estimates
start/bench/minute exposure from historical lineups, splits each team's goal
intensity coherently across active players, handles penalties separately, and
propagates lineup/team-rate uncertainty by Monte Carlo.
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import sys
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
from scipy.optimize import minimize
from scipy.special import expit, gammaln

import analyze_kleague1_2026_09_09_pro as base


REPO = Path(__file__).resolve().parents[1]
TEAM_REPORT_PATH = REPO / "data" / "analysis" / "2026-09-09-kleague1-pro" / "analysis.json"
OUT_DIR = REPO / "data" / "analysis" / "2026-09-09-kleague1-scorers-pro"
TRAIN_SEASONS = (2024, 2025)
CURRENT_SEASON = 2026
POSITION_ORDER = ("Goalkeeper", "Defender", "Midfielder", "Attacker")
POSITION_DEFAULT_START_MINUTES = {
    "Goalkeeper": 90.0,
    "Defender": 82.0,
    "Midfielder": 75.0,
    "Attacker": 72.0,
}
POSITION_DEFAULT_SUB_MINUTES = {
    "Goalkeeper": 5.0,
    "Defender": 21.0,
    "Midfielder": 25.0,
    "Attacker": 27.0,
}


def value_or_zero(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


@dataclass
class PlayerSeason:
    player_id: int
    name: str
    team_id: int
    team_name: str
    season: int
    position: str
    appearances: float
    starts: float
    minutes: float
    shots: float
    shots_on: float
    goals: float
    assists: float
    penalties_scored: float
    penalties_missed: float
    bench: float

    @property
    def nonpen_goals(self) -> float:
        return max(0.0, self.goals - self.penalties_scored)

    @property
    def nineties(self) -> float:
        return self.minutes / 90.0

    @property
    def shots90(self) -> float:
        return self.shots / max(self.nineties, 0.5)

    @property
    def sot90(self) -> float:
        return self.shots_on / max(self.nineties, 0.5)


def player_rows_from_payload(payload: dict[str, Any], season: int) -> list[PlayerSeason]:
    rows: list[PlayerSeason] = []
    for entry in payload.get("response") or []:
        player = entry.get("player") or {}
        if player.get("id") is None:
            continue
        for stats in entry.get("statistics") or []:
            league = stats.get("league") or {}
            if int(league.get("id") or -1) != base.LEAGUE_ID:
                continue
            team = stats.get("team") or {}
            games = stats.get("games") or {}
            shots = stats.get("shots") or {}
            goals = stats.get("goals") or {}
            penalties = stats.get("penalty") or {}
            subs = stats.get("substitutes") or {}
            if team.get("id") is None:
                continue
            rows.append(
                PlayerSeason(
                    player_id=int(player["id"]),
                    name=str(player.get("name") or f"Player {player['id']}"),
                    team_id=int(team["id"]),
                    team_name=str(team.get("name") or ""),
                    season=season,
                    position=str(games.get("position") or "Unknown"),
                    appearances=value_or_zero(games.get("appearences")),
                    starts=value_or_zero(games.get("lineups")),
                    minutes=value_or_zero(games.get("minutes")),
                    shots=value_or_zero(shots.get("total")),
                    shots_on=value_or_zero(shots.get("on")),
                    goals=value_or_zero(goals.get("total")),
                    assists=value_or_zero(goals.get("assists")),
                    penalties_scored=value_or_zero(penalties.get("scored")),
                    penalties_missed=value_or_zero(penalties.get("missed")),
                    bench=value_or_zero(subs.get("bench")),
                )
            )
    return rows


def fetch_league_players(client: base.ApiClient, season: int) -> list[PlayerSeason]:
    first = client.get("players", {"league": base.LEAGUE_ID, "season": season, "page": 1})
    rows = player_rows_from_payload(first, season)
    total_pages = int((first.get("paging") or {}).get("total") or 1)
    for page in range(2, total_pages + 1):
        payload = client.get("players", {"league": base.LEAGUE_ID, "season": season, "page": page})
        rows.extend(player_rows_from_payload(payload, season))
    return rows


def richest_cached_fixtures() -> dict[int, dict[str, Any]]:
    best: dict[int, dict[str, Any]] = {}
    pattern = str(base.CACHE_DIR / "fixtures-*.json")
    for path in glob.glob(pattern):
        try:
            payload = json.loads(Path(path).read_text())
        except Exception:
            continue
        for item in payload.get("response") or []:
            if int((item.get("league") or {}).get("id") or -1) != base.LEAGUE_ID:
                continue
            fixture_id = int(item["fixture"]["id"])
            richness = (
                len(item.get("players") or []) * 1000
                + len(item.get("lineups") or []) * 100
                + len(item.get("statistics") or [])
            )
            existing = best.get(fixture_id)
            if existing is None:
                best[fixture_id] = item
            else:
                old_richness = (
                    len(existing.get("players") or []) * 1000
                    + len(existing.get("lineups") or []) * 100
                    + len(existing.get("statistics") or [])
                )
                if richness > old_richness:
                    best[fixture_id] = item
    return best


def position_key(position: str) -> str:
    lower = position.lower()
    if "goal" in lower:
        return "Goalkeeper"
    if "def" in lower:
        return "Defender"
    if "mid" in lower:
        return "Midfielder"
    if "att" in lower or "forward" in lower:
        return "Attacker"
    return "Midfielder"


@dataclass
class GoalRateModel:
    params: np.ndarray
    covariance: np.ndarray
    ridge: float
    train_rows: int
    train_log_loss: float


def design_row(row: PlayerSeason) -> np.ndarray:
    pos = position_key(row.position)
    return np.array(
        [
            1.0,
            math.log1p(max(row.shots90, 0.0)),
            math.log1p(max(row.sot90, 0.0)),
            1.0 if pos == "Defender" else 0.0,
            1.0 if pos == "Midfielder" else 0.0,
            1.0 if pos == "Attacker" else 0.0,
        ],
        dtype=float,
    )


def fit_goal_rate(
    rows: list[PlayerSeason],
    ridge: float = 0.35,
    train_seasons: tuple[int, ...] = TRAIN_SEASONS,
) -> GoalRateModel:
    training = [
        row
        for row in rows
        if row.season in train_seasons
        and row.minutes >= 180
        and position_key(row.position) != "Goalkeeper"
        and row.shots >= 0
        and row.shots_on >= 0
    ]
    X = np.vstack([design_row(row) for row in training])
    exposure = np.array([row.nineties for row in training], dtype=float)
    goals = np.array([row.nonpen_goals for row in training], dtype=float)

    def objective(beta: np.ndarray) -> float:
        eta = np.clip(X @ beta + np.log(exposure), -12, 7)
        mu = np.exp(eta)
        ll = goals * eta - mu - gammaln(goals + 1)
        penalty = ridge * np.sum(beta[1:] ** 2)
        return float(-ll.sum() + penalty)

    result = minimize(objective, np.array([-2.4, 0.25, 0.65, -0.5, -0.15, 0.25]), method="BFGS")
    try:
        covariance = np.asarray(result.hess_inv, dtype=float)
        if covariance.shape != (X.shape[1], X.shape[1]) or not np.all(np.isfinite(covariance)):
            raise ValueError
        covariance = (covariance + covariance.T) / 2
        eigvals, eigvecs = np.linalg.eigh(covariance)
        covariance = eigvecs @ np.diag(np.clip(eigvals, 1e-6, 0.5)) @ eigvecs.T
    except Exception:
        covariance = np.eye(X.shape[1]) * 0.02
    return GoalRateModel(
        params=result.x,
        covariance=covariance,
        ridge=ridge,
        train_rows=len(training),
        train_log_loss=float(result.fun / len(training)),
    )


def temporal_goal_rate_validation(rows: list[PlayerSeason]) -> dict[str, float]:
    """Fit on 2024 only and score player goal counts on the unseen 2025 season."""
    trained = fit_goal_rate(rows, train_seasons=(2024,))
    test = [
        row
        for row in rows
        if row.season == 2025 and row.minutes >= 180 and position_key(row.position) != "Goalkeeper"
    ]
    training = [
        row
        for row in rows
        if row.season == 2024 and row.minutes >= 180 and position_key(row.position) != "Goalkeeper"
    ]
    overall_rate = sum(row.nonpen_goals for row in training) / max(sum(row.nineties for row in training), 1.0)
    position_rates: dict[str, float] = {}
    for pos in ("Defender", "Midfielder", "Attacker"):
        subset = [row for row in training if position_key(row.position) == pos]
        position_rates[pos] = (
            sum(row.nonpen_goals for row in subset) + 10.0 * overall_rate
        ) / max(sum(row.nineties for row in subset) + 10.0, 1.0)

    weight_results = []
    for weight in np.linspace(0.0, 1.0, 11):
        loss = 0.0
        for row in test:
            actual = row.nonpen_goals
            rate = (
                weight * predicted_rate90(trained, row)
                + (1.0 - weight) * position_rates[position_key(row.position)]
            )
            mu = max(rate * row.nineties, 1e-8)
            loss += mu - actual * math.log(mu) + gammaln(actual + 1)
        weight_results.append({"shot_weight": float(weight), "poisson_nll": float(loss / max(len(test), 1))})
    best = min(weight_results, key=lambda item: item["poisson_nll"])
    return {
        "train_season": 2024,
        "test_season": 2025,
        "test_players": float(len(test)),
        "selected_shot_weight": best["shot_weight"],
        "selected_poisson_nll": best["poisson_nll"],
        "shot_model_poisson_nll": weight_results[-1]["poisson_nll"],
        "position_baseline_poisson_nll": weight_results[0]["poisson_nll"],
        "weight_grid": weight_results,
    }


def position_goal_rates(rows: list[PlayerSeason]) -> dict[str, float]:
    training = [
        row
        for row in rows
        if row.season in TRAIN_SEASONS and row.minutes >= 180 and position_key(row.position) != "Goalkeeper"
    ]
    overall_rate = sum(row.nonpen_goals for row in training) / max(sum(row.nineties for row in training), 1.0)
    rates = {"Goalkeeper": 0.003}
    for pos in ("Defender", "Midfielder", "Attacker"):
        subset = [row for row in training if position_key(row.position) == pos]
        rates[pos] = (
            sum(row.nonpen_goals for row in subset) + 20.0 * overall_rate
        ) / max(sum(row.nineties for row in subset) + 20.0, 1.0)
    return rates


def predicted_rate90(model: GoalRateModel, row: PlayerSeason, beta: np.ndarray | None = None) -> float:
    coefficients = model.params if beta is None else beta
    return float(math.exp(np.clip(design_row(row) @ coefficients, -5.0, 2.0)))


def choose_finishing_shrinkage(
    model: GoalRateModel, rows: list[PlayerSeason]
) -> tuple[float, list[dict[str, float]]]:
    by_key = {(row.player_id, row.season): row for row in rows}
    pairs = []
    for (player_id, season), previous in by_key.items():
        if season != 2024 or previous.minutes < 270:
            continue
        future = by_key.get((player_id, 2025))
        if future is None or future.minutes < 180 or position_key(future.position) == "Goalkeeper":
            continue
        pairs.append((previous, future))
    results = []
    for alpha in (1.0, 2.0, 4.0, 8.0, 16.0):
        loss = 0.0
        for previous, future in pairs:
            prev_base = predicted_rate90(model, previous) * previous.nineties
            multiplier = (previous.nonpen_goals + alpha) / (prev_base + alpha)
            future_rate = predicted_rate90(model, future) * math.sqrt(multiplier)
            mu = max(1e-6, future_rate * future.nineties)
            loss += mu - future.nonpen_goals * math.log(mu) + gammaln(future.nonpen_goals + 1)
        results.append(
            {"alpha": alpha, "log_loss": float(loss / max(len(pairs), 1)), "players": float(len(pairs))}
        )
    results.sort(key=lambda row: row["log_loss"])
    return results[0]["alpha"], results


def lineup_history(
    rich: dict[int, dict[str, Any]], team_id: int, cutoff: datetime, limit: int = 12
) -> dict[int, dict[str, Any]]:
    fixtures = []
    for item in rich.values():
        if int((item.get("league") or {}).get("season") or -1) != CURRENT_SEASON:
            continue
        dt = base.parse_dt(item["fixture"]["date"])
        if dt >= cutoff or item["fixture"]["status"]["short"] != "FT":
            continue
        if team_id not in {
            int(item["teams"]["home"]["id"]),
            int(item["teams"]["away"]["id"]),
        }:
            continue
        fixtures.append((dt, item))
    fixtures.sort(key=lambda pair: pair[0], reverse=True)
    fixtures = fixtures[:limit]

    history: dict[int, dict[str, Any]] = defaultdict(
        lambda: {
            "name": None,
            "start_weight": 0.0,
            "bench_weight": 0.0,
            "total_weight": 0.0,
            "recent_starts": 0,
            "recent_benches": 0,
            "start_minutes": [],
            "sub_minutes": [],
        }
    )
    player_minutes: dict[tuple[int, int], tuple[float, bool]] = {}
    for _, item in fixtures:
        for team_players in item.get("players") or []:
            if int((team_players.get("team") or {}).get("id") or -1) != team_id:
                continue
            for player_row in team_players.get("players") or []:
                player = player_row.get("player") or {}
                if player.get("id") is None or not player_row.get("statistics"):
                    continue
                stats = player_row["statistics"][0]
                games = stats.get("games") or {}
                minutes = value_or_zero(games.get("minutes"))
                substitute = bool(games.get("substitute"))
                player_minutes[(int(item["fixture"]["id"]), int(player["id"]))] = (minutes, substitute)

    for order, (_, item) in enumerate(fixtures):
        weight = math.exp(-math.log(2) * order / 4.0)
        lineup = next(
            (
                block
                for block in item.get("lineups") or []
                if int((block.get("team") or {}).get("id") or -1) == team_id
            ),
            None,
        )
        if not lineup:
            continue
        starters = {
            int(row["player"]["id"]): row["player"]
            for row in lineup.get("startXI") or []
            if (row.get("player") or {}).get("id") is not None
        }
        bench = {
            int(row["player"]["id"]): row["player"]
            for row in lineup.get("substitutes") or []
            if (row.get("player") or {}).get("id") is not None
        }
        for player_id, player in {**starters, **bench}.items():
            row = history[player_id]
            row["name"] = player.get("name") or row["name"]
            row["total_weight"] += weight
            if player_id in starters:
                row["start_weight"] += weight
                row["recent_starts"] += 1
            else:
                row["bench_weight"] += weight
                row["recent_benches"] += 1
            minute_info = player_minutes.get((int(item["fixture"]["id"]), player_id))
            if minute_info and minute_info[0] > 0:
                if player_id in starters:
                    row["start_minutes"].append(minute_info[0])
                else:
                    row["sub_minutes"].append(minute_info[0])
    return dict(history)


def season_player_evidence(
    rich: dict[int, dict[str, Any]], team_id: int, cutoff: datetime
) -> tuple[dict[int, dict[str, Any]], dict[str, int]]:
    """Rebuild appearances, minutes and goals from full fixture lineups/events.

    API-Football player aggregates are not populated for every K League match.
    Lineups and events have materially better coverage, so they are the source
    of truth for exposure and goals. Shot rates still come from the player
    endpoint and are shrunk separately.
    """
    fixtures = []
    for item in rich.values():
        if int((item.get("league") or {}).get("season") or -1) != CURRENT_SEASON:
            continue
        dt = base.parse_dt(item["fixture"]["date"])
        if dt >= cutoff or item["fixture"]["status"]["short"] != "FT":
            continue
        if team_id not in {
            int(item["teams"]["home"]["id"]),
            int(item["teams"]["away"]["id"]),
        }:
            continue
        fixtures.append((dt, item))
    fixtures.sort(key=lambda pair: pair[0])

    evidence: dict[int, dict[str, Any]] = defaultdict(
        lambda: {
            "name": None,
            "position": "Unknown",
            "starts": 0.0,
            "bench": 0.0,
            "appearances": 0.0,
            "minutes": 0.0,
            "goals": 0.0,
            "nonpen_goals": 0.0,
            "penalty_goals": 0.0,
            "penalty_misses": 0.0,
        }
    )
    lineup_matches = 0
    event_matches = 0
    for _, item in fixtures:
        lineup = next(
            (
                block
                for block in item.get("lineups") or []
                if int((block.get("team") or {}).get("id") or -1) == team_id
            ),
            None,
        )
        if not lineup:
            continue
        lineup_matches += 1
        starters: dict[int, dict[str, Any]] = {}
        bench: dict[int, dict[str, Any]] = {}
        for source, destination in (
            (lineup.get("startXI") or [], starters),
            (lineup.get("substitutes") or [], bench),
        ):
            for entry in source:
                player = entry.get("player") or {}
                if player.get("id") is not None:
                    destination[int(player["id"])] = player

        minutes = {player_id: 90.0 for player_id in starters}
        minutes.update({player_id: 0.0 for player_id in bench})
        for player_id, player in {**starters, **bench}.items():
            row = evidence[player_id]
            row["name"] = player.get("name") or row["name"]
            row["position"] = player.get("pos") or row["position"]
            if player_id in starters:
                row["starts"] += 1.0
            else:
                row["bench"] += 1.0

        team_events = [
            event
            for event in item.get("events") or []
            if int((event.get("team") or {}).get("id") or -1) == team_id
        ]
        if item.get("events") is not None:
            event_matches += 1
        for event in team_events:
            if event.get("type") != "subst":
                continue
            elapsed = float(np.clip(value_or_zero((event.get("time") or {}).get("elapsed")), 0, 90))
            outgoing = (event.get("player") or {}).get("id")
            incoming = (event.get("assist") or {}).get("id")
            if outgoing is not None and int(outgoing) in minutes:
                minutes[int(outgoing)] = min(minutes[int(outgoing)], elapsed)
            if incoming is not None:
                incoming_id = int(incoming)
                if incoming_id in bench:
                    minutes[incoming_id] = max(minutes.get(incoming_id, 0.0), 90.0 - elapsed)

        for player_id, player_minutes in minutes.items():
            if player_minutes > 0:
                evidence[player_id]["appearances"] += 1.0
                evidence[player_id]["minutes"] += player_minutes

        for event in team_events:
            if event.get("type") != "Goal":
                continue
            player_id = (event.get("player") or {}).get("id")
            if player_id is None:
                continue
            detail = str(event.get("detail") or "")
            if detail == "Own Goal":
                continue
            row = evidence[int(player_id)]
            row["name"] = (event.get("player") or {}).get("name") or row["name"]
            if detail == "Missed Penalty":
                row["penalty_misses"] += 1.0
                continue
            row["goals"] += 1.0
            if detail == "Penalty":
                row["penalty_goals"] += 1.0
            else:
                row["nonpen_goals"] += 1.0
    return dict(evidence), {
        "completed_matches": len(fixtures),
        "lineup_matches": lineup_matches,
        "event_matches": event_matches,
    }


def lineup_projection(
    row: PlayerSeason,
    history: dict[int, dict[str, Any]],
    team_matches: int,
    evidence: dict[str, Any] | None = None,
) -> dict[str, float]:
    hist = history.get(row.player_id) or {}
    total_weight = value_or_zero(hist.get("total_weight"))
    recent_start = (
        (value_or_zero(hist.get("start_weight")) + 0.35) / (total_weight + 1.0)
        if total_weight > 0
        else 0.0
    )
    recent_bench = (
        (value_or_zero(hist.get("bench_weight")) + 0.35) / (total_weight + 1.0)
        if total_weight > 0
        else 0.0
    )
    season_start = min(
        1.0,
        value_or_zero((evidence or {}).get("starts", row.starts)) / max(team_matches, 1),
    )
    season_bench = min(
        1.0,
        value_or_zero((evidence or {}).get("bench", row.bench)) / max(team_matches, 1),
    )
    if total_weight > 0:
        p_start = 0.67 * recent_start + 0.33 * season_start
        p_bench = 0.67 * recent_bench + 0.33 * season_bench
    else:
        p_start = season_start
        p_bench = season_bench
    p_start = float(np.clip(p_start, 0.005, 0.985))
    p_bench = float(np.clip(p_bench, 0.0, 1.0 - p_start))
    pos = position_key(row.position)
    start_minutes_values = hist.get("start_minutes") or []
    sub_minutes_values = hist.get("sub_minutes") or []
    evidence_minutes = value_or_zero((evidence or {}).get("minutes", row.minutes))
    evidence_appearances = value_or_zero((evidence or {}).get("appearances", row.appearances))
    average_minutes_per_appearance = evidence_minutes / max(evidence_appearances, 1)
    start_minutes = (
        float(np.median(start_minutes_values))
        if len(start_minutes_values) >= 2
        else max(average_minutes_per_appearance, POSITION_DEFAULT_START_MINUTES[pos])
    )
    sub_minutes = (
        float(np.median(sub_minutes_values))
        if len(sub_minutes_values) >= 2
        else POSITION_DEFAULT_SUB_MINUTES[pos]
    )
    start_minutes = float(np.clip(start_minutes, 45, 90))
    sub_minutes = float(np.clip(sub_minutes, 5, 45))
    expected_minutes = p_start * start_minutes + p_bench * 0.65 * sub_minutes
    return {
        "p_start": p_start,
        "p_bench": p_bench,
        "start_minutes": start_minutes,
        "sub_minutes": sub_minutes,
        "expected_minutes": expected_minutes,
        "recent_starts": float(hist.get("recent_starts") or 0),
        "recent_benches": float(hist.get("recent_benches") or 0),
    }


def previous_player_rows(rows: list[PlayerSeason]) -> dict[int, list[PlayerSeason]]:
    result: dict[int, list[PlayerSeason]] = defaultdict(list)
    for row in rows:
        result[row.player_id].append(row)
    return result


def finishing_multiplier(
    model: GoalRateModel,
    current: PlayerSeason,
    history_rows: list[PlayerSeason],
    alpha: float,
    evidence: dict[str, Any] | None = None,
    stable_design: np.ndarray | None = None,
    base_rate90: float | None = None,
) -> float:
    current_evidence = evidence or {}
    observed = value_or_zero(current_evidence.get("nonpen_goals"))
    current_minutes = value_or_zero(current_evidence.get("minutes"))
    current_rate = (
        base_rate90
        if base_rate90 is not None
        else math.exp(
            np.clip((stable_design if stable_design is not None else design_row(current)) @ model.params, -5.0, 2.0)
        )
    )
    expected = current_rate * current_minutes / 90.0
    for row in history_rows:
        if row.season != 2025 or row.minutes < 90:
            continue
        recency = 0.45
        observed += recency * row.nonpen_goals
        expected += recency * predicted_rate90(model, row) * row.nineties
    multiplier = (observed + alpha) / (expected + alpha)
    return float(np.clip(math.sqrt(multiplier), 0.72, 1.35))


def stable_design_row(
    current: PlayerSeason,
    history_rows: list[PlayerSeason],
    positional_priors: dict[str, tuple[float, float]],
    prior_nineties: float = 6.0,
) -> np.ndarray:
    """Shrink noisy current shot rates toward last season/position priors."""
    pos = position_key(current.position)
    prior_shots90, prior_sot90 = positional_priors[pos]
    previous = next(
        (row for row in sorted(history_rows, key=lambda item: item.season, reverse=True) if row.season == 2025 and row.minutes >= 180),
        None,
    )
    if previous is not None:
        previous_weight = min(previous.nineties, 10.0) / (min(previous.nineties, 10.0) + 5.0)
        prior_shots90 = previous_weight * previous.shots90 + (1.0 - previous_weight) * prior_shots90
        prior_sot90 = previous_weight * previous.sot90 + (1.0 - previous_weight) * prior_sot90
    weight = current.nineties / (current.nineties + prior_nineties)
    shots90 = weight * current.shots90 + (1.0 - weight) * prior_shots90
    sot90 = weight * current.sot90 + (1.0 - weight) * prior_sot90
    return np.array(
        [
            1.0,
            math.log1p(max(shots90, 0.0)),
            math.log1p(max(sot90, 0.0)),
            1.0 if pos == "Defender" else 0.0,
            1.0 if pos == "Midfielder" else 0.0,
            1.0 if pos == "Attacker" else 0.0,
        ],
        dtype=float,
    )


def positional_shot_priors(rows: list[PlayerSeason]) -> dict[str, tuple[float, float]]:
    priors: dict[str, tuple[float, float]] = {}
    for pos in POSITION_ORDER:
        candidates = [
            row
            for row in rows
            if row.season in TRAIN_SEASONS and position_key(row.position) == pos and row.minutes >= 360
        ]
        if candidates:
            priors[pos] = (
                float(np.median([row.shots90 for row in candidates])),
                float(np.median([row.sot90 for row in candidates])),
            )
        else:
            priors[pos] = (0.25, 0.08)
    return priors


def draw_team_lambda(rng: np.random.Generator, summary: dict[str, float], size: int) -> np.ndarray:
    mean = max(summary["mean"], 0.05)
    q10 = max(summary["p10"], 0.03)
    q90 = max(summary["p90"], q10 + 1e-3)
    sigma = max(0.03, (math.log(q90) - math.log(q10)) / (2 * 1.2815515655))
    mu = math.log(mean) - 0.5 * sigma**2
    return rng.lognormal(mu, sigma, size)


def scorer_simulation(
    rng: np.random.Generator,
    team_lambda_summary: dict[str, float],
    players: list[dict[str, Any]],
    model: GoalRateModel,
    team_matches: int,
    n_sim: int,
    shot_weight: float,
) -> list[dict[str, Any]]:
    if not players:
        return []
    beta_draws = rng.multivariate_normal(model.params, model.covariance, size=n_sim)
    lambdas = draw_team_lambda(rng, team_lambda_summary, n_sim)
    player_lambda_samples = {player["row"].player_id: np.zeros(n_sim) for player in players}

    penalty_attempts = np.array(
        [
            value_or_zero(player["evidence"].get("penalty_goals"))
            + value_or_zero(player["evidence"].get("penalty_misses"))
            + 0.35 * player["previous_penalty_attempts"]
            for player in players
        ],
        dtype=float,
    )
    total_team_attempts = float(sum(
        value_or_zero(player["evidence"].get("penalty_goals"))
        + value_or_zero(player["evidence"].get("penalty_misses"))
        for player in players
    ))
    penalty_goal_rate = min(0.22, (total_team_attempts + 0.75) / (team_matches + 6.0) * 0.78)

    outfield_indices = [i for i, player in enumerate(players) if position_key(player["row"].position) != "Goalkeeper"]
    keeper_indices = [i for i, player in enumerate(players) if position_key(player["row"].position) == "Goalkeeper"]

    for sim in range(n_sim):
        active_minutes = np.zeros(len(players), dtype=float)
        # Exactly one goalkeeper and ten outfield starters are sampled.
        if keeper_indices:
            probs = np.array([players[i]["lineup"]["p_start"] for i in keeper_indices], dtype=float)
            probs /= probs.sum()
            selected_keeper = int(rng.choice(keeper_indices, p=probs))
            active_minutes[selected_keeper] = 90.0
        if outfield_indices:
            odds = np.array(
                [
                    players[i]["lineup"]["p_start"]
                    / max(1.0 - players[i]["lineup"]["p_start"], 0.02)
                    for i in outfield_indices
                ],
                dtype=float,
            )
            odds = np.clip(odds, 1e-4, 100)
            keys = np.log(odds) + rng.gumbel(size=len(odds))
            starters_local = np.argsort(keys)[-min(10, len(keys)) :]
            starters = {outfield_indices[int(i)] for i in starters_local}
            for i in outfield_indices:
                projection = players[i]["lineup"]
                if i in starters:
                    active_minutes[i] = float(
                        np.clip(rng.normal(projection["start_minutes"], 8.0), 35, 90)
                    )
            # Modern K League matches normally use no more than five entering
            # substitutes. Sampling a capped count avoids impossible 6–9 sub
            # lineups produced by independent Bernoulli trials.
            nonstarters = [i for i in outfield_indices if i not in starters]
            if nonstarters:
                n_subs = int(rng.choice([3, 4, 5], p=[0.08, 0.28, 0.64]))
                n_subs = min(n_subs, len(nonstarters))
                sub_weights = np.array(
                    [
                        players[i]["lineup"]["p_bench"]
                        / max(1.0 - players[i]["lineup"]["p_start"], 0.02)
                        for i in nonstarters
                    ],
                    dtype=float,
                )
                sub_weights = np.clip(sub_weights, 1e-5, 1.0)
                sub_keys = np.log(sub_weights) + rng.gumbel(size=len(nonstarters))
                selected_subs = [nonstarters[int(i)] for i in np.argsort(sub_keys)[-n_subs:]]
                for i in selected_subs:
                    projection = players[i]["lineup"]
                    active_minutes[i] = float(
                        np.clip(rng.normal(projection["sub_minutes"], 7.0), 5, 45)
                    )

        raw = np.zeros(len(players), dtype=float)
        for i, player in enumerate(players):
            if active_minutes[i] <= 0 or position_key(player["row"].position) == "Goalkeeper":
                continue
            shot_rate = math.exp(np.clip(player["design"] @ beta_draws[sim], -5.0, 2.0))
            rate = shot_weight * shot_rate + (1.0 - shot_weight) * player["position_rate90"]
            minutes_uncertainty = 0.18 / math.sqrt(max(player["row"].nineties, 1.0)) + 0.05
            rate *= math.exp(rng.normal(-0.5 * minutes_uncertainty**2, minutes_uncertainty))
            rate *= player["finishing_multiplier"]
            raw[i] = active_minutes[i] / 90.0 * max(rate, 0.008)
        if raw.sum() <= 0:
            continue
        open_lambda = max(0.02, lambdas[sim] - penalty_goal_rate)
        allocations = open_lambda * raw / raw.sum()
        taker_weights = penalty_attempts * (active_minutes > 0)
        if taker_weights.sum() <= 0:
            taker_weights = raw.copy()
        if taker_weights.sum() > 0:
            allocations += penalty_goal_rate * taker_weights / taker_weights.sum()
        for i, player in enumerate(players):
            player_lambda_samples[player["row"].player_id][sim] = allocations[i]

    output = []
    for player in players:
        row = player["row"]
        evidence = player["evidence"]
        lambda_samples = player_lambda_samples[row.player_id]
        score_samples = 1.0 - np.exp(-lambda_samples)
        output.append(
            {
                "player_id": row.player_id,
                "name": row.name,
                "position": position_key(row.position),
                "p_start": player["lineup"]["p_start"],
                "p_bench": player["lineup"]["p_bench"],
                "expected_minutes": player["lineup"]["expected_minutes"],
                "season_minutes": value_or_zero(evidence.get("minutes")),
                "season_goals": value_or_zero(evidence.get("goals")),
                "season_nonpen_goals": value_or_zero(evidence.get("nonpen_goals")),
                "season_shots": row.shots,
                "season_sot": row.shots_on,
                "shot_sample_minutes": row.minutes,
                "penalty_attempts_current": value_or_zero(evidence.get("penalty_goals"))
                + value_or_zero(evidence.get("penalty_misses")),
                "finishing_multiplier": player["finishing_multiplier"],
                "goal_lambda": float(lambda_samples.mean()),
                "score_probability": float(score_samples.mean()),
                "p10": float(np.quantile(score_samples, 0.10)),
                "p90": float(np.quantile(score_samples, 0.90)),
                "fair_odds": float(1.0 / max(score_samples.mean(), 1e-9)),
            }
        )
    output.sort(key=lambda player: player["score_probability"], reverse=True)
    return output


def current_team_matches(team_report: dict[str, Any], fixture_index: int, side: str) -> int:
    return int(team_report["fixtures"][fixture_index]["profiles"][side]["season"]["matches"])


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Probabilités buteurs — K League 1 — 9 septembre 2026",
        "",
        f"Calcul pré-compositions généré à `{report['generated_at']}`. Les cotes bookmaker et `/predictions` sont exclues.",
        "",
        "## Contrôles",
        "",
        f"- Joueurs-saisons utilisés pour apprendre la relation tirs→buts : **{report['model']['train_rows']}**",
        f"- Saisons d'apprentissage : **{', '.join(map(str, report['model']['train_seasons']))}**",
        f"- Validation temporelle 2024→2025 sur **{report['model']['temporal_validation']['test_players']:.0f}** joueurs : ensemble retenu **{report['model']['temporal_validation']['selected_poisson_nll']:.3f}** (poids tirs **{report['model']['temporal_validation']['selected_shot_weight']:.0%}**), contre tirs seuls **{report['model']['temporal_validation']['shot_model_poisson_nll']:.3f}** et baseline poste **{report['model']['temporal_validation']['position_baseline_poisson_nll']:.3f}**",
        f"- Paramètre de shrinkage finition retenu : **{report['model']['finishing_alpha']:.1f}**",
        f"- Simulations de compositions/minutes par équipe : **{report['model']['simulations']:,}**",
        "- Minutes, titularisations et buts 2026 sont reconstruits depuis les feuilles de match et événements complets ; les tirs partiels sont régularisés vers 2025 et la moyenne du poste.",
        "- Les intensités des joueurs sont contraintes à sommer vers les buts attendus de leur équipe.",
        "",
    ]
    for index, fixture in enumerate(report["fixtures"], start=1):
        lines.extend([f"## {index}. {fixture['match']}", ""])
        if not fixture["official_lineups_available"]:
            lines.append("**Préliminaire : compositions officielles non disponibles.**")
            lines.append("")
        for side_label, side in ((fixture["home_team"], "home"), (fixture["away_team"], "away")):
            coverage = fixture[side]["evidence_coverage"]
            lines.extend(
                [
                    f"### {side_label} — λ équipe {fixture[side + '_lambda']:.2f}",
                    "",
                    f"Couverture feuilles de match/événements : **{coverage['lineup_matches']}/{coverage['completed_matches']}** et **{coverage['event_matches']}/{coverage['completed_matches']}**. Couverture brute des minutes avec tirs : **{fixture[side]['aggregate_shot_minute_coverage']:.0%}**.",
                    "",
                    "| Joueur | Poste | Titulaire estimé | Minutes attendues | Buts/tirs cadrés saison | Probabilité | Intervalle 10–90 % | Cote juste |",
                    "|---|---|---:|---:|---:|---:|---:|---:|",
                ]
            )
            for player in fixture[side]["players"][:6]:
                lines.append(
                    f"| {player['name']} | {player['position']} | {player['p_start']:.0%} | {player['expected_minutes']:.0f} | "
                    f"{player['season_goals']:.0f}/{player['season_sot']:.0f} | {player['score_probability']:.1%} | "
                    f"{player['p10']:.1%}–{player['p90']:.1%} | {player['fair_odds']:.2f} |"
                )
            lines.append("")
    lines.extend(
        [
            "## Limite décisive",
            "",
            "Ce classement est préliminaire. Une analyse buteur sérieuse doit être recalculée lorsque les onze officiels paraissent : un joueur absent du onze ou prévu pour peu de minutes peut changer fortement de rang.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--simulations", type=int, default=6000)
    args = parser.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    team_report = json.loads(TEAM_REPORT_PATH.read_text())
    client = base.ApiClient(refresh=args.refresh)

    targets_payload = client.get(
        "fixtures",
        {
            "league": base.LEAGUE_ID,
            "season": CURRENT_SEASON,
            "date": base.TARGET_DATE,
            "timezone": "Europe/Paris",
        },
    )
    targets = [base.item_to_match(item) for item in targets_payload.get("response") or []]
    targets.sort(key=lambda match: (match.date, match.fixture_id))
    if len(targets) != 4:
        raise RuntimeError(f"Expected four target fixtures, got {len(targets)}")

    all_rows: list[PlayerSeason] = []
    for season in (*TRAIN_SEASONS, CURRENT_SEASON):
        all_rows.extend(fetch_league_players(client, season))
    temporal_validation = temporal_goal_rate_validation(all_rows)
    model = fit_goal_rate(all_rows)
    finishing_alpha, shrinkage_validation = choose_finishing_shrinkage(model, all_rows)
    by_player = previous_player_rows(all_rows)
    shot_priors = positional_shot_priors(all_rows)
    goal_rates_by_position = position_goal_rates(all_rows)
    shot_weight = float(temporal_validation["selected_shot_weight"])
    rich = richest_cached_fixtures()

    current_rows_by_team: dict[int, list[PlayerSeason]] = defaultdict(list)
    for row in all_rows:
        if row.season == CURRENT_SEASON:
            current_rows_by_team[row.team_id].append(row)

    rng = np.random.default_rng(2026090902)
    output_fixtures = []
    for fixture_index, target in enumerate(targets):
        fixture_team_report = team_report["fixtures"][fixture_index]
        if int(fixture_team_report["fixture_id"]) != target.fixture_id:
            raise RuntimeError("Team report fixture ordering mismatch")
        availability = fixture_team_report["availability"]
        side_outputs = {}
        for side, team_id, lambda_key in (
            ("home", target.home_id, "lambda_home"),
            ("away", target.away_id, "lambda_away"),
        ):
            history = lineup_history(rich, team_id, target.date)
            season_evidence, evidence_coverage = season_player_evidence(rich, team_id, target.date)
            team_matches = current_team_matches(team_report, fixture_index, side)
            prepared = []
            for row in current_rows_by_team.get(team_id, []):
                if row.minutes <= 0:
                    continue
                player_evidence = season_evidence.get(row.player_id) or {
                    "name": row.name,
                    "position": row.position,
                    "starts": row.starts,
                    "bench": row.bench,
                    "appearances": row.appearances,
                    "minutes": row.minutes,
                    "goals": row.goals,
                    "nonpen_goals": row.nonpen_goals,
                    "penalty_goals": row.penalties_scored,
                    "penalty_misses": row.penalties_missed,
                }
                projection = lineup_projection(row, history, team_matches, player_evidence)
                if projection["p_start"] + projection["p_bench"] < 0.025:
                    continue
                design = stable_design_row(
                    row, by_player.get(row.player_id, []), shot_priors
                )
                stable_shot_rate = math.exp(np.clip(design @ model.params, -5.0, 2.0))
                base_rate90 = (
                    shot_weight * stable_shot_rate
                    + (1.0 - shot_weight) * goal_rates_by_position[position_key(row.position)]
                )
                previous_penalties = sum(
                    old.penalties_scored + old.penalties_missed
                    for old in by_player.get(row.player_id, [])
                    if old.season == 2025
                )
                prepared.append(
                    {
                        "row": row,
                        "evidence": player_evidence,
                        "design": design,
                        "position_rate90": goal_rates_by_position[position_key(row.position)],
                        "lineup": projection,
                        "finishing_multiplier": finishing_multiplier(
                            model,
                            row,
                            by_player.get(row.player_id, []),
                            finishing_alpha,
                            player_evidence,
                            design,
                            base_rate90,
                        ),
                        "previous_penalty_attempts": previous_penalties,
                    }
                )
            side_outputs[side] = {
                "players": scorer_simulation(
                    rng,
                    fixture_team_report[lambda_key],
                    prepared,
                    model,
                    team_matches,
                    args.simulations,
                    shot_weight,
                ),
                "lineup_history_players": len(history),
                "current_player_rows": len(prepared),
                "evidence_coverage": evidence_coverage,
                "aggregate_shot_minute_coverage": float(
                    sum(player["row"].minutes for player in prepared)
                    / max(team_matches * 11 * 90, 1)
                ),
            }
        output_fixtures.append(
            {
                "fixture_id": target.fixture_id,
                "match": f"{target.home_name} - {target.away_name}",
                "kickoff_utc": target.date.isoformat(),
                "home_team": target.home_name,
                "away_team": target.away_name,
                "home_lambda": fixture_team_report["lambda_home"]["mean"],
                "away_lambda": fixture_team_report["lambda_away"]["mean"],
                "official_lineups_available": availability["official_lineups_available"],
                "injuries": availability["injuries"],
                **side_outputs,
            }
        )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": {
            "name": "lineup-minute hierarchical shot-to-goal allocation model",
            "train_seasons": list(TRAIN_SEASONS),
            "train_rows": model.train_rows,
            "train_log_loss": model.train_log_loss,
            "temporal_validation": temporal_validation,
            "ridge": model.ridge,
            "coefficients": model.params.tolist(),
            "finishing_alpha": finishing_alpha,
            "finishing_validation": shrinkage_validation,
            "shot_rate_prior_nineties": 6.0,
            "positional_shot_priors": {
                key: {"shots90": values[0], "sot90": values[1]}
                for key, values in shot_priors.items()
            },
            "position_goal_rates90": goal_rates_by_position,
            "simulations": args.simulations,
            "api_calls_network": client.calls,
            "api_requests_remaining": client.remaining,
        },
        "fixtures": output_fixtures,
    }
    json_path = OUT_DIR / "scorers.json"
    markdown_path = OUT_DIR / "scorers.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    markdown_path.write_text(build_markdown(report))
    print(
        json.dumps(
            {
                "fixtures": [fixture["match"] for fixture in output_fixtures],
                "train_rows": model.train_rows,
                "finishing_alpha": finishing_alpha,
                "simulations": args.simulations,
                "api_calls_network": client.calls,
                "api_requests_remaining": client.remaining,
                "json": str(json_path),
                "markdown": str(markdown_path),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
