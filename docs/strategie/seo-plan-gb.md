# IASHARK /gb/: UK SEO plan

Date: 19/09/2026. Author: read-only agent (no repo file modified, no build or test run).

Sources:
- Worktree `/Users/clement/Documents/IASHARK CLAUDE CODE/wt-seo` (branch HEAD `a136911ed`).
- Live site https://iashark.com/gb/, rendered in a real browser on 19/09/2026.
- Web research on 19/09/2026.

One caveat on the SERP data: the search tools available only query a **US index**, and DuckDuckGo UK demanded a CAPTCHA (not bypassed). The domains listed in §2 are therefore what a US index shows for UK queries. On google.co.uk, UK sites (Racing Post, Sporting Life, Sky Sports, OLBG) probably rank higher and US-only sites drop out. **Check the real UK picture in Search Console (§5) before committing big effort.**

---

## 0. Summary

1. **/gb/ is technically clean but has almost nothing a UK searcher can't find better elsewhere.**
   - Clean: hreflang, canonical, en-GB, sitemaps, UK time in the static facts, 18+ and helpline everywhere.
   - Size: 55 URLs in sitemaps. Of the 23 match URLs, 14 are MLS and 9 are Premier League.
   - Coverage: Premier League only among UK competitions. No Championship, League One or Two, FA Cup, EFL Cup or Scottish football.
   - Stats: no stats page for teams or the league.
2. **Four defects are costing rankings right now**, and each is a small fix:
   - (a) `match-page.js:1080` replaces the SEO `<title>` with "Brighton vs Arsenal — IASHARK" once the page renders, so the word "prediction" disappears from every match title Google renders.
   - (b) The Premier League table on the flagship hub is a 17-row extract. Arsenal, who are 1st, are missing, and the "Top of the table" box names Manchester City.
   - (c) The /gb/ home's crawlable match list is in **Paris time**. It holds 58 matches, is dominated by J1 League, Liga MX and Peruvian games, and links only 5 of them.
   - (d) The home match cards link to `match.html?id=` (noindex) instead of the static match pages.
3. **The biggest lever is making match pages worth ranking**, using data IASHARK already publishes as public fact but only renders client-side or not at all:
   - team stats (xG and xGA, shots, corners, cards, goals per game, goal timing);
   - team news (injuries);
   - BTTS and over 2.5 counts, with the sample size shown;
   - fractional odds.

   Then use the same data for **Premier League stats tables** (BTTS, over 2.5, clean sheets) and **stats sections on club pages**. These are low-to-medium difficulty queries where current Google results are stale or off-season.
4. **The biggest UK opportunity is blocked by owner decisions:**
   - EFL (Championship, League One, League Two), FA Cup, EFL Cup and Scottish football: validation of the Championship model is `NOT_STARTED`, and `config/leagues.json` is the owner's official list.
   - Whether to show the model's 1X2 percentages publicly: they are classed as premium today.

   Research shows lower-league match queries are the most winnable for a small site, because page 1 is full of pages from previous seasons.
5. **Don't chase "btts tips today", "acca tips", "correct score" or "football predictions today uk":**
   - affiliates saturate them;
   - most of their volume is African, and those visitors won't pay GBP;
   - they are the highest-risk wording under UK advertising rules.

   Several current /gb/ wordings also need fixing before any promotion: "never uses the odds", "Edge Detector", "recommended stake… % of bankroll" and "BANKROLL (€)". See §3.

   The ASA applied the gambling-ad principles to Oddschecker, a non-bookmaker odds site, on 27/05/2026: no top-footballer images next to odds. GambleAware wound down on 31/03/2026, so the /gb/ helpline link should become the National Gambling Helpline (GamCare).

---

## 1. Audit of /gb/ today

### 1.1 Inventory

| Type | URLs | Indexable | In a sitemap | Generator |
|---|---|---|---|---|
| Home `/gb/` | 1 | yes | `sitemap-gb-i18n.xml` | `scripts/build-locales.js` (copy of root `index.html` + en dictionary + `i18n/seo/gb.json`) |
| Landing `/gb/landing.html` | 1 | **noindex** (paid-ads page, `paidAdsEnabled:false`) | no | custom (`gb/gb-page.js`) |
| Static pages (about, pricing, tools, markets, sample analysis, legal, methodology) | 11 | yes | `sitemap-gb-i18n.xml` (12 URLs including home) | `build-locales.js` + `legal/gb/*` |
| League hubs `/gb/leagues/*` | 19 | **4** (Premier League, Champions League, Europa League, MLS). Conference League is in scope but not in the sitemap on 19/09. The 14 others are noindex because they are outside gb's `seoMatchDirs`. | `sitemap-leagues.xml` | `scripts/seo-pages.js#renderLeagueHub` + `scripts/league-hub-data.js` |
| Clubs `/gb/clubs/*` | 8 clubs + 3 derbies + hub | yes | `sitemap-clubs.xml` (12) | `scripts/build-club-hubs.js` + `config/club-hubs.json` |
| Articles `/gb/articles/*` | 3 + hub | yes | `sitemap-articles.xml` (4) | `scripts/build-local-articles.js` + `content/local-articles/gb.json` |
| Matches `/gb/match/<id>.html` | 46 files. 23 are in the sitemap: **14 MLS, 9 Premier League**. The rest are archived Europa League or MLS pages, some noindex. | noindex at kick-off + 7 days, out of the sitemap after 48 h, 301 at + 30 days | `sitemap-matches-i18n.xml` | `scripts/seo-pages.js#renderMatchPage` + `scripts/match-lifecycle.js` |
| Blog | none (`/gb/blog/*` → 301 to `/en/blog/`) | n/a | n/a | `_redirects` |

Scope comes from `config/leagues.json#seoMatchDirs`. gb = `premier`, `ldc`, `el`, `ecl`, `mls`. Liga MX, PSL, Peru and similar leagues correctly stay noindex on /gb/.

### 1.2 Page by page

**Home `/gb/`**
- Title: "Football Predictions & Premier League Stats | IASHARK UK". Good, and distinct from /en/ ("…from Statistical Models") and /za/ ("Soccer Predictions & PSL Stats").
- Meta description: good. It mentions win, draw, goals and BTTS, one free analysis a day, and 18+.
- H1: **"Understand the match. Find the right market that's fair."** It contains no keyword and is shared with /en/ and /za/, because the root `index.html` is translated by the shared `en` dictionary. The keyword H2 "Football predictions built on probabilities, not hunches" sits at the very bottom (`<!--SEO_INTRO-->`, `build-locales.js#homeSeoBlock`).
- JSON-LD: Organization + WebSite + WebPage. Correct, with a single `@id`.
- hreflang: 9 versions + x-default → /en/. Correct.
- **Defect:** the crawlable "Today's AI analyses — 19 September 2026 (Paris time)" list (`<!--SEO_MATCHES_SUMMARY-->`):
  - it is written by the pipeline into the root `index.html` in Paris time and copied to /gb/ by `build-locales.js#rewriteHomeMatchSummary`, which only rewrites the links;
  - Tottenham v Aston Villa shows **13:30** when kick-off in the UK is 12:30;
  - of 58 rows, 13 are J1 League, 7 Liga MX or Peru and similar, and only 5 are Premier League;
  - 53 rows have no link;
  - Sunday's Premier League games (Fulham v Man Utd and others) are absent because the list only covers "today".
- **Defect:** the home match cards (JavaScript) link to `match.html?id=` (noindex). This was already reported in `reports/seo-night-2026-09-19.md` §4.3 and has not been fixed (`home-list.js:219`).
- Rendered page:
  - the hero features "19 competitions", starting with Ligue 1;
  - the free analysis of the day on /gb/ was **Sparta Rotterdam v Heerenveen** (Eredivisie);
  - "Scorers of the day" are Liga Portugal, La Liga and Allsvenskan players.

  Nothing above the fold says "Premier League this weekend".

**League hubs** (`/gb/leagues/premier-league.html`)
- Title: "Premier League Predictions & Table | IASHARK UK". H1: "Premier League predictions: fixtures, results and table". Meta description is good.
- JSON-LD: BreadcrumbList + CollectionPage + ItemList of the analysed matches.
- Content: 14 days of fixtures in UK time (correct: 12:30, 15:00, 17:30), results, table, clubs and method. 844 words.
- **Defect (factual):** the table has **17 rows, ranks 2 to 18**, with a "Extract published with the latest analysed matches" note:
  - Arsenal (1st, 12 pts, per `/gb/clubs/arsenal.html`), Aston Villa and Coventry are missing;
  - the "Top of the table" KPI shows "Manchester City · 12 pts".

  Cause: `data/league-hubs-registry.json` holds `premier.standings.source = "matchs"` with 17 rows, as of 19/09. In `scripts/league-hub-data.js#updateStore` (l.125–160), a partial extract from the run wins whenever the api-football `/standings` cache is more than 3 days older. The same stored table feeds /en/ and /za/.
