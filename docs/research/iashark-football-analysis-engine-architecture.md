# IAshark — architecture concrète du moteur d’analyse football

**Date de recherche :** 2026-08-30  
**Périmètre :** API-Football/API-Sports, données, cotes et modèles statistiques pré-match.  
**Discipline des sources :** documentation et publications officielles du fournisseur, articles scientifiques originaux, documentation officielle des bibliothèques. Les recommandations d’architecture sont explicitement séparées des faits.

## Verdict exécutif

IAshark ne devrait pas chercher à modéliser tous les marchés dès le lancement. Le socle crédible est un **moteur probabiliste de scores** : il estime les buts attendus de chaque équipe, construit une matrice de scores, puis en déduit de façon cohérente les probabilités des marchés 1N2, double chance, draw-no-bet, over/under et BTTS. Les cotes doivent être affichées et historisées, puis utilisées pour mesurer la valeur potentielle, mais elles ne doivent pas remplacer le modèle propre d’IAshark.

Le premier MVP devrait couvrir :

1. 1N2 et double chance ;
2. Over/Under 1,5, 2,5 et 3,5 buts ;
3. Les deux équipes marquent (BTTS) ;
4. Draw No Bet / handicap asiatique 0 si la ligne est disponible ;
5. éventuellement totaux d’équipe, issus de la même matrice de scores.

Les buteurs, tirs joueurs, cartons joueurs, corners et combinés ne doivent pas faire partie du premier moteur. Ils demandent des modèles d’exposition individuelle ou d’événements distincts et des données que l’API ne documente pas comme suffisamment complètes avant match pour toutes les compétitions.

---

## 1. Faits officiellement confirmés

### 1.1 Offre API-Sports Pro

