# Articles SEO du 19/09/2026 : Ballon d'Or 2026 + Haaland meilleur numéro 9

Rapport de l'agent chargé des articles (branche `nuit/travail`, worktree `wt-seo`).
Aucune commande git en écriture n'a été lancée, et aucun générateur de masse (build-locales, build-public, merge-i18n-parts, i18n-sitemaps, build-local-articles) n'a tourné sur le dépôt.

## 1. Fichiers

### Créés
| Fichier | Rôle |
|---|---|
| `blog/ballon-dor-2026.html` | Article FR (principal) |
| `en/blog/ballon-dor-2026.html` | Version EN (en-GB, sert aussi gb/za via la redirection `/gb/blog/*` → `/en/blog/*`) |
| `es/blog/ballon-dor-2026.html` | Version ES (es-ES) |
| `blog/haaland-meilleur-numero-9.html` | Article FR (principal) |
| `en/blog/haaland-meilleur-numero-9.html` | Version EN |
| `es/blog/haaland-meilleur-numero-9.html` | Version ES |
| `assets/blog/ballon-dor-2026.jpg` | Image principale, 1344×756, 115 Ko |
| `assets/blog/haaland-meilleur-numero-9.jpg` | Image principale, 1344×756, 190 Ko |
| `reports/ballon-dor-2026-article.md` | Ce rapport |

Les trois versions de chaque article déclarent les mêmes hreflang (fr, en, es, x-default → en), comme les guides existants. Même slug dans les trois langues, comme `blog/guides/*`.

### Modifiés (insertions uniquement, 91 lignes au total)
| Fichier | Modification |
|---|---|
| `blog.html` (hub FR servi) | 2 cartes en tête de « Derniers articles » (`data-sujet="football"`) |
| `en/blog/index.html`, `es/blog/index.html` | Les mêmes 2 cartes, traduites |
| `blog/guides/index.html` | Section « DOSSIERS DU MOMENT » avec les 2 articles |
| `blog/index.html` (fil transferts, noindex) | Section « DOSSIERS DU MOMENT » dans l'onglet guides |

**À savoir.** Le brief initial excluait `blog.html` et les hubs en/es. Je les ai modifiés après le message du coordinateur (« tu es le seul agent à modifier les listes du blog »), pour une raison concrète : sans lien depuis ces hubs, les nouvelles pages ne sont accessibles depuis aucune page elle-même accessible depuis l'accueil. `blog/index.html` et `blog/guides/index.html` ne sont pas atteignables dans l'audit. Le test `tests/internal-links.test.js` (« toute page indexable à 3 clics maximum ») échouait donc sur `/blog/ballon-dor-2026.html`. Avec ces cartes, la page se trouve à 2 clics. Au moment de ces modifications, aucun autre agent ne touchait ces fichiers (`git status` était propre sur ces fichiers). Si la direction préfère ne pas conserver ces changements, il suffit de retirer les blocs `<article …>` qui pointent vers les deux slugs. Le test des 3 clics échouera alors de nouveau.

### Emplacement : pourquoi pas `blog/guides/`
Tout fichier de `blog/guides/` déclenche des obligations verrouillées par les tests :
- `tests/blog.test.js` : lien depuis `blog.html`, JSON-LD `Blog.blogPost` et durée de lecture ;
- `tests/blog-mx.test.js` : copies obligatoires dans `mx/`, `de/`, `it/` et `pt/`, avec un hreflang es-MX ;
- `tests/i18n-sitemaps.test.js` : présence dans les 7 sitemaps i18n.

Les articles sont donc placés à la racine de chaque blog (`/blog/<slug>.html`, `/en/blog/<slug>.html`, `/es/blog/<slug>.html`). Ils sont publiés par `build-public.js`, puisque `blog`, `en` et `es` font partie de `PUBLIC_DIRS`. Le sélecteur de langue renvoie vers l'accueil du blog de la langue choisie (comportement de `i18n.js` pour `blog/*`). de/it/pt/mx ne reçoivent donc pas de lien cassé.

## 2. Sitemap : NON ajouté à `sitemap-articles.xml` (volontairement)

`sitemap-articles.xml` est **généré** par `scripts/build-local-articles.js` à partir de `content/local-articles/`. `tests/local-articles.test.js` compare deux choses :
- le fichier sur disque avec la sortie du générateur (test « fichiers générés à jour ») ;
- ses `<loc>` avec la liste des articles locaux (`deepEqual`).

