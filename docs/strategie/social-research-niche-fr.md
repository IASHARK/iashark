# IASHARK : analyse concurrentielle et analyse des formats de la niche foot, stats, pronos et IA en France

- **Plateformes étudiées :** TikTok, Instagram, YouTube Shorts, X et Facebook.
- **Date de collecte :** 19/09/2026, entre 21 h 50 et 22 h 15 (heure de Paris).
- **Statut :** REVIEW. Ce document est une analyse. Il n'a pas été validé et ne constitue pas une décision.
- **Périmètre :** aucun fichier du dépôt IASHARK n'a été modifié. Le template Remotion et ses rendus `out/` ont seulement été lus.

---

## 0. L'essentiel en 12 points

1. **Le créneau « modèle statistique transparent + visuel data animé + personnalité » est libre en France.**
   - Les comptes « prono IA » sont soit automatisés et sans audience (0 à 2 likes par post sur #pronosticfoot et #statsfoot sur Instagram), soit de l'affiliation déguisée.
   - La recherche TikTok « prono foot ia », faite avec un proxy France, ne renvoie aucun compte structuré.
2. **Sur TikTok, le format de prono qui fait le plus de vues est un tableau de scores en liste.**
   - @jour_du_foot publie 7 affiches en 60 s, soit environ 8 s par match, avec une musique et sans voix.
   - Ses meilleures vidéos font 285 000 à 405 000 vues, contre une médiane de 25 000 sur ses 8 dernières vidéos, soit 16 fois sa médiane.
   - Les spectateurs attendent « leur » match et sauvegardent la vidéo pour vérifier après : les sauvegardes représentent 1,2 % des vues.
   - Défaut majeur : les pronostics sont présentés comme des scores finaux (« Full Time »).
3. **Le format francophone le plus solide est « mes pronos de la journée de Ligue 1 » face caméra.**
   - @telesportix (693 600 abonnés) fait 283 300 vues sur une vidéo de 12 min consacrée à la 5e journée de Ligue 1, soit 4,2 fois sa médiane.
   - @kp_avis_ (123 800 abonnés) fait 49 000 vues sur 3 min 17, soit 2,7 fois sa médiane.
   - La journée de Ligue 1 est le sujet qui surperforme chez tous les comptes pronos français.
4. **Les voix gagnent.**
   - Parmi les comptes français de la niche, tous les leaders sont portés par une voix : un présentateur face caméra, un duo, un fan en fond vert ou un journaliste en voix off.
   - Seuls les formats « liste de scores » et « carrousel » vivent sans voix.
   - **Le template IASHARK actuel est muet et sans musique**, faute de composant `<Audio>` dans le code.
5. **Les commentaires, c'est d'abord les gens qui donnent LEUR score.**
   - Viennent ensuite le tribalisme de club et les reproches quand un pick se rate ou arrive trop tard.
   - Les CTA qui marchent sont du type : « ton score ? », « tu en valides combien sur 10 ? », « pour ou contre ? ».
6. **Débat plutôt que prédiction : les questions clivantes font exploser les commentaires.**
   - Sur X, la série « Ballon d'Or : pour ou contre ? » de Foot Mercato obtient de 428 à 1 247 réponses par tweet.
   - Sur TikTok, un classement à débattre de @footcentralclips obtient 479 commentaires pour 111 900 vues.
7. **Sur X, le tweet de l'échantillon le plus viral d'OptaJean compare le classement réel au modèle (xPts).**
   - Idée du tweet : le classement ment selon les Expected Points.
   - Il fait 196 800 vues, soit 16,7 fois la médiane des 20 derniers tweets (11 800), et obtient 52 favoris et 40 citations.
   - C'est exactement l'angle d'IASHARK.
8. **Sur Instagram, pour les médias foot, le carrousel bat le Reel en likes.**
   - @actufoot_ : médiane de 24 500 likes pour les carrousels contre 3 200 pour les Reels.
   - @footmercato : 15 200 contre 9 200.
   - Les Reels donnent la portée en vues ; les carrousels donnent l'engagement.
9. **Facebook est sous-estimé.**
   - La page « Goat Pronos » (130 600 abonnés) fait 380 000 à 545 000 vues par Reel avec 200 à 300 partages.
   - Son format : « les matchs du jour » et « 10 scores exacts tentés, vous m'en donnez combien ? ».
   - Le prono se diffuse aussi dans les groupes Facebook.
10. **YouTube Shorts est secondaire pour les pronos français** : de 6 à environ 1 100 vues chez les chaînes pronos. La plateforme fonctionne pour les grands médias et les séries épisodiques d'Oh My Goal, qui a atteint 1,81 M de vues.
11. **Les signaux d'alerte sont omniprésents :**
    - Telegram « VIP » en bio ;
    - code de parrainage Betclic ;
    - promesse de « devenir gagnant » ;
    - « 98 % » dans le nom d'une chaîne ;
    - coupons 1xBet/Melbet ;
    - bilans sélectifs (« 16 verts / 2 rouges ») ;
    - pronostics maquillés en résultats.

    IASHARK se différencie en faisant l'inverse : tout publier avant le coup d'envoi, afficher les ratés, ne rien promettre.
12. **Le template IASHARK « Match Pulse » a une bonne idée centrale mais est mal adapté aux flux.**
    - L'idée : le match minute par minute et la courbe de danger.
    - Il n'a pas d'accroche à la première frame.
    - La première frame est sombre.
    - Il fait 20 s sans voix.
    - Les textes restent 2,6 s, trop peu pour être lus.
    - L'affichage final ne dure que 2 s.
    - La courbe paraît minute par minute alors qu'une partie est décorative.
    - Aucun nom de série n'est affiché.

    Recommandations détaillées en section 11.

---

## 1. Méthode : comment les données ont été obtenues

### 1.1 Outils

| Source | Ce qui a été fait | Volume |
|---|---|---|
| **Apify `clockworks/tiktok-scraper`** (hashtags) | #pronosticfoot, #pronostic, #statsfoot, #ligue1, 25 vidéos par hashtag. #pronostic n'a rien renvoyé. | 76 vidéos |
| **Apify `clockworks/tiktok-scraper`** (recherche) | Requêtes « pronostic ligue 1 », « prono foot ia », « stats foot ligue 1 », proxy FR, 3 derniers mois | 45 vidéos |
| **Apify `clockworks/tiktok-scraper`** (profils) | 8 dernières vidéos (hors épinglées) de 12 comptes FR | 96 vidéos |
| **Apify `clockworks/tiktok-scraper`** (description IA) | Description plan par plan de 4 vidéos virales, pour lire les accroches visuelles | 4 vidéos |
| **Apify `clockworks/tiktok-comments-scraper`** | 20 commentaires sur 7 vidéos clés | 123 commentaires |
| **Apify `apify/instagram-profile-scraper`** | 22 profils. Pour chacun : abonnés et 12 derniers posts (type, likes, commentaires, vues). | 22 profils, environ 140 posts |
| **Apify `apify/instagram-hashtag-scraper`** | #pronosticfoot, #statsfoot, #pronosticsfoot | 33 posts |
| **Apify `apidojo/tweet-scraper`** puis **`kaitoeasyapi/…tweet-scraper…`** | Tweets « Top » de comptes et requêtes FR. Le premier acteur bride l'offre gratuite à 10 tweets, d'où le second. | 129 tweets |
| **Apify `apify/facebook-posts-scraper`, `facebook-pages-scraper`, `scraper_one/facebook-posts-search`** | Pages médias et pronos : abonnés, posts récents, recherche « pronostic foot » | 11 pages, 39 posts et 16 résultats de recherche |
| **Apify `streamers/youtube-shorts-scraper`** | 6 derniers Shorts de 13 chaînes. Plusieurs handles sont introuvables. | 43 lignes |
| **Recherche et fetch web** | Cadre légal (loi 2023-451, DGCCRF/ANJ, question AN n° 11745), politiques TikTok, découverte de comptes | — |
| **viral-lab MCP** | `get_reference_outliers` et `search_memory` : le projet actif est HUMN ; **il n'y a aucune référence dans cette niche**. `analyze_video` a analysé le rendu IASHARK local (contact sheets mesurées) ; il a expiré sur une URL TikTok. | — |

- **Environ 640 lignes collectées au total**, pour un coût Apify estimé autour de 2 USD. Le volume dépasse un peu « quelques centaines » à cause des 123 commentaires et des 129 tweets, qui sont très peu chers.
- Aucune connexion à un compte, aucune publication, aucun compte créé.
- Données brutes conservées dans `scratchpad/social-data/` :
  - `tt_profiles.csv` ;
  - `tt_discovery.csv` ;
  - `ig_profiles_raw.json`.

### 1.2 Limites à garder en tête

- **C'est un instantané.** Les vues sont celles du 19/09 au soir. Une vidéo de la veille n'a pas fini sa vie.
- **Les échantillons sont petits** : 8 posts par compte TikTok, 12 par compte Instagram et 20 par compte X. Les « médianes » et les « ×N » sont indicatifs, pas des lois.
- **Aucune donnée de rétention.** Le taux de visionnage et le temps de visionnage moyen ne sont pas publics. Tout ce qui touche au comportement de visionnage est déduit des likes, sauvegardes, partages et commentaires.
- **Formats visuels :** ils ont été lus via les descriptions IA de TikTok (4 vidéos), les légendes et les métadonnées audio (son original ou musique). Pour les autres vidéos, la description du format est une déduction. Elle est signalée comme telle.
- **Heures :** toutes les heures sont converties en heure de Paris (UTC+2).
- **Périmètre linguistique :** plusieurs comptes « prono » très suivis ne sont pas français de France. @jour_du_foot, @thefreewang et @dgnova01 sont francophones d'Afrique ou anglophones. Ils sont inclus parce qu'ils dominent les hashtags que voit l'audience française, mais signalés comme tels.
- **Comptes non trouvés :**
  - Instagram : @rmcsport, @ohmygoalfrance.
  - Facebook : Winamax, Oh My Goal, Telesportix.
  - YouTube : Foot Mercato, Telesportix, OptaJean.

  Ces comptes n'ont pas été vérifiés sur ces plateformes et **aucun chiffre n'a été inventé** pour les remplacer.
- **Citations :** les légendes et commentaires sont **paraphrasés**. Les textes d'accroche sont présentés sous forme de *modèles* (« [Joueur] a-t-il eu raison de … ? »), pas recopiés.

---

## 2. Cartographie des 24 comptes les plus pertinents

Légende des colonnes :

- **Vues méd.** : médiane des vues sur les derniers posts collectés.
- **ER** : (likes + commentaires + partages + sauvegardes) / vues, en médiane.
- **Fréq.** : nombre de posts par jour, calculé sur la fenêtre des derniers posts.

### 2.1 Pronos et tipsters

| # | Compte | Plateforme(s) | Abonnés | Fréq. | Vues méd. | ER | Formats qui marchent | Red flags |
|---|---|---|---|---|---|---|---|---|
| 1 | **@telesportix** (Matt & Julio) | TikTok · IG | 693 600 TT · 12 300 IG | environ 2 par jour | 67 550 (TT) | 4,8 % | Duo face caméra « nos pronos de la journée » (L1, L2, PL, UEL) de 4 à 12 min. Réaction à chaud en 1 à 2 min. « Le 11 type de la journée ». Sur IG, « Qui va gagner la CAN ? » a fait 152 800 vues et 1 242 commentaires. | Bio avec « notre canal prono » (lien taap.it). Sur IG, promo d'une appli de data pour parieurs. |
| 2 | **@kp_avis_** | TikTok | 123 800 | 1,3 par jour | 18 050 | 4,9 % | « Mes avis foot pour la Xe journée de… » face caméra de 1 min 45 à 3 min 20, publié le matin du match (surtout entre 7 h et 12 h). Taux de sauvegarde élevé (1,17 % des vues). | Bio qui promet de « devenir gagnant » et renvoie vers Telegram. Commentaires composés uniquement d'emojis (🔥👌👏), qui ressemblent à de l'engagement artificiel. Emploie « avis » au lieu de « prono » (hypothèse : pour éviter la modération). |
| 3 | **@jour_du_foot** (et le compte associé @canal_du_foot) | TikTok | 1 100 000 | 2,7 par jour | 25 000 | 6,2 % | **Tableau de scores en liste** : 60 s, fond bleu, un match toutes les ~8 s, musique « My Darling », aucune voix. Voir section 4.1. | Canal WhatsApp en bio. Pronos affichés comme des **scores finaux**. Légendes en anglais. Compte probablement hors de France. |
| 4 | **@statsenshorts.foot** | TikTok | 20 800 | 1 par jour | 10 350 | 2,8 % | Face caméra devant l'affiche de la journée : 3 matchs, un score prédit par match, 70 s à 2 min 10. Portée élevée pour sa taille (49,7 % des abonnés vus en médiane). | **Code de parrainage Betclic** en bio. Message implicite de gain (« tu apprends, tu gagnes »). |
| 5 | **@romicheparlefoot_** | TikTok | 16 400 | 4,5 par jour | 2 090 | 4,1 % | Les vidéos « Mes PRONOS pour la Xe journée » (1 min à 1 min 55) font 5 à 11 fois sa médiane (11 900 à 49 300 vues). Le reste (vlogs, réactions) fait environ 1 000 vues. | Canal Telegram en bio. |
| 6 | **@le_ptit_auxerrois** | TikTok | 9 900 | environ 10 par jour | 1 370 | 6,2 % | Un « prono de la journée » en 12 s a fait 21 600 vues et **141 commentaires**. C'est un fan de club qui publie des pronos courts. | Accusé de favoritisme pour son club dans les commentaires. |
| 7 | **@pronostic205** | TikTok | 29 300 | faible | 30 000 à 68 600 (échantillon hashtag) | environ 5 % | Voix modifiée (effet « VoiceEffects »), 41 à 84 s. Taux de sauvegarde élevé. | Voix anonymisée. Aucune transparence. |
| 8 | **Goat Pronos** | Facebook | 130 600 | 1 par jour | 395 000 (Reels) | nd | Reels « Les matchs du jour » et « 10 scores exacts tentés, vous m'en donnez combien ? ». 200 à 300 partages par Reel. Publiés entre 21 h 30 et 1 h 30. | Site « Public + VIP ». |
| 9 | **PRONOSTIC FOOT** (page) | Facebook | 12 800 | plusieurs par jour | 23 à 97 réactions | — | Texte en liste « ma vision du jour » avec emojis de drapeaux. Diffusé en masse dans des groupes. | Bilan sélectif (« 16 verts / 2 rouges »). Canal WhatsApp. |
| 10 | **PRONOSTIC FOOT 98 %** | YouTube | 5 000 | environ 1 par jour | 6 à 341 vues | — | Shorts de 10 à 41 s avec « coupon du jour ». | **« 98 % »** dans le nom. Coupons **1xBet/Melbet**, opérateurs non agréés par l'ANJ en France. Tutoriel de « retrait mobcash ». |

### 2.2 Stats et data

| # | Compte | Plateforme(s) | Abonnés | Fréq. | Perf. | Formats qui marchent | Red flags |
|---|---|---|---|---|---|---|---|
| 11 | **@OptaJean** (Stats Perform) | X (IG inactif depuis 2023 : 2 300 abonnés) | 202 600 (X) | 2 à 4 tweets par jour | Vues méd. 11 800. Pic à 196 800. | **Le chiffre en tête** (« 28 – … »), un fait, puis **un mot de chute** (« Trompe-l'œil. », « Requin. »). Visuel Opta. Probabilités de l'« outil prédictif » (19 700 vues). **Le meilleur tweet est l'angle xPts contre le classement réel.** | Aucun. C'est la référence de crédibilité. |
| 12 | **@twistyifoot** | TikTok | 100 600 | environ 2 par jour, en rafales | 16 400 | Fan en maillot du PSG face caméra devant des images du joueur (fond vert). Avis tranché en titre (« X c'est plus possible », « Y est injouable »). 66 à 78 s. **4 vidéos dans les 15 minutes qui suivent le coup de sifflet final.** **ER record de l'échantillon : 18 %.** | Aucun visible. |
| 13 | **@incognito_ftbl** | TikTok | 28 200 | faible | 4 600 à 9 700 | Comparaison de stats Mbappé/CR7 ou Messi/Ronaldo en 32 s. | Aucun. |
| 14 | **@fl__243** (exemple d'outlier) | TikTok | 12 100 | — | **579 200** | Débat Messi-Ronaldo chiffré en 2 min 10 : 2 399 commentaires, 13 900 partages. Le débat GOAT est un moteur éternel. | Aucun. |
| 15 | **@footlabstatistiquesligue1** | Instagram | nd | plusieurs par jour (automatisé ; 5 posts le 18/09) | **0 à 1 like** | Carrousels « la journée lue par le modèle », puis « décisions figées contre résultats ». Mentions honnêtes (« aucun résultat garanti »). | Aucun red flag, mais **aucune audience**. Transparence sans accroche ni personnalité = invisible. |

### 2.3 IA et prono automatisé

| # | Compte | Plateforme | Abonnés | Perf. | Ce qu'ils font | Red flags |
|---|---|---|---|---|---|---|
| 16 | **Analyai.foot** (analyai.io) | Facebook | 374 | 184 à 618 likes (probablement sponsorisé, non vérifiable) | **Positionnement quasi identique à IASHARK** : « une analyse gratuite par jour », analyse IA de la forme, de l'historique et du contexte. Concours « donne le score exact en commentaire » avec obligation de créer un compte et d'identifier 3 amis. | Slogan du type « ne pariez plus au hasard » : il suggère une amélioration des chances (risque au regard de l'art. L.121-4 du Code de la consommation). |
| 17 | **@foot_exo, @goalpickr, @exprysm** | Instagram | petits | **0 à 2 likes par post** | Cartes pronos générées automatiquement (« notre pari : victoire X @ 1,62, confiance ⭐⭐⭐⭐ »). « Sélections Premium sur Telegram ». | Cotes et « confiance » affichées ; tunnel vers Telegram. |
| 18 | Spam « IA prono » sur X | X | 0 | 45 vues | « Une IA qui t'aide à faire de bons pronos, 300 analyses par mois, prends mon lien ». | Affiliation, promesse implicite de gain. |

**Pour situer la concurrence (affirmation non vérifiée) :** un compte X de « builder » affirme avoir fait 10 000 USD de revenu mensuel récurrent en 2 semaines avec une appli de prédiction IA pendant la Coupe du monde. Le contenu organique était produit depuis des iPhones aux États-Unis. Cela illustre la ruée vers les applis « IA prono ».

### 2.4 Grands médias et formats courts

| # | Compte | Abonnés par plateforme | Perf. médiane | Meilleurs formats observés |
|---|---|---|---|---|
| 19 | **Foot Mercato** | TT 2,4 M · IG 2,43 M · X 4,73 M · FB 5,94 M | TT 26 400 vues (max 349 300) · IG carrousel 15 200 likes · FB 1 060 likes | Voir détail ci-dessous. |
| 20 | **L'Équipe** | TT 4,1 M · IG 3,54 M · FB 7,9 M · YT 2,05 M | TT 33 700 · IG Reel 96 400 vues · YT Shorts 1 000 à 82 800 | Voir détail ci-dessous. |
| 21 | **RMC Sport / After Foot** | TT 2,0 M · X 2,84 M · FB 4,99 M · YT 1,75 M · @AfterRMC 796 000 | TT 39 000 (max 283 400) · AfterRMC 58 200 vues par tweet | Voir détail ci-dessous. |
| 22 | **Actu Foot** (@ActuFoot_) | X **8,96 M** · IG 790 000 | X 284 000 vues médianes (max 1,31 M) · IG carrousel 24 500 likes | Voir détail ci-dessous. |
| 23 | **Oh My Goal France** | TT 1,6 M · YT 1,22 M | TT 72 900 (carrousels) · YT 1 500 à 1,81 M | Voir détail ci-dessous. |
| 24 | **@footcentralclips** (Foot Central, Paris Central) | TT 142 000 · YT 70 300 · IG 27 000 (selon sa bio) | TT 18 500 (max 111 900) | Voir détail ci-dessous. |

Meilleurs formats observés :

- **Foot Mercato**
  - TikTok : question-titre face caméra sur fond d'images. « [Star] a-t-il eu raison de [décision] ? » a fait 349 300 vues, 59 400 likes, soit 13 fois la médiane.
  - TikTok : comparaison « [jeune] = le [star] [pays] ? ».
  - X : série « [Joueur], Ballon d'Or : pour ou contre ? », 428 à 1 247 réponses par tweet.
  - Instagram : carrousel question « qui aurait mérité sa place ? », 47 000 likes et 315 commentaires.
  - Facebook : photo et texte finissant par une question.
- **L'Équipe**
  - TikTok : immersion documentaire (« La bascule » : 105 700 vues, 1 141 sauvegardes).
  - TikTok : images exclusives (ultras à l'entraînement : 112 100 vues).
  - YouTube : Shorts d'actualité de 56 s à 2 min 16.
- **RMC Sport / After Foot**
  - TikTok : citation forte en 17 s (283 400 vues).
  - TikTok : chroniqueur qui « tacle » (225 commentaires).
  - X (After Foot) : citations de chroniqueurs.
  - Concours « commente ton prono » (261 réponses).
- **Actu Foot**
  - X : **live-tweet en majuscules et emojis, vidéo du but, source créditée**.
  - X : citations polémiques.
  - Instagram : carrousels de résultats (« LE BAYERN ATOMISE… »).
- **Oh My Goal France**
  - TikTok : **mode photo en carrousel** avec longue légende narrative et stat historique (« du jamais vu depuis 1915 », 85 000 vues).
  - TikTok : débat Ballon d'Or (196 700 vues, 883 commentaires).
  - YouTube : série épisodique « Mercato Z » (31 700 à 83 900 vues).
  - YouTube : Short « l'aura de Zidane » (1,81 M de vues).
- **@footcentralclips**
  - **Classement à débattre** extrait du live, par exemple « la Côte d'Ivoire est top combien en Afrique ? » : 111 900 vues, 479 commentaires.
  - Toujours une question « oui ou non ? » en légende.
  - Publication automatisée à heures fixes (xx h 55).

**Autres comptes observés, en complément :**

- Chaînes et marques officielles :
  - @ligue1 : 26,3 M sur TikTok ; ses clips de 5 à 10 s font 0,97 à 1,6 M de vues.
  - @ligue1plus : 994 000 sur TikTok, 422 000 sur Instagram.
  - Canal+ Sport : 1,07 M sur Instagram. Accroche en probabilité « 1 chance sur 47 000 » : 145 600 vues. « Tirs au but : loterie ou stratégie ? On a enquêté » : 93 000 vues.
  - Onze Mondial : 253 000 sur Instagram.
  - So Foot : 48 000 sur Instagram.
- Bookmakers :
  - Winamax : 73 000 sur X ; profil Instagram « Restricted ».
  - Paris Sportifs FDJ : profil Instagram « Restricted ».
  - BetssonFR : 6 400 sur X.
  - Leurs posts sont des concours du type « commente ton prono pour gagner un freebet ».
- Pronos YouTube inactifs en Shorts :
  - Jerem Pronos, 26 200 abonnés ; ses derniers Shorts datent de 2024 et font 283 à 1 104 vues.

---

## 3. Fiches par plateforme

### 3.1 TikTok

C'est la plateforme centrale de la niche. Les chiffres ci-dessous portent sur 96 vidéos récentes de 12 comptes.

| Compte | Vues méd. | Vues / abonnés | ER méd. | Sauvegardes / vues | Durée méd. | Meilleur post / médiane |
|---|---|---|---|---|---|---|
| telesportix | 67 550 | 9,7 % | 4,8 % | 0,40 % | 4 min 46 | 4,2× |
| ohmygoalfrance | 72 900 | 4,6 % | 10,6 % | 0,35 % | carrousel | 2,7× |
| jour_du_foot | 25 000 | 2,3 % | 6,2 % | **1,11 %** | 60 s | **16,2×** |
| kp_avis_ | 18 050 | 14,6 % | 4,9 % | **1,17 %** | 2 min 47 | 2,7× |
| footcentralclips | 18 500 | 13,0 % | 5,4 % | 0,30 % | 1 min 28 | 6,0× |
| twistyifoot | 16 400 | 16,3 % | **18,0 %** | 0,82 % | 1 min 10 | 3,3× |
| statsenshorts.foot | 10 350 | **49,7 %** | 2,8 % | 0,43 % | 1 min 37 | 2,3× |
| footmercato | 26 400 | 1,1 % | 14,3 % | 0,54 % | 1 min 05 | 13,2× |
| rmcsport | 39 050 | 2,0 % | 7,2 % | 0,20 % | 30 s | 7,3× |
| lequipe | 33 700 | 0,8 % | 6,3 % | 0,18 % | 52 s | 3,3× |
| romicheparlefoot_ | 2 090 | 12,8 % | 4,1 % | 0,20 % | 1 min 45 | 11,3× |
| le_ptit_auxerrois | 1 370 | 13,8 % | 6,2 % | 0,19 % | 29 s | 4,4× |

**Ce qu'on en tire :**

- **Les comptes pronos ont un taux de sauvegarde deux à six fois plus élevé que les médias** : 1,1 à 1,2 % contre 0,2 %. Le prono est un contenu « à revérifier ». Il faut concevoir les vidéos IASHARK pour la sauvegarde : liste claire, heure du match, rendez-vous du bilan.
- **Rapportés à leur taille, les petits comptes spécialisés touchent bien plus que les médias.** statsenshorts.foot est vu en médiane par 49,7 % de ses abonnés, contre 0,8 % pour L'Équipe. L'algorithme pousse la niche prono et stats vers une audience intéressée, même avec peu d'abonnés. **C'est une bonne nouvelle pour un compte IASHARK qui démarre à zéro.**
- **Les outliers de la niche viennent de trois formats :**
  - la liste révélée (scores) ;
  - la question clivante sur une star ;
  - le classement à débattre.
- **L'analyse froide ne produit pas d'outlier.** Exemple : statsenshorts.foot, dont l'accroche est faible (voir section 6).

### 3.2 Instagram

Échantillon : 12 derniers posts de 9 comptes utilisables et 33 posts de hashtags.

| Compte | Abonnés | Carrousel (likes méd.) | Reel (likes méd. · vues méd.) | Image (likes méd.) |
|---|---|---|---|---|
| @actufoot_ | 790 000 | **24 514** (3,1 % des abonnés) | 3 158 · 25 000 | 21 468 |
| @footmercato | 2,43 M | **15 171** | 9 213 · 51 900 | — |
| @lequipe | 3,54 M | 7 174 | 4 944 · 96 400 | 6 139 |
| @canalplussport | 1,07 M | 4 534 | 13 702 · **134 800** | 37 099 (news) |
| @sofoot | 48 000 | **9 162** (19 % des abonnés) | 161 · 4 600 | 116 |
| @onzemondial | 253 000 | 854 | 1 991 · 66 200 | 65 |
| @ligue1plus | 422 000 | — | 1 315 · 8 100 | 361 |
| @telesportix | 12 300 | — | 407 · 20 700 (152 800 pour le post épinglé CAN) | — |

- **Les carrousels l'emportent en likes et en commentaires pour les médias foot.** Actu Foot fait près de 8 fois plus de likes en carrousel qu'en Reel. So Foot fait 57 fois plus.
- **Les Reels l'emportent en portée** : 25 000 à 135 000 vues médianes.
- **Les hashtags pronos sont un cimetière.** Tous les posts #pronosticfoot et #statsfoot collectés viennent d'outils automatisés (cartes pronos, carrousels « le modèle a lu la journée ») et font **0 à 2 likes**. Enseignement direct pour IASHARK : **publier une carte par match générée automatiquement ne sert à rien sans accroche humaine.**
- **Les marques de paris ont un profil restreint (18+) sur Instagram** : Winamax et Paris Sportifs FDJ sont marqués « Restricted profile ». Risque à surveiller pour IASHARK si le compte parle trop « pari » (voir section 10).

### 3.3 X (Twitter)

Échantillon : 129 tweets.

| Compte | Abonnés | Vues méd. | Format signature | Meilleur tweet de l'échantillon |
|---|---|---|---|---|
| @ActuFoot_ | 8,96 M | 284 000 | Live-tweet d'action : majuscules, emojis, clip vidéo, crédit du diffuseur. Citation polémique d'un consultant. | Citation d'un ex-international sur Mbappé : 1,31 M de vues, 246 citations |
| @footmercato | 4,73 M | environ 59 000 (tweets à 200 likes ou plus) | Série « [Joueur], Ballon d'Or 2026 : pour ou contre ? » avec visuel. Course au titre de buteur sous forme de liste. | Messi pour ou contre : 12 900 likes, **1 247 réponses** |
| @AfterRMC | 796 000 | 58 200 (tweets à 100 likes ou plus) | Citation de chroniqueur, avec image ou clip | Coulisses Dembélé et Mbappé : 466 500 vues |
| @OptaJean | 202 600 | 11 800 (20 tweets sans filtre) | Voir le détail ci-dessous. | xPts « le top 3 de L1 serait en 2e moitié de tableau » : 196 800 vues, 40 citations |
| @Winamax | 73 000 | 1 seul tweet collecté : 11 800 | Concours goodies (RT + follow + réponse) | 235 réponses |

*Biais à garder en tête : ActuFoot, Foot Mercato et AfterRMC ont été collectés en tri « Top », avec un seuil de likes pour les deux derniers. Leurs médianes sont donc **surestimées**. Seul l'échantillon OptaJean de 20 tweets est sans filtre.*

- **Format signature d'OptaJean :** le chiffre en tête, un fait vérifiable, puis un mot de chute en fin de tweet.
- **La recherche « prono foot » en français avec au moins 150 likes sur 2,5 semaines ne renvoie aucun tweet.** Même constat pour la recherche « pronostic ligue 1 » : le meilleur tweet fait 10 700 vues (un classement pronostiqué). **Sur X, le prono pur ne fait pas d'audience ; la stat, le live et le débat en font.**
- **Piège de hashtag :** « xG » renvoie surtout vers le groupe de K-pop XG. Il faut écrire « Expected Goals » en toutes lettres ou utiliser « #xG + nom de club ».
- **Le « modèle contre la réalité » marche sur X.**
  - Tweet OptaJean xPts : 16,7 fois sa médiane.
  - RMC Sport a publié un article du type « le surprenant classement selon les expected goals ».
  - Un tweet ironique de supporter (« on ne gagne pas avec des expected goals ») fait 346 000 vues et 185 réponses. Le concept clive, donc il engage.

### 3.4 Facebook

| Page | Abonnés | Perf. | Format |
|---|---|---|---|
| L'Équipe (lequipe.fr) | 7,9 M | posts non collectés (mauvaise URL au premier passage) | — |
| Foot Mercato | 5,94 M | 1 060 likes méd. (246 à 3 766), 9 à 68 commentaires | Photo, titre « 🚨 » et texte de 3 à 4 lignes **terminé par une question** (« X a-t-il raison ? ») |
| RMC Sport | 4,99 M | 70 à 3 683 likes ; vidéo à 32 000 vues | Photo, fait de match, question |
| **Goat Pronos** | 130 600 | **Reels : 395 000 vues méd.** (31 500 à 544 500), 200 à 308 partages | Reels quotidiens « les matchs du jour », « 10 scores exacts tentés, vous m'en donnez combien ? » |
| PRONOSTIC FOOT | 12 800 | 23 à 97 réactions | Texte en liste et diffusion dans des groupes |
| Analyai.foot | 374 | 184 à 618 likes | Concours IA, « une analyse gratuite par jour » |

- **Facebook Reels récompense le prono en liste avec défi** (« vous m'en validez combien ? »).
- Le public est plus âgé et partage davantage : 200 à 300 partages par Reel chez Goat Pronos, contre 0 à 100 sur TikTok pour des vues comparables.
- **Les groupes Facebook sont un canal de diffusion du prono.** Les permaliens de la recherche pointent vers au moins 5 groupes différents.

### 3.5 YouTube Shorts

| Chaîne | Abonnés | Vues des Shorts récents | À retenir |
|---|---|---|---|
| Oh My Goal France | 1,22 M | 1 588 à **1,81 M** | Série épisodique « Mercato Z » (épisodes de 2 à 3 min, 31 700 à 83 900 vues). Titres-questions. |
| L'Équipe | 2,05 M | 1 020 à 82 800 | Même sujet que le 349 000 de Foot Mercato sur TikTok (Mbappé et On) : 82 800 vues. **Les sujets passent d'une plateforme à l'autre.** |
| RMC Sport | 1,75 M | 2 851 à 5 566 | Clips de conférence de presse. Faible. |
| Foot Central | 70 300 | 2 427 à 6 524 | Mêmes débats que sur TikTok, 5 à 20 fois moins de vues. |
| Jerem Pronos | 26 200 | 283 à 1 104 (Shorts de 2023-2024) | Le prono en Short a été abandonné. |
| PRONOSTIC FOOT 98 % | 5 000 | 6 à 341 | Coupons 1xBet. |

**Conclusion :** YouTube Shorts sert de **plateforme de recyclage**. Titre cherchable (« OM–PSG : à quelle minute tombent les buts ? ») et durée de 50 à 60 s. Ce n'est pas la plateforme où investir en premier.

---

## 4. Les formats qui surperforment, et pourquoi

### 4.1 Le tableau des scores en liste : format n° 1 en vues pour le prono

**Exemple : @jour_du_foot.**

- **Performance :** 405 100 vues, 29 700 likes, **4 777 sauvegardes**, 846 partages, 186 commentaires. La médiane du compte est de 25 000.
- **Anatomie, d'après la description IA de TikTok :**
  - 0 à 7 s : fond bleu, en-tête « Full Time », logo et nom des deux équipes, score. Musique rythmée.
  - Puis un match toutes les ~8 s, 7 affiches au total, jusqu'à 60 s.
  - Aucune voix. Aucun texte superflu.
- **Pourquoi ça marche :**
  - Chaque spectateur attend **son** match : la liste crée une boucle ouverte (effet Zeigarnik).
  - Le format se sauvegarde, parce qu'on vérifie plus tard.
  - Les gens commentent leur propre score, ce qui fait tourner l'algorithme.
  - Il est lisible sans son.
- **Défaut, et c'est là que l'imitation devient dangereuse :** afficher un pronostic sous l'en-tête « Full Time » le fait **passer pour un résultat réel**. C'est trompeur. Dans les commentaires, les spectateurs relèvent d'ailleurs les matchs « déjà perdus ».
- **Version IASHARK honnête :**
  - « Les 5 affiches du soir lues par le modèle ».
  - Une affiche toutes les 5 à 6 s.
  - **Probabilité et scénario, pas de faux score final.**
  - Horodatage « publié à 17 h 02, avant le coup d'envoi ».

### 4.2 Les pronos de la journée face caméra : le format français le plus stable

**Exemples et chiffres :**

| Compte | Vidéo | Durée | Vues | Rapport à la médiane |
|---|---|---|---|---|
| @telesportix | 5e journée de L1 | 12 min 05 | 283 300 | 4,2× |
| @telesportix | Europa League | 3 min 41 | 137 600 | — |
| @kp_avis_ | 5e journée de L1 | 3 min 17 | 49 000 | 2,7× |
| @romicheparlefoot_ | 2e journée de L2 | 1 min 47 | 23 600 | 11× |
| @romicheparlefoot_ | 4e journée de L1 | 1 min 55 | 49 300 | 11× |

**Pourquoi ça marche :**

- Le rendez-vous est récurrent : chaque journée.
- La voix incarne une personne (voir l'effet de similarité dans le skill marketing-psychology).
- Tous les supporters de 9 clubs sont concernés.
- C'est un sujet « utile ».

**Point faible :** la longueur. Seul un duo installé comme Telesportix tient 12 min. Les comptes plus petits performent entre 1 et 3 min.

### 4.3 La question clivante sur une star

**Exemples :**

- Foot Mercato, modèle « [Star] a-t-il eu raison de quitter [marque] ? » : 349 300 vues, soit 13,2 fois sa médiane.
- Oh My Goal, carrousel sur les critères du Ballon d'Or selon Yamal : 196 700 vues, 883 commentaires.
- Série X de Foot Mercato « pour ou contre ? » : jusqu'à 1 247 réponses.

**Pourquoi ça marche :**

- Tout le monde a un avis.
- Il n'y a pas de bonne réponse.
- Le biais de confirmation pousse chacun à défendre son camp.

**Leçon pour IASHARK :** poser la question **au modèle**, par exemple « le modèle dit que Paris n'est favori qu'à 52 %, trop bas ? ». On obtient le débat sans l'opinion gratuite.

### 4.4 Le classement à débattre

**Exemples :** @footcentralclips, sur le modèle « [Pays / club] c'est top combien ? » : 111 900 vues et 479 commentaires. Les modèles « combien de nations sont plus grandes que la France ? » ou « ces coachs sont-ils plus grands que Zidane ? » font 195 et 62 commentaires.

**Pourquoi ça marche :** un chiffre à donner en commentaire, c'est un micro-engagement à coût quasi nul. C'est la technique du pied dans la porte.

**Version IASHARK :** « Classe ces 5 équipes de la plus à la moins dangereuse en fin de match. Le modèle répond dans 24 h. »

### 4.5 L'avis tranché d'un fan face caméra

**Exemple : @twistyifoot**, avec un ER de 18 %. Titre du type « [Joueur] c'est plus possible ❌ » (54 200 vues, 10 000 likes). La vidéo s'ouvre sur une posture de départ : « puisque personne n'en parle, je le fais ». Les vidéos sont publiées **dans les 15 minutes qui suivent le match**.

**Pourquoi ça marche :**

- La conviction.
- La fraîcheur : l'émotion du match est encore là.
- Le tribalisme.

**Transposition IASHARK :** une réaction chiffrée à chaud, par exemple « le modèle avait vu la fin de match ouverte : 12 buts sur 15 min dans les 20 derniers matchs, et voilà ».

### 4.6 La stat-choc Opta : format X et carrousel

**Structure OptaJean :** chiffre, fait, mot de chute. Les meilleurs tweets de l'échantillon traitent :

- de l'**écart entre le modèle et la réalité** (xPts, « trompe-l'œil ») : 196 800 vues ;
- de **records historiques** (Lens et son premier « miracle » en Ligue des champions : 402 likes).

Oh My Goal applique la même logique en carrousel TikTok (« du jamais vu depuis 1915 ») : 85 000 vues.

### 4.7 L'accroche en probabilité

**Canal+ Sport**, sur le modèle « 1 chance sur 47 000 » : 145 600 vues sur Instagram.

**Opta** : probabilités par club pour l'Europa League, 19 700 vues. Le grand public accepte la **probabilité comme contenu** quand elle est formulée comme une rareté ou un défi.

---

## 5. Durées idéales, d'après les données

Performance relative par tranche de durée, sur 96 vidéos TikTok. Chaque vidéo est comparée à la médiane de son propre compte.

| Tranche | n | Médiane relative | Moyenne relative |
|---|---|---|---|
| 30 s ou moins | 8 | 1,03 | 2,28 |
| **31 à 60 s** | 14 | **1,15** | **3,66** |
| 61 à 90 s | 29 | 0,98 | 1,59 |
| 91 à 180 s | 22 | 0,80 | 1,83 |
| Plus de 180 s | 9 | 1,10 | 1,61 |
| Carrousel | 14 | 0,66 | 1,13 |

**Lecture :**

- **La tranche 31 à 60 s concentre les gros outliers.** On y trouve les 60 s de @jour_du_foot, les 67 s de Foot Mercato et les 35 s de @dgnova01 (163 000 vues pour 7 900 abonnés).
- Les formats longs ne marchent que pour la journée complète portée par un présentateur connu.
- L'échantillon est petit : c'est une tendance, pas une règle.

**Recommandations de durée pour IASHARK :**

| Format | Durée |
|---|---|
| Accroche seule, teaser | 8 à 15 s |
| Match Pulse avec voix | **30 à 45 s** (chaque phase de 15 min lisible au moins 4 s) |
| Liste « les affiches du soir » | 40 à 60 s (5 à 6 s par match) |
| Journée L1 complète | 90 à 150 s (plus tard, si une voix ou un visage s'installe) |
| YouTube Shorts | 50 à 60 s |
| Clip X | 10 à 20 s |

---

## 6. Les accroches : les 1 à 2 premières secondes, texte et voix

Les modèles ci-dessous sont reformulés. Les comptes sources sont indiqués.

| Modèle d'accroche | Source et performance | Texte à l'écran | Voix |
|---|---|---|---|
| **Numéro de journée et promesse** : « Mes pronos pour la [N]e journée de [ligue] 😱 » | romicheparlefoot_ (11×), kp_avis_ (2,7×), telesportix (4,2×) | Titre en haut, majuscules | Annonce directe, sans préambule |
| **Carte-résultat dès la frame 1** (logos et chiffres) | jour_du_foot (16×) | L'affiche **est** l'accroche | Aucune (musique) |
| **Question sur la décision d'une star** : « [Star] a-t-il eu raison de [décision] ? » | footmercato (13×) | Question en majuscules et image de la star | Présentateur énergique dès 0 s |
| **Verdict brutal** : « [Joueur] c'est plus possible ❌ » ou « [Joueur] est injouable » | twistyifoot (ER 18 %) | Titre en haut sur fond d'images du joueur | « Personne n'en parle, alors je le fais » |
| **Classement à chiffrer** : « [X] c'est top combien ? » | footcentralclips (6×) | Drapeau et question | Extrait de live, déjà en pleine discussion |
| **Rareté chiffrée** : « 1 chance sur [N] » | Canal+ Sport (145 600 vues) | Le chiffre seul | — |
| **Chiffre en tête** : « [N] – [fait] » | OptaJean (tweet xPts : 16,7×) | — | — |
| **Contre-exemple (accroche faible)** : ouverture sur le match de la veille puis présentation des affiches | statsenshorts.foot (médiane 10 000, ER 2,8 %) | Affiche de journée statique | Préambule de 8 s avant le premier prono |

**Règles qui ressortent :**

- **Le sujet précis arrive en moins d'une seconde :** nom de club, nom de joueur ou chiffre.
- **Il y a un chiffre ou une question fermée.**
- **Les majuscules servent à mettre en avant le mot-clé**, pas toute la phrase.
- **Pas de logo de marque en ouverture.** Aucun top post ne commence par son logo.
- **La voix démarre immédiatement**, sans « salut tout le monde ».

---

## 7. Mécaniques de rétention observées

| Mécanique | Où | Effet recherché |
|---|---|---|
| **Liste numérotée ou révélée une par une** (1 match toutes les 6 à 8 s) | jour_du_foot, Goat Pronos, telesportix | Chacun attend son match : boucle ouverte |
| **Révélation finale du verdict** (score ou choix du modèle à la fin) | statsenshorts (le classique en dernier), Match Pulse Lyon–Rennes (« le marché retenu est sur iashark.com ») | Pic en fin de vidéo (règle du pic et de la fin) |
| **Du plus petit au plus gros match** (l'affiche phare en dernier) | statsenshorts : Monaco–Lens, puis Lyon–Rennes, puis OM–PSG | Montée en tension |
| **Défi au spectateur** (« vous m'en validez combien sur 10 ? ») | Goat Pronos (Facebook) | Les gens regardent tout pour compter |
| **Carrousel à tension narrative** (vie du joueur, puis rebondissement, puis chiffre final) | Oh My Goal (carrousel Kvara, 89 100 vues) | On fait défiler jusqu'à la chute |
| **Réaction à chaud en série** (4 vidéos en 15 min après le match) | twistyifoot | Occupe le flux tant que l'émotion dure |
| « Reste jusqu'au bout » **explicite** | **Non observé** dans les tops de l'échantillon | Les meilleurs y arrivent par la structure, pas par l'injonction |
| Barre de progression, compte à rebours | Non observé chez les concurrents. Existe chez IASHARK (horloge 0–90). | **Avantage propre à IASHARK**, à rendre lisible |

---

## 8. Légendes et CTA

### 8.1 Ce qu'on observe

- **Les légendes sont courtes sur TikTok** : 1 à 2 lignes, puis une question, puis 3 à 5 hashtags. Mélange de hashtags de ligue (#ligue1) et de hashtags de match (#omPSG, #asmrcl).
- **Les légendes sont longues et narratives en carrousel** : Oh My Goal écrit 5 à 10 lignes, avec la stat et le contexte, et finit par une question.
- **CTA les plus utilisés :**
  - « Donne ton prono en commentaire » ;
  - « Oui ou non ? » ;
  - « Balance TON choix » ;
  - « Pour ou contre ? » ;
  - « Tu en valides combien ? » ;
  - « Dis-moi ce que tu en penses » ;
  - « Abonne-toi, live tous les jours à 17 h ».
- **Légendes Facebook** : titre « 🚨 » et 3 lignes de faits, puis « X a-t-il raison ? ».

### 8.2 CTA conformes recommandés pour IASHARK

- « Ton score pour ce match ? On compare avec le modèle après le coup de sifflet. »
- « Le modèle voit un match fermé. D'accord ou pas ? »
- « Enregistre la vidéo pour vérifier ce soir. »
- « Quelle affiche tu veux voir analysée demain ? »
- « L'analyse complète du match gratuit du jour est sur iashark.com (lien en bio). »

Ce sont des faits. Aucune promesse.

### 8.3 À bannir

Ces formules ont toutes été vues chez des concurrents :

- « sûr », « fiable », « 100 % », « 98 % » ;
- « devenir gagnant », « c'est offert », « coupon », « VIP » ;
- lien Telegram ou WhatsApp « premium », code de parrainage d'un bookmaker ;
- cote affichée comme argument, « remboursé si » ;
- toute formule suggérant qu'IASHARK **augmente les chances de gagner** (voir section 10).

---

## 9. Ce qui se passe dans les commentaires

Paraphrase des 123 commentaires collectés, avec les tendances visibles :

1. **« Voici MON score »**
   - C'est de loin le premier comportement : score exact, équipe gagnante, liste complète de 7 scores.
   - Sous le 405 000 de @jour_du_foot, la majorité des commentaires sont des scores.
2. **Le tribalisme de club**
   - Défense de son équipe (Le Mans, Lens, Toulouse).
   - Accusation de favoritisme (« comme par hasard il met son club gagnant »).
3. **La sanction des erreurs et du timing**
   - Moquerie quand un pick perd (le premier pick est « déjà dans l'eau », « déjà rouge »).
   - Reproche d'avoir publié **après** le début d'un match.
   - Sur ce point, **la confiance se joue sur l'horodatage.**
4. **L'intention de parier**
   - « Sur quelle appli c'est remboursé ? »
   - Surenchère sur la mise, du type « mets un gros billet ».

   **IASHARK ne doit jamais relancer sur la mise ni sur un opérateur.**
5. **La validation sociale**
   - « Validé », « j'approuve ton analyse ».
   - Chez certains comptes, des rafales d'emojis identiques : suspicion d'engagement artificiel.
6. **Les demandes de match**
   - « Quelqu'un peut faire une prédiction pour [match] ? »
   - C'est la demande latente sur laquelle le CTA « quelle affiche demain ? » peut s'appuyer.
7. **Le débat GOAT et Ballon d'Or**
   - Les commentaires d'opinion les mieux notés dépassent 1 000 likes (sous Oh My Goal).
   - Les fils de réponses sont longs.
8. **Le spam**
   - « Regarde ma story » et comptes promotionnels.
   - Il faut une modération.

---

## 10. Heures de publication observées et cadre légal

### 10.1 Heures (Paris)

| Compte | Créneaux observés | Logique |
|---|---|---|
| kp_avis_ | 7 h à 12 h (6 posts sur 8), jour du match | L'avis du matin avant la journée |
| telesportix | 12 h à 13 h, puis 22 h à 23 h 30 (la veille des journées) | Pronos du lendemain le soir |
| jour_du_foot | 19 h 45 à 23 h 30 | Liste pour le lendemain |
| Goat Pronos (Facebook) | 21 h 20 à 1 h 30 | « Matchs du jour » de la nuit et du lendemain |
| twistyifoot | 22 h 50 à 23 h 50 | Juste après le coup de sifflet final |
| footcentralclips | 6 h 55, 11 h 55, 17 h 55, 22 h (automatisé) | Occupation du flux |
| OptaJean (X) | Pendant et après les matchs (21 h à minuit) et le matin | La stat à chaud |

**Performance relative par heure de publication**, sur 96 vidéos TikTok (petit échantillon, à confirmer) :

- Meilleurs créneaux : **17 h à 18 h** (×1,43 et ×1,18) et **21 h à 22 h** (×1,32 et ×1,28).
- Créneaux faibles : **10 h** (×0,41) et **19 h à 20 h** (×0,48 et ×0,39). C'est l'heure des coups d'envoi : l'audience regarde le match.

**Recommandation :**

- Pour un match le jour même :
  - contenu d'avant-match publié **entre 17 h et 18 h 30**, au plus tard 2 h avant le coup d'envoi ;
  - liste du lendemain **entre 21 h et 23 h** ;
  - stat ou réaction **dans les 15 minutes après le coup de sifflet final**, en priorité sur X et TikTok.
- Éviter de publier pendant les matchs du soir (20 h 45 à 22 h 45), sauf en live-stat sur X.

### 10.2 Cadre légal et plateformes : ce qui borne les CTA

Ce n'est pas un avis juridique. **À faire valider par un juriste**, car c'est une décision de l'owner.

- **Loi n° 2023-451 du 9 juin 2023** (influence commerciale)
  - Elle interdit aux influenceurs la promotion d'**abonnements à des conseils ou pronostics sportifs**.
  - Selon le cabinet Kohen Avocats (juin 2026), la responsabilité peut aussi toucher l'annonceur qui organise ou finance la campagne.
  - **Conséquence possible pour IASHARK :** ne pas payer d'influenceurs ni d'affiliés pour promouvoir l'abonnement Pro à 19,95 €. **À VALIDER.**
- **Article L.121-4 du Code de la consommation**
  - Affirmer qu'un service **augmente les chances de gagner** à un jeu d'argent est une pratique réputée trompeuse.
  - Cet article est cité dans la réponse du gouvernement à la question écrite AN n° 11745 (publiée le 9 juin 2026).
  - Sanctions citées dans cette réponse :
    - 19 établissements contrôlés ;
    - 80 000 € d'amende à l'été 2025 ;
    - un influenceur condamné fin 2025 à un an de prison avec sursis et 150 000 € d'amende.
- **TikTok**
  - Il interdit la promotion ou la facilitation d'accès aux paris sportifs.
  - Selon ses règles telles que résumées par les sources consultées, les contenus qui **glorifient** le jeu sont réservés aux 18+ et exclus du fil « Pour toi ».
  - Le contenu éducatif ou statistique reste possible.
  - **Implication :** parler de probabilités, de scénarios et de stats. Ne pas parler de mise, de gains, de cotes ou de bookmakers.
- **Instagram**
  - Les profils de Winamax et de Paris Sportifs FDJ apparaissent comme « Restricted », c'est-à-dire limités en âge.
  - Un compte IASHARK trop orienté pari risque le même traitement (hypothèse).
- **Levier de différenciation (psychologie : effet pratfall, confiance)**
  - Publier **avant** le coup d'envoi, horodaté.
  - Afficher les ratés au même niveau que les réussites, avec un bilan complet et une méthodologie.
  - Ne jamais citer un « taux de réussite » sans période, sans méthode et sans les pertes.

---

## 11. Évaluation du template IASHARK `MatchPulseBrentfordChelseaInstagram.tsx`

Fichiers lus :

- `src/MatchPulseBrentfordChelseaInstagram.tsx` ;
- `Composition.tsx`, ligne 142 ;
- `src/MatchPulseLyonRennesInstagram.tsx`, pour comparaison ;
- les rendus `out/brentford-chelsea-*.png` et `out/iashark-brentford-chelsea-90min-instagram.mp4`.

Ce dernier rendu a été analysé par viral-lab : contact sheets et mesure du mouvement.

### 11.1 Faits mesurés

| Élément | Valeur | Source |
|---|---|---|
| Durée, format | 600 frames à 30 fps, soit **20,0 s**, en 1080×1920 | `Composition.tsx` et métadonnées viral-lab |
| Découpage | 1re mi-temps de 0 à 7,75 s (3 phases d'environ 2,6 s), **pause « mi-temps » figée de 2,5 s**, 2e mi-temps de 10,25 à 18 s, **carte finale 2 s** | Calcul à partir du code |
| Audio | **Aucun composant `<Audio>`** ; transcription vide : ni voix ni musique dans la composition | Code et Whisper (viral-lab) |
| Frame 0 | Logo IASHARK à opacité 0 (fondu sur 16 frames), bloc de texte à opacité 0,25 et décalé de 26 px : **première image sombre, aucune accroche** | Code et contact sheet à t = 0,0 s |
| Mouvement | Changement moyen entre frames : **0,013** ; aucun événement de fort changement | viral-lab |
| Surface statique | Logos, noms et « VS » occupent environ 18 % de la hauteur (y de 206 à 540) et ne bougent pas pendant 20 s | Code |
| Vitesse de lecture | Notes de 8 à 15 mots affichées environ 2,6 s, soit **3 à 6 mots par seconde** en majuscules. La version Lyon–Rennes monte à 15 mots. | Code |
| Petits textes | Surtitre en 20 px (écartement 6), ligue et date en 16 px, étiquettes « Brentford/Chelsea » en 18 px : **illisibles sur mobile** | Code |
| Zones de sécurité | « IASHARK.COM » à 88 px du bas, jauges (y de 1 333 à 1 461) et barre d'équilibre (y d'environ 1 502 à 1 532) **dans ou près de la zone recouverte par la légende et les boutons** TikTok/Reels. La carte « RYTHME » va jusqu'à x = 1 010, sous la colonne d'icônes à droite. | Code (zones de sécurité approximatives, à vérifier avec un calque) |
| Données | La courbe « danger » = part de buts par tranche **plus une ondulation sinusoïdale décorative** (`Math.sin`). Elle *paraît* minute par minute alors qu'elle ne l'est pas. Dans la version Brentford, les jauges Pression/Tirs/Rythme (1 à 5) sont éditoriales. Dans la version Lyon–Rennes, elles sont branchées sur des comptes réels (« buts marqués sur la tranche »). | Code |
| Payoff | Brentford : « Match serré attendu, le modèle privilégie moins de 3,5 buts » (sans probabilité). Lyon : le marché est **retenu** et renvoyé vers iashark.com (boucle ouverte). | Code |
| Branding de série | Petit texte « LECTURE IASHARK ». **Pas de nom de série, pas de numéro d'épisode, pas de signature sonore.** | Code et PNG |

### 11.2 Ce qui est bon, et rare dans la niche

- **Une idée visuelle propriétaire.** L'horloge de 0 à 90 minutes, la ligne de progression et la courbe qui se remplit forment une **barre de progression** naturelle, que personne d'autre n'a dans l'échantillon.
- **L'angle « à quel moment le danger arrive » est nouveau.** Il est plus riche que « 1-X-2 », et il est statistique plutôt que pari.
- **La version Lyon–Rennes a déjà deux améliorations :**
  - des faits sourcés, du type « 8 buts de Rennes dans le premier quart d'heure sur 20 matchs » ;
  - une boucle ouverte vers le site.

### 11.3 Recommandations, par priorité

**P1. Accroche en frame 0 (de 0 à 1,5 s).** Supprimer le fondu d'entrée : la frame 0 doit être pleine et lisible, puisque c'est aussi la couverture TikTok. Remplacer « logo et VS » par **une phrase-choc chiffrée sur le match**, en gros (72 à 96 px, au centre), la courbe **déjà entièrement dessinée** en fond, puis la « rembobiner » à 0' (structure « montrer le résultat d'abord »).

Exemples de modèles, à remplir avec des données réelles :

- « [Club A]–[Club B] : [N] % des buts tombent entre la 30e et la 45e. »
- « [Club] encaisse [N] buts après la 75e. Le modèle surveille la fin de match. »
- « Le modèle voit un match fermé. Toi ? »

Les logos restent en petit, en haut.

**P2. Durée : passer de 20 s à deux versions.**

- **Version « voix » de 30 à 45 s** : chaque phase de 15 min tient au moins 4 s, la carte finale 4 à 5 s.
- **Version « flash » de 12 à 15 s**, sans voix, pour tester l'accroche seule : 3 phases clés seulement (le pic, le creux, la fin), et le verdict.

**P3. Voix off en français.** Tous les leaders français de la niche parlent (voir section 4.2).

- Voix posée, rythme de 150 à 170 mots par minute.
- **La même voix sur tous les épisodes**, humaine ou voix de synthèse clonée et constante. C'est l'effet de simple exposition.
- La voix dit **une seule** idée par phase, avec le chiffre.
- Ajouter une musique d'ambiance légère, mixée en dessous de la voix, et un « tic » sonore à chaque changement de phase.
- Si aucune voix n'est possible au départ : utiliser une musique sous licence de la bibliothèque de la plateforme pour la version « flash ».

**P4. Sous-titres incrustés.**

- 2 lignes au maximum, 3 à 5 mots par ligne, synchronisés avec la voix.
- Mot-clé en cyan (#09D9FF), contour noir.
- Remonter le **surtitre de 20 à 36 px minimum**, supprimer les textes de 16 à 18 px ou les passer à 28 px ou plus.
- Raccourcir les notes à **8 mots maximum**. Le détail passe à l'oral.

**P5. Rythme.**

- Supprimer la pause figée de 2,5 s à la mi-temps, ou la transformer en **question au milieu de la vidéo** : « Un but avant la pause ? Réponds en commentaire. »
- À chaque changement de phase : coupe sèche, **zoom de 5 à 8 %** sur la tranche de courbe concernée, et flash de couleur (déjà présent).
- Allonger la phase de **pic** : c'est le moment fort, qu'il faut ralentir.

**P6. Payoff final de 4 à 5 s.** C'est la règle du pic et de la fin : on se souvient du moment fort et de la fin.

- Carte finale : lecture du modèle et **probabilité du modèle** (par exemple « 68 % selon le modèle »).
- Une phrase honnête du type « environ 1 fois sur 3, ce scénario ne se produit pas ».
- Horodatage « publié avant le coup d'envoi ».
- Un CTA unique, conformément à la loi de Hick.
- Garder l'alternance entre version « verdict donné » (réciprocité, puisque le pick gratuit du jour est déjà un cadeau) et version « verdict sur le site » (boucle ouverte), et **tester les deux**.

**P7. Branding de série.**

- Donner un nom de série court et répété, par exemple « LE POULS DU MATCH » ou « 90' EN 30'' ».
- Jingle visuel de 0,4 s **après** l'accroche, pas avant.
- Numérotation du type « J5 · Épisode 3 ».
- Même palette et même voix à chaque épisode.
- Même mot de fin, à la manière d'OptaJean (« Lecture terminée. »).
- Une couverture de grille de profil homogène (titre du match et chiffre-clé).

**P8. Zones de sécurité.**

- Déplacer « IASHARK.COM » en haut, sous le titre, ou au centre de la carte finale.
- Garder toutes les infos critiques entre y ≈ 250 et y ≈ 1 450 et à gauche de x ≈ 900.
- Fusionner les 3 jauges et la barre d'équilibre en **un seul indicateur**. Actuellement, 4 éléments se disputent l'attention sous la zone de la légende.

**P9. Honnêteté des données.** C'est le cœur de la différenciation contre des concurrents trompeurs.

- Remplacer l'ondulation sinusoïdale par **6 barres réelles** (tranches de 15 min), ou écrire « courbe lissée » en petit.
- Afficher la source : « sur les 20 derniers matchs de chaque équipe ».
- Généraliser l'approche de Lyon–Rennes (jauges branchées sur des comptes réels) plutôt que celle de Brentford (valeurs 1 à 5 éditoriales).

**P10. Déclinaisons par plateforme.**

| Plateforme | Déclinaison |
|---|---|
| TikTok | Version voix 9:16 de 30 à 45 s. Légende avec question et 3 à 5 hashtags (ligue et match). |
| Instagram Reels | Même vidéo, plus une **version carrousel en 4:5**, le format qui gagne en likes sur Instagram. Slide 1 : courbe et phrase-choc. Slides 2 à 7 : une tranche par slide, un chiffre par slide. Slide 8 : lecture du modèle et CTA « enregistre ». |
| YouTube Shorts | 50 à 60 s, titre cherchable (« [Club A] [Club B] : à quelle minute tombent les buts ? »). |
| X | Clip de 10 à 15 s (courbe qui se remplit) et **tweet au format Opta** (« 24 % – Part des buts de [club] entre la 30e et la 45e sur 20 matchs. [Mot de chute]. »). |
| Facebook Reels | Même vidéo que les Reels, question en légende. Tester aussi une version « les 5 affiches du soir » en liste, sur le modèle de Goat Pronos, mais **honnête** : probabilités, pas de faux scores. |

**P11. Conformité à l'écran.**

- Aucun logo de bookmaker, aucune cote, ni « mise » ni « pari sûr ».
- Mention discrète de prudence du type « Analyse statistique, pas un conseil de pari. 18+ ». **À VALIDER** avec un juriste.

**P12. Plan de test** sur 3 semaines, avec suivi dans viral-lab (`save_experiment` et `record_post_result`).

- Test A (accroche) : même corps de vidéo, 3 accroches : chiffre, question, verdict.
- Test B (durée) : 15 s contre 35 s.
- Test C (voix) : musique seule contre voix.
- Test D (payoff) : verdict donné contre verdict sur le site.
- KPI :
  - taux de maintien à 3 s et temps de visionnage moyen (dans les statistiques natives) ;
  - taux de sauvegarde, cible ≥ 1 % comme les comptes pronos ;
  - commentaires pour 1 000 vues ;
  - visites du profil puis clics sur le lien.

### 11.4 Découpage proposé pour la version « voix » de 35 s

Ce découpage est une proposition d'édition, pas un contenu produit.

| Temps | Plan | Texte à l'écran | Voix | Son |
|---|---|---|---|---|
| 0,0 à 1,5 s | Courbe complète et chiffre géant | Phrase-choc chiffrée du match | Même phrase, dite immédiatement | Musique qui démarre, coup sourd |
| 1,5 à 2,0 s | Jingle de série et logos en petit | Nom de série · J5 | — | « Whoosh » |
| 2 à 6 s | Rembobinage à 0', horloge qui repart | Tranche 0–15 et un chiffre | Une idée | Tic |
| 6 à 10 s | Tranche 15–30 | Un chiffre | Une idée | Tic |
| 10 à 16 s | **Pic** (tranche 30–45), zoom et flash | Le chiffre le plus fort | Ralentir, insister | Montée |
| 16 à 18 s | Question au milieu de la vidéo | « But avant la pause ? » | Question | Silence de 0,3 s |
| 18 à 28 s | Tranches 45–90 en accéléré (3 × 3 s) | Un chiffre par tranche | — | Tics |
| 28 à 33 s | Carte finale | Lecture du modèle, probabilité, phrase honnête | Verdict et nuance | Coup final |
| 33 à 35 s | CTA | « Ton score ? » et iashark.com | CTA unique | Sortie |

---

## 12. Opportunités pour IASHARK

- **Gardez le positionnement « modèle statistique », et mettez « IA » en second plan.** En France, « IA prono » est associé au spam, à l'affiliation et aux cartes automatiques à 0 like. À l'inverse, « l'outil prédictif d'Opta » et les expected points sont crédibles.
- **Séries candidates, construites sur les formats gagnants.** Pour chacune : format d'appui, puis mécanique psychologique.
  1. « Le Pouls du Match » : template amélioré, avant le match (format 4.2 ; barre de progression et boucle ouverte).
  2. « Toi contre le modèle » : les gens donnent leur score en commentaire avant le match, bilan le lendemain (comportement n° 1 des commentaires ; engagement et cohérence).
  3. « Le classement ment » : xPts contre classement réel, chaque lundi, en tweet et en carrousel (meilleur tweet d'OptaJean ; curiosité).
  4. « Les 5 affiches du soir » : liste honnête (format 4.1 ; Zeigarnik, sauvegarde).
  5. « Là où le modèle s'est trompé » : un raté expliqué chaque semaine (effet pratfall, confiance).
- **Pour chaque série, un format par plateforme :**
  - TikTok et Reels : vidéo avec voix.
  - Instagram : carrousel.
  - X : stat au format Opta et réaction dans les 15 minutes.
  - Facebook : Reels et la liste du soir.
  - YouTube Shorts : recyclage avec un titre cherchable.
- **La publication automatique à heures fixes ne suffit pas.** @footcentralclips et @footlabstatistiquesligue1 le montrent : l'algorithme de la niche récompense l'accroche et l'incarnation, pas la régularité seule.

---

## Sources web consultées

- [Kohen Avocats : tipsters et paris sportifs, ce que la DGCCRF et l'ANJ peuvent reprocher (juin 2026)](https://kohenavocats.fr/2026/06/14/tipsters-paris-sportifs-dgccrf-anj-influenceurs-sanctions/)
- [Assemblée nationale : question n° 11745, conseils payants en paris sportifs (tipsters)](https://questions.assemblee-nationale.fr/q17/17-11745QE.htm)
- [DGCCRF : vigilance face aux sites de conseils en paris sportifs](https://www.economie.gouv.fr/dgccrf/laction-de-la-dgccrf/les-enquetes-et-les-controles/coupe-du-monde-de-football-vigilance-face-aux-sites-de-conseils-en-paris-sportifs)
- [TikTok Community Guidelines : Regulated Goods and Commercial Activities](https://www.tiktok.com/community-guidelines/en/regulated-commercial-activities)
- [TikTok Ads : Gambling and Games policy](https://ads.tiktok.com/help/article/tiktok-ads-policy-gambling-and-games/)
- [iGBA : TikTok for affiliates](https://www.igbaffiliate.com/en/articles/seo/tiktok-for-affiliates-how-to-keep-your-content-safe-and-effective/)
- [OptaJean sur X](https://x.com/optajean) · [Oh My Goal France sur TikTok](https://www.tiktok.com/@ohmygoalfrance) · [Foot Mercato sur TikTok](https://www.tiktok.com/@footmercato)
- [Le Pro, chaîne YouTube](https://www.youtube.com/channel/UCVvFfV6vSJ1TMkoY3ZtPqSg) · [Jerem Pronos](https://www.youtube.com/@jerempronos) · [PRONOSTIC FOOT 98 %](https://www.youtube.com/channel/UCraPVLcSdY1-UiTiKzDy-TA)
