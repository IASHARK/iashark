# IASHARK V2 — État d'exécution

Mis à jour à chaque jalon, comme demandé. Statuts honnêtes uniquement — rien n'est marqué `PASS`/`EXECUTED` sans preuve vérifiée dans ce document ou dans un commit référencé.

## Contrainte à connaître avant de lire la suite

**Je n'ai pas accès à `APISPORTS_KEY`** (ni aux autres secrets GitHub Actions du pipeline) dans cette session — ce sont des secrets de dépôt utilisés uniquement à l'exécution du workflow sur l'infrastructure GitHub, jamais exposés à une session Claude Code. Concrètement, je ne peux pas faire d'appels directs à api-football pour constituer moi-même un dataset historique massif, ni exécuter un vrai backtest walk-forward à grande échelle depuis cette session. Ce que je peux faire : écrire le code du moteur, écrire de vrais tests unitaires exécutables, backtester sur les **288-291 prédictions réellement résolues déjà dans `historique.json`** (échantillon réel mais limité, généré par l'ancien pipeline — pas une validation du nouveau moteur), et documenter clairement `FORWARD_VALIDATION_ONLY` pour tout le reste. Je ne fabriquerai pas de métriques de calibration/backtest sur des données que je n'ai pas.

## Statuts

| Statut | Valeur | Preuve |
|---|---|---|
| P0 | 12/15 FIXED | `FINAL_360_AUDIT.md`, commits iashark-v2 |
| P1 | 12/16 FIXED | idem (P1-15 tests automatisés terminé ce jalon) |
| ENGINE_IMPLEMENTED | PARTIAL — cœur existant (Poisson/DC/MC/Shin/Élo) vérifié correct ; nouveaux sous-moteurs (§10.D-Z du MASTER) NOT_STARTED | — |
| BACKTEST_EXECUTED | PARTIAL — sur `historique.json` uniquement (échantillon réel, 288-291 paris, ancien pipeline) | ce document, section Backtest |
| CALIBRATION_EXECUTED | PARTIAL — calibration observée (confiance inversée) documentée, pas de recalibration exécutée | `IASHARK_PIPELINE_AUDIT.md` §6 |
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

## BLOCKED_EXTERNAL

- Paiement Stripe réel (clés, webhook) — l'utilisateur s'en charge à la fin.
- `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_URL` comme secrets GitHub Actions — toujours pas ajoutés (pas d'accès `gh` CLI dans cette session).
- Accès direct à `APISPORTS_KEY` — je ne peux pas constituer un dataset historique massif moi-même depuis cette session.
- `auth_leaked_password_protection` désactivé côté Supabase Auth — réglage dashboard, aucun outil MCP disponible pour le configurer.
- Vraie exécution CI sur l'infrastructure GitHub (le workflow `.github/workflows/tests.yml` est créé et son étape d'extraction a été testée localement à l'identique — mais je ne peux pas observer un run GitHub Actions réel depuis cette session, seulement l'exécution locale équivalente).
- `eloWinProb` n'a PAS été branché sur `lib/models.js` : la version du pipeline a une signature réelle plus riche (`eloH,eloA,vdH,mdHdom,forceNeutral` — avantage domicile variable + neutralisation terrain neutre) que ma version simplifiée testée (`eloH,eloA,homeAdvantage`). Remplacer aurait changé un comportement de production sans preuve d'équivalence — laissé inline volontairement, `lib/models.js` garde une version simplifiée comme brique testée pour un futur refactor plus complet du calcul Elo.

## FORWARD_VALIDATION_ONLY

- Toute feature du moteur V2.1 (§10.D à §10.Z du MASTER) qui serait implémentée sans dataset historique suffisant pour la valider par walk-forward : sa collecte peut démarrer immédiatement (schéma §5 du MASTER), mais sa performance ne sera mesurable qu'après plusieurs semaines/mois de collecte réelle.

---

*Journal détaillé ci-dessous, mis à jour à chaque jalon.*

## Journal

- 2026-08-29 : création de ce document. Début P1-15 (tests automatisés).
- 2026-08-29 : P1-15 terminé. `lib/models.js`, `lib/betting.js`, `lib/resolvers.js`, `lib/roi.js` créés (extraction fidèle des fonctions du pipeline, formules vérifiées ligne à ligne contre l'original) + `tests/*.test.js` (61 tests `node --test`, 0 échec). `update-data.yml` refactoré pour `require()` ces modules au lieu de dupliquer le code inline (poissonProb/calcPoissonProbs/dixonColesCorr/calcDixonColesProbs/calcMonteCarlo/shinProbabilities/fractionalKelly/resolveMarketWin supprimés en double, remplacés par les imports) — `node --check` reconfirmé après refactor. Bonus découvert au passage : la version testée de `fractionalKelly` corrige un bug latent de l'original (cote=1 exactement pouvait produire la chaîne littérale `"NaN"` au lieu de `null`) et `resolveMarketWin` refuse maintenant explicitement des scores `null`/`NaN` au lieu de pouvoir accidentellement évaluer `null===null` comme un nul valide. `package.json` + `.github/workflows/tests.yml` créés (CI sur push/PR vers main et iashark-v2, exit non-zéro natif, pas de `exit 0`/`\|\| true`).