J'ai vérifié qu'une entrée ajoutée à la main rend le fichier différent de la sortie du générateur. Elle ferait échouer deux tests et disparaîtrait au prochain `node scripts/build-local-articles.js`.

**La bonne voie :** le blog est déclaré dans les sitemaps i18n (`scripts/i18n-sitemaps.js#blogFiles`). Voici le changement proposé. Il a été testé sur une copie dans le scratchpad : chaque sitemap fr/en/es reçoit 2 entrées, avec des hreflang identiques au `<head>`, `lastmod` 2026-09-19 et `image:loc`.

```js
// scripts/i18n-sitemaps.js, dans blogFiles(base), juste après
//   files.push(prefix + "blog/index.html");
  // Articles d'actualite a la racine du blog (/blog/<slug>.html,
  // /<langue>/blog/<slug>.html) : memes regles que les guides (non noindex,
  // canonical auto-referent, hreflang lus dans le <head>).
  var blogDir = path.join(ROOT, prefix + "blog");
  if (fs.existsSync(blogDir)) {
    fs.readdirSync(blogDir).filter(function (f) { return /\.html$/.test(f) && f !== "index.html"; }).sort().forEach(function (f) {
      files.push(prefix + "blog/" + f);
    });
  }
```
Optionnel : dans `blogEntries`, la priorité vaut 0,7 (celle d'un hub) pour ces articles, parce que `hub` est calculé comme « pas dans /guides/ ». Pour leur donner 0,6, remplacer ce calcul par `var hub = /(^|\/)blog(\.html|\/index\.html)$/.test(rel);`.

```js
// tests/i18n-sitemaps.test.js, dans le test « fichiers valides, hreflang complet » :
    var rootArticles = prefix == null ? [] : fs.readdirSync(path.join(ROOT, prefix.slice(1), "blog"))
      .filter(function (f) { return /\.html$/.test(f) && f !== "index.html"; })
      .map(function (f) { return prefix + "/blog/" + f; });
    var blog = (prefix == null ? [] : (prefix === "" ? ["/blog.html"] : [prefix + "/blog/"])
      .concat(GUIDES.map(function (f) { return prefix + "/blog/guides/" + f; }))).concat(rootArticles);
```
Ensuite, la direction lance `node scripts/i18n-sitemaps.js`, qui régénère `sitemap-*-i18n.xml` et l'index `sitemap.xml`.

## 3. Article 1 : Ballon d'Or 2026

### Faits vérifiés (sources consultées le 19/09/2026)
| Fait | Source (date de publication) |
|---|---|
| Liste des 30 nommés, annoncée le mardi 08/09/2026 | UEFA.com https://www.uefa.com/news-media/news/02a9-218afc0b9ae8-b59f54b95799-1000--nominees-announced-for-2026-ballon-d-or-awards/ (08/09/2026) ; franceinfo https://www.franceinfo.fr/sports/foot/ballon-d-or/ballon-d-or-2026-renard-malard-bacha-mbappe-olise-dembele-yamal-kvaratskhelia-decouvrez-la-liste-des-nommes-hommes-et-femmes_8183132.html (08/09/2026) ; Sports Illustrated https://www.si.com/soccer/ballon-dor-2026-full-list-nominees (08/09/2026) ; Wikipédia https://en.wikipedia.org/wiki/2026_Ballon_d%27Or (nationalités). Les 4 sources concordent. |
| Cérémonie le lundi 26/10/2026 au London Palladium, première à Londres, 70e édition, hommage à Stanley Matthews | UEFA.com (08/09/2026) ; Yahoo Sports https://sports.yahoo.com/articles/ballon-d-2026-date-time-141232896.html (08/09/2026) |
| Période du 03/08/2025 au 19/07/2026 ; 100 journalistes des 100 premières nations FIFA ; 10 joueurs classés par votant ; 3 critères | Yahoo Sports (08/09/2026), recoupé avec Wikipédia. La page officielle ballondor.com du règlement a renvoyé une erreur 403 : **non lue directement**. |
| 5 Français nommés, 9 joueurs du PSG | franceinfo (titre et liste, 08/09/2026) |
| Kane : 73 buts en 65 matchs (club et sélection) ; 61 en 51 avec le Bayern (36 Bundesliga, 14 C1, 10 Coupe, 1 Supercoupe) ; doublé championnat-Coupe et Supercoupe ; demi-finale de C1 ; 6 buts au Mondial | bundesliga.com https://www.bundesliga.com/en/bundesliga/news/harry-kane-2025-26-numbers-england-bauern-munich-goals-records-messi-38301 ; beIN https://www.beinsports.com/en-us/soccer/dfb-pokal/articles/harry-kane-reaches-61-goals-after-winning-the-pokal-with-bayern-munich-2026-05-23 (23/05/2026) |
| Espagne championne du monde : 1-0 a.p. contre l'Argentine le 19/07/2026, but de Ferran Torres ; Rodri Ballon d'or du tournoi, Messi Ballon d'argent, Mbappé Ballon de bronze et Soulier d'or (10 buts, premier à le gagner deux fois) ; Cubarsí meilleur jeune ; Messi 8 buts et 4 passes, aucun but ni passe en finale ; Rodri aucun but, 11e joueur à avoir gagné Coupe du monde, C1 et Ballon d'Or | ESPN https://www.espn.com/soccer/story/_/id/49404995/2026-world-cup-golden-ball-spain-unai-simon-pau-cubarsi (19/07/2026) ; Al Jazeera https://www.aljazeera.com/sports/2026/7/20/mbappe-takes-home-second-golden-boot-spain-sweeps-world-cup-awards (20/07/2026) |
| Petite finale Angleterre 6-4 France : Angleterre 3e, France 4e ; Mbappé à 22 buts en Coupe du monde | RTS https://www.rts.ch/sport/football/coupe-du-monde-de-la-fifa/2026/article/coupe-du-monde-2026-l-angleterre-bat-la-france-6-4-et-finit-3e-29306917.html (19/07/2026), recoupé avec Eurosport. **Le résumé d'Al Jazeera donnait l'inverse (France 3e) : c'était une erreur, corrigée par RTS.** |
| Yamal : Barça champion (94 points), 16 buts en Liga, meilleur passeur, joueur de la saison de Liga ; 1 but au Mondial | FC Barcelona https://www.fcbarcelona.com/en/football/first-team/news/4514485/lamine-yamal-202526-laliga-player-of-the-season (05/06/2026) ; LaLiga ; The Independent via Yahoo https://sports.yahoo.com/articles/ballon-d-odds-kane-favourite-095611653.html (11/08/2026) ; Sky Sports (20/07/2026). Le nombre de passes décisives diffère (11 ou 12 selon la source) : **il n'est pas cité**. |
| Mbappé : 25 buts en Liga (Pichichi), 15 en C1 (meilleur buteur), Real 2e en Liga et éliminé en quarts de C1, sans trophée majeur | Sofascore https://www.sofascore.com/news/kylian-mbappes-2025-26-season-52-goals-no-trophies (22/07/2026), recoupé avec The Independent (15 buts en C1). Le total toutes compétitions diffère d'une source à l'autre : **il n'est pas cité**. |
| Messi : MLS Cup 2025 (3-1 contre Vancouver, 2 passes décisives, élu meilleur joueur de la finale), record de 15 buts et passes en play-offs ; triplé contre l'Algérie en ouverture du Mondial | MLSsoccer.com https://www.mlssoccer.com/playoffs/2025/news/inter-miami-s-lionel-messi-named-mls-cup-2025-mvp-pres-by-audi (déc. 2025) ; Sky Sports https://www.skysports.com/football/news/11095/13565197/ballon-dor-odds-harry-kane-lamine-yamal-lionel-messi-kylian-mbappe-and-rodri-all-in-race-to-be-named-worlds-best-in-2026 (20/07/2026) |
| Rodri : 17 titularisations en Premier League | The Independent via Yahoo (11/08/2026) |
| Finale de C1 : PSG 1-1 Arsenal a.p. (4-3 aux tirs au but), 30/05/2026 à Budapest ; Dembélé égalise sur penalty (65e) | UEFA.com https://www.uefa.com/uefachampionsleague/match/2047742--paris-vs-arsenal/final/ ; Wikipédia https://en.wikipedia.org/wiki/2026_UEFA_Champions_League_final |
| Dembélé Ballon d'Or 2025 | CNN https://www.cnn.com/2025/09/22/sport/soccer-ballon-dor-ousmane-dembele-aitana-bonmati (22/09/2025) |

### Cotes et pourcentages
- **Source principale :** marché d'échange Kalshi, API publique `https://api.elections.kalshi.com/trade-api/v2/markets?event_ticker=KXBALLONDOR-26`, relevée le **19/09/2026 à 00:31 UTC** (02:31 à Paris). 17 joueurs cotés, tous nommés. Prix pris au milieu de la fourchette achat/vente, puis probabilités brutes normalisées : la somme brute vaut 108,5 %, et chaque valeur est divisée par 1,085.

| Joueur | Achat | Vente | Milieu | Brut | Marge retirée |
|---|---|---|---|---|---|
| Kane | 0,57 | 0,58 | 0,575 | 57,5 % | 53,0 % |
| Yamal | 0,24 | 0,25 | 0,245 | 24,5 % | 22,6 % |
| Mbappé | 0,09 | 0,10 | 0,095 | 9,5 % | 8,8 % |
| Messi | 0,06 | 0,07 | 0,065 | 6,5 % | 6,0 % |
| Rodri | 0,03 | 0,04 | 0,035 | 3,5 % | 3,2 % |
| Kvaratskhelia | 0,01 | 0,02 | 0,015 | 1,5 % | 1,4 % |
| 11 autres (Bellingham, Vinícius, B. Fernandes, Díaz, Lautaro, Haaland, Vitinha, Dembélé, Olise, Rice, N. Mendes) | 0,00 | 0,01 | 0,005 chacun | 0,5 % | 0,46 % (5,1 % au total) |

Les 13 nommés non cotés sur ce marché sont signalés comme tels dans l'article.
- **Recoupement bookmakers :** Betting Lounge (comparateur britannique) https://bettinglounge.co.uk/odds/football/ballon-dor-winner/, consulté le 19/09/2026, 13 bookmakers, **sans horodatage affiché**. Kane entre 4/7 et 4/6, Yamal entre 5/2 et 9/2, Mbappé entre 6/1 et 8/1 : même ordre qu'au marché d'échange. Au-delà du trio, les écarts sont énormes (Rodri de 9/2 à 16/1, Kvaratskhelia de 7/1 à 33/1), et la liste contient des joueurs non nommés (Saka, Pedri, Rodrygo, Álvarez, Szoboszlai). Ces cotes sont donc jugées peu fiables comme base de calcul, et utilisées seulement en recoupement.
- Polymarket n'est pas accessible depuis la France (redirection vers le site de l'ANJ) : non utilisé.
- **Politique de nommage :** conformément aux guides existants (aucun opérateur nommé, voir `tests/bookmakers-guide.test.js`), l'article ne nomme ni Kalshi ni aucun bookmaker. Il écrit « un marché d'échange (données publiques) » et « un comparateur de 13 bookmakers britanniques ». Les URL exactes figurent uniquement dans ce rapport. **Décision propriétaire possible :** nommer ou non la source.

