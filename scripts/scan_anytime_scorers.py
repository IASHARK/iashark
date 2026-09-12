#!/usr/bin/env python3
"""Scan API-Football anytime-goalscorer markets for one Paris-local date."""
from __future__ import annotations

import argparse
import json
import statistics
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "one-off-ticket-engine"))
from engine.api_client import ApiClient


SCORER_BET_IDS = {92, 218, 231}
EXCLUDED_WORDS = ("youth", "u20", "u19", "u18", "u17", "reserve", "women", "friendly")


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", required=True, help="Paris-local date, YYYY-MM-DD")
    return parser.parse_args()


def main():
    args = parse_args()
    client = ApiClient()
    fixture_body = client.get(
        "/fixtures", {"date": args.date, "timezone": "Europe/Paris"}, use_cache=False
    )
    fixtures = {}
    for item in fixture_body.get("response", []):
        fx = item["fixture"]
        label = f"{item['league']['name']} {item['league']['country']}".lower()
        if fx["status"]["short"] != "NS" or any(word in label for word in EXCLUDED_WORDS):
            continue
        if not fx.get("date", "").startswith(args.date):
            continue
        fixtures[fx["id"]] = item

    odds_entries = []
    page = 1
    while True:
        body = client.get("/odds", {"date": args.date, "page": page}, use_cache=False)
        odds_entries.extend(body.get("response", []))
        if page >= body.get("paging", {}).get("total", page):
            break
        page += 1

    grouped = defaultdict(lambda: {"odds": [], "quotes": [], "bookmakers": set()})
    for entry in odds_entries:
        fixture_id = entry["fixture"]["id"]
        if fixture_id not in fixtures:
            continue
        for bookmaker in entry.get("bookmakers", []):
            for bet in bookmaker.get("bets", []):
                if bet.get("id") not in SCORER_BET_IDS:
                    continue
                for value in bet.get("values", []):
                    try:
                        odd = float(value["odd"])
                    except (KeyError, TypeError, ValueError):
                        continue
                    player = str(value.get("value") or "").strip()
                    if not player:
                        continue
                    key = (fixture_id, player.casefold())
                    grouped[key]["odds"].append(odd)
                    grouped[key]["bookmakers"].add(bookmaker["name"])
                    grouped[key]["quotes"].append(
                        {
                            "bookmaker": bookmaker["name"],
                            "bet_id": bet["id"],
                            "bet_name": bet["name"],
                            "player": player,
                            "odd": odd,
                            "updated": entry.get("update"),
                        }
                    )

    rows = []
    for (fixture_id, _player_key), data in grouped.items():
        item = fixtures[fixture_id]
        odds = data["odds"]
        best_quote = max(data["quotes"], key=lambda quote: quote["odd"])
        rows.append(
            {
                "fixture_id": fixture_id,
                "kickoff": item["fixture"]["date"],
                "league": item["league"]["name"],
                "country": item["league"]["country"],
                "home": item["teams"]["home"]["name"],
                "away": item["teams"]["away"]["name"],
                "player": best_quote["player"],
                "median_odds": round(statistics.median(odds), 3),
                "best_odds": best_quote["odd"],
                "best_bookmaker": best_quote["bookmaker"],
                "bookmaker_count": len(data["bookmakers"]),
                "latest_update": max(
                    (quote["updated"] for quote in data["quotes"] if quote["updated"]),
                    default=None,
                ),
            }
        )
    rows.sort(key=lambda row: (-row["bookmaker_count"], row["median_odds"], row["kickoff"]))

    result = {
        "date": args.date,
        "timezone": "Europe/Paris",
        "eligible_senior_fixtures": len(fixtures),
        "odds_entries": len(odds_entries),
        "fixtures_with_anytime_scorer_quotes": len({row["fixture_id"] for row in rows}),
        "player_rows": len(rows),
        "players": rows,
    }
    output = Path(f"data/one-off-ticket-engine/anytime-scorers-{args.date}.json")
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({key: result[key] for key in result if key != "players"}, indent=2))
    for row in rows[:40]:
        print(
            f"{row['kickoff']} | {row['home']} - {row['away']} | {row['player']} | "
            f"median {row['median_odds']:.2f} best {row['best_odds']:.2f} | books {row['bookmaker_count']}"
        )
    print(output.resolve())


if __name__ == "__main__":
    main()
