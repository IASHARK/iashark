# IAshark — conception concrète du moteur football

**Date :** 2026-08-30  
**Périmètre :** moteur pré-match, API-Sports/API-Football, probabilités, cotes et sélection de marchés.  
**Méthode :** documentation officielle API-Sports/API-Football et publications statistiques primaires. Aucun appel API payant ou collecte massive n'a été effectué pour ce rapport.

## Verdict exécutif

IAshark peut construire avec API-Sports seul un moteur crédible et explicable pour les marchés **1N2, double chance, Draw No Bet, Over/Under buts, BTTS et totaux d'équipe**, à condition de mesurer d'abord la couverture réelle des compétitions ciblées, de stocker des snapshots pré-match et de valider les probabilités hors échantillon.

Le moteur initial recommandé est un **modèle de scores Poisson hiérarchique avec correction Dixon–Coles**, entraîné par compétition et saison avec décroissance temporelle. Il produit une distribution complète des scores, dont dérivent les probabilités cohérentes de plusieurs marchés. Les cotes ne remplacent pas ce modèle : elles servent de prix, de benchmark et, plus tard seulement, de signal dans un ensemble distinct.

API-Sports seul ne permet pas de garantir un moteur buteur fiable à grande échelle : les minutes, tirs, buts, penalties et compositions existent selon la couverture, mais il manque un flux xG/xShot standard documenté, une garantie de disponibilité pré-match des titulaires et une couverture uniforme des marchés joueurs. Les buteurs sont donc une fonctionnalité V2 conditionnelle, pas le cœur du MVP.

## 1. Ce qu'API-Sports permet réellement

### 1.1 Données officiellement documentées

Le `fixture_id` relie les ressources d'un match : calendrier/résultat, événements, compositions, statistiques d'équipe, statistiques joueurs, blessures, prédictions et cotes. La documentation officielle décrit notamment :

- `/fixtures` et `/fixtures/headtohead` ;
- `/teams/statistics` pour les agrégats saisonniers ;
- `/fixtures/statistics` pour tirs, tirs cadrés, possession, corners, fautes, cartons et passes, selon couverture ;
- `/fixtures/players` pour minutes, position, tirs, buts, passes, duels, dribbles, fautes et cartons ;
- `/injuries` et `/sidelined` ;
- `/fixtures/lineups` pour titulaires, banc, formation et entraîneur ;
- `/predictions` ;
- `/odds`, `/odds/bets` et `/odds/bookmakers`.

Le fournisseur précise que le champ `coverage` de `/leagues` doit être vérifié par compétition et saison avant tout appel aval. Un drapeau actif exprime une couverture visée, pas une garantie de complétude pour chaque rencontre. Les compositions arrivent typiquement peu avant le coup d'envoi et peuvent parfois manquer malgré un indicateur de couverture positif. [API-Football, guide d'optimisation et couverture](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage) ; [guide complet API-Football](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)

### 1.2 Cadences et limites utiles au produit

La documentation officielle annonce notamment :

- blessures : mise à jour environ toutes les 4 heures ;
- statistiques saison d'équipe : environ deux fois par jour ;
- prédictions : environ toutes les heures ;
- cotes pré-match : environ toutes les 3 heures, avec seulement 7 jours d'historique conservé par l'API ;
- compositions : généralement dans les 30 à 60 dernières minutes, sans garantie universelle.

Le plan Pro documenté donne accès à tous les endpoints et compétitions avec 7 500 requêtes/jour et 300 requêtes/minute. Les limites restantes sont la couverture réelle et la fraîcheur, pas l'accès nominal aux endpoints. [API-Sports Football](https://api-sports.io/sports/football) ; [guide complet API-Football](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)

### 1.3 Ce qui n'est pas garanti ou documenté

