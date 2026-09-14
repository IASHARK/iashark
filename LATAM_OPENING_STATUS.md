# LATAM (hispanophone) — Opening Status

Checkpoint of 2026-09-14. Branch `feature/gb-mx-za-geo-expansion`. Nothing committed or deployed by this workstream.

**What was done:** 4 leagues added to the analysis catalogue (Argentina, Colombia, Peru, Chile).

**What is NOT done:** a commercial launch. The LATAM price, legal pages, payment and responsible gambling are listed below as missing or `BLOCKED_DECISION`.

---

## 1. Leagues added (verified with real API calls, 2026-09-14)

Source: api-football `/leagues`, `/odds`, `/fixtures`, `/fixtures/statistics`, `/fixtures/lineups`, `/injuries`, `/standings`. Responses were cached and nothing was guessed. About 65 test requests, plus 19 for `scripts/verify-league-coverage.js`.

| Key (`config/leagues.json`) | id | API name | Country | Season | Coverage (season 2026) | Tier |
|---|---|---|---|---|---|---|
| `argentina_liga_profesional` | 128 | Liga Profesional Argentina | AR | 2026 current (22/01 → 08/11) | fixtures events/lineups/stats team+player ✔, standings ✔, players ✔, predictions ✔, odds ✔, **injuries ✘** | STANDARD_ANALYSIS |
| `colombia_primera_a` | 239 | Primera A | CO | 2026 current (16/01 → 08/11) | same | STANDARD_ANALYSIS |
| `peru_primera` | 281 | Primera División (Liga 1) | PE | 2026 current (30/01 → 14/11) | same | STANDARD_ANALYSIS |
| `chile_primera` | 265 | Primera División | CL | 2026 current (30/01 → 06/12) | same | STANDARD_ANALYSIS |

**Spot check on one recently finished match per league** (1493129, 1549777, 1549487, 1505523):
- statistics: 2 teams × 16 types;
- lineups: 2 teams;
- injuries: 0 (matches `coverage.injuries=false`).

**Standings are split into several groups:**
- Argentina: Apertura/Clausura × groups A/B;
- Colombia: Apertura/Clausura;
- Peru: Annual table / Apertura / Clausura;
- Chile: single table.

The pipeline only reads `standings[0]`, which is the first group. For Argentina, that gives the Apertura Group A table, so the displayed rank can be wrong. This is not fixed here because it is pipeline code; see §5.

### Odds

| League | Pinnacle on api-football (`/odds?league=X&season=2026`, page 1) | Pinnacle markets seen | The Odds API (public catalogue) | Config result |
|---|---|---|---|---|
| Argentina | 8/10 fixtures | 1X2, O/U goals, AH, corners, **no BTTS** | `soccer_argentina_primera_division` | `oddsSportKey` + `apiFootballPinnacleFallback:true` |
| Colombia | 9/10 | 1X2, O/U, AH, corners, **no BTTS** | **none** | `apiFootballPinnacleFallback:true` only |
| Peru | 10/10 | 1X2, O/U, AH, corners, **no BTTS** | **none** | `apiFootballPinnacleFallback:true` only |
| Chile | 9/9 | 1X2, O/U, AH, corners, **no BTTS** | `soccer_chile_campeonato` | `oddsSportKey` + `apiFootballPinnacleFallback:true` |

- **The Odds API catalogue:** https://the-odds-api.com/sports-odds-data/sports-apis.html, read on 2026-09-14. `GET /v4/sports` was not called because there is no local key. Re-confirm on the first pipeline run.
- **No BTTS:** Pinnacle `bttsY`/`bttsN` will stay empty for these 4 leagues. They are never filled from another bookmaker (`lib/pinnacle-odds.js`).

### Display names

