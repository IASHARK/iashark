# Vérification des quatre affiches du 9 septembre 2026

Vérification effectuée le **9 septembre 2026 entre 13:01 et 13:04 (Europe/Paris)** contre l'API Football d'API-Sports, puis contre les calendriers et avant-matchs officiels des ligues et clubs. La requête quotidienne renvoie bien **quatre affiches**, et non trois. Elles sont toutes programmées le même jour et à la même heure.

## Résumé confirmé

| Affiche normalisée | Fixture ID | Compétition | Tour | Coup d'envoi Europe/Paris | Coup d'envoi UTC | Statut au relevé | Terrain |
|---|---:|---|---|---|---|---|---|
| HJK Helsinki – Inter Turku | `1638094` | Veikkausliiga (Finlande), saison 2026 | Championship Group - 23 | 09/09/2026 17:00 CEST | 09/09/2026 15:00 UTC | `NS` – Not Started | Bolt Arena, Helsinki |
| Samgurali – Dila | `1509181` | Erovnuli Liga (Géorgie), saison 2026 | Regular Season - 25 | 09/09/2026 17:00 CEST | 09/09/2026 15:00 UTC | `NS` – Not Started | Football Centre, Tskaltubo (ligue officielle) |
| Spaeri – Rustavi | `1509182` | Erovnuli Liga (Géorgie), saison 2026 | Regular Season - 25 | 09/09/2026 17:00 CEST | 09/09/2026 15:00 UTC | `NS` – Not Started | Mikheil Meskhi 2, Tbilisi (ligue officielle) |
| FK Jablonec – Baník Ostrava | `1559994` | Czech Liga (Tchéquie), saison 2026 | Regular Season - 5 | 09/09/2026 17:00 CEST | 09/09/2026 15:00 UTC | `NS` – Not Started | Stadion Strelnice, Jablonec nad Nisou |

