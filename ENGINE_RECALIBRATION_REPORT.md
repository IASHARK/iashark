# IASHARK — Recalibration post-hoc du moteur DETERMINISTE actuel (isotonic regression)

_Genere le 2026-09-12T23:31:04.133Z par `scripts/fit-and-validate-calibration.js`. Ne remplace PAS `CURRENT_ENGINE_CALIBRATION_REPORT.md` (diagnostic original, inchange) — ce rapport-ci documente le FIX applique par-dessus (isotonic regression post-hoc) et son effet MESURE sur une portion de donnees jamais vue par le fit.

## Contexte et demande

`CURRENT_ENGINE_CALIBRATION_REPORT.md` a etabli que le moteur coeur (`lib/engine.js#calcFinalProbs`) a un signal reel (bat nettement le pile-ou-face) mais est **systematiquement surconfiant en haut d'echelle** (ex: 80-90% predit sur 1X2 -> ~71.5% reel ; 90%+ sur Over/Under 2.5 -> ~52% reel) et **sous-confiant en bas d'echelle**. Demande explicite du proprietaire produit : recalibrer la confiance affichee, sans reconstruire le moteur. Ce rapport documente une correction post-hoc (couche de recalibration appliquee APRES le calcul Poisson/Dixon-Coles/Monte-Carlo, qui reste totalement inchange) et sa validation.

## Methode de fit : isotonic regression (PAVA), pas Platt/logistic scaling

- **Pourquoi pas Platt/logistic scaling** : Platt ajuste une sigmoide a 2 parametres sur logit(proba) — une forme parametrique fixe qui suppose une courbure de biais constante. Le pattern diagnostique (sous-confiant en bas, surconfiant en haut, amplitudes differentes par marche) est monotone mais n'a pas une courbure de sigmoide unique evidente.
- **Pourquoi isotonic regression (PAVA)** : n'impose qu'une seule contrainte — la monotonie (une probabilite modele plus elevee ne doit jamais correspondre a un taux reel plus faible, deja vrai par construction pour une calibration de probabilite) — et laisse les donnees dicter la forme exacte de la courbe, sans risque de mauvaise specification parametrique. Implementee dans `lib/calibration.js` (`poolAdjacentViolators`, `fitIsotonicCurve`, `applyIsotonicCurve`/`applyCalibration`), zero dependance externe (vanilla JS, coherent avec le reste du codebase).
- **Cout connu** : isotonic regression peut surapprendre sur de petits echantillons (chaque coude de la courbe est litteralement un point de donnee sur les cas extremes). Mitige par le choix de granularite ci-dessous.

## Granularite du fit : GLOBAL (5 ligues combinees), pas par ligue

- Chaque marche (1X2, Over/Under 2.5, BTTS) recoit **une seule courbe de calibration, ajustee sur les 5 ligues combinees** — jamais une courbe par ligue.
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

## Cout de calcul (garde-fou explicite de la tache)

- Chaque courbe fittee contient un petit nombre de points de rupture (1X2: 76 pts, OVER_2_5: 24 pts, BTTS_YES: 28 pts) — trois ordres de grandeur en dessous du volume de lignes d'entrainement.
- `applyIsotonicCurve`/`applyCalibration` (`lib/calibration.js`) fait une recherche BINAIRE sur ce tableau de points (O(log n) par appel, n = quelques centaines au plus) suivie d'une interpolation lineaire — aucune boucle sur le dataset d'entrainement au moment de la prediction, aucun appel reseau, aucune reconstruction de la courbe. Le fit lui-meme (PAVA, O(n log n) pour le tri initial) ne tourne JAMAIS en production — uniquement dans ce script, hors-ligne, sur demande — son cout n'affecte ni le site public ni le pipeline quotidien.
- Le fichier de parametres (`lib/data/calibration-params.json`) est charge une seule fois via `require(...)` au chargement du module `lib/engine.js` (comme tout fichier JSON require par Node — mis en cache par le runtime), jamais relu par prediction.
- **Mesure directe** (2026-09-13, `node -e` isolant `applyCalibration`+`renormalizeToSumOne` sur la courbe 1X2 reelle, 2 000 000 iterations, machine sous forte charge concurrente - donc un majorant, pas un plancher) : **~431 nanosecondes** pour une calibration 1X2 complete (3 appels `applyCalibration` + 1 `renormalizeToSumOne`) — a comparer aux millisecondes que prend deja `calcFinalProbs` pour sa matrice Dixon-Coles adaptative et ses 5000 simulations Monte-Carlo : la calibration ajoute un surcout de l'ordre de 4 a 5 ordres de grandeur en dessous du calcul existant, negligeable au sens strict du terme.

