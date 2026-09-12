# ONE_OFF_TICKET_OPTIMIZER_V1

Autonomous, isolated engine that builds exactly 3 distinct football tickets
(total odds >= a configurable floor, default 5.00) maximizing estimated win
probability for a target date. Built to the spec discussed 2026-09-05.

**Isolation.** Nothing under `tools/one-off-ticket-engine/` imports from, or
is imported by, the production Score/Player/Market Lab code under `lib/`.
All its data lives under `data/one-off-ticket-engine/` (`cache/` for raw
API payloads with provenance, `runs/<run_id>/` for reports and manifests).
It reuses the repo's `APISPORTS_KEY` env var (same convention as every
`scripts/*.js` file) and, where useful, the repo's already-verified
`config/leagues.json` league IDs — but never imports repo code.

## Why Python, not Node

Section 36 of the spec gives `node tools/one-off-ticket-engine/run.js` as an
*example* invocation. The actual work here — a weighted Poisson MLE with an
analytic gradient, a relative-entropy (KL + quadratic) convex solve per
fixture, a binary MILP ticket solver, and vectorized bootstrap/Monte Carlo
over hundreds of thousands of scenarios — is squarely numpy/scipy/PuLP
territory, and the repo already reaches for Python for its own hard
numerical fits (`scripts/fit_kappa.py`, `eval_*_log_probability.py`). Python
was chosen for the same reason. Run it as:

```bash
python3 tools/one-off-ticket-engine/run.py --date 2026-09-06 --phase PREVIEW
python3 tools/one-off-ticket-engine/run.py --date 2026-09-06 --phase FINAL --bookmaker Pinnacle
```

## CLI options

`--date`, `--phase {PREVIEW,FINAL}`, `--bookmaker <name>` (omit for
BEST_PRICE_SHOPPING), `--leagues <comma hints>`, `--min-ticket-odds`,
`--tickets`, `--simulations`, `--bootstrap-draws` (stage 1),
`--bootstrap-stage2-draws`, `--pool-time-budget-s`, `--seed`.

`FINAL` bypasses the disk cache for the fixtures/odds endpoints (fresh
status + fresh prices), while league resolution and finished-match history
stay cached (immutable once a season/match is over).

## Pipeline (maps to the spec's sections)

1. **Leagues** (`engine/leagues.py`, section 2) — resolved live against
   `/leagues`, reusing `config/leagues.json` where it already covers a
   championship. Never a hardcoded ID.
2. **Fixtures** (`engine/fixtures.py`, section 4) — `NS` status only,
   friendlies excluded, per league/season.
3. **History + Poisson model** (`engine/poisson_model.py`, sections 5-7) —
   weighted MLE attack/defense fit (analytic gradient, L-BFGS-B), L2 ridge,
   half-life grid `{90,180,365,inf}` and ridge grid `{0.01,0.1,1.0}` chosen
   by rolling forward-validation NLL on history only, then frozen. Sum-to-
   zero identification restored by a *likelihood-invariant* post-hoc
   recentring (proved and unit-tested in `tests/test_poisson_model.py`).
4. **Score matrix** (`engine/score_matrix.py`, section 8) — adaptive grid
   until tail mass < 1e-9 (grid cap 30, covers realistic football lambdas
   with wide margin), optional per-league Dixon-Coles rho fit via 1-D MLE
   on low-score cells, falling back to rho=0 below 150 historical matches
   or if the fit hits its bounds.
5. **Odds ingestion** (`engine/odds.py`) — allow-listed markets only
   (verified against a live `/odds/bets` call + a real fixture payload, see
   `config.py` comments); half/period variants excluded; only the exact
   totals lines the spec enumerates (OU 1.5/2.5/3.5/4.5, team totals
   0.5/1.5/2.5) — quarter lines are dropped (mini-Asian push semantics,
   out of scope for V1).
6. **Devig + consensus** (`engine/devig.py`, `engine/consensus.py`,
   sections 12-13) — Shin for 1X2 (Newton-Raphson, falls back to plain
   normalization if it fails to converge), 2-way devig for DNB/BTTS/OU/team
   totals, median + 1.4826*MAD (floored) across bookmakers. **Double Chance
   is never devigged as a 3-way family** — its raw price is kept for
   execution, its probability comes from the score matrix.