- The SEO slugs are derived from `displayName`, and two "Primera División" leagues would collide. The names used are "Liga Profesional Argentina", "Primera A Colombia", "Liga 1 Peru" and "Primera Division Chile".
- Betting-sponsor names (Liga BetPlay, Liga 1 Te Apuesto) are avoided on purpose.
- The keys match `config/league-expansion.json` (wave 2, `NOT_STARTED`). `colombia_primera_a` is new because Colombia is not in that file.

## 2. Files changed by this workstream

| File | Change |
|---|---|
| `config/leagues.json` | +4 leagues (15 → 19) and an evidence block in `_readme` |
| `lib/league-names.js` | Data block re-synced (identical output to `scripts/build-locales.js#syncLeagueNames`; the generator itself was not run) |
| `data/league-validation-registry.json` | +4 entries (see §3). Existing entries and `generated_at` untouched |
| `league-coverage-report.json` | Regenerated for real (19/19 `VERIFIED`) |
| `tests/verify-league-coverage.test.js` | Count set to 19. New tests for the LATAM ids, odds keys, `displayName` uniqueness and registry honesty |
| `tests/pinnacle-odds.test.js` | **Outside the initial scope, but required:** it hard-coded the Pinnacle fallback list (Liga MX + PSL) and would fail. Added the 4 leagues and a LATAM mapping test |
| `LATAM_OPENING_STATUS.md` | This file |

**Tests:** `verify-league-coverage`, `pinnacle-odds`, `qa-f1-app-fixes`, `run-output-engine`, `lambda-bounds`, `seo-pages` → **75/75 pass**. `config/leagues.json` and the registry parse correctly.

## 3. Registry (`data/league-validation-registry.json`)

Each of the 4 entries records:
- `catalogue_status: "OPENED_WITHOUT_SCORE_LAB_VALIDATION"`;
- `catalogue_decision: { decided_by: "owner", reason: "LATAM expansion…", date: "2026-09-14", validation_claimed: false }`.

The validation fields stay at their defaults:
- `score_status` and `player_status` = `NOT_STARTED`;
- `*_runnable` and `live_eligible` = `false`.

As a result, these leagues are **excluded** from TOP_5_SCORERS_OF_DAY, DAILY_COMBOS and SAFE_PICK_OF_THE_DAY (`lib/run-output/eligibility.js`).

- **Calibration:** no Score Lab run on any of the 4 leagues, and no calibration measured.
- **Data collection:** Colombia has no collection at all.
- **Engine thresholds:** the analyses come from the generic engine. `lib/engine.js#calcLambdas` applies the "isTop" lambda floor (1.05/0.90) to every catalogue league. That floor is not measured on these championships and may be too high for low-scoring leagues. Not changed.

## 4. API quota and runtime

### Calls per LATAM match in the daily pipeline

Read from `.github/workflows/update-data.yml`. Upper bound, before the in-run cache:

| Item | Calls |
|---|---|
| `teams/statistics` (2 teams × current + previous season) plus the xG pre-cache (different URL, not shared) | 6 |
| Last fixtures (`fixtures?team&last=20`) | 4 |
| odds, injuries, h2h, predictions, lineups | 5 |
| `fixtures/events` (up to 20 × 2) | 40 |
| `fixtures/statistics` (10 × 2) | 20 |
| `fixtures/players` (10 × 2) | 20 |
| squads, top-scorer players | ~4 |
| **Total** | **≈ 100** |

- **Per-league calls:** +4 (fixtures by date × 3, plus standings).
- **Player markets:** add +30 to +60 only when the lineup is confirmed. At 06:00 UTC (03:00 in Buenos Aires) that practically never happens for LATAM evening matches.

### Real volume measured (`/fixtures` from 14 to 27 Sept)

| League | Matches |
|---|---|
| Argentina | 19 |
| Colombia | 25 |
| Peru | 9 |
| Chile | 1 (break; a normal round has ~8) |
| **Total** | **54 in 14 days ≈ 3.9/day** |

- **Average 3-day window:** ~12 matches.
- **Weekend peak measured:** ~30 matches (~38 with a normal Chile round).

