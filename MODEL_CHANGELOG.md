# IASHARK — Changelog du moteur (MASTER V2.1 §10.AP)

Changements qui affectent le calcul des probabilités, marchés, edge/Kelly ou la manière dont ils sont décidés. Journal complet et non-technique dans `IASHARK_V2_EXECUTION_STATE.md` ; ce fichier ne liste que ce qui touche le moteur lui-même.

## 2026-09-18 (nuit) — buteur le plus probable avant les compositions

- **Constat** : la carte « Marchés joueurs » classait les joueurs sur leurs buts et tirs cadrés par 90 minutes de la saison en cours, sans regarder s'ils jouent. Sur les 137 matchs publiés le 18/09, le buteur mis en avant n'avait été titulaire dans aucun des 5 derniers matchs de son équipe dans 12 cas (Tottenham – Aston Villa : Alysson Edward, 1 but en 87 minutes, 21,7 %), et des attaquants titulaires sans but s'affichaient à 0 %. Le sélecteur du pipeline (`top_scorers`, buteurs cités dans le texte d'analyse) ignorait aussi les blessés annoncés.
- **Fix** : calcul unique `lib/insights.js#scorerModel` (déjà chargé par toutes les pages match, aucune page HTML modifiée) :
  - estimation de titularisation sur les 5 derniers matchs de l'équipe, pondérée vers le plus récent ; les matchs avant la première feuille d'une recrue ne comptent pas ;
  - minutes attendues ;
  - taux de buts régularisé vers la moyenne du poste, avec les tirs cadrés à 75 % : une série sans but d'un joueur qui cadre ne le fait plus disparaître ;
  - part du joueur dans les buts de son équipe ;
  - buts attendus de l'équipe dans ce match selon le moteur (`lambda_h`/`lambda_a`, qui intègrent la défense adverse) ;
  - P = 1 − exp(−0,8 × λ × part).
  - Seuls les titulaires probables sont mis en avant, jamais un absent annoncé ni un joueur sorti de l'effectif. L'affichage est plafonné à 45 %.
- **Branchements** :
  - `lib/match-view-model.js#prelineupScorers` remplace `scoringThreatRanking` + `withScoringProbability` ;
  - la carte affiche le nombre réel de titularisations récentes (« 4/5 »). L'estimation de titularisation n'est jamais publiée (décision du 04/09) ;
  - `lib/markets/top-scorer-picker.js` sélectionne via le même calcul quand le pipeline passe `context` (lambdas définitifs + blessés). L'appel dans `update-data.yml` est déplacé après le calcul des lambdas. Le score de menace /100 reste publié pour la fiche joueur.
- **Réglage hors échantillon** (`scripts/backtest-prelineup-scorer.js`, Premier League, le calcul ne voit que les 10 dernières feuilles de chaque équipe, comme `player_history`) :
  - moyennes par poste apprises sur 2022-23 ;
  - poids des tirs et échelle réglés sur 2023-24 ;
  - vérification sur 2024-25 à paramètres gelés, sur 350 matchs.

  | Critère (2024-25) | Nouveau calcul | Méthode précédente | Naïf (plus de buts sur 10 matchs) |
  |---|---|---|---|
  | Buteur mis en avant qui marque | 32,9 % | 25,4 % | 28,3 % |
  | Buteur mis en avant titulaire | 86,6 % | 68,3 % | — |
  | Probabilité moyenne annoncée / observée | 5,10 % / 5,11 % | — | — |

  Calibration : 3/14/24/34 % annoncés → 3/14/24/33 % observés. Au-delà de 40 %, le calcul surestime (44 % → 33 % observés sur 2023-24), d'où le plafond à 45 %.
