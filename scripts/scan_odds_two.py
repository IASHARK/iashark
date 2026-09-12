#!/usr/bin/env python3
"""Conservative market-consensus scout for an accumulator near decimal 2.00."""
from __future__ import annotations

import json
import math
import statistics
import sys
import argparse
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "tools" / "one-off-ticket-engine"))
from engine.api_client import ApiClient

EXCLUDED_WORDS = ("youth", "u20", "u19", "u18", "u17", "reserve", "women", "friendly")
BET_NAMES = {"Match Winner", "Double Chance", "Home/Away", "Goals Over/Under", "Both Teams Score", "Total - Home", "Total - Away"}


def med_mad(values):
    med = statistics.median(values)
    mad = statistics.median(abs(x - med) for x in values)
    return med, 1.4826 * mad


def parse_args():
    parser = argparse.ArgumentParser(description="Conservative market-consensus scout near decimal odds 2.00")
    parser.add_argument("--date", required=True, help="Target date in YYYY-MM-DD")
    return parser.parse_args()


def main():
    args = parse_args()
    target_date = args.date
    api = ApiClient()
    fixtures_body = api.get("/fixtures", {"date": target_date, "timezone": "Europe/Paris"}, use_cache=False)
    fixtures = {x["fixture"]["id"]: x for x in fixtures_body.get("response", [])
                if x["fixture"]["status"]["short"] == "NS"}
    pages = []
    page = 1
    while True:
        body = api.get("/odds", {"date": target_date, "page": page}, use_cache=False)
        pages.extend(body.get("response", []))
        if page >= body.get("paging", {}).get("total", page):
            break
        page += 1

    raw = defaultdict(lambda: {"odds": [], "probs": [], "books": set()})
    leagues_seen = set()
    eligible_fixtures = set()
    for entry in pages:
        fid = entry["fixture"]["id"]
        fx = fixtures.get(fid)
        if not fx:
            continue
        label = f"{fx['league']['name']} {fx['league']['country']}".lower()
        if any(word in label for word in EXCLUDED_WORDS):
            continue
        leagues_seen.add((fx["league"]["id"], fx["league"]["name"], fx["league"]["country"]))
        eligible_fixtures.add(fid)
        for bm in entry.get("bookmakers", []):
            book = bm["name"]
            bets = {b["name"]: b for b in bm.get("bets", []) if b["name"] in BET_NAMES}
            # 1X2 fair probabilities.
            if "Match Winner" in bets:
                vals = {v["value"]: float(v["odd"]) for v in bets["Match Winner"]["values"]}
                if all(k in vals for k in ("Home", "Draw", "Away")):
                    inv = {k: 1 / vals[k] for k in ("Home", "Draw", "Away")}
                    z = sum(inv.values())
                    fair = {k: inv[k] / z for k in inv}
                    for sel in fair:
                        key = (fid, "1X2", sel)
                        raw[key]["odds"].append(vals[sel]); raw[key]["probs"].append(fair[sel]); raw[key]["books"].add(book)

                    if "Home/Away" in bets:
                        dnb = {v["value"]: float(v["odd"]) for v in bets["Home/Away"]["values"]}
                        if "Home" in dnb and "Away" in dnb:
                            ih, ia = 1 / dnb["Home"], 1 / dnb["Away"]
                            for sel, prob in (("Home", ih / (ih + ia)), ("Away", ia / (ih + ia))):
                                key = (fid, "DNB", sel)
                                raw[key]["odds"].append(dnb[sel]); raw[key]["probs"].append(prob); raw[key]["books"].add(book)
                    if "Double Chance" in bets:
                        dc = {v["value"]: float(v["odd"]) for v in bets["Double Chance"]["values"]}
                        mapping = {"Home/Draw": fair["Home"] + fair["Draw"],
                                   "Home/Away": fair["Home"] + fair["Away"],
                                   "Draw/Away": fair["Draw"] + fair["Away"]}
                        for sel, prob in mapping.items():
                            if sel in dc:
                                key = (fid, "Double Chance", sel)
                                raw[key]["odds"].append(dc[sel]); raw[key]["probs"].append(prob); raw[key]["books"].add(book)

            for market in ("Goals Over/Under", "Total - Home", "Total - Away"):
                if market not in bets:
                    continue
                vals = {v["value"]: float(v["odd"]) for v in bets[market]["values"]}
                lines = (0.5, 1.5, 2.5, 3.5, 4.5) if market == "Goals Over/Under" else (0.5, 1.5, 2.5, 3.5)
                for line in lines:
                    over, under = f"Over {line}", f"Under {line}"
                    if over not in vals or under not in vals:
                        continue
                    io, iu = 1 / vals[over], 1 / vals[under]
                    for sel, prob in ((over, io / (io + iu)), (under, iu / (io + iu))):
                        key = (fid, market, sel)
                        raw[key]["odds"].append(vals[sel]); raw[key]["probs"].append(prob); raw[key]["books"].add(book)

            if "Both Teams Score" in bets:
                vals = {v["value"]: float(v["odd"]) for v in bets["Both Teams Score"]["values"]}
                if "Yes" in vals and "No" in vals:
                    iy, ino = 1 / vals["Yes"], 1 / vals["No"]
                    for sel, prob in (("Yes", iy / (iy + ino)), ("No", ino / (iy + ino))):
                        key = (fid, "Both Teams Score", sel)
                        raw[key]["odds"].append(vals[sel]); raw[key]["probs"].append(prob); raw[key]["books"].add(book)

    candidates_by_fixture = defaultdict(list)
    all_candidates = []
    for (fid, market, selection), data in raw.items():
        if len(data["books"]) < 5:
            continue
        odd, odd_disp = med_mad(data["odds"])
        prob, prob_disp = med_mad(data["probs"])
        robust = max(0.01, prob - 0.75 * prob_disp)
        if not (1.10 <= odd <= 1.65 and robust >= 0.67):
            continue
        fx = fixtures[fid]
        c = {
            "fixture_id": fid,
            "match": f"{fx['teams']['home']['name']} - {fx['teams']['away']['name']}",
            "league": fx["league"]["name"], "country": fx["league"]["country"],
            "kickoff": fx["fixture"]["date"], "market": market, "selection": selection,
            "median_odds": round(odd, 3), "median_fair_probability": round(prob, 4),
            "robust_probability": round(robust, 4), "bookmakers": len(data["books"]),
            "odds_dispersion": round(odd_disp, 4),
        }
        candidates_by_fixture[fid].append(c)
        all_candidates.append(c)

    # Keep up to four strongest distinct market choices per fixture.
    groups = []
    for fid, cs in candidates_by_fixture.items():
        cs.sort(key=lambda c: (c["robust_probability"], -abs(c["median_odds"] - 1.3)), reverse=True)
        groups.append(cs[:4])

    states = [(1.0, 1.0, [])]
    for group in groups:
        expanded = list(states)
        for odd_prod, p_prod, legs in states:
            if len(legs) >= 5:
                continue
            for c in group:
                no = odd_prod * c["median_odds"]
                if no <= 2.15:
                    expanded.append((no, p_prod * c["robust_probability"], legs + [c]))
        # Preserve the best probability in tight odds/cardinality bins.
        best = {}
        for state in expanded:
            key = (len(state[2]), round(state[0], 3))
            if key not in best or state[1] > best[key][1]:
                best[key] = state
        states = sorted(best.values(), key=lambda s: s[1], reverse=True)[:12000]

    tickets = [s for s in states if 1.95 <= s[0] <= 2.10 and 2 <= len(s[2]) <= 5]
    tickets.sort(key=lambda s: (s[1], -abs(s[0] - 2.0)), reverse=True)
    result = {
        "date": target_date,
        "fixtures_found": len(fixtures),
        "odds_fixtures": len(pages),
        "senior_competitions_with_odds_examined": len(leagues_seen),
        "competitions": [{"id": i, "name": n, "country": c} for i, n, c in sorted(leagues_seen)],
        "candidate_legs": len(all_candidates),
        "top_tickets": [
            {"combined_median_odds": round(o, 3), "robust_joint_probability_independence": round(p, 4), "legs": legs}
            for o, p, legs in tickets[:20]
        ],
        "warning": "Market-consensus screen, not a guarantee. Cross-fixture dependence is not modelled.",
    }
    out = Path(f"data/one-off-ticket-engine/odds-two-{target_date}.json")
    out.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(json.dumps({k: result[k] for k in ("fixtures_found", "odds_fixtures", "senior_competitions_with_odds_examined", "candidate_legs")}, indent=2))
    print(json.dumps(result["top_tickets"][:5], ensure_ascii=False, indent=2))
    print(out.resolve())


if __name__ == "__main__":
    main()