- Aucun endpoint xG/xShot standard et complet n'est officiellement documenté.
- Les historiques de cotes antérieurs à sept jours ne sont pas fournis : IAshark doit les archiver lui-même.
- Les blessures ne constituent pas une chronologie publique parfaite de ce qui était connu à une heure passée.
- Les compositions ne sont pas garanties avant match.
- Les cotes de marchés joueurs et leur couverture ne sont pas garanties pour toutes les fixtures/bookmakers.
- Les six algorithmes de `/predictions` ne sont pas publiés ; ce service ne peut donc pas être audité comme moteur principal.
- Les statistiques de match décrivent ce qui s'est produit après le coup d'envoi et ne doivent jamais être injectées dans une prédiction pré-match du même match.

## 2. Stratégie de vérification de la couverture historique

Avant de promettre un marché dans le produit, exécuter un **audit limité et échantillonné**, puis une ingestion planifiée séparée. L'audit ne doit pas aspirer tout le catalogue.

### Étape A — choisir le périmètre

Commencer avec 5 à 8 compétitions à forte couverture et 3 à 5 saisons terminées. Pour chaque couple compétition/saison :

1. lire `/leagues?id=...&season=...` ;
2. enregistrer le bloc `coverage` brut et son horodatage ;
3. compter les fixtures terminées ;
4. échantillonner des matchs au début, milieu et à la fin de saison.

### Étape B — mesurer la complétude réelle

Pour chaque échantillon, calculer :

- taux de présence des statistiques équipes ;
- taux de présence des statistiques joueurs ;
- taux de lineups complètes ;
- taux d'absences/injuries non vides, sans confondre « aucune absence » et « donnée manquante » ;
- taux de prédictions disponibles ;
- taux de cotes par bookmaker et marché ;
- stabilité des identifiants de marchés et valeurs de lignes ;
- délai entre disponibilité de la donnée et coup d'envoi, lorsque le timestamp existe.

### Étape C — décision de support

Un marché reçoit un statut par compétition :

- `supported` : données et calibration suffisantes ;
- `experimental` : calcul possible, validation insuffisante ;
- `display_only` : cote visible, aucun modèle IAshark validé ;
- `unavailable` : couverture insuffisante.

