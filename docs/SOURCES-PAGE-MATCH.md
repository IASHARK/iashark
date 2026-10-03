# D'où viennent les chiffres de la page match (fiche interne, pas affichée)

## Une seule source (règle de Clément, 01/10/2026)

Le client Pro voit **exactement les mêmes chiffres** sur la page match, dans l'espace Pro (combiné,
détecteur d'écarts, accueil Pro), dans le Canal Pro, dans le canal gratuit Telegram et sur l'image à
partager. Chaque chiffre est calculé **une fois**, par le pipeline, puis lu tel quel partout. Le seul
module qui calcule et arrondit ces chiffres : `lib/chance-iashark.js`. Aucune probabilité du moteur
n'est modifiée : seul le chiffre **affiché** pour le pari change, et d'où il vient.

| Chiffre | Calculé où (une fois) | Champ lu partout | Arrondi |
|---|---|---|---|
| Chance du pari retenu | `update-data.yml`, après le gel et la SAFE_PICK : `lib/chance-iashark.js#poserChance` | `chance_iashark` (premium) | le plus bas entre la probabilité du modèle (`model_probability`) et la cote sans marge du même pari (colonne `consensus` de sa ligne dans `markets_compared`) ; sans cote sans marge : le modèle (la règle « modèle seul » décide ensuite si le chiffre peut être publié). **% entier**, moitié vers le haut |
| Chance d'un marché 1N2 / double chance dans le Canal Pro | `lib/moteur-v3.js#chancesPourCanal` (même règle, même cote sans marge que le site ; le marché du pari affiché prend exactement sa `chance_iashark`), joint à la sortie déposée par `scripts/canal-pro/deposer-sortie-v3.mjs` | `marches[].chance_iashark` de la sortie déposée | % entier. Match que le site n'a pas encore calculé (tickets du week-end) : même règle avec la cote sans marge du moteur v3 (`chance_iashark_de = "moteur"`) |
| Chance d'un combiné / d'un ticket | produit des `chance_iashark` des sélections (Canal Pro : `canal-pro-menu.mjs` ; espace Pro : `lib/tools-domain.js#combo`) | — | le produit, affiché « environ 1 chance sur N (X %) » |
| Chance d'un buteur | `lib/moteur-v3.js#buteursV3` avec `lib/chance-iashark.js#chanceButeur` (le Canal Pro utilise la même fonction) | `v3_buteurs[].chance` (premium) | `p_marque` du moteur v3, **vers le bas à 5 points, 45 % au plus, rien sous 10 %** |
| Buts attendus | moteur v3 (`lambda_h`, `lambda_a`) | `lambda_h`, `lambda_a` | une décimale, moitié vers le haut sur l'écriture décimale (`arrondi1` : 1,45 → 1,5), le même dans « L'histoire du match », « Ce que dit le modèle », « Pourquoi ce pari », l'image à partager et le texte de l'IA ; total = somme des deux chiffres affichés |
| Scores probables | moteur v3 (`SCORE:a-b`) | `mc_scores[].pct` | % entier, une fois (`lib/moteur-v3.js#scoresV3`) |
| Cote du pari | `update-data.yml`, juste avant la chance : `lib/cote-anj.js#poserCotesAnj` (meilleure cote chez les bookmakers agréés ANJ suivis, The Odds API, même règle que le Canal Pro) ; sans cote ANJ : moyenne API-Football, « cote indicative » | `cote_rec` (la cote), `cote_bookmaker` (nom), `cote_source` (`anj` / `indicative`), `cote_releve_a` ; `sans_marge_anj` sert à la chance | 2 décimales |

Qui lit quoi :

- **Page match** (`lib/match-view-model.js`, `match-page.js`) : l'avis (« Notre estimation »), la
  ligne du pari dans « Probabilités et cotes », la FAQ et « Sur 100 matchs » lisent `chance_iashark` ;
  sans ce champ, aucune chance n'est affichée (jamais la probabilité brute du modèle à la place). Les
  garde-fous de fiabilité (« au plus Fiabilité moyenne ») gardent l'écart **du modèle** face à la cote.
  « Le match en 30 secondes », « Les 2 buteurs » et « Marchés joueurs » lisent `v3_buteurs`.
- **Espace Pro** : « Mon combiné » (`comboSelections`) et la ligne du pari retenu du détecteur
  d'écarts (`scanValue`) lisent `chance_iashark` ; l'accueil Pro (note sur 10) lit `chance_iashark / 10`
  (`home-list.js`), le niveau public `prob_band` aussi (`lib/public-data-split.js`) ; les buteurs du jour
  (`lib/buteurs-du-jour.js`) lisent `v3_buteurs`.
