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

## Ce que cette mesure ne dit PAS

- Elle ne dit rien sur la qualité du **moteur mathématique lui-même** (Poisson/Dixon-Coles/Monte-Carlo/Elo) — seulement sur l'ancien champ `conf`, qui n'était pas dérivé de ce moteur mais de l'auto-évaluation du LLM.
- Elle ne permet pas de mesurer le nouveau `matchObj.conf` (probabilité réelle du marché retenu, depuis le fix LLM de ce jalon) — aucune prédiction produite avec le nouveau code n'a encore été résolue.
- Échantillon de 291 lignes, une seule saison partielle, sans distinction par ligue/marché/horizon (T72/T24/etc.) — largement en-dessous du seuil de robustesse statistique pour des conclusions fines par segment.

## Prochaine étape concrète

Re-mesurer ces mêmes métriques (`npm run backtest`, ou une variante qui distingue legacy vs nouveau) une fois plusieurs semaines de prédictions générées avec le code corrigé (marché/edge/Kelly déterministes) auront été résolues — pour vérifier si `pickedMarket.prob` (le nouveau `conf`) est effectivement mieux calibré que l'ancien score LLM. Rien ne garantit que ce sera le cas tant que ce n'est pas mesuré.
