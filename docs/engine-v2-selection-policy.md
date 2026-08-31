# Moteur IASHARK V2 — politique de sélection

## Objectif

Le moteur cherche, parmi les marchés qu'il sait réellement modéliser et pour lesquels une cote réelle existe, la sélection ayant la probabilité IASHARK la plus élevée. Il ne cherche pas à reproduire le choix d'un bookmaker et aucune famille de marché n'est prioritaire.

## Ordre de décision

1. Construire une distribution de scores cohérente à partir des données sportives uniquement.
2. En dériver toutes les probabilités compatibles avec cette distribution, à pleine précision.
3. Écarter toute sélection sans cote réelle ou dont la cote est inférieure à `1,50`.
4. Classer les sélections restantes par probabilité IASHARK décroissante.
5. En cas d'égalité, utiliser la fiabilité des données puis l'identifiant stable du marché, jamais l'ordre du tableau.
6. S'abstenir si aucune sélection n'est éligible ou si les données sportives minimales manquent.

Les cotes sont donc un filtre d'éligibilité et une information de prix. Elles n'entrent pas dans la probabilité `PURE_IASHARK_PROBABILITY`.

## Début de saison

- Les matchs officiels de la saison courante sont utilisés avec leur nombre réel, y compris zéro.
- La saison précédente sert de prior régularisé, plafonné puis progressivement réduit à mesure que la saison courante avance.
- La moyenne de la ligue apporte un prior supplémentaire.
- Les amicaux sont exclus du modèle principal.
- Les ajustements issus des statistiques détaillées de la saison courante ne sont activés qu'à partir de cinq matchs par équipe.
- Si ni la saison courante ni la précédente ne fournissent l'échantillon minimal pour les deux équipes, le moteur s'abstient.

## Marchés actifs dans la sélection principale

Le moteur compare actuellement, lorsque leurs cotes API-Football existent : 1N2, doubles chances, Over/Under 2,5 et 3,5, BTTS, totaux d'équipe 1,5, victoire sans encaisser et combinaisons victoire + total de buts.

Les probabilités combinées sont additionnées directement dans les cellules compatibles de la matrice de scores. Elles ne sont jamais obtenues en multipliant deux probabilités marginales.

Les marchés de première mi-temps, tirs d'équipe, tirs joueur et tirs cadrés joueur exigent des modèles de comptage ou temporels distincts. Ils ne sont pas injectés artificiellement dans le modèle de buts : ils restent expérimentaux jusqu'à validation chronologique et disponibilité réelle de leurs lignes/cotes.

## Validation

Le moteur doit être suivi par famille avec un backtest walk-forward, Brier score, log loss et courbes de calibration. Ajouter un marché au catalogue ne suffit pas à le déclarer fiable.