La documentation officielle montre qu'il est possible de récupérer des fixtures enrichies par groupes de 20 IDs, ce qui rend l'audit de fixtures échantillonnées peu coûteux. [API-Football, récupérer les données d'une ligue](https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league)

## 3. Modèle équipe et distribution des scores

### 3.1 Modèle MVP

Pour un match entre domicile `h` et extérieur `a` :

```text
G_home ~ Poisson(lambda_home)
G_away ~ Poisson(lambda_away)

log(lambda_home) = intercept_ligue + avantage_domicile
                   + attaque_home - défense_away + variables_pre_match

log(lambda_away) = intercept_ligue
                   + attaque_away - défense_home + variables_pre_match
```

Les forces attaque/défense sont régularisées vers la moyenne de la ligue pour éviter les probabilités extrêmes des équipes ayant peu de matchs. Les observations anciennes reçoivent un poids décroissant. Une correction Dixon–Coles ajuste la dépendance des faibles scores, notamment 0-0, 1-0, 0-1 et 1-1. Le papier original motive exactement cette famille de modèle et sa relation avec les marchés de paris. [Dixon & Coles, 1997](https://www.research.lancs.ac.uk/portal/en/publications/modelling-association-football-scores-and-inefficiencies-in-the-football-betting-market%28d16276a2-d6e0-483b-a708-1d29663f1992%29.html)

Des travaux ultérieurs confirment qu'un modèle Poisson hiérarchique de scores et des modèles directs de résultat sont des bases compétitives lorsqu'ils sont évalués temporellement. [Groll et al., *Modeling outcomes of soccer matches*](https://link.springer.com/article/10.1007/s10994-018-5741-1)

### 3.2 Variables autorisées au MVP

Uniquement des variables reconstructibles à l'instant `as_of` :

- buts marqués/encaissés, pondérés par récence ;
- domicile/extérieur ;
- force des adversaires rencontrés ;
- niveau moyen et avantage domicile de la compétition ;
- jours de repos et congestion dérivés des fixtures antérieures ;
- changement de division/saison avec shrinkage renforcé ;
- absences réellement connues à `as_of`, si un snapshot existe ;
- compositions confirmées uniquement dans un recalcul séparé.

Ne pas utiliser au MVP des coefficients manuels arbitraires pour une star absente. Sans estimation historique de l'impact et des minutes de remplacement, une correction spectaculaire donne une précision illusoire.

### 3.3 Sortie du moteur

Le moteur produit :

- `lambda_home`, `lambda_away` ;
- matrice de scores 0–0 à une borne suffisamment haute, avec masse résiduelle contrôlée ;
- probabilités brutes de chaque marché dérivable ;
- intervalle/incertitude du modèle ;
- version du modèle, timestamp et données manquantes ;
- raisons quantitatives calculées, pas inventées par un LLM.

## 4. Registre de marchés

Le registre est une table de configuration versionnée, pas une liste codée dans l'interface.

| Famille | Marchés | Source du modèle | Statut initial | Condition de publication |
|---|---|---|---|---|
| Résultat | 1N2 | matrice de scores | MVP | calibration par ligue |
| Résultat | Double chance | agrégation 1N2 | MVP | cohérence exacte avec 1N2 |
| Résultat | Draw No Bet / AH 0 | matrice + règles push | MVP | ligne/cote disponible |
| Buts | O/U 0,5 à 4,5 | somme des scores | MVP | calibration par ligne |
| Buts | BTTS | `P(home>0, away>0)` | MVP | calibration binaire |
| Buts | Totaux équipe | marges de la matrice | MVP/V1.1 | validation séparée |
| Score | Score exact | cellule de matrice | affichage seulement | jamais « choix sûr » |
| Handicap | AH multi-lignes | matrice + settlement | V1.1 | moteur de règlement testé |
| Joueur | Buteur | modèle joueur dédié | V2 expérimental | lineup/minutes/penalties fiables |
| Joueur | Tirs/cadrés | modèle joueur dédié | V2+ | couverture suffisante, idéalement xShot |
| Corners | O/U, équipe | comptage dédié | V2+ | historique complet et modèle calibré |
| Cartons | O/U, équipe/joueur | comptage dédié | V2+ | arbitre et discipline disponibles |
| Bet Builder | combinés | dépendance multivariée | hors périmètre initial | interdiction de multiplier naïvement |

Chaque entrée doit préciser : `market_key`, fournisseur/bet IDs, règle de règlement, nombre d'issues, ligne, source de probabilité, calibration requise, compétitions supportées, données minimales et seuil de fraîcheur.

## 5. Cotes, prix et « meilleure décision »

### 5.1 Les cotes doivent être incluses

Une probabilité seule dit ce qui est le plus probable ; elle ne dit pas si le prix est raisonnable. Pour une cote décimale `o` :

```text
probabilité implicite brute q = 1 / o
EV théorique = p_modèle × o - 1
```

Pour un marché exclusif (par exemple 1N2), enlever d'abord l'overround, au minimum par normalisation :

```text
p_marché_i = (1 / o_i) / Σ_j(1 / o_j)
edge_i = p_IAshark_i - p_marché_i
```

Stocker le bookmaker, la ligne, la cote et le timestamp. Une cote actuelle ne doit jamais être substituée rétroactivement à celle disponible lors du pronostic.

### 5.2 Logique de décision

IAshark ne sélectionne pas simplement la probabilité la plus élevée. Un candidat doit satisfaire :

1. marché `supported` pour cette compétition ;
2. données minimales présentes et fraîches ;
3. probabilité calibrée dans cette zone ;
4. edge supérieur à un seuil couvrant l'erreur de calibration et l'incertitude ;
5. cote non obsolète ;
6. aucune contradiction majeure (lineup inattendue, gardien absent, source incertaine) ;
7. pas de sélection redondante sur le même match dans la recommandation principale.

Sorties possibles :

- `best_supported_decision` ;
- `probable_but_bad_price` ;
- `insufficient_edge` ;
- `insufficient_data` ;
- `no_recommendation`.

Le dernier cas est indispensable : forcer un pari sur chaque match détruirait la crédibilité et la calibration.

## 6. Modèle buteur et joueurs

### 6.1 Architecture minimale nécessaire

Un marché buteur fiable exige au moins trois sous-modèles :

1. `P(titulaire | informations pré-match)` ;
2. distribution des minutes jouées conditionnelle à titulaire/remplaçant ;
3. intensité de but par minute conditionnelle au rôle, à l'équipe, à l'adversaire et aux penalties.

Une forme simplifiée est :

```text
P(buteur) = Σ_m P(minutes=m) × [1 - exp(-rate_goal_per_minute × m)]
```

Le taux individuel doit être fortement régularisé et tenir compte de la part des buts attendus de l'équipe, du rôle, du statut de tireur de penalty, des tirs et de la qualité adverse. Les buts passés seuls ne suffisent pas.

### 6.2 Ce qu'API-Sports peut fournir

- apparitions, minutes, buts, tirs et penalties au niveau saison ;
- statistiques joueur par fixture après participation ;
- lineups et banc selon disponibilité ;
- blessures/suspensions selon couverture ;
- historique `sidelined`.

### 6.3 Ce qui manque pour une promesse robuste

- xG/xShot individuel standard documenté ;
- probabilité officielle de titularisation ;
- minutes attendues ;
- rôle tactique futur ;
- tireur de penalty garanti avant match ;
- garantie de cotes buteur et de lignes comparables ;
- garantie de lineup avant coup d'envoi.

**Conclusion :** API-Sports seul permet un prototype buteur sur les compétitions les mieux couvertes, surtout après lineups confirmées. Il ne justifie pas une fonctionnalité buteur « fiable partout » au lancement. La fonctionnalité ne passe en production qu'après audit de couverture, historique de cotes joueur et calibration hors échantillon.

## 7. Corners et cartons — plus tard

Les corners et cartons ne doivent pas réutiliser la distribution des buts.

### Corners

Modèle de comptage séparé, avec Poisson comme baseline puis binomiale négative/compound Poisson si surdispersion. Variables candidates : corners pour/contre, style offensif observable, tirs, possession, état de forme et adversaire, toujours calculés sur matchs antérieurs. Des travaux consacrés aux corners documentent précisément la surdispersion et l'intérêt de modèles de comptage plus souples. [Pålsson & Laurens, Lund University](https://www.lu.se/publikation/9127007) ; [modèle compound Poisson](https://arxiv.org/abs/2112.13001)

### Cartons

Modèle séparé par équipe et match, avec Poisson/binomiale négative selon diagnostic. Variables candidates : fautes/cartons antérieurs, rivalité/contexte, domicile, importance, arbitre et profils disciplinaires. L'arbitre est une variable substantielle dans la littérature, mais sa disponibilité pré-match doit être vérifiée empiriquement dans API-Sports avant d'en dépendre. [Wicker, Orlowski & Weimar, 2022](https://journals.sagepub.com/doi/10.32731/ijsf.172.052022.01)

## 8. Backtest, calibration et promotion des modèles

### 8.1 Découpage temporel obligatoire

Utiliser une validation walk-forward : entraînement sur le passé, validation sur la période suivante, puis fenêtre avancée. Jamais de split aléatoire mélangeant des matchs futurs dans l'entraînement. Les travaux sur les modèles de résultats football soulignent l'importance d'une validation contextuelle et temporelle. [Groll et al.](https://link.springer.com/article/10.1007/s10994-018-5741-1)

### 8.2 Métriques principales

- log loss pour les distributions probabilistes ;
- Brier score pour les marchés binaires ;
- Ranked Probability Score pour le 1N2 ordonné ;
- courbes de calibration/reliability par marché, ligue et tranche ;
- sharpness/résolution seulement conjointement à la calibration ;
- taux de couverture des recommandations ;
- ROI et closing-line value comme métriques secondaires de stratégie, jamais comme preuve unique du modèle.

Les règles de score strictement propres encouragent l'annonce honnête des probabilités. [Gneiting & Raftery, 2007](https://doi.org/10.1198/016214506000001437). Le RPS est spécifiquement défendu pour l'évaluation des prévisions football 1N2. [Constantinou & Fenton, 2012](https://eecs.qmul.ac.uk/~norman/papers/assessing_probabilistic_football_forecast_models.pdf)

### 8.3 Baselines obligatoires

Comparer chaque version à :

- fréquences historiques simples par ligue ;
- Elo ou Bradley–Terry simple ;
- Dixon–Coles sans variables additionnelles ;
- `/predictions` API-Football, quand disponible ;
- consensus bookmaker démarginé.

Une nouvelle version n'est promue que si elle améliore les scores propres hors échantillon, ne détériore pas significativement la calibration et fonctionne sur un échantillon suffisant.

## 9. Timing lineups, blessures et deux versions d'analyse

### Preview

Générée de J-7 à J-1 avec données connues à `as_of` : calendrier, résultats antérieurs, stats d'équipe, absences snapshotées et cotes observées. Elle affiche clairement que les compositions ne sont pas confirmées.

### Confirmed XI

Recalcul ciblé dans les 90 dernières minutes ; publication lorsque les deux lineups sont disponibles. Il met à jour la probabilité via un modèle d'impact joueur validé ou, tant que celui-ci n'existe pas, ajuste seulement la confiance et l'explication sans coefficient inventé.

Si les lineups manquent, conserver la Preview. Ne jamais utiliser une composition récupérée après le match pour prétendre qu'elle faisait partie de la prédiction d'origine.

## 10. Stockage et reproductibilité

### Entités minimales

- `competitions`, `seasons`, `coverage_snapshots` ;
- `teams`, `players`, `team_memberships` ;
- `fixtures`, `fixture_status_history` ;
- `fixture_events`, `fixture_team_stats`, `fixture_player_stats` ;
- `injury_snapshots`, `lineup_snapshots` ;
- `odds_snapshots` et référentiels bookmakers/markets ;
- `feature_snapshots` avec `as_of` ;
- `model_versions`, `predictions`, `market_probabilities` ;
- `recommendations`, `outcomes`, `settlements` ;
- `data_quality_reports`.

Conserver la réponse brute compressée ou un hash + payload normalisé versionné. Toute prédiction doit être reproductible avec : fixture, `as_of`, version du modèle, version des features, cotes et règles de marché.

## 11. Anti-fuite de données

Règles non négociables :

1. chaque observation porte `observed_at`, `effective_at` et `ingested_at` ;
2. une feature pré-match ne peut lire que `observed_at <= prediction_as_of` ;
3. les agrégats roulants excluent strictement la fixture cible ;
4. les stats finales du match cible sont interdites ;
5. une cote de clôture n'évalue pas une décision prise à J-1 comme si elle était disponible alors ;
6. les calibrateurs sont entraînés uniquement sur les folds passés ;
7. les paramètres de seuil de sélection sont validés sur une période distincte ;
8. les matchs reportés, abandonnés et changements de compétition ont des règles explicites ;
9. l'évaluation reproduit exactement les règles de règlement bookmaker ;
10. toute donnée manquante reste manquante : aucun LLM ne la complète.

## 12. Budget de requêtes et collecte

Avec 7 500 appels/jour, le MVP doit privilégier la profondeur sur quelques ligues plutôt que la superficialité sur 1 200 compétitions.

- référentiels : cache long ;
- coverage : quotidien ou au changement de saison ;
- calendrier : quotidien, refresh ciblé près du match ;
- stats équipe : au plus selon leur cadence de mise à jour ;
- blessures : toutes les 4 heures uniquement pour les fixtures suivies ;
- cotes : toutes les 3 heures pour les matchs supportés, snapshots dédupliqués ;
- lineups : polling ciblé dans les 90 dernières minutes ;
- enrichissement post-match : une fois les données stabilisées ;
- pages utilisateurs : toujours servir le cache backend, jamais multiplier les appels par visiteur.

Lire les headers de quota et arrêter proprement les collecteurs avant épuisement. Grouper jusqu'à 20 fixture IDs lorsque l'endpoint le permet. [API-Football, optimisation des appels](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage)

## 13. Roadmap MVP → V2

### Phase 0 — preuve de données

- audit échantillonné de 5–8 ligues et 3–5 saisons ;
- mapping réel bookmakers/marchés ;
- choix des ligues `supported` ;
- démarrage de l'archivage des cotes ;
- dictionnaire de données et tests de qualité.

### MVP — décision d'équipe simple et fiable

- Poisson hiérarchique + Dixon–Coles ;
- 1N2, double chance, DNB, O/U, BTTS ;
- Preview pré-match ;
- cotes, probabilité sans marge et verdict de prix ;
- calibration walk-forward ;
- explication déterministe des facteurs et risques ;
- capacité explicite à ne rien recommander.

### V1.1 — robustesse produit

- Confirmed XI ;
- totaux équipe et handicaps asiatiques ;
- monitoring dérive/calibration ;
- historique transparent des décisions ;
- alertes de changement significatif.

### V2 — modules spécialisés

- prototype buteur limité aux ligues à forte couverture ;
- modèle de titularisation/minutes ;
- corners puis cartons avec modèles séparés ;
- ensemble statistique seulement après historique suffisant ;
- marchés joueurs publiés uniquement après backtest et historique de cotes adapté.

## 14. Ce qui peut et ne peut pas être construit de façon fiable avec API-Sports seul

### Peut être construit sérieusement

- calendrier, résultats et pages match ;
- modèle historique de forces équipe à partir des scores ;
- probabilités 1N2/buts/BTTS et marchés dérivés ;
- comparaison aux cotes actuelles ;
- forme, repos, domicile/extérieur et contexte statistique ;
- affichage des lineups, blessures et stats lorsqu'elles existent ;
- recalcul lineup conditionnel ;
- backtests sur résultats historiques ;
- benchmark contre `/predictions`.

### Peut être construit seulement avec réserves

- ajustement quantitatif des absences : il faut apprendre l'impact et disposer de snapshots historiques ;
- moteur buteur : seulement sur périmètre couvert, idéalement après lineups ;
- corners/cartons : uniquement après audit de complétude historique ;
- comparaison de valeur : fiable uniquement à partir des cotes réellement archivées au timestamp.

### Ne peut pas être promis avec API-Sports seul

- xG/xShot complet et uniforme ;
- buteur fiable pour tous les matchs/ligues ;
- composition certaine plusieurs heures à l'avance ;
- historique complet de mouvements de cotes non collecté par IAshark ;
- couverture uniforme de tous les bookmakers et marchés ;
- causalité précise de l'impact d'une absence sans modèle et données dédiés ;
- garantie de gain ou « meilleur pari » certain ;
- Bet Builder fiable par simple multiplication de probabilités ;
- explication fiable produite par un LLM sans sorties structurées du moteur.

## Recommandation finale

Le produit ne doit pas prétendre être « ouvert à tous les marchés » dès le premier jour. Il doit être **ouvert par registre**, avec une profondeur de validation visible par compétition et marché.

La meilleure proposition de valeur initiale est :

> Pour chaque match couvert, IAshark calcule les probabilités cohérentes des principaux marchés équipe/buts, les compare aux prix disponibles, explique les facteurs et sait dire lorsqu'aucune décision n'est assez solide.

C'est techniquement réalisable avec API-Sports seul. Les buteurs, corners et cartons deviennent des moteurs additionnels indépendants, ajoutés uniquement lorsque les données et les backtests le justifient.
