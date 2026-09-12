#!/usr/bin/env python3
"""Independent pre-match analysis for the four K League 1 fixtures on 2026-09-09.

The sporting probability model intentionally excludes bookmaker odds and the
API-Football `/predictions` endpoint.  It uses only information dated before
kick-off, fits a time-decayed attack/defence Dixon-Coles model, selects its
regularisation and half-life by chronological validation, adds an independently
fitted shots-on-target signal when coverage is sufficient, and estimates
uncertainty with a block bootstrap.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from scipy.optimize import minimize
from scipy.special import gammaln


REPO = Path(__file__).resolve().parents[1]
ANALYSIS_DIR = REPO / "data" / "analysis" / "2026-09-09-kleague1-pro"
CACHE_DIR = ANALYSIS_DIR / "api-cache"
LEAGUE_ID = 292
TARGET_DATE = "2026-09-09"
SEASONS = (2023, 2024, 2025, 2026)
COMPLETED = {"FT"}


def load_env_key() -> str:
    key = os.environ.get("APISPORTS_KEY", "").strip()
    if key:
        return key
    env_path = REPO / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("APISPORTS_KEY="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("APISPORTS_KEY is missing")


class ApiClient:
    def __init__(self, refresh: bool = False) -> None:
        self.key = load_env_key()
        self.refresh = refresh
        self.calls = 0
        self.remaining: str | None = None
        CACHE_DIR.mkdir(parents=True, exist_ok=True)

    def get(self, endpoint: str, params: dict[str, Any]) -> dict[str, Any]:
        query = urllib.parse.urlencode(sorted((k, str(v)) for k, v in params.items()))
        cache_id = hashlib.sha256(f"{endpoint}?{query}".encode()).hexdigest()[:20]
        cache_path = CACHE_DIR / f"{endpoint.strip('/').replace('/', '-')}-{cache_id}.json"
        if cache_path.exists() and not self.refresh:
            return json.loads(cache_path.read_text())

        url = f"https://v3.football.api-sports.io/{endpoint.lstrip('/')}?{query}"
        request = urllib.request.Request(url, headers={"x-apisports-key": self.key})
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
                self.remaining = response.headers.get("x-ratelimit-requests-remaining")
        except urllib.error.HTTPError as exc:
            body = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(f"API HTTP {exc.code} for {endpoint}: {body[:500]}") from exc
        self.calls += 1
        if payload.get("errors"):
            raise RuntimeError(f"API error for {endpoint}: {payload['errors']}")
        cache_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
        time.sleep(0.04)
        return payload


def parse_dt(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


@dataclass(frozen=True)
class Match:
    fixture_id: int
    date: datetime
    season: int
    home_id: int
    away_id: int
    home_name: str
    away_name: str
    home_goals: int
    away_goals: int
    status: str
    round_name: str
    venue_name: str | None


def item_to_match(item: dict[str, Any]) -> Match:
    goals = item.get("goals") or {}
    return Match(
        fixture_id=int(item["fixture"]["id"]),
        date=parse_dt(item["fixture"]["date"]),
        season=int(item["league"]["season"]),
        home_id=int(item["teams"]["home"]["id"]),
        away_id=int(item["teams"]["away"]["id"]),
        home_name=item["teams"]["home"]["name"],
        away_name=item["teams"]["away"]["name"],
        home_goals=int(goals.get("home") or 0),
        away_goals=int(goals.get("away") or 0),
        status=item["fixture"]["status"]["short"],
        round_name=item["league"].get("round") or "",
        venue_name=(item["fixture"].get("venue") or {}).get("name"),
    )


def chunks(values: list[int], size: int) -> Iterable[list[int]]:
    for start in range(0, len(values), size):
        yield values[start : start + size]


def get_stat(team_block: dict[str, Any], name: str) -> float | None:
    for row in team_block.get("statistics") or []:
        if row.get("type") != name:
            continue
        value = row.get("value")
        if value is None:
            return None
        if isinstance(value, str) and value.endswith("%"):
            value = value[:-1]
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    return None


def extract_detail(item: dict[str, Any]) -> dict[str, Any]:
    teams = item["teams"]
    home_id = int(teams["home"]["id"])
    away_id = int(teams["away"]["id"])
    by_team: dict[int, dict[str, Any]] = {}
    for block in item.get("statistics") or []:
        team = block.get("team") or {}
        if team.get("id") is not None:
            by_team[int(team["id"])] = block

    red_minutes: list[int] = []
    for event in item.get("events") or []:
        if event.get("type") != "Card" or event.get("detail") not in {
            "Red Card",
            "Second Yellow card",
            "Yellow-Red Card",
        }:
            continue
        minute = (event.get("time") or {}).get("elapsed")
        if isinstance(minute, int):
            red_minutes.append(minute)

    def team_stats(team_id: int) -> dict[str, float | None]:
        block = by_team.get(team_id, {})
        return {
            "sot": get_stat(block, "Shots on Goal"),
            "shots": get_stat(block, "Total Shots"),
            "inside": get_stat(block, "Shots insidebox"),
        }

    return {
        "home": team_stats(home_id),
        "away": team_stats(away_id),
        "first_red_minute": min(red_minutes) if red_minutes else None,
    }


def rest_features(matches: list[Match]) -> dict[int, tuple[float, float]]:
    last_seen: dict[int, datetime] = {}
    result: dict[int, tuple[float, float]] = {}
    for match in sorted(matches, key=lambda m: m.date):
        home_rest = (
            min(21.0, max(2.0, (match.date - last_seen[match.home_id]).total_seconds() / 86400))
            if match.home_id in last_seen
            else 7.0
        )
        away_rest = (
            min(21.0, max(2.0, (match.date - last_seen[match.away_id]).total_seconds() / 86400))
            if match.away_id in last_seen
            else 7.0
        )
        result[match.fixture_id] = (home_rest, away_rest)
        last_seen[match.home_id] = match.date
        last_seen[match.away_id] = match.date
    return result


@dataclass
class FitResult:
    x: np.ndarray
    teams: list[int]
    team_index: dict[int, int]
    half_life: float
    ridge: float
    success: bool
    fun: float
    use_dc: bool


def unpack(params: np.ndarray, n_teams: int) -> tuple[float, float, float, np.ndarray, np.ndarray, float]:
    mu, home_adv, rest_beta = params[:3]
    attacks_raw = params[3 : 3 + n_teams]
    defences_raw = params[3 + n_teams : 3 + 2 * n_teams]
    rho = params[-1]
    attacks = attacks_raw - attacks_raw.mean()
    defences = defences_raw - defences_raw.mean()
    return mu, home_adv, rest_beta, attacks, defences, rho


def tau_dc(x: np.ndarray, y: np.ndarray, lh: np.ndarray, la: np.ndarray, rho: float) -> np.ndarray:
    tau = np.ones_like(lh)
    mask = (x == 0) & (y == 0)
    tau[mask] = 1.0 - lh[mask] * la[mask] * rho
    mask = (x == 0) & (y == 1)
    tau[mask] = 1.0 + lh[mask] * rho
    mask = (x == 1) & (y == 0)
    tau[mask] = 1.0 + la[mask] * rho
    mask = (x == 1) & (y == 1)
    tau[mask] = 1.0 - rho
    return tau


def fit_count_model(
    matches: list[Match],
    counts: dict[int, tuple[int, int]],
    teams: list[int],
    cutoff: datetime,
    half_life: float,
    ridge: float,
    rest_map: dict[int, tuple[float, float]],
    red_factors: dict[int, float],
    use_dc: bool,
    init: np.ndarray | None = None,
    bootstrap_mult: dict[int, float] | None = None,
) -> FitResult:
    team_index = {team_id: idx for idx, team_id in enumerate(teams)}
    usable = [m for m in matches if m.date < cutoff and m.fixture_id in counts]
    if len(usable) < max(80, len(teams) * 5):
        raise RuntimeError(f"Insufficient training matches: {len(usable)}")

    h_idx = np.array([team_index[m.home_id] for m in usable], dtype=int)
    a_idx = np.array([team_index[m.away_id] for m in usable], dtype=int)
    xg = np.array([counts[m.fixture_id][0] for m in usable], dtype=float)
    yg = np.array([counts[m.fixture_id][1] for m in usable], dtype=float)
    age_days = np.array([(cutoff - m.date).total_seconds() / 86400 for m in usable])
    weights = np.exp(-math.log(2.0) * age_days / half_life)
    weights *= np.array([red_factors.get(m.fixture_id, 1.0) for m in usable])
    if bootstrap_mult:
        weights *= np.array([bootstrap_mult.get(m.fixture_id, 0.0) for m in usable])
    rest_diff = np.array(
        [np.clip((rest_map[m.fixture_id][0] - rest_map[m.fixture_id][1]) / 7.0, -1.0, 1.0) for m in usable]
    )

    n = len(teams)
    if init is None:
        mean_goals = max(0.2, float((xg.sum() + yg.sum()) / (2 * len(usable))))
        init = np.zeros(4 + 2 * n)
        init[0] = math.log(mean_goals)
        init[1] = 0.12
        init[-1] = -0.06 if use_dc else 0.0

    def objective(params: np.ndarray) -> float:
        mu, hfa, rest_beta, attacks, defences, rho = unpack(params, n)
        log_lh = np.clip(mu + hfa + attacks[h_idx] + defences[a_idx] + rest_beta * rest_diff, -3.0, 2.2)
        log_la = np.clip(mu + attacks[a_idx] + defences[h_idx] - rest_beta * rest_diff, -3.0, 2.2)
        lh = np.exp(log_lh)
        la = np.exp(log_la)
        ll = xg * log_lh - lh - gammaln(xg + 1.0) + yg * log_la - la - gammaln(yg + 1.0)
        if use_dc:
            tau = tau_dc(xg, yg, lh, la, rho)
            if np.any(tau <= 1e-8):
                return 1e12 + float(np.sum(np.square(np.minimum(tau, 0.0)))) * 1e9
            ll += np.log(tau)
        effective_n = max(weights.sum(), 1.0)
        penalty = ridge * effective_n * (
            float(np.mean(attacks**2)) + float(np.mean(defences**2)) + 0.25 * rest_beta**2
        )
        return float(-np.dot(weights, ll) + penalty)

    bounds = [(-1.5, 1.2), (-0.6, 0.8), (-0.5, 0.5)]
    bounds += [(-2.0, 2.0)] * (2 * n)
    bounds += [(-0.20, 0.05) if use_dc else (0.0, 0.0)]
    result = minimize(
        objective,
        init,
        method="L-BFGS-B",
        bounds=bounds,
        options={"maxiter": 900, "ftol": 1e-10, "gtol": 1e-6},
    )
    return FitResult(
        x=result.x,
        teams=teams,
        team_index=team_index,
        half_life=half_life,
        ridge=ridge,
        success=bool(result.success),
        fun=float(result.fun),
        use_dc=use_dc,
    )


def predict_lambdas(fit: FitResult, match: Match, rest: tuple[float, float]) -> tuple[float, float, float]:
    mu, hfa, rest_beta, attacks, defences, rho = unpack(fit.x, len(fit.teams))
    hi = fit.team_index.get(match.home_id)
    ai = fit.team_index.get(match.away_id)
    home_attack = attacks[hi] if hi is not None else 0.0
    away_attack = attacks[ai] if ai is not None else 0.0
    home_defence = defences[hi] if hi is not None else 0.0
    away_defence = defences[ai] if ai is not None else 0.0
    rest_diff = float(np.clip((rest[0] - rest[1]) / 7.0, -1.0, 1.0))
    lh = math.exp(np.clip(mu + hfa + home_attack + away_defence + rest_beta * rest_diff, -3, 2.2))
    la = math.exp(np.clip(mu + away_attack + home_defence - rest_beta * rest_diff, -3, 2.2))
    return lh, la, rho


def score_matrix(lh: float, la: float, rho: float = 0.0, use_dc: bool = True, max_goals: int = 12) -> np.ndarray:
    goals = np.arange(max_goals + 1, dtype=float)
    ph = np.exp(-lh + goals * math.log(max(lh, 1e-12)) - gammaln(goals + 1))
    pa = np.exp(-la + goals * math.log(max(la, 1e-12)) - gammaln(goals + 1))
    matrix = np.outer(ph, pa)
    if use_dc:
        xs, ys = np.meshgrid(goals, goals, indexing="ij")
        tau = tau_dc(xs.ravel(), ys.ravel(), np.full(xs.size, lh), np.full(xs.size, la), rho)
        if np.all(tau > 0):
            matrix *= tau.reshape(matrix.shape)
    matrix /= matrix.sum()
    return matrix


def market_probabilities(matrix: np.ndarray) -> dict[str, float]:
    n = matrix.shape[0]
    home = float(np.tril(matrix, -1).sum())
    draw = float(np.trace(matrix))
    away = float(np.triu(matrix, 1).sum())
    result: dict[str, float] = {
        "1": home,
        "N": draw,
        "2": away,
        "1X": home + draw,
        "X2": away + draw,
        "12": home + away,
        "BTTS Oui": float(matrix[1:, 1:].sum()),
        "BTTS Non": float(matrix[0, :].sum() + matrix[1:, 0].sum()),
    }
    for line in (0.5, 1.5, 2.5, 3.5, 4.5):
        threshold = int(math.floor(line))
        over = sum(matrix[i, j] for i in range(n) for j in range(n) if i + j > threshold)
        result[f"Plus de {line:.1f} buts"] = float(over)
        result[f"Moins de {line:.1f} buts"] = float(1.0 - over)
    for label, axis in (("Domicile", 0), ("Extérieur", 1)):
        marginal = matrix.sum(axis=1 if axis == 0 else 0)
        for line in (0.5, 1.5, 2.5):
            threshold = int(math.floor(line))
            over = float(marginal[threshold + 1 :].sum())
            result[f"{label} plus de {line:.1f} but"] = over
            result[f"{label} moins de {line:.1f} but"] = 1.0 - over
    return result


def log_probability(matrix: np.ndarray, home_goals: int, away_goals: int) -> float:
    if home_goals >= matrix.shape[0] or away_goals >= matrix.shape[1]:
        return math.log(1e-12)
    return math.log(max(float(matrix[home_goals, away_goals]), 1e-12))


def validation_slices(matches: list[Match]) -> list[tuple[datetime, datetime]]:
    dates = sorted({m.date for m in matches})
    if len(dates) < 80:
        raise RuntimeError("Not enough match dates for chronological validation")
    start_idx = int(len(dates) * 0.56)
    remaining = dates[start_idx:]
    cuts = np.linspace(0, len(remaining), 7, dtype=int)
    slices: list[tuple[datetime, datetime]] = []
    for i in range(len(cuts) - 1):
        lo = remaining[cuts[i]]
        hi_index = min(cuts[i + 1], len(remaining) - 1)
        hi = remaining[hi_index]
        if hi > lo:
            slices.append((lo, hi))
    return slices


def choose_hyperparameters(
    matches: list[Match],
    counts: dict[int, tuple[int, int]],
    teams: list[int],
    rest_map: dict[int, tuple[float, float]],
    red_factors: dict[int, float],
    use_dc: bool,
) -> tuple[float, float, list[dict[str, float]]]:
    grid = [(h, r) for h in (120.0, 240.0, 365.0, 540.0) for r in (0.015, 0.05, 0.15)]
    folds = validation_slices(matches)
    rows: list[dict[str, float]] = []
    for half_life, ridge in grid:
        losses: list[float] = []
        briers: list[float] = []
        for cutoff, end in folds:
            fit = fit_count_model(
                matches, counts, teams, cutoff, half_life, ridge, rest_map, red_factors, use_dc
            )
            for match in matches:
                if not (cutoff <= match.date < end) or match.fixture_id not in counts:
                    continue
                lh, la, rho = predict_lambdas(fit, match, rest_map[match.fixture_id])
                matrix = score_matrix(lh, la, rho, use_dc)
                losses.append(-log_probability(matrix, *counts[match.fixture_id]))
                probs = market_probabilities(matrix)
                observed = np.array(
                    [
                        1.0 if match.home_goals > match.away_goals else 0.0,
                        1.0 if match.home_goals == match.away_goals else 0.0,
                        1.0 if match.home_goals < match.away_goals else 0.0,
                    ]
                )
                predicted = np.array([probs["1"], probs["N"], probs["2"]])
                briers.append(float(np.sum((predicted - observed) ** 2)))
        if losses:
            rows.append(
                {
                    "half_life": half_life,
                    "ridge": ridge,
                    "score_log_loss": float(np.mean(losses)),
                    "brier_1n2": float(np.mean(briers)),
                    "n_predictions": float(len(losses)),
                }
            )
    rows.sort(key=lambda row: (row["score_log_loss"], row["brier_1n2"]))
    if not rows:
        raise RuntimeError("Hyperparameter validation produced no predictions")
    return rows[0]["half_life"], rows[0]["ridge"], rows


def constant_league_baseline(matches: list[Match]) -> dict[str, float]:
    losses: list[float] = []
    briers: list[float] = []
    for cutoff, end in validation_slices(matches):
        training = [match for match in matches if match.date < cutoff]
        lh = sum(match.home_goals for match in training) / len(training)
        la = sum(match.away_goals for match in training) / len(training)
        matrix = score_matrix(lh, la, 0.0, False)
        probs = market_probabilities(matrix)
        predicted = np.array([probs["1"], probs["N"], probs["2"]])
        for match in matches:
            if not (cutoff <= match.date < end):
                continue
            losses.append(-log_probability(matrix, match.home_goals, match.away_goals))
            observed = np.array(
                [
                    1.0 if match.home_goals > match.away_goals else 0.0,
                    1.0 if match.home_goals == match.away_goals else 0.0,
                    1.0 if match.home_goals < match.away_goals else 0.0,
                ]
            )
            briers.append(float(np.sum((predicted - observed) ** 2)))
    return {
        "score_log_loss": float(np.mean(losses)),
        "brier_1n2": float(np.mean(briers)),
        "n_predictions": float(len(losses)),
    }


def choose_shot_weight(
    matches: list[Match],
    goal_counts: dict[int, tuple[int, int]],
    sot_counts: dict[int, tuple[int, int]],
    teams: list[int],
    rest_map: dict[int, tuple[float, float]],
    red_factors: dict[int, float],
    half_life: float,
    ridge: float,
    use_dc: bool,
) -> tuple[float, dict[str, Any]]:
    eligible = [m for m in matches if m.fixture_id in sot_counts]
    coverage = len(eligible) / max(len(matches), 1)
    diagnostics: dict[str, Any] = {"coverage": coverage, "used": False}
    if coverage < 0.60 or len(eligible) < 180:
        return 1.0, diagnostics

    validation_rows: list[tuple[Match, float, float, float, float, float]] = []
    for cutoff, end in validation_slices(matches):
        goal_fit = fit_count_model(
            matches, goal_counts, teams, cutoff, half_life, ridge, rest_map, red_factors, use_dc
        )
        sot_fit = fit_count_model(
            matches, sot_counts, teams, cutoff, half_life, ridge, rest_map, red_factors, False
        )
        prior = [m for m in eligible if m.date < cutoff]
        home_sot = sum(sot_counts[m.fixture_id][0] for m in prior)
        away_sot = sum(sot_counts[m.fixture_id][1] for m in prior)
        home_goals = sum(goal_counts[m.fixture_id][0] for m in prior)
        away_goals = sum(goal_counts[m.fixture_id][1] for m in prior)
        conv_h = home_goals / max(home_sot, 1)
        conv_a = away_goals / max(away_sot, 1)
        for match in matches:
            if not (cutoff <= match.date < end) or match.fixture_id not in sot_counts:
                continue
            glh, gla, rho = predict_lambdas(goal_fit, match, rest_map[match.fixture_id])
            slh, sla, _ = predict_lambdas(sot_fit, match, rest_map[match.fixture_id])
            validation_rows.append((match, glh, gla, max(0.05, slh * conv_h), max(0.05, sla * conv_a), rho))

    candidates = np.linspace(0.0, 1.0, 11)
    scores: list[dict[str, float]] = []
    for goal_weight in candidates:
        losses: list[float] = []
        for match, glh, gla, sh, sa, rho in validation_rows:
            lh = math.exp(goal_weight * math.log(glh) + (1 - goal_weight) * math.log(sh))
            la = math.exp(goal_weight * math.log(gla) + (1 - goal_weight) * math.log(sa))
            matrix = score_matrix(lh, la, rho, use_dc)
            losses.append(-log_probability(matrix, match.home_goals, match.away_goals))
        scores.append({"goal_weight": float(goal_weight), "score_log_loss": float(np.mean(losses))})
    scores.sort(key=lambda row: row["score_log_loss"])
    diagnostics.update({"used": True, "n_predictions": len(validation_rows), "weights": scores})
    return scores[0]["goal_weight"], diagnostics


def current_rest_from_recent(
    client: ApiClient, match: Match
) -> tuple[tuple[float, float], dict[str, Any]]:
    details: dict[str, Any] = {}
    rests: list[float] = []
    for side, team_id in (("home", match.home_id), ("away", match.away_id)):
        payload = client.get("fixtures", {"team": team_id, "last": 20, "timezone": "UTC"})
        past = []
        for item in payload.get("response") or []:
            dt = parse_dt(item["fixture"]["date"])
            status = item["fixture"]["status"]["short"]
            if dt < match.date and status in {"FT", "AET", "PEN"}:
                past.append((dt, item))
        past.sort(key=lambda pair: pair[0], reverse=True)
        if past:
            days = (match.date - past[0][0]).total_seconds() / 86400
            rests.append(min(21.0, max(2.0, days)))
            details[side] = {
                "days": days,
                "last_fixture_id": past[0][1]["fixture"]["id"],
                "last_opponent": (
                    past[0][1]["teams"]["away"]["name"]
                    if int(past[0][1]["teams"]["home"]["id"]) == team_id
                    else past[0][1]["teams"]["home"]["name"]
                ),
                "last_competition": past[0][1]["league"]["name"],
            }
        else:
            rests.append(7.0)
            details[side] = {"days": None}
    return (rests[0], rests[1]), details


def availability(client: ApiClient, fixture_id: int) -> dict[str, Any]:
    injuries = client.get("injuries", {"fixture": fixture_id}).get("response") or []
    lineups = client.get("fixtures/lineups", {"fixture": fixture_id}).get("response") or []
    return {
        "official_lineups_available": len(lineups) >= 2,
        "lineup_teams": [row.get("team", {}).get("name") for row in lineups],
        "injuries": [
            {
                "team": (row.get("team") or {}).get("name"),
                "player": (row.get("player") or {}).get("name"),
                "type": row.get("type"),
                "reason": row.get("reason"),
            }
            for row in injuries
        ],
    }


def league_table(matches: list[Match], season: int, cutoff: datetime) -> dict[int, dict[str, int]]:
    table: dict[int, dict[str, int]] = defaultdict(
        lambda: {"played": 0, "points": 0, "gf": 0, "ga": 0, "wins": 0, "draws": 0, "losses": 0}
    )
    for match in matches:
        if match.season != season or match.date >= cutoff:
            continue
        home = table[match.home_id]
        away = table[match.away_id]
        home["played"] += 1
        away["played"] += 1
        home["gf"] += match.home_goals
        home["ga"] += match.away_goals
        away["gf"] += match.away_goals
        away["ga"] += match.home_goals
        if match.home_goals > match.away_goals:
            home["wins"] += 1
            home["points"] += 3
            away["losses"] += 1
        elif match.home_goals < match.away_goals:
            away["wins"] += 1
            away["points"] += 3
            home["losses"] += 1
        else:
            home["draws"] += 1
            away["draws"] += 1
            home["points"] += 1
            away["points"] += 1
    ordered = sorted(
        table,
        key=lambda team_id: (
            table[team_id]["points"],
            table[team_id]["gf"] - table[team_id]["ga"],
            table[team_id]["gf"],
        ),
        reverse=True,
    )
    for rank, team_id in enumerate(ordered, start=1):
        table[team_id]["rank"] = rank
        table[team_id]["goal_difference"] = table[team_id]["gf"] - table[team_id]["ga"]
    return dict(table)


def team_profile(
    team_id: int,
    side: str,
    target: Match,
    historical: list[Match],
    details: dict[int, dict[str, Any]],
    standings: dict[int, dict[str, int]],
    fit: FitResult,
) -> dict[str, Any]:
    season_matches = [
        match
        for match in historical
        if match.season == target.season
        and match.date < target.date
        and team_id in {match.home_id, match.away_id}
    ]
    relevant = [
        match
        for match in season_matches
        if (side == "home" and match.home_id == team_id)
        or (side == "away" and match.away_id == team_id)
    ]

    def totals(rows: list[Match]) -> dict[str, Any]:
        gf = ga = wins = draws = losses = 0
        sot_for: list[float] = []
        sot_against: list[float] = []
        for match in rows:
            is_home = match.home_id == team_id
            scored = match.home_goals if is_home else match.away_goals
            conceded = match.away_goals if is_home else match.home_goals
            gf += scored
            ga += conceded
            if scored > conceded:
                wins += 1
            elif scored == conceded:
                draws += 1
            else:
                losses += 1
            detail = details.get(match.fixture_id) or {}
            own = (detail.get("home") if is_home else detail.get("away")) or {}
            opp = (detail.get("away") if is_home else detail.get("home")) or {}
            if own.get("sot") is not None and opp.get("sot") is not None:
                sot_for.append(float(own["sot"]))
                sot_against.append(float(opp["sot"]))
        n = len(rows)
        return {
            "matches": n,
            "wins": wins,
            "draws": draws,
            "losses": losses,
            "gf": gf,
            "ga": ga,
            "gf_per_match": gf / n if n else None,
            "ga_per_match": ga / n if n else None,
            "sot_for_per_match": float(np.mean(sot_for)) if sot_for else None,
            "sot_against_per_match": float(np.mean(sot_against)) if sot_against else None,
            "sot_coverage": len(sot_for) / n if n else 0.0,
        }

    recent = sorted(season_matches, key=lambda match: match.date, reverse=True)[:8]
    form = []
    recent_scores = []
    for match in recent:
        is_home = match.home_id == team_id
        scored = match.home_goals if is_home else match.away_goals
        conceded = match.away_goals if is_home else match.home_goals
        form.append("W" if scored > conceded else "D" if scored == conceded else "L")
        opponent = match.away_name if is_home else match.home_name
        recent_scores.append(
            {
                "date": match.date.date().isoformat(),
                "opponent": opponent,
                "venue": "H" if is_home else "A",
                "score": f"{scored}-{conceded}",
                "result": form[-1],
            }
        )
    _, _, _, attacks, defences, _ = unpack(fit.x, len(fit.teams))
    idx = fit.team_index.get(team_id)
    return {
        "standings": standings.get(team_id),
        "season": totals(season_matches),
        "venue_split": totals(relevant),
        "recent_8": totals(recent),
        "recent_form_newest_first": "".join(form),
        "recent_scores": recent_scores,
        "model_attack_index": float(math.exp(attacks[idx])) if idx is not None else 1.0,
        "model_defensive_weakness_index": float(math.exp(defences[idx])) if idx is not None else 1.0,
    }


def normalise_odds_market(bet_name: str, value: str) -> str | None:
    bet = " ".join(bet_name.lower().split())
    selection = " ".join(value.lower().split())
    # Team-goal totals share the words "home/away" and "total" with corners,
    # cards and other props. Reject those families explicitly before mapping;
    # otherwise e.g. an away-card Under 1.5 can be mislabeled as away goals.
    excluded_props = (
        "corner", "card", "booking", "offside", "shot", "foul", "throw",
        "goal kick", "free kick", "substitution", "possession",
    )
    if (
        "half" in bet
        or "15 minutes" in bet
        or "30 minutes" in bet
        or "60 minutes" in bet
        or "75 minutes" in bet
        or any(prop in bet for prop in excluded_props)
    ):
        return None
    if bet == "match winner":
        return {"home": "1", "draw": "N", "away": "2"}.get(selection)
    if bet == "double chance":
        return {
            "home or draw": "1X",
            "draw or away": "X2",
            "home or away": "12",
            "home/draw": "1X",
            "draw/away": "X2",
            "home/away": "12",
        }.get(selection)
    if bet in {"goals over/under", "goals over under"}:
        if selection.startswith("over "):
            return f"Plus de {selection.split()[-1]} buts"
        if selection.startswith("under "):
            return f"Moins de {selection.split()[-1]} buts"
    if bet in {"both teams score", "both teams to score"}:
        return {"yes": "BTTS Oui", "no": "BTTS Non"}.get(selection)
    if "home" in bet and "total" in bet:
        if selection.startswith("over "):
            return f"Domicile plus de {selection.split()[-1]} but"
        if selection.startswith("under "):
            return f"Domicile moins de {selection.split()[-1]} but"
    if "away" in bet and "total" in bet:
        if selection.startswith("over "):
            return f"Extérieur plus de {selection.split()[-1]} but"
        if selection.startswith("under "):
            return f"Extérieur moins de {selection.split()[-1]} but"
    return None


def fetch_market_prices(client: ApiClient, fixture_id: int) -> dict[str, Any]:
    payload = client.get("odds", {"fixture": fixture_id})
    offers: dict[str, list[dict[str, Any]]] = defaultdict(list)
    bet_names: set[str] = set()
    for fixture_row in payload.get("response") or []:
        for bookmaker in fixture_row.get("bookmakers") or []:
            for bet in bookmaker.get("bets") or []:
                bet_name = str(bet.get("name") or "")
                bet_names.add(bet_name)
                for value in bet.get("values") or []:
                    market = normalise_odds_market(bet_name, str(value.get("value") or ""))
                    try:
                        odd = float(value.get("odd"))
                    except (TypeError, ValueError):
                        continue
                    if market:
                        offers[market].append(
                            {"bookmaker": bookmaker.get("name"), "odd": odd}
                        )
    summary: dict[str, Any] = {}
    for market, rows in offers.items():
        odds = np.array([row["odd"] for row in rows], dtype=float)
        best_row = max(rows, key=lambda row: row["odd"])
        summary[market] = {
            "best": best_row["odd"],
            "best_bookmaker": best_row["bookmaker"],
            "median": float(np.median(odds)),
            "bookmakers": len(rows),
        }
    return {"markets": summary, "raw_bet_names": sorted(bet_names)}


def price_comparison(
    markets: dict[str, dict[str, float]], prices: dict[str, Any]
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for market, probability in markets.items():
        price = prices.get("markets", {}).get(market)
        if not price:
            continue
        p = probability["mean"]
        p10 = probability["p10"]
        rows.append(
            {
                "market": market,
                "probability": p,
                "p10": p10,
                "fair_odds": 1.0 / p,
                **price,
                "expected_value_best": p * price["best"] - 1.0,
                "conservative_ev_best": p10 * price["best"] - 1.0,
            }
        )
    rows.sort(key=lambda row: (row["conservative_ev_best"], row["probability"]), reverse=True)
    return rows


def bootstrap_predictions(
    rng: np.random.Generator,
    matches: list[Match],
    goal_counts: dict[int, tuple[int, int]],
    sot_counts: dict[int, tuple[int, int]],
    teams: list[int],
    cutoff: datetime,
    rest_map: dict[int, tuple[float, float]],
    red_factors: dict[int, float],
    half_life: float,
    ridge: float,
    goal_weight: float,
    targets: list[Match],
    current_rests: dict[int, tuple[float, float]],
    final_goal_fit: FitResult,
    final_sot_fit: FitResult | None,
    use_dc: bool,
    n_boot: int,
) -> dict[int, dict[str, list[float]]]:
    predictions: dict[int, dict[str, list[float]]] = {
        target.fixture_id: defaultdict(list) for target in targets
    }
    training = [m for m in matches if m.date < cutoff and m.fixture_id in goal_counts]
    blocks: dict[tuple[int, int], list[Match]] = defaultdict(list)
    for match in training:
        iso = match.date.isocalendar()
        blocks[(iso.year, iso.week)].append(match)
    block_keys = list(blocks)

    # Include the fitted champion once, then block-bootstrap refits.
    fit_pairs: list[tuple[FitResult, FitResult | None]] = [(final_goal_fit, final_sot_fit)]
    for _ in range(n_boot):
        sampled = rng.choice(len(block_keys), size=len(block_keys), replace=True)
        multiplicities = Counter(int(i) for i in sampled)
        mult: dict[int, float] = {}
        for index, count in multiplicities.items():
            for match in blocks[block_keys[index]]:
                mult[match.fixture_id] = float(count)
        try:
            goal_fit = fit_count_model(
                matches,
                goal_counts,
                teams,
                cutoff,
                half_life,
                ridge,
                rest_map,
                red_factors,
                use_dc,
                init=final_goal_fit.x,
                bootstrap_mult=mult,
            )
            sot_fit = None
            if final_sot_fit is not None and goal_weight < 0.999:
                sot_fit = fit_count_model(
                    matches,
                    sot_counts,
                    teams,
                    cutoff,
                    half_life,
                    ridge,
                    rest_map,
                    red_factors,
                    False,
                    init=final_sot_fit.x,
                    bootstrap_mult=mult,
                )
            if goal_fit.success:
                fit_pairs.append((goal_fit, sot_fit))
        except Exception:
            continue

    prior_sot = [m for m in training if m.fixture_id in sot_counts]
    conv_h = sum(goal_counts[m.fixture_id][0] for m in prior_sot) / max(
        sum(sot_counts[m.fixture_id][0] for m in prior_sot), 1
    )
    conv_a = sum(goal_counts[m.fixture_id][1] for m in prior_sot) / max(
        sum(sot_counts[m.fixture_id][1] for m in prior_sot), 1
    )

    for goal_fit, sot_fit in fit_pairs:
        for target in targets:
            rest = current_rests[target.fixture_id]
            glh, gla, rho = predict_lambdas(goal_fit, target, rest)
            lh, la = glh, gla
            if sot_fit is not None and goal_weight < 0.999:
                slh, sla, _ = predict_lambdas(sot_fit, target, rest)
                sh = max(0.05, slh * conv_h)
                sa = max(0.05, sla * conv_a)
                lh = math.exp(goal_weight * math.log(glh) + (1 - goal_weight) * math.log(sh))
                la = math.exp(goal_weight * math.log(gla) + (1 - goal_weight) * math.log(sa))
            matrix = score_matrix(lh, la, rho, use_dc)
            probs = market_probabilities(matrix)
            probs["lambda_home"] = lh
            probs["lambda_away"] = la
            for key, value in probs.items():
                predictions[target.fixture_id][key].append(float(value))
    return predictions


def summarise_predictions(
    target: Match,
    samples: dict[str, list[float]],
    central_matrix: np.ndarray,
) -> dict[str, Any]:
    summaries: dict[str, dict[str, float]] = {}
    for market, values in samples.items():
        arr = np.array(values, dtype=float)
        summaries[market] = {
            "mean": float(arr.mean()),
            "p10": float(np.quantile(arr, 0.10)),
            "p90": float(np.quantile(arr, 0.90)),
        }

    market_only = {k: v for k, v in summaries.items() if not k.startswith("lambda_")}
    ranked_raw = sorted(market_only.items(), key=lambda kv: kv[1]["p10"], reverse=True)
    standard = {
        "1",
        "N",
        "2",
        "1X",
        "X2",
        "12",
        "BTTS Oui",
        "BTTS Non",
        "Plus de 1.5 buts",
        "Moins de 3.5 buts",
        "Domicile plus de 0.5 but",
        "Extérieur plus de 0.5 but",
        "Domicile moins de 1.5 but",
        "Extérieur moins de 1.5 but",
    }
    ranked_standard = [row for row in ranked_raw if row[0] in standard]

    flat = [
        (float(central_matrix[i, j]), i, j)
        for i in range(central_matrix.shape[0])
        for j in range(central_matrix.shape[1])
    ]
    flat.sort(reverse=True)
    exact_scores = [
        {"score": f"{i}-{j}", "probability": probability}
        for probability, i, j in flat[:6]
    ]
    return {
        "fixture_id": target.fixture_id,
        "match": f"{target.home_name} - {target.away_name}",
        "kickoff_utc": target.date.isoformat(),
        "lambda_home": summaries["lambda_home"],
        "lambda_away": summaries["lambda_away"],
        "markets": market_only,
        "top_raw": [{"market": k, **v} for k, v in ranked_raw[:8]],
        "top_standard": [{"market": k, **v} for k, v in ranked_standard[:8]],
        "exact_scores": exact_scores,
    }


def pct(value: float) -> str:
    return f"{100 * value:.1f}%"


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Analyse indépendante — K League 1 — 9 septembre 2026",
        "",
        f"Générée à `{report['generated_at']}`. Aucune cote et aucune prédiction fournisseur n'entrent dans les probabilités.",
        "",
        "## Validation du modèle",
        "",
        f"- Matchs historiques : **{report['data']['historical_matches']}**",
        f"- Couverture tirs cadrés : **{pct(report['data']['sot_coverage'])}**",
        f"- Demi-vie sélectionnée : **{report['model']['half_life_days']:.0f} jours**",
        f"- Régularisation sélectionnée : **{report['model']['ridge']:.3f}**",
        f"- Log loss score en validation : **{report['model']['validation_score_log_loss']:.4f}**",
        f"- Brier 1N2 en validation : **{report['model']['validation_brier_1n2']:.4f}**",
        f"- Baseline ligue — log loss/Brier : **{report['model']['league_baseline']['score_log_loss']:.4f} / {report['model']['league_baseline']['brier_1n2']:.4f}**",
        f"- Poids du modèle buts dans l'ensemble : **{report['model']['goal_weight']:.0%}**",
        f"- Rééchantillonnages réussis : **{report['model']['bootstrap_samples']}**",
        f"- Loi de score retenue : **{report['model']['score_law']}**",
        "",
    ]
    for index, fixture in enumerate(report["fixtures"], start=1):
        lines.extend(
            [
                f"## {index}. {fixture['match']}",
                "",
                f"Coup d'envoi : `{fixture['kickoff_utc']}` — Repos : {fixture['rest']['home']['days']:.1f} j / {fixture['rest']['away']['days']:.1f} j.",
                "",
                f"Buts attendus : **{fixture['lambda_home']['mean']:.2f} – {fixture['lambda_away']['mean']:.2f}**.",
                "",
                "| Marché standard | Probabilité | Intervalle bootstrap 10–90 % | Cote juste indicative |",
                "|---|---:|---:|---:|",
            ]
        )
        for row in fixture["top_standard"][:6]:
            fair = 1.0 / row["mean"] if row["mean"] > 0 else float("inf")
            lines.append(
                f"| {row['market']} | {pct(row['mean'])} | {pct(row['p10'])}–{pct(row['p90'])} | {fair:.2f} |"
            )
        lines.extend(["", "Scores exacts les plus probables : " + ", ".join(
            f"{row['score']} ({pct(row['probability'])})" for row in fixture["exact_scores"][:4]
        ) + ".", ""])
        for label, side in (("Domicile", "home"), ("Extérieur", "away")):
            profile = fixture["profiles"][side]
            season = profile["season"]
            venue = profile["venue_split"]
            standing = profile.get("standings") or {}
            lines.append(
                f"- **{label}** : rang recalculé {standing.get('rank', '?')}, saison {season['wins']}V-{season['draws']}N-{season['losses']}D, "
                f"{season['gf_per_match']:.2f} but marqué et {season['ga_per_match']:.2f} encaissé/match ; "
                f"split pertinent {venue['gf_per_match']:.2f}/{venue['ga_per_match']:.2f} ; "
                f"indices modèle attaque/défense-faiblesse {profile['model_attack_index']:.2f}/{profile['model_defensive_weakness_index']:.2f}."
            )
        lines.append("")
        availability_info = fixture["availability"]
        if availability_info["official_lineups_available"]:
            lines.append("Compositions officielles disponibles et contrôlées.")
        else:
            lines.append("Compositions officielles non disponibles au moment du calcul : aucun joueur supposé titulaire n'est traité comme certain.")
        injuries = availability_info["injuries"]
        if injuries:
            names = ", ".join(
                f"{row.get('player') or 'inconnu'} ({row.get('team') or '?'}, {row.get('reason') or row.get('type') or 'indisponibilité'})"
                for row in injuries
            )
            lines.append(f"Indisponibilités renvoyées par l'API : {names}.")
        else:
            lines.append("Aucune indisponibilité renvoyée par l'endpoint du match ; cela ne prouve pas une infirmerie vide.")
        priced = fixture.get("price_comparison") or []
        if priced:
            lines.extend(
                [
                    "",
                    "Comparaison de prix effectuée après gel des probabilités :",
                    "",
                    "| Marché | Probabilité | Cote juste | Meilleure cote observée | EV centrale | EV conservatrice |",
                    "|---|---:|---:|---:|---:|---:|",
                ]
            )
            for row in priced[:5]:
                lines.append(
                    f"| {row['market']} | {pct(row['probability'])} | {row['fair_odds']:.2f} | {row['best']:.2f} | {pct(row['expected_value_best'])} | {pct(row['conservative_ev_best'])} |"
                )
        lines.append("")
    lines.extend(
        [
            "## Limites",
            "",
            "Les intervalles mesurent surtout l'instabilité historique du modèle. Ils ne rendent pas prévisibles les cartons rouges, blessures pendant le match, erreurs individuelles ou variations extrêmes de finition. Une cote bookmaker peut être comparée ensuite à la cote juste, mais elle n'a pas modifié ces probabilités.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--bootstrap", type=int, default=80)
    args = parser.parse_args()

    ANALYSIS_DIR.mkdir(parents=True, exist_ok=True)
    client = ApiClient(refresh=args.refresh)

    target_payload = client.get(
        "fixtures",
        {"league": LEAGUE_ID, "season": 2026, "date": TARGET_DATE, "timezone": "Europe/Paris"},
    )
    targets = [item_to_match(item) for item in target_payload.get("response") or []]
    if len(targets) != 4:
        raise RuntimeError(f"Expected 4 K League 1 fixtures on {TARGET_DATE}, received {len(targets)}")
    targets.sort(key=lambda match: (match.date, match.fixture_id))
    cutoff = min(target.date for target in targets)

    raw_items: list[dict[str, Any]] = []
    for season in SEASONS:
        payload = client.get("fixtures", {"league": LEAGUE_ID, "season": season, "timezone": "UTC"})
        raw_items.extend(payload.get("response") or [])
    by_id = {int(item["fixture"]["id"]): item for item in raw_items}
    all_matches = [item_to_match(item) for item in by_id.values()]
    historical = sorted(
        [match for match in all_matches if match.status in COMPLETED and match.date < cutoff],
        key=lambda match: match.date,
    )
    goal_counts = {m.fixture_id: (m.home_goals, m.away_goals) for m in historical}
    teams = sorted({m.home_id for m in historical} | {m.away_id for m in historical} | {t.home_id for t in targets} | {t.away_id for t in targets})
    rest_map = rest_features(historical)

    # Batch up to 20 fixture ids, which the official API endpoint supports.
    details: dict[int, dict[str, Any]] = {}
    for group in chunks([m.fixture_id for m in historical], 20):
        payload = client.get("fixtures", {"ids": "-".join(map(str, group)), "timezone": "UTC"})
        for item in payload.get("response") or []:
            details[int(item["fixture"]["id"])] = extract_detail(item)

    sot_counts: dict[int, tuple[int, int]] = {}
    red_factors: dict[int, float] = {}
    for match in historical:
        detail = details.get(match.fixture_id) or {}
        home_sot = (detail.get("home") or {}).get("sot")
        away_sot = (detail.get("away") or {}).get("sot")
        if home_sot is not None and away_sot is not None:
            sot_counts[match.fixture_id] = (int(round(home_sot)), int(round(away_sot)))
        red_minute = detail.get("first_red_minute")
        red_factors[match.fixture_id] = (
            max(0.35, min(1.0, float(red_minute) / 90.0)) if red_minute is not None and red_minute < 75 else 1.0
        )

    dc_half_life, dc_ridge, dc_validation = choose_hyperparameters(
        historical, goal_counts, teams, rest_map, red_factors, True
    )
    ind_half_life, ind_ridge, ind_validation = choose_hyperparameters(
        historical, goal_counts, teams, rest_map, red_factors, False
    )
    if dc_validation[0]["score_log_loss"] <= ind_validation[0]["score_log_loss"]:
        use_dc = True
        half_life, ridge, validation = dc_half_life, dc_ridge, dc_validation
    else:
        use_dc = False
        half_life, ridge, validation = ind_half_life, ind_ridge, ind_validation
    league_baseline = constant_league_baseline(historical)
    goal_weight, shot_diagnostics = choose_shot_weight(
        historical,
        goal_counts,
        sot_counts,
        teams,
        rest_map,
        red_factors,
        half_life,
        ridge,
        use_dc,
    )
    final_goal_fit = fit_count_model(
        historical, goal_counts, teams, cutoff, half_life, ridge, rest_map, red_factors, use_dc
    )
    final_sot_fit = None
    if shot_diagnostics["used"] and goal_weight < 0.999:
        final_sot_fit = fit_count_model(
            historical, sot_counts, teams, cutoff, half_life, ridge, rest_map, red_factors, False
        )

    current_rests: dict[int, tuple[float, float]] = {}
    rest_details: dict[int, dict[str, Any]] = {}
    availability_by_fixture: dict[int, dict[str, Any]] = {}
    for target in targets:
        current_rests[target.fixture_id], rest_details[target.fixture_id] = current_rest_from_recent(client, target)
        availability_by_fixture[target.fixture_id] = availability(client, target.fixture_id)

    samples_by_fixture = bootstrap_predictions(
        np.random.default_rng(20260909),
        historical,
        goal_counts,
        sot_counts,
        teams,
        cutoff,
        rest_map,
        red_factors,
        half_life,
        ridge,
        goal_weight,
        targets,
        current_rests,
        final_goal_fit,
        final_sot_fit,
        use_dc,
        args.bootstrap,
    )

    standings = league_table(historical, 2026, cutoff)

    fixture_reports: list[dict[str, Any]] = []
    for target in targets:
        glh, gla, rho = predict_lambdas(final_goal_fit, target, current_rests[target.fixture_id])
        lh, la = glh, gla
        if final_sot_fit is not None and goal_weight < 0.999:
            prior_sot = [m for m in historical if m.fixture_id in sot_counts]
            conv_h = sum(goal_counts[m.fixture_id][0] for m in prior_sot) / max(
                sum(sot_counts[m.fixture_id][0] for m in prior_sot), 1
            )
            conv_a = sum(goal_counts[m.fixture_id][1] for m in prior_sot) / max(
                sum(sot_counts[m.fixture_id][1] for m in prior_sot), 1
            )
            slh, sla, _ = predict_lambdas(final_sot_fit, target, current_rests[target.fixture_id])
            lh = math.exp(goal_weight * math.log(glh) + (1 - goal_weight) * math.log(max(0.05, slh * conv_h)))
            la = math.exp(goal_weight * math.log(gla) + (1 - goal_weight) * math.log(max(0.05, sla * conv_a)))
        central_matrix = score_matrix(lh, la, rho, use_dc)
        summary = summarise_predictions(target, samples_by_fixture[target.fixture_id], central_matrix)
        summary["rest"] = rest_details[target.fixture_id]
        summary["availability"] = availability_by_fixture[target.fixture_id]
        summary["status_at_analysis"] = target.status
        summary["profiles"] = {
            "home": team_profile(
                target.home_id, "home", target, historical, details, standings, final_goal_fit
            ),
            "away": team_profile(
                target.away_id, "away", target, historical, details, standings, final_goal_fit
            ),
        }
        # Sporting probabilities are already frozen above. Odds are fetched only
        # now and cannot alter the model or its probability estimates.
        summary["prices"] = fetch_market_prices(client, target.fixture_id)
        summary["price_comparison"] = price_comparison(summary["markets"], summary["prices"])
        fixture_reports.append(summary)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "cutoff_utc": cutoff.isoformat(),
        "league_id": LEAGUE_ID,
        "target_date": TARGET_DATE,
        "data": {
            "seasons": list(SEASONS),
            "historical_matches": len(historical),
            "sot_matches": len(sot_counts),
            "sot_coverage": len(sot_counts) / max(len(historical), 1),
            "api_calls_network": client.calls,
            "api_requests_remaining": client.remaining,
        },
        "model": {
            "name": (
                "time-decayed hierarchical Dixon-Coles with optional SOT ensemble"
                if use_dc
                else "time-decayed hierarchical independent Poisson with optional SOT ensemble"
            ),
            "score_law": "Dixon-Coles" if use_dc else "Independent Poisson",
            "half_life_days": half_life,
            "ridge": ridge,
            "validation_score_log_loss": validation[0]["score_log_loss"],
            "validation_brier_1n2": validation[0]["brier_1n2"],
            "validation_grid": validation,
            "league_baseline": league_baseline,
            "challenger_comparison": {
                "dixon_coles": dc_validation[0],
                "independent_poisson": ind_validation[0],
            },
            "goal_weight": goal_weight,
            "shot_diagnostics": shot_diagnostics,
            "bootstrap_samples": min(len(next(iter(samples_by_fixture[t.fixture_id].values()))) for t in targets),
        },
        "fixtures": fixture_reports,
    }
    json_path = ANALYSIS_DIR / "analysis.json"
    markdown_path = ANALYSIS_DIR / "analysis.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    markdown_path.write_text(build_markdown(report))

    print(json.dumps({
        "targets": [f["match"] for f in fixture_reports],
        "historical_matches": len(historical),
        "sot_coverage": report["data"]["sot_coverage"],
        "half_life_days": half_life,
        "ridge": ridge,
        "goal_weight": goal_weight,
        "bootstrap_samples": report["model"]["bootstrap_samples"],
        "api_calls_network": client.calls,
        "api_requests_remaining": client.remaining,
        "json": str(json_path),
        "markdown": str(markdown_path),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
