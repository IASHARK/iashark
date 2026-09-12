#!/usr/bin/env python3
"""Generate K League 1 scenarios and Remotion props with the official lean simulator."""
from __future__ import annotations

import importlib.util
import json
import math
import sys
import urllib.request
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
LEAN_PATH = Path("/Users/clement/Downloads/simulate_match_lean.py")
sys.path.insert(0, str(REPO / "tools" / "one-off-ticket-engine"))
sys.path.insert(0, str(LEAN_PATH.parent))
spec = importlib.util.spec_from_file_location("lean_official_kleague1", LEAN_PATH)
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
lean.N_SIMULATIONS = 10_000

FIXTURES = [1507060, 1507061, 1507062, 1507063]
SLUGS = {
    1507060: "daejeon-anyang",
    1507061: "gangwon-jeonbuk",
    1507062: "gwangju-jeju",
    1507063: "pohang-gimcheon",
}


def local_logo(team_id: int, source: str) -> str:
    relative = Path("logos") / f"team-{team_id}.png"
    target = REPO / "remotion-score-template" / "public" / relative
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        urllib.request.urlretrieve(source, target)
    return relative.as_posix()


def composition_id(slug: str) -> str:
    return "KLeague1" + "".join(part.capitalize() for part in slug.split("-"))


def main():
    scenarios = []
    props_entries = []
    for index, fixture_id in enumerate(FIXTURES):
        result = lean.simulate(fixture_id, 9200 + index)
        scenarios.append(result)

        fixture = sm.client.get("/fixtures", {"id": fixture_id})["response"][0]
        home = fixture["teams"]["home"]
        away = fixture["teams"]["away"]
        slug = SLUGS[fixture_id]
        props_entries.append(
            {
                "id": composition_id(slug),
                "slug": slug,
                "props": {
                    "homeTeam": result["homeTeam"],
                    "awayTeam": result["awayTeam"],
                    "homeLogo": local_logo(home["id"], home["logo"]),
                    "awayLogo": local_logo(away["id"], away["logo"]),
                    "goals": [
                        {
                            "minute": goal["minute"],
                            "displayMinute": goal.get(
                                "minuteLabel", f"{goal['minute']}'"
                            ).rstrip("'"),
                            "player": "",
                            "side": goal["team"],
                        }
                        for goal in result["goals"]
                    ],
                    "accentColor": "#08d9ff",
                },
            }
        )
        print(
            f"{result['homeTeam']} {result['final_score']['home']}-"
            f"{result['final_score']['away']} {result['awayTeam']}",
            flush=True,
        )

    out_dir = REPO / "data" / "match-simulation" / "2026-09-09-kleague1"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "scenarios.json").write_text(
        json.dumps(scenarios, ensure_ascii=False, indent=2)
    )

    ts_path = (
        REPO
        / "remotion-score-template"
        / "src"
        / "generated-kleague1-2026-09-09.ts"
    )
    ts_path.write_text(
        'import type {MatchCardProps} from "./Composition";\n\n'
        + "export const kLeague1September9 = "
        + json.dumps(props_entries, ensure_ascii=False, indent=2)
        + " satisfies Array<{id: string; slug: string; props: MatchCardProps}>;\n"
    )
    print(f"SCENARIOS={out_dir / 'scenarios.json'}")
    print(f"PROPS={ts_path}")


if __name__ == "__main__":
    main()
