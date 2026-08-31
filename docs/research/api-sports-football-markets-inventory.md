# Inventaire des marchés football pour IASHARK

Date : 2026-08-31. Objectif produit : recommander le marché statistiquement le plus fiable parmi ceux dont la cote réelle est au moins 1,40, sans chercher prioritairement à battre le bookmaker.

## Sources vérifiées

- Audit local issu d'appels réels aux endpoints officiels API-Football `/odds/bets`, `/odds/bookmakers`, `/odds` et `/odds/live` : `odds-market-audit-report.json` (338 types pré-match au catalogue, 184 réellement observés sur 30 fixtures avec cotes parmi 39 contrôlées, audit du 2026-08-30).
- Guide officiel API-Football : <https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide> — `/odds/bets` est le catalogue complet des types pré-match ; `/odds` est paginé et son historique est limité à sept jours ; les lineups apparaissent généralement 30–60 minutes avant le match.
- Couverture officielle : <https://api-sports.io/sports/football> — fixtures, événements, compositions, statistiques, joueurs, blessures, prédictions et cotes varient par compétition/saison.
- Données de match officiellement annoncées : <https://www.api-football.com/news/post/match-facts> — tirs, tirs cadrés, corners, fautes, hors-jeu, possession, cartons, arrêts, etc.

## Conclusion structurante

Les 338 entrées bookmaker ne correspondent pas à 338 modèles indépendants. Beaucoup sont des variantes de période, ligne, équipe, handicap ou combinaison. IASHARK doit construire un petit nombre de moteurs de distribution réutilisables : score/buts, temps, corners, cartons, statistiques d'équipe et joueurs.

## Familles intégrables

1. **Matrice de score plein match** : 1X2, Home/Away, double chance, DNB si cote disponible, handicaps européens/asiatiques, totaux buts, totaux équipe, BTTS, équipe marque, clean sheet, win to nil, score exact, nombre exact/plage de buts, marge de victoire, pair/impair, combinaisons résultat+buts/BTTS.
2. **Modèle temporel** : résultats et totaux par mi-temps, HT/FT, double chance par période, BTTS par période, score exact par période, plus haute mi-temps, équipe marque dans les deux mi-temps, premier/dernier but, but dans une tranche de 15 minutes, gagner une/deux mi-temps.
3. **Corners** : total, totaux équipe, 1X2 corners, handicaps, double chance, plages, pair/impair, première/deuxième mi-temps, course à X corners.
4. **Cartons** : total, totaux équipe, 1X2, handicaps, premier carton, carton rouge, périodes et lignes jaunes.
5. **Statistiques d'équipe** : tirs, tirs cadrés, fautes, hors-jeu, arrêts gardien ; totaux match/équipe, 1X2, handicaps et double chance lorsque des cotes existent.
6. **Joueurs** : buteur à tout moment/premier/dernier, 2+ buts, but ou passe, passes décisives, tirs, tirs cadrés, fautes commises, cartons, tacles, arrêts gardien — seulement avec composition, minutes attendues et historique suffisant.
7. **Spéciaux à repousser** : penalty, but contre son camp, méthode du but, remontée au score, VAR et événements rares. Les probabilités sont difficiles à calibrer et les échantillons faibles.

## Ordre recommandé

- **V1** : toute la matrice de score plein match, car une distribution de score cohérente peut dériver chaque marché sans multiplier les hypothèses.
- **V2** : corners, cartons, tirs/tirs cadrés — chacun avec son propre modèle de comptage.
- **V3** : marchés joueurs après compositions officielles.
- **V4** : périodes et événements temporels après construction d'un vrai modèle de temps de but/événement.

Un marché ne doit entrer dans le classement final que si sa cote réelle est disponible et >= 1,40, son modèle est adapté à sa famille, ses données dépassent le seuil de qualité et sa calibration forward est mesurée. Sinon il reste visible comme donnée brute ou expérimental, mais ne peut pas devenir la recommandation principale.
