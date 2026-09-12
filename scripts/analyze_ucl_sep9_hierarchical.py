#!/usr/bin/env python3
"""Pre-match UCL analysis using a multi-league dynamic hierarchical Dixon-Coles MAP model.

This deliberately does not call API-Football /odds or /predictions. It is a
practical MAP approximation of the architecture described in the user's
research note; it does not claim to be a fully backtested posterior model.
"""
from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
from scipy.optimize import minimize
from scipy.stats import poisson


REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "tools" / "one-off-ticket-engine"))
from engine.api_client import ApiClient  # noqa: E402
from engine.score_matrix import fit_dixon_coles_rho  # noqa: E402


TARGETS = [
    {"fixture_id": 1635741, "home_league": 78, "away_league": 103},
    {"fixture_id": 1635628, "home_league": 140, "away_league": 88},
    {"fixture_id": 1635686, "home_league": 39, "away_league": 140},
    {"fixture_id": 1635705, "home_league": 61, "away_league": 332},
    {"fixture_id": 1635736, "home_league": 94, "away_league": 203},
    {"fixture_id": 1635698, "home_league": 135, "away_league": 39},
]

DOMESTIC_LEAGUES = [39, 61, 78, 88, 94, 103, 135, 140, 203, 332]
CONTINENTAL_COMPETITIONS = [2, 3, 848]
SEASONS = [2024, 2025, 2026]
FINISHED = {"FT", "AET", "PEN"}
VARIANTS = [
    {"half_life_days": 120.0, "team_ridge": 3.0},
    {"half_life_days": 240.0, "team_ridge": 3.0},
    {"half_life_days": 480.0, "team_ridge": 3.0},
    {"half_life_days": 240.0, "team_ridge": 1.5},
    {"half_life_days": 240.0, "team_ridge": 6.0},
]


@dataclass
class Record:
    fixture_id: int
    date: datetime
    competition_id: int
    round_name: str
    home_id: int
    away_id: int
    home_goals: int
    away_goals: int


def parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def fetch_targets(client: ApiClient):
    rows = []
    for target in TARGETS:
        payload = client.get("/fixtures", {"id": target["fixture_id"]}, use_cache=False)
        response = payload.get("response", [])
        if not response:
            raise RuntimeError(f"Fixture introuvable: {target['fixture_id']}")
        fixture = response[0]
        if fixture["league"]["id"] != 2:
            raise RuntimeError(f"Fixture {target['fixture_id']} hors Ligue des champions")
        rows.append({**target, "fixture": fixture})
    return rows


def fetch_history(client: ApiClient, cutoff: datetime, targets):
    records: dict[int, Record] = {}
    team_league: dict[int, int] = {}
    coverage = []
    all_competitions = DOMESTIC_LEAGUES + CONTINENTAL_COMPETITIONS
    for competition_id in all_competitions:
        kept = 0
        for season in SEASONS:
            payload = client.get("/fixtures", {"league": competition_id, "season": season})
            response = payload.get("response", [])
            for fixture in response:
                status = fixture["fixture"]["status"]["short"]
                date = parse_date(fixture["fixture"]["date"])
                home_goals = fixture.get("goals", {}).get("home")
                away_goals = fixture.get("goals", {}).get("away")
                if status not in FINISHED or date >= cutoff:
                    continue
                if home_goals is None or away_goals is None:
                    continue
                row = Record(
                    fixture_id=fixture["fixture"]["id"],
                    date=date,
                    competition_id=competition_id,
                    round_name=fixture["league"].get("round") or "",
                    home_id=fixture["teams"]["home"]["id"],
                    away_id=fixture["teams"]["away"]["id"],
                    home_goals=int(home_goals),
                    away_goals=int(away_goals),
                )
                records[row.fixture_id] = row
                kept += 1
                if competition_id in DOMESTIC_LEAGUES:
                    team_league[row.home_id] = competition_id
                    team_league[row.away_id] = competition_id
        coverage.append({"competition_id": competition_id, "matches": kept})

    for target in targets:
        fixture = target["fixture"]
        team_league[fixture["teams"]["home"]["id"]] = target["home_league"]
        team_league[fixture["teams"]["away"]["id"]] = target["away_league"]

    return sorted(records.values(), key=lambda row: row.date), team_league, coverage


