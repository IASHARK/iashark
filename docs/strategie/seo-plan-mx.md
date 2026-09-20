# IASHARK /mx/: SEO plan for Mexico and the US Hispanic audience

Date: 19/09/2026 (Apertura 2026, jornada 9).
Worktree read: `/Users/clement/Documents/IASHARK CLAUDE CODE/wt-seo`, branch `nuit/travail`. This was read only: no build, no test and no file changes in the repo.
Status of this document: **REVIEW**. Every number below comes from the repo's files or from a dated source. Owner decisions are marked **BLOCKED_DECISION**.

---

## 0. Summary

### The five findings that matter most

1. **The /mx/ home shows Paris times.** The static "Análisis con IA del día" block reads "(hora de París)". It lists matches by the Paris day, so tonight's Liga MX games sit under tomorrow's date. On the match pages, the date under the H1 is also the Paris day: América vs Chivas shows "20 de septiembre", but in Mexico the match is on Saturday 19.
2. **Titles use the raw API team names.** Examples: "Club America vs Guadalajara Chivas: pronóstico", "U.N.A.M. - Pumas", "Leon", "Atletico San Luis", "FC Juarez", "Club Queretaro". Mexicans search "América vs Chivas pronóstico", "Pumas", "León". Right now the title of the most-searched match of the season does not contain the query.
3. **/es/ competes with /mx/ on Liga MX, and /es/ wins for the US.** `config/leagues.json` generates Liga MX pages in `mx` **and** `es`. The /es/ version is labelled `hreflang="es"`, which means generic Spanish. Google therefore sends every Spanish speaker outside Mexico to it, **including the US**, and that page shows "domingo 20, 05:15 (hora peninsular)" for the Clásico. The x-default of the Liga MX group is the **French** page. Text similarity between /mx/ and /es/: Liga MX hub 0.83, match page 0.90, home 0.96, blog guides 0.89–0.96.
4. **The two leagues the US Hispanic audience follows are noindex on /mx/.** Premier League (`seoMatchDirs: gb,en,za`) and MLS (`en,gb`) are out of the /mx/ scope, so `/mx/leagues/premier-league.html` and `/mx/leagues/mls.html` are `noindex`. The site has **no** indexable Spanish Premier League or MLS page at all.
5. **The jornada exists in the data but never reaches a page.** api-football returns `league.round = "Apertura - 9"` (seen in `raw_api/` and `data/club-hubs/cache/`). The pipeline drops it (`matchObj`, `update-data.yml` ~l.3103). "Pronósticos Liga MX jornada X" is the core Mexican query, and today no page can target it.

Also: odds are shown only in decimal (`match-page.js` l.26), while Mexico reads American odds (Caliente shows "Americano" by default). The copy says "ambos anotan" but the UI says "Ambos marcan". About 53 /mx/ pages (every `/mx/match/*.html`, plus `match.html` and `joueur.html`) carry a French bottom bar in their static HTML ("Accueil / Outils / Compte").

### The first five actions

| # | Action | Impact | Effort |
|---|---|---|---|
| A1 | CDMX time everywhere, a 21:15 h clock, ET as a second time, correct match day | High | S |
| A2 | Mexican team names (América, Chivas, Pumas, León...) in titles, H1s and JSON-LD | High | S–M |
| A3 | Liga MX in Spanish only on /mx/, plus hreflang `es-US` (and `es` when no /es/ exists) on /mx/ | High | M |
| A4 | Evergreen "Pronósticos Liga MX Jornada N" pages, built from the real `round` field | High | M |
| A5 | Honest match titles, and American odds (+150/−200) in the app for /mx/ | High | S–M |

---

## 1. Audit of /mx/ today

### 1.1 Inventory (files present on 19/09/2026)

| Page type | Files | Indexable | Sitemap | hreflang | JSON-LD |
|---|---|---|---|---|---|
| Home `/mx/` | 1 | yes | `sitemap-mx-i18n.xml` | 9 versions, x-default `/en/` | Organization, WebSite, WebPage |
| Landing `/mx/landing.html` | 1 | **noindex** (on purpose, ads page) | no | 9 versions | none |
| League hubs `/mx/leagues/*.html` | 19 | **4** (Liga MX, Champions, Europa, La Liga). Conference League is in scope but `noindex` today (not enough stable content) | `sitemap-leagues.xml` | Liga MX: fr, es-MX, es, x-default **fr** | BreadcrumbList, CollectionPage, SportsOrganization, ItemList |
| Out-of-scope hubs (Premier, MLS, Bundesliga...) | 14 | **noindex,follow** | no | none | same |
| Clubs and clásicos `/mx/equipos/` | 11 (6 clubs, 4 clásicos, hub) | yes | `sitemap-clubs.xml` | none (unique pages) | SportsTeam, SportsEvent, BreadcrumbList |
| Local articles `/mx/articulos/` | 4 (Apertura/Clausura, liguilla, Clásico Nacional, hub) | yes | `sitemap-articles.xml` | none | Article, BreadcrumbList |
| Blog `/mx/blog/` and `/mx/blog/guides/` | 9 | yes | `sitemap-mx-i18n.xml` | 7 languages | Blog, Article, FAQPage |
| Match pages `/mx/match/<id>.html` | 51: 13 Liga MX, 20 La Liga, 18 Europa League | 43 indexable, 8 noindex (fewer than 80 words, or J+7) | `sitemap-matches-i18n.xml` (16 in the sitemap, per the <48 h rule) | Liga MX: fr, es-MX, es, x-default fr | SportsEvent, BreadcrumbList |
| Legal/methodology/pro/abonnement | about 12 | yes | `sitemap-mx-i18n.xml` | 9 versions | BreadcrumbList (plus AboutPage) |

Total **55 /mx/ URLs in the sitemaps**. Canonicals are self-referencing everywhere; `lang="es-MX"` and `og:locale=es_MX` are correct.

### 1.2 Current titles, H1s and meta by template

| Page | Current title | Current H1 | Notes |
|---|---|---|---|
| Home | Pronósticos de futbol y Liga MX con estadística \| IASHARK | "Entiende el partido. Encuentra el mercado justo." | Good title. The H1 is a slogan with no keyword. The static block lists the day's matches **in Paris time**. |
| Liga MX hub | Pronósticos Liga MX: partidos, tabla y momios \| IASHARK | Pronósticos Liga MX: partidos, resultados y tabla | Strong content (18-team table, 13 matches in 14 days). The title promises "momios" but the page shows none. No "Apertura 2026" (standings source is `matchs`, `season: null`). |
| Match (Clásico) | Club America vs Guadalajara Chivas: pronóstico | Club America vs Guadalajara Chivas | Raw API names. The date under the H1 is 20/09 (the Paris day). The facts block correctly says "sábado 19 de septiembre, 09:15 p.m. (tiempo del centro de México)". Useful facts: form, table, H2H, stadium. |
| Match (standard) | Pronóstico Puebla vs Toluca (Liga MX): momios y datos | Puebla vs Toluca | "momios" is promised, but visitors see no odds (they are in the preload, but the visitor view only shows the header and one panel). No jornada. |
| Club | América: próximos partidos, tabla y pronósticos | Club América: próximos partidos y estadísticas | Good. Only 6 of the 18 clubs have a page. |
| Clásico | Clásico Nacional, América vs Chivas: historial y partidos | Clásico Nacional: América vs Chivas | Good. **Clásico Tapatío (Atlas vs Chivas)** is missing, and it is J11 (10/10 in CDMX per the api-football cache). |
| Liguilla article | La liguilla de la Liga MX: cómo funciona, paso a paso | idem | The fact "no play-in from Apertura 2026" matches the sources (TUDN, El Siglo de Torreón, Olympics.com). |

### 1.3 Findings, by severity

**F1. Paris time on the /mx/ home (high).** `.github/workflows/update-data.yml`, `seoHomeSummaryHtml()` (~l.1655) builds the same block for every version:
- the Paris day (`TODAY`);
- the Paris time (`m.date`);
- the label `home_app.seo_times_paris`.

