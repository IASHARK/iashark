# Top buteurs potentiels — 9 septembre 2026

**Snapshot de travail :** 9 septembre 2026 vers 01 h 26, heure de Paris.  
**Marché étudié :** buteur à tout moment, uniquement sur les rencontres masculines seniors encore à jouer le 9 septembre en heure de Paris.

## Conclusion

Le meilleur trio **pré-compositions** est :

1. **Raphinha — Barcelone–Feyenoord**
2. **Cristiano Ronaldo — Al-Nassr–Abha**
3. **Lamine Yamal — Barcelone–Feyenoord**

Ce sont trois candidatures pour des **paris simples**, conditionnées à une titularisation. Ce n'est pas un combiné « sûr » : Raphinha et Lamine Yamal jouent le même match et leurs résultats sont corrélés. Aucun onze officiel n'était disponible dans API-Football au moment du snapshot.

| Rang | Heure Paris | Joueur | Match | Cotes observées | Proba brute des cotes | Estimation prudente IASHARK | Statut |
|---:|---:|---|---|---:|---:|---:|---|
| 1 | 18 h 45 | **Raphinha** | Barcelone–Feyenoord | 1,44 à 1,53 | 65,4–69,4 % | **environ 61–66 %** | Probable, à garder seulement s'il débute |
| 2 | 20 h 00 | **Cristiano Ronaldo** | Al-Nassr–Abha | 1,35 à 1,40 | 71,4–74,1 % | **environ 58–64 %** | Probable, à garder seulement s'il débute |
| 3 | 18 h 45 | **Lamine Yamal** | Barcelone–Feyenoord | 1,53 à 1,57 | 63,7–65,4 % | **environ 54–60 %** | Probable, à garder seulement s'il débute |

La « probabilité brute » est simplement `1 / cote` et inclut la marge du bookmaker. La fourchette IASHARK est volontairement plus basse : le marché buteur n'était proposé que par deux opérateurs dans le flux et il est impossible d'en retirer proprement la marge comme sur un marché 1N2.

## Pourquoi ces trois joueurs

### 1. Raphinha

- API-Football le rattache bien à l'effectif 2026 de Barcelone, avec le statut `injured: false` : **4 titularisations, 319 minutes, 6 buts, 9 tirs dont 8 cadrés et 1 penalty marqué** en Liga 2026/27.[^api-players]
- En 2025/26, son socle Liga + Ligue des champions était de **16 buts en 1 932 minutes**, 34 tirs cadrés et 4 penalties marqués. Cela évite de fonder le choix uniquement sur quatre matchs.[^api-history]
- Barcelone a inscrit **17 buts en quatre journées**. Le modèle Poisson ajusté aux totaux d'équipe sans marge du marché donne environ **3,79 buts attendus pour Barcelone** contre Feyenoord.[^api-team]
- Le club confirme qu'il a marqué lors des quatre premières journées, avec six buts au total. Il a aussi tiré et marqué le penalty contre Elche. C'est la preuve la plus récente d'une responsabilité sur penalty parmi les trois candidats.[^raphinha-form][^raphinha-pen]
- Hansi Flick a déclaré avant Feyenoord que « tout le monde est prêt ».[^flick]

**Lecture :** meilleur dossier global grâce à la combinaison titularisation régulière, volume de tirs cadrés, forme actuelle, penalty récent et très gros total de buts attendu pour son équipe.

### 2. Cristiano Ronaldo

- API-Football le rattache à Al-Nassr en 2026, `injured: false` : **4 apparitions, 3 titularisations, 243 minutes, 2 buts et 6 tirs cadrés** en championnat.[^api-players]
- En Pro League 2025/26 : **25 buts en 2 438 minutes**, 55 tirs cadrés et 5 penalties marqués. En King's Cup : 14 buts et 5 penalties en 1 434 minutes.[^api-history]
- Al-Nassr a marqué 13 fois en cinq journées. Les totaux d'équipe sans marge impliquent environ **2,98 buts attendus** contre Abha ; API-Football donne aussi Al-Nassr vainqueur et plus de 1,5 but dans le match.[^api-team][^api-pred]
- Aucun absent n'était remonté pour cette rencontre, mais aucune composition officielle n'était encore publiée.[^api-availability]

**Lecture :** le bookmaker en fait le favori brut du jour et l'adversaire est favorable. Il passe néanmoins derrière Raphinha dans le classement prudent, car il n'a démarré que trois des quatre rencontres et sa forme 2026 est moins forte.

### 3. Lamine Yamal