def recent_workload(records, team_id: int, cutoff: datetime):
    team_rows = [row for row in records if row.home_id == team_id or row.away_id == team_id]
    team_rows.sort(key=lambda row: row.date, reverse=True)
    rest_days = (cutoff.date() - team_rows[0].date.date()).days if team_rows else None
    return {
        "rest_days": rest_days,
        "matches_last_7_days": sum((cutoff - row.date).days < 7 for row in team_rows),
        "matches_last_14_days": sum((cutoff - row.date).days < 14 for row in team_rows),
        "matches_last_28_days": sum((cutoff - row.date).days < 28 for row in team_rows),
    }


def dixon_coles_tau(home_goals, away_goals, lam_h, lam_a, rho):
    if home_goals == 0 and away_goals == 0:
        return 1 - lam_h * lam_a * rho
    if home_goals == 0 and away_goals == 1:
        return 1 + lam_h * rho
    if home_goals == 1 and away_goals == 0:
        return 1 + lam_a * rho
    if home_goals == 1 and away_goals == 1:
        return 1 - rho
    return 1.0


class HierarchicalModel:
    def __init__(self, records, team_league, cutoff, half_life_days, team_ridge):
        self.records = records
        self.team_league = team_league
        self.cutoff = cutoff
        self.half_life_days = half_life_days
        self.team_ridge = team_ridge
        self.team_ids = sorted({team for row in records for team in (row.home_id, row.away_id)})
        self.comp_ids = sorted({row.competition_id for row in records} | {2})
        self.league_ids = [0] + sorted(set(DOMESTIC_LEAGUES))
        self.team_index = {value: index for index, value in enumerate(self.team_ids)}
        self.comp_index = {value: index for index, value in enumerate(self.comp_ids)}
        self.league_index = {value: index for index, value in enumerate(self.league_ids)}

        self.n_teams = len(self.team_ids)
        self.n_comps = len(self.comp_ids)
        self.n_leagues = len(self.league_ids)
        cursor = 2
        self.s_comp = slice(cursor, cursor + self.n_comps)
        cursor += self.n_comps
        self.s_league_att = slice(cursor, cursor + self.n_leagues)
        cursor += self.n_leagues
        self.s_league_def = slice(cursor, cursor + self.n_leagues)
        cursor += self.n_leagues
        self.s_team_att = slice(cursor, cursor + self.n_teams)
        cursor += self.n_teams
        self.s_team_def = slice(cursor, cursor + self.n_teams)
        cursor += self.n_teams
        self.n_parameters = cursor
        self.params = None
        self.fit_result = None
        self.rho = 0.0
        self.rho_fitted = False

    def _arrays(self):
        home = np.array([self.team_index[row.home_id] for row in self.records], dtype=int)
        away = np.array([self.team_index[row.away_id] for row in self.records], dtype=int)
        comp = np.array([self.comp_index[row.competition_id] for row in self.records], dtype=int)
        home_league = np.array(
            [self.league_index.get(self.team_league.get(row.home_id, 0), 0) for row in self.records],
            dtype=int,
        )
        away_league = np.array(
            [self.league_index.get(self.team_league.get(row.away_id, 0), 0) for row in self.records],
            dtype=int,
        )
        goals_h = np.array([row.home_goals for row in self.records], dtype=float)
        goals_a = np.array([row.away_goals for row in self.records], dtype=float)
        age_days = np.array([max((self.cutoff - row.date).days, 0) for row in self.records], dtype=float)
        weights = np.power(0.5, age_days / self.half_life_days)
        for index, row in enumerate(self.records):
            round_name = row.round_name.lower()
            if row.competition_id in CONTINENTAL_COMPETITIONS and any(
                word in round_name for word in ("qualifying", "play-off", "playoff", "preliminary")
            ):
                weights[index] *= 0.5
        weights /= max(float(weights.mean()), 1e-9)
        return home, away, comp, home_league, away_league, goals_h, goals_a, weights

    def fit(self):
        home, away, comp, home_league, away_league, goals_h, goals_a, weights = self._arrays()
        mean_home = np.average(goals_h, weights=weights)
        mean_away = np.average(goals_a, weights=weights)
        x0 = np.zeros(self.n_parameters)
        x0[0] = math.log(max(mean_away, 0.2))
        x0[1] = math.log(max(mean_home / max(mean_away, 0.2), 0.5))

        comp_ridge = 8.0
        league_ridge = 5.0

        def objective(x):
            comp_effect = x[self.s_comp]
            league_att = x[self.s_league_att]
            league_def = x[self.s_league_def]
            team_att = x[self.s_team_att]
            team_def = x[self.s_team_def]
            eta_h = (
                x[0]
                + x[1]
                + comp_effect[comp]
                + league_att[home_league]
                + team_att[home]
                + league_def[away_league]
                + team_def[away]
            )
            eta_a = (
                x[0]
                + comp_effect[comp]
                + league_att[away_league]
                + team_att[away]
                + league_def[home_league]
                + team_def[home]
            )
            eta_h = np.clip(eta_h, -4, 3)
            eta_a = np.clip(eta_a, -4, 3)
            lam_h = np.exp(eta_h)
            lam_a = np.exp(eta_a)
            loss = float(np.sum(weights * (lam_h - goals_h * eta_h + lam_a - goals_a * eta_a)))
            loss += 0.5 * comp_ridge * float(np.dot(comp_effect, comp_effect))
            loss += 0.5 * league_ridge * (
                float(np.dot(league_att, league_att)) + float(np.dot(league_def, league_def))
            )
            loss += 0.5 * self.team_ridge * (
                float(np.dot(team_att, team_att)) + float(np.dot(team_def, team_def))
            )

            residual_h = weights * (lam_h - goals_h)
            residual_a = weights * (lam_a - goals_a)
            grad = np.zeros_like(x)
            grad[0] = np.sum(residual_h + residual_a)
            grad[1] = np.sum(residual_h)
            np.add.at(grad[self.s_comp], comp, residual_h + residual_a)
            np.add.at(grad[self.s_league_att], home_league, residual_h)
            np.add.at(grad[self.s_league_att], away_league, residual_a)
            np.add.at(grad[self.s_league_def], away_league, residual_h)
            np.add.at(grad[self.s_league_def], home_league, residual_a)
            np.add.at(grad[self.s_team_att], home, residual_h)
            np.add.at(grad[self.s_team_att], away, residual_a)
            np.add.at(grad[self.s_team_def], away, residual_h)
            np.add.at(grad[self.s_team_def], home, residual_a)
            grad[self.s_comp] += comp_ridge * comp_effect
            grad[self.s_league_att] += league_ridge * league_att
            grad[self.s_league_def] += league_ridge * league_def
            grad[self.s_team_att] += self.team_ridge * team_att
            grad[self.s_team_def] += self.team_ridge * team_def
            return loss, grad

        bounds = [(-2.5, 1.5), (-0.5, 0.8)]
        bounds += [(-1.0, 1.0)] * self.n_comps
        bounds += [(-1.3, 1.3)] * (2 * self.n_leagues)
        bounds += [(-2.2, 2.2)] * (2 * self.n_teams)
        self.fit_result = minimize(
            objective,
            x0,
            method="L-BFGS-B",
            jac=True,
            bounds=bounds,
            options={"maxiter": 600, "ftol": 1e-9, "maxls": 40},
        )
        self.params = self.fit_result.x

        ucl_rows = []
        for row, weight in zip(self.records, weights):
            if row.competition_id != 2:
                continue
            lam_h, lam_a = self.predict_lambdas(row.home_id, row.away_id, 2)
            ucl_rows.append((row.home_goals, row.away_goals, lam_h, lam_a, float(weight)))
        self.rho, self.rho_fitted = fit_dixon_coles_rho(ucl_rows)
        return self

    def predict_lambdas(self, home_id, away_id, competition_id=2):
        x = self.params
        home = self.team_index.get(home_id)
        away = self.team_index.get(away_id)
        comp = self.comp_index[competition_id]
        home_league = self.league_index.get(self.team_league.get(home_id, 0), 0)
        away_league = self.league_index.get(self.team_league.get(away_id, 0), 0)
        team_att = x[self.s_team_att]
        team_def = x[self.s_team_def]
        league_att = x[self.s_league_att]
        league_def = x[self.s_league_def]
        eta_h = x[0] + x[1] + x[self.s_comp][comp] + league_att[home_league] + league_def[away_league]
        eta_a = x[0] + x[self.s_comp][comp] + league_att[away_league] + league_def[home_league]
        if home is not None:
            eta_h += team_att[home]
            eta_a += team_def[home]
        if away is not None:
            eta_a += team_att[away]
            eta_h += team_def[away]
        return float(np.exp(np.clip(eta_h, -4, 3))), float(np.exp(np.clip(eta_a, -4, 3)))

    def team_indices(self, team_id):
        x = self.params
        team = self.team_index.get(team_id)
        league = self.league_index.get(self.team_league.get(team_id, 0), 0)
        attack = x[self.s_league_att][league]
        defence_weakness = x[self.s_league_def][league]
        if team is not None:
            attack += x[self.s_team_att][team]
            defence_weakness += x[self.s_team_def][team]
        return float(math.exp(attack)), float(math.exp(defence_weakness))