- **Non traité** : les buteurs ne sont pas encore suivis dans les résultats publiés (aucune mesure en production) ; les penalties ne sont pas modélisés à part ; la calibration a été mesurée en Premier League seulement (à revérifier sur d'autres championnats quand le cache du labo les couvrira).

## 2026-09-18 (soir) — retour arrière : familles dérivées débranchées

- **Constat** (audit du 18/09, données publiées à 11:01 UTC) : les 18 courbes des familles dérivées branchées le matin produisaient des probabilités aberrantes. Apprises sur une plage étroite de probabilités brutes, avec des extrémités portées par très peu d'échantillons (valeurs de bord à 0, 0,5, 0,727 ou 1), elles s'appliquaient hors de leur plage (`applyIsotonicCurve` renvoie alors la valeur de bord). Exemple réel : clean sheet extérieur 35,8 % brut → 72,7 % publié, retenu comme pari du match offert du 19/09 ; « domicile plus de 1,5 but » ramené à 0 sous 28 % brut. Sur une grille réaliste de lambdas, écarts médians de 4 à 9 points et maximums de 20 à 36 points selon la famille. Le gain de Brier/ECE sur le holdout ne voyait pas ces extrémités.
- **Fix** : `lib/data/calibration-params.json` — `wired:false` (+ `unwired_on`, `unwired_reason`) pour ces 18 familles ; seules restent branchées les trois courbes validées le 13/09 (1X2, Over 2.5, BTTS). Le moteur revient au comportement en production avant ce matin ; `derived_raw` et le fit à 22 marchés sont conservés pour le refit.
- **Garde-fous** (`tests/engine-derived-calibration.test.js`) : liste explicite des courbes validées (brancher une famille impose de modifier ce test) et test de couverture — une courbe branchée doit avoir été apprise sur au moins 90 % des probabilités brutes réalistes (il aurait bloqué `HOME_TEAM_OVER_1_5`, `AWAY_CLEAN_SHEET`, `HOME_WIN_UNDER_2_5`).
- **Avant de rebrancher** : refit avec effectif minimal par palier (pas de palier à 0 ou 1 sur une poignée de matchs), aucune extrapolation hors plage (probabilité brute conservée), validation hors échantillon **par déciles de probabilité brute**, pas seulement sur le Brier global.
- **Données publiées** : les picks du run du 18/09 (11:01 UTC) ont été calculés avec les courbes du matin ; ils restent en ligne jusqu'au prochain run de `update-data.yml` (lancement manuel recommandé dès la fusion).

## 2026-09-18 — calibration de toute la matrice de buts

- **Constat** (290 picks réels résolus du moteur déterministe, 30/08 → 14/09) : la règle de sélection (argmax de probabilité) comparait des marchés calibrés (1X2, Over 2.5, BTTS) à des marchés bruts (double chance, totaux par équipe, résultat + total, clean sheet). Les bruts, gonflés par la surconfiance mesurée du moteur cœur, gagnaient l'argmax puis perdaient (double chance −12 %, totaux par équipe −12 % de ROI) pendant que les calibrés gagnaient (O/U +18 %). Rejeu de règles « valeur » sur 31 matchs complets : aucune n'aide, l'EV sans garde-fou est catastrophique — le problème n'est pas le critère, c'est la comparabilité des probabilités.
- **Fix** : `scripts/backtest-current-engine-offline.js#buildCalibrationRows` émet désormais une ligne par match pour 19 familles dérivées (toutes résolubles depuis le score final), `scripts/fit-and-validate-calibration.js` ajuste et valide 22 marchés (train 2021-2023, holdout 2024-2025, 2 735 matchs jamais vus), et `lib/engine.js#calcFinalProbs` applique chaque courbe branchée à `derived` **en place**, puis rétablit la cohérence (échelles O/U et totaux, sous-ensembles bornés par la victoire du camp, gagner sans encaisser ≤ clean sheet). **21 marchés branchés sur 22** ; `AWAY_WIN_TO_NIL` refusé (Brier +0.0001 sur le holdout). ECE des totaux par équipe : 7.6 → 1.5 pt (domicile), 9.7 → 3.7 pt (extérieur).
- `derived_raw` (nouveau) : copie pré-calibration de la matrice, seule entrée des outils de mesure — un refit ne calibre jamais par-dessus une calibration.
- Double chance et Draw No Bet dérivent des 1X2 **calibrés** (jamais une courbe propre). Le clamp d'Over 2.5 s'appuie sur Over 1.5/3.5 désormais calibrés (1X2 et BTTS strictement inchangés ; Over 2.5 bouge sur ~1 match sur 30).
- Aucun changement de `lib/decision.js` ni du pipeline : l'argmax reste l'argmax, il compare enfin des grandeurs homogènes. Garde-fou : `tests/engine-derived-calibration.test.js`.
- Non traité, à mesurer avant d'agir : marchés de tirs (meilleure famille sur 290 picks, +18 %, mais 100 % → 64 % entre les deux moitiés de période, et aucune calibration possible sans décompte de tirs résolu) ; première mi-temps ; prior de ligue constant 1.35/1.10 et planchers 1.05/0.90 de `calcLambdas` ; probabilité « juste » naïve (marge incluse) hors 1X2/O2.5/BTTS.

## 2026-08-29 (suite — fermeture du moteur avant Phase 5)

- **`model_probability` (nouveau champ, 0-100)** devient LA probabilité du marché retenu — jamais appelée "confiance". C'est la dernière valeur calculée par l'ensemble (Poisson/Dixon-Coles/Monte-Carlo/Elo, +ancrage marché Shin pour 1X2/DC), tracée dans le code pour confirmer qu'aucune valeur intermédiaire ne fuite (voir `MODEL_ARCHITECTURE.md`, section "asymétrie entre marchés").
- **`reliability` (nouveau champ, objet)** — fiabilité/confiance, explicitement séparée de la probabilité. Composite de 3 signaux mesurables (`lib/decision.js#computeReliability`, 7 tests) : accord des modèles, qualité des données, taille d'échantillon réelle (jamais une valeur de repli déguisée). `historical_calibration` vaut `NOT_AVAILABLE_YET` — honnête plutôt que fabriqué, aucune prédiction post-fix n'a encore été résolue pour mesurer ça.
- **`conf` devient un ALIAS EXPLICITEMENT DÉPRÉCIÉ** (commenté comme tel dans le code) — conservé uniquement pour compatibilité frontend/`historique.json`, vaut toujours `model_probability/10`. À retirer en Phase 5 une fois le frontend migré vers `model_probability` + `reliability` (chercher toutes les lectures de `.conf`/`conf_bucket` dans `match.html`/`pro.html`/`historique.html`/`compte.html` avant suppression).
- **Comparaison avant/après demandée explicitement** — voir `CALIBRATION_REPORT.md` pour le détail complet et sa limite honnête : impossible de reconstituer le pipeline déterministe réel sur les données historiques (probabilité modèle jamais stockée par prédiction). Fait à la place : `OLD_PIPELINE` (confiance LLM) vs `MARKET_IMPLIED_PROBABILITY_PROXY` (1/cote) — le proxy est meilleur (Brier 0.2497 vs 0.2814) mais ce n'est **pas une preuve** que le fix a amélioré la calibration du moteur réel, seulement un indice cohérent avec l'hypothèse.

## 2026-08-29

- **[BREAKING pour la calibration]** `matchObj.conf` n'est plus l'auto-évaluation du LLM (`an.confiance`) mais la probabilité réelle du modèle pour le marché retenu (`pickedMarket.prob`), calculée en code déterministe. L'ancien champ a été mesuré comme activement désinformatif (Brier 0.2814 > repère pile-ou-face 0.25 — voir `CALIBRATION_REPORT.md`).
- Sélection du marché (`pari_rec`/`cote_rec`/`marche`) déplacée du LLM (texte libre) vers `lib/decision.js#pickMarketDeterministic` (règle déjà documentée dans le prompt mais jamais codée : marché de plus haute probabilité modèle parmi ceux avec cote ≥ 1.50).
- Kelly/edge (`lib/betting.js#fractionalKelly`/`edgePoints`) désormais calculés à partir du marché choisi par le code, plus par matching flou (`nmMkt`) sur le texte renvoyé par le LLM.
- Ajout `computeRiskLabel`, `computeModelAgreement` (§10.AB), `computeDataQualityScore` V1 (§11.1) — tous déterministes, tous testés (`lib/decision.js`, 16 tests).
- Extraction `lib/team-strength.js` (§10.D, Dynamic Team Strength — decay temporel, ajustement adversaire, home advantage dynamique) — construit et testé, **pas branché en production** (statut EXPERIMENTAL).
- Extraction `lib/markets/score-matrix.js` (§10.V, score distribution → marchés) — une seule matrice alimente 1X2/DC/DNB/O-U/team totals/BTTS/clean sheet/win to nil/exact score/bandes de buts. Construit et testé, coexiste avec l'ancien `calcFinalProbs` inline (pas encore remplacé).
- Resolver O/U généralisé de 3 lignes codées en dur (1.5/2.5/3.5) à une regex numérique couvrant 0.5-6.5+ (équivalence mathématique prouvée sur les lignes existantes).
- Ajout resolver Draw No Bet (WIN/LOSS/VOID sur nul).
- **Bug corrigé** : lignes de handicap asiatique en quart (.25/.75) auraient été résolues comme WIN/LOSS complet — le vrai règlement nécessite un demi-gain/demi-perte, non supporté par le contrat de retour actuel de `resolveMarketWin`. Refuse maintenant explicitement (`null`) plutôt que de mal compter.
- `MARKET_REGISTRY` créé (`lib/market-registry.js` + `IASHARK_MARKET_REGISTRY.md`) : 6 marchés `MODELLED_AND_VALIDATED`, 5 `MODELLED_EXPERIMENTAL`, 5 `NOT_SUPPORTED`.
- Suppression complète de SportMonks (6 mécanismes de secours à base de matching flou par nom) — api-football seul reste la source, `fixture_id` l'identité canonique.
- `parseOdds` extrait et branché (`lib/odds.js`), plus de copie inline dans le pipeline.
- Infrastructure de collecte forward : `match_snapshots` (`'prediction'` + `'closing'`) — voir `ODDS_SNAPSHOT_POLICY.md`.
- `lib/calibration.js` (Brier/log loss/ECE/table de fiabilité) créé et exécuté sur données réelles — voir `CALIBRATION_REPORT.md`.

## Avant cette session (résumé, voir `git log` pour le détail)

- Kelly réel (`fractionalKelly`) remplaçant une constante `kellyVal='2'` codée en dur.
- Edge réel (`modelProb - marketProb`) remplaçant l'ancien champ qui était en fait la probabilité du modèle seule, mal étiquetée "edge".
- VOID/push géré pour les handicaps et les matchs reportés/annulés (auparavant bloqués indéfiniment en `'scheduled'`).
- ROI exclut les cotes manquantes du calcul (auparavant remplacées par une valeur fictive `1.75`).
