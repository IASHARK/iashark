#!/usr/bin/env python3
"""ONE_OFF_TICKET_OPTIMIZER_V1 — CLI entrypoint.

Isolated, self-contained engine. Does not import from, and is never
imported by, the production Score/Player/Market Lab code under lib/.

Usage:
    python3 tools/one-off-ticket-engine/run.py --date 2026-09-06 --phase PREVIEW
    python3 tools/one-off-ticket-engine/run.py --date 2026-09-06 --phase FINAL --bookmaker Pinnacle

--mode SMOOTH_ACCUMULATOR (default, since the 2026-09-05 correction) builds
tickets from several individually-strong legs (odds capped, robust_p floor)
instead of a couple of ultra-safe legs plus one longshot to hit the odds
floor. --mode MAXIMIZE is the original (now superseded) behavior, kept only
for reproducing the earlier rejected run.
"""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from engine import config
from engine.pipeline import build_state, log
from engine.leagues import manifest_to_dicts
from engine.ticket_solver import generate_ticket_pool, solve_by_leg_count_grid, solve_best_ticket_tiered
from engine.portfolio import (simulate_fixture_scores, settle_pool, select_best_triplet,
                               portfolio_stats, bootstrap_final_portfolio)
from engine.smooth_filters import annotate_legs, filter_eligible_legs
from engine.determinism import derive_seed
from engine.manifest import build_manifest, write_manifest, git_head_sha
from engine.report import write_reports, write_smooth_report


def parse_args():
    p = argparse.ArgumentParser(description="ONE_OFF_TICKET_OPTIMIZER_V1")
    p.add_argument("--date", default="2026-09-06")
    p.add_argument("--phase", choices=["PREVIEW", "FINAL"], default="PREVIEW")
    p.add_argument("--mode", choices=["SMOOTH_ACCUMULATOR", "MAXIMIZE"], default="SMOOTH_ACCUMULATOR")
    p.add_argument("--bookmaker", default=None, help="If set, SINGLE_BOOK mode with this bookmaker name.")
    p.add_argument("--leagues", default=None, help="Comma-separated league name hints to restrict to.")
    p.add_argument("--min-ticket-odds", type=float, default=config.SMOOTH_TOTAL_ODDS_MIN)
    p.add_argument("--tickets", type=int, default=config.TICKET_COUNT)
    p.add_argument("--simulations", type=int, default=config.DAY_SCENARIOS)
    p.add_argument("--bootstrap-draws", type=int, default=config.BOOTSTRAP_STAGE1_DRAWS)
    p.add_argument("--bootstrap-stage2-draws", type=int, default=config.BOOTSTRAP_STAGE2_DRAWS)
    p.add_argument("--pool-time-budget-s", type=int, default=180)
    p.add_argument("--seed", type=int, default=None)
    return p.parse_args()


def refresh_stage2_and_rebuild(state, fixture_ids, args):
    from engine.bootstrap import bootstrap_fixture
    from engine.legs import _prob_key
    for fid in fixture_ids:
        seed_i = derive_seed(args.date, "stage2", str(fid)) % (2**32 - 1)
        state["bootstrap_by_fixture"][fid] = bootstrap_fixture(
            fid, state["Q_by_fixture"][fid], state["fair_by_key"], args.bootstrap_stage2_draws, seed_i)
    for leg in state["legs"]:
        stats = state["bootstrap_by_fixture"].get(leg.fixture_id)
        if stats is None:
            continue
        s = stats.get(_prob_key(leg.market, leg.selection, leg.line))
        if s:
            leg.mean_p, leg.robust_log_p, leg.p_geometric = s["mean_p"], s["robust_log_p"], s["p_geometric"]
            leg.p10, leg.p90, leg.sd, leg.stage = s["p10"], s["p90"], s["sd"], "STAGE2"