7. **Entropy-anchored matrix** (`engine/entropy_matrix.py`, sections
   14-16) — softmax-reparametrized KL + quadratic solve (L-BFGS-B, analytic
   gradient). Per-family constraint weight is capped at
   `FAMILY_WEIGHT_CAP_MULTIPLIER` (1.5) times that family's own strongest
   constraint, so N correlated lines never out-weigh a single-market family
   just by being more numerous (see the worked rationale in `config.py`).
8. **Bootstrap** (`engine/bootstrap.py`, sections 18-19) — resamples
   bookmakers with replacement per (fixture, market, line), recomputing
   median/MAD/entropy-solve/market-probabilities per draw. Robustness is
   `E_bootstrap[log p]` -> `p_geometric = exp(...)`, never `p - k*sd`.
9. **Legs + solver** (`engine/legs.py`, `engine/ticket_solver.py`, sections
   17, 20-26) — one row per tradeable (fixture, market, selection[, line]);
   LOW data-quality legs excluded from the solver. The ticket solver is an
   **exact binary MILP** (PuLP/CBC): maximize `sum(robust_log_p)` subject to
   `sum(log odds) >= log(min_odds)`, 3-7 legs, <=1 leg/fixture. A pool of up
   to 500 distinct tickets is built by repeated exact solves with no-good
   cuts (never a greedy heuristic) — see `tests/test_ticket_solver.py` for
   an exhaustive-search cross-check on a small synthetic case.
10. **Joint Monte Carlo + triplet selection** (`engine/portfolio.py`,
    sections 27-30) — one simulated score per fixture per scenario settles
    every leg on it (exact within-fixture correlation; cross-fixture
    correlation is not modelled — fixtures are simulated independently).
    DNB settlement handles PUSH correctly. The literal best triplet search
    is `C(pool,3)`; we rank the pool by individual Monte Carlo P(ticket)
    and search exhaustively over the top 60 (documented, tunable via
    `TOP_K_FOR_TRIPLET_SEARCH`), first requiring 0 shared fixtures per pair
    and relaxing to <=1 if that's infeasible.
11. **Final portfolio bootstrap** (section 31) — a second uncertainty layer
    over the *chosen* triplet only. Documented reduction: 300 draws x 3000
    inner scenarios (`config.PORTFOLIO_BOOTSTRAP_DRAWS/_INNER_SCENARIOS`)
    rather than literally reusing 2000 x 200,000, which is not tractable
    per draw in a single run; same method (resample -> re-solve -> re-
    simulate), smaller scale.
12. **Reports** — `ticket-report.md`, `ticket-report.json`,
    `RUN_MANIFEST.json` per run under `data/one-off-ticket-engine/runs/`.

## Known, documented simplifications (V1)

- Asian Handicap is **disabled** (`config.ASIAN_HANDICAP_ENABLED = False`):
  no push/half-win/half-loss settlement implemented, so it's excluded
  entirely rather than risk a silent misprice.
- Lineups (section 34): fetched and timestamped for the fixtures used by
  the final triplet when available, but **no automated veto is applied** —
  we have no verified squad-strength baseline to trigger one honestly, and
  fabricating a heuristic veto would violate the same "never a fabricated
  adjustment" principle the spec applies to probabilities. Confirmed-lineup
  status is surfaced for human judgment instead.
- Cross-fixture correlation (e.g. common weather, a midweek European trip)
  is not modelled; only within-fixture correlation (section 27's explicit
  requirement) is exact.
- MODEL_MARKET_DISAGREEMENT threshold (section 33): tagged at a 0.20 gap
  on the 1X2 home-win probability between the raw statistical model and
  market consensus, excluded from the pool entirely above 0.35. These
  thresholds are a documented judgment call, not derived from the spec.

## Tests

```bash
cd tools/one-off-ticket-engine && python3 -m pytest tests/ -q
```

Covers: devig (Shin determinism/convergence, DC never 3-way-devigged,
bookmaker identity preserved), score matrix (sums to 1, tail mass,
determinism), markets (1X2/DC/DNB/BTTS/totals identities), Poisson model
(sum-to-zero identification, likelihood-invariance of the recentring,
unseen-team fallback), ticket solver (odds floor, leg bounds, one-leg-per-
fixture, no duplicates, determinism, exhaustive-search cross-check),
portfolio (settlement incl. DNB push, Monte-Carlo-vs-analytic agreement for
independent tickets, portfolio probability ordering P(all3)<=P(2+)<=P(any)),
and anti-leakage (history strictly before cutoff, live/finished/postponed
statuses excluded from the target date, friendlies excluded).
