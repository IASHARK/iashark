# IASHARK: US SEO plan

Date: 19/09/2026. Scope: organic search traffic from the United States to `/en/`.

This was a read-only audit of the worktree `wt-seo` (branch `nuit/travail`, HEAD `a136911ed`, which already includes the `/en/` USD switch), plus checks on the live site (https://iashark.com) and US search results. I edited no files and ran no builds or tests.

Baseline: 14 US visits and 0 signups in the last 7 days.

---

## 0. TL;DR

1. **English readers are still being sent to French pages.** Liga MX has no English pages. `/en/leagues/liga-mx.html` is `noindex`. The `/en/` home page links today's Liga MX matches to the French `/match/<id>.html`. Retired `/en/` Liga MX match URLs redirect with a 301 to the French page. This is live, for example `/en/match/1550948.html` goes to `/match/1550948.html`, which reads "horaire à l'heure de Paris".
2. **Times and dates in the HTML are wrong for US readers.** `/en/` uses UTC in the HTML that Google reads and shows in snippets, and the home page summary uses **Paris time**. Browser-side formatting uses en-GB with a 24-hour clock.
   - Example: Nashville SC vs Chicago Fire kicks off Saturday, September 19 at 9:30 PM ET.
   - Its meta description says "MLS match on 20 September 2026".
   - Its visible facts say "Sunday, 20 September 2026, 01:30 (UTC)".
3. **The MLS hub looks wrong to an American fan.**
   - The "MLS table" holds only the 15 Western Conference clubs, labeled "Major League Soccer", with "Top of the table: Vancouver".
   - Some venue cities are wrong: "Allianz Field - Sao Paulo", "Dick's Sporting Goods Park - Trade City".
   - The whole site uses UK or international vocabulary. The English dictionary contains "soccer" 0 times.
4. **Coverage is thin where US searches happen.**
   - `/en/` has no MLS, Liga MX or Premier League club pages. The Premier League club pages exist only on `/gb/`, with GBP prices and UK time.
   - `/en/` has no US-oriented articles.
   - Match pages exist only 0 to 3 days before kickoff, which is a short window for a young domain to get indexed.
5. **Recommendation: target the US explicitly inside `/en/`, not with a new `/us/` copy.**
   - Show times in ET with UTC alongside, and use US date format.
   - Use "soccer" in titles for MLS, Liga MX and the home page, and keep "football" alongside.
   - Add English Liga MX coverage, plus MLS and Liga MX club pages.
   - Offer American odds as an option.
   - Add en-US as an hreflang alias.
   - Every change stays within the rules: estimated probabilities, 18+, no premium data in public HTML, no invented data.

---

## 1. What `/en/` has today (evidence)

### 1.1 Routing and hreflang
- **Home page routing.** `/` redirects by country with a 302 (`lib/lang-routing.js`, generated into `_redirects` by `scripts/build-locales.js`).
  - `Country=us` goes to `/en/`, before any browser-language rule, so a US visitor with a Spanish browser also lands on `/en/`.
  - Googlebot crawls from the US, so it gets `/en/` too, which matches x-default = `/en/` (`config/markets.json#_hreflangXDefault`).
  - Deep pages are never redirected.
  - The language suggestion banner (`lib/lang-suggest.js`) compares languages, not regions. A US visitor on a `/gb/` page gets no suggestion to go to `/en/`.
- **hreflang values.** `/en/` = `en`, `/gb/` = `en-GB`, `/za/` = `en-ZA`. With no `en-US` present, Google already serves `en` pages to US users. The clusters are correct and reciprocal (home, hubs, match pages, sitemaps with `xhtml:link`).
- **`og:locale`** is `en` on `/en/` (`seo-common.js#ogLocale`).
- **Which leagues get English pages** is set by `config/leagues.json#seoMatchDirs`:
  - MLS: `en`, `gb`. Premier League: `gb`, `en`, `za`. UEFA competitions: all versions.
  - **Liga MX: `mx`, `es` only**, so the English hub is `noindex` with no hreflang.
  - The 15/09 rationale was the risk of near-duplicate pages (en/gb similarity 0.80). It does not apply to Liga MX in English, which would be a different language from `/mx/` and `/es/`.
- **Liga MX links from `/en/` fall back to French.** The fallback order in `seo-common.js#nearestDirs` is same language, then `en`, then `fr`, so it lands on French.
  - Seen on the `/en/` home page: `03:00 — Puebla vs Atlante FC` links to `/match/1550966.html` (French).
  - In `_redirects`: `/en/match/1550948|1550960|1550963|1550964.html` redirect with a 301 to French pages (`match-lifecycle.js#retiredDirTarget`).

### 1.2 Times, dates, locale
- **In the HTML Google reads:**
  - `i18n/seo/en.json` sets `tz: "UTC"` and `kickoff_note: "Kick-off times are shown in UTC."`, and dates are formatted with `intlLocale: en-GB`.
  - `seo-pages.js#matchSummaryHtml` takes the **Paris** calendar day (`m.date` is Paris time) for `<time data-seo-date>`, so late MLS games show the next day.
  - The `/en/` home summary (`.github/workflows/update-data.yml#seoHomeSummaryHtml`) reads "Today's AI analyses — 19 September 2026 (Paris time)" and lists "01:30 — New York City FC vs New York Red Bulls". That match was Friday at 7:30 PM ET.
- **In the browser:** times are converted to the visitor's time zone (`lib/match-time.js`), which is good. But `I18N.localeTag()` returns `en-GB` for `/en/` (hand-maintained table in `i18n/i18n.js`, line 31), so US visitors see "23:30" and "19 Sept", not "7:30 PM" and "Sep 19".
- **The club pages** (`lib/club-hub-render.js`) use `i18n/seo/en.json#tz`, and their copy says "kick-off times in UTC".

### 1.3 Vocabulary
- **`i18n/dict/en.json`**: "soccer" appears 0 times, "football" 16 times. It also uses "kick-off" (7), "favourite", "analyse" and "Defeat". **This dictionary is shared by `/en/`, `/gb/` and `/za/`**, so editing it would put US wording on the UK and South African pages.
- **"soccer" appears in only two places:** the MLS hub override in `i18n/seo/en.json` ("MLS Soccer Predictions, Fixtures and Standings") and the home meta description ("Football (soccer) predictions…").
- **The home H1 has no keyword** ("Understand the match. Find the right market that's fair."). The keyword H2 ("Football predictions built on probabilities, not hunches") is at the bottom of the page.

### 1.4 Odds format
- Only decimal odds exist, rendered with 2 decimals in the page locale (`match-page.js` line 26 `odds()`, plus `lib/odds.js`, `lib/tools-domain.js` and `tools-page.js`).
- There is no American (moneyline) format and no toggle.
- Odds are never in the public HTML of paid matches. Raw bookmaker odds are a public fact in `lib/premium-fields.js`, but the visitor view now shows only the Pro wall (owner decision 19/09).

### 1.5 Structured data
| Page type | Schema present | Notes |
|---|---|---|
| Home | `Organization` + `WebSite` + `WebPage` (`build-locales.js#homeJsonLd`) | Fine. |
| Match pages | `SportsEvent` + `BreadcrumbList` | `SportsEvent` has name, ISO `startDate` in UTC (correct), `location` with a place name only, `superEvent`, `sport: "Football"`. Without `location.address` it can't get Event rich results, and Google shows its own sports cards anyway. Low value: keep it correct, don't chase it. |
| League hubs | `CollectionPage` + `ItemList` + `BreadcrumbList` | Fine. |
| Club pages | `SportsTeam`, `SportsEvent`, `BreadcrumbList` | Fine. |
| Blog guides | `Article`, `BreadcrumbList`, `FAQPage` | Since August 2023 Google shows FAQ rich results only for well-known government and health sites. `FAQPage` does no harm but earns nothing. |

### 1.6 Internal linking
- **The `/en/` home page** links to league hubs through the SEO block and footer. The order is `home.priority_leagues`: premier, ldc, laliga, seriea, bundesliga, ligue1, el, ecl, then the rest. **MLS comes 11th.**
- **Hubs** link to every upcoming match (`ItemList`) and recent results.
- **Match pages** link to the hub, the home page, club or derby pages (none exist for MLS), and one guide. There are no links to other matches in the same round.
- **`/en/clubs/`** holds 7 European pages (Real, Barça, Bayern, Inter, Juve, El Clásico, Le Classique).
- **Local articles** exist for `fr/es/gb/mx/za`, and **none for `en`** (`content/local-articles/`).
- **Blog slugs are French** (`/en/blog/guides/guide-paris-sportifs-debutant-complet.html`). The effect is minor; don't rename them.

### 1.7 Page lifecycle and indexing window
- `match/*.json` covers 19–21/09 only, so English match pages appear 0 to 3 days before kickoff.
- They leave the sitemap 2 hours after kickoff (`SITEMAP_MAX_AGE_HOURS = 2`), become `noindex` after 7 days and are removed after 30 days.
- For a young domain that is often too short to be indexed before search demand peaks.

### 1.8 Legacy URLs
- Commit `a9d2f03ce` (21/07) deleted 354 `/en/` URLs:
  - 241 `/en/blog/<match>-2026-03-xx.html`
  - 74 `/en/match/*`
  - 33 `/en/world-cup-2026/*`
- They now return 404 (checked live: `/en/world-cup-2026/usa`). The owner says the `/en/404.html` page is now in English.

### 1.9 Page speed signals in the HTML
PageSpeed Insights couldn't run: the API quota was exhausted today. Signals visible in the HTML:
- **Home (`/en/index.html`):**
  - 133 KB HTML, including 36 KB of inline CSS.
  - 5 stylesheets.
  - 4 Google Font families (Bebas Neue, DM Sans, Inter, Space Mono).
  - 18 separate scripts, plus supabase-js from jsDelivr (deferred).
- **Every page** fetches `/i18n/dict/en.json` (133 KB, the whole-site dictionary).
- **Header logo:** `/assets/iashark-logo.png` (86 KB, no width or height) on the home and match pages. The 37 KB `iashark-logo.webp` already exists and is used on the hubs.
- **Match page:** 14 blocking scripts at the end of `<body>` (`match-page.js` is 100 KB).
- **Live server response times** were fine: about 0.4 s on hubs and match pages, 1.8 s on a cold `/en/`.

### 1.10 Other things a US reader notices
- **Responsible gambling:** `/en/` shows only Gambling Therapy (`_helplines.international`) and no US resource. US sites show a 21+ badge and the national helpline.
- **French text left in `/en/` match pages:** the static bottom navigation reads "Navigation principale / Accueil / Outils / Compte" and is translated only in the browser.
- **The static facts block on match pages** (form, table, head-to-head, line-ups) is still public under the Pro wall. That block keeps the pages above `MIN_INDEXABLE_WORDS = 80`. **Keep it public.** The 19/09 rule "visitor sees only the header and one panel" should stay limited to the app view.

---

## 2. What US searchers look for (keyword families)

I found no volume figures without a keyword tool. Validate priorities with Search Console (US filter) and Keyword Planner once impressions arrive.

| Theme | Keyword families (US English) | IASHARK page that should rank | Today |
|---|---|---|---|
| Generic | soccer predictions, soccer predictions today / tomorrow, soccer picks today, AI soccer predictions, soccer prediction model | `/en/` home | Title says "Football Predictions…" and times are UTC/Paris |
| MLS | MLS predictions, MLS predictions today, MLS picks this week, MLS standings, `<team> vs <team> prediction`, Inter Miami / LAFC next game, MLS playoff predictions, Decision Day | `/en/leagues/mls.html`, `/en/match/*`, club pages (to build) | Hub indexable, but the table is wrong, times UTC, no clubs |
| Premier League | premier league predictions, EPL predictions, EPL picks, premier league picks this week, `<team> vs <team> prediction` | `/en/leagues/premier-league.html`, `/en/match/*` | OK. No "EPL", UTC times, club pages only on `/gb/` |
| Liga MX (English and US Hispanic) | liga mx predictions, liga mx picks, america vs chivas prediction, liguilla predictions. In Spanish: pronósticos liga mx (served by `/mx/`, `/es/`) | `/en/leagues/liga-mx.html` (to open), `/en/match/*` | **`noindex`, no English match pages, links go to French** |
| Champions League | champions league predictions, UCL predictions, UCL picks today | `/en/leagues/champions-league.html` | OK, UTC times |
| Markets | both teams to score today, BTTS predictions, over 2.5 goals predictions today, draw predictions | Hubs, match pages, guides | Probabilities are paywalled. A guide exists (Poisson over 2.5) |
| Education | american odds explained, what does +150 mean, moneyline vs decimal, implied probability, what is xG, BTTS meaning | New `/en/` articles and an odds converter | No American odds content |
| USMNT / World Cup 2026 aftermath | USMNT next game, USMNT vs Mexico prediction (friendly 3 Oct per NBC Sports), Nations League | **Not covered.** `config/leagues.json` has no international matches | Don't create pages without real pipeline coverage |

The top US results for these queries show what the SERP expects:
- **Explicit US sections:** windrawwin.com/us/, predictz.com/us/, sportytrader.com/us/, footballwhispers.com/us/.
- **Dates and times in US format:** Dimers titles like "MLS Predictions & Picks for Saturday [9/19/2026]", with times in ET.
- **Win % next to American odds.**
- **21+ and helpline badges.**

**Timing:**
- MLS Decision Day is Saturday 7 November. Playoffs run from 18 November, and MLS Cup is Friday 18 December (mlssoccer.com).
- The Liga MX Liguilla falls in late November and December.
- The next 12 weeks are the peak of US interest in both leagues. Work shipped in the next 3 to 4 weeks has time to get indexed before then.

---

## 3. Should `/en/` target US English explicitly?

| Option | What it means | Upside | Cost / risk to the international `/en/` audience (Ireland, Canada, Nigeria, Kenya, India, Nordics…) | Recommendation |
|---|---|---|---|---|
| en-US hreflang | Add `hreflang="en-US"` to the **same** `/en/` URLs, next to `en` | Explicit signal. Zero duplication | None. Small change to how hreflang is generated | **Yes** (action 10a), low impact |
| A separate `/us/` directory | A 10th full copy of the site | Full control (ET, American odds, 21+, US helpline) and clean Search Console segments | Doubles the page count against en/gb (the near-duplicate risk the 15/09 decision tried to avoid), splits link signals, needs its own terms and routing. Not justified at 14 visits a week | **Not now.** Revisit if US clicks are the clear majority of `/en/` clicks for 2 months and the international audience needs different defaults |
| US-specific content inside `/en/` | Liga MX in English, MLS and Liga MX club pages, US guides | Matches real US queries | Neutral: these are additions | **Yes** (actions 1, 5, 7) |
| "Soccer" in titles | "Soccer" where Americans use it (home, MLS, Liga MX, match templates), paired with "football" on the home page | Relevance and click-through for US queries | "Football" stays in the body and on European hubs. Only edit `i18n/seo/en.json`: the dictionary is shared with `/gb/` and `/za/` | **Yes** (action 3) |
| ET times | ET first with UTC in brackets in the HTML. The browser already uses the visitor's time zone | Correct day in snippets for US evening games | Non-US readers still get UTC in brackets and local time in the app | **Yes** (action 2) |
| US date and clock format | `intlLocale` en-GB → en-US ("Sep 19", "7:30 PM") | Looks native to Americans | Understood internationally | **Yes** (action 2). Coordinate: `config/markets.json` and `i18n/i18n.js` both hold it |
| American odds as an option | Toggle between decimal and American, default American for en-US browsers or America/* time zones | UX and trust for US Pro users | Decimal stays the default for everyone else | **Yes** (action 9), after SEO basics |

---

## 4. Top 10 actions (ranked by impact vs effort)

Effort: **S** ≤ 1 day, **M** 2–4 days, **L** ≥ 1 week. All HTML is generated, so change the generators, never `en/*.html` by hand.

**Coordination:** another session owns `config/markets.json`, `en/*.html` and `legal/en/` today (the USD switch). Merge SEO changes after that lands, then rebuild with `node scripts/build-locales.js` and `node scripts/seo-pages.js` on the lead's side.

### 1. Open Liga MX in English and stop sending English readers to French pages. S, high impact
- **What to change:**
  - Add `"en"` to `liga_mx.seoMatchDirs` and update the rationale in the readme.
  - Add `league.overrides.liga_mx` (title, description, H1, factual intro: Apertura/Clausura short tournaments and the Liguilla, the same facts as `i18n/seo/mx.json`).
  - Change the redirect target for retired versions so an English URL never redirects to French. Target the version's own league hub (`/en/leagues/liga-mx.html`) and keep a 301 for the 4 existing `/en/match/15509xx.html` URLs.
    - Caveat: once `en` is back in scope, the current rule builder skips those entries (`match-lifecycle.js` line 411), and they would become 404s.
- **Files:** `config/leagues.json`, `i18n/seo/en.json`, `scripts/match-lifecycle.js` (`retiredDirTarget`, `redirectRules`), `scripts/seo-common.js#nearestDirs` (optional: never fall back from `en` to `fr` when `es` exists), tests that pin the Liga MX scope.
- **Expected effect:**
  - `/en/leagues/liga-mx.html` becomes indexable with reciprocal hreflang (fr, es-MX, es, en).
  - About 9 English Liga MX match pages a week.
  - Home page links stay English.
  - Captures "liga mx predictions", "america vs chivas prediction" and similar. Liga MX draws a large US audience, much of it Hispanic, and Dimers, Football Whispers /us/ and WinDrawWin /us/ all rank English Liga MX pages.
- **Risks and notes:**
  - It reverses part of the 15/09 scope choice, so the owner must confirm (see §7).
  - The Liga MX model is flagged "INCONCLUSIVE" on calibration (`config/leagues.json` readme). The English pages must show the same data-quality rating as `/mx/`, with no stronger wording.

### 2. Show kickoff times and dates in US format in the HTML Google reads. M, high impact
- **What to change:**
  - In `i18n/seo/en.json`: set `tz` to `America/New_York`, `tz_label` to `ET`, and rewrite `league.scope` and `league.kickoff_note` ("Kickoff times are shown in Eastern Time (ET).").
  - Add an optional secondary zone: render "9:30 PM ET (01:30 UTC)" in `seo-pages.js#factRowsHtml` and the hub fixture rows.
  - Fix `seo-pages.js#matchSummaryHtml`: derive the day from the kickoff instant in the directory's time zone, not from the Paris string `m.date`, and drop the hard-coded `fr-FR` formatter.
  - Home summary: make `seoHomeSummaryHtml` (pipeline) use each directory's time zone and "today", replace "(Paris time)", and change `SEO_INTL.en` to `en-US`. `build-locales.js#bakeMarket` (`data-seo-date`) follows the new locale.
  - Switch `intlLocale` to `en-US` for `/en/` in `config/markets.json#_dirs.en` **and** `i18n/i18n.js` line 31 (hand-maintained, checked by `tests/geo-dirs.test.js`).
  - Club copy: replace "in UTC" in `config/club-hubs.json#versions.en` and the `en` club intros.
- **Files:** `i18n/seo/en.json`, `scripts/seo-pages.js`, `.github/workflows/update-data.yml`, `scripts/build-locales.js`, `config/markets.json`, `i18n/i18n.js`, `config/club-hubs.json`, plus the tests that pin "UTC" or en-GB strings.
- **Expected effect:**
  - Snippets and pages show the right US day and time. "Sat, Sep 19, 9:30 PM ET" replaces "20 September 2026, 01:30 (UTC)".
  - Better click-through on "today" queries.
  - Less near-duplication between `/en/` and `/gb/`.
- **Risks:** non-US readers of `/en/` see ET first, which the UTC in brackets and the browser-side local time offset. Many test strings will need updating.

### 3. US vocabulary in titles, descriptions and H1s, league priority and links between matches. S–M, medium-high impact
- **Where:** only `i18n/seo/en.json`, which is per directory. `i18n/dict/en.json` is shared with `/gb/` and `/za/`. UI wording ("kickoff", "Loss", "favorite") would need an `en-us` dictionary layer like `es-mx`, so defer it.
- **Proposed copy** (character counts checked; `fitText` falls back automatically when a template gets too long):

| Page | Title | Description |
|---|---|---|
| `/en/` | `Soccer & Football Predictions by Statistical Model \| IASHARK` (60) | `Soccer predictions from a statistical model: MLS, Premier League, Liga MX and Champions League probabilities vs the odds. One free analysis daily. 18+` (150) |
| MLS hub | `MLS Predictions & Standings: This Week's Games \| IASHARK` (56) | `MLS soccer predictions from a statistical model: this week's games with ET kickoff times, both conference tables, recent results and form. 18+` (142). Publish only after action 4 |
| Premier League hub | `Premier League (EPL) Predictions, Fixtures & Table \| IASHARK` (60) | `EPL predictions from a statistical model: fixtures for the next 14 days with ET kickoff times, the table, recent results and form. 18+` (134) |
| Liga MX hub | `Liga MX Predictions, Fixtures & Table \| IASHARK` (47) | `Liga MX predictions in English: fixtures for the next 14 days with ET kickoff times, the current table, recent results and form. 18+` (132) |
| Champions League hub | `UCL Predictions: Champions League Fixtures & Table \| IASHARK` (60) | Keep the template, with ET |
| Match template | `{home} vs {away} Prediction & Stats ({league}, {mdy})`, for example `Nashville SC vs Chicago Fire Prediction & Stats (MLS, 9/19)` (59) | `{home} vs {away} ({league}), {day} {time} ET at {venue}: recent form, head-to-head, table and IASHARK's statistical analysis. 18+`. Add `{mdy}`, `{time}` and `{venue}` to `seo-pages.js#matchVars` |

- **Also:**
  - Add a `match.h1` template ("{home} vs {away}: prediction and stats"). Today `matchSummaryHtml` renders only the team names.
  - Set `home.priority_leagues` to `["mls","premier","liga_mx","ldc","laliga","seriea","bundesliga","ligue1","el","ecl"]`.
  - In `seo-pages.js#matchFactsHtml`, add a "More {league} games this week" block: 3 to 6 links to other matches in the same league from the current run. This helps crawlers find short-lived pages.
- **Files:** `i18n/seo/en.json`, `scripts/seo-pages.js`, `scripts/seo-common.js` (`versionNav` already follows `priority_leagues`).
- **Expected effect:** relevance for "soccer", "EPL", "UCL" and dated queries. Higher click-through.
- **Risks:**
  - "Picks" is common US vocabulary but conflicts with the brand line "an analysis, not a tip". I left it out of titles; the owner decides.
  - Never promise odds or probabilities that the public HTML doesn't show. "Statistical analysis" is accurate, since it is behind Pro except the daily free match.

### 4. Make the MLS hub credible. S–M, medium impact
- **What to change:**
  - **Standings.** `data/league-hubs-registry.json` holds one group named "Major League Soccer" with the 15 Western Conference clubs (`source: "matchs"`). `league-hub-data.js`, around line 140, keeps one match's `classement.standings` and labels it with the league name. Instead:
    - keep each conference as its own group, named from the data;
    - merge groups from different matches, or read the full `/standings` from the api-football cache (filled once MLS clubs are tracked, see action 5);
    - never merge the conferences into one ranking;
    - show the "Top of the table" figure only for single-table leagues.
    - `LATAM_OPENING_STATUS.md` item 8 already flags the same `standings[0]` problem for multi-group leagues (Liga MX, Argentina…).
  - **Venues.** "Allianz Field - Sao Paulo" and "Dick's Sporting Goods Park - Trade City" come straight from api-football venue strings. Add a small verified override map (for example `config/venue-overrides.json`, one source per entry), or show only the stadium name. Never guess.
- **Files:** `scripts/league-hub-data.js`, `scripts/seo-pages.js#hubStandingsHtml`, `lib/hub-ui.js` (captions), venue normalisation in `league-hub-data.js#venueName` and `seo-pages.js#venue`.
- **Expected effect:** the hub answers "MLS standings" correctly. US readers won't bounce on visible errors.
- **Risks:** low. Every row still comes from the API.

### 5. English club and derby pages for US-relevant teams. M, medium-high impact
- **What to change** (in `config/club-hubs.json`):
  - Add `pages.en` for the existing Premier League clubs (arsenal, chelsea, liverpool, manchester-city, manchester-united, tottenham, newcastle, aston-villa) and derbies (North London, Manchester, Merseyside). The `/gb/` intros exist; write English versions with ET times and distinct wording.
  - Add `pages.en` for the Liga MX clubs (america, chivas, cruz-azul, pumas, tigres, monterrey) and an English Clásico Nacional page.
  - **Add MLS clubs**, for example Inter Miami, LAFC, LA Galaxy, Seattle Sounders, Atlanta United, NYCFC and New York Red Bulls. Choose them from Search Console and Google Trends.
  - Add MLS derbies, for example El Tráfico (LAFC vs Galaxy) and the Hudson River Derby (NYCFC vs Red Bulls).
  - Each page needs sourced facts (the Wikipedia and api-football `teamId` pattern already in the config) and a 120–220-word intro, and stays in REVIEW.
  - Rewrite `versions.en.hub`, which currently says "Europe's big clubs".
  - Set a per-page `tz` (the club renderer already supports it) to ET.
- **Files:** `config/club-hubs.json`, `scripts/build-club-hubs.js` (no code change expected), `i18n/parts/clubs.en.json` if labels are needed.
- **Expected effect:**
  - Evergreen club queries ("inter miami next game", "lafc schedule", "club america standings") and link targets from match pages and hubs.
  - Side effect: the club builder fetches api-football `/standings` and `/fixtures` into `data/club-hubs/cache`, which `league-hub-data.js` already reads. That gives full MLS and Liga MX tables and 14-day fixtures (helps action 4).
- **Risks:**
  - API quota: 6-hour cache per endpoint.
  - Pages with no live data are already set to `noindex` by the builder.
  - The Premier League pages on `/en/` and `/gb/` must not be near-copies: different time zone and different wording.

### 6. Publish match pages earlier as fixture previews. L, high impact over time
- **What to change:**
  - For MLS, Premier League, Liga MX and Champions League, create `/en/match/<fixtureId>.html` 7 to 10 days before kickoff. Use the 14-day fixture list `league-hub-data.js` already collects.
  - Content: public facts only (ET kickoff, venue, form, table, head-to-head) and a line saying the IASHARK analysis is published before kickoff.
  - Keep the **same URL** when the analysis arrives. api-football fixture ids are the match ids.
  - The title stays "{home} vs {away}: preview, form & head-to-head" until an analysis exists.
- **Files:** `scripts/seo-pages.js` (render from a fixture), `scripts/match-lifecycle.js` (new `preview` status, registry, sitemap), `scripts/league-hub-data.js` (expose fixture objects), `.github/workflows/update-data.yml#generateMatchPages`.
- **Expected effect:** pages are found and indexed before search demand peaks (the 48 hours before kickoff). This is the biggest structural lever for match queries on a young domain.
- **Risks:**
  - Thin or mass-produced pages: keep `MIN_INDEXABLE_WORDS` (`noindex` until facts reach 80 words) and limit this to the 4 leagues.
  - More API calls (head-to-head).
  - No premium field in the HTML: keep the `lib/premium-fields.js` checks.
  - Needs an owner decision.

### 7. US-English evergreen guides and one linkable tool. M, medium impact
- **What to change:** create `content/local-articles/en.json` (folder `articles`, same format as `gb.json`) built by `scripts/build-local-articles.js`. Only verified facts with cited sources; status stays REVIEW. Candidate articles:
  1. "MLS Cup Playoffs 2026: format and key dates": Decision Day 7 November, Wild Card 18 November, MLS Cup 18 December, per mlssoccer.com.
  2. "American (moneyline) vs decimal odds: how to read them and convert to implied probability". Adapt `gb/articles/fractional-vs-decimal-odds`.
  3. "Liga MX for US fans: Apertura, Clausura and the Liguilla". English adaptation of the `/mx/` articles.
  4. "Both teams to score and over 2.5 goals: how a probability is estimated". Adapt the `fr` BTTS article and the existing Poisson guide.
- **Linkable asset:** a small public converter from American odds to decimal and implied %, with no promotion of betting.
- **Stale page:** `/en/blog/guides/coupe-du-monde-2026-guide-complet.html` is a pre-tournament guide. Update it with verified results or mark it as an archive. Never invent.
- **Files:** `content/local-articles/en.json` (new), `scripts/build-local-articles.js`, `sitemap-articles.xml` (generated), and `seo-common.js#articlesHubPath`, which picks up the new folder automatically.
- **Expected effect:** traffic from long-tail US queries, a natural reason for others to link, and internal links to the hubs.
- **Risks:** accuracy of dates and formats (cite sources); keep the "no promise, 18+" framing.

### 8. US trust and responsible-gambling signals. S, medium impact (trust)
- **What to change:**
  - Show the US National Problem Gambling Helpline on `/en/` next to Gambling Therapy.
    - NCPG's statement of 29/09/2025 says it runs the line on **1-800-MY-RESET** (call or text, chat at 1800myreset.org), following a New Jersey Supreme Court decision about 1-800-GAMBLER.
    - **Re-check on ncpgambling.org on the day you publish.** Never write a number from memory.
  - `/en/` also serves other countries, so show both resources, or pick one by country using the existing `/api/geo` edge function.
  - **Age wording (decision):** US sportsbooks and prediction sites show "21+"; Dimers shows a 21+ badge and both helplines. Either keep 18+ (IASHARK is not a bookmaker) or show "18+ (21+ where local law requires)" on `/en/`.
- **Files:** `config/markets.json` (`_helplines` plus `us.helpline` or `_dirs.en.helpline`), `scripts/build-locales.js` (`helplineFor` and `bakeMarket` supporting two resources), `lib/market-config.js`, `legal/en/jeu-responsable.html`, `seo-pages.js#renderLeagueHub` (help line in the footer).
- **Expected effect:** trust on gambling-adjacent content (a "your money" topic for Google). It is also a prerequisite for posting in US communities and on social platforms.
- **Risks:** a wrong or outdated number, hence the re-check.

### 9. American odds as a display option. M, low SEO impact, medium conversion impact
- **What to change:**
  - Add a formatter in `lib/odds.js`: decimal d ≥ 2 → `+round((d−1)×100)`; d < 2 → `−round(100/(d−1))`.
  - Add a "Decimal | American" toggle stored in localStorage (reads wrapped in try/catch, as in `site-prefs.js`).
  - Default to American when `navigator.language` is `en-US` or the browser time zone starts with `America/`, on `/en/` only.
  - Apply it in `match-page.js` (`odds()`), `home-list.js` and `tools-page.js`. Keep the decimal value in a tooltip. Link to guide 2 from action 7.
- **Expected effect:** US Pro users read odds in their native format. SEO effect is small because odds are rendered in the browser and paywalled.
- **Risks:** rounding differences with sportsbooks; the end-to-end test suite needs updating.

### 10. Technical clean-up for `/en/`. S–M, low-medium impact
- **a. hreflang alias.** Allow a directory to declare `["en", "en-US"]` pointing to the same `/en/` URL, and set `og:locale` to `en_US`. Files: `seo-common.js` (`alternatesFor`, `ogLocale`), `build-locales.js#buildHead`, `i18n-sitemaps.js`.
- **b. Legacy URLs.** In the Search Console Pages report, list which of the 354 deleted `/en/` URLs still get crawled, shown or linked.
  - Add 301s from `/en/world-cup-2026/*` to the World Cup guide. Generate them in `build-locales.js#redirectsContent`, because `_redirects` is generated.
  - Let the dated March previews stay 404 or 410.
- **c. French left in the HTML.** Bake the bottom-nav labels of `match.html` through `data-i18n`, so `/en/match/*` has no "Accueil / Outils / Compte" in its HTML.
- **d. Page speed.**
  - Use `iashark-logo.webp` with width and height on the home and match pages.
  - Cut the font families to the ones really used.
  - Defer non-critical scripts.
  - Split `/i18n/dict/en.json` (133 KB) by page.
  - Run PageSpeed Insights or Chrome UX Report first (quota blocked today) to check it's worth it.
- **e. Keep the static facts block public** on match pages (see 1.10).

---

## 5. First sprint (this week)

Order: after the USD switch lands. Plan on about 4 to 5 days for one developer, and don't run any of this in parallel with another session's build.

1. **Owner, day 1:** set up Search Console and Bing (see §6), and write down the baseline: US impressions, clicks and indexed `/en/` URLs.
2. **Action 1:** Liga MX in English, no French fallback for `/en/`, the 4 retired URLs redirected to `/en/leagues/liga-mx.html`.
3. **Action 2, core part:**
   - `en.json` time zone ET, label and kickoff notes;
   - `matchSummaryHtml` day fix;
   - home summary in the directory's time zone;
   - `intlLocale` en-US in both places.
   - The "(UTC)" secondary display can follow next week.
4. **Action 3:** `en.json` copy for the home page, MLS, Premier League, Champions League, Liga MX and the match templates; `priority_leagues`; the "More {league} games" block.
5. **Action 4:** MLS conferences as separate groups (or the honest group name as a stopgap) and the 2 venue fixes.
6. **Action 8:** US helpline, after re-checking the number. Age wording once decided.
7. Rebuild and run tests (lead session), then publish. In Search Console, **request indexing** for `/en/`, `/en/leagues/mls.html`, `/en/leagues/liga-mx.html` and `/en/leagues/premier-league.html`.
8. Start writing action 7 guide 1 (MLS playoffs), to publish by mid-October, ahead of Decision Day on 7 November.

---

## 6. Outside the code (owner)

### Google Search Console
- The site is verified with a `google-site-verification` meta tag (so probably a URL-prefix property). Add a **Domain property** (DNS TXT record) to cover every protocol and subdomain, plus a **URL-prefix property for `https://iashark.com/en/`** to get `/en/`-only reports.
- Submit `https://iashark.com/sitemap.xml`. That index already lists `sitemap-en-i18n.xml`, `sitemap-leagues.xml`, `sitemap-matches-i18n.xml` and `sitemap-clubs.xml`.
- **US performance filter:** Performance → Search results → add filter **Country = United States** (optionally Page contains `/en/`). Compare Queries and Pages weekly, and export them.
- Keep saved query filters for `mls`, `liga mx`, `epl` / `premier league`, `prediction`, `picks` and `btts`.
- **Pages report**, three things to watch:
  - "Crawled/Discovered – currently not indexed" for `/en/match/`. If it stays high, action 6 matters more.
  - "Not found (404)" for the legacy `/en/` URLs (action 10b).
  - "Page with redirect" for Liga MX.
- The old International Targeting report no longer exists. Check hreflang with a crawler (for example Screaming Frog, free up to 500 URLs).
- **GA4:** build an exploration with Country = United States × landing page × signup events. The admin funnel already records the country.

### Bing Webmaster Tools
- Sign in and use **"Import from Google Search Console"**, which verifies the site and imports the sitemaps in one step. Bing's index also feeds Yahoo and DuckDuckGo results.
- Later, IndexNow for fast discovery of short-lived match pages. This needs a key file at the site root, added to `scripts/build-public.js#PUBLIC_ROOT_FILES`, and a ping after each pipeline run.

### Links from other sites and communities
- **Reddit** (r/MLS, r/LigaMX, r/soccer, r/SoccerBetting, r/sportsbook):
  - Read each sidebar's rules before posting. Football subreddits commonly restrict self-promotion and links to betting or tipster sites. Betting subreddits commonly ban touting or selling picks.
  - Take part as a person and disclose the affiliation.
  - Share insight (for example a chart of model probability against market probability for a big match, or a playoff-race table) rather than links.
  - Never "locks", guarantees or profit claims.
- **Forums and fan media:** BigSoccer (MLS and Liga MX boards) and team fan blogs (for example SB Nation MLS sites). Pitch data pieces, such as the playoff race seen through the table and form.
- **Linkable assets:** the odds converter (action 7) and a periodic transparency note on "how calibrated our probabilities were". Real data only, no return-on-investment or profit claims.
- **Avoid** paid links, link networks and betting link exchanges. The gambling niche is a common target of manual penalties.

### Social media (TikTok and Instagram videos already made in French)
- **Make English versions:** re-voice them (AI dubbing or a native voice), burn in English captions, and swap French-league examples for MLS, EPL, Liga MX or UCL.
- **Post in the US evening, ET.** Topics: Saturday EPL early kickoffs (7:30 AM ET), MLS Saturday nights, Liga MX clásicos.
- **Tracking:** link in bio to `/en/` with UTM tags (`utm_source=tiktok&utm_medium=social&utm_campaign=us_launch`) so GA4 attributes the visits.
- **Accounts:** prefer separate English accounts (cleaner language and region signals). That is the owner's choice.
- **Platform rules:** TikTok and Meta restrict gambling promotion. Frame posts as statistics and probabilities, with no "sure bets", no winnings, no links to sportsbooks, and an 18+ (or 21+) note. Cross-posting to YouTube Shorts is cheap.

---

## 7. Decisions needed from the owner (`BLOCKED_DECISION` until answered)

1. **Liga MX in English** (action 1). This partly reverses the 15/09 `seoMatchDirs` choice (`mx`, `es` only).
2. **Primary time zone and date format for `/en/`:** ET with UTC in brackets, and en-US format (action 2). This affects every `/en/` reader, not only US ones.
3. **"Picks" in titles:** allowed, or keep "predictions" only (action 3)?
4. **Age wording on `/en/`:** 18+ or "18+ (21+ where required)" (action 8).
5. **Fixture preview pages** 7 to 10 days ahead for 4 leagues (action 6): scope and API budget.
6. **Static facts on match pages:** confirm they stay public (1.10). Removing them would make most match pages `noindex`.
7. **US Spanish speakers:** `/` sends US visitors to `/en/` whatever their browser language. `/es/` is priced in EUR and `/mx/` in MXN. A Spanish page with USD pricing would be a pricing decision. Not proposed now.
8. **USMNT and international matches:** not in the pipeline. No pages until coverage and model validation are decided. Relevant windows: the October friendlies (including vs Mexico on 3 October) and the Nations League quarter-finals in November (NBC Sports).

---

## 8. Measurement

- **Baseline this week:**
  - US impressions and clicks on `/en/` (Search Console).
  - Number of `/en/` URLs indexed, split into match, hub and club pages.
  - US visits and signups (admin funnel).
- **Reviews at 2, 4 and 8 weeks.** A new English section on a young domain rarely shows material traffic before 4 to 8 weeks. Judge first by impressions and indexed pages, then by clicks.
- **Leading indicators:**
  - Impressions for "liga mx", "mls" and "epl" queries.
  - Share of `/en/match/` pages indexed before kickoff.
  - Click-through on hub pages after the title changes.

---

## Sources (web research, 19/09/2026)
- US SERP samples: [Dimers MLS predictions](https://www.dimers.com/mls/predictions), [Dimers Liga MX](https://www.dimers.com/liga-mx/predictions), [Dimers EPL](https://www.dimers.com/bet-hub/epl/schedule), [Pickswise MLS](https://www.pickswise.com/mls/), [WinDrawWin US MLS](https://www.windrawwin.com/us/picks/usa-major-league-soccer/), [WinDrawWin US BTTS](https://www.windrawwin.com/us/picks/today/popular-leagues/all-wagers/both-teams-to-score/), [SportyTrader US MLS](https://www.sportytrader.com/us/picks/soccer/usa/mls-122/), [SportyTrader US BTTS](https://www.sportytrader.com/us/picks/soccer/btts/), [predictZ BTTS](https://www.predictz.com/predictions/today/both-teams-to-score/), [predictZ US Liga MX](https://www.predictz.com/us/picks/mexico/la-division/), [Forebet BTTS](https://www.forebet.com/en/football-tips-and-predictions-for-today/predictions-both-to-score), [Oddspedia MLS tips](https://oddspedia.com/football/usa/mls/tips), [Football Whispers US Liga MX](https://footballwhispers.com/us/blog/liga-mx-predictions/), [oddschecker US EPL](https://www.oddschecker.com/us/soccer/premier-league)
- MLS 2026 dates: [MLSsoccer.com playoffs schedule](https://www.mlssoccer.com/news/major-league-soccer-announces-audi-2026-mls-cup-playoffs-schedule), [SI 2026 MLS key dates](https://www.si.com/soccer/2026-mls-schedule-important-dates-all-star-game-world-cup-pause-decision-day)
- USMNT schedule: [NBC Sports USMNT schedule](https://www.nbcsports.com/soccer/news/usmnt-schedule-friendlies-gold-cup)
- US helpline: [NCPG statement on the National Problem Gambling Helpline number](https://www.ncpgambling.org/news/ncpg-statement-national-problem-gambling-helpline-number), [NCPG Help & Treatment](https://www.ncpgambling.org/help-treatment/)
- Index check: `site:iashark.com` returned an old `/pt/world-cup-2026/portugal` URL, now 404.
