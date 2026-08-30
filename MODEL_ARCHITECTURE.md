# IASHARK — Architecture du moteur (MASTER V2.1 §10.AP)

Document vivant, mis à jour à chaque changement réel du moteur. Décrit ce qui est **réellement construit et vérifié**, pas l'ambition finale du MASTER — pour l'ambition complète, voir `IASHARK_V2_EXECUTION_STATE.md` et le MASTER lui-même (§10.D à §10.AL).

## Séparation stricte PURE / MARKET_CONSENSUS / MARKET_AWARE (§10.2) — corrigée

**Historique du problème** : une première vérification avait tracé que `model_probability` était toujours la dernière valeur calculée pour le marché retenu, mais avait révélé une asymétrie — 1X2/Double Chance utilisaient un blend ancré au marché (`anchored.p1/pN/p2`, proche de `MARKET_AWARE_PROBABILITY`) tandis qu'Over/Under et BTTS restaient purs. Signalé explicitement par l'utilisateur comme inacceptable : *"Aucun calcul PURE ne doit recevoir une probabilité issue d'un bookmaker, directement ou indirectement."*

**Corrigé** : les trois probabilités du §10.2 sont maintenant calculées et exposées séparément, pour tous les marchés, sans exception :

- **`PURE_IASHARK_PROBABILITY`** (variable pipeline `pureProbs`, champ `model_probability`) : ensemble Poisson/Dixon-Coles/Monte-Carlo/Elo — **aucune cote n'entre dans ce calcul, pour aucun marché**. Double Chance pur (`purePropProb1X`/`purePropProbX2`) est dérivé des probabilités 1X2 pures elles-mêmes (`pureProbs.p1 + pureProbs.pN`), jamais d'un blend marché. C'est cette probabilité, et uniquement elle, qui alimente `allMarkets`, `pickMarketDeterministic`, et le calcul d'edge/Kelly.
- **`MARKET_CONSENSUS_PROBABILITY`** (variable `shinProbs` pour 1X2, `fairOU`/`fairBTTS` pour Over/Under et BTTS, exposée dans `matchObj.market_consensus_p1/pN/p2`) : uniquement les cotes réelles, marge retirée (Shin). `null` si aucune cote fiable — jamais fabriquée.
- **`MARKET_AWARE_PROBABILITY`** (variable `marketAware`, exposée dans `matchObj.market_aware_p1/pN/p2`) : modèle séparé et facultatif qui blend PURE avec le marché (poids 0.55-0.65 vers le marché selon la source). **N'alimente plus jamais** `allMarkets`/`pickMarketDeterministic`/edge/Kelly — exposé uniquement pour comparaison, jamais comme source de décision. Honnêtement documenté comme un blend linéaire simple, pas encore le modèle entraîné que le MASTER envisage à terme (§10.Q Model F).

**Preuve mathématique vérifiée** (pas juste tracée dans le code, exécutée réellement) : avec les mêmes lambdas, faire varier les cotes de marché de 1.30 (favori net) à 4.50 (outsider net) ne change PAS `PURE_IASHARK_PROBABILITY` (reste à 48% dans les deux cas) mais change `MARKET_AWARE_PROBABILITY` du tout au tout (61% → 33%). Voir `tests/pure-probability-separation.test.js`.

**Garde-fou anti-régression** : `tests/pipeline-source-guards.test.js` inspecte le texte source réel de `.github/workflows/update-data.yml` (pas une copie parallèle) et échoue si la variable `anchored` réapparaît, si un marché 1X2/DC cesse d'utiliser `pureProbs`, ou si `marketAware` est référencé dans le bloc de calcul edge/Kelly.

Aucune des trois probabilités n'est une **probabilité statistiquement calibrée** au sens du MASTER (§10.S, isotonic/Platt/temperature scaling contre l'historique réel des résultats) — ce moteur de calibration n'existe pas encore. Voir `CALIBRATION_REPORT.md` pour ce qui est réellement mesuré (et ce qui ne l'est pas). Rappel explicite de l'utilisateur : `MARKET_IMPLIED_PROBABILITY_PROXY` (voir `CALIBRATION_REPORT.md`) est un benchmark/proxy, **pas** une validation du nouveau moteur déterministe.

## Vue d'ensemble

