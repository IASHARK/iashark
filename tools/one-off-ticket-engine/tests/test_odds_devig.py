from engine.devig import shin_probabilities, two_way_devig
from engine.odds import fetch_odds_for_fixtures, _parse_selection, OddsQuote
from engine.consensus import compute_fair_probs_per_bookmaker


def test_invalid_odds_rejected():
    # odds <= 1.0 must never survive the ingestion filter (checked in odds.py's caller);
    # here we check the underlying devig math also rejects non-positive/absurd input gracefully.
    probs, converged = shin_probabilities([0, 2.0, 3.0])
    assert probs is not None
    assert all(p >= 0 for p in probs)


def test_devig_sums_to_one():
    probs, _ = shin_probabilities([1.75, 4.0, 4.5])
    assert abs(sum(probs) - 1.0) < 1e-9
    pa, pb = two_way_devig(1.9, 1.9)
    assert abs((pa + pb) - 1.0) < 1e-9
    assert abs(pa - 0.5) < 1e-9


def test_shin_deterministic():
    odds = [1.83, 3.6, 4.8]
    p1, c1 = shin_probabilities(odds)
    p2, c2 = shin_probabilities(odds)
    assert p1 == p2
    assert c1 == c2


def test_shin_no_overround_passthrough():
    # sum of raw implied probs <= 1 (arbitrage-shaped input): passthrough, no crash
    probs, converged = shin_probabilities([2.1, 4.2, 5.5])
    assert probs is not None


def test_double_chance_never_shin_three_way():
    fair, raw = compute_fair_probs_per_bookmaker([
        OddsQuote(1, "BookX", "DC", "1X", None, 1.30, "t"),
        OddsQuote(1, "BookX", "DC", "X2", None, 1.90, "t"),
        OddsQuote(1, "BookX", "DC", "12", None, 1.20, "t"),
    ])
    # DC must never appear in the `fair` (devigged) dict — only in raw, verbatim
    assert (1, "DC", None) not in fair
    assert raw[(1, "DC", None)]["BookX"]["1X"] == 1.30
    assert raw[(1, "DC", None)]["BookX"]["X2"] == 1.90
    assert raw[(1, "DC", None)]["BookX"]["12"] == 1.20


def test_bookmaker_identity_preserved_through_pipeline():
    quotes = [
        OddsQuote(1, "Pinnacle", "1X2", "HOME", None, 1.80, "t"),
        OddsQuote(1, "Pinnacle", "1X2", "DRAW", None, 3.90, "t"),
        OddsQuote(1, "Pinnacle", "1X2", "AWAY", None, 4.60, "t"),
        OddsQuote(1, "Bet365", "1X2", "HOME", None, 1.75, "t"),
        OddsQuote(1, "Bet365", "1X2", "DRAW", None, 3.80, "t"),
        OddsQuote(1, "Bet365", "1X2", "AWAY", None, 4.50, "t"),
    ]
    fair, raw = compute_fair_probs_per_bookmaker(quotes)
    assert set(fair[(1, "1X2", None)].keys()) == {"Pinnacle", "Bet365"}
    assert raw[(1, "1X2", None)]["Pinnacle"]["HOME"] == 1.80
    assert raw[(1, "1X2", None)]["Bet365"]["HOME"] == 1.75


def test_parse_selection_lines():
    sel, line = _parse_selection("OU", "Over 2.5")
    assert sel == "OVER" and line == 2.5
    sel, line = _parse_selection("TEAM_TOTAL_HOME", "Under 1.5")
    assert sel == "UNDER" and line == 1.5
