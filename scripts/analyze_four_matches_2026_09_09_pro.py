#!/usr/bin/env python3
"""Independent multi-league analysis for four fixtures on 2026-09-09.

Each competition is fitted independently. Probabilities are frozen before
bookmaker prices are fetched. Hyperparameters and score law are selected by
chronological out-of-sample validation, with a block bootstrap for uncertainty.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np

import analyze_kleague1_2026_09_09_pro as core


REPO = Path(__file__).resolve().parents[1]
OUT_DIR = REPO / "data" / "analysis" / "2026-09-09-four-matches-pro"
CACHE_DIR = OUT_DIR / "api-cache"
TARGET_IDS = (1638094, 1509181, 1509182, 1559994)
LEAGUES = {
    244: {"name": "Veikkausliiga", "country": "Finlande", "seasons": (2023, 2024, 2025, 2026)},
    327: {"name": "Erovnuli Liga", "country": "Géorgie", "seasons": (2023, 2024, 2025, 2026)},
    345: {"name": "Czech Liga", "country": "Tchéquie", "seasons": (2023, 2024, 2025, 2026)},
}
STANDARD_ORDER = (
    "1", "N", "2", "1X", "X2", "12", "BTTS Oui", "BTTS Non",
    "Plus de 1.5 buts", "Plus de 2.5 buts", "Moins de 2.5 buts", "Moins de 3.5 buts",
    "Domicile plus de 0.5 but", "Extérieur plus de 0.5 but",
    "Domicile moins de 1.5 but", "Extérieur moins de 1.5 but",
)
OFFICIAL_CONTEXT = {
    1638094: {
        "venue": "Bolt Arena, Helsinki",
        "absences": ["Alex Ring", "Amara Nallo", "Joona Veteli", "David Ezeh", "Eemil Toivonen"],
        "available_again": ["Ville Tikkanen", "Lassi Lappalainen"],
        "note": "Informations publiées par HJK ; l’avant-match d’Inter ne donne pas de liste d’absents.",
        "source_label": "avant-match officiel HJK",
        "source_url": "https://www.hjk.fi/uutiset/mestaruussarja-kayntiin-revanssi-mielessa",
    },
    1509181: {
        "venue": "Football Centre, Tskaltubo (source ligue officielle)",
        "absences": [],
        "available_again": [],
        "note": "Aucune suspension ou blessure affichée ; la section Squads n’est pas un onze officiel.",
        "source_label": "fiche officielle Erovnuli Liga",
        "source_url": "https://erovnuliliga.ge/en/game/9292-smg-dil",
    },
    1509182: {
        "venue": "Mikheil Meskhi 2, Tbilisi (source ligue officielle)",
        "absences": ["Nikoloz Kenchadze (Spaeri, suspendu)", "Mamuka Kapanadze (Rustavi, suspendu)"],
        "available_again": [],
        "note": "Le Rustavi concerné est l’équipe API 3501, distincte de Metalurgi/Olimpi Rustavi 13846.",
        "source_label": "fiche officielle Erovnuli Liga",
        "source_url": "https://erovnuliliga.ge/en/game/9295-spa-rus",
    },
    1559994: {
        "venue": "Stadion Strelnice, Jablonec nad Nisou",
        "absences": ["Milla (Jablonec)", "Gning (Baník)", "Vlasiy Sinyavskiy (Baník)", "Michal Kohút (Baník)"],
        "available_again": [],
        "note": "Match de la 5e journée reprogrammé après le parcours européen de Jablonec.",
        "source_label": "avant-match officiel Baník",
        "source_url": "https://www.fcb.cz/clanek.asp?id=Preview-Jablonec-Banik-streda-17-00-12333",
    },
}


def pct(value: float) -> str:
    return f"{value * 100:.1f}%"


def h2h_summary(target: core.Match, historical: list[core.Match]) -> dict[str, Any]:
    rows = [
        match for match in historical
        if {match.home_id, match.away_id} == {target.home_id, target.away_id}
    ]
    rows.sort(key=lambda match: match.date, reverse=True)
    rows = rows[:8]
    home_wins = draws = away_wins = home_goals = away_goals = 0
    games = []
    for match in rows:
        target_home_goals = match.home_goals if match.home_id == target.home_id else match.away_goals
        target_away_goals = match.away_goals if match.away_id == target.away_id else match.home_goals
        home_goals += target_home_goals
        away_goals += target_away_goals
        if target_home_goals > target_away_goals:
            home_wins += 1
        elif target_home_goals < target_away_goals:
            away_wins += 1
        else:
            draws += 1
        games.append({
            "date": match.date.date().isoformat(),
            "home": match.home_name,
            "away": match.away_name,
            "score": f"{match.home_goals}-{match.away_goals}",
        })
    return {
        "matches": len(rows),
        "target_home_wins": home_wins,
        "draws": draws,
        "target_away_wins": away_wins,
        "target_home_goals": home_goals,
        "target_away_goals": away_goals,
        "games": games,
    }


def choose_useful_market(markets: dict[str, dict[str, float]]) -> dict[str, Any]:
    candidates = {
        key: markets[key]
        for key in (
            "1X", "X2", "12", "BTTS Oui", "BTTS Non",
            "Plus de 1.5 buts", "Moins de 3.5 buts",
            "Domicile plus de 0.5 but", "Extérieur plus de 0.5 but",
            "Domicile moins de 1.5 but", "Extérieur moins de 1.5 but",
        )
        if key in markets
    }
    market, stats = max(candidates.items(), key=lambda pair: (pair[1]["p10"], pair[1]["mean"]))
    return {"market": market, **stats, "fair_odds": 1.0 / stats["mean"]}


def build_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# Analyse multi-ligues — 9 septembre 2026",
        "",
        f"Générée à `{report['generated_at']}`. Les probabilités sportives ont été gelées avant lecture des cotes.",
        "",
        "## Synthèse",
        "",
        "| Match | Buts attendus | 1–N–2 | BTTS oui | +2,5 | Marché robuste du modèle | Score modal |",
        "|---|---:|---:|---:|---:|---|---:|",
    ]
    for fixture in report["fixtures"]:
        m = fixture["markets"]
        main = fixture["model_main_market"]
        lines.append(
            f"| {fixture['match']} | {fixture['lambda_home']['mean']:.2f}–{fixture['lambda_away']['mean']:.2f} | "
            f"{pct(m['1']['mean'])}–{pct(m['N']['mean'])}–{pct(m['2']['mean'])} | "
            f"{pct(m['BTTS Oui']['mean'])} | {pct(m['Plus de 2.5 buts']['mean'])} | "
            f"{main['market']} {pct(main['mean'])} | {fixture['exact_scores'][0]['score']} ({pct(fixture['exact_scores'][0]['probability'])}) |"
        )
    lines.extend(["", "## Validation par championnat", ""])
    for league in report["leagues"]:
        lines.extend([
            f"### {league['name']} ({league['country']})",
            "",
            f"- **{league['historical_matches']}** matchs historiques ; tirs cadrés couverts sur **{pct(league['sot_coverage'])}**.",
            f"- Validation chronologique : log loss score **{league['validation_score_log_loss']:.4f}**, Brier 1N2 **{league['validation_brier_1n2']:.4f}**.",
            f"- Baseline ligue : **{league['league_baseline']['score_log_loss']:.4f} / {league['league_baseline']['brier_1n2']:.4f}**.",
            f"- Loi retenue : **{league['score_law']}** ; demi-vie **{league['half_life_days']:.0f} j** ; ridge **{league['ridge']:.3f}** ; poids buts **{league['goal_weight']:.0%}**.",
            f"- Rééchantillonnages réussis : **{league['bootstrap_samples']}**.",
            "",
        ])
    for index, fixture in enumerate(report["fixtures"], start=1):
        home = fixture["profiles"]["home"]
        away = fixture["profiles"]["away"]
        hs = home["season"]
        avs = away["season"]
        lines.extend([
            f"## {index}. {fixture['match']}",
            "",
            f"Compétition : **{fixture['league_name']}** — coup d’envoi **{fixture['kickoff_paris']}** — repos **{fixture['rest']['home']['days']:.1f} j / {fixture['rest']['away']['days']:.1f} j**.",
            "",
            f"Projection centrale : **{fixture['lambda_home']['mean']:.2f}–{fixture['lambda_away']['mean']:.2f} buts attendus**.",
            "",
            "### Forces et forme",
            "",
            f"- **{fixture['home_team']}** : rang {home.get('standings', {}).get('rank', '?')}, bilan {hs['wins']}V-{hs['draws']}N-{hs['losses']}D, buts {hs['gf']}-{hs['ga']}, forme récente `{home['recent_form_newest_first']}` ; indices attaque/défense-faiblesse {home['model_attack_index']:.2f}/{home['model_defensive_weakness_index']:.2f}.",
            f"- **{fixture['away_team']}** : rang {away.get('standings', {}).get('rank', '?')}, bilan {avs['wins']}V-{avs['draws']}N-{avs['losses']}D, buts {avs['gf']}-{avs['ga']}, forme récente `{away['recent_form_newest_first']}` ; indices attaque/défense-faiblesse {away['model_attack_index']:.2f}/{away['model_defensive_weakness_index']:.2f}.",
            "",
            "Derniers matchs de l’équipe à domicile : " + "; ".join(
                f"{row['date']} {row['opponent']} {row['score']} ({row['venue']})" for row in home["recent_scores"][:5]
            ) + ".",
            "",
            "Derniers matchs de l’équipe à l’extérieur : " + "; ".join(
                f"{row['date']} {row['opponent']} {row['score']} ({row['venue']})" for row in away["recent_scores"][:5]
            ) + ".",
            "",
            "### Probabilités",
            "",
            "| Marché | Probabilité | Intervalle 10–90 % | Cote juste |",
            "|---|---:|---:|---:|",
        ])
        for market in STANDARD_ORDER:
            stats = fixture["markets"].get(market)
            if stats:
                lines.append(
                    f"| {market} | {pct(stats['mean'])} | {pct(stats['p10'])}–{pct(stats['p90'])} | {1/stats['mean']:.2f} |"
                )
        lines.extend([
            "",
            "Scores exacts : " + ", ".join(
                f"**{row['score']}** {pct(row['probability'])}" for row in fixture["exact_scores"][:6]
            ) + ".",
            "",
        ])
        h2h = fixture["h2h"]
        if h2h["matches"]:
            lines.append(
                f"Face-à-face disponibles : **{h2h['matches']}**, bilan vu depuis {fixture['home_team']} : "
                f"{h2h['target_home_wins']}V-{h2h['draws']}N-{h2h['target_away_wins']}D, buts {h2h['target_home_goals']}-{h2h['target_away_goals']}. Poids informatif faible dans le modèle."
            )
            lines.append("")
        availability = fixture["availability"]
        if availability["official_lineups_available"]:
            lines.append("Compositions officielles disponibles et contrôlées.")
        else:
            lines.append("Compositions officielles non disponibles : l’incertitude d’effectif reste ouverte.")
        if availability["injuries"]:
            lines.append("Indisponibilités API : " + ", ".join(
                f"{row['player']} ({row['team']}, {row['reason'] or row['type']})" for row in availability["injuries"]
            ) + ".")
        else:
            lines.append("Aucune indisponibilité renvoyée par l’endpoint du match ; cela ne prouve pas que l’effectif est complet.")
        official = fixture.get("official_context") or {}
        if official:
            lines.append(f"Terrain vérifié : **{official['venue']}**.")
            if official.get("absences"):
                lines.append("Absences/suspensions annoncées officiellement : **" + ", ".join(official["absences"]) + "**.")
            if official.get("available_again"):
                lines.append("Retours/disponibles annoncés : **" + ", ".join(official["available_again"]) + "**.")
            lines.append(f"{official['note']} Source : [{official['source_label']}]({official['source_url']}).")
        priced = fixture.get("price_comparison") or []
        if priced:
            lines.extend([
                "",
                "### Prix disponibles après gel du modèle",
                "",
                "| Marché | Proba modèle | Cote juste | Meilleure cote | EV centrale | EV conservatrice |",
                "|---|---:|---:|---:|---:|---:|",
            ])
            for row in priced[:8]:
                lines.append(
                    f"| {row['market']} | {pct(row['probability'])} | {row['fair_odds']:.2f} | {row['best']:.2f} | {pct(row['expected_value_best'])} | {pct(row['conservative_ev_best'])} |"
                )
        lines.append("")
    lines.extend([
        "## Interprétation",
        "",
        "Le ‘marché robuste’ est celui dont la borne basse bootstrap est la plus forte parmi une famille limitée de marchés usuels. Ce n’est pas automatiquement un bon pari : sans cote supérieure à la cote juste avec marge de sécurité, une forte probabilité peut rester un mauvais prix.",
        "",
        "Les scores exacts sont les issues individuelles les plus probables, mais restent naturellement peu probables. Cartons rouges, changements tardifs, erreurs et blessures en match ne sont pas prévisibles.",
        "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bootstrap", type=int, default=80)
    parser.add_argument("--refresh", action="store_true")
    parser.add_argument("--reprice-only", action="store_true")
    args = parser.parse_args()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    core.CACHE_DIR = CACHE_DIR
    client = core.ApiClient(refresh=args.refresh)

    if args.reprice_only:
        json_path = OUT_DIR / "analysis.json"
        markdown_path = OUT_DIR / "analysis.md"
        report = json.loads(json_path.read_text())
        for fixture in report["fixtures"]:
            fixture["official_context"] = OFFICIAL_CONTEXT[fixture["fixture_id"]]
            fixture["prices"] = core.fetch_market_prices(client, fixture["fixture_id"])
            fixture["price_comparison"] = core.price_comparison(fixture["markets"], fixture["prices"])
        report["price_mapping_revalidated_at"] = datetime.now(timezone.utc).isoformat()
        json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        markdown_path.write_text(build_markdown(report))
        print(json.dumps({"repriced": len(report["fixtures"]), "json": str(json_path), "markdown": str(markdown_path)}, ensure_ascii=False))
        return

    target_items = []
    for fixture_id in TARGET_IDS:
        payload = client.get("fixtures", {"id": fixture_id, "timezone": "Europe/Paris"})
        if len(payload.get("response") or []) != 1:
            raise RuntimeError(f"Fixture {fixture_id} unavailable")
        target_items.append(payload["response"][0])
    targets = [core.item_to_match(item) for item in target_items]
    targets_by_league: dict[int, list[core.Match]] = {}
    for item, target in zip(target_items, targets):
        targets_by_league.setdefault(int(item["league"]["id"]), []).append(target)

    fixture_reports: list[dict[str, Any]] = []
    league_reports: list[dict[str, Any]] = []
    for league_id, league_targets in targets_by_league.items():
        config = LEAGUES[league_id]
        cutoff = min(target.date for target in league_targets)
        raw_items = []
        for season in config["seasons"]:
            payload = client.get("fixtures", {"league": league_id, "season": season, "timezone": "UTC"})
            raw_items.extend(payload.get("response") or [])
        by_id = {int(item["fixture"]["id"]): item for item in raw_items}
        all_matches = [core.item_to_match(item) for item in by_id.values()]
        historical = sorted(
            [match for match in all_matches if match.status in core.COMPLETED and match.date < cutoff],
            key=lambda match: match.date,
        )
        goal_counts = {match.fixture_id: (match.home_goals, match.away_goals) for match in historical}
        teams = sorted(
            {match.home_id for match in historical}
            | {match.away_id for match in historical}
            | {target.home_id for target in league_targets}
            | {target.away_id for target in league_targets}
        )
        rest_map = core.rest_features(historical)

        details: dict[int, dict[str, Any]] = {}
        for group in core.chunks([match.fixture_id for match in historical], 20):
            payload = client.get("fixtures", {"ids": "-".join(map(str, group)), "timezone": "UTC"})
            for item in payload.get("response") or []:
                details[int(item["fixture"]["id"])] = core.extract_detail(item)
        sot_counts: dict[int, tuple[int, int]] = {}
        red_factors: dict[int, float] = {}
        for match in historical:
            detail = details.get(match.fixture_id) or {}
            hs = (detail.get("home") or {}).get("sot")
            aas = (detail.get("away") or {}).get("sot")
            if hs is not None and aas is not None:
                sot_counts[match.fixture_id] = (int(round(hs)), int(round(aas)))
            minute = detail.get("first_red_minute")
            red_factors[match.fixture_id] = (
                max(0.35, min(1.0, float(minute) / 90.0)) if minute is not None and minute < 75 else 1.0
            )

        dc_hl, dc_ridge, dc_validation = core.choose_hyperparameters(
            historical, goal_counts, teams, rest_map, red_factors, True
        )
        ind_hl, ind_ridge, ind_validation = core.choose_hyperparameters(
            historical, goal_counts, teams, rest_map, red_factors, False
        )
        if dc_validation[0]["score_log_loss"] <= ind_validation[0]["score_log_loss"]:
            use_dc, half_life, ridge, validation = True, dc_hl, dc_ridge, dc_validation
        else:
            use_dc, half_life, ridge, validation = False, ind_hl, ind_ridge, ind_validation
        baseline = core.constant_league_baseline(historical)
        goal_weight, shot_diagnostics = core.choose_shot_weight(
            historical, goal_counts, sot_counts, teams, rest_map, red_factors,
            half_life, ridge, use_dc,
        )
        final_goal_fit = core.fit_count_model(
            historical, goal_counts, teams, cutoff, half_life, ridge, rest_map, red_factors, use_dc
        )
        final_sot_fit = None
        if shot_diagnostics["used"] and goal_weight < 0.999:
            final_sot_fit = core.fit_count_model(
                historical, sot_counts, teams, cutoff, half_life, ridge, rest_map, red_factors, False
            )

        current_rests = {}
        rest_details = {}
        availability = {}
        for target in league_targets:
            current_rests[target.fixture_id], rest_details[target.fixture_id] = core.current_rest_from_recent(client, target)
            availability[target.fixture_id] = core.availability(client, target.fixture_id)
        samples = core.bootstrap_predictions(
            np.random.default_rng(20260909 + league_id), historical, goal_counts, sot_counts,
            teams, cutoff, rest_map, red_factors, half_life, ridge, goal_weight,
            league_targets, current_rests, final_goal_fit, final_sot_fit, use_dc, args.bootstrap,
        )
        standings = core.league_table(historical, 2026, cutoff)
        bootstrap_samples = min(
            len(next(iter(samples[target.fixture_id].values()))) for target in league_targets
        )
        league_reports.append({
            "league_id": league_id,
            "name": config["name"],
            "country": config["country"],
            "historical_matches": len(historical),
            "sot_coverage": len(sot_counts) / max(len(historical), 1),
            "score_law": "Dixon-Coles" if use_dc else "Poisson indépendant",
            "half_life_days": half_life,
            "ridge": ridge,
            "goal_weight": goal_weight,
            "validation_score_log_loss": validation[0]["score_log_loss"],
            "validation_brier_1n2": validation[0]["brier_1n2"],
            "league_baseline": baseline,
            "challengers": {"dixon_coles": dc_validation[0], "independent_poisson": ind_validation[0]},
            "shot_diagnostics": shot_diagnostics,
            "bootstrap_samples": bootstrap_samples,
        })

        prior_sot = [match for match in historical if match.fixture_id in sot_counts]
        conv_h = sum(goal_counts[m.fixture_id][0] for m in prior_sot) / max(sum(sot_counts[m.fixture_id][0] for m in prior_sot), 1)
        conv_a = sum(goal_counts[m.fixture_id][1] for m in prior_sot) / max(sum(sot_counts[m.fixture_id][1] for m in prior_sot), 1)
        for target in league_targets:
            glh, gla, rho = core.predict_lambdas(final_goal_fit, target, current_rests[target.fixture_id])
            lh, la = glh, gla
            if final_sot_fit is not None and goal_weight < 0.999:
                slh, sla, _ = core.predict_lambdas(final_sot_fit, target, current_rests[target.fixture_id])
                lh = math.exp(goal_weight * math.log(glh) + (1 - goal_weight) * math.log(max(0.05, slh * conv_h)))
                la = math.exp(goal_weight * math.log(gla) + (1 - goal_weight) * math.log(max(0.05, sla * conv_a)))
            central_matrix = core.score_matrix(lh, la, rho, use_dc)
            summary = core.summarise_predictions(target, samples[target.fixture_id], central_matrix)
            summary.update({
                "league_id": league_id,
                "league_name": config["name"],
                "country": config["country"],
                "home_team": target.home_name,
                "away_team": target.away_name,
                "kickoff_paris": target.date.astimezone().strftime("%d/%m/%Y %H:%M %Z"),
                "rest": rest_details[target.fixture_id],
                "availability": availability[target.fixture_id],
                "status_at_analysis": target.status,
                "profiles": {
                    "home": core.team_profile(target.home_id, "home", target, historical, details, standings, final_goal_fit),
                    "away": core.team_profile(target.away_id, "away", target, historical, details, standings, final_goal_fit),
                },
                "h2h": h2h_summary(target, historical),
                "official_context": OFFICIAL_CONTEXT[target.fixture_id],
            })
            summary["model_main_market"] = choose_useful_market(summary["markets"])
            # Prices cannot influence anything above this line.
            summary["prices"] = core.fetch_market_prices(client, target.fixture_id)
            summary["price_comparison"] = core.price_comparison(summary["markets"], summary["prices"])
            fixture_reports.append(summary)

    ordering = {fixture_id: index for index, fixture_id in enumerate(TARGET_IDS)}
    fixture_reports.sort(key=lambda fixture: ordering[fixture["fixture_id"]])
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "target_date": "2026-09-09",
        "method": "separate time-decayed league models, chronological validation, optional SOT ensemble, block bootstrap",
        "api_calls_network": client.calls,
        "api_requests_remaining": client.remaining,
        "leagues": league_reports,
        "fixtures": fixture_reports,
    }
    json_path = OUT_DIR / "analysis.json"
    markdown_path = OUT_DIR / "analysis.md"
    json_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    markdown_path.write_text(build_markdown(report))
    print(json.dumps({
        "fixtures": [fixture["match"] for fixture in fixture_reports],
        "leagues": [{"name": league["name"], "matches": league["historical_matches"], "law": league["score_law"]} for league in league_reports],
        "api_calls_network": client.calls,
        "api_requests_remaining": client.remaining,
        "json": str(json_path),
        "markdown": str(markdown_path),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
