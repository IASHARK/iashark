# IASHARK — Registre des marchés

Généré à partir de [`lib/market-registry.js`](lib/market-registry.js) (source de vérité — ce document décrit le code, il ne le remplace pas). Régénérer après tout ajout/modification de marché. Statuts vérifiés par [`tests/market-registry.test.js`](tests/market-registry.test.js).

Règle absolue (MASTER V2.1 §8, §10.AN) : **l'UI n'affiche une probabilité IASHARK que pour un marché `MODELLED_AND_VALIDATED`** (ou `MODELLED_EXPERIMENTAL` avec étiquette explicite « expérimental »). Un marché ne devient `MODELLED_AND_VALIDATED` que s'il a un `model_function` ET un `resolver_function` réels, tous deux testés.

## Résumé (2026-08-29)

| Statut | Nombre |
|---|---|
| `MODELLED_AND_VALIDATED` | 6 |
| `MODELLED_EXPERIMENTAL` | 5 |
| `NOT_SUPPORTED` | 5 |

## MODELLED_AND_VALIDATED

Modèle + resolver + tests existent tous les trois, réellement vérifiés (`npm test`).

| id | Marché | Modèle | Resolver |
|---|---|---|---|
| `MATCH_WINNER` | 1X2 | `score-matrix.js#deriveMarketsFromMatrix` | `resolvers.js#resolveMarketWin` |
| `DOUBLE_CHANCE` | 1X / X2 / 12 | `score-matrix.js` (dérivé de p1/pN/p2) | `resolvers.js` |
| `DRAW_NO_BET` | DNB | `score-matrix.js` | `resolvers.js` (VOID sur nul) |
| `TOTAL_GOALS` | O/U 0.5 à 6.5 | `score-matrix.js` | `resolvers.js` (regex générique) |
| `BTTS` | Les deux marquent | `score-matrix.js` / `models.js#calcPoissonProbs` | `resolvers.js` |
| `HANDICAP_WHOLE_HALF` | Handicap lignes .0/.5 | dérivé du score | `resolvers.js` (WIN/LOSS/VOID) |

**Nuance importante** : `DRAW_NO_BET` et les lignes `TOTAL_GOALS` 0.5/4.5/5.5/6.5 sont *nouvelles cette session* — le code est réel et testé, mais **aucune n'a encore été utilisée en production ni observée sur un vrai match**. Elles satisfont la barre technique de `MODELLED_AND_VALIDATED` (modèle + resolver + tests) mais pas encore la barre `10.AO` de calibration mesurée sur données réelles. Seules `MATCH_WINNER`, `TOTAL_GOALS` (lignes 1.5/2.5/3.5 historiques), `BTTS`, `DOUBLE_CHANCE`, `HANDICAP_WHOLE_HALF` ont un historique réel de production (`historique.json`).

## MODELLED_EXPERIMENTAL

Le modèle existe et est testé mathématiquement, mais aucun resolver n'existe encore — impossible de marquer WIN/LOSS automatiquement.

| id | Marché | Ce qui manque |
|---|---|---|
| `TEAM_TOTALS` | Totaux par équipe | resolver |
| `CLEAN_SHEET` | Clean sheet | resolver |
| `WIN_TO_NIL` | Gagne sans encaisser | resolver |
| `EXACT_SCORE` | Score exact | resolver (le pipeline affiche déjà des top-scores publics non reliés à un vrai resolver) |
| `GOAL_BANDS` | Bandes de buts (0-1/2-3/4-5/6+) | resolver |

## NOT_SUPPORTED

| id | Marché | Raison |
|---|---|---|
| `HANDICAP_QUARTER` | Handicap asiatique .25/.75 | **Bug découvert et corrigé cette session** : l'ancien code aurait résolu une ligne .25/.75 comme un WIN/LOSS complet, alors que le vrai règlement nécessite un demi-gain/demi-perte. Le resolver refuse maintenant explicitement (`null`) plutôt que de mal compter. Réactivation nécessite d'étendre le contrat de retour de `resolveMarketWin` pour supporter une valeur fractionnaire. |
| `HALF_TIME_MARKETS` | HT 1X2/O-U/BTTS | Nécessite un modèle temporel séparé (§10.W), aucune distribution par tranche horaire collectée aujourd'hui. |
| `CORNERS` | Marchés corners | Modèle séparé obligatoire (§10.X), pas de collecte de données corners par équipe aujourd'hui. |
| `CARDS` | Marchés cartons | Modèle séparé obligatoire (§10.Y), idem. |
| `PLAYER_PROPS` | Buteur/tirs/cartons joueur | Nécessite Player Impact Engine (§10.G) + Lineup Strength Engine (§10.J), aucun des deux construit. |

## Prochaines étapes concrètes

1. Brancher `DRAW_NO_BET` et les nouvelles lignes `TOTAL_GOALS` dans le pipeline de production (`allMarkets` dans `update-data.yml`) pour commencer à accumuler un historique réel.
2. Écrire les resolvers manquants pour `TEAM_TOTALS`/`CLEAN_SHEET`/`WIN_TO_NIL`/`EXACT_SCORE`/`GOAL_BANDS` — triviaux (comparaison directe au score final), mais non faits.
3. `HANDICAP_QUARTER` : étendre `resolveMarketWin` pour retourner une fraction (ex: `-0.5`/`0.5`) au lieu de seulement `true`/`false`/`'void'`/`null`, puis adapter les deux call sites du pipeline (`updateHistorique`) qui consomment aujourd'hui un booléen strict.
4. Corners/Cards/Player props : nécessitent une collecte de données préalable (nouveaux appels API-Football) avant tout modèle — voir `IASHARK_V2_EXECUTION_STATE.md`, section budget quota.
