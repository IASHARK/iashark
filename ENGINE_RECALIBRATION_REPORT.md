# IASHARK — Recalibration post-hoc du moteur DETERMINISTE actuel (isotonic regression)

_Genere le 2026-09-18T04:31:32.259Z par `scripts/fit-and-validate-calibration.js`. Ne remplace PAS `CURRENT_ENGINE_CALIBRATION_REPORT.md` (diagnostic original, inchange) — ce rapport-ci documente le FIX applique par-dessus (isotonic regression post-hoc) et son effet MESURE sur une portion de donnees jamais vue par le fit.

## Contexte et demande

`CURRENT_ENGINE_CALIBRATION_REPORT.md` a etabli que le moteur coeur (`lib/engine.js#calcFinalProbs`) a un signal reel (bat nettement le pile-ou-face) mais est **systematiquement surconfiant en haut d'echelle** (ex: 80-90% predit sur 1X2 -> ~71.5% reel ; 90%+ sur Over/Under 2.5 -> ~52% reel) et **sous-confiant en bas d'echelle**. Demande explicite du proprietaire produit : recalibrer la confiance affichee, sans reconstruire le moteur. Ce rapport documente une correction post-hoc (couche de recalibration appliquee APRES le calcul Poisson/Dixon-Coles/Monte-Carlo, qui reste totalement inchange) et sa validation.

## Methode de fit : isotonic regression (PAVA), pas Platt/logistic scaling

- **Pourquoi pas Platt/logistic scaling** : Platt ajuste une sigmoide a 2 parametres sur logit(proba) — une forme parametrique fixe qui suppose une courbure de biais constante. Le pattern diagnostique (sous-confiant en bas, surconfiant en haut, amplitudes differentes par marche) est monotone mais n'a pas une courbure de sigmoide unique evidente.
- **Pourquoi isotonic regression (PAVA)** : n'impose qu'une seule contrainte — la monotonie (une probabilite modele plus elevee ne doit jamais correspondre a un taux reel plus faible, deja vrai par construction pour une calibration de probabilite) — et laisse les donnees dicter la forme exacte de la courbe, sans risque de mauvaise specification parametrique. Implementee dans `lib/calibration.js` (`poolAdjacentViolators`, `fitIsotonicCurve`, `applyIsotonicCurve`/`applyCalibration`), zero dependance externe (vanilla JS, coherent avec le reste du codebase).
- **Cout connu** : isotonic regression peut surapprendre sur de petits echantillons (chaque coude de la courbe est litteralement un point de donnee sur les cas extremes). Mitige par le choix de granularite ci-dessous.

## Granularite du fit : GLOBAL (5 ligues combinees), pas par ligue

