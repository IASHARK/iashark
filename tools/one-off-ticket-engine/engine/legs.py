"""Builds the candidate-leg pool: one row per (fixture, market, selection[,
line]) that is actually tradeable, priced, and probability-backed (sections
17, 20-22)."""
import math
from dataclasses import dataclass, field
from typing import Optional

from . import config
from .markets import market_probabilities

BETTABLE_SELECTIONS = {
    "1X2": ["HOME", "DRAW", "AWAY"],
    "DC": ["1X", "X2", "12"],
    "DNB": ["HOME", "AWAY"],
    "BTTS": ["YES", "NO"],
}


@dataclass
class Leg:
    fixture_id: int
    league_name: str
    home_name: str
    away_name: str
    kickoff_utc: str
    market: str
    selection: str
    line: Optional[float]
    exec_odds: float
    exec_bookmaker: str
    bookmaker_mode: str
    mean_p: float
    robust_log_p: float
    p_geometric: float
    p10: float
    p90: float
    sd: float
    n_bookmakers: int
    data_quality: str
    stage: str = "STAGE1"
    # SMOOTH_ACCUMULATOR diagnostics (section 6/7/12 of the 2026-09-05 correction)
    model_p: Optional[float] = None       # pure statistical Q-matrix probability (pre market-anchoring)
    fair_market_p: Optional[float] = None  # devigged bookmaker-consensus probability for this exact selection
    edge: Optional[float] = None           # model_p - fair_market_p
    quality_tier: Optional[str] = None     # A / B / C from robust_p thresholds
    uncertainty_tag: Optional[str] = None  # "UNCERTAINTY_TOO_HIGH" or None


def _prob_key(market, selection, line):
    if market == "DNB":
        return ("DNB", f"{selection}_COND")
    if line is not None:
        return (market, line, selection)
    return (market, selection)


def _quality_tag(n_bm, sd):
    if n_bm >= 4 and (sd is None or sd < 0.08):
        return "HIGH"
    if n_bm >= 2:
        return "MEDIUM"
    return "LOW"


def _resolve_exec_odds(fixture_id, market, line, selection, raw_odds, bookmaker_mode, bookmaker_name):
    key = (fixture_id, market, line)
    by_bm = raw_odds.get(key, {})
    if bookmaker_mode == "SINGLE_BOOK":
        odds = by_bm.get(bookmaker_name, {}).get(selection)
        if odds is None:
            return None, None
        return odds, bookmaker_name
    # BEST_PRICE_RESEARCH
    candidates = {bm: sel_map[selection] for bm, sel_map in by_bm.items() if selection in sel_map}
    if not candidates:
        return None, None
    best_bm = max(candidates, key=lambda b: candidates[b])
    return candidates[best_bm], best_bm


def build_legs(fixtures, market_probs_by_fixture, bootstrap_by_fixture, raw_odds,
               consensus_by_key, bookmaker_mode, bookmaker_name,
               ou_lines=None, team_total_lines=None) -> list:
    ou_lines = ou_lines or sorted(config.ALLOWED_LINES["OU"])
    team_total_lines = team_total_lines or sorted(config.ALLOWED_LINES["TEAM_TOTAL_HOME"])
    legs = []

    for fx in fixtures:
        mkts = market_probs_by_fixture.get(fx.fixture_id)
        boot = bootstrap_by_fixture.get(fx.fixture_id)
        if mkts is None or boot is None:
            continue

        candidates = []
        for sel in BETTABLE_SELECTIONS["1X2"]:
            candidates.append(("1X2", sel, None))
        for sel in BETTABLE_SELECTIONS["DC"]:
            candidates.append(("DC", sel, None))
        for sel in BETTABLE_SELECTIONS["DNB"]:
            candidates.append(("DNB", sel, None))
        for sel in BETTABLE_SELECTIONS["BTTS"]:
            candidates.append(("BTTS", sel, None))
        for line in ou_lines:
            candidates.append(("OU", "OVER", line))
            candidates.append(("OU", "UNDER", line))
        for line in team_total_lines:
            candidates.append(("TEAM_TOTAL_HOME", "OVER", line))
            candidates.append(("TEAM_TOTAL_HOME", "UNDER", line))
            candidates.append(("TEAM_TOTAL_AWAY", "OVER", line))
            candidates.append(("TEAM_TOTAL_AWAY", "UNDER", line))

        for market, selection, line in candidates:
            odds, bm = _resolve_exec_odds(fx.fixture_id, market, line, selection, raw_odds, bookmaker_mode, bookmaker_name)
            if odds is None or odds <= 1.0:
                continue

            prob_key = _prob_key(market, selection, line)
            p_point = mkts.get(prob_key)
            boot_stat = boot.get(prob_key)
            if p_point is None or boot_stat is None or not math.isfinite(p_point):
                continue

            if market == "DC":
                n_bm = len({b for b, m in raw_odds.get((fx.fixture_id, "DC", None), {}).items() if selection in m})
            else:
                cp = consensus_by_key.get((fx.fixture_id, market, line, selection))
                n_bm = cp.bookmaker_count if cp else 0

            quality = _quality_tag(n_bm, boot_stat.get("sd"))
            legs.append(Leg(
                fixture_id=fx.fixture_id, league_name=fx.league_name,
                home_name=fx.home_name, away_name=fx.away_name, kickoff_utc=fx.kickoff_utc,
                market=market, selection=selection, line=line,
                exec_odds=odds, exec_bookmaker=bm, bookmaker_mode=bookmaker_mode,
                mean_p=boot_stat["mean_p"], robust_log_p=boot_stat["robust_log_p"],
                p_geometric=boot_stat["p_geometric"], p10=boot_stat["p10"], p90=boot_stat["p90"],
                sd=boot_stat["sd"], n_bookmakers=n_bm, data_quality=quality,
            ))
    return legs
