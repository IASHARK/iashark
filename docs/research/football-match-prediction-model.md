# Modèle professionnel de prédiction pré-match d'un match de football

**Date de recherche :** 2026-09-09  
**Périmètre :** probabilités pré-match produites à partir de données sportives de type API-Football/API-Sports.  
**Contrainte structurante :** aucune cote de bookmaker, ni probabilité dérivée des cotes, n'entre dans le modèle sportif, son calibrage ou ses variables.  
**Sources :** documentation officielle API-Football/API-Sports et publications scientifiques originales uniquement.

## Verdict

Le meilleur choix défendable n'est ni une moyenne des cinq derniers matchs, ni un unique réseau de neurones, ni un Poisson statique utilisé seul. L'architecture recommandée est :

1. un **modèle bayésien hiérarchique dynamique attaque–défense**, entraîné simultanément sur toutes les équipes des compétitions reliées ;
2. une **loi d'observation de score Dixon–Coles**, qui corrige les faibles scores que deux Poisson indépendantes représentent imparfaitement ;
3. un **second modèle de performance** fondé sur les xG historiques si de vrais événements de tir sont disponibles, ou sur un modèle génératif de tirs si l'on ne possède que les agrégats API-Football ;
4. une **distribution prédictive postérieure de scores**, et non deux simples moyennes de buts ;
5. des **modèles dédiés** pour les mi-temps, corners, cartons et joueurs, car la matrice des buts ne suffit pas pour ces familles ;
6. un **walk-forward strict**, des scores probabilistes propres et un calibrage appris exclusivement sur des prédictions réellement hors échantillon.

Cette combinaison est une synthèse d'éléments validés séparément par la littérature ; aucun article ne démontre qu'un assemblage unique est universellement le meilleur pour toutes les ligues et toutes les époques. La règle professionnelle est donc : **faire de cette architecture le candidat principal, conserver des modèles simples comme références et laisser la validation temporelle choisir le champion par compétition et par marché**.

Une estimation de 72 % signifie « environ 72 occurrences sur 100 dans des cas comparables si le modèle est calibré ». Elle ne signifie jamais certitude.

---

## 1. Séparation absolue entre analyse sportive et bookmaker

Le pipeline doit avoir deux frontières techniques différentes :

```text
API sportive -> données disponibles à l'instant t -> modèle -> distribution de scores -> probabilités

Cotes bookmaker -------------------------------------------------------> prix, après la prédiction
```

Dans la version décrite ici :

- les cotes ne sont pas des features ;
- elles ne servent pas à estimer les forces des équipes ;
- elles ne servent pas au calibrage ;
- elles ne modifient pas la probabilité finale ;
- l'endpoint `/predictions` d'API-Football est lui aussi exclu des features : c'est une prédiction tierce, pas une donnée sportive brute.

Les cotes peuvent éventuellement être consultées **après** le calcul pour déterminer le prix d'un pari ou comme benchmark externe. Cela ne change pas le modèle sportif. Sans cote, on peut répondre à « qu'est-ce qui est le plus probable ? », mais pas à « est-ce un pari rentable ? ».

Cette séparation doit être imposée dans le code : schémas de données distincts, liste blanche de features et test automatisé garantissant qu'aucune colonne `odds`, `bookmaker`, `implied_probability` ou prédiction fournisseur n'atteint l'entraînement.

---

## 2. Données réellement exploitables avec API-Football

### 2.1 Ce que documente officiellement l'API

API-Football relie calendrier, résultat, événements, compositions, statistiques d'équipe et de joueurs à un `fixture_id`. `/fixtures/statistics` documente notamment tirs cadrés, tirs non cadrés, tirs totaux, tirs bloqués, tirs dans/hors de la surface, corners, possession, fautes, cartons, arrêts et passes. `/fixtures/players` documente minutes, position, tirs, buts, passes, duels, dribbles et cartons. Les compositions fournissent titulaires, banc, formation et entraîneur. [API-Football, guide officiel des endpoints](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)

La disponibilité dépend de la ligue, de la saison et du match. Le champ `coverage` indique la couverture visée, mais un drapeau vrai ne garantit pas que chaque valeur sera présente sur chaque rencontre. L'application doit donc mesurer la complétude réelle et accepter les valeurs nulles. [API-Football, guide officiel de couverture et quota](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage)

Les statistiques de fixture sont des données pendant/après le match. Pour une prédiction pré-match, on utilise uniquement les statistiques des **matchs antérieurs**. Les statistiques finales de la rencontre à prédire seraient une fuite de cible.

Les compositions apparaissent généralement peu avant le coup d'envoi et parfois seulement après le match selon la compétition. L'API recommande de vérifier leur présence dans la fenêtre pré-match au lieu de supposer qu'elles existent. [API-Football, guide officiel des endpoints](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)

### 2.2 Ce que l'API ne garantit pas : un vrai flux xG

