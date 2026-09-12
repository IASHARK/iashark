"""Odds ingestion (section 9-11). Only pre-match, allow-listed markets;
no synthetic price ever becomes an executable one."""
import time
from dataclasses import dataclass, field
from typing import Optional

from . import config


@dataclass
class OddsQuote:
    fixture_id: int
    bookmaker: str
    market: str          # canonical family: 1X2 / DC / DNB / OU / BTTS / TEAM_TOTAL_HOME / TEAM_TOTAL_AWAY / AH
    selection: str        # e.g. "HOME", "DRAW", "AWAY", "OVER_2.5", "UNDER_2.5", "YES", "NO", "1X", "X2", "12"
    line: Optional[float]  # threshold for OU/team-total/AH markets, else None
    raw_odds: float
    retrieved_at: str
    source: str = "api-sports:/odds"


def _classify_ou_selection(value: str):
    # "Over 2.5" / "Under 2.5"
    parts = value.split()
    if len(parts) != 2:
        return None, None
    side, line_s = parts
    try:
        line = float(line_s)
    except ValueError:
        return None, None
    return ("OVER" if side.lower() == "over" else "UNDER"), line


def _classify_1x2(value: str):
    return {"Home": "HOME", "Draw": "DRAW", "Away": "AWAY"}.get(value)


def _classify_dc(value: str):
    return {"Home/Draw": "1X", "Draw/Away": "X2", "Home/Away": "12"}.get(value)


def _classify_dnb(value: str):
    return {"Home": "HOME", "Away": "AWAY"}.get(value)


def _classify_btts(value: str):
    return {"Yes": "YES", "No": "NO"}.get(value)


def fetch_odds_for_fixtures(client, fixtures: list) -> list:
    quotes = []
    for fx in fixtures:
        body = client.get("/odds", {"fixture": fx.fixture_id})
        resp = body.get("response", [])
        if not resp:
            continue
        retrieved_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        for bm in resp[0].get("bookmakers", []):
            bm_name = bm["name"]
            for bet in bm.get("bets", []):
                bet_name = bet["name"]
                if bet_name not in config.ALLOWED_MARKET_NAMES:
                    continue
                if any(sub in bet_name for sub in config.DISALLOWED_NAME_SUBSTRINGS):
                    continue
                family = config.ALLOWED_MARKET_NAMES[bet_name]
                if family == "AH" and not config.ASIAN_HANDICAP_ENABLED:
                    continue
                for v in bet.get("values", []):
                    try:
                        odd = float(v["odd"])
                    except (KeyError, ValueError):
                        continue
                    if odd <= 1.0:
                        continue  # invalid odds, never executable
                    selection, line = _parse_selection(family, v["value"])
                    if selection is None:
                        continue
                    if family in config.ALLOWED_LINES and line not in config.ALLOWED_LINES[family]:
                        continue
                    quotes.append(OddsQuote(
                        fixture_id=fx.fixture_id, bookmaker=bm_name, market=family,
                        selection=selection, line=line, raw_odds=odd,
                        retrieved_at=retrieved_at,
                    ))
    return quotes


def _parse_selection(family: str, value: str):
    if family == "1X2":
        return _classify_1x2(value), None
    if family == "DC":
        return _classify_dc(value), None
    if family == "DNB":
        return _classify_dnb(value), None
    if family == "BTTS":
        return _classify_btts(value), None
    if family in ("OU", "TEAM_TOTAL_HOME", "TEAM_TOTAL_AWAY"):
        return _classify_ou_selection(value)
    if family == "AH":
        return value, None  # kept raw; disabled in V1 anyway
    return None, None
