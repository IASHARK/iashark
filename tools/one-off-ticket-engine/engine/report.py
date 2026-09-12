"""Human report (ticket-report.md, section 41) and machine report
(ticket-report.json, section 42)."""
import json
import math


def _leg_row(leg, boot_stat=None):
    p10 = boot_stat["p10"] if boot_stat else leg.p10
    return (f"{leg.league_name} | {leg.home_name} vs {leg.away_name} | {leg.market}"
            f"{f' {leg.line}' if leg.line is not None else ''} | {leg.selection} | "
            f"{leg.exec_odds:.2f} ({leg.exec_bookmaker}) | {leg.mean_p:.3f} | "
            f"{leg.p_geometric:.3f} | {p10:.3f} | {leg.data_quality}")


def _ticket_section(idx, settled_ticket):
    legs = settled_ticket.legs
    lines = [f"## TICKET {idx}", "", "League | Match | Market | Selection | Odds | Mean P | Robust P | P10 | Data quality",
             "---|---|---|---|---|---|---|---|---"]
    for leg in legs:
        lines.append(_leg_row(leg))
    total_odds = math.exp(sum(math.log(l.exec_odds) for l in legs))
    lines += [
        "",
        f"- Total odds: {total_odds:.2f}",
        f"- Estimated P(ticket) [Monte Carlo]: {settled_ticket.p_ticket:.4f} (SE ~= {settled_ticket.se:.4f})",
        f"- Robust estimated P (geometric, bootstrap-shrunk): {math.exp(sum(math.log(max(l.p_geometric,1e-9)) for l in legs)):.4f}",
        f"- Number of legs: {len(legs)}",
        "",
    ]
    return "\n".join(lines)


def _rejected_legs_section(rejected: list):
    lines = ["## REJECTED HIGH-PROBABILITY LEGS", ""]
    for leg, reason in rejected:
        lines.append(f"- {leg.league_name} | {leg.home_name} vs {leg.away_name} | {leg.market}"
                      f"{f' {leg.line}' if leg.line is not None else ''} {leg.selection} @ {leg.exec_odds:.2f} "
                      f"(robust P={leg.p_geometric:.3f}) — {reason}")
    return "\n".join(lines)


def build_markdown_report(run_meta: dict, triplet, portfolio, rejected: list) -> str:
    parts = [
        f"# ONE_OFF_TICKET_OPTIMIZER_V1 — {run_meta['phase']} — {run_meta['target_date']}",
        "",
        f"_Genere {run_meta['generated_at']} — bookmaker mode: {run_meta['bookmaker_mode']}"
        f"{' (' + str(run_meta['bookmaker_name']) + ')' if run_meta.get('bookmaker_name') else ''}_",
        "",
    ]
    if run_meta["phase"] == "PREVIEW":
        parts.append("**PREVIEW_NOT_FINAL — a re-fetch odds/lineups and re-optimize FINAL run is required before staking anything.**")
        parts.append("")
    parts.append("Aucune cote n'est garantie. Les probabilites sont des estimations statistiques, jamais des certitudes.")
    parts.append("")

    for i, t in enumerate(triplet, start=1):
        parts.append(_ticket_section(i, t))

    parts.append("## PORTFOLIO")
    parts.append("")
    parts.append(f"- P(T1) = {portfolio['p_t1']:.4f}")
    parts.append(f"- P(T2) = {portfolio['p_t2']:.4f}")
    parts.append(f"- P(T3) = {portfolio['p_t3']:.4f}")
    parts.append(f"- P(at least one) = {portfolio['p_any']:.4f} (SE ~= {portfolio['p_any_se']:.4f})")
    parts.append(f"- P(at least two) = {portfolio['p_2plus']:.4f} (SE ~= {portfolio['p_2plus_se']:.4f})")
    parts.append(f"- P(all three) = {portfolio['p_all3']:.4f} (SE ~= {portfolio['p_all3_se']:.4f})")
    parts.append(f"- Shared fixtures across pairs: {run_meta.get('shared_fixtures_summary')}")
    parts.append(f"- Simulation count: {portfolio['n_scenarios']}")
    parts.append("")

    parts.append(_rejected_legs_section(rejected))
    parts.append("")
    return "\n".join(parts)


