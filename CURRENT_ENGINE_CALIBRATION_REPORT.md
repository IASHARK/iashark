# IASHARK — Backtest offline du moteur DETERMINISTE actuel (Track Record V2 candidat)

_Genere le 2026-09-12T22:06:30.170Z par `scripts/backtest-current-engine-offline.js`. Ne PAS confondre avec `CALIBRATION_REPORT.md` (qui documente l'ANCIEN pipeline LLM-confiance, historique.json) — ce rapport-ci mesure le NOUVEAU moteur deterministe (lib/engine.js/lib/models.js/lib/decision.js) contre de vrais resultats historiques, jamais rejoue jusqu'ici (voir en-tete de `scripts/backtest_historique.js`)._

## Ce que ce rapport mesure, et ce qu'il ne mesure PAS

- **Mesure** : la calibration du moteur coeur (Poisson/Dixon-Coles rho=-0.0845/Monte-Carlo seedable, `lib/engine.js#calcFinalProbs`) sur des matchs REELS des 5 ligues deja en ligne aujourd'hui (Premier League, La Liga, Bundesliga, Ligue 1, Serie A), en respectant strictement l'anti-leakage (voir section methode ci-dessous).
- **Ne mesure PAS** : l'edge, le ROI, ou la valeur Kelly d'un pari. `data/gate-b1/*-all-seasons.json` (source de ce backtest) ne contient AUCUNE cote (confirme par audit manuel des enregistrements) — impossible de comparer une probabilite modele a un prix de marche ici. Cette validation-la reste la responsabilite de la collecte forward reelle (`match_snapshots`/`predictions_archive`, migrations 0004/0005) — hors perimetre de ce script, qui reste 100% offline et n'est branche nulle part (ni page publique, ni pipeline GitHub Actions).
- **Ne rejoue PAS** les enrichissements du pipeline LIVE (`update-data.yml`) impossibles a deriver de ce jeu de donnees : blend saison precedente en debut de saison (`blendEarlySeasonRate`), blend xG (0.6/0.4 quand disponible), facteur de qualite de tir, cas Coupe du Monde, Elo (de toute facon non branche dans `calcFinalProbs`, parametre inutilise), tout ancrage marche. C'est le moteur COEUR qui est teste ici — deja ce que ce codebase traite ailleurs comme "l'etat M0 canonique" reutilisable pour ce type de travail (`lib/data/production-replay.js`).

## Methode anti-leakage

- Chaque match est trie chronologiquement (`kickoff_timestamp`) au sein de sa propre saison (une saison = 1 competition, jamais melangee avec une autre saison — corrige un bug de fuite inter-saison deja documente dans ce codebase, "CHAMPION_REPLAY_MISMATCH" du 2026-09-05).
- L'etat de chaque equipe (matchs joues, buts pour/contre, forme) au moment du coup d'envoi est reconstruit UNIQUEMENT a partir des matchs de CETTE MEME SAISON dont `kickoff_timestamp` est **strictement anterieur** (jamais egal) au coup d'envoi du match predit — jamais le match lui-meme, jamais un match futur, jamais une autre saison.
- Cette reconstruction reutilise **telle quelle** `lib/data/production-replay.js#computeM0Lambdas` (qui route vers `lib/data/team-state.js#buildTeamState`) — deja la fonction canonique documentee dans ce codebase pour cet usage exact, pas une reimplementation parallele.
- **Fenetre de warmup** : une prediction n'est generee que si les DEUX equipes ont deja joue au moins **8 matchs cette saison** (en plus du garde-fou deja integre au moteur lui-meme : `calcCriteres` exige >=3 matchs joues). Choix documente : la consigne de cette tache suggerait "les 8-10 premieres journees" pour que le state ait quelque chose de reel a calculer ; 8 a ete retenu comme borne raisonnable (strictement plus stricte que le minimum du moteur) sans sacrifier une part trop importante de chaque saison (30-38 journees selon la ligue).
- Aucune cote, aucun score du match lui-meme, aucune donnee posterieure au coup d'envoi n'entre a aucun moment dans le calcul de la prediction.

## Volume de donnees

- Fixtures examinees (toutes ligues, saisons 2021-2025) : **8927**
- Ecartees car non terminees / score manquant : 1
- Ecartees par le garde-fou du moteur (`calcCriteres`, <3 matchs joues pour au moins une equipe) : 749
- Ecartees par la fenetre de warmup (<8 matchs joues cette saison pour au moins une equipe) : 1212
- **Matchs effectivement predits et evalues : 6965**

## Repartition par ligue

| Ligue | Saisons couvertes | Matchs evalues | Brier 1X2 | Log loss 1X2 | ECE 1X2 | Brier O/U2.5 | Brier BTTS |
|---|---|---|---|---|---|---|---|
| Premier League | 2021, 2022, 2023, 2024, 2025 | 1498 | 0.2042 | 0.5979 | 0.0436 | 0.2646 | 0.2581 |
| La Liga | 2021, 2022, 2023, 2024, 2025 | 1497 | 0.2055 | 0.599 | 0.0276 | 0.2559 | 0.2557 |
| Bundesliga | 2021, 2022, 2023, 2024, 2025 | 1170 | 0.2141 | 0.6224 | 0.0813 | 0.2634 | 0.2484 |
| Ligue 1 | 2021, 2022, 2023, 2024, 2025 | 1299 | 0.2079 | 0.6063 | 0.0494 | 0.2768 | 0.2602 |
| Serie A | 2021, 2022, 2023, 2024, 2025 | 1501 | 0.206 | 0.6017 | 0.0298 | 0.2665 | 0.2542 |

### Premier League

Matchs evalues par saison : 2021=300, 2022=298, 2023=300, 2024=300, 2025=300

- 1X2 : n=4494, Brier=0.2042, log loss=0.5979, ECE=0.0436
- Over/Under 2.5 : n=1498, Brier=0.2646, log loss=0.7334, ECE=0.1327
- BTTS (oui) : n=1498, Brier=0.2581, log loss=0.7139, ECE=0.0833
- Verdict 1X2 : SURCONFIANT (le modele annonce plus de certitude que ce qui se realise) (ecart moyen absolu 6.1 pt sur les tranches n>=10). Brier=0.2042 (repere pile-ou-face=0.25).

### La Liga

Matchs evalues par saison : 2021=298, 2022=300, 2023=299, 2024=300, 2025=300

- 1X2 : n=4491, Brier=0.2055, log loss=0.599, ECE=0.0276
- Over/Under 2.5 : n=1497, Brier=0.2559, log loss=0.7112, ECE=0.0908
- BTTS (oui) : n=1497, Brier=0.2557, log loss=0.7073, ECE=0.0584
- Verdict 1X2 : CALIBRATION MOYENNE, sans biais clair dans un sens (ecart moyen absolu 4.0 pt sur les tranches n>=10). Brier=0.2055 (repere pile-ou-face=0.25).

### Bundesliga

Matchs evalues par saison : 2021=234, 2022=234, 2023=234, 2024=234, 2025=234

- 1X2 : n=3510, Brier=0.2141, log loss=0.6224, ECE=0.0813
- Over/Under 2.5 : n=1170, Brier=0.2634, log loss=0.7504, ECE=0.1339
- BTTS (oui) : n=1170, Brier=0.2484, log loss=0.6981, ECE=0.0784
- Verdict 1X2 : SURCONFIANT (le modele annonce plus de certitude que ce qui se realise) (ecart moyen absolu 9.5 pt sur les tranches n>=10). Brier=0.2141 (repere pile-ou-face=0.25).

### Ligue 1

Matchs evalues par saison : 2021=299, 2022=300, 2023=233, 2024=234, 2025=233

- 1X2 : n=3897, Brier=0.2079, log loss=0.6063, ECE=0.0494
- Over/Under 2.5 : n=1299, Brier=0.2768, log loss=0.7617, ECE=0.1511
- BTTS (oui) : n=1299, Brier=0.2602, log loss=0.7186, ECE=0.0774
- Verdict 1X2 : SURCONFIANT (le modele annonce plus de certitude que ce qui se realise) (ecart moyen absolu 6.4 pt sur les tranches n>=10). Brier=0.2079 (repere pile-ou-face=0.25).

### Serie A

Matchs evalues par saison : 2021=300, 2022=301, 2023=300, 2024=300, 2025=300

- 1X2 : n=4503, Brier=0.206, log loss=0.6017, ECE=0.0298
- Over/Under 2.5 : n=1501, Brier=0.2665, log loss=0.7333, ECE=0.1137
- BTTS (oui) : n=1501, Brier=0.2542, log loss=0.7023, ECE=0.0619
- Verdict 1X2 : CALIBRATION MOYENNE, sans biais clair dans un sens (ecart moyen absolu 5.7 pt sur les tranches n>=10). Brier=0.206 (repere pile-ou-face=0.25).

## Resultat global (5 ligues combinees)

### Marche 1X2 (Domicile / Nul / Exterieur, n=20895)

- Brier score : **0.2072** (repere pile-ou-face constant a 50% pour un evenement binaire equilibre : 0.25 — pas directement comparable a un marche a 3 issues desequilibrees, donne a titre de repere seulement)
- Log loss : **0.6046**
- Expected Calibration Error (ECE) : **0.0443**

| Tranche predite | n | Proba. moyenne predite | Taux reel observe | Ecart |
|---|---|---|---|---|
| 0-10% | 640 | 7.1% | 12.0% | +4.9 pt |
| 10-20% | 4385 | 14.9% | 21.1% | +6.2 pt |
| 20-30% | 6305 | 24.7% | 27.2% | +2.6 pt |
| 30-40% | 3614 | 33.9% | 33.1% | -0.8 pt |
| 40-50% | 1810 | 44.4% | 41.3% | -3.1 pt |
| 50-60% | 1536 | 54.3% | 48.6% | -5.6 pt |
| 60-70% | 1205 | 64.3% | 52.9% | -11.3 pt |
| 70-80% | 996 | 74.3% | 63.2% | -11.2 pt |
| 80-90% | 404 | 82.5% | 71.5% | -11.0 pt |

**Verdict 1X2** : SURCONFIANT (le modele annonce plus de certitude que ce qui se realise) (ecart moyen absolu 6.3 pt sur les tranches n>=10). Brier=0.2072 (repere pile-ou-face=0.25).

### Marche Over/Under 2.5 buts (n=6965)

- Brier score : **0.2652** (repere pile-ou-face : 0.25)
- Log loss : **0.7367**
- ECE : **0.1187**

| Tranche predite | n | Proba. moyenne predite | Taux reel observe | Ecart |
|---|---|---|---|---|
| 30-40% | 965 | 34.0% | 45.1% | +11.1 pt |
| 40-50% | 985 | 44.8% | 47.6% | +2.8 pt |
| 50-60% | 1255 | 54.5% | 49.0% | -5.5 pt |
| 60-70% | 1312 | 64.5% | 52.4% | -12.1 pt |
| 70-80% | 1329 | 74.7% | 60.0% | -14.7 pt |
| 80-90% | 1004 | 83.1% | 60.9% | -22.2 pt |
| 90-100% | 115 | 91.8% | 52.2% | -39.6 pt |

**Verdict Over 2.5** : SURCONFIANT (le modele annonce plus de certitude que ce qui se realise) (ecart moyen absolu 15.4 pt sur les tranches n>=10). Brier=0.2652 (repere pile-ou-face=0.25).

### Marche BTTS - Oui (n=6965)

- Brier score : **0.2555** (repere pile-ou-face : 0.25)
- Log loss : **0.7082**
- ECE : **0.07**

| Tranche predite | n | Proba. moyenne predite | Taux reel observe | Ecart |
|---|---|---|---|---|
| 40-50% | 1496 | 44.1% | 50.8% | +6.7 pt |
| 50-60% | 2632 | 54.9% | 52.8% | -2.1 pt |
| 60-70% | 1644 | 63.8% | 55.4% | -8.4 pt |
| 70-80% | 852 | 74.0% | 61.2% | -12.8 pt |
| 80-90% | 314 | 83.2% | 58.3% | -24.9 pt |
| 90-100% | 27 | 91.0% | 63.0% | -28.1 pt |

**Verdict BTTS** : SURCONFIANT (le modele annonce plus de certitude que ce qui se realise) (ecart moyen absolu 13.8 pt sur les tranches n>=10). Brier=0.2555 (repere pile-ou-face=0.25).

## Focus recence — saison 2025 uniquement (la plus recente saison complete, 5 ligues combinees)

_Reflete le plus fidelement "ce que le moteur dirait aujourd'hui", au prix d'un echantillon plus petit._

| Marche | n | Brier | Log loss | ECE |
|---|---|---|---|---|
| 1X2 | 4101 | 0.2099 | 0.6114 | 0.051 |
| Over/Under 2.5 | 1367 | 0.2667 | 0.7393 | 0.1121 |
| BTTS (oui) | 1367 | 0.2561 | 0.7089 | 0.0677 |

## Verdict honnete en langage clair

- **1X2 (5 ligues, 20895 observations)** : SURCONFIANT (le modele annonce plus de certitude que ce qui se realise) (ecart moyen absolu 6.3 pt sur les tranches n>=10). Brier=0.2072 (repere pile-ou-face=0.25).
- **Over/Under 2.5 (6965 observations)** : SURCONFIANT (le modele annonce plus de certitude que ce qui se realise) (ecart moyen absolu 15.4 pt sur les tranches n>=10). Brier=0.2652 (repere pile-ou-face=0.25).
- **BTTS (6965 observations)** : SURCONFIANT (le modele annonce plus de certitude que ce qui se realise) (ecart moyen absolu 13.8 pt sur les tranches n>=10). Brier=0.2555 (repere pile-ou-face=0.25).
- Ligue la mieux calibree sur 1X2 (Brier le plus bas, echantillon>=100) : **Premier League** (Brier=0.2042). Ligue la moins bien calibree : **Bundesliga** (Brier=0.2141).

## Limites et avertissements explicites

1. **Aucune donnee de cote dans `data/gate-b1`** : ce rapport ne peut pas et ne pretend pas mesurer l'edge, le ROI ou la valeur d'un pari — seulement si la probabilite annoncee correspond a la frequence reelle observee (calibration pure).
2. **Fenetre de warmup = 8 matchs/equipe/saison**, choix documente ci-dessus mais reste un choix — un warmup different (ex: 5 ou 12) deplacerait legerement les chiffres, en particulier pour les ligues avec moins de matchs par saison (Bundesliga : 308 matchs/saison contre 380 pour Premier League/La Liga/Serie A).
3. **Perimetre = moteur COEUR uniquement** (voir section "Ce que ce rapport mesure") — le pipeline LIVE reel produit des probabilites legerement differentes des ici presentees des qu'un match a des donnees xG/tirs suffisantes (blend 0.6/0.4) ou tombe en debut de saison (blend saison precedente), aucun des deux non reproductible depuis ce jeu de donnees hors-ligne.
4. **MODEL_ARCHITECTURE.md decrit un ensemble pondere historique (0.32/0.36/0.22/0.10 avec Elo)** qui ne correspond plus au code actuel de `lib/engine.js#calcFinalProbs` (Dixon-Coles pur rho=-0.0845 depuis GATE A3, blend algebriquement demontre equivalent — voir commentaires en tete de `lib/engine.js` et `lib/models.js`). Ce rapport suit fidelement le CODE reel (source de verite pour cette tache), pas la documentation prose, qui semble ne pas avoir ete mise a jour apres ce changement — a signaler separement, hors perimetre de correction ici (ce script ne modifie aucun fichier existant).
5. **`goals_home_90`/`goals_away_90`** (jamais `goals_*_final`) sont utilises a la fois pour construire l'etat des equipes ET pour juger le resultat reel — coherent avec le choix deja documente dans `lib/data/team-state.js` (evite qu'un but de prolongation fausse le calcul). Un seul cas rencontre sur les donnees auditees manuellement (Ligue 1 2023-24, barrage de relegation Metz-Saint Etienne, `status_short="AET"`) confirme que ce choix est actif et coherent avec le score officiel `_90`.
6. **Determinisme** : `calcFinalProbs` seede son sous-calcul Monte-Carlo a partir des lambdas eux-memes (`seedFromLambdas`, voir `lib/models.js`) — deux executions de ce script sur les memes donnees produisent EXACTEMENT le meme rapport (verifie).
7. Aucune ligue n'a un echantillon jugé insuffisant (toutes >=300 matchs evalues) pour cette premiere passe.

## Reproductibilite

```
node scripts/backtest-current-engine-offline.js
```

Ce script est 100% offline (aucun appel reseau/API), lit uniquement `data/gate-b1/*.json` deja present dans le depot, et n'est branche dans AUCUNE page publique ni dans le pipeline GitHub Actions quotidien — c'est un outil d'analyse a executer manuellement, pas un service en production. Toute decision de construire une page publique "Track Record" a partir de ces chiffres reste une decision business a prendre separement par le proprietaire du produit.
