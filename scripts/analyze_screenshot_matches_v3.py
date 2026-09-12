#!/usr/bin/env python3
"""Pre-match V3 analysis for the fixtures shown in the user's screenshots.

The script deliberately separates the sporting model from prices:

1. Fit one time-decayed attack/defence model per competition using only
   finished fixtures before the earliest target kickoff in that competition.
2. Build Dixon-Coles score matrices and derive all goal/result markets.
3. De-vig multi-bookmaker prices, anchor the score matrix by relative entropy,
   and bootstrap the bookmaker panel to obtain conservative probabilities.
4. Estimate event-count markets (corners/cards/shots/SOT/fouls/offsides) from
   recent match statistics, with several sensitivity variants and an empirical
   beta-posterior lower bound.
5. Reject cosmetic "safe" lines and solve exact five-leg, same-bookmaker,
   one-leg-per-match accumulators in the 1.90-2.10 total-odds window.

It is a one-day research artifact. It does not claim guaranteed profitability.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pulp


REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools" / "one-off-ticket-engine"))
sys.path.insert(0, str(REPO / "scripts"))

from engine.api_client import ApiClient  # noqa: E402
from engine.bootstrap import bootstrap_fixture  # noqa: E402
from engine.consensus import build_consensus, compute_fair_probs_per_bookmaker  # noqa: E402
from engine.entropy_matrix import build_constraints, solve_entropy_matrix  # noqa: E402
from engine.fixtures import Fixture, fetch_finished_history  # noqa: E402
from engine.legs import build_legs  # noqa: E402
from engine.markets import market_probabilities  # noqa: E402
from engine.odds import fetch_odds_for_fixtures  # noqa: E402
from engine.poisson_model import fit_league_model, select_hyperparameters, team_lambdas  # noqa: E402
from engine.score_matrix import build_score_matrix, fit_dixon_coles_rho  # noqa: E402
from engine.smooth_filters import annotate_legs  # noqa: E402

import analyze_ucl_all_markets_ticket as event_core  # noqa: E402


OUT_DIR = REPO / "data" / "analysis" / "2026-09-09-screenshot-v3"
OUT_JSON = OUT_DIR / "analysis.json"
OUT_MD = OUT_DIR / "analysis.md"

# 41 rows visible in the two screenshots. York United is the API identity for
# the row displayed by the bookmaker as "Inter Toronto - Pacific FC".
TARGET_IDS = (
    1509181, 1509182, 1559994, 1547594, 1603023, 1513626, 1513627,
    1513628, 1582774, 1635628, 1635741, 1552142, 1509178, 1559993,
    1600345, 1603024, 1603025, 1563152, 1563153, 1556644, 1556645,
    1575469, 1631510, 1490452, 1490459, 1490456, 1490457, 1490454,
    1490460, 1490461, 1490458, 1490455, 1490451, 1490465, 1490464,
    1490453, 1490462, 1549685, 1631506, 1631507, 1517343,
)

STATUS_OK = {"NS"}
FINISHED = {"FT", "AET", "PEN"}

GOAL_LABELS = {
    ("1X2", "HOME", None): "Victoire domicile",
    ("1X2", "DRAW", None): "Match nul",
    ("1X2", "AWAY", None): "Victoire extérieure",
    ("DC", "1X", None): "Double chance 1X",
    ("DC", "X2", None): "Double chance X2",
    ("DC", "12", None): "Pas de match nul (12)",
    ("DNB", "HOME", None): "Domicile remboursé si nul",
    ("DNB", "AWAY", None): "Extérieur remboursé si nul",
    ("BTTS", "YES", None): "Les deux équipes marquent",
    ("BTTS", "NO", None): "Les deux équipes ne marquent pas",
}


def fixture_label(item: dict[str, Any]) -> str:
    return f"{item['teams']['home']['name']} – {item['teams']['away']['name']}"


def pct(value: float | None) -> str:
    return "n/a" if value is None else f"{100.0 * value:.1f}%"


def raw_fixture_to_dataclass(item: dict[str, Any]) -> Fixture:
    fx = item["fixture"]
    return Fixture(
        fixture_id=int(fx["id"]),
        league_id=int(item["league"]["id"]),
        league_name=str(item["league"]["name"]),
        kickoff_utc=str(fx["date"]),
        kickoff_local=str(fx["date"]),
        home_id=int(item["teams"]["home"]["id"]),
        home_name=str(item["teams"]["home"]["name"]),
        away_id=int(item["teams"]["away"]["id"]),
        away_name=str(item["teams"]["away"]["name"]),
        status=str(fx["status"]["short"]),
        round_name=str(item.get("league", {}).get("round") or ""),
    )


def load_targets(client: ApiClient, refresh: bool) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    rows: dict[int, dict[str, Any]] = {}
    for date in ("2026-09-09", "2026-09-10"):
        body = client.get(
            "/fixtures", {"date": date, "timezone": "Europe/Paris"}, use_cache=not refresh
        )
        for item in body.get("response", []):
            fid = int(item["fixture"]["id"])
            if fid in TARGET_IDS:
                rows[fid] = item
    missing = sorted(set(TARGET_IDS) - set(rows))
    if missing:
        raise RuntimeError(f"Target fixtures unavailable: {missing}")
    ordered = [rows[fid] for fid in TARGET_IDS]
    eligible, excluded = [], []
    for item in ordered:
        status = item["fixture"]["status"]["short"]
        if status not in STATUS_OK:
            excluded.append({
                "fixture_id": int(item["fixture"]["id"]),
                "match": fixture_label(item),
                "status": status,
                "reason": "statut non pré-match",
            })
        else:
            eligible.append(item)
    return eligible, excluded


def fit_goal_models(
    client: ApiClient, items: list[dict[str, Any]], bootstrap_draws: int
) -> dict[str, Any]:
    fixtures = [raw_fixture_to_dataclass(item) for item in items]
    item_by_id = {int(item["fixture"]["id"]): item for item in items}
    by_league: dict[int, list[Fixture]] = defaultdict(list)
    for fx in fixtures:
        by_league[fx.league_id].append(fx)

    models, league_diagnostics = {}, {}
    q_by_fixture, tails, lambdas = {}, {}, {}
    for league_id, league_fixtures in by_league.items():
        sample_item = item_by_id[league_fixtures[0].fixture_id]
        season = int(sample_item["league"]["season"])
        cutoff_iso = min(fx.kickoff_utc for fx in league_fixtures)
        seasons = [season, season - 1, season - 2]
        history = fetch_finished_history(client, league_id, seasons, cutoff_iso)
        half_life, ridge, cv = select_hyperparameters(league_id, history, cutoff_iso)
        if half_life is None:
            half_life, ridge = 180, 1.0
        model = fit_league_model(league_id, history, cutoff_iso, half_life, ridge)
        mwl = []
        for match in history:
            lh, la, _ = team_lambdas(model, match["home_id"], match["away_id"])
            mwl.append((match["goals_home"], match["goals_away"], lh, la, 1.0))
        rho, fitted = fit_dixon_coles_rho(mwl)
        models[league_id] = model
        league_diagnostics[league_id] = {
            "league": league_fixtures[0].league_name,
            "season": season,
            "history_matches": len(history),
            "half_life_days": half_life,
            "ridge": ridge,
            "cv_rows": len(cv),
            "low_confidence": model.low_confidence,
            "rho": rho,
            "rho_fitted": fitted,
        }
        print(
            f"goal model {league_fixtures[0].league_name}: n={len(history)} "
            f"H={half_life} ridge={ridge} low={model.low_confidence}",
            flush=True,
        )
        for fx in league_fixtures:
            lh, la, unseen = team_lambdas(model, fx.home_id, fx.away_id)
            q, tail, size, acceptable = build_score_matrix(lh, la, rho)
            q_by_fixture[fx.fixture_id] = q
            tails[fx.fixture_id] = {
                "tail_mass": tail,
                "grid_size": size,
                "acceptable": acceptable,
                "unseen_team": unseen,
            }
            lambdas[fx.fixture_id] = {"home": lh, "away": la}

    # A fresh odds snapshot is written to the cache first. All downstream
    # consumers then read exactly this immutable snapshot.
    raw_odds_payloads = {}
    for index, fx in enumerate(fixtures, start=1):
        raw_odds_payloads[fx.fixture_id] = client.get(
            "/odds", {"fixture": fx.fixture_id}, use_cache=False
        )
        if index % 10 == 0:
            print(f"fresh odds {index}/{len(fixtures)}", flush=True)

    quotes = fetch_odds_for_fixtures(client, fixtures)
    fair_by_key, raw_by_key = compute_fair_probs_per_bookmaker(quotes)
    consensus_points = build_consensus(fair_by_key, raw_by_key)
    consensus_by_key = {
        (c.fixture_id, c.market, c.line, c.selection): c for c in consensus_points
    }

    p_by_fixture, market_probs, boot = {}, {}, {}
    for index, fx in enumerate(fixtures, start=1):
        points = [c for c in consensus_points if c.fixture_id == fx.fixture_id]
        p, diag = solve_entropy_matrix(q_by_fixture[fx.fixture_id], build_constraints(points))
        p_by_fixture[fx.fixture_id] = p
        market_probs[fx.fixture_id] = market_probabilities(p)
        boot[fx.fixture_id] = bootstrap_fixture(
            fx.fixture_id,
            q_by_fixture[fx.fixture_id],
            fair_by_key,
            bootstrap_draws,
            2026090900 + fx.fixture_id,
        )
        tails[fx.fixture_id]["entropy"] = diag
        if index % 10 == 0:
            print(f"market bootstrap {index}/{len(fixtures)}", flush=True)

    return {
        "fixtures": fixtures,
        "models": models,
        "league_diagnostics": league_diagnostics,
        "q_by_fixture": q_by_fixture,
        "p_by_fixture": p_by_fixture,
        "market_probs": market_probs,
        "bootstrap": boot,
        "lambdas": lambdas,
        "tails": tails,
        "quotes": quotes,
        "fair_by_key": fair_by_key,
        "raw_by_key": raw_by_key,
        "consensus_by_key": consensus_by_key,
        "raw_odds_payloads": raw_odds_payloads,
    }


def batched_recent_event_data(
    client: ApiClient, items: list[dict[str, Any]], cutoff: datetime, lookback: int = 20
) -> tuple[dict[int, list[dict[str, Any]]], int]:
    team_ids = sorted({int(side["id"]) for item in items for side in item["teams"].values()})
    fixture_rows: dict[int, dict[str, Any]] = {}
    team_fixture_ids: dict[int, list[int]] = defaultdict(list)
    for index, team_id in enumerate(team_ids, start=1):
        body = client.get("/fixtures", {"team": team_id, "last": lookback})
        valid = []
        for item in body.get("response", []):
            when = event_core.parse_date(item["fixture"]["date"])
            if when >= cutoff or item["fixture"]["status"]["short"] not in FINISHED:
                continue
            valid.append(item)
        valid.sort(key=lambda row: event_core.parse_date(row["fixture"]["date"]), reverse=True)
        for item in valid[:lookback]:
            fid = int(item["fixture"]["id"])
            fixture_rows[fid] = item
            team_fixture_ids[team_id].append(fid)
        if index % 20 == 0:
            print(f"recent team histories {index}/{len(team_ids)}", flush=True)

    details: dict[int, dict[str, Any]] = {}
    ids = sorted(fixture_rows)
    for start in range(0, len(ids), 20):
        group = ids[start : start + 20]
        body = client.get("/fixtures", {"ids": "-".join(map(str, group)), "timezone": "UTC"})
        for item in body.get("response", []):
            details[int(item["fixture"]["id"])] = item
        if start and start % 200 == 0:
            print(f"batched fixture details {min(start + 20, len(ids))}/{len(ids)}", flush=True)

    stats_by_fixture: dict[int, dict[int, dict[str, float | None]]] = {}
    for fid, detail in details.items():
        sides = {}
        for row in detail.get("statistics", []):
            values = {
                stat["type"]: event_core.number(stat.get("value"))
                for stat in row.get("statistics", [])
            }
            sides[int(row["team"]["id"])] = {
                metric: values.get(api_name)
                for metric, api_name in event_core.METRICS.items()
            }
        stats_by_fixture[fid] = sides

    histories: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for team_id, fixture_ids in team_fixture_ids.items():
        for fid in fixture_ids:
            row = fixture_rows[fid]
            home_id = int(row["teams"]["home"]["id"])
            away_id = int(row["teams"]["away"]["id"])
            opponent_id = away_id if team_id == home_id else home_id
            sides = stats_by_fixture.get(fid, {})
            if team_id not in sides or opponent_id not in sides:
                continue
            histories[team_id].append({
                "fixture_id": fid,
                "date": event_core.parse_date(row["fixture"]["date"]),
                "is_home": team_id == home_id,
                "for": sides[team_id],
                "against": sides[opponent_id],
            })
        histories[team_id].sort(key=lambda row: row["date"], reverse=True)
    return histories, len(details)


def goal_label(leg) -> str:
    exact = GOAL_LABELS.get((leg.market, leg.selection, leg.line))
    if exact:
        return exact
    if leg.market == "OU":
        return f"{'Plus' if leg.selection == 'OVER' else 'Moins'} de {leg.line:g} buts"
    if leg.market == "TEAM_TOTAL_HOME":
        side = leg.home_name
        return f"{side}: {'plus' if leg.selection == 'OVER' else 'moins'} de {leg.line:g} but"
    if leg.market == "TEAM_TOTAL_AWAY":
        side = leg.away_name
        return f"{side}: {'plus' if leg.selection == 'OVER' else 'moins'} de {leg.line:g} but"
    return f"{leg.market} {leg.selection}"


def meaningful_goal_leg(leg) -> bool:
    # No cosmetic near-certainties. The engine never ingests team lines above
    # 2.5 or match totals above 4.5, and this price floor removes @1.01 fillers.
    if not (1.12 <= leg.exec_odds <= 1.55):
        return False
    if leg.market == "OU":
        allowed = {
            ("OVER", 1.5), ("OVER", 2.5),
            ("UNDER", 2.5), ("UNDER", 3.5), ("UNDER", 4.5),
        }
        if (leg.selection, leg.line) not in allowed:
            return False
    if leg.market in {"TEAM_TOTAL_HOME", "TEAM_TOTAL_AWAY"} and leg.line is not None:
        if leg.line > 2.5:
            return False
    return True


def build_goal_candidates(state: dict[str, Any]) -> list[dict[str, Any]]:
    bookmaker_names = sorted({q.bookmaker for q in state["quotes"]})
    candidates = []
    model_probs = {
        fid: market_probabilities(matrix) for fid, matrix in state["q_by_fixture"].items()
    }
    for bookmaker in bookmaker_names:
        legs = build_legs(
            state["fixtures"], state["market_probs"], state["bootstrap"],
            state["raw_by_key"], state["consensus_by_key"], "SINGLE_BOOK", bookmaker,
        )
        annotate_legs(legs, model_probs, state["consensus_by_key"])
        for leg in legs:
            if not meaningful_goal_leg(leg):
                continue
            safe = min(float(leg.p10), float(leg.p_geometric))
            if leg.model_p is not None:
                # Keep the market from laundering an extreme disagreement into
                # apparent certainty, without mechanically taking the lower of
                # two noisy point estimates.
                safe = min(safe, float(leg.model_p) + 0.03)
            market_gap = (
                abs(float(leg.model_p) - float(leg.fair_market_p))
                if leg.model_p is not None and leg.fair_market_p is not None
                else None
            )
            candidates.append({
                "fixture_id": leg.fixture_id,
                "match": f"{leg.home_name} – {leg.away_name}",
                "kickoff": leg.kickoff_utc,
                "league": leg.league_name,
                "bookmaker": bookmaker,
                "market": leg.market,
                "selection": leg.selection,
                "line": leg.line,
                "label": goal_label(leg),
                "family": "goals",
                "odds": float(leg.exec_odds),
                "central_probability": float(leg.p_geometric),
                "safe_probability": max(0.0, safe),
                "model_probability": leg.model_p,
                "market_probability": leg.fair_market_p,
                "market_gap": market_gap,
                "p10": float(leg.p10),
                "coverage": int(leg.n_bookmakers),
                "data_quality": leg.data_quality,
            })
    return candidates


def build_event_candidates(
    items: list[dict[str, Any]], raw_odds_payloads: dict[int, dict[str, Any]],
    histories: dict[int, list[dict[str, Any]]], event_probs: dict[int, Any],
) -> list[dict[str, Any]]:
    item_by_id = {int(item["fixture"]["id"]): item for item in items}
    rows = []
    for fid, payload in raw_odds_payloads.items():
        response = payload.get("response") or []
        if not response or fid not in item_by_id:
            continue
        item = item_by_id[fid]
        for bookmaker in response[0].get("bookmakers", []):
            for bet in bookmaker.get("bets", []):
                bet_id = int(bet["id"])
                if bet_id not in event_core.EVENT_MARKETS:
                    continue
                metric, scope = event_core.EVENT_MARKETS[bet_id]
                # Team-comparison markets have no direct empirical lower-bound
                # estimator in this one-day tool, so only count totals survive.
                if scope == "1x2":
                    continue
                for offer in bet.get("values", []):
                    value = str(offer.get("value"))
                    try:
                        odds = float(offer["odd"])
                    except (TypeError, ValueError, KeyError):
                        continue
                    if not (1.12 <= odds <= 1.55):
                        continue
                    probabilities = [
                        event_core.event_probability(variant, scope, value)
                        for variant in event_probs[fid][metric]
                    ]
                    probabilities = [p for p in probabilities if p is not None]
                    if len(probabilities) != len(event_core.VARIANTS):
                        continue
                    empirical, empirical_n = event_core.empirical_event_lower_bound(
                        item, histories, metric, scope, value
                    )
                    coverage = min(
                        min(v["n_home"], v["n_away"])
                        for v in event_probs[fid][metric]
                    )
                    market_p = event_core.no_vig_probability(bet, value)
                    if empirical is None or market_p is None:
                        continue
                    model_low = min(probabilities)
                    safe = min(model_low, empirical, market_p)
                    rows.append({
                        "fixture_id": fid,
                        "match": fixture_label(item),
                        "kickoff": item["fixture"]["date"],
                        "league": item["league"]["name"],
                        "bookmaker": bookmaker["name"],
                        "market": bet["name"],
                        "selection": value,
                        "line": None,
                        "label": f"{bet['name']}: {value}",
                        "family": metric,
                        "odds": odds,
                        "central_probability": float(np.mean(probabilities)),
                        "safe_probability": float(safe),
                        "model_probability": float(np.mean(probabilities)),
                        "market_probability": float(market_p),
                        "market_gap": abs(float(np.mean(probabilities)) - float(market_p)),
                        "p10": float(empirical),
                        "coverage": int(coverage),
                        "empirical_sample": int(empirical_n),
                        "data_quality": "HIGH" if coverage >= 15 and empirical_n >= 24 else "MEDIUM",
                    })
    return rows


def candidate_accepted(row: dict[str, Any]) -> bool:
    if not (1.12 <= row["odds"] <= 1.55):
        return False
    if row["safe_probability"] < 0.68:
        return False
    if row["central_probability"] < 0.72:
        return False
    if row["market_gap"] is not None and row["market_gap"] > 0.14:
        return False
    if row["coverage"] < 2 and row["family"] == "goals":
        return False
    if row["family"] != "goals":
        if row.get("coverage", 0) < 12 or row.get("empirical_sample", 0) < 16:
            return False
    # Do not require a claimed positive edge, but reject a clearly overpriced
    # leg after the conservative haircut.
    if row["safe_probability"] * row["odds"] < 0.90:
        return False
    return True


def deduplicate_candidates(candidates: list[dict[str, Any]]) -> list[dict[str, Any]]:
    best = {}
    for row in candidates:
        if not candidate_accepted(row):
            continue
        key = (
            row["bookmaker"], row["fixture_id"], row["market"],
            row["selection"], row.get("line"), row["label"],
        )
        old = best.get(key)
        if old is None or (row["safe_probability"], row["odds"]) > (
            old["safe_probability"], old["odds"]
        ):
            best[key] = row
    return list(best.values())


def solve_ticket_pool(
    candidates: list[dict[str, Any]], min_odds: float = 1.90,
    max_odds: float = 2.10, legs_count: int = 5, max_per_bookmaker: int = 80,
) -> list[dict[str, Any]]:
    by_book: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in candidates:
        by_book[row["bookmaker"]].append(row)
    tickets = []
    for bookmaker, rows in by_book.items():
        # Cap each fixture to its best eight distinct markets before the MILP.
        compact = []
        for _, fixture_rows in _group_by(rows, lambda r: r["fixture_id"]).items():
            fixture_rows.sort(
                key=lambda r: (r["safe_probability"], r["safe_probability"] * r["odds"]),
                reverse=True,
            )
            compact.extend(fixture_rows[:8])
        if len({r["fixture_id"] for r in compact}) < legs_count:
            continue
        exclusions: list[tuple[int, ...]] = []
        for _ in range(max_per_bookmaker):
            problem = pulp.LpProblem(f"ticket_{bookmaker}", pulp.LpMaximize)
            x = {i: pulp.LpVariable(f"x_{i}", cat="Binary") for i in range(len(compact))}
            problem += pulp.lpSum(
                x[i] * math.log(max(compact[i]["safe_probability"], 1e-9)) for i in x
            )
            log_odds = pulp.lpSum(x[i] * math.log(compact[i]["odds"]) for i in x)
            problem += pulp.lpSum(x.values()) == legs_count
            problem += log_odds >= math.log(min_odds)
            problem += log_odds <= math.log(max_odds)
            for _, indexes in _group_by(list(x), lambda i: compact[i]["fixture_id"]).items():
                problem += pulp.lpSum(x[i] for i in indexes) <= 1
            for excluded in exclusions:
                problem += pulp.lpSum(x[i] for i in excluded) <= len(excluded) - 1
            problem.solve(pulp.PULP_CBC_CMD(msg=0))
            if pulp.LpStatus[problem.status] != "Optimal":
                break
            chosen = tuple(sorted(i for i in x if pulp.value(x[i]) > 0.5))
            exclusions.append(chosen)
            legs = [compact[i] for i in chosen]
            tickets.append({
                "bookmaker": bookmaker,
                "odds": float(math.prod(row["odds"] for row in legs)),
                "safe_joint_probability": float(math.prod(row["safe_probability"] for row in legs)),
                "central_joint_probability": float(math.prod(row["central_probability"] for row in legs)),
                "legs": legs,
            })
    tickets.sort(
        key=lambda row: (row["safe_joint_probability"], row["central_joint_probability"]),
        reverse=True,
    )
    return tickets


def diversified_tickets(pool: list[dict[str, Any]], count: int = 3) -> list[dict[str, Any]]:
    if not pool:
        return []
    selected = [pool[0]]
    while len(selected) < count:
        best = None
        for ticket in pool:
            if ticket in selected:
                continue
            selections = {
                (leg["fixture_id"], leg["market"], leg["selection"], leg.get("line"))
                for leg in ticket["legs"]
            }
            okay = True
            for old in selected:
                old_selections = {
                    (leg["fixture_id"], leg["market"], leg["selection"], leg.get("line"))
                    for leg in old["legs"]
                }
                if len(selections & old_selections) > 1:
                    okay = False
                    break
            if okay and (best is None or ticket["safe_joint_probability"] > best["safe_joint_probability"]):
                best = ticket
        if best is None:
            break
        selected.append(best)
    return selected


def _group_by(values, key):
    output = defaultdict(list)
    for value in values:
        output[key(value)].append(value)
    return output


def per_match_summary(
    items: list[dict[str, Any]], excluded: list[dict[str, Any]],
    candidates: list[dict[str, Any]], state: dict[str, Any],
) -> list[dict[str, Any]]:
    by_fixture = _group_by(candidates, lambda row: row["fixture_id"])
    excluded_by_id = {row["fixture_id"]: row for row in excluded}
    output = []
    for fid in TARGET_IDS:
        if fid in excluded_by_id:
            output.append({
                "fixture_id": fid,
                "match": excluded_by_id[fid]["match"],
                "status": excluded_by_id[fid]["status"],
                "decision": "EXCLU",
                "reason": excluded_by_id[fid]["reason"],
                "best_market": None,
            })
            continue
        fixture = next(fx for fx in state["fixtures"] if fx.fixture_id == fid)
        rows = by_fixture.get(fid, [])
        # Compare a selection once at its best executable price; safety remains
        # bookmaker-independent because it came from the multi-book bootstrap.
        selection_best = {}
        for row in rows:
            key = (row["market"], row["selection"], row.get("line"), row["label"])
            old = selection_best.get(key)
            if old is None or row["odds"] > old["odds"]:
                selection_best[key] = row
        ranked = sorted(
            selection_best.values(),
            key=lambda row: (row["safe_probability"], row["safe_probability"] * row["odds"]),
            reverse=True,
        )
        output.append({
            "fixture_id": fid,
            "match": f"{fixture.home_name} – {fixture.away_name}",
            "status": fixture.status,
            "decision": "QUALIFIE" if ranked else "AUCUN_MARCHE_V3",
            "reason": None if ranked else "aucun marché ne franchit tous les filtres prudents",
            "lambda_home": state["lambdas"][fid]["home"],
            "lambda_away": state["lambdas"][fid]["away"],
            "best_market": ranked[0] if ranked else None,
            "alternatives": ranked[1:4],
        })
    return output


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Analyse V3 des matchs des captures — 9/10 septembre 2026",
        "",
        f"Générée le `{report['generated_at']}`. Snapshot de prix : `{report['odds_snapshot_at']}`.",
        "",
        "Le modèle sportif a été calculé avant l'optimisation des tickets. Une cote n'est jamais une garantie.",
        "",
        "## Contrôle des 41 affiches",
        "",
        "| Match | xG modèle | Meilleur marché V3 | P prudente | Meilleure cote | Décision |",
        "|---|---:|---|---:|---:|---|",
    ]
    for row in report["matches"]:
        market = row.get("best_market")
        xg = "—" if row.get("lambda_home") is None else f"{row['lambda_home']:.2f}–{row['lambda_away']:.2f}"
        lines.append(
            f"| {row['match']} | {xg} | {market['label'] if market else '—'} | "
            f"{pct(market['safe_probability']) if market else '—'} | "
            f"@{market['odds']:.2f} ({market['bookmaker']})" if market else
            f"| {row['match']} | {xg} | — | — | —"
        )
        if lines[-1].count("|") < 6:
            lines[-1] += f" | {row['decision']} |"
        elif not lines[-1].endswith("|"):
            lines[-1] += f" | {row['decision']} |"
    lines.extend(["", "## Combinés optimisés", ""])
    if not report["tickets"]:
        lines.append("Aucun combiné ne respecte simultanément toutes les contraintes V3.")
    for index, ticket in enumerate(report["tickets"], start=1):
        lines.extend([
            f"### Ticket {index} — {ticket['bookmaker']}",
            "",
            "| Match | Sélection | Cote | P prudente | Famille |",
            "|---|---|---:|---:|---|",
        ])
        for leg in ticket["legs"]:
            lines.append(
                f"| {leg['match']} | {leg['label']} | @{leg['odds']:.2f} | "
                f"{pct(leg['safe_probability'])} | {leg['family']} |"
            )
        lines.extend([
            "",
            f"- Cote totale : **@{ticket['odds']:.2f}** ({len(ticket['legs'])} sélections)",
            f"- Probabilité jointe prudente : **{pct(ticket['safe_joint_probability'])}**",
            f"- Probabilité jointe centrale : **{pct(ticket['central_joint_probability'])}**",
            "",
        ])
    lines.extend([
        "## Méthode et limites",
        "",
        f"- {report['counts']['eligible_fixtures']} rencontres pré-match analysées sur 41 ; "
        f"{report['counts']['excluded_fixtures']} exclue(s) par statut.",
        f"- {report['counts']['goal_candidates']} candidats buts/résultat et "
        f"{report['counts']['event_candidates']} candidats événementiels avant filtre final.",
        f"- {report['counts']['accepted_candidates']} candidats ont franchi tous les filtres V3.",
        "- Les marchés événementiels exigent au moins 12 observations par équipe, un échantillon empirique suffisant et l'accord du prix sans marge.",
        "- Les lignes cosmétiques et les sélections inférieures à @1.12 sont interdites.",
        "- Le produit des probabilités suppose l'indépendance entre rencontres ; les événements extrêmes restent imprévisibles.",
        "",
    ])
    return "\n".join(lines)


def serialise(value: Any):
    if isinstance(value, dict):
        return {str(key): serialise(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [serialise(item) for item in value]
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (np.floating, np.integer)):
        return value.item()
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bootstrap", type=int, default=100)
    parser.add_argument("--refresh-fixtures", action="store_true")
    parser.add_argument("--skip-events", action="store_true")
    parser.add_argument("--ticket-min", type=float, default=1.90)
    parser.add_argument("--ticket-max", type=float, default=2.10)
    parser.add_argument("--leg-counts", default="5")
    parser.add_argument("--pool-per-book", type=int, default=80)
    parser.add_argument("--output-suffix", default="")
    args = parser.parse_args()

    output_dir = OUT_DIR if not args.output_suffix else OUT_DIR.parent / f"{OUT_DIR.name}-{args.output_suffix}"
    output_json = output_dir / "analysis.json"
    output_md = output_dir / "analysis.md"
    output_dir.mkdir(parents=True, exist_ok=True)
    client = ApiClient()
    items, excluded = load_targets(client, args.refresh_fixtures)
    print(f"targets eligible={len(items)} excluded={len(excluded)}", flush=True)
    state = fit_goal_models(client, items, args.bootstrap)
    goal_candidates = build_goal_candidates(state)

    event_candidates = []
    event_history_count = 0
    if not args.skip_events:
        cutoff = min(event_core.parse_date(item["fixture"]["date"]) for item in items)
        histories, event_history_count = batched_recent_event_data(client, items, cutoff)
        event_probs = event_core.event_probabilities(items, histories, cutoff)
        event_candidates = build_event_candidates(
            items, state["raw_odds_payloads"], histories, event_probs
        )

    accepted = deduplicate_candidates(goal_candidates + event_candidates)
    leg_counts = sorted({int(value.strip()) for value in args.leg_counts.split(",") if value.strip()})
    pool = []
    for leg_count in leg_counts:
        pool.extend(solve_ticket_pool(
            accepted,
            min_odds=args.ticket_min,
            max_odds=args.ticket_max,
            legs_count=leg_count,
            max_per_bookmaker=args.pool_per_book,
        ))
    pool.sort(
        key=lambda row: (row["safe_joint_probability"], row["central_joint_probability"]),
        reverse=True,
    )
    chosen = diversified_tickets(pool, 3)
    matches = per_match_summary(items, excluded, accepted, state)

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "odds_snapshot_at": datetime.now(timezone.utc).isoformat(),
        "method": {
            "goals": "per-competition time-decayed Poisson attack/defence; chronological hyperparameter selection; Dixon-Coles low-score correction; multi-book relative-entropy anchoring; bookmaker-panel bootstrap",
            "events": "recency-weighted negative-binomial variants with venue/opponent blending, shrinkage and empirical beta-posterior lower bound",
            "ticket": (
                f"exact MILP; {leg_counts} distinct-fixture leg counts; same bookmaker; "
                f"total odds {args.ticket_min:.2f}-{args.ticket_max:.2f}; individual odds "
                "1.12-1.55; maximize product of prudent probabilities"
            ),
        },
        "counts": {
            "listed_fixtures": len(TARGET_IDS),
            "eligible_fixtures": len(items),
            "excluded_fixtures": len(excluded),
            "goal_candidates": len(goal_candidates),
            "event_candidates": len(event_candidates),
            "accepted_candidates": len(accepted),
            "ticket_pool": len(pool),
            "event_history_fixtures": event_history_count,
        },
        "excluded": excluded,
        "league_diagnostics": state["league_diagnostics"],
        "matches": matches,
        "tickets": chosen,
        "top_ticket_pool": pool[:30],
    }
    output_json.write_text(json.dumps(serialise(report), ensure_ascii=False, indent=2))
    output_md.write_text(build_markdown(report))
    print(json.dumps({
        "json": str(output_json),
        "markdown": str(output_md),
        "counts": report["counts"],
        "tickets": [
            {
                "bookmaker": row["bookmaker"],
                "odds": row["odds"],
                "safe_joint_probability": row["safe_joint_probability"],
            }
            for row in chosen
        ],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
