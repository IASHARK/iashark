# Buteurs du jour — rapport du 19/09/2026

## En une phrase

Une nouvelle section sur la page d'accueil montre, chaque jour, les **3 joueurs qui ont le plus de chances de marquer** parmi tous les matchs analysés des 19 compétitions, avant que les compositions officielles soient connues.

## Où ça apparaît

- Sur la page d'accueil, juste sous le match offert du jour et la bande des 19 compétitions, **au-dessus de la liste « Matchs du jour »**.
- Dans les 9 versions du site (fr, en, es, de, it, pt, gb, za, mx), traduite dans les 7 langues (le titre devient « Scorers of the day », « Goleadores del día », « Torschützen des Tages », « Marcatori del giorno », « Marcadores do dia »).
- Sur ordinateur : 3 cartes côte à côte. Sur téléphone : 3 cartes l'une sous l'autre. **Même contenu et mêmes droits partout** : seule la mise en page change.

Chaque carte montre : le rang (1, 2, 3), la photo du joueur (initiales si la photo ne charge pas), son nom, son équipe (avec le logo), l'adversaire, la compétition et l'heure du coup d'envoi **dans le fuseau du visiteur** (« Demain · 03:00 » si le match tombe le lendemain chez lui). Toute la carte est un lien vers la page du match.

## Gratuit ou Pro

| | Visiteur / compte gratuit | Abonné Pro |
|---|---|---|
| Les 3 joueurs, équipe, adversaire, heure | Oui | Oui |
| Probabilité de marquer | Non : cadenas « Probabilité réservée aux abonnés Pro » et bouton « Voir l'offre Pro » | Oui, ex. « 36,7 % » avec une jauge |
| Titularisations récentes (ex. 5/5) et minutes attendues | Non | Oui |

- Le fichier public `buteurs-du-jour.json` ne contient **aucune probabilité, aucun chiffre du modèle** : seulement l'identité des joueurs et de leurs matchs. Un visiteur ne peut donc pas lire les chiffres, même en fouillant le code de la page.
- Pour un abonné Pro, la page demande les données Pro des 3 matchs à la fonction `match-data` (la même que la page match). Les chiffres ne s'affichent **que si le serveur confirme l'abonnement Pro**. Si la demande échoue, la carte affiche « Probabilité à voir sur la page du match » (jamais un faux chiffre).
- Jamais « 0 % » : une probabilité absente ou nulle n'est pas affichée.
- Les chiffres Pro sont **exactement ceux de la carte « Marchés joueurs » de la page match** (vérifié sur les 548 joueurs mis en avant dans les 137 matchs du `data.json` du 18/09 : 0 écart ; un test automatique refait la vérification sur le `data.json` du dépôt).

## Comment c'est calculé

