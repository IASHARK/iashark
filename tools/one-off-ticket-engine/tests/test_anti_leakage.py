from engine.fixtures import fetch_finished_history, fetch_fixtures_for_date
from engine.leagues import LeagueManifestEntry


class FakeClient:
    def __init__(self, responses):
        self.responses = responses  # dict: (endpoint, frozenset(params.items())) -> body

    def get(self, endpoint, params, use_cache=True):
        key = (endpoint, tuple(sorted(params.items())))
        return self.responses[key]


def _fixture_item(fid, date, status, gh=None, ga=None):
    return {
        "fixture": {"id": fid, "date": date, "status": {"short": status}},
        "league": {"round": "Regular Season - 3"},
        "teams": {"home": {"id": 1, "name": "A"}, "away": {"id": 2, "name": "B"}},
        "goals": {"home": gh, "away": ga},
    }


def test_history_excludes_matches_on_or_after_cutoff():
    cutoff = "2026-09-06T00:00:00+00:00"
    responses = {
        ("/fixtures", (("league", 39), ("season", 2026))): {"response": [
            _fixture_item(1, "2026-09-01T12:00:00+00:00", "FT", 2, 1),   # before cutoff: OK
            _fixture_item(2, "2026-09-06T13:00:00+00:00", "FT", 1, 1),   # ON the target date: must be excluded
            _fixture_item(3, "2026-09-07T13:00:00+00:00", "FT", 0, 0),   # after cutoff: must be excluded
        ]},
    }
    client = FakeClient(responses)
    matches = fetch_finished_history(client, 39, [2026], cutoff)
    ids = {m["fixture_id"] for m in matches}
    assert ids == {1}


def test_history_excludes_unfinished_statuses():
    cutoff = "2026-09-06T00:00:00+00:00"
    responses = {
        ("/fixtures", (("league", 39), ("season", 2026))): {"response": [
            _fixture_item(1, "2026-09-01T12:00:00+00:00", "FT", 2, 1),
            _fixture_item(2, "2026-09-02T12:00:00+00:00", "PST"),
            _fixture_item(3, "2026-09-03T12:00:00+00:00", "CANC"),
            _fixture_item(4, "2026-09-04T12:00:00+00:00", "NS"),
        ]},
    }
    client = FakeClient(responses)
    matches = fetch_finished_history(client, 39, [2026], cutoff)
    ids = {m["fixture_id"] for m in matches}
    assert ids == {1}


def test_target_date_excludes_started_and_non_ns_fixtures():
    entry = LeagueManifestEntry("Premier League", "England", 39, 2026, "FULL_ANALYSIS", "test")
    responses = {
        ("/fixtures", (("date", "2026-09-06"), ("league", 39), ("season", 2026),
                       ("timezone", "Europe/Paris"))): {"response": [
            _fixture_item(10, "2026-09-06T13:00:00+00:00", "NS"),   # eligible
            _fixture_item(11, "2026-09-06T11:00:00+00:00", "1H"),   # already started: excluded
            _fixture_item(12, "2026-09-06T09:00:00+00:00", "FT", 1, 0),  # already finished: excluded
            _fixture_item(13, "2026-09-06T15:00:00+00:00", "PST"),  # postponed: excluded
        ]},
    }
    client = FakeClient(responses)
    eligible, excluded = fetch_fixtures_for_date(client, [entry], "2026-09-06")
    assert [f.fixture_id for f in eligible] == [10]
    assert len(excluded) == 3


def test_friendlies_excluded():
    entry = LeagueManifestEntry("Premier League", "England", 39, 2026, "FULL_ANALYSIS", "test")
    item = _fixture_item(20, "2026-09-06T13:00:00+00:00", "NS")
    item["league"]["round"] = "Friendlies"
    responses = {
        ("/fixtures", (("date", "2026-09-06"), ("league", 39), ("season", 2026),
                       ("timezone", "Europe/Paris"))): {"response": [item]},
    }
    client = FakeClient(responses)
    eligible, excluded = fetch_fixtures_for_date(client, [entry], "2026-09-06")
    assert eligible == []
    assert excluded[0]["reason"] == "FRIENDLY"