La documentation officielle examinée ne décrit pas d'endpoint xG standard, ni de coordonnées événementielles de chaque tir. Elle documente des agrégats tels que tirs dans/hors de la surface, mais pas systématiquement la position exacte, l'angle, le type de passe, la pression défensive ou la position du gardien.

Il faut donc distinguer :

- **vrai xG** : probabilité de but calculée pour chaque tir à partir de ses caractéristiques ;
- **proxy de performance de tir** : estimation construite avec des totaux de tirs, tirs cadrés ou tirs dans la surface.

Le second ne doit jamais être présenté comme du xG. Si de vrais xG deviennent indispensables, il faut ajouter une source événementielle qui les fournit ou qui fournit les variables nécessaires pour les recalculer.

### 2.3 Contrat temporel anti-fuite

Chaque donnée stockée doit contenir au minimum :

```text
fixture_id
event_time          # moment sportif auquel la donnée se rapporte
available_at        # première fois où le système pouvait réellement la connaître
ingested_at         # moment d'ingestion
source
coverage_status
raw_payload_hash
```

Le constructeur de features applique toujours :

```text
available_at <= prediction_cutoff < kickoff
```

Il faut produire des modèles distincts selon le moment réel de décision :

- `D-1` ou `H-6` : sans composition confirmée ;
- `T-60`/`T-30` : avec composition si elle est publiée ;
- éventuellement plusieurs scénarios de composition avant confirmation.

Une prédiction rejouée six mois plus tard doit utiliser le snapshot qui existait au cutoff, pas la version actuelle de l'API.

---

## 3. Pourquoi commencer par une distribution de buts

