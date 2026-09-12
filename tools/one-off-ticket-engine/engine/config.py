"""Configuration constants for ONE_OFF_TICKET_OPTIMIZER_V1.

Isolated from the main IASHARK pipeline. Nothing here is imported by, or
imports from, the production Score/Player/Market Lab code under lib/.
"""
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
TOOL_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = REPO_ROOT / "data" / "one-off-ticket-engine"
CACHE_ROOT = DATA_ROOT / "cache"
RUNS_ROOT = DATA_ROOT / "runs"

API_BASE = "https://v3.football.api-sports.io"

# Env var convention: the repo already uses APISPORTS_KEY everywhere
# (scripts/*.js, .github/workflows/*.yml) with header x-apisports-key on
# host v3.football.api-sports.io. We reuse the exact same convention so the
# key never needs to be duplicated or renamed. Documented per spec section 3.
API_KEY_ENV_VAR = "APISPORTS_KEY"

REQUEST_TIMEOUT_S = 20
MAX_RETRIES = 3
BACKOFF_BASE_S = 1.5
RATE_LIMIT_MIN_INTERVAL_S = 0.35  # well under the plan's per-minute cap
CIRCUIT_BREAKER_FAILURE_THRESHOLD = 6
CIRCUIT_BREAKER_COOLDOWN_S = 60

# --- Championships requested by the user (section 2) -----------------------
# name given here is the *search hint* used against /leagues; the resolver
# never assumes an ID, it only accepts an API response whose name/country
# match convincingly. See engine/leagues.py.
TARGET_LEAGUES = [
    {"hint": "UEFA Champions League", "country_hint": "World"},
    {"hint": "Premier League", "country_hint": "England"},
    {"hint": "Championship", "country_hint": "England"},
    {"hint": "League Cup", "country_hint": "England"},
    {"hint": "Premiership", "country_hint": "Scotland"},
    {"hint": "Ligue 1", "country_hint": "France"},
    {"hint": "Ligue 2", "country_hint": "France"},
    {"hint": "Bundesliga", "country_hint": "Germany"},
    {"hint": "Serie A", "country_hint": "Italy"},
    {"hint": "La Liga", "country_hint": "Spain"},
    {"hint": "Eredivisie", "country_hint": "Netherlands"},
    {"hint": "Primeira Liga", "country_hint": "Portugal"},
    {"hint": "Jupiler Pro League", "country_hint": "Belgium"},
    {"hint": "Allsvenskan", "country_hint": "Sweden"},
    {"hint": "Eliteserien", "country_hint": "Norway"},
    {"hint": "Superliga", "country_hint": "Denmark"},
    {"hint": "J1 League", "country_hint": "Japan"},
    {"hint": "K League 1", "country_hint": "South Korea"},
    {"hint": "Major League Soccer", "country_hint": "USA"},
    {"hint": "Czech Liga", "country_hint": "Czech Republic"},
    {"hint": "Premier League", "country_hint": "Egypt"},
    {"hint": "Pro League", "country_hint": "Saudi Arabia"},
    {"hint": "Veikkausliiga", "country_hint": "Finland"},
    {"hint": "Meistriliiga", "country_hint": "Estonia"},
    {"hint": "Superettan", "country_hint": "Sweden"},
    {"hint": "Primera Nacional", "country_hint": "Argentina"},
]

EXCLUDED_STATUSES = {
    # API-Football short statuses that must never be treated as pre-match
    "1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE",  # in play
    "FT", "AET", "PEN",  # already finished
    "PST", "CANC", "ABD", "AWD", "WO", "TBD",  # postponed/cancelled/abandoned/awarded/tbd
}
PRE_MATCH_STATUSES = {"NS"}
FINISHED_STATUSES = {"FT", "AET", "PEN"}

ALLOWED_MARKET_NAMES = {
    # verified live against /odds/bets and a real fixture's payload (section 9)
    "Match Winner": "1X2",             # bet id 1
    "Double Chance": "DC",             # bet id 12
    "Home/Away": "DNB",                # bet id 2 == full-match Draw No Bet in API-Football's naming
    "Asian Handicap": "AH",            # bet id 4, full match only (not "(1st Half)")
    "Goals Over/Under": "OU",          # bet id 5, full match only
    "Both Teams Score": "BTTS",        # bet id 8
    "Total - Home": "TEAM_TOTAL_HOME",   # bet id 16
    "Total - Away": "TEAM_TOTAL_AWAY",   # bet id 17
}
# any bet name containing one of these substrings is a half/period variant
# and must never be matched even if its base name is in ALLOWED_MARKET_NAMES
DISALLOWED_NAME_SUBSTRINGS = ("1st Half", "2nd Half", "First Half", "Second Half", "(1st", "(2nd")