- **Canal Pro** (`canal-pro-menu.mjs`, `canal-pro.mjs`) : chaque simple affiche la `chance_iashark` de
  son marché ; le choix des paris suit toujours la probabilité du moteur v3 (inchangé).
- **Canal gratuit Telegram et son image** (`lib/telegram-posts.js`, `scripts/telegram/card.tpl`) : la
  `chance_iashark` du match offert, et le pari écrit avec le même libellé que la page.
- **Vidéos du jour** (`scripts/videos/build-daily-videos.mjs`) : les 3 pronos « sûrs » sont choisis sur
  `chance_iashark` (aucun pourcentage affiché).
- **Archive des matchs offerts** (`preuves/matchs-offerts.json`) : garde la probabilité du modèle et,
  en plus, la `chance_iashark` affichée.

Contrôle : `tests/coherence-site-telegram.test.js` génère, pour une journée d'exemple, la page match,
l'espace Pro, les messages du Canal Pro, le message du canal gratuit et son image, et vérifie que
chaque chiffre d'un même pari est identique partout.

### Écarts trouvés et supprimés le 01/10/2026

1. Chance du pari : la page montrait la probabilité du modèle (ex. 64 %), le combiné de l'espace Pro le
   plus bas entre le modèle et la cote sans marge (ex. 58 %), recalculé dans le navigateur, et les
   tickets du Canal Pro le plus bas de deux **produits** : tous lisent maintenant `chance_iashark`.
2. Chance des simples du Canal Pro : probabilité brute du moteur v3 (4 décimales) arrondie par le
   Canal Pro ; maintenant la `chance_iashark` du site.
3. Buteurs : deux calculs (modèle buteur du site sur la page et l'accueil Pro, moteur v3 dans le Canal
   Pro) et deux arrondis (la page affichait « moins de 5 % », le Canal Pro rien sous 10 %) : un seul,
   celui du moteur v3, avec la même fonction d'arrondi partout.
4. Accueil Pro : « 6,4/10 » (probabilité du modèle / 10) à côté d'une chance de 58 % sur la page :
   maintenant `chance_iashark / 10`. Même chose pour le niveau « Probabilité élevée / bonne / modérée ».
5. Détecteur d'écarts : la ligne du pari retenu affichait le modèle (1 décimale) ; maintenant sa
   chance, sans décimale, comme partout.
6. Buts attendus : `Math.round(x × 10) / 10` dans « L'histoire du match » (1,45 → 1,4) et l'arrondi du
   navigateur dans « Ce que dit le modèle » (1,45 → 1,5, et « 2 » au lieu de « 2,0 ») ; « Pourquoi ce
   pari » arrondissait encore autrement, le total aussi, et le texte de l'IA recevait 2 décimales :
   un seul arrondi partout.
7. Libellé du pari dans le canal gratuit : le libellé interne du moteur (« DC 1X ») au lieu de celui de
   la page : même fonction de libellé maintenant.
8. Vidéos : le « plus bas des deux » était recalculé dans le script ; il lit maintenant `chance_iashark`.

### Une seule cote (décision de Clément, 01/10/2026, `lib/cote-anj.js`)

- **Source** : les bookmakers français agréés ANJ que IASHARK suit (`config/bookmakers-agrees.json`,
  « suivi » : Betclic, NetBet, PMU, Unibet, Winamax), relevés sur The Odds API (clés `*_fr`, la même
  liste que le Canal Pro). Cote affichée = la **meilleure** chez ces agréés (garde-fou « plus de 2 fois
  la moyenne »), avec le nom du bookmaker, dans `cote_rec` : page, espace Pro, canal gratuit et image
  lisent ce seul champ ; le Canal Pro applique la même règle au même relevé.
- **Cote sans marge** (chance IASHARK) : même source ; médiane des agréés par issue, puis Shin (1N2),
  somme des issues (double chance), proportionnelle (plus/moins, les deux marquent).
- **Repli** : pas de cote ANJ pour ce pari (marché non proposé, ligue non couverte, panne, clé
  absente) : la moyenne API-Football, affichée « cote indicative », jamais un nom de bookmaker.
- **Ce qui ne change pas** : le choix du pari (fenêtre 1,40-2,00 sur les cotes du pipeline) et les
  probabilités du moteur. Un pari déjà publié (gelé) garde sa cote.
- **Reste un écart de temps** : le site relève à 8 h (run du matin), le Canal Pro au moment de sa
  préparation : même source et même règle, mais le prix peut avoir bougé entre les deux.