Result on `/mx/`: "01:30 — New York City FC vs New York Red Bulls", "03:00 — Puebla vs Atlante FC" (actually Friday 19:00 CDMX), then J1 League. The JS replaces this with the visitor's local time, but the HTML that Google indexes is in Paris time.

**F2. Wrong match day under the H1 (high).** `scripts/seo-pages.js#matchSummaryHtml` (l.200) takes `m.date.split(" ")[0]`, the **Paris** day. Every Liga MX match after 17:00 CDMX (01:00 Paris) shows the next day's date. The title, the meta description and the facts block use the correct date, so the page contradicts itself.

**F3. Raw API team and stadium names (high).** Examples: "Club America", "Guadalajara Chivas", "U.N.A.M. - Pumas", "Leon", "Atletico San Luis", "FC Juarez", "Club Queretaro", "CF Pachuca", "Club Tijuana", "Estadio Banorte - Mexico City", "San Luis de Potosi". They appear in the `<title>`, H1, JSON-LD, hub tables and home. There is no alias mechanism in `lib/` or `scripts/`; only `config/club-hubs.json` holds display names, for 6 clubs. When a title is too long, the "min" template kicks in ("Club America vs Guadalajara Chivas: pronóstico") and drops "Pronóstico" from the front.

**F4. Odds (medium to high).**
- (a) Everything is in decimal: `match-page.js` l.26, `const odds=v=>…toLocaleString(…{minimumFractionDigits:2})`. In Mexico the American format is the default: Caliente shows "Americano" first, and El Informador/TV Azteca write "+155".
- (b) Titles and the hub promise "momios", but the non-subscriber view (owner decision of 19/09) shows none.
- (c) Real, public data does exist: `PRELOADED_MATCH` carries `c1 2.56 / cn 3.42 / c2 2.49` (Pinnacle), which is **+156 / +242 / +149**.

**F5. Duplication risk between es-MX and es (high for Liga MX, medium elsewhere).**

| Pair | Word similarity |
|---|---|
| `/mx/` vs `/es/` home | 0.96 |
| Blog guides | 0.89 to 0.96 (except the bookmakers guide, 0.25, which was localised) |
| Match 1550971 | 0.90 |
| La Liga hub | 0.86 |
| Liga MX hub | 0.83 |

The hreflang tags are correct and reciprocal, so there is no penalty. But Google can pick /es/ as the canonical of the group, and with `hreflang="es"` (generic), /es/ is the version served to Spanish speakers in the US, Colombia and elsewhere. For Liga MX that is the worst possible version: Madrid time ("05:15 hora peninsular"), EUR, Spanish vocabulary. The x-default of the Liga MX group points to `/fr/leagues/liga-mx.html`.

**F6. Scope (high for the US).** Premier League and MLS are out of the /mx/ scope: the hubs are noindex and no match pages exist. The home lists them in `priority_leagues`, but `versionNav` filters them out. No Spanish version of these two leagues exists anywhere on the site.

**F7. Root routing (low for SEO).** `_redirects` sends `Country=us` to `/en/` whatever the language (built by `lib/lang-routing.js` and `scripts/build-locales.js#redirectsContent`). This is deliberate: "a visitor is never sent to an offer that doesn't apply to them".

**F8. No jornada (high).** `league.round` is available ("Apertura - 1" to "- 17", "Quarter-finals", "Semi-finals", "Final"). It is neither in `matchObj` (`update-data.yml` ~l.3103) nor in the `publicSnapshot` whitelist (`scripts/match-lifecycle.js` l.170).

**F9. Clock format (low).** `seo-pages.js#clock` gives "09:15 p.m." in es-MX. Mexican sports media write "21:15 horas (tiempo del centro de México)" (Mediotiempo, ClaroSports, El Informador).

**F10. French text in static HTML (low to medium).**
- The bottom bar in `match.html` l.5 and `joueur.html` ("Accueil", "Outils", "Compte", `aria-label="Navigation principale"`) has no `data-i18n`, so `bakeI18n` never translates it. That affects about 53 /mx/ pages.
- `mx/a-propos.html` contains a French helpline block ("JOUEURS-INFO-SERVICE.FR (FRANCIA)"). Check whether it is hidden by the market config.
- The `/mx/exemple-analyse.html` example is PSG vs Monaco, rendered in JS from data that contains French text and `"mise": "2-3% bankroll"` (a staking recommendation sitting in the source).

**F11. Home (medium).** The H1 has no keyword. The JS match cards link to `match.html?id=` (noindex, `home-list.js` l.219), not to `/mx/match/<id>.html`. This was already flagged in `reports/seo-night-2026-09-19.md` §4.3 and is still open.

**F12. Vocabulary (low).**
- The SEO copy says "ambos anotan" (`i18n/seo/mx.json#_readme`), but `i18n/dict/es-mx.json` says "Ambos marcan Sí/No".
- "cuota" appears in `mx/methodologie.html` ("rangos de cuotas").
- The blog slugs are French (`plus-de-2-5-buts-…`). Leave them (see §4, "what not to do").

**F13. Liga MX coverage (medium).**
- 6 of 18 clubs have a hub. Missing: Toluca (current leader), Atlas, Pachuca, León, Querétaro, Tijuana, Santos, Necaxa, Puebla, San Luis, Juárez, Atlante.
- The table comes from `source: "matchs"`. The official `/standings` cache is dated 14/09, so there is no "Apertura 2026" chip.

**What is good, and should be kept:**
- CDMX time on the match and hub pages;
- 18+ chip on the hubs;
- Línea de la Vida in every footer;
- a solid responsible-gambling page;
- local articles with no hreflang;
- club and clásico pages that update every day;
- the 80-word noindex threshold;
- J+7 noindex and J+30 301 redirects;
- lastmod values taken from the change register.

### 1.4 Liga MX data: what really exists (no invention needed)

| Data | Where | State |
|---|---|---|
| Liga MX identity | `config/leagues.json` (`liga_mx`, id 262, `soccer_mexico_ligamx`, Pinnacle fallback) | OK |
| Matches of the run | `data.json` / `match/<id>.json` (13 /mx/ pages right now) | OK. The pipeline fetches the Paris days D, D+1 and D+2 (`update-data.yml` l.581) |
| Table | `data/league-hubs-registry.json#leagues.liga_mx` (18 teams, as of 19/09) | OK. Source `matchs`; official cache dated 14/09 |
| Jornada / phase | `league.round` in the api-football responses | **present at the source, missing from the public data** |
| Upcoming fixtures, clásicos | `data/club-hubs/cache` (J4 to J16) | Atlas–Chivas J11 (11/10 01:00Z, which is 10/10 19:00 CDMX); Pumas–América J16 (08/11 03:00Z, which is 07/11 21:00 CDMX) |
| Public odds | `PRELOADED_MATCH.c1/cn/c2/co25/cbtts` (Pinnacle) | present in decimal. American format = pure conversion |
| Model probabilities | premium fields (`CHAMPS_PREMIUM`) | behind the paywall. Never on a public page (except the free match) |

---

## 2. Keyword research

Method: real SERPs on 19/09/2026. **The search tool is located in the United States**, so these are the US-Spanish SERPs, which is exactly the Hispanic audience. The Mexican SERPs must be confirmed in Search Console (Country = Mexico). No search volume is quoted, because no reliable source was available. The owner should measure volumes with Google Keyword Planner (location Mexico, then United States, language Spanish).

### 2.1 Who ranks today

