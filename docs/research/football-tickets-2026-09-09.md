# Recherche de deux tickets proches de 2,00 — 9 septembre 2026

**Snapshot :** 9 septembre 2026, vers 00 h 44–00 h 47, heure de Paris.  
**Conclusion :** deux assemblages exécutables chez un même bookmaker ressortent autour de 2,00, mais aucun n'est « sûr ». Le consensus prudent estime chaque ticket à environ **43–44 %** de réussite. Les présenter comme certains serait mathématiquement faux.

## Périmètre et méthode

- L'appel officiel API-Football `/fixtures?date=2026-09-09&timezone=Europe/Paris` a retourné **308 rencontres** sur la journée. Après conservation du statut prématch `NS`, **303** restaient éligibles au moment du contrôle.
- Le balayage frais de `/odds?date=2026-09-09&page=N` a trouvé **146 rencontres prématch avec cotes** dans **47 compétitions seniors**, après exclusion des jeunes, réserves, féminines et amicaux. Il a analysé les marchés 1N2, double chance, DNB, over/under, BTTS et totaux par équipe. Résultat local : [`data/one-off-ticket-engine/odds-two-2026-09-09.json`](../../data/one-off-ticket-engine/odds-two-2026-09-09.json).
- Le second filtre a ciblé **25 ligues**, **33 rencontres**, **10 092 cotations** et jusqu'à **14 bookmakers**. Le modèle historique utilise un Poisson pondéré, Dixon-Coles, une sélection de demi-vie/régularisation sur historique antérieur au 9 septembre, puis une réconciliation avec le consensus sans marge et un bootstrap des bookmakers. Les ligues employées disposent de 494 à 1 880 matchs historiques selon la compétition.
- Les probabilités « historique pur » et « marché sans marge » ont été gardées séparées. Un choix est rejeté lorsqu'elles se contredisent fortement. C'est le cas de **Stuttgart gagnant** : marché autour de 77 %, mais modèle historique à seulement 32,8 %. Ce choix n'est donc pas retenu malgré sa cote séduisante.
- Les cotes affichées ci-dessous sont toutes celles de **Betano**, afin que le produit soit réellement jouable sur un seul ticket. La meilleure cote prise chez plusieurs opérateurs aurait artificiellement gonflé le total. Les cotes bougent et doivent être revérifiées avant validation.

API-Football documente la pagination des cotes, leur actualisation approximative toutes les trois heures et la disponibilité généralement limitée aux 1–14 jours avant le match : [guide officiel API-Football](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide). La couverture varie par compétition et saison : [couverture officielle API-Sports](https://api-sports.io/sports/football).

## Ticket A — 3 rencontres, cote observée 1,9965

| Heure Paris | Rencontre | Sélection | Cote Betano | Historique pur | Marché sans marge | Probabilité réconciliée |
|---:|---|---|---:|---:|---:|---:|
| 21 h 00 | Charlton – QPR | Plus de 1,5 but | 1,32 | 69,7 % | 72,5 % | 72,5 % |
| 21 h 00 | Liverpool – Atlético Madrid | Liverpool ou nul | 1,21 | 77,4 % | 79,3 % | 79,1 % |
| 21 h 00 | Sporting CP – Galatasaray | Sporting ou nul | 1,25 | 85,7 % | 76,5 % | 76,6 % |
|  | **Produit** |  | **1,9965** | **≈ 46,2 %** | **≈ 44,0 %** | **robuste ≈ 43,2 %** |

**Lecture :** c'est l'assemblage le plus propre. Les trois sélections portent sur des matchs différents, le modèle et le marché sont globalement cohérents, et chacune dispose de 11 à 12 bookmakers. L'endpoint officiel `/predictions` appuie « Liverpool ou nul » ; il ne fournit aucune prédiction exploitable pour Sporting–Galatasaray et ne permet donc pas de renforcer artificiellement ce choix.

## Ticket B — 3 rencontres, cote observée 2,0010

| Heure Paris | Rencontre | Sélection | Cote Betano | Historique pur | Marché sans marge | Probabilité réconciliée |
|---:|---|---|---:|---:|---:|---:|
| 18 h 00 | FC Levadia Tallinn – Kuressaare | Levadia gagne | 1,16 | 83,3 % | ≈ 81,5 % | 81,7 % |
| 18 h 45 | Twente – Telstar | Moins de 4,5 buts | 1,50 | 79,5 % | 64,7 % | 64,8 % |
| 20 h 45 | Rangers – St Mirren | Plus de 1,5 but | 1,15 | non isolé | 83,6 % | 83,6 % |
|  | **Produit** |  | **2,0010** | **non comparable** | **≈ 44,2 %** | **conservateur ≈ 44,3 %** |

**Lecture :** le ticket est indépendant du ticket A, mais il est plus fragile. Le point faible est `Twente–Telstar moins de 4,5` : l'historique lui donne 79,5 %, tandis que le marché n'en donne que 64,7 %. Le calcul final retient donc volontairement la valeur basse du marché. L'endpoint `/predictions` appuie Levadia gagnant, mais n'offre pas de validation directe des deux marchés de buts. Tous les coups d'envoi sont bien le 9 septembre en heure de Paris ; la première version comportait un match américain joué après minuit local, désormais exclu.

## Cotes et fraîcheur

- Ticket A : Charlton +1,5 à 1,32 ; Liverpool ou nul à 1,21 ; Sporting ou nul à 1,25.
- Ticket B : Levadia gagnant à 1,16 ; Twente–Telstar -4,5 à 1,50 ; Rangers–St Mirren +1,5 à 1,15.
- Les réponses `/odds` ont été récupérées vers **00 h 44–00 h 47 le 9 septembre (Paris)**. Leurs champs `update` étaient compris entre **22 h 15 et 22 h 47 le 8 septembre (Paris)** selon la rencontre.
- Les compositions officielles n'étaient pas encore disponibles dans `/fixtures/lineups` au moment du contrôle. Les absences API sont conservées comme signal de vérification avant match, pas comme une mesure automatique de la force perdue.

Les rencontres de Ligue des champions et leurs horaires sont également publiés par l'[UEFA dans son calendrier officiel 2026/27](https://www.uefa.com/uefachampionsleague/news/02a8-2174c9e9019d-f909a77bd77a-1000--2026-27-champions-league-all-the-league-phase-fixtures/). L'[aperçu statistique officiel de la première journée](https://www.uefa.com/uefachampionsleague/news/02a9-2180c6b55c39-54a55373de68-1000--champions-league-matchday-1-key-stats-and-what-to-look-o/) indique notamment six victoires consécutives de Liverpool en phase de ligue contre des clubs espagnols ; cela reste du contexte historique, pas une garantie.

## Décision pratique

1. **Ticket A est prioritaire.** Ticket B est une alternative réellement différente, pas un doublon avec les mêmes matchs.
2. **Recontrôler 45–60 minutes avant chaque coup d'envoi** : statut `NS`, composition, absences et cote. Si une sélection a déjà commencé ou si sa cote a fortement bougé, le ticket devient caduc.
3. **Ne pas présenter 43–44 % comme « presque certain ».** Sous hypothèse d'indépendance des six matchs, la probabilité théorique qu'au moins un des deux tickets passe est d'environ 68 %, mais cette estimation ignore les erreurs communes du modèle et ne doit pas servir de promesse.
4. **Ne pas miser une part importante de la bankroll.** Une cote proche de 2 implique ici plus d'une chance sur deux de perdre chaque ticket, même avec les meilleurs choix trouvés.
