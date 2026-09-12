#!/usr/bin/env python3
"""Generate written scenarios and Remotion props for tomorrow's UCL fixtures."""
from __future__ import annotations

import importlib.util
import json
import math
import sys
from pathlib import Path


REPO = Path(__file__).resolve().parents[1]
LEAN_PATH = Path("/Users/clement/Downloads/simulate_match_lean.py")
sys.path.insert(0, str(REPO / "tools" / "one-off-ticket-engine"))
sys.path.insert(0, str(LEAN_PATH.parent))
spec = importlib.util.spec_from_file_location("lean_official", LEAN_PATH)
lean = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(lean)
sm = lean.sm

# The supplied lean file references this helper, but the supplied base module
# is missing it. This is the intended likelihood of each goal's 15' bucket.
def trace_minute_plausibility(goals, mult_h, mult_a):
    score = 0.0
    for goal in goals:
        table = mult_h if goal["team"] == "home" else mult_a
        multiplier = sm.bucket_multiplier_for_minute(table, goal["minute"])
        score += math.log(max(multiplier, 0.05))
    return score


sm.trace_minute_plausibility = trace_minute_plausibility
lean.N_SIMULATIONS = 10_000

FIXTURES = [1635741, 1635628, 1635686, 1635705, 1635736, 1635698]
SLUGS = {
    1635741: "stuttgart-viking",
    1635628: "barcelona-feyenoord",
    1635686: "liverpool-atletico",
    1635705: "psg-slovan",
    1635736: "sporting-galatasaray",
    1635698: "napoli-arsenal",
}


def main():
    scenarios = []
    props_entries = []
    for index, fixture_id in enumerate(FIXTURES):
        result = lean.simulate(fixture_id, 9000 + index)
        scenarios.append(result)
        props_entries.append({
            "id": "Ucl" + "".join(part.capitalize() for part in SLUGS[fixture_id].split("-")),
            "slug": SLUGS[fixture_id],
            "props": {
                "homeTeam": result["homeTeam"],
                "awayTeam": result["awayTeam"],
                "homeLogo": result["homeLogoUrl"],
                "awayLogo": result["awayLogoUrl"],
                "goals": [
                    {
                        "minute": goal["minute"],
                        "displayMinute": goal.get("minuteLabel", f"{goal['minute']}'").rstrip("'"),
                        "player": "",
                        "side": goal["team"],
                    }
                    for goal in result["goals"]
                ],
                "accentColor": "#08d9ff",
            },
        })
        print(f"{result['homeTeam']} {result['final_score']['home']}-{result['final_score']['away']} {result['awayTeam']}", flush=True)

    out_dir = REPO / "data" / "match-simulation" / "2026-09-09"
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "scenarios.json").write_text(json.dumps(scenarios, ensure_ascii=False, indent=2))

    ts_path = REPO / "remotion-score-template" / "src" / "generated-ucl-2026-09-09.ts"
    ts_path.write_text(
        'import type {MatchCardProps} from "./Composition";\n\n'
        + "export const uclSeptember9 = "
        + json.dumps(props_entries, ensure_ascii=False, indent=2)
        + " satisfies Array<{id: string; slug: string; props: MatchCardProps}>;\n"
    )
    print(f"SCENARIOS={out_dir / 'scenarios.json'}")
    print(f"PROPS={ts_path}")


if __name__ == "__main__":
    main()