1. Pour chaque match du jour (heure de Paris), on utilise **le calcul déjà validé** de la carte « Marchés joueurs » (buteur le plus probable avant les compositions) avec exactement les mêmes données que la page match : les feuilles des 10 derniers matchs de chaque équipe, l'effectif actuel, les absents annoncés, et les buts attendus du moteur quand sa sortie est fiable.
2. On ne garde que les **titulaires probables** (jamais un remplaçant, jamais un gardien, jamais un blessé annoncé, jamais un joueur parti).
3. On classe tous ces joueurs, tous matchs confondus, du plus probable au moins probable, et on retient les 3 premiers, **un seul joueur par match** (sauf s'il y a moins de 3 matchs ce jour-là).
4. Les matchs déjà commencés ou qui commencent dans moins de 15 minutes au moment du calcul sont exclus (même garde que pour les analyses).
5. Le calcul tourne chaque jour dans le pipeline (06:00 UTC), pour **aujourd'hui et demain**. À minuit (heure de Paris), la page passe toute seule à la liste du lendemain, sans rechargement. S'il n'y a rien à montrer, la section disparaît proprement.

## Limites (à dire honnêtement)

- Ce sont des **estimations faites avant les compositions officielles**, jamais une garantie. Un joueur annoncé titulaire probable peut être laissé sur le banc.
- La méthode a été **réglée puis vérifiée hors échantillon sur la Premier League uniquement** (réglage sur 2023-24, vérification sur 2024-25 à paramètres gelés). Elle est appliquée telle quelle aux 18 autres compétitions, sans vérification propre à chacune.
- La probabilité affichée est plafonnée à 45 % (au-delà, le calcul surestimait lors des tests).
- La liste est calculée une fois par jour : une blessure annoncée après 06:00 UTC n'est pas prise en compte avant le calcul suivant.
- Aucun chiffre de performance ni promesse de gain n'est affiché.

## Fichier d'exemple fourni

`buteurs-du-jour.json` a été créé pour que la section ait des données avant le prochain passage du pipeline :

- source : le `data.json` public le plus récent (commit « Daily update - 2026-09-18 » de `origin/main`, lu avec `git show origin/main:data.json`, 137 matchs, historique joueurs présent) ;
- calcul : `lib/buteurs-du-jour.js#buildDailyFile`, heure du calcul 19/09/2026 00:37 UTC, en excluant les matchs commençant dans moins de 15 minutes ;
- résultat : 19/09 → Raphinha (Barcelona), A. Suzuki (Sanfrecce Hiroshima), L. Suárez (Sporting CP) ; 20/09 → Kylian Mbappé (Real Madrid), V. Pavlidis (Benfica), B. Cuesta (FBC Melgar) ;
- limite de l'exemple : le fichier public ne contient pas les buts attendus du moteur (donnée Pro), le calcul a donc utilisé la moyenne récente des équipes. Le pipeline, lui, utilisera les buts attendus du moteur : l'ordre peut légèrement changer au prochain passage. Le pipeline remplace ce fichier chaque jour.

Commande utilisée (depuis la racine du dépôt, fichier `data.json` de `origin/main` copié hors du dépôt) :

```
node -e 'const fs=require("fs"),B=require("./lib/buteurs-du-jour.js"),MT=require("./lib/match-time.js");
const d=JSON.parse(fs.readFileSync("<chemin>/data.json","utf8")),now=Date.now();
fs.writeFileSync("buteurs-du-jour.json",JSON.stringify(B.buildDailyFile(d.matchs,{now,isEligible:m=>MT.matchTimestamp(m)>now+15*60000}),null,2));'
```

## Fichiers

- `lib/buteurs-du-jour.js` (nouveau) : classement des 3 buteurs, fichier public, chiffres Pro d'un joueur.
- `home-scorers.js` et `assets/home-scorers.css` (nouveaux) : la section de l'accueil.
- `index.html` : section + squelette (mêmes dimensions que les vraies cartes : aucun décalage au chargement), scripts et style.
- `scripts/i18n-manifest.js` : 5 règles pour traduire les textes fixes de la section au build.
- `i18n/dict/*.json` (7 langues) et `i18n/parts/scorers.*.json` (nouveaux) : clés `home_scorers.*`.
- `.github/workflows/update-data.yml` : écriture de `buteurs-du-jour.json` (après la garde coup d'envoi, avant le retrait des champs Pro, dans un try/catch avec un journal `[BUTEURS]` qui ne donne que des comptes), fichier ajouté au `git add` du commit quotidien, fichier vide écrit les jours sans match.
- `buteurs-du-jour.json` (nouveau) : fichier d'exemple ci-dessus.
- `tests/buteurs-du-jour.test.js` (nouveau) : 18 tests.

Aucun déploiement de fonction Supabase n'est nécessaire, aucun champ Pro n'a été ajouté.

## Tests

- `tests/buteurs-du-jour.test.js` : 18/18 (classement stable, un joueur par match, titulaires probables seulement, blessés et joueurs partis exclus, fichier public sans aucun chiffre, chiffres Pro identiques à la page match, affichage visiteur / Pro / échec / section masquée / passage à minuit, textes échappés, traductions, pipeline).
- Tests de l'accueil, des données Pro, du découpage public et des gardes du pipeline : tous verts.
- Suite complète : 1502 réussis, 10 en échec. 9 échecs existaient déjà (pages Méthodologie de/it/pt). Le 10e vient de ce chantier : `scripts/netlify-ignore.sh` doit connaître le nouveau fichier public (une ligne à ajouter, voir ci-dessous).

## À faire avant la mise en ligne

1. Ajouter `buteurs-du-jour.json` à la liste `PUBLISHED` de `scripts/netlify-ignore.sh` (ligne `data-home.json actus.json transferts.json`), sinon le test `netlify-usage` échoue.
2. Facultatif : dans `_headers`, donner à `/buteurs-du-jour.json` les mêmes règles que `/data-home.json` (noindex, cache 2 min).
3. Lancer `node scripts/build-locales.js` puis vérifier la section sur une version traduite.
4. Remettre `data/league-validation-registry.json` à son état d'origine (modifié par la suite de tests).

## Statut

REVIEW : fonctionnel et testé, à valider visuellement après `node scripts/build-locales.js` et mise en ligne.