def score_matrix(lam_h, lam_a, rho, size=12):
    goals = np.arange(size + 1)
    matrix = np.outer(poisson.pmf(goals, lam_h), poisson.pmf(goals, lam_a))
    for home in (0, 1):
        for away in (0, 1):
            matrix[home, away] *= dixon_coles_tau(home, away, lam_h, lam_a, rho)
    matrix = np.clip(matrix, 0, None)
    return matrix / matrix.sum()


def market_values(matrix):
    size = matrix.shape[0]
    home_grid, away_grid = np.meshgrid(np.arange(size), np.arange(size), indexing="ij")
    total = home_grid + away_grid
    home = float(matrix[home_grid > away_grid].sum())
    draw = float(matrix[home_grid == away_grid].sum())
    away = float(matrix[home_grid < away_grid].sum())
    return {
        "home_win": home,
        "draw": draw,
        "away_win": away,
        "home_or_draw": home + draw,
        "away_or_draw": away + draw,
        "btts": float(matrix[(home_grid >= 1) & (away_grid >= 1)].sum()),
        "over_1_5": float(matrix[total >= 2].sum()),
        "over_2_5": float(matrix[total >= 3].sum()),
        "under_2_5": float(matrix[total <= 2].sum()),
        "under_3_5": float(matrix[total <= 3].sum()),
        "under_4_5": float(matrix[total <= 4].sum()),
        "home_over_0_5": float(matrix[home_grid >= 1].sum()),
        "home_over_1_5": float(matrix[home_grid >= 2].sum()),
        "away_over_0_5": float(matrix[away_grid >= 1].sum()),
        "away_over_1_5": float(matrix[away_grid >= 2].sum()),
    }