```
DONNÉES (api-football)
   │
   ├─► Modèles de score : Poisson, Dixon-Coles, Monte-Carlo seedable (lib/models.js)
   │        + Elo (inline dans update-data.yml, pas encore extrait)
   │        └─► calcFinalProbs() : ensemble pondéré (0.32/0.36/0.22/0.10 avec Elo)
   │
   ├─► Score distribution → marchés (lib/markets/score-matrix.js, §10.V)
   │        Une seule matrice P(h,a) dérive : 1X2, DC, DNB, O/U 0.5-6.5,
   │        team totals, BTTS, clean sheet, win to nil, exact score, bandes
   │        (PAS ENCORE branché en remplacement de calcFinalProbs en production —
   │        coexiste comme brique testée, prête pour Phase 3 suite)
   │
   ├─► Cotes marché (lib/odds.js parseOdds + shinProbabilities pour retrait de marge)
   │        └─► MARKET_CONSENSUS_PROBABILITY (§10.2) : fair probability par
   │            paire complémentaire (Over/Under 2.5, BTTS) via Shin
   │
   ├─► Décision déterministe (lib/decision.js, §1.3/§7.8/§10.AJ)
   │        pickMarketDeterministic() : marché de plus haute probabilité modèle
   │        computeRiskLabel() : FAIBLE/MODERE/ELEVE depuis la cote
   │        computeModelAgreement() : écart-type Poisson/DC/MC (§10.AB)
   │        computeDataQualityScore() : V1 simplifiée (§11.1)
   │        fractionalKelly()/edgePoints() (lib/betting.js) : Kelly/edge réels
   │
   ├─► LLM (Claude, genAnalyse()) — TEXTE UNIQUEMENT depuis ce jalon (§7.8/§10.AJ)
   │        Reçoit la décision déjà prise, renvoie verdict_shark/analyse_card/
   │        conseil/contexte/facteur_x/scenario. Aucun champ numérique accepté.
   │        Le moteur fonctionne à 100% sans lui (vérifié : test avec an=null).
   │
   └─► Persistance
            data.json (public, FREE) — jamais de champs premium
            match_premium_data (Supabase, service-role only) — kelly/edge/verdict_shark
            match_snapshots (Supabase, 'prediction' + 'closing') — collecte forward
            historique.json — archive résolue (win/loss/void), 300 max (§15.3 pas encore corrigé)
```

## Composants par statut

| Composant | Fichier | Statut | Branché en production ? |
|---|---|---|---|
| Poisson/Dixon-Coles/Monte-Carlo | `lib/models.js` | Validé, testé (P1-15) | Oui |
| Shin (retrait de marge) | `lib/models.js` | Validé, testé | Oui |
| Kelly/edge/EV | `lib/betting.js` | Validé, testé | Oui |
| Resolvers de marché | `lib/resolvers.js` | Validé, testé (étendu ce jalon : O/U générique, DNB, handicap quart refusé explicitement) | Oui |
| ROI/winrate | `lib/roi.js` | Validé, testé | Oui |
| Parsing de cotes | `lib/odds.js` | Validé, testé | Oui |
| Calibration (Brier/log loss/ECE) | `lib/calibration.js` | Validé, testé, **exécuté sur données réelles** (`BACKTEST_REPORT.json`) | Outil d'analyse, pas dans le pipeline de génération |
| Dynamic Team Strength | `lib/team-strength.js` | Testé, **EXPERIMENTAL** (paramètres non appris par backtest) | Non |
| Score distribution → marchés | `lib/markets/score-matrix.js` | Testé | Non (coexiste avec `calcFinalProbs` inline) |
| Market Registry | `lib/market-registry.js` | Testé | N/A (registre de référence) |
| Décision déterministe (marché/edge/Kelly/risque) | `lib/decision.js` | Testé | **Oui**, depuis ce jalon |
| Elo | inline `update-data.yml` (`eloWinProb`) | En production, non extrait/testé isolément (signature plus riche que la version simplifiée de `lib/models.js`, voir `IASHARK_V2_EXECUTION_STATE.md`) | Oui |

## Ce qui n'existe pas encore (§10.E à §10.AL du MASTER)

Player Impact Engine, Squad Continuity Engine, Injury/Sidelined Engine (au-delà de la liste brute déjà collectée), Lineup Strength Engine, Physical Load/Rest Engine, Coach/Tactical Stability Engine, Match Context Engine, Early-Season Engine, Model Family complet (Model B/D/E/F/G — seuls A et C existent), Meta-Ensemble formel, Uncertainty Engine complet (au-delà de `computeModelAgreement`), Walk-Forward Backtest Engine formel, Champion/Challenger, Ablation Engine, Regime/Drift Detection, Corners/Cards/Player Props Engines.

Chacun nécessite soit des données non encore collectées (corners, cartons, lineups confirmés horodatés), soit un historique bien plus large que les 291 prédictions disponibles localement pour un apprentissage/backtest réel — voir `IASHARK_V2_EXECUTION_STATE.md`, section FORWARD_VALIDATION_ONLY.