Fusion V3, 30/09/2026. Une ligne par bloc de la page match française, dans l'ordre de la page.
Pour chaque bloc : la source, le nombre de matchs, les compétitions comptées, la période, la date où
les données s'arrêtent, et ce que la page en dit.

Les trois sources :

- **Moteur v3** : dépôt privé IASHARK/iashark-moteur. Il calcule chaque matin (étape « Moteur v3 -
  produire la sortie du jour » de `update-data.yml`) à partir de l'historique football-data et
  d'API-Football, jusqu'aux matchs de la veille. Sa sortie est valable 26 heures (`genere_le`).
  Championnats européens : modèle mélangé à la cote d'avant-match (« modèle + cotes »). Hors d'Europe,
  en coupe et pour les sélections : modèle seul.
- **Stats IASHARK (Book)** : `scripts/stats-book/export_stats_book.py`, lancé **à la main sur le Mac
  de Clément** (le Book n'est pas sur GitHub). Il prend tous les matchs joués jusqu'à la veille de
  l'export. Fichiers chiffrés dans `stats-book/scelles/`. Au-delà de **14 jours** de retard (7 jusqu'au 30/09), la page
  n'affiche plus aucune stat IASHARK (`lib/match-view-model.js#bookAssezFrais`).
- **API-Football (calcul du matin)** : appels faits par `update-data.yml` à chaque passage (forme,
  classement, face-à-face, compositions, cotes, statistiques de match). Les données s'arrêtent au
  dernier match terminé avant le passage.

## Tableau bloc par bloc

