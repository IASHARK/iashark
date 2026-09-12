"""API-Sports (v3.football.api-sports.io) client for the one-off ticket engine.

Isolated cache under data/one-off-ticket-engine/cache/. Never logs the API
key (only presence/absence is ever reported). Implements:
  - disk cache with full provenance (endpoint, params, retrieved_at, hash)
  - request timeout
  - up to 3 retries with exponential backoff
  - a circuit breaker that opens after repeated failures
  - a simple rate limiter (min interval between requests)
"""
import hashlib
import json
import time
from dataclasses import dataclass, field
from pathlib import Path
from urllib import request as urllib_request
from urllib import parse as urllib_parse
from urllib.error import HTTPError, URLError

from . import config
from .env import get_api_key


class CircuitOpenError(RuntimeError):
    pass


@dataclass
class ApiCallLog:
    endpoint: str
    params: dict
    cache_hit: bool
    retries: int
    status: str
    duration_s: float


@dataclass
class ApiClient:
    cache_dir: Path = config.CACHE_ROOT
    api_calls: list = field(default_factory=list)
    _last_request_ts: float = field(default=0.0, init=False)
    _consecutive_failures: int = field(default=0, init=False)
    _circuit_opened_at: float = field(default=0.0, init=False)

    def __post_init__(self):
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._api_key = get_api_key()

    # ---------------------------------------------------------------- cache
    def _cache_key(self, endpoint: str, params: dict) -> str:
        canonical = json.dumps({"endpoint": endpoint, "params": params}, sort_keys=True)
        return hashlib.sha256(canonical.encode()).hexdigest()

    def _cache_path(self, cache_key: str) -> Path:
        return self.cache_dir / f"{cache_key}.json"

    def _read_cache(self, cache_key: str):
        path = self._cache_path(cache_key)
        if path.exists():
            return json.loads(path.read_text())
        return None

    def _write_cache(self, cache_key: str, endpoint: str, params: dict, body: dict):
        payload = {
            "endpoint": endpoint,
            "params": params,
            "retrieved_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "response_hash": hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest(),
            "response": body,
        }
        self._cache_path(cache_key).write_text(json.dumps(payload, indent=2))
        return payload

    # ------------------------------------------------------------- breaker
    def _circuit_check(self):
        if self._consecutive_failures >= config.CIRCUIT_BREAKER_FAILURE_THRESHOLD:
            elapsed = time.monotonic() - self._circuit_opened_at
            if elapsed < config.CIRCUIT_BREAKER_COOLDOWN_S:
                raise CircuitOpenError(
                    f"Circuit breaker open ({self._consecutive_failures} echecs consecutifs); "
                    f"reessai dans {config.CIRCUIT_BREAKER_COOLDOWN_S - elapsed:.0f}s"
                )
            # cooldown elapsed: half-open, allow one probe
            self._consecutive_failures = 0

    def _register_failure(self):
        self._consecutive_failures += 1
        if self._consecutive_failures == config.CIRCUIT_BREAKER_FAILURE_THRESHOLD:
            self._circuit_opened_at = time.monotonic()

    def _register_success(self):
        self._consecutive_failures = 0

    # ---------------------------------------------------------- rate limit
    def _throttle(self):
        elapsed = time.monotonic() - self._last_request_ts
        wait = config.RATE_LIMIT_MIN_INTERVAL_S - elapsed
        if wait > 0:
            time.sleep(wait)
        self._last_request_ts = time.monotonic()

    # ---------------------------------------------------------------- core
    def get(self, endpoint: str, params: dict, use_cache: bool = True) -> dict:
        params = {k: v for k, v in sorted(params.items()) if v is not None}
        cache_key = self._cache_key(endpoint, params)

        if use_cache:
            cached = self._read_cache(cache_key)
            if cached is not None:
                self.api_calls.append(ApiCallLog(endpoint, params, True, 0, "CACHE_HIT", 0.0))
                return cached["response"]

        self._circuit_check()

        url = f"{config.API_BASE}{endpoint}?{urllib_parse.urlencode(params)}"
        headers = {"x-apisports-key": self._api_key}

        last_exc = None
        t0 = time.monotonic()
        for attempt in range(config.MAX_RETRIES + 1):
            self._throttle()
            try:
                req = urllib_request.Request(url, headers=headers)
                with urllib_request.urlopen(req, timeout=config.REQUEST_TIMEOUT_S) as resp:
                    body = json.loads(resp.read().decode())
                self._register_success()
                self._write_cache(cache_key, endpoint, params, body)
                self.api_calls.append(
                    ApiCallLog(endpoint, params, False, attempt, "OK", time.monotonic() - t0)
                )
                return body
            except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as exc:
                last_exc = exc
                self._register_failure()
                if attempt < config.MAX_RETRIES:
                    time.sleep(config.BACKOFF_BASE_S * (2 ** attempt))
        self.api_calls.append(
            ApiCallLog(endpoint, params, False, config.MAX_RETRIES, f"FAILED:{last_exc}", time.monotonic() - t0)
        )
        raise RuntimeError(f"API call failed after {config.MAX_RETRIES} retries: {endpoint} {params} ({last_exc})")

    def call_summary(self):
        return [
            {
                "endpoint": c.endpoint,
                "params": c.params,
                "cache_hit": c.cache_hit,
                "retries": c.retries,
                "status": c.status,
                "duration_s": round(c.duration_s, 3),
            }
            for c in self.api_calls
        ]
