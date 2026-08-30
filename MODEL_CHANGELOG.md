# IASHARK — Changelog du moteur (MASTER V2.1 §10.AP)

Changements qui affectent le calcul des probabilités, marchés, edge/Kelly ou la manière dont ils sont décidés. Journal complet et non-technique dans `IASHARK_V2_EXECUTION_STATE.md` ; ce fichier ne liste que ce qui touche le moteur lui-même.

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
