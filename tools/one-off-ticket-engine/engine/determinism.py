"""Deterministic seeding (section 37): seed = SHA256(date + config_hash +
odds_snapshot_hash). Same inputs -> same seed -> byte-identical outputs
given the same library versions."""
import hashlib
import json


def config_hash(cfg_dict: dict) -> str:
    canonical = json.dumps(cfg_dict, sort_keys=True, default=str)
    return hashlib.sha256(canonical.encode()).hexdigest()


def odds_snapshot_hash(quotes: list) -> str:
    rows = sorted(
        f"{q.fixture_id}|{q.bookmaker}|{q.market}|{q.selection}|{q.line}|{q.raw_odds}"
        for q in quotes
    )
    return hashlib.sha256("\n".join(rows).encode()).hexdigest()


def derive_seed(target_date: str, cfg_hash: str, odds_hash: str) -> int:
    digest = hashlib.sha256(f"{target_date}{cfg_hash}{odds_hash}".encode()).hexdigest()
    return int(digest[:16], 16)