### Non vérifié / volontairement absent
- Le règlement officiel sur ballondor.com (erreur 403). Période, jury et critères viennent de Yahoo Sports et Wikipédia.
- Le nombre de passes décisives de Yamal et le total de buts toutes compétitions de Mbappé (sources divergentes).
- Toute affirmation « saison entrecoupée de blessures » sur Dembélé (source unique commerciale) : non reprise.
- Aucun chiffre de performance IASHARK. Aucune promesse de gain. La mention « estimation, pas une certitude » figure dans le chapeau, le tableau de l'avis et la FAQ. 18+, ANJ et Joueurs Info Service figurent en FR ; 18+ et gamblingtherapy.org en EN et ES.

## 4. Article 2 : « Haaland peut-il devenir le meilleur numéro 9 du XXIe siècle ? »

### Structure
Réponse courte, statistiques de carrière, records, comparatif (tableau et barres en HTML/CSS « à jour au 19/09/2026 »), arguments pour, ce qui manque, projection chiffrée (présentée comme une estimation), **notre avis** (présenté comme une opinion), FAQ (6 questions, JSON-LD identique au texte visible), sources.

### Chiffres vérifiés (sources consultées le 19/09/2026)
| Donnée | Source |
|---|---|
| Haaland : né le 21/07/2000 ; 323 buts en 408 matchs en club (équipes réserves Bryne 2 et Molde 2 incluses), dont City 168 en 204 ; Premier League 116 en 136 ; C1 59 en 59 (**somme IASHARK** des lignes Salzbourg 6/8, Dortmund 13/15 et City 40/36 du tableau) ; 2025-26 : 27 en 35 en PL, 38 en 52 toutes compétitions | Wikipédia https://en.wikipedia.org/wiki/Erling_Haaland, texte brut du tableau « Career statistics », mis à jour après le match du 13/09/2026 |
| Norvège 62 buts en 55 sélections (au 11/07/2026) ; meilleur buteur de l'histoire depuis le 10/10/2024 ; Mondial 2026 : 7 buts, quarts de finale (meilleur résultat historique), défaite 2-1 a.p. contre l'Angleterre sans marquer, buteur lors de ses 4 premiers matchs, Dream XI | Wikipédia (même page) |
| Records : 36 buts en PL (2022-23), 52 toutes compétitions (ancien record 44, Salah et Van Nistelrooy), 50 buts en C1 en 49 matchs (18/09/2025), 100 buts dans le top 5 européen en 103 matchs (Ronaldo : 133), 5 buts en 57 minutes contre Leipzig, 3 Souliers d'or de PL (autant que Kane et Shearer) | Wikipédia (même page) |
| 100 buts en PL en 111 matchs, le 02/12/2025 ; Shearer 124, Kane 141, Agüero 147, Henry 160 (avec les dates de chaque joueur) | premierleague.com https://www.premierleague.com/en/news/4455995/erling-haaland-scores-100th-premier-league-goal-in-record-number-of-matches. NBC donne 141 matchs pour Henry : **la source officielle de la Premier League (160) a été retenue.** |
| Palmarès : PL 2022-23 et 2023-24, C1 2022-23, FA Cup 2022-23 et 2025-26, EFL Cup 2025-26, Supercoupe d'Europe 2023, DFB-Pokal 2020-21, doublé en Autriche 2018-19 ; 2e du Ballon d'Or 2023, Soulier d'or européen 2022-23, meilleur buteur de C1 2020-21 et 2022-23, trophée Gerd-Müller 2023 | Wikipédia, section « Honours » |
| Comparatif (lignes « Career total » en club, sélection et palmarès des infobox et sections Honours) : Lewandowski 669/954, Pologne 89/167, 1 C1, 2 Souliers d'or, 41 buts en Bundesliga 2020-21 ; Kane 448/654, Angleterre 85/121 (meilleur buteur de l'histoire), 0 C1, 2 Souliers d'or ; Suárez 543/910, Uruguay 69/143, 1 C1, 2 Souliers d'or ; Ibrahimović 511/866, Suède 62/122, 0 C1, 3 titres de meilleur buteur de Ligue 1 avec le PSG ; Agüero 385/685, Argentine 41/101, 0 C1, meilleur buteur de l'histoire de City ; Benzema 502/919, France 37/97, 5 C1, Ballon d'Or 2022, meilleur buteur de C1 2021-22 | Wikipédia (textes bruts) : Lewandowski (13/09/2026 ; sélection au 03/06/2026), Kane (18/09/2026 ; sélection au 15/07/2026), Suárez (16/09/2026), Benzema (20/08/2026), Ibrahimović et Agüero (retraités) |
| Ronaldo : Coupe du monde et Ballon d'Or 2002 | Wikipédia (section Honours) |
| Finale de C1 2023 : City 1-0 Inter, but de Rodri (68e) | Wikipédia https://en.wikipedia.org/wiki/2023_UEFA_Champions_League_final |
| Débat sur les ballons touchés (réponse de Haaland) | The Telegraph via Yahoo https://sports.yahoo.com/erling-haaland-hits-back-critics-153656929.html (10/05/2024). Propos paraphrasés, sans citation longue. |