| Query | What was seen | Reading |
|---|---|---|
| pronósticos Liga MX | 365Scores (insights), Forebet, Vitisport, Scores24, SportyTrader /us/, ESPN Deportes (quinielas), HispanosNBA /mx/ | **Automated statistical sites** (Forebet, 365Scores) rank on the head term. That is IASHARK's category. A mid-sized site (HispanosNBA /mx/) ranks with a /mx/ folder, so it is winnable in the mid term. |
| pronósticos Liga MX jornada 10 | ESPN, PostaDeportes ("predicciones para apostar jornada 10"), TVC Deportes, Futbol Total, apuesta.mx | Media with one dated article per jornada. **No stable page per jornada**, which is the gap to take. |
| América vs Chivas pronóstico | SI.com **es-us** ("probabilidades, estadísticas y predicción"), Crónica, El Informador / La Silla Rota / TV Azteca / ClaroSports (one syndicated article: "momios en igualdad", Caliente +155), casasdeapuestas.com, Gainblers /mx/ | Very competitive on the clásicos. The syndicated article shows that one data story gets picked up by 5+ outlets. |
| Monterrey vs Cruz Azul pronóstico | SI es-us (x2, "predicción IA"), ClaroSports, Vamos Azul / Bolavip ("la IA predijo"), bolavip /mx/apuestas, casasdeapuestas | **"Predicción IA" is a trend in Mexican media.** SI es-US mass-produces "probabilidades + predicción IA" pages for **every** Liga MX match. |
| Liga MX partidos de hoy / horarios jornada 9 | ESPN MX, Mediotiempo, Milenio, El Informador, de10, Yahoo es-us | Head term owned by the media plus Google's own sports box. **Not winnable, don't target it.** |
| pronósticos de fútbol hoy / ambos anotan | HispanosNBA, Forebet (x2), Sporticos, SportyTrader /us/, BetMines | Forebet-type sites own it. Only the long tail is winnable ("ambos anotan Liga MX jornada X"). |
| pronóstico Premier League (MX) | Flashscore.com.mx ("Pronósticos, mejores apuestas y momios jornada 37/38"), Mediotiempo, legalbet.mx, 365Scores es-mx, Bolavip | Demand is real in Mexico, in "jornada" + "momios" wording. |
| pronóstico Inter Miami / MLS (Spanish) | **Squawka /us-es/** (one "Pronóstico y momios" page per match), Mediotiempo | The US-Spanish MLS space is held by one publisher with templated pages. |
| Champions League pronósticos hoy momios | Oddschecker /es, Scores24, 365Scores, Forebet, Oddspedia /us/, BetMines, Soccerway | Aggregators. Only the match long tail is winnable. |
| momios americanos / cómo leer momios | Caliente (help pages), Caliente Casino blog, Novibet, cerocero, calculators (apuestasjuegos.com.mx) | Informational intent, owned by operators. **A neutral calculator plus guide is winnable and earns links.** |
| predicción IA Liga MX | SI es-us, ProdeAI, Forebet, 365Scores | Emerging niche, and the natural fit for the IASHARK brand. |

US-Spanish vocabulary seen: "pronóstico", "momios", "picks", "predicción IA", with times given in ET. Mexican vocabulary: "momios", "jornada", "ambos anotan", "altas y bajas" (Over/Under: Caliente, Codere, Strendus, La Jornada Zacatecas), "liguilla", "tabla general". Beware: "Pronósticos" is also the brand of the state lottery (pronosticos.gob.mx, Progol). The generic word is fine to use, but never "Progol" or "quiniela oficial".

### 2.2 Keyword clusters → page type

| # | Cluster | Example queries (es-MX / es-US) | Intent | Winnable for IASHARK | Target page |
|---|---|---|---|---|---|
| K1 | Liga MX match | "pronóstico atlas vs pumas", "pachuca vs tijuana pronóstico", "querétaro vs león predicción" | pre-match, transactional-informational | **Yes for non-clásico matches** (weak competition, and one page already exists per match) | `/mx/match/<id>.html` (A2, A5) |
| K2 | Clásicos | "américa vs chivas pronóstico", "clásico joven pronóstico", "clásico tapatío", "clásico regio pronóstico" | pre-match + evergreen | Hard on match day; **possible on the evergreen clásico page** (history, next match) | `/mx/equipos/clasico-*.html` + match page (A7) |
| K3 | Jornada | "pronósticos liga mx jornada 10", "predicciones jornada 10 liga mx", "partidos jornada 10 liga mx horarios" | weekly | **Yes, with an evergreen URL per jornada number** (authority builds up torneo after torneo) | `/mx/liga-mx/jornada-<n>.html` (A4) |
| K4 | Liguilla | "liguilla apertura 2026", "cómo quedaría la liguilla", "cruces liguilla si terminara hoy", "pronóstico liguilla" | seasonal (Oct to Dec) | Mid-term, with a projection built from the real table | `/mx/liga-mx/liguilla.html` (A6) + existing article |
| K5 | League | "pronósticos liga mx", "predicciones liga mx", "tabla liga mx apertura 2026" | hub | Head term, slow. The hub already exists; strengthen it | `/mx/leagues/liga-mx.html` |
| K6 | Today | "pronósticos de futbol hoy", "pronósticos de futbol para mañana", "partidos de hoy pronósticos" | daily | Long tail: combined with Liga MX or a date | `/mx/pronosticos-hoy.html` (A10) |
| K7 | Markets | "ambos anotan liga mx", "altas y bajas liga mx", "más de 2.5 goles hoy" | informational + lists | Explainer: yes. Model lists: **no** (premium data) | articles (A13) |
| K8 | Momios | "momios americanos", "cómo leer momios +150", "convertir momios a probabilidad", "calculadora de momios" | informational / tool | **Yes** (neutral tool, links) | `/mx/calculadora-momios.html` + article (A13) |
| K9 | AI prediction | "predicción ia liga mx", "pronóstico con inteligencia artificial futbol" | informational/brand | **Yes, brand fit** | existing guide, localised + article (A13, A15) |
| K10 | Premier / Europe in Spanish | "pronóstico premier league jornada", "pronóstico real madrid vs …", "champions pronósticos hoy" | pre-match | Long tail. Premier: nothing today (A8) | hubs + match pages |
| K11 | MLS in Spanish (US) | "pronóstico inter miami", "mls pronósticos en español", "horario inter miami hoy" | US pre-match | Medium: Squawka is the only strong competitor | `/mx/leagues/mls.html` + match pages (A8, A3) |
| K12 | US times | "horario américa vs chivas en estados unidos", "liga mx horario usa" | practical US | **Yes** with ET/PT times on the pages (A1) plus an article | match, jornada, article |

---

## 3. Regulatory and ethical frame (Mexico, with a US note)

### 3.1 Gambling: Ley Federal de Juegos y Sorteos (LFJS 1947) and its Reglamento (SEGOB / DGJS)

- **IASHARK does not need a permit** as long as it neither takes nor places bets, holds no stakes and acts as no operator's agent. This is already stated in `/mx/jeu-responsable.html`: "no contamos con permiso alguno en materia de juegos y sorteos".
- **Advertising.** The Reglamento (art. 9 in the ordenjuridico.gob.mx version) reserves advertising of *juegos con apuesta* to permit holders. It requires the permit number, the "prohibido para menores" notice and a responsible-play message. Consequences for IASHARK:
  - no affiliate links;
  - no bonus codes;
  - no bookmaker logos or "apuesta aquí" calls;
  - never name an operator as "recommended" (`content/local-articles/mx.json` already says: "no recomienda a ningún operador").
  
  The current `/mx/blog/guides/meilleurs-bookmakers-monde-2026.html` guide names no operator and only links to gob.mx and the Diputados site. Keep it that way.
- **Minors: 18+.** It is on the hubs, footers and legal pages. Keep "Solo +18" in every meta description, as today.
- **2026 context to watch:**
  - IEPS on bets rose from 30 % to 50 % on 01/01/2026 (operators only);
  - gambling ads on radio/TV reported as limited to after 22:30;
  - SEGOB announced on 03/09/2026 a reform of the gambling law against money laundering;
  - pending bills: minimum age **21** (Mejía Berdeja, Oct. 2025), legal definition of ludopatía (Martínez Urincho, Aug. 2026).
  
  If the age moves to 21, `config/markets.json#mx.minAge` and every "+18" text must change.

### 3.2 Consumer protection: PROFECO / LFPC

- **Art. 76 Bis, fracc. VIII and IX (DOF 12/12/2025, in force since 13/12/2025):**
  - express, informed consent to recurring charges (amount, frequency, date);
  - notice **at least 5 calendar days** before an automatic renewal;
  - immediate cancellation, through a channel as accessible as the one used to subscribe.
  
  The /mx/ CGV already marks the **weekly D-2 notice as BLOCKED_LEGAL**. That status is justified: D-2 is under the 5-day minimum. Weekly must not open until this is settled.
- **Art. 32** requires truthful, non-misleading advertising. Therefore: no promise of winnings, **no ROI, no win rate, no "hit rate" claims**, and any "IA" claim must describe what the model actually does.
- **Art. 7 Bis** requires the total price to be shown with taxes included (see §3.3).

### 3.3 Tax (not SEO, but it blocks the goal of selling in Mexico)

**BLOCKED_DECISION (tax/legal).**
- The /mx/ CGV say "IVA no aplicable, artículo 293 B del CGI francés".
- The Mexican VAT law covers "the download of or access to ... information ... **and statistics**" provided by foreign residents (**LIVA art. 18-B, fracc. I**).
- **Art. 18-D** then requires three things:
  - registration in the RFC within 30 days of the first service;
  - charging **16 % IVA** expressly in the price;
  - reporting to the SAT every month.

To be validated with a Mexican tax adviser **before** Mexican payments open (`markets.json#mx.checkoutOpen` is already set to week/month/year in the unpublished branch).

### 3.4 Ethics specific to Mexico (wording)

- **Banned words**, in copy as on social media: "candado", "fija", "segura", "parlay seguro", "ganancia garantizada", "inversión", "recupera lo perdido". Also banned: screenshots of winning bets and cumulative results.
- Allowed: "probabilidad estimada", "el modelo estima", "no es una garantía", "puede fallar", "calidad de datos".
- **What /mx/ already shows:**
  - `/mx/jeu-responsable.html`: strong page (not a bookmaker, 18+, warning signs, Línea de la Vida 800 911 2000, Gambling Therapy, account closure on request);
  - helpline in every footer;
  - "Información estadística, no una garantía de resultados. IASHARK no es una casa de apuestas. Solo +18." on the match pages and hubs;
  - "Ninguna promesa de ganancia" on the home;
  - "Sin resultados garantizados" on the subscription page.
- **Gaps:**
  - `"mise": "2-3% bankroll"` in the embedded data of `/mx/exemple-analyse.html` (a staking tip in the page source);
  - the Pro feature is named "Parlay basado en los análisis reales" (acceptable, but never "parlay seguro").

### 3.5 US note (Hispanic audience)

Publishing sports statistics and odds is informational content. The rule that matters is the FTC ban on misleading claims, the same line as LFPC art. 32. Selling to US residents is currently set up on `/en/` (USD 19.99). See D4.

---

## 4. Action plan (15 actions)

Ranked by impact divided by effort. Before starting A1–A5, look up the matching `tests/*.test.js` (listed per action).

Important calendar dates (api-football cache and the liguilla article):
- J10: 25–28/09;
- FIFA window;
- J11: 10–12/10, with the **Clásico Tapatío** on 10/10;
- J13: midweek, 21–22/10;
- J16: 07/11, with **Clásico Capitalino** Pumas–América;
- J17: 22/11;
- Liguilla: quarter-finals 25–29/11, semi-finals 2–6/12, final 10–13/12.

| # | Action | Impact | Effort | Deadline | Decision |
|---|---|---|---|---|---|
| A1 | CDMX time and correct day (home + match), 24 h clock, ET as a second time | High | S | before J10 (25/09) | no |
| A2 | es-MX team (and stadium) names | High | S–M | before J10 | wording to validate |
| A3 | Liga MX Spanish = /mx/ only, `es-US`/`es` aliases, 301s | High | M | before J11 | **D1** |
| A4 | Jornada pages `/mx/liga-mx/jornada-<n>.html` | High | M | J11 | no |
| A5 | Honest match titles + American odds in the app | High | S–M | before J10 | **D2, D3** (options) |
| A6 | Liguilla page ("si terminara hoy", then real ties) | Medium–high | M | before 01/11 | no |
| A7 | Clásico Tapatío + 12 missing club hubs | Medium | M | Tapatío before 03/10 | no |
| A8 | Open Premier League and MLS on /mx/ | Medium–high | S | October | **D5** |
| A9 | Root routing for Spanish-speaking US visitors | Low–medium | S | after D4 | **D4** |
| A10 | "Pronósticos de futbol hoy / mañana" page | Medium | S–M | October | no |
| A11 | /mx/ home: H1, card links, links to the new hubs | Medium | S | with A4 | no |
| A12 | Official Liga MX table refreshed daily | Medium | S | with A6 | no |
| A13 | Mexican articles + momios calculator | Medium | M | Oct–Nov | no |
| A14 | Quality fixes (bottom bar, "ambos anotan", "cuota", example page) | Low–medium | S | before J10 | no |
| A15 | Differentiate the /mx/ guides from /es/ | Low–medium | M | November | no |

### A1. Mexico time everywhere, plus ET for the US

**Exact change.**
1. `update-data.yml`, `seoHomeSummaryHtml(matchsData, loc, dir)` and `injectHomeSeoSummary`:
   - for each directory, read `i18n/seo/<dir>.json#tz` / `tz_label` (via `scripts/seo-common.js#seoConf`);
   - filter the matches on the **local day** of that zone (from `MATCH_TIME.parseParis(m.date)`, the real instant);
   - format the time in that zone and sort;
   - replace the `home_app.seo_times_paris` label with `tz_label` ("tiempo del centro de México");
   - for /mx/, put `priority_leagues` first (Liga MX before J1 League).
2. `scripts/seo-pages.js#matchSummaryHtml` (l.200): compute the day from `kickoff(m)` in `seoConf(dir).tz`. The `<time datetime>` becomes the ISO instant and the label becomes `longDate(d, dir)`. That removes the "20 de septiembre" on a game played on the 19th.
3. `scripts/seo-pages.js#clock` (l.83): for `mx`, `{hour:"2-digit",minute:"2-digit",hourCycle:"h23"}` plus the suffix `" h"`, giving "21:15 h". New key `i18n/seo/mx.json#clock_suffix: " h"`.
4. Second time zone for /mx/: `i18n/seo/mx.json` gains:
   ```json
   "tz2": "America/New_York",
   "tz2_label": "ET (EE. UU.)"
   ```
   `factRowsHtml` and `hubFixture` then show "sábado 19 de septiembre de 2026, 21:15 h (centro de México) · 23:15 h ET (EE. UU.)". Clásico check: 03:15Z gives 21:15 CDMX, 23:15 ET, 20:15 PT.

**Files:** `.github/workflows/update-data.yml`, `scripts/seo-pages.js`, `i18n/seo/mx.json`, `i18n/dict/es-mx.json` (label), tests `tests/seo-pages.test.js`, `tests/home-match-links.test.js`.

**Expected effect:**
- the static /mx/ page stops contradicting itself (date, time);
- the "hoy" list matches the Mexican day;
- the US long tail ("horario … en estados unidos") becomes reachable;
- trust and CTR improve.

**Data invented: none.** This only reformats the known instant.

### A2. Mexican team names (display) with no data changed

**Exact change.**
1. New file `config/team-names.json`, keyed by api-football id. Values from real ids (`data/league-hubs-registry.json`):
   ```json
   {"_readme":"Display names by version. The API name stays in JSON-LD alternateName. REVIEW.",
    "es-mx":{
     "2287":"América","2278":"Chivas","2286":"Pumas","2295":"Cruz Azul","2279":"Tigres",
     "2282":"Monterrey","2281":"Toluca","2291":"Puebla","2290":"Querétaro","2289":"León",
     "2280":"Tijuana","2283":"Atlas","2292":"Pachuca","2288":"Necaxa","2312":"Atlante",
     "2314":"Atlético de San Luis","2285":"Santos Laguna","2298":"FC Juárez"}}
   ```
   Optionally, fix stadium spellings too: "Estadio Banorte (Ciudad de México)", "Estadio León (León)", "San Luis Potosí".
2. `lib/team-names.js#displayName(team, dir)`, used in `scripts/seo-pages.js` (`teams`, `matchVars`, `matchCrumbs`, `matchSummaryHtml`, `matchFactSections`, `hubFixture`, `hubResult`, standings rows) and in the home summary (`update-data.yml`). `matchEvent`: `homeTeam: {name: "América", alternateName: "Club America"}`.

Before/after example:
- `Club America vs Guadalajara Chivas: pronóstico`
- `Pronóstico América vs Chivas, Jornada 9: horario y datos` (56 characters, with A4's `round`)

**Files:** `config/team-names.json` (new), `lib/team-names.js` (new), `scripts/seo-pages.js`, `scripts/league-hub-data.js` (if the names come from there), `.github/workflows/update-data.yml`, tests `tests/seo-pages.test.js`, `tests/seo-structured-data.test.js`.

**Expected effect:** the title, H1 and breadcrumb contain the query exactly as typed ("américa vs chivas", "atlas vs pumas"). This is the strongest single on-page lever for cluster K1/K2 at almost no cost.

### A3. Liga MX: one Spanish version, the Mexican one, also served to the US

**BLOCKED_DECISION D1.** This reverses the 14/09 choice `liga_mx -> mx, es`. It is recommended because the Liga MX audience is Mexico plus the US, and /es/ shows Madrid time.

**Exact change.**
1. `config/leagues.json#liga_mx.seoMatchDirs`: `["mx","es"]` becomes `["mx"]`.
2. New generic rule in `scripts/seo-common.js#alternatesFor` (and the same in `scripts/build-locales.js#buildHead`). In `config/markets.json#_dirs.mx`, add:
   ```json
   "hreflangAliases": ["es-US", "es"]
   ```
   An alias is added (same href as `/mx/…`) **only if no other version of the group already declares that code**. Results:
   - Liga MX group: `fr`, `es-MX`, `es-US`, `es` all point to /mx/;
   - Champions group (where /es/ exists): only `es-US` points to /mx/;
   - x-default of the Liga MX group: `/mx/` instead of `/fr/`. Set `_hreflangXDefault` per league, or apply "the version of the league's country" when neither en nor fr is relevant.
3. Redirects:
   - `scripts/match-lifecycle.js#writeRedirects`: 301 `/es/match/<id>.html` to `/mx/match/<id>.html` for every `liga_mx` id in the registry;
   - `scripts/build-locales.js#redirectsContent`: `/es/leagues/liga-mx.html  /mx/leagues/liga-mx.html  301`.
   
   This avoids 404s and merges the signals.
4. Do **not** add `es-US` to `abonnement.html`, `cgv.html` or the legal pages until D4 is decided (the offer and law differ).

**Files:** `config/leagues.json`, `config/markets.json`, `scripts/seo-common.js`, `scripts/build-locales.js`, `scripts/match-lifecycle.js`, tests `tests/seo-structured-data.test.js` (hreflang reciprocity with several codes on one URL), `tests/match-lifecycle.test.js`, `tests/geo-dirs.test.js`.

**Expected effect:**
- the Clásico, the hub and every Liga MX match compete with only one Spanish page;
- Spanish-speaking users in the US and Latin America land on CDMX (plus ET) times rather than Madrid time;
- the "Duplicate, Google chose a different canonical" status disappears for Liga MX.

### A4. Evergreen jornada pages (the core Mexican query)

**Exact change.**
1. **Data.** Add `round: lg.round || null` to `matchObj` in `update-data.yml` (~l.3103; `lg` is the league object of the api-football fixture). Then add `round` to the `publicSnapshot` whitelist (`scripts/match-lifecycle.js` l.170) so the value survives in the registry. It is a public field, not premium.
2. **Generator** in a new file `scripts/build-liga-mx-rounds.js`, called after `writeSeoPages`. It groups the registry (`data/match-pages-registry.json`) plus the run by `round`:
   - "Apertura - N" → `/mx/liga-mx/jornada-N.html` (**stable URL reused every torneo**);
   - phases "Quarter-finals / Semi-finals / Final" → the liguilla page (A6).
   
   Do **not** put these pages under `/mx/leagues/`: `writeSeoPages` deletes anything in that folder that is not a hub, and it would fail on a sub-folder.
3. **Content** (100 % data):
   - the 9 matches: day, CDMX + ET time, stadium, links to `/mx/match/<id>.html` and the club pages;
   - "Análisis disponible" when the match page exists;
   - the table **before** the jornada (standings register);
   - after the games: "Resultados de la Jornada N", with scores from the registry (`findFinalScore`);
   - navigation to the previous and next jornada, the Liga MX hub, the liguilla page and the clásicos.
   - **Never** a model probability (premium), except to link to the free analysis of the day.
4. **SEO:**
   - JSON-LD: `CollectionPage` + `ItemList` of `SportsEvent` (startDate, location, homeTeam/awayTeam) + `BreadcrumbList` (Inicio › Liga MX › Jornada N);
   - indexable only when at least 5 matches of the jornada are known;
   - sitemap `sitemap-liga-mx.xml` added to `sitemap.xml` (index script: `scripts/i18n-sitemaps.js`);
   - link from the hub (`renderLeagueHub`: "Jornada actual" block) and from every Liga MX match page (`matchFactsHtml`: "Todos los partidos de la Jornada N").
5. **Copy (es-MX):**
   - Title (58): `Pronósticos Liga MX Jornada 10: horarios, tabla y análisis`
   - H1: `Pronósticos Liga MX, Jornada 10 del Apertura 2026`
   - Generated hook: « La Jornada 10 del Apertura 2026 se juega del {primer día} al {último día}. Aquí están los nueve partidos con horario del centro de México y del Este de EE. UU., cómo llega cada equipo en la tabla y el análisis estadístico de IASHARK de cada partido en cuanto se publica. Probabilidades, no garantías. +18 »
   - Meta (≤155): `Jornada 10 de la Liga MX: los 9 partidos con horario del centro de México y ET, tabla, resultados y análisis estadístico. Solo +18.`

**Files:** `.github/workflows/update-data.yml`, `scripts/match-lifecycle.js`, `scripts/build-liga-mx-rounds.js` (new), `scripts/seo-pages.js` (links), `scripts/i18n-sitemaps.js`, `i18n/seo/mx.json` (templates), new tests (`tests/liga-mx-rounds.test.js`).

**Expected effect:**
- targets K3, the most frequent recurring Mexican query, every week of the season;
- the stable URL builds authority from one torneo to the next, where the media publish a new dated article every week;
- a strong internal hub towards the match pages (K1).

### A5. Honest match titles, and odds in the Mexican format

**Titles (no decision needed).** In `i18n/seo/mx.json#match`, only promise what the page shows (visitor view: time, stadium, form, table, head-to-head):
- `title`: `Pronóstico {home} vs {away}, Jornada {jornada}: horario y datos` (with `round`; without it: `Pronóstico {home} vs {away} ({league}): horario y datos`);
- `title_min`: `{home} vs {away}: pronóstico y horario`;
- `description`: `{home} vs {away}, {date} a las {time} h (centro de México): racha, tabla, historial y análisis estadístico de IASHARK. +18`.

Drop "momios" as long as D3 is not decided. Same for the Liga MX hub (`league.overrides.liga_mx.title`): `Pronósticos Liga MX Apertura 2026: jornada, horarios y tabla` (60), with `{season}` filled when the official table is available (A12).

**American odds in the app (no decision needed for subscribers):**
- new `lib/odds-format.js`:
  ```js
  american = d >= 2 ? "+" + Math.round((d - 1) * 100) : "-" + Math.round(100 / (d - 1))
  ```
- `match-page.js` l.26 (`odds`) and `tools-page.js`: when the market is `mx` (and `us`), show "+156 (2.56)", with American first.
- Settings: `site-prefs.js` could offer the choice "Americano / Decimal", like Caliente.

**BLOCKED_DECISION D3.** Show a "Momios de referencia (Pinnacle)" block on the static page, for everyone, in American format: América +156 / Empate +242 / Chivas +149, from the **public** fields `c1/cn/c2` already in `PRELOADED_MATCH`. This is real data and matches the query "momios". It contradicts the 19/09 visitor-view decision ("header + one panel").

**BLOCKED_DECISION D2** (largest SEO lever, owner's call). A public teaser on /mx/ match pages ("Favorito según el modelo" or 1X2 probabilities), with markets, scorers and scenarios staying Pro:
- *For:* "pronóstico X vs Y" expects an answer. SI es-US, Bolavip and Gainblers all give one.
- *Against:* it gives away some of the Pro value and changes the 16/09–19/09 rules.

**Files:** `i18n/seo/mx.json`, `lib/odds-format.js` (new), `match-page.js`, `tools-page.js`, `site-prefs.js`; if D3 is approved, `scripts/seo-pages.js#matchFactsHtml`. Tests `tests/seo-meta.test.js`, `tests/seo-pages.test.js`, `tests/premium-leak-real-files.test.js` (make sure no premium field leaks).

**Expected effect:**
- better CTR and fewer bounces (the promise matches the page);
- the momios format Mexican and US users expect.

### A6. Liguilla page, built from the real table

**Exact change.**
- New `/mx/liga-mx/liguilla.html`, produced by the A4 generator.
- **Phase 1 (regular season):** "Si el torneo terminara hoy" = ties 1v8, 2v7, 3v6, 4v5 in the order of the **official** table (A12), with the date of the table, the gap to 8th place and the explanation of the rules (no play-in; the higher-placed team advances on an aggregate tie in the quarter- and semi-finals; the final goes to extra time and penalties). The rules are taken from the existing article, verified against TUDN, El Siglo de Torreón and Olympics.com.
- **Phase 2 (from 25/11):** real ties from the rounds "Quarter-finals / Semi-finals / Final" (values seen in api-football), home and away legs, real aggregate, links to the match pages.

Copy:
- Title (54): `Liguilla Apertura 2026: cruces, horarios y pronósticos`
- H1: `Liguilla del Apertura 2026: así quedarían los cruces hoy`
- Hook: « Desde el Apertura 2026 ya no hay play-in: solo los ocho primeros de la tabla general van directo a cuartos de final. Con la tabla al {fecha}, así se jugarían los cuartos… »

**Files:** `scripts/build-liga-mx-rounds.js`, link from `content/local-articles/mx/liguilla-liga-mx-como-funciona.htm` and from the hub, `i18n/seo/mx.json`.

**Expected effect:** captures K4 from October, before the Mexican peak (Nov–Dec), with a URL that is reused every torneo.

### A7. Clásico Tapatío and all 18 clubs

**Exact change** in `config/club-hubs.json`:
- **Derbies:** add `clasico-tapatio` (Chivas 2278 vs Atlas 2283), with page `mx: {slug: "clasico-tapatio-chivas-atlas", name: "Clásico Tapatío"}`. Next match: J11, **10/10 at 19:00 CDMX** (cache).
- **Clubs:** add the 12 missing clubs (ids above; Toluca first, as the current leader). The intros must be **sourced** (`sources[]`, file rule) and set to REVIEW. Club-hub titles follow the existing template: `Toluca: próximos partidos, tabla y pronósticos` (46).
- **Clásico titles**, when the next match is known (placeholder filled from the data): `Clásico Tapatío Chivas vs Atlas: historial y próximo partido` (60).

**Files:** `config/club-hubs.json`, `i18n/parts/clubs.es-mx.json` + `i18n/dict/es-mx.json`, `scripts/build-club-hubs.js` (no change expected), tests `tests/club-hubs*.test.js`.

**Expected effect:**
- every Liga MX match page links to both club pages. Today, 5 of the 9 J9 matches link to no club page: Puebla–Atlante, San Luis–Necaxa, Pachuca–Tijuana, Toluca–Santos, Querétaro–León;
- the Tapatío derby is covered before its peak;
- the evergreen long tail ("atlas próximos partidos", "toluca tabla") is picked up.

### A8. Premier League and MLS in Spanish (for Mexico and the US)

**BLOCKED_DECISION D5** (scope set on 15/09 against "scaled content abuse").

**Exact change.**
- `config/leagues.json`: add `"mx"` to `premier.seoMatchDirs` and `mls.seoMatchDirs`. These become the site's only Spanish pages for these leagues, so A3's aliases also apply (`es-US`, `es`).
- `i18n/seo/mx.json#league.overrides`:
  - `premier`: title `Pronósticos Premier League: partidos, horarios y tabla` (54);
  - `mls`: title `Pronósticos MLS en español: partidos, horarios y tabla` (54), intro stating "horarios del centro de México y del Este de EE. UU.".
- Monitor GSC ("Crawled – currently not indexed"). The 80-word threshold and J+7 noindex already protect against thin pages.

**Expected effect:**
- opens K10/K11: US Hispanic MLS demand, where only Squawka es-US is strong;
- Premier League, which the Mexican media cover by jornada with momios.

### A9. Root routing for Spanish-speaking visitors in the US

**BLOCKED_DECISION D4.** Which offer does a US visitor get on /mx/? MX$199 is roughly half of USD 19.99, which is a price arbitrage, and the CGV and consumer law differ.

**Once decided**, in `lib/lang-routing.js#MULTILINGUAL`, add `["us", [["es", "mx"]]]`. It is generated into `_redirects` by `scripts/build-locales.js#redirectsContent`; never edit `_redirects` by hand. At run time (`lib/market-config.js`), show the USD offer to a US visitor on /mx/ if that is the decision.

**Expected effect:** small for SEO (only the root URL is affected), but consistent with A3 for US visitors who come direct.

### A10. "Pronósticos de futbol hoy / mañana" page

**Exact change.**
- `/mx/pronosticos-hoy.html`, generated by `scripts/seo-pages.js` from the run and the registry, on the **CDMX day** (same logic as A1).
- Liga MX first, then Champions / La Liga / Europa / Premier and MLS (if A8).
- Time in CDMX · ET, links to the match pages, "Análisis gratis del día" on the match with `is_free` (a public field) **without naming the bet**, and "Análisis Pro" on the others.
- A "Mañana" section.
- JSON-LD `ItemList` of `SportsEvent`.

Copy:
- Title (51): `Pronósticos de futbol hoy: Liga MX, Champions y más`
- H1: `Pronósticos de futbol para hoy, {fecha}`
- Hook: « Todos los partidos que IASHARK analiza hoy, con horario del centro de México. Un análisis completo es gratis cada día; los demás son para miembros Pro. Probabilidades, no garantías. +18 »

**Expected effect:** a stable URL for K6 (combined with "Liga MX", or with a date), plus an internal hub.

### A11. /mx/ home

**Exact change.**
1. Keyworded H1 in the source template, with the slogan moved to the subtitle: `Pronósticos de futbol con probabilidades: Liga MX y más`. Check `i18n-manifest.js`: the H1 is shared by the 9 versions, so use a key in `i18n/seo/<dir>.json#home`.
2. `home-list.js` l.219: link to `/mx/match/<id>.html` when the page exists in the version (proposal from `reports/seo-night-2026-09-19.md` §4.3: `leagueNamesData` exposes `seoMatchDirs`).
3. `scripts/build-locales.js#homeSeoBlock`: "Jornada actual", "Liguilla" and "Pronósticos de hoy" links, plus the clásicos.

**Expected effect:**
- the most visible internal link stops pointing to a noindex page;
- the home gets its keyword back and passes authority to the new hubs.

### A12. Official Liga MX table, refreshed daily

**Exact change.**
- In the pipeline (or `scripts/build-club-hubs.js` in the daily run), one call a day to `/standings?league=262&season=2026`.
- `scripts/league-hub-data.js`: prefer `source: "api-football"` when it is less than 36 h old. This gives the "Liga MX: Apertura" group, hence the "Apertura 2026" chip and `{season}` in the titles.

**Files:** `.github/workflows/update-data.yml` or `scripts/build-club-hubs.js`, `scripts/league-hub-data.js`.

**Expected effect:**
- an exact table (the `matchs` extract only covers the analysed matches);
- A6 becomes possible;
- titles are dated by the real season.

### A13. Mexican content unique to /mx/, plus a momios calculator

**Articles** go in `content/local-articles/mx.json` + `content/local-articles/mx/<slug>.htm`, all in **REVIEW**, with verified or derived facts only (titles ≤ 60):

| Article | Title | H1 | Hook |
|---|---|---|---|
| 1 | Momios americanos: cómo leer +150 y -200 (con ejemplos) (55) | Momios americanos: qué significan +150 y -200 | « En México los momios se leen en formato americano. +150 significa que por cada 100 pesos ganarías 150; -200, que necesitas apostar 200 para ganar 100. Así se convierten en probabilidad… » |
| 2 | Altas y bajas en la Liga MX: cómo leer el mercado de goles (58) | idem | If an Apertura 2026 figure is quoted (share of matches with 3+ goals), **compute it from the registry's real results** and date it; otherwise, no figure. |
| 3 | Ambos anotan: qué significa y cómo se estima (44) | Ambos anotan: qué significa y cómo se estima su probabilidad | (none given) |
| 4 | Horarios de la Liga MX en Estados Unidos: ET, CT y PT (53) | (none given) | For US Hispanics. Conversion rules plus a link to the jornada pages, which carry ET. |
| 5 | Clásico Tapatío Chivas vs Atlas: historia y análisis | (none given) | Sources to cite. |
| 6 | Clásico Joven América vs Cruz Azul: historia y análisis | (none given) | The data page exists; the article adds history. |
| 7 | Predicción con IA en la Liga MX: qué calcula un modelo (54) | (none given) | Positions the brand on the SI / Bolavip trend ("la IA predijo") with the honest method: probabilities, data quality, limits. |

**Tool:** `/mx/calculadora-momios.html`, "Calculadora de momios: americanos, decimales y probabilidad" (59).
- Converts American, decimal and implied probability.
- Removes the margin across 2 or 3 outcomes.
- Pure maths, no operator named.
- JSON-LD `WebApplication` + `BreadcrumbList`.
- Linked from the match pages ("¿Cómo leer los momios?") and from article 1.

**Expected effect:** K7, K8, K9 and K12; neutral editorial links (calculators get cited); topical authority unique to /mx/.

### A14. Quick quality fixes (before J10)

- `match.html` l.5 and `joueur.html`: add `data-i18n="nav.home|nav.tools|nav.guides|nav.account"` and `data-i18n-attr="aria-label:geo.nav.aria_label"` on the bottom bar. `bakeI18n` will then translate it on about 53 /mx/ pages (and in the other languages).
- `i18n/dict/es-mx.json` + `i18n/parts/*.es-mx.json`: "Ambos marcan Sí/No" becomes "Ambos anotan: Sí/No", in line with the SEO copy and Mexican usage.
- `legal/mx/methodologie.html`: "rangos de cuotas" becomes "rangos de momios". `mx/a-propos.html`: check that the French helpline block (Joueurs Info Service) is hidden on the mx market; otherwise remove it.
- `/mx/exemple-analyse.html`:
  - remove `mise` (staking tip) from the embedded example data;
  - long term, replace PSG–Monaco with a **real archived** Liga MX analysis (only if one exists; never an invented example).
- Hub header nav (`renderLeagueHub`, `<nav>` in the header): add "Artículos" (`C.articlesHubPath`).

### A15. Differentiate the /mx/ guides from /es/

**Exact change.** For the 3 guides linked from the home (prediction IA, over 2.5, value bet), rewrite for /mx/:
- the intro (Liga MX framing);
- the examples: Liga MX matches, momios **americanos** with conversion, CDMX times;
- the internal links: jornada, clásicos, calculator.

Keep the URLs (no slug change: French slugs are a minor signal, and redirecting 7 × 7 guides is not worth it now).

**Expected effect:** similarity with /es/ falls well below today's 0.89–0.96, so Google has fewer reasons to fold /mx/ into /es/.

### What not to do

- Copy an /es/ page into /mx/ just by changing the currency.
- Target "tabla general", "partidos de hoy" or "Liga MX en vivo" (media and the Google sports box).
- Publish "ambos anotan hoy" or "más de 2.5 hoy" lists built on model probabilities (premium data). A public list of **observed frequencies** ("ambos anotaron en 4 de sus últimos 5") would use public data, but it contradicts the 19/09 visitor view: **BLOCKED_DECISION D6**.
- Affiliate links, bonus codes, bookmaker logos, bought links.
- Show ROI, win rates or "aciertos".

---

## 5. Off-site actions for the owner

### 5.1 Google Search Console (Mexico + US Spanish)

1. A `google-site-verification` meta already sits in the root `index.html`, so a property probably exists; check which one. Add a **Domain** property (DNS) if it is not done yet, then a **URL-prefix** property `https://iashark.com/mx/`, so you have /mx/ data on its own.
2. Submit or confirm: `sitemap.xml` (index). In the `/mx/` property: `sitemap-mx-i18n.xml`, `sitemap-leagues.xml`, `sitemap-clubs.xml`, `sitemap-articles.xml`, `sitemap-matches-i18n.xml`, plus `sitemap-liga-mx.xml` after A4.
3. **Performance** report, two saved views:
   - page contains `/mx/` + Country = **Mexico**;
   - page contains `/mx/` + Country = **United States**.
   
   Custom (regex) query filter: `(?i)pron[oó]stic|predicci|momio|jornada|liguilla|cl[aá]sico|ambos anotan|altas`. Track impressions, CTR and position per cluster K1–K12 every week.
4. **URL inspection** of `/mx/match/1550971.html` (América–Chivas) and `/mx/leagues/liga-mx.html`: read the "Google-selected canonical". If it is /es/, that is F5 confirmed, and a strong argument for D1/A3.
5. **Pages** report: watch "Duplicate, Google chose different canonical than user" (es/mx) and "Crawled – currently not indexed" (match pages, especially if A8 goes ahead).
6. **Keyword Planner** (Google Ads account, no spend): volumes for K1–K12 with location Mexico, then United States, language Spanish. This replaces the volumes that are missing here.
7. **Bing Webmaster Tools** (import from GSC) + IndexNow. Bing carries more weight in the US than in Mexico.

### 5.2 Communities (Mexico and the US), with no selling of picks

- **Reddit:**
  - r/LigaMX: posts giving data (table, "si terminara hoy", history of a clásico) with no link for the first few weeks; follow the self-promotion rules;
  - r/MLS and r/soccer only for real analysis.
- **Facebook fan groups** (América, Chivas, Cruz Azul, Tigres/Rayados, Atlas): only where the rules allow; share the club or clásico pages (data), never "picks".
- **X (Twitter):** #LigaMX, #Apertura2026, #ClasicoNacional, #ClasicoTapatio, #Liguilla. Post the table / clásico / liguilla visuals (from A6/A7) on Thursday and Friday 18–21 h CDMX before each jornada.
- **WhatsApp Channel** "IASHARK México" (a very common format in Mexico): the daily free match and the jornada, with 18+ and Línea de la Vida in the description.
- **Digital PR:** one data story per matchday ("¿Quién llega mejor a la Liguilla según un modelo estadístico?") offered to regional media. The El Informador → La Silla Rota → TV Azteca → ClaroSports → ABC Noticias syndication shows one article can travel to 5+ outlets. Also the fan sites of the Bolavip network (Vamos Azul...), which already publish "la IA predijo". Aim for links to `/mx/liga-mx/liguilla.html` or `/mx/calculadora-momios.html`, never to the subscription page.

### 5.3 TikTok / Instagram / YouTube Shorts in Spanish

- **Platform rules:**
  - TikTok bans gambling promotion in ads and in branded content;
  - organic content that "influences bets" can be classed as "gambling information" and limited.
  
  So stick to **sports analytics and education**: no betting call, no operator link, no code, no screenshot of winnings. Bio: « Estadística de futbol · probabilidades, no garantías · +18 · Línea de la Vida 800 911 2000 ».
- **Formats that fit** (real data only):
  1. "Los números del Clásico en 30 s": form, table, head-to-head, from `/mx/equipos/clasico-*.html`.
  2. "¿Qué significa +150?" (momios americanos, calculator).
  3. "La Liguilla si terminara hoy" (every week from J12, from A6).
  4. "La jornada en 5 datos" (from A4).
  5. "El modelo vs los momios": only on the **free match of the day**, which is already public.
  
  No "hits of the week" or cumulative results recap (LFPC art. 32, and the owner's no-ROI rule).
- **Tools already in the repo:** `remotion-score-template/`, `generate_tiktok_images.js`.
- **Timing:** Thursday–Friday before the jornada, Saturday before the evening games, CDMX time. Spanish captions with Mexican vocabulary (momios, jornada, ambos anotan, altas y bajas).
- As soon as the accounts exist, add them to the Organization's `sameAs` (`scripts/build-locales.js#homeJsonLd`), as the night report suggests.

---

## 6. Owner decisions (BLOCKED_DECISION)

| Code | Question | Recommendation |
|---|---|---|
| D1 | Remove Liga MX from /es/ (301 to /mx/) and label /mx/ `es-US` + `es` for Liga MX | **Yes** (A3) |
| D2 | Public model teaser (favourite or 1X2) on the /mx/ match pages | Owner's call. Largest SEO lever, but it cuts into the Pro value |
| D3 | Static "Momios de referencia" block (Pinnacle, public data) in American format for visitors | Yes if the 19/09 visitor-view rule allows it |
| D4 | Offer for US visitors on /mx/ (MXN or USD) + routing `us` + language `es` to /mx/ | Decide before A9; don't label the payment pages `es-US` before then |
| D5 | Open Premier League and MLS on /mx/ | Yes, with GSC monitoring (A8) |
| D6 | Public observed frequencies (both teams scored / over 2.5 in the last 5) | Secondary; depends on the 19/09 rule |
| D7 (tax/legal) | Mexican IVA (LIVA 18-B I "estadísticas", 18-D RFC + 16 %) and the weekly D-2 notice vs 5-day minimum (LFPC 76 Bis VIII) | Settle before opening MX payments (not SEO, but it blocks the goal) |

---

## Sources (consulted 19/09/2026)

**SERPs and competitors**
- https://www.si.com/es-us/futbol/pronostico-america-vs-chivas-probabilidades-estadisticas-y-prediccion-19-9-2026
- https://www.si.com/es-us/futbol/pronostico-monterrey-vs-cruz-azul-probabilidades-estadisticas-bajas-y-prediccion-ia-19-9-2026
- https://www.informador.mx/deportes/america-vs.-chivas-un-clasico-tan-parejo-que-hasta-los-momios-los-ponen-en-igualdad-20260918-0100.html
- https://www.casasdeapuestas.com/pronosticos/america-chivas-guadalajara-20260920/
- https://gainblers.com/mx/pronosticos/futbol/mexico/liga-mx/pronostico-america-guadalajara-20-09-2026/
- https://vamoscruzazul.bolavip.com/noticias/monterrey-vs-cruz-azul-los-mejores-pronosticos-para-la-j9-del-apertura-2026-de-la-liga-mx
- https://www.365scores.com/es-mx/football/league/liga-mx-141/insights
- https://www.forebet.com/es/predicciones-mexico/liga-mx
- https://www.hispanosnba.com/mx/pronosticos-liga-mx/
- https://www.postadeportes.com/futbol/liga-mx/liga-mx-nuestras-predicciones-para-apostar-en-esta-jornada-10/vl2040245
- https://www.mediotiempo.com/futbol/liga-mx/partidos-jornada-9-liga-mx-horarios-canal-transmision-juegos-apertura-2026
- https://www.espn.com.mx/futbol/mexico/nota/_/id/17271146/liga-mx-jornada-9-como-ver-horarios-partidos-de-hoy-apertura-2026
- https://www.flashscore.com.mx/noticias/futbol-premier-league-premier-league-pronosticos-mejores-apuestas-y-momios-jornada-38/Kx5YBFGq/
- https://www.squawka.com/us-es/news/mls/inter-miami-vs-san-diego-fc-pronostico-mls-09-20-26/
- https://www.forebet.com/es/predicciones-para-hoy/ambos-equipos-anotaran
- https://www.prodeai.com/
- https://www.espn.com.mx/hotpicks/

**Momios and vocabulary**
- https://www.caliente.mx/mas/ayuda/deportes/que-es-un-momio/
- https://www.caliente.mx/mas/ayuda/deportes/puedo-cambiar-el-formato-en-el-que-se-muestran-los-momios/
- https://calientecasino.com.mx/deportes/apuesta-a-los-totales/
- https://ljz.mx/14/10/2025/apuestas-altas-y-bajas-en-la-liga-mx-como-funcionan-y-cuando-aprovechar-el-over-under/

**Liga MX format**
- https://www.tudn.com/futbol/liga-mx/hay-play-in-o-repechaje-en-la-liga-mx-apertura-2026
- https://www.elsiglodetorreon.com.mx/noticia/2026/liga-mx-habra-play-in-en-el-apertura-2026.html
- https://www.olympics.com/es/noticias/liga-mx-clausura-2026-cuando-empieza-formato-liguilla
- https://quinielero.mx/quiniela-liga-mx

**US audience**
- https://www.goal.com/en-us/lists/liga-mx-remains-the-most-watched-soccer-league-on-u-s-television/blt2eb5436af5948721
- https://corporate.televisaunivision.com/press/2025/11/13/televisaunivision-dominates-club-soccer-ratings-with-liga-mx-leading-into-exciting-november-postseason/

**Regulation**
- https://www.ordenjuridico.gob.mx/Documentos/Federal/html/wo88470.html (Reglamento LFJS)
- https://www.diputados.gob.mx/LeyesBiblio/pdf/109.pdf (LFJS)
- https://www.vanguardia.com/mundo/2026/08/20/asi-cambio-la-regulacion-de-apuestas-y-casinos-en-mexico-en-2026/
- https://www.infobae.com/mexico/2026/09/03/segob-va-contra-lavado-de-dinero-en-casinos-y-centros-de-apuestas-modificaran-ley-federal/
- https://sccgmanagement.com/sccg-articles/2026/08/11/diputado-mexicano-propone-reforma-a-ley-federal-de-juegos-para-definir-ludopatia-y-regular-apuestas-en-linea/
- https://www.gtlaw.com/en/insights/2025/12/reformas-a-la-ley-federal-de-proteccion-al-consumidor (LFPC 76 Bis VIII–IX)
- https://www.amcp.mx/decreto-por-el-que-se-adicionan-las-fracciones-viii-y-ix-al-articulo-76-bis-de-la-ley-federal-de-proteccion-al-consumidor-en-materia-de-cancelacion-de-suscripciones-y-membresias-con-cobro-recurrente/
- https://mley.mx/LIVA/articulo/18-b/ (LIVA 18-B)
- https://www.contadoresmexico.org.mx/Boletin/IVA-plataformas-digitales-operaciones-residentes-extranjero (18-D obligations)

**Platforms**
- https://ads.tiktok.com/help/article/tiktok-ads-policy-gambling-and-games
- https://track360.io/blog/meta-tiktok-gambling-ad-policy-compliance-operator-guide-2026