def run_smooth_accumulator(state, args, run_dir):
    legs = state["legs"]
    eligible_stage1 = [l for l in legs if l.data_quality != "LOW"]
    annotate_legs(eligible_stage1, state["market_probs_by_fixture"], state["consensus_by_key"])
    eligible, rejection_counts = filter_eligible_legs(eligible_stage1, config.SMOOTH_MAX_LEG_ODDS_FALLBACK)
    log(f"  SMOOTH_ACCUMULATOR leg filter: {rejection_counts}")
    if not eligible:
        log("NO_HIGH_QUALITY_SOLUTION: no leg satisfies robust_p>=0.65 / odds<=2.00 / edge>=-0.03 / P10>=0.58.")
        return None

    log("Section 10: solving best ticket per cardinality (4/5/6/7 legs), exact MILP, no greedy...")
    grid = solve_by_leg_count_grid(eligible, leg_counts=(4, 5, 6, 7), min_odds=args.min_ticket_odds)
    for k, res in grid.items():
        t = res["ticket"]
        if t is None:
            log(f"  {k} legs: NO ADMISSIBLE TICKET")
        else:
            log(f"  {k} legs: odds={t.total_odds:.2f} robust_logP={t.robust_logp_sum:.4f} tier={res['tier']['label']}")

    winning_k = max((k for k in grid if grid[k]["ticket"] is not None),
                    key=lambda k: grid[k]["ticket"].robust_logp_sum, default=None)
    if winning_k is None:
        log("NO_HIGH_QUALITY_SOLUTION: no admissible ticket at any cardinality 4-7.")
        return None
    winning_tier = grid[winning_k]["tier"]
    log(f"  Winning cardinality: {winning_k} legs (tier={winning_tier['label']})")
    if winning_tier["max_leg_odds"] > config.SMOOTH_MAX_LEG_ODDS_PRIMARY:
        log(f"  WARNING: fell back to MAX_LEG_ODDS={winning_tier['max_leg_odds']} — "
            f"no admissible ticket found under {config.SMOOTH_MAX_LEG_ODDS_PRIMARY}.")

    t1_candidate = grid[winning_k]["ticket"]
    fixed_max_leg_odds = winning_tier["max_leg_odds"]
    fixed_legs = [l for l in eligible if l.exec_odds <= fixed_max_leg_odds]
    log(f"  T1 fixed: {winning_k} legs, fixtures={t1_candidate.fixtures}")

    log("Section 9: solving T2 (best ticket diversified against T1) via a direct MILP constraint...")
    t2_candidate, t2_relaxed = None, False
    for max_shared, relaxed_flag in ((0, False), (1, True)):
        t2_candidate, _tier2 = solve_best_ticket_tiered(
            eligible, min_odds=args.min_ticket_odds, max_leg_odds_primary=fixed_max_leg_odds,
            max_leg_odds_fallback=fixed_max_leg_odds, fixture_caps=[(set(t1_candidate.fixtures), max_shared)])
        if t2_candidate is not None:
            t2_relaxed = relaxed_flag
            break
    if t2_candidate is None:
        log("ONLY_1_VALID_TICKET: no ticket diversifies from T1 even allowing <=1 shared fixture.")
        return None
    log(f"  T2 fixed: fixtures={t2_candidate.fixtures} (shared with T1: "
        f"{len(set(t1_candidate.fixtures) & set(t2_candidate.fixtures))}, relaxed={t2_relaxed})")

    log("Generating T3 candidate pool, each already diversified against BOTH T1 and T2...")
    t3_pool, t3_relaxed = [], t2_relaxed
    for max_shared, relaxed_flag in ((0, False), (1, True)):
        if relaxed_flag and not t2_relaxed:
            continue  # don't relax T3 beyond what T2 already needed
        t3_pool = generate_ticket_pool(
            fixed_legs, args.min_ticket_odds, config.SMOOTH_MIN_LEGS, config.SMOOTH_MAX_LEGS,
            config.CANDIDATE_POOL_TARGET, time_budget_s=args.pool_time_budget_s,
            fixture_caps=[(set(t1_candidate.fixtures), max_shared), (set(t2_candidate.fixtures), max_shared)])
        if t3_pool:
            t3_relaxed = relaxed_flag
            break
    if not t3_pool:
        log("ONLY_2_VALID_TICKETS: no ticket diversifies from BOTH T1 and T2 even allowing <=1 shared fixture each.")
        return None
    log(f"  T3 candidate pool size: {len(t3_pool)} (relaxed={t3_relaxed})")

    all_fixtures = sorted(set(t1_candidate.fixtures) | set(t2_candidate.fixtures) |
                           {fid for t in t3_pool for fid in t.fixtures})
    log(f"Stage-2 bootstrap refinement ({args.bootstrap_stage2_draws} draws) for {len(all_fixtures)} relevant fixtures...")
    refresh_stage2_and_rebuild(state, all_fixtures, args)
    annotate_legs([l for l in legs if l.fixture_id in all_fixtures], state["market_probs_by_fixture"], state["consensus_by_key"])

    log(f"Joint day-scenario Monte Carlo ({args.simulations} scenarios)...")
    fixture_scores = simulate_fixture_scores({fid: state["P_by_fixture"][fid] for fid in all_fixtures},
                                              args.simulations, state["seed"])

    from engine.portfolio import settle_ticket, SettledTicket
    import math as _math

    def _settle(cand, legs_universe):
        legs_subset = tuple(legs_universe[i] for i in cand.leg_indices)
        win_mask = settle_ticket(legs_subset, fixture_scores)
        p = float(win_mask.mean())
        se = _math.sqrt(max(p * (1 - p), 0) / len(win_mask))
        return SettledTicket(cand, legs_subset, win_mask, p, se)

    t1_settled = _settle(t1_candidate, eligible)
    t2_settled = _settle(t2_candidate, eligible)
    t3_settled_pool = [_settle(cand, fixed_legs) for cand in t3_pool]

    log("Section 9: picking T3 = the candidate that maximizes the realized P(T1 or T2 or T3)...")
    best_t3, best_p_any = None, -1.0
    for cand in t3_settled_pool:
        p_any = float((t1_settled.win_mask | t2_settled.win_mask | cand.win_mask).mean())
        if p_any > best_p_any:
            best_p_any, best_t3 = p_any, cand
    triplet = (t1_settled, t2_settled, best_t3)
    relaxed = t2_relaxed or t3_relaxed

    portfolio = portfolio_stats(triplet, args.simulations)
    log(f"  P(any)={portfolio['p_any']:.4f}  P(T1..T3)={[round(t.p_ticket,4) for t in triplet]}  relaxed_overlap={relaxed}")

    old_robust_p = {"T1": 0.1907, "T2": 0.1913}  # the rejected MAXIMIZE run's reported robust P, for section 11's honest comparison
    import math
    new_robust_p = [math.exp(sum(l.robust_log_p for l in t.legs)) for t in triplet]
    log(f"  Comparison vs rejected run: OLD robust P ~ {list(old_robust_p.values())}, NEW robust P = {[round(p,4) for p in new_robust_p]}")

    final_seed = derive_seed(args.date, "portfolio_final", str(state["seed"])) % (2**32 - 1)
    final_bootstrap = bootstrap_final_portfolio(
        [t.legs for t in triplet], state["fair_by_key"], state["Q_by_fixture"],
        config.PORTFOLIO_BOOTSTRAP_DRAWS, config.PORTFOLIO_BOOTSTRAP_INNER_SCENARIOS, final_seed)

    used_leg_ids = {(l.fixture_id, l.market, l.selection, l.line) for t in triplet for l in t.legs}
    used_fixtures = {l.fixture_id for t in triplet for l in t.legs}
    rejected = []
    for leg in sorted((l for l in eligible if (l.fixture_id, l.market, l.selection, l.line) not in used_leg_ids),
                       key=lambda l: -l.robust_log_p)[:15]:
        if leg.fixture_id in used_fixtures:
            reason = "TICKET_OPTIMIZATION: ce match est deja couvert (max 1 selection/match) dans un des 3 tickets retenus"
        else:
            reason = "NON_RETENU_PAR_OPTIMISATION: n'ameliore pas P(any) du triplet une fois la diversification appliquee"
        rejected.append((leg, reason))

    run_meta = {
        "phase": args.phase, "mode": "SMOOTH_ACCUMULATOR", "target_date": args.date,
        "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "bookmaker_mode": state["bookmaker_mode"], "bookmaker_name": state["bookmaker_name"],
        "shared_fixtures_summary": "relaxed to <=1 shared fixture per pair" if relaxed else "0 shared fixtures per pair",
        "seed": state["seed"], "winning_tier": winning_tier, "winning_leg_count": winning_k,
    }
    leg_count_grid_summary = {
        str(k): ({"total_odds": res["ticket"].total_odds, "robust_logp_sum": res["ticket"].robust_logp_sum,
                   "n_legs": len(res["ticket"].leg_indices), "tier": res["tier"]["label"]} if res["ticket"] else None)
        for k, res in grid.items()
    }
    diagnostics = {
        "league_manifest": manifest_to_dicts(state["league_entries"]), "excluded_fixtures": state["excluded_fixtures"],
        "hyperparameters_by_league": state["hyperparams_by_league"], "dixon_coles_by_league": state["dc_rho_by_league"],
        "disagreement_tags": state["disagreement_tags"], "api_calls": state["client"].call_summary(),
        "final_portfolio_bootstrap": final_bootstrap, "candidate_pool_size": len(t3_pool),
        "n_eligible_legs": len(eligible), "n_total_legs": len(legs),
        "leg_filter_rejection_counts": vars(rejection_counts),
        "leg_count_grid": leg_count_grid_summary,
        "comparison_vs_rejected_run": {"old_robust_p_t1_t2": old_robust_p, "new_robust_p": new_robust_p},
        "triplet_overlap_relaxed": relaxed, "t2_relaxed": t2_relaxed, "t3_relaxed": t3_relaxed,
    }
    pool_summary = {"pool_size": len(t3_pool), "note": "pool of T3 candidates, each pre-diversified vs T1 and T2",
                    "top_10_by_robust_prob": [
        {"fixtures": t.fixtures, "total_odds": t.total_odds, "robust_logp_sum": t.robust_logp_sum}
        for t in sorted(t3_pool, key=lambda t: -t.robust_logp_sum)[:10]
    ]}

    write_smooth_report(run_dir, run_meta, triplet, portfolio, pool_summary, rejected, diagnostics, leg_count_grid_summary)

    manifest = build_manifest(
        target_date=args.date, league_manifest=manifest_to_dicts(state["league_entries"]),
        fixture_ids=[f.fixture_id for f in state["fixtures"]], odds_hash=state["odds_hash"],
        bookmaker_mode=state["bookmaker_mode"], bookmaker_name=state["bookmaker_name"],
        hyperparams_by_league=state["hyperparams_by_league"],
        bootstrap_stage1=args.bootstrap_draws, bootstrap_stage2=args.bootstrap_stage2_draws,
        simulation_count=args.simulations, code_version=git_head_sha(), seed=state["seed"],
        cfg_hash=state["cfg_hash"], phase=args.phase,
    )
    manifest["mode"] = "SMOOTH_ACCUMULATOR"
    manifest["winning_tier"] = winning_tier
    write_manifest(run_dir, manifest)
    return run_dir