def build_json_report(run_meta, triplet, portfolio, pool_summary, rejected, diagnostics):
    def leg_dict(leg):
        return {
            "fixture_id": leg.fixture_id, "league": leg.league_name,
            "home": leg.home_name, "away": leg.away_name, "kickoff_utc": leg.kickoff_utc,
            "market": leg.market, "selection": leg.selection, "line": leg.line,
            "exec_odds": leg.exec_odds, "exec_bookmaker": leg.exec_bookmaker,
            "mean_p": leg.mean_p, "robust_log_p": leg.robust_log_p, "p_geometric": leg.p_geometric,
            "p10": leg.p10, "p90": leg.p90, "sd": leg.sd,
            "n_bookmakers": leg.n_bookmakers, "data_quality": leg.data_quality,
        }

    return {
        "run_meta": run_meta,
        "tickets": [
            {
                "ticket_index": i + 1,
                "legs": [leg_dict(l) for l in t.legs],
                "total_odds": math.exp(sum(math.log(l.exec_odds) for l in t.legs)),
                "p_ticket_monte_carlo": t.p_ticket,
                "p_ticket_se": t.se,
            }
            for i, t in enumerate(triplet)
        ],
        "portfolio": portfolio,
        "candidate_pool_summary": pool_summary,
        "rejected_high_probability_legs": [
            {"leg": leg_dict(leg), "reason": reason} for leg, reason in rejected
        ],
        "diagnostics": diagnostics,
    }


def write_reports(run_dir, run_meta, triplet, portfolio, pool_summary, rejected, diagnostics):
    md = build_markdown_report(run_meta, triplet, portfolio, rejected)
    (run_dir / "ticket-report.md").write_text(md)
    js = build_json_report(run_meta, triplet, portfolio, pool_summary, rejected, diagnostics)
    (run_dir / "ticket-report.json").write_text(json.dumps(js, indent=2, default=str))
    return md, js


# --- SMOOTH_ACCUMULATOR report (2026-09-05 correction, section 12) --------

def _smooth_leg_dict(leg):
    return {
        "fixture_id": leg.fixture_id, "league": leg.league_name,
        "home": leg.home_name, "away": leg.away_name, "kickoff_utc": leg.kickoff_utc,
        "market": leg.market, "selection": leg.selection, "line": leg.line,
        "executable_odds": leg.exec_odds, "exec_bookmaker": leg.exec_bookmaker,
        "fair_market_probability": leg.fair_market_p, "model_probability": leg.model_p,
        "robust_probability": math.exp(leg.robust_log_p), "mean_probability": leg.mean_p,
        "p10": leg.p10, "p90": leg.p90, "edge": leg.edge,
        "data_quality": leg.data_quality, "quality_tier": leg.quality_tier,
        "uncertainty_tag": leg.uncertainty_tag,
    }


def _smooth_leg_row(leg):
    robust_p = math.exp(leg.robust_log_p)
    fmt = lambda v: f"{v:.3f}" if v is not None else "n/a"
    return (f"{leg.league_name} | {leg.home_name} vs {leg.away_name} | {leg.market}"
            f"{f' {leg.line}' if leg.line is not None else ''} | {leg.selection} | "
            f"{leg.exec_odds:.2f} ({leg.exec_bookmaker}) | {fmt(leg.fair_market_p)} | "
            f"{fmt(leg.model_p)} | {robust_p:.3f} | {leg.p10:.3f} | {leg.p90:.3f} | "
            f"{fmt(leg.edge)} | {leg.data_quality}/{leg.quality_tier or '-'}")


def _smooth_ticket_section(idx, settled_ticket):
    legs = settled_ticket.legs
    lines = [f"## TICKET {idx}", "",
             "League | Match | Market | Selection | Odds | Fair market P | Model P | Robust P | P10 | P90 | Edge | Quality",
             "---|---|---|---|---|---|---|---|---|---|---|---"]
    for leg in legs:
        lines.append(_smooth_leg_row(leg))
    total_odds = math.exp(sum(math.log(l.exec_odds) for l in legs))
    mean_p_proxy = math.exp(sum(math.log(max(l.mean_p, 1e-9)) for l in legs))
    robust_p_proxy = math.exp(sum(l.robust_log_p for l in legs))
    lines += [
        "",
        f"- Total odds: {total_odds:.2f}",
        f"- Mean probability (independent product): {mean_p_proxy:.4f}",
        f"- Robust probability (independent product, bootstrap-shrunk): {robust_p_proxy:.4f}",
        f"- Estimated P(ticket) [Monte Carlo, within-fixture correlation exact]: {settled_ticket.p_ticket:.4f} (SE ~= {settled_ticket.se:.4f})",
        f"- Number of legs: {len(legs)}",
        "",
    ]
    return "\n".join(lines)


def _leg_count_grid_section(leg_count_grid: dict) -> str:
    lines = ["## LEG-COUNT COMPARISON (section 10 — best admissible ticket per cardinality)", "",
             "Legs | Total odds | Robust logP(T) | Tier", "---|---|---|---"]
    for k in sorted(leg_count_grid, key=lambda x: int(x)):
        row = leg_count_grid[k]
        if row is None:
            lines.append(f"{k} | n/a | n/a | NO ADMISSIBLE TICKET")
        else:
            lines.append(f"{k} | {row['total_odds']:.2f} | {row['robust_logp_sum']:.4f} | {row['tier']}")
    lines.append("")
    return "\n".join(lines)