Source principale : [API-Sports, fixtures du 9 septembre 2026 en heure de Paris](https://v3.football.api-sports.io/fixtures?date=2026-09-09&timezone=Europe%2FParis) (endpoint authentifié ; relevé du 09/09/2026 à 13:01 CEST).

Confirmations officielles :

- HJK–Inter : [calendrier Veikkausliiga de HJK](https://www.veikkausliiga.com/joukkueet/hjk/otteluohjelma), [avant-match HJK](https://www.hjk.fi/uutiset/mestaruussarja-kayntiin-revanssi-mielessa) et [avant-match Inter](https://fcinter.fi/ajankohtaista/keskiviikkona-edessa-ensimmainen-kuuden-pisteen-ottelu). L'heure locale d'Helsinki est 18:00 EEST, soit 15:00 UTC et 17:00 à Paris.
- Samgurali–Dila : [fiche de match officielle Erovnuli Liga, match 9292](https://erovnuliliga.ge/en/game/9292-smg-dil).
- Spaeri–Rustavi : [fiche de match officielle Erovnuli Liga, match 9295](https://erovnuliliga.ge/en/game/9295-spa-rus).
- Jablonec–Baník : [fiche officielle Chance Liga, match 8362](https://www.chanceliga.cz/zapas/8362-fkj-fcb), [avant-match Jablonec](https://www.fkjablonec.cz/article/11971-Jablonec-ceka-stredecni-ligova-dohravka-Na-Strelnici-dorazi-ostravsky-Banik) et [avant-match Baník](https://www.fcb.cz/clanek.asp?id=Preview-Jablonec-Banik-streda-17-00-12333). Il s'agit d'une rencontre de la 5e journée reportée/reprogrammée au 9 septembre en raison du parcours européen de Jablonec.

## Identité des clubs et ambiguïtés de nom

- **« Helskinki »** est interprété comme **HJK Helsinki** (API team ID `649`) ; **Inter Turku** est l'équipe ID `1164`.
- **« FC Samgurali – Dila Gori »** correspond dans l'API à **Samgurali** (ID `10017`) contre **Dila** (ID `3499`). La ville de Gori apparaît dans la fiche du stade habituel de Dila, mais le nom de l'équipe exposé par l'API est simplement `Dila`.
- **« FC Spaeri – Olimpi Rustavi »** correspond, dans le calendrier du jour, à **Spaeri** (ID `14864`) contre **Rustavi** (ID `3501`). Cette précision est importante : une recherche `Rustavi` dans l'API renvoie aussi une entité distincte, **Metalurgi Rustavi** (ID `13846`, code `OLI`). L'affiche du jour est sans ambiguïté attachée au fixture `1509182` et à l'ID `3501`, pas à `13846`. Le libellé fourni par l'utilisateur ne doit donc pas servir seul à récupérer l'historique.
- **« FK Jablonec _ Banik Ostrava »** est normalisé en **FK Jablonec – Baník Ostrava**, IDs `1122` et `3713`.

Sources d'identité : fiches API-Sports [HJK Helsinki](https://v3.football.api-sports.io/teams?id=649), [Inter Turku](https://v3.football.api-sports.io/teams?id=1164), [Samgurali](https://v3.football.api-sports.io/teams?id=10017), [Dila](https://v3.football.api-sports.io/teams?id=3499), [Spaeri](https://v3.football.api-sports.io/teams?id=14864), [Rustavi](https://v3.football.api-sports.io/teams?id=3501), [recherche Rustavi](https://v3.football.api-sports.io/teams?search=Rustavi), [FK Jablonec](https://v3.football.api-sports.io/teams?id=1122) et [Baník Ostrava](https://v3.football.api-sports.io/teams?id=3713) (endpoints authentifiés).

## Compositions et indisponibilités officielles

Au relevé de 13:01 CEST, les deux endpoints suivants renvoient **zéro enregistrement pour chacun des quatre fixtures** :

- `/fixtures/lineups?fixture={fixture_id}` : aucune composition officielle publiée ;
- `/injuries?fixture={fixture_id}` : aucune indisponibilité publiée par l'API pour le fixture.

Il faut interpréter ces réponses avec prudence : `response: []` signifie uniquement **« aucune donnée disponible dans l'API au moment du relevé »**. Cela ne prouve ni que tous les joueurs sont disponibles ni qu'il n'existe aucun blessé ou suspendu. Le contrôle first-party le démontre puisque plusieurs absences sont annoncées officiellement :

- **HJK Helsinki** : Ville Tikkanen est de nouveau disponible et Lassi Lappalainen est annoncé apte ; Alex Ring, Amara Nallo, Joona Veteli, David Ezeh et Eemil Toivonen sont forfaits dans l'[avant-match officiel de HJK](https://www.hjk.fi/uutiset/mestaruussarja-kayntiin-revanssi-mielessa).
- **Inter Turku** : l'avant-match officiel consulté ne donne pas de liste d'absents.
- **Samgurali–Dila** : la fiche officielle n'affiche pas de suspension ou blessure. Sa section `Squads` correspond aux effectifs, pas aux onze titulaires.
- **Spaeri–Rustavi** : Nikoloz Kenchadze (Spaeri) et Mamuka Kapanadze (Rustavi) sont indiqués suspendus sur la [fiche officielle du match](https://erovnuliliga.ge/en/game/9295-spa-rus).
- **Jablonec–Baník** : Milla est annoncé absent côté Jablonec ; Gning, Vlasiy Sinyavskiy et Michal Kohút sont annoncés absents côté Baník dans l'[avant-match officiel de Baník](https://www.fcb.cz/clanek.asp?id=Preview-Jablonec-Banik-streda-17-00-12333).

**Aucun onze titulaire officiel n'était publié à 13:04 CEST.** Les compositions doivent être recontrôlées environ 60 minutes avant le coup d'envoi, puis les probabilités qui dépendent des joueurs doivent être recalculées.

Endpoints vérifiés :

- [Lineups 1509181](https://v3.football.api-sports.io/fixtures/lineups?fixture=1509181) et [injuries 1509181](https://v3.football.api-sports.io/injuries?fixture=1509181)
- [Lineups 1509182](https://v3.football.api-sports.io/fixtures/lineups?fixture=1509182) et [injuries 1509182](https://v3.football.api-sports.io/injuries?fixture=1509182)
- [Lineups 1559994](https://v3.football.api-sports.io/fixtures/lineups?fixture=1559994) et [injuries 1559994](https://v3.football.api-sports.io/injuries?fixture=1559994)
- [Lineups 1638094](https://v3.football.api-sports.io/fixtures/lineups?fixture=1638094) et [injuries 1638094](https://v3.football.api-sports.io/injuries?fixture=1638094)

## Divergences de stade et points de vigilance

- Pour **Samgurali–Dila**, API-Sports indique `26 May Stadium`, Tsqaltubo, tandis que la ligue officielle indique `Football Centre – Tskaltubo`. Le terrain de la ligue officielle doit être privilégié ; la divergence reste consignée.
- Pour **Spaeri–Rustavi**, API-Sports indique `Spaeri Stadium`, Tbilisi, tandis que la ligue officielle indique `Mikheil Meskhi 2 – Tbilisi`. Ici aussi, la source officielle doit primer.
- Les sections `Squads` des pages géorgiennes sont des listes d'effectif, pas des compositions officielles.
- Pour les quatre matchs, les identifiants de fixture ci-dessus restent les clés fiables à utiliser dans les collectes historiques, classements, statistiques, compositions et simulations. Le stade et les absences doivent toutefois être enrichis par les sources de ligue/club lorsque l'API est vide ou contradictoire.