### Calculs IASHARK (présentés comme tels dans l'article)
- Ratios buts par match en club : 0,79 / 0,70 / 0,69 / 0,60 / 0,59 / 0,56 / 0,55.
- Écart avec Lewandowski : 346 buts. Il faudrait environ 9 saisons à 38 buts, ou un peu moins de 7 à 52 buts. C'est explicitement une estimation.

### Non vérifié / volontairement absent
- Les buts par 90 minutes : il faudrait les minutes jouées de chaque joueur, non collectées. Le ratio est calculé par match.
- Les étiquettes du type « flat-track bully » et les chiffres de ballons touchés en 2026 (source commerciale unique) : non repris.
- Manchester City n'a pas de page club sur le site (aucun `*/clubs/manchester-city.html`). Les liens internes pointent vers les pages Premier League et Ligue des champions, les pages clubs PSG (fr), Bayern, Real et Barça (en), Barça et Real (es), l'article Ballon d'Or et le guide des xG.
- Les totaux Wikipédia évoluent pour les joueurs en activité (Haaland, Kane, Lewandowski, Suárez, Benzema). Le tableau indique la date de mise à jour de chaque page.

## 5. Images (WaveSpeed)
- Modèle `bytedance/seedream-v4`, prix vérifié avant génération avec `get_price` : 0,027 $ par image.
- 1 seule tentative par article, soit **2 images au total : 0,054 $**. Solde : 0,23 $ avant, 0,17 $ après.
- Ballon d'Or : trophée générique en forme de coupe à anses (pas le vrai trophée en forme de ballon), stade vide, sans personne, logo ni texte.
- Haaland : silhouette anonyme en contre-jour dans un tunnel de stade, sans visage, numéro, écusson ni texte.
- Conversion : `sips` (outil macOS) ne sait pas écrire le WebP. J'ai donc exporté en JPEG q80 1344×756 : 115 Ko et 190 Ko (limite : 250 Ko). Chaque page renseigne largeur, hauteur, alt, `og:image:width` et `og:image:height`.

