# IASHARK — Politique anti-leakage (MASTER V2.1 §10.B)

## Principe

`available_at` est critique (§10.B) : une prédiction générée à un instant T ne peut utiliser qu'une information réellement disponible avant T. Exemples interdits explicitement par le MASTER : utiliser une lineup confirmée dans un backtest T-24h, utiliser des stats de match qui n'existaient qu'après le coup d'envoi, utiliser une blessure enregistrée après le match, utiliser la closing odd pour simuler une analyse publiée 48h avant.

## État réel aujourd'hui

**Il n'existe pas encore de feature store versionné avec `available_at`/`observed_at` par valeur** (§10.B le demande explicitement — c'est un chantier non commencé). Ce document liste où le risque de leakage existe réellement dans le pipeline actuel, et ce qui a été fait pour le limiter.

### Où le leakage est structurellement évité

- **Génération quotidienne** : le pipeline (`update-data.yml`, cron `0 6 * * *`) génère les prédictions pour les matchs du jour AVANT leur coup d'envoi, en un seul passage synchrone (toutes les données interrogées — stats, cotes, blessures, H2H — sont par construction celles disponibles au moment du run, jamais des données post-match). Aucune donnée résultat n'entre dans le calcul de probabilité.
- **`updateHistorique()`** : la résolution (win/loss/void) est un processus **séparé**, qui lit le score final APRÈS le match pour marquer une prédiction déjà écrite — jamais l'inverse. Le score ne peut jamais influencer `matchObj.p1/pn/p2` puisque `matchObj` est construit avant que `updateHistorique()` s'exécute sur les matchs passés.
- **`lib/team-strength.js#computeDynamicTeamStrength`** (nouveau ce jalon) : accepte un `referenceDate` explicite et exclut tout match dont la date est postérieure à `referenceDate` (`if(daysAgo<0) continue;`) — testé (`tests/team-strength.test.js`, "anti-leakage - un match dans le futur par rapport a referenceDate est ignore"). C'est la seule brique du moteur avec une protection anti-leakage **testée explicitement**.

### Où le risque existe encore (non testé/non protégé formellement)

- **`matchCache`** : un match verrouillé (déjà généré) n'est jamais recalculé, même si de nouvelles données arrivent (lineup confirmée, blessure de dernière minute) — protège contre un type de leakage inverse (changer une prédiction déjà publiée) mais empêche aussi les snapshots progressifs voulus par §10.C (`SNAPSHOT_T72`/`T24`/`T6`/`T90`/`LINEUP`/`CLOSE`) — le pipeline actuel ne produit qu'un seul snapshot `'prediction'` par match (voir `match_snapshots`, migration `0004`), pas la séquence complète.
- **H2H (`getH2H`)** : retourne les confrontations passées via `/fixtures?h2h=`, qui pourrait techniquement inclure un match très récent si l'API le renvoie avant que le pipeline ne tourne — pas de garde explicite sur la date du dernier H2H retourné vs la date du match analysé. Risque faible en pratique (H2H récents rares dans les données courantes) mais non testé.
- **`closing-odds.yml`** : capture les cotes de clôture séparément (`snapshot_type='closing'`), correctement isolées du snapshot `'prediction'` — mais rien n'empêche aujourd'hui qu'un futur backtest confonde les deux types de snapshot par erreur de requête SQL. À documenter/imposer via une contrainte ou une vue dédiée quand le walk-forward backtest engine (§10.AC) sera construit.

## Prochaine étape concrète

Construire le feature store minimal (§10.B) — au moins `fixture_id`, `feature_name`, `feature_value`, `observed_at`, `available_at` — avant d'implémenter un vrai walk-forward backtest (§10.AC), sinon toute métrique de performance mesurée sur les features actuelles serait invérifiable a posteriori (impossible de prouver qu'aucune fuite n'a eu lieu sans horodatage explicite par valeur).