- L’offre **Pro** donne accès à tous les endpoints et toutes les compétitions, avec **7 500 requêtes par jour**, un siège et une limite de **300 requêtes/minute**. Le quota journalier est remis à zéro à 00:00 UTC et les requêtes inutilisées sont perdues. [API-Sports — Football API information](https://api-sports.io/sports/football)
- API-Football annonce plus de 1 200 ligues et coupes, mais la présence d’une compétition ne signifie pas que chaque type de donnée est disponible sur chaque saison ou chaque match. [API-Football — Complete Beginner’s Guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
- La réponse `/leagues` expose des drapeaux de couverture pour les événements, compositions, statistiques de matchs et joueurs, classement, joueurs, meilleurs buteurs/passeurs/cartons, blessures, prédictions et cotes. Un drapeau `true` indique une couverture visée, pas une garantie de complétude match par match. [API-Football — Quota and coverage guide](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage)

**Conséquence factuelle :** le plan Pro n’est pas fonctionnellement bridé par endpoint, mais l’application doit gérer la couverture et les valeurs manquantes.

### 1.2 Données de match et d’équipe disponibles

Les familles d’endpoints officielles pertinentes sont :

- `/fixtures` : calendrier, statut et résultats ; l’identifiant de fixture relie les sous-ressources ;
- `/fixtures/headtohead` : confrontations antérieures ;
- `/standings` : classement et forme ;
- `/teams/statistics` : statistiques saisonnières, notamment buts marqués/encaissés, répartitions temporelles, clean sheets, résultats et seuils over/under ;
- `/fixtures/statistics` : tirs, tirs cadrés, possession, corners, fautes, cartons, hors-jeu, passes et autres statistiques selon la couverture ;
- `/fixtures/events` : buts, cartons et remplacements ;
- `/fixtures/players` : minutes, position, note, tirs, buts, passes décisives, passes, duels, dribbles, fautes et cartons des joueurs ayant participé ;
- `/players` et classements joueurs : profils et statistiques saisonnières ;
- `/injuries` : blessures et suspensions associées à une fixture, équipe, ligue, joueur ou date ; mise à jour officielle annoncée toutes les quatre heures ;
- `/sidelined` : historique d’indisponibilité d’un joueur ou entraîneur ;
- `/fixtures/lineups` : titulaires, remplaçants, formation et entraîneur. Les compositions arrivent généralement peu avant le coup d’envoi et peuvent, dans certaines compétitions, n’être disponibles qu’après le match.

Sources : [Complete Beginner’s Guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide), [2024 API release](https://www.api-football.com/news/post/api-football-new-release-available), [Match Facts](https://www.api-football.com/news/post/match-facts).

### 1.3 Prédictions API-Football

- `/predictions?fixture=...` renvoie notamment un vainqueur prédit, `win_or_draw`, un indicateur under/over, des fourchettes de buts, un conseil textuel et des pourcentages domicile/nul/extérieur. La réponse inclut aussi une comparaison attaque/défense, forme, confrontations et estimations Poisson. [Complete Beginner’s Guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
- API-Football indique officiellement que ses prédictions combinent six algorithmes, la forme, les rencontres précédentes et d’autres données, **sans utiliser les cotes des bookmakers**. Les détails des six algorithmes, leur entraînement et leur calibration ne sont pas publiés. [API-Football — Predictions endpoint](https://www.api-football.com/news/post/predictions-endpoint)
- La couverture n’est pas universelle et doit être vérifiée via `coverage.predictions`. Les résultats historiques publiés par API-Football ne suffisent pas à établir la calibration actuelle du service ni sa supériorité hors échantillon. [Predictions 2022–2023](https://www.api-football.com/news/post/predictions-endpoint-2022-2023-season)

**Conséquence :** cette prédiction doit être une feature ou un benchmark externe dans IAshark, jamais la vérité cible ni l’unique moteur.

### 1.4 Cotes, bookmakers et marchés

- `/odds` fournit les cotes pré-match, filtrables par fixture, ligue/saison, date, bookmaker ou type de pari. `/odds/bookmakers` et `/odds/bets` fournissent les catalogues d’identifiants. Des exemples officiels mentionnent notamment Match Winner, BTTS, Over/Under et Correct Score. [Complete Beginner’s Guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
- Les cotes pré-match sont généralement disponibles 1 à 14 jours avant la fixture, actualisées environ toutes les trois heures, et l’API ne conserve que les **sept derniers jours**. Toute base historique destinée à l’entraînement doit donc être collectée et stockée par IAshark au fil de l’eau. [Complete Beginner’s Guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
- `/odds/live` existe, mais les identifiants de marchés live et pré-match sont distincts. Aucune histoire live n’est conservée après le match. [API-Football 3.9.2 release](https://www.api-football.com/news/post/api-football-new-release)
- La disponibilité varie par fixture, saison et bookmaker. Il n’existe pas dans les sources examinées de garantie officielle qu’un bookmaker français précis ou qu’un marché joueur précis soit toujours présent.

### 1.5 xG : ce qui n’est pas confirmé

La documentation officielle examinée ne présente pas de champ ou d’endpoint **expected goals (xG)** standard dans API-Football. Les tirs et tirs cadrés sont documentés, mais ils ne remplacent pas un flux xG événementiel. Il serait donc incorrect de concevoir le MVP en supposant que le forfait Pro contient des xG historiques complets.

**Statut : inconnu/non documenté.** Une vérification empirique des réponses de l’abonnement peut montrer des champs supplémentaires sur certaines compétitions, mais cela ne constituerait pas une garantie de produit. Si le xG devient indispensable, il faudra contractualiser une autre source officielle ou construire un modèle de qualité de tir à partir de données événementielles plus détaillées que celles actuellement documentées.

---

## 2. Architecture recommandée (décisions de conception)

### 2.1 Principe : un moteur probabiliste, pas une IA qui invente un pronostic

Séparer cinq couches :

1. **Ingestion vérifiable** : API-Football brut, horodaté et versionné.
2. **Feature store pré-match** : seules les informations connues à l’instant de la prédiction.
3. **Moteurs statistiques** : probabilités chiffrées par marché.
4. **Décision marché** : comparaison probabilité IAshark / probabilité implicite sans marge.
5. **Explication** : une IA textuelle explique les facteurs fournis par le moteur ; elle ne calcule ni ne remplace les probabilités.

Cette séparation évite les fuites de données et permet de reproduire chaque analyse après coup.

### 2.2 Modèle central MVP : Poisson + correction Dixon–Coles

Le modèle estime deux intensités, `lambda_home` et `lambda_away`, à partir des forces offensives/défensives, de l’avantage domicile et d’une pondération temporelle des rencontres. Il produit ensuite `P(Home goals = x, Away goals = y)`.

La correction Dixon–Coles traite la dépendance mal représentée des faibles scores (0-0, 1-0, 0-1, 1-1) et utilise une pondération décroissante pour donner plus d’importance aux matchs récents. C’est précisément l’objet du papier original : [Dixon & Coles, 1997 — Modelling Association Football Scores and Inefficiencies in the Football Betting Market](https://ajbuckeconbikesail.net/wkpapers/Airports/MVPoisson/soccer_betting.pdf).

Une seule matrice de scores permet de calculer de manière cohérente :

- 1N2 ;
- double chance ;
- draw no bet ;
- handicaps asiatiques simples ;
- over/under pour plusieurs lignes ;
- BTTS ;
- score exact ;
- totaux d’équipe.

Le score exact peut être affiché comme scénario le plus probable, mais ne doit pas être recommandé au MVP : sa variance est très élevée.

### 2.3 Variables MVP réalistes

Utiliser uniquement des variables reconstructibles historiquement :

- buts marqués/encaissés, avec séparation domicile/extérieur ;
- force moyenne de la ligue et avantage domicile par ligue/saison ;
- récence avec décroissance exponentielle ;
- jours de repos et congestion du calendrier calculés depuis `/fixtures` ;
- force des adversaires rencontrés ;
- statut de compétition et phase si pertinent ;
- absences connues au timestamp, mais avec un impact prudent et traçable ;
- compositions confirmées uniquement dans une version « dernière minute », distincte du modèle J-1 ;
- prédiction API-Football comme feature secondaire ou signal de désaccord, après validation hors échantillon.

Ne pas mettre au MVP des coefficients manuels du type « star absente = -20 % ». L’impact joueur doit être appris ultérieurement à partir des minutes, titularisations et performances, avec shrinkage vers zéro quand l’échantillon est faible.

### 2.4 Deux versions temporelles d’une analyse

- **Preview J-1/J-7** : forme, calendrier, statistiques d’équipe, blessures disponibles, odds snapshot.
- **Confirmed XI** : recalcul 30–60 minutes avant le match dès que les compositions sont disponibles.

Chaque version doit conserver `as_of`, ses features, le modèle/version et les cotes observées. Le système ne doit jamais utiliser après coup une composition ou une blessure qui n’était pas connue au moment du pronostic.

### 2.5 Calibration et évaluation

Une probabilité utile doit être calibrée : parmi les événements annoncés à 70 %, environ 70 % doivent se réaliser. La documentation officielle scikit-learn décrit les courbes de calibration et les méthodes sigmoid/isotonic : [scikit-learn — Probability calibration](https://scikit-learn.org/stable/modules/calibration.html).

Protocole recommandé :

- validation temporelle roulante, jamais de split aléatoire mélangeant passé et futur ;
- log loss et Brier score pour les probabilités ;
- Ranked Probability Score pour le 1N2 ;
- calibration plots par ligue, marché et tranche de probabilité ;
- comparaison systématique à trois baselines : fréquence simple, `/predictions`, consensus bookmaker sans marge ;
- reporting du nombre d’observations et intervalles d’incertitude ;
- ROI seulement comme métrique secondaire, avec cote réellement disponible au timestamp et frais/marge pris en compte.

### 2.6 Ensemble avancé

Après un vrai historique :

- modèle A : Dixon–Coles interprétable ;
- modèle B : gradient boosting ou modèle hiérarchique sur features d’équipes/contexte ;
- modèle C : consensus de marché démarginé ;
- modèle D optionnel : signal `/predictions` API-Football.

Un méta-modèle calibré combine les probabilités sur des données hors échantillon. Les poids ne doivent pas être choisis intuitivement. Le marché peut améliorer la précision, mais IAshark doit aussi publier la probabilité **sans marché** afin de distinguer sa propre lecture de l’information déjà intégrée aux cotes.

---

## 3. Faut-il afficher et utiliser les cotes ?

### Recommandation

**Oui, les afficher**, avec bookmaker, ligne, timestamp et avertissement de variation. Sans cote, « meilleur marché » ne signifie pas « pari intéressant » : une issue probable peut être proposée à un prix trop faible.

**Oui, les utiliser, mais en deux rôles séparés :**

1. **Prix/benchmark obligatoire** : convertir les cotes en probabilités implicites et enlever la marge du bookmaker pour obtenir un consensus comparable.
2. **Feature d’ensemble tardive** : uniquement après avoir évalué séparément le modèle IAshark sans cotes.

Pour des cotes décimales `o_i`, la probabilité brute est `q_i = 1/o_i`. Une normalisation simple du marché exclusif donne `p_i = q_i / sum(q)`. Pour le 1N2, cette opération retire approximativement l’overround. Des méthodes plus sophistiquées pourront être testées, mais aucune ne doit être présentée comme vérité sans validation.

### Affichage produit recommandé

- **Probabilité IAshark** ;
- **Probabilité du marché sans marge** ;
- **Cote disponible et bookmaker** ;
- **Écart (« edge »)** = `P_IAshark - P_marché` ;
- **Valeur attendue théorique** = `P_IAshark × cote - 1` ;
- fiabilité des données et date de mise à jour ;
- verdict : « cohérent », « prix insuffisant », « désaccord à investiguer », ou « données insuffisantes ».

Ne jamais appeler un edge une garantie. Exiger un seuil supérieur à l’erreur de calibration et une couverture de données suffisante avant de qualifier un pari de « valeur potentielle ».

---

## 4. Marchés : priorité réaliste

| Marché | Faisable depuis le modèle de score | Priorité | Motif / limite |
|---|---:|---:|---|
| Over/Under buts | Oui | MVP 1 | Sort directement de la matrice ; lignes disponibles via odds selon fixture. |
| BTTS | Oui | MVP 1 | Cohérent avec les distributions de buts. |
| 1N2 | Oui | MVP 1 | Marché central, mais le nul exige la correction Dixon–Coles et une bonne calibration. |
| Double chance | Oui | MVP 1 | Agrégation du 1N2, lisible pour le public. |
| Draw No Bet / AH 0 | Oui | MVP 1–2 | Dérivé du score ; dépend de la disponibilité de la ligne. |
| Totaux d’équipe | Oui | MVP 2 | Dérivé de `lambda_home/away`, à calibrer séparément. |
| Handicap asiatique multi-lignes | Oui | MVP 2 | Demande gestion exacte des push/half-win/half-loss et lignes. |
| Score exact | Oui | Affichage, pas recommandation | Probabilités faibles et variance élevée. |
| Corners | Non avec le modèle de buts | Plus tard | Nécessite un modèle de comptage dédié et une couverture historique stable des corners. |
| Cartons | Non avec le modèle de buts | Plus tard | Modèle dédié avec arbitre, équipes, contexte et discipline ; arbitre pré-match non garanti dans les sources examinées. |
| Buteur | Non directement | Avancé | Besoin de probabilité de titularisation, minutes attendues, part des penalties et taux de but individuel ; lineup tardive. |
| Tirs / tirs cadrés joueur | Non directement | Avancé | Besoin de minutes, rôle, volume individuel, adversaire et couverture robuste ; aucun xG/xShot officiel confirmé. |
| Combinés / Bet Builder | Seulement avec dépendances explicites | À écarter au début | Multiplier des probabilités indépendantes serait faux ; corrélations fortes entre jambes. |

### Sur les buteurs

Ne pas « s’axer sur les buteurs » au lancement. Ils peuvent devenir un module premium après le moteur équipe. Une première version sérieuse nécessiterait :

`P(buteur) = somme_sur_minutes P(minutes jouées) × P(marque pendant ces minutes | rôle, équipe, adversaire, penalties)`

Il faut donc un modèle de titularisation, un modèle de minutes et un taux de but régularisé. Le classement des meilleurs buteurs ne suffit pas. Les compositions confirmées amélioreraient fortement le signal, mais arrivent tard.

---

## 5. Données et stockage nécessaires

### Tables minimales

- `competitions`, `seasons`, `coverage_snapshots` ;
- `teams`, `players`, `squads` ;
- `fixtures` et snapshots de statut/date ;
- `fixture_events`, `fixture_team_stats`, `fixture_player_stats` ;
- `team_season_stats_snapshots` ;
- `injury_snapshots`, `lineup_snapshots` ;
- `odds_snapshots` avec fixture, bookmaker, bet ID, ligne/value, cote et timestamp ;
- `predictions_api_snapshots` ;
- `model_features`, `model_predictions`, `model_versions` ;
- `outcomes` et règlement de chaque marché.

### Collecte recommandée sous Pro

- référentiels et catalogues : cache journalier/hebdomadaire ;
- fixtures et couverture : cache quotidien, plus refresh ciblé ;
- stats saison : deux fois par jour au maximum selon la cadence officielle ;
- blessures : toutes les quatre heures pour les matchs suivis ;
- prédictions : horaire seulement si utile ;
- odds : à chaque mise à jour de trois heures, puis plus fréquemment dans la fenêtre pré-match si la donnée change ;
- lineups : polling ciblé dans les 90 dernières minutes ;
- après match : résultat, événements, statistiques équipes/joueurs une fois stabilisés.

Avec 7 500 appels/jour, il faut limiter au départ les compétitions entraînées et suivies (par exemple cinq grands championnats + compétitions européennes), utiliser les paramètres multi-fixtures lorsque disponibles, dédupliquer et ne jamais requêter un endpoint dont le flag de couverture est faux.

---

## 6. Feuille de route

### Phase 0 — audit de données (avant toute promesse)

- Interroger `/leagues` sur 3 à 5 saisons pour les compétitions ciblées.
- Mesurer, match par match, la complétude réelle : statistiques, joueurs, blessures, lineups, predictions, odds.
- Lister réellement `/odds/bets` et `/odds/bookmakers` avec le compte du projet.
- Vérifier les bookmakers pertinents légalement et commercialement pour la France.
- Commencer immédiatement l’archivage des snapshots de cotes.

### MVP — moteur équipe auditable

- Dixon–Coles par ligue avec pondération temporelle.
- Marchés 1N2, double chance, O/U et BTTS.
- Calibration temporelle et comparaison au consensus bookmaker.
- Analyse J-1 + mise à jour compositions confirmées.
- Interface montrant probabilités, facteurs, limites, fraîcheur et cotes.
- Aucune recommandation si couverture ou calibration insuffisante.

### V1 avancée

- modèles hiérarchiques multi-ligues avec effets promus/relégués ;
- impact des absences appris et régularisé ;
- ensemble Dixon–Coles + ML + marché + signal API-Football ;
- line movement ;
- handicaps asiatiques et totaux d’équipe ;
- monitoring de drift et recalibration par compétition.

### V2 spécialisée

- modèles corners et cartons séparés ;
- modèle buteur/tirs seulement sur compétitions à données complètes ;
- simulation Monte-Carlo avec dépendances entre événements ;
- live uniquement après constitution d’un historique live propriétaire, car l’API ne le conserve pas.

---

## 7. Inconnues à résoudre avant implémentation

1. Liste exacte actuelle des bet IDs et bookmakers accessibles avec le compte IAshark ; elle doit être récupérée depuis les endpoints de référence, pas supposée.
2. Présence régulière de bookmakers légalement pertinents en France.
3. Profondeur historique réellement récupérable pour les statistiques détaillées de fixtures et joueurs par ligue.
4. Taux de données manquantes avant match pour blessures et compositions.
5. Existence éventuelle de champs xG non documentés dans certaines réponses : ne pas en dépendre sans garantie officielle.
6. Disponibilité et stabilité des marchés joueurs/buteurs dans `/odds`.
7. Conditions de licence d’affichage public des cotes, logos et données dans le produit ; l’accès API ne doit pas être interprété automatiquement comme une autorisation réglementaire universelle.
8. Pays exacts et opérateurs à afficher pour les versions française, anglaise et espagnole du SaaS.

---

## Décision proposée pour IAshark

Construire d’abord un **Match Probability Engine** qui transforme les données d’équipe en une distribution complète des scores. Utiliser les cotes comme prix et benchmark, les afficher avec leur fraîcheur, et rechercher une valeur uniquement lorsque le modèle est calibré et suffisamment différent du consensus. Ne pas ouvrir artificiellement « tous les marchés » : annoncer une couverture large sans modèle spécifique pour chaque famille reproduirait exactement le problème de fiabilité que le nouveau projet veut résoudre.

La fonctionnalité forte du SaaS devient alors :

> Pour chaque match, IAshark classe les marchés réellement modélisés selon leur probabilité, la qualité des données, le niveau d’incertitude et le prix proposé par le marché — puis explique clairement les raisons et les risques.
