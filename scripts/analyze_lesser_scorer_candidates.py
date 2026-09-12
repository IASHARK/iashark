#!/usr/bin/env python3
"""Collect current evidence for lesser-known anytime-scorer candidates."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools" / "one-off-ticket-engine"))

from engine.api_client import ApiClient


CANDIDATES = {
    "Lucas Vennegoor of Hesselink",
    "Roger Martinez",
    "Shumaira Mheuka",
    "Youssef Chermiti",
    "K. Høgh",
    "Christian Wagner",
    "Alexander Johansson",
    "Findlay Curtis",
    "Everton Bala",
    "Aitor Cantalapiedra",
    "Saad Al Sharfa",
    "Bruma",
    "Carlos Vicente",
    "Micah Mbick",
    "Alisson Safira",
}


def player_stats(client: ApiClient, player_id: int, team_id: int, season: int) -> list[dict]:
    body = client.get(
        "/players",
        {"id": player_id, "team": team_id, "season": season},
        use_cache=False,
    )
    response = body.get("response", [])
    if not response:
        return []
    rows = []
    for stat in response[0].get("statistics", []):
        games = stat.get("games") or {}
        goals = stat.get("goals") or {}
        shots = stat.get("shots") or {}
        penalty = stat.get("penalty") or {}
        rows.append(
            {
                "league_id": (stat.get("league") or {}).get("id"),
                "league": (stat.get("league") or {}).get("name"),
                "appearances": games.get("appearences"),
                "starts": games.get("lineups"),
                "minutes": games.get("minutes"),
                "rating": games.get("rating"),
                "position": games.get("position"),
                "goals": goals.get("total"),
                "assists": goals.get("assists"),
                "shots": shots.get("total"),
                "shots_on": shots.get("on"),
                "pens_scored": penalty.get("scored"),
                "pens_missed": penalty.get("missed"),
            }
        )
    return rows


def recent_team(client: ApiClient, team_id: int) -> list[dict]:
    body = client.get(
        "/fixtures",
        {"team": team_id, "last": 8, "timezone": "Europe/Paris"},
        use_cache=False,
    )
    rows = []
    for item in body.get("response", []):
        status = (item.get("fixture", {}).get("status") or {}).get("short")
        if status not in {"FT", "AET", "PEN"}:
            continue
        is_home = item["teams"]["home"]["id"] == team_id
        gf = item["goals"]["home" if is_home else "away"]
        ga = item["goals"]["away" if is_home else "home"]
        rows.append(
            {
                "date": item["fixture"]["date"],
                "competition": item["league"]["name"],
                "opponent": item["teams"]["away" if is_home else "home"]["name"],
                "venue": "home" if is_home else "away",
                "gf": gf,
                "ga": ga,
            }
        )
    return rows


def main() -> None:
    verified_path = ROOT / "data" / "one-off-ticket-engine" / "verified-anytime-scorers-2026-09-09.json"
    verified = json.loads(verified_path.read_text())["verified"]
    selected = []
    seen = set()
    for row in verified:
        if row["player"] not in CANDIDATES or row["player"] in seen:
            continue
        seen.add(row["player"])
        selected.append(row)

    client = ApiClient()
    team_cache: dict[int, list[dict]] = {}
    results = []
    for row in selected:
        fixture_body = client.get("/fixtures", {"id": row["fixture_id"]}, use_cache=False)
        fixture = fixture_body.get("response", [])[0]
        league = fixture["league"]
        opponent_side = "away" if row["side"] == "home" else "home"
        opponent_id = fixture["teams"][opponent_side]["id"]
        for team_id in (row["team_id"], opponent_id):
            if team_id not in team_cache:
                team_cache[team_id] = recent_team(client, team_id)
        results.append(
            {
                **row,
                "league_id": league["id"],
                "season": league["season"],
                "current_player_stats": player_stats(
                    client, row["player_id"], row["team_id"], league["season"]
                ),
                "previous_player_stats": player_stats(
                    client, row["player_id"], row["team_id"], league["season"] - 1
                ),
                "team_recent": team_cache[row["team_id"]],
                "opponent_id": opponent_id,
                "opponent_recent": team_cache[opponent_id],
            }
        )

    output = ROOT / "data" / "one-off-ticket-engine" / "lesser-scorer-analysis-2026-09-09.json"
    output.write_text(json.dumps({"date": "2026-09-09", "candidates": results}, ensure_ascii=False, indent=2))
    print(output)
    for row in results:
        current = [s for s in row["current_player_stats"] if s["league_id"] == row["league_id"]]
        print(
            row["player"], row["home"], row["away"], row["median_odds"],
            current, "team_recent", row["team_recent"], "opp_recent", row["opponent_recent"]
        )


if __name__ == "__main__":
    main()
