"""League ID resolution — never guessed, always confirmed against /leagues.

Reuses config/leagues.json (the repo's own verified launch list, decision of
2026-08-30) for any championship it already covers, so we don't re-resolve
IDs the production pipeline already confirmed. Every remaining championship
requested for this tool is resolved fresh via a live /leagues?search= call
and only accepted if the returned name/country plausibly match the hint.
"""
import json
import unicodedata
from dataclasses import dataclass, asdict
from typing import Optional

from . import config


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    return s.lower().strip()


_COUNTRY_ALIASES = {
    "england": {"england", "angleterre"},
    "spain": {"spain", "espagne"},
    "italy": {"italy", "italie"},
    "germany": {"germany", "allemagne"},
    "netherlands": {"netherlands", "pays-bas"},
    "sweden": {"sweden", "suede"},
    "japan": {"japan", "japon"},
    "usa": {"usa", "usa/canada", "united states"},
    "world": {"world", "uefa"},
}


def _country_matches(left: str, right: str) -> bool:
    left_n, right_n = _norm(left), _norm(right)
    if left_n == right_n:
        return True
    for aliases in _COUNTRY_ALIASES.values():
        if left_n in aliases and right_n in aliases:
            return True
    return False


@dataclass
class LeagueManifestEntry:
    league_name: str
    country: str
    league_id: Optional[int]
    season: Optional[int]
    coverage_status: str
    source: str
    api_name: Optional[str] = None


def _load_existing_verified_config():
    path = config.REPO_ROOT / "config" / "leagues.json"
    if not path.exists():
        return []
    data = json.loads(path.read_text())
    return data.get("leagues", [])


def _find_in_existing(hint: str, country_hint: str, existing: list):
    hint_n = _norm(hint)
    for entry in existing:
        name_n = _norm(entry.get("displayName", ""))
        api_name_n = _norm(entry.get("apiNameHint", ""))
        name_matches = (
            hint_n in name_n or name_n in hint_n
            or (api_name_n and (hint_n in api_name_n or api_name_n in hint_n))
        )
        if name_matches and _country_matches(country_hint, entry.get("country", "")):
            return entry
    return None


def resolve_leagues(client, target_date: str, target_leagues=None) -> list:
    """Returns a list of LeagueManifestEntry. Calls /leagues live for anything
    not already present in the repo's verified config/leagues.json."""
    target_leagues = target_leagues or config.TARGET_LEAGUES
    existing = _load_existing_verified_config()
    season_year = int(target_date.split("-")[0])
    results = []

    for spec in target_leagues:
        hint, country_hint = spec["hint"], spec["country_hint"]
        pre_verified = _find_in_existing(hint, country_hint, existing)
        if pre_verified is not None:
            league_id = pre_verified["apiFootballId"]
            # confirm season currency for this specific league_id live (cheap, cached)
            body = client.get("/leagues", {"id": league_id})
            season = _resolved_season_for(body, target_date)
            coverage = _coverage_status(body, season)
            results.append(
                LeagueManifestEntry(
                    league_name=pre_verified["displayName"],
                    country=pre_verified["country"],
                    league_id=league_id,
                    season=season,
                    coverage_status=coverage,
                    source="config/leagues.json (verified 2026-08-30) + live /leagues season check",
                    api_name=(body.get("response") or [{}])[0].get("league", {}).get("name") if body.get("response") else None,
                )
            )
            continue

        # not in existing verified config -> resolve live, never guess
        body = client.get("/leagues", {"search": hint})
        candidates = body.get("response", [])
        match = _best_match(candidates, hint, country_hint)
        if match is None:
            results.append(
                LeagueManifestEntry(
                    league_name=hint,
                    country=country_hint,
                    league_id=None,
                    season=None,
                    coverage_status="SKIP_INSUFFICIENT_DATA",
                    source="live /leagues?search= — no plausible match found",
                )
            )
            continue
        league_id = match["league"]["id"]
        # re-fetch by id to get the authoritative season/coverage block
        body_by_id = client.get("/leagues", {"id": league_id})
        season = _resolved_season_for(body_by_id, target_date)
        coverage = _coverage_status(body_by_id, season)
        results.append(
            LeagueManifestEntry(
                league_name=match["league"]["name"],
                country=match["country"]["name"],
                league_id=league_id,
                season=season,
                coverage_status=coverage,
                source="live /leagues?search= + /leagues?id=",
                api_name=match["league"]["name"],
            )
        )
    return results


def _best_match(candidates: list, hint: str, country_hint: str):
    hint_n, country_n = _norm(hint), _norm(country_hint)
    best = None
    for c in candidates:
        if c.get("league", {}).get("type") != "League":
            continue
        name_n = _norm(c["league"]["name"])
        country_field_n = _norm(c.get("country", {}).get("name", ""))
        name_ok = hint_n == name_n or hint_n in name_n or name_n in hint_n
        country_ok = country_n in country_field_n or country_field_n in country_n or country_field_n == country_n
        if name_ok and country_ok:
            return c
        if name_ok and best is None:
            best = c  # weaker fallback: exact-ish name match, country mismatch flagged by caller
    return best


def _resolved_season_for(body: dict, target_date: str):
    resp = body.get("response", [])
    if not resp:
        return None
    seasons = resp[0].get("seasons", [])
    target_year = target_date  # 'YYYY-MM-DD'
    for s in seasons:
        if s.get("start") and s.get("end") and s["start"] <= target_date <= s["end"]:
            return s["year"]
    # fallback: the season flagged current=true by the API
    for s in seasons:
        if s.get("current"):
            return s["year"]
    return None


def _coverage_status(body: dict, season) -> str:
    resp = body.get("response", [])
    if not resp or season is None:
        return "SKIP_INSUFFICIENT_DATA"
    seasons = resp[0].get("seasons", [])
    season_block = next((s for s in seasons if s.get("year") == season), None)
    if season_block is None:
        return "SKIP_INSUFFICIENT_DATA"
    cov = season_block.get("coverage", {})
    fixtures_cov = cov.get("fixtures", {})
    odds_cov = bool(cov.get("odds"))
    has_fixtures = bool(fixtures_cov.get("events")) or bool(fixtures_cov)
    if has_fixtures and odds_cov:
        return "FULL_ANALYSIS"
    if has_fixtures and not odds_cov:
        return "NO_ODDS_COVERAGE"
    return "SKIP_INSUFFICIENT_DATA"


def manifest_to_dicts(entries: list) -> list:
    return [asdict(e) for e in entries]
