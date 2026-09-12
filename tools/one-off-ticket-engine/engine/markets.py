"""Derives every market probability from a single score matrix P(h,a)
(sections 14 and 17) — one coherent matrix, every market consistent with it."""
import numpy as np
from . import config


def market_probabilities(P: np.ndarray, ou_lines=None, team_total_lines=None) -> dict:
    """P: square array indexed [h, a]. Returns a flat dict keyed by
    (market, selection) or (market, line, selection) -> probability."""
    ou_lines = ou_lines if ou_lines is not None else sorted(config.ALLOWED_LINES["OU"])
    team_total_lines = team_total_lines if team_total_lines is not None else sorted(config.ALLOWED_LINES["TEAM_TOTAL_HOME"])
    size = P.shape[0]
    h_idx, a_idx = np.meshgrid(np.arange(size), np.arange(size), indexing="ij")

    out = {}
    home_win = P[h_idx > a_idx].sum()
    draw = P[h_idx == a_idx].sum()
    away_win = P[h_idx < a_idx].sum()
    out[("1X2", "HOME")] = float(home_win)
    out[("1X2", "DRAW")] = float(draw)
    out[("1X2", "AWAY")] = float(away_win)

    out[("DC", "1X")] = float(home_win + draw)
    out[("DC", "X2")] = float(draw + away_win)
    out[("DC", "12")] = float(home_win + away_win)

    # DNB: WIN/PUSH/LOSS kept separate for settlement; conditional prob for comparison
    out[("DNB", "HOME_WIN")] = float(home_win)
    out[("DNB", "HOME_PUSH")] = float(draw)
    out[("DNB", "HOME_LOSS")] = float(away_win)
    out[("DNB", "AWAY_WIN")] = float(away_win)
    out[("DNB", "AWAY_PUSH")] = float(draw)
    out[("DNB", "AWAY_LOSS")] = float(home_win)
    denom = home_win + away_win
    out[("DNB", "HOME_COND")] = float(home_win / denom) if denom > 0 else float("nan")
    out[("DNB", "AWAY_COND")] = float(away_win / denom) if denom > 0 else float("nan")

    total_goals = h_idx + a_idx
    for line in ou_lines:
        over = P[total_goals > line].sum()
        out[("OU", line, "OVER")] = float(over)
        out[("OU", line, "UNDER")] = float(1 - over)

    for line in team_total_lines:
        over_h = P[h_idx > line].sum()
        out[("TEAM_TOTAL_HOME", line, "OVER")] = float(over_h)
        out[("TEAM_TOTAL_HOME", line, "UNDER")] = float(1 - over_h)
        over_a = P[a_idx > line].sum()
        out[("TEAM_TOTAL_AWAY", line, "OVER")] = float(over_a)
        out[("TEAM_TOTAL_AWAY", line, "UNDER")] = float(1 - over_a)

    btts_yes = P[(h_idx >= 1) & (a_idx >= 1)].sum()
    out[("BTTS", "YES")] = float(btts_yes)
    out[("BTTS", "NO")] = float(1 - btts_yes)

    return out


def market_indicator_matrix(size: int, market: str, selection, line=None) -> np.ndarray:
    """Boolean [h,a] indicator for a given market selection — the A_k(P)
    linear functional's coefficient matrix (section 14)."""
    h_idx, a_idx = np.meshgrid(np.arange(size), np.arange(size), indexing="ij")
    if market == "1X2":
        return {"HOME": h_idx > a_idx, "DRAW": h_idx == a_idx, "AWAY": h_idx < a_idx}[selection]
    if market == "DNB":
        return {"HOME": h_idx > a_idx, "AWAY": h_idx < a_idx}[selection]
    if market == "BTTS":
        ind = (h_idx >= 1) & (a_idx >= 1)
        return ind if selection == "YES" else ~ind
    if market == "OU":
        ind = (h_idx + a_idx) > line
        return ind if selection == "OVER" else ~ind
    if market == "TEAM_TOTAL_HOME":
        ind = h_idx > line
        return ind if selection == "OVER" else ~ind
    if market == "TEAM_TOTAL_AWAY":
        ind = a_idx > line
        return ind if selection == "OVER" else ~ind
    raise ValueError(f"unsupported market for entropy constraint: {market}")