# section 11 enumerates an exact, closed set of totals lines. API-Sports also
# serves quarter lines (0.75, 1.25, ...) which behave like mini Asian totals
# with partial-push semantics we do not implement in V1 — excluded on purpose.
ALLOWED_LINES = {
    "OU": {1.5, 2.5, 3.5, 4.5},
    "TEAM_TOTAL_HOME": {0.5, 1.5, 2.5},
    "TEAM_TOTAL_AWAY": {0.5, 1.5, 2.5},
}
ASIAN_HANDICAP_ENABLED = False  # section 11: DISABLED until PUSH/HALF settlement is verified end-to-end

MARKET_FAMILIES = ("RESULT", "TOTALS", "BTTS", "TEAM_TOTAL_HOME", "TEAM_TOTAL_AWAY")
# section 16: a family must not weigh N times more just because it has N lines.
# We cap a family's *total* entropy-constraint weight (sum of 1/sigma_k^2) at
# FAMILY_WEIGHT_CAP_MULTIPLIER times its single strongest constraint's own
# weight — i.e. "at most ~1.5 independent full-strength constraints per
# family" — and only ever shrink (never inflate) toward that budget. This
# keeps weights on the same intrinsic 1/sigma^2 scale as the bookmaker
# dispersion (unlike a fixed absolute budget, which would crush real
# consensus precision to noise level).
FAMILY_WEIGHT_CAP_MULTIPLIER = 1.5

HALF_LIFE_GRID_DAYS = [90, 180, 365, float("inf")]
RIDGE_GRID = [0.01, 0.1, 1.0]

TAIL_MASS_EPS = 1e-9
MAX_GOALS_GRID = 30  # hard ceiling for the adaptive grid before giving up (covers lambda up to ~6 with margin)

SIGMA_FLOOR = 0.01  # numeric floor documented in section 15

BOOTSTRAP_STAGE1_DRAWS = 200
BOOTSTRAP_STAGE2_DRAWS = 2000
DAY_SCENARIOS = 200_000

# Section 31's final portfolio bootstrap re-runs an entropy solve PER
# relevant fixture PER draw, then re-simulates day scenarios again within
# that draw. Reusing 2000 draws x 200,000 inner scenarios here (on top of
# the stage-2 bootstrap that already ran at that scale) is not tractable in
# a single run, so this layer intentionally uses smaller, separately
# configurable counts — same method, documented reduction.
PORTFOLIO_BOOTSTRAP_DRAWS = 300
PORTFOLIO_BOOTSTRAP_INNER_SCENARIOS = 3000

MIN_LEGS = 3
MAX_LEGS = 7
MIN_TICKET_ODDS = 5.00
TICKET_COUNT = 3
CANDIDATE_POOL_TARGET = (200, 500)

DATA_QUALITY_LEVELS = ("HIGH", "MEDIUM", "LOW")

# --- SMOOTH_ACCUMULATOR mode (user correction of 2026-09-05) ---------------
# Rejects "1-2 ultra-safe legs + one longshot to hit the odds floor" tickets
# in favor of several individually-strong selections. Ticket-construction
# constraints only — no change to any probability model or data source.
SMOOTH_MAX_LEG_ODDS_PRIMARY = 1.80
SMOOTH_MAX_LEG_ODDS_FALLBACK = 2.00  # only tried if 1.80 yields no admissible ticket at all
SMOOTH_MIN_LEGS = 4
SMOOTH_MAX_LEGS = 7
SMOOTH_ROBUST_P_MIN = 0.65   # hard floor
SMOOTH_MEAN_P_SOFT_TARGET = 0.68  # informational only ("ideally"), not a filter
SMOOTH_P10_MIN = 0.58
SMOOTH_SD_MAX = 0.10  # "abnormally high" bookmaker/model dispersion — documented judgment call
SMOOTH_EDGE_MIN = -0.03  # exclude legs the model considers clearly overpriced by the market
SMOOTH_TOTAL_ODDS_MIN = 5.00
SMOOTH_TOTAL_ODDS_PREFERRED_MAX = 5.50
QUALITY_TIER_A_MIN = 0.75
QUALITY_TIER_B_MIN = 0.70
QUALITY_TIER_C_MIN = 0.65  # == SMOOTH_ROBUST_P_MIN, below this the leg is not eligible at all
