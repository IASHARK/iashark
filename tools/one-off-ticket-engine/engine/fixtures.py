"""Fixture collection for the target date (section 4) and historical
finished-match collection for the Poisson prior (section 5)."""
from dataclasses import dataclass
from typing import Optional

from . import config


@dataclass
class Fixture:
    fixture_id: int
    league_id: int
    league_name: str
    kickoff_utc: str
    kickoff_local: str
    home_id: int
    home_name: str
    away_id: int
    away_name: str
    status: str
    round_name: str


def _is_friendly(round_name: str) -> bool:
    return "friendl" in (round_name or "").lower()


def fetch_fixtures_for_date(client, league_entries, target_date: str):
    """Returns (eligible_fixtures, excluded) for FULL_ANALYSIS leagues only."""
    eligible, excluded = [], []
    for entry in league_entries:
        if entry.coverage_status != "FULL_ANALYSIS" or entry.league_id is None:
            excluded.append({"league": entry.league_name, "reason": entry.coverage_status})
            continue
        body = client.get(
            "/fixtures",
            {
                "league": entry.league_id,
                "season": entry.season,
                "date": target_date,
                "timezone": "Europe/Paris",
            },
        )
        for item in body.get("response", []):
            fx = item["fixture"]
            status_short = fx["status"]["short"]
            round_name = item.get("league", {}).get("round", "")
            f = Fixture(
                fixture_id=fx["id"],
                league_id=entry.league_id,
                league_name=entry.league_name,
                kickoff_utc=fx["date"],
                kickoff_local=fx.get("date"),
                home_id=item["teams"]["home"]["id"],
                home_name=item["teams"]["home"]["name"],
                away_id=item["teams"]["away"]["id"],
                away_name=item["teams"]["away"]["name"],
                status=status_short,
                round_name=round_name,
            )
            if not fx.get("date", "").startswith(target_date):
                excluded.append({"fixture_id": f.fixture_id, "match": f"{f.home_name}-{f.away_name}",
                                  "reason": "OUTSIDE_EUROPE_PARIS_TARGET_DATE"})
                continue
            if status_short not in config.PRE_MATCH_STATUSES:
                excluded.append({"fixture_id": f.fixture_id, "match": f"{f.home_name}-{f.away_name}",
                                  "reason": f"STATUS_{status_short}"})
                continue
            if _is_friendly(round_name):
                excluded.append({"fixture_id": f.fixture_id, "match": f"{f.home_name}-{f.away_name}",
                                  "reason": "FRIENDLY"})
                continue
            eligible.append(f)
    return eligible, excluded


def fetch_finished_history(client, league_id: int, seasons: list, cutoff_iso: str):
    """All FT/AET/PEN matches strictly before cutoff_iso, across the given
    season years (current + N-1 + N-2 when available). No future data."""
    matches = []
    for season in seasons:
        if season is None:
            continue
        body = client.get("/fixtures", {"league": league_id, "season": season})
        for item in body.get("response", []):
            fx = item["fixture"]
            if fx["status"]["short"] not in config.FINISHED_STATUSES:
                continue
            if fx["date"] >= cutoff_iso:
                continue  # anti-leakage: strictly before the run's cutoff
            goals = item.get("goals", {})
            if goals.get("home") is None or goals.get("away") is None:
                continue
            matches.append({
                "fixture_id": fx["id"],
                "date": fx["date"],
                "season": season,
                "home_id": item["teams"]["home"]["id"],
                "home_name": item["teams"]["home"]["name"],
                "away_id": item["teams"]["away"]["id"],
                "away_name": item["teams"]["away"]["name"],
                "goals_home": goals["home"],
                "goals_away": goals["away"],
            })
    matches.sort(key=lambda m: m["date"])
    return matches
