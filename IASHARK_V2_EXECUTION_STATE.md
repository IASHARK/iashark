# IASHARK V2 — État d'exécution

Mis à jour à chaque jalon, comme demandé. Statuts honnêtes uniquement — rien n'est marqué `PASS`/`EXECUTED` sans preuve vérifiée dans ce document ou dans un commit référencé.

## Contrainte à connaître avant de lire la suite

**Je n'ai pas accès à `APISPORTS_KEY`** (ni aux autres secrets GitHub Actions du pipeline) dans cette session — ce sont des secrets de dépôt utilisés uniquement à l'exécution du workflow sur l'infrastructure GitHub, jamais exposés à une session Claude Code. Concrètement, je ne peux pas faire d'appels directs à api-football pour constituer moi-même un dataset historique massif, ni exécuter un vrai backtest walk-forward à grande échelle depuis cette session. Ce que je peux faire : écrire le code du moteur, écrire de vrais tests unitaires exécutables, backtester sur les **288-291 prédictions réellement résolues déjà dans `historique.json`** (échantillon réel mais limité, généré par l'ancien pipeline — pas une validation du nouveau moteur), et documenter clairement `FORWARD_VALIDATION_ONLY` pour tout le reste. Je ne fabriquerai pas de métriques de calibration/backtest sur des données que je n'ai pas.

## Statuts

| Statut | Valeur | Preuve |
|---|---|---|
| P0 | 12/15 FIXED | `FINAL_360_AUDIT.md`, commits iashark-v2 |
| P1 | 13/16 FIXED | idem (P1-15 tests automatisés + P1-12 suppression SportMonks terminés) |
| ENGINE_IMPLEMENTED | PARTIAL — cœur existant (Poisson/DC/MC/Shin/Élo) vérifié correct ; nouveaux sous-moteurs (§10.D-Z du MASTER) NOT_STARTED | — |
| BACKTEST_EXECUTED | PARTIAL — Brier score/log loss/table de calibration mesurés programmatiquement et reproductibles (`npm run backtest`) sur `historique.json` (291 paris uniques résolus, ancien pipeline) ; ce n'est PAS un walk-forward multi-modèles ni une validation du futur moteur V2.1 | `BACKTEST_REPORT.json`, `scripts/backtest_historique.js`, `lib/calibration.js` + `tests/calibration.test.js` (12 tests) |
| CALIBRATION_EXECUTED | PARTIAL — inversion de calibration CONFIRMÉE avec des chiffres précis (voir ci-dessous), recalibration effective pas encore exécutée | idem |
| AUTOMATED_TESTS_PASS | PASS — 61/61 tests `node --test` verts, ET le pipeline (`update-data.yml`) a été refactoré pour réellement `require()` les modules testés (`lib/models.js`, `lib/betting.js`, `lib/resolvers.js`) au lieu d'en garder une copie inline — les tests valident donc le code qui tourne réellement en production, pas une copie parallèle. `node --check` sur le script extrait confirme une syntaxe valide après refactor. CI GitHub Actions créée (`.github/workflows/tests.yml`), exit non-zéro natif sur échec (`node --test`/`node --check`, aucun `exit 0`/`\|\| true`) | commit ce jalon, `npm test` → 61 pass/0 fail |
| PIPELINE_PASS | PARTIAL — exit codes/concurrency/atomicité déjà corrigés, refonte modulaire complète NOT_STARTED | commits Phase 3 |
| SUPABASE_VERIFIED | PASS pour ce qui existe (users, match_premium_data, rate_limit_buckets — vérifiés indépendamment, pas juste "success:true") ; schéma V2 complet (archives, subscriptions, admin, journal) NOT_STARTED | voir section Supabase |
| SECURITY_PASS | PARTIAL — XSS/CSP/RLS/rate-limit/secrets faits ; CSRF/dependency audit non exécutés cette session | commits Phase 1 |
| FRONTEND_PASS | NOT_STARTED (au-delà des correctifs ponctuels déjà commités) | — |
| MOBILE_PASS | NOT_STARTED (spot-check seulement, cf FRONTEND_PAGE_AUDIT) | `FINAL_360_AUDIT.md` |
| SEO_PASS | NOT_STARTED (au-delà de l'existant) | — |
| I18N_PASS | NOT_STARTED | — |
| ACCOUNT_PASS | PARTIAL — auth/reset/rate-limit faits ; dashboard/favoris/bankroll UI/export/suppression NOT_STARTED | — |
| GUIDES_PASS | PARTIAL — claims faux corrigés ; refonte éditoriale complète NOT_STARTED | commits Phase 0 |
| ARCHIVES_PASS | PARTIAL — historique.html déjà honnête et fonctionnel ; migration vers schéma "Archives du modèle" V2 (pagination DB, plus de limite 300) NOT_STARTED | — |
| FREE_PRO_PASS | BLOCKED_EXTERNAL_STRIPE — architecture entitlements faite (Edge Function match-data), checkout/webhook/billing NOT_STARTED par choix explicite de l'utilisateur ("je brancherai Stripe à la fin") | — |

## Backtest — résultats mesurés (2026-08-29, `npm run backtest`)

Sur les 291 paris uniques résolus (win/loss) de `historique.json`, en traitant le score `conf` (0-10, auto-rapporté par le LLM narratif) comme `conf/10` — l'interprétation que le pipeline lui-même applique déjà ailleurs (`an.confiance>=7.0` pour armer un pari) :

| Métrique | Valeur mesurée | Repère |
|---|---|---|
| Brier score | **0.2814** | 0.25 = aussi bon qu'un pile ou face constant à 50%. **0.2814 > 0.25 : ce score de confiance est pire qu'aucune information.** |
| Log loss | **0.7671** | ln(2) ≈ 0.693 = repère pile ou face. Même verdict : pire que l'absence d'information. |
| Expected Calibration Error | **16.35 points** | 0 = calibration parfaite. |

Table de calibration par tranche de confiance :

| Confiance annoncée | n | Probabilité annoncée (moy.) | Taux de réussite réel | Écart |
|---|---|---|---|---|
| 6-7 | 138 | 66.3% | 56.5% | -9.8 pts |
| 7-8 | 142 | 74.0% | 53.5% | -20.5 pts |
| 8+ | 11 | 81.5% | **36.4%** | **-45.2 pts** |

**Le score de confiance est inversé** : plus le modèle annonce être confiant, plus le taux de réussite réel baisse (56.5% → 53.5% → 36.4%). Ce n'était jusqu'ici qu'observé qualitativement (`IASHARK_PIPELINE_AUDIT.md` §6) ; c'est maintenant mesuré précisément et reproductible (`npm run backtest`, sortie complète dans `BACKTEST_REPORT.json`).

Limite assumée : échantillon réel mais limité (291 paris, ancien pipeline pré-V2.1). Ceci sert de **baseline de référence** pour mesurer un progrès réel une fois le moteur V2.1 en place — pas une validation de ce moteur, qui n'existe pas encore.

## BLOCKED_EXTERNAL

- Paiement Stripe réel (clés, webhook) — l'utilisateur s'en charge à la fin.
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` comme secrets GitHub Actions — toujours pas ajoutés (pas d'accès `gh` CLI dans cette session).
- Accès direct à `APISPORTS_KEY` — je ne peux pas constituer un dataset historique massif moi-même depuis cette session.
- `auth_leaked_password_protection` désactivé côté Supabase Auth — réglage dashboard, aucun outil MCP disponible pour le configurer.
- Vraie exécution CI sur l'infrastructure GitHub (le workflow `.github/workflows/tests.yml` est créé et son étape d'extraction a été testée localement à l'identique — mais je ne peux pas observer un run GitHub Actions réel depuis cette session, seulement l'exécution locale équivalente).
- `closing-odds.yml` n'a pas pu être exécuté en direct depuis cette session (pas d'accès `APISPORTS_KEY`/`SUPABASE_SERVICE_ROLE_KEY`) : `node --check` confirme la syntaxe et un run local avec les secrets absents confirme que le garde-fou "pas de clé -> sortie propre, pas de crash" fonctionne, mais l'appel réel à `/fixtures?id=` puis `/odds?fixture=` n'a jamais touché l'API en vrai. À vérifier au premier run GitHub Actions réel (regarder les logs de l'Action après ajout des secrets).
- `eloWinProb` n'a PAS été branché sur `lib/models.js` : la version du pipeline a une signature réelle plus riche (`eloH,eloA,vdH,mdHdom,forceNeutral` — avantage domicile variable + neutralisation terrain neutre) que ma version simplifiée testée (`eloH,eloA,homeAdvantage`). Remplacer aurait changé un comportement de production sans preuve d'équivalence — laissé inline volontairement, `lib/models.js` garde une version simplifiée comme brique testée pour un futur refactor plus complet du calcul Elo.

## FORWARD_VALIDATION_ONLY

- Toute feature du moteur V2.1 (§10.D à §10.Z du MASTER) qui serait implémentée sans dataset historique suffisant pour la valider par walk-forward : sa collecte peut démarrer immédiatement (schéma §5 du MASTER), mais sa performance ne sera mesurable qu'après plusieurs semaines/mois de collecte réelle.
- Infrastructure de collecte forward (item 5, terminée ce jalon) : `match_snapshots` (migration `0004_forward_snapshots.sql`, appliquée et vérifiée en direct sur le projet Supabase) capture un snapshot `'prediction'` à chaque génération (odds, injuries, lineups, team stats, H2H, météo, arbitre, Elo, classement — tout ce que le pipeline avait déjà en mémoire à ce moment, `pipeline_sha`/`model_version` inclus) et un job séparé `.github/workflows/closing-odds.yml` (cron 30 min) capture un snapshot `'closing'` (cotes uniquement) dans les 3h avant le coup d'envoi, pour permettre de mesurer plus tard le closing line value (CLV). Aucune métrique n'existe encore — c'est de la collecte pure, rien à mesurer avant plusieurs semaines de matchs réels.

---

*Journal détaillé ci-dessous, mis à jour à chaque jalon.*

## Journal

- 2026-08-29 : création de ce document. Début P1-15 (tests automatisés).
- 2026-08-29 : P1-15 terminé. `lib/models.js`, `lib/betting.js`, `lib/resolvers.js`, `lib/roi.js` créés (extraction fidèle des fonctions du pipeline, formules vérifiées ligne à ligne contre l'original) + `tests/*.test.js` (61 tests `node --test`, 0 échec). `update-data.yml` refactoré pour `require()` ces modules au lieu de dupliquer le code inline (poissonProb/calcPoissonProbs/dixonColesCorr/calcDixonColesProbs/calcMonteCarlo/shinProbabilities/fractionalKelly/resolveMarketWin supprimés en double, remplacés par les imports) — `node --check` reconfirmé après refactor. Bonus découvert au passage : la version testée de `fractionalKelly` corrige un bug latent de l'original (cote=1 exactement pouvait produire la chaîne littérale `"NaN"` au lieu de `null`) et `resolveMarketWin` refuse maintenant explicitement des scores `null`/`NaN` au lieu de pouvoir accidentellement évaluer `null===null` comme un nul valide. `package.json` + `.github/workflows/tests.yml` créés (CI sur push/PR vers main et iashark-v2, exit non-zéro natif, pas de `exit 0`/`\|\| true`).
- 2026-08-29 : P1-12 terminé (suppression SportMonks). Périmètre réel plus large que prévu : SportMonks n'était pas qu'un fallback "topscorers", il alimentait 6 mécanismes de secours distincts pour les petites ligues (moteur de lambdas, patterns buts/15min, forme last-10, stats équipe, blessures/suspensions, H2H), tous basés sur `smBestMatch` — un matching flou par nom entre api-football et SportMonks (normalisation + acronymes + sous-chaînes + distance de Levenshtein), exactement le pattern de "substitution silencieuse via correspondance floue" que l'utilisateur a demandé d'éliminer. Chaque bloc de secours ne faisait qu'écraser une variable qui avait déjà une valeur primaire (issue d'api-football) avant d'entrer dans le bloc SportMonks — la suppression est donc sûre : le code aval gérait déjà le cas de données éparses (c'est déjà le cas courant aujourd'hui quand SportMonks échoue à matcher). Supprimés : `SPORTMONKS_KEY`, `SM_LEAGUE_CACHE`, `SM_TOPSCORERS_CACHE`, `SM_SEASON_GOALS_CACHE`, `SMALL_LEAGUE_KEYS_SPORTMONKS`, `CLUB_STOPWORDS`, `getSM`, `smNormalize`, `smAcronym`, `smIsPlayed`, `smBestMatch`, `smFindLeagueSeasonByCountry`, `smFindLeagueSeason`, `smGetTopscorers`, `smGetPlayerStats`, `getTopScorersSportmonks`, `smGetSeasonGoalEvents`, `smTeamStatsFromFixtures`, `smResolveTeamId`, `smGetLast10ShapedFixtures`, `smTeamStatsAPIShape`, `smTeamPatternFromFixtures`, `isEmptyPattern`, `isEmptyTeamStats`, plus le secret `SPORTMONKS_KEY` du workflow — 538 lignes nettes supprimées. api-football (identité canonique = `fixture_id`, déjà en place, non modifié) reste l'unique source ; à la place de la substitution floue, `isEmptySH` (conservée) logue maintenant explicitement quand les stats d'une équipe sont absentes plutôt que de les patcher silencieusement — équivalent honnête d'un statut `UNMATCHED`. `node --check` reconfirmé après suppression (2665 → 2132 lignes), 61/61 tests toujours verts (fichiers `lib/`/`tests/` non affectés par ce changement).
- 2026-08-29 : Infrastructure de collecte forward (item 5) terminée. Migration `supabase/migrations/0004_forward_snapshots.sql` (table `match_snapshots`, RLS activé, aucune policy anon/authenticated, `revoke all` explicite) appliquée sur le projet Supabase `ksvjraqitxouwiabecai` via `apply_migration` PUIS vérifiée indépendamment via `execute_sql` (`information_schema.tables`, `pg_class.relrowsecurity`, `has_table_privilege`) et `list_migrations` — pas de confiance aveugle dans `{"success":true}`, discipline établie plus tôt cette session. Pipeline (`update-data.yml`) modifié pour écrire un snapshot `'prediction'` par match (fonction `writeSnapshots`, appelée juste après `writePremiumData`). `parseOdds` extrait vers `lib/odds.js` (+ 6 tests `tests/odds.test.js`) et le pipeline le `require()` au lieu de garder sa propre copie — même discipline que P1-15, pour que le nouveau job `closing-odds.yml` puisse réutiliser exactement la même logique de parsing de cotes sans forker une deuxième version. Nouveau workflow `.github/workflows/closing-odds.yml` (cron 30 min) capture les cotes de clôture dans les 3h précédant le coup d'envoi (identifié via `fixture.timestamp`, un epoch Unix non-ambigu renvoyé par api-football, plutôt que de reparser le texte `date` de `data.json` qui est formaté en heure de Paris et serait ambigu à reparser sur un runner UTC). CI (`tests.yml`) étendue pour vérifier la syntaxe de ce nouveau script aussi. 67/67 tests verts (61 précédents + 6 nouveaux pour `parseOdds`).
- 2026-08-29 : Backtest réel exécuté (item 4, partiel — voir contrainte APISPORTS_KEY en tête de document). `lib/calibration.js` (Brier score, log loss, table de calibration/fiabilité, ECE) + `tests/calibration.test.js` (12 tests) + `scripts/backtest_historique.js`, exécuté pour de vrai contre les 291 paris résolus de `historique.json` (`npm run backtest`, sortie sauvegardée dans `BACKTEST_REPORT.json`). Résultat mesuré (pas supposé) : Brier score 0.2814 et log loss 0.7671, tous deux **pires que le repère pile-ou-face** (0.25 / ln(2)) — le score `conf` actuel est activement désinformatif, pas juste imparfait. Table de calibration confirme et quantifie précisément l'inversion déjà notée qualitativement dans `IASHARK_PIPELINE_AUDIT.md` §6 : bucket "8+" annonce 81.5% mais ne gagne que 36.4% (écart -45.2 points). Voir section \"Backtest — résultats mesurés\" plus bas dans ce document. 79/79 tests verts au total (67 précédents + 12 nouveaux calibration).