### Extra calls per day

| Source | Average | Peak |
|---|---|---|
| `update-data.yml` (1 run/day) | ~1,250 | ~3,800 |
| `closing-odds.yml` (every 30 min: `/fixtures?id=` for **each** match in data.json, plus odds < 180 min) | ~650 | ~2,050 |
| `forward-odds-broad.yml` (`save-odds-snapshot.js`, 4 runs/day, +4 leagues × 4 calls) | +64 | +64 |
| `verify-league-coverage.js` | +4 | +4 |
| `forward-odds-near-kickoff.yml` | cap of 50/run unchanged | — |
| **Total** | **≈ +2,000/day** | **≈ +6,000/day** |

**Estimated current load:**
- `data.json` = 55 matches, so about 5,500 calls for the pipeline plus about 2,600 for closing-odds.
- Estimated total ≈ 8–9k/day today, 15k/day at LATAM peak.
- That is **about 20% of the 75,000/day quota → safe.**

**Note:** `/status` showed only 31 calls used for the day before my tests (≈03:27 UTC). That is inconsistent with a closing-odds run every 30 minutes over 55 matches. The workflow may not be running at that volume (disabled, failing, or a different data.json on the default branch). This needs checking in GitHub Actions. The estimate above remains a pessimistic bound.

**`save-odds-snapshot.js` budget:** 19 leagues × (1 + 3) = 76 calls, under the hard cap `MAX_API_CALLS_PER_RUN = 100`. The margin is getting small: 25 leagues would reach the cap.

### Runtime

- **Per match:** throttle of 150 ms/call (`createThrottledFetcher`), 150 ms sleeps in the events/stats loops, 800 ms of pauses, network latency and one Claude call (`genAnalyse`). Estimate: **60–120 s per match.**
- **Added time:** about +12 to +24 min on average, and +40 to +75 min at peak.
- **Job timeout:** `update-data.yml` has **no `timeout-minutes`**, so the GitHub default of 360 min applies.
- **Actual durations:** not measured (`gh` is unavailable on this machine). **Action for the lead:** check the duration of the last `Update IASHARK Daily` runs. If a run already takes more than about 4 h, the LATAM peak becomes a risk.

## 5. Exact changes the lead must make elsewhere (not done here — outside this workstream's files)

### SEO / home (SEO agent)

1. **`index.html`: the "15" counts are now false.**
   - l.490: `15 compétitions`;
   - l.515: `15 COMPÉTITIONS COUVERTES` (the league strip also needs Liga Profesional Argentina, Primera A Colombia, Liga 1 Peru and Primera Division Chile);
   - l.568: `id="kpiLigues" …>15</b>`;
   - l.678: FAQ `Quinze compétitions, dont…`.
   - Change all of these to **19** ("Dix-neuf").
2. **`scripts/i18n-manifest.js`:**
   - l.79–84: `badgeLeagues` (fr/en/es/de/it/pt) → "19 compétitions / 19 competitions / 19 competiciones / 19 Wettbewerbe / 19 competizioni / 19 competições";
   - l.87: `HOME_V3.*.railLbl`;
   - l.89: `a5` "Quinze…" in every locale;
   - l.252, 322, 335: the `find:` strings, to keep in line with the new text in `index.html`.
3. **`tests/qa-f1-app-fixes.test.js` l.168–173:** `tabular-nums">15<\/b>` → `19`, and add 15/Quinze/Fifteen/Quince to the negative regex.
4. **`i18n/seo/<dir>.json` → `league.countries`:** add the 4 keys in all 9 directories. Otherwise the league hub shows an empty country (`scripts/seo-pages.js#hubVars`).

| Directory | Argentina | Colombia | Peru | Chile |
|---|---|---|---|---|
| fr | Argentine | Colombie | Pérou | Chili |
| en, gb, za | Argentina | Colombia | Peru | Chile |
| es, mx | Argentina | Colombia | Perú | Chile |
| de | Argentinien | Kolumbien | Peru | Chile |
| it | Argentina | Colombia | Perù | Cile |
| pt | Argentina | Colômbia | Peru | Chile |

   - Optional: `home.priority_leagues` for `es` if LATAM is the target.