- API-Football le rattache à Barcelone, `injured: false` : **4 titularisations, 335 minutes, 4 buts, 17 tirs dont 9 cadrés** en Liga 2026/27.[^api-players]
- En 2025/26, Liga + Ligue des champions : **22 buts en 3 142 minutes**, 52 tirs cadrés et 6 penalties marqués.[^api-history]
- Il a inscrit un doublé lors du 5-0 à Valence le 6 septembre. Le compte rendu officiel confirme également les 17 buts de Barcelone en quatre journées.[^yamal-form]
- Flick indique qu'il peut décider les matchs. Il n'est cependant pas traité comme tireur prioritaire actuel : le penalty récent a été pris par Raphinha.[^flick][^raphinha-pen]

**Lecture :** volume de tirs et temps de jeu excellents, mais une probabilité individuelle légèrement inférieure à celle de Raphinha faute de priorité actuelle démontrée sur penalty.

## Filtrage appliqué

Le passage de contrôle a trouvé **1 757 lignes brutes de cotes buteur**. La correspondance avec les effectifs 2026 des équipes concernées n'en a conservé que **290** et en a rejeté **1 467** : doublons accentués, joueurs rattachés au mauvais match, anciens effectifs ou noms impossibles à valider. Le classement ne retient donc pas un joueur uniquement parce que son nom apparaît dans une cote.

Le calcul utilise quatre couches :

1. validation du joueur dans l'effectif actuel ;
2. probabilité de temps de jeu à partir des apparitions et titularisations ;
3. buts, minutes, tirs cadrés et penalties sur 2025/26 et 2026/27, avec réduction du poids du petit échantillon actuel ;
4. ajustement par le nombre de buts attendu pour l'équipe, calculé sur les lignes de totaux sans marge de plusieurs bookmakers.

Les prix « buteur » eux-mêmes ne sont utilisés que comme contrôle externe. Ils ne deviennent jamais automatiquement la probabilité du modèle.

## Alternative conditionnelle

**Ferran Torres — PSG–Slovan Bratislava** n'entre pas dans le top 3 pré-compositions. Sa cote était proche de 1,53, mais ses données 2026 ne montrent qu'une titularisation sur trois apparitions de championnat. Il ne devient une alternative que si le onze officiel le confirme titulaire dans une position offensive. Sinon : aucune sélection.

## Contrôle obligatoire avant mise

- Refaire le contrôle entre 45 et 60 minutes avant le coup d'envoi.
- Exiger la présence dans le onze de départ. Une entrée en jeu courte peut suffire à rendre le pari actif selon le règlement du bookmaker.
- Relever une nouvelle cote et abandonner le choix si l'effectif ou le rôle offensif change.
- Ne pas combiner automatiquement les trois noms. Deux viennent du même match, et même un pari estimé à 60 % perd quatre fois sur dix environ.

## Sources primaires

[^api-players]: API-Football, endpoint `/players`, paramètres `team`, `season=2026`, pages complètes pour Barcelone et Al-Nassr ; récupération du 9 septembre 2026 vers 01 h 30 CEST. API-Football documente son service et sa couverture sur son [site officiel](https://www.api-football.com/).
[^api-history]: API-Football, endpoint `/players`, paramètres `id` et `season=2025`, joueurs 1496, 874 et 386828 ; récupération du 9 septembre 2026.
[^api-team]: API-Football, endpoints `/fixtures` et `/odds`. Ajustement Poisson sur 56 paires over/under pour Barcelone et 50 pour Al-Nassr après retrait de la marge de chaque paire. Le champ de mise à jour des cotes était 8 septembre, 22 h 33 CEST pour Barcelone et 18 h 59 CEST pour Al-Nassr.
[^api-pred]: API-Football, endpoint `/predictions?fixture=1603025`, récupération du 9 septembre 2026 : vainqueur Al-Nassr, conseil combiné Al-Nassr et plus de 1,5 but.
[^api-availability]: API-Football, endpoints `/injuries?fixture=1603025` et `/fixtures/lineups?fixture=1603025`, récupération du 9 septembre 2026 : aucun absent remonté et aucun onze publié.
[^raphinha-form]: FC Barcelona, [« Raphinha on course for record goalscoring start »](https://www.fcbarcelona.com/en/football/first-team/news/4573271/raphinha-on-course-for-record-goalscoring-start/featured), 7 septembre 2026.
[^raphinha-pen]: FC Barcelona, [« Raphinha and Fermín amongst the goals »](https://www.fcbarcelona.com/en/news/4565349/raphinha-and-fermin-amongst-the-goals/amp), 23 août 2026.
[^yamal-form]: FC Barcelona, [« Valencia CF 0-5 FC Barcelona: High five! »](https://www.fcbarcelona.com/en/news/4572837/valencia-cf-0-5-fc-barcelona-high-five/amp), 6 septembre 2026.
[^flick]: FC Barcelona, [« Hansi Flick: Everyone is ready »](https://penyes.fcbarcelona.com/en/news/4573711/hansi-flick-everyone-is-ready/amp), 8 septembre 2026.
