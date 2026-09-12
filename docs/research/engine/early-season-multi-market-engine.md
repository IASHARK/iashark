# IASHARK — moteur multi-marchés en début de saison

## Objet et périmètre

Ce document décrit une architecture statistique pré-match adaptée à l’objectif précis d’IASHARK :

1. estimer les probabilités à partir des données sportives, sans utiliser les cotes comme variable prédictive ;
2. dériver toutes les sélections cohérentes à partir de modèles adaptés ;
3. classer les sélections par probabilité de réussite **calibrée** ;
4. vérifier ensuite qu’une cote pré-match réelle d’au moins `1,50` existe ;
5. retenir la première sélection éligible, ou s’abstenir.

Ce n’est pas un moteur de value betting. La cote est une contrainte d’éligibilité, pas une estimation de la vérité sportive.

## Verdict opérationnel

Pour la deuxième journée d’une saison, la base la plus défendable est un modèle de scores hiérarchique de type Poisson/Dixon–Coles, avec forces d’attaque et de défense régularisées vers un **prior de début de saison**, pondération temporelle exponentielle et validation walk-forward. Une matrice de scores unique permet ensuite de calculer exactement les marchés résultat, buts, BTTS, clean sheets et leurs combinaisons.

Le point déterminant n’est pas d’ajouter beaucoup de formules arbitraires : il faut produire des probabilités comparables et calibrées. Sans calibration hors échantillon par famille de marchés, prendre le pourcentage le plus élevé entre, par exemple, `1X`, `Under 3,5` et `équipe gagne + Over 1,5` n’est pas statistiquement fiable.

## 1. Modèle de scores recommandé

### 1.1 Intensités de buts

Pour un match où l’équipe `i` reçoit l’équipe `j` :

```text
log(lambda_home) = league_intercept + home_advantage + attack_i - defence_j + X_home * beta
log(lambda_away) = league_intercept                  + attack_j - defence_i + X_away * beta
```

- `lambda_home` et `lambda_away` sont les buts attendus par le modèle ;
- les paramètres d’attaque/défense sont estimés conjointement, pas par une simple moyenne des cinq derniers matchs ;
- `league_intercept` et `home_advantage` sont propres à la ligue et à la période ;
- les covariables ne sont ajoutées que si leur disponibilité historique et leur gain hors échantillon sont démontrés.