5. **Regenerate the site:**
   - run `node scripts/build-locales.js`, then `node scripts/i18n-sitemaps.js`;
   - this creates 4 × 9 = 36 league hubs (`/<dir>/leagues/liga-profesional-argentina.html`, `primera-a-colombia.html`, `liga-1-peru.html`, `primera-division-chile.html`) and updates `sitemap-leagues.xml`;
   - `lib/league-names.js` is already in sync, so the generator will leave it unchanged.

### Pipeline (lead)

6. **No functional change is required.** `update-data.yml` reads `config/leagues.json` dynamically.
7. **Recommended:**
   - add an explicit `timeout-minutes` to the `update` job, after checking real durations;
   - fix the stale comments ("13 compétitions": `update-data.yml` l.541, `lib/engine.js` l.189).
8. **Recommended (data quality):** standings l.~2241 only take `standings[0]`. For leagues with several groups/phases (Argentina, Colombia, Peru, and Liga MX too), the displayed rank can come from the wrong table. Find the group that contains both teams instead of `[0]`.
9. **To watch:** `closing-odds.yml` calls `/fixtures?id=` for every match every 30 min. That cost grows linearly with the catalogue.

### `config/markets.json` + checkout (lead, after decisions §7)

10. **No change now.** If the owner decides to launch PE/CO, the shape would follow the `mx` pattern:
    - a `pe` market (`country:"PE"`, `currency:"PEN"`, `status:"DRAFT_PENDING_LEGAL_REVIEW"`, `paidAdsEnabled:false`, `adsGamblingCertRequired:true`, `helpline:null`, `stripeEnvKey:"STRIPE_PRICE_ID_PE"`, prices = owner decision);
    - a `co` market (`COP`, same shape);
    - `_dirs` entries if dedicated directories are chosen (§6);
    - `supabase/functions/create-checkout-session/index.ts#MARKET_STRIPE_PRICE_ENV`: `pe: "STRIPE_PRICE_ID_PE"`, `co: "STRIPE_PRICE_ID_CO"`.
    - Never add a price that has not been decided.

## 6. Doc 09 plan vs current reality

### What doc 09 recommends (LATAM Launch Kit, 11/09/2026)

- **Scope: Peru + Colombia only.** Argentina and Chile are not mentioned in any business document (00, 04, 09, 17, 18).
- **Principle:** "a shared Spanish creative base, two landings, two prices, two legal checklists".

| | Peru | Colombia |
|---|---|---|
| Pro test price | S/29.90 ≈ 7.68 € | COP 29,900 ≈ 8.29 € |
| Test budget | 350–500 € | 400–600 € |
| Target CAC | ≤ 12 € | ≤ 12–15 € |
| Paid channel | TikTok | TikTok |

Doc 00 §16: stop above 18 € (PE) / 20 € (CO).

- **Shared across countries:** Spanish design system, education scripts (probability, overround, CLV), track record/method, backend/model/emails, raw creatives.
- **Country-specific:**
  - price and **currency**;
  - warnings/regulator;
  - featured clubs/leagues ("Liga 1 / BetPlay + Europe", doc 17);
  - local terminology ("local Spanish, don't copy MX");
  - **PSP/payment methods**;
  - **legal opinion** on advertising and betting-information services.
- **Order:**
  1. validate Mexico first;
  2. Peru with a small budget;
  3. Colombia if CAC is under the ceiling and there is no legal friction;
  4. never duplicate a creative that has not been relocalised.
- Doc 00 adds: never open PE/CO on the same day as MX.
- **Organic:**
  - 1 educational video/day;
  - 3 strong analyses/week;
  - weekly model report in Spanish;
  - SEO on probability guides + **league pages**;
  - communities: data before promotion.