def top_scores(matrix, count=8):
    rows = []
    for flat_index in np.argsort(matrix.ravel())[::-1][:count]:
        home, away = np.unravel_index(flat_index, matrix.shape)
        rows.append({"score": f"{home}-{away}", "probability_pct": round(float(matrix[home, away]) * 100, 2)})
    return rows


def analyse_target(target, models, records, cutoff, client):
    fixture = target["fixture"]
    home = fixture["teams"]["home"]
    away = fixture["teams"]["away"]
    matrices = []
    lambda_rows = []
    strength_rows = []
    for model in models:
        lam_h, lam_a = model.predict_lambdas(home["id"], away["id"])
        matrices.append(score_matrix(lam_h, lam_a, model.rho))
        lambda_rows.append((lam_h, lam_a))
        strength_rows.append((model.team_indices(home["id"]), model.team_indices(away["id"])))
    matrix = np.mean(matrices, axis=0)
    central = market_values(matrix)
    variant_markets = [market_values(candidate) for candidate in matrices]
    intervals = {}
    for key in central:
        values = np.array([row[key] for row in variant_markets])
        intervals[key] = {
            "central_pct": round(central[key] * 100, 1),
            "sensitivity_low_pct": round(float(values.min()) * 100, 1),
            "sensitivity_high_pct": round(float(values.max()) * 100, 1),
            "conservative_pct": round(float(values.min()) * 100, 1),
        }

    lineups = client.get("/fixtures/lineups", {"fixture": target["fixture_id"]}, use_cache=False).get("response", [])
    injuries = client.get("/injuries", {"fixture": target["fixture_id"]}, use_cache=False).get("response", [])
    avg_lam_h = float(np.mean([row[0] for row in lambda_rows]))
    avg_lam_a = float(np.mean([row[1] for row in lambda_rows]))

    return {
        "fixture_id": target["fixture_id"],
        "kickoff": fixture["fixture"]["date"],
        "home": {"id": home["id"], "name": home["name"], "league_id": target["home_league"]},
        "away": {"id": away["id"], "name": away["name"], "league_id": target["away_league"]},
        "expected_goals": {"home": round(avg_lam_h, 3), "away": round(avg_lam_a, 3)},
        "expected_total_goals": round(avg_lam_h + avg_lam_a, 3),
        "variant_lambdas": [
            {"half_life_days": variant["half_life_days"], "team_ridge": variant["team_ridge"],
             "home": round(lambdas[0], 3), "away": round(lambdas[1], 3)}
            for variant, lambdas in zip(VARIANTS, lambda_rows)
        ],
        "relative_strength_indices": {
            "home_attack": round(float(np.mean([row[0][0] for row in strength_rows])), 3),
            "home_defence_weakness": round(float(np.mean([row[0][1] for row in strength_rows])), 3),
            "away_attack": round(float(np.mean([row[1][0] for row in strength_rows])), 3),
            "away_defence_weakness": round(float(np.mean([row[1][1] for row in strength_rows])), 3),
        },
        "probabilities": intervals,
        "top_scores": top_scores(matrix),
        "most_likely_score": top_scores(matrix, 1)[0],
        "workload": {
            "home": recent_workload(records, home["id"], cutoff),
            "away": recent_workload(records, away["id"], cutoff),
        },
        "pre_match_coverage": {
            "official_lineups_available": len(lineups) >= 2,
            "lineup_rows": len(lineups),
            "injury_rows": len(injuries),
            "lineup_adjustment_applied": False,
            "shots_model_applied": False,
        },
        "limitations": [
            "Pas de cotes ni de /predictions dans les probabilités.",
            "Couche tirs omise: couverture historique insuffisante sans milliers d'appels par match.",
            "Effets joueurs omis tant que les compositions officielles et coefficients régularisés ne sont pas disponibles.",
            "Intervalles = sensibilité aux hyperparamètres, pas intervalles postérieurs calibrés.",
            "Aucune minute de but dérivée de la matrice de score: un modèle temporel séparé serait requis.",
        ],
    }