## 6. Validation
- **Script de contrôle** (scratchpad) sur les 6 pages : title ≤ 60 caractères, description ≤ 155, aucun mot interdit par `tests/seo-meta.test.js`, un seul H1, JSON-LD valide (Article, BreadcrumbList, FAQPage), FAQ JSON-LD identique au texte visible, `datePublished` 2026-09-19, liens internes et ancres existants, balises équilibrées, attributs d'image, navigation du bas, mention 18+. Durée de lecture affichée égale au calcul de `scripts/blog-reading-time.js` : Ballon d'Or 13, 12 et 13 min (FR, EN, ES), Haaland 11, 10 et 11 min. **Tout est OK.**
- **Mobile (375 px)**, contrôlé via le serveur local : aucun débordement horizontal hors des tableaux (qui défilent), barres proportionnelles, blocs « pour/contre » sur une colonne.
- **Tests** : `node --test` sur `tests/blog.test.js`, `blog-mx`, `local-articles`, `i18n-sitemaps`, `geo-dirs`, `bottom-navigation`, `netlify-usage`, `bookmakers-guide`, `internal-links` et `seo-meta`. Résultat final : **76/76 réussis**.
  - Pendant la session, deux échecs sont apparus, tous deux indépendants de ces articles : `_redirects` (geo-dirs) et `buteurs-du-jour.json` (netlify-usage). Ils venaient d'autres agents et ont disparu au dernier passage.
  - `internal-links` échouait sur « 3 clics » tant que les hubs ne liaient pas les articles : corrigé par les cartes ajoutées aux hubs.
  - Il n'existe pas de fichier `tests/*article*.test.js` ni `*sitemap*` spécifique à ces articles en dehors de ceux listés.

## 7. Points ouverts pour la direction
1. Appliquer la modification de sitemap proposée (section 2), puis lancer `node scripts/i18n-sitemaps.js`.
2. Nommer ou non la source des cotes dans l'article Ballon d'Or (aujourd'hui anonymisée, par cohérence avec la règle « aucun opérateur nommé »).
3. Pas de versions de/it/pt/mx : le sélecteur de langue renvoie vers l'accueil du blog correspondant. Pour les ajouter : dupliquer le fichier dans `<dir>/blog/`, ajouter les hreflang dans les 3 versions existantes et les cartes dans `<dir>/blog/index.html`. Pour mx : vocabulaire « momios », Línea de la Vida 800 911 2000, aucun symbole €.
4. Mettre à jour les pourcentages de l'article Ballon d'Or avant le 26/10 si le marché bouge fortement, puis publier le vainqueur. La date du relevé est écrite partout : modifier aussi `dateModified`.