- Chaque marche (1X2, Over/Under 2.5, BTTS, et depuis le 18/09/2026 les familles derivees de la meme matrice : double chance 12, Over 1.5/3.5, totaux par equipe 1.5, clean sheet, victoire sans encaisser, resultat + total) recoit **une seule courbe de calibration, ajustee sur les 5 ligues combinees** — jamais une courbe par ligue.
- Justification chiffree : sur TRAIN (saisons 2021,2022,2023), le volume par ligue pour 1X2 tombe a quelques centaines de matchs (donc ~mille lignes 1X2 apres pooling HOME/DRAW/AWAY) par ligue — et `CURRENT_ENGINE_CALIBRATION_REPORT.md` montre deja des tranches a n aussi bas que 27-115 pour Over/Under 2.5 et BTTS meme en poolant les 5 ligues sur 5 saisons entieres. Fitter par ligue diviserait cet echantillon par 5, rendant les tranches de queue (0-10%, 90-100%) quasi vides — PAVA sur des blocs a n<10 produit des coudes bruyants, non generalisables, l'inverse de l'objectif. Le diagnostic montre par ailleurs un biais de MEME SIGNE (surconfiance en haut d'echelle) sur 3 des 5 ligues (Premier League, Bundesliga, Ligue 1) et une calibration deja correcte sur les 2 autres (La Liga, Serie A) — pas un biais qui varie de façon opposee d'une ligue a l'autre, ce qui justifie un fit partage plutot que 5 fits independants qui capteraient surtout du bruit d'echantillonnage inter-ligue.
- Limite explicite : si une ligue future a un biais de calibration structurellement DIFFERENT (pas seulement plus bruyant) des 5 ici etudiees, le fit global le lui appliquerait quand meme — a surveiller si de nouvelles ligues (GB/MX/ZA, en cours d'expansion dans ce depot) montrent un pattern differe une fois assez de matchs resolus.

## Split train/holdout (anti-leakage)

- **TRAIN (fit)** : saisons 2021, 2022, 2023.
- **HOLDOUT (validation, jamais vu par le fit)** : saisons 2024, 2025.
- Le replay lui-meme (reconstruction du state M0 par match, warmup >=8 matchs/equipe/saison, aucune donnee posterieure au coup d'envoi) est **exactement** celui de `CURRENT_ENGINE_CALIBRATION_REPORT.md`/`scripts/backtest-current-engine-offline.js#runBacktest` — reutilise tel quel via `require(...)`, jamais reimplemente. Le split train/holdout est un decoupage PAR SAISON des lignes deja produites par ce replay (`row.season`), applique APRES le replay — jamais une fuite entre les deux (aucune ligne TRAIN et HOLDOUT ne partage le meme fixture_id, les saisons ne se chevauchent pas).
- Volumes : TRAIN n(1X2)=12690, n(OVER_2_5)=4230, n(BTTS)=4230 — HOLDOUT n(1X2)=8205, n(OVER_2_5)=2735, n(BTTS)=2735.

## Resultats par marche (HOLDOUT — le chiffre qui compte)

| Marche | Brier AVANT | Brier APRES | ECE AVANT | ECE APRES | Log loss AVANT | Log loss APRES | Brier ameliore ? | ECE ameliore ? | **Branche en prod ?** |
|---|---|---|---|---|---|---|---|---|---|
| 1X2 | 0.2084 | 0.2056 | 0.0447 | 0.0111 | 0.6079 | 0.5998 | OUI | OUI | **OUI** |
| OVER_2_5 | 0.267 | 0.2494 | 0.1225 | 0.0255 | 0.7413 | 0.6934 | OUI | OUI | **OUI** |
| BTTS_YES | 0.2575 | 0.2487 | 0.0739 | 0.0242 | 0.7132 | 0.6908 | OUI | OUI | **OUI** |
| DC_12 | 0.1886 | 0.1863 | 0.0405 | 0.0101 | 0.5668 | 0.5596 | OUI | OUI | **OUI** |
| OVER_1_5 | 0.1861 | 0.1778 | 0.0817 | 0.0205 | 0.5828 | 0.5412 | OUI | OUI | **OUI** |
| OVER_3_5 | 0.2349 | 0.2098 | 0.1219 | 0.0088 | 0.6652 | 0.61 | OUI | OUI | **OUI** |
| HOME_TEAM_OVER_1_5 | 0.2481 | 0.2368 | 0.0756 | 0.0148 | 0.6954 | 0.6862 | OUI | OUI | **OUI** |
| AWAY_TEAM_OVER_1_5 | 0.2411 | 0.2279 | 0.097 | 0.0373 | 0.6787 | 0.6483 | OUI | OUI | **OUI** |
| HOME_CLEAN_SHEET | 0.2044 | 0.2003 | 0.0653 | 0.0215 | 0.6059 | 0.5888 | OUI | OUI | **OUI** |
| AWAY_CLEAN_SHEET | 0.1734 | 0.1718 | 0.0334 | 0.0109 | 0.5329 | 0.5296 | OUI | OUI | **OUI** |
| HOME_WIN_TO_NIL | 0.1719 | 0.1705 | 0.0337 | 0.0162 | 0.53 | 0.5209 | OUI | OUI | **OUI** |
| AWAY_WIN_TO_NIL | 0.1374 | 0.1375 | 0.0249 | 0.0151 | 0.4446 | 0.4408 | NON | OUI | **NON** |
| HOME_WIN_OVER_1_5 | 0.2144 | 0.2075 | 0.0623 | 0.0271 | 0.618 | 0.6028 | OUI | OUI | **OUI** |
| HOME_WIN_OVER_2_5 | 0.193 | 0.1845 | 0.0639 | 0.0087 | 0.5702 | 0.5519 | OUI | OUI | **OUI** |
| HOME_WIN_OVER_3_5 | 0.1256 | 0.1159 | 0.0566 | 0.009 | 0.4064 | 0.3851 | OUI | OUI | **OUI** |
| HOME_WIN_UNDER_2_5 | 0.1363 | 0.1349 | 0.039 | 0.0084 | 0.4516 | 0.4518 | OUI | OUI | **OUI** |
| HOME_WIN_UNDER_3_5 | 0.2029 | 0.2007 | 0.0448 | 0.0119 | 0.5991 | 0.5959 | OUI | OUI | **OUI** |
| AWAY_WIN_OVER_1_5 | 0.1861 | 0.1798 | 0.0652 | 0.0227 | 0.557 | 0.543 | OUI | OUI | **OUI** |
| AWAY_WIN_OVER_2_5 | 0.1595 | 0.1506 | 0.0702 | 0.0213 | 0.4952 | 0.4763 | OUI | OUI | **OUI** |
| AWAY_WIN_OVER_3_5 | 0.0916 | 0.0825 | 0.0577 | 0.0117 | 0.3217 | 0.2994 | OUI | OUI | **OUI** |
| AWAY_WIN_UNDER_2_5 | 0.1141 | 0.1136 | 0.0293 | 0.0145 | 0.3927 | 0.3968 | OUI | OUI | **OUI** |
| AWAY_WIN_UNDER_3_5 | 0.1742 | 0.1736 | 0.0399 | 0.0256 | 0.5356 | 0.5294 | OUI | OUI | **OUI** |

### 1X2

**Fit (TRAIN, 12690 lignes)** : Brier 0.2064 -> 0.2027, ECE 0.0445 -> 0.0018 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 8205 lignes, jamais vues par le fit)** :

- Brier : 0.2084 -> 0.2056 (amelioration)
- Log loss : 0.6079 -> 0.5998
- ECE : 0.0447 -> 0.0111 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 227 | 7.2% | 13.7% | +6.5 pt |
| 10-20% | 1658 | 15.0% | 21.8% | +6.8 pt |
| 20-30% | 2521 | 24.7% | 26.9% | +2.2 pt |
| 30-40% | 1482 | 33.9% | 31.8% | -2.1 pt |
| 40-50% | 740 | 44.4% | 43.4% | -1.0 pt |
| 50-60% | 602 | 54.3% | 50.5% | -3.8 pt |
| 60-70% | 456 | 64.1% | 51.1% | -13.0 pt |
| 70-80% | 380 | 74.4% | 62.9% | -11.5 pt |
| 80-90% | 139 | 82.3% | 69.1% | -13.3 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 107 | 8.4% | 15.0% | +6.6 pt |
| 10-20% | 830 | 16.2% | 17.1% | +0.9 pt |
| 20-30% | 3532 | 26.3% | 26.2% | -0.1 pt |
| 30-40% | 1588 | 34.7% | 33.4% | -1.3 pt |
| 40-50% | 1215 | 44.6% | 47.2% | +2.6 pt |
| 50-60% | 508 | 55.1% | 53.3% | -1.8 pt |
| 60-70% | 288 | 65.4% | 63.2% | -2.2 pt |
| 70-80% | 137 | 74.7% | 69.3% | -5.4 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### OVER_2_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.264 -> 0.2468, ECE 0.1162 -> 0.0135 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.267 -> 0.2494 (amelioration)
- Log loss : 0.7413 -> 0.6934
- ECE : 0.1225 -> 0.0255 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 30-40% | 397 | 33.9% | 47.4% | +13.5 pt |
| 40-50% | 377 | 44.9% | 48.3% | +3.3 pt |
| 50-60% | 496 | 54.6% | 49.8% | -4.8 pt |
| 60-70% | 531 | 64.4% | 52.0% | -12.4 pt |
| 70-80% | 523 | 74.7% | 60.0% | -14.6 pt |
| 80-90% | 355 | 83.2% | 60.6% | -22.6 pt |
| 90-100% | 56 | 91.8% | 51.8% | -40.1 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 40-50% | 1414 | 46.5% | 48.3% | +1.8 pt |
| 50-60% | 841 | 56.8% | 56.5% | -0.3 pt |
| 60-70% | 321 | 63.7% | 65.1% | +1.4 pt |
| 70-80% | 129 | 73.9% | 52.7% | -21.2 pt |
| 80-90% | 30 | 83.9% | 53.3% | -30.6 pt |

**Garde-fou structurel (Over1.5>=Over2.5>=Over3.5)** : Over2.5 est mathematiquement EMBOITE entre Over1.5 et Over3.5, un invariant deja verifie par `tests/market-coherence.test.js`. Comme over15/over35 restent BRUTS (jamais mesures par le backtest, donc jamais calibres), calibrer over25 seul peut le faire passer EN DESSOUS du Over3.5 brut sur des matchs a tres fort volume de buts. `lib/engine.js#calcFinalProbs` applique donc `over25_final = clamp(over25_calibre, min=Over3.5_brut, max=Over1.5_brut)`. **Mesure sur 6965 matchs reels (TRAIN+HOLDOUT combines)** : ce clamp se declenche sur **1097 matchs (15.8%)** — PAS un cas marginal. Les chiffres AVANT/APRES ci-dessus INCLUENT deja ce clamp (`applyCalibrationToOver25Rows` reproduit exactement la logique de `lib/engine.js`) — c'est une mesure honnete de ce qui tournerait reellement en production, pas une version optimiste sans lui.

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### BTTS_YES

**Fit (TRAIN, 4230 lignes)** : Brier 0.2542 -> 0.246, ECE 0.0676 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.2575 -> 0.2487 (amelioration)
- Log loss : 0.7132 -> 0.6908
- ECE : 0.0739 -> 0.0242 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 40-50% | 588 | 43.9% | 51.2% | +7.3 pt |
| 50-60% | 1002 | 55.0% | 53.4% | -1.6 pt |
| 60-70% | 679 | 63.7% | 55.7% | -8.0 pt |
| 70-80% | 332 | 74.0% | 58.4% | -15.5 pt |
| 80-90% | 121 | 83.7% | 57.0% | -26.7 pt |
| 90-100% | 13 | 91.3% | 53.8% | -37.4 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 50-60% | 2080 | 51.9% | 53.5% | +1.5 pt |
| 60-70% | 646 | 61.8% | 56.8% | -5.0 pt |
| 80-90% | 9 | 83.3% | 55.6% | -27.8 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### DC_12

**Fit (TRAIN, 4230 lignes)** : Brier 0.191 -> 0.1876, ECE 0.0402 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1886 -> 0.1863 (amelioration)
- Log loss : 0.5668 -> 0.5596
- ECE : 0.0405 -> 0.0101 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 60-70% | 383 | 67.5% | 75.7% | +8.2 pt |
| 70-80% | 1389 | 74.9% | 73.7% | -1.2 pt |
| 80-90% | 963 | 83.9% | 77.4% | -6.5 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 60-70% | 219 | 68.8% | 79.0% | +10.2 pt |
| 70-80% | 2171 | 74.0% | 73.7% | -0.2 pt |
| 80-90% | 345 | 82.1% | 82.3% | +0.2 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### OVER_1_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.1791 -> 0.1722, ECE 0.067 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1861 -> 0.1778 (amelioration)
- Log loss : 0.5828 -> 0.5412
- ECE : 0.0817 -> 0.0205 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 50-60% | 159 | 59.2% | 68.6% | +9.4 pt |
| 60-70% | 314 | 64.9% | 76.4% | +11.5 pt |
| 70-80% | 589 | 75.0% | 74.0% | -1.0 pt |
| 80-90% | 873 | 84.6% | 77.2% | -7.4 pt |
| 90-100% | 800 | 93.1% | 80.4% | -12.8 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 70-80% | 1761 | 73.6% | 74.9% | +1.3 pt |
| 80-90% | 974 | 83.7% | 80.4% | -3.3 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### OVER_3_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.2335 -> 0.208, ECE 0.1218 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.2349 -> 0.2098 (amelioration)
- Log loss : 0.6652 -> 0.61
- ECE : 0.1219 -> 0.0088 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 10-20% | 403 | 15.5% | 23.6% | +8.1 pt |
| 20-30% | 472 | 24.8% | 23.5% | -1.3 pt |
| 30-40% | 526 | 34.5% | 29.8% | -4.6 pt |
| 40-50% | 442 | 44.3% | 31.0% | -13.3 pt |
| 50-60% | 438 | 54.8% | 37.4% | -17.3 pt |
| 60-70% | 295 | 63.7% | 39.7% | -24.0 pt |
| 70-80% | 129 | 73.9% | 34.9% | -39.1 pt |
| 80-90% | 30 | 83.9% | 36.7% | -47.3 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 20-30% | 1416 | 25.0% | 25.8% | +0.9 pt |
| 30-40% | 1048 | 35.1% | 35.3% | +0.2 pt |
| 40-50% | 262 | 40.2% | 36.6% | -3.6 pt |
| 60-70% | 9 | 62.5% | 55.6% | -6.9 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### HOME_TEAM_OVER_1_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.2463 -> 0.2334, ECE 0.0832 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.2481 -> 0.2368 (amelioration)
- Log loss : 0.6954 -> 0.6862
- ECE : 0.0756 -> 0.0148 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 20-30% | 676 | 28.3% | 29.1% | +0.8 pt |
| 30-40% | 398 | 34.4% | 37.9% | +3.5 pt |
| 40-50% | 426 | 44.6% | 45.3% | +0.7 pt |
| 50-60% | 364 | 54.3% | 48.1% | -6.3 pt |
| 60-70% | 322 | 64.5% | 51.2% | -13.2 pt |
| 70-80% | 253 | 74.0% | 54.9% | -19.1 pt |
| 80-90% | 296 | 84.0% | 60.1% | -23.8 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 2 | 0.0% | 0.0% | +0.0 pt |
| 20-30% | 41 | 27.2% | 29.3% | +2.1 pt |
| 30-40% | 1187 | 34.0% | 33.6% | -0.4 pt |
| 40-50% | 654 | 45.9% | 47.9% | +2.0 pt |
| 50-60% | 583 | 53.1% | 53.3% | +0.2 pt |
| 60-70% | 102 | 62.4% | 59.8% | -2.6 pt |
| 70-80% | 157 | 70.8% | 61.1% | -9.6 pt |
| 90-100% | 9 | 100.0% | 66.7% | -33.3 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### AWAY_TEAM_OVER_1_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.2251 -> 0.2145, ECE 0.0714 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.2411 -> 0.2279 (amelioration)
- Log loss : 0.6787 -> 0.6483
- ECE : 0.097 -> 0.0373 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 20-30% | 1044 | 23.6% | 30.2% | +6.6 pt |
| 30-40% | 441 | 34.2% | 32.2% | -2.0 pt |
| 40-50% | 395 | 44.5% | 40.3% | -4.3 pt |
| 50-60% | 305 | 54.2% | 37.0% | -17.2 pt |
| 60-70% | 230 | 64.1% | 47.4% | -16.7 pt |
| 70-80% | 151 | 74.3% | 49.7% | -24.6 pt |
| 80-90% | 169 | 80.1% | 54.4% | -25.6 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 10-20% | 20 | 17.4% | 10.0% | -7.4 pt |
| 20-30% | 969 | 25.3% | 30.8% | +5.5 pt |
| 30-40% | 823 | 33.4% | 35.0% | +1.6 pt |
| 40-50% | 481 | 40.7% | 38.5% | -2.2 pt |
| 50-60% | 251 | 52.6% | 49.8% | -2.8 pt |
| 60-70% | 191 | 64.6% | 56.0% | -8.6 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### HOME_CLEAN_SHEET

**Fit (TRAIN, 4230 lignes)** : Brier 0.2095 -> 0.205, ECE 0.0509 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.2044 -> 0.2003 (amelioration)
- Log loss : 0.6059 -> 0.5888
- ECE : 0.0653 -> 0.0215 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 343 | 6.2% | 17.5% | +11.3 pt |
| 10-20% | 554 | 14.7% | 22.6% | +7.8 pt |
| 20-30% | 550 | 24.3% | 30.0% | +5.7 pt |
| 30-40% | 461 | 33.9% | 29.1% | -4.8 pt |
| 40-50% | 827 | 40.6% | 35.4% | -5.2 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 10-20% | 341 | 14.1% | 17.3% | +3.2 pt |
| 20-30% | 643 | 24.5% | 23.8% | -0.7 pt |
| 30-40% | 1745 | 34.7% | 32.4% | -2.4 pt |
| 40-50% | 6 | 44.4% | 0.0% | -44.4 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### AWAY_CLEAN_SHEET

**Fit (TRAIN, 4230 lignes)** : Brier 0.1663 -> 0.1634, ECE 0.0384 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1734 -> 0.1718 (amelioration)
- Log loss : 0.5329 -> 0.5296
- ECE : 0.0334 -> 0.0109 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 597 | 5.6% | 12.2% | +6.6 pt |
| 10-20% | 677 | 14.5% | 19.4% | +4.9 pt |
| 20-30% | 589 | 24.2% | 24.8% | +0.6 pt |
| 30-40% | 872 | 34.2% | 32.5% | -1.8 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 51 | 6.7% | 9.8% | +3.1 pt |
| 10-20% | 1122 | 15.3% | 16.3% | +1.0 pt |
| 20-30% | 938 | 24.0% | 24.0% | +0.0 pt |
| 30-40% | 612 | 32.7% | 35.0% | +2.3 pt |
| 70-80% | 12 | 72.7% | 50.0% | -22.7 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### HOME_WIN_TO_NIL

**Fit (TRAIN, 4230 lignes)** : Brier 0.1776 -> 0.1748, ECE 0.0324 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1719 -> 0.1705 (amelioration)
- Log loss : 0.53 -> 0.5209
- ECE : 0.0337 -> 0.0162 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 549 | 5.5% | 12.6% | +7.1 pt |
| 10-20% | 726 | 14.4% | 19.3% | +4.9 pt |
| 20-30% | 796 | 24.8% | 24.6% | -0.1 pt |
| 30-40% | 664 | 34.6% | 32.1% | -2.6 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 220 | 6.5% | 8.2% | +1.7 pt |
| 10-20% | 545 | 15.7% | 16.7% | +1.0 pt |
| 20-30% | 1421 | 24.0% | 22.8% | -1.2 pt |
| 30-40% | 390 | 32.8% | 33.8% | +1.1 pt |
| 40-50% | 159 | 41.9% | 33.3% | -8.6 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### AWAY_WIN_TO_NIL

**Fit (TRAIN, 4230 lignes)** : Brier 0.1253 -> 0.1238, ECE 0.0197 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1374 -> 0.1375 (PAS d'amelioration)
- Log loss : 0.4446 -> 0.4408
- ECE : 0.0249 -> 0.0151 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 940 | 5.0% | 8.7% | +3.8 pt |
| 10-20% | 846 | 14.2% | 16.7% | +2.5 pt |
| 20-30% | 743 | 23.4% | 24.2% | +0.8 pt |
| 30-40% | 206 | 31.5% | 34.5% | +2.9 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 645 | 7.4% | 8.5% | +1.1 pt |
| 10-20% | 1293 | 13.7% | 15.8% | +2.1 pt |
| 20-30% | 604 | 24.1% | 24.3% | +0.2 pt |
| 30-40% | 113 | 30.5% | 32.7% | +2.3 pt |
| 40-50% | 80 | 42.6% | 38.8% | -3.8 pt |

**Decision** : NON branche — le holdout ne montre pas une amelioration simultanee de Brier ET ECE, brancher quand meme serait livrer un correctif non valide par les donnees.

### HOME_WIN_OVER_1_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.2157 -> 0.2065, ECE 0.0702 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.2144 -> 0.2075 (amelioration)
- Log loss : 0.618 -> 0.6028
- ECE : 0.0623 -> 0.0271 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 100 | 8.4% | 12.0% | +3.6 pt |
| 10-20% | 454 | 15.4% | 15.9% | +0.5 pt |
| 20-30% | 690 | 24.1% | 27.1% | +3.0 pt |
| 30-40% | 414 | 34.3% | 35.5% | +1.2 pt |
| 40-50% | 339 | 44.3% | 37.8% | -6.5 pt |
| 50-60% | 272 | 54.2% | 43.8% | -10.4 pt |
| 60-70% | 215 | 64.3% | 44.2% | -20.1 pt |
| 70-80% | 251 | 75.6% | 57.4% | -18.2 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 92 | 8.9% | 13.0% | +4.1 pt |
| 10-20% | 228 | 13.2% | 15.4% | +2.2 pt |
| 20-30% | 1056 | 26.5% | 24.6% | -1.9 pt |
| 30-40% | 563 | 35.6% | 39.6% | +4.0 pt |
| 40-50% | 467 | 42.5% | 41.8% | -0.7 pt |
| 50-60% | 221 | 54.9% | 52.0% | -2.9 pt |
| 60-70% | 18 | 65.4% | 66.7% | +1.3 pt |
| 70-80% | 90 | 71.9% | 57.8% | -14.1 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### HOME_WIN_OVER_2_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.1965 -> 0.1855, ECE 0.0695 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.193 -> 0.1845 (amelioration)
- Log loss : 0.5702 -> 0.5519
- ECE : 0.0639 -> 0.0087 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 133 | 7.8% | 15.0% | +7.2 pt |
| 10-20% | 896 | 14.8% | 16.6% | +1.9 pt |
| 20-30% | 517 | 24.3% | 24.8% | +0.4 pt |
| 30-40% | 407 | 34.3% | 29.0% | -5.3 pt |
| 40-50% | 282 | 44.6% | 31.9% | -12.7 pt |
| 50-60% | 200 | 54.3% | 37.5% | -16.8 pt |
| 60-70% | 181 | 64.5% | 48.6% | -15.9 pt |
| 70-80% | 119 | 70.9% | 48.7% | -22.2 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 92 | 7.1% | 12.0% | +4.9 pt |
| 10-20% | 563 | 14.1% | 13.9% | -0.2 pt |
| 20-30% | 1286 | 24.8% | 25.0% | +0.3 pt |
| 30-40% | 526 | 34.8% | 35.2% | +0.3 pt |
| 40-50% | 172 | 46.1% | 48.3% | +2.1 pt |
| 50-60% | 96 | 58.5% | 49.0% | -9.5 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### HOME_WIN_OVER_3_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.1318 -> 0.1199, ECE 0.0675 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1256 -> 0.1159 (amelioration)
- Log loss : 0.4064 -> 0.3851
- ECE : 0.0566 -> 0.009 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 1014 | 6.2% | 6.3% | +0.1 pt |
| 10-20% | 665 | 14.0% | 13.8% | -0.2 pt |
| 20-30% | 410 | 24.0% | 17.8% | -6.1 pt |
| 30-40% | 262 | 34.2% | 18.3% | -15.9 pt |
| 40-50% | 161 | 44.5% | 25.5% | -19.0 pt |
| 50-60% | 223 | 54.5% | 29.6% | -24.9 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 1208 | 7.3% | 7.1% | -0.1 pt |
| 10-20% | 653 | 13.9% | 15.5% | +1.5 pt |
| 20-30% | 741 | 21.8% | 21.2% | -0.6 pt |
| 30-40% | 125 | 36.2% | 29.6% | -6.6 pt |
| 40-50% | 8 | 40.0% | 37.5% | -2.5 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### HOME_WIN_UNDER_2_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.1405 -> 0.138, ECE 0.0364 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1363 -> 0.1349 (amelioration)
- Log loss : 0.4516 -> 0.4518
- ECE : 0.039 -> 0.0084 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 928 | 5.5% | 12.0% | +6.5 pt |
| 10-20% | 1162 | 14.2% | 17.4% | +3.2 pt |
| 20-30% | 645 | 21.7% | 20.2% | -1.5 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 338 | 7.5% | 8.9% | +1.4 pt |
| 10-20% | 1691 | 16.3% | 15.5% | -0.8 pt |
| 20-30% | 704 | 21.9% | 21.4% | -0.5 pt |
| 50-60% | 2 | 50.0% | 0.0% | -50.0 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### HOME_WIN_UNDER_3_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.2062 -> 0.2018, ECE 0.047 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.2029 -> 0.2007 (amelioration)
- Log loss : 0.5991 -> 0.5959
- ECE : 0.0448 -> 0.0119 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 288 | 6.9% | 14.2% | +7.4 pt |
| 10-20% | 628 | 14.9% | 23.7% | +8.8 pt |
| 20-30% | 792 | 24.9% | 29.9% | +5.1 pt |
| 30-40% | 1027 | 34.3% | 34.9% | +0.6 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 126 | 8.4% | 13.5% | +5.1 pt |
| 10-20% | 327 | 16.4% | 18.3% | +1.9 pt |
| 20-30% | 647 | 26.3% | 25.5% | -0.8 pt |
| 30-40% | 1628 | 34.0% | 33.3% | -0.7 pt |
| 40-50% | 3 | 40.0% | 0.0% | -40.0 pt |
| 50-60% | 4 | 50.0% | 25.0% | -25.0 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### AWAY_WIN_OVER_1_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.1709 -> 0.165, ECE 0.0461 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1861 -> 0.1798 (amelioration)
- Log loss : 0.557 -> 0.543
- ECE : 0.0652 -> 0.0227 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 333 | 6.9% | 10.8% | +3.9 pt |
| 10-20% | 942 | 15.0% | 19.4% | +4.4 pt |
| 20-30% | 465 | 24.3% | 23.7% | -0.6 pt |
| 30-40% | 361 | 34.5% | 30.2% | -4.3 pt |
| 40-50% | 230 | 44.1% | 33.9% | -10.2 pt |
| 50-60% | 195 | 53.9% | 36.4% | -17.5 pt |
| 60-70% | 117 | 64.3% | 36.8% | -27.5 pt |
| 70-80% | 92 | 71.1% | 54.3% | -16.7 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 117 | 5.7% | 13.7% | +8.0 pt |
| 10-20% | 618 | 12.0% | 14.1% | +2.1 pt |
| 20-30% | 1066 | 22.6% | 23.0% | +0.3 pt |
| 30-40% | 680 | 31.9% | 32.9% | +1.1 pt |
| 40-50% | 71 | 42.6% | 31.0% | -11.6 pt |
| 50-60% | 79 | 51.9% | 40.5% | -11.4 pt |
| 60-70% | 104 | 62.8% | 51.9% | -10.9 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### AWAY_WIN_OVER_2_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.1481 -> 0.1415, ECE 0.0476 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1595 -> 0.1506 (amelioration)
- Log loss : 0.4952 -> 0.4763
- ECE : 0.0702 -> 0.0213 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 484 | 6.8% | 9.5% | +2.7 pt |
| 10-20% | 1051 | 13.4% | 16.7% | +3.3 pt |
| 20-30% | 433 | 24.4% | 20.8% | -3.6 pt |
| 30-40% | 306 | 33.8% | 22.5% | -11.3 pt |
| 40-50% | 206 | 44.4% | 29.1% | -15.3 pt |
| 50-60% | 127 | 54.2% | 24.4% | -29.8 pt |
| 60-70% | 128 | 62.7% | 43.0% | -19.7 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 436 | 7.3% | 8.7% | +1.5 pt |
| 10-20% | 915 | 13.6% | 15.8% | +2.2 pt |
| 20-30% | 1027 | 23.2% | 22.2% | -1.0 pt |
| 30-40% | 190 | 31.4% | 25.8% | -5.6 pt |
| 40-50% | 167 | 45.6% | 39.5% | -6.1 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### AWAY_WIN_OVER_3_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.0879 -> 0.0802, ECE 0.0484 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.0916 -> 0.0825 (amelioration)
- Log loss : 0.3217 -> 0.2994
- ECE : 0.0577 -> 0.0117 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 1441 | 4.9% | 6.0% | +1.1 pt |
| 10-20% | 613 | 13.8% | 10.4% | -3.4 pt |
| 20-30% | 299 | 23.8% | 12.0% | -11.8 pt |
| 30-40% | 164 | 33.7% | 16.5% | -17.3 pt |
| 40-50% | 218 | 45.4% | 18.8% | -26.6 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 1788 | 6.2% | 6.9% | +0.7 pt |
| 10-20% | 729 | 14.1% | 12.3% | -1.7 pt |
| 20-30% | 214 | 21.8% | 18.7% | -3.1 pt |
| 40-50% | 1 | 46.9% | 0.0% | -46.9 pt |
| 50-60% | 3 | 50.0% | 33.3% | -16.7 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### AWAY_WIN_UNDER_2_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.1029 -> 0.1018, ECE 0.0187 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1141 -> 0.1136 (amelioration)
- Log loss : 0.3927 -> 0.3968
- ECE : 0.0293 -> 0.0145 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 1261 | 4.9% | 9.4% | +4.5 pt |
| 10-20% | 1474 | 15.0% | 16.6% | +1.6 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 879 | 6.9% | 8.4% | +1.5 pt |
| 10-20% | 1494 | 13.1% | 14.6% | +1.5 pt |
| 20-30% | 358 | 20.4% | 19.8% | -0.6 pt |
| 40-50% | 1 | 39.8% | 0.0% | -39.8 pt |
| 50-60% | 3 | 50.0% | 0.0% | -50.0 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

### AWAY_WIN_UNDER_3_5

**Fit (TRAIN, 4230 lignes)** : Brier 0.1612 -> 0.1592, ECE 0.027 -> 0 (sanity check — le fit voit ces donnees, une amelioration ici est attendue et NE PROUVE RIEN a elle seule).

**Validation (HOLDOUT, 2735 lignes, jamais vues par le fit)** :

- Brier : 0.1742 -> 0.1736 (amelioration)
- Log loss : 0.5356 -> 0.5294
- ECE : 0.0399 -> 0.0256 (amelioration)

Table de fiabilite HOLDOUT AVANT calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 546 | 5.9% | 13.2% | +7.3 pt |
| 10-20% | 796 | 14.4% | 18.2% | +3.8 pt |
| 20-30% | 954 | 24.7% | 28.0% | +3.3 pt |
| 30-40% | 439 | 32.6% | 34.4% | +1.8 pt |

Table de fiabilite HOLDOUT APRES calibration :

| Tranche predite | n | Proba. moy. predite | Taux reel | Ecart |
|---|---|---|---|---|
| 0-10% | 268 | 7.5% | 12.3% | +4.9 pt |
| 10-20% | 941 | 15.5% | 16.6% | +1.1 pt |
| 20-30% | 778 | 23.0% | 27.0% | +4.0 pt |
| 30-40% | 745 | 33.6% | 31.5% | -2.0 pt |
| 50-60% | 3 | 50.0% | 33.3% | -16.7 pt |

**Decision** : BRANCHE en production (`lib/data/calibration-params.json` -> `wired:true` pour ce marche, `lib/engine.js#calcFinalProbs` applique la courbe sur sa sortie).

## Cout de calcul (garde-fou explicite de la tache)

- Chaque courbe fittee contient un petit nombre de points de rupture (1X2: 76 pts, OVER_2_5: 24 pts, BTTS_YES: 28 pts) — trois ordres de grandeur en dessous du volume de lignes d'entrainement.
- `applyIsotonicCurve`/`applyCalibration` (`lib/calibration.js`) fait une recherche BINAIRE sur ce tableau de points (O(log n) par appel, n = quelques centaines au plus) suivie d'une interpolation lineaire — aucune boucle sur le dataset d'entrainement au moment de la prediction, aucun appel reseau, aucune reconstruction de la courbe. Le fit lui-meme (PAVA, O(n log n) pour le tri initial) ne tourne JAMAIS en production — uniquement dans ce script, hors-ligne, sur demande — son cout n'affecte ni le site public ni le pipeline quotidien.
- Le fichier de parametres (`lib/data/calibration-params.json`) est charge une seule fois via `require(...)` au chargement du module `lib/engine.js` (comme tout fichier JSON require par Node — mis en cache par le runtime), jamais relu par prediction.
- **Mesure directe** (2026-09-13, `node -e` isolant `applyCalibration`+`renormalizeToSumOne` sur la courbe 1X2 reelle, 2 000 000 iterations, machine sous forte charge concurrente - donc un majorant, pas un plancher) : **~431 nanosecondes** pour une calibration 1X2 complete (3 appels `applyCalibration` + 1 `renormalizeToSumOne`) — a comparer aux millisecondes que prend deja `calcFinalProbs` pour sa matrice Dixon-Coles adaptative et ses 5000 simulations Monte-Carlo : la calibration ajoute un surcout de l'ordre de 4 a 5 ordres de grandeur en dessous du calcul existant, negligeable au sens strict du terme.

## Limites et avertissements explicites

1. **Effet de bord non corrige (hors perimetre autorise de cette tache)** : `.github/workflows/update-data.yml` calcule un `model_agreement` (accord Poisson/Dixon-Coles/Monte-Carlo) en comparant `pureProbs.p1` (calibre si branche) a `pureProbs.dixon.p1`/`pureProbs.montecarlo.p1` (jamais calibres — sous-objets de diagnostic bruts, intentionnellement non touches par cette tache, voir section suivante). Consequence attendue : sur les tranches ou la correction de calibration est la plus forte (haute confiance), l'ecart entre le p1 calibre et les sous-modeles bruts va mecaniquement augmenter, ce qui peut faire baisser artificiellement le label `model_agreement` (Fort/Moyen/Faible) sans que les modeles sous-jacents aient reellement moins convergé. Signale ici pour decision produit separee — ne PAS corriger silencieusement en modifiant `update-data.yml`, hors du perimetre confie pour cette tache (`lib/engine.js`, `lib/models.js`, `lib/calibration.js`).
2. **Champs NON calibres, intentionnellement** : `poisson`/`dixon`/`montecarlo` (sous-objets de diagnostic bruts, utilises pour `model_agreement` et l'affichage de transparence "accord entre modeles"), les lignes non mesurees ici (Over/Under 0.5 et 4.5+, totaux par equipe 0.5/2.5/3.5, scores exacts, bandes de buts), la premiere mi-temps (aucun score a la mi-temps dans `data/gate-b1`) et les marches de tirs (modele distinct, aucun decompte de tirs resolu hors-ligne). Double chance 1X / X2 ne recoivent pas de courbe propre : elles sont derivees des probabilites 1X2 deja calibrees. Depuis le 18/09/2026, `derived` est calibre EN PLACE par `lib/engine.js` pour tous les marches marques `wired:true` ; la copie brute vit dans `derived_raw`.
3. **Fit global (5 ligues)** : voir section granularite ci-dessus — un biais de calibration futur structurellement different par ligue ne serait pas capture par une seule courbe partagee.
4. **Warmup et perimetre identiques au diagnostic original** (moteur COEUR uniquement, aucun blend saison precedente/xG/Elo/marche, aucune cote disponible dans `data/gate-b1`) — voir `CURRENT_ENGINE_CALIBRATION_REPORT.md` pour le detail complet, non repete ici.
5. **Clamp de coherence sur Over/Under 2.5** (voir section OVER_2_5 ci-dessus) : se declenche sur 15.8% des matchs reels (1097/6965) — pas un cas marginal. Consequence directe : la correction de calibration sur Over/Under 2.5 est PLUS FAIBLE que ce qu'une courbe isotonic non contrainte produirait, sur une part non negligeable des matchs a fort volume de buts attendu. C'est un compromis assume (coherence mathematique inter-marches > correction maximale sur un seul marche isole) plutot qu'un defaut cache — les chiffres AVANT/APRES de ce rapport le refletent deja honnetement.
6. **`buildCalibrationRows` (`scripts/backtest-current-engine-offline.js`) lit `finalProbs.derived_raw` (copie PRE-calibration), jamais `derived` ni les champs top-level** : necessaire depuis que `lib/engine.js#calcFinalProbs` retourne des champs DEJA calibres — sinon tout refit futur calibrerait une correction par-dessus une correction deja appliquee, et `CURRENT_ENGINE_CALIBRATION_REPORT.md` cesserait silencieusement de mesurer le moteur COEUR des qu'on le regenere. Verifie explicitement : `node scripts/backtest-current-engine-offline.js` reproduit `CURRENT_ENGINE_CALIBRATION_REPORT.md` chiffre pour chiffre (seul le timestamp de generation differe) meme avec la calibration branchee live.

## Reproductibilite

```
node scripts/fit-and-validate-calibration.js
```

Ce script est 100% offline (reutilise `data/gate-b1/*.json`), n'est branche dans AUCUNE page publique ni pipeline GitHub Actions — c'est un outil d'ajustement/validation a executer manuellement quand une re-calibration est necessaire (nouvelles saisons resolues, changement du moteur coeur, etc.), pas un service en production.
