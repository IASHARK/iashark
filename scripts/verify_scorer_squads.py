#!/usr/bin/env python3
"""Cross-check scanned scorer names against current API-Football squads."""
from __future__ import annotations

import argparse
import json
import sys
import unicodedata
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "one-off-ticket-engine"))
from engine.api_client import ApiClient


def norm(value: str) -> str:
    return " ".join(
        unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().casefold().split()
    )


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True)
    return parser.parse_args()


def main():
    args = parse_args()
    root = Path(__file__).resolve().parents[1]
    source_path = root / "data" / "one-off-ticket-engine" / f"anytime-scorers-{args.date}.json"
    source = json.loads(source_path.read_text())
    client = ApiClient()

    fixtures_body = client.get(
        "/fixtures", {"date": args.date, "timezone": "Europe/Paris"}, use_cache=True
    )
    fixtures = {item["fixture"]["id"]: item for item in fixtures_body.get("response", [])}
    scorer_fixture_ids = {row["fixture_id"] for row in source["players"]}
    team_ids = sorted(
        {
            item["teams"][side]["id"]
            for fixture_id, item in fixtures.items()
            if fixture_id in scorer_fixture_ids
            for side in ("home", "away")
        }
    )

    squad_by_team = {}
    for team_id in team_ids:
        body = client.get("/players/squads", {"team": team_id}, use_cache=False)
        squad_by_team[team_id] = {
            norm(player.get("name", "")): player
            for group in body.get("response", [])
            for player in group.get("players", [])
            if player.get("name")
        }

    verified, rejected = [], []
    for row in source["players"]:
        item = fixtures.get(row["fixture_id"])
        if not item:
            rejected.append({**row, "squad_reason": "fixture_not_found"})
            continue
        player_key = norm(row["player"])
        match = None
        for side in ("home", "away"):
            team = item["teams"][side]
            player = squad_by_team.get(team["id"], {}).get(player_key)
            if player:
                match = {
                    "side": side,
                    "team_id": team["id"],
                    "team": team["name"],
                    "player_id": player.get("id"),
                    "position": player.get("position"),
                    "number": player.get("number"),
                }
                break
        if match:
            verified.append({**row, **match, "current_squad_verified": True})
        else:
            rejected.append({**row, "current_squad_verified": False, "squad_reason": "not_in_either_current_squad"})

    verified.sort(key=lambda row: (-row["bookmaker_count"], row["median_odds"], row["kickoff"]))
    result = {
        "date": args.date,
        "fixtures_checked": len(scorer_fixture_ids),
        "teams_checked": len(team_ids),
        "raw_player_rows": len(source["players"]),
        "verified_player_rows": len(verified),
        "rejected_player_rows": len(rejected),
        "verified": verified,
        "rejected": rejected,
    }
    output = root / "data" / "one-off-ticket-engine" / f"verified-anytime-scorers-{args.date}.json"
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({key: result[key] for key in result if key not in ("verified", "rejected")}, indent=2))
    for row in verified[:50]:
        print(
            f"{row['kickoff']} | {row['home']} - {row['away']} | {row['player']} ({row['team']}) | "
            f"median {row['median_odds']:.2f} best {row['best_odds']:.2f} | {row['position']}"
        )
    print(output)


if __name__ == "__main__":
    main()