- Wording: API round labels ("Regular Season - 5") show on club pages. UK readers say "Gameweek 5". Form labels read "Defeat", where UK usage is "Loss" or "L".

**Clubs** (`/gb/clubs/*`)
- Covers 8 clubs (Arsenal, Chelsea, Liverpool, Man City, Man Utd, Spurs, Newcastle, Villa) and 3 derbies (North London, Manchester, Merseyside).
- These are the best pages on /gb/:
  - intros sourced and specific to each club;
  - fixtures in all competitions in UK time;
  - SportsTeam and SportsEvent JSON-LD;
  - 870–1,070 words.
- Gaps:
  - 12 Premier League clubs have no page, including the newly promoted Sunderland, Leeds, Hull, Ipswich and Coventry, and big-fanbase Everton;
  - there are no stats (BTTS, clean sheets, goals per game);
  - titles ("Arsenal fixtures, form and statistical match analysis") target head terms ("arsenal fixtures") owned by the club, BBC and Sky.

**Articles** (`/gb/articles/*`)
- 3 evergreen UK articles (derbies, fractional vs decimal odds, the Premier League season), about 1,000 words each, dated, with sources and Article JSON-LD.
- Status REVIEW (`content/local-articles/gb.json`). Good quality.
- Only 3 of them. Every other guide link on /gb/ (home, hubs, matches: "How to read a match probability") goes to `/en/blog/guides/*.html`, which have **French slugs** (`prediction-ia-football-guide-2026.html`, `plus-de-2-5-buts-probabilite-methode-poisson.html`). The bottom navigation's "Blog" also points to `/en/blog/`.

**Match pages** (`/gb/match/<id>.html`, example 1557411 Fulham v Man Utd, Sunday 16:30 UK)
- Title: "Fulham v Manchester United: predictions and stats" (≤60, built by `seo-pages.js#matchTitle` from `i18n/seo/gb.json#match`).
  - **After rendering, `match-page.js:1080` runs `document.title = home + " vs " + away + " — IASHARK"`. The rendered page (checked in a browser) is titled "Brighton vs Arsenal — IASHARK".** Google indexes the rendered DOM and usually builds its title link from it, so the "prediction" keyword is lost on every match page, in all 9 versions.
- Meta description: good. It mentions UK kick-off time, venue, form and 18+.
- H1: "Fulham vs Manchester United", with no keyword (`seo-pages.js#matchSummaryHtml` hard-codes `home vs away`).
- JSON-LD:
  - SportsEvent: correct instant, venue, `superEvent`. It has no `address`, which is normal because none is known;
  - BreadcrumbList.
- hreflang: only the versions that actually exist (fr, gb, za, en for the Premier League). Correct.
- Static content (what every crawler sees): competition, kick-off "Sunday, 20 September 2026, 16:30 (UK time)", venue, last 4 results for each team, both table rows, last 5 H2H, boilerplate. About 150 words of match-specific facts.
- Rendered content for a visitor who isn't subscribed:
  - a blurred placeholder ("Xxxxxx xxxxxx", "??,? %" with a **decimal comma** on en-GB) and a sales panel;
  - about 490 words in total, mostly boilerplate.
- Kick-off in the rendered panel: shown in the **browser's** time zone (`match-page.js#dateHeure`, "16:00 CEST" in the test browser). Googlebot renders in a US time zone, while the static block says UK time. The two figures disagree.
- Odds:
  - **decimal only**, everywhere (`match-page.js:26`, `toLocaleString`);
  - there is no fractional display anywhere on the site;
  - the only mention of fractional odds is the article.
- Data present but not shown statically:
  - `match/<id>.json` (public) holds `match_stats_home/away` (xG, xGA, shots, corners, possession, fouls), `events_home/away` (goals scored and conceded per game over `games` matches, goal timing in 15-minute slots, yellow cards per game), `injuries` (player, reason, status) and `lineups`;
  - `lib/premium-fields.js` lists team statistics, injuries and line-ups as **PUBLIC_FACT**, so they can go in static HTML;
  - `scripts/match-lifecycle.js#publicSnapshot` currently whitelists only venue, form, H2H, table and line-ups.
- Lifecycle: noindex at kick-off + 7 days, out of the sitemap after 48 h, 301 to the league hub at + 30 days. This keeps the index clean, but the page never gains post-match value (§4, A14).
- Static template: the bottom navigation is French in the HTML ("Accueil", "Outils", "Compte", `aria-label="Navigation principale"`) until `bottom-navigation.js` relabels it.

### 1.3 Cross-cutting checks

