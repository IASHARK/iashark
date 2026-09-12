"""Orchestrates per-bookmaker devig then robust cross-bookmaker consensus
(sections 12-13). Never averages raw odds first."""
import statistics
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from .devig import shin_probabilities, two_way_devig


@dataclass
class ConsensusPoint:
    fixture_id: int
    market: str
    selection: str
    line: Optional[float]
    median: float
    mad: float
    dispersion: float  # 1.4826 * MAD
    min_p: float
    max_p: float
    bookmaker_count: int
    best_exec_odds: float
    best_exec_bookmaker: str
    exec_odds_by_bookmaker: dict


def _key(sel_key):
    return sel_key


def compute_fair_probs_per_bookmaker(quotes: list):
    """Returns dict: (fixture_id, market, line) -> bookmaker -> {selection: fair_p}
    plus raw executable odds under the same nesting."""
    fair = defaultdict(lambda: defaultdict(dict))
    raw = defaultdict(lambda: defaultdict(dict))

    # 1X2: 3-way Shin per (fixture, bookmaker)
    grouped_1x2 = defaultdict(dict)
    for q in quotes:
        if q.market == "1X2":
            grouped_1x2[(q.fixture_id, q.bookmaker)][q.selection] = q.raw_odds
    for (fixture_id, bm), sel_odds in grouped_1x2.items():
        order = ["HOME", "DRAW", "AWAY"]
        odds_list = [sel_odds.get(s) for s in order if s in sel_odds]
        sels = [s for s in order if s in sel_odds]
        if len(sels) < 3:
            continue  # incomplete 1X2 triple from this bookmaker: unusable for devig
        probs, converged = shin_probabilities(odds_list)
        if probs is None:
            continue
        for s, p, o in zip(sels, probs, odds_list):
            fair[(fixture_id, "1X2", None)][bm][s] = p
            raw[(fixture_id, "1X2", None)][bm][s] = o

    # 2-way families: DNB, BTTS, OU (per line), TEAM_TOTAL_HOME/AWAY (per line)
    two_way_families = {"DNB", "BTTS"}
    lined_two_way_families = {"OU", "TEAM_TOTAL_HOME", "TEAM_TOTAL_AWAY"}
    complements = {
        "DNB": ("HOME", "AWAY"), "BTTS": ("YES", "NO"),
        "OU": ("OVER", "UNDER"), "TEAM_TOTAL_HOME": ("OVER", "UNDER"), "TEAM_TOTAL_AWAY": ("OVER", "UNDER"),
    }
    grouped_2way = defaultdict(dict)
    for q in quotes:
        if q.market in two_way_families:
            grouped_2way[(q.fixture_id, q.market, None, q.bookmaker)][q.selection] = q.raw_odds
        elif q.market in lined_two_way_families:
            grouped_2way[(q.fixture_id, q.market, q.line, q.bookmaker)][q.selection] = q.raw_odds

    for (fixture_id, market, line, bm), sel_odds in grouped_2way.items():
        a_key, b_key = complements[market]
        if a_key not in sel_odds or b_key not in sel_odds:
            continue
        pa, pb = two_way_devig(sel_odds[a_key], sel_odds[b_key])
        fair[(fixture_id, market, line)][bm][a_key] = pa
        fair[(fixture_id, market, line)][bm][b_key] = pb
        raw[(fixture_id, market, line)][bm][a_key] = sel_odds[a_key]
        raw[(fixture_id, market, line)][bm][b_key] = sel_odds[b_key]

    # Double Chance: no devig, raw executable odds only (probability comes from the score matrix later)
    grouped_dc = defaultdict(dict)
    for q in quotes:
        if q.market == "DC":
            raw[(q.fixture_id, "DC", None)].setdefault(q.bookmaker, {})[q.selection] = q.raw_odds

    return fair, raw


def build_consensus(fair_probs: dict, raw_odds: dict) -> list:
    points = []
    for (fixture_id, market, line), by_bm in fair_probs.items():
        selections = set()
        for bm_map in by_bm.values():
            selections.update(bm_map.keys())
        for sel in selections:
            values = [(bm, p[sel]) for bm, p in by_bm.items() if sel in p]
            if not values:
                continue
            probs = [v for _, v in values]
            median = statistics.median(probs)
            mad = statistics.median([abs(p - median) for p in probs]) if len(probs) > 1 else 0.0
            exec_odds_by_bm = {
                bm: raw_odds.get((fixture_id, market, line), {}).get(bm, {}).get(sel)
                for bm, _ in values
            }
            exec_odds_by_bm = {k: v for k, v in exec_odds_by_bm.items() if v is not None}
            if not exec_odds_by_bm:
                continue
            best_bm = max(exec_odds_by_bm, key=lambda b: exec_odds_by_bm[b])
            points.append(ConsensusPoint(
                fixture_id=fixture_id, market=market, selection=sel, line=line,
                median=median, mad=mad, dispersion=1.4826 * mad,
                min_p=min(probs), max_p=max(probs), bookmaker_count=len(values),
                best_exec_odds=exec_odds_by_bm[best_bm], best_exec_bookmaker=best_bm,
                exec_odds_by_bookmaker=exec_odds_by_bm,
            ))
    return points
