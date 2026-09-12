"""Shared pipeline: leagues -> fixtures -> history -> Poisson model ->
score matrix -> odds -> devig/consensus -> entropy matrix -> bootstrap ->
candidate legs. Used identically by every ticket-construction mode (the
2026-09-05 correction changed only how legs are filtered/combined into
tickets downstream — never this part)."""
import time

from . import config
from .api_client import ApiClient
from .leagues import resolve_leagues, manifest_to_dicts
from .fixtures import fetch_fixtures_for_date, fetch_finished_history
from .poisson_model import select_hyperparameters, fit_league_model, team_lambdas
from .score_matrix import build_score_matrix, fit_dixon_coles_rho
from .odds import fetch_odds_for_fixtures
from .consensus import compute_fair_probs_per_bookmaker, build_consensus
from .entropy_matrix import build_constraints, solve_entropy_matrix
from .markets import market_probabilities
from .bootstrap import bootstrap_fixture
from .legs import build_legs
from .determinism import config_hash, odds_snapshot_hash, derive_seed

DISAGREEMENT_TAG_THRESHOLD = 0.20
DISAGREEMENT_EXCLUDE_THRESHOLD = 0.35


def log(msg):
    print(f"[one-off-ticket-engine] {msg}", flush=True)


def build_state(args):
    t_start = time.time()

    target_leagues = config.TARGET_LEAGUES
    if args.leagues:
        wanted = {h.strip().lower() for h in args.leagues.split(",")}
        target_leagues = [tl for tl in target_leagues if tl["hint"].lower() in wanted]

    client = ApiClient()

    log(f"Resolving {len(target_leagues)} leagues (live /leagues, never guessed)...")
    league_entries = resolve_leagues(client, args.date, target_leagues)
    for e in league_entries:
        log(f"  {e.league_name} ({e.country}) -> id={e.league_id} season={e.season} status={e.coverage_status}")

    log("Fetching fixtures for target date...")
    fixtures, excluded_fixtures = fetch_fixtures_for_date(client, league_entries, args.date)
    log(f"  {len(fixtures)} eligible pre-match fixtures, {len(excluded_fixtures)} excluded")
    if not fixtures:
        return {"status": "NO_HIGH_QUALITY_SOLUTION", "reason": "no eligible fixtures for this date"}

    cutoff_iso = f"{args.date}T00:00:00+00:00"
    leagues_used = {f.league_id: f.league_name for f in fixtures}
    league_by_id = {e.league_id: e for e in league_entries}

    log("Fetching historical finished matches per league (anti-leakage cutoff enforced)...")
    league_models, hyperparams_by_league, dc_rho_by_league = {}, {}, {}
    for league_id in leagues_used:
        entry = league_by_id[league_id]
        seasons = [s for s in [entry.season, entry.season - 1 if entry.season else None,
                                entry.season - 2 if entry.season else None] if s is not None]
        matches = fetch_finished_history(client, league_id, seasons, cutoff_iso)
        H, ridge, cv_table = select_hyperparameters(league_id, matches, cutoff_iso)
        if H is None:
            H, ridge = 180, 1.0
        model = fit_league_model(league_id, matches, cutoff_iso, H, ridge)
        league_models[league_id] = model
        hyperparams_by_league[league_id] = {
            "league_name": leagues_used[league_id], "half_life_days": H, "ridge": ridge,
            "n_matches": len(matches), "low_confidence": model.low_confidence,
            "cv_table_size": len(cv_table),
        }
        mwl = []
        for m in matches:
            lam_h, lam_a, _ = team_lambdas(model, m["home_id"], m["away_id"])
            mwl.append((m["goals_home"], m["goals_away"], lam_h, lam_a, 1.0))
        rho, fitted = fit_dixon_coles_rho(mwl)
        dc_rho_by_league[league_id] = {"rho": rho, "fitted": fitted, "n_matches": len(mwl)}
        log(f"  League {leagues_used[league_id]}: H={H} ridge={ridge} n_matches={len(matches)} "
            f"low_confidence={model.low_confidence} rho={rho:.4f} (fitted={fitted})")

    log("Building per-fixture statistical score matrix Q(h,a)...")
    Q_by_fixture, tail_by_fixture, low_conf_fixtures, unseen_team_fixtures = {}, {}, set(), set()
    for fx in fixtures:
        model = league_models[fx.league_id]
        lam_h, lam_a, unseen = team_lambdas(model, fx.home_id, fx.away_id)
        rho = dc_rho_by_league[fx.league_id]["rho"]
        Q, tail_mass, grid_size, ok = build_score_matrix(lam_h, lam_a, rho)
        Q_by_fixture[fx.fixture_id] = Q
        tail_by_fixture[fx.fixture_id] = {"tail_mass": tail_mass, "grid_size": grid_size, "acceptable": ok,
                                           "lambda_h": lam_h, "lambda_a": lam_a}
        if model.low_confidence:
            low_conf_fixtures.add(fx.fixture_id)
        if unseen:
            unseen_team_fixtures.add(fx.fixture_id)

    log("Fetching odds (pre-match, allow-listed markets only)...")
    quotes = fetch_odds_for_fixtures(client, fixtures)
    log(f"  {len(quotes)} raw quotes retained after market/line allow-listing")
    fair_by_key, raw_by_key = compute_fair_probs_per_bookmaker(quotes)
    consensus_points = build_consensus(fair_by_key, raw_by_key)
    consensus_by_key = {(c.fixture_id, c.market, c.line, c.selection): c for c in consensus_points}

    bookmaker_names = sorted({q.bookmaker for q in quotes})
    coverage_by_bookmaker = {bm: sum(1 for q in quotes if q.bookmaker == bm) for bm in bookmaker_names}
    log(f"  Bookmakers seen: {coverage_by_bookmaker}")

    bookmaker_mode = "SINGLE_BOOK" if args.bookmaker else "BEST_PRICE_RESEARCH"
    bookmaker_name = args.bookmaker
    if bookmaker_mode == "BEST_PRICE_RESEARCH":
        best_bm = max(coverage_by_bookmaker, key=lambda b: coverage_by_bookmaker[b]) if coverage_by_bookmaker else None
        log(f"  No --bookmaker given: BEST_PRICE_SHOPPING mode (technical report only). "
            f"Best-coverage bookmaker for reference: {best_bm}")

    log("Solving market-anchored entropy matrix per fixture...")
    P_by_fixture, market_probs_by_fixture, disagreement_tags, excluded_disagreement = {}, {}, {}, set()
    for fx in fixtures:
        points = [c for c in consensus_points if c.fixture_id == fx.fixture_id]
        constraints = build_constraints(points)
        Q = Q_by_fixture[fx.fixture_id]
        P, diag = solve_entropy_matrix(Q, constraints)
        P_by_fixture[fx.fixture_id] = P
        market_probs_by_fixture[fx.fixture_id] = market_probabilities(P)

        q_mkts = market_probabilities(Q)
        model_market_gap = abs(q_mkts[("1X2", "HOME")] -
                                (next((c.median for c in points if c.market == "1X2" and c.selection == "HOME"), q_mkts[("1X2", "HOME")])))
        if model_market_gap > DISAGREEMENT_EXCLUDE_THRESHOLD:
            excluded_disagreement.add(fx.fixture_id)
            disagreement_tags[fx.fixture_id] = "MODEL_MARKET_DISAGREEMENT_EXCLUDED"
        elif model_market_gap > DISAGREEMENT_TAG_THRESHOLD:
            disagreement_tags[fx.fixture_id] = "MODEL_MARKET_DISAGREEMENT"

    usable_fixtures = [f for f in fixtures if f.fixture_id not in excluded_disagreement]
    log(f"  {len(excluded_disagreement)} fixtures excluded for extreme model/market disagreement")

    log(f"Stage-1 bootstrap ({args.bootstrap_draws} draws/fixture)...")
    bootstrap_by_fixture = {}
    for fx in usable_fixtures:
        seed_i = derive_seed(args.date, "stage1", str(fx.fixture_id)) % (2**32 - 1)
        bootstrap_by_fixture[fx.fixture_id] = bootstrap_fixture(
            fx.fixture_id, Q_by_fixture[fx.fixture_id], fair_by_key, args.bootstrap_draws, seed_i)
    log("  stage-1 bootstrap complete")

    log("Building candidate legs...")
    legs = build_legs(usable_fixtures, market_probs_by_fixture, bootstrap_by_fixture, raw_by_key,
                       consensus_by_key, bookmaker_mode, bookmaker_name)
    for leg in legs:
        if leg.fixture_id in low_conf_fixtures or leg.fixture_id in unseen_team_fixtures:
            if leg.data_quality == "HIGH":
                leg.data_quality = "MEDIUM"
    log(f"  {len(legs)} total candidate legs built")

    cfg_snapshot = {
        "allowed_markets": sorted(config.ALLOWED_MARKET_NAMES.values()),
        "allowed_lines": {k: sorted(v) for k, v in config.ALLOWED_LINES.items()},
        "min_ticket_odds": args.min_ticket_odds,
        "half_life_grid": config.HALF_LIFE_GRID_DAYS, "ridge_grid": config.RIDGE_GRID,
        "family_weight_cap_multiplier": config.FAMILY_WEIGHT_CAP_MULTIPLIER,
    }
    cfg_hash = config_hash(cfg_snapshot)
    odds_hash = odds_snapshot_hash(list(quotes))
    seed = args.seed if args.seed is not None else derive_seed(args.date, cfg_hash, odds_hash) % (2**32 - 1)
    log(f"  config_hash={cfg_hash[:16]}... odds_hash={odds_hash[:16]}... seed={seed}")

    return {
        "status": "OK", "t_start": t_start, "client": client,
        "league_entries": league_entries, "fixtures": fixtures, "excluded_fixtures": excluded_fixtures,
        "league_models": league_models, "hyperparams_by_league": hyperparams_by_league,
        "dc_rho_by_league": dc_rho_by_league, "Q_by_fixture": Q_by_fixture, "tail_by_fixture": tail_by_fixture,
        "quotes": quotes, "fair_by_key": fair_by_key, "raw_by_key": raw_by_key,
        "consensus_points": consensus_points, "consensus_by_key": consensus_by_key,
        "bookmaker_mode": bookmaker_mode, "bookmaker_name": bookmaker_name,
        "P_by_fixture": P_by_fixture, "market_probs_by_fixture": market_probs_by_fixture,
        "disagreement_tags": disagreement_tags, "excluded_disagreement": excluded_disagreement,
        "usable_fixtures": usable_fixtures, "bootstrap_by_fixture": bootstrap_by_fixture,
        "legs": legs, "cfg_hash": cfg_hash, "odds_hash": odds_hash, "seed": seed,
    }
