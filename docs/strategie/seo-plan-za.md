# IASHARK /za/: South Africa SEO plan

Date: 19 September 2026. Scope: organic traffic from South Africa (starting point: about 7 visits a week).
Method: a read-only audit of the `wt-seo` worktree at commit `a136911ed` (generated HTML, generators, config, data), a check of the live page https://iashark.com/za/leagues/premier-soccer-league.html, and SERP research through web search.
Caveats:
- The web search tool runs from the US, so real google.co.za results will differ somewhat (more Soccer Laduma and Kick Off, and Google's sports box). The owner should check the key queries from South Africa or in Search Console.
- No keyword-volume tool was available. The demand levels below are qualitative estimates and must be checked with Google Keyword Planner (location: South Africa) and Google Trends (geo=ZA).
- Nothing in the repo was modified. No build or test was run.

---

## 0. Summary

1. **/za/ is technically sound but has no identity yet.** hreflang en-ZA, canonicals, sitemaps, JSON-LD, SAST on hubs/match pages, "log", "soccer", NRGP helpline, 18+ are all in place. Only 3 PSL clubs and 1 derby have pages, there are 3 local articles, and ~16 match pages are in the sitemap at any time.
2. **The pages titled "prediction" show no prediction to Google.** Model output is correctly paywalled (`lib/premium-fields.js`), but the static match and hub pages then offer only fixture facts. This does not match what people searching "X vs Y prediction" want. The fix is to publish the *public* facts that already exist (form, H2H, log, BTTS and over 2.5 counts) as a real stats preview.
3. **Match pages exist for only ~48–72 hours before kick-off** (the pipeline window is today+2) and leave the sitemap 2 hours after the match. That is too short for a new domain to get crawled and ranked. The pages that can build up authority are the stable ones: the PSL hub, club pages, the derby page, a weekly "PSL this weekend" page and evergreen data articles.
4. **Two factual bugs to fix first.**
   - The /za/ home lists today's matches in "Paris time". This is identical to SAST today but will be wrong by 1 hour from 25 Oct 2026, six days before the Soweto Derby.
   - The Premier League hub shows a partial log (ranks 1, 19 and 20 are missing) and states "Top of the log: Manchester City", who are 2nd in that same table.
5. **A strong, unique, linkable asset already sits in the repo:** 4 seasons of PSL results (`data/gate-b1/`). PSL averages about 2.0 goals a game, BTTS lands 39–44% of the time and over 2.5 only 32–34%, against 2.85–3.28 goals a game in the EPL.
6. **Most winnable targets:** long-tail PSL fixture and club queries, newly promoted or renamed clubs (Durban City, Siwelele, Milford, Kruger United), Soweto Derby date, time and head-to-head queries (peak around 31 Oct), "SA time" kick-off queries, and PSL stats queries.
   **Out of reach for now:** "soccer predictions today", "PSL predictions", "EPL predictions" and "PSL log". Operator blogs, Goal, Soccer Laduma and global aggregators dominate them.
7. **Compliance:** IASHARK is not a gambling advertiser. Even so, align with the ARB Gambling Appendix: no implied winnings, no "skill" or "investment" framing, 18+, and the NRGP line, with its slogan to be confirmed by counsel. Never link to or name bookmakers without the owner's and counsel's approval (`config/markets.json` already says so).

---

## 1. Audit of /za/ today

### 1.1 Inventory (generated files at a136911ed)

| Page type | Files | Indexable | In sitemap | Notes |
|---|---|---|---|---|
| Home `/za/` | 1 | yes | sitemap-za-i18n.xml | Title OK, **H1 generic and identical to /gb/ and /en/** |
| Static pages (markets, about, pro, subscription, example, legal) | 12 in sitemap | yes | sitemap-za-i18n.xml | Example analysis is **PSG vs Monaco** |
| League hubs `/za/leagues/*` | 19 | **4** (PSL, Premier League, Champions League, Europa League) | sitemap-leagues.xml (4) | The other 15 are `noindex,follow` (outside seoMatchDirs), which is correct. The Conference League hub is noindex but still linked from the home and hub nav |
| Club/derby `/za/clubs/*` | 5 (index, Chiefs, Pirates, Sundowns, Soweto Derby) | yes | sitemap-clubs.xml | Good editorial intros with sources |
| Articles `/za/articles/*` | 4 (hub + 3) | yes | sitemap-articles.xml | ~1,300 words each, fact-checked, REVIEW status, no hreflang (correct) |
| Match pages `/za/match/*` | 37 (8 PSL, 11 EPL, 18 UEL) | 30 indexable, 7 noindex (thin) | 16 in sitemap-matches-i18n.xml | Created from the run (today+2), out of the sitemap 2 hours after the match, noindex at D+7, 301 at D+30 |

### 1.2 What is already right (keep)

- `<html lang="en-ZA">`, `og:locale en_ZA`, and reciprocal hreflang (fr / en-GB / en-ZA / en / x-default=en) on shared pages. PSL pages carry only fr, en-ZA and en, per `config/leagues.json#seoMatchDirs`.
- Self-referencing canonicals. JSON-LD: BreadcrumbList, CollectionPage + ItemList (hubs), SportsEvent (matches, club fixtures), SportsTeam, Article.
- SAST everywhere on hubs, clubs and match pages (e.g. `Sunday, 20 September 2026, 15:00 (SAST)`). EPL times checked: Tottenham v Aston Villa shows 13:30 SAST, which is correct for 12:30 BST.
- SA vocabulary: "soccer", "log", "kick-off", "PSL / Betway Premiership", "Amakhosi". Decimal odds in the data (the SA standard). Prices come from `config/markets.json` only.
- Responsible gambling: NRGP, 0800 006 008 and responsiblegambling.org.za in every footer, plus 18+.
- `i18n/seo/za.json` already has PSL-specific overrides (title "PSL Predictions: Betway Premiership Log | IASHARK SA").
- Anti "scaled content" safeguards (`MIN_INDEXABLE_WORDS=80`, match versions limited per league). Keep this discipline in everything below.

### 1.3 Problems found (by severity)

| # | Severity | Finding | Evidence | Where it comes from |
|---|---|---|---|---|
| P1 | High (correctness) | The home "Today's AI analyses" list is in **Paris time** with a "(Paris time)" label. It is the same offset as SAST until 24 Oct 2026, then 1 hour off (Paris drops to UTC+1, SAST stays UTC+2). The Soweto Derby (31 Oct, 15:30 SAST) would read 14:30. | `za/index.html` line 581 | `.github/workflows/update-data.yml` → `seoHomeSummaryHtml()` (≈l.1655) and `scripts/build-locales.js` → `rewriteHomeMatchSummary()` (l.367) |
| P2 | High (correctness) | The PL hub log is a **partial extract**: 17 rows, ranks 1, 19 and 20 missing. The KPI says "Top of the log: Manchester City · 12 pts" while that same table ranks City 2nd. The same bug exists on /gb/ and /en/. | `za/leagues/premier-league.html` | `scripts/seo-pages.js` l.501: `leader = groups[0].rows[0]` regardless of `rank` or `st.source === "matchs"` |
| P3 | High (intent) | Match pages titled "…soccer prediction…" show **no prediction in static HTML**. The H1 is just "Golden Arrows vs Kaizer Chiefs", and the analysis loads by JS behind the free-account or Pro wall. The PSL hub is titled "PSL predictions" but only shows "Analysis available" labels. | `za/match/1600347.html`, `za/leagues/premier-soccer-league.html` | `scripts/seo-pages.js` (`matchFactsHtml`, `renderLeagueHub`), `i18n/seo/za.json#match` |
| P4 | High (reach) | Match pages exist for only ~48–72 hours before kick-off. The pipeline collects today, tomorrow and the day after (`update-data.yml` l.577–581), and `SITEMAP_MAX_AGE_HOURS=2` (`scripts/match-lifecycle.js`). Local and global competitors publish fixture pages days or weeks ahead. | registry `data/match-pages-registry.json` | `scripts/match-lifecycle.js`, `scripts/seo-pages.js` |
| P5 | Medium | Home H1 "Understand the match. Find the right market that's fair." has no keyword and is identical on za, gb and en. The keyword-bearing "Soccer predictions built on probabilities, not hunches" is an H2 at the bottom of the page. | `za/index.html` l.509–524 | root `index.html` hero, `scripts/build-locales.js#injectHomeSeo` |
| P6 | Medium | The home static summary lists 57 matches (J1 League, Allsvenskan, Liga 1 Peru…). Only 9 are linked for /za/ (PSL and EPL). The SA-relevant part is buried. | `za/index.html` | same as P1 |
| P7 | Medium | Only **3 of 16 PSL clubs** have a page. 12 clubs in the PSL log link nowhere, and there is no page for Durban City (2026 Nedbank Cup winners, CAF debut), Siwelele (ex-SuperSport United), Stellenbosch, AmaZulu or others. | `config/club-hubs.json` | `scripts/build-club-hubs.js` |
| P8 | Medium | Near-identical versions: za vs gb PL hub, text similarity 0.92; za vs en PSL match page, 0.97. hreflang handles this for regional variants, but /za/ pages offer nothing extra to rank on. | computed with difflib on the body text | templates in `i18n/seo/*.json` |
| P9 | Low | Match-page static bottom nav is in **French** ("Accueil / Outils / Compte", `aria-label="Navigation principale"`) until JS replaces it. | `za/match/*.html` last lines | match shell / `scripts/seo-pages.js#renderMatchPage` |
| P10 | Low | `za/exemple-analyse.html` shows PSG vs Monaco, which means nothing to SA visitors. | | `exemple-analyse.html` + build-locales |
| P11 | Low | Venue names are inconsistent: "Orlando Stadium" (derby fixture) vs "Orlando Amstel Arena" (a result). Media differ on the 31 Oct derby venue: one outlet says FNB Stadium, another Orlando Amstel Arena. API names also appear unnormalised ("Amazulu" rather than "AmaZulu"). | `za/clubs/soweto-derby.html`, PSL hub | api-football names. There is no alias map |
| P12 | Low | Public `fatigue.info` text is French ("Dernier match il y a 6j…"). Harmless today because it is not rendered on static pages, but it must be localised if the stats preview (A5) uses rest days. | `match/1600347.json` | pipeline |
| P13 | Info | Hub/match "guide" links go to `/en/blog/guides/` with French slugs (`plus-de-2-5-buts-probabilite-methode-poisson.html`). Slugs are a weak signal, so this is not urgent. | | |
| P14 | Info (outside SEO) | The GitHub repo **IASHARK/iashark is public** (2,520 commits, reports, admin JS), and its PRs and issues show up in web search for "iashark". Check whether this is intended. | github.com/IASHARK/iashark | |

### 1.4 Does PSL data really exist?

- `config/leagues.json`: `south_africa_premiership`, apiFootballId **288**, `seoMatchDirs: ["za","en"]`, `apiFootballPinnacleFallback: true`, **no `oddsSportKey`** (The Odds API has no SA key; odds come from Pinnacle via api-football). It was opened on 13 Sept 2026 **without any SCORE_LAB / calibration validation** (see the readme and `config/league-expansion.json`, status NOT_STARTED, BLOCKED_DECISION on player data 2021–22). The site already says "coverage is recent" and shows data quality (e.g. `data_quality_score 60 "Moyenne"`, `analysis_tier STANDARD_ANALYSIS`). Keep that caution in all copy.
- Live data: 8 PSL matches in the run (1600344–1600352), full 16-row PSL log (API standings), and club fixtures across all competitions, including CAF (`data/club-hubs/cache`, 198 cached API responses).
- Public match JSON (`match/<id>.json`) holds odds (c1/cn/c2, over/under, BTTS, double chance), form (last 5 with scores), H2H (last 5), standings rows, `tendances` (BTTS/over 2.5 counts, n=3), weather, venue, `prob_band`, `has_signal`. Per `lib/premium-fields.js`, odds, form, H2H and team stats are **public facts**. Probabilities, pick, conf and Shin consensus are **premium**.
- History: `data/gate-b1/south_africa_premiership-2021…2024.json` (984 fixtures: 2021/22 to 2024/25). Season 2025 (2025/26) is **sealed_unread** for model validation (`DATA_LEAKAGE_POLICY.md`, `config/league-expansion.json#seasonSplit`), so do not collect or compute it inside the repo for content. Cite public sources for 2025/26 instead.

Figures computed read-only from these files, for the owner to re-verify before publishing. Regular season only: I excluded the 6 play-off fixtures per file (NFD clubs) and the 19 cancelled 2024/25 fixtures. "Season 2021" in api-football means 2021/22.

| Season | Matches | Goals/match | BTTS | Over 2.5 | Draws | 0-0 | Home wins |
|---|---|---|---|---|---|---|---|
| PSL 2021/22 | 240 | 2.00 | 41.2% | 34.2% | 38.3% | 18.8% | 37.1% |
| PSL 2022/23 | 240 | 2.10 | 43.8% | 34.2% | 30.4% | 12.5% | 41.2% |
| PSL 2023/24 | 240 | 2.03 | 39.6% | 34.2% | 28.3% | 13.3% | 41.2% |
| PSL 2024/25 | 221 | 2.02 | 38.9% | 31.7% | 26.7% | 10.9% | 44.3% |
| EPL 2022/23 | 380 | 2.85 | 51.6% | 52.6% | 22.9% | 6.1% | n/a |
| EPL 2023/24 | 380 | 3.28 | 61.6% | 64.7% | 21.6% | 2.9% | n/a |

A public cross-check: Wikipedia gives 2025/26 PSL as 485 goals in 240 matches (2.02 per match). Orlando Pirates were champions on 69 points, Sundowns 68 and Chiefs 54. Relegated: Orbit College and Magesi. Promoted: Kruger United and Milford.

---

## 2. Keyword research (SA searchers)

### 2.1 Who dominates the SERPs (from the searches run)

- **Operator blogs (licensed SA bookmakers):** Hollywoodbets Sports Blog ("BETWAY PREMIERSHIP 2026: X vs Y – Players to Watch, Form Guide, Prediction"), Betway blog, Bet Central (bet.co.za), SuperSportBet newsfeed, bets.co.za, 10bet.
- **SA media with betting sections (affiliate):** Soccer Laduma `/betting/predictions/`, Goal.com en-za ("Commercial Content | +18"), Flashscore.co.za news ("EPL Gameweek X: predictions, best bets"), Kick Off (news, CAF, derby).
- **Local small publishers:** Soccer Bullet (soccerbullet.co.za, "X vs Y: date, kickoff time, score prediction"; "When is Kaizer Chiefs' next match"), Diski Zone, Sunday World, Briefly, afrik-foot en-za.
- **Global aggregators:** Forebet, WinDrawWin, SportyTrader, predictZ, SoccerVista, Scores24, FootyStats, AiScore, SoccerPunter, dailysports, bettingexpert, TipStrike, betimate.
- **Utility/data:** Flashscore, Sofascore, LiveScore, SuperSport, ESPN Africa, Soccerway (za.soccerway.com), the official club sites, psl.co.za, and Google's own sports box for "next match", "fixtures" and "log".

Reading of the landscape:
- Head terms are owned by brands with domain authority and affiliate budgets.
- On long-tail PSL fixtures, even the ranking pages are thin: aggregator templates or 300-word "date and kick-off" posts. That is where a data-rich page can win.
- New or renamed clubs and the "SA time" utility queries have the weakest competition.

### 2.2 Keyword clusters

Demand and competition are qualitative (H/M/L), to validate with Keyword Planner and Trends (ZA). "Winnable" means within 3–6 months for a new domain with the actions below.

| # | Cluster | Example queries | Intent | Demand | Competition | Winnable? | Target page (type) |
|---|---|---|---|---|---|---|---|
| C1 | PSL predictions (head) | psl predictions, betway premiership predictions, psl tips, psl predictions today | commercial/info | H | H | Low now; medium later | PSL hub `/za/leagues/premier-soccer-league.html` |
| C2 | PSL this weekend | psl predictions this weekend, psl fixtures this weekend, betway premiership matchday 7 | info/commercial, weekly | M–H (weekly spikes) | M–H | **Medium** | **New:** `/za/psl-predictions-this-weekend.html` (A7) |
| C3 | PSL fixture long tail | golden arrows vs kaizer chiefs prediction, kruger united vs stellenbosch prediction, milford vs durban city kick off time, X vs Y head to head | commercial/info | L each, H in aggregate | M (thin pages) | **Medium–High** if the page exists 5–10 days ahead | `/za/match/<id>.html` (A5 + A10) |
| C4 | Big-3 clubs | kaizer chiefs next match, orlando pirates fixtures, sundowns next game, kaizer chiefs results, chiefs log position | navigational/info | H | H (club sites, Google box) | Low–Medium (long tail) | Club pages (A6) |
| C5 | Other PSL clubs | durban city fc fixtures, siwelele fc next match, stellenbosch fc fixtures, amazulu fixtures, milford fc, kruger united fc, sekhukhune united | info | L–M | **L** | **High** | **New club pages** (A6) |
| C6 | Derbies and big games | soweto derby 2026, soweto derby date, soweto derby kick off time, chiefs vs pirates head to head, pirates vs sundowns, kzn derby | info (+commercial near the date) | H (spike late Oct, Mar) | M–H | **Medium** for date, time and H2H | `/za/clubs/soweto-derby.html` + article (A4); new rivalry pages (A6) |
| C7 | PSL stats | psl goals per game, psl btts stats, psl draw percentage, psl home advantage, psl promoted teams | info | L–M | **L** | **High** | **New data article** (A8) |
| C8 | Markets explained | both teams to score meaning, btts explained, over 2.5 goals meaning, double chance meaning, draw no bet | info | M | M | Medium | New za guide (A11) linking PSL numbers |
| C9 | EPL for SA | epl predictions, epl fixtures this weekend sa time, premier league kick off times south africa, [EPL match] prediction | info/commercial | H | H (predictions) / **M** (SA time) | Low (predictions) / **Medium** (SA time) | PL hub (za override), **new SA-time article** (A9), za EPL match pages |
| C10 | UCL | champions league fixtures sa time, ucl predictions | info | M–H | H | Low–Medium | UCL hub (za override) |
| C11 | CAF | caf champions league fixtures, sundowns caf, pirates vs african stars, chiefs confederation cup | info | M | **L–M** | Medium–High, **but not covered by the model** | BLOCKED_DECISION D1 (fact-only pages possible) |
| C12 | Bafana Bafana | bafana bafana fixtures, bafana vs kenya | info | H (international windows) | M–H | Not covered | BLOCKED_DECISION D2 |
| C13 | Cups | mtn8 final, carling knockout fixtures, nedbank cup draw | info | M (seasonal) | M | Low–Medium | Existing cups article; the model does not cover cups |
| C14 | Legal / responsible gambling | is online betting legal in south africa, how to self exclude from betting sa, gambling helpline south africa | info (trust) | L–M | M | Medium | **New za guide** (A12) |
| C15 | **Avoid** | soccer 6 predictions, betway jackpot predictions, sure/100% predictions, fixed matches, "banker" tips | commercial | H | H | **Do not target** | These imply certainty or promote operator products; incompatible with the ARB appendix and IASHARK's positioning |

### 2.3 SA vocabulary to use

- **"soccer"** for generic intent (the site already does this). Club and competition names as locals say them: PSL, Betway Premiership (the official sponsored name, not an operator recommendation), log, fixtures, kick-off, SAST.
- **Nicknames** that people search on (verify each against a source before publishing): Amakhosi (Chiefs), Buccaneers/Bucs (Pirates), Masandawana/Downs (Sundowns), Citizens (Durban City), Babina Noko (Sekhukhune), Bafana Bafana, "Diski" (colloquial; social only).
- **"BTTS" / "both teams to score"** and "over 2.5". GG/NG is mostly West African; do not lead with it.
- **"tips"** is what people type. Use it only descriptively ("looking for PSL tips? here is what the data says, and its limits"), never as a promise.
- **Decimal odds** only. Never show "R100 returns R383"-style win examples.
- **Normalise API names** for display: AmaZulu, Orlando Amstel Arena (renamed Orlando Stadium). Use a verified alias map and never guess.

---

## 3. SA regulatory and ethical frame

### 3.1 Law (summary; not legal advice, to be validated by SA counsel)

- **National Gambling Act 7 of 2004 (NGA), s15, with regulation 3 of the National Gambling Regulations 2004.** Gambling may not be advertised in a false or misleading way, unlawful gambling may not be advertised, and advertising may not target or attract minors. Advertisements for gambling activities must carry responsible-gambling messaging in the prescribed form. No "free" or "discounted" gambling as an inducement, and no encouraging removal from the excluded-persons register.
- **Minors (under 18) may not gamble.**
- **Online:** online sports betting is legal **only through bookmakers licensed by a provincial board** (one provincial licence covers national online play). Online casino gaming is illegal (NGB position; ARB appendix §1.3: "online betting on sports events is legal / online gambling is illegal").
- **Regulators:**
  - National Gambling Board (oversight).
  - The nine provincial licensing authorities: Gauteng Gambling Board, Western Cape Gambling and Racing Board, KwaZulu-Natal Gaming and Betting Board, Eastern Cape Gambling Board, Mpumalanga Economic Regulator, Northern Cape Gambling Board, Free State Gambling, Liquor and Tourism Authority, Limpopo Gambling Board, North West Gambling Board.
  - The NGB and the WCGRB dispute the national scope of an October 2025 Supreme Court of Appeal ruling (reported April 2026).
- **Pending (not law as of 2026, per sources):**
  - National Gambling Amendment Bill (the NGB would become a regulator).
  - Remote Gambling Bill B11-2024.
  - dtic work on stricter advertising rules, reported as expected in 2026. Check its status.
- **Other acts already reflected in /za/:** CPA (subscription terms, s14 fixed-term, hence no annual plan) and POPIA (privacy notice). POPIA also governs any WhatsApp or email marketing, which needs opt-in.

### 3.2 ARB Code of Advertising Practice, Gambling Appendix

Read directly from arb.org.za/assets/gambling-appendix.pdf. It applies to "advertising for a gambling device, activity, premises or website".

- **Must not** (§2):
  - portray excessive play;
  - imply or portray illegal activity, including illegal online gambling;
  - present gambling as a way to recover losses;
  - claim personal, financial or social success;
  - imply gambling is an alternative to employment or a means to financial security;
  - **imply that winning is the probable outcome**;
  - **imply that gambling involves skill**;
  - **imply gambling is a form of investment**;
  - imply that the more or longer one gambles, the better the chances;
  - imply gambling will make players' dreams come true.
- **Minors** (§3): no targeting of minors, and no people who are or look under 18. No placement in media, venues or outdoor sites aimed mainly at under-18s.
- **Warnings** (§4): at minimum the **name, toll-free number and slogan of the National Responsible Gambling Programme** (the SARGF slogan is "Winners know when to stop"; confirm the current wording) and a reference that only persons 18 or older may lawfully gamble. For web pages, the warning must be displayed on at least 10% of the home page.
- **2026 revision** (consultation closed 28 Feb 2026, per Werksmans/Polity): tighter content rules (no irresponsible behaviour, no gambling as a solution to problems), no themes that mainly appeal to minors (cartoons, characters), celebrity and influencer endorsers aged 21 or over, spoken warnings at the same speed and volume.

### 3.3 What this means for IASHARK (operating rules for every za page and post)

IASHARK is a statistics publisher, not a licensee or an advertiser of a gambling activity. The appendix therefore does not formally apply today. But the site's subject is betting markets, so the safest and most credible path is to **follow it anyway**. It becomes directly relevant the day any bookmaker link, affiliation or sponsorship appears, which `config/markets.json` already forbids without prior approval (`paidAdsEnabled:false`, `adsGamblingCertRequired:true`).

Never write or post:
- "sure", "guaranteed", "banker", "lock", "profit", "ROI", "beat the bookies", "edge you can bank", "invest", "bankroll growth", "make money", "win rate" claims, or win-streak screenshots;
- "the more you bet…".

Do write: "probability", "estimate", "uncertain", "fails 4 times in 10 at 60%" (already on site), "data quality", "18+", "NRGP 0800 006 008".

Specific rules:
- **"Skill" framing.** Avoid presenting betting as a skill you can learn (ARB 2.12). Explain *probability literacy* instead. Watch the value-bet guides and the hero wording "Find the right market that's fair" in /za/ marketing and social copy.
- **No operator names or links** in za content: no "best bookmakers in SA" and no affiliate links. `Betway Premiership` as the league name is fine (already documented in `content/local-articles/za.json`).
- **Pinnacle.** It appears as `"market_source":"Pinnacle (sharp)"` in embedded match JSON. It is not visible in the UI, and it should stay that way on /za/: label odds as "market price" without naming an operator unless counsel confirms it holds an SA provincial licence. ARB 2.6 bars portraying illegal online gambling.
- **Footer.** Keep 18+ and the NRGP number on every za page (already done). **Add the NRGP slogan** once confirmed (see A12). Keep it visible on the home page.
- **Imagery.** No cartoons, mascots or youth-appeal visuals on TikTok or Instagram. No people who look under 18 in betting-context posts.
- **Subscriptions.** Keep the CPA cancellation wording ("cancel anytime") and never frame Pro as a way to earn.

### 3.4 Open points for counsel (do not decide in code)

1. Does selling a paid "model probabilities vs odds" subscription to SA residents fall under any provincial "betting information" or "bookmaker" definition? The legal pages are `DRAFT_PENDING_LEGAL_REVIEW`.
2. Should the full ARB §4 warning (with slogan) be treated as mandatory on /za/?
3. Can odds sourced from a bookmaker unlicensed in SA be displayed, even unnamed?

---

## 4. Action plan (ranked by impact ÷ effort)

Effort: S = under 1 day, M = 1–3 days, L = more than 3 days for one developer. The owner rules still apply to each action: never invent data, no premium field on a public page, prices only from `config/markets.json`, new content stays `REVIEW` until checked, and run `node scripts/build-locales.js` and the tests after changes (in the owner's normal workflow, not by me).

| Rank | Action | Impact | Effort | Deadline |
|---|---|---|---|---|
| A1 | SAST home summary and SA-first ordering | High | S | **before 25 Oct 2026** |
| A2 | Fix the log leader KPI and partial logs | High (trust) | S | now |
| A3 | Home H1 and title for za | Medium–High | S | |
| A4 | Soweto Derby refresh (page + article), data-driven title | High (seasonal) | S–M | **live by ~10 Oct** (derby 31 Oct) |
| A5 | Match-page stats preview + za title/H1 templates | High | M | |
| A6 | 8 more PSL club pages + rivalry pages; better big-3 titles | High | M | |
| A7 | "PSL predictions this weekend" page | High | M | |
| A8 | PSL goals data article (linkable asset) | Medium–High | S–M | |
| A9 | "SA time" EPL/UCL article + za overrides for PL/UCL hubs | Medium | S | **before 25 Oct** |
| A10 | Fixture preview pages 7–10 days ahead (PSL + marquee) | High | L | |
| A11 | BTTS explained with PSL numbers (za guide) | Medium | S | |
| A12 | Online betting legality and help (za guide) + NRGP slogan | Medium (trust) | S | after counsel |
| A13 | Branded share images (og:image) for PSL/derby/weekend pages | Medium (WhatsApp CTR) | M | |
| A14 | Housekeeping: French static nav, SA example analysis, name/venue aliases | Low | S | |
| A15 | Coverage decisions: CAF, Bafana, public model teaser | Strategic | n/a | owner (section 6) |

### A1. SAST in the home match summary, SA leagues first

- **Change.**
  - In `seoHomeSummaryHtml(matchsData, loc, dir)`, convert each `m.date` (Paris) to the version timezone from `C.seoConf(dir).tz` / `tz_label` (za: `Africa/Johannesburg`, "SAST"). Use `lib/match-time.js`, which the hubs already use. Label the heading "(SAST)" instead of "(Paris time)".
  - For za, list in-scope leagues first (PSL, Premier League, UCL/UEL/UECL, i.e. `seoMatchDirs` includes za), then the rest in a collapsed "Other competitions" line, or drop them from the static block.
  - Also compute "today" in SAST for za, not Paris.
- **Files.** `.github/workflows/update-data.yml` (≈l.1655 `seoHomeSummaryHtml`, l.1682 `injectHomeSeoSummary`), `scripts/build-locales.js` (`rewriteHomeMatchSummary`, l.367), `i18n/seo/za.json` (label). Add a test in `tests/seo-pages.test.js` for a date after 25 Oct.
- **Effect.** The crawlable home shows correct SA kick-off times, and the first links Google sees are PSL and EPL match pages, not J1 League. Must ship before the European clock change on 25 Oct.

### A2. Stop publishing a wrong "Top of the log"

- **Change.**
  - In `renderLeagueHub`, set `leader` only if `groups.length===1 && rows[0].rank===1 && data.standings.source !== "matchs"`.
  - When `source==="matchs"`, either hide the table or show it with the existing "extract" note and no KPI.
  - Better: have `scripts/league-hub-data.js` fetch full `/standings?league=39&season=<current>` (the same client and cache as `lib/club-hub-api.js`, TTL 6 h), as is already done for the PSL.
- **Files.** `scripts/seo-pages.js` (l.501–510), `scripts/league-hub-data.js`, tests.
- **Effect.** No false fact on the PL hub (za, gb, en). A complete EPL log is also a query SA users search ("epl log").

### A3. Home H1 and title for /za/

- **Change.** Add `home.h1` (and optionally `home.lead`) to `i18n/seo/za.json`. Have `injectHomeSeo` replace the hero `<h1>` text for versions that define it; the design stays the same.
  - Proposed H1: **"Soccer predictions for the PSL, EPL and Champions League, built on probabilities"**, keeping the tagline as the paragraph below.
  - Title: **"Soccer Predictions Today: PSL, EPL & UCL | IASHARK SA"** (52 chars).
  - Meta: keep the current one (it already has BTTS and 18+).
  - Do the same later for gb ("football predictions… Premier League") so the three homes stop sharing one H1.
- **Files.** `i18n/seo/za.json`, `scripts/build-locales.js` (`injectHomeSeo`/`metaFor`), root `index.html` (add a marker around the H1 text if needed). Check `IASHARK_DESIGN_FREEZE.md`: only the text changes.
- **Effect.** A relevant H1 for the SA home, and the za, gb and en homes are no longer identical.

### A4. Soweto Derby: be the page that answers "when, where, what time, head-to-head"

Data already in the repo: next meeting **Orlando Pirates vs Kaizer Chiefs, Sat 31 Oct 2026, 15:30 SAST** (venue in the data: Orlando Stadium; media disagree, so show the data venue with "venue as listed in fixture data; check PSL announcements"). Return fixture: 13 Mar 2027 (data). Last 6 competitive meetings: Pirates 4, Chiefs 1, 1 draw (data).

- **Change.**
  1. **Data-driven title and H1** when a next meeting exists: `"Soweto Derby {yyyy}: {home short} vs {away short}, {d Mon} Kick-off & H2H"`, e.g. "Soweto Derby 2026: Pirates vs Chiefs, 31 Oct Kick-off & H2H" (58 chars). The H1 would be "Soweto Derby: Orlando Pirates vs Kaizer Chiefs, 31 October 2026". It falls back to the current evergreen title when no fixture is known. Everything comes from the fixture feed and nothing is typed by hand.
  2. **A "Derby by the numbers" block** computed from the H2H feed, stating its date range. Include W/D/L split, goals per derby, BTTS count, share of 0-0 and 1-0 results, and home-side record in the window. Label it "last N meetings in our data (dates…)"; do not claim "all-time".
  3. **Put CAF congestion in context from real fixtures.** Around the derby: Pirates' CAF CL tie with African Stars on 16–18 and 23–25 Oct (CAF); Chiefs vs Red Arrows (CAF Confederation Cup) on 17 and 24 Oct (data). Frame this as "fixtures in the 14 days before", which is factual and not a prediction.
  4. When the match enters the run (~29 Oct), link it prominently: "IASHARK analysis for this derby".
  5. Refresh the article `soweto-derby-chiefs-pirates-guide`: add "2026/27 meetings" with a link to the page and update `dateModified`. Add the facts "Orlando Pirates, 2025/26 champions (69 pts) ending Sundowns' 8-year run" (Wikipedia; re-verify). Status stays REVIEW.
- **Files.** `config/club-hubs.json` (derbies → `soweto-derby`: title/h1 templates with placeholders), `scripts/build-club-hubs.js` + `lib/club-hub-render.js` (template fill from `next[0]`, stats block), `content/local-articles/za.json` + `content/local-articles/za/soweto-derby-chiefs-pirates-guide.htm`, `i18n/seo/za.json` (labels).
- **Effect.** Captures "soweto derby date / kick off time / venue / head to head" during the 2–3 week build-up. Google needs the updated page crawled by mid-October: request indexing in GSC (section 5.1).

### A5. Match pages: a real stats preview from public facts, plus za title and H1

- **Change.**
  1. Add a **"Stats preview"** section to `matchFactSections`. Only public fields are used (per `lib/premium-fields.js`):
     - last-5 form line per team with W/D/L count;
     - goals scored/conceded per game over the last 5 (from `form_*[].score`);
     - **BTTS in X of the last 5** and **over 2.5 in Y of the last 5** (computed from the same scores; more useful than `tendances`, which has n=3);
     - log positions and points gap;
     - H2H summary (W/D/L, goals, BTTS in the last N);
     - days since last match (computed from dates; do not reuse the French `fatigue.info` text);
     - weather (localised).
  2. Add a **model teaser** that uses only public teaser fields: `has_signal` / `no_signal` and `prob_band`, e.g. "IASHARK's model has selected a market for this match (confidence band: moderate). Free with an account if it's today's free match, otherwise in Pro." No number and no market name.
  3. **za templates** (`i18n/seo/za.json#match`):
     - PSL: title `"{home} vs {away} Prediction, H2H & Kick-off | PSL"` (fall back to `"{home} vs {away} Prediction & Stats (PSL)"` when too long). H1 `"{home} vs {away}: prediction, form and head-to-head"`. Meta `"{home} vs {away}, {weekday} {date}, {time} SAST at {venue}: last-5 form, log, head-to-head and BTTS trend, plus IASHARK's model analysis. 18+"`.
     - EPL/UCL on za: title `"{home} vs {away} Prediction & SA Kick-off Time"`. Keep the gb templates as they are ("v", "UK time"), so each version answers its own audience.
  4. Put the H1 in the static shell, replacing `<h1>…{teams}</h1>` in `renderMatchPage`, and keep the date line.
- **Files.** `scripts/seo-pages.js` (`matchFactSections`, `factRowsHtml`, `matchTitle`, `matchDescription`, `renderMatchPage`), `i18n/seo/za.json` (+ en.json and gb.json labels if the block is shared), `lib/match-view-model.js` only if reused, and tests (thin-page threshold, and no premium key in static HTML).
- **Effect.** Roughly 150–250 extra words of *specific* facts per page, a clear match with "prediction / H2H / kick-off time" intent, and less pogo-sticking. This also strengthens the `MIN_INDEXABLE_WORDS` gate.
- **Guardrail.** The content is computed and never hand-written. If a data field is missing, omit the line; never fill it in.

### A6. More PSL club pages and rivalry pages; sharper titles for the big three

- **Change.**
  1. **Wave 1: 8 clubs.** Each needs a verified editorial intro with sources in `sources[]`, following the existing Chiefs, Pirates and Sundowns entries:
     - **Durban City**: 2026 Nedbank Cup winners (beat TS Galaxy 2-1 in the final) and a first CAF Confederation Cup campaign (OFM, SABC, News24, club site).
     - **Siwelele FC**: the former SuperSport United, sold in July 2025 and relocated to Bloemfontein (OFM, IOL, EWN, TimesLIVE).
     - **Stellenbosch**, **AmaZulu**, **Sekhukhune United**, **TS Galaxy**, **Golden Arrows**, **Polokwane City**.
     - Wave 2: Richards Bay, Chippa United, Marumo Gallants, Milford FC and Kruger United (both promoted for 2026/27 per Wikipedia).
  2. **Rivalry pages** (the generator's derby type needs both clubs in the same standings group). Check each name in the local press before adding:
     - **Orlando Pirates vs Mamelodi Sundowns**: the 2025/26 title race decided by one point (69–68). Call it a "title rivalry", not a derby.
     - **Kaizer Chiefs vs Mamelodi Sundowns**.
     - **KZN derby** (AmaZulu vs Golden Arrows).
     - **Mpumalanga derby** (TS Galaxy vs Kruger United) and **uMhlathuze derby** (Richards Bay vs Milford), both named in weekend-preview press.
  3. **Titles for all club pages.** Use `"{Club} Next Match, Fixtures & Results (SAST) | PSL"` (e.g. "Kaizer Chiefs Next Match, Fixtures & Results (SAST) | PSL" is 57 chars) and H1 `"{Club}: next match, fixtures and log position"`. The season label comes only from standings data (`hubSeason`) and is never hard-coded.
- **Files.** `config/club-hubs.json`, `scripts/build-club-hubs.js`, `lib/club-hub-render.js` (if a title template is needed), `i18n/seo/za.json` (`nav.clubs` label), `sitemap-clubs.xml` (generated).
- **Effect.** All 16 clubs in the PSL log become internal links, which spreads authority. The low-competition C5 queries get targets, and C4 becomes more reachable ("next match" wording). This is deliberately **not** programmatic: every page has a verified, unique intro.
- **Guardrail.** Club facts (founding year, stadium, capacity, nicknames) come from the listed sources only. When a source is missing, leave the field out.

### A7. "PSL predictions this weekend": one stable, weekly-refreshed URL

- **URL:** `/za/psl-predictions-this-weekend.html`. It is a single URL for the whole season, so it accumulates links and history. Do not create one URL per round; that invites thin, scaled pages.
- **Title:** "PSL Predictions This Weekend: Round {n} Stats (SAST)" (the round comes from the API `round`, "Regular Season - 7").
- **H1:** "PSL predictions this weekend: Betway Premiership round {n}".
- **Meta:** "Every Betway Premiership fixture this weekend: SAST kick-off, venue, log positions, form, BTTS and over 2.5 counts and head-to-head, with IASHARK's model analysis. 18+" (~150 chars).
- **Content, generated from real data only:**
  - Intro line with dates and number of fixtures.
  - Per-fixture card: SAST kick-off, venue, log positions, last-5 form, BTTS and over 2.5 in the last 5, last H2H result, "Analysis available (free today / Pro)" badge, link to the match page (A5) and to club pages.
  - A "Round in numbers" block computed from the cards (e.g. "3 fixtures between top-6 sides", "lowest-scoring side in the last 5: …").
  - CAF congestion flags from real club fixtures (e.g. "Pirates play CAF CL away on {date}").
  - Link to the season-level PSL hub and the PSL goals article (A8).
  - JSON-LD: CollectionPage + ItemList of SportsEvent.
- **Between rounds** (international or CAF windows): show "Next PSL round: {date}" and the last round's results. The page stays indexable only while it has at least 3 fixtures or results; otherwise it becomes `noindex,follow`, as the hub rule already does.
- **Local hooks** (data-driven): "Pirates can go top", "promoted Kruger United host…" only when the log arithmetic proves it. Never write speculative narrative.
- **Distinct from:**
  - the PSL hub, which is season-level (log, results, clubs, method; the hub links to this page at the top);
  - /gb/ and /en/, which have no such page.
- **Files.**
  - A new renderer in `scripts/seo-pages.js`, or a small `scripts/build-weekend-page.js` reusing `scripts/league-hub-data.js` and `lib/hub-ui.js`.
  - Labels in `i18n/seo/za.json` (new `weekend` block).
  - Sitemap inclusion (`scripts/i18n-sitemaps.js` or `writeSeoSitemaps`), links from the home SEO block (`SEO.versionNav`), the PSL hub and the footer nav.
  - Tests.
- **Effect.** Targets C2, a weekly recurring query with a stable URL that gains authority over the season, and funnels users to match pages and the free analysis.

### A8. Data article: "How often do both teams score in the PSL?"

- **Slug:** `/za/articles/psl-goals-btts-over-2-5-stats.html`.
- **Title:** "PSL Goals Stats: BTTS, Over 2.5 and Draw Rates" (47 chars).
- **H1:** "How often do both teams score in the PSL? Four seasons of data".
- **Hook** (the table in section 1.4, re-verified): about 2.0 goals a game in every season from 2021/22 to 2024/25; BTTS 39–44%; over 2.5 only 32–34%; draws 27–38%; 0-0 in 11–19% of matches. The EPL had 2.85 and 3.28 goals a game in 2022/23 and 2023/24. Add the Wikipedia 2025/26 figure (2.02 per match) as an external cross-check, **without** touching the sealed 2025 data in the repo.
- **Sections:**
  - method (source: api-football results, regular season only, play-offs and cancelled games excluded);
  - season table;
  - PSL vs EPL;
  - what it means for reading a probability (a 60% BTTS "tip" in the PSL is a strong claim against a ~40% base rate);
  - limits;
  - 18+/NRGP box;
  - links to the weekend page, PSL hub and BTTS guide.
- **Files.** `content/local-articles/za.json` (+ `za/psl-goals-btts-over-2-5-stats.htm`). The numbers are computed once by a small read-only script and pasted, with the script path and date in `sources`. Status REVIEW.
- **Effect.** Low-competition C7 queries, plus the **main outreach asset** for links from SA football media (section 5.4). A **second data article** can follow: "Promoted clubs in the PSL: how newcomers fare in year one", computed from the same files.

### A9. "SA time" article + za-specific PL and UCL hub copy

- **Article:** `/za/articles/epl-kick-off-times-sast-clock-change.html`.
  - Title: "EPL Kick-off Times in SA Time: the October Clock Change" (54 chars).
  - H1: "Premier League kick-off times in South Africa (SAST), explained".
  - Facts: SAST is UTC+2 with no daylight saving. Until 24 Oct 2026, a 15:00 UK kick-off is 16:00 SAST. **From 25 Oct 2026 (UK and EU clocks go back)** it is 17:00 SAST. Champions League 21:00 CET matches move from 21:00 to 22:00 SAST.
  - Content: a live block with this weekend's EPL and UCL fixtures in SAST from real data, and links to the PL and UCL hubs.
- **Hub overrides** (`i18n/seo/za.json#league.overrides`):
  - `premier`: title "EPL Predictions & Log: Kick-offs in SA Time | IASHARK SA". The intro adds the SAST offset rule (a fact, not a claim of popularity).
  - `ldc`: title "Champions League Predictions: Fixtures in SA Time | IASHARK SA", with the equivalent intro.
  - Titles are generated per version and these overrides exist only in za.json, so gb and en are untouched.
- **Files.** `i18n/seo/za.json`, `content/local-articles/za.json` + `.htm`.
- **Effect.** A low-competition, genuinely useful SA query (C9 "SA time"), timely for 25 Oct, and it makes the za PL and UCL hubs distinct from gb and en.

### A10. Fixture preview pages 7–10 days ahead (PSL + marquee EPL/UCL)

- **Change.**
  - Allow a registry stage `"preview"` in `scripts/match-lifecycle.js` for fixtures found in hub data (`scripts/league-hub-data.js` already reads 14-day fixtures).
  - Render `/za/match/<id>.html` (and `/en/` for PSL, per seoMatchDirs) with the A5 facts block, built from cached API calls already used for club hubs: `lib/club-hub-api.js` → `/fixtures?team=X&last=5` and `/fixtures/headtohead` (TTL 6–24 h).
  - The **same URL** becomes the analysis page when the fixture enters the run, since the api-football fixture id is unchanged, so there is no redirect.
  - Copy: "IASHARK's analysis is published about 48 h before kick-off" (true today).
  - Scope: all PSL fixtures (8 per round), plus EPL/UCL fixtures involving the top 6. Keep the thin-page gate (noindex if under 80 words of specific facts).
- **Files.** `scripts/match-lifecycle.js`, `scripts/seo-pages.js` (`writeSeoPages`), `scripts/league-hub-data.js`, `.github/workflows/update-data.yml` (the API budget: about 8 × 3 cached calls per PSL round), `data/match-pages-registry.json` (generated), tests.
- **Effect.** Pages exist when people start searching (1–7 days before) and have time to be crawled. Hubs, club pages and the weekend page then link to real match pages for every fixture, not just those in the run.
- **Guardrail.** Before the run, the page has **no** model content and no "prediction" claim in the title. For preview pages use `"{home} vs {away}: Kick-off (SAST), Form & H2H | PSL"`, then switch to the A5 title when the analysis exists.

### A11. "Both teams to score (BTTS) explained, with PSL numbers" (za guide)

- **Title:** "Both Teams to Score (BTTS) Explained, With PSL Numbers" (53 chars).
- **H1:** "Both teams to score, explained: what BTTS means and how often it lands in the PSL".
- **Content:**
  - the definition (90 minutes; own goals count; extra time does not);
  - BTTS vs over 2.5 vs "win and BTTS";
  - reading a probability against a base rate (PSL ~40%, EPL 52–62% from A8);
  - why a low-scoring league changes the picture;
  - limits;
  - the 18+/NRGP box.
- **Exclusions.** No operator names and no "best BTTS tips today" promises.
- **Why a za guide.** It uses PSL numbers, so it is not a duplicate of the en blog. Link it from A5 and A7.
- **Files.** `content/local-articles/za.json` + `.htm`.

### A12. "Online betting in South Africa: what's legal, 18+ and where to get help" + NRGP slogan

- **Title:** "Is Online Betting Legal in South Africa? 18+ Guide" (49 chars).
- **H1:** "Online betting in South Africa: what's legal, the 18+ rule and where to get help".
- **Content (section 3.1, cited):**
  - only provincially licensed bookmakers may offer online sports betting;
  - online casino gaming is illegal;
  - how to check a licence on the provincial board's site (list the 9 authorities);
  - self-exclusion;
  - NRGP 0800 006 008 (24/7, free);
  - IASHARK is not a bookmaker and recommends none.
- **Exclusions.** No operator names or links. Counsel review before publishing.
- **Slogan.** Add the NRGP slogan (after confirming wording and use) to `config/markets.json#za.helpline` (new `slogan` field), render it in `lib/market-config.js` / footer templates and the `responsibleHtml` of `content/local-articles/za.json`, and keep it visible on the home page.
- **Effect.** C14 queries, trust and E-E-A-T for a YMYL-adjacent site, and ARB alignment.

### A13. Branded share images for WhatsApp and Facebook

- **Change.** Generate a 1200×630 `og:image` for the PSL hub, the weekend page, derby and rivalry pages and PSL match pages: teams, date, "15:30 SAST", IASHARK logo, "18+". Set `twitter:card` to `summary_large_image`. Today match pages hotlink `media.api-sports.io` team logos as `og:image`.
- **Files.** A small image step in the pipeline (the repo already renders images in `generate_tiktok_images.js`, which is French-only), plus the `og:image` meta in `scripts/seo-pages.js` and `scripts/build-club-hubs.js`.
- **Effect.** WhatsApp is the main way SA fans share links. A clear preview card raises click-through from shares, and it avoids depending on third-party logo hotlinks.

### A14. Housekeeping

- Localise the static bottom nav in match pages (P9). It should use the same FALLBACK labels as `bottom-navigation.js`, set in `scripts/seo-pages.js#renderMatchPage` or the match shell.
- `za/exemple-analyse.html`: replace PSG–Monaco with a **real archived** PSL or EPL analysis (e.g. one that was the free match). If none is archived, keep it and mark it `MISSING` in the status docs. Never mock one.
- Add a verified display-name and venue alias map (AmaZulu; Orlando Stadium → Orlando Amstel Arena) in `lib/league-names.js` or a new `config/display-aliases.json`, with a source per entry.
- Link "Latest results" rows on hubs to club pages when no match page exists.

### A15. Coverage decisions

These are strategic choices for the owner rather than build tasks; they are listed in section 6.

---

## 5. Off-site actions for the owner

### 5.1 Google Search Console (this week)

1. **Properties.** Keep or create a **Domain property** (DNS TXT) for iashark.com. Also add a **URL-prefix property `https://iashark.com/za/`** so SA pages get their own Pages and Performance reports. The home carries an HTML-tag verification (`google-site-verification`), so check it covers what you need.
2. **Sitemaps.** Submit `https://iashark.com/sitemap.xml` (index). Check that each child (za-i18n, leagues, clubs, articles, matches-i18n) shows "Success" and that the discovered counts include /za/ URLs.
3. **Request indexing** (URL Inspection → "Request indexing") for:
   - `/za/`
   - `/za/leagues/premier-soccer-league.html`
   - `/za/clubs/`, `/za/clubs/soweto-derby.html`, `/za/clubs/kaizer-chiefs.html`, `/za/clubs/orlando-pirates.html`, `/za/clubs/mamelodi-sundowns.html`
   - the 3 articles
   - `/za/leagues/premier-league.html`

   Repeat for each new page (A4 to A12) on the day it ships.
4. **Check canonical selection.** Inspect a PSL match on /za/ and on /en/. If "Google-selected canonical" is the /en/ URL, the versions are being merged; A5 and A9 fix that.
5. **Pages report** (za property) needs a weekly look at these statuses:
   - "Discovered – currently not indexed" and "Crawled – currently not indexed". Expected at first for match pages; the fix is authority and internal links, not more pages.
   - "Duplicate, Google chose different canonical".
6. **Performance.** Filter Country = South Africa (on the Domain property) and Page contains `/za/`. Every two weeks, list queries in positions 8–20 and rewrite those titles and meta descriptions.
7. **Other tools.**
   - **Bing Webmaster Tools:** import from GSC (5 minutes). Bing also feeds some AI search answers.
   - Google no longer has an "international targeting" setting. hreflang (already correct), SAST, ZAR and local links are the signals.

### 5.2 Local communities (always read and respect group rules)

- **X/Twitter** (very active SA "soccer Twitter"). Post a weekly thread, "PSL this weekend by the numbers", with SAST kick-offs, form and BTTS/over 2.5 counts from A7. No odds, no "bet" call-to-action, "18+" in the bio. Reply to journalists' stats questions with data, linking only when useful.
- **Facebook fan groups** (Chiefs, Pirates, Sundowns, PSL discussion). Many ban links and betting content. Ask admins first, post native images (A13 cards, A8 charts) without links unless allowed, and never post in groups aimed at minors. Organic gambling-related posts must not look like ads. Meta gambling *ads* need prior written permission, and `paidAdsEnabled:false` already stays off.
- **WhatsApp.** Create an official **IASHARK SA WhatsApp Channel** (opt-in, one-way): one weekly post (weekend numbers plus the Soweto Derby countdown in October). Never add people to groups or bulk-message without consent (POPIA direct marketing). Read WhatsApp's Channel guidelines on regulated goods first, and keep content to statistics.
- **Reddit** (r/southafrica and club subs). Self-promotion rules are strict. Share the A8 data as a native post (a table), with a link only if the rules allow.
- **Avoid** "sure odds / fixed matches / banker" groups and paid "tipster" groups. Being associated with them damages trust and contradicts the ARB rules.

### 5.3 TikTok SA (and Reels/Shorts cross-posting)

- TikTok restricts gambling content: content that shows or glamorises gambling is age-restricted and not recommended in For You (Regulated Goods guidelines; re-read the current page before starting).
- Stay squarely on **football statistics**. Series ideas:
  - "PSL in numbers" (why 0-0 is so common: 11–19% of matches);
  - "Soweto Derby by the numbers" (weeks 1–4 of October);
  - "This weekend in SAST" fixture boards;
  - "Promoted clubs: how they fare";
  - "EPL clock change: your kick-off times move on 25 Oct".
- No odds, betslips, money or winnings on screen. No cartoon characters, no under-18-looking people. "18+" and NRGP in the bio; link in bio to `/za/articles/`.
- Cadence: 3 posts a week around PSL rounds. Use a separate SA English account (the existing `generate_tiktok_images.js` pipeline is French). Keep hashtags factual: #PSL #SowetoDerby #KaizerChiefs #OrlandoPirates #Sundowns #Diski.

### 5.4 Earning links (the real bottleneck for a new domain)

- Pitch the **A8 PSL goals data** (and later "promoted clubs") to SA football writers and outlets: Soccer Laduma, Kick Off, iDiski Times, FARPost, The South African, SABC Sport, Soccer Bullet, Diski Zone, and SA football podcasts. Offer free use with credit and a link.
- Around the derby, send journalists a one-page "Soweto Derby in numbers" from the A4 data.
- Do **not** buy links, use PBNs or place guest posts on casino affiliate sites. These are toxic and off-brand.

### 5.5 SA calendar (Sept–Nov 2026)

"Data" means already in the repo's feeds. The rest should be verified before use.

| Date | Event | Use |
|---|---|---|
| 19–20 Sept | PSL round 7 (7 fixtures, SAST in data) | A5/A7 test round |
| 21 Sept – 6 Oct | International window, AFCON 2027 qualifiers MD1–2 (Flashscore/CAF; verify Bafana's opponents) | Social stats only; D2 |
| 16–18 & 23–25 Oct | CAF CL 2nd preliminary round (CAF): Pirates vs African Stars (in Gaborone, Kick Off); Sundowns (holders) vs the Wiliete/Foresters winner | Derby congestion context; D1 |
| 17 & 24 Oct | Chiefs vs Red Arrows, CAF Confederation Cup (data); 17 Oct Chiefs vs Stellenbosch (data) | Club pages |
| **25 Oct** | UK/EU clocks go back, so the SAST gap to the UK becomes 2 h | **A1, A9 deadline** |
| **31 Oct, 15:30 SAST** | **Soweto Derby**, Orlando Pirates vs Kaizer Chiefs (data; venue to confirm) | **A4 live by ~10 Oct**; social push from 20 Oct |
| 11 & 15 Nov | Bafana vs Kenya, AFCON 2027 qualifiers MD3–4 (Flashscore/search; verify) | D2 |
| 13 Mar 2027 | Return Soweto Derby (data) | A4 again |

### 5.6 KPIs and cadence

- Weekly:
  - GSC for the za property: indexed za URLs, impressions and clicks with Country = ZA.
  - Positions on about 20 tracked queries: soweto derby 2026, kaizer chiefs next match, durban city fc fixtures, siwelele fc, psl predictions this weekend, psl btts stats, epl kick off times south africa, golden arrows vs kaizer chiefs prediction, and similar.
  - Visits and signups from ZA (the admin funnel already tracks drop-off by country).
- Realistic expectation: impressions in 2–4 weeks for new long-tail pages once indexed; meaningful clicks in 2–4 months, depending on links earned (5.4). Head terms (C1, C9 predictions) are a 6–12 month goal at best.

---

## 6. Decisions the owner must take (BLOCKED_DECISION; not decided here)

- **D1: CAF competitions.** Should the site add the CAF Champions League and Confederation Cup (api-football ids believed to be 12 and 20; verify) to `config/leagues.json`?
  - Why it matters: SA clubs play them in October (Pirates, Sundowns, Chiefs, Durban City), and CAF SERPs are thin.
  - The obstacle: the model has had no validation on these, as with the PSL.
  - Middle option: **fact-only** fixture pages (SAST, venue, form, H2H) with no predictions.
- **D2: Bafana Bafana.** Should the site cover national-team matches (AFCON 2027 qualifiers, friendlies)? There is high SA demand but it is outside the current model scope.
- **D3: A public teaser number on PSL match pages.** Examples: the market-implied probability from raw odds with the margin removed, or one headline model probability. This would align pages with "prediction" intent (P3).
  - The obstacle: the owner's premium rule (`lib/premium-fields.js`: the Shin consensus and all model probabilities are premium).
  - A5 works without it, using only public facts and `prob_band`.
- **D4: "Tips" wording.** Use it only descriptively (recommended), or not at all?
- **D5: Public GitHub repository** (P14). Is this intentional?
- **D6: Counsel questions** in section 3.4, and adoption of the NRGP slogan (A12).

---

## Appendix: sources consulted (19 Sept 2026)

Regulation:
- ARB Gambling Appendix: https://www.arb.org.za/assets/gambling-appendix.pdf (text decoded locally)
- Werksmans on the ARB 2026 amendments: https://werksmans.com/advertising-regulatory-board-ups-the-ante-on-responsible-gambling-advertising/
- Moneyweb, stricter controls: https://www.moneyweb.co.za/news/south-africa/stricter-gambling-advertising-controls-are-on-their-way/
- National Gambling Act 7 of 2004: https://www.saflii.org/za/legis/num_act/nga2004156.pdf
- National Gambling Regulations: https://www.saflii.org/za/legis/consol_reg/ngr265/
- Lexology, SA advertising: https://www.lexology.com/library/detail.aspx?g=5599675b-5bde-4ed4-a4cd-f034bcab6161
- NGB statement on gambling advertising (Dec 2025, PDF not machine-readable here; read it directly): https://www.ngb.org.za/wp-content/uploads/2025/12/NGB-Statement-Gambling-Advertising.pdf
- Remote Gambling Bill overview (CMS): https://cms.law/en/zaf/legal-updates/the-remote-gambling-bill-and-the-legalisation-of-online-gambling-in-south-africa
- NRGP / SARGF: https://responsiblegambling.org.za/ and https://www.ngb.org.za/stakeholder-information/national-responsible-gambling-programme/
- TikTok Regulated Goods guidelines: https://www.tiktok.com/community-guidelines/en/regulated-commercial-activities

Football facts:
- 2025–26 South African Premiership: https://en.wikipedia.org/wiki/2025%E2%80%9326_South_African_Premiership
- 2026 CAF Champions League final: https://en.wikipedia.org/wiki/2026_CAF_Champions_League_final
- CAF Champions League 2026/27 preliminary rounds: https://www.cafonline.com/caf-champions-league/news/totalenergies-caf-champions-league-202627-season-kicks-off-this-weekend-with-the-first-preliminary-round-as-defending-champions-mamelodi-sundowns-sit-out/
- Kick Off, Pirates vs African Stars venue: https://www.kickoff.com/psl/orlando-pirates/orlando-pirates-face-travel-twist-ahead-of-african-stars-caf-champions-league-clash
- Soweto Derby dates 2026-27: https://www.afrik-foot.com/en-za/soweto-derby-when-chiefs-pirates-clash and https://www.soccerbullet.co.za/when-is-kaizer-chiefs-next-betway-premiership-match/
- Durban City, 2026 Nedbank Cup: https://www.ofm.co.za/article/soccer/341570/durban-city-crowned-2026-nedbank-cup-champions- and https://www.sabcnews.com/sabcnews/durban-city-are-2026-nedbank-cup-champions/
- SuperSport United sold to Siwelele: https://www.ofm.co.za/article/soccer/337654/supersport-united-officially-sold-to-siwelele-fc- and https://iol.co.za/sport/soccer/2025-07-03-supersport-united-sold-to-siwelele-fc/
- AFCON 2027 qualifier fixtures: https://www.flashscore.com/news/soccer-africa-cup-of-nations-fixtures-for-2027-africa-cup-of-nations-qualifiers-confirmed-as-teams-see-path-to-finals/Yk0gmKu3/

SERP samples:
- Hollywoodbets blog PSL previews: https://blog.hollywoodbets.net/soccer/psl/
- Soccer Laduma predictions: https://www.soccerladuma.co.za/betting/predictions/
- Goal en-za: https://www.goal.com/en-za/
- Bet Central PSL: https://www.central.bet.co.za/soccer/psl/psl-betting-guide/
- bets.co.za Golden Arrows v Chiefs: https://www.bets.co.za/soccer/south-african-premier-division/golden-arrows-vs-kaizer-chiefs-predictions-20260919-0002/
- WinDrawWin PSL: https://www.windrawwin.com/tips/south-africa-premiership/
- Forebet PSL: https://www.forebet.com/en/football-tips-and-predictions-for-south-africa/premier-league
- SportyTrader PSL: https://www.sportytrader.com/en/betting-tips/football/south-africa/premier-league-51502/
- FootyStats BTTS: https://footystats.org/predictions/btts
- Flashscore.co.za EPL predictions: https://www.flashscore.co.za/news/soccer-premier-league-epl-gameweek-38-predictions-best-bets-and-odds/WS6YRQbd/

Repo files read (read-only):
- `i18n/seo/za.json`
- `config/leagues.json`, `config/markets.json`, `config/club-hubs.json`, `config/league-expansion.json`
- `scripts/seo-pages.js`, `scripts/build-locales.js`, `scripts/match-lifecycle.js`, `scripts/build-local-articles.js`
- `lib/premium-fields.js`, `lib/free-match.js`, `lib/club-hub-api.js`, `match-page.js`, `bottom-navigation.js`
- `.github/workflows/update-data.yml` (home summary, pipeline window)
- `content/local-articles/za.json`
- generated `za/**`, `sitemap*.xml`, `robots.txt`, `_redirects`
- `data/gate-b1/south_africa_premiership-*.json`, `data/gate-b1/premier-league-2022/2023.json`
- `match/1600347.json`, `data-home.json`, `data/match-pages-registry.json`