| Check | /gb/ status |
|---|---|
| `lang="en-GB"`, `og:locale=en_GB` | OK everywhere checked |
| Canonical | Points to itself, one per page. OK |
| hreflang en-GB | Reciprocal and x-default → /en/ (seo-night audit: 0 errors). Match and hub groups only list versions that exist. OK |
| Sitemaps | `sitemap.xml` is the index of 14 sitemaps; /gb/ URLs are spread across 5. Only indexable, existing pages. OK |
| `robots.txt` | `Allow: /`, sitemap declared. OK |
| Google verification | `google-site-verification` meta present on /gb/ (value not reproduced here) |
| Kick-off time zone | Static: **UK time, correct** (Europe/London, BST handled). Exceptions: home summary (Paris time) and rendered match panel (visitor's time zone) |
| Odds format | Decimal only. UK tipping sites (Racing Post, LiveScore, William Hill) use **fractional** |
| Wording | "Football", "kick-off", "fixtures", "BTTS" are used correctly. "v" (UK editorial) in titles, "vs" in H1 and JSON-LD. "Gameweek" is missing ("Regular Season - N"). "Acca" is not used, which is right (§3) |
| Currency | GBP £14.99 on pricing. The `en` dictionary still says **"BANKROLL (€)"**, "STAKE (€)" and "€0 (no edge)" in the tools, shared by gb, za and en |
| URL slugs | Legal and product pages keep French slugs (`/gb/abonnement.html`, `/gb/jeu-responsable.html`). Low impact; not worth the redirects now |
| Duplicate content vs /en/ and /za/ | Controlled by hreflang, and match pages exist only where the league is in scope. The rest of the risk is the shared English home body (A4) |

### 1.4 What is already good (keep it)

- Honest positioning: "not a bookmaker", 18+, National Gambling Helpline 0808 8020 133 and BeGambleAware on every page. No bookmaker links, no affiliate.
- UK time on the facts, hubs and clubs.
- Only versions that exist get hreflang. The thin-page protections (`MIN_INDEXABLE_WORDS=80`, noindex after 7 days) are correct.
- Evergreen articles cite their sources and stay in REVIEW. This is the right quality bar for new content.

---

## 2. Keyword research for UK searchers

### 2.1 What the SERPs show (US index, 19/09/2026; my reading marked "view")

- **Premier League matches** ("tottenham vs aston villa prediction", "newcastle vs hull prediction stats h2h"):
  - Forebet, SportsGambler, Sofascore, FotMob, FootyStats, scores24 and The Analyst (Opta) rank;
  - for the bare query, old pages from earlier meetings still rank.

  Difficulty: **high**.
- **Championship matches** ("millwall vs west ham prediction"): Racing Post, Sports Mole, Oddschecker, Sportskeeda, LiveScore, SportsGambler. Difficulty: medium–high.
- **League One, League Two, Scottish Championship and National League matches:**
  - page 1 is **stale pages from previous meetings** (Forebet 2025, Oddspedia January 2026, Soccerway 2024), bare live-score pages, and one small site (eaglepredict.com);
  - there is almost no current, dated preview.

  Difficulty: **low–medium**. This is the clearest opening for a small site.
- **"premier league predictions"**: The Analyst (Opta model %: the closest match to IASHARK's positioning, no bookmaker links), Sky Sports (Jones Knows), Forebet, footballpredictions.com. Very high.
- **"premier league predictions gameweek 5"**: si.com, CityAM, Yahoo, FanDuel, premierleague.com, **chaseyoursport.com and a Substack**. Medium: small sites rank on these fresh weekly pages.
- **League heads** ("championship predictions", "league one predictions", "league two predictions", "scottish premiership predictions"): bookmaker news sites (William Hill, LiveScore), Squawka, OLBG, Forebet, PredictZ, footballpredictions.com, Kickoff. Medium–high. Weekly "all 12 predictions" articles win.
- **Cups** ("fa cup predictions", "carabao cup predictions"): Sporting Life, Squawka, William Hill, Forebet and others. Medium, but only around each round.
- **Daily tips lists** ("btts tips today", "over 2.5 goals tips", "correct score predictions", "acca tips", "football predictions today uk"):
  - dominated by affiliates (ProTipster, FootyAccumulators, FreeSuperTips, PredictZ, WinDrawWin, OLBG);
  - Ahrefs estimates on ahrefstop.com show Forebet, PredictZ and WinDrawWin traffic comes mostly from **Kenya and Nigeria**; the UK is not in their top 5 countries.

  Difficulty: **very high**, and the audience is mostly outside the UK.
- **Stats**:
  - "btts stats premier league": ESPN, Sofascore, premierleague.com, soccerstats, FootyStats;
  - "premier league xg table": FotMob, Squawka, FootyStats, Understat and **xgstat.com (a small site holding 3 slots)**;
  - team-level current-season queries ("sunderland btts %", "chelsea btts stats", "leeds clean sheets") are answered by **Wikipedia pages for past seasons**, StatMuse or FBref. Nothing answers the current season directly: **low–medium**.
- **Explainers**:
  - "how are football probabilities calculated": arXiv PDFs, patents, Wikipedia, Brainly. The results don't answer the question: **low**, and it is exactly IASHARK's subject;
  - "implied probability explained": TNT Sports, Smarkets, Caanberry. Medium;
  - "what does btts mean", "what is an acca", "fractional odds to probability" (calculators), "expected goals explained": medium–high.
- **The UK-specific modifier is team news and line-ups.** Sports Mole gets 29% of its traffic from the UK, and its top UK keywords are "[team] vs [team] lineups". IASHARK has injury and line-up data, currently not shown statically.

Volumes: no public UK search volume was found for these queries. The only figures are Ahrefs site-level estimates for August 2026 (Forebet 5M/month, Kenya 26%, Nigeria 16%; FootballPredictions.com 300K, UK 10.7%; Sports Mole 1.3M, UK 29.3%). **Measure real UK demand in Search Console (§5) rather than trusting any volume guess.**

### 2.2 Keyword clusters → page types

| # | Cluster | Example queries | Intent | Difficulty | Target page on /gb/ | Status today |
|---|---|---|---|---|---|---|
| K1 | Premier League and Champions League match | "brighton vs arsenal prediction", "fulham v man utd stats", "newcastle vs hull h2h", "[team] vs [team] team news" | Quick verdict + facts before kick-off | High (big clubs), medium (others) | `/gb/match/<id>.html` | Exists, thin statically; title lost after render |
| K2 | EFL and Scottish match | "reading vs notts county prediction", "accrington vs newport prediction", "partick vs raith prediction" | Same | **Low–medium** | `/gb/match/<id>.html` for new leagues | Not covered (BLOCKED_DECISION, A11) |
| K3 | Gameweek round-up | "premier league predictions this weekend", "premier league predictions gameweek 5" | All 10 fixtures at a glance | Medium | Premier League hub, upgraded (A8) | Partial: 14-day list, no gameweek framing |
| K4 | League head terms | "premier league predictions", "championship predictions", "league one predictions" | Hub | High to very high | League hubs | Premier League only |
| K5 | Cup rounds | "fa cup third round predictions", "carabao cup predictions" | Seasonal | Medium, spikes | Cup hubs + match pages | Not covered (BLOCKED_DECISION, A11) |
| K6 | Team stats, current season | "sunderland btts stats", "chelsea clean sheets 2026/27", "leeds goals per game", "arsenal home record 2026/27" | Stats lookup | **Low–medium** | Stats section on club pages (A10) | Missing |
| K7 | League stat tables | "premier league btts stats", "premier league over 2.5 goals stats", "premier league clean sheets table", "premier league xg table" | Table | Medium–high (a small site holds 3 slots on the xG table) | `/gb/stats/*` (A9) | Missing |
| K8 | Explainers | "how are football probabilities calculated", "implied probability explained", "what does btts mean", "what is an acca", "fractional odds to probability", "how does the championship play-off work" | Learn | Low to high | `/gb/articles/*` (A12) | 1 of 6 exists (fractional) |
| K9 | Derbies | "north london derby head to head", "tyne wear derby record", "north west derby history" | History + next date | Medium | Derby pages | 3 exist |
| K10 | **Avoid** | "btts tips today", "acca tips", "correct score predictions", "sure wins", "football predictions today uk" | Daily tips | Very high, affiliate-dominated, mostly non-UK, highest compliance risk | None | Don't target |

### 2.3 Which content format wins

- **The stats hub**: match percentages + H2H + form + table, repeated for every fixture (Forebet, FootyStats, Sofascore, The Analyst).
  - IASHARK can match the facts today.
  - It can only match the percentages if the owner makes the model's 1X2 public (A15).
- **The long preview**: team news, predicted line-ups, key stats, FAQ, and a tip with odds (SportsGambler, Racing Post, Sports Mole).
  - IASHARK should adopt the facts + team news + FAQ.
  - It should **not** adopt the "tip + bet builder + bookmaker link" part.
- **The weekly round-up** ("all 10 Premier League predictions"). One URL updated each gameweek builds authority better than one new URL a week.
- **Stats tables** for current-season lookups: sortable tables with sample size and date. They win where Wikipedia and past seasons are the only answer.

---

## 3. UK regulatory and ethical frame

This is research, not legal advice. `config/markets.json#gb.status` is still `DRAFT_PENDING_LEGAL_REVIEW`: a UK lawyer should validate the /gb/ pages before any paid promotion.

### 3.1 Where IASHARK sits

- **No Gambling Commission licence is needed** as long as IASHARK never takes, places or brokers bets.
  - The Commission says that "providing tips in a newspaper" does not make someone a betting intermediary.
  - Tipsters who place bets for others for payment are intermediaries (s.13 Gambling Act 2005).
  - Source: gamblingcommission.gov.uk, "Betting advice for remote, non-remote and betting intermediaries".
- **Never link to or promote a bookmaker that is not GB-licensed.** Advertising unlawful gambling is an offence (s.330 Gambling Act 2005). IASHARK has no bookmaker links today; keep it that way.
- **The ASA does cover IASHARK's own marketing**: its sales pages, pricing, landing pages, ads, social posts and emails. Material on your own site "directly connected with the supply" of your service is in scope. Pure editorial (a match preview) is generally not.
- **CAP section 16 (gambling) doesn't apply directly to a non-operator.** But the ASA "may draw on the principles" of section 16 for products "likely to encourage gambling (for example, betting tipsters)", through the social-responsibility rule CAP 1.3.
- **Closest precedent: Oddschecker (Cyan Blue Odds Ltd), ruling of 27/05/2026, upheld.**
  - Instagram posts showed Harry Kane and Erling Haaland next to odds.
  - The ASA said the service "was not itself gambling but placed consumers in a position where they were interacting with gambling services", and found a breach of CAP 1.3 (strong appeal to under-18s).
  - An analysis site that shows bookmaker odds should assume the same treatment.
- **Other tipster rulings:**
  - *Thebettingman* (2020): "450 quid up… best second source of income" was irresponsible, and using a promoter under 25 breached the under-25 rule.
  - *Philip Murray* (2018): "guaranteed… crush the bookies" was misleading.
  - *Profit Squad* (2017): "100% risk-free profits" was misleading.
  - CAP's advice page "Betting and gaming: tipsters" (updated 22/05/2025): no guarantees, and no suggestion of income or "investment". Past results must be representative, not a cherry-picked period, and verified by independent proofing. Testimonials need evidence.

### 3.2 The rules that matter for /gb/

| Rule | What it says | What it means for /gb/ |
|---|---|---|
| CAP 3.1 / 3.7 (misleading, substantiation) | Every objective claim must be backed by evidence held before publishing | No hit rate, accuracy %, ROI or "profit" claims. The only measured calibration so far (`CALIBRATION_REPORT.md`, legacy pipeline) was worse than chance, and the current engine has no live record (`historical_calibration: NOT_AVAILABLE_YET`). Also covers "never uses the odds" and "edge" (A5) |
| CAP 1.3 + tipster advice | Social responsibility applied to services that encourage gambling | Don't present betting as income, investment or a way to solve money worries. No pressure to bet |
| CAP 16.3.12 (strong appeal to under-18s; guidance refreshed 14/10/2025) | The guidance names football as a subject of inherent appeal. High risk: **UK footballers at top clubs or national teams, and managers**, youth culture, cartoons, gaming references | Plain **text** references to teams and players are fine. Club crests may identify a match (Exemption C), but they are also trademarks. **Don't use images of current Premier League or England players** in any marketing or social image, or on the public /gb/ home. The "Scorers of the day" cards (`home-scorers.js`) show api-sports player photos to Pro users: on gb, use the initials avatar instead. No memes, gaming styling or cartoon mascots in UK promotion |
| CAP 16.3.13 | No gambling-related ads in media where more than 25% of the audience is under 18 | Relevant for social and YouTube placement and for any sponsorship |
| CAP 16.3.14 (under-25s) | No-one who is or seems to be under 25 may feature significantly | No young influencers or creators fronting IASHARK UK |
| CAP 16.3.3–16.3.8 | Gambling must not be shown as an escape, a solution to money worries, an alternative to work, or a boost to status or attractiveness | Hooks and ads must be about understanding the match, never about winning money |
| CAP 3.31, 3.23, 3.45, 3.47 | No false urgency; "free" only if truly free; incentivised reviews disclosed; testimonials genuine and on file | No countdown timers. "Free" plan wording is fine if nothing is charged. **No invented testimonials or reviews** |
| DMCC Act 2024, Schedule 20 (in force since 06/04/2025) | Banned practices, including fake or selectively shown reviews (para 13), false limited-time offers (para 7), false "free" (para 23), and "claiming that products are able to facilitate winning in games of chance" (para 18) | Never write "helps you win", "winning bets", "find winners". Para 18 is untested for sports betting but is a strict ban, so treat it as applying |
| DMCC subscription contracts regime (start moved to **January 2027**) | Information before sign-up, reminders, cooling-off, cancellation through the same channel | Not SEO, but the /gb/ checkout and cancel flow must be ready before promoting a monthly subscription at scale |
| Google Ads gambling policy | Gambling-promoting content, including sites that inform about or compare gambling services, needs Google certification; UK advertisers need a Gambling Commission licence | Matches `adsGamblingCertRequired: true`. No Google Ads for pages that show odds without certification. Organic SEO is unaffected |
| Google Search spam policies (updated 28/08/2026) | "Scaled content abuse" includes generating "many pages without adding value" with AI; site reputation abuse | Each automated match page must carry unique data (A6). Keep the thin-page noindex rules. Say openly that texts are AI-written from calculated figures (already on /gb/a-propos.html) |

**Helpline and signposting (A5):**
- GambleAware announced it would wind down by **31/03/2026**, as the statutory levy moved treatment and prevention funding to NHS England, OHID and the devolved governments. `begambleaware.org` still redirects to `gambleaware.org` today, but check its status before relying on it.
- The **National Gambling Helpline 0808 8020 133** (free, 24/7, run by GamCare, listed on the NHS page) is still valid. Watch out: the BGC "Take Time to Think" site misprints it as 0800.
- Recommendation: make **"National Gambling Helpline 0808 8020 133 (GamCare) · gamcare.org.uk"** the primary signpost on /gb/. Change `config/markets.json#gb.helpline.url` and `display` from begambleaware.org to gamcare.org.uk after legal review, and keep BeGambleAware only while it still resolves.
- Don't use "Take Time to Think" (a BGC campaign; IASHARK is not a member).

### 3.3 Wording: DO and DON'T for /gb/ (titles, H1s, meta, social posts, emails)

| Use (DO) | Avoid (DON'T) | Status |
|---|---|---|
| "prediction", "model probability", "estimated chance", "our model rates Arsenal at 58%" | "sure bet", "banker", "lock", "nailed-on", "can't lose", "guaranteed", "certain" | DON'T column: legal (3.1/3.7) for guarantees; best practice for "banker" and "lock" |
| "58% still fails four times in ten"; "estimates, not promises" | "risk-free", "safe bet", "free money" | Legal (3.1, free bets advice) |
| "stats", "form", "H2H", "team news", "BTTS in 3 of the last 4" (with N) | "BTTS tips today", "acca tips", "correct score tips", "football tips today" as target keywords | Best practice + SEO (§2.1, K10) |
| "compare the model with the price", "gap between model and market" | "edge", "beat the bookies", "crush the bookies", "value bet guaranteed", "find winners", "helps you win" | Legal risk (3.1, DMCC Sch. 20 para 18) |
| "stake calculator using your own figures" | "recommended stake", "% of bankroll" as a selling point, "bankroll growth" | Best practice, based on 3.1 and CAP 1.3 |
| "cancel anytime", the real price, "free plan: one analysis a day" | countdowns, "last chance", "only X places left", "join the winners" | Legal (3.31, Sch. 20 para 7) |
| 18+ on every page and at sign-up; the helpline on every page | "make money", "second income", "pay your bills", "investment", "profit" | Legal (CAP 16 principles via 1.3; tipster rulings) |
| Team names and crests to identify a match | Photos or video of current Premier League or England players or managers in marketing; under-25 presenters; memes, cartoons, gaming styling | Legal (16.3.12 and 16.3.14 via 1.3; Oddschecker 2026) |
| Real testimonials only, with evidence on file, labelled if incentivised | Invented, selected or paid-for reviews; "#1 prediction site", "most accurate" | Legal (3.45, 3.47, DMCC Sch. 20 para 13; 3.7) |

What the ethical frame means for SEO specifically:
- **Target understanding queries** (stats, H2H, team news, "how probabilities work"), not "tips" queries. That is where a no-affiliate analysis site is both more compliant and more likely to rank.
- **No page may exist only to capture a betting query with thin text.** Every match or stats page must give real data with sample sizes.
- The acca article (A12) must **explain** combined probability, never recommend accumulators. It carries no odds boosts, no bookmaker names and no "today's acca".

---

## 4. Action plan

Legend:
- Impact: H (high), M (medium), L (low).
- Effort: **S** = under a day, **M** = 2–5 days, **L** = over a week.
- **BLOCKED_DECISION** = the owner must decide first; nothing is changed until then.

All data-driven content below uses **data the pipeline already collects** (api-football) or evergreen explanations. No number is invented. Every stat shows its **sample size and date**, and nothing claims accuracy, ROI or hit rate.

| Rank | Action | Impact | Effort | Blocked? |
|---|---|---|---|---|
| 1 | A1 Keep the SEO title after render | H | S | no |
| 2 | A2 Full Premier League table on hubs | H | S | no |
| 3 | A3 UK home summary in UK time | H | S–M | no |
| 4 | A6 Public stats, team news and FAQ on match pages | H | M | no (xG: check the source first) |
| 5 | A8 Premier League hub → "Gameweek N" | H | M | no |
| 6 | A9 Premier League stats tables | H | M | no |
| 7 | A5 UK wording and compliance fixes | M (risk) | S | helpline change: legal review |
| 8 | A10 20 club pages + stats + derbies | M–H | M | no (sourced intros needed) |
| 9 | A13 Internal links and navigation | M | S | no |
| 10 | A4 UK H1 and hero on the home | M | S | no |
| 11 | A7 Fractional odds | M | S–M | no |
| 12 | A12 Six UK evergreen guides | M | M | no (REVIEW status) |
| 13 | A11 EFL, cups, Scotland | very H | L | **yes** |
| 14 | A15 Public model %, free match, MLS, big-5 leagues | H | S once decided | **yes** |
| 15 | A14 Post-match value, track record | M | M | partly |

**Order to follow:**
1. **This week (S):** A1, A2, A3, A5, A13, A4.
2. **Next (M):** A6, A8, A7.
3. **Then (M):** A9, A10, A12.
4. **Owner decisions:** A11, A15, A14, to settle in parallel with steps 1–3.

### A1. Keep the SEO title after render (Impact H · Effort S)
- **Change**: in `match-page.js:1080`, don't overwrite `document.title` on the static SEO pages. When `window.FIXED_MATCH_ID` is defined, the server title stays. Keep the current behaviour only for `match.html?id=` (noindex).
- **Files**: `match-page.js` (+ a test such as `tests/seo-meta*.test.js`: after `viewModel()` on a static page, `document.title` is unchanged).
- **Effect**: every match page in all 9 versions keeps "prediction(s)", "stats" and the competition in its title link. This is a prerequisite for ranking on K1.
- **Check**: Search Console → URL Inspection → "View crawled page" → rendered title.

### A2. Fix the Premier League table on the hubs (Impact H · Effort S)
- **Change**: in `scripts/league-hub-data.js#updateStore`:
  - never let a `source:"matchs"` extract win when it has no rank-1 row, or has fewer rows than the last full api-football table for the same league and season;
  - in that case keep the last full table, even if it is up to about 7 days old, and show its `as_of`;
  - make sure the pipeline refreshes `/standings` daily for every league in a gb scope (the club-hub cache already does this for club pages).
- **Files**: `scripts/league-hub-data.js`, `tests/league-hub-data*.test.js`.
- **Effect**: removes a visible factual error on the page targeting "premier league predictions" and "premier league table" (it currently names Manchester City top while Arsenal lead). Protects trust and E-E-A-T. Also fixes /en/ and /za/.

### A3. A UK home summary, in UK time (Impact H · Effort S–M)
- **Change**: for `gb`, rebuild the `<!--SEO_MATCHES_SUMMARY-->` block from the run data (`data-home.json` or `data.json`) instead of the Paris-time root copy:
  - only competitions in gb's scope (Premier League, Champions League, Europa League, Conference League; later EFL);
  - times in `Europe/London` with the "UK time" label, from `i18n/seo/gb.json#tz` and `tz_label`;
  - a 7-day window grouped by day ("Saturday 19 September", "Sunday 20 September");
  - every row linked to `/gb/match/<id>.html`.
  - suggested H2: "This week's Premier League and European fixtures (UK time)".
- **Files**: `scripts/build-locales.js#rewriteHomeMatchSummary` (or a gb variant), the pipeline's `injectHomeSeoSummary` (`.github/workflows/update-data.yml`), `scripts/match-lifecycle.js#homeSummaryHref`.
- **Effect**:
  - the home's crawlable text becomes UK-specific and different from /en/ and /za/;
  - wrong kick-off times stop reaching UK users;
  - about 10–20 internal links per week point at /gb/ match pages, which helps discovery and indexing of K1 pages.

### A4. A UK H1 and hero for the /gb/ home (Impact M · Effort S)
- **Change**: allow a per-directory override of the hero H1 and subtitle from `i18n/seo/gb.json`, e.g. `home.hero_h1` and `home.hero_sub`, applied in `build-locales.js#injectHomeSeo`.
  - Suggested H1: **"Premier League predictions you can check"**.
  - Suggested subtitle: "Model probabilities for every Premier League and European fixture, set against the odds, with the data and the limits shown. Kick-off times in UK time."
  - Put Premier League, Champions League, Europa League and Conference League first in the "competitions covered" strip on /gb/.
- **Files**: `scripts/build-locales.js`, `i18n/seo/gb.json`, the root `index.html` (a marker around the hero H1).
- **Effect**: the title, H1 and first paragraph target "premier league predictions" and "football predictions", and the /gb/ home stops being a copy of /en/.

### A5. UK wording and compliance fixes on /gb/ (Impact M: risk reduction, prerequisite for any promotion · Effort S)
Wording changes:
- **Home SEO paragraph** (`i18n/seo/gb.json#home.paragraphs[0]`). Today it says "a statistical score model that **never uses the odds**". Since 19/09 the highlighted market uses 80% de-margined bookmaker probability + 20% model (`lib/decision.js#pickMarketFair`), so as written the sentence is inaccurate.
  - Suggested: "IASHARK's score model is built from match data only. The highlighted market combines that model with the bookmaker price, margin removed, and the page shows both."
  - The same check applies to `/gb/a-propos.html` and `/gb/methodologie.html`.
- **"Edge Detector"** (the "where the market strays furthest from our probabilities" tool, `/gb/pro.html`) and the paywall's "EDGE + RECOMMENDED STAKE", in the `en` dictionary shared with gb (`paywall_feat1_name`, `why6_*`, "recommended stake is roughly x% of bankroll"). The owner's own backtest says "no rule is profitable (bookmaker margin)", so presenting "edge" and "recommended stake" as selling points implies an advantage that isn't substantiated (CAP 3.1 and 3.7, §3).
  - Suggested renames: "Model vs market gap", "Stake calculator (your own figures)".
  - Remove any "recommended stake" from the Pro sales pitch on gb.
- **"BANKROLL (€)", "STAKE (€)", "€0 (no edge)"** in the `en` dictionary shown on /gb/: switch to the market currency (the `{currency}` placeholder already exists for prices).
- **Round labels**: "Regular Season - N" → "Gameweek N" (in the club and league hub render, `lib/club-hub-render.js`, `lib/hub-ui.js`, gb labels in `i18n/seo/gb.json`). Form label "Defeat" → "Loss" (dictionary key `clubs.result_long`, en-GB).
- **Placeholders "??,? %"**: use the page locale's decimal separator ("??.? %") on en-GB.
- **Helpline**: primary signpost "National Gambling Helpline 0808 8020 133 (GamCare) · gamcare.org.uk" instead of begambleaware.org (§3.2). Change `config/markets.json#gb.helpline`; the articles already cite GamCare. Needs legal review.
- **Player photos**: on gb, show the initials avatar instead of api-sports player photos in "Scorers of the day" (`home-scorers.js#renderCard`) and in match-page player blocks. Never put current Premier League or England player images in UK social or marketing images (§3.2, Oddschecker ruling 27/05/2026).

Files: `i18n/seo/gb.json`, `i18n/dict/en.json` (or a new gb override layer: see note), `legal/gb/*`, `config/markets.json`, `home-scorers.js`.

Note: gb, za and en share `i18n/dict/en.json`. A light `en-GB` override layer read by `build-locales.js#bakeI18n` (only the keys that differ: currency, gameweek, fractional) would stop UK fixes leaking to the international version.

Effect: removes the claims most likely to draw an ASA complaint, and makes /gb/ read as British.

### A6. Match pages worth ranking: public stats, team news and FAQ in static HTML (Impact H · Effort M)
- **Change**: in `scripts/seo-pages.js#matchFactSections`, add sections rendered from **public** fields (whitelist them in `scripts/match-lifecycle.js#publicSnapshot`):
  1. **"Stats comparison"** table, home vs away:
     - goals scored and conceded per game (`events_*.goals_avg`, `conceded_avg`, over `games` matches);
     - shots and shots on target per game, corners, possession, fouls, yellow cards per game (`match_stats_*`, `events_*.yellow_per_game`);
     - xG and xGA per game **only once it is confirmed that `match_stats_*.xg` comes from api-football fixture statistics and not from the model** (`lib/premium-fields.js` classes "xG du modèle" as premium).
     - The sample basis ("last N league matches, source API-Football, updated <date>") is shown under the table. If the pipeline does not export N for `match_stats_*`, add it before publishing averages.
  2. **"Goals and BTTS in recent matches"**:
     - computed from `form_home` and `form_away` scores (full-time results are public facts);
     - "Brighton: both teams scored in 3 of their last 4 matches, over 2.5 goals in 3 of 4";
     - always "X of N", never a percentage without N;
     - do not use `tendances` (samples of 2).
  3. **"When the goals come"**: share of goals scored and conceded by 15-minute slot (`events_*.slots`, `slots_against`), phrased as in the client FAQ ("Brighton score 45% of their goals before half-time").
  4. **"Team news"**: injured or suspended players (`injuries`: name, reason, status only; not the `impact` field), with "Source: API-Football, as of <time>. Check official club news before kick-off." Confirmed line-ups already exist.
  5. **Static FAQ** (`<details>`, plus a matching `FAQPage` or no JSON-LD). Only the public questions: "When and where is X v Y?", "What is the recent form?", "Who has won the recent meetings?", "Which team scores earlier?". Reuse `match-page.js#faqCard`'s public part so text and data stay the same.
- **Titles and H1** (`i18n/seo/gb.json#match` + a new `match.h1` key read by `matchSummaryHtml`):
  - title: `"{home} vs {away} Prediction, Stats & H2H ({league})"`, with fallbacks `"{home} vs {away} prediction & stats"` and `"{home} vs {away} prediction"`. Use "vs" in the title because it matches what people type; keep "v" in body text if preferred;
  - H1: `"{home} v {away} prediction and stats"`;
  - description: "{home} v {away}, {date}, {time} UK time: team news, form, H2H, goals and BTTS stats, and IASHARK's statistical analysis. 18+".
- **Kick-off in the rendered panel**: on the country-market directories (gb, za, mx), show the market time zone ("15:00 UK time") and optionally the visitor's time second (`match-page.js#dateHeure`, `lib/match-time.js`). This makes the rendered and static figures agree.
- **Files**: `scripts/seo-pages.js`, `scripts/match-lifecycle.js`, `i18n/seo/gb.json` (and the other `i18n/seo/*.json` for parity), `match-page.js`, tests (`tests/seo-pages*.test.js`: no premium field in static HTML, samples shown).
- **Effect**:
  - match-specific content grows from about 150 words to about 400–600 real words;
  - pages answer "stats", "h2h", "team news" and "btts" intents, which is the UK modifier (§2.1);
  - more pages clear the thin-content threshold;
  - the pages stop depending on JavaScript rendering;
  - it lowers "scaled content abuse" risk, because every page carries unique data.

### A7. Fractional odds on /gb/ (Impact M · Effort S–M)
- **Change**:
  - add `oddsFormat: "fractional"` to `config/markets.json#gb`, carried into `lib/market-config.js` by `syncMarketConfig`;
  - one shared `formatOdds(decimal, format)` in `lib/` converts to the nearest standard UK fraction (evens, 4/6, 8/11, 5/4, 11/8, 13/8, 15/8, 9/4, 5/2, 11/4, 3/1…) and shows the decimal in a tooltip or a small second line;
  - `match-page.js:26 odds()`, `home-list.js` and `tools-page.js` use it;
  - a site preference toggle ("Odds: fractional / decimal") stored in `site-prefs.js`;
  - static pages show odds nowhere, so nothing changes there.
- **Files**: `config/markets.json`, `scripts/build-locales.js#marketRuntimeData`, `lib/` (new helper + test), `match-page.js`, `home-list.js`, `tools-page.js`, `site-prefs.js`.
- **Effect**: UK users read prices the way the rest of UK football media prints them (Racing Post, LiveScore, William Hill). Better engagement and fewer confused bounces. It pairs with the existing "fractional vs decimal odds" article.

### A8. Turn the Premier League hub into "Premier League predictions this weekend: Gameweek N" (Impact H · Effort M)
- **Change** (same URL `/gb/leagues/premier-league.html`, so it keeps and builds authority; no new weekly URLs):
  - Dynamic title: "Premier League Predictions: Gameweek {n} Fixtures & Stats". Fallback: "Premier League Predictions & Table | IASHARK UK". Round from the api-football `league.round` already in the hub data.
  - H1: "Premier League predictions: Gameweek {n}".
  - Hook (intro): "All ten Gameweek {n} fixtures in UK time, with each side's form, goals and BTTS record and the latest table. Match pages carry the full stats and IASHARK's statistical analysis."
  - A "Gameweek {n} at a glance" section: for each fixture, kick-off (UK), both teams' last-5 form (W/D/L), table position, the last H2H result, "BTTS in X of last N" for each side, and a link to the match page.
  - Honest line: the model's probability is shown on the match page (for Pro, and the free match), unless A15 decides otherwise.
  - Keep the full table (after A2), results, clubs and method.
- **Files**: `scripts/seo-pages.js#renderLeagueHub` + `hubMeta`, `scripts/league-hub-data.js` (round), `lib/hub-ui.js`, `i18n/seo/gb.json#league.overrides.premier`.
- **Effect**: targets K3 ("premier league predictions this weekend", "gameweek N", medium difficulty with small sites ranking) and K4 on one strong URL. `lastmod` changes every gameweek, which gives a freshness signal.

### A9. Premier League stats tables (Impact H · Effort M)
- **New pages** (gb only, `/gb/stats/`), rebuilt daily from **all** Premier League full-time results of the current season (api-football fixtures already cached for the hubs, `data/club-hubs/cache`):

| URL | Title (≤60) | H1 | Hook |
|---|---|---|---|
| `/gb/stats/premier-league-btts.html` | Premier League BTTS Stats 2026/27: Every Team | Premier League both teams to score stats 2026/27 | "How often both teams score in each side's matches, home and away, updated after every gameweek." |
| `/gb/stats/premier-league-over-2-5-goals.html` | Premier League Over 2.5 Goals Stats 2026/27 | Premier League over 2.5 goals stats 2026/27 | "The share of each team's matches with three goals or more, home and away, with the number of games played." |
| `/gb/stats/premier-league-clean-sheets.html` | Premier League Clean Sheets Table 2026/27 | Premier League clean sheets 2026/27 | "Which defences keep the ball out: clean sheets and failed-to-score counts for every club." |
| `/gb/stats/premier-league-goals-per-game.html` | Premier League Goals per Game 2026/27 by Team | Goals per game in the Premier League, 2026/27 | "Scored, conceded and total goals per match for all 20 clubs, split home and away." |

  Each page:
  - a sortable table (club, played, count, %, home, away), always with N and "as of" date;
  - a short method box ("counted from full-time results; own goals count; abandoned matches excluded");
  - links to the club pages (A10) and upcoming match pages;
  - JSON-LD: BreadcrumbList + WebPage only (no `Dataset` markup, which brings no rich result here and raises redistribution questions for api-football data);
  - no betting wording beyond the neutral stat names.

  No xG table unless A6's check confirms the source and the licence allows it.
- **Files**: new `scripts/build-stat-tables.js`, `i18n/seo/gb.json#stats`, `scripts/i18n-sitemaps.js` or a new `sitemap-stats.xml` listed in `sitemap.xml`, links from the home SEO block, the Premier League hub and match pages, tests.
- **Effect**: targets K7 and the long tail of K6. Tables like these attract natural links from fans and FPL players. Early-season results have tiny samples, so show N prominently and don't give percentages when N < 3.

### A10. Club pages: all 20 Premier League clubs, a stats section, more derbies (Impact M–H · Effort M)
- **Change**:
  - Add the 12 missing clubs to `config/club-hubs.json` (Brighton, Brentford, Bournemouth, Crystal Palace, Everton, Fulham, Nottingham Forest, Leeds, Sunderland, Hull City, Ipswich, Coventry), each with an **intro sourced like the existing ones** (`sources[]`, REVIEW, no count of trophies that could change).
  - Add a **"2026/27 in numbers"** section to every club page, computed from season results: played, W-D-L home and away, goals per game, BTTS X of N, over 2.5 X of N, clean sheets, failed to score.
  - Titles move from head terms to winnable ones, e.g. "Sunderland Stats 2026/27: Form, Goals, BTTS & Fixtures"; H1 "Sunderland: 2026/27 stats, form and fixtures".
  - Derbies to add, only where both clubs are in the Premier League this season and sources are found:
    - **Tyne–Wear derby** (Newcastle v Sunderland: back in the Premier League, and a big search demand);
    - **North-West derby** (Liverpool v Manchester United);
    - a London derby with a documented rivalry (e.g. Chelsea v Tottenham);
    - **M23 derby** (Brighton v Crystal Palace).
- **Files**: `config/club-hubs.json`, `scripts/build-club-hubs.js`, `lib/club-hub-render.js`, `i18n/parts/clubs.en.json` (gb labels), tests.
- **Effect**:
  - targets K6 ("[club] stats", "[club] btts", "[club] clean sheets") and K9;
  - gives every match page two club links;
  - brings clubs with big but less contested search demand (Sunderland, Leeds, Everton) into the index.

### A11. EFL, cup and Scottish coverage (Impact very H · Effort L) — **BLOCKED_DECISION**
- **Facts**:
  - `config/leagues.json` (the owner's official list) has no English competition below the Premier League;
  - `config/league-expansion.json` lists Championship (api-football 40), League One (41), League Two (42) as `NOT_STARTED`, and Scottish Premiership (179) as `INCONCLUSIVE`;
  - the FA Cup and EFL Cup appear in neither file (api-football ids to confirm with `/leagues?id=`).
- **Question for the owner** (one of three):
  - (a) **Full coverage for gb only**: add `championship` (then League One and Two) to `config/leagues.json` with `seoMatchDirs: ["gb"]`. Precedent: Liga MX and PSL were opened without full validation. Model analyses are then published with their data-quality rating.
  - (b) **Stats-only coverage**: a Championship hub and match pages with fixtures in UK time, the table, form, H2H, team news and stats (A6 blocks), with **no model output**, titled "fixtures, stats & H2H" (not "predictions", to stay honest) until the model is validated.
  - (c) Wait for validation.
- **If (a) or (b)**, suggested pages:
  - `/gb/leagues/championship.html`: title "Championship Predictions & Table: Fixtures in UK Time" (a) or "Championship Fixtures, Table & Stats (UK Time)" (b). H1 "EFL Championship: fixtures, table and stats". Mention the official sponsored name ("Sky Bet Championship") once in the body text as a fact, never in the title, H1 or a link, because it is a bookmaker brand. Hook: "All 12 Championship fixtures each round in UK time, the table with the new top-eight play-off places, and form, goals and BTTS stats for every side."
  - Same for `league-one.html` and `league-two.html`, and for the **FA Cup** and **Carabao Cup** hubs, which are seasonal: indexable only in the weeks with fixtures (the existing `MIN_HUB_FIXTURES` logic already handles this).
- **Effect**: the most winnable UK match queries (K2, K5). Research found page 1 full of stale pages for League One and Two, Scottish and National League fixtures. This is also the part of the site most clearly distinct from /en/.

### A12. UK evergreen guides (Impact M · Effort M, writing)
Six new articles in `content/local-articles/gb/`, manifest `gb.json`. All REVIEW until checked, sources listed, no prices, no tips, no hit rates. They are different from /en/ because each is framed on UK competitions and UK conventions (fractional odds, EFL, FA Cup) and linked to real /gb/ data pages.

| Slug | Title (≤60) | H1 | Hook | Targets |
|---|---|---|---|---|
| `how-football-probabilities-are-calculated` | How Football Match Probabilities Are Calculated | How a football match probability is calculated | "Where a number like 'Arsenal 58%' comes from: goals, form, home advantage, and why 58% still loses four times in ten." Uses a worked Poisson example built on one real, completed Premier League fixture's public stats (dated and sourced), never on made-up figures presented as real. | K8, low difficulty, IASHARK's core subject |
| `implied-probability-explained` | Implied Probability Explained: Odds, Margin, Fair Price | What the odds really say: implied probability explained | "5/2 means 28.6%, until you remove the bookmaker's margin. How to read the probability inside every price, in fractional and decimal." | K8; builds on the fractional-odds article |
| `what-does-btts-mean` | What Does BTTS Mean? Both Teams to Score Explained | Both teams to score (BTTS), explained | "What BTTS means, how often it happens in the Premier League this season (live table), and why a team's BTTS record can mislead after five games." Links A9. | K8 + K7 |
| `what-is-an-acca-probability` | Acca Maths: Why Combined Probabilities Fall So Fast | Accumulators and probability: the maths behind the acca | "Four legs at 60% each don't make a 60% bet: they make 13%. A plain explanation of how combined probability works." Educational, discourages over-confidence. See §3 on wording. | K8 ("what is an acca", medium–high) |
| `efl-explained-promotion-play-offs` | The EFL Explained: Promotion, Play-offs, Relegation | The EFL explained: Championship, League One and League Two | "72 clubs, three divisions, and from 2026/27 an eight-team Championship play-off. How promotion and relegation work between the Premier League and League Two." Sources: EFL, Sky Sports. | K8 + future A11 hubs |
| `fa-cup-rounds-explained` | FA Cup Rounds Explained: When Premier League Clubs Enter | How the FA Cup works: rounds, dates and draws | "From the extra preliminary round in August to Wembley in May: when each tier enters, how the draw works, and what changed with replays." Replay rules to verify on thefa.com before writing. | K5 seasonal |

- **Files**: `content/local-articles/gb.json`, `content/local-articles/gb/*.htm`, `scripts/build-local-articles.js` (unchanged), `sitemap-articles.xml` (generated).
- **Effect**: explainer rankings with low competition for the first two. Topical depth (E-E-A-T). Internal link hubs for match and stat pages. Link-worthy material for communities (§5).

### A13. Internal linking and navigation on /gb/ (Impact M · Effort S)
- **Changes**:
  - Replace the `/en/blog/guides/…` links (French slugs) with gb articles on /gb/ pages:
    - match page "How to read a match probability" → `/gb/articles/how-football-probabilities-are-calculated.html` (A12), with `MATCH_GUIDE` made per directory in `scripts/seo-pages.js`;
    - hub guides (`HUB_GUIDES`) → gb articles;
    - home "Understand the method" → gb articles.
  - Bottom navigation "Blog" on /gb/ → `/gb/articles/` (`bottom-navigation.js` href per directory; `_redirects` `/gb/blog/*` → `/gb/articles/` once the hub has more than 6 articles).
  - Bake the English labels into the static bottom navigation of `match.html` pages on gb (`B().bakeI18n` already runs, but the `bottom-nav` block in `match.html` isn't keyed).
  - `/gb/exemple-analyse.html`: use a Premier League example instead of PSG v Monaco (title and page), only with a real past analysis.
  - Link blocks: match page → both clubs + derby + the league stat table (A9); club page → its stat rows (A9) + next match; stat tables → clubs.
- **Files**: `scripts/seo-pages.js`, `scripts/build-locales.js#homeSeoBlock`, `bottom-navigation.js`, `match.html`, `content/local-articles/gb.json` (related links).
- **Effect**: PageRank stays inside /gb/ en-GB pages instead of leaking to /en/, and match, club, stat and guide pages reinforce each other.

### A14. Post-match value and a public track record (Impact M · Effort M) — partly **BLOCKED_DECISION**
- **Unblocked part**:
  - after full time, the page keeps the final score, the pre-match public stats (A6) and a short "what happened" line from API events (scorers, cards: public facts);
  - keep it indexable until kick-off + 14 days (instead of 7) for Premier League and future EFL matches only, so it catches "[team] v [team] result/stats" searches in the days after.
  - Files: `scripts/match-lifecycle.js` (`stageFor`), `scripts/seo-pages.js#archivedCardHtml`.
- **Blocked part**:
  - showing the model's pre-match probabilities next to the result, and later a **calibration page** ("when we said 60%, how often did it happen?", with N and confidence bands, no ROI);
  - the only measured calibration (`CALIBRATION_REPORT.md`, legacy pipeline, 29/08/2026) was **worse than chance**, and match data carries `historical_calibration: NOT_AVAILABLE_YET`;
  - nothing of this kind may be published until the current engine has a measured live record, and the owner accepts publishing it whatever it shows.
- **Effect**: longer page life, and later a strong trust signal that competitors don't offer (research: none updates previews after the match).

### A15. Owner decisions that change the SEO ceiling (Impact H · Effort S once decided) — **BLOCKED_DECISION**
1. **Public model 1X2 percentages on match pages.**
   - Today `p1`/`pn`/`p2`/`btts`/`po25` are premium (`lib/premium-fields.js`). Forebet, The Analyst and PredictZ rank on "[team] vs [team] prediction" with exactly this.
   - Option: show only the model's home/draw/away % publicly, and keep premium the recommended market, the market comparison, scorelines, scorers and the text.
   - Without it, IASHARK's match pages compete on stats only.
2. **The free match of the day on /gb/.** On 19/09 it was an Eredivisie match. Choosing it per market (gb → a Premier League or Champions League fixture when there is one) gives one fully open, high-demand page each day. Files: `lib/free-match.js` and the pipeline.
3. **MLS on /gb/.** 14 of the 23 gb match URLs in the sitemap are MLS, which has little UK demand. Keep (owner's earlier request) or drop gb from `mls.seoMatchDirs`.
4. **La Liga, Serie A, Bundesliga, Ligue 1 on /gb/** (seo-night §4.4). UK searchers do look for "la liga predictions". Adding `gb` to their `seoMatchDirs` creates en-GB versions next to /en/ ones, so a UK-specific element (UK time, fractional odds) is needed to avoid near-duplicates.

---

## 5. Off-site actions for the owner

### 5.1 Google Search Console (weekly, 15 minutes)
- **Property**: add a URL-prefix property `https://iashark.com/gb/` next to the domain property (seo-night §6 checklist). Submit `sitemap.xml`, and in the gb property also `sitemap-gb-i18n.xml`, `sitemap-clubs.xml`, `sitemap-leagues.xml`, `sitemap-articles.xml` and `sitemap-matches-i18n.xml`.
- **Baseline now** (before A1–A6), then compare every 4 weeks:
  - Performance → Country = United Kingdom, Page contains `/gb/`: impressions, clicks, average position.
  - Queries containing `vs` or ` v `, `prediction`, `stats`, `btts`, `table`: which clusters (§2.2) already get impressions. That is the real UK demand signal the research could not get.
  - Pages → Indexing, filter `/gb/match/`: count "Crawled – currently not indexed" and "Discovered – not indexed". A high share means pages are still judged thin, so A6 matters more.
- **After A1**: URL Inspection on 2–3 `/gb/match/` URLs → "Test live URL" → "View tested page" → check the rendered `<title>`.
- **After A2 and A8**: inspect `/gb/leagues/premier-league.html` and request indexing.
- **Don't**: use any "international targeting" setting (it no longer exists), or request indexing for dozens of match URLs a day (sitemaps are enough).

### 5.2 Bing Webmaster Tools
- Import from Search Console. Check the sitemaps.
- Bing's "Search Performance" can be filtered by country; UK Bing and Edge users are a real share of desktop searches.
- IndexNow (Bing, Yandex, Seznam): it takes a key file at the site root and one HTTP call per new or updated URL from the pipeline. It is a small technical task; skip it until A1–A6 are done.

### 5.3 Brand and entity
- When real social accounts exist, give their URLs so they can go into the Organization `sameAs` (seo-night §6). Never create accounts only to add links.
- E-E-A-T: articles are signed "IASHARK" (Organization). If a real person (the owner) agrees to be named as editor, add a real author page with real credentials. **Never invent a persona or a byline.**

### 5.4 Communities: useful, never spam
Principles:
- read and follow each community's rules (sidebar, pinned posts) before posting;
- say you run IASHARK every time;
- post the data itself (a table or chart in the post) rather than a bare link;
- never post "tips", "locks" or "sure bets";
- no affiliate or referral links;
- never use multiple accounts;
- never pay for upvotes or reviews.

Where it fits, from the data pages (A9, A10, A12):
- **Fantasy Premier League community** (subreddit and #FPL on X or Bluesky): FPL players care about goals conceded, clean sheets, goal timing and xG. A weekly "clean sheets and BTTS by team after Gameweek N" table is useful content there. Check first whether the community allows links to your own site at all, and how often.
- **Club subreddits and fan forums**: a club-specific stat ("Sunderland have scored in the last 15 minutes in X of N games") posted where on-topic stats are welcome. Only with the moderators' blessing when rules are unclear.
- **Lower-league communities** (EFL subreddits, club forums), once A11 exists. These communities get little data coverage, and good fixture stats are welcome.
- **Journalists and fan bloggers**: offer a data story built on real results (e.g. "home advantage in 2026/27 so far", "which sides concede late"), with the method explained. A citation and link from a local paper's sport section or a fan podcast is worth more than any directory.

Avoid:
- **Link buying**, guest posts on betting-tips sites, link exchanges, directory or PBN links. These are link schemes under Google's spam policies, and betting-adjacent link networks are an especially toxic neighbourhood.
- **Fake reviews or testimonials** (illegal under the DMCC Act 2024: see §3).
- Paid promotion of gambling-related content on TikTok, X, Meta or Google without the platform's gambling authorisation. `config/markets.json#gb` notes that the TikTok and X gambling authorisations were **not yet filed**, and `adsGamblingCertRequired: true`.

### 5.5 What to expect
Nothing here guarantees traffic, and a young site in a betting-adjacent niche earns trust slowly. Realistic milestones to watch in Search Console:
1. /gb/ match pages move from "crawled – not indexed" to indexed (A1, A6).
2. Impressions on long-tail stats and club queries (A9, A10).
3. Impressions on "gameweek" queries (A8).
4. Lower-league match queries, if and when A11 is decided.

---

## 6. Sources

Regulation (read 19/09/2026):
- CAP Code section 16 (gambling): https://www.asa.org.uk/type/non_broadcast/code_section/16.html
- CAP Code section 3 (misleading advertising): https://www.asa.org.uk/type/non_broadcast/code_section/03.html
- CAP advice, "Betting and gaming: tipsters" (22/05/2025): https://www.asa.org.uk/advice-online/betting-and-gaming-tipsters.html
- ASA ruling Cyan Blue Odds Ltd (Oddschecker), 27/05/2026: https://www.asa.org.uk/rulings/cyan-blue-odds-ltd--a25-1319924-cyan-blue-odds-ltd.html
- ASA ruling Thebettingman, 2020: https://www.asa.org.uk/rulings/person-s--unknown-a20-1066758-thebettingman.html
- CAP/BCAP guidance on under-18s: https://www.asa.org.uk/news/cap-and-bcap-update-guidance-on-protecting-under-18s-in-gambling-and-lotteries-advertising.html · https://www.asa.org.uk/advice-online/betting-and-gaming-appeal-to-children.html
- CAP advice on featuring under-25s: https://www.asa.org.uk/advice-online/betting-and-gaming-featuring-under-25s.html
- Gambling Commission, betting intermediaries: https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/betting-advice-for-remote-non-remote-and-betting-intermediaries
- Gambling Act 2005 s.330: https://www.legislation.gov.uk/ukpga/2005/19/section/330
- DMCC Act 2024 Schedule 20: https://www.legislation.gov.uk/ukpga/2024/13/schedule/20
- DMCC subscription regime timing: https://www.tlt.com/insights-and-events/insight/dmcc-act-subscription-contracts-regime-brought-forward-by-the-pm-what-do-businesses-need-to-know
- NHS gambling support (National Gambling Helpline): https://www.nhs.uk/live-well/addiction-support/gambling-addiction/
- GambleAware wind-down: https://casinobeats.com/2025/07/26/gambleaware-to-shutter-in-2026-as-uk-gov-takes-over-gambling-harm-prevention/
- Google Ads gambling policy: https://support.google.com/adspolicy/answer/15132179
- Google Search spam policies: https://developers.google.com/search/docs/essentials/spam-policies

Search results and competitors (US index; see the caveat at the top):
- Forebet, Spurs–Villa: https://www.forebet.com/en/football/matches/tottenham-aston-villa-2495587
- Opta Analyst, Premier League predictions: https://theanalyst.com/articles/premier-league-match-predictions
- Racing Post, Millwall–West Ham preview (fractional odds): https://www.racingpost.com/sport/football-tips/efl/championship-millwall-west-ham-predictions-team-news-odds-betting-tips-bet-builder-aVvok6v4nOLH/
- LiveScore, "All 12 League Two predictions": https://www.livescore.com/en/news/football/tips/all-12-league-two-predictions-saturday-19th-september-2026/
- xgstat (a small site ranking on the xG table): https://www.xgstat.com/competitions/premier-league
- August 2026 spam update case studies: https://www.gsqi.com/marketing-blog/august-2026-google-spam-update-case-studies/
- Site reputation abuse in UK sports media: https://pressgazette.co.uk/news/the-seo-parasites-buying-exploiting-and-ultimately-killing-online-newsbrands/

Repository evidence (wt-seo, HEAD a136911ed):
- `match-page.js:1080` (title overwrite), `match-page.js:26` (decimal odds), `match-page.js#dateHeure` (visitor time zone)
- `home-list.js:219` (links to `match.html?id=`)
- `scripts/league-hub-data.js:125-160` + `data/league-hubs-registry.json` (Premier League `source:"matchs"`, 17 rows)
- `scripts/build-locales.js#rewriteHomeMatchSummary`, `#homeSeoBlock` + `gb/index.html` (Paris time list)
- `scripts/seo-pages.js#matchSummaryHtml`, `#matchFactSections`, `#renderLeagueHub`; `scripts/match-lifecycle.js#publicSnapshot`
- `lib/premium-fields.js` (PUBLIC_FACT vs premium), `match/1557409.json` (public stats fields)
- `config/leagues.json` (seoMatchDirs), `config/league-expansion.json` (championship 40, league_one 41, league_two 42 NOT_STARTED; scotland_premiership 179 INCONCLUSIVE)
- `config/markets.json#gb` (status DRAFT_PENDING_LEGAL_REVIEW, helpline, adsGamblingCertRequired)
- `i18n/seo/gb.json`, `content/local-articles/gb.json`, `config/club-hubs.json`
- `reports/seo-night-2026-09-19.md` (earlier technical audit: hreflang, sitemaps and JSON-LD already fixed)
- `CALIBRATION_REPORT.md` (legacy calibration worse than chance → no accuracy claims)
