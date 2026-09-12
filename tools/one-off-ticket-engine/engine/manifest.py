"""RUN_MANIFEST.json (section 38) — full provenance of one run."""
import json
import subprocess


def git_head_sha():
    try:
        return subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip()
    except Exception:
        return None


def build_manifest(target_date, league_manifest, fixture_ids, odds_hash, bookmaker_mode,
                    bookmaker_name, hyperparams_by_league, bootstrap_stage1, bootstrap_stage2,
                    simulation_count, code_version, seed, cfg_hash, phase):
    return {
        "engine": "ONE_OFF_TICKET_OPTIMIZER_V1",
        "phase": phase,
        "target_date": target_date,
        "league_manifest": league_manifest,
        "fixture_ids": fixture_ids,
        "odds_snapshot_hash": odds_hash,
        "bookmaker_mode": bookmaker_mode,
        "bookmaker_name": bookmaker_name,
        "model_hyperparameters_by_league": hyperparams_by_league,
        "bootstrap_stage1_draws": bootstrap_stage1,
        "bootstrap_stage2_draws": bootstrap_stage2,
        "simulation_count": simulation_count,
        "code_version_git_sha": code_version,
        "seed": seed,
        "config_hash": cfg_hash,
    }


def write_manifest(run_dir, manifest: dict):
    (run_dir / "RUN_MANIFEST.json").write_text(json.dumps(manifest, indent=2, default=str))