## Limites et avertissements explicites

1. **Effet de bord non corrige (hors perimetre autorise de cette tache)** : `.github/workflows/update-data.yml` calcule un `model_agreement` (accord Poisson/Dixon-Coles/Monte-Carlo) en comparant `pureProbs.p1` (calibre si branche) a `pureProbs.dixon.p1`/`pureProbs.montecarlo.p1` (jamais calibres — sous-objets de diagnostic bruts, intentionnellement non touches par cette tache, voir section suivante). Consequence attendue : sur les tranches ou la correction de calibration est la plus forte (haute confiance), l'ecart entre le p1 calibre et les sous-modeles bruts va mecaniquement augmenter, ce qui peut faire baisser artificiellement le label `model_agreement` (Fort/Moyen/Faible) sans que les modeles sous-jacents aient reellement moins convergé. Signale ici pour decision produit separee — ne PAS corriger silencieusement en modifiant `update-data.yml`, hors du perimetre confie pour cette tache (`lib/engine.js`, `lib/models.js`, `lib/calibration.js`).
2. **Champs NON calibres, intentionnellement** : `derived` (matrice complete de marches non valides par le backtest — double chance, team totals, clean sheet, etc.), `poisson`/`dixon`/`montecarlo` (sous-objets de diagnostic bruts, utilises pour `model_agreement` et l'affichage de transparence "accord entre modeles"), `over15`/`over35` (jamais mesures par `CURRENT_ENGINE_CALIBRATION_REPORT.md`, donc jamais recalibres sans preuve). Seuls `p1`/`pN`/`p2`, `over25`/`under25`, `bttsY`/`bttsN` sont concernes — exactement les champs mesures par le backtest.
3. **Fit global (5 ligues)** : voir section granularite ci-dessus — un biais de calibration futur structurellement different par ligue ne serait pas capture par une seule courbe partagee.
4. **Warmup et perimetre identiques au diagnostic original** (moteur COEUR uniquement, aucun blend saison precedente/xG/Elo/marche, aucune cote disponible dans `data/gate-b1`) — voir `CURRENT_ENGINE_CALIBRATION_REPORT.md` pour le detail complet, non repete ici.
5. **Clamp de coherence sur Over/Under 2.5** (voir section OVER_2_5 ci-dessus) : se declenche sur 15.8% des matchs reels (1097/6965) — pas un cas marginal. Consequence directe : la correction de calibration sur Over/Under 2.5 est PLUS FAIBLE que ce qu'une courbe isotonic non contrainte produirait, sur une part non negligeable des matchs a fort volume de buts attendu. C'est un compromis assume (coherence mathematique inter-marches > correction maximale sur un seul marche isole) plutot qu'un defaut cache — les chiffres AVANT/APRES de ce rapport le refletent deja honnetement.
6. **`buildCalibrationRows` (`scripts/backtest-current-engine-offline.js`) lit `finalProbs.derived`, jamais les champs top-level** : necessaire depuis que `lib/engine.js#calcFinalProbs` peut retourner des champs top-level DEJA calibres — sinon tout refit futur calibrerait une correction par-dessus une correction deja appliquee, et `CURRENT_ENGINE_CALIBRATION_REPORT.md` cesserait silencieusement de mesurer le moteur COEUR des qu'on le regenere. Verifie explicitement : `node scripts/backtest-current-engine-offline.js` reproduit `CURRENT_ENGINE_CALIBRATION_REPORT.md` chiffre pour chiffre (seul le timestamp de generation differe) meme avec la calibration branchee live.

## Reproductibilite

```
node scripts/fit-and-validate-calibration.js
```

Ce script est 100% offline (reutilise `data/gate-b1/*.json`), n'est branche dans AUCUNE page publique ni pipeline GitHub Actions — c'est un outil d'ajustement/validation a executer manuellement quand une re-calibration est necessaire (nouvelles saisons resolues, changement du moteur coeur, etc.), pas un service en production.