| Bloc | D'où vient le chiffre | Sur combien de matchs | Compétitions | Période | Données jusqu'au | Ce que la page en dit |
|---|---|---|---|---|---|---|
| En-tête : date, heure, stade | API-Football (`/fixtures`) | — | — | — | passage du matin | — |
| En-tête : météo | OpenWeather (prévision la plus proche du coup d'envoi) | — | — | — | passage du matin | — |
| Le match en 30 secondes : pari retenu et cote | Moteur v3 (pari), cote API-Football (`/odds`) | — | — | — | sortie du jour du moteur | rien sur la base |
| Le match en 30 secondes : « l'histoire du match » | Buts attendus du moteur v3 (`lambda_h`, `lambda_a`) | — (calcul du modèle) | — | — | sortie du jour du moteur | les buts attendus sont écrits |
| Le match en 30 secondes : les 2 buteurs (Pro) | **Moteur v3** (`v3_buteurs` : `p_marque`, titulaires probables, vers le bas à 5 points, 45 % au plus, rien sous 10 %), le même calcul que le Canal Pro (01/10/2026) ; faits de titularisation et de forme : historique API-Football | 10 derniers matchs de l'équipe (faits) | compétition du match (faits) | saison en cours et précédente (faits) | sortie du jour | « X titularisations sur les N derniers matchs de l'équipe », « N buts sur ses M derniers matchs joués », « Calcul buteur du moteur IASHARK, le même que le Canal Pro » |
| L'avis IASHARK : chance du pari | `chance_iashark` (pipeline) : le plus bas entre le moteur v3 et la cote sans marge (01/10/2026) | — | — | — | sortie du jour | origine écrite (« modèle + cotes » / modèle seul, écart non affiché) |
| L'avis : « Sur 100 matchs comme celui-ci » | Moteur v3, seulement si le marché est « vérifié sur le passé » | — | — | — | sortie du jour | phrase absente sinon |
| L'avis : « Ce que dit la cote » | Cotes API-Football, marge retirée par le site | moyenne des bookmakers relevés | — | — | passage du matin | « sans la marge » écrit |
| L'avis : « Pourquoi ce pari » | Textes du site (`lib/insights.js`) à partir de la forme, du comparatif, du face-à-face, des absences | selon la ligne (voir ces blocs) | selon la ligne | selon la ligne | passage du matin | **base écrite le 30/09** (« sur leurs N derniers matchs » ; tirs, tirs cadrés, corners : 10 au plus) ; plus de « ce pari serait passé dans X des N face-à-face » |
| L'avis : « Le piège du match » | Stats IASHARK (Book) | écrit (« sur N matchs ») | championnat de l'équipe ; sélections : matchs officiels | 2 ans | veille de l'export du Book | nombre de matchs et années écrits ; plus de « X marque / encaisse Y % de ses buts dans le dernier quart d'heure » (test placebo du mathématicien, 30/09) |
| L'avis : fiabilité | Moteur v3 (`fiabilite`) + liste validée (`config/leagues.json#fiabilite`) | — | — | — | sortie du jour | « Fiabilité : … » ou « en test » |
| Le chiffre fou | Stats IASHARK (Book). Visiteur et compte gratuit : seulement premier but et buts après la 75e (champ public) | écrit | premier but : championnat de l'équipe ; après la 75e : la compétition du match, nommée (corrigé le 30/09 : plus « des matchs de Ligue 1 » sur un match de coupe, image à partager comprise) | 2 ans | veille de l'export du Book | nombre de matchs et années écrits |
| Stats du match : Forme récente | API-Football `/fixtures?team&league&season&last=20`, les 5 derniers affichés | 5 au plus | **compétition du match seulement** ; sélections : matchs de sélection | saison en cours | passage du matin | **ajouté le 30/09** : « Leurs N derniers matchs de {compétition}, saison en cours » |
| Stats du match : Classement | API-Football `/standings` | — | compétition du match | saison en cours | passage du matin | « {compétition} · classement actuel » |
| Stats du match : Confrontations directes | API-Football `/fixtures/headtohead&last=8`, 5 affichées | 5 au plus | **toutes compétitions** | **10 dernières années** avant le match (filtre du pipeline et de la page, 30/09) | passage du matin | **ajouté le 30/09** : « Les N dernières confrontations connues sur les 10 dernières années, toutes compétitions » |
| Stats du match : Comparatif, buts marqués et concédés | API-Football, événements des matchs (`/fixtures/events`) | jusqu'à 20 | compétition du match ; sélections : toutes compétitions | saison en cours puis précédente pour compléter | passage du matin | **corrigé le 30/09** : « Buts marqués et concédés : moyennes sur leurs N derniers matchs ({compétition}, cette saison puis la précédente) » |
| Stats du match : Comparatif, tirs, possession, corners, fautes, hors-jeu, arrêts | API-Football `/fixtures/statistics` | **10 au plus** (les 10 premiers des matchs ci-dessus) | idem | idem | passage du matin | **corrigé le 30/09** : « … : sur leurs 10 derniers matchs au plus » |
| Stats IASHARK : premier but, 0-0 | Book | écrit | championnat de l'équipe (coupe d'Europe : son dernier championnat, nommé) ; sélections : matchs officiels, amicaux exclus | 2 ans | veille de l'export | nombre de matchs, compétition et années écrits ; « calculées sur les matchs joués jusqu'au {date} » |
| Stats IASHARK : buts après la 75e (ligue) | Book | écrit | la ligue | 2 ans | veille de l'export | idem |
| Stats IASHARK Pro : buts par quart d'heure, après la pause, domicile / extérieur | Book | écrit (15 matchs au moins, 30 pour un sous-groupe) | championnat de l'équipe | 2 ans | veille de l'export | idem |
| Stats IASHARK Pro : l'arbitre | Book | écrit (30 au moins) | **toutes compétitions** (coupes d'Europe et sélections comprises) | **3 ans** | veille de l'export | « Toutes compétitions » et la note sur les 3 ans sont écrites |
| Stats IASHARK Pro : profil de la ligue | Book | écrit (30 au moins) | la ligue | 2 ans | veille de l'export | idem |
| Stats du match : Compositions | API-Football `/fixtures/lineups` (publiées environ 1 h avant) | — | — | — | dernier passage | — |
| Analyse (Pro) : Le film du match | Simulation du site (`lib/simulation-15min.js`, réglée sur 6 127 matchs jamais vus) appliquée aux buts attendus du moteur v3 | — (calcul) | — | — | sortie du jour | « Match rejoué minute par minute à partir des buts attendus du modèle… » ; plus de mot de tranche (« Début fermé »… « Fin de match chaude », identiques sur tous les matchs : retirés le 30/09), restent les barres et les buts attendus par tranche |
| Analyse (Pro) : Si… alors… | Loi de Poisson sur les buts attendus restants (tranches ci-dessus) | — (calcul) | — | — | sortie du jour | méthode écrite ; masqué pour les compétitions « en test » et les sélections (30/09) |
| Analyse (Pro) : Les 2 buteurs | voir « Le match en 30 secondes » (moteur v3) | 10 derniers matchs de l'équipe (faits) | compétition du match (faits) | saison en cours et précédente (faits) | sortie du jour | base écrite |
| Analyse : Ce que dit le modèle (buts attendus, scores les plus probables) | Moteur v3 (`lambda`, marchés `SCORE:a-b`) | — | — | — | sortie du jour | — |
| Analyse (Pro) : Le score audacieux | Moteur v3, marchés `SCORE:a-b` (a et b de 0 à 4) | — | — | — | sortie du jour | « Le score à 4 buts ou plus le plus probable. Pas encore vérifié. » (plus de « avec sa vraie chance » : fréquence non vérifiée sur des matchs jamais vus, verdict du mathématicien du 30/09) |
| Analyse : Probabilités et cotes | Moteur v3 (probabilités) + cotes API-Football (marge retirée par le site) ; **ligne du pari retenu : `chance_iashark`** | — | — | — | sortie du jour / passage du matin | origine écrite |
| Analyse (Pro) : Notre lecture du match | Texte de l'IA de l'analyse (`update-data.yml`, champ `lecture_match`), écrit à partir des chiffres ci-dessus, **sans chiffre** | — | — | — | passage du matin | « Écrit à partir de nos chiffres pour ce match. Une lecture, pas une garantie. » |
| Questions fréquentes | Textes du site à partir des blocs ci-dessus | selon la question | selon la question | selon la question | passage du matin | — |