def _comparison_section(comparison: dict) -> str:
    old = comparison["old_robust_p_t1_t2"]
    new = comparison["new_robust_p"]
    lines = ["## COMPARISON VS THE REJECTED (LONGSHOT-CONTAMINATED) RUN", "",
              f"- OLD robust P: T1={old['T1']:.4f}, T2={old['T2']:.4f}",
              f"- NEW robust P: " + ", ".join(f"T{i+1}={p:.4f}" for i, p in enumerate(new))]
    avg_old = sum(old.values()) / len(old)
    avg_new = sum(new) / len(new)
    direction = "AUGMENTE" if avg_new > avg_old else ("DIMINUE" if avg_new < avg_old else "INCHANGEE (quasi identique)")
    lines.append(f"- Interdire les longshots individuels {direction} la probabilite robuste moyenne par ticket "
                 f"({avg_old:.4f} -> {avg_new:.4f}).")
    lines.append("")
    return "\n".join(lines)


def build_smooth_markdown_report(run_meta, triplet, portfolio, rejected, leg_count_grid, comparison) -> str:
    parts = [
        f"# ONE_OFF_TICKET_OPTIMIZER_V1 — SMOOTH_ACCUMULATOR — {run_meta['phase']} — {run_meta['target_date']}",
        "",
        f"_Genere {run_meta['generated_at']} — bookmaker mode: {run_meta['bookmaker_mode']}"
        f"{' (' + str(run_meta['bookmaker_name']) + ')' if run_meta.get('bookmaker_name') else ''} — "
        f"winning tier: {run_meta['winning_tier']['label']} ({run_meta['winning_leg_count']} legs)_",
        "",
    ]
    if run_meta["phase"] == "PREVIEW":
        parts.append("**PREVIEW_NOT_FINAL — a re-fetch odds/lineups and re-optimize FINAL run is required before staking anything.**")
        parts.append("")
    parts.append("Aucune cote n'est garantie. Les probabilites sont des estimations statistiques, jamais des certitudes.")
    parts.append("")
    parts.append(_leg_count_grid_section(leg_count_grid))

    for i, t in enumerate(triplet, start=1):
        parts.append(_smooth_ticket_section(i, t))

    parts.append("## PORTFOLIO")
    parts.append("")
    parts.append(f"- P(T1) = {portfolio['p_t1']:.4f}")
    parts.append(f"- P(T2) = {portfolio['p_t2']:.4f}")
    parts.append(f"- P(T3) = {portfolio['p_t3']:.4f}")
    parts.append(f"- P(at least one) = {portfolio['p_any']:.4f} (SE ~= {portfolio['p_any_se']:.4f})")
    parts.append(f"- P(at least two) = {portfolio['p_2plus']:.4f} (SE ~= {portfolio['p_2plus_se']:.4f})")
    parts.append(f"- P(all three) = {portfolio['p_all3']:.4f} (SE ~= {portfolio['p_all3_se']:.4f})")
    parts.append(f"- Shared fixtures across pairs: {run_meta.get('shared_fixtures_summary')}")
    parts.append(f"- Simulation count: {portfolio['n_scenarios']}")
    parts.append("")

    parts.append(_comparison_section(comparison))
    parts.append(_rejected_legs_section(rejected))
    parts.append("")
    return "\n".join(parts)


def build_smooth_json_report(run_meta, triplet, portfolio, pool_summary, rejected, diagnostics, leg_count_grid):
    return {
        "run_meta": run_meta,
        "leg_count_grid": leg_count_grid,
        "tickets": [
            {
                "ticket_index": i + 1,
                "legs": [_smooth_leg_dict(l) for l in t.legs],
                "total_odds": math.exp(sum(math.log(l.exec_odds) for l in t.legs)),
                "mean_probability_independent": math.exp(sum(math.log(max(l.mean_p, 1e-9)) for l in t.legs)),
                "robust_probability_independent": math.exp(sum(l.robust_log_p for l in t.legs)),
                "p_ticket_monte_carlo": t.p_ticket,
                "p_ticket_se": t.se,
            }
            for i, t in enumerate(triplet)
        ],
        "portfolio": portfolio,
        "candidate_pool_summary": pool_summary,
        "rejected_high_probability_legs": [
            {"leg": _smooth_leg_dict(leg), "reason": reason} for leg, reason in rejected
        ],
        "diagnostics": diagnostics,
    }


def write_smooth_report(run_dir, run_meta, triplet, portfolio, pool_summary, rejected, diagnostics, leg_count_grid):
    comparison = diagnostics["comparison_vs_rejected_run"]
    md = build_smooth_markdown_report(run_meta, triplet, portfolio, rejected, leg_count_grid, comparison)
    (run_dir / "ticket-report.md").write_text(md)
    js = build_smooth_json_report(run_meta, triplet, portfolio, pool_summary, rejected, diagnostics, leg_count_grid)
    (run_dir / "ticket-report.json").write_text(json.dumps(js, indent=2, default=str))
    return md, js