def main():
    client = ApiClient()
    targets = fetch_targets(client)
    cutoff = min(parse_date(target["fixture"]["fixture"]["date"]) for target in targets)
    records, team_league, coverage = fetch_history(client, cutoff, targets)
    if len(records) < 1000:
        raise RuntimeError(f"Historique insuffisant: {len(records)} matchs seulement")

    models = []
    for variant in VARIANTS:
        model = HierarchicalModel(
            records,
            team_league,
            cutoff,
            variant["half_life_days"],
            variant["team_ridge"],
        ).fit()
        models.append(model)
        print(
            f"fit H={variant['half_life_days']:.0f} ridge={variant['team_ridge']:.1f} "
            f"success={model.fit_result.success} rho={model.rho:.4f}",
            flush=True,
        )

    analyses = []
    for target in targets:
        result = analyse_target(target, models, records, cutoff, client)
        analyses.append(result)
        score = result["most_likely_score"]
        print(
            f"{result['home']['name']} - {result['away']['name']}: "
            f"{score['score']} ({score['probability_pct']:.2f}%)",
            flush=True,
        )

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "prediction_cutoff": cutoff.isoformat(),
        "method": {
            "family": "Dynamic multi-league hierarchical Poisson MAP + Dixon-Coles",
            "history_seasons": SEASONS,
            "domestic_leagues": DOMESTIC_LEAGUES,
            "continental_competitions": CONTINENTAL_COMPETITIONS,
            "n_history_matches": len(records),
            "n_teams": len(models[0].team_ids),
            "variants": VARIANTS,
            "rho_values": [round(model.rho, 5) for model in models],
            "bookmaker_odds_used": False,
            "api_predictions_used": False,
            "calibration_status": "NOT_AVAILABLE_FOR_THIS_NEW_MODEL",
            "implementation_note": "MAP/time-decay approximation; not a full MCMC state-space posterior.",
        },
        "coverage": coverage,
        "matches": analyses,
    }
    out_dir = REPO / "data" / "match-simulation" / "2026-09-09"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "ucl-sep9-hierarchical-analysis.json"
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"REPORT={out_path}")


if __name__ == "__main__":
    main()