Maher a formalisé un modèle où le nombre de buts de chaque équipe suit une loi de Poisson dont l'intensité dépend de la force offensive de l'équipe et de la force défensive de l'adversaire. Il a trouvé qu'un modèle Poisson indépendant décrivait raisonnablement les scores, avec de petites différences systématiques, et qu'une version bivariée pouvait améliorer l'ajustement. [Maher, 1982, *Modelling association football scores*](https://doi.org/10.1111/j.1467-9574.1982.tb00782.x)

Pour un match entre le domicile `h` et l'extérieur `a`, le socle est :

\[
Y_h \sim \operatorname{Poisson}(\lambda_h), \qquad
Y_a \sim \operatorname{Poisson}(\lambda_a)
\]

et

\[
P(Y_h=x,Y_a=y)
=
\frac{e^{-\lambda_h}\lambda_h^x}{x!}
\frac{e^{-\lambda_a}\lambda_a^y}{y!}.
\]

L'intérêt structurel est majeur : une seule distribution cohérente permet de dériver 1N2, double chance, draw-no-bet, totaux de buts, BTTS, score exact, totaux d'équipe et handicaps.

La faiblesse du Poisson statique indépendant est tout aussi claire :

- les forces changent dans le temps ;
- les nouveaux clubs et petits échantillons sont mal estimés sans régularisation ;
- l'indépendance représente imparfaitement certains faibles scores ;
- deux moyennes ponctuelles de buts ne propagent pas l'incertitude sur les paramètres, les joueurs ou la composition.

Le Poisson indépendant doit rester une baseline indispensable, pas le modèle final présumé.

---

## 4. Modèle principal recommandé : bayésien hiérarchique dynamique + Dixon–Coles

### 4.1 Intensités de buts

On définit `d` comme une **faiblesse défensive** : une valeur positive signifie que l'équipe concède davantage. Pour un match `m`, dans la ligue `l`, à la date `t` :

\[
\log \lambda_{h,m}
= \mu_{l,s}+H_{l,s}+a_{h,t}+d_{a,t}
+\boldsymbol\beta_l^\top \mathbf x_m+L_{h,m},
\]

\[
\log \lambda_{a,m}
= \mu_{l,s}+a_{a,t}+d_{h,t}
+\boldsymbol\gamma_l^\top \mathbf x_m+L_{a,m}.
\]

où :

- `mu[l,s]` est le niveau de buts de la ligue/saison ;
- `H[l,s]` est l'avantage domicile, annulé sur terrain neutre ;
- `a[i,t]` est la force offensive latente de l'équipe `i` ;
- `d[i,t]` est sa faiblesse défensive latente ;
- `x[m]` contient uniquement des covariables connues au cutoff ;
- `L` est l'ajustement de composition/joueurs, égal à zéro si sa qualité n'est pas suffisante.

La formulation log-linéaire attaque/défense et l'avantage domicile suivent la structure des modèles hiérarchiques publiés :

\[
\log \theta_{g,home}=home+att_{home}+def_{away},\qquad
\log \theta_{g,away}=att_{away}+def_{home}.
\]

Baio et Blangiardo traitent les effets d'équipe comme échangeables, imposent des contraintes somme-à-zéro et obtiennent les prévisions par la distribution prédictive postérieure. [Baio & Blangiardo, 2010, article et PDF auteur](https://discovery.ucl.ac.uk/id/eprint/16040/)

### 4.2 Forces qui évoluent avec le temps

Koopman et Lit modélisent les intensités par :

\[
\lambda_{h,ijt}=\exp(\delta+\alpha_{i,t}-\beta_{j,t}),\qquad
\lambda_{a,ijt}=\exp(\alpha_{j,t}-\beta_{i,t}),
\]

et les forces attaque/défense dans un espace d'état autorégressif :

\[
\mathbf z_t=\boldsymbol\mu+\Phi\mathbf z_{t-1}+\boldsymbol\eta_t,
\qquad \boldsymbol\eta_t\sim\mathcal N(0,H).
\]

Leur étude utilise sept saisons pour l'estimation puis deux saisons hors échantillon ; rendre les forces statiques ou supprimer la décomposition attaque/défense dégrade les résultats de leur modèle. [Koopman & Lit, 2015, PDF auteur du modèle dynamique bivarié](https://research.vu.nl/ws/files/3167073/12099.pdf)

Pour la production, on peut utiliser une évolution hiérarchique régulière :

\[
a_{i,t}\sim\mathcal N(\phi_a^{\Delta t}a_{i,t-1},\sigma_a^2(\Delta t)),
\qquad
d_{i,t}\sim\mathcal N(\phi_d^{\Delta t}d_{i,t-1},\sigma_d^2(\Delta t)).
\]

`Delta t` tient compte de l'intervalle irrégulier entre deux matchs. `phi < 1` produit un retour progressif vers la moyenne ; la variance d'évolution contrôle la vitesse à laquelle le modèle accepte qu'une équipe ait changé. Ces paramètres ne sont pas fixés « au feeling » : ils sont estimés ou choisis par validation temporelle imbriquée.

Une alternative plus simple, utile comme challenger, est la pondération de vraisemblance de Dixon–Coles :

\[
w_m=\exp[-\xi(T-t_m)],
\qquad
L_T(\Theta)=\prod_{m:t_m<T} P_m(\Theta)^{w_m}.
\]

Dixon et Coles choisissent leur décroissance en fonction d'un score prédictif rétrospectif. Leur valeur historique ne doit pas être copiée comme constante universelle : `xi` doit être réestimé par ligue et par période. [Dixon & Coles, 1997](https://doi.org/10.1111/1467-9876.00065)

### 4.3 Hiérarchie et régularisation

Les paramètres ne doivent pas être estimés indépendamment pour chaque équipe avec peu de matchs. Le pooling partiel prend une forme telle que :

\[
a_{i,t_0}\sim Student\text{-}t(\nu,0,\sigma_{a,l}),
\qquad
d_{i,t_0}\sim Student\text{-}t(\nu,0,\sigma_{d,l}),
\]

avec :

\[
\sum_{i\in l}a_{i,t}=0,
\qquad
\sum_{i\in l}d_{i,t}=0.
\]

Le pooling stabilise les petits échantillons et les promus. Les queues plus lourdes d'une Student-t limitent le risque de ramener excessivement les très bonnes et très mauvaises équipes vers la moyenne. Baio et Blangiardo documentent précisément ce problème d'overshrinkage et proposent une structure à mélange/Student-t pour le réduire. [Baio & Blangiardo, 2010](https://discovery.ucl.ac.uk/id/eprint/16040/)

Pour les coupes ou les clubs issus de ligues différentes, il faut un graphe multi-compétitions : effets de niveau par ligue, priors hiérarchiques et rencontres interligues comme ponts. Les confrontations de coupe ne doivent pas être traitées comme si les deux championnats avaient automatiquement le même niveau.

### 4.4 Correction Dixon–Coles des faibles scores

Le modèle principal utilise :

\[
P(Y_h=x,Y_a=y)
=\tau_{\lambda_h,\lambda_a}(x,y;\rho)
\operatorname{Pois}(x;\lambda_h)
\operatorname{Pois}(y;\lambda_a),
\]

avec :

\[
\tau(x,y)=
\begin{cases}
1-\lambda_h\lambda_a\rho,&x=0,y=0\\
1+\lambda_h\rho,&x=0,y=1\\
1+\lambda_a\rho,&x=1,y=0\\
1-\rho,&x=1,y=1\\
1,&\text{sinon.}
\end{cases}
\]

Cette correction vise spécifiquement `0-0`, `0-1`, `1-0` et `1-1`, là où l'indépendance est la plus discutable. [Dixon & Coles, 1997](https://doi.org/10.1111/1467-9876.00065)

L'implémentation doit garantir `tau >= 0` pour tous les matchs et tous les tirages postérieurs pertinents. Dans le modèle original :

\[
\max(-1/\lambda_h,-1/\lambda_a)
\le \rho \le
\min(1/(\lambda_h\lambda_a),1).
\]

### 4.5 Challenger bivarié

Karlis et Ntzoufras montrent qu'une Poisson bivariée peut améliorer l'ajustement et la prédiction du nombre de nuls en introduisant une composante de covariance entre les scores. [Karlis & Ntzoufras, 2003](https://doi.org/10.1111/1467-9884.00366)

La construction classique est :

\[
Y_h=U_h+W,\qquad Y_a=U_a+W,
\]

avec `U_h`, `U_a` et `W` Poisson indépendantes. Alors :

\[
\operatorname{Cov}(Y_h,Y_a)=\gamma\ge0.
\]

Elle est élégante, mais ne représente qu'une covariance non négative dans cette forme et la composante commune s'annule dans la différence `Y_h-Y_a`. Koopman et Lit ont testé un modèle bivarié dynamique complet, mais la suppression de leur paramètre de dépendance ne dégradait pas significativement la prévision hors échantillon dans leurs deux saisons de test. La dépendance doit donc gagner sa place dans le walk-forward ; elle ne doit pas être ajoutée parce qu'elle paraît plus sophistiquée. [Koopman & Lit, 2015](https://research.vu.nl/ws/files/3167073/12099.pdf)

**Décision recommandée :** modèle principal dynamique + Dixon–Coles ; Poisson indépendante et Poisson bivariée dynamique comme challengers. Le champion est choisi par log loss hors échantillon, pas par complexité.

---

## 5. Variables sportives : ce qu'il faut vraiment mettre dans le modèle

### 5.1 Socle obligatoire

- buts marqués et encaissés à 90 minutes, hors séance de tirs au but ;
- équipes domicile/extérieur et terrain neutre ;
- ligue, saison, phase de compétition ;
- dates exactes et jours de repos ;
- adversaires rencontrés, déjà pris en compte par l'estimation simultanée attaque/défense ;
- changements de division et incertitude de début de saison ;
- cartons rouges historiques et minute de l'événement pour éviter de confondre un match joué longtemps à dix avec la force normale de l'équipe ;
- forfaits, reports et changements de date correctement historisés.

### 5.2 Covariables candidates, à conserver seulement si elles gagnent hors échantillon

- différence de repos ;
- nombre de matchs sur les 7, 14 et 28 derniers jours ;
- déplacement ou terrain neutre ;
- type de compétition et phase éliminatoire ;
- absences connues au cutoff ;
- composition confirmée et qualité estimée des titulaires ;
- signaux historiques de tirs/xG décrits à la section suivante.

Chaque coefficient doit avoir un prior régularisant centré près de zéro. Ajouter une variable parce qu'elle « semble logique » ne suffit pas.

### 5.3 Variables à ne pas surpondérer

- la série `WWDLW` ;
- la position brute au classement ;
- les cinq derniers matchs sans correction de l'adversaire ;
- les face-à-face historiques ;
- les pourcentages déjà agrégés de `/teams/statistics` lorsqu'on possède les fixtures brutes.

Ces informations sont souvent des transformations incomplètes des mêmes résultats déjà assimilés par les états attaque/défense. Les intégrer naïvement compte deux fois le signal. Un derby ou un effet tactique de matchup peut exister, mais il doit être démontré sur des données hors échantillon, pas déduit de trois anciens face-à-face.

### 5.4 Combien de matchs regarder ?

Il ne faut pas choisir arbitrairement « les 5 », « les 10 » ou « les 20 » derniers matchs. On entraîne le modèle simultanément sur l'historique disponible et on laisse l'état dynamique ou la décroissance décider du poids effectif du passé.

Point de départ d'ingénierie, à valider :

- trois à cinq saisons pour initialiser une grande ligue stable ;
- fenêtres roulantes alternatives de deux, trois et cinq saisons ;
- pooling intersaison et hausse temporaire de la variance lors d'une rupture d'effectif/entraîneur ;
- historique plus large pour les effets rares, mais avec décroissance ;
- pas de recommandation si la couverture récente est trop faible.

Dixon et Coles rapportaient qu'environ 60 demi-semaines étaient nécessaires à l'initialisation de leur cadre historique ; ce nombre n'est ni une loi moderne ni une constante transférable. [Dixon & Coles, 1997](https://doi.org/10.1111/1467-9876.00065)

---

## 6. Deuxième signal : xG ou modèle génératif de tirs

### 6.1 Si des événements de tir complets sont disponibles

Pour chaque tir `r` :

\[
xG_r=P(goal_r=1\mid \mathbf s_r),
\qquad
xG_{match}=\sum_r xG_r.
\]

Les variables minimales sérieuses sont la distance, l'angle, la partie du corps et la situation du tir ; des données plus riches ajoutent position du gardien, pression, défenseurs sur la trajectoire, type de contrôle et phase de jeu. Une étude originale sur 105 627 tirs montre l'importance de ces informations et obtient ses meilleures performances en les combinant. Elle trouve aussi que les xG historiques prédisent mieux certains résultats futurs que des métriques traditionnelles, avec un avantage particulièrement visible après accumulation d'une partie de la saison. [Anzer & Bauer, 2021](https://doi.org/10.3389/fspor.2021.624475)

Une autre étude originale multi-ligues confirme le poids dominant de la distance et montre que la complexité algorithmique ne garantit pas l'amélioration : dans certains jeux de données, une régression logistique sans optimisation d'hyperparamètres rivalise avec des modèles plus complexes, tandis que cette optimisation peut sur-apprendre. [Mead, O'Hare & McMenemy, 2023, *Expected goals in football*](https://doi.org/10.1371/journal.pone.0282295)

Le pré-match n'utilise jamais les xG de la rencontre à venir. Il prévoit les futurs xG à partir des xGF/xGA antérieurs, eux-mêmes ajustés de l'adversaire et du temps.

### 6.2 Si l'on ne possède que les agrégats API-Football

On ne fabrique pas un faux xG. On utilise un modèle création–conversion :

\[
S_{h,m}\sim NegBin(\nu_{h,m},\kappa_S),
\]

\[
T_{h,m}\mid S_{h,m}\sim Binomial(S_{h,m},q_{h,m}),
\]

\[
G_{h,m}\mid T_{h,m}\sim Binomial(T_{h,m},c_{h,m}),
\]

où `S` représente les tirs, `T` les tirs cadrés et `G` les buts. Les intensités `nu`, `q` et `c` ont leurs propres états attaque/défense et leur propre pooling. Les tirs dans la surface peuvent servir de canal supplémentaire si leur complétude est suffisante.

Ce modèle sépare :

- création d'occasions ;
- précision des tirs ;
- finition/arrêts du gardien.

Mais les agrégats restent affectés par le score, les cartons rouges et le style : une équipe menée tire souvent davantage. Ils doivent être corrigés par contexte historique ou leur incertitude doit être augmentée.

### 6.3 Fusion des modèles

Le modèle de buts et le modèle xG/tirs produisent chacun une matrice de score. La fusion la plus sûre est un mélange de distributions :

\[
P_{final}(x,y)=\sum_{k=1}^{K} w_kP_k(x,y),
\qquad w_k\ge0,\quad \sum_k w_k=1.
\]

Les poids `w` sont appris en minimisant le log loss sur des prédictions walk-forward antérieures. Ils peuvent varier par ligue si l'échantillon le permet ; sinon ils sont hiérarchiques. Aucune cote n'entre dans ce mélange.

Le système ne doit adopter le second signal que s'il améliore réellement le test futur. Une donnée plus riche mais très incomplète peut être moins utile qu'un modèle de buts propre.

---

## 7. Compositions, blessures et joueurs

### 7.1 Deux prédictions officielles

Le système publie :

1. une version **pré-composition**, avec plusieurs scénarios pondérés ;
2. une version **composition confirmée**, recalculée quand l'API fournit le onze.

Avant confirmation :

\[
P(score)=\sum_s P(score\mid lineup_s)P(lineup_s).
\]

Après confirmation, la masse du scénario officiel devient 1, sauf incertitude de dernière minute explicitement modélisée.

### 7.2 Impact des joueurs appris, jamais décrété

Un ajustement de lineup peut prendre la forme :

\[
L_{team}=\sum_{p\in squad}
P(p\text{ joue})\frac{E[minutes_p]}{90}u_p,
\]

où `u_p` est un effet joueur régularisé et appris sur l'historique. Il faut séparer, si les données le permettent, contribution offensive, contribution défensive, tireur de penalty et gardien.

Règles :

- pas de coefficient manuel « star absente = -20 % » ;
- fort shrinkage vers zéro pour les joueurs avec peu de minutes ;
- aucune note de match future ; seules les notes historiques disponibles au cutoff sont candidates ;
- pas d'impact lineup si la compétition ne fournit pas un historique assez complet ;
- comparer la version avec joueurs à la version équipe seule en walk-forward.

En pratique, un bon état dynamique d'équipe absorbe déjà une partie des changements d'effectif. Le module joueurs ne doit être activé que lorsqu'il apporte un gain mesurable.

---

## 8. De la distribution de scores aux marchés

Pour chaque tirage postérieur `b`, on calcule les intensités, applique la correction de score et somme une grille `0..Gmax`. `Gmax` doit être augmenté jusqu'à ce que la masse de queue omise soit négligeable, par exemple `< 10^-8`, plutôt que fixé aveuglément à 5.

Puis on moyenne les probabilités sur les tirages postérieurs :

\[
P(M)=E_{\Theta\mid data}
\left[
\sum_{x,y}\mathbf 1_M(x,y)P(x,y\mid\Theta)
\right].
\]

Cette intégration est supérieure au simple calcul réalisé avec `E[lambda_h]` et `E[lambda_a]`, car elle propage l'incertitude des paramètres.

### 8.1 Marchés dérivables directement

\[
P(Home)=\sum_{x>y}P(x,y),
\quad
P(Draw)=\sum_{x=y}P(x,y),
\quad
P(Away)=\sum_{x<y}P(x,y).
\]

\[
P(Over\ k.5)=\sum_{x+y>k}P(x,y).
\]

\[
P(BTTS)=\sum_{x\ge1,y\ge1}P(x,y).
\]

\[
P(Home\ or\ Draw)=P(Home)+P(Draw).
\]

Pour un draw-no-bet domicile, la probabilité conditionnelle de gagner parmi les matchs non nuls est :

\[
P(H\mid non\ draw)=\frac{P(H)}{P(H)+P(A)}.
\]

Le moteur de handicap asiatique doit sommer les cellules de score avec la règle exacte de règlement : victoire, demi-victoire, push, demi-défaite et défaite.

### 8.2 Marchés qui exigent un autre modèle

- **Première mi-temps :** modèle de buts de première période appris sur les scores de mi-temps. Diviser les lambdas plein match par deux est injustifié.
- **Minute du premier but / but par tranche :** processus de risque/hazard temporel avec score et temps.
- **Corners :** modèle de comptage dédié, souvent Poisson-lognormal ou binomial négatif, avec forces « corners pour/contre ».
- **Cartons :** modèle dédié avec équipe, adversaire, arbitre connu, compétition et contexte ; les rouges rares demandent pooling/hurdle ou un processus séparé.
- **Buteur :** modèle de présence et minutes, puis allocation cohérente de l'intensité de buts de l'équipe entre les joueurs.
- **Tirs joueur :** exposition en minutes, rôle, part de tirs de l'équipe et adversaire.

La probabilité d'un combiné ne doit jamais être obtenue en multipliant ses jambes sauf indépendance démontrée. Les événements « équipe gagne », « attaquant marque » et « over » sont fortement dépendants ; il faut les calculer à partir d'une simulation jointe.

---

## 9. Validation temporelle : l'étape qui décide si le modèle est bon

### 9.1 Walk-forward externe strict

Les données football sont non stationnaires. Les études de validation de séries temporelles concluent que, dans des environnements réels non stationnaires, les méthodes hors échantillon qui préservent l'ordre temporel estiment mieux la performance que le k-fold aléatoire. [Cerqueira, Torgo & Mozetic, 2020](https://doi.org/10.1007/s10994-020-05910-7)

Protocole :

```text
Bloc 1..N        -> entraînement
Bloc N+1         -> prédictions gelées, puis observation des résultats

Bloc 1..N+1      -> réentraînement/mise à jour
Bloc N+2         -> prédictions gelées

... jusqu'au dernier bloc futur, jamais utilisé pour choisir le modèle
```

Le bloc peut être une journée de championnat ou une semaine. Koopman et Lit ont validé leurs prévisions one-step-ahead sur deux saisons après sept saisons d'estimation, en avançant dans le temps ; leur conception est un patron utile pour éviter la fuite. [Koopman & Lit, 2015](https://research.vu.nl/ws/files/3167073/12099.pdf)

### 9.2 Validation imbriquée

- **boucle externe :** estimation honnête de la performance future ;
- **boucle interne temporelle :** choix du decay, priors, covariables, fenêtre, modèles et poids d'ensemble ;
- **bloc de calibration :** prédictions hors échantillon uniquement ;
- **test final :** période récente jamais consultée pendant le développement.

Le même pipeline de snapshots et cutoffs utilisé en production doit construire les folds historiques.

### 9.3 Baselines et ablations obligatoires

Comparer au minimum :

1. fréquences moyennes de la ligue ;
2. Poisson statique indépendante ;
3. Dixon–Coles statique avec décroissance ;
4. modèle dynamique hiérarchique sans covariables ;
5. modèle dynamique complet ;
6. modèle xG/tirs seul ;
7. ensemble sans cotes.

Pour chaque ajout, exécuter une ablation : sans dynamique, sans dépendance, sans shots, sans joueurs, sans repos. Si le gain n'est pas stable dans plusieurs blocs futurs, l'ajout ne passe pas en production.

### 9.4 Métriques probabilistes

Gneiting et Raftery recommandent des règles de score propres, qui récompensent la déclaration honnête de la distribution prédictive ; le but est la netteté sous contrainte de calibration. [Gneiting & Raftery, 2007](https://doi.org/10.1198/016214506000001437)

**Log loss score exact :**

\[
LL_{score}=-\frac1N\sum_m\log P_m(Y_{h,m},Y_{a,m}).
\]

**Log loss 1N2 :**

\[
LL_{1N2}=-\frac1N\sum_m\log p_{m,y_m}.
\]

**Brier multiclasses :**

\[
BS=\frac1N\sum_m\sum_{c\in\{H,D,A\}}
(p_{m,c}-o_{m,c})^2.
\]

**Ranked Probability Score 1N2 :**

\[
RPS_m=\frac1{K-1}\sum_{k=1}^{K-1}
\left(\sum_{j=1}^{k}p_{m,j}-\sum_{j=1}^{k}o_{m,j}\right)^2.
\]

**Marché binaire :** Brier `(p-y)^2` et log loss binaire.

Une étude originale consacrée aux prévisions W/D/L de football conclut que le score logarithmique est plus efficace que le Brier/RPS pour reconnaître un meilleur système dans ses expériences. Il constitue donc la métrique principale ; Brier, RPS et calibration restent des diagnostics complémentaires. [Wheatcroft, 2021](https://doi.org/10.1515/jqas-2019-0089)

Ne pas utiliser l'accuracy comme métrique principale : annoncer systématiquement le favori peut avoir une accuracy acceptable tout en donnant de mauvaises probabilités.

### 9.5 Incertitude des métriques

Publier :

- nombre de matchs et de saisons ;
- résultat global et par ligue ;
- résultat par tranche de probabilité ;
- intervalle d'incertitude par bootstrap en blocs de journées/saisons ;
- stabilité selon les cutoffs `D-1` et `T-60` ;
- impact des données manquantes ;
- dérive récente par rapport à l'historique.

L'amélioration de 0,001 de log loss sur quelques centaines de matchs ne justifie pas une déclaration de supériorité.

---

## 10. Calibration sans bookmaker

La calibration se mesure sportivement : parmi les événements annoncés à `p`, la fréquence observée doit approcher `p`. Elle n'a pas besoin de cote.

Procédure :

1. générer les probabilités walk-forward brutes ;
2. réserver une période passée de calibration ;
3. apprendre le calibrateur uniquement sur ces prédictions hors échantillon ;
4. appliquer le calibrateur aux matchs futurs ;
5. réévaluer le calibrateur dans chaque boucle externe.

Pour 1N2, la calibration de Dirichlet est nativement multiclasses :

\[
\mathbf p_{cal}=softmax(W\log\mathbf p+\mathbf b).
\]

Elle doit être régularisée fortement lorsque le volume est réduit. [Kull et al., 2019, article original NeurIPS](https://proceedings.neurips.cc/paper_files/paper/2019/hash/8ca01ea920679a0fe3728441494041b9-Abstract.html)

Pour BTTS, over/under et autres sorties binaires, la beta calibration est un candidat paramétrique :

\[
cal(p)=sigmoid(c+a\log p-b\log(1-p)),\quad a,b\ge0.
\]

Elle contient l'identité et est moins susceptible de sur-apprendre que l'isotonique sur un petit échantillon. [Kull, Silva Filho & Flach, 2017](https://proceedings.mlr.press/v54/kull17a.html)

Ne pas calibrer chaque ligne de marché avec quelques dizaines d'exemples. Utiliser un calibrage hiérarchique par famille/ligue ou conserver la probabilité brute quand l'échantillon ne permet pas mieux. Toute méthode de calibration doit elle aussi battre l'identité hors échantillon.

---

## 11. Quantification honnête de l'incertitude

Le moteur génère des tirages de :

- forces attaque/défense ;
- niveau de ligue et avantage domicile ;
- coefficients de contexte ;
- composition probable et minutes ;
- données manquantes imputées ;
- état futur entre la dernière observation et le coup d'envoi.

Pour chaque marché, il publie :

```text
probabilité centrale : médiane ou moyenne postérieure
intervalle crédible : par exemple 10e–90e percentile
probabilité calibrée : si le calibrateur est validé
qualité des données : séparée de la probabilité
cutoff et fraîcheur : date exacte de l'analyse
sensibilité : résultat selon les principaux scénarios de lineup
```

Il faut séparer trois notions :

- **probabilité de l'événement** : « over 1,5 = 76 % » ;
- **incertitude de l'estimation** : « intervalle plausible 71–80 % » ;
- **qualité des données** : « 92 % des champs nécessaires présents ».

Les fusionner en un mystérieux « indice de confiance 8/10 » détruit l'information.

---

## 12. Règle de mise en production

Un modèle ou une variable ne devient actif que si :

1. il améliore le log loss walk-forward contre les baselines ;
2. le gain subsiste sur plusieurs blocs temporels ;
3. la calibration ne se détériore pas ;
4. la couverture de données est mesurée et suffisante ;
5. l'ablation confirme que le gain vient réellement de la brique ajoutée ;
6. le modèle ne dépend d'aucune information postérieure au cutoff ;
7. ses probabilités restent cohérentes entre les marchés dérivés ;
8. les intervalles d'incertitude et les cas d'abstention sont exposés.

Le système doit pouvoir répondre :

> Données ou calibration insuffisantes : aucune conclusion forte sur ce match.

C'est une sortie professionnelle, pas un échec.

---

## 13. Ordre d'implémentation recommandé

### Phase 0 — audit et snapshots

- mesurer la couverture réelle sur 3 à 5 saisons par ligue ;
- stocker les réponses brutes et `available_at` ;
- reconstruire les cutoffs historiques ;
- séparer définitivement features sportives, prédictions tierces et cotes.

### Phase 1 — baselines auditées

- Poisson indépendante attaque/défense ;
- Dixon–Coles statique avec decay choisi chronologiquement ;
- matrice de scores et règlement exact des marchés buts ;
- walk-forward, log loss, Brier, RPS et courbes de calibration.

### Phase 2 — champion dynamique hiérarchique

- états attaque/défense variables dans le temps ;
- niveaux ligue/saison et promus ;
- posterior predictive complète ;
- calibration Dirichlet/beta seulement si validée ;
- comparaison stricte aux baselines.

### Phase 3 — performance et contexte

- vrai xG si une source événementielle existe ; sinon modèle tirs explicite ;
- repos/congestion et gestion des rouges historiques ;
- mélange de distributions dont les poids sont appris hors échantillon.

### Phase 4 — compositions et joueurs

- modèles de titularisation et minutes ;
- effets joueurs shrinkés ;
- analyse pré-lineup et version confirmed XI ;
- pas d'activation sans gain futur démontré.

### Phase 5 — autres familles

- première mi-temps ;
- corners ;
- cartons ;
- buteurs et tirs joueur ;
- simulation jointe des combinés.

---

## 14. Conclusion opérationnelle

La meilleure méthode à construire est donc un **système de distributions**, pas un générateur de pronostics :

```text
données sportives horodatées
        ↓
états dynamiques attaque/défense avec pooling hiérarchique
        ↓
Dixon–Coles + modèle xG/tirs challenger
        ↓
posterior predictive de tous les scores
        ↓
probabilités cohérentes par marché
        ↓
calibration et validation walk-forward
        ↓
probabilité + intervalle + qualité de données + possibilité d'abstention
```

Le bookmaker n'intervient dans aucun de ces calculs. Si l'objectif devient ensuite de décider si un pari vaut son prix, la cote est consultée dans une couche séparée, après gel de la probabilité sportive.

Le détail le plus « professionnel » n'est pas une formule plus impressionnante : c'est l'obligation de prouver, match après match et uniquement vers le futur, que chaque sophistication améliore réellement les probabilités.

## Sources primaires principales

- [Maher (1982), *Modelling association football scores*](https://doi.org/10.1111/j.1467-9574.1982.tb00782.x)
- [Dixon & Coles (1997), *Modelling Association Football Scores and Inefficiencies in the Football Betting Market*](https://doi.org/10.1111/1467-9876.00065)
- [Rue & Salvesen (2000), *Prediction and retrospective analysis of soccer matches in a league*](https://doi.org/10.1111/1467-9884.00243)
- [Karlis & Ntzoufras (2003), *Analysis of sports data by using bivariate Poisson models*](https://doi.org/10.1111/1467-9884.00366)
- [Baio & Blangiardo (2010), *Bayesian hierarchical model for the prediction of football results*](https://discovery.ucl.ac.uk/id/eprint/16040/)
- [Koopman & Lit (2015), *A dynamic bivariate Poisson model for analysing and forecasting match results in the English Premier League*](https://doi.org/10.1111/rssa.12042)
- [Anzer & Bauer (2021), *A Goal Scoring Probability Model for Shots Based on Synchronized Positional and Event Data in Football*](https://doi.org/10.3389/fspor.2021.624475)
- [Mead, O'Hare & McMenemy (2023), *Expected goals in football: Improving model performance and demonstrating value*](https://doi.org/10.1371/journal.pone.0282295)
- [Gneiting & Raftery (2007), *Strictly Proper Scoring Rules, Prediction, and Estimation*](https://doi.org/10.1198/016214506000001437)
- [Wheatcroft (2021), *Evaluating probabilistic forecasts of football matches*](https://doi.org/10.1515/jqas-2019-0089)
- [Cerqueira, Torgo & Mozetic (2020), *Evaluating time series forecasting models*](https://doi.org/10.1007/s10994-020-05910-7)
- [Kull, Silva Filho & Flach (2017), *Beta calibration*](https://proceedings.mlr.press/v54/kull17a.html)
- [Kull et al. (2019), *Beyond temperature scaling: Dirichlet calibration*](https://proceedings.neurips.cc/paper_files/paper/2019/hash/8ca01ea920679a0fe3728441494041b9-Abstract.html)
- [API-Football, guide officiel des endpoints et de leur disponibilité](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)
- [API-Football, guide officiel couverture/quota](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage)