Le modèle hiérarchique de Baio et Blangiardo place les forces d’équipe dans une structure commune afin de partager l’information entre équipes, ce qui est particulièrement utile lorsque l’échantillon courant est faible. Les auteurs avertissent aussi que le shrinkage peut tirer excessivement les équipes extrêmes vers la moyenne ; ils proposent des distributions plus robustes ou des groupes latents pour limiter cet effet. [Baio & Blangiardo, *Bayesian hierarchical model for the prediction of football results*](https://discovery.ucl.ac.uk/16040/1/16040.pdf)

### 1.2 Correction Dixon–Coles

Les buts peuvent d’abord être modélisés par deux Poisson, puis corrigés pour les faibles scores par le facteur `tau` :

```text
tau(0,0) = 1 - lambda_home * lambda_away * rho
tau(0,1) = 1 + lambda_home * rho
tau(1,0) = 1 + lambda_away * rho
tau(1,1) = 1 - rho
tau(x,y) = 1 autrement

P(X=x,Y=y) = tau(x,y) * Pois(x; lambda_home) * Pois(y; lambda_away)
```

`rho` doit être estimé, jamais fixé selon une intuition. Cette correction répond précisément à la mauvaise représentation des scores `0-0`, `1-0`, `0-1` et `1-1` par l’indépendance Poisson simple. [Dixon & Coles, 1997, article original](https://ajbuckeconbikesail.net/wkpapers/Airports/MVPoisson/soccer_betting.pdf)

Après construction d’une grille suffisamment large, par exemple `0..10` buts de chaque côté, la matrice doit être renormalisée pour sommer exactement à 1. La masse tronquée doit être surveillée ; si elle n’est pas négligeable, il faut agrandir la grille.

### 1.3 Pondération temporelle

La vraisemblance d’un match ancien doit être pondérée par :

```text
w_age = exp(-xi_league * age_days)
```

ou, sous forme de demi-vie :

```text
w_age = 2 ^ (-age_days / half_life_league)
```

Dixon–Coles utilisent une décroissance exponentielle. Leur valeur historique n’est pas une constante universelle à recopier : `xi` ou la demi-vie doivent être choisis par validation walk-forward pour chaque ligue, éventuellement avec shrinkage vers une valeur globale si une ligue dispose de peu de données. [Dixon & Coles, 1997](https://ajbuckeconbikesail.net/wkpapers/Airports/MVPoisson/soccer_betting.pdf). Des travaux dynamiques récents trouvent également un gain prédictif aux modèles pondérés par rapport à plusieurs références statiques, avec des écarts variables selon la ligue. [Egidi et al., *Bayesian weighted discrete-time dynamic models for association football prediction*](https://academic.oup.com/jrsssc/advance-article/doi/10.1093/jrsssc/qlag032/8704597)

## 2. Début de saison : utiliser l’année précédente sans la copier

### 2.1 Prior de saison

À la journée 2, les données de la saison courante sont trop faibles pour estimer seules une force offensive et défensive. Pour chaque équipe :

```text
theta_start = carry * theta_previous_adjusted + (1 - carry) * prior_group
```

Puis, de manière équivalente à un estimateur régularisé :

```text
theta_t = (n_eff / (n_eff + k)) * theta_current
        + (k / (n_eff + k))     * theta_start
```

- `theta` représente séparément attaque et défense sur l’échelle logarithmique ;
- `n_eff = sum(w_age)` est le nombre effectif de matchs officiels récents ;
- `k` contrôle la force du prior ;
- `carry`, `k` et les ajustements inter-ligues sont appris par backtest walk-forward, et non choisis une fois pour toutes.

Cette écriture est une approximation pratique d’un modèle hiérarchique bayésien. En production, une pénalisation quadratique centrée sur `theta_start`, ou un vrai posterior bayésien, évite les mélanges manuels de moyennes.

### 2.2 Continuité entre saisons

Pour une équipe restée dans la même ligue :

- conserver une part importante de sa force finale de la saison précédente ;
- la ramener partiellement vers la moyenne de ligue pour refléter transferts, entraîneur et changement de saison ;
- laisser les matchs officiels courants remplacer progressivement ce prior.

Il ne faut pas réinitialiser toutes les équipes à la moyenne lors de la première journée, ni conserver 100 % de leur niveau précédent. La structure hiérarchique sert justement à gérer cette incertitude et à éviter les estimations extrêmes sur de petits échantillons. [Baio & Blangiardo](https://discovery.ucl.ac.uk/16040/1/16040.pdf)

### 2.3 Équipes promues

Une équipe promue ne doit pas importer directement son ratio de buts de division inférieure : la force des adversaires et le niveau moyen changent.

Prior recommandé :

```text
theta_promoted = promoted_class_mean
               + transfer_adjustment_validated
               + standardized_lower_division_deviation * translation_factor
```

- `promoted_class_mean` : moyenne historique des promus entrant dans cette ligue ;
- `standardized_lower_division_deviation` : niveau du club relativement à sa division précédente, pas son taux de buts brut ;
- `translation_factor` : coefficient entre divisions estimé sur plusieurs cohortes de promus ;
- à défaut d’échantillon suffisant, utiliser le prior historique des promus avec une forte variance, pas un chiffre précis artificiel.

La littérature hiérarchique justifie le partage d’information et les groupes latents, mais les coefficients exacts de translation entre divisions ne sont pas universels : ils doivent être estimés sur les ligues effectivement couvertes par IASHARK. Toute valeur fixe non backtestée resterait une hypothèse interne.

### 2.4 Matchs amicaux

Aucune source primaire identifiée dans cette recherche ne démontre qu’un résultat brut d’amical de clubs doit recevoir le même poids qu’un match officiel pour prédire les buts de championnat. Les compositions, rotations, objectifs physiques, niveaux d’opposition et durées jouées rendent le processus différent.

Règle sûre :

- ne pas inclure les amicaux dans la vraisemblance principale de buts ;
- ne jamais les utiliser pour remplacer l’historique officiel ;
- éventuellement créer plus tard une covariable séparée, à poids très faible, reposant sur les titulaires/minutes et uniquement si un backtest walk-forward prouve un gain ;
- en l’absence de cette preuve, les ignorer.

## 3. Dériver les marchés depuis la matrice de scores

Soit `P[x,y]` la probabilité normalisée du score `x-y`.

### Résultat et doubles chances

```text
P(1)  = sum P[x,y] pour x > y
P(X)  = sum P[x,y] pour x = y
P(2)  = sum P[x,y] pour x < y
P(1X) = P(1) + P(X)
P(X2) = P(X) + P(2)
P(12) = P(1) + P(2)
```

### Totaux et BTTS

```text
P(Over L)  = sum P[x,y] où x+y > L
P(Under L) = sum P[x,y] où x+y < L
P(BTTS Yes) = sum P[x,y] où x>=1 et y>=1
P(BTTS No)  = 1 - P(BTTS Yes)
```

Pour une ligne entière (`2,0`, `3,0`), l’égalité est un remboursement : il faut représenter séparément `win`, `push`, `loss`. Une probabilité binaire simple serait incorrecte. Les quarts de ligne asiatiques nécessitent également demi-gain et demi-perte.

### Totaux d’équipe et victoire sans encaisser

```text
P(Home Over 1.5) = sum P[x,y] où x >= 2
P(Away Over 1.5) = sum P[x,y] où y >= 2
P(Home win to nil) = sum P[x,0] où x >= 1
P(Away win to nil) = sum P[0,y] où y >= 1
```

### Combinés

Les marchés combinés doivent être calculés par intersection des cellules, jamais en multipliant des probabilités marginales dépendantes :

```text
P(Home win AND Over 2.5) = sum P[x,y] où x>y et x+y>=3
P(Away win AND Under 3.5) = sum P[x,y] où x<y et x+y<=3
P(Home win AND BTTS) = sum P[x,y] où x>y, x>=1, y>=1
```

Multiplier `P(Home win) * P(Over 2.5)` supposerait à tort l’indépendance. L’intérêt de la matrice est précisément de conserver leur dépendance.

## 4. Marchés qui exigent d’autres modèles

La matrice de buts ne suffit pas pour :

- tirs et tirs cadrés d’équipe ;
- tirs et tirs cadrés de joueur ;
- corners, cartons, fautes et hors-jeu ;
- marchés par tranche temporelle ou par mi-temps si le modèle ne représente pas le temps.

Chaque famille doit posséder une distribution propre (Poisson, binomiale négative, modèle hurdle/zero-inflated ou modèle de survie selon les diagnostics), ses propres covariables, son propre historique de couverture et sa calibration hors échantillon. Réutiliser le lambda de buts ou transformer naïvement un taux plein match en taux première mi-temps donnerait des probabilités faussement précises.

Pour les joueurs, la probabilité doit intégrer :

```text
P(selection) = sum_m P(minutes=m | lineup, role, fitness)
                     * P(selection | minutes=m, opponent, role)
```

Sans composition probable crédible, puis composition officielle, l’incertitude sur les minutes doit fortement réduire la fiabilité ou rendre le marché inéligible.

## 5. Classement des sélections et contrainte de cote

### 5.1 Ordre correct

Pour chaque fixture :

1. générer toutes les sélections supportées par un modèle validé ;
2. appliquer leur calibration hors échantillon ;
3. retirer les sélections dont la qualité de données ou la couverture est insuffisante ;
4. associer chaque sélection à une cote réelle disponible selon une politique bookmaker explicite ;
5. conserver uniquement `odds >= 1.50` ;
6. trier les candidates restantes par probabilité calibrée décroissante ;
7. utiliser des critères de départage déterministes : intervalle d’incertitude, taille effective, stabilité de calibration ;
8. publier la première, ou « aucun marché ».

Vérifier la cote après avoir trié toute la liste ou filtrer d’abord à `1,50` donne le même gagnant mathématique si la cote ne modifie jamais la probabilité. En pratique, filtrer avant le tri est plus simple et évite de parcourir des centaines de lignes inéligibles.

### 5.2 La cote ne doit pas contaminer le modèle

Dans l’objectif IASHARK, les probabilités implicites bookmaker ne sont pas des features du moteur sportif. Il faut cependant définir précisément « cote réelle » :

- bookmaker de référence unique ; ou
- meilleure cote disponible chez un ensemble stable de bookmakers ; ou
- médiane, à condition d’indiquer clairement qu’elle peut ne pas être jouable chez un opérateur donné.

Changer de politique selon le match introduirait un biais de sélection. La règle `>=1,50` doit utiliser la cote de la même sélection, de la même ligne et de la même période ; aucune correspondance approximative de libellé n’est acceptable.

## 6. Calibration et validation

### 6.1 Pourquoi le hit rate brut ne suffit pas

Un moteur qui publie le candidat au plus fort pourcentage crée une sélection adaptative. Il faut donc backtester **la politique complète de sélection**, et pas uniquement chaque formule isolée.

Validation recommandée :

- walk-forward chronologique, sans mélange aléatoire du futur dans l’entraînement ;
- gel de toutes les données au timestamp où la prédiction aurait réellement été produite ;
- conservation de la cote disponible à ce timestamp, car API-Football ne garde les cotes pré-match que sept jours ;
- résultats par ligue, saison, famille, ligne, phase de saison et niveau de probabilité ;
- comparaison à des baselines simples (moyenne de ligue, modèle Poisson statique, saison précédente shrinkée).

API-Football indique que `/odds` se met typiquement à jour toutes les trois heures, que les cotes apparaissent généralement 1 à 14 jours avant le match, et surtout que leur historique n’est conservé que sept jours. Il faut donc les snapshotter soi-même. L’API précise aussi que `/odds/bets` fournit les types pré-match et que la couverture varie selon ligue et fixture. [Documentation officielle API-Football](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)

### 6.2 Mesures obligatoires

- **Brier score** par sélection binaire et pour le 1X2 ;
- **log loss**, sensible à la surconfiance ;
- **RPS** pour les résultats ordonnés 1/X/2 ;
- courbes de calibration et effectifs par tranche ;
- hit rate de la recommandation finale avec intervalle de confiance ;
- couverture : proportion de matchs produisant une recommandation ;
- taux d’abstention et résultats des candidats rejetés.

La littérature récente sur les modèles dynamiques de football utilise explicitement Brier et RPS pour comparer les distributions prédictives. [Egidi et al.](https://academic.oup.com/jrsssc/advance-article/doi/10.1093/jrsssc/qlag032/8704597)

La calibration doit être apprise uniquement sur des prédictions hors échantillon antérieures. Elle doit être suivie par famille (`1X2`, totals, BTTS, combinés, tirs joueurs), car une probabilité annoncée à 65 % n’a pas forcément la même fiabilité dans chaque famille.

## 7. Données API-Football utiles et limites

Selon la documentation officielle :

- `/fixtures` est la clé de jointure vers événements, compositions, statistiques, joueurs et cotes ;
- `/fixtures/statistics` inclut notamment tirs cadrés, tirs, corners, fautes, hors-jeu, cartons, arrêts et passes, avec des valeurs parfois `null` selon la compétition ;
- `/teams/statistics` fournit les statistiques d’équipe pour une ligue et une saison ;
- `/fixtures/players` fournit les performances individuelles ;
- `/injuries` est mis à jour environ toutes les quatre heures ;
- `/fixtures/lineups` apparaît généralement 30 à 60 minutes avant le coup d’envoi ;
- les capacités doivent être vérifiées via la couverture de `/leagues` ;
- les réponses paginées doivent être parcourues intégralement. [Guide officiel API-Football](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)

Conséquences pour IASHARK :

- `null` ne doit jamais devenir zéro ;
- une erreur API ne doit jamais devenir une statistique moyenne silencieuse ;
- chaque feature doit porter sa provenance, sa saison et son timestamp ;
- les recommandations doivent être recalculées à plusieurs horizons, notamment avant match et après publication des compositions ;
- les marchés joueurs doivent être désactivés si la couverture des compositions/joueurs est insuffisante.

## 8. Risques majeurs

1. **Fausse comparabilité** : classer des pourcentages non calibrés provenant de modèles différents.
2. **Double comptage** : injecter xG, tirs cadrés et buts dans plusieurs ajustements manuels corrélés.
3. **Fuite temporelle** : utiliser une information connue après le timestamp de prédiction.
4. **Surpondération du début de saison** : deux matchs courants ne doivent pas effacer une saison de prior.
5. **Promus mal translatés** : importer leurs taux bruts de division inférieure.
6. **Amicaux assimilés aux officiels** : processus de sélection et objectifs différents.
7. **Marchés dépendants multipliés** : calculer un combiné par produit au lieu de sommer la matrice conjointe.
8. **Lignes asiatiques mal résolues** : oublier remboursements, demi-gains et demi-pertes.
9. **Biais du gagnant** : parmi beaucoup de marchés, le maximum estimé est plus sensible au bruit ; il faut intervalles et shrinkage.
10. **Cotes non reproductibles** : absence de snapshots avant expiration des sept jours API-Football.
11. **Disponibilité confondue avec fiabilité** : une cote présente ne valide pas le modèle correspondant.
12. **Optimisation sur le hit rate seul** : elle favorise les marchés faciles ; le seuil de 1,50 limite cela mais ne remplace ni calibration ni validation prospective.

## 9. Plan recommandé pour IASHARK

### Étape 1 — noyau cohérent

- modèle hiérarchique Poisson/Dixon–Coles par ligue ;
- prior saison précédente avec shrinkage ;
- prior historique spécifique pour promus ;
- time decay optimisé walk-forward ;
- matrice de scores normalisée ;
- tous les marchés résultat/buts/BTTS/clean sheet/combinés dérivés exactement.

### Étape 2 — décision

- mapping exact entre sélection interne et bet/value API-Football ;
- snapshots de cotes avec bookmaker et timestamp ;
- filtre fixe `odds >= 1.50` ;
- classement par probabilité calibrée ;
- abstention obligatoire en cas de données insuffisantes.

### Étape 3 — validation

- backtest walk-forward du moteur complet ;
- calibration par famille ;
- résultats séparés pour journées 1–5 ;
- seuil minimum d’échantillon avant activation d’une famille en production.

### Étape 4 — familles supplémentaires

- tirs/tirs cadrés équipe ;
- puis joueurs après compositions ;
- ensuite seulement corners, cartons et temporalité, chacun avec un modèle et un backtest propres.

## Conclusion

Le moteur le plus crédible pour IASHARK n’est pas un tableau donné à un LLM afin qu’il « choisisse ». Le choix final doit être déterministe : modèles statistiques → probabilités calibrées → contrôle de qualité → cote réelle `>=1,50` → maximum de probabilité → abstention éventuelle.

En début de saison, la saison précédente est indispensable sous forme de prior régularisé. Les matchs officiels courants doivent la remplacer progressivement. Les promus nécessitent une translation historique entre divisions ; les amicaux doivent rester hors du modèle principal tant que leur apport prédictif n’est pas établi. Enfin, tous les combinés résultat/buts doivent provenir des cellules d’une même matrice de scores : c’est ce qui garantit leur cohérence mathématique et évite les produits de probabilités incorrects.

## Sources primaires principales

- Dixon, M. J. & Coles, S. G. (1997), [*Modelling Association Football Scores and Inefficiencies in the Football Betting Market*](https://ajbuckeconbikesail.net/wkpapers/Airports/MVPoisson/soccer_betting.pdf).
- Baio, G. & Blangiardo, M. (2010), [*Bayesian hierarchical model for the prediction of football results*](https://discovery.ucl.ac.uk/16040/1/16040.pdf).
- Egidi et al., [*Bayesian weighted discrete-time dynamic models for association football prediction*](https://academic.oup.com/jrsssc/advance-article/doi/10.1093/jrsssc/qlag032/8704597).
- API-Sports, [documentation et guide officiel API-Football](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide).