## Incohérences relevées

1. **Trois bases différentes côte à côte dans « Les stats du match »** : la forme compte les 5
   derniers matchs de la compétition du match (saison en cours) ; le comparatif compte jusqu'à
   20 matchs (cette saison puis la précédente) ; les stats IASHARK comptent 2 ans du championnat
   (3 ans et toutes compétitions pour l'arbitre). Une équipe peut donc paraître « en forme » sur 5
   matchs et moyenne sur 2 ans. La page le dit maintenant bloc par bloc.
2. **Le comparatif mélangeait deux bases sous une seule phrase** : « Moyennes sur leurs N derniers
   matchs » valait pour les buts (jusqu'à 20 matchs) mais pas pour les tirs, la possession, les
   corners, les fautes, les hors-jeu et les arrêts (10 matchs au plus). Corrigé en français le
   30/09 ; **les autres langues gardent l'ancienne phrase**, fausse pour la moitié des lignes.
3. **Sélections nationales** : la forme et le comparatif comptent les matchs de sélection, amicaux
   compris (API-Football, toutes compétitions), alors que les stats IASHARK ne comptent que les
   matchs officiels, amicaux exclus.
4. **Confrontations directes sur 10 ans** (corrigé le 30/09 : avant, aucune limite de date) : elles
   remontent toujours plus loin que les stats IASHARK (2 ans). Toutes compétitions aussi (coupe, amical).
5. **Arbitre toutes compétitions sur 3 ans** à côté d'un profil de ligue sur 2 ans du seul
   championnat (la page l'écrit dans sa note).
6. ~~**Deux calculs de buteur**~~ **Corrigé le 01/10/2026** : un seul calcul, celui du moteur v3
   (`p_marque`, `v3_buteurs`), sur la page, l'accueil Pro et le Canal Pro, avec le même arrondi.
7. **« Le film du match » n'est pas une sortie du moteur v3** : c'est la simulation du site
   appliquée aux buts attendus du moteur. « Qui pousse quand » n'a pas été ajouté : ni le moteur v3
   ni la simulation publiée ne donnent les buts attendus par tranche **et par équipe** (la part de
   chaque équipe serait la même dans toutes les tranches).
8. **Stats IASHARK exportées à la main** : elles s'arrêtent à la veille du dernier export sur le Mac
   de Clément. Sans nouvel export dans les 14 jours, tout le bloc (et « Le chiffre fou », et « Le
   piège du match ») disparaît de la page.
9. **Le score audacieux** ne regarde que la grille du moteur (chaque équipe de 0 à 4 buts) ; un 5-0
   n'y est pas. Sans effet en pratique (les scores à 4 buts les plus probables sont 2-2 ou 3-1),
   mais la phrase dit « le plus probable ».
10. **« Pourquoi ce pari »** cite des chiffres (forme, tirs, buts) sans dire leur base ; ce sont
    ceux des blocs de stats, avec leurs bases différentes (points 1 et 2).

## Mentions ajoutées sur la page (30/09, français seulement)

- Forme récente : « Leurs N derniers matchs de {compétition}, saison en cours. » (sélections : « Leurs
  N derniers matchs de sélection. »)
- Confrontations directes : « Les N dernières confrontations connues sur les 10 dernières années,
  toutes compétitions. »
- Comparatif : « Buts marqués et concédés : moyennes sur leurs N derniers matchs ({compétition}, cette
  saison puis la précédente). Tirs, possession, corners, fautes, hors-jeu et arrêts : sur leurs 10
  derniers matchs au plus. »