- **Wording (doc 09 hooks):**
  - "Una cuota es un precio, no una verdad";
  - "No borramos las derrotas";
  - "No confíes: revisa el historial público".
  - Banned (doc 18): guaranteed wins, sure bet, easy money, "bet now", income or investment promises.
- **Compliance (docs 00/04):**
  - PE/CO = **TEST** ("local validation + warnings / regulator");
  - Peru: "tips/odds subject to local authorisations";
  - Colombia: "gambling ads must be authorised by Coljuegos"; do not launch X without authorisation;
  - TikTok Gambling Information allowed after certification;
  - Meta: prior written permission;
  - Google Ads: NO-GO;
  - Snap: bans tipster services;
  - a per-country responsible-gambling page is required (doc 04 §2).
- **Stop conditions:**
  - platform refusal or unresolved legal uncertainty;
  - CAC above the ceiling after 2 creative cycles;
  - paid conversion below 3%;
  - PSP not stable in the country.
- **Doc 18:** during the 5-day UK sprint, "do not open Mexico, South Africa, Peru or Colombia". Opening the leagues here is an explicit owner decision that departs from that.

### What exists now

| Area | State |
|---|---|
| **Leagues** | 4 LATAM leagues in the catalogue (this workstream); hubs not generated yet (§5.5) |
| **`/es/` version** | Full site, `hreflang="es"`, `intlLocale es-ES`, **market `fr` → EUR price 19.95 €**, international helpline (Gambling Therapy, no phone number), `legal/es` = **translation of the FR/EU legal texts** (not a local legal framework), home priority leagues oriented to Spain/Europe |
| **`/mx/` version** | es-MX, MXN, local legal pages as DRAFT, dictionary using "momios" |
| **Club hubs** | CLUB HUBS workstream in progress (`config/club-hubs.json` did not exist yet at the time of checking) |
| **Articles** | ARTICLES workstream in progress; `/es/blog/guides/` holds 7 translated guides, none LATAM-specific at the time of checking |
| **`i18n/country-availability.json`** | FR only (layer not applied) |
| **Stripe checkout** | Markets gb/mx/za only; any other market → explicit `market_not_configured` refusal (no silent fallback) |

### What is missing for a real launch

| Topic | State | Detail |
|---|---|---|
| Dedicated LATAM version | **MISSING** | `/es/` = Spain/EUR/FR-EU law, not suitable as a paid landing for PE/CO (see recommendation below) |
| Local prices | **BLOCKED_DECISION** | Doc 09 test prices for PE/CO; nothing for AR/CL; no Edge/annual price |
| Currency | **BLOCKED_DECISION** | Doc 09 = local currency (PEN, COP). USD is not recommended by the docs |
| Stripe by country | **PARTIAL** | stripe.com/global (read 2026-09-14): only **Brazil and Mexico** are Stripe account countries in LATAM, so **no local Stripe entity in AR/CO/PE/CL**. The French Stripe account can still take international cards (cross-border fees, possibly higher decline rates). The docs list minimums in ARS and COP; **PEN and CLP presentment could not be confirmed** from the static page → check in the Dashboard. **No local payment methods** (PSE/Nequi in CO, Yape/PagoEfectivo in PE, etc.) through Stripe → a local PSP is a separate decision (doc 04 §7: declare the betting-information activity) |
| Legal pages by country | **MISSING** | No `legal/pe`, `legal/co`, `legal/ar`, `legal/cl`. Local data-protection law and consumer terms to be written **with a lawyer** (never invented) |
| Responsible gambling by country | **MISSING** | No local resource verified in this session. Only "Gambling Therapy" (international) exists. Never invent a phone number |
| Regulators / legal opinion | **MISSING** | CO: Coljuegos (docs 00/04). PE: "local authorisations" (doc 00), authority to confirm by a lawyer. AR (provincial regulation) and CL: not covered by the documents, to confirm |
| Ads | **MISSING** | TikTok Gambling Information certification per country not requested; X not for CO without clarity; Meta not requested; Google NO-GO |
| Model | **PARTIAL** | Analyses published without validation (§3); no injuries; no Pinnacle BTTS |

