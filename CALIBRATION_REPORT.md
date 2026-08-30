# IASHARK — Rapport de calibration (MASTER V2.1 §10.S, §10.AO)

Résultats **mesurés**, pas supposés. Régénérer avec `npm run backtest` (source : `scripts/backtest_historique.js`, sortie complète dans `BACKTEST_REPORT.json`).

## Portée et limite

Mesuré sur les 291 paris uniques déjà résolus (win/loss) dans `historique.json`, produits par **l'ancien pipeline** (avant les fixes de cette session : Kelly réel, edge réel, décision déterministe). Ce n'est ni un walk-forward (§10.AC) ni une validation du moteur actuel — c'est une **baseline de référence**, la seule mesure honnête possible sans accès à `APISPORTS_KEY` pour collecter un nouveau dataset depuis cette session.

## Résultat (2026-08-29)

| Métrique | Valeur | Repère pile-ou-face | Verdict |
|---|---|---|---|
| Brier score | 0.2814 | 0.25 | **Pire que l'absence d'information** |
| Log loss | 0.7671 | ln(2) ≈ 0.693 | **Pire que l'absence d'information** |
| Expected Calibration Error | 16.35 points | 0 | Inversion significative |

## Table de calibration

| Confiance annoncée (`conf` legacy, LLM) | n | Probabilité annoncée | Taux de réussite réel | Écart |
|---|---|---|---|---|
| 6-7 | 138 | 66.3% | 56.5% | -9.8 pts |
| 7-8 | 142 | 74.0% | 53.5% | -20.5 pts |
| 8+ | 11 | 81.5% | 36.4% | **-45.2 pts** |

**Inversion monotone** : plus le score de confiance était haut, plus le taux de réussite réel baissait. Voir `IASHARK_V2_EXECUTION_STATE.md` pour l'analyse de cause : le champ `conf` était l'auto-évaluation subjective du LLM, corrigée au jalon suivant (voir `MODEL_ARCHITECTURE.md`).

## Comparaison OLD_PIPELINE vs MARKET_IMPLIED_PROBABILITY_PROXY (2026-08-29, `npm run backtest`)

**Important — lire avant d'interpréter** : cette comparaison n'est **PAS** OLD_PIPELINE vs le pipeline déterministe réel (`lib/decision.js` + `calcFinalProbs`). `historique.json` ne stocke aucune probabilité modèle brute par prédiction — seulement `conf` (confiance LLM) et `cote` (cote bookmaker). Reconstituer ce qu'aurait produit le nouveau moteur nécessiterait de refetcher les données historiques via `APISPORTS_KEY`, non disponible cette session. La seule comparaison honnête possible avec les données existantes est donc entre deux estimateurs déjà stockés : la confiance LLM, et la probabilité implicite du marché (`1/cote`, LLM-indépendante). Une vraie comparaison OLD vs DETERMINISTIC_PIPELINE attend l'accumulation de nouvelles prédictions résolues (collecte forward déjà en place via `match_snapshots`).

| Métrique | OLD_PIPELINE (confiance LLM) | MARKET_IMPLIED_PROXY (1/cote) | Δ |
|---|---|---|---|
| n | 291 | 290 | — |
| Brier score | 0.2814 | **0.2497** | -0.0317 (proxy meilleur) |
| Log loss | 0.7671 | **0.6929** | -0.0742 (proxy meilleur) |
| ECE | 16.35 pts | **8.50 pts** | -7.85 pts (proxy meilleur) |

Le proxy marché (LLM-indépendant) a un Brier score et un ECE nettement meilleurs que la confiance LLM sur cet échantillon — cohérent avec l'hypothèse que retirer le LLM de la boucle de décision améliore la calibration, **mais ne la prouve pas** : le proxy `1/cote` n'est pas non plus le moteur réel (qui blend Poisson/Dixon-Coles/Monte-Carlo/Elo et, pour 1X2/DC, ancre au marché via Shin — voir `MODEL_ARCHITECTURE.md`). Note aussi : 0.2497 reste à peine sous le repère pile-ou-face (0.25) — même le marché n'est que faiblement informatif sur l'échantillon de picks sélectionnés historiquement (les picks à forte confiance LLM, pas un échantillon aléatoire de matchs).

Répartition par marché (OLD vs proxy, écart en points de %) :

| Marché | n | Écart OLD | Écart proxy |
|---|---|---|---|
| over25 | ~89 | -27.5 | -13.8 |
| victoire_ext | ~22 | -29.2 | -9.7 |
| dc_x2 | ~26 | -22.1 | -11.3 |
| under25 | 59 | -4.6 | **+5.2** |
| btts_oui | 50 | -7.8 | **+3.6** |

Le proxy améliore l'écart sur presque tous les marchés mais reste imparfait partout — aucun marché n'atteint une calibration proche de zéro avec l'un ou l'autre estimateur. Détail complet (par bande de probabilité en plus du bucket/marché) dans `BACKTEST_REPORT.json`.

## Ce que cette mesure ne dit PAS

- Elle ne dit rien sur la qualité du **moteur mathématique lui-même** (Poisson/Dixon-Coles/Monte-Carlo/Elo) — ni l'ancien `conf` (LLM) ni le proxy `1/cote` n'en sont dérivés.
- Elle ne mesure PAS le nouveau `matchObj.model_probability` (probabilité réelle du marché retenu par le pipeline déterministe) — aucune prédiction produite avec le nouveau code n'a encore été résolue. **Ne pas écrire que le fix LLM a "amélioré la calibration" tant que cette mesure directe n'existe pas.**
- Échantillon de 291 lignes, une seule saison partielle, sans distinction par ligue/horizon (T72/T24/etc.) — sous le seuil de robustesse statistique pour des conclusions fines par segment (les tailles par marché ci-dessus, 15-89, sont déjà limites).

## Prochaine étape concrète

Une fois plusieurs semaines de prédictions générées avec le code corrigé (marché/edge/Kelly/`model_probability` déterministes) auront été résolues, relancer une variante de ce script qui utilise `model_probability` (persisté nulle part aujourd'hui — à ajouter à `historique.json` ou lire depuis `match_premium_data.raw_response`/`match_snapshots` pour ces nouvelles entrées) au lieu de `conf`, pour mesurer directement — pas par proxy — si le moteur déterministe est mieux calibré que l'ancien pipeline LLM.