def run_maximize_legacy(state, args, run_dir):
    """Original (now superseded) objective: max robust_logP subject only to
    odds>=min, 3-7 legs, one-per-fixture — kept for reproducing the earlier
    rejected run, not used by default."""
    from engine.legs import _prob_key
    eligible_legs = [l for l in state["legs"] if l.data_quality != "LOW"]
    if not eligible_legs:
        log("NO_HIGH_QUALITY_SOLUTION")
        return None

    pool = generate_ticket_pool(eligible_legs, args.min_ticket_odds, config.MIN_LEGS, config.MAX_LEGS,
                                 config.CANDIDATE_POOL_TARGET, time_budget_s=args.pool_time_budget_s)
    if not pool:
        log("NO_HIGH_QUALITY_SOLUTION")
        return None
    pool_fixture_ids = sorted({fid for t in pool for fid in t.fixtures})
    refresh_stage2_and_rebuild(state, pool_fixture_ids, args)

    fixture_scores = simulate_fixture_scores({fid: state["P_by_fixture"][fid] for fid in pool_fixture_ids},
                                              args.simulations, state["seed"])
    settled_pool = settle_pool(pool, eligible_legs, fixture_scores)
    triplet, p_any, relaxed = select_best_triplet(settled_pool, args.tickets)
    if triplet is None:
        log("ONLY_0_VALID_TICKETS")
        return None
    portfolio = portfolio_stats(triplet, args.simulations)

    final_seed = derive_seed(args.date, "portfolio_final", str(state["seed"])) % (2**32 - 1)
    final_bootstrap = bootstrap_final_portfolio(
        [t.legs for t in triplet], state["fair_by_key"], state["Q_by_fixture"],
        config.PORTFOLIO_BOOTSTRAP_DRAWS, config.PORTFOLIO_BOOTSTRAP_INNER_SCENARIOS, final_seed)

    used_leg_ids = {(l.fixture_id, l.market, l.selection, l.line) for t in triplet for l in t.legs}
    used_fixtures = {l.fixture_id for t in triplet for l in t.legs}
    rejected = []
    for leg in sorted((l for l in eligible_legs if (l.fixture_id, l.market, l.selection, l.line) not in used_leg_ids),
                       key=lambda l: -l.robust_log_p)[:15]:
        reason = ("TICKET_OPTIMIZATION: match deja couvert" if leg.fixture_id in used_fixtures
                  else "ODDS_INSUFFICIENT" if leg.exec_odds < 1.30 else "NON_RETENU_PAR_OPTIMISATION")
        rejected.append((leg, reason))

    run_meta = {"phase": args.phase, "mode": "MAXIMIZE", "target_date": args.date,
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "bookmaker_mode": state["bookmaker_mode"], "bookmaker_name": state["bookmaker_name"],
                "shared_fixtures_summary": "relaxed" if relaxed else "0 shared", "seed": state["seed"]}
    diagnostics = {"league_manifest": manifest_to_dicts(state["league_entries"]), "final_portfolio_bootstrap": final_bootstrap,
                   "candidate_pool_size": len(pool), "api_calls": state["client"].call_summary()}
    pool_summary = {"pool_size": len(pool)}
    write_reports(run_dir, run_meta, triplet, portfolio, pool_summary, rejected, diagnostics)
    manifest = build_manifest(
        target_date=args.date, league_manifest=manifest_to_dicts(state["league_entries"]),
        fixture_ids=[f.fixture_id for f in state["fixtures"]], odds_hash=state["odds_hash"],
        bookmaker_mode=state["bookmaker_mode"], bookmaker_name=state["bookmaker_name"],
        hyperparams_by_league=state["hyperparams_by_league"], bootstrap_stage1=args.bootstrap_draws,
        bootstrap_stage2=args.bootstrap_stage2_draws, simulation_count=args.simulations,
        code_version=git_head_sha(), seed=state["seed"], cfg_hash=state["cfg_hash"], phase=args.phase)
    write_manifest(run_dir, manifest)
    return run_dir


def main():
    args = parse_args()
    state = build_state(args)
    if state["status"] != "OK":
        log(f"{state['status']}: {state.get('reason')}")
        return

    run_id = f"{args.date}_{args.phase}_{args.mode}_{int(state['t_start'])}"
    run_dir = config.RUNS_ROOT / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    if args.mode == "SMOOTH_ACCUMULATOR":
        result_dir = run_smooth_accumulator(state, args, run_dir)
    else:
        result_dir = run_maximize_legacy(state, args, run_dir)

    if result_dir is None:
        return
    log(f"DONE in {time.time()-state['t_start']:.1f}s -> {result_dir}")
    log("  ticket-report.md / ticket-report.json / RUN_MANIFEST.json written")


if __name__ == "__main__":
    main()