### Recommendation: `/es/` or `es-419`?

**Do not create `es-419`.**

1. **Google does not support hreflang `es-419`.** Google's hreflang only accepts regions in ISO 3166-1 alpha-2 format, and "419" (UN M.49) is ignored. The directory would receive no geographic targeting and would cannibalise `/es/` and `/mx/` with near-identical content (a full site copy per directory in the current architecture).
2. **Keep `/es/` as the generic Spanish version.** The `hreflang="es"` tag already serves all Spanish speakers without a dedicated version, including Argentina and Chile. It carries the SEO content (guides, league hubs, club hubs, articles) at no extra cost.
3. **For markets that are actually launched commercially, add a country layer, not a new language.** Follow the `/mx/` model: `/pe/` (`hreflang="es-PE"`) first, then `/co/` (`es-CO`), each with its own landing, local price, legal pages and responsible-gambling page. This is exactly what doc 09 asks for ("two landings, two prices, two legal checklists"). No `/ar/` or `/cl/` as long as there is no commercial launch.

| | Pros | Cons |
|---|---|---|
| `/es/` only | 0 new pages, no duplication, generic hreflang already in place | EUR price and FR/EU law: cannot be used for paid PE/CO; landing not localised |
| `es-419` | One Latin-American Spanish version | **hreflang ignored by Google**, duplicates `/es/` + `/mx/`, no local price/legal per country anyway |
| `/pe/` + `/co/` (es-PE, es-CO) | Correct geo-targeting, compliant with doc 09, local price/legal/responsible gambling possible, same mechanics as `/mx/` | Each directory is a full site copy (~25 pages + matches + 19 hubs) → duplicate-content risk. Hreflang must be reciprocal across 11 directories. Needs reciprocal hreflang and maybe a lightweight layer (landing/pricing/legal/responsible gambling localised, the rest canonical to `/es/`) — **architecture decision for the SEO lead** |

## 7. BLOCKED_DECISION — questions for the owner

1. **Country scope.** Doc 09 covers PE + CO only, and the catalogue now also has AR + CL. Should AR/CL be a commercial launch, or only organic/SEO data?
2. **Timing vs the docs.** Doc 09 says "validate Mexico first", then Peru, then Colombia; doc 18 says "don't open PE/CO during the UK sprint". Confirm that opening now is **catalogue/organic only**, with no paid spend.
3. **URL architecture.** `/pe/` + `/co/` country directories (recommended), `/es/` alone, or something else? Full copy or lightweight layer?
4. **Currency.** Local PEN/COP (doc 09) or USD? For AR/CL: ARS (FX controls, high inflation) / CLP?
5. **Prices.** Confirm S/29.90 (PE) and COP 29,900 (CO) as Pro. Edge/annual? AR/CL prices?
6. **PSP.** Accept Stripe FR with international cards only (no local payment methods), or research a local PSP (KYB + disclosure of the betting-information activity, doc 04 §7)?
7. **Local legal opinion** per launched country (doc 04: "recommended before paid for a betting-information model"): who, when, what budget?
8. **Responsible-gambling resources per country:** who sources and validates them (organisation, URL, phone)? Until then: `MISSING`, never invented.
9. **Ads:** TikTok Gambling Information certification requests for PE/CO? X for PE only?
10. **Model:** accept publishing analyses of 4 leagues without Score Lab validation (STANDARD_ANALYSIS, no injuries)? Show a "modelo no validado en esta liga" note? Schedule a validation (Liga MX precedent: ~4,000 API calls per league; Colombia has no data collection at all)?
11. **League names:** confirm neutral names without the betting sponsor (Liga BetPlay, Liga 1 Te Apuesto).
